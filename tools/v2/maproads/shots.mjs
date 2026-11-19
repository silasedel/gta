// maproads track shots (V2 test browser only). One browser session per call.
//   node tools/v2/maproads/shots.mjs map                      full pause map (fit) + GPS North Shore -> Port Calabash
//   node tools/v2/maproads/shots.mjs game name@ex,ey,ez,lx,ly,lz[;name2@...]   in-game shots from fixed eye/look points
//        (ey / ly are meters above the ground at that x, z). Writes docs/v2/shots/maproads/<name>.png
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from '../browser.mjs';

const OUT = path.resolve('docs/v2/shots/maproads');
fs.mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] || 'map';
const base = 'http://127.0.0.1:5200/';
const places = JSON.parse(fs.readFileSync('public/assets/world/layout.json', 'utf8')).places;
const P = (n) => places.find((p) => p.name === n);

if (mode === 'map') {
  const ns = P('North Shore'),
    cal = P('Port Calabash');
  await withBrowser({ width: 1300, height: 1700, maxSeconds: 400 }, async (b) => {
    for (const [name, q] of [
      ['fullmap', 'view=pause&fit=1&wanted=0'],
      [
        'gps_northshore_calabash',
        `view=pause&fit=1&wanted=0&x=${ns.x}&z=${ns.z}&wp=${cal.x},${cal.z}`,
      ],
    ]) {
      await b.goto(base + 'src/ui/mapshot.html?' + q);
      await b.waitFor('!!window.game && !!game.hud', 240);
      await b.sleep(9000);
      console.log('SHOT', await b.screenshot(path.join(OUT, name + '.png')));
    }
    if (b.errors.length) console.log('console errors', [...new Set(b.errors)].slice(0, 6));
  });
} else {
  const shots = String(process.argv[3])
    .split(';')
    .map((s) => {
      const [n, r] = s.split('@');
      return { n, v: r.split(',').map(Number) };
    });
  await withBrowser({ width: 1600, height: 900, maxSeconds: 700 }, async (b) => {
    await b.goto(base + '?mute');
    await b.waitFor(GAME_READY, 480);
    await b.waitFor("typeof game.teleport === 'function'", 300);
    const HIDE = `(() => { game.timeExternal = true; game.timeOfDay = 10.5; if (!window.__vc) { window.__vc = document.createElement('style'); window.__vc.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__vc); } const gc = game.renderer && game.renderer.domElement; for (const c of document.querySelectorAll('canvas')) if (c !== gc) c.style.setProperty('display', 'none', 'important'); if (gc) { let e = gc; while (e && e !== document.body) { e.style.setProperty('visibility', 'visible', 'important'); e = e.parentElement; } } return true; })()`;
    await b.eval(HIDE);
    for (const { n, v } of shots) {
      const [ex, ey, ez, lx, ly, lz] = v;
      await b.eval(`game.teleport(${lx}, null, ${lz}, 0) || true`);
      await b
        .waitFor(
          `(() => { const s = game.city.streamer; return !s || !s.readyAround || s.readyAround(${lx}, ${lz}, 300); })()`,
          120,
        )
        .catch(() => {});
      await b.sleep(3000);
      await b.eval(`(() => { const T = game.THREE || window.THREE; const gy = (x, z) => { const h = game.city.groundHeightAt(x, z); return Number.isFinite(h) ? h : 0; };
        const eye = new T.Vector3(${ex}, gy(${ex}, ${ez}) + ${ey}, ${ez}), look = new T.Vector3(${lx}, gy(${lx}, ${lz}) + ${ly}, ${lz});
        game.cameraOverride = (dt, cam) => { cam.position.copy(eye); cam.lookAt(look); if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); } return true; }; return true; })()`);
      await b
        .waitFor(`(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`, 90)
        .catch(() => {});
      await b.eval(HIDE);
      await b.sleep(4000);
      console.log(
        'STATE',
        await b.eval(
          `JSON.stringify({ p: [game.player.position.x | 0, game.player.position.z | 0], ui: game.ui && { paused: game.ui.paused, title: game.ui.title }, t: game.clock && +game.clock.elapsed.toFixed(1), ov: !!game.cameraOverride, cam: [game.camera.position.x | 0, game.camera.position.z | 0] })`,
        ),
      );
      console.log('SHOT', await b.screenshot(path.join(OUT, n + '.png')));
    }
    if (process.argv[4] === 'withmap') {
      // in-game pause map: player at North Shore, waypoint on the Calabash causeway (ref_63's pin), map fitted to the world
      const ns = P('North Shore');
      await b.eval('game.cameraOverride = null; true');
      await b.eval(`game.teleport(${ns.x}, null, ${ns.z}, 0) || true`);
      await b.sleep(4000);
      await b.eval('(() => { if (window.__vc) window.__vc.remove(); return true; })()');
      await b.eval(
        `(() => { game.timeExternal = true; game.timeOfDay = 11; game.waypoint = { x: -15790, z: -12890 }; game.ui.title = false; for (const c of document.querySelectorAll('canvas')) if (c !== game.renderer.domElement) c.style.display = 'none'; const t = document.getElementById('title'); if (t) t.style.display = 'none'; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); return true; })()`,
      );
      await b.sleep(2500);
      await b.eval('(game.hud._mapFit && game.hud._mapFit()) || true');
      await b.sleep(5000);
      console.log('SHOT', await b.screenshot(path.join(OUT, 'fullmap_gps.png')));
      await b.eval(
        `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })) || true`,
      );
      await b.sleep(1500);
    }
    if (b.errors.length) console.log('console errors', [...new Set(b.errors)].slice(0, 6));
  });
}
