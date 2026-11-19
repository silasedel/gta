#!/usr/bin/env node
// Mari / switching check (Phase F): boots the real game (new game, no saving), probes her start spot, switches to her
// (sky cut), orbits her front / side / back in sun and evening light, switches back, calls her as a follower.
//   node tools/v2/player/mari-test.mjs [--only probe] [--q "&x=1"]
// -> docs/v2/shots/mari/<id>.png, docs/v2/reports/mari-test.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, startGame } from '../browser.mjs';

const a = process.argv.slice(2);
const o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--'))
    o[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
const DIR = path.resolve('docs/v2/shots/mari');
fs.mkdirSync(DIR, { recursive: true });
const rep = { when: new Date().toISOString(), steps: {} };
const only = o.only ? String(o.only).split(',') : null;
const want = (k) => !only || only.includes(k);

// camera around the player: yaw from his facing (0 = in front), distance, eye height, look height
const orbit = (yaw, dist, eh, lh) => `(() => { const P = game.player;
  game.cameraOverride = (dt, cam) => { const a = P.heading + ${yaw};
    cam.position.set(P.position.x + Math.sin(a) * ${dist}, P.position.y + ${eh}, P.position.z + Math.cos(a) * ${dist});
    cam.lookAt(P.position.x, P.position.y + ${lh}, P.position.z); return true; }; })()`;

await withBrowser({ width: 1280, height: 720, maxSeconds: 285 }, async (b) => {
  const t0 = Date.now();
  const log = (...m) => console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', ...m);
  await b.goto('http://127.0.0.1:5200/?mute&newgame&nosave' + (o.q || ''));
  await startGame(b, 150);
  log('game up');
  await b.eval(`game.timeExternal = true; game.timeOfDay = 12; true`);
  const ok = await b.eval(`game.characters.ready().then(() => true).catch((e) => String(e))`);
  rep.steps.ready = ok;
  log('mari ready', ok);
  // her start spot: ground, water, district
  rep.steps.probe = JSON.parse(
    await b.eval(`JSON.stringify((() => { const c = game.city, out = [];
      for (const [x, z] of [[-2742, 6566], [-2783, 6600], [-2760, 6580], [-2800, 6560], [-2720, 6620]])
        out.push({ x, z, g: c.groundHeightAt(x, z), water: c.isWater(x, z), zone: c.zoneAt?.(x, z), d: c.districtAt?.(x, z) });
      const sw = c.randomSidewalkPoint?.({ x: -2783, z: 6600 }, 160);
      const near = (p, r) => Math.hypot((p.x ?? p.pos?.x) + 2783, (p.z ?? p.pos?.z) - 6600) < r;
      const moor = (c.moorings?.(-2783, 6600, 900) || []).filter((m) => near(m, 900)).slice(0, 12).map((m) => ({ x: +(m.x ?? m.pos?.x).toFixed(1), z: +(m.z ?? m.pos?.z).toFixed(1), h: m.heading ?? m.h, kind: m.kind }));
      const shops = (c.storefrontsNear?.(-2783, 6600, 500) || []).slice(0, 12).map((s) => ({ x: +s.x.toFixed(1), z: +s.z.toFixed(1), kind: s.kind, street: s.street, facing: s.facing }));
      return { spots: out, sidewalk: sw && { x: sw.x, z: sw.z }, moor, shops, list: game.characters.list }; })())`),
  );
  log('probe', JSON.stringify(rep.steps.probe).slice(0, 2500));
  if (o.top) {
    // a top view of an area (start-spot scouting): --top x,z ; north is up, 260 m high, fov 62
    const [tx, tz] = String(o.top).split(',').map(Number);
    await b.eval(`game.teleport(${tx}, undefined, ${tz}); true`);
    await b.waitFor('!game.teleportHolding', 40);
    rep.steps.topNear =
      await b.eval(`JSON.stringify({ shops: (game.city.storefrontsNear?.(${tx}, ${tz}, 300) || []).slice(0, 20).map((s) => [s.kind, +s.x.toFixed(1), +s.z.toFixed(1), s.street, +(s.facing || 0).toFixed(2)]),
      walk: [0, 1, 2, 3, 4, 5].map(() => { const p = game.city.randomSidewalkPoint?.({ x: ${tx}, z: ${tz} }, 150); return p && [+p.x.toFixed(1), +p.z.toFixed(1)]; }),
      moor: (game.city.moorings(${tx}, ${tz}, 400) || []).slice(0, 10).map((m) => [+(m.x ?? m.pos?.x).toFixed(1), +(m.z ?? m.pos?.z).toFixed(1)]) })`);
    log('topNear', rep.steps.topNear);
    await b.eval(
      `game.cameraOverride = (dt, cam) => { cam.position.set(${tx}, 260, ${tz} + 0.01); cam.lookAt(${tx}, 0, ${tz}); return true; }; true`,
    );
    await b.sleep(3000);
    await b.screenshot(path.join(DIR, 'top_scout.png'));
    await b.eval(`game.cameraOverride = null; true`);
  }
  if (want('switch')) {
    await b.eval(`window.__sw = game.characters.switchTo('mari'); true`);
    await b.sleep(700);
    await b.screenshot(path.join(DIR, 'switch_rise.png'));
    await b.waitFor('!game.characters.busy', 40);
    await b.sleep(1500);
    await b.screenshot(path.join(DIR, 'switch_land.png'));
    rep.steps.switched = await b.eval(
      `JSON.stringify({ active: game.characters.active, pos: game.player.position, hero: game.playerCharacter.hero, cash: game.wallet.cash, inv: game.player.inventory })`,
    );
    log('switched', rep.steps.switched);
    rep.steps.near =
      await b.eval(`JSON.stringify({ moor: (game.city.moorings(-2783, 6600, 900) || []).slice(0, 15).map((m) => [m.id, +(m.x ?? m.pos?.x).toFixed(1), +(m.z ?? m.pos?.z).toFixed(1), m.heading ?? m.h ?? null]),
      shops: (game.city.storefrontsNear?.(-2783, 6600, 600) || []).slice(0, 15).map((s) => [s.kind, +s.x.toFixed(1), +s.z.toFixed(1), s.street, +(s.facing || 0).toFixed(2)]) })`);
    log('near', rep.steps.near);
    if (want('top')) {
      await b.eval(
        `game.cameraOverride = (dt, cam) => { cam.position.set(-2760, 260, 6590.01); cam.lookAt(-2760, 0, 6590); return true; }; true`,
      );
      await b.sleep(2500);
      rep.steps.fov = await b.eval('game.camera.fov');
      await b.screenshot(path.join(DIR, 'top_marathon.png'));
      await b.eval(`game.cameraOverride = null; true`);
    }
    if (only && !want('shots')) return;
    for (const [tod, tag] of [
      [12, 'sun'],
      [17.6, 'eve'],
    ]) {
      await b.eval(`game.timeOfDay = ${tod}; true`);
      for (const [id, yaw] of [
        ['front', 0],
        ['side', Math.PI / 2],
        ['back', Math.PI],
      ]) {
        await b.eval(orbit(yaw, 2.8, 1.2, 0.95));
        await b.sleep(900);
        await b.screenshot(path.join(DIR, `${tag}_${id}.png`));
      }
    }
    await b.eval(orbit(0.3, 0.9, 1.58, 1.52));
    await b.sleep(800);
    await b.screenshot(path.join(DIR, 'face.png'));
    await b.eval(`game.cameraOverride = null; game.timeOfDay = 12; true`);
    // walk + run
    await b.key('KeyW', true, 'w');
    await b.sleep(1200);
    await b.eval(orbit(Math.PI / 2, 3.2, 1.2, 0.95));
    await b.sleep(300);
    await b.screenshot(path.join(DIR, 'walk.png'));
    await b.key('KeyW', false, 'w');
    await b.eval(`game.cameraOverride = null; true`);
    log('mari shots done');
  }
  if (want('follow')) {
    await b.eval(`window.__sw = game.characters.switchTo('nico'); true`);
    await b.waitFor('!game.characters.busy', 40);
    rep.steps.back = await b.eval(
      `JSON.stringify({ active: game.characters.active, pos: game.player.position, list: game.characters.list })`,
    );
    log('back to nico', rep.steps.back.slice(0, 300));
    await b.eval(`game.characters.summon('mari'); true`);
    await b.sleep(2500);
    await b.key('KeyW', true, 'w');
    await b.sleep(2500);
    await b.key('KeyW', false, 'w');
    await b.sleep(1200);
    await b.eval(orbit(Math.PI * 0.8, 6, 2.2, 0.9));
    await b.sleep(500);
    await b.screenshot(path.join(DIR, 'follow.png'));
    rep.steps.follow = await b.eval(`JSON.stringify(game.characters.list)`);
    log('follow', rep.steps.follow);
    // ride along: Nico takes the nearest car, she gets in as the passenger
    rep.steps.car =
      await b.eval(`(() => { const P = game.player; const v = game.vehicles.nearest?.(P.position, 80);
      if (!v) return 'no car'; const t = v.body.translation(); game.teleport(t.x + 2.5, undefined, t.z); window.__car = v; return v.typeKey; })()`);
    await b.sleep(1500);
    await b.eval(`game.enterVehicle(window.__car); true`);
    await b.sleep(2500);
    await b.eval(`(() => { const v = window.__car, T = game.THREE; game.cameraOverride = (dt, cam) => { const m = v.car?.shell || v.mesh; const q = m.getWorldQuaternion(new T.Quaternion()), p = m.getWorldPosition(new T.Vector3());
      const left = new T.Vector3(1, 0, 0).applyQuaternion(q), fwd = new T.Vector3(0, 0, 1).applyQuaternion(q);
      cam.position.copy(p).addScaledVector(left, -3.6).addScaledVector(fwd, 1.2).add(new T.Vector3(0, 1.6, 0)); cam.lookAt(p.x, p.y + 0.9, p.z); return true; }; })()`);
    await b.sleep(700);
    await b.screenshot(path.join(DIR, 'ride.png'));
    rep.steps.ride = await b.eval('JSON.stringify(game.characters.debug())');
    log('ride', rep.steps.car, rep.steps.ride);
    // switch away while driving: Nico stays in the car; then back
    await b.eval(`game.cameraOverride = null; game.characters.dismiss('mari'); true`);
    await b.eval(`window.__sw = game.characters.switchTo('mari'); true`);
    await b.waitFor('!game.characters.busy', 40);
    rep.steps.leftCar = await b.eval(
      `JSON.stringify({ d: game.characters.debug(), carKeep: !!window.__car.keep, inV: game.player.state.inVehicle })`,
    );
    log('left car', rep.steps.leftCar);
    await b.eval(`window.__sw = game.characters.switchTo('nico'); true`);
    await b.waitFor('!game.characters.busy', 40);
    await b.sleep(800);
    rep.steps.backInCar = await b.eval(
      `JSON.stringify({ inV: game.player.state.inVehicle, same: game.player.state.vehicle === window.__car, d: game.characters.debug() })`,
    );
    log('back in car', rep.steps.backInCar);
    await b.screenshot(path.join(DIR, 'back_in_car.png'));
    // fight: a ped attacks Nico on foot; she follows and shoots
    await b.eval(`game.exitVehicle(); true`);
    await b.sleep(2500);
    await b.eval(`game.characters.summon('mari'); true`);
    await b.sleep(1500);
    rep.steps.fight =
      await b.eval(`(() => { const P = game.player, T = game.THREE; const p = game.peds?.spawnAt?.(new T.Vector3(P.position.x + 7, P.position.y, P.position.z + 4), {});
      if (!p) return 'no ped'; p.state = 'fight'; p.stateT = 30; p.hitCd = 0.8; p.guard = true; window.__foe = p; return 'ok'; })()`);
    await b.sleep(4000);
    await b.eval(orbit(Math.PI * 0.75, 7, 2.6, 1.0));
    await b.sleep(400);
    await b.screenshot(path.join(DIR, 'fight.png'));
    rep.steps.fightAfter = await b.eval(
      `JSON.stringify({ d: game.characters.debug(), foe: window.__foe && { state: window.__foe.state, hp: window.__foe.health ?? window.__foe.hp, dead: !!window.__foe.dead } })`,
    );
    log('fight', rep.steps.fight, rep.steps.fightAfter);
    await b.eval('game.cameraOverride = null; true');
    // phone: contacts + a story call through the phone app
    await b.eval(`if (!game.phone.open) game.phone.toggle(); true`);
    await b.sleep(800);
    await b.eval(`game.phone.openApp?.('phone', { call: 'vale' }); true`);
    await b.sleep(3800);
    await b.screenshot(path.join(DIR, 'phone_call.png'));
    rep.steps.contacts = await b.eval(
      `JSON.stringify(game.phone.data?.contacts?.().slice(0, 9).map((c) => c.name) || null)`,
    );
    log('contacts', rep.steps.contacts);
  }
  if (want('look2')) {
    // shoulders: Nico close up, then Mari close up (idle), then Mari walk / run / jump landing / hit with the springs
    await b.eval(`game.timeOfDay = 12; true`);
    for (const [id, yaw] of [
      ['nico_sh_front', 0],
      ['nico_sh_side', Math.PI / 2],
    ]) {
      await b.eval(orbit(yaw, 1.45, 1.5, 1.35));
      await b.sleep(900);
      await b.screenshot(path.join(DIR, id + '.png'));
    }
    await b.eval(`window.__sw = game.characters.switchTo('mari'); true`);
    await b.waitFor('!game.characters.busy', 40);
    await b.waitFor('!!game.playerCharacter.jiggle', 20);
    await b.sleep(1500);
    for (const [id, yaw] of [
      ['mari_sh_front', 0],
      ['mari_sh_back', Math.PI],
      ['mari_sh_side', Math.PI / 2],
      ['mari_full', 0.5],
    ]) {
      await b.eval(id === 'mari_full' ? orbit(yaw, 3.0, 1.2, 0.95) : orbit(yaw, 1.35, 1.42, 1.25));
      await b.sleep(900);
      await b.screenshot(path.join(DIR, id + '.png'));
    }
    rep.steps.morph = await b.eval(
      `JSON.stringify((() => { let m = null; game.playerCharacter.root.traverse((o) => { if (!m && o.morphTargetInfluences && /LOD0/.test(o.name + (o.parent?.name || ''))) m = o; }); return m && { dict: m.morphTargetDictionary, inf: m.morphTargetInfluences }; })())`,
    );
    log('morph', rep.steps.morph);
    // the sequence: spring offsets sampled every 50 ms (cm: chest, glutes, hair) with the phase
    await b.eval(
      `window.__seq = []; window.__phase = 'idle'; window.__seqT = setInterval(() => { const J = game.playerCharacter.jiggle; window.__seq.push([window.__phase].concat(J.peak.map((x) => +x.toFixed(2)))); }, 50); true`,
    );
    await b.eval(
      orbit(Math.PI / 2 + 0.4, 3.0, 1.25, 1.0).replace(
        'const a = P.heading',
        'const a = P.heading',
      ),
    );
    const seq = async (phase, keys, ms, shots) => {
      await b.eval(`window.__phase = '${phase}'; true`);
      for (const k of keys) await b.key(k, true, k);
      for (let i = 0; i < shots; i++) {
        await b.sleep(ms / shots);
        await b.screenshot(path.join(DIR, `seq_${phase}_${i}.png`));
      }
      for (const k of keys) await b.key(k, false, k);
    };
    await seq('walk', ['KeyW'], 1800, 3);
    await seq('run', ['KeyW', 'ShiftLeft'], 1800, 3);
    await b.eval(`window.__phase = 'stop'; true`);
    await b.sleep(1200);
    await b.eval(`window.__phase = 'jump'; true`);
    await b.key('Space', true, ' ');
    await b.sleep(100);
    await b.key('Space', false, ' ');
    for (let i = 0; i < 3; i++) {
      await b.sleep(i === 0 ? 520 : 90);
      await b.screenshot(path.join(DIR, `seq_land_${i}.png`));
    }
    await b.sleep(1200);
    await b.eval(
      `window.__phase = 'hit'; (() => { const G = game.gameplay?.G; if (G?.damagePlayer) G.damagePlayer(6, { kind: 'punch' }); })(); true`,
    );
    for (let i = 0; i < 3; i++) {
      await b.sleep(90);
      await b.screenshot(path.join(DIR, `seq_hit_${i}.png`));
    }
    await b.sleep(1000);
    rep.steps.seq = JSON.parse(
      await b.eval(`clearInterval(window.__seqT); JSON.stringify(window.__seq)`),
    );
    const by = {};
    for (const [ph, c, g, h] of rep.steps.seq) {
      const e = (by[ph] ||= [0, 0, 0]);
      e[0] = Math.max(e[0], c);
      e[1] = Math.max(e[1], g);
      e[2] = Math.max(e[2], h);
    }
    rep.steps.seqMax = by;
    log('seq max cm (chest, glutes, hair)', JSON.stringify(by));
    await b.eval('game.cameraOverride = null; true');
  }
  if (want('jiggle')) {
    // secondary motion: the painted masks (exaggerated fixed offsets), then a jump landing and a hit, close up
    if ((await b.eval('game.characters.active.id')) !== 'mari') {
      await b.eval(`window.__sw = game.characters.switchTo('mari'); true`);
      await b.waitFor('!game.characters.busy', 40);
    }
    await b.waitFor('!!game.playerCharacter.jiggle', 20);
    await b.eval(
      `game.timeOfDay = 12; game.playerCharacter.jiggle.debug = [[0, 0, 0.06], [0, 0, -0.06], [0.1, -0.05, -0.08]]; true`,
    );
    await b.eval(orbit(Math.PI / 2, 2.6, 1.25, 1.05));
    await b.sleep(900);
    await b.screenshot(path.join(DIR, 'jiggle_mask_side.png'));
    await b.eval(orbit(Math.PI, 2.4, 1.3, 1.1));
    await b.sleep(700);
    await b.screenshot(path.join(DIR, 'jiggle_mask_back.png'));
    await b.eval(`game.playerCharacter.jiggle.debug = null; true`);
    await b.sleep(1500);
    await b.eval(orbit(Math.PI / 2 + 0.35, 2.6, 1.2, 1.0));
    // jump: sample the spring peaks every 60 ms, frames around the landing
    await b.eval(
      `window.__jig = []; window.__jigT = setInterval(() => { const J = game.playerCharacter.jiggle; window.__jig.push(J.peak.map((x) => +x.toFixed(2)).concat([+game.player.position.y.toFixed(2)])); }, 60); true`,
    );
    await b.key('Space', true, ' ');
    await b.sleep(120);
    await b.key('Space', false, ' ');
    for (let i = 0; i < 6; i++) {
      await b.sleep(i < 2 ? 260 : 110);
      await b.screenshot(path.join(DIR, `jump_${i}.png`));
    }
    await b.sleep(900);
    // hit: a punch from the front
    await b.eval(
      `(() => { const G = game.gameplay?.G; if (G?.damagePlayer) G.damagePlayer(6, { kind: 'punch' }); else game.combat?.damage?.({ kind: 'player' }, 6, new game.THREE.Vector3(0, 0, -1), 'melee'); })(); true`,
    );
    for (let i = 0; i < 3; i++) {
      await b.sleep(120);
      await b.screenshot(path.join(DIR, `hit_${i}.png`));
    }
    await b.sleep(800);
    rep.steps.jiggle = await b.eval(`clearInterval(window.__jigT); JSON.stringify(window.__jig)`);
    log('jiggle peaks (cm chest, glutes, hair, y)', rep.steps.jiggle);
    await b.eval('game.cameraOverride = null; true');
  }
  if (want('phone')) {
    // the phone: Contacts -> Vale -> call (scripted lines on the call screen)
    if (!(await b.eval('game.phone.open'))) await b.eval('game.phone.toggle(); true');
    await b.sleep(700);
    await b.eval(`game.phone.openApp('phone'); true`);
    await b.sleep(900);
    await b.eval(`document.querySelector('[data-act="c"][data-id="vale"]')?.click(); true`);
    await b.sleep(700);
    rep.steps.callBtn = await b.eval(
      `(() => { const el = [...document.querySelectorAll('[data-act="call"]')].pop(); el?.click(); return !!el; })()`,
    );
    await b.sleep(4200);
    await b.screenshot(path.join(DIR, 'phone_call.png'));
    rep.steps.callLine = await b.eval(`document.querySelector('.ph-line')?.textContent || null`);
    log('phone call', rep.steps.callBtn, rep.steps.callLine);
    await b.sleep(6000);
    await b.eval('if (game.phone.open) game.phone.toggle(); true');
  }
  if (want('wheel')) {
    await b.key('KeyO', true, 'o');
    await b.sleep(700);
    await b.screenshot(path.join(DIR, 'wheel.png'));
    rep.steps.wheel = await b.eval(`!!document.getElementById('sl-char-wheel')`);
    await b.key('KeyO', false, 'o');
    await b.sleep(400);
    await b.waitFor('!game.characters.busy', 40);
    rep.steps.wheelAfter = await b.eval('JSON.stringify(game.characters.active)');
    log('wheel', rep.steps.wheel, rep.steps.wheelAfter);
  }
  if (want('cost')) {
    // frame cost of the characters tick (the other character idle, near and far)
    rep.steps.cost =
      await b.eval(`new Promise((res) => { const U = game.updaters, i = U.findIndex((f) => f.name === 'charactersTick'), f = U[i];
      let n = 0, t = 0; U[i] = (dt) => { const a = performance.now(); f(dt); t += performance.now() - a; n++; };
      setTimeout(() => { U[i] = f; res(JSON.stringify({ frames: n, msPerFrame: +(t / Math.max(1, n)).toFixed(4), d: game.characters.debug() })); }, 3000); })`);
    log('cost', rep.steps.cost);
  }
  rep.errors = b.errors.slice(0, 20);
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 10));
});
fs.writeFileSync(path.resolve('docs/v2/reports/mari-test.json'), JSON.stringify(rep, null, 1));
