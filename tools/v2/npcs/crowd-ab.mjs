#!/usr/bin/env node
// Far crowd A/B in one browser: the old mannequin tier vs the user's people tier, same spot, same fixed camera; median
// frame time over 12 s each, run twice (ABAB). node tools/v2/npcs/crowd-ab.mjs [--at 407,-110]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const AT = String(o.at || '407,-110')
  .split(',')
  .map(Number);
const rep = { at: AT, runs: [] };
await withBrowser({ width: 1280, height: 800, maxSeconds: 1500 }, async (b) => {
  for (const mode of ['old', 'people', 'old', 'people']) {
    await b.goto('http://127.0.0.1:5200/?mute&farcrowd=' + mode);
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    await startGame(b);
    await b.eval(
      `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`,
    );
    await b.sleep(40000);
    await b.eval(
      `(() => { const p = game.player.position.clone(); game.cameraOverride = (dt, cam) => { cam.position.set(p.x, p.y + 2.0, p.z); cam.lookAt(p.x + 40, p.y + 1.2, p.z - 30); return true; }; window.__ft = []; let last = performance.now(); const f = () => { const n = performance.now(); window.__ft.push(n - last); last = n; if (window.__ft.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`,
    );
    await b.sleep(12000);
    const r = JSON.parse(
      await b.eval(
        `JSON.stringify((() => { const a = window.__ft.slice(10).sort((x, y) => x - y); return { mode: '${mode}', frames: a.length, median: +a[a.length >> 1].toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), crowd: game.people?.crowd?.count, calls: game.renderer.info.render.calls, far: game.people?.crowd?.impl?.stats?.() || null }; })())`,
      ),
    );
    console.log(JSON.stringify(r));
    rep.runs.push(r);
  }
});
fs.writeFileSync('docs/v2/reports/r2-people-crowd-ab.json', JSON.stringify(rep, null, 1));
