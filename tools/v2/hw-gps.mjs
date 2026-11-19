// Highways track: headless GPS distances across Biscayne Bay (mainland -> Miami Beach), through the game's own loader + router.
// node tools/v2/hw-gps.mjs [--out docs/v2/reports/highways-gps.json]
import fs from 'node:fs';
import path from 'node:path';
// --build bYYYYMMDD-hhmmss: route on a staged (unpublished) build instead of the live world.json
const bi = process.argv.indexOf('--build');
if (bi > 0) {
  const man = path.resolve('public/assets/miami', process.argv[bi + 1], 'manifest.json');
  const rf = fs.readFileSync;
  fs.readFileSync = function (f, ...r) {
    if (typeof f === 'string' && f.endsWith(path.join('assets', 'miami', 'world.json')))
      return rf.call(fs, man, ...r);
    return rf.call(fs, f, ...r);
  };
}
const { loadWorld } = await import('../../src/nav/tests/loadData.mjs');
import { Router } from '../../src/nav/engine.js';
const { data, G } = await loadWorld();
const R = new Router(G);
// world frame: x = (lon + 80.165) * 100190, z = -(lat - 25.779) * 110574
const P = (lat, lon) => ({
  x: (lon + 80.165) * Math.cos((25.779 * Math.PI) / 180) * 111320,
  z: -(lat - 25.779) * 110574,
});
const pairs = [
  [
    'mainland NE 36th St @ Biscayne Blvd -> Miami Beach 41st St @ Alton Rd',
    P(25.8093, -80.1898),
    P(25.813, -80.14),
  ],
  [
    'mainland NE 36th St @ N Miami Ave -> Miami Beach 41st St @ Collins Ave',
    P(25.8093, -80.1955),
    P(25.813, -80.1222),
  ],
  [
    'mainland NE 79th St @ Biscayne Blvd -> North Beach 71st St',
    P(25.849, -80.1855),
    P(25.856, -80.133),
  ],
  [
    'mainland NE 123rd St -> Bay Harbor / Broad Causeway east end',
    P(25.891, -80.17),
    P(25.888, -80.133),
  ],
  ['Brickell -> South Beach (MacArthur)', { x: -2932, z: 1753 }, { x: 2772, z: -555 }],
  ['South Beach -> Brickell (MacArthur)', { x: 2772, z: -555 }, { x: -2932, z: 1753 }],
  [
    'Edgewater -> Belle Isle / Miami Beach (Venetian)',
    { x: -2277, z: -1300 },
    { x: 2200, z: -1300 },
  ],
  ['Brickell -> Key Biscayne (Rickenbacker)', P(25.762, -80.195), P(25.695, -80.162)],
];
const out = [];
for (const [name, a, b] of pairs) {
  const r = R.route(a, b, {});
  let len = null,
    names = [];
  if (r) {
    const ev = R.evaluate(r.arcs, r.startS, r.endS, undefined);
    len = ev.length;
    const seen = new Set();
    for (const arc of r.arcs) {
      const e = data.roadGraph.edges[G.aEdge[arc]];
      const n = e && (e.name || e.ref);
      if (n && !seen.has(n)) {
        seen.add(n);
        names.push(n);
      }
    }
  }
  const crow = Math.hypot(a.x - b.x, a.z - b.z);
  const rec = {
    name,
    from: [a.x | 0, a.z | 0],
    to: [b.x | 0, b.z | 0],
    crowKm: +(crow / 1000).toFixed(2),
    routeKm: len == null ? null : +(len / 1000).toFixed(2),
    minutes: r ? +(r.cost / 60).toFixed(1) : null,
    snap: r ? [Math.round(r.snapFrom.dist), Math.round(r.snapTo.dist)] : null,
    via: names.slice(0, 14),
  };
  out.push(rec);
  console.log(JSON.stringify(rec));
}
const i = process.argv.indexOf('--out');
if (i > 0)
  fs.writeFileSync(
    process.argv[i + 1],
    JSON.stringify({ build: data.build, at: new Date().toISOString(), routes: out }, null, 1),
  );
