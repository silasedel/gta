#!/usr/bin/env node
// Highways track: fixed-camera shots of ramps, interchanges and causeways. V2 test browser only (see browser.mjs).
//   node tools/v2/hw-shots.mjs --set before|after [--only ramp_air,ramp_deck] [--tod 11]
// Writes docs/v2/shots/highways/<set>_<id>.png and docs/v2/reports/highways-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const DIR = path.resolve('docs/v2/shots/highways'); fs.mkdirSync(DIR, { recursive: true });
// eye / look in world metres (+X east, +Z south). 'deck' spots put the eye on the deck surface at the given x, z.
const SPOTS = {
  ramp_air: { eye: [-2470, 34, 880], look: [-2640, 4, 790] },          // US-1 / SR 970 ramps landing downtown (user's screenshot area)
  ramp_low: { eye: [-2520, 4.5, 830], look: [-2700, 6, 805] },         // street level, looking up the ramp
  ramp_deck: { deck: [-2800, 816], dir: [1, 0.05], h: 1.6 },           // driver's eye on the ramp deck, heading east / down
  jt_deck: { deck: [-700, -3492], dir: [1, 0.015], h: 1.6 },            // Julia Tuttle Causeway, eastbound deck
  jt_air: { eye: [-1300, 70, -3200], look: [200, 4, -3500] },         // Julia Tuttle from above the bay
  macarthur: { eye: [-900, 40, -250], look: [0, 2, 120] },             // MacArthur over the restored Watson run
};
const HIDE = `(() => { game.timeExternal = true; game.timeOfDay = ${o.tod || 11}; if (!window.__hw) { window.__hw = document.createElement('style'); window.__hw.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__hw); } return true; })()`;
const CAM = (s) => `(() => { const s = ${JSON.stringify(s)}, C = game.city; let eye, look;
  if (s.deck) { const [x, z] = s.deck, L = Math.hypot(s.dir[0], s.dir[1]), dx = s.dir[0] / L, dz = s.dir[1] / L; const y = C.groundHeightAt(x, z, 60);
    eye = [x, (Number.isFinite(y) ? y : 0) + s.h, z]; const y2 = C.groundHeightAt(x + dx * 80, z + dz * 80, 60); look = [x + dx * 80, (Number.isFinite(y2) ? y2 : 0) + s.h * 0.8, z + dz * 80]; }
  else { eye = s.eye; look = s.look; }
  game.cameraOverride = (dt, cam) => { cam.position.fromArray(eye); cam.lookAt(look[0], look[1], look[2]); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; };
  return JSON.stringify({ eye: eye.map((v) => +v.toFixed(1)), street: C.streetNameAt(eye[0], eye[2]) }); })()`;
const SETTLED = `(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`;
const rep = { set: SET, when: new Date().toISOString(), shots: {} };
await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await b.eval(HIDE);
  for (const id of Object.keys(SPOTS).filter((k) => !o.only || String(o.only).split(',').includes(k))) {
    const s = SPOTS[id], p = s.deck || [s.eye[0], s.eye[2]];
    let info = null;
    for (let attempt = 0; attempt < 3 && !info; attempt++) { // the dev server hot-reloads while other agents edit: re-wait and retry
      try {
        await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480); await b.eval(HIDE);
        const t0 = await b.eval('performance.timeOrigin');
        await b.eval(`game.teleport(${p[0]}, null, ${p[1]}, 0) || true`); await b.eval(HIDE);
        await b.sleep(2500); await b.waitFor(SETTLED, 90).catch(() => {}); await b.sleep(1500);
        const r = JSON.parse(await b.eval(CAM(s))); await b.sleep(+(o.settle || 3000));
        if ((await b.eval('performance.timeOrigin')) !== t0 || !(await b.eval("typeof game !== 'undefined' && !!game.cameraOverride"))) throw new Error('page reloaded');
        info = r;
      } catch (e) { console.log(id, 'retry', attempt, String(e.message).slice(0, 120)); await b.sleep(5000); }
    }
    if (!info) continue;
    rep.shots[id] = info; console.log(id, JSON.stringify(info), 'SHOT', await b.screenshot(path.join(DIR, `${SET}_${id}.png`)));
  }
  if (o.eval) console.log('EVAL', await b.eval(o.eval));
  await b.eval('game.cameraOverride = null; true');
  if (b.errors.length) rep.consoleErrors = [...new Set(b.errors)].slice(0, 20);
});
fs.writeFileSync(path.resolve(`docs/v2/reports/highways-${SET}.json`), JSON.stringify(rep, null, 1));
console.log('errors', rep.consoleErrors || 'none');
