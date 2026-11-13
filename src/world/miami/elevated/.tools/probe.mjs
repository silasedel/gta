// node probe.mjs chainId s [s2 step]
import { loadData } from './env.mjs';
import { buildNetwork } from '../network.js';
const data = await loadData(); const net = buildNetwork(data);
const [cid, sa, sb = sa, st = 2] = process.argv.slice(2).map(Number); const c = net.chains[cid];
console.log('chain', c.id, c.name, c.kind, 'prio', c.prio, 'len', c.length.toFixed(1), c.endA, c.endB, 'trim', c.trimA.toFixed(1), c.trimB.toFixed(1), 'edges', c.edges.join(','));
for (let s = sa; s <= sb; s += st) { const i = Math.round(net.sampleIndexF(c, s));
  console.log(`s=${c.s[i].toFixed(1)} i=${i} xz=${c.x[i].toFixed(1)},${c.z[i].toFixed(1)} y=${c.y[i].toFixed(2)} yT=${c.yT[i].toFixed(2)} b=${c.bank[i].toFixed(3)} v=[${c.vL[i].toFixed(2)},${c.vR[i].toFixed(2)}] H=${c.HL[i].toFixed(2)} vis=${c.vis[i]} bar=${c.barL[i]}${c.barR[i]} join=${c.joinL[i]}${c.joinR[i]} type=${c.type[i]} cons=${c.cons[i]}`);
  for (const r of c.rel[i]) console.log(`   k=${r.k}${r.k >= 0 ? '(' + net.chains[r.k].name + ',p' + net.chains[r.k].prio + ')' : '(ground e' + r.e + ' ' + data.roadGraph.edges[r.e].name + ')'} t=[${r.t1.toFixed(2)},${r.t2.toFixed(2)}] near=${r.near} over=${r.over} joined=${r.joined} clip=${r.clip} same=${r.same} dy=${r.dy?.toFixed(2)} dyT=${r.dyT.toFixed(2)} d=${r.d.toFixed(1)}`);
}
if (process.argv[6]) { const [x, z] = process.argv[6].split(',').map(Number); for (const ch of net.chains) { let bi = -1, bd = 1e9; for (let i = 0; i < ch.n; i++) { const d = Math.hypot(ch.x[i] - x, ch.z[i] - z); if (d < bd) { bd = d; bi = i; } } if (bd < 25) console.log('near chain', ch.id, ch.name, 'i', bi, 's', ch.s[bi].toFixed(1), 'd', bd.toFixed(1)); } }
