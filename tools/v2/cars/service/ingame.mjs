// In-game check of the service trucks: node tools/v2/cars/service/ingame.mjs <outdir>
// Boots the game (morning), parks a tow truck (truck12) and a garbage truck (truck13) beside the player for close-ups
// (front 3/4, side, rear), then lets the garbage manager run and reports game.service.stats + console errors.
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../../browser.mjs';
const OUT = process.argv[2] || 'docs/v2/shots/cars/service/ingame';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1280, height: 760, maxSeconds: 700 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = 8.2; const s = document.createElement('style'); s.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(s); return 1; })()`,
  );
  await b.sleep(8000);
  const placed = await b.eval(`(async () => {
    const T = window.THREE || game.THREE, V = game.vehicles, pp = game.player.position.clone();
    const G = game.miamiData?.roadGraph || game.city?.roadGraph, r = G.nearestEdge(pp.x, pp.z, {}, 200);
    const h = Math.atan2(r.dir.x, r.dir.z), fx = Math.sin(h), fz = Math.cos(h);
    const out = {};
    for (const [k, d] of [['truck12', 14], ['truck13', -14]]) {
      const m = await import('/src/vehicles/glb/glbCar.js'); await m.loadCarModel(k);
      const v = V.spawn(k, new T.Vector3(r.point.x + fx * d, r.y ?? pp.y, r.point.z + fz * d), h, { snap: true });
      window['__' + k] = v; out[k] = v ? { ok: true, company: v.car?._svc?.company, cols: v.svcColliders?.length || 0, color: v.look?.color } : null;
    }
    game.teleport(r.point.x + fz * 12, undefined, r.point.z - fx * 12, 0);
    return JSON.stringify(out);
  })()`);
  console.log('placed', placed);
  await b.sleep(6000);
  const shots = [
    ['truck12', 'front34', [4.5, 2.2, 8.5]],
    ['truck12', 'side', [8.5, 1.8, 0]],
    ['truck12', 'rear34', [-4.5, 2.4, -9]],
    ['truck13', 'front34', [5, 2.6, 9]],
    ['truck13', 'side', [9, 2.2, -1]],
    ['truck13', 'rear34', [-4.5, 2.8, -10]],
    ['truck13', 'otherside', [-9, 2.2, -1]],
  ];
  for (const [k, view, off] of shots) {
    await b.eval(`(() => { const T = window.THREE || game.THREE, v = window.__${k}; if (!v) return 0; const o = new T.Vector3(${off.join(',')});
      game.cameraOverride = (dt, cam) => { const m = v.mesh; cam.position.copy(o.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.6, m.position.z); if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
    await b.sleep(1800);
    await b.screenshot(`${OUT}/${k}_${view}.png`);
  }
  await b.eval(
    '(() => { game.cameraOverride = null; window.__truck12 && game.vehicles.remove(window.__truck12); window.__truck13 && game.vehicles.remove(window.__truck13); return 1; })()',
  );
  // the garbage manager: let it find curb carts and spawn a truck
  let st = null;
  for (let i = 0; i < 9; i++) {
    await b.sleep(5000);
    st = await b.eval(
      'JSON.stringify({ ...game.service?.stats, live: game.service?.garbage.length, tows: game.service?.tow.length, carts: game.lotProps?.stats?.carts })',
    );
  }
  console.log('service', st);
  const g =
    await b.eval(`(() => { const v = game.service?.garbage[0]; if (!v) return 0; const T = window.THREE || game.THREE, o = new T.Vector3(6, 3.5, 12);
    game.cameraOverride = (dt, cam) => { const m = v.mesh; cam.position.copy(o.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(m.position.x, m.position.y + 0.8, m.position.z); return true; }; return JSON.stringify({ speed: v.speed, ghost: !!v.ghost }); })()`);
  console.log('garbage live', g);
  if (g) {
    await b.sleep(2500);
    await b.screenshot(`${OUT}/garbage_route.png`);
    await b.sleep(12000);
    await b.screenshot(`${OUT}/garbage_route2.png`);
    console.log('after', await b.eval('JSON.stringify(game.service.stats)'));
  }
  const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
  console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 8)));
});
