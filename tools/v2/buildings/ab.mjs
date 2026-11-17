#!/usr/bin/env node
// Building pass A/B in ONE browser session: the same fixed cameras with the library models off (?libmodels=0) and on,
// alternating page loads (A B A B ...), frame ms / p95 / draw calls / triangles per spot.
//   node tools/v2/buildings/ab.mjs --spots spots.json [--rounds 1] [--out docs/v2/reports/bld-ab.json]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
const SPOTS = JSON.parse(fs.readFileSync(o.spots, 'utf8')), rounds = +(o.rounds || 1), res = { A: {}, B: {} };
const measure = `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 4000) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), medMs: +ts[ts.length >> 1].toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), calls: ri.calls, tris: ri.triangles })); } }; requestAnimationFrame(f); })`;
await withBrowser({ width: 1920, height: 1080, maxSeconds: 1500 }, async (b) => {
  for (let r = 0; r < rounds; r++) for (const [tag, q] of [['A', '&libmodels=0'], ['B', '']]) {
    await b.goto('http://127.0.0.1:5200/?mute' + q);
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480); await startGame(b);
    await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; return 1; })()`);
    for (const [id, s] of Object.entries(SPOTS)) {
      await b.eval(`(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 12; if (s.player) game.teleport(s.player[0], undefined, s.player[1], s.player[2]); { ${s.eval || ''} } return 1; })()`);
      await b.sleep(5000); for (let i = 0; i < 40; i++) { const qn = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (qn < 3) break; await b.sleep(1000); }
      await b.sleep(1500); const m = JSON.parse(await b.eval(measure));
      (res[tag][id] = res[tag][id] || []).push(m); console.log(tag, id, JSON.stringify(m));
    }
  }
});
const sum = {}; for (const id of Object.keys(SPOTS)) { const f = (t, k) => { const L = res[t][id] || []; return +(L.reduce((p, c) => p + c[k], 0) / Math.max(1, L.length)).toFixed(2); };
  sum[id] = { off: { ms: f('A', 'medMs'), p95: f('A', 'p95Ms'), calls: f('A', 'calls'), tris: f('A', 'tris') }, on: { ms: f('B', 'medMs'), p95: f('B', 'p95Ms'), calls: f('B', 'calls'), tris: f('B', 'tris') } }; }
console.log(JSON.stringify(sum, null, 1));
if (o.out) fs.writeFileSync(o.out, JSON.stringify({ when: new Date().toISOString(), summary: sum, raw: res }, null, 1));
