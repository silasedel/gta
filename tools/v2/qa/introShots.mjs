#!/usr/bin/env node
// Arrival-intro film check: teleport next to a place, play its intro, capture frames through the whole cutscene.
//   node tools/v2/qa/introShots.mjs club [hotel ...]   -> docs/v2/shots/intros/<id>_NN.png + <id>.json
//   SKIP=1 also tests skipping (Enter mid-cutscene, player must be free afterwards)
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['club'];
const OUT = 'docs/v2/shots/intros';
fs.mkdirSync(OUT, { recursive: true });
await withBrowser({ width: 1280, height: 720, maxSeconds: 900 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  for (const id of ids) {
    const f = JSON.parse(
      await b.eval(
        `(() => { const pl = game.intros.places.find((p) => p.id === ${JSON.stringify(id)}); const f = pl && pl.frame(game); return JSON.stringify(f ? { x: f.x, z: f.z, fx: f.fx, fz: f.fz } : null); })()`,
      ),
    );
    if (!f) {
      console.log(id, 'no frame');
      continue;
    }
    // stand the player a few metres out on the street in front of the place, facing it
    await b.eval(
      `(() => { game.intros.reset(); game.teleport(${f.x + f.fx * 7}, undefined, ${f.z + f.fz * 7}); return 1; })()`,
    );
    await b.sleep(6000);
    await b.eval(
      `(() => { if (!document.body.classList.contains('pm-intro')) game.intros.play(${JSON.stringify(id)}); return 1; })()`,
    );
    const log = [];
    const t0 = Date.now();
    let n = 0;
    for (let i = 0; i < 80; i++) {
      await b.sleep(i < 4 ? 1500 : 1100);
      const st = JSON.parse(
        await b.eval(
          `JSON.stringify({ intro: document.body.classList.contains('pm-intro'), fov: +game.camera.fov.toFixed(1), cam: [game.camera.position.x, game.camera.position.y, game.camera.position.z].map((v) => +v.toFixed(1)), fps: game.perf?.fps ?? null })`,
        ),
      );
      log.push({ t: (Date.now() - t0) / 1000, ...st });
      if (process.env.SKIP && i === 8) {
        await b.key('Enter', true, 'Enter');
        await b.key('Enter', false, 'Enter');
      }
      if (!st.intro && i > 3) break;
      await b.screenshot(`${OUT}/${id}_${String(n++).padStart(2, '0')}.png`);
    }
    await b.sleep(2000);
    await b.screenshot(`${OUT}/${id}_after.png`);
    const free = await b.eval('!game.player.script');
    fs.writeFileSync(
      `${OUT}/${id}.json`,
      JSON.stringify({ id, free, frames: n, log, errors: b.errors.slice(-10) }, null, 1),
    );
    console.log(id, 'frames', n, 'free', free, 'errors', b.errors.length);
  }
});
