// r2-perf: one vertex-array state per InstancedMesh. three.js caches a VAO per (geometry, program) and includes the
// mesh's instanceMatrix in that cache; when several InstancedMeshes share one geometry (the same plant / prop model in
// different pools, slots and LOD bands), every draw finds the cached state of the previous mesh and rebuilds it
// (vertexAttribPointer for every attribute: about 3,000 calls a frame at the spawn). Each InstancedMesh that shares its
// geometry with an earlier one gets a light geometry view: the SAME attribute objects (same GPU buffers, no copy), its
// own id (its own VAO). Pixel-identical. game.instVao.on = false restores the shared geometries (A/B); ?instvao=0 = off.
import * as THREE from 'three';

export const order = 10;

export async function initV2(game) {
  const qs = new URLSearchParams(location.search);
  const S = game.instVao = { on: qs.get('instvao') !== '0', views: 0 };
  const LEAKFIX = qs.get('leakfix') !== '0';
  if (!S.on) return;
  const owner = new WeakMap();         // geometry -> first InstancedMesh seen with it
  const orig = new WeakMap();          // mesh -> original shared geometry (for the A/B switch)
  const viewed = new Set();
  const srcOf = new WeakMap();         // view -> [source geometry, its dispose listener]
  function view(g) {
    const v = new THREE.BufferGeometry();
    for (const k in g.attributes) v.setAttribute(k, g.attributes[k]);
    for (const k in g.morphAttributes) v.morphAttributes[k] = g.morphAttributes[k];
    v.morphTargetsRelative = g.morphTargetsRelative;
    if (g.index) v.setIndex(g.index);
    for (const gr of g.groups) v.addGroup(gr.start, gr.count, gr.materialIndex);
    v.drawRange.start = g.drawRange.start; v.drawRange.count = g.drawRange.count;
    v.boundingBox = g.boundingBox; v.boundingSphere = g.boundingSphere;
    v.userData = g.userData; v.name = g.name;
    // the view goes away with its source (GPU buffers belong to the shared attributes; only the VAO is the view's own)
    const onSrc = () => { srcOf.delete(v); v.dispose(); };
    g.addEventListener('dispose', onSrc); srcOf.set(v, [g, onSrc]);
    return v;
  }
  // r3-perf: free only the view's own state (its VAOs and three.js's per-geometry record). A plain dispose() made three.js
  // also delete the SHARED attribute buffers that live meshes still draw with.
  function release(v) {
    const src = srcOf.get(v); if (src) { src[0].removeEventListener('dispose', src[1]); srcOf.delete(v); }
    v.attributes = {}; v.index = null; v.morphAttributes = {};
    v.dispose();
  }
  function reg(o) {
    if (!o || !o.isInstancedMesh || orig.has(o)) return;
    const g = o.geometry; if (!g || !g.isBufferGeometry) return;
    // r3-perf: the owner is held weakly. A strong value in this WeakMap kept the first InstancedMesh of every shared
    // geometry (model / prop / mask disc geometries live forever) alive for good, and with it everything it referenced:
    // a streamed tile's whole group (all its geometry) through the ground mask's mulch discs, old library-building cells.
    const fr = owner.get(g), first = LEAKFIX ? (fr && fr.deref ? fr.deref() : fr) : fr;
    if (!first) { owner.set(g, LEAKFIX ? new WeakRef(o) : o); return; }
    if (first === o) return;
    try { const v = view(g); orig.set(o, g); o.geometry = v; viewed.add(o); S.views++; } catch (e) { /* keep shared */ }
  }
  try { game.scene.traverse(reg); } catch (e) { /* */ }
  const add0 = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...objs) {
    const r = add0.apply(this, objs);
    if (S.on) for (const o of objs) { if (!o || !o.isObject3D) continue; if (o.isInstancedMesh) reg(o); else if (o.children.length) o.traverse(reg); }
    return r;
  };
  // A/B switch: put the shared geometries back / take the views again
  let state = true;
  // r3-perf (leak, ?leakfix=0 rolls back): every viewed mesh stayed in 'viewed' forever, and each view stayed alive through
  // the dispose listener on its shared source geometry (model / prop geometries are never disposed). Every streamed tile
  // added views that were never freed: three.js kept their records and VAOs (live VAOs grew without bound while driving).
  // Every 2 s, a viewed mesh that is no longer in the scene gets its shared geometry back and the view is released; if the
  // mesh is added again, it gets a fresh view.
  let pruneT = 0;
  const inScene = (o) => { for (let n = o; n; n = n.parent) if (n === game.scene) return true; return false; };
  S.pruned = 0;
  game.updaters.push(function instVaoTick(dt) {
    if (LEAKFIX && (pruneT += dt || 0) > 2) {
      pruneT = 0;
      try { for (const o of viewed) { if (inScene(o)) continue; viewed.delete(o); const g = orig.get(o); orig.delete(o); if (g && o.geometry !== g && srcOf.has(o.geometry)) { const v = o.geometry; o.geometry = g; release(v); S.pruned++; } } } catch (e) { /* never break the frame */ }
    }
    if (S.on === state) return;
    state = S.on;
    for (const o of viewed) { const g = orig.get(o); if (!g) continue; if (!state) { o.userData.__vaoView = o.geometry; o.geometry = g; } else if (o.userData.__vaoView) o.geometry = o.userData.__vaoView; }
  });
}
