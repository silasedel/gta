// Miami map data loader (DATA agent). Pure data + fast spatial queries; no rendering, no physics.
// Built from OpenStreetMap (c) OpenStreetMap contributors, ODbL, by tools/osm/build.py -> public/assets/miami/*.
// Frame (CONTRACT4): x east, z south (+Z), y up, metres. Heading 0 faces +Z; direction of heading h = (sin h, cos h).
// Format notes: tools/osm/README.md
const GC_OFF = typeof location !== 'undefined' && /[?&]groundfix=0/.test(location.search); // ground-continuity before/after switch (audit only)
import * as THREE from 'three';
import { breathe } from '../../core/pace.js';
import { withRelief } from '../terrain/relief.js';

const DEFAULT_BASE = '/assets/miami/';
const SURF_PUBLIC = { sidewalk: 'concrete', pier: 'wood', building: 'concrete' };

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`miami data: ${url} -> HTTP ${r.status}`);
  return r.json();
}

// grid.bin layers are zlib-deflated one by one
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('miami data: DecompressionStream is not available in this browser');
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

// Row-run grid: per row a list of (value, run length). Kept as run tables (no dense decode: the 2 m surface grid of the
// whole world would be ~64 MB dense); a cell lookup is a binary search over the row's runs, with a one-run cache because
// consecutive queries are usually neighbors.
function rowGrid(meta, raw) {
  const H = meta.h,
    W = meta.w;
  const counts = new Uint32Array(raw.buffer, raw.byteOffset, H);
  const rowOff = new Uint32Array(H + 1);
  for (let j = 0; j < H; j++) rowOff[j + 1] = rowOff[j] + counts[j];
  const n = rowOff[H];
  const end = new Uint16Array(n),
    val = new Uint8Array(n);
  let p = raw.byteOffset + H * 4;
  const u8 = new Uint8Array(raw.buffer);
  for (let j = 0, k = 0; j < H; j++) {
    let c = 0;
    for (const e = rowOff[j + 1]; k < e; k++, p += 3) {
      val[k] = u8[p];
      c += u8[p + 1] | (u8[p + 2] << 8);
      end[k] = c >= 65535 ? 65535 : c;
    }
  }
  let cj = -1,
    c0 = 0,
    c1 = 0,
    cv = 0; // cached run: row cj, columns [c0, c1)
  const x0 = meta.x0,
    z0 = meta.z0,
    res = meta.res;
  function at(x, z) {
    let i = Math.floor((x - x0) / res),
      j = Math.floor((z - z0) / res);
    if (i < 0) i = 0;
    else if (i >= W) i = W - 1;
    if (j < 0) j = 0;
    else if (j >= H) j = H - 1;
    if (j === cj && i >= c0 && i < c1) return cv;
    let lo = rowOff[j],
      hi = rowOff[j + 1] - 1;
    const base = lo;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (end[m] > i) hi = m;
      else lo = m + 1;
    }
    cj = j;
    c0 = lo > base ? end[lo - 1] : 0;
    c1 = end[lo];
    cv = val[lo];
    return cv;
  }
  // cell index (stable id for caches) and dense row decode (for tools / previews)
  at.cell = (x, z) => {
    let i = Math.floor((x - x0) / res),
      j = Math.floor((z - z0) / res);
    if (i < 0) i = 0;
    else if (i >= W) i = W - 1;
    if (j < 0) j = 0;
    else if (j >= H) j = H - 1;
    return j * W + i;
  };
  at.row = (j, out = new Uint8Array(W)) => {
    let c = 0;
    for (let k = rowOff[j]; k < rowOff[j + 1]; k++) {
      out.fill(val[k], c, end[k]);
      c = end[k];
    }
    return out;
  };
  at.meta = meta;
  at.runs = n;
  at.bytes = n * 3 + (H + 1) * 4;
  return at;
}

// CSR spatial hash of items with bounding boxes
function buildHash(minX, minZ, maxX, maxZ, cell, count, bboxOf) {
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const cnt = new Int32Array(nx * nz + 1);
  const bb = new Float64Array(4);
  const ci = (v, o, n) => Math.min(n - 1, Math.max(0, Math.floor((v - o) / cell)));
  for (let k = 0; k < count; k++) {
    bboxOf(k, bb);
    const i0 = ci(bb[0], minX, nx),
      i1 = ci(bb[2], minX, nx),
      j0 = ci(bb[1], minZ, nz),
      j1 = ci(bb[3], minZ, nz);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cnt[j * nx + i + 1]++;
  }
  for (let c = 1; c <= nx * nz; c++) cnt[c] += cnt[c - 1];
  const items = new Int32Array(cnt[nx * nz]);
  const fill = cnt.slice(0, nx * nz);
  for (let k = 0; k < count; k++) {
    bboxOf(k, bb);
    const i0 = ci(bb[0], minX, nx),
      i1 = ci(bb[2], minX, nx),
      j0 = ci(bb[1], minZ, nz),
      j1 = ci(bb[3], minZ, nz);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * nx + i]++] = k;
  }
  return { minX, minZ, cell, nx, nz, start: cnt, items };
}

const MAPFIX_OFF = typeof location !== 'undefined' && /[?&]mapfix=0\b/.test(location.search); // map audit fixes A/B (tools/v2/map-audit.mjs)
export async function loadMiamiData(game, opts = {}) {
  const root = opts.base || DEFAULT_BASE;
  const t0 = performance.now();
  // world.json is the manifest of the published build; `dir` is that build's folder (builds are swapped atomically)
  // ?mapbuild=b2026...: load a kept build folder instead of the published one (audits compare fixes on one fixed map)
  const MB =
    typeof location !== 'undefined' && (location.search.match(/[?&]mapbuild=(b[\d-]+)/) || [])[1];
  const man = await getJSON(root + (MB ? MB + '/manifest.json' : 'world.json'));
  if (MB && !man.dir) man.dir = MB + '/';
  const base = root + (man.dir || '');
  const F = man.files;
  const [rg, peds, spots, map, names, placesJ, transitJ, gridBuf] = await Promise.all([
    getJSON(base + F.roadgraph),
    getJSON(base + F.peds),
    getJSON(base + F.spots),
    getJSON(base + F.map),
    getJSON(base + F.names),
    getJSON(base + F.places),
    getJSON(base + F.transit),
    fetch(base + F.grid).then((r) => r.arrayBuffer()),
  ]);
  const tFetched = performance.now();
  const Q = 1 / (man.q || 10);
  const B = man.bounds;
  const RR = man.realRect || B;
  const SEA = man.seaLevel;
  const CURB = man.curb;
  // docks / piers sit 0.3 m above the land (0.42 m above the water): the player steps straight on from shore
  // (autostep 0.35 m) and can climb out of the water onto them; the OSM pipeline's 1.2 m made a ledge you could not get onto
  const PIER_Y = Math.min(man.pierY ?? 0.3, 0.3);
  const SURF = man.surfaces,
    ZONES = man.zones,
    DISTRICTS = man.districts,
    COVER = man.cover || ['none'];
  const S_WATER = SURF.indexOf('water'),
    S_SIDEWALK = SURF.indexOf('sidewalk'),
    S_PIER = SURF.indexOf('pier');
  const S_BUILDING = SURF.indexOf('building'),
    S_ASPHALT = SURF.indexOf('asphalt');
  const Z_WATER = ZONES.indexOf('water'),
    Z_CAUSEWAY = ZONES.indexOf('causeway'),
    Z_RES = ZONES.indexOf('residential');
  const surfNames = SURF.map((s) => SURF_PUBLIC[s] || s);

  // ---------------------------------------------------------------- grids
  const gridBytes = new Uint8Array(gridBuf);
  const G = {};
  await Promise.all(
    man.grids.map(async (g) => {
      const comp = gridBytes.subarray(g.offset, g.offset + g.length);
      let raw = g.z ? await inflate(comp) : comp.slice();
      if (raw.byteOffset % 4) raw = raw.slice(); // typed views below need alignment
      if (g.enc === 'rows') G[g.name] = rowGrid(g, raw);
      else if (g.enc === 'u8') G[g.name] = { ...g, data: raw };
      else if (g.enc === 'i16')
        G[g.name] = { ...g, data: new Int16Array(raw.buffer, raw.byteOffset, g.w * g.h) };
    }),
  );
  const surfRaw = G.surface,
    coverCode = G.cover || (() => 0),
    zoneCode = G.zone,
    distCode = G.district,
    wkCode = G.wkind || null;
  const WKINDS = man.waterKinds || [null, 'sea'];
  // ground-continuity: thin 'sea' / 'lake' slivers (<= 12 m across, land on both sides) are rasterisation gaps between land
  // polygons (e.g. the strip that ran along South Beach): they count as the land beside them, so the water mask, the drawn
  // ground and the colliders all agree (tilebuild fills these cells with ground). Canals, rivers, ponds and marsh keep their water.
  const SM = man.grids.find((g) => g.name === 'surface') || { res: 2, x0: 0, z0: 0 };
  const S_SAND = SURF.indexOf('sand'),
    SLIVER_SAND = 30,
    SLIVER_W = 12,
    sliverCache = new Map(),
    SLIVER_DIRS = [
      [1, 0],
      [0, 1],
      [0.7071, 0.7071],
      [0.7071, -0.7071],
    ];
  function sliverLand(x, z) {
    const k = surfRaw.cell(x, z);
    let v = sliverCache.get(k);
    if (v !== undefined) return v;
    v = -1;
    const wk = wkCode ? WKINDS[wkCode(x, z)] : 'sea';
    if (!wk || wk === 'sea' || wk === 'lake') {
      const res = SM.res || 2,
        cx = (Math.floor((x - SM.x0) / res) + 0.5) * res + SM.x0,
        cz = (Math.floor((z - SM.z0) / res) + 0.5) * res + SM.z0;
      for (let q = 0; q < 4; q++) {
        const dx = SLIVER_DIRS[q][0],
          dz = SLIVER_DIRS[q][1]; // perf: no destructuring iterator (hot: every terrain vertex)
        let a = 0,
          ca = -1,
          b = 0,
          cb = -1;
        for (let s = res; s <= SLIVER_SAND; s += res) {
          const c = surfRaw(cx + dx * s, cz + dz * s);
          if (c !== S_WATER) {
            a = s;
            ca = c;
            break;
          }
        }
        if (!a || ca === S_PIER || ca === S_BUILDING) continue; // water beside a pier or a building edge stays water
        for (let s = res; s <= SLIVER_SAND - a + res; s += res) {
          const c = surfRaw(cx - dx * s, cz - dz * s);
          if (c !== S_WATER) {
            b = s;
            cb = c;
            break;
          }
        }
        if (!b || cb === S_PIER) continue;
        // any land on both sides within 12 m; sand on both sides (a strip through a beach) up to 30 m
        if (a + b <= SLIVER_W + res || (ca === S_SAND && cb === S_SAND)) {
          v = ca;
          break;
        }
      }
    }
    if (sliverCache.size > 400000) sliverCache.clear();
    sliverCache.set(k, v);
    return v;
  }
  // ground-continuity: tiny bare specks of sand out in open water outside real Miami (< ~260 m across, no vegetation cover)
  // rendered as flat slabs floating on the sea; they are open water (the map's real keys and mangrove islets stay land)
  const _isd = new Float64Array(8);
  const ISLET_COVER = new Set(['none', 'sand', 'island', 'dune']),
    isletCache = new Map(),
    ISLET_DIRS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.7071, 0.7071],
      [-0.7071, -0.7071],
      [0.7071, -0.7071],
      [-0.7071, 0.7071],
    ];
  function isIslet(x, z) {
    const k = Math.floor(x / 16) * 100003 + Math.floor(z / 16);
    let v = isletCache.get(k);
    if (v !== undefined) return v;
    v = false;
    if (!inReal(x, z) && ISLET_COVER.has(COVER[coverCode(x, z)] || 'none')) {
      const d = _isd;
      let ok = true;
      for (let q = 0; q < 8; q++) {
        const dx = ISLET_DIRS[q][0],
          dz = ISLET_DIRS[q][1];
        let h = 0;
        for (let s = 8; s <= 200; s += 8)
          if (surfRaw(x + dx * s, z + dz * s) === S_WATER) {
            h = s;
            break;
          }
        if (!h) {
          ok = false;
          break;
        }
        d[q] = h;
      }
      v =
        ok && d[0] + d[1] <= 260 && d[2] + d[3] <= 260 && d[4] + d[5] <= 260 && d[6] + d[7] <= 260;
    }
    if (isletCache.size > 200000) isletCache.clear();
    isletCache.set(k, v);
    return v;
  }
  // ground pass: small enclosed specks of water inside land (traced-map noise: blue pockets inside city blocks, < ~90 m across, land
  // within 72 m in all 8 directions) are land - they rendered as open sea (with a moored boat) in downtown / Little Havana / Clewiston
  const S_GRASS = Math.max(0, SURF.indexOf('grass_short')),
    pocketCache = new Map();
  function isPocket(x, z) {
    const k = Math.floor(x / 8) * 100003 + Math.floor(z / 8);
    let v = pocketCache.get(k);
    if (v !== undefined) return v;
    v = true;
    const d = _isd;
    for (let q = 0; q < 8; q++) {
      const dx = ISLET_DIRS[q][0],
        dz = ISLET_DIRS[q][1];
      let h = 0;
      for (let s2 = 6; s2 <= 72; s2 += 6)
        if (surfRaw(x + dx * s2, z + dz * s2) !== S_WATER) {
          h = s2;
          break;
        }
      if (!h) {
        v = false;
        break;
      }
      d[q] = h;
    }
    if (v) v = d[0] + d[1] <= 90 && d[2] + d[3] <= 90 && d[4] + d[5] <= 90 && d[6] + d[7] <= 90;
    if (pocketCache.size > 200000) pocketCache.clear();
    pocketCache.set(k, v);
    return v;
  }
  const surfCode = (x, z) => {
    const s = surfRaw(x, z);
    if (GC_OFF) return s;
    if (s !== S_WATER) return s !== S_BUILDING && s !== S_PIER && isIslet(x, z) ? S_WATER : s;
    const l = sliverLand(x, z);
    return l >= 0 ? l : isPocket(x, z) ? S_GRASS : s;
  };
  surfCode.cell = surfRaw.cell;
  const isSliver = (x, z) => surfRaw(x, z) === S_WATER && sliverLand(x, z) >= 0;
  const isWaterRaw = (x, z) => surfRaw(x, z) === S_WATER;
  const isIsletAt = (x, z) => !GC_OFF && surfRaw(x, z) !== S_WATER && isIslet(x, z);
  const gD = G.depth,
    gH = G.height || null;
  // terrain height above y = 0 (bilinear, node-registered 16 m grid). Zero everywhere in real Miami; hills and dunes outside.
  const baseTerrainHeightAt = gH
    ? (x, z) => {
        const fx = (x - gH.x0) / gH.res,
          fz = (z - gH.z0) / gH.res;
        let i = Math.floor(fx),
          j = Math.floor(fz);
        if (i < 0 || j < 0 || i >= gH.w - 1 || j >= gH.h - 1) return 0;
        const u = fx - i,
          v = fz - j,
          W = gH.w,
          d = gH.data,
          o = j * W + i;
        const a = d[o],
          b = d[o + 1],
          c = d[o + W],
          e = d[o + W + 1];
        if (!(a | b | c | e)) return 0;
        return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v) * gH.unit;
      }
    : () => 0;
  // r2-ground: micro-relief (mounds, swales, drainage lows) folded into the terrain height, so mesh, colliders, groundHeightAt and
  // every placer agree (src/world/terrain/relief.js; flat at roads / buildings / claims / shores / real Miami; ?relief=0 = off)
  const roadEdgeAt = (x, z, m) => {
    const s0 = NE.e,
      s1 = NE.seg,
      s2 = NE.u,
      s3 = NE.d2,
      s4 = NE.px,
      s5 = NE.pz; // keep the shared scratch intact for callers
    const r = nearestSeg(x, z, m + 12) ? Math.sqrt(NE.d2) - (edges[NE.e].width || 6) / 2 : m;
    NE.e = s0;
    NE.seg = s1;
    NE.u = s2;
    NE.d2 = s3;
    NE.px = s4;
    NE.pz = s5;
    return r;
  };
  let reliefLive = false; // set once the whole data object is built (the ctx closures read consts defined further down)
  const reliefH = withRelief(baseTerrainHeightAt, {
    surfAt: (x, z) => SURF[surfCode(x, z)],
    coverAt: (x, z) => coverAt(x, z),
    zoneAt: (x, z) => zoneAt(x, z),
    isWater: (x, z) => isWater(x, z),
    inReal: (x, z) => inReal(x, z),
    roadEdge: roadEdgeAt,
    setpieces: () => placesJ.setpieces || [],
  }); // also on a flat (no height grid) build
  const terrainHeightAt =
    reliefH === baseTerrainHeightAt
      ? baseTerrainHeightAt
      : Object.assign((x, z) => (reliefLive ? reliefH(x, z) : baseTerrainHeightAt(x, z)), {
          relief: (x, z) => (reliefLive ? reliefH.relief(x, z) : 0),
          lowAt: (x, z) => (reliefLive ? reliefH.lowAt(x, z) : 0),
          reliefStats: reliefH.reliefStats,
          base: baseTerrainHeightAt,
        });
  // swimmable water: at least MIN_DEPTH (5 m) everywhere except where the water meets a beach, which keeps its
  // gentle slope (the clamp ramps in from 8 m to 56 m off the sand). Cached per surface cell.
  const MIN_DEPTH = 5.0; // deep enough to dive under and swim along the bottom
  const S_SANDS = SURF.map((s, i) => (/sand|beach/i.test(s) ? i : -1)).filter((i) => i >= 0);
  const minDepthCache = new Map();
  function minDepthAt(x, z) {
    if (!S_SANDS.length) return MIN_DEPTH;
    const k = surfCode.cell(x, z);
    let v = minDepthCache.get(k);
    if (v === undefined) {
      let dB = Infinity;
      for (let r = 8; r <= 56 && dB === Infinity; r += 8)
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          if (S_SANDS.includes(surfCode(x + Math.cos(ang) * r, z + Math.sin(ang) * r))) {
            dB = r;
            break;
          }
        }
      v = dB === Infinity ? MIN_DEPTH : MIN_DEPTH * Math.min(1, Math.max(0, (dB - 8) / 48));
      if (minDepthCache.size > 400000) minDepthCache.clear();
      minDepthCache.set(k, v);
    }
    return v;
  }
  // shallow inland water (canals, ponds, marsh) keeps its own depth: the 5 m swim floor applies to the sea and big lakes
  const swimDepthAt = (x, z) => {
    const d = depthAt(x, z);
    if (wkCode && !inReal(x, z)) {
      const k = wkCode(x, z);
      if (k === 3 || k >= 5) return Math.max(d, 0.4);
    }
    return Math.max(d, minDepthAt(x, z));
  };
  // 'sea' | 'lake' | 'canal' | 'river' | 'pond' | 'marsh' over water, null on land
  const waterKindAt = (x, z) =>
    surfCode(x, z) === S_WATER ? (wkCode ? WKINDS[wkCode(x, z)] || 'sea' : 'sea') : null;
  const inReal = (x, z) => x >= RR.minX && x < RR.maxX && z >= RR.minZ && z < RR.maxZ;
  function depthAt(x, z) {
    // bilinear seabed depth (m, positive)
    const fx = (x - gD.x0) / gD.res - 0.5,
      fz = (z - gD.z0) / gD.res - 0.5;
    let i = Math.floor(fx),
      j = Math.floor(fz);
    const u = fx - i,
      v = fz - j;
    const W = gD.w,
      H = gD.h,
      d = gD.data;
    const i0 = i < 0 ? 0 : i >= W ? W - 1 : i,
      i1 = i + 1 < 0 ? 0 : i + 1 >= W ? W - 1 : i + 1;
    const j0 = j < 0 ? 0 : j >= H ? H - 1 : j,
      j1 = j + 1 < 0 ? 0 : j + 1 >= H ? H - 1 : j + 1;
    const a = d[j0 * W + i0],
      b = d[j0 * W + i1],
      c = d[j1 * W + i0],
      e = d[j1 * W + i1];
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v) * 0.1;
  }

  // ---------------------------------------------------------------- road graph
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const CTRL = [null, 'signal', 'stop', 'yield'];
  const nodes = [];
  for (let k = 0, n = rg.nodes.length / 2; k < n; k++)
    nodes.push({
      id: k,
      x: rg.nodes[2 * k] * Q,
      z: rg.nodes[2 * k + 1] * Q,
      y: 0,
      edges: [],
      signal: false,
      control: null,
      exit: null,
    });
  for (const k of rg.signals || [])
    if (nodes[k]) {
      nodes[k].signal = true;
      nodes[k].control = 'signal';
    }
  for (const k in rg.exits || {}) if (nodes[k]) nodes[k].exit = rg.exits[k];
  const pairs = (a) => {
    const o = new Array((a || []).length / 2);
    for (let i = 0; i < o.length; i++) o[i] = [a[2 * i] * Q, a[2 * i + 1] * Q];
    return o;
  };
  // mapped traffic signals, stop signs, yield signs and pedestrian crossings as [x, z] lists (whole world, no tiles needed)
  const controls = {
    signals: pairs(rg.controls?.signals),
    stops: pairs(rg.controls?.stops),
    yields: pairs(rg.controls?.yields),
    crossings: pairs(rg.controls?.crossings),
  };
  const edges = [];
  let segCount = 0;
  for (let k = 0; k < rg.edges.length; k++) {
    const r = rg.edges[k];
    const n = r.p.length / 2;
    const pf = new Float32Array(r.p.length);
    for (let i = 0; i < r.p.length; i++) pf[i] = r.p[i] * Q;
    const pts = new Array(n);
    const cum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pts[i] = [pf[2 * i], pf[2 * i + 1]];
      if (i)
        cum[i] = cum[i - 1] + Math.hypot(pf[2 * i] - pf[2 * i - 2], pf[2 * i + 1] - pf[2 * i - 1]);
    }
    const y = r.y ? Float32Array.from(r.y, (v) => v / (rg.yq || 100)) : new Float32Array(n);
    // y is the ABSOLUTE road surface height. elevated = a structure (bridge, overpass, ramp); terrain = the road just
    // follows non-flat ground (hills outside real Miami) and is not a deck.
    const e = {
      id: k,
      a: r.a,
      b: r.b,
      pts,
      pf,
      cum,
      length: cum[n - 1],
      y,
      elevated: !!r.y && !r.tr,
      terrain: !!r.tr,
      width: r.w,
      lanesFwd: r.lf,
      lanesBack: r.lb,
      oneway: !!r.o,
      speedKmh: r.s,
      name: r.n >= 0 ? rg.names[r.n] : null,
      kind: rg.kinds[r.k],
      bridge: !!r.br,
      movable: r.br === 2,
      layer: r.l || 0,
      sidewalk: r.sw || 0,
      // V2: road number(s) for signs ('I-95', 'US-1;SR 5'), traffic control faced when ARRIVING at node a / node b
      // ('signal' | 'stop' | 'yield' | null), turn lanes, toll, lighting, surface, sign destinations, flags
      ref: r.r !== undefined ? rg.refs[r.r] : null,
      controlA: CTRL[r.ca || 0],
      controlB: CTRL[r.cb || 0],
      turnLanes: r.tl || null,
      turnLanesFwd: r.tl || null,
      turnLanesBack: r.tlb || null,
      toll: !!r.toll,
      lit: !!r.lit,
      speedPosted: !!r.st,
      surface: r.sf !== undefined ? rg.surfaces[r.sf] : 'asphalt',
      destination: r.dst || null,
      destinationRef: r.dref || null,
      bridgeName: r.bn || null,
      roundabout: !!r.rb,
      synthetic: !!r.syn,
      private: !!r.pv,
      component: r.c || 0,
      mainNetwork: !r.ns && !r.c,
    };
    edges.push(e);
    nodes[e.a].edges.push(k);
    if (e.b !== e.a) nodes[e.b].edges.push(k);
    // node.control: 'signal' | 'stop' | 'yield' | null (strongest control on any approach)
    if (e.controlB && nodes[e.b].control !== 'signal') nodes[e.b].control = e.controlB;
    if (e.controlA && nodes[e.a].control !== 'signal') nodes[e.a].control = e.controlA;
    if (r.y) {
      nodes[e.a].y = Math.max(nodes[e.a].y, y[0]);
      nodes[e.b].y = Math.max(nodes[e.b].y, y[n - 1]);
      if (r.tr) {
        nodes[e.a].terrain = true;
        nodes[e.b].terrain = true;
      }
    }
    segCount += n - 1;
  }
  // segment table
  const segE = new Int32Array(segCount),
    segI = new Int32Array(segCount);
  {
    let s = 0;
    for (const e of edges)
      for (let i = 0; i < e.pts.length - 1; i++) {
        segE[s] = e.id;
        segI[s] = i;
        s++;
      }
  }
  const segBBox = (k, bb, pad) => {
    const e = edges[segE[k]],
      p = e.pf,
      i = segI[k] * 2;
    bb[0] = Math.min(p[i], p[i + 2]) - pad;
    bb[2] = Math.max(p[i], p[i + 2]) + pad;
    bb[1] = Math.min(p[i + 1], p[i + 3]) - pad;
    bb[3] = Math.max(p[i + 1], p[i + 3]) + pad;
  };
  const edgeHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 40, segCount, (k, bb) =>
    segBBox(k, bb, edges[segE[k]].width / 2),
  );
  // elevated segments only (for groundHeightAt / surfaceAt on bridges)
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const elevSegs = [];
  for (let k = 0; k < segCount; k++) {
    const e = edges[segE[k]];
    if (e.elevated && (e.y[segI[k]] > 0.25 || e.y[segI[k] + 1] > 0.25)) elevSegs.push(k);
  }
  const elevHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 32, elevSegs.length, (k, bb) =>
    segBBox(elevSegs[k], bb, edges[segE[elevSegs[k]]].width / 2 + 1),
  );

  // nearest segment search (allocation-free; writes into `out`)
  const NE = { e: -1, seg: -1, u: 0, d2: Infinity, px: 0, pz: 0 };
  function nearestSeg(x, z, maxDist, filter) {
    NE.e = -1;
    NE.d2 = maxDist * maxDist;
    const H = edgeHash;
    const ci = Math.floor((x - H.minX) / H.cell),
      cj = Math.floor((z - H.minZ) / H.cell);
    const maxR = Math.ceil(maxDist / H.cell) + 1;
    for (let r = 0; r <= maxR; r++) {
      if (r > 1 && NE.e >= 0) {
        const ring = (r - 1) * H.cell;
        if (ring * ring > NE.d2) break;
      }
      for (let j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= H.nz) continue;
        const edgeRow = j === cj - r || j === cj + r;
        for (let i = ci - r; i <= ci + r; i += edgeRow ? 1 : 2 * r || 1) {
          if (i < 0 || i >= H.nx) continue;
          const c = j * H.nx + i;
          for (let s = H.start[c], end = H.start[c + 1]; s < end; s++) {
            const k = H.items[s];
            const e = edges[segE[k]];
            if (filter && !filter(e)) continue;
            const p = e.pf,
              o = segI[k] * 2;
            const ax = p[o],
              az = p[o + 1],
              dx = p[o + 2] - ax,
              dz = p[o + 3] - az;
            const L2 = dx * dx + dz * dz;
            let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
            const px = ax + dx * u,
              pz = az + dz * u;
            const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
            if (d2 < NE.d2) {
              NE.d2 = d2;
              NE.e = e.id;
              NE.seg = segI[k];
              NE.u = u;
              NE.px = px;
              NE.pz = pz;
            }
          }
        }
      }
    }
    return NE.e >= 0;
  }
  function fillResult(out) {
    const e = edges[NE.e],
      p = e.pf,
      o = NE.seg * 2;
    const dx = p[o + 2] - p[o],
      dz = p[o + 3] - p[o + 1],
      L = Math.hypot(dx, dz) || 1;
    const s = e.cum[NE.seg] + L * NE.u;
    out.edge = e;
    out.seg = NE.seg;
    out.u = NE.u;
    out.s = s;
    out.t = e.length > 0 ? s / e.length : 0;
    out.dist = Math.sqrt(NE.d2);
    out.point = out.point || { x: 0, z: 0 };
    out.point.x = NE.px;
    out.point.z = NE.pz;
    out.dir = out.dir || { x: 0, z: 0 };
    out.dir.x = dx / L;
    out.dir.z = dz / L;
    out.y = e.y[NE.seg] + (e.y[NE.seg + 1] - e.y[NE.seg]) * NE.u;
    return out;
  }
  const isFootKind = () => false; // roadGraph holds drivable edges only (footpaths live in data.paths)
  // turn restrictions (OSM relations): banned = "from|node|to" keys; only = from|node -> the one allowed exit edge
  const T = rg.turns || { no: [], only: [], via: [] };
  const turnNo = new Set(),
    turnOnly = new Map();
  for (const [a, n, b] of T.no) turnNo.add(a + '|' + n + '|' + b);
  for (const [a, n, b] of T.only) {
    const k = a + '|' + n;
    if (!turnOnly.has(k)) turnOnly.set(k, new Set());
    turnOnly.get(k).add(b);
  }
  const roadGraph = {
    nodes,
    edges,
    kinds: rg.kinds,
    refs: rg.refs || [],
    components: rg.components || [],
    // turn rules: turns = { no: [[fromEdge, node, toEdge]], only: [[fromEdge, node, toEdge]], via: [[kind, fromEdge, [viaEdges], toEdge]] }
    turns: T,
    // may a vehicle that arrived at `nodeId` on `fromEdgeId` leave on `toEdgeId`? (one-ways, banned and mandatory turns; U-turns are allowed unless banned)
    turnAllowed(fromEdgeId, nodeId, toEdgeId) {
      const to = edges[toEdgeId];
      if (!to) return false;
      if (to.oneway && to.a !== nodeId) return false;
      if (turnNo.has(fromEdgeId + '|' + nodeId + '|' + toEdgeId)) return false;
      const only = turnOnly.get(fromEdgeId + '|' + nodeId);
      return !only || only.has(toEdgeId);
    },
    // traffic control a vehicle faces at the end of `edge` when traveling in direction dir (+1 = a to b): 'signal' | 'stop' | 'yield' | null
    controlAt(edge, dir) {
      return dir >= 0 ? edge.controlB : edge.controlA;
    },
    // nearestEdge(x, z, out?, maxDist = 500) -> { edge, t (0..1 by length), s (metres), seg, u, dist, point{x,z}, dir{x,z}, y } | null
    nearestEdge(x, z, out = null, maxDist = 500, filter = null) {
      if (!nearestSeg(x, z, maxDist, filter)) return null;
      return fillResult(out || {});
    },
    edgesAt(nodeId) {
      const n = nodes[nodeId];
      return n ? n.edges.map((k) => edges[k]) : [];
    },
    otherNode(edge, nodeId) {
      return edge.a === nodeId ? edge.b : edge.a;
    },
    // point + height + tangent at distance s (m) along edge; writes into out {x, y, z, dx, dz}
    pointAt(edge, s, out = {}) {
      const c = edge.cum,
        n = c.length;
      s = s < 0 ? 0 : s > edge.length ? edge.length : s;
      let lo = 0,
        hi = n - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (c[m] <= s) lo = m;
        else hi = m;
      }
      const L = c[hi] - c[lo] || 1,
        u = (s - c[lo]) / L,
        p = edge.pf;
      const dx = p[2 * hi] - p[2 * lo],
        dz = p[2 * hi + 1] - p[2 * lo + 1],
        dl = Math.hypot(dx, dz) || 1;
      out.x = p[2 * lo] + dx * u;
      out.z = p[2 * lo + 1] + dz * u;
      out.y = edge.y[lo] + (edge.y[hi] - edge.y[lo]) * u;
      out.dx = dx / dl;
      out.dz = dz / dl;
      return out;
    },
    isFootpath: isFootKind,
  };

  // ---------------------------------------------------------------- bridges / height queries
  const DK = { y: 0, e: -1 };
  function deckAt(x, z, below) {
    // highest elevated deck covering (x,z) with height <= below; sets DK, returns bool
    const H = elevHash;
    const i = Math.floor((x - H.minX) / H.cell),
      j = Math.floor((z - H.minZ) / H.cell);
    DK.e = -1;
    DK.y = -Infinity;
    if (i < 0 || j < 0 || i >= H.nx || j >= H.nz) return false;
    const c = j * H.nx + i;
    for (let s = H.start[c], end = H.start[c + 1]; s < end; s++) {
      const k = elevSegs[H.items[s]];
      const e = edges[segE[k]],
        p = e.pf,
        o = segI[k] * 2;
      const ax = p[o],
        az = p[o + 1],
        dx = p[o + 2] - ax,
        dz = p[o + 3] - az;
      const L2 = dx * dx + dz * dz;
      let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const px = ax + dx * u - x,
        pz = az + dz * u - z,
        hw = e.width / 2 + 0.6;
      if (px * px + pz * pz > hw * hw) continue;
      const y = e.y[segI[k]] + (e.y[segI[k] + 1] - e.y[segI[k]]) * u;
      if (y < 0.25 || y > below) continue;
      if (y > DK.y) {
        DK.y = y;
        DK.e = e.id;
      }
    }
    return DK.e >= 0;
  }
  // ground top at (x,z). Optional y: when given, decks more than 4 m above y are ignored (you are under the bridge).
  function groundHeightAt(x, z, y) {
    if (deckAt(x, z, y === undefined ? Infinity : y + 4)) return DK.y;
    const s = surfCode(x, z);
    if (s === S_WATER) return SEA - Math.max(0.2, swimDepthAt(x, z));
    const t = terrainHeightAt(x, z); // (0 + relief on a flat build)
    if (s === S_SIDEWALK) return t + CURB;
    if (s === S_PIER) return PIER_Y;
    // stage 1: downtown plazas are raised flush with the sidewalk (tilebuild draws them at curb height)
    if (COVER_PLAZA >= 0 && coverCode(x, z) === COVER_PLAZA) return t + CURB;
    return t;
  }
  const COVER_PLAZA = COVER.indexOf('plaza');
  const isWater = (x, z) => surfCode(x, z) === S_WATER;
  function surfaceAt(x, z, y) {
    const s = surfCode(x, z);
    if ((s === S_WATER || y !== undefined) && deckAt(x, z, y === undefined ? Infinity : y + 1.5))
      return 'asphalt';
    return surfNames[s];
  }
  function zoneAt(x, z) {
    const zn = zoneCode(x, z);
    if (isWater(x, z)) return zn === Z_CAUSEWAY ? 'causeway' : 'water';
    return ZONES[zn === Z_WATER ? Z_RES : zn];
  }
  const districtAt = (x, z) => DISTRICTS[distCode(x, z)] || null;
  // land cover class under (x, z): 'none' | 'park' | 'forest' | 'sawgrass' | 'wetland' | 'mangrove' | 'farmland' | 'grove' | 'runway' | ... (manifest.cover)
  const coverAt = (x, z) => COVER[coverCode(x, z)] || 'none';
  reliefLive = true; // r2-ground micro-relief: everything its closures read exists from here on (before any init-time height: benches, lean spots)
  const named = (e) => !!e.name;
  // nearest named street (drivable edges), or a named pedestrian street / promenade if that is closer
  // display form of a street name: multi-ref OSM values ('US-1;SR 970', 'I 95;US 1') read 'US-1 / SR 970' (highways track)
  const fmtStreet = (n) =>
    n && n.indexOf(';') >= 0
      ? n
          .split(';')
          .map((p) => p.trim().replace(/^(I|US)[ ]?(\d)/, '$1-$2'))
          .filter((p, i, a) => p && a.indexOf(p) === i)
          .join(' / ')
      : n;
  function streetNameAt(x, z, maxDist = 60) {
    return fmtStreet(streetNameRaw(x, z, maxDist));
  }
  function streetNameRaw(x, z, maxDist) {
    let best = null,
      bd = maxDist * maxDist;
    if (nearestSeg(x, z, maxDist, named)) {
      best = edges[NE.e].name;
      bd = NE.d2;
    }
    if (namedPathHash) {
      const H = namedPathHash,
        i = Math.floor((x - H.minX) / H.cell),
        j = Math.floor((z - H.minZ) / H.cell);
      if (i >= 0 && j >= 0 && i < H.nx && j < H.nz) {
        const c = j * H.nx + i;
        for (let s = H.start[c]; s < H.start[c + 1]; s++) {
          const p = namedPaths[H.items[s]],
            pf = p.pf;
          for (let k = 0; k < pf.length - 2; k += 2) {
            const ax = pf[k],
              az = pf[k + 1],
              dx = pf[k + 2] - ax,
              dz = pf[k + 3] - az,
              L2 = dx * dx + dz * dz;
            let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
            const ex = ax + dx * u - x,
              ez = az + dz * u - z,
              d2 = ex * ex + ez * ez;
            if (d2 < bd) {
              bd = d2;
              best = p.name;
            }
          }
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- sidewalks / paths
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const ZI = {};
  ZONES.forEach((n, i) => {
    ZI[n] = i;
  });
  const swLines = peds.sidewalks.map((s) => {
    const pf = Float32Array.from(s.p, (v) => v * Q);
    let L = 0;
    for (let i = 2; i < pf.length; i += 2)
      L += Math.hypot(pf[i] - pf[i - 2], pf[i + 1] - pf[i - 1]);
    return { edge: s.e, zone: ZONES[s.zn], zi: s.zn, pf, length: L };
  });
  const paths = peds.paths.map((p) => ({
    kind: peds.pathKinds[p.k],
    width: p.w,
    surface: p.s || null,
    bridge: !!p.br,
    name: p.n >= 0 ? peds.pathNames[p.n] : null,
    pf: Float32Array.from(p.p, (v) => v * Q),
  }));
  const lineBBox = (pf, bb) => {
    bb[0] = bb[1] = Infinity;
    bb[2] = bb[3] = -Infinity;
    for (let i = 0; i < pf.length; i += 2) {
      if (pf[i] < bb[0]) bb[0] = pf[i];
      if (pf[i] > bb[2]) bb[2] = pf[i];
      if (pf[i + 1] < bb[1]) bb[1] = pf[i + 1];
      if (pf[i + 1] > bb[3]) bb[3] = pf[i + 1];
    }
  };
  const namedPaths = paths.filter(
    (p) =>
      p.name &&
      (p.kind === 'pedestrian' ||
        p.kind === 'footway' ||
        p.kind === 'path' ||
        p.kind === 'cycleway'),
  );
  const namedPathHash = namedPaths.length
    ? buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 60, namedPaths.length, (k, bb) => {
        lineBBox(namedPaths[k].pf, bb);
        bb[0] -= 60;
        bb[1] -= 60;
        bb[2] += 60;
        bb[3] += 60;
      })
    : null;
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const swHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 50, swLines.length, (k, bb) =>
    lineBBox(swLines[k].pf, bb),
  );
  const pedPaths = paths.filter(
    (p) =>
      !p.bridge &&
      (p.kind === 'sidewalk' ||
        p.kind === 'footway' ||
        p.kind === 'pedestrian' ||
        p.kind === 'path'),
  );
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const pathHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 50, pedPaths.length, (k, bb) =>
    lineBBox(pedPaths[k].pf, bb),
  );
  const CAND = new Int32Array(8192);
  const seenStamp = new Int32Array(Math.max(swLines.length, pedPaths.length, 1));
  let stamp = 0;
  function gather(hash, lines, x, z, r, zoneSet) {
    stamp++;
    let n = 0;
    const i0 = Math.max(0, Math.floor((x - r - hash.minX) / hash.cell)),
      i1 = Math.min(hash.nx - 1, Math.floor((x + r - hash.minX) / hash.cell));
    const j0 = Math.max(0, Math.floor((z - r - hash.minZ) / hash.cell)),
      j1 = Math.min(hash.nz - 1, Math.floor((z + r - hash.minZ) / hash.cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const c = j * hash.nx + i;
        for (let s = hash.start[c], end = hash.start[c + 1]; s < end && n < CAND.length; s++) {
          const k = hash.items[s];
          if (seenStamp[k] === stamp) continue;
          seenStamp[k] = stamp;
          if (zoneSet && !zoneSet.has(lines[k].zone)) continue;
          CAND[n++] = k;
        }
      }
    return n;
  }
  function pointOnLine(pf, frac, out) {
    let L = 0;
    for (let i = 2; i < pf.length; i += 2)
      L += Math.hypot(pf[i] - pf[i - 2], pf[i + 1] - pf[i - 1]);
    let s = L * frac;
    for (let i = 2; i < pf.length; i += 2) {
      const l = Math.hypot(pf[i] - pf[i - 2], pf[i + 1] - pf[i - 1]);
      if (s <= l || i === pf.length - 2) {
        const u = l > 0 ? Math.min(1, s / l) : 0;
        out.x = pf[i - 2] + (pf[i] - pf[i - 2]) * u;
        out.z = pf[i - 1] + (pf[i + 1] - pf[i - 1]) * u;
        out.dx = (pf[i] - pf[i - 2]) / (l || 1);
        out.dz = (pf[i + 1] - pf[i - 1]) / (l || 1);
        return out;
      }
      s -= l;
    }
    out.x = pf[0];
    out.z = pf[1];
    out.dx = 1;
    out.dz = 0;
    return out;
  }
  const TMP = { x: 0, z: 0, dx: 0, dz: 0 };
  const rnd = opts.random || Math.random;
  function pickSidewalk(near, radius, zone, out) {
    const zs = zone ? new Set(Array.isArray(zone) ? zone : [zone]) : null;
    const tries = [
      [swHash, swLines, zs],
      [pathHash, pedPaths, null],
      [swHash, swLines, null],
    ];
    for (const [hash, lines, zset] of tries) {
      for (let r = radius, pass = 0; pass < 3; pass++, r *= 2) {
        let n;
        if (near) n = gather(hash, lines, near.x, near.z, r, zset);
        else {
          // global: sample random lines
          n = 0;
          for (let a = 0; a < 64 && n < 64; a++) {
            const k = (rnd() * lines.length) | 0;
            if (!zset || zset.has(lines[k].zone)) CAND[n++] = k;
          }
        }
        for (let a = 0; a < 12 && n > 0; a++) {
          const ln = lines[CAND[(rnd() * n) | 0]];
          pointOnLine(ln.pf, rnd(), TMP);
          if (near && (TMP.x - near.x) ** 2 + (TMP.z - near.z) ** 2 > r * r) continue;
          out.set(TMP.x, groundHeightAt(TMP.x, TMP.z, 0.5), TMP.z);
          return out;
        }
        if (!near) break;
      }
    }
    return null;
  }
  function randomSidewalkPoint(near = null, radius = 150, zone = null) {
    const out = new THREE.Vector3();
    if (pickSidewalk(near, radius, zone, out)) return out;
    return out.set(man.playerSpawn.x, man.playerSpawn.y, man.playerSpawn.z);
  }

  // ---------------------------------------------------------------- random road point (right-hand traffic)
  const NO_SPAWN = new Set(['service', 'living_street']);
  const roadSpawnOK = (e) => !NO_SPAWN.has(e.kind) && e.length > 8;
  // signed lateral offset (m) of a lane centre from the edge centreline, + = right of the travel direction.
  // Lanes span (lanesFwd + lanesBack) * laneWidth centred on the centreline; lane 0 = kerb-side (rightmost) lane.
  function laneOffsetFor(e, dir, lane) {
    const nl = e.lanesFwd + e.lanesBack;
    const lw = Math.min(
      3.7,
      Math.max(2.6, (e.width - (e.kind === 'motorway' ? 0 : 1)) / Math.max(1, nl)),
    );
    const myLanes = Math.max(1, dir > 0 ? e.lanesFwd : e.lanesBack);
    lane = Math.min(Math.max(0, lane), myLanes - 1);
    return (Math.max(1, nl) / 2 - lane - 0.5) * lw;
  }
  function randomRoadPoint(near = null, radius = 250, o = {}) {
    let e = null,
      s = 0;
    const filter = o.filter || roadSpawnOK;
    for (let a = 0; a < 40 && !e; a++) {
      let cand;
      if (near) {
        const ang = rnd() * Math.PI * 2,
          rr = Math.sqrt(rnd()) * radius;
        const qx = near.x + Math.sin(ang) * rr,
          qz = near.z + Math.cos(ang) * rr;
        if (!nearestSeg(qx, qz, 80, filter)) continue;
        cand = edges[NE.e];
        const p = cand.pf,
          oo = NE.seg * 2;
        s = cand.cum[NE.seg] + Math.hypot(p[oo + 2] - p[oo], p[oo + 3] - p[oo + 1]) * NE.u;
        if ((NE.px - near.x) ** 2 + (NE.pz - near.z) ** 2 > radius * radius * 1.2) continue;
      } else {
        cand = edges[(rnd() * edges.length) | 0];
        if (!filter(cand)) continue;
        s = rnd() * cand.length;
      }
      e = cand;
    }
    if (!e) {
      e = edges.find(filter) || edges[0];
      s = e.length / 2;
    }
    s = Math.min(e.length - 2, Math.max(2, s));
    const dir = e.oneway || e.lanesBack === 0 ? 1 : rnd() < 0.5 ? 1 : -1;
    const lanes = dir > 0 ? e.lanesFwd : e.lanesBack;
    const lane = (rnd() * Math.max(1, lanes)) | 0;
    const off = laneOffsetFor(e, dir, lane);
    roadGraph.pointAt(e, s, TMP2);
    const tx = TMP2.dx * dir,
      tz = TMP2.dz * dir; // travel direction
    const rx = -tz,
      rz = tx; // right-hand vector
    const position = new THREE.Vector3(TMP2.x + rx * off, TMP2.y, TMP2.z + rz * off);
    return { position, heading: Math.atan2(tx, tz), edgeId: e.id, laneOffset: off, dir, s, lane };
  }
  const TMP2 = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };

  // ---------------------------------------------------------------- spots (storefronts, benches, lean spots)
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const storefronts = spots.storefronts.map((s) => {
    const c = Math.abs(Math.cos(s.facing)),
      sn = Math.abs(Math.sin(s.facing));
    return { ...s, sx: s.w * c + s.d * sn, sz: s.w * sn + s.d * c, district: districtAt(s.x, s.z) };
  });
  const benches = spots.benches.map((b) => ({
    pos: new THREE.Vector3(b.x, groundHeightAt(b.x, b.z, 0.5), b.z),
    heading: b.heading,
  }));
  const leanSpots = spots.leanSpots.map((b) => ({
    pos: new THREE.Vector3(b.x, groundHeightAt(b.x, b.z, 0.5), b.z),
    heading: b.heading,
  }));
  function pointIndex(list, getX, getZ, cell = 50) {
    const h = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, cell, list.length, (k, bb) => {
      bb[0] = bb[2] = getX(list[k]);
      bb[1] = bb[3] = getZ(list[k]);
    });
    return (x, z, r, out = []) => {
      out.length = 0;
      const i0 = Math.max(0, Math.floor((x - r - h.minX) / cell)),
        i1 = Math.min(h.nx - 1, Math.floor((x + r - h.minX) / cell));
      const j0 = Math.max(0, Math.floor((z - r - h.minZ) / cell)),
        j1 = Math.min(h.nz - 1, Math.floor((z + r - h.minZ) / cell));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const c = j * h.nx + i;
          for (let s = h.start[c]; s < h.start[c + 1]; s++) {
            const it = list[h.items[s]],
              dx = getX(it) - x,
              dz = getZ(it) - z;
            if (dx * dx + dz * dz <= r * r) out.push(it);
          }
        }
      return out;
    };
  }
  const storefrontsNear = pointIndex(
    storefronts,
    (s) => s.x,
    (s) => s.z,
  );
  const benchesNear = pointIndex(
    benches,
    (s) => s.pos.x,
    (s) => s.pos.z,
  );
  const leanSpotsNear = pointIndex(
    leanSpots,
    (s) => s.pos.x,
    (s) => s.pos.z,
  );

  // ---------------------------------------------------------------- legacy + map layers
  const roads = [];
  for (const e of edges) {
    const p = e.pf;
    for (let i = 0; i < p.length - 2; i += 2)
      roads.push({
        x1: p[i],
        z1: p[i + 1],
        x2: p[i + 2],
        z2: p[i + 3],
        width: e.width,
        edgeId: e.id,
        kind: e.kind,
      });
  }
  const ring = (a) => {
    const r = new Array(a.length / 2);
    for (let i = 0; i < r.length; i++) r[i] = [a[2 * i] * Q, a[2 * i + 1] * Q];
    return r;
  };
  const polyL = (lst) => lst.map((p) => ({ outer: ring(p.p), holes: (p.ho || []).map(ring) }));
  const buildingPolys = map.buildings.map((b) => ({ outer: ring(b.p), h: b.h }));
  const buildings = buildingPolys.map((b) => {
    let x0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      z1 = -Infinity;
    for (const [x, z] of b.outer) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h: b.h };
  });
  const coverLayers = {};
  for (const k in map.cover || {}) coverLayers[k] = polyL(map.cover[k]);
  const mapLayers = {
    land: polyL(map.land),
    water: polyL(map.water),
    beach: polyL(map.beach),
    park: polyL(map.park),
    buildingPolys,
    roadEdges: edges,
    attribution: man.attribution,
    // V2: land cover polygons by class (forest, sawgrass, wetland, mangrove, farmland, grove, runway, taxiway, apron, ...),
    // rail lines [{ kind, pts, elevated }], and the 1:1 real-Miami rectangle
    cover: coverLayers,
    rails: (map.rails || []).map((r) => ({ kind: r.k, pts: ring(r.p), elevated: !!r.el })),
    realRect: { ...RR },
  };

  // ---------------------------------------------------------------- tiles (region bundles, loaded on demand)
  // Grid aligned to world multiples of tileSize: tile (tx,tz) covers [tx*TS,(tx+1)*TS) x [tz*TS,(tz+1)*TS). Key "tx_tz".
  // Tiles ship in region bundles of RT x RT tiles (800 m). Regions around the player are fetched ahead of time by
  // data.update(); a tile is available synchronously once its region is in memory (tileReady).
  const TS = man.tileSize,
    TR = man.tileRange,
    RT = man.regionTiles || 4;
  const tileSet = new Set(man.tiles);
  const regionSet = new Set(man.regions);
  const bootRegions = new Set(man.bootRegions || []);
  const tileKey = (tx, tz) => `${tx}_${tz}`;
  const regionKeyOf = (tx, tz) => `${Math.floor(tx / RT)}_${Math.floor(tz / RT)}`;
  const regions = new Map(); // key -> { key, state: 'loading' | 'ready' | 'failed', tiles: {tileKey: raw}, promise, used, bytes, ms }
  const regionStats = {
    loaded: 0,
    loading: 0,
    failed: 0,
    evicted: 0,
    bytes: 0,
    fetchMs: [],
    parseMs: [],
    maxParseMs: 0,
    requests: 0,
  };
  function loadRegion(rk) {
    let R = regions.get(rk);
    if (R) return R.promise;
    if (!regionSet.has(rk)) return Promise.resolve(null);
    R = {
      key: rk,
      state: 'loading',
      tiles: null,
      promise: null,
      used: performance.now(),
      bytes: man.regionBytes?.[rk] || 0,
      ms: 0,
    };
    regions.set(rk, R);
    regionStats.loading++;
    regionStats.requests++;
    const ts = performance.now();
    R.promise = fetch(base + F.region.replace('{key}', rk))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return typeof r.text === 'function' ? r.text() : r.json();
      })
      .then((txt) => {
        const tp = performance.now();
        const j = typeof txt === 'string' ? JSON.parse(txt) : txt;
        const pm = performance.now() - tp;
        R.tiles = j.tiles;
        R.state = 'ready';
        R.ms = performance.now() - ts;
        regionStats.loading--;
        regionStats.loaded++;
        regionStats.bytes += typeof txt === 'string' ? txt.length : R.bytes;
        if (regionStats.fetchMs.length < 4096) {
          regionStats.fetchMs.push(R.ms);
          regionStats.parseMs.push(pm);
        }
        if (pm > regionStats.maxParseMs) regionStats.maxParseMs = pm;
        return R;
      })
      .catch((err) => {
        // a failed region is forgotten so the next request retries it (never cache a hole)
        console.warn('[miami data] region', rk, 'failed to load:', err?.message || err);
        regions.delete(rk);
        regionStats.loading--;
        regionStats.failed++;
        return null;
      });
    return R.promise;
  }
  const regionReady = (rk) => !regionSet.has(rk) || regions.get(rk)?.state === 'ready';
  // true when tile (tx,tz) and its 8 neighbors can be read synchronously (the renderer looks at neighbors for seams)
  function tileReady(tx, tz, ring = 1) {
    for (let j = -ring; j <= ring; j++)
      for (let i = -ring; i <= ring; i++)
        if (!regionReady(regionKeyOf(tx + i, tz + j))) return false;
    return true;
  }
  // start loading whatever tileReady(tx, tz) is waiting for; returns a promise that resolves when it is all in memory
  function requestTile(tx, tz, ring = 1) {
    const ps = [];
    let last = null;
    for (let j = -ring; j <= ring; j++)
      for (let i = -ring; i <= ring; i++) {
        const rk = regionKeyOf(tx + i, tz + j);
        if (rk === last) continue;
        last = rk;
        if (regionSet.has(rk) && regions.get(rk)?.state !== 'ready') ps.push(loadRegion(rk));
      }
    return ps.length ? Promise.all(ps) : null;
  }
  // regions whose square is within r of (x, z), nearest first
  function regionsAround(x, z, r, out = []) {
    out.length = 0;
    const RS = TS * RT,
      a0 = Math.floor((x - r) / RS),
      a1 = Math.floor((x + r) / RS),
      b0 = Math.floor((z - r) / RS),
      b1 = Math.floor((z + r) / RS);
    const tmp = [];
    for (let b = b0; b <= b1; b++)
      for (let a = a0; a <= a1; a++) {
        const k = `${a}_${b}`;
        if (!regionSet.has(k)) continue;
        const cx = Math.max(a * RS, Math.min(x, (a + 1) * RS)),
          cz = Math.max(b * RS, Math.min(z, (b + 1) * RS));
        const d = Math.hypot(cx - x, cz - z);
        if (d <= r) tmp.push([d, k]);
      }
    tmp.sort((p, q) => p[0] - q[0]);
    for (const t of tmp) out.push(t[1]);
    return out;
  }
  // Streaming driver. focus = [{x, z, vx?, vz?}] (player, camera, car). Loads regions within loadR of each focus and of
  // the point it will reach in `ahead` seconds; frees regions farther than keepR from every focus.
  const STREAM = { loadR: opts.loadR ?? 2600, keepR: opts.keepR ?? 4800, ahead: 8, maxParallel: 6 };
  const _ra = [],
    _want = new Set();
  function update(focus) {
    const now = performance.now();
    _want.clear();
    for (const f of focus) {
      if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.z)) continue;
      for (const k of regionsAround(f.x, f.z, STREAM.loadR, _ra)) _want.add(k);
      const vx = f.vx || 0,
        vz = f.vz || 0;
      if (vx * vx + vz * vz > 16)
        for (const k of regionsAround(
          f.x + vx * STREAM.ahead,
          f.z + vz * STREAM.ahead,
          STREAM.loadR * 0.6,
          _ra,
        ))
          _want.add(k);
    }
    for (const k of _want) {
      const R = regions.get(k);
      if (R) R.used = now;
      else if (regionStats.loading < STREAM.maxParallel) loadRegion(k);
    }
    // eviction: far from every focus and not touched for 20 s
    if (regions.size > 12) {
      const RS = TS * RT;
      for (const [k, R] of regions) {
        if (R.state !== 'ready' || bootRegions.has(k) || _want.has(k) || now - R.used < 20000)
          continue;
        const [a, b] = k.split('_').map(Number);
        let near = false;
        for (const f of focus) {
          if (!f) continue;
          const cx = Math.max(a * RS, Math.min(f.x, (a + 1) * RS)),
            cz = Math.max(b * RS, Math.min(f.z, (b + 1) * RS));
          if (Math.hypot(cx - f.x, cz - f.z) < STREAM.keepR) {
            near = true;
            break;
          }
        }
        if (near) continue;
        for (const tk in R.tiles) {
          cityTiles.delete(tk);
          tileCache.delete(tk);
        }
        regions.delete(k);
        regionStats.loaded--;
        regionStats.evicted++;
      }
    }
  }
  const tileCache = new Map(); // key -> Promise<decoded tile>
  const clampT = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const tileIJ = (x, z) => [
    clampT(Math.floor(x / TS), TR.txMin, TR.txMax),
    clampT(Math.floor(z / TS), TR.tzMin, TR.tzMax),
  ];
  const tileKeyAt = (x, z) => {
    const [i, j] = tileIJ(x, z);
    return tileKey(i, j);
  };
  const tileBounds = (key) => {
    const [i, j] = key.split('_').map(Number);
    return { minX: i * TS, minZ: j * TS, maxX: (i + 1) * TS, maxZ: (j + 1) * TS, tx: i, tz: j };
  };
  function tilesAround(x, z, r, out = []) {
    out.length = 0;
    const i0 = Math.max(TR.txMin, Math.floor((x - r) / TS)),
      i1 = Math.min(TR.txMax, Math.floor((x + r) / TS));
    const j0 = Math.max(TR.tzMin, Math.floor((z - r) / TS)),
      j1 = Math.min(TR.tzMax, Math.floor((z + r) / TS));
    const tmp = [];
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = tileKey(i, j);
        if (!tileSet.has(k)) continue;
        const cx = Math.max(i * TS, Math.min(x, (i + 1) * TS)),
          cz = Math.max(j * TS, Math.min(z, (j + 1) * TS));
        const d = Math.hypot(cx - x, cz - z);
        if (d <= r) tmp.push([d, k]);
      }
    tmp.sort((a, b) => a[0] - b[0]);
    for (const t of tmp) out.push(t[1]);
    return out;
  }
  const rawTile = (key) => {
    const [i, j] = key.split('_').map(Number);
    const R = regions.get(regionKeyOf(i, j));
    if (R && R.state === 'ready') {
      R.used = performance.now();
      return R.tiles[key] || null;
    }
    return undefined;
  };
  const f32 = (a) => {
    const o = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = a[i] * Q;
    return o;
  };
  const polyT = (p) => ({ outer: f32(p.p), holes: (p.ho || []).map(f32) });
  // r6: fuel / carport canopies (style 'canopy') are drawn as a bare roof slab: no posts, no pumps, so the slab floats over
  // the lot (user: "remove this floating random concrete slab", Keys Conch Stop). A canopy may only exist together with
  // its posts and pumps; until a builder makes all three (it then sets game.canopyKit = true before the map loads) the
  // lot is left out of the tile: no slab, no collider, no footprint. ?canopyslab=1 = old.
  const CANOPY_OLD = typeof location !== 'undefined' && /[?&]canopyslab=1/.test(location.search);
  const canopySkips = [];
  if (typeof window !== 'undefined') window.__canopySkips = canopySkips;
  const canopyOk = (r) => {
    if (r.st !== 'canopy') return true;
    if (canopySkips.length < 4000 && !canopySkips.some((c) => c.id === r.id)) {
      const p = r.p || [];
      canopySkips.push({ id: r.id, x: (p[0] || 0) * Q, z: (p[1] || 0) * Q, h: r.h });
    }
    return CANOPY_OLD || !!game?.canopyKit;
  };
  const DEG = Math.PI / 180;
  function decodeProps(pp, ph) {
    const out = [];
    for (let i = 0; i < pp.length; i += 3)
      out.push({ type: man.props[pp[i]], x: pp[i + 1] * Q, z: pp[i + 2] * Q });
    for (let i = 0; i < (ph ? ph.length : 0); i += 4)
      out.push({
        type: man.props[ph[i]],
        x: ph[i + 1] * Q,
        z: ph[i + 2] * Q,
        heading: ph[i + 3] * DEG,
      });
    return out;
  }
  const bExtra = (r) => ({
    use: r.u || null,
    poiKind: r.kd || null,
    osm: r.o || null,
    sub: r.sb || null,
    tier: r.ti || null,
    address: r.ad || null,
    material: r.mt || null,
    roofMaterial: r.rm || null,
    roofHeight: r.rh || 0,
    roofLevels: r.rl || 0,
    year: r.yr || null,
    architecture: r.ar || null,
    tenants: r.tn || null,
    synthetic: !!r.syn,
    heading: r.hd ?? null,
    sourceId: r.sid || null,
  });
  const poiT = (p) => ({
    kind: p.k,
    x: p.x * Q,
    z: p.z * Q,
    osm: p.o || null,
    sub: p.s || null,
    tier: p.t || null,
    buildingId: p.b ?? null,
    address: p.a || null,
    level: p.l || 0,
  });
  const yArr = (y) => (y ? Float32Array.from(y, (v) => v / 100) : null);
  // Generic decoded tile (flat Float32Array rings) — see tools/osm/README.md
  function decodeTile(T) {
    return {
      key: T.k,
      tx: T.i,
      tz: T.j,
      bounds: tileBounds(T.k),
      buildings: (T.b || [])
        .filter(canopyOk)
        .map((r) => ({
          id: r.id,
          ...polyT(r),
          h: r.h,
          minH: r.mh || 0,
          levels: r.lv || 0,
          type: r.t,
          style: r.st,
          zone: ZONES[r.zn],
          part: !!r.part,
          colour: r.col || null,
          roofColour: r.rcol || null,
          roofShape: r.rs || null,
          ...bExtra(r),
        })),
      land: (T.ld || []).map(polyT),
      sidewalks: (T.sw || []).map(polyT),
      landcover: (T.lu || []).map((r) => ({ cls: r.c, surface: r.s, ...polyT(r) })),
      sites: (T.st || []).map((r) => ({
        use: r.u,
        kind: r.kd || null,
        sub: r.sb || null,
        tier: r.ti || null,
        ...polyT(r),
      })),
      underwater: (T.xa || []).map((r) => ({ kind: r.k, ...polyT(r) })),
      paths: (T.fw || []).map((r) => ({
        kind: r.k,
        width: r.w,
        surface: r.s || null,
        bridge: !!r.br,
        sub: r.sb || null,
        pts: f32(r.p),
      })),
      piers: (T.pr || []).map((r) => ({
        kind: r.k,
        y: Math.min(r.y ?? PIER_Y, PIER_Y),
        ...polyT(r),
      })),
      rails: (T.rl || []).map((r) => ({ kind: r.k, pts: f32(r.p), y: yArr(r.y), bridge: !!r.br })),
      barriers: (T.bar || []).map((r) => ({
        kind: r.k,
        pts: f32(r.p),
        height: r.h || 0,
        material: r.m || null,
      })),
      roadEdges: (T.r || []).map((k) => edges[k]), // edges whose midpoint is in this tile (draw each edge once)
      roadEdgesTouching: (T.rt || []).map((k) => edges[k]), // every edge crossing the tile (colliders)
      storefronts: (T.sf || []).map((k) => storefronts[k]),
      benches: (T.bn || []).map((k) => benches[k]),
      leanSpots: (T.ls || []).map((k) => leanSpots[k]),
      props: decodeProps(T.pp || [], T.ph),
      pois: (T.poi || []).map(poiT),
      setpieces: (T.sp || []).map((p) => ({ id: p.id, x: p.x, z: p.z, heading: p.h || 0 })),
      relief: T.hm ? { min: T.hm[0] * 0.1, max: T.hm[1] * 0.1 } : null,
    };
  }
  function loadTile(key) {
    let p = tileCache.get(key);
    if (p) return p;
    if (!tileSet.has(key)) p = Promise.resolve(null);
    else {
      const [i, j] = key.split('_').map(Number);
      p = loadRegion(regionKeyOf(i, j)).then((R) => {
        if (!R) {
          tileCache.delete(key);
          throw new Error('miami data: region for tile ' + key + ' failed to load');
        }
        return R.tiles[key] ? decodeTile(R.tiles[key]) : null;
      });
    }
    tileCache.set(key, p);
    return p;
  }
  const unloadTile = (key) => tileCache.delete(key);

  // ---- CITY renderer adapter: synchronous getTile(tx, tz) in the renderer's internal tile format ----
  // Returns the tile, null when the tile is empty (open water), or undefined when its region is not in memory yet
  // (use tileReady / requestTile, or the provider's waitTile generator, before building from it).
  const ringA = (a) => {
    const r = new Array(a.length / 2);
    for (let i = 0; i < r.length; i++) r[i] = [a[2 * i] * Q, a[2 * i + 1] * Q];
    return r;
  };
  const ringsA = (p) => [ringA(p.p), ...(p.ho || []).map(ringA)];
  // land cover class -> the renderer's ground bucket (`kind`). The precise class stays in `cls`.
  const LC_KIND = {
    sand: 'beach',
    dune: 'beach',
    park: 'park',
    pitch: 'park',
    playground: 'park',
    golf: 'park',
    cemetery: 'park',
    garden: 'park',
    campground: 'park',
    grass: 'grass',
    island: 'grass',
    wild: 'grass',
    scrub: 'grass',
    forest: 'grass',
    pine: 'grass',
    sawgrass: 'grass',
    wetland: 'grass',
    mangrove: 'grass',
    farmland: 'grass',
    grove: 'grass',
    parking: 'parking',
    plaza: 'paved',
    marina: 'paved',
    paved: 'paved',
    apron: 'paved',
    runway: 'parking',
    taxiway: 'parking',
    dirt: 'land',
    construction: 'land',
    rock: 'land',
    gravel: 'land',
  };
  const PALMS = new Set(['palm', 'royal_palm', 'coconut']);
  const TREES = new Set([
    'tree',
    'palm',
    'royal_palm',
    'coconut',
    'oak',
    'pine',
    'cypress',
    'mangrove',
    'citrus',
    'gumbo',
    'banyan',
    'seagrape',
  ]);
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const sfByBuilding = new Map();
  for (const s of storefronts)
    if (!sfByBuilding.has(s.buildingId)) sfByBuilding.set(s.buildingId, s);
  const cityTiles = new Map();
  let nodesByTile = null;
  function getTile(tx, tz) {
    const key = tileKey(tx, tz);
    const hit = cityTiles.get(key);
    if (hit !== undefined) return hit;
    if (!tileSet.has(key)) {
      cityTiles.set(key, null);
      return null;
    }
    const T = rawTile(key);
    if (T === undefined) return undefined; // region not loaded yet (never cached as empty)
    if (!T) {
      cityTiles.set(key, null);
      return null;
    }
    const x0 = tx * TS,
      z0 = tz * TS,
      x1 = x0 + TS,
      z1 = z0 + TS;
    const inT = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const areas = [];
    for (const p of T.ld || []) areas.push({ kind: 'land', rings: ringsA(p) });
    for (const p of T.lu || []) {
      if (p.c === 'pool') continue;
      /* pools are not ground (as in V1) */ const k =
        LC_KIND[p.c] ||
        (p.s === 'sand'
          ? 'beach'
          : /grass/.test(p.s || '')
            ? 'grass'
            : p.s === 'asphalt'
              ? 'parking'
              : p.s === 'dirt'
                ? 'land'
                : p.s
                  ? 'paved'
                  : null);
      if (k) areas.push({ kind: k, cls: p.c, surface: p.s, rings: ringsA(p) });
    }
    // road pieces: segments whose midpoint lies in this tile
    const roads = [];
    for (const k of T.rt || []) {
      const e = edges[k],
        p = e.pf;
      let cur = null;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const mx = (p[2 * i] + p[2 * i + 2]) / 2,
          mz = (p[2 * i + 1] + p[2 * i + 3]) / 2;
        if (!inT(mx, mz)) {
          cur = null;
          continue;
        }
        if (!cur) {
          cur = {
            id: e.id,
            edgeId: e.id,
            pts: [e.pts[i]],
            y: e.elevated ? [e.y[i]] : null,
            width: e.width,
            lanesFwd: e.lanesFwd,
            lanesBack: e.lanesBack,
            oneway: e.oneway,
            kind: e.kind,
            bridge: e.bridge,
            name: e.name,
            speedKmh: e.speedKmh,
            sidewalks: e.sidewalk > 0,
            sidewalkWidth: e.sidewalk,
            layer: e.layer,
            ref: e.ref,
            surface: e.surface,
            lit: e.lit,
            toll: e.toll,
            synthetic: e.synthetic,
            terrainY: e.terrain ? [e.y[i]] : null,
          };
          roads.push(cur);
        }
        cur.pts.push(e.pts[i + 1]);
        if (cur.y) cur.y.push(e.y[i + 1]);
        if (cur.terrainY) cur.terrainY.push(e.y[i + 1]);
      }
    }
    const pp = T.pp || [];
    const trees = [],
      palms = [],
      signals = [],
      lamps = [],
      busStops = [],
      crossings = [],
      stops = [],
      other = [];
    for (let i = 0; i < pp.length; i += 3) {
      const t = man.props[pp[i]],
        xz = [pp[i + 1] * Q, pp[i + 2] * Q];
      if (TREES.has(t)) {
        xz.push(t);
        trees.push(xz);
        if (PALMS.has(t)) palms.push(xz);
      } else if (t === 'signal') signals.push(xz);
      else if (t === 'lamp') lamps.push(xz);
      else if (t === 'bus') busStops.push(xz);
      else if (t === 'crossing') crossings.push(xz);
      else if (t === 'stop') stops.push(xz);
      else other.push({ type: t, x: xz[0], z: xz[1] });
    }
    const ph = T.ph || [];
    for (let i = 0; i < ph.length; i += 4)
      other.push({
        type: man.props[ph[i]],
        x: ph[i + 1] * Q,
        z: ph[i + 2] * Q,
        heading: ph[i + 3] * DEG,
      });
    const nodesT = [];
    if (!nodesByTile) {
      nodesByTile = new Map();
      for (const n of nodes) {
        const k = tileKey(Math.floor(n.x / TS), Math.floor(n.z / TS));
        if (!nodesByTile.has(k)) nodesByTile.set(k, []);
        nodesByTile.get(k).push(n);
      }
    }
    for (const n of nodesByTile.get(key) || []) {
      if (n.y > 0.3 && !n.terrain) continue;
      let w = 0;
      const dirs = [];
      for (const k of n.edges) {
        const e = edges[k];
        w = Math.max(w, e.width);
        const p = e.pts,
          atA = e.a === n.id;
        const q = atA ? p[0] : p[p.length - 1],
          r = atA ? p[1] : p[p.length - 2];
        const L = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
        dirs.push([(r[0] - q[0]) / L, (r[1] - q[1]) / L, e.width, e.kind, e.name]);
        if (e.a === e.b)
          dirs.push([
            (p[p.length - 2][0] - q[0]) / L,
            (p[p.length - 2][1] - q[1]) / L,
            e.width,
            e.kind,
            e.name,
          ]);
      }
      let signal = n.signal;
      if (!signal)
        for (const s of signals)
          if ((s[0] - n.x) ** 2 + (s[1] - n.z) ** 2 < 400) {
            signal = true;
            break;
          }
      nodesT.push({
        id: n.id,
        x: n.x,
        z: n.z,
        y: n.terrain ? 0 : n.y,
        degree: dirs.length,
        signal,
        width: w,
        dirs,
        exit: n.exit,
      });
    }
    const buildingsT = (T.b || [])
      .filter(canopyOk)
      .map((r) => {
        const rings = ringsA(r),
          o = rings[0];
        let cx = 0,
          cz = 0,
          ar = 0;
        for (let i = 0; i < o.length; i++) {
          const a = o[i],
            b = o[(i + 1) % o.length];
          ar += a[0] * b[1] - b[0] * a[1];
          cx += a[0];
          cz += a[1];
        }
        cx /= o.length;
        cz /= o.length;
        return {
          id: r.id,
          rings,
          h: r.h,
          minH: r.mh || 0,
          levels: r.lv || 0,
          kind: r.t,
          type: r.t,
          style: r.st,
          zone: ZONES[r.zn],
          part: !!r.part,
          roof: r.rs || 'flat',
          colour: r.col || null,
          roofColour: r.rcol || null,
          name: null,
          area: Math.abs(ar / 2),
          cx,
          cz,
          storefront: sfByBuilding.get(r.id) || null,
          ...bExtra(r),
        };
      })
      .filter((b) => {
        // map audit (user: houses / buildings standing sunk in the sea): a footprint mostly over water (stale data on a
        // moved coastline) is not built; piers, boathouses and marinas stand on the water on purpose. ?mapfix=0 = old
        if (MAPFIX_OFF || /pier|dock|boat|marina|houseboat/.test(String(b.kind || ''))) return true;
        const o = b.rings[0];
        let w = isWater(b.cx, b.cz) ? 1 : 0;
        for (const q of o) if (isWater(b.cx + (q[0] - b.cx) * 0.8, b.cz + (q[1] - b.cz) * 0.8)) w++;
        return w / (o.length + 1) < 0.5;
      });
    const tile = {
      tx,
      tz,
      x0,
      z0,
      size: TS,
      key,
      areas,
      roads,
      nodes: nodesT,
      buildings: buildingsT,
      trees,
      palms,
      signals,
      lamps,
      busStops,
      crossings,
      stops,
      props: other,
      sidewalkPolys: (T.sw || []).map(ringsA),
      paths: (T.fw || []).map((r) => ({
        kind: r.k,
        width: r.w,
        surface: r.s || null,
        bridge: !!r.br,
        sub: r.sb || null,
        pts: ringA(r.p),
      })),
      piers: (T.pr || []).map((r) => ({
        kind: r.k,
        y: Math.min(r.y ?? PIER_Y, PIER_Y),
        rings: ringsA(r),
      })),
      storefronts: (T.sf || []).map((k) => storefronts[k]),
      benches: (T.bn || []).map((k) => benches[k]),
      leanSpots: (T.ls || []).map((k) => leanSpots[k]),
      pois: (T.poi || []).map(poiT),
      // V2 additions (see tools/osm/README.md "New in V2")
      sites: (T.st || []).map((r) => ({
        use: r.u,
        kind: r.kd || null,
        sub: r.sb || null,
        tier: r.ti || null,
        rings: ringsA(r),
      })),
      rails: (T.rl || []).map((r) => ({
        kind: r.k,
        pts: ringA(r.p),
        y: r.y ? r.y.map((v) => v / 100) : null,
        bridge: !!r.br,
      })),
      barriers: (T.bar || []).map((r) => ({
        kind: r.k,
        pts: ringA(r.p),
        height: r.h || 0,
        material: r.m || null,
      })),
      underwater: (T.xa || []).map((r) => ({ kind: r.k, rings: ringsA(r) })),
      setpieces: (T.sp || []).map((p) => ({ id: p.id, x: p.x, z: p.z, heading: p.h || 0 })),
      relief: T.hm ? { min: T.hm[0] * 0.1, max: T.hm[1] * 0.1 } : null,
    };
    cityTiles.set(key, tile);
    return tile;
  }

  // ---------------------------------------------------------------- places, transit
  const places = placesJ.places || [],
    setpieces = placesJ.setpieces || [],
    sites = placesJ.sites || [];
  const TQ = 1 / (transitJ.q || 10);
  const transit = {
    // bus / trolley stops: { x, z, name, kind, edge (road edge id), s (m along it), side (+1 = right of the edge direction), routes: [route index] }
    stops: (transitJ.stops || []).map((s, i) => ({
      id: i,
      x: s.x,
      z: s.z,
      name: s.name,
      kind: s.kind,
      edge: s.e,
      s: s.s,
      side: s.side,
      shelter: !!s.shelter,
      bench: !!s.bench,
      routes: s.routes,
    })),
    // routes: { ref, kind, name, stops: [stop index], edges: [[edgeId, dir]] (drivable path through every stop), loop, length }
    routes: transitJ.routes || [],
    // people mover / metro / rail lines: { kind, name, ref, pts: [[x,z]], y: Float32Array (track height), stations: [station index], loop }
    lines: (transitJ.lines || []).map((l) => {
      const pts = new Array(l.p.length / 2);
      for (let i = 0; i < pts.length; i++) pts[i] = [l.p[2 * i] * TQ, l.p[2 * i + 1] * TQ];
      return {
        kind: l.kind,
        name: l.name,
        ref: l.ref || null,
        colour: l.colour || null,
        pts,
        y: Float32Array.from(l.y, (v) => v / 100),
        stations: l.stations,
        loop: !!l.loop,
        length: l.length,
      };
    }),
    stations: transitJ.stations || [],
  };

  const spawn = new THREE.Vector3(man.playerSpawn.x, man.playerSpawn.y, man.playerSpawn.z);
  const data = {
    source: 'osm-miami',
    manifest: man,
    attribution: man.attribution,
    build: man.build,
    version: man.version,
    bounds: { ...B },
    realRect: { ...RR },
    seaLevel: SEA,
    curbHeight: CURB,
    pierHeight: PIER_Y,
    playerSpawn: spawn,
    playerSpawnHeading: man.playerSpawnHeading,
    groundHeightAt,
    isWater,
    surfaceAt,
    zoneAt,
    districtAt,
    streetNameAt,
    seabedDepthAt: (x, z) => (surfCode(x, z) === S_WATER ? swimDepthAt(x, z) : depthAt(x, z)),
    terrainHeightAt,
    coverAt,
    waterKindAt,
    inRealMiami: inReal,
    hasRelief: !!gH,
    isSliver,
    isWaterRaw,
    isIsletAt,
    heightField: gH
      ? { cell: gH.res, minX: gH.x0, minZ: gH.z0, nx: gH.w, nz: gH.h, unit: gH.unit, data: gH.data }
      : null,
    roadGraph,
    roads,
    buildings,
    mapLayers,
    randomRoadPoint,
    randomSidewalkPoint,
    storefronts,
    shopLots: storefronts,
    benches,
    leanSpots,
    storefrontsNear,
    benchesNear,
    leanSpotsNear,
    sidewalkLines: swLines,
    paths,
    names,
    places,
    setpieces,
    sites,
    transit,
    controls,
    layoutExtras: placesJ.other || {}, // top-level features.json lists passed through untouched (e.g. powerlines)
    // tiles
    tileSize: TS,
    tileRange: { ...TR },
    tileKeys: man.tiles,
    tileKey,
    tileKeyAt,
    tileIJ,
    tileBounds,
    tilesAround,
    hasTile: (k) => tileSet.has(k),
    loadTile,
    unloadTile,
    getTile, // sync, CITY renderer format: tile | null (empty) | undefined (region not in memory yet)
    tileReady,
    requestTile,
    regionsAround,
    loadRegion,
    regionKeyOf,
    regionStats,
    stream: STREAM,
    update,
    dropTileCache(key) {
      cityTiles.delete(key);
      tileCache.delete(key);
    },
    grids: G,
    loadTimeMs: 0,
    timings: null,
  };
  // regions needed synchronously at boot: the port (cruise terminals) and the area around the default spawn
  await breathe(); // stage 1 boot pacing (src/core/pace.js)
  const tBoot = performance.now();
  if (opts.bundle !== false) {
    const first = new Set(bootRegions);
    for (const k of regionsAround(spawn.x, spawn.z, opts.bootR ?? 700)) first.add(k);
    if (opts.at)
      for (const k of regionsAround(opts.at.x, opts.at.z, opts.bootR ?? 700)) first.add(k);
    await Promise.all([...first].map(loadRegion));
  }
  // keep the regions around the player in memory (ahead of the streamer, which needs tiles out to ~2.3 km)
  if (game && Array.isArray(game.updaters)) {
    const fc = { x: spawn.x, z: spawn.z, vx: 0, vz: 0 },
      fp = { x: spawn.x, z: spawn.z, vx: 0, vz: 0 },
      list = [fc, fp];
    let acc = 1;
    game.updaters.push((dt) => {
      acc += dt || 0.016;
      if (acc < 0.2) return;
      acc = 0;
      const c = game.camera?.position;
      if (c) {
        fc.x = c.x;
        fc.z = c.z;
      }
      const p = game.player?.position;
      if (p) {
        fp.vx = (p.x - fp.x) / 0.2;
        fp.vz = (p.z - fp.z) / 0.2;
        if (Math.abs(fp.vx) > 120 || Math.abs(fp.vz) > 120) {
          fp.vx = 0;
          fp.vz = 0;
        }
        fp.x = p.x;
        fp.z = p.z;
      }
      update(list);
    });
  }
  data.loadTimeMs = Math.round(performance.now() - t0);
  data.timings = {
    fetchMs: Math.round(tFetched - t0),
    decodeMs: Math.round(tBoot - tFetched),
    bootRegionsMs: Math.round(performance.now() - tBoot),
    totalMs: data.loadTimeMs,
  };
  if (game) game.miamiData = data;
  return data;
}
