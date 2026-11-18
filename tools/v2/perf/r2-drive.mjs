#!/usr/bin/env node
// r2-perf hitch hunt: the camera drives the road graph from Nico's spawn to downtown (shortest path, Dijkstra) in --secs
// seconds at street height, like the player's car. Every frame over --hitch ms (default 100) is logged with its cause:
//   per-system CPU of that frame (main.js spike profiler), new shader programs / textures / geometries created in it,
//   the gap outside the frame's own work (GC, idle-callback streaming, timers), JS heap drop (a major GC), long tasks.
// Plus: a CPU sampling profile of the whole drive (self / inclusive, GC share). One muted 1920x1080 session.
//   node tools/v2/perf/r2-drive.mjs [--secs 120] [--to 407,-110] [--hitch 100] [--q "&flag=1"] [--set name] [--init "js"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'drive';
const SECS = +(o.secs || 120), HITCH = +(o.hitch || 100);
const TO = (o.to || '407,-110').split(',').map(Number);
const PROF = fs.readFileSync(new URL('./r2-prof.page.js', import.meta.url), 'utf8');
const rep = { set: SET, q: o.q || '', when: new Date().toISOString() };
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 900) }, async (b) => {
  // --heap: sampling heap profiler from the first byte (live allocations by call site at the end of the drive)
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  if (o.heap) { await b.send('HeapProfiler.enable'); await b.send('HeapProfiler.startSampling', { samplingInterval: 262144 }); }
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; game.quality.set('${o.preset || 'high'}', { manual: true }); return 1; })()`);
  console.log(await b.eval(PROF));
  if (o.init) console.log('init', await b.eval(o.init));
  // program stall attribution: time every GL call that waits for a program link, per GL program handle
  await b.eval(`(() => { const gl = game.renderer.getContext(); const st = window.__r2pc = { on: false, ms: new Map(), first: new Map() };
    for (const fn of ['getProgramInfoLog', 'getProgramParameter', 'getActiveUniform', 'getUniformLocation', 'getActiveAttrib', 'getShaderInfoLog', 'getShaderParameter']) {
      const f0 = gl[fn].bind(gl);
      gl[fn] = function (p, ...rest) { if (!st.on) return f0(p, ...rest); const t = performance.now(); try { return f0(p, ...rest); } finally { const d = performance.now() - t; if (d > 0.5) { st.ms.set(p, (st.ms.get(p) || 0) + d); if (!st.first.has(p)) st.first.set(p, performance.now()); } } };
    } return 1; })()`);
  // shortest road path spawn -> target
  const plan = JSON.parse(await b.eval(`(() => {
    const G = game.city.roadGraph, P = game.player.position;
    const n0 = G.nearestEdge(P.x, P.z, {}, 3000).edge.a, n1 = G.nearestEdge(${TO[0]}, ${TO[1]}, {}, 3000).edge.a;
    const len = (e) => { let s = 0; for (let i = 1; i < e.pts.length; i++) s += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]); return s; };
    const N = G.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const heap = [[0, n0]]; dist[n0] = 0;
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, c = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (c < heap.length && heap[c][0] < heap[m][0]) m = c; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
    while (heap.length) { const [d, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === n1) break;
      for (const k of G.nodes[u].edges) { const e = G.edges[k]; if (e.oneway && e.a !== u) continue; const v = e.a === u ? e.b : e.a; const nd = d + len(e) * (e.kind === 'motorway' || e.kind === 'trunk' ? 0.7 : e.kind === 'residential' ? 1.3 : 1); if (nd < dist[v]) { dist[v] = nd; prev[v] = k; push([nd, v]); } } }
    if (!done[n1]) return JSON.stringify({ error: 'no path' });
    const edges = []; for (let v = n1; v !== n0;) { const k = prev[v]; edges.push(k); const e = G.edges[k]; v = e.a === v ? e.b : e.a; } edges.reverse();
    const pts = []; let node = n0;
    for (const k of edges) { const e = G.edges[k], fwd = e.a === node, ep = fwd ? e.pts : [...e.pts].reverse(), ey = e.y ? (fwd ? [...e.y] : [...e.y].reverse()) : ep.map(() => 0);
      for (let i = pts.length ? 1 : 0; i < ep.length; i++) pts.push([ep[i][0], ey[i] || 0, ep[i][1]]); node = fwd ? e.b : e.a; }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    const at = (s) => { let lo = 1, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; } const i = Math.max(1, lo); const u = Math.min(1, Math.max(0, (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1))); const p = pts[i - 1], q = pts[i]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; };
    window.__drv = { at, len: cum[cum.length - 1] };
    return JSON.stringify({ from: [Math.round(P.x), Math.round(P.z)], len: Math.round(cum[cum.length - 1]), edges: edges.length }); })()`));
  console.log('route', JSON.stringify(plan));
  rep.route = plan;
  if (plan.error) return;
  const speed = plan.len / SECS;
  await b.sleep(4000);
  // sampling profile of the whole drive
  await b.send('Profiler.enable'); await b.send('Profiler.setSamplingInterval', { interval: 500 }); await b.send('Profiler.start');
  const res = await b.eval(`new Promise((res) => { const D = window.__drv; const t0 = performance.now();
    const ri = game.renderer.info; const progs0 = ri.programs.length; const progSet0 = new Set(ri.programs); window.__r2pc.on = true;
    game.cameraOverride = (dt, cam) => { const s = Math.min(D.len, (performance.now() - t0) / 1000 * ${speed}); const p = D.at(s), q = D.at(Math.min(D.len, s + 30)); cam.position.set(p[0], p[1] + 1.5, p[2]); cam.lookAt(q[0], q[1] + 1.2, q[2]); return true; };
    // the player follows the camera (streaming focus, colliders, traffic and peds around it), as if driving
    const ts = [], hitches = []; let last = performance.now(), lastSp = null, heapPrev = performance.memory ? performance.memory.usedJSHeapSize : 0, progPrev = progs0, texPrev = ri.memory.textures, geoPrev = ri.memory.geometries;
    const lt0 = (game.perf.longTasks || []).length;
    let tp = 0;
    const f = () => { const n = performance.now(); const dt = n - last; last = n; ts.push(dt);
      const s = Math.min(window.__drv.len, (n - t0) / 1000 * ${speed}); const p = window.__drv.at(s);
      if ((tp += dt) > 250) { tp = 0; try { game.teleport(p[0], undefined, p[2]); } catch (e) { /* */ } }
      const heap = performance.memory ? performance.memory.usedJSHeapSize : 0, dHeap = (heap - heapPrev) / 1048576; heapPrev = heap;
      const progs = ri.programs.length, tex = ri.memory.textures, geo = ri.memory.geometries;
      if (dt > ${HITCH}) { const sp = (game.perf.spikes || [])[game.perf.spikes.length - 1];
        hitches.push({ t: +((n - t0) / 1000).toFixed(1), ms: Math.round(dt), at: [Math.round(p[0]), Math.round(p[2])], work: sp && sp !== lastSp ? sp.work : null, top: sp && sp !== lastSp ? sp.top : null,
          newProgs: progs - progPrev, newTex: tex - texPrev, newGeo: geo - geoPrev, heapDropMB: dHeap < -8 ? Math.round(dHeap) : 0, calls: ri.render.calls }); lastSp = sp; }
      progPrev = progs; texPrev = tex; geoPrev = geo;
      if (n - t0 < ${SECS * 1000}) requestAnimationFrame(f); else { game.cameraOverride = null; ts.shift(); const so = ts.slice().sort((x, y) => x - y);
        res(JSON.stringify({ frames: ts.length, med: +so[so.length >> 1].toFixed(1), p90: +so[Math.floor(so.length * 0.9)].toFixed(1), p99: +so[Math.floor(so.length * 0.99)].toFixed(1), max: Math.round(so[so.length - 1]),
          over50: ts.filter((x) => x > 50).length, over100: ts.filter((x) => x > 100).length, over250: ts.filter((x) => x > 250).length, fpsAvg: +(1000 * ts.length / ts.reduce((a, c) => a + c, 0)).toFixed(1),
          newProgramsTotal: ri.programs.length - progs0, hitches,
          progStalls: (() => { window.__r2pc.on = false; const byH = new Map(ri.programs.map((p) => [p.program, p])); const old = [...progSet0];
            const rows = []; for (const [h, ms] of window.__r2pc.ms) { const p = byH.get(h); if (!p) continue; const key = String(p.cacheKey); const parts = key.split(',');
              // nearest program of the same name that existed before the drive: which cache-key parts differ
              let best = null, bd = 1e9; for (const q of old) { if (q.name !== p.name) continue; const qp = String(q.cacheKey).split(','); let d = 0; const n = Math.max(qp.length, parts.length); const diff = []; for (let i = 0; i < n; i++) if (qp[i] !== parts[i]) { d++; if (diff.length < 6) diff.push(i + ':' + String(qp[i]).slice(0, 40) + '->' + String(parts[i]).slice(0, 40)); } if (d < bd) { bd = d; best = diff; } }
              rows.push({ ms: Math.round(ms), name: p.name, isNew: !progSet0.has(p), keyLen: parts.length, nearestSameName: best ? bd : null, diff: best }); }
            rows.sort((x, y) => y.ms - x.ms); const byName = {}; for (const r2 of rows) { const k = r2.name; (byName[k] ||= [0, 0]); byName[k][0]++; byName[k][1] += r2.ms; }
            return { total: Math.round(rows.reduce((a, c) => a + c.ms, 0)), n: rows.length, byName: Object.entries(byName).sort((x, y) => y[1][1] - x[1][1]).slice(0, 30), top: rows.slice(0, 40) }; })(), longTasks: (game.perf.longTasks || []).slice(lt0).sort((x, y) => y.ms - x.ms).slice(0, 15),
          sys: Object.fromEntries(Object.entries(game.perf.sysAvg || {}).filter(([, v]) => v > 0.3).sort((x, y) => y[1] - x[1]).slice(0, 16).map(([k, v]) => [k, +v.toFixed(2)])), stream: game.city.streamer.stats })); } };
    requestAnimationFrame(f); })`, (SECS + 120) * 1000);
  const pr = (await b.send('Profiler.stop')).result.profile;
  rep.drive = JSON.parse(res);
  // profile: self / inclusive shares + GC
  const nodes = new Map(pr.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of pr.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const cnt = new Map(); for (const sId of pr.samples) cnt.set(sId, (cnt.get(sId) || 0) + 1);
  const total = pr.samples.length, self = {}, incl = {};
  const nm = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0].split('?')[0]}:${n.callFrame.lineNumber + 1}`;
  for (const [sid, c] of cnt) { const n = nodes.get(sid); self[nm(n)] = (self[nm(n)] || 0) + c; const seen = new Set(); for (let x = sid; x !== undefined; x = parent.get(x)) { const k = nm(nodes.get(x)); if (!seen.has(k)) { seen.add(k); incl[k] = (incl[k] || 0) + c; } } }
  const topN = (m, k) => Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, k).map(([f, c]) => `${(100 * c / total).toFixed(1).padStart(5)}%  ${f}`);
  // inclusive shares restricted to samples under a given frame (e.g. the tile streamer's job runner)
  const under = (re) => { const m = {}; let tot = 0; for (const [sid, c] of cnt) { const stack = []; for (let x = sid; x !== undefined; x = parent.get(x)) stack.push(nm(nodes.get(x))); if (!stack.some((f) => re.test(f))) continue; tot += c; const seen = new Set(); for (const f of stack) if (!seen.has(f)) { seen.add(f); m[f] = (m[f] || 0) + c; } } return { totalPct: +(100 * tot / total).toFixed(1), top: Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 60).map(([f, c2]) => `${(100 * c2 / Math.max(1, tot)).toFixed(1).padStart(5)}%  ${f}`) }; };
  rep.cpuprof = { self: topN(self, 40), incl: topN(incl, 70), inclAll: topN(incl, 400), underRunJobs: under(/^runJobs stream\.js/), underVeg: under(/^update countryside\.js/) };
  console.log('UNDER runJobs (' + rep.cpuprof.underRunJobs.totalPct + '% of CPU):'); for (const l of rep.cpuprof.underRunJobs.top.slice(0, 45)) console.log('   ', l);
  const D = rep.drive;
  console.log('drive', JSON.stringify({ ...D, hitches: undefined, longTasks: undefined }));
  console.log('hitches >', HITCH, 'ms:', D.hitches.length);
  console.log('program link stalls', D.progStalls.total, 'ms over', D.progStalls.n, 'programs');
  for (const r of D.progStalls.byName) console.log('   by name', JSON.stringify(r));
  for (const r of D.progStalls.top.slice(0, 25)) console.log('   ', JSON.stringify(r));
  for (const h of D.hitches.slice().sort((x, y) => y.ms - x.ms).slice(0, 40)) console.log('  ', JSON.stringify(h));
  for (const l of D.longTasks) console.log('  longTask', JSON.stringify(l));
  console.log('CPU self:'); for (const l of rep.cpuprof.self.slice(0, 30)) console.log('   ', l);
  console.log('CPU incl:'); for (const l of rep.cpuprof.incl.slice(0, 50)) console.log('   ', l);
  rep.heapNow = JSON.parse(await b.eval('JSON.stringify(performance.memory ? { usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576), totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576), limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576) } : null)'));
  console.log('heap', JSON.stringify(rep.heapNow));
  if (o.heap) {
    const hp = (await b.send('HeapProfiler.getSamplingProfile')).result.profile;
    const bySite = {}, byFn = {};
    const walk = (n, stack) => { const cf = n.callFrame, f = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-1)[0].split('?')[0]}:${cf.lineNumber + 1}`; const st2 = [...stack, f];
      if (n.selfSize) { bySite[st2.slice(-3).join(' < ')] = (bySite[st2.slice(-3).join(' < ')] || 0) + n.selfSize; byFn[f] = (byFn[f] || 0) + n.selfSize; }
      for (const c of n.children || []) walk(c, st2); };
    walk(hp.head, []);
    const top = (m) => Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 30).map(([k, v]) => `${(v / 1048576).toFixed(1).padStart(8)} MB  ${k}`);
    rep.heap = { byFn: top(byFn), bySite: top(bySite) };
    console.log('HEAP live by function:'); for (const l of rep.heap.byFn) console.log('   ', l);
    console.log('HEAP live by site:'); for (const l of rep.heap.bySite.slice(0, 20)) console.log('   ', l);
  }
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 15);
  if (rep.errors.length) console.log('ERRORS', rep.errors.map((e) => e.slice(0, 200)).join('\n'));
});
fs.writeFileSync(`docs/v2/reports/r2-perf-${SET}.json`, JSON.stringify(rep, null, 1));
