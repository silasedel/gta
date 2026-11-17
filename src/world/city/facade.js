// city-look: the building-surface material. ONE MeshStandardMaterial (patched) draws every wall, roof and trim surface:
//   - real CC0 PBR wall / roof sets from a sampler2DArray, chosen per vertex (stucco, concrete, brick, coral stone, tile, metal, wood ...)
//   - a procedural window grid per facade run (punched, ribbon, curtain wall, arched, porthole, storefront, door, open garage deck,
//     roller shutter) with recessed reveals, frames, mullions, sills, shutters, window AC units, drip stains and grime
//   - interior mapping: every window looks into a different furnished room (pre-projected room atlas from rooms.js),
//     with per-window curtains / blinds, and lights that switch on and off by building type and hour
// Geometry carries: uv = (bay coordinate, floor coordinate), color = wall tint, and four vec4 attributes:
//   aFa = (wall layer, bay width m, floor height m, building seed 0..1)
//   aFb = (window width frac, window height frac, sill frac, window type)
//   aFc = (ground y of the facade, light profile, glass tint index, glass reflectivity)
//   aFd = (accent r, g, b, feature bits)
import * as THREE from 'three';
import { Batch } from './geo.js';
import { loadArray } from './pbr.js';

export const WALL_LAYERS = [
  { key: 'stucco', name: 'white_stucco', neutral: 1, level: 0.86, tile: 3.0 },
  { key: 'stuccoRough', name: 'white_rough_plaster', neutral: 0.9, level: 0.8, tile: 3.2 },
  { key: 'plaster', name: 'painted_plaster_wall', neutral: 1, level: 0.84, tile: 3.0 },
  { key: 'plasterWorn', name: 'worn_plaster_wall', neutral: 0.8, level: 0.74, tile: 4.0 },
  { key: 'paintPeel', name: 'peeling_painted_wall', neutral: 0.75, level: 0.78, tile: 3.2 },
  { key: 'concrete', name: 'concrete_wall_008', neutral: 0.9, level: 0.74, tile: 3.2 },
  { key: 'precast', name: 'concrete_panels', neutral: 0.9, level: 0.76, tile: 4.2 },
  { key: 'brickPaint', name: 'painted_brick', neutral: 1, level: 0.82, tile: 2.2 },
  { key: 'brick', name: 'red_brick_03', neutral: 0, level: 0.5, tile: 2.2 },
  { key: 'coral', name: 'coral_stone_wall', neutral: 0.35, level: 0.7, tile: 2.6 },
  { key: 'tile', name: 'square_tiled_wall', neutral: 1, level: 0.8, tile: 1.6 },
  { key: 'corrugated', name: 'corrugated_iron', neutral: 1, level: 0.8, tile: 2.4, metal: 0.55 },
  { key: 'siding', name: 'white_planks_clean', neutral: 1, level: 0.84, tile: 2.2 },
  { key: 'cmu', name: 'concrete_block_wall', neutral: 0.9, level: 0.7, tile: 2.4 },
  { key: 'cladding', name: 'exterior_wall_cladding', neutral: 1, level: 0.8, tile: 3.0, metal: 0.35 },
  { key: 'marble', name: 'marble_01', neutral: 0.2, level: 0.8, tile: 3.0, rough: 0.6 },
  { key: 'granite', name: 'granite_tile', neutral: 0.3, level: 0.34, tile: 2.4, rough: 0.6 },
  { key: 'shutter', name: 'painted_metal_shutter', neutral: 1, level: 0.78, tile: 2.4, metal: 0.4 },
  { key: 'roofGravel', name: 'tarred_gravel', neutral: 0.3, level: 0.42, tile: 3.0 },
  { key: 'roofTile', name: 'clay_roof_tiles_02', neutral: 0, level: 0.5, tile: 2.6 },
  { key: 'roofMetal', name: 'corrugated_iron_02', neutral: 1, level: 0.74, tile: 3.0, metal: 0.6 },
  { key: 'roofConcrete', name: 'gravel_concrete', neutral: 0.8, level: 0.6, tile: 4.0 },
  { key: 'roofCoat', name: 'painted_concrete', neutral: 1, level: 0.84, tile: 4.0 },
  { key: 'facadeTile', name: 'rectangular_facade_tiles', neutral: 1, level: 0.8, tile: 2.0, rough: 0.7 },
];
export const WL = Object.fromEntries(WALL_LAYERS.map((l, i) => [l.key, i]));
export const WIN = { punched: 0, ribbon: 1, curtain: 2, arched: 3, porthole: 4, blank: 5, storefront: 6, door: 7, garage: 8, roller: 9 };
export const PROFILE = { office: 0, residential: 1, hotel: 2, retail: 3, industrial: 4, garage: 5, lobby: 6, restaurant: 7 };
export const BIT = { awning: 65536, pilaster: 1, spandrel: 2, belt: 4, stripes: 8, cross: 16, vsplit: 32, jalousie: 64, shutters: 128, ac: 256, darkFrame: 512, fins: 1024, surround: 2048, sill: 4096, grime: 8192, solidDoor: 16384, awningWin: 32768 };
export const GLASS = { clear: 0, blue: 1, green: 2, bronze: 3, gray: 4, silver: 5, teal: 6, dark: 7 };

let wallP = null;
export function loadWallArray(renderer) {
  if (!wallP) wallP = loadArray(renderer, WALL_LAYERS, { size: 768 }).then((a) => { a.tiles = WALL_LAYERS.map((l) => 1 / l.tile); return a; });
  return wallP;
}

// ---------------- geometry ----------------
const _blank = [0, 3, 3.3, 0, 0, 0, 0, WIN.blank, 0, 0, 0, 0, 1, 1, 1, 0];
export class FBatch extends Batch {
  constructor() { super(); this.fx = []; this.s = _blank.slice(); }
  // plain textured surface (no windows) in wall layer `layer`
  blank(layer, groundY = 0, seed = 0) { const s = this.s; s[0] = layer; s[1] = 3; s[2] = 3.3; s[3] = seed; s[4] = s[5] = s[6] = 0; s[7] = WIN.blank; s[8] = groundY; s[9] = s[10] = s[11] = 0; s[12] = s[13] = s[14] = 1; s[15] = 0; return this; }
  vert(x, y, z, nx, ny, nz, u, v, col) { super.vert(x, y, z, nx, ny, nz, u, v, col); const s = this.s; this.fx.push(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10], s[11], s[12], s[13], s[14], s[15]); }
  attach(g) {
    const n = this.p.length / 3, fx = new Float32Array(this.fx.length ? this.fx : n * 16);
    const ib = new THREE.InterleavedBuffer(fx, 16);
    g.setAttribute('aFa', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('aFb', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    g.setAttribute('aFc', new THREE.InterleavedBufferAttribute(ib, 4, 8)); g.setAttribute('aFd', new THREE.InterleavedBufferAttribute(ib, 4, 12));
    return g;
  }
  build(material, o = {}) { const m = super.build(material, o); this.attach(m.geometry); return m; }
}

// Walls around an oriented ring (outward normal = (-dz, dx)) from y0 to y1 with window style S:
// S = { layer, tint: Color, bayW, floorH, winW, winH, sill, type, bits, profile, glass, reflect, accent: Color, seed (0..1), groundY }
// Consecutive near-colinear edges form one run, so window bays flow around curved facades and never get cut at a corner;
// bays and floors are fitted to the run length and wall height. vBase offsets the floor index (stacked strips get new rooms).
const _col = new THREE.Color();
export function facadeWalls(batch, ring, y0, y1, S, vBase = 0, coll = null) {
  const n = ring.length; if (n < 3 || y1 - y0 < 0.05) return;
  const s = batch.s, E = [];
  for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz); E.push({ p, q, L, tx: L > 1e-6 ? dx / L : 1, tz: L > 1e-6 ? dz / L : 0 }); }
  // run starts where the wall turns by more than ~24 degrees
  const turn = (i) => { const a = E[(i - 1 + n) % n], b = E[i]; return a.tx * b.tx + a.tz * b.tz < 0.914; };
  let start = 0; for (let i = 0; i < n; i++) if (turn(i)) { start = i; break; }
  const nf = Math.max(1, Math.round((y1 - y0) / S.floorH)), fh = (y1 - y0) / nf;
  const tint = S.tint.isColor ? S.tint : _col.set(S.tint);
  s[0] = S.layer; s[3] = S.seed; s[8] = S.groundY ?? 0; s[9] = S.profile ?? 0; s[10] = S.glass ?? 0; s[11] = S.reflect ?? 0.2;
  s[12] = S.accent.r; s[13] = S.accent.g; s[14] = S.accent.b; s[15] = S.bits || 0;
  let i = 0, runId = 0;
  while (i < n) {
    let j = i, Lr = 0; const run = [];
    do { const e = E[(start + j) % n]; run.push(e); Lr += e.L; j++; } while (j < n && !turn((start + j) % n));
    const minLen = S.type === WIN.curtain || S.type === WIN.ribbon ? 0.9 : Math.max(1.5, S.bayW * 0.62);
    const blank = Lr < minLen || S.type === WIN.blank, nb = blank ? 1 : Math.max(1, Math.round(Lr / S.bayW)), bw = Lr / nb;
    s[1] = bw; s[2] = fh; s[4] = blank ? 0 : S.winW; s[5] = S.winH; s[6] = S.sill; s[7] = blank ? WIN.blank : S.type;
    const uB = runId * 41 + 3, v0 = vBase, v1 = vBase + nf; let cum = 0;
    for (let k = 0; k < run.length; k++) {
      const e = run[k]; if (e.L < 1e-4) continue;
      const u0 = uB + nb * (cum / Lr), u1 = uB + nb * ((cum + e.L) / Lr); cum += e.L;
      // smooth normals inside a run (curved walls), flat at its ends
      const pe = k > 0 ? run[k - 1] : e, ne = k < run.length - 1 ? run[k + 1] : e;
      let ax = -(e.tz + pe.tz), az = e.tx + pe.tx, al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      let bx = -(e.tz + ne.tz), bz = e.tx + ne.tx, bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      const p = e.p, q = e.q;
      batch.vert(p[0], y0, p[1], ax, 0, az, u0, v0, tint); batch.vert(q[0], y0, q[1], bx, 0, bz, u1, v0, tint); batch.vert(q[0], y1, q[1], bx, 0, bz, u1, v1, tint);
      batch.vert(p[0], y0, p[1], ax, 0, az, u0, v0, tint); batch.vert(q[0], y1, q[1], bx, 0, bz, u1, v1, tint); batch.vert(p[0], y1, p[1], ax, 0, az, u0, v1, tint);
      if (coll) { const w = _col.set(0xffffff); coll.vert(p[0], y0, p[1], ax, 0, az, 0, 0, w); coll.vert(q[0], y0, q[1], bx, 0, bz, 0, 0, w); coll.vert(q[0], y1, q[1], bx, 0, bz, 0, 0, w); coll.vert(p[0], y0, p[1], ax, 0, az, 0, 0, w); coll.vert(q[0], y1, q[1], bx, 0, bz, 0, 0, w); coll.vert(p[0], y1, p[1], ax, 0, az, 0, 0, w); }
    }
    i = j; runId++;
  }
}

// ---------------- material ----------------
const GLASS_TINTS = [[0.50, 0.57, 0.58], [0.27, 0.37, 0.47], [0.29, 0.42, 0.39], [0.44, 0.37, 0.28], [0.31, 0.34, 0.37], [0.66, 0.71, 0.73], [0.22, 0.40, 0.42], [0.09, 0.10, 0.11]];

const FRAG_HEAD = /* glsl */`
uniform sampler2DArray uFCol; uniform sampler2DArray uFNrm; uniform sampler2D uFRooms;
uniform vec4 uFGrid; uniform vec2 uFRoomKind[8]; uniform float uFTile[NUM_FLAYERS]; uniform vec3 uFGlass[8];
uniform float uFLit[8]; uniform float uFAwn; uniform float uFNight; uniform float uFDay; uniform float uFTime; uniform float uFGlow;
flat in vec4 vFa; flat in vec4 vFb; flat in vec4 vFc; flat in vec4 vFd;
in vec3 vFWP; in vec3 vFWN; in vec2 vFuv;
vec3 gFAlb; float gFRough; float gFMetal; float gFAO; vec3 gFNw; vec3 gFEmi; float gFFar = 0.0; float gFLit = 0.0; vec3 gFLitC = vec3(1.0);
float fH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fVN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fH2(i), fH2(i + vec2(1.0, 0.0)), f.x), mix(fH2(i + vec2(0.0, 1.0)), fH2(i + vec2(1.0, 1.0)), f.x), f.y); }
float fBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float fOpen(int type, vec2 p, vec2 hs) {
  if (type == 1) return abs(p.y) - hs.y;
  if (type == 3) { float r = hs.x; float cy = hs.y - r; return p.y > cy ? length(vec2(p.x, p.y - cy)) - r : max(abs(p.x) - r, -p.y - hs.y); }
  if (type == 4) return length(p) - min(hs.x, hs.y);
  return fBox(p, hs);
}
float fLine(float d, float w, float px) { return 1.0 - smoothstep(w - px, w + px, abs(d)); }
void facadeEval() {
  vec3 Nw = normalize(vFWN);
  vec3 Vw = normalize(vFWP - cameraPosition);
  bool horiz = abs(Nw.y) > 0.6;
  vec3 T = horiz ? vec3(1.0, 0.0, 0.0) : normalize(vec3(Nw.z, 0.0, -Nw.x));
  vec3 Bt = horiz ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  vec2 tuv = horiz ? vFWP.xz : vec2(dot(vFWP.xz, T.xz), vFWP.y);
  int Li = int(vFa.x + 0.5); float Lf = float(Li); float ts = uFTile[Li];
  vec4 cR = texture(uFCol, vec3(tuv * ts, Lf));
  vec4 nA = texture(uFNrm, vec3(tuv * ts, Lf));
  int bits = int(vFd.w + 0.5);
  float seed = vFa.w * 913.0;
  // weathering: large soft blotches, vertical rain streaks, splash-zone dirt at the base
  float mac = fVN(tuv * 0.13 + seed);
  float streak = fVN(vec2(tuv.x * 2.1 + seed, tuv.y * 0.16));
  float grimeK = (bits & 8192) != 0 ? 0.42 : 0.2;
  float baseDirt = horiz ? 0.0 : smoothstep(1.5, 0.0, vFWP.y - vFc.x) * (0.14 + 0.2 * fVN(tuv * vec2(1.3, 3.0)));
  vec3 alb = cR.rgb * vColor.rgb * (0.9 + 0.2 * mac);
  alb *= 1.0 - (streak * streak * grimeK + baseDirt) * vec3(0.8, 0.86, 0.95);
  float rough = cR.a, metal = nA.a, ao = nA.b;
  vec3 nT = vec3(nA.xy * 2.0 - 1.0, 0.0); nT.z = sqrt(max(0.05, 1.0 - dot(nT.xy, nT.xy)));
  vec3 emi = vec3(0.0); vec3 nOver = vec3(0.0); float useOver = 0.0;
  int type = int(vFb.w + 0.5);
  { // rusticated stone base: banded courses with V-joints and staggered head joints on the ground floor of masonry-type walls
    float hy = vFWP.y - vFc.x;
    bool stoneWall = Li == 1 || Li == 2 || Li == 5 || Li == 6 || Li == 9 || Li == 15 || Li == 16 || Li == 14;
    if (!horiz && stoneWall && hy > 0.0 && hy < 4.35) {
      float pw = max(length(fwidth(tuv)), 1e-4);
      float cy = hy / 0.52;
      float row = floor(cy);
      float cx = (tuv.x + mod(row, 2.0) * 0.7) / 1.4;
      float gy = min(fract(cy), 1.0 - fract(cy)) * 0.52;
      float gx = min(fract(cx), 1.0 - fract(cx)) * 1.4;
      float jy = 1.0 - smoothstep(0.03 - pw, 0.03 + pw, gy);
      float jx = (1.0 - smoothstep(0.018 - pw, 0.018 + pw, gx)) * (1.0 - smoothstep(0.06, 0.25, pw));
      float j = max(jy, jx);
      float blk = fH2(vec2(floor(cx), row) + vFa.w * 31.0);
      alb = mix(alb, mix(vec3(0.84, 0.81, 0.74), cR.rgb * 1.1, 0.35) * (0.93 + 0.12 * blk), 0.6);
      alb *= 1.0 - 0.45 * j;
      ao *= 1.0 - 0.4 * j;
      float sgn = fract(cy) < 0.5 ? 1.0 : -1.0;
      nT.y += jy * sgn * 0.7;
      rough = mix(rough, 0.82, 0.5);
    }
  }
  if (type != 5 && !horiz) {
    vec2 guv = vFuv; vec2 cell = floor(guv); vec2 f = guv - cell;
    vec2 cs = vec2(vFa.y, vFa.z); vec2 pm = f * cs;
    vec2 pxv = fwidth(guv) * cs; float px = max(max(pxv.x, pxv.y), 1e-4);
    float detail = 1.0 - smoothstep(0.05, 0.28, px);
    float h1 = fH2(cell + seed), h2 = fH2(cell * 1.31 + seed + 17.0), h3 = fH2(cell * 0.73 + seed + 41.0), h4 = fH2(cell * 2.17 + seed + 71.0);
    vec3 acc = vFd.rgb; int prof = int(vFc.y + 0.5);
    vec3 gTint = uFGlass[int(vFc.z + 0.5)]; float refl = vFc.w;
    vec3 frameC = (bits & 512) != 0 ? vec3(0.035, 0.037, 0.04) : vec3(0.74, 0.74, 0.72);
    vec3 Vt = vec3(dot(Vw, T), dot(Vw, Bt), min(dot(Vw, Nw), -0.04));
    vec2 hs = vec2(vFb.x, vFb.y) * cs * 0.5; vec2 wmin = vec2(cs.x * 0.5 - hs.x, vFb.z * cs.y); vec2 wc = wmin + hs;
    float lit = 0.0; vec3 litC = vec3(1.0);
    { // night lighting: each window has a threshold; the lit fraction per building type follows the hour
      float lf = uFLit[prof]; float thr = h4;
      if (prof == 0) thr = mix(h4, fH2(vec2(cell.y, seed)), 0.65);            // offices: whole floors stay on
      // sub-pixel windows (mid / far LOD): light whole clusters of windows (power-of-two groups at least ~1.5 px wide) so a
      // distant tower keeps a random lit pattern instead of averaging to a flat glow
      float farF = smoothstep(0.6, 2.5, px / min(cs.x, cs.y));
      vec2 kg = min(exp2(ceil(log2(max(vec2(1.0), px * 1.6 / cs)))), vec2(4.0)); // stage 1: clusters at most 4x4 windows (bigger groups lit whole towers white)
      vec2 cg = floor(cell / kg);
      float thrG = prof == 0 ? mix(fH2(cg * 1.31 + seed * 7.0), fH2(vec2(cg.y * 1.7, seed)), 0.6) : fH2(cg * 1.31 + seed * 7.0);
      lit = mix(step(thr, lf), step(thrG, lf), farF) * uFNight;
      // stage 1: very far (windows well under a pixel even in clusters): average lit coverage (lit share x glazed share)
      float avgF = smoothstep(4.0, 10.0, px / min(cs.x, cs.y));
      lit = mix(lit, lf * 0.45 * uFNight, avgF);
      gFFar = smoothstep(0.3, 1.6, px / min(cs.x, cs.y));
      gFLit = lit;
      float warm = fH2(cell * 3.1 + seed + 5.0);
      litC = prof == 0 || prof == 5 || prof == 4 ? mix(vec3(0.82, 0.92, 1.0), vec3(1.0, 0.95, 0.84), warm * 0.7) : mix(vec3(1.0, 0.66, 0.36), vec3(1.0, 0.88, 0.70), warm);
      gFLitC = litC;
      if (prof == 1 && warm > 0.84) litC = mix(litC, vec3(0.45, 0.6, 1.0) * (0.75 + 0.5 * fH2(vec2(floor(uFTime * 5.0), h1 * 91.0))), 0.75); // TV glow
    }
    if (type == 2) {
      // ---- curtain wall: flush glass, mullion grid, spandrel band at each floor ----
      float spH = vFb.z * cs.y;
      float dv = min(pm.x, cs.x - pm.x), dh = min(abs(pm.y - spH), min(pm.y, cs.y - pm.y));
      float mull = max(fLine(dv, 0.035, px), fLine(dh, 0.03, px));
      if ((bits & 32) != 0) mull = max(mull, fLine(pm.x - cs.x * 0.5, 0.022, px));
      float sp = 1.0 - smoothstep(spH - px, spH + px, pm.y);
      vec2 ruv = pm / cs; float D = mix(4.0, 9.0, h3);
      vec3 Vr = Vt / vec3(cs.x * 0.5, cs.y * 0.5, -D * 0.5);
      if (h2 > 0.5) { ruv.x = 1.0 - ruv.x; Vr.x = -Vr.x; }
      vec3 I = vec3(0.3, 0.28, 0.25);
      if (px < 0.7) {
        vec3 pos = vec3(ruv * 2.0 - 1.0, -1.0); vec3 id = 1.0 / Vr; vec3 k = abs(id) - pos * id; float kMin = min(min(k.x, k.y), k.z); pos += kMin * Vr;
        float it = pos.z * 0.5 + 0.5; float rz = clamp(it, 0.0, 1.0) + 1.0; it = (1.0 - 1.0 / rz) * 2.0;
        vec2 iuv = pos.xy * mix(1.0, 0.5, it) * 0.5 + 0.5;
        vec2 rk = uFRoomKind[prof]; float ri = rk.x + floor(h1 * rk.y);
        vec2 auv = (vec2(mod(ri, uFGrid.x), floor(ri / uFGrid.x)) + clamp(iuv, uFGrid.z, 1.0 - uFGrid.z)) / uFGrid.xy;
        I = textureGrad(uFRooms, auv, dFdx(guv) / uFGrid.xy, dFdy(guv) / uFGrid.xy).rgb * (1.0 - 0.45 * clamp(it, 0.0, 1.0));
      }
      float blind = (h2 < 0.3 ? smoothstep(cs.y - (0.2 + 0.5 * h3) * (cs.y - spH), cs.y - (0.2 + 0.5 * h3) * (cs.y - spH) + 0.02, pm.y) : 0.0) * (1.0 - sp);
      vec3 blindC = vec3(0.78, 0.76, 0.7) * (0.8 + 0.2 * sin(pm.y * 90.0) * detail);
      float tr = (1.0 - refl * 0.82) * (1.0 - sp);
      vec3 gl = mix(gTint * 0.42, blindC * 0.5, blind * 0.8);
      vec3 spC = (bits & 2) != 0 ? mix(gTint * 0.3, vec3(0.16, 0.17, 0.18), 0.5) : gTint * 0.34;
      alb = mix(mix(gl, spC, sp), frameC, mull * (0.35 + 0.65 * detail));
      float fin = (bits & 1024) != 0 ? fLine(dv, 0.06, px) * detail : 0.0;
      alb = mix(alb, vec3(0.8, 0.82, 0.84), fin * 0.8);
      rough = mix(mix(0.05 + 0.1 * fVN(pm * 2.0 + cell), 0.14, sp), 0.42, max(mull, fin));
      metal = mix(mix(max(refl, 0.72), 0.55, sp), 0.75, max(mull, fin)); ao = 1.0 - 0.25 * mull; // glass reads as a tinted mirror of the sky
      nT = vec3((fVN(cell * 3.7 + seed) - 0.5) * 0.035, (fVN(cell * 5.1 + seed) - 0.5) * 0.035, 1.0); // panes are never perfectly coplanar
      emi = I * tr * (1.0 - mull) * (1.0 - blind * 0.7) * (uFDay * 0.16 + lit * litC * uFGlow) + blindC * blind * lit * litC * 0.35 * uFGlow * (1.0 - mull);
    } else {
      // ---- openings in a solid wall ----
      float rec = (type == 1 ? 0.09 : type == 8 ? 0.3 : type == 0 || type == 3 ? 0.26 : 0.17) * (1.0 - smoothstep(0.12, 0.7, px));
      vec2 pg = pm + Vt.xy / (-Vt.z) * rec;
      float sdW = fOpen(type, pm - wc, hs), sdG = fOpen(type, pg - wc, hs);
      float inOpen = 1.0 - smoothstep(-px, px, sdW);
      // wall dressing around the opening
      if ((bits & 1) != 0) { float pd = min(pm.x, cs.x - pm.x); float pil = 1.0 - smoothstep(0.2 - px, 0.2 + px, pd); alb = mix(alb, alb * 1.1 + 0.02, pil); nT.x += (smoothstep(0.16, 0.2, pd) - smoothstep(0.2, 0.24, pd)) * 0.9 * sign(pm.x - cs.x * 0.5) * detail; }
      if ((bits & 4) != 0) { float bc = 1.0 - smoothstep(0.2 - px, 0.2 + px, pm.y); alb = mix(alb, mix(acc, vec3(0.82, 0.79, 0.73), 0.6) * cR.rgb * 1.25, bc); ao *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.1, cs.y - pm.y)); nT.y += (smoothstep(0.16, 0.2, pm.y) - smoothstep(0.2, 0.24, pm.y)) * 0.8 * detail; }
      if ((bits & 8) != 0) { float sy = wmin.y * 0.5; float st = max(fLine(pm.y - sy, 0.03, px), max(fLine(pm.y - sy - 0.11, 0.03, px), fLine(pm.y - sy + 0.11, 0.03, px))); alb = mix(alb, mix(acc, alb, 0.45), st * (0.5 + 0.5 * detail)); }
      if ((bits & 2) != 0 && type == 0) { float spn = (1.0 - smoothstep(-px, px, fBox(pm - vec2(wc.x, wmin.y * 0.5 + 0.06), vec2(hs.x, max(0.02, wmin.y * 0.5 - 0.14))))); alb = mix(alb, acc * (0.9 + 0.1 * cR.rgb), spn); rough = mix(rough, 0.5, spn); }
      if ((bits & 2048) != 0) { float sr = (1.0 - smoothstep(0.13 - px, 0.13 + px, sdW)) * (1.0 - inOpen); alb = mix(alb, acc, sr); ao *= 1.0 - 0.18 * sr * smoothstep(0.09, 0.13, sdW); }
      if ((bits & 128) != 0 && type == 0) { // louvered shutters flanking the window
        float sw = hs.x * 0.52; vec2 sp2 = vec2(abs(pm.x - wc.x) - hs.x - sw * 0.5 - 0.02, pm.y - wc.y);
        float sm = 1.0 - smoothstep(-px, px, fBox(sp2, vec2(sw * 0.5, hs.y)));
        alb = mix(alb, acc * (0.78 + 0.22 * step(0.5, fract(pm.y * 14.0)) * detail), sm); rough = mix(rough, 0.6, sm); nT.y += sm * (fract(pm.y * 14.0) - 0.5) * 0.9 * detail;
      }
      if ((type == 0 || type == 3) && (bits & 2048) == 0) { // stone lintel (flat) or voussoir ring + keystone (arched)
        float topY = wmin.y + hs.y * 2.0;
        float lin = type == 0 ? 1.0 - smoothstep(-px, px, fBox(pm - vec2(wc.x, topY + 0.11), vec2(hs.x + 0.12, 0.11)))
                              : (1.0 - smoothstep(-px, px, abs(sdW - 0.1) - 0.1)) * step(wc.y + hs.y - hs.x, pm.y);
        if (type == 3) lin = max(lin, 1.0 - smoothstep(-px, px, fBox(pm - vec2(wc.x, topY + 0.14), vec2(0.13, 0.17))));
        vec3 stoneC = mix(cR.rgb, vec3(0.86, 0.83, 0.77), 0.55);
        alb = mix(alb, stoneC, lin * (1.0 - inOpen)); nT.y += lin * 0.25 * detail; ao *= 1.0 - 0.12 * lin;
      }
      if ((bits & 4096) != 0 && type != 7 && type != 6) { // sill + stains running down from its ends
        float sl = 1.0 - smoothstep(-px, px, fBox(pm - vec2(wc.x, wmin.y - 0.05), vec2(hs.x + 0.09, 0.05)));
        float below = smoothstep(0.0, 0.06, wmin.y - 0.1 - pm.y);
        float ends = max(fLine(pm.x - (wc.x - hs.x - 0.05), 0.07, px), fLine(pm.x - (wc.x + hs.x + 0.05), 0.07, px));
        alb *= 1.0 - below * ends * (0.2 + 0.25 * h3) * exp(-(wmin.y - pm.y) * 1.3) * (0.6 + 0.8 * fVN(pm * vec2(9.0, 1.5) + cell));
        alb = mix(alb, cR.rgb * vec3(0.86, 0.85, 0.82), sl); nT.y += sl * 0.35;
      }
      ao *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.16, sdW)) * (1.0 - inOpen);
      // window air conditioner (hangs out of the opening) and its drip stain
      float acM = 0.0;
      if ((bits & 256) != 0 && type == 0 && h4 * 1.37 - floor(h4 * 1.37) < 0.2) {
        vec2 ap = pm - vec2(wc.x + (h3 - 0.5) * hs.x * 0.5, wmin.y + 0.19);
        acM = 1.0 - smoothstep(-px, px, fBox(ap, vec2(min(0.33, hs.x * 0.8), 0.19)));
        float drip = fLine(ap.x, 0.05, px) * step(pm.y, wmin.y) * exp(-(wmin.y - pm.y) * 0.9);
        alb *= 1.0 - drip * 0.42;
      }
      if (inOpen > 0.001) {
        vec3 oAlb; float oRough, oMetal, oAO = 1.0; vec3 oEmi = vec3(0.0); vec3 oN = vec3(0.0, 0.0, 1.0);
        if (sdG > 0.0 && rec > 0.001) {
          // the reveal: jamb, soffit or sill of the wall thickness
          vec2 d = pg - wc; vec2 over = abs(d) - hs;
          vec2 rn = (type == 4 || (type == 3 && d.y > hs.y - hs.x)) ? -normalize(d) : (over.x > over.y ? vec2(-sign(d.x), 0.0) : vec2(0.0, -sign(d.y)));
          oAlb = ((bits & 2048) != 0 ? acc : cR.rgb * vColor.rgb) * 0.92; oRough = cR.a; oMetal = 0.0; oAO = 0.62 + 0.2 * rn.y; oN = vec3(rn, 0.25);
        } else {
          float fw = type == 8 ? 0.0 : (type == 6 || type == 7 ? 0.06 : 0.055);
          float fr = smoothstep(-fw - px, -fw + px, sdG);
          vec2 wq = (pg - wmin) / (hs * 2.0);
          // mullions
          float mu = 0.0; float mw = 0.022;
          if (type == 0 || type == 3) {
            if ((bits & 16) != 0) mu = max(fLine(pg.x - wc.x, mw, px), fLine(pg.y - (wmin.y + hs.y * 1.24), mw, px));
            else if ((bits & 32) != 0) mu = fLine(pg.x - wc.x, mw, px);
            else if ((bits & 64) != 0) mu = fLine(fract(wq.y * 5.0) - 0.5, 0.06, px * 5.0 / (hs.y * 2.0));
            else if ((bits & 32768) != 0) mu = max(fLine(pg.y - (wmin.y + hs.y * 0.7), mw, px), fLine(pg.x - wc.x, mw, px) * step(pg.y, wmin.y + hs.y * 0.7));
            float panes = floor(hs.x * 2.0 / 1.5 + 0.5);
            if (panes > 2.5) mu = max(mu, fLine(fract(wq.x * panes + 0.5) - 0.5, mw * panes / (hs.x * 2.0), px * panes / (hs.x * 2.0)));
          } else if (type == 1) { mu = max(fLine(min(pg.x, cs.x - pg.x), 0.03, px), fLine(pg.x - cs.x * 0.5, 0.02, px)); }
          else if (type == 6) { float n6 = max(1.0, floor(hs.x * 2.0 / 1.7 + 0.5)); mu = max(fLine(fract(wq.x * n6 + 0.5) - 0.5, 0.03 * n6 / (hs.x * 2.0), px * n6 / (hs.x * 2.0)), fLine(pg.y - (wmin.y + hs.y * 2.0 - 0.55), 0.03, px)); }
          else if (type == 7) { mu = max(fLine(pg.x - wc.x, 0.03, px), fLine(pg.y - (wmin.y + 2.15), 0.04, px) * step(2.5, hs.y * 2.0)); }
          mu *= detail;
          // interior mapping: the room spans the whole bay x floor cell behind the wall
          vec2 ruv = pg / cs; float D = mix(3.2, 6.5, h3);
          vec3 Vr = Vt / vec3(cs.x * 0.5, cs.y * 0.5, -D * 0.5);
          if (h2 > 0.5) { ruv.x = 1.0 - ruv.x; Vr.x = -Vr.x; }
          vec3 I = vec3(0.3, 0.27, 0.23); float it = 0.5;
          if (px < 0.7) {
            vec3 pos = vec3(clamp(ruv, 0.0, 1.0) * 2.0 - 1.0, -1.0); vec3 id = 1.0 / Vr; vec3 k = abs(id) - pos * id; float kMin = min(min(k.x, k.y), k.z); pos += kMin * Vr;
            it = pos.z * 0.5 + 0.5; float rz = clamp(it, 0.0, 1.0) + 1.0; it = (1.0 - 1.0 / rz) * 2.0;
            vec2 iuv = pos.xy * mix(1.0, 0.5, it) * 0.5 + 0.5;
            int rp = type == 6 ? 3 : (type == 7 ? 6 : (type == 8 ? 5 : prof));
            vec2 rk = uFRoomKind[rp]; float ri = rk.x + floor(h1 * rk.y);
            vec2 auv = (vec2(mod(ri, uFGrid.x), floor(ri / uFGrid.x)) + clamp(iuv, uFGrid.z, 1.0 - uFGrid.z)) / uFGrid.xy;
            I = textureGrad(uFRooms, auv, dFdx(guv) / uFGrid.xy, dFdy(guv) / uFGrid.xy).rgb;
          }
          // curtains and blinds, a different state per window (homes and hotels mostly; offices get blinds)
          float cov = 0.0; vec3 cC = vec3(0.8);
          if (type != 8 && type != 6 && type != 7) {
            float st = h2 * 7.0 - floor(h2 * 7.0); bool home = prof == 1 || prof == 2;
            vec3 pal = mix(vec3(0.78, 0.74, 0.66), 0.5 + 0.42 * cos(6.2831 * (h3 * 3.0 + vec3(0.0, 0.33, 0.67))), 0.12); // linen, cream, grey: never candy colors
            if (st < (home ? 0.22 : 0.34)) { float t = 0.22 + 0.62 * h3; cov = smoothstep(1.0 - t - 0.01, 1.0 - t + 0.01, wq.y) * 0.92; cC = vec3(0.82, 0.8, 0.74) * (0.72 + 0.28 * step(0.5, fract(wq.y * hs.y * 2.0 * 26.0)) * detail); }
            else if (st < (home ? 0.5 : 0.4)) { float c = 0.14 + 0.2 * h1; cov = smoothstep(0.5 - c - 0.01, 0.5 - c + 0.01, abs(wq.x - 0.5)) * 0.95; cC = mix(vec3(0.86, 0.82, 0.74), pal, 0.55) * (0.8 + 0.2 * sin(wq.x * hs.x * 2.0 * 46.0) * detail); }
            else if (st < (home ? 0.64 : 0.44)) { cov = 0.62; cC = vec3(0.9, 0.9, 0.86) * (0.86 + 0.14 * sin(wq.x * hs.x * 2.0 * 34.0 + h1 * 6.0) * detail); }
            else if (st < (home ? 0.76 : 0.5)) { cov = 0.97; cC = mix(vec3(0.62, 0.58, 0.5), pal * 0.7, 0.5) * (0.84 + 0.16 * sin(wq.x * hs.x * 2.0 * 30.0) * detail); }
          }
          float tr = type == 8 ? 1.0 : 1.0 - refl * 0.82;
          float dayI = uFDay * (type == 8 ? 0.55 : type == 6 || type == 7 ? 0.5 : 0.2) * (1.0 - 0.5 * clamp(it, 0.0, 1.0));
          if (type != 6 && type != 7 && type != 8) I = mix(vec3(dot(I, vec3(0.3, 0.5, 0.2))), I, 0.45); // rooms seen through daylight glass are muted
          if (type == 6 || type == 7) { dayI += uFDay * 0.12; I = mix(vec3(dot(I, vec3(0.3, 0.5, 0.2))), I, 0.3) * vec3(1.15, 0.97, 0.76); } // shop fronts: warm lit interiors by day too, no candy-colored rooms
          float l2 = type == 8 ? max(lit, uFNight * 0.9) : lit;
          oEmi = I * tr * (1.0 - cov) * (dayI + l2 * litC * uFGlow) + cC * cov * l2 * litC * 0.3 * uFGlow * tr;
          oAlb = mix(gTint * (type == 8 ? 0.0 : 0.4), cC * 0.85, cov * 0.9);
          oRough = type == 8 ? 1.0 : 0.05 + 0.12 * fVN(pm * 2.3 + cell * 7.0);
          oMetal = type == 8 ? 0.0 : mix(type == 6 || type == 7 ? 0.35 : 0.68, 0.0, cov * 0.75);
          if (type == 9) { // roller shutter: ribbed painted steel filling the opening
            vec4 sR = texture(uFCol, vec3(tuv * uFTile[17], 17.0));
            float rib = fract(pg.y * 11.0); oAlb = acc * sR.rgb * (0.82 + 0.18 * smoothstep(0.0, 0.5, rib)); oRough = sR.a; oMetal = 0.35; oEmi = vec3(0.0); oN = vec3(0.0, (rib - 0.5) * 0.9 * detail, 1.0);
          }
          if (type == 7 && (bits & 16384) != 0) { // solid paneled door instead of glass
            vec2 pp = vec2(fract(wq.x * 2.0), fract(wq.y * 3.0)); float panel = step(0.14, pp.x) * step(pp.x, 0.86) * step(0.1, pp.y) * step(pp.y, 0.9);
            oAlb = acc * (0.8 + 0.2 * panel); oRough = 0.45; oMetal = 0.0; oEmi = vec3(0.0); oN = vec3(0.0, 0.0, 1.0);
          }
          // frame + mullions over the glass
          float fm = max(fr, mu);
          oAlb = mix(oAlb, frameC, fm); oRough = mix(oRough, 0.38, fm); oMetal = mix(oMetal, 0.55, fm); oEmi *= 1.0 - fm;
          // soft shadow from the head of the opening onto the glass
          oAO = 1.0 - 0.3 * smoothstep(0.75, 1.0, wq.y) * step(float(type), 7.5);
          if (type == 6) { float bulk = 1.0 - smoothstep(0.42 - px, 0.42 + px, pg.y - wmin.y); oAlb = mix(oAlb, acc * cR.rgb, bulk); oRough = mix(oRough, 0.6, bulk); oMetal *= 1.0 - bulk; oEmi *= 1.0 - bulk; }
          if (type == 8) { float rail = max(fLine(pg.y - (wmin.y + 0.5), 0.03, px), fLine(pg.y - (wmin.y + 0.95), 0.035, px)) * detail; oAlb = mix(oAlb, vec3(0.55), rail); oEmi *= 1.0 - rail; }
        }
        if (acM > 0.0) { float gr = step(0.5, fract(pm.y * 38.0)) * detail; oAlb = mix(oAlb, vec3(0.72, 0.72, 0.68) * (0.75 + 0.25 * gr), acM); oRough = mix(oRough, 0.55, acM); oMetal = mix(oMetal, 0.3, acM); oEmi *= 1.0 - acM; }
        alb = mix(alb, oAlb, inOpen); rough = mix(rough, oRough, inOpen); metal = mix(metal, oMetal, inOpen); ao = mix(ao, oAO, inOpen); emi = oEmi * inOpen;
        nOver = oN; useOver = inOpen;
      }
    }
  }
  if ((bits & 65536) != 0 && uFAwn > 0.5) { // shop awning canvas: bounce from the lit shop window below (stronger on the underside) and a
    // little light through the fabric, so a dark awning reads as colored canvas at night instead of a black void
    float under = clamp(-vFWN.y, 0.0, 1.0);
    float shopLit = 0.35 + 0.65 * uFLit[3];
    emi += alb * (uFNight * shopLit * (0.07 + 0.33 * under) * vec3(1.0, 0.8, 0.55) * uFGlow + uFDay * 0.04);
  }
  nT = mix(nT, nOver, useOver);
  gFNw = normalize(T * nT.x + Bt * nT.y + Nw * max(nT.z, 0.05));
  gFAlb = alb; gFRough = clamp(rough, 0.03, 1.0); gFMetal = clamp(metal, 0.0, 1.0); gFAO = ao; gFEmi = emi * mix(1.0, 0.45, gFFar) + gFFar * gFLit * gFLitC * 0.12 * uFGlow; // distant facades: average glow = lit share x glazed share (the old 1.6x / 0.95 boost lit mid/far blocks solid white at night)
}
`;

// shared: { uFLit: {value: Float32Array(8)}, uFNight, uFDay, uFTime, uFGlow } (uniform objects updated by materials.js)
export function createFacadeMaterial(wall, rooms, shared, extra = null) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 1.25 });
  const kinds = new Array(8).fill(0).map(() => new THREE.Vector2(0, 1));
  const order = ['office', 'residential', 'hotel', 'retail', 'industrial', 'garage', 'lobby', 'restaurant'];
  order.forEach((k, i) => { const r = rooms.kinds[k] || rooms.kinds.residential; kinds[i].set(r.first, r.count); });
  mat.onBeforeCompile = (sh, r) => {
    Object.assign(sh.uniforms, {
      uFCol: { value: wall.colR }, uFNrm: { value: wall.nrmAO }, uFRooms: { value: rooms.texture },
      uFGrid: { value: new THREE.Vector4(rooms.cols, rooms.rows, 0.6 / rooms.cell, rooms.cols * rooms.rows) }, uFRoomKind: { value: kinds },
      uFTile: { value: wall.tiles }, uFGlass: { value: GLASS_TINTS.map((c) => new THREE.Vector3(c[0], c[1], c[2])) },
      uFLit: shared.uFLit, uFNight: shared.uFNight, uFDay: shared.uFDay, uFTime: shared.uFTime, uFGlow: shared.uFGlow, uFAwn: shared.uFAwn || { value: 1 },
    });
    sh.vertexShader = 'attribute vec4 aFa; attribute vec4 aFb; attribute vec4 aFc; attribute vec4 aFd;\nflat out vec4 vFa; flat out vec4 vFb; flat out vec4 vFc; flat out vec4 vFd;\nout vec3 vFWP; out vec3 vFWN; out vec2 vFuv;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vFa = aFa; vFb = aFb; vFc = aFc; vFd = aFd; vFuv = uv;
        vFWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vFWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\n' + FRAG_HEAD.replace('NUM_FLAYERS', String(wall.count)))
      .replace('#include <map_fragment>', '#include <map_fragment>\n  facadeEval();')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = gFAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gFRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gFMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(gFNw, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += gFEmi;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= gFAO; reflectedLight.indirectSpecular *= mix(1.0, gFAO, 0.6);');
    if (extra) extra(sh, r);
  };
  mat.customProgramCacheKey = () => 'ps-facade-' + wall.count + (extra ? '-x' : '');
  return mat;
}
