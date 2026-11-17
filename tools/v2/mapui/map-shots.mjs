// r2-mapui: pause map + minimap shots of the coast styling (item 9). Light page: src/ui/mapshot.html (real map data + HUD, no 3D).
// Usage: node tools/v2/mapui/map-shots.mjs <tag>   ->  docs/v2/shots/r2-mapui/map_<tag>_<view>.jpg
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';

const TAG = process.argv[2] || 'now';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const OUT = 'docs/v2/shots/r2-mapui';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5200/tools/v2/mapui/mapshot.html?wanted=0';
const VIEWS = [
  ['shot10', '&view=pause&ppm=0.17&cx=-3150&cz=3900'],
  ['fit', '&view=pause&fit=1'],
  ['bay', '&view=pause&ppm=0.55&cx=1500&cz=900'],
  ['close', '&view=pause&ppm=2.2&cx=1700&cz=2350'],
  ['keys', '&view=pause&ppm=0.3&cx=-2600&cz=5900'],
  ['gulf', '&view=pause&ppm=0.3&cx=-5000&cz=-2600'],
  ['naples1', '&view=pause&ppm=1.0&cx=-4700&cz=-220'],
  ['naples03', '&view=pause&ppm=0.3&cx=-4700&cz=-220'],
  ['mini_beach', '&x=2668&z=660'],
  ['mini_keys', '&x=-1105&z=5500'],
  ['mini_naples', '&x=-4700&z=-220'],
];
await withBrowser({ width: 1600, height: 1000, maxSeconds: 1800 }, async (b) => {
  for (const [name, q] of VIEWS) {
    if (ONLY && !ONLY.includes(name)) continue;
    await b.goto(BASE + q);
    await b.waitFor('window.mapReady === true', 120);
    await b.sleep(name.startsWith('mini') ? 9000 : 7000);
    await b.screenshot(`${OUT}/map_${TAG}_${name}.jpg`);
    console.log('shot', name);
  }
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 10));
});
