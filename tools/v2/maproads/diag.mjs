// maproads: in-game look at a spot: every fixed collider hit straight down, the game's height samplers, and a shot.
//   node tools/v2/maproads/diag.mjs x,z[;x,z...]   -> docs/v2/shots/maproads/diag_<i>.png + printed hits
import path from 'node:path';
import { withBrowser, GAME_READY } from '../browser.mjs';
const pts = String(process.argv[2])
  .split(';')
  .map((s) => s.split(',').map(Number));
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 480);
  await b.waitFor("typeof game.teleport === 'function'", 300);
  let i = 0;
  for (const [x, z] of pts) {
    await b.eval(`game.teleport(${x + 30}, null, ${z + 30}, 0) || true`);
    await b
      .waitFor(
        `(() => { const s = game.city.streamer; return !s || !s.readyAround || s.readyAround(${x}, ${z}, 200); })()`,
        120,
      )
      .catch(() => {});
    await b.sleep(2500);
    const r =
      await b.eval(`(() => { const R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, FIX = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS; const out = [];
      for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) { const hits = []; W.intersectionsWithRay(new R.Ray({ x: ${x} + dx, y: 40, z: ${z} + dz }, { x: 0, y: -1, z: 0 }), 80, true, (h) => { const c = h.collider; hits.push([+(40 - h.timeOfImpact).toFixed(2), c.shape.type, c.parent() ? c.parent().handle : -1, (c.__kind || c.userData || '')]); return true; }, FIX);
        out.push({ dx, dz, hits: hits.sort((a, b) => b[0] - a[0]).slice(0, 6) }); }
      const c = game.city; return JSON.stringify({ g: c.groundHeightAt(${x}, ${z}), water: c.isWater && c.isWater(${x}, ${z}), surf: c.surfaceAt && c.surfaceAt(${x}, ${z}), out }); })()`);
    console.log('DIAG', x, z, r);
    await b.eval(
      `(() => { const T = game.THREE || window.THREE; const eye = new T.Vector3(${x} + 45, 22, ${z} + 45), look = new T.Vector3(${x}, 0, ${z}); game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); return true; }; for (const c of document.querySelectorAll('canvas')) if (c !== game.renderer.domElement) c.style.display = 'none'; return true; })()`,
    );
    await b.sleep(3500);
    console.log(
      'SHOT',
      await b.screenshot(path.resolve('docs/v2/shots/maproads', `diag_${i++}.png`)),
    );
  }
});
