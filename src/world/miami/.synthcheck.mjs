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
const allB = []; const lots = [];
for (const [tx, tz] of tileList) { const tile = provider.getTile(tx, tz); if (!tile) continue; for (const bb of tile.buildings) allB.push({ b: bb, tx, tz }); }
const inP = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const segD = (r, x, z) => { let m = 1e9; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length], dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)); m = Math.min(m, Math.hypot(p[0] + dx * t - x, p[1] + dz * t - z)); } return m; };
const grid = new Map(); for (const e of allB) { let a = Infinity, c = -Infinity, d = Infinity, f = -Infinity; for (const [x, z] of e.b.rings[0]) { a = Math.min(a, x); c = Math.max(c, x); d = Math.min(d, z); f = Math.max(f, z); } e.bb = [a, c, d, f]; for (let gx = Math.floor(a / 50); gx <= Math.floor(c / 50); gx++) for (let gz = Math.floor(d / 50); gz <= Math.floor(f / 50); gz++) { const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); } }
const near = (x, z) => grid.get(Math.floor(x / 50) + ',' + Math.floor(z / 50)) || [];
let n = 0; const bad = { notOnWall: [], frontInOther: [], boxInOther: [], dupBuilding: [] };
for (const [tx, tz] of tileList) {
  const t = { tx, tz, k: tx + ',' + tz, x0: tx * T, z0: tz * T, cx: (tx + 0.5) * T, cz: (tz + 0.5) * T };
  const tile = provider.getTile(tx, tz); if (!tile) continue;
  const g = run(b.buildNear(t));
  for (const bb of tile.buildings) for (const sf of bb.storefronts || []) { if (!sf.synthetic) continue; n++;
    const ox = Math.sin(sf.facing), oz = Math.cos(sf.facing), rec = { id: sf.id, x: sf.fx, z: sf.fz, b: bb.id, dist: data.districtAt(sf.fx, sf.fz), tile: t.k };
    const dw = segD(bb.rings[0], sf.fx, sf.fz); if (dw > 0.3) bad.notOnWall.push({ ...rec, dw });
    for (const e of near(sf.fx + ox, sf.fz + oz)) if (e.b !== bb && inP(e.b.rings[0], sf.fx + ox * 1.0, sf.fz + oz * 1.0)) { bad.frontInOther.push({ ...rec, other: e.b.id, otherH: e.b.h, part: !!e.b.part }); break; }
    const rx = -oz, rz = ox; for (const [u, v] of [[-2.7, -0.3], [2.7, -0.3], [-2.7, -sf.d + 0.3], [2.7, -sf.d + 0.3]]) { const px = sf.fx + rx * u + ox * v, pz = sf.fz + rz * u + oz * v; if (!inP(bb.rings[0], px, pz)) { bad.boxInOther.push({ ...rec, outside: [u, v] }); break; } }
    for (const e of near(bb.cx, bb.cz)) if (e.b !== bb && (bb.rings[0].some(([x, z]) => inP(e.b.rings[0], x, z)) || e.b.rings[0].some(([x, z]) => inP(bb.rings[0], x, z)))) { (bad.overlapX ||= []).push({ ...rec, other: e.b.id, oh: e.b.h, h: bb.h, otile: e.tx + ',' + e.tz }); break; }
    const same = allB.filter((e) => e.b.id === bb.id); if (same.length > 1) bad.dupBuilding.push({ ...rec, tiles: same.map((e) => e.tx + ',' + e.tz) });
  }
  b.dispose(g);
}
console.log('synthetic lots', n); for (const k in bad) { console.log(k, bad[k].length); console.log(JSON.stringify(bad[k].slice(0, 6))); }
fs.writeFileSync('/tmp/synthbad.json', JSON.stringify(bad));
if (process.env.DUMP) { const out = []; for (const l of b.synthLots.values()) out.push({ id: l.id, x: l.x, z: l.z, fx: l.fx, fz: l.fz, f: l.facing, d: l.d, b: l.buildingId, dist: data.districtAt(l.fx, l.fz) }); fs.writeFileSync('/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/city2/lots.json', JSON.stringify(out)); }
