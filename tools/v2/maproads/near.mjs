// r3-roads: data-level dump of graph nodes / edges near points (no browser)
//   node tools/v2/maproads/near.mjs "x,z[,r];x,z" [--build <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOT = path.join(GAME, 'public/assets/miami');
const bi = process.argv.indexOf('--build');
globalThis.fetch = async (url) => {
  let f = path.join(
    ROOT,
    String(url)
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/^\/assets\/miami\//, ''),
  );
  if (bi > 0 && f.endsWith('world.json')) f = path.join(process.argv[bi + 1], 'world.json');
  if (bi > 0 && !fs.existsSync(f))
    f = path.join(path.dirname(process.argv[bi + 1]), path.relative(ROOT, f));
  if (!fs.existsSync(f))
    return {
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('404 ' + url);
      },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  const buf = fs.readFileSync(f);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};
const { loadMiamiData } = await import(
  pathToFileURL(path.join(GAME, 'src/world/miami/data.js')).href
);
const data = await loadMiamiData(null);
const G = data.roadGraph,
  E = G.edges,
  N = G.nodes;
const segD = (px, pz, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    L2 = dx * dx + dz * dz;
  let u = L2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - a[0] - dx * u, pz - a[1] - dz * u);
};
const f = (v) => +(+v).toFixed(1);
for (const s of String(process.argv[2]).split(';')) {
  const [x, z, r = 60] = s.split(',').map(Number);
  console.log(`=== ${x},${z} r${r}  build ${data.manifest?.build}`);
  for (const n of N)
    if (n && Math.hypot(n.x - x, n.z - z) < r)
      console.log(
        'N',
        n.id,
        f(n.x),
        f(n.z),
        'y',
        f(n.y || 0),
        'deg',
        (n.edges || []).length,
        'edges',
        (n.edges || []).join(','),
      );
  for (const e of E) {
    if (!e) continue;
    let dm = 1e9;
    for (let i = 0; i < e.pts.length - 1; i++)
      dm = Math.min(dm, segD(x, z, e.pts[i], e.pts[i + 1]));
    if (dm > r) continue;
    console.log(
      'E',
      e.id,
      e.kind,
      JSON.stringify(e.name || e.ref || ''),
      'a',
      e.a,
      'b',
      e.b,
      'w',
      e.width,
      'L',
      f(e.length),
      'd',
      f(dm),
      e.bridge ? 'BRIDGE' : '',
      e.terrain ? 'terr' : '',
      'y',
      e.y ? e.y.map(f).join('/') : '-',
      'p0',
      e.pts[0].map(f).join(','),
      'p1',
      e.pts[e.pts.length - 1].map(f).join(','),
    );
  }
}
process.exit(0);
