// r4 wheels (user: truck9's tires "weird and wobbly and off"): wheel close-ups standing and while rolling at 5-15 km/h with
// a turn.  node tools/v2/cars/r4_wheels.mjs --tag before|after [--keys truck9,coupe3,suv1,super4] [--q '&r4wheel=0']
// Per car: the front-left wheel from the side and head-on (low, in front of the wheel), standing, then 8 frames each while
// the player drives it slowly (W taps, A held for the second half).  Shots: docs/v2/shots/cars/r4wheels/<tag>_<key>_<view>.png
// data (speed / steer per frame, console errors): docs/v2/reports/cars-r4-wheels-<tag>.json
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
  DIR = path.resolve('docs/v2/shots/cars/r4wheels');
fs.mkdirSync(DIR, { recursive: true });
const keys = String(o.keys || 'truck9,coupe3,suv1,super4').split(',');
const at = String(o.at || '407,-110')
  .split(',')
  .map(Number);
const out = { tag: TAG, cars: {}, errors: [] };
await withBrowser({ width: 1280, height: 800, maxSeconds: +(o.max || 1300) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute&weather=clear' + (o.q || ''));
  try {
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  } catch (e) {
    console.log('BOOT TIMEOUT', b.errors.slice(0, 10), b.logs.slice(-15));
    throw e;
  }
  await startGame(b);
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = ${+(o.tod || 11)}; if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); } game.teleport(${at[0]}, undefined, ${at[1]}, 0); return 1; })()`,
  );
  await b.sleep(12000);
  const spot = JSON.parse(
    await b.eval(`(() => { const g = game.city.roadGraph, p = game.player.position; const r = g.nearestEdge ? g.nearestEdge(p.x, p.z) : null;
    const e = r?.edge || r; if (!e || !e.pts) return JSON.stringify({ x: p.x + 4, z: p.z, h: 0 });
    const pts = e.pts, n = pts.length; const i = Math.max(1, Math.min(n - 1, Math.floor(n / 2))); const A = pts[i - 1], B = pts[i];
    const ax = A.x ?? A[0], az = A.z ?? A[1], bx = B.x ?? B[0], bz = B.z ?? B[1]; const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const off = (e.width || 10) / 4; const h = Math.atan2(dx, dz); return JSON.stringify({ x: (ax + bx) / 2 - dz / L * off, z: (az + bz) / 2 + dx / L * off, h }); })()`),
  );
  out.spot = spot;
  // camera views in car space around the front-left wheel W: side (outside, slightly ahead) and head-on (low, in front)
  await b.eval(`(() => { window.__r4view = 'side'; return 1; })()`);
  for (const k of keys) {
    const info = JSON.parse(
      await b.eval(`(async () => { try { if (game.player.state?.inVehicle) game.exitVehicle(); } catch (e) {}
      if (window.__cuV) { try { game.vehicles.remove(window.__cuV); } catch (e) {} }
      const v = window.__cuV = await game.vehicles.spawnParked(${JSON.stringify(k)}, { x: ${spot.x}, z: ${spot.z}, heading: ${spot.h}, color: 0x8f949b, finish: 'metallic', locked: false });
      if (!v) return JSON.stringify({ none: 1 });
      v.locked = false;
      const T = window.THREE || game.THREE; v.mesh.updateMatrixWorld(true);
      const wp = v.car.wheels[0].steer.getWorldPosition(new T.Vector3()); v.mesh.worldToLocal(wp);
      window.__cuW = { x: wp.x, y: wp.y, z: wp.z, r: v.car.wheels[0].r || 0.4 };
      const W = window.__cuW, V = { side: [[W.x + 2.3, W.y + 0.15, W.z + 0.5], [W.x, W.y, W.z], 34], head: [[W.x + 0.35, Math.max(0.25, W.y * 0.75), W.z + 3.2], [W.x - 0.05, W.y, W.z], 26] };
      game.cameraOverride = (dt, cam) => { const v = window.__cuV; if (!v) return false; const m = v.mesh, s = V[window.__r4view] || V.side;
        const e = new T.Vector3(...s[0]).applyQuaternion(m.quaternion).add(m.position), l = new T.Vector3(...s[1]).applyQuaternion(m.quaternion).add(m.position);
        cam.position.copy(e); cam.lookAt(l); if (cam.fov !== s[2]) { cam.fov = s[2]; cam.updateProjectionMatrix(); } return true; };
      return JSON.stringify({ key: v.typeKey, name: v.name, wheel: W, man: { r: v.car.spec?.r, archGap: v.car.spec?.archGap } }); })()`),
    );
    out.cars[k] = { info, frames: [] };
    if (info.none) {
      console.log(k, 'no car');
      continue;
    }
    await b.sleep(3500);
    for (const vn of ['side', 'head']) {
      await b.eval(`(() => { window.__r4view = '${vn}'; return 1; })()`);
      await b.sleep(700);
      await b.screenshot(path.join(DIR, `${TAG}_${k}_stand_${vn}.png`));
    }
    // drive: enter, roll at 5-15 km/h (W taps), turn left for the second half
    await b.eval(`(() => { game.enterVehicle(window.__cuV); return 1; })()`);
    await b.sleep(2200);
    const sp = () =>
      b
        .eval(
          `(() => { const v = window.__cuV; return JSON.stringify({ kmh: +Math.abs((v.speedKmh ?? v.speed * 3.6) || 0).toFixed(1), steer: +(v.car.wheels[0].steer.rotation.y || 0).toFixed(3), spin: +(v.car.wheels[0].spin.rotation.x || 0).toFixed(2) }); })()`,
        )
        .then(JSON.parse);
    await b.key('KeyW', true);
    for (let i = 0; i < 30; i++) {
      await b.sleep(150);
      if ((await sp()).kmh > 9) break;
    }
    await b.key('KeyW', false);
    for (let f = 0; f < 16; f++) {
      const s = await sp();
      if (s.kmh < 6) {
        await b.key('KeyW', true);
        await b.sleep(250);
        await b.key('KeyW', false);
      }
      if (f === 8) await b.key('KeyA', true);
      const vn = f % 2 ? 'head' : 'side';
      await b.eval(`(() => { window.__r4view = '${vn}'; return 1; })()`);
      await b.sleep(160);
      await b.screenshot(path.join(DIR, `${TAG}_${k}_roll${String(f).padStart(2, '0')}_${vn}.png`));
      out.cars[k].frames.push({ f, vn, ...(await sp()) });
    }
    await b.key('KeyA', false);
    await b.key('KeyS', true);
    await b.sleep(1500);
    await b.key('KeyS', false);
    await b.eval(`(() => { try { game.exitVehicle(); } catch (e) {} return 1; })()`);
    await b.sleep(1200);
    console.log(k, info.name, JSON.stringify(out.cars[k].frames.map((x) => x.kmh)));
  }
  await b.eval(
    `(() => { game.cameraOverride = null; try { game.vehicles.remove(window.__cuV); } catch (e) {} return 1; })()`,
  );
  out.errors = [...new Set(b.errors)].slice(0, 40);
  console.log(TAG, 'errors', b.errors.length, out.errors.slice(0, 6));
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(
  path.resolve(`docs/v2/reports/cars-r4-wheels-${TAG}.json`),
  JSON.stringify(out, null, 1),
);
