// Round-2 cars probe: boot the game muted, run a list of steps, screenshots + JSON results.
//   node tools/v2/cars/r2.mjs <steps.mjs>      steps.mjs: export default [ { eval?: 'js (async ok)', sleep?: ms, shot?: 'path.png', log?: 'label' }, ... ]
// A step's eval result is printed (and kept in docs/v2/reports/cars-r2-<name>.json).
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const file = path.resolve(process.argv[2]); const name = path.basename(file).replace(/\.mjs$/, '');
const steps = (await import(file)).default;
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const rep = { name, when: new Date().toISOString(), out: [] };
await withBrowser({ width: W, height: H, maxSeconds: +(process.env.MAX || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (process.env.Q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { game.timeExternal = true; if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); } return 1; })()`);
  for (const s of steps) {
    if (s.sleep) await b.sleep(s.sleep);
    if (s.eval) { let r; try { r = await b.eval(s.eval); } catch (e) { r = 'ERR ' + e.message; } console.log(s.log || 'eval', typeof r === 'string' ? r.slice(0, 4000) : r); rep.out.push({ log: s.log, r }); }
    if (s.shot) { fs.mkdirSync(path.dirname(s.shot), { recursive: true }); await b.screenshot(s.shot); console.log('shot', s.shot); }
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 30); console.log('ERRORS', rep.errors.join('\n').slice(0, 3000)); }
});
fs.writeFileSync(`docs/v2/reports/cars-r2-${name}.json`, JSON.stringify(rep, null, 1));
