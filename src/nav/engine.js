// PORT SOLANA V2 navigation: the route search (pure, runs on the main thread, in the nav Web Worker and in Node).
//
//  - route():      time-optimal A* on the turn-aware arc graph, guided by ALT landmark lower bounds (falls back to
//                  straight-line time when landmarks are not ready yet).
//  - tree():       one reverse Dijkstra from the destination over every arc. After that, a re-route from ANY position is a
//                  table walk (fromTree), which is what makes "you missed the turn" recalculation instant.
//  - isochrone():  everything reachable within a time budget (police search area, "how far could he have gone").
//
// Costs are seconds. Traffic only ever multiplies free-flow time by >= 1, so the landmark bounds stay valid with live traffic.

import { TG, TC, T_ENTER_MINOR, T_RAMP, T_ACROSS, KINDS, K, AF, snap, edgePointAt } from './graph.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------------------------------------------ profiles
const BASE_TURN = {
  straight: 0, slightRight: 0.6, right: 2.5, sharpRight: 4.5, slightLeft: 1.2, left: 5.5, sharpLeft: 8, uturn: 24, deadEnd: 11,
  stop: [5.5, 4.5, 8], // extra at a stop / yield: [straight, right, left]
  allway: 3.5,
  signal: [10, 7, 17, 22], // expected wait at a light: [straight, right (right on red), left, U-turn]
  enterMinor: 9, // entering a service road / alley / private road from a real street (keeps routes out of parking lots)
  ramp: 1.5, across: 4.5,
};
export const PROFILES = {
  // the player's GPS and normal drivers
  car: { metric: 'time', speed: 1, kind: {}, turn: {}, uTurnStart: 20 },
  // careful driver: slower, dislikes freeways and left turns across traffic
  careful: { metric: 'time', speed: 0.92, kind: { motorway: 1.12, motorway_link: 1.1 }, turn: { left: 8, sharpLeft: 11, across: 8, uturn: 40 }, uTurnStart: 35 },
  // aggressive / in a hurry: faster, cuts through small streets, cheap U-turns
  aggressive: { metric: 'time', speed: 1.18, kind: { residential: 0.9, service: 0.85, alley: 0.8 }, turn: { uturn: 12, enterMinor: 3, left: 4, stop: [3, 2.5, 5], signal: [8, 5, 13, 16] }, uTurnStart: 9 },
  // police / ambulance / fire with lights on: runs signals, fast, U-turns anywhere legal
  emergency: { metric: 'time', speed: 1.4, kind: {}, turn: { uturn: 7, deadEnd: 7, enterMinor: 1, left: 3, sharpLeft: 4.5, right: 2, stop: [1.5, 1.2, 2], allway: 1, signal: [2.5, 2, 3.5, 6], across: 1 }, uTurnStart: 6, trafficWeight: 0.45 },
  // trucks and buses: slow, stay on big roads, never U-turn
  truck: { metric: 'time', speed: 0.85, kind: { residential: 1.6, living_street: 3, service: 1.5, alley: 6, tertiary: 1.1 }, turn: { right: 5, sharpRight: 12, left: 8, sharpLeft: 14, uturn: 240, enterMinor: 25 }, uTurnStart: 120 },
  bus: { metric: 'time', speed: 0.8, kind: { residential: 1.4, living_street: 3, service: 1.6, alley: 8 }, turn: { right: 5, sharpRight: 12, left: 8, sharpLeft: 14, uturn: 240 }, uTurnStart: 120 },
  taxi: { metric: 'time', speed: 1.04, kind: {}, turn: { uturn: 16 }, uTurnStart: 14 },
  // no freeways ("avoid highways" option)
  streets: { metric: 'time', speed: 1, kind: { motorway: Infinity, motorway_link: Infinity }, turn: {}, uTurnStart: 20 },
  // shortest distance, turn costs ignored, legal moves only (used for comparisons)
  shortest: { metric: 'distance', speed: 1, kind: {}, turn: {}, uTurnStart: 30 },
};

const compiled = new Map();
export function compileProfile(p) {
  if (typeof p === 'string' || !p) { const name = p || 'car'; let c = compiled.get(name); if (c) return c; c = compileProfile({ ...(PROFILES[name] || PROFILES.car), name }); compiled.set(name, c); return c; }
  if (p._compiled) return p;
  const base = PROFILES[p.base] || {};
  const T = { ...BASE_TURN, ...(base.turn || {}), ...(p.turn || {}) };
  const metric = p.metric || base.metric || 'time', speed = p.speed ?? base.speed ?? 1;
  const kindMul = new Float32Array(KINDS.length).fill(1 / speed);
  const km = { ...(base.kind || {}), ...(p.kind || {}) };
  for (const k in km) if (K[k] !== undefined) kindMul[K[k]] = km[k] / speed;
  let lb = Infinity; for (const v of kindMul) if (v < lb) lb = v;
  const turnCost = new Float32Array(256);
  const geomCost = [T.straight, T.slightRight, T.right, T.sharpRight, T.slightLeft, T.left, T.sharpLeft, T.uturn];
  const side = [0, 1, 1, 1, 2, 2, 2, 2]; // 0 straight, 1 right, 2 left (index into stop / signal tables)
  for (let t = 0; t < 256; t++) {
    const g = t & 7, c = (t >> 3) & 3;
    let cost = geomCost[g];
    if (g === TG.UTURN && (t & T_RAMP)) cost = T.deadEnd;
    else {
      if (c === TC.STOP) cost += T.stop[side[g]];
      else if (c === TC.ALLWAY) cost += T.allway + (side[g] === 2 ? 1 : 0);
      else if (c === TC.SIGNAL) cost = g === TG.UTURN ? T.uturn + T.signal[3] * 0.5 : cost * 0.5 + T.signal[side[g]];
      if (t & T_ENTER_MINOR) cost += T.enterMinor;
      if ((t & T_RAMP) && g !== TG.UTURN) cost += T.ramp;
      if (t & T_ACROSS) cost += T.across;
    }
    turnCost[t] = metric === 'distance' ? (g === TG.UTURN ? 30 : 0) : cost;
  }
  return { name: p.name || 'custom', metric, speed, kindMul, turnCost, lb, uTurnStart: p.uTurnStart ?? base.uTurnStart ?? 20, trafficWeight: p.trafficWeight ?? base.trafficWeight ?? 1, _compiled: true };
}

// ------------------------------------------------------------------------------------------------ heap
class Heap {
  constructor(cap = 4096) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) { const k2 = new Float64Array(this.n * 2); k2.set(this.k); this.k = k2; const v2 = new Int32Array(this.n * 2); v2.set(this.v); this.v = v2; }
    const k = this.k, v = this.v; let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() { // returns the value; its key is in this.topKey
    const k = this.k, v = this.v, top = v[0]; this.topKey = k[0];
    const n = --this.n;
    if (n > 0) {
      const key = k[n], val = v[n]; let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= key) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = key; v[i] = val;
    }
    return top;
  }
}

// ------------------------------------------------------------------------------------------------ landmarks (ALT)
/** Node-level free-flow distance tables to and from `count` far-apart landmarks. Takes ~10-20 ms per landmark on a 100k node graph. */
export function computeLandmarks(G, count = 16) {
  const t0 = now();
  const { nN, nA, aFrom, aTo, aTime, nOutStart, nOut, nInStart, nIn, nMain, hub } = G;
  if (!nN || hub < 0) return null;
  const heap = new Heap(nN);
  const dijkstra = (src, fwd) => {
    const d = new Float32Array(nN).fill(Infinity);
    d[src] = 0; heap.clear(); heap.push(0, src);
    while (heap.n) {
      const u = heap.pop(), du = heap.topKey;
      if (du > d[u]) continue;
      if (fwd) for (let o = nOutStart[u]; o < nOutStart[u + 1]; o++) { const a = nOut[o], v = aTo[a], nd = du + aTime[a]; if (nd < d[v]) { d[v] = nd; heap.push(d[v], v); } }
      else for (let o = nInStart[u]; o < nInStart[u + 1]; o++) { const a = nIn[o], v = aFrom[a], nd = du + aTime[a]; if (nd < d[v]) { d[v] = nd; heap.push(d[v], v); } }
    }
    return d;
  };
  const from = [], to = [], ids = [];
  const minD = new Float32Array(nN).fill(Infinity);
  let seed = dijkstra(hub, true), cur = -1, best = -1;
  for (let i = 0; i < nN; i++) if (nMain[i] && seed[i] > best && seed[i] < Infinity) { best = seed[i]; cur = i; }
  for (let l = 0; l < count && cur >= 0; l++) {
    const df = dijkstra(cur, true), dt = dijkstra(cur, false);
    from.push(df); to.push(dt); ids.push(cur);
    let nb = -1, nd = -1;
    for (let i = 0; i < nN; i++) {
      if (!nMain[i]) continue;
      const m = Math.min(df[i], dt[i]); if (m < minD[i]) minD[i] = m;
      if (minD[i] > nd && minD[i] < Infinity) { nd = minD[i]; nb = i; }
    }
    cur = nb;
  }
  let vmax = 1; for (let a = 0; a < nA; a++) { const v = G.aLen[a] / G.aTime[a]; if (v > vmax) vmax = v; }
  return { count: ids.length, ids: Int32Array.from(ids), from, to, vmax, ms: Math.round((now() - t0) * 10) / 10 };
}

// ------------------------------------------------------------------------------------------------ router
export class Router {
  constructor(G) {
    this.G = G;
    const nA = G.nA;
    this.g = new Float64Array(nA); this.pred = new Int32Array(nA); this.mark = new Uint32Array(nA); this.done = new Uint32Array(nA);
    this.stamp = 0; this.heap = new Heap(8192);
    this.mult = null; this.block = null; this.trafficVersion = 0; this.costCache = new Map();
    this.lm = null;
    let vmax = 1; for (let a = 0; a < nA; a++) { const v = G.aLen[a] / G.aTime[a]; if (v > vmax) vmax = v; }
    this.vmax = vmax;
    this._sa = { edge: -1 }; this._sb = { edge: -1 }; this._pt = {};
  }
  /** mult: Float32Array(nA) of congestion factors >= 1 (or null), block: Uint8Array(nA) hard closures (or null) */
  setTraffic(mult, block = null, version = this.trafficVersion + 1) { this.mult = mult; this.block = block; this.trafficVersion = version; this.costCache.clear(); }
  setLandmarks(lm) { this.lm = lm; if (lm && lm.vmax) this.vmax = Math.max(this.vmax, lm.vmax); }
  graphChanged() { this.costCache.clear(); }

  costs(P) {
    let c = this.costCache.get(P.name);
    if (c && P.name !== 'custom') return c;
    const { nA, aTime, aLen, aKind } = this.G, mult = this.mult, block = this.block, km = P.kindMul, tw = P.trafficWeight;
    c = new Float32Array(nA);
    if (P.metric === 'distance') { for (let a = 0; a < nA; a++) c[a] = km[aKind[a]] === Infinity || (block && block[a]) ? Infinity : aLen[a]; }
    else if (mult) { for (let a = 0; a < nA; a++) c[a] = block && block[a] ? Infinity : aTime[a] * km[aKind[a]] * (1 + (mult[a] - 1) * tw); }
    else for (let a = 0; a < nA; a++) c[a] = aTime[a] * km[aKind[a]];
    this.costCache.set(P.name, c);
    return c;
  }

  // snap an endpoint: { x, z, y?, heading?, speed? } or { edge, s }
  _snap(p, need, out, avoidFreeway) {
    const G = this.G;
    if (p.edge !== undefined && p.s !== undefined) {
      const k = typeof p.edge === 'number' && G.idsAreIdx ? p.edge : G.eId.indexOf(p.edge);
      if (k < 0 || k >= G.nE) return null;
      edgePointAt(G, k, p.s, this._pt);
      out.edge = k; out.s = Math.min(G.eLen[k], Math.max(0, p.s)); out.x = this._pt.x; out.z = this._pt.z; out.dx = this._pt.dx; out.dz = this._pt.dz; out.dist = 0; out.y = this._pt.y;
      return out;
    }
    const o = { maxDist: p.maxDist ?? 600, y: p.y, need, avoidFreeway, heading: (p.speed ?? 0) > 2 ? p.heading : undefined };
    return snap(G, p.x, p.z, o, out) || snap(G, p.x, p.z, { maxDist: 4000, need }, out) || snap(G, p.x, p.z, { maxDist: 1e5, need: 0 }, out);
  }

  // start arcs of a snapped origin: [arc, fractionRemaining, penalty] x up to 2
  _starts(sn, p, P, out) {
    const G = this.G, k = sn.edge, L = G.eLen[k];
    out.length = 0;
    const hasH = p.heading !== undefined && p.heading !== null;
    const hx = hasH ? Math.sin(p.heading) : 0, hz = hasH ? Math.cos(p.heading) : 0;
    const al = hasH ? hx * sn.dx + hz * sn.dz : 0; // alignment with the a -> b direction
    const flip = P.uTurnStart * ((p.speed ?? 0) > 3 ? 1 : 0.45);
    const f = G.eArcF[k], b = G.eArcB[k];
    if (f >= 0) out.push(f, 1 - sn.s / L, hasH && b >= 0 && al < -0.35 ? flip : 0);
    if (b >= 0) out.push(b, sn.s / L, hasH && al > 0.35 ? flip : 0);
    return out;
  }

  /**
   * Fastest route. from / to: { x, z, y?, heading?, speed? } (or { edge, s }).
   * opts: profile (name or object), maxExpand, avoidArcs (Uint8Array, 1 = forbidden)
   * returns { arcs:Int32Array, startS, endS, cost, expanded, ms, snapFrom, snapTo } or null
   */
  route(from, to, opts = {}) {
    const t0 = now();
    const G = this.G, P = compileProfile(opts.profile);
    const sa = this._snap(from, 1, this._sa, false), sb = sa && this._snap(to, 2, this._sb, true);
    if (!sa || !sb) return null;
    const cost = this.costs(P), turnCost = P.turnCost;
    const { tStart, tTo, tType, aTo, aEdge, nx, nz, eArcF, eArcB, eLen, viaBans } = G;
    const avoid = opts.avoidArcs || null;
    const g = this.g, pred = this.pred, mark = this.mark, done = this.done, heap = this.heap;
    const stamp = ++this.stamp; if (stamp > 4e9) { mark.fill(0); done.fill(0); this.stamp = 1; }
    heap.clear();
    // goal arcs
    const gF = eArcF[sb.edge], gB = eArcB[sb.edge], Lb = eLen[sb.edge];
    const fracF = sb.s / Lb, fracB = 1 - sb.s / Lb;
    const partF = gF >= 0 ? cost[gF] * fracF : Infinity, partB = gB >= 0 ? cost[gB] * fracB : Infinity;
    const nF = gF >= 0 ? G.aFrom[gF] : -1, nB = gB >= 0 ? G.aFrom[gB] : -1;
    // heuristic
    const lm = P.metric === 'time' ? this.lm : null, lb = P.lb;
    const tx = sb.x, tz = sb.z, inv = P.metric === 'time' ? lb / this.vmax : 1;
    let act = null, nAct = 0;
    if (lm) { // pick the landmarks that bound best for this origin
      const s0 = G.aTo[eArcF[sa.edge] >= 0 ? eArcF[sa.edge] : eArcB[sa.edge]], tn = nF >= 0 ? nF : nB;
      const sc = [];
      for (let l = 0; l < lm.count; l++) {
        const a1 = lm.from[l][tn] - lm.from[l][s0], a2 = lm.to[l][s0] - lm.to[l][tn];
        sc.push([Math.max(a1 === a1 && a1 < Infinity ? a1 : 0, a2 === a2 && a2 < Infinity ? a2 : 0), l]);
      }
      sc.sort((p, q) => q[0] - p[0]);
      nAct = Math.min(opts.landmarks ?? 5, sc.length); act = [];
      for (let i = 0; i < nAct; i++) act.push(lm.from[sc[i][1]], lm.to[sc[i][1]]);
    }
    const h = (v) => {
      let e = Math.hypot(nx[v] - tx, nz[v] - tz) * inv;
      if (act) {
        let bF = 0, bB = 0;
        for (let i = 0; i < act.length; i += 2) {
          const df = act[i], dt = act[i + 1], fv = df[v], tv = dt[v];
          if (nF >= 0) { const a = df[nF] - fv, b = tv - dt[nF]; if (a > bF && a < Infinity) bF = a; if (b > bF && b < Infinity) bF = b; }
          if (nB >= 0) { const a = df[nB] - fv, b = tv - dt[nB]; if (a > bB && a < Infinity) bB = a; if (b > bB && b < Infinity) bB = b; }
        }
        const hF = nF >= 0 ? bF * lb + partF : Infinity, hB = nB >= 0 ? bB * lb + partB : Infinity;
        const m = hF < hB ? hF : hB;
        if (m > e && m < Infinity) e = m;
      }
      return e;
    };
    // seeds
    let best = Infinity, bestPred = -1, bestGoal = -1;
    const st = this._starts(sa, from, P, []);
    for (let i = 0; i < st.length; i += 3) {
      const a = st[i], frac = st[i + 1], pen = st[i + 2];
      if (cost[a] === Infinity || (avoid && avoid[a])) continue;
      // destination ahead on the same arc
      if (a === gF && sb.s >= sa.s - 0.01) { const c = pen + cost[a] * (sb.s - sa.s) / Lb; if (c < best) { best = c; bestPred = -1; bestGoal = a; } }
      if (a === gB && sb.s <= sa.s + 0.01) { const c = pen + cost[a] * (sa.s - sb.s) / Lb; if (c < best) { best = c; bestPred = -1; bestGoal = a; } }
      const ga = pen + cost[a] * frac;
      if (mark[a] !== stamp || ga < g[a]) { g[a] = ga; pred[a] = -1; mark[a] = stamp; heap.push(ga + h(aTo[a]), a); }
    }
    let expanded = 0;
    const maxExpand = opts.maxExpand ?? 4e6;
    while (heap.n) {
      const a = heap.pop();
      if (heap.topKey >= best) break;
      if (done[a] === stamp) continue;
      done[a] = stamp;
      if (++expanded > maxExpand) break;
      const ga = g[a];
      const bans = viaBans ? viaBans.get(a) : null, pa = pred[a];
      for (let t = tStart[a], te = tStart[a + 1]; t < te; t++) {
        const b = tTo[t], cb = cost[b];
        if (cb === Infinity || done[b] === stamp || (avoid && avoid[b])) continue;
        if (bans && pa >= 0 && viaBanned(bans, aEdge[pa], aEdge[b])) continue;
        const base = ga + turnCost[tType[t]];
        if (b === gF) { const c = base + partF; if (c < best) { best = c; bestPred = a; bestGoal = b; } }
        else if (b === gB) { const c = base + partB; if (c < best) { best = c; bestPred = a; bestGoal = b; } }
        const nb = base + cb;
        if (mark[b] !== stamp || nb < g[b]) { g[b] = nb; pred[b] = a; mark[b] = stamp; heap.push(nb + h(aTo[b]), b); }
      }
    }
    if (bestGoal < 0) return null;
    const rev = [bestGoal];
    for (let a = bestPred; a >= 0; a = pred[a]) rev.push(a);
    const arcs = Int32Array.from(rev.reverse());
    return { arcs, startS: sa.s, endS: sb.s, cost: best, expanded, ms: now() - t0, profile: P.name,
      snapFrom: { x: sa.x, z: sa.z, dist: sa.dist, edge: sa.edge }, snapTo: { x: sb.x, z: sb.z, dist: sb.dist, edge: sb.edge } };
  }

  /**
   * Reverse shortest-path tree to a destination: D[arc] = seconds from the START of that arc to the destination,
   * next[arc] = the arc to take after it (-2 on the destination arc, -1 unreachable).
   */
  tree(to, opts = {}) {
    const t0 = now();
    const G = this.G, P = compileProfile(opts.profile);
    const sb = this._snap(to, 2, this._sb, true);
    if (!sb) return null;
    const cost = this.costs(P), turnCost = P.turnCost;
    const { nA, rStart, rFrom, rT, tType, eArcF, eArcB, eLen } = G;
    const D = new Float32Array(nA).fill(Infinity), next = new Int32Array(nA).fill(-1);
    const heap = this.heap; heap.clear();
    const gF = eArcF[sb.edge], gB = eArcB[sb.edge], Lb = eLen[sb.edge];
    if (gF >= 0 && cost[gF] < Infinity) { D[gF] = cost[gF] * (sb.s / Lb); next[gF] = -2; heap.push(D[gF], gF); }
    if (gB >= 0 && cost[gB] < Infinity) { D[gB] = cost[gB] * (1 - sb.s / Lb); next[gB] = -2; heap.push(D[gB], gB); }
    let settled = 0;
    while (heap.n) {
      const b = heap.pop(), db = heap.topKey;
      if (db > D[b]) continue;
      settled++;
      for (let i = rStart[b], ie = rStart[b + 1]; i < ie; i++) {
        const a = rFrom[i], ca = cost[a];
        if (ca === Infinity) continue;
        const c = ca + turnCost[tType[rT[i]]] + db;
        if (c < D[a]) { D[a] = c; next[a] = b; heap.push(D[a], a); }
      }
    }
    return { D, next, goalF: gF, goalB: gB, goalEdge: sb.edge, goalS: sb.s, to: { x: sb.x, z: sb.z, dist: sb.dist }, profile: P.name,
      trafficVersion: this.trafficVersion, settled, ms: now() - t0 };
  }

  /** Route from any position by walking a tree() result. Sub-millisecond: this is the miss-a-turn re-route. */
  fromTree(tree, from, opts = {}) {
    const t0 = now();
    const G = this.G, P = compileProfile(opts.profile || tree.profile);
    const sa = this._snap(from, 1, this._sa, false);
    if (!sa) return null;
    const cost = this.costs(P), turnCost = P.turnCost, { D, next, goalF, goalB, goalEdge, goalS } = tree;
    const { tStart, tTo, tType, eLen } = G;
    const st = this._starts(sa, from, P, []);
    let best = Infinity, bestArc = -1, bestNext = -3;
    for (let i = 0; i < st.length; i += 3) {
      const a = st[i], frac = st[i + 1], pen = st[i + 2];
      if (cost[a] === Infinity) continue;
      if (sa.edge === goalEdge) {
        if (a === goalF && goalS >= sa.s - 0.01) { const c = pen + cost[a] * (goalS - sa.s) / eLen[goalEdge]; if (c < best) { best = c; bestArc = a; bestNext = -2; } }
        if (a === goalB && goalS <= sa.s + 0.01) { const c = pen + cost[a] * (sa.s - goalS) / eLen[goalEdge]; if (c < best) { best = c; bestArc = a; bestNext = -2; } }
      }
      const rem = pen + cost[a] * frac;
      for (let t = tStart[a]; t < tStart[a + 1]; t++) {
        const b = tTo[t]; if (D[b] === Infinity) continue;
        const c = rem + turnCost[tType[t]] + D[b];
        if (c < best) { best = c; bestArc = a; bestNext = b; }
      }
    }
    if (bestArc < 0) return null;
    const arcs = [bestArc];
    let guard = G.nA + 5;
    for (let b = bestNext; b >= 0 && guard-- > 0; b = next[b]) arcs.push(b);
    return { arcs: Int32Array.from(arcs), startS: sa.s, endS: goalS, cost: best, expanded: arcs.length, ms: now() - t0, profile: P.name, viaTree: true,
      snapFrom: { x: sa.x, z: sa.z, dist: sa.dist, edge: sa.edge }, snapTo: { x: tree.to.x, z: tree.to.z, dist: tree.to.dist, edge: goalEdge } };
  }

  /** Recompute the cost, real travel time and length of an arc sequence under the current traffic. */
  evaluate(arcs, startS, endS, profile) {
    const G = this.G, P = compileProfile(profile), cost = this.costs(P), turnCost = P.turnCost;
    const { tStart, tTo, tType, aLen, aDir, aEdge, eLen } = G;
    let c = 0, len = 0, turns = 0;
    const n = arcs.length;
    for (let i = 0; i < n; i++) {
      const a = arcs[i], L = eLen[aEdge[a]];
      let f0 = 0, f1 = 1;
      if (i === 0) f0 = aDir[a] > 0 ? startS / L : 1 - startS / L;
      if (i === n - 1) f1 = aDir[a] > 0 ? endS / L : 1 - endS / L;
      if (n > 1 && i === n - 1 && i !== 0) f0 = 0;
      const f = Math.max(0, f1 - f0);
      c += cost[a] * f; len += aLen[a] * f;
      if (i < n - 1) { let tc = -1; for (let t = tStart[a]; t < tStart[a + 1]; t++) if (tTo[t] === arcs[i + 1]) { tc = turnCost[tType[t]]; break; } if (tc < 0) return { cost: Infinity, time: Infinity, length: len, legal: false, at: i }; c += tc; turns += tc; }
    }
    return { cost: c, time: c, length: len, turnTime: turns, legal: true };
  }

  /**
   * Everything a vehicle could have reached within `seconds` from a point. Returns { arcs, t } (time at the END of each arc)
   * plus the bounding circle. Used for the police search area and for "nearest by drive time" lookups.
   */
  isochrone(from, seconds, opts = {}) {
    const G = this.G, P = compileProfile(opts.profile);
    const sa = this._snap(from, 0, this._sa, false);
    if (!sa) return null;
    const cost = this.costs(P), turnCost = P.turnCost, { tStart, tTo, tType, aTo, nx, nz } = G;
    const g = this.g, mark = this.mark, done = this.done, heap = this.heap;
    const stamp = ++this.stamp; heap.clear();
    const st = this._starts(sa, { ...from, heading: opts.anyDirection ? undefined : from.heading }, P, []);
    for (let i = 0; i < st.length; i += 3) { const a = st[i]; if (cost[a] === Infinity) continue; const ga = (opts.anyDirection ? 0 : st[i + 2]) + cost[a] * st[i + 1]; g[a] = ga; mark[a] = stamp; heap.push(ga, a); }
    const arcs = [], times = [];
    let r2 = 0;
    while (heap.n) {
      const a = heap.pop(), ga = heap.topKey;
      if (done[a] === stamp || ga > g[a]) continue;
      done[a] = stamp;
      const over = ga > seconds;
      arcs.push(a); times.push(ga);
      const v = aTo[a], d2 = (nx[v] - sa.x) ** 2 + (nz[v] - sa.z) ** 2; if (!over && d2 > r2) r2 = d2;
      if (over) continue; // arcs partly inside the budget are reported, but not expanded
      for (let t = tStart[a]; t < tStart[a + 1]; t++) {
        const b = tTo[t]; if (cost[b] === Infinity || done[b] === stamp) continue;
        const nb = ga + turnCost[tType[t]] + cost[b];
        if (mark[b] !== stamp || nb < g[b]) { g[b] = nb; mark[b] = stamp; heap.push(nb, b); }
      }
    }
    return { arcs: Int32Array.from(arcs), t: Float32Array.from(times), center: { x: sa.x, z: sa.z }, radius: Math.sqrt(r2), seconds };
  }
}

function viaBanned(list, fromEdge, toEdge) { for (let i = 0; i < list.length; i += 2) if (list[i] === fromEdge && list[i + 1] === toEdge) return true; return false; }
