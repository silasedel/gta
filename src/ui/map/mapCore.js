// SOUTHLINE UI: map engine shared by the pause map, the minimap and the phone map.
//  - Vector data (game.city.mapLayers + roadGraph) is rasterized into cached 512 px tiles at 7 levels of detail.
//  - No flicker by construction: a view only switches to a new level once every tile it needs is ready (the old
//    level keeps being drawn until then, then a short cross-fade); missing edge tiles fall back to cached parents
//    and to the always-present overview; labels and icons use layouts that depend only on the zoom step, never on
//    load timing or on where the view happens to be, so nothing pops in and out while panning or zooming.
//  - Data-driven: land cover kinds, water depths, road classes and refs (shields), place names, building footprints
//    and POIs are all read from the data; bounds are never hard-coded.
// Optional richer data (world-osm / world-layout tracks), all read when present:
//   mapLayers.areas  [{ kind: 'forest|sawgrass|wetland|mangrove|farmland|grove|sand|scrub|runway|apron|taxiway|parking|golf|…', outer, holes }]
//   mapLayers.places [{ name, kind: 'district|town|key|island|park|lake|airport|region|beach', x, z, r }]
//   mapLayers.pois   [{ x, z, type, name }]      roadGraph.edges[].ref ('I 95', 'US 1', 'SR 836', 'CR 905')
//   city.seabedDepthAt(x, z) -> meters (water depth bands)      city.mapBoundary (playable ring; outside is dimmed)
import { boundaryFor, pointInRing, ringBounds } from '../mapBoundary.js';
import { drawIcon } from '../core/icons.js';
import { clamp, hash32, roundRect, TAU } from '../core/dom.js';

const TILE_PX = 512, BASE_M = 250, LEVELS = 7, OVERVIEW = 4, MAX_TILES = 150, CELL = 250;
export const THEMES = {
  dusk: { water: '#0c2c40', depth: ['#12435a', '#0f3850', '#0c2e44', '#0a2538', '#081d2e'], shore: 'rgba(160,230,235,.34)', land: '#1b2331', landOut: '#141a24', beach: '#c9b384', park: '#21402f',
    area: { forest: '#1c3a2b', pine: '#1e3c2e', sawgrass: '#2c3d2c', wetland: '#24413c', mangrove: '#1d4037', farmland: '#3b3a2a', grove: '#2f4028', sand: '#bfa97c', scrub: '#2d3729', grass: '#25402f', golf: '#2a4a33', runway: '#3c4250', taxiway: '#343a47', apron: '#2e3440', parking: '#262d3a', paved: '#262d3a', industrial: '#252a35', commercial: '#222a3a', residential: '#1f2735', campground: '#2a3a2c', dirt: '#3a3329' },
    building: '#36425a', buildingTall: '#4a5876', buildingEdge: 'rgba(243,237,226,.10)', buildingOut: '#222a37', casing: '#0c1119', bridgeCasing: '#04070c',
    road: { motorway: '#f3a95c', trunk: '#f2c57e', primary: '#ecefe8', secondary: '#c8d0dd', tertiary: '#a8b3c6', residential: '#8693a8', service: '#69758a', pedestrian: '#978c78', footway: '#766e5e', track: '#7a6f58', default: '#8d99ad' },
    label: '#f3ede2', labelHalo: 'rgba(7,10,16,.86)', labelWater: '#8fc3d4', labelPark: '#9fd4a8', labelRoad: '#f3ede2', labelHwy: '#ffdcaa', fog: 'rgba(5,8,14,.74)', grid: 'rgba(243,237,226,.05)' },
  day: { water: '#9fc9dc', depth: ['#b5dbe8', '#a6d0e2', '#96c4da', '#86b7d0', '#78abc7'], shore: 'rgba(40,90,120,.35)', land: '#ece6da', landOut: '#d9d4ca', beach: '#f0dfae', park: '#bfdcae',
    area: { forest: '#a8cf9a', pine: '#a5cc9c', sawgrass: '#cfd9a2', wetland: '#b4d6c2', mangrove: '#9ecbb0', farmland: '#e6dcae', grove: '#c5d99a', sand: '#f0e0b4', scrub: '#d5d8b4', grass: '#c4dfb3', golf: '#b5dba6', runway: '#bfc3cc', taxiway: '#cdd0d6', apron: '#d6d8dc', parking: '#dedad2', paved: '#dedad2', industrial: '#ded6d2', commercial: '#e6dcd6', residential: '#e9e2d6', campground: '#cddcb8', dirt: '#dccfb4' },
    building: '#cfc6b8', buildingTall: '#b9b0a4', buildingEdge: 'rgba(60,50,40,.22)', buildingOut: '#cfcac0', casing: '#a59d90', bridgeCasing: '#6f6a62',
    road: { motorway: '#e8924a', trunk: '#f0b866', primary: '#ffffff', secondary: '#ffffff', tertiary: '#fbf8f2', residential: '#fbf8f2', service: '#f1ece3', pedestrian: '#e9dfc9', footway: '#d9cdb4', track: '#cdbf9f', default: '#fbf8f2' },
    label: '#1c2430', labelHalo: 'rgba(255,252,246,.9)', labelWater: '#2f6f8a', labelPark: '#2f6b3d', labelRoad: '#333c4a', labelHwy: '#7a4310', fog: 'rgba(40,46,58,.62)', grid: 'rgba(20,30,40,.06)' },
};
// road class: [min width m, hide above this tile level, minimum on-screen px]
const ROAD = { motorway: [15, 9, 2.2], trunk: [13, 9, 1.9], primary: [11, 6, 1.5], secondary: [9, 5, 1.2], tertiary: [8, 4, 1], residential: [6, 3, .9], unclassified: [6, 3, .9], living_street: [5, 2, .8], service: [4, 1, .7], pedestrian: [4, 2, .7], footway: [2, 1, .6], path: [2, 1, .6], cycleway: [2, 1, .6], track: [3, 2, .7], default: [7, 4, 1] };
const ORDER = ['footway', 'path', 'cycleway', 'track', 'service', 'pedestrian', 'living_street', 'unclassified', 'residential', 'default', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
const kindOf = (k) => { k = String(k || '').replace(/_link$/, ''); return ROAD[k] ? k : 'default'; };
const roadColor = (T, k) => T.road[k] || (k === 'unclassified' || k === 'living_street' ? T.road.residential : k === 'path' || k === 'cycleway' ? T.road.footway : T.road.default);

// ---- POI categories (legend). type strings from OSM shop=/amenity= and from game.interiors types map onto these.
export const POI_CATS = [
  ['mission', 'Missions', 'mission', '#ffc247'], ['job', 'Jobs', 'briefcase', '#ffc247'], ['home', 'Safehouses', 'home', '#1fd6c1'], ['friend', 'Friends', 'user', '#7deee0'],
  ['food', 'Food', 'food', '#ff8f6b'], ['coffee', 'Coffee', 'coffee', '#d9a066'], ['nightlife', 'Bars and clubs', 'bar', '#ff5c9d'], ['grocery', 'Groceries and convenience', 'cart', '#9fd0ff'],
  ['clothing', 'Clothing and shoes', 'shirt', '#c79bff'], ['shop', 'Shops', 'bag', '#ffd58a'], ['gas', 'Gas stations', 'fuel', '#6fb6ff'], ['garage', 'Garages and car care', 'wrench', '#ffb35a'],
  ['guns', 'Gun stores', 'gun', '#ff6b5a'], ['bank', 'Banks and ATMs', 'bank', '#7fe3a1'], ['health', 'Hospitals and pharmacies', 'hospital', '#ff6b81'], ['police', 'Police and fire', 'badge', '#4d8dff'],
  ['hotel', 'Hotels', 'bed', '#e6b8ff'], ['service', 'Barbers, gyms, tattoo', 'scissors', '#ffa9d0'], ['marina', 'Marinas and docks', 'anchor', '#5fd0e6'], ['transit', 'Transit and airports', 'bus', '#b7c2d6'],
  ['landmark', 'Parks and landmarks', 'tree', '#8fd69a'],
].map(([id, label, icon, color], i) => ({ id, label, icon, color, rank: 100 - i * 3 }));
const CAT = Object.fromEntries(POI_CATS.map((c) => [c.id, c]));
export function poiCategory(type) {
  const t = String(type || '').toLowerCase();
  if (/gun|arms|ammo|weapon/.test(t)) return 'guns';
  if (/cafe|coffee|ventanita|bakery|donut|juice|tea/.test(t)) return 'coffee';
  if (/bar\b|^bar|pub|club|lounge|nightclub|biergarten|cantina|casino/.test(t)) return 'nightlife';
  if (/restaurant|fast_food|fastfood|food|diner|pizza|taco|burger|ice_cream|icecream|sushi|deli\b|bbq/.test(t)) return 'food';
  if (/convenience|grocery|supermarket|bodega|liquor|market|greengrocer|butcher|seafood/.test(t)) return 'grocery';
  if (/cloth|apparel|fashion|boutique|shoe|sneaker|jewel|sport|surf|swim|tailor|outfit/.test(t)) return 'clothing';
  if (/fuel|gas/.test(t)) return 'gas';
  if (/car_repair|garage|mechanic|car_wash|carwash|tyres|tires|car\b|dealer|auto|impound|tow/.test(t)) return 'garage';
  if (/bank|atm|pawn|exchange/.test(t)) return 'bank';
  if (/hospital|clinic|pharm|doctor|dentist|chemist|medical/.test(t)) return 'health';
  if (/police|fire_station|firestation|sheriff|courthouse|ranger/.test(t)) return 'police';
  if (/hotel|motel|hostel|resort|guest/.test(t)) return 'hotel';
  if (/barber|hair|salon|beauty|gym|fitness|tattoo|spa|laundr|dry_clean/.test(t)) return 'service';
  if (/marina|dock|slip|boat|ferry|pier|harbour|harbor/.test(t)) return 'marina';
  if (/bus|station|airport|aerodrome|terminal|transit|mover|trolley|helipad|parking/.test(t)) return 'transit';
  if (/park|museum|attraction|viewpoint|theatre|theater|cinema|stadium|church|worship|school|library|beach|zoo|monument|arts/.test(t)) return 'landmark';
  if (/home|safehouse|house|apartment|property/.test(t)) return 'home';
  return 'shop';
}

const ringsOf = (p) => { if (!p) return []; if (p.outer) return [p.outer, ...(p.holes || [])]; if (p.rings) return p.rings; if (p.pts) return [p.pts]; return Array.isArray(p[0]?.[0]) ? p : [p]; };
function bboxOf(rings) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rings) for (const q of r) { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1]; } return [a, b, c, d]; }
const tsize = (l) => BASE_M * 2 ** l;

export function createMapCore(game, ctx) {
  let B = null, builtFor = null, builtLayers = null, theme = 'dusk', epoch = 0;
  const cache = new Map();          // 'theme:level:tx:tz' -> { c, used }
  let seq = 0, spent = 0, frameStamp = -1;
  const views = new Map();          // view id -> { level, prev, fadeAt }
  const T = () => THEMES[theme] || THEMES.dusk;
  const city = () => game.city;
  const ok = () => { const c = city(); return !!(c && c.mapLayers && (Array.isArray(c.mapLayers.land) || Array.isArray(c.mapLayers.roadEdges) || c.roadGraph)); };

  // ------------------------------------------------------------------ source index
  function build() {
    const c = city();
    if (B && builtFor === c && builtLayers === c.mapLayers) return B;
    const L = c.mapLayers || {}, big = [], grid = new Map();
    const ring = boundaryFor(c);
    let inside = null;
    if (ring) { const rb = ringBounds(ring); inside = (x, z) => x >= rb.minX && x <= rb.maxX && z >= rb.minZ && z <= rb.maxZ && pointInRing(ring, x, z); }
    const add = (layer, item, bb) => {
      const rec = { layer, item, bb }, x0 = Math.floor(bb[0] / CELL), z0 = Math.floor(bb[1] / CELL), x1 = Math.floor(bb[2] / CELL), z1 = Math.floor(bb[3] / CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) { big.push(rec); return; }
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = i + ',' + j; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(rec); }
    };
    const polys = (arr, layer, kindFn) => { for (const p of Array.isArray(arr) ? arr : []) { const rings = ringsOf(p).filter((r) => Array.isArray(r) && r.length > 2); if (rings.length) add(layer, { rings, kind: kindFn ? kindFn(p) : null }, bboxOf(rings)); } };
    polys(L.land, 'land'); polys(L.beach, 'beach'); polys(L.park, 'park'); polys(L.water, 'water', (p) => p.kind || null);
    polys(L.areas, 'area', (p) => String(p.kind || 'grass'));
    for (const p of Array.isArray(L.buildingPolys) ? L.buildingPolys : []) {
      const rings = ringsOf(p).filter((r) => Array.isArray(r) && r.length > 2); if (!rings.length) continue;
      const bb = bboxOf(rings);
      add('building', { rings, h: +(p.h ?? p.height ?? 0) || 0, inside: !inside || inside((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2), area: (bb[2] - bb[0]) * (bb[3] - bb[1]) }, bb);
    }
    const edges = [], G = c.roadGraph;
    const src = G && Array.isArray(G.edges) && G.edges.length ? G.edges : Array.isArray(L.roadEdges) ? L.roadEdges : Array.isArray(c.roads) ? c.roads.map((r) => ({ pts: [[r.x1, r.z1], [r.x2, r.z2]], width: r.width })) : [];
    for (const e of src) { const pts = Array.isArray(e) ? e : e?.pts; if (!Array.isArray(pts) || pts.length < 2) continue; edges.push({ pts, width: +(e.width || 0), kind: kindOf(e.kind), bridge: !!e.bridge, name: e.name || null, ref: e.ref || null, id: e.id }); }
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (const e of edges) { const bb = bboxOf([e.pts]); e.inside = !inside || inside((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2) || e.pts.some((q) => inside(q[0], q[1])); add('road', e, bb); if (bb[0] < bx0) bx0 = bb[0]; if (bb[1] < bz0) bz0 = bb[1]; if (bb[2] > bx1) bx1 = bb[2]; if (bb[3] > bz1) bz1 = bb[3]; }
    // label chains: same-name edges joined end to end
    const key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2), byName = new Map(), chains = [];
    for (const e of edges) { const n = e.name || e.ref; if (n && e.inside) { let a = byName.get(n); if (!a) byName.set(n, (a = [])); a.push(e); } }
    for (const [name, list] of byName) {
      const ends = new Map(), used = new Set();
      for (const e of list) for (const end of [key(e.pts[0]), key(e.pts[e.pts.length - 1])]) { let a = ends.get(end); if (!a) ends.set(end, (a = [])); a.push(e); }
      for (const e0 of list) {
        if (used.has(e0)) continue; used.add(e0);
        let pts = e0.pts.slice();
        for (let dir = 0; dir < 2; dir++) { for (let g = 0; g < 400; g++) { const tail = pts[pts.length - 1], cs = (ends.get(key(tail)) || []).filter((e) => !used.has(e)); if (cs.length !== 1) break; const e = cs[0]; used.add(e); pts = pts.concat(key(e.pts[0]) === key(tail) ? e.pts.slice(1) : e.pts.slice(0, -1).reverse()); } pts.reverse(); }
        let len = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(len); }
        chains.push({ name: e0.name, ref: e0.ref, kind: e0.kind, pts, cum, len, rank: ORDER.indexOf(e0.kind) });
      }
    }
    const db = c.bounds, rb = ring ? ringBounds(ring) : null;
    const bounds = db ? { ...db } : rb ? { ...rb } : { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 };
    if (rb && db) { bounds.minX = Math.min(db.minX, rb.minX); bounds.maxX = Math.max(db.maxX, rb.maxX); bounds.minZ = Math.min(db.minZ, rb.minZ); bounds.maxZ = Math.max(db.maxZ, rb.maxZ); }
    B = { big, grid, edges, chains, bounds, ring, inside, hasLand: Array.isArray(L.land) && L.land.length > 0, depthAt: typeof c.seabedDepthAt === 'function' ? c.seabedDepthAt : null, isWater: typeof c.isWater === 'function' ? c.isWater : null, layouts: new Map(), places: null, pois: null, poisStamp: null };
    builtFor = c; builtLayers = c.mapLayers; cache.clear(); views.clear(); epoch++;
    return B;
  }
  function query(x0, z0, x1, z1) {
    const b = build(), out = [], seen = new Set();
    const take = (r) => { if (seen.has(r)) return; seen.add(r); const bb = r.bb; if (bb[2] < x0 || bb[0] > x1 || bb[3] < z0 || bb[1] > z1) return; out.push(r); };
    for (const r of b.big) take(r);
    const cx0 = Math.floor(x0 / CELL), cz0 = Math.floor(z0 / CELL), cx1 = Math.floor(x1 / CELL), cz1 = Math.floor(z1 / CELL);
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 8000) { for (const a of b.grid.values()) for (const r of a) take(r); return out; }
    for (let i = cx0; i <= cx1; i++) for (let j = cz0; j <= cz1; j++) { const a = b.grid.get(i + ',' + j); if (a) for (const r of a) take(r); }
    return out;
  }

  // ------------------------------------------------------------------ tile rasterizer
  function renderTile(level, tx, tz) {
    const S = tsize(level), x0 = tx * S, z0 = tz * S, ppm = TILE_PX / S, th = T(), b = build();
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE_PX;
    const g = cv.getContext('2d');
    // water with depth bands (coarse sample of the seabed, smoothed by the scaler)
    g.fillStyle = th.water; g.fillRect(0, 0, TILE_PX, TILE_PX);
    if (b.depthAt) {
      const N = 40, im = new ImageData(N, N), cols = th.depth.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
      let any = false;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let d = 0; try { d = +b.depthAt(x0 + (i + 0.5) / N * S, z0 + (j + 0.5) / N * S) || 0; } catch (e) { d = 0; }
        d = Math.abs(d); const k = d < 1.5 ? 0 : d < 3.5 ? 1 : d < 6 ? 2 : d < 10 ? 3 : 4, c = cols[k], o = (j * N + i) * 4;
        im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255; if (k < 4) any = true;
      }
      if (any) { const t = document.createElement('canvas'); t.width = t.height = N; t.getContext('2d').putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(t, -TILE_PX / N / 2, -TILE_PX / N / 2, TILE_PX + TILE_PX / N, TILE_PX + TILE_PX / N); } else { g.fillStyle = th.depth[4]; g.fillRect(0, 0, TILE_PX, TILE_PX); }
    }
    g.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm);
    const pad = 60, recs = query(x0 - pad, z0 - pad, x0 + S + pad, z0 + S + pad);
    const by = { land: [], beach: [], park: [], water: [], area: [], building: [], road: [] };
    for (const r of recs) by[r.layer]?.push(r.item);
    const trace = (items) => { g.beginPath(); for (const it of items) for (const rr of it.rings) { g.moveTo(rr[0][0], rr[0][1]); for (let i = 1; i < rr.length; i++) g.lineTo(rr[i][0], rr[i][1]); g.closePath(); } };
    const fill = (items, style) => { if (!items.length) return; g.fillStyle = style; trace(items); g.fill('evenodd'); };
    const ring = b.ring, ringPath = () => { g.beginPath(); g.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); };
    if (ring) {
      // outside the playable boundary: the world continues, dimmed and without detail
      if (!b.hasLand) { g.fillStyle = th.landOut; g.fillRect(x0, z0, S, S); } else fill(by.land, th.landOut);
      fill(by.water, th.water);
      fill(by.building.filter((q) => !q.inside), th.buildingOut);
      g.strokeStyle = theme === 'day' ? 'rgba(120,120,120,.35)' : 'rgba(120,132,150,.3)'; g.lineCap = 'round';
      for (const e of by.road) if (!e.inside && ROAD[e.kind][1] >= level) { g.lineWidth = Math.max((e.width || 8) * 0.8, 1 / ppm); g.beginPath(); g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); g.stroke(); }
      g.save(); ringPath(); g.clip();
    }
    if (!b.hasLand) { g.fillStyle = th.land; g.fillRect(x0, z0, S, S); } else {
      if (by.land.length) { fill(by.land, th.land); g.strokeStyle = th.shore; g.lineWidth = Math.max(1.2 / ppm, 1.5); g.lineJoin = 'round'; trace(by.land); g.stroke(); }
    }
    // land cover
    if (by.area.length) { const groups = new Map(); for (const a of by.area) { let l = groups.get(a.kind); if (!l) groups.set(a.kind, (l = [])); l.push(a); } for (const [k, l] of groups) fill(l, th.area[k] || th.park); }
    fill(by.park, th.park); fill(by.beach, th.beach);
    if (by.water.length) { fill(by.water, th.depth[1] || th.water); g.strokeStyle = th.shore; g.lineWidth = 1.2 / ppm; trace(by.water); g.stroke(); }
    // buildings (footprints when zoomed in; larger ones only further out)
    const blds = by.building.filter((q) => q.inside !== false);
    if (blds.length && level <= 3) {
      const minA = level === 3 ? 2600 : level === 2 ? 500 : 0, low = [], tall = [];
      for (const q of blds) { if (q.area < minA) continue; (q.h > 40 ? tall : low).push(q); }
      g.save(); if (level === 0) { g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 4; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2; }
      g.globalAlpha = level === 3 ? 0.6 : 1; fill(low, th.building); fill(tall, th.buildingTall); g.restore();
      if (level <= 1) { g.strokeStyle = th.buildingEdge; g.lineWidth = 1 / ppm; trace(blds); g.stroke(); }
    }
    // roads by class: casing, fill, bridges on top
    const roads = by.road.filter((e) => e.inside !== false && ROAD[e.kind][1] >= level);
    roads.sort((p, q) => (p.bridge - q.bridge) || (ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind)));
    const wOf = (e) => Math.max(e.width || ROAD[e.kind][0], ROAD[e.kind][0] * 0.6, ROAD[e.kind][2] / ppm);
    const path = (e) => { g.beginPath(); g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); };
    g.lineJoin = 'round';
    const pass = (list, bridge) => {
      g.lineCap = bridge ? 'butt' : 'round';
      for (const e of list) { const w = wOf(e); if (w * ppm < 1.6 && !bridge) continue; g.strokeStyle = bridge ? th.bridgeCasing : th.casing; g.lineWidth = w + Math.max(2.2, 2.4 / ppm) * (bridge ? 1.5 : 1); path(e); g.stroke(); }
      g.lineCap = 'round';
      for (const e of list) { g.globalAlpha = level >= 3 && ORDER.indexOf(e.kind) < ORDER.indexOf('tertiary') ? 0.6 : 1; g.strokeStyle = roadColor(th, e.kind); g.lineWidth = wOf(e); path(e); g.stroke(); }
      g.globalAlpha = 1;
    };
    pass(roads.filter((e) => !e.bridge), false);
    const br = roads.filter((e) => e.bridge); if (br.length) pass(br, true);
    if (level === 0) { g.setLineDash([3, 4]); g.strokeStyle = theme === 'day' ? 'rgba(120,90,40,.45)' : 'rgba(255,214,140,.42)'; g.lineWidth = 0.6; for (const e of roads) if (ORDER.indexOf(e.kind) >= ORDER.indexOf('secondary')) { path(e); g.stroke(); } g.setLineDash([]); }
    if (ring) { g.restore(); g.strokeStyle = 'rgba(5,10,18,.5)'; g.lineWidth = 6 / ppm; ringPath(); g.stroke(); g.strokeStyle = theme === 'day' ? 'rgba(30,40,60,.7)' : 'rgba(214,240,245,.7)'; g.lineWidth = 1.4 / ppm; g.lineJoin = 'round'; ringPath(); g.stroke(); }
    return cv;
  }
  const tkey = (l, tx, tz) => theme + ':' + l + ':' + tx + ':' + tz;
  function tile(l, tx, tz, render, budget) {
    const k = tkey(l, tx, tz), hit = cache.get(k);
    if (hit) { hit.used = seq; return hit.c; }
    if (!render || spent > budget) return null;
    const t0 = performance.now(); let c;
    try { c = renderTile(l, tx, tz); } catch (e) { console.warn('[map] tile failed', e); c = document.createElement('canvas'); c.width = c.height = 2; }
    spent += performance.now() - t0;
    cache.set(k, { c, used: seq });
    if (cache.size > MAX_TILES) { let ok2 = null, ot = Infinity; for (const [kk, v] of cache) if (v.used < seq - 4 && v.used < ot && !kk.startsWith(theme + ':' + OVERVIEW + ':')) { ot = v.used; ok2 = kk; } if (ok2) cache.delete(ok2); }
    return c;
  }
  function inWorld(l, tx, tz) { const b = build().bounds, S = tsize(l), m = 400; return !(tx * S > b.maxX + m || (tx + 1) * S < b.minX - m || tz * S > b.maxZ + m || (tz + 1) * S < b.minZ - m); }
  function tilesFor(l, x0, z0, x1, z1) { const S = tsize(l), out = []; for (let tx = Math.floor(x0 / S); tx <= Math.floor(x1 / S); tx++) for (let tz = Math.floor(z0 / S); tz <= Math.floor(z1 / S); tz++) if (inWorld(l, tx, tz)) out.push([tx, tz]); return out; }
  /**
   * Draw the base map into g, which must already be transformed to world units (1 unit = 1 m).
   * view = [x0, z0, x1, z1] world rect that covers the canvas; ppmDevice = device px per meter.
   * opts: { id (one per on-screen map), budget ms, quality }. Returns { level, pending }.
   */
  function draw(g, x0, z0, x1, z1, ppmDevice, opts = {}) {
    if (!ok()) return null;
    build(); seq++;
    const stamp = game.clock?.elapsed ?? performance.now(); if (stamp !== frameStamp) { frameStamp = stamp; spent = 0; }
    const budget = opts.budget ?? 7, id = opts.id || 'default';
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const seam = 1 / Math.max(1e-4, ppmDevice);
    const paint = (l, tx, tz, c) => { const S = tsize(l); g.drawImage(c, tx * S, tz * S, S + seam, S + seam); };
    // 1) overview underlay: always complete (first frames may build it, a few tiles per frame)
    let pending = 0;
    for (const [tx, tz] of tilesFor(OVERVIEW, x0, z0, x1, z1)) { const c = tile(OVERVIEW, tx, tz, true, Math.max(budget, 30)); if (c) paint(OVERVIEW, tx, tz, c); else pending++; }
    // 2) wanted level from the scale, capped so a view never needs more than ~40 tiles
    let want = clamp(Math.floor(Math.log2(TILE_PX / BASE_M / Math.max(1e-6, ppmDevice * (opts.quality ?? 0.85)))), 0, LEVELS - 1);
    while (want < LEVELS - 1 && tilesFor(want, x0, z0, x1, z1).length > 40) want++;
    let v = views.get(id); if (!v || v.epoch !== epoch || v.theme !== theme) views.set(id, (v = { level: want, prev: -1, fadeAt: 0, epoch, theme }));
    const drawLevel = (l, alpha, render) => {
      if (l >= OVERVIEW) return 0; let miss = 0;
      const list = tilesFor(l, x0, z0, x1, z1), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, S = tsize(l);
      if (render) list.sort((p, q) => Math.hypot((p[0] + 0.5) * S - cx, (p[1] + 0.5) * S - cz) - Math.hypot((q[0] + 0.5) * S - cx, (q[1] + 0.5) * S - cz));
      if (alpha < 1) g.globalAlpha = alpha;
      for (const [tx, tz] of list) {
        const c = tile(l, tx, tz, render, budget);
        if (c) { paint(l, tx, tz, c); continue; }
        miss++;
        // cached parent (coarser) cropped to this tile, else cached children (finer): never a hole
        let done = false;
        for (let p = l + 1; p < OVERVIEW && !done; p++) { const S2 = tsize(p), ux = Math.floor(tx * S / S2), uz = Math.floor(tz * S / S2), c2 = tile(p, ux, uz, false); if (c2) { const sx = (tx * S - ux * S2) / S2 * TILE_PX, sz = (tz * S - uz * S2) / S2 * TILE_PX, sw = S / S2 * TILE_PX; g.drawImage(c2, sx, sz, sw, sw, tx * S, tz * S, S + seam, S + seam); done = true; } }
        if (!done && l > 0) for (let a = 0; a < 2; a++) for (let b2 = 0; b2 < 2; b2++) { const c3 = tile(l - 1, tx * 2 + a, tz * 2 + b2, false); if (c3) paint(l - 1, tx * 2 + a, tz * 2 + b2, c3); }
      }
      g.globalAlpha = 1; return miss;
    };
    if (want !== v.level) {
      // prepare the new level off-screen-first: keep showing the committed level until the new one is complete
      const list = tilesFor(want, x0, z0, x1, z1); let miss = 0;
      if (want < OVERVIEW) for (const [tx, tz] of list) if (!tile(want, tx, tz, true, budget)) miss++;
      if (miss === 0) { v.prev = v.level; v.level = want; v.fadeAt = performance.now(); } else pending += miss;
    }
    const fade = v.prev >= 0 ? clamp((performance.now() - v.fadeAt) / 140, 0, 1) : 1;
    if (fade < 1 && !opts.noFade) { drawLevel(v.prev, 1, false); pending += drawLevel(v.level, fade, true); pending++; }
    else { v.prev = -1; pending += drawLevel(v.level, 1, true); }
    return { level: v.level, pending };
  }
  /** Warm the cache around a view (called on idle frames so panning never meets a missing tile). */
  function prefetch(x0, z0, x1, z1, id, budget = 6) { const v = views.get(id); if (!v || v.level >= OVERVIEW) return 0; const S = tsize(v.level); let n = 0; spent = 0; for (const [tx, tz] of tilesFor(v.level, x0 - S, z0 - S, x1 + S, z1 + S)) { if (!cache.has(tkey(v.level, tx, tz))) { if (!tile(v.level, tx, tz, true, budget)) return n + 1; n++; } } return 0; }

  // ------------------------------------------------------------------ places and POIs
  function places() {
    const b = build(); if (b.places) return b.places;
    const c = city(), L = c.mapLayers || {}, out = [];
    if (Array.isArray(L.places) && L.places.length) for (const p of L.places) out.push({ name: p.name, kind: p.kind || 'district', x: p.x, z: p.z, r: p.r || 400 });
    else if (c.names?.districts) for (const [name, d] of Object.entries(c.names.districts)) { const water = /bay|ocean|river|channel|cut\b|canal|lake|sound|inlet|harbor|strait/i.test(name) && (!b.isWater || b.isWater(d.x, d.z) || true) && /bay|ocean|river|channel|cut\b|canal|lake|sound|inlet|strait/i.test(name); out.push({ name, kind: water ? 'water' : 'district', x: d.x, z: d.z, r: Math.sqrt((d.cells || 400) * 4) * 0.9 }); }
    else if (typeof c.districtAt === 'function') {
      const bb = b.bounds, step = Math.max(120, Math.sqrt((bb.maxX - bb.minX) * (bb.maxZ - bb.minZ) / 1600)), acc = new Map();
      for (let x = bb.minX + step / 2; x < bb.maxX; x += step) for (let z = bb.minZ + step / 2; z < bb.maxZ; z += step) { let n = null; try { n = c.districtAt(x, z); } catch (e) { /* */ } if (!n) continue; let a = acc.get(n); if (!a) acc.set(n, (a = { x: 0, z: 0, k: 0 })); a.x += x; a.z += z; a.k++; }
      for (const [name, a] of acc) out.push({ name, kind: 'district', x: a.x / a.k, z: a.z / a.k, r: Math.sqrt(a.k) * step * 0.6 });
    }
    // user (Nov 18): no generic DOWNTOWN labels (two stacked over the grid read as a bug)
    for (let i = out.length - 1; i >= 0; i--) if (/^downtown$/i.test(String(out[i].name || '').trim())) out.splice(i, 1);
    for (const p of out) { p.id = p.kind + ':' + p.name; p.inside = !b.inside || b.inside(p.x, p.z); p.prio = (p.kind === 'region' ? 5000 : p.kind === 'town' || p.kind === 'airport' ? 3000 : p.kind === 'water' || p.kind === 'lake' ? 600 : 1000) + Math.min(2500, p.r); }
    out.sort((p, q) => q.prio - p.prio);
    return (b.places = out);
  }
  /** All POIs with a category, deduped; each gets minPpm from a zoom-step declutter so icons only ever add when zooming in. */
  function pois() {
    const b = build(), IL = game.interiors?.list, stamp = (Array.isArray(IL) ? IL.length : 0) + ':' + (city().mapLayers?.pois?.length || 0) + ':' + (city().storefronts?.length || 0);
    if (b.pois && b.poisStamp === stamp) return b.pois;
    const out = [], seen = new Set();
    const push = (x, z, type, name, extra) => { if (!isFinite(x) || !isFinite(z)) return; if (b.inside && !b.inside(x, z)) return; const k = Math.round(x / 6) + ',' + Math.round(z / 6); if (seen.has(k)) return; seen.add(k); const cat = extra?.cat || poiCategory(type); out.push({ x, z, type: String(type || ''), name: name ? String(name) : null, cat, ...extra }); };
    if (Array.isArray(IL)) for (const it of IL) { const c = it?.center || it?.pos || it?.position; if (c) push(c.x, c.z, it.type || it.kind || it.name, it.name, { ref: it }); }
    for (const p of city().mapLayers?.pois || []) push(p.x, p.z, p.type, p.name);
    if (!out.length) for (const s of city().storefronts || []) if (s.kind || s.type || s.poi) push(s.x, s.z, s.kind || s.type || s.poi, s.name);
    for (const p of out) { p.prio = CAT[p.cat].rank + (hash32(p.x.toFixed(0) + p.z.toFixed(0)) % 100) / 100; }
    out.sort((p, q) => q.prio - p.prio);
    // zoom-step declutter: at each step place by priority on a grid of the icon footprint; once placed, placed at every finer step
    for (const p of out) p.minPpm = Infinity;
    for (let ppm = 0.04; ppm <= 6.5; ppm *= 1.5) {
      const cell = 30 / ppm, occ = new Set();
      for (const p of out) { const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell); if (p.minPpm <= ppm) { occ.add(k); continue; } if (occ.has(k)) continue; let hit = false; const ci = Math.floor(p.x / cell), cj = Math.floor(p.z / cell); for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) if ((i || j) && occ.has((ci + i) + ',' + (cj + j))) { /* neighbors allowed: the grid already separates icons */ } if (hit) continue; occ.add(k); p.minPpm = ppm; }
    }
    b.poisStamp = stamp; return (b.pois = out);
  }

  // ------------------------------------------------------------------ label layout per zoom step (stable under pan)
  const FONT_C = '"Archivo Black", "Avenir Next Condensed", "Arial Narrow", sans-serif', FONT_S = 'Inter, system-ui, sans-serif';
  let measureCtx = null;
  const tw = (font, text) => { if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d'); measureCtx.font = font; return measureCtx.measureText(text).width; };
  const stepOf = (ppm) => Math.round(Math.log2(Math.max(0.02, ppm)) * 2) / 2;     // half-octave steps
  function layout(ppm) {
    const b = build(), st = stepOf(ppm); let Lo = b.layouts.get(st); if (Lo) return Lo;
    const p0 = 2 ** (st - 0.25);                 // smallest ppm of this step: boxes are largest here, so nothing overlaps anywhere in the step
    const boxes = new Map(), cell = 160 / p0, items = [];
    const free = (x, z, hw, hh) => { const i0 = Math.floor((x - hw) / cell), i1 = Math.floor((x + hw) / cell), j0 = Math.floor((z - hh) / cell), j1 = Math.floor((z + hh) / cell); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = boxes.get(i + ',' + j); if (a) for (const q of a) if (Math.abs(q[0] - x) < q[2] + hw && Math.abs(q[1] - z) < q[3] + hh) return false; } return true; };
    const take = (x, z, hw, hh) => { const i0 = Math.floor((x - hw) / cell), i1 = Math.floor((x + hw) / cell), j0 = Math.floor((z - hh) / cell), j1 = Math.floor((z + hh) / cell); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i + ',' + j; let a = boxes.get(k); if (!a) boxes.set(k, (a = [])); a.push([x, z, hw, hh]); } };
    // places
    for (const p of places()) {
      if (!p.inside) continue;
      const big = p.kind === 'region' || p.kind === 'town' || p.kind === 'airport';
      const showAt = p.kind === 'region' ? 0 : big ? 0.03 : clamp(26 / Math.max(60, p.r), 0.03, 0.6);   // small districts appear later
      if (p0 * 1.5 < showAt || p0 > (p.kind === 'region' ? 0.5 : 3.2)) continue;
      const fs = p.kind === 'region' ? 17 : big ? 15 : clamp(11 + Math.sqrt(p.r) * 0.16, 12, 16), text = p.name.toUpperCase(), font = `${p.kind === 'water' || p.kind === 'lake' ? 'italic 600' : 800} ${fs}px ${FONT_C}`;
      const w = (tw(font, text) * (1 + 0.14) + 14) / p0 / 2, h = (fs + 8) / p0 / 2;
      if (!free(p.x, p.z, w, h)) continue; take(p.x, p.z, w, h);
      items.push({ t: 'place', x: p.x, z: p.z, text, font, fs, kind: p.kind, id: p.id });
    }
    // shields and street names along chains at fixed world anchors
    const minRank = p0 > 1.3 ? 0 : p0 > 0.7 ? ORDER.indexOf('residential') : p0 > 0.36 ? ORDER.indexOf('tertiary') : p0 > 0.16 ? ORDER.indexOf('secondary') : p0 > 0.07 ? ORDER.indexOf('primary') : ORDER.indexOf('trunk');
    const chains = b.chains.filter((c2) => c2.rank >= minRank).sort((p, q) => q.rank - p.rank || q.len - p.len);
    const at = (ch, s) => { let i = 1; while (i < ch.cum.length - 1 && ch.cum[i] < s) i++; const t = (s - ch.cum[i - 1]) / Math.max(1e-6, ch.cum[i] - ch.cum[i - 1]); return [ch.pts[i - 1][0] + (ch.pts[i][0] - ch.pts[i - 1][0]) * t, ch.pts[i - 1][1] + (ch.pts[i][1] - ch.pts[i - 1][1]) * t]; };
    for (const ch of chains) {
      const ref = ch.ref || (/^(I|US|SR|CR|FL)[ -]?\d+/i.test(ch.name || '') ? ch.name : null);
      if (ref && ch.rank >= ORDER.indexOf('primary')) {
        const r1 = String(ref).split(';')[0].trim(), sp = 620 / p0, n = Math.floor(ch.len / sp);
        for (let i = 0; i <= n; i++) { const s = n ? ch.len * (i + 0.5) / (n + 1) : ch.len / 2; if (ch.len < 90 / p0) break; const [x, z] = at(ch, s); const hw = 15 / p0, hh = 11 / p0; if (!free(x, z, hw, hh)) continue; take(x, z, hw, hh); items.push({ t: 'shield', x, z, ref: r1 }); }
      }
      if (!ch.name || p0 < 0.3 && ch.rank < ORDER.indexOf('trunk')) continue;
      const fs = p0 > 1.3 ? 12 : 11, font = `600 ${fs}px ${FONT_S}`, wpx = tw(font, ch.name), wm = wpx / p0;
      if (ch.len < wm * 1.25) continue;
      const sp = Math.max(wm + 300 / p0, 430 / p0), n = Math.max(1, Math.floor(ch.len / sp));
      for (let i = 0; i < n; i++) {
        const s = ch.len * (i + 0.5) / n, [x, z] = at(ch, s), A = at(ch, Math.max(0, s - wm / 2)), Bq = at(ch, Math.min(ch.len, s + wm / 2));
        if (Math.hypot(Bq[0] - A[0], Bq[1] - A[1]) < wm * 0.86) continue;                     // too bent here
        let ang = Math.atan2(Bq[1] - A[1], Bq[0] - A[0]); if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang)), hw = (wm / 2 * ca + 8 / p0 * sa) + 4 / p0, hh = (wm / 2 * sa + 8 / p0 * ca) + 3 / p0;
        if (!free(x, z, hw, hh)) continue; take(x, z, hw, hh);
        items.push({ t: 'street', x, z, text: ch.name, font, ang, hwy: ch.rank >= ORDER.indexOf('trunk') });
      }
    }
    Lo = { step: st, items, grid: null };
    b.layouts.set(st, Lo); if (b.layouts.size > 14) b.layouts.delete(b.layouts.keys().next().value);
    return Lo;
  }
  function shield(g, x, y, ref) {
    const m = /^(I|US|SR|CR|FL|A1A)?[ -]?(\w+)/i.exec(ref) || [], cls = (m[1] || '').toUpperCase(), numTxt = (m[2] || ref).toUpperCase().slice(0, 4);
    g.save(); g.translate(x, y); g.font = `800 10.5px ${FONT_C}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.max(20, g.measureText(numTxt).width + 9);
    if (cls === 'I') { g.beginPath(); g.moveTo(-w / 2, -8); g.lineTo(w / 2, -8); g.lineTo(w / 2, 1); g.quadraticCurveTo(w / 2 - 1, 7, 0, 10); g.quadraticCurveTo(-w / 2 + 1, 7, -w / 2, 1); g.closePath(); g.fillStyle = '#24509c'; g.fill(); g.strokeStyle = '#f3ede2'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#c8402f'; g.fillRect(-w / 2 + 1, -7.4, w - 2, 3.4); g.fillStyle = '#fff'; g.fillText(numTxt, 0, 2); }
    else if (cls === 'US') { g.beginPath(); g.moveTo(-w / 2, -8); g.quadraticCurveTo(0, -5.5, w / 2, -8); g.lineTo(w / 2, 2); g.quadraticCurveTo(w / 2, 7, 0, 9.5); g.quadraticCurveTo(-w / 2, 7, -w / 2, 2); g.closePath(); g.fillStyle = '#f6f2e8'; g.fill(); g.strokeStyle = '#10151e'; g.lineWidth = 1.3; g.stroke(); g.fillStyle = '#10151e'; g.fillText(numTxt, 0, 1); }
    else { roundRect(g, -w / 2, -7.5, w, 15, cls === 'CR' ? 3 : 7.5); g.fillStyle = cls === 'CR' ? '#2b5ea8' : '#f6f2e8'; g.fill(); g.strokeStyle = cls === 'CR' ? '#f2c94c' : '#10151e'; g.lineWidth = 1.3; g.stroke(); g.fillStyle = cls === 'CR' ? '#f2c94c' : '#10151e'; g.fillText(numTxt, 0, 0.5); }
    g.restore();
  }
  /** Labels in screen space. xf = { k, ox, oz } (css px per meter and offsets). hidden(x, z) hides labels in fog. */
  function drawLabels(g, xf, W, H, o = {}) {
    if (!ok()) return;
    const th = T(), Lo = layout(xf.k), x0 = -xf.ox / xf.k, z0 = -xf.oz / xf.k, x1 = (W - xf.ox) / xf.k, z1 = (H - xf.oz) / xf.k, m = 200 / xf.k;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const it of Lo.items) {
      if (it.x < x0 - m || it.x > x1 + m || it.z < z0 - m || it.z > z1 + m) continue;
      if (o.hidden && o.hidden(it.x, it.z)) continue;
      const sx = xf.ox + it.x * xf.k, sy = xf.oz + it.z * xf.k;
      if (it.t === 'shield') { shield(g, sx, sy, it.ref); continue; }
      g.font = it.font;
      if (it.t === 'street') { g.save(); g.translate(sx, sy); g.rotate(it.ang); g.lineWidth = 3; g.strokeStyle = th.labelHalo; g.strokeText(it.text, 0, 0.5); g.fillStyle = it.hwy ? th.labelHwy : th.labelRoad; g.fillText(it.text, 0, 0.5); g.restore(); continue; }
      const sp = it.fs * 0.14;                       // tracked caps for places
      try { g.letterSpacing = sp + 'px'; } catch (e) { /* older canvases */ }
      g.lineWidth = 3.5; g.strokeStyle = th.labelHalo; g.strokeText(it.text, sx, sy);
      g.fillStyle = it.kind === 'water' || it.kind === 'lake' ? th.labelWater : it.kind === 'park' ? th.labelPark : th.label; g.globalAlpha = it.kind === 'region' ? 0.75 : 0.95; g.fillText(it.text, sx, sy); g.globalAlpha = 1;
      try { g.letterSpacing = '0px'; } catch (e) { /* */ }
    }
  }
  /** One POI / marker badge (screen space). */
  function badge(g, x, y, iconName, color, s = 1, o = {}) {
    g.save(); g.translate(x, y); g.scale(s, s);
    if (o.dim) g.globalAlpha = 0.45;
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
    g.fillStyle = o.fill || '#0d1320'; g.beginPath();
    if (o.shape === 'diamond') { g.moveTo(0, -10.5); g.lineTo(10.5, 0); g.lineTo(0, 10.5); g.lineTo(-10.5, 0); g.closePath(); } else if (o.shape === 'square') roundRect(g, -9, -9, 18, 18, 5); else g.arc(0, 0, 9.5, 0, TAU);
    g.fill(); g.shadowColor = 'transparent'; g.lineWidth = 1.6; g.strokeStyle = color; g.stroke();
    drawIcon(g, iconName, 0, 0, o.shape === 'diamond' ? 11 : 12.5, color, 2);
    g.restore();
  }
  return {
    ok, draw, prefetch, drawLabels, places, pois, badge, shield, query, cat: (id) => CAT[id] || CAT.shop,
    bounds: () => (ok() ? build().bounds : null), boundary: () => (ok() ? build().ring : null), inside: (x, z) => { const b = build(); return b.inside ? b.inside(x, z) : true; },
    get theme() { return theme; }, setTheme(t) { if (THEMES[t] && t !== theme) { theme = t; if (B) B.layouts.clear(); } }, colors: T,
    invalidate() { B = null; builtFor = null; cache.clear(); views.clear(); },
    stats: () => ({ tiles: cache.size, levels: [...views].map(([k, v]) => k + ':' + v.level) }),
    stepOf,
  };
}
