#!/usr/bin/env node
// Seated people check (r2-people item 2): parks library cars in a row, seats one of the user's people as the driver and
// one as the front passenger (src/npc/seat.js on r2-cars' seat anchors), then films each car from outside the driver's
// window, the passenger window and the chase camera. --nico also seats the player (game.enterVehicle) in each car.
//   node tools/v2/npcs/seat-shots.mjs --set s1 [--cars conv1,sedan3,...] [--nico] [--glass 0] [--at 407,-110] [--tod 12]
// Shots: docs/v2/shots/people/r2seat/<set>_<car>_<view>.png ; report: docs/v2/reports/r2-people-<set>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 's';
const CARS = String(o.cars || 'conv1,sedan3,suv2,truck9,hatch1,coupe2,van1,super4,suv12,sedan8').split(',');
const AT = String(o.at || '407,-110').split(',').map(Number);
const DIR = 'docs/v2/shots/people/r2seat'; fs.mkdirSync(DIR, { recursive: true });
const rep = { set: SET, cars: {} };
await withBrowser({ width: +(o.w || 1280), height: +(o.h || 800), maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${o.tod || 12}; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(9000);
  for (let i = 0; i < 40; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 3) break; await b.sleep(1000); }
  // people to sit in the cars: wait until some are loaded
  for (let i = 0; i < 30; i++) { const n = await b.eval('(game.npc?.peopleStats?.()?.loaded || 0)'); if (n >= 6) break; await b.sleep(1000); }
  await b.eval(`(async () => { window.__seat = await import('/src/npc/seat.js'); window.__seated = []; game.updaters.push((dt) => { for (const c of window.__seated) { try { c.update(dt, { driving: true, speed: 0, grounded: true }); } catch (e) {} } }); return 1; })()`);
  for (let k = 0; k < CARS.length; k++) {
    const key = CARS[k];
    const r = await b.eval(`(async () => { const T = game.player.position.constructor; const pp = game.player.position;
      for (const v of window.__cars || []) { try { game.vehicles.remove(v); } catch (e) {} } window.__cars = [];
      for (const c of window.__seated) { try { c.root.parent?.remove(c.root); c.dispose?.(); } catch (e) {} } window.__seated = [];
      const hd = 0.0; const v = await game.vehicles.spawnParked('${key}', { x: pp.x + 9, z: pp.z + 4, heading: hd });
      if (!v) return JSON.stringify({ err: 'no car' }); window.__cars.push(v); window.__cv = v;
      ${o.glass === '0' ? 'for (const g of v.car.slots?.glass || []) g.visible = false;' : ''}
      const out = { key: v.typeKey, seats: v.seatCount, who: [] };
      if (!${!!o.nico}) for (let i = 0; i < Math.min(2, v.seatCount || 2); i++) {
        const an = v.seatAnchor(i); if (!an) continue;
        let ch = null; for (let t = 0; t < 20 && !ch; t++) { ch = window.__seat.createSeatedPerson(game, v.car.shell, an, { role: i ? 'passenger' : 'driver', pos: v.mesh.position, vehicle: v }); if (!ch) await new Promise((r) => setTimeout(r, 300)); }
        if (ch) { window.__seated.push(ch); out.who.push(ch.npcArch + (ch.personMeta ? ' ' + ch.personMeta.name : '')); }
      }
      return JSON.stringify(out); })()`);
    console.log(key, r);
    if (o.nico) {
      await b.eval(`(() => { const v = window.__cv; const t = v.mesh.position; game.teleport(t.x + 2.2, undefined, t.z, 0); return 1; })()`);
      await b.sleep(800);
      await b.eval(`(() => { game.enterVehicle(window.__cv); return 1; })()`);
      await b.sleep(250);
      if (k === 0) await b.screenshot(`${DIR}/${SET}_${key}_entering.png`);
      await b.sleep(900);
    } else await b.sleep(1600);
    // fit report: crown vs roof, hips vs anchor
    const fit = await b.eval(`JSON.stringify((() => { const v = window.__cv; const sh = v.car.shell; const res = [];
      const chars = ${o.nico ? '[game.playerCharacter || null].filter(Boolean)' : 'window.__seated'};
      chars.forEach((c, i) => { const g = (n) => c.getBone(n).getWorldPosition(new (game.player.position.constructor)()); const loc = (p) => sh.worldToLocal(p);
        const a = c._seat?.anchor; if (!a) return; const hd = g('Head'), nk = g('Neck'); const crown = hd.clone().add(hd.clone().sub(nk).normalize().multiplyScalar(0.2));
        const hip = g('LeftUpLeg').add(g('RightUpLeg')).multiplyScalar(0.5);
        const lh = loc(g('LeftHand')), rh = loc(g('RightHand')), lf = loc(g('LeftFoot')), rf = loc(g('RightFoot'));
        res.push({ seat: a.id, crownToRoof: +(a.roofY - loc(crown).y).toFixed(3), hipErr: +loc(hip).distanceTo(a.hip).toFixed(3), lhand: lh.toArray().map((x) => +x.toFixed(2)), rhand: rh.toArray().map((x) => +x.toFixed(2)), feetY: [+lf.y.toFixed(2), +rf.y.toFixed(2)], heelY: +a.heel.y.toFixed(2), recl: c._seat.extraRecline, sink: c._seat.sink, chin: c._seat.chin, wheel: a.wheel ? a.wheel.c.toArray().map((x) => +x.toFixed(2)) : null }); });
      return res; })())`);
    rep.cars[key] = { r: JSON.parse(r), fit: JSON.parse(fit) };
    console.log('  fit', fit);
    const views = { win: [2.4, 0.3, 0.25], pwin: [-2.4, 0.3, 0.25], chase: [0, 2.0, -6.2], f34: [2.6, 1.0, 3.6] };
    for (const [vn, off] of Object.entries(views)) {
      await b.eval(`(() => { const T = game.player.position.constructor; const v = window.__cv; const a = v.seatAnchor(0); const off = [${off.join(',')}];
        game.cameraOverride = (dt, cam) => { const sh = v.car.shell; sh.updateWorldMatrix(true, false);
          const look = '${vn}' === 'chase' ? new T(0, a.hip.y + 0.3, a.hip.z + 1.5) : '${vn}' === 'f34' ? new T(0, a.hip.y + 0.25, a.hip.z) : new T(${vn === 'pwin' ? '-0.0' : '0.25'}, a.hip.y + 0.22, a.hip.z + 0.2);
          const eye = '${vn}' === 'chase' || '${vn}' === 'f34' ? new T(off[0], a.hip.y + off[1], a.hip.z + off[2]) : new T(off[0], a.hip.y + off[1], a.hip.z + off[2]);
          cam.position.copy(sh.localToWorld(eye)); cam.lookAt(sh.localToWorld(look)); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.sleep(700);
      await b.screenshot(`${DIR}/${SET}_${key}_${vn}.png`);
    }
    if (o.nico) { await b.eval(`(() => { game.cameraOverride = null; game.exitVehicle(); return 1; })()`); await b.sleep(500); }
  }
  if (o.crowd) {   // far crowd tier look (downtown sidewalks), camera at eye height down the street
    await b.eval(`(() => { game.cameraOverride = null; for (const v of window.__cars || []) { try { game.vehicles.remove(v); } catch (e) {} } game.teleport(${o.crowd === true ? '407, undefined, -110' : o.crowd.replace(',', ', undefined, ')}, 0); return 1; })()`);
    await b.sleep(40000);
    rep.crowd = JSON.parse(await b.eval(`JSON.stringify({ stats: game.people?.crowd?.impl?.stats?.() || null, count: game.people?.crowd?.count, people: game.npc?.peopleStats?.() })`));
    console.log('crowd', JSON.stringify(rep.crowd));
    for (const [k, yaw] of [[0, +(o.cyaw || 0)], [1, +(o.cyaw || 0) + 3.14]]) {
      await b.eval(`(() => { const p = game.player.position.clone(); game.cameraOverride = (dt, cam) => { cam.position.set(p.x, p.y + 2.2, p.z); cam.lookAt(p.x + Math.sin(${yaw}) * 40, p.y + 1.2, p.z + Math.cos(${yaw}) * 40); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.sleep(1200); await b.screenshot(`${DIR}/${SET}_crowd_${k}.png`);
    }
  }
  rep.warn = await b.eval(`JSON.stringify((window.__seated || []).filter((c) => c._seat?.warned).length)`);
  await b.eval('(game.cameraOverride = null, 1)');
  rep.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 30);
  console.log('errors', JSON.stringify(rep.errors));
});
fs.writeFileSync(`docs/v2/reports/r2-people-${SET}.json`, JSON.stringify(rep, null, 1));
