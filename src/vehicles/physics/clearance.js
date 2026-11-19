// r2-physics: parked-car clearance (user shot_25: an SUV spawned on top of a picket fence).
//
// game.physics.clearForCar(x, z, heading, L, W, opts) -> { free, y, hits: [{ handle, tag, x, y, z }] }
//   Tests the car's footprint (L x W, inflated by opts.pad, default 0.25 m) from 0.22 m above the ground (clears the 0.15 m curb
//   and the road crown) up to opts.h (default 1.5 m) against EVERY collider: static (fences, walls, buildings, poles, props),
//   fixed / dynamic props and other cars. Sensors are ignored. opts.ignoreBody: a body to skip (the car itself when re-checking).
//   `free` is false as well when the ground colliders under the spot are not streamed in yet (try again later).
// game.physics.findCarSpot(x, z, heading, L, W, opts) -> { x, z, heading } | null
//   The nearest free spot to (x, z): slides along the car's own axis first (driveways, curbs), then sideways, up to opts.r (4 m).
// game.physics.watchParked(v) -> void
//   Re-checks a parked car 1.2 s and 4 s after it spawned (fences / props whose colliders streamed in after the car): if the
//   car stands on something (lifted > 0.18 m above its rest height on the ground, or tilted > 7 deg), it is moved to the
//   nearest free spot, or removed when there is none.
export function installClearance(game) {
  const { RAPIER, world } = game;
  if (!RAPIER || !world) return null;
  const QF = RAPIER.QueryFilterFlags;
  const P = (game.physics ||= {});
  const tagOf = (c) => {
    try {
      return (
        game.city?.colTags?.get?.(c.handle) ||
        c.parent()?.userData?.tag ||
        (c.parent()?.isDynamic?.() ? 'dynamic' : 'static')
      );
    } catch (e) {
      return '?';
    }
  };
  function groundAt(x, z, y0 = null) {
    const top = (y0 ?? game.city?.groundHeightAt?.(x, z) ?? 0) + 3;
    try {
      const h = world.castRay(
        new RAPIER.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }),
        8,
        true,
        QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS,
      );
      return h ? top - (h.timeOfImpact ?? h.toi) : null;
    } catch (e) {
      return null;
    }
  }
  function clearForCar(x, z, heading, L, W, opts = {}) {
    const pad = opts.pad ?? 0.25,
      H = opts.h ?? 1.5,
      lift = opts.lift ?? 0.22;
    if (game.city?.collidersReadyAt && !game.city.collidersReadyAt(x, z))
      return { free: false, y: null, hits: [], reason: 'ground not streamed' };
    // ground: highest of the 4 footprint corners + center (a car straddling a curb rests on the higher side)
    const c = Math.cos(heading),
      s = Math.sin(heading);
    let gy = -1e9,
      gyMin = 1e9;
    for (const [a, b] of [
      [0, 0],
      [W / 2, L / 2],
      [-W / 2, L / 2],
      [W / 2, -L / 2],
      [-W / 2, -L / 2],
    ]) {
      const g = groundAt(x + a * c + b * s, z - a * s + b * c, opts.y);
      if (g == null) continue;
      gy = Math.max(gy, g);
      gyMin = Math.min(gyMin, g);
    }
    if (!(gy > -1e8)) return { free: false, y: null, hits: [], reason: 'no ground' };
    const hy = (H - lift) / 2,
      cy = gy + lift + hy;
    const q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
    const shape = new RAPIER.Cuboid(W / 2 + pad, hy, L / 2 + pad);
    const hits = [];
    try {
      world.intersectionsWithShape(
        { x, y: cy, z },
        q,
        shape,
        (col) => {
          const p = col.translation();
          hits.push({
            handle: col.handle,
            tag: tagOf(col),
            x: +p.x.toFixed(2),
            y: +p.y.toFixed(2),
            z: +p.z.toFixed(2),
          });
          return hits.length < 8;
        },
        QF.EXCLUDE_SENSORS,
        undefined,
        undefined,
        opts.ignoreBody || undefined,
      );
    } catch (e) {
      return { free: false, y: gy, hits, reason: 'query busy' };
    }
    // a spot on a slope steeper than ~14 % across the footprint is no parking spot either (car would roll / sit on its sill)
    const steep = gy - gyMin > Math.max(0.35, 0.14 * Math.max(L, W));
    return {
      free: hits.length === 0 && !steep,
      y: gy,
      hits,
      reason: hits.length ? 'blocked' : steep ? 'steep' : '',
    };
  }
  function findCarSpot(x, z, heading, L, W, opts = {}) {
    const R = opts.r ?? 4,
      c = Math.cos(heading),
      s = Math.sin(heading);
    const cand = [[0, 0]];
    for (let d = 0.5; d <= R + 1e-6; d += 0.5) {
      cand.push([0, d], [0, -d]);
    }
    for (let d = 0.5; d <= Math.min(R, 2.5) + 1e-6; d += 0.5)
      for (const a of [0, 1, -1, 2, -2]) cand.push([d, a], [-d, a]);
    for (const [lat, lon] of cand) {
      const px = x + lat * c + lon * s,
        pz = z - lat * s + lon * c;
      const r = clearForCar(px, pz, heading, L, W, opts);
      if (r.free) return { x: px, z: pz, y: r.y, heading };
      if (r.reason === 'ground not streamed' || r.reason === 'query busy') return null;
    }
    return null;
  }
  const watch = new Set();
  function watchParked(v) {
    if (!v?.body) return;
    const t0 = game.clock?.elapsed ?? performance.now() / 1000;
    watch.add({ v, checks: [t0 + 1.2, t0 + 4], moved: 0 });
  }
  const UPV = { x: 0, y: 1, z: 0 };
  function check(w) {
    const v = w.v;
    if (!v.body || v.disposed || v.alive === false || v.playerDriven || v.everDriven) return true;
    const t = v.body.translation(),
      r = v.body.rotation();
    // body up vector
    const ux = 2 * (r.x * r.y - r.w * r.z),
      uy = 1 - 2 * (r.x * r.x + r.z * r.z),
      uz = 2 * (r.y * r.z + r.w * r.x);
    const tilt = (Math.acos(Math.max(-1, Math.min(1, uy))) * 180) / Math.PI;
    const g = groundAt(t.x, t.z, t.y - v.groundOff);
    const lifted = g == null ? 0 : t.y - v.groundOff - g;
    if (tilt < 7 && lifted < 0.18) return true;
    const sp = v.spec || {},
      h = v.heading ?? 0;
    const spot = findCarSpot(t.x, t.z, h, sp.L || 4.6, sp.W || 1.9, { ignoreBody: v.body, r: 5 });
    if (spot && w.moved < 2) {
      w.moved++;
      try {
        game.vehicles?.placeVehicle?.(v, { x: spot.x, y: spot.y, z: spot.z }, h);
      } catch (e) {
        /* */
      }
      console.info(
        `[r2-physics] parked ${v.typeKey} stood on something (tilt ${tilt.toFixed(1)} deg, lifted ${lifted.toFixed(2)} m) -> moved ${Math.hypot(spot.x - t.x, spot.z - t.z).toFixed(1)} m`,
      );
      (P.parkLog ||= []).push({
        key: v.typeKey,
        x: +t.x.toFixed(1),
        z: +t.z.toFixed(1),
        tilt: +tilt.toFixed(1),
        lifted: +lifted.toFixed(2),
        moved: true,
      });
      return false; // check again later
    }
    try {
      game.vehicles?.remove?.(v);
    } catch (e) {
      /* */
    }
    console.info(
      `[r2-physics] parked ${v.typeKey} stood on something and no free spot was near: removed`,
    );
    (P.parkLog ||= []).push({
      key: v.typeKey,
      x: +t.x.toFixed(1),
      z: +t.z.toFixed(1),
      tilt: +tilt.toFixed(1),
      lifted: +lifted.toFixed(2),
      removed: true,
    });
    return true;
  }
  game.updaters?.push?.(function parkedClearanceWatch() {
    if (!watch.size) return;
    const now = game.clock?.elapsed ?? performance.now() / 1000;
    for (const w of watch) {
      if (!w.checks.length) {
        watch.delete(w);
        continue;
      }
      if (now < w.checks[0]) continue;
      w.checks.shift();
      let done = true;
      try {
        done = check(w);
      } catch (e) {
        done = true;
      }
      if (done && !w.checks.length) watch.delete(w);
      else if (!done) w.checks.push(now + 1.5);
      break; // one check per frame
    }
  });
  Object.assign(P, { clearForCar, findCarSpot, watchParked, groundAt });
  void UPV;
  return P;
}
