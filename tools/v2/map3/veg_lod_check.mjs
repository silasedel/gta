#!/usr/bin/env node
// W4 vegetation LOD check: one street view (default Brickell), frame cost + draw calls + triangles + palm / tree pool counts,
// then a drive-away view (camera 700 m back) to see whether the far plants are still there. V2 test browser, short run.
//   node tools/v2/map3/veg_lod_check.mjs --tag new [--q "&veglod=0&farveg=0"] [--at 0,1760]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'now', [X, Z] = String(o.at || '0,1760').split(',').map(Number), OUT = 'docs/v2/shots/veglod';
fs.mkdirSync(OUT, { recursive: true });
const rep = { tag: TAG, q: o.q || '', at: [X, Z] };
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 285) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  await startGame(b, 60);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(st); game.teleport(${X}, null, ${Z}, 0); return 1; })()`);
  for (let i = 0; i < 40; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 2) break; await b.sleep(1000); }
  const view = async (name, eye, look) => {
    await b.eval(`(() => { const gy = game.city.groundHeightAt?.(${eye[0]}, ${eye[2]}) || 0; window.__vE = [${eye[0]}, gy + ${eye[1]}, ${eye[2]}]; window.__vL = [${look[0]}, gy + ${look[1]}, ${look[2]}];
      game.cameraOverride = (dt, c) => { c.position.fromArray(window.__vE); c.lookAt(...window.__vL); return true; }; return 1; })()`);
    await b.sleep(4000);
    const r = JSON.parse(await b.eval(`new Promise((res) => { const ri = game.renderer.info; let n = 0, calls = 0, tris = 0; const t0 = performance.now();
      const f = () => { calls += ri.render.calls; tris += ri.render.triangles; if (++n < 90) requestAnimationFrame(f); else {
        const st = game.city.builder?.cullStats || game.city.cullStats || null; let pal = 0, palFar = 0;
        game.scene.traverse((m) => { if (m.isInstancedMesh && m.visible && m.count && m.geometry?.userData?.lodMax) { if (m.geometry.userData.farVeg) palFar += m.count; else pal += m.count; } });
        res(JSON.stringify({ ms: +((performance.now() - t0) / n).toFixed(1), calls: Math.round(calls / n), tris: Math.round(tris / n), vegInst: pal, farInst: palFar })); } };
      requestAnimationFrame(f); })`));
    await b.screenshot(`${OUT}/${TAG}_${name}.jpg`, { format: 'jpeg', quality: 80 });
    rep[name] = r; console.log(name, JSON.stringify(r));
  };
  await view('street', [X, 1.7, Z], [X + 60, 2, Z + 10]);
  await view('street2', [X, 1.7, Z], [X - 10, 2, Z + 60]);
  // drive away 700 m (tiles behind drop to mid), then look back
  await b.eval(`game.teleport(${X}, null, ${Z + 700}, 0), 1`);
  for (let i = 0; i < 30; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 2) break; await b.sleep(1000); }
  await view('lookback', [X, 30, Z + 700], [X, 5, Z]);
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 10);
});
fs.writeFileSync(`docs/v2/reports/veg-lod-${TAG}.json`, JSON.stringify(rep, null, 1));
