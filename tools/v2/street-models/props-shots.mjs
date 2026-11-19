#!/usr/bin/env node
// Street-props review driver (overnight props pass): one browser session, a list of steps (camera spots, evals, screenshots).
//   node tools/v2/street-models/props-shots.mjs --steps steps.json --set name [--q '&flag=1'] [--w 1600 --h 900]
// step: { id, player:[x,z,heading] | eye:[x,y,z], look:[x,y,z], tod, eval:"js", wait:ms, stream:true, shot:true, log:"js expr" }
// Shots -> docs/v2/shots/props/<set>_<id>.png, log values -> docs/v2/reports/props-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'run',
  DIR = path.resolve('docs/v2/shots/props');
fs.mkdirSync(DIR, { recursive: true });
const STEPS = JSON.parse(fs.readFileSync(o.steps, 'utf8'));
const rep = { set: SET, when: new Date().toISOString(), log: {} };
await withBrowser(
  { width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 1500) },
  async (b) => {
    await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
    await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
    if (!(await startGame(b))) console.log('WARN: title did not close');
    await b.eval(
      `(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; window.__spawn = game.player ? [game.player.position.x, game.player.position.z] : null; return 1; })()`,
    );
    for (const s of STEPS) {
      const t0 = Date.now();
      await b.eval(`(() => { const s = ${JSON.stringify(s)}; if (s.tod !== undefined) game.timeOfDay = s.tod;
      if (s.eye) { game.cameraOverride = (dt, cam) => { cam.position.fromArray(s.eye); cam.lookAt(s.look[0], s.look[1], s.look[2]); return true; }; }
      else if (s.free) game.cameraOverride = null;
      if (s.player !== undefined) { if (!s.eye) game.cameraOverride = null; if (s.player === null) { if (window.__spawn) game.teleport(window.__spawn[0], undefined, window.__spawn[1]); } else game.teleport(s.player[0], undefined, s.player[1], s.player[2]); }
      return 1; })()`);
      if (s.evalFile)
        s.eval = fs.readFileSync(path.join(path.dirname(o.steps), s.evalFile), 'utf8');
      if (s.eval) {
        try {
          const r = await b.eval(s.eval);
          if (r !== undefined) {
            rep.log[s.id + ':eval'] = r;
            console.log(
              s.id,
              'eval',
              typeof r === 'string' ? r.slice(0, 1500) : JSON.stringify(r).slice(0, 1500),
            );
          }
        } catch (e) {
          console.log(s.id, 'eval error', e.message.slice(0, 400));
        }
      }
      if (s.stream) {
        await b.sleep(+(o.settle || 3000));
        for (let i = 0; i < 90; i++) {
          const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
          if (q < 2) break;
          await b.sleep(1000);
        }
      }
      if (s.hold) {
        await b.key(s.hold[0], true);
        await b.sleep(s.hold[1]);
        await b.key(s.hold[0], false);
      }
      if (s.wait) await b.sleep(s.wait);
      if (s.log) {
        try {
          const r = await b.eval(s.log);
          rep.log[s.id] = r;
          console.log(
            s.id,
            'log',
            typeof r === 'string' ? r.slice(0, 2500) : JSON.stringify(r).slice(0, 2500),
          );
        } catch (e) {
          console.log(s.id, 'log error', e.message.slice(0, 400));
        }
      }
      if (s.shot !== false && (s.eye || s.player !== undefined || s.shot || s.eval)) {
        const f = path.join(DIR, `${SET}_${s.id}.png`);
        await b.screenshot(f);
        console.log(
          s.id,
          'shot',
          path.relative(process.cwd(), f),
          ((Date.now() - t0) / 1000).toFixed(1) + 's',
        );
      }
    }
    if (b.errors.length) {
      rep.errors = [...new Set(b.errors)].slice(0, 30);
      console.log('ERRORS', rep.errors.join('\n').slice(0, 3000));
    }
  },
);
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/props-${SET}.json`, JSON.stringify(rep, null, 2));
