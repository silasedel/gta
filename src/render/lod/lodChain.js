// r2-perf: runtime side of the offline LOD chains (tools/v2/perf/lodgen.mjs writes <model>.lod.bin next to the GLB).
// A level is a new index buffer over the SAME decoded vertices, so it shares every attribute (positions, normals, UVs,
// skin weights) with LOD0: no extra vertex memory, identical materials, identical shading at the seams.
// Before use, each primitive's decoded positions are hashed the same way as the tool did; a mismatch (re-exported GLB,
// different decoder) drops that primitive's levels, never shows a wrong mesh.
// Switching: a level's geometric error (model units) projects to err * scale / distance * pxPerRad pixels; it is used
// while that stays under errPx (1 px by default) times the LOD bias (src/render/lodBias.v2.js), so the change is below
// what the eye can see at the distance it happens.
//   const chain = await loadLodChain(url, gltf)           // url of the .glb; returns null when no sidecar / no match
//   chain.levelsFor(mesh) -> [{ geometry, err }...]        // level 0 = the mesh's own geometry
//   switchDistance(err, scale, { errPx, pxPerRad })        // metres at which a level becomes invisible-to-switch
//   makeScreenLod(mesh, chain, opts) -> THREE.LOD           // a drop-in LOD for a static mesh
import * as THREE from 'three';

export function posHash(arr, count) {
  let h = 2166136261 >>> 0;
  const step = Math.max(1, Math.floor(count / 512));
  for (let i = 0; i < count; i += step) for (let c = 0; c < 3; c++) { h ^= Math.round(arr[i * 3 + c] * 1000) & 0xffffffff; h = Math.imul(h, 16777619) >>> 0; }
  h ^= count; h = Math.imul(h, 16777619) >>> 0;
  return h >>> 0;
}

const cache = new Map();
async function fetchSidecar(url) {
  const side = url.replace(/\.glb(\?.*)?$/i, '.lod.bin');
  if (cache.has(side)) return cache.get(side);
  const p = fetch(side).then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => {
    if (!buf || buf.byteLength < 8) return null;
    const dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'SLOD') return null;
    const jl = dv.getUint32(4, true);
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
    return { meta, bin: buf.slice(8 + jl) };
  }).catch(() => null);
  cache.set(side, p);
  return p;
}

// gltf: the GLTFLoader result. The parser's associations map each mesh primitive back to (mesh index, primitive index).
export async function loadLodChain(url, gltf) {
  const sc = await fetchSidecar(url);
  if (!sc) return null;
  const byKey = new Map();
  for (const p of sc.meta.prims) byKey.set(p.m + ':' + p.p, p);
  const levels = new WeakMap();
  let matched = 0, rejected = 0;
  const assoc = gltf?.parser?.associations;
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry || levels.has(o.geometry)) return;
    const a = assoc?.get(o) || assoc?.get(o.geometry);
    if (!a || a.meshes === undefined) return;
    const prim = byKey.get(a.meshes + ':' + (a.primitives ?? 0));
    if (!prim || !prim.levels.length) return;
    const pos = o.geometry.attributes.position;
    if (!pos || pos.count !== prim.nv || posHash(pos.array, pos.count) !== prim.h) { rejected++; return; }
    const list = [{ geometry: o.geometry, err: 0 }];
    for (const l of prim.levels) {
      const arr = l.w === 2 ? new Uint16Array(sc.bin, l.o, l.n) : new Uint32Array(sc.bin, l.o, l.n);
      const g = new THREE.BufferGeometry();
      for (const k in o.geometry.attributes) g.setAttribute(k, o.geometry.attributes[k]);
      g.morphAttributes = o.geometry.morphAttributes;
      g.setIndex(new THREE.BufferAttribute(arr, 1));
      g.boundingBox = o.geometry.boundingBox; g.boundingSphere = o.geometry.boundingSphere;
      if (!g.boundingSphere) g.computeBoundingSphere();
      g.userData.lodOf = o.geometry.uuid;
      list.push({ geometry: g, err: l.err, tris: l.tris });
    }
    levels.set(o.geometry, list);
    matched++;
  });
  return { levelsFor: (mesh) => levels.get(mesh.geometry) || null, matched, rejected, meta: sc.meta };
}

// distance (m) beyond which a level with geometric error err (model units) x world scale stays under errPx pixels
export function switchDistance(err, scale = 1, { errPx = 1, pxPerRad = 1000, bias = 1 } = {}) {
  return (err * scale * pxPerRad) / Math.max(0.1, errPx * bias);
}

export function makeScreenLod(mesh, chain, { errPx = 1, pxPerRad = 1000, hysteresis = 0.1 } = {}) {
  const lv = chain?.levelsFor(mesh);
  if (!lv || lv.length < 2) return null;
  const s = mesh.getWorldScale(new THREE.Vector3());
  const scale = Math.max(s.x, s.y, s.z);
  const lod = new THREE.LOD();
  lod.name = (mesh.name || 'mesh') + ':lod';
  lv.forEach((l, i) => {
    const m = i === 0 ? mesh : new THREE.Mesh(l.geometry, mesh.material);
    if (i > 0) { m.castShadow = mesh.castShadow; m.receiveShadow = mesh.receiveShadow; m.name = mesh.name + ':L' + i; }
    lod.addLevel(m, i === 0 ? 0 : switchDistance(l.err, scale, { errPx, pxPerRad }), hysteresis);
  });
  return lod;
}
