// usage: node plot.mjs map x0 z0 x1 z1 out.png   |  node plot.mjs prof chainId out.png
import { loadData } from './env.mjs';
import { buildNetwork } from '../network.js';
import { Canvas, heat } from './png.mjs';
const data = await loadData(); const net = buildNetwork(data); const [mode, ...a] = process.argv.slice(2);
const OUT = '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
if (mode === 'map') {
  const [x0, z0, x1, z1] = a.slice(0, 4).map(Number), W = 1400, sc = W / (x1 - x0), H = Math.round((z1 - z0) * sc), cv = new Canvas(W, H);
  const X = (x) => (x - x0) * sc, Z = (z) => (z - z0) * sc;
  for (const e of data.roadGraph.edges) if (!net.own[e.id]) for (let i = 0; i < e.pts.length - 1; i++) cv.line(X(e.pts[i][0]), Z(e.pts[i][1]), X(e.pts[i + 1][0]), Z(e.pts[i + 1][1]), [70, 70, 70], Math.max(0, Math.round(e.width / 2 * sc) - 1));
  for (const c of net.chains) for (let i = 0; i < c.n - 1; i++) {
    if (!c.vis[i]) continue; const col = heat(c.y[i] / 20);
    for (let t = 0; t <= 1; t += 0.25) { const o = c.vL[i] + (c.vR[i] - c.vL[i]) * t, nx = -c.tz[i], nz = c.tx[i]; cv.line(X(c.x[i] + nx * o), Z(c.z[i] + nz * o), X(c.x[i + 1] + nx * o), Z(c.z[i + 1] + nz * o), col); }
    for (const [bar, side] of [[c.barL, -1], [c.barR, 1]]) if (bar[i] && bar[i + 1]) { const o0 = side < 0 ? c.vL[i] : c.vR[i], o1 = side < 0 ? c.vL[i + 1] : c.vR[i + 1]; cv.line(X(c.x[i] - c.tz[i] * o0), Z(c.z[i] + c.tx[i] * o0), X(c.x[i + 1] - c.tz[i + 1] * o1), Z(c.z[i + 1] + c.tx[i + 1] * o1), [255, 255, 255]); }
  }
  for (const p of net.piers) for (const [cx, cz] of p.cols) cv.dot(X(cx), Z(cz), 2, [255, 0, 255]);
  for (const c of net.chains) if (c.x[0] > x0 && c.x[0] < x1 && c.z[0] > z0 && c.z[0] < z1) cv.dot(X(c.x[0]), Z(c.z[0]), 3, [0, 255, 0]);
  cv.save(OUT + (a[4] || 'map.png'));
  // print chain ids in view
  for (const c of net.chains) { let inV = 0; for (let i = 0; i < c.n; i += 5) if (c.x[i] > x0 && c.x[i] < x1 && c.z[i] > z0 && c.z[i] < z1) inV++; if (inV) console.log(c.id, c.name, c.kind, c.length.toFixed(0), 'start', c.x[0].toFixed(0), c.z[0].toFixed(0), c.endA, c.endB); }
} else if (mode === 'prof') {
  const c = net.chains[+a[0]], W = 1400, H = 500, cv = new Canvas(W, H); const ymax = Math.max(4, ...c.y, ...c.yT) + 1, X = (s) => s / c.length * (W - 20) + 10, Y = (y) => H - 20 - y / ymax * (H - 40);
  for (let y = 0; y < ymax; y += 2) cv.line(0, Y(y), W, Y(y), [40, 40, 50]);
  const consCol = [null, [0, 255, 0], [0, 160, 255], [255, 200, 0], [255, 0, 0], [255, 0, 255], [255, 255, 255], [0, 255, 255]];
  for (let i = 0; i < c.n; i++) if (c.cons[i]) cv.dot(X(c.s[i]), H - 8, 2, consCol[c.cons[i]]);
  for (let i = 0; i < c.n - 1; i++) { cv.line(X(c.s[i]), Y(c.yT[i]), X(c.s[i + 1]), Y(c.yT[i + 1]), [120, 120, 120]); cv.line(X(c.s[i]), Y(c.y[i]), X(c.s[i + 1]), Y(c.y[i + 1]), [255, 255, 255], 1); cv.px(X(c.s[i]), Y(c.type[i] * 2), [0, 200, 200]); }
  cv.save(OUT + (a[1] || 'prof.png')); console.log(c.id, c.name, c.kind, c.length, c.endA, c.endB);
}
