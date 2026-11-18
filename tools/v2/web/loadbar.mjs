#!/usr/bin/env node
// r2-web: loading-bar trace. Boots the game and samples what the player sees on the loading screen (the % and the label
// under the bar) every 100 ms from the first script to READY, plus a few screenshots along the way.
//   node tools/v2/web/loadbar.mjs [--url http://127.0.0.1:5200/] [--set name] [--q "&lp=0"] [--boots 2] [--shots]
//        [--mbps 50 --lat 20]   (throttled, cache off: a first visit on a home line)
// --bytes-out <file>: write the boot byte manifest (bytes received per boot phase, last boot) for build-pages.mjs
// --boots N: N boots in the same browser profile (the bar's running average in localStorage carries over).
// Writes docs/v2/reports/web-loadbar-<set>.json: per boot { samples: [ms, pct, label], ready, stalls, phases }.
// Plot: python3 tools/v2/web/loadbar_plot.py <json...> <out.png>
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const URL0 = o.url || 'http://127.0.0.1:5200/';
const SET = o.set || 'run';
const BOOTS = +(o.boots || 1);
const EARLY = `(() => {
  const S = window.__bar = { s: [], gaps: [] };
  let lastT = performance.now();
  const tick = () => {
    const tn = performance.now(); if (tn - lastT > 1000) S.gaps.push([Math.round(lastT), Math.round(tn - lastT)]); lastT = tn;
    try {
      const pc = document.getElementById('loadpct'), m = document.getElementById('loadmsg');
      const v = parseFloat(pc && pc.textContent) || 0, l = (m && m.textContent) || '';
      const last = S.s[S.s.length - 1];
      if (!last || last[1] !== v || last[2] !== l) S.s.push([Math.round(performance.now()), v, l]);
      if (window.game && window.game.ready) { S.ready = Math.round(performance.now()); return; }
    } catch (e) {}
    setTimeout(tick, 100);
  };
  tick();
})();`;
const out = { set: SET, url: URL0 + (o.q || ''), when: new Date().toISOString(), boots: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: (o.mbps ? 1300 : 420) * BOOTS + 120 }, async (b) => {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
  if (o.mbps) {
    await b.send('Network.enable');
    await b.send('Network.setCacheDisabled', { cacheDisabled: true });
    await b.send('Network.emulateNetworkConditions', { offline: false, latency: +(o.lat || 20), downloadThroughput: +o.mbps * 1e6 / 8, uploadThroughput: 20e6 / 8 });
  }
  for (let k = 0; k < BOOTS; k++) {
    const sep = URL0.includes('?') ? '&' : '?';
    await b.goto(URL0 + sep + 'mute' + (o.q || ''));
    const shots = [];
    const t0 = Date.now();
    for (let i = 0; i < 2400; i++) {
      let r = false; try { r = await b.eval('!!(window.__bar && window.__bar.ready)', 5000); } catch (e) { /* busy */ }
      if (r) break;
      if (o.shots && k === BOOTS - 1 && (Date.now() - t0) > shots.length * 6000 && shots.length < 8) { const f = `docs/v2/shots/r2web/loadbar_${SET}_${shots.length}.jpg`; try { await Promise.race([b.screenshot(f, { quality: 80 }), b.sleep(8000)]); shots.push(f); } catch (e) { /* */ } }
      await b.sleep(400);
    }
    const S = JSON.parse(await b.eval('JSON.stringify(Object.assign({}, window.__bar, { phases: window.__loadProgress ? window.__loadProgress.durations : null, phaseBytes: window.__loadProgress ? window.__loadProgress.phaseBytes : null, bw: window.__loadProgress ? window.__loadProgress.bw : null, netBytes: window.__loadProgress ? window.__loadProgress.net.bytes : null, weights: (() => { try { return JSON.parse(localStorage.getItem("sl.loadWeights.v1")); } catch (e) { return null; } })() }))', 20000));
    // stalls: the longest stretches where the % did not change
    const st = [];
    for (let i = 1; i < S.s.length; i++) st.push([S.s[i][0] - S.s[i - 1][0], S.s[i - 1][1], S.s[i - 1][2]]);
    if (S.s.length && S.ready) st.push([S.ready - S.s[S.s.length - 1][0], S.s[S.s.length - 1][1], S.s[S.s.length - 1][2]]);
    const stalls = st.sort((x, y) => y[0] - x[0]).slice(0, 8);
    // main-thread blocks: the 100 ms sampler itself could not run (the page could not repaint the bar either)
    const blocks = (S.gaps || []).sort((x, y) => y[1] - x[1]).slice(0, 8);
    console.log(`  main thread blocked > 1 s: ${(S.gaps || []).length}x, longest ${blocks.slice(0, 4).map((g) => g[1] + ' ms @' + g[0]).join(', ')}`);
    out.boots.push({ boot: k + 1, ready: S.ready, samples: S.s, stalls, blocks, phaseBytes: S.phaseBytes, bw: S.bw, netBytes: S.netBytes, phases: S.phases, storedWeights: S.weights ? Object.keys(S.weights).length : 0, shots, errors: [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20) });
    b.errors.length = 0;
    const back = S.s.filter((x, i) => i && x[1] < S.s[i - 1][1]).length;
    if (S.netBytes) console.log(`  received ${(S.netBytes / 1048576).toFixed(1)} MiB, measured speed ${(S.bw * 8 / 1e6).toFixed(1)} Mbps`);
    console.log(`boot ${k + 1}: READY ${S.ready} ms, ${S.s.length} changes, went backward ${back}x, longest stalls (ms @ %): ${stalls.slice(0, 4).map((x) => `${x[0]} @ ${x[1]}% "${x[2]}"`).join(' | ')}`);
    const at = (ms) => { let v = 0; for (const x of S.s) if (x[0] <= ms) v = x[1]; return v; };
    if (S.ready) console.log('  % at 10/25/50/75/90 % of the time: ' + [0.1, 0.25, 0.5, 0.75, 0.9].map((f) => at(S.ready * f)).join(' / '));
    console.log('  errors:', out.boots[k].errors.length, out.boots[k].errors.slice(0, 6).join('\n    '));
  }
});
fs.writeFileSync(`docs/v2/reports/web-loadbar-${SET}.json`, JSON.stringify(out, null, 1));
if (o['bytes-out']) {
  const lb = out.boots[out.boots.length - 1], ph = {};
  for (const [k, v] of Object.entries(lb.phaseBytes || {})) if (v > 65536) ph[k] = Math.round(v);
  const total = Object.values(ph).reduce((a, c) => a + c, 0);
  fs.writeFileSync(o['bytes-out'], JSON.stringify({ note: 'Bytes received per boot phase on a first visit (r2-web, tools/v2/web/loadbar.mjs --mbps ' + (o.mbps || '-') + ' against ' + URL0 + '). Copied next to index.html by build-pages.mjs; read by src/core/loadProgress.js.', when: out.when, total, phases: ph }, null, 1));
  console.log(`wrote ${o['bytes-out']}: ${(total / 1048576).toFixed(1)} MiB over ${Object.keys(ph).length} phases`);
}
console.log(`wrote docs/v2/reports/web-loadbar-${SET}.json`);
