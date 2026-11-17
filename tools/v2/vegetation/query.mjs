#!/usr/bin/env node
// Evaluate expressions in a running game (after READY): node tools/v2/vegetation/query.mjs "expr1" ["expr2" ...]
import { withBrowser, GAME_READY } from '../browser.mjs';
await withBrowser({ width: 960, height: 540, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY, 480);
  for (const e of process.argv.slice(2)) console.log('>', e.slice(0, 80), '\n', JSON.stringify(await b.eval(e, 60000).catch((x) => String(x).slice(0, 300))).slice(0, 3000));
});
