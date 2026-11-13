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


import zlib from 'node:zlib';
const T = provider.tileSize; const run = (g) => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const tileList = data.tileKeys.map((k) => String(k).split(/[,_:]/).map(Number));
const tq0 = performance.now();
for (const [tx, tz] of tileList) run(b.buildColliders({ tx, tz, k: tx + ',' + tz, x0: tx * T, z0: tz * T, cx: (tx + 0.5) * T, cz: (tz + 0.5) * T }));
world.step(); console.log('colliders', world.colliders.len(), 's', ((performance.now() - tq0) / 1000).toFixed(1));
const inP = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const cnt = {}, holes = []; let n = 0;
for (const [tx, tz] of tileList) {
  const tile = provider.getTile(tx, tz); if (!tile) continue; const x0 = tx * T, z0 = tz * T;
  const parks = (tile.areas || []).filter((a) => /park|grass/.test(a.kind)).map((a) => a.rings[0]);
  for (let x = x0 + 1; x < x0 + T; x += 2) for (let z = z0 + 1; z < z0 + T; z += 2) {
    if (data.isWater(x, z)) continue; n++;
    const gh = data.groundHeightAt(x, z), deck = b.deckSurfaceAt(x, z, gh);
    let ok = false; for (const ref of deck !== null ? [0, deck] : [0]) { const h = world.castRay(new RAPIER.Ray({ x, y: ref + 1.2, z }, { x: 0, y: -1, z: 0 }), 2.5, true); const hy = h ? ref + 1.2 - h.timeOfImpact : null; if (hy !== null && hy > ref - 0.2) { ok = true; break; } }
    if (ok) continue;
    let cat = 'other'; const nearW = data.isWater(x + 4, z) || data.isWater(x - 4, z) || data.isWater(x, z + 4) || data.isWater(x, z - 4);
    const seam = Math.min(x - x0, x0 + T - x, z - z0, z0 + T - z) < 3;
    if (nearW) cat = 'shoreline'; else if (seam) cat = 'tileSeam'; else if (deck !== null || Math.abs(gh) > 0.5) cat = 'bridgeAbutment'; else if (parks.some((r) => inP(r, x, z))) cat = 'park';
    cnt[cat] = (cnt[cat] || 0) + 1; if (holes.length < 300000) holes.push([x, z, cat]);
  }
}
console.log('samples', n, 'holes', holes.length, JSON.stringify(cnt), 'elapsed', ((performance.now() - tq0) / 1000).toFixed(1));
fs.writeFileSync(path.join(here, '.coverage_' + (process.argv[2] || 'next') + '.json'), JSON.stringify({ cnt, holes: holes.slice(0, 20000) }));
if (process.argv[3] === 'png') {
  const B = provider.bounds, W = 2048, sc = W / (B.maxX - B.minX), H = Math.ceil((B.maxZ - B.minZ) * sc), img = Buffer.alloc(W * H * 3, 0);
  for (let i = 0; i < img.length; i += 3) { img[i] = 18; img[i + 1] = 30; img[i + 2] = 44; }
  const px = (x, z, r, g, bl, rad = 0) => { const cx = ((x - B.minX) * sc) | 0, cz = ((z - B.minZ) * sc) | 0; for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) { const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= W || Z >= H) continue; const o = (Z * W + X) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = bl; } };
  for (const [tx, tz] of tileList) for (let x = tx * T + 1; x < tx * T + T; x += 6) for (let z = tz * T + 1; z < tz * T + T; z += 6) if (!data.isWater(x, z)) px(x, z, 70, 74, 80);
  for (const [x, z] of holes) px(x, z, 255, 40, 40, 1);
  const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const crcT = []; for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[k] = c >>> 0; }
  const crc = (buf) => { let x = 0xffffffff; for (const v of buf) x = crcT[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(path.join(projRoot, 'docs/showcase/city/' + (process.argv[4] || 'ground_holes.png')), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
