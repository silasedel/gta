#!/usr/bin/env node
// Far crowd tier check: boots the game with a query (default '&farcrowd=people'), waits for the crowd, then frames the
// densest group of far-tier people from 35 / 60 m and a telephoto close look, plus stats.
//   node tools/v2/npcs/crowd-far.mjs --set f1 [--at 407,-110] [--q "&farcrowd=people"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'f';
const AT = String(o.at || '407,-110')
  .split(',')
  .map(Number);
const Q = o.q ?? '&farcrowd=people';
const D = 'docs/v2/shots/people/r2crowd';
fs.mkdirSync(D, { recursive: true });
await withBrowser({ width: 1280, height: 800, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + Q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`,
  );
  await b.sleep(45000);
  const st = await b.eval(
    `JSON.stringify({ impl: game.people?.crowd?.impl?.stats?.() || 'old', count: game.people?.crowd?.count, frame: game.perf?.fps })`,
  );
  console.log('stats', st);
  // densest far-tier cluster
  const tgt =
    await b.eval(`JSON.stringify((() => { const L = game.people.crowd.positions(); const pp = game.player.position; let best = null, bn = -1;
    for (const p of L) { const d = Math.hypot(p[0] - pp.x, p[1] - pp.z); if (d < 32) continue; let n = 0; for (const q of L) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 14) n++; if (n > bn) { bn = n; best = p; } } return best ? { x: best[0], z: best[1], n: bn, total: L.length } : null; })())`);
  console.log('target', tgt);
  const T = JSON.parse(tgt);
  if (T) {
    for (const [k, dist, fov] of [
      [0, 40, 50],
      [1, 40, 14],
      [2, 22, 30],
    ]) {
      await b.eval(`(() => { const T = ${tgt}; const pp = game.player.position; const dx = pp.x - T.x, dz = pp.z - T.z, l = Math.hypot(dx, dz) || 1;
        const cx = T.x + dx / l * ${dist}, cz = T.z + dz / l * ${dist}; const gy = game.city.groundHeightAt?.(T.x, T.z, 0) ?? 0;
        game.cameraOverride = (dt, cam) => { cam.position.set(cx, gy + 1.8, cz); cam.lookAt(T.x, gy + 1.0, T.z); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.sleep(1500);
      await b.screenshot(`${D}/${SET}_${k}.png`);
    }
  }
  await b.eval('(game.cameraOverride = null, 1)');
  const errs = [...new Set(b.errors)].filter((e) => !/favicon|PortSolanaOcean/.test(e));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
});
