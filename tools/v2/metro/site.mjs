// r2-metro: try street-entrance sites for one station (top-down + street shots per candidate).
//   node tools/v2/metro/site.mjs --i 2 --c "398,-78,0,2.4;375,-88,0,2.4;407,-160,1,2.9"   (x,z,flip,off)
import { withBrowser, startGame } from '../browser.mjs';
import fs from 'node:fs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1];
const I = +(o.i ?? 2),
  C = o.c.split(';').map((s) => s.split(',').map(Number)),
  DIR = 'docs/v2/shots/metro/probe';
fs.mkdirSync(DIR, { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute&metro=1');
  await startGame(b);
  await b.eval(`game.timeOfDay = 13; 'ok'`);
  for (let k = 0; k < C.length; k++) {
    const [x, z, flip, off] = C[k];
    const s = JSON.parse(
      await b.eval(
        `JSON.stringify((({ kx, kz, yaw }) => ({ kx, kz, yaw }))(game.metro.resite(${I}, { x: ${x}, z: ${z}, flip: ${!!flip}, off: ${off} })))`,
      ),
    );
    await b.eval(`game.teleport(${s.kx}, undefined, ${s.kz} + 6, 0)`);
    for (let t = 0; t < 60; t++) {
      if (
        await b.eval(
          `!!game.metro.stations[${I}].root && game.city.streamer.readyAround(${s.kx}, ${s.kz}, 100)`,
        )
      )
        break;
      await b.sleep(500);
    }
    await b.sleep(2000);
    await b.eval(
      `(() => { const s = game.metro.stations[${I}]; game.cameraOverride = (dt, cam) => { cam.position.set(s.kx, s.gy + 45, s.kz + 0.01); cam.lookAt(s.kx, s.gy, s.kz); return true; }; })()`,
    );
    await b.sleep(900);
    await b.screenshot(`${DIR}/site${I}_${k}_top.png`);
    await b.eval(`(() => { const s = game.metro.stations[${I}], c = Math.cos(s.yaw), sn = Math.sin(s.yaw), W = (lx, y, lz) => ({ x: s.kx + lx * c + lz * sn, y: s.gy + y, z: s.kz - lx * sn + lz * c });
      const p = W(-5.5, 2.4, 10.5), t = W(0, 1.2, 0); game.cameraOverride = (dt, cam) => { cam.position.set(p.x, p.y, p.z); cam.lookAt(t.x, t.y, t.z); return true; }; })()`);
    await b.sleep(900);
    await b.screenshot(`${DIR}/site${I}_${k}_street.png`);
    await b.eval('game.cameraOverride = null');
    console.log('cand', k, JSON.stringify(s));
  }
  console.log('ERRORS', [...new Set(b.errors)].length, [...new Set(b.errors)].slice(0, 5));
});
