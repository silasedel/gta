// Police response: foot cops (own units, navy uniforms, KCC chase AI, pistols), police cars, roadblocks.
import * as THREE from 'three';
import { createCharacter } from '../player/characterModel.js';
let seatMod = null;
import('../npc/seat.js')
  .then((m) => {
    seatMod = m;
  })
  .catch(() => {
    /* seat solver unavailable: copied transform */
  });
import {
  rand,
  clamp,
  pick,
  sfx,
  tryCall,
  hasLOS,
  pointNear,
  distXZ,
  findBone,
  inView,
  groundAt,
  warnOnce,
  aimArm,
  removeColliderSafe,
  removeBodySafe,
  bodyAlive,
  vAlive,
} from './util.js';
import { buildWeaponModel } from './gunModels.js';
import { preloadLib, libClone } from '../world/libprops.js';
import { holdWeapon } from './gunHold.js';
import { createLaw } from './police/law.js';
import { createStations } from './police/stations.js';
import { createResponse } from './police/response.js';
import { createRadio } from './police/radio.js';
import { createLowLevel } from './police/lowlevel.js';
import { createComms } from './police/comms.js';
import { createArrest } from './police/arrest.js';
import { buildSwatGear } from './police/models.js';

const POOL = 12;
// Officers are individuals: each has a name, a rank and traits that change how they see, run, shoot and deal (docs/gameplay/police_tuning.md).
const OFFICERS = [
  'Reyes',
  'Okafor',
  'Delgado',
  'Brandt',
  'Nakamura',
  'Sorrell',
  'Vance',
  'Aguilar',
  'Whitlock',
  'Baptiste',
  'Mendez',
  'Karras',
  'Lindqvist',
  'Truong',
  'Castellano',
  'Ibarra',
];
const h32 = (n) => {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
export const CAR_TARGET = [0, 1, 2, 3, 4, 5, 6];
export const FOOT_TARGET = [0, 0, 2, 4, 6, 8, 10];
export const SIGHT = {
  cone: 110,
  footRange: 60,
  carRange: 90,
  aware: 8,
  carAware: 15,
  night: 0.65,
  water: 0.6,
  covered: 0.7,
};

function styleUniform(char) {
  char.root.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const u = m.material.userData?.uniforms;
    if (!u) return;
    if (u.uShirt) {
      u.uShirt.value.setHex(0x1c2a48);
      if (u.uTee) u.uTee.value.setHex(0x1c2a48);
      if (u.uSleeve) u.uSleeve.value = 0;
      if (u.uStripe) u.uStripe.value = 0;
      if (u.uOpen) u.uOpen.value = 0;
    } else if (u.uDenim !== undefined || u.uShorts !== undefined) {
      if (u.uColor) u.uColor.value.setHex(0x151b29);
      if (u.uDenim) u.uDenim.value = 0;
      if (u.uShorts) u.uShorts.value = 0;
    } else if (u.uSole) {
      if (u.uColor) u.uColor.value.setHex(0x0c0c0c);
      u.uSole.value.setHex(0x0c0c0c);
      if (u.uSandal) u.uSandal.value = 0;
    }
  });
  // fallback (non-shader characters): tint everything navy-ish
  if (!char.model)
    char.root.traverse((m) => {
      if (m.isMesh && m.material?.color) {
        m.material = m.material.clone();
        m.material.color.setHex(0x1c2a48);
      }
    });
}
function makeCap() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x141c30, roughness: 0.6 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.08, 14), mat);
  crown.position.y = 0.04;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.105, 0.03, 14), mat);
  top.position.y = 0.09;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.012, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3 }),
  );
  visor.position.set(0, 0.01, 0.11);
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.035, 0.01),
    new THREE.MeshStandardMaterial({
      color: 0xd8b04a,
      metalness: 0.9,
      roughness: 0.3,
      emissive: 0x4a3a10,
    }),
  );
  badge.position.set(0, 0.06, 0.11);
  g.add(crown, top, visor, badge);
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = true;
  });
  return g;
}

export function createPolice(game, G) {
  const { scene, world, RAPIER } = game;
  const P = game.player;
  const law = createLaw(game, G); // from here on G.wanted / game.wanted are the knowledge-model facade
  const stations = createStations(game, G.city);
  law.stations = stations;
  const units = [];
  const byHandle = new Map();
  const cars = []; // {v, deployed, cops:[], mine}
  const blocks = []; // roadblocks {meshes, colliders, cars, t}
  const _v = new THREE.Vector3(),
    _a = new THREE.Vector3(),
    _b = new THREE.Vector3();
  let radio = null,
    response = null,
    lowlevel = null,
    comms = null,
    arrest = null;

  // ---------------- pool of foot cops
  function makeUnit(i) {
    let char = null;
    for (let k = 0; k < 4; k++) {
      char = tryCall(
        'createCharacter',
        () =>
          game.npc?.createCop?.({ seed: 7700 + i * 131 + k * 17 }) ||
          createCharacter(game, { variant: 'ped', outfit: 'cop', seed: 7700 + i * 131 + k * 17 }),
        null,
      );
      if (!char || char.base !== 'female' || k === 3) break;
    }
    if (!char) return null;
    const nativeUniform = typeof char.setCopGear === 'function';
    if (nativeUniform) tryCall('copGear', () => char.setCopGear(true));
    else styleUniform(char);
    char.root.visible = false;
    scene.add(char.root);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -80 - i * 3, 0),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.6, 0.28).setFriction(0.5),
      body,
    );
    collider.setEnabled(false);
    const kcc = world.createCharacterController(0.03);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.enableAutostep(0.35, 0.2, true);
    kcc.enableSnapToGround(0.4);
    kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    const cap = makeCap();
    cap.visible = false;
    cap.userData.native = nativeUniform;
    if (!nativeUniform) scene.add(cap);
    const gun = buildWeaponModel('pistol');
    gun.visible = false;
    scene.add(gun);
    const gunKey = 'pistol';
    const u = {
      char,
      body,
      collider,
      kcc,
      cap,
      gun,
      gunKey,
      head: findBone(char.root, /Head$/i),
      hand: findBone(char.root, /RightHand$/i),
      arm: findBone(char.root, /RightArm$/i),
      pos: new THREE.Vector3(),
      heading: 0,
      speed: 0,
      health: 100,
      dead: false,
      deadT: 0,
      active: false,
      isCop: true,
      fireCd: 1,
      punchCd: 1,
      punch: false,
      stuckT: 0,
      side: 0,
      sideT: 0,
      car: null,
      mode: 'chase',
      wander: null,
      lifeT: 0,
      vy: 0,
      // personality: perception (how fast they recognize a description), fitness (foot speed), aim, integrity (bribes), restraint (bystanders), years on the job
      name: OFFICERS[i % OFFICERS.length],
      rank: h32(i * 7 + 1) < 0.2 ? 'Sgt.' : 'Ofc.',
      per: 0.25 + h32(i * 13 + 2) * 0.7,
      fit: 0.8 + h32(i * 17 + 3) * 0.4,
      aim: 0.7 + h32(i * 19 + 4) * 0.6,
      integrity: 0.2 + h32(i * 23 + 5) * 0.8,
      restraint: 0.3 + h32(i * 29 + 6) * 0.7,
      years: 1 + Math.floor(h32(i * 31 + 7) * 24),
      role: 'patrol',
    };
    byHandle.set(collider.handle, u);
    return u;
  }
  for (let i = 0; i < POOL; i++) {
    const u = makeUnit(i);
    if (u) units.push(u);
  }

  // the user's police people (src/npc/people, game.npc.createCop) replace the pool's older bodies as they load
  function upgradeCopModel(u, pos) {
    if (u.char?.human?.person || !game.npc?.createCop) return;
    const c = tryCall(
      'createCop',
      () =>
        game.npc.createCop({
          seed: 7700 + units.indexOf(u) * 131 + ((Math.random() * 1e6) | 0),
          pos,
        }),
      null,
    );
    if (!c?.root) return;
    const old = u.char;
    scene.remove(old.root);
    tryCall('dispose', () => old.dispose?.());
    tryCall('copGear', () => c.setCopGear?.(true));
    c.root.visible = false;
    scene.add(c.root);
    u.char = c;
    u.head = findBone(c.root, /Head$/i);
    u.hand = findBone(c.root, /RightHand$/i);
    u.arm = findBone(c.root, /RightArm$/i);
    u.cap.userData.native = true;
    u.cap.visible = false;
  }
  function spawnCop(pos, heading = 0, car = null, o = {}) {
    const u = units.find((x) => !x.active);
    if (!u) return null;
    upgradeCopModel(u, pos);
    u.swat = !!o.swat || (G.wanted?.level || 0) >= 5;
    setSwatGear(u, u.swat);
    u.cuffing = false;
    u.taseCd = rand(0.5, 1.5);
    u.coverT = 0;
    u.flankSide = Math.random() < 0.5 ? -1 : 1;
    u.seeT = 0;
    u.sees = false;
    u.aimedAtT = 0;
    u.aimReported = false;
    u.shoutT = 0;
    // tactics: the first two out of a car use it as cover, later ones flank; SWAT flank and push
    u.active = true;
    u.dead = false;
    u.deadT = 0;
    u.health = 100;
    u.car = car;
    u.mode = 'chase';
    u.lifeT = 0;
    u.fireCd = rand(1, 2);
    u.vy = 0;
    u.pos.copy(pos);
    u.heading = heading;
    u.speed = 0;
    u.stuckT = 0;
    u.wander = null;
    u._susp = 0;
    u._callT = 0;
    u._called = false;
    u.vaultT = 0;
    // armament scales with heat
    const lv = G.wanted?.level || 0,
      r = Math.random();
    const nOut = car ? car.cops.length : 0;
    u.role = u.swat
      ? r < 0.55
        ? 'flank'
        : 'push'
      : car && nOut < 2
        ? 'cover'
        : lv >= 3 && r < 0.5
          ? 'flank'
          : 'push';
    const key = u.swat
      ? r < 0.6
        ? 'carbine'
        : r < 0.85
          ? 'rifle'
          : 'shotgun'
      : lv >= 4
        ? r < 0.45
          ? 'rifle'
          : r < 0.75
            ? 'carbine'
            : 'shotgun'
        : lv >= 3
          ? r < 0.3
            ? 'shotgun'
            : r < 0.45
              ? 'smg'
              : 'pistol'
          : 'pistol';
    if (u.gunKey !== key) {
      const vis = u.gun.visible;
      scene.remove(u.gun);
      u.gun = buildWeaponModel(key);
      u.gun.visible = vis;
      scene.add(u.gun);
      u.gunKey = key;
    }
    u.body.setTranslation({ x: pos.x, y: pos.y + 0.9, z: pos.z }, true);
    u.collider.setEnabled(true);
    u.char.root.visible = true;
    u.cap.visible = !u.cap.userData.native;
    u.gun.visible = true;
    u.char.root.position.copy(pos);
    return u;
  }
  // SWAT: helmet on the head bone, plate carrier on the chest (models.js buildSwatGear); patrol officers keep their caps
  let gearProto = null;
  function setSwatGear(u, on) {
    if (on && !u.gear) {
      gearProto ||= tryCall('swat gear', () => buildSwatGear(THREE), null);
      if (!gearProto) return;
      const head = u.head,
        chest = findBone(u.char.root, /Spine2$/i) || findBone(u.char.root, /Spine1$/i);
      if (!head) return;
      const hm = gearProto.helmet.clone();
      head.add(hm);
      const ws = head.getWorldScale(new THREE.Vector3()),
        k = 1 / Math.max(1e-3, ws.x);
      hm.scale.setScalar(k);
      hm.position.set(0, 0.11 * k, 0.01 * k);
      let vest = null;
      if (chest) {
        vest = gearProto.vest.clone();
        chest.add(vest);
        const cs = chest.getWorldScale(new THREE.Vector3()),
          kc = 1 / Math.max(1e-3, cs.x);
        vest.scale.setScalar(kc);
        vest.position.set(0, 0.04 * kc, 0.02 * kc);
      }
      u.gear = { hm, vest, char: u.char };
    }
    if (u.gear && u.gear.char !== u.char) {
      u.gear.hm.removeFromParent();
      u.gear.vest?.removeFromParent();
      u.gear = null;
      if (on) setSwatGear(u, true);
      return;
    }
    if (u.gear) {
      u.gear.hm.visible = on;
      if (u.gear.vest) u.gear.vest.visible = on;
    }
  }
  function despawnCop(u) {
    u.active = false;
    u.cuffing = false;
    u.dead = false;
    u.char.root.visible = false;
    u.cap.visible = false;
    u.gun.visible = false;
    u.collider.setEnabled(false);
    u.body.setTranslation({ x: 0, y: -80, z: 0 }, true);
    if (u.car) {
      const c = u.car;
      c.cops = c.cops.filter((x) => x !== u);
      u.car = null;
    }
  }
  function damageCop(u, amount, dir, kind = 'bullet', point = null, info = {}) {
    if (!u.active || u.dead) return;
    u.health -= amount;
    G.combatT = 0;
    G.copAggroT = game.clock.elapsed;
    const pt = point || _v.set(u.pos.x, u.pos.y + 1.2, u.pos.z).clone();
    const zone = info.zone || (point && point.y - u.pos.y > 1.45 ? 'head' : 'torso');
    game.emit?.('hit', {
      target: 'ped',
      object: u,
      point: pt,
      normal: dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0),
      damage: amount,
      kind,
      byPlayer: true,
      zone,
      limb: info.limb,
      strength: info.strength ?? Math.min(1, amount / 100),
      isCop: true,
    });
    u.staggerT = Math.max(
      u.staggerT || 0,
      kind === 'bullet' ? (zone === 'leg' ? 0.6 : 0.25) : info.heavy ? 0.8 : 0.4,
    );
    sfx(game, kind === 'bullet' ? 'bullet_hit_flesh' : 'punch_hit', u.pos, 0.8);
    if (u.health <= 0) {
      u.dead = true;
      u.deadT = 0;
      u.health = 0;
      u.collider.setEnabled(false);
      u.gun.visible = false;
      G.reportCrime?.('cop_murder', u.pos.clone(), u);
      // drop weapon + ammo
      tryCall('drop', () =>
        G.pickups?.spawn?.(u.gunKey || 'pistol', u.pos.clone().setY(u.pos.y + 0.05), {
          temp: true,
          life: 45,
          ammo: u.gunKey === 'shotgun' ? 8 : u.gunKey === 'pistol' ? 15 : 30,
        }),
      );
    } else {
      G.reportCrime?.(
        kind === 'bullet' || kind === 'explosion' ? 'cop_shot' : 'cop_assault',
        u.pos.clone(),
        u,
      );
      if (dir) {
        u.knock = dir
          .clone()
          .setY(0)
          .multiplyScalar(kind === 'bullet' ? 0.8 : 2.2);
      }
    }
  }

  // ---------------- player damage
  function damagePlayer(amount, from) {
    if (G.dead || G.busted) return;
    G.combatT = 0;
    let a = amount;
    if (P.armor > 0) {
      const ab = Math.min(P.armor, a * 0.8);
      P.armor -= ab;
      a -= ab;
    }
    P.health = Math.max(0, P.health - a);
    game.emit?.('playerHit', { damage: amount, from });
  }
  G.damagePlayer = damagePlayer;

  // ---------------- per-cop AI
  const QF = RAPIER.QueryFilterFlags;
  function copShoot(u, target, dist, from = null) {
    if (arrest?.holdFire?.() && game.clock.elapsed - (G.lastShotT ?? -99) > 3) return; // hands up / stunned / being cuffed: nobody fires
    const muzzle = from
      ? _a.copy(from)
      : u.gun.userData.muzzle
        ? u.gun.localToWorld(_a.copy(u.gun.userData.muzzle))
        : _a.set(u.pos.x, u.pos.y + 1.4, u.pos.z);
    const inCar = !!P.state.inVehicle;
    const lvl = G.wanted.level;
    let p = clamp(
      (0.48 - dist * 0.011 - (P.state.speed || 0) * 0.04 + lvl * 0.04) * (u?.aim || 1),
      0.06,
      0.7,
    );
    if (inCar) p *= 0.75;
    const hitP = Math.random() < p;
    const end = _b.copy(target);
    if (!hitP) {
      end.x += rand(-1.5, 1.5);
      end.y += rand(-0.8, 0.6);
      end.z += rand(-1.5, 1.5);
    }
    G.tracer?.(muzzle, end);
    tryCall('fx.muzzle', () =>
      game.fx?.muzzleFlash?.(muzzle.clone(), end.clone().sub(muzzle).normalize()),
    );
    sfx(game, u?.gunKey || 'pistol', muzzle, 0.85);
    if (hitP) {
      const dmg =
        (rand(5, 9) + lvl) *
        (u?.gunKey === 'shotgun'
          ? dist < 15
            ? 1.8
            : 0.5
          : u?.gunKey === 'rifle' || u?.gunKey === 'smg'
            ? 0.55
            : u?.gunKey === 'carbine'
              ? 1.1
              : 1);
      if (inCar) {
        const v = P.state.vehicle;
        if (v) v.health = (v.health ?? 1000) - dmg * 2;
        damagePlayer(dmg * 0.35, u);
      } else damagePlayer(dmg, u);
    } else if (!inCar) {
      tryCall('fx.impact', () =>
        game.fx?.bulletImpact?.(
          new THREE.Vector3(end.x, Math.max(0.02, end.y < 0.4 ? 0.02 : end.y), end.z),
          new THREE.Vector3(0, 1, 0),
          game.surfaceAt?.(end.x, end.z),
        ),
      );
    }
  }

  // ---- wall-aware steering for foot units (r3-people2)
  const NAV_OLD = typeof location !== 'undefined' && /[?&]copnav=old/.test(location.search);
  const _cr = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const STATIC_ONLY = QF.EXCLUDE_DYNAMIC | (QF.EXCLUDE_KINEMATIC || 0) | QF.EXCLUDE_SENSORS;
  function blockedDir(u, dx, dz, L) {
    try {
      for (const h of [0.45, 1.2]) {
        _cr.origin = { x: u.pos.x, y: u.pos.y + h, z: u.pos.z };
        _cr.dir = { x: dx, y: 0, z: dz };
        if (world.castRay(_cr, L, true, STATIC_ONLY, undefined, u.collider)) return true;
      }
    } catch (e) {
      /* fall through to the raster */
    }
    try {
      // building footprints from the map raster (works where colliders are not built yet)
      for (let k = 1.2; k <= L; k += 1.2)
        if (game.surfaceAt?.(u.pos.x + dx * k, u.pos.z + dz * k) === 'building') return true;
    } catch (e) {
      /* ignore */
    }
    return false;
  }
  const STEER_ANG = [0.6, 1.1, 1.65, 2.2];
  function steerAround(u, nx, nz, L, dt) {
    u.steerT = (u.steerT || 0) - dt;
    // committed detour direction: keep it for a moment so the officer does not flicker at a corner
    if (u.steerT > 0 && u.steerDir) {
      if (!blockedDir(u, u.steerDir[0], u.steerDir[1], L * 0.8)) return u.steerDir;
      u.steerT = 0;
    }
    u.steerCd = (u.steerCd || 0) - dt;
    if (u.steerCd > 0 && !u.steerBlocked) return [nx, nz];
    u.steerCd = 0.12;
    if (!blockedDir(u, nx, nz, L)) {
      u.steerBlocked = false;
      return [nx, nz];
    }
    u.steerBlocked = true;
    const base = Math.atan2(nx, nz),
      pref = u.avoidSide || (u.avoidSide = Math.random() < 0.5 ? -1 : 1);
    for (const a of STEER_ANG)
      for (const sd of [pref, -pref]) {
        const ang = base + a * sd,
          ex = Math.sin(ang),
          ez = Math.cos(ang);
        if (!blockedDir(u, ex, ez, L)) {
          u.avoidSide = sd;
          u.steerDir = [ex, ez];
          u.steerT = 0.9 + a * 0.5;
          return u.steerDir;
        }
      }
    return [nx, nz];
  }

  function moveUnit(u, dx, dz, speed, dt) {
    const l = Math.hypot(dx, dz);
    let mx = 0,
      mz = 0;
    if (l > 0.01 && speed > 0) {
      let nx = dx / l,
        nz = dz / l;
      // r3-people2 (user: "police walk into walls"): feelers ahead, steer round buildings, never straight at the target
      if (!NAV_OLD && speed > 0.5) {
        const s = steerAround(u, nx, nz, Math.max(2.6, speed * 0.7), dt);
        nx = s[0];
        nz = s[1];
      }
      if (u.sideT > 0) {
        u.sideT -= dt;
        const sx = -nz * u.side,
          sz = nx * u.side;
        nx = nx * 0.3 + sx;
        nz = nz * 0.3 + sz;
        const n = Math.hypot(nx, nz);
        nx /= n;
        nz /= n;
      }
      mx = nx * speed * dt;
      mz = nz * speed * dt;
      const want = Math.atan2(nx, nz);
      let d = want - u.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      u.heading += d * Math.min(1, dt * 8);
    }
    if (u.knock) {
      mx += u.knock.x * dt * 3;
      mz += u.knock.z * dt * 3;
      u.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
      if (u.knock.lengthSq() < 0.01) u.knock = null;
    }
    u.vy = Math.max(-20, u.vy - 18 * dt);
    const desired = { x: mx, y: u.vy * dt, z: mz };
    let mv = desired;
    try {
      u.kcc.computeColliderMovement(u.collider, desired, QF.EXCLUDE_SENSORS);
      mv = u.kcc.computedMovement();
      if (u.kcc.computedGrounded()) u.vy = -1;
    } catch (e) {
      /* ignore */
    }
    const t = u.body.translation();
    const nx = t.x + mv.x,
      ny = t.y + mv.y,
      nz = t.z + mv.z;
    u.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    const moved = Math.hypot(mv.x, mv.z);
    u.speed = dt > 0 ? moved / dt : 0;
    if (
      speed > 3 &&
      moved < speed * dt * 0.3 &&
      u.stuckT > 0.15 &&
      u.vaultT <= 0 &&
      lowObstacle(u)
    ) {
      u.vy = 5.4;
      u.vaultT = 1.2;
      u.stuckT = 0;
    } // vault fences, planters and hoods
    if (u.vaultT > 0) u.vaultT -= dt;
    if (speed > 1 && moved < speed * dt * 0.3) {
      u.stuckT += dt;
      if (u.stuckT > 0.4) {
        u.side = Math.random() < 0.5 ? -1 : 1;
        u.sideT = rand(0.8, 1.6);
        u.stuckT = 0;
        u.avoidSide = -(u.avoidSide || 1);
        u.stuckN = (game.clock.elapsed - (u.stuckN0 || -99) > 6 ? 0 : u.stuckN || 0) + 1;
        u.stuckN0 = game.clock.elapsed;
        if (u.stuckN >= 3 && u.mode !== 'chase') u.wander = null;
      }
    } else u.stuckT = 0; // re-route on a stall: flip the detour side; a searching officer picks a new spot after 3 stalls
    u.pos.set(nx, ny - 0.88, nz);
    if (u.pos.y < -10) {
      const gy = groundAt(game, u.pos.x, u.pos.z);
      u.body.setTranslation({ x: u.pos.x, y: gy + 0.9, z: u.pos.z }, true);
      u.vy = 0;
    }
  }

  // something low (under about 1.2 m) is in the way and there is room above it
  function lowObstacle(u) {
    try {
      const dx = Math.sin(u.heading),
        dz = Math.cos(u.heading);
      const lo = world.castRay(
        new RAPIER.Ray({ x: u.pos.x, y: u.pos.y + 0.45, z: u.pos.z }, { x: dx, y: 0, z: dz }),
        1.1,
        true,
        QF.EXCLUDE_SENSORS,
        undefined,
        u.collider,
      );
      if (!lo) return false;
      const hi = world.castRay(
        new RAPIER.Ray({ x: u.pos.x, y: u.pos.y + 1.45, z: u.pos.z }, { x: dx, y: 0, z: dz }),
        1.6,
        true,
        QF.EXCLUDE_SENSORS,
        undefined,
        u.collider,
      );
      return !hi;
    } catch (e) {
      return false;
    }
  }
  // no civilian within a narrow corridor between the muzzle and the target (careful officers check a wider one)
  function lineClear(u, tgt) {
    const ax = u.pos.x,
      az = u.pos.z,
      bx = tgt.x - ax,
      bz = tgt.z - az,
      l2 = bx * bx + bz * bz || 1,
      wid = 0.5 + (u.restraint || 0.5) * 0.9;
    for (const ped of game.peds?.list || []) {
      if (!ped.pos || ped.dead || ped.active === false || ped.isCop) continue;
      const t = ((ped.pos.x - ax) * bx + (ped.pos.z - az) * bz) / l2;
      if (t < 0.05 || t > 1.1) continue;
      if (Math.hypot(ax + bx * t - ped.pos.x, az + bz * t - ped.pos.z) < wid) return false;
    }
    return true;
  }
  // line of sight with one reused ray (static world only: buildings, bridges, walls; cars do not block)
  const _los = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  function los(a, b) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z,
      d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return true;
    try {
      _los.origin.x = a.x;
      _los.origin.y = a.y;
      _los.origin.z = a.z;
      _los.dir.x = dx / d;
      _los.dir.y = dy / d;
      _los.dir.z = dz / d;
      const h = world.castRay(_los, d, true, STATIC_ONLY);
      return !h || (h.timeOfImpact ?? h.toi) >= d - 0.4;
    } catch (e) {
      return true;
    }
  }
  const _goal = new THREE.Vector3(),
    _cv = new THREE.Vector3();
  function coverPoint(u, pp) {
    // behind the cruiser they came in, on the side away from the suspect (they shoot over the hood)
    const c = u.car;
    if (!c || !vAlive(game, c.v)) return null;
    const t = c.v.body.translation();
    if (Math.hypot(t.x - u.pos.x, t.z - u.pos.z) > 28) return null;
    const dx = t.x - pp.x,
      dz = t.z - pp.z,
      l = Math.hypot(dx, dz) || 1;
    const side = u === c.cops[0] ? 1 : -1,
      px = (-dz / l) * side,
      pz = (dx / l) * side;
    return _cv.set(t.x + (dx / l) * 2.3 + px * 1.3, t.y, t.z + (dz / l) * 2.3 + pz * 1.3);
  }
  const NO_ARREST = {
    holdFire: () => false,
    tryTase() {},
    surrendered: false,
    stunT: 0,
    doorPoint: null,
  };
  function updateUnit(u, dt) {
    const W = G.wanted,
      A = arrest || NO_ARREST;
    const pp = P.position,
      lvl = W.level;
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
    // sight at 10 Hz per officer (raycasts are the expensive part)
    u.seeT -= dt;
    if (u.seeT <= 0) {
      u.seeT = 0.1 + Math.random() * 0.03;
      u.sees = canSee(
        _a.set(u.pos.x, u.pos.y + 1.6, u.pos.z),
        u.heading,
        SIGHT.footRange,
        SIGHT.aware,
        tgt,
      );
    }
    let gx = 0,
      gz = 0,
      speed = 0;
    if (u.cuffing) {
      moveUnit(u, 0, 0, 0, dt);
      return;
    }
    if (lvl === 0) {
      // stand down: walk off then vanish
      u.mode = 'leave';
      if (!u.wander)
        u.wander = new THREE.Vector3(u.pos.x + rand(-40, 40), 0, u.pos.z + rand(-40, 40));
      gx = u.wander.x - u.pos.x;
      gz = u.wander.z - u.pos.z;
      speed = 1.4;
      if ((dist > 45 && !inView(game, u.pos)) || u.lifeT > 200 || dist > 120) {
        despawnCop(u);
        return;
      }
    } else if (W.seen && (u.sees || dist < 25)) {
      u.mode = 'chase';
      u.wander = null;
      gx = pp.x - u.pos.x;
      gz = pp.z - u.pos.z;
      const hold = A.holdFire();
      const armed = !!G.playerArmedRecently?.();
      const lethal = !hold && (lvl >= 3 || armed); // 1-2 stars: only an armed suspect gets shot at
      // a stopped driver at low stars: walk to his door (arrest.js pulls him out)
      if (P.state.inVehicle && A.doorPoint && lvl <= 2 && !armed) {
        gx = A.doorPoint.x - u.pos.x;
        gz = A.doorPoint.z - u.pos.z;
        const dd = Math.hypot(gx, gz);
        speed = dd > 6 ? 4.6 : dd > 0.9 ? 1.8 : 0;
        if (speed === 0) {
          gx = pp.x - u.pos.x;
          gz = pp.z - u.pos.z;
        }
      } else if (hold || !lethal) {
        // close in: surrendered / stunned suspects get cuffed, runners get chased and tased, fighters get hit
        const cuffable = A.surrendered || A.stunT > 0;
        speed =
          (dist > 7 ? 6.2 : dist > 2.2 ? (cuffable || hold ? 2.4 : 3.6) : dist > 1.1 ? 1.2 : 0) *
          (dist > 2.2 && !hold ? u.fit : 1);
        if (!hold && !P.state.inVehicle) A.tryTase(u, dist);
        u.punchCd -= dt;
        if (
          !hold &&
          dist < 1.4 &&
          u.punchCd <= 0 &&
          !P.state.inVehicle &&
          game.clock.elapsed - (G.copAggroT ?? -99) < 6
        ) {
          u.punchCd = rand(0.9, 1.4);
          u.punch = true;
          if (Math.random() < 0.7) damagePlayer(rand(4, 8), u);
        }
        if (u.shoutT <= 0 && dist < 25 && !hold && lvl <= 2) {
          u.shoutT = rand(5, 8);
          comms?.shout(
            u,
            pick([
              'Stop! Police!',
              'Get down on the ground!',
              'Stop running!',
              "Don't make me tase you!",
            ]),
          );
        }
      } else {
        // shooting: cover behind the cruiser, flank wide, or push in to about 12 m; they fire on the move
        let role = u.role;
        const cp = role === 'cover' ? coverPoint(u, pp) : null;
        if (role === 'cover' && !cp) role = 'push';
        if (role === 'cover') {
          // pinned without a view from cover for a while: leave it and flank
          u.coverT = u.sees ? 0 : u.coverT + dt;
          if (u.coverT > 4) {
            u.role = 'flank';
            u.coverT = 0;
          }
          gx = cp.x - u.pos.x;
          gz = cp.z - u.pos.z;
          const dd = Math.hypot(gx, gz);
          speed = dd > 1.2 ? (dd > 6 ? 5.4 : 2.6) : 0;
          if (speed === 0) {
            gx = pp.x - u.pos.x;
            gz = pp.z - u.pos.z;
          }
        } else if (role === 'flank' && dist > 9) {
          // swing out to the suspect's side, then close; the side flips if a wall blocks the line
          const dx = u.pos.x - pp.x,
            dz = u.pos.z - pp.z,
            l = Math.hypot(dx, dz) || 1;
          const R = Math.max(10, Math.min(18, dist * 0.7)),
            a = Math.atan2(dx, dz) + u.flankSide * 0.9;
          _goal.set(pp.x + Math.sin(a) * R, 0, pp.z + Math.cos(a) * R);
          gx = _goal.x - u.pos.x;
          gz = _goal.z - u.pos.z;
          speed = 5.2 * u.fit * (u.swat ? 1.05 : 1);
          if ((u.stuckN || 0) >= 2) u.flankSide = -u.flankSide;
          void l;
        } else {
          speed = (dist > 16 ? 5.6 : dist > 9 ? 2.2 : 0) * u.fit;
          if (speed === 0) {
            gx = pp.x - u.pos.x;
            gz = pp.z - u.pos.z;
          }
        }
        if (u.sees && dist < (u.gunKey === 'rifle' || u.gunKey === 'carbine' ? 55 : 38)) {
          if (u.fireCd <= dt && !lineClear(u, tgt)) u.fireCd = 0.4; // bystander in the line of fire: hold
          u.fireCd -= dt * (speed > 3 ? 0.6 : 1); // slower, less accurate fire while running
          if (u.fireCd <= 0) {
            const auto = u.gunKey === 'rifle' || u.gunKey === 'smg' || u.gunKey === 'carbine';
            u.fireCd =
              (auto ? rand(0.25, 0.45) : u.gunKey === 'shotgun' ? rand(1.1, 1.6) : rand(0.7, 1.5)) -
              lvl * 0.05;
            copShoot(u, tgt, dist + (speed > 3 ? 8 : 0));
          }
        }
        if (u.shoutT <= 0 && dist < 40) {
          u.shoutT = rand(6, 11);
          comms?.shout(
            u,
            pick(
              u.swat
                ? ['Moving!', 'Flank left!', 'Contact front!', 'Suppressing!']
                : [
                    'Drop the weapon!',
                    'Shots fired! Shots fired!',
                    'Get down!',
                    'Suspect is armed!',
                  ],
            ),
          );
        }
      }
      u.shoutT -= dt;
    } else if (u.sees && (u._susp || 0) > 0.2 && dist < 45) {
      // somebody fits part of the description: walk over for a closer look
      u.mode = 'check';
      u.wander = null;
      gx = pp.x - u.pos.x;
      gz = pp.z - u.pos.z;
      speed = dist > 5 ? 2.4 : 0;
    } else {
      // search: sweep the area around the last known position (closest corners first), never straight at the hidden player
      u.mode = 'search';
      const c = W.searchCenter || W.lastSeen;
      if (!u.wander || distXZ(u.pos, u.wander) < 3 || (u.wanderT = (u.wanderT || 0) + dt) > 25) {
        const r = Math.max(10, Math.min(120, (W.searchRadius || 50) * 0.6));
        const a = Math.random() * Math.PI * 2,
          rr = Math.sqrt(Math.random()) * r;
        u.wander = (u.wander || new THREE.Vector3()).set(
          c.x + Math.sin(a) * rr,
          0,
          c.z + Math.cos(a) * rr,
        );
        u.wanderT = 0;
      }
      gx = u.wander.x - u.pos.x;
      gz = u.wander.z - u.pos.z;
      speed = u.swat ? 3.6 : 3.0;
      if (dist > 160) {
        despawnCop(u);
        return;
      }
    }
    if (u.staggerT > 0) {
      speed = 0;
      u.fireCd = Math.max(u.fireCd, 0.3);
    }
    if (speed === 0 && (gx || gz)) {
      // turn to face
      const want = Math.atan2(gx, gz);
      let d = want - u.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      u.heading += d * Math.min(1, dt * 8);
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
      tryCall('cop.anim', () =>
        c.update(dt * (u.lodSkip || 1), {
          speed: u.speed,
          grounded: true,
          jumping: false,
          sprint: u.speed > 5,
          driving: false,
          punch: u.punch,
          dead: u.dead,
          deadStyle: 'back',
          guard: false,
        }),
      );
      u.lodSkip = 1;
    } else u.lodSkip = (u.lodSkip || 1) + 1;
    if (u.head) {
      u.head.getWorldPosition(_a);
      u.cap.position.set(_a.x, _a.y + 0.07, _a.z);
    } else u.cap.position.set(u.pos.x, u.pos.y + 1.72, u.pos.z);
    u.cap.rotation.set(0, u.heading, 0);
    u.cap.visible = !u.dead && !u.cap.userData.native;
    // guns up at the suspect while engaging (GTA: officers draw down even at one star); lowered while cuffing
    const aimAt =
      u.mode === 'chase' &&
      u.sees &&
      !u.cuffing &&
      distXZ(u.pos, P.position) > 2 &&
      (G.wanted.level >= 2 || arrest?.window || G.playerArmedRecently?.())
        ? _b.set(P.position.x, P.position.y + 1.2, P.position.z)
        : null; // weapons helper: hand-aligned grip (gunHold.js)
    if (
      u.hand &&
      !u.dead &&
      !tryCall(
        'cop.hold',
        () => holdWeapon(u.gun, c.root, { aim: aimAt, dt, time: game.clock.elapsed }),
        false,
      )
    ) {
      u.hand.getWorldPosition(_a);
      u.gun.position.copy(_a);
      if (u.mode === 'chase' && G.wanted.level >= 2 && u.sees) {
        if (u.arm && distXZ(u.pos, P.position) > 2) {
          aimArm(u.arm, u.hand, _b.set(P.position.x, P.position.y + 1.2, P.position.z), 1);
          u.hand.getWorldPosition(_a);
          u.gun.position.copy(_a);
        }
        const pp = P.position;
        const dx = pp.x - _a.x,
          dy = pp.y + 1.2 - _a.y,
          dz = pp.z - _a.z;
        u.gun.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ');
      } else u.gun.rotation.set(1.2, u.heading, 0, 'YXZ');
    }
  }

  // ---------------- police cars
  const V = () => game.vehicles;
  function removeCar(c) {
    const v = c.v;
    tryCall('setChaseTarget', () => v.setChaseTarget?.(null));
    for (const u of c.cops.slice()) {
      if (!u.dead && (distXZ(u.pos, P.position) > 50 || G.wanted.level === 0)) despawnCop(u);
      else u.car = null;
    }
    const i = cars.indexOf(c);
    if (i >= 0) cars.splice(i, 1);
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
      v.body.setTranslation(
        { x: pos.x, y: (pos.y || 0) + (v.groundOff || 0.6) + 0.1, z: pos.z },
        true,
      );
      v.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return true;
    } catch (e) {
      return false;
    }
  }
  let driverSeed = 8800;
  function seatCopDriver(v) {
    if (!v || v._gpCopDriver) return;
    const old = v.driverChar,
      root = old?.root || v.driver;
    if (!root || !root.parent) return;
    const ch = tryCall(
      'cop driver',
      () =>
        game.npc?.createCop?.({
          seed: driverSeed++,
          pos: root.getWorldPosition?.(new THREE.Vector3()),
        }) || createCharacter(game, { variant: 'ped', outfit: 'cop', seed: driverSeed++ }),
      null,
    );
    if (!ch?.root) return;
    tryCall('copGear', () => ch.setCopGear?.(true));
    ch.root.position.copy(root.position);
    ch.root.quaternion.copy(root.quaternion);
    ch.root.scale.copy(root.scale);
    ch.root.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    root.parent.add(ch.root);
    root.parent.remove(root);
    // seated on the car's measured seat anchor by the shared seat solver (src/npc/seat.js); people differ in height
    tryCall('seat cop', () => {
      const a = v.seatAnchor?.(0);
      if (a && seatMod?.seatCharacter) seatMod.seatCharacter(ch, a, { role: 'driver', vehicle: v });
    });
    tryCall('drv pose', () => ch.update?.(0.5, { driving: true, speed: 0, grounded: true }));
    v.driver = ch.root;
    v.driverChar = ch;
    v._gpCopDriver = true;
  }
  G.seatCopDriver = seatCopDriver;
  // kinds: patrol sedan (1-2 stars), the utility SUV joins from 3, SWAT vans (Ironside, painted black) from 4
  function spawnPoliceCar(pos, heading, ai = true, kind = null) {
    const vs = V(),
      lvl = G.wanted?.level || 0;
    const key =
      kind === 'swat' ? 'van' : kind || (lvl >= 3 && Math.random() < 0.4 ? 'police_suv' : 'police');
    let v = null;
    if (key === 'police' && spare.length) {
      v = spare.pop();
      if (!placeCar(v, pos, heading)) v = null;
    }
    if (!v && vs?.spawn)
      v = tryCall('vehicles.spawn', () => vs.spawn(key, pos, heading, { ai, police: true }), null);
    if (!v) return null;
    v.police = true;
    v.owner = 'police';
    if (kind === 'swat') {
      v.swat = true;
      tryCall('swat paint', () => law.sense?.repaint?.(v, 0x15181c));
    }
    seatCopDriver(v);
    if (typeof v.siren === 'function') tryCall('siren', () => v.siren(true));
    else v.sirenOn = true;
    return v;
  }
  // send one more unit from the stations (missions and the response layer use it too): { swat?, near? }
  function dispatchUnit(o = {}) {
    const W = G.wanted,
      pp = P.position;
    const known =
      o.near || (W.seen ? pp : W.evading && W.searchCenter ? W.searchCenter : W.lastSeen);
    const r = dispatchPoint(known, (W.level || 0) >= 3 ? cars.length % 3 : 0);
    if (!r) return null;
    const v = spawnPoliceCar(r.position, r.heading, true, o.swat ? 'swat' : null);
    if (!v) return null;
    const c = { v, deployed: false, cops: [], mine: true, t: 0, swat: !!o.swat, role: null };
    cars.push(c);
    return c;
  }
  let carSpawnCd = 2,
    footSpawnCd = 3;
  // Police cars are dispatched from the nearest station: they appear out of sight 170-300 m away on the road route from the
  // station towards the player (so they arrive from the station's direction), never on the road next to the player.
  let dispatchCache = null;
  function dispatchPoint(pp, k = 0) {
    const C = G.city,
      ms = Math.sqrt(C?.mapScale || 1),
      iv = (q) => inView(game, q);
    // big responses: later units come from the 2nd / 3rd nearest station, so several stations send cars
    const near = k > 0 ? stations.nearest(pp, Math.min(3, k + 1)) : null;
    const stn =
      k > 0 ? near[Math.min(k, near.length - 1)] || stations.nearest(pp) : stations.nearest(pp);
    law.dispatchStation = stn || null;
    const st = stn
      ? stn.road
      : tryCall('policeStation', () => C?.respawnPoint?.('police', pp), null);
    if (st && Number.isFinite(st.x)) {
      const ds = Math.hypot(st.x - pp.x, st.z - pp.z);
      if (ds < 200 * ms) {
        // station is close by: cars pull out of it
        const r = C.roadPoint(st, 0, 60, { avoidView: true, inView: iv });
        if (r && distXZ(r.position, pp) > 70) return r;
      } else if (ds < 4500) {
        if (
          !dispatchCache ||
          Math.hypot(dispatchCache.x - pp.x, dispatchCache.z - pp.z) > 60 ||
          dispatchCache.sx !== st.x
        ) {
          dispatchCache = {
            x: pp.x,
            z: pp.z,
            sx: st.x,
            path: tryCall('dispatchPath', () => C.findPath(pp.x, pp.z, st.x, st.z), null),
          };
        }
        const path = dispatchCache.path;
        if (path && path.length > 1) {
          for (const q of path) {
            const d = Math.hypot(q.x - pp.x, q.z - pp.z);
            if (d < 170 * ms) continue;
            if (d > 320 * ms) break;
            const r = C.roadPoint(new THREE.Vector3(q.x, pp.y, q.z), 0, 30, {
              avoidView: true,
              inView: iv,
            });
            if (r && distXZ(r.position, pp) > 150 * ms) return r;
          }
        }
      }
    }
    return (
      C?.roadPoint(pp, 170 * ms, 280 * ms, { avoidView: true, inView: iv, tries: 24 }) ||
      pointNear(game, pp, 160, 260, 'road', true)
    );
  }
  // road-graph navigation: A* to the goal, follow waypoints, go direct when close
  function navTarget(c, t, goal, dt) {
    const C = G.city;
    const dGoal = distXZ(t, goal);
    if (
      !C ||
      !C.graph ||
      dGoal < 70 ||
      (dGoal < 120 &&
        hasLOS(game, _a.set(t.x, t.y + 1, t.z), _b.set(goal.x, (goal.y || 0) + 1, goal.z)))
    ) {
      c.path = null;
      return goal;
    }
    c.replanT = (c.replanT ?? 0) - dt;
    if (
      !c.path ||
      c.replanT <= 0 ||
      !c.planGoal ||
      Math.hypot(c.planGoal.x - goal.x, c.planGoal.z - goal.z) > 35
    ) {
      c.replanT = 3;
      c.path = tryCall('findPath', () => C.findPath(t.x, t.z, goal.x, goal.z), null);
      c.wp = 0;
      c.planGoal = { x: goal.x, z: goal.z };
      if (c.path) {
        // skip waypoints already behind us
        let bi = 0,
          bd = Infinity;
        for (let i = 0; i < Math.min(c.path.length, 6); i++) {
          const q = c.path[i];
          const dd = Math.hypot(q.x - t.x, q.z - t.z);
          if (dd < bd) {
            bd = dd;
            bi = i;
          }
        }
        c.wp = bi;
      }
    }
    if (!c.path || !c.path.length) return goal;
    while (c.wp < c.path.length - 1 && Math.hypot(c.path[c.wp].x - t.x, c.path[c.wp].z - t.z) < 14)
      c.wp++;
    (c.navPt ||= new THREE.Vector3()).set(c.path[c.wp].x, 0, c.path[c.wp].z);
    return c.navPt;
  }
  // ---- pursuit tactics. Roles per car (index in the pursuit): 0 tails the suspect with a lead, 1 sets up the PIT at 3+
  // (rear quarter), the rest run parallel / cut ahead. A car that stops gets boxed in: front and rear cars park across
  // its nose and tail and the officers get out.
  const _lead = new THREE.Vector3(),
    _box = new THREE.Vector3(),
    _pq = new THREE.Quaternion(),
    _pf = new THREE.Vector3(),
    _pl = new THREE.Vector3();
  let pitCd = 0,
    stopT = 0,
    adoptT = 0;
  function playerCarFrame() {
    const v = P.state.vehicle;
    if (!v?.body) return null;
    const r = v.body.rotation();
    _pq.set(r.x, r.y, r.z, r.w);
    _pf.set(0, 0, 1).applyQuaternion(_pq).setY(0).normalize();
    _pl.set(_pf.z, 0, -_pf.x);
    return v;
  }
  function tryPIT(c, v, t, lvl) {
    // the cruiser's nose against the suspect's rear quarter, both fast, closing: a sideways shove at the rear axle spins him
    if (lvl < 3 || pitCd > 0 || (c.pitCd || 0) > 0) return false;
    const pv = P.state.vehicle;
    if (!pv || pv.isBoat || pv.isAircraft) return false;
    const ps = pv.speedKmh || 0,
      cs = v.speedKmh || 0;
    if (ps < 38 || cs < ps * 0.85) return false;
    const pt = pv.body.translation(),
      rx = t.x - pt.x,
      rz = t.z - pt.z;
    const along = rx * _pf.x + rz * _pf.z,
      side = rx * _pl.x + rz * _pl.z;
    const L = pv.spec?.L || 4.6,
      Wd = pv.spec?.W || 1.9;
    if (
      along > -L * 0.15 ||
      along < -(L * 0.5 + 2.4) ||
      Math.abs(side) > Wd * 0.5 + 1.5 ||
      Math.abs(side) < Wd * 0.25
    )
      return false;
    const m = tryCall('mass', () => pv.body.mass(), 1500) || 1500,
      dir = side > 0 ? -1 : 1;
    const J = m * (2.6 + lvl * 0.25);
    tryCall('pit', () =>
      pv.body.applyImpulseAtPoint(
        { x: _pl.x * dir * J, y: 0, z: _pl.z * dir * J },
        { x: pt.x - _pf.x * L * 0.42, y: pt.y, z: pt.z - _pf.z * L * 0.42 },
        true,
      ),
    );
    tryCall('pit2', () =>
      v.body.applyImpulse({ x: -_pl.x * dir * J * 0.25, y: 0, z: -_pl.z * dir * J * 0.25 }, true),
    );
    sfx(game, 'car_crash', pt, 0.9);
    tryCall('fx', () =>
      game.fx?.sparks?.(
        new THREE.Vector3((pt.x + t.x) / 2, pt.y, (pt.z + t.z) / 2),
        new THREE.Vector3(0, 1, 0),
      ),
    );
    tryCall('dmg', () => pv.damage?.(25, null));
    pv.health = (pv.health ?? 1000) - 25;
    game.emit?.('police:pit', { vehicle: pv, by: v });
    pitCd = 7;
    c.pitCd = 9;
    return true;
  }
  function carTarget(c, i, t, lvl) {
    const W = G.wanted,
      pp = P.position;
    if (!W.seen) return null;
    const pv = P.state.inVehicle ? playerCarFrame() : null;
    if (!pv) return pp;
    const ps = pv.speedKmh || 0,
      lv = pv.body.linvel();
    // stopped: box him in
    if (stopT > 1.2 && distXZ(t, pp) < 60) {
      const k = i % 2 === 0 ? 1 : -1,
        L = (pv.spec?.L || 4.6) * 0.5 + 3.2;
      return _box.set(
        pp.x + _pf.x * L * k + _pl.x * 1.2 * k,
        pp.y,
        pp.z + _pf.z * L * k + _pl.z * 1.2 * k,
      );
    }
    const lead = Math.min(1.4, distXZ(t, pp) / 40);
    if (c.role === 'pit' && lvl >= 3 && ps > 30) {
      const side = c.pitSide || (c.pitSide = Math.random() < 0.5 ? -1 : 1),
        L = pv.spec?.L || 4.6;
      return _lead.set(
        pp.x - _pf.x * L * 0.55 + _pl.x * side * 1.6 + lv.x * 0.25,
        pp.y,
        pp.z - _pf.z * L * 0.55 + _pl.z * side * 1.6 + lv.z * 0.25,
      );
    }
    return _lead.set(pp.x + lv.x * lead, pp.y, pp.z + lv.z * lead);
  }
  function deployCar(c, v, t, lvl) {
    c.slowT = 0;
    c.forceDeploy = false;
    c.bestD = undefined;
    c.deployed = true;
    tryCall('setChaseTarget', () => v.setChaseTarget?.(null));
    tryCall('ejectDriver', () => v.ejectDriver?.());
    v.ai = null;
    v.parked = true;
    c.mine = true;
    tryCall('setControls', () =>
      v.setControls?.({ throttle: 0, steer: 0, brake: 1, handbrake: true }),
    );
    const pp = P.position;
    const ep = v.exitPosition ? v.exitPosition() : new THREE.Vector3(t.x + 2, 0, t.z);
    const n = c.swat ? 4 : lvl >= 2 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const off = k < 2 ? 0 : (k - 1.5) * 1.4;
      const p = k % 2 === 0 ? ep.clone() : new THREE.Vector3(2 * t.x - ep.x, ep.y, 2 * t.z - ep.z);
      if (off) {
        p.x += Math.sin(v.heading || 0) * off;
        p.z += Math.cos(v.heading || 0) * off;
      }
      p.y = groundAt(game, p.x, p.z, t.y + 2);
      const u = spawnCop(p, Math.atan2(pp.x - p.x, pp.z - p.z), c, { swat: c.swat });
      if (u) c.cops.push(u);
    }
    sfx(game, 'door', ep, 0.7);
    if (c.swat) tryCall('radio', () => law.radio?.say('swat'));
  }
  function carTick(dt) {
    const W = G.wanted,
      lvl = W.level,
      pp = P.position;
    const onFoot = !P.state.inVehicle;
    pitCd -= dt;
    const pv = P.state.inVehicle ? P.state.vehicle : null;
    stopT = pv && (pv.speedKmh || 0) < 9 ? stopT + dt : 0;
    if (pv) playerCarFrame();
    // adopt nearby AI police cars (traffic) when wanted (twice a second)
    adoptT -= dt;
    if (lvl > 0 && adoptT <= 0) {
      adoptT = 0.5;
      for (const v of V()?.list || []) {
        if (cars.length >= CAR_TARGET[lvl] + 1) break;
        if (
          !(v.typeKey === 'police' || v.police) ||
          !v.ai ||
          v.playerDriven ||
          !vAlive(game, v) ||
          distXZ(v.body.translation(), pp) > 160
        )
          continue;
        let mine = false;
        for (const c of cars)
          if (c.v === v) {
            mine = true;
            break;
          }
        if (!mine) {
          cars.push({ v, deployed: false, cops: [], mine: false, t: 0, role: null });
          seatCopDriver(v);
        }
      }
    }
    carSpawnCd -= dt;
    if (lvl > 0 && carSpawnCd <= 0 && cars.length < CAR_TARGET[lvl]) {
      carSpawnCd = lvl >= 6 ? 2.2 : lvl >= 5 ? 3 : lvl >= 3 ? 4.5 : 6;
      // reinforcements head for what the police know: the player while seen, otherwise the last-known spot / search area
      const known = W.seen ? pp : W.evading && W.searchCenter ? W.searchCenter : W.lastSeen;
      const r = dispatchPoint(known, lvl >= 3 ? cars.length % 3 : 0);
      if (r && (W.seen || distXZ(r.position, pp) > 140)) {
        const v = spawnPoliceCar(r.position, r.heading, true);
        if (v) cars.push({ v, deployed: false, cops: [], mine: true, t: 0, role: null });
      }
    }
    let idx = 0;
    for (let ci = cars.length - 1; ci >= 0; ci--) {
      const c = cars[ci],
        v = c.v;
      if (!vAlive(game, v) || v.playerDriven) {
        cars.splice(ci, 1);
        continue;
      }
      c.t = (c.t || 0) + dt;
      c.pitCd = (c.pitCd || 0) - dt;
      if (!v._gpCopDriver && v.driver) seatCopDriver(v);
      const t = v.body.translation();
      const d = distXZ(t, pp);
      if (lvl === 0) {
        if (v.chaseTarget) tryCall('setChaseTarget', () => v.setChaseTarget?.(null));
        if ((d > 90 && !inView(game, _a.set(t.x, t.y, t.z))) || d > 200 || c.t > 400) removeCar(c);
        continue;
      }
      if (d > 260 * (G.city?.mapScale || 1)) {
        removeCar(c);
        continue;
      }
      if (!c.deployed) {
        const i = idx++;
        c.role = c.swat ? 'tail' : i === 1 ? 'pit' : i === 0 ? 'tail' : 'cut';
        // cops only home on the player while someone actually sees them; otherwise they drive to the last-known
        // position (grace period), then search the circle once the player is evading
        let target = carTarget(c, i, t, lvl) || W.lastSeen;
        if (W.evading && W.searchCenter) {
          c.searchT = (c.searchT || 0) + dt;
          if (!c.searchPt || distXZ(t, c.searchPt) < 14 || c.searchT > 18) {
            const R = (W.searchRadius || 60) * 0.8,
              a = Math.random() * Math.PI * 2,
              rr = Math.sqrt(Math.random()) * R;
            (c.searchPt ||= new THREE.Vector3()).set(
              W.searchCenter.x + Math.cos(a) * rr,
              0,
              W.searchCenter.z + Math.sin(a) * rr,
            );
            c.searchT = 0;
          }
          target = c.searchPt;
        }
        const goal = target;
        target = navTarget(c, t, goal, dt);
        (c.tgt ||= new THREE.Vector3()).copy(target);
        if (v.chaseTarget !== c.tgt) tryCall('setChaseTarget', () => v.setChaseTarget?.(c.tgt));
        if (c.role === 'pit' && W.seen) tryPIT(c, v, t, lvl);
        // stuck fallback: no progress -> cops bail out on foot (if close) or the car is relocated out of view
        const dT = distXZ(t, goal);
        if (c.bestD === undefined || dT < c.bestD - 4) {
          c.bestD = dT;
          c.stuckT = 0;
        } else c.stuckT = (c.stuckT || 0) + dt;
        if (c.stuckT > 5 && d < 75 && !W.evading && (onFoot || stopT > 1)) c.forceDeploy = true;
        if (c.stuckT > 9) {
          c.bestD = undefined;
          c.stuckT = 0;
          const kc = W.seen ? pp : W.searchCenter || W.lastSeen; // relocate near what the police know, not the hidden player
          const r =
            G.city?.roadPoint(kc, 60, 120, { avoidView: true, inView: (q) => inView(game, q) }) ||
            pointNear(game, kc, 60, 110, 'road', true);
          if (r && placeCar(v, r.position, r.heading)) {
            c.path = null;
            tryCall('setChaseTarget', () => {
              v.setChaseTarget?.(null);
              v.setChaseTarget?.(c.tgt);
            });
          }
        }
        // 4+ stars: passenger shoots out of the window
        if (lvl >= 4 && W.seen && d < 35 && !arrest?.holdFire()) {
          c.fireCd = (c.fireCd ?? 1) - dt;
          if (c.fireCd <= 0) {
            c.fireCd = rand(1.0, 1.8);
            const tgt = _b.set(pp.x, pp.y + 1.1, pp.z);
            const from = _c.set(t.x, t.y + 1.0, t.z).lerp(tgt, 1.6 / Math.max(d, 2));
            if (los(from, tgt)) copShoot(null, tgt.clone(), d, from.clone());
          }
        }
        const slow = (v.speedKmh || 0) < 25;
        if (d < 40 && (v.speedKmh || 0) < 8) c.slowT = (c.slowT || 0) + dt;
        else c.slowT = 0;
        const stopped = !onFoot && stopT > 1.2;
        if (c.slowT > 1.5 && (onFoot || stopped)) c.forceDeploy = true;
        const boxed = stopped && (d < 11 || (c.slowT > 0.8 && d < 22));
        if (
          ((onFoot && (W.seen || d < 12 || c.slowT > 1.5) && ((d < 18 && slow) || d < 9)) ||
            boxed ||
            c.forceDeploy) &&
          (onFoot || stopped)
        )
          deployCar(c, v, t, lvl);
      } else if (P.state.inVehicle && d > 45 && !stopT) {
        // cops get back in and resume the chase
        for (const u of c.cops.slice()) if (!u.dead && distXZ(u.pos, t) < 25) despawnCop(u);
        if (!c.cops.some((u) => !u.dead)) {
          c.deployed = false;
          c.cops = [];
          c.bestD = undefined;
          c.stuckT = 0;
        }
      }
    }
    comms?.sirens(cars);
    // foot patrols arriving from around corners (2+ stars)
    footSpawnCd -= dt;
    let footActive = 0;
    for (const u of units) if (u.active && !u.dead) footActive++;
    if (lvl >= 2 && footSpawnCd <= 0 && footActive < FOOT_TARGET[lvl] && onFoot) {
      footSpawnCd = lvl >= 6 ? rand(1.8, 3) : lvl >= 5 ? rand(2.5, 4) : rand(5, 9);
      // r3-gameplay: foot units never pop in from nowhere: they come out of the nearest police station (when it is within
      // running distance (under 150 m) and out of view); beyond that the police cars bring them (see carTick)
      const from = W.evading && W.searchCenter ? W.searchCenter : pp;
      const stn = stations.nearest(from);
      if (
        stn &&
        distXZ(stn, pp) < 150 &&
        distXZ(stn, pp) > 45 &&
        !inView(game, _a.set(stn.x, pp.y, stn.z))
      ) {
        const sp = new THREE.Vector3(stn.road?.x ?? stn.x, 0, stn.road?.z ?? stn.z);
        sp.y = groundAt(game, sp.x, sp.z, pp.y + 3);
        spawnCop(sp, Math.atan2(pp.x - sp.x, pp.z - sp.z));
        law.dispatchStation = stn;
      }
    }
  }

  // ---------------- roadblocks (4+ stars)
  const stripeTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 16;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f4f4f4' : '#e02020';
      g.beginPath();
      g.moveTo(i * 16, 0);
      g.lineTo(i * 16 + 16, 0);
      g.lineTo(i * 16 + 8, 16);
      g.lineTo(i * 16 - 8, 16);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const barMat = new THREE.MeshStandardMaterial({
    map: stripeTex,
    roughness: 0.6,
    emissive: 0x330000,
  });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const barGeo = new THREE.BoxGeometry(3, 0.3, 0.08),
    legGeo = new THREE.BoxGeometry(0.08, 1, 0.5);
  preloadLib(['barricade2']); // r4-library: the user's striped barricade (Sign Set 8, street/barricade2.glb, 2.2 x 1.5 m); code barrier while missing
  function makeBarrier(x, z, heading, gy = 0) {
    let g = libClone('barricade2');
    const lib = !!g,
      hy = lib ? 0.75 : 0.55;
    if (!lib) {
      g = new THREE.Group();
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.y = 0.95;
      const l1 = new THREE.Mesh(legGeo, legMat);
      l1.position.set(-1.3, 0.5, 0);
      const l2 = l1.clone();
      l2.position.x = 1.3;
      g.add(bar, l1, l2);
      g.traverse((m) => {
        if (m.isMesh) m.castShadow = true;
      });
    }
    g.position.set(x, gy, z);
    g.rotation.y = heading;
    scene.add(g);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    // light breakaway prop: ~20 kg dynamic body; cars plough through it, people can shove it
    let body = null,
      col = null;
    try {
      body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, gy + hy, z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinearDamping(0.4)
          .setAngularDamping(0.6)
          .setCanSleep(true)
          .setCcdEnabled(true),
      );
      col = world.createCollider(
        (lib
          ? RAPIER.ColliderDesc.cuboid(1.1, 0.75, 0.25)
          : RAPIER.ColliderDesc.cuboid(1.5, 0.55, 0.22)
        )
          .setMass(20)
          .setFriction(0.7)
          .setRestitution(0.2),
        body,
      );
      body.sleep();
    } catch (e) {
      body = null;
    }
    const it = { g, col, body, hit: false, offset: new THREE.Vector3(0, -hy, 0) };
    barriers.push(it);
    return it;
  }
  const barriers = [];
  const _bq = new THREE.Quaternion(),
    _bo = new THREE.Vector3();
  function barrierTick() {
    for (const it of barriers.slice()) {
      if (!it.body) continue;
      if (!bodyAlive(game, it.body)) {
        barriers.splice(barriers.indexOf(it), 1);
        continue;
      }
      if (it.body.isSleeping()) continue;
      const t = it.body.translation(),
        r = it.body.rotation();
      _bq.set(r.x, r.y, r.z, r.w);
      it.g.quaternion.copy(_bq);
      _bo.copy(it.offset).applyQuaternion(_bq);
      it.g.position.set(t.x + _bo.x, t.y + _bo.y, t.z + _bo.z);
      const lv = it.body.linvel(),
        sp = Math.hypot(lv.x, lv.y, lv.z);
      if (sp > 2.5 && !it.hit) {
        // first real impact: clatter + nick the car that hit it
        it.hit = true;
        const at = new THREE.Vector3(t.x, t.y, t.z);
        sfx(game, 'bat_hit', at, 0.9);
        tryCall('fx', () => game.fx?.sparks?.(at, new THREE.Vector3(0, 1, 0)));
        for (const v of V()?.list || []) {
          if (!vAlive(game, v)) continue;
          const vt = v.body.translation();
          if (Math.hypot(vt.x - t.x, vt.z - t.z) < 4.5) {
            tryCall('v.damage', () => v.damage?.(15, null));
            v.health = (v.health ?? 1000) - 15;
            game.emit?.('crash', { vehicle: v, impulse: 400, point: at });
            break;
          }
        }
      }
      if (sp < 0.5) it.hit = false;
    }
  }
  function removeBarrier(it) {
    scene.remove(it.g);
    if (it.body) removeBodySafe(game, it.body);
    else if (it.col) removeColliderSafe(game, it.col);
    const i = barriers.indexOf(it);
    if (i >= 0) barriers.splice(i, 1);
  }
  let blockCd = 10;
  function roadblockTick(dt) {
    const lvl = G.wanted.level,
      W = G.wanted;
    blockCd -= dt;
    for (const b of blocks.slice()) {
      b.t += dt;
      const d = distXZ(b.center, P.position);
      const seen = inView(game, b.center);
      if ((lvl === 0 && d > 50 && !seen) || (b.t > 60 && d > 80 && !seen) || d > 300) {
        for (const m of b.items) removeBarrier(m);
        tryCall('spikes off', () => response?.removeSpikes?.(b));
        for (const v of b.cars) removeCar({ v, cops: [], mine: true });
        blocks.splice(blocks.indexOf(b), 1);
      }
    }
    if (
      lvl < 3 ||
      !W.seen ||
      blockCd > 0 ||
      !P.state.inVehicle ||
      (P.state.vehicle?.speedKmh || 0) < 35 ||
      blocks.length >= (lvl >= 6 ? 3 : 2)
    )
      return;
    blockCd = 25;
    const vel = P.state.vehicle?.body?.linvel?.() || {
      x: Math.sin(P.heading),
      z: Math.cos(P.heading),
    };
    const vl = Math.hypot(vel.x, vel.z) || 1;
    const dir = { x: vel.x / vl, z: vel.z / vl };
    const ra = G.city?.roadAhead?.(P.position, dir, 85 * Math.sqrt(G.city?.mapScale || 1));
    if (!ra) return;
    const cx = ra.x,
      cz = ra.z,
      gy = G.city.groundHeight(cx, cz);
    const center = new THREE.Vector3(cx, gy, cz);
    const b = { center, items: [], cars: [], t: 0 };
    const perp = { x: -ra.dir.z, z: ra.dir.x };
    const W2 = Math.max(6, ra.width || 10);
    const carHeading = Math.atan2(perp.x, perp.z);
    const barRot = Math.atan2(-perp.z, perp.x);
    for (const sgn of [-1, 1]) {
      const px = cx + perp.x * sgn * W2 * 0.27,
        pz = cz + perp.z * sgn * W2 * 0.27;
      const v = spawnPoliceCar(
        new THREE.Vector3(px, gy, pz),
        carHeading + (sgn > 0 ? 0 : Math.PI),
        false,
      );
      if (v) {
        tryCall('setChaseTarget', () => v.setChaseTarget?.(null));
        tryCall('eject', () => v.ejectDriver?.());
        v.ai = null;
        v.parked = true;
        b.cars.push(v);
      } else b.items.push(makeBarrier(px, pz, barRot, gy));
    }
    b.items.push(makeBarrier(cx, cz, barRot, gy));
    for (const sgn of [-1, 1]) {
      const p = new THREE.Vector3(
        cx + ra.dir.x * 4 + perp.x * sgn * 3,
        gy,
        cz + ra.dir.z * 4 + perp.z * sgn * 3,
      );
      spawnCop(p, Math.atan2(P.position.x - p.x, P.position.z - p.z));
    }
    blocks.push(b);
    tryCall('spikes', () => response?.addSpikes?.(b, ra, gy));
    tryCall('radio', () =>
      law.radio?.say('roadblock', {
        street: tryCall('st', () => G.city?.city?.streetNameAt?.(cx, cz), null),
      }),
    );
    tryCall('notify', () => game.hud?.notify?.('Roadblock ahead!', 2200));
  }

  // vision: 110 deg cone, range shrinks at night / in water / under cover (bridges), LOS ray, close-range awareness
  function visMul(target) {
    let k = 1;
    const tod = game.timeOfDay ?? 12;
    if (tod < 6.5 || tod > 19.5) k *= SIGHT.night;
    try {
      if ((P.waterDepth || 0) > 0.4 || G.city?.isWater?.(target.x, target.z)) k *= SIGHT.water;
    } catch (e) {
      /* ignore */
    }
    if (game.clock.elapsed - coverT > 0.5) {
      coverT = game.clock.elapsed;
      covered =
        los(_c.set(target.x, target.y + 1, target.z), _d.set(target.x, target.y + 9, target.z)) ===
        false;
    }
    if (covered) k *= SIGHT.covered;
    return k;
  }
  let coverT = -9,
    covered = false;
  const _c = new THREE.Vector3(),
    _d = new THREE.Vector3(),
    _e = new THREE.Vector3();
  function canSee(eye, heading, range, aware, tgt) {
    const dx = tgt.x - eye.x,
      dz = tgt.z - eye.z,
      d = Math.hypot(dx, dz);
    if (d < aware) return true;
    if (d > range * visMul(tgt)) return false;
    if (heading !== null && heading !== undefined) {
      let a = Math.atan2(dx, dz) - heading;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > ((SIGHT.cone / 2) * Math.PI) / 180) return false;
    }
    return los(eye, tgt);
  }
  G.canSee = canSee;
  // every police pair of eyes with a line of sight to the player right now (the knowledge model decides who recognizes him)
  const obsOut = [],
    obsPool = [];
  let ambT = 0;
  const ambient = [];
  function obs(o, kind, dist, perception, name, callTime) {
    const x = obsPool[obsOut.length] || (obsPool[obsOut.length] = {});
    x.o = o;
    x.kind = kind;
    x.dist = dist;
    x.perception = perception;
    x.name = name;
    x.callTime = callTime;
    x.susp = 0;
    obsOut.push(x);
  }
  function observers() {
    obsOut.length = 0;
    const pp = P.position,
      tgt = _b.set(pp.x, pp.y + 1.3, pp.z),
      lvl = law.S.level;
    for (const u of units)
      if (u.active && !u.dead && u.sees)
        obs(
          u,
          'foot',
          distXZ(u.pos, pp),
          u.per,
          u.callName || (u.callName = `${u.rank} ${u.name}`),
          2.2 - u.per * 1.2,
        );
    for (const c of cars) {
      if ((c.deployed && c.cops.length) || !vAlive(game, c.v)) continue;
      const t = c.v.body.translation();
      // car eyes at 10 Hz as well
      c.seeT = (c.seeT || 0) - game.clock.dt;
      if (c.seeT <= 0) {
        c.seeT = 0.1;
        c.sees = canSee(
          _e.set(t.x, t.y + 1.2, t.z),
          c.v.heading,
          SIGHT.carRange,
          SIGHT.carAware,
          tgt,
        );
      }
      if (c.sees)
        obs(
          c,
          'car',
          distXZ(t, pp),
          c.per ?? (c.per = 0.3 + Math.random() * 0.6),
          c.callsign || 'A patrol unit',
          1.4,
        );
    }
    // patrol cars in ordinary traffic also keep an eye out for a description on file
    if (game.clock.elapsed - ambT > 0.4) {
      ambT = game.clock.elapsed;
      ambient.length = 0;
      if (law.ev.size)
        for (const v of V()?.list || []) {
          if (
            !(v.typeKey === 'police' || v.police === true) ||
            v.playerDriven ||
            !v.ai ||
            !vAlive(game, v)
          )
            continue;
          const t = v.body.translation();
          if (distXZ(t, pp) > 70) continue;
          let mine = false;
          for (const c of cars)
            if (c.v === v) {
              mine = true;
              break;
            }
          if (mine) continue;
          if (
            canSee(
              _e.set(t.x, t.y + 1.2, t.z),
              v.heading,
              lvl > 0 ? SIGHT.carRange : 45,
              SIGHT.carAware,
              tgt,
            )
          )
            ambient.push(v);
        }
    }
    for (const v of ambient) {
      if (!vAlive(game, v)) continue;
      const t = v.body.translation();
      obs(v, 'car', distXZ(t, pp), 0.5, 'A patrol unit', 1.6);
    }
    const ro = response?.observers?.();
    if (ro) for (const x of ro) obsOut.push(x);
    return obsOut;
  }
  function nearestDist() {
    let d = 99;
    const pp = P.position;
    for (const u of units) if (u.active && !u.dead) d = Math.min(d, distXZ(u.pos, pp));
    for (const c of cars)
      if (vAlive(game, c.v)) d = Math.min(d, distXZ(c.v.body.translation(), pp));
    return d;
  }
  function witnessName() {
    let best = null,
      bd = 1e9;
    for (const u of units)
      if (u.active && !u.dead) {
        const d = distXZ(u.pos, P.position);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
    return best ? `${best.rank} ${best.name}` : 'A patrol unit';
  }
  function anySeesRaw() {
    for (const u of units) if (u.active && !u.dead && u.sees) return true;
    const pp = P.position,
      tgt = _b.set(pp.x, pp.y + 1.3, pp.z);
    for (const c of cars) {
      if (c.deployed && c.cops.length) continue;
      if (!vAlive(game, c.v)) continue;
      const t = c.v.body.translation();
      if (canSee(_e.set(t.x, t.y + 1.2, t.z), c.v.heading, SIGHT.carRange, SIGHT.carAware, tgt))
        return true;
    }
    return false;
  }
  // a cop that would witness a crime at `pos`
  function copWitness(pos) {
    const tgt = _b.set(pos.x, pos.y + 1.2, pos.z);
    for (const u of units)
      if (
        u.active &&
        !u.dead &&
        canSee(
          _a.set(u.pos.x, u.pos.y + 1.6, u.pos.z),
          u.heading,
          SIGHT.footRange,
          SIGHT.aware,
          tgt,
        )
      )
        return true;
    for (const c of cars) {
      if (!vAlive(game, c.v)) continue;
      const t = c.v.body.translation();
      if (canSee(_a.set(t.x, t.y + 1.2, t.z), c.v.heading, SIGHT.carRange, SIGHT.carAware, tgt))
        return true;
    }
    for (const v of V()?.list || []) {
      if (!(v.typeKey === 'police' || v.police) || v.playerDriven || !v.ai) continue;
      if (!vAlive(game, v)) continue;
      const t = v.body.translation();
      if (canSee(_a.set(t.x, t.y + 1.2, t.z), v.heading, SIGHT.carRange, SIGHT.carAware, tgt))
        return true;
    }
    for (const ped of game.peds?.list || [])
      if (
        ped.isCop &&
        !ped.dead &&
        ped.pos &&
        canSee(
          _a.set(ped.pos.x, ped.pos.y + 1.6, ped.pos.z),
          ped.heading,
          SIGHT.footRange,
          SIGHT.aware,
          tgt,
        )
      )
        return true;
    return false;
  }

  function clearAll() {
    for (const u of units)
      if (u.active && !u.dead) {
        u.mode = 'leave';
      }
  }

  // pointing a gun at an officer is a crime the officer sees himself (GTA: aiming at a cop brings a star)
  const _ad = new THREE.Vector3();
  function aimTick(dt) {
    if (!P.aiming || P.state.inVehicle || !game.weapons?.isGun?.(P.weapon)) return;
    const yaw = game.cameraYaw ?? 0;
    _ad.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    for (const u of units) {
      if (!u.active || u.dead) continue;
      const dx = u.pos.x - P.position.x,
        dz = u.pos.z - P.position.z,
        d = Math.hypot(dx, dz);
      if (d > 30 || (dx * _ad.x + dz * _ad.z) / (d || 1) < 0.97 || !u.sees) {
        u.aimedAtT = Math.max(0, (u.aimedAtT || 0) - dt);
        continue;
      }
      u.aimedAtT = (u.aimedAtT || 0) + dt;
      if (u.aimedAtT > 0.7 && !u.aimReported) {
        u.aimReported = true;
        comms?.shout(u, 'Drop the gun! Drop it now!', { priority: 3, gap: 0.5 });
        G.reportCrime?.('weapon_display', P.position.clone(), null, { police: true });
      }
    }
  }
  // cost meter (ms per frame, smoothed) for the perf check: the police must cost nothing when no unit is active
  const perf = { ms: 0, idle: true, frames: 0 };
  function busy() {
    if (law.S.level > 0 || cars.length || blocks.length || barriers.length) return true;
    for (const u of units) if (u.active) return true;
    return !!arrest?.busy || !!response?.flats?.size || !!response?.spikes?.length;
  }
  function update(dt) {
    const t0 = performance.now();
    tryCall('law', () => law.tick(dt));
    tryCall('radio', () => radio?.tick(dt));
    tryCall('comms', () => comms?.tick(dt));
    tryCall('arrest', () => arrest?.tick(dt));
    perf.idle = !busy();
    if (!perf.idle) {
      tryCall('response', () => response?.tick(dt));
      tryCall('lowlevel', () => lowlevel?.tick(dt));
      tryCall('police.cars', () => carTick(dt));
      tryCall('police.roadblock', () => roadblockTick(dt));
      tryCall('police.barriers', () => barrierTick());
      tryCall('police.aim', () => aimTick(dt));
      for (const u of units)
        if (u.active) {
          tryCall('police.unit', () => updateUnit(u, dt));
        }
      for (const u of units) if (u.active) visualUnit(u, dt);
    } else if (comms) comms.sirens(cars);
    perf.ms += (performance.now() - t0 - perf.ms) * 0.05;
    perf.frames++;
  }
  function hardReset() {
    for (const u of units) if (u.active) despawnCop(u);
    for (const c of cars.slice()) removeCar(c);
    blockCd = 10;
    carSpawnCd = 4;
    footSpawnCd = 5;
    tryCall('response.reset', () => response?.reset?.());
    tryCall('arrest.reset', () => arrest?.reset?.());
    tryCall('comms', () => comms?.silence());
    tryCall('law.close', () => law.closeCase('processed'));
  }
  if (!units.length) warnOnce('police', 'no foot cop units (character model failed)');
  const api = {
    barriers,
    makeBarrier,
    removeBarrier,
    blocks,
    units,
    cars,
    byHandle,
    spawnCop,
    despawnCop,
    damageCop,
    damagePlayer,
    anySees: () => law.S.seen,
    anySeesRaw,
    copWitness: () => false,
    copWitnessReal: copWitness,
    observers,
    nearestDist,
    witnessName,
    clearAll,
    hardReset,
    update,
    spawnPoliceCar,
    removeCar,
    placeCar,
    canSee,
    dispatchPoint,
    navTarget,
    stations,
    law,
    SIGHT,
    copShoot,
    dispatchUnit,
    perf,
    get arrest() {
      return arrest;
    },
    get comms() {
      return comms;
    },
    get response() {
      return response;
    },
  };
  law.police = api;
  radio = tryCall('radio.create', () => createRadio(game, G, law), null);
  law.radio = radio;
  response = tryCall('response.create', () => createResponse(game, G, law, api), null);
  law.response = response;
  lowlevel = tryCall('lowlevel.create', () => createLowLevel(game, G, law, api), null);
  law.lowlevel = lowlevel;
  comms = tryCall('comms.create', () => createComms(game, G, law), null);
  law.comms = comms;
  arrest = tryCall(
    'arrest.create',
    () => createArrest(game, G, law, api, comms || { shout() {}, silence() {}, sirens() {} }),
    null,
  );
  law.arrest = arrest;
  return api;
}
