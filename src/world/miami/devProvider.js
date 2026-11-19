// DEV-ONLY stopgap provider: reads the DATA agent's raw Overpass caches (tools/osm/cache/*.json) and bins them
// into the CITY renderer's internal tile format. Replaced by data.js (DATA agent) as soon as that exists.
//
// Internal tile format (what the builders consume):
// tile = { tx, tz, x0, z0, size,
//   areas:     [{ kind: 'land'|'beach'|'park'|'grass'|'paved'|'industrial'|'parking'|'water', rings: [[[x,z],...], ...holes] }],
//   roads:     [{ id, pts: [[x,z],...], y: [h,...]|null, width, lanesFwd, lanesBack, oneway, kind, bridge, name, sidewalks: bool }],
//   nodes:     [{ id, x, z, y, degree, signal, widths: max incident width, dirs: [[dx,dz],...] }],
//   buildings: [{ id, rings, h, minH, levels, kind, zone, roof, name, storefront }],
//   trees: [[x, z]], signals: [[x, z]], lamps: [[x, z]], busStops: [[x, z]] }
const LAT0 = 25.779,
  LON0 = -80.165,
  KX = Math.cos((LAT0 * Math.PI) / 180) * 111320,
  KZ = 110574;
export const proj = (lon, lat) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];

const DRIVE = {
  motorway: [3.6, 3],
  trunk: [3.5, 3],
  primary: [3.4, 2],
  secondary: [3.3, 2],
  tertiary: [3.2, 1],
  residential: [3.0, 1],
  unclassified: [3.0, 1],
  living_street: [2.8, 1],
  service: [2.8, 1],
  motorway_link: [3.6, 1],
  trunk_link: [3.5, 1],
  primary_link: [3.4, 1],
  secondary_link: [3.3, 1],
  tertiary_link: [3.2, 1],
};
const SPEED = {
  motorway: 90,
  trunk: 70,
  primary: 55,
  secondary: 50,
  tertiary: 45,
  residential: 35,
  unclassified: 35,
  living_street: 20,
  service: 20,
};

export async function loadDevProvider(tileSize = 200) {
  const get = (n) =>
    fetch(`/tools/osm/cache/${n}.json`)
      .then((r) => r.json())
      .catch(() => ({ elements: [] }));
  const [hw, bl] = await Promise.all([get('highways'), get('buildings')]);
  const tiles = new Map();
  const key = (a, b) => a * 100003 + b;
  const tileAt = (x, z) => {
    const tx = Math.floor(x / tileSize),
      tz = Math.floor(z / tileSize),
      k = key(tx, tz);
    let t = tiles.get(k);
    if (!t) {
      t = {
        tx,
        tz,
        x0: tx * tileSize,
        z0: tz * tileSize,
        size: tileSize,
        areas: [],
        roads: [],
        nodes: [],
        buildings: [],
        trees: [],
        signals: [],
        lamps: [],
        busStops: [],
      };
      tiles.set(k, t);
    }
    return t;
  };
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  // ---- roads: graph nodes by rounded coordinate, edges per way ----
  const nodeMap = new Map(),
    nodes = [],
    edges = [];
  const nid = (x, z) => {
    const k = Math.round(x * 2) + ',' + Math.round(z * 2);
    let n = nodeMap.get(k);
    if (n === undefined) {
      n = nodes.length;
      nodes.push({ id: n, x, z, y: 0, deg: 0, signal: false, edges: [] });
      nodeMap.set(k, n);
    }
    return n;
  };
  for (const e of hw.elements || []) {
    const tg = e.tags || {},
      cls = tg.highway;
    if (!DRIVE[cls] || !e.geometry || e.geometry.length < 2) continue;
    if (tg.area === 'yes' || (tg.access === 'private' && cls === 'service')) continue;
    const pts = e.geometry.map((g) => proj(g.lon, g.lat));
    const lanes = +tg.lanes || 0,
      oneway =
        tg.oneway === 'yes' || cls === 'motorway' || (/_link$/.test(cls) && tg.oneway !== 'no');
    const [lw, defL] = DRIVE[cls];
    const total = lanes || (oneway ? defL : defL * 2);
    const lanesFwd = oneway ? total : Math.ceil(total / 2),
      lanesBack = oneway ? 0 : total - lanesFwd;
    const width = Math.max(5.5, total * lw + (cls === 'service' ? 0 : 1));
    const bridge = tg.bridge && tg.bridge !== 'no';
    const layer = +tg.layer || (bridge ? 1 : 0);
    const a = nid(...pts[0]),
      b = nid(...pts[pts.length - 1]);
    let len = 0;
    for (let i = 1; i < pts.length; i++)
      len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let y = null;
    if (bridge) {
      // simple deck profile: rises from the abutments to a crown (no elevation data in raw OSM)
      const H = Math.max(3, Math.min(22, len * 0.05)) * Math.max(1, layer * 0.8);
      let acc = 0;
      y = pts.map((p, i) => {
        if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
        const t = acc / len;
        return 0.3 + H * Math.min(1, Math.sin(Math.PI * t) * 1.6);
      });
    }
    const edge = {
      id: edges.length,
      a,
      b,
      pts,
      y,
      width,
      lanesFwd,
      lanesBack,
      oneway,
      kind: cls,
      bridge: !!bridge,
      name: tg.name || null,
      speedKmh: +tg.maxspeed?.replace(/\D/g, '') * 1.609 || SPEED[cls] || 40,
      sidewalks: !bridge && !/motorway|trunk/.test(cls) && cls !== 'service',
    };
    edges.push(edge);
    nodes[a].deg++;
    nodes[b].deg++;
    nodes[a].edges.push(edge);
    nodes[b].edges.push(edge);
    for (const p of pts) {
      bounds.minX = Math.min(bounds.minX, p[0]);
      bounds.maxX = Math.max(bounds.maxX, p[0]);
      bounds.minZ = Math.min(bounds.minZ, p[1]);
      bounds.maxZ = Math.max(bounds.maxZ, p[1]);
    }
    // split into per-tile pieces (segment midpoint decides the owner tile)
    let cur = null,
      curT = null;
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i][0] + pts[i - 1][0]) / 2,
        mz = (pts[i][1] + pts[i - 1][1]) / 2,
        t = tileAt(mx, mz);
      if (t !== curT) {
        cur = { ...edge, pts: [pts[i - 1]], y: y ? [y[i - 1]] : null, edgeId: edge.id };
        t.roads.push(cur);
        curT = t;
      }
      cur.pts.push(pts[i]);
      if (y) cur.y.push(y[i]);
    }
  }
  for (const n of nodes) {
    if (n.deg < 1) continue;
    let w = 0;
    const dirs = [];
    for (const e of n.edges) {
      w = Math.max(w, e.width);
      const p = e.a === n.id ? e.pts[1] : e.pts[e.pts.length - 2],
        q = e.a === n.id ? e.pts[0] : e.pts[e.pts.length - 1];
      const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      dirs.push([(p[0] - q[0]) / L, (p[1] - q[1]) / L, e.width, e.kind, e.name]);
    }
    const y = n.edges.some((e) => e.bridge) ? null : 0;
    if (y === null) continue;
    tileAt(n.x, n.z).nodes.push({
      id: n.id,
      x: n.x,
      z: n.z,
      y: 0,
      degree: n.deg,
      signal: n.deg >= 4 && n.edges.some((e) => /primary|secondary|tertiary/.test(e.kind)),
      width: w,
      dirs,
    });
  }
  // ---- buildings ----
  const ringOf = (geom) => geom.map((g) => proj(g.lon, g.lat));
  for (const e of bl.elements || []) {
    const tg = e.tags || {};
    let rings = [];
    if (e.type === 'way' && e.geometry) rings = [ringOf(e.geometry)];
    else if (e.type === 'relation' && e.members) {
      const outs = e.members
        .filter((m) => m.role === 'outer' && m.geometry)
        .map((m) => ringOf(m.geometry));
      const ins = e.members
        .filter((m) => m.role === 'inner' && m.geometry)
        .map((m) => ringOf(m.geometry));
      if (outs.length) rings = [outs[0], ...ins];
    }
    if (!rings.length || rings[0].length < 4) continue;
    const r0 = rings[0];
    if (r0[0][0] === r0[r0.length - 1][0] && r0[0][1] === r0[r0.length - 1][1]) r0.pop();
    for (let i = 1; i < rings.length; i++) {
      const r = rings[i];
      if (r.length && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    }
    let cx = 0,
      cz = 0;
    for (const p of r0) {
      cx += p[0];
      cz += p[1];
    }
    cx /= r0.length;
    cz /= r0.length;
    let area = 0;
    for (let i = 0; i < r0.length; i++) {
      const p = r0[i],
        q = r0[(i + 1) % r0.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    area = Math.abs(area / 2);
    const levels = +tg['building:levels'] || 0;
    let h = parseFloat(tg.height) || (levels ? levels * 3.3 + 1 : 0);
    if (!h) h = area > 3000 ? 14 : area > 800 ? 10 : area > 200 ? 7.5 : 5.5;
    const minH = parseFloat(tg.min_height) || (+tg['building:min_level'] || 0) * 3.3;
    const kind = tg.building === 'yes' ? tg.amenity || tg.shop || tg.tourism || 'yes' : tg.building;
    tileAt(cx, cz).buildings.push({
      id: e.id,
      rings,
      h,
      minH,
      levels,
      kind,
      part: !!tg['building:part'],
      roof: tg['roof:shape'] || 'flat',
      name: tg.name || null,
      area,
      cx,
      cz,
      storefront: null,
    });
  }
  return {
    bounds,
    tileSize,
    tiles,
    nodes,
    edges,
    getTile: (tx, tz) => tiles.get(key(tx, tz)) || null,
    source: 'dev-osm-cache',
  };
}
