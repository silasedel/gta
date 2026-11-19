#!/usr/bin/env node
// X1 proof: a car drives through a breakable fence segment on the spawn street (world-dressing) and through a street bin.
//   node tools/v2/breakshot.mjs [--out docs/v2/shots/clipping]
// V2 test browser only (see browser.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from './browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const OUT = path.resolve(o.out || 'docs/v2/shots/clipping');
fs.mkdirSync(OUT, { recursive: true });
const HIDE = `(() => { game.timeExternal = true; game.timeOfDay = 11; if (!window.__caCss) { window.__caCss = document.createElement('style'); window.__caCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__caCss); } return true; })()`;

await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + ' && !!game.breakables', 480);
  await b.eval(HIDE);
  // a fence segment near the spawn street, seen side-on from the road
  const f = await b.eval(
    `(() => { const B = game.breakables, p = game.player.position; const all = B.near(p.x, p.z, 600).filter((r) => r.kind === 'fence' || r.kind === 'chain'); all.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); const r = all[0]; return r ? { x: r.x, y: r.y, z: r.z, ry: r.ry, kind: r.kind, n: all.length, stats: B.stats } : null; })()`,
  );
  console.log('fence', JSON.stringify(f));
  if (!f) return;
  // car 18 m away on the fence normal, heading through the fence at ~40 km/h
  // approach side: the fence normal direction with 14 m of free space (horizontal rays at bumper height)
  const side =
    await b.eval(`(() => { const W = game.world, R = game.RAPIER || window.RAPIER; let best = 1, bd = -1;
    for (const sg of [1, -1]) { const nx = Math.sin(${f.ry} + Math.PI / 2) * sg, nz = Math.cos(${f.ry} + Math.PI / 2) * sg; let free = 14;
      for (const off of [-0.8, 0, 0.8]) { const ox = ${f.x} + nx * 0.6 + Math.cos(${f.ry}) * off, oz = ${f.z} + nz * 0.6 - Math.sin(${f.ry}) * off; const h = W.castRay(new R.Ray({ x: ox, y: ${f.y} + 0.7, z: oz }, { x: nx, y: 0, z: nz }), 14, true); if (h) free = Math.min(free, h.timeOfImpact); }
      if (free > bd) { bd = free; best = sg; } } return [best, bd]; })()`);
  console.log('side', side);
  const nx = Math.sin(f.ry + Math.PI / 2) * side[0],
    nz = Math.cos(f.ry + Math.PI / 2) * side[0],
    D0 = Math.max(6, Math.min(12, side[1] - 3));
  await b.eval(`(() => { const T = game.THREE || window.THREE; const sx = ${f.x} + ${nx} * ${D0}, sz = ${f.z} + ${nz} * ${D0}, h = Math.atan2(${-nx}, ${-nz});
    game.teleport(sx + ${nx} * 6, null, sz + ${nz} * 6, h);
    const v = game.vehicles.spawn('sedan', new T.Vector3(sx, (game.city.groundHeightAt(sx, sz) || 0) + 0.7, sz), h, { snap: false }); window.__bv = v; if (v) { v.ai = null; v.parked = false; window.__push = 0; game.updaters.push(() => { if (window.__push > 0 && v.body) { window.__push -= 1; const lv = v.body.linvel(); v.body.setLinvel({ x: Math.sin(h) * 11.5, y: lv.y, z: Math.cos(h) * 11.5 }, true); } }); }
    const eye = new T.Vector3(${f.x} + ${nz} * 9 + ${nx} * 4, ${f.y} + 3.2, ${f.z} - ${nx} * 9 + ${nz} * 4), look = new T.Vector3(${f.x}, ${f.y} + 0.8, ${f.z});
    game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); return true; }; return !!v; })()`);
  await b.sleep(2500);
  await b.screenshot(path.join(OUT, 'break_fence_0_before.png'));
  await b.eval(`(() => { window.__bv.body.wakeUp(); window.__push = 50; return true; })()`);
  for (let i = 1; i <= 5; i++) {
    await b.sleep(260);
    console.log(
      'SHOT',
      await b.screenshot(path.join(OUT, `break_fence_${i}.png`)),
      await b.eval(
        `JSON.stringify({ p: window.__bv.body.translation(), broken: game.breakables.stats.broken })`,
      ),
    );
  }
  console.log(
    'after',
    await b.eval(
      `JSON.stringify({ stats: game.breakables.stats, speed: Math.hypot(window.__bv.body.linvel().x, window.__bv.body.linvel().z) })`,
    ),
  );
  await b.eval('game.cameraOverride = null; true');
  if (b.errors.length) console.log('CONSOLE ERRORS', [...new Set(b.errors)].slice(0, 8));
});
