// Close-ups of library cars in the game: node tools/v2/cars/closeups.mjs --set X --keys a,b,c [--at x,z] [--tod 12] [--night]
// Day: each key is parked (spawnParked) on the curb next to the player, shot from the front three-quarter and the rear.
// --night: follows moving traffic cars (lights on) one model at a time and shoots them from the side-front.
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
const SET = o.set || 'cu',
  DIR = path.resolve('docs/v2/shots/cars');
fs.mkdirSync(DIR, { recursive: true });
const keys = String(o.keys || 'sedan3').split(',');
const at = String(o.at || '407,-110')
  .split(',')
  .map(Number);
await withBrowser(
  { width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 900) },
  async (b) => {
    await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    await startGame(b);
    await b.eval(
      `(() => { game.timeExternal = true; game.timeOfDay = ${+(o.tod || (o.night ? 21.5 : 11.5))}; if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); } game.teleport(${at[0]}, undefined, ${at[1]}, 0); return 1; })()`,
    );
    await b.sleep(12000);
    if (!o.night) {
      // a curb spot near the player: nearest graph edge, right lane edge
      const spot = JSON.parse(
        await b.eval(`(() => { const g = game.city.roadGraph, p = game.player.position; const r = g.nearestEdge ? g.nearestEdge(p.x, p.z) : null;
      const e = r?.edge || r; if (!e || !e.pts) return JSON.stringify({ x: p.x + 4, z: p.z, h: 0 });
      const pts = e.pts, n = pts.length; const i = Math.max(1, Math.min(n - 1, Math.floor(n / 2))); const A = pts[i - 1], B = pts[i];
      const ax = A.x ?? A[0], az = A.z ?? A[1], bx = B.x ?? B[0], bz = B.z ?? B[1]; const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
      const off = (e.width || 10) / 2 - 1.3; const h = Math.atan2(dx, dz); return JSON.stringify({ x: (ax + bx) / 2 - dz / L * off, z: (az + bz) / 2 + dx / L * off, h }); })()`),
      );
      for (const k of keys) {
        const r =
          await b.eval(`(async () => { if (window.__cuV) { try { game.vehicles.remove(window.__cuV); } catch (e) {} }
        const v = window.__cuV = await game.vehicles.spawnParked(${JSON.stringify(k)}, { x: ${spot.x}, z: ${spot.z}, heading: ${spot.h} });
        if (game.player) game.teleport(${spot.x} + 9 * Math.cos(${spot.h}), undefined, ${spot.z} - 9 * Math.sin(${spot.h}), 0);
        return v ? v.typeKey + ' ' + v.name : 'none'; })()`);
        await b.sleep(2500);
        for (const [vn, off] of [
          ['f', [3.4, 1.35, 4.6]],
          ['r', [-3.0, 1.5, -4.8]],
        ]) {
          await b.eval(
            `(() => { const T = window.THREE || game.THREE, off = new T.Vector3(${off}); game.cameraOverride = (dt, cam) => { const v = window.__cuV; if (!v) return false; const m = v.mesh; const e = off.clone().applyQuaternion(m.quaternion).add(m.position); cam.position.copy(e); cam.lookAt(m.position.x, m.position.y - 0.15, m.position.z); if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
          );
          await b.sleep(1200);
          await b.screenshot(path.join(DIR, `${SET}_${k}_${vn}.png`));
        }
        console.log(k, r);
      }
    } else {
      const seen = new Set();
      const want = keys[0] === '*' ? 12 : keys.length;
      for (let t = 0; t < 60 && seen.size < want; t++) {
        const k =
          await b.eval(`(() => { const pp = game.player.position, want = ${JSON.stringify(keys)}, seen = ${JSON.stringify([...seen])};
        const c = game.vehicles.list.filter((v) => v.ai && v.car?.glb && !seen.includes(v.typeKey) && (want.includes(v.typeKey) || want[0] === '*') && v.mesh.position.distanceTo(pp) < 150 && Math.abs(v.speed) > 2)
          .sort((a, b) => a.mesh.position.distanceTo(pp) - b.mesh.position.distanceTo(pp))[0];
        if (!c) return null; window.__cuV = c; const T = window.THREE || game.THREE, off = new T.Vector3(2.6, 1.2, 5.2);
        game.cameraOverride = (dt, cam) => { const m = window.__cuV.mesh; const e = off.clone().applyQuaternion(m.quaternion).add(m.position); cam.position.copy(e); cam.lookAt(m.position.x, m.position.y - 0.1, m.position.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; };
        return c.typeKey; })()`);
        if (!k) {
          await b.eval(
            `game.teleport(game.player.position.x + 60, undefined, game.player.position.z + 40, 0)`,
          );
          await b.sleep(6000);
          continue;
        }
        await b.sleep(1300);
        await b.screenshot(path.join(DIR, `${SET}_${k}_night.png`));
        seen.add(k);
        console.log('night', k);
      }
    }
    if (b.errors.length)
      console.log('ERRORS', [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 12));
  },
);
