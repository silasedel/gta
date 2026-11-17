#!/usr/bin/env node
// Stage 1: streaming backlog after load. Loads the game (title skipped), then reports at READY and 10 / 20 / 35 s later:
// queued streamer jobs (by kind), tiles within 300 m of the spawn without a near build / colliders, idle-time ms used.
//   node tools/v2/s1-stream.mjs [--q "&noidlestream"] [--set name]
import fs from 'node:fs';
import { withBrowser, GAME_READY } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const rep = { q: o.q || '', samples: [] };
const probe = `JSON.stringify((() => { const st = game.city.streamer, sp = game.city.playerSpawn; const kinds = {}; let miss = 0, missCol = 0, near = 0;
  for (const t of st.tiles.values()) { const d = Math.hypot(t.cx - sp.x, t.cz - sp.z); if (d < 300) { near++; if (!t.near) miss++; if (!t.col && d < 200) missCol++; } }
  return { camFromSpawn: Math.round(Math.hypot(game.camera.position.x - sp.x, game.camera.position.z - sp.z)), pending: st.pending(), nearTiles300: near, nearMissing300: miss, colMissing200: missCol, idleMs: Math.round(st.stats.idleMs || 0), fps: +(game.perf?.fps || 0).toFixed(1) }; })())`;
await withBrowser({ width: 1920, height: 1080, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY, 600);
  const t0 = Date.now();
  for (const at of [0, 10, 20, 35]) { while ((Date.now() - t0) / 1000 < at) await b.sleep(250); const s = JSON.parse(await b.eval(probe)); s.t = at; rep.samples.push(s); console.log(JSON.stringify(s)); }
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 10);
  if (rep.errors.length) console.log('ERRORS', rep.errors.join('\n').slice(0, 1500));
});
fs.writeFileSync(`docs/v2/reports/stage1-stream-${o.set || 'run'}.json`, JSON.stringify(rep, null, 1));
