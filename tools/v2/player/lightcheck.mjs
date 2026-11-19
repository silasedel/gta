#!/usr/bin/env node
// Nico lighting check (PLAYER helper): Nico and a spawned local side by side in the open at 10:00 / 13:00 / 17:00, seen from
// the front, back and side, plus both in the shade under the stilt house at 13:00; prints mean luminance of Nico's and the
// person's screen boxes. -> docs/v2/shots/player/light/<set>_<h>_<view>.jpg + <set>_sheet.jpg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'l';
const DIR = path.resolve('docs/v2/shots/player/light');
fs.mkdirSync(DIR, { recursive: true });
const files = [];
await withBrowser({ width: 960, height: 540, maxSeconds: 260 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q ? '&' + o.q : ''));
  await b.waitFor(
    GAME_READY + " && typeof game.teleport === 'function' && game.nicoHouse && game.peds",
    200,
  );
  await startGame(b);
  const place = async (where) =>
    b.eval(`(() => { const T = game.THREE, H = game.nicoHouse, P = game.player; let x, z, h;
      if ('${where}' === 'shade') { const c = H.toWorld(new T.Vector3(${o.sx ?? 2}, 0, ${o.sz ?? -7})); x = c.x; z = c.z; h = 0; }
      else { const e = game.city.roadGraph.nearestEdge(H.spot.x, H.spot.z, {}, 120); x = e.point.x + e.dir.x * 10; z = e.point.z + e.dir.z * 10; h = 0; }
      game.teleport(x, undefined, z, h); P.heading = 0;
      const y = game.player.position.y;
      if (!window.__ped || !window.__ped.active) window.__ped = game.peds.spawnAt(new T.Vector3(x + 1.1, y, z), { pin: true });
      const q = window.__ped; if (q) { q.pos.set(x + 1.1, y, z); q.state = 'idle'; q.speed = 0; q.heading = 0; q.stateT = 999; }
      window.__mid = { x: x + 0.55, y: y + 1.1, z };
      return 1; })()`);
  const views = o.close
    ? { cfront: [-0.55, 0.25, 1.5], cback: [-0.55, 0.25, -1.5], cside: [-2.0, 0.25, 0.2] }
    : {
        front: [0.3, 0.3, 2.6],
        back: [-0.3, 0.3, -2.6],
        side: [-1.9, 0.3, 1.8],
        side2: [-1.9, 0.3, -1.8],
      };
  const shot = async (h, view, where) => {
    const [dx, dy, dz] = views[view];
    await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = ${h}; const m = window.__mid; const q = window.__ped;
      game.cameraOverride = (dt, cam) => { if (q) { q.pos.x = m.x + 0.55; q.pos.z = m.z; q.heading = 0; q.speed = 0; } game.player.heading = 0; cam.position.set(m.x + ${dx}, m.y + ${dy}, m.z + ${dz}); cam.lookAt(m.x, m.y, m.z); return true; }; return 1; })()`);
    await b.sleep(1400);
    const f = path.join(DIR, `${SET}_${where === 'shade' ? 'shade' : h}_${view}.jpg`);
    await b.screenshot(f, { format: 'jpeg', quality: 85 });
    files.push(f);
  };
  await place('open');
  await b.sleep(1500);
  for (const h of o.hours ? String(o.hours).split(',').map(Number) : [10, 13, 17])
    for (const v of Object.keys(views)) await shot(h, v, 'open');
  if (!o.noshade) {
    await place('shade');
    await b.sleep(1500);
    for (const v of ['front', 'back']) await shot(13, v, 'shade');
  }
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 6));
});
execFileSync('python3', [
  'tools/v2/montage.py',
  path.join(DIR, `${SET}_sheet.jpg`),
  '--w',
  '480',
  ...files,
]);
console.log('sheet', path.join(DIR, `${SET}_sheet.jpg`));
