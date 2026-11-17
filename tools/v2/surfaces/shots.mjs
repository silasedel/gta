#!/usr/bin/env node
// Surfaces pass review shots (muted, 1920x1080): cameras placed relative to the nearest road edge at each place, A/B inside ONE
// session (window.__surfaces.set(false/true) toggles the surface shaders without a reload), optional still-camera shimmer check.
//   node tools/v2/surfaces/shots.mjs --set s1 [--only downtown_close,...] [--ab] [--still] [--q "&x=1"]
// -> docs/v2/shots/surfaces/<set>_<id>[_off|_on|_still].png, docs/v2/reports/surfaces-<set>.json (timing, errors, warnings)
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'surf';
const DIR = path.resolve('docs/v2/shots/surfaces'); fs.mkdirSync(DIR, { recursive: true });

// mode: close (1.7 m eye in the lane looking along it toward the curb), stand (1.7 m eye looking down at the pavement 3 m ahead),
// graze (0.6 m eye down the street), walk (on the sidewalk looking down at slabs / curb), aerial (40 m up)
const cam = (x, z, mode, tod, extra = '', off = 0) => ({ tod, eval: `
  const G = game.city.roadGraph, q = G.nearestEdge(${x}, ${z}, {}, 250); if (q) { const e = q.edge, P = e.pts; let bi = 0, bd = 1e9; for (let i = 0; i < P.length - 1; i++) { const d = Math.hypot((P[i][0] + P[i + 1][0]) / 2 - ${x}, (P[i][1] + P[i + 1][1]) / 2 - ${z}); if (d < bd) { bd = d; bi = i; } }
  const a = P[bi], b = P[bi + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, nx = -dz, nz = dx, hw = e.width / 2, mx = (a[0] + b[0]) / 2 + dx * ${off}, mz = (a[1] + b[1]) / 2 + dz * ${off};
  const gy = (X, Z) => game.city.groundHeightAt(X, Z) || 0; const m = '${mode}'; let eye, look;
  if (m === 'close') { eye = [mx + nx * (hw * 0.3) - dx * 6, 0, mz + nz * (hw * 0.3) - dz * 6]; eye[1] = gy(eye[0], eye[2]) + 1.75; look = [mx + nx * (hw * 0.6) + dx * 8, 0, mz + nz * (hw * 0.6) + dz * 8]; look[1] = gy(look[0], look[2]); }
  else if (m === 'stand') { eye = [mx + nx * (hw * 0.4), 0, mz + nz * (hw * 0.4)]; eye[1] = gy(eye[0], eye[2]) + 1.7; look = [mx + nx * (hw * 0.55) + dx * 2.6, 0, mz + nz * (hw * 0.55) + dz * 2.6]; look[1] = gy(look[0], look[2]); }
  else if (m === 'graze') { eye = [mx + nx * (hw * 0.45) - dx * 4, 0, mz + nz * (hw * 0.45) - dz * 4]; eye[1] = gy(eye[0], eye[2]) + 0.6; look = [mx + nx * (hw * 0.45) + dx * 30, 0, mz + nz * (hw * 0.45) + dz * 30]; look[1] = gy(look[0], look[2]) + 0.25; }
  else if (m === 'walk') { eye = [mx + nx * (hw + 2.2) - dx * 3, 0, mz + nz * (hw + 2.2) - dz * 3]; eye[1] = gy(eye[0], eye[2]) + 1.7; look = [mx + nx * (hw + 0.2) + dx * 3, 0, mz + nz * (hw + 0.2) + dz * 3]; look[1] = gy(look[0], look[2]); }
  else { eye = [mx - dx * 45 + nx * 4, 0, mz - dz * 45 + nz * 4]; eye[1] = gy(mx, mz) + 70; look = [mx + dx * 10, gy(mx, mz), mz + dz * 10]; }
  game.teleport(eye[0] - nx * (hw + 6), undefined, eye[2] - nz * (hw + 6), 0); game.cameraOverride = (dt, c) => { c.position.fromArray(eye); c.lookAt(look[0], look[1], look[2]); return true; }; window.__sspot = { e: e.id, kind: e.kind, w: e.width, eye, look }; window.__scam = [eye, look]; }
  ${extra}` });
const RAIN = "game.weather.set('rain', { instant: true });", CLEAR = "game.weather?.set?.('clear', { instant: true });";
const PLACES = { downtown: [407, -110], resid: [-660, 600], keys: [-873.6, 4825.2], rural: [-1540, -2805], highway: [-1900, 4300], beach: [2398, 660], homestead: [-1320, 3190] };
const SPOTS = {};
for (const [k, [x, z]] of Object.entries(PLACES)) { for (const m of ['close', 'stand', 'graze', 'walk', 'aerial']) SPOTS[`${k}_${m}`] = cam(x, z, m, 11, CLEAR); }
for (const k of ['downtown', 'resid', 'keys']) { const [x, z] = PLACES[k]; SPOTS[`${k}_graze_dusk`] = cam(x, z, 'graze', 18.5, CLEAR); SPOTS[`${k}_graze_rain`] = cam(x, z, 'graze', 11, RAIN); SPOTS[`${k}_close_rain`] = cam(x, z, 'close', 11, RAIN); }
const only = o.only ? String(o.only).split(',') : Object.keys(SPOTS);
const rep = { set: SET, when: new Date().toISOString(), shots: {} };

await withBrowser({ width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 1800) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; return 1; })()`);
  for (const id of only) {
    const s = SPOTS[id]; if (!s) { console.log('no spot', id); continue; }
    await b.eval(`(() => { game.timeOfDay = ${s.tod}; game.cameraOverride = null; { ${s.eval} } return 1; })()`);
    await b.sleep(+(o.settle || 3000));
    for (let i = 0; i < +(o.stream || 40); i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    const perf = async () => JSON.parse(await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 2000) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(1), fps: +(1000 / avg).toFixed(1), calls: ri.calls, spot: window.__sspot })); } }; requestAnimationFrame(f); })`));
    const r = {};
    const recam = () => b.eval(`(() => { const c = window.__scam; if (c) game.cameraOverride = (dt, cam) => { cam.position.fromArray(c[0]); cam.lookAt(c[1][0], c[1][1], c[1][2]); return true; }; return 1; })()`);
    await recam();
    if (o.ab) {
      await b.eval('window.__surfaces && window.__surfaces.set(false), 1'); await b.sleep(1500); r.off = await perf(); await b.screenshot(path.join(DIR, `${SET}_${id}_off.png`));
      await b.eval('window.__surfaces && window.__surfaces.set(true), 1'); await b.sleep(1500);
    }
    r.on = await perf(); await b.screenshot(path.join(DIR, `${SET}_${id}${o.ab ? '_on' : ''}.png`));
    if (o.still) { await b.sleep(700); await b.screenshot(path.join(DIR, `${SET}_${id}_still.png`)); }
    rep.shots[id] = r; console.log(id, JSON.stringify(r));
  }
  rep.errors = [...new Set(b.errors)].slice(0, 30); rep.warn = b.logs.filter((l) => /surfaces|shader|THREE\.WebGLProgram/i.test(l)).slice(0, 20);
  if (rep.errors.length) console.log('ERRORS', rep.errors.join('\n')); if (rep.warn.length) console.log('WARN', rep.warn.join('\n'));
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/surfaces-${SET}.json`, JSON.stringify(rep, null, 2));
