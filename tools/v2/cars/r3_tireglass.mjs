// r3 tire + glass close-ups: node tools/v2/cars/r3_tireglass.mjs [--tag x] [--keys a,b] [--ab]   (--ab: boots twice in one
// browser, ?r3car=0 (r2 look) as tag 'b', then the current look as tag 'a')
// Daylight, clear weather; each car parked at one curb spot, shot from the side, front 3/4, a tire close-up and a glass
// close-up (~2-5 m).  Shots: docs/v2/shots/cars/r3/<tag>_<key>_<view>.png, data: docs/v2/reports/cars-r3-tireglass-<tag>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 'before',
  DIR = path.resolve('docs/v2/shots/cars/r3');
fs.mkdirSync(DIR, { recursive: true });
const keys = String(o.keys || 'sedan1,sedan5,hatch1,suv2,suv6,van6,truck9,coupe4').split(',');
const at = String(o.at || '407,-110')
  .split(',')
  .map(Number);
const runs = o.ab
  ? [
      ['b', '&r3car=0'],
      ['a', ''],
    ]
  : [[TAG, o.q || '']];
const out = { runs: {} };
await withBrowser({ width: 1280, height: 800, maxSeconds: +(o.max || 1500) }, async (b) => {
  for (const [TAG, Q] of runs) {
    const R = (out.runs[TAG] = { cars: {}, errors: [] });
    b.errors.length = 0;
    await b.goto('http://127.0.0.1:5200/?mute&weather=clear' + Q);
    try {
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    } catch (e) {
      console.log('BOOT TIMEOUT', TAG, b.errors.slice(0, 10), b.logs.slice(-15));
      throw e;
    }
    await startGame(b);
    await b.eval(
      `(() => { game.timeExternal = true; game.timeOfDay = ${+(o.tod || 13)}; if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); } game.teleport(${at[0]}, undefined, ${at[1]}, 0); return 1; })()`,
    );
    await b.sleep(12000);
    const spot = JSON.parse(
      await b.eval(`(() => { const g = game.city.roadGraph, p = game.player.position; const r = g.nearestEdge ? g.nearestEdge(p.x, p.z) : null;
    const e = r?.edge || r; if (!e || !e.pts) return JSON.stringify({ x: p.x + 4, z: p.z, h: 0 });
    const pts = e.pts, n = pts.length; const i = Math.max(1, Math.min(n - 1, Math.floor(n / 2))); const A = pts[i - 1], B = pts[i];
    const ax = A.x ?? A[0], az = A.z ?? A[1], bx = B.x ?? B[0], bz = B.z ?? B[1]; const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const off = (e.width || 10) / 2 - 1.3; const h = Math.atan2(dx, dz); return JSON.stringify({ x: (ax + bx) / 2 - dz / L * off, z: (az + bz) / 2 + dx / L * off, h }); })()`),
    );
    for (const k of keys) {
      const info = JSON.parse(
        await b.eval(`(async () => { if (window.__cuV) { try { game.vehicles.remove(window.__cuV); } catch (e) {} }
      const v = window.__cuV = await game.vehicles.spawnParked(${JSON.stringify(k)}, { x: ${spot.x}, z: ${spot.z}, heading: ${spot.h}, color: 0x5a5f66, finish: 'metallic' });
      if (!v) return JSON.stringify({ none: 1 });
      game.teleport(${spot.x} + 14 * Math.cos(${spot.h}), undefined, ${spot.z} - 14 * Math.sin(${spot.h}), 0);
      const c = v.car, gl = c.slots.glass[0];
      v.mesh.updateMatrixWorld(true); const wp = c.wheels[0].steer.getWorldPosition(new (window.THREE || game.THREE).Vector3()); v.mesh.worldToLocal(wp);
      const w = { x: wp.x, z: wp.z, r: wp.y };
      let dropped = 0; for (const g of c.slots.glass) dropped += g.geometry.userData.paneDropped || 0;
      let cab = 0; c.lod.levels[0].object.traverse((m) => { if (m.isMesh) cab += m.geometry.userData.cabinShaded || 0; });
      const mats = {}; v.mesh.traverse((m) => { if (m.isMesh && m.material) { const M = m.material; const n = M.name || M.type; (mats[n] ||= { type: M.type, transparent: M.transparent, depthWrite: M.depthWrite, side: M.side, opacity: M.opacity, ro: m.renderOrder, n: 0, tris: 0 }); mats[n].n++; mats[n].tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } });
      window.__cuW = { x: w.x, z: w.z, r: w.r };
      return JSON.stringify({ key: v.typeKey, name: v.name, wheel: window.__cuW, paneDropped: dropped, cabinShaded: cab, mats }); })()`),
      );
      R.cars[k] = info;
      await b.sleep(3000);
      const W = info.wheel || { x: 0.8, z: 1.4, r: 0.33 };
      // [name, camera offset (car space), look-at (car space), fov]
      const views = [
        ['side', [5.2, 1.0, 0], [0, 0.75, 0], 50],
        ['q34', [3.6, 1.45, 4.4], [0, 0.7, 0.3], 45],
        ['tire', [W.x + 1.6, W.r + 0.3, W.z + 0.9], [W.x, W.r, W.z], 40],
        ['glass', [2.6, 1.55, 1.4], [0.55, 1.15, -0.2], 45],
        ['wind', [1.9, 1.75, 3.6], [0.1, 1.05, 0.7], 45],
      ];
      for (const [vn, off, look, fov] of views) {
        await b.eval(
          `(() => { const T = window.THREE || game.THREE, off = new T.Vector3(${off}), lk = new T.Vector3(${look}); game.cameraOverride = (dt, cam) => { const v = window.__cuV; if (!v) return false; const m = v.mesh; const e = off.clone().applyQuaternion(m.quaternion).add(m.position); const l = lk.clone().applyQuaternion(m.quaternion).add(m.position); cam.position.copy(e); cam.lookAt(l); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
        );
        await b.sleep(1100);
        await b.screenshot(path.join(DIR, `${TAG}_${k}_${vn}.png`));
      }
      console.log(k, info.name);
    }
    R.errors = b.errors.slice(0, 40);
    console.log(TAG, 'errors', b.errors.length, b.errors.slice(0, 5));
  }
});
fs.writeFileSync(
  path.resolve(`docs/v2/reports/cars-r3-tireglass-${o.ab ? 'ab' : TAG}.json`),
  JSON.stringify(out, null, 1),
);
