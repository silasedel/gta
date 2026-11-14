// Adapter: DATA agent's loader (data.js) -> CITY renderer tile format (see devProvider.js header).
// Tiles load asynchronously; builders call `yield* provider.waitTile(i, j)` which yields until the tile is decoded.
const ring = (f) => { const r = new Array(f.length / 2); for (let i = 0; i < r.length; i++) r[i] = [f[2 * i], f[2 * i + 1]]; return r; };
const polyRings = (p) => [ring(p.outer), ...(p.holes || []).map(ring)];
const LANDCOVER = { sand: 'beach', grass_short: 'grass', grass_long: 'grass', dirt: 'dirt', gravel: 'paved', concrete: 'paved', pavers: 'paved', tile: 'paved', asphalt: 'parking', wood: 'wood', metal: 'paved' };

export function createDataProvider(data) {
  const TS = data.tileSize, TO = data.tileOrigin || { x: 0, z: 0 };
  const norm = new WeakMap();
  // data.getTile (sync, world-aligned tiles, already in the renderer format) -> small normalisation
  function normalize(t) {
    if (!t) return t;
    let n = norm.get(t); if (n) return n;
    const hasPolys = (t.sidewalkPolys || []).length > 0;
    const roads = t.roads.map((r) => ({ ...r, furniture: (r.sidewalks || !/motorway|trunk|service/.test(r.kind)) && !r.y, sidewalks: hasPolys ? false : r.sidewalks }));
    const sfBy = new Map(); for (const sf of t.storefronts || []) { if (!sfBy.has(sf.buildingId)) sfBy.set(sf.buildingId, []); sfBy.get(sf.buildingId).push(sf); }
    const buildings = t.buildings.map((b) => ({ ...b, storefronts: sfBy.get(b.id) || (b.storefront ? [b.storefront] : null) }));
    const obj = (a) => (Array.isArray(a) ? { x: a[0], z: a[1] } : a);
    const other = t.props || [];
    n = { ...t, roads, buildings, lamps: (t.lamps || []).map(obj), busStops: (t.busStops || []).map(obj), signals: (t.signals || []).map(obj),
      hydrants: other.filter((p) => p.type === 'hydrant'), bins: other.filter((p) => p.type === 'waste'), fountains: other.filter((p) => p.type === 'fountain') };
    norm.set(t, n); return n;
  }
  if (data.getTile) {
    const rg = data.roadGraph;
    const farBy = new Map(), farRoads = new Map(), key = (i, j) => `${i}_${j}`;
    (data.mapLayers.buildingPolys || []).forEach((bp, n) => {
      const o = bp.outer; if (!o || o.length < 3) return;
      let cx = 0, cz = 0, a = 0; for (let i = 0; i < o.length; i++) { const p = o[i], q = o[(i + 1) % o.length]; cx += p[0]; cz += p[1]; a += p[0] * q[1] - q[0] * p[1]; }
      cx /= o.length; cz /= o.length; const k = key(Math.floor(cx / TS), Math.floor(cz / TS));
      if (!farBy.has(k)) farBy.set(k, []); farBy.get(k).push({ id: n + 1, rings: [o], h: bp.h || 6, minH: 0, area: Math.abs(a / 2), cx, cz });
    });
    for (const e of rg.edges) if (e.elevated) { const m = e.pts[(e.pts.length / 2) | 0]; const k = key(Math.floor(m[0] / TS), Math.floor(m[1] / TS)); if (!farRoads.has(k)) farRoads.set(k, []); farRoads.get(k).push({ pts: e.pts, y: Array.from(e.y), width: e.width }); }
    // V2: tiles ship in region bundles that data.js loads on demand. waitTile yields until the tile AND its 8 neighbors
    // (read synchronously for seams) are in memory, so a builder never sees a missing tile as an empty one.
    const lazy = typeof data.tileReady === 'function';
    return {
      source: data.source || 'data.js', bounds: data.bounds, tileSize: TS, origin: { x: 0, z: 0 },
      getTile: (i, j) => normalize(data.getTile(i, j)) ?? null,
      ...(lazy ? {
        *waitTile(i, j) {
          let n = 0;
          while (!data.tileReady(i, j)) { if (n++ % 30 === 0) data.requestTile(i, j); yield; }
          return normalize(data.getTile(i, j)) ?? null;
        },
        prefetch(i, j) { data.requestTile(i, j); },
        tileReady: (i, j) => data.tileReady(i, j),
      } : {}),
      farTile: (i, j) => ({ buildings: farBy.get(key(i, j)) || [], roads: farRoads.get(key(i, j)) || [], areas: [] }),
      landPolys: (data.mapLayers.land || []).map((p) => [p.outer, ...(p.holes || [])]),
      nodes: rg.nodes.map((nd) => ({ id: nd.id, x: nd.x, z: nd.z, deg: nd.edges.length, edges: nd.edges.map((k) => rg.edges[k]) })),
      edges: rg.edges,
    };
  }
  const conv = new Map(), loading = new Set();
  const rg = data.roadGraph;

  function convertTile(T) {
    const b = T.bounds;
    const inT = (x, z) => x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ;
    // ---- areas ----
    const areas = [];
    for (const p of T.land) areas.push({ kind: 'land', rings: polyRings(p) });
    for (const p of T.landcover) {
      if (p.surface === 'water' || p.cls === 'water') continue;
      const kind = p.cls === 'pool' ? 'pool' : p.cls === 'park' && /grass/.test(p.surface || '') ? 'park' : LANDCOVER[p.surface] || 'paved';
      areas.push({ kind, cls: p.cls, rings: polyRings(p) });
    }
    // ---- roads: each edge drawn once (by midpoint tile); elevated edges carry y ----
    const roads = T.roadEdges.map((e) => ({ id: e.id, edgeId: e.id, pts: e.pts, y: e.elevated ? Array.from(e.y) : null, width: e.width, lanesFwd: e.lanesFwd, lanesBack: e.lanesBack,
      oneway: e.oneway, kind: e.kind, bridge: e.bridge || e.elevated, name: e.name, sidewalks: false, sidewalkSides: e.sidewalk || 0, furniture: !e.elevated && !/motorway|trunk|service/.test(e.kind) }));
    // ---- props ----
    const P = { tree: [], palm: [], lamp: [], signal: [], bus: [], waste: [], hydrant: [], bike: [], fountain: [], art: [], stop: [], crossing: [] };
    for (const p of T.props) (P[p.type] ||= []).push(p);
    // ---- junction nodes in this tile (by node position) ----
    const nodes = [];
    for (const e of T.roadEdgesTouching) for (const id of [e.a, e.b]) {
      const n = rg.nodes[id]; if (!n || !inT(n.x, n.z) || nodes.some((q) => q.id === id)) continue;
      const inc = n.edges.map((k) => rg.edges[k]); if (!inc.length) continue;
      let w = 0; const dirs = [];
      for (const ed of inc) {
        w = Math.max(w, ed.width);
        const atA = ed.a === id, p0 = atA ? ed.pts[0] : ed.pts[ed.pts.length - 1], p1 = atA ? ed.pts[1] : ed.pts[ed.pts.length - 2];
        const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1; dirs.push([(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L, ed.width, ed.kind, ed.name]);
      }
      const signal = P.signal.some((s) => Math.hypot(s.x - n.x, s.z - n.z) < 25);
      if (n.y > 0.3) continue; // elevated junctions are part of bridge decks
      nodes.push({ id, x: n.x, z: n.z, y: 0, degree: inc.length, width: w, dirs, signal });
    }
    // ---- buildings (+ attached storefronts) ----
    const sfBy = new Map(); for (const s of T.storefronts) { if (!sfBy.has(s.buildingId)) sfBy.set(s.buildingId, []); sfBy.get(s.buildingId).push(s); }
    const buildings = T.buildings.map((bd) => {
      const rings = polyRings(bd); const o = rings[0];
      let cx = 0, cz = 0, a = 0; for (let i = 0; i < o.length; i++) { const p = o[i], q = o[(i + 1) % o.length]; cx += p[0]; cz += p[1]; a += p[0] * q[1] - q[0] * p[1]; }
      return { id: bd.id, rings, h: bd.h, minH: bd.minH || 0, levels: bd.levels, kind: bd.type || 'yes', style: bd.style, zone: bd.zone, part: bd.part, colour: bd.colour, roofShape: bd.roofShape,
        cx: cx / o.length, cz: cz / o.length, area: Math.abs(a / 2), storefronts: sfBy.get(bd.id) || null };
    });
    return {
      tx: T.i, tz: T.j, x0: b.minX, z0: b.minZ, size: TS, areas, roads, nodes, buildings,
      sidewalkPolys: T.sidewalks.map(polyRings), piers: T.piers.map((p) => ({ kind: p.kind, y: p.y, rings: polyRings(p) })),
      paths: T.paths, trees: [...P.palm.map((p) => [p.x, p.z, 'palm']), ...P.tree.map((p) => [p.x, p.z, 'tree'])],
      lamps: P.lamp, signals: P.signal, busStops: P.bus, hydrants: P.hydrant, bins: P.waste, fountains: P.fountain,
      benches: T.benches, leanSpots: T.leanSpots, storefronts: T.storefronts,
    };
  }
  const key = (i, j) => `${i}_${j}`;
  function request(i, j) {
    const k = key(i, j);
    if (conv.has(k) || loading.has(k)) return;
    if (!data.hasTile(k)) { conv.set(k, null); return; }
    loading.add(k);
    data.loadTile(k).then((T) => { conv.set(k, T ? convertTile(T) : null); loading.delete(k); }).catch((e) => { console.warn('[miami] tile load failed', k, e); conv.set(k, null); loading.delete(k); });
  }
  // far layer: global footprints (map.json) bucketed per tile, so distant chunks never fetch tile files
  const farBy = new Map();
  (data.mapLayers.buildingPolys || []).forEach((bp, n) => {
    const o = bp.outer; if (!o || o.length < 3) return;
    let cx = 0, cz = 0, a = 0; for (let i = 0; i < o.length; i++) { const p = o[i], q = o[(i + 1) % o.length]; cx += p[0]; cz += p[1]; a += p[0] * q[1] - q[0] * p[1]; }
    cx /= o.length; cz /= o.length;
    const k = key(Math.floor((cx - TO.x) / TS), Math.floor((cz - TO.z) / TS));
    if (!farBy.has(k)) farBy.set(k, []);
    farBy.get(k).push({ id: n + 1, rings: [o], h: bp.h || 6, minH: 0, area: Math.abs(a / 2), cx, cz });
  });
  const farRoads = new Map();
  for (const e of rg.edges) if (e.elevated) { const m = e.pts[(e.pts.length / 2) | 0]; const k = key(Math.floor((m[0] - TO.x) / TS), Math.floor((m[1] - TO.z) / TS)); if (!farRoads.has(k)) farRoads.set(k, []); farRoads.get(k).push({ pts: e.pts, y: Array.from(e.y), width: e.width }); }
  return {
    farTile(i, j) { const k = key(i, j); return { buildings: farBy.get(k) || [], roads: farRoads.get(k) || [], areas: [] }; },
    landPolys: (data.mapLayers.land || []).map((p) => [p.outer, ...(p.holes || [])]),
    source: data.source || 'data.js', bounds: data.bounds, tileSize: TS, origin: { x: TO.x, z: TO.z },
    tilesX: data.tilesX, tilesZ: data.tilesZ,
    getTile(i, j) { const k = key(i, j); if (!conv.has(k)) { request(i, j); return undefined; } return conv.get(k); },
    *waitTile(i, j) { const k = key(i, j); request(i, j); while (!conv.has(k)) yield; return conv.get(k); },
    prefetch(i, j) { request(i, j); },
    release(i, j) { const k = key(i, j); conv.delete(k); data.unloadTile?.(k); },
    nodes: rg.nodes.map((n) => ({ id: n.id, x: n.x, z: n.z, deg: n.edges.length, edges: n.edges.map((k) => rg.edges[k]) })),
    edges: rg.edges,
  };
}
