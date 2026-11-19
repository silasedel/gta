#!/usr/bin/env node
// Vegetation track: same-camera countryside shots + a drive sequence (pop-in check). V2 test browser only (see browser.mjs).
//   node tools/v2/veg-shots.mjs --set before|after [--find] [--drive] [--url http://127.0.0.1:5200/] [--q "&veg2=0"]
// Writes docs/v2/shots/vegetation/countryside/<set>_<id>.png, <set>_drive_NN.png and docs/v2/reports/vegetation-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from './browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SETS = String(o.set || 'after').split(',');
const DIR = path.resolve('docs/v2/shots/vegetation/countryside');
fs.mkdirSync(DIR, { recursive: true });
const SPOTF = path.resolve('docs/v2/reports/vegetation-spots.json');
const urlOf = (set) =>
  (o.url || 'http://127.0.0.1:5200/') + '?mute' + (set === 'before' ? '&veg2=0' : '') + (o.q || '');
const HIDE = `(() => { game.timeExternal = true; game.timeOfDay = ${o.tod || 11}; if (!window.__vc) { window.__vc = document.createElement('style'); window.__vc.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__vc); } const gc = game.renderer && game.renderer.domElement; for (const c of document.querySelectorAll('canvas')) if (c !== gc) c.style.setProperty('display', 'none', 'important'); if (gc) { let e = gc; while (e && e !== document.body) { e.style.setProperty('visibility', 'visible', 'important'); e = e.parentElement; } } return true; })()`;
// find road spots: points on named roads over synthetic land, away from buildings; kind: keys (Overseas Highway) / mainland rural
const FIND = `(() => {
  const C = game.city, T = C.terrain, D = C.roadGraph, out = { keys: [], rural: [] }, sp = C.playerSpawn;
  const edges = (D && (D.edges || D.list)) || []; const segs = C.roads;
  for (let i = 0; i < segs.length; i += 1) { const s = segs[i], L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1); if (L < 60 || s.width < 6) continue;
    const x = (s.x1 + s.x2) / 2, z = (s.z1 + s.z2) / 2; if (T.real(x, z)) continue;
    const name = C.streetNameAt(x, z) || '', zn = C.zoneAt(x, z), keys = T.isKeys(x, z);
    let wet = 0; for (const [dx, dz] of [[40,0],[-40,0],[0,40],[0,-40],[25,25],[-25,-25]]) if (C.isWater(x + dx, z + dz)) wet++;
    if (wet) continue;
    const rec = { x: +x.toFixed(1), z: +z.toFixed(1), dx: +((s.x2 - s.x1) / L).toFixed(4), dz: +((s.z2 - s.z1) / L).toFixed(4), L: +L.toFixed(0), name, zn, w: s.width, d: Math.round(Math.hypot(x - sp.x, z - sp.z)) };
    if (keys && /overseas/i.test(name)) out.keys.push(rec); else if (!keys && (zn === 'rural' || zn === 'wilderness')) out.rural.push(rec);
  }
  out.keys.sort((a, b) => b.L - a.L); out.rural.sort((a, b) => b.L - a.L);
  return JSON.stringify({ spawn: [sp.x, sp.z], nk: out.keys.length, nr: out.rural.length, keys: out.keys.slice(0, 12), rural: out.rural.slice(0, 12) });
})()`;
const CAM = (s, back = 0) =>
  s.eye
    ? `(() => { const s = ${JSON.stringify(s)}; game.cameraOverride = (dt, cam) => { cam.position.fromArray(s.eye); cam.lookAt(s.look[0], s.look[1], s.look[2]); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; }; return s.eye; })()`
    : `(() => { const s = ${JSON.stringify(s)}, C = game.city;
  const gy = (x, z) => { const h = C.groundHeightAt(x, z, s.y ?? undefined); return Number.isFinite(h) ? h : 0; };
  const side = s.w ? s.w * 0.25 : 2; const ex = s.x - s.dx * (12 - ${back}) - s.dz * side, ez = s.z - s.dz * (12 - ${back}) + s.dx * side;
  const eye = [ex, gy(ex, ez) + 3.4, ez], look = [ex + s.dx * 60, gy(ex, ez) + 1.2, ez + s.dz * 60];
  game.cameraOverride = (dt, cam) => { cam.position.set(eye[0], eye[1], eye[2]); cam.lookAt(look[0], look[1], look[2]); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; };
  return eye.map((v) => +v.toFixed(1)); })()`;
const SETTLED = `(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`;
const STATS = `(() => { const r = game.renderer.info; const vs = game.vegetation?.countryside?.stats?.() || null; return JSON.stringify({ calls: r.render.calls, tris: r.render.triangles, veg: vs, fps: game.perf?.fps ?? null }); })()`;

const reps = {};
const shot = async (b, f, opt) => {
  for (let k = 0; k < 3; k++) {
    try {
      return await b.screenshot(f, opt);
    } catch (e) {
      console.log('screenshot retry', k, String(e).slice(0, 120));
      await b.sleep(3000);
    }
  }
  return null;
};
await withBrowser(
  { width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 1500) },
  async (b) => {
    for (const SET of SETS) {
      const url = urlOf(SET),
        rep = (reps[SET] = { set: SET, url, when: new Date().toISOString(), shots: {}, drive: [] });
      await b.goto(url);
      await b.waitFor(GAME_READY, 480);
      await b.eval(HIDE);
      let spots =
        fs.existsSync(SPOTF) && !o.find ? JSON.parse(fs.readFileSync(SPOTF, 'utf8')) : null;
      if (!spots) {
        const f = JSON.parse(await b.eval(FIND));
        console.log(JSON.stringify(f, null, 1));
        spots = {
          keys: f.keys[0],
          rural: f.rural[0],
          keys2: f.keys[Math.min(3, f.keys.length - 1)],
        };
        fs.writeFileSync(SPOTF, JSON.stringify(spots, null, 1));
      }
      if (!spots.hwy) {
        const h = await b.eval(
          `(() => { const C = game.city, cs = game.vegetation?.countryside; if (!cs) return 'null'; const out = []; for (const s of C.roads) { const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1); if (L < 50 || s.width < 6) continue; const x = (s.x1 + s.x2) / 2, z = (s.z1 + s.z2) / 2, dx = (s.x2 - s.x1) / L, dz = (s.z2 - s.z1) / L; if (!/overseas/i.test(C.streetNameAt(x, z) || '')) continue; if (/residential|commercial/.test(C.zoneAt(x, z)) || /residential|commercial/.test(C.zoneAt(x - dz * 40, z + dx * 40)) || /residential|commercial/.test(C.zoneAt(x + dz * 40, z - dx * 40))) continue; let ok = 0; for (const k of [-1, 1]) for (const o of [15, 40]) for (const a of [-60, 0, 60]) { if (cs.biomeAt(x - dz * o * k + dx * a, z + dx * o * k + dz * a)) ok++; } if (ok >= 11) out.push({ x: +x.toFixed(1), z: +z.toFixed(1), dx: +dx.toFixed(4), dz: +dz.toFixed(4), L: Math.round(L), w: s.width, ok }); } out.sort((a, b) => b.L - a.L); return JSON.stringify(out[0] || null); })()`,
        );
        console.log('hwy', h);
        if (h && h !== 'null') {
          spots.hwy = JSON.parse(h);
          fs.writeFileSync(SPOTF, JSON.stringify(spots, null, 1));
        }
      }
      if (!spots.causeway) {
        const cw = await b.eval(
          `(() => { const C = game.city; let best = null; for (const s of C.roads) { const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1); if (L < 40) continue; const x = (s.x1 + s.x2) / 2, z = (s.z1 + s.z2) / 2; if (!/MacArthur/i.test(C.streetNameAt(x, z) || '')) continue; const y = C.groundHeightAt(x, z, 20); if (!best || L > best.L) best = { x: +x.toFixed(1), z: +z.toFixed(1), dx: +((s.x2 - s.x1) / L).toFixed(4), dz: +((s.z2 - s.z1) / L).toFixed(4), L: Math.round(L), w: s.width, y }; } return JSON.stringify(best); })()`,
        );
        console.log('causeway', cw);
        if (cw && cw !== 'null') {
          spots.causeway = JSON.parse(cw);
          fs.writeFileSync(SPOTF, JSON.stringify(spots, null, 1));
        }
      }
      for (const id of Object.keys(spots).filter(
        (k) => !o.only || String(o.only).split(',').includes(k),
      )) {
        const s = spots[id];
        if (!s) continue;
        await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
        await b.eval(
          s.eye
            ? `game.teleport(${s.eye[0]}, null, ${s.eye[2]}, 0) || true`
            : `game.teleport(${s.x - s.dx * 12}, null, ${s.z - s.dz * 12}, 0) || true`,
        );
        await b.eval(HIDE);
        await b.eval(CAM(s));
        await b.sleep(3000);
        await b.waitFor(SETTLED, 90).catch(() => {});
        await b.sleep(o.settle ? +o.settle : 3500);
        rep.shots[id] = JSON.parse(await b.eval(STATS).catch(() => '{"calls":0}'));
        if ((rep.shots[id].calls || 0) < 20 && !s._retry) {
          s._retry = 1;
          console.log(id, 'page reloaded under us, retrying');
          await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
          await b.eval(HIDE);
          await b.eval(
            s.eye
              ? `game.teleport(${s.eye[0]}, null, ${s.eye[2]}, 0) || true`
              : `game.teleport(${s.x - s.dx * 12}, null, ${s.z - s.dz * 12}, 0) || true`,
          );
          await b.eval(CAM(s));
          await b.sleep(5000);
          await b.waitFor(SETTLED, 90).catch(() => {});
          await b.sleep(3500);
          rep.shots[id] = JSON.parse(await b.eval(STATS));
        }
        await b.eval(HIDE);
        await b.eval(CAM(s));
        await b.sleep(600);
        console.log(
          id,
          JSON.stringify(rep.shots[id]),
          'SHOT',
          await shot(b, path.join(DIR, `${SET}_${id}.png`)),
        );
      }
      if (o.fly && !(o.flyOnly && o.flyOnly !== SET)) {
        // fly toward one tree group: a frame every 20 m from 600 m to 10 m, same trees, fixed time (pop / warp check)
        const s = spots[o.flySpot || 'hwy'] || spots.keys;
        await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
        const tgt = [s.x - s.dz * 30, s.z + s.dx * 30]; // 30 m off the road, to the side the countryside grows on
        await b.eval(`game.teleport(${tgt[0]}, null, ${tgt[1]}, 0) || true`);
        await b.sleep(4000);
        await b.waitFor(
          GAME_READY +
            ' && game.vegetation && game.vegetation.countryside && typeof game.teleport === "function"',
          600,
        );
        await b.eval(HIDE);
        const tr = JSON.parse(
          await b.eval(
            `JSON.stringify(game.vegetation.countryside.nearestTree(${tgt[0]}, ${tgt[1]}, 'liveoak') || null)`,
          ),
        );
        if (tr) {
          tgt[0] = tr.x;
          tgt[1] = tr.z;
          console.log('fly target', JSON.stringify(tr));
        }
        await b.eval(`game.teleport(${tgt[0]}, null, ${tgt[1]}, 0) || true`);
        await b.eval(HIDE);
        await b.sleep(3000);
        await b.waitFor(SETTLED, 90).catch(() => {});
        for (let d = 600, k = 0; d >= 10; d -= 20, k++) {
          const dd = Math.max(10, d);
          await b.eval(`(() => { const C = game.city, s = ${JSON.stringify(s)}, tx = ${tgt[0]}, tz = ${tgt[1]}, ex = tx - s.dx * ${dd}, ez = tz - s.dz * ${dd}; const gy = (x, z) => { const h = C.groundHeightAt(x, z); return Number.isFinite(h) ? Math.max(h, 0) : 0; };
        const ey = Math.max(gy(ex, ez), 0) + 9, ty = gy(tx, tz) + 4; game.cameraOverride = (dt, cam) => { cam.position.set(ex, ey, ez); cam.lookAt(tx, ty, tz); if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); } return true; }; return true; })()`);
          await b.sleep(k === 0 ? 4000 : 900);
          await shot(b, path.join(DIR, `${SET}_fly_${String(dd).padStart(3, '0')}.jpg`), {
            format: 'jpeg',
            quality: 82,
          });
        }
        console.log('fly done');
      }
      if (o.drive) {
        // 100 km/h along the Keys spot: camera moves 2.8 m per 0.1 s of game time; a frame every 0.5 s
        const s = spots.hwy || spots.keys;
        await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
        await b.eval(`game.teleport(${s.x - s.dx * 12}, null, ${s.z - s.dz * 12}, 0) || true`);
        await b.eval(HIDE);
        await b.eval(CAM(s, -250));
        await b.sleep(2500);
        await b.waitFor(SETTLED, 90).catch(() => {});
        await b.sleep(2000);
        await b.eval(`(() => { const s = ${JSON.stringify(s)}, C = game.city; let d = -250; window.__drv = { d }; const gy = (x, z) => { const h = C.groundHeightAt(x, z); return Number.isFinite(h) ? h : 0; };
      game.cameraOverride = (dt, cam) => { d += 27.8 * Math.min(dt, 0.05); window.__drv.d = d; const side = s.w * 0.25, ex = s.x + s.dx * d - s.dz * side, ez = s.z + s.dz * d + s.dx * side; cam.position.set(ex, gy(ex, ez) + 3.4, ez); cam.lookAt(ex + s.dx * 60, gy(ex, ez) + 1.2, ez + s.dz * 60); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; }; return true; })()`);
        for (let k = 0; k < +(o.frames || 16); k++) {
          await b.sleep(+(o.dt || 400));
          const d = await b.eval('window.__drv.d');
          const st = JSON.parse(await b.eval(STATS));
          rep.drive.push({ k, d, ...st });
          await shot(b, path.join(DIR, `${SET}_drive_${String(k).padStart(2, '0')}.jpg`), {
            format: 'jpeg',
            quality: 80,
          });
        }
        console.log(
          'drive',
          JSON.stringify(rep.drive.map((r) => [Math.round(r.d), r.calls, r.fps])),
        );
      }
      await b.eval('game.cameraOverride = null; true');
      if (b.errors.length) rep.consoleErrors = [...new Set(b.errors)].slice(0, 20);
      b.errors.length = 0;
      fs.writeFileSync(
        path.resolve(`docs/v2/reports/vegetation-${SET}.json`),
        JSON.stringify(rep, null, 1),
      );
      console.log(SET, 'errors', rep.consoleErrors || 'none');
    }
  },
);
