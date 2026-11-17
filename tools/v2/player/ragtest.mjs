#!/usr/bin/env node
// Player ragdoll test (PLAYER helper): a real car driven into Nico at ~32 km/h on his street, and a 7 m fall beside his
// deck; side camera, shots through impact, lying still and the get-up; logs the ragdoll phase timeline.
//   node tools/v2/player/ragtest.mjs --set r1 [--kmh 32] -> docs/v2/shots/player/<set>_<case>_<n>.jpg, docs/v2/reports/player-rag-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'r';
const DIR = path.resolve('docs/v2/shots/player'); fs.mkdirSync(DIR, { recursive: true });
const lim = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const rep = { set: SET, cases: {} };
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  const ev = (e) => lim(b.eval(e), 60000);
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 400);
  await startGame(b);
  await ev(`(() => { game.timeExternal = true; game.timeOfDay = 11; window.__log = []; game.on('playerRagdoll', (e) => window.__log.push(['start', e.kind, e.lethal, +game.clock.elapsed.toFixed(2)]));
    game.updaters.push(() => { const ph = game.playerRagdoll?.phase || null; if (ph !== window.__ph) { window.__log.push(['phase', ph, +game.clock.elapsed.toFixed(2)]); window.__ph = ph; } });
    window.__cam = (eye, look) => { game.cameraOverride = (dt, cam) => { const e = typeof eye === 'function' ? eye() : eye, l = typeof look === 'function' ? look() : look; cam.position.set(e.x, e.y, e.z); cam.lookAt(l.x, l.y, l.z); return true; }; };
    return 1; })()`);
  const shoot = async (name) => { try { await lim(b.screenshot(path.join(DIR, `${SET}_${name}.jpg`), { format: 'jpeg', quality: 88 }), 45000); } catch (e) { console.log('shot failed', name); } };
  // ---- 1) car hit on Pelican Point Ln (in front of the house)
  const carInfo = await ev(`(() => { const T = game.THREE, H = game.nicoHouse, P = game.player;
    const e = game.city.roadGraph.nearestEdge(H.spot.x, H.spot.z, {}, 120); const d = e.dir, n = { x: d.z, z: -d.x }, p = e.point;
    const px = p.x + d.x * 6, pz = p.z + d.z * 6; game.teleport(px, undefined, pz, Math.atan2(n.x, n.z)); P.health = 100;
    const gy = game.city.groundHeightAt(px, pz) || 0;
    const sx = px - d.x * 16, sz = pz - d.z * 16;
    const v = game.vehicles.spawn('sedan', new T.Vector3(sx, gy + 0.6, sz), Math.atan2(d.x, d.z), {}); window.__car = v;
    window.__hitP = { x: px, z: pz, gy }; window.__cam({ x: px + n.x * 7.5 + d.x * 1.5, y: gy + 2.1, z: pz + n.z * 7.5 + d.z * 1.5 }, () => ({ x: game.player.position.x, y: game.player.position.y + 0.8, z: game.player.position.z }));
    return JSON.stringify({ car: !!v, road: e.edge?.name }); })()`);
  console.log('car setup', carInfo);
  await b.sleep(2500);
  const kmh = +(o.kmh || 32);
  await ev(`(() => { const v = window.__car; if (!v?.body) return 0; const P = window.__hitP; const p0 = v.body.translation(); const dx = P.x - p0.x, dz = P.z - p0.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, sp = ${kmh} / 3.6;
    let t = 0; game.updaters.push((dt) => { t += dt; if (t > 2.6 || !v.body) return; const lv = v.body.linvel(); v.body.wakeUp(); v.body.setLinvel({ x: ux * sp * (t < 2.0 ? 1 : 0.3), y: lv.y, z: uz * sp * (t < 2.0 ? 1 : 0.3) }, true); }); return 1; })()`);
  // wait for the impact, then shots along the timeline
  for (let i = 0; i < 40; i++) { if (await ev('!!game.playerRagdoll?.active')) break; await b.sleep(100); }
  await b.sleep(150); await shoot('car_0_impact');
  await b.sleep(500); await shoot('car_1_air');
  await b.sleep(1300); await shoot('car_2_down');
  for (let i = 0; i < 80; i++) { if ((await ev('game.playerRagdoll?.phase || "none"')) !== 'rag') break; await b.sleep(150); }
  await b.sleep(700); await shoot('car_3_getup');
  await b.sleep(1300); await shoot('car_4_getup2');
  await b.sleep(1500); await shoot('car_5_up');
  rep.cases.car = JSON.parse(await ev(`JSON.stringify({ log: window.__log, health: game.player.health, phase: game.playerRagdoll?.phase || null, pos: game.player.position.toArray().map((x) => +x.toFixed(2)) })`));
  console.log('car', JSON.stringify(rep.cases.car));
  // ---- 2) 7 m fall beside Nico's deck (into the yard on the west side)
  await ev(`(() => { window.__log = []; game.player.health = 100; game.playerRagdoll?.release?.(); const T = game.THREE, H = game.nicoHouse, P = game.player;
    const g = H.toWorld(new T.Vector3(-12.5, 0, -9.0)); game.teleport(g.x, undefined, g.z, 0); return 1; })()`);
  await b.sleep(2500);
  await ev(`(() => { const T = game.THREE, H = game.nicoHouse, P = game.player; const g = H.toWorld(new T.Vector3(-12.5, 0, -9.0)); const deck = H.toWorld(new T.Vector3(-8.6, 3.0, -5.0));
    window.__cam({ x: g.x + (g.x - deck.x) * 0.9 + 3, y: g.y + 4.0, z: g.z + (g.z - deck.z) * 0.9 + 3 }, () => ({ x: game.player.position.x, y: game.player.position.y + 0.8, z: game.player.position.z }));
    P.body.setTranslation({ x: g.x, y: g.y + 7.0 + P.capsule.center, z: g.z }, true); P.state.grounded = false; return 1; })()`);
  await b.sleep(400); await shoot('fall_0_air');
  for (let i = 0; i < 40; i++) { if (await ev('!!game.playerRagdoll?.active')) break; await b.sleep(80); }
  await b.sleep(250); await shoot('fall_1_land');
  await b.sleep(1500); await shoot('fall_2_down');
  for (let i = 0; i < 80; i++) { if ((await ev('game.playerRagdoll?.phase || "none"')) !== 'rag') break; await b.sleep(150); }
  await b.sleep(900); await shoot('fall_3_getup');
  await b.sleep(2200); await shoot('fall_4_up');
  rep.cases.fall = JSON.parse(await ev(`JSON.stringify({ log: window.__log, health: +game.player.health.toFixed(1), phase: game.playerRagdoll?.phase || null })`));
  console.log('fall', JSON.stringify(rep.cases.fall));
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 20); console.log('ERRORS', rep.errors.join('\n')); }
});
fs.writeFileSync(`docs/v2/reports/player-rag-${SET}.json`, JSON.stringify(rep, null, 2));
