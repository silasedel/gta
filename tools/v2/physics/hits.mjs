// r2-physics: the same street sign hit at 20 / 50 / 90 km/h (impacts flag on). Per run: speed / yaw record, impulse and damage
// tier from game.physics.impactLog, a chase-cam frame sequence through the hit (live, not replayed: debris flies), and close-ups
// of the damage on the car afterwards.
//   node tools/v2/physics/hits.mjs [--speeds 20,50,90] [--key sedan3] [--phys 2]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SPEEDS = String(o.speeds || '20,50,90').split(',').map(Number), KEY = o.key || 'sedan3', PHYS = +(o.phys || 2), at = String(o.at || '407,-110').split(',').map(Number);
const OUT = 'docs/v2/shots/r2-physics/hits'; fs.mkdirSync(OUT, { recursive: true });
const report = { key: KEY, phys: PHYS, runs: {} };
const save = () => fs.writeFileSync('docs/v2/reports/physics-hits.json', JSON.stringify(report));
await withBrowser({ width: 1280, height: 720, maxSeconds: 2400 }, async (b) => {
  await b.goto(`http://127.0.0.1:5200/?mute&carphys=${PHYS}&impacts=1`);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(`(() => { game.timeExternal = true; game.timeOfDay = 11.5; if (game.vehicles.trafficDebug) game.vehicles.trafficDebug.target = 0; game.physics.impacts = true; return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
  console.log('spot', await b.eval(`JSON.stringify(__lab.findSpot(${at[0]}, ${at[1]}))`));
  await b.eval(`(() => { const S = __lab.spot; game.teleport(S.x0 + S.fx * 40 + S.rx * 7, undefined, S.z0 + S.fz * 40 + S.rz * 7); return 1; })()`);
  await b.sleep(9000);
  for (let k = 0; k < 2; k++) { await b.key('Enter', true, 'Enter'); await b.key('Enter', false, 'Enter'); await b.sleep(800); }
  await b.sleep(4000);
  console.log('breakables', await b.eval('!!game.breakables'));
  for (const kmh of SPEEDS) {
    const SG = kmh >= 70 ? 105 : kmh >= 40 ? 65 : 45; // sign position: room to reach the test speed
    await b.eval(`(() => { __lab.endReplay?.(); __lab.clear(); __lab.build('sign', { s: ${SG}, lat: 0.5 }); game.physics.impactLog.length = 0; return 1; })()`);
    await b.eval(`__lab.spawn('${KEY}', 0).then(() => 1)`);
    await b.eval(`(() => { __lab.cam('rear3q'); return 1; })()`);
    // live chase frames while the run goes: shots triggered by distance from node (approximate timing)
    const runP = b.eval(`__lab.run({ kmh: ${kmh}, sEnd: ${SG} + 22, maxT: 40, coast: true }).then((r) => JSON.stringify(r))`, 200000);
    let k = 0; const marks = [-6.5, -4.6, -3.6, -2.9, -2.2, -1.2, 0.5, 3].map((d) => SG + d);
    for (const m of marks) {
      for (let w = 0; w < 400; w++) { const s = await b.eval('(__lab.rec[__lab.rec.length - 1] || { s: 0 }).s'); if (s >= m - (kmh / 3.6) * 0.12 || (await b.eval('__lab.done'))) break; await b.sleep(15); }
      if (await b.eval('__lab.done')) break;
      await b.screenshot(`${OUT}/sign${kmh}_chase_${String(k++).padStart(2, '0')}.jpg`, { quality: 90 });
    }
    const res = JSON.parse(await runP);
    const rec = JSON.parse(await b.eval(`JSON.stringify(__lab.rec.map((r) => ({ s: r.s, kmh: r.kmh, lat: r.lat, yaw: 0, t: r.t })))`));
    const yaw = JSON.parse(await b.eval(`JSON.stringify(__lab.rec.map((r) => { const [x, y, z, qx, qy, qz, qw] = r.pose; return +(Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)) * 57.3).toFixed(2); }))`));
    rec.forEach((r, i) => { r.yaw = yaw[i]; });
    const log = JSON.parse(await b.eval('JSON.stringify(game.physics.impactLog)'));
    // the hit = the biggest one-tick speed drop near the sign; speed 3 ticks before vs 4 ticks after (coasting decel is tiny there)
    let bi = 0, bd = 0; for (let i = 3; i < rec.length - 4; i++) { if (rec[i].s < SG - 8 || rec[i].s > SG + 2) continue; const d = rec[i - 1].kmh - rec[i + 1].kmh; if (d > bd) { bd = d; bi = i; } }
    const kb = rec[Math.max(0, bi - 3)]?.kmh ?? 0, ka = rec[Math.min(rec.length - 1, bi + 4)]?.kmh ?? 0, ys = rec.slice(bi, bi + 40).map((r) => r.yaw);
    const sum = { hitAtS: rec[bi]?.s, kmhBefore: +kb.toFixed(1), kmhAfter: +ka.toFixed(1), lossPct: +(100 * (1 - ka / Math.max(0.1, kb))).toFixed(1), yawDeg: +(Math.max(...ys) - Math.min(...ys)).toFixed(2), impacts: log };
    report.runs[kmh] = { result: res, sum, rec }; save();
    console.log('sign', kmh, JSON.stringify(sum));
    // damage close-ups once stopped
    await b.sleep(2500);
    await b.eval(`(() => { const L = game.physics.impactLog.filter((e) => e.car === __lab.v.typeKey && e.hit); const at = L.length ? L[0].at : null; __lab.cam('damage', { side: -1, at }); return 1; })()`); await b.sleep(1200);
    await b.screenshot(`${OUT}/sign${kmh}_damage_a.jpg`, { quality: 90 });
    await b.eval(`(() => { __lab.cam('front3q'); return 1; })()`); await b.sleep(1200);
    await b.screenshot(`${OUT}/sign${kmh}_damage_b.jpg`, { quality: 90 });
  }
  report.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 12); save();
  if (report.errors.length) console.log('ERRORS', JSON.stringify(report.errors).slice(0, 3000));
});
console.log('saved');
