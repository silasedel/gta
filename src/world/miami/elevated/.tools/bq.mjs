import { loadData } from './env.mjs';
const data = await loadData();
const [x, z, r = 20] = process.argv.slice(2).map(Number);
const T = 200;
const tile = data.getTile(Math.floor(x / T), Math.floor(z / T));
for (const b of tile.buildings) {
  const ring = b.rings[0];
  let mx = 1e9;
  for (const [px, pz] of ring) mx = Math.min(mx, Math.hypot(px - x, pz - z));
  if (mx < r)
    console.log('building', b.kind, b.style, 'h', b.h, 'minH', b.minH, 'dist', mx.toFixed(1));
}
for (const p of tile.piers || []) console.log('pier', p.y);
console.log(
  'props near',
  (tile.props || [])
    .filter((p) => Math.hypot(p.x - x, p.z - z) < r)
    .map((p) => p.type)
    .join(','),
);
console.log('areas', (tile.areas || []).map((a) => a.kind).join(','));
