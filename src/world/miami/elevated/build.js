// ELEVATED agent: per-tile geometry + colliders for the processed elevated network.
// Visual: one mesh per material per tile (asphalt deck, concrete structure, markings). Colliders: one trimesh for the
// deck slabs of the tile (clipped to the tile + 5 cm), convex hulls for barrier / retaining-wall runs (exact copies of the
// rendered jersey profile), cylinders + cuboids for piers.
import { P } from './params.js';
import { GeoBuf, PosBuf, triClip } from './geobuf.js';

// Vertex colours are LINEAR (three.js): 0.27 linear is about sRGB 0.56, a weathered mid-grey concrete. The old values (0.5 - 0.86
// linear = sRGB 0.73 - 0.94) read near-white in the sun, which is why the barriers looked like flat white / beige slabs.
const COL = { // a touch warm (not beige): the blue sky fill on shaded faces then reads neutral grey, not navy
  deck: [1, 1, 1], barrier: [0.4, 0.39, 0.36], barrierTop: [0.44, 0.43, 0.4], fascia: [0.3, 0.292, 0.27], wall: [0.28, 0.272, 0.25], coping: [0.36, 0.35, 0.325], /* ground pass: weathered cast concrete is light grey (~0.35 linear); at 0.21 the shaded barrier faces read as a flat navy wall */ joint: [0.03, 0.03, 0.032], footing: [0.128, 0.124, 0.113], drip: [0.058, 0.057, 0.053],
  soffit: [0.2, 0.196, 0.185], walk: [0.3, 0.292, 0.27], curb: [0.28, 0.272, 0.25], girder: [0.24, 0.234, 0.215], pier: [0.3, 0.292, 0.27], cap: [0.29, 0.282, 0.26], /* ground pass: undersides / piers read as concrete, not near-black */ white: [0.95, 0.95, 0.93], yellow: [0.95, 0.76, 0.19], gore: [0.93, 0.93, 0.9],
};

export function createBuilder(net) {
  const { chains } = net;
  // ---- index: 50 m cells -> segment ids / piers / lamps / joints / barrier runs
  const CELL = 50, cells = new Map(), ck = (i, j) => (i + 2048) * 4096 + (j + 2048);
  const addBox = (x0, z0, x1, z1, item) => { for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = ck(i, j); let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(item); } };
  for (const c of chains) for (let i = 0; i < c.n - 1; i++) {
    if (!(c.vis[i] && c.vis[i + 1]) || c.s[i + 1] <= c.s0 || c.s[i] >= c.s1) continue;
    const pad = 1.0; // walls / barrier tops stay within the deck footprint
    addBox(Math.min(c.lx[i], c.rx[i], c.lx[i + 1], c.rx[i + 1]) - pad, Math.min(c.lz[i], c.rz[i], c.lz[i + 1], c.rz[i + 1]) - pad, Math.max(c.lx[i], c.rx[i], c.lx[i + 1], c.rx[i + 1]) + pad, Math.max(c.lz[i], c.rz[i], c.lz[i + 1], c.rz[i + 1]) + pad, { t: 0, c, i });
  }
  for (const p of net.piers) addBox(p.x, p.z, p.x, p.z, { t: 1, p });
  for (const l of net.lamps) addBox(l.x, l.z, l.x, l.z, { t: 2, l });
  // barrier collider runs (global, deterministic): split where the barrier stops or the chord leaves the curve by > 2 cm
  const runs = [];
  for (const c of chains) for (const side of [-1, 1]) {
    const bar = side < 0 ? c.barL : c.barR;
    let i = 0;
    while (i < c.n - 1) {
      if (!(bar[i] && bar[i + 1] && segOn(c, i))) { i++; continue; }
      let j = i + 1;
      while (j < c.n - 1 && bar[j + 1] && segOn(c, j) && c.s[j + 1] - c.s[i] <= 14) {
        // sagitta check on the outer barrier line (plan + height)
        const a = edgePt(c, i, side), b = edgePt(c, j + 1, side); let ok = true;
        for (let k = i + 1; k <= j; k++) { const m = edgePt(c, k, side), t = (c.s[k] - c.s[i]) / (c.s[j + 1] - c.s[i]); if (Math.hypot(a[0] + (b[0] - a[0]) * t - m[0], a[2] + (b[2] - a[2]) * t - m[2]) > 0.02 || Math.abs(a[1] + (b[1] - a[1]) * t - m[1]) > 0.02) { ok = false; break; } }
        if (!ok) break; j++;
      }
      const r = { c, side, i0: i, i1: j }; runs.push(r);
      const m = edgePt(c, (i + j) >> 1, side); addBox(m[0], m[2], m[0], m[2], { t: 3, r });
      i = j;
    }
  }
  function segOn(c, i) { return c.vis[i] && c.vis[i + 1] && c.s[i + 1] > c.s0 && c.s[i] < c.s1; }
  function edgePt(c, i, side) { const o = side < 0 ? c.vL[i] : c.vR[i]; return [c.x[i] - c.tz[i] * o, c.y[i] + P.ROAD_Y + c.bank[i] * o, c.z[i] + c.tx[i] * o]; }

  // ---- vertex helpers
  const V = () => new Float64Array(11);
  const va = V(), vb = V(), vc = V(), vd = V();
  const setV = (v, x, y, z, nx, ny, nz, u, w, col) => { v[0] = x; v[1] = y; v[2] = z; v[3] = nx; v[4] = ny; v[5] = nz; v[6] = u; v[7] = w; v[8] = col[0]; v[9] = col[1]; v[10] = col[2]; return v; };
  // quad (a,b,c,d) with flat normal oriented toward hint (hx,hy,hz); computes geometric normal
  function quad(buf, a, b, c, d, hx, hy, hz, B) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz); if (l < 1e-10) return;
    nx /= l; ny /= l; nz /= l; let flip = nx * hx + ny * hy + nz * hz < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    for (const v of [a, b, c, d]) { v[3] = nx; v[4] = ny; v[5] = nz; }
    if (!flip) { triClip(buf, a, b, c, B); triClip(buf, a, c, d, B); } else { triClip(buf, a, c, b, B); triClip(buf, a, d, c, B); }
  }
  // world position of lateral offset o at sample i, dy above the deck surface there
  const surf = (c, i, o) => c.y[i] + P.ROAD_Y + c.bank[i] * o;
  const px = (c, i, o) => c.x[i] - c.tz[i] * o, pz = (c, i, o) => c.z[i] + c.tx[i] * o;

  // barrier cross-section at sample i (side s): inner toe, reveal, top-inner, top-outer, bottom-outer ([o, y] pairs)
  function barrierProfile(c, i, side, hScale, out) {
    const oE = side < 0 ? c.vL[i] : c.vR[i], s = side, par = sideWalkW(c, i, side) > 0;
    const oT = oE - s * (par ? P.PAR_W : P.BAR_BASE), oTi = par ? oT : oE - s * P.BAR_TOP;
    const yb = surf(c, i, oT) + (par ? P.CURB_H : 0), yt = yb + (par ? P.PAR_H : P.BAR_H * hScale);
    const type = c.type[i];
    const yEdge = surf(c, i, oE);
    const bottom = type === 2 ? yEdge - 0.85 : Math.min(yEdge - 0.3, c.gY[i] - 0.3);
    out[0] = oT; out[1] = yb; out[2] = oT + s * 0.04; out[3] = Math.min(yt, yb + 0.08); out[4] = oTi; out[5] = yt; out[6] = oE; out[7] = yt; out[8] = oE; out[9] = bottom;
    return out;
  }
  const BP0 = new Float64Array(10), BP1 = new Float64Array(10), PA10 = new Float64Array(10), PB10 = new Float64Array(10);
  // usable sidewalk width on one side of sample i (0 = none: highway, joined side, or squeezed away)
  function sideWalkW(c, i, side) {
    if (!c.sw[i] || (side < 0 ? c.joinL[i] : c.joinR[i])) return 0;
    const oE = side < 0 ? -c.vL[i] : c.vR[i]; const w = oE - P.PAR_W - c.hw[i]; return w > 0.6 ? w : 0;
  }
  // barrier height factor: short sloped ends where a barrier run starts / stops at a ramp foot
  function barScale(c, i, side) {
    const bar = side < 0 ? c.barL : c.barR; let k = 0;
    for (; k < 3; k++) { if (i - k - 1 < 0 || !bar[i - k - 1] || i + k + 1 >= c.n || !bar[i + k + 1]) break; }
    if (k >= 2) return 1;
    // only taper where the deck is low (ramp feet); elsewhere the end is a gore / joint and keeps full height
    return c.y[i] < 1.6 ? 0.35 + 0.325 * k : 1;
  }

  // ---- barrier continuity: outer barrier points of every chain (4 m grid). A run end that sits on another chain's barrier line
  // (ramp leaving / joining the mainline, chain seams at nodes) gets no end cap and no crash cushion.
  const barPts = new Map(), BCELL = 4, bk = (x, z) => Math.floor(x / BCELL) * 100003 + Math.floor(z / BCELL);
  for (const c of chains) for (const side of [-1, 1]) { const bar = side < 0 ? c.barL : c.barR;
    for (let i = 0; i < c.n; i++) if (bar[i] && c.vis[i]) { const p = edgePt(c, i, side), k = bk(p[0], p[2]); let l = barPts.get(k); if (!l) barPts.set(k, (l = [])); l.push(c.id, p[0], p[1], p[2]); } }
  function barrierContinues(c, at, side, prof) {
    const x = c.x[at] - c.tz[at] * prof[6], z = c.z[at] + c.tx[at] * prof[6], y = prof[7] - P.BAR_H;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const l = barPts.get((Math.floor(x / BCELL) + di) * 100003 + Math.floor(z / BCELL) + dj); if (!l) continue;
      for (let q = 0; q < l.length; q += 4) { if (l[q] === c.id) continue; if (Math.hypot(l[q + 1] - x, l[q + 3] - z) < 1.1 && Math.abs(l[q + 2] - P.ROAD_Y - y) < 0.7) return true; }
    }
    return false;
  }
  // ---- retaining wall under a barrier on an embankment (type 1): barrier outer face, a cast coping with drip lip at deck level,
  // precast panel wall (3 m x 1.5 m joints, slight per-panel tone, 2 % batter) and a footing strip into the ground.
  const panelTone = (n) => { const h = Math.sin(n * 12.9898) * 43758.5453; return 0.955 + (h - Math.floor(h)) * 0.07; };
  function retainingWall(buf, c, side, F0, F1, pa, pb, B) {
    const oE0 = pa[6], oE1 = pb[6], yt0 = pa[7], yt1 = pb[7];
    const yE0 = F0.y + P.ROAD_Y + F0.b * oE0, yE1 = F1.y + P.ROAD_Y + F1.b * oE1, g0 = pa[9] + 0.3, g1 = pb[9] + 0.3;
    if (yE0 - g0 < 0.7 && yE1 - g1 < 0.7) return false; // ramp foot: the plain face reads better than a squashed wall
    const W = (F, o, y) => [F.x - F.tz * o, y, F.z + F.tx * o];
    const hx = side * -F0.tz, hz = side * F0.tx;
    const face = (oa0, ya0, oa1, ya1, ob0, yb0, ob1, yb1, col, nx, ny, nz, uvS = 0.25) => {
      const A0 = W(F0, oa0, ya0), A1 = W(F0, oa1, ya1), B1 = W(F1, ob1, yb1), B0 = W(F1, ob0, yb0);
      setV(va, ...A0, 0, 0, 0, F0.s * uvS, ya0 * uvS, col); setV(vb, ...A1, 0, 0, 0, F0.s * uvS, ya1 * uvS, col); setV(vc, ...B1, 0, 0, 0, F1.s * uvS, yb1 * uvS, col); setV(vd, ...B0, 0, 0, 0, F1.s * uvS, yb0 * uvS, col);
      quad(buf, va, vb, vc, vd, nx, ny, nz, B);
    };
    const s = side, CP = 0.14, cT0 = yE0 - 0.05, cT1 = yE1 - 0.05, cB0 = yE0 - 0.42, cB1 = yE1 - 0.42;
    face(oE0, yt0, oE0, cT0, oE1, yt1, oE1, cT1, COL.barrier, hx, 0, hz);                                   // barrier outer face down to the coping
    face(oE0, cT0, oE0 + s * CP, cT0, oE1, cT1, oE1 + s * CP, cT1, COL.coping, 0, 1, 0);                       // coping top
    face(oE0 + s * CP, cT0, oE0 + s * CP, cB0, oE1 + s * CP, cT1, oE1 + s * CP, cB1, COL.coping, hx, 0, hz);    // coping front
    face(oE0 + s * CP, cB0 + 0.04, oE0 + s * (CP - 0.03), cB0 + 0.04, oE1 + s * CP, cB1 + 0.04, oE1 + s * (CP - 0.03), cB1 + 0.04, COL.drip, 0, -1, 0); // drip groove
    face(oE0 + s * CP, cB0, oE0, cB0, oE1 + s * CP, cB1, oE1, cB1, COL.drip, 0, -1, 0);                        // coping underside
    // wall face (2 % batter toward the base), tone per 3 m panel at the segment middle
    const ft0 = g0 + 0.25, ft1 = g1 + 0.25, bt0 = s * 0.02 * Math.max(0, cB0 - ft0), bt1 = s * 0.02 * Math.max(0, cB1 - ft1);
    const tone = panelTone(Math.floor((F0.s + F1.s) / 2 / 3.0) + c.id * 7 + (side > 0 ? 3 : 0)), wc = [COL.wall[0] * tone, COL.wall[1] * tone, COL.wall[2] * tone];
    face(oE0, cB0, oE0 + bt0, ft0, oE1, cB1, oE1 + bt1, ft1, wc, hx, 0, hz);
    // panel joints: vertical every 3 m (by global arc length), horizontal every 1.5 m above the footing
    const jw = 0.035, out = s * 0.012;
    for (let sj = Math.ceil(F0.s / 3.0) * 3.0; sj < F1.s; sj += 3.0) {
      const f = (sj - F0.s) / Math.max(1e-6, F1.s - F0.s), Fm = { x: F0.x + (F1.x - F0.x) * f, z: F0.z + (F1.z - F0.z) * f, tx: F0.tx, tz: F0.tz }, oe = oE0 + (oE1 - oE0) * f;
      const yc = cB0 + (cB1 - cB0) * f, yf = ft0 + (ft1 - ft0) * f, bt = bt0 + (bt1 - bt0) * f;
      const P0 = (ds, o, y) => [Fm.x + Fm.tx * ds - Fm.tz * o, y, Fm.z + Fm.tz * ds + Fm.tx * o];
      const A0 = P0(-jw, oe + out, yc), A1 = P0(jw, oe + out, yc), B1 = P0(jw, oe + bt + out, yf), B0 = P0(-jw, oe + bt + out, yf);
      setV(va, ...A0, 0, 0, 0, 0, 0, COL.drip); setV(vb, ...A1, 0, 0, 0, 0, 0, COL.drip); setV(vc, ...B1, 0, 0, 0, 0, 0, COL.drip); setV(vd, ...B0, 0, 0, 0, 0, 0, COL.drip);
      quad(buf, va, vb, vc, vd, hx, 0, hz, B);
    }
    for (let k = 1; k < 12; k++) {
      const h0 = ft0 + 1.5 * k, h1 = ft1 + 1.5 * k; if (h0 > cB0 - 0.3 || h1 > cB1 - 0.3) break;
      const u0 = (h0 - ft0) / Math.max(1e-6, cB0 - ft0), u1 = (h1 - ft1) / Math.max(1e-6, cB1 - ft1), o0 = oE0 + bt0 * (1 - u0) + out, o1 = oE1 + bt1 * (1 - u1) + out;
      face(o0, h0 + jw, o0, h0 - jw, o1, h1 + jw, o1, h1 - jw, COL.drip, hx, 0, hz);
    }
    // footing strip
    const FW = 0.3;
    face(oE0 + bt0, ft0, oE0 + bt0 + s * FW, ft0, oE1 + bt1, ft1, oE1 + bt1 + s * FW, ft1, COL.footing, 0, 1, 0);
    face(oE0 + bt0 + s * FW, ft0, oE0 + bt0 + s * FW, g0 - 0.35, oE1 + bt1 + s * FW, ft1, oE1 + bt1 + s * FW, g1 - 0.35, COL.footing, hx, 0, hz);
    return true;
  }

  function buildVisual(B, segs, piersT, jointsT) {
    const asph = new GeoBuf(2048), conc = new GeoBuf(8192), mark = new GeoBuf(2048);
    for (const { c, i } of segs) {
      const j = i + 1;
      // trimmed ends: shorten the segment
      let ta = 0, tb = 1; const L = c.s[j] - c.s[i];
      if (c.s[i] < c.s0) ta = (c.s0 - c.s[i]) / L; if (c.s[j] > c.s1) tb = (c.s1 - c.s[i]) / L;
      const lerp = (a, b, t) => a + (b - a) * t;
      const P0 = { x: lerp(c.x[i], c.x[j], ta), z: lerp(c.z[i], c.z[j], ta), tx: lerp(c.tx[i], c.tx[j], ta), tz: lerp(c.tz[i], c.tz[j], ta), y: lerp(c.y[i], c.y[j], ta), b: lerp(c.bank[i], c.bank[j], ta), vL: lerp(c.vL[i], c.vL[j], ta), vR: lerp(c.vR[i], c.vR[j], ta), s: lerp(c.s[i], c.s[j], ta) };
      const P1 = { x: lerp(c.x[i], c.x[j], tb), z: lerp(c.z[i], c.z[j], tb), tx: lerp(c.tx[i], c.tx[j], tb), tz: lerp(c.tz[i], c.tz[j], tb), y: lerp(c.y[i], c.y[j], tb), b: lerp(c.bank[i], c.bank[j], tb), vL: lerp(c.vL[i], c.vL[j], tb), vR: lerp(c.vR[i], c.vR[j], tb), s: lerp(c.s[i], c.s[j], tb) };
      const full = ta === 0 && tb === 1;
      const W = (F, o, dy) => [F.x - F.tz * o, F.y + P.ROAD_Y + F.b * o + dy, F.z + F.tx * o];
      // deck top (uses the exact corner arrays when untrimmed so it matches heightAt / colliders bit for bit)
      {
        const L0 = full ? [c.lx[i], c.ly[i], c.lz[i]] : W(P0, P0.vL, 0), R0 = full ? [c.rx[i], c.ry[i], c.rz[i]] : W(P0, P0.vR, 0);
        const L1 = full ? [c.lx[j], c.ly[j], c.lz[j]] : W(P1, P1.vL, 0), R1 = full ? [c.rx[j], c.ry[j], c.rz[j]] : W(P1, P1.vR, 0);
        setV(va, L0[0], L0[1], L0[2], 0, 1, 0, P0.vL / 7, P0.s / 7, COL.deck); setV(vb, R0[0], R0[1], R0[2], 0, 1, 0, P0.vR / 7, P0.s / 7, COL.deck);
        setV(vc, R1[0], R1[1], R1[2], 0, 1, 0, P1.vR / 7, P1.s / 7, COL.deck); setV(vd, L1[0], L1[1], L1[2], 0, 1, 0, P1.vL / 7, P1.s / 7, COL.deck);
        quad(asph, va, vb, vc, vd, 0, 1, 0, B);
      }
      const t0 = c.type[i], t1 = c.type[j], open = t0 === 2 && t1 === 2, elev = t0 > 0 || t1 > 0;
      // barriers (+ fascia / retaining wall below the outer face)
      for (const side of [-1, 1]) {
        const bar = side < 0 ? c.barL : c.barR;
        if (bar[i] && bar[j]) {
          const A = barrierProfile(c, i, side, barScale(c, i, side), BP0), Bp = barrierProfile(c, j, side, barScale(c, j, side), BP1);
          const F0 = P0, F1 = P1, tA = ta, tB = tb;
          // interpolate the profile when trimmed
          const pa = PA10, pb = PB10;
          for (let k = 0; k < 10; k++) { pa[k] = lerp(A[k], Bp[k], tA); pb[k] = lerp(A[k], Bp[k], tB); }
          const cols = [COL.barrier, COL.barrier, COL.barrierTop, (t0 === 1 || t1 === 1) ? COL.wall : COL.fascia];
          const wallSeg = (t0 === 1 || t1 === 1) && t0 !== 2 && t1 !== 2;
          for (let k = 0; k < 4; k++) {
            if (k === 3 && wallSeg && retainingWall(conc, c, side, F0, F1, pa, pb, B)) continue;
            const o0a = pa[k * 2], y0a = pa[k * 2 + 1], o1a = pa[k * 2 + 2], y1a = pa[k * 2 + 3], o0b = pb[k * 2], y0b = pb[k * 2 + 1], o1b = pb[k * 2 + 2], y1b = pb[k * 2 + 3];
            const hx = k === 2 ? 0 : (k === 3 ? 1 : -1) * side * -F0.tz, hz = k === 2 ? 0 : (k === 3 ? 1 : -1) * side * F0.tx, hy = k === 2 ? 1 : (k === 1 ? 0.3 : 0);
            const col = cols[k], vS = k === 3 ? 0.25 : 0.5;
            // weathering: road grime darkens the lower barrier (tyre spray), each 6 m cast section has its own tone
            const tone = panelTone(Math.floor((F0.s + F1.s) / 12) + c.id * 5 + (side > 0 ? 2 : 0));
            const g0 = (y, yb) => tone * (0.7 + 0.3 * Math.min(1, Math.max(0, (y - yb) / P.BAR_H))), gc = (y, yb) => { const f = k === 3 ? tone : g0(y, yb); return [col[0] * f, col[1] * f, col[2] * f]; };
            // ground pass: barrier faces carry (metres along, 100 + height fraction above the deck) for the concrete shader (scuff line, scuppers, spray)
            const U = (F, y, yb) => (k < 3 ? [F.s, 100 + Math.max(0, Math.min(1, (y - yb) / P.BAR_H))] : [F.s * vS, y * vS]);
            setV(va, F0.x - F0.tz * o0a, y0a, F0.z + F0.tx * o0a, 0, 0, 0, ...U(F0, y0a, pa[1]), gc(y0a, pa[1]));
            setV(vb, F0.x - F0.tz * o1a, y1a, F0.z + F0.tx * o1a, 0, 0, 0, ...U(F0, y1a, pa[1]), gc(y1a, pa[1]));
            setV(vc, F1.x - F1.tz * o1b, y1b, F1.z + F1.tx * o1b, 0, 0, 0, ...U(F1, y1b, pb[1]), gc(y1b, pb[1]));
            setV(vd, F1.x - F1.tz * o0b, y0b, F1.z + F1.tx * o0b, 0, 0, 0, ...U(F1, y0b, pb[1]), gc(y0b, pb[1]));
            quad(conc, va, vb, vc, vd, hx, hy, hz, B);
          }
          // end caps where the run stops
          for (const [at, has, F, prof, dir] of [[i, i > 0 && bar[i - 1], F0, pa, -1], [j, j < c.n - 1 && bar[j + 1], F1, pb, 1]]) {
            if (has && !((at === i && ta > 0) || (at === j && tb < 1))) continue;
            if (barrierContinues(c, at, side, prof)) continue; // another deck's barrier carries on right here: no nose / cap (no overlapping ends)
            // crash cushion (impact attenuator) ahead of a barrier nose that faces oncoming traffic on an elevated deck
            if (dir < 0 && c.lanesB[at] === 0 && c.y[at] >= 1.6 && cushionClear(c, at, (prof[0] + prof[6]) / 2)) cushion(conc, F, (prof[0] + prof[6]) / 2, prof[1], B);
            const pts = []; for (let k = 0; k < 5; k++) pts.push([F.x - F.tz * prof[k * 2], prof[k * 2 + 1], F.z + F.tx * prof[k * 2]]);
            pts.push([F.x - F.tz * prof[0], prof[9], F.z + F.tx * prof[0]]);
            const hx = F.tx * dir, hz = F.tz * dir;
            for (let k = 1; k + 1 < pts.length; k++) { setV(va, ...pts[0], 0, 0, 0, 0, 0, COL.barrier); setV(vb, ...pts[k], 0, 0, 0, 0, 0, COL.barrier); setV(vc, ...pts[k + 1], 0, 0, 0, 0, 0, COL.barrier); setV(vd, ...pts[k + 1], 0, 0, 0, 0, 0, COL.barrier); quadTri(conc, va, vb, vc, hx, 0, hz, B); }
          }
        } else if (elev && !(side < 0 ? c.joinL[i] && c.joinL[j] : c.joinR[i] && c.joinR[j])) {
          // no barrier but raised (ramp foot / gap edge): plain slab edge down to the ground or soffit
          const oa = side < 0 ? P0.vL : P0.vR, ob = side < 0 ? P1.vL : P1.vR;
          const ya = P0.y + P.ROAD_Y + P0.b * oa, yb = P1.y + P.ROAD_Y + P1.b * ob;
          const ba = open ? ya - 0.85 : Math.min(ya - 0.3, -0.3), bb = open ? yb - 0.85 : Math.min(yb - 0.3, -0.3);
          setV(va, P0.x - P0.tz * oa, ya, P0.z + P0.tx * oa, 0, 0, 0, P0.s / 4, ya / 4, COL.wall); setV(vb, P0.x - P0.tz * oa, ba, P0.z + P0.tx * oa, 0, 0, 0, P0.s / 4, ba / 4, COL.wall);
          setV(vc, P1.x - P1.tz * ob, bb, P1.z + P1.tx * ob, 0, 0, 0, P1.s / 4, bb / 4, COL.wall); setV(vd, P1.x - P1.tz * ob, yb, P1.z + P1.tx * ob, 0, 0, 0, P1.s / 4, yb / 4, COL.wall);
          quad(conc, va, vb, vc, vd, side * -P0.tz, 0, side * P0.tx, B);
        }
      }
      // soffit + girders under open spans
      if (open) {
        const yA = (o) => P0.y + P.ROAD_Y + P0.b * o, yB = (o) => P1.y + P.ROAD_Y + P1.b * o;
        const slab = (F, o, yf) => [F.x - F.tz * o, yf(o) - 0.85, F.z + F.tx * o];
        const a0 = slab(P0, P0.vL, yA), b0 = slab(P0, P0.vR, yA), b1 = slab(P1, P1.vR, yB), a1 = slab(P1, P1.vL, yB);
        setV(va, ...a0, 0, 0, 0, a0[0] / 4, a0[2] / 4, COL.soffit); setV(vb, ...b0, 0, 0, 0, b0[0] / 4, b0[2] / 4, COL.soffit); setV(vc, ...b1, 0, 0, 0, b1[0] / 4, b1[2] / 4, COL.soffit); setV(vd, ...a1, 0, 0, 0, a1[0] / 4, a1[2] / 4, COL.soffit);
        quad(conc, va, vb, vc, vd, 0, -1, 0, B);
        // girders: 0.7 m wide beams every ~2.9 m across the slab, hanging to DECK_D
        const Wd = Math.min(P0.vR - P0.vL, P1.vR - P1.vL), ng = Math.max(1, Math.round((Wd - 1.6) / 2.9));
        for (let g = 0; g < ng; g++) {
          const f = (g + 0.5) / ng;
          for (const [d0, d1, hy, isSide] of [[-0.35, 0.35, -1, 0], [-0.35, -0.35, 0, -1], [0.35, 0.35, 0, 1]]) {
            const oa0 = lerp(P0.vL + 0.8, P0.vR - 0.8, f) + d0, oa1 = lerp(P0.vL + 0.8, P0.vR - 0.8, f) + d1, ob0 = lerp(P1.vL + 0.8, P1.vR - 0.8, f) + d0, ob1 = lerp(P1.vL + 0.8, P1.vR - 0.8, f) + d1;
            if (!isSide) {
              const q = (F, o, yf) => [F.x - F.tz * o, yf(o) - P.DECK_D, F.z + F.tx * o];
              const A0 = q(P0, oa0, yA), A1 = q(P0, oa1, yA), B1 = q(P1, ob1, yB), B0 = q(P1, ob0, yB);
              setV(va, ...A0, 0, 0, 0, 0, 0, COL.girder); setV(vb, ...A1, 0, 0, 0, 0, 0, COL.girder); setV(vc, ...B1, 0, 0, 0, 0, 0, COL.girder); setV(vd, ...B0, 0, 0, 0, 0, 0, COL.girder);
              quad(conc, va, vb, vc, vd, 0, -1, 0, B);
            } else {
              const tp = (F, o, yf) => [F.x - F.tz * o, yf(o) - 0.85, F.z + F.tx * o], bt = (F, o, yf) => [F.x - F.tz * o, yf(o) - P.DECK_D, F.z + F.tx * o];
              const A0 = tp(P0, oa0, yA), A1 = bt(P0, oa0, yA), B1 = bt(P1, ob0, yB), B0 = tp(P1, ob0, yB);
              setV(va, ...A0, 0, 0, 0, P0.s / 4, A0[1] / 4, COL.girder); setV(vb, ...A1, 0, 0, 0, P0.s / 4, A1[1] / 4, COL.girder); setV(vc, ...B1, 0, 0, 0, P1.s / 4, B1[1] / 4, COL.girder); setV(vd, ...B0, 0, 0, 0, P1.s / 4, B0[1] / 4, COL.girder);
              quad(conc, va, vb, vc, vd, isSide * -P0.tz, 0, isSide * P0.tx, B);
            }
          }
        }
      }
      // raised sidewalks (urban bridges): top + curb face, between carriageway edge and parapet
      for (const side of [-1, 1]) {
        const wa = sideWalkW(c, i, side), wb = sideWalkW(c, j, side); if (!(wa > 0 && wb > 0)) continue;
        const ia = side * c.hw[i], ib = side * c.hw[j], oa = ia + side * wa, ob = ib + side * wb, ka = lerp(ia, ib, ta), kb = lerp(ia, ib, tb), qa = lerp(oa, ob, ta), qb = lerp(oa, ob, tb);
        const Wp = (F, o, dy) => [F.x - F.tz * o, F.y + P.ROAD_Y + F.b * o + dy, F.z + F.tx * o];
        const A0 = Wp(P0, ka, P.CURB_H), A1 = Wp(P0, qa, P.CURB_H), B1 = Wp(P1, qb, P.CURB_H), B0 = Wp(P1, kb, P.CURB_H);
        setV(va, ...A0, 0, 1, 0, A0[0] / 2.5, A0[2] / 2.5, COL.walk); setV(vb, ...A1, 0, 1, 0, A1[0] / 2.5, A1[2] / 2.5, COL.walk); setV(vc, ...B1, 0, 1, 0, B1[0] / 2.5, B1[2] / 2.5, COL.walk); setV(vd, ...B0, 0, 1, 0, B0[0] / 2.5, B0[2] / 2.5, COL.walk);
        quad(conc, va, vb, vc, vd, 0, 1, 0, B);
        const C0 = Wp(P0, ka, 0), C1 = Wp(P1, kb, 0);
        setV(va, ...C0, 0, 0, 0, P0.s / 3, 0, COL.curb); setV(vb, ...A0, 0, 0, 0, P0.s / 3, 0.05, COL.curb); setV(vc, ...B0, 0, 0, 0, P1.s / 3, 0.05, COL.curb); setV(vd, ...C1, 0, 0, 0, P1.s / 3, 0, COL.curb);
        quad(conc, va, vb, vc, vd, -side * -P0.tz, 0, -side * P0.tx, B);
      }
      // lane markings
      markings(mark, c, i, P0, P1, B);
    }
    // abutments: embankment <-> open span transitions get an end wall under the deck
    for (const { c, i } of segs) {
      const j = i + 1; if (c.type[i] === c.type[j] || (c.type[i] !== 2 && c.type[j] !== 2) || (c.type[i] === 0 || c.type[j] === 0)) continue;
      const k = c.type[i] === 2 ? j : i, dir = c.type[i] === 2 ? -1 : 1; // face toward the open span
      const yL = surf(c, k, c.vL[k]), yR = surf(c, k, c.vR[k]), g = c.gY[k] - 0.3;
      setV(va, px(c, k, c.vL[k]), yL - 0.85, pz(c, k, c.vL[k]), 0, 0, 0, 0, 0, COL.wall); setV(vb, px(c, k, c.vR[k]), yR - 0.85, pz(c, k, c.vR[k]), 0, 0, 0, 1, 0, COL.wall);
      setV(vc, px(c, k, c.vR[k]), g, pz(c, k, c.vR[k]), 0, 0, 0, 1, 1, COL.wall); setV(vd, px(c, k, c.vL[k]), g, pz(c, k, c.vL[k]), 0, 0, 0, 0, 1, COL.wall);
      quad(conc, va, vb, vc, vd, -dir * c.tx[k], 0, -dir * c.tz[k], B);
    }
    // piers: round columns + cap beam
    for (const p of piersT) pierGeo(conc, p, B);
    // expansion joints
    for (const jt of jointsT) jointGeo(mark, jt, B);
    return { asph, conc, mark };
  }
  // yellow / black striped attenuator box: 0.55 wide, 0.85 tall, 2.6 long, extending back along -t from the barrier nose
  const CUSH_Y = [0.96, 0.78, 0.1], CUSH_K = [0.08, 0.08, 0.08];
  const at = (a, j, u) => a[j] + (a[j + 1] - a[j]) * u;
  // is lateral offset o at samples k-3..k on another deck's carriageway (at about this level)?
  function cushionClear(c, k, o) {
    for (let q = Math.max(0, k - 7); q <= Math.min(c.n - 1, k + 1); q++) for (const r of c.rel[q]) { if (r.k < 0) continue; const ck = chains[r.k], lk = r.a + o * r.b; if (Math.abs(lk) > at(ck.hw, r.j, r.u) + 1.6) continue; if (Math.abs((r.dy ?? 0)) < 2.2) return false; }
    return true;
  }
  function cushion(buf, F, o, y0, B) {
    const L = 2.6, hw = 0.27, H = 0.85, segs = 5;
    for (let k = 0; k < segs; k++) {
      const s0 = -L * k / segs - 0.05, s1 = -L * (k + 1) / segs - 0.05, col = k % 2 ? CUSH_K : CUSH_Y;
      const P = (ds, dl, dy) => [F.x + F.tx * ds - F.tz * (o + dl), y0 + dy, F.z + F.tz * ds + F.tx * (o + dl)];
      const faces = [[P(s0, -hw, H), P(s1, -hw, H), P(s1, hw, H), P(s0, hw, H), 0, 1, 0], [P(s0, -hw, 0), P(s1, -hw, 0), P(s1, -hw, H), P(s0, -hw, H), F.tz, 0, -F.tx], [P(s0, hw, 0), P(s1, hw, 0), P(s1, hw, H), P(s0, hw, H), -F.tz, 0, F.tx]];
      if (k === segs - 1) faces.push([P(s1, -hw, 0), P(s1, hw, 0), P(s1, hw, H), P(s1, -hw, H), -F.tx, 0, -F.tz]);
      for (const [a, b2, c2, d, hx, hy, hz] of faces) { setV(va, ...a, 0, 0, 0, 0, 0, col); setV(vb, ...b2, 0, 0, 0, 0, 0, col); setV(vc, ...c2, 0, 0, 0, 0, 0, col); setV(vd, ...d, 0, 0, 0, 0, 0, col); quad(buf, va, vb, vc, vd, hx, hy, hz, B); }
    }
  }
  function quadTri(buf, a, b, c, hx, hy, hz, B) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz); if (l < 1e-10) return;
    nx /= l; ny /= l; nz /= l; const flip = nx * hx + ny * hy + nz * hz < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    for (const v of [a, b, c]) { v[3] = nx; v[4] = ny; v[5] = nz; }
    if (!flip) triClip(buf, a, b, c, B); else triClip(buf, a, c, b, B);
  }
  // lane / edge lines for one segment (dashes by global arc length so they line up across tiles). Offsets are evaluated at both
  // ends of the segment (highways track): edge lines follow the visible deck and keep a fixed shoulder off the barrier toe, so they
  // bend with a ramp that widens / narrows instead of running straight into the barrier; lines that would end up under a barrier
  // or off the deck are dropped.
  function markings(buf, c, i, P0, P1, B) {
    const j = i + 1, lf = c.lanesF[i], lb = c.lanesB[i], tot = Math.max(1, lf + lb);
    if (c.y[i] < -1 || (c.type[i] === 0 && c.type[j] === 0 && c.kind === 'service')) return;
    const oneway = lb === 0 || lf === 0;
    // per end: carriageway half width, visible deck edges and the usable band between the barrier toes (+ a 0.3 m paint margin)
    const end = (k, F) => {
      const hw = c.hw[k], tl = c.barL[k] ? P.BAR_BASE + 0.3 : 0.3, tr = c.barR[k] ? P.BAR_BASE + 0.3 : 0.3;
      return { hw, lo: F.vL + tl, hi: F.vR - tr, lw: (2 * hw) / tot };
    };
    const A = end(i, P0), Bn = end(j, P1);
    const lines = []; // [offsetA, offsetB, halfWidth, colour, dashed]
    const edgeCol = oneway && tot >= 2 && /motorway|trunk/.test(c.kind) ? COL.yellow : COL.white;
    // edge lines: on the carriageway edge, pulled in to stay a shoulder off a barrier that squeezes the deck
    lines.push([Math.max(-A.hw + 0.15, A.lo + 0.08), Math.max(-Bn.hw + 0.15, Bn.lo + 0.08), 0.08, edgeCol, false]);
    lines.push([Math.min(A.hw - 0.15, A.hi - 0.08), Math.min(Bn.hw - 0.15, Bn.hi - 0.08), 0.08, COL.white, false]);
    for (let k = 1; k < tot; k++) {
      const oa = -A.hw + k * A.lw, ob = -Bn.hw + k * Bn.lw;
      if (!oneway && k === lb) { lines.push([oa - 0.17, ob - 0.17, 0.06, COL.yellow, false]); lines.push([oa + 0.17, ob + 0.17, 0.06, COL.yellow, false]); }
      else lines.push([oa, ob, 0.06, COL.white, true]);
    }
    const sa = P0.s, sb = P1.s; if (sb - sa < 1e-3) return;
    for (const [oa, ob, w, col, dashed] of lines) {
      // inside the usable band at both ends (not under a neighbour / barrier); edge lines need a 1.2 m lane-side clearance too
      if (oa - w < A.lo - 0.1 || oa + w > A.hi + 0.1 || ob - w < Bn.lo - 0.1 || ob + w > Bn.hi + 0.1) continue;
      if (Math.abs(ob - oa) > 0.6) continue; // a jump this big in 2 m is a seam artefact, not a taper
      const pieces = [];
      if (!dashed) pieces.push([sa, sb]);
      else { const per = 12, dl = 3; let s0 = Math.floor(sa / per) * per; for (; s0 < sb; s0 += per) { const a = Math.max(sa, s0), b = Math.min(sb, s0 + dl); if (b > a) pieces.push([a, b]); } }
      for (const [a, b] of pieces) {
        const fa = (a - sa) / (sb - sa), fb = (b - sa) / (sb - sa);
        const F = (f, dw) => { const oo = oa + (ob - oa) * f + dw, x = P0.x + (P1.x - P0.x) * f, z = P0.z + (P1.z - P0.z) * f, tx = P0.tx + (P1.tx - P0.tx) * f, tz = P0.tz + (P1.tz - P0.tz) * f, y = P0.y + (P1.y - P0.y) * f, bk = P0.b + (P1.b - P0.b) * f; return [x - tz * oo, y + P.ROAD_Y + bk * oo + 0.012, z + tx * oo]; };
        const A0 = F(fa, -w), A1 = F(fa, w), B1 = F(fb, w), B0 = F(fb, -w);
        setV(va, ...A0, 0, 1, 0, 0, 0, col); setV(vb, ...A1, 0, 1, 0, 0, 0, col); setV(vc, ...B1, 0, 1, 0, 0, 0, col); setV(vd, ...B0, 0, 1, 0, 0, 0, col);
        quad(buf, va, vb, vc, vd, 0, 1, 0, B);
      }
    }
  }
  function jointGeo(buf, jt, B) {
    const c = chains[jt.chain], f = net.framesAt(c, jt.s), w = 0.07;
    const oa = f.vL + P.BAR_BASE, ob = f.vR - P.BAR_BASE; if (ob - oa < 1) return;
    const Q = (o, ds) => [f.x - f.tz * o + f.tx * ds, f.y + P.ROAD_Y + f.bank * o + 0.009, f.z + f.tx * o + f.tz * ds];
    const A0 = Q(oa, -w), A1 = Q(ob, -w), B1 = Q(ob, w), B0 = Q(oa, w);
    setV(va, ...A0, 0, 1, 0, 0, 0, COL.joint); setV(vb, ...A1, 0, 1, 0, 0, 0, COL.joint); setV(vc, ...B1, 0, 1, 0, 0, 0, COL.joint); setV(vd, ...B0, 0, 1, 0, 0, 0, COL.joint);
    quad(buf, va, vb, vc, vd, 0, 1, 0, B);
  }
  const SEG = 14;
  function pierGeo(buf, p, B) {
    const capH = 1.15, capD = 1.7, capTop = p.soffit, capBot = capTop - capH, o0 = p.vL + 0.5, o1 = p.vR - 0.5;
    // cap beam (box oriented with the deck)
    const nx = -p.tz, nz = p.tx;
    const corner = (o, ds, y) => [p.x + nx * o + p.tx * ds, y, p.z + nz * o + p.tz * ds];
    const faces = [ // [corners..., hint]
      [[o0, -capD / 2, capTop], [o1, -capD / 2, capTop], [o1, -capD / 2, capBot], [o0, -capD / 2, capBot], -p.tx, 0, -p.tz],
      [[o0, capD / 2, capTop], [o1, capD / 2, capTop], [o1, capD / 2, capBot], [o0, capD / 2, capBot], p.tx, 0, p.tz],
      [[o0, -capD / 2, capBot], [o1, -capD / 2, capBot], [o1, capD / 2, capBot], [o0, capD / 2, capBot], 0, -1, 0],
      [[o0, -capD / 2, capTop], [o0, capD / 2, capTop], [o0, capD / 2, capBot + 0.35], [o0, -capD / 2, capBot + 0.35], -nx, 0, -nz],
      [[o1, -capD / 2, capTop], [o1, capD / 2, capTop], [o1, capD / 2, capBot + 0.35], [o1, -capD / 2, capBot + 0.35], nx, 0, nz],
    ];
    for (const [a, b, cc, d, hx, hy, hz] of faces) {
      const A = corner(...a), Bq = corner(...b), C = corner(...cc), D = corner(...d);
      setV(va, ...A, 0, 0, 0, a[0] / 3, a[2] / 3, COL.cap); setV(vb, ...Bq, 0, 0, 0, b[0] / 3, b[2] / 3, COL.cap); setV(vc, ...C, 0, 0, 0, cc[0] / 3, cc[2] / 3, COL.cap); setV(vd, ...D, 0, 0, 0, d[0] / 3, d[2] / 3, COL.cap);
      quad(buf, va, vb, vc, vd, hx, hy, hz, B);
    }
    for (const [cx, cz, g] of p.cols) {
      const r = p.r, y0 = g - 0.5, y1 = capBot + 0.05;
      for (let k = 0; k < SEG; k++) {
        const a0 = (k / SEG) * Math.PI * 2, a1 = ((k + 1) / SEG) * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        setV(va, cx + c0 * r, y0, cz + s0 * r, c0, 0, s0, k / SEG * 3, y0 / 3, COL.pier); setV(vb, cx + c1 * r, y0, cz + s1 * r, c1, 0, s1, (k + 1) / SEG * 3, y0 / 3, COL.pier);
        setV(vc, cx + c1 * r, y1, cz + s1 * r, c1, 0, s1, (k + 1) / SEG * 3, y1 / 3, COL.pier); setV(vd, cx + c0 * r, y1, cz + s0 * r, c0, 0, s0, k / SEG * 3, y1 / 3, COL.pier);
        // smooth normals: emit directly (outward winding)
        const tri = (A, Bv, C) => { triClip(buf, A, Bv, C, B); };
        if ((vb[0] - va[0]) * (vc[2] - va[2]) - (vb[2] - va[2]) * (vc[0] - va[0]) >= 0) { tri(va, vc, vb); tri(va, vd, vc); } else { tri(va, vb, vc); tri(va, vc, vd); }
      }
    }
  }

  // ---- colliders
  function buildColliders(RAPIER, B, segs, piersT, runsT) { const it = buildCollidersGen(RAPIER, B, segs, piersT, runsT); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
  function* buildCollidersGen(RAPIER, B, segs, piersT, runsT, out = []) {
    const Bc = { x0: B.x0 - 0.05, x1: B.x1 + 0.05, z0: B.z0 - 0.05, z1: B.z1 + 0.05 };
    let pb = new PosBuf(1024), nSegDone = 0;
    const flushMesh = () => {
      if (pb.n < 3) return;
      const vtx = pb.p.subarray(0, pb.n * 3), idx = new Uint32Array(pb.n); for (let k = 0; k < pb.n; k++) idx[k] = k;
      const flags = RAPIER.TriMeshFlags ? RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES : undefined;
      out.push({ desc: flags !== undefined ? RAPIER.ColliderDesc.trimesh(Float32Array.from(vtx), idx, flags) : RAPIER.ColliderDesc.trimesh(Float32Array.from(vtx), idx), kind: 'deck' });
      pb = new PosBuf(1024);
    };
    for (const { c, i } of segs) {
      if (++nSegDone % 120 === 0) yield; // one trimesh per tile: separate colliders would leave ghost edges inside the deck
      const j = i + 1, L = c.s[j] - c.s[i]; let ta = 0, tb = 1;
      if (c.s[i] < c.s0) ta = (c.s0 - c.s[i]) / L; if (c.s[j] > c.s1) tb = (c.s1 - c.s[i]) / L;
      let L0, R0, L1, R1;
      if (ta === 0 && tb === 1) { L0 = [c.lx[i], c.ly[i], c.lz[i]]; R0 = [c.rx[i], c.ry[i], c.rz[i]]; L1 = [c.lx[j], c.ly[j], c.lz[j]]; R1 = [c.rx[j], c.ry[j], c.rz[j]]; }
      else { const ip = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; const l0 = [c.lx[i], c.ly[i], c.lz[i]], l1 = [c.lx[j], c.ly[j], c.lz[j]], r0 = [c.rx[i], c.ry[i], c.rz[i]], r1 = [c.rx[j], c.ry[j], c.rz[j]]; L0 = ip(l0, l1, ta); L1 = ip(l0, l1, tb); R0 = ip(r0, r1, ta); R1 = ip(r0, r1, tb); }
      setV(va, ...L0, 0, 1, 0, 0, 0, COL.deck); setV(vb, ...R0, 0, 1, 0, 0, 0, COL.deck); setV(vc, ...R1, 0, 1, 0, 0, 0, COL.deck); setV(vd, ...L1, 0, 1, 0, 0, 0, COL.deck);
      triClip(pb, va, vb, vc, Bc); triClip(pb, va, vc, vd, Bc);
      for (const side of [-1, 1]) { const wa = sideWalkW(c, i, side), wb = sideWalkW(c, j, side); if (!(wa > 0 && wb > 0) || ta !== 0 || tb !== 1) continue;
        const ia = side * c.hw[i], ib = side * c.hw[j], oa = ia + side * wa, ob = ib + side * wb;
        const Wp = (k, o, dy) => [c.x[k] - c.tz[k] * o, c.y[k] + P.ROAD_Y + c.bank[k] * o + dy, c.z[k] + c.tx[k] * o];
        const A0 = Wp(i, ia, P.CURB_H), A1 = Wp(i, oa, P.CURB_H), B1 = Wp(j, ob, P.CURB_H), B0 = Wp(j, ib, P.CURB_H), C0 = Wp(i, ia, 0), C1 = Wp(j, ib, 0);
        setV(va, ...A0, 0, 1, 0, 0, 0, COL.deck); setV(vb, ...A1, 0, 1, 0, 0, 0, COL.deck); setV(vc, ...B1, 0, 1, 0, 0, 0, COL.deck); setV(vd, ...B0, 0, 1, 0, 0, 0, COL.deck);
        if (side > 0) { triClip(pb, va, vb, vc, Bc); triClip(pb, va, vc, vd, Bc); } else { triClip(pb, va, vc, vb, Bc); triClip(pb, va, vd, vc, Bc); }
        setV(va, ...C0, 0, 0, 0, 0, 0, COL.deck); setV(vb, ...A0, 0, 0, 0, 0, 0, COL.deck); setV(vc, ...B0, 0, 0, 0, 0, 0, COL.deck); setV(vd, ...C1, 0, 0, 0, 0, 0, COL.deck);
        triClip(pb, va, vb, vc, Bc); triClip(pb, va, vc, vd, Bc); }
      // slab underside (0.85 below) so nothing tunnels up through a deck
      if (c.type[i] === 2 && c.type[j] === 2) {
        for (const v of [va, vb, vc, vd]) v[1] -= 0.85;
        triClip(pb, va, vc, vb, Bc); triClip(pb, va, vd, vc, Bc);
      }
    }
    flushMesh(); yield;
    // barrier runs: convex hulls of the exact rendered profile at both run ends
    let nh = 0;
    for (const r of runsT) {
      if (++nh % 40 === 0) yield;
      const pts = [];
      for (const k of [r.i0, r.i1]) {
        const pr = barrierProfile(r.c, k, r.side, barScale(r.c, k, r.side), new Float64Array(10)), c = r.c;
        for (let m = 0; m < 5; m++) pts.push(px(c, k, pr[m * 2]), pr[m * 2 + 1], pz(c, k, pr[m * 2]));
        pts.push(px(c, k, pr[0]), pr[9], pz(c, k, pr[0])); // under the toe (closes the solid down to the slab / ground)
      }
      const d = RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
      if (d) out.push({ desc: d, kind: 'barrier' });
      // crash cushion at a run start that faces traffic (same rule as the visual)
      { const c = r.c, k = r.i0, bar = r.side < 0 ? c.barL : c.barR;
        if ((k === 0 || !bar[k - 1]) && c.lanesB[k] === 0 && c.y[k] >= 1.6) {
          const pr = barrierProfile(c, k, r.side, barScale(c, k, r.side), new Float64Array(10)), o = (pr[0] + pr[6]) / 2; if (!cushionClear(c, k, o)) continue; const ry = Math.atan2(c.tx[k], c.tz[k]);
          const cx = c.x[k] - c.tz[k] * o - c.tx[k] * 1.35, cz = c.z[k] + c.tx[k] * o - c.tz[k] * 1.35;
          out.push({ desc: RAPIER.ColliderDesc.cuboid(0.27, 0.425, 1.3).setTranslation(cx, pr[1] + 0.425, cz).setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) }), kind: 'cushion' });
        } }
    }
    // piers
    for (const p of piersT) {
      const capH = 1.15, capTop = p.soffit, capBot = capTop - capH, o0 = p.vL + 0.5, o1 = p.vR - 0.5, om = (o0 + o1) / 2, ry = Math.atan2(p.tx, p.tz);
      const q = { x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) };
      out.push({ desc: RAPIER.ColliderDesc.cuboid((o1 - o0) / 2, capH / 2, 0.85).setTranslation(p.x - p.tz * om, (capTop + capBot) / 2, p.z + p.tx * om).setRotation(q), kind: 'pierCap' });
      for (const [cx, cz, g] of p.cols) { const y0 = g - 0.5, y1 = capBot + 0.05; out.push({ desc: RAPIER.ColliderDesc.cylinder((y1 - y0) / 2, p.r).setTranslation(cx, (y0 + y1) / 2, cz), kind: 'pier' }); }
    }
    return out;
  }

  function gather(B) {
    const segs = [], piersT = [], lampsT = [], runsT = [], seen = new Set();
    for (let i = Math.floor(B.x0 / CELL); i <= Math.floor(B.x1 / CELL); i++) for (let j = Math.floor(B.z0 / CELL); j <= Math.floor(B.z1 / CELL); j++) {
      for (const it of cells.get(ck(i, j)) || []) {
        if (seen.has(it)) continue; seen.add(it);
        if (it.t === 0) segs.push(it);
        else if (it.t === 1) { if (it.p.x >= B.x0 && it.p.x < B.x1 && it.p.z >= B.z0 && it.p.z < B.z1) piersT.push(it.p); }
        else if (it.t === 2) { if (it.l.x >= B.x0 && it.l.x < B.x1 && it.l.z >= B.z0 && it.l.z < B.z1) lampsT.push(it.l); }
        else if (it.t === 3) { const r = it.r, m = edgePt(r.c, (r.i0 + r.i1) >> 1, r.side); if (m[0] >= B.x0 && m[0] < B.x1 && m[2] >= B.z0 && m[2] < B.z1) runsT.push(r); }
      }
    }
    const jointsT = [];
    for (const jt of net.joints) { const c = chains[jt.chain], f = jt._frame || (jt._frame = net.framesAt(c, jt.s)); /* joints never move: cache (was ~1 GB of garbage per 20 s of streaming) */ if (f.x >= B.x0 - 30 && f.x < B.x1 + 30 && f.z >= B.z0 - 30 && f.z < B.z1 + 30) jointsT.push(jt); }
    return { segs, piersT, lampsT, runsT, jointsT };
  }

  // low-LOD (mid / far rings): every 3rd sample, deck top + barrier block + fascia / wall + soffit + pier boxes, vertex colours only
  function buildLod(B, step = 3) {
    const buf = new GeoBuf(4096), g = gather(B), seen = new Set(), ASPH = [0.33, 0.33, 0.34];
    for (const { c, i } of g.segs) {
      const i0 = i - (i % step); if (seen.has(c.id * 100000 + i0)) continue; seen.add(c.id * 100000 + i0);
      const j = Math.min(c.n - 1, i0 + step); if (!(c.vis[i0] && c.vis[j])) continue;
      const pt = (k, o, dy) => [c.x[k] - c.tz[k] * o, c.y[k] + P.ROAD_Y + c.bank[k] * o + dy, c.z[k] + c.tx[k] * o];
      const q = (A, Bq, C, D, col, hx, hy, hz) => { setV(va, ...A, 0, 0, 0, 0, 0, col); setV(vb, ...Bq, 0, 0, 0, 0, 0, col); setV(vc, ...C, 0, 0, 0, 0, 0, col); setV(vd, ...D, 0, 0, 0, 0, 0, col); quad(buf, va, vb, vc, vd, hx, hy, hz, B); };
      // The city shows mid / far chunks while the near tile is up too (highways track, Nov 14: raycasts hit the LOD barrier slab
      // 0.3 m in FRONT of the real jersey barrier, and the untextured LOD deck z-fought the real one: the "flat white slabs" and the
      // "blue deck"). So the LOD shell sits strictly INSIDE the full-detail geometry: deck 6 cm lower, barrier block inset under the
      // jersey profile (outer face 6 cm in, inner face at the top width, 10 cm lower), so the near tile always wins where it exists.
      q(pt(i0, c.vL[i0] + 0.06, -0.06), pt(i0, c.vR[i0] - 0.06, -0.06), pt(j, c.vR[j] - 0.06, -0.06), pt(j, c.vL[j] + 0.06, -0.06), ASPH, 0, 1, 0);
      const open = c.type[i0] === 2 && c.type[j] === 2;
      for (const side of [-1, 1]) {
        const bar = side < 0 ? c.barL : c.barR; let oa = side < 0 ? c.vL[i0] : c.vR[i0], ob = side < 0 ? c.vL[j] : c.vR[j]; const hasBar = bar[i0] && bar[j];
        const top = hasBar ? P.BAR_H - 0.1 : -0.06, bot = (k, o) => (open ? -0.85 - (c.y[k] + P.ROAD_Y + c.bank[k] * o) + c.y[k] : c.gY[k] - 0.3 - (c.y[k] + P.ROAD_Y + c.bank[k] * o));
        if (c.type[i0] === 0 && c.type[j] === 0) continue;
        const oa6 = oa - side * 0.06, ob6 = ob - side * 0.06;
        q(pt(i0, oa6, top), pt(i0, oa6, bot(i0, oa) + 0.06), pt(j, ob6, bot(j, ob) + 0.06), pt(j, ob6, top), COL.fascia, side * -c.tz[i0], 0, side * c.tx[i0]);
        if (hasBar) { const ia = oa - side * P.BAR_TOP, ib = ob - side * P.BAR_TOP; const oa_ = oa6, ob_ = ob6; oa = oa_; ob = ob_; q(pt(i0, ia, top), pt(i0, oa, top), pt(j, ob, top), pt(j, ib, top), COL.barrierTop, 0, 1, 0); q(pt(i0, ia, 0), pt(i0, ia, top), pt(j, ib, top), pt(j, ib, 0), COL.barrier, -side * -c.tz[i0], 0, -side * c.tx[i0]); }
      }
      if (open) q(pt(i0, c.vL[i0] + 0.06, -0.79), pt(i0, c.vR[i0] - 0.06, -0.79), pt(j, c.vR[j] - 0.06, -0.79), pt(j, c.vL[j] + 0.06, -0.79), COL.soffit, 0, -1, 0);
    }
    for (const p of g.piersT) for (const [cx, cz, gy] of p.cols) { const r = p.r, y1 = p.soffit;
      for (const [dx0, dz0, dx1, dz1, hx, hz] of [[-r, -r, r, -r, 0, -1], [r, -r, r, r, 1, 0], [r, r, -r, r, 0, 1], [-r, r, -r, -r, -1, 0]]) { setV(va, cx + dx0, gy, cz + dz0, 0, 0, 0, 0, 0, COL.pier); setV(vb, cx + dx1, gy, cz + dz1, 0, 0, 0, 0, 0, COL.pier); setV(vc, cx + dx1, y1, cz + dz1, 0, 0, 0, 0, 0, COL.pier); setV(vd, cx + dx0, y1, cz + dz0, 0, 0, 0, 0, 0, COL.pier); quad(buf, va, vb, vc, vd, hx, 0, hz, B); } }
    return buf;
  }
  return { gather, buildVisual, buildColliders, buildCollidersGen, buildLod, runs, COL };
}
