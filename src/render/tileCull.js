// r2-perf: hierarchical view culling for the streamed city. three.js visits every object of the scene for the main view
// (projectObject: 1.5-2.5 ms at 9-11 k objects), even the ones inside a whole tile that is behind the camera. Here every
// direct child of city.root (a tile, a chunk, a prop pool) gets a cached world bounding box; children whose box is
// outside the main camera's frustum are hidden for the main view only:
//   - hidden in scene.onBeforeRender (runs before three.js projects the scene), for the game camera only
//   - shown again around the shadow-map render (the static sun map must see every caster, also behind the camera)
//   - shown again in scene.onAfterRender, so nothing else ever sees them hidden
// Boxes are refreshed when a child's object count changes and every few seconds (round-robin). Pixel-identical by
// construction: a hidden subtree is entirely outside the frustum, so three.js would have culled each of its meshes.
// OFF by default: ?tilecull=1 or game.tileCull.on = true. Stats: game.tileCull.stats { tested, hidden, objectsSkipped }.
import * as THREE from 'three';

export const order = 9;

export async function initV2(game) {
  const qs = new URLSearchParams(location.search);
  const C = game.tileCull = { on: qs.get('tilecull') === '1', margin: 4, stats: { tested: 0, hidden: 0, objectsSkipped: 0, boxMs: 0 } };
  const scene = game.scene, cam = game.camera;
  const info = new WeakMap(); // child -> { box, n, t, objects }
  const fr = new THREE.Frustum(), m = new THREE.Matrix4(), tmp = new THREE.Box3();
  const hidden = [];
  let clock = 0, rr = 0;

  function countObjects(o) { let n = 0; o.traverse(() => { n++; }); return n; }
  function refresh(c, I) {
    const t0 = performance.now();
    I.box.makeEmpty();
    // precise = false: geometry bounding boxes (instanced meshes use their instance bounds)
    try { I.box.setFromObject(c, false); } catch (e) { I.box.makeEmpty(); }
    if (!I.box.isEmpty()) I.box.expandByScalar(C.margin);
    I.objects = countObjects(c); I.n = c.children.length; I.t = clock;
    C.stats.boxMs += performance.now() - t0;
  }
  function hide(camera) {
    const root = game.city?.root;
    if (!C.on || !root || camera !== game.camera || !root.visible) return;
    m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    fr.setFromProjectionMatrix(m);
    const kids = root.children;
    C.stats.tested = kids.length; C.stats.hidden = 0; C.stats.objectsSkipped = 0;
    // one stale box refreshed per frame (round-robin), plus any whose child count changed
    if (kids.length) { rr = (rr + 1) % kids.length; const c = kids[rr], I = info.get(c); if (I && clock - I.t > 3) refresh(c, I); }
    for (const c of kids) {
      if (!c.visible) continue;
      let I = info.get(c);
      if (!I) { I = { box: new THREE.Box3(), n: -1, t: -1, objects: 0 }; info.set(c, I); }
      if (I.n !== c.children.length) refresh(c, I);
      if (I.box.isEmpty()) continue;
      tmp.copy(I.box);
      if (!fr.intersectsBox(tmp)) { c.visible = false; hidden.push(c); C.stats.hidden++; C.stats.objectsSkipped += I.objects; }
    }
  }
  function show() { for (const c of hidden) c.visible = true; }
  function restore() { show(); hidden.length = 0; }

  // scene hooks (chained with whatever is there)
  const prevB = scene.onBeforeRender, prevA = scene.onAfterRender;
  // hide AFTER the earlier hooks (city.js cullPools, perfGuards lights) so their visibility decisions come first
  scene.onBeforeRender = function (r, sc, camera, ...rest) {
    if (prevB) prevB.call(this, r, sc, camera, ...rest);
    restore(); // a render that threw last frame never reached onAfterRender
    try { hide(camera); } catch (e) { restore(); }
  };
  scene.onAfterRender = function (r, sc, camera, ...rest) {
    restore();
    if (prevA) prevA.call(this, r, sc, camera, ...rest);
  };
  // the shadow pass must see every caster: show for its duration, hide again after
  const sm = game.renderer.shadowMap, smr = sm.render;
  sm.render = function (...args) {
    if (!hidden.length) return smr.apply(this, args);
    show();
    try { return smr.apply(this, args); } finally { for (const c of hidden) c.visible = false; }
  };
  game.updaters.push(function tileCullTick(dt) { clock += dt; });
  void cam;
}
