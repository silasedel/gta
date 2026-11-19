import { loadData } from './env.mjs';
import { buildNetwork } from '../network.js';
const data = await loadData();
const net = buildNetwork(data);
const bad = [];
for (const c of net.chains)
  for (let i = 1; i < c.n; i++) {
    const g = (c.y[i] - c.y[i - 1]) / (c.s[i] - c.s[i - 1]);
    if (Math.abs(g) > 0.085)
      bad.push([
        c.id,
        i,
        g.toFixed(3),
        c.x[i].toFixed(0),
        c.z[i].toFixed(0),
        c.y[i - 1].toFixed(2),
        c.y[i].toFixed(2),
        c.yT[i].toFixed(2),
        c.name,
        c.kind,
      ]);
  }
console.log('bad grade samples', bad.length);
const byC = {};
for (const b of bad) (byC[b[0]] ||= []).push(b);
for (const [k, l] of Object.entries(byC))
  console.log(k, l.length, JSON.stringify(l[0]), JSON.stringify(l[l.length - 1]));
