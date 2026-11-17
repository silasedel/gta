// SOUTHLINE V2 navigation: the on-foot router.
// Its own graph: mapped sidewalks, crosswalks, footpaths, park paths, promenades, boardwalks, piers, steps, the derived
// sidewalk lines of every street, the roadside of small streets that have no sidewalk, crossings at every intersection
// (signalized ones cost a wait, big roads without a signal cost more, freeways cannot be crossed), and an open lattice over
// parks and beaches so a route can cut across the grass or walk along the sand.

import { AF, K, KIND_INFO, NF, edgesNear, snap as snapRoad, str } from './graph.js';
import { cardinal, roadLabel, shortName } from './maneuvers.js';

export const WK = ['sidewalk', 'crossing', 'footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'roadside', 'grass', 'sand', 'link',
  'boardwalk', 'pier', 'trail', 'dock', 'xing_signal', 'xing_plain', 'roadside_big'];
const W = Object.fromEntries(WK.map((k, i) => [k, i]));
// walking speed (m/s) and a comfort factor (>1 = avoided a little) per kind
const SPEED = [1.42, 1.35, 1.42, 1.38, 1.4, 0.7, 1.42, 1.3, 1.36, 1.28, 1.05, 1.3, 1.42, 1.4, 1.25, 1.35, 1.35, 1.35, 1.3];
const COMFORT = [1, 1, 0.97, 0.96, 1.08, 1.1, 0.94, 1.05, 1.22, 1.03, 1.08, 1, 0.93, 0.97, 1.0, 1, 1, 1, 1.9];
const LABEL = { footway: 'the footpath', path: 'the path', cycleway: 'the bike path', steps: 'the steps', pedestrian: 'the promenade', track: 'the trail', grass: 'the park',
  sand: 'the beach', boardwalk: 'the boardwalk', pier: 'the pier', trail: 'the trail', dock: 'the dock', sidewalk: 'the sidewalk', roadside: 'the street', roadside_big: 'the road shoulder' };
const MAX_SEG = 14;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function segHit(ax, az, bx, bz, cx, cz, dx, dz) { // proper intersection of segments ab and cd
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz, den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  return t > 0.02 && t < 0.98 && u >= 0 && u <= 1;
}
function inPoly(x, z, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }

/**
 * @param input { paths:[{kind,width,surface,bridge,name,pf}], sidewalks:[{edge,pf}], G (car graph), areas:[{kind:'park'|'beach', outer, holes}],
 *                water?: { cell, minX, minZ, nx, nz, blocked:Uint8Array (0 = water) } coarse water mask for the lattice }
 */
export function buildWalkGraph(input) {
  const t0 = now();
  const G = input.G;
  const X = [], Zs = [], key2node = new Map();
  const node = (x, z) => { const k = (Math.round(x * 10) + 1048576) * 4194304 + (Math.round(z * 10) + 1048576); let n = key2node.get(k); if (n === undefined) { n = X.length; X.push(x); Zs.push(z); key2node.set(k, n); } return n; };
  const eA = [], eB = [], eKind = [], eLine = [], eRoad = [], eCost = [];
  const pairSeen = new Set();
  const addEdge = (a, b, kind, line, road = -1, extra = 0) => {
    if (a === b) return false;
    const pk = a < b ? a * 4194304 + b : b * 4194304 + a; if (pairSeen.has(pk)) return false; pairSeen.add(pk);
    const len = Math.hypot(X[a] - X[b], Zs[a] - Zs[b]);
    eA.push(a); eB.push(b); eKind.push(kind); eLine.push(line); eRoad.push(road); eCost.push(len / SPEED[kind] * COMFORT[kind] + extra);
    return true;
  };
  const strings = [], strIdx = new Map();
  const intern = (s) => { if (!s) return -1; let i = strIdx.get(s); if (i === undefined) { i = strings.length; strings.push(s); strIdx.set(s, i); } return i; };
  const lineKind = [], lineName = [], lineRoad = [], lineEnds = []; // per line; ends = [firstNode, lastNode]
  const nodeLine = []; // one line id per node (the first that created it) for the intersection pass
  const addLine = (pf, kind, name, road) => {
    const id = lineKind.length; lineKind.push(kind); lineName.push(intern(name)); lineRoad.push(road);
    let prev = -1, first = -1;
    for (let i = 0; i < pf.length; i += 2) {
      const x = pf[i], z = pf[i + 1];
      if (i) {
        const px = pf[i - 2], pz = pf[i - 1], l = Math.hypot(x - px, z - pz), parts = Math.ceil(l / MAX_SEG);
        for (let q = 1; q < parts; q++) { const u = q / parts, n = node(px + (x - px) * u, pz + (z - pz) * u); if (nodeLine[n] === undefined) nodeLine[n] = id; addEdge(prev, n, kind, id, road); prev = n; }
      }
      const n = node(x, z); if (nodeLine[n] === undefined) nodeLine[n] = id;
      if (prev >= 0) addEdge(prev, n, kind, id, road); else first = n;
      prev = n;
    }
    lineEnds.push(first, prev);
    return id;
  };

  // ---- 1. mapped paths ----
  for (const p of input.paths || []) {
    if (!p.pf || p.pf.length < 4) continue;
    let kind = W[p.kind];
    if (kind === undefined) kind = /board/.test(p.kind) ? W.boardwalk : /pier/.test(p.kind) ? W.pier : /dock/.test(p.kind) ? W.dock : /trail/.test(p.kind) ? W.trail : W.footway;
    if (p.surface === 'wood' && kind === W.footway) kind = W.boardwalk;
    addLine(p.pf, kind, p.name || null, -1);
  }
  // ---- 2. derived sidewalk lines of streets ----
  const roadHasSidewalk = new Uint8Array(G.nE);
  const edgeIdx = G.idsAreIdx ? null : new Map(G.eId.map((id, i) => [id, i]));
  for (const s of input.sidewalks || []) {
    if (!s.pf || s.pf.length < 4) continue;
    const k = edgeIdx ? (edgeIdx.get(s.edge) ?? -1) : (s.edge >= 0 && s.edge < G.nE ? s.edge : -1);
    if (k >= 0) roadHasSidewalk[k] = 1;
    addLine(s.pf, W.sidewalk, k >= 0 ? str(G, G.eName[k]) : null, k);
  }
  // ---- 3. roadside of streets without sidewalks (never freeways, ramps or tunnels) ----
  for (let k = 0; k < G.nE; k++) {
    if (roadHasSidewalk[k]) continue;
    const kind = G.eKind[k], fl = G.eFlags[k];
    if (kind === K.motorway || kind === K.motorway_link || kind === K.trunk_link || (fl & AF.TUNNEL)) continue;
    const big = KIND_INFO[kind].rank <= 3;
    addLine(G.pts.subarray(2 * G.ePtsOff[k], 2 * G.ePtsOff[k + 1]), big ? W.roadside_big : W.roadside, str(G, G.eName[k]), k);
  }
  const nLinesReal = lineKind.length;

  // ---- vertex grid ----
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < X.length; i++) { if (X[i] < minX) minX = X[i]; if (X[i] > maxX) maxX = X[i]; if (Zs[i] < minZ) minZ = Zs[i]; if (Zs[i] > maxZ) maxZ = Zs[i]; }
  for (const a of input.areas || []) for (const p of a.outer) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
  if (!(minX < maxX)) { minX = minZ = 0; maxX = maxZ = 1; }
  const CELL = 16, gx = Math.ceil((maxX - minX + 1) / CELL), gz = Math.ceil((maxZ - minZ + 1) / CELL);
  const cells = new Map();
  const cellOf = (x, z) => Math.floor((z - minZ) / CELL) * gx + Math.floor((x - minX) / CELL);
  const gridAdd = (n) => { const c = cellOf(X[n], Zs[n]); let a = cells.get(c); if (!a) cells.set(c, (a = [])); a.push(n); };
  for (let n = 0; n < X.length; n++) gridAdd(n);
  const near = (x, z, r, cb) => {
    const i0 = Math.floor((x - r - minX) / CELL), i1 = Math.floor((x + r - minX) / CELL), j0 = Math.floor((z - r - minZ) / CELL), j1 = Math.floor((z + r - minZ) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = cells.get(j * gx + i); if (a) for (const n of a) { const d = Math.hypot(X[n] - x, Zs[n] - z); if (d <= r) cb(n, d); } }
  };

  // which road (if any) does the straight link a-b cross? returns car edge index, -1 none, -2 forbidden (freeway)
  const crossed = (ax, az, bx, bz) => {
    let hit = -1, rank = 99;
    edgesNear(G, (ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 1, (k) => {
      if (hit === -2) return;
      for (let p = G.ePtsOff[k]; p < G.ePtsOff[k + 1] - 1; p++) {
        if (!segHit(ax, az, bx, bz, G.pts[2 * p], G.pts[2 * p + 1], G.pts[2 * p + 2], G.pts[2 * p + 3])) continue;
        if (G.ptsY && (G.ptsY[p] > 3 || G.ptsY[p + 1] > 3)) continue; // an elevated deck overhead is not in the way
        const kind = G.eKind[k];
        if (kind === K.motorway || kind === K.motorway_link || kind === K.trunk_link) { hit = -2; return; }
        if (KIND_INFO[kind].rank < rank) { rank = KIND_INFO[kind].rank; hit = k; }
      }
    });
    return hit;
  };
  const crossCost = (k, signal) => {
    if (signal) return 11;
    const lanes = G.eLanesF[k] + G.eLanesB[k], rank = KIND_INFO[G.eKind[k]].rank;
    return 2.5 + 2.2 * lanes + (rank <= 2 ? 14 : rank === 3 ? 6 : 0);
  };
  const link = (a, b, signal) => {
    const k = crossed(X[a], Zs[a], X[b], Zs[b]);
    if (k === -2) return false;
    if (k >= 0) return addEdge(a, b, signal ? W.xing_signal : W.xing_plain, -1, k, crossCost(k, signal));
    return addEdge(a, b, W.link, -1, -1, 0);
  };

  // ---- 4. join line ends to neighboring lines (corners, path meets sidewalk, ...) ----
  let nLinks = 0;
  for (let l = 0; l < nLinesReal; l++) for (let e = 0; e < 2; e++) {
    const n = lineEnds[2 * l + e];
    const best = new Map(); // other line -> [node, dist]
    near(X[n], Zs[n], 15, (m, d) => { const ol = nodeLine[m]; if (m === n || ol === l) return; const b = best.get(ol); if (!b || d < b[1]) best.set(ol, [m, d]); });
    const arr = [...best.values()].sort((p, q) => p[1] - q[1]).slice(0, 2);
    for (const [m] of arr) if (link(n, m, false)) nLinks++;
  }
  // ---- 5. a crossing on every side of every intersection ----
  let nXing = 0;
  for (let v = 0; v < G.nN; v++) {
    if (G.nDeg[v] < 3) continue;
    let wmax = 6; for (let o = G.nOutStart[v]; o < G.nOutStart[v + 1]; o++) wmax = Math.max(wmax, G.eWidth[G.aEdge[G.nOut[o]]]);
    for (let o = G.nInStart[v]; o < G.nInStart[v + 1]; o++) wmax = Math.max(wmax, G.eWidth[G.aEdge[G.nIn[o]]]);
    const R = Math.min(34, wmax * 0.5 + 9), signal = (G.nFlags[v] & NF.SIGNAL) !== 0;
    // the two sidewalks of each arm (same road edge) get one crossing next to the junction
    const byRoad = new Map();
    near(G.nx[v], G.nz[v], R, (m) => { const l = nodeLine[m]; if (l === undefined || l >= nLinesReal || lineKind[l] !== W.sidewalk) return; const r = lineRoad[l]; if (r < 0 || (G.eA[r] !== v && G.eB[r] !== v)) return; let a = byRoad.get(r); if (!a) byRoad.set(r, (a = new Map())); let b = a.get(l); if (!b) a.set(l, (b = [])); b.push(m); });
    for (const lines of byRoad.values()) {
      if (lines.size < 2) continue;
      const ls = [...lines.values()];
      for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
        let ba = -1, bb = -1, bd = 2 * R + 4;
        for (const a of ls[i]) for (const b of ls[j]) { const d = Math.hypot(X[a] - X[b], Zs[a] - Zs[b]); if (d < bd) { bd = d; ba = a; bb = b; } }
        if (ba >= 0 && bd > 0.3 && link(ba, bb, signal)) nXing++;
      }
    }
  }

  // ---- 6. open lattice over parks and beaches ----
  let nLattice = 0;
  const wm = input.water;
  const wet = (x, z) => { if (!wm) return false; const i = Math.floor((x - wm.minX) / wm.cell), j = Math.floor((z - wm.minZ) / wm.cell); return i >= 0 && j >= 0 && i < wm.nx && j < wm.nz && wm.blocked[j * wm.nx + i] === 0; };
  for (const area of input.areas || []) {
    const ring = area.outer; if (!ring || ring.length < 3) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of ring) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
    const areaBB = (x1 - x0) * (z1 - z0);
    if (areaBB < 900) continue;
    const step = areaBB > 2.5e6 ? 44 : areaBB > 4e5 ? 30 : 20, kind = area.kind === 'beach' ? W.sand : W.grass;
    const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((z1 - z0) / step) + 1;
    if (cols * rows > 60000) continue;
    const ids = new Int32Array(cols * rows).fill(-1);
    const lid = lineKind.length; lineKind.push(kind); lineName.push(intern(area.name || null)); lineRoad.push(-1); lineEnds.push(-1, -1);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = x0 + (i + 0.5) * step * ((x1 - x0) / (cols * step)), z = z0 + (j + 0.5) * step * ((z1 - z0) / (rows * step));
      if (!inPoly(x, z, ring) || wet(x, z)) continue;
      let hole = false; for (const h of area.holes || []) if (inPoly(x, z, h)) { hole = true; break; }
      if (hole) continue;
      const n = node(x, z); if (nodeLine[n] === undefined) { nodeLine[n] = lid; gridAdd(n); }
      ids[j * cols + i] = n; nLattice++;
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const n = ids[j * cols + i]; if (n < 0) continue;
      const tryN = (ii, jj) => { if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) return; const m = ids[jj * cols + ii]; if (m < 0) return; if (wet((X[n] + X[m]) / 2, (Zs[n] + Zs[m]) / 2)) return; addEdge(n, m, kind, lid); };
      tryN(i + 1, j); tryN(i, j + 1); tryN(i + 1, j + 1); tryN(i - 1, j + 1);
      // tie the lattice into paths and sidewalks around it
      let bm = -1, bd = step * 1.1;
      near(X[n], Zs[n], step * 1.1, (m, d) => { if (nodeLine[m] !== lid && d < bd) { bd = d; bm = m; } });
      if (bm >= 0) link(n, bm, false);
    }
  }

  // ---- CSR ----
  const nN = X.length, nE = eA.length;
  const adjStart = new Uint32Array(nN + 1);
  for (let e = 0; e < nE; e++) { adjStart[eA[e] + 1]++; adjStart[eB[e] + 1]++; }
  for (let i = 0; i < nN; i++) adjStart[i + 1] += adjStart[i];
  const adjTo = new Int32Array(2 * nE), adjCost = new Float32Array(2 * nE), adjKind = new Uint8Array(2 * nE), adjLine = new Int32Array(2 * nE), adjRoad = new Int32Array(2 * nE);
  { const fill = adjStart.slice(0, nN);
    for (let e = 0; e < nE; e++) for (let s = 0; s < 2; s++) { const a = s ? eB[e] : eA[e], b = s ? eA[e] : eB[e], p = fill[a]++; adjTo[p] = b; adjCost[p] = eCost[e]; adjKind[p] = eKind[e]; adjLine[p] = eLine[e]; adjRoad[p] = eRoad[e]; } }
  // nearest-vertex grid as CSR (so the graph is all typed arrays and can cross to the main thread)
  const gStart = new Uint32Array(gx * gz + 1);
  const xs = Float32Array.from(X), zs = Float32Array.from(Zs);
  const cidx = new Int32Array(nN);
  for (let n = 0; n < nN; n++) { let c = cellOf(xs[n], zs[n]); if (c < 0 || c >= gx * gz) c = 0; cidx[n] = c; gStart[c + 1]++; }
  for (let c = 0; c < gx * gz; c++) gStart[c + 1] += gStart[c];
  const gItems = new Int32Array(nN);
  { const fill = gStart.slice(0, gx * gz); for (let n = 0; n < nN; n++) gItems[fill[cidx[n]]++] = n; }
  // connected components (so endpoints snap onto the main network, not an isolated scrap)
  const comp = new Int32Array(nN).fill(-1); const compSize = [];
  { const stack = []; for (let s = 0; s < nN; s++) { if (comp[s] >= 0) continue; const c = compSize.length; let size = 0; comp[s] = c; stack.push(s); while (stack.length) { const u = stack.pop(); size++; for (let q = adjStart[u]; q < adjStart[u + 1]; q++) { const v = adjTo[q]; if (comp[v] < 0) { comp[v] = c; stack.push(v); } } } compSize.push(size); } }
  let mainComp = 0; for (let c = 1; c < compSize.length; c++) if (compSize[c] > compSize[mainComp]) mainComp = c;
  return {
    nN, nE, x: xs, z: zs, adjStart, adjTo, adjCost, adjKind, adjLine, adjRoad, comp, mainComp,
    lineKind: Uint8Array.from(lineKind), lineName: Int32Array.from(lineName), lineRoad: Int32Array.from(lineRoad), strings,
    grid: { minX, minZ, cell: CELL, nx: gx, nz: gz, start: gStart, items: gItems },
    stats: { nodes: nN, edges: nE, lines: nLinesReal, links: nLinks, crossings: nXing, lattice: nLattice, components: compSize.length, mainShare: Math.round(1000 * compSize[mainComp] / Math.max(1, nN)) / 10, buildMs: Math.round(now() - t0) },
  };
}

// ------------------------------------------------------------------------------------------------ search
class Heap {
  constructor(cap = 4096) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) { if (this.n === this.k.length) { const k2 = new Float64Array(this.n * 2); k2.set(this.k); this.k = k2; const v2 = new Int32Array(this.n * 2); v2.set(this.v); this.v = v2; } const k = this.k, v = this.v; let i = this.n++; while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0]; this.topKey = k[0]; const n = --this.n; if (n > 0) { const key = k[n], val = v[n]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= key) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = key; v[i] = val; } return top; }
}

function nearestVerts(Wg, x, z, maxR, out, mainOnly) { // up to 3 nearest vertices: [node, dist, ...]
  const g = Wg.grid; out.length = 0;
  for (let r = 24; r <= maxR; r *= 2) {
    const i0 = Math.max(0, Math.floor((x - r - g.minX) / g.cell)), i1 = Math.min(g.nx - 1, Math.floor((x + r - g.minX) / g.cell));
    const j0 = Math.max(0, Math.floor((z - r - g.minZ) / g.cell)), j1 = Math.min(g.nz - 1, Math.floor((z + r - g.minZ) / g.cell));
    const found = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * g.nx + i; for (let q = g.start[c]; q < g.start[c + 1]; q++) { const n = g.items[q]; if (mainOnly && Wg.comp[n] !== Wg.mainComp) continue; const d = Math.hypot(Wg.x[n] - x, Wg.z[n] - z); if (d <= r) found.push([d, n]); } }
    if (found.length) { found.sort((a, b) => a[0] - b[0]); for (let i = 0; i < Math.min(3, found.length); i++) out.push(found[i][1], found[i][0]); return out; }
  }
  return out;
}

/** Fastest walk. from / to: { x, z }. opts: { speed (multiplier, e.g. 2.2 when jogging) }. Returns { nodes, cost, length, ms } or null. */
export function walkRoute(Wg, from, to, opts = {}) {
  const t0 = now();
  if (!Wg._g) { Wg._g = new Float64Array(Wg.nN); Wg._p = new Int32Array(Wg.nN); Wg._m = new Uint32Array(Wg.nN); Wg._d = new Uint32Array(Wg.nN); Wg._stamp = 0; Wg._heap = new Heap(); Wg._goal = new Float32Array(Wg.nN); }
  const g = Wg._g, pred = Wg._p, mark = Wg._m, done = Wg._d, heap = Wg._heap, goalCost = Wg._goal;
  const stamp = ++Wg._stamp; heap.n = 0;
  const { adjStart, adjTo, adjCost, x, z } = Wg;
  const direct = Math.hypot(to.x - from.x, to.z - from.z);
  const S = nearestVerts(Wg, from.x, from.z, 800, [], true), T = nearestVerts(Wg, to.x, to.z, 800, [], true);
  if (!S.length || !T.length) return null;
  const OFF = 1 / 1.15; // off-network walking to reach the graph
  const goals = new Map(); for (let i = 0; i < T.length; i += 2) { goals.set(T[i], T[i + 1] * OFF); goalCost[T[i]] = T[i + 1] * OFF; }
  const inv = 1 / 1.52;
  for (let i = 0; i < S.length; i += 2) { const n = S[i], c = S[i + 1] * OFF; g[n] = c; pred[n] = -1; mark[n] = stamp; heap.push(c + Math.hypot(x[n] - to.x, z[n] - to.z) * inv, n); }
  let best = Infinity, bestNode = -1, expanded = 0;
  while (heap.n) {
    const u = heap.pop();
    if (heap.topKey >= best) break;
    if (done[u] === stamp) continue; done[u] = stamp; expanded++;
    const gu = g[u];
    if (goals.has(u)) { const c = gu + goals.get(u); if (c < best) { best = c; bestNode = u; } }
    for (let q = adjStart[u], qe = adjStart[u + 1]; q < qe; q++) {
      const v = adjTo[q]; if (done[v] === stamp) continue;
      const nv = gu + adjCost[q];
      if (mark[v] !== stamp || nv < g[v]) { g[v] = nv; pred[v] = u; mark[v] = stamp; heap.push(nv + Math.hypot(x[v] - to.x, z[v] - to.z) * inv, v); }
    }
  }
  if (bestNode < 0) return null;
  const rev = []; for (let n = bestNode; n >= 0; n = pred[n]) rev.push(n);
  const sp = opts.speed || 1;
  return { nodes: Int32Array.from(rev.reverse()), cost: best / sp, expanded, ms: now() - t0, direct, from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, speed: sp };
}

// ------------------------------------------------------------------------------------------------ route object
function edgeBetween(Wg, a, b) { for (let q = Wg.adjStart[a]; q < Wg.adjStart[a + 1]; q++) if (Wg.adjTo[q] === b) return q; return -1; }

/** Build the Route object (same shape as a driving route: line, cum, maneuvers, time tables) for a walk. G = car graph for road names. */
export function assembleWalk(Wg, G, raw, opts = {}) {
  const nodes = raw.nodes, m = nodes.length, sp = raw.speed || 1;
  const px = [raw.from.x], pz = [raw.from.z], pt = [0], segKind = [W.link], segLine = [-1], segRoad = [-1];
  let t = Math.hypot(Wg.x[nodes[0]] - raw.from.x, Wg.z[nodes[0]] - raw.from.z) / 1.15 / sp;
  px.push(Wg.x[nodes[0]]); pz.push(Wg.z[nodes[0]]); pt.push(t);
  for (let i = 1; i < m; i++) {
    const q = edgeBetween(Wg, nodes[i - 1], nodes[i]);
    t += (q >= 0 ? Wg.adjCost[q] : Math.hypot(Wg.x[nodes[i]] - Wg.x[nodes[i - 1]], Wg.z[nodes[i]] - Wg.z[nodes[i - 1]]) / 1.3) / sp;
    px.push(Wg.x[nodes[i]]); pz.push(Wg.z[nodes[i]]); pt.push(t);
    segKind.push(q >= 0 ? Wg.adjKind[q] : W.link); segLine.push(q >= 0 ? Wg.adjLine[q] : -1); segRoad.push(q >= 0 ? Wg.adjRoad[q] : -1);
  }
  t += Math.hypot(raw.to.x - px[px.length - 1], raw.to.z - pz[pz.length - 1]) / 1.15 / sp;
  px.push(raw.to.x); pz.push(raw.to.z); pt.push(t); segKind.push(W.link); segLine.push(-1); segRoad.push(-1);
  // drop zero-length steps
  const n = px.length, line = new Float32Array(n * 2), cum = new Float32Array(n), arcT = new Float64Array(n), arcD = new Float64Array(n), arcAt = new Uint32Array(n);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    line[2 * i] = px[i]; line[2 * i + 1] = pz[i]; arcAt[i] = i; arcT[i] = pt[i];
    if (i) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
    arcD[i] = cum[i];
    if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i]; if (pz[i] < minZ) minZ = pz[i]; if (pz[i] > maxZ) maxZ = pz[i];
  }
  // segment i runs from point i to i+1 and has kind segKind[i+1] (the kind of the step that reached point i+1)
  const kindOf = (i) => segKind[Math.min(n - 1, i + 1)], lineOf = (i) => segLine[Math.min(n - 1, i + 1)], roadOf = (i) => segRoad[Math.min(n - 1, i + 1)];
  const nameOfSeg = (i) => {
    const l = lineOf(i);
    if (l >= 0) { const nm = Wg.lineName[l]; if (nm >= 0) return Wg.strings[nm]; const r = Wg.lineRoad[l]; if (r >= 0 && G) return str(G, G.eName[r]); }
    const k = kindOf(i);
    if (G && (k === W.sidewalk || k === W.roadside || k === W.roadside_big)) { // a mapped, unnamed sidewalk: it runs along some street
      let ck = nameCache.get(l); if (ck !== undefined && l >= 0) return ck;
      const j = Math.min(n - 2, i), s = snapRoad(G, (px[j] + px[j + 1]) / 2, (pz[j] + pz[j + 1]) / 2, { maxDist: 18, filter: (e) => G.eName[e] >= 0 });
      ck = s ? str(G, G.eName[s.edge]) : null; if (l >= 0) nameCache.set(l, ck); return ck;
    }
    return null;
  };
  const nameCache = new Map();
  const headingOver = (i0, fwd) => { // heading of the path over ~8 m starting at point i0 going forward (or arriving at it)
    let j = i0, d = 0;
    if (fwd) { while (j < n - 1 && d < 8) { d += Math.hypot(px[j + 1] - px[j], pz[j + 1] - pz[j]); j++; } return Math.atan2(px[j] - px[i0], pz[j] - pz[i0]); }
    while (j > 0 && d < 8) { d += Math.hypot(px[j] - px[j - 1], pz[j] - pz[j - 1]); j--; } return Math.atan2(px[i0] - px[j], pz[i0] - pz[j]);
  };
  const mans = [];
  const describe = (i) => { const nm = nameOfSeg(i); const k = WK[kindOf(i)]; return { name: nm ? roadLabel(nm) : null, label: nm ? (k === 'sidewalk' || k === 'roadside' || k === 'roadside_big' ? roadLabel(nm) : roadLabel(nm)) : (LABEL[k] || 'the path'), kind: k }; };
  { const d0 = describe(Math.min(1, n - 2)), h = headingOver(0, true);
    mans.push({ type: 'depart', modifier: 'straight', at: 0, arcIndex: 0, x: px[0], z: pz[0], name: d0.name, text: `Walk ${cardinal(h)}${d0.name ? ` on ${d0.name}` : d0.kind === 'grass' || d0.kind === 'sand' ? ` across ${d0.label}` : ''}`, short: d0.name ? shortName(d0.name) : 'Start', side: 0, lanes: null, bearing: h }); }
  let lastAt = 0;
  for (let i = 1; i < n - 1; i++) {
    const kPrev = kindOf(i - 1), kNext = kindOf(i);
    const isX = (k) => k === W.xing_signal || k === W.xing_plain || k === W.crossing;
    // crossing a road
    if (isX(kNext) && !isX(kPrev)) {
      let rk = roadOf(i), nm = null;
      if (rk < 0 && G) { const s = snapRoad(G, (px[i] + px[i + 1]) / 2, (pz[i] + pz[i + 1]) / 2, { maxDist: 14 }); if (s) rk = s.edge; }
      if (rk >= 0 && G) nm = str(G, G.eName[rk]);
      const hIn = headingOver(i, false), hOut = headingOver(i, true);
      let a = hOut - hIn; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
      const big = rk >= 0 && G && KIND_INFO[G.eKind[rk]].rank <= 2;
      if (Math.abs(a) <= 0.7 && !(big && cum[i] - lastAt > 120)) continue; // crossing side streets while walking straight needs no instruction
      if (cum[i] - lastAt < 10 && mans.length > 1) continue;
      const sideTxt = a < -0.7 ? 'Turn right and cross' : a > 0.7 ? 'Turn left and cross' : 'Cross';
      mans.push({ type: 'cross', modifier: a < -0.7 ? 'right' : a > 0.7 ? 'left' : 'straight', at: cum[i], arcIndex: i, x: px[i], z: pz[i], name: nm ? roadLabel(nm) : null, signal: kNext === W.xing_signal,
        text: `${sideTxt} ${nm ? roadLabel(nm) : 'the street'}${kNext === W.xing_signal ? ' at the light' : ''}`, short: nm ? shortName(nm) : 'Cross', side: a < -0.7 ? 1 : a > 0.7 ? -1 : 0, lanes: null, angle: -a });
      lastAt = cum[i];
      continue;
    }
    if (isX(kPrev) || isX(kNext)) continue;
    const lPrev = lineOf(i - 1), lNext = lineOf(i);
    const hIn = headingOver(i, false), hOut = headingOver(i, true);
    let a = hOut - hIn; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; // + = left (heading grows to the left)
    const dPrev = describe(i - 1), dNext = describe(i);
    const changed = lPrev !== lNext && (dPrev.label !== dNext.label);
    if (!changed && lPrev !== lNext && Math.abs(a) < 1.15) continue;
    if (Math.abs(a) < 0.75 && !(changed && (kNext === W.steps || kNext === W.sand || kNext === W.grass || kNext === W.pier || kNext === W.boardwalk) && kPrev !== kNext)) continue;
    if (cum[i] - lastAt < 14 && mans.length > 1) continue; // corner wiggles
    // stay quiet for a bend along the same thing
    if (!changed && Math.abs(a) < 1.15) continue;
    let ahead = 0; for (let j = i; j < n - 1 && lineOf(j) === lNext; j++) ahead += cum[j + 1] - cum[j];
    if (ahead < 9 && i < n - 3) continue;
    const dir = Math.abs(a) < 0.75 ? null : a > 0 ? 'left' : 'right';
    let text;
    if (kNext === W.steps) text = `${dir ? `Turn ${dir} and take` : 'Take'} the steps`;
    else if (kNext === W.grass) text = `${dir ? `Turn ${dir} and cut` : 'Cut'} across ${dNext.name || 'the park'}`;
    else if (kNext === W.sand) text = `${dir ? `Turn ${dir} and walk` : 'Walk'} along the beach`;
    else text = `${dir ? `Turn ${dir}` : 'Continue'} onto ${dNext.label}`;
    mans.push({ type: dir ? 'turn' : 'continue', modifier: dir || 'straight', at: cum[i], arcIndex: i, x: px[i], z: pz[i], name: dNext.name, text, short: dNext.name ? shortName(dNext.name) : (dNext.label || '').replace(/^the /, ''), side: dir === 'right' ? 1 : dir === 'left' ? -1 : 0, lanes: null, angle: -a });
    lastAt = cum[i];
  }
  mans.push({ type: 'arrive', modifier: 'straight', at: cum[n - 1], arcIndex: n - 1, x: px[n - 1], z: pz[n - 1], name: opts.destName || null, text: opts.destName ? `Arrive at ${opts.destName}` : 'You have arrived', short: opts.destName || 'Destination', side: 0, lanes: null });
  for (let i = 0; i < mans.length; i++) { mans[i].index = i; mans[i].length = (i + 1 < mans.length ? mans[i + 1].at : cum[n - 1]) - mans[i].at; mans[i].time = arcT[Math.min(n - 1, mans[i].arcIndex)]; }
  const arcs = new Int32Array(n - 1);
  const route = {
    mode: 'walk', profile: 'walk', arcs, from: { ...raw.from }, to: { ...raw.to }, destName: opts.destName || null,
    length: cum[n - 1], time: arcT[n - 1], cost: raw.cost, line, cum, lineLength: cum[n - 1], arcAt, arcD, arcT, maneuvers: mans, head: null, tail: null,
    bbox: { minX, minZ, maxX, maxZ }, searchMs: raw.ms, expanded: raw.expanded, kinds: Uint8Array.from(segKind),
    get pts() { if (!this._pts) { const p = []; for (let i = 0; i < line.length; i += 2) p.push([line[i], line[i + 1]]); this._pts = p; } return this._pts; },
  };
  return route;
}
