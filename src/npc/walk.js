// How people walk (r6-walk; user, Nov 18: "they wander in the road and sometimes stand in the middle of a field",
// "not just a perfect robotic straight line", "people must never collide with or pass through each other, or the player").
// Shared by both tiers (src/npc/peds.js near people, src/npc/people.v2.js crowd walkers):
//   - cornerRoute(): how a walker gets from the sidewalk of one street to the sidewalk of the next at a junction. The
//     corners of a junction form a ring (one corner between each pair of neighboring streets); a walker goes around
//     the ring and crosses ONE street per step, straight from corner to corner, so every crossing is at the junction and
//     roughly square to the street it crosses. Nobody cuts diagonally through the middle of an intersection.
//   - createSpace(): cheap local avoidance on a spatial hash (personal radius 0.35 m, predicted look-ahead). It returns
//     a sidestep (which the walker applies as a lane shift on its own sidewalk) and a speed factor; it never moves
//     anybody, so nobody is pushed into a wall or into the road.
//   - walkGround(): is this spot a carriageway / an open field away from any path? (spawn rule and the audit)
export const SOFT_PATH = /footway|path|pedestrian|steps|cycleway/;          // walked ON, not beside
const NO_CROSS = /motorway|trunk|_link|rail|ferry/;
export const PERSON_R = 0.35;

const hwOf = (e) => (e.width || 8) / 2;
/** lateral distance (m from the centerline) of a walker's lane on an edge; lane 0..1 across the usable width */
export function laneBase(e, lane) {
  const hw = hwOf(e), sw = e.sidewalk || 0;
  if (SOFT_PATH.test(e.kind || '')) return Math.max(0, (lane - 0.5)) * Math.max(0.3, (e.width || 2) - 0.8);   // on the path itself
  return sw > 0.5 ? hw + 0.45 + lane * Math.max(0.3, sw - 0.9) : hw + 0.5 + lane * 1.0;                       // sidewalk, or the road edge
}
export const crossable = (e) => !NO_CROSS.test(e.kind || '') && (e.speedKmh || 40) < 75;

// unit direction of an edge leaving a node (from the polyline's first / last segment)
function outDir(e, node, o) {
  const p = e.pts, n = p.length;
  let x0, z0, x1, z1;
  if (e.a === node) { x0 = p[0][0]; z0 = p[0][1]; x1 = p[1][0]; z1 = p[1][1]; } else { x0 = p[n - 1][0]; z0 = p[n - 1][1]; x1 = p[n - 2][0]; z1 = p[n - 2][1]; }
  const l = Math.hypot(x1 - x0, z1 - z0) || 1;
  o.x = x0; o.z = z0; o.ux = (x1 - x0) / l; o.uz = (z1 - z0) / l;
  return o;
}

/**
 * Route around a junction. A = the edge the walker is on, arriving at `node` on side sigmaA (+1 = the counter-clockwise
 * side of A's outward direction, -1 = clockwise), offA = its lateral distance from A's centerline. B = the edge it takes
 * next. all = every edge at the node. lane = the walker's lane (0..1). wantOther = prefer the far side of B.
 * Returns { pts: [{ x, z, cross }], sigmaB, sB (m along B from the node where the walker joins B's sidewalk), crossings }
 * or null when B cannot be reached without crossing a road that must not be crossed.
 */
export function cornerRoute(node, A, sigmaA, offA, B, all, lane, wantOther = false) {
  const m = all.length; if (m < 2) return null;
  const dirs = all.map((e) => { const o = outDir(e, node, { e }); o.ang = Math.atan2(o.uz, o.ux); o.soft = SOFT_PATH.test(e.kind || ''); o.off = e === A ? offA : laneBase(e, Math.min(lane, 0.5)); return o; });
  dirs.sort((p, q) => p.ang - q.ang);
  const ia = dirs.findIndex((d) => d.e === A), ib = dirs.findIndex((d) => d.e === B); if (ia < 0 || ib < 0) return null;
  const N = dirs[0];
  // corner i sits between street i and street i+1 (counter-clockwise neighbor)
  const corner = (i) => {
    const d1 = dirs[((i % m) + m) % m], d2 = dirs[(((i + 1) % m) + m) % m];
    const n1x = -d1.uz, n1z = d1.ux, n2x = d2.uz, n2z = -d2.ux;                // d1's ccw normal, d2's cw normal
    const den = d1.ux * d2.uz - d1.uz * d2.ux, dot = d1.ux * d2.ux + d1.uz * d2.uz;
    if (Math.abs(den) < 0.3) {
      if (dot < 0) return { x: N.x + (n1x * d1.off + n2x * d2.off) / 2, z: N.z + (n1z * d1.off + n2z * d2.off) / 2 };   // straight through: beside the node
      // two streets leaving almost the same way: the tip of the wedge between them
      const bx = d1.ux + d2.ux, bz = d1.uz + d2.uz, bl = Math.hypot(bx, bz) || 1, r = Math.min(14, Math.max(d1.off, d2.off) / 0.3);
      return { x: N.x + (bx / bl) * r, z: N.z + (bz / bl) * r };
    }
    // N + n1*o1 + u1*a = N + n2*o2 + u2*b
    const rx = n2x * d2.off - n1x * d1.off, rz = n2z * d2.off - n1z * d1.off;
    let a = (rx * d2.uz - rz * d2.ux) / den;
    a = Math.max(-16, Math.min(16, a));
    return { x: N.x + n1x * d1.off + d1.ux * a, z: N.z + n1z * d1.off + d1.uz * a };
  };
  const ci = sigmaA > 0 ? ia : ia - 1;
  const opts = [];
  for (const sigmaB of [1, -1]) {
    const cj = sigmaB > 0 ? ib : ib - 1;
    const k = (((cj - ci) % m) + m) % m;
    for (const ccw of [true, false]) {
      const steps = ccw ? k : (m - k) % m;
      if (!ccw && k === 0) continue;
      let ok = true, crossings = 0; const seq = [];
      for (let s = 1; s <= steps; s++) {
        const c = ccw ? ci + s : ci - s;
        const over = dirs[(((ccw ? c : c + 1) % m) + m) % m];                 // the street between the previous corner and this one
        if (!over.soft) { if (!crossable(over.e) || m === 2) { ok = false; break; } crossings++; }
        seq.push({ c, cross: !over.soft });
      }
      if (ok) opts.push({ sigmaB, seq, crossings });
    }
  }
  if (!opts.length) return null;
  opts.sort((p, q) => p.crossings - q.crossings || p.seq.length - q.seq.length);
  let ch = opts[0];
  if (wantOther) { const o = opts.find((p) => p.sigmaB !== ch.sigmaB && p.crossings <= Math.max(1, ch.crossings + 1)); if (o) ch = o; }
  const pts = []; const c0 = corner(ci); pts.push({ x: c0.x, z: c0.z, cross: false });
  for (const s of ch.seq) { const c = corner(s.c); pts.push({ x: c.x, z: c.z, cross: s.cross }); }
  const last = pts[pts.length - 1], db = dirs[ib];
  const sB = Math.max(0.3, (last.x - N.x) * db.ux + (last.z - N.z) * db.uz);
  return { pts, sigmaB: ch.sigmaB, sB, crossings: ch.crossings };
}

/** distance (m along A, back from the node) at which a walker on A leaves its lane for the corner */
export function cornerSetback(node, A, all) {
  let sb = 0.6; const a = outDir(A, node, {});
  for (const e of all) {
    if (e === A) continue;
    const o = outDir(e, node, {}); const sin = Math.abs(a.ux * o.uz - a.uz * o.ux);
    if (sin < 0.3) continue;                                                   // the same street continuing: no corner to round
    sb = Math.max(sb, (SOFT_PATH.test(e.kind || '') ? 0.6 : hwOf(e) + 0.6) / Math.max(sin, 0.5));
  }
  return Math.min(sb, 16);
}

// ---------------------------------------------------------------------------------------------------- avoidance
/**
 * Spatial hash of everybody on foot. add(agent) with { x, z, vx, vz, id, group, still }; steer(agent, fx, fz, speed)
 * returns { side: -1..1 (sidestep, + = toward (cos h, -sin h) for heading h), slow: 0..1 (speed factor), block: true when stepping on
 * would put the walker inside somebody }. Nothing is moved here.
 */
export function createSpace(cell = 1.6) {
  const cells = new Map(); const pool = []; let used = 0;
  const key = (x, z) => (Math.floor(x / cell) * 73856093) ^ (Math.floor(z / cell) * 19349663);
  const out = { side: 0, slow: 1, block: false, n: 0 };
  return {
    clear() { cells.clear(); used = 0; },
    add(a) {
      const k = key(a.x, a.z); let c = cells.get(k);
      if (!c) { c = pool[used] || (pool[used] = []); used++; c.length = 0; cells.set(k, c); }
      c.push(a);
    },
    /** me = the agent object that was added (skipped), at (x, z) moving along (fx, fz) at speed v */
    steer(me, x, z, fx, fz, v, look = 1.6) {
      out.side = 0; out.slow = 1; out.block = false; out.n = 0;
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell), R = 2 * PERSON_R;
      const mvx = fx * v, mvz = fz * v;
      for (let ix = cx - 2; ix <= cx + 2; ix++) for (let iz = cz - 2; iz <= cz + 2; iz++) {
        const c = cells.get((ix * 73856093) ^ (iz * 19349663)); if (!c) continue;
        for (let q = 0; q < c.length; q++) {
          const b = c[q]; if (b === me || (me.group && b.group === me.group)) continue;
          const dx = b.x - x, dz = b.z - z, d2 = dx * dx + dz * dz; if (d2 > 9) continue;
          const d = Math.sqrt(d2) || 1e-3;
          const ahead = dx * fx + dz * fz, right = dx * fz - dz * fx;          // + = b is on my right
          // closest approach within the look-ahead
          const rvx = mvx - (b.vx || 0), rvz = mvz - (b.vz || 0), rv2 = rvx * rvx + rvz * rvz;
          let t = rv2 > 1e-4 ? (dx * rvx + dz * rvz) / rv2 : 0; t = t < 0 ? 0 : t > look ? look : t;
          const px = dx - rvx * t, pz = dz - rvz * t, dm = Math.hypot(px, pz);
          if (dm < R + 0.25 && ahead > -0.25) {
            const u = (1 - t / look) * (1 - Math.min(1, dm / (R + 0.25)) * 0.5);
            // step away from the side they will pass on; dead ahead: keep right
            const pr = px * fz - pz * fx;
            out.side += (Math.abs(pr) < 0.06 ? -1 : pr > 0 ? -1 : 1) * u; out.n++;   // (-1 = the walker's true right: three.js +z forward)
          }
          // somebody right in front: slow down behind them, stop before touching
          if (ahead > 0 && ahead < 1.5 && Math.abs(right) < R) {
            const closing = (rvx * dx + rvz * dz) / d;
            if (closing > -0.05) out.slow = Math.min(out.slow, Math.max(0, (ahead - (R + 0.12)) / 0.75));
          }
          // would the next quarter second put me inside them? (only when moving toward them)
          if (v > 0.01) { const nx = dx - fx * 0.3, nz = dz - fz * 0.3; if (nx * nx + nz * nz < R * R && nx * nx + nz * nz < d2) out.block = true; }
        }
      }
      if (out.side > 1) out.side = 1; else if (out.side < -1) out.side = -1;
      if (out.block) out.slow = 0;
      return out;
    },
    /** is anybody within r of (x, z)? (spawn rule) */
    occupied(x, z, r) {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const c = cells.get((ix * 73856093) ^ (iz * 19349663)); if (!c) continue;
        for (const b of c) if ((b.x - x) ** 2 + (b.z - z) ** 2 < r * r) return true;
      }
      return false;
    },
    /** overlapping pairs (closer than r, not in one group, at least one of them walking) */
    overlaps(r = 0.5) {
      let n = 0;
      for (const c of cells.values()) for (const a of c) {
        const cx = Math.floor(a.x / cell), cz = Math.floor(a.z / cell);
        for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const c2 = cells.get((ix * 73856093) ^ (iz * 19349663)); if (!c2) continue;
          for (const b of c2) { if (b === a || b.id <= a.id || (a.group && a.group === b.group) || (a.still && b.still)) continue; if ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 < r * r) n++; }
        }
      }
      return n;
    },
  };
}

// ---------------------------------------------------------------------------------------------------- ground rules
const PAVED = /concrete|pavers|tile|sand|wood|pier|sidewalk|gravel/;
/**
 * What a walker stands on: 'road' (a carriageway), 'field' (open ground away from any path, sand and paved plazas
 * excepted) or 'ok'. game.placement.onRoad is the one shared carriageway rule (src/world/placement.v2.js).
 */
export function walkGround(game, x, z, _o = {}) {
  try { if (game.placement?.onRoad?.(x, z, 0)) return 'road'; } catch (e) { /* */ }
  const city = game.city; const RG = city?.roadGraph;
  try {
    const r = RG?.nearestEdge?.(x, z, _o, 40);
    if (r && r.edge && r.dist <= hwOf(r.edge) + (r.edge.sidewalk || 0) + 4) return 'ok';
    const zn = city.zoneAt?.(x, z); if (zn === 'beach') return 'ok';
    const s = String(city.surfaceAt?.(x, z) || '');
    if (PAVED.test(s)) return 'ok';
    return 'field';
  } catch (e) { return 'ok'; }
}

// r7-walk (user: "an NPC walked through a tree"): thin static obstacles ahead (tree / palm trunks from trunks.js, poles,
// posts, hydrants with colliders) are seen with a waist-high Rapier ray every ~0.35 s and passed on the clearer side
// (returns the nav.steer side: +1 = toward the walker's right). Wide obstacles (both 30-degree side probes blocked: a
// wall, a car) are left to the normal path logic. No allocations: one shared ray.
let _oRay = null, _oFlags = 0;
function oProbe(game, x, y, z, dx, dz, far) {
  const R = game.RAPIER, W = game.world; if (!R || !W) return far;
  if (!_oRay) { _oRay = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }); const Q = R.QueryFilterFlags; _oFlags = Q.EXCLUDE_DYNAMIC | Q.EXCLUDE_KINEMATIC | Q.EXCLUDE_SENSORS; }
  _oRay.origin.x = x; _oRay.origin.y = y; _oRay.origin.z = z; _oRay.dir.x = dx; _oRay.dir.y = 0; _oRay.dir.z = dz;
  try { const h = W.castRay(_oRay, far, true, _oFlags); return h ? h.timeOfImpact : far; } catch (e) { return far; }
}
export function obstacleSteer(game, a, x, y, z, fx, fz, dt) {
  a._obsHold = (a._obsHold || 0) - dt;
  if ((a._obsT = (a._obsT ?? Math.random() * 0.35) - dt) <= 0) {
    a._obsT = 0.35;
    const FAR = 2.4, d = oProbe(game, x, y + 1.0, z, fx, fz, FAR);
    if (d < FAR) {
      const c = 0.866, s = 0.5, rx = fz, rz = -fx;   // right = (cos h, -sin h)
      const dr = oProbe(game, x, y + 1.0, z, fx * c + rx * s, fz * c + rz * s, FAR), dl = oProbe(game, x, y + 1.0, z, fx * c - rx * s, fz * c - rz * s, FAR);
      if (dr > 1.6 || dl > 1.6) { a._obsSide = dr >= dl ? 1 : -1; a._obsHold = 0.9 + (FAR - d) * 0.4; }
    }
  }
  return a._obsHold > 0 ? a._obsSide : 0;
}

// r7-walk (user: Keys streets have no sidewalks): people walking on the shoulder of a road without a sidewalk watch for
// cars. A car coming along the road within ~28 m (closing, within 4 m of their line) makes them step out toward the
// verge and slow down until it has passed. CARS is filled once a frame (updateCarList), no allocations.
export const CARS = { n: 0, x: new Float32Array(128), z: new Float32Array(128), vx: new Float32Array(128), vz: new Float32Array(128) };
const _carPrev = new WeakMap();
export function updateCarList(game, cx, cz, dt) {
  CARS.n = 0; const L = game.vehicles?.list; if (!L || !(dt > 0)) return;
  for (let i = 0; i < L.length && CARS.n < 128; i++) {
    const v = L[i], p = v.mesh?.position; if (!p || v.parked || v.air || v.isBoat) continue;
    let pr = _carPrev.get(v); if (!pr) { pr = { x: p.x, z: p.z }; _carPrev.set(v, pr); }
    const vx = (p.x - pr.x) / dt, vz = (p.z - pr.z) / dt; pr.x = p.x; pr.z = p.z;
    if (Math.abs(p.x - cx) > 140 || Math.abs(p.z - cz) > 140 || vx * vx + vz * vz < 4 || vx * vx + vz * vz > 2500) continue;
    const k = CARS.n++; CARS.x[k] = p.x; CARS.z[k] = p.z; CARS.vx[k] = vx; CARS.vz[k] = vz;
  }
}
/** returns the nav.steer side to step toward the verge (0 = nothing coming); a._cySlow = speed factor meanwhile */
export function carYield(a, n, x, z, dt) {
  a._cyHold = (a._cyHold || 0) - dt;
  const e = n?.edge;
  if (!e || (e.sidewalk || 0) > 0.5 || SOFT_PATH.test(e.kind || '') || n.path || n.cross) { a._cySlow = 1; return 0; }
  if ((a._cyT = (a._cyT ?? Math.random() * 0.25) - dt) <= 0) {
    a._cyT = 0.25;
    for (let k = 0; k < CARS.n; k++) {
      const dx = x - CARS.x[k], dz = z - CARS.z[k], d2 = dx * dx + dz * dz; if (d2 > 28 * 28) continue;
      const vx = CARS.vx[k], vz = CARS.vz[k], sp = Math.sqrt(vx * vx + vz * vz), along = (dx * vx + dz * vz) / sp;
      if (along < -2) continue;                                   // already past
      const lat = Math.abs(dx * vz - dz * vx) / sp; if (lat > 4) continue;
      a._cyHold = 1.2; break;
    }
  }
  if (a._cyHold > 0) { a._cySlow = 0.45; return -(n.hand || 1); }
  a._cySlow = 1; return 0;
}
