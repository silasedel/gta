// Southline — stair treads for foot placement. Stair colliders are smooth ramps through the tread nosings (so the capsule
// climbs without snagging); the feet must land on the real treads instead. A flight is
//   { o: world top point (center of the flight width at the top nosing), dir: unit downhill (x, z), side: unit across,
//     w: width, n: treads, rise, run, yTop }
// tread i (1..n) spans t = run*(i-1) .. run*i from the top along dir, surface y = yTop - rise*i; past the last tread is
// the next level (yTop - rise*(n+1)). treadAt(x, z, yHint) -> surface y or null when no flight is under the point.
// Sources: game.stairs (any module may push flights) + Nico's house (from its plan, until the house exports its own).
import * as THREE from 'three';
import { PLAN } from '../../world/setpieces/nicoHouse/plan.js';

const _v = new THREE.Vector3();
function houseFlights(game) {
  const H = game?.nicoHouse;
  if (!H?.group || !H.toWorld) return [];
  if (H.stairs) return H.stairs; // the house's own export wins when it exists
  const P = PLAN,
    Lw = P.stairW.landing,
    T = P.stairN.top;
  // the same flight calls as src/world/setpieces/nicoHouse/parts/10_structure.js (house-local)
  const local = [
    { x: -8.6, z: 3.6, y: P.F, dir: [-1, 0], n: 7, w: P.stairW.w },
    { x: (Lw.x0 + Lw.x1) / 2, z: Lw.z1, y: Lw.y, dir: [0, 1], n: 7, w: P.stairW.w },
    { x: T.x0, z: (T.z0 + T.z1) / 2 - 0.03, y: P.F, dir: [-1, 0], n: 15, w: P.stairN.w },
  ];
  H.group.updateMatrixWorld(true);
  const q = H.group.getWorldQuaternion(new THREE.Quaternion());
  return local.map((f) => {
    const o = H.toWorld(_v.set(f.x, f.y, f.z));
    const d = new THREE.Vector3(f.dir[0], 0, f.dir[1]).applyQuaternion(q).setY(0).normalize();
    return {
      o: o.clone(),
      dir: d,
      side: new THREE.Vector3(-d.z, 0, d.x),
      w: f.w,
      n: f.n,
      rise: P.rise,
      run: P.run,
      yTop: o.y,
    };
  });
}

export function createStairs(game) {
  let flights = null,
    t = 0;
  const all = () => {
    if (!flights || (t -= 1) <= 0) {
      t = 120;
      flights = [...houseFlights(game), ...(game?.stairs || [])];
    }
    return flights;
  };
  return {
    flights: all,
    treadAt(x, z, yHint = null) {
      for (const f of all()) {
        const dx = x - f.o.x,
          dz = z - f.o.z;
        const along = dx * f.dir.x + dz * f.dir.z,
          across = dx * f.side.x + dz * f.side.z;
        if (Math.abs(across) > f.w / 2 + 0.05 || along < -0.02 || along > f.run * (f.n + 0.5))
          continue;
        const i = Math.min(f.n + 1, Math.max(1, Math.ceil(along / f.run)));
        const y = f.yTop - f.rise * i;
        if (yHint !== null && Math.abs(y - yHint) > 0.6) continue;
        return y;
      }
      return null;
    },
  };
}
