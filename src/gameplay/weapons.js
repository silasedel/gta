// Player weapons: defs, inventory, clip/reload (R), aiming (RMB) + sniper scope, hitscan, melee, grenades, held models.
import * as THREE from 'three';
import { rand, sfx, tryCall, findBone, aimArm, distXZ, removeBodySafe } from './util.js';
import { buildWeaponModel } from './gunModels.js';
import { rayLimbs, segLimbs, hitTargets } from './hitbox.js';
import { createGunFX } from './gunfx.js';

// snd = name for game.audio ('pistol'|'smg'|'shotgun'); tone = procedural fallback flavour
export const WEAP = {
  fist: { name: 'Fists', cls: 'melee', melee: true, dmg: 0, range: 1.35, hud: 'fist' },
  knife: { name: 'Switchblade', cls: 'melee', melee: true, dmg: 75, range: 1.6, price: 120, hud: 'bat' },
  bat: { name: 'Ash Baseball Bat', cls: 'melee', melee: true, dmg: 55, range: 1.95, price: 60, hud: 'bat' },
  pistol: { name: 'Solana Service 9 Pistol', cls: 'handgun', dmg: 30, rate: 0.2, spread: 0.007, hip: 0.028, kick: 0.02, range: 140, clip: 15, reload: 1.3, ammoPick: 45, price: 450, ammoPrice: 2, ammoPack: 30, snd: 'pistol', hud: 'pistol' },
  revolver: { name: 'Caballo .44 Revolver', cls: 'handgun', dmg: 72, rate: 0.55, spread: 0.004, hip: 0.024, kick: 0.07, range: 170, clip: 6, reload: 2.1, ammoPick: 24, price: 950, ammoPrice: 5, ammoPack: 18, snd: 'pistol', tone: 'heavy', hud: 'pistol' },
  microsmg: { name: 'Wasp Micro-SMG', cls: 'smg', auto: true, dmg: 13, rate: 0.052, spread: 0.03, hip: 0.055, kick: 0.009, range: 70, clip: 30, reload: 1.4, ammoPick: 120, price: 1100, ammoPrice: 1, ammoPack: 90, snd: 'smg', tone: 'light', hud: 'smg' },
  smg: { name: 'Kestrel SMG', cls: 'smg', auto: true, dmg: 18, rate: 0.075, spread: 0.02, hip: 0.045, kick: 0.011, range: 100, clip: 35, reload: 1.6, ammoPick: 140, price: 1600, ammoPrice: 1, ammoPack: 105, snd: 'smg', hud: 'smg' },
  rifle: { name: 'Biscayne GR-27 Assault Rifle', cls: 'rifle', auto: true, dmg: 29, rate: 0.1, spread: 0.011, hip: 0.04, kick: 0.017, range: 230, clip: 30, reload: 2.0, ammoPick: 120, price: 3200, ammoPrice: 2, ammoPack: 90, snd: 'smg', tone: 'rifle', hud: 'smg' },
  carbine: { name: 'Coastline Carbine', cls: 'rifle', dmg: 38, rate: 0.15, spread: 0.006, hip: 0.034, kick: 0.022, range: 260, clip: 20, reload: 1.8, ammoPick: 80, price: 2600, ammoPrice: 2, ammoPack: 60, snd: 'pistol', tone: 'rifle', hud: 'smg', zoom: 0.6 },
  shotgun: { name: 'Breaker Pump Shotgun', cls: 'shotgun', dmg: 14, pellets: 8, rate: 0.85, spread: 0.055, hip: 0.075, kick: 0.07, range: 45, clip: 6, reload: 2.4, ammoPick: 18, price: 1200, ammoPrice: 3, ammoPack: 12, snd: 'shotgun', hud: 'shotgun' },
  sawnoff: { name: 'Hacksaw Double-Barrel', cls: 'shotgun', dmg: 13, pellets: 11, rate: 0.3, spread: 0.09, hip: 0.1, kick: 0.1, range: 24, clip: 2, reload: 1.7, ammoPick: 16, price: 800, ammoPrice: 3, ammoPack: 12, snd: 'shotgun', hud: 'shotgun' },
  sniper: { name: 'Longshot .308 Sniper', cls: 'sniper', dmg: 165, rate: 1.25, spread: 0.0004, hip: 0.07, kick: 0.12, range: 500, clip: 5, reload: 2.6, ammoPick: 15, price: 5000, ammoPrice: 10, ammoPack: 10, snd: 'shotgun', tone: 'sniper', hud: 'shotgun', scope: true },
  grenade: { name: 'Frag Grenade', cls: 'throwable', throw: true, dmg: 160, radius: 7.5, rate: 0.9, clip: 1, ammoPick: 3, price: 300, ammoPrice: 250, ammoPack: 1, hud: 'fist' },
};
export const ORDER = ['fist', 'knife', 'bat', 'pistol', 'revolver', 'microsmg', 'smg', 'rifle', 'carbine', 'shotgun', 'sawnoff', 'sniper', 'grenade'];
const SLOTS = { fist: 1, knife: 1, bat: 1, pistol: 2, revolver: 2, microsmg: 3, smg: 3, rifle: 4, carbine: 4, shotgun: 5, sawnoff: 5, sniper: 6, grenade: 7 };
for (const k of ORDER) { WEAP[k].key = k; WEAP[k].slot = SLOTS[k]; WEAP[k].pellets = WEAP[k].pellets || 1; }
const isGun = (k) => !!WEAP[k] && !WEAP[k].melee && !WEAP[k].throw;

export function createWeapons(game, G) {
  const { scene, world, RAPIER, camera } = game;
  const P = game.player;
  if (!Array.isArray(P.inventory)) P.inventory = ['fist'];
  P.ammo = P.ammo || {};
  for (const k of ORDER) if (!WEAP[k].melee && P.ammo[k] == null) P.ammo[k] = 0;
  P.clip = P.clip || {};
  if (!P.inventory.includes(P.weapon)) P.weapon = 'fist';
  P.aiming = false;

  // ---- input (RMB + wheel are not tracked by core input)
  // RMB state is re-derived from real button masks; any focus/lock loss releases it (no stuck aim/scope)
  let rmb = false, rmbSeenT = 0;
  const now = () => performance.now();
  addEventListener('mousedown', (e) => { if (e.button === 2 && document.pointerLockElement) { rmb = true; rmbSeenT = now(); } }, true);
  addEventListener('mouseup', (e) => { if (e.button === 2) rmb = false; }, true);
  addEventListener('mousemove', (e) => { if (typeof e.buttons === 'number') { if (e.buttons & 2) rmbSeenT = now(); else rmb = false; } }, true);
  addEventListener('contextmenu', (e) => { if (document.pointerLockElement) e.preventDefault(); });
  addEventListener('blur', () => { rmb = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) rmb = false; });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) rmb = false; });
  // repair a field-of-view setting polluted by older builds (scope used to write settings.fov; the HUD then saved it)
  if (game.settings && !(game.settings.fov >= 45)) game.settings.fov = 62;
  let wheelAcc = 0;
  addEventListener('wheel', (e) => { if (document.pointerLockElement && !game.ui?.weaponWheel && !game.ui?.scoped) wheelAcc += Math.sign(e.deltaY); }, { passive: true });

  function blocked() { const ui = game.ui || {}; return ui.paused || ui.phoneOpen || ui.weaponWheel || ui.title || ui.shopOpen || G.dead || G.busted || G.jack; }
  let reloadT = 0, reloadKey = null, reloadEjected = false;
  function select(id) {
    if (!P.inventory.includes(id) || P.weapon === id) return;
    P.weapon = id; reloadT = 0; reloadKey = null; resetAim();
    game.emit?.('weaponChange', { weapon: id }); sfx(game, 'reload', null, 0.4);
  }
  function cycle(d) {
    const own = ORDER.filter((w) => P.inventory.includes(w));
    if (own.length < 2) return;
    const i = Math.max(0, own.indexOf(P.weapon));
    select(own[(i + d + own.length) % own.length]);
  }
  function selectSlot(n) {
    const own = ORDER.filter((w) => P.inventory.includes(w) && WEAP[w].slot === n);
    if (!own.length) return;
    const i = own.indexOf(P.weapon);
    select(own[(i + 1) % own.length]);
  }
  function fillClip(k) { const d = WEAP[k]; if (!d || d.melee) return; P.clip[k] = Math.min(d.clip || 1, P.ammo[k] || 0); }

  // ---- public API (gun store, pickups, police trunks)
  function give(key, ammo, opts = {}) {
    const d = WEAP[key]; if (!d) return false;
    const had = P.inventory.includes(key);
    if (!had) P.inventory.push(key);
    if (!d.melee) {
      P.ammo[key] = (P.ammo[key] || 0) + (ammo ?? d.ammoPick ?? 30);
      if (!had || !(P.clip[key] > 0)) fillClip(key);
    }
    if (!had && opts.select !== false) { P.weapon = key; reloadT = 0; game.emit?.('weaponChange', { weapon: key }); }
    game.emit?.('inventoryChange', { key, had });
    return true;
  }
  function buyAmmo(key, n) {
    const d = WEAP[key]; if (!d || d.melee) return false;
    if (d.throw && !P.inventory.includes(key)) P.inventory.push(key);
    P.ammo[key] = (P.ammo[key] || 0) + (n ?? d.ammoPack ?? 30);
    if (!(P.clip[key] > 0)) fillClip(key);
    return true;
  }
  const api = {
    defs: WEAP, order: ORDER, give, buyAmmo, select,
    has: (k) => P.inventory.includes(k),
    isGun,
    clip: (k = P.weapon) => P.clip[k] ?? 0,
    get reloading() { return reloadT > 0; },
  };
  game.weapons = api;

  // ---- held weapon models
  const held = {};
  for (const id of ORDER) { if (id === 'fist') continue; const m = buildWeaponModel(id); m.visible = false; scene.add(m); held[id] = m; }
  let playerRoot = null, handBone = null, lookT = 0;
  const bones = {};
  const _hand = new THREE.Vector3(), _fwd = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3();

  const gfx = createGunFX(game);
  let recoilAnim = 0;
  const _ej = new THREE.Vector3(), _rv = new THREE.Vector3(), _fv = new THREE.Vector3();
  function ejectFrom(model, type, delay = 0, n = 1, down = false) {
    if (!model || !model.visible) return;
    const go = () => {
      if (!model.visible) return;
      for (let i = 0; i < n; i++) {
        const e = model.userData.eject || new THREE.Vector3(0.02, 0.02, 0.03);
        model.localToWorld(_ej.copy(e));
        _rv.set(1, 0, 0).applyQuaternion(model.quaternion); _fv.set(0, 0, 1).applyQuaternion(model.quaternion);
        const pv = P.velocity || { x: 0, y: 0, z: 0 };
        const v = down ? new THREE.Vector3(rand(-0.3, 0.3), -0.5, rand(-0.3, 0.3)) : _rv.clone().multiplyScalar(rand(1.6, 2.6)).add(new THREE.Vector3(0, rand(1.2, 2.0), 0)).addScaledVector(_fv, rand(-0.6, 0.1));
        v.x += pv.x || 0; v.z += pv.z || 0;
        gfx.eject(type, _ej, v);
      }
    };
    if (delay > 0) setTimeout(go, delay * 1000); else go();
  }
  G.gfx = gfx;

  // ---- tracers
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 32; i++) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(geo, tracerMat); l.visible = false; l.frustumCulled = false; scene.add(l);
    tracers.push({ l, t: 0 });
  }
  let tracerIdx = 0;
  function tracer(a, b) {
    const tr = tracers[tracerIdx++ % tracers.length];
    const arr = tr.l.geometry.attributes.position.array;
    arr[0] = a.x + (b.x - a.x) * 0.08; arr[1] = a.y + (b.y - a.y) * 0.08; arr[2] = a.z + (b.z - a.z) * 0.08;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    tr.l.geometry.attributes.position.needsUpdate = true; tr.l.visible = true; tr.t = 0.05;
  }
  G.tracer = tracer;

  // ---- hit resolution
  function resolveCollider(col) {
    if (!col) return { kind: 'world' };
    const h = col.handle;
    const cop = G.police?.byHandle?.get(h);
    if (cop) return { kind: 'cop', obj: cop };
    for (const ped of game.peds?.list || []) if (ped.collider && ped.collider.handle === h) return { kind: 'ped', obj: ped };
    let body = null; try { body = col.parent(); } catch (e) { /* ignore */ }
    if (body) for (const v of game.vehicles?.list || []) if (v.body && v.body.handle === body.handle) return { kind: 'vehicle', obj: v };
    return { kind: 'world' };
  }
  G.resolveCollider = resolveCollider;

  // ---- sniper scope overlay (original design: amber ring, ranging ticks)
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
    <text x="500" y="300" text-anchor="middle" fill="#ffb347" font-family="monospace" font-size="14" opacity=".55">SOLANA OPTICS 6-12x</text>
  </svg>`;
  document.body.appendChild(scopeEl);
  const scopeTxt = scopeEl.querySelector('#gpScopeTxt');
  let scoped = false, scopeZoom = 1, hiddenByScope = false;

  // ---- firing
  let cd = 0, lastShootCrime = -99, recoilV = 0;
  function aimDir(out, spread) {
    camera.getWorldDirection(out);
    if (spread > 0) { out.x += rand(-spread, spread); out.y += rand(-spread, spread) * 0.8; out.z += rand(-spread, spread); out.normalize(); }
    return out;
  }
  function muzzlePos(out) {
    const veh = P.state.inVehicle && P.state.vehicle;
    if (veh) {
      try { const sp = veh.seatPosition ? veh.seatPosition() : veh.mesh.position; camera.getWorldDirection(_fwd); return out.set(sp.x + _fwd.x * 0.9, sp.y + 0.45, sp.z + _fwd.z * 0.9); } catch (e) { /* fall through */ }
    }
    const m = held[P.weapon];
    if (m && m.visible && m.userData.muzzle) return m.localToWorld(out.copy(m.userData.muzzle));
    return out.set(P.position.x, P.position.y + 1.4, P.position.z);
  }
  function shootCrime() {
    const now = game.clock.elapsed;
    if (now - lastShootCrime > 2.5) { lastShootCrime = now; G.reportCrime?.('shooting', P.position.clone()); }
  }
  function startReload() {
    const k = P.weapon, d = WEAP[k];
    if (!isGun(k) || reloadT > 0) return;
    if ((P.clip[k] || 0) >= d.clip || (P.ammo[k] || 0) <= (P.clip[k] || 0)) return;
    reloadT = d.reload; reloadKey = k; reloadEjected = false;
    sfx(game, 'reload', P.position, 0.7);
  }
  function fire() {
    const k = P.weapon, w = WEAP[k];
    if ((P.clip[k] || 0) <= 0) {
      if ((P.ammo[k] || 0) > 0) startReload();
      else { sfx(game, 'empty'); cd = 0.3; }
      return;
    }
    P.clip[k]--; P.ammo[k] = Math.max(0, (P.ammo[k] || 0) - 1);
    cd = w.rate;
    lookT = 0.9;
    G.combatT = 0;
    let spreadBase = (P.aiming ? w.spread : w.hip) + Math.min(0.03, (P.state.speed || 0) * 0.004);
    if (scoped) spreadBase = w.spread + Math.min(0.02, (P.state.speed || 0) * 0.006);
    const cam = camera.position;
    const muzzle = muzzlePos(new THREE.Vector3());
    const fwd = aimDir(new THREE.Vector3(), 0);
    const chest = _v.set(P.position.x, P.position.y + (P.state.inVehicle ? 0.8 : 1.3), P.position.z);
    const startT = Math.max(0, (chest.x - cam.x) * fwd.x + (chest.y - cam.y) * fwd.y + (chest.z - cam.z) * fwd.z - 0.6);
    const excludeBody = (P.state.inVehicle && P.state.vehicle?.body) || undefined;
    const targets = hitTargets(game, G, null, 0);
    const F = RAPIER.QueryFilterFlags;
    for (let n = 0; n < w.pellets; n++) {
      const dir = aimDir(new THREE.Vector3(), spreadBase);
      const o = { x: cam.x + dir.x * startT, y: cam.y + dir.y * startT, z: cam.z + dir.z * startT };
      let hit = null;
      // world + vehicles + ragdolls (kinematic character capsules are skipped: limbs are tested analytically)
      try { hit = world.castRayAndGetNormal(new RAPIER.Ray(o, { x: dir.x, y: dir.y, z: dir.z }), w.range, true, F.EXCLUDE_SENSORS | F.EXCLUDE_KINEMATIC, undefined, P.collider || undefined, excludeBody); } catch (e) { hit = null; }
      const toi = hit ? (hit.timeOfImpact ?? hit.toi) : w.range;
      const limb = targets.length ? rayLimbs(o, dir, toi, targets) : null;
      const endT = limb ? limb.t : toi;
      const point = new THREE.Vector3(o.x + dir.x * endT, o.y + dir.y * endT, o.z + dir.z * endT);
      if (n < 4 || w.pellets <= 4) tracer(muzzle, point);
      let dmg = w.dmg * (w.cls === 'shotgun' ? Math.max(0.25, 1 - endT / w.range) : 1);
      if (limb) {
        dmg *= limb.mult;
        const strength = Math.min(1, dmg / 100);
        const info = { zone: limb.zone, limb: limb.limb, point: limb.point, strength, byPlayer: true, weapon: k };
        if (limb.target.kind === 'ped') tryCall('peds.damage', () => game.peds?.damage?.(limb.target.obj, dmg, dir.clone(), 'bullet', info));
        else if (limb.target.kind === 'npc') G.damageNpc?.(limb.target.obj, dmg, dir.clone(), 'bullet', limb.point, info);
        else G.police?.damageCop?.(limb.target.obj, dmg, dir.clone(), 'bullet', limb.point, info);
        G.lastConfirmedHit = game.clock.elapsed;
        continue;
      }
      if (!hit) continue;
      const nrm = hit.normal ? new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) : dir.clone().negate();
      const r = resolveCollider(hit.collider);
      if (r.kind === 'vehicle') {
        const v = r.obj;
        v.health = (v.health ?? 1000) - dmg * 2;
        tryCall('v.damage', () => v.damage?.(dmg * 2, null));
        if (w.cls === 'sniper' || w.cls === 'shotgun') tryCall('impulse', () => v.body.applyImpulseAtPoint({ x: dir.x * dmg * 4, y: 0, z: dir.z * dmg * 4 }, { x: point.x, y: point.y, z: point.z }, true));
        game.emit?.('hit', { target: 'vehicle', object: v, point, normal: nrm, damage: dmg, kind: 'bullet', byPlayer: true });
        if ((v.police || v.typeKey === 'police') && !v.playerDriven) G.reportCrime?.('cop_assault', point);
      } else {
        // dynamic non-vehicle bodies (ragdolls, props): push them at the hit point
        tryCall('ragdoll push', () => { const b = hit.collider.parent(); if (b && b.isDynamic()) b.applyImpulseAtPoint({ x: dir.x * dmg * 0.06, y: dir.y * dmg * 0.06, z: dir.z * dmg * 0.06 }, { x: point.x, y: point.y, z: point.z }, true); });
        game.emit?.('hit', { target: 'world', object: null, point, normal: nrm, damage: dmg, kind: 'bullet', byPlayer: true, surface: tryCall('surf', () => game.surfaceAt?.(point.x, point.z), null) });
        if (Math.random() < 0.12) sfx(game, 'ricochet', point, 0.6);
      }
    }
    if (!game.audio?.play) sfx(game, w.snd, muzzle, 1, w.tone); // audio.js plays the gunshot from the 'shot' event
    const hm = held[k];
    if (hm && hm.visible) {
      gfx.flash(hm, hm.userData.flash || 'pistol');
      const ct = w.cls === 'shotgun' ? 'shell' : (w.cls === 'rifle' || w.cls === 'sniper') ? 'rifle' : 'pistol';
      if (k !== 'revolver' && k !== 'sawnoff') ejectFrom(hm, ct, k === 'shotgun' ? 0.32 : k === 'sniper' ? 0.55 : 0);
    }
    recoilAnim = Math.min(1.5, recoilAnim + 1);
    game.emit?.('shot', { origin: muzzle.clone(), dir: fwd.clone(), weapon: k, sound: w.snd, cls: w.cls, byPlayer: true });
    recoilV += w.kick * (scoped ? 1.6 : 1);
    game.cameraYaw += rand(-1, 1) * w.kick * 0.25;
    shootCrime();
    if ((P.clip[k] || 0) <= 0 && (P.ammo[k] || 0) > 0) setTimeout(() => { if (P.weapon === k) startReload(); }, 150);
    else if ((P.ammo[k] || 0) <= 0) tryCall('notify', () => game.hud?.notify?.('Out of ammo', 1500));
  }

  // ---- grenades
  const grenades = [];
  const nadeMat = new THREE.MeshStandardMaterial({ color: 0x3f4a2a, roughness: 0.6 });
  function throwVel(out) {
    camera.getWorldDirection(_fwd);
    const pitch = Math.max(-0.2, Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)) + 0.32);
    const yaw = Math.atan2(_fwd.x, _fwd.z), sp = 17;
    return out.set(Math.sin(yaw) * Math.cos(pitch) * sp, Math.sin(pitch) * sp, Math.cos(yaw) * Math.cos(pitch) * sp);
  }
  function throwOrigin(out) {
    if (handBone) handBone.getWorldPosition(out); else out.set(P.position.x, P.position.y + 1.5, P.position.z);
    out.y = Math.max(out.y, P.position.y + 1.4);
    return out;
  }
  function throwGrenade() {
    const k = 'grenade';
    if ((P.ammo[k] || 0) <= 0) { sfx(game, 'empty'); cd = 0.4; return; }
    P.ammo[k]--; P.clip[k] = Math.min(1, P.ammo[k]);
    cd = WEAP.grenade.rate; lookT = 0.8; G.combatT = 0;
    P.state.punch = true; // throwing motion
    const o = throwOrigin(new THREE.Vector3());
    const v = throwVel(new THREE.Vector3());
    let body = null;
    try {
      body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, o.y, o.z).setLinvel(v.x, v.y, v.z).setAngvel({ x: rand(-8, 8), y: rand(-8, 8), z: rand(-8, 8) }).setCcdEnabled(true).setLinearDamping(0.1));
      const col = world.createCollider(RAPIER.ColliderDesc.ball(0.06).setDensity(800).setRestitution(0.35).setFriction(0.8), body);
      col.setCollisionGroups(0xffff0002 & 0xffffffff);
    } catch (e) { body = null; }
    const mesh = buildWeaponModel('grenade'); scene.add(mesh);
    grenades.push({ body, mesh, t: 2.6, pos: o.clone(), vel: v.clone() });
    sfx(game, 'swing', o, 0.6);
    if (P.ammo[k] <= 0) { const i = P.inventory.indexOf(k); if (i >= 0) P.inventory.splice(i, 1); select('fist'); P.weapon = 'fist'; game.emit?.('weaponChange', { weapon: 'fist' }); }
  }
  // arc preview
  const arcGeo = { attributes: { position: { array: new Float32Array(41 * 3), needsUpdate: false } }, setDrawRange() {} };
  const arc = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.9, depthWrite: false }), 41);
  arc.frustumCulled = false; arc.visible = false; arc.renderOrder = 5; scene.add(arc);
  const _am = new THREE.Matrix4();
  const arcEnd = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 24), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  arcEnd.rotation.x = -Math.PI / 2; arcEnd.visible = false; scene.add(arcEnd);
  function updateArc() {
    const o = throwOrigin(new THREE.Vector3()), v = throwVel(new THREE.Vector3());
    const arr = arcGeo.attributes.position.array;
    let px = o.x, py = o.y, pz = o.z, vx = v.x, vy = v.y, vz = v.z, n = 0, end = null;
    const dt = 0.05;
    for (; n < 40; n++) {
      arr[n * 3] = px; arr[n * 3 + 1] = py; arr[n * 3 + 2] = pz;
      const nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
      try {
        const dx = nx - px, dy = ny - py, dz = nz - pz, l = Math.hypot(dx, dy, dz);
        const h = world.castRay(new RAPIER.Ray({ x: px, y: py, z: pz }, { x: dx / l, y: dy / l, z: dz / l }), l, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.collider || undefined);
        if (h) { const t = h.timeOfImpact ?? h.toi; end = new THREE.Vector3(px + dx / l * t, py + dy / l * t, pz + dz / l * t); n++; arr[n * 3] = end.x; arr[n * 3 + 1] = end.y; arr[n * 3 + 2] = end.z; n++; break; }
      } catch (e) { /* ignore */ }
      px = nx; py = ny; pz = nz; vy -= 9.81 * dt;
    }
    let shown = 0;
    for (let i = 1; i < n; i++) { _am.makeTranslation(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]); arc.setMatrixAt(shown++, _am); }
    arc.count = shown; arc.instanceMatrix.needsUpdate = true;
    arc.visible = shown > 0;
    if (end) { arcEnd.position.set(end.x, end.y + 0.05, end.z); arcEnd.visible = true; } else arcEnd.visible = false;
  }
  let flash = null;
  function explode(pos, byPlayer = true) {
    const W = WEAP.grenade, R = W.radius;
    G.combatT = 0;
    // fx
    tryCall('fx', () => {
      const fx = game.fx;
      for (let i = 0; i < 6; i++) fx?.sparks?.(pos.clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(0.1, 0.8), rand(-0.6, 0.6))), new THREE.Vector3(rand(-1, 1), 1, rand(-1, 1)).normalize());
      for (let i = 0; i < 5; i++) fx?.smoke?.(pos.clone().add(new THREE.Vector3(rand(-1.2, 1.2), rand(0.2, 1.5), rand(-1.2, 1.2))));
      for (let i = 0; i < 4; i++) fx?.dust?.(pos.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0.1, rand(-1.5, 1.5))), 0x8a7a66);
      if (pos.y < 0.4 && game.surfaceAt?.(pos.x, pos.z) === 'water') fx?.splash?.(pos, 2);
    });
    if (!flash) { flash = new THREE.PointLight(0xffa040, 0, 30, 2); scene.add(flash); }
    flash.position.set(pos.x, pos.y + 1, pos.z); flash.intensity = 800; flash.userData.t = 0.25;
    sfx(game, 'explosion', pos, 1.2);
    game.emit?.('explosion', { position: pos.clone(), radius: R, byPlayer });
    // camera shake
    const dP = P.position.distanceTo(pos);
    if (dP < 30) { G.shake = Math.max(G.shake || 0, (1 - dP / 30) * 0.06); }
    // damage peds
    for (const ped of game.peds?.list || []) {
      if (ped.dead || ped.state === 'dead' || !ped.pos) continue;
      const d = ped.pos.distanceTo(pos); if (d > R) continue;
      const dir = ped.pos.clone().sub(pos).setY(0.4).normalize();
      tryCall('peds.damage', () => game.peds?.damage?.(ped, W.dmg * (1 - d / R) + 20, dir, d < R * 0.6 ? 'car' : 'bullet'));
      if (ped.knock) ped.knock.set(dir.x * (R - d) * 1.6, 0, dir.z * (R - d) * 1.6);
    }
    for (const u of G.police?.units || []) {
      if (!u.active || u.dead) continue;
      const d = u.pos.distanceTo(pos); if (d > R) continue;
      G.police.damageCop(u, W.dmg * (1 - d / R) + 20, u.pos.clone().sub(pos).normalize(), 'bullet');
    }
    for (const n of G.extraTargets || []) {
      if (!n.alive || n.dead) continue;
      const d = n.pos.distanceTo(pos); if (d > R) continue;
      G.damageNpc?.(n, W.dmg * (1 - d / R) + 20, n.pos.clone().sub(pos).normalize(), 'explosion', null, { zone: 'torso', strength: 1 });
    }
    // vehicles: radial impulse
    for (const v of game.vehicles?.list || []) {
      try {
        const t = v.body.translation(); const d = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
        if (d > R * 1.4) continue;
        const k = (1 - d / (R * 1.4)), m = v.spec?.mass || 1300;
        const dx = (t.x - pos.x) / (d || 1), dz = (t.z - pos.z) / (d || 1);
        v.body.applyImpulseAtPoint({ x: dx * m * 7 * k, y: m * 6 * k, z: dz * m * 7 * k }, { x: t.x + rand(-0.6, 0.6), y: t.y - 0.2, z: t.z + rand(-1, 1) }, true);
        v.health = (v.health ?? 1000) - 600 * k;
        game.emit?.('hit', { target: 'vehicle', object: v, point: new THREE.Vector3(t.x, t.y, t.z), normal: new THREE.Vector3(dx, 0.5, dz), damage: 600 * k, kind: 'explosion', byPlayer });
        if ((v.police || v.typeKey === 'police') && byPlayer) G.reportCrime?.('cop_assault', pos.clone());
      } catch (e) { /* ignore */ }
    }
    // other dynamic bodies (ragdolls, props)
    try {
      // collect first (never touch bodies inside the wasm iteration callback), then push
      const bodies = [];
      world.forEachRigidBody?.((b) => { bodies.push(b); });
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
    // player
    if (dP < R) G.damagePlayer?.((W.dmg * (1 - dP / R)) * (P.state.inVehicle ? 0.5 : 1), 'explosion');
    if (byPlayer) { lastShootCrime = -99; G.reportCrime?.('shooting', pos.clone()); }
  }
  G.explode = explode;
  function grenadesTick(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.t -= dt;
      if (g.body) {
        const t = g.body.translation(), r = g.body.rotation();
        g.mesh.position.set(t.x, t.y, t.z); g.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        g.pos.set(t.x, t.y, t.z);
      } else {
        g.vel.y -= 9.81 * dt; g.pos.addScaledVector(g.vel, dt); if (g.pos.y < 0.06) { g.pos.y = 0.06; g.vel.multiplyScalar(0.4); g.vel.y = Math.abs(g.vel.y) * 0.3; }
        g.mesh.position.copy(g.pos);
      }
      if (g.t <= 0) {
        if (g.body) removeBodySafe(game, g.body);
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        explode(g.pos.clone(), true);
      }
    }
    if (flash && flash.userData.t > 0) { flash.userData.t -= dt; flash.intensity = Math.max(0, flash.userData.t / 0.25) * 800; }
  }

  // ---- melee (fists handled by the peds module; we add knife/bat + cops + ATMs)
  // reach: fist 0.9 m, knife 1.1 m, bat 1.5 m (from the shoulder); combos: 3rd hit in a chain / sprint = heavy
  const MELEE = { fist: { reach: 0.9, r: 0.09, light: 14, heavy: 32, delay: 0.12 }, knife: { reach: 1.1, r: 0.04, light: 52, heavy: 85, delay: 0.1 }, bat: { reach: 1.5, r: 0.06, light: 42, heavy: 72, delay: 0.16 } };
  let combo = 0, lastSwingT = -9, swing = null;
  function melee() {
    const k = WEAP[P.weapon]?.melee ? P.weapon : 'fist';
    const m = MELEE[k] || MELEE.fist;
    const now = game.clock.elapsed;
    combo = now - lastSwingT < 0.75 ? Math.min(3, combo + 1) : 1;
    lastSwingT = now;
    const heavy = combo === 3 || (P.state.sprint && (P.state.speed || 0) > 4);
    if (k !== 'fist') sfx(game, 'swing', P.position, heavy ? 0.9 : 0.6);
    swing = { k, m, heavy, t: 0, hit: new Set(), side: combo % 2 ? 1 : -1 };
    G.combatT = 0;
  }
  const _sh = new THREE.Vector3(), _tip = new THREE.Vector3(), _base = new THREE.Vector3();
  function swingTick(dt) {
    if (!swing) return;
    const sw = swing, m = sw.m;
    const t0 = sw.t; sw.t += dt;
    const dur = 0.16;
    if (sw.t < m.delay) return;
    // sample the arc between the previous and current phase
    const ph0 = Math.max(0, (t0 - m.delay) / dur), ph1 = Math.min(1, (sw.t - m.delay) / dur);
    const h = P.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    _sh.set(P.position.x + rx * 0.18 * sw.side, P.position.y + 1.38, P.position.z + rz * 0.18 * sw.side);
    const targets = hitTargets(game, G, P.position, m.reach + 1.2);
    for (let i = 0; i <= 3; i++) {
      const ph = ph0 + (ph1 - ph0) * (i / 3);
      const ang = (sw.side > 0 ? 1.1 : -1.1) * (1 - ph) - (sw.side > 0 ? 0.35 : -0.35) * ph; // sweep across the front
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dx = fx * ca + rx * sa, dz = fz * ca + rz * sa;
      const y = sw.k === 'bat' ? 1.3 - ph * 0.2 : 1.35 - ph * 0.08;
      _tip.set(_sh.x + dx * m.reach, P.position.y + y, _sh.z + dz * m.reach);
      _base.copy(_sh).lerp(_tip, sw.k === 'bat' ? 0.35 : sw.k === 'knife' ? 0.7 : 0.82);
      for (const tg of targets) {
        if (sw.hit.has(tg.obj)) continue;
        const h2 = segLimbs(_base, _tip, m.r, tg);
        if (!h2) continue;
        sw.hit.add(tg.obj);
        const dir = new THREE.Vector3(tg.pos.x - P.position.x, 0, tg.pos.z - P.position.z).normalize();
        let dmg = (sw.heavy ? m.heavy : m.light) * (h2.zone === 'head' ? 1.6 : h2.zone === 'torso' ? 1 : 0.8);
        const info = { zone: h2.zone, limb: h2.limb, point: h2.point, strength: sw.heavy ? 1 : 0.45, byPlayer: true, weapon: sw.k, heavy: sw.heavy };
        if (tg.kind === 'ped') {
          const ped = tg.obj;
          tryCall('peds.damage', () => game.peds?.damage?.(ped, dmg, dir, sw.k === 'fist' ? 'punch' : 'melee', info));
          if (!(ped.dead || ped.state === 'dead')) {
            // stagger reaction
            const kp = sw.heavy ? 3.2 : 1.6;
            if (ped.knock?.set) ped.knock.set(dir.x * kp, 0, dir.z * kp);
            ped.shoveT = sw.heavy ? 0.6 : 0.35;
            G.reportCrime?.('assault', ped.pos.clone(), ped);
          }
        } else if (tg.kind === 'npc') {
          G.damageNpc?.(tg.obj, dmg, dir, sw.k === 'fist' ? 'punch' : 'melee', h2.point, info);
        } else {
          G.police?.damageCop?.(tg.obj, dmg, dir, sw.k === 'fist' ? 'punch' : 'melee', h2.point, info);
        }
        G.lastConfirmedHit = game.clock.elapsed; G.lastMeleeHitT = game.clock.elapsed;
        sfx(game, sw.k === 'bat' ? 'bat_hit' : 'punch_hit', h2.point, sw.heavy ? 1 : 0.7);
        if (sw.heavy) G.shake = Math.max(G.shake || 0, 0.012);
      }
    }
    if (ph1 >= 1) {
      const h0 = P.heading, dir0 = new THREE.Vector3(Math.sin(h0), 0, Math.cos(h0));
      G.props?.meleeHit?.(P.position, dir0, sw.k === 'bat' ? 35 : sw.k === 'knife' ? 15 : (sw.heavy ? 14 : 9));
      swing = null;
    }
  }
  // we resolve all melee ourselves: stop the peds module's built-in punch check (runs after updaters)
  game.updaters?.push(() => { if (WEAP[P.weapon]?.melee && !P.state.inVehicle) P.state.punch = false; });
  game.on?.('punch', () => {
    // guns/grenades: LMB is handled by us (suppress the punch anim + ped punch hit)
    if (isGun(P.weapon) || WEAP[P.weapon]?.throw) { if (!WEAP[P.weapon]?.throw) P.state.punch = false; return; }
    if (blocked()) return;
    if (WEAP[P.weapon]?.melee) melee();
  });

  // ---- aiming at peds scares them (and silences would-be witnesses)
  let scareT = 0;
  function scareCheck() {
    const dir = aimDir(new THREE.Vector3(), 0), cam = camera.position;
    try {
      const hit = world.castRay(new RAPIER.Ray({ x: cam.x, y: cam.y, z: cam.z }, { x: dir.x, y: dir.y, z: dir.z }), scoped ? 300 : 40, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.collider || undefined);
      if (!hit) { if (scoped) scopeTxt.textContent = '---m'; return; }
      if (scoped) scopeTxt.textContent = `${Math.round(hit.timeOfImpact ?? hit.toi)}m`;
      const r = resolveCollider(hit.collider);
      if (r.kind === 'ped' && !r.obj.dead) {
        const ped = r.obj;
        ped._gpScaredT = game.clock.elapsed;
        if ((ped.state === 'walk' || ped.state === 'talk' || ped.state === 'film') && ped.pos.distanceTo(P.position) < 40) {
          ped.state = 'cower'; ped.stateT = rand(3, 5); ped.threat = { x: P.position.x, z: P.position.z }; ped.idleStyle = 'cower';
        }
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
  function resetAim() {
    rmb = false;
    setScoped(false);
    P.aiming = false; if (P.state) P.state.aiming = false;
    game.cameraZoom = 1;
  }
  G.resetAim = resetAim;
  function setScoped(on) {
    if (on === scoped) return;
    scoped = on;
    scopeEl.style.display = on ? 'block' : 'none';
    game.ui.scoped = on;
    if (on) scopeZoom = 1;
    if (playerRoot) {
      if (on && playerRoot.visible) { playerRoot.visible = false; hiddenByScope = true; }
      else if (!on && hiddenByScope) { if (!P.state.inVehicle) playerRoot.visible = true; hiddenByScope = false; }
    }
  }
  function update(dt) {
    const inp = game.input;
    const inCar = !!P.state.inVehicle;
    const k = P.weapon, w = WEAP[k] || WEAP.fist;
    const gun = isGun(k);
    // switching
    if (!blocked() && !scoped && !G.menuOpen) {
      for (let i = 1; i <= 7; i++) if (inp.pressed('Digit' + i)) selectSlot(i);
      if (inp.pressed('KeyQ')) cycle(1);
      if (wheelAcc) cycle(wheelAcc > 0 ? 1 : -1);
    }
    if (scoped && wheelAcc) scopeZoom = THREE.MathUtils.clamp(scopeZoom + (wheelAcc > 0 ? 0.25 : -0.25), 0.5, 2);
    wheelAcc = 0;
    if (!P.inventory.includes(P.weapon)) P.weapon = 'fist';
    if (!blocked() && inp.pressed('KeyR')) startReload();
    // reload progress
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadKey !== P.weapon) { reloadT = 0; reloadKey = null; }
      else if (reloadT <= 0) { fillClip(reloadKey); reloadKey = null; sfx(game, 'reload', P.position, 0.6); }
      else if (!reloadEjected && (reloadKey === 'revolver' || reloadKey === 'sawnoff') && reloadT < WEAP[reloadKey].reload * 0.75) { reloadEjected = true; ejectFrom(held[reloadKey], reloadKey === 'revolver' ? 'pistol' : 'shell', 0, reloadKey === 'revolver' ? Math.max(1, WEAP.revolver.clip - (P.clip.revolver || 0)) : 2, true); }
    }
    // aiming / scope
    // watchdog: without pointer lock, or if the button hasn't been confirmed held for a while, let go
    if (rmb && (!document.pointerLockElement || document.hidden)) rmb = false;
    const ui = game.ui || {};
    const hardStop = inCar || blocked() || ui.dead || ui.arrested || ui.busted || P.health <= 0;
    const aiming = rmb && !hardStop;
    P.aiming = aiming; P.state.aiming = aiming;
    setScoped(aiming && !!w.scope && reloadT <= 0 && P.weapon === k);
    game.cameraZoom = aiming ? (scoped ? 0.3 : 0.55) : 1;
    scopeFov = scoped ? 13 / scopeZoom : 0;
    // belt and braces: nothing scope-related may outlive the scope
    if (!scoped) {
      if (ui.scoped) ui.scoped = false;
      if (scopeEl.style.display !== 'none') scopeEl.style.display = 'none';
      if (hiddenByScope && playerRoot) { if (!inCar) playerRoot.visible = true; hiddenByScope = false; }
    }
    if (game.settings && !(game.settings.fov >= 45)) game.settings.fov = 62;
    if (aiming) lookT = Math.max(lookT, 0.2);
    lookT -= dt;
    G.faceCamera = lookT > 0 && !inCar;
    // firing
    cd -= dt;
    const driveBy = inCar && (w.cls === 'handgun' || w.cls === 'smg');
    if (gun && (!inCar || driveBy) && !blocked() && cd <= 0 && reloadT <= 0) {
      if (w.auto ? inp.mouseDown : inp.mouseClicked) fire();
    }
    if (w.throw && !inCar && !blocked() && cd <= 0 && inp.mouseClicked) throwGrenade();
    if (w.throw && aiming) updateArc(); else { arc.visible = false; arcEnd.visible = false; }
    tryCall('grenades', () => grenadesTick(dt));
    tryCall('swing', () => swingTick(dt));
    // recoil + shake
    if (recoilV > 0) { const kk = Math.min(recoilV, dt * 0.6 + recoilV * 0.5); game.cameraPitch -= kk * 0.6; recoilV -= kk; }
    if (G.shake > 0) { game.cameraPitch += rand(-1, 1) * G.shake; game.cameraYaw += rand(-1, 1) * G.shake; G.shake = Math.max(0, G.shake - dt * 0.15); }
    if (aiming && gun) { scareT -= dt; if (scareT <= 0) { scareT = 0.2; scareCheck(); } }

    // held model + arm pose
    if (!playerRoot || !playerRoot.parent) {
      playerRoot = scene.getObjectByName('character-player');
      handBone = playerRoot ? findBone(playerRoot, /RightHand$/i) : null;
      bones.rArm = playerRoot ? findBone(playerRoot, /RightArm$/i) : null;
      bones.lArm = playerRoot ? findBone(playerRoot, /LeftArm$/i) : null;
      bones.lHand = playerRoot ? findBone(playerRoot, /LeftHand$/i) : null;
    }
    const reloading = reloadT > 0;
    const twoHand = w.cls === 'smg' || w.cls === 'rifle' || w.cls === 'shotgun' || w.cls === 'sniper';
    if (gun && !inCar && (aiming || lookT > 0 || reloading) && handBone && bones.rArm && !G.dead && !G.jack && !scoped) {
      tryCall('aimArm', () => {
        camera.getWorldDirection(_fwd);
        if (reloading) { // lower the gun in front of the chest
          _o.set(P.position.x + Math.sin(P.heading) * 0.5, P.position.y + 0.9, P.position.z + Math.cos(P.heading) * 0.5);
        } else { _o.copy(camera.position).addScaledVector(_fwd, 60); _o.y += recoilAnim * (w.kick || 0.02) * 90; }
        aimArm(bones.rArm, handBone, _o, 1);
        if (bones.lArm && bones.lHand) {
          handBone.getWorldPosition(_hand);
          const reach = reloading ? 0.02 + Math.abs(Math.sin(reloadT * 6)) * 0.12 : (w.cls === 'handgun' ? 0.04 : twoHand ? 0.3 : 0.2);
          _o.copy(_hand).addScaledVector(reloading ? new THREE.Vector3(0, -1, 0) : _fwd, reach);
          aimArm(bones.lArm, bones.lHand, _o, 1);
        }
      });
    }
    for (const id in held) held[id].visible = false;
    const m = held[k];
    if (m && !inCar && playerRoot && !hiddenByScope && playerRoot.visible !== false && !G.dead) {
      m.visible = true;
      if (handBone) handBone.getWorldPosition(_hand);
      else _hand.set(P.position.x + Math.cos(P.heading) * -0.3, P.position.y + 1.0, P.position.z - Math.sin(P.heading) * -0.3);
      m.position.copy(_hand);
      if (reloading && gun) m.rotation.set(0.5, P.heading + 0.5, 0.4, 'YXZ');
      else if ((aiming || lookT > 0) && gun) {
        camera.getWorldDirection(_fwd);
        m.rotation.set(-Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)) - recoilAnim * (w.kick || 0.02) * 6, Math.atan2(_fwd.x, _fwd.z), 0, 'YXZ');
        m.translateZ(-recoilAnim * Math.min(0.06, (w.kick || 0.02) * 1.4));
      } else if (k === 'bat') m.rotation.set(-1.0, P.heading, 0, 'YXZ');
      else if (k === 'knife') m.rotation.set(0.3, P.heading, 0, 'YXZ');
      else if (k === 'grenade') m.rotation.set(0, P.heading, 0, 'YXZ');
      else m.rotation.set(twoHand ? 0.9 : 1.15, P.heading, 0, 'YXZ');
    }
    for (const tr of tracers) if (tr.l.visible) { tr.t -= dt; if (tr.t <= 0) tr.l.visible = false; }
    recoilAnim = Math.max(0, recoilAnim - dt * (6 + recoilAnim * 8));
    tryCall('gfx', () => gfx.update(dt));
  }
  function strip() {
    P.inventory = ['fist']; P.weapon = 'fist';
    for (const kk in P.ammo) P.ammo[kk] = 0;
    for (const kk in P.clip) P.clip[kk] = 0;
    setScoped(false);
    game.emit?.('weaponChange', { weapon: 'fist' });
  }
  return { update, select, strip, give, buyAmmo, WEAP, ORDER, muzzlePos, explode };
}
