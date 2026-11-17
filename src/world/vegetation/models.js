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
import { makeVegMaterial, VEG_R2 } from './materials.js';
import GRADE from './grade.json';
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
// round 2: thicker crowns for library trees whose source crown is only a few hundred leaf cards (the poinciana / gnarled oak has 512):
// every card is cloned n - 1 times, turned up to ~35 deg about a random axis, scaled 0.85-1.1 and pushed mostly inward along the crown
// radius, so the crown fills in (no see-through gaps, no cut-paper layers). Deterministic per model.
function densify(g, n, E, seed, cs = 1) { // cs: every card (the originals too) scaled about its own center: smaller, denser petals / leaves
  if (!((n > 1) || cs !== 1) || !E || !g.index) return g; n = Math.max(1, n);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index.array, nv = P.count, par = new Int32Array(nv).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(I[t]); for (const v of [I[t + 1], I[t + 2]]) { const b = find(v); if (b !== a) par[b] = a; } }
  const comp = new Map(); for (let i = 0; i < nv; i++) { const r = find(i); let c = comp.get(r); if (!c) comp.set(r, (c = { v: [], cx: 0, cy: 0, cz: 0 })); c.v.push(i); c.cx += P.getX(i); c.cy += P.getY(i); c.cz += P.getZ(i); }
  const vComp = new Int32Array(nv), comps = [...comp.values()]; comps.forEach((c, k) => { c.cx /= c.v.length; c.cy /= c.v.length; c.cz /= c.v.length; for (const i of c.v) vComp[i] = k; });
  let st = seed >>> 0 || 1; const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  const pos = new Float32Array(nv * 3 * n), nor = new Float32Array(nv * 3 * n), uv = new Float32Array(nv * 2 * n), idx = new Uint32Array(I.length * n);
  for (let i = 0; i < nv; i++) { pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i); nor[i * 3] = N.getX(i); nor[i * 3 + 1] = N.getY(i); nor[i * 3 + 2] = N.getZ(i); uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); } idx.set(I);
  const q = new THREE.Quaternion(), ax = new THREE.Vector3(), v = new THREE.Vector3(), Rm = (E.r[0] + E.r[1] + E.r[2]) / 3;
  if (cs !== 1) for (let i = 0; i < nv; i++) { const cp = comps[vComp[i]]; pos[i * 3] = cp.cx + (pos[i * 3] - cp.cx) * cs; pos[i * 3 + 1] = cp.cy + (pos[i * 3 + 1] - cp.cy) * cs; pos[i * 3 + 2] = cp.cz + (pos[i * 3 + 2] - cp.cz) * cs; }
  for (let c = 1; c < n; c++) {
    const T = comps.map((cp) => { ax.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); const qq = new THREE.Quaternion().setFromAxisAngle(ax, (rnd() - 0.5) * 1.2);
      const dx = cp.cx - E.c[0], dy = cp.cy - E.c[1], dz = cp.cz - E.c[2], dl = Math.hypot(dx, dy, dz) || 1, push = (-0.3 + rnd() * 0.38) * Math.min(dl, Rm) / dl, j = 0.12 * Rm;
      return { q: qq, s: (0.85 + rnd() * 0.25) * cs, ox: cp.cx + dx * push + (rnd() - 0.5) * j, oy: cp.cy + dy * push + (rnd() - 0.5) * j * 0.6, oz: cp.cz + dz * push + (rnd() - 0.5) * j }; });
    for (let i = 0; i < nv; i++) { const cp = comps[vComp[i]], t = T[vComp[i]], o = (c * nv + i);
      v.set(P.getX(i) - cp.cx, P.getY(i) - cp.cy, P.getZ(i) - cp.cz).applyQuaternion(t.q).multiplyScalar(t.s); pos[o * 3] = t.ox + v.x; pos[o * 3 + 1] = t.oy + v.y; pos[o * 3 + 2] = t.oz + v.z;
      v.set(N.getX(i), N.getY(i), N.getZ(i)).applyQuaternion(t.q); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z; uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); }
    for (let k = 0; k < I.length; k++) idx[c * I.length + k] = I[k] + c * nv;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// round 2 (lead / user: palm fronds read as single flat planes): fold every frond along its rib into a shallow V (edges up), with the
// normals tilted to match, so a frond catches light on one half and shade on the other. Per connected frond card / mesh: its axis
// runs from the crown center through the card's centroid; vertices rise with their distance from that axis.
function foldFronds(g, crownC) {
  if (!g.index) return; const P = g.attributes.position, N = g.attributes.normal, I = g.index.array, nv = P.count, par = new Int32Array(nv).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(I[t]); for (const v of [I[t + 1], I[t + 2]]) { const b = find(v); if (b !== a) par[b] = a; } }
  const cs = new Map(); for (let i = 0; i < nv; i++) { const r = find(i); let c = cs.get(r); if (!c) cs.set(r, (c = { x: 0, z: 0, n: 0 })); c.x += P.getX(i); c.z += P.getZ(i); c.n++; }
  for (let i = 0; i < nv; i++) { const c = cs.get(find(i)); let dx = c.x / c.n - crownC[0], dz = c.z / c.n - crownC[1]; const dl = Math.hypot(dx, dz); if (dl < 0.4) continue; dx /= dl; dz /= dl;
    const rx = P.getX(i) - crownC[0], rz = P.getZ(i) - crownC[1], lat = -rx * dz + rz * dx, along = rx * dx + rz * dz, k = Math.min(1, Math.max(0, (along - 0.3) / 1.2)), sg = Math.sign(lat);
    P.setY(i, P.getY(i) + Math.min(0.6, Math.abs(lat) * 0.3) * k);
    if (N) { let nx = N.getX(i) - sg * -dz * 0.3 * k, ny = N.getY(i), nz = N.getZ(i) - sg * dx * 0.3 * k; const l = Math.hypot(nx, ny, nz) || 1; N.setXYZ(i, nx / l, ny / l, nz / l); } }
  P.needsUpdate = true; if (N) N.needsUpdate = true;
}

function partsOf(scene, def, E0 = null, lod = 0) {
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
  // trunk radius 0.9-1.6 m up (80th percentile of the bark around the base axis): street palms in paving clamp their root flare to it
  const tr = []; for (const [m, gs] of byMat) if (def.bark.test(m.name || '')) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > 0.9 && y < 1.6) tr.push(Math.hypot(P.getX(i), P.getZ(i))); } }
  tr.sort((a, b) => a - b); const trunkR = tr.length ? tr[Math.floor(tr.length * 0.8)] : 0.2;
  let rMax = 0.3; for (const [, gs] of byMat) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) rMax = Math.max(rMax, Math.hypot(P.getX(i), P.getZ(i))); }
  // round 2: the crown as an ellipsoid (4-96 % of the foliage above the crown start), from LOD0 and reused for LOD1 so both shade
  // alike. It drives crown ambient occlusion (dark inside, lit shell, darker underside) and the volumetric normals.
  let E = E0;
  if (!E) { const X = [], Y = [], Z = [];
    for (const [m, gs] of byMat) if (!def.bark.test(m.name || '')) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i += 2) { const y = P.getY(i); if (def.cls === 'palm' || y >= yCrown) { X.push(P.getX(i)); Y.push(y); Z.push(P.getZ(i)); } } }
    const pc = (A, q) => A[Math.min(A.length - 1, Math.floor(A.length * q))];
    if (X.length > 8) { for (const A of [X, Y, Z]) A.sort((a, b) => a - b);
      E = { c: [(pc(X, 0.04) + pc(X, 0.96)) / 2, (pc(Y, 0.04) + pc(Y, 0.96)) / 2, (pc(Z, 0.04) + pc(Z, 0.96)) / 2], r: [Math.max(0.25, (pc(X, 0.96) - pc(X, 0.04)) / 2), Math.max(0.25, (pc(Y, 0.96) - pc(Y, 0.04)) / 2), Math.max(0.25, (pc(Z, 0.96) - pc(Z, 0.04)) / 2)] }; }
  }
  const AOIN = def.cls === 'shrub' ? 0.38 : 0.3, ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const crownAO = (x, y, z) => { // 0..1 ambient visibility of a point in the crown
    if (!E) return 1;
    if (def.cls === 'palm') { const t = Math.hypot(x - crownC[0], z - crownC[1]) / Math.max(0.5, rMax), up = ss(E.c[1] - E.r[1], E.c[1] + E.r[1] * 0.5, y); return (0.5 + 0.5 * ss(0.0, 0.6, t)) * (0.78 + 0.22 * up); }
    const dx = (x - E.c[0]) / E.r[0], dy = (y - E.c[1]) / E.r[1], dz = (z - E.c[2]) / E.r[2], e = Math.hypot(dx, dy, dz);
    return (AOIN + (1 - AOIN) * Math.pow(ss(0.12, 1.0, e), 0.9)) * (0.7 + 0.3 * ss(-1, 1, dy));
  };
  for (const [m, gs] of byMat) {
    const keep = gs.map((g) => { const n = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (g.attributes[k]) n.setAttribute(k, g.attributes[k]); if (g.index) n.setIndex(g.index); return n; });
    let g = keep.length > 1 ? mergeGeometries(keep, false) : keep[0]; if (!g) continue;
    if (!g.index) { const I = []; for (let i = 0; i < g.attributes.position.count; i++) I.push(i); g.setIndex(I); }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (VEG_R2 && (def.dens || def.cardS) && !def.bark.test(m.name || '')) g = densify(g, def.dens ? def.dens[lod] || 1 : 1, E, 9173 + lod * 31 + (m.name || '').length * 7, def.cardS || 1);
    if (VEG_R2 && def.cls === 'palm' && !def.bark.test(m.name || '') && !/^(fan_palm|sabal_palm)$/.test(def.file || '')) foldFronds(g, crownC); /* fan palms keep their pleated fans */
    const bark = def.bark.test(m.name || ''), P = g.attributes.position, n = P.count, W = new Float32Array(n * 3), C = new Float32Array(n * 3), AO = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z), ph = Math.atan2(z, x);
      if (bark) { W[i * 3] = y; W[i * 3 + 1] = 0; W[i * 3 + 2] = 0; C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 1; if (def.cls !== 'palm' && y > yCrown * 0.85) AO[i] = Math.max(0.4, crownAO(x, y, z)); continue; } // branches inside the crown sit in its shade
      // foliage: the crown sways as one piece from its attachment height (palms: no rubbery fronds), tips flutter; crown self-shadow inside
      const t = Math.min(1, r / (rMax * 0.85));
      W[i * 3] = def.palm ? Math.max(yCrown, Math.min(y, yTop)) : y; W[i * 3 + 1] = Math.max(0.02, Math.pow(t, 1.3)); W[i * 3 + 2] = ph * 3;
      const sh = (def.cls === 'shrub' ? 0.72 : 0.62) + 0.38 * Math.min(1, t * 1.6) * (0.75 + 0.25 * Math.min(1, (y - yCrown) / Math.max(0.5, yTop - yCrown)));
      C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = VEG_R2 ? 1 : sh; AO[i] = crownAO(x, y, z); // r2: occlusion goes to the lighting (ambient, part of the sun), not the albedo
    }
    if (!bark && def.cls !== 'palm' && !(VEG_R2 && E)) { // broadleaf crowns: bend the card normals toward the crown's outward direction (soft, volumetric
      // crown lighting like GTA foliage; cards that faced down / inward rendered black)
      const N = g.attributes.normal, cy = (yCrown + yTop) / 2, k = def.radialN ?? 0.5, v = new THREE.Vector3(), o = new THREE.Vector3();
      for (let i = 0; i < n; i++) { o.set(P.getX(i), (P.getY(i) - cy) * 0.8 + 0.25 * (yTop - yCrown), P.getZ(i)).normalize(); v.set(N.getX(i), N.getY(i), N.getZ(i));
        if (v.dot(o) < 0) v.negate(); v.lerp(o, k).normalize(); N.setXYZ(i, v.x, v.y, v.z); } N.needsUpdate = true; }
    if (!bark && VEG_R2 && E) { // volumetric crown normals: card normals bent toward the crown ellipsoid's surface normal (broadleaf / shrubs strongly,
      // palm fronds mildly, toward outward + up), so the crown shades as one lit / shaded volume instead of flat paper layers
      const N = g.attributes.normal, v = new THREE.Vector3(), o = new THREE.Vector3(), palm = def.cls === 'palm', k = palm ? 0.3 : def.cls === 'shrub' ? 0.62 : (def.radialN ?? 0.65) /* lead: keep ~35-40 % of each card's own normal so leaves still catch light one by one */;
      for (let i = 0; i < n; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        if (palm) o.set((x - crownC[0]) * 0.7, Math.max(0.6, 1.2 * Math.hypot(x - crownC[0], z - crownC[1]) / Math.max(1, rMax)), (z - crownC[1]) * 0.7).normalize();
        else o.set((x - E.c[0]) / (E.r[0] * E.r[0]), (y - E.c[1]) / (E.r[1] * E.r[1]) + 0.15 / E.r[1], (z - E.c[2]) / (E.r[2] * E.r[2])).normalize();
        v.set(N.getX(i), N.getY(i), N.getZ(i)); if (v.dot(o) < 0) v.negate(); v.lerp(o, k).normalize(); N.setXYZ(i, v.x, v.y, v.z); } N.needsUpdate = true; }
    if (VEG_R2) g.setAttribute('aVegAO', new THREE.BufferAttribute(AO, 1));
    g.setAttribute('aWind', new THREE.BufferAttribute(W, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.computeBoundingSphere();
    const map = m.map || null; if (map) { map.anisotropy = 8; map.colorSpace = THREE.SRGBColorSpace; }
    out.push({ name: m.name, fam: bark ? 'bark' : 'leaf', geometry: g, map, normalMap: m.normalMap || null, tris: g.index.count / 3 });
  }
  out.sort((a, b) => (a.fam === b.fam ? 0 : a.fam === 'bark' ? -1 : 1));
  // trunk axis for colliders (r2-physics): 5 points from the ground to the crown start, slice centroids of the bark (bark-less low-poly
  // palms: all geometry below the crown), each slice following the previous one (branches ignored), radius = 75th pct distance
  let trunk = null;
  if (def.cls !== 'shrub') { const top = Math.max(1.5, def.cls === 'palm' ? yCrown : Math.min(yCrown, yTop * 0.45)), V = [];
    const anyBark = [...byMat.keys()].some((m) => def.bark.test(m.name || ''));
    for (const [m, gs] of byMat) if (!anyBark || def.bark.test(m.name || '')) for (const g of gs) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y <= top + 0.3) V.push([P.getX(i), y, P.getZ(i)]); } }
    if (V.length > 12) { trunk = []; let cx = 0, cz = 0; for (let k = 0; k <= 4; k++) { const y0 = top * k / 4, sl = V.filter((v) => Math.abs(v[1] - y0) < Math.max(0.25, top / 10) && Math.hypot(v[0] - cx, v[2] - cz) < 1.4);
      if (sl.length < 3) { if (trunk.length) trunk.push([trunk[trunk.length - 1][0], y0, trunk[trunk.length - 1][2], trunk[trunk.length - 1][3]]); continue; }
      cx = sl.reduce((a, v) => a + v[0], 0) / sl.length; cz = sl.reduce((a, v) => a + v[2], 0) / sl.length; const ds = sl.map((v) => Math.hypot(v[0] - cx, v[2] - cz)).sort((a, b) => a - b);
      trunk.push([cx, y0, cz, Math.min(1.2, Math.max(0.08, ds[Math.floor(ds.length * 0.75)]))]); }
      if (trunk.length < 2) trunk = null; } }
  return { parts: out, height: yTop, radius: rMax, crownY: yCrown, crownC, trunkR, E, trunk };
}

// impostor texture: the bake renders the 8 views as one 4x MSAA strip (2048 x up to 1024 px). It is resolved, read back once and
// rebuilt as an atlas of 4 x 2 tiles (S x Th each, Th = power of two >= the view height, the view at the bottom of its tile) with a
// hand-built mip chain, then the MSAA target is freed (~1.5 GB of GPU memory for 50 models):
//  - mips stop at 2 texels per tile, every coarser texel lies inside one tile: views never bleed into each other (a short-wide
//    strip collapsed a whole view column into one half-alpha texel: far trees drew as solid / dithered rectangles)
//  - coverage-preserving alpha: per tile and level, alpha is scaled so the share of texels passing the 0.5 alpha test equals
//    level 0's (a far tree keeps its silhouette density: no thinning out, no blob, no crawl from a coverage jump between levels)
//  - push-pull color dilation: transparent texels take the alpha-weighted color of the nearest coarser level (no dark rims)
let _blit = null;
function impostorMips(src, w, S, V, rh) {
  const C = Math.min(V, 4), Rn = Math.ceil(V / C), Th = 1 << Math.ceil(Math.log2(Math.max(2, rh))), AW = C * S, AH = Rn * Th;
  const nL = Math.max(1, Math.log2(Math.min(S, Th)) | 0), lv = [];
  let P = new Float32Array(AW * AH * 4); // premultiplied rgb, alpha
  for (let k = 0; k < V; k++) { const tx = (k % C) * S, ty = ((k / C) | 0) * Th;
    for (let y = 0; y < rh; y++) { let si = (y * w + k * S) * 4, di = ((ty + y) * AW + tx) * 4;
      for (let x = 0; x < S; x++, si += 4, di += 4) { const a = src[si + 3] / 255; P[di] = src[si] / 255 * a; P[di + 1] = src[si + 1] / 255 * a; P[di + 2] = src[si + 2] / 255 * a; P[di + 3] = a; } } }
  lv.push({ P, w: AW, h: AH });
  for (let l = 1; l < nL; l++) { const q = lv[l - 1], W = q.w >> 1, H = q.h >> 1, D = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, a = ((2 * y) * q.w + 2 * x) * 4, b = a + q.w * 4;
      for (let c = 0; c < 4; c++) D[o + c] = (q.P[a + c] + q.P[a + 4 + c] + q.P[b + c] + q.P[b + 4 + c]) * 0.25; }
    lv.push({ P: D, w: W, h: H }); }
  // straight color: rgb / alpha where covered, else the coarser level's color (filled from the coarsest level up)
  const RGB = lv.map((q) => new Float32Array(q.w * q.h * 3));
  for (let l = nL - 1; l >= 0; l--) { const q = lv[l], O = RGB[l], up = l + 1 < nL ? lv[l + 1] : null, U = up ? RGB[l + 1] : null;
    let fr = 0, fg = 0, fb = 0, fw = 0; if (!up) for (let i = 0; i < q.w * q.h; i++) { fr += q.P[i * 4]; fg += q.P[i * 4 + 1]; fb += q.P[i * 4 + 2]; fw += q.P[i * 4 + 3]; }
    for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) { const i = y * q.w + x, a = q.P[i * 4 + 3];
      if (a > 1e-3) { O[i * 3] = q.P[i * 4] / a; O[i * 3 + 1] = q.P[i * 4 + 1] / a; O[i * 3 + 2] = q.P[i * 4 + 2] / a; }
      else if (up) { const j = ((y >> 1) * up.w + (x >> 1)) * 3; O[i * 3] = U[j]; O[i * 3 + 1] = U[j + 1]; O[i * 3 + 2] = U[j + 2]; }
      else if (fw > 0) { O[i * 3] = fr / fw; O[i * 3 + 1] = fg / fw; O[i * 3 + 2] = fb / fw; } } }
  // per tile coverage at the 0.5 alpha test, kept at every level by an alpha scale (threshold from a 256-bin histogram)
  const cov = new Float32Array(V), hist = new Uint32Array(256), out = [];
  for (let l = 0; l < nL; l++) { const q = lv[l], tw = S >> l, th = Th >> l, D = new Uint8Array(q.w * q.h * 4), O = RGB[l];
    for (let k = 0; k < C * Rn; k++) { const tx = (k % C) * tw, ty = ((k / C) | 0) * th; let sc = 1;
      if (k < V) { hist.fill(0); for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) hist[Math.min(255, (q.P[((ty + y) * q.w + tx + x) * 4 + 3] * 255) | 0)]++;
        const n = tw * th; if (l === 0) { let c = 0; for (let b = 128; b < 256; b++) c += hist[b]; cov[k] = c / n; }
        else if (cov[k] > 0) { const want = cov[k] * n; let c = 0, b = 255; for (; b > 0; b--) { c += hist[b]; if (c >= want) break; } sc = Math.min(6, Math.max(0.5, 0.5 / Math.max(1 / 255, (b + 0.5) / 255))); } }
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const i = (ty + y) * q.w + tx + x;
        D[i * 4] = Math.min(255, O[i * 3] * 255 + 0.5); D[i * 4 + 1] = Math.min(255, O[i * 3 + 1] * 255 + 0.5); D[i * 4 + 2] = Math.min(255, O[i * 3 + 2] * 255 + 0.5); D[i * 4 + 3] = Math.min(255, q.P[i * 4 + 3] * sc * 255 + 0.5); } }
    out.push({ data: D, width: q.w, height: q.h }); }
  return { mips: out, AW, AH, C, Rn, fy: rh / Th };
}
function compactImpostor(renderer, imp) {
  if (!imp || !imp.rt || !(imp.rt.samples > 0)) return imp;
  const w = imp.rt.width, h = imp.rt.height, im = imp.texture.userData.impostor, V = im.views, S = w / V;
  const rt2 = new THREE.WebGLRenderTarget(w, h, { samples: 0, colorSpace: THREE.NoColorSpace });
  _blit ||= (() => { const m = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }', depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; const sc = new THREE.Scene(); sc.add(q); return { m, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) }; })();
  const prev = renderer.getRenderTarget(), ac = renderer.autoClear;
  _blit.m.uniforms.tSrc.value = imp.texture; renderer.autoClear = true; renderer.setRenderTarget(rt2); renderer.render(_blit.sc, _blit.cam); renderer.setRenderTarget(prev); renderer.autoClear = ac; _blit.m.uniforms.tSrc.value = null;
  const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt2, 0, 0, w, h, px); rt2.dispose(); imp.rt.dispose();
  const M = impostorMips(px, w, S, V, h), tex = new THREE.DataTexture(M.mips[0].data, M.AW, M.AH, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = M.mips; tex.generateMipmaps = false; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.colorSpace = THREE.NoColorSpace; tex.flipY = false; tex.anisotropy = 4;
  tex.userData.impostor = { ...im, cols: M.C, rows: M.Rn, fy: M.fy }; tex.needsUpdate = true;
  tex.onUpdate = () => { for (const m of tex.mipmaps) m.data = null; tex.image.data = null; tex.onUpdate = null; }; // uploaded once: drop the CPU copies
  return { geometry: imp.geometry, texture: tex, rt: null };
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
  const L0 = partsOf(g0.scene, def); await breathe(8); const L1 = g1 ? partsOf(g1.scene, def, L0.E, 1) : L0; await breathe(8);
  for (const g of [g0, g1]) if (g) g.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); _glb.delete(def.file + '.glb'); _glb.delete(def.file + '_lod1.glb'); // parts hold their own copies
  for (const p of L1.parts) { const q = L0.parts.find((x) => x.name === p.name); if (q) { p.map = q.map; p.normalMap = q.normalMap; } }
  const C = CLS[def.cls] || CLS.tree, shape = (def.shape || C.shape).slice(); shape[0] = L0.height;
  // glTF normal maps: green flipped without tangents
  const GR = VEG_R2 ? GRADE[key] || {} : {}; // round 2: per-material gain into the shared palette (tools/v2/vegetation/grade.py)
  const vm = (fam, p, o) => makeVegMaterial(fam, { map: p.map, normalMap: p.normalMap, normalScale: VEG_R2 && fam === 'leaf' ? [0.7, -0.7] : [1, -1], /* r2-art: leaf cards 0.6-0.8 (full strength flickers at distance) */ roughness: fam === 'bark' ? 0.9 : 0.72, grade: GR[p.name], ao: VEG_R2 && !!p.geometry.attributes.aVegAO, ...o });
  await initTexturesSliced(renderer, L0.parts.flatMap((p) => [p.map, p.normalMap]).filter(Boolean), 8); await yieldTask();
  let imp = null;
  try {
    const bakeParts = L0.parts.map((p) => ({ geometry: p.geometry, material: vm(p.fam, p, { lean: 0, sway: 0, tint: 0, wear: 0, transl: 0 }).mat }));
    const tb = performance.now(); imp = bakeImpostor(renderer, 'lib_' + key, 1, { parts: bakeParts }, null, null, def.cls === 'shrub' ? 64 : 128, 8); imp = compactImpostor(renderer, imp); (globalThis.__vegBake ||= {})[key] = Math.round(performance.now() - tb);
  } catch (e) { console.warn('[vegetation] model impostor bake failed', key, e); }
  await yieldTask();
  const model = {
    key, def, cls: def.cls, height: L0.height, radius: L0.radius, crownY: L0.crownY, trunkR: L0.trunkR, trunk: L0.trunk, trunkShape: shape, trunkLean: C.lean, lods: [L0.parts, L1.parts], imp,
    tris: [L0.parts.reduce((a, p) => a + p.tris, 0), L1.parts.reduce((a, p) => a + p.tris, 0)],
    // materials for one set of LOD bands (fade vec4 per band); shared shader programs with every other library plant
    materials(f0, f1, fi, o = {}) {
      const base = { lean: C.lean, sway: C.sway, mirror: true, shape, crownY: L0.crownY, crownC: L0.crownC, spread: def.cls === 'palm' ? 0.12 : 0.18, baseAO: def.cls === 'shrub' ? 0.3 : 0.5, ...o, baseClamp: o.paved ? [1.1, L0.trunkR * 1.05, 1] : null }; // paved: root flare pulled into the trunk (a clean base out of the grate)
      const mk = (parts, f) => parts.map((p) => { const m = vm(p.fam, p, { fade: f, wear: p.fam === 'leaf' ? 0.35 : 0.25, jitter: p.fam === 'leaf' ? C.jitLeaf : C.jitBark, barkDet: VEG_R2 && p.fam === 'bark' ? (def.cls === 'palm' ? 1 : 0.6) : 0, ...base, bloom: /bloom/i.test(p.name || '') }); m.mat.userData.vegKey = key; m.mat.userData.vegCls = def.cls; return { geo: p.geometry, mat: m.mat, depth: m.depth, fam: p.fam }; });
      const out = { near: mk(L0.parts, f0), mid: f1 ? mk(L1.parts, f1) : [], imp: null };
      if (imp && fi) { const m = makeVegMaterial('imp', { map: imp.texture, fade: fi, alphaTest: 0.5, transl: 0.5, jitter: C.jitLeaf, ...base, bloom: L0.parts.some((q) => /bloom/i.test(q.name || '')) }); out.imp = { geo: imp.geometry, mat: m.mat, depth: m.depth }; }
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
