// r2-physics boot check: the game boots with ?carphys=N, cars exist and use the chosen controller, traffic drives, no errors.
//   node tools/v2/physics/boot.mjs [--phys 2] [--secs 40] [--at x,z]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const PHYS = +(o.phys || 2),
  at = String(o.at || '407,-110')
    .split(',')
    .map(Number);
await withBrowser({ width: 960, height: 540, maxSeconds: 1800 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/?mute&carphys=${PHYS}`);
  await b.waitFor(GAME_READY, 600);
  console.log('ready', new Date().toISOString());
  console.log(
    'vehicles api',
    await b.eval(
      `JSON.stringify({ spawn: typeof game.vehicles.spawn, list: game.vehicles.list?.length, physics: Object.keys(game.physics || {}) })`,
    ),
  );
  await startGame(b);
  await b.eval(`(() => { game.teleport(${at[0]}, undefined, ${at[1]}); return 1; })()`);
  // traffic stability + frame time: flips (AI body up < 0.5), worst AI tilt, rAF frame time. --ab: carphys 1 then 2 then 1 then 2
  // in ONE session (same streaming state), each phase o.secs long
  async function measure(tag) {
    await b.eval(`(() => { const S = window.__stab = { flips: new Set(), samples: 0, maxTilt: 0, ft: [], last: performance.now() };
      const tick = () => { const now = performance.now(); S.ft.push(now - S.last); S.last = now; S.raf = requestAnimationFrame(tick); }; S.raf = requestAnimationFrame(tick);
      S.iv = setInterval(() => { for (const v of game.vehicles.list || []) { if (!v.body || v.ghost || v.frozen) continue; const r = v.body.rotation(), uy = 1 - 2 * (r.x * r.x + r.z * r.z); S.samples++;
        const t = Math.acos(Math.max(-1, Math.min(1, uy))) * 57.3; if (v.ai) S.maxTilt = Math.max(S.maxTilt, t); if (uy < 0.5 && v.ai) S.flips.add(v.uid || v.id); } }, 500); return 1; })()`);
    await b.sleep((+o.secs || 40) * 1000);
    console.log(
      'stab',
      tag,
      await b.eval(
        `(() => { const S = window.__stab; clearInterval(S.iv); cancelAnimationFrame(S.raf); const f = S.ft.slice(5).sort((a, b) => a - b); const L = game.vehicles.list || []; return JSON.stringify({ flips: S.flips.size, maxTiltDeg: +S.maxTilt.toFixed(1), samples: S.samples, frameMsMedian: +f[Math.floor(f.length / 2)].toFixed(1), frameMsP95: +f[Math.floor(f.length * 0.95)].toFixed(1), frames: f.length, shape: L.filter((v) => v.vc?.isShapeVehicle).length, rapier: L.filter((v) => v.vc && !v.vc.isShapeVehicle).length, nan: L.reduce((q, v) => q + (v.nanFixes || 0), 0) }); })()`,
      ),
    );
  }
  if (o.ab) {
    for (const ph of [1, 2, 1, 2]) {
      await b.eval(`(() => { game.physics.setCarPhysics(${ph}); return 1; })()`);
      await b.sleep(3000);
      await measure('carphys' + ph);
    }
  } else await measure('carphys' + PHYS);
  console.log(
    'cars',
    await b.eval(`JSON.stringify((() => { const L = game.vehicles.list || []; const by = { shape: 0, rapier: 0, none: 0, ghost: 0, frozen: 0 }; let moving = 0, tilt = 0;
    for (const v of L) { if (v.ghost) by.ghost++; else if (v.frozen) by.frozen++; else if (!v.vc) by.none++; else if (v.vc.isShapeVehicle) by.shape++; else by.rapier++; if (Math.abs(v.speed || 0) > 2) moving++;
      const r = v.body.rotation(); tilt = Math.max(tilt, Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (r.x * r.x + r.z * r.z)))) * 57.3); }
    return { n: L.length, by, moving, maxTiltDeg: +tilt.toFixed(1), nan: L.reduce((q, v) => q + (v.nanFixes || 0), 0), relief: game.physics?.reliefStats?.(), rocks: game.physics?.rocks?.count?.() }; })())`),
  );
  const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
  console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 12)).slice(0, 4000));
});
