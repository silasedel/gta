// V2 terrain: textured, height-displaced land-cover ground for the synthetic world (everything outside the real-Miami rectangle).
// One material draws every natural cover class from a sampler2DArray of Poly Haven PBR sets (albedo+roughness, normal+AO);
// each triangle carries the three cover layers of its corners and blends them per pixel (height-weighted barycentrics), so a
// tile stays one draw call and class borders are soft. The same height samples feed the Rapier trimesh (render == collider).
import * as THREE from 'three';
import { loadArray, loadSet, setParams } from '../city/pbr.js';

// key, Poly Haven set, uv scale (1 / meters per repeat), tint, wet (standing water amount), rows (farm furrows), macro variation
export const LAYERS = [
  { key: 'lawn', name: 'leafy_grass', scale: 1 / 4.5, tint: 0xeef4dc },
  { key: 'scrub', name: 'sparse_grass', scale: 1 / 6, tint: 0xeef0d2, level: 0.42 },
  { key: 'forest', name: 'forest_leaves_02', scale: 1 / 5, tint: 0xd8d4c8 },
  { key: 'pine', name: 'forest_ground_04', scale: 1 / 5, tint: 0xe6dccb },
  { key: 'sawgrass', name: 'sparse_grass', scale: 1 / 5, tint: 0xe6d49a, wet: 0.55, level: 0.4 },
  { key: 'marsh', name: 'brown_mud', scale: 1 / 4, tint: 0xb8b49a, wet: 1 },
  { key: 'sand', name: 'coast_sand_01', scale: 1 / 4, tint: 0xfff6e6 },
  { key: 'shell', name: 'coral_gravel', scale: 1 / 2.5, tint: 0xf4efe4, level: 0.62 },
  { key: 'dirt', name: 'dirt', scale: 1 / 5, tint: 0xe8dccb },
  { key: 'farm', name: 'brown_mud', scale: 1 / 3, tint: 0xc0a080, rows: 1 },
  { key: 'grove', name: 'grass_path_2', scale: 1 / 5, tint: 0xe4ecc8 },
  { key: 'rock', name: 'rocky_gravel', scale: 1 / 4, tint: 0xe6e0d4 },
  { key: 'gravel', name: 'gravel_floor', scale: 1 / 3, tint: 0xf0ebe0 },
  { key: 'damp', name: 'damp_sand', scale: 1 / 4, tint: 0xf0e6d2, wet: 0.25 },
  { key: 'base', name: 'sandy_gravel', scale: 1 / 4, tint: 0xe8e2d6 },
  { key: 'meadow', name: 'aerial_grass_rock', scale: 1 / 14, tint: 0xe6ecd0 },
];
const LI = Object.fromEntries(LAYERS.map((l, i) => [l.key, i]));
const CLS = {
  park: 'lawn', grass: 'lawn', garden: 'lawn', cemetery: 'lawn', golf: 'lawn', pitch: 'lawn', playground: 'lawn',
  wild: 'scrub', scrub: 'scrub', forest: 'forest', pine: 'pine', sawgrass: 'sawgrass', wetland: 'marsh', mangrove: 'marsh',
  sand: 'sand', dune: 'sand', island: 'sand', dirt: 'dirt', construction: 'dirt', farmland: 'farm', grove: 'grove',
  rock: 'rock', gravel: 'gravel', campground: 'base', parking: 'base', plaza: 'base', paved: 'base', apron: 'lawn',
  runway: 'lawn', taxiway: 'lawn', marina: 'base', pool: 'base',
};
export const LAYER_INDEX = LI;

const hash2 = (x, z) => { let h = Math.imul((x * 73856093) ^ (z * 19349663), 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
// cheap value noise (same family as the shader's) for CPU-side patchiness
export function vnoise(x, z) { const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }

export async function createTerrain(renderer, data, opts = {}) {
  const T = data.tileSize || 200, WATER_Y = -0.55, Y_OFF = -0.02;
  const arr = await loadArray(renderer, LAYERS.map((l) => ({ key: l.key, name: l.name, level: l.level })), { size: 512 });
  const uLay = LAYERS.map((l) => new THREE.Vector4(l.scale, l.wet || 0, l.rows || 0, 1));
  const uTint = LAYERS.map((l) => new THREE.Color(l.tint ?? 0xffffff));
  const N = LAYERS.length;
  const real = (x, z) => (data.inRealMiami ? data.inRealMiami(x, z) : false);
  // the Keys: data-driven (layout places whose kind or name says key), cached on a 64 m grid; no hard-coded coordinates
  const keyPlaces = (data.places || []).filter((p) => /key/i.test(p.kind || '') || /\bkeys?\b/i.test(p.name || '')).map((p) => [p.x, p.z, Math.max(400, p.r || 800)]);
  const keyCache = new Map();
  const isKeys = (x, z) => { const k = Math.floor(x / 64) * 100003 + Math.floor(z / 64); let v = keyCache.get(k); if (v === undefined) { v = keyPlaces.some(([px, pz, r]) => (px - x) ** 2 + (pz - z) ** 2 < r * r); if (keyCache.size > 200000) keyCache.clear(); keyCache.set(k, v); } return v; };

  function patch(mat, lod) {
    mat.customProgramCacheKey = () => 'ps-terrain-' + (lod ? 'lod' : 'near');
    mat.onBeforeCompile = (sh) => {
      if (lod && opts.nearCut) opts.nearCut(sh);
      Object.assign(sh.uniforms, { tTCol: { value: arr.colR }, tTNrm: { value: arr.nrmAO }, uLay: { value: uLay }, uTint: { value: uTint } });
      sh.vertexShader = 'attribute vec3 aL;\nvarying vec3 vL;\nvarying vec3 vBary;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
        vL = aL; int tid = gl_VertexID % 3; vBary = vec3(tid == 0 ? 1.0 : 0.0, tid == 1 ? 1.0 : 0.0, tid == 2 ? 1.0 : 0.0);
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);`);
      sh.fragmentShader = `precision highp sampler2DArray;
uniform sampler2DArray tTCol; uniform sampler2DArray tTNrm; uniform vec4 uLay[${N}]; uniform vec3 uTint[${N}];
varying vec3 vL; varying vec3 vBary; varying vec3 vWP; varying vec3 vWN;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 tp = vWP.xz;
          float n1 = tNoise(tp * 0.011), n2 = tNoise(tp * 0.067 + 3.1), n3 = tNoise(tp * 0.29 + 7.7);
          vec4 tcA[3]; vec4 tnA[3]; float tw[3]; float twet[3]; float trow[3];
          for (int i = 0; i < 3; i++) {
            float Lf = floor(vL[i] + 0.5); int L = int(Lf); vec4 P = uLay[L];
            vec2 uv = tp * P.x;
            vec4 c0 = texture(tTCol, vec3(uv, Lf));
            vec4 c1 = texture(tTCol, vec3(uv * 0.23 + vec2(0.31, 0.71), Lf)); // second, rotated-scale sample kills visible tiling
            vec4 c = mix(c0, c1, 0.25 + 0.3 * n2); c.rgb *= uTint[L];
            tcA[i] = c; tnA[i] = texture(tTNrm, vec3(uv, Lf));
            tw[i] = vBary[i] + dot(c0.rgb, vec3(0.333)) * 0.45 + n3 * 0.2 * vBary[i];
            twet[i] = P.y; trow[i] = P.z;
          }
          float tmx = max(tw[0], max(tw[1], tw[2])) - 0.2;
          vec3 tW = vec3(max(tw[0] - tmx, 0.0), max(tw[1] - tmx, 0.0), max(tw[2] - tmx, 0.0)); tW /= max(1e-4, tW.x + tW.y + tW.z);
          vec4 tCol = tcA[0] * tW.x + tcA[1] * tW.y + tcA[2] * tW.z;
          vec4 tNr = tnA[0] * tW.x + tnA[1] * tW.y + tnA[2] * tW.z;
          float wetK = twet[0] * tW.x + twet[1] * tW.y + twet[2] * tW.z, rowK = trow[0] * tW.x + trow[1] * tW.y + trow[2] * tW.z;
          vec3 alb = tCol.rgb * mix(0.8, 1.12, n1) * mix(0.92, 1.06, n2);
          alb = mix(alb, alb * vec3(1.1, 1.0, 0.76), smoothstep(0.55, 0.9, n1) * 0.45); // sun-bleached, drier patches
          if (rowK > 0.01) { float fr = 0.5 + 0.5 * sin(tp.x * 3.927); alb *= mix(1.0, mix(0.6, 1.1, fr), rowK); }
          float tRough = tCol.a;
          float pud = wetK * smoothstep(0.5, 0.58, n2 * 0.6 + n3 * 0.4); // standing water in marsh / mangrove mud
          alb = mix(alb, alb * 0.18 + vec3(0.012, 0.02, 0.018), pud); tRough = mix(tRough, 0.05, pud);
          tRough = mix(tRough, tRough * 0.75, wetK * 0.5);
          diffuseColor.rgb *= alb * mix(1.0, tNr.b, 0.7);`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(tRough, 0.04, 1.0);')
        .replace('#include <normal_fragment_maps>', `{
          vec3 tnm = vec3(tNr.xy * 2.0 - 1.0, 0.0); tnm.xy *= (1.0 - pud) * 1.15; tnm.z = sqrt(max(0.0, 1.0 - dot(tnm.xy, tnm.xy)));
          if (rowK > 0.01) tnm.x += cos(tp.x * 3.927) * 0.35 * rowK;
          vec3 Nw = normalize(vWN), Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x), Bw = normalize(cross(Nw, Tw));
          if (Bw.z < 0.0) Bw = -Bw;
          normal = normalize((viewMatrix * vec4(normalize(Tw * tnm.x + Bw * tnm.y + Nw * tnm.z), 0.0)).xyz);
        }`);
    };
    return mat;
  }
  const nearMat = patch(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), false); nearMat.name = 'terrain'; nearMat.userData.pbr = true;
  const lodMat = patch(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), true); lodMat.name = 'terrain-lod'; lodMat.userData.pbr = true;

  // hard airport / service surfaces (polygons drawn above the terrain)
  const mk = async (name, o) => { const s = await loadSet(renderer, name); for (const t of [s.map, s.normalMap, s.arm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.needsUpdate = true; }
    const m = new THREE.MeshStandardMaterial(setParams(s, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -5, ...o })); m.userData.pbr = true; return m; };
  const [runway, apron, taxiway] = await Promise.all([mk('clean_asphalt', { color: 0xc4c4c4 }), mk('hangar_concrete_floor', { color: 0xe8e6e0 }), mk('asphalt_04', { color: 0xbdbdbd })]);
  const surfaces = { runway, apron, taxiway };

  // ---- cover -> layer ----
  function layerAt(x, z) {
    const cls = data.coverAt ? data.coverAt(x, z) : 'none';
    let k = CLS[cls];
    if (!k) { // unclassified land: by zone / region, broken into patches
      const zn = data.zoneAt ? data.zoneAt(x, z) : '', nz = vnoise(x * 0.02, z * 0.02);
      if (isKeys(x, z)) k = nz < 0.5 ? 'shell' : nz < 0.78 ? 'lawn' : 'sand'; // Keys: crushed shell, mown green, sand
      else if (zn === 'airport') k = 'lawn';
      else if (zn === 'wilderness') k = nz < 0.6 ? 'scrub' : 'meadow';
      else if (zn === 'rural') k = nz < 0.55 ? 'meadow' : nz < 0.8 ? 'scrub' : 'dirt';
      else k = nz < 0.75 ? 'lawn' : 'scrub';
    }
    // shoreline: a few meters of beach sand on open coast, mud on marsh / mangrove banks
    if (data.isWater && k !== 'marsh') for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) if (data.isWater(x + dx, z + dz)) {
      const wk = data.waterKindAt ? data.waterKindAt(x + dx, z + dz) : 'sea';
      k = wk === 'sea' ? (k === 'sawgrass' || k === 'forest' ? 'marsh' : isKeys(x, z) && vnoise(x * 0.05, z * 0.05) < 0.4 ? 'damp' : 'sand') : wk === 'lake' ? 'damp' : k === 'lawn' || k === 'forest' || k === 'pine' ? k : 'marsh'; break; // canal / pond / river banks: mud and grass, not beach
    }
    return LI[k];
  }
  const heightAt = (x, z) => (data.isWater && data.isWater(x, z) ? WATER_Y : (data.terrainHeightAt ? data.terrainHeightAt(x, z) : 0) + Y_OFF);

  // ---- grid builder (generator: yields every few rows so the streamer stays inside its frame budget) ----
  // returns { geometry, coll: Float32Array (triangle soup, same vertices) } ; skips triangles that are all water or all real Miami
  function* gridGen(x0, z0, x1, z1, cell, o = {}) {
    const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell)), W = nx + 3;
    const H = new Float32Array(W * (nz + 3)), Lr = new Uint8Array(W * (nz + 3)), Wt = new Uint8Array(W * (nz + 3)), Rl = new Uint8Array(W * (nz + 3));
    for (let j = -1; j <= nz + 1; j++) {
      for (let i = -1; i <= nx + 1; i++) { const x = x0 + i * cell, z = z0 + j * cell, k = (j + 1) * W + i + 1;
        const w = data.isWater ? data.isWater(x, z) : false; Wt[k] = w ? 1 : 0; H[k] = heightAt(x, z);
        if (i >= 0 && j >= 0 && i <= nx && j <= nz) { Rl[k] = real(x, z) ? 1 : 0; Lr[k] = w ? LI.marsh : layerAt(x, z); } }
      if ((j & 7) === 7) yield;
    }
    const at = (i, j) => (j + 1) * W + i + 1;
    const P = [], Nn = [], A = [], TL = o.lod ? [] : null;
    const nrm = (i, j) => { const hx = H[at(i + 1, j)] - H[at(i - 1, j)], hz = H[at(i, j + 1)] - H[at(i, j - 1)]; const nxv = -hx / (2 * cell), nzv = -hz / (2 * cell), l = Math.hypot(nxv, 1, nzv); return [nxv / l, 1 / l, nzv / l]; };
    const vtx = (i, j, L) => { const k = at(i, j), n = nrm(i, j); P.push(x0 + i * cell, H[k], z0 + j * cell); Nn.push(n[0], n[1], n[2]); A.push(L[0], L[1], L[2]); };
    const tri = (a, b, c) => { // a,b,c = [i, j]; counter-clockwise seen from above (+Y normal)
      const ka = at(a[0], a[1]), kb = at(b[0], b[1]), kc = at(c[0], c[1]);
      if (Wt[ka] && Wt[kb] && Wt[kc]) return; if (Rl[ka] && Rl[kb] && Rl[kc]) return;
      const L = [Lr[ka], Lr[kb], Lr[kc]]; vtx(a[0], a[1], L); vtx(b[0], b[1], L); vtx(c[0], c[1], L);
      if (TL) { const cx = x0 + (a[0] + b[0] + c[0]) / 3 * cell, cz = z0 + (a[1] + b[1] + c[1]) / 3 * cell, tx = Math.floor(cx / T), tz = Math.floor(cz / T); for (let q = 0; q < 3; q++) TL.push(tx, tz); }
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = [i, j], b = [i + 1, j], c = [i + 1, j + 1], d = [i, j + 1];
        if ((i + j) & 1) { tri(a, d, c); tri(a, c, b); } else { tri(a, d, b); tri(b, d, c); }
      }
      if ((j & 15) === 15) yield;
    }
    const nColl = P.length;
    if (o.skirt) { // vertical skirt along the tile border hides cracks against the coarser mid-LOD terrain next door
      const S = o.skirt, edge = (i0, j0, i1, j1) => { const ka = at(i0, j0), kb = at(i1, j1); if (Wt[ka] && Wt[kb]) return; if (Rl[ka] && Rl[kb]) return;
        const xa = x0 + i0 * cell, za = z0 + j0 * cell, xb = x0 + i1 * cell, zb = z0 + j1 * cell, ya = H[ka], yb = H[kb], L = [Lr[ka], Lr[kb], Lr[ka]];
        for (const [x, y, z] of [[xa, ya, za], [xa, ya - S, za], [xb, yb, zb], [xb, yb, zb], [xa, ya - S, za], [xb, yb - S, zb]]) { P.push(x, y, z); Nn.push(0, 1, 0); A.push(L[0], L[1], L[2]); } };
      for (let i = 0; i < nx; i++) { edge(i, 0, i + 1, 0); edge(i + 1, nz, i, nz); }
      for (let j = 0; j < nz; j++) { edge(nx, j, nx, j + 1); edge(0, j + 1, 0, j); }
    }
    if (!P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('aL', new THREE.Float32BufferAttribute(A, 3));
    if (TL) g.setAttribute('aTile', new THREE.Float32BufferAttribute(TL, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return { geometry: g, coll: o.coll ? new Float32Array(P.slice(0, nColl)) : null };
  }
  function grid(x0, z0, x1, z1, cell, o) { const it = gridGen(x0, z0, x1, z1, cell, o); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
  const tileHasLand = (tx, tz) => { // any synthetic land in this tile (cheap 25 m probe)
    for (let z = tz * T + 12.5; z < (tz + 1) * T; z += 25) for (let x = tx * T + 12.5; x < (tx + 1) * T; x += 25) if (!real(x, z) && !(data.isWater && data.isWater(x, z))) return true;
    return false;
  };
  const synthetic = (tx, tz) => !(real(tx * T, tz * T) && real((tx + 1) * T, tz * T) && real(tx * T, (tz + 1) * T) && real((tx + 1) * T, (tz + 1) * T));
  return { LAYERS, LI, nearMat, lodMat, surfaces, materials: [nearMat, lodMat, runway, apron, taxiway], layerAt, heightAt, isKeys, gridGen, grid, synthetic, tileHasLand, real, Y_OFF, WATER_Y, tileSize: T };
}
