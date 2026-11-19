#!/usr/bin/env node
// CPU hot spots after READY: node tools/v2/vegetation/cpuprof.mjs [--q "&veglib=0"] [--secs 8] -> top self-time functions (url:line)
import { withBrowser, GAME_READY } from '../browser.mjs';
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
  await b.waitFor(GAME_READY, 480);
  console.log('READY', Math.round((Date.now() - t0) / 1000), 's');
  for (let k = 0; k < 2; k++) {
    await b.key('Enter', true, 'Enter');
    await b.key('Enter', false, 'Enter');
    await b.sleep(1500);
  }
  await b.sleep(8000);
  await b.send('Profiler.enable');
  await b.send('Profiler.setSamplingInterval', { interval: 500 });
  await b.send('Profiler.start');
  await b.sleep(+(o.secs || 8) * 1000);
  const r = await b.send('Profiler.stop');
  const P = r.result?.profile;
  if (!P) {
    console.log('no profile', JSON.stringify(r).slice(0, 300));
    return;
  }
  const self = new Map(),
    byId = new Map(P.nodes.map((n) => [n.id, n]));
  const dt = {};
  for (let i = 0; i < P.samples.length; i++)
    dt[P.samples[i]] = (dt[P.samples[i]] || 0) + (P.timeDeltas[i] || 0);
  for (const n of P.nodes) {
    const cf = n.callFrame,
      key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (dt[n.id] || 0) / 1000);
  }
  const tot = [...self.values()].reduce((x, y) => x + y, 0);
  console.log('total ms', Math.round(tot));
  for (const [k, v] of [...self.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30))
    console.log(v.toFixed(0).padStart(7), k.slice(0, 150));
  const fr = await b
    .eval(
      `new Promise((res) => { const ts = []; let l = performance.now(), t0 = l; (function f() { const n = performance.now(); ts.push(n - l); l = n; if (n - t0 < 3000) requestAnimationFrame(f); else res(JSON.stringify({ n: ts.length, avg: +(ts.reduce((x, y) => x + y, 0) / ts.length).toFixed(1), calls: game.renderer.info.render.calls })); })(); })`,
      60000,
    )
    .catch((e) => String(e));
  console.log('frames', fr);
});
