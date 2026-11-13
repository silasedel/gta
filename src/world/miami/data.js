// Miami map data loader (DATA agent). Pure data + fast spatial queries; no rendering, no physics.
// Built from OpenStreetMap (c) OpenStreetMap contributors, ODbL, by tools/osm/build.py -> public/assets/miami/*.
// Frame (CONTRACT4): x east, z south (+Z), y up, metres. Heading 0 faces +Z; direction of heading h = (sin h, cos h).
// Format notes: tools/osm/README.md
import * as THREE from 'three';

const DEFAULT_BASE = '/assets/miami/';
const SURF_PUBLIC = { sidewalk: 'concrete', pier: 'wood', building: 'concrete' };

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`miami data: ${url} -> HTTP ${r.status}`);
  return r.json();
}

function decodeRLE(bytes, off, len, n) {
  const out = new Uint8Array(n);
  let p = 0;
  for (let i = off, end = off + len; i < end; i += 3) {
    const v = bytes[i];
    const run = bytes[i + 1] | (bytes[i + 2] << 8);
    if (v) out.fill(v, p, p + run);
    p += run;
  }
  return out;
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
    const i0 = ci(bb[0], minX, nx), i1 = ci(bb[2], minX, nx), j0 = ci(bb[1], minZ, nz), j1 = ci(bb[3], minZ, nz);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cnt[j * nx + i + 1]++;
  }
  for (let c = 1; c <= nx * nz; c++) cnt[c] += cnt[c - 1];
  const items = new Int32Array(cnt[nx * nz]);
  const fill = cnt.slice(0, nx * nz);
  for (let k = 0; k < count; k++) {
    bboxOf(k, bb);
    const i0 = ci(bb[0], minX, nx), i1 = ci(bb[2], minX, nx), j0 = ci(bb[1], minZ, nz), j1 = ci(bb[3], minZ, nz);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * nx + i]++] = k;
  }
  return { minX, minZ, cell, nx, nz, start: cnt, items };
}

export async function loadMiamiData(game, opts = {}) {
  const base = opts.base || DEFAULT_BASE;
  const t0 = performance.now();
  const man = await getJSON(base + 'manifest.json');
  const F = man.files;
  const [rg, peds, spots, map, names, gridBuf] = await Promise.all([
    getJSON(base + F.roadgraph), getJSON(base + F.peds), getJSON(base + F.spots), getJSON(base + F.map),
    getJSON(base + F.names), fetch(base + F.grid).then((r) => r.arrayBuffer()),
  ]);
  const Q = 1 / (man.q || 10);
  const B = man.bounds;
  const SEA = man.seaLevel;
  const CURB = man.curb;
  // docks / piers sit 0.3 m above the land (0.42 m above the water): the player steps straight on from shore
  // (autostep 0.35 m) and can climb out of the water onto them; the OSM pipeline's 1.2 m made a ledge you could not get onto
  const PIER_Y = Math.min(man.pierY ?? 0.3, 0.3);
  const SURF = man.surfaces, ZONES = man.zones, DISTRICTS = man.districts;
  const S_WATER = SURF.indexOf('water'), S_SIDEWALK = SURF.indexOf('sidewalk'), S_PIER = SURF.indexOf('pier');
  const S_BUILDING = SURF.indexOf('building'), S_ASPHALT = SURF.indexOf('asphalt');
  const Z_WATER = ZONES.indexOf('water'), Z_CAUSEWAY = ZONES.indexOf('causeway'), Z_RES = ZONES.indexOf('residential');
  const surfNames = SURF.map((s) => SURF_PUBLIC[s] || s);

  // ---------------------------------------------------------------- grids
  const bytes = new Uint8Array(gridBuf);
  const grids = {};
  for (const g of man.grids) grids[g.name] = { ...g, data: decodeRLE(bytes, g.offset, g.length, g.w * g.h) };
  const gS = grids.surface, gD = grids.depth, gZ = grids.zone, gT = grids.district;
  const cellOf = (g, x, z) => {
    let i = Math.floor((x - g.x0) / g.res), j = Math.floor((z - g.z0) / g.res);
    if (i < 0) i = 0; else if (i >= g.w) i = g.w - 1;
    if (j < 0) j = 0; else if (j >= g.h) j = g.h - 1;
    return j * g.w + i;
  };
  const surfCode = (x, z) => gS.data[cellOf(gS, x, z)];
  // swimmable water: at least MIN_DEPTH (5 m) everywhere except where the water meets a beach, which keeps its
  // gentle slope (the clamp ramps in from 8 m to 56 m off the sand). Cached per surface cell.
  const MIN_DEPTH = 5.0; // deep enough to dive under and swim along the bottom
  const S_SANDS = SURF.map((s, i) => (/sand|beach/i.test(s) ? i : -1)).filter((i) => i >= 0);
  const minDepthCache = new Map();
  function minDepthAt(x, z) {
    if (!S_SANDS.length) return MIN_DEPTH;
    const k = cellOf(gS, x, z); let v = minDepthCache.get(k);
    if (v === undefined) {
      let dB = Infinity;
      for (let r = 8; r <= 56 && dB === Infinity; r += 8) for (let a = 0; a < 12; a++) { const ang = (a / 12) * Math.PI * 2; if (S_SANDS.includes(surfCode(x + Math.cos(ang) * r, z + Math.sin(ang) * r))) { dB = r; break; } }
      v = dB === Infinity ? MIN_DEPTH : MIN_DEPTH * Math.min(1, Math.max(0, (dB - 8) / 48));
      if (minDepthCache.size > 400000) minDepthCache.clear();
      minDepthCache.set(k, v);
    }
    return v;
  }
  const swimDepthAt = (x, z) => Math.max(depthAt(x, z), minDepthAt(x, z));
  function depthAt(x, z) { // bilinear seabed depth (m, positive)
    const fx = (x - gD.x0) / gD.res - 0.5, fz = (z - gD.z0) / gD.res - 0.5;
    let i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const W = gD.w, H = gD.h, d = gD.data;
    const i0 = i < 0 ? 0 : i >= W ? W - 1 : i, i1 = i + 1 < 0 ? 0 : i + 1 >= W ? W - 1 : i + 1;
    const j0 = j < 0 ? 0 : j >= H ? H - 1 : j, j1 = j + 1 < 0 ? 0 : j + 1 >= H ? H - 1 : j + 1;
    const a = d[j0 * W + i0], b = d[j0 * W + i1], c = d[j1 * W + i0], e = d[j1 * W + i1];
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v) * 0.1;
  }

  // ---------------------------------------------------------------- road graph
  const nodes = [];
  for (let k = 0, n = rg.nodes.length / 2; k < n; k++) nodes.push({ id: k, x: rg.nodes[2 * k] * Q, z: rg.nodes[2 * k + 1] * Q, y: 0, edges: [] });
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
      if (i) cum[i] = cum[i - 1] + Math.hypot(pf[2 * i] - pf[2 * i - 2], pf[2 * i + 1] - pf[2 * i - 1]);
    }
    const y = r.y ? Float32Array.from(r.y, (v) => v / (rg.yq || 100)) : new Float32Array(n);
    const e = {
      id: k, a: r.a, b: r.b, pts, pf, cum, length: cum[n - 1], y, elevated: !!r.y,
      width: r.w, lanesFwd: r.lf, lanesBack: r.lb, oneway: !!r.o, speedKmh: r.s,
      name: r.n >= 0 ? rg.names[r.n] : null, kind: rg.kinds[r.k], bridge: !!r.br, movable: r.br === 2,
      layer: r.l || 0, sidewalk: r.sw || 0,
    };
    edges.push(e);
    nodes[e.a].edges.push(k);
    if (e.b !== e.a) nodes[e.b].edges.push(k);
    if (r.y) { nodes[e.a].y = Math.max(nodes[e.a].y, y[0]); nodes[e.b].y = Math.max(nodes[e.b].y, y[n - 1]); }
    segCount += n - 1;
  }
  // segment table
  const segE = new Int32Array(segCount), segI = new Int32Array(segCount);
  { let s = 0; for (const e of edges) for (let i = 0; i < e.pts.length - 1; i++) { segE[s] = e.id; segI[s] = i; s++; } }
  const segBBox = (k, bb, pad) => {
    const e = edges[segE[k]], p = e.pf, i = segI[k] * 2;
    bb[0] = Math.min(p[i], p[i + 2]) - pad; bb[2] = Math.max(p[i], p[i + 2]) + pad;
    bb[1] = Math.min(p[i + 1], p[i + 3]) - pad; bb[3] = Math.max(p[i + 1], p[i + 3]) + pad;
  };
  const edgeHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 40, segCount, (k, bb) => segBBox(k, bb, edges[segE[k]].width / 2));
  // elevated segments only (for groundHeightAt / surfaceAt on bridges)
  const elevSegs = [];
  for (let k = 0; k < segCount; k++) {
    const e = edges[segE[k]];
    if (e.elevated && (e.y[segI[k]] > 0.25 || e.y[segI[k] + 1] > 0.25)) elevSegs.push(k);
  }
  const elevHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 32, elevSegs.length, (k, bb) => segBBox(elevSegs[k], bb, edges[segE[elevSegs[k]]].width / 2 + 1));

  // nearest segment search (allocation-free; writes into `out`)
  const NE = { e: -1, seg: -1, u: 0, d2: Infinity, px: 0, pz: 0 };
  function nearestSeg(x, z, maxDist, filter) {
    NE.e = -1; NE.d2 = maxDist * maxDist;
    const H = edgeHash;
    const ci = Math.floor((x - H.minX) / H.cell), cj = Math.floor((z - H.minZ) / H.cell);
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
            const p = e.pf, o = segI[k] * 2;
            const ax = p[o], az = p[o + 1], dx = p[o + 2] - ax, dz = p[o + 3] - az;
            const L2 = dx * dx + dz * dz;
            let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
            const px = ax + dx * u, pz = az + dz * u;
            const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
            if (d2 < NE.d2) { NE.d2 = d2; NE.e = e.id; NE.seg = segI[k]; NE.u = u; NE.px = px; NE.pz = pz; }
          }
        }
      }
    }
    return NE.e >= 0;
  }
  function fillResult(out) {
    const e = edges[NE.e], p = e.pf, o = NE.seg * 2;
    const dx = p[o + 2] - p[o], dz = p[o + 3] - p[o + 1], L = Math.hypot(dx, dz) || 1;
    const s = e.cum[NE.seg] + L * NE.u;
    out.edge = e; out.seg = NE.seg; out.u = NE.u; out.s = s; out.t = e.length > 0 ? s / e.length : 0;
    out.dist = Math.sqrt(NE.d2);
    out.point = out.point || { x: 0, z: 0 }; out.point.x = NE.px; out.point.z = NE.pz;
    out.dir = out.dir || { x: 0, z: 0 }; out.dir.x = dx / L; out.dir.z = dz / L;
    out.y = e.y[NE.seg] + (e.y[NE.seg + 1] - e.y[NE.seg]) * NE.u;
    return out;
  }
  const isFootKind = () => false; // roadGraph holds drivable edges only (footpaths live in data.paths)
  const roadGraph = {
    nodes, edges, kinds: rg.kinds,
    // nearestEdge(x, z, out?, maxDist = 500) -> { edge, t (0..1 by length), s (metres), seg, u, dist, point{x,z}, dir{x,z}, y } | null
    nearestEdge(x, z, out = null, maxDist = 500, filter = null) {
      if (!nearestSeg(x, z, maxDist, filter)) return null;
      return fillResult(out || {});
    },
    edgesAt(nodeId) { const n = nodes[nodeId]; return n ? n.edges.map((k) => edges[k]) : []; },
    otherNode(edge, nodeId) { return edge.a === nodeId ? edge.b : edge.a; },
    // point + height + tangent at distance s (m) along edge; writes into out {x, y, z, dx, dz}
    pointAt(edge, s, out = {}) {
      const c = edge.cum, n = c.length;
      s = s < 0 ? 0 : s > edge.length ? edge.length : s;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
      const L = c[hi] - c[lo] || 1, u = (s - c[lo]) / L, p = edge.pf;
      const dx = p[2 * hi] - p[2 * lo], dz = p[2 * hi + 1] - p[2 * lo + 1], dl = Math.hypot(dx, dz) || 1;
      out.x = p[2 * lo] + dx * u; out.z = p[2 * lo + 1] + dz * u;
      out.y = edge.y[lo] + (edge.y[hi] - edge.y[lo]) * u;
      out.dx = dx / dl; out.dz = dz / dl;
      return out;
    },
    isFootpath: isFootKind,
  };

  // ---------------------------------------------------------------- bridges / height queries
  const DK = { y: 0, e: -1 };
  function deckAt(x, z, below) { // highest elevated deck covering (x,z) with height <= below; sets DK, returns bool
    const H = elevHash;
    const i = Math.floor((x - H.minX) / H.cell), j = Math.floor((z - H.minZ) / H.cell);
    DK.e = -1; DK.y = -Infinity;
    if (i < 0 || j < 0 || i >= H.nx || j >= H.nz) return false;
    const c = j * H.nx + i;
    for (let s = H.start[c], end = H.start[c + 1]; s < end; s++) {
      const k = elevSegs[H.items[s]];
      const e = edges[segE[k]], p = e.pf, o = segI[k] * 2;
      const ax = p[o], az = p[o + 1], dx = p[o + 2] - ax, dz = p[o + 3] - az;
      const L2 = dx * dx + dz * dz;
      let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const px = ax + dx * u - x, pz = az + dz * u - z, hw = e.width / 2 + 0.6;
      if (px * px + pz * pz > hw * hw) continue;
      const y = e.y[segI[k]] + (e.y[segI[k] + 1] - e.y[segI[k]]) * u;
      if (y < 0.25 || y > below) continue;
      if (y > DK.y) { DK.y = y; DK.e = e.id; }
    }
    return DK.e >= 0;
  }
  // ground top at (x,z). Optional y: when given, decks more than 4 m above y are ignored (you are under the bridge).
  function groundHeightAt(x, z, y) {
    if (deckAt(x, z, y === undefined ? Infinity : y + 4)) return DK.y;
    const s = surfCode(x, z);
    if (s === S_WATER) return SEA - Math.max(0.2, swimDepthAt(x, z));
    if (s === S_SIDEWALK) return CURB;
    if (s === S_PIER) return PIER_Y;
    return 0;
  }
  const isWater = (x, z) => surfCode(x, z) === S_WATER;
  function surfaceAt(x, z, y) {
    const s = surfCode(x, z);
    if ((s === S_WATER || y !== undefined) && deckAt(x, z, y === undefined ? Infinity : y + 1.5)) return 'asphalt';
    return surfNames[s];
  }
  function zoneAt(x, z) {
    const zn = gZ.data[cellOf(gZ, x, z)];
    if (isWater(x, z)) return zn === Z_CAUSEWAY ? 'causeway' : 'water';
    return ZONES[zn === Z_WATER ? Z_RES : zn];
  }
  const districtAt = (x, z) => DISTRICTS[gT.data[cellOf(gT, x, z)]] || null;
  const named = (e) => !!e.name;
  // nearest named street (drivable edges), or a named pedestrian street / promenade if that is closer
  function streetNameAt(x, z, maxDist = 60) {
    let best = null, bd = maxDist * maxDist;
    if (nearestSeg(x, z, maxDist, named)) { best = edges[NE.e].name; bd = NE.d2; }
    if (namedPathHash) {
      const H = namedPathHash, i = Math.floor((x - H.minX) / H.cell), j = Math.floor((z - H.minZ) / H.cell);
      if (i >= 0 && j >= 0 && i < H.nx && j < H.nz) {
        const c = j * H.nx + i;
        for (let s = H.start[c]; s < H.start[c + 1]; s++) {
          const p = namedPaths[H.items[s]], pf = p.pf;
          for (let k = 0; k < pf.length - 2; k += 2) {
            const ax = pf[k], az = pf[k + 1], dx = pf[k + 2] - ax, dz = pf[k + 3] - az, L2 = dx * dx + dz * dz;
            let u = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
            const ex = ax + dx * u - x, ez = az + dz * u - z, d2 = ex * ex + ez * ez;
            if (d2 < bd) { bd = d2; best = p.name; }
          }
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- sidewalks / paths
  const ZI = {}; ZONES.forEach((n, i) => { ZI[n] = i; });
  const swLines = peds.sidewalks.map((s) => {
    const pf = Float32Array.from(s.p, (v) => v * Q);
    let L = 0; for (let i = 2; i < pf.length; i += 2) L += Math.hypot(pf[i] - pf[i - 2], pf[i + 1] - pf[i - 1]);
    return { edge: s.e, zone: ZONES[s.zn], zi: s.zn, pf, length: L };
  });
  const paths = peds.paths.map((p) => ({ kind: peds.pathKinds[p.k], width: p.w, surface: p.s || null, bridge: !!p.br, name: p.n >= 0 ? peds.pathNames[p.n] : null, pf: Float32Array.from(p.p, (v) => v * Q) }));
  const lineBBox = (pf, bb) => {
    bb[0] = bb[1] = Infinity; bb[2] = bb[3] = -Infinity;
    for (let i = 0; i < pf.length; i += 2) {
      if (pf[i] < bb[0]) bb[0] = pf[i]; if (pf[i] > bb[2]) bb[2] = pf[i];
      if (pf[i + 1] < bb[1]) bb[1] = pf[i + 1]; if (pf[i + 1] > bb[3]) bb[3] = pf[i + 1];
    }
  };
  const namedPaths = paths.filter((p) => p.name && (p.kind === 'pedestrian' || p.kind === 'footway' || p.kind === 'path' || p.kind === 'cycleway'));
  const namedPathHash = namedPaths.length ? buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 60, namedPaths.length, (k, bb) => { lineBBox(namedPaths[k].pf, bb); bb[0] -= 60; bb[1] -= 60; bb[2] += 60; bb[3] += 60; }) : null;
  const swHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 50, swLines.length, (k, bb) => lineBBox(swLines[k].pf, bb));
  const pedPaths = paths.filter((p) => !p.bridge && (p.kind === 'sidewalk' || p.kind === 'footway' || p.kind === 'pedestrian' || p.kind === 'path'));
  const pathHash = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, 50, pedPaths.length, (k, bb) => lineBBox(pedPaths[k].pf, bb));
  const CAND = new Int32Array(8192);
  const seenStamp = new Int32Array(Math.max(swLines.length, pedPaths.length, 1));
  let stamp = 0;
  function gather(hash, lines, x, z, r, zoneSet) {
    stamp++;
    let n = 0;
    const i0 = Math.max(0, Math.floor((x - r - hash.minX) / hash.cell)), i1 = Math.min(hash.nx - 1, Math.floor((x + r - hash.minX) / hash.cell));
    const j0 = Math.max(0, Math.floor((z - r - hash.minZ) / hash.cell)), j1 = Math.min(hash.nz - 1, Math.floor((z + r - hash.minZ) / hash.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
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
    let L = 0; for (let i = 2; i < pf.length; i += 2) L += Math.hypot(pf[i] - pf[i - 2], pf[i + 1] - pf[i - 1]);
    let s = L * frac;
    for (let i = 2; i < pf.length; i += 2) {
      const l = Math.hypot(pf[i] - pf[i - 2], pf[i + 1] - pf[i - 1]);
      if (s <= l || i === pf.length - 2) {
        const u = l > 0 ? Math.min(1, s / l) : 0;
        out.x = pf[i - 2] + (pf[i] - pf[i - 2]) * u; out.z = pf[i - 1] + (pf[i + 1] - pf[i - 1]) * u;
        out.dx = (pf[i] - pf[i - 2]) / (l || 1); out.dz = (pf[i + 1] - pf[i - 1]) / (l || 1);
        return out;
      }
      s -= l;
    }
    out.x = pf[0]; out.z = pf[1]; out.dx = 1; out.dz = 0;
    return out;
  }
  const TMP = { x: 0, z: 0, dx: 0, dz: 0 };
  const rnd = opts.random || Math.random;
  function pickSidewalk(near, radius, zone, out) {
    const zs = zone ? new Set(Array.isArray(zone) ? zone : [zone]) : null;
    const tries = [[swHash, swLines, zs], [pathHash, pedPaths, null], [swHash, swLines, null]];
    for (const [hash, lines, zset] of tries) {
      for (let r = radius, pass = 0; pass < 3; pass++, r *= 2) {
        let n;
        if (near) n = gather(hash, lines, near.x, near.z, r, zset);
        else { // global: sample random lines
          n = 0;
          for (let a = 0; a < 64 && n < 64; a++) { const k = (rnd() * lines.length) | 0; if (!zset || zset.has(lines[k].zone)) CAND[n++] = k; }
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
    const lw = Math.min(3.7, Math.max(2.6, (e.width - (e.kind === 'motorway' ? 0 : 1)) / Math.max(1, nl)));
    const myLanes = Math.max(1, dir > 0 ? e.lanesFwd : e.lanesBack);
    lane = Math.min(Math.max(0, lane), myLanes - 1);
    return (Math.max(1, nl) / 2 - lane - 0.5) * lw;
  }
  function randomRoadPoint(near = null, radius = 250, o = {}) {
    let e = null, s = 0;
    const filter = o.filter || roadSpawnOK;
    for (let a = 0; a < 40 && !e; a++) {
      let cand;
      if (near) {
        const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * radius;
        const qx = near.x + Math.sin(ang) * rr, qz = near.z + Math.cos(ang) * rr;
        if (!nearestSeg(qx, qz, 80, filter)) continue;
        cand = edges[NE.e];
        const p = cand.pf, oo = NE.seg * 2;
        s = cand.cum[NE.seg] + Math.hypot(p[oo + 2] - p[oo], p[oo + 3] - p[oo + 1]) * NE.u;
        if ((NE.px - near.x) ** 2 + (NE.pz - near.z) ** 2 > radius * radius * 1.2) continue;
      } else {
        cand = edges[(rnd() * edges.length) | 0];
        if (!filter(cand)) continue;
        s = rnd() * cand.length;
      }
      e = cand;
    }
    if (!e) { e = edges.find(filter) || edges[0]; s = e.length / 2; }
    s = Math.min(e.length - 2, Math.max(2, s));
    const dir = e.oneway || e.lanesBack === 0 ? 1 : rnd() < 0.5 ? 1 : -1;
    const lanes = dir > 0 ? e.lanesFwd : e.lanesBack;
    const lane = (rnd() * Math.max(1, lanes)) | 0;
    const off = laneOffsetFor(e, dir, lane);
    roadGraph.pointAt(e, s, TMP2);
    const tx = TMP2.dx * dir, tz = TMP2.dz * dir; // travel direction
    const rx = -tz, rz = tx; // right-hand vector
    const position = new THREE.Vector3(TMP2.x + rx * off, TMP2.y, TMP2.z + rz * off);
    return { position, heading: Math.atan2(tx, tz), edgeId: e.id, laneOffset: off, dir, s, lane };
  }
  const TMP2 = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };

  // ---------------------------------------------------------------- spots (storefronts, benches, lean spots)
  const storefronts = spots.storefronts.map((s) => {
    const c = Math.abs(Math.cos(s.facing)), sn = Math.abs(Math.sin(s.facing));
    return { ...s, sx: s.w * c + s.d * sn, sz: s.w * sn + s.d * c, district: districtAt(s.x, s.z) };
  });
  const benches = spots.benches.map((b) => ({ pos: new THREE.Vector3(b.x, groundHeightAt(b.x, b.z, 0.5), b.z), heading: b.heading }));
  const leanSpots = spots.leanSpots.map((b) => ({ pos: new THREE.Vector3(b.x, groundHeightAt(b.x, b.z, 0.5), b.z), heading: b.heading }));
  function pointIndex(list, getX, getZ, cell = 50) {
    const h = buildHash(B.minX, B.minZ, B.maxX, B.maxZ, cell, list.length, (k, bb) => { bb[0] = bb[2] = getX(list[k]); bb[1] = bb[3] = getZ(list[k]); });
    return (x, z, r, out = []) => {
      out.length = 0;
      const i0 = Math.max(0, Math.floor((x - r - h.minX) / cell)), i1 = Math.min(h.nx - 1, Math.floor((x + r - h.minX) / cell));
      const j0 = Math.max(0, Math.floor((z - r - h.minZ) / cell)), j1 = Math.min(h.nz - 1, Math.floor((z + r - h.minZ) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = j * h.nx + i;
        for (let s = h.start[c]; s < h.start[c + 1]; s++) {
          const it = list[h.items[s]], dx = getX(it) - x, dz = getZ(it) - z;
          if (dx * dx + dz * dz <= r * r) out.push(it);
        }
      }
      return out;
    };
  }
  const storefrontsNear = pointIndex(storefronts, (s) => s.x, (s) => s.z);
  const benchesNear = pointIndex(benches, (s) => s.pos.x, (s) => s.pos.z);
  const leanSpotsNear = pointIndex(leanSpots, (s) => s.pos.x, (s) => s.pos.z);

  // ---------------------------------------------------------------- legacy + map layers
  const roads = [];
  for (const e of edges) {
    const p = e.pf;
    for (let i = 0; i < p.length - 2; i += 2) roads.push({ x1: p[i], z1: p[i + 1], x2: p[i + 2], z2: p[i + 3], width: e.width, edgeId: e.id, kind: e.kind });
  }
  const ring = (a) => { const r = new Array(a.length / 2); for (let i = 0; i < r.length; i++) r[i] = [a[2 * i] * Q, a[2 * i + 1] * Q]; return r; };
  const polyL = (lst) => lst.map((p) => ({ outer: ring(p.p), holes: (p.ho || []).map(ring) }));
  const buildingPolys = map.buildings.map((b) => ({ outer: ring(b.p), h: b.h }));
  const buildings = buildingPolys.map((b) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of b.outer) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h: b.h };
  });
  const mapLayers = {
    land: polyL(map.land), water: polyL(map.water), beach: polyL(map.beach), park: polyL(map.park),
    buildingPolys, roadEdges: edges, attribution: man.attribution,
  };

  // ---------------------------------------------------------------- tiles
  // Grid aligned to world multiples of tileSize: tile (tx,tz) covers [tx*TS,(tx+1)*TS) x [tz*TS,(tz+1)*TS). Key "tx_tz".
  const TS = man.tileSize, TR = man.tileRange;
  const tileSet = new Set(man.tiles);
  const tileCache = new Map(); // key -> Promise<decoded tile>
  let bundle = null; // key -> raw tile JSON (when the bundle is preloaded; enables sync getTile)
  if (opts.bundle !== false && F.tileBundle) {
    try { bundle = await getJSON(base + F.tileBundle); } catch (e) { console.warn('[miami data] tile bundle missing, async tiles only', e); }
  }
  const tileKey = (tx, tz) => `${tx}_${tz}`;
  const clampT = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const tileIJ = (x, z) => [clampT(Math.floor(x / TS), TR.txMin, TR.txMax), clampT(Math.floor(z / TS), TR.tzMin, TR.tzMax)];
  const tileKeyAt = (x, z) => { const [i, j] = tileIJ(x, z); return tileKey(i, j); };
  const tileBounds = (key) => {
    const [i, j] = key.split('_').map(Number);
    return { minX: i * TS, minZ: j * TS, maxX: (i + 1) * TS, maxZ: (j + 1) * TS, tx: i, tz: j };
  };
  function tilesAround(x, z, r, out = []) {
    out.length = 0;
    const i0 = Math.max(TR.txMin, Math.floor((x - r) / TS)), i1 = Math.min(TR.txMax, Math.floor((x + r) / TS));
    const j0 = Math.max(TR.tzMin, Math.floor((z - r) / TS)), j1 = Math.min(TR.tzMax, Math.floor((z + r) / TS));
    const tmp = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = tileKey(i, j);
      if (!tileSet.has(k)) continue;
      const cx = Math.max(i * TS, Math.min(x, (i + 1) * TS)), cz = Math.max(j * TS, Math.min(z, (j + 1) * TS));
      const d = Math.hypot(cx - x, cz - z);
      if (d <= r) tmp.push([d, k]);
    }
    tmp.sort((a, b) => a[0] - b[0]);
    for (const t of tmp) out.push(t[1]);
    return out;
  }
  const f32 = (a) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * Q; return o; };
  const polyT = (p) => ({ outer: f32(p.p), holes: (p.ho || []).map(f32) });
  function decodeProps(pp) {
    const out = [];
    for (let i = 0; i < pp.length; i += 3) out.push({ type: man.props[pp[i]], x: pp[i + 1] * Q, z: pp[i + 2] * Q });
    return out;
  }
  // Generic decoded tile (flat Float32Array rings) — see tools/osm/README.md
  function decodeTile(T) {
    return {
      key: T.k, tx: T.i, tz: T.j, bounds: tileBounds(T.k),
      buildings: (T.b || []).map((r) => ({ id: r.id, ...polyT(r), h: r.h, minH: r.mh || 0, levels: r.lv || 0, type: r.t, style: r.st,
        zone: ZONES[r.zn], part: !!r.part, colour: r.col || null, roofColour: r.rcol || null, roofShape: r.rs || null })),
      land: (T.ld || []).map(polyT),
      sidewalks: (T.sw || []).map(polyT),
      landcover: (T.lu || []).map((r) => ({ cls: r.c, surface: r.s, ...polyT(r) })),
      paths: (T.fw || []).map((r) => ({ kind: r.k, width: r.w, surface: r.s || null, bridge: !!r.br, pts: f32(r.p) })),
      piers: (T.pr || []).map((r) => ({ kind: r.k, y: Math.min(r.y ?? PIER_Y, PIER_Y), ...polyT(r) })),
      roadEdges: (T.r || []).map((k) => edges[k]), // edges whose midpoint is in this tile (draw each edge once)
      roadEdgesTouching: (T.rt || []).map((k) => edges[k]), // every edge crossing the tile (colliders)
      storefronts: (T.sf || []).map((k) => storefronts[k]),
      benches: (T.bn || []).map((k) => benches[k]),
      leanSpots: (T.ls || []).map((k) => leanSpots[k]),
      props: decodeProps(T.pp || []),
      pois: (T.poi || []).map((p) => ({ kind: p.k, x: p.x * Q, z: p.z * Q })),
    };
  }
  function loadTile(key) {
    let p = tileCache.get(key);
    if (p) return p;
    if (!tileSet.has(key)) p = Promise.resolve(null);
    else if (bundle && bundle[key]) p = Promise.resolve(decodeTile(bundle[key]));
    else p = getJSON(base + F.tiles.replace('{key}', key)).then(decodeTile).catch((err) => { tileCache.delete(key); throw err; });
    tileCache.set(key, p);
    return p;
  }
  const unloadTile = (key) => tileCache.delete(key);

  // ---- CITY renderer adapter: synchronous getTile(tx, tz) in the renderer's internal tile format (needs the bundle) ----
  const ringA = (a) => { const r = new Array(a.length / 2); for (let i = 0; i < r.length; i++) r[i] = [a[2 * i] * Q, a[2 * i + 1] * Q]; return r; };
  const ringsA = (p) => [ringA(p.p), ...(p.ho || []).map(ringA)];
  const LC_KIND = { sand: 'beach', park: 'park', pitch: 'park', playground: 'park', grass: 'grass', island: 'grass', wild: 'grass',
    parking: 'parking', plaza: 'paved', marina: 'paved', dirt: 'land' };
  const sfByBuilding = new Map();
  for (const s of storefronts) if (!sfByBuilding.has(s.buildingId)) sfByBuilding.set(s.buildingId, s);
  const cityTiles = new Map();
  let nodesByTile = null;
  function getTile(tx, tz) {
    const key = tileKey(tx, tz);
    if (cityTiles.has(key)) return cityTiles.get(key);
    const T = bundle && bundle[key];
    if (!T) { cityTiles.set(key, null); return null; }
    const x0 = tx * TS, z0 = tz * TS, x1 = x0 + TS, z1 = z0 + TS;
    const inT = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const areas = [];
    for (const p of T.ld || []) areas.push({ kind: 'land', rings: ringsA(p) });
    for (const p of T.lu || []) { const k = LC_KIND[p.c]; if (k) areas.push({ kind: k, cls: p.c, surface: p.s, rings: ringsA(p) }); }
    // road pieces: segments whose midpoint lies in this tile
    const roads = [];
    for (const k of T.rt || []) {
      const e = edges[k], p = e.pf;
      let cur = null;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const mx = (p[2 * i] + p[2 * i + 2]) / 2, mz = (p[2 * i + 1] + p[2 * i + 3]) / 2;
        if (!inT(mx, mz)) { cur = null; continue; }
        if (!cur) {
          cur = { id: e.id, edgeId: e.id, pts: [e.pts[i]], y: e.elevated ? [e.y[i]] : null, width: e.width, lanesFwd: e.lanesFwd, lanesBack: e.lanesBack,
            oneway: e.oneway, kind: e.kind, bridge: e.bridge, name: e.name, speedKmh: e.speedKmh, sidewalks: e.sidewalk > 0, sidewalkWidth: e.sidewalk, layer: e.layer };
          roads.push(cur);
        }
        cur.pts.push(e.pts[i + 1]);
        if (cur.y) cur.y.push(e.y[i + 1]);
      }
    }
    const pp = T.pp || [];
    const trees = [], palms = [], signals = [], lamps = [], busStops = [], crossings = [], stops = [], other = [];
    for (let i = 0; i < pp.length; i += 3) {
      const t = man.props[pp[i]], xz = [pp[i + 1] * Q, pp[i + 2] * Q];
      if (t === 'tree' || t === 'palm') { trees.push(xz); if (t === 'palm') palms.push(xz); } else if (t === 'signal') signals.push(xz);
      else if (t === 'lamp') lamps.push(xz); else if (t === 'bus') busStops.push(xz); else if (t === 'crossing') crossings.push(xz);
      else if (t === 'stop') stops.push(xz); else other.push({ type: t, x: xz[0], z: xz[1] });
    }
    const nodesT = [];
    if (!nodesByTile) {
      nodesByTile = new Map();
      for (const n of nodes) { const k = tileKey(Math.floor(n.x / TS), Math.floor(n.z / TS)); if (!nodesByTile.has(k)) nodesByTile.set(k, []); nodesByTile.get(k).push(n); }
    }
    for (const n of nodesByTile.get(key) || []) {
      if (n.y > 0.3) continue;
      let w = 0; const dirs = [];
      for (const k of n.edges) {
        const e = edges[k]; w = Math.max(w, e.width);
        const p = e.pts, atA = e.a === n.id;
        const q = atA ? p[0] : p[p.length - 1], r = atA ? p[1] : p[p.length - 2];
        const L = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
        dirs.push([(r[0] - q[0]) / L, (r[1] - q[1]) / L, e.width, e.kind, e.name]);
        if (e.a === e.b) dirs.push([(p[p.length - 2][0] - q[0]) / L, (p[p.length - 2][1] - q[1]) / L, e.width, e.kind, e.name]);
      }
      let signal = false;
      for (const s of signals) if ((s[0] - n.x) ** 2 + (s[1] - n.z) ** 2 < 400) { signal = true; break; }
      nodesT.push({ id: n.id, x: n.x, z: n.z, y: n.y, degree: dirs.length, signal, width: w, dirs });
    }
    const buildingsT = (T.b || []).map((r) => {
      const rings = ringsA(r), o = rings[0];
      let cx = 0, cz = 0, ar = 0;
      for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length]; ar += a[0] * b[1] - b[0] * a[1]; cx += a[0]; cz += a[1]; }
      cx /= o.length; cz /= o.length;
      return { id: r.id, rings, h: r.h, minH: r.mh || 0, levels: r.lv || 0, kind: r.t, type: r.t, style: r.st, zone: ZONES[r.zn], part: !!r.part,
        roof: r.rs || 'flat', colour: r.col || null, roofColour: r.rcol || null, name: null, area: Math.abs(ar / 2), cx, cz, storefront: sfByBuilding.get(r.id) || null };
    });
    const tile = { tx, tz, x0, z0, size: TS, key, areas, roads, nodes: nodesT, buildings: buildingsT, trees, palms, signals, lamps, busStops, crossings, stops, props: other,
      sidewalkPolys: (T.sw || []).map(ringsA), paths: (T.fw || []).map((r) => ({ kind: r.k, width: r.w, surface: r.s || null, bridge: !!r.br, pts: ringA(r.p) })),
      piers: (T.pr || []).map((r) => ({ kind: r.k, y: Math.min(r.y ?? PIER_Y, PIER_Y), rings: ringsA(r) })),
      storefronts: (T.sf || []).map((k) => storefronts[k]), benches: (T.bn || []).map((k) => benches[k]), leanSpots: (T.ls || []).map((k) => leanSpots[k]),
      pois: (T.poi || []).map((p) => ({ kind: p.k, x: p.x * Q, z: p.z * Q })) };
    cityTiles.set(key, tile);
    return tile;
  }

  const spawn = new THREE.Vector3(man.playerSpawn.x, man.playerSpawn.y, man.playerSpawn.z);
  const data = {
    source: 'osm-miami', manifest: man, attribution: man.attribution,
    bounds: { ...B }, seaLevel: SEA, curbHeight: CURB, pierHeight: PIER_Y,
    playerSpawn: spawn, playerSpawnHeading: man.playerSpawnHeading,
    groundHeightAt, isWater, surfaceAt, zoneAt, districtAt, streetNameAt, seabedDepthAt: (x, z) => (surfCode(x, z) === S_WATER ? swimDepthAt(x, z) : depthAt(x, z)),
    roadGraph, roads, buildings, mapLayers,
    randomRoadPoint, randomSidewalkPoint,
    storefronts, shopLots: storefronts, benches, leanSpots, storefrontsNear, benchesNear, leanSpotsNear,
    sidewalkLines: swLines, paths, names,
    // tiles
    tileSize: TS, tileRange: { ...TR }, tileKeys: man.tiles,
    tileKey, tileKeyAt, tileIJ, tileBounds, tilesAround, hasTile: (k) => tileSet.has(k), loadTile, unloadTile,
    getTile, // sync, CITY renderer format (null when the tile is empty / bundle not loaded)
    dropTileCache(key) { cityTiles.delete(key); tileCache.delete(key); },
    loadTimeMs: 0,
  };
  data.loadTimeMs = Math.round(performance.now() - t0);
  if (game) game.miamiData = data;
  return data;
}
