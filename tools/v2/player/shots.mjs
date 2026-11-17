#!/usr/bin/env node
// Player look shots (PLAYER helper): the real game, muted, Nico in his yard; fixed cameras around him for front / side /
// back / face, then real input for walk / run / sprint, plus the hit-zone debug overlay.
//   node tools/v2/player/shots.mjs --set p1 [--only front,side] [--q "&nico=old"] [--tod 11] [--w 1600 --h 900]
// -> docs/v2/shots/player/<set>_<id>.png, docs/v2/reports/player-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'p';
const DIR = path.resolve('docs/v2/shots/player'); fs.mkdirSync(DIR, { recursive: true });
// camera relative to the player: [yaw from his facing (0 = in front, looking at him), distance, eye height, look height]
const ORBIT = {
  front: [0, 3.0, 1.25, 0.95], side: [Math.PI / 2, 3.0, 1.25, 0.95], back: [Math.PI, 3.0, 1.25, 0.95], q34: [0.7, 2.6, 1.45, 1.0],
  face: [0.25, 0.85, 1.68, 1.64], feet: [0.9, 1.4, 0.45, 0.12],
};
const STEPS = {
  front: { orbit: 'front' }, side: { orbit: 'side' }, back: { orbit: 'back' }, q34: { orbit: 'q34' }, face: { orbit: 'face' }, feet: { orbit: 'feet' },
  walk: { move: { key: 'KeyW', secs: 2.5 }, orbit: 'side', follow: true },
  run: { move: { key: 'KeyW', shift: true, secs: 1.4 }, orbit: 'side', follow: true },
  sprint: { move: { key: 'KeyW', shift: true, secs: 3.2 }, orbit: 'side', follow: true },
  hitzones: { orbit: 'front', eval: 'window.__hz = (await import("/src/gameplay/hitZones.js")).hitZoneDebug(game, [game.playerCharacter]);', after: 'window.__hz?.dispose?.()' },
  hitzones_side: { orbit: 'side', eval: 'window.__hz = (await import("/src/gameplay/hitZones.js")).hitZoneDebug(game, [game.playerCharacter]);', after: 'window.__hz?.dispose?.()' },
};
const only = o.only ? String(o.only).split(',') : ['front', 'side', 'back', 'q34', 'face', 'feet', 'walk', 'run', 'sprint'];
const rep = { set: SET, when: new Date().toISOString(), shots: {} };

await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 600) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  const at = o.at ? o.at.split(',').map(Number) : null;
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.tod || 11)};
    const h = game.nicoHouse; const a = h?.anchors?.front; const at = ${JSON.stringify(at)};
    if (at) game.teleport(at[0], undefined, at[1], at[2] ?? 0); else if (a?.pos) game.teleport(a.pos.x, undefined, a.pos.z, ${o.heading ?? 'Math.PI'});
    return 1; })()`);
  await b.sleep(6000);
  for (const id of only) {
    const s = STEPS[id]; if (!s) continue;
    const [yaw, dist, eh, lh] = ORBIT[s.orbit];
    await b.eval(`(async () => { ${s.eval || ''}
      const P = game.player; window.__orb = { yaw: ${yaw}, dist: ${dist}, eh: ${eh}, lh: ${lh}, follow: ${!!s.follow}, h0: P.heading, p0: P.position.clone() };
      game.cameraOverride = (dt, cam) => { const O = window.__orb, p = O.follow ? P.position : O.p0, h = O.follow ? O.h0 : P.heading, a = h + O.yaw;
        cam.position.set(p.x + Math.sin(a) * O.dist, p.y + O.eh, p.z + Math.cos(a) * O.dist); cam.lookAt(p.x, p.y + O.lh, p.z); return true; };
      if (${!!s.move}) game.cameraYaw = P.heading + Math.PI;
      return 1; })()`);
    if (s.move) {
      if (s.move.shift) await b.key('ShiftLeft', true, 'Shift');
      await b.key(s.move.key, true);
      await b.sleep(s.move.secs * 1000);
    } else await b.sleep(1500);
    const info = await b.eval(`JSON.stringify({ pos: game.player.position.toArray().map((v) => +v.toFixed(2)), speed: +(game.player.state.speed || 0).toFixed(2), lod: game.playerCharacter?.meshLOD, foot: game.playerCharacter?.footIK?.stats, model: game.playerCharacter?.tripo ? 'tripo' : 'old' })`);
    await b.screenshot(path.join(DIR, `${SET}_${id}.png`));
    if (s.move) { await b.key(s.move.key, false); if (s.move.shift) await b.key('ShiftLeft', false, 'Shift'); await b.sleep(800); }
    if (s.after) await b.eval(`(async () => { ${s.after}; return 1; })()`);
    rep.shots[id] = JSON.parse(info); console.log(id, info);
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n')); }
});
fs.mkdirSync('docs/v2/reports', { recursive: true });
fs.writeFileSync(`docs/v2/reports/player-${SET}.json`, JSON.stringify(rep, null, 2));
