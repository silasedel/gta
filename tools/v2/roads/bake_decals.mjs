#!/usr/bin/env node
// Bake the user's road-detail scans (Models/Road Details, Models/Sewer Grates: up to 1M-triangle photogrammetry) into top-down
// color / normal / height images (headless, tools/v2/roads/bake.html). Output: tools/v2/roads/bake_out/<name>_{color,normal,height}.png
// + meta.json; tools/v2/roads/build_decal_atlas.py turns them into the runtime decal atlas.
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser } from '../browser.mjs';
const OUT = path.resolve('tools/v2/roads/bake_out'); fs.mkdirSync(OUT, { recursive: true });
const JOBS = {
  crack1: 'Models/Road Details/Road Crack 1 - Cracked Asphalt Slab Scan/Road Crack 1.glb',
  pothole1: 'Models/Road Details/Pothole 1 - Patched Asphalt Pothole Scan Slab/Pothole 1.glb',
  pothole2: 'Models/Road Details/Pothole 2 - Broken Asphalt Pothole Plane/Pothole 2.glb',
  manhole1: 'Models/Sewer Grates/Manhole 1 - Concentric-Ring Cover In Cracked Asphalt Slab/Manhole 1.glb',
  manhole2: 'Models/Sewer Grates/Manhole 2 - Rusty Round Cover In Patched Asphalt/Manhole 2.glb',
};
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
const EXTRA = { grate1: ['Models/Sewer Grates/Sewer Grate 1 - Metal Sewer Grate Strips/Sewer Grate 1.fbx', 'Models/Sewer Grates/Sewer Grate 1 - Metal Sewer Grate Strips/textures/Sewage Old Color.png', [23 / 2048, 690 / 2048, 229 / 2048, 803 / 2048]] }; // one 2:1 piece of the first grate strip
const meta = {};
await withBrowser({ width: 800, height: 800, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/tools/v2/roads/bake.html');
  await b.waitFor('window.ready === true', 120);
  const enc = (p) => '/' + p.split('/').map(encodeURIComponent).join('/');
  for (const [k, v] of Object.entries({ ...JOBS, ...EXTRA })) { if (ONLY && !ONLY.includes(k)) continue; const [p, mp, zm] = Array.isArray(v) ? v : [v, null, null];
    const r = JSON.parse(await b.eval(`bake(${JSON.stringify(enc(p))}, 2048, ${JSON.stringify(mp ? enc(mp) : null)}, ${JSON.stringify(zm || null)}).then((r) => JSON.stringify(r))`, 600000));
    for (const ch of ['color', 'normal', 'height']) fs.writeFileSync(path.join(OUT, `${k}_${ch}.png`), Buffer.from(r[ch].split(',')[1], 'base64'));
    meta[k] = { size: r.size, thin: r.thin, half: r.half }; console.log(k, JSON.stringify(meta[k]));
  }
  if (b.errors.length) console.log('ERR', b.errors.slice(0, 5).join('\n'));
});
const prev = fs.existsSync(path.join(OUT, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8')) : {};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ ...prev, ...meta }, null, 1));
