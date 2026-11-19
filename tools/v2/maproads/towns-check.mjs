// maproads track: headless reachability check for every fictional town and island (ref_40), through the game's own
// loader (src/nav/tests/loadData.mjs) and GPS router (src/nav/engine.js).
//   node tools/v2/maproads/towns-check.mjs [--out docs/v2/reports/maproads-towns.json]
// For every town / key / island place outside real Miami it routes from downtown Miami to the place center and fails when:
//   - there is no route, or the route ends more than 250 m from the place center (island not linked),
//   - consecutive route edges disagree on the road height at their shared node by more than 0.6 m (a step or a gap
//     between a bridge deck and its approach),
//   - an elevated deck changes height by more than 2.5 m between two points less than 30 m apart (a wall),
//   - the route is more than 3x the straight-line distance (a detour around a missing link).
// Also prints the North Shore -> Port Calabash GPS distance (24.59 km before this track, ref_63).
import fs from 'node:fs';
import { loadWorld } from '../../../src/nav/tests/loadData.mjs';
import { Router } from '../../../src/nav/engine.js';

const { data, G } = await loadWorld();
const R = new Router(G);
const edges = data.roadGraph.edges;
const H = (x, z) => (data.terrainHeightAt ? data.terrainHeightAt(x, z) : 0);
function endHeight(e, atA) {
  const i = atA ? 0 : e.pts.length - 1;
  const p = e.pts[i];
  const x = p.x ?? p[0],
    z = p.z ?? p[1];
  if (e.elevated || e.terrain) return e.y[i];
  return H(x, z);
}
function check(a, b, maxRatio = 3) {
  const r = R.route(a, b, {});
  const crow = Math.hypot(a.x - b.x, a.z - b.z);
  if (!r) return { ok: false, why: 'no route', crowKm: +(crow / 1000).toFixed(2) };
  const ev = R.evaluate(r.arcs, r.startS, r.endS, undefined);
  const problems = [];
  let prev = null;
  const names = [];
  for (const arc of r.arcs) {
    const e = edges[G.aEdge[arc]];
    if (!e) continue;
    const n = e.name || e.ref;
    if (n && names[names.length - 1] !== n) names.push(n);
    // walking direction: which end do we enter?
    if (prev) {
      const shared = prev.b === e.a || prev.b === e.b ? prev.b : prev.a;
      const hp = endHeight(prev, prev.a === shared),
        he = endHeight(e, e.a === shared);
      if (Math.abs(hp - he) > 0.6)
        problems.push({
          kind: 'step',
          at: e.pts[e.a === shared ? 0 : e.pts.length - 1],
          dy: +(he - hp).toFixed(2),
          from: prev.name || prev.ref,
          to: e.name || e.ref,
        });
    }
    if (e.elevated) {
      for (let i = 1; i < e.pts.length; i++) {
        const p0 = e.pts[i - 1],
          p1 = e.pts[i];
        const d = Math.hypot((p1.x ?? p1[0]) - (p0.x ?? p0[0]), (p1.z ?? p1[1]) - (p0.z ?? p0[1]));
        if (d < 30 && Math.abs(e.y[i] - e.y[i - 1]) > 2.5) {
          problems.push({
            kind: 'wall',
            at: p1,
            dy: +(e.y[i] - e.y[i - 1]).toFixed(2),
            edge: e.name,
          });
          break;
        }
      }
    }
    prev = e;
  }
  const snapTo = Math.round(r.snapTo.dist),
    snapFrom = Math.round(r.snapFrom.dist);
  if (snapTo > Math.max(250, (b.kind === 'airport' ? 1.8 : 0.75) * (b.r || 0)))
    problems.push({ kind: 'not linked', snapTo });
  if (ev.length > maxRatio * crow + 2000)
    problems.push({ kind: 'detour', ratio: +(ev.length / crow).toFixed(2) });
  return {
    ok: problems.length === 0,
    routeKm: +(ev.length / 1000).toFixed(2),
    crowKm: +(crow / 1000).toFixed(2),
    snap: [snapFrom, snapTo],
    via: names.slice(0, 12),
    problems: problems.slice(0, 6),
  };
}

const origin = { x: -2500, z: 550 }; // downtown Miami (Biscayne Blvd area), mainland, inside the real rectangle
const rr = data.realRect;
const places = (data.places || []).filter(
  (p) =>
    ['town', 'key', 'island', 'district', 'airport'].includes(p.kind) &&
    !p.real &&
    !(p.x > rr.minX && p.x < rr.maxX && p.z > rr.minZ && p.z < rr.maxZ),
);
const out = [];
let fails = 0;
for (const p of places) {
  // aim at the nearest road to the place center (a town center can sit on a plaza block)
  const res = check(origin, { x: p.x, z: p.z, r: p.r, kind: p.kind });
  res.name = p.name;
  res.kind = p.kind;
  res.at = [Math.round(p.x), Math.round(p.z)];
  if (!res.ok) fails++;
  out.push(res);
  console.log(
    (res.ok ? 'ok   ' : 'FAIL ') +
      p.name.padEnd(26) +
      ' ' +
      (res.routeKm ?? '-') +
      ' km' +
      (res.ok ? '' : '  ' + JSON.stringify(res.problems || res.why)),
  );
}
const ns = (data.places || []).find((p) => p.name === 'North Shore');
const cal = (data.places || []).find((p) => p.name === 'Port Calabash');
let gps = null;
if (ns && cal) {
  gps = check({ x: ns.x, z: ns.z }, { x: cal.x, z: cal.z }, 10);
  console.log(
    'North Shore -> Port Calabash',
    gps.routeKm,
    'km (crow',
    gps.crowKm,
    ')',
    gps.via.join(' > '),
  );
}
// ref_63's pin sat at the mainland end of the Calabash causeway: same pair for a like-for-like before / after
let gpsPin = null;
{
  let best = null;
  for (const e of edges) {
    if ((e.name || '') !== 'Calabash Causeway') continue;
    for (const q of e.pts) {
      const x = q.x ?? q[0],
        z = q.z ?? q[1];
      if (!best || x > best.x) best = { x, z };
    }
  }
  if (ns && best) {
    gpsPin = check({ x: ns.x, z: ns.z }, best, 10);
    gpsPin.to = [Math.round(best.x), Math.round(best.z)];
    console.log(
      'North Shore -> Calabash causeway (ref_63 pin)',
      gpsPin.routeKm,
      'km (crow',
      gpsPin.crowKm,
      ')',
      gpsPin.via.join(' > '),
    );
  }
}
console.log(
  `${places.length - fails} of ${places.length} places reachable without a step, wall or missing link`,
);
const i = process.argv.indexOf('--out');
if (i > 0)
  fs.writeFileSync(
    process.argv[i + 1],
    JSON.stringify(
      {
        build: data.build,
        at: new Date().toISOString(),
        northShoreToCalabash: gps,
        northShoreToCalabashPin: gpsPin,
        places: out,
      },
      null,
      1,
    ),
  );
process.exitCode = fails ? 1 : 0;
