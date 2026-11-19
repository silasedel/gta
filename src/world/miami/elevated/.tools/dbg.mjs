import { loadData } from './env.mjs';
import { buildNetwork } from '../network.js';
globalThis.__DBG = +process.argv[2];
globalThis.__DBGI = (process.argv[3] || '').split(',').filter(Boolean).map(Number);
const data = await loadData();
const net = buildNetwork(data);
const c = net.chains[globalThis.__DBG];
for (const i of globalThis.__DBGI) console.log('final', i, c.y[i].toFixed(2), 'cons', c.cons[i]);
const D = globalThis.__DUMP;
if (D) {
  const { smoothConstrained } = await import('../solve.js');
  const f = (a) => Float64Array.from(a.map((v) => (v === null ? NaN : v)));
  console.log(
    'eq near',
    D.eq
      .slice(5, 25)
      .map((v) => (Number.isNaN(v) || v === null ? '.' : v.toFixed(1)))
      .join(' '),
  );
  console.log(
    'lo near',
    D.lo
      .slice(5, 25)
      .map((v) => v.toFixed(1))
      .join(' '),
  );
  console.log(
    'hi near',
    D.hi
      .slice(5, 25)
      .map((v) => (v > 1e9 ? 'inf' : v.toFixed(1)))
      .join(' '),
  );
  console.log(
    'y  near',
    D.y
      .slice(5, 25)
      .map((v) => v.toFixed(2))
      .join(' '),
  );
}
if (D && process.argv[4] === 'all') {
  const segs = [];
  let cur = null;
  for (let i = 0; i < D.eq.length; i++) {
    const k =
      D.eq[i] !== null && !Number.isNaN(D.eq[i])
        ? 'eq' + (+D.eq[i]).toFixed(1)
        : (D.lo[i] > 0.01 ? 'lo' + D.lo[i].toFixed(1) : '') +
          (D.hi[i] < 1e9 ? 'hi' + D.hi[i].toFixed(1) : '');
    if (!cur || cur.k !== k) {
      cur = { k, a: i, b: i };
      segs.push(cur);
    } else cur.b = i;
  }
  console.log(segs.map((s) => `${s.a}-${s.b}:${s.k || 'free'}`).join(' | '));
}
