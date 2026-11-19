#!/usr/bin/env node
// Pedestrian audit: boots the game (muted), stands at a downtown junction and a Brickell street, lets the crowd fill,
// then samples every person for 30 s and counts violations:
//   road      walking on a carriageway while not crossing
//   midblock  crossing farther than a corner from the junction
//   building  standing on a building footprint (map raster) or inside a static collider at waist height
//   standRoad standing still (group, pause, wait) on a carriageway
// It also writes a top-down shot with the sampled paths drawn over it (green = sidewalk, yellow = crossing,
// red = violation) and reports the ped logic cost (near peds + far crowd, ms per frame).
//   node tools/v2/npcs/ped-audit.mjs --hour 12 --tag before [--q "&pednav=old"] [--only downtown]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    opt[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
}
const HOUR = Number(opt.hour ?? 12);
const TAG = opt.tag || 'run';
const Q = opt.q ?? '';
const SETTLE = Number(opt.settle ?? 22);
const SECONDS = Number(opt.seconds ?? 30);
const OUT = 'docs/v2/shots/people/pedaudit';
fs.mkdirSync(OUT, { recursive: true });

const SITES = [
  { name: 'downtown', x: 407, z: -110, signal: true },
  { name: 'brickell', x: 0, z: 1760, signal: false },
].filter((s) => !opt.only || s.name === opt.only);

// in-page: snap a site to a real junction / street point
const snapJs = (s) => `(() => {
  const RG = game.city.roadGraph;
  let best = null, bd = 1e9;
  for (const n of RG.nodes) {
    const d = Math.hypot(n.x - ${s.x}, n.z - ${s.z});
    if (d > 260 || (n.edges?.length || 0) < 3) continue;
    const sig = n.control === 'signal' || (n.edges || []).some((id) => {
      const e = RG.edges[id] || RG.edges.find?.((q) => q.id === id);
      return e && (e.controlA === 'signal' || e.controlB === 'signal');
    });
    const score = d - (${s.signal} && sig ? 120 : 0);
    if (score < bd) { bd = score; best = n; }
  }
  return JSON.stringify(best ? { x: best.x, z: best.z } : { x: ${s.x}, z: ${s.z} });
})()`;

// in-page sampler: installs window.__pa with start(cx, cz) / stop()
const SAMPLER = `(() => {
  const C = game.city, RG = C.roadGraph, R = game.RAPIER, W = game.world;
  const S = { on: false, cx: 0, cz: 0, n: 0, walk: 0, road: 0, midblock: 0, building: 0, standRoad: 0, cross: 0, nearMiss: 0,
    bad: [], trace: [], who: new Map(), ms: [], crowdMs: 0, crowdN: 0 };
  const flags = R.QueryFilterFlags.EXCLUDE_DYNAMIC | (R.QueryFilterFlags.EXCLUDE_KINEMATIC || 0) |
    R.QueryFilterFlags.EXCLUDE_SENSORS;
  // inside a building mesh: rays out in four directions all leave through a wall (hit normal along the ray)
  const inCollider = (x, y, z) => {
    let out = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      try {
        const h = W.castRayAndGetNormal(new R.Ray({ x, y, z }, { x: dx, y: 0, z: dz }), 40, false, flags);
        if (h && h.normal.x * dx + h.normal.z * dz > 0.2) out++;
      } catch (e) { /* */ }
    }
    return out >= 3;
  };
  // on a map building footprint (the data tile rings; ground-level parts only)
  const D = game.miamiData, TS = D?.tileSize || 200;
  const inRing = (x, z) => {
    const t = D?.getTile?.(Math.floor(x / TS), Math.floor(z / TS));
    for (const b of t?.buildings || []) {
      const r = b.rings?.[0];
      if (!r || (b.minH || 0) > 2.5) continue;
      let c = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        if (r[i][1] > z !== r[j][1] > z && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
      if (c) return true;
    }
    return false;
  };
  const nodeOf = (id) => RG.nodes[id]?.id === id ? RG.nodes[id] : RG.nodes.find((q) => q.id === id);
  const cornerDist = (x, z) => {
    const r = RG.nearestEdge(x, z, {}, 30);
    if (!r?.edge) return 0;
    const a = nodeOf(r.edge.a), b = nodeOf(r.edge.b);
    const d = Math.min(a ? Math.hypot(a.x - x, a.z - z) : 1e9, b ? Math.hypot(b.x - x, b.z - z) : 1e9);
    return d - (r.edge.width || 8) / 2;
  };
  const one = (id, x, y, z, nav, moving, tier) => {
    if (Math.hypot(x - S.cx, z - S.cz) > 90) return;
    S.n++;
    const onRoad = !!game.placement?.onRoad?.(x, z, 0);
    const crossing = !!nav?.cross;
    let k = 'ok';
    if (moving) S.walk++;
    if (onRoad && crossing) {
      S.cross++;
      k = 'cross';
      if (cornerDist(x, z) > 14) { S.midblock++; k = 'mid'; }
      // a moving car within 5 m of somebody on the crossing = a near miss
      for (const v of game.vehicles?.list || []) {
        const p = v.mesh?.position;
        if (p && !v.parked && Math.abs(v.speedKmh || 0) > 8 && Math.hypot(p.x - x, p.z - z) < 5) { S.nearMiss++; break; }
      }
    } else if (onRoad) {
      if (moving) { S.road++; k = 'road'; } else { S.standRoad++; k = 'standRoad'; }
    }
    if (inRing(x, z) || C.surfaceAt?.(x, z) === 'building' || inCollider(x, y + 1.0, z)) { S.building++; k = 'bld'; }
    if (k !== 'ok' && k !== 'cross') {
      S.who.set(id, k);
      if (S.bad.length < 30 && Math.random() < 0.2)
        S.bad.push({ k, tier, x: Math.round(x), z: Math.round(z), edge: nav?.edge?.kind, w: nav?.edge?.width,
          off: nav?.offNow && +nav.offNow.toFixed(1), path: !!nav?.path, mode: tier });
    }
    if (Math.hypot(x - S.cx, z - S.cz) < 75) S.trace.push([+x.toFixed(1), +z.toFixed(1), y, k]);
  };
  function sample() {
    for (const w of game.people?.crowd?.list || []) {
      if (w.leaving || w.lounger || w.gone) continue;
      const nav = w.buddy ? w.buddy.nav : w.nav;
      one('c' + w.i, w.pos.x, w.gy || 0, w.pos.z, nav, !w.still && (w.v ?? 1) > 0.15, 'crowd');
    }
    for (const p of game.peds?.list || []) {
      if (!p.active || p.dead || p.venue) continue;
      const nav = p.follow ? p.follow.nav : p.nav;
      one('p' + p.id, p.pos.x, p.pos.y || 0, p.pos.z, nav, p.state === 'walk' && !(p.waitT > 0), 'near');
    }
  }
  let timer = 0, msT = 0;
  window.__pa = {
    start(cx, cz) {
      Object.assign(S, { on: true, cx, cz, n: 0, walk: 0, road: 0, midblock: 0, building: 0, standRoad: 0, cross: 0, nearMiss: 0,
        bad: [], trace: [], ms: [] });
      S.who = new Map();
      timer = setInterval(sample, 500);
      msT = setInterval(() => {
        const a = game.perf?.sysAvg || {};
        S.ms.push({ peds: a.peds || 0, people: game.people?.ms || 0 });
      }, 1000);
    },
    stop() {
      clearInterval(timer);
      clearInterval(msT);
      S.on = false;
      const avg = (k) => S.ms.length ? +(S.ms.reduce((s, m) => s + m[k], 0) / S.ms.length).toFixed(3) : 0;
      const counts = {};
      for (const v of S.who.values()) counts[v] = (counts[v] || 0) + 1;
      return { samples: S.n, walking: S.walk, road: S.road, midblock: S.midblock, building: S.building,
        standRoad: S.standRoad, crossing: S.cross, nearMiss: S.nearMiss, waits: game.people?.lifeStats?.signalWaits, uniqueViolators: counts,
        crowd: game.people?.crowd?.count, near: game.peds?.count,
        msPeds: avg('peds'), msPeople: avg('people'), fps: game.perf?.fps, bad: S.bad, trace: S.trace };
    },
  };
  return 1;
})()`;

// in-page overlay: draws the trace over a top-down view
const drawJs = (trace) => `(() => {
  const T = ${JSON.stringify(trace)};
  const cam = game.camera;
  cam.updateMatrixWorld();
  const P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements;
  const mul = (m, x, y, z, w) => [m[0]*x+m[4]*y+m[8]*z+m[12]*w, m[1]*x+m[5]*y+m[9]*z+m[13]*w,
    m[2]*x+m[6]*y+m[10]*z+m[14]*w, m[3]*x+m[7]*y+m[11]*z+m[15]*w];
  let cv = document.getElementById('__pacv');
  if (!cv) { cv = document.createElement('canvas'); cv.id = '__pacv'; document.body.appendChild(cv); }
  cv.width = innerWidth; cv.height = innerHeight;
  Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, zIndex: 99999, pointerEvents: 'none' });
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const col = { ok: '#3cff6a', cross: '#ffd23c', mid: '#ff8a00', road: '#ff2a2a', standRoad: '#ff2aff', bld: '#2a8bff' };
  for (const [x, z, y, k] of T) {
    const v = mul(V, x, y + 0.2, z, 1), c = mul(P, v[0], v[1], v[2], v[3]);
    if (c[3] <= 0) continue;
    const sx = (c[0] / c[3] * 0.5 + 0.5) * cv.width, sy = (0.5 - c[1] / c[3] * 0.5) * cv.height;
    g.fillStyle = col[k] || '#fff';
    g.beginPath(); g.arc(sx, sy, k === 'ok' ? 1.6 : 2.6, 0, 6.3); g.fill();
  }
  return 1;
})()`;

// self time (ms over the run) of the people / nav code, by function
function profileTop(profile) {
  const self = new Map();
  const dt = profile.timeDeltas || [];
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const hits = new Map();
  for (let i = 0; i < profile.samples.length; i++)
    hits.set(profile.samples[i], (hits.get(profile.samples[i]) || 0) + (dt[i] || 0) / 1000);
  for (const [id, ms] of hits) {
    const cf = byId.get(id)?.callFrame;
    if (!cf || !/src\/(npc|nav)\//.test(cf.url)) continue;
    const k =
      cf.url.replace(/.*src\//, '').replace(/\?.*/, '') +
      ':' +
      (cf.functionName || '(anon)') +
      ':' +
      cf.lineNumber;
    self.set(k, (self.get(k) || 0) + ms);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return {
    totalMs: Math.round(total),
    top: [...self]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([k, v]) => k + ' ' + v.toFixed(0)),
  };
}

const results = { hour: HOUR, tag: TAG, q: Q, sites: {} };
await withBrowser({ width: 1280, height: 800, maxSeconds: 290 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + Q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  if (!(await startGame(b, 40))) console.log('WARN: title did not close');
  await b.eval(
    '(async () => { try { await game.story?.skipIntro?.(); } catch (e) { /* */ } return 1; })()',
  );
  await b.sleep(1500);
  await b.eval(SAMPLER);
  for (const s of SITES) {
    const at = JSON.parse(await b.eval(snapJs(s)));
    await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none';
      game.cameraOverride = null; game.timeExternal = true; game.timeOfDay = ${HOUR};
      game.teleport(${at.x + 9}, undefined, ${at.z + 9}, 0); return 1; })()`);
    await b.sleep(SETTLE * 1000);
    await b.eval(`__pa.start(${at.x}, ${at.z})`);
    if (opt.prof) {
      await b.send('Profiler.enable');
      await b.send('Profiler.setSamplingInterval', { interval: 200 });
      await b.send('Profiler.start');
    }
    // street-level shot halfway through
    await b.sleep((SECONDS / 2) * 1000);
    await b.screenshot(`${OUT}/${TAG}_${s.name}_h${HOUR}_street.jpg`);
    await b.sleep((SECONDS / 2) * 1000);
    const r = JSON.parse(await b.eval('JSON.stringify(__pa.stop())'));
    if (opt.prof) r.prof = profileTop((await b.send('Profiler.stop')).profile);
    await b.eval(`(() => { const gy = game.city.groundHeightAt?.(${at.x}, ${at.z}, 0) ?? 0;
      game.cameraOverride = (dt, cam) => { cam.position.set(${at.x}, gy + 95, ${at.z} + 0.01);
        cam.lookAt(${at.x}, gy, ${at.z}); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; };
      return 1; })()`);
    await b.sleep(1500);
    await b.eval(drawJs(r.trace));
    await b.screenshot(`${OUT}/${TAG}_${s.name}_h${HOUR}_trace.jpg`);
    await b.eval(`document.getElementById('__pacv')?.remove(); game.cameraOverride = null; 1`);
    delete r.trace;
    results.sites[s.name] = { at, ...r };
    console.log(s.name, JSON.stringify({ ...r, bad: r.bad.slice(0, 8) }));
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 8).join('\n'));
});
fs.writeFileSync(
  `docs/v2/reports/ped-audit-${TAG}-h${HOUR}.json`,
  JSON.stringify(results, null, 1),
);
