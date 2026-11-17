#!/usr/bin/env node
// r2-water: short check for QA-011 (swimming under the Keys dock), QA-051 (breath bar hidden above water) and the number of
// glades airboat stands. Prints JSON; screenshot of the under-dock swim to docs/v2/shots/water/qa011_underdock.jpg
import { withBrowser, startGame } from '../browser.mjs';
await withBrowser({ width: 1280, height: 720, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await startGame(b);
  const tele = (x, y, z) => b.eval(`(async () => { const P = game.player; const y = ${y}; P.body.setTranslation({ x: ${x}, y, z: ${z} }, true); P.position.set(${x}, y, ${z});
    for (let i = 0; i < 120; i++) { if (!game.city.collidersReadyAt || game.city.collidersReadyAt(${x}, ${z})) break; await new Promise((r) => setTimeout(r, 250)); } return 1; })()`, 120000);
  const out = {};
  await tele(-4280, 1.5, 1040); await b.sleep(4000);
  out.stands = JSON.parse(await b.eval('JSON.stringify((game.boatSystem?.gladeSites || []).map((s) => ({ x: Math.round(s.x), z: Math.round(s.z), road: s.road })))'));
  const sea = await b.eval('game.city.seaLevel');
  await tele(-895.0, sea - 0.6, 4806.0); await b.sleep(4000);
  out.qa011 = JSON.parse(await b.eval(`(() => { const P = game.player, t = P.body.translation(); return JSON.stringify({ y: +t.y.toFixed(2), swimming: !!P.swimming, depth: +(P.waterDepth || 0).toFixed(2), isWater: game.city.isWater(t.x, t.z), deck: +game.city.groundHeightAt(t.x, t.z, t.y).toFixed(2) }); })()`));
  await b.screenshot('docs/v2/shots/water/qa011_underdock.jpg', { format: 'jpeg', quality: 90 });
  await tele(-906.6, 1.5, 4826.9); await b.sleep(3000);
  out.qa051 = JSON.parse(await b.eval(`(() => { const el = [...document.querySelectorAll('div')].find((d) => d.textContent === 'BREATH')?.parentElement; const cs = el ? getComputedStyle(el) : null; return JSON.stringify({ breath: game.player.breath, under: !!game.player.headUnderwater, opacity: cs?.opacity, visibility: cs?.visibility }); })()`));
  out.errors = [...new Set(b.errors)].slice(0, 10);
  console.log(JSON.stringify(out));
});
