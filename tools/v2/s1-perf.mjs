#!/usr/bin/env node
// Stage 1 performance bench: one browser session, quality pinned ('high', manual), each place visited in turn, streaming
// settled, then several measuring windows (median of window medians). Optional A/B toggles measured ABAB in the same
// session at every place. Optional drive case (camera flies a road route at --speed m/s, frame spikes counted).
//   node tools/v2/s1-perf.mjs [--places spawn,downtown,...] [--rounds 4] [--secs 2.5] [--groups] [--ab cases.json]
//        [--drive 40] [--speed 30] [--set name] [--shots]
// cases.json: [["name", "js to turn it on", "js to turn it off"], ...]
// Writes docs/v2/reports/stage1-perf-<set>.json (and shots docs/v2/shots/stage1/perf_<set>_<place>.png with --shots).
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const PLACES = {
  spawn: { player: null, tod: 11 },
  downtown: { player: [407, -110, 0], tod: 15 },
  clewiston: { player: [-1540, -2805, 0], tod: 11 },
  beach: { player: [2332, -660, 0], tod: 13 },
  keywest: { player: [-4895, 5940, 0], tod: 11 },
};
const SET = o.set || 'run';
const only = o.places ? String(o.places).split(',').filter(Boolean) : Object.keys(PLACES);
const ROUNDS = +(o.rounds || 4), SECS = +(o.secs || 2.5);
const CASES = o.ab ? JSON.parse(fs.readFileSync(o.ab, 'utf8')) : [];
const PAGE = fs.readFileSync(new URL('./s1-perf.page.js', import.meta.url), 'utf8');
const rep = { set: SET, when: new Date().toISOString(), places: {} };
const med = (x) => { const s = x.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
function combine(ws) {
  const keys = ['med', 'p95', 'avg', 'renderMs', 'shadowMs', 'gpuMs', 'work', 'calls', 'progSw'];
  const r = {}; for (const k of keys) { const v = ws.map((w) => w[k]).filter((x) => x !== null && x !== undefined); r[k] = v.length ? +med(v).toFixed(2) : null; }
  r.sys = ws[ws.length - 1].sys; r.q = ws[0].q; r.tris = ws[ws.length - 1].tris; r.pending = ws[ws.length - 1].pending;
  if (ws.some((w) => w.groups)) r.groups = ws.find((w) => w.groups).groups;
  return r;
}

await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.quality.set('${o.preset || 'high'}', { manual: true }); window.__spawn = game.player ? [game.player.position.x, game.player.position.z, game.player.heading || 0] : null; return 1; })()`);
  console.log('instrument', await b.eval(PAGE));
  if (o.init) console.log('init', await b.eval(o.init));
  const measure = async (groups) => JSON.parse(await b.eval(`window.__pf.measure(${SECS * 1000}, ${!!groups}).then(JSON.stringify)`));
  for (const id of only) {
    const s = PLACES[id]; if (!s) continue;
    await b.eval(`(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 12; game.cameraOverride = null;
      if (s.player) game.teleport(s.player[0], undefined, s.player[1], s.player[2]); else if (window.__spawn) game.teleport(window.__spawn[0], undefined, window.__spawn[1], window.__spawn[2]); return 1; })()`);
    await b.sleep(+(o.settle || 6) * 1000);
    for (let i = 0; i < 60; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    await b.sleep(3000);
    const P = rep.places[id] = {};
    if (o.after) { P.after = await b.eval(o.after); console.log('  after', P.after); }
    if (!CASES.length) {
      const ws = []; for (let i = 0; i < ROUNDS; i++) ws.push(await measure(o.groups && i === 0));
      P.base = combine(ws);
      console.log(id, JSON.stringify({ ...P.base, sys: undefined, groups: undefined }));
      console.log('  sys', JSON.stringify(P.base.sys));
      if (P.base.groups) for (const g of P.base.groups) console.log('   ', g.join('  '));
    } else {
      for (const [name, on, off] of CASES) {
        const A = [], B = [];
        for (let i = 0; i < ROUNDS; i++) {
          await b.eval(`(() => { ${off}; return 1; })()`); await b.sleep(700); A.push(await measure(false));
          await b.eval(`(() => { ${on}; return 1; })()`); await b.sleep(700); B.push(await measure(false));
        }
        await b.eval(`(() => { ${off}; return 1; })()`);
        const ca = combine(A), cb = combine(B);
        P[name] = { off: ca, on: cb };
        const f = (c) => `med ${c.med} p95 ${c.p95} work ${c.work} render ${c.renderMs} shadow ${c.shadowMs} gpu ${c.gpuMs} calls ${c.calls} sw ${c.progSw} step ${c.sys?.['world.step']} veh ${c.sys?.['fixed:vehiclesFixed']}`;
        console.log(id, name.padEnd(18), 'OFF', f(ca), '| ON', f(cb));
      }
    }
    if (o.gpu) {
      const gp = JSON.parse(await b.eval(`window.__pf.gpuPasses(${(+o.gpu || 3) * 1000}).then(JSON.stringify)`));
      P.gpuPasses = gp; console.log('  gpu', JSON.stringify(gp));
    }
    if (o.hide) {
      // GPU cost of each top-level scene child: hide it, measure the GPU passes, show it again
      const names = JSON.parse(await b.eval(`JSON.stringify(game.scene.children.filter((c) => c.visible).map((c, i) => [i, c === game.city?.root ? 'city' : (c.name || c.type + i)]))`));
      const base = JSON.parse(await b.eval(`window.__pf.gpuPasses(2500).then(JSON.stringify)`));
      P.hide = { base };
      console.log('  hide base', JSON.stringify(base));
      for (const [i, n] of names) {
        if (o.hide !== true && !String(o.hide).split(',').some((x) => n.includes(x))) continue;
        const r = JSON.parse(await b.eval(`(async () => { const c = game.scene.children[${i}]; c.visible = false; await new Promise((r) => setTimeout(r, 400)); const g = await window.__pf.gpuPasses(2500); c.visible = true; return JSON.stringify(g); })()`));
        P.hide[n] = r;
        console.log('  hide', n.padEnd(28), 'TOTAL', r.TOTAL, 'scene', r['0:RenderPass'] ?? r.scene, 'shadow', r.shadow);
      }
    }
    if (o.cpuprof) {
      // sampling CPU profile of the page: self time and inclusive time per function (load-independent shares)
      await b.send('Profiler.enable'); await b.send('Profiler.setSamplingInterval', { interval: 200 });
      await b.send('Profiler.start'); await b.sleep(+o.cpuprof * 1000);
      const pr = (await b.send('Profiler.stop')).result.profile;
      const nodes = new Map(pr.nodes.map((n) => [n.id, n])); const parent = new Map();
      for (const n of pr.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const cnt = new Map(); for (const sId of pr.samples) cnt.set(sId, (cnt.get(sId) || 0) + 1);
      const total = pr.samples.length, self = {}, incl = {};
      const nm = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0].split('?')[0]}:${n.callFrame.lineNumber + 1}`;
      for (const [id, c] of cnt) {
        const n = nodes.get(id); self[nm(n)] = (self[nm(n)] || 0) + c;
        const seen = new Set(); for (let x = id; x !== undefined; x = parent.get(x)) { const k = nm(nodes.get(x)); if (!seen.has(k)) { seen.add(k); incl[k] = (incl[k] || 0) + c; } }
      }
      const idle = (self['(idle) :0'] || 0) + (self['(program) :0'] || 0);
      const top = (m, k) => Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, k).map(([f, c]) => `${(100 * c / total).toFixed(1).padStart(5)}%  ${f}`);
      P.cpuprof = { total, self: top(self, 45), incl: top(incl, 70) };
      console.log('  CPU self (of all samples, idle ' + (100 * (self['(idle) :0'] || 0) / total).toFixed(1) + '%, program ' + (100 * (self['(program) :0'] || 0) / total).toFixed(1) + '%, gc ' + (100 * (self['(garbage collector) :0'] || 0) / total).toFixed(1) + '%)');
      for (const l of P.cpuprof.self) console.log('    ' + l);
      console.log('  CPU inclusive'); for (const l of P.cpuprof.incl) console.log('    ' + l);
      void idle;
    }
    if (o.shots) await b.screenshot(`docs/v2/shots/stage1/perf_${SET}_${id}.png`);
  }
  if (o.drive) {
    // camera flies a road route from Downtown at --speed m/s; spikes counted from rAF intervals
    const SPEED = +(o.speed || 30), SECS2 = +o.drive;
    await b.eval(`(() => { game.cameraOverride = null; game.teleport(407, undefined, -110, 0); game.timeOfDay = 15;
      const G = game.city.roadGraph, need = ${SECS2 * SPEED + 600};
      let e = G.nearestEdge(407, -110, {}, 2000).edge, node = e.a, used = new Set(), pts = [], len = 0;
      const rank = { trunk: 5, motorway: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1 };
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let guard = 0; guard < 4000 && len < need; guard++) {
        used.add(e.id); const fwd = e.a === node; const ep = fwd ? e.pts : [...e.pts].reverse(); const ey = fwd ? [...e.y] : [...e.y].reverse();
        for (let i = pts.length ? 1 : 0; i < ep.length; i++) { pts.push([ep[i][0], ey[i] || 0, ep[i][1]]); if (pts.length > 1) { const p = pts[pts.length - 2], q = pts[pts.length - 1]; len += Math.hypot(q[0] - p[0], q[2] - p[2]); } }
        node = fwd ? e.b : e.a; const nd = G.nodes[node];
        const a2 = ep[ep.length - 2], a3 = ep[ep.length - 1]; const dx = a3[0] - a2[0], dz = a3[1] - a2[1], dl = Math.hypot(dx, dz) || 1;
        let best = null;
        for (const k of nd.edges) { const f = G.edges[k]; if (used.has(f.id) || (f.oneway && f.a !== node)) continue;
          const fp = f.a === node ? f.pts : [...f.pts].reverse(); const ex = fp[1][0] - fp[0][0], ez = fp[1][1] - fp[0][1], el = Math.hypot(ex, ez) || 1;
          const sc = (dx * ex + dz * ez) / (dl * el) * 2 + (rank[f.kind] || 0) * 0.5 + rnd() * 0.4; if (!best || sc > best[0]) best = [sc, f]; }
        if (!best) { const k = nd.edges.find((k) => !used.has(G.edges[k].id)); if (k === undefined) break; best = [0, G.edges[k]]; }
        e = best[1];
      }
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
      const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); const p = pts[i - 1], q = pts[i]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; };
      window.__drv = { at, t0: 0 };
      return Math.round(len); })()`);
    await b.sleep(8000);
    for (let i = 0; i < 60; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    const res = await b.eval(`new Promise((res) => { const D = window.__drv; D.t0 = performance.now(); D.tStart = game.clock.elapsed; const progs0 = new Set(game.renderer.info.programs);
      game.cameraOverride = (dt, cam) => { const s = (performance.now() - D.t0) / 1000 * ${SPEED}; const p = D.at(s), q = D.at(s + 25); cam.position.set(p[0], p[1] + 2.2, p[2]); cam.lookAt(q[0], q[1] + 1.5, q[2]); return true; };
      const ts = []; let last = performance.now(); const t0 = last;
      const big = []; let lastSp = null;
      const f = () => { const n = performance.now(); ts.push(n - last); last = n; { const sp = game.perf.spikes || []; const e = sp[sp.length - 1]; if (e && e !== lastSp) { lastSp = e; if (e.gap > 120 || e.work > 120) big.push(e); } } if (n - t0 < ${SECS2 * 1000}) requestAnimationFrame(f); else { game.cameraOverride = null; ts.shift(); const s = ts.slice().sort((x, y) => x - y);
        res(JSON.stringify({ frames: ts.length, med: +s[s.length >> 1].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), p99: +s[Math.floor(s.length * 0.99)].toFixed(2), max: +s[s.length - 1].toFixed(1), over25: ts.filter((x) => x > 25).length, over50: ts.filter((x) => x > 50).length, avg: +(ts.reduce((a, c) => a + c, 0) / ts.length).toFixed(2), spikes: big.sort((x, y) => y.gap - x.gap).slice(0, 12), longTasks: (game.perf.longTasks || []).slice().sort((x, y) => y.ms - x.ms).slice(0, 8), upd: [1, 13, 27].map((i) => String(game.updaters[i]).slice(0, 160)), newPrograms: game.renderer.info.programs.filter((p) => !progs0.has(p)).map((p) => p.name + ' | ' + String(p.cacheKey).slice(0, 90)), syncCompiles: window.__pf.st.renderProgs.slice(), precompile: game.precompile?.stats || null, tiles: game.city.streamer.tiles.size })); } };
      requestAnimationFrame(f); })`, (SECS2 + 60) * 1000);
    rep.drive = JSON.parse(res);
    if (o.physprobe) { const ps = await b.eval('JSON.stringify(window.__phys || null)'); console.log('  phys', ps); rep.drive.phys = JSON.parse(ps); }
    console.log('drive', JSON.stringify({ ...rep.drive, spikes: undefined }));
    for (const sp of rep.drive.spikes) console.log('  spike', JSON.stringify(sp));
    for (const sp of rep.drive.longTasks) console.log('  longTask', JSON.stringify(sp));
    for (const u of rep.drive.upd) console.log('  upd', u.replace(/\s+/g, ' '));
    console.log('  tiles in streamer map', rep.drive.tiles, ' new programs', rep.drive.newPrograms.length, ' compiled inside a frame (sync)', rep.drive.syncCompiles.length, JSON.stringify(rep.drive.syncCompiles.slice(0, 30)), ' precompile', JSON.stringify(rep.drive.precompile)); for (const p of rep.drive.newPrograms.slice(0, 40)) console.log('   prog', p);
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 20); console.log('ERRORS', rep.errors.slice(0, 8).join('\n')); }
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/stage1-perf-${SET}.json`, JSON.stringify(rep, null, 1));
