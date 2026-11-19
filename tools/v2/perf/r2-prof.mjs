#!/usr/bin/env node
// r2-perf profile: one muted 1920x1080 session, quality pinned (manual), each place visited in turn, streaming settled,
// then: frame times + CPU per system, draw calls / triangles, CPU split of the render call, GPU ms per pass (timer queries
// AND a serialized gl.finish() frame, since ANGLE-Metal timer queries can misreport), resource census (programs, texture
// and geometry MB, physics bodies, peds), per-group submit cost, optional CPU sampling profile, optional street drive.
//   node tools/v2/perf/r2-prof.mjs [--places spawn,keys,downtown,beach,glades,night] [--preset high] [--set name]
//        [--groups] [--cpuprof 4] [--drive 30] [--speed 14] [--shots] [--ab cases.json] [--q "&perf=1"]
// cases.json: [["name", "js on", "js off"], ...]  -> GPU sync + frames measured ABAB at every place
// Writes docs/v2/reports/r2-perf-<set>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
import { PLACES } from './places.mjs';
const SET = o.set || 'run';
const only = o.places ? String(o.places).split(',').filter(Boolean) : Object.keys(PLACES);
const MS = +(o.ms || 2500);
const CASES = o.ab ? JSON.parse(fs.readFileSync(o.ab, 'utf8')) : [];
const PAGE = fs.readFileSync(new URL('./r2-prof.page.js', import.meta.url), 'utf8');
const rep = { set: SET, when: new Date().toISOString(), preset: o.preset || 'high', places: {} };
const out = () => {
  fs.mkdirSync('docs/v2/reports', { recursive: true });
  fs.writeFileSync(`docs/v2/reports/r2-perf-${SET}.json`, JSON.stringify(rep, null, 1));
};
const J = async (b, expr, t) => JSON.parse(await b.eval(`(${expr}).then(JSON.stringify)`, t));

await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 1100) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.quality.set('${o.preset || 'high'}', { manual: true }); window.__spawn = game.player ? [game.player.position.x, game.player.position.z, game.player.heading || 0] : null; return 1; })()`,
  );
  console.log('instrument', await b.eval(PAGE));
  rep.boot = await b.eval(
    'JSON.stringify({ ready: window.BOOT?.ready ?? null, gpu: window.__r2p.gpu })',
  );
  if (o.probe)
    console.log(
      'probe',
      await b.eval(fs.readFileSync(new URL('./r2-probe.page.js', import.meta.url), 'utf8')),
    );
  if (o.tilecull)
    console.log(
      'tileCull',
      await b.eval(
        `(async () => { if (!game.tileCull) { const m = await import('/src/render/tileCull.v2.js'); await m.initV2(game); } return !!game.tileCull; })()`,
      ),
    );
  if (o.init) console.log('init', await b.eval(o.init));
  for (const id of only) {
    const s = PLACES[id];
    if (!s) continue;
    await b.eval(`(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 12; game.cameraOverride = null;
      if (s.player) game.teleport(s.player[0], undefined, s.player[1], s.player[2]); else if (window.__spawn) game.teleport(window.__spawn[0], undefined, window.__spawn[1], window.__spawn[2]); return 1; })()`);
    await b.sleep(+(o.settle || 6) * 1000);
    for (let i = 0; i < 60; i++) {
      const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
      if (q < 3) break;
      await b.sleep(1000);
    }
    await b.sleep(2500);
    const P = (rep.places[id] = {});
    if (o.before) console.log('  before', await b.eval(o.before, 60000));
    if (!CASES.length) {
      P.frames = await J(b, `window.__r2p.frames(${MS})`);
      P.frames2 = await J(b, `window.__r2p.frames(${MS})`);
      P.counts = await J(b, 'Promise.resolve(window.__r2p.counts())');
      P.cpuSplit = await J(b, `window.__r2p.cpuSplit(${MS})`);
      P.gpuQuery = await J(b, `window.__r2p.gpuQuery(${MS})`);
      P.gpuSync = await J(b, `window.__r2p.gpuSync(${MS})`);
      if (o.groups) P.groups = await J(b, `window.__r2p.groups(${MS})`);
      console.log(
        `== ${id}  frame med ${P.frames.med} p95 ${P.frames.p95} | work ${P.frames.work} | calls ${P.frames.calls} tris ${(P.frames.tris / 1e6).toFixed(2)}M | progs ${P.counts.programs} texMB ${P.counts.texMB} geoMB ${P.counts.geoMB} | bodies ${JSON.stringify(P.counts.bodies)} peds ${P.counts.peds} veh ${P.counts.vehicles}`,
      );
      console.log('   sys   ', JSON.stringify(P.frames.sys));
      console.log('   cpu   ', JSON.stringify(P.cpuSplit));
      console.log('   gpuQ  ', JSON.stringify(P.gpuQuery));
      console.log('   gpuS  ', JSON.stringify(P.gpuSync.gpu));
      console.log('   wallS ', JSON.stringify(P.gpuSync.wall));
      if (P.groups)
        for (const g of P.groups.slice(0, 18)) console.log('     grp', JSON.stringify(g));
    } else {
      P.counts = await J(b, 'Promise.resolve(window.__r2p.counts())');
      P.gpuSync = await J(b, `window.__r2p.gpuSync(${MS})`);
      console.log(
        `== ${id}  progs ${P.counts.programs} texMB ${P.counts.texMB} geoMB ${P.counts.geoMB} tex ${JSON.stringify(P.counts.texBySize)}`,
      );
      console.log('   gpuS  ', JSON.stringify(P.gpuSync.gpu));
      console.log('   wallS ', JSON.stringify(P.gpuSync.wall));
      console.log('   cpuS  ', JSON.stringify(P.gpuSync.cpu));
      for (const [name, on, off] of CASES) {
        const A = [],
          B = [];
        for (let i = 0; i < +(o.rounds || 3); i++) {
          await b.eval(`(() => { ${off}; return 1; })()`);
          await b.sleep(600);
          A.push({
            f: await J(b, `window.__r2p.frames(${MS})`),
            g: o.nogpu ? {} : (await J(b, `window.__r2p.gpuSync(${MS})`)).gpu,
          });
          await b.eval(`(() => { ${on}; return 1; })()`);
          await b.sleep(600);
          B.push({
            f: await J(b, `window.__r2p.frames(${MS})`),
            g: o.nogpu ? {} : (await J(b, `window.__r2p.gpuSync(${MS})`)).gpu,
          });
        }
        await b.eval(`(() => { ${off}; return 1; })()`);
        const md = (xs) => {
          const s = xs.slice().sort((p, q) => p - q);
          return s[s.length >> 1];
        };
        const comb = (L) => ({
          med: md(L.map((x) => x.f.med)),
          work: md(L.map((x) => x.f.work)),
          render: md(L.map((x) => x.f.sys.render || 0)),
          calls: md(L.map((x) => x.f.calls)),
          tris: md(L.map((x) => x.f.tris)),
          gpu: md(L.map((x) => x.g.TOTAL)),
          gpuScene: md(
            L.map((x) => Object.entries(x.g).find(([k]) => k.includes('RenderPass'))?.[1] || 0),
          ),
          shadow: md(L.map((x) => x.g.shadow || 0)),
          taa: md(L.map((x) => Object.entries(x.g).find(([k]) => k.includes('TAA'))?.[1] || 0)),
          velRP: md(
            L.map((x) =>
              Object.entries(x.g)
                .filter(([k]) => /unspecified|Object/.test(k))
                .reduce((a, [, v]) => a + v, 0),
            ),
          ),
          step: md(L.map((x) => x.f.sys['world.step'] || 0)),
          player: md(L.map((x) => x.f.sys['fixed:playerFixed'] || 0)),
          peds: md(L.map((x) => x.f.sys.peds || 0)),
          veh: md(L.map((x) => x.f.sys['fixed:vehiclesFixed'] || 0)),
        });
        P[name] = { off: comb(A), on: comb(B) };
        console.log(
          id,
          name.padEnd(16),
          'OFF',
          JSON.stringify(P[name].off),
          '\n',
          ' '.repeat(id.length + 17),
          'ON ',
          JSON.stringify(P[name].on),
        );
      }
    }
    if (o.cpuprof && (o.cpuprofAt ? String(o.cpuprofAt).split(',').includes(id) : true)) {
      await b.send('Profiler.enable');
      await b.send('Profiler.setSamplingInterval', { interval: 250 });
      await b.send('Profiler.start');
      await b.sleep(+o.cpuprof * 1000);
      const pr = (await b.send('Profiler.stop')).result.profile;
      const nodes = new Map(pr.nodes.map((n) => [n.id, n]));
      const parent = new Map();
      for (const n of pr.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const cnt = new Map();
      for (const sId of pr.samples) cnt.set(sId, (cnt.get(sId) || 0) + 1);
      const total = pr.samples.length,
        self = {},
        incl = {};
      const nm = (n) =>
        `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-1)[0].split('?')[0]}:${n.callFrame.lineNumber + 1}`;
      for (const [sid, c] of cnt) {
        const n = nodes.get(sid);
        self[nm(n)] = (self[nm(n)] || 0) + c;
        const seen = new Set();
        for (let x = sid; x !== undefined; x = parent.get(x)) {
          const k = nm(nodes.get(x));
          if (!seen.has(k)) {
            seen.add(k);
            incl[k] = (incl[k] || 0) + c;
          }
        }
      }
      const topN = (m, k) =>
        Object.entries(m)
          .sort((x, y) => y[1] - x[1])
          .slice(0, k)
          .map(([f, c]) => `${((100 * c) / total).toFixed(1).padStart(5)}%  ${f}`);
      P.cpuprof = { total, self: topN(self, 40), incl: topN(incl, 60) };
      console.log('   CPU self');
      for (const l of P.cpuprof.self.slice(0, 25)) console.log('     ' + l);
    }
    if (o.shots) await b.screenshot(`docs/v2/shots/perf/r2_${SET}_${id}.jpg`);
    out();
  }
  if (o.drive) {
    // camera flies a street route from the Keys spot at --speed m/s (street speed); spikes, long tasks, new programs
    const SPEED = +(o.speed || 14),
      SECS2 = +o.drive,
      st = o.driveAt ? o.driveAt.split(',').map(Number) : PLACES.keys.player;
    await b.eval(`(() => { game.cameraOverride = null; game.teleport(${st[0]}, undefined, ${st[1]}, 0); game.timeOfDay = 11;
      const G = game.city.roadGraph, need = ${SECS2 * SPEED + 400};
      let e = G.nearestEdge(${st[0]}, ${st[1]}, {}, 2000).edge, node = e.a, used = new Set(), pts = [], len = 0;
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let guard = 0; guard < 4000 && len < need; guard++) {
        used.add(e.id); const fwd = e.a === node; const ep = fwd ? e.pts : [...e.pts].reverse(); const ey = fwd ? [...e.y] : [...e.y].reverse();
        for (let i = pts.length ? 1 : 0; i < ep.length; i++) { pts.push([ep[i][0], ey[i] || 0, ep[i][1]]); if (pts.length > 1) { const p = pts[pts.length - 2], q = pts[pts.length - 1]; len += Math.hypot(q[0] - p[0], q[2] - p[2]); } }
        node = fwd ? e.b : e.a; const nd = G.nodes[node];
        const a2 = ep[ep.length - 2], a3 = ep[ep.length - 1]; const dx = a3[0] - a2[0], dz = a3[1] - a2[1], dl = Math.hypot(dx, dz) || 1;
        let best = null;
        for (const k of nd.edges) { const f = G.edges[k]; if (used.has(f.id) || (f.oneway && f.a !== node)) continue;
          const fp = f.a === node ? f.pts : [...f.pts].reverse(); const ex = fp[1][0] - fp[0][0], ez = fp[1][1] - fp[0][1], el = Math.hypot(ex, ez) || 1;
          const sc = (dx * ex + dz * ez) / (dl * el) * 2 + rnd() * 0.6; if (!best || sc > best[0]) best = [sc, f]; }
        if (!best) { const k = nd.edges.find((k) => !used.has(G.edges[k].id)); if (k === undefined) break; best = [0, G.edges[k]]; }
        e = best[1];
      }
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
      const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); const p = pts[i - 1], q = pts[i]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; };
      window.__drv = { at }; return Math.round(len); })()`);
    await b.sleep(6000);
    for (let i = 0; i < 40; i++) {
      const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
      if (q < 3) break;
      await b.sleep(1000);
    }
    rep.drive = JSON.parse(
      await b.eval(
        `new Promise((res) => { const D = window.__drv; const t0 = performance.now(); const progs0 = game.renderer.info.programs.length;
      game.cameraOverride = (dt, cam) => { const s = (performance.now() - t0) / 1000 * ${SPEED}; const p = D.at(s), q = D.at(s + 20); cam.position.set(p[0], p[1] + 1.6, p[2]); cam.lookAt(q[0], q[1] + 1.3, q[2]); return true; };
      const ts = []; let last = performance.now(); const sp0 = (game.perf.spikes || []).length; const lt0 = (game.perf.longTasks || []).length;
      const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < ${SECS2 * 1000}) requestAnimationFrame(f); else { game.cameraOverride = null; ts.shift(); const s = ts.slice().sort((x, y) => x - y);
        const spikes = (game.perf.spikes || []).slice(-60).filter((e) => e.gap > 40 || e.work > 40);
        const agg = {}; for (const e of spikes) for (const t of e.top) { const [k, v] = [t.slice(0, t.lastIndexOf(' ')), +t.slice(t.lastIndexOf(' ') + 1)]; (agg[k] ||= { n: 0, ms: 0 }); agg[k].n++; agg[k].ms += v; }
        res(JSON.stringify({ frames: ts.length, med: +s[s.length >> 1].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), p99: +s[Math.floor(s.length * 0.99)].toFixed(2), max: +s[s.length - 1].toFixed(1), over33: ts.filter((x) => x > 33.4).length, over50: ts.filter((x) => x > 50).length, over100: ts.filter((x) => x > 100).length,
          spikeCauses: Object.entries(agg).sort((x, y) => y[1].ms - x[1].ms).slice(0, 12).map(([k, v]) => [k, v.n, Math.round(v.ms)]), worstSpikes: spikes.sort((x, y) => y.gap - x.gap).slice(0, 6), longTasks: (game.perf.longTasks || []).slice(lt0).sort((x, y) => y.ms - x.ms).slice(0, 8), newPrograms: game.renderer.info.programs.length - progs0, sys: game.perf.sysAvg && Object.fromEntries(Object.entries(game.perf.sysAvg).filter(([, v]) => v > 0.3).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => [k, +v.toFixed(2)])) })); } };
      requestAnimationFrame(f); })`,
        (SECS2 + 60) * 1000,
      ),
    );
    console.log('drive', JSON.stringify({ ...rep.drive, worstSpikes: undefined }));
    for (const sp of rep.drive.worstSpikes) console.log('  spike', JSON.stringify(sp));
  }
  if (b.errors.length) {
    rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
    if (rep.errors.length)
      console.log(
        'ERRORS',
        rep.errors
          .slice(0, 6)
          .map((e) => e.slice(0, 240))
          .join('\n'),
      );
  }
});
out();
