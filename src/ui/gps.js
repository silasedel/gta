// SOUTHLINE — GPS routing over city.roadGraph (A*), used by the HUD for waypoint routes.
// route(fromX, fromZ, toX, toZ) -> { pts: [[x,z],...], length } | null

const WALK_KINDS = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps']);

function polyLen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }

// split polyline at the closest point to (x,z): returns { toA: pts from point back to pts[0], toB: point .. end, point }
function splitAt(pts, x, z) {
  let bi = 0, bt = 0, bd = Infinity, bx = pts[0][0], bz = pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; bi = i; bt = t; bx = px; bz = pz; }
  }
  const p = [bx, bz];
  const toA = [p, ...pts.slice(0, bi + 1).reverse()];
  const toB = [p, ...pts.slice(bi + 1)];
  return { toA, toB, point: p, dist: bd };
}

class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
  get size() { return this.a.length; }
}

export function createGPS(game) {
  let G = null, adj = null, nodeById = null, built = null;
  function graph() {
    const g = game.city?.roadGraph;
    if (!g || !Array.isArray(g.edges) || !Array.isArray(g.nodes)) return null;
    if (built === g) return g;
    built = g; adj = new Map(); nodeById = new Map();
    for (const n of g.nodes) nodeById.set(n.id, n);
    for (const e of g.edges) {
      if (!e || !Array.isArray(e.pts) || e.pts.length < 2) continue;
      if (WALK_KINDS.has(e.kind)) continue;
      const len = e.length || polyLen(e.pts);
      e._len = len;
      const push = (from, to, fwd) => { let a = adj.get(from); if (!a) adj.set(from, (a = [])); a.push({ to, e, fwd, len }); };
      push(e.a, e.b, true);
      push(e.b, e.a, false);
    }
    G = g; return g;
  }
  function nearest(x, z) {
    const g = graph(); if (!g) return null;
    if (typeof g.nearestEdge === 'function') { try { const r = g.nearestEdge(x, z); if (r && r.edge && !WALK_KINDS.has(r.edge.kind)) return r.edge; if (r && r.edge) return r.edge; } catch (e) { /* */ } }
    let best = null, bd = Infinity;
    for (const e of g.edges) { if (!e?.pts) continue; const s = splitAt(e.pts, x, z); if (s.dist < bd) { bd = s.dist; best = e; } }
    return best;
  }
  function astar(starts, goals, tx, tz, respectOneway) {
    const gScore = new Map(), came = new Map(), heap = new Heap(), closed = new Set();
    for (const s of starts) { if (!gScore.has(s.node) || gScore.get(s.node) > s.cost) { gScore.set(s.node, s.cost); came.set(s.node, null); const n = nodeById.get(s.node); heap.push(s.node, s.cost + (n ? Math.hypot(n.x - tx, n.z - tz) : 0)); } }
    const goalCost = new Map(goals.map((g2) => [g2.node, g2]));
    let best = null, bestCost = Infinity, iter = 0;
    while (heap.size && iter++ < 200000) {
      const u = heap.pop();
      if (closed.has(u)) continue; closed.add(u);
      const gu = gScore.get(u);
      if (gu >= bestCost) break;
      const gl = goalCost.get(u);
      if (gl && gu + gl.cost < bestCost) { bestCost = gu + gl.cost; best = u; }
      for (const nb of adj.get(u) || []) {
        if (respectOneway && nb.e.oneway && !nb.fwd) continue;
        const ng = gu + nb.len;
        if (ng < (gScore.get(nb.to) ?? Infinity)) {
          gScore.set(nb.to, ng); came.set(nb.to, { from: u, e: nb.e, fwd: nb.fwd });
          const n = nodeById.get(nb.to); heap.push(nb.to, ng + (n ? Math.hypot(n.x - tx, n.z - tz) : 0));
        }
      }
    }
    if (best == null) return null;
    const chain = []; let cur = best;
    while (came.get(cur)) { const c = came.get(cur); chain.push(c); cur = c.from; }
    chain.reverse();
    return { startNode: cur, endNode: best, chain, cost: bestCost };
  }
  function route(fx, fz, tx, tz) {
    if (!graph()) return null;
    const es = nearest(fx, fz), eg = nearest(tx, tz);
    if (!es || !eg) return null;
    const ss = splitAt(es.pts, fx, fz), sg = splitAt(eg.pts, tx, tz);
    // same edge: direct
    if (es === eg) {
      const pts = [[fx, fz], ss.point, sg.point, [tx, tz]];
      return { pts, length: polyLen(pts) };
    }
    const lenA = polyLen(ss.toA), lenB = polyLen(ss.toB);
    const glA = polyLen(sg.toA), glB = polyLen(sg.toB);
    let res = null;
    for (const strict of [true, false]) {
      const starts = [], goals = [];
      if (!strict || !es.oneway) starts.push({ node: es.a, cost: lenA });
      starts.push({ node: es.b, cost: lenB });
      goals.push({ node: eg.a, cost: glA });
      if (!strict || !eg.oneway) goals.push({ node: eg.b, cost: glB });
      res = astar(starts, goals, tx, tz, strict);
      if (res) break;
    }
    if (!res) return null;
    const pts = [[fx, fz]];
    const append = (arr) => { for (const p of arr) { const l = pts[pts.length - 1]; if (!l || Math.abs(l[0] - p[0]) > 0.01 || Math.abs(l[1] - p[1]) > 0.01) pts.push(p); } };
    append(res.startNode === es.a ? ss.toA : ss.toB);
    for (const c of res.chain) append(c.fwd ? c.e.pts : c.e.pts.slice().reverse());
    append((res.endNode === eg.a ? sg.toA : sg.toB).slice().reverse());
    append([[tx, tz]]);
    return { pts, length: polyLen(pts) };
  }
  // distance from point to polyline
  function distTo(pts, x, z) { return pts && pts.length > 1 ? splitAt(pts, x, z).dist : Infinity; }
  // remaining polyline from the player's projection
  function trimFrom(pts, x, z) { if (!pts || pts.length < 2) return pts; return splitAt(pts, x, z).toB; }
  return { route, distTo, trimFrom, polyLen, available: () => !!graph() };
}
