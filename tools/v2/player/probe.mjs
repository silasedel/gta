#!/usr/bin/env node
// Quick in-game probe (PLAYER helper): boots the game muted, runs one expression, prints the result.
//   node tools/v2/player/probe.mjs "<js expression>" [--q "&nico=old"] [--at x,z]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const expr = process.argv[2]; const qi = process.argv.indexOf('--q'); const q = qi > 0 ? process.argv[qi + 1] : '';
const mi = process.argv.indexOf('--max'); await withBrowser({ width: 960, height: 540, maxSeconds: mi > 0 ? +process.argv[mi + 1] : 420 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 400);
  await startGame(b);
  await b.sleep(3000);
  console.log(await b.eval(`(async () => { try { return JSON.stringify(await (async () => { ${expr} })()); } catch (e) { return 'ERR ' + e.stack; } })()`));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 8).join('\n'));
});
