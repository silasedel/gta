// Everglades r7: cypress domes and strands. The signature Everglades silhouette: pond / bald cypress growing in round
// "domes" in the wet prairie (tallest in the middle, low at the rim) and in long strands along the sloughs; tall, straight
// pale trunks with a buttressed foot, cypress knees, open layered crowns of flat feathery sprays, Spanish moss
// (moss.js hangs it from game.everglades.parts.cypress.treesNear). Procedural geometry (4 tree shapes x 2 LODs:
// near < 230 m full sprays, far: fewer, bigger cards), instanced; dome / strand layout deterministic per 240 m cell,
// streamed within ~1.1 km. Trunk colliders (a small pool of cylinders) follow the player within ~60 m.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { snagTexture } from './textures.js';
import { hash2, vnoise } from './region.js';

const CELL = 240, R = 1100, NEAR = 230, MAX = 2600, COLS = 48;

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// flat feathery bald-cypress sprays on a card: a twig with alternate rows of fine needles, several twigs per card
function sprayTexture() {
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), r = rng(57);
  g.clearRect(0, 0, W, H); g.lineCap = 'round';
  // a loose oval cluster of sprays: denser and darker inside, light feathery tips at the rim
  for (let t = 0; t < 70; t++) {
    const rr = Math.sqrt(r()) * 0.42, an = r() * 6.283, x0 = W * (0.5 + Math.cos(an) * rr), y0 = H * (0.5 + Math.sin(an) * rr * 0.8);
    const a = an + (r() - 0.5) * 1.4, L = 26 + r() * 46, ca = Math.cos(a), sa = Math.sin(a), inner = 1 - rr / 0.42;
    const v = r(), k = 0.55 + 0.45 * (1 - inner * 0.6), col = [(70 + v * 45) * k, (104 + v * 40) * k, (40 + v * 22) * k];
    g.strokeStyle = `rgb(${col[0] * 0.65 | 0},${col[1] * 0.65 | 0},${col[2] * 0.6 | 0})`; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + ca * L, y0 + sa * L); g.stroke();
    g.strokeStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.lineWidth = 1.3;
    for (let s = 3; s < L; s += 2.4) { const px = x0 + ca * s, py = y0 + sa * s, nl = 4 + 5 * Math.sin((s / L) * Math.PI); for (const sd of [-1, 1]) { const na = a + sd * (1.1 + r() * 0.25); g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); g.stroke(); } }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function treeGeo(seed, far) {
  const r = rng(seed * 977 + 13), H = 1, parts = [], cards = [];
  // trunk (unit height; scaled per instance): flare at the foot, straight taper; uv v in meters / 4 at H = 18 m
  const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; let rad = 0.016 * (1 - t * 0.75) + 0.045 * Math.pow(Math.max(0, 1 - t / 0.1), 2.4); prof.push(new THREE.Vector2(rad, t * H)); }
  const trunk = new THREE.LatheGeometry(prof, far ? 5 : 8); { const p = trunk.attributes.position, uv = trunk.attributes.uv; const lobes = 4 + ((seed * 3) % 2);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.45 * Math.max(0, Math.cos(a * lobes + seed)) * Math.max(0, 1 - y / 0.08); p.setX(i, x * k); p.setZ(i, z * k); uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 4.5); } }
  trunk.setAttribute('aFol', new THREE.BufferAttribute(new Float32Array(trunk.attributes.position.count), 1)); parts.push(trunk);
  // branches: in the upper ~half, near horizontal, ending in spray clusters
  const nb = far ? 9 : 18 + ((r() * 7) | 0);
  for (let k = 0; k < nb; k++) {
    const t = 0.42 + (k / nb) * 0.55 + r() * 0.04, y = t * H, L = (0.09 + r() * 0.12) * (1.15 - t * 0.7), a = k * 2.4 + r() * 0.8, up = 0.12 + r() * 0.35;
    const dx = Math.cos(a), dz = Math.sin(a);
    if (!far) { const c = new THREE.CylinderGeometry(0.0025, 0.007, L, 4, 1); c.translate(0, L / 2, 0); c.rotateZ(-(Math.PI / 2 - up)); c.rotateY(-a); c.translate(0, y, 0); c.setAttribute('aFol', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count), 1)); parts.push(c); }
    // spray cards along the branch: flat-ish (horizontal sprays) + one tilted, sizes in tree heights
    const nc = far ? 2 : 6;
    for (let q = 0; q < nc; q++) {
      const s = (0.25 + (q / nc) * 0.85) * L, cx = dx * s * Math.cos(up), cy = y + s * Math.sin(up) + (r() - 0.3) * 0.02, cz = dz * s * Math.cos(up), w = (far ? 0.13 : 0.075) * (1.15 - t * 0.45) * (0.8 + r() * 0.4);
      const pl = new THREE.PlaneGeometry(w * 1.5, w, 1, 1); pl.rotateX(-Math.PI / 2 + (r() - 0.5) * 2.2); pl.rotateZ((r() - 0.5) * 1.2); pl.rotateY(-a + (r() - 0.5) * 2.5); pl.translate(cx + (r() - 0.5) * w * 0.5, cy, cz + (r() - 0.5) * w * 0.5);
      pl.setAttribute('aFol', new THREE.BufferAttribute(new Float32Array(4).fill(1), 1)); cards.push(pl);
    }
  }
  // a top tuft
  for (const tilt of [0.3, -1.1, 1.0]) { const pl = new THREE.PlaneGeometry(0.12, 0.08); pl.rotateX(-Math.PI / 2 + tilt); pl.rotateY(seed + tilt); pl.translate(0, H * 0.99, 0); pl.setAttribute('aFol', new THREE.BufferAttribute(new Float32Array(4).fill(1), 1)); cards.push(pl); }
  const ni = (g) => (g.index ? g.toNonIndexed() : g);
  const wood = mergeGeometries(parts.map(ni)); wood.computeVertexNormals();
  const fol = mergeGeometries(cards.map(ni)); { const n = fol.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 0.9, n.getZ(i) * 0.3); } // canopy-ish normals (soft, lit from above)
  return { wood, fol };
}

export function createCypress(game, G) {
  const scene = game.scene, uT = { value: 0 };
  const barkMat = new THREE.MeshStandardMaterial({ name: 'gl7CypBark', map: snagTexture(), color: 0xa59a8a, roughness: 0.93, metalness: 0 });
  const folMat = new THREE.MeshStandardMaterial({ name: 'gl7CypSpray', map: sprayTexture(), color: 0xffffff, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  folMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGlT; attribute float aFol;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = instanceMatrix[3][0] * 0.13 + instanceMatrix[3][2] * 0.17; float hy = position.y; transformed.x += sin(uGlT * 0.9 + ph + hy * 4.0) * 0.004 * hy; transformed.z += cos(uGlT * 0.7 + ph) * 0.003 * hy; }`);
    // per-instance tint: summer green / yellowing / a few winter-rust trees (instanceColor)
  };
  folMat.customProgramCacheKey = () => 'gl7-cyp-spray';
  const SH = 4, lods = [false, true].map((far) => Array.from({ length: SH }, (_, i) => treeGeo(i + 1, far)));
  const meshes = lods.map((L, li) => L.map((g, i) => {
    const w = new THREE.InstancedMesh(g.wood, barkMat, MAX), f = new THREE.InstancedMesh(g.fol, folMat, MAX);
    for (const m of [w, f]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.name = `gl7Cyp${li ? 'Far' : ''}${i}`; scene.add(m); }
    f.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    if (li) { w.castShadow = false; }
    return { w, f };
  }));
  // ---------- layout: domes (round, tallest in the middle) and strands (along sloughs)
  const cells = new Map(), all = [];
  function gen(ci, cj) {
    const out = [], x0 = ci * CELL, z0 = cj * CELL; if (!G.inGlades(x0 + CELL / 2, z0 + CELL / 2)) return out;
    const nd = hash2(ci, cj, 1) < 0.55 ? 1 + (hash2(ci, cj, 2) < 0.3 ? 1 : 0) : 0;
    for (let d = 0; d < nd; d++) {
      const cx = x0 + 40 + hash2(ci, cj, 3 + d) * (CELL - 80), cz = z0 + 40 + hash2(cj, ci, 5 + d) * (CELL - 80);
      if (G.isWater(cx, cz) || !G.wetLayer(cx, cz) || G.roadDist(cx, cz, 120) < 45) continue;
      const Rd = 22 + hash2(ci, d, cj) * 38, Hm = 17 + hash2(d, ci, cj) * 9, sp = 5.2;
      for (let gx = -Rd; gx <= Rd; gx += sp) for (let gz = -Rd; gz <= Rd; gz += sp) {
        const jx = gx + (hash2(gx * 7 + ci, gz * 5 + cj, 9) - 0.5) * sp * 0.9, jz = gz + (hash2(gz * 3 + cj, gx * 11 + ci, 10) - 0.5) * sp * 0.9;
        const rr = Math.hypot(jx, jz) / (Rd * (0.85 + 0.3 * vnoise((cx + jx) / 18, (cz + jz) / 18))); if (rr > 1) continue;
        const x = cx + jx, z = cz + jz; if (G.isWater(x, z) || G.roadDist(x, z, 20) < 9) continue;
        out.push(tree(x, z, Hm * (1 - rr * rr * 0.62) * (0.85 + hash2(x, z, 4) * 0.3)));
      }
    }
    // strands: single trees and pairs along the banks of the sloughs (land next to water)
    for (let k = 0; k < 14; k++) {
      const x = x0 + hash2(ci, cj, 40 + k) * CELL, z = z0 + hash2(cj, ci, 60 + k) * CELL; if (G.isWater(x, z) || hash2(ci, k, cj) > 0.55) continue;
      if (G.waterRing(x, z, 10) < 2 || G.roadDist(x, z, 20) < 9) continue;
      out.push(tree(x, z, 12 + hash2(k, cj, ci) * 10));
      if (hash2(k, ci, cj) < 0.4) { const a = hash2(cj, k, 3) * 6.28; out.push(tree(x + Math.cos(a) * 4.5, z + Math.sin(a) * 4.5, 10 + hash2(ci, cj, k) * 8)); }
    }
    return out;
  }
  function tree(x, z, H) {
    const v = hash2(x * 3.1, z * 1.7, 2), sh = (hash2(x, z, 7) * SH) | 0, rust = hash2(z, x, 8) < 0.07;
    const tint = rust ? [1.25, 0.72, 0.42] : [1.08 + v * 0.25, 1.18 + v * 0.12, 0.9 + v * 0.12];
    return { x, z, y: G.ground(x, z) - 0.25, H, sh, h: hash2(x, z, 11) * 6.28, w: 0.9 + hash2(z, x, 12) * 0.25, tint };
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const stats = { trees: 0, near: 0, cells: 0 };
  let lastX = 1e9, lastZ = 1e9, dirty = false;
  function rebuild(cam) {
    const cnt = lods.map(() => new Array(SH).fill(0)); all.length = 0; let nn = 0;
    for (const c of cells.values()) for (const t of c) {
      all.push(t); const d = Math.hypot(t.x - cam.x, t.z - cam.z), li = d < NEAR ? 0 : 1, M = meshes[li][t.sh], i = cnt[li][t.sh]; if (i >= MAX) continue;
      _q.setFromAxisAngle(UP, t.h); _s.set(t.H * t.w, t.H, t.H * t.w); _p.set(t.x, t.y, t.z); _m.compose(_p, _q, _s);
      _m.toArray(M.w.instanceMatrix.array, i * 16); _m.toArray(M.f.instanceMatrix.array, i * 16); M.f.instanceColor.array.set(t.tint, i * 3); cnt[li][t.sh]++; if (!li) nn++;
    }
    meshes.forEach((L, li) => L.forEach((M, i) => { M.w.count = M.f.count = cnt[li][i]; M.w.instanceMatrix.needsUpdate = M.f.instanceMatrix.needsUpdate = true; M.f.instanceColor.needsUpdate = true; }));
    stats.trees = all.length; stats.near = nn; lastX = cam.x; lastZ = cam.z;
  }
  // ---------- trunk colliders near the player (a fixed pool moved around)
  const pool = []; let colT = 0;
  function colliders(p) {
    const W = game.world, RP = game.RAPIER; if (!W || !RP) return;
    if (!pool.length) for (let i = 0; i < COLS; i++) { try { const b = W.createRigidBody(RP.RigidBodyDesc.fixed().setTranslation(0, -500 - i, 0)); W.createCollider(RP.ColliderDesc.cylinder(2.5, 0.35), b); pool.push(b); } catch (e) { return; } }
    const near = all.filter((t) => Math.abs(t.x - p.x) < 60 && Math.abs(t.z - p.z) < 60).sort((a, b) => (a.x - p.x) ** 2 + (a.z - p.z) ** 2 - (b.x - p.x) ** 2 - (b.z - p.z) ** 2);
    for (let i = 0; i < COLS; i++) { const t = near[i]; try { pool[i].setTranslation(t ? { x: t.x, y: t.y + 2.5, z: t.z } : { x: 0, y: -500 - i, z: 0 }, true); } catch (e) { /* */ } }
  }
  let scanT = 0;
  function update(dt, cam, active, player) {
    uT.value += dt;
    if ((colT -= dt) <= 0 && active && player) { colT = 0.7; colliders(player); }
    if ((scanT -= dt) > 0) return; scanT = 0.5;
    if (!active) { if (cells.size) { cells.clear(); dirty = true; } }
    else {
      const ci0 = Math.floor(cam.x / CELL), cj0 = Math.floor(cam.z / CELL), rc = Math.ceil(R / CELL); let built = 0;
      for (const k of cells.keys()) { const [i, j] = k.split(',').map(Number); if (Math.hypot((i + 0.5) * CELL - cam.x, (j + 0.5) * CELL - cam.z) > R + 200) { cells.delete(k); dirty = true; } }
      for (let dj = -rc; dj <= rc && built < 3; dj++) for (let di = -rc; di <= rc && built < 3; di++) { const ci = ci0 + di, cj = cj0 + dj, k = ci + ',' + cj; if (cells.has(k) || Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z) > R) continue; cells.set(k, gen(ci, cj)); built++; dirty = true; }
      stats.cells = cells.size;
    }
    if (dirty || Math.hypot(cam.x - lastX, cam.z - lastZ) > 40) { dirty = false; rebuild(cam); }
  }
  function treesNear(x, z, r) { const out = []; for (const t of all) if ((t.x - x) ** 2 + (t.z - z) ** 2 < r * r) out.push(t); return out; }
  return { update, stats, treesNear, meshes };
}
