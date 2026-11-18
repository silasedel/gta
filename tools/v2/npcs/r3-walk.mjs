#!/usr/bin/env node
// r3-people walk check: boots the game (muted) at a street spot, lets the crowd fill, then measures every walker
// (far crowd + near peds): on a building footprint? lateral offset from the road edge (lane spread), and how many
// walkers share one lane (|offset difference| < 0.35 m on the same edge side within 30 m = a "single file" line).
//   node tools/v2/npcs/r3-walk.mjs --set a [--at 407,-110] [--q "&pednav=old"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'a'; const AT = String(o.at || '407,-110').split(',').map(Number); const Q = o.q ?? '';
const D = 'docs/v2/shots/people/r3'; fs.mkdirSync(D, { recursive: true });
await withBrowser({ width: 1280, height: 800, maxSeconds: 700 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + Q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(40000);
  const measure = `JSON.stringify((() => {
    const C = game.city, RG = C.roadGraph; const out = { n: 0, inBuilding: 0, offs: [], lines: 0, maxLine: 0, district: C.districtAt?.(game.player.position.x, game.player.position.z) };
    const P = (game.people?.crowd?.positions?.() || []).concat((game.peds?.list || []).filter((p) => p.active && p.pos).map((p) => [p.pos.x, p.pos.z]));
    const rows = [];
    for (const [x, z] of P) {
      out.n++; if (C.surfaceAt(x, z) === 'building') out.inBuilding++;
      const r = RG.nearestEdge(x, z); if (!r || r.dist > 15) continue;
      const off = r.dist - r.edge.width / 2; out.offs.push(+off.toFixed(2));
      const sd = ((x - r.point.x) * -r.dir.z + (z - r.point.z) * r.dir.x) >= 0 ? 1 : -1;
      rows.push({ e: r.edge.id, sd, off, s: r.s });
    }
    for (const q of rows) { let n = 0; for (const w of rows) if (w.e === q.e && w.sd === q.sd && Math.abs(w.off - q.off) < 0.35 && Math.abs(w.s - q.s) < 30) n++; if (n >= 5) out.lines++; out.maxLine = Math.max(out.maxLine, n); }
    const o2 = out.offs.slice().sort((a, b) => a - b); out.offQ = [0.1, 0.5, 0.9].map((k) => o2[(o2.length * k) | 0]); delete out.offs;
    out.errors = (window.__errs || []).length; out.fps = game.perf?.fps;
    return out; })())`;
  console.log('measure', await b.eval(measure));
  // street-level look along the densest walker group
  const tgt = await b.eval(`JSON.stringify((() => { const L = game.people.crowd.positions(); const pp = game.player.position; let best = null, bn = -1;
    for (const p of L) { const d = Math.hypot(p[0] - pp.x, p[1] - pp.z); if (d < 25 || d > 120) continue; let n = 0; for (const q of L) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 18) n++; if (n > bn) { bn = n; best = p; } } return best ? { x: best[0], z: best[1], n: bn } : null; })())`);
  const T = JSON.parse(tgt);
  if (T) for (const [k, dist, h, fov] of [[0, 30, 1.8, 50], [1, 26, 14, 50]]) {
    await b.eval(`(() => { const T = ${tgt}; const pp = game.player.position; const dx = pp.x - T.x, dz = pp.z - T.z, l = Math.hypot(dx, dz) || 1;
      const cx = T.x + dx / l * ${dist}, cz = T.z + dz / l * ${dist}; const gy = game.city.groundHeightAt?.(T.x, T.z, 0) ?? 0;
      game.cameraOverride = (dt, cam) => { cam.position.set(cx, gy + ${h}, cz); cam.lookAt(T.x, gy + 1.0, T.z); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
    await b.sleep(2500); await b.screenshot(`${D}/walk_${SET}_${k}.jpg`);
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 10).join('\n'));
});
