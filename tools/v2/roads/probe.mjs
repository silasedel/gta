#!/usr/bin/env node
// Ground-pass probe: one browser session, a list of steps (camera spots, evals, screenshots), optionally run for several
// URL query variants in the same session (A/B: e.g. --qs ",&gmask=0").
//   node tools/v2/roads/probe.mjs --steps tools/v2/roads/spots/ground.json --set gp2 [--only a,b] [--qs ",&gmask=0"] [--eval "js"]
// steps file: { id: { player|eye|eval|tod, ... } } (the s1-tour spot format; `eval` runs in the page, `report` is a JS expression
// whose JSON value is printed). Shots: docs/v2/shots/stage1/<set>[_<variant>]_<id>.png. Prints frame timing per shot.
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'probe', DIR = path.resolve('docs/v2/shots/stage1'); fs.mkdirSync(DIR, { recursive: true });
const STEPS = o.steps ? JSON.parse(fs.readFileSync(o.steps, 'utf8')) : {};
const only = o.only ? String(o.only).split(',') : Object.keys(STEPS);
const QS = o.qs !== undefined ? String(o.qs).split(',') : [''];
const rep = { set: SET, when: new Date().toISOString(), runs: {} };
await withBrowser({ width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 1500) }, async (b) => {
  for (const q of QS) {
    const tag = q ? q.replace(/[^a-z0-9]+/gi, '') : '';
    await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || '') + q);
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; if (game.weather && game.weather.set) game.weather.set('clear', { instant: true }); return 1; })()`);
    if (o.eval) console.log('eval', q, await b.eval(String(o.eval)));
    const R = (rep.runs[q || 'default'] = {});
    for (const id of only) {
      const s = STEPS[id]; if (!s) continue;
      await b.eval(`(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 12; game.cameraOverride = null;
        if (s.eye) { game.cameraOverride = (dt, cam) => { cam.position.fromArray(s.eye); cam.lookAt(s.look[0], s.look[1], s.look[2]); return true; }; }
        else if (s.player) game.teleport(s.player[0], undefined, s.player[1], s.player[2]);
        { ${s.eval || ''} }
        return 1; })()`);
      await b.sleep(+(o.settle || 3500));
      for (let i = 0; i < +(o.stream || 40); i++) { const qn = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (qn < 3) break; await b.sleep(1000); }
      await b.sleep(1200);
      const perf = await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 2500) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), p50: +ts[ts.length >> 1].toFixed(2), calls: ri.calls, tris: ri.triangles, gm: game.groundMask ? { ms: +game.groundMask.stats.ms.toFixed(2), n: game.groundMask.stats.meshes, cars: game.groundMask.stats.cars } : null })); } }; requestAnimationFrame(f); })`);
      const out = path.join(DIR, `${SET}${tag ? '_' + tag : ''}_${id}.png`); await b.screenshot(out);
      let extra = null; if (s.report) { try { extra = await b.eval(`(() => { try { return JSON.stringify(${s.report}); } catch (e) { return 'ERR ' + e.message; } })()`); } catch (e) { extra = 'ERR ' + e.message; } }
      R[id] = { perf: JSON.parse(perf), extra }; console.log(q || '-', id, perf, extra ? String(extra).slice(0, 1500) : '');
    }
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.map((e) => String(e).slice(0, 600)).join('\n')); }
});
fs.writeFileSync(`docs/v2/reports/stage1-${SET}.json`, JSON.stringify(rep, null, 2));
