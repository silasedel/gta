// Car body engine: analytic automotive surfaces.
// A body is a loft of smooth cross-sections (rocker tuck, barrel side, shoulder fillet, crowned or fender-peaked top) along z,
// with real wheel-arch cutouts, plan-view nose/tail taper and bowed end caps (fascias).  The greenhouse is a second loft whose
// stations lean with the windshield and backlight, with grid-aligned pillars and bowed glass caps.
// Because every surface is a function, small features (lamps, grilles, gaps, handles, trims) are built as conformal patches
// lifted onto the surface: they wrap the body exactly, around the corners too.
// Shell space: ground y = 0, +Z forward, +X left, z = 0 mid-wheelbase.
import * as THREE from 'three';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smax = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- mesh accumulator (shared vertices -> smooth normals)
export class Acc {
  constructor() { this.P = []; this.T = {}; }
  v(x, y, z) { this.P.push(x, y, z); return this.P.length / 3 - 1; }
  tri(a, b, c, key) { if (key) (this.T[key] ||= []).push(a, b, c); }
  quad(a, b, c, d, key, flip) { if (!key) return; const t = (this.T[key] ||= []); if (flip) t.push(a, c, b, b, c, d); else t.push(a, b, c, b, d, c); }
  // param patch with its own vertices: fn(u, v) -> [x, y, z];  normal = dP/dv x dP/du unless flip
  patch(fn, nu, nv, key, flip) {
    const base = this.P.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i / nu, j / nv); this.P.push(p[0], p[1], p[2]); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + nu + 1, c = a + 1, d = b + 1;
      this.quad(a, b, c, d, key, flip);
    }
  }
  // -> { baseKey: BufferGeometry (indexed, smooth normals, uv = planar by dominant normal) }, panels recorded in userData.panels
  build() {
    const P = this.P, n = P.length / 3, N = new Float32Array(P.length);
    for (const key in this.T) {
      const t = this.T[key];
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
        const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
      }
    }
    for (let i = 0; i < n * 3; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    const byBase = {};
    for (const key of Object.keys(this.T).sort()) { const [base, panel] = key.split('#'); (byBase[base] ||= []).push([panel || '', this.T[key]]); }
    const out = {};
    for (const base in byBase) {
      const map = new Map(), pos = [], nor = [], uv = [], idx = [], panels = {};
      for (const [panel, t] of byBase[base]) {
        const start = idx.length;
        for (const vi of t) {
          let m = map.get(vi);
          if (m === undefined) {
            m = pos.length / 3; map.set(vi, m);
            const x = P[vi * 3], y = P[vi * 3 + 1], z = P[vi * 3 + 2], nx = N[vi * 3], ny = N[vi * 3 + 1], nz = N[vi * 3 + 2];
            pos.push(x, y, z); nor.push(nx, ny, nz);
            const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
            if (ax >= ay && ax >= az) uv.push(z, y); else if (ay >= az) uv.push(z, x); else uv.push(x, y);
          }
          idx.push(m);
        }
        if (panel) panels[panel] = { start, count: idx.length - start };
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      g.userData.panels = panels;
      g.computeBoundingSphere();
      out[base] = g;
    }
    return out;
  }
}

// ---------------------------------------------------------------- style defaults per archetype family
export function styleOf(t) {
  const boxy = !!(t.box || t.bus), van = !!t.van, truck = !!(t.bed || t.offroad), sporty = !!(t.coupe && !t.bigGrille), wedge = !!t.wedge;
  const era = t.era ?? (t.year ? (t.year < 1996 ? 0 : t.year < 2012 ? 1 : 2) : 1); // 0 boxy, 1 rounded, 2 sharp modern
  const d = {
    noseL: boxy ? 0.14 : van ? 0.3 : truck ? 0.32 : wedge ? 0.9 : sporty ? 0.7 : 0.5,
    noseW: boxy ? 0.95 : van ? 0.86 : truck ? 0.9 : wedge ? 0.6 : sporty ? 0.72 : 0.8,
    noseP: boxy ? 4 : truck ? 3.2 : 2.4,
    tailL: boxy ? 0.1 : van ? 0.18 : truck ? 0.2 : wedge ? 0.5 : sporty ? 0.5 : 0.4,
    tailW: boxy ? 0.97 : van ? 0.94 : truck ? 0.95 : wedge ? 0.8 : sporty ? 0.8 : 0.86,
    tailP: boxy ? 4 : truck ? 3.5 : 2.6,
    fillet: boxy ? 0.05 : van ? 0.08 : truck ? 0.09 : wedge ? 0.14 : 0.12,
    filletP: 1, barrel: boxy ? 0.006 : van ? 0.012 : truck ? 0.018 : 0.03, tuck: boxy ? 0.01 : truck ? 0.03 : 0.05,
    crown: boxy ? 0.01 : van ? 0.02 : wedge ? 0.02 : 0.035, flare: truck ? 0.03 : sporty || wedge ? 0.03 : 0.016,
    archGap: t.offroad ? 0.12 : truck ? 0.1 : wedge ? 0.045 : sporty ? 0.055 : 0.07,
    bowF: boxy ? 0.02 : truck ? 0.05 : 0.09, bowR: boxy ? 0.015 : truck ? 0.03 : 0.06,
    hoodP: wedge ? 1.0 : van ? 0.55 : truck ? 0.45 : sporty ? 0.8 : 0.62, deckP: 1.25,
    frontRise: wedge ? 0.02 : truck ? 0.14 : 0.07, rearRise: wedge ? 0.1 : truck ? 0.16 : 0.1,
    tumble: boxy ? 0.02 : van ? 0.07 : truck ? 0.1 : wedge ? 0.3 : sporty ? 0.24 : 0.18,
    roofFillet: boxy ? 0.05 : van ? 0.09 : 0.08, roofCrown: boxy ? 0.012 : 0.03, roofSag: boxy ? 0 : van ? 0.015 : 0.04,
    glassBow: boxy ? 0.03 : truck ? 0.07 : 0.11, beltRise: wedge ? 0.05 : sporty ? 0.03 : 0.012,
    waist: wedge ? 0.04 : sporty ? 0.02 : 0,
  };
  if (era === 0 && !boxy) { d.noseW = Math.min(0.93, d.noseW + 0.1); d.tailW = Math.min(0.95, d.tailW + 0.07); d.noseP += 1.2; d.tailP += 1; d.fillet *= 0.6; d.roofFillet *= 0.7; d.barrel *= 0.5; d.tumble *= 0.8; d.noseL *= 0.6; d.tailL *= 0.6; d.bowF *= 0.5; d.glassBow *= 0.6; d.hoodP *= 0.85; }
  if (era === 2 && !boxy) { d.fillet *= 0.85; d.beltRise += 0.02; d.flare += 0.006; }
  return { ...d, ...(t.style || {}) };
}

// ---------------------------------------------------------------- body surface functions
export function bodySurf(t) {
  const st = styleOf(t);
  const { L, W, wb, r, yb, belt, noseY, tailY, zA, zD } = t;
  const zf = L / 2, zr = -L / 2, zF = wb / 2, zR = -wb / 2, ra = r + st.archGap, wy = r * 0.96;
  const hasDeck = zD - zr > 0.25;
  const beltAt = (z) => belt + st.beltRise * clamp((zA - z) / Math.max(0.3, zA - zD), 0, 1);
  const beltD = beltAt(zD);
  // side-view center line of the lower body top (no fender peaks)
  const topBase = (z) => {
    if (z >= zA) { const u = clamp((zf - 0.06 - z) / Math.max(0.1, zf - 0.06 - zA), 0, 1); return lerp(noseY, belt, Math.pow(u, st.hoodP)) - 0.05 * Math.pow(clamp((z - (zf - 0.1)) / 0.1, 0, 1), 2); }
    if (z >= zD) return beltAt(z);
    if (!hasDeck) return beltD;
    const u = clamp((zD - z) / Math.max(0.1, zD - zr - 0.06), 0, 1);
    return lerp(beltD, tailY, Math.pow(u, st.deckP)) - 0.04 * Math.pow(clamp((zr + 0.08 - z) / 0.08, 0, 1), 2);
  };
  const archTop = (z) => { let y = -1; for (const zw of [zF, zR]) { const dz = z - zw; if (Math.abs(dz) < ra) y = Math.max(y, wy + Math.sqrt(ra * ra - dz * dz)); } return y; };
  const botBase = (z) => {
    if (z > zF + ra) return yb + st.frontRise * Math.pow((z - zF - ra) / Math.max(0.05, zf - zF - ra), 1.5);
    if (z < zR - ra) return yb + st.rearRise * Math.pow((zR - ra - z) / Math.max(0.05, zR - ra - zr), 1.5);
    return yb;
  };
  const bot = (z) => Math.max(botBase(z), archTop(z));
  const rf = (z) => st.fillet * (z > zf - 0.1 ? lerp(1, 0.55, (z - (zf - 0.1)) / 0.1) : 1);
  // shoulder edge height (top of fillet): raised into a fender peak over the arches when the hood/deck is low
  const edge = (z) => smax(topBase(z), archTop(z) + 0.075, 0.06);
  const center = (z) => {
    const base = topBase(z), e = edge(z);
    return Math.max(base + st.crown * (z > zA || z < zD ? 1 : 0.2), e - 0.06); // valley between fender peaks stays shallow
  };
  const plan = (z) => {
    let p = 1;
    if (z > zf - st.noseL) p = 1 - (1 - st.noseW) * Math.pow((z - (zf - st.noseL)) / st.noseL, st.noseP);
    else if (z < zr + st.tailL) p = 1 - (1 - st.tailW) * Math.pow((zr + st.tailL - z) / st.tailL, st.tailP);
    if (st.waist) p *= 1 - st.waist * Math.exp(-Math.pow((z - (zA + zD) / 2 - 0.2) / 0.7, 2));
    return p;
  };
  const hw = (z) => (W / 2) * plan(z);
  const flare = (z, y) => {
    let f = 0;
    for (const zw of [zF, zR]) { const d = Math.hypot(z - zw, y - wy) - ra; if (d > -0.02 && d < 0.3) f = Math.max(f, Math.exp(-Math.pow(d / 0.075, 2))); }
    return f * st.flare;
  };
  // side x at (z, y) for y on the side wall
  const sideX = (z, y) => {
    const y0 = botBase(z), y1 = edge(z) - rf(z);
    const v = clamp((y - y0) / Math.max(0.08, y1 - y0), 0, 1);
    const tk = v < 0.22 ? Math.pow((0.22 - v) / 0.22, 2) : 0;
    return hw(z) * (1 - st.barrel * (2 * v - 1) * (2 * v - 1) - st.tuck * tk) + flare(z, y);
  };
  // full section at z: returns ring sampler
  const section = (z) => {
    const e = edge(z), f = Math.min(rf(z), Math.max(0.015, (e - bot(z)) * 0.6)), ysh = e - f, c = center(z), yb0 = Math.min(bot(z), ysh - 0.02);
    const xs = sideX(z, ysh), cx = xs - f;
    return { z, yb: yb0, ysh, e, c, xs, cx, f };
  };
  // generalized half width at (z, y): side wall, fillet or top
  const halfW = (z, y) => {
    const s = section(z);
    if (y < s.yb - 1e-4) return 0;
    if (y <= s.ysh) return sideX(z, y);
    if (y <= s.e) { const a = Math.asin(clamp((y - s.ysh) / s.f, 0, 1)); return s.cx + s.f * Math.cos(a); }
    if (s.c > s.e && y <= s.c) return s.cx * Math.pow((s.c - y) / (s.c - s.e), 1 / 2.2);
    return 0;
  };
  const topY = (z, x) => {
    const s = section(z), ax = Math.abs(x);
    if (ax <= s.cx) return s.c + (s.e - s.c) * Math.pow(ax / s.cx, 2.2);
    if (ax <= s.xs) { const a = Math.acos(clamp((ax - s.cx) / s.f, 0, 1)); return s.ysh + s.f * Math.sin(a); }
    return s.ysh;
  };
  // fascia z at (x, y): end = +1 front, -1 rear
  const capBow = (end, x, y) => {
    const ze = end > 0 ? zf : zr, s = section(ze), w = Math.max(0.05, halfW(ze, clamp(y, s.yb, s.e)));
    const u = clamp(Math.abs(x) / w, 0, 1), k = clamp((y - s.yb) / Math.max(0.05, s.e - s.yb), 0, 1);
    return (end > 0 ? st.bowF : st.bowR) * (1 - u * u) * (1 - Math.pow(k, 3));
  };
  const endZ = (end, x, y) => {
    const ze = end > 0 ? zf : zr, ax = Math.abs(x);
    if (halfW(ze, y) >= ax) return ze + end * capBow(end, x, y);
    let a = ze, b = ze - end * Math.min(L * 0.45, (end > 0 ? st.noseL : st.tailL) + 0.5); // a outside, b inside
    if (halfW(b, y) < ax) return b;
    for (let i = 0; i < 18; i++) { const m = (a + b) / 2; if (halfW(m, y) >= ax) b = m; else a = m; }
    return b;
  };
  return { t, st, zf, zr, zF, zR, ra, wy, hasDeck, beltAt, topBase, bot, botBase, edge, center, hw, sideX, section, halfW, topY, endZ, capBow, archTop };
}

function spanStations(a, b, step, minN = 1) { const n = Math.max(minN, Math.ceil((b - a) / step)); const o = []; for (let i = 0; i < n; i++) o.push(a + (b - a) * i / n); return o; }

// ---------------------------------------------------------------- lower body loft
// keyOf(part, z0, z1, k) -> material key (may be 'paint#panel'); part: 'side' | 'fillet' | 'top' | 'capF' | 'capR' | 'under'
export function buildBodyLoft(acc, S, lod, keyOf) {
  const { t, st, zf, zr, zF, zR, ra } = S;
  const step = [0.11, 0.26, 0.7][lod], NS = [8, 4, 2][lod], NF = [4, 2, 1][lod], NT = [6, 3, 2][lod], NA = [12, 6, 3][lod], NE = [7, 4, 2][lod];
  // stations
  let Z = [];
  const tailEnd = Math.min(zr + st.tailL, zR - ra - 0.02), noseStart = Math.max(zf - st.noseL, zF + ra + 0.02);
  for (let i = 0; i < NE; i++) Z.push(zr + (tailEnd - zr) * Math.pow(i / NE, 1.7));
  Z.push(...spanStations(tailEnd, zR - ra, step));
  for (let i = 0; i < NA; i++) Z.push(zR - ra * Math.cos(Math.PI * i / NA));
  Z.push(...spanStations(zR + ra, zF - ra, step));
  for (let i = 0; i < NA; i++) Z.push(zF - ra * Math.cos(Math.PI * i / NA));
  Z.push(...spanStations(zF + ra, noseStart, step));
  for (let i = 0; i <= NE; i++) Z.push(zf - (zf - noseStart) * Math.pow(1 - i / NE, 1.7));
  // extra exact breakpoints so panels cut cleanly
  for (const zb of t._cuts || []) if (zb > zr + 0.05 && zb < zf - 0.05) Z.push(zb);
  Z = [...new Set(Z.map((z) => Math.round(z * 2000) / 2000))].sort((a, b) => a - b).filter((z, i, a) => i === 0 || z - a[i - 1] > 0.012);
  const M = 2 * (NS + NF + NT) + 1, K = NS + NF, rings = [];
  for (const z of Z) {
    const s = S.section(z), ring = [];
    const half = [];
    for (let i = 0; i <= NS; i++) { const y = lerp(s.yb, s.ysh, i / NS); half.push([S.sideX(z, y), y]); }
    for (let j = 1; j <= NF; j++) { const a = (j / NF) * Math.PI / 2; half.push([s.cx + s.f * Math.cos(a), s.ysh + s.f * Math.sin(a)]); }
    for (let j = 1; j <= NT; j++) { const x = s.cx * (1 - j / NT); half.push([x, s.c + (s.e - s.c) * Math.pow(x / s.cx, 2.2)]); }
    for (let i = 0; i < half.length; i++) ring.push(acc.v(half[i][0], half[i][1], z));
    for (let i = half.length - 2; i >= 0; i--) ring.push(acc.v(-half[i][0], half[i][1], z));
    rings.push(ring);
  }
  const partOf = (k) => { const kk = k < M / 2 - 0.5 ? k : M - 2 - k; return kk < NS ? 'side' : kk < K ? 'fillet' : 'top'; };
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let k = 0; k < M - 1; k++) acc.quad(A[k], A[k + 1], B[k], B[k + 1], keyOf(partOf(k), Z[s], Z[s + 1], k < (M - 1) / 2 ? 1 : -1, k, NS));
    acc.quad(A[0], A[M - 1], B[0], B[M - 1], keyOf('under', Z[s], Z[s + 1], 0), true);
  }
  // bowed end caps
  for (const end of [1, -1]) {
    const ring = end > 0 ? rings[rings.length - 1] : rings[0], NX = 2 * NT, rows = [];
    for (let k = 0; k <= K; k++) {
      if (k === K) { rows.push(ring.slice(K, K + NX + 1)); break; }
      const li = ring[k], ri = ring[M - 1 - k], lx = acc.P[li * 3], y = acc.P[li * 3 + 1], z = acc.P[li * 3 + 2], row = [li];
      for (let j = 1; j < NX; j++) { const x = lx * (1 - 2 * j / NX); row.push(acc.v(x, y, z + end * S.capBow(end, x, y))); }
      row.push(ri); rows.push(row);
    }
    for (let k = 0; k < K; k++) for (let j = 0; j < NX; j++) acc.quad(rows[k][j], rows[k + 1][j], rows[k][j + 1], rows[k + 1][j + 1], keyOf(end > 0 ? 'capF' : 'capR', 0, 0, j < NX / 2 ? 1 : -1, k), end < 0);
  }
  return { Z, M, K, NS, NF, NT };
}

// ---------------------------------------------------------------- greenhouse
export function greenhouseSurf(t, S) {
  const st = S.st, { zA, zB, zC, zD, roofY } = t;
  const zb = (u) => lerp(zD, zA, u), zt = (u) => lerp(zC, zB, u);
  const baseX = (u) => { const s = S.section(zb(u)); return Math.max(0.2, s.cx - (t.cabInset - 0.12)); };
  const baseY = (u) => S.edge(zb(u)) - 0.012;
  const roofE = (u) => roofY - st.roofSag * Math.pow(2 * u - 1, 2) - st.roofCrown;
  const rfg = st.roofFillet;
  // point on the side wall: v 0 (belt) .. 1 (start of the roof fillet)
  const side = (u, v) => {
    const y0 = baseY(u), y1 = roofE(u) - rfg;
    return [baseX(u) * (1 - st.tumble * Math.pow(v, 1.25)), lerp(y0, y1, v), lerp(zb(u), zt(u), v)];
  };
  const ringHalf = (u, NS, NF, NT) => {
    const h = [];
    { const zz = zb(u), s = S.section(zz); h.push([s.cx, s.e, zz]); } // shelf: joins the body's shoulder edge
    for (let i = 0; i <= NS; i++) h.push(side(u, i / NS));
    const top = side(u, 1), cx = top[0] - rfg, z = top[2];
    for (let j = 1; j <= NF; j++) { const a = (j / NF) * Math.PI / 2; h.push([cx + rfg * Math.cos(a), top[1] + rfg * Math.sin(a), z]); }
    for (let j = 1; j <= NT; j++) { const x = cx * (1 - j / NT); h.push([x, top[1] + rfg + st.roofCrown * (1 - Math.pow(x / cx, 2)), z]); }
    return h;
  };
  const uOfZ = (z) => clamp((z - (zD + zC) / 2) / Math.max(0.01, (zA + zB) / 2 - (zD + zC) / 2), 0, 1);
  // glass z at (x, y) on the windshield (end +1) or backlight (end -1)
  const capBow = (end, xr, k) => (end > 0 ? st.glassBow : st.glassBow * 0.6) * (1 - xr * xr) * (1 - Math.pow(k, 4));
  return { zb, zt, baseX, baseY, roofE, rfg, side, ringHalf, uOfZ, capBow };
}

// keyOf(part, u0, u1, v0, v1, sideSign) -> key; part: 'side' | 'rail' | 'roof' | 'capF' | 'capR'
export function buildGreenhouse(acc, t, S, G, lod, bands, keyOf) {
  const NS = [6, 3, 2][lod], NF = [3, 2, 1][lod], NT = [5, 3, 2][lod], len = Math.max(0.2, (t.zA + t.zB) / 2 - (t.zD + t.zC) / 2);
  let U = [0, 1];
  for (const b of bands) U.push(b[0], b[1]);
  U = [...new Set(U.map((u) => Math.round(clamp(u, 0, 1) * 5000) / 5000))].sort((a, b) => a - b);
  const stepU = [0.16, 0.4, 1.2][lod] / len, Uall = [];
  for (let i = 0; i < U.length - 1; i++) { const n = Math.max(1, Math.ceil((U[i + 1] - U[i]) / stepU)); for (let k = 0; k < n; k++) Uall.push(U[i] + (U[i + 1] - U[i]) * k / n); }
  Uall.push(1);
  const M = 2 * (NS + 1 + NF + NT) + 1, K = NS + 1 + NF, rings = [];
  for (const u of Uall) {
    const h = G.ringHalf(u, NS, NF, NT), ring = [];
    for (let i = 0; i < h.length; i++) ring.push(acc.v(h[i][0], h[i][1], h[i][2]));
    for (let i = h.length - 2; i >= 0; i--) ring.push(acc.v(-h[i][0], h[i][1], h[i][2]));
    rings.push(ring);
  }
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], B = rings[s + 1];
    for (let k = 0; k < M - 1; k++) {
      const kk = k < (M - 1) / 2 ? k : M - 2 - k, sgn = k < (M - 1) / 2 ? 1 : -1;
      const part = kk === 0 ? 'shelf' : kk <= NS ? 'side' : kk < K ? 'rail' : 'roof';
      acc.quad(A[k], A[k + 1], B[k], B[k + 1], keyOf(part, Uall[s], Uall[s + 1], (kk - 1) / NS, kk / NS, sgn));
    }
  }
  for (const end of [1, -1]) {
    const ring = end > 0 ? rings[rings.length - 1] : rings[0], NX = 2 * NT, rows = [];
    for (let k = 0; k <= K; k++) {
      if (k === K) { rows.push(ring.slice(K, K + NX + 1)); break; }
      const li = ring[k], ri = ring[M - 1 - k], lx = acc.P[li * 3], y = acc.P[li * 3 + 1], z = acc.P[li * 3 + 2], row = [li];
      for (let j = 1; j < NX; j++) { const xr = 1 - 2 * j / NX; row.push(acc.v(lx * xr, y, z + end * G.capBow(end, xr, k / K))); }
      row.push(ri); rows.push(row);
    }
    for (let k = 0; k < K; k++) for (let j = 0; j < NX; j++) acc.quad(rows[k][j], rows[k + 1][j], rows[k][j + 1], rows[k + 1][j + 1], keyOf(end > 0 ? 'capF' : 'capR', k, K, (j + 0.5) / NX, NS, 0), end < 0);
  }
  return { NS, NF, NT };
}

// ---------------------------------------------------------------- conformal patches
// A quad given by 4 corners (2D, surface coords) with optional corner rounding; grid mapped through a squircle so shapes
// can be rectangles, trapezoids, parallelograms or ovals with crisp grid-aligned borders.
function quadMap(q, round) {
  return (u, v) => {
    let a = u * 2 - 1, b = v * 2 - 1;
    if (round > 0) { // square -> rounded square (blend toward the disc mapping)
      const da = a * Math.sqrt(1 - b * b / 2), db = b * Math.sqrt(1 - a * a / 2);
      a = lerp(a, da, round); b = lerp(b, db, round);
    }
    const s = (a + 1) / 2, w = (b + 1) / 2;
    return [lerp(lerp(q[0][0], q[1][0], s), lerp(q[3][0], q[2][0], s), w), lerp(lerp(q[0][1], q[1][1], s), lerp(q[3][1], q[2][1], s), w)];
  };
}
const rectQ = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
export { rectQ, quadMap, clamp, lerp, sstep };

/** Patch helpers bound to a body surface.  All add to `acc` under `key`. */
export function patcher(acc, S) {
  return {
    // fascia: q corners in (x, y); end +1 front / -1 rear
    end(end, q, key, { off = 0.004, round = 0, nu = 8, nv = 3, mirror = false, sx: only = 0 } = {}) {
      const m = quadMap(q, round);
      const go = (sx) => acc.patch((u, v) => { const [x, y] = m(u, v); return [sx * x, y, S.endZ(end, x, y) + end * off]; }, nu, nv, key, (end > 0) === (sx > 0));
      if (only) { go(only); return; }
      go(1); if (mirror) go(-1);
    },
    // side: q corners in (z, y); side +1 left / -1 right (mirror -> both)
    side(q, key, { off = 0.003, round = 0, nu = 4, nv = 3, mirror = true, sides = null } = {}) {
      const m = quadMap(q, round);
      for (const sx of sides || (mirror ? [1, -1] : [1])) acc.patch((u, v) => { const [z, y] = m(u, v); return [sx * (S.halfW(z, y) + off), y, z]; }, nu, nv, key, sx < 0);
    },
    // top (hood / deck): q corners in (x, z)
    top(q, key, { off = 0.003, round = 0, nu = 4, nv = 4, mirror = false } = {}) {
      const m = quadMap(q, round);
      const go = (sx) => acc.patch((u, v) => { const [x, z] = m(u, v); return [sx * x, S.topY(z, x) + off, z]; }, nu, nv, key, sx < 0);
      go(1); if (mirror) go(-1);
    },
    // thin line on the side from (z0, y0) to (z1, y1)
    sideLine(z0, y0, z1, y1, key, w = 0.007, n = 6, off = 0.0018) {
      const dz = z1 - z0, dy = y1 - y0, l = Math.hypot(dz, dy) || 1, nz = -dy / l * w / 2, ny = dz / l * w / 2;
      this.side([[z0 - nz, y0 - ny], [z1 - nz, y1 - ny], [z1 + nz, y1 + ny], [z0 + nz, y0 + ny]], key, { off, nu: n, nv: 1 });
    },
    topLine(x0, z0, x1, z1, key, w = 0.007, n = 6, off = 0.0018, mirror = false) {
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
      this.top([[x0 - nx, z0 - nz], [x1 - nx, z1 - nz], [x1 + nx, z1 + nz], [x0 + nx, z0 + nz]], key, { off, nu: n, nv: 1, mirror });
    },
    endLine(end, x0, y0, x1, y1, key, w = 0.007, n = 8, off = 0.0045) {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
      this.end(end, [[x0 - nx, y0 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny], [x0 + nx, y0 + ny]], key, { off, nu: n, nv: 1 });
    },
  };
}

// convex-hull point cloud from the surfaces (shell space), bumper-height floor so low noses never act as ramps
export function hullCloud(t, S, G) {
  const out = [], minY = Math.max(t.yb + 0.06, 0.28), zs = [];
  for (let i = 0; i <= 14; i++) zs.push(lerp(S.zr + 0.01, S.zf - 0.01, i / 14));
  for (const z of zs) {
    const s = S.section(z);
    for (const sx of [1, -1]) { out.push(sx * S.sideX(z, s.yb), Math.max(minY, s.yb), z, sx * s.xs, Math.max(minY, s.ysh), z, sx * s.cx, Math.max(minY, s.e), z); }
    out.push(0, Math.max(minY, s.c), z);
  }
  if (G && !t.convertible) for (const u of [0, 0.5, 1]) for (const v of [0.5, 1]) { const p = G.side(u, v); out.push(p[0], p[1] + (v === 1 ? G.rfg : 0), p[2], -p[0], p[1] + (v === 1 ? G.rfg : 0), p[2]); }
  if (t.box) { const b = t.box, hwb = t.W / 2 + 0.03; for (const z of [S.zr + 0.02, b.front]) for (const sx of [1, -1]) out.push(sx * hwb, b.top, z, sx * hwb, t.belt, z); }
  return new Float32Array(out);
}
