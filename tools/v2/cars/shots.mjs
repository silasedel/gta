// Library-car studio shots: node tools/v2/cars/shots.mjs <out.png> '<query>' [view ...]
//   e.g. node tools/v2/cars/shots.mjs /tmp/s.png 'cars=sedan3&color=b3121b' front34 rear34
// Several views -> <out>_<view>.png.  Prints draw calls / triangles and console errors.
import { withBrowser } from '../browser.mjs';
const [out, query = 'cars=sedan3', ...views] = process.argv.slice(2);
await withBrowser({ width: 1280, height: 720, maxSeconds: 200 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/src/vehicles/glb/preview.html?' + query);
  await b.waitFor('window.ready === true', 120);
  await b.eval('new Promise((r) => setTimeout(r, 600))');
  const vs = views.length ? views : [null];
  for (const v of vs) {
    if (v) await b.eval(`window.view(${JSON.stringify(v)}, 0)`);
    await b.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const p = v && vs.length > 1 ? out.replace(/\.png$/, `_${v}.png`) : out;
    await b.screenshot(p);
    console.log(p, await b.eval('JSON.stringify(window.stats())'));
  }
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 8));
});
