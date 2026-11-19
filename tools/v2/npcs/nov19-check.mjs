#!/usr/bin/env node
// Nov 19 people intake check (p172-p185): a walk-pose line-up in the people preview, the base guards wearing the
// new soldiers, and the pilots walking the Miami aprons. Shots in docs/v2/shots/npcs_nov19/.
//   node tools/v2/npcs/nov19-check.mjs
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const D = 'docs/v2/shots/npcs_nov19';
const IDS = Array.from({ length: 14 }, (_, i) => 'p' + (172 + i)).join(',');
const URL = 'http://127.0.0.1:5200';

// put the player `back` meters from (x, z), facing it, and return the heading used
function faceExpr(x, z, back) {
  return `(() => {
    const px = ${x} - ${back}, pz = ${z} - ${back};
    const h = Math.atan2(${x} - px, ${z} - pz);
    game.teleport(px, undefined, pz, h);
    return h;
  })()`;
}

await withBrowser({ width: 1400, height: 800, maxSeconds: 290 }, async (b) => {
  if (!process.argv.includes('--nolineup')) {
    await b.goto(`${URL}/src/npc/people/preview.html?ids=${IDS}&pose=walk&cols=7`);
    await b.waitFor('window.ready === true', 60);
    await b.sleep(1500);
    await b.screenshot(`${D}/game_lineup_walk.png`);
  }

  await b.goto(`${URL}/?mute=1`);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 150);
  if (!(await startGame(b, 40))) console.log('WARN: title did not close');
  await b.eval('game.timeExternal = true; game.timeOfDay = 12; 1');

  // the base (game.base, src/world/airport/base.js): stand near a woodland-camo guard
  await b.eval('game.teleport(-4440, undefined, 6040, -1.4); 1');
  await b.waitFor("game.base && game.base.state === 'live' && game.base.zone", 120);
  const g = JSON.parse(
    await b.eval(`JSON.stringify((() => {
      const Z = game.base.zone;
      const g = Z.guards.find((q) => q.who === 0 && !q.post) || Z.guards[0];
      return { x: g.x, z: g.z, n: Z.guards.length, who: Z.guards.map((q) => q.who).join('') };
    })())`),
  );
  console.log('base guards', g);
  await b.eval(faceExpr(g.x, g.z, 7));
  await b.sleep(10000);
  const skinned = await b.eval(
    'JSON.stringify(game.base.zone.guards.filter((q) => q.slot).map((q) => q.who))',
  );
  console.log('base skinned guards (who)', skinned);
  await b.screenshot(`${D}/game_base_guards.png`);

  // Miami: the GA apron pilots and the airline captain
  const crew = JSON.parse(
    await b.eval(`JSON.stringify((() => {
      const A = game.airport.list.find((a) => a.ap.id === 'mia');
      return A ? { x: A.cx, z: A.cz } : null;
    })())`),
  );
  if (crew) {
    await b.eval(`game.teleport(${crew.x}, undefined, ${crew.z}, 0); 1`);
    await b.waitFor(
      `(() => { const A = game.airport.list.find((a) => a.ap.id === 'mia'); return A && !!A.parts.crew; })()`,
      60,
    );
    const w = JSON.parse(
      await b.eval(`JSON.stringify(game.airport.list.find((a) => a.ap.id === 'mia').parts.crew.walkers
        .map((q) => ({ id: q.id, a: q.a, b: q.b })))`),
    );
    for (const k of [1, 0]) {
      const q = w[k];
      if (!q) continue;
      const mx = (q.a.x + q.b.x) / 2;
      const mz = (q.a.z + q.b.z) / 2;
      await b.eval(faceExpr(mx, mz, 9));
      await b.sleep(12000);
      const st =
        await b.eval(`JSON.stringify(game.airport.list.find((a) => a.ap.id === 'mia').parts.crew.walkers
        .map((q) => q.id + ':' + (q.h ? q.h.id : '-')))`);
      console.log('mia crew', st);
      await b.screenshot(`${D}/game_mia_${q.id}.png`);
    }
  }
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 8));
});
