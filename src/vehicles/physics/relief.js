// r2-physics: road relief that has no collider triangles, felt by the car tires (carphys 2).
//
// Potholes are drawn by the road decal shader as a parallax dip (src/world/ground/decalMaterial.js: a noise-shaped bowl,
// 3-7 cm deep). Carving that into the road trimesh would mean re-triangulating every ribbon; instead the tire contact
// adds the SAME bowl (this file ports the shader's depth function: dH1 / dN / dBlob, depth D from the world cell) to the
// swept wheel contact, so the wheel drops into exactly the hole you see and climbs out over its broken rim.
//   - pothole (decal cell 2): bowl depth D * (1 - smoothstep(0.42, 0.66, e)) * (0.82 + 0.18 n), D = 3.5..7 cm
//   - patched pothole (cell 3): 8 mm sunken patch inside the blob, the tar seam ring a little lower
//   - manhole / meter covers (library covers, cell 4/5 decals): 6 mm low iron seat with a 1 cm ring gap
// The tire bridges small dips: the depth is sampled at the contact and 0.14 m ahead / behind along the heading and the
// shallowest of the three counts, capped by the chord sag of the tire over the hole width (r - sqrt(r^2 - (w/2)^2)).
//
// Registry: tilebuild's decal() reports every pothole / patch / cover it draws (globalThis.__r2Relief?.add(...)), keyed by
// its rounded position, so re-built tiles never double one. game.physics.relief(x, z, r, fw, surf) -> dip (m, > 0 = lower).
// game.physics.addRelief({ kind: 'pothole'|'patched'|'cover'|'bump', x, z, ax, az, len, wid, D? }) for hand-placed ones
// (tests, set pieces); kind 'bump' is a raised hump (speed bump, D = height, negative dip).
const cells = new Map(),
  keys = new Set(),
  CELL = 8;
let count = 0;
const fract = (x) => x - Math.floor(x);
const dH1 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function dN(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = x - ix,
    fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = dH1(ix, iy),
    b = dH1(ix + 1, iy),
    c = dH1(ix, iy + 1),
    d = dH1(ix + 1, iy + 1);
  return a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fy;
}
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// shader dBlob(lc, w, rough): lc = decal-local 0..1 coords, w = world xz
function dBlob(lx, ly, wx, wz, rough) {
  const qx = (lx - 0.5) * 2,
    qy = (ly - 0.5) * 2,
    r = Math.hypot(qx, qy),
    a = Math.atan2(qy, qx);
  const lobe =
    Math.sin(a * 3 + dH1(Math.floor(wx * 0.2), Math.floor(wz * 0.2)) * 6) * 0.07 +
    Math.sin(a * 5 + 1.3) * 0.04;
  return (
    r +
    lobe +
    (dN(wx * 1.15, wz * 1.15) - 0.5) * 0.42 * rough +
    (dN(wx * 3.7 + 5.1, wz * 3.7 + 5.1) - 0.5) * 0.16 * rough +
    (dN(wx * 11, wz * 11) - 0.5) * 0.05
  );
}
function add(e) {
  const k = `${e.kind}:${Math.round(e.x * 4)}:${Math.round(e.z * 4)}`;
  if (keys.has(k)) return false;
  keys.add(k);
  count++;
  const len = e.len || 1.4,
    wid = e.wid || len,
    R = Math.max(len, wid) / 2;
  const rec = { ...e, len, wid, R, bx: -(e.az ?? 1), bz: e.ax ?? 0, ax: e.ax ?? 0, az: e.az ?? 1 };
  if (rec.kind === 'pothole' && rec.D == null)
    rec.D = 0.035 + 0.035 * dH1(Math.floor(e.x * 0.5) + 3.3, Math.floor(e.z * 0.5) + 3.3);
  const c0x = Math.floor((e.x - R) / CELL),
    c1x = Math.floor((e.x + R) / CELL),
    c0z = Math.floor((e.z - R) / CELL),
    c1z = Math.floor((e.z + R) / CELL);
  for (let cx = c0x; cx <= c1x; cx++)
    for (let cz = c0z; cz <= c1z; cz++) {
      const ck = cx + ',' + cz;
      let L = cells.get(ck);
      if (!L) cells.set(ck, (L = []));
      L.push(rec);
    }
  return true;
}
// dip of one record at world (x, z): > 0 lower, < 0 raised
function dipOf(rec, x, z) {
  const dx = x - rec.x,
    dz = z - rec.z;
  if (dx * dx + dz * dz > rec.R * rec.R * 1.1) return 0;
  const da = dx * rec.ax + dz * rec.az,
    db = dx * rec.bx + dz * rec.bz;
  const lx = 0.5 + db / rec.wid,
    ly = 0.5 - da / rec.len;
  if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return 0;
  switch (rec.kind) {
    case 'pothole': {
      const e = dBlob(lx, ly, x, z, 1);
      return rec.D * (1 - smooth(0.42, 0.66, e)) * (0.82 + 0.18 * dN(x * 6, z * 6));
    }
    case 'patched': {
      const e = dBlob(lx, ly, x, z, 0.8);
      const inside = 1 - smooth(0.8, 0.9, e),
        seam = smooth(0.74, 0.81, e) * (1 - smooth(0.84, 0.9, e));
      return 0.008 * inside + 0.004 * seam;
    }
    case 'cover': {
      const r = Math.hypot(lx - 0.5, ly - 0.5) * 2;
      return r < 0.74 ? 0.006 : r < 0.8 ? 0.012 : 0;
    }
    case 'bump': {
      // speed hump: smooth cosine across its length (along ax), flat across
      const u = Math.abs(da) / (rec.len / 2);
      return u < 1 && Math.abs(db) < rec.wid / 2
        ? -(rec.D || 0.08) * 0.5 * (1 + Math.cos(Math.PI * u))
        : 0;
    }
    default:
      return 0;
  }
}
function dipAt(x, z) {
  const L = cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!L) return 0;
  let d = 0;
  for (const rec of L) {
    const v = dipOf(rec, x, z);
    if (Math.abs(v) > Math.abs(d)) d = v;
  }
  return d;
}
export function relief(x, z, r = 0.33, fw = null) {
  const L = cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  if (!L) return 0;
  const d0 = dipAt(x, z);
  if (!fw) return d0;
  const s = 0.14,
    fx = fw.x * s,
    fz = fw.z * s;
  const d1 = dipAt(x + fx, z + fz),
    d2 = dipAt(x - fx, z - fz);
  if (d0 < 0 || d1 < 0 || d2 < 0) return Math.min(d0, d1, d2); // raised: the highest point carries the tire
  let d = Math.min(d0, d1, d2);
  // chord sag: a tire of radius r can only sink r - sqrt(r^2 - (w/2)^2) into a hole w wide
  for (const rec of L) {
    const w = Math.min(rec.len, rec.wid) * 0.62;
    if (Math.hypot(x - rec.x, z - rec.z) < rec.R)
      d = Math.min(d, r - Math.sqrt(Math.max(0, r * r - (w / 2) ** 2)));
  }
  return Math.max(0, d);
}
export function installRelief(game) {
  const P = (game.physics ||= {});
  P.relief = relief;
  P.addRelief = add;
  P.reliefDip = dipAt;
  P.reliefStats = () => ({ count, cells: cells.size });
  P.reliefNear = (x, z, rad = 30) => {
    const out = [];
    const seen = new Set();
    for (let cx = Math.floor((x - rad) / CELL); cx <= Math.floor((x + rad) / CELL); cx++)
      for (let cz = Math.floor((z - rad) / CELL); cz <= Math.floor((z + rad) / CELL); cz++)
        for (const r0 of cells.get(cx + ',' + cz) || [])
          if (!seen.has(r0) && Math.hypot(r0.x - x, r0.z - z) < rad) {
            seen.add(r0);
            out.push({
              kind: r0.kind,
              x: +r0.x.toFixed(2),
              z: +r0.z.toFixed(2),
              len: r0.len,
              D: r0.D,
            });
          }
    return out;
  };
  // tilebuild's decal() hook (cell ids from tilebuild DEC): 2 pothole, 3 patched pothole, 4 manhole, 5 meter cover
  globalThis.__r2Relief = {
    add: (cell, x, z, ax, az, len, wid) =>
      add({
        kind: cell === 2 ? 'pothole' : cell === 3 ? 'patched' : 'cover',
        x,
        z,
        ax,
        az,
        len,
        wid,
      }),
  };
  for (const a of globalThis.__r2ReliefQ || []) globalThis.__r2Relief.add(...a); // tiles built before this module loaded
  globalThis.__r2ReliefQ = null;
  return P;
}
