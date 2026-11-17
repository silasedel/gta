// Library plants (Models/Trees, Models/Plants) as instanced vegetation: each model is converted offline (Blender: meters, base at the
// origin, decimated to a near mesh + a mid mesh, textures within budget; see tools/v2/veg-models/convert.py) into
// public/assets/models/vegetation/<file>.glb and <file>_lod1.glb. At load every model becomes a list of parts (one per material:
// trunk / crownshaft bark, frond / leaf), each with the shared vegetation shader (wind, per-instance tint and wear, LOD dither),
// plus a multi-view impostor baked from the near mesh.
//   loadVegModels(renderer, keys?) -> { [key]: model }       model: { key, def, height, radius, lods: [parts0, parts1], imp, mats(band) }
//   model.materials(fade0, fade1, fadeImp) -> { near: [{ geo, mat, depth }], mid: [...], imp: { geo, mat, depth } | null }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeVegMaterial } from './materials.js';
import { bakeImpostor } from './field.js';

const BASE = '/assets/models/vegetation/';
// bark: material names drawn with the bark family (opaque, front side); everything else is foliage (two-sided leaf family)
export const VEG_MODELS = {
  royal: { file: 'royal_palm', bark: /trunk|crownshaft/i, palm: true, crownFrom: 0.62, source: 'Models/Trees/Palm Tree 7 - Tall Royal Palm' },
  coconut: { file: 'coconut_palm', bark: /trunk/i, palm: true, crownFrom: 0.8, source: 'Models/Trees/Palm Tree 2 - Tall Slim Coconut Palm' },
  banyan: { file: 'banyan', bark: /bark|cap/i, source: 'Models/Trees/Banyan Tree 2 - Large Banyan With Hanging Roots' },
  fern: { file: 'fern_clump', bark: /^$/, source: 'Models/Plants/Shrub 5 - Low-Poly Fern Clump' },
};

const _cache = new Map();
const _loader = new GLTFLoader();

// one merged geometry per material, with the attributes the vegetation shader expects (aWind, color)
function partsOf(scene, def) {
  scene.updateMatrixWorld(true);
  const byMat = new Map();
  scene.traverse((o) => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g0 = o.geometry.clone(); g0.applyMatrix4(o.matrixWorld);
    if (mats.length === 1) { (byMat.get(mats[0]) || byMat.set(mats[0], []).get(mats[0])).push(g0); return; }
    for (const gr of g0.groups) { const m = mats[gr.materialIndex]; const sub = g0.index ? new THREE.BufferGeometry() : null; if (!sub) continue;
      for (const k of Object.keys(g0.attributes)) sub.setAttribute(k, g0.attributes[k]); sub.setIndex(Array.from(g0.index.array.slice(gr.start, gr.start + gr.count)));
      (byMat.get(m) || byMat.set(m, []).get(m)).push(sub); } });
  const out = [];
  let yTop = 0; for (const [, gs] of byMat) for (const g of gs) { g.computeBoundingBox(); yTop = Math.max(yTop, g.boundingBox.max.y); }
  const yCrown = yTop * (def.crownFrom ?? 0.7);
  let rMax = 0.5; for (const [, gs] of byMat) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) rMax = Math.max(rMax, Math.hypot(P.getX(i), P.getZ(i))); }
  for (const [m, gs] of byMat) {
    const keep = gs.map((g) => { const n = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (g.attributes[k]) n.setAttribute(k, g.attributes[k]); if (g.index) n.setIndex(g.index); return n.index ? n : n; });
    let g = keep.length > 1 ? mergeGeometries(keep, false) : keep[0]; if (!g) continue;
    if (!g.index) { const I = []; for (let i = 0; i < g.attributes.position.count; i++) I.push(i); g.setIndex(I); }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const bark = def.bark.test(m.name || ''), P = g.attributes.position, n = P.count, W = new Float32Array(n * 3), C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z), ph = Math.atan2(z, x);
      if (bark) { W[i * 3] = y; W[i * 3 + 1] = 0; W[i * 3 + 2] = 0; C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 1; continue; }
      // foliage: the crown sways as one piece from its attachment height (no rubbery fronds), tips flutter; crown self-shadow inside
      const t = Math.min(1, r / (rMax * 0.85));
      W[i * 3] = def.palm ? Math.max(yCrown, Math.min(y, yTop)) : y; W[i * 3 + 1] = Math.pow(t, 1.3); W[i * 3 + 2] = ph * 3;
      const sh = 0.62 + 0.38 * Math.min(1, t * 1.6); C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = sh;
    }
    g.setAttribute('aWind', new THREE.BufferAttribute(W, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    const map = m.map || null; if (map) { map.anisotropy = 8; map.colorSpace = THREE.SRGBColorSpace; }
    out.push({ name: m.name, fam: bark ? 'bark' : 'leaf', geometry: g, map, normalMap: m.normalMap || null, tris: g.index.count / 3 });
  }
  out.sort((a, b) => (a.fam === b.fam ? 0 : a.fam === 'bark' ? -1 : 1));
  return { parts: out, height: yTop, radius: rMax };
}

async function loadOne(renderer, key) {
  const def = VEG_MODELS[key]; if (!def) throw new Error('unknown vegetation model ' + key);
  const [g0, g1] = await Promise.all([_loader.loadAsync(BASE + def.file + '.glb'), _loader.loadAsync(BASE + def.file + '_lod1.glb').catch(() => null)]);
  const L0 = partsOf(g0.scene, def), L1 = g1 ? partsOf(g1.scene, def) : L0;
  // L1 reuses the near textures (same uv layout, decimated geometry)
  for (const p of L1.parts) { const q = L0.parts.find((x) => x.name === p.name); if (q) { p.map = q.map; p.normalMap = q.normalMap; } }
  const vm = (fam, p, o) => makeVegMaterial(fam, { map: p.map, normalMap: p.normalMap, normalScale: [1, -1], roughness: fam === 'bark' ? 0.9 : 0.75, ...o }); // glTF normal maps: green flipped without tangents
  let imp = null;
  try {
    const bakeParts = L0.parts.map((p) => ({ geometry: p.geometry, material: vm(p.fam, p, { lean: 0, sway: 0, tint: 0, wear: 0, transl: 0 }).mat }));
    imp = bakeImpostor(renderer, 'model_' + key, 1, { parts: bakeParts }, null, null, 256, 8);
  } catch (e) { console.warn('[vegetation] model impostor bake failed', key, e); }
  const model = {
    key, def, height: L0.height, radius: L0.radius, lods: [L0.parts, L1.parts], imp,
    tris: [L0.parts.reduce((a, p) => a + p.tris, 0), L1.parts.reduce((a, p) => a + p.tris, 0)],
    // materials for one set of LOD bands (fade vec4 per band); shared shader programs with the procedural plants
    materials(f0, f1, fi, o = {}) {
      const mk = (parts, f) => parts.map((p) => { const m = vm(p.fam, p, { fade: f, lean: 0.006, sway: 0.0035, wear: p.fam === 'leaf' ? 0.45 : 0.3, ...o }); return { geo: p.geometry, mat: m.mat, depth: m.depth, fam: p.fam }; });
      const out = { near: mk(L0.parts, f0), mid: f1 ? mk(L1.parts, f1) : [], imp: null };
      if (imp && fi) { const m = makeVegMaterial('imp', { map: imp.texture, fade: fi, lean: 0.006, sway: 0.0035, alphaTest: 0.5, transl: 0.5, ...o }); out.imp = { geo: imp.geometry, mat: m.mat, depth: m.depth }; }
      return out;
    },
  };
  return model;
}

export function loadVegModels(renderer, keys = Object.keys(VEG_MODELS)) {
  return Promise.all(keys.map((k) => { if (!_cache.has(k)) _cache.set(k, loadOne(renderer, k).catch((e) => { console.warn('[vegetation] model unavailable', k, e); return null; })); return _cache.get(k).then((m) => [k, m]); }))
    .then((list) => Object.fromEntries(list.filter(([, m]) => m)));
}
