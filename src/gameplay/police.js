// Police response: foot cops (own units, navy uniforms, KCC chase AI, pistols), police cars, roadblocks.
import * as THREE from 'three';
import { createCharacter } from '../player/characterModel.js';
import { rand, clamp, sfx, tryCall, hasLOS, pointNear, distXZ, findBone, inView, groundAt, warnOnce, aimArm, removeColliderSafe, removeBodySafe, bodyAlive, vAlive } from './util.js';
import { buildWeaponModel } from './gunModels.js';

const POOL = 8;
export const CAR_TARGET = [0, 1, 2, 3, 4, 6];
export const FOOT_TARGET = [0, 0, 2, 4, 6, 8];
export const SIGHT = { cone: 110, footRange: 60, carRange: 90, aware: 8, carAware: 15, night: 0.65, water: 0.6, covered: 0.7 };

function styleUniform(char) {
  char.root.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const u = m.material.userData?.uniforms;
    if (!u) return;
    if (u.uShirt) { u.uShirt.value.setHex(0x1c2a48); if (u.uTee) u.uTee.value.setHex(0x1c2a48); if (u.uSleeve) u.uSleeve.value = 0; if (u.uStripe) u.uStripe.value = 0; if (u.uOpen) u.uOpen.value = 0; }
    else if (u.uDenim !== undefined || u.uShorts !== undefined) { if (u.uColor) u.uColor.value.setHex(0x151b29); if (u.uDenim) u.uDenim.value = 0; if (u.uShorts) u.uShorts.value = 0; }
    else if (u.uSole) { if (u.uColor) u.uColor.value.setHex(0x0c0c0c); u.uSole.value.setHex(0x0c0c0c); if (u.uSandal) u.uSandal.value = 0; }
  });
  // fallback (non-shader characters): tint everything navy-ish
  if (!char.model) char.root.traverse((m) => { if (m.isMesh && m.material?.color) { m.material = m.material.clone(); m.material.color.setHex(0x1c2a48); } });
}
function makeCap() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x141c30, roughness: 0.6 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.08, 14), mat); crown.position.y = 0.04;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.105, 0.03, 14), mat); top.position.y = 0.09;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.08), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3 })); visor.position.set(0, 0.01, 0.11);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.01), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.9, roughness: 0.3, emissive: 0x4a3a10 })); badge.position.set(0, 0.06, 0.11);
  g.add(crown, top, visor, badge);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

export function createPolice(game, G) {
  const { scene, world, RAPIER } = game;
  const P = game.player;
  const units = [];
  const byHandle = new Map();
  const cars = [];        // {v, deployed, cops:[], mine}
  const blocks = [];      // roadblocks {meshes, colliders, cars, t}
  const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

  // ---------------- pool of foot cops
  function makeUnit(i) {
    let char = null;
    for (let k = 0; k < 4; k++) {
      char = tryCall('createCharacter', () => createCharacter(game, { variant: 'ped', outfit: 'cop', seed: 7700 + i * 131 + k * 17 }), null);
      if (!char || char.base !== 'female' || k === 3) break;
    }
    if (!char) return null;
    const nativeUniform = typeof char.setCopGear === 'function';
    if (nativeUniform) tryCall('copGear', () => char.setCopGear(true)); else styleUniform(char);
    char.root.visible = false;
    scene.add(char.root);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -80 - i * 3, 0));
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.28).setFriction(0.5), body);
    collider.setEnabled(false);
    const kcc = world.createCharacterController(0.03);
    kcc.setUp({ x: 0, y: 1, z: 0 }); kcc.enableAutostep(0.35, 0.2, true); kcc.enableSnapToGround(0.4);
    kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    const cap = makeCap(); cap.visible = false; cap.userData.native = nativeUniform; if (!nativeUniform) scene.add(cap);
    const gun = buildWeaponModel('pistol'); gun.visible = false; scene.add(gun); const gunKey = 'pistol';
    const u = {
      char, body, collider, kcc, cap, gun, gunKey, head: findBone(char.root, /Head$/i), hand: findBone(char.root, /RightHand$/i), arm: findBone(char.root, /RightArm$/i),
      pos: new THREE.Vector3(), heading: 0, speed: 0, health: 100, dead: false, deadT: 0, active: false, isCop: true,
      fireCd: 1, punchCd: 1, punch: false, stuckT: 0, side: 0, sideT: 0, car: null, mode: 'chase', wander: null, lifeT: 0, vy: 0,
    };
    byHandle.set(collider.handle, u);
    return u;
  }
  for (let i = 0; i < POOL; i++) { const u = makeUnit(i); if (u) units.push(u); }

  function spawnCop(pos, heading = 0, car = null) {
    const u = units.find((x) => !x.active);
    if (!u) return null;
    u.active = true; u.dead = false; u.deadT = 0; u.health = 100; u.car = car; u.mode = 'chase'; u.lifeT = 0; u.fireCd = rand(1, 2); u.vy = 0;
    u.pos.copy(pos); u.heading = heading; u.speed = 0; u.stuckT = 0; u.wander = null;
    // armament scales with heat
    const lv = G.wanted?.level || 0, r = Math.random();
    const key = lv >= 4 ? (r < 0.45 ? 'rifle' : r < 0.75 ? 'carbine' : 'shotgun') : lv >= 3 ? (r < 0.3 ? 'shotgun' : r < 0.45 ? 'smg' : 'pistol') : 'pistol';
    if (u.gunKey !== key) {
      const vis = u.gun.visible; scene.remove(u.gun);
      u.gun = buildWeaponModel(key); u.gun.visible = vis; scene.add(u.gun); u.gunKey = key;
    }
    u.body.setTranslation({ x: pos.x, y: pos.y + 0.9, z: pos.z }, true);
    u.collider.setEnabled(true);
    u.char.root.visible = true; u.cap.visible = !u.cap.userData.native; u.gun.visible = true;
    u.char.root.position.copy(pos);
    return u;
  }
  function despawnCop(u) {
    u.active = false; u.dead = false; u.char.root.visible = false; u.cap.visible = false; u.gun.visible = false;
    u.collider.setEnabled(false);
    u.body.setTranslation({ x: 0, y: -80, z: 0 }, true);
    if (u.car) { const c = u.car; c.cops = c.cops.filter((x) => x !== u); u.car = null; }
  }
  function damageCop(u, amount, dir, kind = 'bullet', point = null, info = {}) {
    if (!u.active || u.dead) return;
    u.health -= amount;
    G.combatT = 0; G.copAggroT = game.clock.elapsed;
    const pt = point || _v.set(u.pos.x, u.pos.y + 1.2, u.pos.z).clone();
    const zone = info.zone || (point && point.y - u.pos.y > 1.45 ? 'head' : 'torso');
    game.emit?.('hit', { target: 'ped', object: u, point: pt, normal: dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0), damage: amount, kind, byPlayer: true, zone, limb: info.limb, strength: info.strength ?? Math.min(1, amount / 100), isCop: true });
    u.staggerT = Math.max(u.staggerT || 0, kind === 'bullet' ? (zone === 'leg' ? 0.6 : 0.25) : info.heavy ? 0.8 : 0.4);
    sfx(game, kind === 'bullet' ? 'bullet_hit_flesh' : 'punch_hit', u.pos, 0.8);
    if (u.health <= 0) {
      u.dead = true; u.deadT = 0; u.health = 0;
      u.collider.setEnabled(false);
      u.gun.visible = false;
      G.reportCrime?.('cop_murder', u.pos.clone(), u);
      // drop weapon + ammo
      tryCall('drop', () => G.pickups?.spawn?.(u.gunKey || 'pistol', u.pos.clone().setY(u.pos.y + 0.05), { temp: true, life: 45, ammo: u.gunKey === 'shotgun' ? 8 : u.gunKey === 'pistol' ? 15 : 30 }));
    } else {
      G.reportCrime?.(kind === 'bullet' || kind === 'explosion' ? 'cop_shot' : 'cop_assault', u.pos.clone(), u);
      if (dir) { u.knock = dir.clone().setY(0).multiplyScalar(kind === 'bullet' ? 0.8 : 2.2); }
    }
  }

  // ---------------- player damage
  function damagePlayer(amount, from) {
    if (G.dead || G.busted) return;
    G.combatT = 0;
    let a = amount;
    if (P.armor > 0) { const ab = Math.min(P.armor, a * 0.8); P.armor -= ab; a -= ab; }
    P.health = Math.max(0, P.health - a);
    game.emit?.('playerHit', { damage: amount, from });
  }
  G.damagePlayer = damagePlayer;

  // ---------------- per-cop AI
  const QF = RAPIER.QueryFilterFlags;
  function copShoot(u, target, dist, from = null) {
    const muzzle = from ? _a.copy(from) : u.gun.userData.muzzle ? u.gun.localToWorld(_a.copy(u.gun.userData.muzzle)) : _a.set(u.pos.x, u.pos.y + 1.4, u.pos.z);
    const inCar = !!P.state.inVehicle;
    const lvl = G.wanted.level;
    let p = clamp(0.48 - dist * 0.011 - (P.state.speed || 0) * 0.04 + lvl * 0.04, 0.06, 0.65);
    if (inCar) p *= 0.75;
    const hitP = Math.random() < p;
    const end = _b.copy(target);
    if (!hitP) { end.x += rand(-1.5, 1.5); end.y += rand(-0.8, 0.6); end.z += rand(-1.5, 1.5); }
    G.tracer?.(muzzle, end);
    tryCall('fx.muzzle', () => game.fx?.muzzleFlash?.(muzzle.clone(), end.clone().sub(muzzle).normalize()));
    sfx(game, u?.gunKey || 'pistol', muzzle, 0.85);
    if (hitP) {
      const dmg = (rand(5, 9) + lvl) * (u?.gunKey === 'shotgun' ? (dist < 15 ? 1.8 : 0.5) : u?.gunKey === 'rifle' || u?.gunKey === 'smg' ? 0.55 : u?.gunKey === 'carbine' ? 1.1 : 1);
      if (inCar) { const v = P.state.vehicle; if (v) v.health = (v.health ?? 1000) - dmg * 2; damagePlayer(dmg * 0.35, u); }
      else damagePlayer(dmg, u);
    } else if (!inCar) {
      tryCall('fx.impact', () => game.fx?.bulletImpact?.(new THREE.Vector3(end.x, Math.max(0.02, end.y < 0.4 ? 0.02 : end.y), end.z), new THREE.Vector3(0, 1, 0), game.surfaceAt?.(end.x, end.z)));
    }
  }

  function moveUnit(u, dx, dz, speed, dt) {
    const l = Math.hypot(dx, dz);
    let mx = 0, mz = 0;
    if (l > 0.01 && speed > 0) {
      let nx = dx / l, nz = dz / l;
      if (u.sideT > 0) { u.sideT -= dt; const sx = -nz * u.side, sz = nx * u.side; nx = nx * 0.3 + sx; nz = nz * 0.3 + sz; const n = Math.hypot(nx, nz); nx /= n; nz /= n; }
      mx = nx * speed * dt; mz = nz * speed * dt;
      const want = Math.atan2(nx, nz);
      let d = want - u.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      u.heading += d * Math.min(1, dt * 8);
    }
    if (u.knock) { mx += u.knock.x * dt * 3; mz += u.knock.z * dt * 3; u.knock.multiplyScalar(Math.max(0, 1 - dt * 6)); if (u.knock.lengthSq() < 0.01) u.knock = null; }
    u.vy = Math.max(-20, u.vy - 18 * dt);
    const desired = { x: mx, y: u.vy * dt, z: mz };
    let mv = desired;
    try {
      u.kcc.computeColliderMovement(u.collider, desired, QF.EXCLUDE_SENSORS);
      mv = u.kcc.computedMovement();
      if (u.kcc.computedGrounded()) u.vy = -1;
    } catch (e) { /* ignore */ }
    const t = u.body.translation();
    const nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z;
    u.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    const moved = Math.hypot(mv.x, mv.z);
    u.speed = dt > 0 ? moved / dt : 0;
    if (speed > 1 && moved < speed * dt * 0.3) { u.stuckT += dt; if (u.stuckT > 0.4) { u.side = Math.random() < 0.5 ? -1 : 1; u.sideT = rand(0.8, 1.6); u.stuckT = 0; } } else u.stuckT = 0;
    u.pos.set(nx, ny - 0.88, nz);
    if (u.pos.y < -10) { const gy = groundAt(game, u.pos.x, u.pos.z); u.body.setTranslation({ x: u.pos.x, y: gy + 0.9, z: u.pos.z }, true); u.vy = 0; }
  }

  let arrestT = 0;
  function updateUnit(u, dt) {
    const W = G.wanted;
    const pp = P.position;
    u.lifeT += dt;
    u.punch = false;
    if (u.staggerT > 0) u.staggerT -= dt;
    if (u.dead) {
      u.deadT += dt;
      if (u.deadT > 20 || (u.deadT > 6 && distXZ(u.pos, pp) > 60)) despawnCop(u);
      return;
    }
    const tgt = _v.set(pp.x, pp.y + 1.3, pp.z);
    const dist = distXZ(u.pos, pp);
    const eye = _a.set(u.pos.x, u.pos.y + 1.6, u.pos.z);
    u.sees = W.level > 0 && canSee(eye, u.heading, SIGHT.footRange, SIGHT.aware, tgt);
    let gx = 0, gz = 0, speed = 0;
    if (W.level === 0) {
      // stand down: walk off then vanish
      u.mode = 'leave';
      if (!u.wander) u.wander = new THREE.Vector3(u.pos.x + rand(-40, 40), 0, u.pos.z + rand(-40, 40));
      gx = u.wander.x - u.pos.x; gz = u.wander.z - u.pos.z; speed = 1.4;
      if ((dist > 45 && !inView(game, u.pos)) || u.lifeT > 200 || dist > 120) { despawnCop(u); return; }
    } else if (u.sees || dist < 25) {
      u.mode = 'chase'; u.wander = null;
      gx = pp.x - u.pos.x; gz = pp.z - u.pos.z;
      const shooter = W.level >= 3 || !!G.playerArmedRecently?.(); // 1-2 stars: only return fire against an armed suspect
      if (shooter && u.sees && dist < 38) {
        // close in to ~12m and shoot
        speed = dist > 16 ? 5.6 : dist > 9 ? 2.2 : 0;
        u.fireCd -= dt;
        if (u.fireCd <= 0) { const auto = u.gunKey === 'rifle' || u.gunKey === 'smg'; u.fireCd = (auto ? rand(0.25, 0.45) : u.gunKey === 'shotgun' ? rand(1.1, 1.6) : rand(0.7, 1.5)) - W.level * 0.05; copShoot(u, tgt, dist); }
        if (speed === 0) { gx = pp.x - u.pos.x; gz = pp.z - u.pos.z; }
      } else {
        speed = dist > 7 ? 6.2 : dist > 2.2 ? 3.6 : dist > 1.1 ? 1.4 : 0;
        // melee when the player is fighting back
        u.punchCd -= dt;
        if (dist < 1.4 && u.punchCd <= 0 && !P.state.inVehicle && game.clock.elapsed - (G.copAggroT ?? -99) < 6) { u.punchCd = rand(0.9, 1.4); u.punch = true; if (Math.random() < 0.7) damagePlayer(rand(4, 8), u); }
      }
    } else {
      // search the circle
      u.mode = 'search';
      const c = W.searchCenter || W.lastSeen;
      if (!u.wander || distXZ(u.pos, u.wander) < 3) {
        const r = Math.max(10, (W.searchRadius || 50) * 0.7);
        u.wander = new THREE.Vector3(c.x + rand(-r, r), 0, c.z + rand(-r, r));
      }
      gx = u.wander.x - u.pos.x; gz = u.wander.z - u.pos.z; speed = 3.2;
      if (dist > 160) { despawnCop(u); return; }
    }
    if (u.staggerT > 0) { speed = 0; u.fireCd = Math.max(u.fireCd, 0.3); }
    if (speed === 0 && (gx || gz)) { // turn to face
      const want = Math.atan2(gx, gz); let d = want - u.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); u.heading += d * Math.min(1, dt * 8);
    }
    moveUnit(u, gx, gz, speed, dt);
  }

  function visualUnit(u, dt) {
    if (!u.active) return;
    const c = u.char;
    c.root.position.copy(u.pos);
    c.root.rotation.y = u.heading;
    const near = distXZ(u.pos, P.position) < 90;
    if (near || u.lodSkip > 3) {
      tryCall('cop.anim', () => c.update(dt * (u.lodSkip || 1), { speed: u.speed, grounded: true, jumping: false, sprint: u.speed > 5, driving: false, punch: u.punch, dead: u.dead, deadStyle: 'back', guard: false }));
      u.lodSkip = 1;
    } else u.lodSkip = (u.lodSkip || 1) + 1;
    if (u.head) { u.head.getWorldPosition(_a); u.cap.position.set(_a.x, _a.y + 0.07, _a.z); } else u.cap.position.set(u.pos.x, u.pos.y + 1.72, u.pos.z);
    u.cap.rotation.set(0, u.heading, 0);
    u.cap.visible = !u.dead && !u.cap.userData.native;
    if (u.hand && !u.dead) {
      u.hand.getWorldPosition(_a); u.gun.position.copy(_a);
      if (u.mode === 'chase' && G.wanted.level >= 2 && u.sees) {
        if (u.arm && distXZ(u.pos, P.position) > 2) { aimArm(u.arm, u.hand, _b.set(P.position.x, P.position.y + 1.2, P.position.z), 1); u.hand.getWorldPosition(_a); u.gun.position.copy(_a); }
        const pp = P.position; const dx = pp.x - _a.x, dy = pp.y + 1.2 - _a.y, dz = pp.z - _a.z;
        u.gun.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ');
      } else u.gun.rotation.set(1.2, u.heading, 0, 'YXZ');
    }
  }

  // ---------------- police cars
  const V = () => game.vehicles;
  function removeCar(c) {
    const v = c.v;
    tryCall('setChaseTarget', () => v.setChaseTarget?.(null));
    for (const u of c.cops.slice()) { if (!u.dead && (distXZ(u.pos, P.position) > 50 || G.wanted.level === 0)) despawnCop(u); else u.car = null; }
    const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);
    if (c.mine) {
      const rm = V()?.remove || V()?.despawn;
      if (rm) tryCall('vehicles.remove', () => rm.call(V(), v));
      else spare.push(v);
    }
  }
  const spare = []; // spawned cars we couldn't remove: reuse them
  function placeCar(v, pos, heading) {
    try {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
      v.body.setTranslation({ x: pos.x, y: (pos.y || 0) + (v.groundOff || 0.6) + 0.1, z: pos.z }, true);
      v.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      v.body.setLinvel({ x: 0, y: 0, z: 0 }, true); v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return true;
    } catch (e) { return false; }
  }
  let driverSeed = 8800;
  function seatCopDriver(v) {
    if (!v || v._gpCopDriver) return;
    const old = v.driverChar, root = old?.root || v.driver;
    if (!root || !root.parent) return;
    const ch = tryCall('cop driver', () => createCharacter(game, { variant: 'ped', outfit: 'cop', seed: driverSeed++ }), null);
    if (!ch?.root) return;
    tryCall('copGear', () => ch.setCopGear?.(true));
    ch.root.position.copy(root.position); ch.root.quaternion.copy(root.quaternion); ch.root.scale.copy(root.scale);
    ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    root.parent.add(ch.root); root.parent.remove(root);
    tryCall('drv pose', () => ch.update?.(0.5, { driving: true, speed: 0, grounded: true }));
    v.driver = ch.root; v.driverChar = ch; v._gpCopDriver = true;
  }
  G.seatCopDriver = seatCopDriver;
  function spawnPoliceCar(pos, heading, ai = true) {
    const vs = V();
    let v = null;
    if (spare.length) { v = spare.pop(); if (!placeCar(v, pos, heading)) v = null; }
    if (!v && vs?.spawn) v = tryCall('vehicles.spawn', () => vs.spawn('police', pos, heading, { ai, police: true }), null);
    if (!v) return null;
    v.police = true;
    seatCopDriver(v);
    if (typeof v.siren === 'function') tryCall('siren', () => v.siren(true));
    else v.sirenOn = true;
    return v;
  }
  let carSpawnCd = 2, footSpawnCd = 3;
  // Police cars are dispatched from the nearest station: they appear out of sight 170-300 m away on the road route from the
  // station towards the player (so they arrive from the station's direction), never on the road next to the player.
  let dispatchCache = null;
  function dispatchPoint(pp) {
    const C = G.city, ms = Math.sqrt(C?.mapScale || 1), iv = (q) => inView(game, q);
    const st = tryCall('policeStation', () => C?.respawnPoint?.('police', pp), null);
    if (st && Number.isFinite(st.x)) {
      const ds = Math.hypot(st.x - pp.x, st.z - pp.z);
      if (ds < 200 * ms) { // station is close by: cars pull out of it
        const r = C.roadPoint(st, 0, 60, { avoidView: true, inView: iv });
        if (r && distXZ(r.position, pp) > 70) return r;
      } else if (ds < 3000) {
        if (!dispatchCache || Math.hypot(dispatchCache.x - pp.x, dispatchCache.z - pp.z) > 60 || dispatchCache.sx !== st.x) {
          dispatchCache = { x: pp.x, z: pp.z, sx: st.x, path: tryCall('dispatchPath', () => C.findPath(pp.x, pp.z, st.x, st.z), null) };
        }
        const path = dispatchCache.path;
        if (path && path.length > 1) {
          for (const q of path) {
            const d = Math.hypot(q.x - pp.x, q.z - pp.z);
            if (d < 170 * ms) continue;
            if (d > 320 * ms) break;
            const r = C.roadPoint(new THREE.Vector3(q.x, pp.y, q.z), 0, 30, { avoidView: true, inView: iv });
            if (r && distXZ(r.position, pp) > 150 * ms) return r;
          }
        }
      }
    }
    return C?.roadPoint(pp, 170 * ms, 280 * ms, { avoidView: true, inView: iv, tries: 24 }) || pointNear(game, pp, 160, 260, 'road', true);
  }
  // road-graph navigation: A* to the goal, follow waypoints, go direct when close
  function navTarget(c, t, goal, dt) {
    const C = G.city;
    const dGoal = distXZ(t, goal);
    if (!C || !C.graph || dGoal < 70 || (dGoal < 120 && hasLOS(game, _a.set(t.x, t.y + 1, t.z), _b.set(goal.x, (goal.y || 0) + 1, goal.z)))) { c.path = null; return goal; }
    c.replanT = (c.replanT ?? 0) - dt;
    if (!c.path || c.replanT <= 0 || !c.planGoal || Math.hypot(c.planGoal.x - goal.x, c.planGoal.z - goal.z) > 35) {
      c.replanT = 3;
      c.path = tryCall('findPath', () => C.findPath(t.x, t.z, goal.x, goal.z), null);
      c.wp = 0; c.planGoal = { x: goal.x, z: goal.z };
      if (c.path) { // skip waypoints already behind us
        let bi = 0, bd = Infinity;
        for (let i = 0; i < Math.min(c.path.length, 6); i++) { const q = c.path[i]; const dd = Math.hypot(q.x - t.x, q.z - t.z); if (dd < bd) { bd = dd; bi = i; } }
        c.wp = bi;
      }
    }
    if (!c.path || !c.path.length) return goal;
    while (c.wp < c.path.length - 1 && Math.hypot(c.path[c.wp].x - t.x, c.path[c.wp].z - t.z) < 14) c.wp++;
    (c.navPt ||= new THREE.Vector3()).set(c.path[c.wp].x, 0, c.path[c.wp].z);
    return c.navPt;
  }
  function carTick(dt) {
    const W = G.wanted, lvl = W.level, pp = P.position;
    const onFoot = !P.state.inVehicle;
    // adopt nearby existing AI police cars (traffic) when wanted
    if (lvl > 0) {
      for (const v of V()?.list || []) {
        if ((v.typeKey === 'police' || v.police) && v.ai && !v.playerDriven && vAlive(game, v) && !cars.some((c) => c.v === v) && distXZ(v.body.translation(), pp) < 160 && cars.length < CAR_TARGET[lvl] + 1) {
          cars.push({ v, deployed: false, cops: [], mine: false }); seatCopDriver(v);
        }
      }
    }
    carSpawnCd -= dt;
    if (lvl > 0 && carSpawnCd <= 0 && cars.length < CAR_TARGET[lvl]) {
      carSpawnCd = lvl >= 5 ? 3 : lvl >= 3 ? 4.5 : 6;
      const r = dispatchPoint(pp);
      if (r) { const v = spawnPoliceCar(r.position, r.heading, true); if (v) cars.push({ v, deployed: false, cops: [], mine: true, t: 0 }); }
    }
    for (const c of cars.slice()) {
      const v = c.v;
      if (!vAlive(game, v) || v.playerDriven) { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); continue; }
      c.t = (c.t || 0) + dt;
      if (!v._gpCopDriver && v.driver) seatCopDriver(v);
      const t = v.body.translation();
      const d = distXZ(t, pp);
      if (lvl === 0) {
        if (v.chaseTarget) tryCall('setChaseTarget', () => v.setChaseTarget?.(null));
        if ((d > 90 && !inView(game, _a.set(t.x, t.y, t.z))) || d > 200 || c.t > 400) removeCar(c);
        continue;
      }
      if (d > 260 * (G.city?.mapScale || 1)) { removeCar(c); continue; }
      if (!c.deployed) {
        // evading: cars search the circle instead of homing on the player
        let target = P.position;
        if (W.evading && W.searchCenter) {
          c.searchT = (c.searchT || 0) + dt;
          if (!c.searchPt || distXZ(t, c.searchPt) < 14 || c.searchT > 18) {
            const R = (W.searchRadius || 60) * 0.8, a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R;
            c.searchPt = new THREE.Vector3(W.searchCenter.x + Math.cos(a) * rr, 0, W.searchCenter.z + Math.sin(a) * rr); c.searchT = 0;
          }
          target = c.searchPt;
        } else c.searchPt = null;
        const goal = target;
        target = navTarget(c, t, goal, dt);
        if (v.chaseTarget !== target) tryCall('setChaseTarget', () => v.setChaseTarget?.(target));
        // stuck fallback: no progress -> cops bail out on foot (if close) or the car is relocated out of view
        const dT = distXZ(t, goal);
        if (c.bestD === undefined || dT < c.bestD - 4) { c.bestD = dT; c.stuckT = 0; } else c.stuckT = (c.stuckT || 0) + dt;
        if (c.stuckT > 5 && onFoot && d < 75 && !W.evading) c.forceDeploy = true;
        if (c.stuckT > 9) {
          c.bestD = undefined;
          c.stuckT = 0;
          const r = G.city?.roadPoint(pp, 60, 120, { avoidView: true, inView: (q) => inView(game, q) }) || pointNear(game, pp, 60, 110, 'road', true);
          if (r && placeCar(v, r.position, r.heading)) { c.path = null; tryCall('setChaseTarget', () => { v.setChaseTarget?.(null); v.setChaseTarget?.(target); }); }
        }
        // 4+ stars: passenger shoots out of the window
        if (lvl >= 4 && W.seen && d < 35) {
          c.fireCd = (c.fireCd ?? 1) - dt;
          if (c.fireCd <= 0) {
            c.fireCd = rand(1.0, 1.8);
            const tgt = _b.set(pp.x, pp.y + 1.1, pp.z);
            const from = new THREE.Vector3(t.x, t.y + 1.0, t.z).lerp(tgt, 1.6 / Math.max(d, 2));
            if (hasLOS(game, from, tgt)) copShoot(null, tgt.clone(), d, from);
          }
        }
        const slow = (v.speedKmh || 0) < 25;
        if (d < 40 && (v.speedKmh || 0) < 8) c.slowT = (c.slowT || 0) + dt; else c.slowT = 0;
        if (c.slowT > 1.5 && onFoot) c.forceDeploy = true;
        if (onFoot && (W.seen || d < 12 || c.slowT > 1.5) && ((d < 18 && slow) || d < 9 || c.forceDeploy)) {
          c.slowT = 0;
          c.forceDeploy = false; c.bestD = undefined;
          c.deployed = true;
          tryCall('setChaseTarget', () => v.setChaseTarget?.(null));
          tryCall('ejectDriver', () => v.ejectDriver?.()); v.ai = null; v.parked = true; c.mine = true; tryCall('setControls', () => v.setControls?.({ throttle: 0, steer: 0, brake: 1, handbrake: true }));
          const ep = v.exitPosition ? v.exitPosition() : new THREE.Vector3(t.x + 2, 0, t.z);
          const n = lvl >= 2 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const p = k === 0 ? ep : new THREE.Vector3(2 * t.x - ep.x, ep.y, 2 * t.z - ep.z);
            p.y = groundAt(game, p.x, p.z, t.y + 2);
            const u = spawnCop(p, Math.atan2(pp.x - p.x, pp.z - p.z), c);
            if (u) c.cops.push(u);
          }
          sfx(game, 'door', ep, 0.7);
        }
      } else if (P.state.inVehicle && d > 45) {
        // cops get back in and resume the chase
        for (const u of c.cops.slice()) if (!u.dead && distXZ(u.pos, t) < 25) despawnCop(u);
        if (!c.cops.some((u) => !u.dead)) { c.deployed = false; c.cops = []; c.bestD = undefined; c.stuckT = 0; }
      }
    }
    // foot patrols arriving from around corners (2+ stars)
    footSpawnCd -= dt;
    const footActive = units.filter((u) => u.active && !u.dead).length;
    if (lvl >= 2 && footSpawnCd <= 0 && footActive < FOOT_TARGET[lvl] && onFoot) {
      footSpawnCd = lvl >= 5 ? rand(2.5, 4) : rand(5, 9);
      const from = W.evading && W.searchCenter ? W.searchCenter : pp;
      const q = G.city?.sidewalkPoint(from, 35, 75, null, { avoidView: true, inView: (x) => inView(game, x) });
      const r = q ? { position: q } : pointNear(game, from, 35, 70, 'sidewalk', true);
      if (r) spawnCop(r.position, Math.atan2(pp.x - r.position.x, pp.z - r.position.z));
    }
  }

  // ---------------- roadblocks (4+ stars)
  const stripeTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 16; const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#e02020'; g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 16, 0); g.lineTo(i * 16 + 8, 16); g.lineTo(i * 16 - 8, 16); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
  })();
  const barMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, emissive: 0x330000 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const barGeo = new THREE.BoxGeometry(3, 0.3, 0.08), legGeo = new THREE.BoxGeometry(0.08, 1, 0.5);
  function makeBarrier(x, z, heading, gy = 0) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(barGeo, barMat); bar.position.y = 0.95;
    const l1 = new THREE.Mesh(legGeo, legMat); l1.position.set(-1.3, 0.5, 0);
    const l2 = l1.clone(); l2.position.x = 1.3;
    g.add(bar, l1, l2); g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(x, gy, z); g.rotation.y = heading; scene.add(g);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    // light breakaway prop: ~20 kg dynamic body; cars plough through it, people can shove it
    let body = null, col = null;
    try {
      body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, gy + 0.55, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.4).setAngularDamping(0.6).setCanSleep(true).setCcdEnabled(true));
      col = world.createCollider(RAPIER.ColliderDesc.cuboid(1.5, 0.55, 0.22).setMass(20).setFriction(0.7).setRestitution(0.2), body);
      body.sleep();
    } catch (e) { body = null; }
    const it = { g, col, body, hit: false, offset: new THREE.Vector3(0, -0.55, 0) };
    barriers.push(it);
    return it;
  }
  const barriers = [];
  const _bq = new THREE.Quaternion(), _bo = new THREE.Vector3();
  function barrierTick() {
    for (const it of barriers.slice()) {
      if (!it.body) continue;
      if (!bodyAlive(game, it.body)) { barriers.splice(barriers.indexOf(it), 1); continue; }
      if (it.body.isSleeping()) continue;
      const t = it.body.translation(), r = it.body.rotation();
      _bq.set(r.x, r.y, r.z, r.w);
      it.g.quaternion.copy(_bq);
      _bo.copy(it.offset).applyQuaternion(_bq);
      it.g.position.set(t.x + _bo.x, t.y + _bo.y, t.z + _bo.z);
      const lv = it.body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
      if (sp > 2.5 && !it.hit) { // first real impact: clatter + nick the car that hit it
        it.hit = true;
        const at = new THREE.Vector3(t.x, t.y, t.z);
        sfx(game, 'bat_hit', at, 0.9);
        tryCall('fx', () => game.fx?.sparks?.(at, new THREE.Vector3(0, 1, 0)));
        for (const v of V()?.list || []) {
          if (!vAlive(game, v)) continue;
          const vt = v.body.translation();
          if (Math.hypot(vt.x - t.x, vt.z - t.z) < 4.5) { tryCall('v.damage', () => v.damage?.(15, null)); v.health = (v.health ?? 1000) - 15; game.emit?.('crash', { vehicle: v, impulse: 400, point: at }); break; }
        }
      }
      if (sp < 0.5) it.hit = false;
    }
  }
  function removeBarrier(it) {
    scene.remove(it.g);
    if (it.body) removeBodySafe(game, it.body); else if (it.col) removeColliderSafe(game, it.col);
    const i = barriers.indexOf(it); if (i >= 0) barriers.splice(i, 1);
  }
  let blockCd = 10;
  function roadblockTick(dt) {
    const lvl = G.wanted.level;
    blockCd -= dt;
    for (const b of blocks.slice()) {
      b.t += dt;
      const d = distXZ(b.center, P.position);
      const seen = inView(game, b.center);
      if ((lvl === 0 && d > 50 && !seen) || (b.t > 60 && d > 80 && !seen) || d > 300) {
        for (const m of b.items) removeBarrier(m);
        for (const v of b.cars) removeCar({ v, cops: [], mine: true });
        blocks.splice(blocks.indexOf(b), 1);
      }
    }
    if (lvl < 4 || blockCd > 0 || !P.state.inVehicle || (P.state.vehicle?.speedKmh || 0) < 35 || blocks.length >= 2) return;
    blockCd = 25;
    const vel = P.state.vehicle?.body?.linvel?.() || { x: Math.sin(P.heading), z: Math.cos(P.heading) };
    const vl = Math.hypot(vel.x, vel.z) || 1;
    const dir = { x: vel.x / vl, z: vel.z / vl };
    const ra = G.city?.roadAhead?.(P.position, dir, 85 * Math.sqrt(G.city?.mapScale || 1));
    if (!ra) return;
    const cx = ra.x, cz = ra.z, gy = G.city.groundHeight(cx, cz);
    const center = new THREE.Vector3(cx, gy, cz);
    const b = { center, items: [], cars: [], t: 0 };
    const perp = { x: -ra.dir.z, z: ra.dir.x };
    const W2 = Math.max(6, ra.width || 10);
    const carHeading = Math.atan2(perp.x, perp.z);
    const barRot = Math.atan2(-perp.z, perp.x);
    for (const sgn of [-1, 1]) {
      const px = cx + perp.x * sgn * W2 * 0.27, pz = cz + perp.z * sgn * W2 * 0.27;
      const v = spawnPoliceCar(new THREE.Vector3(px, gy, pz), carHeading + (sgn > 0 ? 0 : Math.PI), false);
      if (v) { tryCall('setChaseTarget', () => v.setChaseTarget?.(null)); tryCall('eject', () => v.ejectDriver?.()); v.ai = null; v.parked = true; b.cars.push(v); }
      else b.items.push(makeBarrier(px, pz, barRot, gy));
    }
    b.items.push(makeBarrier(cx, cz, barRot, gy));
    for (const sgn of [-1, 1]) {
      const p = new THREE.Vector3(cx + ra.dir.x * 4 + perp.x * sgn * 3, gy, cz + ra.dir.z * 4 + perp.z * sgn * 3);
      spawnCop(p, Math.atan2(P.position.x - p.x, P.position.z - p.z));
    }
    blocks.push(b);
    tryCall('notify', () => game.hud?.notify?.('Roadblock ahead!', 2200));
  }

  // ---------------- arrest check
  function arrestTick(dt) {
    const lvl = G.wanted.level;
    if (lvl === 0 || lvl > 2 || P.state.inVehicle || G.dead || G.busted) { arrestT = 0; G.arrestT = 0; return; }
    let close = false;
    for (const u of units) if (u.active && !u.dead && distXZ(u.pos, P.position) < 1.6 && Math.abs(u.pos.y - P.position.y) < 1.5) close = true;
    const resisting = (P.state.sprint && (P.state.speed || 0) > 4) || game.clock.elapsed - (G.copAggroT ?? -99) < 4 || !!G.playerArmedRecently?.();
    if (close && !resisting) {
      if (arrestT === 0) sfx(game, 'whistle', P.position, 0.7);
      arrestT += dt;
    } else arrestT = Math.max(0, arrestT - dt * 2);
    G.arrestT = arrestT;
    if (arrestT > 2) { arrestT = 0; G.arrestT = 0; G.bust?.(); }
  }

  // vision: 110 deg cone, range shrinks at night / in water / under cover (bridges), LOS ray, close-range awareness
  function visMul(target) {
    let k = 1;
    const tod = game.timeOfDay ?? 12;
    if (tod < 6.5 || tod > 19.5) k *= SIGHT.night;
    try { if ((P.waterDepth || 0) > 0.4 || G.city?.isWater?.(target.x, target.z)) k *= SIGHT.water; } catch (e) { /* ignore */ }
    if (game.clock.elapsed - coverT > 0.5) { coverT = game.clock.elapsed; covered = hasLOS(game, _c.set(target.x, target.y + 1, target.z), _d.set(target.x, target.y + 9, target.z)) === false; }
    if (covered) k *= SIGHT.covered;
    return k;
  }
  let coverT = -9, covered = false;
  const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
  function canSee(eye, heading, range, aware, tgt) {
    const dx = tgt.x - eye.x, dz = tgt.z - eye.z, d = Math.hypot(dx, dz);
    if (d < aware) return true;
    if (d > range * visMul(tgt)) return false;
    if (heading !== null && heading !== undefined) {
      let a = Math.atan2(dx, dz) - heading; a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > (SIGHT.cone / 2) * Math.PI / 180) return false;
    }
    return hasLOS(game, eye, tgt);
  }
  G.canSee = canSee;
  function anySees() {
    for (const u of units) if (u.active && !u.dead && u.sees) return true;
    const pp = P.position, tgt = _b.set(pp.x, pp.y + 1.3, pp.z);
    for (const c of cars) {
      if (c.deployed && c.cops.length) continue;
      if (!vAlive(game, c.v)) continue;
      const t = c.v.body.translation();
      if (canSee(_e.set(t.x, t.y + 1.2, t.z), c.v.heading, SIGHT.carRange, SIGHT.carAware, tgt)) return true;
    }
    return false;
  }
  // a cop that would witness a crime at `pos`
  function copWitness(pos) {
    const tgt = _b.set(pos.x, pos.y + 1.2, pos.z);
    for (const u of units) if (u.active && !u.dead && canSee(_a.set(u.pos.x, u.pos.y + 1.6, u.pos.z), u.heading, SIGHT.footRange, SIGHT.aware, tgt)) return true;
    for (const c of cars) { if (!vAlive(game, c.v)) continue; const t = c.v.body.translation(); if (canSee(_a.set(t.x, t.y + 1.2, t.z), c.v.heading, SIGHT.carRange, SIGHT.carAware, tgt)) return true; }
    for (const v of V()?.list || []) {
      if (!(v.typeKey === 'police' || v.police) || v.playerDriven || !v.ai) continue;
      if (!vAlive(game, v)) continue;
      const t = v.body.translation(); if (canSee(_a.set(t.x, t.y + 1.2, t.z), v.heading, SIGHT.carRange, SIGHT.carAware, tgt)) return true;
    }
    for (const ped of game.peds?.list || []) if (ped.isCop && !ped.dead && ped.pos && canSee(_a.set(ped.pos.x, ped.pos.y + 1.6, ped.pos.z), ped.heading, SIGHT.footRange, SIGHT.aware, tgt)) return true;
    return false;
  }

  function clearAll() {
    for (const u of units) if (u.active && !u.dead) { u.mode = 'leave'; }
  }

  function update(dt) {
    tryCall('police.cars', () => carTick(dt));
    tryCall('police.roadblock', () => roadblockTick(dt));
    tryCall('police.barriers', () => barrierTick());
    for (const u of units) if (u.active) { tryCall('police.unit', () => updateUnit(u, dt)); }
    for (const u of units) if (u.active) visualUnit(u, dt);
    tryCall('police.arrest', () => arrestTick(dt));
  }
  function hardReset() {
    for (const u of units) if (u.active) despawnCop(u);
    for (const c of cars.slice()) removeCar(c);
    blockCd = 10; carSpawnCd = 4; footSpawnCd = 5;
  }
  if (!units.length) warnOnce('police', 'no foot cop units (character model failed)');
  return { barriers, makeBarrier, blocks, units, cars, byHandle, spawnCop, despawnCop, damageCop, damagePlayer, anySees, copWitness, clearAll, hardReset, update, spawnPoliceCar, removeCar };
}
