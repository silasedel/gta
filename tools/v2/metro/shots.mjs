// r2-metro: end-to-end check of the Southline with screenshots into docs/v2/shots/metro/.
//   node tools/v2/metro/shots.mjs [--q "&metro=1"] [--from 2] [--to 3] [--kiosks 1] [--tod 12]
// street entrance -> station -> train arriving -> board (menu) -> inside mid-ride / outside view -> arrival -> exit to street
import { withBrowser, startGame } from '../browser.mjs';
import fs from 'node:fs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1];
const FROM = +(o.from ?? 2),
  TO = +(o.to ?? 3),
  DIR = 'docs/v2/shots/metro';
fs.mkdirSync(DIR, { recursive: true });
const log = (...x) => console.log(new Date().toISOString().slice(11, 19), ...x);
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q ?? '&metro=1'));
  await startGame(b);
  await b.eval(
    `try { game.weather && game.weather.set('clear', { instant: true }); game.weather && game.weather.hold && game.weather.hold(); } catch (e) {} game.timeOfDay = ${+(o.tod ?? 17)}; 'ok'`,
  );
  const ok = await b.eval('!!(game.metro && game.metro.stations && game.metro.stations.length)');
  log('metro', ok);
  if (!ok) {
    console.log('ERRORS', b.errors.slice(0, 10));
    return;
  }
  const shot = async (n) => {
    await b.screenshot(`${DIR}/${n}.png`);
    log('shot', n);
  };
  const goStreet = async (i) => {
    const L = JSON.parse(
      await b.eval(`JSON.stringify(game.metro.landing(game.metro.stations[${i}]))`),
    );
    await b.eval(`game.teleport(${L.x}, undefined, ${L.z}, game.metro.stations[${i}].yaw)`);
    for (let k = 0; k < 80; k++) {
      if (
        await b.eval(
          `!!game.metro.stations[${i}].root && game.city.streamer.readyAround(${L.x}, ${L.z}, 120)`,
        )
      )
        break;
      await b.sleep(500);
    }
    await b.sleep(2500);
    return L;
  };
  const kioskCam = async (i, name) => {
    await b.eval(`(() => { const s = game.metro.stations[${i}], c = Math.cos(s.yaw), sn = Math.sin(s.yaw), W = (lx, y, lz) => ({ x: s.kx + lx * c + lz * sn, y: s.gy + y, z: s.kz - lx * sn + lz * c });
      const p = W(-5.5, 2.4, 10.5), t = W(0, 1.2, 0); game.cameraOverride = (dt, cam) => { cam.position.set(p.x, p.y, p.z); cam.lookAt(t.x, t.y, t.z); return true; }; })()`);
    await b.sleep(1200);
    await shot(name);
    await b.eval(
      `(() => { const s = game.metro.stations[${i}]; game.cameraOverride = (dt, cam) => { cam.position.set(s.kx, s.gy + 40, s.kz + 0.01); cam.lookAt(s.kx, s.gy, s.kz); return true; }; })()`,
    );
    await b.sleep(1000);
    await shot(name + '_top');
    await b.eval('game.cameraOverride = null');
  };
  if (o.kiosks)
    for (let i = 0; i < 4; i++) {
      await goStreet(i);
      await kioskCam(i, `k${i}_street`);
    }
  // 1. street entrance at FROM
  await goStreet(FROM);
  await kioskCam(FROM, '01_street_entrance');
  await b.sleep(500);
  await shot('01b_street_player');
  // 2. enter
  await b.eval(`game.metro.enter(${FROM})`);
  for (let k = 0; k < 60 && (await b.eval('game.metro.mode')) !== 'platform'; k++)
    await b.sleep(500);
  await b.sleep(2500);
  await shot('02_station');
  // a wide look along the platform
  await b.eval(
    `(() => { const M = game.metro, r = M.root; const V = r.position.constructor; const p = r.localToWorld(new V(-40, 2.6, 13)), t = r.localToWorld(new V(10, 1.4, 2)); game.cameraOverride = (dt, cam) => { cam.position.copy(p); cam.lookAt(t); return true; }; })()`,
  );
  await b.sleep(800);
  await shot('02b_station_wide');
  // 3. train arriving
  await b.eval(
    `new Promise((r) => { const t0 = performance.now(); const f = () => ((game.metro.T.phase === 'arriving' && game.metro.T.s > -70) || performance.now() - t0 > 40000 ? r(1) : requestAnimationFrame(f)); f(); })`,
  );
  log(
    'train',
    await b.eval(
      'game.metro.T.phase + " " + game.metro.T.s.toFixed(1) + " vis " + game.metro.root.visible',
    ),
  );
  await b.eval(
    `(() => { const M = game.metro, r = M.root; const V = r.position.constructor; const p = r.localToWorld(new V(30, 2.2, 6)), t = r.localToWorld(new V(-30, 1.6, -0.5)); game.cameraOverride = (dt, cam) => { cam.position.copy(p); cam.lookAt(t); return true; }; })()`,
  );
  await b.sleep(300);
  await shot('03_train_arriving');
  for (let k = 0; k < 80 && (await b.eval('game.metro.T.phase')) !== 'stopped'; k++)
    await b.sleep(250);
  await b.sleep(1500);
  await shot('03b_train_stopped');
  await b.eval('game.cameraOverride = null');
  // 4. board: walk to the train, open the menu, pick TO
  await b.eval(
    `(() => { const M = game.metro, r = M.root; const V = r.position.constructor; const p = r.localToWorld(new V(-3, 0.9, 2.9)); game.teleport(p.x, p.y, p.z, r.rotation.y + Math.PI); })()`,
  );
  await b.sleep(1200);
  await b.eval('game.metro.openMenu()');
  await b.sleep(500);
  await shot('04_board_menu');
  await b.eval(`game.metro.choose(${TO})`);
  await b.sleep(6000);
  await shot('05_ride_inside');
  await b.eval(`game.metro.view = 'out'`);
  await b.sleep(600);
  await shot('05b_ride_outside');
  await b.eval(`game.metro.view = 'in'`);
  for (let k = 0; k < 120 && (await b.eval('game.metro.R.phase')) !== 'cruise'; k++)
    await b.sleep(250);
  await b.sleep(3000);
  await shot('06_ride_cruise');
  for (let k = 0; k < 120 && (await b.eval('game.metro.R.phase')) !== 'brake'; k++)
    await b.sleep(250);
  await b.sleep(8500);
  await b.eval(`game.metro.view = 'out'`);
  await b.sleep(400);
  await shot('07_arriving_station');
  await b.eval(`game.metro.view = 'in'`);
  for (let k = 0; k < 120 && (await b.eval('game.metro.mode')) !== 'platform'; k++)
    await b.sleep(250);
  await b.sleep(2000);
  await shot('08_arrived_platform');
  log('player', await b.eval('JSON.stringify(game.player.position)'));
  // 5. exit
  await b.eval(`game.metro.exitTo(${TO})`);
  for (
    let k = 0;
    (k < 120 && (await b.eval('game.metro.mode')) !== 'street') ||
    (await b.eval('game.metro.busy'));
    k++
  )
    await b.sleep(250);
  await b.sleep(2500);
  await shot('09_exit_street');
  await kioskCam(TO, '09b_exit_kiosk');
  const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
  console.log('ERRORS', errs.length, errs.slice(0, 12));
});
