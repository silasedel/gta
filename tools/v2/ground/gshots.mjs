#!/usr/bin/env node
// r2-ground look tool. One game boot, optional probe (JS file evaluated in the page, result -> report), then fixed cameras in
// WORLD coords (or Nico's house-local frame with "nh": true).
//   node tools/v2/ground/gshots.mjs --set g1 [--only a,b] [--spots tools/v2/ground/spots.json] [--q "&foo=1"] [--probe f.js]
// spot: { eye, look, tod, fov, weather, nh, car: { x, z, yaw, drive: [speed m/s, seconds] }, chase: [back, up] (camera behind the car),
//         eval: "js", frames: n (extra frames 300 ms apart), settle: ms }
// Writes docs/v2/shots/ground/<set>_<id>.png and docs/v2/reports/ground-<set>.json.
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'g';
const DIR = path.resolve('docs/v2/shots/ground'); fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync('docs/v2/reports', { recursive: true });
const SPOTS = o.spots === 'none' ? {} : JSON.parse(fs.readFileSync(o.spots || 'tools/v2/ground/spots.json', 'utf8'));
const only = o.only ? String(o.only).split(',') : Object.keys(SPOTS).filter((k) => !SPOTS[k].skip);
const rep = { set: SET, when: new Date().toISOString(), shots: {} };

await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas.g-shot { visibility: visible !important; }'; document.head.appendChild(st); game.renderer.domElement.classList.add('g-shot'); return 1; })()`);
  if (o.probe) {
    const pr = await b.eval(fs.readFileSync(o.probe, 'utf8'));
    fs.writeFileSync(`docs/v2/reports/ground-${SET}-probe.json`, typeof pr === 'string' ? pr : JSON.stringify(pr, null, 1));
    console.log('PROBE', typeof pr === 'string' ? pr.slice(0, 3000) : JSON.stringify(pr).slice(0, 3000));
  }
  for (const id of only) {
    const s = SPOTS[id]; if (!s) continue;
    const setup = `(async () => { const s = ${JSON.stringify(s)}; const T = game.THREE, NH = game.nicoHouse; const V = (p) => s.nh ? NH.toWorld(new T.Vector3(...p)) : new T.Vector3(...p);
      game.timeOfDay = s.tod ?? 11;
      if (game.weather?.set) { try { if (s.weather === 'afterrain') { game.weather.set('rain', { instant: true }); game.weather.set('clear', { seconds: 0.05 }); } else game.weather.set(s.weather || 'clear', { instant: true }); game.weather.hold?.(true); } catch (e) {} }
      let car = null;
      if (s.car) { const c = V([s.car.x, 0, s.car.z]);
        if (s.car.find) { const G = game.city.roadGraph, rx = new RegExp(s.car.find, 'i'); outer: for (let r = 0; r < 60; r += 2) for (let k = 0; k < 16; k++) { const x = c.x + Math.cos(k / 16 * 6.283) * r, z = c.z + Math.sin(k / 16 * 6.283) * r;
          const sf = String(game.city.surfaceAt?.(x, z) || ''), ne = G.nearestEdge(x, z, {}, 40); const rd = ne ? ne.dist - ne.edge.width / 2 : 99;
          if (rx.test(sf) && rd > (s.car.road || 7) && !game.city.isWater(x, z)) { c.x = x; c.z = z; window.__gfound = [x, z, sf, rd]; break outer; } } } try { game.teleport(c.x + 6, undefined, c.z + 6, 0); } catch (e) {}
        const L = game.vehicles.list; car = (s.car.pick ? L.find((v) => new RegExp(s.car.pick, 'i').test(v.spec?.name || v.name || v.id || '')) : null) || L.find((v) => !v.boat && !v.isBoat && v.body);
        window.__gcar = car;
        if (car && car.body) { const y = (game.city.groundHeightAt?.(c.x, c.z) ?? 0) + 0.9, q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), s.car.yaw || 0);
          car.body.setTranslation({ x: c.x, y, z: c.z }, true); car.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true); car.body.setLinvel({ x: 0, y: 0, z: 0 }, true); car.body.setAngvel({ x: 0, y: 0, z: 0 }, true); } }
      const eye = s.eye ? V(s.eye) : null, look = s.look ? V(s.look) : null;
      if (!s.car) { const pl = s.player ? V(s.player) : V([s.eye[0], 0, s.eye[2] + 3]); try { game.teleport(pl.x, undefined, pl.z, 0); } catch (e) {} }
      game.cameraOverride = (dt, cam) => {
        if (s.chase && window.__gcar) { const b = window.__gcar.body, p = b.translation(), r = b.rotation(), q = new T.Quaternion(r.x, r.y, r.z, r.w), f = new T.Vector3(0, 0, 1).applyQuaternion(q); f.y = 0; f.normalize();
          cam.position.set(p.x - f.x * s.chase[0], p.y + s.chase[1], p.z - f.z * s.chase[0]); cam.lookAt(p.x + f.x * 4, p.y + 0.3, p.z + f.z * 4); }
        else { cam.position.copy(eye); cam.lookAt(look); }
        if (s.fov && cam.fov !== s.fov) { cam.fov = s.fov; cam.updateProjectionMatrix(); } return true; };
      if (game.player?.mesh && !s.car) game.player.mesh.visible = false;
      { ${s.eval || ''} }
      return 1; })()`;
    await b.eval(setup);
    await b.sleep(+(s.settle || o.settle || 6000));
    for (let i = 0; i < 40; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    if (s.car && s.car.drive) { // the player gets in and holds W (and A / D for a turn) for drive[1] seconds
      await b.eval('(() => { try { game.enterVehicle(window.__gcar); } catch (e) {} return 1; })()'); await b.sleep(1500);
      await b.key('KeyW', true, 'w'); if (s.car.turn) await b.key('Key' + s.car.turn.toUpperCase(), true, s.car.turn);
      await b.sleep(s.car.drive[1] * 1000);
      if (s.car.stop !== false) { await b.key('KeyW', false, 'w'); if (s.car.turn) await b.key('Key' + s.car.turn.toUpperCase(), false, s.car.turn); }
    }
    await b.sleep(1200);
    const perf = await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 1500) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), calls: ri.calls })); } }; requestAnimationFrame(f); })`);
    const out = path.join(DIR, `${SET}_${id}.png`);
    await b.screenshot(out);
    for (let f = 1; f < +(s.frames || 1); f++) { await b.sleep(300); await b.screenshot(path.join(DIR, `${SET}_${id}_f${f}.png`)); }
    if (s.car && s.car.drive && s.car.stop === false) { await b.key('KeyW', false, 'w'); if (s.car.turn) await b.key('Key' + s.car.turn.toUpperCase(), false, s.car.turn); }
    if (s.car && s.car.drive) await b.eval('(() => { try { game.exitVehicle?.(); } catch (e) {} return 1; })()');
    rep.shots[id] = JSON.parse(perf); console.log(id, perf);
  }
  if (o.after) { const pr = await b.eval(fs.readFileSync(o.after, 'utf8')); fs.writeFileSync(`docs/v2/reports/ground-${SET}-after.json`, typeof pr === 'string' ? pr : JSON.stringify(pr, null, 1)); console.log('AFTER', typeof pr === 'string' ? pr.slice(0, 3000) : JSON.stringify(pr).slice(0, 3000)); }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n')); }
});
fs.writeFileSync(`docs/v2/reports/ground-${SET}.json`, JSON.stringify(rep, null, 2));
