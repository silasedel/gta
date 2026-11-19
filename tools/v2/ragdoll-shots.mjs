// Ragdoll bench runner: headless frame strips + metrics for punch / gunshot / car hit / fall down stairs.
//   node tools/v2/ragdoll-shots.mjs <label> [scenario,...]     -> docs/v2/shots/ragdoll/<label>_<scenario>.png + <label>.json
import fs from 'node:fs';
import { withBrowser } from './browser.mjs';
const label = process.argv[2] || 'after';
const list = (process.argv[3] || 'punch,gun,car,stairs').split(',');
const dir = 'docs/v2/shots/ragdoll';
fs.mkdirSync(dir, { recursive: true });
await withBrowser({ width: 1100, height: 700, maxSeconds: 300 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/src/npc/bench/ragdoll.html');
  await b.waitFor('window.benchReady === true', 120);
  let all = {};
  try {
    all = JSON.parse(fs.readFileSync(`${dir}/${label}.json`, 'utf8'));
  } catch (e) {
    /* first run */
  }
  for (const s of list) {
    let r = null;
    for (let tries = 0; tries < 3 && !r; tries++) {
      // the dev server may hot-reload the page when other agents save files
      try {
        await b.waitFor('window.benchReady === true', 120);
        r = JSON.parse(await b.eval(`JSON.stringify(window.bench.run(${JSON.stringify(s)}))`));
      } catch (e) {
        console.log('retry', s, String(e).slice(0, 120));
      }
    }
    if (!r) continue;
    fs.writeFileSync(`${dir}/${label}_${s}.png`, Buffer.from(r.sheet.split(',')[1], 'base64'));
    delete r.sheet;
    all[s] = r;
    console.log(
      s,
      JSON.stringify(r.worst),
      'penFrames',
      r.penFrames,
      r.frames
        .map((f) => `${f.t}:${f.state}/y${f.pelvisY}/p${f.pen}/k${f.kneeWrong}/n${f.neck}`)
        .join(' '),
    );
  }
  fs.writeFileSync(`${dir}/${label}.json`, JSON.stringify(all, null, 1));
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 10));
});
