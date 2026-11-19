#!/usr/bin/env node
// Nico's house round 8: reference cameras at exact COMPASS headings (docs/v2/plan/nico_house/r8/SPEC.md).
//   node tools/v2/keys/r8/shots8.mjs --set r8a [--only B,D,top] [--q "&foo=1"] [--hud]
// A spot is given relative to the house center C (game.nicoHouse.center, world): eye = C + [east, up, south] meters (up above the
// yard grade), heading = compass degrees (0 = north, 90 = east), pitch = degrees (+ up), fov. 'top' looks straight down, north up.
// Writes docs/v2/shots/nico_r8/<set>_<id>.png, then run sheets8.py <set> for the reference | game sheets.
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'r8';
const DIR = path.resolve('docs/v2/shots/nico_r8'); fs.mkdirSync(DIR, { recursive: true });
const SPOTS = JSON.parse(fs.readFileSync(o.spots || 'tools/v2/keys/r8/spots8.json', 'utf8'));
const only = o.only ? String(o.only).split(',') : Object.keys(SPOTS).filter((k) => !SPOTS[k].skip);
const rep = { set: SET, when: new Date().toISOString(), shots: {} };

await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 1300) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  try { await b.waitFor(GAME_READY + " && typeof game.teleport === 'function' && !!game.nicoHouse", +(o.boot || 420)); }
  catch (e) { console.log('BOOT FAILED', await b.eval('JSON.stringify({ ready: !!(window.game && game.ready), v2: !!(window.game && game.v2), nh: !!(window.game && game.nicoHouse) })').catch(() => '?')); console.log('ERRORS\n' + [...new Set(b.errors)].slice(0, 30).join('\n')); console.log('LOGS\n' + b.logs.slice(-40).join('\n')); throw e; }
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; if (!${!!o.hud}) { const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas.keys-shot { visibility: visible !important; }'; document.head.appendChild(st); game.renderer.domElement.classList.add('keys-shot'); } return 1; })()`);
  if (o.probe) { const pr = await b.eval(fs.readFileSync(o.probe, 'utf8')); fs.writeFileSync(path.join(DIR, `${SET}_probe.json`), typeof pr === 'string' ? pr : JSON.stringify(pr, null, 1)); console.log('probe written'); }
  for (const id of only) {
    const s = SPOTS[id]; if (!s) continue;
    await b.eval(`(() => { const s = ${JSON.stringify(s)}, T = game.THREE, NH = game.nicoHouse;
      const C = NH.center ? NH.center.clone() : NH.toWorld(new T.Vector3(0, 0, -7)), gy = NH.group.position.y;
      const eye = new T.Vector3(C.x + s.eye[0], gy + s.eye[1], C.z + s.eye[2]);
      let look;
      if (s.top) look = new T.Vector3(eye.x, gy, eye.z - 0.001);
      else { const h = s.hdg * Math.PI / 180, p = (s.pitch || 0) * Math.PI / 180; look = eye.clone().add(new T.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p))); }
      game.timeOfDay = s.tod ?? 11;
      if (game.weather?.set) { try { game.weather.set(s.weather || 'clear', { instant: true }); game.weather.hold?.(true); } catch (e) {} }
      const pl = s.player ? new T.Vector3(C.x + s.player[0], 0, C.z + s.player[2]) : eye; try { game.teleport(pl.x, undefined, pl.z, s.ph ?? 0); } catch (e) {}
      game.cameraOverride = (dt, cam) => { cam.position.copy(eye); if (s.top) cam.up.set(0, 0, -1); else cam.up.set(0, 1, 0); cam.lookAt(look); if (cam.fov !== (s.fov || 60)) { cam.fov = s.fov || 60; cam.updateProjectionMatrix(); } return true; };
      if (game.player?.mesh) game.player.mesh.visible = !!s.showPlayer;
      { ${s.eval || ''} }
      return 1; })()`);
    await b.sleep(+(o.settle || 5000));
    for (let i = 0; i < 30; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    await b.sleep(1200);
    const perf = await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 1500) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), calls: ri.calls, tris: ri.triangles })); } }; requestAnimationFrame(f); })`);
    await b.screenshot(path.join(DIR, `${SET}_${id}.png`));
    rep.shots[id] = JSON.parse(perf); console.log(id, perf);
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 40); console.log('ERRORS\n' + rep.errors.join('\n')); }
});
fs.writeFileSync(path.join(DIR, `${SET}_report.json`), JSON.stringify(rep, null, 2));
