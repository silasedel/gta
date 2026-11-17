// ELEVATED agent: whole-network preprocessing of Miami's elevated roads (bridges, causeways, viaducts, ramps).
// OSM edges -> continuous chains (one deck ribbon per carriageway) -> smoothed plan geometry -> lateral relations
// (parallel decks joined into one slab, gores, medians, crossings) -> constrained vertical profiles + banking ->
// visible deck intervals, barrier lines, structure type (at grade / embankment / viaduct), piers, lamps, joints.
// Pure data (no THREE / RAPIER), deterministic.
import { P, rankOf } from './params.js';
import { smoothConstrained, boxSmooth } from './solve.js';
import { resolveOverrides, applyPlans, applyTargets, applyProfile } from './overrides.js';
const CLIP_OFF = typeof location !== 'undefined' && /[?&]clipfix=0/.test(location.search); // clipping-sweep before/after switch (audit only)

const DEG = Math.PI / 180;

// uniform grid of item ids (cell -> int list)
class Grid {
  constructor(cell) { this.cell = cell; this.m = new Map(); }
  k(i, j) { return (i + 4096) * 8192 + (j + 4096); }
  add(x0, z0, x1, z1, id) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
      const k = this.k(i, j); let l = this.m.get(k); if (!l) this.m.set(k, (l = [])); l.push(id);
    }
  }
  at(x, z) { return this.m.get(this.k(Math.floor(x / this.cell), Math.floor(z / this.cell))) || null; }
}

// stage 1 boot pacing: the network build is a generator that yields between its phases (and between the solver passes),
// so the city can build it in short main-thread tasks (buildNetworkSteps); buildNetwork() runs it to completion (same result).
export function buildNetwork(data, opts = {}) {
  const g = buildNetworkSteps(data, opts);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
export function* buildNetworkSteps(data, opts = {}) {
  let yieldN = 0;
  const now = () => (typeof performance !== 'undefined' ? performance : Date).now(), T0 = now(), phase = {}; let tP = T0; const mark = (k) => { const t = now(); phase[k] = Math.round(t - tP); tP = t; };
  const G = data.roadGraph, E = G.edges, N = G.nodes;
  const isWater = data.isWater ? (x, z) => data.isWater(x, z) : () => false;
  const seabed = data.seabedDepthAt ? (x, z) => -0.12 - Math.max(0.3, data.seabedDepthAt(x, z)) : () => -3;
  const terrainY = data.hasRelief && data.terrainHeightAt ? (x, z) => Math.max(0, data.terrainHeightAt(x, z) || 0) : () => 0;
  const groundY = (x, z) => (isWater(x, z) ? seabed(x, z) : terrainY(x, z)); // walls / piers stand on the real ground (hills outside real Miami)

  yield;
  // ---------------------------------------------------------------- 1. owned edges
  const own = new Uint8Array(E.length);
  const ymaxOf = (e) => { let m = 0; for (let i = 0; i < e.y.length; i++) if (e.y[i] > m) m = e.y[i]; return m; };
  for (const e of E) if (e.elevated && e.pts.length >= 2 && ymaxOf(e) >= P.MIN_OWN_Y) own[e.id] = 1;
  { // drop connected components that never rise above 1 m (data noise: tiny humps stay plain ground roads)
    const seen = new Uint8Array(E.length);
    for (const e0 of E) {
      if (!own[e0.id] || seen[e0.id]) continue;
      const comp = [], st = [e0.id]; seen[e0.id] = 1; let mx = 0;
      while (st.length) { const id = st.pop(), e = E[id]; comp.push(id); mx = Math.max(mx, ymaxOf(e)); for (const n of [e.a, e.b]) for (const k of N[n].edges) if (own[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
      if (mx < 1.0) for (const id of comp) own[id] = 0;
    }
  }
  const nodeOwnEnds = new Map(); // node -> [{e, atA}]
  for (const e of E) if (own[e.id]) for (const atA of [true, false]) { const n = atA ? e.a : e.b; if (!nodeOwnEnds.has(n)) nodeOwnEnds.set(n, []); nodeOwnEnds.get(n).push({ e, atA }); }
  // ground node: touches a street the city draws, or the data pins it at grade (OSM at-grade junction between two owned edges)
  const nodeIsGround = (n) => N[n].y < 0.3 || N[n].edges.some((k) => !own[k]);
  const nodeWidth = (n) => { let w = 0; for (const k of N[n].edges) w = Math.max(w, E[k].width); return w; };
  const endDir = (e, atA) => { const p = e.pts, q0 = atA ? p[0] : p[p.length - 1], q1 = atA ? p[1] : p[p.length - 2], l = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1; return [(q1[0] - q0[0]) / l, (q1[1] - q0[1]) / l]; };

  mark('before 2. chains');
  yield;
  // ---------------------------------------------------------------- 2. chains (through-pairing at nodes)
  const pairOf = new Map(); // `${edge}:${atA}` -> {e, atA}
  const keyEnd = (e, atA) => e.id * 2 + (atA ? 0 : 1);
  for (const [n, ends] of nodeOwnEnds) {
    if (nodeIsGround(n) && N[n].edges.length >= 3) continue; // ground junction: chains end here
    if (ends.length < 2) continue;
    const cand = [];
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
      const u = ends[i], v = ends[j]; if (u.e === v.e) continue;
      const du = endDir(u.e, u.atA), dv = endDir(v.e, v.atA), dot = du[0] * dv[0] + du[1] * dv[1];
      // oneway flow must pass through (one enters, one leaves)
      if (u.e.oneway && v.e.oneway && u.atA === v.atA) continue;
      if (ends.length > 2 && dot > -Math.cos(40 * DEG)) continue;
      const score = -dot + (u.e.kind === v.e.kind ? 0.3 : 0) + (u.e.name && u.e.name === v.e.name ? 0.3 : 0) - Math.abs(u.e.width - v.e.width) * 0.03;
      cand.push([score, u, v]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const used = new Set();
    for (const [, u, v] of cand) { const ku = keyEnd(u.e, u.atA), kv = keyEnd(v.e, v.atA); if (used.has(ku) || used.has(kv)) continue; used.add(ku); used.add(kv); pairOf.set(ku, v); pairOf.set(kv, u); }
  }
  const chainOfEdge = new Int32Array(E.length).fill(-1);
  const rawChains = [];
  const walk = (e0, fromA) => { // start at end (e0, fromA): traverse e0 from that end, keep going through pairs
    const list = []; let e = e0, entA = fromA;
    for (let guard = 0; guard < 10000; guard++) {
      if (chainOfEdge[e.id] >= 0) break;
      chainOfEdge[e.id] = rawChains.length; list.push({ e, rev: !entA });
      const exitAtA = !entA, nx = pairOf.get(keyEnd(e, exitAtA)); if (!nx) break;
      e = nx.e; entA = nx.atA;
    }
    return list;
  };
  for (const e of E) { if (!own[e.id] || chainOfEdge[e.id] >= 0) continue; // chain starts: unpaired ends
    for (const atA of [true, false]) if (!pairOf.has(keyEnd(e, atA)) && chainOfEdge[e.id] < 0) rawChains.push(walk(e, atA)); }
  for (const e of E) if (own[e.id] && chainOfEdge[e.id] < 0) rawChains.push(walk(e, true)); // loops
  // chain direction: follow traffic when oneway pieces disagree with the walk
  for (const list of rawChains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    let fw = 0, bw = 0; for (const { e, rev } of list) if (e.oneway) { if (rev) bw += e.length; else fw += e.length; }
    if (bw > fw) { list.reverse(); for (const it of list) it.rev = !it.rev; }
  }

  mark('before 3. plan geometry');
  yield;
  // ---------------------------------------------------------------- 3. plan geometry per chain
  const chains = [];
  for (const list of rawChains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const X = [], Z = [], YT = [], EI = [], PIN = [], HW = [], LF = [], LB = [], OW = [], SW = [];
    for (let q = 0; q < list.length; q++) {
      const { e, rev } = list[q], pts = e.pts, m = pts.length, cum = e.cum, L = e.length;
      const ns = Math.max(1, Math.round(L / P.SAMPLE));
      const lf = rev ? e.lanesBack : e.lanesFwd, lb = rev ? e.lanesFwd : e.lanesBack;
      const ow = e.oneway ? (rev ? -1 : 1) : 0;
      let seg = 0;
      for (let k = q === 0 ? 0 : 1; k <= ns; k++) {
        const sAlong = rev ? L * (1 - k / ns) : L * (k / ns);
        while (seg < m - 2 && cum[seg + 1] < sAlong) seg++;
        const sl = cum[seg + 1] - cum[seg], u = sl > 0 ? Math.min(1, Math.max(0, (sAlong - cum[seg]) / sl)) : 0;
        // reverse traversal: segment search must restart (s decreasing)
        X.push(pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * u); Z.push(pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * u);
        YT.push(e.y[seg] + (e.y[seg + 1] - e.y[seg]) * u); EI.push(e.id);
        PIN.push(k === 0 || k === ns ? 1 : 0); HW.push(e.width / 2); SW.push(P.BRIDGE_SIDEWALKS && e.bridge && /^(primary|secondary|tertiary|residential|unclassified|living_street)$/.test(e.kind) ? 1.6 : 0); LF.push(lf); LB.push(lb); OW.push(ow);
        if (rev) seg = 0;
      }
    }
    const n = X.length; if (n < 2) continue;
    // Taubin smoothing (no shrinkage), nodes pinned
    const x = Float64Array.from(X), z = Float64Array.from(Z), tx0 = new Float64Array(n), tz0 = new Float64Array(n);
    for (let it = 0; it < 30; it++) for (const f of [0.5, -0.53]) {
      for (let i = 1; i < n - 1; i++) { tx0[i] = (x[i - 1] + x[i + 1]) * 0.5 - x[i]; tz0[i] = (z[i - 1] + z[i + 1]) * 0.5 - z[i]; }
      for (let i = 1; i < n - 1; i++) if (!PIN[i]) { x[i] += f * tx0[i]; z[i] += f * tz0[i]; }
    }
    const first = list[0], last = list[list.length - 1];
    const c = {
      id: chains.length, edges: list.map((it) => it.e.id), revs: list.map((it) => it.rev), n,
      nodeA: first.rev ? first.e.b : first.e.a, nodeB: last.rev ? last.e.a : last.e.b,
      kind: list.reduce((a, it) => (rankOf(it.e.kind) > rankOf(a) ? it.e.kind : a), list[0].e.kind), name: list.find((it) => it.e.name)?.e.name || null,
      x, z, yT: Float64Array.from(YT), edge: Int32Array.from(EI), pin: Uint8Array.from(PIN),
      hw: boxSmooth(Float64Array.from(HW), 8, 2), sw: boxSmooth(Float64Array.from(SW), 4, 1), lanesF: Int8Array.from(LF), lanesB: Int8Array.from(LB), oneway: Int8Array.from(OW),
      bridge: list.some((it) => it.e.bridge), movable: list.some((it) => it.e.movable),
    };
    c.rank = rankOf(c.kind);
    chains.push(c);
  }
  // ELEVATED-2: per-cluster hand-authored overrides (plan re-routes now; vertical profiles inside solveChain)
  const ovApplied = opts.overrides === false ? [] : resolveOverrides(chains); if (ovApplied.length) { applyPlans(chains); applyTargets(chains); }
  // per-sample frames
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const n = c.n, x = c.x, z = c.z;
    c.s = new Float64Array(n); c.tx = new Float64Array(n); c.tz = new Float64Array(n); c.kap = new Float64Array(n);
    for (let i = 1; i < n; i++) c.s[i] = c.s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let dx = x[b] - x[a], dz = z[b] - z[a]; const l = Math.hypot(dx, dz) || 1; c.tx[i] = dx / l; c.tz[i] = dz / l; }
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), ds = c.s[b] - c.s[a] || 1; c.kap[i] = ((c.tx[b] - c.tx[a]) * -c.tz[i] + (c.tz[b] - c.tz[a]) * c.tx[i]) / ds; }
    c.kap = boxSmooth(c.kap, 3, 2);
    c.length = c.s[n - 1];
    c.HL = new Float64Array(n); c.HR = new Float64Array(n);
    // sidewalk where the smoothed width is real (>= 1.2 m), else a shoulder + jersey barrier
    for (let i = 0; i < n; i++) { if (c.sw[i] < 1.2) c.sw[i] = 0; c.HL[i] = c.hw[i] + (c.sw[i] ? c.sw[i] + P.PAR_W : P.SHOULDER + P.BAR_BASE); c.HR[i] = c.HL[i]; }
  }

  mark('before 4. spatial indexes');
  yield;
  // ---------------------------------------------------------------- 4. spatial indexes (chain segments + ground road segments)
  // segment ids: chain segs = c.segBase + i (i in [0, n-2]); ground segs = groundBase + k
  let nSeg = 0; for (const c of chains) { c.segBase = nSeg; nSeg += c.n - 1; }
  const segC = new Int32Array(nSeg), segI = new Int32Array(nSeg);
  for (const c of chains) for (let i = 0; i < c.n - 1; i++) { segC[c.segBase + i] = c.id; segI[c.segBase + i] = i; }
  const gSegE = [], gSegK = [];
  for (const e of E) if (!own[e.id]) for (let k = 0; k < e.pts.length - 1; k++) { gSegE.push(e.id); gSegK.push(k); }
  const RNB = 26; // neighbour search pad
  const nbGrid = new Grid(16);
  for (let s = 0; s < nSeg; s++) { const c = chains[segC[s]], i = segI[s]; const pad = Math.max(c.HL[i], c.HR[i]) + RNB;
    nbGrid.add(Math.min(c.x[i], c.x[i + 1]) - pad, Math.min(c.z[i], c.z[i + 1]) - pad, Math.max(c.x[i], c.x[i + 1]) + pad, Math.max(c.z[i], c.z[i + 1]) + pad, s); }
  for (let g = 0; g < gSegE.length; g++) { const e = E[gSegE[g]], k = gSegK[g], a = e.pts[k], b = e.pts[k + 1], pad = e.width / 2 + RNB;
    nbGrid.add(Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, nSeg + g); }

  mark('before 5. lateral relations');
  yield;
  // ---------------------------------------------------------------- 5. lateral relations (per sample, per neighbour)
  // rel: {k (chain id or -1 ground), e (ground edge), j, u, t1, t2, a, b, same, joined, cross, d}
  const ordered = chains.slice().sort((p, q) => q.rank - p.rank || q.length - p.length || p.id - q.id);
  ordered.forEach((c, i) => { c.prio = ordered.length - i; }); // higher = wins
  const GROUND_PRIO = 1e9;
  const tmpBest = new Map();
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    c.rel = new Array(c.n);
    for (let i = 0; i < c.n; i++) {
      const px = c.x[i], pz = c.z[i], tx = c.tx[i], tz = c.tz[i], nx = -tz, nz = tx;
      const cand = nbGrid.at(px, pz); const out = [];
      if (cand) {
        tmpBest.clear();
        for (const s of cand) {
          let ax, az, bx, bz, kId, key, hk, first, last;
          if (s < nSeg) { const k = segC[s]; if (k === c.id) continue; const j = segI[s], ck = chains[k]; ax = ck.x[j]; az = ck.z[j]; bx = ck.x[j + 1]; bz = ck.z[j + 1]; kId = k; key = k; first = j === 0; last = j === ck.n - 2; }
          else { const g = s - nSeg, e = E[gSegE[g]], k = gSegK[g]; ax = e.pts[k][0]; az = e.pts[k][1]; bx = e.pts[k + 1][0]; bz = e.pts[k + 1][1]; kId = -1; key = -1 - e.id; hk = e.width / 2; first = k === 0; last = k === e.pts.length - 2; }
          const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (L2 < 1e-8) continue;
          let u = ((px - ax) * dx + (pz - az) * dz) / L2; const endCl = (u <= 1e-6 && first) || (u >= 1 - 1e-6 && last); u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = ax + dx * u, qz = az + dz * u, d = Math.hypot(px - qx, pz - qz);
          const prev = tmpBest.get(key); if (prev && prev.d <= d) continue;
          tmpBest.set(key, { s, k: kId, u, d, qx, qz, dx, dz, endCl });
        }
        for (const [key, h] of tmpBest) {
          const L = Math.hypot(h.dx, h.dz), ktx = h.dx / L, ktz = h.dz / L, knx = -ktz, knz = ktx;
          let HkL, HkR, yk, ck = null, j = 0, eId = -1;
          if (h.k >= 0) { ck = chains[h.k]; j = segI[h.s]; HkL = ck.HL[j] + (ck.HL[j + 1] - ck.HL[j]) * h.u; HkR = ck.HR[j] + (ck.HR[j + 1] - ck.HR[j]) * h.u; yk = ck.yT[j] + (ck.yT[j + 1] - ck.yT[j]) * h.u; }
          else { eId = -1 - key; HkL = HkR = E[eId].width / 2; yk = 0; }
          const cosA = tx * ktx + tz * ktz, along = (px - h.qx) * ktx + (pz - h.qz) * ktz, par = Math.abs(cosA) > P.PAR_COS && !h.endCl;
          const a = (px - h.qx) * knx + (pz - h.qz) * knz, b = nx * knx + nz * knz;
          let t1 = 0, t2 = 0, near = false;
          const dyT = c.yT[i] - yk;
          if (par && Math.abs(b) > 0.5) {
            const ta = (-HkL - a) / b, tb = (HkR - a) / b; t1 = Math.min(ta, tb); t2 = Math.max(ta, tb);
            if (t2 > -c.HL[i] - P.GAP_JOIN && t1 < c.HR[i] + P.GAP_JOIN) near = true;
          }
          const over = h.d < Math.max(HkL, HkR) + Math.max(c.HL[i], c.HR[i]) + 0.6;
          // real footprint overlap: parallel -> lateral intervals overlap; crossing -> distance test
          const ovl = par && Math.abs(b) > 0.5 ? t2 > -c.HL[i] && t1 < c.HR[i] : over;
          if (!near && !over) continue;
          out.push({ k: h.k, e: eId, j, u: h.u, t1, t2, a, b, same: cosA > 0, near, over, ovl, dyT, joined: false, clip: false, d: h.d, prio: h.k >= 0 ? ck.prio : GROUND_PRIO });
        }
      }
      c.rel[i] = out;
    }
  }

  mark('before 6. node heights');
  yield;
  // ---------------------------------------------------------------- 6. node heights, banking, vertical profiles (priority order)
  const nodeY = new Map(); // fixed node heights
  for (const n of nodeOwnEnds.keys()) if (nodeIsGround(n)) nodeY.set(n, 0);
  const atSample = (arr, j, u) => arr[j] + (arr[j + 1] - arr[j]) * u;
  const solved = new Uint8Array(chains.length);
  const stats = { infeasible: 0, liftedOverRoad: 0, droppedUnder: 0 };
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    c.trimA = 0; c.trimB = 0; c.endA = 'free'; c.endB = 'free';
    for (const [end, node] of [[0, c.nodeA], [1, c.nodeB]]) {
      const ground = nodeIsGround(node), deg = N[node].edges.length;
      const kind = ground ? (deg >= 3 ? 'junction' : 'street') : deg === 1 ? 'dead' : 'deck';
      if (end === 0) c.endA = kind; else c.endB = kind;
      if (kind === 'junction') { const tr = nodeWidth(node) / 2 + 0.5; if (end === 0) c.trimA = tr; else c.trimB = tr; }
    }
  }
  // nodes along each chain (edge joints) for "do these two chains meet here" tests
  for (const c of chains) { const ns = new Set(); for (const id of c.edges) { ns.add(E[id].a); ns.add(E[id].b); } c.nodeSet = ns; }
  function sharesNodeNear(c, k, x, z, R) { for (const nd of c.nodeSet) if (k.nodeSet.has(nd) && Math.hypot(N[nd].x - x, N[nd].z - z) < R) return true; return false; }
  // gore / merge runs: a contiguous stretch where a deck overlaps a same-direction neighbour in plan stays coplanar with
  // it for the whole overlap if it is level with it anywhere in the run (OSM ramps "climb" while still on the main deck)
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const runs = new Map(); // key -> [[i, r], ...] last run
    const flush = (list) => { if (!list.length) return; let lv = false; for (const [, r] of list) if (Math.abs(r.dyT) < P.JOIN_DY) lv = true; if (lv) for (const [, r] of list) if (Math.abs(r.dyT) < 9) r.fj = true; };
    const open = new Map();
    for (let i = 0; i < c.n; i++) {
      const seen = new Set();
      for (const r of c.rel[i]) { if (!(r.near && r.ovl)) continue; const key = r.k >= 0 ? r.k : -1 - r.e; seen.add(key); let l = open.get(key); if (!l) open.set(key, (l = [])); l.push([i, r]); }
      for (const [key, l] of open) if (!seen.has(key)) { flush(l); open.delete(key); }
    }
    for (const l of open.values()) flush(l);
  }
  // pass 0: independent solve (mandatory merges + clearances); pass 1: + optional gap fills where the decks already sit level
  for (const c of chains) c.extraHi = new Float64Array(c.n).fill(Infinity);
  for (let pass = 0; pass < 4; pass++) {
    solved.fill(0); nodeY.clear(); for (const n of nodeOwnEnds.keys()) if (nodeIsGround(n)) nodeY.set(n, 0);
    for (const c of ordered) solveChain(c, pass);
    yield;
  }
  function solveChain(c, pass) {
    const n = c.n;
    // --- banking
    const bt = new Float64Array(n), bw = new Float64Array(n).fill(1), beq = new Float64Array(n).fill(NaN), blo = new Float64Array(n).fill(-Infinity), bhi = new Float64Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) bt[i] = c.yT[i] < 0.4 ? 0 : -Math.max(-P.BANK_MAX, Math.min(P.BANK_MAX, P.BANK_K * c.kap[i]));
    // --- profile constraints
    const cons = c.cons = new Uint8Array(n); // diagnostics: 1 end-ground, 2 eq-ground road, 3 eq-deck, 4 lo, 5 hi, 6 node, 7 gap fill
    const loSrc = new Array(n).fill(null), loNeed = new Float64Array(n), gapC = [];
    const yt = Float64Array.from(c.yT), w = new Float64Array(n).fill(1), eq = new Float64Array(n).fill(NaN), lo = new Float64Array(n).fill(0), hi = new Float64Array(n).fill(Infinity);
    for (const [end, node, kind, tr] of [[0, c.nodeA, c.endA, c.trimA], [1, c.nodeB, c.endB, c.trimB]]) {
      const zone = kind === 'junction' ? tr + 3.0 + 6 : kind === 'street' ? 6 : 0;
      for (let q = 0; q < n; q++) { const i = end === 0 ? q : n - 1 - q, s = end === 0 ? c.s[i] : c.length - c.s[i]; if (s > zone && q > 0) break;
        if (kind === 'junction' || kind === 'street') { eq[i] = 0; beq[i] = 0; cons[i] = 1; } }
      if (kind === 'deck' && nodeY.has(node)) { eq[end === 0 ? 0 : n - 1] = nodeY.get(node); cons[end === 0 ? 0 : n - 1] = 6; }
    }
    for (let i = 0; i < n; i++) for (const r of c.rel[i]) {
      const higher = r.prio > c.prio;
      // overlapping parallel deck / street at the same level: one slab -> coplanar (gores, merges, duplicated OSM ways)
      if (higher && r.near && r.ovl && (r.fj || Math.abs(r.dyT) < P.JOIN_DY) && (r.k < 0 || solved[r.k])) {
        if (r.k < 0) { eq[i] = 0; beq[i] = 0; cons[i] = 2; continue; }
        const ck = chains[r.k], bk = atSample(ck.bank, r.j, r.u), yk = atSample(ck.y, r.j, r.u) + bk * r.a;
        // only follow a neighbour that is actually at (about) the level the data puts this deck: a lifted / lowered neighbour is not our slab
        if (!r.fj && Math.abs(yk - c.yT[i]) > 2.0 && Math.abs(yk - atSample(ck.yT, r.j, r.u)) > 1.0) { /* fall through to clearance logic */ }
        else { beq[i] = bk * (r.b >= 0 ? 1 : -1); eq[i] = yk; cons[i] = 3; continue; }
      }
      // narrow gap to a level neighbour: fill it (one wider slab) when the independent solutions already agree
      if (pass >= 1 && higher && r.near && !r.ovl && (r.k < 0 || solved[r.k])) {
        const yk = r.k < 0 ? 0 : atSample(chains[r.k].y, r.j, r.u) + atSample(chains[r.k].bank, r.j, r.u) * r.a;
        gapC.push([i, yk, r.k < 0 ? 0 : atSample(chains[r.k].bank, r.j, r.u) * (r.b >= 0 ? 1 : -1)]); continue;
      }
      if (!r.ovl) continue;
      if (r.k < 0) {
        if (c.yT[i] > 3.5) { lo[i] = Math.max(lo[i], P.CLEAR + P.DECK_D + 0.15 + Math.abs(bt[i]) * c.HR[i]); cons[i] = 4; }
        else if (r.d < E[r.e].width / 2 + 0.3) { eq[i] = 0; beq[i] = 0; r.xg = true; cons[i] = 2; } // low deck over a street: cross it at grade (the street surface wins)
        continue;
      }
      if (!solved[r.k]) continue;
      const ck = chains[r.k], yk = atSample(ck.y, r.j, r.u), ytk = atSample(ck.yT, r.j, r.u), need = P.CLEAR + P.DECK_D + 0.1 + 0.5 * (Math.abs(bt[i]) * c.HR[i] + Math.abs(atSample(ck.bank, r.j, r.u)) * ck.HR[r.j]);
      if (Math.abs(c.yT[i] - ytk) < 3.0) { // same level per the data: a junction area or a deck-level crossing -> coplanar there
        continue;
      }
      if (c.yT[i] >= ytk) { if (yk + need > lo[i]) { lo[i] = yk + need; loSrc[i] = r; loNeed[i] = need; } cons[i] = 4; } else { hi[i] = Math.min(hi[i], Math.max(0, yk - need)); cons[i] = 5; }
    }
    for (let i = 0; i < n; i++) hi[i] = Math.min(hi[i], c.extraHi[i]);
    // gross conflicts only: a merge pin that is > 1.5 m above what a 15 % ramp from the at-grade end can reach is a
    // drawing error (ramp foot drawn under another deck) - the at-grade end wins there
    { const cap = new Float64Array(n).fill(Infinity); let d = Infinity;
      for (let i = 0; i < n; i++) { if (i) d += c.s[i] - c.s[i - 1]; if (cons[i] === 1) d = 0; cap[i] = d; }
      d = Infinity; for (let i = n - 1; i >= 0; i--) { if (i < n - 1) d += c.s[i + 1] - c.s[i]; if (cons[i] === 1) d = 0; cap[i] = Math.min(cap[i], d); }
      for (let i = 0; i < n; i++) if (cons[i] === 3 && Math.abs(eq[i]) > 0.15 * cap[i] + 1.5) { eq[i] = NaN; beq[i] = NaN; cons[i] = 0; } }
    // isolated merge pins (1-2 samples) far from the deck's own level are OSM slivers, not slabs: they would make spikes
    for (let i = 0; i < n;) { if (cons[i] !== 3) { i++; continue; } let j = i; while (j < n && cons[j] === 3) j++;
      if (j - i <= 2) for (let k = i; k < j; k++) if (Math.abs(eq[k] - c.yT[k]) > 1.0) { eq[k] = NaN; beq[k] = NaN; cons[k] = 0; }
      i = j; }
    // three-level conflicts (a deck squeezed between a deck above and a deck below): ask the lower one to go down next pass
    for (let i = 0; i < n; i++) if (loSrc[i] && hi[i] < lo[i] - 0.05) { const r = loSrc[i], ck = chains[r.k], lim = Math.max(0, hi[i] - loNeed[i]);
      for (let q = Math.max(0, r.j - 1); q <= Math.min(ck.n - 1, r.j + 2); q++) ck.extraHi[q] = Math.min(ck.extraHi[q], lim); }
    const OA = c.ovs ? { yt, w, eq, lo, hi, cons, beq } : null; if (OA) applyProfile(c, OA, 1);
    // grade cones: every pin / bound propagates at <= ~7 % (low humps get lower instead of steeper; clearance lifts start early)
    { const G = 0.07, lo0 = Float64Array.from(lo), hi0 = Float64Array.from(hi);
      for (let i = 0; i < n; i++) if (!Number.isNaN(eq[i])) { lo[i] = Math.max(lo[i], eq[i]); hi[i] = Math.min(hi[i], eq[i]); }
      for (let i = 1; i < n; i++) { const ds = c.s[i] - c.s[i - 1]; lo[i] = Math.max(lo[i], lo[i - 1] - G * ds); hi[i] = Math.min(hi[i], hi[i - 1] + G * ds); }
      for (let i = n - 2; i >= 0; i--) { const ds = c.s[i + 1] - c.s[i]; lo[i] = Math.max(lo[i], lo[i + 1] - G * ds); hi[i] = Math.min(hi[i], hi[i + 1] + G * ds); }
      // where the cones contradict each other the grade limit cannot hold: fall back to the raw bounds (smooth but steeper)
      // hard limits from equality pins at 15 % (steepest ramp we ever build)
      const eqCapHi = new Float64Array(n).fill(Infinity), eqCapLo = new Float64Array(n).fill(-Infinity);
      for (let i = 0; i < n; i++) if (!Number.isNaN(eq[i])) { eqCapHi[i] = eq[i]; eqCapLo[i] = eq[i]; }
      for (let i = 1; i < n; i++) { const ds = c.s[i] - c.s[i - 1]; eqCapHi[i] = Math.min(eqCapHi[i], eqCapHi[i - 1] + 0.15 * ds); eqCapLo[i] = Math.max(eqCapLo[i], eqCapLo[i - 1] - 0.15 * ds); }
      for (let i = n - 2; i >= 0; i--) { const ds = c.s[i + 1] - c.s[i]; eqCapHi[i] = Math.min(eqCapHi[i], eqCapHi[i + 1] + 0.15 * ds); eqCapLo[i] = Math.max(eqCapLo[i], eqCapLo[i + 1] - 0.15 * ds); }
      const bad = new Uint8Array(n); for (let i = 0; i < n; i++) if (hi[i] < lo[i] - 1e-6 && !(hi0[i] < lo0[i])) bad[i] = 1;
      for (let i = 0; i < n; i++) if (bad[i]) for (let q = Math.max(0, i - 6); q <= Math.min(n - 1, i + 6); q++) if (Number.isNaN(eq[q])) { lo[q] = Math.min(lo0[q], eqCapHi[q]); hi[q] = Math.max(hi0[q], eqCapLo[q]); } }
    // banking: smooth transitions, pinned where joined / at grade
    c.bank = smoothConstrained(bt, bw, beq, blo, bhi, 2000);
    if (pass === 3) for (let i = 0; i < n; i++) if (hi[i] < lo[i]) stats.infeasible++;
    // infeasible: a deck above wins over a deck below (never push a deck up into the one above it)
    const nearHiDeck = new Uint8Array(n); for (let i = 0; i < n; i++) if (cons[i] === 5) for (let q = Math.max(0, i - 12); q <= Math.min(n - 1, i + 12); q++) nearHiDeck[q] = 1;
    for (let i = 0; i < n; i++) { if (hi[i] < lo[i]) { if (nearHiDeck[i]) lo[i] = hi[i]; else hi[i] = lo[i]; } if (!Number.isNaN(eq[i])) { lo[i] = -Infinity; hi[i] = Infinity; } }
    if (OA) applyProfile(c, OA, 2);
    c.y = smoothConstrained(yt, w, eq, lo, hi, P.SMOOTH_LAMBDA, 24, P.TENSION);
    if (gapC.length) { // gap fills only where this deck already sits level with its neighbour (soft, so the edges blend)
      let any = false; const tg = new Float64Array(n).fill(NaN);
      for (const [i, yk] of gapC) if (Number.isNaN(eq[i]) && Math.abs(c.y[i] - yk) < 0.3 && !(OA && OA.ovr && OA.ovr[i] === 2)) tg[i] = yk;
      // weights taper in over 16 samples from every run boundary: the slab edges blend, never step
      const dist = new Float64Array(n).fill(0); let d = 0; for (let i = 0; i < n; i++) { d = Number.isNaN(tg[i]) ? 0 : d + 1; dist[i] = d; } d = 0; for (let i = n - 1; i >= 0; i--) { d = Number.isNaN(tg[i]) ? 0 : d + 1; dist[i] = Math.min(dist[i], d); }
      for (let i = 0; i < n; i++) if (!Number.isNaN(tg[i])) { const f = Math.min(1, dist[i] / 16); yt[i] = tg[i]; w[i] = 1 + 400 * f * f; cons[i] = 7; any = true; }
      if (any) c.y = smoothConstrained(yt, w, eq, lo, hi, P.SMOOTH_LAMBDA, 24, P.TENSION);
    }
    for (let i = 0; i < n; i++) if (c.y[i] < 0 && Number.isNaN(eq[i])) c.y[i] = 0;
    // clipping sweep: on hills (fictional land) a deck is never buried in the terrain: where the data profile dips under the
    // ground the deck rides on the ground instead (the terrain collider used to sit on top of the buried deck: flat stretches,
    // then a 1-2 m step where the deck came out again). Water samples keep their profile.
    if (!CLIP_OFF && data.hasRelief) for (let i = 0; i < n; i++) { if (isWater(c.x[i], c.z[i])) continue; const g = terrainY(c.x[i], c.z[i]); if (g > 0.05 && c.y[i] < g + 0.02) c.y[i] = g + 0.02; }
    if (pass === 0) c.yPrev = Float64Array.from(c.y);
    solved[c.id] = 1;
    for (const [end, node] of [[0, c.nodeA], [1, c.nodeB]]) if (!nodeY.has(node)) nodeY.set(node, c.y[end === 0 ? 0 : n - 1]);
  }

  mark('before 7. visible deck');
  yield;
  // ---------------------------------------------------------------- 7. visible deck interval + barrier sides
  // squeeze: opposing carriageways drawn too close in OSM share the space between their centre-lines (median at the
  // width-weighted midpoint); shoulders shrink first, then lanes (>= 3.1 m). Then the lateral intervals are recomputed.
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const n = c.n, want = new Float64Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) for (const r of c.rel[i]) {
      if (r.same || !r.near || Math.abs(r.dyT) >= P.JOIN_DY || Math.abs(r.b) < 0.5) continue;
      const tc = -r.a / r.b, D = Math.abs(tc), Hk = (r.t2 - r.t1) / 2, Hc = tc > 0 ? c.HR[i] : c.HL[i];
      if (Hc + Hk <= D) continue;
      want[i] = Math.min(want[i], D * Hc / (Hc + Hk));
    }
    // moving minimum (+-12 m) then a box blur: the deck narrows with a long taper, never a jog
    const mm = new Float64Array(n); for (let i = 0; i < n; i++) { let m = Infinity; for (let k = Math.max(0, i - 6); k <= Math.min(n - 1, i + 6); k++) m = Math.min(m, want[k]); mm[i] = m; }
    const capH = new Float64Array(n); for (let i = 0; i < n; i++) capH[i] = Math.min(c.HL[i], mm[i]);
    const sm = boxSmooth(capH, 6, 2);
    c.sh = new Float64Array(n).fill(P.SHOULDER);
    for (let i = 0; i < n; i++) {
      const H = Math.min(c.HL[i], sm[i], capH[i] + 0.5); if (H >= c.HL[i] - 1e-6) continue;
      const lanes = Math.max(1, c.lanesF[i] + c.lanesB[i]), minHW = lanes * 1.55;
      if (c.sw[i]) c.sw[i] = 0; // squeezed bridge: no room for a sidewalk here (shoulder + barrier instead)
      let sh = Math.max(0.25, H - P.BAR_BASE - c.hw[i]); sh = Math.min(sh, P.SHOULDER);
      const hw = Math.max(minHW, Math.min(c.hw[i], H - P.BAR_BASE - sh));
      c.hw[i] = hw; c.sh[i] = sh; c.HL[i] = c.HR[i] = hw + sh + P.BAR_BASE; stats.squeezed = (stats.squeezed || 0) + 1;
    }
  }
  // the deck width may change at most 1 : 25 along the chain (no jogs in the barrier line where a squeeze ends)
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const n = c.n, H = Float64Array.from(c.HL), T = 0.04;
    for (let i = 1; i < n; i++) H[i] = Math.min(H[i], H[i - 1] + T * (c.s[i] - c.s[i - 1]));
    for (let i = n - 2; i >= 0; i--) H[i] = Math.min(H[i], H[i + 1] + T * (c.s[i + 1] - c.s[i]));
    for (let i = 0; i < n; i++) if (H[i] < c.HL[i] - 1e-6) { const d = c.HL[i] - H[i], sh = c.sh ? c.sh[i] : P.SHOULDER, cut = Math.min(d, Math.max(0, sh - 0.25)); if (c.sh) c.sh[i] = sh - cut; c.hw[i] = Math.max(0.8, c.hw[i] - (d - cut)); c.HL[i] = c.HR[i] = H[i]; }
  }
  for (const c of chains) for (let i = 0; i < c.n; i++) for (const r of c.rel[i]) {
    if (r.k < 0 || Math.abs(r.b) <= 0.5 || !(r.t1 || r.t2)) continue;
    const ck = chains[r.k], HkL = atSample(ck.HL, r.j, r.u), HkR = atSample(ck.HR, r.j, r.u), ta = (-HkL - r.a) / r.b, tb = (HkR - r.a) / r.b;
    r.t1 = Math.min(ta, tb); r.t2 = Math.max(ta, tb);
    r.near = r.t2 > -c.HL[i] - P.GAP_JOIN && r.t1 < c.HR[i] + P.GAP_JOIN; r.ovl = r.t2 > -c.HL[i] && r.t1 < c.HR[i];
  }
  // final relation classes from the solved surfaces: joined (coplanar, merged into one slab) or clip (overlap at another level)
  stats.conflicts = 0;
  for (const c of chains) for (let i = 0; i < c.n; i++) for (const r of c.rel[i]) {
    let yk = 0; if (r.k >= 0) { const ck = chains[r.k]; yk = atSample(ck.y, r.j, r.u) + atSample(ck.bank, r.j, r.u) * r.a; }
    const dy = c.y[i] - yk; r.dy = dy;
    r.joined = r.near && Math.abs(dy) < (r.ovl ? (r.prio > c.prio ? 0.25 : 0.6) : 0.04);
    r.clip = !r.joined && r.near && r.t2 > -c.HL[i] && r.t1 < c.HR[i] && Math.abs(dy) < P.DECK_D + P.BAR_H + 0.3; // only decks that would physically intersect are clipped (stacked ones are not)
    if (r.clip && r.prio > c.prio) stats.conflicts++;
  }
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const n = c.n; c.vL = new Float64Array(n); c.vR = new Float64Array(n); c.vis = new Uint8Array(n);
    c.barL = new Uint8Array(n); c.barR = new Uint8Array(n); c.joinL = new Uint8Array(n); c.joinR = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let vL = -c.HL[i], vR = c.HR[i], hidden = false, jL = 0, jR = 0, keepL = 0, keepR = 0, limR = Infinity, limL = -Infinity, coverL = null, coverR = null;
      for (const r of c.rel[i]) {
        if (r.clip && r.prio > c.prio) { // overlap with a deck at another level: give way, keep both barriers
          if (r.t1 >= 0) limR = Math.min(limR, r.t1); else if (r.t2 <= 0) limL = Math.max(limL, r.t2);
          else { const wl = r.t1 + c.HL[i], wr = c.HR[i] - r.t2; if (Math.max(wl, wr) < 0.3) hidden = true; else if (wl >= wr) limR = Math.min(limR, r.t1); else limL = Math.max(limL, r.t2); }
          continue;
        }
        if (!r.joined) continue;
        const onR = r.t2 > c.HR[i] - 0.1 && r.t1 < c.HR[i] + P.GAP_JOIN, onL = r.t1 < -c.HL[i] + 0.1 && r.t2 > -c.HL[i] - P.GAP_JOIN;
        const higher = r.prio > c.prio;
        if (higher) {
          if (r.t1 >= 0) { limR = Math.min(limR, r.t1); jR = 1; }
          else if (r.t2 <= 0) { limL = Math.max(limL, r.t2); jL = 1; }
          else { const wl = r.t1 + c.HL[i], wr = c.HR[i] - r.t2; if (Math.max(wl, wr) < 0.3) hidden = true; else if (wl >= wr) { limR = Math.min(limR, r.t1); jR = 1; } else { limL = Math.max(limL, r.t2); jL = 1; } }
        } else {
          // a lower-priority deck attaches here: drop our barrier on that side unless it is an opposing carriageway (median barrier stays)
          if (onR) { if (r.same) jR = 1; else keepR = 1; }
          if (onL) { if (r.same) jL = 1; else keepL = 1; }
        }
      }
      if (limR < Infinity) vR = limR; if (limL > -Infinity) vL = limL;
      if (vR - vL < 0.3) hidden = true;
      c.vL[i] = vL; c.vR[i] = vR; c.vis[i] = hidden ? 0 : 1; c.joinL[i] = jL; c.joinR[i] = jR;
    }
  }
  // structure type per sample: 0 at grade, 1 embankment (retaining walls), 2 open viaduct (fascia, soffit, piers)
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const n = c.n; c.type = new Uint8Array(n); c.gY = new Float64Array(n); c.water = new Uint8Array(n);
    for (let i = 0; i < n; i++) { c.water[i] = isWater(c.x[i], c.z[i]) ? 1 : 0; c.gY[i] = c.water[i] ? seabed(c.x[i], c.z[i]) : terrainY(c.x[i], c.z[i]); }
    const wNear = new Uint8Array(n); for (let i = 0; i < n; i++) if (c.water[i]) for (let k = Math.max(0, i - 4); k <= Math.min(n - 1, i + 4); k++) wNear[k] = 1;
    for (let i = 0; i < n; i++) { const y = c.y[i]; c.type[i] = wNear[i] && y > 0.6 ? 2 : y < P.GRADE_Y ? 0 : y < P.OPEN_MIN ? 1 : 2; }
    // something passes underneath (a street or a lower deck): never a solid embankment there, open span instead
    for (let i = 0; i < n; i++) { if (c.type[i] !== 1) continue;
      for (const r of c.rel[i]) { if (!r.ovl || r.near) continue; const yk = r.k < 0 ? 0 : atSample(chains[r.k].y, r.j, r.u); if (c.y[i] - yk > 1.2) { for (let q = Math.max(0, i - 4); q <= Math.min(n - 1, i + 4); q++) if (c.type[q] === 1) c.type[q] = 2; break; } } }
    // no embankment islands shorter than 12 m between open spans
    for (let i = 0; i < n;) { if (c.type[i] !== 1) { i++; continue; } let j = i; while (j < n && c.type[j] === 1) j++; if (i > 0 && j < n && c.type[i - 1] === 2 && c.type[j] === 2 && c.s[j - 1] - c.s[i] < 12) for (let k = i; k < j; k++) c.type[k] = 2; i = j; }
    for (let i = 0; i < n; i++) {
      // clipping sweep: a jersey barrier only where the deck stands clear of the ground beside it (> 0.6 m drop); the low
      // feet of ramps over a street at grade got barrier lumps standing on the ground road
      const elevated = c.type[i] > 0 && c.vis[i] && (CLIP_OFF || c.water[i] || c.y[i] - c.gY[i] > 0.6);
      c.barL[i] = elevated && !c.joinL[i] ? 1 : 0; c.barR[i] = elevated && !c.joinR[i] ? 1 : 0;
    }
    // a barrier must never stand on another deck's carriageway at about its level (gores, merges, crossings, OSM overlaps)
    for (let i = 0; i < n; i++) for (const r of c.rel[i]) {
      if (r.k < 0 || !(c.barL[i] || c.barR[i])) continue;
      const ck = chains[r.k], hwk = atSample(ck.hw, r.j, r.u) + P.SHOULDER;
      for (const side of [-1, 1]) {
        if (!(side < 0 ? c.barL[i] : c.barR[i])) continue;
        const oE = side < 0 ? c.vL[i] : c.vR[i];
        let hit = false;
        for (const o of [oE, oE - side * P.BAR_BASE]) { const lk = r.a + o * r.b; if (Math.abs(lk) > hwk) continue;
          const yo = c.y[i] + c.bank[i] * o, ykk = atSample(ck.y, r.j, r.u) + atSample(ck.bank, r.j, r.u) * lk; if (Math.abs(yo - ykk) < 2.2) hit = true; }
        if (hit) { if (side < 0) c.barL[i] = 0; else c.barR[i] = 0; stats.barLaneDrop = (stats.barLaneDrop || 0) + 1; }
      }
    }
    // barrier slivers (< 8 m) between merged stretches are flicker at a seam, not a real edge: drop them
    for (const side of [-1, 1]) { const bar = side < 0 ? c.barL : c.barR, jn = side < 0 ? c.joinL : c.joinR;
      for (let i = 0; i < n;) { if (!bar[i]) { i++; continue; } let j = i; while (j < n && bar[j]) j++;
        const len = c.s[Math.min(n - 1, j)] - c.s[i], before = i > 0 && jn[i - 1], after = j < n && jn[j];
        if (len < 8 && (before || after || !CLIP_OFF)) for (let k = i; k < j; k++) bar[k] = 0; // clipping sweep: no orphan barrier stubs
        i = j; } }
    // trimmed ends (ground junctions) are never elevated; no barrier inside the trim
    for (let i = 0; i < n; i++) { if (c.s[i] < c.trimA + 0.01 || c.length - c.s[i] < c.trimB + 0.01) { c.barL[i] = c.barR[i] = 0; } }
  }

  mark('before 8. barrier runs');
  yield;
  // ---------------------------------------------------------------- 8. barrier runs, piers, lamps, joints
  const occGrid = new Grid(16); // things a pier must never stand in: ground road bands + every deck footprint
  for (let g = 0; g < gSegE.length; g++) { const e = E[gSegE[g]], k = gSegK[g], a = e.pts[k], b = e.pts[k + 1], pad = e.width / 2 + 2; occGrid.add(Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, nSeg + g); }
  for (let s = 0; s < nSeg; s++) { const c = chains[segC[s]], i = segI[s], pad = Math.max(c.HL[i], c.HR[i]) + 1; occGrid.add(Math.min(c.x[i], c.x[i + 1]) - pad, Math.min(c.z[i], c.z[i + 1]) - pad, Math.max(c.x[i], c.x[i + 1]) + pad, Math.max(c.z[i], c.z[i + 1]) + pad, s); }
  // true when (x,z) is inside a ground road (+pad) or under a deck lower than yMax
  const occupied = (x, z, pad, yMax, self) => {
    const cand = occGrid.at(x, z); if (!cand) return false;
    for (const s of cand) {
      let ax, az, bx, bz, h, yy = 0;
      if (s < nSeg) { const c = chains[segC[s]], i = segI[s]; if (c === self) continue; ax = c.x[i]; az = c.z[i]; bx = c.x[i + 1]; bz = c.z[i + 1]; h = Math.max(c.HL[i], c.HR[i]); }
      else { const g = s - nSeg, e = E[gSegE[g]], k = gSegK[g]; ax = e.pts[k][0]; az = e.pts[k][1]; bx = e.pts[k + 1][0]; bz = e.pts[k + 1][1]; h = e.width / 2; }
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = ax + dx * u - x, ez = az + dz * u - z; if (ex * ex + ez * ez > (h + pad) * (h + pad)) continue;
      if (s < nSeg) { const c = chains[segC[s]], i = segI[s]; yy = c.y[i] + (c.y[i + 1] - c.y[i]) * u; if (yy >= yMax) continue; }
      return true;
    }
    return false;
  };
  // true when another deck's surface at (x,z) lies between yLo and yHi (a pier cap / soffit would sit in its traffic)
  const deckBetween = (x, z, yLo, yHi, self) => {
    const cand = occGrid.at(x, z); if (!cand) return false;
    for (const s of cand) { if (s >= nSeg) continue; const c = chains[segC[s]], i = segI[s]; if (c === self) continue;
      const ax = c.x[i], az = c.z[i], dx = c.x[i + 1] - ax, dz = c.z[i + 1] - az, L2 = dx * dx + dz * dz || 1; let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = ax + dx * u - x, ez = az + dz * u - z, h = Math.max(c.HL[i], c.HR[i]) + 0.3; if (ex * ex + ez * ez > h * h) continue;
      const yy = c.y[i] + (c.y[i + 1] - c.y[i]) * u; if (yy > yLo && yy < yHi) return true; }
    return false;
  };
  const piers = [], lamps = [], joints = [];
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const n = c.n;
    // runs of viaduct
    let i = 0;
    while (i < n) {
      if (c.type[i] !== 2 || !c.vis[i]) { i++; continue; }
      let j = i; while (j < n && c.type[j] === 2 && c.vis[j]) j++;
      const s0 = c.s[i], s1 = c.s[j - 1], len = s1 - s0;
      if (len > 6) {
        const nsp = Math.max(1, Math.round(len / P.SPAN)), sp = len / nsp;
        let pk = 0;
        for (let q = 0; q <= nsp; q++) {
          const sNom = s0 + q * sp; let placed = false;
          for (const ds of [0, 3, -3, 6, -6, 9, -9, 12, -12]) {
            const s = sNom + ds; if (s < s0 + 1 || s > s1 - 1) continue;
            const k = sampleIndex(c, s); const kk = Math.min(n - 1, Math.max(0, k)); if (c.type[kk] !== 2 || !c.vis[kk]) continue;
            const pp = framesAt(c, s); const W = pp.vR - pp.vL; if (W < 3) continue;
            const yTop = pp.y + P.ROAD_Y, soffit = yTop + pp.bank * ((pp.vL + pp.vR) / 2) - P.DECK_D;
            const nCol = W < 9.5 ? 1 : W < 17 ? 2 : 3, cols = [];
            for (let m = 0; m < nCol; m++) cols.push(pp.vL + W * (m + 0.5) / nCol);
            let ok = true; const colPts = [];
            for (const o of cols) { const cx = pp.x - pp.tz * o, cz = pp.z + pp.tx * o, g = groundY(cx, cz); if (soffit - 1.2 - g < 1.5 || occupied(cx, cz, 1.2, soffit - 0.5, c)) { ok = false; break; } colPts.push([cx, cz, g]); }
            if (ok) { const capBot = soffit - 1.15; for (let o = pp.vL + 0.5; o <= pp.vR - 0.5 && ok; o += 1.5) for (const dl of [-0.85, 0.85]) { const qx = pp.x - pp.tz * o + pp.tx * dl, qz = pp.z + pp.tx * o + pp.tz * dl; if (deckBetween(qx, qz, capBot - P.CLEAR - 0.1, soffit + 0.5, c)) { ok = false; break; } } }
            if (!ok) continue;
            piers.push({ chain: c.id, s, x: pp.x, z: pp.z, tx: pp.tx, tz: pp.tz, vL: pp.vL, vR: pp.vR, soffit, bank: pp.bank, cols: colPts, r: soffit - colPts[0][2] > 14 ? 0.85 : 0.7 });
            if (pk++ % 2 === 1 && q > 0 && q < nsp) joints.push({ chain: c.id, s });
            placed = true; break;
          }
          if (!placed && q > 0 && q < nsp && pk % 2 === 1) joints.push({ chain: c.id, s: sNom });
        }
      }
      i = j;
    }
    // lamps on the barrier lines (staggered both sides)
    for (const side of [-1, 1]) {
      const bar = side < 0 ? c.barL : c.barR;
      for (let s = (side > 0 ? 14 : 14 + P.LAMP_SP / 2); s < c.length - 8; s += P.LAMP_SP) {
        const k = Math.min(n - 1, Math.round(sampleIndexF(c, s)));
        if (!bar[Math.max(0, k - 2)] || !bar[k] || !bar[Math.min(n - 1, k + 2)] || c.y[k] < 1.5) continue;
        const pp = framesAt(c, s), o = side < 0 ? pp.vL + P.BAR_TOP / 2 : pp.vR - P.BAR_TOP / 2;
        const lx = pp.x - pp.tz * o, lz = pp.z + pp.tx * o;
        const yb = pp.y + P.ROAD_Y + pp.bank * (side < 0 ? pp.vL + P.BAR_BASE : pp.vR - P.BAR_BASE) + P.BAR_H;
        // arm reaches over the road: direction -side * right normal
        const ax = -side * -pp.tz, az = -side * pp.tx;
        let clear = true;
        for (let q = Math.max(0, k - 4); q <= Math.min(n - 1, k + 4) && clear; q++) { if (!bar[q]) { clear = false; break; } for (const r of c.rel[q]) { if (r.k < 0) continue; const ck = chains[r.k], lk = r.a + o * r.b; if (Math.abs(lk) < atSample(ck.hw, r.j, r.u) + 1.0 && Math.abs(r.dy ?? 0) < 3) { clear = false; break; } } }
        // the pole (and its arm, ~2 m over the deck) must not reach into a deck above (stacked interchanges: a lamp on the
        // lower deck's barrier used to stand through the upper deck's lanes)
        if (clear) for (const d of [0, 1.0, 2.0]) if (deckBetween(lx + ax * d, lz + az * d, yb - 0.5, yb + 9.0, c)) { clear = false; break; }
        if (clear) lamps.push({ chain: c.id, s, x: lx, y: yb, z: lz, ry: Math.atan2(ax, az) });
      }
    }
  }

  mark('before 9. height / footprint');
  yield;
  // ---------------------------------------------------------------- 9. height / footprint index over visible deck quads
  const QR = { y: 0, chain: -1, i: 0, type: 0 }, footRes = { y: 0, type: 0 };
  const hGrid = new Grid(8);
  for (const c of chains) {
    if ((++yieldN & 7) === 0) yield; // boot pacing
    const n = c.n;
    c.lx = new Float64Array(n); c.lz = new Float64Array(n); c.rx = new Float64Array(n); c.rz = new Float64Array(n); c.ly = new Float64Array(n); c.ry = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const nx = -c.tz[i], nz = c.tx[i], yC = c.y[i] + P.ROAD_Y;
      c.lx[i] = c.x[i] + nx * c.vL[i]; c.lz[i] = c.z[i] + nz * c.vL[i]; c.rx[i] = c.x[i] + nx * c.vR[i]; c.rz[i] = c.z[i] + nz * c.vR[i];
      c.ly[i] = yC + c.bank[i] * c.vL[i]; c.ry[i] = yC + c.bank[i] * c.vR[i];
    }
    c.s0 = c.trimA; c.s1 = c.length - c.trimB; // drawn arc-length range
    for (let i = 0; i < n - 1; i++) {
      if (!c.vis[i] || !c.vis[i + 1] || c.s[i + 1] <= c.s0 || c.s[i] >= c.s1) continue;
      const x0 = Math.min(c.lx[i], c.rx[i], c.lx[i + 1], c.rx[i + 1]), x1 = Math.max(c.lx[i], c.rx[i], c.lx[i + 1], c.rx[i + 1]);
      const z0 = Math.min(c.lz[i], c.rz[i], c.lz[i + 1], c.rz[i + 1]), z1 = Math.max(c.lz[i], c.rz[i], c.lz[i + 1], c.rz[i + 1]);
      hGrid.add(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, c.segBase + i);
    }
  }
  // ground junctions sitting under a low deck / embankment
  const blockedNodes = new Set();
  for (const [nid, ends] of nodeOwnEnds) if (!nodeIsGround(nid)) blockedNodes.add(nid);
  for (const nd of N) {
    if (blockedNodes.has(nd.id) || nd.edges.length < 3) continue;
    const R = nodeWidth(nd.id) / 2 + 3;
    for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) { const h = deckQuery(nd.x + dx, nd.z + dz, null, 0); if (h !== null && h < 5.5 && h > 0.35) { blockedNodes.add(nd.id); break; } }
  }

  // ---------------------------------------------------------------- helpers
  function sampleIndexF(c, s) { // fractional sample index for arc length s (binary search)
    const S = c.s; if (s <= 0) return 0; if (s >= c.length) return c.n - 1;
    let lo = 0, hi = c.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    return lo + (s - S[lo]) / (S[hi] - S[lo] || 1);
  }
  function sampleIndex(c, s) { return Math.round(sampleIndexF(c, s)); }
  function framesAt(c, s, out = {}) {
    const f = sampleIndexF(c, s), i = Math.min(c.n - 2, Math.floor(f)), u = f - i, L = (a) => a[i] + (a[i + 1] - a[i]) * u;
    out.i = i; out.u = u; out.x = L(c.x); out.z = L(c.z); let tx = L(c.tx), tz = L(c.tz); const l = Math.hypot(tx, tz) || 1; out.tx = tx / l; out.tz = tz / l;
    out.y = c.y ? L(c.y) : L(c.yT); out.bank = c.bank ? L(c.bank) : 0; out.vL = c.vL ? L(c.vL) : -L(c.HL); out.vR = c.vR ? L(c.vR) : L(c.HR); out.hw = L(c.hw);
    return out;
  }
  // deck top height at (x,z): exact triangle interpolation of the rendered / collider quads. mode: null = highest, y given = nearest at/below y+0.5
  function deckQuery(x, z, yRef, pad = 0) {
    const cand = hGrid.at(x, z); if (!cand) return null;
    let best = null;
    for (const sg of cand) {
      const c = chains[segC[sg]], i = segI[sg];
      const h = quadHeight(c, i, x, z, pad); if (h === null) continue;
      if (yRef === null || yRef === undefined) { if (best === null || h > best) { best = h; QR.chain = c.id; QR.i = i; } }
      else { const lim = yRef + 0.5; if (h <= lim && (best === null || h > best)) { best = h; QR.chain = c.id; QR.i = i; } }
    }
    if (best !== null) { QR.y = best; QR.type = chains[QR.chain].type[QR.i]; }
    return best;
  }
  // triangles (L_i, R_i, R_i1) and (L_i, R_i1, L_i1); same split as the meshes
  // sidewalk strips (|o| beyond the carriageway on sidewalk bridges) stand CURB_H higher than the road plane
  function curbAdd(c, i, x, z) {
    if (!c.sw[i] && !c.sw[i + 1]) return 0;
    const o = (x - c.x[i]) * -c.tz[i] + (z - c.z[i]) * c.tx[i], hw = c.hw[i], sw = Math.max(c.sw[i], c.sw[i + 1]);
    return sw && Math.abs(o) > hw + 1e-3 && (o < 0 ? c.vL[i] < -hw - 0.2 : c.vR[i] > hw + 0.2) && !(o < 0 ? c.joinL[i] : c.joinR[i]) ? P.CURB_H : 0;
  }
  function quadHeight(c, i, x, z, pad) {
    if (c.s[i] < c.s0 || c.s[i + 1] > c.s1) { // segment cut by a junction trim: nothing exists past the trimmed end
      const sp = c.s[i] + (x - c.x[i]) * c.tx[i] + (z - c.z[i]) * c.tz[i]; if (sp < c.s0 || sp > c.s1) return null; }
    const h = quadHeight0(c, i, x, z, pad); return h === null ? null : h + curbAdd(c, i, x, z);
  }
  function quadHeight0(c, i, x, z, pad) {
    const ax = c.lx[i], az = c.lz[i], ay = c.ly[i], bx = c.rx[i], bz = c.rz[i], by = c.ry[i];
    const cx = c.rx[i + 1], cz = c.rz[i + 1], cy = c.ry[i + 1], dx = c.lx[i + 1], dz = c.lz[i + 1], dy = c.ly[i + 1];
    let h = triH(x, z, ax, az, ay, bx, bz, by, cx, cz, cy, pad); if (h !== null) return h;
    h = triH(x, z, ax, az, ay, cx, cz, cy, dx, dz, dy, pad); return h;
  }
  function triH(x, z, ax, az, ay, bx, bz, by, cx, cz, cy, pad) {
    const v0x = bx - ax, v0z = bz - az, v1x = cx - ax, v1z = cz - az, v2x = x - ax, v2z = z - az;
    const den = v0x * v1z - v1x * v0z; if (Math.abs(den) < 1e-9) return null;
    const u = (v2x * v1z - v1x * v2z) / den, v = (v0x * v2z - v2x * v0z) / den;
    const e = pad > 0 ? pad / Math.sqrt(Math.abs(den)) : 1e-7;
    if (u < -e || v < -e || u + v > 1 + e) return null;
    return ay + (by - ay) * u + (cy - ay) * v;
  }
  function footprintAt(x, z) { // lowest deck over (x,z) (barriers included: quads span the whole deck)
    const cand = hGrid.at(x, z); if (!cand) return false;
    let best = null, bt = 0;
    for (const sg of cand) { const c = chains[segC[sg]], i = segI[sg], h = quadHeight(c, i, x, z, 0.3); if (h !== null && (best === null || h < best)) { best = h; bt = c.type[i]; } }
    if (best === null) return false;
    footRes.y = best; footRes.type = bt; return footRes;
  }

  // lane centre-lines for drivers / audits: offsets from the chain centre (+ = right of travel)
  function laneOffsets(c, i) {
    const hw = c.hw[i], lf = Math.max(0, c.lanesF[i]), lb = Math.max(0, c.lanesB[i]), tot = Math.max(1, lf + lb), lw = (2 * hw) / tot, out = [];
    for (let k = 0; k < tot; k++) out.push({ o: -hw + lw * (k + 0.5), fwd: k >= lb });
    return out;
  }

  mark('end'); const ms = now() - T0;
  return {
    chains, piers, lamps, joints, own, stats, ms, overrides: ovApplied, phase, nodeY, blockedNodes, segC, segI, nSeg,
    ownsEdge: (id) => !!own[id], chainOfEdge,
    heightAt: deckQuery, lastQuery: QR, curbAdd, footprintAt, framesAt, sampleIndexF, laneOffsets, groundY, occupied,
  };
}
