#!/usr/bin/env node
// FREEZE PROBE (derived from the drive test): records every frame gap > 60 ms, long tasks and long animation frames (with the
// scripts that ran), JS heap every 3 s, while standing still then driving. Report docs/v2/reports/freeze-probe.json.
// Stage 1 job 3 test: a 5-minute drive across the map along the road graph (camera at driver height, 22 m/s).
// Every 0.5 s: a physics ray down from the road center (gap = no collider within 3 m), road surface vs collider height
// (floating / sunk road), streamer backlog of near tiles within 120 m of the camera (pop-in risk), frame time.
// Screenshots every 20 s -> docs/v2/shots/stage1/drive_<n>.png; report -> docs/v2/reports/stage1-drive.json
//   node tools/v2/drive-test.mjs [--secs 300] [--speed 22] [--from x,z]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SECS = +(o.secs || 300), SPEED = +(o.speed || 22);
fs.mkdirSync('docs/v2/shots/stage1', { recursive: true }); fs.mkdirSync('docs/v2/reports', { recursive: true });
const rep = { secs: SECS, speed: SPEED, samples: 0, gaps: [], floating: [], popRisk: [], slowFrames: 0, frameMsAvg: 0, route: [] };
await withBrowser({ width: 1920, height: 1080, maxSeconds: SECS + 600, extraArgs: (process.env.PROBE_ARGS || '').split(' ').filter(Boolean) }, async (b) => {
  if (o.heap) { await b.send('HeapProfiler.enable'); await b.send('HeapProfiler.startSampling', { samplingInterval: 524288 }); }
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 480);
  await startGame(b);
  // build the route in the page: from the start node keep going, preferring the straightest continuation on big roads,
  // never reusing an edge, until the route is long enough for the whole drive
  const from = o.from ? String(o.from).split(',').map(Number) : null;
  const n = await b.eval(`(() => {
    const G = game.city.roadGraph, need = ${SECS * SPEED + 500}; const P = game.player.position;
    const start = ${from ? `{ x: ${from[0]}, z: ${from[1]} }` : 'P'};
    let e = G.nearestEdge(start.x, start.z, {}, 2000).edge, node = e.a, used = new Set(), pts = [], len = 0;
    const rank = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1 };
    for (let guard = 0; guard < 4000 && len < need; guard++) {
      used.add(e.id); const fwd = e.a === node; const ep = fwd ? e.pts : [...e.pts].reverse(); const ey = fwd ? [...e.y] : [...e.y].reverse();
      for (let i = pts.length ? 1 : 0; i < ep.length; i++) { pts.push([ep[i][0], ey[i] || 0, ep[i][1]]); if (pts.length > 1) { const p = pts[pts.length - 2], q = pts[pts.length - 1]; len += Math.hypot(q[0] - p[0], q[2] - p[2]); } }
      node = fwd ? e.b : e.a; const nd = G.nodes[node];
      const a2 = ep[ep.length - 2], a3 = ep[ep.length - 1]; const dx = a3[0] - a2[0], dz = a3[1] - a2[1], dl = Math.hypot(dx, dz) || 1;
      let best = null;
      for (const k of nd.edges) { const f = G.edges[k]; if (used.has(f.id) || (f.oneway && f.a !== node)) continue;
        const fp = f.a === node ? f.pts : [...f.pts].reverse(); const ex = fp[1][0] - fp[0][0], ez = fp[1][1] - fp[0][1], el = Math.hypot(ex, ez) || 1;
        const straight = (dx * ex + dz * ez) / (dl * el); const sc = straight * 2 + (rank[f.kind] || 0) * 0.35 + Math.random() * 0.6;
        if (!best || sc > best[0]) best = [sc, f]; }
      if (!best) { const k = nd.edges.find((k) => !used.has(G.edges[k].id)); if (k === undefined) break; best = [0, G.edges[k]]; }
      e = best[1];
    }
    window.__route = pts; window.__routeLen = len; return pts.length; })()`);
  rep.routePoints = n; rep.routeLen = await b.eval('Math.round(window.__routeLen)');
  // drive: the camera follows the route by time; samples run from the page clock
  await b.eval(`(() => { const R = window.__route, cum = [0]; for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][2] - R[i - 1][2]));
    window.__drive = { t0: performance.now(), cum, R, samples: [], last: performance.now(), ft: [] };
    const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); const p = R[i - 1], q = R[i]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; };
    window.__driveAt = at;
    game.cameraOverride = (dt, cam) => { const D = window.__drive, s = (performance.now() - D.t0) / 1000 * ${SPEED}; const p = at(s), q = at(s + 30);
      cam.position.set(p[0], p[1] + 1.5, p[2]); cam.lookAt(q[0], q[1] + 1.2, q[2]); return true; };
    return 1; })()`);
  const OBS = `(() => { const F = window.__fz = { gaps: [], long: [], loaf: [], heap: [], t0: performance.now() }; let last = performance.now();
    const raf = (t) => { const d = t - last; last = t; if (d > 60) F.gaps.push([Math.round(t - F.t0), Math.round(d)]); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) F.long.push([Math.round(e.startTime - F.t0), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: false }); } catch (e) {}
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.duration < 120) continue; F.loaf.push({ t: Math.round(e.startTime - F.t0), dur: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), scripts: (e.scripts || []).map((x) => ({ d: Math.round(x.duration), f: (x.sourceFunctionName || x.invoker || '').slice(0, 60), u: (x.sourceURL || '').split('/').slice(-2).join('/'), gc: Math.round(x.forcedStyleAndLayoutDuration || 0) })).sort((p, q) => q.d - p.d).slice(0, 4) }); } }).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) {}
    setInterval(() => { const m = performance.memory; if (m) F.heap.push([Math.round((performance.now() - F.t0) / 1000), Math.round(m.usedJSHeapSize / 1e6), Math.round(m.totalJSHeapSize / 1e6)]); }, 3000);
    return 1; })()`;
  await b.eval(OBS);
  if (o.heapalloc) { await b.send('HeapProfiler.enable'); await b.send('HeapProfiler.startSampling', { samplingInterval: 1048576, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  const STILL = +(o.still || 30);
  await b.sleep(STILL * 1000);
  rep.stillGaps = await b.eval('JSON.stringify(window.__fz.gaps.slice())');
  // now drive
  await b.eval(`window.__fz.driveStart = Math.round(performance.now() - window.__fz.t0)`);
  await b.eval(`(() => { window.__drive.t0 = performance.now(); })()`);
  await b.sleep(SECS * 1000);
  rep.fz = JSON.parse(await b.eval('JSON.stringify(window.__fz)'));
  if (o.heap || o.heapalloc) {
    const r = (await b.send('HeapProfiler.stopSampling')).result?.profile; const agg = new Map(); let tot = 0;
    const walk = (n) => { const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-2).join('/')}:${cf.lineNumber}`; agg.set(k, (agg.get(k) || 0) + n.selfSize); tot += n.selfSize; for (const c of n.children || []) walk(c); };
    if (r) walk(r.head);
    rep.alloc = { totalMB: Math.round(tot / 1e6), top: [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v / 1e5) / 10]) };
    // render track: who calls the top allocators (self size by the 3 nearest game-code callers), so library frames
    // (three.js setValueV3f, toArray, iterator next, String.replace) point at the game code behind them
    const topK = new Set(rep.alloc.top.slice(0, 14).map((x) => x[0])); const via = new Map();
    const nm = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).split('/').slice(-2).join('/')}:${cf.lineNumber}`;
    const walk2 = (n, chain) => { const k = nm(n.callFrame); const ch = chain.concat(k);
      if (topK.has(k) && n.selfSize) { const callers = ch.slice(0, -1).filter((x) => !/three\.module|node_modules|\(root\)|\(program\)/.test(x)).slice(-3).join(' < '); const kk = k + '  <=  ' + callers; via.set(kk, (via.get(kk) || 0) + n.selfSize); }
      for (const c of n.children || []) walk2(c, ch); };
    if (r) walk2(r.head, []);
    rep.alloc.via = [...via.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, Math.round(v / 1e5) / 10]);
  }
  rep.perfEnd = await b.eval(`JSON.stringify({ fps: game.perf?.fps, calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles, geo: game.renderer.info.memory.geometries, tex: game.renderer.info.memory.textures })`);
    if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 20);
});
const fz = rep.fz || {};
const big = (fz.gaps || []).filter((g) => g[1] >= 120).sort((x, y) => y[1] - x[1]);
fs.writeFileSync('docs/v2/reports/freeze-probe.json', JSON.stringify({ secs: SECS, perfEnd: rep.perfEnd, driveStart: fz.driveStart, gapsOver60: (fz.gaps || []).length, gapsOver120: big.length, worstGaps: big.slice(0, 15), longTasks: (fz.long || []).length, loaf: (fz.loaf || []).slice(0, 25), heap: fz.heap, stillGaps: rep.stillGaps && JSON.parse(rep.stillGaps).length, errors: rep.errors, alloc: rep.alloc }, null, 1));
console.log(JSON.stringify({ gapsOver60: (fz.gaps || []).length, gapsOver120: big.length, worst: big.slice(0, 8), driveStart: fz.driveStart, heap: (fz.heap || []).filter((_, i) => i % 5 === 0), perfEnd: rep.perfEnd, alloc: rep.alloc, loaf: (fz.loaf || []).slice(0, 4) }));
