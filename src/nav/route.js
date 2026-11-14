// PORT SOLANA V2 navigation: turns a raw arc sequence into the Route object the game uses:
// a lane-level polyline (the lane the car should be in, smooth through junctions and along ramps), maneuvers, and
// distance / time tables for progress, ETA and re-routing.

import { AF, K, wrapPi, KINDS, str } from './graph.js';
import { compileProfile } from './engine.js';
import { buildManeuvers } from './maneuvers.js';

/** Lane-center offset from the edge centerline, + = right of travel. lane 0 = curb (rightmost) lane. Same formula as the traffic lanes. */
export function laneOffset(G, arc, lane) {
  const k = G.aEdge[arc], nl = Math.max(1, G.eLanesF[k] + G.eLanesB[k]);
  const lw = Math.min(3.7, Math.max(2.6, (G.eWidth[k] - (G.eKind[k] === K.motorway ? 0 : 1)) / nl));
  const mine = Math.max(1, G.aLanes[arc]);
  lane = Math.min(Math.max(0, lane), mine - 1);
  return (nl / 2 - lane - 0.5) * lw;
}

/**
 * @param G      nav graph
 * @param router Router (for current costs) or null
 * @param raw    { arcs, startS, endS, cost, snapFrom, snapTo, profile }
 * @param opts   { from:{x,z}, to:{x,z}, destName, lanes:true }
 */
export function assembleRoute(G, router, raw, opts = {}) {
  const man = buildManeuvers(G, raw, { destName: opts.destName, toPoint: opts.to });
  const geo = buildGeometry(G, raw, man, opts);
  const n = raw.arcs.length;
  // time table (seconds at the start of each arc, under the traffic at build time)
  const arcT = new Float64Array(n + 1);
  let P = compileProfile(raw.profile || opts.profile);
  const profileName = P.name;
  if (P.metric !== 'time') P = compileProfile('car'); // times are always real seconds
  const cost = router ? router.costs(P) : G.aTime, tc = P.turnCost;
  for (let i = 0; i < n; i++) {
    const a = raw.arcs[i], dCenter = man.arcD[i + 1] - man.arcD[i];
    let t = cost[a] * (dCenter / G.aLen[a]);
    if (i < n - 1) for (let q = G.tStart[a]; q < G.tStart[a + 1]; q++) if (G.tTo[q] === raw.arcs[i + 1]) { t += tc[G.tType[q]]; break; }
    arcT[i + 1] = arcT[i] + (t < Infinity ? t : 0);
  }
  for (const m of man.maneuvers) m.time = arcT[Math.min(n, m.type === 'arrive' ? n : m.arcIndex)];
  const from = opts.from || raw.snapFrom, to = opts.to || raw.snapTo;
  const head = raw.snapFrom && opts.from && Math.hypot(opts.from.x - geo.line[0], opts.from.z - geo.line[1]) > 9 ? [[opts.from.x, opts.from.z], [geo.line[0], geo.line[1]]] : null;
  const L = geo.line.length;
  const tail = raw.snapTo && opts.to && Math.hypot(opts.to.x - geo.line[L - 2], opts.to.z - geo.line[L - 1]) > 9 ? [[geo.line[L - 2], geo.line[L - 1]], [opts.to.x, opts.to.z]] : null;
  return {
    mode: 'drive', profile: profileName, arcs: raw.arcs, startS: raw.startS, endS: raw.endS,
    from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, destName: opts.destName || null,
    length: man.length, time: arcT[n], cost: raw.cost,
    line: geo.line, cum: geo.cum, lineLength: geo.cum[geo.cum.length - 1], arcAt: geo.arcAt, arcD: man.arcD, arcT,
    maneuvers: man.maneuvers, head, tail, bbox: geo.bbox,
    searchMs: raw.ms, expanded: raw.expanded, viaTree: !!raw.viaTree, snapFrom: raw.snapFrom, snapTo: raw.snapTo,
    get pts() { if (!this._pts) { const p = []; if (this.head) p.push(this.head[0]); for (let i = 0; i < this.line.length; i += 2) p.push([this.line[i], this.line[i + 1]]); if (this.tail) p.push(this.tail[1]); this._pts = p; } return this._pts; },
  };
}

// ------------------------------------------------------------------------------------------------ geometry
const TURN_SPLIT = 0.45; // rad: sharper than this between two arcs = a real corner (gets a fillet), else one smooth chain

export function buildGeometry(G, raw, man, opts = {}) {
  const arcs = raw.arcs, n = arcs.length;
  const { aEdge, aDir, aLanes, aKind, aFlags, aBearIn, aBearOut, aLen, pts, cum, ePtsOff, eLen, eWidth } = G;
  const useLanes = opts.lanes !== false;
  const side = man.junctionSide;

  // ---- lane per arc: look ahead to the next maneuver that needs a side ----
  const off = new Float32Array(n);
  if (useLanes) {
    let nextSide = 0, nextDist = Infinity; // scanning backward keeps this O(n)
    const arrive = man.maneuvers[man.maneuvers.length - 1];
    if (arrive && arrive.side) { nextSide = arrive.side > 0 ? 1 : ((aFlags[arcs[n - 1]] & AF.ONEWAY) ? -1 : 1); nextDist = 0; }
    else { nextSide = 1; nextDist = 0; } // finish in the curb lane
    for (let i = n - 1; i >= 0; i--) {
      const a = arcs[i], len = man.arcD[i + 1] - man.arcD[i];
      if (i < n - 1 && side[i]) { nextSide = side[i]; nextDist = 0; }
      const nl = aLanes[a];
      const look = aKind[a] === K.motorway ? 900 : aKind[a] === K.trunk ? 600 : 320;
      let lane = (nl - 1) >> 1; // default: a middle lane
      if (nl >= 2 && nextDist < look) lane = nextSide > 0 ? 0 : nl - 1;
      off[i] = laneOffset(G, a, lane);
      nextDist += len;
    }
  }

  // ---- centerline pieces per arc ----
  const X = [], Z = [], O = [], A = []; // chain buffers (reused)
  const outX = [], outZ = [], outA = [];
  const emit = (x, z, ai) => { const m = outX.length; if (m && Math.abs(outX[m - 1] - x) < 0.02 && Math.abs(outZ[m - 1] - z) < 0.02) return; outX.push(x); outZ.push(z); outA.push(ai); };
  const pushPt = (x, z, o, ai) => { const m = X.length; if (m && Math.abs(X[m - 1] - x) < 0.01 && Math.abs(Z[m - 1] - z) < 0.01) { A[m - 1] = Math.max(A[m - 1], ai); return; } X.push(x); Z.push(z); O.push(o); A.push(ai); };
  const lerpPt = (k, s, out) => { // point at s along edge k
    const p0 = ePtsOff[k], p1 = ePtsOff[k + 1] - 1; let lo = p0, hi = p1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const L = cum[hi] - cum[lo] || 1e-6, u = Math.min(1, Math.max(0, (s - cum[lo]) / L));
    out[0] = pts[2 * lo] + (pts[2 * hi] - pts[2 * lo]) * u; out[1] = pts[2 * lo + 1] + (pts[2 * hi + 1] - pts[2 * lo + 1]) * u; return lo;
  };
  const tmp = [0, 0];
  function arcCenter(i) { // appends the centerline of arc i (travel order, trimmed at the route ends) to the chain buffers
    const a = arcs[i], k = aEdge[a], L = eLen[k], d = aDir[a], o = off[i];
    const p0 = ePtsOff[k], p1 = ePtsOff[k + 1] - 1;
    let s0 = d > 0 ? 0 : L, s1 = d > 0 ? L : 0;
    if (i === 0) s0 = raw.startS;
    if (i === n - 1) s1 = raw.endS;
    if (d > 0) {
      if (s1 < s0) s1 = s0;
      lerpPt(k, s0, tmp); pushPt(tmp[0], tmp[1], o, i);
      for (let p = p0 + 1; p < p1; p++) if (cum[p] > s0 + 0.05 && cum[p] < s1 - 0.05) pushPt(pts[2 * p], pts[2 * p + 1], o, i);
      lerpPt(k, s1, tmp); pushPt(tmp[0], tmp[1], o, i);
    } else {
      if (s1 > s0) s1 = s0;
      lerpPt(k, s0, tmp); pushPt(tmp[0], tmp[1], o, i);
      for (let p = p1 - 1; p > p0; p--) if (cum[p] < s0 - 0.05 && cum[p] > s1 + 0.05) pushPt(pts[2 * p], pts[2 * p + 1], o, i);
      lerpPt(k, s1, tmp); pushPt(tmp[0], tmp[1], o, i);
    }
  }

  // offset the chain buffers into a lane line; returns arrays [lx, lz, la]
  function offsetChain() {
    const m = X.length;
    // ramp lane changes inside the chain: subdivide, then smooth the offsets along the distance
    let changes = false; for (let i = 1; i < m; i++) if (Math.abs(O[i] - O[i - 1]) > 0.05) { changes = true; break; }
    let cx = X, cz = Z, co = O, ca = A;
    if (changes) {
      cx = []; cz = []; co = []; ca = [];
      for (let i = 0; i < m; i++) {
        if (i) { const l = Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]), parts = Math.min(40, Math.ceil(l / 9)); for (let q = 1; q < parts; q++) { const u = q / parts; cx.push(X[i - 1] + (X[i] - X[i - 1]) * u); cz.push(Z[i - 1] + (Z[i] - Z[i - 1]) * u); co.push(O[i - 1]); ca.push(A[i - 1]); } }
        cx.push(X[i]); cz.push(Z[i]); co.push(O[i]); ca.push(A[i]);
      }
      // moving average over ~70 m, twice (a soft S-curve for each lane change), weighted by distance
      const mm = cx.length, d = new Float32Array(mm);
      for (let i = 1; i < mm; i++) d[i] = d[i - 1] + Math.hypot(cx[i] - cx[i - 1], cz[i] - cz[i - 1]);
      for (let pass = 0; pass < 2; pass++) {
        const src = Float32Array.from(co); let lo = 0, hi = 0, sum = 0, cnt = 0;
        const W = Math.min(35, d[mm - 1] * 0.25);
        for (let i = 0; i < mm; i++) {
          while (hi < mm && d[hi] <= d[i] + W) { sum += src[hi]; cnt++; hi++; }
          while (d[lo] < d[i] - W) { sum -= src[lo]; cnt--; lo++; }
          co[i] = sum / cnt;
        }
      }
    }
    const mm = cx.length, lx = new Array(mm), lz = new Array(mm);
    for (let i = 0; i < mm; i++) {
      let tx = 0, tz = 0;
      if (i > 0) { const dx = cx[i] - cx[i - 1], dz = cz[i] - cz[i - 1], l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
      if (i < mm - 1) { const dx = cx[i + 1] - cx[i], dz = cz[i + 1] - cz[i], l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l; }
      const tl = Math.hypot(tx, tz);
      let miter = 1;
      if (tl > 1e-6) { tx /= tl; tz /= tl; if (i > 0 && i < mm - 1) miter = Math.min(1.5, 2 / Math.max(0.8, tl)); } else { tx = 0; tz = 1; }
      lx[i] = cx[i] - tz * co[i] * miter; lz[i] = cz[i] + tx * co[i] * miter; // right of travel = (-tz, tx)
    }
    return [lx, lz, ca];
  }
  // cut `r` meters off the start (fromStart) or the end of a polyline; returns the new end point index range
  function trim(lx, lz, la, r, fromStart) {
    const m = lx.length; if (m < 2 || r <= 0) return;
    if (fromStart) {
      let acc = 0, i = 0;
      while (i < m - 2) { const l = Math.hypot(lx[i + 1] - lx[i], lz[i + 1] - lz[i]); if (acc + l > r) break; acc += l; i++; }
      const l = Math.hypot(lx[i + 1] - lx[i], lz[i + 1] - lz[i]) || 1e-6, u = Math.min(0.95, (r - acc) / l);
      const x = lx[i] + (lx[i + 1] - lx[i]) * u, z = lz[i] + (lz[i + 1] - lz[i]) * u, a0 = la[i];
      lx.splice(0, i + 1, x); lz.splice(0, i + 1, z); la.splice(0, i + 1, a0);
    } else {
      let acc = 0, i = m - 1;
      while (i > 1) { const l = Math.hypot(lx[i] - lx[i - 1], lz[i] - lz[i - 1]); if (acc + l > r) break; acc += l; i--; }
      const l = Math.hypot(lx[i] - lx[i - 1], lz[i] - lz[i - 1]) || 1e-6, u = Math.min(0.95, (r - acc) / l);
      const x = lx[i] + (lx[i - 1] - lx[i]) * u, z = lz[i] + (lz[i - 1] - lz[i]) * u, a1 = la[i];
      lx.splice(i, m - i, x); lz.splice(i, m - i, z); la.splice(i, m - i, a1);
    }
  }
  const polyLen = (lx, lz) => { let l = 0; for (let i = 1; i < lx.length; i++) l += Math.hypot(lx[i] - lx[i - 1], lz[i] - lz[i - 1]); return l; };

  // ---- walk the arcs, cutting chains at real corners ----
  let prev = null; // previous chain's lane line, held back until its end is trimmed for the fillet
  let i0 = 0;
  while (i0 < n) {
    X.length = Z.length = O.length = A.length = 0;
    let i1 = i0;
    arcCenter(i1);
    while (i1 < n - 1) {
      const a = arcs[i1], b = arcs[i1 + 1];
      const ang = Math.abs(wrapPi(aBearOut[b] - aBearIn[a]));
      if (aEdge[a] === aEdge[b] || ang > TURN_SPLIT) break;
      i1++; arcCenter(i1);
    }
    if (X.length === 1) { X.push(X[0]); Z.push(Z[0]); O.push(O[0]); A.push(A[0]); }
    const cur = offsetChain();
    if (prev) {
      // fillet between prev (ends at the node) and cur (starts at it)
      const a = arcs[i0 - 1], b = arcs[i0];
      const turn = -wrapPi(aBearOut[b] - aBearIn[a]), uturn = aEdge[a] === aEdge[b];
      const left = turn < 0;
      const lp = polyLen(prev[0], prev[1]), lc = polyLen(cur[0], cur[1]);
      const wa = eWidth[aEdge[a]], wb = eWidth[aEdge[b]];
      let ra = Math.min(lp * 0.45, uturn ? 3 : 5 + wb * 0.35 + (left ? 3 : 0)), rb = Math.min(lc * 0.45, uturn ? 3 : 5 + wa * 0.35 + (left ? 3 : 0));
      trim(prev[0], prev[1], prev[2], ra, false); trim(cur[0], cur[1], cur[2], rb, true);
      const pm = prev[0].length, x0 = prev[0][pm - 1], z0 = prev[1][pm - 1], x3 = cur[0][0], z3 = cur[1][0];
      let t0x = x0 - prev[0][pm - 2], t0z = z0 - prev[1][pm - 2]; let l = Math.hypot(t0x, t0z) || 1; t0x /= l; t0z /= l;
      let t3x = cur[0][1] - x3, t3z = cur[1][1] - z3; l = Math.hypot(t3x, t3z) || 1; t3x /= l; t3z /= l;
      const chord = Math.hypot(x3 - x0, z3 - z0);
      const kk = uturn ? Math.max(5, chord * 0.9) : chord * 0.4;
      for (let q = 0; q < prev[0].length; q++) emit(prev[0][q], prev[1][q], prev[2][q]);
      const steps = uturn ? 10 : Math.max(4, Math.min(10, Math.round(chord / 2.5)));
      for (let q = 1; q < steps; q++) {
        const u = q / steps, w0 = (1 - u) ** 3, w1 = 3 * (1 - u) * (1 - u) * u, w2 = 3 * (1 - u) * u * u, w3 = u ** 3;
        emit(w0 * x0 + w1 * (x0 + t0x * kk) + w2 * (x3 - t3x * kk) + w3 * x3, w0 * z0 + w1 * (z0 + t0z * kk) + w2 * (z3 - t3z * kk) + w3 * z3, u < 0.5 ? i0 - 1 : i0);
      }
    }
    prev = cur;
    i0 = i1 + 1;
  }
  if (prev) for (let q = 0; q < prev[0].length; q++) emit(prev[0][q], prev[1][q], prev[2][q]);
  if (outX.length === 1) { outX.push(outX[0]); outZ.push(outZ[0]); outA.push(outA[0]); }

  const m = outX.length, line = new Float32Array(m * 2), lcum = new Float32Array(m), arcAt = new Uint32Array(n + 1);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, ai = 0;
  for (let i = 0; i < m; i++) {
    const x = outX[i], z = outZ[i];
    line[2 * i] = x; line[2 * i + 1] = z;
    if (i) lcum[i] = lcum[i - 1] + Math.hypot(x - outX[i - 1], z - outZ[i - 1]);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    while (ai < outA[i] && ai < n) arcAt[++ai] = i;
  }
  while (ai < n) arcAt[++ai] = m - 1;
  arcAt[n] = m - 1;
  return { line, cum: lcum, arcAt, bbox: { minX, minZ, maxX, maxZ } };
}

// ------------------------------------------------------------------------------------------------ progress on a route
/**
 * Project a position onto the route line near a previous index. state: { i } (kept between calls).
 * returns { i, u, dist (m off the line), along (m on the lane line), d (centerline m from the route start), arc (index into route.arcs), x, z }
 */
export function progressOn(route, x, z, state = null, out = {}) {
  const line = route.line, m = line.length >> 1, cum = route.cum;
  let i0 = 0, i1 = m - 2;
  if (state && state.i >= 0) { // search a window around the last position first: cheap, and immune to the route crossing itself
    const s = cum[Math.min(m - 1, state.i)];
    i0 = state.i; while (i0 > 0 && s - cum[i0] < 60) i0--;
    i1 = state.i; while (i1 < m - 2 && cum[i1] - s < 180) i1++;
  }
  let bi = -1, bu = 0, bd = Infinity;
  const scan = (a, b) => {
    for (let i = a; i <= b; i++) {
      const ax = line[2 * i], az = line[2 * i + 1], dx = line[2 * i + 2] - ax, dz = line[2 * i + 3] - az, L2 = dx * dx + dz * dz;
      let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = (x - ax - dx * u) ** 2 + (z - az - dz * u) ** 2;
      if (d < bd) { bd = d; bi = i; bu = u; }
    }
  };
  scan(i0, i1);
  if (state && state.i >= 0 && bd > 45 * 45) { bd = Infinity; scan(0, m - 2); } // lost: look everywhere
  if (bi < 0) { bi = 0; bu = 0; bd = (x - line[0]) ** 2 + (z - line[1]) ** 2; }
  const along = cum[bi] + (cum[bi + 1] - cum[bi]) * bu;
  // arc index: last arc whose first line point is at or before this one
  const arcAt = route.arcAt, n = route.arcs.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arcAt[mid] <= bi) lo = mid; else hi = mid - 1; }
  const a0 = cum[arcAt[lo]], a1 = cum[arcAt[lo + 1]];
  const f = a1 > a0 ? Math.min(1, Math.max(0, (along - a0) / (a1 - a0))) : 0;
  out.i = bi; out.u = bu; out.dist = Math.sqrt(bd); out.along = along; out.arc = lo; out.f = f;
  out.d = route.arcD[lo] + f * (route.arcD[lo + 1] - route.arcD[lo]);
  out.t = route.arcT[lo] + f * (route.arcT[lo + 1] - route.arcT[lo]);
  out.x = line[2 * bi] + (line[2 * bi + 2] - line[2 * bi]) * bu; out.z = line[2 * bi + 1] + (line[2 * bi + 3] - line[2 * bi + 1]) * bu;
  if (state) state.i = bi;
  return out;
}

/** Remaining lane line from a progress result, as [[x, z], ...] (for the map) */
export function remainingLine(route, prog) {
  const line = route.line, m = line.length >> 1, out = [[prog.x, prog.z]];
  for (let i = prog.i + 1; i < m; i++) out.push([line[2 * i], line[2 * i + 1]]);
  if (route.tail) out.push(route.tail[1]);
  return out;
}

export const kindName = (G, arc) => KINDS[G.aKind[arc]];
export const arcLabel = (G, arc) => str(G, G.eName[G.aEdge[arc]]) || str(G, G.eRef[G.aEdge[arc]]);
