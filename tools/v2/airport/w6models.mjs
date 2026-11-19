#!/usr/bin/env node
// W6 models pass check: the base (gate: booth / guard post / watchtower / chicane, fighters, C-130, cargo jet, Black Hawk,
// guards up close), the Keys tour helicopter, an MIA widebody + guards; shots, draw / triangle counts, console errors.
//   node tools/v2/airport/w6models.mjs [--only base|keys|mia] [--max 280]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
import fs from 'node:fs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const OUT = 'docs/v2/shots/w6models'; fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 280) }, async (b) => {
  const t0 = Date.now(), log = (...x) => console.log(Math.round((Date.now() - t0) / 1000) + 's', ...x);
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  try { await b.waitFor(GAME_READY, 200); } catch (e) { log('NOT READY'); }
  await startGame(b); log('started');
  const ev = async (x) => b.eval(`(async () => { try { return JSON.stringify(await (${x})); } catch (e) { return 'ERR ' + e + ' ' + (e.stack || '').slice(0, 300); } })()`);
  // stand d m from (x, z) on the side `side` (radians), looking at it
  const look = async (name, x, z, d, side, wait = 3500) => {
    await ev(`(() => { const px = ${x} + Math.sin(${side}) * ${d}, pz = ${z} + Math.cos(${side}) * ${d}; game.teleport(px, undefined, pz, 0); return 1; })()`); await b.sleep(wait);
    await ev(`(() => { const P = game.player; P.heading = Math.atan2(${x} - P.position.x, ${z} - P.position.z); game.cameraYaw = P.heading + Math.PI; return 1; })()`); await b.sleep(1200);
    await b.screenshot(`${OUT}/${name}.jpg`); log('shot', name);
  };
  const stats = async (tag) => log(tag, await ev(`(() => { const i = game.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, tex: i.memory.textures, geo: i.memory.geometries }; })()`));
  const only = o.only || 'base';
  if (only === 'base') {
    await ev(`game.teleport(-4440, undefined, 6040, -1.4)`);
    await b.waitFor(`game.base && game.base.state === 'live' && game.base.zone && game.base.built?.jets?.length >= 2`, 150).catch(() => log('base not live'));
    await b.sleep(3000); await ev(`(() => { game.player.state.hidden = true; return 1; })()`);
    log('built', await ev(`(() => { const B = game.base.built; return { jets: B.jets.map(j => j.typeKey + '@' + Math.round(j.mesh.position.x) + ',' + Math.round(j.mesh.position.z)), c130: B.c130, cargo: B.cargo, hangars: B.hangars, heli: B.heli && B.heli.typeKey, towers: B.towers, booth: !!B.booth, post: !!B.post }; })()`));
    const G = JSON.parse(await ev(`game.base.built.gate`));
    await look('gate_out', G.x, G.z, 34, Math.atan2(G.ox, G.oz) + 0.35);
    await look('gate_in', G.x, G.z, 26, Math.atan2(-G.ox, -G.oz) - 0.5);
    await stats('gate');
    const J = JSON.parse(await ev(`game.base.built.jets.map(j => ({ k: j.typeKey, x: j.mesh.position.x, z: j.mesh.position.z, h: j.S ? Math.atan2(2 * (j.S.q.w * j.S.q.y), 1 - 2 * j.S.q.y * j.S.q.y) : 0 }))`));
    for (const j of J) await look('jet_' + j.k, j.x, j.z, 16, j.h + 0.9, 2500);
    const C = JSON.parse(await ev(`game.base.built.c130 || null`)); if (C) await look('c130', C.x, C.z, 42, C.heading + 0.8);
    const K = JSON.parse(await ev(`game.base.built.cargo || null`)); if (K) await look('cargo_jet', K.x, K.z, 60, K.heading + 0.8);
    const H = JSON.parse(await ev(`(() => { const h = game.base.built.heli; return h && { x: h.pos.x, z: h.pos.z, h: h.heading }; })()`)); if (H) await look('blackhawk', H.x, H.z, 15, H.h + 0.9);
    const Hq = JSON.parse(await ev(`game.base.built.hangars || null`)); if (Hq?.long) await look('hangar_long', Hq.long.x, Hq.long.z, 95, 0.6); if (Hq?.quonset) await look('hangar_quonset', Hq.quonset.x, Hq.quonset.z, 40, 0.6);
    // the nearest guard, close (skinned figure)
    log('zone', await ev(`({ st: game.base.state, zone: !!game.base.zone })`), JSON.stringify(b.errors.slice(0, 6)).slice(0, 1500));
    const g = JSON.parse(await ev(`(() => { const z = game.base.zone; if (!z) return null; const g = z.guards.find(q => q.post) || z.guards[0]; return { x: g.x, z: g.z, h: g.h }; })()`));
    if (g) await look('guard', g.x, g.z, 3.2, g.h, 3000);
    log('skin', await ev(`(() => { const z = game.base.zone; return z.guards.filter(q => q.slot).length; })()`));
    await stats('guard');
    // fly the F-22 a little: enter, full throttle, brakes off; check it rolls and lifts
    log('enter jet', await ev(`(() => { const A = game.base.built.jets[0]; game.enterVehicle(A); return game.player.state.vehicle === A; })()`));
    await ev(`(() => { window.__fly = setInterval(() => { const A = game.player.state.vehicle; if (A && A.S) { A.S.ctl.throttle = 1; A.S.ctl.brake = 0; } }, 50); return 1; })()`);
    await b.sleep(9000);
    log('roll', await ev(`(() => { const A = game.player.state.vehicle; return A && { kmh: Math.round(A.speedKmh || A.S.vel.length() * 3.6), agl: +(A.S.agl || 0).toFixed(1) }; })()`));
    await b.screenshot(`${OUT}/jet_roll.jpg`);
    await ev(`clearInterval(window.__fly)`);
  }
  if (only === 'keys') {
    await ev(`game.teleport(-1000, undefined, 5180, 0)`);
    await b.waitFor(`game.heli && game.heli.pad.state === 'live' && game.heli.list.length`, 90).catch(() => log('pad not live'));
    await b.sleep(4000);
    const h = JSON.parse(await ev(`(() => { const H = game.heli.pad.heli || game.heli.list[0]; return { x: H.pos.x, z: H.pos.z, h: H.heading, k: H.typeKey, n: H.name }; })()`)); log('heli', h);
    await look('keys_heli', h.x, h.z, 13, h.h + 0.8);
    log('enter', await ev(`(() => { const H = game.heli.pad.heli || game.heli.list[0]; game.enterVehicle(H); return !!game.player.state.vehicle?.heli; })()`));
    await ev(`(() => { window.__k = new Set(['KeyW']); const i = game.input; i.__down = i.down; i.down = (c) => window.__k.has(c) || i.__down(c); })()`);
    await b.sleep(8000);
    log('climb', await ev(`(() => { const H = game.player.state.vehicle; return H && { agl: H.agl.toFixed(1), rotor: H.rotor.toFixed(2) }; })()`));
    await b.screenshot(`${OUT}/keys_heli_fly.jpg`);
    await ev(`(() => { window.__k = new Set(); })()`);
  }
  if (only === 'mia') {
    await ev(`game.teleport(-1380, undefined, 1060, 0)`); await b.sleep(15000);
    const w = JSON.parse(await ev(`(() => { const t = game.airport.traffic; const f = t && t.flights.find(f => f.type === 'wide' || f.ac?.type === 'wide' || /wide/.test(f.ac?.g?.name || f.g?.name || '')); return f ? { x: (f.ac?.g || f.g).position.x, z: (f.ac?.g || f.g).position.z } : null; })()`));
    log('wide', w); if (w) await look('mia_wide', w.x, w.z, 60, 2.2, 3000);
    const g = JSON.parse(await ev(`(() => { const ap = game.airport.list.find(a => a.id === 'mia'); const z = ap?.parts?.zone; const g = z && z.guards[0]; return g && { x: g.x, z: g.z, h: g.h }; })()`));
    log('mia guard', g); if (g) { await ev(`game.player.state.hidden = true`); await look('mia_guard', g.x, g.z, 3.2, g.h, 4000); }
    await stats('mia');
  }
  log('CONSOLE ERRORS', b.errors.length, JSON.stringify([...new Set(b.errors)].slice(0, 12)).slice(0, 2500));
});
