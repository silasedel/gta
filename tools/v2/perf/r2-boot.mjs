#!/usr/bin/env node
// r2-perf boot check for the perf flags: boots with ?perf=1&dynres=1&tiers=1&lodbias=1 (or --q), plays a short while at
// the spawn and downtown, reports console errors, the tier pick and benchmark, the dynamic-resolution trace (scale,
// p90, CPU-bound, GPU trust) and the LOD bias, and saves screenshots with the perf overlay.
//   node tools/v2/perf/r2-boot.mjs [--q "&perf=1&dynres=1&tiers=1&lodbias=1"] [--tier mid] [--secs 20] [--set name]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'boot';
const Q = o.q ?? '&perf=1&dynres=1&tiers=1&lodbias=1' + (o.tier ? '&tier=' + o.tier : '');
const rep = { set: SET, q: Q, when: new Date().toISOString() };
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 700) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + Q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  rep.v2failed = await b.eval('JSON.stringify(game.v2.failed)');
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; return 1; })()`,
  );
  const state = () =>
    b.eval(`JSON.stringify({ tier: game.tiers?.result || null, gpuClass: game.tiers?.gpuClass, preset: game.quality?.name, reason: game.quality?.stats?.reason,
    dyn: game.dynres && { on: game.dynres.on, active: game.dynres.active, scale: game.dynres.scale, min: game.dynres.min, max: game.dynres.max, targetMs: +game.dynres.targetMs.toFixed(1), stats: game.dynres.stats },
    renderScale: game.post?.renderScale, internal: game.post?.internalSize, lodBias: game.lodBias && { on: game.lodBias.on, k: game.lodBias.k }, gpuFrameMs: game.gpuFrameMs ?? null, fps: game.perf?.fps && +game.perf.fps.toFixed(1), work: game.perf?.workAvg && +game.perf.workAvg.toFixed(1) })`);
  const trace = [];
  const secs = +(o.secs || 20);
  for (let i = 0; i < secs; i++) {
    await b.sleep(1000);
    trace.push(JSON.parse(await state()));
  }
  await b.screenshot(`docs/v2/shots/perf/r2_${SET}_spawn.jpg`);
  await b.eval('(game.teleport(407, undefined, -110, 0), game.timeOfDay = 15, 1)');
  for (let i = 0; i < secs; i++) {
    await b.sleep(1000);
    trace.push(JSON.parse(await state()));
  }
  await b.screenshot(`docs/v2/shots/perf/r2_${SET}_downtown.jpg`);
  rep.trace = trace;
  rep.final = trace[trace.length - 1];
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
  console.log('v2 failed', rep.v2failed);
  console.log(
    'tier',
    JSON.stringify(rep.final.tier),
    rep.final.gpuClass,
    rep.final.preset,
    rep.final.reason,
  );
  for (const t of trace)
    console.log(
      ' ',
      JSON.stringify({
        preset: t.preset,
        scale: t.dyn?.scale,
        rs: t.renderScale,
        int: t.internal,
        p90: t.dyn?.stats?.p90,
        cpuB: t.dyn?.stats?.cpuBound,
        gpuT: t.dyn?.stats?.gpuTrusted,
        downs: t.dyn?.stats?.downs,
        ups: t.dyn?.stats?.ups,
        k: t.lodBias?.k,
        fps: t.fps,
        work: t.work,
        gpu: t.gpuFrameMs && +t.gpuFrameMs.toFixed(1),
      }),
    );
  console.log(
    'ERRORS',
    rep.errors.length,
    rep.errors
      .slice(0, 8)
      .map((e) => e.slice(0, 220))
      .join('\n'),
  );
});
fs.writeFileSync(`docs/v2/reports/r2-perf-${SET}.json`, JSON.stringify(rep, null, 1));
