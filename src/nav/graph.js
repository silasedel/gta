// SOUTHLINE V2 navigation: compact, turn-aware road graph (pure data, no DOM, no three.js).
// Built once from city.roadGraph (CONTRACT4) and shared by the main thread, the nav Web Worker and the Node tests.
//
// Model
//   edge  = one road piece between two graph nodes (as in city.roadGraph)
//   arc   = one legal direction of travel along an edge (a one-way edge has one arc, a two-way edge has two)
//   transition = a legal movement from one arc to the next at the node they share, with a turn type
// Routing runs on arcs ("edge-expanded graph"), so every turn can carry its own cost and illegal turns simply do not exist.
//
// Frame (CONTRACT4): x east, z south, meters. Heading h points along (sin h, cos h). A right turn lowers the heading.
// Every optional field of the source data is read defensively: a missing field falls back to a sensible inference.

export const KINDS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street',
  'service', 'alley', 'track', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'road'];
export const K = Object.fromEntries(KINDS.map((k, i) => [k, i]));

// rank: importance (0 = biggest). mph: assumed limit when the data has none.
// flow: share of the limit a driver really averages in free flow on that class (parked cars, driveways, speed bumps,
// pedestrians and mid-block friction make small streets slower than their posted limit).
export const KIND_INFO = [
  /* motorway       */ { rank: 0, mph: 60, flow: 1.04, label: 'the freeway' },
  /* trunk          */ { rank: 1, mph: 45, flow: 0.98, label: 'the highway' },
  /* primary        */ { rank: 2, mph: 40, flow: 0.92, label: 'the road' },
  /* secondary      */ { rank: 3, mph: 35, flow: 0.88, label: 'the road' },
  /* tertiary       */ { rank: 4, mph: 30, flow: 0.84, label: 'the street' },
  /* unclassified   */ { rank: 5, mph: 25, flow: 0.78, label: 'the street' },
  /* residential    */ { rank: 6, mph: 25, flow: 0.74, label: 'the street' },
  /* living_street  */ { rank: 7, mph: 15, flow: 0.62, label: 'the lane' },
  /* service        */ { rank: 8, mph: 15, flow: 0.58, label: 'the service road' },
  /* alley          */ { rank: 9, mph: 10, flow: 0.55, label: 'the alley' },
  /* track          */ { rank: 9, mph: 15, flow: 0.50, label: 'the dirt road' },
  /* motorway_link  */ { rank: 1, mph: 40, flow: 0.96, label: 'the ramp' },
  /* trunk_link     */ { rank: 2, mph: 35, flow: 0.93, label: 'the ramp' },
  /* primary_link   */ { rank: 3, mph: 30, flow: 0.88, label: 'the turn lane' },
  /* secondary_link */ { rank: 4, mph: 25, flow: 0.86, label: 'the turn lane' },
  /* tertiary_link  */ { rank: 5, mph: 25, flow: 0.85, label: 'the turn lane' },
  /* road           */ { rank: 5, mph: 25, flow: 0.78, label: 'the road' },
];
export const MPH = 0.44704; // m/s per mph
export const KMH = 1 / 3.6;

// arc / edge flags
export const AF = { ONEWAY: 1, BRIDGE: 2, LINK: 4, MOTORWAY: 8, ROUNDABOUT: 16, TUNNEL: 32, MOVABLE: 64, RESTRICTED: 128 };
// node flags
export const NF = { SIGNAL: 1, ALLWAY: 2, CROSSING: 4, DEADEND: 8 };

// Turn type byte: bits 0-2 geometry, bits 3-4 control, bit 5 entering a destination-only road, bit 6 ramp merge/exit
// (or, with a U-turn, "dead-end turnaround"), bit 7 left turn across a big road.
export const TG = { STRAIGHT: 0, SLIGHT_RIGHT: 1, RIGHT: 2, SHARP_RIGHT: 3, SLIGHT_LEFT: 4, LEFT: 5, SHARP_LEFT: 6, UTURN: 7 };
export const TC = { NONE: 0, STOP: 1, ALLWAY: 2, SIGNAL: 3 };
export const T_ENTER_MINOR = 32, T_RAMP = 64, T_ACROSS = 128;

// Traffic zones (index stored per arc); see traffic.js
export const ZONES = ['other', 'downtown', 'business', 'beach', 'nightlife', 'residential', 'commercial', 'park', 'port', 'causeway',
  'industrial', 'airport', 'rural', 'keys', 'water'];
const ZONE_OF = Object.fromEntries(ZONES.map((z, i) => [z, i]));

const TAU = Math.PI * 2;
export function wrapPi(a) { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; }

function normKind(e) {
  let k = e.kind || 'road';
  if (k === 'street') k = 'secondary'; // legacy grid city
  if (k === 'service' && (e.service === 'alley' || e.alley)) k = 'alley';
  if (k === 'busway' || k === 'bus_guideway') k = 'service';
  return K[k] ?? K.road;
}
const firstDefined = (...a) => { for (const v of a) if (v !== undefined && v !== null && v !== '') return v; return null; };

/**
 * Build the compact navigation graph.
 * @param src  { nodes:[{id,x,z,y?,signal?,control?}], edges:[{id,a,b,pts|pf,width,lanesFwd,lanesBack,oneway,speedKmh,name,ref?,kind,bridge?,
 *              tunnel?,movable?,roundabout?|junction?,destination?,exit?,turnLanes?,access?,y?}], restrictions?:[{from,via,to,type}] }
 * @param opts { zoneAt?(x,z), districtAt?(x,z), signals?:[[x,z]], stops?:[[x,z]], restrictions?, isDrivable?(edge) }
 */
export function buildNavGraph(src, opts = {}) {
  const t0 = now();
  const nodesIn = src.nodes || [], edgesAll = src.edges || [];
  const nN = nodesIn.length;
  const nodeIdx = new Map();
  const nx = new Float32Array(nN), nz = new Float32Array(nN), ny = new Float32Array(nN), nFlags = new Uint8Array(nN);
  let idsAreIdx = true;
  for (let i = 0; i < nN; i++) {
    const n = nodesIn[i];
    nodeIdx.set(n.id, i); if (n.id !== i) idsAreIdx = false;
    nx[i] = n.x; nz[i] = n.z; ny[i] = n.y || 0;
    const c = n.control || n.ctl;
    if (n.signal || c === 'signal' || c === 'traffic_signals') nFlags[i] |= NF.SIGNAL;
    if (c === 'all_way_stop' || n.allWayStop) nFlags[i] |= NF.ALLWAY;
  }
  const strings = [], strIdx = new Map();
  const intern = (s) => { if (s === null || s === undefined || s === '') return -1; s = String(s); let i = strIdx.get(s); if (i === undefined) { i = strings.length; strings.push(s); strIdx.set(s, i); } return i; };

  // ---- edges ----
  const isDrivable = opts.isDrivable || ((e) => !/^(footway|path|cycleway|pedestrian|steps|sidewalk|crossing|corridor|platform|bridleway|proposed|construction|raceway)$/.test(e.kind || ''));
  const edgesIn = [];
  for (const e of edgesAll) {
    if (!e || !isDrivable(e)) continue;
    const np = e.pf ? e.pf.length >> 1 : (e.pts ? e.pts.length : 0);
    if (np < 2 || !nodeIdx.has(e.a) || !nodeIdx.has(e.b)) continue;
    if (e.access === 'no' && !e.kind) continue;
    edgesIn.push(e);
  }
  const nE = edgesIn.length;
  let nPts = 0;
  for (const e of edgesIn) nPts += e.pf ? e.pf.length >> 1 : e.pts.length;
  const pts = new Float32Array(nPts * 2), ptsY = new Float32Array(nPts), cum = new Float32Array(nPts), ptEdge = new Int32Array(nPts);
  const ePtsOff = new Uint32Array(nE + 1);
  const eA = new Int32Array(nE), eB = new Int32Array(nE), eLen = new Float32Array(nE), eWidth = new Float32Array(nE);
  const eLanesF = new Uint8Array(nE), eLanesB = new Uint8Array(nE), eKind = new Uint8Array(nE), eFlags = new Uint8Array(nE);
  const eName = new Int32Array(nE), eRef = new Int32Array(nE), eDestF = new Int32Array(nE), eDestB = new Int32Array(nE), eExit = new Int32Array(nE);
  const eTurnF = new Int32Array(nE), eTurnB = new Int32Array(nE), eLimit = new Float32Array(nE), eTime = new Float32Array(nE);
  const eArcF = new Int32Array(nE).fill(-1), eArcB = new Int32Array(nE).fill(-1);
  const eId = new Array(nE), edgeIdx = new Map();
  let anyY = false, off = 0;
  for (let k = 0; k < nE; k++) {
    const e = edgesIn[k];
    eId[k] = e.id; edgeIdx.set(e.id, k);
    ePtsOff[k] = off;
    const np = e.pf ? e.pf.length >> 1 : e.pts.length;
    let L = 0;
    for (let i = 0; i < np; i++) {
      const x = e.pf ? e.pf[2 * i] : e.pts[i][0], z = e.pf ? e.pf[2 * i + 1] : e.pts[i][1];
      const o = off + i;
      pts[2 * o] = x; pts[2 * o + 1] = z; ptEdge[o] = k;
      if (i) L += Math.hypot(x - pts[2 * o - 2], z - pts[2 * o - 1]);
      cum[o] = L;
      const y = e.y && e.y.length === np ? e.y[i] : 0;
      if (y) { ptsY[o] = y; anyY = true; }
    }
    off += np;
    eA[k] = nodeIdx.get(e.a); eB[k] = nodeIdx.get(e.b);
    eLen[k] = Math.max(L, 0.05);
    const kind = normKind(e); eKind[k] = kind;
    const oneway = !!e.oneway;
    let lf = e.lanesFwd | 0, lb = oneway ? 0 : (e.lanesBack | 0);
    if (lf < 1) lf = 1; if (!oneway && lb < 1) lb = 1;
    eLanesF[k] = Math.min(lf, 8); eLanesB[k] = Math.min(lb, 8);
    eWidth[k] = e.width > 0 ? e.width : (lf + lb) * 3.3;
    const info = KIND_INFO[kind];
    let fl = 0;
    if (oneway) fl |= AF.ONEWAY;
    if (e.bridge) fl |= AF.BRIDGE;
    if (e.tunnel) fl |= AF.TUNNEL;
    if (e.movable) fl |= AF.MOVABLE;
    if (kind >= K.motorway_link && kind <= K.tertiary_link) fl |= AF.LINK;
    if (kind === K.motorway) fl |= AF.MOTORWAY;
    if (e.roundabout || e.junction === 'roundabout' || e.junction === 'circular') fl |= AF.ROUNDABOUT;
    if (e.access === 'private' || e.access === 'destination' || e.access === 'customers' || e.access === 'no' || e.private) fl |= AF.RESTRICTED;
    eFlags[k] = fl;
    eName[k] = intern(e.name); eRef[k] = intern(e.ref);
    eDestF[k] = intern(firstDefined(e.destination, e.dest, e.toward, e.destinationFwd));
    eDestB[k] = intern(firstDefined(e.destinationBack, e.destBack));
    eExit[k] = intern(firstDefined(e.exit, e.exitRef, e.junctionRef, e.junction_ref));
    const tl = e.turnLanes;
    eTurnF[k] = intern(firstDefined(e.turnLanesFwd, Array.isArray(tl) ? tl.join('|') : tl));
    eTurnB[k] = intern(e.turnLanesBack);
    const lim = e.speedKmh > 0 ? e.speedKmh * KMH : (e.maxspeed > 0 ? e.maxspeed * KMH : info.mph * MPH);
    eLimit[k] = lim;
  }
  ePtsOff[nE] = off;

  // free-flow time per edge: class speed, capped through tight bends (lateral acceleration ~3 m/s^2)
  for (let k = 0; k < nE; k++) {
    const info = KIND_INFO[eKind[k]];
    const v = Math.max(2.2, eLimit[k] * info.flow);
    const p0 = ePtsOff[k], p1 = ePtsOff[k + 1];
    let t = 0;
    if (p1 - p0 === 2) t = eLen[k] / v;
    else {
      let prevCap = v;
      for (let i = p0; i < p1 - 1; i++) {
        const sx = pts[2 * i + 2] - pts[2 * i], sz = pts[2 * i + 3] - pts[2 * i + 1], sl = Math.hypot(sx, sz);
        let cap = v;
        if (i + 2 < p1) {
          const tx = pts[2 * i + 4] - pts[2 * i + 2], tz = pts[2 * i + 5] - pts[2 * i + 3], tl = Math.hypot(tx, tz);
          if (sl > 0.5 && tl > 0.5) {
            const ang = Math.abs(Math.atan2(sx * tz - sz * tx, sx * tx + sz * tz));
            if (ang > 0.06) { const R = (sl + tl) * 0.5 / ang; cap = Math.min(v, Math.max(4, Math.sqrt(3.0 * R))); }
          }
        }
        t += sl / Math.min(prevCap, cap);
        prevCap = cap;
      }
      if (!(t > 0)) t = eLen[k] / v;
    }
    eTime[k] = t;
  }

  // ---- roundabouts inferred from geometry when the data does not flag them ----
  inferRoundabouts();

  // ---- arcs ----
  let nA = 0;
  for (let k = 0; k < nE; k++) nA += (eFlags[k] & AF.ONEWAY) ? 1 : 2;
  const aEdge = new Int32Array(nA), aDir = new Int8Array(nA), aFrom = new Int32Array(nA), aTo = new Int32Array(nA);
  const aLen = new Float32Array(nA), aTime = new Float32Array(nA), aLanes = new Uint8Array(nA), aKind = new Uint8Array(nA), aFlags = new Uint8Array(nA);
  const aBearOut = new Float32Array(nA), aBearIn = new Float32Array(nA), aZone = new Uint8Array(nA), aDistrict = new Int16Array(nA).fill(-1), aStop = new Uint8Array(nA);
  const laneFactor = (n, oneway) => (n >= 4 ? 1.05 : n === 3 ? 1.03 : n === 2 ? 1.0 : oneway ? 0.97 : 0.94);
  {
    let a = 0;
    const tmp = [0, 0];
    for (let k = 0; k < nE; k++) {
      const oneway = !!(eFlags[k] & AF.ONEWAY);
      for (let d = 1; d >= -1; d -= 2) {
        if (d < 0 && oneway) break;
        aEdge[a] = k; aDir[a] = d; aFrom[a] = d > 0 ? eA[k] : eB[k]; aTo[a] = d > 0 ? eB[k] : eA[k];
        aLen[a] = eLen[k]; aKind[a] = eKind[k]; aFlags[a] = eFlags[k];
        const lanes = d > 0 ? eLanesF[k] : eLanesB[k];
        aLanes[a] = lanes;
        aTime[a] = eTime[k] / laneFactor(lanes, oneway);
        endDir(k, d > 0, tmp); aBearOut[a] = Math.atan2(tmp[0], tmp[1]);
        endDir(k, d < 0, tmp); aBearIn[a] = Math.atan2(-tmp[0], -tmp[1]);
        if (d > 0) eArcF[k] = a; else eArcB[k] = a;
        a++;
      }
    }
  }
  // unit direction leaving the edge's first (atStart) or last node, looking ~10 m into the edge
  function endDir(k, atStart, out) {
    const p0 = ePtsOff[k], p1 = ePtsOff[k + 1] - 1, L = eLen[k], look = Math.min(10, L * 0.5);
    let i;
    if (atStart) { i = p0 + 1; while (i < p1 && cum[i] < look) i++; out[0] = pts[2 * i] - pts[2 * p0]; out[1] = pts[2 * i + 1] - pts[2 * p0 + 1]; }
    else { i = p1 - 1; while (i > p0 && L - cum[i] < look) i--; out[0] = pts[2 * i] - pts[2 * p1]; out[1] = pts[2 * i + 1] - pts[2 * p1 + 1]; }
    const l = Math.hypot(out[0], out[1]) || 1; out[0] /= l; out[1] /= l;
  }

  // zones and districts per arc (sampled at the edge midpoint)
  const districts = [], distIdx = new Map();
  if (opts.zoneAt || opts.districtAt) {
    const mid = { x: 0, z: 0 };
    for (let k = 0; k < nE; k++) {
      edgePoint(k, eLen[k] * 0.5, mid);
      let zi = 0, di = -1;
      try {
        if (opts.zoneAt) { let zn = opts.zoneAt(mid.x, mid.z); if (zn === 'water' && (eFlags[k] & AF.BRIDGE)) zn = 'causeway'; zi = ZONE_OF[zn] ?? 0; }
        if (opts.districtAt) { const dn = opts.districtAt(mid.x, mid.z); if (dn) { di = distIdx.get(dn); if (di === undefined) { di = districts.length; districts.push(dn); distIdx.set(dn, di); } } }
      } catch (err) { /* keep defaults */ }
      if (eArcF[k] >= 0) { aZone[eArcF[k]] = zi; aDistrict[eArcF[k]] = di; }
      if (eArcB[k] >= 0) { aZone[eArcB[k]] = zi; aDistrict[eArcB[k]] = di; }
    }
  }

  // ---- node adjacency (outgoing arcs) ----
  const nOutStart = new Uint32Array(nN + 1), nDeg = new Uint16Array(nN);
  for (let a = 0; a < nA; a++) nOutStart[aFrom[a] + 1]++;
  for (let i = 0; i < nN; i++) nOutStart[i + 1] += nOutStart[i];
  const nOut = new Int32Array(nA);
  { const fill = nOutStart.slice(0, nN); for (let a = 0; a < nA; a++) nOut[fill[aFrom[a]]++] = a; }
  for (let k = 0; k < nE; k++) { nDeg[eA[k]]++; if (eB[k] !== eA[k]) nDeg[eB[k]]++; else nDeg[eA[k]]++; }
  const nInStart = new Uint32Array(nN + 1);
  for (let a = 0; a < nA; a++) nInStart[aTo[a] + 1]++;
  for (let i = 0; i < nN; i++) nInStart[i + 1] += nInStart[i];
  const nIn = new Int32Array(nA);
  { const fill = nInStart.slice(0, nN); for (let a = 0; a < nA; a++) nIn[fill[aTo[a]]++] = a; }

  // ---- spatial index over edge segments (also used to attach signals / stop signs) ----
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < nPts; i++) { const x = pts[2 * i], z = pts[2 * i + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  if (!nPts) { minX = minZ = 0; maxX = maxZ = 1; }
  const CELL = 50;
  const gx = Math.max(1, Math.ceil((maxX - minX + 1) / CELL)), gz = Math.max(1, Math.ceil((maxZ - minZ + 1) / CELL));
  const gStart = new Uint32Array(gx * gz + 1);
  const cellRange = (i, cb) => { // cells overlapped by segment starting at point i
    const x0 = pts[2 * i], z0 = pts[2 * i + 1], x1 = pts[2 * i + 2], z1 = pts[2 * i + 3];
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - minX) / CELL)), i1 = Math.min(gx - 1, Math.floor((Math.max(x0, x1) - minX) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - minZ) / CELL)), j1 = Math.min(gz - 1, Math.floor((Math.max(z0, z1) - minZ) / CELL));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) cb(j * gx + ii);
  };
  for (let k = 0; k < nE; k++) for (let i = ePtsOff[k]; i < ePtsOff[k + 1] - 1; i++) cellRange(i, (c) => { gStart[c + 1]++; });
  for (let c = 0; c < gx * gz; c++) gStart[c + 1] += gStart[c];
  const gItems = new Int32Array(gStart[gx * gz]);
  { const fill = gStart.slice(0, gx * gz); for (let k = 0; k < nE; k++) for (let i = ePtsOff[k]; i < ePtsOff[k + 1] - 1; i++) cellRange(i, (c) => { gItems[fill[c]++] = i; }); }
  // node grid (for signals)
  const nodeCell = new Map();
  for (let i = 0; i < nN; i++) { const c = Math.floor((nz[i] - minZ) / CELL) * gx + Math.floor((nx[i] - minX) / CELL); let arr = nodeCell.get(c); if (!arr) nodeCell.set(c, (arr = [])); arr.push(i); }
  function nearestNode(x, z, maxD) {
    const ci = Math.floor((x - minX) / CELL), cj = Math.floor((z - minZ) / CELL);
    let best = -1, bd = maxD * maxD;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const arr = nodeCell.get(j * gx + i); if (!arr) continue;
      for (const n of arr) { const d = (nx[n] - x) ** 2 + (nz[n] - z) ** 2; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }

  const G = {
    version: 1, nN, nE, nA, nPts, strings, districts, idsAreIdx,
    nx, nz, ny, nFlags, nDeg, nOutStart, nOut, nInStart, nIn, nMain: null,
    pts, ptsY: anyY ? ptsY : null, cum, ptEdge, ePtsOff, eA, eB, eLen, eWidth, eLanesF, eLanesB, eKind, eFlags, eName, eRef, eDestF, eDestB, eExit,
    eTurnF, eTurnB, eLimit, eTime, eArcF, eArcB, eId,
    aEdge, aDir, aFrom, aTo, aLen, aTime, aLanes, aKind, aFlags, aBearOut, aBearIn, aZone, aDistrict, aStop,
    grid: { minX, minZ, maxX, maxZ, cell: CELL, nx: gx, nz: gz, start: gStart, items: gItems },
    tStart: null, tTo: null, tType: null, rStart: null, rFrom: null, rT: null, viaBans: null,
    eMask: null, hub: -1, stats: {},
  };

  // ---- controls from point lists (traffic signals, stop signs) ----
  applyControls(G, opts.signals, opts.stops, nearestNode);

  // ---- turn restrictions ----
  const restrictions = [...(src.restrictions || []), ...(opts.restrictions || [])];
  const noMap = new Map(), onlyMap = new Map(); // key fromEdge*nN+via -> Set(toEdge)
  const viaBans = new Map();
  let nRestr = 0;
  for (const r of restrictions) {
    const type = String(r.type || r.kind || r.restriction || r.k || '');
    const from = edgeIdx.get(firstDefined(r.from, r.f)), to = edgeIdx.get(firstDefined(r.to, r.t));
    const viaRaw = firstDefined(r.via, r.v, r.viaNode);
    if (from === undefined || to === undefined) continue;
    if (Array.isArray(viaRaw) || r.viaWay !== undefined || r.viaEdges) { // via-way restriction (no_* only): ban from -> via -> to
      if (!type.startsWith('no')) continue;
      const vias = (r.viaEdges || (Array.isArray(viaRaw) ? viaRaw : [r.viaWay])).map((v) => edgeIdx.get(v)).filter((v) => v !== undefined);
      if (vias.length !== 1) continue;
      for (const va of [eArcF[vias[0]], eArcB[vias[0]]]) { if (va < 0) continue; let l = viaBans.get(va); if (!l) viaBans.set(va, (l = [])); l.push(from, to); }
      nRestr++; continue;
    }
    const via = nodeIdx.get(viaRaw);
    if (via === undefined) continue;
    const key = from * nN + via, map = type.startsWith('only') ? onlyMap : type.startsWith('no') ? noMap : null;
    if (!map) continue;
    let s = map.get(key); if (!s) map.set(key, (s = new Set())); s.add(to); nRestr++;
  }
  G.viaBans = viaBans.size ? viaBans : null;

  // ---- transitions ----
  buildTransitions(G, noMap, onlyMap);
  computeMasks(G);
  G.stats = { nodes: nN, edges: nE, arcs: nA, transitions: G.tTo.length, points: nPts, restrictions: nRestr, signals: countFlag(nFlags, NF.SIGNAL),
    roundaboutEdges: countFlag(eFlags, AF.ROUNDABOUT), buildMs: Math.round((now() - t0) * 10) / 10 };
  G._restr = { noMap, onlyMap }; // kept so controls can be re-applied later (signals arrive asynchronously in the game)
  return G;

  function edgePoint(k, s, out) {
    const p0 = ePtsOff[k], p1 = ePtsOff[k + 1] - 1;
    let lo = p0, hi = p1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const L = cum[hi] - cum[lo] || 1, u = Math.min(1, Math.max(0, (s - cum[lo]) / L));
    out.x = pts[2 * lo] + (pts[2 * hi] - pts[2 * lo]) * u; out.z = pts[2 * lo + 1] + (pts[2 * hi + 1] - pts[2 * lo + 1]) * u;
    return out;
  }

  // Small one-way loops that curve the same way all around are roundabouts / traffic circles.
  function inferRoundabouts() {
    const outOne = new Map(); // node -> one-way edges leaving it
    for (let k = 0; k < nE; k++) {
      if (!(eFlags[k] & AF.ONEWAY) || (eFlags[k] & (AF.LINK | AF.MOTORWAY)) || eLen[k] > 90 || KIND_INFO[eKind[k]].rank >= 8) continue;
      let l = outOne.get(eA[k]); if (!l) outOne.set(eA[k], (l = [])); l.push(k);
    }
    const stack = [];
    const tryFrom = (k0) => {
      stack.length = 0;
      let found = null;
      const dfs = (k, len) => {
        if (found || stack.length > 9 || len > 300) return;
        stack.push(k);
        if (eB[k] === eA[k0] && stack.length >= 2) { found = stack.slice(); stack.pop(); return; }
        const nxt = outOne.get(eB[k]);
        if (nxt) for (const k2 of nxt) { if (k2 !== k0 && !stack.includes(k2)) dfs(k2, len + eLen[k2]); if (found) break; }
        stack.pop();
      };
      dfs(k0, eLen[k0]);
      if (!found) return;
      // shape test: compact and round (area / perimeter^2 of a circle is 0.0796)
      let area = 0, per = 0, cx = 0, cz = 0, n = 0;
      const ring = [];
      for (const k of found) for (let i = ePtsOff[k]; i < ePtsOff[k + 1] - 1; i++) ring.push(pts[2 * i], pts[2 * i + 1]);
      for (let i = 0; i < ring.length; i += 2) {
        const j = (i + 2) % ring.length;
        area += ring[i] * ring[j + 1] - ring[j] * ring[i + 1]; per += Math.hypot(ring[j] - ring[i], ring[j + 1] - ring[i + 1]);
        cx += ring[i]; cz += ring[i + 1]; n++;
      }
      area = Math.abs(area) / 2; cx /= n; cz /= n;
      if (n < 6 || per < 25 || per > 210 || area / (per * per) < 0.066) return;
      let rMax = 0; for (let i = 0; i < ring.length; i += 2) rMax = Math.max(rMax, Math.hypot(ring[i] - cx, ring[i + 1] - cz));
      let rMin = 1e9; for (let i = 0; i < ring.length; i += 2) rMin = Math.min(rMin, Math.hypot(ring[i] - cx, ring[i + 1] - cz));
      if (rMax > 34 || rMin < rMax * 0.62) return;
      // a real roundabout has at least three arms (driveway loops and turnarounds have one or two)
      let arms = 0;
      for (const k of found) { let d = 0; for (let q = 0; q < nE && d < 3; q++) if (eA[q] === eB[k] || eB[q] === eB[k]) d++; if (d >= 3) arms++; }
      if (arms < 3) return;
      for (const k of found) eFlags[k] |= AF.ROUNDABOUT;
    };
    for (let k = 0; k < nE; k++) if ((eFlags[k] & AF.ONEWAY) && !(eFlags[k] & (AF.ROUNDABOUT | AF.LINK | AF.MOTORWAY)) && eLen[k] <= 90 && KIND_INFO[eKind[k]].rank < 8 && outOne.has(eB[k])) tryFrom(k);
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const countFlag = (arr, f) => { let n = 0; for (let i = 0; i < arr.length; i++) if (arr[i] & f) n++; return n; };

// Attach signal / stop-sign point lists to nodes and approach arcs.
function applyControls(G, signals, stops, nearestNode) {
  const { nFlags, nDeg, aEdge, aStop } = G;
  if (signals) for (const s of signals) {
    const n = nearestNode(s[0], s[1], 24);
    if (n >= 0) { nFlags[n] |= NF.SIGNAL; if (nDeg[n] <= 2) nFlags[n] |= NF.CROSSING; }
  }
  if (stops) for (const s of stops) {
    const n = nearestNode(s[0], s[1], 30);
    if (n < 0 || (nFlags[n] & NF.SIGNAL)) continue;
    // the stop sign belongs to the approach whose last meters pass closest to the sign
    let best = -1, bd = 1e9;
    for (let o = G.nInStart[n]; o < G.nInStart[n + 1]; o++) {
      const inArc = G.nIn[o];
      const d = distToEdgeEnd(G, aEdge[inArc], G.aDir[inArc] > 0, s[0], s[1]);
      if (d < bd) { bd = d; best = inArc; }
    }
    if (best >= 0 && bd < 14) aStop[best] = 1;
  }
}
function distToEdgeEnd(G, k, atEnd, x, z) { // distance from (x,z) to the last ~25 m of the edge next to one node
  const { pts, cum, ePtsOff, eLen } = G;
  const p0 = ePtsOff[k], p1 = ePtsOff[k + 1] - 1, L = eLen[k];
  let bd = 1e9;
  for (let i = p0; i < p1; i++) {
    const s0 = cum[i], s1 = cum[i + 1];
    if (atEnd ? s1 < L - 25 : s0 > 25) continue;
    const ax = pts[2 * i], az = pts[2 * i + 1], dx = pts[2 * i + 2] - ax, dz = pts[2 * i + 3] - az, L2 = dx * dx + dz * dz || 1e-9;
    let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
    if (d < bd) bd = d;
  }
  return bd;
}

/** Re-apply signals / stops that arrived after the graph was built, then rebuild the transition table. */
export function setControls(G, signals, stops) {
  const { nx, nz, nN, grid } = G;
  const cell = new Map();
  for (let i = 0; i < nN; i++) { const c = Math.floor((nz[i] - grid.minZ) / grid.cell) * grid.nx + Math.floor((nx[i] - grid.minX) / grid.cell); let a = cell.get(c); if (!a) cell.set(c, (a = [])); a.push(i); }
  const nearestNode = (x, z, maxD) => {
    const ci = Math.floor((x - grid.minX) / grid.cell), cj = Math.floor((z - grid.minZ) / grid.cell);
    let best = -1, bd = maxD * maxD;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) { const arr = cell.get(j * grid.nx + i); if (!arr) continue; for (const n of arr) { const d = (nx[n] - x) ** 2 + (nz[n] - z) ** 2; if (d < bd) { bd = d; best = n; } } }
    return best;
  };
  applyControls(G, signals, stops, nearestNode);
  buildTransitions(G, G._restr?.noMap || new Map(), G._restr?.onlyMap || new Map());
  G.stats.signals = countFlag(G.nFlags, NF.SIGNAL); G.stats.transitions = G.tTo.length;
  return G;
}

function buildTransitions(G, noMap, onlyMap) {
  const { nN, nA, nFlags, nDeg, nOutStart, nOut, aEdge, aTo, aFrom, aKind, aFlags, aLanes, aBearIn, aBearOut, aStop, eName, eRef, eLanesF, eLanesB, aDir } = G;
  const tStart = new Uint32Array(nA + 1);
  const toL = [], typeL = [];
  const cand = [], candAng = [];
  for (let a = 0; a < nA; a++) {
    const v = aTo[a], ea = aEdge[a], ka = aKind[a], ra = KIND_INFO[ka].rank, fa = aFlags[a];
    const o0 = nOutStart[v], o1 = nOutStart[v + 1];
    const key = ea * nN + v, noS = noMap.get(key), onlyS = onlyMap.get(key);
    cand.length = 0; candAng.length = 0;
    let uturn = -1;
    for (let o = o0; o < o1; o++) {
      const b = nOut[o], eb = aEdge[b];
      if (eb === ea && aDir[b] !== aDir[a]) { uturn = b; continue; } // reversal on the same edge
      if (eb === ea && aFrom[b] === aTo[b] && b === a && (o1 - o0) > 1) { /* loop edge re-entered: allowed */ }
      if (noS && noS.has(eb)) continue;
      if (onlyS && !onlyS.has(eb)) continue;
      cand.push(b); candAng.push(-wrapPi(aBearOut[b] - aBearIn[a])); // + = right
    }
    // other approaches at this node, for right-of-way inference
    let bestOtherRank = 99, otherCount = 0;
    for (let o = o0; o < o1; o++) { const b = nOut[o]; if (aEdge[b] === ea) continue; otherCount++; const r = KIND_INFO[aKind[b]].rank; if (r < bestOtherRank) bestOtherRank = r; }
    // incoming one-way edges are not in nOut: approximate with the degree
    const deg = nDeg[v];
    // natural continuation: same name / ref and the straightest
    let cont = -1, contAbs = 9;
    for (let i = 0; i < cand.length; i++) {
      const b = cand[i], eb = aEdge[b], ang = Math.abs(candAng[i]);
      const same = (eName[ea] >= 0 && eName[ea] === eName[eb]) || (eRef[ea] >= 0 && eRef[ea] === eRef[eb]);
      if (same && ang < 0.9 && ang < contAbs) { cont = i; contAbs = ang; }
    }
    if (cand.length === 1 && Math.abs(candAng[0]) < 1.0 && deg <= 2) cont = 0;
    let hasStraight = cont >= 0;
    if (!hasStraight) for (let i = 0; i < cand.length; i++) if (Math.abs(candAng[i]) < 0.5) { hasStraight = true; break; }
    // control for this approach
    let ctl = TC.NONE;
    const isRamp = (fa & (AF.LINK | AF.MOTORWAY)) !== 0;
    if (nFlags[v] & NF.SIGNAL) ctl = TC.SIGNAL;
    else if (aStop[a]) ctl = TC.STOP;
    else if (nFlags[v] & NF.ALLWAY) ctl = TC.ALLWAY;
    else if (deg >= 3 && !isRamp && !(fa & AF.ROUNDABOUT)) {
      if (ra > bestOtherRank) ctl = TC.STOP; // minor road meets a bigger one
      else if (!hasStraight && otherCount >= 2) ctl = TC.STOP; // stem of a T
      else if (ra === bestOtherRank && deg >= 4 && ra >= 4) ctl = TC.ALLWAY; // equal small streets crossing
    }
    for (let i = 0; i < cand.length; i++) {
      const b = cand[i], ang = candAng[i], abs = Math.abs(ang), fb = aFlags[b], kb = aKind[b];
      let geom;
      if (i === cont || abs < 0.38) geom = TG.STRAIGHT;
      else if (abs < 0.87) geom = ang > 0 ? TG.SLIGHT_RIGHT : TG.SLIGHT_LEFT;
      else if (abs < 2.27) geom = ang > 0 ? TG.RIGHT : TG.LEFT;
      else geom = ang > 0 ? TG.SHARP_RIGHT : TG.SHARP_LEFT;
      let c = ctl;
      if (deg <= 2 && !(nFlags[v] & NF.SIGNAL)) c = TC.NONE;
      if ((fa & AF.ROUNDABOUT) && (fb & AF.ROUNDABOUT)) { c = TC.NONE; geom = TG.STRAIGHT; }
      else if (fb & AF.ROUNDABOUT) { c = TC.STOP; geom = TG.SLIGHT_RIGHT; } // yield on entry
      let t = geom | (c << 3);
      if (KIND_INFO[kb].rank >= 8 && ra < 8) t |= T_ENTER_MINOR;
      if ((fb & AF.RESTRICTED) && !(fa & AF.RESTRICTED)) t |= T_ENTER_MINOR;
      if (((fa & AF.LINK) && (kb === K.motorway || kb === K.trunk)) || ((fb & AF.LINK) && (ka === K.motorway || ka === K.trunk))) t |= T_RAMP;
      if (geom >= TG.SLIGHT_LEFT && geom <= TG.SHARP_LEFT && geom !== TG.SLIGHT_LEFT && !(fa & AF.ONEWAY)) {
        const opp = aDir[a] > 0 ? eLanesB[ea] : eLanesF[ea];
        if (opp >= 2 || ra <= 2) t |= T_ACROSS;
      }
      toL.push(b); typeL.push(t);
    }
    // U-turns: only where a real driver could make one
    if (uturn >= 0) {
      const banned = (noS && noS.has(ea)) || (onlyS && !onlyS.has(ea));
      if (cand.length === 0) { toL.push(uturn); typeL.push(TG.UTURN | T_RAMP); } // dead end: turn around
      else if (!banned && !(fa & (AF.MOTORWAY | AF.LINK | AF.ROUNDABOUT | AF.TUNNEL)) && deg >= 3) { toL.push(uturn); typeL.push(TG.UTURN | (ctl << 3)); }
    }
    tStart[a + 1] = toL.length;
  }
  const nT = toL.length;
  const tTo = Int32Array.from(toL), tType = Uint8Array.from(typeL);
  // reverse table
  const rStart = new Uint32Array(nA + 1);
  for (let t = 0; t < nT; t++) rStart[tTo[t] + 1]++;
  for (let a = 0; a < nA; a++) rStart[a + 1] += rStart[a];
  const rFrom = new Int32Array(nT), rT = new Int32Array(nT);
  { const fill = rStart.slice(0, nA); for (let a = 0; a < nA; a++) for (let t = tStart[a]; t < tStart[a + 1]; t++) { const p = fill[tTo[t]]++; rFrom[p] = a; rT[p] = t; } }
  G.tStart = tStart; G.tTo = tTo; G.tType = tType; G.rStart = rStart; G.rFrom = rFrom; G.rT = rT;
}

// Main strongly connected part of the network: bit 1 = a trip can start on this edge, bit 2 = a trip can end on it.
function computeMasks(G) {
  const { nN, nA, nE, aFrom, aTo, aKind, nOutStart, nOut, eArcF, eArcB } = G;
  const inStart = G.nInStart, inArc = G.nIn;
  const queue = new Int32Array(nN);
  const bfs = (start, fwd, mark) => {
    let h = 0, t = 0, n = 0; mark.fill(0); mark[start] = 1; queue[t++] = start;
    while (h < t) {
      const u = queue[h++]; n++;
      if (fwd) { for (let o = nOutStart[u]; o < nOutStart[u + 1]; o++) { const v = aTo[nOut[o]]; if (!mark[v]) { mark[v] = 1; queue[t++] = v; } } }
      else { for (let o = inStart[u]; o < inStart[u + 1]; o++) { const v = aFrom[inArc[o]]; if (!mark[v]) { mark[v] = 1; queue[t++] = v; } } }
    }
    return n;
  };
  let bestF = null, bestB = null, bestN = -1, hub = -1;
  const seeds = [];
  for (let a = 0; a < nA && seeds.length < 400; a += Math.max(1, (nA / 400) | 0)) seeds.push(a);
  seeds.sort((p, q) => KIND_INFO[aKind[p]].rank - KIND_INFO[aKind[q]].rank);
  for (let s = 0; s < Math.min(8, seeds.length); s++) {
    const start = aFrom[seeds[s]], F = new Uint8Array(nN), B = new Uint8Array(nN);
    bfs(start, true, F); bfs(start, false, B);
    let n = 0; for (let i = 0; i < nN; i++) if (F[i] && B[i]) n++;
    if (n > bestN) { bestN = n; bestF = F; bestB = B; hub = start; }
    if (n > nN * 0.5) break;
  }
  const eMask = new Uint8Array(nE);
  if (bestF) for (let k = 0; k < nE; k++) {
    for (const a of [eArcF[k], eArcB[k]]) {
      if (a < 0) continue;
      if (bestB[aTo[a]] && bestF[aFrom[a]]) eMask[k] |= 3; // fully inside the main part
      else { if (bestB[aTo[a]]) eMask[k] |= 1; if (bestF[aFrom[a]]) eMask[k] |= 2; }
    }
  }
  const nMain = new Uint8Array(nN);
  if (bestF) for (let i = 0; i < nN; i++) nMain[i] = bestF[i] && bestB[i] ? 1 : 0;
  G.eMask = eMask; G.hub = hub; G.mainNodes = bestN; G.nMain = nMain;
}

// ------------------------------------------------------------------------------------------------ queries on G

/** Point at distance s (m from node a) along edge k. Writes {x, z, dx, dz, y, i} (i = point index of the segment start). */
export function edgePointAt(G, k, s, out = {}) {
  const { pts, cum, ePtsOff, ptsY } = G;
  const p0 = ePtsOff[k], p1 = ePtsOff[k + 1] - 1;
  let lo = p0, hi = p1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const L = cum[hi] - cum[lo] || 1e-6, u = Math.min(1, Math.max(0, (s - cum[lo]) / L));
  const dx = pts[2 * hi] - pts[2 * lo], dz = pts[2 * hi + 1] - pts[2 * lo + 1], dl = Math.hypot(dx, dz) || 1;
  out.x = pts[2 * lo] + dx * u; out.z = pts[2 * lo + 1] + dz * u; out.dx = dx / dl; out.dz = dz / dl;
  out.y = ptsY ? ptsY[lo] + (ptsY[hi] - ptsY[lo]) * u : 0; out.i = lo;
  return out;
}

const SNAP_MOTORWAY_BIAS = 18; // m: a destination click next to a freeway prefers the surface street

/**
 * Nearest drivable edge.
 * opts: maxDist (m, default 400), y (player height: prefers the deck at that height), need (1 = can start here, 2 = can end here,
 *       0 = any), avoidFreeway (bias against motorways and ramps: for destinations), heading (prefers an edge aligned with it),
 *       filter(edgeIdx) -> bool
 * returns { edge, s, t, x, z, dist, seg, u, y } or null
 */
export function snap(G, x, z, opts = {}, out = {}) {
  const { grid, pts, cum, ptEdge, ptsY, eMask, eFlags, eKind, eLen, ePtsOff } = G;
  const maxDist = opts.maxDist ?? 400, need = opts.need ?? 0, y = opts.y, hasY = y !== undefined && y !== null && ptsY;
  const hx = opts.heading !== undefined && opts.heading !== null ? Math.sin(opts.heading) : 0, hz = opts.heading !== undefined && opts.heading !== null ? Math.cos(opts.heading) : 0;
  const useH = hx !== 0 || hz !== 0;
  const ci = Math.floor((x - grid.minX) / grid.cell), cj = Math.floor((z - grid.minZ) / grid.cell);
  const maxR = Math.ceil(maxDist / grid.cell) + 1;
  let best = -1, bScore = maxDist, bU = 0, bD = 0;
  for (let r = 0; r <= maxR; r++) {
    if (best >= 0 && (r - 1) * grid.cell > bScore) break;
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= grid.nz) continue;
      const rowEdge = j === cj - r || j === cj + r;
      for (let i = ci - r; i <= ci + r; i += rowEdge ? 1 : (2 * r || 1)) {
        if (i < 0 || i >= grid.nx) continue;
        const c = j * grid.nx + i;
        for (let q = grid.start[c], qe = grid.start[c + 1]; q < qe; q++) {
          const p = grid.items[q], k = ptEdge[p];
          if (need && (eMask[k] & need) !== need) continue;
          if (opts.filter && !opts.filter(k)) continue;
          const ax = pts[2 * p], az = pts[2 * p + 1], dx = pts[2 * p + 2] - ax, dz = pts[2 * p + 3] - az, L2 = dx * dx + dz * dz;
          let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
          const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
          let score = d;
          if (opts.avoidFreeway && (eFlags[k] & (AF.MOTORWAY | AF.LINK))) score += SNAP_MOTORWAY_BIAS;
          if (opts.avoidFreeway && (eFlags[k] & AF.RESTRICTED)) score += 6;
          if (hasY) score += Math.abs((ptsY[p] + (ptsY[p + 1] - ptsY[p]) * u) - y) * 3;
          if (useH && d < 25) { // moving vehicle: an edge running along the heading beats a crossing one at a junction
            const l = Math.sqrt(L2) || 1, al = Math.abs((dx * hx + dz * hz) / l);
            score += (1 - al) * 6;
            if ((eFlags[k] & AF.ONEWAY) && (dx * hx + dz * hz) < -0.5 * l) score += 5;
          }
          if (score < bScore) { bScore = score; best = p; bU = u; bD = d; }
        }
      }
    }
  }
  if (best < 0) return null;
  const k = ptEdge[best];
  const segL = cum[best + 1] - cum[best];
  out.edge = k; out.seg = best - ePtsOff[k]; out.u = bU; out.s = cum[best] + segL * bU; out.t = out.s / eLen[k];
  out.x = pts[2 * best] + (pts[2 * best + 2] - pts[2 * best]) * bU; out.z = pts[2 * best + 1] + (pts[2 * best + 3] - pts[2 * best + 1]) * bU;
  out.dist = bD; out.y = ptsY ? ptsY[best] + (ptsY[best + 1] - ptsY[best]) * bU : 0;
  const l = Math.hypot(pts[2 * best + 2] - pts[2 * best], pts[2 * best + 3] - pts[2 * best + 1]) || 1;
  out.dx = (pts[2 * best + 2] - pts[2 * best]) / l; out.dz = (pts[2 * best + 3] - pts[2 * best + 1]) / l;
  out.kind = KINDS[eKind[k]];
  return out;
}

/** All edges with a point within r of (x, z): calls cb(edgeIdx). Used by traffic incidents and the search area. */
export function edgesNear(G, x, z, r, cb) {
  const { grid, pts, ptEdge } = G;
  const i0 = Math.max(0, Math.floor((x - r - grid.minX) / grid.cell)), i1 = Math.min(grid.nx - 1, Math.floor((x + r - grid.minX) / grid.cell));
  const j0 = Math.max(0, Math.floor((z - r - grid.minZ) / grid.cell)), j1 = Math.min(grid.nz - 1, Math.floor((z + r - grid.minZ) / grid.cell));
  const seen = new Set();
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = j * grid.nx + i;
    for (let q = grid.start[c]; q < grid.start[c + 1]; q++) {
      const p = grid.items[q], k = ptEdge[p];
      if (seen.has(k)) continue;
      const ax = pts[2 * p], az = pts[2 * p + 1], dx = pts[2 * p + 2] - ax, dz = pts[2 * p + 3] - az, L2 = dx * dx + dz * dz || 1e-9;
      let u = ((x - ax) * dx + (z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      if ((x - ax - dx * u) ** 2 + (z - az - dz * u) ** 2 <= r * r) { seen.add(k); cb(k); }
    }
  }
}

export const arcName = (G, a) => { const i = G.eName[G.aEdge[a]]; return i >= 0 ? G.strings[i] : null; };
export const arcRef = (G, a) => { const i = G.eRef[G.aEdge[a]]; return i >= 0 ? G.strings[i] : null; };
export const str = (G, i) => (i >= 0 ? G.strings[i] : null);

/** Strip the fields that cannot be structured-cloned cheaply / are not needed in the worker. */
export function transferable(G) { const o = { ...G }; return o; }
