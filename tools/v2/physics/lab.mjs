// r2-physics lab: recorded driving tests over a curb (up + drop), a pothole, a rock and a speed hump, per-tick suspension
// travel / body pitch / roll, screenshot strips by exact replay of the recorded poses.
//   node tools/v2/physics/lab.mjs [--phys 2] [--at x,z] [--tests curb20,curb40,pothole30,rock25,bump30] [--key sedan3] [--strips]
// Output: docs/v2/reports/physics-lab-<phys>.json (samples), docs/v2/shots/r2-physics/lab/<test>_<i>.jpg (strip frames)
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const PHYS = +(o.phys || 2), at = String(o.at || '407,-110').split(',').map(Number), KEY = o.key || 'sedan3';
const TESTS = String(o.tests || 'curb20,curb40,pothole30,rock25,bump30').split(',');
const OUT = 'docs/v2/shots/r2-physics/lab'; fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync('docs/v2/reports', { recursive: true });
const report = { phys: PHYS, key: KEY, at, tests: {}, errors: [] };
await withBrowser({ width: 1280, height: 720, maxSeconds: 2700 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/?mute&carphys=${PHYS}${o.q || ''}`);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  console.log('booted', new Date().toISOString());
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11.5; if (game.vehicles.trafficDebug) game.vehicles.trafficDebug.target = 0; return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
  const spot = await b.eval(`JSON.stringify(__lab.findSpot(${at[0]}, ${at[1]}))`);
  console.log('spot', spot);
  const S = JSON.parse(spot);
  // park the player on the shoulder near the stretch (streaming follows the player), then wait for colliders
  await b.eval(`(() => { const S = __lab.spot; game.teleport(S.x0 + S.fx * 40 + S.rx * 7, undefined, S.z0 + S.fz * 40 + S.rz * 7); return 1; })()`);
  await b.sleep(9000);
  for (let k = 0; k < 2; k++) { await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(800); } // skip the district intro card
  await b.sleep(4000);
  for (const name of TESTS) {
    const m = /^([a-z]+)(\d+)$/.exec(name); if (!m) continue; const kind = m[1], kmh = +m[2];
    await b.eval(`(() => { __lab.endReplay?.(); __lab.clear(); return 1; })()`);
    const obs = { curb: `__lab.build('curb', { s: 45 })`, pothole: `__lab.build('pothole', { s: 45 })`, rock: `__lab.build('rock', { s: 45 })`, bump: `__lab.build('bump', { s: 45 })` }[kind];
    await b.eval(`(() => { ${obs}; return 1; })()`);
    const sp = await b.eval(`__lab.spawn('${KEY}', 0).then((r) => JSON.stringify(r))`);
    await b.eval(`(() => { __lab.cam('${o.cam || 'leftside'}', { d: 5.4, up: 0.35 }); return 1; })()`);
    const res = await b.eval(`__lab.run({ kmh: ${kmh}, sEnd: ${kind === 'curb' ? 70 : 62}, maxT: 40 }).then((r) => JSON.stringify(r))`, 120000);
    const rec = JSON.parse(await b.eval(`JSON.stringify(__lab.rec.map((r) => { const { pose, wl, ws, wr, ...k } = r; return k; }))`));
    report.tests[name] = { spawn: JSON.parse(sp), result: JSON.parse(res), rec };
    // summary around the obstacle (s 35..65)
    const win = rec.filter((r) => r.s > 38 && r.s < 64);
    const base = rec.filter((r) => r.s > 25 && r.s < 38);
    const avg = (arr, f) => arr.reduce((q, r) => q + f(r), 0) / Math.max(1, arr.length);
    const sum = { kmhIn: +avg(base, (r) => r.kmh).toFixed(1), pitchMin: Math.min(...win.map((r) => r.pitch)), pitchMax: Math.max(...win.map((r) => r.pitch)), rollMin: Math.min(...win.map((r) => r.roll)), rollMax: Math.max(...win.map((r) => r.roll)),
      travelMax: [0, 1, 2, 3].map((i) => Math.max(...win.map((r) => r.tr[i]))), travelMin: [0, 1, 2, 3].map((i) => Math.min(...win.map((r) => r.tr[i]))), ayMax: Math.max(...win.map((r) => Math.abs(r.ay))), airborne: win.filter((r) => r.c.reduce((x, y) => x + y, 0) < 4).length, kmhOut: +avg(rec.filter((r) => r.s > 58), (r) => r.kmh).toFixed(1) };
    report.tests[name].summary = sum;
    console.log(name, JSON.stringify(sum));
    if (o.strips) { // replay frames around the obstacle at fixed distances
      const dist = kind === 'curb' ? [43, 44.2, 45.2, 46.4, 47.6, 49.5, 51.4, 52.6, 53.8] : [42.5, 43.8, 44.6, 45.4, 46.2, 47.4, 48.6];
      let k = 0;
      for (const dd of dist) {
        const i = rec.findIndex((r) => r.s >= dd); if (i < 0) continue;
        await b.eval(`(() => { __lab.replay(${i}); return 1; })()`); await b.sleep(700);
        await b.screenshot(`${OUT}/${name}_p${PHYS}_${String(k++).padStart(2, '0')}.jpg`, { quality: 90 });
      }
      await b.eval(`(() => { __lab.endReplay(); return 1; })()`);
    }
  }
  report.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 20);
  if (report.errors.length) console.log('ERRORS', report.errors);
});
fs.writeFileSync(`docs/v2/reports/physics-lab-${PHYS}${o.tag ? '-' + o.tag : ''}.json`, JSON.stringify(report));
console.log('saved');
