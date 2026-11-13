// headless benchmark of the DATA path (data.js + adapter + builders + streamer); CITY dev tool
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as THREE from 'three'; import RAPIER from '@dimforge/rapier3d-compat';
const here = path.dirname(fileURLToPath(import.meta.url)), projRoot = path.resolve(here, '../../..');
const rd = (u) => { for (const p of [path.join(projRoot, 'public', u), path.join(projRoot, u)]) if (fs.existsSync(p)) return fs.readFileSync(p); throw new Error('404 ' + u); };
globalThis.fetch = async (u) => { const b = rd(u); return { ok: true, json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })), set: (o, k, v) => ((o[k] = v), true) }) }) };
await RAPIER.init();
const { loadMiamiData } = await import('./data.js');
const { createDataProvider } = await import('./dataProvider.js');
const { createTileBuilder } = await import(process.argv[2] === 'live' ? './tilebuild.js' : './.tilebuild_next.js');

const t0 = performance.now(); const data = await loadMiamiData(null); const provider = createDataProvider(data);
console.log('data load ms', (performance.now() - t0) | 0, 'tiles', data.tileKeys.length, 'edges', data.roadGraph.edges.length);
const M = new Proxy({}, { get: (o, k) => (o[k] ??= (k.toString().includes('Depth') ? new THREE.MeshDepthMaterial() : new THREE.MeshStandardMaterial())) });
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const nodeIdx = new Map(); for (const n of provider.nodes) nodeIdx.set(Math.round(n.x * 2) + ',' + Math.round(n.z * 2), { degree: n.deg, width: Math.max(0, ...n.edges.map((e) => e.width)) });
const _ne = {};
let elevated = null; if (!process.env.NOELEV) { try { const { createElevated } = await import('./elevated.js'); elevated = createElevated({ THREE, RAPIER, world, data, materials: M }); } catch (e) { console.log('no elevated', String(e).slice(0, 120)); } }
const b = createTileBuilder({ districtAt: data.districtAt, roadKindAt: (x, z) => data.roadGraph.nearestEdge(x, z, {}, 14)?.edge?.kind, elevated, auditTags: true, M, provider, root: new THREE.Group(), world, RAPIER, zoneAt: data.zoneAt, nodeAt: (p) => nodeIdx.get(Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2)) || null,
  onSidewalk: (x, z) => Math.abs(data.groundHeightAt(x, z) - 0.15) < 0.02, groundAt: (x, z) => Math.max(0, data.groundHeightAt(x, z)),
  isWater: (x, z) => data.isWater(x, z), roadDist: (x, z) => { const r = data.roadGraph.nearestEdge(x, z, {}, 40); return r ? r.dist - r.edge.width / 2 : 99; },
  roadDirAt: (x, z) => { const r = data.roadGraph.nearestEdge(x, z, _ne, 60); return r ? Math.atan2(r.point.x - x, r.point.z - z) : 0; } });
const T = provider.tileSize;
const centres = { spawnOceanDr: [3431, -111], oceanDrN: [3400, 60], collins: [3370, -350], fifthAlton: [2420, 300], fifthRamp: [2400, 500], macarthur: [2000, 520], downtown: [-2600, -650], brickell: [-2900, 1200] };
const tiles = new Map();
for (const [cx, cz] of Object.values(centres)) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const tx = Math.floor(cx / T) + i, tz = Math.floor(cz / T) + j; tiles.set(tx + ',' + tz, [tx, tz]); }
const run = (g) => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const tileObjs = [];
for (const [tx, tz] of tiles.values()) {
  const t = { tx, tz, k: tx + ',' + tz, x0: tx * T, z0: tz * T, cx: (tx + 0.5) * T, cz: (tz + 0.5) * T };
  const g = run(b.buildNear(t)); run(b.buildColliders(t)); tileObjs.push(t);
}
world.step();
console.log('tiles', tiles.size, 'colliders', world.colliders.len());
const tagOf = (c) => b.colTags.get(c.handle) || (c.shape.type === 1 ? 'cuboid' : '?');
const stats = { car: {}, walkLine: {}, walk: {}, cross: {}, open: {} }, ex = {};
const hit = (kind, x, y, z, shape, rot) => {
  const seen = new Set();
  world.intersectionsWithShape({ x, y, z }, rot, shape, (c) => { const tg = tagOf(c); if (!seen.has(tg)) { seen.add(tg); stats[kind][tg] = (stats[kind][tg] || 0) + 1; const key = kind + ':' + tg; (ex[key] ||= []).length < 40 && ex[key].push([+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)]); } return true; });
};
const qY = (a) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }), Q0 = { x: 0, y: 0, z: 0, w: 1 };
const carBox = new RAPIER.Cuboid(1.0, 0.5, 2.25), person = new RAPIER.Capsule(0.55, 0.3);
let nWL = 0, nCar = 0, nWalk = 0, nCross = 0, nOpen = 0;
const DRIVE = /motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|_link|road/;
for (const t of tileObjs) {
  const tile = data.getTile(t.tx, t.tz); if (!tile) continue;
  for (const r of tile.roads) {
    if (r.pts.length < 2 || !DRIVE.test(r.kind) || /footway|path|pedestrian|cycleway|steps/.test(r.kind)) continue;
    const pr = b.roadProfile(r, tile), P = pr.pts, ys = pr.ys, total = Math.max(1, (r.lanesFwd || 1) + (r.lanesBack || 0)), lw = r.width / total;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], c = P[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.01) continue; const dx = (c[0] - a[0]) / L, dz = (c[1] - a[1]) / L, nx = -dz, nz = dx, rot = qY(Math.atan2(dx, dz));
      for (let s = 0; s < L; s += 2) for (let k = 0; k < total; k++) {
        const o = -r.width / 2 + lw * (k + 0.5), x = a[0] + dx * s + nx * o, z = a[1] + dz * s + nz * o, y = (ys ? ys[i] + (ys[i + 1] - ys[i]) * (s / L) : 0) + 0.05 + 0.35 + 0.5;
        if (x < t.x0 || x >= t.x0 + T || z < t.z0 || z >= t.z0 + T) continue;
        nCar++; hit('car', x, y, z, carBox, rot);
      }
    }
  }
  for (const p of tile.paths || []) { if (p.bridge || !/sidewalk|footway|pedestrian|path|crossing/.test(p.kind || '')) continue; const P = p.pts;
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], c = P[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (let s2 = 0; s2 < L; s2 += 2) { const x = a[0] + (c[0] - a[0]) * s2 / L, z = a[1] + (c[1] - a[1]) * s2 / L; if (x < t.x0 || x >= t.x0 + T || z < t.z0 || z >= t.z0 + T || data.isWater(x, z)) continue; const y = Math.max(0, data.groundHeightAt(x, z, 1)); nWL++; hit('walkLine', x, y + 0.45 + 0.85, z, person, Q0); } } }
  for (const rings of b.sidewalksOf(tile)) { const r0 = rings[0]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of r0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const inP = (x, z) => { let c = false; for (let i = 0, j = r0.length - 1; i < r0.length; j = i++) { const [xi, zi] = r0[i], [xj, zj] = r0[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    for (let x = x0 + 0.6; x < x1; x += 2.5) for (let z = z0 + 0.6; z < z1; z += 2.5) if (inP(x, z)) { nWalk++; hit('walk', x, 0.15 + 0.45 + 0.85, z, person, Q0); } }
  for (const n of tile.nodes || []) { if (n.degree < 3 || b.nodeLevel(tile, n).kind !== 'ground') continue;
    for (const [dx, dz, w] of n.dirs) { const rx = -dz, rz = dx, d0 = n.width / 2 + 2.1; for (let o = -w / 2 - 3; o <= w / 2 + 3; o += 1) { const x = n.x + dx * d0 + rx * o, z = n.z + dz * d0 + rz * o; nCross++; hit('cross', x, 0.45 + 0.85, z, person, Q0); } } }
  for (const a of tile.areas || []) { if (!/park|grass|paved|beach|sand/.test(a.kind)) continue; const r0 = a.rings[0]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of r0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let x = x0 + 1; x < x1; x += 5) for (let z = z0 + 1; z < z1; z += 5) { if (data.isWater(x, z)) continue; const y = data.groundHeightAt(x, z); if (y > 0.2) continue; nOpen++; hit('open', x, Math.max(0, y) + 0.45 + 0.85, z, person, Q0); } }
}
const sortO = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
console.log('samples walkLine', nWL, 'car', nCar, 'walk', nWalk, 'cross', nCross, 'open', nOpen);
for (const k of Object.keys(stats)) console.log(k, JSON.stringify(sortO(stats[k])));
if (process.argv[3] === 'ex') console.log(JSON.stringify(ex));
