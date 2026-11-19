// SOUTHLINE — GPS routing over city.roadGraph (A*), used by the HUD for waypoint routes.
// route(fromX, fromZ, toX, toZ) -> { pts: [[x,z],...], length } | null

const WALK_KINDS = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'steps']);

function polyLen(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++)
    l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

// split polyline at the closest point to (x,z): returns { toA: pts from point back to pts[0], toB: point .. end, point }
function splitAt(pts, x, z) {
  let bi = 0,
    bt = 0,
    bd = Infinity,
    bx = pts[0][0],
    bz = pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0],
      az = pts[i][1],
      dx = pts[i + 1][0] - ax,
      dz = pts[i + 1][1] - az,
      L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * t,
      pz = az + dz * t,
      d = Math.hypot(x - px, z - pz);
    if (d < bd) {
      bd = d;
      bi = i;
      bt = t;
      bx = px;
      bz = pz;
    }
  }
  const p = [bx, bz];
  const toA = [p, ...pts.slice(0, bi + 1).reverse()];
  const toB = [p, ...pts.slice(bi + 1)];
  return { toA, toB, point: p, dist: bd };
}

class Heap {
  constructor() {
    this.a = [];
  }
  push(n, f) {
    const a = this.a;
    a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a,
      top = a[0],
      last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() {
    return this.a.length;
  }
}

export function createGPS(game) {
  let G = null,
    adj = null,
    nodeById = null,
    built = null;
  function graph() {
    const g = game.city?.roadGraph;
    if (!g || !Array.isArray(g.edges) || !Array.isArray(g.nodes)) return null;
    if (built === g) return g;
    built = g;
    adj = new Map();
    nodeById = new Map();
    for (const n of g.nodes) nodeById.set(n.id, n);
    for (const e of g.edges) {
      if (!e || !Array.isArray(e.pts) || e.pts.length < 2) continue;
      if (WALK_KINDS.has(e.kind)) continue;
      const len = e.length || polyLen(e.pts);
      e._len = len;
      const push = (from, to, fwd) => {
        let a = adj.get(from);
        if (!a) adj.set(from, (a = []));
        a.push({ to, e, fwd, len });
      };
      push(e.a, e.b, true);
      push(e.b, e.a, false);
    }
    G = g;
    return g;
  }
  function nearest(x, z) {
    const g = graph();
    if (!g) return null;
    if (typeof g.nearestEdge === 'function') {
      try {
        const r = g.nearestEdge(x, z);
        if (r && r.edge && !WALK_KINDS.has(r.edge.kind)) return r.edge;
        if (r && r.edge) return r.edge;
      } catch (e) {
        /* */
      }
    }
    let best = null,
      bd = Infinity;
    for (const e of g.edges) {
      if (!e?.pts) continue;
      const s = splitAt(e.pts, x, z);
      if (s.dist < bd) {
        bd = s.dist;
        best = e;
      }
    }
    return best;
  }
  // ---- travel-time routing (user: "consider what roads you can go faster on, the traffic; go straight then turn, don't weave") ----
  // cost = seconds: edge length at a realistic cruising speed for its class / posted limit, plus the wait at the node's control
  // (signal / stop / yield) and a turn penalty (straight 0, slight 1 s, right 4 s, left 8 s, U-turn 25 s; right-hand traffic).
  // A* over directed edges so every turn is priced; the heuristic is distance at 33 m/s, so it stays admissible.
  const KIND_KMH = {
    motorway: 105,
    motorway_link: 60,
    trunk: 80,
    trunk_link: 50,
    primary: 60,
    primary_link: 40,
    secondary: 52,
    secondary_link: 35,
    tertiary: 45,
    tertiary_link: 30,
    unclassified: 38,
    residential: 32,
    living_street: 15,
    service: 18,
    track: 15,
  };
  const KIND_FLOW = {
    motorway: 0.95,
    trunk: 0.9,
    primary: 0.8,
    secondary: 0.78,
    tertiary: 0.75,
    residential: 0.68,
    unclassified: 0.7,
    service: 0.6,
  };
  const V_MAX = 33;
  function edgeSec(e, len) {
    const k = String(e.kind || ''),
      base = k.replace(/_link$/, '');
    const kmh = (e.speedKmh > 0 ? e.speedKmh : KIND_KMH[k] || 35) * (KIND_FLOW[base] ?? 0.7);
    const lanes = (e.lanesFwd || 0) + (e.lanesBack || 0);
    const laneF = lanes >= 4 ? 1.06 : lanes <= 1 && !e.oneway ? 0.9 : 1; // wide roads flow better, narrow two-ways worse
    return len / Math.max(3, (kmh / 3.6) * laneF);
  }
  function bearingEnd(e, fwd) {
    const P = e.pts,
      n = P.length;
    const [a, b] = fwd ? [P[Math.max(0, n - 2)], P[n - 1]] : [P[1], P[0]];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  function bearingStart(e, fwd) {
    const P = e.pts,
      n = P.length;
    const [a, b] = fwd ? [P[0], P[1]] : [P[n - 1], P[n - 2]];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  const CTRL_SEC = { signal: 14, stop: 7, yield: 2.5 };
  function nodeSec(e, fwd, e2, fwd2, node) {
    if (e === e2 && fwd !== fwd2) return 25;
    let d = bearingStart(e2, fwd2) - bearingEnd(e, fwd);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const ad = Math.abs(d),
      deg = (adj.get(node) || []).length;
    let t = ad < 0.35 ? 0 : ad < 0.7 ? 1 : ad > 2.6 ? 25 : d > 0 ? 4 : 8; // x east, z south: +angle (east -> south) is a right turn; lefts cross oncoming traffic
    if (deg > 2) {
      const c = G.controlAt ? G.controlAt(e, fwd ? 1 : -1) : null;
      t += c ? CTRL_SEC[c] || 0 : ad < 0.35 ? 1.5 : 3;
    }
    return t;
  }
  function astar(starts, goals, tx, tz, respectOneway) {
    // states: directed edges (key = edgeIndex*2 + fwd). starts: { node, cost(s) } reached by leaving the start edge toward node
    const gScore = new Map(),
      came = new Map(),
      heap = new Heap(),
      closed = new Set(),
      eIdx = new Map();
    const key = (e, fwd) => {
      let i = eIdx.get(e);
      if (i == null) {
        i = eIdx.size;
        eIdx.set(e, i);
      }
      return i * 2 + (fwd ? 1 : 0);
    };
    const hz = (node) => {
      const n = nodeById.get(node);
      return n ? Math.hypot(n.x - tx, n.z - tz) / V_MAX : 0;
    };
    const goalBy = new Map();
    for (const g2 of goals) {
      const l = goalBy.get(g2.node) || [];
      l.push(g2);
      goalBy.set(g2.node, l);
    }
    const S = new Map(); // key -> { e, fwd, end, prevKey }
    let best = null,
      bestCost = Infinity,
      iter = 0;
    const tryGoal = (k, st, gk) => {
      for (const gl of goalBy.get(st.end) || []) {
        const t = gk + (gl.e ? nodeSec(st.e, st.fwd, gl.e, gl.fwd, st.end) : 0) + gl.cost;
        if (t < bestCost) {
          bestCost = t;
          best = k;
        }
      }
    };
    for (const s0 of starts) {
      // virtual start state at s0.node, coming off the start edge
      const k = -1 - S.size;
      S.set(k, { e: s0.e, fwd: s0.fwd, end: s0.node, prevKey: null, virtual: true });
      gScore.set(k, s0.cost);
      heap.push(k, s0.cost + hz(s0.node));
    }
    while (heap.size && iter++ < 250000) {
      const k = heap.pop();
      if (closed.has(k)) continue;
      closed.add(k);
      const st = S.get(k),
        gk = gScore.get(k);
      if (gk >= bestCost) break;
      tryGoal(k, st, gk);
      for (const nb of adj.get(st.end) || []) {
        if (respectOneway && nb.e.oneway && !nb.fwd) continue;
        if (
          respectOneway &&
          G.turnAllowed &&
          st.e &&
          st.e.id != null &&
          nb.e.id != null &&
          !G.turnAllowed(st.e.id, st.end, nb.e.id)
        )
          continue;
        const nk = key(nb.e, nb.fwd),
          ng =
            gk + (st.e ? nodeSec(st.e, st.fwd, nb.e, nb.fwd, st.end) : 0) + edgeSec(nb.e, nb.len);
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          S.set(nk, { e: nb.e, fwd: nb.fwd, end: nb.to, prevKey: k });
          heap.push(nk, ng + hz(nb.to));
        }
      }
    }
    if (best == null) return null;
    const chain = [];
    let cur = best;
    while (cur != null && !S.get(cur).virtual) {
      const st = S.get(cur);
      chain.push({ e: st.e, fwd: st.fwd });
      cur = st.prevKey;
    }
    chain.reverse();
    return { startNode: S.get(cur).end, endNode: S.get(best).end, chain, cost: bestCost };
  }
  function route(fx, fz, tx, tz) {
    if (!graph()) return null;
    const es = nearest(fx, fz),
      eg = nearest(tx, tz);
    if (!es || !eg) return null;
    const ss = splitAt(es.pts, fx, fz),
      sg = splitAt(eg.pts, tx, tz);
    // same edge: direct
    if (es === eg) {
      const pts = [[fx, fz], ss.point, sg.point, [tx, tz]];
      return { pts, length: polyLen(pts) };
    }
    const lenA = polyLen(ss.toA),
      lenB = polyLen(ss.toB);
    const glA = polyLen(sg.toA),
      glB = polyLen(sg.toB);
    let res = null;
    for (const strict of [true, false]) {
      const starts = [],
        goals = [];
      if (!strict || !es.oneway)
        starts.push({ node: es.a, cost: edgeSec(es, lenA), e: es, fwd: false });
      starts.push({ node: es.b, cost: edgeSec(es, lenB), e: es, fwd: true });
      goals.push({ node: eg.a, cost: edgeSec(eg, glA), e: eg, fwd: true });
      if (!strict || !eg.oneway)
        goals.push({ node: eg.b, cost: edgeSec(eg, glB), e: eg, fwd: false });
      res = astar(starts, goals, tx, tz, strict);
      if (res) break;
    }
    if (!res) return null;
    const pts = [[fx, fz]];
    const append = (arr) => {
      for (const p of arr) {
        const l = pts[pts.length - 1];
        if (!l || Math.abs(l[0] - p[0]) > 0.01 || Math.abs(l[1] - p[1]) > 0.01) pts.push(p);
      }
    };
    append(res.startNode === es.a ? ss.toA : ss.toB);
    for (const c of res.chain) append(c.fwd ? c.e.pts : c.e.pts.slice().reverse());
    append((res.endNode === eg.a ? sg.toA : sg.toB).slice().reverse());
    append([[tx, tz]]);
    return { pts, length: polyLen(pts) };
  }
  // distance from point to polyline
  function distTo(pts, x, z) {
    return pts && pts.length > 1 ? splitAt(pts, x, z).dist : Infinity;
  }
  // remaining polyline from the player's projection
  function trimFrom(pts, x, z) {
    if (!pts || pts.length < 2) return pts;
    return splitAt(pts, x, z).toB;
  }
  return { route, distTo, trimFrom, polyLen, available: () => !!graph() };
}
