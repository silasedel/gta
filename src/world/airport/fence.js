// r4-air: airport perimeter fence (user: "an actual metal fence all around, like in real life").
// Security chain-link: galvanized line posts every ~3 m (heavier corner / gate posts), a top rail, chain-link fabric
// (procedural diamond mesh texture, see-through), 45-degree barbed-wire arms leaning out with three strands, and open
// sliding gates where roads cross the line. Traced from the city's 'airport' zone raster (eroded one cell so the fence
// stands inside the airport edge), simplified, laid on the terrain. Static cuboid colliders per span keep cars, people
// and planes out. Library check (Models/Fences): no chain-link model (Fence 3/6 are welded-mesh panels), so this is a
// clean instanced kit: one draw call per part per chunk.
import * as THREE from 'three';

const CELL = 8, POST = 3.0, H = 2.15, ARM = 0.5, TILE = 0.1;   // TILE: one chain-link diamond (m)

function diamondTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(196,201,204,1)'; g.lineWidth = 5; g.lineCap = 'round';
  // one 0.3 m tile: two diagonal wires (they meet at the tile edges -> diamonds)
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
  g.strokeStyle = 'rgba(120,126,130,0.9)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(2, 0); g.lineTo(S, S - 2); g.moveTo(S - 2, 0); g.lineTo(0, S - 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// contour of mask (nx x nz booleans, cell centers at x0 + i*CELL) -> closed / open polylines in world xz
function contours(mask, nx, nz, x0, z0) {
  const segs = [], at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < nz ? mask[j * nx + i] : 0);
  const P = (i, j, e) => { // edge midpoint of cell (i, j): 0 top (j), 1 right, 2 bottom, 3 left
    const x = x0 + i * CELL, z = z0 + j * CELL;
    return e === 0 ? [x + CELL / 2, z] : e === 1 ? [x + CELL, z + CELL / 2] : e === 2 ? [x + CELL / 2, z + CELL] : [x, z + CELL / 2];
  };
  const T = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]], 8: [[0, 3]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };
  for (let j = -1; j < nz; j++) for (let i = -1; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), cc = at(i + 1, j + 1), d = at(i, j + 1);
    const k = a * 8 + b * 4 + cc * 2 + d; if (!T[k]) continue;
    for (const [e0, e1] of T[k]) segs.push([P(i, j, e0), P(i, j, e1)]);
  }
  // chain segments by shared endpoints
  const key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2), ends = new Map();
  segs.forEach((s, idx) => { for (const p of s) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(idx); } });
  const used = new Uint8Array(segs.length), lines = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue; used[s0] = 1;
    const line = [segs[s0][0], segs[s0][1]];
    for (const dir of [1, -1]) {
      for (;;) {
        const tip = dir > 0 ? line[line.length - 1] : line[0];
        const nb = (ends.get(key(tip)) || []).find((q) => !used[q]); if (nb === undefined) break;
        used[nb] = 1; const s = segs[nb], nxt = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir > 0) line.push(nxt); else line.unshift(nxt);
      }
    }
    lines.push(line);
  }
  return lines;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  if (closed) { // a loop: split at the vertex farthest from the start, simplify both halves
    let fi = 0, fd = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; fi = i; } }
    if (fi > 0) return rdp(pts.slice(0, fi + 1), eps).slice(0, -1).concat(rdp(pts.slice(fi), eps));
  }
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  let md = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > md) { md = d; mi = i; } }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps));
}

// opts: { city, world, RAPIER, scene, rect: [x0, z0, x1, z1], zone: 'airport' }
export function buildAirportFence(opts) {
  const { city, scene, world, RAPIER } = opts, [rx0, rz0, rx1, rz1] = opts.rect, zone = opts.zone || 'airport';
  const nx = Math.ceil((rx1 - rx0) / CELL), nz = Math.ceil((rz1 - rz0) / CELL);
  const raw = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = rx0 + (i + 0.5) * CELL, z = rz0 + (j + 0.5) * CELL;
    raw[j * nx + i] = city.zoneAt(x, z) === zone ? 1 : 0;
  }
  // close small notches (dilate, then erode twice): one clean outline that stands ~1 cell inside the zone edge
  const morph = (src, keep) => { const out = new Uint8Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let n = 0, s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; n++; s += src[jj * nx + ii]; } out[j * nx + i] = keep(s, n, src[j * nx + i]) ? 1 : 0; } return out; };
  let m = morph(raw, (s) => s > 0); m = morph(m, (s, n) => s === n); m = morph(m, (s, n) => s === n);
  // keep the biggest connected region only (the airfield), fill its holes
  const lab = new Int32Array(nx * nz), sizes = [0]; let L = 0;
  for (let s = 0; s < nx * nz; s++) { if (!m[s] || lab[s]) continue; L++; let n = 0; const st = [s]; lab[s] = L; while (st.length) { const c = st.pop(); n++; const i = c % nx, j = (c / nx) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const q = jj * nx + ii; if (m[q] && !lab[q]) { lab[q] = L; st.push(q); } } } sizes.push(n); }
  let big = 1; for (let k = 1; k <= L; k++) if (sizes[k] > sizes[big]) big = k;
  const mask = new Uint8Array(nx * nz); for (let s = 0; s < nx * nz; s++) mask[s] = lab[s] === big ? 1 : 0;
  { // fill holes: outside flood from the border; anything unreached and not mask -> mask
    const out = new Uint8Array(nx * nz), st = [];
    for (let i = 0; i < nx; i++) for (const j of [0, nz - 1]) { const q = j * nx + i; if (!mask[q] && !out[q]) { out[q] = 1; st.push(q); } }
    for (let j = 0; j < nz; j++) for (const i of [0, nx - 1]) { const q = j * nx + i; if (!mask[q] && !out[q]) { out[q] = 1; st.push(q); } }
    while (st.length) { const c = st.pop(), i = c % nx, j = (c / nx) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const q = jj * nx + ii; if (!mask[q] && !out[q]) { out[q] = 1; st.push(q); } } }
    for (let s = 0; s < nx * nz; s++) if (!out[s]) mask[s] = 1;
  }
  const inside = (x, z) => { const i = Math.floor((x - rx0) / CELL), j = Math.floor((z - rz0) / CELL); return i >= 0 && j >= 0 && i < nx && j < nz && mask[j * nx + i] === 1; };
  const lines = contours(mask, nx, nz, rx0 + CELL / 2, rz0 + CELL / 2).map((l) => rdp(l, 3.5)).filter((l) => l.length > 1);
  // ---- lay posts along the outline; gaps at roads (gates) and over water
  const roadAt = (x, z) => { try { const r = city.roadGraph?.nearestEdge?.(x, z, {}, 30); return r && r.dist < (r.edge.width || 8) / 2 + 2.5 ? r : null; } catch (e) { return null; } };
  const gy = (x, z) => city.groundHeightAt(x, z);
  const runs = [], gates = [];
  for (const line of lines) {
    let run = null, gap = null;
    const flush = () => { if (run && run.length > 1) runs.push(run); run = null; };
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, az] = line[k], [bx, bz] = line[k + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / POST));
      for (let s = (k === 0 ? 0 : 1); s <= n; s++) {
        const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const blocked = city.isWater?.(x, z) || roadAt(x, z);
        if (blocked) { if (run) { if (!gap && !city.isWater?.(x, z)) gap = { a: run[run.length - 1] }; flush(); } continue; }
        const p = { x, z, y: gy(x, z) };
        if (!run) { run = []; if (gap) { gap.b = p; const gl = Math.hypot(gap.b.x - gap.a.x, gap.b.z - gap.a.z); if (gl > 4 && gl < 45) gates.push(gap); gap = null; } }
        run.push(p);
      }
    }
    flush();
  }
  // ---- geometry
  const group = new THREE.Group(); group.name = 'airport-fence';
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ea4a8, metalness: 0.65, roughness: 0.42 });
  const fabricMat = new THREE.MeshStandardMaterial({ map: diamondTexture(), color: 0xd8dde0, metalness: 0.55, roughness: 0.45, transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x55595c });
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 8).translate(0, 0.5, 0), railGeo = new THREE.CylinderGeometry(0.021, 0.021, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
  const armGeo = new THREE.BoxGeometry(0.035, ARM, 0.035).translate(0, ARM / 2, 0);
  const posts = [], rails = [], arms = [], fab = { p: [], uv: [], idx: [] }, wires = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
  const outward = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; let nx = dz / l, nz = -dx / l; const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; if (inside(mx + nx * 6, mz + nz * 6)) { nx = -nx; nz = -nz; } return [nx, nz]; };
  let spans = 0;
  const colliders = [];
  for (const run of runs) {
    for (let i = 0; i < run.length; i++) {
      const p = run[i], end = i === 0 || i === run.length - 1;
      const prev = run[Math.max(0, i - 1)], next = run[Math.min(run.length - 1, i + 1)];
      const [ox, oz] = outward(prev === p ? p : prev, next === p ? p : next);
      const hgt = H + 0.08;
      Sc.set(end ? 1.8 : 1, hgt, end ? 1.8 : 1); M.compose(V.set(p.x, p.y - 0.05, p.z), Q.identity(), Sc); posts.push(M.clone());
      // barbed-wire arm: leans 45 deg outward
      const yaw = Math.atan2(ox, oz); E.set(Math.PI / 4, yaw, 0, 'YXZ'); Q.setFromEuler(E);
      M.compose(V.set(p.x, p.y + hgt - 0.05, p.z), Q, Sc.set(1, 1, 1)); arms.push(M.clone());
      if (i < run.length - 1) {
        const q = run[i + 1], dx = q.x - p.x, dz = q.z - p.z, dy = q.y - p.y, len = Math.hypot(dx, dz);
        if (len > 8) continue;   // a jump (should not happen inside a run)
        spans++;
        // top rail
        const ry = Math.atan2(-dz, dx), rp = Math.atan2(dy, len);
        E.set(0, ry, rp, 'YZX'); Q.setFromEuler(E); M.compose(V.set(p.x, p.y + H, p.z), Q, Sc.set(Math.hypot(len, dy), 1, 1)); rails.push(M.clone());
        // fabric quad (u per 0.3 m tile, v per 0.3 m)
        const b = fab.p.length / 3, u0 = (fab.u || 0), u1 = u0 + len / TILE;
        fab.p.push(p.x, p.y + 0.04, p.z, q.x, q.y + 0.04, q.z, q.x, q.y + H, q.z, p.x, p.y + H, p.z);
        fab.uv.push(u0, 0, u1, 0, u1, (H - 0.04) / TILE, u0, (H - 0.04) / TILE); fab.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); fab.u = u1 % 64;
        // three barbed strands along the arm tips
        const [ox2, oz2] = outward(p, q);
        for (const f of [0.33, 0.66, 1.0]) { const o = ARM * f * Math.SQRT1_2, hh = H + 0.03 + ARM * f * Math.SQRT1_2; wires.push(p.x + ox * o, p.y + hh, p.z + oz * o, q.x + ox2 * o, q.y + hh, q.z + oz2 * o); }
        colliders.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 + 1.45, z: (p.z + q.z) / 2, hx: len / 2 + 0.05, ry: Math.atan2(dx, dz) });
      }
    }
  }
  // ---- gates: heavy posts + an open sliding gate leaf parked along the fence inside the line, and a warning sign
  const gateFrames = [];
  for (const g of gates) {
    for (const p of [g.a, g.b]) { Sc.set(3.2, H + 0.35, 3.2); M.compose(V.set(p.x, p.y - 0.05, p.z), Q.identity(), Sc); posts.push(M.clone()); }
    const dx = g.b.x - g.a.x, dz = g.b.z - g.a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const [ox, oz] = outward(g.a, g.b), ix = -ox * 0.7, iz = -oz * 0.7;    // leaf slid back behind the fence (inside)
    const a = { x: g.a.x - ux * len * 0.98 + ix, z: g.a.z - uz * len * 0.98 + iz }, b = { x: g.a.x + ix, z: g.a.z + iz };
    a.y = gy(a.x, a.z); b.y = gy(b.x, b.z);
    gateFrames.push({ a, b, len: len * 0.98 });
  }
  const chunkOf = new Map();
  const addInst = (geo, mat, list, name) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = name; im.castShadow = false; im.receiveShadow = true; group.add(im); };
  void chunkOf;
  addInst(postGeo, steel, posts, 'fence-posts'); addInst(railGeo, steel, rails, 'fence-rails'); addInst(armGeo, steel, arms, 'fence-arms');
  if (fab.p.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fab.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(fab.uv, 2)); g.setIndex(fab.idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, fabricMat); mesh.name = 'fence-fabric'; mesh.renderOrder = 2; group.add(mesh);
  }
  if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); const ls = new THREE.LineSegments(g, wireMat); ls.name = 'fence-barbed'; group.add(ls); }
  // gate leaves: framed chain-link panels on two small wheels
  for (const f of gateFrames) {
    const leaf = new THREE.Group(); leaf.name = 'fence-gate';
    const dx = f.b.x - f.a.x, dz = f.b.z - f.a.z; leaf.position.set(f.a.x, Math.min(f.a.y, f.b.y), f.a.z); leaf.rotation.y = Math.atan2(-dz, dx);
    const frame = (x0, y0, x1, y1) => { const l = Math.hypot(x1 - x0, y1 - y0), m = new THREE.Mesh(new THREE.BoxGeometry(l, 0.05, 0.05), steel); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(y1 - y0, x1 - x0); leaf.add(m); };
    frame(0, 0.12, f.len, 0.12); frame(0, H, f.len, H); frame(0, 0.12, 0, H); frame(f.len, 0.12, f.len, H); frame(0, 0.12, f.len, H);
    const pg = new THREE.PlaneGeometry(f.len, H - 0.12); pg.translate(f.len / 2, (H + 0.12) / 2, 0); const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * f.len / TILE, uv.getY(i) * (H - 0.12) / TILE);
    leaf.add(new THREE.Mesh(pg, fabricMat));
    // sign on the leaf
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g2 = c.getContext('2d');
    g2.fillStyle = '#f4f4f0'; g2.fillRect(0, 0, 256, 128); g2.fillStyle = '#b3171d'; g2.fillRect(0, 0, 256, 38); g2.fillStyle = '#fff'; g2.font = 'bold 26px Arial'; g2.textAlign = 'center'; g2.fillText('RESTRICTED AREA', 128, 28);
    g2.fillStyle = '#1b1b1b'; g2.font = 'bold 19px Arial'; g2.fillText('AIRPORT OPERATIONS', 128, 66); g2.font = '16px Arial'; g2.fillText('Authorized vehicles only', 128, 92); g2.fillText('Southline Aviation Authority', 128, 114);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.7, side: THREE.DoubleSide })); sign.position.set(f.len * 0.25, 1.3, 0.04); leaf.add(sign);
    group.add(leaf);
  }
  scene.add(group);
  // ---- colliders: one fixed body, a thin cuboid per span (and per gate leaf)
  let body = null;
  try {
    body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const c of colliders) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.ry);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.06, 1.5, c.hx).setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), body);
    }
    for (const f of gateFrames) { const dx = f.b.x - f.a.x, dz = f.b.z - f.a.z, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz)); world.createCollider(RAPIER.ColliderDesc.cuboid(0.06, 1.2, f.len / 2).setTranslation((f.a.x + f.b.x) / 2, f.a.y + 1.2, (f.a.z + f.b.z) / 2).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), body); }
  } catch (e) { console.warn('[fence] colliders', e); }
  const stats = { runs: runs.length, posts: posts.length, spans, gates: gates.length, km: +(spans * POST / 1000).toFixed(2), colliders: colliders.length };
  return {
    group, stats, gates, inside,
    dispose() { scene.remove(group); group.traverse((o) => { o.geometry?.dispose?.(); }); try { if (body) world.removeRigidBody(body); } catch (e) { /* */ } },
  };
}
