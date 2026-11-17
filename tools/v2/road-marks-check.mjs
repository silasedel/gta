#!/usr/bin/env node
// Lane markings vs junction outlines: no paint inside a junction (only the outline's own stations: crosswalks / stop bars sit
// outside it). Streams a few places, then rasterizes every road-line triangle of the built near tiles against every junction
// outline (job-4 outline, or the old disc for decks/ramps) shrunk by 0.4 m. Muted, headless.
//   node tools/v2/road-marks-check.mjs --set before [--q "&job4=0"] [--spots "x,z;x,z"]
// -> docs/v2/reports/road-marks-<set>.json (per spot: junctions checked, offending triangles, worst junctions)
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const SPOTS = (o.spots || '200,-140;90,-420;300,-340;2400,0;-437,557;-1400,-3300;-900,5250;0,1760').split(';').map((s) => s.split(',').map(Number));
const CHECK = `(() => { const C = game.city, G = C.roadGraph, out = { junctions: 0, tris: 0, bad: 0, worst: {} };
  const lines = []; game.scene.traverse((m) => { if (m.isMesh && m.material && m.material.name === 'roadLines' && /^tile-near-/.test(m.parent?.name || '')) lines.push(m); });
  // junction outlines near the loaded tiles
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const m of lines) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; x0 = Math.min(x0, b.min.x); z0 = Math.min(z0, b.min.z); x1 = Math.max(x1, b.max.x); z1 = Math.max(z1, b.max.z); }
  const polys = []; for (const n of G.nodes) { if ((n.edges || []).length < 3 || n.x < x0 || n.x > x1 || n.z < z0 || n.z > z1) continue; const J = C.junctionOf ? C.junctionOf(n.id) : null;
    if (J) polys.push({ id: n.id, P: J.poly, x: n.x, z: n.z }); else { const w = Math.max(...n.edges.map((k) => G.edges[k].width)), R = w / 2, P = []; for (let k = 0; k < 16; k++) { const t = k / 16 * Math.PI * 2; P.push([n.x + Math.cos(t) * R, n.z + Math.sin(t) * R]); } polys.push({ id: n.id, P, x: n.x, z: n.z, disc: true }); } }
  out.junctions = polys.length; const cell = new Map(), K = (x, z) => Math.floor(x / 40) * 100003 + Math.floor(z / 40);
  for (const p of polys) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of p.P) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } p.bb = [a, b, c, d]; for (let i = Math.floor(a / 40); i <= Math.floor(c / 40); i++) for (let j = Math.floor(b / 40); j <= Math.floor(d / 40); j++) { const k = i * 100003 + j; if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); } }
  const inside = (P, x, z) => { let ins = false, bd = 1e9; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; const dx = xj - xi, dz = zj - zi, L2 = dx * dx + dz * dz || 1; let t = ((x - xi) * dx + (z - zi) * dz) / L2; t = Math.max(0, Math.min(1, t)); bd = Math.min(bd, Math.hypot(xi + dx * t - x, zi + dz * t - z)); } return ins && bd > 0.4; };
  for (const m of lines) { const P = m.geometry.attributes.position.array, idx = m.geometry.index; const n = idx ? idx.count : P.length / 3, gi = (k) => (idx ? idx.getX(k) : k);
    for (let k = 0; k + 2 < n; k += 3) { let cx = 0, cz = 0; for (let q = 0; q < 3; q++) { const v = gi(k + q); cx += P[v * 3]; cz += P[v * 3 + 2]; } cx /= 3; cz /= 3; out.tris++;
      const c = cell.get(K(cx, cz)); if (!c) continue; for (const p of c) { if (cx < p.bb[0] || cx > p.bb[2] || cz < p.bb[1] || cz > p.bb[3]) continue; if (inside(p.P, cx, cz)) { out.bad++; const w = out.worst[p.id] ||= { x: +p.x.toFixed(1), z: +p.z.toFixed(1), n: 0, disc: !!p.disc }; w.n++; break; } } } }
  out.worst = Object.entries(out.worst).sort((p, q) => q[1].n - p[1].n).slice(0, 12).map(([id, v]) => ({ id: +id, ...v })); return JSON.stringify(out); })()`;
const rep = { set: SET, when: new Date().toISOString(), spots: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: 1500 }, async (b) => {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (String(p).includes('vite-hmr') || /[?&]token=/.test(String(u))) return { readyState: 0, addEventListener() {}, removeEventListener() {}, send() {}, close() {} }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; })();` });
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480); await startGame(b);
  for (const [x, z] of SPOTS) {
    await b.eval(`(() => { game.cameraOverride = (dt, cam) => { cam.position.set(${x}, 60, ${z + 1}); cam.lookAt(${x}, 0, ${z}); return true; }; game.teleport(${x}, undefined, ${z}, 0); return 1; })()`);
    await b.sleep(3000); for (let i = 0; i < 60; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 2) break; await b.sleep(1000); } await b.sleep(1500);
    const r = JSON.parse(await b.eval(CHECK)); r.spot = [x, z]; rep.spots.push(r); console.log(JSON.stringify(r).slice(0, 400));
  }
});
rep.total = { junctions: rep.spots.reduce((s, r) => s + r.junctions, 0), bad: rep.spots.reduce((s, r) => s + r.bad, 0), tris: rep.spots.reduce((s, r) => s + r.tris, 0) };
console.log('TOTAL', JSON.stringify(rep.total));
fs.writeFileSync(`docs/v2/reports/road-marks-${SET}.json`, JSON.stringify(rep, null, 1));
