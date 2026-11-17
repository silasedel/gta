#!/usr/bin/env node
// Look helper: console check of the default page and the ?look3 page (shader errors, long frames). One browser, two loads.
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const qs = (process.argv[2] || ',&look3').split(',');
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  for (const q of qs) {
    b.errors.length = 0;
    await b.goto('http://127.0.0.1:5200/?mute' + q);
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 400);
    await startGame(b);
    await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; return 1; })()`);
    const r = await b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 8000) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); res(JSON.stringify({ frames: ts.length, med: +ts[ts.length >> 1].toFixed(1), max: +ts[ts.length - 1].toFixed(1), look3: game.look3, tm: game.renderer.toneMapping, progs: game.renderer.info.programs?.length })); } }; requestAnimationFrame(f); })`);
    const errs = [...new Set(b.errors)].filter((e) => /shader|glsl|undeclared|ERROR|program/i.test(e));
    console.log(JSON.stringify({ q: q || '(default)', ...JSON.parse(r), shaderErrors: errs.length }));
    for (const e of errs.slice(0, 8)) console.log('  ', String(e).slice(0, 300));
  }
});
