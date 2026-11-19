#!/usr/bin/env node
// Profiles the built-in benchmark in the Mac app over the DevTools protocol (no headless browser slot needed).
//   node tools/v2/bench-prof.mjs --web <web build dir> [--segs downtown,night] [--heap 1] [--live 1] [--out file.json] [--q "&x=1"]
// Build the web folder unminified for readable names: npx vite build --minify false --outDir <dir>
// For each listed benchmark segment: a CPU profile (self and total ms per second by function) and, with --heap 1, an
// allocation sampling (MB allocated per second by function, including garbage). --live 1: live-heap sampling from the start
// of the run to the end (what holds the JS heap). Report: --out (default docs/v2/reports/bench-prof.json).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const PORT = +(o.port || 9339);
const segs = String(o.segs || 'downtown').split(',');
const out = path.resolve(o.out || 'docs/v2/reports/bench-prof.json');
const q = ['mute', (o.q || '').replace(/^&/, '')].filter(Boolean).join('&');
const p = spawn('npx', ['electron', 'desktop/app', `--remote-debugging-port=${PORT}`, `--ps-web-root=${path.resolve(o.web)}`, '--ps-bench=prof', '--ps-bench-stay', `--ps-bench-out=/tmp/bench-prof-run.json`, `--ps-query=${q}`, ...(o.windowed ? [] : ['--ps-fullscreen'])], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 120 && !ws; i++) {
  await sleep(1000);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const t = list.find((x) => x.type === 'page' && /index\.html/.test(x.url));
    if (t) ws = new WebSocket(t.webSocketDebuggerUrl);
  } catch (e) { /* not up yet */ }
}
if (!ws) { console.log('no page'); p.kill('SIGKILL'); process.exit(1); }
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
const nm = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-1)[0].replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
function cpuAgg(prof) {
  const byId = new Map(), parent = new Map(), self = new Map(), tot = new Map(), cnt = new Map();
  for (const nd of prof.nodes) { byId.set(nd.id, nd); for (const c of nd.children || []) parent.set(c, nd.id); }
  for (let i = 0; i < prof.samples.length; i++) cnt.set(prof.samples[i], (cnt.get(prof.samples[i]) || 0) + (prof.timeDeltas[i] || 0));
  let all = 0;
  for (const [nid, us] of cnt) {
    all += us; const k = nm(byId.get(nid).callFrame); self.set(k, (self.get(k) || 0) + us);
    const seen = new Set(); let cur = nid;
    while (cur !== undefined) { const kk = nm(byId.get(cur).callFrame); if (!seen.has(kk)) { seen.add(kk); tot.set(kk, (tot.get(kk) || 0) + us); } cur = parent.get(cur); }
  }
  const secs = all / 1e6; const f = (m) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 70).map(([k, v]) => [k, +(v / 1000 / secs).toFixed(2)]);
  // long main-thread stretches (> 30 ms of consecutive samples outside idle / program): what ran in them (inclusive ms by
  // function, top entries), so a single long job step names its own culprit
  const long = []; let cur = null, t = prof.startTime;
  for (let i = 0; i < prof.samples.length; i++) {
    t += prof.timeDeltas[i] || 0; const nd = byId.get(prof.samples[i]); const fnm = nd.callFrame.functionName;
    const busy = !(fnm === '(idle)' || fnm === '(program)' || fnm === '(root)');
    if (busy) { if (!cur) cur = { t0: t, t1: t, n: new Map() }; cur.t1 = t; const seen = new Set(); let c = nd.id; while (c !== undefined) { const kk = nm(byId.get(c).callFrame); if (!seen.has(kk)) { seen.add(kk); cur.n.set(kk, (cur.n.get(kk) || 0) + (prof.timeDeltas[i] || 0)); } c = parent.get(c); } }
    else if (cur) { if (cur.t1 - cur.t0 > 30000) long.push(cur); cur = null; }
  }
  const longOut = long.sort((x, y) => (y.t1 - y.t0) - (x.t1 - x.t0)).slice(0, 15).map((L) => ({ ms: Math.round((L.t1 - L.t0) / 1000), top: [...L.n].filter(([k]) => !/^\(|pump |frame2 /.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v / 1000)]) }));
  return { secs: +secs.toFixed(1), unit: 'ms per second', self: f(self), total: f(tot), long: longOut };
}
function heapAgg(prof, secs) {
  const agg = new Map(), via = new Map(); let tot = 0;
  const walk = (nd, chain) => { const k = nm(nd.callFrame); agg.set(k, (agg.get(k) || 0) + nd.selfSize); tot += nd.selfSize;
    if (nd.selfSize) { const c = chain.filter((x) => !/three\.module|\(root\)|\(program\)|:0$/.test(x)).slice(-3).join(' < '); const kk = k + ' <= ' + c; via.set(kk, (via.get(kk) || 0) + nd.selfSize); }
    for (const c of nd.children || []) walk(c, chain.concat(k)); };
  walk(prof.head, []);
  const f = (m) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, +(v / 1e6 / (secs || 1)).toFixed(2)]);
  return { totalMB: Math.round(tot / 1e6), unit: secs ? 'MB per second' : 'MB', top: f(agg), via: f(via) };
}
const rep = { segs: {} };
if (o.live) { await send('HeapProfiler.enable'); await send('HeapProfiler.startSampling', { samplingInterval: 1 << 19 }); }
for (const s of segs) {
  console.log('waiting for', s);
  for (;;) { const cur = await ev('game?.bench?.seg?.id || (game?.bench?.done ? "DONE" : "")'); if (cur === s || cur === 'DONE') break; await sleep(200); }
  const t0 = Date.now();
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 250 }); await send('Profiler.start');
  if (o.heap && !o.live) { await send('HeapProfiler.enable'); await send('HeapProfiler.startSampling', { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  for (;;) { const cur = await ev('game?.bench?.seg?.id || ""'); if (cur !== s) break; await sleep(200); }
  const secs = (Date.now() - t0) / 1000;
  rep.segs[s] = { cpu: cpuAgg((await send('Profiler.stop')).result.profile) };
  if (o.heap && !o.live) rep.segs[s].alloc = heapAgg((await send('HeapProfiler.stopSampling')).result.profile, secs);
  console.log(s, 'done', secs.toFixed(1), 's');
}
if (o.live) { for (;;) { if (await ev('!!game?.bench?.done')) break; await sleep(1000); } rep.live = heapAgg((await send('HeapProfiler.stopSampling')).result.profile, 0); }
rep.mem = await ev('JSON.stringify({ heapMB: Math.round(performance.memory.usedJSHeapSize/1048576), totalMB: Math.round(performance.memory.totalJSHeapSize/1048576), geo: game.renderer.info.memory })');
rep.updaters = await ev('JSON.stringify(game.updaters.map((u, i) => [i, u.name, String(u).slice(0, 120)]))');
fs.writeFileSync(out, JSON.stringify(rep, null, 1));
console.log('wrote', out);
p.kill('SIGTERM'); await sleep(1500); try { p.kill('SIGKILL'); } catch (e) { /* gone */ }
process.exit(0);
