// r2-physics: walk and sprint into parked cars (sedan, SUV, truck9), head-on into the flank and at 35 deg, 5 s each; logs how
// far each car moved (position, mm) and turned (deg). Must stay < 1 mm.   node tools/v2/physics/pushtest.mjs [--off]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const CARS = String(o.cars || 'sedan3,suv12,truck9').split(','), at = String(o.at || '407,-110').split(',').map(Number);
const out = { solidCars: !o.off, runs: [] };
await withBrowser({ width: 960, height: 540, maxSeconds: 1800 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; if (game.vehicles.trafficDebug) game.vehicles.trafficDebug.target = 0; game.physics.solidCars = ${!o.off}; return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
  await b.eval(`JSON.stringify(__lab.findSpot(${at[0]}, ${at[1]}))`);
  await b.eval(`(() => { const S = __lab.spot; game.teleport(S.x0 + S.fx * 30 + S.rx * 6, undefined, S.z0 + S.fz * 30 + S.rz * 6); return 1; })()`);
  await b.sleep(9000);
  for (let k = 0; k < 2; k++) { await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(700); }
  for (const key of CARS) for (const [mode, ang] of [['walk', 0], ['sprint', 0], ['walk', 35], ['sprint', 35]]) {
    // a parked car broadside on the lane (heading along the lane), the player 4 m off its flank, facing it (ang: approach angle)
    const r = JSON.parse(await b.eval(`(async () => { const S = __lab.spot, T = game.THREE; for (const v of [...game.vehicles.list]) { const t = v.body.translation(); if (Math.hypot(t.x - (S.x0 + S.fx * 30), t.z - (S.z0 + S.fz * 30)) < 25) { v.playerDriven = false; game.vehicles.remove(v); } }
      const cx = S.x0 + S.fx * 30, cz = S.z0 + S.fz * 30; const v = await game.vehicles.spawnParked('${key}', { x: cx, z: cz, heading: S.h, keepSpot: true, locked: true });
      window.__pv = v; await new Promise((r) => setTimeout(r, 6000)); // settled (parked cars go to sleep once still)
      const a = ${ang} * Math.PI / 180, dirx = -S.rx * Math.cos(a) + S.fx * Math.sin(a), dirz = -S.rz * Math.cos(a) + S.fz * Math.sin(a); // toward the car
      const px = cx - dirx * (v.spec.W / 2 + 3.2), pz = cz - dirz * (v.spec.W / 2 + 3.2);
      game.teleport(px, undefined, pz, Math.atan2(dirx, dirz));
      await new Promise((r) => setTimeout(r, 700));
      const t = v.body.translation(), q = v.body.rotation(); window.__p0 = { x: t.x, y: t.y, z: t.z, yaw: Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)) };
      return JSON.stringify({ key: v.typeKey, mass: v.spec.mass }); })()`));
    const idle = JSON.parse(await b.eval(`(async () => { const v = window.__pv, a = v.body.translation(); const ax = a.x, ay = a.y, az = a.z; await new Promise((r) => setTimeout(r, 3000)); const t = v.body.translation(); const p = window.__p0; p.x = t.x; p.y = t.y; p.z = t.z; return JSON.stringify({ idleDriftMm: +(Math.hypot(t.x - ax, t.y - ay, t.z - az) * 1000).toFixed(2), asleep: v.body.isSleeping() }); })()`));
    await b.key('KeyW', true, 'w'); if (mode === 'sprint') await b.key('ShiftLeft', true, 'Shift');
    await b.sleep(5000);
    await b.key('KeyW', false, 'w'); if (mode === 'sprint') await b.key('ShiftLeft', false, 'Shift');
    await b.sleep(400);
    const d = JSON.parse(await b.eval(`(() => { const v = window.__pv, t = v.body.translation(), q = v.body.rotation(), p = window.__p0, P = game.player.position;
      const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      return JSON.stringify({ movedMm: +(Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) * 1000).toFixed(2), turnedDeg: +((yaw - p.yaw) * 57.3).toFixed(3), playerToCar: +Math.hypot(P.x - t.x, P.z - t.z).toFixed(2), blocked: game.physics.solidCarsBlocked || 0 }); })()`));
    out.runs.push({ ...r, mode, ang, ...idle, ...d }); console.log(JSON.stringify({ ...r, mode, ang, ...idle, ...d }));
  }
  out.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 8);
});
fs.writeFileSync(`docs/v2/reports/physics-push${o.off ? '-off' : ''}.json`, JSON.stringify(out, null, 1));
console.log('saved');
