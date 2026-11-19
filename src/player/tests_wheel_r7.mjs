// r7: does Nico hold the wheel? Enter the nearest car at the Keys street, report the seat anchor and the hand-to-rim distance.
import { withBrowser, GAME_READY } from '../../tools/v2/browser.mjs';
const OUT = 'docs/v2/shots/people-groups';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await withBrowser({ width: 1280, height: 720, maxSeconds: 300 }, async (b) => {
  const E = async (js) => { const s = await b.eval(`(async()=>{ try { return JSON.stringify(await (async()=>{ ${js} })()); } catch (e) { return JSON.stringify({ err: String(e && e.stack || e) }); } })()`); try { return JSON.parse(s); } catch (e) { return s; } };
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY, 150);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`); await b.waitFor(GAME_READY, 150); await wait(2);
  await E(`game.timeOfDay = 12; game.teleport(3300, null, 8236, 0); return 1;`); await wait(20);
  for (let i = 0; i < 2; i++) {
    console.log('enter', JSON.stringify(await E(`const pp = game.player.position; let best = null, bd = 1e9; for (const v of game.vehicles.list || []) { if (!v.car?.shell || v.spec?.bike || v.isBoat || v.air) continue; if (${i} && v === window.__lastV) continue; const p = v.mesh?.position || v.position; if (!p) continue; const d = Math.hypot(p.x - pp.x, p.z - pp.z); if (d < bd) { bd = d; best = v; } }
      if (!best) return 'no car'; window.__lastV = best; game.enterVehicle(best); await new Promise((r) => setTimeout(r, 2500));
      const A = best.seatAnchor?.(0) || game.vehicles?.seatAnchor?.(best, 0); const sh = best.car.shell;
      const out = { car: best.typeKey || best.spec?.key || best.spec?.name, dist: +bd.toFixed(1), inVehicle: !!game.player.state?.inVehicle, wheel: A?.wheel ? { c: [A.wheel.c.x, A.wheel.c.y, A.wheel.c.z].map((n) => +n.toFixed(2)), r: A.wheel.r, tilt: A.wheel.tilt } : null, grips: !!A?.grips };
      const hands = {}; sh.traverse((o) => { if (o.isBone && /(Left|Right)Hand$/.test(o.name) && !hands[o.name.match(/(Left|Right)Hand$/)[1]]) hands[o.name.match(/(Left|Right)Hand$/)[1]] = o; });
      if (A?.wheel) { const c = sh.localToWorld(A.wheel.c.clone()); for (const s of ['Left', 'Right']) { const h = hands[s]; if (h) { const w = h.getWorldPosition(c.clone()); out[s] = +(w.distanceTo(c)).toFixed(3); } } }
      return out;`)));
    await E(`game.cameraYaw = (game.player.heading || 0) + 2.4; return 1;`); await wait(1.5);
    await b.screenshot(`${OUT}/wheel_${i}.png`);
    await E(`dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' })); await new Promise((r) => setTimeout(r, 100)); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f' })); return 1;`); await wait(3);
  }
  if (b.errors.length) console.log('ERR', b.errors.slice(0, 5));
});
