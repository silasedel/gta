#!/usr/bin/env node
// city-look: fixed skyline / port / canyon cameras in the real game (V2 test browser only).
//   node src/world/miami/.skyline.mjs --tag before [--views bay,close,port] [--hours 13]
// Writes docs/v2/shots/city-look/<view>_<tag>_<hour>.png and prints draw calls / triangles / frame times.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';

const a = process.argv.slice(2);
const o = {};
for (let i = 0; i < a.length; i++) {
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
}
const TAG = o.tag || 'after';
const OUT = path.resolve('docs/v2/shots/city-look');
// eye / look in world meters (x east, z south); the player is parked under the camera so streaming centers there
const VIEWS = {
  bay: { eye: [1400, 28, -250], look: [-2400, 70, 350], fov: 40 },
  close: { eye: [-700, 55, -650], look: [-2350, 75, 250], fov: 55 },
  port: { eye: [400, 70, 900], look: [-400, 0, 450], fov: 55 },
  canyon: { eye: [-2380, 30, 700], look: [-2420, 60, 200], fov: 62 },
};
const want = o.views ? String(o.views).split(',') : ['bay', 'close'];
const hours = o.hours ? String(o.hours).split(',').map(Number) : [13];
const STAGE = (v, hour) => `(() => {
  const v = ${JSON.stringify(v)};
  game.timeExternal = true;
  game.timeOfDay = ${hour};
  game.teleport(v.eye[0], null, v.eye[2], 0);
  const T = window.THREE || game.THREE;
  const eye = new T.Vector3(...v.eye);
  const look = new T.Vector3(...v.look);
  game.cameraOverride = (dt, cam) => {
    cam.position.copy(eye);
    cam.lookAt(look);
    if (cam.fov !== v.fov) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
    return true;
  };
  if (!window.__clShotCss) {
    window.__clShotCss = document.createElement('style');
    window.__clShotCss.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }';
    document.head.appendChild(window.__clShotCss);
  }
  return true;
})()`;
const SETTLED = `(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`;
const MEASURE = `new Promise((res) => {
  const r = game.renderer, ft = [];
  let last = performance.now(), n = 0;
  const step = () => {
    const t = performance.now(); ft.push(t - last); last = t;
    if (++n < 120) { requestAnimationFrame(step); return; }
    ft.shift(); ft.sort((x, y) => x - y);
    const avg = ft.reduce((s, q) => s + q, 0) / ft.length;
    res({ calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs?.length || 0,
      frameMsAvg: +avg.toFixed(2), frameMsP95: +ft[Math.floor(ft.length * 0.95)].toFixed(2) });
  };
  requestAnimationFrame(step);
})`;
console.log('uptime', execSync('uptime').toString().trim());
let bad = false;
await withBrowser(
  { width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 235) },
  async (b) => {
    await b.goto('http://127.0.0.1:5200/?mute');
    await b.waitFor(GAME_READY, 150);
    // first frames after ready can still show the title card: stage once and give the page a few seconds
    await b.eval(STAGE(VIEWS[want[0]], hours[0]));
    await b.sleep(5000);
    for (const id of want) {
      for (const hour of hours) {
        await b.waitFor(GAME_READY, 120); // the shared dev server may have hot-reloaded the page
        await b.eval(STAGE(VIEWS[id], hour));
        await b.sleep(1500);
        try {
          await b.waitFor(SETTLED, +(o.settleWait || 50));
        } catch (e) {
          console.log('  (stream not settled)', id);
        }
        await b.sleep(+(o.settle || 2500));
        const m = await b.eval(MEASURE);
        const file = path.join(OUT, `${id}_${TAG}_${String(hour).replace('.', 'h')}.png`);
        let ok = false;
        for (let k = 0; k < 4 && !ok; k++) {
          try {
            await b.screenshot(file);
            ok = true;
          } catch (e) {
            console.log('  screenshot retry', id, k);
            await b.sleep(2500);
          }
        }
        console.log(id, hour, JSON.stringify(m));
      }
    }
    if (b.errors.length) {
      console.log('CONSOLE ERRORS:\n' + [...new Set(b.errors)].slice(0, 20).join('\n'));
      bad = !o.allowErrors;
    }
  },
);
process.exit(bad ? 1 : 0);
