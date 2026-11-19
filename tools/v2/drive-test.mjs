#!/usr/bin/env node
// Stage 1 job 3 test: a 5-minute drive across the map along the road graph (camera at driver height, 22 m/s).
// Every 0.5 s: a physics ray down from the road center (gap = no collider within 3 m), road surface vs collider height
// (floating / sunk road), streamer backlog of near tiles within 120 m of the camera (pop-in risk), frame time.
// Screenshots every 20 s -> docs/v2/shots/stage1/drive_<n>.png; report -> docs/v2/reports/stage1-drive.json
//   node tools/v2/drive-test.mjs [--secs 300] [--speed 22] [--from x,z]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SECS = +(o.secs || 300),
  SPEED = +(o.speed || 22);
fs.mkdirSync('docs/v2/shots/stage1', { recursive: true });
fs.mkdirSync('docs/v2/reports', { recursive: true });
const rep = {
  secs: SECS,
  speed: SPEED,
  samples: 0,
  gaps: [],
  floating: [],
  popRisk: [],
  slowFrames: 0,
  frameMsAvg: 0,
  route: [],
};
await withBrowser({ width: 1920, height: 1080, maxSeconds: SECS + 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 480);
  await startGame(b);
  // build the route in the page: from the start node keep going, preferring the straightest continuation on big roads,
  // never reusing an edge, until the route is long enough for the whole drive
  const from = o.from ? String(o.from).split(',').map(Number) : null;
  const n = await b.eval(`(() => {
    const G = game.city.roadGraph, need = ${SECS * SPEED + 500}; const P = game.player.position;
    const start = ${from ? `{ x: ${from[0]}, z: ${from[1]} }` : 'P'};
    let e = G.nearestEdge(start.x, start.z, {}, 2000).edge, node = e.a, used = new Set(), pts = [], len = 0;
    const rank = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1 };
    for (let guard = 0; guard < 4000 && len < need; guard++) {
      used.add(e.id); const fwd = e.a === node; const ep = fwd ? e.pts : [...e.pts].reverse(); const ey = fwd ? [...e.y] : [...e.y].reverse();
      for (let i = pts.length ? 1 : 0; i < ep.length; i++) { pts.push([ep[i][0], ey[i] || 0, ep[i][1]]); if (pts.length > 1) { const p = pts[pts.length - 2], q = pts[pts.length - 1]; len += Math.hypot(q[0] - p[0], q[2] - p[2]); } }
      node = fwd ? e.b : e.a; const nd = G.nodes[node];
      const a2 = ep[ep.length - 2], a3 = ep[ep.length - 1]; const dx = a3[0] - a2[0], dz = a3[1] - a2[1], dl = Math.hypot(dx, dz) || 1;
      let best = null;
      for (const k of nd.edges) { const f = G.edges[k]; if (used.has(f.id) || (f.oneway && f.a !== node)) continue;
        const fp = f.a === node ? f.pts : [...f.pts].reverse(); const ex = fp[1][0] - fp[0][0], ez = fp[1][1] - fp[0][1], el = Math.hypot(ex, ez) || 1;
        const straight = (dx * ex + dz * ez) / (dl * el); const sc = straight * 2 + (rank[f.kind] || 0) * 0.35 + Math.random() * 0.6;
        if (!best || sc > best[0]) best = [sc, f]; }
      if (!best) { const k = nd.edges.find((k) => !used.has(G.edges[k].id)); if (k === undefined) break; best = [0, G.edges[k]]; }
      e = best[1];
    }
    window.__route = pts; window.__routeLen = len; return pts.length; })()`);
  rep.routePoints = n;
  rep.routeLen = await b.eval('Math.round(window.__routeLen)');
  // drive: the camera follows the route by time; samples run from the page clock
  await b.eval(`(() => { const R = window.__route, cum = [0]; for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][2] - R[i - 1][2]));
    window.__drive = { t0: performance.now(), cum, R, samples: [], last: performance.now(), ft: [] };
    const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); const p = R[i - 1], q = R[i]; return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]; };
    window.__driveAt = at;
    game.cameraOverride = (dt, cam) => { const D = window.__drive, s = (performance.now() - D.t0) / 1000 * ${SPEED}; const p = at(s), q = at(s + 30);
      cam.position.set(p[0], p[1] + 1.5, p[2]); cam.lookAt(q[0], q[1] + 1.2, q[2]); return true; };
    return 1; })()`);
  const t0 = Date.now();
  let shot = 0,
    lastShot = 0;
  while ((Date.now() - t0) / 1000 < SECS) {
    await b.sleep(500);
    const smp =
      await b.eval(`(() => { const D = window.__drive, c = game.camera.position, now = performance.now();
      const R = game.RAPIER || window.RAPIER; let hitY = null; try { const ray = new R.Ray({ x: c.x, y: c.y + 1, z: c.z }, { x: 0, y: -1, z: 0 }); const h = game.world.castRay(ray, 6, true); if (h) hitY = c.y + 1 - (h.timeOfImpact ?? h.toi); } catch (e) {}
      const roadY = c.y - 1.5; const st = game.city.streamer; let backlog = 0;
      if (st) for (const t of st.tiles.values()) if (!t.near && Math.hypot(t.cx - c.x, t.cz - c.z) < 120) backlog++;
      return JSON.stringify({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), roadY: +roadY.toFixed(2), hitY: hitY === null ? null : +hitY.toFixed(2), backlog, fps: game.perf?.fps ? +game.perf.fps.toFixed(1) : null, water: !!game.city.isWater?.(c.x, c.z) }); })()`);
    const s = JSON.parse(smp);
    rep.samples++;
    rep.route.push([s.x, s.z]);
    if (s.hitY === null && !s.water) rep.gaps.push(s);
    else if (s.hitY !== null && Math.abs(s.hitY - s.roadY) > 0.45) rep.floating.push(s);
    if (s.backlog > 0) rep.popRisk.push(s);
    if (s.fps && s.fps < 55) rep.slowFrames++;
    rep.frameMsAvg += s.fps ? 1000 / s.fps : 0;
    if ((Date.now() - lastShot) / 1000 >= 20) {
      lastShot = Date.now();
      await b.screenshot(`docs/v2/shots/stage1/drive_${String(shot++).padStart(2, '0')}.png`);
    }
  }
  rep.frameMsAvg = +(rep.frameMsAvg / Math.max(1, rep.samples)).toFixed(2);
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 20);
});
rep.route = rep.route.filter((_, i) => i % 4 === 0);
fs.writeFileSync('docs/v2/reports/stage1-drive.json', JSON.stringify(rep, null, 1));
console.log(
  JSON.stringify({
    samples: rep.samples,
    routeLen: rep.routeLen,
    gaps: rep.gaps.length,
    floating: rep.floating.length,
    popRisk: rep.popRisk.length,
    slowFrames: rep.slowFrames,
    frameMsAvg: rep.frameMsAvg,
    firstGaps: rep.gaps.slice(0, 5),
    firstFloat: rep.floating.slice(0, 5),
  }),
);
