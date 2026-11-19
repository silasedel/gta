// r3 paint close-ups: node tools/v2/cars/r3_paint.mjs [--tag before] [--ab] [--debug] [--keys a,b] [--tods 10,17.5]
// Each car parked on the street by Nico's house (sun), fixed paint + wear per car (the same in every run), shot at 10:00 and
// 17:30: front 3/4 (~5.8 m), side (5.2 m), low rear 3/4 at the sill / arch (~3.5 m), hood + roof from above, and the front
// 3/4 again from 26 m (LOD0) and 31 m (LOD1: the paint must not jump).  --ab boots twice in one browser: ?r3paint=0 as tag
// 'b', then the default as tag 'a'.  --debug adds per-layer isolation shots (no wear / no clear coat / no env / flat slot
// colors for z-fighting).  Raw PNGs: <tmpdir>/r3paint_raw or --out/<tag>_<tod>_<key>_<view>.png, data docs/v2/reports/cars-r3-paint-<tag>.json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const OUT = path.resolve(o.out || path.join(os.tmpdir(), 'r3paint_raw')); // raw PNGs stay out of the repo (~400 MB per A/B) fs.mkdirSync(OUT, { recursive: true });
const CARS = {
  sedan1: {
    color: 0xf2f2ef,
    finish: 'pearl',
    wear: { dirt: 0.22, rust: 0, fade: 0, dirtColor: 'dust' },
  },
  sedan5: {
    color: 0x0e0f11,
    finish: 'metallic',
    wear: { dirt: 0.18, rust: 0, fade: 0, dirtColor: 'dust' },
  },
  sedan8: {
    color: 0xa9aeb4,
    finish: 'metallic',
    wear: { dirt: 0.28, rust: 0, fade: 0, dirtColor: 'sand' },
  },
  hatch1: {
    color: 0xb3121b,
    finish: 'metallic',
    wear: { dirt: 0.14, rust: 0, fade: 0, dirtColor: 'dust' },
  },
  suv4: {
    color: 0x4a4e54,
    finish: 'metallic',
    wear: { dirt: 0.38, rust: 0.12, fade: 0.3, age: 0.78, dirtColor: 'clay' },
  },
  van6: {
    color: 0x1c2f5e,
    finish: 'metallic',
    wear: { dirt: 0.25, rust: 0, fade: 0, dirtColor: 'mud' },
  },
  truck9: {
    color: 0x9a9ea3,
    finish: 'metallic',
    wear: { dirt: 0.16, rust: 0, fade: 0, dirtColor: 'sand' },
    ride: 0.07,
    tint: 0,
    stripe: {
      w: 0.86,
      roofW: 0.78,
      color: 0x515458,
      satin: true,
      line: { color: 0x9da0a4, w: 0.022 },
    },
  },
  coupe4: {
    color: 0x7a9198,
    finish: 'solid',
    old: true,
    wear: { dirt: 0.3, rust: 0.32, fade: 0.6, age: 0.9, dirtColor: 'salt' },
  },
};
const keys = String(o.keys || Object.keys(CARS).join(',')).split(',');
const tods = String(o.tods || '10,17.5')
  .split(',')
  .map(Number);
const at = String(o.at || '-866.1,4836.4')
  .split(',')
  .map(Number);
const runs = o.ab
  ? [
      ['b', '&r3paint=0'],
      ['a', ''],
    ]
  : [[o.tag || 'before', o.q || '']];
// [name, camera offset (car space, +Z forward, +X left), look-at, fov]
// mid distance: along the road ahead of the car, a little toward the road (+X): no yard bushes in between
const D = (d, h) => {
  const L = Math.hypot(0.2, 1);
  return [(0.2 / L) * d, h, (1 / L) * d];
};
const VIEWS = [
  ['q34', [3.6, 1.45, 4.4], [0, 0.7, 0.3], 45],
  ['side', [5.2, 1.0, 0], [0, 0.75, 0], 50],
  ['rq', [2.7, 0.85, -3.6], [0.6, 0.55, -1.3], 45],
  ['top', [2.4, 2.9, 3.4], [0, 1.0, 0.6], 45],
  ['m26', D(26, 2.6), [0, 0.8, 0], 15],
  ['m31', D(31, 2.9), [0, 0.8, 0], (15 * 26) / 31],
];
const out = { runs: {} };
await withBrowser({ width: 1280, height: 800, maxSeconds: +(o.max || 1500) }, async (b) => {
  for (const [TAG, Q] of runs) {
    const R = (out.runs[TAG] = { cars: {}, errors: [] });
    b.errors.length = 0;
    await b.goto('http://127.0.0.1:5200/?mute=1&weather=clear' + Q);
    try {
      await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    } catch (e) {
      console.log('BOOT TIMEOUT', TAG, b.errors.slice(0, 10), b.logs.slice(-15));
      throw e;
    }
    await startGame(b);
    await b.eval(
      `(() => { game.timeExternal = true; game.timeOfDay = ${tods[0]}; if (!window.__cbCss) { window.__cbCss = document.createElement('style'); window.__cbCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(window.__cbCss); } game.teleport(${at[0]}, undefined, ${at[1]}, 0); return 1; })()`,
    );
    await b.sleep(14000);
    const CLEAR = `(() => { try { game.weather?.set?.('clear', { instant: true }); } catch (e) {} return 1; })()`;
    await b.eval(CLEAR);
    const spot = JSON.parse(
      await b.eval(`(() => { const g = game.city.roadGraph, p = game.player.position; const r = g.nearestEdge ? g.nearestEdge(p.x, p.z) : null;
    const e = r?.edge || r; if (!e || !e.pts) return JSON.stringify({ x: p.x + 4, z: p.z, h: 0 });
    const pts = e.pts, n = pts.length; const i = Math.max(1, Math.min(n - 1, Math.floor(n / 2))); const A = pts[i - 1], B = pts[i];
    const ax = A.x ?? A[0], az = A.z ?? A[1], bx = B.x ?? B[0], bz = B.z ?? B[1]; const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const off = (e.width || 10) / 2 - 1.6; const h = Math.atan2(dx, dz); return JSON.stringify({ x: (ax + bx) / 2 - dz / L * off, z: (az + bz) / 2 + dx / L * off, h }); })()`),
    );
    R.spot = spot;
    for (const tod of tods) {
      await b.eval(`(() => { game.timeOfDay = ${tod}; return 1; })()`);
      await b.eval(CLEAR);
      await b.sleep(2500);
      for (const k of keys) {
        const C = CARS[k] || {};
        const info = JSON.parse(
          await b.eval(`(async () => { if (window.__cuV) { try { game.vehicles.remove(window.__cuV); } catch (e) {} }
        const v = window.__cuV = await game.vehicles.spawnParked(${JSON.stringify(k)}, { x: ${spot.x}, z: ${spot.z}, heading: ${spot.h}, keepSpot: true, locked: true, ...${JSON.stringify(C)} });
        if (!v) return JSON.stringify({ none: 1 });
        try { game.weather?.set?.('clear', { instant: true }); } catch (e) {}
        // other cars stopped beside the test car (they blocked views in run 2): removed
        try { for (const o of [...(game.vehicles.list || [])]) { if (o === v || o.playerOwned || !o.mesh) continue; const dx = o.mesh.position.x - ${spot.x}, dz = o.mesh.position.z - ${spot.z}; if (dx * dx + dz * dz < 18 * 18) game.vehicles.remove(o); } } catch (e) {}
        game.teleport(${spot.x} + 16 * Math.cos(${spot.h}), undefined, ${spot.z} - 16 * Math.sin(${spot.h}), 0);
        const c = v.car; const pm = c.slots.paint[0]?.material;
        return JSON.stringify({ key: v.typeKey, name: v.name, prog: pm?.customProgramCacheKey?.(), cc: pm?.clearcoat, ccr: pm?.clearcoatRoughness, rough: pm?.roughness, metal: pm?.metalness, env: pm?.envMapIntensity, wear: pm?.userData.wearUniforms?.uWear.value.toArray() }); })()`),
        );
        (R.cars[k] ||= {})[tod] = info;
        await b.sleep(3000);
        const shoot = async (vn, off, look, fov, file) => {
          await b.eval(
            `(() => { const T = window.THREE || game.THREE, off = new T.Vector3(${off}), lk = new T.Vector3(${look}); game.cameraOverride = (dt, cam) => { const v = window.__cuV; if (!v) return false; const m = v.mesh; const e = off.clone().applyQuaternion(m.quaternion).add(m.position); const l = lk.clone().applyQuaternion(m.quaternion).add(m.position); cam.position.copy(e); cam.lookAt(l); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
          );
          await b.sleep(1100);
          const lv = await b.eval(
            `(() => { const l = window.__cuV?.car?.lod; return l ? l.getCurrentLevel() : -1; })()`,
          );
          (info.lod ||= {})[vn] = lv;
          await b.screenshot(path.join(OUT, file));
        };
        for (const [vn, off, look, fov] of VIEWS)
          await shoot(vn, off, look, fov, `${TAG}_${tod}_${k}_${vn}.png`);
        if (o.debug && tod === tods[0]) {
          // isolate the layers: wear off, clear coat off, env off, flat per-slot colors (z-fighting / doubled shells show as speckle)
          const DBG = {
            noWear: `(m) => { const u = m.userData.wearUniforms; if (!u) return null; const s = u.uWear.value.clone(); u.uWear.value.set(0, 0, 0, s.w); return () => u.uWear.value.copy(s); }`,
            noCC: `(m) => { const s = m.clearcoat; m.clearcoat = 0; return () => { m.clearcoat = s; }; }`,
            noEnv: `(m) => { const s = m.envMapIntensity; m.envMapIntensity = 0; return () => { m.envMapIntensity = s; }; }`,
          };
          for (const [dn, fn] of Object.entries(DBG)) {
            await b.eval(
              `(() => { const f = ${fn}; const m = window.__cuV.car.slots.paint[0].material; window.__undo = f(m); return 1; })()`,
            );
            for (const [vn, off, look, fov] of VIEWS.filter((v) => v[0] === 'q34' || v[0] === 'rq'))
              await shoot(vn, off, look, fov, `${TAG}_${tod}_${k}_${vn}_${dn}.png`);
            await b.eval(`(() => { window.__undo && window.__undo(); return 1; })()`);
          }
          await b.eval(
            `(() => { const T = window.THREE || game.THREE; const sw = []; window.__cuV.mesh.traverse((m) => { if (!m.isMesh || !m.material) return; const n = m.material.name || ''; const col = /paint/.test(n) ? 0xd02020 : /trim/.test(n) ? 0x2040d0 : /glass/.test(n) ? 0x20c0c0 : /lamp/.test(n) ? 0x20c020 : /plate/.test(n) ? 0xffffff : 0xe0c020; sw.push([m, m.material]); m.material = new T.MeshBasicMaterial({ color: col }); }); window.__undo = () => sw.forEach(([m, mat]) => { m.material.dispose(); m.material = mat; }); return 1; })()`,
          );
          for (const [vn, off, look, fov] of VIEWS.filter((v) =>
            ['q34', 'rq', 'm31'].includes(v[0]),
          ))
            await shoot(vn, off, look, fov, `${TAG}_${tod}_${k}_${vn}_zf.png`);
          await b.eval(`(() => { window.__undo && window.__undo(); return 1; })()`);
        }
        console.log(TAG, tod, k, info.name, JSON.stringify(info.lod));
      }
    }
    if (o.wet !== false) {
      // rain beads at ~3.5 m (r3: beads fade out where they would alias into speckle)
      await b.eval(
        `(() => { game.timeOfDay = ${tods[0]}; try { game.weather.set('rain', { instant: true }); } catch (e) {} return 1; })()`,
      );
      await b.sleep(25000);
      for (const [vn, off, look, fov] of VIEWS.filter((v) => v[0] === 'rq' || v[0] === 'q34')) {
        await b.eval(
          `(() => { const T = window.THREE || game.THREE, off = new T.Vector3(${off}), lk = new T.Vector3(${look}); game.cameraOverride = (dt, cam) => { const v = window.__cuV; if (!v) return false; const m = v.mesh; cam.position.copy(off.clone().applyQuaternion(m.quaternion).add(m.position)); cam.lookAt(lk.clone().applyQuaternion(m.quaternion).add(m.position)); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
        );
        await b.sleep(1200);
        await b.screenshot(path.join(OUT, `${TAG}_wet_${keys[keys.length - 1]}_${vn}.png`));
      }
      await b.eval(CLEAR);
    }
    R.errors = b.errors.slice(0, 40);
    console.log(TAG, 'errors', b.errors.length, b.errors.slice(0, 5));
  }
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(
  path.resolve(`docs/v2/reports/cars-r3-paint-${o.ab ? 'ab' : o.tag || 'before'}.json`),
  JSON.stringify(out, null, 1),
);
