// Regression check (user: "when I get out of a car it despawns"): enter the nearest parked car, drive it ~40 m, get out,
// walk 80 m away, let every cleanup run (house lots, sweeps, other systems' vehicles.remove calls) and check the car is
// still there; then try a direct game.vehicles.remove() on it (other systems' path): it must be refused.
//   node tools/v2/cars/service/exitkeep.mjs
import { withBrowser, GAME_READY, startGame } from '../../browser.mjs';
await withBrowser({ width: 1000, height: 600, maxSeconds: 400 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.sleep(8000);
  const r1 = await b.eval(`(async () => {
    const V = game.vehicles, pp = game.player.position;
    const cand = V.list.filter((v) => !v.ai && !v.disabled && v.car?.glb && !v.pinned).sort((a, b) => a.mesh.position.distanceTo(pp) - b.mesh.position.distanceTo(pp));
    const v = cand[0]; if (!v) return 'no parked car';
    v.locked = false; game.enterVehicle(v); window.__car = v;
    await new Promise((r) => setTimeout(r, 1500));
    for (let i = 0; i < 40; i++) { v.setControls({ throttle: 0.6, steer: 0, brake: 0, handbrake: false }); await new Promise((r) => setTimeout(r, 100)); }
    v.setControls({ throttle: 0, steer: 0, brake: 1, handbrake: true });
    await new Promise((r) => setTimeout(r, 2000));
    game.exitVehicle();
    return JSON.stringify({ key: v.typeKey, driven: !!v.everDriven, inList: V.list.includes(v) });
  })()`);
  console.log('entered + exited', r1);
  await b.sleep(3000);
  await b.eval(
    `(() => { const t = window.__car.body.translation(); game.teleport(t.x + 80, undefined, t.z + 10, 0); return 1; })()`,
  );
  await b.sleep(25000);
  const r2 = await b.eval(
    `(() => { const V = game.vehicles, v = window.__car; const before = V.list.includes(v); const refused = V.remove(v) === false; return JSON.stringify({ stillThere: before, removeRefused: refused, stillAfter: V.list.includes(v), sweep: V.sweepStats?.() }); })()`,
  );
  console.log('after walking away', r2);
  const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
  console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 6)));
});
