#!/usr/bin/env node
// Screenshots of any of the people bench pages, several queries in one browser.
//   node tools/v2/npcs/page-shots.mjs src/npc/people/seat_preview.html out_prefix "query1" "query2" ... [--w 1200 --h 800]
import { withBrowser } from '../browser.mjs';
const args = process.argv.slice(2); const o = { w: 1200, h: 800 }; const qs = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--w') o.w = +args[++i]; else if (args[i] === '--h') o.h = +args[++i]; else qs.push(args[i]); }
const page = qs.shift(), out = qs.shift();
await withBrowser({ width: o.w, height: o.h, maxSeconds: 400 }, async (b) => {
  for (let i = 0; i < qs.length; i++) {
    await b.goto('http://127.0.0.1:5200/' + page + '?' + qs[i]);
    await b.waitFor('window.ready === true', 240);
    await b.sleep(300);
    await b.screenshot(`${out}_${i}.png`);
    console.log(`${out}_${i}.png`, await b.eval('JSON.stringify(window.stats)'));
  }
  const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
  if (errs.length) console.log('ERRORS', errs.slice(0, 20).join('\n'));
});
