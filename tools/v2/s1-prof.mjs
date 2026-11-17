#!/usr/bin/env node
// Stage 1 profiler: stand at a place, report CPU per system (EMA), frame gap, draw calls, and GPU time per pass (if the
// EXT_disjoint_timer_query_webgl2 extension is available). Muted.
//   node tools/v2/s1-prof.mjs [--at x,z] [--tod 11] [--secs 8] [--eval "js"]
import { withBrowser, GAME_READY } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
await withBrowser({ width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${o.tod || 11}; ${o.at ? `game.teleport(${o.at});` : ''} return 1; })()`);
  if (o.eval) console.log('EVAL', await b.eval(o.eval));
  await b.sleep((+(o.secs || 8)) * 1000);
  const r = await b.eval(`JSON.stringify((() => { const s = game.perf.sysAvg || {}; const top = Object.entries(s).filter(([, v]) => v > 0.15).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, v]) => k + ' ' + v.toFixed(2)); const ri = game.renderer.info.render;
    return { gapAvg: +(game.perf.gapAvg || 0).toFixed(1), workAvg: +(game.perf.workAvg || 0).toFixed(1), fps: game.perf.fps && +game.perf.fps.toFixed(1), calls: ri.calls, tris: ri.triangles, q: game.quality?.current?.name, look: game.quality?.current?.look, top }; })())`);
  console.log(r);
  if (o.after) console.log('AFTER', await b.eval(o.after));
});
