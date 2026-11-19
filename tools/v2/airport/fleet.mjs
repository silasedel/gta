#!/usr/bin/env node
// MIA airliner fleet check (Nov 19): the downloaded types (737-800, A320, 737 MAX 8, A321, 747-100, Cessna 208) at the
// gates, remote stands and GA apron; type mix, one arrival, draw stats, console errors, two overview shots.
//   node tools/v2/airport/fleet.mjs [--out dir] [--max 270]
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
import fs from 'node:fs';

const a = process.argv.slice(2);
const o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const OUT = o.out || 'docs/v2/shots/fleet';
fs.mkdirSync(OUT, { recursive: true });

await withBrowser({ width: 1280, height: 720, maxSeconds: +(o.max || 270) }, async (b) => {
  const t0 = Date.now();
  const log = (...x) => console.log(Math.round((Date.now() - t0) / 1000) + 's', ...x);
  await b.goto('http://127.0.0.1:5200/?mute=1');
  try {
    await b.waitFor(GAME_READY, 150);
  } catch (e) {
    log('NOT READY');
  }
  await startGame(b);
  log('started');
  const ev = async (x) =>
    b.eval(
      `(async () => { try { return JSON.stringify(await (${x})); } catch (e) { return 'ERR ' + e + ' ' + (e.stack || '').slice(0, 300); } })()`,
    );
  await ev(
    `(() => { window.__errs = []; const e = console.error; console.error = (...x) => { window.__errs.push(String(x[0]).slice(0, 200)); e(...x); }; return 1; })()`,
  );

  // near the terminal (landside): the MIA traffic seeds within 5.5 km
  await ev(`game.teleport(-1380, undefined, 1180, 0)`);
  await b
    .waitFor(`game.airport?.traffic?.AP?.find((a) => a.ap.id === 'mia')?.live`, 90)
    .catch(() => log('mia traffic not live'));
  // re-roll parked aircraft of the original types a few times so the shot shows the new ones
  log(
    'reroll',
    await ev(`(async () => {
      const T = game.airport.traffic, A = T.AP.find((x) => x.ap.id === 'mia');
      const OLD = new Set(['jet', 'wide', 'turboprop']);
      for (let k = 0; k < 4; k++)
        for (const st of A.stands) {
          const f = T.flights.find((x) => x.st === st && x.phase === 'parked');
          if (!st.busy || (f && OLD.has(f.ac.type))) {
            if (f) T.remove(f);
            await T.spawnParked(A, st, 900);
          }
        }
      return T.flights.filter((f) => f.A === A).map((f) => [f.st?.id, f.ac.type, f.id.op, f.phase]);
    })()`),
  );

  // overview shots from a fixed camera (the game camera is overridden)
  const shot = async (name, from, at) => {
    await ev(`(() => {
      const gy = game.city.groundHeightAt(${at[0]}, ${at[1]}) || 0;
      game.cameraOverride = (dt, cam) => {
        cam.position.set(${from[0]}, gy + ${from[1]}, ${from[2]});
        cam.lookAt(${at[0]}, gy + 4, ${at[1]});
        return true;
      };
      return 1;
    })()`);
    await b.sleep(4000);
    await b.screenshot(`${OUT}/${name}.jpg`);
    log(
      'shot',
      name,
      await ev(
        `(() => { const i = game.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; })()`,
      ),
    );
  };
  // gates G1..G4 (noses toward the terminal, heading 2.57): from the apron side, above
  await shot('mia_gates', [-1330, 55, 1235], [-1225, 1090]);
  // remote stands R1..R3 and the GA apron (Cessna 208s at gaStands 3 / 4)
  await shot('mia_remote_ga', [-1650, 45, 960], [-1530, 840]);

  const fps = await ev(
    `new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else r(Math.round(n / 3)); }; requestAnimationFrame(f); })`,
  );
  log('fps (headless)', fps);
  // one arrival now: which type, and its phases for ~40 s
  await ev(
    `(() => { game.cameraOverride = null; const A = game.airport.traffic.AP.find((x) => x.ap.id === 'mia'); A.nextArr = 0; return 1; })()`,
  );
  for (let i = 0; i < 4; i++) {
    await b.sleep(10000);
    log(
      'flights',
      await ev(
        `game.airport.traffic.flights.filter((f) => f.A.ap.id === 'mia' && f.phase !== 'parked').map((f) => [f.ac.type, f.id.code, f.phase, Math.round(f.x), Math.round(f.y), Math.round(f.z), f.ac.far?.visible])`,
      ),
    );
  }
  log('errors', await ev(`window.__errs.slice(0, 10)`));
});
