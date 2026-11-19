#!/usr/bin/env node
// Nico at the helm of boats (airboat seat + stick, center-console / cruiser helm): spawns each boat on open water next to
// the player, enters it (boarding move, then the seat), films the side and the chase view, logs the seat fit.
//   node tools/v2/npcs/boat-seat.mjs --set b1 [--at -858,4842] [--boats airboat,console,cruiser]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'b';
const AT = String(o.at || '-858,4842')
  .split(',')
  .map(Number);
const D = 'docs/v2/shots/people/r2seat';
fs.mkdirSync(D, { recursive: true });
await withBrowser({ width: 1280, height: 800, maxSeconds: 1200 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 12; game.teleport(${AT[0]}, undefined, ${AT[1]}, 0); return 1; })()`,
  );
  await b.sleep(14000);
  for (const key of String(o.boats || 'airboat,console,cruiser').split(',')) {
    const r = await b.eval(`(() => { const pp = game.player.position, c = game.city; let w = null;
      for (let r = 8; r < 120 && !w; r += 4) for (let k = 0; k < 16 && !w; k++) { const an = k / 16 * Math.PI * 2, x = pp.x + Math.sin(an) * r, z = pp.z + Math.cos(an) * r; if (c.isWater(x, z) && c.isWater(x + 6, z) && c.isWater(x - 6, z) && c.isWater(x, z + 6) && c.isWater(x, z - 6)) w = { x, z }; }
      if (!w) return 'no water'; for (const v of window.__boats || []) { try { game.vehicles.removeBoat?.(v); } catch (e) {} } window.__boats = [];
      const B = game.vehicles.spawnBoat('${key}', new (pp.constructor)(w.x, 0, w.z), 0); if (!B) return 'no boat'; window.__boats.push(B); window.__cb = B;
      game.teleport(w.x + 3.2, undefined, w.z, 0); return B.typeKey + ' at ' + (w.x | 0) + ',' + (w.z | 0); })()`);
    console.log(key, r);
    await b.sleep(4000);
    await b.eval('(game.enterVehicle(window.__cb), 1)');
    await b.sleep(3500);
    const fit = await b.eval(
      `JSON.stringify((() => { const c = game.playerCharacter, s = c?._seat; return s ? { standing: !!s.anchor.standing, grips: (s.anchor.grips || []).length, hip: s.anchor.hip.toArray().map((x) => +x.toFixed(2)), heel: s.anchor.heel.toArray().map((x) => +x.toFixed(2)), visible: c.root.visible, parent: c.root.parent?.name || c.root.parent?.type } : { seated: false, visible: c?.root?.visible }; })())`,
    );
    console.log('  fit', fit);
    for (const [vn, off, look] of [
      ['side', [4.2, 1.7, 0.3], [0, 0.9, 0]],
      ['chase', [0, 3.0, -8.5], [0, 1.0, 1.5]],
    ]) {
      await b.eval(`(() => { const T = game.player.position.constructor; const B = window.__cb, s = game.playerCharacter?._seat; const h = s ? s.anchor.hip : new T(0, 1, 0);
        game.cameraOverride = (dt, cam) => { const m = B.mesh; m.updateWorldMatrix(true, false); cam.position.copy(m.localToWorld(new T(${off[0]}, h.y + ${off[1]} - 1, h.z + ${off[2]}))); cam.lookAt(m.localToWorld(new T(${look[0]}, h.y + ${look[1]} - 0.9, h.z + ${look[2]}))); if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); } return true; }; return 1; })()`);
      await b.sleep(700);
      await b.screenshot(`${D}/${SET}_${key}_${vn}.png`);
    }
    await b.eval('(game.cameraOverride = null, game.exitVehicle(), 1)');
    await b.sleep(1500);
  }
  const errs = [...new Set(b.errors)].filter((e) => !/favicon|PortSolanaOcean/.test(e));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
});
