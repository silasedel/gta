#!/usr/bin/env node
// 60 people on a downtown sidewalk, A/B in ONE session: the user's people (src/npc/people) vs the old archetype crowd
// (src/npc/arch). Same places, same walk, same camera; rounds alternate A B A B; frame time / CPU work / GPU / draw calls
// from tools/v2/s1-perf.page.js. Also writes a screenshot of each case.
//   node tools/v2/npcs/crowd-perf.mjs [--n 60] [--rounds 4] [--secs 3] [--at 407,-110] [--set name] [--tod 15]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const N = +(o.n || 60),
  ROUNDS = +(o.rounds || 4),
  SECS = +(o.secs || 3),
  SET = o.set || 'crowd';
const AT = String(o.at || '407,-110')
  .split(',')
  .map(Number);
const PAGE = fs.readFileSync(new URL('../s1-perf.page.js', import.meta.url), 'utf8');
const med = (x) => {
  const s = x.slice().sort((p, q) => p - q);
  return s[s.length >> 1];
};
fs.mkdirSync('docs/v2/shots/people', { recursive: true });

// in-page harness: a sidewalk path near the player, N walkers on it (either people or archetypes), updated every frame
const HARNESS = `(() => {
  if (window.__cp) return 'already';
  const THREE = game.THREE || window.THREE;
  const nav = game.peds._nav; const pp = game.player.position;
  // the nearest walkable edge's sidewalk, sampled every 2 m over ~120 m
  const RG = game.city.roadGraph; const r = RG.nearestEdge(pp.x, pp.z);
  const e = r.edge; const pts = e.pts; const path = [];
  const w = (e.width || 8) / 2 + 2.0;
  for (let i = 1; i < pts.length; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i]; const L = Math.hypot(x1 - x0, z1 - z0); const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    for (let s = 0; s < L; s += 2) path.push({ x: x0 + tx * s - tz * w, z: z0 + tz * s + tx * w, h: Math.atan2(tx, tz) }); }
  const mid = path[Math.floor(path.length / 2)];
  const cp = window.__cp = { path, mid, list: [], kind: null, edge: e.id };
  cp.clear = () => { for (const it of cp.list) { game.scene.remove(it.c.root); it.c.dispose?.(); } cp.list = []; };
  cp.spawn = (kind, n) => {
    cp.clear(); cp.kind = kind;
    const mk = [];
    if (kind === 'people') { const L = game.npc.cast.people.map((p) => p.id); let k = 0; for (let i = 0; i < n; i++) { let c = null; for (let t = 0; t < L.length && !c; t++) { const id = L[(k++) % L.length]; const b = game.npc.cast.get(id); if (b) c = game.npc.cast.make(b, { seed: 1000 + i }); } if (c) mk.push(c); } }
    else { const ids = game.npc.archetypes().filter((x) => x.loaded).map((x) => x.id); for (let i = 0; i < n; i++) { const h = game.npc.spawnPosed({ archetype: ids[i % ids.length], pos: { x: 0, y: -500, z: 0 }, people: false }); if (h) { game.scene.remove(h.root); mk.push(h.character); } } }
    mk.forEach((c, i) => {
      const lane = (i % 3) - 1; const f = (i * 0.618) % 1; const dir = i % 2 ? 1 : -1;
      game.scene.add(c.root);
      cp.list.push({ c, f, dir, lane, v: 1.1 + ((i * 37) % 10) / 20 });
    });
    return mk.length;
  };
  const L = path.length;
  game.updaters.push((dt) => {
    for (const it of cp.list) {
      it.f += it.dir * it.v * dt / (L * 2); if (it.f > 0.98) it.dir = -1; if (it.f < 0.02) it.dir = 1; it.f = Math.min(0.999, Math.max(0, it.f));
      const fi = it.f * (L - 1), i0 = Math.floor(fi), q = path[i0], q1 = path[Math.min(L - 1, i0 + 1)], k = fi - i0;
      const x = q.x + (q1.x - q.x) * k, z = q.z + (q1.z - q.z) * k;
      const hd = it.dir > 0 ? q.h : q.h + Math.PI; const ox = Math.cos(q.h) * it.lane * 0.9, oz = -Math.sin(q.h) * it.lane * 0.9;
      const gy = game.city.groundHeightAt(x + ox, z + oz, 1);
      it.c.root.position.set(x + ox, Number.isFinite(gy) ? gy : 0, z + oz); it.c.root.rotation.y = hd;
      it.c.update(dt, { speed: it.v, grounded: true });
    }
  });
  return JSON.stringify({ n: path.length, edge: e.name || e.id, mid });
})()`;

await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.tod || 15)}; game.quality.set('${o.preset || 'high'}', { manual: true }); return 1; })()`,
  );
  console.log('instrument', await b.eval(PAGE));
  await b.eval(`game.teleport(${AT[0]}, undefined, ${AT[1]}, 0)`);
  await b.sleep(8000);
  for (let i = 0; i < 60; i++) {
    const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
    if (q < 3) break;
    await b.sleep(1000);
  }
  // load people and archetypes
  await b.eval(
    `(async () => { const ids = game.npc.cast.people.map((p) => p.id); game.npc.cast.want(ids.slice(0, 34)); for (let i = 0; i < 240; i++) { if (game.npc.cast.stats().loaded >= Math.min(34, ids.length)) break; await new Promise((r) => setTimeout(r, 500)); } await Promise.all(game.npc.archetypes().slice(0, 30).map((a) => game.npc.load(a.id).catch(() => null))); return game.npc.cast.stats().loaded; })()`,
    300000,
  );
  console.log(
    'people',
    await b.eval('JSON.stringify(game.npc.peopleStats())'),
    'archetypes',
    await b.eval('game.npc.archetypes().filter((x) => x.loaded).length'),
  );
  console.log('harness', await b.eval(HARNESS));
  // camera: looking down the sidewalk from 2.5 m up, 14 m behind the middle
  await b.eval(
    `(() => { const m = __cp.mid; const hx = Math.sin(m.h), hz = Math.cos(m.h); game.cameraOverride = (dt, cam) => { cam.position.set(m.x - hx * 16 + Math.cos(m.h) * 3, (game.city.groundHeightAt(m.x, m.z, 1) || 0) + 2.6, m.z - hz * 16 - Math.sin(m.h) * 3); cam.lookAt(m.x + hx * 10, (game.city.groundHeightAt(m.x, m.z, 1) || 0) + 1.2, m.z + hz * 10); return true; }; return 1; })()`,
  );
  const measure = async () =>
    JSON.parse(await b.eval(`window.__pf.measure(${SECS * 1000}, false).then(JSON.stringify)`));
  const R = { people: [], arch: [], none: [] };
  for (let r = 0; r < ROUNDS; r++)
    for (const kind of r % 2 ? ['arch', 'people', 'none'] : ['people', 'arch', 'none']) {
      const n =
        kind === 'none'
          ? await b.eval('(__cp.clear(), 0)')
          : await b.eval(`__cp.spawn('${kind}', ${N})`);
      await b.sleep(2500);
      const m = await measure();
      m.n = n;
      R[kind].push(m);
      console.log(
        r,
        kind,
        n,
        JSON.stringify({
          med: m.med,
          p95: m.p95,
          work: m.work,
          gpu: m.gpuMs,
          render: m.renderMs,
          shadow: m.shadowMs,
          calls: m.calls,
          tris: m.tris,
        }),
      );
      if (r === 0 && kind !== 'none')
        await b.screenshot(`docs/v2/shots/people/perf_${SET}_${kind}.png`);
    }
  const sum = {};
  for (const k in R) {
    const ws = R[k];
    if (!ws.length) continue;
    sum[k] = {};
    for (const f of ['med', 'p95', 'work', 'gpuMs', 'renderMs', 'shadowMs', 'calls', 'tris']) {
      const v = ws.map((w) => w[f]).filter((x) => x != null);
      sum[k][f] = v.length ? +med(v).toFixed(2) : null;
    }
    sum[k].n = ws[0].n;
  }
  console.log('SUMMARY', JSON.stringify(sum));
  fs.writeFileSync(
    `docs/v2/reports/people-perf-${SET}.json`,
    JSON.stringify({ when: new Date().toISOString(), N, at: AT, sum, rounds: R }, null, 1),
  );
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 20).join('\n'));
});
