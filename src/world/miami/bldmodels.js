// Library building models (the user's Models/Buildings, converted by tools/v2/buildings/convert_models.py into
// public/assets/models/buildings/*.glb): placed on generated lots whose style, district and footprint fit a model.
//   pick(b, ...)     deterministic per building id and metadata only (works before the GLBs load), so the near, mid and far
//                    builders and the colliders all agree on which lots carry a model (those skip their procedural shell)
//   register(...)    any builder that meets a model lot records its instance (idempotent by building id)
//   one InstancedMesh per (model, material) for the whole city, filled every few frames with the instances in range
//   (houses/shops ~420 m, towers to the far plane): ~1 draw call per material, no per-tile meshes.
// Night: tower glass gets a per-window lit pattern (world-space cells, warm/cool mix) like the procedural facades.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = '/assets/models/buildings/';
// w x d x h in model units (glTF x / z / y); k = meters per unit at real size; cls decides which lots it may take
export const LIB = {
  podium_tower: { w: 94.97, d: 94.97, h: 152.53, k: 1, cls: 'tower', use: 'any', glow: 0.55 },
  slim_residential: { w: 66.66, d: 51.3, h: 162.49, k: 1, cls: 'tower', use: 'res', glow: 0.55 },
  red_band_tower: { w: 59.28, d: 56.44, h: 105.81, k: 1, cls: 'tower', use: 'office', glow: 0.5 },
  curved_glass_tower: { w: 34.53, d: 51.67, h: 169.81, k: 1, cls: 'tower', use: 'office', glow: 0.45, wt: 0.45 },
  brick_cottage: { w: 20.12, d: 16.12, h: 7.2, k: 1, cls: 'house', glow: 0.25 },
  blue_house: { w: 1596.02, d: 1739.36, h: 1652.04, k: 0.0062, cls: 'house', glow: 0.25 },
  brick_duplex: { w: 10.2, d: 16.93, h: 8.03, k: 1, cls: 'house', glow: 0.25 },
  graffiti_shop: { w: 12.22, d: 15.7, h: 5.24, k: 1, cls: 'shop', glow: 0.3 },
  stilt_shack: { w: 0.77, d: 1.0, h: 0.67, k: 11, cls: 'stilt', glow: 0.2 },
  casino_tower: { w: 116.8, d: 129.8, h: 64.1, k: 1, cls: 'fixed', glow: 0.5 },
};
const RANGE = { tower: 7000, fixed: 7000, house: 420, shop: 420, stilt: 420 }, CELL = 900;
const CHANCE = { tower: 0.3, house: 0.3, shop: 0.22, stilt: 0.3 };
// the Golden Palm Casino (stage 4 heist): one fixed site on a Miami Beach ocean block; lots under it are cleared
export const CASINO = { name: 'casino_tower', x: 2183, z: -370, ry: -Math.PI / 2, s: 1 }; // Miami Beach superblock, entrance faces Collins Ave (west)

const hash = (n) => { let x = Math.imul(n | 0, 2654435761) ^ (n >>> 13); x = Math.imul(x ^ (x >>> 16), 2246822507); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
const OFF = typeof location !== 'undefined' && /[?&]libmodels=0/.test(location.search);

function frame(ring) { // oriented box of a footprint (principal axes)
  let mx = 0, mz = 0; for (const [x, z] of ring) { mx += x; mz += z; } mx /= ring.length; mz /= ring.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of ring) { const dx = x - mx, dz = z - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const an = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(an), uz = Math.sin(an); let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, z] of ring) { const s = (x - mx) * ux + (z - mz) * uz, q = -(x - mx) * uz + (z - mz) * ux; a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, q); b1 = Math.max(b1, q); }
  const cs = (a0 + a1) / 2, cq = (b0 + b1) / 2; return { cx: mx + ux * cs - uz * cq, cz: mz + uz * cs + ux * cq, ux, uz, L: a1 - a0, W: b1 - b0 };
}
const areaOf = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };

export function createBuildingModels({ root, roadDist = null, districtAt = null, near = null }) {
  const entries = new Map(); // building id -> { name, x, y, z, ry, s, sy, cls }
  const meshes = new Map(); // name -> [{ geo, mat }]
  const cells = new Map(); // 'name|cx,cz' -> [{ p, im, cap }] (one InstancedMesh per part per cell)
  const nightU = { value: 0 };
  let tickFrame = -1, lastX = 1e9, lastZ = 1e9, dirty = true, lastT = 0;
  const group = new THREE.Group(); group.name = 'library-buildings'; root.add(group);

  // ---- selection ----
  function classOf(b, style, zone) {
    const d = districtAt ? districtAt(b.cx, b.cz) || '' : '';
    if (b.style === 'stilt') return 'stilt';
    if ((style === 'glass' || style === 'band' || style === 'office') && b.h > 60 && (b.area || 0) > 700) return 'tower';
    if (style === 'house' && b.style === 'house' && b.h < 10 && (b.area || 0) > 70 && !/Star|Fisher|Key Biscayne|Virginia/.test(d)) return 'house';
    if (b.style === 'strip' && b.h < 9 && zone !== 'beach') return 'shop';
    return null;
  }
  function pick(b, style, zone) {
    if (OFF) return null;
    if (b._lib !== undefined) return b._lib;
    b._lib = null;
    if (!b.rings || b.rings.length !== 1 || b.part || b._passage || b._overlap || (b.minH || 0) > 0.5 && b.style !== 'stilt') return null;
    const cls = classOf(b, style, zone); if (!cls) return null;
    const seed = ((b.id | 0) % 2147483647) | 0;
    if (hash(seed + 7771) > CHANCE[cls]) return null;
    const ring = b.rings[0]; if (ring.length < 4) return null;
    const f = frame(ring); if (f.L < 4 || f.W < 4) return null;
    if (areaOf(ring) / (f.L * f.W) < 0.8) return null; // only near-rectangular lots (the model fills its box)
    const res = /residential|beach/.test(zone) || /apartments|hotel/.test(b.kind || '');
    const cands = [];
    for (const [name, m] of Object.entries(LIB)) {
      if (m.cls !== cls) continue;
      if (cls === 'tower' && ((m.use === 'res' && !res) || (m.use === 'office' && res && hash(seed + 7790) < 0.7))) continue;
      for (const rot of [0, 1]) {
        const mw = (rot ? m.d : m.w), md = (rot ? m.w : m.d); // model extents along the lot's u (long) and v axes
        const s = Math.min(f.L / mw, f.W / md) * 0.97;
        let sy = s, score;
        if (cls === 'tower') {
          const fill = (mw * s * md * s) / (f.L * f.W); if (fill < 0.55) continue;
          sy = Math.min(s * 1.4, Math.max(s * 0.85, b.h / m.h)); score = Math.abs(Math.log((b.h / m.h) / s)) + (1 - fill);
          if (m.h * sy < 55) continue;
        } else {
          const r = s / m.k; if (r < 0.8 || r > 1.3) continue;
          score = Math.abs(Math.log(r)) + Math.abs(Math.log((mw / md) / (f.L / f.W))) * 0.3;
        }
        cands.push({ name, rot, s, sy, score });
      }
    }
    if (!cands.length) return null;
    // variety: any model that fits about as well as the best (one orientation each), weighted, never the same model as a
    // neighbor that already carries one
    cands.sort((a, c) => a.score - c.score);
    const nbNames = new Set(near ? near(b).map((o) => o._lib && o._lib.name).filter(Boolean) : []);
    const seenN = new Set(), pool = [];
    for (const c0 of cands) { if (c0.score > cands[0].score + 0.6 || seenN.has(c0.name)) continue; seenN.add(c0.name); if (!nbNames.has(c0.name)) pool.push(c0); }
    if (!pool.length) return null;
    let wsum = 0; for (const c0 of pool) wsum += LIB[c0.name].wt ?? 1;
    let r = hash(seed + 7781) * wsum, c = pool[0]; for (const c0 of pool) { r -= LIB[c0.name].wt ?? 1; if (r <= 0) { c = c0; break; } }
    const m = LIB[c.name];
    // model +Z (its front) faces the nearest street
    const ax = c.rot ? [f.ux, f.uz] : [-f.uz, f.ux], ext = (c.rot ? m.w : m.d) * c.s / 2;
    let dir = 1;
    if (roadDist) { const dp = roadDist(f.cx + ax[0] * (ext + 5), f.cz + ax[1] * (ext + 5)), dn = roadDist(f.cx - ax[0] * (ext + 5), f.cz - ax[1] * (ext + 5)); dir = dp <= dn ? 1 : -1; }
    const fx = ax[0] * dir, fz = ax[1] * dir, ry = Math.atan2(fx, fz);
    const hw = m.w * c.s / 2, hd = m.d * c.s / 2, cr = Math.cos(ry), sr = Math.sin(ry);
    const corner = (lx, lz) => [f.cx + lx * cr + lz * sr, f.cz - lx * sr + lz * cr];
    b._lib = { name: c.name, cls, x: f.cx, z: f.cz, ry, s: c.s, sy: c.sy, h: m.h * c.sy, rect: [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)] };
    return b._lib;
  }
  function register(b, L, y = 0) {
    if (entries.has(b.id)) return;
    entries.set(b.id, { name: L.name, cls: L.cls, x: L.x, y, z: L.z, ry: L.ry, s: L.s, sy: L.sy }); dirty = true;
  }
  function addFixed(id, name, x, y, z, ry, s) { entries.set(id, { name, cls: LIB[name].cls, x, y, z, ry, s, sy: s }); dirty = true; }

  // ---- loading ----
  const loader = new GLTFLoader();
  const glassy = /glass|window|pane/i;
  function prepMaterial(mat, m) {
    const g = glassy.test(mat.name || '') || mat.transparent;
    if (mat.transparent || mat.alphaMode === 'BLEND') { mat.transparent = false; mat.depthWrite = true; mat.opacity = 1; mat.alphaTest = mat.map ? 0.5 : 0; }
    if (g && !mat.map) { mat.color.lerp(new THREE.Color(0x8fa6bc), 0.5); mat.metalness = 0.9; mat.roughness = 0.1; }
    mat.envMapIntensity = g ? 1.3 : 0.8;
    mat.side = THREE.FrontSide;
    // night windows: dark (glass) texels in world-space window cells light up with the hour (towers bright, houses dim)
    const glow = m.glow;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLibNight = nightU;
      sh.vertexShader = 'varying vec3 vLibW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vLibW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uLibNight;\nvarying vec3 vLibW;\nfloat libH(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uLibNight > 0.01) {
    // window cells along the facade (x+z) per floor: whole floors share a bias so offices read as lit bands, not noise
    vec2 cellP = floor(vec2((vLibW.x + vLibW.z) / 3.1, vLibW.y / 3.5));
    float hh = mix(libH(vec3(cellP, 1.0)), libH(vec3(0.0, cellP.y, 3.0)), 0.55), lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    float glassK = ${g ? '0.85' : '1.0 - smoothstep(0.14, 0.3, lum)'};
    float on = step(hh, 0.3) * glassK * step(2.5, vLibW.y);
    vec3 wc = mix(vec3(1.0, 0.7, 0.42), vec3(0.8, 0.88, 1.0), step(0.62, libH(vec3(cellP, 7.1))));
    totalEmissiveRadiance += wc * (on * 0.85 + glassK * 0.04) * uLibNight * ${glow.toFixed(2)};
  }`);
    };
    mat.customProgramCacheKey = () => 'libbld-' + (g ? 'g' : 'w') + glow;
    mat.needsUpdate = true;
  }
  async function load(name) {
    const m = LIB[name];
    try {
      const sc = (await loader.loadAsync(BASE + name + '.glb')).scene; sc.updateMatrixWorld(true);
      const parts = [];
      sc.traverse((o) => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material];
        const g0 = o.geometry.clone(); g0.applyMatrix4(o.matrixWorld);
        if (mats.length === 1) parts.push({ geo: g0, mat: mats[0] });
        else for (const gr of g0.groups) { const g1 = g0.clone(); g1.setIndex(g0.index ? Array.from(g0.index.array.slice(gr.start, gr.start + gr.count)) : null); g1.clearGroups(); parts.push({ geo: g1, mat: mats[gr.materialIndex] }); } });
      // merge parts sharing a material (fewer draws)
      const byMat = new Map(); for (const p of parts) { if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat).push(p.geo); }
      const out = [];
      for (const [mat, geos] of byMat) {
        const geo = geos.length === 1 ? geos[0] : mergeGeos(geos); if (!geo) continue;
        geo.scale(m.k, m.k, m.k); geo.computeBoundingSphere();
        prepMaterial(mat, m);
        out.push({ geo, mat });
      }
      meshes.set(name, out); dirty = true;
    } catch (e) { console.warn('[buildings] library model failed', name, e); meshes.set(name, []); }
  }
  function mergeGeos(geos) {
    const attrs = ['position', 'normal', 'uv']; let n = 0; for (const g of geos) n += (g.index ? g.index.count : g.attributes.position.count);
    const out = {}; for (const a of attrs) out[a] = new Float32Array(n * (a === 'uv' ? 2 : 3));
    let o = 0;
    for (const g of geos) { const idx = g.index ? g.index.array : null, cnt = idx ? idx.length : g.attributes.position.count;
      for (const a of attrs) { const src = g.attributes[a], k = a === 'uv' ? 2 : 3; if (!src) continue; for (let i = 0; i < cnt; i++) { const v = idx ? idx[i] : i; for (let c = 0; c < k; c++) out[a][(o + i) * k + c] = src.array[v * k + c]; } }
      o += cnt; }
    const g = new THREE.BufferGeometry(); for (const a of attrs) g.setAttribute(a, new THREE.BufferAttribute(out[a], a === 'uv' ? 2 : 3)); return g;
  }
  const loading = new Set();
  function ensure(name) { if (!loading.has(name)) { loading.add(name); load(name); } }

  // ---- per-frame fill (driven by the first visible instanced mesh; cheap: only when the camera moved or entries changed) ----
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  function nightOf(h) { return h >= 19.5 || h < 6 ? 1 : h > 18.6 ? (h - 18.6) / 0.9 : h < 7 ? 1 - (h - 6) : 0; }
  function tick(renderer, cam) {
    const fr = renderer.info.render.frame; if (fr === tickFrame) return; tickFrame = fr;
    const tod = globalThis.game && Number.isFinite(globalThis.game.timeOfDay) ? globalThis.game.timeOfDay : 12; nightU.value = nightOf(((tod % 24) + 24) % 24);
    const now = performance.now();
    const moved = Math.hypot(cam.position.x - lastX, cam.position.z - lastZ) > 25;
    if (!dirty && !moved) return; if (!moved && now - lastT < 250) return;
    lastX = cam.position.x; lastZ = cam.position.z; lastT = now; dirty = false;
    // instances grouped per model and 900 m cell: each cell's meshes get a tight bounding sphere, so off-screen cells are
    // culled in the main view and in the shadow passes
    const lists = new Map();
    for (const e of entries.values()) { const r = RANGE[e.cls] || 400; if (Math.abs(e.x - lastX) > r || Math.abs(e.z - lastZ) > r) continue; ensure(e.name); const k = e.name + '|' + Math.floor(e.x / CELL) + ',' + Math.floor(e.z / CELL); if (!lists.has(k)) lists.set(k, []); lists.get(k).push(e); }
    for (const [k, cm] of cells) if (!lists.has(k)) for (const p of cm) p.im.visible = false;
    for (const [k, L] of lists) {
      const name = k.slice(0, k.indexOf('|')), parts = meshes.get(name); if (!parts || !parts.length) continue;
      let cm = cells.get(k); if (!cm) { cm = parts.map((p) => ({ p, im: null, cap: 0 })); cells.set(k, cm); }
      for (const c of cm) {
        if (L.length > c.cap) { if (c.im) { group.remove(c.im); c.im.dispose(); } c.cap = Math.max(4, 1 << Math.ceil(Math.log2(L.length))); c.im = new THREE.InstancedMesh(c.p.geo, c.p.mat, c.cap); c.im.castShadow = true; c.im.receiveShadow = true; c.im.name = 'lib-' + name; c.im.userData.noDetailCull = true; group.add(c.im); }
        L.forEach((e, i) => { Q.setFromAxisAngle(Y, e.ry); V.set(e.x, e.y, e.z); S.set(e.s / LIB[name].k, e.sy / LIB[name].k, e.s / LIB[name].k); M4.compose(V, Q, S); c.im.setMatrixAt(i, M4); });
        c.im.count = L.length; c.im.instanceMatrix.needsUpdate = true; c.im.visible = true; c.im.computeBoundingSphere();
      }
    }
  }
  // a tiny always-drawn ticker so instances appear even before any library mesh exists
  const tk = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); tk.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -1e4, 0, 0, -1e4, 0, 0, -1e4, 0], 3));
  tk.frustumCulled = false; tk.name = 'library-buildings-ticker'; tk.onBeforeRender = (r, s, c) => tick(r, c); group.add(tk);
  const stats = () => { const o = {}; for (const [k, cm] of cells) { const n = k.slice(0, k.indexOf('|')); o[n] = o[n] || { cells: 0, inst: 0, mats: cm.length }; if (cm[0].im && cm[0].im.visible) { o[n].cells++; o[n].inst += cm[0].im.count; } } return { entries: entries.size, models: o }; };
  return { pick, register, addFixed, stats, entries, group, LIB };
}
