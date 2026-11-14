#!/usr/bin/env node
// Ground seam audit + matched shots (track: ground-continuity). V2 test browser only (see browser.mjs).
//   node tools/v2/seam-audit.mjs --set after            (the fixed game)
//   node tools/v2/seam-audit.mjs --set before           (same build with ?groundfix=0: the ground-continuity fixes switched off)
// Options: --url http://127.0.0.1:5200/  --noshots  --spots nico,sb,dt,lh,lawn
// Writes docs/v2/reports/seam-audit-<set>.json and docs/v2/shots/ground-continuity/<set>_<shot>.png
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const SHOTS = path.resolve('docs/v2/shots/ground-continuity'); fs.mkdirSync(SHOTS, { recursive: true });
const REP = path.resolve('docs/v2/reports'); fs.mkdirSync(REP, { recursive: true });
const base = o.url || 'http://127.0.0.1:5200/';
const url = base + '?mute' + (SET === 'before' ? '&groundfix=0' : '');

// audit areas (x, z, radius) and the shots taken there. Camera: eye / look in world space, or 'local' = Nico-house frame
const SPOTS = {
  nico: { area: { name: 'Nico house (Pelican Point Lane)', local: [-15, 20], r: 140 }, shots: [
    { id: 'nico_road_end', eyeRoad: { end: [-6386.2, 12427.7], from: [-6312.4, 12452.9], back: 36, up: 3.2, ahead: 0 } },
    { id: 'nico_platform', local: { eye: [-66, 7, 62], look: [-30, 0, 22] } },
    { id: 'nico_overview', local: { eye: [30, 70, 150], look: [-15, 0, -40] } },
    { id: 'nico_shore', local: { eye: [-20, 9, -20], look: [-30, 0, -60] } },
    { id: 'nico_dock', local: { eye: [9, 3.5, -8], look: [1.8, 0, -40] } },
    { id: 'xroad', eye: [-6343, 7, 12442], look: [-6312, 0, 12453] } ] },
  sb: { area: { name: 'South Beach sand strip', x: 3600, z: 300, r: 120 }, shots: [{ id: 'sb_strip', eye: [3570, 18, 270], look: [3605, 0, 300] }, { id: 'sb_shore', shore: [3600, 300] }, { id: 'sb_shore_high', shore: [3600, 300], high: true }] },
  lawn: { area: { name: 'South Beach lawn (Ocean Drive)', x: 3470, z: -80, r: 110 }, shots: [{ id: 'sb_lawn', eye: [3442, 2.2, -95], look: [3530, 0, -70] }] },
  dt: { area: { name: 'Downtown (Flagler)', x: -2420, z: 520, r: 140 }, shots: [{ id: 'downtown', eye: [-2395, 9, 540], look: [-2470, 0, 500] }] },
  lh: { area: { name: 'Little Havana', x: -3639, z: 1095, r: 140 }, shots: [{ id: 'little_havana', eye: [-3600, 22, 1140], look: [-3650, 0, 1085] }] },
};
const want = o.spots ? String(o.spots).split(',') : Object.keys(SPOTS);

const SETTLED = `(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`;
const CAM = (s) => `(() => {
  const s = ${JSON.stringify(s)}, T = game.THREE || window.THREE, eye = new T.Vector3(), look = new T.Vector3();
  const nh = game.nicoHouse, L = (p) => { const g = nh.group; return new T.Vector3(p[0], p[1], p[2]).applyMatrix4(g.matrixWorld); };
  const gy = (x, z) => { const h = game.city.groundHeightAt(x, z); return Number.isFinite(h) ? Math.max(h, game.city.seaLevel ?? -0.12) : 0; };
  if (s.local) { eye.copy(L(s.local.eye)); look.copy(L(s.local.look)); }
  else if (s.shore) { let x = s.shore[0]; const z = s.shore[1]; for (let k = 0; k < 400 && !(game.city.isWater(x, z) && game.city.isWater(x + 4, z) && game.city.isWater(x + 8, z)); k++) x += 2;
    if (s.high) { eye.set(x - 40, 14, z + 26); look.set(x - 6, 0, z - 4); } else { eye.set(x - 14, 1.7, z + 5); look.set(x - 2, 0, z - 7); } }
  else if (s.eyeRoad) { const r = s.eyeRoad, dx = r.end[0] - r.from[0], dz = r.end[1] - r.from[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    eye.set(r.end[0] - ux * r.back + uz * 2.5, 0, r.end[1] - uz * r.back - ux * 2.5); eye.y = gy(eye.x, eye.z) + r.up; look.set(r.end[0] + ux * r.ahead, gy(r.end[0], r.end[1]) + 0.3, r.end[1] + uz * r.ahead); }
  else { eye.fromArray(s.eye); look.fromArray(s.look); eye.y += gy(eye.x, eye.z) * 0; }
  game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; };
  return [eye.x, eye.y, eye.z].map((v) => +v.toFixed(1));
})()`;

const out = { set: SET, url, when: new Date().toISOString(), spots: {} };
await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto(url);
  await b.waitFor(GAME_READY, 480);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(st); return true; })()`);
  out.waterMask = await b.eval(`import('/src/world/ground/seamAudit.js').then((A) => A.waterMaskScan(game))`, 240000);
  console.log('waterMask', JSON.stringify(out.waterMask));
  for (const k of want) {
   for (let attempt = 0; attempt < 3; attempt++) { try {
    const S = SPOTS[k]; if (!S) continue;
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function' && !!game.nicoHouse", 480); await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; if (!window.__saCss) { window.__saCss = document.createElement('style'); window.__saCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__saCss); } return true; })()`);
    const area = await b.eval(`(() => { const s = ${JSON.stringify(S.area)}; if (s.local) { const T = game.THREE || window.THREE; const p = new T.Vector3(s.local[0], 0, s.local[1]).applyMatrix4(game.nicoHouse.group.matrixWorld); s.x = p.x; s.z = p.z; } game.teleport(s.x, null, s.z, 0); return s; })()`);
    await b.sleep(2500);
    await b.waitFor(SETTLED, 120).catch(() => {});
    await b.sleep(2500);
    await b.waitFor(`(() => { const s = game.city.streamer; return !s || !s.readyAround || s.readyAround(${area.x}, ${area.z}, ${area.r + 20}); })()`, 120).catch(() => console.log('colliders not ready around', area.name));
    await b.waitFor("typeof game.teleport === 'function'", 300); await b.eval(`game.teleport(${area.x}, null, ${area.z}, 0) || true`);
    const r = await b.eval(`import('/src/world/ground/seamAudit.js').then((A) => A.auditSpot(game, ${JSON.stringify(area)}))`, 240000);
    if (k === 'nico') { r.islets = await b.eval(`import('/src/world/ground/seamAudit.js').then((A) => A.islets(game, ${area.x}, ${area.z}, 1500))`); r.caps = await b.eval(`JSON.stringify(game.city.capStats || null)`); }
    out.spots[k] = r;
    console.log(k, JSON.stringify({ roadEnds: [r.roadEnds.n, r.roadEnds.abrupt, r.roadEnds.step], pads: [r.pads.n, r.pads.step, r.pads.maxStep], holes: r.holes.n, waterSolid: r.waterSolid.n, islets: r.islets?.length }));
    if (!o.noshots) for (const sh of S.shots) {
      await b.waitFor(GAME_READY + ' && !!game.nicoHouse', 480); await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; if (!window.__saCss) { window.__saCss = document.createElement('style'); window.__saCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__saCss); } return true; })()`);
      await b.eval(CAM(sh)); await b.sleep(2500); await b.waitFor(SETTLED, 60).catch(() => {}); await b.sleep(1500);
      console.log('SHOT', await b.screenshot(path.join(SHOTS, `${SET}_${sh.id}.png`)));
    }
    await b.eval('game.cameraOverride = null; true');
     break; } catch (e) { console.log('retry', k, String(e.message || e).slice(0, 160)); await b.sleep(8000); } }
  }
  if (b.errors.length) out.consoleErrors = [...new Set(b.errors)].slice(0, 20);
});
const sum = (f) => Object.values(out.spots).reduce((s, r) => s + f(r), 0);
out.totals = { roadEndsChecked: sum((r) => r.roadEnds.n), abruptRoadEnds: sum((r) => r.roadEnds.abrupt), roadEndSteps: sum((r) => r.roadEnds.step), padBorderSamples: sum((r) => r.pads.n), padSteps: sum((r) => r.pads.step), colliderHoles: sum((r) => r.holes.n), solidOverWater: sum((r) => r.waterSolid.n), waterMaskSliversStillWater: out.waterMask?.stillWater ?? null };
fs.writeFileSync(path.join(REP, `seam-audit-${SET}${o.tag ? "-" + o.tag : ""}.json`), JSON.stringify(out, null, 1));
console.log('TOTALS', JSON.stringify(out.totals));
if (out.consoleErrors) console.log('CONSOLE ERRORS', out.consoleErrors);
