#!/usr/bin/env node
// r4-anim check: car exit frame sequences (coupe4, sedan5, truck9, sedan5 with the driver door blocked), a kneeling NPC and
// walking feet (planted-foot skate speed, NPC + Nico), in one session per flag set.
//   node tools/v2/anim/r4-shots.mjs --tag after            (flags on: default)
//   node tools/v2/anim/r4-shots.mjs --tag before --q '&r4exit=0&r4gait=0&r4kneel=0'
// Frames: docs/v2/shots/anim/r4/<tag>_<case>_<i>.jpg ; report: docs/v2/reports/r4-anim-<tag>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 'after',
  Q = o.q || '';
const AT = String(o.at || '407,-110')
  .split(',')
  .map(Number);
const DIR = 'docs/v2/shots/anim/r4';
fs.mkdirSync(DIR, { recursive: true });
const CASES = String(o.cases || 'coupe4,sedan5,truck9,sedan5:blocked').split(',');
const SKIP = new Set(String(o.skip || '').split(','));
const rep = { tag: TAG, q: Q, exit: {}, kneel: null, walk: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await withBrowser({ width: 960, height: 600, maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + Q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`,
  );
  await sleep(8000);
  for (let i = 0; i < 40; i++) {
    const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
    if (q < 3) break;
    await sleep(1000);
  }
  // an open spot near AT (no collider within ~7 m around at 1 m height), so the outside cameras see the car
  const open = JSON.parse(
    await b.eval(`JSON.stringify((() => { const R = game.RAPIER, W = game.world, p0 = game.player.position; let best = null;
    for (let r = 0; r <= 40 && !best; r += 4) for (let k = 0; k < Math.max(1, r * 1.5) && !best; k++) { const a = k / Math.max(1, r * 1.5) * 6.283; const x = p0.x + Math.cos(a) * r, z = p0.z + Math.sin(a) * r;
      const y = game.city?.groundHeightAt?.(x, z, p0.y + 2) ?? p0.y; let clear = true;
      for (let j = 0; j < 12 && clear; j++) { const b = j / 12 * 6.283; const h = W.castRay(new R.Ray({ x, y: y + 1, z }, { x: Math.cos(b), y: 0, z: Math.sin(b) }), 7.5, true); if (h) clear = false; }
      if (clear) best = { x, y, z }; }
    best = best || { x: p0.x, y: p0.y, z: p0.z }; game.teleport(best.x - 6, undefined, best.z - 3, 0); return best; })())`),
  );
  const base = { x: open.x - 6, y: open.y, z: open.z - 3 };
  rep.open = open;
  console.log('open spot', JSON.stringify(open));
  await sleep(3000);
  // ---------------------------------------------------------------- exits
  for (const cs of CASES) {
    if (SKIP.has('exit')) break;
    const [key, mod] = cs.split(':');
    const name = key + (mod ? '-' + mod : '');
    const r = await b.eval(`(async () => {
      for (const v of window.__cars || []) { try { game.vehicles.remove(v); } catch (e) {} } window.__cars = [];
      const v = await game.vehicles.spawnParked('${key}', { x: ${base.x} + 6, z: ${base.z} + 3, heading: 0 });
      if (!v) return JSON.stringify({ err: 'no car' }); window.__cars.push(v); window.__cv = v;
      if ('${mod || ''}' === 'blocked') { const w = await game.vehicles.spawnParked('van1', { x: ${base.x} + 6 + 2.6, z: ${base.z} + 3, heading: 0 }) || await game.vehicles.spawnParked('suv2', { x: ${base.x} + 6 + 2.6, z: ${base.z} + 3, heading: 0 }); if (w) { window.__cars.push(w); window.__blk = w.mesh.position.clone(); } }
      return JSON.stringify({ key: v.typeKey, blocker: window.__blk ? window.__blk.toArray().map((x) => +x.toFixed(1)) : null, car: v.mesh.position.toArray().map((x) => +x.toFixed(1)) }); })()`);
    console.log(name, r);
    await sleep(1500);
    await b.eval(
      `(() => { const v = window.__cv; const t = v.mesh.position; game.teleport(t.x + ${mod === 'blocked' ? -2.3 : 2.3}, undefined, t.z, 0); return 1; })()`,
    );
    await sleep(900);
    await b.eval('(game.enterVehicle(window.__cv), 1)');
    await sleep(1800);
    // fixed camera outside the exit door, 3/4 front, in the car's frame
    const side = mod === 'blocked' ? -1 : 1;
    await b.eval(`(() => { const T = game.player.position.constructor; const v = window.__cv; const sh = v.car.shell; const a = v.seatAnchor(0);
      game.cameraOverride = (dt, cam) => { sh.updateWorldMatrix(true, false); cam.position.copy(sh.localToWorld(new T(${side} * 4.6, 1.45, a.hip.z + 3.2))); cam.lookAt(sh.localToWorld(new T(${side} * 1.2, 0.85, a.hip.z - 0.1))); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
    await sleep(500);
    await b.eval('(window.__exitSlow = 0.18, 1)');
    await b.screenshot(`${DIR}/${TAG}_${name}_0.jpg`);
    await b.eval('(game.exitVehicle(), 1)');
    const fr = [];
    for (let i = 1; i <= 7; i++) {
      await sleep(i === 1 ? 250 : 620);
      const st = JSON.parse(
        await b.eval(
          `JSON.stringify({ t: game.playerSeat?.exitT ?? null, ex: !!game.playerSeat?.exiting, script: !!game.player.script })`,
        ),
      );
      st.why = await b.eval('globalThis.__exitWhy || null');
      fr.push(st);
      await b.screenshot(`${DIR}/${TAG}_${name}_${i}.jpg`);
    }
    for (let i = 0; i < 20 && (await b.eval('!!game.playerSeat?.exiting')); i++) await sleep(300);
    const end = JSON.parse(
      await b.eval(`JSON.stringify((() => { const c = game.playerCharacter; const p = c.root.getWorldPosition(new (game.player.position.constructor)()); const v = window.__cv; const l = v.car.shell.worldToLocal(p.clone());
      const f = (n) => c.getBone(n).getWorldPosition(new (game.player.position.constructor)()).y - game.player.position.y;
      return { local: l.toArray().map((x) => +x.toFixed(2)), script: !!game.player.script, feet: [+f('LeftFoot').toFixed(3), +f('RightFoot').toFixed(3)], parentIsScene: c.root.parent === game.scene }; })())`),
    );
    rep.exit[name] = { frames: fr, end };
    console.log('  frames', JSON.stringify(fr), 'end', JSON.stringify(end));
    await b.eval('(window.__exitSlow = 1, game.cameraOverride = null, 1)');
    await sleep(600);
  }
  await b.eval(
    `(() => { for (const v of window.__cars || []) { try { game.vehicles.remove(v); } catch (e) {} } window.__cars = []; game.teleport(${base.x}, undefined, ${base.z}, 0); return 1; })()`,
  );
  await sleep(1500);
  // ---------------------------------------------------------------- kneel + walk (one of the user's people)
  for (let i = 0; i < 30; i++) {
    const n = await b.eval('(game.npc?.peopleStats?.()?.loaded || 0)');
    if (n >= 4) break;
    await sleep(1000);
  }
  const kn = await b.eval(`(async () => { const p = game.player.position; const T = p.constructor;
    const gy = (x, z) => game.city?.groundHeightAt?.(x, z, p.y + 2) ?? p.y;
    const kp = { x: p.x + 3, z: p.z + 4 }; kp.y = gy(kp.x, kp.z);
    const h = game.npc.spawnPosed({ pos: kp, pose: 'kneel', heading: Math.PI / 2, place: 'street' }); if (!h) return 'no kneeler';
    h.character.setPose?.('kneel'); window.__kn = { h, kp };
    const wp = { x: p.x - 4, z: p.z + 9 }; wp.y = gy(wp.x, wp.z);
    const w = game.npc.spawnPosed({ pos: wp, heading: Math.PI / 2, place: 'street', seed: 77 }); if (!w) return 'no walker';
    window.__wk = { h: w, x0: wp.x, z: wp.z, y: wp.y, v: 1.35, t: 0, sk: { d: 0, t: 0, n: 0 }, prev: {} };
    game.updaters.push((dt) => { const W = window.__wk; if (!W || W.stop) return; W.t += dt; const h = W.h; const x = W.x0 + ((W.t * W.v) % 8);
      h.root.position.set(x, gy(x, W.z), W.z); h.root.rotation.y = Math.PI / 2; h.speed = W.v;
      // planted-foot skate: a foot within 2.5 cm of its lowest height this run counts as planted; its horizontal drift is skating
      if (W.t > 1) for (const n of ['LeftToeBase', 'RightToeBase']) { const bn = h.character.getBone?.(n); if (!bn) continue; const q = bn.getWorldPosition(new T()); const y = q.y - h.root.position.y;
        W.minY = Math.min(W.minY ?? 9, y); const pr = W.prev[n];
        if (pr && y < W.minY + 0.025 && pr.y < W.minY + 0.025 && Math.abs(q.x - pr.x) < 0.3) { W.sk.d += Math.hypot(q.x - pr.x, q.z - pr.z); W.sk.t += dt; W.sk.n++; }
        if (pr && y < W.minY + 0.025 && pr.y < W.minY + 0.025 && Math.abs(q.x - pr.x) < 0.3) { const lz = h.root.worldToLocal(q.clone()).z; if (pr.lz !== undefined) { W.lf = W.lf || { d: 0, t: 0 }; W.lf.d += lz - pr.lz; W.lf.t += dt; } W.prev[n] = { x: q.x, z: q.z, y, lz }; continue; }
        W.prev[n] = { x: q.x, z: q.z, y }; } });
    return 'ok'; })()`);
  console.log('npcs', kn);
  if (kn === 'ok') {
    await sleep(2500);
    rep.kneel = JSON.parse(
      await b.eval(`JSON.stringify((() => { const { h, kp } = window.__kn; const c = h.character; const g = (n) => { const bn = c.getBone?.(n); return bn ? +(bn.getWorldPosition(new (game.player.position.constructor)()).y - kp.y).toFixed(3) : null; };
      return { who: c.personMeta?.name || c.npcArch, hands: [g('LeftHand'), g('RightHand')], fingers: [g('LeftHandMiddle1'), g('RightHandMiddle1')], knees: [g('LeftLeg'), g('RightLeg')], ankles: [g('LeftFoot'), g('RightFoot')], toes: [g('LeftToeBase'), g('RightToeBase')], hips: g('Hips') }; })())`),
    );
    console.log('kneel', JSON.stringify(rep.kneel));
    for (const [k, off] of [
      ['side', [0, 0.9, -2.6]],
      ['f34', [2.0, 1.2, -1.8]],
    ]) {
      await b.eval(
        `(() => { const T = game.player.position.constructor; const { kp } = window.__kn; game.cameraOverride = (dt, cam) => { cam.position.set(kp.x + ${off[0]}, kp.y + ${off[1]}, kp.z + ${off[2]}); cam.lookAt(kp.x, kp.y + 0.45, kp.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
      );
      await sleep(600);
      await b.screenshot(`${DIR}/${TAG}_kneel_${k}.jpg`);
    }
    // walker from the side, fixed camera
    await b.eval(
      `(() => { const W = window.__wk; W.sk = { d: 0, t: 0, n: 0 }; game.cameraOverride = (dt, cam) => { cam.position.set(W.x0 + 2.5, W.y + 0.7, W.z - 3.6); cam.lookAt(W.x0 + 2.5, W.y + 0.5, W.z); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; }; return 1; })()`,
    );
    await b.eval('(window.__wk.t = 0.2, 1)');
    for (let i = 0; i < 6; i++) {
      await sleep(i ? 90 : 150);
      await b.screenshot(`${DIR}/${TAG}_walk_${i}.jpg`);
    }
    await sleep(2500);
    const sk = JSON.parse(await b.eval('JSON.stringify(window.__wk.sk)'));
    const lf = JSON.parse(await b.eval('JSON.stringify(window.__wk.lf || null)'));
    rep.walk = {
      npc: {
        who: null,
        footLocalV: lf && lf.t > 0 ? +(lf.d / lf.t).toFixed(3) : null,
        skate: sk.t > 0 ? +(sk.d / sk.t).toFixed(3) : null,
        plantedS: +sk.t.toFixed(2),
        speed: 1.35,
      },
    };
    rep.walk.npc.who = await b.eval(
      'window.__wk.h.character.personMeta?.name || window.__wk.h.character.npcArch',
    );
    await b.eval('(window.__wk.stop = true, game.cameraOverride = null, 1)');
  }
  // Nico walking (W held): planted-foot skate on the player
  {
    await b.eval(`(() => { const T = game.player.position.constructor; const c = game.playerCharacter; window.__nk = { d: 0, t: 0, prev: {}, minY: 9 };
      game.updaters.push((dt) => { const K = window.__nk; if (!K || K.stop) return; for (const n of ['LeftToeBase', 'RightToeBase']) { const bn = c.getBone?.(n); if (!bn) continue; const q = bn.getWorldPosition(new T()); const y = q.y - c.root.position.y; K.minY = Math.min(K.minY, y); const pr = K.prev[n];
        if (pr && y < K.minY + 0.025 && pr.y < K.minY + 0.025 && Math.abs(q.x - pr.x) < 0.3) { K.d += Math.hypot(q.x - pr.x, q.z - pr.z); K.t += dt; } K.prev[n] = { x: q.x, z: q.z, y }; } }); return 1; })()`);
    await b.key('KeyW', true);
    await sleep(1200);
    await b.eval('(window.__nk.d = 0, window.__nk.t = 0, 1)');
    await sleep(2500);
    await b.key('KeyW', false);
    const nk = JSON.parse(await b.eval('JSON.stringify(window.__nk)'));
    rep.walk = rep.walk || {};
    rep.walk.nico = {
      skate: nk.t > 0 ? +(nk.d / nk.t).toFixed(3) : null,
      plantedS: +nk.t.toFixed(2),
    };
    await b.eval('(window.__nk.stop = true, 1)');
  }
  console.log('walk', JSON.stringify(rep.walk));
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 30);
  console.log('errors', JSON.stringify(rep.errors));
});
fs.writeFileSync(`docs/v2/reports/r4-anim-${TAG}.json`, JSON.stringify(rep, null, 1));
