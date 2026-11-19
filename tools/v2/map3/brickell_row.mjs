#!/usr/bin/env node
// Brickell Avenue tower row check (W4): stats of game.brickellRow, frame time, day / night shots along the avenue. V2 test browser only.
//   node tools/v2/map3/brickell_row.mjs --tag now [--q "&brickellrow=0"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 'now',
  OUT = 'docs/v2/shots/brickell-row';
fs.mkdirSync(OUT, { recursive: true });
const rep = { tag: TAG, shots: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: 280 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  await startGame(b);
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = 15.5; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(true); } catch (e) {} if (game.police) game.police.enabled = false; return 1; })()`,
  );
  // stand on the sidewalk by the median's middle
  const spot = JSON.parse(
    await b.eval(`(() => { const G = game.city.roadGraph, e = G.edges.filter((e) => /^Brickell Ave/.test(e.name || '') && Math.hypot(G.pointAt(e, e.length / 2, {}).x - 110, G.pointAt(e, e.length / 2, {}).z - 1640) < 260).sort((a, b) => b.length - a.length)[0];
    const q = G.pointAt(e, e.length * 0.25, {}), w = e.width / 2 + 2.2; return JSON.stringify({ x: q.x - q.dz * w, z: q.z + q.dx * w, dx: q.dx, dz: q.dz, len: e.length, mx: q.x, mz: q.z }); })()`),
  );
  rep.spot = spot;
  await b.eval(
    `(game.teleport(${spot.x}, undefined, ${spot.z}, Math.atan2(${spot.dx}, ${spot.dz})), 1)`,
  );
  await b
    .waitFor(
      `(() => { const st = game.city.streamer; return !game.teleportHolding && (!st || !st.readyAround || st.readyAround(${spot.x}, ${spot.z}, 200)); })()`,
      60,
    )
    .catch(() => {});
  await b.sleep(9000);
  rep.row = JSON.parse(
    await b.eval(
      `JSON.stringify(game.brickellRow ? { ...game.brickellRow, root: undefined } : null)`,
    ),
  );
  const views = [
    ['street', 0, 1.7, -6, 20],
    ['median', 1, 1.4, 0, 18],
  ];
  for (const tod of [15.5, 21]) {
    await b.eval(`(game.timeOfDay = ${tod}, 1)`);
    await b.sleep(2500);
    for (const [nm, mode, hgt, back, ahead] of views) {
      await b.eval(`(() => { const s = ${JSON.stringify(spot)}; const bx = ${mode ? 's.mx' : 's.x'} + s.dx * ${back}, bz = ${mode ? 's.mz' : 's.z'} + s.dz * ${back};
        game.cameraOverride = (dt, c) => { c.position.set(bx - s.dz * ${mode ? 3.2 : 0}, ${hgt} + 0.2, bz + s.dx * ${mode ? 3.2 : 0}); c.lookAt(bx + s.dx * ${ahead}, ${hgt + 1.6}, bz + s.dz * ${ahead}); return true; }; return 1; })()`);
      await b.sleep(1500);
      const f = `${OUT}/${TAG}_${nm}_${tod}.jpg`;
      await b.screenshot(f);
      rep.shots.push(f);
    }
  }
  rep.frame = JSON.parse(
    await b.eval(
      `new Promise((res) => { const t = []; let l = performance.now(), n = 0; const f = () => { const q = performance.now(); t.push(q - l); l = q; if (++n < 90) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res(JSON.stringify({ med: +t[45].toFixed(1), p90: +t[81].toFixed(1), calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles })); } }; requestAnimationFrame(f); })`,
    ),
  );
  await b.eval(`(game.cameraOverride = null, 1)`);
  rep.errors = [...new Set(b.errors)].slice(0, 10);
});
fs.writeFileSync(`docs/v2/reports/brickell-row-${TAG}.json`, JSON.stringify(rep, null, 1));
console.log(JSON.stringify({ row: rep.row, frame: rep.frame, errors: rep.errors }, null, 1));
process.exit(0);
