// r2-mapui: bakes the HUD weapon icons (tools/v2/hudcorner/bake.html) into public/assets/ui/weapons/<id>.png and
// writes public/assets/ui/weapons/index.json ({ id: { w, h } } in HUD units). Usage: node tools/v2/hudcorner/bake-icons.mjs [ids]
import fs from 'node:fs';
import { withBrowser } from '../browser.mjs';

const OUT = 'public/assets/ui/weapons';
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? '?only=' + process.argv[2] : '';
await withBrowser({ width: 1400, height: 900, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/tools/v2/hudcorner/bake.html' + only);
  await b.waitFor('window.bakeDone === true', 600);
  const res = JSON.parse(await b.eval('JSON.stringify(window.bake)'));
  const idxPath = `${OUT}/index.json`;
  const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : {};
  for (const [id, r] of Object.entries(res)) {
    fs.writeFileSync(`${OUT}/${id}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
    idx[id] = { w: Math.round(r.w), h: Math.round(r.h) };
  }
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
  console.log('baked', Object.keys(res).length, Object.keys(res).join(' '));
  console.log('errors', b.errors.filter((e) => !/favicon/.test(e)).slice(0, 8));
});
