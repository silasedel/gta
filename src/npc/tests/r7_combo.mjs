// r7: one browser for the downtown groups check and Nico's hands on the wheel (cabin close-up).  node src/npc/tests/r7_combo.mjs
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const OUT = 'docs/v2/shots/people-groups';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  const E = async (js) => {
    const s = await b.eval(
      `(async()=>{ try { return JSON.stringify(await (async()=>{ ${js} })()); } catch (e) { return JSON.stringify({ err: String(e && e.stack || e) }); } })()`,
    );
    try {
      return JSON.parse(s);
    } catch (e) {
      return s;
    }
  };
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 150);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`);
  await b.waitFor(GAME_READY, 150);
  await wait(2);
  // downtown: natural + forced groups
  await E(
    `game.timeExternal = true; game.timeOfDay = 13; game.teleport(407, undefined, -110, 0.4); return 1;`,
  );
  await wait(25);
  console.log(
    'dt_force',
    JSON.stringify(
      await E(`const N = game.peds._nav, pp = game.player.position, made = [];
    for (let i = 0; i < 14 && made.length < 3; i++) { const q = N.sidewalkNear(pp, 14 + i * 2); if (!q) continue; if (Math.hypot(q.x - pp.x, q.z - pp.z) < 8) continue; const r = game.peds._crowd({ x: q.x, y: q.y, z: q.z }, N.zoneAt(q.x, q.z), 3); if (r.length) made.push([Math.round(q.x), Math.round(q.z), r.length]); }
    return made;`),
    ),
  );
  await wait(6);
  console.log(
    'dt_groups',
    JSON.stringify(
      await E(
        `const out = []; for (const g of game.peds.groups || []) { if (!g.talk) continue; out.push({ theme: g.theme, n: g.members.length, m: g.members.map((p) => [p.char?.personMeta?.years, p.char?.personMeta?.look]) }); } return { out, stats: game.peds.groupStats, why: game.peds.clearWhy, last: game.peds.clearWhy._last };`,
      ),
    ),
  );
  console.log(
    'dt_aim',
    JSON.stringify(
      await E(`let best = null, bd = 1e9; const pp = game.player.position; for (const g of game.peds.groups || []) { if (!g.talk || g.members.length < 2) continue; const d = Math.hypot(g.center.x - pp.x, g.center.z - pp.z); if (d < bd) { bd = d; best = g; } }
    if (!best) return null; const h = 0.7; game.teleport(best.center.x + Math.sin(h) * 5.5, undefined, best.center.z + Math.cos(h) * 5.5, h + Math.PI); game.cameraYaw = h; return [best.theme, best.members.length];`),
    ),
  );
  await wait(3);
  await b.screenshot(`${OUT}/r7_downtown_group.png`);
  // wheel close-up in the nearest moving-free car
  console.log(
    'wheel',
    JSON.stringify(
      await E(`const pp = game.player.position; let best = null, bd = 1e9; for (const v of game.vehicles.list || []) { if (!v.car?.shell || v.spec?.bike || v.isBoat || v.air) continue; const p = v.mesh?.position; if (!p) continue; const d = Math.hypot(p.x - pp.x, p.z - pp.z); if (d < bd) { bd = d; best = v; } }
    if (!best) return 'no car'; window.__lastV = best; game.enterVehicle(best); await new Promise((r) => setTimeout(r, 3000));
    const A = best.seatAnchor?.(0) || game.vehicles?.seatAnchor?.(best, 0), sh = best.car.shell; const hands = {}; sh.traverse((o) => { if (o.isBone && /(Left|Right)Hand$/.test(o.name)) hands[o.name.match(/(Left|Right)Hand$/)[1]] ||= o; });
    const out = { car: best.typeKey || best.spec?.key, wheel: !!A?.wheel }; if (A?.wheel) { const c = sh.localToWorld(A.wheel.c.clone()); for (const s of ['Left', 'Right']) if (hands[s]) out[s] = +hands[s].getWorldPosition(c.clone()).distanceTo(c).toFixed(3); out.r = A.wheel.r;
      game.cameraOverride = (dt, cam) => { sh.updateWorldMatrix(true, false); cam.position.copy(sh.localToWorld(A.wheel.c.clone().add({ x: -0.95, y: 0.28, z: -0.2 }))); cam.lookAt(sh.localToWorld(A.wheel.c.clone())); cam.fov = 55; cam.updateProjectionMatrix(); return true; }; }
    return out;`),
    ),
  );
  await wait(1.5);
  await b.screenshot(`${OUT}/r7_wheel.png`);
  await E(`game.cameraOverride = null; return 1;`);
  if (b.errors.length) console.log('ERR', JSON.stringify(b.errors.slice(0, 5)).slice(0, 1500));
});
