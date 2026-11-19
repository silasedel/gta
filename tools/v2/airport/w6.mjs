#!/usr/bin/env node
// W6 check: boot, go to the military base (gate, a climb spot, the pad), the Key Largo helipad; stats + screenshots.
//   node tools/v2/airport/w6.mjs [--only base|heli|mia] [--max 280]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const OUT = 'docs/v2/shots/w6';
import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 280) }, async (b) => {
  const t0 = Date.now(),
    log = (...x) => console.log(Math.round((Date.now() - t0) / 1000) + 's', ...x);
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  try {
    await b.waitFor(GAME_READY, 200);
  } catch (e) {
    log('NOT READY');
  }
  await startGame(b);
  log('started');
  const ev = async (x) =>
    b.eval(
      `(async () => { try { return JSON.stringify(await (${x})); } catch (e) { return 'ERR ' + e + ' ' + (e.stack || '').slice(0, 300); } })()`,
    );
  const only = o.only || 'base';
  if (only === 'base') {
    await ev(`game.teleport(-4440, undefined, 6040, -1.4)`);
    await b
      .waitFor(`game.base && game.base.state === 'live' && game.base.zone`, 120)
      .catch(() => log('base not live'));
    log(
      'base',
      await ev(
        `({ st: game.base.state, plan: { spots: game.base.plan.climbSpots.map(c => [Math.round(c.x), Math.round(c.z)]), main: game.base.plan.main }, gate: game.base.built?.gate, jets: game.base.built?.jets?.length, hv: game.base.built?.humvees?.length, hvm: game.base.built?.humveeModel, guards: game.base.zone.guards.length, cams: game.base.zone.cams.length, stats: game.airport.stats().find(s => s.id === 'eyw') })`,
      ),
    );
    const g = JSON.parse(await ev(`game.base.spot('gate')`));
    await ev(`game.teleport(${g.x}, undefined, ${g.z}, 0)`);
    await b.sleep(5000);
    await ev(
      `(() => { const gt = game.base.built.gate; const P = game.player; P.heading = Math.atan2(-gt.ox, -gt.oz); game.cameraYaw = P.heading + Math.PI; })()`,
    );
    await b.sleep(1500);
    await b.screenshot(OUT + '/gate.jpg');
    log('shot gate');
    const c = JSON.parse(await ev(`game.base.spot('climb1')`));
    await ev(`game.teleport(${c.x}, undefined, ${c.z}, 0)`);
    await b.sleep(4000);
    await ev(
      `(() => { const s = game.base.plan.climbSpots[0]; const P = game.player; P.heading = Math.atan2(s.nx, s.nz); game.cameraYaw = P.heading + Math.PI; })()`,
    );
    await b.sleep(1500);
    await b.screenshot(OUT + '/climb1.jpg');
    log('shot climb');
    log(
      'probe',
      await ev(
        `(() => { const p = game.airport.climb.probe(); return p && { top: p.top, toAirside: p.toAirside }; })()`,
      ),
    );
    // walk inside: put the player inside near the pad and see the guards notice
    const p = JSON.parse(await ev(`game.base.spot('pad')`));
    await ev(`game.teleport(${p.x}, undefined, ${p.z}, 0)`);
    await b.sleep(6000);
    await b.screenshot(OUT + '/pad.jpg');
    log(
      'detect',
      await ev(
        `({ sus: game.base.zone.state.sus, alert: game.base.zone.state.alert, why: game.base.zone.state.why, wanted: game.wanted?.level })`,
      ),
    );
    const fps = await ev(
      `new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else r(Math.round(n / 3)); }; requestAnimationFrame(f); })`,
    );
    log('fps (headless)', fps);
  }
  if (only === 'heli') {
    await ev(`game.teleport(-1000, undefined, 5180, 0)`);
    await b
      .waitFor(`game.heli && game.heli.pad.state === 'live'`, 90)
      .catch(() => log('pad not live'));
    log('pad', await ev(`({ x: game.heli.pad.x, z: game.heli.pad.z, n: game.heli.list.length })`));
    await ev(`game.teleport(game.heli.pad.x + 14, undefined, game.heli.pad.z, -Math.PI / 2)`);
    await b.sleep(5000);
    await ev(
      `(() => { const P = game.player; P.heading = -Math.PI / 2; game.cameraYaw = P.heading + Math.PI; })()`,
    );
    await b.sleep(1000);
    await b.screenshot(OUT + '/helipad.jpg');
    // fly: enter, spool, climb, forward
    log(
      'enter',
      await ev(
        `(() => { const H = game.heli.list[0]; game.enterVehicle(H); return !!game.player.state.vehicle?.heli; })()`,
      ),
    );
    await ev(
      `(() => { window.__k = new Set(['KeyW']); const i = game.input; i.__down = i.down; i.down = (c) => window.__k.has(c) || i.__down(c); })()`,
    );
    await b.sleep(9000);
    log(
      'climb',
      await ev(
        `(() => { const H = game.heli.list[0]; return { y: H.pos.y.toFixed(1), agl: H.agl.toFixed(1), rotor: H.rotor.toFixed(2), onGround: H.onGround }; })()`,
      ),
    );
    await ev(`(() => { window.__k = new Set(['KeyI']); })()`);
    await b.sleep(6000);
    log(
      'fwd',
      await ev(
        `(() => { const H = game.heli.list[0]; return { kmh: Math.round(H.speedKmh), agl: H.agl.toFixed(1), x: Math.round(H.pos.x), z: Math.round(H.pos.z) }; })()`,
      ),
    );
    await b.screenshot(OUT + '/heli_fly.jpg');
    await ev(`(() => { window.__k = new Set(); })()`);
  }
  if (only === 'climb') {
    await ev(`game.teleport(-4440, undefined, 6040, -1.4)`);
    await b
      .waitFor(`game.base && game.base.state === 'live' && game.base.zone`, 120)
      .catch(() => log('base not live'));
    const i = +(o.spot || 1) - 1;
    await ev(
      `(() => { const s = game.base.plan.climbSpots[${i}]; game.teleport(s.x - s.nx * 0.9, undefined, s.z - s.nz * 0.9, Math.atan2(s.nx, s.nz)); })()`,
    );
    await b.sleep(4000);
    await ev(
      `(() => { const s = game.base.plan.climbSpots[${i}]; game.player.heading = Math.atan2(s.nx, s.nz); game.cameraYaw = game.player.heading + Math.PI; })()`,
    );
    await b.sleep(500);
    log('climb', await ev(`game.airport.climb.tryClimb()`));
    await b.sleep(1500);
    await b.screenshot(OUT + '/climbing.jpg');
    await b.sleep(3000);
    log(
      'after',
      await ev(
        `({ inside: !!game.airport.inAirside(game.player.position.x, game.player.position.z) || game.base.zone.state, sus: game.base.zone.state.sus, alert: game.base.zone.state.alert, wanted: game.wanted?.level, cams: game.base.zone.cams.map(c => +c.sus.toFixed(2)), guards: game.base.zone.guards.map(g => +g.sus.toFixed(2)) })`,
      ),
    );
    log(
      'prof',
      await ev(
        `(() => { const c = game.city; let t0 = performance.now(); for (let k = 0; k < 1000; k++) c.groundHeightAt(-4600 + k * 0.1, 6000); const g = (performance.now() - t0).toFixed(3); const W = game.world, R = game.RAPIER; t0 = performance.now(); for (let k = 0; k < 200; k++) W.castRay(new R.Ray({ x: -4600, y: 3, z: 6000 }, { x: 1, y: 0, z: 0 }), 40, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC); return { ground1000: g, ray200: (performance.now() - t0).toFixed(3) }; })()`,
      ),
    );
    const t = await ev(
      `(() => { const z = game.base.zone; const t0 = performance.now(); for (let k = 0; k < 50; k++) z.update(1/60); return ((performance.now() - t0) / 50).toFixed(3) + ' ms/update'; })()`,
    );
    log('zone cost', t);
  }
  if (only === 'air') {
    // a helicopter at the base: normal approach + landing is fine; buzzing the guards is not
    await ev(`game.teleport(-4440, undefined, 6040, -1.4)`);
    await b
      .waitFor(`game.base && game.base.state === 'live' && game.base.zone && game.heli`, 120)
      .catch(() => log('base not live'));
    await ev(
      `(() => { const H = game.heli.spawn(new THREE.Vector3(-4400, 0, 6128), -Math.PI / 2); window.__H = H; return 1; })()`,
    ).catch(() => {});
    log(
      'spawn',
      await ev(
        `(() => { const H = game.heli.list[game.heli.list.length - 1]; H.pos.set(-4330, 45, 6128); H.onGround = false; H.rotor = 1; game.enterVehicle(H); return game.player.state.vehicle === H; })()`,
      ),
    );
    await ev(
      `(() => { window.__k = new Set(['KeyS']); const i = game.input; i.__down = i.down; i.down = (c) => window.__k.has(c) || i.__down(c); })()`,
    );
    await b.sleep(8000);
    log(
      'desc',
      await ev(
        `(() => { const H = game.player.state.vehicle; return { agl: H.agl.toFixed(1), air: game.base.zone.state.air.toFixed(2), alert: game.base.zone.state.alert }; })()`,
      ),
    );
    await ev(`(() => { window.__k = new Set(['KeyI']); })()`);
    await b.sleep(7000);
    log(
      'low fast',
      await ev(
        `(() => { const H = game.player.state.vehicle; return { agl: H.agl.toFixed(1), kmh: Math.round(H.speedKmh), air: game.base.zone.state.air.toFixed(2), alert: game.base.zone.state.alert, why: game.base.zone.state.why, wanted: game.wanted?.level }; })()`,
      ),
    );
    await b.screenshot(OUT + '/heli_base.jpg');
    await ev(`(() => { window.__k = new Set(); })()`);
  }
  log(
    'CONSOLE ERRORS',
    b.errors.length,
    JSON.stringify([...new Set(b.errors)].slice(0, 12)).slice(0, 2500),
  );
});
