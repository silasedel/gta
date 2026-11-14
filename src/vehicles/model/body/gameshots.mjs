// car-bodies: in-game street shots (Keys spawn + South Beach, day / night) and frame timing, in the V2 test browser.
// node src/vehicles/model/body/gameshots.mjs <outPrefix> [spots=house,sb] [hours=10.5,21.5] [measure]
import { withBrowser, GAME_READY } from '../../../../tools/v2/browser.mjs';
const [prefix, spotsArg = 'house,sb', hoursArg = '10.5,21.5', measure = ''] = process.argv.slice(2);
const SB = { x: 3430.586, z: -86.292, dx: -0.1923, dz: 0.9813 };
const STAGE = (spot, hour) => `(() => {
  game.timeExternal = true; if (game.time) { game.time.paused = true; game.time.weatherSeed = 1; } game.timeOfDay = ${hour};
  const T = window.THREE || game.THREE; const V = game.vehicles;
  let base, dir;
  if ('${spot}' === 'dock') {
    if (!game.city) return 'nocity'; const sp = game.city.playerSpawn; const bs = (V.all ? V.all().filter((b) => b.isBoat) : V.boats || []).map((b) => { const t = b.body.translation(); const q = b.body.rotation(); return { b, x: t.x, z: t.z, heading: 2 * Math.atan2(q.y, q.w), d: Math.hypot(t.x - sp.x, t.z - sp.z) }; }).sort((a, b) => a.d - b.d);
    if (!window.__cbMoor) window.__cbMoor = bs[0]; const m = window.__cbMoor; if (!m) return 'no boats';
    const fx = Math.sin(m.heading || 0), fz = Math.cos(m.heading || 0);
    
    const boats = bs;
    const rep = bs.slice(0, 6).map((o) => o.b.typeKey + '@' + o.d.toFixed(0) + 'm dockHits' + (o.b.dockHits || 0));
    window.__cbDock = rep.join(' ');
    const eye = new T.Vector3(m.x + fz * 8 - fx * 9, 6, m.z - fx * 8 - fz * 9), look = new T.Vector3(m.x - fx * 2, 0, m.z - fz * 2);
    game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); return true; };
    return JSON.stringify({ moor: [m.x | 0, m.z | 0, m.type], boats: boats.length, check: window.__cbDock });
  }
  if ('${spot}' === 'house') { const p = game.city.playerSpawn, h = game.city.playerSpawnHeading || 0; game.teleport(p.x, null, p.z, h); base = new T.Vector3(p.x, p.y, p.z); dir = new T.Vector3(Math.sin(h), 0, Math.cos(h)); }
  else { const s = ${JSON.stringify(SB)}; game.teleport(s.x - s.dz * 3.7, null, s.z + s.dx * 3.7, Math.atan2(s.dx, s.dz)); base = new T.Vector3(s.x, 0, s.z); dir = new T.Vector3(s.dx, 0, s.dz);
    if (!window.__cbSpawned) { window.__cbSpawned = 1; const side = new T.Vector3(-s.dz, 0, s.dx); const keys = ['sedan', 'suv', 'compact', 'pickup', 'taxi', 'sports'];
      keys.forEach((k, i) => { const p = base.clone().addScaledVector(dir, 10 + i * 6.2).addScaledVector(side, 3.0); const gy = game.city.groundHeightAt ? game.city.groundHeightAt(p.x, p.z, 5) : 0; try { V.spawn(k, new T.Vector3(p.x, (gy || 0) + 0.6, p.z), Math.atan2(s.dx, s.dz), {}); } catch (e) {} }); } }
  // camera: look at the nearest parked / spawned cars
  const cars = (V.list || []).map((v) => ({ v, d: v.mesh.position.distanceTo(base) })).filter((o) => o.d < 70).sort((a, b) => a.d - b.d);
  window.__cbCars = cars.length;
  let eye, look;
  if (cars.length) {
    const tgt = cars[0].v.mesh.position.clone();
    const c = cars.slice(0, 4).reduce((m, o) => m.add(o.v.mesh.position), new T.Vector3()).multiplyScalar(1 / Math.min(4, cars.length));
    const off = new T.Vector3(tgt.x - c.x, 0, tgt.z - c.z); if (off.length() < 1) off.set(dir.z, 0, -dir.x); off.normalize();
    eye = tgt.clone().addScaledVector(off, 6.5).addScaledVector(dir, -3.5); eye.y = tgt.y + 1.5;
    look = c.clone(); look.y = tgt.y + 0.2;
    window.__cbNear = cars.slice(0, 6).map((o) => o.v.typeKey + '@' + o.d.toFixed(0));
  } else { eye = base.clone().addScaledVector(dir, -6); eye.y += 1.8; look = base.clone().addScaledVector(dir, 30); }
  window.__cbEye = [eye, look];
  game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); } return true; };
  if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); }
  return JSON.stringify({ cars: cars.length, near: window.__cbNear });
})()`;
const MEASURE = `new Promise((res) => { const ft = []; let last = performance.now(), n = 0; const step = () => { const t = performance.now(); ft.push(t - last); last = t; if (++n < 240) return requestAnimationFrame(step); ft.shift(); ft.sort((a, b) => a - b); const avg = ft.reduce((s, v) => s + v, 0) / ft.length; const r = game.renderer.info.render; res(JSON.stringify({ msAvg: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95: +ft[Math.floor(ft.length * 0.95)].toFixed(2), calls: r.calls, tris: r.triangles, cars: game.vehicles.list.length })); }; requestAnimationFrame(step); })`;
await withBrowser({ width: 1600, height: 900, maxSeconds: 420 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?v2=1');
  await b.waitFor(GAME_READY, 300);
  await b.sleep(4000);
  for (const spot of spotsArg.split(',')) for (const hour of hoursArg.split(',').map(Number)) {
    console.log('STAGE', spot, hour, await b.eval(STAGE(spot, hour)));
    await b.sleep(spot === 'sb' ? 9000 : spot === 'dock' ? 14000 : 5000);
    console.log('STAGE2', await b.eval(STAGE(spot, hour)));
    await b.sleep(2500);
    console.log('SHOT', await b.screenshot(`${prefix}_${spot}_${hour < 18 ? 'day' : 'night'}.jpg`, { quality: 84 }));
    if (measure) console.log('FPS', spot, hour, await b.eval(MEASURE));
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 15).join('\n'));
});
