#!/usr/bin/env node
// Vegetation track: Overseas Highway verge colour check at the city-look 'oh' pose (same camera as
// src/world/miami/.shots.mjs street view, 1 PM). Probes the terrain layer under the verge and saves one shot.
//   node tools/v2/veg-verge.mjs --set before|after
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from './browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after', OUT = path.resolve('docs/v2/shots/vegetation/verge'); fs.mkdirSync(OUT, { recursive: true });
const p = JSON.parse(fs.readFileSync(path.resolve('docs/v2/shots/city-look/views.json'), 'utf8')).oh;
await withBrowser({ width: 1600, height: 900, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  const stage = `(() => { const p = ${JSON.stringify(p)}; game.timeExternal = true; game.timeOfDay = 13;
    const gy = (game.city.groundHeightAt ? game.city.groundHeightAt(p.x, p.z, p.y + 1) : 0) || 0;
    game.teleport(p.x - p.dz * (p.w / 2 + 1.6), null, p.z + p.dx * (p.w / 2 + 1.6), Math.atan2(p.dx, p.dz));
    const eye = [p.x - p.dx * 6, gy + 1.75, p.z - p.dz * 6], look = [p.x + p.dx * 60, gy + 5.5, p.z + p.dz * 60];
    game.cameraOverride = (dt, cam) => { cam.position.set(eye[0], eye[1], eye[2]); cam.lookAt(look[0], look[1], look[2]); if (cam.fov !== 62) { cam.fov = 62; cam.updateProjectionMatrix(); } return true; };
    if (!window.__vc) { window.__vc = document.createElement('style'); window.__vc.textContent = 'body > *:not(canvas) { visibility: hidden !important; } #title, #ps-hud, #ps-hud * { display: none !important; }'; document.head.appendChild(window.__vc); }
    const gc = game.renderer.domElement; for (const c of document.querySelectorAll('canvas')) if (c !== gc) c.style.setProperty('display', 'none', 'important'); return true; })()`;
  await b.eval(stage); await b.sleep(4000);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600); await b.eval(stage);
  await b.waitFor(`(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`, 120).catch(() => {}); await b.sleep(5000); await b.eval(stage); await b.sleep(1500);
  const probe = await b.eval(`(() => { const p = ${JSON.stringify(p)}, T = game.city.terrain, K = T.LAYERS.map((l) => l.key), out = {};
    for (let s = -10; s <= 80; s += 10) for (const off of [-25, -15, -9, -6.5, 6.5, 9, 15, 25]) { const x = p.x + p.dx * s - p.dz * off, z = p.z + p.dz * s + p.dx * off, k = K[T.layerAt(x, z)] + (T.isKeys(x, z) ? '/keys' : '') + ' cover:' + (game.city.mapLayers && 0 || '') ; out[k] = (out[k] || 0) + 1; }
    return JSON.stringify({ layers: out, zone: game.city.zoneAt(p.x, p.z), biome: game.vegetation?.countryside?.biomeAt(p.x - p.dz * 12, p.z + p.dx * 12) }); })()`);
  console.log('probe', probe);
  console.log('SHOT', await b.screenshot(path.join(OUT, `${SET}_oh_street_13.png`)));
  if (b.errors.length) console.log('errors', [...new Set(b.errors)].slice(0, 5).map((e) => e.slice(0, 160)));
});
