#!/usr/bin/env node
// r2-render: frame-time A/B of the image-quality settings at Retina pixel density (headless, device scale 2).
//   node tools/v2/render/perfab.mjs [--tag p1] [--w 1512 --h 945]
// old = High as of this morning (MSAA 2x, 1080p-class DPR, old TAA); new = High now (MSAA 4x, DPR 1.5, renderR2).
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'p1', W = +(o.w || 1512), H = +(o.h || 945);
const MODES = [
  ['old', "game.renderR2=false; const L=game.quality.current; L.look.msaa=2; L.dpr='min'; game.post.fitWindow();"],
  ['new', "game.renderR2=true; const L=game.quality.current; L.look.msaa=4; L.dpr=1.5; game.post.fitWindow();"],
];
const rep = { tag: TAG, size: [W, H], dsf: 2, spots: {}, errors: [] };
await withBrowser({ width: W, height: H, maxSeconds: +(o.max || 1500), extraArgs: ['--force-device-scale-factor=2'] }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 11; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.quality.set?.('high', { manual: true }); return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/s1-perf.page.js', 'utf8'));
  rep.info = await b.eval('JSON.stringify({ q: game.quality.name, dpr: devicePixelRatio })');
  const stream = async (n = 40) => { for (let i = 0; i < n; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 3) break; await b.sleep(1000); } };
  for (const [spot, tp] of [['spawn', null], ['downtown', [407, -110]]]) {
    if (tp) { await b.eval(`game.teleport(${tp[0]}, undefined, ${tp[1]}, 0), 1`); await b.sleep(5000); await stream(); }
    else { await b.sleep(3000); await stream(); }
    const R = rep.spots[spot] = {};
    for (let r = 0; r < 3; r++) for (const [m, js] of MODES) {
      await b.eval(`(() => { ${js} return 1; })()`); await b.sleep(2000);
      const p = JSON.parse(await b.eval('window.__pf.measure(2500).then(JSON.stringify)'));
      const pr = await b.eval('JSON.stringify([game.renderer.getPixelRatio(), game.post.internalSize])');
      (R[m] ||= []).push({ med: p.med, p95: p.p95, gpu: p.gpuMs, render: p.renderMs, cpu: p.work, calls: p.calls, pr });
    }
    const med = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a[a.length >> 1]; };
    for (const m of Object.keys(R)) console.log(spot, m, 'frame', med(R[m].map((x) => x.med)), 'gpu', med(R[m].map((x) => x.gpu)), 'renderCPU', med(R[m].map((x) => x.render)), 'pr', R[m][0].pr);
  }
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
});
fs.writeFileSync(`docs/v2/reports/render-perf-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(rep.errors.length ? 'ERRORS\n' + rep.errors.join('\n') : 'no errors');
