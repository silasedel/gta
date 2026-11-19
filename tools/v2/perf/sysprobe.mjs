// Per-system CPU probe (Nov 19): teleports to each spot, waits, and prints game.perf.sysAvg (ms per frame, EMA),
// the frame work and gap averages, and Rapier's own step breakdown.
//   node tools/v2/perf/sysprobe.mjs [--spots house,downtown,beach]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const SPOTS = {
  house: [-1008, 5174],
  downtown: [-60, -900],
  beach: [700, -300],
};
const args = process.argv.slice(2);
const sIdx = args.indexOf('--spots');
const names = sIdx >= 0 ? args[sIdx + 1].split(',') : Object.keys(SPOTS);

await withBrowser({ width: 1280, height: 720, maxSeconds: 500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  for (const name of names) {
    const [x, z] = SPOTS[name] || name.split(':').map(Number);
    await b.eval(`(game.teleport(${x}, undefined, ${z}), 1)`);
    await b.sleep(20000);
    const out = await b.eval(`(() => {
      const w = game.world;
      w.profilerEnabled = true;
      const t = {};
      const keys = ['timingStep', 'timingCollisionDetection', 'timingBroadPhase', 'timingNarrowPhase', 'timingSolver', 'timingVelocityAssembly', 'timingVelocityResolution', 'timingVelocityUpdate', 'timingVelocityWriteback', 'timingCcd', 'timingUserChanges'];
      for (let i = 0; i < 5; i++) w.step();
      for (const k of keys) if (typeof w[k] === 'function') t[k.replace('timing', '')] = +w[k]().toFixed(2);
      w.profilerEnabled = false;
      const A = game.perf.sysAvg || {};
      const top = Object.entries(A).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k + ' ' + v.toFixed(2));
      return JSON.stringify({ work: +game.perf.workAvg.toFixed(1), gap: +game.perf.gapAvg.toFixed(1), rapier: t, top });
    })()`);
    console.log(name, out);
  }
});
