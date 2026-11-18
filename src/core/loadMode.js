// Load mode (r3-web). Web: load what the spawn needs before play and stream the rest in the background after READY
// (nearest first, one file at a time, low priority). The Mac app (app:// protocol) and ?preload=all keep the full preload.
//   ?preload=all   -> full preload (today's behavior, also forced in the app)
//   ?preload=lazy  -> streamed load, even in the app protocol or dev server (for testing)
// Default: lazy on the web build, off on the dev server (127.0.0.1:5200, localhost) so everyone's tests keep their timing.
const q = (() => { try { return new URLSearchParams(location.search).get('preload'); } catch (e) { return null; } })();
const isApp = (() => { try { return location.protocol === 'app:'; } catch (e) { return false; } })();
const isDev = (() => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !!import.meta.env?.DEV; } catch (e) { return false; } })();
export const LAZY = q === 'lazy' || (q !== 'all' && !isApp && !isDev);
// run fn once the game is playable (game.ready), then a short grace so the first frames are not shared with downloads
export function afterReady(fn, graceMs = 2500) {
  const t0 = performance.now();
  const tick = () => {
    if (globalThis.game?.ready) setTimeout(fn, graceMs);
    else if (performance.now() - t0 > 180000) setTimeout(fn, graceMs);
    else setTimeout(tick, 400);
  };
  tick();
}
// run async jobs one after another, each starting only when the page is idle enough (no long frames), never in a burst
export async function trickle(jobs, { gapMs = 250 } = {}) {
  for (const job of jobs) {
    try { await new Promise((r) => (globalThis.requestIdleCallback ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 50))); await job(); } catch (e) { console.warn('[load] background job failed', e); }
    await new Promise((r) => setTimeout(r, gapMs));
  }
}
