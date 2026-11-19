import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)),
  projRoot = path.resolve(here, '../../..');
const rd = (u) => {
  for (const p of [path.join(projRoot, 'public', u), path.join(projRoot, u)])
    if (fs.existsSync(p)) return fs.readFileSync(p);
  throw new Error('404 ' + u);
};
globalThis.fetch = async (u) => {
  const b = rd(u);
  return {
    ok: true,
    json: async () => JSON.parse(b.toString('utf8')),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  };
};
const { loadMiamiData } = await import('./data.js');
const d = await loadMiamiData(null);
const keys = d.tileKeys.slice();
let worst = [],
  total = 0,
  tz = 0;
const t0 = performance.now();
for (const k of keys) {
  const [i, j] = k.split('_').map(Number);
  const a = performance.now();
  const t = d.getTile(i, j);
  const dt = performance.now() - a;
  total += dt;
  worst.push([dt, k, t ? t.buildings.length : 0]);
  if (performance.now() - t0 > 60000) {
    console.log('timeout after', worst.length);
    break;
  }
}
worst.sort((a, b) => b[0] - a[0]);
console.log(
  'tiles',
  worst.length,
  'total ms',
  total.toFixed(0),
  'worst',
  JSON.stringify(worst.slice(0, 5).map((w) => [w[0].toFixed(1), w[1], w[2]])),
);
const z0 = performance.now();
for (let k = 0; k < 2000; k++) d.zoneAt(Math.random() * 8000 - 3700, Math.random() * 5000 - 2600);
console.log('zoneAt x2000 ms', (performance.now() - z0).toFixed(1));
const kinds = {},
  piers = {},
  lc = {},
  terms = [];
let portT = 0;
for (const k of keys) {
  const [i, j] = k.split('_').map(Number);
  const t = d.getTile(i, j);
  if (!t) continue;
  const pz = d.zoneAt(t.x0 + 100, t.z0 + 100) === 'port';
  if (pz) portT++;
  for (const b of t.buildings) {
    if (pz) kinds[b.kind + '/' + b.style] = (kinds[b.kind + '/' + b.style] || 0) + 1;
    if (/cruise|terminal|ferry/.test(String(b.kind)))
      terms.push([Math.round(b.cx), Math.round(b.cz), b.kind, Math.round(b.area)]);
  }
  for (const p of t.piers) piers[p.kind] = (piers[p.kind] || 0) + 1;
  for (const a of t.areas)
    lc[(a.cls || '') + ':' + a.kind] = (lc[(a.cls || '') + ':' + a.kind] || 0) + 1;
}
console.log('portTiles', portT, JSON.stringify(kinds));
console.log('terminals', JSON.stringify(terms));
console.log('piers', JSON.stringify(piers));
console.log('areas', JSON.stringify(lc));
let bb = [1e9, -1e9, 1e9, -1e9];
for (let x = -3700; x < 4500; x += 20)
  for (let z = -2650; z < 2650; z += 20)
    if (d.zoneAt(x, z) === 'port' && !d.isWater(x, z)) {
      bb[0] = Math.min(bb[0], x);
      bb[1] = Math.max(bb[1], x);
      bb[2] = Math.min(bb[2], z);
      bb[3] = Math.max(bb[3], z);
    }
console.log('port land bbox', bb);
