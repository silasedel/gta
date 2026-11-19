#!/usr/bin/env node
// r2-water: probe the Everglades (district extent, terrain heights, water kinds) and the water API surface.
import fs from 'node:fs';
import { withBrowser, startGame } from '../browser.mjs';
await withBrowser({ width: 960, height: 540, maxSeconds: 420 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await startGame(b);
  const r = await b.eval(
    `(() => {
    const c = game.city, D = c.data || c; const out = { keys: Object.keys(c).slice(0, 120), sea: c.seaLevel };
    const dist = c.districtAt || D.districtAt; const T = game.terrain || c.terrain;
    out.hasDistrict = !!dist; out.terrainKeys = T ? Object.keys(T).slice(0, 40) : null;
    const cells = {}; const step = 400;
    for (let x = -30000; x <= 30000; x += step) for (let z = -30000; z <= 30000; z += step) {
      const d = dist ? dist(x, z) : null; if (!d || !/Everglades|Big Cypress/.test(d)) continue;
      const k = d; const e = cells[k] || (cells[k] = { n: 0, minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, water: 0, kinds: {}, h: [], cover: {}, layer: {} });
      e.n++; e.minX = Math.min(e.minX, x); e.maxX = Math.max(e.maxX, x); e.minZ = Math.min(e.minZ, z); e.maxZ = Math.max(e.maxZ, z);
      if (c.isWater(x, z)) { e.water++; const wk = c.waterKindAt?.(x, z); e.kinds[wk] = (e.kinds[wk] || 0) + 1; }
      else { e.h.push(+(c.groundHeightAt(x, z)).toFixed(2)); const cv = c.coverAt?.(x, z); e.cover[cv] = (e.cover[cv] || 0) + 1; const ly = T?.layerAt ? T.layerAt(x, z) : null; e.layer[ly] = (e.layer[ly] || 0) + 1; }
    }
    for (const k in cells) { const h = cells[k].h.sort((a, b) => a - b); cells[k].hq = [h[0], h[h.length >> 2], h[h.length >> 1], h[(h.length * 3) >> 2], h[h.length - 1]]; delete cells[k].h; }
    out.cells = cells; out.player = game.player.position.toArray().map((v) => +v.toFixed(1));
    out.env = Object.keys(game.env || {}); out.oceanKeys = game.env?.ocean ? Object.keys(game.env.ocean) : null;
    out.vehKeys = Object.keys(game.vehicles || {}).slice(0, 60);
    return JSON.stringify(out); })()`,
    200000,
  );
  fs.writeFileSync(
    '/private/tmp/claude-501/-Users-silasedel-Downloads-Apps-Games-GTA-6-Southline/eae67895-c4b2-485d-b7e3-b3e348d8dd1c/scratchpad/probe.json',
    r,
  );
  console.log(r.slice(0, 6000));
  if (b.errors.length) console.log('ERR', b.errors.slice(0, 10));
});
