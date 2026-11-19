#!/usr/bin/env node
// r2-look runner: load the game once, then run page-side steps from a module file (each step: { eval, shot, sleep }).
//   node tools/v2/look/r2-run.mjs <steps.mjs> [--q "&foo"] [--w 1920 --h 1080]
// steps.mjs default-exports async (b, h) => {...}; h = { shot(name), ev(expr), sleep(ms), log }
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
const pos = [];
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  } else pos.push(a[i]);
const steps = (await import(pathToFileURL(path.resolve(pos[0])).href)).default;
await withBrowser(
  { width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 1800) },
  async (b) => {
    await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(
      `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.weather?.hold?.(true); game.weather?.set?.('clear', { instant: true }); if (game.intros?.places) game.intros.places.length = 0; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`,
    );
    const h = {
      ev: (e) => b.eval(e),
      sleep: (ms) => b.sleep(ms),
      shot: (f) => b.screenshot(f),
      log: (...x) => console.log(...x),
      async stream(n = 40) {
        for (let i = 0; i < n; i++) {
          const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
          if (q < 3) break;
          await b.sleep(1000);
        }
      },
    };
    await steps(b, h);
    if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
  },
);
