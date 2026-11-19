#!/usr/bin/env node
// Everglades r7: top-down dump of the glades (layer / water / district / roads) to a PNG for picking camp sites.
//   node tools/v2/everglades/mapdump.mjs out.png
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../browser.mjs';
const OUT = process.argv[2] || 'docs/v2/reports/everglades-map.png';
await withBrowser({ width: 800, height: 600, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 480);
  const url = await b.eval(`(() => {
    const c = game.city, T = c.terrain, L = T.LAYERS.map((l) => l.key), S = 20, X0 = -6600, Z0 = -6600, W = 360, H = 520;
    const col = { lawn: [120,150,80], scrub: [140,140,90], forest: [40,90,40], pine: [60,110,60], sawgrass: [170,160,90], marsh: [110,130,80], sand: [220,210,170], shell: [230,230,220], dirt: [140,110,80], farm: [180,190,110], grove: [80,140,60], rock: [150,150,150], gravel: [160,160,160], damp: [90,110,90], base: [100,100,100], meadow: [150,180,100] };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); const im = g.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = X0 + i * S, z = Z0 + j * S, k = (j * W + i) * 4; let rgb;
      if (c.isWater(x, z)) rgb = [30, 60, 110]; else rgb = col[L[T.layerAt(x, z)]] || [255, 0, 255];
      const d = c.districtAt(x, z) || ''; if (!/Everglades|Big Cypress/.test(d)) rgb = rgb.map((v) => v * 0.45);
      im.data[k] = rgb[0]; im.data[k + 1] = rgb[1]; im.data[k + 2] = rgb[2]; im.data[k + 3] = 255; }
    g.putImageData(im, 0, 0); g.strokeStyle = '#ff3030'; g.lineWidth = 1;
    for (const e of c.roadGraph.edges) { g.beginPath(); e.pts.forEach((p, n) => { const px = (p[0] - X0) / S, py = (p[1] - Z0) / S; n ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); }
    g.fillStyle = '#fff'; g.font = '9px sans-serif'; for (let x = -6000; x <= 400; x += 1000) for (let z = -6000; z <= 3500; z += 1000) { g.fillRect((x - X0) / S, (z - Z0) / S, 2, 2); g.fillText(x + ',' + z, (x - X0) / S + 2, (z - Z0) / S - 2); }
    return cv.toDataURL('image/png'); })()`);
  fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64')); console.log('MAP', OUT);
});
