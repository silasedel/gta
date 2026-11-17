// V2 flora: instanced vegetation for the synthetic land (sawgrass, palmetto, crops, and real tree species instead of palms).
// Geometry is built once; tiles only push instance items ({x, y, z, ry, s, color}) into the city's shared instance pools.
// Crowns are alpha-tested leaf cards from the city leaf atlas (M.leaf, left half = leaves); trunks use the bark_brown_02 PBR set.
import * as THREE from 'three';
import { loadSet, setParams } from '../city/pbr.js';
import { vnoise } from './terrain.js';

function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const hash = (x, z, k = 0) => { let h = Math.imul(((x * 13) | 0) ^ (((z * 7) | 0) << 11) ^ (k * 977), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

function geomFrom(P, N, U, C) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); if (C) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere(); return g;
}
// a clump of curved, tapered blades (three segments each); base/tip colors give the sun-bleached tips of sawgrass and palmetto
function tuft({ blades, h, spread, lean, width, base, tip, seed, fan = 0 }) {
  const r = rnd(seed), P = [], N = [], C = [], cb = new THREE.Color(base), ct = new THREE.Color(tip), c = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, hh = h * (0.6 + r() * 0.5), ox = Math.cos(a) * spread * r() * 0.5, oz = Math.sin(a) * spread * r() * 0.5;
    const lx = Math.cos(a) * lean * (0.5 + r()), lz = Math.sin(a) * lean * (0.5 + r()), w = width * (0.7 + r() * 0.6);
    const px = -Math.sin(a), pz = Math.cos(a); // blade width direction
    const pts = []; for (let k = 0; k <= 3; k++) { const t = k / 3; pts.push([ox + lx * t * t, hh * t, oz + lz * t * t, w * (fan ? Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.9 + 0.1 : 1 - t * 0.92), t]); }
    for (let k = 0; k < 3; k++) {
      const A = pts[k], B = pts[k + 1];
      const quad = [[A, -1], [A, 1], [B, 1], [A, -1], [B, 1], [B, -1]];
      for (const [p, sd] of quad) { P.push(p[0] + px * p[3] * sd, p[1], p[2] + pz * p[3] * sd); N.push(Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4); c.copy(cb).lerp(ct, Math.pow(p[4], 1.3) * (0.7 + r() * 0.3)); C.push(c.r, c.g, c.b); }
    }
  }
  return geomFrom(P, N, null, C);
}
// leaf-card crown: clusters [x, y, z, radius]; each cluster = 6 crossed cards + a cap, uv into the left (leaf) half of the atlas
function crown(clusters, seed) {
  const r = rnd(seed), P = [], N = [], U = [], q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const card = (cx, cy, cz, R, rx, ry, w, h, ctr) => {
    m.compose(new THREE.Vector3(cx, cy, cz), q.setFromEuler(e.set(rx, ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const cs = [[-w / 2, -h / 2, 0, 0], [w / 2, -h / 2, 0.5, 0], [w / 2, h / 2, 0.5, 1], [-w / 2, -h / 2, 0, 0], [w / 2, h / 2, 0.5, 1], [-w / 2, h / 2, 0, 1]];
    for (const [x, y, u, vv] of cs) { v.set(x, y, 0).applyMatrix4(m); P.push(v.x, v.y, v.z); const nx = v.x - ctr[0], ny = v.y - ctr[1] + R * 0.4, nz = v.z - ctr[2], l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, Math.abs(ny / l) + 0.35, nz / l); U.push(u, vv); }
  };
  for (const [cx, cy, cz, R] of clusters) {
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI + r() * 0.4; card(cx + (r() - 0.5) * R * 0.5, cy + (r() - 0.5) * R * 0.5, cz + (r() - 0.5) * R * 0.5, R, (r() - 0.5) * 0.9, a, R * 2.1, R * 1.6, [cx, cy, cz]); }
    card(cx, cy + R * 0.45, cz, R, -Math.PI / 2 + (r() - 0.5) * 0.4, r() * 3, R * 1.9, R * 1.9, [cx, cy, cz]);
  }
  const g = geomFrom(P, N, U, null);
  for (let i = 0, nn = g.attributes.normal; i < nn.count; i++) { v.fromBufferAttribute(nn, i).normalize(); nn.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
// trunk + limbs: [x0, y0, z0, x1, y1, z1, r0, r1] segments merged into one geometry with bark uvs
function trunk(segs, extra = []) {
  const parts = [];
  for (const [x0, y0, z0, x1, y1, z1, r0, r1, rs = 7] of segs) {
    const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(r1, r0, L, rs, 2, true);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r0 * 8)), uv.getY(i) * L / 1.2);
    g.translate(0, L / 2, 0);
    const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize(); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); g.translate(x0, y0, z0);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  for (const g of extra) parts.push(g.index ? g.toNonIndexed() : g);
  const P = [], N = [], U = []; for (const g of parts) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); g.dispose(); }
  return geomFrom(P, N, U, null);
}
function propRoots(n, R, H, seed) { // mangrove prop roots: arched tubes from the trunk down into the mud / water
  const r = rnd(seed), out = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + r() * 0.5, rr = R * (0.7 + r() * 0.5), h0 = H * (0.6 + r() * 0.5);
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(a) * 0.15, h0, Math.sin(a) * 0.15), new THREE.Vector3(Math.cos(a) * rr * 0.7, h0 + 0.5, Math.sin(a) * rr * 0.7), new THREE.Vector3(Math.cos(a) * rr, -0.6, Math.sin(a) * rr));
    out.push(new THREE.TubeGeometry(c, 6, 0.045 + r() * 0.03, 4, false)); }
  return out;
}
function fruit(clusters, n, seed) { const r = rnd(seed), P = [], N = [], s = new THREE.IcosahedronGeometry(0.06, 0).toNonIndexed();
  for (let k = 0; k < n; k++) { const [cx, cy, cz, R] = clusters[k % clusters.length], a = r() * 6.28, b = (r() - 0.3) * 1.4, x = cx + Math.cos(a) * Math.cos(b) * R * 0.95, y = cy + Math.sin(b) * R * 0.8, z = cz + Math.sin(a) * Math.cos(b) * R * 0.95;
    const p = s.attributes.position.array, nn = s.attributes.normal.array; for (let i = 0; i < p.length; i += 3) { P.push(p[i] + x, p[i + 1] + y, p[i + 2] + z); N.push(nn[i], nn[i + 1], nn[i + 2]); } }
  return geomFrom(P, N, null, null); }

import { buildGeometry as vegGeometry } from '../vegetation/index.js';
import { placeTrees, csReject, CS_ON } from '../vegetation/countryside.js';
import { loadVegModels } from '../vegetation/models.js';
export async function createFlora(renderer, M) {
  const modelsP = loadVegModels(renderer).catch((e) => { console.warn('[flora] library plant models unavailable', e); return {}; }); // royal / coconut palms, banyan (models.js)
  const bark = await loadSet(renderer, 'bark_brown_02'); for (const t of [bark.map, bark.normalMap, bark.arm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  const barkMat = new THREE.MeshStandardMaterial(setParams(bark, { color: 0xb8aa98 })); barkMat.name = 'flora-bark'; barkMat.userData.pbr = true;
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 }); grassMat.name = 'flora-blades';
  if (M.timeU) grassMat.onBeforeCompile = (sh) => { sh.uniforms.uFloraT = M.timeU; sh.vertexShader = 'uniform float uFloraT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
      float fph = dot(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), vec2(0.13, 0.17));
      float fk = position.y * position.y * 0.06; transformed.x += sin(uFloraT * 1.7 + fph) * fk; transformed.z += cos(uFloraT * 1.3 + fph * 1.3) * fk * 0.7;
    #endif`); };
  // grass blades have no texture map: their surface detail is per-vertex gradient + a fine streak normal from the blade geometry
  grassMat.userData.pbr = true;
  const fruitMat = new THREE.MeshStandardMaterial({ color: 0xf08a1c, roughness: 0.45 }); fruitMat.name = 'flora-fruit'; fruitMat.userData.pbr = true;
  const leaf = M.leaf || new THREE.MeshStandardMaterial({ color: 0x4a7a3a, side: THREE.DoubleSide, roughness: 0.8 });
  const G = {
    sawgrass: tuft({ blades: 26, h: 1.7, spread: 1.0, lean: 0.55, width: 0.035, base: 0x727440, tip: 0xdcc88e, seed: 11 }),
    rush: tuft({ blades: 18, h: 1.1, spread: 0.6, lean: 0.25, width: 0.02, base: 0x5a7440, tip: 0xb0b878, seed: 12 }),
    palmetto: tuft({ blades: 13, h: 1.25, spread: 0.7, lean: 0.9, width: 0.28, base: 0x3c5a2a, tip: 0x7e9a52, seed: 13, fan: 1 }),
    crop: (() => { const parts = []; for (let k = 0; k < 4; k++) { const g = tuft({ blades: 7, h: 0.55, spread: 0.2, lean: 0.3, width: 0.06, base: 0x355f22, tip: 0x8dbb48, seed: 20 + k }); g.translate(0, 0, k * 1.2); parts.push(g); }
      const P = [], N = [], C = []; for (const g of parts) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); C.push(...g.attributes.color.array); } return geomFrom(P, N, null, C); })(),
  };
  const oakCl = [[0, 5.2, 0, 2.6], [3.2, 5.0, 1.0, 2.4], [-3.0, 4.8, 1.4, 2.3], [1.0, 5.4, -3.0, 2.4], [-1.6, 5.6, -2.4, 2.2], [2.6, 4.4, -1.8, 2.0], [-2.4, 4.6, -0.6, 2.0], [0.6, 6.4, 0.6, 2.2], [0.2, 4.6, 3.0, 2.1]];
  const T = {
    oak: { trunk: trunk([[0, 0, 0, 0.2, 3, 0.1, 0.42, 0.32, 9], [0.2, 2.8, 0.1, 3.2, 4.6, 1.0, 0.26, 0.12], [0.2, 2.8, 0.1, -2.8, 4.4, 1.3, 0.24, 0.11], [0.2, 2.9, 0.1, 1.0, 5.0, -2.8, 0.22, 0.1], [0.2, 3.0, 0.1, -1.4, 5.2, -2.2, 0.2, 0.1]]), crown: crown(oakCl, 31) },
    gumbo: { trunk: trunk([[0, 0, 0, -0.3, 3.4, 0.2, 0.3, 0.22, 8], [-0.3, 3.2, 0.2, 1.8, 5.4, 0.6, 0.16, 0.08], [-0.3, 3.3, 0.2, -1.8, 5.6, -0.8, 0.15, 0.08]]), crown: crown([[1.6, 6.0, 0.6, 2.0], [-1.7, 6.1, -0.7, 2.0], [0, 6.8, 0, 2.1], [0.4, 5.6, 1.8, 1.7], [-0.6, 5.7, -1.9, 1.7]], 32) },
    banyan: { trunk: trunk([[0, 0, 0, 0, 3.5, 0, 0.8, 0.6, 10], [0, 3.2, 0, 5, 5, 0, 0.3, 0.16], [0, 3.2, 0, -5, 5, 0.5, 0.3, 0.16], [0, 3.3, 0, 0.4, 5.2, 5, 0.28, 0.15], [0, 3.3, 0, -0.5, 5.2, -5, 0.28, 0.15],
      [4, 4.8, 0, 4, 0, 0, 0.07, 0.06, 5], [-4, 4.8, 0.4, -4.1, 0, 0.4, 0.07, 0.06, 5], [0.3, 5, 4, 0.3, 0, 4, 0.08, 0.06, 5], [-0.4, 5, -4, -0.4, 0, -4, 0.07, 0.06, 5], [2.6, 4.2, 0, 2.6, 0, 0.2, 0.06, 0.05, 5], [-2.5, 4.1, 0.3, -2.5, 0, 0.2, 0.06, 0.05, 5]]),
      crown: crown([[0, 6.4, 0, 3], [4.6, 5.8, 0.5, 2.8], [-4.6, 5.8, 0.4, 2.8], [0.3, 5.8, 4.6, 2.8], [-0.4, 5.9, -4.6, 2.8], [3.4, 6.2, 3.4, 2.4], [-3.4, 6.1, -3.2, 2.4], [3.3, 6.0, -3.3, 2.4], [-3.2, 6.2, 3.2, 2.4]], 33) },
    pine: { trunk: trunk([[0, 0, 0, 0.2, 15, 0, 0.26, 0.1, 8], [0.15, 11.5, 0, 1.6, 13, 0.4, 0.07, 0.03, 5], [0.15, 12.5, 0, -1.4, 13.8, -0.5, 0.07, 0.03, 5]]), crown: crown([[0.2, 14.6, 0, 1.9], [1.5, 13.3, 0.4, 1.5], [-1.3, 13.9, -0.5, 1.5], [0.3, 12.6, -1.2, 1.3], [-0.4, 12.4, 1.2, 1.3]], 34) },
    cypress: { trunk: trunk([[0, 0, 0, 0, 1.2, 0, 0.75, 0.3, 9], [0, 1.1, 0, 0.1, 12, 0, 0.3, 0.1, 8]]), crown: crown([[0, 12.2, 0, 1.4], [0.6, 10.6, 0.3, 1.5], [-0.5, 9.2, -0.4, 1.5], [0.3, 7.8, 0.5, 1.3], [-0.3, 6.6, -0.2, 1.2]], 35) },
    citrus: { trunk: trunk([[0, 0, 0, 0, 1.1, 0, 0.12, 0.09, 6], [0, 1.0, 0, 0.6, 1.8, 0.2, 0.06, 0.04, 5], [0, 1.0, 0, -0.5, 1.9, -0.3, 0.06, 0.04, 5]]), crown: crown([[0, 2.6, 0, 1.4], [0.8, 2.2, 0.5, 1.1], [-0.8, 2.3, -0.4, 1.1], [0.3, 2.0, -0.9, 1.0], [-0.3, 2.1, 0.9, 1.0]], 36) },
    mangrove: { trunk: trunk([[0, 0.4, 0, 0.2, 2.6, 0, 0.13, 0.08, 6], [0.2, 2.2, 0, 1.4, 3.2, 0.4, 0.06, 0.04, 5], [0.2, 2.3, 0, -1.2, 3.4, -0.6, 0.06, 0.04, 5]], propRoots(11, 1.9, 1.6, 41)), crown: crown([[0, 3.6, 0, 1.7], [1.5, 3.1, 0.5, 1.5], [-1.4, 3.2, -0.6, 1.5], [0.5, 3.0, -1.5, 1.4], [-0.5, 3.1, 1.5, 1.4], [0.2, 4.2, 0.2, 1.3]], 37) },
    seagrape: { trunk: trunk([[0, 0, 0, 0.5, 1.6, 0.2, 0.08, 0.05, 5], [0, 0, 0, -0.6, 1.4, -0.1, 0.08, 0.05, 5], [0, 0, 0, 0.1, 1.8, -0.6, 0.07, 0.05, 5]]), crown: crown([[0.6, 1.9, 0.3, 1.2], [-0.7, 1.7, -0.1, 1.2], [0.1, 2.2, -0.7, 1.1], [0, 1.1, 0.9, 1.0], [0.9, 1.0, -0.6, 0.9]], 38) },
  };
  // vegetation track: real branching trees and ground plants (several seeded variants per species), drawn with the shared vegetation materials
  const VT = {}, VG = {};
  try {
    const mk = (kind, n, o = {}) => Array.from({ length: n }, (_, v) => vegGeometry(kind, { seed: v * 5 + 1 + (o.s0 || 0), ...o }));
    VT.oak = VT.tree = mk('liveoak', 3); VT.gumbo = mk('gumbo', 3); VT.banyan = mk('liveoak', 2, { size: 1.3, s0: 40 }); VT.pine = mk('slashpine', 3); VT.cypress = mk('cypress', 3); VT.mangrove = mk('mangrove', 3); VT.seagrape = mk('seagrape', 3, { size: 1.5 });
    VG.palmetto = mk('sawpalmetto', 3, { lod: 1 }); VG.sawgrass = mk('sawgrass', 4);
  } catch (e) { console.warn('[flora] vegetation geometries unavailable', e); }
  T.tree = T.oak; T.citrusFruit = fruit([[0, 2.6, 0, 1.4], [0.8, 2.2, 0.5, 1.1], [-0.8, 2.3, -0.4, 1.1]], 26, 39);
  const TINT = { oak: [0x5d7a3a, 0x6b8442, 0x55703a], gumbo: [0x7c9a4a, 0x86a252], banyan: [0x4f6e34, 0x5a7a3c], pine: [0x4a6436, 0x52703c], cypress: [0x8aa65a, 0x7f9c52], citrus: [0x3f6a2c, 0x46722f], mangrove: [0x4d6a32, 0x587638], seagrape: [0x8a9a4a, 0x9a8e46, 0x7e9248] };
  const SPECIES = new Set(Object.keys(TINT).concat('tree'));

  // ---- scatter: one near tile of synthetic land -> instance lists (deterministic, so render and collider passes agree) ----
  // q: { data, terrain, roadDist, inBuilding } ; yields every few rows
  function* scatter(x0, z0, S, q, out) {
    const { data, terrain } = q, st = 3.5, n = Math.round(S / st);
    const L = terrain.LI, push = (k, it) => (out[k] ||= []).push(it);
    const tint = (sp, x, z) => { const a = TINT[sp]; return new THREE.Color(a[(hash(x, z, 5) * a.length) | 0]).multiplyScalar(0.85 + hash(x, z, 6) * 0.3); };
    const tree = (sp, x, z, y, s) => push('tree', { sp, x, y, z, ry: hash(x, z, 7) * 6.28, s, color: tint(sp, x, z), col: 1 });
    if (CS_ON) { // countryside streamer draws the wild plants; the tile keeps the same trees / palms for its colliders only (cs: 1 = not drawn here)
      placeTrees({ terrain, data, roadDist: q.roadDist }, x0, z0, S, (r) => {
        if (q.inBuilding && q.inBuilding(r.x, r.z)) { csReject(r.x, r.z); return; }
        if (r.palm) push('palm', { x: r.x, y: r.y, z: r.z, ry: r.ry, s: r.s, real: 1, cs: 1 }); else push('tree', { sp: r.sp, x: r.x, y: r.y, z: r.z, ry: r.ry, s: r.s, color: tint(r.sp, r.x, r.z), cs: 1 });
      });
      yield;
    } else
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + hash(i + x0, j + z0, 1)) * st, z = z0 + (j + hash(i + x0, j + z0, 2)) * st;
        if (terrain.real(x, z) || data.isWater(x, z)) continue;
        const lay = terrain.layerAt(x, z), hr = hash(x, z, 3), y = terrain.heightAt(x, z);
        if (lay === L.base || lay === L.gravel || (lay === L.lawn && !terrain.isKeys(x, z))) continue;
        if (q.inBuilding && q.inBuilding(x, z)) continue;
        const rd = q.roadDist ? q.roadDist(x, z) : 99; if (rd < 1.5) continue;
        const shore = data.isWater(x + 6, z) || data.isWater(x - 6, z) || data.isWater(x, z + 6) || data.isWater(x, z - 6);
        const sc = 0.75 + hash(x, z, 4) * 0.55, col = new THREE.Color(1, 1, 1).multiplyScalar(0.82 + hr * 0.3);
        if (shore && (lay === L.marsh || ((terrain.isKeys(x, z) || data.zoneAt(x, z) === 'wilderness') && vnoise(x * 0.03, z * 0.03) > 0.45 && lay !== L.sand && lay !== L.damp))) { if (hr < 0.55 && rd > 4) tree('mangrove', x, z, y, 0.8 + hr * 0.6); continue; } // mangrove fringe
        if (lay === L.sawgrass) {
          if (vnoise(x * 0.011 + 5, z * 0.011) > 0.74 && rd > 6) { if (hr < 0.22) tree(hr < 0.08 ? 'cypress' : hr < 0.16 ? 'gumbo' : 'oak', x, z, y, 0.7 + hr * 2); else if (hr < 0.6) push('palmetto', { x, y, z, ry: hr * 40, s: sc, color: col }); continue; } // hammock / tree island
          if (hr < 0.86) push('sawgrass', { x, y, z, ry: hr * 40, s: sc, color: col });
        } else if (lay === L.marsh) { if (hr < 0.55) push('rush', { x, y, z, ry: hr * 40, s: sc, color: col }); else if (hr < 0.62 && rd > 4) tree('mangrove', x, z, y, 0.7 + hr * 0.5); }
        else if (lay === L.forest) { if (hr < 0.06 && rd > 5) tree(hr < 0.04 ? 'oak' : 'gumbo', x, z, y, 0.8 + hr * 6); else if (hr < 0.32) push('palmetto', { x, y, z, ry: hr * 40, s: sc, color: col }); }
        else if (lay === L.pine) { if (hr < 0.07 && rd > 5) tree('pine', x, z, y, 0.8 + hr * 4); else if (hr < 0.4) push('palmetto', { x, y, z, ry: hr * 40, s: sc, color: col }); }
        else if (lay === L.scrub || lay === L.meadow) { if (hr < 0.18) push('palmetto', { x, y, z, ry: hr * 40, s: sc * 0.9, color: col }); else if (hr < 0.34) push('rush', { x, y, z, ry: hr * 40, s: sc * 0.7, color: col }); else if (hr < 0.345 && rd > 6) tree('oak', x, z, y, 0.7 + hr); }
        else if (terrain.isKeys(x, z) && (lay === L.shell || lay === L.sand || lay === L.lawn)) { if (hr < 0.035 && rd > 4) tree('seagrape', x, z, y, 0.9 + hr * 8); else if (hr < 0.05 && rd > 5) push('palm', { x, y, z, ry: hr * 60, s: 0.8 + hr * 6, real: 1 }); else if (hr < 0.14) push('palmetto', { x, y, z, ry: hr * 40, s: sc * 0.8, color: col }); }
        else if (lay === L.sand && shore && hr < 0.25) push('oats', { x, y, z, ry: hr * 40, s: 0.8 + hr });
      }
      if ((j & 7) === 7) yield;
    }
    // groves: citrus in planted rows (7 m x 5 m), farmland: crop row segments on the furrow ridges (1.6 m period, matching the ground shader)
    for (let z = Math.ceil(z0 / 5) * 5; z < z0 + S; z += 5) {
      for (let x = Math.ceil(x0 / 7) * 7; x < x0 + S; x += 7) { if (terrain.real(x, z) || data.isWater(x, z) || terrain.layerAt(x, z) !== L.grove) continue; if (q.roadDist && q.roadDist(x, z) < 3) continue; const hr = hash(x, z, 9); if (hr < 0.04) continue; tree('citrus', x, z, terrain.heightAt(x, z), 0.85 + hr * 0.35); }
    }
    yield;
    for (let x = Math.ceil((x0 - 0.4) / 1.6) * 1.6 + 0.4; x < x0 + S; x += 1.6) {
      for (let z = Math.ceil(z0 / 5) * 5; z < z0 + S; z += 5) { if (terrain.layerAt(x, z) !== L.farm || data.isWater(x, z)) continue; if (vnoise(x * 0.008, z * 0.008 + 9) < 0.35) continue; if (q.roadDist && q.roadDist(x, z) < 3) continue; push('crop', { x, y: terrain.heightAt(x, z), z, ry: 0, s: 1, color: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + hash(x, z, 8) * 0.25) }); }
      if ((Math.round(x) & 15) === 0) yield;
    }
  }
  const models = await modelsP;
  return { countryside: CS_ON, models, G, T, VT, VG, SPECIES, TINT, barkMat, grassMat, fruitMat, leaf, leafDepth: M.leafDepth || null, scatter, materials: [barkMat, grassMat, fruitMat] };
}
