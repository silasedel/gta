#!/usr/bin/env node
// Stall finder: load, start, teleport to a few places and time how long the page takes to answer (main-thread stalls), with and
// without the library plants in one browser run. node tools/v2/vegetation/hangtest.mjs
import { withBrowser, GAME_READY } from '../browser.mjs';
const PLACES = [[-873.6, 4825.2], [-1155, 5500], [407, -110], [-873.6, 4825.2]];
await withBrowser({ width: 1280, height: 720, maxSeconds: 1500 }, async (b) => {
  for (const q of ['', '&veglib=0']) {
    const t0 = Date.now(), lg = (m) => console.log(`${q || 'lib'} [${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
    await b.goto('http://127.0.0.1:5200/?mute' + q); await b.waitFor(GAME_READY, 480); lg('ready');
    for (let k = 0; k < 2; k++) { await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(1500); }
    const ping = async (label) => { const s = Date.now(); const r = await b.eval(`JSON.stringify({ fps: game.perf?.fps && +game.perf.fps.toFixed(1), cs: game.vegetation?.countryside?.stats?.().pending, title: !!game.ui?.title })`, 90000).catch((e) => 'ERR ' + String(e).slice(0, 80)); lg(`${label} answered in ${Date.now() - s} ms ${r}`); };
    await ping('start');
    for (const [x, z] of PLACES) { await b.eval(`game.teleport(${x}, undefined, ${z}, 0), 1`, 90000).catch(() => null); lg(`teleport ${x},${z}`); for (let i = 0; i < 4; i++) { await b.sleep(3000); await ping('  +' + (i + 1) * 3 + 's'); } }
  }
});
