// In-game check of the utility vehicles (glb/spots.js): node tools/v2/cars/utility/ingame.mjs [outdir]
// Visits MIA (golf cart + baggage carts), Nico's yard (ATV + single-seat UTV) and the air station (crew UTV); at each stop waits
// for the spot vehicles to spawn, reports where they parked and their wheel-to-ground error, takes a close-up, then enters one,
// drives it a few seconds and reports the distance covered, the wheels' ground error while rolling and the body's up vector.
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../../browser.mjs';

const OUT = process.argv[2] || 'docs/v2/shots/cars/utility';
fs.mkdirSync(OUT, { recursive: true });

// stops: where the player stands (world x, z or Nico house-local), which vehicles to expect, which one to drive
const STOPS = [
  {
    id: 'mia',
    at: [-1232, 1078],
    keys: ['bagcart1', 'golf1'],
    drive: 'bagcart1',
    shoot: ['bagcart1', 'golf1'],
  },
  { id: 'nico', house: [0, 12], keys: ['atv1', 'utv2'], drive: 'atv1', shoot: ['atv1', 'utv2'] },
  { id: 'base', at: [-4522, 6012], keys: ['utv1'], drive: 'utv1', shoot: ['utv1'] },
];

// per spot vehicle: key, position, wheel bottom vs the ground under it (m), up vector y, frozen / sleeping
const PROBE = `(() => {
  const T = window.THREE || game.THREE, R = game.RAPIER, QF = R.QueryFilterFlags, v3 = new T.Vector3();
  const vs = game.vehicles.list.filter((v) => v.utilitySpot);
  return JSON.stringify(vs.map((v) => {
    const t = v.body.translation(), errs = [];
    for (const w of v.car.wheels || []) {
      w.steer.getWorldPosition(v3);
      let g = game.city.groundHeightAt(v3.x, v3.z, v3.y);
      const hit = game.world.castRay(new R.Ray({ x: v3.x, y: v3.y + 0.4, z: v3.z }, { x: 0, y: -1, z: 0 }), 4, true,
        QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS);
      if (hit) g = v3.y + 0.4 - (hit.timeOfImpact ?? hit.toi);
      errs.push(+(v3.y - v.spec.r - g).toFixed(3));
    }
    const up = new T.Vector3(0, 1, 0).applyQuaternion(v.mesh.quaternion).y;
    return { key: v.typeKey, at: [+t.x.toFixed(1), +t.z.toFixed(1)], spot: v.utilitySpot, wheelErr: errs, up: +up.toFixed(3),
      frozen: !!v.frozen, seats: v.spec.seats, vmax: Math.round(v.spec.vmax * 3.6), mass: v.spec.mass };
  }));
})()`;

await withBrowser({ width: 1100, height: 650, maxSeconds: 290 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  if (!(await startGame(b, 60))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = 11; const s = document.createElement('style'); s.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(s); return 1; })()`,
  );
  for (const S of STOPS) {
    const tp = await b.eval(`(() => {
      let x = ${S.at?.[0] ?? 'null'}, z = ${S.at?.[1] ?? 'null'};
      ${S.house ? `const NH = game.nicoHouse; if (!NH?.toWorld) return 'no house'; const p = NH.toWorld(new (window.THREE || game.THREE).Vector3(${S.house[0]}, 0, ${S.house[1]})); x = p.x; z = p.z;` : ''}
      game.teleport(x, undefined, z, 0); return JSON.stringify([+x.toFixed(1), +z.toFixed(1)]);
    })()`);
    console.log(S.id, 'teleport', tp);
    let got = [];
    for (let i = 0; i < 15; i++) {
      await b.sleep(2000);
      got = JSON.parse(await b.eval(PROBE));
      if (S.keys.every((k) => got.some((g) => g.key === k))) break;
    }
    await b.sleep(2500);
    got = JSON.parse(await b.eval(PROBE));
    console.log(S.id, 'spawned', JSON.stringify(got));
    for (const k of S.shoot) {
      const ok =
        await b.eval(`(() => { const T = window.THREE || game.THREE, pp = game.player.position;
        const v = game.vehicles.list.filter((q) => q.typeKey === '${k}' && q.utilitySpot).sort((a, c) => a.mesh.position.distanceTo(pp) - c.mesh.position.distanceTo(pp))[0];
        if (!v) return 0; const o = new T.Vector3(3.2, 1.7, 4.6);
        game.cameraOverride = (dt, cam) => { const m = v.mesh; cam.position.copy(o.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.6, m.position.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; };
        return 1; })()`);
      if (!ok) continue;
      await b.sleep(1500);
      await b.screenshot(`${OUT}/${S.id}_${k}.png`);
    }
    await b.eval('(() => { game.cameraOverride = null; return 1; })()');
    // drive: enter the nearest one, hold W (the player's own input) for a few seconds, then read speed and wheel contact
    const entered = await b.eval(`(async () => {
      const pp = game.player.position;
      const v = game.vehicles.list.filter((q) => q.typeKey === '${S.drive}' && q.utilitySpot).sort((a, c) => a.mesh.position.distanceTo(pp) - c.mesh.position.distanceTo(pp))[0];
      if (!v) return 'none';
      window.__dv = v; window.__t0 = { ...v.body.translation() };
      game.teleport(window.__t0.x + 3, undefined, window.__t0.z, 0);
      await new Promise((r) => setTimeout(r, 600));
      v.locked = false; game.enterVehicle(v);
      await new Promise((r) => setTimeout(r, 1800));
      return String(!!game.player.state?.inVehicle);
    })()`);
    let top = 0;
    await b.key('KeyW', true);
    for (let i = 0; i < 10; i++) {
      await b.sleep(500);
      top = Math.max(
        top,
        +(await b.eval(
          'Math.hypot(window.__dv.body.linvel().x, window.__dv.body.linvel().z) * 3.6',
        )),
      );
    }
    const rolling = await b.eval(
      `JSON.stringify(JSON.parse(${PROBE}).find((q) => Math.hypot(q.at[0] - window.__dv.body.translation().x, q.at[1] - window.__dv.body.translation().z) < 0.2) || null)`,
    );
    // seated shot from the side while rolling
    await b.eval(`(() => { const T = window.THREE || game.THREE, v = window.__dv, o = new T.Vector3(3.6, 1.6, 1.2);
      game.cameraOverride = (dt, cam) => { const m = v.mesh; cam.position.copy(o.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.8, m.position.z); return true; }; return 1; })()`);
    await b.sleep(700);
    await b.screenshot(`${OUT}/${S.id}_${S.drive}_driving.png`);
    await b.key('KeyW', false);
    await b.key('KeyS', true);
    await b.sleep(1500);
    await b.key('KeyS', false);
    const drv =
      await b.eval(`(() => { const v = window.__dv, t0 = window.__t0, t1 = v.body.translation(); game.cameraOverride = null;
      const out = { key: v.typeKey, moved: +Math.hypot(t1.x - t0.x, t1.z - t0.z).toFixed(1) }; game.exitVehicle(); return JSON.stringify(out); })()`);
    console.log(
      S.id,
      'drive',
      'entered',
      entered,
      'topKmh',
      Math.round(top),
      drv,
      'rolling',
      rolling,
    );
  }
  const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
  console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 8)));
});
