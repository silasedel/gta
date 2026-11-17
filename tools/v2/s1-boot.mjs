#!/usr/bin/env node
// Stage 1 boot profiler: loads the game in a fresh headless Chrome (cold cache) and reports
//  - the boot timeline (window.__boot.stages from src/main.js: every boot stage and V2 module init, start + ms),
//  - every long main-thread task from the very first script (observer injected before any page script),
//  - long animation frames with script attribution (which function / file blocked the thread),
//  - time to READY and how often the loading bar repainted (gaps = frozen bar).
//   node tools/v2/s1-boot.mjs [--set name] [--q "&param"] [--top 25]
// Writes docs/v2/reports/stage1-boot-<set>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'run', TOP = +(o.top || 25);
const EARLY = `(() => {
  const B = window.__boot = window.__boot || { t0: performance.now(), stages: [] };
  B.long = []; B.loaf = []; B.frames = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) B.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.duration < 150) continue; B.loaf.push({ t: Math.round(e.startTime), ms: Math.round(e.duration), block: Math.round(e.blockingDuration || 0),
    scripts: [...(e.scripts || [])].sort((x, y) => y.duration - x.duration).slice(0, 4).map((s) => [Math.round(s.duration), (s.sourceFunctionName || s.invoker || '?').slice(0, 60), String(s.sourceURL || '').split('/').slice(-2).join('/').split('?')[0] + ':' + (s.sourceCharPosition ?? '')]) }); } }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  let last = performance.now(); const tick = (t) => { B.frames.push(Math.round(t - last)); last = t; if (!window.game || !window.game.ready) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
})();`;
const rep = { set: SET, when: new Date().toISOString() };
await withBrowser({ width: 1920, height: 1080, maxSeconds: 900 }, async (b) => {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
  if (o.prof) { await b.goto('http://127.0.0.1:5200/package.json'); await b.sleep(500); await b.send('Profiler.enable'); await b.send('Profiler.setSamplingInterval', { interval: 1000 }); await b.send('Profiler.start'); }
  const t0 = Date.now();
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY, 600);
  rep.wallMs = Date.now() - t0;
  await b.sleep(3000); // the first frames after READY count too
  if (o.prof) {
    const pr = (await b.send('Profiler.stop')).result.profile;
    const nodes = new Map(pr.nodes.map((n) => [n.id, n])); const parent = new Map();
    for (const n of pr.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const cnt = new Map(); for (const sId of pr.samples) cnt.set(sId, (cnt.get(sId) || 0) + 1);
    const dt = (pr.endTime - pr.startTime) / 1000 / pr.samples.length; // ms per sample
    const self = {}, incl = {};
    const nm = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/').split('?')[0]}:${n.callFrame.lineNumber + 1}`;
    for (const [id, c] of cnt) { const n = nodes.get(id); self[nm(n)] = (self[nm(n)] || 0) + c; const seen = new Set(); for (let x = id; x !== undefined; x = parent.get(x)) { const k = nm(nodes.get(x)); if (!seen.has(k)) { seen.add(k); incl[k] = (incl[k] || 0) + c; } } }
    const top = (m, k) => Object.entries(m).filter(([f]) => !/^\((idle|root|program)\)/.test(f)).sort((x, y) => y[1] - x[1]).slice(0, k).map(([f, c]) => `${String(Math.round(c * dt)).padStart(6)} ms  ${f}`);
    rep.profSelf = top(self, 40); rep.profIncl = top(incl, 120);
    // hottest source lines of chosen functions (--lines name1,name2): self samples per line
    if (o.lines) { const want = String(o.lines).split(','); const L = {};
      for (const n of pr.nodes) { if (!want.includes(n.callFrame.functionName)) continue; for (const pt of n.positionTicks || []) { const k = n.callFrame.functionName + ':' + pt.line; L[k] = (L[k] || 0) + pt.ticks; } }
      rep.lines = Object.entries(L).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, c]) => Math.round(c * dt) + ' ms ' + k); }
    // busy stretches (consecutive non-idle samples >= 150 ms): the heaviest project functions inside each one
    const isIdle = (id) => { const f = nodes.get(id).callFrame.functionName; return f === '(idle)' || f === '(program)' || f === '(root)'; };
    const stretches = []; let cur = null, tAcc = 0;
    for (let i = 0; i < pr.samples.length; i++) {
      tAcc += pr.timeDeltas[i] / 1000;
      if (isIdle(pr.samples[i])) { if (cur && cur.ms >= 150) stretches.push(cur); cur = null; continue; }
      if (!cur) cur = { t: Math.round(tAcc), ms: 0, f: {} };
      cur.ms += pr.timeDeltas[i + 1] ? pr.timeDeltas[i + 1] / 1000 : dt;
      const seen = new Set();
      for (let x = pr.samples[i]; x !== undefined; x = parent.get(x)) { const n = nodes.get(x), u = n.callFrame.url; if (!/\/src\//.test(u)) continue; const k = nm(n); if (!seen.has(k)) { seen.add(k); cur.f[k] = (cur.f[k] || 0) + 1; } }
    }
    if (cur && cur.ms >= 150) stretches.push(cur);
    rep.busy = stretches.sort((x, y) => y.ms - x.ms).slice(0, 14).map((st) => ({ t: st.t, ms: Math.round(st.ms), top: Object.entries(st.f).sort((x, y) => y[1] - x[1]).slice(0, 7).map(([f, c]) => Math.round(c * dt) + ' ' + f) }));
  }
  rep.programs = await b.eval(`(() => { const ps = game.renderer.info.programs; const by = {}; for (const p of ps) { const k = String(p.cacheKey); const cs = /srgb-linear/.test(k) ? 'linear' : /,srgb,/.test(k) ? 'srgb' : 'other'; by[cs] = (by[cs] || 0) + 1; } return JSON.stringify({ n: ps.length, by }); })()`);
  const B = JSON.parse(await b.eval(`JSON.stringify(Object.assign({}, window.__boot, { readyAt: window.__boot.ready, nav: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd }))`));
  rep.readyMs = B.readyAt; rep.stages = B.stages; rep.slices = (B.slices || []).sort((x, y) => y[0] - x[0]); rep.long = B.long; rep.loaf = B.loaf;
  const fr = B.frames || [];
  rep.loadingBar = { frames: fr.length, gapsOver200: fr.filter((x) => x > 200).length, worstGap: Math.max(0, ...fr), sumOver200: fr.filter((x) => x > 200).reduce((p, c) => p + c, 0) };
  if (b.errors.length) rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 12);
});
const longs = rep.long.slice().sort((x, y) => y[1] - x[1]);
console.log(`READY at ${rep.readyMs} ms (wall ${rep.wallMs} ms). Long tasks: ${longs.length}, over 200 ms: ${longs.filter((x) => x[1] > 200).length}, worst ${longs[0]?.[1] ?? 0} ms, total blocked ${longs.reduce((p, c) => p + c[1], 0)} ms`);
console.log('Programs at READY+3s:', rep.programs);
console.log(`Loading bar: ${rep.loadingBar.frames} frames, ${rep.loadingBar.gapsOver200} gaps > 200 ms, worst ${rep.loadingBar.worstGap} ms`);
console.log('\nStages (by duration):');
for (const s of rep.stages.slice().sort((x, y) => y[2] - x[2]).slice(0, TOP)) console.log(`  ${String(s[2]).padStart(6)} ms  @${String(s[1]).padStart(6)}  ${s[0]}`);
console.log('\nWorst long tasks [start, ms]:', JSON.stringify(longs.slice(0, 15)));
console.log('\nLong animation frames (script attribution):');
for (const f of rep.loaf.slice().sort((x, y) => y.ms - x.ms).slice(0, 15)) console.log(`  @${f.t} ${f.ms} ms`, JSON.stringify(f.scripts));
if (rep.slices?.length) { console.log('\nLong paced slices (ms, where the slice ended):'); for (const l of rep.slices.slice(0, 15)) console.log('  ' + l[0] + ' ms  ' + l[1]); }
if (rep.lines) { console.log('\nHot lines:'); for (const l of rep.lines) console.log('  ' + l); }
if (rep.busy) { console.log('\nLongest busy stretches (profile), heaviest project functions inside:'); for (const b of rep.busy) console.log(`  @${b.t} ${b.ms} ms  ` + b.top.join(' | ')); }
if (rep.profIncl && o.full) { console.log('\nCPU inclusive (boot):'); for (const l of rep.profIncl) console.log('  ' + l); console.log('\nCPU self (boot):'); for (const l of rep.profSelf) console.log('  ' + l); }
if (rep.errors) console.log('\nERRORS', rep.errors.join('\n'));
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/stage1-boot-${SET}.json`, JSON.stringify(rep, null, 1));
