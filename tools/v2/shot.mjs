#!/usr/bin/env node
// One-shot screenshot / eval through the V2 test browser (see browser.mjs for the rules).
//   node tools/v2/shot.mjs --url http://127.0.0.1:5200/src/x/preview.html --wait "window.ready" --out docs/v2/shots/x.png
// Options: --w 1280 --h 720 --settle 1500 (ms after wait) --eval "<js expr, result printed as JSON>" --evalFile f.js
//          --waitSeconds 120 --max 240 (hard kill) --game (wait for the full game to finish loading)
// Exit code 1 if the page logged console errors (they are printed), unless --allowErrors is given.
import fs from 'node:fs';
import { withBrowser, GAME_READY } from './browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
if (!o.url) {
  console.error('need --url');
  process.exit(64);
}

let bad = false;
await withBrowser(
  { width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.max || 240) },
  async (b) => {
    await b.goto(o.url);
    const wait = o.game ? GAME_READY : o.wait;
    if (wait) await b.waitFor(wait, +(o.waitSeconds || 120));
    const code = o.evalFile ? fs.readFileSync(o.evalFile, 'utf8') : o.eval;
    if (code) {
      const v = await b.eval(code);
      console.log('EVAL', typeof v === 'string' ? v : JSON.stringify(v));
    }
    await b.sleep(+(o.settle || 1500));
    if (o.out) console.log('SHOT', await b.screenshot(o.out));
    if (b.errors.length) {
      console.log(
        'CONSOLE ERRORS (' +
          b.errors.length +
          '):\n' +
          [...new Set(b.errors)].slice(0, 25).join('\n'),
      );
      bad = !o.allowErrors;
    }
  },
);
process.exit(bad ? 1 : 0);
