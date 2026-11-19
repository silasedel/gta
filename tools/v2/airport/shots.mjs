#!/usr/bin/env node
// Airports agent review driver: boots the game, goes to an airport, waits until it is built, prints stats and console
// errors, and saves screenshots from preset cameras (docs/v2/shots/airport/<set>/*.jpg).
//   node tools/v2/airport/shots.mjs [--ap mia|eyw] [--set name] [--only aerial,threshold,...] [--night] [--q "&mapbuild=..."]
//   [--js file.js]   (extra page code after the build; its return value is printed)
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const AP = o.ap || 'mia', SET = o.set || 'run', D = `docs/v2/shots/airport/${SET}`; fs.mkdirSync(D, { recursive: true });
const ONLY = o.only ? String(o.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
const DATA = JSON.parse(fs.readFileSync('src/world/airport/airports.json', 'utf8')).airports.find((x) => x.id === AP);
await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 1100) }, async (b) => { try {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY, 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${o.night ? 21.5 : 16.2}; game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(); if (game.police) game.police.enabled = false; return 1; })()`);
  const T = DATA.terminal;
  const lz = -T.depth / 2 - 10, sx = T.x + lz * Math.sin(T.heading), sz = T.z + lz * Math.cos(T.heading);
  await b.eval(`game.teleport(${sx}, undefined, ${sz}, ${T.heading})`);
  await b.waitFor(`game.airport && game.airport.list.find((a) => a.id === '${AP}').state === 'live'`, 240).catch((e) => console.log('WARN build', e.message));
  await b.sleep(6000);
  console.log('STATS', await b.eval(`JSON.stringify({ ap: game.airport.stats(), traffic: game.airport.traffic?.stats(), fps: game.perf?.fps, calls: game.renderer.info.render.calls })`));
  const shot = async (name, wait = 2500) => { await b.sleep(wait); const f = `${D}/${name}.jpg`; await b.screenshot(f); console.log('shot', f); };
  const camAt = (cx, cy, cz, tx, ty, tz, fov = 55) => b.eval(`(() => { game.cameraOverride = (dt, cam) => { cam.position.set(${cx}, ${cy}, ${cz}); cam.up.set(0, 1, 0); cam.lookAt(${tx}, ${ty}, ${tz}); if (cam.fov !== ${fov}) { cam.fov = ${fov}; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
  const rw = DATA.runways.find((r) => r.use === 'airline') || DATA.runways[0];
  const L = Math.hypot(rw.b[0] - rw.a[0], rw.b[1] - rw.a[1]), ux = (rw.b[0] - rw.a[0]) / L, uz = (rw.b[1] - rw.a[1]) / L;
  if (want('aerial')) { await camAt(T.x - 500, 420, T.z + 650, T.x, 0, T.z, 55); await shot('aerial', 5000); }
  if (want('threshold')) { await camAt(rw.a[0] - ux * 150, 30, rw.a[1] - uz * 150, rw.a[0] + ux * 300, 0, rw.a[1] + uz * 300, 50); await shot('threshold', 4000); }
  if (want('terminal')) { const hx = Math.sin(T.heading), hz = Math.cos(T.heading); await camAt(T.x + hx * 140 + hz * 90, 35, T.z + hz * 140 - hx * 90, T.x, 6, T.z, 55); await shot('terminal_apron', 4000); }
  if (want('landside')) { await camAt(sx - Math.sin(T.heading) * 60, 12, sz - Math.cos(T.heading) * 60, T.x, 6, T.z, 60); await shot('landside', 3000); }
  if (want('inside')) { const lx = T.len > 150 ? 62 : 22, lz = 4, c = Math.cos(T.heading), s = Math.sin(T.heading), ix = T.x + lx * c + lz * s, iz = T.z - lx * s + lz * c;
    await b.eval(`game.cameraOverride = null; game.teleport(${ix}, undefined, ${iz}, ${T.heading + Math.PI / 2}); 1`); await shot('inside', 5000);
    const hx = T.x + (lx + 12) * c + (lz - 10) * s, hz = T.z - (lx + 12) * s + (lz - 10) * c, tx = T.x - 10 * c, tz = T.z + 10 * s;
    await camAt(hx, 4.5, hz, tx, 2.5, tz, 65); await shot('inside_hall', 3000); }
  if (want('tower') && DATA.tower) { const t = DATA.tower; await camAt(t.x + 120, 25, t.z + 120, t.x, 40, t.z, 55); await shot('tower', 4000); }
  if (want('gate')) { const st = DATA.stands.find((x) => x.jb); if (st) { const hx = Math.sin(st.heading), hz = Math.cos(st.heading); await camAt(st.x - hx * 30 + hz * 25, 9, st.z - hz * 30 - hx * 25, st.x + hx * 5, 3, st.z + hz * 5, 50); await shot('gate', 3000); } }
  if (want('fence')) { const p = DATA.airside[5]; await camAt(p[0] + 15, 4, p[1] + 15, p[0], 1.5, p[1], 55); await shot('fence', 3000); }
  if (o.climb) {   // fence climb frames from the side
    const r = JSON.parse(await b.eval(`(() => { const A = game.airport.list.find((a) => a.id === '${AP}'), ring = A.ap.airside, k = Math.floor(ring.length / 3), n = A.parts.fence.nearest((ring[k][0] + ring[k + 1][0]) / 2, (ring[k][1] + ring[k + 1][1]) / 2, 30);
      game.cameraOverride = null; game.teleport(n.x + n.nx * 0.7, undefined, n.z + n.nz * 0.7, Math.atan2(-n.nx, -n.nz)); return JSON.stringify(n); })()`));
    await b.sleep(3000);
    await b.eval(`(() => { game.player.heading = Math.atan2(-(${r.nx}), -(${r.nz})); const ok = game.airport.climb.tryClimb(); const n = ${JSON.stringify(r)}; const tx = -n.nz, tz = n.nx; void tz;
      game.cameraOverride = (dt, cam) => { const p = game.player.position; cam.position.set(n.x + tx * 4.2 + n.nx * 1.2, n.y + 2.0, n.z + tz * 4.2 + n.nz * 1.2); cam.up.set(0, 1, 0); cam.lookAt(n.x, p.y + 1.0, n.z); return true; }; return ok; })()`);
    for (const [i, w] of [[0, 300], [1, 500], [2, 500], [3, 450], [4, 500]]) { await b.sleep(w); await b.screenshot(`${D}/climb_${i}.jpg`); }
    console.log('climb shots'); await b.sleep(2000); await b.eval('game.cameraOverride = null; 1');
  }
  if (o.js) console.log('JS', await b.eval(fs.readFileSync(o.js, 'utf8'), 400000));
  if (o.board) {   // walk-in boarding at gate 1: pay, the cut to the take-off, arrival at the other airport, then shots there
    await b.eval(`game.cameraOverride = null; (game.wallet?.earn?.(1000, { memo: 'test' }), 1)`);
    const r = await b.eval(`(async () => { const A = game.airport.list.find((a) => a.id === '${AP}'); const g = A.parts.terminal.gates[0]; game.teleport(g.podium.x, undefined, g.podium.z, 0); await new Promise((r) => setTimeout(r, 2500));
      let arrived = null; game.on?.('airport:arrived', (e) => { arrived = e; }); const p = game.airport.board(A, g); await new Promise((r) => setTimeout(r, 9000)); return JSON.stringify({ started: true, cam: !!game.cameraOverride }); })()`);
    console.log('BOARD', r); await shot('board_takeoff', 0); await b.sleep(6000); await shot('board_climb', 0);
    await b.waitFor(`!game.cameraOverride && game.airport.list.every((a) => true) && Math.hypot(game.player.position.x - ${AP === 'mia' ? -4700 : -1200}, game.player.position.z - ${AP === 'mia' ? 6000 : 1050}) < 600`, 120).catch((e) => console.log('WARN arrive', e.message));
    const other = AP === 'mia' ? 'eyw' : 'mia';
    await b.waitFor(`game.airport.list.find((a) => a.id === '${other}').state === 'live'`, 240).catch((e) => console.log('WARN build2', e.message));
    await b.sleep(5000); await shot('arrived', 0);
    const O = JSON.parse(fs.readFileSync('src/world/airport/airports.json', 'utf8')).airports.find((x) => x.id === other), OT = O.terminal;
    await camAt(OT.x - 260, 160, OT.z + 220, OT.x, 0, OT.z, 55); await shot('other_aerial', 4000);
    const hx = Math.sin(OT.heading), hz = Math.cos(OT.heading); await camAt(OT.x + hx * 90 + hz * 60, 25, OT.z + hz * 90 - hx * 60, OT.x, 4, OT.z, 55); await shot('other_terminal', 3000);
    if (O.tower) { await camAt(O.tower.x + 45, 12, O.tower.z + 45, O.tower.x, 14, O.tower.z, 55); await shot('other_tower', 3000); }
    console.log('STATS2', await b.eval(`JSON.stringify({ ap: game.airport.stats(), traffic: game.airport.traffic?.stats(), wanted: game.wanted?.level })`));
  }
  console.log('PERF', await b.eval(`JSON.stringify({ fps: game.perf?.fps, calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles })`));
  } catch (e) { console.log('SCRIPT ERROR', String(e).slice(0, 600)); }
  console.log('CONSOLE ERRORS', b.errors.length, JSON.stringify([...new Set(b.errors)].slice(0, 12)).slice(0, 3000));
});
