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
  if (!S.on) return;
  const owner = new WeakMap();         // geometry -> first InstancedMesh seen with it
  const orig = new WeakMap();          // mesh -> original shared geometry (for the A/B switch)
  const viewed = new Set();
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
    g.addEventListener('dispose', () => v.dispose());
    return v;
  }
  function reg(o) {
    if (!o || !o.isInstancedMesh || orig.has(o)) return;
    const g = o.geometry; if (!g || !g.isBufferGeometry) return;
    const first = owner.get(g);
    if (!first) { owner.set(g, o); return; }
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
  game.updaters.push(function instVaoTick() {
    if (S.on === state) return;
    state = S.on;
    for (const o of viewed) { const g = orig.get(o); if (!g) continue; if (!state) { o.userData.__vaoView = o.geometry; o.geometry = g; } else if (o.userData.__vaoView) o.geometry = o.userData.__vaoView; }
  });
}
