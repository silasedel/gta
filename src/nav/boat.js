// SOUTHLINE V2 navigation: the water router for boats.
// A cost grid over all open water: boats keep off the shore (slow no-wake water near land, so a channel's middle is the fast
// lane), prefer the deep dredged channels, and pass under bridges only where the deck clears the boat's height. Low fixed
// bridges block tall boats; drawbridges open at a time cost.

import { AF, edgesNear, str } from './graph.js';
import { cardinal, roadLabel, shortName } from './maneuvers.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export const BOAT_PROFILES = {
  boat: { cruise: 13, airDraft: 2.6, draft: 0.6 }, // center console / speedboat
  jetski: { cruise: 15, airDraft: 1.6, draft: 0.3 },
  yacht: { cruise: 9, airDraft: 7.5, draft: 1.8 },
  sailboat: { cruise: 4, airDraft: 14, draft: 1.6 },
  police: { cruise: 17, airDraft: 3, draft: 0.7 },
  airboat: { cruise: 12, airDraft: 2.6, draft: 0.15 },
};

/**
 * Sample the water into a grid. Runs on the main thread (needs the city rasters), in row slices if `slice` is given.
 * @param o { bounds:{minX,maxX,minZ,maxZ}, isWater(x,z), depthAt?(x,z) -> m, G? (car graph, for bridge decks), seaLevel?, cell? }
 * @returns grid { cell, minX, minZ, nx, nz, shore:Uint8 (cells to the nearest land, 0 = land, capped 12), depth:Uint8 (dm, capped 250),
 *                 clear:Uint8 (bridge clearance in dm above the water, 255 = open sky), bridge:Int32 (car edge index of the deck above, -1) }
 */
export async function buildWaterGrid(o, slice = null) {
  const t0 = now();
  const cell = o.cell || 16,
    B = o.bounds;
  const minX = Math.floor(B.minX / cell) * cell,
    minZ = Math.floor(B.minZ / cell) * cell;
  const nx = Math.ceil((B.maxX - minX) / cell),
    nz = Math.ceil((B.maxZ - minZ) / cell),
    N = nx * nz;
  const shore = new Uint8Array(N),
    depth = new Uint8Array(N),
    clear = new Uint8Array(N).fill(255),
    bridge = new Int32Array(N).fill(-1),
    lift = new Uint8Array(N);
  let tSlice = now(),
    nWater = 0;
  for (let j = 0; j < nz; j++) {
    const z = minZ + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const x = minX + (i + 0.5) * cell;
      // a cell is navigable when its center and its four quarter points are water (keeps hulls off seawalls)
      const q = cell * 0.3;
      if (
        o.isWater(x, z) &&
        o.isWater(x - q, z - q) &&
        o.isWater(x + q, z - q) &&
        o.isWater(x - q, z + q) &&
        o.isWater(x + q, z + q)
      ) {
        shore[j * nx + i] = 255;
        nWater++;
        if (o.depthAt) {
          const d = o.depthAt(x, z);
          depth[j * nx + i] = Math.max(1, Math.min(250, Math.round(d * 10)));
        } else depth[j * nx + i] = 50;
      }
    }
    if (slice && now() - tSlice > 5) {
      await slice();
      tSlice = now();
    }
  }
  // distance to land in cells (two-pass chamfer, capped)
  const INF = 255;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (!shore[c]) continue;
      let d = INF;
      if (i > 0) d = Math.min(d, shore[c - 1] + 1);
      if (j > 0) d = Math.min(d, shore[c - nx] + 1);
      if (i > 0 && j > 0) d = Math.min(d, shore[c - nx - 1] + 1);
      if (i < nx - 1 && j > 0) d = Math.min(d, shore[c - nx + 1] + 1);
      shore[c] = Math.min(INF, d);
    }
  for (let j = nz - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      const c = j * nx + i;
      if (!shore[c]) continue;
      let d = shore[c];
      if (i < nx - 1) d = Math.min(d, shore[c + 1] + 1);
      if (j < nz - 1) d = Math.min(d, shore[c + nx] + 1);
      if (i < nx - 1 && j < nz - 1) d = Math.min(d, shore[c + nx + 1] + 1);
      if (i > 0 && j < nz - 1) d = Math.min(d, shore[c + nx - 1] + 1);
      shore[c] = Math.min(12, d);
    }
  // (the world edge is open sea, not a wall: out-of-range neighbors are simply ignored above)
  // bridge decks over water
  const G = o.G,
    sea = o.seaLevel ?? -0.12;
  let nBridge = 0;
  if (G)
    for (let k = 0; k < G.nE; k++) {
      const fl = G.eFlags[k];
      if (!(fl & AF.BRIDGE) && !(G.ptsY && hasY(G, k))) continue;
      const hw = G.eWidth[k] / 2 + cell * 0.5;
      for (let p = G.ePtsOff[k]; p < G.ePtsOff[k + 1] - 1; p++) {
        const ax = G.pts[2 * p],
          az = G.pts[2 * p + 1],
          bx = G.pts[2 * p + 2],
          bz = G.pts[2 * p + 3];
        const ya = G.ptsY ? G.ptsY[p] : 0,
          yb = G.ptsY ? G.ptsY[p + 1] : 0;
        const L = Math.hypot(bx - ax, bz - az),
          steps = Math.max(1, Math.ceil(L / (cell * 0.5)));
        for (let s = 0; s <= steps; s++) {
          const u = s / steps,
            x = ax + (bx - ax) * u,
            z = az + (bz - az) * u,
            y = ya + (yb - ya) * u;
          const i0 = Math.floor((x - hw - minX) / cell),
            i1 = Math.floor((x + hw - minX) / cell),
            j0 = Math.floor((z - hw - minZ) / cell),
            j1 = Math.floor((z + hw - minZ) / cell);
          for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++) {
              if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
              const c = j * nx + i;
              if (!shore[c]) continue;
              // clearance under the girders; a movable span is stored as open (it lifts), flagged through the bridge edge
              const cl = Math.max(0, Math.min(250, Math.round((y - sea - 1.3) * 10)));
              if (cl < clear[c]) {
                if (clear[c] === 255) nBridge++;
                clear[c] = cl;
                bridge[c] = k;
                lift[c] = fl & AF.MOVABLE ? 1 : 0;
              }
            }
        }
      }
    }
  return {
    cell,
    minX,
    minZ,
    nx,
    nz,
    shore,
    depth,
    clear,
    bridge,
    lift,
    stats: { cells: N, water: nWater, bridgeCells: nBridge, buildMs: Math.round(now() - t0) },
  };
}
function hasY(G, k) {
  for (let p = G.ePtsOff[k]; p < G.ePtsOff[k + 1]; p++) if (G.ptsY[p] > 1.5) return true;
  return false;
}

/** Coarse water mask for other modules (0 = water) */
export function waterMask(grid) {
  const b = new Uint8Array(grid.shore.length);
  for (let i = 0; i < b.length; i++) b[i] = grid.shore[i] ? 0 : 1;
  return {
    cell: grid.cell,
    minX: grid.minX,
    minZ: grid.minZ,
    nx: grid.nx,
    nz: grid.nz,
    blocked: b,
  };
}

class Heap {
  constructor(cap = 8192) {
    this.k = new Float64Array(cap);
    this.v = new Int32Array(cap);
    this.n = 0;
  }
  push(key, val) {
    if (this.n === this.k.length) {
      const k2 = new Float64Array(this.n * 2);
      k2.set(this.k);
      this.k = k2;
      const v2 = new Int32Array(this.n * 2);
      v2.set(this.v);
      this.v = v2;
    }
    const k = this.k,
      v = this.v;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop() {
    const k = this.k,
      v = this.v,
      top = v[0];
    this.topKey = k[0];
    const n = --this.n;
    if (n > 0) {
      const key = k[n],
        val = v[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = key;
      v[i] = val;
    }
    return top;
  }
}

/**
 * Fastest water route. from / to: { x, z } (snapped to the nearest navigable water).
 * opts: { profile: name in BOAT_PROFILES or { cruise, airDraft, draft }, movable?: Uint8Array per car edge (1 = drawbridge) }
 * returns { cells:Int32Array, cost (s), ms, expanded, from, to, snapFrom, snapTo } or null
 */
export function boatRoute(grid, from, to, opts = {}) {
  const t0 = now();
  const P =
    typeof opts.profile === 'object' && opts.profile
      ? { ...BOAT_PROFILES.boat, ...opts.profile }
      : BOAT_PROFILES[opts.profile] || BOAT_PROFILES.boat;
  const { cell, minX, minZ, nx, nz, shore, depth, clear, lift } = grid,
    N = nx * nz;
  if (!grid._g) {
    grid._g = new Float32Array(N);
    grid._p = new Int32Array(N);
    grid._m = new Uint32Array(N);
    grid._d = new Uint32Array(N);
    grid._stamp = 0;
    grid._heap = new Heap();
  }
  const g = grid._g,
    pred = grid._p,
    mark = grid._m,
    done = grid._d,
    heap = grid._heap;
  heap.n = 0;
  const stamp = ++grid._stamp;
  const minDepth = Math.round((P.draft + 0.25) * 10),
    air = Math.round(P.airDraft * 10);
  const ok = (c) => shore[c] > 0 && depth[c] >= minDepth && (clear[c] >= air || lift[c] === 1);
  const snapCell = (p) => {
    const ci = Math.floor((p.x - minX) / cell),
      cj = Math.floor((p.z - minZ) / cell);
    let best = -1,
      bd = Infinity;
    for (let r = 0; r < 80 && (best < 0 || r <= Math.sqrt(bd) / cell + 1); r++)
      for (let j = cj - r; j <= cj + r; j++)
        for (let i = ci - r; i <= ci + r; i += j === cj - r || j === cj + r ? 1 : 2 * r || 1) {
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const c = j * nx + i;
          if (!ok(c)) continue;
          const d = (minX + (i + 0.5) * cell - p.x) ** 2 + (minZ + (j + 0.5) * cell - p.z) ** 2;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
    return best;
  };
  const s = snapCell(from),
    e = snapCell(to);
  if (s < 0 || e < 0) return null;
  const ei = e % nx,
    ej = (e / nx) | 0;
  // seconds per meter by distance to land: idle speed by the docks, then up on plane in open water
  const pace = new Float32Array(13);
  for (let d = 0; d <= 12; d++) {
    const v =
      d <= 1
        ? Math.min(P.cruise, 3.2)
        : d === 2
          ? Math.min(P.cruise, 6)
          : d === 3
            ? P.cruise * 0.8
            : d <= 5
              ? P.cruise * 0.94
              : P.cruise;
    pace[d] = 1 / v;
  }
  const vInv = (1 / P.cruise) * 0.9; // the channel bonus below makes 0.9 the admissible bound
  const h = (c) => {
    const di = Math.abs((c % nx) - ei),
      dj = Math.abs(((c / nx) | 0) - ej);
    return (Math.max(di, dj) + 0.4142 * Math.min(di, dj)) * cell * vInv;
  };
  g[s] = 0;
  pred[s] = -1;
  mark[s] = stamp;
  heap.push(h(s), s);
  let expanded = 0,
    found = false;
  const DI = [1, -1, 0, 0, 1, 1, -1, -1],
    DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  while (heap.n) {
    const c = heap.pop();
    if (done[c] === stamp) continue;
    done[c] = stamp;
    expanded++;
    if (c === e) {
      found = true;
      break;
    }
    const ci = c % nx,
      cj = (c / nx) | 0,
      gc = g[c];
    for (let q = 0; q < 8; q++) {
      const i = ci + DI[q],
        j = cj + DJ[q];
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const v = j * nx + i;
      if (done[v] === stamp || !ok(v)) continue;
      if (q >= 4 && (!ok(cj * nx + i) || !ok(j * nx + ci))) continue; // no cutting corners around land
      let w = (q >= 4 ? 1.4142 : 1) * cell * (pace[shore[c]] + pace[shore[v]]) * 0.5;
      if (depth[v] >= 80) w *= 0.92; // marked deep channel
      if (clear[v] < air) w += 25; // waiting for a drawbridge
      const nv = gc + w;
      if (mark[v] !== stamp || nv < g[v]) {
        g[v] = nv;
        pred[v] = c;
        mark[v] = stamp;
        heap.push(nv + h(v), v);
      }
    }
  }
  if (!found) return null;
  const rev = [];
  for (let c = e; c >= 0; c = pred[c]) rev.push(c);
  return {
    cells: Int32Array.from(rev.reverse()),
    cost: g[e],
    expanded,
    ms: now() - t0,
    from: { x: from.x, z: from.z },
    to: { x: to.x, z: to.z },
    profile: P,
  };
}

/** Route object for a boat route: smoothed line, bridge and waterway call-outs. nameAt(x, z) gives the water body name (districtAt). */
export function assembleBoat(grid, G, raw, opts = {}) {
  const { cell, minX, minZ, nx, shore, clear, bridge } = grid,
    cells = raw.cells,
    P = raw.profile;
  const cx = (c) => minX + ((c % nx) + 0.5) * cell,
    cz = (c) => minZ + (((c / nx) | 0) + 0.5) * cell;
  const air = Math.round(P.airDraft * 10);
  // string pulling: drop cells while the straight line between kept ones stays in equally open water
  const los = (a, b) => {
    const ax = cx(a),
      az = cz(a),
      bx = cx(b),
      bz = cz(b),
      L = Math.hypot(bx - ax, bz - az),
      steps = Math.ceil(L / (cell * 0.5));
    const need = Math.min(3, shore[a], shore[b]);
    for (let s = 1; s < steps; s++) {
      const u = s / steps,
        i = Math.floor((ax + (bx - ax) * u - minX) / cell),
        j = Math.floor((az + (bz - az) * u - minZ) / cell),
        c = j * nx + i;
      if (shore[c] < need || (clear[c] < air && !grid.lift[c])) return false;
    }
    return true;
  };
  const keep = [0];
  {
    let a = 0;
    while (a < cells.length - 1) {
      let b = Math.min(cells.length - 1, a + 60);
      while (b > a + 1 && !los(cells[a], cells[b])) b--;
      keep.push(b);
      a = b;
    }
  }
  let px = [raw.from.x, ...keep.map((i) => cx(cells[i])), raw.to.x],
    pz = [raw.from.z, ...keep.map((i) => cz(cells[i])), raw.to.z];
  // keep the first / last point exact, round the corners in between (two Chaikin passes)
  for (let pass = 0; pass < 2; pass++) {
    const qx = [px[0]],
      qz = [pz[0]];
    for (let i = 0; i < px.length - 1; i++) {
      const l = Math.hypot(px[i + 1] - px[i], pz[i + 1] - pz[i]);
      if (l < 6 || i === 0 || i === px.length - 2) {
        if (i > 0) {
          qx.push(px[i]);
          qz.push(pz[i]);
        }
        continue;
      }
      const cut = Math.min(0.25, 40 / l);
      qx.push(px[i] + (px[i + 1] - px[i]) * cut, px[i] + (px[i + 1] - px[i]) * (1 - cut));
      qz.push(pz[i] + (pz[i + 1] - pz[i]) * cut, pz[i] + (pz[i + 1] - pz[i]) * (1 - cut));
    }
    qx.push(px[px.length - 1]);
    qz.push(pz[pz.length - 1]);
    px = qx;
    pz = qz;
  }
  const n = px.length,
    line = new Float32Array(n * 2),
    cum = new Float32Array(n),
    arcT = new Float64Array(n),
    arcD = new Float64Array(n),
    arcAt = new Uint32Array(n);
  let minBX = Infinity,
    minBZ = Infinity,
    maxBX = -Infinity,
    maxBZ = -Infinity;
  const paceAt = (x, z) => {
    const i = Math.floor((x - minX) / cell),
      j = Math.floor((z - minZ) / cell);
    const d = i >= 0 && j >= 0 && i < nx && j < grid.nz ? shore[j * nx + i] : 12;
    const v =
      d <= 1
        ? Math.min(P.cruise, 3.2)
        : d === 2
          ? Math.min(P.cruise, 6)
          : d === 3
            ? P.cruise * 0.8
            : d <= 5
              ? P.cruise * 0.94
              : P.cruise;
    return 1 / v;
  };
  for (let i = 0; i < n; i++) {
    line[2 * i] = px[i];
    line[2 * i + 1] = pz[i];
    arcAt[i] = i;
    if (i) {
      const l = Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
      cum[i] = cum[i - 1] + l;
      arcT[i] = arcT[i - 1] + l * (paceAt(px[i], pz[i]) + paceAt(px[i - 1], pz[i - 1])) * 0.5;
    }
    arcD[i] = cum[i];
    if (px[i] < minBX) minBX = px[i];
    if (px[i] > maxBX) maxBX = px[i];
    if (pz[i] < minBZ) minBZ = pz[i];
    if (pz[i] > maxBZ) maxBZ = pz[i];
  }
  // call-outs: bridges passed under and named waters entered
  const mans = [];
  const h0 = Math.atan2(px[Math.min(n - 1, 2)] - px[0], pz[Math.min(n - 1, 2)] - pz[0]);
  const WATER_NAME =
    /\b(Bay|Ocean|River|Cut|Channel|Canal|Lake|Sound|Harbor|Inlet|Lagoon|Creek|Marina|Pass|Strait|Gulf|Basin|Waterway|Cove|Bight|Reef|Flats)\b/;
  const rawName = opts.nameAt || (() => null);
  const nameAt = (x, z) => {
    const w = rawName(x, z);
    return w && WATER_NAME.test(w) ? w : null;
  };
  let water = nameAt(px[Math.min(1, n - 1)], pz[Math.min(1, n - 1)]);
  mans.push({
    type: 'depart',
    modifier: 'straight',
    at: 0,
    arcIndex: 0,
    x: px[0],
    z: pz[0],
    name: water,
    text: `Head ${cardinal(h0)}${water ? ` on ${water}` : ''}`,
    short: water || 'Cast off',
    side: 0,
    lanes: null,
    bearing: h0,
  });
  let lastBridge = -2,
    lastBridgeAt = -1e9;
  for (let i = 1; i < n - 1; i++) {
    const ci = Math.floor((px[i] - minX) / cell),
      cj = Math.floor((pz[i] - minZ) / cell),
      c = cj * nx + ci;
    const bk = c >= 0 && c < bridge.length ? bridge[c] : -1;
    if (bk >= 0 && G) {
      const nm = str(G, G.eName[bk]) || str(G, G.eRef[bk]);
      if ((nm !== lastBridge || cum[i] - lastBridgeAt > 400) && cum[i] - lastBridgeAt > 60) {
        const low = clear[c] < air;
        mans.push({
          type: 'bridge',
          modifier: 'straight',
          at: cum[i],
          arcIndex: i,
          x: px[i],
          z: pz[i],
          name: nm ? roadLabel(nm) : null,
          text: low
            ? `Wait for the ${nm ? roadLabel(nm) + ' ' : ''}drawbridge to open`
            : `Pass under ${nm ? roadLabel(nm) : 'the bridge'}`,
          short: nm ? shortName(nm) : 'Bridge',
          side: 0,
          lanes: null,
          clearance: clear[c] / 10,
        });
        lastBridge = nm;
        lastBridgeAt = cum[i];
      }
      continue;
    }
    const w = nameAt(px[i], pz[i]);
    if (w && w !== water) {
      // only announce waters we stay on for a while
      let j = i,
        d = 0;
      while (j < n - 1 && d < 220 && nameAt(px[j], pz[j]) === w) {
        d += cum[j + 1] - cum[j];
        j++;
      }
      if (d >= 220 || j >= n - 1) {
        mans.push({
          type: 'enter',
          modifier: 'straight',
          at: cum[i],
          arcIndex: i,
          x: px[i],
          z: pz[i],
          name: w,
          text: `Enter ${w}`,
          short: w,
          side: 0,
          lanes: null,
        });
        water = w;
      }
    }
    // big course changes in open water
    if (i > 1 && i < n - 2) {
      const a0 = Math.atan2(px[i] - px[i - 1], pz[i] - pz[i - 1]),
        a1 = Math.atan2(px[i + 1] - px[i], pz[i + 1] - pz[i]);
      let a = a1 - a0;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      const last = mans[mans.length - 1];
      if (Math.abs(a) > 0.5 && cum[i] - last.at > 250 && cum[i + 1] - cum[i] > 60)
        mans.push({
          type: 'turn',
          modifier: a > 0 ? 'left' : 'right',
          at: cum[i],
          arcIndex: i,
          x: px[i],
          z: pz[i],
          name: null,
          text: `Come ${a > 0 ? 'to port (left)' : 'to starboard (right)'}, heading ${cardinal(a1)}`,
          short: cardinal(a1),
          side: a > 0 ? -1 : 1,
          lanes: null,
          angle: -a,
        });
    }
  }
  mans.push({
    type: 'arrive',
    modifier: 'straight',
    at: cum[n - 1],
    arcIndex: n - 1,
    x: px[n - 1],
    z: pz[n - 1],
    name: opts.destName || null,
    text: opts.destName ? `Arrive at ${opts.destName}` : 'You have arrived',
    short: opts.destName || 'Destination',
    side: 0,
    lanes: null,
  });
  for (let i = 0; i < mans.length; i++) {
    mans[i].index = i;
    mans[i].length = (i + 1 < mans.length ? mans[i + 1].at : cum[n - 1]) - mans[i].at;
    mans[i].time = arcT[Math.min(n - 1, mans[i].arcIndex)];
  }
  return {
    mode: 'boat',
    profile: opts.profileName || 'boat',
    arcs: new Int32Array(n - 1),
    from: { ...raw.from },
    to: { ...raw.to },
    destName: opts.destName || null,
    length: cum[n - 1],
    time: arcT[n - 1],
    cost: raw.cost,
    line,
    cum,
    lineLength: cum[n - 1],
    arcAt,
    arcD,
    arcT,
    maneuvers: mans,
    head: null,
    tail: null,
    bbox: { minX: minBX, minZ: minBZ, maxX: maxBX, maxZ: maxBZ },
    searchMs: raw.ms,
    expanded: raw.expanded,
    get pts() {
      if (!this._pts) {
        const p = [];
        for (let i = 0; i < line.length; i += 2) p.push([line[i], line[i + 1]]);
        this._pts = p;
      }
      return this._pts;
    },
  };
}

/** Straight-line "route" for aircraft: same Route shape, one leg. cruise in m/s. */
export function assembleAir(from, to, opts = {}) {
  const L = Math.hypot(to.x - from.x, to.z - from.z),
    v = opts.cruise || 55,
    h = Math.atan2(to.x - from.x, to.z - from.z);
  const line = Float32Array.from([from.x, from.z, to.x, to.z]),
    cum = Float32Array.from([0, L]);
  const mans = [
    {
      index: 0,
      type: 'depart',
      modifier: 'straight',
      at: 0,
      arcIndex: 0,
      x: from.x,
      z: from.z,
      name: null,
      text: `Fly ${cardinal(h)}`,
      short: cardinal(h),
      side: 0,
      lanes: null,
      length: L,
      time: 0,
      bearing: h,
    },
    {
      index: 1,
      type: 'arrive',
      modifier: 'straight',
      at: L,
      arcIndex: 1,
      x: to.x,
      z: to.z,
      name: opts.destName || null,
      text: opts.destName ? `Arrive at ${opts.destName}` : 'You have arrived',
      short: opts.destName || 'Destination',
      side: 0,
      lanes: null,
      length: 0,
      time: L / v,
    },
  ];
  return {
    mode: 'air',
    profile: 'air',
    arcs: new Int32Array(1),
    from: { ...from },
    to: { ...to },
    destName: opts.destName || null,
    length: L,
    time: L / v,
    cost: L / v,
    line,
    cum,
    lineLength: L,
    arcAt: Uint32Array.from([0, 1]),
    arcD: Float64Array.from([0, L]),
    arcT: Float64Array.from([0, L / v]),
    maneuvers: mans,
    head: null,
    tail: null,
    bbox: {
      minX: Math.min(from.x, to.x),
      minZ: Math.min(from.z, to.z),
      maxX: Math.max(from.x, to.x),
      maxZ: Math.max(from.z, to.z),
    },
    searchMs: 0,
    expanded: 0,
    get pts() {
      return [
        [from.x, from.z],
        [to.x, to.z],
      ];
    },
  };
}
