// Everglades r7: dead snags (bleached bald-cypress trunks, broken tops, a few bare limbs) and cypress knees in the
// shallows and on the wet prairie; drowned stumps along the sloughs. Procedural (3 snag shapes + knees), instanced,
// deterministic per 50 m cell, streamed within ~600 m (snags are tall silhouettes that read far).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { snagTexture } from './textures.js';
import { hash2, vnoise } from './region.js';

const CELL = 50, R = 600, MAX = 900;

function snagGeo(seed) {
  const r = (k) => hash2(seed, k, 17), H = 6 + r(1) * 7, parts = [];
  // trunk: buttressed foot (bald cypress flare), straight taper, ragged broken top
  const prof = []; const n = 14;
  for (let i = 0; i <= n; i++) { const t = i / n, y = t * H; let rad = 0.26 + 0.14 * (1 - t); rad += 0.55 * Math.pow(Math.max(0, 1 - y / 1.6), 2.2); if (i === n) rad *= 0.5; prof.push(new THREE.Vector2(rad, y)); }
  const trunk = new THREE.LatheGeometry(prof, 9); { const uv = trunk.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * H / 4); }
  // buttress ribs: push the foot out in 4-5 lobes
  { const p = trunk.attributes.position; const lobes = 4 + ((r(2) * 2) | 0); for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.35 * Math.max(0, Math.cos(a * lobes + r(3) * 6)) * Math.max(0, 1 - y / 1.4); p.setX(i, x * k); p.setZ(i, z * k); } }
  parts.push(trunk);
  const limbs = 2 + ((r(4) * 4) | 0);
  for (let k = 0; k < limbs; k++) {
    const y = H * (0.45 + r(10 + k) * 0.45), L = 0.8 + r(20 + k) * 2.6, a = r(30 + k) * 6.28, up = 0.25 + r(40 + k) * 0.7;
    const c = new THREE.CylinderGeometry(0.05, 0.13, L, 5, 1); c.translate(0, L / 2, 0); c.rotateZ(-(Math.PI / 2 - up)); c.rotateY(a); c.translate(0, y, 0);
    { const uv = c.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * L / 4 + 0.3); } parts.push(c);
  }
  const g = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p)); g.computeVertexNormals(); g.userData.H = H; return g;
}
function kneesGeo() {
  const parts = []; for (let k = 0; k < 6; k++) { const h = 0.25 + hash2(k, 3, 9) * 0.45, c = new THREE.ConeGeometry(0.07 + hash2(k, 5, 1) * 0.06, h, 6); c.translate(Math.cos(k * 1.9) * (0.3 + k * 0.18), h / 2, Math.sin(k * 1.9) * (0.3 + k * 0.18)); parts.push(c); }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed())); g.computeVertexNormals(); return g;
}

export function createSnags(game, G) {
  const map = snagTexture();
  const mat = new THREE.MeshStandardMaterial({ name: 'gl7Snag', map, color: 0xe2ddd2, roughness: 0.92, metalness: 0 });
  const kneeMat = new THREE.MeshStandardMaterial({ name: 'gl7Knee', map, color: 0x7d7262, roughness: 0.95, metalness: 0 });
  const geos = [snagGeo(1), snagGeo(2), snagGeo(3), snagGeo(4)];
  const meshes = geos.map((g, i) => { const m = new THREE.InstancedMesh(g, mat, MAX); m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.name = 'gl7Snag' + i; game.scene.add(m); return m; });
  const knees = new THREE.InstancedMesh(kneesGeo(), kneeMat, MAX * 2); knees.count = 0; knees.castShadow = false; knees.receiveShadow = true; knees.frustumCulled = false; knees.name = 'gl7Knees'; game.scene.add(knees);
  const cells = new Map(), stats = { snags: 0, knees: 0 };
  function gen(ci, cj) {
    const out = [], x0 = ci * CELL, z0 = cj * CELL; if (!G.inGlades(x0 + CELL / 2, z0 + CELL / 2)) return out;
    const dens = vnoise(x0 / 260 + 5, z0 / 260 - 2); // snag stands: drowned patches, burn scars
    for (let k = 0; k < 4; k++) {
      const x = x0 + hash2(ci, cj, k + 1) * CELL, z = z0 + hash2(cj, ci, k + 7) * CELL, r = hash2(ci, k, cj);
      const water = G.isWater(x, z), wet = !water && G.wetLayer(x, z);
      if (!water && !wet) continue;
      if (G.roadDist(x, z, 20) < 8) continue;
      if (water && G.waterRing(x, z, 14) === 8 && r > 0.25) continue; // open water: mostly near banks
      const p = dens * (water ? 0.16 : 0.05); if (r > p) { if (r < p + 0.3 && water) out.push({ knee: true, x, z, y: G.SEA - 0.1, h: r * 40, s: 0.8 + r }); continue; }
      out.push({ v: (hash2(k, ci, cj) * 4) | 0, x, z, y: (water ? G.SEA - 0.5 : G.ground(x, z) - 0.15), h: hash2(ci + k, cj, 3) * 6.28, s: 0.7 + hash2(cj, ci + k, 5) * 0.6, lean: (hash2(k, cj, ci) - 0.5) * 0.14 });
    }
    return out;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  function rebuild() {
    const cnt = meshes.map(() => 0); let kn = 0;
    for (const c of cells.values()) for (const s of c) {
      if (s.knee) { if (kn >= MAX * 2) continue; _q.setFromEuler(_e.set(0, s.h, 0)); _s.setScalar(s.s); _p.set(s.x, s.y, s.z); _m.compose(_p, _q, _s); _m.toArray(knees.instanceMatrix.array, kn * 16); kn++; continue; }
      const m = meshes[s.v], i = cnt[s.v]; if (i >= MAX) continue;
      _q.setFromEuler(_e.set(s.lean, s.h, s.lean * 0.6)); _s.set(s.s, s.s * (0.85 + (s.h % 0.3)), s.s); _p.set(s.x, s.y, s.z); _m.compose(_p, _q, _s); _m.toArray(m.instanceMatrix.array, i * 16); cnt[s.v]++;
    }
    meshes.forEach((m, i) => { m.count = cnt[i]; m.instanceMatrix.needsUpdate = true; }); knees.count = kn; knees.instanceMatrix.needsUpdate = true;
    stats.snags = cnt.reduce((a, b) => a + b, 0); stats.knees = kn;
  }
  let scanT = 0, dirty = false;
  function update(dt, cam, active) {
    if ((scanT -= dt) > 0) return; scanT = 0.6;
    if (!active) { if (cells.size) { cells.clear(); rebuild(); } return; }
    const ci0 = Math.floor(cam.x / CELL), cj0 = Math.floor(cam.z / CELL), rc = Math.ceil(R / CELL); let built = 0;
    for (const [k, c] of cells) { const [i, j] = k.split(',').map(Number); if (Math.hypot((i + 0.5) * CELL - cam.x, (j + 0.5) * CELL - cam.z) > R + 120) { cells.delete(k); dirty = true; } void c; }
    for (let dj = -rc; dj <= rc && built < 40; dj++) for (let di = -rc; di <= rc && built < 40; di++) {
      const ci = ci0 + di, cj = cj0 + dj, k = ci + ',' + cj; if (cells.has(k)) continue; if (Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z) > R) continue;
      cells.set(k, gen(ci, cj)); built++; dirty = true;
    }
    if (dirty) { dirty = false; rebuild(); }
  }
  return { update, stats, meshes };
}
