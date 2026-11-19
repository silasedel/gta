#!/usr/bin/env node
// Full-game check: boot, find a rebuilt boat, board it, screenshot moored, then drive (W + A) and screenshot the wake.
import { withBrowser, GAME_READY } from '../../../../tools/v2/browser.mjs';
const out = process.argv[2] || 'docs/v2/shots/boats/game';
let bad = false;
await withBrowser({ width: 1280, height: 720, maxSeconds: 235 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 150);
  await b.click(640, 585);
  await b.sleep(800);
  await b.key('Enter', true);
  await b.key('Enter', false);
  await b.sleep(1200);
  await b.eval(`game.timeOfDay = 17.6; game.timeExternal = true; 0`);
  let info = null;
  for (let i = 0; i < 40 && !info; i++) {
    await b.sleep(1000);
    info = await b.eval(
      `(() => { const bs = (game.vehicles.boats || []).filter(x => x.visual); if (!bs.length) return null; const pp = game.player.position; bs.sort((a, c) => a.position.distanceTo(pp) - c.position.distanceTo(pp)); const v = bs[0]; window.__b = v; return JSON.stringify({ name: v.name, reg: v.registration, n: game.vehicles.boats.length, withVisual: bs.length, tris: v.visual.tris, pos: v.position.toArray().map(n => +n.toFixed(1)) }); })()`,
    );
  }
  console.log('BOAT', info);
  if (!info) {
    console.log('no rebuilt boat appeared');
    bad = true;
    return;
  }
  await b.eval(
    `(() => { const v = window.__b, p = v.position; game.teleport(p.x + 3, null, p.z + 3, 0); return 1; })()`,
  );
  await b.sleep(1500);
  await b.eval(`game.enterVehicle(window.__b); game.cameraPitch = 0.28; 1`);
  await b.sleep(2500);
  console.log('SHOT', await b.screenshot(out + '_moored.png'));
  await b.key('KeyW', true);
  await b.sleep(3500);
  await b.key('KeyA', true);
  await b.sleep(2600);
  console.log(
    'STATE',
    await b.eval(
      `JSON.stringify({ kmh: +window.__b.speedKmh.toFixed(1), planing: window.__b.planing, lean: +(window.__b.lean * 57.3).toFixed(1), rpm: Math.round(window.__b.rpm), physicsDead: game.physicsDead || null, v2failed: game.v2.failed })`,
    ),
  );
  console.log('SHOT', await b.screenshot(out + '_turn.png'));
  await b.key('KeyA', false);
  await b.key('KeyW', false);
  const errs = b.errors.filter((e) => /boat|wake|catalog|kit|livery/i.test(e));
  console.log(
    'BOAT-RELATED CONSOLE ERRORS',
    errs.length,
    errs.slice(0, 6).join('\n'),
    '| total errors',
    b.errors.length,
  );
  if (errs.length) bad = true;
});
process.exit(bad ? 1 : 0);
