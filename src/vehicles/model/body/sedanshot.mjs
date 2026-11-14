// car-bodies: white sedan on Brickell Ave at 11:00, camera 4 m behind, brakes off / on (V2 test browser)
// node src/vehicles/model/body/sedanshot.mjs <outPrefix>
import { withBrowser, GAME_READY } from '../../../../tools/v2/browser.mjs';
const [prefix] = process.argv.slice(2);
const P = { x: -2640.446, z: 1655.479, dx: -0.232, dz: 0.973, w: 7.8 };
const STAGE = (brake) => `(() => {
  game.timeExternal = true; if (game.time) { game.time.paused = true; game.time.weatherSeed = 1; } game.timeOfDay = 11;
  if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); }
  const T = window.THREE || game.THREE, V = game.vehicles, p = ${JSON.stringify(P)}, h = Math.atan2(p.dx, p.dz);
  const side = new T.Vector3(p.dz, 0, -p.dx); // right-hand lane
  if (!window.__cbS) { game.teleport(p.x - side.x * 8, null, p.z - side.z * 8, h);
    const gy = (game.city.groundHeightAt ? game.city.groundHeightAt(p.x, p.z, 5) : 0) || 0;
    window.__cbS = V.spawn('sedan', new T.Vector3(p.x + side.x * 2, gy + 0.7, p.z + side.z * 2), h, { color: 0xf2f2f0 }); }
  const v = window.__cbS; if (!v) return 'spawn failed';
  const f = new T.Vector3(p.dx, 0, p.dz), e = new T.Vector3(), l = new T.Vector3();
  game.cameraOverride = (dt, cam) => { const m = v.mesh.position; e.copy(m).addScaledVector(f, -(v.spec.L / 2 + 4)); e.y = m.y + 1.25; l.copy(m).addScaledVector(f, 2); l.y = m.y + 0.5;
    cam.position.copy(e); cam.lookAt(l); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    const lm = v.car.lightMats; lm.tail.emissiveIntensity = ${brake ? 1.8 : 0.15}; lm.tailLed.emissiveIntensity = ${brake ? 3.2 : 1.4}; lm.drl && (lm.drl.emissiveIntensity = 6); return true; };
  return v.typeKey + ' ok';
})()`;
await withBrowser({ width: 1600, height: 900, maxSeconds: 360 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?v2=1');
  await b.waitFor(`${GAME_READY} && game.city && game.city.playerSpawn && game.vehicles && game.vehicles.list`, 300);
  await b.sleep(4000);
  console.log('S', await b.eval(STAGE(false))); await b.sleep(12000);
  console.log('S', await b.eval(STAGE(false))); await b.sleep(1500);
  console.log('SHOT', await b.screenshot(`${prefix}_brakes_off.jpg`, { quality: 88 }));
  console.log('S', await b.eval(STAGE(true))); await b.sleep(1500);
  console.log('SHOT', await b.screenshot(`${prefix}_brakes_on.jpg`, { quality: 88 }));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 8).join('\n'));
});
