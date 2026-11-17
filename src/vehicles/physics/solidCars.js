// r2-physics: a person never moves a car (user: "when walking into cars they move. That's not how it works IRL").
// The player's character controller applies impulses to the dynamic bodies it walks into (so bins, cones and chairs can be
// shoved). Cars are dynamic bodies too, so walking or sprinting into a parked car nudged it. Rapier's character controller has
// no per-body filter for that impulse path, so every computeColliderMovement call is wrapped: the velocities of the cars near
// the moving collider are recorded before and put back after, and a car that was asleep is put back to sleep. The car still
// blocks the character (it is still a collider in the query), so walking into it feels like walking into a wall, and sliding
// along it works as before. Push props are not vehicles and keep being pushed. Off: game.physics.solidCars = false.
export function installSolidCars(game) {
  const R = game.RAPIER, P = (game.physics ||= {});
  const KCC = R?.KinematicCharacterController;
  if (!KCC || KCC.prototype.__r2Solid) return false;
  const orig = KCC.prototype.computeColliderMovement;
  const snap = [];
  KCC.prototype.computeColliderMovement = function (collider, desired, ...rest) {
    if (P.solidCars === false) return orig.call(this, collider, desired, ...rest);
    let n = 0;
    try {
      const c = collider.translation(), list = game.vehicles?.list || [];
      const reach = 4 + Math.hypot(desired.x, desired.z);
      for (let i = 0; i < list.length; i++) {
        const v = list[i], b = v.body; if (!b || v.playerDriven || v.ghost) continue;
        const t = b.translation(), dx = t.x - c.x, dz = t.z - c.z, rr = reach + (v.spec?.L || 5) / 2;
        if (dx * dx + dz * dz > rr * rr) continue;
        const lv = b.linvel(), av = b.angvel();
        const s = snap[n] || (snap[n] = { b: null, lx: 0, ly: 0, lz: 0, ax: 0, ay: 0, az: 0, sleep: false });
        s.b = b; s.lx = lv.x; s.ly = lv.y; s.lz = lv.z; s.ax = av.x; s.ay = av.y; s.az = av.z; s.sleep = b.isSleeping(); n++;
      }
    } catch (e) { n = 0; }
    const r = orig.call(this, collider, desired, ...rest);
    for (let i = 0; i < n; i++) {
      const s = snap[i];
      try {
        const lv = s.b.linvel(), av = s.b.angvel();
        if (lv.x !== s.lx || lv.y !== s.ly || lv.z !== s.lz || av.x !== s.ax || av.y !== s.ay || av.z !== s.az) {
          s.b.setLinvel({ x: s.lx, y: s.ly, z: s.lz }, false); s.b.setAngvel({ x: s.ax, y: s.ay, z: s.az }, false);
          P.solidCarsBlocked = (P.solidCarsBlocked || 0) + 1;
        }
        if (s.sleep && !s.b.isSleeping()) s.b.sleep();
      } catch (e) { /* body removed meanwhile */ }
      s.b = null;
    }
    return r;
  };
  KCC.prototype.__r2Solid = true;
  if (P.solidCars == null) P.solidCars = true;
  return true;
}
