// r2-physics: a person never moves a car (user: "when walking into cars they move. That's not how it works IRL").
// The player's character controller applies impulses to the dynamic bodies it walks into (so bins, cones and chairs can be
// shoved). Cars are dynamic bodies too, so walking or sprinting into a parked car nudged it. Rapier's character controller has
// no per-body filter for that impulse path, so every computeColliderMovement call is wrapped: the velocities of the cars near
// the moving collider are recorded before and put back after, and a car that was asleep is put back to sleep. The car still
// blocks the character (it is still a collider in the query), so walking into it feels like walking into a wall, and sliding
// along it works as before. Push props are not vehicles and keep being pushed. Off: game.physics.solidCars = false.
export function installSolidCars(game) {
  const R = game.RAPIER,
    P = (game.physics ||= {});
  const KCC = R?.KinematicCharacterController;
  if (!KCC || KCC.prototype.__r2Solid) return false;
  const orig = KCC.prototype.computeColliderMovement;
  const snap = [];
  KCC.prototype.computeColliderMovement = function (collider, desired, ...rest) {
    if (P.solidCars === false) return orig.call(this, collider, desired, ...rest);
    let n = 0;
    try {
      const c = collider.translation(),
        list = game.vehicles?.list || [];
      const reach = 4 + Math.hypot(desired.x, desired.z);
      for (let i = 0; i < list.length; i++) {
        const v = list[i],
          b = v.body;
        if (!b || v.playerDriven || v.ghost) continue;
        const t = b.translation(),
          dx = t.x - c.x,
          dz = t.z - c.z,
          rr = reach + (v.spec?.L || 5) / 2;
        if (dx * dx + dz * dz > rr * rr) continue;
        const lv = b.linvel(),
          av = b.angvel();
        const s =
          snap[n] ||
          (snap[n] = { b: null, lx: 0, ly: 0, lz: 0, ax: 0, ay: 0, az: 0, sleep: false });
        s.b = b;
        s.lx = lv.x;
        s.ly = lv.y;
        s.lz = lv.z;
        s.ax = av.x;
        s.ay = av.y;
        s.az = av.z;
        s.sleep = b.isSleeping();
        n++;
      }
    } catch (e) {
      n = 0;
    }
    const r = orig.call(this, collider, desired, ...rest);
    for (let i = 0; i < n; i++) {
      const s = snap[i];
      try {
        const lv = s.b.linvel(),
          av = s.b.angvel();
        if (
          lv.x !== s.lx ||
          lv.y !== s.ly ||
          lv.z !== s.lz ||
          av.x !== s.ax ||
          av.y !== s.ay ||
          av.z !== s.az
        ) {
          s.b.setLinvel({ x: s.lx, y: s.ly, z: s.lz }, false);
          s.b.setAngvel({ x: s.ax, y: s.ay, z: s.az }, false);
          P.solidCarsBlocked = (P.solidCarsBlocked || 0) + 1;
        }
        if (s.sleep && !s.b.isSleeping()) s.b.sleep();
      } catch (e) {
        /* body removed meanwhile */
      }
      s.b = null;
    }
    return r;
  };
  KCC.prototype.__r2Solid = true;
  // a sleeping parked car next to a person is woken by the kinematic capsule's contact (island wake-up), and one awake step of
  // its suspension settles it by ~0.5-1.3 mm. A parked car (nobody driving, no AI) that only a person is touching keeps the pose
  // it slept in: woken without a real force (slow, no car near it), it is put back exactly and sent back to sleep.
  const rest = new WeakMap();
  game.fixedHooks?.push?.(function solidParked() {
    if (P.solidCars === false) return;
    const pp = game.player?.position,
      list = game.vehicles?.list;
    if (!pp || !list) return;
    for (const v of list) {
      const b = v.body;
      if (!b || v.playerDriven || v.ai || v.ghost || v.frozen || v.disabled) continue;
      let t;
      try {
        t = b.translation();
      } catch (e) {
        continue;
      }
      const dx = t.x - pp.x,
        dz = t.z - pp.z,
        near = dx * dx + dz * dz < 36;
      if (b.isSleeping()) {
        if (near) {
          const r = b.rotation();
          rest.set(v, { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w });
        }
        continue;
      }
      const R = rest.get(v);
      if (!R || !near) continue;
      const lv = b.linvel();
      if (lv.x * lv.x + lv.y * lv.y + lv.z * lv.z > 0.04) {
        rest.delete(v);
        continue;
      } // a real push (car, blast)
      let other = false;
      for (const o of list) {
        if (o === v || !o.body) continue;
        const ot = o.body.translation();
        if ((ot.x - t.x) ** 2 + (ot.z - t.z) ** 2 < 49) {
          other = true;
          break;
        }
      }
      if (other || (v.hitCd || 0) > 0) {
        rest.delete(v);
        continue;
      }
      b.setTranslation({ x: R.x, y: R.y, z: R.z }, false);
      b.setRotation({ x: R.qx, y: R.qy, z: R.qz, w: R.qw }, false);
      b.setLinvel({ x: 0, y: 0, z: 0 }, false);
      b.setAngvel({ x: 0, y: 0, z: 0 }, false);
      b.sleep();
      P.solidCarsReseated = (P.solidCarsReseated || 0) + 1;
    }
  });
  if (P.solidCars == null) P.solidCars = true;
  return true;
}
