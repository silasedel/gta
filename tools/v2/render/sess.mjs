#!/usr/bin/env node
// LIVE SESSION (render track): boots the game once and keeps it open, evaluating command files as they appear.
//   node tools/v2/render/sess.mjs --dir /tmp/sess [--q "&foo=1"] [--w 1600 --h 900] [--max 3600]
// Write <dir>/c<N>.js (an expression; await works) -> result in <dir>/r<N>.json. A command file whose first line is
// "//shot <path>" also saves a screenshot after evaluating. "//quit" ends the session. Console errors go to <dir>/errors.txt.
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const DIR = o.dir || '/tmp/sess'; fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) if (/^[cr]\d+\.(js|json)$/.test(f)) fs.rmSync(path.join(DIR, f));
await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 3600) }, async (b) => {
  // --livesample: sample allocations from before the page loads and keep only live objects (who retains the heap)
  if (o.livesample) { await b.send('HeapProfiler.enable'); await b.send('HeapProfiler.startSampling', { samplingInterval: 1 << 20 }); }
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY, 480);
  await startGame(b);
  fs.writeFileSync(path.join(DIR, 'ready'), String(Date.now()));
  let n = 1;
  for (;;) {
    const f = path.join(DIR, `c${n}.js`);
    if (!fs.existsSync(f)) { await b.sleep(300); continue; }
    await b.sleep(100);
    const code = fs.readFileSync(f, 'utf8'); const first = code.split('\n')[0];
    if (first.startsWith('//quit')) break;
    if (first.startsWith('//reload')) { b.errors.length = 0; await b.goto('http://127.0.0.1:5200/?mute' + (first.slice(8).trim() || o.q || '')); await b.waitFor(GAME_READY, 480); await startGame(b);
      fs.writeFileSync(path.join(DIR, `r${n}.json`), '"reloaded"'); fs.writeFileSync(path.join(DIR, 'errors.txt'), [...new Set(b.errors)].join('\n')); n++; continue; }
    if (first.startsWith('//heap start')) { await b.send('HeapProfiler.enable'); await b.send('HeapProfiler.startSampling', { samplingInterval: 262144, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); fs.writeFileSync(path.join(DIR, `r${n}.json`), '"started"'); n++; continue; }
    // perf track: "//prof start" / "//prof stop" = CPU profile (self ms by function, and the game-code caller of the hottest frames)
    if (first.startsWith('//prof start')) { await b.send('Profiler.enable'); await b.send('Profiler.setSamplingInterval', { interval: 200 }); await b.send('Profiler.start'); fs.writeFileSync(path.join(DIR, `r${n}.json`), '"started"'); n++; continue; }
    if (first.startsWith('//prof stop')) {
      const p = (await b.send('Profiler.stop')).result?.profile; const byId = new Map(); const self = new Map(); const tot = new Map();
      const nm = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-2).join('/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
      for (const nd of p.nodes) byId.set(nd.id, nd);
      const parent = new Map(); for (const nd of p.nodes) for (const c of nd.children || []) parent.set(c, nd.id);
      const dts = p.timeDeltas; const cnt = new Map(); for (let i = 0; i < p.samples.length; i++) cnt.set(p.samples[i], (cnt.get(p.samples[i]) || 0) + (dts[i] || 0));
      let all = 0;
      for (const [id, us] of cnt) { all += us; const nd = byId.get(id); const k = nm(nd.callFrame); self.set(k, (self.get(k) || 0) + us);
        const seen = new Set(); let cur = id; while (cur !== undefined) { const kk = nm(byId.get(cur).callFrame); if (!seen.has(kk)) { seen.add(kk); tot.set(kk, (tot.get(kk) || 0) + us); } cur = parent.get(cur); } }
      const secs = all / 1e6; const f = (m) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 60).map(([k, v]) => [k, +(v / 1000 / secs).toFixed(2)]);
      fs.writeFileSync(path.join(DIR, `r${n}.json`), JSON.stringify({ secs: +secs.toFixed(1), unit: 'ms per second', self: f(self), total: f(tot) }, null, 1)); n++; continue;
    }
    if (first.startsWith('//heap stop')) {
      const r = (await b.send('HeapProfiler.stopSampling')).result?.profile; const agg = new Map(), via = new Map(); let tot = 0;
      const nm = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-2).join('/').replace(/\?.*$/, '')}:${cf.lineNumber}`;
      const walk = (nd, chain) => { const k = nm(nd.callFrame); agg.set(k, (agg.get(k) || 0) + nd.selfSize); tot += nd.selfSize;
        if (nd.selfSize) { const c = chain.filter((x) => !/three\.module|chunk-|node_modules|\(root\)|\(program\)|:-1$/.test(x)).slice(-3).join(' < '); const kk = k + ' <= ' + c; via.set(kk, (via.get(kk) || 0) + nd.selfSize); }
        for (const c of nd.children || []) walk(c, chain.concat(k)); };
      if (r) walk(r.head, []);
      const out = { totalMB: Math.round(tot / 1e6), top: [...agg].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v / 1e5) / 10]), via: [...via].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, Math.round(v / 1e5) / 10]) };
      fs.writeFileSync(path.join(DIR, `r${n}.json`), JSON.stringify(out, null, 1)); n++; continue;
    }
    let res;
    try { res = await b.eval(`(async () => { try { const __v = await (async () => { ${/\breturn\b/.test(code) ? code : 'return (' + code.replace(/^\/\/.*\n/, '') + ')'} })(); return JSON.stringify(__v ?? null); } catch (e) { return JSON.stringify({ error: String(e && e.stack || e) }); } })()`); }
    catch (e) { res = JSON.stringify({ error: String(e) }); }
    if (first.startsWith('//shot ')) { try { await b.sleep(+(first.split(' ')[2] || 800)); await b.screenshot(first.split(' ')[1]); } catch (e) { /* */ } }
    fs.writeFileSync(path.join(DIR, `r${n}.json`), typeof res === 'string' ? res : JSON.stringify(res));
    fs.writeFileSync(path.join(DIR, 'errors.txt'), [...new Set(b.errors)].join('\n'));
    n++;
  }
});
