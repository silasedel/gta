// ELEVATED-2 inspector: chains near a point, or one chain's profile.
// usage: node insp.mjs near X Z [R]      |  node insp.mjs prof CID [step] [s0] [s1]
import { loadData } from './env.mjs';
import { buildNetwork } from '../network.js';
const data = await loadData();
const net = buildNetwork(data);
const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
const E = data.roadGraph.edges;
if (cmd === 'near') {
  const X = +a1,
    Z = +a2,
    R = +(a3 || 150);
  for (const c of net.chains) {
    let dmin = 1e9,
      im = 0;
    for (let i = 0; i < c.n; i++) {
      const d = Math.hypot(c.x[i] - X, c.z[i] - Z);
      if (d < dmin) {
        dmin = d;
        im = i;
      }
    }
    if (dmin > R) continue;
    let gmax = 0,
      gi = 0;
    for (let i = 1; i < c.n; i++) {
      const g = Math.abs(c.y[i] - c.y[i - 1]) / (c.s[i] - c.s[i - 1] || 1);
      if (g > gmax) {
        gmax = g;
        gi = i;
      }
    }
    console.log(
      c.id,
      (c.name || '?').slice(0, 22).padEnd(22),
      c.kind.padEnd(13),
      'L',
      c.length.toFixed(0).padStart(5),
      'n',
      c.n,
      'A',
      c.endA,
      c.nodeA,
      '(' + c.x[0].toFixed(0) + ',' + c.z[0].toFixed(0) + ',' + c.y[0].toFixed(1) + ')',
      'B',
      c.endB,
      c.nodeB,
      '(' +
        c.x[c.n - 1].toFixed(0) +
        ',' +
        c.z[c.n - 1].toFixed(0) +
        ',' +
        c.y[c.n - 1].toFixed(1) +
        ')',
      'dmin',
      dmin.toFixed(0),
      '@s',
      c.s[im].toFixed(0),
      'ymax',
      Math.max(...c.y).toFixed(1),
      'gmax',
      gmax.toFixed(3),
      '@',
      c.x[gi].toFixed(0) + ',' + c.z[gi].toFixed(0),
      'edges',
      c.edges.join(','),
      'ow',
      c.oneway[0],
    );
  }
} else if (cmd === 'prof') {
  const c = net.chains[+a1],
    st = +(a2 || 1),
    s0 = a3 !== undefined ? +a3 : -1,
    s1 = a4 !== undefined ? +a4 : 1e9;
  console.log(
    'chain',
    c.id,
    c.name,
    c.kind,
    'len',
    c.length.toFixed(1),
    c.endA,
    c.endB,
    'trim',
    c.trimA,
    c.trimB,
  );
  for (let i = 0; i < c.n; i += st) {
    if (c.s[i] < s0 || c.s[i] > s1) continue;
    const g = i ? (c.y[i] - c.y[i - 1]) / (c.s[i] - c.s[i - 1]) : 0;
    const rels = c.rel[i]
      .filter((r) => r.k >= 0 && (r.ovl || r.near))
      .map(
        (r) =>
          `${r.k}${r.joined ? 'J' : r.clip ? 'C' : r.near ? 'n' : 'o'}${(r.dy ?? 0).toFixed(1)}`,
      )
      .join(' ');
    console.log(
      i,
      's',
      c.s[i].toFixed(1),
      'xz',
      c.x[i].toFixed(1),
      c.z[i].toFixed(1),
      'yT',
      c.yT[i].toFixed(2),
      'y',
      c.y[i].toFixed(2),
      'g',
      (g * 100).toFixed(1),
      'cons',
      c.cons[i],
      'e',
      c.edge[i],
      'vis',
      c.vis[i],
      'v',
      c.vL[i].toFixed(1),
      c.vR[i].toFixed(1),
      'bar',
      c.barL[i],
      c.barR[i],
      'ty',
      c.type[i],
      '|',
      rels,
    );
  }
} else if (cmd === 'xs') {
  // cross-sections: node insp.mjs xs axis(z|x) from to step id,id,...
  const ax = a1,
    v0 = +a2,
    v1 = +a3,
    [stp, ...rest] = a4.split(':'),
    ids = rest.join(':').split(',').map(Number);
  const at = (c, v) => {
    let best = -1,
      bd = 1e9;
    const A = ax === 'z' ? c.z : c.x;
    for (let i = 0; i < c.n; i++) {
      const d = Math.abs(A[i] - v);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return [best, bd];
  };
  for (let v = v0; v <= v1; v += +stp) {
    let line = ax + ' ' + v;
    for (const id of ids) {
      const c = net.chains[id],
        [i, bd] = at(c, v);
      if (bd > 3) {
        line += ' | ' + id + ' -';
        continue;
      }
      const ex = (o) =>
        ax === 'z' ? (c.x[i] - c.tz[i] * o).toFixed(0) : (c.z[i] + c.tx[i] * o).toFixed(0);
      line +=
        ' | ' +
        id +
        ' [' +
        ex(c.vL[i]) +
        ',' +
        ex(c.vR[i]) +
        '] y' +
        c.y[i].toFixed(1) +
        ' s' +
        c.s[i].toFixed(0);
    }
    console.log(line);
  }
} else if (cmd === 'water') {
  for (const id of a1.split(',')) {
    const c = net.chains[+id];
    let s = '';
    for (let i = 0; i < c.n; i += 3) s += c.water[i] ? 'W' : '.';
    console.log(
      id,
      c.x[0].toFixed(0),
      c.z[0].toFixed(0),
      '->',
      c.x[c.n - 1].toFixed(0),
      c.z[c.n - 1].toFixed(0),
      s,
    );
  }
} else if (cmd === 'node') {
  const N = data.roadGraph.nodes[+a1];
  console.log(
    N.id,
    N.x,
    N.z,
    N.y,
    N.edges
      .map((k) => `${k}:${E[k].kind}:${E[k].name}:own${net.own[k]}:ch${net.chainOfEdge[k]}`)
      .join(' | '),
  );
} else if (cmd === 'edge') {
  const e = E[+a1];
  console.log(
    e.id,
    e.kind,
    e.name,
    'a',
    e.a,
    'b',
    e.b,
    'ow',
    e.oneway,
    'w',
    e.width,
    'y',
    Array.from(e.y)
      .map((v) => v.toFixed(1))
      .join(','),
    'pts',
    e.pts.map((p) => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(' '),
  );
}
if (cmd === 'brief')
  for (const id of a1.split(',')) {
    const c = net.chains[+id];
    let o = `${id} ${c.name} L${c.length.toFixed(0)} trim ${c.trimA.toFixed(1)}/${c.trimB.toFixed(1)} ${c.endA}/${c.endB}\n`;
    for (let i = 0; i < c.n; i += 5) {
      const g = i
        ? (c.y[i] - c.y[Math.max(0, i - 5)]) / (c.s[i] - c.s[Math.max(0, i - 5)] || 1)
        : 0;
      o += `  s${c.s[i].toFixed(0)} (${c.x[i].toFixed(0)},${c.z[i].toFixed(0)}) yT${c.yT[i].toFixed(1)} y${c.y[i].toFixed(2)} g${(g * 100).toFixed(0)} ${c.water[i] ? 'W' : ''} c${c.cons[i]} ${c.rel[
        i
      ]
        .filter((r) => r.ovl || r.near)
        .map(
          (r) =>
            (r.k >= 0 ? r.k : 'g' + r.e) +
            (r.joined ? 'J' : r.ovl ? 'o' : 'n') +
            (r.dy ?? 0).toFixed(1),
        )
        .join(' ')}\n`;
    }
    console.log(o);
  }
