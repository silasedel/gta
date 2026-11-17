#!/usr/bin/env node
// r2-art material audit: load the game (muted, V2 test browser), stream key places, render fixed views and measure every
// material on screen (coverage, on-screen albedo, roughness, metalness, normal strength, texel density, source), compare
// with the class ranges in src/world/art/ranges.json (docs/v2/briefs/ART_STYLE.md), rank outliers by visibility x severity.
//   node tools/v2/art/audit.mjs [--set base] [--only nico,downtown,beach,rural,airport] [--q "&foo"] [--hour 11] [--cal 0|1]
// Writes docs/v2/reports/art-audit[-<set>].json + .md, view shots docs/v2/shots/art/audit/<set>_<place>_<view>.jpg
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
import { evaluate, writeReport } from './evaluate.mjs';
import { PLACES as BASE_PLACES } from './places.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'base';
const SHOTS = path.resolve('docs/v2/shots/art/audit'); fs.mkdirSync(SHOTS, { recursive: true });
// player position + fixed cameras: [eyeX, eyeHeightAboveGround, eyeZ, lookX, lookHeight, lookZ]; plus 4 generic eye-level
// headings around the player (third-person height) and 2 raised driving-camera views
const PLACES = { ...BASE_PLACES, ...(o.places ? JSON.parse(fs.readFileSync(o.places, 'utf8')) : {}) };
const only = o.only ? String(o.only).split(',') : Object.keys(PLACES);
const page = fs.readFileSync(new URL('./audit.page.js', import.meta.url), 'utf8');
let stats = null; const views = []; let errors = [];
await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); game.lookAEInstant = true; if (game.intros?.places) game.intros.places.length = 0; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); game.timeOfDay = ${+(o.hour || 11)}; return 1; })()`);
  await b.eval(page);
  for (const id of only) {
    const P = PLACES[id]; if (!P) { console.log('no place', id); continue; }
    await b.eval(`(() => { game.cameraOverride = null; game.teleport(${P.p[0]}, undefined, ${P.p[1]}, 0); return 1; })()`);
    await b.sleep(5000);
    for (let i = 0; i < +(o.stream || 60); i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    await b.sleep(2500);
    const cams = { ...P.cams };
    if (P.snap) { const q = await b.eval(`(() => { const G = game.city?.roadGraph; let r = G?.nearestEdge?.(${P.p[0]}, ${P.p[1]}, {}, 300); if (!r || !r.point) r = G?.nearestEdge?.(${P.p[0]}, ${P.p[1]}, 300); return r && r.point ? [r.point.x, r.point.z] : null; })()`); if (q) P.p = q; }
    for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2; cams['eye' + k] = [P.p[0] - Math.sin(an) * 5, 2.1, P.p[1] - Math.cos(an) * 5, P.p[0] + Math.sin(an) * 30, 1.0, P.p[1] + Math.cos(an) * 30]; }
    for (const k of [0, 1]) { const an = Math.PI / 4 + k * Math.PI; cams['drive' + k] = [P.p[0] - Math.sin(an) * 9, 4.2, P.p[1] - Math.cos(an) * 9, P.p[0] + Math.sin(an) * 40, 0.5, P.p[1] + Math.cos(an) * 40]; }
    for (const [cn, c] of Object.entries(cams)) {
      if (P.skip && P.skip.includes(cn)) continue;
      await b.eval(`(() => { const c = ${JSON.stringify(c)}; const g = (x, z) => { try { const v = game.city?.groundHeightAt?.(x, z); return Number.isFinite(v) ? v : 0; } catch (e) { return 0; } };
        const e = [c[0], g(c[0], c[2]) + c[1], c[2]], l = [c[3], g(c[3], c[5]) + c[4], c[5]];
        game.cameraOverride = (dt, cam) => { cam.position.fromArray(e); cam.lookAt(l[0], l[1], l[2]); return true; }; return 1; })()`);
      if (o.cal !== undefined) await b.eval(`(globalThis.__artCal?.(${o.cal !== '0'}) ?? -1)`); // in-session A/B: 0 = library models as imported
      await b.sleep(+(o.settle || 1600));
      const tag = id + ':' + cn;
      const r = await b.eval(`window.__artCover(${JSON.stringify(tag)}, 0.5)`);
      await b.screenshot(path.join(SHOTS, `${SET}_${id}_${cn}.jpg`), { quality: 80 });
      views.push({ ...r, place: id, cam: cn, shot: `docs/v2/shots/art/audit/${SET}_${id}_${cn}.jpg` });
      console.log(tag, JSON.stringify(r));
    }
  }
  stats = await b.eval('window.__artStats()');
  errors = [...new Set(b.errors)].slice(0, 30);
  if (errors.length) console.log('CONSOLE ERRORS\n' + errors.join('\n'));
});
const rep = evaluate(stats, views, { set: SET, errors });
writeReport(rep, SET);
