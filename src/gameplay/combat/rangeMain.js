// COMBAT track: range / arena preview page. Builds a small test arena on the range harness and loads every combat and
// traversal V2 module, plus a scripted-test API on window.T (used by tests/*.mjs through tools/v2/browser.mjs).
//   Surfaces wall (z = 14), floor zones, water pool (x 12..24), dummies (z = 9), cover course (x < -10),
//   traversal course (x > 30), destructibles row (z = -12).
import * as THREE from 'three';
import { createRangeGame } from './rangeHarness.js';
import { createWeapons, WEAP, ORDER } from '../weapons.js';
import { buildWeaponModel } from '../gunModels.js';

const q = new URLSearchParams(location.search);
const game = await createRangeGame({});
const R = game.range, P = game.player, G = game.combat.G;
G.extraTargets = [];
// minimal pickups so drops are visible and collectable on the range
G.pickups = { list: [], spawn(type, pos, o = {}) {
  let mesh; try { mesh = WEAP[type] ? buildWeaponModel(type, { lod: 1 }) : null; } catch (e) { mesh = null; }
  if (!mesh) { mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: type === 'cash' ? 0x6fbf5a : 0xd8b040, roughness: 0.6 })); }
  mesh.position.set(pos.x, (pos.y || 0) + 0.06, pos.z); mesh.rotation.z = Math.PI / 2; game.scene.add(mesh);
  const p = { type, pos: mesh.position, mesh, opts: o, active: true }; this.list.push(p); return p; } };
game.pickups = G.pickups;

// ---------------- arena
const SURF = ['concrete', 'brick', 'wood', 'metal', 'glass', 'plastic', 'stucco'];
const THICK = { concrete: 0.2, brick: 0.2, wood: 0.08, metal: 0.012, glass: 0.012, plastic: 0.05, stucco: 0.15 };
SURF.forEach((m, i) => { const x = -9 + i * 3; R.addBox(x, 0, 14, 2.6, 2.6, THICK[m], m); });
R.addBox(0, 0, 17, 26, 3.4, 0.4, 'concrete');                                         // backstop (shows exits of penetrating rounds)
['sand', 'dirt', 'grass', 'asphalt', 'wood', 'tile'].forEach((s, i) => R.addZone(-9 + i * 3, -6.2 + i * 3, 10.5, 13.5, s));
R.addWater(12, 24, 3, 16, 6);
// cover course
R.addBox(-16, 0, 6, 4, 1.0, 0.4, 'concrete');                                         // low wall (vaultable)
R.addBox(-16, 0, 11, 0.6, 3, 0.6, 'concrete');                                        // pillar
R.addBox(-22, 0, 8, 0.4, 2.6, 6, 'brick');                                            // high wall with free corners
R.addBox(-12, 0, 9, 1.4, 1.1, 0.12, 'wood');                                          // thin wooden crate side (penetrable cover)
const coverCar = game.vehicles.spawn('sedan', { x: -17, y: 0, z: 1 }, Math.PI / 2, { color: 0xb8442c });
// traversal course
R.addBox(34, 0, 2, 6, 1.05, 0.12, 'wood');                                            // fence (vault)
R.addBox(34, 0, 6, 6, 1.9, 0.5, 'concrete');                                          // wall (mantle)
R.addBox(34, 0, 14, 6, 6, 6, 'stucco');                                               // building 1 (roof at 6 m)
R.addBox(34, 0, 23, 6, 5.2, 6, 'stucco');                                             // building 2 across a 3 m gap
R.addBox(44, 0, 10, 2.5, 7.0, 10, 'concrete', { thickness: 2.5 });                    // pier / bridge deck 7 m up
R.addWater(46, 62, 0, 20, 8);
game.range.ladders = [{ base: new THREE.Vector3(34, 0, 10.92), top: new THREE.Vector3(34, 6, 10.92), normal: new THREE.Vector3(0, 0, -1) },
  { base: new THREE.Vector3(42.67, 0, 10), top: new THREE.Vector3(42.67, 7, 10), normal: new THREE.Vector3(-1, 0, 0) }];
R.finalizeGround(140);
// dummies
const dummies = [];
for (let i = 0; i < 5; i++) dummies.push(game.peds.spawnAt({ x: -6 + i * 3, y: 0, z: 9 }, { heading: Math.PI, seed: 2000 + i * 53, outfit: i === 1 ? 'business' : i === 3 ? 'beach' : 'residential', job: i === 1 ? 'courier' : null, carry: i === 1 ? ['uniform', 'bag', 'id', 'keys'] : i === 2 ? ['hat', 'keys'] : null }));
game.dummies = dummies;

// ---------------- gameplay glue (what gameplay.js provides in the full game)
G.damagePlayer = (amount, from) => { let a = amount; if (P.armor > 0) { const ab = Math.min(P.armor, a * 0.8); P.armor -= ab; a -= ab; } P.health = Math.max(0, P.health - a); game.emit('playerHit', { damage: amount, from }); };
G.reportCrime = (type, pos) => { (game.crimes ||= []).push({ type, t: game.clock.elapsed }); };
const weapons = createWeapons(game, G);
G.weapons = weapons;
game.gameplayUpdate = (dt) => weapons.update(dt);
for (const k of ORDER) if (k !== 'fist') game.weapons.give(k, 400, { select: false });
game.teleport(0, 0, 0, 0);

// ---------------- V2 modules (same contract as main.js)
const v2 = Object.assign({}, import.meta.glob('./*.v2.js'), import.meta.glob('../traversal/*.v2.js'));
const mods = [];
for (const k of Object.keys(v2)) { try { const m = await v2[k](); if (m?.initV2) mods.push(Object.assign({ name: k }, { order: m.order ?? 100, initV2: m.initV2 })); } catch (e) { console.error('[range] module failed to load', k, e); game.v2.failed.push(k); } }
await game.loadV2(mods);

// ---------------- scripted-test helpers
const T = window.T = {
  game, dummies, coverCar,
  // put the player at (x, z) looking toward (tx, ty, tz) and aim the camera exactly there
  lookAt(x, z, tx, ty, tz) { const h = Math.atan2(tx - x, tz - z); game.teleport(x, 0, z, h); T.aimAt(tx, ty, tz); },
  aimAt(tx, ty, tz) { const px = P.position.x, py = P.position.y + 1.55, pz = P.position.z; const dx = tx - px, dy = ty - py, dz = tz - pz; game.cameraYaw = Math.atan2(-dx, -dz); game.cameraPitch = -Math.atan2(dy, Math.hypot(dx, dz)); },
  select(k) { P.weapon = k; game.emit('weaponChange', { weapon: k }); },
  aim(on) { game.combatInput.aim = on; }, fire(on = true) { game.combatInput.fire = on; }, shot() { game.combatInput.fireOnce = true; },
  step(n = 1, dt = 1 / 60) { return game.step(n, dt); },
  key(c, on = true) { on ? game.testKeys.add(c) : game.testKeys.delete(c); }, press(c) { game.testPress(c); },
  // free camera for screenshots: position + look target, held until T.camFree(null)
  cam(px, py, pz, tx, ty, tz, fov = 50) { game.cameraOverride = (dt, c) => { c.position.set(px, py, pz); c.lookAt(tx, ty, tz); c.fov = fov; c.updateProjectionMatrix(); return true; }; },
  camFree() { game.cameraOverride = null; },
  stats() { return { fx: game.combat.gfx?.stats, events: (game.eventLog || []).slice(-40), frame: game.frameTimes.slice(-120), pos: P.position.toArray().map((v) => +v.toFixed(2)), health: P.health, v2: game.v2 }; },
  count(name) { return (game.eventLog || []).filter((e) => e === name).length; },
};
if (q.has('manual')) game.manual = true;
game.start();
window.rangeReady = true;
document.getElementById('info').textContent = 'Southline combat range  ·  WASD move, mouse aim, LMB fire, RMB aim, Q cover, V swap shoulder, X lock, E grab, Space vault/climb, 1-7 weapons';
