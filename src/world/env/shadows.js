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
  // Edge fade (playtest-fixes): near the border of a shadow map the shadow fades out smoothly instead of
  // ending in a hard line that jumps whenever the map re-centers (seen as a quick "glitch" while moving).
  const edgeFn = `
#ifdef USE_SHADOWMAP
float psShadowEdge( vec4 sc ) {
	vec2 q = abs( sc.xy / sc.w * 2.0 - 1.0 );
	return smoothstep( 0.82, 0.98, max( q.x, q.y ) );
}
#endif
`;
  if (!C.shadowmap_pars_fragment.includes('psShadowEdge')) C.shadowmap_pars_fragment += edgeFn;
  const fadedLine = line.replace(
    'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
    'mix( getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ), 1.0, psShadowEdge( vDirectionalShadowCoord[ i ] ) ) : 1.0;',
  );
  // r2-look near static cascade (light index 2, when present): replaces the far static map near the camera and blends
  // into it across the near map's edge band
  const nearLine = fadedLine.replace(
    'mix( getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ), 1.0, psShadowEdge( vDirectionalShadowCoord[ i ] ) ) : 1.0;',
    `psStaticShadow( directionalShadowMap[ i ], directionalLightShadow, vDirectionalShadowCoord[ i ] ) : 1.0;`);
  const nearFn = `
#ifdef USE_SHADOWMAP
#if NUM_DIR_LIGHT_SHADOWS > 2
float psStaticShadow( sampler2D farMap, DirectionalLightShadow farS, vec4 farC ) {
	float eN = psShadowEdge( vDirectionalShadowCoord[ 2 ] );
	vec4 nc = vDirectionalShadowCoord[ 2 ];
	bool inN = nc.w > 0.0 && all( lessThan( abs( nc.xy / nc.w * 2.0 - 1.0 ), vec2( 1.0 ) ) );
	float s = 1.0;
	if ( inN && eN < 0.999 ) s = getShadow( directionalShadowMap[ 2 ], directionalLightShadows[ 2 ].shadowMapSize, directionalLightShadows[ 2 ].shadowIntensity, directionalLightShadows[ 2 ].shadowBias, directionalLightShadows[ 2 ].shadowRadius, nc );
	if ( !inN || eN > 0.001 ) {
		float f = mix( getShadow( farMap, farS.shadowMapSize, farS.shadowIntensity, farS.shadowBias, farS.shadowRadius, farC ), 1.0, psShadowEdge( farC ) );
		s = inN ? mix( s, f, eN ) : f;
	}
	return s;
}
#endif
#endif
`;
  if (!C.shadowmap_pars_fragment.includes('psStaticShadow')) C.shadowmap_pars_fragment += nearFn;
  C.lights_fragment_begin = src.replace(line, `#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 2 )
		` + nearLine.replace(/\n\t\t#endif$/, '') + `
		#else
		` + fadedLine.replace(/\n\t\t#endif$/, '') + `
		#endif
		#endif` + `
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )
		directLight.color *= ( directLight.visible && receiveShadow ) ? mix( getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ), 1.0, psShadowEdge( vDirectionalShadowCoord[ 1 ] ) ) : 1.0;
		#endif`);
  // r2-look: shaded ambient. The sun's visibility at this fragment (cast shadow of the static, near and dynamic maps) is
  // kept in psSunVis; lights_fragment_end scales the sky / bounce / env light by mix(1 - uLookW.x, 1, psSunVis). A point in
  // a cast shadow (under a deck, a tree, a car, a roof overhang) is also hidden from much of the sky and of the sunlit
  // ground, so its ambient drops: deep, believable shade instead of the flat, evenly lit look. Open-sky faces turned away
  // from the sun are not in a cast shadow and keep their full sky light.
  {
    const s0 = C.lights_fragment_begin;
    const at = s0.indexOf('#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 2 )');
    const dynEnd = s0.indexOf('#endif', s0.indexOf('#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )'));
    if (at > 0 && dynEnd > at) {
      // psSunVis is a global (lights_pars_begin, which every lit material includes before main): a material that swaps
      // in its own lights_fragment_begin still compiles (it just keeps psSunVis = 1)
      if (!C.lights_pars_begin.includes('PS_SUNVIS')) C.lights_pars_begin = '#define PS_SUNVIS\nfloat psSunVis = 1.0;\n' + C.lights_pars_begin;
      C.lights_fragment_begin = s0.slice(0, at) + '#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 )\n\t\tvec3 psC0 = directLight.color;\n\t\t#endif\n\t\t'
        + s0.slice(at, dynEnd + 6) + '\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 0 ) && defined( PS_SUNVIS )\n\t\tpsSunVis = mix( 1.0, dot( directLight.color, vec3( 1.0 ) ) / max( dot( psC0, vec3( 1.0 ) ), 1e-6 ), smoothstep( 0.02, 0.2, dot( geometryNormal, directLight.direction ) ) ); // faces turned away from the sun: no cast-shadow term\n\t\t#endif' + s0.slice(dynEnd + 6);
      C.lights_fragment_end = `#if defined( PS_LOOKU ) && defined( PS_SUNVIS )
{
	float psAmb = mix( 1.0 - uLookW.x, 1.0, psSunVis );
	#if defined( RE_IndirectDiffuse )
	// ...and gains the light bounced off the sunlit ground and walls around it (uLookW.yzw, set per frame from the sun):
	// shade stays deep but readable and neutral instead of navy-black (r2-art review)
	irradiance = irradiance * psAmb + uLookW.yzw * ( 1.0 - psSunVis );
	#endif
	#if defined( RE_IndirectSpecular )
	iblIrradiance *= psAmb;
	radiance *= mix( 1.0, psAmb, 0.6 );
	#endif
}
#endif
` + C.lights_fragment_end;
    } else console.warn('[shadows] shaded-ambient patch: anchors not found');
  }
  void anchor;
  guardLightLoops();
  return true;
}

// Stage 1 perf: three.js shades every point / spot / directional light for every fragment, even a light whose color is
// zero. The light budget (src/render/perfGuards.v2.js) always keeps 16 point + 4 spot lights in every shader (most are
// zero-intensity spares or lamps that are off by day), and the dynamic-shadow twin of the sun has zero intensity but
// still sampled its whole PCF shadow map. Each light's work (shadow lookups + BRDF) now runs only when its color at this
// fragment is non-zero (also skips point/spot lights beyond their range or outside their cone). A zero-color light adds
// exactly nothing, so the picture is unchanged. ?nolightguard turns this off (A/B tests).
export function guardLightLoops() {
  if (typeof location !== 'undefined' && /[?&]nolightguard\b/.test(location.search)) return false;
  const C = THREE.ShaderChunk;
  let s = C.lights_fragment_begin;
  const RE = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const IF = '\n\t\tif ( any( notEqual( directLight.color, vec3( 0.0 ) ) ) ) {\n';
  let ok = 0;
  for (const [sec, info] of [
    ['#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', 'getPointLightInfo( pointLight, geometryPosition, directLight );'],
    ['#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )', 'getSpotLightInfo( spotLight, geometryPosition, directLight );'],
    ['#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', 'getDirectionalLightInfo( directionalLight, directLight );'],
  ]) {
    const a = s.indexOf(sec); if (a < 0) continue;
    const end = s.indexOf('#pragma unroll_loop_end', a); if (end < 0) continue;
    const body = s.slice(a, end);
    const i1 = body.indexOf(info), i2 = body.lastIndexOf(RE);
    if (i1 < 0 || i2 < i1) continue;
    const nb = body.slice(0, i1 + info.length) + IF + body.slice(i1 + info.length, i2 + RE.length) + '\n\t\t}\n' + body.slice(i2 + RE.length);
    s = s.slice(0, a) + nb + s.slice(end);
    ok++;
  }
  if (ok !== 3) { console.warn('[shadows] light-loop guard: only', ok, 'of 3 loops patched'); }
  guardLightLoops.unguarded = C.lights_fragment_begin; guardLightLoops.guarded = s; guardLightLoops.chunks = C; // A/B tests (tools/v2/s1-perf.mjs)
  C.lights_fragment_begin = s;
  return ok;
}

export function createSplitShadows(game, sun, dyn, near = null) {
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
  if (near) near.userData.casterMask = 1 << LAYER_STATIC; // r2-look near static cascade: same casters as the city map

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
      // Dynamic map rate. r2-look (Nov 17): at half rate every second frame showed a map drawn one frame earlier, so a
      // moving car's shadow jumped back by one frame of travel (0.4 m at 90 km/h) on alternate frames: the user saw the
      // convertible's shadow change length every other frame, and TAA turned the two positions into a dotted smear.
      // Now ('auto', the default) the map redraws every frame whenever a car within its area moves faster than walking
      // pace or the player moves fast; only a scene of walkers keeps the half rate (2 cm of lag, invisible; measured cost of
      // the full rate at the Keys spawn: +0.7 ms CPU, GPU inside the noise). game.dynShadowHalfRate: true = always half
      // (old behavior), false = always full.
      const hr = game.dynShadowHalfRate ?? (game.lookR2 === false ? true : 'auto'); // game.lookR2 = false: the overnight half rate (A/B)
      let half = hr === true;
      if (hr === 'auto') {
        this._ft = (this._ft || 0) - dt;
        if (this._ft <= 0) {
          this._ft = 0.25;
          const f = game.player?.position, R = (dyn.shadow.camera.right || 42) + 12;
          let fast = false;
          const pv = game.player?.state?.vehicle;
          if (pv && Math.abs(pv.speed || 0) > 0.8) fast = true;
          if (!fast && f) for (const v of game.vehicles?.list || []) {
            if (!v?.mesh || Math.abs(v.speed || 0) < 1.2) continue;
            const p = v.mesh.position; if (Math.abs(p.x - f.x) < R && Math.abs(p.z - f.z) < R) { fast = true; break; }
          }
          if (!fast && f && this._pp) fast = Math.hypot(f.x - this._pp.x, f.z - this._pp.z) > 4.5 * 0.25; // player sprinting / ragdoll flight
          if (f) (this._pp || (this._pp = { x: 0, z: 0 })).x = f.x, this._pp.z = f.z;
          this._fast = fast;
        }
        half = !this._fast;
      }
      if (half) { dyn.shadow.autoUpdate = false; dyn.shadow.needsUpdate = ((this._f = (this._f || 0) + 1) & 1) === 0; }
      else { dyn.shadow.autoUpdate = true; this._f = 0; }
      this.dynHalf = half;
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
