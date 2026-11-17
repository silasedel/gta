// Traffic signal layout for one signalized at-grade junction (stage 1 job 4), from the junction record (roadgeo.buildJunction +
// tilebuild junctionOf: legs with frames, mouth D, crosswalk stations cw, curb ramps) and the road graph. Pure placement:
// tilebuild turns the result into instanced kit parts (streetkit.js: library "Traffic Light 1" pole / truss arm / heads).
// US practice (MUTCD): signal faces on the FAR side of the junction, one 3-section head over each approach lane (two for a
// single-lane approach), on a mast arm from a pole on the far-right corner, just behind the crosswalk and its curb ramp.
// Narrow junctions (every leg <= 9 m, one lane in) get post-mounted heads at the far-right and far-left corners; a T-stem
// approach (no straight-through leg) gets a post-mounted head across the junction. Pedestrian heads at both ends of every
// crosswalk (on the mast pole when it stands at that crosswalk end, else on a pedestal). One controller cabinet per junction.
// Frames: pole local +X = arm direction, local -Z = signal face (so ry = atan2(-armZ, armX)); all y are curb-top relative.
import { sampleFrame } from './roadgeo.js';
import { SIG, signalPhase, walkPhase } from './streetkit.js';

const RAMP_FLARE = 0.75;
const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const ryFace = (fx, fz) => Math.atan2(-fx, -fz); // local -Z -> (fx, fz)

function lanes(L) {
  const e = L.edge, fwd = e.lanesFwd ?? 1, back = e.oneway ? 0 : (e.lanesBack ?? 1), tot = Math.max(1, fwd + back), laneW = (e.width || L.hw * 2) / tot;
  const nIn = L.atA ? back : fwd, nOut = L.atA ? fwd : back;
  // lateral offsets of the inbound lanes, positive toward the inbound traffic's right (= leg frame side -1)
  const lat = []; for (let i = 0; i < nIn; i++) lat.push(e.oneway ? -L.hw + (i + 0.5) * laneW : (i + 0.5) * laneW);
  return { nIn, nOut, laneW, lat };
}
const at = (L, s, side, off) => { const q = sampleFrame(L.fr, s), [nx, nz] = unit(q.nx, q.nz); return { x: q.x + nx * side * off, z: q.z + nz * side * off, nx, nz, dx: q.dx, dz: q.dz }; };

// opts: ok(x, z) -> true where a pole may stand (sidewalk / verge, not road, not in a building, not water); y(x, z) -> base height
export function signalLayout(G, n, J, opts = {}) {
  const ok = opts.ok || (() => true), Y = opts.y || (() => 0.15);
  const out = { poles: [], arms: [], heads: [], peds: [], pedPosts: [], cabinets: [], blades: [], skipped: 0 };
  const legs = J.legs, info = legs.map(lanes);
  const small = legs.every((L, i) => L.hw <= 4.6 && info[i].nIn <= 1);
  const poleAt = []; // {leg, side, x, z}
  const used = (x, z, r = 1.2) => out.poles.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) || out.pedPosts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
  // find a free standing spot near (leg, side) behind the crosswalk: try a few stations / setbacks
  const spot = (B, side, sBase, offBase) => {
    for (const ds of [0, 0.8, 1.6, -0.5, 2.6]) for (const dl of [0, 0.35, -0.2, 0.8]) {
      const s = sBase + ds, off = offBase + dl; if (s > B.len * 0.45) continue;
      const p = at(B, s, side, off); if (ok(p.x, p.z) && !used(p.x, p.z)) return { ...p, s, off };
    }
    return null;
  };
  const station = (B) => (B.cw ? B.cw[1] + RAMP_FLARE + 0.75 : B.D + 1.4);
  const setback = (B) => B.hw + (B.sw > 0 ? 0.75 : 1.8);
  const headItem = (x, y, z, ry, ph) => ({ x, y, z, ry, sig: [ph.off / 34, ph.phase, ph.live ? 1 : 0] });
  legs.forEach((A, ia) => {
    const li = info[ia]; if (li.nIn < 1) return; // outbound-only one-way leg: no approach
    const ph = signalPhase(G, n, A.edge);
    let B = null, bd = -0.75; legs.forEach((L) => { if (L === A) return; const d = A.dx * L.dx + A.dz * L.dz; if (d < bd) { bd = d; B = L; } });
    if (B && !small) { // ---- mast arm on the far-right corner ----
      const p = spot(B, 1, station(B), setback(B)); if (!p) { out.skipped++; return; }
      const armX = -p.nx, armZ = -p.nz, ry = Math.atan2(-armZ, armX), y = Y(p.x, p.z);
      const lat = li.lat.slice(); if (lat.length === 1) lat.push(lat[0] - 2.4); // a single-lane approach still gets two heads (MUTCD)
      const dists = lat.map((l) => p.off - l).filter((d) => d > 1.4).sort((a, b) => a - b);
      if (!dists.length) dists.push(Math.max(1.6, p.off - (A.edge.oneway ? 0 : li.laneW * 0.5)));
      const armLen = Math.min(15.5, dists[dists.length - 1] + 0.35);
      const pole = { x: p.x, y, z: p.z, ry, arm: true, leg: legs.indexOf(B), side: 1 }; out.poles.push(pole);
      out.arms.push({ x: p.x, y, z: p.z, ry, sx: Math.max(0.55, armLen / SIG.armTip), sy: 1, sz: 1, pole });
      for (const d of dists) out.heads.push({ ...headItem(p.x + armX * d, y + SIG.headTop, p.z + armZ * d, ry, ph), pole });
      // street-name blade on the arm (names the street being crossed), readable from both sides
      const cross = legs.find((L) => Math.abs(L.dx * A.dx + L.dz * A.dz) < 0.5 && L.edge.name && L.edge.name !== A.edge.name);
      if (cross && armLen > 3.2) { const d = Math.min(armLen - 1.2, Math.max(2.1, armLen * 0.42)); out.blades.push({ x: p.x + armX * d, y: y + 6.62, z: p.z + armZ * d, ry, dx: armX, dz: armZ, name: cross.edge.name, len: Math.min(2.4, Math.max(1.5, armLen * 0.28)), pole }); }
      poleAt.push({ leg: legs.indexOf(B), side: 1, x: p.x, z: p.z, pole });
      return;
    }
    // ---- post-mounted heads (narrow junction or T stem) ----
    const F = [A.dx, A.dz]; // faces the approaching drivers (they travel -A.d)
    const post = (x, z, leg, side) => { const y = Y(x, z), pole = { x, y, z, ry: ryFace(F[0], F[1]), sy: 0.78, arm: false, leg, side }; out.poles.push(pole); out.heads.push({ ...headItem(x + F[0] * 0.34, y + 5.15, z + F[1] * 0.34, ryFace(F[0], F[1]), ph), pole }); poleAt.push({ leg, side, x, z, pole }); };
    if (B) {
      const p = spot(B, 1, station(B), setback(B)); if (p) post(p.x, p.z, legs.indexOf(B), 1); else out.skipped++;
      if (!B.edge.oneway) { const q = spot(B, -1, station(B), setback(B)); if (q) post(q.x, q.z, legs.indexOf(B), -1); }
    } else { // T stem: across the junction, in line with the approach lanes, behind the far curb
      const tx = -A.dx, tz = -A.dz, rx = A.dz, rz = -A.dx, c = li.lat.reduce((a, b) => a + b, 0) / li.lat.length;
      let dFar = 4; const P = J.poly; const inside = (x, z) => { let k = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) k = !k; } return k; };
      while (dFar < 40 && inside(n.x + tx * dFar + rx * c, n.z + tz * dFar + rz * c)) dFar += 0.25;
      let ok2 = false;
      for (const extra of [1.0, 1.4, 1.9, 2.5]) { const x = n.x + tx * (dFar + extra) + rx * c, z = n.z + tz * (dFar + extra) + rz * c; if (ok(x, z) && !used(x, z)) { post(x, z, -1, 0); ok2 = true; break; } }
      if (!ok2) out.skipped++;
    }
  });
  // ---- pedestrian signal heads at both ends of every crosswalk ----
  legs.forEach((L, il) => {
    if (!L.cw) return;
    for (const rp of L.ramps || []) {
      const side = rp.side, mid = (L.cw[0] + L.cw[1]) / 2, X = at(L, mid, side, L.hw), Yp = at(L, mid, -side, L.hw), [fx, fz] = unit(Yp.x - X.x, Yp.z - X.z);
      const wp = walkPhase(G, n, fx, fz), sig = [wp.off / 34, wp.phase, wp.live ? 1 : 0];
      const host = poleAt.find((p) => p.leg === il && p.side === side);
      if (host) { out.peds.push({ x: host.x, y: host.pole.y, z: host.z, ry: ryFace(fx, fz), sig, pole: host.pole }); continue; }
      const p = spot(L, side, L.cw[1] + RAMP_FLARE + 0.45, setback(L) - (L.sw > 0 ? 0.1 : 0)); if (!p) continue;
      const y = Y(p.x, p.z), post = { x: p.x, y, z: p.z, ry: ryFace(fx, fz), sy: 0.5 }; out.pedPosts.push(post); out.peds.push({ x: p.x, y, z: p.z, ry: ryFace(fx, fz), sig, pole: post });
    }
  });
  // ---- controller cabinet: behind the first mast pole, further back from the curb ----
  const hp = out.poles.find((p) => p.arm) || out.poles[0];
  if (hp && hp.leg >= 0) { const B = legs[hp.leg], c = spot(B, hp.side || 1, station(B) + 2.2, B.hw + (B.sw > 0 ? 2.05 : 3.0)); if (c) out.cabinets.push({ x: c.x, y: Y(c.x, c.z), z: c.z, ry: Math.atan2(-c.nx * (hp.side || 1), -c.nz * (hp.side || 1)) }); } // kit furniture fronts face +Z: door toward the road
  return out;
}
