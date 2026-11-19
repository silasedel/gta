#!/usr/bin/env node
// Whole-map audit (user, Nov 18: "make a really good system to go all around the map"; fix systems, not spots).
//   node tools/v2/map-audit.mjs --set before [--areas 18] [--r 110] [--shots 3] [--noshots] [--only bridge,bld] [--q "&foo=1"]
// 1. global data checks over the WHOLE map (no streaming needed): elevated roads / bridges (road flat on water, deck dipping
//    into the water, steps and kinks, decks ending in the air, water between twin decks) and map buildings over water;
// 2. walks the map: teleports to N area centres spread over the road network (farthest-point sampling) plus named spots
//    (Nico's lot, Keys bridge ends), waits for streaming and runs the area checks: floating / sunken props and palms, props
//    on carriageways, house lots in water, signs in roads, sign plates off their posts, parked cars in bushes / narrow lanes,
//    hard ground seams (two sand tones, slab cuts) and road edges without the verge blend;
// 3. screenshot crops of the worst findings per class (oblique view from 22 m, finding at the centre, red marker).
// Page side: tools/v2/map-audit.page.js. Output: docs/v2/reports/map-audit-<set>.json, docs/v2/shots/map-audit/<set>/*.jpg.
// Browser only through tools/v2/browser.mjs (machine-wide slots).
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after', NA = +(o.areas ?? 18), R = +(o.r || 110), NSHOT = +(o.shots ?? 3);
const REP = path.resolve('docs/v2/reports'), SHOTS = path.resolve('docs/v2/shots/map-audit', SET);
fs.mkdirSync(REP, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const url = (o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || '');
const t0 = Date.now(), log = (...m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...m);

const HIDE = `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12.5;
  try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(); } catch (e) {}
  if (!window.__maCss) { window.__maCss = document.createElement('style'); window.__maCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__maCss); }
  game.wanted?.clear?.(); if (game.police) game.police.enabled = false; return 1; })()`;

await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 2400) }, async (b) => {
  // other agents save files while we run: block Vite's HMR socket so their edits never hot-reload this page mid-audit
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (String(p).includes('vite-hmr') || /[?&]token=/.test(String(u))) return { readyState: 0, addEventListener() {}, removeEventListener() {}, send() {}, close() {} }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 }); })();` });
  await b.goto(url);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  if (!(await startGame(b))) log('WARN: title did not close');
  await b.eval(HIDE);
  await b.eval(`import('/tools/v2/map-audit.page.js').then((m) => { window.__MA = m; return 1; })`);
  const rep = { set: SET, when: new Date().toISOString(), build: await b.eval('game.miamiData?.build || null'), global: null, areas: [], counts: {}, top: {} };

  // ---- 1. global
  log('global checks...');
  rep.global = JSON.parse(await b.eval(`JSON.stringify(__MA.globalChecks(game))`, 300000));
  log('global', JSON.stringify(rep.global.counts));

  // ---- 2. walk
  const named = JSON.parse(await b.eval(`(() => { const out = []; const n = game.nicoHouse; const p = n?.anchor || n?.origin || n?.pos || n?.position || (game.city.playerSpawn);
    if (p) out.push({ name: 'nico', x: p.x, z: p.z });
    const sp = game.city.playerSpawn; if (sp && (!p || Math.hypot(sp.x - p.x, sp.z - p.z) > 80)) out.push({ name: 'spawn', x: sp.x, z: sp.z });
    return JSON.stringify(out); })()`));
  const areas = NA > 0 ? JSON.parse(await b.eval(`JSON.stringify(__MA.pickAreas(game, ${NA}, ${JSON.stringify(named)}))`)) : named;
  for (const A of areas) {
    A.r = R;
    try {
      await b.eval(`(game.teleport(${A.x}, undefined, ${A.z}, 0), game.cameraOverride = (dt, cam) => { cam.position.set(${A.x}, 60, ${A.z} + 40); cam.lookAt(${A.x}, 0, ${A.z}); return true; }, 1)`);
      await b.sleep(1500);
      for (let i = 0; i < 60; i++) { const ok = await b.eval(`(() => { const s = game.city.streamer; return (!s.readyAround || s.readyAround(${A.x}, ${A.z}, ${R})) && s.pending() < 3; })()`); if (ok) break; await b.sleep(1000); }
      await b.sleep(2500); // dressers / vegetation / parked cars settle
      const r = JSON.parse(await b.eval(`__MA.areaChecks(game, ${JSON.stringify(A)}).then((r) => JSON.stringify(r))`, 240000));
      rep.areas.push({ ...A, counts: r.counts, findings: r.findings });
      log(A.name, A.district, Math.round(A.x), Math.round(A.z), JSON.stringify(r.counts));
    } catch (e) { log('area failed', A.name, String(e.message).slice(0, 160)); rep.areas.push({ ...A, error: String(e.message).slice(0, 300) }); }
  }

  // ---- totals (area findings deduplicated by class + 2 m position; signPlate is global: counted once)
  const all = [...rep.global.findings], seen = new Set();
  for (const A of rep.areas) for (const f of A.findings || []) { const k = f.cls + ':' + Math.round(f.x / 2) + ',' + Math.round(f.z / 2) + (f.global ? 'g' : ''); if (seen.has(k) || (f.global && seen.has(f.cls))) continue; seen.add(k); if (f.global) seen.add(f.cls); all.push(f); }
  for (const f of all) rep.counts[f.cls] = (rep.counts[f.cls] || 0) + (f.cls === 'signPlate' ? f.count : 1);
  rep.all = all;
  const file = path.join(REP, `map-audit-${SET}.json`), save = () => fs.writeFileSync(file, JSON.stringify(rep, null, 1));
  save(); log('COUNTS', JSON.stringify(rep.counts));

  // ---- 3. shots: worst findings per class
  if (!o.noshots && NSHOT > 0) {
    const sev = (f) => f.len || f.cells || f.samples || Math.abs(f.dy || 0) * 10 || f.depth || f.frac || Math.abs(f.kink || 0) || f.gap || 1;
    const by = {}; for (const f of all) if (Number.isFinite(f.x)) (by[f.cls] ||= []).push(f);
    for (const [cls, L] of Object.entries(by)) {
      L.sort((p, q) => sev(q) - sev(p)); const picked = [];
      for (const f of L) { if (picked.length >= NSHOT) break; if (picked.some((q) => Math.hypot(q.x - f.x, q.z - f.z) < 60)) continue; picked.push(f); }
      rep.top[cls] = [];
      for (let k = 0; k < picked.length; k++) { const f = picked[k];
        try {
          const y = await b.eval(`(() => { const h = game.city.groundHeightAt(${f.x}, ${f.z}); return Number.isFinite(h) ? Math.max(h, game.city.seaLevel || 0) : 0; })()`);
          const fy = Number.isFinite(f.y) ? f.y : y, d = /twinGap|deck|roadOnWater|bldWater/.test(cls) ? 45 : 16, hgt = /twinGap|deck|roadOnWater|bldWater/.test(cls) ? 26 : 9;
          await b.eval(`(game.teleport(${f.x}, undefined, ${f.z + 30}, 0), game.cameraOverride = (dt, cam) => { cam.position.set(${f.x + d * 0.6}, ${fy + hgt}, ${f.z + d * 0.8}); cam.lookAt(${f.x}, ${fy}, ${f.z}); return true; }, 1)`);
          await b.sleep(1200);
          for (let i = 0; i < 40; i++) { const ok = await b.eval(`(() => { const s = game.city.streamer; return (!s.readyAround || s.readyAround(${f.x}, ${f.z}, 80)) && s.pending() < 3; })()`); if (ok) break; await b.sleep(1000); }
          await b.sleep(2200);
          const file = path.join(SHOTS, `${cls}_${k + 1}.jpg`);
          await b.screenshot(file, { format: 'jpeg', quality: 82, clip: { x: 160, y: 60, width: 960, height: 600 } });
          rep.top[cls].push({ ...f, shot: path.relative(process.cwd(), file) });
        } catch (e) { log('shot failed', cls, String(e.message).slice(0, 120)); }
      }
      log('shots', cls, rep.top[cls].length); save();
    }
  }
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 30);
  save();
  log('report', path.relative(process.cwd(), file));
});
