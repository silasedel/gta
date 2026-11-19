// Airport perimeter fence (airports agent, Nov 19; r4-air kit): galvanized chain-link, 2.15 m, line posts every ~3 m,
// a top rail, 45-degree barbed-wire arms leaning OUT with three strands. It follows the airside polygon of
// airports.json all the way round with NO gaps: where the terminal stands on the line the building is the barrier, and
// at the vehicle gates a closed sliding gate (chain-link leaf on a steel frame) fills the opening, with a guard booth and
// a red-and-white barrier arm outside. Static colliders per span; climbable (src/world/airport/climb.js asks
// nearest(x, z) for the span, its outward normal and height).
import * as THREE from 'three';

const POST = 3.0, H = 2.15, ARM = 0.5, TILE = 0.1;

function diamondTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.clearRect(0, 0, S, S); g.fillStyle = 'rgba(170,176,180,0.16)'; g.fillRect(0, 0, S, S);   // the far-off sheen of the mesh
  g.strokeStyle = 'rgba(196,201,204,1)'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
  g.strokeStyle = 'rgba(120,126,130,0.9)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(2, 0); g.lineTo(S, S - 2); g.moveTo(S - 2, 0); g.lineTo(0, S - 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function signTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g2 = c.getContext('2d');
  g2.fillStyle = '#f4f4f0'; g2.fillRect(0, 0, 256, 128); g2.fillStyle = '#b3171d'; g2.fillRect(0, 0, 256, 38); g2.fillStyle = '#fff'; g2.font = 'bold 26px Arial'; g2.textAlign = 'center'; g2.fillText('RESTRICTED AREA', 128, 28);
  g2.fillStyle = '#1b1b1b'; g2.font = 'bold 19px Arial'; g2.fillText('AIRPORT OPERATIONS', 128, 66); g2.font = '16px Arial'; g2.fillText('No trespassing. Violators', 128, 92); g2.fillText('will be prosecuted.', 128, 114);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// opts: { scene/group, world, RAPIER, ground(x, z), ring: [[x, z]...] (closed, airside inside), gates: [{ x, z, w }], skip(x, z) -> bool (a building is the barrier there), inside(x, z) }
export function buildFence(opts) {
  const { group: parent, world, RAPIER, ground, ring, gates = [], skip = () => false, inside } = opts;
  // resample the ring into posts every ~3 m; break runs at gates and where skip() says a building stands
  const n = ring.length, runs = [], gateSpans = [];
  let run = [];
  const flush = () => { if (run.length > 1) runs.push(run); run = []; };
  const gateAt = (x, z) => gates.find((g) => Math.hypot(g.x - x, g.z - z) < g.w / 2 + 0.6);
  let gateOpen = null;
  for (let k = 0; k < n; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % n], len = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.round(len / POST));
    for (let s = 0; s < m; s++) {
      const t = s / m, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const g = gateAt(x, z);
      if (g || skip(x, z)) { if (g && run.length && !gateOpen) gateOpen = { g, a: run[run.length - 1] }; flush(); continue; }
      const p = { x, z, y: ground(x, z) };
      if (!run.length && gateOpen) { gateSpans.push({ ...gateOpen, b: p }); gateOpen = null; }
      run.push(p);
    }
  }
  flush();
  // the ring is closed: join the last run to the first when they meet
  if (runs.length > 1) { const f = runs[0], l = runs[runs.length - 1], a = l[l.length - 1], b = f[0]; if (Math.hypot(a.x - b.x, a.z - b.z) < POST * 1.6) { runs[0] = l.concat(f); runs.pop(); } }
  else if (runs.length === 1) { const r = runs[0]; if (Math.hypot(r[0].x - r[r.length - 1].x, r[0].z - r[r.length - 1].z) < POST * 1.6) r.push(r[0]); }

  const group = new THREE.Group(); group.name = 'airport-fence';   // added to the parent when complete
  const steel = new THREE.MeshStandardMaterial({ color: 0x9ea4a8, metalness: 0.65, roughness: 0.42 });
  const fabricMat = new THREE.MeshStandardMaterial({ map: diamondTexture(), color: 0xd8dde0, metalness: 0.55, roughness: 0.45, transparent: true, alphaTest: 0.04, depthWrite: false, side: THREE.DoubleSide });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x55595c });
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 8).translate(0, 0.5, 0), railGeo = new THREE.CylinderGeometry(0.021, 0.021, 1, 6).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
  const armGeo = new THREE.BoxGeometry(0.035, ARM, 0.035).translate(0, ARM / 2, 0);
  const posts = [], rails = [], arms = [], fab = { p: [], uv: [], idx: [], u: 0 }, wires = [], spans = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
  const outward = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; let nx = dz / l, nz = -dx / l; const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; if (inside && inside(mx + nx * 2, mz + nz * 2)) { nx = -nx; nz = -nz; } return [nx, nz]; };
  const addSpan = (p, q, isGate) => {
    const dx = q.x - p.x, dz = q.z - p.z, dy = q.y - p.y, len = Math.hypot(dx, dz); if (len < 0.05) return;
    const ry = Math.atan2(-dz, dx), rp = Math.atan2(dy, len);
    E.set(0, ry, rp, 'YZX'); Q.setFromEuler(E); M.compose(V.set(p.x, p.y + H, p.z), Q, Sc.set(Math.hypot(len, dy), 1, 1)); rails.push(M.clone());
    if (isGate) { M.compose(V.set(p.x, p.y + 0.12, p.z), Q, Sc.set(Math.hypot(len, dy), 1, 1)); rails.push(M.clone()); }
    const b = fab.p.length / 3, u0 = fab.u, u1 = u0 + len / TILE;
    fab.p.push(p.x, p.y + 0.04, p.z, q.x, q.y + 0.04, q.z, q.x, q.y + H, q.z, p.x, p.y + H, p.z);
    fab.uv.push(u0, 0, u1, 0, u1, (H - 0.04) / TILE, u0, (H - 0.04) / TILE); fab.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); fab.u = u1 % 64;
    const [ox, oz] = outward(p, q);
    for (const f of [0.33, 0.66, 1.0]) { const o = ARM * f * Math.SQRT1_2, hh = H + 0.03 + ARM * f * Math.SQRT1_2; wires.push(p.x + ox * o, p.y + hh, p.z + oz * o, q.x + ox * o, q.y + hh, q.z + oz * o); }
    spans.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, y: Math.min(p.y, q.y), nx: ox, nz: oz, len, gate: !!isGate });
  };
  for (const r of runs) for (let i = 0; i < r.length; i++) {
    const p = r[i], end = i === 0 || i === r.length - 1, prev = r[Math.max(0, i - 1)], next = r[Math.min(r.length - 1, i + 1)];
    Sc.set(end ? 1.8 : 1, H + 0.08, end ? 1.8 : 1); M.compose(V.set(p.x, p.y - 0.05, p.z), Q.identity(), Sc); posts.push(M.clone());
    const [ox, oz] = outward(prev === p ? p : prev, next === p ? p : next); E.set(Math.PI / 4, Math.atan2(ox, oz), 0, 'YXZ'); Q.setFromEuler(E);
    M.compose(V.set(p.x, p.y + H + 0.03, p.z), Q, Sc.set(1, 1, 1)); arms.push(M.clone());
    if (i < r.length - 1 && Math.hypot(r[i + 1].x - p.x, r[i + 1].z - p.z) < 8) addSpan(p, r[i + 1], false);
  }
  // gates: heavy posts, a closed leaf in the opening (framed chain-link, a diagonal brace), a booth and barrier arm outside
  const booths = [];
  for (const gs of gateSpans) {
    const a = gs.a, b = gs.b;
    for (const p of [a, b]) { Sc.set(3.4, H + 0.4, 3.4); M.compose(V.set(p.x, p.y - 0.05, p.z), Q.identity(), Sc); posts.push(M.clone()); }
    addSpan(a, b, true);
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), [ox, oz] = outward(a, b);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(len, H - 0.2), 0.05, 0.05), steel); brace.position.set((a.x + b.x) / 2, a.y + H / 2, (a.z + b.z) / 2); brace.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(H - 0.2, len), 'YZX'); group.add(brace);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7, side: THREE.DoubleSide })); sign.position.set((a.x + b.x) / 2 + ox * 0.05, a.y + 1.3, (a.z + b.z) / 2 + oz * 0.05); sign.rotation.y = Math.atan2(ox, oz); group.add(sign);
    booths.push({ x: (a.x + b.x) / 2 + ox * 6 + (dx / len) * (len / 2 + 2.5), z: (a.z + b.z) / 2 + oz * 6 + (dz / len) * (len / 2 + 2.5), heading: Math.atan2(ox, oz), arm: { x: (a.x + b.x) / 2 + ox * 5, z: (a.z + b.z) / 2 + oz * 5, along: Math.atan2(dx, dz), len } });
  }
  // warning signs every ~150 m along the outside
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7 });
  let acc = 0;
  for (const sp of spans) { acc += sp.len; if (acc < 150 || sp.gate) continue; acc = 0; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), signMat); m.position.set((sp.ax + sp.bx) / 2 + sp.nx * 0.06, sp.y + 1.35, (sp.az + sp.bz) / 2 + sp.nz * 0.06); m.rotation.y = Math.atan2(sp.nx, sp.nz); group.add(m); }
  const addInst = (geo, mat, list, name) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mm, i) => im.setMatrixAt(i, mm)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = name; im.castShadow = false; im.receiveShadow = true; group.add(im); };
  addInst(postGeo, steel, posts, 'fence-posts'); addInst(railGeo, steel, rails, 'fence-rails'); addInst(armGeo, steel, arms, 'fence-arms');
  if (fab.p.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fab.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(fab.uv, 2)); g.setIndex(fab.idx); g.computeVertexNormals(); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, fabricMat); mesh.name = 'fence-fabric'; mesh.renderOrder = 2; group.add(mesh); }
  if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); const ls = new THREE.LineSegments(g, wireMat); ls.name = 'fence-barbed'; group.add(ls); }
  // guard booths (white box with a window band and a flat roof) and barrier arms
  const boothMat = new THREE.MeshStandardMaterial({ color: 0xe9e7e0, roughness: 0.7 }), winMat = new THREE.MeshStandardMaterial({ color: 0x324452, roughness: 0.1, metalness: 0.3 });
  const armMat = new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 8; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d01a1a'; g.fillRect(i * 16, 0, 16, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.5 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const bo of booths) {
    const y = ground(bo.x, bo.z), g = new THREE.Group(); g.position.set(bo.x, y, bo.z); g.rotation.y = bo.heading; group.add(g);
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), boothMat); w.position.y = 1.3; w.castShadow = true; g.add(w);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.9, 2.45), winMat); win.position.y = 1.75; g.add(win);
    const rf = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 3.0), boothMat); rf.position.y = 2.7; g.add(rf);
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.2, 1.3, 1.2).setTranslation(bo.x, y + 1.3, bo.z), body);
    const a = bo.arm, ay = ground(a.x, a.z), arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, a.len * 0.9), armMat); arm.position.set(a.x, ay + 1.0, a.z); arm.rotation.y = a.along; group.add(arm);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), boothMat); post.position.set(a.x + Math.sin(a.along) * a.len * 0.47, ay + 0.55, a.z + Math.cos(a.along) * a.len * 0.47); group.add(post);
  }
  // colliders: a thin wall per span, 2.6 m high (the barbed arms count)
  // created 150 per frame (about 2 ms), not all at once in the middle of play
  { let i = 0; const qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const chunk = () => { const end = Math.min(spans.length, i + 150);
      for (; i < end; i++) { const sp = spans[i]; qq.setFromAxisAngle(up, Math.atan2(sp.bx - sp.ax, sp.bz - sp.az));
        try { world.createCollider(RAPIER.ColliderDesc.cuboid(0.06, 1.3, sp.len / 2 + 0.05).setTranslation((sp.ax + sp.bx) / 2, sp.y + 1.3, (sp.az + sp.bz) / 2).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }), body); } catch (e) { /* */ } }
      if (i < spans.length) requestAnimationFrame(chunk); };
    chunk(); }
  parent.add(group);
  // nearest fence span to a point: { x, z (closest point), nx, nz (outward), y, d, gate }
  function nearest(x, z, maxD = 3) {
    let best = null, bd = maxD;
    for (const sp of spans) {
      if (Math.abs(sp.ax - x) > sp.len + maxD + 1 && Math.abs(sp.bx - x) > sp.len + maxD + 1) continue;
      const dx = sp.bx - sp.ax, dz = sp.bz - sp.az, L2 = dx * dx + dz * dz; let t = L2 ? ((x - sp.ax) * dx + (z - sp.az) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const px = sp.ax + dx * t, pz = sp.az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, nx: sp.nx, nz: sp.nz, y: sp.y, d, gate: sp.gate, height: H + 0.35 }; }
    }
    return best;
  }
  return { group, nearest, stats: { runs: runs.length, posts: posts.length, spans: spans.length, gates: gateSpans.length, km: +(spans.reduce((s, p) => s + p.len, 0) / 1000).toFixed(2) }, gates: gateSpans };
}
