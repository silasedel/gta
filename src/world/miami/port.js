// Miami city — Port of Miami landmarks (always resident): ship-to-shore gantry cranes along the cargo quays and
// cruise ships berthed at the real cruise terminals. Placement is derived from data.js (zones, water, buildings).
import * as THREE from 'three';
import { Batch, rectPts, wallStrip } from '../city/geo.js';

const m4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const hash = (n) => { let x = Math.imul(n | 0, 2654435761) ^ (n >>> 13); x = Math.imul(x ^ (x >>> 16), 2246822507); return (x >>> 0) / 4294967296; };

// local frame: +Z points to the water, X runs along the quay
function craneGeometry() {
  const b = new Batch(), BOX = new THREE.BoxGeometry(1, 1, 1);
  const red = 0xc0392b, white = 0xf2f2ee, grey = 0x6d7378, dark = 0x2b2f33;
  for (const lx of [-9, 9]) for (const lz of [-10, 8]) b.addGeometry(BOX, m4(lx, 22.5, lz, 0, 1.4, 45, 1.4), (lx + lz) % 2 ? red : white);
  for (const lz of [-10, 8]) b.addGeometry(BOX, m4(0, 44, lz, 0, 19.4, 1.6, 1.6), red);
  for (const lx of [-9, 9]) { b.addGeometry(BOX, m4(lx, 44, -1, 0, 1.6, 1.6, 19.6), red); b.addGeometry(BOX, m4(lx, 12, -1, 0, 1.0, 1.0, 18), white); }
  for (const lx of [-1.6, 1.6]) b.addGeometry(BOX, m4(lx, 46.5, 15, 0, 0.9, 2.2, 82), white); // boom girders (z -26 .. +56)
  b.addGeometry(BOX, m4(0, 49.5, -6, 0, 8, 5, 10), white); // machinery house
  b.addGeometry(BOX, m4(0, 52.2, -6, 0, 8.2, 0.4, 10.2), red);
  b.addGeometry(BOX, m4(0, 45.8, 30, 0, 4.2, 3, 6), grey); // trolley
  b.addGeometry(BOX, m4(0, 38, 30, 0, 3, 1, 12.5), dark); // spreader
  for (const lx of [-3.5, 3.5]) b.addGeometry(BOX, m4(lx * 0.5, 55, -8, 0, 0.8, 18, 0.8, 0, lx > 0 ? -0.2 : 0.2), red); // A-frame
  // forestays from the apex to the boom tip, backstays to the tail
  const apex = new THREE.Vector3(0, 63.5, -8);
  for (const [tz, ty] of [[55, 47.5], [-26, 47.5]]) { const tip = new THREE.Vector3(0, ty, tz), mid = apex.clone().add(tip).multiplyScalar(0.5), d = tip.clone().sub(apex); b.addGeometry(BOX, new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), new THREE.Vector3(0.35, d.length(), 0.35)), dark); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
  return g;
}

export function buildPort({ data, M, F, root, world, RAPIER }) {
  const group = new THREE.Group(); group.name = 'miami-port'; root.add(group);
  const isLand = (x, z) => !data.isWater(x, z);
  const port = (x, z) => data.zoneAt(x, z) === 'port';
  const DIRS = []; for (let k = 0; k < 16; k++) DIRS.push([Math.sin((k / 16) * Math.PI * 2), Math.cos((k / 16) * Math.PI * 2)]);
  const waterDir = (x, z, dist) => { let best = null; for (const [dx, dz] of DIRS) { let ok = true; for (const s of [dist * 0.5, dist, dist * 1.8]) if (isLand(x + dx * s, z + dz * s)) { ok = false; break; } if (ok) { best = [dx, dz]; break; } } return best; };
  // ---- cruise terminals (from the tile data) ----
  const terminals = [];
  for (const k of data.tileKeys) {
    const [i, j] = k.split('_').map(Number), t = data.getTile(i, j); if (!t) continue;
    for (const b of t.buildings) if (/cruise/.test(String(b.kind))) terminals.push(b);
  }
  // ---- cruise ships: berth on open water beside each terminal, hull parallel to the quay ----
  const ships = [], shipColl = [];
  for (const term of terminals) {
    let found = null;
    for (const [dx, dz] of DIRS) {
      let s = 10; while (s < 260 && isLand(term.cx + dx * s, term.cz + dz * s)) s += 5;
      if (s >= 260) continue;
      if (!found || s < found.s) found = { s, dx, dz };
    }
    if (!found) continue;
    const { dx, dz } = found, ax = dz, az = -dx; // ship axis along the quay
    let cx = term.cx + dx * (found.s + 26), cz = term.cz + dz * (found.s + 26);
    let ok = true; for (let u = -140; u <= 140; u += 20) for (const w of [-14, 14]) if (isLand(cx + ax * u + dx * w, cz + az * u + dz * w)) ok = false;
    if (!ok) { cx += dx * 30; cz += dz * 30; ok = true; for (let u = -140; u <= 140; u += 20) if (isLand(cx + ax * u, cz + az * u)) ok = false; }
    if (!ok || ships.some((s2) => Math.hypot(s2.x - cx, s2.z - cz) < 200)) continue;
    ships.push({ x: cx, z: cz, yaw: Math.atan2(ax, az) });
  }
  const trim = new Batch(), deco = new Batch(), neon = new Batch();
  for (const sh of ships) {
    const fw = [Math.sin(sh.yaw), Math.cos(sh.yaw)], sd = [fw[1], -fw[0]];
    const at = (f, s2, y) => [sh.x + fw[0] * f + sd[0] * s2, y, sh.z + fw[1] * f + sd[1] * s2];
    const BOX = new THREE.BoxGeometry(1, 1, 1);
    let p = at(0, 0, 2); trim.addGeometry(BOX, m4(p[0], p[1], p[2], sh.yaw, 36, 14, 270), 0x1d3557);
    p = at(0, 0, 10.5); trim.addGeometry(BOX, m4(p[0], p[1], p[2], sh.yaw, 36.2, 3, 272), 0xf6f6f6);
    const bow = new THREE.ConeGeometry(18, 40, 4, 1); bow.rotateX(Math.PI / 2); bow.rotateZ(Math.PI / 4); bow.scale(1, 0.55, 1);
    p = at(155, 0, 5); trim.addGeometry(bow, m4(p[0], p[1], p[2], sh.yaw, 1, 1, 1), 0xf6f6f6);
    for (let tier = 0; tier < 7; tier++) {
      const w2 = 32 - tier * 2, l2 = 230 - tier * 20, y0 = 12 + tier * 3.4, c = at(-12 - tier * 3, 0, 0);
      const pts = rectPts(0, 0, w2, l2).map(([a, b]) => [c[0] + sd[0] * a + fw[0] * b, c[2] + sd[1] * a + fw[1] * b]);
      wallStrip(deco, pts, y0, y0 + 3.4, F.deco.tileW, F.deco.tileH, new THREE.Color(0xffffff), (tier % 4) / 4, 0);
      if (tier === 6) { const top = at(-12 - tier * 3, 0, y0 + 3.45); trim.addGeometry(BOX, m4(top[0], top[1], top[2], sh.yaw, w2, 0.1, l2), 0x9fb8c0); }
    }
    p = at(-80, 0, 40); trim.addGeometry(BOX, m4(p[0], p[1], p[2], sh.yaw, 10, 12, 18), 0x1d3557);
    p = at(-80, 0, 47); trim.addGeometry(BOX, m4(p[0], p[1], p[2], sh.yaw, 10.2, 2, 18.2), 0xd62828);
    // deck lights (neon strip along the top tier) and the hull's colliders
    const strip = rectPts(0, 0, 33, 232).map(([a, b]) => [sh.x + sd[0] * a + fw[0] * (b - 12), sh.z + sd[1] * a + fw[1] * (b - 12)]);
    wallStrip(neon, strip, 11.9, 12.1, 10, 10, new THREE.Color(0x9fdcff));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sh.yaw, 0));
    shipColl.push(world.createCollider(RAPIER.ColliderDesc.cuboid(18, 8, 140).setTranslation(sh.x, 4, sh.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })));
  }
  const mk = (b, mat, cast = true) => { if (b.empty) return; const m = b.build(mat, { cast, receive: true }); group.add(m); };
  mk(trim, M.trim); mk(deco, M.deco); mk(neon, M.neon, false);
  // ---- gantry cranes along the cargo quays (port land at the water's edge, away from the cruise berths) ----
  const cranes = [];
  // PortMiami's container gantries sit on the eastern cargo end of Dodge Island, on quays facing the channel (south/east)
  const bx0 = 600, bx1 = 2050, bz0 = -300, bz1 = 1450;
  scan: for (let x = bx0; x < bx1; x += 12) for (let z = bz0; z < bz1; z += 12) {
    if (!isLand(x, z) || !port(x, z)) continue;
    const wd = waterDir(x, z, 20); if (!wd || (wd[1] < 0.3 && wd[0] < 0.3)) continue;
    if (terminals.some((t) => Math.hypot(t.cx - x, t.cz - z) < 330)) continue;
    if (cranes.some((c) => Math.hypot(c.x - x, c.z - z) < 95)) continue;
    // straight quay check: land continues ±40 m along the quay
    const ax = wd[1], az = -wd[0]; if (!isLand(x + ax * 40, z + az * 40) || !isLand(x - ax * 40, z - az * 40)) continue;
    cranes.push({ x: x - wd[0] * 6, z: z - wd[1] * 6, ry: Math.atan2(wd[0], wd[1]) });
    if (cranes.length >= 14) break scan;
  }
  if (cranes.length) {
    const cg = craneGeometry(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }); if (M.propify) M.propify(mat, 'rustPaint');
    const im = new THREE.InstancedMesh(cg, mat, cranes.length), d = new THREE.Object3D();
    cranes.forEach((c, i) => { d.position.set(c.x, 0, c.z); d.rotation.set(0, c.ry, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im);
    const bg = new THREE.SphereGeometry(0.6, 8, 6), bm = new THREE.InstancedMesh(bg, M.beacon, cranes.length);
    cranes.forEach((c, i) => { d.position.set(c.x - Math.sin(c.ry) * 8, 64.2, c.z - Math.cos(c.ry) * 8); d.rotation.set(0, 0, 0); d.updateMatrix(); bm.setMatrixAt(i, d.matrix); });
    bm.computeBoundingSphere(); group.add(bm);
    for (const c of cranes) { const s = Math.sin(c.ry), co = Math.cos(c.ry); for (const lx of [-9, 9]) for (const lz of [-10, 8]) shipColl.push(world.createCollider(RAPIER.ColliderDesc.cuboid(0.7, 22.5, 0.7).setTranslation(c.x + lx * co + lz * s, 22.5, c.z - lx * s + lz * co))); }
  }
  return { group, ships, cranes, terminals: terminals.map((t) => ({ x: t.cx, z: t.cz })), colliders: shipColl };
}
