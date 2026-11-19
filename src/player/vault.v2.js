// Southline — vaulting over low walls, fences, railings and car hoods (PLAYER helper), GTA style: press jump (Space)
// while facing an obstacle 0.5 - 1.2 m high within arm's reach and Nico hops over it (or climbs onto it when there is
// no room behind). Probes with rays against the static world + vehicles; the move is a scripted arc (player.script),
// the capsule's collider is off for the move, the jump clip carries the body pose.
// game.playerVault = { tryVault(), probe(), active, stats }
import * as THREE from 'three';

export const order = 47;
const MIN_H = 0.5,
  MAX_H = 1.2,
  REACH = 1.0;

export async function initV2(game) {
  const P = game.player,
    R = game.RAPIER,
    W = game.world,
    QF = R.QueryFilterFlags;
  const FLAGS = QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_DYNAMIC; // walls, fences, rails, ledges (not cars / props / peds)
  const S = { move: null, stats: { vaults: 0, climbs: 0, refused: 0 } };
  const ray = (o, d, len) => {
    try {
      return W.castRayAndGetNormal(new R.Ray(o, d), len, true, FLAGS, undefined, P.collider);
    } catch (e) {
      return null;
    }
  };
  // cars: only awake (collider enabled) vehicles, hit by their own body
  const carBodies = () => {
    const m = new Map();
    for (const c of game.vehicles?.list || []) {
      try {
        if (c.body && !c.frozen && !c.disposed && c.body.isEnabled?.() !== false)
          m.set(c.body.handle, c);
      } catch (e) {
        /* ignore */
      }
    }
    return m;
  };
  const carRay = (o, d, len, cars) => {
    try {
      return W.castRayAndGetNormal(
        new R.Ray(o, d),
        len,
        true,
        QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC,
        undefined,
        P.collider,
        undefined,
        (c) => {
          const b = c.parent();
          return !!b && cars.has(b.handle);
        },
      );
    } catch (e) {
      return null;
    }
  };
  // climb ONTO a parked car (hood / trunk / roof of a low car), never through it: he ends standing on top
  function probeCar(at = null, heading = null) {
    const cars = carBodies();
    if (!cars.size) return null;
    const p = at || P.position,
      h = heading ?? P.heading,
      d = { x: Math.sin(h), y: 0, z: Math.cos(h) };
    const knee = carRay({ x: p.x, y: p.y + 0.45, z: p.z }, d, REACH + 0.3, cars);
    if (!knee || Math.abs(knee.normal.y) > 0.6) return null;
    const fx = p.x + d.x * (knee.timeOfImpact + 0.35),
      fz = p.z + d.z * (knee.timeOfImpact + 0.35);
    const down = carRay(
      { x: fx, y: p.y + MAX_H + 0.5, z: fz },
      { x: 0, y: -1, z: 0 },
      MAX_H + 0.5,
      cars,
    );
    if (!down) return null;
    const top = p.y + MAX_H + 0.5 - down.timeOfImpact,
      hgt = top - p.y;
    if (hgt < MIN_H || hgt > MAX_H || down.normal.y < 0.7) return null; // a fairly flat panel to stand on
    if (!capFree(fx, top, fz)) return null;
    return {
      kind: 'climb',
      car: true,
      top,
      hgt,
      land: { x: fx, y: top, z: fz },
      dir: d,
      dist: knee.timeOfImpact,
      thick: 0.35,
    };
  }
  const capFree = (x, y, z) => {
    try {
      const c = P.capsule || { half: 0.62, r: 0.28, center: 0.9 };
      return !W.intersectionWithShape(
        { x, y: y + c.center + 0.05, z },
        { x: 0, y: 0, z: 0, w: 1 },
        new R.Capsule(c.half, c.r - 0.02),
        QF.EXCLUDE_SENSORS,
        undefined,
        P.collider,
      );
    } catch (e) {
      return false;
    }
  };

  // what is in front of him? -> { kind: 'vault'|'climb', top, land:{x,y,z}, dir, dist } or null
  function probe(at = null, heading = null) {
    const p = at || P.position,
      h = heading ?? P.heading,
      d = { x: Math.sin(h), y: 0, z: Math.cos(h) };
    const knee = ray({ x: p.x, y: p.y + 0.35, z: p.z }, d, REACH + 0.3);
    if (!knee) return null;
    // the obstacle must face him (not a slope / ramp side) and end below 1.2 m: a ray at head height passes over it
    if (Math.abs(knee.normal.y) > 0.5) return null;
    if (ray({ x: p.x, y: p.y + MAX_H + 0.25, z: p.z }, d, knee.timeOfImpact + 0.6)) return null;
    // top height: down from above, just past the face
    const fx = p.x + d.x * (knee.timeOfImpact + 0.12),
      fz = p.z + d.z * (knee.timeOfImpact + 0.12);
    const down = ray({ x: fx, y: p.y + MAX_H + 0.3, z: fz }, { x: 0, y: -1, z: 0 }, MAX_H + 0.3);
    if (!down) return null;
    const top = p.y + MAX_H + 0.3 - down.timeOfImpact,
      hgt = top - p.y;
    if (hgt < MIN_H || hgt > MAX_H) return null;
    // thickness: walk along the top until it drops away (a fence is thin, a wall cap / car hood is deeper)
    let thick = 0.12;
    for (let t = 0.2; t <= 1.6; t += 0.1) {
      const q = ray(
        {
          x: p.x + d.x * (knee.timeOfImpact + t),
          y: top + 0.25,
          z: p.z + d.z * (knee.timeOfImpact + t),
        },
        { x: 0, y: -1, z: 0 },
        0.45,
      );
      if (!q) {
        thick = t;
        break;
      }
      thick = t;
    }
    // landing: ground on the far side, reachable (not a drop of more than 2.5 m), room for the capsule
    const lx = p.x + d.x * (knee.timeOfImpact + thick + 0.5),
      lz = p.z + d.z * (knee.timeOfImpact + thick + 0.5);
    const g = ray({ x: lx, y: top + 0.4, z: lz }, { x: 0, y: -1, z: 0 }, 3.2);
    if (g) {
      const gy = top + 0.4 - g.timeOfImpact;
      if (top - gy < 2.6 && capFree(lx, gy, lz))
        return {
          kind: 'vault',
          top,
          hgt,
          land: { x: lx, y: gy, z: lz },
          dir: d,
          dist: knee.timeOfImpact,
          thick,
        };
    }
    // no room behind: climb up onto it (a wide wall / ledge) when he fits on top
    const cx = p.x + d.x * (knee.timeOfImpact + 0.45),
      cz = p.z + d.z * (knee.timeOfImpact + 0.45);
    if (thick >= 0.5 && capFree(cx, top, cz))
      return {
        kind: 'climb',
        top,
        hgt,
        land: { x: cx, y: top, z: cz },
        dir: d,
        dist: knee.timeOfImpact,
        thick,
      };
    return null;
  }

  // cars on the path or at the landing (parked cars may be asleep with their colliders off, so ask the vehicle list)
  function carNear(v) {
    const p = P.position,
      mx = (p.x + v.land.x) / 2,
      mz = (p.z + v.land.z) / 2;
    for (const c of game.vehicles?.list || []) {
      let t;
      try {
        t = c.body.translation();
      } catch (e) {
        continue;
      }
      if (Math.hypot(t.x - mx, t.z - mz) < 2.8 || Math.hypot(t.x - v.land.x, t.z - v.land.z) < 2.8)
        return true;
    }
    return false;
  }
  function tryVault() {
    if (S.move || P.script || P.state.inVehicle || P.swimming || P.ragdoll || !P.state.grounded)
      return false;
    let v = probe();
    if (v && carNear(v)) v = null;
    if (!v) v = probeCar();
    if (!v) {
      S.stats.refused++;
      return false;
    }
    const from = P.position.clone();
    // duration grows with height and the distance covered; the arc clears the top by 12 cm
    const dur = (v.kind === 'climb' ? 0.62 : 0.55) + v.hgt * 0.18 + v.thick * 0.12;
    S.move = { v, from, t: 0, dur };
    try {
      P.collider?.setEnabled(false);
    } catch (e) {
      /* ignore */
    }
    P.script = {
      lock: true,
      vault: true,
      fixed() {},
      anim: { speed: 1.4, grounded: false, jumping: true, sprint: false },
    };
    S.stats[v.kind === 'vault' ? 'vaults' : 'climbs']++;
    game.emit?.('playerVault', { kind: v.kind, height: +v.hgt.toFixed(2) });
    return true;
  }

  // the arc, every fixed step (after the controller, which is idle while the script is set)
  game.fixedHooks.push(function playerVaultFixed(dt) {
    const m = S.move;
    if (!m) return;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur),
      v = m.v,
      f = m.from;
    // horizontal: ease in/out to the landing; vertical: up to the top (+ clearance) by 45 %, then down to the landing
    const e = k * k * (3 - 2 * k);
    const x = f.x + (v.land.x - f.x) * e,
      z = f.z + (v.land.z - f.z) * e;
    const peak = v.top + (v.kind === 'climb' ? 0.02 : 0.12);
    const y =
      k < 0.45
        ? f.y + (peak - f.y) * Math.sin(((k / 0.45) * Math.PI) / 2)
        : peak + (v.land.y - peak) * (1 - Math.cos((((k - 0.45) / 0.55) * Math.PI) / 2));
    try {
      game.movePlayerTo(x, y, z);
    } catch (e) {
      /* ignore */
    }
    P.state.grounded = k >= 1;
    if (k >= 1) {
      S.move = null;
      if (P.script?.vault) P.script = null;
      try {
        P.collider?.setEnabled(true);
      } catch (e) {
        /* ignore */
      }
      P.state.grounded = true;
      P.state.jumping = false;
    }
  });
  // jump key next to a low obstacle -> vault instead of the plain jump: checked BEFORE the player controller's fixed
  // step (front of fixedHooks), so the controller sees the script and never starts the jump
  game.fixedHooks.unshift(function playerVaultInput() {
    if (game.ui?.paused || game.ui?.phoneOpen || S.move) return;
    if (
      game.input?.pressed?.('Space') &&
      (game.input?.down?.('KeyW') || (P.state.speed || 0) > 0.4 || game.playerVault.always)
    )
      tryVault();
  });
  game.playerVault = {
    tryVault,
    probe,
    probeCar,
    get active() {
      return !!S.move;
    },
    stats: S.stats,
  };
}
