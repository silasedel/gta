#!/usr/bin/env node
// r2-veg shots: one boot, fixed cameras, before / after in one session.
//   node tools/v2/vegetation/r2shots.mjs --set a1 --spots tools/v2/vegetation/r2spots.json [--only a,b] [--ab "&vegr2=0"] [--probe file.js]
//   [--frames N --fgap ms] (extra frames of the same camera: flicker / dot check) [--w 1600 --h 900]
// spot: { house: true (eye / look in Nico's house-local frame) | world eye / look, "at": [x, z] (player teleport, default under the eye),
//         tod, fov, weather, eval: "js run after setup", tree: { near: [x, z], kind, d, h, az } (camera d m from the nearest countryside
//         tree's crown, at crown height + h) }
// -> docs/v2/shots/vegetation/r2/<set>_<id>[B].png, docs/v2/reports/veg-r2-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const DIR = path.resolve('docs/v2/shots/vegetation/r2');
fs.mkdirSync(DIR, { recursive: true });
const SPOTS = o.spots ? JSON.parse(fs.readFileSync(o.spots, 'utf8')) : {},
  only = o.only ? String(o.only).split(',') : Object.keys(SPOTS).filter((k) => !SPOTS[k].skip);
const SET = o.set || 'r',
  rep = { set: SET, when: new Date().toISOString(), runs: {} },
  CAMS = {};
await withBrowser(
  { width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 1400) },
  async (b) => {
    for (const [tag, q] of [['', o.q || ''], ...(o.ab ? [['B', (o.q || '') + o.ab]] : [])]) {
      await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + q);
      const T0 = Date.now(),
        lg = (m) => console.log(`[${Math.round((Date.now() - T0) / 1000)}s] ${m}`);
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
      lg('ready');
      await startGame(b);
      lg('started');
      await b.eval(
        `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas.veg-shot { visibility: visible !important; }'; document.head.appendChild(st); game.renderer.domElement.classList.add('veg-shot'); return 1; })()`,
      );
      if (o.probe) {
        const pr = await b.eval(fs.readFileSync(o.probe, 'utf8')).catch((e) => String(e));
        const f = `docs/v2/reports/veg-r2-${SET}-probe.json`;
        fs.writeFileSync(f, typeof pr === 'string' ? pr : JSON.stringify(pr, null, 1));
        console.log('probe ->', f);
      }
      const R = (rep.runs[tag || 'A'] = {});
      for (const id of only) {
        const s = SPOTS[id];
        if (!s) continue;
        const setup = `(() => { const s = ${JSON.stringify(s)}, cam0 = ${JSON.stringify(CAMS[id] || null)}; const T = game.THREE, NH = game.nicoHouse;
        const V = (p) => s.house && NH ? NH.toWorld(new T.Vector3(...p)) : new T.Vector3(...p);
        game.timeOfDay = s.tod ?? 11;
        if (game.weather?.set) { try { game.weather.set(s.weather || 'clear', { instant: true }); game.weather.hold?.(true); } catch (e) {} }
        let eye = s.eye ? V(s.eye) : null, look = s.look ? V(s.look) : null;
        const at = s.at ? V([s.at[0], 0, s.at[1]]) : eye || (s.tree ? new T.Vector3(s.tree.near[0], 0, s.tree.near[1]) : new T.Vector3());
        try { game.teleport(at.x, undefined, at.z, s.heading ?? 0); } catch (e) {}
        if (cam0) { eye = new T.Vector3(...cam0[0]); look = new T.Vector3(...cam0[1]); }
        window.__vegShotCam = eye && look ? [eye.toArray(), look.toArray()] : null;
        const mv = s.move ? new T.Vector3(...s.move) : null, t0 = performance.now(); window.__vegMoveT0 = () => {}; if (eye && look) game.cameraOverride = (dt, cam) => { const k = mv && window.__vegMoveOn ? (performance.now() - window.__vegMoveOn) / 1000 : 0; cam.position.copy(eye); if (k) cam.position.addScaledVector(mv, k); const lk = look.clone(); if (k) lk.addScaledVector(mv, k); cam.lookAt(lk); const f = s.fov || 55; if (cam.fov !== f) { cam.fov = f; cam.updateProjectionMatrix(); } return true; };
        if (game.player?.mesh && s.hidePlayer !== false) game.player.mesh.visible = false;
        window.__vegMoveOn = 0; { ${s.eval || ''} }
        return 1; })()`;
        await b.eval(setup);
        lg(id + ' set');
        for (let i = 0; i < 40; i++) {
          await b.sleep(1000);
          const ok = await b
            .eval(
              `(() => { const st = game.city?.streamer; const cs = game.vegetation?.countryside?.stats?.(); return (!st || st.pending() < 3) && (!cs || !cs.pending); })()`,
            )
            .catch(() => false);
          if (ok && i > 3) break;
        }
        if (s.tree && !CAMS[id]) {
          // aim at the nearest countryside tree's crown now that the cells exist
          const r =
            await b.eval(`(() => { const s = ${JSON.stringify(s)}, T = game.THREE, cs = game.vegetation?.countryside; if (!cs) return null; const t = cs.nearestTree(s.tree.near[0], s.tree.near[1], s.tree.kind || null); if (!t) return null;
          const md = game.city.flora.models[t.kind]; const sc = t.s || 1, H = (md ? md.height : 8) * (s.tree.sc ?? 1), cy = t.y + H * (s.tree.fy ?? 0.72), az = s.tree.az ?? 0.6, d = s.tree.d ?? 3.5;
          const look = new T.Vector3(t.x, cy, t.z), eye = new T.Vector3(t.x + Math.cos(az) * d, cy + (s.tree.h ?? -0.6), t.z + Math.sin(az) * d);
          game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); const f = s.fov || 55; if (cam.fov !== f) { cam.fov = f; cam.updateProjectionMatrix(); } return true; };
          window.__vegShotCam = [eye.toArray(), look.toArray()]; return { kind: t.kind, x: +t.x.toFixed(1), z: +t.z.toFixed(1) }; })()`);
          console.log(id, 'tree', JSON.stringify(r));
        }
        if (s.post && !CAMS[id]) {
          const r = await b
            .eval(`(async () => { const s = ${JSON.stringify(s)}; ${s.post} })()`)
            .catch((e) => String(e).slice(0, 300));
          console.log(id, 'post', typeof r === 'string' ? r : JSON.stringify(r));
        } // after streaming settled (e.g. aim at a trunk base)
        CAMS[id] ||= await b.eval('window.__vegShotCam');
        await b.sleep(+(o.settle || 2500));
        const perf = await b.eval(
          `new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; (function f() { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 2500) requestAnimationFrame(f); else { ts.shift(); ts.sort((x, y) => x - y); const r = game.renderer.info.render; res({ avgMs: +(ts.reduce((x, y) => x + y, 0) / ts.length).toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(1), calls: r.calls, tris: r.triangles }); } })(); })`,
        );
        if (s.move) {
          await b.eval('window.__vegMoveOn = performance.now(); 1');
          await b.sleep(+(s.moveMs || 900));
        }
        await b.screenshot(path.join(DIR, `${SET}${tag}_${id}.png`));
        for (let f = 1; f < +(o.frames || 1); f++) {
          await b.sleep(+(o.fgap || 120));
          await b.screenshot(path.join(DIR, `${SET}${tag}_${id}_f${f}.png`));
        }
        R[id] = perf;
        console.log(tag || 'A', id, JSON.stringify(perf));
      }
    }
    const errs = [...new Set(b.errors.filter((e) => !/favicon/.test(e)))];
    if (errs.length) {
      rep.errors = errs.slice(0, 20);
      console.log('ERRORS', errs.slice(0, 8).join('\n'));
    }
  },
);
fs.writeFileSync(path.resolve(`docs/v2/reports/veg-r2-${SET}.json`), JSON.stringify(rep, null, 1));
