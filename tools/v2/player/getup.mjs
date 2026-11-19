#!/usr/bin/env node
// Player get-up strip (PLAYER helper): knocks Nico down in his yard (a 6 m fall and a car-style shove), then takes a frame
// every ~0.3 s from a side camera through lying still and the get-up, with the phase / game time on each frame.
//   node tools/v2/player/getup.mjs --set g1 [--cases fall,shove] -> docs/v2/shots/player/getup/<set>_<case>_<nn>.jpg + <set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'g';
const DIR = path.resolve('docs/v2/shots/player/getup');
fs.mkdirSync(DIR, { recursive: true });
const CASES = String(o.cases || 'fall,shove').split(',');
const N = +(o.frames || 16);
const lim = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const rep = { set: SET, cases: {} };
await withBrowser({ width: 960, height: 540, maxSeconds: 280 }, async (b) => {
  const ev = (e) => lim(b.eval(e), 60000);
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q ? '&' + o.q : ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  await startGame(b);
  await ev(`(() => { game.timeExternal = true; game.timeOfDay = 11; window.__log = [];
    game.updaters.push(() => { const ph = game.playerRagdoll?.phase || null; if (ph !== window.__ph) { window.__log.push([ph, +game.clock.elapsed.toFixed(2)]); window.__ph = ph; } });
    window.__cam = (eye) => { game.cameraOverride = (dt, cam) => { const p = game.player.position; cam.position.set(p.x + eye.x, p.y + eye.y, p.z + eye.z); cam.lookAt(p.x, p.y + 0.5, p.z); return true; }; };
    const BN = ['Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Hips'], prev = {}, V = new game.THREE.Vector3();
    window.__pop = { max: 0, at: null, upT: null };
    game.updaters.push((dt) => { const c = game.playerCharacter; if (!c?.getBone) return; const ph = game.playerRagdoll?.phase || null;
      if (ph === 'getup' && window.__pop.upT === null) window.__pop.upT = game.clock.elapsed;
      for (const n of BN) { const b = c.getBone(n); if (!b) continue; b.getWorldPosition(V); const q = prev[n];
        // per-frame bone jump (m/s) in the 0.6 s around the hand-off to the get-up clip, and in the first 3 s of standing
        if (q && window.__pop.upT !== null && game.clock.elapsed - window.__pop.upT < 4) { const dd = V.distanceTo(q), sp = dd / Math.max(dt, 1 / 30); if (sp > window.__pop.max) { window.__pop.max = +sp.toFixed(2); window.__pop.at = [n, +(game.clock.elapsed - window.__pop.upT).toFixed(2), +dd.toFixed(3), +dt.toFixed(3)]; } }
        prev[n] = (q || new game.THREE.Vector3()).copy(V); } });
    return 1; })()`);
  for (const cs of CASES) {
    await ev(`(() => { window.__log = []; window.__ph = null; window.__pop = { max: 0, at: null, upT: null }; const T = game.THREE, H = game.nicoHouse, P = game.player; P.health = 100; game.playerRagdoll?.release?.();
      const e = game.city.roadGraph.nearestEdge(H.spot.x, H.spot.z, {}, 120); const d = e.dir; const g = { x: e.point.x + d.x * 10, z: e.point.z + d.z * 10 };
      g.y = game.city.groundHeightAt(g.x, g.z) || 0; game.teleport(g.x, undefined, g.z, Math.atan2(d.x, d.z)); window.__g = g; window.__n = { x: d.z, z: -d.x, dx: d.x, dz: d.z }; return 1; })()`);
    await b.sleep(2000);
    await ev(`(() => { const P = game.player, g = window.__g; const n = window.__n; window.__cam({ x: n.x * 3.0 + n.dx * 0.6, y: 1.0, z: n.z * 3.0 + n.dz * 0.6 });
      if ('${cs}' === 'fall') { P.body.setTranslation({ x: g.x, y: g.y + 6.0 + P.capsule.center, z: g.z }, true); P.state.grounded = false; }
      else if ('${cs}' === 'back') game.playerRagdoll.trigger('test', { ragKind: 'car', vel: { x: -Math.sin(P.heading) * 4, y: 1.4, z: -Math.cos(P.heading) * 4 }, spin: 0, strength: 0.3, point: P.position.clone().setY(P.position.y + 1.45), impulse: new game.THREE.Vector3(-Math.sin(P.heading) * 45, 0, -Math.cos(P.heading) * 45) });
      else game.playerRagdoll.trigger('test', { ragKind: 'car', vel: { x: window.__n.dx * 5, y: 1.6, z: window.__n.dz * 5 }, spin: 1.2, strength: 0.5, point: P.position.clone().setY(P.position.y + 0.9) });
      return 1; })()`);
    for (let i = 0; i < 40; i++) {
      if (await ev('!!game.playerRagdoll?.active')) break;
      await b.sleep(80);
    }
    const frames = [];
    for (let i = 0; i < 60 && frames.length < N; i++) {
      const st = JSON.parse(
        await ev(
          `JSON.stringify({ ph: game.playerRagdoll?.phase || 'none', t: +game.clock.elapsed.toFixed(2) })`,
        ),
      );
      const f = path.join(DIR, `${SET}_${cs}_${String(frames.length).padStart(2, '0')}.jpg`);
      try {
        await lim(b.screenshot(f, { format: 'jpeg', quality: 80 }), 30000);
        frames.push(st);
      } catch (e) {
        console.log('shot failed');
      }
      if (st.ph === 'none' && frames.length > 3) break;
      await b.sleep(+(o.gap || 220));
    }
    rep.cases[cs] = {
      log: JSON.parse(await ev('JSON.stringify(window.__log)')),
      pop: JSON.parse(await ev('JSON.stringify(window.__pop)')),
      face: await ev('game.playerCharacter?.__face || null'),
      frames,
    };
    console.log(cs, JSON.stringify(rep.cases[cs]));
  }
  fs.writeFileSync(path.join(DIR, `${SET}.json`), JSON.stringify(rep, null, 1));
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 8));
});
