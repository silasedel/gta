#!/usr/bin/env node
// Library plant contact sheet: node tools/v2/vegetation/sheet.mjs out.png "keys" [view] [query]
import { withBrowser } from '../browser.mjs';
const [out, keys, view = 'whole', extra = ''] = process.argv.slice(2);
await withBrowser({ width: 1600, height: 1000, maxSeconds: 200 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/src/world/vegetation/libpreview.html?keys=${keys}&view=${view}${extra}`);
  try { await b.waitFor('window.libReady', 150); } catch (e) { console.log('errors', b.errors.slice(0, 8)); throw e; }
  await b.sleep(800); await b.screenshot(out);
  if (b.errors.length) console.log('errors', b.errors.slice(0, 8));
  console.log(await b.eval('document.getElementById("i").textContent'));
});
