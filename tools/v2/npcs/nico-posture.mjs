#!/usr/bin/env node
// Nico's standing posture A/B (user, Nov 17: "shoulders too low, like he's pulling them down"), one session:
// the old dropped-shoulder layer (globalThis.__nicoPoseOld = true) vs the athletic posture, back / 3/4 / side at the
// third-person camera, plus walk and run frames with the new posture. Optional --cars: Nico seated in each car.
//   node tools/v2/npcs/nico-posture.mjs --set n1 [--at -846,4846] [--cars conv1,sedan3,...]
// Shots: docs/v2/shots/player/r2_<set>_<old|new>_<view>.png, docs/v2/shots/people/r2seat/<set>_nico_<car>_<view>.png
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'n'; const AT = String(o.at || '407,-110').split(',').map(Number);
const D = 'docs/v2/shots/player', DS = 'docs/v2/shots/people/r2seat'; fs.mkdirSync(D, { recursive: true }); fs.mkdirSync(DS, { recursive: true });
const VIEWS = { back: [0, 1.75, -2.5, 1.3], q34: [-1.5, 1.65, -1.9, 1.3], side: [-2.3, 1.5, 0, 1.25], front: [0.9, 1.55, 2.2, 1.3] };
await withBrowser({ width: 1280, height: 800, maxSeconds: 1500 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 13; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`);
  await b.sleep(16000);
  const cam = (v) => `(() => { const P = game.player; const T = P.position.constructor; const [ox, oy, oz, ly] = ${JSON.stringify(v)};
    game.cameraOverride = (dt, cam) => { const h = P.heading, c = Math.cos(h), s = Math.sin(h); const p = P.position;
      cam.position.set(p.x + ox * c + oz * s, p.y + oy, p.z - ox * s + oz * c); cam.lookAt(p.x, p.y + ly, p.z); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`;
  for (const mode of ['old', 'new']) {
    await b.eval(`(globalThis.__nicoPoseOld = ${mode === 'old'}, 1)`);
    await b.sleep(1500);
    for (const [vn, v] of Object.entries(VIEWS)) { await b.eval(cam(v)); await b.sleep(500); await b.screenshot(`${D}/r2_${SET}_${mode}_${vn}.png`); }
  }
  // walk and run with the new posture (W, then Shift+W), chase camera
  const key = (code, down) => `dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { code: '${code}', key: '${code}' }))`;
  await b.eval(cam(VIEWS.q34));
  await b.eval(key('KeyW', true)); await b.sleep(1600); await b.screenshot(`${D}/r2_${SET}_new_walk.png`);
  await b.eval(key('ShiftLeft', true)); await b.sleep(1400); await b.screenshot(`${D}/r2_${SET}_new_run.png`);
  await b.eval(key('ShiftLeft', false)); await b.eval(key('KeyW', false)); await b.sleep(1200); await b.screenshot(`${D}/r2_${SET}_new_stop.png`);
  if (o.cars) {
    for (const key2 of String(o.cars).split(',')) {
      const r = await b.eval(`(async () => { const pp = game.player.position; for (const v of window.__cars || []) { try { game.vehicles.remove(v); } catch (e) {} } window.__cars = [];
        const v = await game.vehicles.spawnParked('${key2}', { x: pp.x + 6, z: pp.z + 3, heading: 0 }); if (!v) return 'no car'; window.__cars.push(v); window.__cv = v;
        ${o.glass === '0' ? 'for (const g of v.car.slots?.glass || []) g.visible = false;' : ''}
        const t = v.mesh.position; game.teleport(t.x + 2.2, undefined, t.z, 0); return v.typeKey; })()`);
      await b.sleep(900);
      await b.eval('(game.enterVehicle(window.__cv), 1)');
      await b.sleep(1300);
      const fit = await b.eval(`JSON.stringify((() => { const c = game.playerCharacter; const s = c?._seat; if (!s) return null; const sh = window.__cv.car.shell; const g = (n) => sh.worldToLocal(c.getBone(n).getWorldPosition(new (game.player.position.constructor)())); const hd = g('Head'), nk = g('Neck'); const crown = hd.clone().add(hd.clone().sub(nk).normalize().multiplyScalar(0.17)); return { crownToRoof: +(s.anchor.roofY - crown.y).toFixed(3), slide: s.slide, recl: s.extraRecline, lean: s.reachLean, open: s.open, lh: g('LeftHand').toArray().map((x) => +x.toFixed(2)), wheel: s.anchor.wheel?.c.toArray().map((x) => +x.toFixed(2)) }; })())`);
      console.log('nico in', r, fit);
      for (const [vn, off] of Object.entries({ win: [2.4, 0.3, 0.25], chase: [0, 2.0, -6.2] })) {
        await b.eval(`(() => { const T = game.player.position.constructor; const v = window.__cv; const a = v.seatAnchor(0); const off = [${off.join(',')}];
          game.cameraOverride = (dt, cam) => { const sh = v.car.shell; sh.updateWorldMatrix(true, false);
            const look = '${vn}' === 'chase' ? new T(0, a.hip.y + 0.3, a.hip.z + 1.5) : new T(0.25, a.hip.y + 0.22, a.hip.z + 0.2);
            cam.position.copy(sh.localToWorld(new T(off[0], a.hip.y + off[1], a.hip.z + off[2]))); cam.lookAt(sh.localToWorld(look)); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
        await b.sleep(600); await b.screenshot(`${DS}/${SET}_nico_${key2}_${vn}.png`);
      }
      await b.eval('(game.cameraOverride = null, game.exitVehicle(), 1)'); await b.sleep(600);
    }
  }
  await b.eval('(game.cameraOverride = null, 1)');
  const errs = [...new Set(b.errors)].filter((e) => !/favicon|PortSolanaOcean/.test(e));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
});
