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


const T = provider.tileSize; const run = (g) => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const tileList = data.tileKeys.map((k) => String(k).split(/[,_:]/).map(Number));
const D = {}; const d = (n) => (D[n] ||= { km: 0, props: 0, shops: 0, trees: 0, lamps: 0, furn: 0, cars: 0, tiles: 0 });
const KINDS = ['palm', 'lamp', 'bin', 'bench', 'hydrant', 'shelter', 'kiosk', 'bike', 'cafe', 'umbrella', 'signPost', 'mast', 'grate', 'litter', 'hut'];
for (const [tx, tz] of tileList) {
  const t = { tx, tz, k: tx + ',' + tz, x0: tx * T, z0: tz * T, cx: (tx + 0.5) * T, cz: (tz + 0.5) * T };
  const tile = provider.getTile(tx, tz); if (!tile) continue;
  const g = run(b.buildNear(t)); const P = t.props || {};
  const cnt = (x, z) => d(data.districtAt(x, z) || 'none');
  for (const r of tile.roads) { if (!/motorway|trunk|primary|secondary|tertiary|residential|unclassified|living/.test(r.kind)) continue; let L = 0; for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); const m = r.pts[r.pts.length >> 1]; cnt(m[0], m[1]).km += L / 1000; }
  for (const k of KINDS) for (const p of P[k] || []) { const e = cnt(p.x, p.z); e.props++; if (k === 'palm' || k === 'blob') e.trees++; else if (k === 'lamp') e.lamps++; else e.furn++; }
  for (const p of P.parked || []) cnt(p.x, p.z).cars++;
  for (const b0 of tile.buildings) for (const sf of b0.storefronts || []) cnt(sf.x ?? b0.cx, sf.z ?? b0.cz).shops++;
  cnt(t.cx, t.cz).tiles++;
  b.dispose(g);
}
const rows = Object.entries(D).filter(([, v]) => v.km > 1).map(([n, v]) => [n, +v.km.toFixed(1), +(v.props / v.km).toFixed(0), +(v.shops / v.km).toFixed(1), +(v.trees / v.km).toFixed(0), +(v.lamps / v.km).toFixed(0), +(v.furn / v.km).toFixed(0)]).sort((a, b) => b[1] - a[1]);
console.log('district | street km | props/km | shops/km | trees/km | lamps/km | furniture/km');
for (const r of rows) console.log(r.join(' | '));
fs.writeFileSync(path.join(here, '.districts_' + (process.argv[2] || 'next') + '.json'), JSON.stringify(rows));
