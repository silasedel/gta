#!/usr/bin/env node
// city-look audits in the running game (V2 test browser only):
//   node src/world/miami/.matcheck.mjs
// 1. Materials: at each fixed viewpoint, walk every visible mesh under the city root and list any whose material has no real
//    texture input (no map / normalMap and no shader-bound PBR array). Unlit emitters (neon, bulbs, beacons) are counted apart.
// 2. Neighbors: every building gets its facade recipe; counts adjacent pairs (footprint boxes within 9 m) sharing a signature.
// Writes docs/v2/reports/city-look-audit.json. Exit code 1 if anything is flat or any neighbor pair matches.
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const POINTS = { southBeach: [3478, -77], downtown: [-2420, 520], brickell: [-2676, 1647], port: [-300, 480], causeway: [500, -110], island: [942, -1305] };
const out = { when: new Date().toISOString(), materials: {}, facades: null };
await withBrowser({ width: 1280, height: 720, maxSeconds: 235 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY + ' && game.teleport && game.city.auditMaterials', 150);
  out.facades = await b.eval('game.city.auditFacades()');
  for (const [name, [x, z]] of Object.entries(POINTS)) {
    await b.eval(`game.teleport(${x}, null, ${z}, 0)`); await b.sleep(1500);
    try { await b.waitFor('game.city.streamer.pending() === 0', 40); } catch (e) { /* keep going */ }
    await b.sleep(800);
    out.materials[name] = await b.eval('game.city.auditMaterials()');
    console.log(name, JSON.stringify(out.materials[name]));
  }
  out.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
});
console.log('facades', JSON.stringify(out.facades));
fs.mkdirSync('docs/v2/reports', { recursive: true }); fs.writeFileSync('docs/v2/reports/city-look-audit.json', JSON.stringify(out, null, 1));
const flat = Object.values(out.materials).reduce((s, m) => s + m.flat, 0);
process.exit(flat || out.facades.sameSignature ? 1 : 0);
