// r2-mapui: the HUD corner alone on white (tools/v2/hudcorner/corner.html) at 1920x1080, DPR 2 (Retina), in the states
// the references show, then the side-by-side sheet (tools/v2/hudcorner/sheet.py).  node tools/v2/hudcorner/corner-white.mjs <tag>
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';

const TAG = process.argv[2] || 'now';
const OUT = 'docs/v2/shots/hudcorner';
fs.mkdirSync(OUT, { recursive: true });
const STATES = [
  ['pistol', 'wanted=4&weapon=pistol&clip=20&reserve=73'],
  ['none', 'wanted=6&weapon=none&cash=3146&bank=15150'],
  ['rifle', 'wanted=2&weapon=rifle&clip=30&reserve=90'],
  ['shotgun', 'wanted=3&weapon=shotgun&clip=6&reserve=12'],
  ['bat', 'wanted=1&weapon=bat'],
  ['smg', 'wanted=5&weapon=smg&clip=35&reserve=105'],
];
await withBrowser({ width: 1920, height: 1080, maxSeconds: 900 }, async (b) => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
  for (const [name, q] of STATES) {
    await b.goto('http://127.0.0.1:5200/tools/v2/hudcorner/corner.html?' + q);
    await b.waitFor('window.cornerReady === true', 120);
    await b.sleep(900);
    await b.screenshot(`${OUT}/white_${TAG}_${name}.png`, { clip: { x: 1440, y: 0, width: 480, height: 470 } });
  }
  console.log('errors', b.errors.filter((e) => !/favicon/.test(e)).slice(0, 8));
});
