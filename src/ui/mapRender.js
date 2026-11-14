import { boundaryFor, pointInRing, ringBounds } from './mapBoundary.js';
// PORT SOLANA — tiled map renderer for the minimap, pause map and phone map.
// Renders city.mapLayers (+ city.roadGraph edges) into cached 512px tiles at several
// world scales so huge real-scale cities stay cheap to draw every frame.
// Works with any city exposing mapLayers; returns ok() === false otherwise.

const TILE_PX = 512;
const BASE_TILE_M = 250;          // level 0 tile size in metres (2.05 px/m)
const LEVELS = 7;                 // 250 m .. 16 km per tile
const MAX_TILES = 110;            // LRU cap (~1 MB each); on-screen + overview tiles are never evicted
const CELL = 250;                 // spatial index cell (m)

// V2 palette follows the world layout preview (deep navy sea, turquoise shallows, gold sand, natural greens,
// grey urban, pale roads). setMapPalette() takes layout.json's palette so the map follows the world data.
export const MAP_COLORS = {
  water: '#0b4d7c',
  sea: '#074176',
  shallow: '#238895',
  waterDeep: '#06365f',
  land: '#909d64',
  beach: '#eedba7',
  park: '#7f9a56',
  forest: '#5f7941',
  urban: '#a39d94',
  building: '#b9b2a6',
  buildingTall: '#cfc8bb',
  buildingEdge: 'rgba(60,52,44,.22)',
  casing: 'rgba(84,78,68,.55)',
  bridgeCasing: '#4a443b',
};
const rgbHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, '0')).join('');
export function setMapPalette(pal) {
  if (!pal || typeof pal !== 'object') return;
  const pick = (k) => (Array.isArray(pal[k]) && pal[k].length >= 3 ? rgbHex(pal[k]) : null);
  MAP_COLORS.sea = pick('ocean') || MAP_COLORS.sea;
  MAP_COLORS.shallow = pick('shallow') || MAP_COLORS.shallow;
  MAP_COLORS.beach = pick('sand') || MAP_COLORS.beach;
  MAP_COLORS.urban = pick('urban') || MAP_COLORS.urban;
  MAP_COLORS.forest = pick('forest') || MAP_COLORS.forest;
  MAP_COLORS.land = pick('land') || MAP_COLORS.land;
  MAP_COLORS.water = pick('water') || MAP_COLORS.water;
}
// land cover classes (city.mapLayers.cover) drawn over the land fill
const COVER_STYLE = {
  forest: () => MAP_COLORS.forest,
  grove: () => '#6f8a47',
  farmland: () => '#a9ad6c',
  sawgrass: () => '#8e9a5c',
  wetland: () => '#6f8d6c',
  wild: () => '#869659',
  dirt: () => '#b3a079',
  rock: () => '#9c968b',
  construction: () => '#b4aa98',
  parking: () => MAP_COLORS.urban,
  plaza: () => '#bdb6aa',
  paved: () => MAP_COLORS.urban,
  apron: () => '#c3c0b8',
  taxiway: () => '#8f8c86',
  runway: () => '#6e6b66',
};
const COVER_ORDER = ['wild', 'sawgrass', 'wetland', 'farmland', 'grove', 'forest', 'dirt', 'rock', 'construction', 'parking', 'plaza', 'paved', 'apron', 'taxiway', 'runway'];
// road style by OSM-ish kind: [fill colour, min width m, level cutoff (skip above this level)]
const ROAD_STYLE = {
  motorway: ['#f6dfa0', 14, 9],
  trunk: ['#f3e5bd', 12, 9],
  primary: ['#f7f4ec', 11, 6],
  secondary: ['#efebe2', 9, 5],
  tertiary: ['#e6e2d8', 8, 4],
  residential: ['#dcd7cc', 6, 3],
  unclassified: ['#dcd7cc', 6, 3],
  living_street: ['#dcd7cc', 5, 2],
  service: ['#d0cabe', 4, 1],
  pedestrian: ['#e2d6bd', 4, 2],
  footway: ['#d8ccb2', 2, 1],
  path: ['#d8ccb2', 2, 1],
  cycleway: ['#b9d3c3', 2, 1],
  default: ['#e3ded4', 7, 4],
};
const KIND_ORDER = ['footway', 'path', 'cycleway', 'service', 'pedestrian', 'living_street', 'unclassified', 'residential', 'default', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
const kindKey = (k) => (k && ROAD_STYLE[String(k).replace(/_link$/, '')] ? String(k).replace(/_link$/, '') : 'default');

function isRingList(p) { return Array.isArray(p) && Array.isArray(p[0]) && Array.isArray(p[0][0]); }
function ringsOf(p) {
  if (!p) return [];
  if (p.outer) return [p.outer, ...(p.holes || [])];
  if (p.rings) return p.rings;
  if (p.pts) return [p.pts];
  return isRingList(p) ? p : [p];
}
function bboxOfRings(rings) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of rings) for (const pt of r) { const x = pt[0], z = pt[1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return [x0, z0, x1, z1];
}

export function createMapRenderer(game) {
  let built = null, builtFor = null;
  const cache = new Map();   // key -> { c, used }
  let frameBudgetMs = 6, spentThisFrame = 0, frameId = -1, drawSeq = 0;
  const lastLevel = new Map();
  const OVERVIEW = 4;        // 4 km tiles: rendered once, kept forever, drawn under every zoom

  function city() { return game.city; }
  function ok() { const c = city(); return !!(c && c.mapLayers && (Array.isArray(c.mapLayers.land) || Array.isArray(c.mapLayers.roadEdges))); }

  // ---------- boundary mask (fast inside tests) ----------
  function makeMask(ring) {
    const b = ringBounds(ring), C = 40, nx = Math.ceil((b.maxX - b.minX) / C) + 1, nz = Math.ceil((b.maxZ - b.minZ) / C) + 1;
    const corner = new Uint8Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) corner[j * (nx + 1) + i] = pointInRing(ring, b.minX + i * C, b.minZ + j * C) ? 1 : 0;
    const cell = new Uint8Array(nx * nz); // 0 out, 1 in, 2 edge
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const s = corner[j * (nx + 1) + i] + corner[j * (nx + 1) + i + 1] + corner[(j + 1) * (nx + 1) + i] + corner[(j + 1) * (nx + 1) + i + 1];
      cell[j * nx + i] = s === 4 ? 1 : s === 0 ? 0 : 2;
    }
    // widen edge band by one cell so thin boundary slivers are always exact-tested
    const out = cell.slice();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (cell[j * nx + i] === 2) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, c2 = j + dj; if (a >= 0 && c2 >= 0 && a < nx && c2 < nz && out[c2 * nx + a] !== 2) out[c2 * nx + a] = 2; }
    return (x, z) => {
      const i = Math.floor((x - b.minX) / C), j = Math.floor((z - b.minZ) / C);
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      const v = out[j * nx + i]; return v === 1 ? true : v === 0 ? false : pointInRing(ring, x, z);
    };
  }
  let insideFn = null;
  function insideB(x, z) { build(); return insideFn ? insideFn(x, z) : true; }

  // ---------- spatial index ----------
  function build() {
    const c = city();
    if (builtFor === c && built) return built;
    const L = c.mapLayers || {};
    const ring = boundaryFor(c);
    insideFn = ring ? makeMask(ring) : null;
    const big = [], grid = new Map();
    const add = (layer, item, bb) => {
      const cx0 = Math.floor(bb[0] / CELL), cz0 = Math.floor(bb[1] / CELL), cx1 = Math.floor(bb[2] / CELL), cz1 = Math.floor(bb[3] / CELL);
      const rec = { layer, item, bb };
      if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 64) { big.push(rec); return; }
      for (let i = cx0; i <= cx1; i++) for (let j = cz0; j <= cz1; j++) {
        const k = i + ',' + j; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(rec);
      }
    };
    for (const layer of ['land', 'beach', 'park', 'water']) {
      const arr = Array.isArray(L[layer]) ? L[layer] : [];
      for (const p of arr) { const rings = ringsOf(p).filter((r) => Array.isArray(r) && r.length > 2); if (!rings.length) continue; add(layer, { rings, h: 0 }, bboxOfRings(rings)); }
    }
    const cov = L.cover && typeof L.cover === 'object' ? L.cover : {};
    for (const cls of Object.keys(cov)) {
      const arr = Array.isArray(cov[cls]) ? cov[cls] : [];
      for (const p of arr) {
        const rings = ringsOf(p).filter((r) => Array.isArray(r) && r.length > 2);
        if (!rings.length) continue;
        add('cover', { rings, h: 0, cls }, bboxOfRings(rings));
      }
    }
    const blds = Array.isArray(L.buildingPolys) ? L.buildingPolys : [];
    for (const p of blds) {
      const rings = ringsOf(p).filter((r) => Array.isArray(r) && r.length > 2); if (!rings.length) continue;
      // buildings outside (or crossing) the playable boundary are kept but drawn dimmed in the off-limits area
      const inB = !insideFn || rings[0].every((q) => insideFn(q[0], q[1]));
      add('building', { rings, h: +(p.h ?? p.height ?? 0) || 0, inside: inB }, bboxOfRings(rings));
    }
    const edges = [];
    const G = c.roadGraph;
    if (G && Array.isArray(G.edges) && G.edges.length) {
      for (const e of G.edges) if (e && Array.isArray(e.pts) && e.pts.length > 1) edges.push({ pts: e.pts, width: +e.width || 0, kind: kindKey(e.kind), bridge: !!e.bridge, name: e.name || null, id: e.id });
    } else if (Array.isArray(L.roadEdges)) {
      for (const r of L.roadEdges) {
        const pts = Array.isArray(r) ? r : r?.pts; if (!Array.isArray(pts) || pts.length < 2) continue;
        edges.push({ pts, width: +(r.width || 0), kind: kindKey(r.kind), bridge: !!r.bridge, name: r.name || null });
      }
    } else if (Array.isArray(c.roads)) {
      for (const r of c.roads) edges.push({ pts: [[r.x1, r.z1], [r.x2, r.z2]], width: +r.width || 12, kind: 'default', bridge: false, name: null });
    }
    for (const e of edges) {
      e.inside = !insideFn || e.pts.some((q) => insideFn(q[0], q[1])); // fully outside: drawn dimmed, no labels
      add('road', e, bboxOfRings([e.pts]));
    }
    // label chains: join same-name edges that share endpoints
    const key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
    const byName = new Map();
    for (const e of edges) if (e.name) { let a = byName.get(e.name); if (!a) byName.set(e.name, (a = [])); a.push(e); }
    for (const [name, list] of byName) {
      const ends = new Map(), used = new Set();
      for (const e of list) for (const end of [key(e.pts[0]), key(e.pts[e.pts.length - 1])]) { let a = ends.get(end); if (!a) ends.set(end, (a = [])); a.push(e); }
      for (const e0 of list) {
        if (used.has(e0)) continue; used.add(e0);
        let pts = e0.pts.slice();
        for (let dir = 0; dir < 2; dir++) {
          for (let guard = 0; guard < 400; guard++) {
            const tail = pts[pts.length - 1], cands = (ends.get(key(tail)) || []).filter((e) => !used.has(e));
            if (cands.length !== 1) break;
            const e = cands[0]; used.add(e);
            const fwd = key(e.pts[0]) === key(tail);
            pts = pts.concat(fwd ? e.pts.slice(1) : e.pts.slice(0, -1).reverse());
          }
          pts.reverse();
        }
        add('chain', { name, kind: e0.kind, pts }, bboxOfRings([pts]));
      }
    }
    const rb0 = ring ? ringBounds(ring) : null, db = c.bounds;
    // pan/zoom range covers everything that exists in the world (the playable ring plus the dimmed area around it)
    const bounds = rb0 ? (db ? { minX: Math.min(rb0.minX, db.minX), maxX: Math.max(rb0.maxX, db.maxX), minZ: Math.min(rb0.minZ, db.minZ), maxZ: Math.max(rb0.maxZ, db.maxZ) } : rb0) : (c.bounds || (() => { const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }; for (const e of edges) for (const [x, z] of e.pts) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); } return b; })());
    const hasLand = Array.isArray(L.land) && L.land.length > 0;
    built = { big, grid, edges, bounds, hasLand, ring };
    builtFor = c; cache.clear(); districtCache = null; lastLevel.clear();
    return built;
  }
  function query(x0, z0, x1, z1, layerFilter) {
    const B = build(), out = [], seen = new Set();
    const cx0 = Math.floor(x0 / CELL), cz0 = Math.floor(z0 / CELL), cx1 = Math.floor(x1 / CELL), cz1 = Math.floor(z1 / CELL);
    const take = (rec) => {
      if (seen.has(rec)) return; seen.add(rec);
      if (layerFilter && !layerFilter(rec.layer)) return;
      const bb = rec.bb; if (bb[2] < x0 || bb[0] > x1 || bb[3] < z0 || bb[1] > z1) return;
      out.push(rec);
    };
    for (const rec of B.big) take(rec);
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 6000) { for (const a of B.grid.values()) for (const rec of a) take(rec); return out; }
    for (let i = cx0; i <= cx1; i++) for (let j = cz0; j <= cz1; j++) { const a = B.grid.get(i + ',' + j); if (a) for (const rec of a) take(rec); }
    return out;
  }

  // ---------- tile rendering ----------
  function tileSize(level) { return BASE_TILE_M * Math.pow(2, level); }
  function ringPath(g, ring) { g.beginPath(); g.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); }
  function renderTile(level, tx, tz) {
    const S = tileSize(level), x0 = tx * S, z0 = tz * S, ppm = TILE_PX / S;
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE_PX;
    const g = cv.getContext('2d');
    g.fillStyle = MAP_COLORS.sea; g.fillRect(0, 0, TILE_PX, TILE_PX);
    g.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm);
    const B = build(), ring = B.ring;
    const pad = 40;
    const fillRings = (items, style) => {
      g.fillStyle = style; g.beginPath();
      for (const it of items) for (const rr of it.rings) { g.moveTo(rr[0][0], rr[0][1]); for (let i = 1; i < rr.length; i++) g.lineTo(rr[i][0], rr[i][1]); g.closePath(); }
      g.fill('evenodd');
    };
    const recs = query(x0 - pad, z0 - pad, x0 + S + pad, z0 + S + pad);
    if (ring) {
      const bb = B.bounds;
      if (x0 > bb.maxX + 200 || x0 + S < bb.minX - 200 || z0 > bb.maxZ + 200 || z0 + S < bb.minZ - 200) return cv;
      // off-limits area outside the playable boundary: real city shown dimmed and flat (no detail, no labels)
      const oLand = [], oWater = [], oB = [], oR = [];
      for (const r of recs) { if (r.layer === 'land') oLand.push(r.item); else if (r.layer === 'water') oWater.push(r.item); else if (r.layer === 'building' && r.item.inside === false) oB.push(r.item); else if (r.layer === 'road' && r.item.inside === false) oR.push(r.item); }
      if (!B.hasLand) { g.fillStyle = '#161d27'; g.fillRect(x0, z0, S, S); } else if (oLand.length) fillRings(oLand, '#161d27');
      if (oWater.length) fillRings(oWater, MAP_COLORS.water);
      if (oB.length) fillRings(oB, '#232c39');
      if (oR.length) { g.strokeStyle = 'rgba(120,132,150,.35)'; g.lineCap = 'round'; for (const e of oR) { g.lineWidth = Math.max((e.width || 8) * 0.8, 1 / ppm); g.beginPath(); g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); g.stroke(); } }
      g.save(); ringPath(g, ring); g.clip();
    }
    const by = { land: [], beach: [], park: [], water: [], building: [], road: [], cover: [] };
    for (const r of recs) { if ((r.layer === 'building' || r.layer === 'road') && r.item.inside === false) continue; by[r.layer]?.push(r.item); }
    if (!B.hasLand) { g.fillStyle = MAP_COLORS.land; g.fillRect(x0, z0, S, S); }
    else if (by.land.length) {
      // turquoise shallows: a wide soft band hugging every coast, under the land fill
      g.save();
      g.lineJoin = 'round';
      g.strokeStyle = MAP_COLORS.shallow;
      g.globalAlpha = 0.55;
      g.lineWidth = 300;
      g.beginPath();
      for (const it of by.land) for (const rr of it.rings) { g.moveTo(rr[0][0], rr[0][1]); for (let i = 1; i < rr.length; i++) g.lineTo(rr[i][0], rr[i][1]); g.closePath(); }
      g.stroke();
      g.globalAlpha = 1;
      g.lineWidth = 110;
      g.stroke();
      g.restore();
      fillRings(by.land, MAP_COLORS.land);
    }
    if (by.cover.length) {
      const groups = new Map();
      for (const it of by.cover) { let a = groups.get(it.cls); if (!a) groups.set(it.cls, (a = [])); a.push(it); }
      const order = [...groups.keys()].sort((a, b) => COVER_ORDER.indexOf(a) - COVER_ORDER.indexOf(b));
      for (const cls of order) fillRings(groups.get(cls), (COVER_STYLE[cls] || (() => MAP_COLORS.park))());
    }
    if (by.park.length) fillRings(by.park, MAP_COLORS.park);
    if (by.beach.length) fillRings(by.beach, MAP_COLORS.beach);
    if (by.water.length) {
      fillRings(by.water, MAP_COLORS.water);
      g.strokeStyle = 'rgba(35,136,149,.55)'; g.lineWidth = 2.5 / ppm; g.beginPath();
      for (const it of by.water) for (const rr of it.rings) { g.moveTo(rr[0][0], rr[0][1]); for (let i = 1; i < rr.length; i++) g.lineTo(rr[i][0], rr[i][1]); g.closePath(); }
      g.stroke();
    }
    // buildings at every level (cheap flat fill when zoomed out)
    if (by.building.length) {
      const low = [], tall = [];
      const minA = level >= 3 ? (0.6 / ppm) * (0.6 / ppm) : 0;
      for (const b of by.building) {
        if (minA) { const r0 = b.rings[0]; let x1 = Infinity, x2 = -Infinity, z1 = Infinity, z2 = -Infinity; for (const q of r0) { if (q[0] < x1) x1 = q[0]; if (q[0] > x2) x2 = q[0]; if (q[1] < z1) z1 = q[1]; if (q[1] > z2) z2 = q[1]; } if ((x2 - x1) * (z2 - z1) < minA) continue; }
        (b.h > 40 ? tall : low).push(b);
      }
      g.save();
      if (level === 0) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 4; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2; }
      fillRings(low, level >= 2 ? MAP_COLORS.urban : MAP_COLORS.building);
      fillRings(tall, level >= 2 ? '#b3ada3' : MAP_COLORS.buildingTall);
      g.restore();
      if (level === 0) {
        g.strokeStyle = MAP_COLORS.buildingEdge; g.lineWidth = 1 / ppm; g.beginPath();
        for (const it of by.building) for (const rr of it.rings) { g.moveTo(rr[0][0], rr[0][1]); for (let i = 1; i < rr.length; i++) g.lineTo(rr[i][0], rr[i][1]); g.closePath(); }
        g.stroke();
      }
    }
    const roads = by.road.filter((e) => (ROAD_STYLE[e.kind] || ROAD_STYLE.default)[2] >= level);
    roads.sort((a, b) => (a.bridge - b.bridge) || (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)));
    const minPx = level <= 1 ? 1.2 : level <= 3 ? 1.0 : 0.8;
    const widthOf = (e) => { const st = ROAD_STYLE[e.kind] || ROAD_STYLE.default; return Math.max(e.width || st[1], st[1] * 0.6, minPx / ppm); };
    const path = (e) => { g.beginPath(); g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const minorIdx = KIND_ORDER.indexOf('tertiary');
    const pass = (list, bridge) => {
      for (const e of list) { g.strokeStyle = bridge ? MAP_COLORS.bridgeCasing : MAP_COLORS.casing; g.lineWidth = widthOf(e) + Math.max(2.4, 3 / ppm) * (bridge ? 1.6 : 1); if (bridge) g.lineCap = 'butt'; path(e); g.stroke(); g.lineCap = 'round'; }
      for (const e of list) {
        g.globalAlpha = level >= 2 && KIND_ORDER.indexOf(e.kind) < minorIdx ? 0.55 : 1;
        g.strokeStyle = (ROAD_STYLE[e.kind] || ROAD_STYLE.default)[0]; g.lineWidth = widthOf(e); path(e); g.stroke();
      }
      g.globalAlpha = 1;
    };
    pass(roads.filter((e) => !e.bridge), false);
    const br = roads.filter((e) => e.bridge);
    if (br.length) { g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6; pass(br, true); g.restore(); }
    if (level === 0) {
      g.setLineDash([3, 4]); g.strokeStyle = 'rgba(150,130,90,.45)'; g.lineWidth = 0.6;
      for (const e of roads) if (e.kind === 'primary' || e.kind === 'secondary' || e.kind === 'trunk' || e.kind === 'motorway' || e.kind === 'default') { path(e); g.stroke(); }
      g.setLineDash([]);
    }
    if (ring) {
      g.restore();
      // crisp designed edge: soft drop shadow outside + thin light outline
      g.save();
      g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 10 * (TILE_PX / 512); g.shadowOffsetY = 3 / ppm * 0;
      g.strokeStyle = 'rgba(5,12,20,.55)'; g.lineWidth = 6 / ppm; ringPath(g, ring); g.stroke();
      g.restore();
      g.strokeStyle = 'rgba(214,240,245,.75)'; g.lineWidth = 1.4 / ppm; g.lineJoin = 'round'; ringPath(g, ring); g.stroke();
    }
    return cv;
  }
  function getTile(level, tx, tz, allowRender, force) {
    const key = level + ':' + tx + ':' + tz;
    const hit = cache.get(key);
    if (hit) { hit.used = drawSeq; return hit.c; }
    if (!allowRender) return null;
    const fid = game.clock?.elapsed ?? performance.now();
    if (fid !== frameId) { frameId = fid; spentThisFrame = 0; }
    if (!force && spentThisFrame > frameBudgetMs) return null;
    const t0 = performance.now();
    let c = null;
    try { c = renderTile(level, tx, tz); } catch (e) { console.warn('[hud map] tile failed', e); c = document.createElement('canvas'); c.width = c.height = 2; }
    spentThisFrame += performance.now() - t0;
    cache.set(key, { c, used: drawSeq });
    if (cache.size > MAX_TILES) {
      let oldK = null, oldT = Infinity;
      for (const [k, v] of cache) if (v.used < drawSeq - 3 && v.used < oldT && !k.startsWith(OVERVIEW + ':')) { oldT = v.used; oldK = k; }
      if (oldK) cache.delete(oldK);
    }
    return c;
  }
  function overviewTiles() {
    const B = build().bounds, S = tileSize(OVERVIEW), out = [];
    for (let tx = Math.floor((B.minX - 200) / S); tx <= Math.floor((B.maxX + 200) / S); tx++)
      for (let tz = Math.floor((B.minZ - 200) / S); tz <= Math.floor((B.maxZ + 200) / S); tz++) out.push([tx, tz]);
    return out;
  }
  let lastPending = 0;
  // Draw into a ctx already transformed to world units. ppmDevice: device px per metre.
  function draw(g, x0, z0, x1, z1, ppmDevice, opts = {}) {
    if (!ok()) return false;
    build();
    drawSeq++;
    if (opts.budget) frameBudgetMs = opts.budget;
    lastPending = 0;
    g.imageSmoothingEnabled = true;
    // 1) overview underlay: always present, rendered once (one per call until complete, even over budget)
    const S4 = tileSize(OVERVIEW);
    let forcedOne = false;
    for (const [tx, tz] of overviewTiles()) {
      const k = OVERVIEW + ':' + tx + ':' + tz, hit = cache.get(k);
      let c = hit ? hit.c : null;
      if (hit) hit.used = drawSeq;
      else if (!forcedOne) { forcedOne = true; c = getTile(OVERVIEW, tx, tz, true, spentThisFrame < 40); }
      if (c && !(tx * S4 > x1 || (tx + 1) * S4 < x0 || tz * S4 > z1 || (tz + 1) * S4 < z0)) g.drawImage(c, tx * S4, tz * S4, S4 + 2 / ppmDevice, S4 + 2 / ppmDevice);
    }
    // 2) level with hysteresis, never more than ~36 tiles on screen
    const q = opts.quality ?? 0.9, id = opts.id || 'default';
    const ideal = Math.max(0, Math.log2(TILE_PX / BASE_TILE_M / Math.max(1e-6, ppmDevice * q)));
    let level = lastLevel.has(id) ? lastLevel.get(id) : Math.floor(ideal);
    if (ideal < level - 0.15 || ideal > level + 1.15) level = Math.floor(ideal);
    level = Math.max(0, Math.min(LEVELS - 1, level));
    const tilesAt = (l) => { const S = tileSize(l); return (Math.floor(x1 / S) - Math.floor(x0 / S) + 1) * (Math.floor(z1 / S) - Math.floor(z0 / S) + 1); };
    while (level < LEVELS - 1 && tilesAt(level) > 36) level++;
    lastLevel.set(id, level);
    if (level >= OVERVIEW) { frameBudgetMs = 6; return true; } // the overview already is this detail level or finer
    const S = tileSize(level);
    const tx0 = Math.floor(x0 / S), tz0 = Math.floor(z0 / S), tx1 = Math.floor(x1 / S), tz1 = Math.floor(z1 / S);
    const seam = 1.25 / Math.max(1e-4, ppmDevice);
    // nearest-to-centre first so the middle of the view sharpens first
    const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2, order = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let tz = tz0; tz <= tz1; tz++) order.push([tx, tz, Math.hypot((tx + 0.5) * S - cxm, (tz + 0.5) * S - czm)]);
    order.sort((a, b) => a[2] - b[2]);
    for (const [tx, tz] of order) {
      if (build().ring) { const rb = build().bounds; if (tx * S > rb.maxX + 300 || (tx + 1) * S < rb.minX - 300 || tz * S > rb.maxZ + 300 || (tz + 1) * S < rb.minZ - 300) continue; }
      const c = getTile(level, tx, tz, opts.render !== false);
      if (c) { g.drawImage(c, tx * S, tz * S, S + seam, S + seam); continue; }
      lastPending++;
      // meanwhile: any cached intermediate level (coarser first, then one finer)
      let done = false;
      for (let l = level + 1; l < OVERVIEW && !done; l++) {
        const S2 = tileSize(l), ux = Math.floor((tx * S) / S2), uz = Math.floor((tz * S) / S2);
        const c2 = getTile(l, ux, uz, false);
        if (c2) { const sx = ((tx * S - ux * S2) / S2) * TILE_PX, sz = ((tz * S - uz * S2) / S2) * TILE_PX, sw = (S / S2) * TILE_PX; g.drawImage(c2, sx, sz, sw, sw, tx * S, tz * S, S + seam, S + seam); done = true; }
      }
      if (!done && level > 0) {
        const S3 = tileSize(level - 1);
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const c3 = getTile(level - 1, tx * 2 + a, tz * 2 + b, false); if (c3) g.drawImage(c3, (tx * 2 + a) * S3, (tz * 2 + b) * S3, S3 + seam, S3 + seam); }
      }
    }
    frameBudgetMs = 6;
    return true;
  }

  // ---------- labels ----------
  let districtCache = null;
  function districts() {
    if (districtCache) return districtCache;
    const c = city(); if (!c || typeof c.districtAt !== 'function') return (districtCache = []);
    const b = build().bounds, step = Math.max(150, Math.min(500, Math.sqrt(((b.maxX - b.minX) * (b.maxZ - b.minZ)) / 900)));
    const acc = new Map();
    for (let x = b.minX + step / 2; x < b.maxX; x += step) for (let z = b.minZ + step / 2; z < b.maxZ; z += step) {
      let n = null; try { n = c.districtAt(x, z); } catch (e) { /* */ }
      if (!n || (typeof c.isWater === 'function' && c.isWater(x, z)) || !insideB(x, z)) continue;
      let a = acc.get(n); if (!a) acc.set(n, (a = { n, x: 0, z: 0, k: 0 })); a.x += x; a.z += z; a.k++;
    }
    districtCache = [...acc.values()].map((a) => ({ name: a.n, x: a.x / a.k, z: a.z / a.k, size: a.k }));
    return districtCache;
  }
  // street labels along graph edges, screen-space; xf = { k, ox, oz } world->screen
  function drawStreetLabels(g, xf, W, H) {
    if (!ok() || xf.k < 0.35) return;
    const x0 = -xf.ox / xf.k, z0 = -xf.oz / xf.k, x1 = (W - xf.ox) / xf.k, z1 = (H - xf.oz) / xf.k;
    const recs = query(x0, z0, x1, z1, (l) => l === 'chain');
    const minKind = xf.k > 1.4 ? 0 : xf.k > 0.8 ? KIND_ORDER.indexOf('residential') : xf.k > 0.5 ? KIND_ORDER.indexOf('tertiary') : KIND_ORDER.indexOf('primary');
    const placed = [];
    const fs = xf.k > 1.4 ? 12 : 11;
    g.font = `600 ${fs}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cands = recs.map((r) => r.item).filter((e) => KIND_ORDER.indexOf(e.kind) >= minKind && e.inside !== false);
    cands.sort((a, b) => KIND_ORDER.indexOf(b.kind) - KIND_ORDER.indexOf(a.kind));
    let count = 0;
    for (const ch of cands) {
      if (count > 90) break;
      const sp = ch.pts.map((q) => [xf.ox + q[0] * xf.k, xf.oz + q[1] * xf.k]);
      const cum = [0];
      for (let i = 1; i < sp.length; i++) cum.push(cum[i - 1] + Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]));
      const total = cum[cum.length - 1];
      const tw = g.measureText(ch.name).width;
      if (total < tw + 24) continue;
      const at = (sArc) => { let i = 1; while (i < cum.length - 1 && cum[i] < sArc) i++; const t = (sArc - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); return [sp[i - 1][0] + (sp[i][0] - sp[i - 1][0]) * t, sp[i - 1][1] + (sp[i][1] - sp[i - 1][1]) * t]; };
      const spacing = Math.max(tw + 260, 380), n = Math.max(1, Math.floor(total / spacing));
      for (let li = 0; li < n; li++) {
        const sMid = total * (li + 0.5) / n;
        const [mx, mz] = at(sMid);
        if (mx < 20 || mz < 14 || mx > W - 20 || mz > H - 14) continue;
        if (!insideB((mx - xf.ox) / xf.k, (mz - xf.oz) / xf.k)) continue;
        const A = at(Math.max(0, sMid - tw / 2)), Bp = at(Math.min(total, sMid + tw / 2));
        // skip sharply bent spots
        if (Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) < tw * 0.85) continue;
        if (placed.some((p) => Math.abs(p[0] - mx) < (p[2] + tw) / 2 + 6 && Math.abs(p[1] - mz) < 16)) continue;
        let ang = Math.atan2(Bp[1] - A[1], Bp[0] - A[0]);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        g.save(); g.translate(mx, mz); g.rotate(ang);
        g.lineWidth = 3; g.strokeStyle = 'rgba(10,13,20,.85)'; g.lineJoin = 'round'; g.strokeText(ch.name, 0, 0.5);
        g.fillStyle = ch.kind === 'motorway' || ch.kind === 'trunk' ? '#ffd9a0' : 'rgba(255,255,255,.92)'; g.fillText(ch.name, 0, 0.5);
        g.restore();
        placed.push([mx, mz, tw]); count++;
      }
    }
  }
  function bounds() { return ok() ? build().bounds : null; }
  function boundary() { return ok() ? build().ring : null; }
  function invalidate() { built = null; builtFor = null; cache.clear(); districtCache = null; }
  return { ok, draw, districts, drawStreetLabels, bounds, boundary, inside: insideB, invalidate, query, get pending() { return lastPending; } };
}
