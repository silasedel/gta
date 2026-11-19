#!/usr/bin/env node
// world-dressing: print what the merged data holds around a point. node probe.mjs x z [r]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
globalThis.fetch = async (url) =>
  new Response(
    fs.readFileSync(path.join(ROOT, 'public', String(url).replace(/^https?:\/\/[^/]+/, ''))),
  );
const { loadMiamiData } = await import(path.join(ROOT, 'src/world/miami/data.js'));
const data = await loadMiamiData(null, { bundle: false });
const [x, z, r = 120] = process.argv.slice(2).map(Number);
await Promise.all(data.regionsAround(x, z, r + 200).map((k) => data.loadRegion(k)));
const T = data.tileSize;
const out = {
  at: [x, z],
  surface: data.surfaceAt(x, z),
  cover: data.coverAt(x, z),
  zone: data.zoneAt(x, z),
  district: data.districtAt(x, z),
  water: data.isWater(x, z),
  real: data.inRealMiami(x, z),
  areas: {},
  buildings: 0,
  trees: 0,
  props: {},
  roads: 0,
  lamps: 0,
};
for (let tx = Math.floor((x - r) / T); tx <= Math.floor((x + r) / T); tx++) {
  for (let tz = Math.floor((z - r) / T); tz <= Math.floor((z + r) / T); tz++) {
    const t = data.getTile(tx, tz);
    if (!t) continue;
    for (const a of t.areas) {
      const k = a.kind + '/' + (a.cls || '-') + '/' + (a.surface || '-');
      out.areas[k] = (out.areas[k] || 0) + 1;
    }
    out.buildings += t.buildings.filter((b) => Math.hypot(b.cx - x, b.cz - z) < r).length;
    out.trees += t.trees.filter((p) => Math.hypot(p[0] - x, p[1] - z) < r).length;
    out.lamps += t.lamps.filter((p) => Math.hypot(p[0] - x, p[1] - z) < r).length;
    out.roads += t.roads.length;
    for (const p of t.props)
      if (Math.hypot(p.x - x, p.z - z) < r) out.props[p.type] = (out.props[p.type] || 0) + 1;
  }
}
// surface histogram on a 10 m grid
const hist = {};
for (let a = -r; a <= r; a += 10)
  for (let b = -r; b <= r; b += 10) {
    const k = data.surfaceAt(x + a, z + b) + ':' + data.coverAt(x + a, z + b);
    hist[k] = (hist[k] || 0) + 1;
  }
out.surfaceCover10m = hist;
console.log(JSON.stringify(out, null, 1));
