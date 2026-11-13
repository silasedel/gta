import { loadData } from './env.mjs'; import { buildNetwork } from '../network.js'; import { createBuilder } from '../build.js';
const data = await loadData(); const net = buildNetwork(data); const b = createBuilder(net);
const [tx, tz] = process.argv.slice(2).map(Number); const B = { x0: tx * 200, x1: tx * 200 + 200, z0: tz * 200, z1: tz * 200 + 200 };
const g = b.gather(B); console.log('segs', g.segs.length);
g.segs.forEach((s, k) => { if (k % 120 === 119 || k % 120 === 0) console.log(k, s.c.id, s.i, s.c.x[s.i].toFixed(1), s.c.z[s.i].toFixed(1)); });
