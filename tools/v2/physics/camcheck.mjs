// r2-physics: chase-camera pumping check. The player gets into a car and the lab cruise drives it down a palm / lamp / bush lined
// street; the camera-to-car distance is logged every frame and "pumps" (in-then-out swings over 0.3 m within 1.2 s) are counted.
//   node tools/v2/physics/camcheck.mjs [--kmh 40] [--at 407,-110]
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
    .map(Number),
  KMH = +(o.kmh || 40);
const OUT = 'docs/v2/shots/r2-physics/cam';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
  await b.eval(`JSON.stringify(__lab.findSpot(${at[0]}, ${at[1]}))`);
  await b.eval(
    `(() => { const S = __lab.spot; game.teleport(S.x0 + S.rx * 2.4, undefined, S.z0 + S.rz * 2.4); return 1; })()`,
  );
  await b.sleep(9000);
  for (let k = 0; k < 2; k++) {
    await b.key('Enter', true, 'Enter');
    await b.key('Enter', false, 'Enter');
    await b.sleep(700);
  }
  await b.eval(`__lab.spawn('sedan3', 0).then(() => { __lab.v.playerDriven = false; return 1; })`);
  await b.eval(
    `(() => { const S = __lab.spot, v = __lab.v; const t = v.body.translation(); game.teleport(t.x + S.rx * 2.2, undefined, t.z + S.rz * 2.2); return 1; })()`,
  );
  await b.sleep(800);
  await b.key('KeyF', true, 'f');
  await b.sleep(150);
  await b.key('KeyF', false, 'f');
  await b.sleep(2500);
  const inCar = await b.eval('!!(game.player.state?.inVehicle)');
  console.log('in car', inCar);
  await b.eval(
    `(() => { game.cameraOverride = null; window.__cd = []; const v = __lab.v; const tick = () => { const c = game.camera.position, t = v.body.translation(); window.__cd.push(Math.hypot(c.x - t.x, c.y - t.y, c.z - t.z)); const q = game.__camDbg || {}; (window.__cg ||= []).push([+(q.camDist || 0).toFixed(2), +(q.colDist || 0).toFixed(2), q.hit ? 1 : 0]); window.__cdR = requestAnimationFrame(tick); }; tick(); return 1; })()`,
  );
  const runP = b.eval(
    `__lab.run({ kmh: ${KMH}, sEnd: 140, maxT: 30 }).then((r) => JSON.stringify(r))`,
    200000,
  );
  for (let k = 0; k < 6; k++) {
    await b.sleep(1800);
    await b.screenshot(`${OUT}/chase_${String(k).padStart(2, '0')}.jpg`, { quality: 90 });
  }
  await runP;
  const r = JSON.parse(
    await b.eval(`(() => { cancelAnimationFrame(window.__cdR); const d = window.__cd; let pumps = 0, minD = 1e9, maxD = 0;
    for (let i = 0; i < d.length; i++) { minD = Math.min(minD, d[i]); maxD = Math.max(maxD, d[i]); }
    for (let i = 1; i < d.length - 1; i++) { const w0 = Math.max(0, i - 20), w1 = Math.min(d.length - 1, i + 20); let lo = d[i], i0 = i; for (let j = w0; j <= w1; j++) if (d[j] < lo) { lo = d[j]; i0 = j; } if (i0 !== i) continue; const before = Math.max(...d.slice(w0, i0 + 1)), after = Math.max(...d.slice(i0, w1 + 1)); if (before - lo > 0.3 && after - lo > 0.3) pumps++; }
    const G = window.__cg || []; const hits = G.filter((g) => g[2]).length, colBelow = G.filter((g) => g[1] < g[0] - 0.2).length;
    return JSON.stringify({ frames: d.length, pumps, obstructedFrames: hits, colPulledInFrames: colBelow, camDistRange: [Math.min(...G.map((g) => g[0])), Math.max(...G.map((g) => g[0]))], minDist: +minD.toFixed(2), maxDist: +maxD.toFixed(2) }); })()`),
  );
  console.log('camera', JSON.stringify(r));
  fs.writeFileSync(
    'docs/v2/reports/physics-camcheck.json',
    JSON.stringify({ inCar, ...r }, null, 1),
  );
});
