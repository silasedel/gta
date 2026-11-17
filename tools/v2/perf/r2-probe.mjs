#!/usr/bin/env node
// r2-perf probes: collider census around the player (character-controller cost), streamer stats, program / material
// census, static-matrix A/B (matrixAutoUpdate off on unmoving city content). One muted 1920x1080 session.
//   node tools/v2/perf/r2-probe.mjs [--places spawn,beach] [--freeze] [--rounds 3] [--set name]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
import { PLACES } from './places.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'probe';
const only = o.places ? String(o.places).split(',') : ['spawn', 'beach'];
const PROF = fs.readFileSync(new URL('./r2-prof.page.js', import.meta.url), 'utf8');
const PROBE = fs.readFileSync(new URL('./r2-probe.page.js', import.meta.url), 'utf8');
const rep = { set: SET, when: new Date().toISOString(), places: {} };
const J = async (b, expr, t) => JSON.parse(await b.eval(`Promise.resolve(${expr}).then(JSON.stringify)`, t));
const md = (xs) => { const s = xs.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.quality.set('high', { manual: true }); window.__spawn = [game.player.position.x, game.player.position.z, game.player.heading || 0]; return 1; })()`);
  console.log(await b.eval(PROF), await b.eval(PROBE));
  // tileCull.js is parked outside the auto-loader: load it into this page for the A/B (stays off until the A/B turns it on)
  if (o.tilecull) console.log('tileCull', await b.eval(`(async () => { if (!game.tileCull) { const m = await import('/src/render/tileCull.js'); await m.initV2(game); } return !!game.tileCull; })()`));
  if (o.shoretest) {
    // shoreFill.js equivalence: fast fill vs the old per-cell loop on coastal windows (same land mask expected)
    rep.shoretest = JSON.parse(await b.eval(`(async () => {
      const { fillLandFromWater } = await import('/src/world/env/shoreFill.js');
      const D = game.miamiData, iw = (x, z) => game.city.isWater(x, z), out = [];
      for (const [cx, cz] of [[2332, -660], [-836, 5272], [-2386, 2660], [407, -110], [-4895, 5940]]) {
        const cell = 3, W = 400, H = 400, minX = cx - W * cell / 2, minZ = cz - H * cell / 2;
        const a = new Uint8Array(W * H), b2 = new Uint8Array(W * H);
        const t0 = performance.now(); for (const _ of fillLandFromWater(a, W, H, minX, minZ, cell, iw, null)) { /* */ } const tOld = performance.now() - t0;
        const st = {}; const t1 = performance.now(); for (const _ of fillLandFromWater(b2, W, H, minX, minZ, cell, iw, D.isWaterRaw, st)) { /* */ } const tNew = performance.now() - t1;
        let diff = 0, landN = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b2[i]) diff++; landN += a[i]; }
        out.push({ at: [cx, cz], cells: W * H, land: landN, diff, oldMs: Math.round(tOld), newMs: Math.round(tNew), callsNew: st.calls });
      }
      return JSON.stringify(out); })()`, 300000));
    console.log('shoretest', JSON.stringify(rep.shoretest));
  }
  for (const id of only) {
    const s = PLACES[id];
    await b.eval(`(() => { const s = ${JSON.stringify(s)}; game.timeOfDay = s.tod ?? 12; if (s.player) game.teleport(s.player[0], undefined, s.player[1], s.player[2]); else game.teleport(window.__spawn[0], undefined, window.__spawn[1], window.__spawn[2]); return 1; })()`);
    const P = rep.places[id] = { streamArrive: [] };
    for (let i = 0; i < 8; i++) { await b.sleep(1000); P.streamArrive.push(await J(b, 'window.__r2q.stream()')); }
    for (let i = 0; i < 60; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    await b.sleep(2000);
    P.stream = await J(b, 'window.__r2q.stream()');
    P.sys = (await J(b, 'window.__r2p.frames(2000)')).sys;
    P.colliders = await J(b, 'window.__r2q.colliders(6)');
    P.bodies = await J(b, 'window.__r2q.bodies()');
    P.inst = await J(b, 'window.__r2q.instCensus()');
    console.log('  inst', JSON.stringify(P.inst));
    console.log('  bodies', JSON.stringify(P.bodies));
    console.log(`== ${id}`);
    console.log('  stream on arrival', JSON.stringify(P.streamArrive.map((x) => [x.pending, +x.stats.msLast.toFixed(1), JSON.stringify(x.stats.maxStep)])));
    console.log('  stream settled', JSON.stringify(P.stream));
    console.log('  sys', JSON.stringify(P.sys));
    console.log('  colliders', JSON.stringify(P.colliders.byShape), P.colliders.n);
    for (const c of (P.colliders.top || []).slice(0, 12)) console.log('    ', JSON.stringify(c));
    if (id === only[0]) {
      P.programs = await J(b, 'window.__r2q.programs()');
      const pg = P.programs;
      console.log('  materials', pg.materials, 'programs live', pg.programsLive, 'used', pg.programsUsed, 'dup sets', pg.duplicateSets, 'dup materials', pg.duplicateMaterials, 'obc w/o key', pg.onBeforeCompileWithoutKey);
      console.log('  types', JSON.stringify(pg.typeCount));
      for (const d of pg.dupTop.slice(0, 15)) console.log('    dup', JSON.stringify(d));
      for (const d of pg.matsPerProgramTop.slice(0, 10)) console.log('    prog', JSON.stringify(d));
      for (const d of pg.programNames.slice(0, 15)) console.log('    pname', JSON.stringify(d));
      console.log('  obc kinds', JSON.stringify(pg.obcKinds));
    }
    if (o.freeze) {
      P.movers = await J(b, 'window.__r2q.movers(4000)');
      console.log('  movers', JSON.stringify(P.movers));
      const A = [], B = [];
      for (let i = 0; i < +(o.rounds || 3); i++) {
        await b.eval('window.__r2q.freeze(false)'); await b.sleep(500); A.push(await J(b, 'window.__r2p.cpuSplit(2000)'));
        P.frozen = await b.eval('window.__r2q.freeze(true)'); await b.sleep(500); B.push(await J(b, 'window.__r2p.cpuSplit(2000)'));
      }
      await b.eval('window.__r2q.freeze(false)');
      const c = (L) => ({ matrixWorld: md(L.map((x) => x.matrixWorld || 0)), renderPass: md(L.map((x) => x['0:RenderPass'] || 0)), total: md(L.map((x) => x.TOTALcpu || 0)) });
      P.freezeAB = { off: c(A), on: c(B), frozen: P.frozen };
      console.log('  freeze A/B', JSON.stringify(P.freezeAB));
      await b.screenshot(`docs/v2/shots/perf/r2_freeze_${id}_off.png`);
      await b.eval('window.__r2q.freeze(true)'); await b.sleep(300);
      await b.screenshot(`docs/v2/shots/perf/r2_freeze_${id}_on.png`);
      await b.eval('window.__r2q.freeze(false)');
    }
    if (o.tilecull) {
      // hierarchical tile culling A/B (src/render/tileCull.v2.js): CPU split + image noise floor (off vs off) vs (off vs on)
      const A = [], B = [];
      for (let i = 0; i < +(o.rounds || 3); i++) {
        await b.eval('(game.tileCull.on = false, 1)'); await b.sleep(500); A.push(await J(b, 'window.__r2p.cpuSplit(2000)'));
        await b.eval('(game.tileCull.on = true, 1)'); await b.sleep(500); B.push({ ...(await J(b, 'window.__r2p.cpuSplit(2000)')), st: await J(b, 'game.tileCull.stats') });
      }
      const c = (L) => ({ renderPass: md(L.map((x) => x['0:RenderPass'] || 0)), total: md(L.map((x) => x.TOTALcpu || 0)), shadow: md(L.map((x) => x.shadow || 0)) });
      P.tileCullAB = { off: c(A), on: c(B), stats: B[B.length - 1].st };
      const shot = async (on) => { await b.eval(`(game.tileCull.on = ${on}, 1)`); await b.sleep(400); return 'data:image/png;base64,' + (await b.send('Page.captureScreenshot', { format: 'png' })).result.data; };
      const s1 = await shot(false), s2 = await shot(false), s3 = await shot(true);
      await b.eval('(game.tileCull.on = false, 1)');
      P.tileCullAB.diff = JSON.parse(await b.eval(`(async () => { const L = (u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = u; });
        const px = async (u) => { const im = await L(u); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
        const d = (a, b) => { let n = 0, s = 0; for (let i = 0; i < a.length; i += 4) { const v = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); s += v; if (v > 24) n++; } return { meanDiff: +(s / (a.length / 4)).toFixed(3), over24Pct: +(100 * n / (a.length / 4)).toFixed(3) }; };
        const a = await px(${JSON.stringify(s1)}), b2 = await px(${JSON.stringify(s2)}), c3 = await px(${JSON.stringify(s3)});
        return JSON.stringify({ noise: d(a, b2), onVsOff: d(b2, c3) }); })()`));
      console.log('  tileCull A/B', JSON.stringify(P.tileCullAB));
    }
    if (o.farcrowd) {
      const A = [], B = [];
      for (let i = 0; i < +(o.rounds || 3); i++) {
        await b.eval('(game.people.crowd.cfg.enabled = false, 1)'); await b.sleep(1500); A.push(await J(b, 'window.__r2p.frames(2500)'));
        await b.eval('(game.people.crowd.cfg.enabled = true, 1)'); await b.sleep(4000); B.push({ ...(await J(b, 'window.__r2p.frames(2500)')), walkers: await b.eval('game.people.crowd.count') });
      }
      const c = (L) => ({ med: md(L.map((x) => x.med)), work: md(L.map((x) => x.work)), render: md(L.map((x) => x.sys.render || 0)), calls: md(L.map((x) => x.calls)), walkers: md(L.map((x) => x.walkers || 0)) });
      P.farCrowdAB = { off: c(A), on: c(B) };
      console.log('  farCrowd A/B', JSON.stringify(P.farCrowdAB));
    }
    if (o.ae && id === only[0]) {
      // auto-exposure readback A/B: CPU of the frame and the worst frames (the readback stall is periodic)
      const A = [], B = [];
      for (let i = 0; i < +(o.rounds || 3); i++) {
        await b.eval('(game.look3Parts.ae = false, 1)'); await b.sleep(500); A.push(await J(b, 'window.__r2p.frames(2500)'));
        await b.eval('(game.look3Parts.ae = true, 1)'); await b.sleep(500); B.push(await J(b, 'window.__r2p.frames(2500)'));
      }
      const c = (L) => ({ med: md(L.map((x) => x.med)), p95: md(L.map((x) => x.p95)), p99: md(L.map((x) => x.p99)), render: md(L.map((x) => x.sys.render || 0)), work: md(L.map((x) => x.work)) });
      P.aeAB = { off: c(A), on: c(B) };
      console.log('  AE readback A/B', JSON.stringify(P.aeAB));
    }
    fs.writeFileSync(`docs/v2/reports/r2-perf-${SET}.json`, JSON.stringify(rep, null, 1));
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 12); console.log('ERRORS', rep.errors.map((e) => e.slice(0, 200)).join('\n')); }
});
fs.writeFileSync(`docs/v2/reports/r2-perf-${SET}.json`, JSON.stringify(rep, null, 1));
