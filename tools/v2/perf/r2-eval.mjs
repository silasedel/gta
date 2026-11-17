#!/usr/bin/env node
// r2-perf: boot (muted, 1920x1080, High), optionally teleport, then run page-side async JS files / expressions in order and
// print their results. For one-off in-session measurements.
//   node tools/v2/perf/r2-eval.mjs [--at x,z] [--tod 11] [--q "&flag=1"] --js file1.js[,file2.js] | --expr "js"
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 700) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${o.tod || 11}; game.quality.set('high', { manual: true }); ${o.at ? `game.teleport(${o.at});` : ''} return 1; })()`);
  await b.sleep((+(o.settle || 8)) * 1000);
  const srcs = o.js ? String(o.js).split(',').map((f) => fs.readFileSync(f, 'utf8')) : [o.expr];
  for (const src of srcs) { const r = await b.eval(`(async () => { ${src} })().then((v) => typeof v === 'string' ? v : JSON.stringify(v))`, 600000); console.log(r); }
  const e = [...new Set(b.errors)].filter((x) => !/favicon/.test(x)); if (e.length) console.log('ERRORS', e.slice(0, 6).map((x) => x.slice(0, 200)).join('\n'));
});
