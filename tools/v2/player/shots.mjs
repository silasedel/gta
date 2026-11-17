#!/usr/bin/env node
// Player look shots (PLAYER helper): the real game, muted, Nico in his yard; fixed cameras around him for front / side /
// back / face, then real input for walk / run / sprint, plus the hit-zone debug overlay.
//   node tools/v2/player/shots.mjs --set p1 [--only front,side] [--q "&nico=old"] [--tod 11] [--w 1600 --h 900]
// -> docs/v2/shots/player/<set>_<id>.png, docs/v2/reports/player-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  hitzones: { orbit: 'front', eval: 'window.__hz = (await import("/src/gameplay/hitZones.js")).hitZoneDebug(game, [game.playerCharacter, ...(game.peds?.list || []).filter((p) => p.char && p.pos && p.pos.distanceTo(game.player.position) < 25).map((p) => p.char)]);', after: 'window.__hz?.dispose?.()' },
  hitzones_side: { orbit: 'side', eval: 'window.__hz = (await import("/src/gameplay/hitZones.js")).hitZoneDebug(game, [game.playerCharacter, ...(game.peds?.list || []).filter((p) => p.char && p.pos && p.pos.distanceTo(game.player.position) < 25).map((p) => p.char)]);', after: 'window.__hz?.dispose?.()' },
  disguise: { orbit: 'q34', eval: 'game.wardrobe.wear("uniform_lifeguard_shirt"); game.wardrobe.wear("shorts_navy"); game.wardrobe.wear("sneakers_black"); window.__desc = game.wardrobe.describe();',
    after: 'const m = await import("/src/player/wardrobe/outfit.js"); game.playerCharacter.outfit.set(m.DEFAULT_OUTFIT);' },
  security: { orbit: 'front', eval: 'game.wardrobe.wear("uniform_security_shirt"); game.wardrobe.wear("pants_cargo_khaki");', after: 'const m = await import("/src/player/wardrobe/outfit.js"); game.playerCharacter.outfit.set(m.DEFAULT_OUTFIT);' },
  aim: { orbit: 'side', eval: 'game.weapons.give("pistol", 60); game.weapons.select?.("pistol"); game.combatInput.aim = true; const P = game.player; game.combat = game.combat || {}; (game.combat).aimTarget = new game.THREE.Vector3(P.position.x + Math.sin(P.heading) * 10, P.position.y + 1.45, P.position.z + Math.cos(P.heading) * 10);',
    after: 'game.combatInput.aim = null; if (game.combat) game.combat.aimTarget = null;' },
  aim_q: { orbit: 'q34', eval: 'game.combatInput.aim = true; const P = game.player; game.combat.aimTarget = new game.THREE.Vector3(P.position.x + Math.sin(P.heading) * 10, P.position.y + 1.45, P.position.z + Math.cos(P.heading) * 10);',
    after: 'game.combatInput.aim = null; game.combat.aimTarget = null;' },
  car: { orbit: 'side', wait: 3500, eval: `const P = game.player; const v = game.vehicles.nearest?.(P.position, 60); window.__car = v; if (v) game.enterVehicle(v);
      game.cameraOverride = (dt, cam) => { const m = v.mesh || v.car?.shell; const q = m.getWorldQuaternion(new game.THREE.Quaternion()); const p = m.getWorldPosition(new game.THREE.Vector3());
        const left = new game.THREE.Vector3(1, 0, 0).applyQuaternion(q), fwd = new game.THREE.Vector3(0, 0, 1).applyQuaternion(q);
        cam.position.copy(p).addScaledVector(left, 3.2).addScaledVector(fwd, 0.9).add(new game.THREE.Vector3(0, 1.5, 0)); cam.lookAt(p.clone().addScaledVector(left, 0.35).add(new game.THREE.Vector3(0, 1.0, 0))); return true; };`,
    noOrbit: true, after: 'if (window.__car) game.exitVehicle();' },
  ragdoll: { orbit: 'q34', wait: 2600, eval: `const R = await import('/src/npc/ragdoll.js'); const ch = game.playerCharacter; window.__rag = window.__rag || R.createRagdollSystem(game, 2);
      const P = game.player; ch.__upd = ch.update; ch.update = () => {}; window.__orb.p0 = P.position.clone(); window.__orb.dist = 3.4;
      const rd = window.__rag.start(ch, { vel: { x: Math.sin(P.heading) * -3, y: 1.2, z: Math.cos(P.heading) * -3 }, kind: 'melee', strength: 0.4, lethal: true });
      window.__ragUpd = (dt) => { try { window.__rag.update(dt); } catch (e) {} }; game.updaters.push(window.__ragUpd);`,
    after: `const ch = game.playerCharacter; ch.update = ch.__upd; const i = game.updaters.indexOf(window.__ragUpd); if (i >= 0) game.updaters.splice(i, 1); ch.snapshotPose?.(0.3);` },
};
const DEFAULT_ONLY = ['front', 'side', 'back', 'q34', 'face', 'feet', 'walk', 'run', 'sprint', 'hitzones', 'hitzones_side', 'aim', 'aim_q', 'disguise', 'car', 'ragdoll'];
const rep = { set: SET, when: new Date().toISOString(), shots: {} };


// run the shot steps in an already running game page (used by walktest.mjs --shots to share one browser slot)
export async function shotsIn(b, o2 = o, rep2 = rep) {
  const o = o2, rep = rep2, SET = o.set || 'p';
  const only = o.only ? String(o.only).split(',') : DEFAULT_ONLY;
  const at = o.at ? o.at.split(',').map(Number) : null;
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.tod || 11)};
    const h = game.nicoHouse; const a = h?.anchors?.front; const at = ${JSON.stringify(at)};
    if (at) game.teleport(at[0], undefined, at[1], at[2] ?? 0); else if (a?.pos) game.teleport(a.pos.x, undefined, a.pos.z, ${o.heading ?? 'Math.PI'});
    return 1; })()`);
  await b.sleep(3000);
  // move to open ground nearby (no car / wall / prop within ~1.5 m of a 9 m walk ahead and the camera ring)
  if (!o.noclear) console.log('spot', await b.eval(`(() => { const R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, ball = new R.Ball(1.6), P = game.player;
    const c0 = P.position.clone(); const city = game.city;
    const cars = (game.vehicles?.list || []).map((v) => { try { const t = v.body.translation(); return [t.x, t.z]; } catch (e) { return null; } }).filter(Boolean);
    const free = (x, z, h) => { for (let k = -2; k <= 11; k++) { const px = x + Math.sin(h) * k * 2.2, pz = z + Math.cos(h) * k * 2.2; const y = city.groundHeightAt(px, pz);
      if (!Number.isFinite(y) || city.isWater?.(px, pz) || y < 0.15 || cars.some((c) => Math.hypot(c[0] - px, c[1] - pz) < 6)) return false;
      if (W.intersectionWithShape({ x: px, y: y + 1.95, z: pz }, { x: 0, y: 0, z: 0, w: 1 }, ball, QF.EXCLUDE_SENSORS, undefined, P.collider)) return false; } return true; };
    for (let r = 0; r <= 90; r += 3) for (let i = 0; i < Math.max(1, r * 1.5); i++) { const a = i / Math.max(1, r * 1.5) * Math.PI * 2; const x = c0.x + Math.sin(a) * r, z = c0.z + Math.cos(a) * r;
      for (const h of [P.heading, P.heading + Math.PI / 2, P.heading + Math.PI, P.heading - Math.PI / 2]) if (free(x, z, h)) { game.teleport(x, undefined, z, h); window.__spot = [x, z, h]; return JSON.stringify([+x.toFixed(1), +z.toFixed(1), +h.toFixed(2)]); } }
    return 'none'; })()`));
  await b.sleep(6000);
  for (const id of only) {
    const s = STEPS[id]; if (!s) continue;
    const [yaw, dist, eh, lh] = ORBIT[s.orbit];
    await b.eval(`(async () => {
      { const P = game.player; window.__orb = { yaw: ${yaw}, dist: ${dist}, eh: ${eh}, lh: ${lh}, follow: ${!!s.follow}, h0: P.heading, p0: P.position.clone() };
      if (!${!!s.noOrbit}) game.cameraOverride = (dt, cam) => { const O = window.__orb, p = O.follow ? P.position : O.p0, h = O.follow ? O.h0 : P.heading, a = h + O.yaw;
        cam.position.set(p.x + Math.sin(a) * O.dist, p.y + O.eh, p.z + Math.cos(a) * O.dist); cam.lookAt(p.x, p.y + O.lh, p.z); return true; };
      if (${!!s.move}) game.cameraYaw = P.heading + Math.PI; }
      ${s.eval || ''}
      return 1; })()`);
    if (s.move) {
      if (s.move.shift) await b.key('ShiftLeft', true, 'Shift');
      await b.key(s.move.key, true);
      await b.sleep(s.move.secs * 1000);
    } else await b.sleep(s.wait || 1500);
    const info = await b.eval(`JSON.stringify({ pos: game.player.position.toArray().map((v) => +v.toFixed(2)), speed: +(game.player.state.speed || 0).toFixed(2), lod: game.playerCharacter?.meshLOD, foot: game.playerCharacter?.footIK?.stats, model: game.playerCharacter?.tripo ? 'tripo' : 'old', desc: game.wardrobe?.describe?.(), disguise: game.wardrobe?.disguise?.() })`);
    await b.screenshot(path.join(DIR, `${SET}_${id}.png`));
    if (s.move) { await b.key(s.move.key, false); if (s.move.shift) await b.key('ShiftLeft', false, 'Shift'); await b.sleep(800); await b.eval(`(() => { const s = window.__spot; if (s) game.teleport(s[0], undefined, s[1], s[2]); return 1; })()`); await b.sleep(1200); }
    if (s.after) await b.eval(`(async () => { ${s.after}; return 1; })()`);
    rep.shots[id] = JSON.parse(info); console.log(id, info);
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n')); }}

const isMain = import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  await withBrowser({ width: +(o.w || 1600), height: +(o.h || 900), maxSeconds: +(o.max || 600) }, async (b) => {
  await b.goto((o.url || 'http://127.0.0.1:5200/') + '?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
    await shotsIn(b, o, rep);
  });
  fs.mkdirSync('docs/v2/reports', { recursive: true });
  fs.writeFileSync(`docs/v2/reports/player-${SET}.json`, JSON.stringify(rep, null, 2));
}
