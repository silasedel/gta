// r2-physics: drive into each prop kind at a fixed speed (sign post, bush, wood fence, hydrant, wall) and log the speed loss at the
// hit and the material sound the impact system played (game.physics.soundLog).   node tools/v2/physics/propdrive.mjs [--kmh 40]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const KMH = +(o.kmh || 40);
const KINDS0 = [
  ['signPost', { kind: 'signPost', hx: 0.05, hy: 1.15, hz: 0.05 }],
  ['bush', { kind: 'bush', hx: 0.6, hy: 0.5, hz: 0.6, color: 0x3f6b33 }],
  ['fence', { kind: 'fence', hx: 1.2, hy: 0.55, hz: 0.05, color: 0xd8d4c8, lat: 0 }],
  ['hydrant', { kind: 'hydrant', hx: 0.15, hy: 0.4, hz: 0.15, color: 0xc0281c }],
  ['wall', null],
];
// --energy: the energy-model checks (center / offset hydrant, picket fence slow vs fast, thick fence slow)
const KINDS = o.energy
  ? [
      [
        'hydrant_center_30',
        { kind: 'hydrant', hx: 0.15, hy: 0.4, hz: 0.15, color: 0xc0281c, lat: 0 },
        30,
        55,
      ],
      [
        'hydrant_offset06_30',
        { kind: 'hydrant', hx: 0.15, hy: 0.4, hz: 0.15, color: 0xc0281c, lat: 0.6 },
        30,
        55,
      ],
      [
        'picket_15',
        { kind: 'fence', hx: 1.2, hy: 0.55, hz: 0.05, color: 0xd8d4c8, lat: 0 },
        15,
        55,
      ],
      [
        'picket_120',
        { kind: 'fence', hx: 1.2, hy: 0.55, hz: 0.05, color: 0xd8d4c8, lat: 0 },
        120,
        128,
      ],
      [
        'thickfence_15',
        { kind: 'fenceThick', hx: 1.2, hy: 0.9, hz: 0.08, color: 0x8a6a48, lat: 0 },
        15,
        55,
      ],
    ].filter((k) => !o.only || String(o.only).split(',').includes(k[0]))
  : KINDS0.map(([n, P]) => [n, P, KMH, 55]);
const out = { kmh: KMH, runs: {} };
await withBrowser({ width: 960, height: 540, maxSeconds: 1800 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute&impacts=1');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(
    `(() => { game.timeExternal = true; game.timeOfDay = 11; if (game.vehicles.trafficDebug) game.vehicles.trafficDebug.target = 0; return 1; })()`,
  );
  await b.eval(fs.readFileSync('tools/v2/physics/labPage.js', 'utf8'));
  await b.eval(`JSON.stringify(__lab.findSpot(407, -110))`);
  await b.eval(
    `(() => { const S = __lab.spot; game.teleport(S.x0 + S.fx * 40 + S.rx * 7, undefined, S.z0 + S.fz * 40 + S.rz * 7); return 1; })()`,
  );
  await b.sleep(9000);
  for (let k = 0; k < 2; k++) {
    await b.key('Enter', true, 'Enter');
    await b.key('Enter', false, 'Enter');
    await b.sleep(700);
  }
  for (const [name, P, kmh, SG] of KINDS) {
    await b.eval(
      `(() => { __lab.endReplay?.(); __lab.clear(); ${P ? `__lab.build('prop', { s: ${SG}, ...${JSON.stringify(P)} })` : `__lab.build('wall', { s: ${SG} })`}; game.physics.soundLog = []; game.physics.impactLog.length = 0; game.physics.energyLog = []; return 1; })()`,
    );
    await b.eval(`__lab.spawn('sedan3', 0).then(() => 1)`);
    const res = JSON.parse(
      await b.eval(
        `__lab.run({ kmh: ${kmh}, sEnd: ${SG} + 20, maxT: 30, coast: true }).then((r) => JSON.stringify(r))`,
        200000,
      ),
    );
    const rec = JSON.parse(
      await b.eval(
        'JSON.stringify(__lab.rec.map((r) => { const [x, y, z, qx, qy, qz, qw] = r.pose; return { s: r.s, kmh: r.kmh, yaw: +(Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)) * 57.3).toFixed(2) }; }))',
      ),
    );
    let bi = 0,
      bd = 0;
    for (let i = 3; i < rec.length - 4; i++) {
      if (rec[i].s < SG - 10 || rec[i].s > SG + 2) continue;
      const d = rec[i - 1].kmh - rec[i + 1].kmh;
      if (d > bd) {
        bd = d;
        bi = i;
      }
    }
    const kb = rec[Math.max(0, bi - 3)]?.kmh ?? 0,
      ka = rec[Math.min(rec.length - 1, bi + 4)]?.kmh ?? 0;
    const snd = JSON.parse(await b.eval('JSON.stringify(game.physics.soundLog || [])')),
      en = JSON.parse(await b.eval('JSON.stringify(game.physics.energyLog || [])'));
    const ys = rec.slice(bi, bi + 60).map((r) => r.yaw),
      kEnd = rec[rec.length - 1]?.kmh;
    out.runs[name] = {
      hitAtS: rec[bi]?.s,
      kmhBefore: +kb.toFixed(1),
      kmhAfter: +ka.toFixed(1),
      lossPct: +(100 * (1 - ka / Math.max(0.1, kb))).toFixed(1),
      yawDeg: ys.length ? +(Math.max(...ys) - Math.min(...ys)).toFixed(1) : 0,
      kmhEnd: kEnd,
      energy: en,
      sounds: snd.map((q) => q.material),
      result: res,
    };
    console.log(name, JSON.stringify(out.runs[name]));
  }
  out.errors = [...new Set(b.errors)].filter((e) => !/favicon/.test(e)).slice(0, 10);
  if (out.errors.length) console.log('ERRORS', JSON.stringify(out.errors).slice(0, 1500));
});
fs.writeFileSync(
  o.energy
    ? `docs/v2/reports/physics-energy${o.only ? '-' + String(o.only).replace(/,/g, '_') : ''}.json`
    : 'docs/v2/reports/physics-propdrive.json',
  JSON.stringify(out, null, 1),
);
