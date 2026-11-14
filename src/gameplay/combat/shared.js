// COMBAT track: shared state and conventions for every combat / traversal module (weapons, cover, melee,
// destructibles, ragdoll reactions, fire, traversal). Everything lives on `game.combat` so it works in the full game
// and on the standalone range page (rangeHarness.js), and so modules never import each other's state.
//
// Conventions (all combat modules follow these):
//  - Player takeover: only through claimPlayer(game, owner, script) / releasePlayer(game, owner). One owner at a time;
//    a module that fails to claim simply does not start its move. Never write game.player.script directly.
//  - Camera takeover: claimCamera(game, owner, fn, priority) / releaseCamera(game, owner). Never overwrite a
//    cameraOverride that some other track (menus, interiors, cutscenes) installed.
//  - Bullet / melee surfaces: materialOf(game, collider, point). Modules that create colliders tag them with
//    setMaterial(game, collider, 'glass' | 'wood' | ..., { thickness, onHit }).
//  - Damage to anyone: damageTarget(game, target, amount, dir, kind, info), target = { kind: 'ped'|'cop'|'npc', obj }.
//  - Bone posing happens in game.updaters (after character.update, before render); additive on top of the mixer pose.
//  - Keys: see KEYS. LMB fire / light attack, RMB aim / block.
import * as THREE from 'three';

export const KEYS = {
  cover: 'KeyQ',        // take / leave cover
  swap: 'KeyV',         // swap aiming shoulder
  lock: 'KeyX',         // toggle soft lock-on
  grab: 'KeyE',         // melee grab / takedown / environmental finisher (context)
  dodge: 'AltLeft',     // melee dodge (with a direction key)
  climb: 'Space',       // jump / vault / mantle / grab ladder (context), dive when running off a high edge over water
  drop: 'KeyC',         // drop and hang from a ledge / let go of a ladder
  reload: 'KeyR',
  light: 'KeyT',        // weapon flashlight toggle
  laser: 'KeyB',        // weapon laser toggle
  steady: 'ShiftLeft',  // hold breath while scoped
};

// Surface materials. pen = how many meters of this material a "unit" bullet (pen power 1) gets through,
// ric = chance of a ricochet at a grazing angle, hard = 0..1 (drives spark / chip intensity).
export const MATERIALS = {
  concrete: { pen: 0.06, ric: 0.35, hard: 1.0, decal: 'concrete', sound: 'concrete' },
  asphalt: { pen: 0.05, ric: 0.25, hard: 0.9, decal: 'concrete', sound: 'concrete' },
  brick: { pen: 0.07, ric: 0.25, hard: 0.9, decal: 'concrete', sound: 'concrete' },
  stucco: { pen: 0.1, ric: 0.15, hard: 0.7, decal: 'concrete', sound: 'concrete' },
  tile: { pen: 0.05, ric: 0.3, hard: 0.95, decal: 'concrete', sound: 'concrete' },
  metal: { pen: 0.012, ric: 0.55, hard: 1.0, decal: 'metal', sound: 'metal' },
  vehicle: { pen: 0.02, ric: 0.3, hard: 1.0, decal: 'metal', sound: 'metal' },
  wood: { pen: 0.35, ric: 0.04, hard: 0.4, decal: 'wood', sound: 'wood' },
  glass: { pen: 2.0, ric: 0.0, hard: 0.6, decal: 'glass', sound: 'glass' },
  plastic: { pen: 0.5, ric: 0.02, hard: 0.3, decal: 'plastic', sound: 'wood' },
  rubber: { pen: 0.2, ric: 0.0, hard: 0.1, decal: 'plastic', sound: 'dirt' },
  drywall: { pen: 0.6, ric: 0.0, hard: 0.2, decal: 'wood', sound: 'wood' },
  sand: { pen: 0.03, ric: 0.0, hard: 0.0, decal: 'sand', sound: 'dirt' },
  dirt: { pen: 0.04, ric: 0.0, hard: 0.05, decal: 'dirt', sound: 'dirt' },
  grass: { pen: 0.04, ric: 0.0, hard: 0.05, decal: 'dirt', sound: 'dirt' },
  foliage: { pen: 3.0, ric: 0.0, hard: 0.0, decal: null, sound: 'dirt' },
  water: { pen: 0.9, ric: 0.1, hard: 0.0, decal: null, sound: 'water' },
  flesh: { pen: 0.45, ric: 0.0, hard: 0.0, decal: 'blood', sound: 'flesh' },
  cloth: { pen: 2.0, ric: 0.0, hard: 0.0, decal: null, sound: 'dirt' },
};
// city.surfaceAt() names -> material keys
const SURF_MAP = { asphalt: 'asphalt', concrete: 'concrete', pavers: 'brick', tile: 'tile', sand: 'sand', grass_short: 'grass', grass_long: 'grass', grass: 'grass', dirt: 'dirt', gravel: 'dirt', wood: 'wood', metal: 'metal', water: 'water' };

export function ensureCombat(game) {
  if (game.combat) return game.combat;
  const c = game.combat = {
    materials: new Map(),           // collider handle -> { material, thickness, onHit, owner }
    playerOwner: null, cameraOwner: null, cameraPrio: 0, _prevCam: null,
    hitStopT: 0, timeScale: 1,
    get G() { return game.gameplay?.G || game.combatG || (game.combatG = { dead: false, busted: false, combatT: 99 }); },
  };
  c.materialOf = (col, point, normal) => materialOf(game, col, point, normal);
  c.setMaterial = (col, m, o) => setMaterial(game, col, m, o);
  c.clearMaterial = (col) => clearMaterial(game, col);
  c.claimPlayer = (owner, script) => claimPlayer(game, owner, script);
  c.releasePlayer = (owner) => releasePlayer(game, owner);
  c.playerBusy = (owner) => playerBusy(game, owner);
  c.claimCamera = (owner, fn, prio) => claimCamera(game, owner, fn, prio);
  c.releaseCamera = (owner) => releaseCamera(game, owner);
  c.damage = (t, a, d, k, i) => damageTarget(game, t, a, d, k, i);
  c.explode = (pos, o) => explodeAt(game, pos, o);
  c.hitStop = (sec = 0.07) => { c.hitStopT = Math.max(c.hitStopT, sec); };
  c.shake = (amt) => { const G = c.G; G.shake = Math.max(G.shake || 0, amt); };
  c.noise = (pos, loudness, kind = 'shot') => { try { game.emit?.('noise', { position: pos.clone ? pos.clone() : pos, loudness, kind }); } catch (e) { /* */ } };
  return c;
}

// ---------------------------------------------------------------- materials
const handleOf = (col) => (typeof col === 'number' ? col : col?.handle);
export function setMaterial(game, col, material, opts = {}) {
  const h = handleOf(col); if (h == null) return;
  ensureCombat(game).materials.set(h, { material, thickness: opts.thickness ?? null, onHit: opts.onHit || null, owner: opts.owner || null });
}
export function clearMaterial(game, col) { const h = handleOf(col); if (h != null) ensureCombat(game).materials.delete(h); }
// What is this collider made of? Tagged colliders first, then vehicles / ragdolls, then the city surface under the
// point for floors, and a wall guess (stucco / concrete / glass storefront band) for vertical faces.
export function materialOf(game, col, point, normal) {
  const c = ensureCombat(game);
  const h = handleOf(col);
  if (h != null) { const m = c.materials.get(h); if (m) return m.material; }
  let body = null; try { body = col?.parent?.(); } catch (e) { body = null; }
  if (body) {
    const ud = body.userData;
    if (ud?.material) return ud.material;
    if (ud?.vehicle) return 'vehicle';
    for (const v of game.vehicles?.list || []) if (v.body && v.body.handle === body.handle) return 'vehicle';
    try { if (body.isDynamic() && col.collisionGroups && ((col.collisionGroups() >>> 16) & 0x007c)) return 'flesh'; } catch (e) { /* */ }
  }
  if (!point) return 'concrete';
  const floor = !normal || normal.y > 0.6;
  let s = null; try { s = game.surfaceAt?.(point.x, point.z); } catch (e) { s = null; }
  if (floor) {
    const sea = game.city?.seaLevel ?? -0.12;
    if (s === 'water' && point.y < sea + 0.25) return 'water';
    // a floor well above the ground under it is a roof / deck / bridge, not the terrain surface
    let gh = null; try { gh = game.city?.groundHeightAt?.(point.x, point.z); } catch (e) { gh = null; }
    if (Number.isFinite(gh) && point.y - gh > 1.2) return s === 'wood' ? 'wood' : 'concrete';
    return SURF_MAP[s] || 'concrete';
  }
  if (s === 'wood') return 'wood';
  return 'stucco';
}

// ---------------------------------------------------------------- player / camera arbitration
export function playerBusy(game, owner = null) {
  const P = game.player, c = ensureCombat(game);
  if (P.script && c.playerOwner !== owner) return true;
  if (P.state?.inVehicle || game.ui?.dead || game.ui?.arrested || game.ui?.busted || game.ui?.paused) return true;
  return false;
}
export function claimPlayer(game, owner, script) {
  const P = game.player, c = ensureCombat(game);
  if (P.script && c.playerOwner !== owner) return false;       // someone else (any track) has the player
  if (P.state?.inVehicle) return false;
  c.playerOwner = owner; P.script = script; script._owner = owner;
  return true;
}
export function releasePlayer(game, owner) {
  const P = game.player, c = ensureCombat(game);
  if (c.playerOwner !== owner) return false;
  if (P.script && P.script._owner === owner) P.script = null;
  c.playerOwner = null;
  return true;
}
export function claimCamera(game, owner, fn, prio = 1) {
  const c = ensureCombat(game);
  if (game.cameraOverride && c.cameraOwner == null) return false;               // another track owns the camera
  if (c.cameraOwner && c.cameraOwner !== owner && c.cameraPrio > prio) return false;
  c.cameraOwner = owner; c.cameraPrio = prio; c._camFn = fn;
  game.cameraOverride = c._camWrap || (c._camWrap = (dt, cam) => { try { return c._camFn ? c._camFn(dt, cam) === true : false; } catch (e) { console.error('[combat camera]', e); releaseCamera(game, c.cameraOwner); return false; } });
  return true;
}
export function releaseCamera(game, owner) {
  const c = ensureCombat(game);
  if (c.cameraOwner !== owner) return false;
  c.cameraOwner = null; c.cameraPrio = 0; c._camFn = null;
  if (game.cameraOverride === c._camWrap) game.cameraOverride = null;
  return true;
}

// ---------------------------------------------------------------- damage routing
// target: { kind: 'ped' | 'cop' | 'npc' | 'player', obj }
export function damageTarget(game, target, amount, dir, kind = 'bullet', info = {}) {
  if (!target) return;
  const G = ensureCombat(game).G;
  const d = dir?.clone ? dir.clone() : new THREE.Vector3(dir?.x || 0, dir?.y || 0, dir?.z || 1);
  try {
    if (target.kind === 'player') G.damagePlayer ? G.damagePlayer(amount, info.from || kind) : (game.player.health = Math.max(0, game.player.health - amount));
    else if (target.kind === 'ped') game.peds?.damage?.(target.obj, amount, d, kind, info);
    else if (target.kind === 'cop') G.police?.damageCop?.(target.obj, amount, d, kind, info.point, info);
    else if (target.kind === 'npc') G.damageNpc?.(target.obj, amount, d, kind, info.point, info);
  } catch (e) { console.warn('[combat] damage', e); }
}
// Everyone that can be hurt near a point: [{ kind, obj, pos }] (peds, cops, extra npcs)
export function livingNear(game, center, radius) {
  const out = [], G = ensureCombat(game).G, r2 = radius * radius;
  const near = (p) => p && (p.x - center.x) ** 2 + (p.z - center.z) ** 2 < r2;
  for (const p of game.peds?.list || []) if (p && p.active !== false && !p.dead && p.state !== 'dead' && near(p.pos)) out.push({ kind: 'ped', obj: p, pos: p.pos, char: p.char });
  for (const u of G.police?.units || []) if (u.active && !u.dead && near(u.pos)) out.push({ kind: 'cop', obj: u, pos: u.pos, char: u.char });
  for (const n of G.extraTargets || []) if (n.alive !== false && !n.dead && near(n.pos)) out.push({ kind: 'npc', obj: n, pos: n.pos, char: n.char });
  return out;
}
// Explosions go through the weapons module when it is there (damage, impulses, crime); otherwise just the event.
export function explodeAt(game, pos, opts = {}) {
  const G = ensureCombat(game).G;
  const p = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z);
  if (G.explode) { try { G.explode(p, opts.byPlayer !== false, opts); return; } catch (e) { console.warn('[combat] explode', e); } }
  game.emit?.('explosion', { position: p, radius: opts.radius ?? 7.5, damage: opts.damage ?? 160, byPlayer: opts.byPlayer !== false, fire: !!opts.fire });
}

// ---------------------------------------------------------------- small math / pose helpers
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const damp = (x, target, rate, dt) => x + (target - x) * (1 - Math.exp(-rate * dt));
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _ax = new THREE.Vector3();
// Rotate a bone by `angle` about a WORLD-space axis, on top of its current pose (call after character.update).
export function rotateBoneWorld(bone, axisWorld, angle) {
  if (!bone || !bone.parent || !angle) return;
  bone.parent.getWorldQuaternion(_pq);
  _ax.copy(axisWorld).applyQuaternion(_pq.invert()).normalize();
  bone.quaternion.premultiply(_q.setFromAxisAngle(_ax, angle));
}
// Character-space axes (character faces +Z of its root, right hand side is -X): returns world axis for a root yaw.
export function charAxis(heading, name, out = new THREE.Vector3()) {
  const s = Math.sin(heading), c = Math.cos(heading);
  if (name === 'fwd') return out.set(s, 0, c);
  if (name === 'right') return out.set(-c, 0, s);
  return out.set(0, 1, 0);
}
export const QF = (game) => game.RAPIER.QueryFilterFlags;
export const STATIC_ONLY = (game) => { const F = game.RAPIER.QueryFilterFlags; return F.EXCLUDE_DYNAMIC | F.EXCLUDE_KINEMATIC | F.EXCLUDE_SENSORS; };
// ray against the static world; returns { t, point, normal, collider } or null
export function rayStatic(game, o, d, len, withNormal = true, flags = null) {
  try {
    const R = game.RAPIER, ray = new R.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z });
    const f = flags ?? STATIC_ONLY(game);
    const h = withNormal ? game.world.castRayAndGetNormal(ray, len, true, f, undefined, game.player.collider || undefined) : game.world.castRay(ray, len, true, f, undefined, game.player.collider || undefined);
    if (!h) return null;
    const t = h.timeOfImpact ?? h.toi;
    return { t, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), normal: h.normal ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : null, collider: h.collider };
  } catch (e) { return null; }
}
// Does the player's capsule fit with its feet at (x, y, z)?
let _cap = null;
export function capsuleFits(game, x, y, z, shrink = 0.03) {
  try {
    const R = game.RAPIER;
    if (!_cap || _cap.R !== R) _cap = { R, shape: new R.Capsule(0.55 - shrink, 0.32 - shrink) };
    return !game.world.intersectionWithShape({ x, y: y + 0.87 + 0.06, z }, { x: 0, y: 0, z: 0, w: 1 }, _cap.shape, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, game.player.collider || undefined);
  } catch (e) { return false; }
}
