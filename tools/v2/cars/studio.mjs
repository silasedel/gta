// Studio shots of many library cars in ONE browser session:
//   node tools/v2/cars/studio.mjs <outdir> key1,key2,... [views=front34,rear34] [colors=8f949b,b3121b] [extra query]
// -> <outdir>/<key>_<view>_<color>.png (the real game materials, src/vehicles/glb/preview.html)
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';
const [out, keys, views = 'front34,rear34', colors = '8f949b', extra = 'lod=0'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
await withBrowser({ width: 960, height: 600, maxSeconds: 900 }, async (b) => {
  for (const k of keys.split(',')) for (const col of colors.split(',')) {
    await b.goto(`http://127.0.0.1:5200/src/vehicles/glb/preview.html?cars=${k}&color=${col}&${extra}`);
    await b.waitFor('window.ready === true', 120);
    await b.eval('new Promise((r) => setTimeout(r, 400))');
    for (const v of views.split(',')) {
      await b.eval(`window.view(${JSON.stringify(v)}, 0)`);
      await b.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
      await b.screenshot(`${out}/${k}_${v}_${col}.png`);
    }
    console.log('shot', k, col);
  }
  const errs = b.errors.filter((e) => !/favicon/.test(e)); if (errs.length) console.log('CONSOLE ERRORS', errs.slice(0, 8));
});
