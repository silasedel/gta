// Runtime audit of a published (or staged) world build, through the same loader the game uses.
// node tools/osm/audit.mjs [--root public/assets/miami] [--data src/world/miami/data.js] [--out docs/v2/reports/world-osm-audit.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.join(GAME, 'public/assets/miami')));
let DATA = path.resolve(arg('data', path.join(GAME, 'src/world/miami/data.js')));
const OUT = arg('out', null);
if (!DATA.endsWith('.js') && !DATA.endsWith('.mjs')) { // a .tmp candidate: copy next to the project so 'three' resolves
  const c = path.join(HERE, 'cache/v2/work/data_candidate.mjs'); fs.mkdirSync(path.dirname(c), { recursive: true }); fs.copyFileSync(DATA, c); DATA = c;
}
let fetched = 0, fetchedBytes = 0;
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/assets\/miami\//, '');
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => { throw new Error('404 ' + url); }, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = fs.readFileSync(f); fetched++; fetchedBytes += buf.length;
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const { loadMiamiData } = await import(pathToFileURL(DATA).href);
const mem0 = process.memoryUsage();
const t0 = performance.now();
const data = await loadMiamiData(null);
const bootMs = performance.now() - t0;
const mem1 = process.memoryUsage();
const R = { build: data.build, root: ROOT, checks: {}, fail: [] };
const ok = (name, pass, info) => { R.checks[name] = { pass: !!pass, ...info }; if (!pass) R.fail.push(name); console.log((pass ? 'PASS ' : 'FAIL ') + name, JSON.stringify(info)); };
const man = data.manifest, rg = data.roadGraph, B = data.bounds;
console.log('build', data.build, 'bounds', B, 'boot', Math.round(bootMs), 'ms', data.timings, 'files', fetched, (fetchedBytes / 1e6).toFixed(1) + ' MB');
R.boot = { ms: Math.round(bootMs), timings: data.timings, files: fetched, MB: +(fetchedBytes / 1e6).toFixed(2), heapMB: +((mem1.heapUsed - mem0.heapUsed) / 1e6).toFixed(1), arrayBuffersMB: +((mem1.arrayBuffers - mem0.arrayBuffers) / 1e6).toFixed(1) };

// ------------------------------------------------------------------ road graph
{
  const E = rg.edges, N = rg.nodes;
  let degenerate = 0, nan = 0, dupPts = 0, endMismatch = 0, yLen = 0, zeroLanes = 0;
  const sig = new Map(); let dupEdges = 0;
  for (const e of E) {
    if (!(e.length > 0.5)) degenerate++;
    for (let i = 0; i < e.pf.length; i++) if (!Number.isFinite(e.pf[i])) nan++;
    for (let i = 1; i < e.pts.length; i++) if (e.pts[i][0] === e.pts[i - 1][0] && e.pts[i][1] === e.pts[i - 1][1]) dupPts++;
    const a = N[e.a], b = N[e.b], p0 = e.pts[0], p1 = e.pts[e.pts.length - 1];
    if (Math.hypot(a.x - p0[0], a.z - p0[1]) > 0.11 || Math.hypot(b.x - p1[0], b.z - p1[1]) > 0.11) endMismatch++;
    if (e.y.length !== e.pts.length) yLen++;
    if (e.lanesFwd + e.lanesBack < 1 || !(e.width > 1)) zeroLanes++;
    const mid = e.pts[(e.pts.length / 2) | 0];
    const k = Math.min(e.a, e.b) + '|' + Math.max(e.a, e.b) + '|' + e.pts.length + '|' + Math.round(e.length * 10) + '|' + Math.round(mid[0] * 10) + '|' + Math.round(mid[1] * 10) + '|' + (e.oneway ? e.a : '');
    if (sig.has(k)) dupEdges++; else sig.set(k, e.id);
  }
  ok('roads.geometry', !degenerate && !nan && !dupPts && !endMismatch && !yLen && !zeroLanes && !dupEdges, { edges: E.length, nodes: N.length, degenerate, nan, duplicateVertices: dupPts, duplicateEdges: dupEdges, endMismatch, yLengthMismatch: yLen, badLanes: zeroLanes });
  // connectivity (undirected)
  const par = new Int32Array(N.length).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (const e of E) { const a = find(e.a), b = find(e.b); if (a !== b) par[a] = b; }
  const len = new Map(); let total = 0;
  for (const e of E) { const r = find(e.a); len.set(r, (len.get(r) || 0) + e.length); total += e.length; }
  const comps = [...len.values()].sort((a, b) => b - a);
  const others = [...len.entries()].sort((a, b) => b[1] - a[1]).slice(1).map(([r, L]) => { const e = E.find((q) => find(q.a) === r); return { km: +(L / 1000).toFixed(2), at: [Math.round(e.pts[0][0]), Math.round(e.pts[0][1])], name: e.name, district: data.districtAt(e.pts[0][0], e.pts[0][1]) }; });
  R.roadComponents = others;
  // islands without a road link in reality (ferry only) are separate by design
  const unexplained = others.filter((o) => !/Fisher Island/.test(o.district || ''));
  ok('roads.connected', unexplained.length === 0, { components: comps.length, mainKm: +(comps[0] / 1000).toFixed(1), totalKm: +(total / 1000).toFixed(1), mainShare: +(comps[0] / total).toFixed(4), otherComponents: others.slice(0, 12), unexplained: unexplained.length });
  // directed: share of edges in the main strongly connected component
  const main = E.filter((e) => e.mainNetwork).reduce((s, e) => s + e.length, 0);
  R.mainNetworkShare = +(main / total).toFixed(4);
  // heights continuous: edges meeting at a node agree, and no step between consecutive vertices
  let nodeStep = 0, maxNodeStep = 0, steep = 0, maxGrade = 0, worst = null;
  const ny = new Map();
  for (const e of E) for (const [n, y] of [[e.a, e.y[0]], [e.b, e.y[e.y.length - 1]]]) { if (!ny.has(n)) ny.set(n, [y, y]); else { const m = ny.get(n); m[0] = Math.min(m[0], y); m[1] = Math.max(m[1], y); } }
  for (const [n, [lo, hi]] of ny) { if (hi - lo > 0.06) { nodeStep++; if (hi - lo > maxNodeStep) { maxNodeStep = hi - lo; worst = [Math.round(N[n].x), Math.round(N[n].z)]; } } }
  for (const e of E) for (let i = 1; i < e.pts.length; i++) { const d = e.cum[i] - e.cum[i - 1]; if (d < 0.5) continue; const g = Math.abs(e.y[i] - e.y[i - 1]) / d; if (g > maxGrade) maxGrade = g; if (g > 0.125) steep++; }
  ok('roads.heightsContinuous', nodeStep === 0 && steep === 0, { nodesWithStep: nodeStep, maxNodeStepM: +maxNodeStep.toFixed(2), worstNode: worst, segmentsOver12_5pct: steep, maxGradePct: +(maxGrade * 100).toFixed(1) });
  // turn restrictions and controls point at real adjacency
  let badTurn = 0;
  for (const [a, n, b] of [...rg.turns.no, ...rg.turns.only]) { const ea = E[a], eb = E[b]; if (!ea || !eb || (ea.a !== n && ea.b !== n) || (eb.a !== n && eb.b !== n)) badTurn++; }
  const ctl = { signal: 0, stop: 0, yield: 0 };
  for (const e of E) for (const c of [e.controlA, e.controlB]) if (c) ctl[c]++;
  const named = E.filter((e) => e.name).length, withRef = E.filter((e) => e.ref).length, posted = E.filter((e) => e.speedPosted).length, oneway = E.filter((e) => e.oneway).length;
  ok('roads.rules', badTurn === 0 && rg.turns.no.length + rg.turns.only.length > 0, { turnNo: rg.turns.no.length, turnOnly: rg.turns.only.length, turnVia: rg.turns.via.length, badTurn, signalNodes: N.filter((n) => n.signal).length, approaches: ctl, named, withRef, postedSpeed: posted, oneway, refs: rg.refs.slice(0, 30) });
}

// ------------------------------------------------------------------ storefronts
{
  const S = data.storefronts; let noKind = 0, noStreet = 0, noFacing = 0, typed = 0, facingWrong = 0;
  const kinds = {};
  const out = {};
  for (const s of S) {
    if (!s.kind) noKind++;
    if (!s.street) noStreet++;
    if (!Number.isFinite(s.facing)) noFacing++;
    if (s.poi) typed++;
    kinds[s.kind] = (kinds[s.kind] || 0) + 1;
    // the door must face open ground, and a road must lie on that side within 80 m
    const dx = Math.sin(s.facing), dz = Math.cos(s.facing);
    const r = rg.nearestEdge(s.fx + dx * 3, s.fz + dz * 3, out, 90);
    if (!r) { facingWrong++; continue; }
    const vx = r.point.x - s.fx, vz = r.point.z - s.fz, d = Math.hypot(vx, vz) || 1;
    if ((vx * dx + vz * dz) / d < 0.15 && data.streetNameAt(s.fx + dx * 8, s.fz + dz * 8, 30) !== s.street) facingWrong++; // a named promenade in front also counts
  }
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]);
  ok('storefronts.typedAndFacing', noKind === 0 && noFacing === 0 && noStreet === 0 && facingWrong / S.length < 0.01, { count: S.length, typedFromOSM: typed, noKind, noStreet, noFacing, notFacingARoad: facingWrong, kinds: top.length, top: Object.fromEntries(top.slice(0, 40)) });
  R.storefrontKinds = Object.fromEntries(top);
}

// ------------------------------------------------------------------ tiles: load everything, check coverage and duplicates
{
  const t1 = performance.now();
  await Promise.all(man.regions.map((k) => data.loadRegion(k)));
  const allMs = performance.now() - t1;
  const st = data.regionStats;
  const sorted = [...st.parseMs].sort((a, b) => a - b);
  R.regions = { count: man.regions.length, loadAllMs: Math.round(allMs), parseMsMedian: +sorted[(sorted.length / 2) | 0].toFixed(2), parseMsP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), parseMsMax: +st.maxParseMs.toFixed(2), bytesMB: +(st.bytes / 1e6).toFixed(2), largestKB: Math.round(Math.max(...Object.values(man.regionBytes)) / 1e3) };
  const TS = data.tileSize;
  const pip = (rings, x, z) => { let inside = false; for (const r of rings) { for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside; } } return inside; };
  let landPts = 0, noTile = 0, notCovered = 0, waterPts = 0, waterCovered = 0, undef = 0; const holes = [];
  const STEP = 40;
  for (let z = B.minZ + STEP / 2; z < B.maxZ; z += STEP) for (let x = B.minX + STEP / 2; x < B.maxX; x += STEP) {
    const tx = Math.floor(x / TS), tz = Math.floor(z / TS);
    const t = data.getTile(tx, tz);
    if (t === undefined) { undef++; continue; }
    // stay 3 m clear of the raster's coast so a 2 m cell edge is not counted as a hole
    const w = data.isWater(x, z), near = data.isWater(x + 3, z) !== w || data.isWater(x - 3, z) !== w || data.isWater(x, z + 3) !== w || data.isWater(x, z - 3) !== w;
    if (near) continue;
    const sf = data.surfaceAt(x, z); if (!w && (sf === 'wood' || sf === 'gravel')) continue; // piers and breakwaters stand over water, not on land polygons
    const covered = !!t && t.areas.some((a) => a.kind === 'land' && pip(a.rings, x, z));
    if (!w) { landPts++; if (!t) { noTile++; if (holes.length < 8) holes.push([x, z]); } else if (!covered) { notCovered++; if (holes.length < 8) holes.push([x, z]); } } else { waterPts++; if (covered) waterCovered++; }
  }
  ok('tiles.coverage', noTile === 0 && undef === 0 && notCovered / Math.max(1, landPts) < 0.0005 && waterCovered / Math.max(1, waterPts) < 0.0005, { tiles: man.tiles.length, regions: man.regions.length, landSamples: landPts, landWithoutTile: noTile, landNotCoveredByLandPolygon: notCovered, waterSamples: waterPts, waterCoveredByLandPolygon: waterCovered, notLoaded: undef, examples: holes });
  // every tile key resolves, no building appears twice, footprints are valid
  let missing = 0, bCount = 0, dupB = 0, badRing = 0, tinyB = 0, noStyle = 0, sfMissingBuilding = 0;
  const seenB = new Set(), seenGeom = new Set(), bIds = new Set();
  const uses = {}, attrs = { use: 0, address: 0, colour: 0, roofShape: 0, material: 0, levels: 0, year: 0, tier: 0, tenants: 0, osm: 0 };
  const lc = {}; let rails = 0, sites = 0, barriers = 0, props = 0; const propTypes = {};
  for (const key of man.tiles) {
    const [i, j] = key.split('_').map(Number); const t = data.getTile(i, j);
    if (!t) { missing++; continue; }
    for (const b of t.buildings) {
      bCount++; bIds.add(b.id);
      if (seenB.has(b.id)) dupB++; seenB.add(b.id);
      const g = Math.round(b.cx * 5) + '|' + Math.round(b.cz * 5) + '|' + Math.round(b.area) + '|' + b.minH + '|' + b.h;
      if (seenGeom.has(g)) { dupB++; console.log('duplicate building', b.id, g, b.kind, b.part); } seenGeom.add(g);
      if (b.rings[0].length < 3 || !(b.area > 0)) badRing++;
      if (b.area < 4) tinyB++;
      if (!b.style) noStyle++;
      if (b.use) { attrs.use++; uses[b.use] = (uses[b.use] || 0) + 1; }
      if (b.address) attrs.address++; if (b.colour) attrs.colour++; if (b.roof && b.roof !== 'flat') attrs.roofShape++; if (b.material) attrs.material++;
      if (b.levels) attrs.levels++; if (b.year) attrs.year++; if (b.tier) attrs.tier++; if (b.tenants) attrs.tenants++; if (b.osm) attrs.osm++;
    }
    for (const a of t.areas) if (a.cls) lc[a.cls] = (lc[a.cls] || 0) + 1;
    rails += t.rails.length; sites += t.sites.length; barriers += t.barriers.length;
    for (const p of t.props) { props++; propTypes[p.type] = (propTypes[p.type] || 0) + 1; }
    props += t.trees.length + t.signals.length + t.lamps.length + t.busStops.length + t.crossings.length + t.stops.length;
  }
  for (const s of data.storefronts) if (!bIds.has(s.buildingId)) sfMissingBuilding++;
  ok('tiles.buildings', missing === 0 && dupB === 0 && badRing === 0 && noStyle === 0 && sfMissingBuilding === 0, { tilesMissing: missing, buildings: bCount, duplicates: dupB, badRings: badRing, under4m2: tinyB, noStyle, storefrontsWithoutBuilding: sfMissingBuilding, attrs });
  R.buildingUses = Object.fromEntries(Object.entries(uses).sort((a, b) => b[1] - a[1]));
  R.landcoverClasses = lc; R.tileExtras = { railPieces: rails, sitePolygons: sites, barrierLines: barriers, props, otherPropTypes: propTypes };
  const need = ['fuel', 'hotel', 'school', 'worship', 'parking_garage', 'office', 'hospital', 'police', 'fire_station', 'supermarket', 'car_dealer', 'laundromat', 'gym', 'marina'];
  const have = (u) => (uses[u] || 0) + data.sites.filter((s) => s.use === u).length + data.storefronts.filter((s) => ({ laundromat: 'laundry', gym: 'gym', car_dealer: 'car', office: 'office', marina: 'marina' }[u] === s.kind)).length;
  const lu = Object.fromEntries(need.map((u) => [u, have(u)]));
  lu.park = (data.mapLayers.park || []).length;
  ok('landuse.realTypesPresent', need.every((u) => lu[u] > 0) && lu.park > 0, lu);
}

// ------------------------------------------------------------------ height field
{
  let maxStep = 0, at = null, n = 0, deckMismatch = 0, deckN = 0;
  if (data.hasRelief) {
    const hf = data.heightField;
    for (let j = 0; j < hf.nz; j++) for (let i = 0; i < hf.nx; i++) {
      const v = hf.data[j * hf.nx + i]; if (!v) continue; n++;
      for (const [di, dj] of [[1, 0], [0, 1]]) { if (i + di >= hf.nx || j + dj >= hf.nz) continue; const d = Math.abs(hf.data[(j + dj) * hf.nx + i + di] - v) * hf.unit; if (d > maxStep) { maxStep = d; at = [hf.minX + i * hf.cell, hf.minZ + j * hf.cell]; } }
    }
  }
  // road surface vs ground query on terrain-following roads
  const out = {};
  for (const e of rg.edges) { if (!e.terrain) continue; for (let i = 0; i < e.pts.length; i += 3) { deckN++; const g = data.terrainHeightAt(e.pts[i][0], e.pts[i][1]); if (Math.abs(g - e.y[i]) > 0.35) deckMismatch++; } }
  // ground continuity on land: no step over 0.8 m between points 2 m apart, away from water and decks
  let gN = 0, gStep = 0;
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 200000; k++) {
    const x = B.minX + rnd() * (B.maxX - B.minX), z = B.minZ + rnd() * (B.maxZ - B.minZ);
    if (data.isWater(x, z) || data.isWater(x + 2, z)) continue;
    const a = data.groundHeightAt(x, z, -50), b = data.groundHeightAt(x + 2, z, -50); gN++;
    if (Math.abs(a - b) > 0.8) gStep++;
  }
  ok('heights.continuous', maxStep <= 20 && deckMismatch === 0 && gStep === 0, { relief: data.hasRelief, nonZeroSamples: n, maxStepBetween16mSamplesM: +maxStep.toFixed(2), at, terrainRoadSamples: deckN, roadVsTerrainMismatch: deckMismatch, groundPairs: gN, groundStepsOver0_8m: gStep, inRealMiamiHeight: data.terrainHeightAt(0, 0) });
}

// ------------------------------------------------------------------ transit
{
  const T = data.transit, E = rg.edges; let broken = 0, badStop = 0, empty = 0;
  for (const r of T.routes) {
    if (!r.edges.length) empty++;
    for (let i = 1; i < r.edges.length; i++) {
      const [e0, d0] = r.edges[i - 1], [e1, d1] = r.edges[i];
      const end0 = d0 > 0 ? E[e0].b : E[e0].a, start1 = d1 > 0 ? E[e1].a : E[e1].b;
      if (end0 !== start1 && e0 !== e1) broken++;
    }
  }
  for (const s of T.stops) if (!E[s.edge] || !(s.s >= 0) || !s.name) badStop++;
  const lines = {}; for (const l of T.lines) lines[l.kind] = (lines[l.kind] || 0) + 1;
  const mover = T.lines.filter((l) => l.kind === 'people_mover');
  ok('transit', badStop === 0 && T.stops.length > 0 && T.routes.length > 0 && mover.length > 0 && T.stations.filter((s) => s.kind === 'people_mover').length > 5, { stops: T.stops.length, routes: T.routes.length, emptyRoutes: empty, discontinuities: broken, badStops: badStop, lines, peopleMover: mover.map((l) => ({ name: l.name, m: l.length, stations: l.stations.length, maxY: +Math.max(...l.y).toFixed(1) })), stations: T.stations.length, moverStations: T.stations.filter((s) => s.kind === 'people_mover').map((s) => s.name) });
}

// ------------------------------------------------------------------ query speed
{
  const N = 400000; let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const xs = new Float64Array(N), zs = new Float64Array(N);
  for (let i = 0; i < N; i++) { xs[i] = B.minX + rnd() * (B.maxX - B.minX); zs[i] = B.minZ + rnd() * (B.maxZ - B.minZ); }
  const time = (fn) => { const t = performance.now(); let s = 0; for (let i = 0; i < N; i++) s += fn(xs[i], zs[i]) ? 1 : 0; return +((performance.now() - t) / N * 1e6).toFixed(0); };
  const coherent = (fn) => { const t = performance.now(); let s = 0; for (let i = 0; i < N; i++) s += fn(xs[i & 1023] + (i % 50) * 0.5, zs[i & 1023]) ? 1 : 0; return +((performance.now() - t) / N * 1e6).toFixed(0); };
  R.queryNs = { isWaterRandom: time(data.isWater), isWaterCoherent: coherent(data.isWater), groundHeightRandom: time((x, z) => data.groundHeightAt(x, z)), zoneAt: time(data.zoneAt), districtAt: time(data.districtAt), surfaceAt: time((x, z) => data.surfaceAt(x, z)), terrainHeightAt: time(data.terrainHeightAt) };
  const out = {}; const t = performance.now(); for (let i = 0; i < 50000; i++) rg.nearestEdge(xs[i], zs[i], out, 300); R.queryNs.nearestEdge = +((performance.now() - t) / 50000 * 1e6).toFixed(0);
  R.gridMemory = Object.fromEntries(Object.entries(data.grids).map(([k, g]) => [k, g.bytes ? { runs: g.runs, MB: +(g.bytes / 1e6).toFixed(2) } : { MB: +((g.data.byteLength) / 1e6).toFixed(2) }]));
  console.log('query ns', JSON.stringify(R.queryNs), 'grid memory', JSON.stringify(R.gridMemory));
}
R.stats = man.stats; R.districts = man.districts; R.places = data.places.length; R.setpieces = data.setpieces.map((s) => s.id);
console.log('regions', JSON.stringify(R.regions));
console.log(R.fail.length ? 'FAILED: ' + R.fail.join(', ') : 'ALL CHECKS PASSED');
if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(path.resolve(OUT), JSON.stringify(R, null, 1)); console.log('wrote', OUT); }
process.exit(R.fail.length ? 1 : 0);
