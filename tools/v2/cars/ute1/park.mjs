// Nico's ute parking check: settled pose (upright, ground under it), distance to the nearest static collider around the car,
// shots: high front-left 3/4 + rear 3/4; PROBE=1 also maps the yard-sheet vs physics ground offset at the dock corner.
//   TAG=pk node tools/v2/cars/r2.mjs tools/v2/cars/ute1/park.mjs
const TAG = process.env.TAG || 'pk';
const FIND = `(game.vehicles.nicoCars || []).find((c) => c && c.typeKey === 'ute1')`;
const cam = (
  off,
) => `(() => { const T = game.THREE; const v = ${FIND}; window.__cv = v; const off = new T.Vector3(${off.join(',')});
  game.cameraOverride = (dt, c) => { const m = window.__cv.mesh; c.position.copy(off.clone().applyQuaternion(m.quaternion).add(m.position)); c.lookAt(m.position.x, m.position.y + 0.8, m.position.z); if (c.fov !== 45) { c.fov = 45; c.updateProjectionMatrix(); } return true; }; return 1; })()`;
const steps = [
  {
    eval: `(() => { game.timeOfDay = 16.5; game.teleport(-866.1, undefined, 4836.4, 2.6); return 1; })()`,
    sleep: 22000,
  },
  {
    log: 'pose',
    eval: `(() => { const v = ${FIND}; if (!v) return 'missing'; const T = game.THREE, R = game.RAPIER, W = game.world, NH = game.nicoHouse;
    const up = new T.Vector3(0, 1, 0).applyQuaternion(v.mesh.quaternion), p = v.mesh.position;
    const inv = new T.Matrix4().copy(NH.group.matrixWorld).invert(), loc = p.clone().applyMatrix4(inv);
    const h = W.castRay(new R.Ray({ x: p.x, y: p.y + 3, z: p.z }, { x: 0, y: -1, z: 0 }), 10, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS);
    // nearest static collider (not the ground) to a 2.5 m inflated car box
    const sh = new R.Cuboid(1.9 / 2 + 2.5, 0.5, 5.07 / 2 + 2.5), q = v.mesh.quaternion; const hits = [];
    W.intersectionsWithShape({ x: p.x, y: p.y + 0.7, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }, sh, (c) => { const b = c.parent(); if (b && !b.isFixed()) return true; const t = c.translation(); hits.push([+(t.x - p.x).toFixed(1), +(t.y - p.y).toFixed(1), +(t.z - p.z).toFixed(1), c.shape.type]); return true; }, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS);
    const tw = NH.toWorld(new T.Vector3(-1.3, 0, 7.5));
    return JSON.stringify({ target: [+tw.x.toFixed(2), +tw.z.toFixed(2)], world: [+p.x.toFixed(2), +p.z.toFixed(2)], spot: NH.spot, local: [+loc.x.toFixed(2), +loc.y.toFixed(2), +loc.z.toFixed(2)], up: +up.y.toFixed(3), clear: p.y + 3 - (h ? h.timeOfImpact : 99), meshY: +p.y.toFixed(2), near: hits.slice(0, 12) }); })()`,
  },
  { eval: cam([3.6, 3.3, 4.2]), sleep: 1800 },
  { shot: `docs/v2/shots/cars/ute1/${TAG}_side34.png` },
  { eval: cam([-3.2, 3.0, -6.0]), sleep: 1800 },
  { shot: `docs/v2/shots/cars/ute1/${TAG}_rear34.png` },
];
if (process.env.PROBE)
  steps.push({
    log: 'dock',
    eval: `(() => { const NH = game.nicoHouse, T = game.THREE, R = game.RAPIER, W = game.world; const out = [];
  for (let x = 4; x <= 26; x += 1) for (let z = -22; z <= -2; z += 1) { const yv = NH.house.yardY(x, z), w = NH.toWorld(new T.Vector3(x, yv, z));
    const h = W.castRay(new R.Ray({ x: w.x, y: w.y + 6, z: w.z }, { x: 0, y: -1, z: 0 }), 20, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS);
    const py = h ? w.y + 6 - h.timeOfImpact : null; if (py == null || w.y - py > 0.25) out.push([x, z, +yv.toFixed(2), py == null ? null : +(w.y - py).toFixed(2)]); }
  return JSON.stringify(out); })()`,
  });
export default steps;
