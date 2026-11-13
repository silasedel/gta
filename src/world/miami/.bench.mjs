// headless streaming benchmark (CITY agent dev tool; not imported by the game)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
const here = path.dirname(fileURLToPath(import.meta.url)), projRoot = path.resolve(here, '../../..');
globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(path.join(projRoot, u), 'utf8')) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })), set: (o, k, v) => ((o[k] = v), true) }) }) };
await RAPIER.init();
const { loadDevProvider } = await import('./devProvider.js');
const { createTileBuilder } = await import('./tilebuild.js');
const { createStreamer } = await import('./stream.js');
const tL = performance.now(); const provider = await loadDevProvider(200); console.log('provider load ms', (performance.now() - tL) | 0, 'tiles', provider.tiles.size);
const mk = () => new THREE.MeshStandardMaterial();
const M = new Proxy({}, { get: (o, k) => (o[k] ??= (k.toString().includes('Depth') ? new THREE.MeshDepthMaterial() : mk())) });
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const root = new THREE.Group();
const zoneAt = (x) => (x > 3300 ? 'beach' : x > 2550 ? 'nightlife' : x < -1100 ? 'downtown' : 'commercial');
const nodeIdx = new Map(); for (const n of provider.nodes) nodeIdx.set(Math.round(n.x * 2) + ',' + Math.round(n.z * 2), { degree: n.deg, width: Math.max(0, ...n.edges.map((e) => e.width)) });
const nodeAt = (p) => nodeIdx.get(Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2)) || null;
const b = createTileBuilder({ M, provider, root, world, RAPIER, zoneAt, nodeAt });
const st = createStreamer({ tileSize: 200, chunkTiles: 4, nearR: 350, midR: 1500, colR: 250, budgetMs: 3, bounds: provider.bounds, ...b });
const A = [3300, 0], B = [-2600, -600], N = +(process.argv[2] || 600);
let worst = 0, sum = 0; const hist = [];
const f = [{ x: A[0], z: A[1] }, { x: A[0], z: A[1] }];
for (let i = 0; i < 200; i++) st.update(f); // warm-up at the start position (like createMiamiCity)
console.log("after warmup maxStep", JSON.stringify(st.stats.maxStep), "queued", st.stats.queued);
for (let i = 0; i <= N; i++) {
  const t = i / N; f[0].x = f[1].x = A[0] + (B[0] - A[0]) * t; f[0].z = f[1].z = A[1] + (B[1] - A[1]) * t;
  const t0 = performance.now(); st.update(f); const dt = performance.now() - t0; worst = Math.max(worst, dt); sum += dt; if (dt > 6) hist.push([Math.round(f[0].x), dt.toFixed(1)]);
}
console.log('frames', N, 'avg ms', (sum / N).toFixed(2), 'worst ms', worst.toFixed(1), 'maxStep', JSON.stringify(Object.fromEntries(Object.entries(st.stats.maxStep).map(([k, v]) => [k, +v.toFixed(1)]))));
console.log('spikes>6ms', hist.length, JSON.stringify(hist.slice(0, 20)));
console.log('near', st.stats.near, 'mid', st.stats.mid, 'col', st.stats.col, 'queued', st.stats.queued, 'colliders', world.colliders.len());
