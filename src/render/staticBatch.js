// Stage 1 performance: static batching. Merges the plain static meshes of a group into one mesh per material
// (draw calls are the main CPU cost of a frame in this game: ~12 us each on an M3 Max, far more on ordinary laptops).
// Only meshes that are safe to merge are touched:
//   - Mesh (not Instanced/Skinned/Points/Line/Sprite), visible, with a material that is not an array;
//   - no userData.noBatch on it or any ancestor below the root; not in opts.skip(mesh);
//   - by default only meshes directly under the root or under plain sub-Groups whose own transform never changes
//     (pass opts.deep = true to walk the whole tree; movers such as door pivots must then be marked noBatch).
// Meshes are grouped by material + shadow flags + renderOrder + attribute layout, baked into the root's space, merged
// and the originals removed. Returns { before, after } draw-call counts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function attrKey(g) { return Object.keys(g.attributes).sort().map((k) => k + g.attributes[k].itemSize + (g.attributes[k].normalized ? 'n' : '')).join(',') + (g.index ? 'I' : 'N') + (g.morphAttributes && Object.keys(g.morphAttributes).length ? 'M' : ''); }

export function staticBatch(root, opts = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  const visit = (o, depth) => {
    if (o.userData.noBatch) return;
    for (const c of [...o.children]) {
      if (c.userData.noBatch || c.visible === false) continue;
      if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !Array.isArray(c.material) && c.geometry?.attributes?.position && !(opts.skip && opts.skip(c)) && !c.onBeforeRender?.__custom && c.children.length === 0) {
        const g = c.geometry;
        if (g.groups && g.groups.length > 1) continue;
        const key = [c.material.uuid, c.castShadow ? 1 : 0, c.receiveShadow ? 1 : 0, c.renderOrder, attrKey(g), c.matrixWorld.determinant() < 0 ? 'neg' : 'pos'].join('|');
        let b = buckets.get(key); if (!b) { b = { mat: c.material, cast: c.castShadow, recv: c.receiveShadow, ro: c.renderOrder, items: [] }; buckets.set(key, b); }
        b.items.push(c);
      } else if ((opts.deep || c.isGroup || c.type === 'Object3D') && !c.isMesh) visit(c, depth + 1);
    }
  };
  visit(root, 0);
  let before = 0, after = 0;
  const m = new THREE.Matrix4();
  for (const b of buckets.values()) {
    before += b.items.length;
    if (b.items.length < 2) { after += b.items.length; continue; }
    const geos = [];
    for (const c of b.items) {
      const g = c.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'uv1', 'uv2', 'color', 'tangent'].includes(k)) g.deleteAttribute(k);
      m.multiplyMatrices(inv, c.matrixWorld);
      g.applyMatrix4(m);
      g.morphAttributes = {};
      geos.push(g);
    }
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
    for (const g of geos) g.dispose();
    if (!merged) { after += b.items.length; continue; }
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.ro;
    mesh.name = 'batch:' + (b.mat.name || 'mat'); mesh.userData.batched = b.items.length;
    root.add(mesh);
    after += 1;
    for (const c of b.items) victims.push(c);
  }
  for (const c of victims) { c.parent?.remove(c); }
  // drop now-empty plain groups
  const prune = (o) => { for (const c of [...o.children]) { prune(c); if ((c.isGroup || c.type === 'Object3D') && c.children.length === 0 && !c.userData.keep) o.remove(c); } };
  if (opts.prune !== false) prune(root);
  return { before, after };
}
