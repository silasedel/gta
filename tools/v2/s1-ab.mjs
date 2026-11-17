#!/usr/bin/env node
// Stage 1 A/B frame-time test: one browser session, several in-page toggles, average frame interval for each.
//   node tools/v2/s1-ab.mjs [--at x,z] [--tod 11] [--secs 3] [--cases file.json]
import fs from 'node:fs';
import { withBrowser, GAME_READY } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const P = 'game.post', R = 'game.renderer';
const CASES = o.cases ? JSON.parse(fs.readFileSync(o.cases, 'utf8')) : [
  ['base', ''],
  ['noShadowUpdate', `${R}.shadowMap.autoUpdate = false;`],
  ['noShadowAtAll', `${R}.shadowMap.enabled = false; game.scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => x.needsUpdate = true); });`],
  ['msaa0', `game.quality.current.look.msaa = 0;`],
  ['noTAA', `game.quality.current.look.taa = false;`],
  ['noAO', `game.settings.ao = false;`],
  ['noBloom', `${P}.bloom.enabled = false;`],
  ['rawRender', `${P}.render = () => { ${R}.render(game.scene, game.camera); };`],
];
await withBrowser({ width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${o.tod || 11}; ${o.at ? `game.teleport(${o.at});` : ''} return 1; })()`);
  await b.sleep((+(o.warm || 20)) * 1000);
  const measure = `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < ${(+(o.secs || 3)) * 1000}) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); res(JSON.stringify({ med: +ts[ts.length >> 1].toFixed(1), avg: +(ts.reduce((p, c) => p + c, 0) / ts.length).toFixed(1), cpu: +(game.perf.workAvg || 0).toFixed(1), calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles })); } }; requestAnimationFrame(f); })`;
  // each case is applied on top of a fresh page state? no: cumulative cost is unclear, so reload between cases
  for (const [name, code] of CASES) {
    if (name !== CASES[0][0]) {
      await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
      await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${o.tod || 11}; ${o.at ? `game.teleport(${o.at});` : ''} return 1; })()`);
      await b.sleep((+(o.warm || 20)) * 1000);
    }
    await b.eval(`(() => { ${code} return 1; })()`);
    await b.sleep(1500);
    console.log(name.padEnd(16), await b.eval(measure));
  }
});
