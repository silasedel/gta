// r2-mapui: wanted-star states on a sky background (empty = translucent gray, earned = white, from the right), 0/1/3/6 and
// the evade flash, next to the references. node tools/v2/hudcorner/stars-strip.mjs -> docs/v2/shots/hudcorner/stars_*.png
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';
const OUT = 'docs/v2/shots/hudcorner';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1920, height: 1080, maxSeconds: 900 }, async (b) => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
  for (const [n, q] of [['0', 'wanted=0&known=0'], ['1', 'wanted=1'], ['2', 'wanted=2'], ['3', 'wanted=3'], ['6', 'wanted=6'], ['flash', 'wanted=3&evading=1']]) {
    await b.goto(`http://127.0.0.1:5200/tools/v2/hudcorner/corner.html?bg=sky&weapon=none&cash=3146&bank=15150&${q}`);
    await b.waitFor('window.cornerReady === true', 120);
    if (n === 'flash') { for (let i = 0; i < 2; i++) { await b.sleep(450 * (i + 1)); await b.screenshot(`${OUT}/stars_flash_${i}.png`, { clip: { x: 1440, y: 0, width: 480, height: 260 } }); } continue; }
    await b.sleep(800);
    await b.screenshot(`${OUT}/stars_${n}.png`, { clip: { x: 1440, y: 0, width: 480, height: 260 } });
  }
  console.log('errors', b.errors.filter((e) => !/favicon/.test(e)).slice(0, 5));
});
