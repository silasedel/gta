// Shop frontage (shops pass, Nov 17): every storefront faces its street over paving, never straight onto a lawn.
// For each storefront lot (DATA or synthetic) whose door side has no raised sidewalk, this lays a flush concrete forecourt from
// the facade to the road edge; when the road is far, a 2.4 m concrete walk along the shop plus an asphalt parking strip with
// painted stalls and wheel stops runs out to the street. The slabs go into the tile's own sidewalk / parking / marks batches,
// so they join the ground mask as 'paved' (no grass or shrubs on them, soft shoulder blend into the lawn) and the lawn index.
//   shopAprons(list, B, env) -> [{ rings }] (the paved footprints, for the tile's lawn index)
//   env: { roadDist(x, z) (m to the nearest road edge), onSidewalk(x, z), isWater(x, z), fillPoly, THREE }
const Y_PAVE = 0.03,
  Y_MARK = 0.046,
  WALK = 2.4,
  MAX_REACH = 32,
  NO_ROAD = 6.5;

function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function shopAprons(list, B, env) {
  const { roadDist, onSidewalk, isWater, fillPoly, THREE } = env,
    out = [];
  if (!roadDist || !list || !list.length || !B.sidewalk) return out;
  const white = new THREE.Color(0xf2efe6),
    stop = new THREE.Color(0xb9b4aa),
    pave = new THREE.Color(0xe6e0d4);
  const seen = new Set();
  for (const f of list) {
    if (!f || f.y > 0.5) continue; // upper-level / deck lots
    const fx = f.fx ?? f.x,
      fz = f.fz ?? f.z,
      key = Math.round(fx * 2) + ',' + Math.round(fz * 2);
    if (seen.has(key)) continue;
    seen.add(key);
    const fc = f.facing || 0,
      ox = Math.sin(fc),
      oz = Math.cos(fc),
      rx = -oz,
      rz = ox,
      hw = Math.max(3, (f.w || 6) / 2 + 1.1);
    const at = (u, d) => [fx + rx * u + ox * d, fz + rz * u + oz * d];
    let uL = -hw,
      uR = hw; // close the grass gap to a neighboring shop on the same frontage (one continuous paved front)
    for (const g of list) {
      if (g === f || !g || Math.abs((((g.facing || 0) - fc + 9.42478) % 6.28319) - 3.14159) > 0.12)
        continue;
      const gx = (g.fx ?? g.x) - fx,
        gz = (g.fz ?? g.z) - fz,
        u = gx * rx + gz * rz,
        v = gx * ox + gz * oz,
        gh = Math.max(3, (g.w || 6) / 2 + 1.1);
      if (Math.abs(v) > 1.5 || Math.abs(u) > hw + gh + 9) continue;
      if (u > 0) uR = Math.max(uR, Math.min(u - gh + 0.05, hw + 4.5));
      else uL = Math.min(uL, Math.max(u + gh - 0.05, -hw - 4.5));
    }
    // already on a raised sidewalk / plaza: nothing to do
    if (onSidewalk) {
      let n = 0;
      for (const u of [-hw * 0.6, 0, hw * 0.6]) {
        const p = at(u, 1.2);
        if (onSidewalk(p[0], p[1])) n++;
      }
      if (n >= 2) continue;
    }
    // march out from the facade until a road edge (or water) is reached under any of three lateral samples
    let ext = 0,
      road = false;
    for (let d = 0.5; d <= MAX_REACH; d += 0.5) {
      let hit = false;
      for (const u of [-hw + 0.2, 0, hw - 0.2]) {
        const p = at(u, d);
        if (roadDist(p[0], p[1]) < 0.35 || (isWater && isWater(p[0], p[1]))) {
          hit = true;
          break;
        }
      }
      if (hit) {
        road = true;
        break;
      }
      ext = d;
    }
    if (!road) ext = Math.min(ext, NO_ROAD);
    ext = Math.max(0, ext - 0.15);
    if (ext < 1.2) continue;
    const clear = (u) => {
      for (const d of [0.5, ext * 0.5, ext]) {
        const p = at(u, d);
        if (roadDist(p[0], p[1]) < 0.35 || (isWater && isWater(p[0], p[1]))) return false;
      }
      return true;
    }; // the joined strip never runs onto a side street
    while (uR > hw && !clear(uR)) uR = Math.max(hw, uR - 0.5);
    while (uL < -hw && !clear(uL)) uL = Math.min(-hw, uL + 0.5);
    const h = hash(Math.round(fx * 7) * 31 + Math.round(fz * 5));
    const rect = (d0, d1, u0 = uL, u1 = uR) => {
      const a = at(u0, d0),
        b = at(u1, d0),
        c = at(u1, d1),
        e = at(u0, d1);
      return [a, b, c, e];
    };
    const walk = Math.min(ext, ext > 8 ? WALK + h * 0.6 : ext);
    const ringW = rect(0.02, walk);
    fillPoly(B.sidewalk, [ringW], Y_PAVE, pave, 1 / 2.5);
    out.push({ rings: [ringW] });
    if (ext > walk + 0.5 && (B.parking || B.asphalt)) {
      // parking strip out to the street
      const lot = B.parking || B.asphalt,
        ringP = rect(walk, ext);
      fillPoly(lot, [ringP], Y_PAVE - 0.004, 0xd8d8d8, 1 / 3);
      out.push({ rings: [ringP] });
      // curb line between walk and lot (a thin raised concrete strip reads as the walk's edge)
      quad(
        B.sidewalk,
        at(uL, walk - 0.12),
        at(uR, walk - 0.12),
        at(uR, walk + 0.02),
        at(uL, walk + 0.02),
        Y_PAVE + 0.012,
        stop,
      );
      const depth = ext - walk;
      if (depth >= 5 && B.marks) {
        // head-in stalls (2.7 m) perpendicular to the shop front, faded paint, concrete wheel stops
        const sl = Math.min(5.4, depth - 0.3),
          n = Math.floor((hw * 2 - 0.4) / 2.7),
          u0 = (-n * 2.7) / 2,
          fade = white.clone().lerp(new THREE.Color(0x9a958c), 0.25 + h * 0.3);
        for (let k = 0; k <= n; k++) {
          const u = u0 + k * 2.7;
          quad(
            B.marks,
            at(u - 0.06, walk + 0.4),
            at(u + 0.06, walk + 0.4),
            at(u + 0.06, walk + sl),
            at(u - 0.06, walk + sl),
            Y_MARK,
            fade,
          );
        }
        for (let k = 0; k < n; k++) {
          if (hash(k * 13 + Math.round(fx)) < 0.25) continue;
          const u = u0 + (k + 0.5) * 2.7;
          box(
            B.sidewalk,
            at(u - 0.8, walk + 0.75),
            at(u + 0.8, walk + 0.75),
            at(u + 0.8, walk + 0.95),
            at(u - 0.8, walk + 0.95),
            Y_PAVE,
            Y_PAVE + 0.12,
            stop,
          );
        }
      }
    }
  }
  return out;
}
function quad(batch, a, b, c, d, y, col) {
  for (const [p, q, r] of [
    [a, b, c],
    [a, c, d],
  ]) {
    const ny = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
    for (const v of ny >= 0 ? [p, q, r] : [p, r, q])
      batch.vert(v[0], y, v[1], 0, 1, 0, v[0] * 0.4, v[1] * 0.4, col);
  }
}
function box(batch, a, b, c, d, y0, y1, col) {
  // low block (wheel stop): top + 4 sides (both windings: a few triangles, no culling surprises)
  quad(batch, a, b, c, d, y1, col);
  const P = [a, b, c, d],
    cx = (a[0] + c[0]) / 2,
    cz = (a[1] + c[1]) / 2;
  for (let i = 0; i < 4; i++) {
    const p = P[i],
      q = P[(i + 1) % 4];
    let nx = q[1] - p[1],
      nz = -(q[0] - p[0]);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if ((p[0] - cx) * nx + (p[1] - cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const A = [p[0], y0, p[1]],
      Bq = [q[0], y0, q[1]],
      C = [q[0], y1, q[1]],
      D = [p[0], y1, p[1]];
    for (const tri of [
      [A, Bq, C],
      [A, C, D],
      [A, C, Bq],
      [A, D, C],
    ])
      for (const v of tri) batch.vert(v[0], v[1], v[2], nx, 0, nz, v[0] * 0.4, v[1] * 0.4, col);
  }
}
