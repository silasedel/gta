#!/usr/bin/env node
// Vegetation boot probe: node tools/v2/vegetation/probe.mjs [--q "&veglib=0"] [--shot out.png] -> READY time, errors, model load /
// bake timing, countryside stats, frame time at the spawn (gameplay camera)
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  const t0 = Date.now();
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  for (let i = 0; i < 480; i++) {
    if (await b.eval(`!!(${GAME_READY})`, 8000).catch(() => false)) break;
    if (i % 15 === 0)
      console.log(
        't+' + Math.round((Date.now() - t0) / 1000) + 's',
        JSON.stringify(
          await b
            .eval(
              'JSON.stringify({ stage: (window.__boot?.stages || []).slice(-1)[0], veg: globalThis.__vegLoad || null, bakes: Object.keys(globalThis.__vegBake || {}).length })',
              8000,
            )
            .catch((e) => String(e).slice(0, 120)),
        ),
      );
    await b.sleep(1000);
  }
  console.log('READY after', Math.round((Date.now() - t0) / 1000), 's');
  await startGame(b, 60);
  await b.sleep(6000);
  const r = await b.eval(
    `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; (function f() { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 4000) requestAnimationFrame(f); else { ts.shift(); ts.sort((x, y) => x - y); const ri = game.renderer.info; res(JSON.stringify({ avgMs: +(ts.reduce((x, y) => x + y, 0) / ts.length).toFixed(1), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(1), calls: ri.render.calls, tris: ri.render.triangles, mem: ri.memory, veg: globalThis.__vegLoad, bakes: globalThis.__vegBake, cs: game.vegetation?.countryside?.stats?.(), models: Object.keys(game.city?.flora?.models || {}).length, sys: Object.entries(game.perf?.sysAvg || {}).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => k + ' ' + v.toFixed(2)) })); } })(); })`,
    60000,
  );
  console.log(r);
  if (o.shot) await b.screenshot(o.shot);
  const errs = b.errors.filter((e) => !/favicon/.test(e));
  if (errs.length) console.log('ERRORS', errs.slice(0, 8).join('\n'));
});
