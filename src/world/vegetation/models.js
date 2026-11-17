// Library plants (the user's Models/Trees, Models/Plants) as instanced vegetation. Every model is converted offline
// (tools/v2/vegetation/build.sh: Blender, meters, trunk base at the origin, palette-graded textures, leaf cards thinned, bark
// decimated) into public/assets/models/vegetation/<key>.glb (LOD0, textures) and <key>_lod1.glb (fewer triangles, same
// material names; reuses the LOD0 maps). At load every model becomes a list of parts (one per material: 'bark*' opaque,
// 'leaf*' alpha-tested foliage), each drawn with the shared vegetation shader (wind, per-instance mirror / twist / bend /
// crown spread / frond droop, hue-saturation-brightness jitter, LOD dither), plus a multi-view impostor baked from LOD0.
//   loadVegModels(renderer, keys?) -> { [key]: model }   (keys default: every row of species.js VEG_LIB; legacy keys
//                                                         royal / coconut / banyan / fern stay as aliases)
//   model.materials(fade0, fade1, fadeImp, o) -> { near: [{ geo, mat, depth, fam }], mid: [...], imp: { geo, mat, depth } | null }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeVegMaterial } from './materials.js';
import { bakeImpostor } from './field.js';
import { VEG_LIB, CLS } from './species.js';
import { yieldTask, breathe, initTexturesSliced } from '../../core/pace.js';

const BASE = '/assets/models/vegetation/';
const LEGACY = { royal: 'royal_palm', coconut: 'coconut_palm', banyan: 'banyan', fern: 'fern_clump' };
export const VEG_MODELS = Object.fromEntries(Object.entries(VEG_LIB).map(([k, d]) => [k, { file: k, bark: /^bark/i, palm: d.cls === 'palm', ...d }]));

const _cache = new Map();
const _loader = new GLTFLoader();
const _glb = new Map(); // file -> Promise<gltf>: fetched + parsed as soon as this module loads (overlaps terrain / city boot)
const fetchGLB = (f) => { if (!_glb.has(f)) _glb.set(f, _loader.loadAsync(BASE + f)); return _glb.get(f); };
const LIB_ON = typeof location === 'undefined' || !/[?&]veglib=0\b/.test(location.search);
if (LIB_ON && typeof window !== 'undefined') for (const [k, d] of Object.entries(VEG_LIB)) if (!d.hidden) { fetchGLB(k + '.glb').catch(() => null); fetchGLB(k + '_lod1.glb').catch(() => null); }

// one merged geometry per material, with the attributes the vegetation shader expects (aWind, color)
function partsOf(scene, def) {
  scene.updateMatrixWorld(true);
  const byMat = new Map();
  scene.traverse((o) => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g0 = o.geometry.clone(); g0.applyMatrix4(o.matrixWorld);
    if (mats.length === 1) { (byMat.get(mats[0]) || byMat.set(mats[0], []).get(mats[0])).push(g0); return; }
    for (const gr of g0.groups) { const m = mats[gr.materialIndex]; if (!g0.index) continue; const sub = new THREE.BufferGeometry();
      for (const k of Object.keys(g0.attributes)) sub.setAttribute(k, g0.attributes[k]); sub.setIndex(Array.from(g0.index.array.slice(gr.start, gr.start + gr.count)));
      (byMat.get(m) || byMat.set(m, []).get(m)).push(sub); } });
  const out = [];
  let yTop = 0; for (const [, gs] of byMat) for (const g of gs) { g.computeBoundingBox(); yTop = Math.max(yTop, g.boundingBox.max.y); }
  // crown attachment height: low percentile of the foliage vertex heights (palms: where the fronds leave the trunk)
  const ly = []; for (const [m, gs] of byMat) if (!def.bark.test(m.name || '')) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i += 3) ly.push(P.getY(i)); }
  ly.sort((a, b) => a - b); const yCrown = ly.length ? ly[Math.floor(ly.length * 0.04)] : yTop * 0.7;
  // crown attachment point (x, z): the foliage just above the crown start (palms: the top of the trunk, often off-axis)
  let ccx = 0, ccz = 0, ccn = 0; const yBand = yCrown + 0.12 * Math.max(0.3, yTop - yCrown);
  for (const [m, gs] of byMat) if (!def.bark.test(m.name || '')) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y >= yCrown && y <= yBand) { ccx += P.getX(i); ccz += P.getZ(i); ccn++; } } }
  const crownC = ccn ? [ccx / ccn, ccz / ccn] : [0, 0];
  let rMax = 0.3; for (const [, gs] of byMat) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) rMax = Math.max(rMax, Math.hypot(P.getX(i), P.getZ(i))); }
  for (const [m, gs] of byMat) {
    const keep = gs.map((g) => { const n = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (g.attributes[k]) n.setAttribute(k, g.attributes[k]); if (g.index) n.setIndex(g.index); return n; });
    let g = keep.length > 1 ? mergeGeometries(keep, false) : keep[0]; if (!g) continue;
    if (!g.index) { const I = []; for (let i = 0; i < g.attributes.position.count; i++) I.push(i); g.setIndex(I); }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const bark = def.bark.test(m.name || ''), P = g.attributes.position, n = P.count, W = new Float32Array(n * 3), C = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z), ph = Math.atan2(z, x);
      if (bark) { W[i * 3] = y; W[i * 3 + 1] = 0; W[i * 3 + 2] = 0; C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 1; continue; }
      // foliage: the crown sways as one piece from its attachment height (palms: no rubbery fronds), tips flutter; crown self-shadow inside
      const t = Math.min(1, r / (rMax * 0.85));
      W[i * 3] = def.palm ? Math.max(yCrown, Math.min(y, yTop)) : y; W[i * 3 + 1] = Math.max(0.02, Math.pow(t, 1.3)); W[i * 3 + 2] = ph * 3;
      const sh = (def.cls === 'shrub' ? 0.72 : 0.62) + 0.38 * Math.min(1, t * 1.6) * (0.75 + 0.25 * Math.min(1, (y - yCrown) / Math.max(0.5, yTop - yCrown)));
      C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = sh;
    }
    if (!bark && def.cls !== 'palm') { // broadleaf crowns: bend the card normals toward the crown's outward direction (soft, volumetric
      // crown lighting like GTA foliage; cards that faced down / inward rendered black)
      const N = g.attributes.normal, cy = (yCrown + yTop) / 2, k = def.radialN ?? 0.5, v = new THREE.Vector3(), o = new THREE.Vector3();
      for (let i = 0; i < n; i++) { o.set(P.getX(i), (P.getY(i) - cy) * 0.8 + 0.25 * (yTop - yCrown), P.getZ(i)).normalize(); v.set(N.getX(i), N.getY(i), N.getZ(i));
        if (v.dot(o) < 0) v.negate(); v.lerp(o, k).normalize(); N.setXYZ(i, v.x, v.y, v.z); } N.needsUpdate = true; }
    g.setAttribute('aWind', new THREE.BufferAttribute(W, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    const map = m.map || null; if (map) { map.anisotropy = 8; map.colorSpace = THREE.SRGBColorSpace; }
    out.push({ name: m.name, fam: bark ? 'bark' : 'leaf', geometry: g, map, normalMap: m.normalMap || null, tris: g.index.count / 3 });
  }
  out.sort((a, b) => (a.fam === b.fam ? 0 : a.fam === 'bark' ? -1 : 1));
  return { parts: out, height: yTop, radius: rMax, crownY: yCrown, crownC };
}

// impostor memory: the bake renders into a 4x MSAA target (2048 x up to 1024 px, ~32 MB of multisample buffers each, kept alive
// by the target). Copy the resolved image into a plain mipmapped target and free the MSAA one (50 models: ~1.5 GB of GPU memory).
let _blit = null;
function compactImpostor(renderer, imp) {
  if (!imp || !imp.rt || !(imp.rt.samples > 0)) return imp;
  const w = imp.rt.width, h = imp.rt.height;
  const rt2 = new THREE.WebGLRenderTarget(w, h, { samples: 0, colorSpace: THREE.NoColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  _blit ||= (() => { const m = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }', depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; const sc = new THREE.Scene(); sc.add(q); return { m, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) }; })();
  const prev = renderer.getRenderTarget(), ac = renderer.autoClear;
  _blit.m.uniforms.tSrc.value = imp.texture; renderer.autoClear = true; renderer.setRenderTarget(rt2); renderer.render(_blit.sc, _blit.cam); renderer.setRenderTarget(prev); renderer.autoClear = ac;
  rt2.texture.userData.impostor = imp.texture.userData.impostor; _blit.m.uniforms.tSrc.value = null;
  imp.rt.dispose();
  return { geometry: imp.geometry, texture: rt2.texture, rt: rt2 };
}
// boot pacing: every model's CPU work (merge, attributes), texture upload and impostor bake runs one model at a time, in its own
// tasks (the 50 library models used to finish together and block the page for seconds)
let _serial = Promise.resolve();
const serial = (fn) => { const p = _serial.then(async () => { await yieldTask(); return fn(); }); _serial = p.catch(() => null); return p; };
async function loadOne(renderer, key) {
  const def = VEG_MODELS[key]; if (!def) throw new Error('unknown vegetation model ' + key);
  const [g0, g1] = await Promise.all([fetchGLB(def.file + '.glb'), fetchGLB(def.file + '_lod1.glb').catch(() => null)]);
  return serial(() => buildOne(renderer, key, def, g0, g1));
}
async function buildOne(renderer, key, def, g0, g1) {
  const L0 = partsOf(g0.scene, def); await breathe(8); const L1 = g1 ? partsOf(g1.scene, def) : L0; await breathe(8);
  for (const g of [g0, g1]) if (g) g.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); _glb.delete(def.file + '.glb'); _glb.delete(def.file + '_lod1.glb'); // parts hold their own copies
  for (const p of L1.parts) { const q = L0.parts.find((x) => x.name === p.name); if (q) { p.map = q.map; p.normalMap = q.normalMap; } }
  const C = CLS[def.cls] || CLS.tree, shape = (def.shape || C.shape).slice(); shape[0] = L0.height;
  // glTF normal maps: green flipped without tangents
  const vm = (fam, p, o) => makeVegMaterial(fam, { map: p.map, normalMap: p.normalMap, normalScale: [1, -1], roughness: fam === 'bark' ? 0.9 : 0.72, ...o });
  await initTexturesSliced(renderer, L0.parts.flatMap((p) => [p.map, p.normalMap]).filter(Boolean), 8); await yieldTask();
  let imp = null;
  try {
    const bakeParts = L0.parts.map((p) => ({ geometry: p.geometry, material: vm(p.fam, p, { lean: 0, sway: 0, tint: 0, wear: 0, transl: 0 }).mat }));
    const tb = performance.now(); imp = bakeImpostor(renderer, 'lib_' + key, 1, { parts: bakeParts }, null, null, def.cls === 'shrub' ? 128 : 256, 8); imp = compactImpostor(renderer, imp); (globalThis.__vegBake ||= {})[key] = Math.round(performance.now() - tb);
  } catch (e) { console.warn('[vegetation] model impostor bake failed', key, e); }
  await yieldTask();
  const model = {
    key, def, cls: def.cls, height: L0.height, radius: L0.radius, crownY: L0.crownY, lods: [L0.parts, L1.parts], imp,
    tris: [L0.parts.reduce((a, p) => a + p.tris, 0), L1.parts.reduce((a, p) => a + p.tris, 0)],
    // materials for one set of LOD bands (fade vec4 per band); shared shader programs with every other library plant
    materials(f0, f1, fi, o = {}) {
      const base = { lean: C.lean, sway: C.sway, mirror: true, shape, crownY: L0.crownY, crownC: L0.crownC, spread: def.cls === 'palm' ? 0.12 : 0.18, ...o };
      const mk = (parts, f) => parts.map((p) => { const m = vm(p.fam, p, { fade: f, wear: p.fam === 'leaf' ? 0.35 : 0.25, jitter: p.fam === 'leaf' ? C.jitLeaf : C.jitBark, ...base }); return { geo: p.geometry, mat: m.mat, depth: m.depth, fam: p.fam }; });
      const out = { near: mk(L0.parts, f0), mid: f1 ? mk(L1.parts, f1) : [], imp: null };
      if (imp && fi) { const m = makeVegMaterial('imp', { map: imp.texture, fade: fi, alphaTest: 0.5, transl: 0.5, jitter: C.jitLeaf, ...base }); out.imp = { geo: imp.geometry, mat: m.mat, depth: m.depth }; }
      return out;
    },
  };
  return model;
}

export function loadVegModels(renderer, keys = Object.keys(VEG_MODELS).filter((k) => !VEG_MODELS[k].hidden)) {
  if (!LIB_ON) return Promise.resolve({}); // A/B: procedural plants only
  const want = [...new Set(keys.map((k) => LEGACY[k] || k))], t0 = performance.now();
  return Promise.all(want.map((k) => { if (!_cache.has(k)) _cache.set(k, loadOne(renderer, k).catch((e) => { console.warn('[vegetation] model unavailable', k, e); return null; })); return _cache.get(k).then((m) => [k, m]); }))
    .then((list) => { const o = Object.fromEntries(list.filter(([, m]) => m)); for (const [a, k] of Object.entries(LEGACY)) if (o[k] && !o[a]) o[a] = o[k];
      (globalThis.__vegLoad ||= []).push({ n: want.length, ms: Math.round(performance.now() - t0) }); return o; });
}
