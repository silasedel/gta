import * as THREE from 'three';

// Split sun shadows for a large streamed city:
//  - STATIC map (city geometry only, layer 6): large area, 4096, re-rendered only when the focus moves
//    to a new 24 m cell, the sun moves noticeably, or new static geometry streams in.
//  - DYNAMIC map (everything else that casts: player, peds, cars, props; layer 7): small area around
//    the player, re-rendered every frame. Its light has zero intensity; the patched shader multiplies
//    its shadow into the sun (directional light 0), so there is still only one sun contribution.
// Objects are tagged automatically: descendants of game.city.root -> static, other casters -> dynamic.

export const LAYER_STATIC = 6;
export const LAYER_DYNAMIC = 7;

let patched = false;
export function patchShadowChunks() {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk;
  const anchor = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\n\t}\n\t#pragma unroll_loop_end\n\n#endif\n\n#if ( NUM_SPOT_LIGHTS > 0 )';
  const src = C.lights_fragment_begin;
  // find the directional-light shadow line and add the dynamic map (index 1) to light 0
  const line = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\t#endif';
  if (!src.includes(line)) { console.warn('[shadows] directional shadow line not found; split shadows disabled'); return false; }
  C.lights_fragment_begin = src.replace(line, line + `
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ) : 1.0;
		#endif`);
  void anchor;
  return true;
}

export function createSplitShadows(game, sun, dyn) {
  const { renderer, scene } = game;
  const sm = renderer.shadowMap;
  const origRender = sm.render.bind(sm);
  // render each shadow-casting light with its own caster layer
  sm.render = (lights, sc, camera) => {
    if (!lights || lights.length < 2 || !camera?.layers) return origRender(lights, sc, camera);
    if (sm.enabled === false || (sm.autoUpdate === false && sm.needsUpdate === false)) return;
    const mask = camera.layers.mask, nu = sm.needsUpdate;
    try {
      for (const l of lights) {
        const lm = l.userData?.casterMask;
        camera.layers.mask = lm ?? mask;
        sm.needsUpdate = nu; // per-light shadow.autoUpdate / needsUpdate still decide inside
        origRender([l], sc, camera);
      }
    } finally { camera.layers.mask = mask; sm.needsUpdate = false; }
  };
  sun.userData.casterMask = 1 << LAYER_STATIC;
  dyn.userData.casterMask = 1 << LAYER_DYNAMIC;

  // tagging: top-level scene children are classified once (re-checked when new ones appear);
  // dynamic = vehicles, peds/player (anything containing a SkinnedMesh); everything else is static.
  let tagT = 0, staticDirty = true;
  const topSeen = new WeakMap(); // child -> 'static' | 'dynamic'
  const meshSeen = new WeakSet();
  function dynamicRoots() {
    const set = new Set();
    for (const v of game.vehicles?.list || []) if (v?.mesh) set.add(v.mesh);
    for (const p of game.peds?.list || []) { const r = p?.char?.root || p?.root; if (r) set.add(r); }
    return set;
  }
  function classify(c, dyn) {
    if (dyn.has(c)) return 'dynamic';
    let skinned = false;
    c.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
    return skinned ? 'dynamic' : 'static';
  }
  function tagTree(c, kind) {
    let added = false;
    c.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) || meshSeen.has(o)) return;
      meshSeen.add(o); added = true;
      o.layers.enable(kind === 'dynamic' ? LAYER_DYNAMIC : LAYER_STATIC);
    });
    return added;
  }
  // incremental: discover new top-level children / city tiles once a second, then tag their subtrees
  // from a queue under a per-frame time budget (no full-scene traversals, no spikes)
  const queue = [], queued = new WeakSet();
  function discover() {
    const dyn = dynamicRoots();
    const cityRoot = game.city?.root || null;
    for (const c of scene.children) {
      let kind = topSeen.get(c);
      if (c === cityRoot) {
        if (kind !== 'static') topSeen.set(c, 'static');
        for (const t of c.children) if (!queued.has(t)) { queued.add(t); queue.push([t, 'static']); }
        continue;
      }
      if (!kind || (kind === 'static' && dyn.has(c))) {
        const prev = kind;
        kind = classify(c, dyn); topSeen.set(c, kind);
        if (kind === 'dynamic' && prev === 'static') { c.traverse((o) => { o.layers.disable(LAYER_STATIC); o.layers.enable(LAYER_DYNAMIC); }); staticDirty = true; }
      }
      if (kind === 'dynamic') queue.push([c, 'dynamic']); // cheap re-check (attachments)
      else if (!queued.has(c)) { queued.add(c); queue.push([c, kind]); }
    }
  }
  function drain(budgetMs) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) {
      const [c, kind] = queue.shift();
      if (tagTree(c, kind) && kind === 'static') staticDirty = true;
    }
  }

  return {
    debug: () => ({ tagT, queue: queue.length, staticDirty }),
    tagNow: () => { discover(); drain(1e9); },
    markStaticDirty() { staticDirty = true; },
    update(dt) {
      tagT -= dt;
      try {
        if (tagT <= 0) { tagT = 1; discover(); }
        drain(1.0);
      } catch (e) { console.warn('[shadows] tag', e); }
      const d = staticDirty; staticDirty = false;
      return d;
    },
  };
}
