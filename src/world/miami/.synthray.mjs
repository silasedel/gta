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
const rc = new THREE.Raycaster(); const flags = []; let n = 0; const only = process.env.DIST;
for (const [tx, tz] of tileList) {
  const t = { tx, tz, k: tx + ',' + tz, x0: tx * T, z0: tz * T, cx: (tx + 0.5) * T, cz: (tz + 0.5) * T };
  const tile = provider.getTile(tx, tz); if (!tile) continue;
  if (!tile.buildings.length) continue;
  const g = run(b.buildNear(t));
  const meshes = []; g.traverse?.((o) => { if (o.isMesh && !o.isInstancedMesh && o.material !== M.shopGlass) meshes.push(o); });
  for (const bb of tile.buildings) for (const sf of bb.storefronts || []) { if (!sf.synthetic) continue; if (only && !data.districtAt(sf.fx, sf.fz).includes(only)) continue; n++;
    const ox = Math.sin(sf.facing), oz = Math.cos(sf.facing), res = {};
    for (const [nm, y, u] of [['up', Math.min((sf.h || 3) + 0.9, bb.h - 0.4), 0], ['low', 0.25, 1.8], ['low2', 0.25, -1.8]]) {
      rc.set(new THREE.Vector3(sf.fx + ox * 1.0 - oz * u, y, sf.fz + oz * 1.0 + ox * u), new THREE.Vector3(-ox, 0, -oz)); rc.far = 30;
      const hit = rc.intersectObjects(meshes, false)[0]; res[nm] = hit ? +hit.distance.toFixed(2) : null;
    }
    if (res.up === null || Math.abs(res.up - 1) > 0.35 || res.low === null || Math.abs(res.low - 1) > 0.35 || res.low2 === null || Math.abs(res.low2 - 1) > 0.35) flags.push({ id: sf.id, fx: sf.fx, fz: sf.fz, f: sf.facing, b: bb.id, h: bb.h, dist: data.districtAt(sf.fx, sf.fz), ...res });
  }
  b.dispose(g);
}
console.log('lots', n, 'flagged', flags.length); console.log(flags.slice(0, 30).map((f) => JSON.stringify(f)).join('\n'));
fs.writeFileSync('/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/city2/rayflags.json', JSON.stringify(flags));
