// Walk-in terminal: a glass-walled hall you enter from the curb (automatic sliding doors), a check-in hall (the user's
// Terminal Hall 1 model at Miami International: counters, baggage belts, truss roof), a security checkpoint (scanner
// arches, x-ray belts, queue posts) and gate lounges in the wings (rows of seats, the user's Gate Sign 1 podiums, hanging
// gate numbers, departure boards). Airside wall: glass onto the apron with the jet bridge doors.
// Local frame: group at the terminal center, rotation.y = heading, local +z = airside (apron), -z = landside (curb),
// x along the building. Colliders: one fixed body (floor, walls with door gaps, roof, counters, seat rows).
import * as THREE from 'three';
import { loadModel, loadCollision, addTrimesh } from './models.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FLOOR = 0.15;

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

export async function buildTerminal(ap, { group, ground, world, RAPIER, game }) {
  const T = ap.terminal, big = T.len > 150, L = T.len, D = T.depth, H = T.h;
  const root = new THREE.Group(); root.name = 'airport-terminal-' + ap.id;
  const gy = ground(T.x, T.z);
  root.position.set(T.x, gy, T.z); root.rotation.y = T.heading; group.add(root); root.updateMatrixWorld(true);
  const c = Math.cos(T.heading), s = Math.sin(T.heading);
  const toWorld = (lx, lz) => [T.x + lx * c + lz * s, T.z - lx * s + lz * c];
  const toLocal = (x, z) => { const dx = x - T.x, dz = z - T.z; return [dx * c - dz * s, dx * s + dz * c]; };
  // ---- materials
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.7 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.4, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4cc, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, emissive: 0xffd9a0, emissiveIntensity: 0 });   // glows warm from the lit hall at night
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc9c3b8, roughness: 0.25, metalness: 0.05 });   // polished terrazzo
  const carpet = new THREE.MeshStandardMaterial({ color: 0x2c3a52, roughness: 0.95 });
  const roofIn = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.8 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3df, emissiveIntensity: 1.2, roughness: 0.5 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.6, metalness: 0.3 });
  const seatPad = new THREE.MeshStandardMaterial({ color: 0x3c5f8f, roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.55 });
  const boxes = [];   // collider boxes in local frame [cx, cy, cz, hx, hy, hz]
  const box = (w, h, d, x, y, z, mat, col = true, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; root.add(m); if (col) boxes.push([x, y, z, w / 2, h / 2, d / 2]); return m; };
  // ---- floor, roof
  box(L, FLOOR, D, 0, FLOOR / 2, 0, floorMat);
  const roof = box(L + 6, 0.8, D + 8, 0, H + 0.4, 0, concrete); roof.castShadow = true;
  box(L - 1, 0.05, D - 1, 0, H - 0.05, 0, roofIn, false, false);
  box(L + 6.4, 1.4, 0.3, 0, H + 0.3, -D / 2 - 4.2, steel, false); box(L + 6.4, 1.4, 0.3, 0, H + 0.3, D / 2 + 4.2, steel, false);   // fascia
  // roof: a glazed clerestory along the spine, rooftop plant (AC units, vents) and a parapet
  const cl = new THREE.Mesh(new THREE.BoxGeometry(L * 0.86, 2.4, big ? 10 : 5), glass); cl.position.set(0, H + 2.0, 0); cl.renderOrder = 3; root.add(cl);
  box(L * 0.86 + 1, 0.35, (big ? 10 : 5) + 1.5, 0, H + 3.35, 0, steel, false);
  const hvac = new THREE.MeshStandardMaterial({ color: 0xb5b7b4, roughness: 0.6, metalness: 0.3 });
  for (let x = -L / 2 + 12; x < L / 2 - 10; x += big ? 34 : 22) for (const z of big ? [-D * 0.32, D * 0.32] : [-D * 0.28]) { box(4.2, 1.6, 2.6, x, H + 1.6, z, hvac, false); box(1.2, 0.5, 1.2, x + 2.8, H + 1.05, z, darkSteel, false, false); }
  // landside canopy over the curb, on round columns
  const cz = -D / 2 - 7; box(L * 0.7, 0.35, 14, 0, Math.min(H, 7.5), cz, concrete, false);
  for (let x = -L * 0.33; x <= L * 0.33 + 0.1; x += 15) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, Math.min(H, 7.5), 12), steel); col.position.set(x, Math.min(H, 7.5) / 2, cz - 5.5); col.castShadow = true; root.add(col); boxes.push([x, Math.min(H, 7.5) / 2, cz - 5.5, 0.3, Math.min(H, 7.5) / 2, 0.3]); }
  // ---- walls: landside glass with door gaps, airside glass, concrete ends
  const doorsX = big ? [-25, 0, 25] : [0];
  const DW = 5.0;
  const wallRun = (z, gaps, opaque) => {
    const xs = [-L / 2]; for (const g of gaps) xs.push(g - DW / 2, g + DW / 2); xs.push(L / 2);
    for (let i = 0; i < xs.length; i += 2) { const a = xs[i], b = xs[i + 1]; if (b - a < 0.1) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, H - FLOOR, 0.05), opaque || glass); m.position.set((a + b) / 2, FLOOR + (H - FLOOR) / 2, z); m.renderOrder = 3; root.add(m);
      boxes.push([(a + b) / 2, H / 2, z, (b - a) / 2, H / 2, 0.15]);
      for (let x = a; x <= b + 0.01; x += 3) { const mm = new THREE.Mesh(new THREE.BoxGeometry(0.12, H - FLOOR, 0.25), steel); mm.position.set(x, FLOOR + (H - FLOOR) / 2, z); mm.castShadow = true; root.add(mm); }
      for (const y of [3.2, H * 0.62]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.12, 0.22), steel); tr.position.set((a + b) / 2, y, z); root.add(tr); }
    }
    for (const g of gaps) { const hd = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.4, H - 3.2, 0.3), steel); hd.position.set(g, 3.2 + (H - 3.2) / 2, z); root.add(hd); }
  };
  wallRun(-D / 2, doorsX, null);
  wallRun(D / 2, [], null);
  for (const sx of [-1, 1]) box(0.5, H, D, sx * L / 2, H / 2, 0, concrete);
  // automatic sliding doors (two leaves per opening, slide apart when someone is near)
  const doors = [];
  for (const x of doorsX) { const lv = []; for (const sg of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(DW / 2, 3.0, 0.06), glass); m.position.set(x + sg * DW / 4, FLOOR + 1.5, -D / 2); m.renderOrder = 3; root.add(m); const fr = new THREE.Mesh(new THREE.BoxGeometry(DW / 2, 3.0, 0.08), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.3, wireframe: false })); fr.scale.set(1, 1, 1); fr.visible = false; lv.push({ m, sg, x0: x + sg * DW / 4 }); } doors.push({ x, lv, open: 0 }); }
  // ---- interior: ceiling light strips, check-in, security, gate lounges
  const lights = [];
  for (let x = -L / 2 + 6; x < L / 2 - 4; x += 8) for (const z of [-D * 0.3, 0, D * 0.3]) lights.push([x, H - 0.2, z]);
  { const g = new THREE.BoxGeometry(5, 0.1, 0.5), im = new THREE.InstancedMesh(g, lightMat, lights.length); const M = new THREE.Matrix4(); lights.forEach((p, i) => im.setMatrixAt(i, M.makeTranslation(p[0], p[1], p[2]))); im.name = 'terminal-ceiling-lights'; root.add(im); }
  const hallHalf = big ? 40 : 14;
  if (big) {
    const hall = await loadModel('airport/terminal_hall');
    if (hall) { const h = hall.clone(true); h.rotation.y = Math.PI / 2; h.scale.setScalar(Math.min(1, (D - 2) / 51.4)); h.position.set(0, FLOOR, 0); root.add(h);
      const col = await loadCollision('airport/terminal_hall_col'); if (col) root.userData.hallCol = { col, scale: h.scale.x }; }
  } else {
    // regional: a row of check-in counters with a wall behind, bag scales, a backlit brand wall
    for (let i = 0; i < 4; i++) { const x = -9 + i * 4.5; box(3.6, 1.05, 0.9, x, FLOOR + 0.52, -2, wood); box(0.6, 0.3, 0.7, x + 1.2, FLOOR + 0.15, -3.2, darkSteel, false); }
    box(20, 3, 0.3, -2.25, FLOOR + 1.5, 1.2, new THREE.MeshStandardMaterial({ map: canvasTex(1024, 160, (g, w, h) => { g.fillStyle = '#103a5c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f1e8'; g.font = 'bold 72px Arial'; g.textAlign = 'center'; g.fillText('CONCH COAST AIR', w / 2, 100); }), emissive: 0xffffff, emissiveIntensity: 0.25, emissiveMap: null, roughness: 0.6 }));
  }
  // security checkpoint: scanner arches + x-ray belts + queue posts across the building at |x| = hallHalf (+ 2)
  const arch = (x, z) => { box(0.25, 2.3, 0.6, x, FLOOR + 1.15, z - 0.55, darkSteel); box(0.25, 2.3, 0.6, x, FLOOR + 1.15, z + 0.55, darkSteel); box(0.25, 0.3, 1.4, x, FLOOR + 2.45, z, darkSteel, false); };
  for (const sx of big ? [-1, 1] : [1]) {
    const x0 = sx * (hallHalf + 3);
    for (let z = -D / 2 + 4; z < D / 2 - 4; z += 6) { arch(x0, z); box(4, 0.95, 0.9, x0 - sx * 2.6, FLOOR + 0.48, z + 1.9, darkSteel); }
    for (let z = -D / 2 + 2; z < D / 2 - 1; z += 1.6) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), steel); p.position.set(x0 - sx * 6, FLOOR + 0.5, z); root.add(p); }
  }
  // gate lounges: carpet, seat rows (back to back), gate podiums, hanging gate numbers, departure boards
  const seatsM = [], padsM = [], M = new THREE.Matrix4();
  const gates = (ap.stands || []).filter((st) => st.kind === 'gate');
  const gateInfo = [];
  for (const st of gates) {
    const door = st.door || [st.x, st.z];
    let [gx] = toLocal(door[0], door[1]);
    if (!st.bridge) gx = (gates.indexOf(st) - (gates.length - 1) / 2) * (L / Math.max(2, gates.length)) * 0.9 + (big ? 0 : L * 0.18);   // stairs gates: lounges spread inside the hall
    gx = Math.max(-L / 2 + 10, Math.min(L / 2 - 10, gx));
    const zW = D / 2 - 1.2;
    box(18, 0.02, D * 0.55, gx, FLOOR + 0.01, D * 0.12, carpet, false, false);
    for (let r = 0; r < 3; r++) for (let k = -3; k <= 3; k++) {
      const x = gx + k * 2.2, z = zW - 9 - r * 4.2; if (Math.abs(x) < hallHalf + 8) continue;
      for (const sg of [-1, 1]) { M.makeTranslation(x, FLOOR + 0.42, z + sg * 0.35); seatsM.push(M.clone()); padsM.push(M.clone()); }
      boxes.push([x, FLOOR + 0.45, z, 1.1, 0.45, 0.75]);
    }
    const sign = await loadModel('airport/gate_sign');
    if (sign) { const g = sign.clone(true); g.position.set(gx + 4.5, FLOOR, zW - 3.2); g.rotation.y = Math.PI; root.add(g); boxes.push([gx + 4.5, FLOOR + 0.6, zW - 3.2, 2, 0.6, 0.35]); }
    const num = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 0.15), new THREE.MeshStandardMaterial({ map: canvasTex(320, 120, (g, w, h) => { g.fillStyle = '#16191e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffcf3a'; g.font = 'bold 84px Arial'; g.textAlign = 'center'; g.fillText(st.id, w / 2, 92); }), emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.5 }));
    num.material.emissiveMap = num.material.map; num.position.set(gx, H - 2.2, zW - 6); root.add(num);
    const [wx, wz] = toWorld(gx + 4.5, zW - 4.6);
    gateInfo.push({ id: st.id, stand: st, podium: { x: wx, z: wz, y: gy + FLOOR }, lx: gx });
  }
  if (seatsM.length) {
    const sg = new THREE.BoxGeometry(2.0, 0.08, 0.5), bg = new THREE.BoxGeometry(2.0, 0.1, 0.48);
    const a = new THREE.InstancedMesh(sg, seatMat, seatsM.length), b = new THREE.InstancedMesh(bg, seatPad, padsM.length);
    seatsM.forEach((m, i) => a.setMatrixAt(i, m)); padsM.forEach((m, i) => { const mm = m.clone(); mm.elements[13] += 0.08; b.setMatrixAt(i, mm); });
    a.castShadow = b.castShadow = true; root.add(a, b);
    const back = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 0.55, 0.08), seatPad, seatsM.length); seatsM.forEach((m, i) => { const mm = m.clone(); mm.elements[13] += 0.35; mm.elements[14] += (i % 2 ? 1 : -1) * -0.22; back.setMatrixAt(i, mm); }); root.add(back);
  }
  // departure boards in the hall / lounges (made-up airlines, live flights from the traffic system)
  const board = { tex: null, ctx: null };
  { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; board.ctx = cv.getContext('2d'); board.tex = new THREE.CanvasTexture(cv); board.tex.colorSpace = THREE.SRGBColorSpace; }
  const bm = new THREE.MeshStandardMaterial({ map: board.tex, emissiveMap: board.tex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 });
  for (const x of big ? [-12, 12, -hallHalf - 14, hallHalf + 14] : [6]) { const m = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.2), bm); m.position.set(x, Math.min(H - 2.5, 5.5), big ? -D / 2 + 6 : 1.0); m.rotation.y = 0; root.add(m); }
  function drawBoard(rows) {
    const g = board.ctx, w = 1024, h = 512; g.fillStyle = '#0b0f17'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcf3a'; g.font = 'bold 44px Arial'; g.fillText('DEPARTURES', 30, 58); g.fillStyle = '#8fa0b8'; g.font = '24px Arial'; g.fillText('TIME   FLIGHT     DESTINATION            GATE   STATUS', 30, 104);
    g.font = 'bold 30px "Courier New", monospace';
    rows.slice(0, 8).forEach((r, i) => { const y = 150 + i * 44; g.fillStyle = '#f2f2f2'; g.fillText(`${r.time}  ${r.flight.padEnd(8)}  ${r.dest.slice(0, 18).padEnd(18)}  ${r.gate.padEnd(4)}`, 30, y); g.fillStyle = r.status === 'BOARDING' ? '#41e07a' : r.status === 'DELAYED' ? '#ff6a5c' : '#ffcf3a'; g.fillText(r.status, 820, y); });
    board.tex.needsUpdate = true;
  }
  drawBoard([]);
  // ---- merge the static shell (walls, mullions, columns, counters, signs) per material: a few draw calls instead of hundreds
  { const byMat = new Map(), doorSet = new Set(doors.flatMap((d) => d.lv.map((l) => l.m)));
    for (const o of root.children.slice()) {
      if (!o.isMesh || o.isInstancedMesh || doorSet.has(o) || Array.isArray(o.material)) continue;
      o.updateMatrix(); const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrix);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const L = byMat.get(o.material) || []; L.push({ g, o }); byMat.set(o.material, L);
    }
    for (const [mat, L] of byMat) { if (L.length < 2) continue; const mg = mergeGeometries(L.map((x) => x.g), false); if (!mg) continue;
      const m = new THREE.Mesh(mg, mat); m.castShadow = L.some((x) => x.o.castShadow); m.receiveShadow = true; m.renderOrder = L[0].o.renderOrder; m.name = 'terminal-merged'; root.add(m);
      for (const x of L) { root.remove(x.o); } }
  }
  // ---- colliders
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(T.x, gy, T.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), T.heading)));
  for (const [x, y, z, hx, hy, hz] of boxes) world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z), body);
  if (root.userData.hallCol) { const { col, scale } = root.userData.hallCol; addTrimesh(world, RAPIER, body, { vertices: rotY(col.vertices, Math.PI / 2, scale, FLOOR), indices: col.indices }, 0, 0, 0, 0, 1); }
  const doorCols = doors.map((d) => world.createCollider(RAPIER.ColliderDesc.cuboid(DW / 2, 1.5, 0.08).setTranslation(d.x, FLOOR + 1.5, -D / 2), body));
  // ---- interior test: inside the shell (local box)
  const inside = (x, z, pad = 0) => { const [lx, lz] = toLocal(x, z); return Math.abs(lx) < L / 2 + pad && Math.abs(lz) < D / 2 + pad; };
  return {
    root, gates: gateInfo, inside, toWorld, toLocal, drawBoard, floorY: gy + FLOOR, hallHalf, L, D,
    entrance: (() => { const [x, z] = toWorld(0, -D / 2 - 6); return { x, z }; })(),
    update(dt, pp) {
      const ni = Math.max(0, Math.min(1, game.env?.nightFactor ?? 0)) * 0.35; if (Math.abs(glass.emissiveIntensity - ni) > 0.01) glass.emissiveIntensity = ni;
      if (!pp) return;
      const [lx, lz] = toLocal(pp.x, pp.z);
      if (Math.abs(lx) > L / 2 + 120 || Math.abs(lz) > D / 2 + 120) return;   // doors only matter near the building
      doors.forEach((d, i) => {
        let want = Math.abs(lx - d.x) < 5 && Math.abs(lz + D / 2) < 4.5 ? 1 : 0;
        for (const p of game.peds?.list || []) { if (want) break; const q = p.position || p.root?.position; if (!q) continue; const [ax, az] = toLocal(q.x, q.z); if (Math.abs(ax - d.x) < 4 && Math.abs(az + D / 2) < 3.5) want = 1; }
        d.open += (want - d.open) * Math.min(1, dt * 5);
        for (const l of d.lv) l.m.position.x = l.x0 + l.sg * d.open * (DW / 2 - 0.1);
        try { doorCols[i].setEnabled(d.open < 0.6); } catch (e) { /* */ }
      });
    },
  };
}
function rotY(v, a, sc, y0) { const c = Math.cos(a), s = Math.sin(a), o = new Float32Array(v.length); for (let i = 0; i < v.length; i += 3) { const x = v[i] * sc, y = v[i + 1] * sc, z = v[i + 2] * sc; o[i] = x * c + z * s; o[i + 1] = y + y0; o[i + 2] = -x * s + z * c; } return o; }
