// maproads track: in-game collider probe along GPS routes from the Miami mainland to fictional towns (V2 test browser only).
//   node tools/v2/maproads/drive-probe.mjs [--to "Port Calabash,Punta Marisol"] [--shot name@x,z,heading]
// For each target it computes the GPS route headless (game loader + router), then in the game teleports along it every
// ~600 m, waits for the colliders, and casts rays down every 6 m of the route. Fails on: no fixed collider within 1.5 m of the
// height the game itself reports (city.groundHeightAt, deck-aware) (hole / gap / wrong deck), or a collider step of more than 0.6 m between consecutive samples 6 m apart (wall / step).
// Writes docs/v2/reports/maproads-drive-probe.json; optional drive-level shot to docs/v2/shots/maproads/<name>.png.
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY } from '../browser.mjs';
import { loadWorld } from '../../../src/nav/tests/loadData.mjs';
import { Router } from '../../../src/nav/engine.js';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const targets = String(o.to || 'Port Calabash').split(',');
const { data, G } = await loadWorld();
const R = new Router(G);
const origin = { x: -2500, z: 550 };
const routes = [];
for (const nm of targets) {
  const p = (data.places || []).find((q) => q.name === nm);
  if (!p) { console.log('no place', nm); continue; }
  const r = R.route(origin, { x: p.x, z: p.z }, {});
  if (!r) { routes.push({ name: nm, ok: false, why: 'no route' }); continue; }
  // sample the route every 6 m outside the real rectangle (OSM part is covered by other audits)
  const pts = [];
  let prevEnd = null;
  for (const arc of r.arcs) {
    const e = data.roadGraph.edges[G.aEdge[arc]];
    const fwd = prevEnd == null ? true : (e.a === prevEnd);
    const P = e.pts.map((q, i) => [q.x ?? q[0], q.z ?? q[1], (e.elevated || e.terrain) ? e.y[i] : null]);
    const seq = fwd ? P : P.slice().reverse();
    prevEnd = fwd ? e.b : e.a;
    for (let i = 1; i < seq.length; i++) {
      const [x0, z0, y0] = seq[i - 1], [x1, z1, y1] = seq[i];
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 6));
      for (let k = 0; k < n; k++) {
        const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (data.inRealMiami && data.inRealMiami(x, z)) continue;
        pts.push([+x.toFixed(1), +z.toFixed(1), y0 == null ? null : +(y0 + (y1 - y0) * t).toFixed(2), e.name || e.ref || '']);
      }
    }
  }
  routes.push({ name: nm, ok: true, km: +(R.evaluate(r.arcs, r.startS, r.endS).length / 1000).toFixed(2), pts });
}
// --interchanges: instead of GPS routes, every synthetic motorway ramp plus the motorway lanes within 450 m of a ramp end,
// sampled every 5 m along each edge; a lip is a collider change between neighbours that the road's own height does not
// explain by more than 0.15 m, or a collider more than 0.15 m off the game's height
if (o.interchanges) {
  routes.length = 0;
  const E = data.roadGraph.edges, ends = [];
  for (const e of E) if (e.kind === 'motorway_link' && e.synthetic) for (const q of [e.pts[0], e.pts[e.pts.length - 1]]) ends.push([q.x ?? q[0], q.z ?? q[1]]);
  const nearEnd = (x, z) => ends.some(([a2, b2]) => Math.abs(a2 - x) < 450 && Math.abs(b2 - z) < 450);
  const pts = [];
  for (const e of E) {
    if (!e.synthetic || !(e.kind === 'motorway_link' || e.kind === 'motorway')) continue;
    const P = e.pts.map((q, i) => [q.x ?? q[0], q.z ?? q[1], (e.elevated || e.terrain) ? e.y[i] : null]);
    let seq = [];
    for (let i = 1; i < P.length; i++) {
      const [x0, z0, y0] = P[i - 1], [x1, z1, y1] = P[i];
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 5));
      for (let k = 0; k < n; k++) { const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if ((data.inRealMiami && data.inRealMiami(x, z)) || (e.kind === 'motorway' && !nearEnd(x, z))) { if (seq.length) { pts.push(seq); seq = []; } continue; }
        seq.push([+x.toFixed(1), +z.toFixed(1), y0 == null ? null : +(y0 + (y1 - y0) * t).toFixed(2), (e.name || e.kind) + '#' + e.id]); }
    }
    if (seq.length) pts.push(seq);
  }
  // order the runs spatially so each teleport covers neighbours
  pts.sort((a2, b2) => (Math.floor(a2[0][0] / 800) - Math.floor(b2[0][0] / 800)) || (a2[0][1] - b2[0][1]));
  routes.push({ name: 'all interchanges', ok: true, km: 0, runs: pts, pts: pts.flat() });
}
const out = { at: new Date().toISOString(), build: data.build, routes: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 480);
  await b.waitFor("typeof game.teleport === 'function'", 300);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11; return true; })()`);
  for (const rt of routes) {
    if (!rt.ok) { out.routes.push(rt); continue; }
    const res = { name: rt.name, km: rt.km, samples: 0, holes: [], steps: [] };
    let prevY = null, prevRef = 0, prevRoad = null, prevP = [0, 0];
    for (let c = 0; c < rt.pts.length; c += 50) {
      const chunk = rt.pts.slice(c, c + 50);
      const [cx, cz] = chunk[Math.floor(chunk.length / 2)];
      await b.waitFor("typeof game.teleport === 'function'", 300);
      await b.eval(`game.teleport(${cx}, null, ${cz}, 0) || true`);
      await b.waitFor(`(() => { const s = game.city.streamer; return !s || !s.readyAround || s.readyAround(${cx}, ${cz}, 420); })()`, 90).catch(() => {});
      await b.sleep(400);
      const hs = await b.eval(`(() => { const R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, FIX = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
        const c = game.city; const pts = ${JSON.stringify(chunk)};
        return pts.map(([x, z, y]) => { const g = c.groundHeightAt ? c.groundHeightAt(x, z, y ?? undefined) : null; const ref = (Number.isFinite(g) ? g : (y ?? 0)) || 0; const top = ref + 1.8;
          const h = W.castRay(new R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 40, true, FIX); return [ref, h ? +(top - h.timeOfImpact).toFixed(2) : null]; }); })()`);
      // a miss to the sea plane (-8) right after a teleport is usually a tile whose colliders are not in yet: wait and sample again
      if (hs.some(([ref, y]) => y == null || y < ref - 1.5)) {
        await b.sleep(4000);
        const again = await b.eval(`(() => { const R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, FIX = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS; const c = game.city; const pts = ${JSON.stringify(chunk)};
          return pts.map(([x, z, y]) => { const g = c.groundHeightAt ? c.groundHeightAt(x, z, y ?? undefined) : null; const ref = (Number.isFinite(g) ? g : (y ?? 0)) || 0; const top = ref + 1.8;
            const h = W.castRay(new R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 40, true, FIX); return [ref, h ? +(top - h.timeOfImpact).toFixed(2) : null]; }); })()`);
        for (let k = 0; k < hs.length; k++) hs[k] = again[k];
        // still missing: go to that very spot (its tile may be outside the teleport's streaming radius) and sample it alone
        for (let k = 0, n = 0; k < hs.length && n < 60; k++) { // every miss (was 12: the rest of a 50-point chunk beyond the 250 m collider radius stayed -8)
          const [ref, y] = hs[k]; if (!(y == null || y < ref - 1.5)) continue; n++;
          const [px, pz, py] = chunk[k];
          await b.eval(`game.teleport(${px}, null, ${pz}, 0) || true`);
          await b.waitFor(`(() => { const s = game.city.streamer; return !s || !s.readyAround || s.readyAround(${px}, ${pz}, 120); })()`, 60).catch(() => {});
          await b.sleep(1500);
          hs[k] = await b.eval(`(() => { const R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, FIX = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS; const c = game.city; const x = ${px}, z = ${pz}, y = ${py ?? 'null'};
            const g = c.groundHeightAt ? c.groundHeightAt(x, z, y ?? undefined) : null; const ref = (Number.isFinite(g) ? g : (y ?? 0)) || 0; const top = ref + 1.8;
            const h = W.castRay(new R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 40, true, FIX); return [ref, h ? +(top - h.timeOfImpact).toFixed(2) : null]; })()`);
        }
      }
      hs.forEach(([ref, y], i) => {
        const p = chunk[i]; res.samples++;
        if (y == null || Math.abs(y - ref) > (o.interchanges ? 0.15 : 1.5)) res.holes.push({ at: [p[0], p[1]], road: p[3], expect: +ref.toFixed(2), got: y });
        const lim = o.interchanges ? 0.15 : 0.6;
        if (y != null && prevY != null && prevRoad === p[3] && Math.hypot(p[0] - prevP[0], p[1] - prevP[1]) < 8 && Math.abs((y - prevY) - (ref - prevRef)) > lim) res.steps.push({ at: [p[0], p[1]], road: p[3], dy: +(y - prevY).toFixed(2), expectDy: +(ref - prevRef).toFixed(2) });
        prevY = y; prevRef = ref; prevRoad = p[3]; prevP = p;
      });
    }
    res.ok = res.holes.length === 0 && res.steps.length === 0;
    res.nHoles = res.holes.length; res.nSteps = res.steps.length; res.holes = res.holes.slice(0, 40); res.steps = res.steps.slice(0, 40);
    console.log(rt.name, rt.km, 'km', res.samples, 'samples', 'holes', res.holes.length, 'steps', res.steps.length, JSON.stringify(res.holes.slice(0, 3)), JSON.stringify(res.steps.slice(0, 3)));
    out.routes.push(res);
  }
  if (o.shot) {
    for (const s of String(o.shot).split(';')) {
      const [nm, rest] = s.split('@'); const [x, z, hd] = rest.split(',').map(Number);
      await b.eval(`game.teleport(${x}, null, ${z}, ${hd || 0}) || true`);
      await b.waitFor(`(() => { const s = game.city.streamer; return !s || s.pending() === 0; })()`, 120).catch(() => {});
      await b.sleep(4000);
      const f = path.resolve('docs/v2/shots/maproads', nm + '.png'); fs.mkdirSync(path.dirname(f), { recursive: true });
      console.log('SHOT', await b.screenshot(f));
    }
  }
  if (b.errors.length) out.consoleErrors = [...new Set(b.errors)].slice(0, 12);
});
fs.writeFileSync(path.resolve('docs/v2/reports/maproads-drive-probe.json'), JSON.stringify(out, null, 1));
