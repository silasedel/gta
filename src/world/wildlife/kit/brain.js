// Wildlife kit: shared behavior helpers for ground and surface animals (movement, threats, road sense).
// Heading 0 faces +Z; forward = (sin h, 0, cos h); set creature.group.rotation.y = heading.

export const fwd = (h, out) => {
  out.x = Math.sin(h);
  out.z = Math.cos(h);
  return out;
};
export const headingTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
export const angDiff = (a, b) => {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
};

// Position + heading integrator that follows the ground (or the water surface).
export class Mover {
  constructor(THREE, x, y, z, heading = 0) {
    this.pos = new THREE.Vector3(x, y, z);
    this.heading = heading;
    this.speed = 0;
    this.vy = 0;
    this.inWater = false;
    this.blocked = 0;
  }
  // Steer toward (tx, tz) and move at `speed`. Returns the remaining distance.
  // opts: turn (rad/s), accel (m/s^2), swim: true = may enter water (floats at the surface, `draft` below it),
  //       stepMax: refuses ledges higher than this (walls, seawalls), hover: stay this high above the ground.
  seek(
    dt,
    world,
    tx,
    tz,
    speed,
    { turn = 5, accel = 8, swim = false, stepMax = 0.45, draft = 0.05, hover = 0 } = {},
  ) {
    const p = this.pos,
      dx = tx - p.x,
      dz = tz - p.z,
      dist = Math.hypot(dx, dz);
    if (dist > 1e-3) {
      const want = Math.atan2(dx, dz),
        d = angDiff(want, this.heading),
        step = turn * dt;
      this.heading += Math.abs(d) < step ? d : Math.sign(d) * step;
    }
    const facing =
      dist > 1e-3 ? Math.max(0, Math.cos(angDiff(Math.atan2(dx, dz), this.heading))) : 1;
    const target = dist < 0.05 ? 0 : speed * (0.25 + 0.75 * facing);
    this.speed += Math.max(-accel * dt, Math.min(accel * dt, target - this.speed));
    const st = Math.min(dist, this.speed * dt),
      nx = p.x + Math.sin(this.heading) * st,
      nz = p.z + Math.cos(this.heading) * st;
    const g0 = world.groundY(p.x, p.z),
      g1 = world.groundY(nx, nz),
      wet = world.isWater(nx, nz) && world.waterDepth(nx, nz) > draft + 0.05;
    if ((wet && !swim) || (!wet && g1 - Math.max(g0, p.y - hover) > stepMax)) {
      this.blocked += dt;
      this.speed *= 0.5;
    } else {
      this.blocked = 0;
      p.x = nx;
      p.z = nz;
    }
    this.settle(dt, world, { draft, hover });
    return Math.hypot(tx - p.x, tz - p.z);
  }
  // keep the feet on the ground / body at the surface without moving horizontally
  settle(dt, world, { draft = 0.05, hover = 0 } = {}) {
    const p = this.pos,
      g = world.groundY(p.x, p.z),
      d = world.waterDepth(p.x, p.z);
    this.inWater = d > draft + 0.05;
    const ty = this.inWater ? world.seaLevel - draft : g + hover;
    p.y += (ty - p.y) * Math.min(1, dt * 12);
  }
}

// Nearest thing worth reacting to. dist = { player, run (player sprinting), ped, car, boat, dog, shot } trigger radii.
// Returns null or { kind, from: Vector3, dist, urgency 0..1, t: threat }.
export function threatCheck(world, pos, r = {}) {
  const R = {
    player: 4,
    run: 8,
    ped: 3,
    car: 7,
    boat: 12,
    dog: 9,
    gunshot: 60,
    explosion: 90,
    ...r,
  };
  let best = null;
  for (const t of world.threats) {
    const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) - (t.radius || 0);
    let lim = R[t.kind] ?? 4;
    const sp = t.vel ? Math.hypot(t.vel.x, t.vel.z) : 0;
    if (t.kind === 'player' && sp > 4.5) lim = R.run;
    if ((t.kind === 'car' || t.kind === 'boat') && sp < 1) lim *= 0.35; // parked or idling: barely a threat
    if (d < lim) {
      const u = 1 - d / lim;
      if (!best || u > best.urgency) best = { kind: t.kind, from: t.pos, dist: d, urgency: u, t };
    }
  }
  return best;
}

// Will a moving vehicle pass close to `pos` soon? Returns null or { t: threat, ttc (s), miss (m), side: +1/-1 = which
// side of the vehicle's path the animal is on (run that way to get clear) }.
export function carDanger(world, pos, { horizon = 2.5, width = 1.8 } = {}) {
  let best = null;
  for (const t of world.threats) {
    if (t.kind !== 'car' && t.kind !== 'boat') continue;
    const vx = t.vel?.x || 0,
      vz = t.vel?.z || 0,
      sp = Math.hypot(vx, vz);
    if (sp < 1.5) continue;
    const rx = pos.x - t.pos.x,
      rz = pos.z - t.pos.z,
      along = (rx * vx + rz * vz) / sp;
    if (along < -2) continue;
    const ttc = along / sp,
      cross = (rx * vz - rz * vx) / sp;
    if (ttc < horizon && Math.abs(cross) < width + (t.radius || 1)) {
      if (!best || ttc < best.ttc)
        best = {
          t,
          ttc,
          miss: Math.abs(cross),
          side: cross >= 0 ? 1 : -1,
          dir: [vx / sp, vz / sp],
        };
    }
  }
  return best;
}

// random dry (or wet) point near a home position: [x, z] or null
export function pickPoint(
  world,
  hx,
  hz,
  radius,
  { water = false, road = false, tries = 12, minR = 0 } = {},
) {
  for (let i = 0; i < tries; i++) {
    const a = world.rand() * 6.2832,
      r = minR + (radius - minR) * Math.sqrt(world.rand()),
      x = hx + Math.cos(a) * r,
      z = hz + Math.sin(a) * r;
    if (world.isWater(x, z) !== water) continue;
    if (!road && world.onRoad(x, z)) continue;
    return [x, z];
  }
  return null;
}

// Find where a road ends on the far side, starting at (x, z) heading in direction `h`. Returns [x, z] or null.
export function farSideOfRoad(world, x, z, h, maxDist = 40) {
  const sx = Math.sin(h),
    sz = Math.cos(h);
  let entered = false;
  for (let d = 0.5; d < maxDist; d += 0.5) {
    const on = world.onRoad(x + sx * d, z + sz * d);
    if (on) entered = true;
    else if (entered) {
      const e = d + 1.2;
      if (world.isWater(x + sx * e, z + sz * e)) return null;
      return [x + sx * e, z + sz * e];
    }
  }
  return null;
}
