#!/usr/bin/env node
// Screenshots of bridge-clearance spots (tools/v2/map3/bridge_clearance.mjs report) in the running game, V2 test browser only.
//   node tools/v2/map3/bridge_shots.mjs --report docs/v2/reports/bridge-clearance-before.json --tag before [--q "&deckjoin=0"] [--n 4]
//   node tools/v2/map3/bridge_shots.mjs --spots "2453.9,1595.6;2477,-1033" --tag after
// Shots: docs/v2/shots/bridge-clearance/<tag>_<i>.jpg (oblique view from 24 m at 5 m height, low sun, HUD hidden).
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'now', OUT = 'docs/v2/shots/bridge-clearance';
fs.mkdirSync(OUT, { recursive: true });
let spots = [];
if (o.spots) spots = String(o.spots).split(';').map((s) => s.split(',').map(Number)).map(([x, z, dir]) => ({ x, z, dir: dir || 0 }));
else spots = JSON.parse(fs.readFileSync(o.report, 'utf8')).list.filter((s) => s.deckY - s.roadY > 1.3).slice(0, +(o.n || 4)).map((s) => ({ x: s.x, z: s.z, dir: 0 }));
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 15; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(true); } catch (e) {} const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(st); game.wanted?.clear?.(); if (game.police) game.police.enabled = false; return 1; })()`);
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i], ang = s.dir + 0.7, d = +(o.d || 24), h = +(o.h || 5);
    const yq = `(game.city.elevated?.heightAt?.(${s.x}, ${s.z}, 30) ?? 0)`;
    await b.eval(`(() => { game.teleport(${s.x + 40}, undefined, ${s.z + 40}, 0); const y = ${yq}; game.cameraOverride = (dt, cam) => { cam.position.set(${s.x + Math.sin(ang) * d}, y + ${h}, ${s.z + Math.cos(ang) * d}); cam.lookAt(${s.x}, y - 0.5, ${s.z}); return true; }; return 1; })()`);
    await b.waitFor(`(() => { const st = game.city.streamer; return !st || !st.readyAround || st.readyAround(${s.x}, ${s.z}, 200); })()`, 40).catch(() => {});
    await b.sleep(2500);
    const f = `${OUT}/${TAG}_${i}.jpg`; await b.screenshot(f); console.log('SHOT', f, s.x, s.z);
  }
  if (b.errors.length) console.log('CONSOLE ERRORS', [...new Set(b.errors)].slice(0, 10));
});
process.exit(0);
