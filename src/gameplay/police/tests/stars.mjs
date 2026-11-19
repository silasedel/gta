// Full-game police scenario: every star level, the no-crime guard, surrender + jail, taser, search phase, perf.
// node src/gameplay/police/tests/stars.mjs   (dev server on 5200; screenshots in docs/v2/shots/police/)
import { run } from './lib.mjs';
const only = process.argv[2] || 'all';
const want = (k) => only === 'all' || only.split(',').includes(k);

await run('stars', async (t) => {
  const J = async (js, ms) => JSON.parse(await t.ev(`(async () => JSON.stringify(await (async () => { ${js} })()))()`, ms));
  const state = () => J(`const W = game.wanted, po = game.police, r = po.response?.stats || {};
    return { level: W.level, phase: W.phase, seen: W.seen, evading: W.evading, units: po.units.filter(u => u.active && !u.dead).length,
      swat: po.units.filter(u => u.active && u.swat).length, cars: po.cars.length, swatVans: po.cars.filter(c => c.swat).length, deployed: po.cars.filter(c => c.deployed).length,
      helis: r.helis || 0, heliOn: r.heliOn || 0, blocks: po.blocks.length, spikes: r.spikes || 0, bounty: W.bounty, ms: +po.perf.ms.toFixed(3), idle: po.perf.idle,
      line: po.comms?.line || null, history: W.law.S.history.slice(-4).map(h => h.before + '>' + h.level + ':' + h.reason) };`);
  const reset = async () => { await t.ev(`(() => { game.police.hardReset(); game.wanted.clear('test'); game.player.health = 100; game.player.script = null; return 1; })()`); await t.ev('__t.wait(1500)'); };
  // a quiet open street near the spawn for every scene
  await t.ev(`(() => { game.timeOfDay = 12; return 1; })()`);
  await t.ev('__t.wait(1500)');

  if (want('guard')) {
    // 1. no crime, no chase: crashes, gunfire by others and 911 calls about them never give stars
    await reset();
    await J(`const p = game.player.position;
      game.emit('crash', { point: p.clone().add({ x: 12, y: 0, z: 4 }), impulse: 9000 });
      game.emit('shot', { origin: p.clone().add({ x: 20, y: 1, z: 0 }), dir: { x: 1, y: 0, z: 0 }, byPlayer: false });
      game.emit('witness', { what: 'crash', where: { x: p.x + 12, z: p.z + 4 }, reliability: 0.8, witnessId: 'n1' });
      game.emit('witness', { what: 'shots fired', where: { x: p.x + 20, z: p.z }, reliability: 0.8, witnessId: 'n2' });
      game.emit('witness', { what: 'assault', where: { x: p.x, z: p.z }, reliability: 0.8, witnessId: 'n3' });
      return 1;`);
    await t.ev('__t.wait(9000)');
    const s = await state();
    t.ok(s.level === 0, 'crashes, other gunfire and 911 calls about them start no chase', s);
    const ig = await J('return game.wanted.law.sense.S.stats.ignoredCalls || 0;');
    t.ok(ig >= 3, '911 calls without a player crime are ignored', ig);
    // 1b. a real crime with a cop watching does
    await J(`game.emit('crime', { type: 'assault', position: game.player.position.clone(), police: true }); return 1;`);
    await t.ev('__t.wait(600)');
    const s2 = await state();
    t.ok(s2.level === 1 && /assault/.test(s2.history.join()), 'a real crime seen by an officer gives one star (reason logged)', s2.history);
    // perf when idle
    await reset();
    await t.ev('__t.wait(3000)');
    const s3 = await state();
    t.ok(s3.idle && s3.ms < 0.15, 'police cost when no unit is active', { ms: s3.ms, idle: s3.idle });
  }

  if (want('one')) {
    // 2. one star: the stop. Officer shouts, compliance window, hands up -> cuffed -> booking scene
    await reset();
    await J(`const p = game.player.position; game.wanted.set(1, p, { visual: true });
      const a = game.player.heading, x = p.x + Math.sin(a) * 9, z = p.z + Math.cos(a) * 9;
      const u = game.police.spawnCop(new p.constructor(x, p.y, z), a + Math.PI); return !!u;`);
    await t.ev('__t.wait(2500)');
    let s = await state();
    t.ok(s.level === 1 && !!s.line, '1 star: the officer shouts', s.line);
    await t.shot('star1_stop');
    await J('game.police.arrest.setSurrender(true); return 1;');
    await t.ev('__t.wait(1800)');
    await t.shot('star1_handsup');
    const ok = await t.ev(`__t.until(() => game.ui.arrested || game.police.arrest.jail, 15000)`, 20000);
    t.ok(ok, 'hands up: the officer walks over and cuffs');
    await t.ev('__t.wait(5200)');
    await t.shot('star1_mugshot');
    await t.ev('__t.wait(4300)');
    await t.shot('star1_timeserved');
    await t.ev(`__t.until(() => !game.police.arrest.jail, 12000)`, 15000);
    s = await state();
    t.ok(s.level === 0, 'released after the booking scene', s);
  }

  if (want('two')) {
    // 3. two stars: the runner gets tased
    await reset();
    await J(`const p = game.player.position; game.wanted.set(2, p, { visual: true });
      const a = game.player.heading, x = p.x - Math.sin(a) * 6, z = p.z - Math.cos(a) * 6;
      game.police.spawnCop(new p.constructor(x, p.y, z), a); return 1;`);
    const tased = await t.ev(`new Promise(r => { let done = false; game.on('police:tased', () => { if (!done) { done = true; r(true); } }); setTimeout(() => r(false), 14000); })`, 16000);
    await t.shot('star2_taser');
    t.ok(tased, '2 stars: the officer tases the suspect');
    await t.ev(`__t.until(() => game.ui.arrested || game.police.arrest.jail, 9000)`, 12000);
    await t.ev(`__t.until(() => !game.police.arrest.jail, 16000)`, 20000);
  }

  for (const lv of [3, 4, 5, 6]) {
    if (!want('s' + lv)) continue;
    await reset();
    await t.ev(`(() => { game.timeOfDay = ${lv === 3 ? 22.5 : 14}; return 1; })()`);
    await J(`game.wanted.set(${lv}, game.player.position, { visual: true }); return 1;`);
    // keep them on us for a while
    await t.ev(`(async () => { for (let i = 0; i < 60; i++) { game.wanted.law.core.sighting(game.player.position, { visual: true, by: 'officer' }); await __t.wait(500); } return 1; })()`, 40000);
    const s = await state();
    t.ok(s.level === lv, `${lv} stars held`, s);
    t.ok(s.cars >= 1, `${lv} stars: cars dispatched`, { cars: s.cars, deployed: s.deployed, units: s.units });
    if (lv >= 3) t.ok(s.helis >= (lv >= 6 ? 2 : 1), `${lv} stars: helicopter${lv >= 6 ? 's' : ''} up`, { helis: s.helis, on: s.heliOn });
    if (lv >= 4) t.ok(s.swatVans >= 1 || s.swat >= 1, `${lv} stars: SWAT dispatched`, { vans: s.swatVans, swat: s.swat });
    if (lv >= 6) t.ok(s.bounty >= 50000, '6 stars: manhunt bounty', s.bounty);
    // look up at the helicopter / the officers
    await t.ev(`(() => { const h = game.police.response.helis.find(h => h.state !== 'gone'); if (h && ${lv === 3}) { const p = game.player.position; game.cameraOverride = (dt, c) => { c.position.set(p.x + 14, p.y + 4, p.z + 14); c.lookAt(h.m.group.position); return true; }; } return 1; })()`);
    await t.ev('__t.wait(800)');
    await t.shot(`star${lv}`);
    await t.ev('(() => { game.cameraOverride = null; return 1; })()');
    console.log(`  star ${lv}:`, JSON.stringify(s));
  }

  if (want('search')) {
    // 4. search: out of sight -> flashing stars, cars sweep the circle
    await reset();
    await J(`game.wanted.set(2, game.player.position, { visual: false }); return 1;`);
    await t.ev('__t.wait(4000)');
    const s = await state();
    t.ok(s.phase === 'search' && s.evading, 'reported without a sighting: search phase, stars pulse', s);
    const cls = await t.ev(`document.querySelector('.ps-corner')?.className || ''`);
    t.ok(/evading/.test(cls), 'HUD stars pulse while searched', cls);
    await t.shot('search_hud');
  }

  if (want('grip')) {
    // 5. grip stays stable on a far officer animated on LOD frames only
    await reset();
    const r = await J(`const p = game.player.position; game.wanted.set(3, p, { visual: false });
      const u = game.police.spawnCop(new p.constructor(p.x + 120, p.y, p.z), 0); if (!u) return null;
      const qs = []; for (let i = 0; i < 40; i++) { await __t.wait(50); qs.push(u.hand.quaternion.toArray()); }
      let maxD = 0; for (let i = 1; i < qs.length; i++) { const a = qs[i - 1], b = qs[i]; const dot = Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]); maxD = Math.max(maxD, 2 * Math.acos(Math.min(1, dot))); }
      return { maxDeg: +(maxD * 57.3).toFixed(1) };`, 10000);
    t.ok(r && r.maxDeg < 25, 'far officer hand rotation does not drift between frames', r);
  }
}, { max: 420 });
