#!/usr/bin/env node
// Player-vs-parked-car physics (PLAYER helper): stand on a parked car's roof, walk across and drop off, then run and
// jump onto a hood. Logs per frame: player speed / height, the car's velocity, every 'hit' the player takes, ragdolls,
// overlap rescues. Any launch (player speed > 9 m/s, a 'hit' from the car he stands on, a rescue jump) is a failure.
//   node tools/v2/player/cartest.mjs --set c1 -> docs/v2/reports/player-cartest-<set>.json, shots docs/v2/shots/player/<set>_*.jpg
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'c';
const DIR = path.resolve('docs/v2/shots/player');
const lim = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const rep = { set: SET, phases: {} };
await withBrowser({ width: 1280, height: 720, maxSeconds: 700 }, async (b) => {
  const ev = (e) => lim(b.eval(e), 60000);
  const shoot = async (n) => { try { await lim(b.screenshot(path.join(DIR, `${SET}_${n}.jpg`), { format: 'jpeg', quality: 86 }), 45000); } catch (e) { console.log('shot failed', n); } };
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 400);
  await startGame(b);
  // a parked car near the house that nobody drives, with open ground around it
  const setup = await ev(`(() => { game.timeExternal = true; game.timeOfDay = 11; const P = game.player, T = game.THREE, H = game.nicoHouse;
    const cars = (game.vehicles?.list || []).filter((v) => v.body && !v.ai && !v.playerDriven && !v.disposed && !v.boat && v.spec);
    cars.sort((x, y) => { const a = x.body.translation(), b = y.body.translation(); return Math.hypot(a.x - H.spot.x, a.z - H.spot.z) - Math.hypot(b.x - H.spot.x, b.z - H.spot.z); });
    const v = cars[0]; if (!v) return JSON.stringify({ err: 'no parked car' }); window.__car = v;
    const L = window.__log = { frames: [], hits: [], events: [], warn: [] };
    game.on('hit', (e) => { if (e?.target === 'player') L.hits.push({ kind: e.kind, dmg: +(e.damage || 0).toFixed(1), own: e.object === v, t: +game.clock.elapsed.toFixed(2) }); });
    game.on('playerRagdoll', (e) => L.events.push(['ragdoll', e.kind, +game.clock.elapsed.toFixed(2)]));
    const cw = console.warn.bind(console), ci = console.info.bind(console);
    console.info = (...m) => { if (/freed from overlap|fell below/.test(String(m[0]))) L.warn.push([String(m[0]), +game.clock.elapsed.toFixed(2)]); ci(...m); };
    console.warn = (...m) => { if (/fell below|freed/.test(String(m[0]))) L.warn.push([String(m[0]), +game.clock.elapsed.toFixed(2)]); cw(...m); };
    let prev = null;
    game.updaters.push(function carTestRec(dt) { if (!window.__rec) return; const p = P.position, lv = v.body.linvel(), t = v.body.translation();
      const sp = prev && dt > 0 ? Math.hypot(p.x - prev.x, p.z - prev.z) / dt : 0; prev = p.clone();
      L.frames.push([+game.clock.elapsed.toFixed(2), window.__rec, +sp.toFixed(2), +p.y.toFixed(2), +Math.hypot(lv.x, lv.y, lv.z).toFixed(2), +(t.y).toFixed(2), P.state.grounded ? 1 : 0]); });
    const t = v.body.translation(); return JSON.stringify({ car: v.name || v.typeKey, at: [+t.x.toFixed(1), +t.y.toFixed(2), +t.z.toFixed(1)], type: v.body.isDynamic() ? 'dynamic' : v.body.isKinematic() ? 'kinematic' : 'fixed', sleeping: v.body.isSleeping() }); })()`);
  console.log('setup', setup); rep.setup = JSON.parse(setup); if (rep.setup.err) return;
  const camOn = `(() => { const v = window.__car, T = game.THREE; game.cameraOverride = (dt, cam) => { const t = v.body.translation(), r = v.body.rotation(), q = new T.Quaternion(r.x, r.y, r.z, r.w), left = new T.Vector3(1, 0, 0).applyQuaternion(q);
      cam.position.set(t.x + left.x * 6.5, t.y + 2.6, t.z + left.z * 6.5); cam.lookAt(t.x, t.y + 1.0, t.z); return true; }; return 1; })()`;
  await ev(camOn);
  // ---- 1) stand on the roof, walk across along the car and step off the end
  await ev(`(() => { const P = game.player, v = window.__car, R = game.RAPIER, W = game.world, T = game.THREE; const t = v.body.translation(), r = v.body.rotation(), q = new T.Quaternion(r.x, r.y, r.z, r.w), fwd = new T.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const hit = W.castRay(new R.Ray({ x: t.x, y: t.y + 4, z: t.z }, { x: 0, y: -1, z: 0 }), 6, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.collider); const top = hit ? t.y + 4 - hit.timeOfImpact : t.y + 1.5;
    window.__top = top; P.body.setTranslation({ x: t.x, y: top + P.capsule.center + 0.05, z: t.z }, true); P.position.set(t.x, top, t.z); P.heading = Math.atan2(fwd.x, fwd.z); game.cameraYaw = P.heading + Math.PI; window.__rec = 'roof'; return 1; })()`);
  await b.sleep(2200); await shoot('roof_stand');
  await b.key('KeyW', true); await b.sleep(900); await shoot('roof_walk'); await b.sleep(1600); await b.key('KeyW', false); await b.sleep(1500); await shoot('roof_off');
  // ---- 2) run at the side of the car and jump onto the hood / roof, stand, jump off the other side
  await ev(`(() => { const P = game.player, v = window.__car, T = game.THREE; const t = v.body.translation(), r = v.body.rotation(), q = new T.Quaternion(r.x, r.y, r.z, r.w), left = new T.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize(), fwd = new T.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    const s = new T.Vector3(t.x, 0, t.z).addScaledVector(left, 3.2).addScaledVector(fwd, 0.9); game.teleport(s.x, undefined, s.z, Math.atan2(-left.x, -left.z)); game.cameraYaw = Math.atan2(-left.x, -left.z) + Math.PI; window.__rec = 'jump'; return 1; })()`);
  await b.sleep(1800);
  await b.key('KeyW', true); await b.sleep(330); await b.key('Space', true, ' '); await b.sleep(80); await b.key('Space', false, ' ');
  await b.sleep(350); await shoot('jump_air'); await b.sleep(500); await b.key('KeyW', false); await shoot('jump_on');
  await b.sleep(1500); await shoot('jump_stand');
  await b.key('KeyW', true); await b.sleep(250); await b.key('Space', true, ' '); await b.sleep(80); await b.key('Space', false, ' '); await b.sleep(1200); await b.key('KeyW', false); await b.sleep(1200); await shoot('jump_off');
  const res = JSON.parse(await ev(`(() => { const L = window.__log; window.__rec = null; const by = {};
    for (const f of L.frames) { const k = f[1]; const s = by[k] ||= { frames: 0, maxSpeed: 0, maxCarVel: 0, minY: 1e9, maxY: -1e9, carYRange: [1e9, -1e9] }; s.frames++; s.maxSpeed = Math.max(s.maxSpeed, f[2]); s.maxCarVel = Math.max(s.maxCarVel, f[4]); s.minY = Math.min(s.minY, f[3]); s.maxY = Math.max(s.maxY, f[3]); s.carYRange = [Math.min(s.carYRange[0], f[5]), Math.max(s.carYRange[1], f[5])]; }
    return JSON.stringify({ by, hits: L.hits, events: L.events, warn: L.warn, top: window.__top, launches: L.frames.filter((f) => f[2] > 9).length, spikes: L.frames.filter((f) => f[2] > 7).slice(0, 12) }); })()`));
  rep.result = res; console.log(JSON.stringify(res));
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 12);
});
fs.writeFileSync(`docs/v2/reports/player-cartest-${SET}.json`, JSON.stringify(rep, null, 2));
