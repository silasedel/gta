#!/usr/bin/env node
// In-game people shots: teleport to a place, let the crowd spawn, then frame real pedestrians with a fixed camera.
//   node tools/v2/npcs/game-shots.mjs --set X [--places downtown,beach,keys] [--close 6] [--wait 25] [--tod 11]
// Per place: a street view (camera 7 m behind the densest group of people) + up to --close close-ups of different
// people (face / body), stats (people vs archetype fallbacks, loaded people). Shots: docs/v2/shots/people/<set>_<place>_*.png
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const PLACES = {
  downtown: { p: [407, -110], tod: 11 }, brickell: { p: [0, 1760], tod: 16 }, beach: { p: [2332, -660], tod: 13 }, ocean: { p: [3430, -300], tod: 15 },
  keys: { p: [-873.6, 4845.2], tod: 11 }, keywest: { p: [-4895, 5940], tod: 11 }, clewiston: { p: [-1540, -2805], tod: 11 }, havana: { p: [-660, -55], tod: 17 },
};
const SET = o.set || 'g';
const only = String(o.places || 'downtown,beach,keys').split(',');
const DIR = 'docs/v2/shots/people'; fs.mkdirSync(DIR, { recursive: true });
const rep = {};
await withBrowser({ width: +(o.w || 1920), height: +(o.h || 1080), maxSeconds: +(o.max || 1400) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; return 1; })()`);
  for (const id of only) {
    const P = PLACES[id] || { p: id.split(':').map(Number), tod: 12 };
    await b.eval(`(() => { game.cameraOverride = null; game.timeOfDay = ${o.tod || P.tod}; game.teleport(${P.p[0]}, undefined, ${P.p[1]}, 0); return 1; })()`);
    await b.sleep(6000);
    for (let i = 0; i < 40; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
    await b.sleep(+(o.wait || 25) * 1000);
    const st = JSON.parse(await b.eval(`JSON.stringify((() => { const L = game.peds.list.filter((p) => p.active && p.char); return { active: L.length, people: L.filter((p) => p.char.human?.person).length, ids: L.filter((p) => p.char.human?.person).map((p) => p.char.npcArch), roles: L.map((p) => p.char.human?.role || (p.char.npcArch ? 'arch:' + p.char.npcArch : 'legacy')), cast: game.npc?.peopleStats?.(), zone: game.city.zoneAt(game.player.position.x, game.player.position.z), district: game.city.districtAt(game.player.position.x, game.player.position.z) }; })())`));
    console.log(id, JSON.stringify(st));
    rep[id] = st;
    // street view: the person with the most neighbors within 12 m, camera 8 m away at eye height looking at them
    await b.eval(`(() => { const L = game.peds.list.filter((p) => p.active && p.char && !p.dead);
      let best = null, bn = -1; for (const p of L) { let n = 0; for (const q of L) if (q !== p && q.pos.distanceTo(p.pos) < 12) n++; if (n > bn) { bn = n; best = p; } }
      if (!best) return 0; window.__focus = best;
      // camera on the same sidewalk, 11 m back along the street, eye height: a clear line of sight to the group
      const t0 = best.pos.clone(); let dx = 0, dz = 1;
      try { const r = game.city.roadGraph.nearestEdge(t0.x, t0.z); const e = r.edge; let bi = 1, bd = 1e9; for (let i = 1; i < e.pts.length; i++) { const d = Math.hypot((e.pts[i][0] + e.pts[i - 1][0]) / 2 - t0.x, (e.pts[i][1] + e.pts[i - 1][1]) / 2 - t0.z); if (d < bd) { bd = d; bi = i; } } dx = e.pts[bi][0] - e.pts[bi - 1][0]; dz = e.pts[bi][1] - e.pts[bi - 1][1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; } catch (e) { /* */ }
      const cx = t0.x - dx * 11, cz = t0.z - dz * 11, cy = (game.city.groundHeightAt(cx, cz, t0.y + 1) ?? t0.y) + 1.7;
      game.cameraOverride = (dt, cam) => { cam.position.set(cx, cy, cz); cam.lookAt(t0.x + dx * 4, t0.y + 1.2, t0.z + dz * 4); return true; };
      return bn; })()`);
    await b.sleep(1500);
    await b.screenshot(`${DIR}/${SET}_${id}_street.png`);
    if (o.cops) {
      // police model hook: officers from the user's people (game.npc.createCop via police.js spawnCop)
      const cs = await b.eval(`(() => { const pp = game.player.position; const out = []; for (let k = 0; k < ${+o.cops}; k++) { const a = k * 1.3; const u = game.police.spawnCop(new THREE.Vector3(pp.x + Math.sin(a) * 7, pp.y, pp.z + Math.cos(a) * 7), a + Math.PI); if (u) { u.mode = 'idle'; out.push((u.char.npcArch || 'legacy') + (u.char.human?.person ? '*' : '')); } } window.__cop = game.police.units.find((u) => u.active); return JSON.stringify(out); })()`.replace('new THREE.Vector3', 'new (game.player.position.constructor)'));
      console.log('  cops', cs);
      await b.eval(`(() => { game.cameraOverride = (dt, cam) => { const t = game.player.position; cam.position.set(t.x + 4, t.y + 2.2, t.z - 9); cam.lookAt(t.x, t.y + 1.1, t.z + 2); return true; }; return 1; })()`);
      await b.sleep(1500);
      await b.screenshot(`${DIR}/${SET}_${id}_police.png`);
    }
    // close-ups: different people, camera 1.9 m in front of them, chest/face height
    const n = +(o.close ?? 4);
    const ids = JSON.parse(await b.eval(`JSON.stringify(game.peds.list.filter((p) => p.active && p.char?.human?.person && !p.dead).map((p) => p.id))`));
    for (let k = 0; k < Math.min(n, ids.length); k++) {
      await b.eval(`(() => { const p = game.peds.list.find((q) => q.id === ${ids[k]}); window.__focus = p;
        game.cameraOverride = (dt, cam) => { const t = window.__focus.pos; const h = window.__focus.root.rotation.y; const fx = Math.sin(h), fz = Math.cos(h);
          cam.position.set(t.x + fx * 2.3 + fz * 0.5, t.y + 1.45, t.z + fz * 2.3 - fx * 0.5); cam.lookAt(t.x, t.y + 1.05, t.z); return true; }; return 1; })()`);
      await b.sleep(900);
      const who = await b.eval(`(() => { const c = window.__focus.char; return c.npcArch + ' ' + (c.personMeta?.name || '') + ' ' + window.__focus.state + ' lod' + c.lodLevel; })()`);
      await b.screenshot(`${DIR}/${SET}_${id}_close${k}.png`);
      console.log('  close', k, who);
    }
    if (o.ragdoll) {
      // knock one of the user's people down (car-hit strength) and film the fall and the ground pose
      const who = await b.eval(`(() => { const p = game.peds.list.find((q) => q.active && !q.dead && q.char?.human?.person && q.pos.distanceTo(game.player.position) < 60); if (!p) return 'none'; window.__rag = p;
        game.cameraOverride = (dt, cam) => { const t = window.__rag.root ? window.__rag.char.getBone('Hips').getWorldPosition(new (game.player.position.constructor)()) : window.__rag.pos; cam.position.set(t.x + 3.2, t.y + 1.6, t.z + 3.2); cam.lookAt(t.x, t.y + 0.2, t.z); return true; };
        game.peds.damage(p, 30, { x: 1, z: 0.3 }, 'car', { impulse: 6000 }); return p.char.npcArch + ' ' + p.state; })()`);
      console.log('  ragdoll', who);
      if (who !== 'none') { await b.sleep(450); await b.screenshot(`${DIR}/${SET}_${id}_rag0.png`); await b.sleep(2200); await b.screenshot(`${DIR}/${SET}_${id}_rag1.png`); }
    }
    await b.eval('(game.cameraOverride = null, 1)');
  }
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 30).join('\n'));
});
fs.writeFileSync(`docs/v2/reports/people-shots-${SET}.json`, JSON.stringify(rep, null, 1));
