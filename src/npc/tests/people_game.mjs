// In-game test of the people system (NPC-AI track). Usage: node src/npc/tests/people_game.mjs [soakSeconds]
// Boots the real game in the V2 test browser, then: boot check, crowd frame time, reaction test (a shot near 30
// people), witness reports, schedule sample at four hours, two screenshots, and a uniqueness soak with churn.
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const SOAK = Number(process.argv[2] || 60);
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const OUT = 'docs/v2/shots/npc-ai';
fs.mkdirSync(OUT, { recursive: true });
const res = { when: new Date().toISOString() };
const log = (k, v) => {
  res[k] = v;
  console.log(k, JSON.stringify(v));
};
await withBrowser({ width: 1280, height: 720, maxSeconds: 235 }, async (b) => {
  const E = async (js) => {
    const s = await b.eval(
      `(async()=>{ try { return JSON.stringify(await (async()=>{ ${js} })()); } catch (e) { return JSON.stringify({ err: String(e && e.stack || e) }); } })()`,
    );
    try {
      return JSON.parse(s);
    } catch (e) {
      return s;
    }
  };
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 120);
  const enter = async () => {
    await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`);
    await b.waitFor(GAME_READY, 120);
  };
  await enter();
  const shot = async (f) => {
    try {
      await enter();
      await wait(2.5);
      await b.screenshot(f);
    } catch (e) {
      console.log('screenshot failed', f, String(e).slice(0, 200));
    }
  };
  // stand on a sidewalk spot facing the direction with the most people 6..70 m ahead
  const stage = async (r = 60, keep = false) =>
    E(`
    const pp = game.player.position; const pts = game.peds.list.filter((p) => p.active && !p.dead).map((p) => [p.pos.x, p.pos.z]).concat(game.people.crowd.positions());
    let best = null, bs = -1;
    for (let k = 0; k < (${keep} ? 1 : 14); k++) { const s = ${keep} ? { x: pp.x, z: pp.z } : game.peds._nav.sidewalkNear(pp, ${r}); if (!s) continue;
      for (let a = 0; a < 24; a++) { const h = a / 24 * Math.PI * 2, fx = Math.sin(h), fz = Math.cos(h); let n = 0;
        for (const [x, z] of pts) { const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz); if (d < 5 || d > 70) continue; if ((dx * fx + dz * fz) / d > 0.88) n += d < 30 ? 2 : 1; }
        if (n > bs) { bs = n; best = [s.x, s.z, h]; } } }
    if (best) game.teleport(best[0], null, best[1], best[2]);
    return { best, score: bs };`);
  const mem = `Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)`;
  log(
    'boot',
    await E(
      `return { people: !!game.people, failed: game.v2?.failed || null, peds: game.peds.list.length, lines: game.people?.lineCount?.() };`,
    ),
  );
  // ---- busy sidewalk downtown, morning rush
  await E(`game.timeOfDay = 8.5; game.teleport(-2505, null, 555, 0.4); return 1;`);
  await wait(22);
  log(
    'rush',
    await E(
      `return { mem: ${mem}, peds: game.peds.count, crowd: game.people.crowd.count, audit: game.people.audit(), district: game.city.districtAt?.(game.player.position.x, game.player.position.z) };`,
    ),
  );
  const frame = `return await new Promise((res) => { const d = []; let last = performance.now(); const t0 = last; function f(t) { d.push(t - last); last = t; if (t - t0 < 4000) requestAnimationFrame(f); else { d.sort((a, b) => a - b); const avg = d.reduce((a, b) => a + b, 0) / d.length; res({ frames: d.length, avgMs: +avg.toFixed(2), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(2), fps: +(1000 / avg).toFixed(1), peds: game.peds.count, crowd: game.people.crowd.count, calls: game.renderer?.info?.render?.calls, tris: game.renderer?.info?.render?.triangles, inView: game.people.inView() }); } } requestAnimationFrame(f); });`;
  log('frameRush', await E(frame));
  log('stageSidewalk', await stage(70));
  await wait(5);
  log('inViewSidewalk', await E(`return game.people.inView();`));
  await shot(`${OUT}/sidewalk_downtown.png`);
  // ---- roster sample (who these people are)
  log('roster', await E(`return game.people.roster().slice(0, 6);`));
  if (!process.env.ONLY_SHOTS) {
    // ---- reaction test: 30 people around the player, one shot
    const pre = await E(`
    const pp = game.player.position; const out = [];
    for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2, r = 6 + (i % 5) * 4; const p = game.peds.spawnAt({ x: pp.x + Math.sin(a) * r, z: pp.z + Math.cos(a) * r }); if (p) { p.pinned = 60; out.push(p.id); } }
    window.__rt = out; game.people.resetReactStats(); window.__wit = []; game.on('witness', (w) => window.__wit.push(w));
    return { spawned: out.length, dressed: game.peds.list.filter((p) => out.includes(p.id) && p.identity).length };`);
    log('reactSpawn', pre);
    await wait(1.5);
    await E(
      `const pp = game.player.position; game.emit('shot', { origin: { x: pp.x, y: pp.y + 1.4, z: pp.z } }); return 1;`,
    );
    await wait(2.2);
    log(
      'reactStates',
      await E(`
    const by = {}; for (const p of game.peds.list) { if (!window.__rt.includes(p.id) || !p.identity) continue; const c = p.identity.traits.courage; const band = c < 0.33 ? 'low' : c < 0.66 ? 'mid' : 'high'; const s = p.state === 'cower' ? 'cower' : p.state; (by[band] ||= {})[s] = (by[band][s] || 0) + 1; }
    return { byCourageBand: by, stats: game.people.reactStats() };`),
    );
    await wait(9);
    log(
      'witness',
      await E(
        `return { reports: window.__wit.length, sample: window.__wit.slice(0, 3), lines: game.people.lines().slice(-8) };`,
      ),
    );
    // ---- schedule sample: Downtown at four hours (pure sample + live counts)
    const sched = [];
    for (const h of [4, 8.5, 13, 1]) {
      await E(`game.timeOfDay = ${h}; game.teleport(-2505, null, 555, 0.4); return 1;`);
      await wait(7);
      sched.push(
        await E(
          `return { hour: ${h}, sample: game.people.sample('business', 'Downtown', ${h}), live: { peds: game.peds.count, crowd: game.people.crowd.count, density: +game.people.densityFor(game.player.position.x, game.player.position.z).toFixed(2) } };`,
        ),
      );
    }
    log('schedule', sched);
  }
  // ---- beach at noon
  await E(`game.timeOfDay = 12.5; game.teleport(3575, null, -60, 3.14); return 1;`);
  await wait(16);
  log(
    'beach',
    await E(
      `return { mem: ${mem}, uptime: performance.now() | 0, peds: game.peds.count, crowd: game.people.crowd.count, district: game.city.districtAt?.(game.player.position.x, game.player.position.z), zone: game.city.zoneAt?.(game.player.position.x, game.player.position.z) };`,
    ),
  );
  log('frameBeach', await E(frame));
  log('stageBeach', await stage(45, true));
  await wait(5);
  log('inViewBeach', await E(`return game.people.inView();`));
  await shot(`${OUT}/beach_noon.png`);
  // ---- uniqueness soak with churn across districts and hours
  const spots = [
    [3407, 333, 17],
    [-2705, 1553, 12],
    [-2505, 555, 18],
    [3308, 1437, 10],
    [-1800, -1200, 15],
    [2800, -1500, 21],
  ];
  const t0 = Date.now();
  let k = 0;
  while ((Date.now() - t0) / 1000 < SOAK) {
    const [x, z, h] = spots[k++ % spots.length];
    await E(`game.timeOfDay = ${h}; game.teleport(${x}, null, ${z}, ${k}); return 1;`);
    await wait(9);
  }
  log('audit', await E(`return game.people.audit();`));
  res.sigs = await E(`return game.people.sigList();`);
  console.log('sigs', res.sigs.length);
  log('errors', b.errors.slice(0, 12));
});
fs.writeFileSync(`${OUT}/people_game_results_${Date.now()}.json`, JSON.stringify(res, null, 1));
