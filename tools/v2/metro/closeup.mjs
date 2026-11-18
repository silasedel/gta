// r2-metro: car interior close-up (wall panels at ~1 m) + the normal ride view. node tools/v2/metro/closeup.mjs
import { withBrowser, startGame } from '../browser.mjs';
const DIR = 'docs/v2/shots/metro';
await withBrowser({ width: 1280, height: 720, maxSeconds: 500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute'); await startGame(b);
  await b.eval('game.metro.enter(2)');
  await b.eval(`new Promise((r) => { const t0 = performance.now(); const f = () => (game.metro.T.phase === 'stopped' || performance.now() - t0 > 60000 ? r(1) : requestAnimationFrame(f)); f(); })`);
  await b.eval(`(() => { const M = game.metro, r = M.root, V = r.position.constructor; const p = r.localToWorld(new V(-3, 0.9, 2.9)); game.teleport(p.x, p.y, p.z, r.rotation.y + Math.PI); })()`);
  await b.sleep(1500); await b.eval('game.metro.openMenu()'); await b.sleep(300); await b.eval('game.metro.choose(3)');
  await b.sleep(1200);
  await b.eval(`(() => { const M = game.metro, r = M.root, V = r.position.constructor; game.cameraOverride = (dt, cam) => { const x = M.R.s; cam.position.copy(r.localToWorld(new V(x - 4.2, 0.95 + 1.6, -0.25 + 0.6))); cam.lookAt(r.localToWorld(new V(x - 6.4, 0.95 + 1.35, -0.25 - 1.95))); return true; }; })()`);
  await b.sleep(900); await b.screenshot(`${DIR}/10_car_wall_closeup.png`);
  await b.eval('game.cameraOverride = null; game.metro.view = "in"; game.cameraOverride = null'); 
  await b.sleep(200);
  console.log('ERRORS', [...new Set(b.errors)].length, [...new Set(b.errors)].slice(0, 4));
});
