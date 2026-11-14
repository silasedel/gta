// maproads: where do the merge audit's road / coverage failures sit? (same rules as tools/osm/audit.mjs, with locations)
//   node tools/v2/maproads/audit-where.mjs [--nocov]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOT = path.join(GAME, 'public/assets/miami');
globalThis.fetch = async (url) => {   // same shim as tools/osm/audit.mjs
  const f = path.join(ROOT, String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/assets\/miami\//, ''));
  if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => { throw new Error('404 ' + url); }, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  const bi = process.argv.indexOf('--build');
  const buf = (bi > 0 && f.endsWith('world.json')) ? fs.readFileSync(path.join(ROOT, process.argv[bi + 1], 'manifest.json')) : fs.readFileSync(f);
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const { loadMiamiData } = await import(pathToFileURL(path.join(GAME, 'src/world/miami/data.js')).href);
const data = await loadMiamiData(null);
const rg = data.roadGraph, E = rg.edges, N = rg.nodes;
const sig = new Map();
for (const e of E) {
  const mid = e.pts[(e.pts.length / 2) | 0];
  const k = Math.min(e.a, e.b) + '|' + Math.max(e.a, e.b) + '|' + e.pts.length + '|' + Math.round(e.length * 10) + '|' + Math.round(mid[0] * 10) + '|' + Math.round(mid[1] * 10) + '|' + (e.oneway ? e.a : '');
  if (sig.has(k)) { const o = E[sig.get(k)]; console.log('DUP', e.name, e.kind, o.name, o.kind, mid.map(Math.round), 'len', e.length.toFixed(1), 'oneway', e.oneway, o.oneway, 'synthetic', e.synthetic); } else sig.set(k, e.id);
}
for (const e of E) for (let i = 1; i < e.pts.length; i++) { const d = e.cum[i] - e.cum[i - 1]; if (d < 0.5) continue; const g = Math.abs(e.y[i] - e.y[i - 1]) / d; if (g > 0.125) console.log('STEEP', e.name, e.kind, e.pts[i].map(Math.round), 'g', (g * 100).toFixed(1), 'd', d.toFixed(1), 'y', e.y[i - 1].toFixed(2), e.y[i].toFixed(2), 'elev', e.elevated, 'terr', e.terrain, 'bridge', e.bridge); }
if (!process.argv.includes('--nocov')) {
  const B = data.bounds, TS = data.tileSize, man = data.manifest;
  await Promise.all(man.regions.map((k) => data.loadRegion(k)));
  const pip = (rings, x, z) => { let inside = false; for (const r of rings) { for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside; } } return inside; };
  const cl = new Map(); const STEP = 40;
  for (let z = B.minZ + STEP / 2; z < B.maxZ; z += STEP) for (let x = B.minX + STEP / 2; x < B.maxX; x += STEP) {
    const t = data.getTile(Math.floor(x / TS), Math.floor(z / TS)); if (t === undefined) continue;
    const w = data.isWater(x, z), near = data.isWater(x + 3, z) !== w || data.isWater(x - 3, z) !== w || data.isWater(x, z + 3) !== w || data.isWater(x, z - 3) !== w; if (near) continue;
    if ((data.isIsletAt && data.isIsletAt(x, z)) || (data.isSliver && data.isSliver(x, z))) continue;
    const sf = data.surfaceAt(x, z); if (!w && (sf === 'wood' || sf === 'gravel')) continue;
    const cov = !!t && t.areas.some((a) => a.kind === 'land' && pip(a.rings, x, z));
    const bad = (!w && !cov) ? 'landNotCovered' : (w && cov) ? 'waterCovered' : null;
    if (!bad) continue;
    const k = bad + ' ' + Math.round(x / 1000) + ',' + Math.round(z / 1000); const c = cl.get(k) || { n: 0, ex: [x, z], wk: data.waterKindAt ? data.waterKindAt(x, z) : '', sf }; c.n++; cl.set(k, c);
  }
  for (const [k, c] of [...cl.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30)) console.log('COV', k, c.n, 'eg', c.ex, c.wk, c.sf);
}
