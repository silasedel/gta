#!/usr/bin/env node
// People preview screenshots (src/npc/people/preview.html), several views in one browser.
//   node tools/v2/npcs/shots.mjs out_prefix "query1" "query2" ... [--w 1600 --h 900]
// Each query string is appended to the preview URL; writes <out_prefix>_<i>.png and prints window.stats.
import { withBrowser } from '../browser.mjs';
const args = process.argv.slice(2);
const o = { w: 1600, h: 900 };
const qs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--w') o.w = +args[++i];
  else if (args[i] === '--h') o.h = +args[++i];
  else qs.push(args[i]);
}
const out = qs.shift();
await withBrowser({ width: o.w, height: o.h, maxSeconds: 400 }, async (b) => {
  for (let i = 0; i < qs.length; i++) {
    await b.goto('http://127.0.0.1:5200/src/npc/people/preview.html?' + qs[i]);
    await b.waitFor('window.ready === true', 240);
    await b.sleep(300);
    const f = qs.length === 1 ? `${out}.png` : `${out}_${i}.png`;
    await b.screenshot(f);
    console.log(f, await b.eval('JSON.stringify(window.stats)'));
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
});
