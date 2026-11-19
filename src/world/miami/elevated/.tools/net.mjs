import { loadData } from './env.mjs';
import { buildNetwork } from '../network.js';
const data = await loadData();
let t = performance.now();
const net = buildNetwork(data);
console.log(
  'network ms',
  (performance.now() - t).toFixed(0),
  JSON.stringify(net.phase),
  'chains',
  net.chains.length,
  'piers',
  net.piers.length,
  'lamps',
  net.lamps.length,
  'joints',
  net.joints.length,
  net.stats,
);
let L = 0,
  ns = 0,
  maxG = 0,
  maxK = 0,
  hid = 0;
for (const c of net.chains) {
  L += c.length;
  ns += c.n;
  for (let i = 1; i < c.n; i++) {
    const g = Math.abs(c.y[i] - c.y[i - 1]) / (c.s[i] - c.s[i - 1]);
    if (g > maxG) maxG = g;
  }
  for (let i = 1; i < c.n - 1; i++) {
    const k = Math.abs(c.y[i + 1] - 2 * c.y[i] + c.y[i - 1]) / ((c.s[i + 1] - c.s[i - 1]) / 2) ** 2;
    if (k > maxK) maxK = k;
  }
  for (let i = 0; i < c.n; i++) if (!c.vis[i]) hid++;
}
console.log(
  'total length',
  L.toFixed(0),
  'samples',
  ns,
  'maxGrade',
  maxG.toFixed(3),
  'maxVertCurv',
  maxK.toFixed(4),
  'hidden samples',
  hid,
);
const top = net.chains
  .slice()
  .sort((a, b) => b.length - a.length)
  .slice(0, 25);
for (const c of top)
  console.log(
    c.id,
    (c.name || '?').padEnd(28),
    c.kind.padEnd(14),
    c.length.toFixed(0).padStart(5),
    'n',
    c.n,
    'ymax',
    Math.max(...c.y).toFixed(1),
    c.endA,
    c.endB,
    'edges',
    c.edges.length,
  );
