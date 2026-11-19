// Southline — the protagonist you are NOT playing, as a simple AI in the world (Phase F2 / F1).
// Modes:
//   idle:   stands where you left them (or sits in their car, driver's seat), relaxed idle animation.
//   follow: after "come help" on the phone: catches up with the player (runs, walks), rides along as the passenger,
//           and shoots at whoever is fighting the player (peds in a fight with him, hostile mission enemies).
// Cost: nothing past HIDE_R (hidden, no update); a quarter-rate update between NEAR_R and HIDE_R; full update only
// when close or following. No physics body: the double is a posed model that keeps to the ground height.
import * as THREE from 'three';
import { createPlayerSeat } from './seat.js';
import { seatCharacter, unseatCharacter } from '../npc/seat.js';
import { buildWeaponModel } from '../gameplay/gunModels.js';
import { holdWeapon } from '../gameplay/gunHold.js';

const NEAR_R = 45;
const HIDE_R = 180;
const FOLLOW = { back: 2.2, side: 1.1, walkAt: 2.6, runAt: 7, sprintAt: 18, warpAt: 90 };
const SPEED = { walk: 1.5, run: 4.6, sprint: 6.8 };
const FIGHT = { range: 32, every: 0.75, hit: 0.5, damage: 14 };

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export function createDouble(game, char) {
  const scene = game.scene;
  const driverSeat = createPlayerSeat(game);
  const D = {
    char,
    mode: 'idle',
    pos: new THREE.Vector3(),
    heading: 0,
    vehicle: null,
    seat: null, // 'driver' | 'passenger' | null
    speed: 0,
    tick: 0,
    shown: false,
    gun: null,
    fireT: 0,
    target: null,
  };

  // Feet height: a ray down through the static colliders (decks, lots, stairs), else the city's terrain height.
  let ray = null;
  function ground(x, z, y) {
    const c = game.city;
    const g = c?.groundHeightAt?.(x, z, y);
    const terrain = Number.isFinite(g) ? g : (y ?? 0);
    const R = game.RAPIER;
    const W = game.world;
    if (!R || !W) return terrain;
    try {
      const top = Math.max(terrain, y ?? terrain) + 1.2;
      const origin = { x, y: top, z };
      const dir = { x: 0, y: -1, z: 0 };
      if (!ray) ray = new R.Ray(origin, dir);
      else {
        ray.origin = origin;
        ray.dir = dir;
      }
      const flags =
        R.QueryFilterFlags.EXCLUDE_DYNAMIC |
        (R.QueryFilterFlags.EXCLUDE_KINEMATIC || 0) |
        R.QueryFilterFlags.EXCLUDE_SENSORS;
      const hit = W.castRay(ray, 4, true, flags);
      if (hit && Number.isFinite(hit.timeOfImpact))
        return Math.max(terrain, top - hit.timeOfImpact);
    } catch (e) {
      /* no physics here yet */
    }
    return terrain;
  }

  // Stand at a spot (feet height y optional: snapped to the ground).
  D.place = (x, y, z, heading = 0) => {
    D.unseat();
    D.pos.set(x, ground(x, z, y), z);
    D.heading = heading;
    if (char.root.parent !== scene) scene.add(char.root);
    char.root.position.copy(D.pos);
    char.root.rotation.set(0, heading, 0);
    char.setVisible?.(true);
  };

  // Sit in a car: the driver's seat through the player's seat module (same pose as when you drive it), a passenger
  // seat through the shared seat solver. Boats, bikes and aircraft without a seat anchor hide the double aboard.
  D.seatIn = (v, role = 'driver') => {
    D.unseat();
    D.vehicle = v;
    D.seat = role;
    char.root.visible = false; // no slide-in from wherever the model was
    if (role === 'driver') {
      if (!driverSeat.enter(char, v)) char.setVisible?.(false);
      return;
    }
    const shell = v?.car?.shell;
    const anchor = passengerAnchor(v);
    if (!shell || !anchor) {
      char.setVisible?.(false);
      return;
    }
    shell.add(char.root);
    char.root.visible = true;
    char.setVisible?.(true);
    if (!seatCharacter(char, anchor, { role: 'passenger', vehicle: v, game })) {
      shell.remove(char.root);
      char.setVisible?.(false);
    }
  };

  function passengerAnchor(v) {
    try {
      return v.seatAnchor?.(1) || game.vehicles?.seatAnchor?.(v, 1) || null;
    } catch (e) {
      return null;
    }
  }

  // Leave the car: stands beside it on the passenger / driver side.
  D.unseat = () => {
    if (!D.vehicle) return;
    const v = D.vehicle;
    const role = D.seat;
    if (role === 'driver') driverSeat.exit();
    else unseatCharacter(char);
    if (char.root.parent !== scene) scene.add(char.root);
    char.root.rotation.set(0, 0, 0);
    char.setVisible?.(true);
    D.vehicle = null;
    D.seat = null;
    const t = v.body?.translation?.();
    if (t) {
      const r = v.body.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const side = _v.set(role === 'driver' ? 1 : -1, 0, 0).applyQuaternion(q);
      D.pos.set(t.x + side.x * 1.8, 0, t.z + side.z * 1.8);
      D.pos.y = ground(D.pos.x, D.pos.z, t.y);
      D.heading = Math.atan2(side.x, side.z);
      char.root.position.copy(D.pos);
      char.root.rotation.y = D.heading;
    }
  };

  D.hide = () => {
    char.setVisible?.(false);
    D.shown = false;
  };

  // Where the double stands (or the car it sits in).
  D.where = () => {
    const t = D.vehicle?.body?.translation?.();
    return t ? _w.set(t.x, t.y, t.z) : D.pos;
  };

  // ---------------------------------------------------------------- per frame
  D.update = (dt) => {
    const P = game.player;
    const at = D.where();
    const dx = at.x - P.position.x;
    const dz = at.z - P.position.z;
    const d = Math.hypot(dx, dz);
    D.dist = d;
    if (D.mode === 'follow') return followStep(dt, d);
    if (d > HIDE_R) {
      if (D.shown) D.hide();
      return;
    }
    if (!D.shown) {
      D.shown = true;
      char.setVisible?.(true);
    }
    // a quarter of the frames between NEAR_R and HIDE_R (the model is at a far LOD there anyway)
    D.tick++;
    if (d > NEAR_R && D.tick % 4) return;
    const step = d > NEAR_R ? dt * 4 : dt;
    animate(step, 0);
    holdGun(step, null);
  };

  function animate(dt, speed) {
    if (D.vehicle) {
      if (D.seat === 'driver') driverSeat.update(dt);
      else char.update(dt, { driving: true, speed: 0, grounded: true });
      return;
    }
    char.root.position.copy(D.pos);
    char.root.rotation.y = D.heading;
    char.update(dt, { speed, groundSpeed: speed, grounded: true, sprint: speed > 6 });
  }

  // ---------------------------------------------------------------- follower
  function followStep(dt, d) {
    const P = game.player;
    const pv = P.state?.inVehicle ? P.state.vehicle : null;
    if (!D.shown) {
      D.shown = true;
      char.setVisible?.(true);
    }
    // the player drives: get in (passenger) when close, or catch up off screen when far behind
    if (pv) {
      if (D.vehicle !== pv && (d < 4 || d > FOLLOW.warpAt)) D.seatIn(pv, 'passenger');
      if (D.vehicle === pv) {
        animate(dt, 0);
        return;
      }
    } else if (D.vehicle) {
      D.unseat();
    }
    if (d > FOLLOW.warpAt && !pv) warpBehind();
    // target: behind the player, a little to the side
    const h = P.heading || 0;
    const tx = P.position.x - Math.sin(h) * FOLLOW.back + Math.cos(h) * FOLLOW.side;
    const tz = P.position.z - Math.cos(h) * FOLLOW.back - Math.sin(h) * FOLLOW.side;
    const ox = (pv ? pvDoor(pv).x : tx) - D.pos.x;
    const oz = (pv ? pvDoor(pv).z : tz) - D.pos.z;
    const od = Math.hypot(ox, oz);
    const want =
      od > FOLLOW.sprintAt
        ? SPEED.sprint
        : od > FOLLOW.runAt
          ? SPEED.run
          : od > FOLLOW.walkAt * 0.5
            ? SPEED.walk
            : 0;
    D.speed += (want - D.speed) * Math.min(1, dt * 4);
    if (od > 0.05 && D.speed > 0.05) {
      const s = Math.min(od, D.speed * dt);
      D.pos.x += (ox / od) * s;
      D.pos.z += (oz / od) * s;
      turnTo(Math.atan2(ox, oz), dt);
    }
    D.pos.y = ground(D.pos.x, D.pos.z, D.pos.y + 0.5);
    fight(dt);
    animate(dt, D.speed);
    holdGun(dt, D.target ? D.target.pos : null);
  }

  function pvDoor(v) {
    const t = v.body.translation();
    const r = v.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const side = _v.set(-1, 0, 0).applyQuaternion(q);
    return { x: t.x + side.x * 1.6, z: t.z + side.z * 1.6 };
  }

  function turnTo(want, dt) {
    const diff = Math.atan2(Math.sin(want - D.heading), Math.cos(want - D.heading));
    D.heading += diff * Math.min(1, dt * 8);
  }

  // Off screen catch-up: behind the camera, 14 m back from the player, on dry ground.
  function warpBehind() {
    const P = game.player;
    const yaw = game.cameraYaw || 0;
    const x = P.position.x + Math.sin(yaw) * 14;
    const z = P.position.z + Math.cos(yaw) * 14;
    const dry = !game.city?.isWater?.(x, z);
    D.place(dry ? x : P.position.x, P.position.y, dry ? z : P.position.z, yaw + Math.PI);
  }

  // ---------------------------------------------------------------- combat: shoot whoever fights the player
  function enemies() {
    const P = game.player.position;
    const out = [];
    const r2 = FIGHT.range * FIGHT.range;
    const near = (p) => p && (p.x - P.x) ** 2 + (p.z - P.z) ** 2 < r2;
    for (const p of game.peds?.list || []) {
      if (!p || p.dead || p.state !== 'fight' || p.rag || !near(p.pos)) continue;
      out.push({ kind: 'ped', obj: p, pos: p.pos });
    }
    const G = game.gameplay?.G || game.combatG;
    for (const n of G?.extraTargets || []) {
      if (n.dead || n.alive === false || !(n.hostile || n.enemy) || !near(n.pos)) continue;
      out.push({ kind: 'npc', obj: n, pos: n.pos });
    }
    return out;
  }

  function fight(dt) {
    D.fireT -= dt;
    if (D.vehicle) {
      D.target = null;
      return;
    }
    const list = enemies();
    if (!list.length) {
      D.target = null;
      return;
    }
    let best = null;
    let bd = 1e9;
    for (const e of list) {
      const dd = (e.pos.x - D.pos.x) ** 2 + (e.pos.z - D.pos.z) ** 2;
      if (dd < bd) {
        bd = dd;
        best = e;
      }
    }
    D.target = best;
    turnTo(Math.atan2(best.pos.x - D.pos.x, best.pos.z - D.pos.z), dt * 2);
    if (D.fireT > 0) return;
    D.fireT = FIGHT.every * (0.8 + Math.random() * 0.5);
    shootAt(best);
  }

  function shootAt(e) {
    D.shots = (D.shots || 0) + 1;
    const from = new THREE.Vector3(D.pos.x, D.pos.y + 1.35, D.pos.z);
    const to = new THREE.Vector3(e.pos.x, (e.pos.y || D.pos.y) + 1.2, e.pos.z);
    const hit = Math.random() < FIGHT.hit;
    if (!hit)
      to.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5));
    const G = game.gameplay?.G;
    try {
      if (G?.tracer) G.tracer(from.clone(), to.clone(), { speed: 380 });
      else game.combat?.gfx?.tracer?.(from.clone(), to.clone(), { speed: 380 });
      game.audio?.play?.('pistol', { position: from, volume: 0.8 });
    } catch (err) {
      /* cosmetic */
    }
    if (!hit) return;
    const dir = to.clone().sub(from).normalize();
    try {
      game.combat?.damage?.(e, FIGHT.damage, dir, 'bullet', { from: 'partner', point: to });
    } catch (err) {
      /* the target went away */
    }
  }

  // A pistol in her hand while following (aimed at the current target), none while idle or seated.
  function holdGun(dt, aim) {
    const want = D.mode === 'follow' && !D.vehicle;
    if (want && !D.gun) {
      try {
        D.gun = buildWeaponModel('pistol');
        scene.add(D.gun);
      } catch (e) {
        D.gun = null;
      }
    }
    if (!D.gun) return;
    D.gun.visible = want;
    if (!want) return;
    try {
      holdWeapon(D.gun, char.root, { aim, dt, time: game.clock?.elapsed || 0 });
    } catch (e) {
      /* cosmetic */
    }
  }

  D.setMode = (mode) => {
    D.mode = mode;
    D.target = null;
    if (mode !== 'follow' && D.vehicle && D.seat === 'passenger') D.unseat();
    if (mode !== 'follow' && D.gun) D.gun.visible = false;
  };

  // The double becomes the player (switching): out of its car, off the scene's books here.
  D.release = () => {
    D.unseat();
    D.mode = 'idle';
    if (D.gun) D.gun.visible = false;
  };

  return D;
}
