// What the cars cost per frame, measured inside one session: cars shown / hidden / shown / hidden (ABAB, 3 s each),
// frame ms, draw calls and triangles.  node tools/v2/cars/carcost.mjs [--q '&libcars=0'] [--at x,z] [--set name]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const at = String(o.at || '407,-110')
  .split(',')
  .map(Number);
await withBrowser({ width: 1600, height: 900, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = 12; game.teleport(${at[0]}, undefined, ${at[1]}, 0); return 1; })()`,
  );
  await b.sleep(18000);
  // freeze the view: fixed camera looking down the street from 3 m (same frame content in every phase)
  await b.eval(
    `(() => { const p = game.player.position.clone(), q = game.camera.quaternion.clone(); const e = game.camera.position.clone(); game.cameraOverride = (dt, cam) => { cam.position.copy(e); cam.quaternion.copy(q); return true; }; return 1; })()`,
  );
  const measure = (show) =>
    b.eval(`new Promise((res) => { for (const v of game.vehicles.list) v.mesh.visible = ${show};
    let n = 0; const ts = []; let last = performance.now(); let calls = 0, tris = 0; const r = game.renderer;
    const f = () => { const t = performance.now(); if (n > 20) ts.push(t - last); last = t; calls = r.info.render.calls; tris = r.info.render.triangles; if (++n < 200) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res(JSON.stringify({ med: +ts[ts.length >> 1].toFixed(2), avg: +(ts.reduce((s, x) => s + x, 0) / ts.length).toFixed(2), calls, tris })); } };
    requestAnimationFrame(f); })`);
  const out = {
    cars: await b.eval('game.vehicles.list.length'),
    glb: await b.eval('game.vehicles.list.filter((v) => v.car?.glb).length'),
    runs: [],
  };
  for (let i = 0; i < 3; i++) {
    const on = JSON.parse(await measure(true));
    const off = JSON.parse(await measure(false));
    out.runs.push({ on, off });
    console.log('on', JSON.stringify(on), 'off', JSON.stringify(off));
  }
  await b.eval(
    '(() => { for (const v of game.vehicles.list) v.mesh.visible = true; return 1; })()',
  );
  const d = (k) =>
    +(out.runs.reduce((s, r) => s + r.on[k] - r.off[k], 0) / out.runs.length).toFixed(2);
  out.carCost = { medMs: d('med'), avgMs: d('avg'), calls: d('calls'), tris: d('tris') };
  console.log('CARCOST', JSON.stringify(out.carCost), 'cars', out.cars, 'library', out.glb);
  fs.writeFileSync(`docs/v2/reports/cars-cost-${o.set || 'x'}.json`, JSON.stringify(out, null, 1));
});
