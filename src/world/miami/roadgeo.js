// Road surfaces (stage 1 job 4): junction outlines built from the real approach carriageway edges with curb returns,
// per-leg mouth distances (where the approach ribbon starts), crosswalk / stop-bar stations, curb-ramp footprints,
// and exact convex clipping used to cut sidewalk slabs (curb faces follow the cut exactly, no 1 m stair steps).
// Pure geometry: no THREE, no batches. World frame x east, z south; polylines are [[x, z], ...].

const TAU = Math.PI * 2;
const cross = (ax, az, bx, bz) => ax * bz - az * bx;

// position + miter-scaled right normal at arc length s on a polyline (same interpolation as geom.js ribbon/polyFrame)
export function frameOf(pts) {
  const n = pts.length, out = new Array(n); let s = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i]; if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let d0x = 0, d0z = 0, d1x = 0, d1z = 0;
    if (i > 0) { d0x = p[0] - a[0]; d0z = p[1] - a[1]; const l = Math.hypot(d0x, d0z) || 1; d0x /= l; d0z /= l; }
    if (i < n - 1) { d1x = b[0] - p[0]; d1z = b[1] - p[1]; const l = Math.hypot(d1x, d1z) || 1; d1x /= l; d1z /= l; }
    if (i === 0) { d0x = d1x; d0z = d1z; } if (i === n - 1) { d1x = d0x; d1z = d0z; }
    let nx = -(d0z + d1z), nz = d0x + d1x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const cosH = Math.max(0.35, nx * -d1z + nz * d1x);
    out[i] = { x: p[0], z: p[1], nx: nx / cosH, nz: nz / cosH, s };
  }
  return out;
}
export function sampleFrame(fr, s) {
  let i = 0; while (i < fr.length - 2 && fr[i + 1].s < s) i++;
  const A = fr[i], B = fr[i + 1] || A, L = B.s - A.s || 1, t = Math.max(0, Math.min(1, (s - A.s) / L));
  return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, nx: A.nx + (B.nx - A.nx) * t, nz: A.nz + (B.nz - A.nz) * t, dx: (B.x - A.x) / L, dz: (B.z - A.z) / L };
}

// curb return radius by the two legs' road classes (m). Urban corners 5-8 m, open roads 9 m, highways 12-15 m.
function cornerRadius(a, b) {
  const rank = (k) => (/motorway|trunk/.test(k) ? 4 : /primary/.test(k) ? 3 : /secondary/.test(k) ? 2 : /tertiary/.test(k) ? 1 : 0);
  const hi = Math.max(rank(a.kind), rank(b.kind)), curb = a.sw > 0 && b.sw > 0;
  if (hi >= 4) return curb ? 9 : 11;
  if (!curb) return hi >= 2 ? 8.5 : 7;
  return hi >= 3 ? 7.5 : hi >= 2 ? 6.5 : hi >= 1 ? 5.5 : 4.5;
}

// One at-grade junction. G = data.roadGraph, n = graph node. Returns null when it is not a plain at-grade junction
// (decks / ramps keep the old disc). Result:
//   poly  [[x,z]]  outline (CCW in angle order), mouths overlap the approach ribbons by `lap` m
//   legs  [{ edge, atA, D, dx, dz, hw, sw, kind, fr }]  D = arc length from the node where the approach ribbon starts
//   corners [{ i, j, kind: 'fillet'|'line'|'reflex'|'gore', C, arc: [[x,z]], R }]
export function buildJunction(G, n, opts = {}) {
  const lap = opts.lap ?? 0.03;
  const legs = [];
  for (const k of n.edges || []) {
    const e = G.edges[k]; if (!e || e.a === e.b) return null;
    const atA = e.a === n.id, P = atA ? e.pts : e.pts.slice().reverse();
    if (P.length < 2) return null;
    // at grade near the node (a bridge far along the edge is fine; a ramp that starts within 60 m is not)
    // (a low hump under 2 m that never reaches a real deck is drawn at grade by the road builder, so it does not count)
    if (e.y && e.y.length && !e.terrain) { const cum = e.cum, L0 = e.length || 0; let ym = 0; for (const v of e.y) ym = Math.max(ym, v); for (let i = 0; i < e.y.length; i++) { const d = cum ? (atA ? cum[i] : L0 - cum[i]) : 0; if (d < 60 && Math.abs(e.y[i]) > (ym >= 2 ? 0.3 : 2)) return null; } }
    const dx0 = P[1][0] - P[0][0], dz0 = P[1][1] - P[0][1], l0 = Math.hypot(dx0, dz0) || 1;
    legs.push({ edge: e, edgeId: k, atA, P, fr: frameOf(P), dx: dx0 / l0, dz: dz0 / l0, hw: e.width / 2, len: e.length || l0, sw: opts.swOf ? opts.swOf(e) : e.sidewalk || 0, kind: e.kind || '', th: Math.atan2(dz0 / l0, dx0 / l0), tA: 0, tB: 0 });
  }
  if (legs.length < 3) return null;
  legs.sort((p, q) => p.th - q.th);
  const N = legs.length, corners = [];
  // a leg's edge (side +1 = frame normal side, faces the next leg; -1 faces the previous) offset by `off`, from s = -back to sMax
  const edgeLine = (L, side, off, sMax, back = 20) => {
    const fr = L.fr, out = [], q0 = fr[0];
    out.push({ s: -back, x: q0.x - L.dx * back + q0.nx * side * off, z: q0.z - L.dz * back + q0.nz * side * off });
    for (const f of fr) { if (f.s >= sMax) break; out.push({ s: f.s, x: f.x + f.nx * side * off, z: f.z + f.nz * side * off }); }
    const q = sampleFrame(fr, sMax); out.push({ s: sMax, x: q.x + q.nx * side * off, z: q.z + q.nz * side * off });
    return out;
  };
  const at = (L, s, side, off) => { const q = sampleFrame(L.fr, s); return [q.x + q.nx * side * off, q.z + q.nz * side * off]; };
  // first crossing of two offset edges (smallest sa + sb): { sa, sb, x, z } or null
  const meet = (A, Bl) => {
    let best = null;
    for (let i = 0; i < A.length - 1; i++) { const p = A[i], p2 = A[i + 1], rx = p2.x - p.x, rz = p2.z - p.z;
      for (let j = 0; j < Bl.length - 1; j++) { const q = Bl[j], q2 = Bl[j + 1], sx = q2.x - q.x, sz = q2.z - q.z, den = cross(rx, rz, sx, sz); if (Math.abs(den) < 1e-9) continue;
        const t = cross(q.x - p.x, q.z - p.z, sx, sz) / den, u = cross(q.x - p.x, q.z - p.z, rx, rz) / den; if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const sa = p.s + (p2.s - p.s) * t, sb = q.s + (q2.s - q.s) * u; if (!best || sa + sb < best.sa + best.sb) best = { sa, sb, x: p.x + rx * t, z: p.z + rz * t }; } }
    return best;
  };
  for (let i = 0; i < N; i++) {
    const a = legs[i], b = legs[(i + 1) % N], j = (i + 1) % N;
    let al = b.th - a.th; if (i === N - 1) al += TAU; al = ((al % TAU) + TAU) % TAU;
    const maxA = Math.min(a.len * 0.45, 45), maxB = Math.min(b.len * 0.45, 45);
    if (al > Math.PI + 0.3) { // reflex outside of a Y / skewed T: wrap around the node
      const arc = [], a0 = Math.atan2(a.dx, -a.dz); let a1 = Math.atan2(-b.dx, b.dz); while (a1 < a0) a1 += TAU;
      const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 10)));
      for (let k = 0; k <= steps; k++) { const t = k / steps, an = a0 + (a1 - a0) * t, r = a.hw + (b.hw - a.hw) * t; arc.push([n.x + Math.cos(an) * r, n.z + Math.sin(an) * r]); }
      corners.push({ i, j, kind: 'reflex', arc, sa: 0, sb: 0 }); continue;
    }
    if (al > Math.PI - 0.3) { corners.push({ i, j, kind: 'line', arc: [], sa: 0, sb: 0 }); continue; } // straight-through side
    const sharp = meet(edgeLine(a, 1, a.hw, maxA), edgeLine(b, -1, b.hw, maxB)); // where the two curb lines cross
    let R = cornerRadius(a, b), hit = null;
    for (let k = 0; k < 5 && R > 0.8; k++, R *= 0.6) { const m = meet(edgeLine(a, 1, a.hw + R, maxA), edgeLine(b, -1, b.hw + R, maxB)); if (m) { hit = m; break; } }
    if (hit && (hit.sa < 0 || hit.sb < 0)) { corners.push({ i, j, kind: 'line', arc: [], sa: 0, sb: 0 }); continue; }
    if (!hit) { // too tight for a curb return: sharp gore point where the curb lines meet (or the two edge ends)
      if (sharp && sharp.sa >= 0 && sharp.sb >= 0) { a.tB = Math.max(a.tB, sharp.sa); b.tA = Math.max(b.tA, sharp.sb); corners.push({ i, j, kind: 'gore', arc: [[sharp.x, sharp.z]], sa: sharp.sa, sb: sharp.sb }); }
      else { a.tB = Math.max(a.tB, maxA); b.tA = Math.max(b.tA, maxB); corners.push({ i, j, kind: 'gore', arc: [at(a, maxA, 1, a.hw), at(b, maxB, -1, b.hw)], sa: maxA, sb: maxB }); }
      continue;
    }
    const Ox = hit.x, Oz = hit.z, Ta = at(a, hit.sa, 1, a.hw), Tb = at(b, hit.sb, -1, b.hw);
    const C = sharp ? [sharp.x, sharp.z] : (() => { const ta = at(a, hit.sa + 1, 1, a.hw), tb = at(b, hit.sb + 1, -1, b.hw), dxa = Ta[0] - ta[0], dza = Ta[1] - ta[1], dxb = Tb[0] - tb[0], dzb = Tb[1] - tb[1], den = cross(dxa, dza, dxb, dzb); if (Math.abs(den) < 1e-9) return [(Ta[0] + Tb[0]) / 2, (Ta[1] + Tb[1]) / 2]; const t = cross(Tb[0] - Ta[0], Tb[1] - Ta[1], dxb, dzb) / den; return [Ta[0] + dxa * t, Ta[1] + dza * t]; })();
    const ra = Math.hypot(Ta[0] - Ox, Ta[1] - Oz), rb = Math.hypot(Tb[0] - Ox, Tb[1] - Oz);
    let g0 = Math.atan2(Ta[1] - Oz, Ta[0] - Ox), g1 = Math.atan2(Tb[1] - Oz, Tb[0] - Ox), sw = g1 - g0;
    while (sw > Math.PI) sw -= TAU; while (sw < -Math.PI) sw += TAU;
    const steps = Math.max(3, Math.ceil(Math.abs(sw) / (Math.PI / 16))), arc = [];
    for (let k = 0; k <= steps; k++) { const t = k / steps, g = g0 + sw * t, r = ra + (rb - ra) * t; arc.push([Ox + Math.cos(g) * r, Oz + Math.sin(g) * r]); }
    a.tB = Math.max(a.tB, hit.sa); b.tA = Math.max(b.tA, hit.sb);
    corners.push({ i, j, kind: 'fillet', arc, C, R: (ra + rb) / 2, O: [Ox, Oz], sa: hit.sa, sb: hit.sb });
  }
  // mouth distance per leg: where both curb returns have ended (approach ribbon starts there)
  for (const L of legs) L.D = Math.min(Math.max(L.tA, L.tB, 1.0), L.len * 0.48);
  // outline: each mouth, then back along the curb line to the curb return, the return, out along the next leg's curb line
  const along = (L, side, s0, s1) => { const pts = [], lo = Math.min(s0, s1), hi = Math.max(s0, s1); for (const f of L.fr) if (f.s > lo + 0.05 && f.s < hi - 0.05) pts.push([f.x + f.nx * side * L.hw, f.z + f.nz * side * L.hw]); return s0 > s1 ? pts.reverse() : pts; };
  const poly = [];
  for (let i = 0; i < N; i++) {
    const L = legs[i], c = corners[i], nx = legs[c.j];
    poly.push(at(L, L.D + lap, -1, L.hw), at(L, L.D + lap, 1, L.hw)); // mouth: right edge (faces previous leg), left edge (faces next)
    for (const p of along(L, 1, L.D + lap, c.sa)) poly.push(p);
    if (c.kind === 'line' || c.kind === 'reflex') poly.push(at(L, 0, 1, L.hw));
    for (const p of c.arc) poly.push(p);
    if (c.kind === 'line' || c.kind === 'reflex') poly.push(at(nx, 0, -1, nx.hw));
    for (const p of along(nx, -1, c.sb, nx.D + lap)) poly.push(p);
  }
  // drop near-duplicate points (degenerate triangles break the triangulator)
  const out = []; for (const p of poly) { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.02) out.push(p); }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.02) out.pop();
  return { node: n, legs, corners, poly: out };
}

// ---------------- exact convex clipping ----------------
// A piece is { p: [[x,z]...] convex CCW-or-CW, b: [bool per edge i -> i+1] } (b = edge is a real outline edge: curb).
const area2 = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a; };
export function convexCCW(poly) { return area2(poly) < 0 ? poly.slice().reverse() : poly; }
// clip piece by half-plane side(x) = (x - a) x dir  >= 0 (keep=+1) or <= 0 (keep=-1); new edge on the cut line gets flag cutFlag
function clipHalf(piece, ax, az, ex, ez, keep, cutFlag) {
  const P = piece.p, F = piece.b, n = P.length, outP = [], outB = [];
  const sd = (p) => keep * cross(ex, ez, p[0] - ax, p[1] - az);
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n], dp = sd(p), dq = sd(q);
    if (dp >= 0) { outP.push(p); outB.push(F[i]); }
    if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq), x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; outP.push(x); outB.push(dp >= 0 ? cutFlag : F[i]); }
  }
  // the edge leaving the last kept vertex toward a crossing point keeps the original flag; the edge from the crossing that
  // enters the cut line (outside -> inside transition) gets the cut flag. Fix the flags of edges lying on the cut line:
  for (let i = 0; i < outP.length; i++) { const p = outP[i], q = outP[(i + 1) % outP.length]; if (Math.abs(sd(p)) < 1e-7 && Math.abs(sd(q)) < 1e-7) outB[i] = cutFlag; }
  if (outP.length < 3) return null;
  return { p: outP, b: outB };
}
// the cut line runs past C's edge: only the part of a new edge that lies along the edge itself is a curb (flag 2 -> true/false)
function refineCut(pc, a, ex, ez) {
  const P = [], F = [], L2 = ex * ex + ez * ez || 1, n = pc.p.length;
  for (let i = 0; i < n; i++) {
    const p = pc.p[i], q = pc.p[(i + 1) % n], f = pc.b[i]; P.push(p);
    if (f !== 2) { F.push(f); continue; }
    const tp = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2, tq = ((q[0] - a[0]) * ex + (q[1] - a[1]) * ez) / L2;
    const lo = Math.max(0, Math.min(tp, tq)), hi = Math.min(1, Math.max(tp, tq));
    if (hi <= lo + 1e-6) { F.push(false); continue; }
    // walk p -> q, inserting the points where the edge enters / leaves the segment's extent
    const cuts = []; for (const t of [lo, hi]) { const u = (t - tp) / (tq - tp); if (u > 1e-6 && u < 1 - 1e-6) cuts.push(u); } cuts.sort((x, y) => x - y);
    const mid = (u0, u1) => { const u = (u0 + u1) / 2, t = tp + (tq - tp) * u; return t >= lo - 1e-6 && t <= hi + 1e-6; };
    let u0 = 0; for (const u of cuts) { F.push(mid(u0, u)); P.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); u0 = u; }
    F.push(mid(u0, 1));
  }
  return { p: P, b: F };
}
// piece minus convex polygon C (CCW): convex pieces outside C; edges along C's outline are flagged as curbs
export function subtractConvex(piece, C, bb) {
  if (bb) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of piece.p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; } if (x1 < bb[0] || x0 > bb[2] || z1 < bb[1] || z0 > bb[3]) return [piece]; }
  // quick reject: entirely outside one edge of C
  for (let i = 0; i < C.length; i++) { const a = C[i], b = C[(i + 1) % C.length], ex = b[0] - a[0], ez = b[1] - a[1]; let allOut = true; for (const p of piece.p) if (cross(ex, ez, p[0] - a[0], p[1] - a[1]) > 1e-6) { allOut = false; break; } if (allOut) return [piece]; }
  const out = []; let rem = piece;
  for (let i = 0; i < C.length && rem; i++) {
    const a = C[i], b = C[(i + 1) % C.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const outside = clipHalf(rem, a[0], a[1], ex, ez, -1, 2);
    if (outside && Math.abs(area2(outside.p)) > 1e-4) out.push(refineCut(outside, a, ex, ez));
    rem = clipHalf(rem, a[0], a[1], ex, ez, 1, false);
  }
  return out;
}
export function bboxOf(P) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; } return [x0, z0, x1, z1]; }
// convex decomposition of a corner spandrel (area between the sharp curb corner C and the curb-return arc): fan from C
export function spandrelFan(c) { const out = []; for (let k = 0; k < c.arc.length - 1; k++) { const t = convexCCW([c.C, c.arc[k], c.arc[k + 1]]); if (Math.abs(area2(t)) > 1e-4) out.push(t); } return out; }
