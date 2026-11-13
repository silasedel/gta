// ELEVATED-2: 'deck' chain ends (ramp starts / ends on another deck) that are not level with any neighbouring deck
// (a floating or buried ramp end). usage: node deckends.mjs [noov]
import { loadData } from './env.mjs';
import { buildNetwork } from '../network.js';
const data = await loadData(); const net = buildNetwork(data, { overrides: process.argv[2] !== 'noov' });
let bad = 0;
for (const c of net.chains) for (const [end, kind] of [[0, c.endA], [1, c.endB]]) {
  if (kind !== 'deck') continue;
  const i = end ? c.n - 1 : 0, y = c.y[i]; let best = Infinity, who = -1;
  for (const r of c.rel[i]) { if (r.k < 0) continue; const ck = net.chains[r.k], yk = ck.y[r.j] + (ck.y[r.j + 1] - ck.y[r.j]) * r.u; if (Math.abs(yk - y) < best) { best = Math.abs(yk - y); who = r.k; } }
  if (best > 0.3) { bad++; console.log('chain', c.id, c.name || c.kind, end ? 'B' : 'A', 'at', c.x[i].toFixed(0), c.z[i].toFixed(0), 'y', y.toFixed(2), 'nearest deck dy', best === Infinity ? 'none' : best.toFixed(2), 'chain', who); }
}
console.log('bad deck ends', bad);
