#!/usr/bin/env node
// r2-water: find sawgrass / marsh spots in the Everglades near a road, report heights, and screenshot them.
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
const OUT = process.argv[2] || 'docs/v2/shots/water';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await startGame(b);
  const r = await b.eval(`(() => {
    const c = game.city, T = c.terrain, L = T.LAYERS.map((l) => l.key); const G = c.roadGraph; const out = [];
    for (let x = -7000; x <= 0; x += 120) for (let z = -7000; z <= 4000; z += 120) {
      const d = c.districtAt(x, z); if (!d || !/Everglades|Big Cypress/.test(d)) continue;
      const k = L[T.layerAt(x, z)]; if (k !== 'sawgrass' && k !== 'marsh') continue;
      let saw = 0; for (let a = 0; a < 8; a++) { const ax = x + Math.cos(a * 0.785) * 60, az = z + Math.sin(a * 0.785) * 60; const kk = L[T.layerAt(ax, az)]; if (kk === 'sawgrass' || kk === 'marsh') saw++; }
      const ne = G.nearestEdge ? G.nearestEdge(x, z, {}, 400) : null; const rd = ne ? ne.dist : 1e9;
      out.push({ x, z, k, saw, rd: Math.round(rd), road: ne?.edge?.name || ne?.edge?.kind || null, h: +c.groundHeightAt(x, z).toFixed(3), w: c.isWater(x, z) });
    }
    out.sort((a, b) => (b.saw - a.saw) || (a.rd - b.rd));
    const good = out.filter((p) => p.saw >= 7 && p.rd > 40 && p.rd < 250);
    return JSON.stringify({ n: out.length, good: good.slice(0, 12), sample: out.slice(0, 6), hs: out.slice(0, 400).map((p) => p.h) });
  })()`, 300000);
  console.log(r.slice(0, 4000));
  const j = JSON.parse(r); fs.writeFileSync(OUT + '/glades_spots.json', JSON.stringify(j, null, 1));
  const spots = j.good.slice(0, 2);
  let i = 0;
  for (const p of spots) {
    await b.eval(`(() => { const p = ${JSON.stringify(p)}; game.player.body?.setTranslation?.({ x: p.x, y: p.h + 2, z: p.z }, true);
      game.cameraOverride = (dt, cam) => { cam.position.set(p.x - 30, p.h + 9, p.z - 30); cam.lookAt(p.x, p.h, p.z); return true; }; return 1; })()`);
    await b.sleep(9000);
    await b.screenshot(`${OUT}/glades_before_${i++}.jpg`, { format: 'jpeg', quality: 90 });
  }
  if (b.errors.length) console.log('ERR', [...new Set(b.errors)].slice(0, 10));
});
