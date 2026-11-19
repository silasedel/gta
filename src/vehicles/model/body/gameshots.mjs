// car-bodies in-game check (V2 test browser): traffic car from behind at street level, convertible hit test above the
// doors (C2), boats near Nico's dock (C4).  node src/vehicles/model/body/gameshots.mjs <outPrefix> [hour=10.5]
import { withBrowser, GAME_READY } from '../../../../tools/v2/browser.mjs';
const [prefix, hour = '10.5'] = process.argv.slice(2);
const HIDE = `if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); }`;
const PREP = `(() => { game.timeExternal = true; if (game.time) { game.time.paused = true; game.time.weatherSeed = 1; } game.timeOfDay = ${+hour}; ${HIDE} return true; })()`;
// follow the nearest moving AI car from behind, 1.3 m up, 6.5 m back
const TRAFFIC = `(() => {
  const T = window.THREE || game.THREE, V = game.vehicles, pp = game.player.position;
  const cars = V.list.filter((v) => v.ai && !v.isBoat && v.mesh).map((v) => ({ v, d: v.mesh.position.distanceTo(pp) })).sort((a, b) => a.d - b.d);
  if (!cars.length) return 'no traffic';
  const v = cars[0].v; window.__cbT = v;
  const e = new T.Vector3(), l = new T.Vector3(), f = new T.Vector3();
  game.cameraOverride = (dt, cam) => { const m = window.__cbT.mesh; f.set(0, 0, 1).applyQuaternion(m.quaternion); f.y = 0; f.normalize();
    e.copy(m.position).addScaledVector(f, -6.5); e.x += f.z * 1.2; e.z -= f.x * 1.2; e.y = m.position.y + 1.3; l.copy(m.position).addScaledVector(f, 4); l.y = m.position.y + 0.6;
    cam.position.copy(e); cam.lookAt(l); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; };
  return v.typeKey + ' @' + cars[0].d.toFixed(0) + 'm';
})()`;
// spawn the convertible beside the player and cast rays across its cabin at several heights against its own colliders
const C2 = `(() => {
  const T = window.THREE || game.THREE, V = game.vehicles, pp = game.player.position;
  let v = window.__cbC; if (!v) { const p = new T.Vector3(pp.x + 6, pp.y + 0.8, pp.z); v = window.__cbC = V.spawn('tarpon_cabrio', p, 0, {}); }
  if (!v || !v.body) return 'spawn failed';
  const tr = v.body.translation(), gy = tr.y - (v.groundOff || 0), out = [];
  for (const h of [0.6, 0.85, 1.0, 1.15, 1.3]) {
    let hit = false;
    for (let i = 0; i < v.body.numColliders(); i++) { const c = v.body.collider(i); try { const t = c.castRay({ origin: { x: tr.x - 4, y: gy + h, z: tr.z }, dir: { x: 1, y: 0, z: 0 } }, 8, true); if (t !== null && t >= 0) hit = true; } catch (e) { return 'castRay error ' + e.message; } }
    out.push(h.toFixed(2) + 'm:' + (hit ? 'HIT' : 'miss'));
  }
  const e = new T.Vector3(tr.x - 5, gy + 2.2, tr.z - 5), l = new T.Vector3(tr.x, gy + 0.8, tr.z);
  game.cameraOverride = (dt, cam) => { cam.position.copy(e); cam.lookAt(l); return true; };
  return 'belt ' + (v.spec.belt || 0).toFixed(2) + ' | ' + out.join(' ');
})()`;
const C4 = `(() => {
  const T = window.THREE || game.THREE, V = game.vehicles, sp = game.city.playerSpawn;
  const bs = (V.all ? V.all() : V.boats).filter((b) => b.isBoat).map((b) => { const t = b.body.translation(), q = b.body.rotation(); return { b, x: t.x, z: t.z, h: 2 * Math.atan2(q.y, q.w), d: Math.hypot(t.x - sp.x, t.z - sp.z) }; }).sort((a, b) => a.d - b.d);
  if (!bs.length) return 'no boats';
  const m = window.__cbB ||= bs[0], fx = Math.sin(m.h), fz = Math.cos(m.h), L = m.b.spec.L;
  const sx = m.x - fx * (L / 2), sz = m.z - fz * (L / 2); // look at the transom / motors
  const e = new T.Vector3(sx - fx * 6 + fz * 5, 5, sz - fz * 6 - fx * 5), l = new T.Vector3(sx, 0.3, sz);
  game.cameraOverride = (dt, cam) => { cam.position.copy(e); cam.lookAt(l); return true; };
  return bs.slice(0, 6).map((o) => o.b.typeKey + '@' + o.d.toFixed(0) + 'm dockHits=' + (o.b.dockHits || 0)).join(' ');
})()`;
await withBrowser({ width: 1600, height: 900, maxSeconds: 420 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?v2=1');
  await b.waitFor(
    `${GAME_READY} && game.city && game.city.playerSpawn && game.vehicles && game.vehicles.list`,
    300,
  );
  await b.sleep(6000);
  console.log('PREP', await b.eval(PREP));
  console.log('TRAFFIC', await b.eval(TRAFFIC));
  await b.sleep(2500);
  console.log('SHOT', await b.screenshot(`${prefix}_traffic_rear.jpg`, { quality: 86 }));
  console.log('C2', await b.eval(C2));
  await b.sleep(2500);
  console.log('C2b', await b.eval(C2));
  console.log('SHOT', await b.screenshot(`${prefix}_c2_cabrio.jpg`, { quality: 86 }));
  console.log('C4', await b.eval(C4));
  await b.sleep(3000);
  console.log('SHOT', await b.screenshot(`${prefix}_c4_dock.jpg`, { quality: 86 }));
  if (b.errors.length)
    console.log(
      'ERRORS',
      [...new Set(b.errors)]
        .filter((e) => !/favicon/.test(e))
        .slice(0, 10)
        .join('\n'),
    );
});
