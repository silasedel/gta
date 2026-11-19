#!/usr/bin/env node
// quick in-game probe (furniture work): load, start, teleport, run an eval, optional fixed-camera shots.
//   node tools/v2/fprobe.mjs --at x,z [--eval "js"] [--shots '[{"id":"a","eye":[..],"look":[..],"tod":12}]'] [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const out = o.out || 'docs/v2/shots/stage1/furniture/probe';
fs.mkdirSync(out, { recursive: true });
await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 600) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(
    `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = 13; ${o.at ? `game.teleport(${o.at.split(',')[0]}, undefined, ${o.at.split(',')[1]});` : ''} return 1; })()`,
  );
  await b.sleep(4000);
  for (let i = 0; i < 60; i++) {
    const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
    if (q < 2) break;
    await b.sleep(1000);
  }
  await b.sleep(1500);
  if (o.eval) console.log('EVAL', await b.eval(o.eval));
  if (o.shots)
    for (const s of JSON.parse(o.shots)) {
      await b.eval(
        `(() => { const v = ${JSON.stringify(s)}; game.timeOfDay = v.tod ?? 13; game.cameraOverride = (dt, c) => { c.position.fromArray(v.eye); c.lookAt(v.look[0], v.look[1], v.look[2]); if (c.fov !== (v.fov || 55)) { c.fov = v.fov || 55; c.updateProjectionMatrix(); } return true; }; return 1; })()`,
      );
      await b.sleep(+(o.wait || 2500));
      const f = path.join(out, s.id + '.png');
      await b.screenshot(f);
      console.log('shot', f);
    }
  if (o.after) console.log('AFTER', await b.eval(o.after));
  if (b.errors.length)
    console.log('ERRORS', [...new Set(b.errors)].slice(0, 10).join('\n').slice(0, 2500));
});
