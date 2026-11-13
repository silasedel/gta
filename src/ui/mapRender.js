// PORT SOLANA — tiled map renderer for the minimap, pause map and phone map.
// Renders city.mapLayers (+ city.roadGraph edges) into cached 512px tiles at several
// world scales so huge real-scale cities stay cheap to draw every frame.
// Works with any city exposing mapLayers; returns ok() === false otherwise.

const TILE_PX = 512;
const BASE_TILE_M = 250;          // level 0 tile size in metres (2.05 px/m)
const LEVELS = 7;                 // 250 m .. 16 km per tile
const MAX_TILES = 72;             // LRU cap (~1 MB each)
const CELL = 250;                 // spatial index cell (m)

export const MAP_COLORS = {
  water: '#0f4c63', waterDeep: '#0a3346', land: '#1e2633', beach: '#cdb482', park: '#24452f',
  building: '#3a4559', buildingTall: '#4a5672', buildingEdge: 'rgba(255,255,255,.08)',
  casing: '#0f141c', bridgeCasing: '#05080d',
};
// road style by OSM-ish kind: [fill colour, min width m, level cutoff (skip above this level)]
const ROAD_STYLE = {
  motorway: ['#ffb35a', 14, 9], trunk: ['#ffcf7a', 12, 9], primary: ['#e9eef7', 11, 6], secondary: ['#c9d2e2', 9, 5],
  tertiary: ['#aab6ca', 8, 4], residential: ['#8a97ad', 6, 3], unclassified: ['#8a97ad', 6, 3], living_street: ['#8a97ad', 5, 2],
  service: ['#6f7b90', 4, 1], pedestrian: ['#9a8f7a', 4, 2], footway: ['#7d7462', 2, 1], path: ['#7d7462', 2, 1], cycleway: ['#4f8a7a', 2, 1],
  default: ['#8f9cb2', 7, 4],
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
  let frameBudgetMs = 6, spentThisFrame = 0, frameId = -1;

  function city() { return game.city; }
  function ok() { const c = city(); return !!(c && c.mapLayers && (Array.isArray(c.mapLayers.land) || Array.isArray(c.mapLayers.roadEdges))); }

  // ---------- spatial index ----------
  function build() {
    const c = city();
    if (builtFor === c && built) return built;
    const L = c.mapLayers || {};
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
    const blds = Array.isArray(L.buildingPolys) ? L.buildingPolys : [];
    for (const p of blds) {
      const rings = ringsOf(p).filter((r) => Array.isArray(r) && r.length > 2); if (!rings.length) continue;
      add('building', { rings, h: +(p.h ?? p.height ?? 0) || 0 }, bboxOfRings(rings));
    }
    // roads: prefer graph edges (width/kind/bridge/name), else mapLayers.roadEdges, else legacy roads
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
    for (const e of edges) add('road', e, bboxOfRings([e.pts]));
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
            const add2 = fwd ? e.pts.slice(1) : e.pts.slice(0, -1).reverse();
            pts = pts.concat(add2);
          }
          pts.reverse();
        }
        const ch = { name, kind: e0.kind, pts };
        add('chain', ch, bboxOfRings([pts]));
      }
    }
    const bounds = c.bounds || (() => { const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }; for (const e of edges) for (const [x, z] of e.pts) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); } return b; })();
    const hasLand = Array.isArray(L.land) && L.land.length > 0;
    built = { big, grid, edges, bounds, hasLand };
    builtFor = c; cache.clear(); districtCache = null;
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
  function renderTile(level, tx, tz) {
    const S = tileSize(level), x0 = tx * S, z0 = tz * S, ppm = TILE_PX / S;
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE_PX;
    const g = cv.getContext('2d');
    g.fillStyle = MAP_COLORS.water; g.fillRect(0, 0, TILE_PX, TILE_PX);
    g.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm);
    const pad = 40;
    const recs = query(x0 - pad, z0 - pad, x0 + S + pad, z0 + S + pad);
    const by = { land: [], beach: [], park: [], water: [], building: [], road: [] };
    for (const r of recs) by[r.layer]?.push(r.item);
    const fillRings = (items, style) => {
      g.fillStyle = style; g.beginPath();
      for (const it of items) for (const ring of it.rings) { g.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); }
      g.fill('evenodd');
    };
    if (!build().hasLand) { g.fillStyle = MAP_COLORS.land; g.fillRect(x0, z0, S, S); }
    else if (by.land.length) fillRings(by.land, MAP_COLORS.land);
    if (by.park.length) fillRings(by.park, MAP_COLORS.park);
    if (by.beach.length) fillRings(by.beach, MAP_COLORS.beach);
    if (by.water.length) {
      fillRings(by.water, MAP_COLORS.water);
      // soft shoreline highlight
      g.strokeStyle = 'rgba(150,235,230,.28)'; g.lineWidth = 1.5 / ppm; g.beginPath();
      for (const it of by.water) for (const ring of it.rings) { g.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); }
      g.stroke();
    }
    // buildings (skip at coarse levels)
    if (level <= 1 && by.building.length) {
      const low = [], tall = [];
      for (const b of by.building) (b.h > 40 ? tall : low).push(b);
      g.save();
      if (level === 0) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 4; g.shadowOffsetX = 1.5; g.shadowOffsetY = 2; }
      fillRings(low, MAP_COLORS.building);
      fillRings(tall, MAP_COLORS.buildingTall);
      g.restore();
      if (level === 0) {
        g.strokeStyle = MAP_COLORS.buildingEdge; g.lineWidth = 1 / ppm; g.beginPath();
        for (const it of by.building) for (const ring of it.rings) { g.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); }
        g.stroke();
      }
    }
    // roads: casing pass then fill pass, by kind order; bridges last with their own casing
    const roads = by.road.filter((e) => (ROAD_STYLE[e.kind] || ROAD_STYLE.default)[2] >= level);
    roads.sort((a, b) => (a.bridge - b.bridge) || (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)));
    const minPx = level <= 1 ? 1.2 : level <= 3 ? 1.0 : 0.8;
    const widthOf = (e) => { const st = ROAD_STYLE[e.kind] || ROAD_STYLE.default; return Math.max(e.width || st[1], st[1] * 0.6, minPx / ppm); };
    const path = (e) => { g.beginPath(); g.moveTo(e.pts[0][0], e.pts[0][1]); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i][0], e.pts[i][1]); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const pass = (list, bridge) => {
      for (const e of list) { g.strokeStyle = bridge ? MAP_COLORS.bridgeCasing : MAP_COLORS.casing; g.lineWidth = widthOf(e) + Math.max(2.4, 3 / ppm) * (bridge ? 1.6 : 1); if (bridge) g.lineCap = 'butt'; path(e); g.stroke(); g.lineCap = 'round'; }
      const minorIdx = KIND_ORDER.indexOf('tertiary');
      for (const e of list) {
        g.globalAlpha = level >= 2 && KIND_ORDER.indexOf(e.kind) < minorIdx ? 0.55 : 1;
        g.strokeStyle = (ROAD_STYLE[e.kind] || ROAD_STYLE.default)[0]; g.lineWidth = widthOf(e); path(e); g.stroke();
      }
      g.globalAlpha = 1;
    };
    pass(roads.filter((e) => !e.bridge), false);
    const br = roads.filter((e) => e.bridge);
    if (br.length) { g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6; pass(br, true); g.restore(); }
    // centre dashes on big roads at fine levels
    if (level === 0) {
      g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,214,140,.5)'; g.lineWidth = 0.6;
      for (const e of roads) if (e.kind === 'primary' || e.kind === 'secondary' || e.kind === 'trunk' || e.kind === 'motorway' || e.kind === 'default') { path(e); g.stroke(); }
      g.setLineDash([]);
    }
    featherEdges(g, x0, z0, S, ppm);
    return cv;
  }
  // Soft, organic fade of all map content into open ocean where the source data ends (no hard rectangle).
  const FEATHER = 420;
  const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
  function featherEdges(g, x0, z0, S, ppm) {
    const B = build().bounds; if (!B || !isFinite(B.minX)) return;
    const ix0 = B.minX + FEATHER, ix1 = B.maxX - FEATHER, iz0 = B.minZ + FEATHER, iz1 = B.maxZ - FEATHER;
    if (x0 >= ix0 && x0 + S <= ix1 && z0 >= iz0 && z0 + S <= iz1) return;
    const W1 = MAP_COLORS.water, deep = MAP_COLORS.waterDeep;
    const sides = [
      ['x', B.minX, 1], ['x', B.maxX, -1], ['z', B.minZ, 1], ['z', B.maxZ, -1],
    ];
    g.save();
    for (const [ax, edge, inward] of sides) {
      const inner = edge + inward * FEATHER;
      // does this tile reach the band [edge - FEATHER*2*inward .. inner]?
      const lo = Math.min(edge - inward * 4000, inner), hi = Math.max(edge - inward * 4000, inner);
      const t0 = ax === 'x' ? x0 : z0, t1 = t0 + S;
      if (t1 < lo || t0 > hi) continue;
      const gr = ax === 'x' ? g.createLinearGradient(inner, 0, edge - inward * 60, 0) : g.createLinearGradient(0, inner, 0, edge - inward * 60);
      gr.addColorStop(0, 'rgba(15,76,99,0)'); gr.addColorStop(0.55, 'rgba(15,76,99,.55)'); gr.addColorStop(1, W1);
      g.fillStyle = gr;
      if (ax === 'x') { const a = Math.min(inner, edge - inward * 4000), b2 = Math.max(inner, edge - inward * 4000); g.fillRect(a, z0 - 1, b2 - a, S + 2); }
      else { const a = Math.min(inner, edge - inward * 4000), b2 = Math.max(inner, edge - inward * 4000); g.fillRect(x0 - 1, a, S + 2, b2 - a); }
      // organic blobs along the edge so the fade is not a straight line
      const step = 90;
      const along0 = (ax === 'x' ? z0 : x0) - 300, along1 = along0 + S + 600;
      for (let u = Math.floor(along0 / step) * step; u <= along1; u += step) {
        const h1 = hash(u, edge), h2 = hash(edge, u);
        const off = edge + inward * (40 + h1 * (FEATHER * 0.7)), rad = 110 + h2 * 210;
        const cx2 = ax === 'x' ? off : u + (h1 - 0.5) * 60, cz2 = ax === 'x' ? u + (h2 - 0.5) * 60 : off;
        const rg = g.createRadialGradient(cx2, cz2, 0, cx2, cz2, rad);
        rg.addColorStop(0, 'rgba(15,76,99,.55)'); rg.addColorStop(1, 'rgba(15,76,99,0)');
        g.fillStyle = rg; g.fillRect(cx2 - rad, cz2 - rad, rad * 2, rad * 2);
      }
    }
    // deepen far outside the data into a darker sea
    const far = 900;
    const outs = [[B.minX - far, 'x', -1], [B.maxX + far, 'x', 1], [B.minZ - far, 'z', -1], [B.maxZ + far, 'z', 1]];
    for (const [pos, ax, dir] of outs) {
      const a = pos - dir * 600;
      const gr = ax === 'x' ? g.createLinearGradient(a, 0, pos + dir * 600, 0) : g.createLinearGradient(0, a, 0, pos + dir * 600);
      gr.addColorStop(0, 'rgba(10,51,70,0)'); gr.addColorStop(1, deep);
      g.fillStyle = gr;
      if (ax === 'x') { const lo = dir < 0 ? x0 - 1 : a, hi = dir < 0 ? a : x0 + S + 1; if (hi > lo) g.fillRect(lo, z0 - 1, hi - lo, S + 2); }
      else { const lo = dir < 0 ? z0 - 1 : a, hi = dir < 0 ? a : z0 + S + 1; if (hi > lo) g.fillRect(x0 - 1, lo, S + 2, hi - lo); }
    }
    g.restore();
  }
  function getTile(level, tx, tz, allowRender) {
    const key = level + ':' + tx + ':' + tz;
    const hit = cache.get(key);
    if (hit) { hit.used = performance.now(); return hit.c; }
    if (!allowRender) return null;
    const fid = game.clock?.elapsed ?? performance.now();
    if (fid !== frameId) { frameId = fid; spentThisFrame = 0; }
    if (spentThisFrame > frameBudgetMs) return null;
    const t0 = performance.now();
    let c = null;
    try { c = renderTile(level, tx, tz); } catch (e) { console.warn('[hud map] tile failed', e); c = document.createElement('canvas'); c.width = c.height = 2; }
    spentThisFrame += performance.now() - t0;
    cache.set(key, { c, used: performance.now() });
    if (cache.size > MAX_TILES) {
      let oldK = null, oldT = Infinity;
      for (const [k, v] of cache) if (v.used < oldT && !k.startsWith(WARM_LEVEL + ':')) { oldT = v.used; oldK = k; }
      if (oldK) cache.delete(oldK);
    }
    return c;
  }
  // ppmDevice: device pixels per metre required. Draws into a ctx already transformed to world units.
  let lastPending = 0;
  function draw(g, x0, z0, x1, z1, ppmDevice, opts = {}) {
    if (!ok()) return false;
    build();
    if (opts.budget) frameBudgetMs = opts.budget;
    lastPending = 0;
    let level = 0;
    const q = opts.quality ?? 0.9;
    while (level < LEVELS - 1 && TILE_PX / tileSize(level + 1) >= ppmDevice * q) level++;
    const S = tileSize(level);
    const tx0 = Math.floor(x0 / S), tz0 = Math.floor(z0 / S), tx1 = Math.floor(x1 / S), tz1 = Math.floor(z1 / S);
    if ((tx1 - tx0 + 1) * (tz1 - tz0 + 1) > 64) return false;
    const seam = 1.25 / Math.max(1e-4, ppmDevice);
    g.imageSmoothingEnabled = true;
    for (let tx = tx0; tx <= tx1; tx++) for (let tz = tz0; tz <= tz1; tz++) {
      let c = getTile(level, tx, tz, opts.render !== false);
      if (c) { g.drawImage(c, tx * S, tz * S, S + seam, S + seam); continue; }
      lastPending++;
      // fallback: a coarser cached tile covering this area
      for (let l = level + 1; l < LEVELS; l++) {
        if (l > WARM_LEVEL && level < WARM_LEVEL) break;
        const S2 = tileSize(l), ux = Math.floor((tx * S) / S2), uz = Math.floor((tz * S) / S2);
        const c2 = getTile(l, ux, uz, false);
        if (c2) {
          const sx = ((tx * S - ux * S2) / S2) * TILE_PX, sz = ((tz * S - uz * S2) / S2) * TILE_PX, sw = (S / S2) * TILE_PX;
          g.drawImage(c2, sx, sz, sw, sw, tx * S, tz * S, S + seam, S + seam);
          break;
        }
      }
    }
    // warm a coarse level covering the whole map so fallbacks never show blank squares
    if (spentThisFrame < frameBudgetMs) warmCoarse();
    frameBudgetMs = 6;
    return true;
  }
  const WARM_LEVEL = 4;
  function warmCoarse() {
    const B = build().bounds; if (!B || !isFinite(B.minX)) return;
    const S = tileSize(WARM_LEVEL);
    for (let tx = Math.floor((B.minX - 1000) / S); tx <= Math.floor((B.maxX + 1000) / S); tx++)
      for (let tz = Math.floor((B.minZ - 1000) / S); tz <= Math.floor((B.maxZ + 1000) / S); tz++) {
        if (cache.has(WARM_LEVEL + ':' + tx + ':' + tz)) continue;
        getTile(WARM_LEVEL, tx, tz, true); return;
      }
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
      if (!n || (typeof c.isWater === 'function' && c.isWater(x, z))) continue;
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
    const cands = recs.map((r) => r.item).filter((e) => KIND_ORDER.indexOf(e.kind) >= minKind);
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
  function invalidate() { built = null; builtFor = null; cache.clear(); districtCache = null; }
  return { ok, draw, districts, drawStreetLabels, bounds, invalidate, query, get pending() { return lastPending; } };
}
