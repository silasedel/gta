#!/usr/bin/env node
// Tree / plant ground audit (Nov 19): at each spot, after streaming settles and the ground-truth pass (src/world/vegetation/
// vegGround.v2.js) has run, every drawn library plant within R m (city tile palms / street trees, countryside, every vegetation
// field) is measured against the physics ground (same triangles as the drawn ground): base vs the lowest ground under the trunk
// footprint (floating > 5 cm, buried > 30 cm), and offenders (water / road / building footprint / solid through trunk or crown).
//   node tools/v2/vegetation/ground-audit.mjs --set before|after [--url http://127.0.0.1:5200/] [--r 150]
// before = ?veggfix=0 (pass off, audit still measures). Writes docs/v2/reports/veg-ground-<set>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'after',
  R = +(o.r || 150);
export const SPOTS = {
  downtown: [407, -110],
  brickell: [0, 1760],
  beach: [2332, -660],
  keys_spawn: [-1014, 5190],
  keylargo: [-873.6, 4825.2],
  homestead: [-1320, 3190],
  everglades: [-2386, 2660],
  clewiston: [-1540, -2805],
  gables: [-1300, 1500],
};
const rep = { set: SET, when: new Date().toISOString(), R, spots: {} };
await withBrowser({ width: 1280, height: 720, maxSeconds: 1800 }, async (b) => {
  await b.goto(
    (o.url || 'http://127.0.0.1:5200/') + '?mute' + (SET === 'before' ? '&veggfix=0' : ''),
  );
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function' && game.vegGround", 600);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  for (const [id, [x, z]] of Object.entries(SPOTS)) {
    const r = await b.eval(
      `(async () => { const s = game.city.streamer, w = (ms) => new Promise((r) => setTimeout(r, ms)); game.cameraOverride = null; game.teleport(${x}, undefined, ${z}, 0); await w(3000);
      for (let i = 0; i < 90 && s && s.pending() > 0; i++) await w(1000); await w(14000); return JSON.stringify(game.vegGround.groundAudit(${x}, ${z}, ${R})); })()`,
      300000,
    );
    const v = JSON.parse(r);
    rep.spots[id] = v;
    console.log(
      id,
      JSON.stringify({
        n: v.n,
        floating5: v.floating5,
        sunk: v.sunk,
        water: v.water,
        road: v.road,
        building: v.building,
        solid: v.solid,
        crown: v.crown,
        wait: v.wait,
        hidden: v.hidden,
      }),
    );
  }
  rep.pass = await b
    .eval('JSON.stringify(game.vegGround.stats)')
    .then(JSON.parse)
    .catch(() => null);
  rep.errors = b.errors.slice(0, 20);
});
const T = (rep.total = {});
for (const v of Object.values(rep.spots))
  for (const k of [
    'n',
    'floating5',
    'sunk',
    'water',
    'road',
    'building',
    'solid',
    'crown',
    'wait',
    'hidden',
  ])
    T[k] = (T[k] || 0) + (v[k] || 0);
console.log('TOTAL', JSON.stringify(T));
fs.writeFileSync(`docs/v2/reports/veg-ground-${SET}.json`, JSON.stringify(rep, null, 1));
