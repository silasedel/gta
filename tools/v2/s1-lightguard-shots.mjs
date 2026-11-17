#!/usr/bin/env node
// Stage 1 perf proof: the same frozen frame rendered with and without the light-loop guard (src/world/env/shadows.js),
// in one session (materials recompiled in between), plus the mean absolute pixel difference.
//   node tools/v2/s1-lightguard-shots.mjs [--at x,z] [--tod 21.5] [--out dir] [--name spawnNight]
// One frozen shot per session (compare two sessions, e.g. --q "&nolightguard"): --single
// Runtime toggles instead (no recompile): --on "js" --off "js" (e.g. --on "game.drawOrder.on=true" --off "game.drawOrder.on=false")
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const OUT = o.out || 'docs/v2/shots/stage1', NAME = o.name || 'lg';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1920, height: 1080, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${o.tod || 21.5}; game.quality.set('high', { manual: true });
    try { game.weather.set('clear', { instant: true }); game.weather.hold?.(); } catch (e) {}
    ${o.at ? `game.teleport(${o.at});` : ''} return 1; })()`);
  await b.sleep(8000);
  for (let i = 0; i < 60; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 3) break; await b.sleep(1000); }
  await b.sleep(3000);
  // freeze the world: no simulation; the camera stays where it is; TAA jitter keeps running (averaged by the history)
  await b.eval(`(() => { game.ui.paused = true; const p = game.camera.position.clone(), q = game.camera.quaternion.clone(); game.cameraOverride = (dt, cam) => { cam.position.copy(p); cam.quaternion.copy(q); return true; }; return 1; })()`);
  const recompile = (which) => b.eval(`(async () => { const m = await import('/src/world/env/shadows.js'); const g = m.guardLightLoops; g.chunks.lights_fragment_begin = g.${which};
    const mats = new Set(); game.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((x) => mats.add(x)); }); for (const x of mats) x.dispose();
    await new Promise((r) => setTimeout(r, 5000)); for (let i = 0; i < 40; i++) { const n = game.renderer.info.programs.length; await new Promise((r) => setTimeout(r, 1000)); if (game.renderer.info.programs.length === n) break; } return 1; })()`, 200000);
  if (o.single) {
    await b.sleep(2500); await b.screenshot(`${OUT}/${NAME}.png`);
  } else if (o.on) {
    const set = async (js) => { await b.eval(`(() => { ${js}; return 1; })()`); await b.sleep(2500); };
    await set(o.on); await b.screenshot(`${OUT}/${NAME}_on.png`);
    await set(o.off); await b.screenshot(`${OUT}/${NAME}_off.png`);
    await set(o.on); await b.screenshot(`${OUT}/${NAME}_on2.png`);
  } else {
    // recompile once first so both compared frames come from the same (recompiled) state
    await recompile('guarded'); await b.sleep(2000);
    await b.screenshot(`${OUT}/${NAME}_guard_on.png`);
    await recompile('unguarded'); await b.sleep(2000);
    await b.screenshot(`${OUT}/${NAME}_guard_off.png`);
    await recompile('guarded'); await b.sleep(2000);
    await b.screenshot(`${OUT}/${NAME}_guard_on2.png`);
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 6).join('\n'));
});
