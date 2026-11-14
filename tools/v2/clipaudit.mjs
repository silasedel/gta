#!/usr/bin/env node
// Clipping / placement audit (track: clipping sweep). V2 test browser only (see browser.mjs).
//   node tools/v2/clipaudit.mjs --set before|after [--spots dt,lh,...] [--shots] [--noz]
// Walks streamed areas across the map (Miami core, South Beach, causeways, Keys, north land), runs the page audit
// (tools/v2/clipaudit.page.js) in each and writes docs/v2/reports/clipaudit-<set>.json plus a ranked summary.
// --shots: before/after pictures of the 5 worst spots (from clipaudit-before.json) into docs/v2/shots/clipping/<set>_<n>.png
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const REP = path.resolve('docs/v2/reports'); fs.mkdirSync(REP, { recursive: true });
const SHOTS = path.resolve(o.shotdir || 'docs/v2/shots/clipping'); fs.mkdirSync(SHOTS, { recursive: true });
const base = o.url || 'http://127.0.0.1:5200/';
const url = base + '?mute' + (o.q ? '&' + o.q : '');
const R = +(o.r || 150);
// fixed spots; 'cw*' (causeways) and 'north*' are found in the page from the map data
const FIXED = {
  dt: { name: 'Downtown (Flagler)', x: -2420, z: 520 },
  brickell: { name: 'Brickell', x: -2350, z: 1500 },
  lh: { name: 'Little Havana', x: -3639, z: 1095 },
  sb: { name: 'South Beach (Ocean Drive)', x: 3470, z: -80 },
  sbn: { name: 'South Beach north', x: 3300, z: -900 },
  nico: { name: 'Keys: Nico house street', x: -7065, z: 13125 },
  keysbar: { name: 'Keys: bar', x: -7434, z: 14342 },
  keyssign: { name: 'Keys: sign', x: -6283, z: 12306 },
  north0: { name: 'North land: Port Cassia', x: -1521, z: -9186 },
  north1: { name: 'North land: Amaro Landing', x: -7875, z: -9419 },
};
const want = o.spots ? String(o.spots).split(',') : ['dt', 'lh', 'sb', 'nico', 'keysbar', 'cw0', 'cw1', 'north0', 'north1', 'ramp'];
const SETTLED = `(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`;
const HIDE = `(() => { game.timeExternal = true; game.timeOfDay = 11; if (!window.__caCss) { window.__caCss = document.createElement('style'); window.__caCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__caCss); } return true; })()`;

async function settle(b, x, z) {
  await b.eval(`(game.teleport(${x}, null, ${z}, 0), true)`);
  await b.sleep(2500);
  await b.waitFor(SETTLED, 150).catch(() => {});
  await b.waitFor(`(() => { const s = game.city.streamer; return !s.readyAround || s.readyAround(${x}, ${z}, ${R + 20}); })()`, 150).catch(() => console.log('  not fully ready', x, z));
  await b.sleep(1500);
}

const out = { set: SET, url, when: new Date().toISOString(), r: R, spots: {} };
const shotList = [];
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto(url);
  await b.waitFor(GAME_READY, 480);
  await b.eval(HIDE);
  if (o.shots) {
    const prev = JSON.parse(fs.readFileSync(o.worst ? path.resolve(o.worst) : path.join(REP, 'clipaudit-worst.json'), 'utf8'));
    for (let i = 0; i < prev.length; i++) { const w = prev[i];
      await settle(b, w.x, w.z); await b.eval(HIDE);
      await b.eval(`(() => { const T = game.THREE || window.THREE, eye = new T.Vector3(${w.x + 9}, ${(w.y || 0) + 5}, ${w.z + 9}), look = new T.Vector3(${w.x}, ${(w.y || 0) + 1.2}, ${w.z});
        game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); } return true; }; return true; })()`);
      await b.sleep(2500); await b.waitFor(SETTLED, 60).catch(() => {}); await b.sleep(1200);
      console.log('SHOT', await b.screenshot(path.join(SHOTS, `${SET}_${w.id || i + 1}.png`)), w.why);
    }
    await b.eval('game.cameraOverride = null; true');
    return;
  }
  const found = await b.eval(`(() => {
    const rg = game.miamiData?.roadGraph || game.city.roadGraph, cw = [], seen = [];
    for (const e of rg.edges) { if (!/Causeway|Venetian/.test(e.name || '') || e.elevated || e.bridge) continue; const m = e.pts[(e.pts.length / 2) | 0];
      if (seen.some((s) => Math.hypot(s[0] - m[0], s[1] - m[1]) < 1500)) continue; seen.push(m); cw.push({ name: 'Causeway: ' + e.name, x: +m[0].toFixed(1), z: +m[1].toFixed(1) }); }
    const L = game.city.groundClaims ? null : null; const towns = [];
    try { const T = window.__lots || null; } catch (e) { /* */ }
    let ramp = null; for (const e of rg.edges) { if (!e.elevated || !/970|US 1|US-1/.test((e.ref || '') + ' ' + (e.name || ''))) continue; const m = e.pts[(e.pts.length / 2) | 0]; if (Math.hypot(m[0] + 2420, m[1] - 520) < 2500) { ramp = { name: 'Downtown under the US-1 / SR 970 ramps', x: +m[0].toFixed(1), z: +m[1].toFixed(1) }; break; } }
    return { cw: cw.slice(0, 3), ramp };
  })()`);
  const lots = await b.eval(`import('/src/world/setpieces/houses/lots.js').then((M) => M.lots.towns.map((t) => ({ name: 'North land town: ' + (t.name || t.id || '?'), x: +t.x.toFixed(1), z: +t.z.toFixed(1) })).sort((a, b) => a.z - b.z).slice(0, 2))`).catch(() => []);
  const spots = { ...FIXED }; found.cw.forEach((c, i) => { spots['cw' + i] = c; }); if (found.ramp) spots.ramp = found.ramp;
  console.log('spots', JSON.stringify(spots));
  for (const k of want) {
    const S = spots[k]; if (!S) { console.log('skip', k); continue; }
    for (let attempt = 0; attempt < 4; attempt++) { try {
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 300);
      await b.eval(HIDE); await settle(b, S.x, S.z);
      const raw = await b.eval(`import('/tools/v2/clipaudit.page.js?v=${Date.now()}').then((A) => A.auditArea(game, ${JSON.stringify({ ...S, r: R })}, { zfight: ${!o.noz} })).then((r) => JSON.stringify(r), (e) => JSON.stringify({ err: String(e && e.stack || e) }))`, 300000);
      if (typeof raw !== 'string') throw new Error('page reloaded during the audit'); const r = JSON.parse(raw); if (r.err) throw new Error(r.err); if (!r.items && !r.zfightCells) throw new Error('nothing streamed (page reloaded?)');
      await b.eval(`(() => { const T = game.THREE || window.THREE; game.cameraOverride = (dt, cam) => { cam.position.set(${S.x}, 40, ${S.z + 60}); cam.lookAt(${S.x}, 0, ${S.z}); return true; }; return true; })()`);
      r.flap = JSON.parse(await b.eval(`import('/tools/v2/clipaudit.page.js').then((A) => A.flapScan(game, ${JSON.stringify({ ...S, r: R })}, 45)).then((r) => JSON.stringify(r), (e) => JSON.stringify([{ err: String(e && e.stack || e) }]))`, 120000));
      await b.eval('game.cameraOverride = null; true');
      out.spots[k] = r;
      console.log(k, S.name, JSON.stringify({ items: r.items, overlap: r.overlap.length, building: r.building.length, road: r.road.length, ground: r.ground.length, floatDecal: (r.floatDecal || []).length, zfight: r.zfightCells, barricade: r.barricade.length, flap: r.flap.length }));
      break;
    } catch (e) { console.log('retry', k, String(e.message || e).slice(0, 200)); await b.sleep(6000); } }
  }
  if (b.errors.length) out.consoleErrors = [...new Set(b.errors)].slice(0, 20);
});
if (!o.shots) {
  const cats = ['overlap', 'building', 'road', 'ground', 'floatDecal', 'barricade', 'flap'], totals = {}, bySrc = {}, worstAll = [];
  for (const c of cats) totals[c] = 0; totals.zfight = 0;
  for (const [k, r] of Object.entries(out.spots)) {
    for (const c of cats) { r[c] = r[c] || []; totals[c] += r[c].length; for (const it of r[c]) { const s = c + ' :: ' + (it.src || it.srcA + ' x ' + it.srcB); bySrc[s] = (bySrc[s] || 0) + 1; } }
    totals.zfight += r.zfightCells || 0; for (const [p, n] of Object.entries(r.zfightBySrc || {})) bySrc['zfight :: ' + p] = (bySrc['zfight :: ' + p] || 0) + n;
    // hot spots: 20 m cells with the most findings
    const cell = new Map(); for (const c of [...cats, 'zfight']) for (const it of r[c] || []) { const kk = Math.round(it.x / 20) + ',' + Math.round(it.z / 20); const e = cell.get(kk) || { x: it.x, y: it.y || 0, z: it.z, n: 0, why: {} }; e.n += c === 'zfight' ? 0.25 : 1; e.why[c] = (e.why[c] || 0) + 1; cell.set(kk, e); }
    for (const e of cell.values()) worstAll.push({ spot: k, ...e, why: JSON.stringify(e.why) });
  }
  out.totals = totals;
  out.ranked = Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ n, s }));
  worstAll.sort((a, b) => b.n - a.n);
  out.worst = worstAll.slice(0, 12);
  fs.writeFileSync(path.join(REP, `clipaudit-${SET}${o.tag ? '-' + o.tag : ''}.json`), JSON.stringify(out, null, 1));
  if (SET === 'before' && !o.spots) fs.writeFileSync(path.join(REP, 'clipaudit-worst.json'), JSON.stringify(worstAll.slice(0, 5), null, 1));
  console.log('TOTALS', JSON.stringify(totals));
  for (const r of out.ranked.slice(0, 40)) console.log(String(r.n).padStart(6), r.s);
  if (out.consoleErrors) console.log('CONSOLE ERRORS', out.consoleErrors.slice(0, 5));
}
