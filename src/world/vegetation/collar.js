// (r2-veg) Trunk collars: every tree and palm near the camera sits in a soft patch of darker soil and leaf litter (drip line moisture,
// shed leaves), so a trunk grows out of the ground instead of standing on it. One instanced ground decal, rebuilt from the near-LOD
// trunks (bark materials of the library plants) within 70 m whenever the camera has moved 8 m. ?vegcollar=0 turns it off.
// (Nov 19, user: the patches under the trees read as flat 2D slop / holes in the ground) The decal is now a faint, ragged moisture
// stain only (no dark disc), and real 3D grass grows over it: instanced clumps of the photographed grass cards (Grass Cards 1-4
// atlas, grasscards.js) in a ring around each trunk on soil / lawn, tall and dense at the trunk, shorter and sparser outward, so
// the trunk base is hidden in grass and the patch fades into the ground with no edge. Each clump stands on the physics ground
// (the drawn triangles), bends in the shared wind, is dithered out by 34-44 m, casts no shadow; nothing grows on paving (tree
// grates), sand gets a few dry tufts, water none. 3 draw calls. ?basegrass=0 turns the grass off (A/B).
import * as THREE from 'three';
import { makeVegMaterial } from './materials.js';
import { grassCardMap, clumpCard, bladeCards, stripCard } from './grasscards.js';
import { gmVeg } from '../ground/surfaceMask.js';

const ON = typeof location === 'undefined' || !/[?&]vegcollar=0\b/.test(location.search);
const GRASS = typeof location === 'undefined' || !/[?&]basegrass=0\b/.test(location.search);
const MAX = 700, R = 70, R_GRASS = 46, MAXG = 5200;
const HARD = /asphalt|sidewalk|concrete|pavers|tile|building|pier|wood|deck|parking|plaza|promenade/;

function collarTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), im = g.createImageData(S, S), D = im.data;
  let st = 1234567; const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
  const nz = new Float32Array(16 * 16); for (let i = 0; i < nz.length; i++) nz[i] = rnd();
  const vn = (u, v) => { const x = (u * 0.5 + 0.5) * 15, y = (v * 0.5 + 0.5) * 15, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = nz[j * 16 + i], b = nz[j * 16 + Math.min(15, i + 1)], c = nz[Math.min(15, j + 1) * 16 + i], d = nz[Math.min(15, j + 1) * 16 + Math.min(15, i + 1)]; return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
    const edge = 0.62 + 0.16 * Math.sin(a * 3 + 1.3) + 0.08 * Math.sin(a * 7 + 0.4) + 0.18 * (vn(u, v) - 0.5); // ragged, never a disc
    const t = Math.max(0, Math.min(1, 1 - r / edge)), al = t * t * (3 - 2 * t) * (0.32 + 0.22 * vn(-v, u)), i = (y * S + x) * 4, n = rnd();
    D[i] = 92 + n * 20; D[i + 1] = 80 + n * 14; D[i + 2] = 58 + n * 10; D[i + 3] = al * 255; // faint moist soil stain (blends into any ground)
  }
  g.putImageData(im, 0, 0);
  for (let k = 0; k < 160; k++) { // shed leaf / frond bits
    const r = Math.pow(rnd(), 0.7) * 0.6, a = rnd() * 6.283, x = S / 2 + Math.cos(a) * r * S / 2, y = S / 2 + Math.sin(a) * r * S / 2;
    const c = rnd() < 0.6 ? [150 + rnd() * 40, 118 + rnd() * 30, 70 + rnd() * 20] : [96 + rnd() * 20, 100 + rnd() * 20, 52 + rnd() * 14];
    g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.35 + rnd() * 0.3})`; g.save(); g.translate(x, y); g.rotate(rnd() * 3.14); g.fillRect(-1.5 - rnd() * 2, -0.6, 3 + rnd() * 3, 1.3); g.restore();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; return tex;
}

const hsh = (x, z, k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };

export function createCollars(game, groundAt) {
  if (!ON || typeof document === 'undefined') return null;
  const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: collarTexture(), transparent: true, depthWrite: false, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const im = new THREE.InstancedMesh(geo, mat, MAX); im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; im.name = 'vegCollars'; im.renderOrder = -1;
  game.scene.add(im);
  // ---- 3D base grass ----
  let G = null;
  if (GRASS) {
    const gm = makeVegMaterial('leaf', { map: grassCardMap(game.renderer), lean: 0.03, sway: 0.04, wear: 0.15, transl: 0.65, alphaTest: 0.4, tint: 0.85, fade: [0, 0, 34, 44] });
    gmVeg(gm.mat, { edge: true }); // nothing on paving / under cars (shared ground mask)
    const protos = [clumpCard(3, { h: 0.42 }).leaf, bladeCards(5, { n: 9, r: 0.13, h: 0.36, w: 0.028 }).leaf, stripCard(7, { h: 0.24, w: 0.5 }).leaf, clumpCard(11, { h: 0.3 }).leaf];
    const meshes = protos.map((g, k) => { const m = new THREE.InstancedMesh(g, gm.mat, MAXG); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.name = 'vegBaseGrass' + k; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXG * 3), 3); game.scene.add(m); return m; });
    G = { meshes, cache: new Map() };
  }
  const down = (x, y0, z, len) => { const f = game.vegGround?.down; return f ? f(x, y0, z, len) : NaN; };
  const isW = (x, z) => { try { return !!game.city?.isWater?.(x, z); } catch (e) { return false; } };
  const surf = (x, z) => { try { return String(game.city?.surfaceAt?.(x, z) || ''); } catch (e) { return ''; } };
  // clumps of one trunk (world-stable, cached): Float32Array [proto, x, y, z, ry, sx, sy, r, g, b] * n, or null while physics streams in
  function trunkGrass(x, y, z, s, palm) {
    const k = Math.round(x * 4) + ',' + Math.round(z * 4); let e = G.cache.get(k); if (e !== undefined) return e;
    const sf = surf(x, z); if (HARD.test(sf) || isW(x, z)) { G.cache.set(k, (e = new Float32Array(0))); return e; }
    const g0 = down(x, y + 1.2, z, 2.6); if (!Number.isFinite(g0)) return null;
    const sandy = /sand|beach|shell/.test(sf), dry = sandy ? 0.85 : 0.25 + 0.3 * hsh(x, z, 9);
    const r0 = (palm ? 0.22 : 0.3) * Math.max(0.7, s), r1 = (palm ? 1.05 : 1.35) * Math.min(1.5, Math.max(0.8, s)), n = Math.round((sandy ? 6 : 15) * Math.min(1.4, Math.max(0.8, s)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + hsh(x, z, i) * 0.9, t = Math.pow(hsh(z, x, i + 3), 0.85), rr = r0 + (r1 - r0) * t;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; if (isW(px, pz)) continue;
      let gy = down(px, g0 + 0.5, pz, 1.3); if (!Number.isFinite(gy)) gy = g0; if (Math.abs(gy - g0) > 0.4) continue; // a curb / wall edge: no clump hanging over it
      const h = (1.15 - 0.6 * t) * (0.75 + 0.5 * hsh(px, pz, 4)), w = 0.8 + 0.5 * hsh(pz, px, 5); // tall at the trunk, short outward: soft blend
      const proto = t < 0.35 ? (hsh(px, pz, 6) < 0.5 ? 0 : 1) : t < 0.75 ? (hsh(px, pz, 7) < 0.4 ? 1 : 3) : 2;
      const v = 0.8 + 0.3 * hsh(px, pz, 8), dr = Math.min(1, dry + (hsh(px, pz, 10) - 0.5) * 0.3); // per-clump color: green lawn -> straw
      out.push(proto, px, gy - 0.02, pz, hsh(px, pz, 2) * 6.283, w, h, v * (0.78 + 0.32 * dr), v * (0.95 - 0.08 * dr), v * (0.62 + 0.1 * dr));
    }
    e = new Float32Array(out); if (G.cache.size > 3000) G.cache.clear(); G.cache.set(k, e); return e;
  }
  const last = new THREE.Vector3(1e9, 0, 0), m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), out = new THREE.Matrix4(), e = new THREE.Euler();
  let t = 0, retry = false;
  const stats = { trunks: 0, clumps: 0, ms: 0 };
  function rebuild(cam) {
    const t0 = performance.now(), seen = new Set(), list = [];
    game.scene.traverse((o) => { if (!o.isInstancedMesh || !o.visible || !o.count || o === im) return; const vg = o.material?.userData?.veg; if (!vg || vg.family !== 'bark') return;
      const f = vg.u?.uFade?.value; if (f && f.y > 0) return; // near LOD only
      const cls = o.material.userData.vegCls; if (cls === 'shrub') return;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); p.setFromMatrixPosition(m); const d2 = (p.x - cam.position.x) ** 2 + (p.z - cam.position.z) ** 2; if (d2 > R * R) continue;
        const k = Math.round(p.x * 2) + ',' + Math.round(p.z * 2); if (seen.has(k)) continue; seen.add(k); m.decompose(new THREE.Vector3(), q, sc); if (sc.x < 1e-3) continue; /* dropped by the ground pass */ list.push([p.x, p.z, sc.x, d2, p.y, cls === 'palm' || /palm/.test(o.material.userData.vegKey || '')]); } });
    list.sort((a, b) => a[3] - b[3]); let n = 0;
    for (const [x, z, s] of list) { if (n >= MAX) break; const g = groundAt(x, z); if (!Number.isFinite(g)) continue; if (game.city?.isWater?.(x, z)) continue;
      const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1, rr = (0.95 + h * 0.5) * Math.min(1.5, Math.max(0.7, s));
      e.set(0, h * 6.283, 0); q.setFromEuler(e); sc.set(rr, 1, rr * (0.85 + h * 0.3)); out.compose(p.set(x, g + 0.025, z), q, sc); im.setMatrixAt(n++, out); }
    im.count = n; im.instanceMatrix.needsUpdate = true;
    if (G) { const cnt = G.meshes.map(() => 0); retry = false; let nt = 0;
      for (const [x, z, s, d2, y, palm] of list) { if (d2 > R_GRASS * R_GRASS) break; const c = trunkGrass(x, y, z, s, palm); if (!c) { retry = true; continue; } if (c.length) nt++;
        for (let i = 0; i < c.length; i += 10) { const k = c[i], M = G.meshes[k]; if (cnt[k] >= MAXG) continue; e.set(0, c[i + 4], 0); q.setFromEuler(e); sc.set(c[i + 5], c[i + 6], c[i + 5]); out.compose(p.set(c[i + 1], c[i + 2], c[i + 3]), q, sc);
          M.setMatrixAt(cnt[k], out); M.instanceColor.setXYZ(cnt[k], c[i + 7], c[i + 8], c[i + 9]); cnt[k]++; } }
      G.meshes.forEach((M, k) => { M.count = cnt[k]; M.visible = cnt[k] > 0; M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; });
      stats.trunks = nt; stats.clumps = cnt.reduce((a, b) => a + b, 0); }
    stats.ms = +(performance.now() - t0).toFixed(2);
  }
  return { mesh: im, grass: G, stats, update(dt, cam) { t += dt || 0; if (!cam || t < 0.5) return; if (cam.position.distanceToSquared(last) < 64 && t < (retry ? 1.5 : 5)) return; t = 0; /* moved 8 m (at most twice a second), or every 5 s while plants stream in */ last.copy(cam.position); try { rebuild(cam); } catch (e2) { /* decals only */ } } };
}
