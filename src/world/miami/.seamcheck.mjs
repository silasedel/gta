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
const b = createTileBuilder({ auditTags: true, M, provider, root: new THREE.Group(), world, RAPIER, zoneAt: data.zoneAt, nodeAt: (p) => nodeIdx.get(Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2)) || null,
  onSidewalk: (x, z) => Math.abs(data.groundHeightAt(x, z) - 0.15) < 0.02, groundAt: (x, z) => Math.max(0, data.groundHeightAt(x, z)),
  isWater: (x, z) => data.isWater(x, z), roadDist: (x, z) => { const r = data.roadGraph.nearestEdge(x, z, {}, 40); return r ? r.dist - r.edge.width / 2 : 99; },
  roadDirAt: (x, z) => { const r = data.roadGraph.nearestEdge(x, z, _ne, 60); return r ? Math.atan2(r.point.x - x, r.point.z - z) : 0; } });


const T = provider.tileSize; const tileList = data.tileKeys.map((k) => String(k).split(/[,_:]/).map(Number));
const ends = new Map(); let n = 0;
for (const [tx, tz] of tileList) { const tile = provider.getTile(tx, tz); if (!tile) continue; b.resolveDecks(tile);
  for (const r of tile.roads) { if (r.pts.length < 2) continue; const pr = b.roadProfile(r, tile); const P = pr.pts, m = P.length;
    for (const [i] of [[0], [m - 1]]) { const p = P[i], onSeam = Math.abs(p[0] / T - Math.round(p[0] / T)) < 0.01 || Math.abs(p[1] / T - Math.round(p[1] / T)) < 0.01; if (!onSeam) continue;
      const k = Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2); if (!ends.has(k)) ends.set(k, []); ends.get(k).push([tx, tz, pr.ys ? +pr.ys[i].toFixed(2) : 0, r.name || r.kind, r.y ? r.y.map((v) => +v.toFixed(1)).join('/') : 'none', pr.ys ? pr.ys.length : 0]); } } }
const bad = []; for (const [k, v] of ends) { if (v.length < 2) continue; n++; const ys = v.map((q) => q[2]); if (Math.max(...ys) - Math.min(...ys) > 0.05) bad.push([k, v]); }
console.log('seam ends', n, 'mismatched', bad.length); console.log(JSON.stringify(bad.slice(0, 12)));
