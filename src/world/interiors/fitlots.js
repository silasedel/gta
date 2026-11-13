// Lot fitting for streamed interiors (INTERIORS agent).
// Every shell lot is an oriented box (centre x,z; w across the frontage, d deep; facing = outward normal).
// Before any interior is built we resolve conflicts once:
//  - lots overlapping an already-accepted lot by > 20 % are dropped (dedupe),
//  - smaller overlaps, or overlaps with a NON-host building footprint, shrink the lot (front edge fixed)
//    up to 3 times, then drop it.
// Returns Map(sf -> { ok, w, d, shift, reason }) where shift moves the centre along the inward normal.

const SAMPLES = 6;

function rectOf(x, z, w, d, facing) { const c = Math.cos(facing), s = Math.sin(facing); return { x, z, hw: w / 2, hd: d / 2, c, s }; }
// local coords of world point in rect frame (x across, z along facing)
function toLocal(r, px, pz) { const dx = px - r.x, dz = pz - r.z; return [dx * r.c - dz * r.s, dx * r.s + dz * r.c]; }
function toWorld(r, lx, lz) { return [r.x + lx * r.c + lz * r.s, r.z - lx * r.s + lz * r.c]; }
function inRect(r, px, pz, pad = 0) { const [a, b] = toLocal(r, px, pz); return Math.abs(a) <= r.hw - pad && Math.abs(b) <= r.hd - pad; }
function samples(r, inset = 0.3) {
  const out = []; const hw = Math.max(0.05, r.hw - inset), hd = Math.max(0.05, r.hd - inset);
  for (let i = 0; i < SAMPLES; i++) for (let j = 0; j < SAMPLES; j++) out.push(toWorld(r, -hw + (2 * hw * i) / (SAMPLES - 1), -hd + (2 * hd * j) / (SAMPLES - 1)));
  return out;
}
// exact oriented-rectangle overlap (separating axis), rects shrunk by eps so touching edges don't count
function obbOverlap(a, b, eps = 0.03) {
  const dx = a.x - b.x, dz = a.z - b.z, rr = Math.hypot(a.hw, a.hd) + Math.hypot(b.hw, b.hd); if (dx * dx + dz * dz >= rr * rr) return false;
  const ax = [[a.c, -a.s], [a.s, a.c], [b.c, -b.s], [b.s, b.c]]; // local x / z axes in world
  const corners = (r) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => toWorld(r, u * (r.hw - eps), v * (r.hd - eps)));
  const A = corners(a), B = corners(b);
  for (const [nx, nz] of ax) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const p = x * nx + z * nz; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of B) { const p = x * nx + z * nz; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}
export { obbOverlap, rectOf };
function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function grid(cell) {
  const m = new Map();
  return {
    add(item, x0, z0, x1, z1) { for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) { const k = i + ',' + j; if (!m.has(k)) m.set(k, []); m.get(k).push(item); } },
    at(x, z) { return m.get(Math.floor(x / cell) + ',' + Math.floor(z / cell)) || []; },
  };
}

// Incremental fitter: lots can stream in later (CITY's synthetic ground-floor shops appear as tiles build);
// each batch is fitted against everything accepted so far, so earlier interiors never get invalidated.
export function createLotFitter(buildingPolys = []) {
  const res = new Map();
  const bg = grid(40); const polys = [];
  for (const b of buildingPolys || []) {
    const o = b.outer || b; if (!o || o.length < 3) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of o) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const p = { o, x0, z0, x1, z1 }; polys.push(p); bg.add(p, x0, z0, x1, z1);
  }
  const polysAt = (x, z) => bg.at(x, z).filter((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && pointInPoly(p.o, x, z));
  const lg = grid(20); const accepted = [];
  const stats = { total: 0, ok: 0, shrunk: 0, droppedOverlap: 0, droppedBuilding: 0, overlapPairsBefore: 0, batches: 0 };
  function fitOne(sf) {
    const facing = sf.facing || 0; const sn = Math.sin(facing), cs = Math.cos(facing);
    const r0 = rectOf(sf.x, sf.z, sf.w, sf.d, facing);
    const hostVotes = new Map(); for (const [x, z] of samples(r0, 0.4)) for (const p of polysAt(x, z)) hostVotes.set(p, (hostVotes.get(p) || 0) + 1);
    let host = null, best = 0; for (const [p, v] of hostVotes) if (v > best) { best = v; host = p; }
    let w = sf.w, d = sf.d, off = 0, verdict = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = rectOf(sf.x + sn * off, sf.z + cs * off, w, d, facing); const S = samples(r, 0.2);
      let lotHits = 0, bldHits = 0;
      const R0 = Math.hypot(r.hw, r.hd); const near = new Set(); for (const [x, z] of [[r.x - R0, r.z - R0], [r.x + R0, r.z - R0], [r.x - R0, r.z + R0], [r.x + R0, r.z + R0], [r.x, r.z]]) for (const a of lg.at(x, z)) near.add(a);
      const anyLot = [...near].some((a) => obbOverlap(a, r));
      for (const [x, z] of S) {
        if (lg.at(x, z).some((a) => inRect(a, x, z))) lotHits++;
        if (polys.length && polysAt(x, z).some((p) => p !== host)) bldHits++;
      }
      if (attempt === 0 && lotHits / S.length > 0.2) { verdict = { ok: false, reason: 'overlap' }; break; }
      if (anyLot && !lotHits) lotHits = 1;
      if (!lotHits && !bldHits) { verdict = { ok: true, w, d, off, shrunk: attempt > 0, rect: r }; break; }
      if (attempt === 3) { verdict = { ok: false, reason: bldHits ? 'building' : 'overlap' }; break; }
      const nd = Math.max(3.5, d * 0.82), nw = Math.max(3.5, w * 0.88); off += (d - nd) / 2; d = nd; w = nw;
    }
    if (verdict.ok) {
      const r = verdict.rect; delete verdict.rect; r.i = accepted.length;
      accepted.push(r); const R = Math.hypot(r.hw, r.hd); lg.add(r, r.x - R, r.z - R, r.x + R, r.z + R);
      stats.ok++; if (verdict.shrunk) stats.shrunk++;
    } else if (verdict.reason === 'building') stats.droppedBuilding++; else stats.droppedOverlap++;
    res.set(sf, verdict);
  }
  function fit(lots) {
    const fresh = lots.filter((sf) => !res.has(sf)); if (!fresh.length) return res;
    stats.total += fresh.length; stats.batches++;
    fresh.sort((a, b) => (!!b.poi - !!a.poi) || (b.w * b.d - a.w * a.d) || ((a.id ?? 0) - (b.id ?? 0)));
    for (const sf of fresh) fitOne(sf);
    return res;
  }
  function overlapsAfter() { let after = 0; const seen = new Set(); for (const r of accepted) { const R0 = Math.hypot(r.hw, r.hd); for (const [x, z] of [[r.x - R0, r.z - R0], [r.x + R0, r.z - R0], [r.x - R0, r.z + R0], [r.x + R0, r.z + R0], [r.x, r.z]]) for (const a of lg.at(x, z)) { if (a === r) continue; const k = Math.min(a.i, r.i) + ':' + Math.max(a.i, r.i); if (!seen.has(k) && obbOverlap(a, r)) { seen.add(k); after++; } } } return after; }
  return { fit, res, stats, overlapsAfter, get: (sf) => res.get(sf) };
}

export function fitLots(lots, buildingPolys = []) {
  const F = createLotFitter(buildingPolys);
  // raw overlap count (before fitting) for reporting
  let before = 0; { const rg = grid(20); const rects = lots.map((sf) => rectOf(sf.x, sf.z, sf.w, sf.d, sf.facing || 0));
    rects.forEach((r, i) => { const R = Math.hypot(r.hw, r.hd); rg.add(i, r.x - R, r.z - R, r.x + R, r.z + R); });
    const seen = new Set();
    rects.forEach((r, i) => { for (const [x, z] of samples(r, 0.05)) for (const j of rg.at(x, z)) { if (j === i) continue; const k = i < j ? i + ':' + j : j + ':' + i; if (seen.has(k)) continue; if (inRect(rects[j], x, z)) seen.add(k); } });
    before = seen.size; }
  const res = F.fit(lots);
  res.stats = { ...F.stats, overlapPairsBefore: before, overlapPairsAfter: F.overlapsAfter() };
  return res;
}
