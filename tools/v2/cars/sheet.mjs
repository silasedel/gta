// Review sheet for converted library cars: node tools/v2/cars/sheet.mjs <outdir> <key,key,...> [query] [views=front34,rear34]
// -> <outdir>/<key>_<view>.png (640x400 each); montage them with tools/v2/montage.py
import { withBrowser } from '../browser.mjs';
const [outdir, keys, query = '', views = 'front34,rear34'] = process.argv.slice(2);
await withBrowser({ width: 800, height: 500, maxSeconds: 600 }, async (b) => {
  for (const k of keys.split(',')) {
    await b.goto(`http://127.0.0.1:5200/src/vehicles/glb/preview.html?cars=${k}&${query}`);
    try {
      await b.waitFor('window.ready === true', 90);
    } catch (e) {
      console.log('TIMEOUT', k);
      continue;
    }
    for (const v of views.split(',')) {
      await b.eval(`window.view(${JSON.stringify(v)}, 0)`);
      await b.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
      await b.screenshot(`${outdir}/${k}_${v}.png`);
    }
    console.log(k, await b.eval('JSON.stringify(window.stats())'));
  }
  if (b.errors.length)
    console.log('ERRORS', [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 10));
});
