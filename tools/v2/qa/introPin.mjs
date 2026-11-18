#!/usr/bin/env node
// r2-qa repro check: code 6969 -> dev teleport to Downtown (407,-110) -> arrival intro -> can the player still move?
//   node tools/v2/qa/introPin.mjs   -> prints PASS / FAIL and writes docs/v2/reports/qa-r2-intropin.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const out = { steps: [] };
await withBrowser({ width: 960, height: 540, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600); await startGame(b);
  const st = async (tag) => { const s = JSON.parse(await b.eval(`JSON.stringify({ p: [game.player.position.x, game.player.position.z].map((v) => +v.toFixed(1)), script: game.player.script ? Object.keys(game.player.script) : null, intro: game.intros?.seen?.() || null, dev: !!game.dev?.on })`)); out.steps.push([tag, s]); console.log(tag, JSON.stringify(s)); return s; };
  // code entry the way a player does it: Esc, CODES panel, 6 9 6 9 Enter
  await b.key('Escape', true, 'Escape'); await b.key('Escape', false, 'Escape'); await b.sleep(1000);
  await b.eval('(() => { game.dev?.openCodes?.(); return 1; })()'); await b.sleep(500);
  for (const d of '6969') { await b.key('Digit' + d, true, d); await b.key('Digit' + d, false, d); await b.sleep(120); }
  await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(800);
  await b.eval('(() => { game.dev?.closeCodes?.(); return 1; })()');
  for (let i = 0; i < 2 && await b.eval('!!game.ui.paused'); i++) { await b.key('Escape', true, 'Escape'); await b.key('Escape', false, 'Escape'); await b.sleep(800); }
  await st('code entered');
  await b.eval('(() => { game.dev.teleportTo(407, -110); return 1; })()');
  for (let i = 0; i < 60; i++) { await b.sleep(1000); const s = JSON.parse(await b.eval('JSON.stringify({ busy: !!game.dev?.busy, script: !!game.player.script, intro: document.body.classList.contains("pm-intro") })')); if (i > 12 && !s.busy && !s.script && !s.intro) break; }
  const a = await st('after dev teleport + intro');
  await b.eval('(() => { game.teleport(-779, undefined, 4879); return 1; })()'); await b.sleep(3000);
  const c = await st('after game.teleport(-779,4879)');
  await b.eval('(() => { game.cameraYaw = 0; return 1; })()'); await b.key('KeyW', true, 'w'); await b.sleep(2500); await b.key('KeyW', false, 'w');
  const d = await st('after walking 2.5 s');
  out.devOn = a.dev; out.introSeen = a.intro; out.teleported = Math.hypot(c.p[0] + 779, c.p[1] - 4879) < 10; out.walked = +Math.hypot(d.p[0] - c.p[0], d.p[1] - c.p[1]).toFixed(2);
  out.pass = out.devOn && out.teleported && out.walked > 0.5 && !d.script;
  console.log(out.pass ? 'PASS' : 'FAIL', JSON.stringify({ devOn: out.devOn, intro: out.introSeen, teleported: out.teleported, walked: out.walked }));
});
fs.writeFileSync('docs/v2/reports/qa-r2-intropin.json', JSON.stringify(out, null, 1));
