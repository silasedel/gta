// Player weapons (COMBAT track): defs, inventory, attachments and their stats, clip / reload with moving parts,
// aiming state (RMB) + scope, ballistics (muzzle -> crosshair point, recoil patterns, spread bloom, penetration by
// material, ricochets, water), per-limb damage and reactions, suppressed fire, thrown weapons, held models with
// laser and flashlight. Camera, reticles and lock-on live in combat/aim.v2.js; melee in combat/melee.v2.js
// (a small built-in swing remains as a fallback when that module is not loaded).
import * as THREE from 'three';
import { rand, sfx, tryCall, findBone, aimArm, removeBodySafe } from './util.js';
import { buildWeaponModel, WEAPON_ATTACH, DEFAULT_ATTACH, SKINS, normalizeAttach } from './gunModels.js';
import { rayLimbs, segLimbs, hitTargets } from './hitbox.js';
import { createGunFX } from './gunfx.js';
import { ensureCombat, MATERIALS, materialOf, KEYS, livingNear, damageTarget } from './combat/shared.js';

// snd = name for game.audio; pen = penetration power (x material depth); loud = how far (m) people hear it
export const WEAP = {
  fist: { name: 'Fists', cls: 'melee', melee: true, dmg: 0, range: 1.35, hud: 'fist' },
  knife: { name: 'Switchblade', cls: 'melee', melee: true, dmg: 75, range: 1.6, price: 120, hud: 'bat' },
  bat: { name: 'Ash Baseball Bat', cls: 'melee', melee: true, dmg: 55, range: 1.95, price: 60, hud: 'bat' },
  crowbar: { name: 'Breaker Wrecking Bar', cls: 'melee', melee: true, dmg: 60, range: 1.85, price: 45, hud: 'bat' },
  bottle: { name: 'Glass Bottle', cls: 'melee', melee: true, dmg: 30, range: 1.5, price: 3, hud: 'bat' },
  pistol: { name: 'Solana Service 9 Pistol', cls: 'handgun', dmg: 30, rate: 0.2, spread: 0.007, hip: 0.028, kick: 0.02, range: 140, clip: 15, reload: 1.3, ammoPick: 45, price: 450, ammoPrice: 2, ammoPack: 30, snd: 'pistol', hud: 'pistol', pen: 0.6, loud: 45, vel: 300 },
  revolver: { name: 'Caballo .44 Revolver', cls: 'handgun', dmg: 72, rate: 0.55, spread: 0.004, hip: 0.024, kick: 0.07, range: 170, clip: 6, reload: 2.1, ammoPick: 24, price: 950, ammoPrice: 5, ammoPack: 18, snd: 'revolver', tone: 'heavy', hud: 'pistol', pen: 1.0, loud: 60, vel: 360 },
  microsmg: { name: 'Wasp Micro-SMG', cls: 'smg', auto: true, dmg: 13, rate: 0.052, spread: 0.03, hip: 0.055, kick: 0.009, range: 70, clip: 30, reload: 1.4, ammoPick: 120, price: 1100, ammoPrice: 1, ammoPack: 90, snd: 'microsmg', tone: 'light', hud: 'smg', pen: 0.5, loud: 45, vel: 300 },
  smg: { name: 'Kestrel SMG', cls: 'smg', auto: true, dmg: 18, rate: 0.075, spread: 0.02, hip: 0.045, kick: 0.011, range: 100, clip: 35, reload: 1.6, ammoPick: 140, price: 1600, ammoPrice: 1, ammoPack: 105, snd: 'smg', hud: 'smg', pen: 0.6, loud: 48, vel: 320 },
  rifle: { name: 'Biscayne GR-27 Assault Rifle', cls: 'rifle', auto: true, dmg: 29, rate: 0.1, spread: 0.011, hip: 0.04, kick: 0.017, range: 230, clip: 30, reload: 2.0, ammoPick: 120, price: 3200, ammoPrice: 2, ammoPack: 90, snd: 'rifle', tone: 'rifle', hud: 'smg', pen: 1.3, loud: 70, vel: 520 },
  carbine: { name: 'Coastline Carbine', cls: 'rifle', dmg: 38, rate: 0.15, spread: 0.006, hip: 0.034, kick: 0.022, range: 260, clip: 20, reload: 1.8, ammoPick: 80, price: 2600, ammoPrice: 2, ammoPack: 60, snd: 'carbine', tone: 'rifle', hud: 'smg', zoom: 0.6, pen: 1.6, loud: 72, vel: 560 },
  shotgun: { name: 'Breaker Pump Shotgun', cls: 'shotgun', dmg: 14, pellets: 8, rate: 0.85, spread: 0.055, hip: 0.075, kick: 0.07, range: 45, clip: 6, reload: 2.4, ammoPick: 18, price: 1200, ammoPrice: 3, ammoPack: 12, snd: 'shotgun', hud: 'shotgun', pen: 0.3, loud: 65, vel: 260 },
  sawnoff: { name: 'Hacksaw Double-Barrel', cls: 'shotgun', dmg: 13, pellets: 11, rate: 0.3, spread: 0.09, hip: 0.1, kick: 0.1, range: 24, clip: 2, reload: 1.7, ammoPick: 16, price: 800, ammoPrice: 3, ammoPack: 12, snd: 'sawnoff', hud: 'shotgun', pen: 0.25, loud: 65, vel: 240 },
  sniper: { name: 'Longshot .308 Sniper', cls: 'sniper', dmg: 165, rate: 1.25, spread: 0.0004, hip: 0.07, kick: 0.12, range: 500, clip: 5, reload: 2.6, ammoPick: 15, price: 5000, ammoPrice: 10, ammoPack: 10, snd: 'sniper', tone: 'sniper', hud: 'shotgun', pen: 2.6, loud: 90, vel: 780 },
  grenade: { name: 'Frag Grenade', cls: 'throwable', throw: true, dmg: 160, radius: 7.5, rate: 0.9, clip: 1, ammoPick: 3, price: 300, ammoPrice: 250, ammoPack: 1, hud: 'fist' },
  molotov: { name: 'Molotov Cocktail', cls: 'throwable', throw: true, dmg: 30, radius: 3.2, rate: 1.0, clip: 1, ammoPick: 2, price: 90, ammoPrice: 80, ammoPack: 1, hud: 'fist' },
};
export const ORDER = ['fist', 'knife', 'bat', 'crowbar', 'bottle', 'pistol', 'revolver', 'microsmg', 'smg', 'rifle', 'carbine', 'shotgun', 'sawnoff', 'sniper', 'grenade', 'molotov'];
const SLOTS = { fist: 1, knife: 1, bat: 1, crowbar: 1, bottle: 1, pistol: 2, revolver: 2, microsmg: 3, smg: 3, rifle: 4, carbine: 4, shotgun: 5, sawnoff: 5, sniper: 6, grenade: 7, molotov: 7 };
for (const k of ORDER) { WEAP[k].key = k; WEAP[k].slot = SLOTS[k]; WEAP[k].pellets = WEAP[k].pellets || 1; }
const isGun = (k) => !!WEAP[k] && !WEAP[k].melee && !WEAP[k].throw;

// attachment catalog: display names, prices, and what they change
export const ATTACH_INFO = {
  sight: { irons: { name: 'Iron sights', price: 0 }, reddot: { name: 'Halcyon red dot', price: 420, ads: 0.82 }, holo: { name: 'Halcyon holo sight', price: 650, ads: 0.86, sway: 0.75 }, acog: { name: 'Tern 4x prism', price: 1100, ads: 0.72, zoom: 0.36, sway: 1.15 }, scope: { name: 'Saltworks 6-12x scope', price: 1900, scope: true, ads: 0.5 } },
  mag: { std: { name: 'Standard magazine', price: 0 }, ext: { name: 'Extended magazine', price: 380, clip: 1.5, reload: 1.1 }, drum: { name: 'Drum magazine', price: 950, clip: 2.5, reload: 1.35, hip: 1.1 } },
  muzzle: { none: { name: 'Factory muzzle', price: 0 }, suppressor: { name: 'Saltworks QD suppressor', price: 900, loud: 0.2, dmg: 0.95, range: 0.9, kick: 0.92 }, comp: { name: 'Three-port compensator', price: 520, kick: 0.74, loud: 1.15 } },
  grip: { none: { name: 'No foregrip', price: 0 }, vertical: { name: 'Vertical foregrip', price: 300, kick: 0.85, hip: 0.9 }, angled: { name: 'Angled foregrip', price: 340, bloomRec: 1.35, ads: 0.93 } },
  laser: { name: 'Red laser', price: 450, hip: 0.62 }, light: { name: 'Weapon light', price: 260 },
};
// successive-shot recoil: [yaw, pitch] multipliers of the weapon's kick; loops from `loop`
const PATTERN = {
  handgun: { p: [[0, 1], [0.15, 0.9], [-0.2, 0.9], [0.1, 0.85]], loop: 1 },
  smg: { p: [[0, 1], [0.2, 0.9], [0.35, 0.8], [0.1, 0.75], [-0.3, 0.7], [-0.5, 0.65], [-0.2, 0.6], [0.3, 0.6], [0.5, 0.55]], loop: 4 },
  rifle: { p: [[0, 1.2], [0.05, 1.1], [0.1, 1], [0.3, 0.9], [0.55, 0.8], [0.6, 0.7], [0.2, 0.6], [-0.4, 0.6], [-0.7, 0.55], [-0.5, 0.5], [0.1, 0.5], [0.5, 0.5]], loop: 6 },
  shotgun: { p: [[0, 1]], loop: 0 }, sniper: { p: [[0, 1]], loop: 0 },
};
const BLOOM = { handgun: [0.006, 6], smg: [0.0035, 5], rifle: [0.003, 5.5], shotgun: [0.01, 3], sniper: [0.02, 2] }; // [per shot, recovery /s]

export function createWeapons(game, G) {
  const { scene, world, RAPIER, camera } = game;
  const P = game.player, C = ensureCombat(game);
  if (!Array.isArray(P.inventory)) P.inventory = ['fist'];
  P.ammo = P.ammo || {};
  for (const k of ORDER) if (!WEAP[k].melee && P.ammo[k] == null) P.ammo[k] = 0;
  P.clip = P.clip || {};
  P.weaponMods = P.weaponMods || {};      // { [weapon]: { sight, mag, muzzle, grip, laser, light, skin, owned: { 'sight:reddot': true } } }  (save-game friendly)
  if (!P.inventory.includes(P.weapon)) P.weapon = 'fist';
  P.aiming = false;
  const vin = game.combatInput = game.combatInput || { aim: null, fire: null, fireOnce: false };   // scripted input for tests / other modules

  // ---- input (RMB + wheel are not tracked by core input). RMB is re-derived from real button masks.
  let rmb = false;
  addEventListener('mousedown', (e) => { if (e.button === 2 && document.pointerLockElement) rmb = true; }, true);
  addEventListener('mouseup', (e) => { if (e.button === 2) rmb = false; }, true);
  addEventListener('mousemove', (e) => { if (typeof e.buttons === 'number' && !(e.buttons & 2)) rmb = false; }, true);
  addEventListener('contextmenu', (e) => { if (document.pointerLockElement) e.preventDefault(); });
  addEventListener('blur', () => { rmb = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) rmb = false; });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) rmb = false; });
  if (game.settings && !(game.settings.fov >= 45)) game.settings.fov = 62;
  let wheelAcc = 0;
  addEventListener('wheel', (e) => { if (document.pointerLockElement && !game.ui?.weaponWheel) wheelAcc += Math.sign(e.deltaY); }, { passive: true });

  function blocked() { const ui = game.ui || {}; return ui.paused || ui.phoneOpen || ui.weaponWheel || ui.title || ui.shopOpen || ui.bench || G.dead || G.busted || G.jack; }

  // ---- attachments -> effective stats
  const effCache = new Map();
  function mods(k) { let m = P.weaponMods[k]; if (!m) m = P.weaponMods[k] = Object.assign({ skin: 'factory', owned: {} }, DEFAULT_ATTACH[k] || {}); if (!m.owned) m.owned = {}; return m; }
  function eff(k) {
    let e = effCache.get(k); if (e) return e;
    const w = WEAP[k] || WEAP.fist; e = Object.assign({}, w);
    if (isGun(k)) {
      const m = normalizeAttach(k, mods(k)), I = ATTACH_INFO;
      const s = I.sight[m.sight] || {}, mg = I.mag[m.mag] || {}, mz = I.muzzle[m.muzzle] || {}, gr = I.grip[m.grip] || {};
      e.clip = Math.round(w.clip * (mg.clip || 1)); e.reload = w.reload * (mg.reload || 1);
      e.spread = w.spread * (s.ads || 1) * (gr.ads || 1); e.hip = w.hip * (mg.hip || 1) * (gr.hip || 1);
      e.kick = w.kick * (mz.kick || 1) * (gr.kick || 1); e.dmg = w.dmg * (mz.dmg || 1); e.range = w.range * (mz.range || 1);
      e.loud = (w.loud || 50) * (mz.loud || 1); e.suppressed = m.muzzle === 'suppressor';
      e.scope = !!s.scope; e.zoom = s.zoom || (s.scope ? 0.3 : w.zoom || 0.55); e.sway = (w.cls === 'sniper' ? 1.6 : 1) * (s.sway || 1);
      e.bloomRec = (BLOOM[w.cls] || BLOOM.handgun)[1] * (gr.bloomRec || 1); e.bloomPer = (BLOOM[w.cls] || BLOOM.handgun)[0];
      e.laser = !!m.laser; e.light = !!m.light; e.laserHip = I.laser.hip; e.att = m;
    }
    effCache.set(k, e); return e;
  }
  let reloadT = 0, reloadKey = null, reloadStage = 0;
  function select(id) {
    if (!P.inventory.includes(id) || P.weapon === id) return;
    P.weapon = id; reloadT = 0; reloadKey = null; resetAim();
    game.emit?.('weaponChange', { weapon: id }); sfx(game, 'reload', null, 0.4);
  }
  function cycle(d) { const own = ORDER.filter((w) => P.inventory.includes(w)); if (own.length < 2) return; const i = Math.max(0, own.indexOf(P.weapon)); select(own[(i + d + own.length) % own.length]); }
  function selectSlot(n) { const own = ORDER.filter((w) => P.inventory.includes(w) && WEAP[w].slot === n); if (!own.length) return; select(own[(own.indexOf(P.weapon) + 1) % own.length]); }
  function fillClip(k) { const d = WEAP[k]; if (!d || d.melee) return; P.clip[k] = Math.min(eff(k).clip || 1, P.ammo[k] || 0); }

  // ---- public API (gun store, pickups, police trunks, interiors bench)
  function give(key, ammo, opts = {}) {
    const d = WEAP[key]; if (!d) return false;
    const had = P.inventory.includes(key);
    if (!had) P.inventory.push(key);
    if (!d.melee) { P.ammo[key] = (P.ammo[key] || 0) + (ammo ?? d.ammoPick ?? 30); if (!had || !(P.clip[key] > 0)) fillClip(key); }
    if (key === 'bottle') P.bottleBroken = false;
    if (!had && opts.select !== false) { P.weapon = key; reloadT = 0; game.emit?.('weaponChange', { weapon: key }); }
    game.emit?.('inventoryChange', { key, had });
    return true;
  }
  function take(key) { const i = P.inventory.indexOf(key); if (i < 0 || key === 'fist') return false; P.inventory.splice(i, 1); if (P.weapon === key) { P.weapon = 'fist'; game.emit?.('weaponChange', { weapon: 'fist' }); } game.emit?.('inventoryChange', { key, removed: true }); return true; }
  function buyAmmo(key, n) {
    const d = WEAP[key]; if (!d || d.melee) return false;
    if (d.throw && !P.inventory.includes(key)) P.inventory.push(key);
    P.ammo[key] = (P.ammo[key] || 0) + (n ?? d.ammoPack ?? 30);
    if (!(P.clip[key] > 0)) fillClip(key);
    return true;
  }
  // attachments: catalog(k) lists what fits; setAttachment fits an owned (or free) part; buyAttachment pays for it first
  function catalog(k) {
    const ok = WEAPON_ATTACH[k]; if (!ok) return [];
    const m = mods(k), out = [];
    for (const slot of ['sight', 'mag', 'muzzle', 'grip']) for (const v of ok[slot]) { const info = ATTACH_INFO[slot][v]; out.push({ slot, value: v, name: info.name, price: info.price, owned: info.price === 0 || !!m.owned[slot + ':' + v], fitted: (m[slot] || DEFAULT_ATTACH[k][slot]) === v }); }
    for (const slot of ['laser', 'light']) if (ok[slot]) out.push({ slot, value: true, name: ATTACH_INFO[slot].name, price: ATTACH_INFO[slot].price, owned: !!m.owned[slot + ':true'], fitted: !!m[slot] });
    for (const s of SKINS) out.push({ slot: 'skin', value: s.key, name: s.name, price: s.price, owned: s.price === 0 || !!m.owned['skin:' + s.key], fitted: (m.skin || 'factory') === s.key });
    return out;
  }
  function setAttachment(k, slot, value, opts = {}) {
    const ok = WEAPON_ATTACH[k]; if (!ok && slot !== 'skin') return false;
    const m = mods(k);
    if (slot === 'skin') { if (!SKINS.some((s) => s.key === value)) return false; }
    else if (slot === 'laser' || slot === 'light') { if (!ok[slot]) return false; value = !!value; }
    else if (!ok[slot] || !ok[slot].includes(value)) return false;
    const id = slot + ':' + value, info = slot === 'skin' ? SKINS.find((s) => s.key === value) : (slot === 'laser' || slot === 'light') ? ATTACH_INFO[slot] : ATTACH_INFO[slot][value];
    if (value !== false && info.price > 0 && !m.owned[id] && !opts.free) return false;
    if (opts.free && value !== false) m.owned[id] = true;
    m[slot] = value; effCache.delete(k); dropModel(k);
    if (isGun(k) && (P.clip[k] || 0) > eff(k).clip) P.clip[k] = eff(k).clip;
    game.emit?.('weaponModsChange', { weapon: k, slot, value });
    return true;
  }
  function buyAttachment(k, slot, value) {
    const m = mods(k), id = slot + ':' + value;
    const info = slot === 'skin' ? SKINS.find((s) => s.key === value) : (slot === 'laser' || slot === 'light') ? ATTACH_INFO[slot] : ATTACH_INFO[slot]?.[value];
    if (!info) return { ok: false, reason: 'unknown' };
    if (!m.owned[id] && info.price > 0) { if ((P.money || 0) < info.price) return { ok: false, reason: 'money' }; P.money -= info.price; m.owned[id] = true; sfx(game, 'cash', null, 0.6); }
    return { ok: setAttachment(k, slot, value), price: info.price };
  }
  const api = {
    defs: WEAP, order: ORDER, give, take, buyAmmo, select, has: (k) => P.inventory.includes(k), isGun,
    clip: (k = P.weapon) => P.clip[k] ?? 0, get reloading() { return reloadT > 0; },
    eff, mods, catalog, setAttachment, buyAttachment, skins: SKINS, attachInfo: ATTACH_INFO, attachSlots: WEAPON_ATTACH,
    buildModel: (k, o) => buildWeaponModel(k, Object.assign({ attachments: mods(k), skin: mods(k).skin }, o)),
    heldModel: () => held[P.weapon] || null,
    spread: () => curSpread, aimState: () => ({ aiming: P.aiming, scoped, zoom: aimZoom, sway: eff(P.weapon).sway || 1, scopeFov }),
  };
  game.weapons = api;

  // ---- held weapon models (built on demand with the weapon's current attachments and skin)
  const held = {};
  function dropModel(k) { const m = held[k]; if (m) { if (m === gfxRigOwner) gfxRigOwner = null; scene.remove(m); delete held[k]; } }
  function model(k) {
    if (k === 'fist' || !WEAP[k]) return null;
    let m = held[k]; const broken = k === 'bottle' && !!P.bottleBroken;
    if (m && m.userData._broken !== broken) { dropModel(k); m = null; }
    if (!m) { const mm = mods(k); m = buildWeaponModel(k, { attachments: mm, skin: mm.skin, broken }); m.userData._broken = broken; m.visible = false; scene.add(m); held[k] = m; }
    return m;
  }
  let gfxRigOwner = null;
  let playerRoot = null, handBone = null, lookT = 0;
  const bones = {};
  const _hand = new THREE.Vector3(), _fwd = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

  const gfx = createGunFX(game);
  G.gfx = gfx; C.gfx = gfx;
  let recoilAnim = 0;
  const _ej = new THREE.Vector3(), _rv = new THREE.Vector3(), _fv = new THREE.Vector3();
  function ejectFrom(m, type, n = 1, down = false) {
    if (!m || !m.visible) return;
    for (let i = 0; i < n; i++) {
      const e = m.userData.eject || new THREE.Vector3(-0.02, 0.02, 0.03);
      m.localToWorld(_ej.copy(e));
      _rv.set(-1, 0, 0).applyQuaternion(m.quaternion); _fv.set(0, 0, 1).applyQuaternion(m.quaternion);   // -X is the gun's right-hand side
      const pv = P.velocity || { x: 0, y: 0, z: 0 };
      const v = down ? new THREE.Vector3(rand(-0.3, 0.3), -0.5, rand(-0.3, 0.3)) : _rv.clone().multiplyScalar(rand(1.6, 2.6)).add(new THREE.Vector3(0, rand(1.2, 2.0), 0)).addScaledVector(_fv, rand(-0.6, 0.1));
      v.x += pv.x || 0; v.z += pv.z || 0;
      gfx.eject(type, _ej, v);
    }
  }
  // tracer entry point used by other modules (police fire): also raises the near-miss hook for bullets passing the player
  function tracer(a, b, o) {
    gfx.tracer(a, b, o);
    try {
      const hx = P.position.x, hy = P.position.y + 1.6, hz = P.position.z;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz; if (L2 < 1) return;
      const t = Math.max(0, Math.min(1, ((hx - a.x) * dx + (hy - a.y) * dy + (hz - a.z) * dz) / L2));
      const cx = a.x + dx * t, cy = a.y + dy * t, cz = a.z + dz * t, d = Math.hypot(cx - hx, cy - hy, cz - hz);
      if (d > 0.45 && d < 3.2 && t > 0.02 && !(o && o.own)) { const L = Math.sqrt(L2); nearMiss(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(dx / L, dy / L, dz / L), d, 'player'); }
    } catch (e) { /* */ }
  }
  G.tracer = tracer;
  function nearMiss(position, dir, distance, target) {
    game.emit?.('nearMiss', { position, dir, distance, target });   // AUDIO: play a whizz / crack here; peds: flinch
    if (target === 'player') { sfx(game, 'ricochet', position, Math.max(0.15, 0.5 - distance * 0.12)); G.shake = Math.max(G.shake || 0, 0.004); }
  }
  C.nearMiss = nearMiss;

  // ---- hit resolution
  function resolveCollider(col) {
    if (!col) return { kind: 'world' };
    const h = col.handle;
    const cop = G.police?.byHandle?.get(h);
    if (cop) return { kind: 'cop', obj: cop };
    for (const ped of game.peds?.list || []) if (ped.collider && ped.collider.handle === h) return { kind: 'ped', obj: ped };
    let body = null; try { body = col.parent(); } catch (e) { /* ignore */ }
    if (body) for (const v of game.vehicles?.list || []) if (v.body && v.body.handle === body.handle) return { kind: 'vehicle', obj: v };
    return { kind: 'world', body };
  }
  G.resolveCollider = resolveCollider;

  // ---- scope overlay (original design: amber ring, ranging ticks)
  const scopeEl = document.createElement('div');
  scopeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;display:none;';
  scopeEl.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">
    <defs><mask id="gpScopeMask"><rect width="1000" height="1000" fill="white"/><circle cx="500" cy="500" r="330" fill="black"/></mask>
    <radialGradient id="gpScopeVig" cx="50%" cy="50%" r="50%"><stop offset="78%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.55)"/></radialGradient></defs>
    <rect width="1000" height="1000" fill="#05070a" mask="url(#gpScopeMask)"/>
    <circle cx="500" cy="500" r="330" fill="url(#gpScopeVig)"/>
    <circle cx="500" cy="500" r="330" fill="none" stroke="#ffb347" stroke-width="3" opacity=".8"/>
    <circle cx="500" cy="500" r="318" fill="none" stroke="#ffb347" stroke-width="1" opacity=".35" stroke-dasharray="2 10"/>
    <g stroke="#ffd9a0" stroke-width="1.6" opacity=".9">
      <line x1="170" y1="500" x2="470" y2="500"/><line x1="530" y1="500" x2="830" y2="500"/>
      <line x1="500" y1="170" x2="500" y2="470"/><line x1="500" y1="530" x2="500" y2="830"/>
      ${[1, 2, 3, 4].map((i) => `<line x1="${500 - 6}" y1="${500 + i * 40}" x2="${500 + 6}" y2="${500 + i * 40}"/><line x1="${500 + i * 40}" y1="494" x2="${500 + i * 40}" y2="506"/><line x1="${500 - i * 40}" y1="494" x2="${500 - i * 40}" y2="506"/>`).join('')}
    </g>
    <circle cx="500" cy="500" r="3" fill="#ff4d3a"/>
    <path d="M 500 500 m -70 0 a 70 70 0 0 1 140 0" fill="none" stroke="#ffb347" stroke-width="1" opacity=".5"/>
    <text id="gpScopeTxt" x="560" y="700" fill="#ffb347" font-family="monospace" font-size="18" opacity=".85">---m</text>
    <text id="gpScopeBreath" x="440" y="700" text-anchor="end" fill="#ffb347" font-family="monospace" font-size="16" opacity=".85"></text>
    <text x="500" y="300" text-anchor="middle" fill="#ffb347" font-family="monospace" font-size="14" opacity=".55">SALTWORKS OPTICS 6-12x</text>
  </svg>`;
  document.body.appendChild(scopeEl);
  const scopeTxt = scopeEl.querySelector('#gpScopeTxt'), scopeBreath = scopeEl.querySelector('#gpScopeBreath');
  let scoped = false, scopeZoom = 1, hiddenByScope = false, aimZoom = 1;

  // ---- firing
  let cd = 0, lastShootCrime = -99, recoilV = 0, recoilAcc = 0, burst = 0, lastShotT = -9, bloom = 0, curSpread = 0;
  const F = RAPIER.QueryFilterFlags;
  function camDir(out) { return camera.getWorldDirection(out); }
  // where the crosshair points in the world (first thing along the camera ray beyond the player), or a far point
  function aimPoint(out, range) {
    const cam = camera.position, d = camDir(_fwd);
    const chestT = Math.max(0, (P.position.x - cam.x) * d.x + (P.position.y + 1.3 - cam.y) * d.y + (P.position.z - cam.z) * d.z);
    let t = range;
    try {
      const o = { x: cam.x + d.x * chestT, y: cam.y + d.y * chestT, z: cam.z + d.z * chestT };
      const h = world.castRay(new RAPIER.Ray(o, { x: d.x, y: d.y, z: d.z }), range, true, F.EXCLUDE_SENSORS, undefined, P.collider || undefined, (P.state.inVehicle && P.state.vehicle?.body) || undefined);
      if (h) t = Math.max(1.2, h.timeOfImpact ?? h.toi);
      const lim = rayLimbs(o, d, t, hitTargets(game, G, null, 0)); if (lim) t = Math.max(1.0, lim.t);
      return out.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
    } catch (e) { return out.copy(cam).addScaledVector(d, range); }
  }
  function muzzlePos(out) {
    const veh = P.state.inVehicle && P.state.vehicle;
    if (veh) { try { const sp = veh.seatPosition ? veh.seatPosition() : veh.mesh.position; camDir(_fwd); return out.set(sp.x + _fwd.x * 0.9, sp.y + 0.45, sp.z + _fwd.z * 0.9); } catch (e) { /* fall through */ } }
    const m = held[P.weapon];
    if (m && m.visible && m.userData.muzzle) return m.localToWorld(out.copy(m.userData.muzzle));
    return out.set(P.position.x, P.position.y + 1.4, P.position.z);
  }
  // bullets leave from inside the player's capsule at shoulder height (never from inside a wall the gun pokes into)
  function fireOrigin(out, aim) {
    if (C.fireOrigin) return out.copy(C.fireOrigin);                 // cover blind fire: the raised hand
    if (P.state.inVehicle) return muzzlePos(out);
    out.set(P.position.x, P.position.y + 1.42, P.position.z);
    _v.subVectors(aim, out).setY(0); if (_v.lengthSq() > 1e-4) out.addScaledVector(_v.normalize(), 0.22);
    return out;
  }
  function shootCrime(e) {
    const now = game.clock.elapsed;
    if (now - lastShootCrime < 2.5) return;
    if (e.suppressed) { // only someone close enough to hear the action cycle reports it
      const near = livingNear(game, P.position, e.loud).some((t) => t.kind !== 'npc');
      if (!near) return;
    }
    lastShootCrime = now; G.reportCrime?.('shooting', P.position.clone());
  }
  function startReload() {
    const k = P.weapon, d = eff(k);
    if (!isGun(k) || reloadT > 0) return;
    if ((P.clip[k] || 0) >= d.clip || (P.ammo[k] || 0) <= (P.clip[k] || 0)) return;
    reloadT = d.reload; reloadKey = k; reloadStage = 0;
    sfx(game, 'reload', P.position, 0.7); game.emit?.('reload', { weapon: k });
  }
  // one bullet / pellet: muzzle -> ... through whatever it can penetrate, with at most one ricochet
  const _n = new THREE.Vector3();
  function shootRay(o, dir, w, k, targets, visFrom) {
    let ox = o.x, oy = o.y, oz = o.z, dx = dir.x, dy = dir.y, dz = dir.z;
    let range = w.range, scale = 1, segs = 0, bounced = false, wet = false, exitBlood = false, travelled = 0, anyHit = false;
    const pen = w.pen || 0.6, from = visFrom.clone(), end = new THREE.Vector3();
    const sea = game.city?.seaLevel ?? -0.12, excludeBody = (P.state.inVehicle && P.state.vehicle?.body) || undefined;
    const done = new Set();
    while (range > 0.4 && scale > 0.08 && segs++ < 6) {
      const O = { x: ox, y: oy, z: oz }, D = { x: dx, y: dy, z: dz };
      let hit = null;
      // world + vehicles + ragdolls (kinematic character capsules are skipped: limbs are tested analytically)
      try { hit = world.castRayAndGetNormal(new RAPIER.Ray(O, D), range, true, F.EXCLUDE_SENSORS | F.EXCLUDE_KINEMATIC, undefined, P.collider || undefined, excludeBody); } catch (e) { hit = null; }
      let toi = hit ? (hit.timeOfImpact ?? hit.toi) : range;
      if (!wet && dy < -1e-4 && oy > sea) {                         // crossing the water surface
        const tw = (sea - oy) / dy;
        if (tw < toi && game.city?.isWater?.(ox + dx * tw, oz + dz * tw)) {
          wet = true; const wp = new THREE.Vector3(ox + dx * tw, sea, oz + dz * tw);
          gfx.impact({ point: wp, normal: _n.set(0, 1, 0), material: 'water', power: Math.min(1.5, w.dmg / 40) });
          game.emit?.('hit', { target: 'world', object: null, point: wp, normal: new THREE.Vector3(0, 1, 0), damage: 0, kind: 'bullet', byPlayer: true, surface: 'water', fxHandled: true });
          const lim = tw + MATERIALS.water.pen * pen; if (toi > lim) { toi = lim; hit = null; range = lim; }
        }
      }
      const live = done.size ? targets.filter((t) => !done.has(t.obj)) : targets;
      const limb = live.length ? rayLimbs(O, D, toi, live) : null;
      if (limb) {
        let dmg = w.dmg * scale * (w.cls === 'shotgun' ? Math.max(0.25, 1 - (travelled + limb.t) / w.range) : 1) * limb.mult;
        const strength = Math.min(1, dmg / 100), dv = new THREE.Vector3(dx, dy, dz);
        const info = { zone: limb.zone, limb: limb.limb, point: limb.point, strength, byPlayer: true, weapon: k };
        const was = limb.target.obj.health ?? 100;
        damageTarget(game, limb.target, dmg, dv, 'bullet', info);
        limbReaction(limb.target, limb, dmg, dv);
        gfx.blood(limb.point, dv, 0.5 + strength);
        G.lastConfirmedHit = game.clock.elapsed; anyHit = true; done.add(limb.target.obj);
        const o2 = limb.target.obj, dead = !!(o2.dead || o2.state === 'dead' || (o2.health ?? 1) <= 0);
        game.emit?.('hitConfirm', { zone: limb.zone, limb: limb.limb, kill: dead && was > 0, damage: dmg, target: limb.target, point: limb.point });
        if (pen >= 0.9 && scale > 0.3) { scale *= 0.5; const adv = limb.t + 0.4; ox += dx * adv; oy += dy * adv; oz += dz * adv; range -= adv; travelled += adv; exitBlood = true; continue; }
        end.copy(limb.point); break;
      }
      if (!hit) { end.set(ox + dx * toi, oy + dy * toi, oz + dz * toi); break; }
      const point = new THREE.Vector3(ox + dx * toi, oy + dy * toi, oz + dz * toi);
      const nrm = hit.normal ? new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) : new THREE.Vector3(-dx, -dy, -dz);
      const dv = new THREE.Vector3(dx, dy, dz);
      const dmg = w.dmg * scale * (w.cls === 'shotgun' ? Math.max(0.25, 1 - (travelled + toi) / w.range) : 1);
      let material = materialOf(game, hit.collider, point, nrm);
      const dres = tryCall('destructibles.hit', () => game.destructibles?.hitCollider?.(hit.collider, { point, normal: nrm, dir: dv, damage: dmg, kind: 'bullet', weapon: k, byPlayer: true }), null);
      if (dres?.material) material = dres.material;
      const tag = C.materials.get(hit.collider.handle); if (tag?.onHit) tryCall('material.onHit', () => tag.onHit({ point, normal: nrm, dir: dv, damage: dmg, kind: 'bullet', weapon: k }));
      const M = MATERIALS[material] || MATERIALS.concrete;
      const r = resolveCollider(hit.collider);
      let dynamic = false;
      if (r.kind === 'vehicle') {
        const v = r.obj; dynamic = true;
        v.health = (v.health ?? 1000) - dmg * 2;
        tryCall('v.damage', () => v.damage?.(dmg * 2, null, { point, normal: nrm, dir: dv, kind: 'bullet', weapon: k }));
        if (w.cls === 'sniper' || w.cls === 'shotgun') tryCall('impulse', () => v.body.applyImpulseAtPoint({ x: dx * dmg * 4, y: 0, z: dz * dmg * 4 }, { x: point.x, y: point.y, z: point.z }, true));
        emitHit({ target: 'vehicle', object: v, point, normal: nrm, damage: dmg, kind: 'bullet', byPlayer: true, surface: 'metal', weapon: k });
        if ((v.police || v.typeKey === 'police') && !v.playerDriven) G.reportCrime?.('cop_assault', point);
      } else {
        tryCall('body push', () => { const b = hit.collider.parent(); if (b && b.isDynamic()) { dynamic = true; b.applyImpulseAtPoint({ x: dx * dmg * 0.06, y: dy * dmg * 0.06, z: dz * dmg * 0.06 }, { x: point.x, y: point.y, z: point.z }, true); } });
        emitHit({ target: 'world', object: null, point, normal: nrm, damage: dmg, kind: 'bullet', byPlayer: true, surface: material, weapon: k });
      }
      if (!dres?.consumed) gfx.impact({ point, normal: nrm, material, dir: dv, power: Math.min(1.5, w.dmg / 40), dynamic });
      if (exitBlood && toi < 3.2 && !dynamic) { gfx.decal('blood', point, nrm, rand(0.35, 0.7), 50); exitBlood = false; }
      game.emit?.('bulletImpact', { point, normal: nrm, material, weapon: k, byPlayer: true });
      // ricochet off hard surfaces at a grazing angle
      const cosI = -(dx * nrm.x + dy * nrm.y + dz * nrm.z);
      if (!bounced && M.ric > 0 && cosI < 0.38 && cosI > 0 && Math.random() < M.ric * (1.2 - cosI / 0.38 * 0.6)) {
        gfx.tracer(from, point, { speed: w.vel, own: true }); from.copy(point);
        dx += 2 * cosI * nrm.x + rand(-0.06, 0.06); dy += 2 * cosI * nrm.y + rand(-0.03, 0.06); dz += 2 * cosI * nrm.z + rand(-0.06, 0.06);
        const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        ox = point.x + nrm.x * 0.02; oy = point.y + nrm.y * 0.02; oz = point.z + nrm.z * 0.02;
        travelled += toi; range = Math.min(range - toi, 70); scale *= 0.5; bounced = true;
        sfx(game, 'ricochet', point, 0.7); game.emit?.('ricochet', { point, dir: new THREE.Vector3(dx, dy, dz), weapon: k });
        continue;
      }
      // penetration: how thick is this thing along the bullet's path?
      const maxPen = M.pen * pen;
      let exitT = -1;
      try { exitT = hit.collider.castRay(new RAPIER.Ray({ x: point.x + dx * 0.012, y: point.y + dy * 0.012, z: point.z + dz * 0.012 }, D), maxPen + 0.3, false); } catch (e) { exitT = -1; }
      if (exitT >= 0 && exitT + 0.012 <= maxPen) {
        const th = exitT + 0.012, ex = new THREE.Vector3(point.x + dx * (th + 0.01), point.y + dy * (th + 0.01), point.z + dz * (th + 0.01));
        if (th > 0.03 && !dynamic && !dres?.consumed) gfx.impact({ point: ex, normal: dv, material, dir: dv, power: Math.min(1.5, w.dmg / 40), exit: true });
        scale *= 1 - 0.65 * (th / maxPen);
        dx += rand(-0.012, 0.012); dy += rand(-0.012, 0.012); dz += rand(-0.012, 0.012); const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        ox = ex.x; oy = ex.y; oz = ex.z; travelled += toi + th; range -= toi + th;
        game.emit?.('penetrate', { point, exit: ex, material, thickness: th, weapon: k });
        continue;
      }
      end.copy(point); break;
    }
    if (segs >= 6 || range <= 0.4 || scale <= 0.08) { if (end.lengthSq() === 0) end.set(ox, oy, oz); }
    gfx.tracer(from, end, { speed: w.vel, own: true });
    // near misses make people flinch
    if (!anyHit) for (const t of targets) {
      if (done.has(t.obj)) continue;
      const hx = t.pos.x, hy = t.pos.y + 1.5, hz = t.pos.z, ax = end.x - from.x, ay = end.y - from.y, az = end.z - from.z, L2 = ax * ax + ay * ay + az * az; if (L2 < 1) continue;
      const tt = Math.max(0, Math.min(1, ((hx - from.x) * ax + (hy - from.y) * ay + (hz - from.z) * az) / L2));
      const d = Math.hypot(from.x + ax * tt - hx, from.y + ay * tt - hy, from.z + az * tt - hz);
      if (d < 1.3) { nearMiss(new THREE.Vector3(from.x + ax * tt, from.y + ay * tt, from.z + az * tt), dir.clone(), d, t); if (t.kind === 'ped' && !t.obj.dead) { t.obj.hitNow = true; t.obj._gpScaredT = game.clock.elapsed; } }
    }
    return anyHit;
  }
  // 'hit' is also consumed by fx.js (generic impact puff): our own per-surface impact replaces it for world hits
  function emitHit(d) {
    const fx = game.fx, bi = fx && fx.bulletImpact;
    if (bi && d.target === 'world') fx.bulletImpact = () => {};
    try { d.fxHandled = true; game.emit?.('hit', d); } finally { if (bi && d.target === 'world') fx.bulletImpact = bi; }
  }
  // per-limb reactions on someone who survived the hit
  function limbReaction(target, limb, dmg, dir) {
    const o = target.obj; if (!o || o.dead || o.state === 'dead' || (o.health ?? 1) <= 0) return;
    const now = game.clock.elapsed, R = (o._react ||= { limp: 0, limpSide: 1, flinch: 0, fdir: new THREE.Vector3(), arm: 0, zone: null });
    R.flinch = now; R.fdir.copy(dir); R.zone = limb.zone; R.limb = limb.limb;
    if (limb.zone === 'leg') { R.limp = now + 14; R.limpSide = /_l$/.test(limb.limb) ? 1 : -1; if (dmg > 22 && o.knock?.set) { o.knock.set(dir.x * 0.6, 0, dir.z * 0.6); o.shoveT = 0.6; } }
    if (limb.zone === 'arm' && dmg > 8) {
      R.arm = now + 6;
      // a hit to the gun arm makes them drop what they hold
      if (/_r$/.test(limb.limb) || Math.random() < 0.35) dropHeld(target, dir);
    }
    if (limb.zone === 'torso' && dmg > 25 && o.knock?.set) { o.knock.set(dir.x * 1.8, 0, dir.z * 1.8); o.shoveT = 0.45; }
    reacting.add(target);
  }
  function dropHeld(target, dir) {
    const o = target.obj;
    if (target.kind === 'cop' && o.gun && !o.disarmed) {
      o.disarmed = true; o.disarmedUntil = game.clock.elapsed + 7; o.gun.visible = false;
      tryCall('drop cop gun', () => G.pickups?.spawn?.(o.gunKey && WEAP[o.gunKey] ? o.gunKey : 'pistol', o.pos.clone().add(new THREE.Vector3(dir.x * 0.8 + rand(-0.3, 0.3), 0.05, dir.z * 0.8 + rand(-0.3, 0.3))), { temp: true, life: 40, ammo: 12 }));
      game.emit?.('combat:disarm', { target: o, kind: target.kind });
    } else if (o.armedWith) {
      const key = o.armedWith; o.armedWith = null; if (o.weaponMesh) o.weaponMesh.visible = false;
      tryCall('drop weapon', () => G.pickups?.spawn?.(key, o.pos.clone().add(new THREE.Vector3(dir.x * 0.8, 0.05, dir.z * 0.8)), { temp: true, life: 40, ammo: 10 }));
      game.emit?.('combat:disarm', { target: o, kind: target.kind, weapon: key });
    }
  }
  // limp / flinch / arm-hang poses, applied after everyone's animation update (see update())
  const reacting = new Set();
  const _ax = new THREE.Vector3(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
  function rot(bone, ax, ang) { if (!bone || !bone.parent) return; bone.parent.getWorldQuaternion(_pq); _ax.copy(ax).applyQuaternion(_pq.invert()).normalize(); bone.quaternion.premultiply(_rq.setFromAxisAngle(_ax, ang)); }
  function reactionsTick(dt) {
    const now = game.clock.elapsed;
    for (const t of reacting) {
      const o = t.obj, R = o._react, ch = t.char || o.char;
      if (!R || !ch?.getBone || o.dead || o.state === 'dead' || o.state === 'down' || o.rag) { if (o.dead || !R) reacting.delete(t); continue; }
      const limping = R.limp > now, hang = R.arm > now, fl = Math.max(0, 1 - (now - R.flinch) / 0.45);
      if (!limping && !hang && fl <= 0) { reacting.delete(t); continue; }
      const hd = o.heading ?? ch.root.rotation.y, right = _a.set(-Math.cos(hd), 0, Math.sin(hd)), fwd = _b.set(Math.sin(hd), 0, Math.cos(hd));
      if (limping) {
        // slow them down (their own mover keeps going; the knock term subtracts part of it) and dip onto the bad leg
        const sp = o.speed ?? 0; if (o.knock && o.shoveT <= 0 && sp > 0.5) { o.knock.x = -fwd.x * sp * 0.45; o.knock.z = -fwd.z * sp * 0.45; }
        const ph = Math.sin(now * 7.5), side = R.limpSide, bone = side > 0 ? 'LeftUpLeg' : 'RightUpLeg', shin = side > 0 ? 'LeftLeg' : 'RightLeg';
        rot(ch.getBone('Spine'), fwd, side * (0.1 + 0.06 * ph)); rot(ch.getBone('Spine'), right, 0.12);
        rot(ch.getBone(bone), right, -0.16); rot(ch.getBone(shin), right, 0.3);
        const hips = ch.getBone('Hips'); if (hips) hips.position.y -= 0.035 * (1 + ph) * (hips.position.y > 10 ? 100 : 1) * 0.5;
      }
      if (hang) { const arm = ch.getBone('RightArm'), fa = ch.getBone('RightForeArm'); rot(arm, fwd, -0.9); rot(fa, right, 0.4); rot(ch.getBone('Spine1'), fwd, -0.12); }
      if (fl > 0) { const k = fl * fl, side = Math.sign(R.fdir.x * right.x + R.fdir.z * right.z) || 1; rot(ch.getBone('Spine1'), right, (R.zone === 'head' ? -0.5 : 0.35) * k * -Math.sign(R.fdir.x * fwd.x + R.fdir.z * fwd.z || 1)); rot(ch.getBone('Spine2'), _v.set(0, 1, 0), side * 0.4 * k); rot(ch.getBone('Head'), right, -0.3 * k); }
    }
  }
  function fire() {
    const k = P.weapon, w = eff(k);
    if ((P.clip[k] || 0) <= 0) { if ((P.ammo[k] || 0) > 0) startReload(); else { sfx(game, 'empty'); cd = 0.3; } return; }
    P.clip[k]--; P.ammo[k] = Math.max(0, (P.ammo[k] || 0) - 1);
    cd = w.rate; lookT = 0.9; G.combatT = 0;
    const now = game.clock.elapsed;
    burst = now - lastShotT < Math.max(0.3, w.rate * 2.2) ? burst + 1 : 0; lastShotT = now;
    const laserOn = w.laser && laserWanted;
    let spreadBase = (P.aiming ? w.spread : w.hip * (laserOn ? w.laserHip : 1)) + bloom + Math.min(0.03, (P.state.speed || 0) * 0.004) + (P.state.grounded === false ? 0.03 : 0);
    if (scoped) spreadBase = w.spread + Math.min(0.02, (P.state.speed || 0) * 0.006) + bloom * 0.3;
    if (C.blindFire) spreadBase = w.hip * 1.7 + bloom;
    curSpread = spreadBase;
    const aim = aimPoint(new THREE.Vector3(), w.range);
    const hm = held[k]; if (hm) hm.updateMatrixWorld(true);
    const muzzle = muzzlePos(new THREE.Vector3());
    const o = fireOrigin(new THREE.Vector3(), aim);
    const base = new THREE.Vector3().subVectors(aim, o); if (base.lengthSq() < 0.01) camDir(base); base.normalize();
    const targets = hitTargets(game, G, null, 0);
    // perpendicular basis for an angular spread disc
    const up = Math.abs(base.y) > 0.95 ? _a.set(1, 0, 0) : _a.set(0, 1, 0), sx = new THREE.Vector3().crossVectors(base, up).normalize(), sy = new THREE.Vector3().crossVectors(sx, base);
    for (let n = 0; n < w.pellets; n++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spreadBase * (w.pellets > 1 ? 1 : 1);
      const dir = base.clone().addScaledVector(sx, Math.cos(a) * r).addScaledVector(sy, Math.sin(a) * r).normalize();
      shootRay(o, dir, w, k, targets, muzzle);
    }
    if (!game.audio?.play) sfx(game, w.snd, muzzle, w.suppressed ? 0.25 : 1, w.tone);
    if (hm && hm.visible) {
      gfx.flash(hm, hm.userData.flash || 'pistol'); gfxRigOwner = hm;
      const ct = w.cls === 'shotgun' ? 'shell' : (w.cls === 'rifle' || w.cls === 'sniper') ? 'rifle' : 'pistol';
      if (k === 'shotgun') act.pump = 0.001; else if (k === 'sniper') act.bolt = 0.001; else if (k !== 'revolver' && k !== 'sawnoff') ejectFrom(hm, ct);
      act.slide = 1; act.trigger = 1; if (k === 'revolver') act.cylTarget += Math.PI / 3; act.hammer = 0;
    }
    recoilAnim = Math.min(1.5, recoilAnim + 1);
    const ev = { origin: muzzle.clone(), dir: base.clone(), weapon: k, sound: w.snd, cls: w.cls, byPlayer: true, suppressed: !!w.suppressed, loud: w.loud };
    if (w.suppressed) {
      // quiet shot: no global 'shot' event (peds panic on it from 40 m); only people within earshot react
      game.emit?.('shot:suppressed', ev);
      tryCall('audio', () => game.audio?.play?.(w.snd, { position: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, volume: 0.2, nodedupe: true }));
      tryCall('panic', () => game.peds?.panic?.(muzzle.x, muzzle.z, w.loud, 'shot'));
    } else game.emit?.('shot', ev);
    C.noise(muzzle, w.loud, 'shot');
    // recoil pattern
    const pt = PATTERN[w.cls] || PATTERN.handgun, idx = burst < pt.p.length ? burst : pt.loop + ((burst - pt.loop) % Math.max(1, pt.p.length - pt.loop));
    const [py, pp] = pt.p[idx] || pt.p[0], aimMul = (P.aiming ? 0.8 : 1) * (scoped ? 1.6 : 1) * (P.state.inVehicle ? 0.7 : 1);
    recoilV += w.kick * pp * aimMul;
    game.cameraYaw += (py * 0.55 + rand(-0.12, 0.12)) * w.kick * aimMul;
    bloom = Math.min(0.06, bloom + w.bloomPer);
    shootCrime(ev);
    if ((P.clip[k] || 0) <= 0 && (P.ammo[k] || 0) > 0) setTimeout(() => { if (P.weapon === k) startReload(); }, 220);
    else if ((P.ammo[k] || 0) <= 0) tryCall('notify', () => game.hud?.notify?.('Out of ammo', 1500));
  }
  // moving-part state of the held gun: slide/bolt kick, trigger, pump and bolt cycles, revolver cylinder, reload magazine
  const act = { slide: 0, trigger: 0, pump: 0, bolt: 0, cyl: 0, cylTarget: 0, hammer: 1, mag: 0, breech: 0 };
  function actionTick(dt, k, w, m) {
    act.slide = Math.max(0, act.slide - dt * 16); act.trigger = Math.max(0, act.trigger - dt * 9); act.hammer = Math.min(1, act.hammer + dt * 3.5);
    act.cyl += (act.cylTarget - act.cyl) * Math.min(1, dt * 22);
    if (act.pump > 0) { const was = act.pump; act.pump += dt; if (was < 0.3 && act.pump >= 0.3) { ejectFrom(m, 'shell'); sfx(game, 'reload', P.position, 0.5); } if (act.pump > 0.62) act.pump = 0; }
    if (act.bolt > 0) { const was = act.bolt; act.bolt += dt; if (was < 0.5 && act.bolt >= 0.5) { ejectFrom(m, 'rifle'); sfx(game, 'reload', P.position, 0.45); } if (act.bolt > 1.0) act.bolt = 0; }
    if (!m || !m.userData.animate) return;
    const empty = isGun(k) && (P.clip[k] || 0) <= 0 && reloadT <= 0;
    const tri = (t, a, b2) => (t <= a ? 0 : t < (a + b2) / 2 ? (t - a) / ((b2 - a) / 2) : t < b2 ? 1 - (t - (a + b2) / 2) / ((b2 - a) / 2) : 0);
    const s = { trigger: act.trigger };
    let magOut = 0, breech = 0;
    if (reloadT > 0 && reloadKey === k) {
      const u = 1 - reloadT / w.reload;   // 0..1
      magOut = u < 0.18 ? 0 : u < 0.34 ? (u - 0.18) / 0.16 : u < 0.58 ? 1 : u < 0.76 ? 1 - (u - 0.58) / 0.18 : 0;
      breech = u < 0.15 ? u / 0.15 : u < 0.8 ? 1 : (1 - u) / 0.2;
    }
    if (k === 'pistol' || k === 'microsmg' || k === 'smg' || k === 'rifle' || k === 'carbine') { const back = Math.max(empty ? 1 : 0, act.slide, reloadT > 0 && (P.clip[k] || 0) <= 0 ? 1 : 0); s.slide = back; s.bolt = back; s.magOut = magOut; if (k === 'rifle' || k === 'carbine') s.cover = 1; }
    else if (k === 'revolver') { s.cylinder = act.cyl; s.hammer = 1 - act.hammer; }
    else if (k === 'shotgun') { s.pump = tri(act.pump, 0.22, 0.6); s.bolt = s.pump; }
    else if (k === 'sawnoff') { s.breech = breech; s.hammer = 1 - act.hammer; }
    else if (k === 'sniper') { s.boltHandle = tri(act.bolt, 0.3, 0.95); s.magOut = magOut; }
    m.userData.animate(s);
  }

  // ---- thrown weapons: frag grenades and molotovs
  const thrown = [];
  function throwVel(out) {
    camDir(_fwd);
    const pitch = Math.max(-0.2, Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)) + 0.32), yaw = Math.atan2(_fwd.x, _fwd.z), sp = 17;
    return out.set(Math.sin(yaw) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, Math.cos(yaw) * Math.cos(pitch) * sp);
  }
  function throwOrigin(out) { if (handBone) handBone.getWorldPosition(out); else out.set(P.position.x, P.position.y + 1.5, P.position.z); out.y = Math.max(out.y, P.position.y + 1.4); return out; }
  function throwItem() {
    const k = P.weapon, W = WEAP[k];
    if ((P.ammo[k] || 0) <= 0) { sfx(game, 'empty'); cd = 0.4; return; }
    P.ammo[k]--; P.clip[k] = Math.min(1, P.ammo[k]);
    cd = W.rate; lookT = 0.8; G.combatT = 0; P.state.punch = true; // throwing motion
    const o = throwOrigin(new THREE.Vector3()), v = throwVel(new THREE.Vector3());
    let body = null;
    try {
      body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, o.y, o.z).setLinvel(v.x, v.y, v.z).setAngvel({ x: rand(-8, 8), y: rand(-8, 8), z: rand(-8, 8) }).setCcdEnabled(true).setLinearDamping(0.1));
      const col = world.createCollider(RAPIER.ColliderDesc.ball(k === 'molotov' ? 0.05 : 0.06).setDensity(800).setRestitution(k === 'molotov' ? 0.0 : 0.35).setFriction(0.8), body);
      col.setCollisionGroups(0xffff0002 & 0xffffffff);
    } catch (e) { body = null; }
    const mesh = buildWeaponModel(k); scene.add(mesh);
    thrown.push({ k, body, mesh, t: k === 'molotov' ? 6 : 2.6, pos: o.clone(), vel: v.clone(), age: 0 });
    sfx(game, 'swing', o, 0.6);
    if (P.ammo[k] <= 0) { const i = P.inventory.indexOf(k); if (i >= 0) P.inventory.splice(i, 1); P.weapon = 'fist'; game.emit?.('weaponChange', { weapon: 'fist' }); }
  }
  // arc preview
  const arc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.9, depthWrite: false }), 41);
  arc.frustumCulled = false; arc.visible = false; arc.renderOrder = 5; scene.add(arc);
  const _am = new THREE.Matrix4();
  const arcEnd = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 24), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  arcEnd.rotation.x = -Math.PI / 2; arcEnd.visible = false; scene.add(arcEnd);
  function updateArc() {
    const o = throwOrigin(new THREE.Vector3()), v = throwVel(new THREE.Vector3());
    let px = o.x, py = o.y, pz = o.z, vy = v.y, shown = 0, end = null; const dt = 0.05;
    for (let n = 0; n < 40; n++) {
      const nx = px + v.x * dt, ny = py + vy * dt, nz = pz + v.z * dt;
      try {
        const ddx = nx - px, ddy = ny - py, ddz = nz - pz, l = Math.hypot(ddx, ddy, ddz);
        const h = world.castRay(new RAPIER.Ray({ x: px, y: py, z: pz }, { x: ddx / l, y: ddy / l, z: ddz / l }), l, true, F.EXCLUDE_SENSORS, undefined, P.collider || undefined);
        if (h) { const t = h.timeOfImpact ?? h.toi; end = new THREE.Vector3(px + ddx / l * t, py + ddy / l * t, pz + ddz / l * t); break; }
      } catch (e) { /* ignore */ }
      px = nx; py = ny; pz = nz; vy -= 9.81 * dt;
      _am.makeTranslation(px, py, pz); arc.setMatrixAt(shown++, _am);
    }
    arc.count = shown; arc.instanceMatrix.needsUpdate = true; arc.visible = shown > 0;
    if (end) { arcEnd.position.set(end.x, end.y + 0.05, end.z); arcEnd.visible = true; } else arcEnd.visible = false;
  }
  // explosion: damage with line-of-sight falloff, shockwave impulses, fire. opts: { radius, damage, fire, source }
  function explode(pos, byPlayer = true, opts = {}) {
    const R = opts.radius ?? WEAP.grenade.radius, DMG = opts.damage ?? WEAP.grenade.dmg;
    G.combatT = 0;
    tryCall('fx', () => gfx.explosion(pos, R));
    sfx(game, 'explosion', pos, 1.2);
    game.emit?.('explosion', { position: pos.clone(), radius: R, damage: DMG, byPlayer, fire: !!opts.fire, source: opts.source || null });
    C.noise(pos, 160, 'explosion');
    const dP = P.position.distanceTo(pos);
    if (dP < 34) G.shake = Math.max(G.shake || 0, (1 - dP / 34) * 0.07);
    // cover matters: solid static geometry between the blast and the body halves or blocks the damage
    const exposed = (p) => { try { const d = _v.set(p.x - pos.x, p.y + 1.0 - pos.y, p.z - pos.z), L = d.length(); if (L < 0.6) return 1; d.multiplyScalar(1 / L); const h = world.castRay(new RAPIER.Ray({ x: pos.x, y: pos.y + 0.25, z: pos.z }, { x: d.x, y: d.y, z: d.z }), L - 0.3, true, F.EXCLUDE_SENSORS | F.EXCLUDE_DYNAMIC | F.EXCLUDE_KINEMATIC); return h ? 0.3 : 1; } catch (e) { return 1; } };
    for (const t of livingNear(game, pos, R)) {
      const d = t.pos.distanceTo(pos); if (d > R) continue;
      const dir = t.pos.clone().sub(pos).setY(0.4).normalize(), k = (1 - d / R) * exposed(t.pos);
      damageTarget(game, t, DMG * k + 20 * k, dir, t.kind === 'ped' ? 'explosion' : t.kind === 'npc' ? 'explosion' : 'bullet', { zone: 'torso', strength: 1, byPlayer, explosion: true });
      if (t.obj.knock?.set && !t.obj.dead) t.obj.knock.set(dir.x * (R - d) * 1.6, 0, dir.z * (R - d) * 1.6);
    }
    for (const v of game.vehicles?.list || []) {
      try {
        const t = v.body.translation(); const d = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
        if (d > R * 1.4) continue;
        const k = (1 - d / (R * 1.4)), m = v.spec?.mass || 1300, ddx = (t.x - pos.x) / (d || 1), ddz = (t.z - pos.z) / (d || 1);
        v.body.applyImpulseAtPoint({ x: ddx * m * 7 * k, y: m * 6 * k, z: ddz * m * 7 * k }, { x: t.x + rand(-0.6, 0.6), y: t.y - 0.2, z: t.z + rand(-1, 1) }, true);
        v.health = (v.health ?? 1000) - 600 * k;
        tryCall('v.damage', () => v.damage?.(600 * k, null, { kind: 'explosion', point: pos.clone() }));
        emitHit({ target: 'vehicle', object: v, point: new THREE.Vector3(t.x, t.y, t.z), normal: new THREE.Vector3(ddx, 0.5, ddz), damage: 600 * k, kind: 'explosion', byPlayer });
        if ((v.police || v.typeKey === 'police') && byPlayer) G.reportCrime?.('cop_assault', pos.clone());
      } catch (e) { /* ignore */ }
    }
    try { // other dynamic bodies (ragdolls, props): collect first, never touch bodies inside the wasm iteration callback
      const bodies = []; world.forEachRigidBody?.((b) => { bodies.push(b); });
      const vb = new Set((game.vehicles?.list || []).map((v) => v.body));
      for (const b of bodies) {
        try {
          if (vb.has(b) || !b.isDynamic()) continue;
          const t = b.translation(); const d = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
          if (d > R || d < 0.01) continue;
          const m = b.mass(); const k = (1 - d / R) * 9 * m;
          b.applyImpulse({ x: (t.x - pos.x) / d * k, y: k * 0.8, z: (t.z - pos.z) / d * k }, true);
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
    if (dP < R) { const k = (1 - dP / R) * exposed(P.position); G.damagePlayer ? G.damagePlayer(DMG * k * (P.state.inVehicle ? 0.5 : 1), 'explosion') : (P.health = Math.max(0, P.health - DMG * k)); game.emit?.('playerBlast', { position: pos.clone(), radius: R, strength: k }); }
    if (opts.fire) tryCall('fire', () => game.fire?.ignite?.(pos, { radius: Math.min(4, R * 0.5), byPlayer }));
    if (byPlayer) { lastShootCrime = -99; G.reportCrime?.('shooting', pos.clone()); }
  }
  G.explode = explode;
  function thrownTick(dt) {
    for (let i = thrown.length - 1; i >= 0; i--) {
      const g = thrown[i]; g.t -= dt; g.age += dt;
      let hitGround = false;
      if (g.body) {
        const t = g.body.translation(), r = g.body.rotation();
        if (g.k === 'molotov' && g.age > 0.12) { const lv = g.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z), prev = g.speed ?? sp; if (prev - sp > 4 || (sp < 3 && g.age > 0.3)) hitGround = true; g.speed = sp; }
        g.mesh.position.set(t.x, t.y, t.z); g.mesh.quaternion.set(r.x, r.y, r.z, r.w); g.pos.set(t.x, t.y, t.z);
      } else { g.vel.y -= 9.81 * dt; g.pos.addScaledVector(g.vel, dt); if (g.pos.y < 0.06) { g.pos.y = 0.06; g.vel.multiplyScalar(0.4); g.vel.y = Math.abs(g.vel.y) * 0.3; hitGround = true; } g.mesh.position.copy(g.pos); }
      if (g.k === 'molotov') { const wk = g.mesh.userData.wick; if (wk) { wk.getWorldPosition(_v); gfx.flame(_v, 0.18, dt); } }
      if (g.t <= 0 || (g.k === 'molotov' && hitGround)) {
        if (g.body) removeBodySafe(game, g.body);
        scene.remove(g.mesh); thrown.splice(i, 1);
        if (g.k === 'molotov') {
          sfx(game, 'glass', g.pos, 0.9);
          for (let n = 0; n < 12; n++) gfx.chip(g.pos, new THREE.Vector3(rand(-3, 3), rand(1, 4), rand(-3, 3)), 0x6a9a5a, 0.03, { flat: true, floor: g.pos.y - 0.05 });
          explode(g.pos.clone(), true, { radius: WEAP.molotov.radius, damage: WEAP.molotov.dmg, fire: true, source: 'molotov' });
        } else explode(g.pos.clone(), true);
      }
    }
  }

  // ---- built-in melee fallback (combat/melee.v2.js replaces it when loaded)
  const MELEE = { fist: { reach: 0.9, r: 0.09, light: 14, heavy: 32, delay: 0.12 }, knife: { reach: 1.1, r: 0.04, light: 52, heavy: 85, delay: 0.1 }, bat: { reach: 1.5, r: 0.06, light: 42, heavy: 72, delay: 0.16 }, crowbar: { reach: 1.4, r: 0.05, light: 46, heavy: 78, delay: 0.17 }, bottle: { reach: 1.1, r: 0.05, light: 26, heavy: 40, delay: 0.12 } };
  let combo = 0, lastSwingT = -9, swing = null;
  function meleeFallback() {
    const k = WEAP[P.weapon]?.melee ? P.weapon : 'fist', m = MELEE[k] || MELEE.fist, now = game.clock.elapsed;
    combo = now - lastSwingT < 0.75 ? Math.min(3, combo + 1) : 1; lastSwingT = now;
    const heavy = combo === 3 || (P.state.sprint && (P.state.speed || 0) > 4);
    if (k !== 'fist') sfx(game, 'swing', P.position, heavy ? 0.9 : 0.6);
    swing = { k, m, heavy, t: 0, hit: new Set(), side: combo % 2 ? 1 : -1 }; G.combatT = 0;
  }
  const _sh = new THREE.Vector3(), _tip = new THREE.Vector3(), _base = new THREE.Vector3();
  function swingTick(dt) {
    if (!swing) return;
    const sw = swing, m = sw.m, t0 = sw.t; sw.t += dt;
    if (sw.t < m.delay) return;
    const dur = 0.16, ph0 = Math.max(0, (t0 - m.delay) / dur), ph1 = Math.min(1, (sw.t - m.delay) / dur);
    const h = P.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    _sh.set(P.position.x + rx * 0.18 * sw.side, P.position.y + 1.38, P.position.z + rz * 0.18 * sw.side);
    const targets = hitTargets(game, G, P.position, m.reach + 1.2);
    for (let i = 0; i <= 3; i++) {
      const ph = ph0 + (ph1 - ph0) * (i / 3), ang = (sw.side > 0 ? 1.1 : -1.1) * (1 - ph) - (sw.side > 0 ? 0.35 : -0.35) * ph, ca = Math.cos(ang), sa = Math.sin(ang);
      const ddx = fx * ca + rx * sa, ddz = fz * ca + rz * sa;
      _tip.set(_sh.x + ddx * m.reach, P.position.y + 1.32 - ph * 0.12, _sh.z + ddz * m.reach); _base.copy(_sh).lerp(_tip, sw.k === 'fist' ? 0.82 : 0.4);
      for (const tg of targets) {
        if (sw.hit.has(tg.obj)) continue;
        const h2 = segLimbs(_base, _tip, m.r, tg); if (!h2) continue;
        sw.hit.add(tg.obj);
        const dir = new THREE.Vector3(tg.pos.x - P.position.x, 0, tg.pos.z - P.position.z).normalize();
        const dmg = (sw.heavy ? m.heavy : m.light) * (h2.zone === 'head' ? 1.6 : h2.zone === 'torso' ? 1 : 0.8);
        damageTarget(game, tg, dmg, dir, sw.k === 'fist' ? 'punch' : 'melee', { zone: h2.zone, limb: h2.limb, point: h2.point, strength: sw.heavy ? 1 : 0.45, byPlayer: true, weapon: sw.k, heavy: sw.heavy });
        if (tg.kind === 'ped' && !(tg.obj.dead || tg.obj.state === 'dead')) G.reportCrime?.('assault', tg.obj.pos.clone(), tg.obj);
        G.lastConfirmedHit = game.clock.elapsed; G.lastMeleeHitT = game.clock.elapsed;
        sfx(game, sw.k === 'fist' ? 'punch_hit' : 'bat_hit', h2.point, sw.heavy ? 1 : 0.7);
      }
    }
    if (ph1 >= 1) { G.props?.meleeHit?.(P.position, new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading)), sw.k === 'fist' ? (sw.heavy ? 14 : 9) : 30); swing = null; }
  }
  // we resolve all melee ourselves: stop the peds module's built-in punch check (runs after updaters)
  game.updaters?.push(() => { if (WEAP[P.weapon]?.melee && !P.state.inVehicle) P.state.punch = false; });
  game.on?.('punch', () => {
    if (isGun(P.weapon) || WEAP[P.weapon]?.throw) { if (!WEAP[P.weapon]?.throw) P.state.punch = false; return; }   // LMB is ours
    if (blocked() || game.melee?.active) return;                                                                  // melee.v2.js owns melee when present
    if (WEAP[P.weapon]?.melee) meleeFallback();
  });

  // ---- aiming at peds scares them (and silences would-be witnesses); also ranges the scope
  let scareT = 0;
  function scareCheck() {
    const dir = camDir(new THREE.Vector3()), cam = camera.position;
    try {
      const hit = world.castRay(new RAPIER.Ray({ x: cam.x, y: cam.y, z: cam.z }, { x: dir.x, y: dir.y, z: dir.z }), scoped ? 300 : 40, true, F.EXCLUDE_SENSORS, undefined, P.collider || undefined);
      if (!hit) { if (scoped) scopeTxt.textContent = '---m'; return; }
      if (scoped) scopeTxt.textContent = `${Math.round(hit.timeOfImpact ?? hit.toi)}m`;
      const r = resolveCollider(hit.collider);
      if (r.kind === 'ped' && !r.obj.dead) {
        const ped = r.obj; ped._gpScaredT = game.clock.elapsed;
        if ((ped.state === 'walk' || ped.state === 'talk' || ped.state === 'film') && ped.pos.distanceTo(P.position) < 40) { ped.state = 'cower'; ped.stateT = rand(3, 5); ped.threat = { x: P.position.x, z: P.position.z }; ped.idleStyle = 'cower'; }
      }
    } catch (e) { /* ignore */ }
  }

  // scope zoom is applied at render time only (never written into game.settings)
  let scopeFov = 0;
  const prevBR = scene.onBeforeRender;
  scene.onBeforeRender = function (...args) {
    try { if (typeof prevBR === 'function') prevBR.apply(this, args); } catch (e) { /* ignore */ }
    if (scoped && scopeFov > 0 && game.camera) { game.camera.fov = scopeFov; game.camera.updateProjectionMatrix(); }
  };
  game.on?.('weaponChange', () => resetAim());
  game.on?.('enterVehicle', () => { resetAim(); });
  function resetAim() { rmb = false; setScoped(false); P.aiming = false; if (P.state) P.state.aiming = false; game.cameraZoom = 1; aimZoom = 1; burst = 0; }
  G.resetAim = resetAim;
  function setScoped(on) {
    if (on === scoped) return;
    scoped = on; scopeEl.style.display = on ? 'block' : 'none'; game.ui.scoped = on;
    if (on) scopeZoom = 1;
    if (playerRoot) {
      if (on && playerRoot.visible) { playerRoot.visible = false; hiddenByScope = true; }
      else if (!on && hiddenByScope) { if (!P.state.inVehicle) playerRoot.visible = true; hiddenByScope = false; }
    }
  }
  // ---- laser and weapon light
  let laserWanted = true, lightWanted = false, laserBeam = null, laserDot = null, spot = null;
  function accessoriesTick(m, w, show) {
    const on = show && w.laser && laserWanted && m?.userData.laser;
    if (on) {
      if (!laserBeam) {
        laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false })); laserBeam.frustumCulled = false; scene.add(laserBeam);
        laserDot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 12), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true })); laserDot.renderOrder = 12; scene.add(laserDot);
      }
      m.userData.laser.getWorldPosition(_a); _b.set(0, 0, 1).transformDirection(m.matrixWorld);
      let t = 80, nrm = null;
      try { const h = world.castRayAndGetNormal(new RAPIER.Ray({ x: _a.x, y: _a.y, z: _a.z }, { x: _b.x, y: _b.y, z: _b.z }), 80, true, F.EXCLUDE_SENSORS, undefined, P.collider || undefined); if (h) { t = h.timeOfImpact ?? h.toi; nrm = h.normal; } } catch (e) { /* */ }
      laserBeam.position.copy(_a); laserBeam.lookAt(_v.copy(_a).add(_b)); laserBeam.scale.set(1, 1, t); laserBeam.visible = true;
      laserDot.visible = !!nrm; if (nrm) { laserDot.position.copy(_a).addScaledVector(_b, t - 0.01); laserDot.lookAt(_v.copy(laserDot.position).add(nrm)); laserDot.scale.setScalar(1 + t * 0.03); }
    } else if (laserBeam) { laserBeam.visible = false; laserDot.visible = false; }
    const lon = show && w.light && lightWanted && m?.userData.light;
    if (lon) {
      if (!spot) { spot = new THREE.SpotLight(0xfff2d6, 0, 42, 0.42, 0.45, 1.4); spot.castShadow = false; scene.add(spot, spot.target); }
      m.userData.light.getWorldPosition(spot.position); _b.set(0, 0, 1).transformDirection(m.matrixWorld); spot.target.position.copy(spot.position).addScaledVector(_b, 10); spot.intensity = 260;
    } else if (spot) spot.intensity = 0;
  }

  function update(dt) {
    const inp = game.input, inCar = !!P.state.inVehicle;
    let k = P.weapon; if (!P.inventory.includes(k)) k = P.weapon = 'fist';
    const w = eff(k), gun = isGun(k);
    // switching
    if (!blocked() && !scoped && !G.menuOpen && !P.script) {
      for (let i = 1; i <= 7; i++) if (inp.pressed('Digit' + i)) selectSlot(i);
      if (wheelAcc) cycle(wheelAcc > 0 ? 1 : -1);
    }
    if (scoped && wheelAcc) scopeZoom = THREE.MathUtils.clamp(scopeZoom + (wheelAcc > 0 ? 0.25 : -0.25), 0.5, 2);
    wheelAcc = 0;
    if (!blocked() && inp.pressed(KEYS.reload)) startReload();
    if (!blocked() && inp.pressed(KEYS.light) && w.light) { lightWanted = !lightWanted; sfx(game, 'empty', null, 0.3); }
    if (!blocked() && inp.pressed(KEYS.laser) && w.laser) { laserWanted = !laserWanted; sfx(game, 'empty', null, 0.3); }
    // reload progress (magazine leaves the gun, drops, a fresh one goes in)
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadKey !== P.weapon) { reloadT = 0; reloadKey = null; }
      else {
        const u = 1 - reloadT / w.reload, hm = held[reloadKey];
        if (reloadStage === 0 && u > 0.3) {
          reloadStage = 1;
          if (reloadKey === 'revolver' || reloadKey === 'sawnoff') ejectFrom(hm, reloadKey === 'revolver' ? 'pistol' : 'shell', reloadKey === 'revolver' ? Math.max(1, w.clip - (P.clip.revolver || 0)) : 2, true);
          else if (hm?.visible && hm.userData.parts?.mag && reloadKey !== 'shotgun') { const mc = hm.userData.magClone(); hm.userData.parts.mag.getWorldPosition(_a); gfx.dropMag(mc, _a, new THREE.Vector3(rand(-0.3, 0.3), -0.6, rand(-0.3, 0.3)), hm.getWorldQuaternion(new THREE.Quaternion())); }
        }
        if (reloadStage === 1 && u > 0.7) { reloadStage = 2; sfx(game, 'reload', P.position, 0.5); }
        if (reloadT <= 0) { fillClip(reloadKey); reloadKey = null; sfx(game, 'reload', P.position, 0.6); }
      }
    }
    // aiming / scope
    if (rmb && (!document.pointerLockElement || document.hidden)) rmb = false;
    const ui = game.ui || {};
    const driveBy = inCar && (w.cls === 'handgun' || w.cls === 'smg');
    const hardStop = (inCar && !driveBy) || blocked() || ui.dead || ui.arrested || ui.busted || P.health <= 0 || (P.script && !C.allowAim);
    const wantAim = vin.aim != null ? vin.aim : rmb;
    const aiming = wantAim && !hardStop && (gun || w.throw);
    P.aiming = aiming; P.state.aiming = aiming;
    setScoped(aiming && !!w.scope && reloadT <= 0 && !inCar);
    aimZoom = aiming ? (scoped ? 0.3 : (w.zoom || 0.55)) : 1;
    game.cameraZoom = aimZoom;
    // hold breath to steady a scope
    C.steady = scoped && inp.down(KEYS.steady) && (C.breath ?? 1) > 0.02;
    C.breath = Math.max(0, Math.min(1, (C.breath ?? 1) + (C.steady ? -dt / 5.5 : dt / 3.5)));
    if (scoped) scopeBreath.textContent = C.steady ? 'STEADY ' + Math.round(C.breath * 100) : C.breath < 0.98 ? 'BREATH ' + Math.round(C.breath * 100) : 'SHIFT: HOLD BREATH';
    scopeFov = scoped ? 13 / scopeZoom : 0;
    if (!scoped) {   // belt and braces: nothing scope-related may outlive the scope
      if (ui.scoped) ui.scoped = false;
      if (scopeEl.style.display !== 'none') scopeEl.style.display = 'none';
      if (hiddenByScope && playerRoot) { if (!inCar) playerRoot.visible = true; hiddenByScope = false; }
    }
    if (game.settings && !(game.settings.fov >= 45)) game.settings.fov = 62;
    if (aiming) lookT = Math.max(lookT, 0.2);
    lookT -= dt;
    G.faceCamera = lookT > 0 && !inCar && !P.script;
    // firing
    cd -= dt;
    bloom *= Math.exp(-dt * (w.bloomRec || 5));
    curSpread = gun ? (aiming ? w.spread : w.hip * (w.laser && laserWanted ? w.laserHip : 1)) + bloom + Math.min(0.03, (P.state.speed || 0) * 0.004) : 0;
    const trig = vin.fire != null ? vin.fire : (w.auto ? inp.mouseDown && !!document.pointerLockElement : inp.mouseClicked);
    const once = vin.fireOnce; vin.fireOnce = false;
    const canFire = (!P.script || C.allowAim) && !blocked() && cd <= 0 && reloadT <= 0;
    if (gun && (!inCar || driveBy) && canFire && (trig || once)) { fire(); if (!w.auto && vin.fire) vin.fire = false; }
    if (w.throw && !inCar && canFire && ((vin.fire != null ? vin.fire : inp.mouseClicked) || once)) { throwItem(); if (vin.fire) vin.fire = false; }
    if (w.throw && aiming) updateArc(); else { arc.visible = false; arcEnd.visible = false; }
    tryCall('thrown', () => thrownTick(dt));
    tryCall('swing', () => swingTick(dt));
    // recoil: kick, then recover a little over half of it when the trigger is released
    if (recoilV > 0) { const kk = Math.min(recoilV, dt * 0.6 + recoilV * 0.5); game.cameraPitch -= kk * 0.6; recoilAcc += kk * 0.6; recoilV -= kk; }
    if (recoilAcc > 0 && game.clock.elapsed - lastShotT > Math.max(0.14, w.rate * 1.3)) { const back = Math.min(recoilAcc, recoilAcc * dt * 6 + dt * 0.01); game.cameraPitch += back * 0.55; recoilAcc -= back; }
    if (G.shake > 0) { game.cameraPitch += rand(-1, 1) * G.shake; game.cameraYaw += rand(-1, 1) * G.shake; G.shake = Math.max(0, G.shake - dt * 0.15); }
    if (aiming && gun) { scareT -= dt; if (scareT <= 0) { scareT = 0.2; scareCheck(); } }

    // held model + arm pose
    if (!playerRoot || !playerRoot.parent) {
      playerRoot = game.playerCharacter?.root || scene.getObjectByName('character-player');
      handBone = playerRoot ? findBone(playerRoot, /RightHand$/i) : null;
      bones.rArm = playerRoot ? findBone(playerRoot, /RightArm$/i) : null;
      bones.lArm = playerRoot ? findBone(playerRoot, /LeftArm$/i) : null;
      bones.lHand = playerRoot ? findBone(playerRoot, /LeftHand$/i) : null;
    }
    const reloading = reloadT > 0;
    const twoHand = w.cls === 'smg' || w.cls === 'rifle' || w.cls === 'shotgun' || w.cls === 'sniper';
    const pose = C.weaponPose;   // another module (cover, melee, traversal) may place the weapon itself: { hide } | { position, quaternion }
    const armsFree = !P.script || C.allowAim;
    if (gun && !inCar && armsFree && (aiming || lookT > 0 || reloading) && handBone && bones.rArm && !G.dead && !G.jack && !scoped) {
      tryCall('aimArm', () => {
        camDir(_fwd);
        if (reloading) _o.set(P.position.x + Math.sin(P.heading) * 0.5, P.position.y + 0.95, P.position.z + Math.cos(P.heading) * 0.5);   // lower the gun in front of the chest
        else { aimPoint(_o, 80); if (C.aimTarget) _o.copy(C.aimTarget); _o.y += recoilAnim * (w.kick || 0.02) * 12; }
        aimArm(bones.rArm, handBone, _o, 1);
        if (bones.lArm && bones.lHand) {
          handBone.getWorldPosition(_hand);
          const m0 = held[k];
          if (!reloading && twoHand && m0?.userData.leftGrip && m0.visible) { m0.updateMatrixWorld(true); m0.localToWorld(_o.copy(m0.userData.leftGrip)); }
          else { const reach = reloading ? 0.02 + Math.abs(Math.sin(reloadT * 6)) * 0.12 : 0.04; _o.copy(_hand).addScaledVector(reloading ? _v.set(0, -1, 0) : _fwd, reach); }
          aimArm(bones.lArm, bones.lHand, _o, 1);
        }
      });
    }
    for (const id in held) held[id].visible = false;
    const m = k !== 'fist' && !inCar && playerRoot && !hiddenByScope && playerRoot.visible !== false && !G.dead && !(pose && pose.hide) ? model(k) : null;
    if (m) {
      m.visible = true;
      if (pose && pose.position) { m.position.copy(pose.position); m.quaternion.copy(pose.quaternion); }
      else {
        if (handBone) handBone.getWorldPosition(_hand);
        else _hand.set(P.position.x + Math.cos(P.heading) * -0.3, P.position.y + 1.0, P.position.z - Math.sin(P.heading) * -0.3);
        m.position.copy(_hand);
        if (reloading && gun) m.rotation.set(0.5, P.heading + 0.5, 0.4, 'YXZ');
        else if ((aiming || lookT > 0) && gun && armsFree) {
          aimPoint(_o, 80); if (C.aimTarget) _o.copy(C.aimTarget); _fwd.subVectors(_o, _hand).normalize();
          m.rotation.set(-Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)) - recoilAnim * (w.kick || 0.02) * 6, Math.atan2(_fwd.x, _fwd.z), 0, 'YXZ');
          m.translateZ(-recoilAnim * Math.min(0.06, (w.kick || 0.02) * 1.4));
        } else if (k === 'bat' || k === 'crowbar') m.rotation.set(-1.0, P.heading, 0, 'YXZ');
        else if (k === 'knife') m.rotation.set(0.3, P.heading, 0, 'YXZ');
        else if (k === 'bottle' || k === 'molotov') m.rotation.set(-0.9, P.heading, 0, 'YXZ');
        else if (k === 'grenade') m.rotation.set(0, P.heading, 0, 'YXZ');
        else m.rotation.set(twoHand ? 0.9 : 1.15, P.heading, 0, 'YXZ');
      }
      m.updateMatrixWorld(true);
      if (k === 'molotov' && m.userData.wick) { m.userData.wick.getWorldPosition(_v); gfx.flame(_v, 0.12, dt); }
    }
    tryCall('action', () => actionTick(dt, k, w, m));
    tryCall('accessories', () => accessoriesTick(m, w, !!m && gun && !reloading));
    recoilAnim = Math.max(0, recoilAnim - dt * (6 + recoilAnim * 8));
    tryCall('reactions', () => reactionsTick(dt));
    for (const f of C.late || []) { try { f(dt); } catch (e) { console.error('[combat late]', e); } }   // other combat modules pose NPC bones here (after peds.update)
    tryCall('gfx', () => gfx.update(dt));
  }
  function strip() {
    P.inventory = ['fist']; P.weapon = 'fist';
    for (const kk in P.ammo) P.ammo[kk] = 0;
    for (const kk in P.clip) P.clip[kk] = 0;
    setScoped(false);
    game.emit?.('weaponChange', { weapon: 'fist' });
  }
  C.late = C.late || [];
  api.fireNow = () => { if (isGun(P.weapon) && cd <= 0 && reloadT <= 0) { fire(); return true; } return false; };
  api.startReload = startReload; api.explode = explode; api.muzzlePos = muzzlePos; api.aimPoint = aimPoint; api.shootRay = shootRay;
  return { update, select, strip, give, buyAmmo, WEAP, ORDER, muzzlePos, explode };
}
