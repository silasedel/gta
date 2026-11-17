// Southline web (r2-web): "after control". Downloads that the spawn area does not need (the rest of the car fleet, every
// gun model, radio streams) wait until the player has control, so the first load spends the line on what is on screen.
//   import { afterControl } from '../web/netGate.js';  afterControl().then(() => startTheBackgroundQueue());
// Resolves when the game is ready and the title / loading screen is gone (game.ui.title false), or after `maxMs`
// (safety net: nothing waits forever). ?gate=0 resolves at once (old behavior).
let p = null;
export function afterControl(maxMs = 90000) {
  if (p) return p;
  p = new Promise((res) => {
    try { if (/[?&]gate=0\b/.test(location.search)) { res(); return; } } catch (e) { res(); return; }
    const t0 = performance.now();
    const tick = () => {
      const g = globalThis.window?.game;
      if ((g?.ready && !g.ui?.title) || performance.now() - t0 > maxMs) { res(); return; }
      setTimeout(tick, 400);
    };
    tick();
  });
  return p;
}
export const controlled = () => { const g = globalThis.window?.game; return !!(g?.ready && !g.ui?.title); };
