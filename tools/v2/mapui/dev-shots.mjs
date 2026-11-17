// r2-mapui: dev mode check in the real game (muted): code panel (wrong code, then 6969), DEV badge, pause-map teleport
// button, mid-teleport veil, after landing (on foot and in a car), police lock. Shots -> docs/v2/shots/r2-mapui/dev/
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';

const OUT = 'docs/v2/shots/r2-mapui/dev';
fs.mkdirSync(OUT, { recursive: true });
const PORT = process.argv[2] || '5200';
await withBrowser({ width: 1600, height: 900, maxSeconds: 1800 }, async (b) => {
  await b.goto(`http://127.0.0.1:${PORT}/?mute`);
  if (!(await startGame(b, 300))) throw new Error('game did not start');
  await b.sleep(5000);
  const ev = (s) => b.eval(s);
  const shot = (n, clip) => b.screenshot(`${OUT}/${n}.jpg`, clip ? { clip } : {});
  const log = (...a) => console.log(...a);
  await ev(`(() => { localStorage.removeItem('southline.dev'); localStorage.removeItem('southline.dev.policeLock'); game.dev.setOn(false); game.timeExternal = true; game.timeOfDay = 13; return 1; })()`);
  // code panel
  await ev(`(() => { game.hud.setPaused(true); return 1; })()`); await b.sleep(900);
  await ev(`(() => { document.querySelector('.ps-dev-codes').click(); return 1; })()`); await b.sleep(400);
  for (const d of '1234') { await b.key('Digit' + d, true, d); await b.key('Digit' + d, false, d); }
  await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(120);
  await shot('01_code_wrong_shake');
  log('after wrong code, dev =', await ev('game.dev.on'));
  await b.sleep(500);
  // code-only key events (no text), like a gamepad / automation / QA's script: 6 9 6 9 Enter
  for (const d of '6969') { await b.key('Digit' + d, true, d); await b.key('Digit' + d, false, d); await b.sleep(120); }
  await shot('02_code_typed');
  await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(600);
  log('after 6969, dev =', await ev('game.dev.on'), 'stored =', await ev(`localStorage.getItem('southline.dev')`));
  await shot('03_code_panel_dev_on');
  await b.key('Escape', true, 'Escape'); await b.key('Escape', false, 'Escape'); await b.sleep(300);
  log('panel closed:', !(await ev("document.querySelector('.ps-dev-panel').classList.contains('open')")), 'still paused =', await ev('game.ui.paused'));
  // badge
  await ev(`(() => { game.hud.setPaused(false, false); return 1; })()`); await b.sleep(1500);
  await shot('04_badge_and_lock_full');
  // teleport on foot: waypoint at Homestead
  const W1 = [-1320, 3190];
  await ev(`(() => { game.hud.setPaused(true); return 1; })()`); await b.sleep(900);
  await ev(`(() => { game.waypoint = { x: ${W1[0]}, z: ${W1[1]} }; game.hud._mapZoom(0.5, ${W1[0] + 300}, ${W1[1] + 200}); return 1; })()`); await b.sleep(2500);
  log('teleport button shown =', await ev(`document.querySelector('.ps-dev-tp').classList.contains('show')`));
  await shot('05_map_teleport_button');
  await b.key('KeyT', true, 't'); await b.key('KeyT', false, 't'); await b.sleep(700);
  await shot('06_mid_teleport_veil');
  for (let i = 0; i < 300 && (await ev('game.dev.busy')); i++) await b.sleep(200);
  await b.sleep(2500);
  log('on foot after landing', await ev(`JSON.stringify({ p: [game.player.position.x, game.player.position.y, game.player.position.z].map((v) => +v.toFixed(2)), ground: +game.city.groundHeightAt(game.player.position.x, game.player.position.z).toFixed(2), district: game.city.districtAt(game.player.position.x, game.player.position.z) })`));
  await shot('07_after_landing_foot');
  // police lock
  await ev(`(() => { document.querySelector('.ps-dev-lock').click(); return 1; })()`); await b.sleep(300);
  await ev(`(() => { try { game.wanted.set(3, game.player.position, { visual: true }); } catch (e) {} try { game.emit('crime', { type: 'assault', position: game.player.position.clone(), witnessed: true }); } catch (e) {} return 1; })()`); await b.sleep(1200);
  log('police lock', await ev(`JSON.stringify({ lock: game.dev.policeLock, level: game.wanted.level })`));
  await shot('08_police_lock_corner', { x: 1180, y: 0, width: 420, height: 300 });
  await ev(`(() => { game.dev.setPoliceLock(false, true); game.wanted.set(2, game.player.position, { visual: true }); return 1; })()`); await b.sleep(800);
  log('lock off, wanted can rise again:', await ev('game.wanted.level'));
  await ev(`(() => { game.wanted.clear('test'); game.dev.setPoliceLock(true, true); return 1; })()`); await b.sleep(500);
  await shot('09_police_lock_on_corner', { x: 1180, y: 0, width: 420, height: 300 });
  // teleport in a car: spawn, enter, teleport to Florida City
  const ok = await ev(`(() => { const P = game.player, h = P.heading || 0; const v = game.vehicles.spawn('sedan', P.position.clone(), h, {}); if (!v) return 'no car'; game.enterVehicle(v); return 'ok'; })()`);
  await b.sleep(2500);
  log('car', ok, 'in vehicle =', await ev('!!game.player.state.inVehicle'));
  await ev(`(() => { game.dev.teleportTo(-330, 3520); return 1; })()`); await b.sleep(600);
  for (let i = 0; i < 300 && (await ev('game.dev.busy')); i++) await b.sleep(200);
  await b.sleep(3000);
  log('car after landing', await ev(`(() => { const v = game.player.state.vehicle; if (!v) return 'not in car'; const t = v.body.translation(); return JSON.stringify({ p: [t.x, t.y, t.z].map((x) => +x.toFixed(2)), ground: +game.city.groundHeightAt(t.x, t.z).toFixed(2), speed: +(v.speedKmh || 0).toFixed(1), street: game.city.streetNameAt?.(t.x, t.z) }); })()`));
  await shot('10_after_landing_car');
  // QA-009/010/011: landing spots that fell through before (glades, Keys beach) and deep water; out of the car first
  await ev(`(() => { try { game.exitVehicle?.(); } catch (e) {} return 1; })()`); await b.sleep(1500);
  if (await ev('!!game.player.state.inVehicle')) { await b.key('KeyF', true, 'f'); await b.key('KeyF', false, 'f'); await b.sleep(2500); }
  for (const [name, x, z] of [['glades', -2394.6, 2663.5], ['keys_beach', -895, 4830], ['florida_bay_water', -3080, 4950]]) {
    await ev(`(() => { game.dev.teleportTo(${x}, ${z}); return 1; })()`); await b.sleep(500);
    for (let i = 0; i < 300 && (await ev('game.dev.busy')); i++) await b.sleep(200);
    const lt = await ev('JSON.stringify(game.dev.lastTeleport)');
    const ys = [];
    for (let i = 0; i < 6; i++) { await b.sleep(500); ys.push(await ev(`(() => { const p = game.player.position; return [+p.y.toFixed(2), +game.city.groundHeightAt(p.x, p.z).toFixed(2), !!game.player.swimming]; })()`)); }
    log(name, lt, 'y/ground/swim over 3 s:', JSON.stringify(ys));
    await shot('11_landing_' + name);
  }
  log('errors', b.errors.filter((e) => !/favicon/.test(e)).map((e) => e.slice(0, 240)).slice(0, 10));
});
