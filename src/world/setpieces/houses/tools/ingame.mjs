#!/usr/bin/env node
// In-game shots and measurements for the houses track (isolated test browser, see tools/v2/browser.mjs).
//   node src/world/setpieces/houses/tools/ingame.mjs [--nohouses] [--shots a,b,c] [--out docs/v2/shots/houses]
// Shots: street (Pelican Point Lane from the road), highway, night, distA, distB. Prints houses stats, fps, draw calls, triangles.
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../../../tools/v2/browser.mjs';
const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const OUT = o.out || 'docs/v2/shots/houses', tag = o.nohouses ? 'before_' : '';
const shots = String(o.shots || 'street,highway,night,distA,distB').split(',');
const SPOTS = {
  street: { hour: 9.5, eye: [-6334, 1.75, 12446.5], look: [-6398, 3.2, 12424] },
  highway: { hour: 16.5, eye: [-6300, 2.2, 12420], look: [-6352, 3.5, 12560] },
  night: { hour: 21.3, eye: [-6334, 1.75, 12446.5], look: [-6398, 3.2, 12424] },
  distA: { hour: 10.5, at: [700, -1100] },
  distB: { hour: 15.5, at: [2900, 700] },
};
const stage = (s) => `(async () => {
  const s = ${JSON.stringify(s)}; game.timeExternal = true; if (game.time) game.time.paused = true; game.timeOfDay = s.hour;
  const V3 = game.camera.position.constructor; const eye = new V3(), look = new V3();
  if (s.at) {
    game.teleport(s.at[0], null, s.at[1], 0);
    for (let i = 0; i < 160; i++) { await new Promise((r) => setTimeout(r, 250)); const n = game.lots.near(s.at[0], s.at[1], 160).filter((l) => l.source === 'map'); if (n.length > 6 && game.city.streamer.pending() === 0) break; }
    const n = game.lots.near(s.at[0], s.at[1], 160).filter((l) => l.source === 'map'); if (!n.length) return 'no lots';
    n.sort((p, q) => Math.hypot(p.x - s.at[0], p.z - s.at[1]) - Math.hypot(q.x - s.at[0], q.z - s.at[1]));
    const L = n[0], fx = Math.sin(L.heading), fz = Math.cos(L.heading), rx = Math.cos(L.heading), rz = -Math.sin(L.heading), gy = L.y || 0;
    eye.set(L.x + fx * (L.d / 2 + Math.min(10, L.roadGap + 5)) + rx * 9, gy + 1.8, L.z + fz * (L.d / 2 + Math.min(10, L.roadGap + 5)) + rz * 9); look.set(L.x - rx * 4, gy + 3, L.z - rz * 4);
    game.teleport(eye.x + fx * 4 + rx * 3, null, eye.z + fz * 4 + rz * 3, 0);
    window.__spot = { lot: L.id, style: L.style, district: game.city.districtAt(L.x, L.z) };
  } else { game.teleport(s.eye[0] + 2, null, s.eye[2] + 2, 0); eye.fromArray(s.eye); look.fromArray(s.look); window.__spot = { district: game.city.districtAt(s.eye[0], s.eye[2]) }; }
  game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; };
  if (!window.__css) { window.__css = document.createElement('style'); window.__css.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__css); }
  return true; })()`;
const MEASURE = `new Promise((res) => { const ri = game.renderer.info, out = { calls: [], tris: [] }; let n = 0;
  const tick = () => { out.calls.push(ri.render.calls); out.tris.push(ri.render.triangles); if (++n < 40) setTimeout(tick, 120); else res({ fps: +(game.perf?.fps ?? 0).toFixed(1), calls: Math.round(out.calls.reduce((a, b) => a + b) / n), callsMax: Math.max(...out.calls), trisM: +(out.tris.reduce((a, b) => a + b) / n / 1e6).toFixed(2), houses: game.houses?.stats?.(), spot: window.__spot }); }; tick(); })`;
const res = {};
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute&menu=0' + (o.nohouses ? '&nohouses' : ''));
  await b.waitFor(GAME_READY, 420);
  await b.sleep(3000); await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(2500);   // past the title screen if it shows
  for (const id of shots) {
    const st = await b.eval(stage(SPOTS[id]), 90000); if (st !== true) console.log('stage', id, st);
    await b.sleep(2000); try { await b.waitFor('game.city.streamer.pending() === 0', 60); } catch (e) { console.log('not settled', id); }
    await b.sleep(+(o.settle || 5000));
    await b.eval(`document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove()); true`);
    const f = `${OUT}/${tag}${id}.png`; fs.mkdirSync(OUT, { recursive: true }); await b.screenshot(f);
    res[id] = await b.eval(MEASURE); console.log(id, f, JSON.stringify(res[id]));
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 12).join('\n'));
});
if (o.json) fs.writeFileSync(o.json, JSON.stringify(res, null, 1));
