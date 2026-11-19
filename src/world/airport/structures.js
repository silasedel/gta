// Airport structures: control towers (the user's Control Tower 1 at Miami International, the smaller Control Tower 2 at
// Key West), hangars, jet bridges at the gates, wind socks (swing with the wind, hang limp in a calm), taxiway signs
// (yellow / black location and direction signs, red runway holding-position signs) and airside ground equipment
// (baggage carts in trains, catering trucks, tugs) around the stands. Colliders from each model's collision mesh.
import * as THREE from 'three';
import { loadModel } from './models.js';
const BOX = new Map();
import { frame, along, polyLen } from './geom.js';

const LOD_FAR = { 'buildings/control_tower': 'buildings/control_tower_lod1', 'buildings/hangar_arch': 'buildings/hangar_arch_lod1', 'buildings/hangar_quonset': 'buildings/hangar_quonset_lod1' };

// a model instance with an optional far LOD (swapped by distance in update)
async function place(path, x, y, z, heading, { group, world, RAPIER, body, col = true, scale = 1, lods }) {
  const src = await loadModel(path); if (!src) return null;
  const o = src.clone(true); o.position.set(x, y, z); o.rotation.y = heading; if (scale !== 1) o.scale.setScalar(scale); group.add(o);
  let far = null;
  if (LOD_FAR[path]) { const fs = await loadModel(LOD_FAR[path]); if (fs) { far = fs.clone(true); far.position.copy(o.position); far.rotation.y = heading; far.scale.copy(o.scale); far.visible = false; group.add(far); lods?.push({ near: o, far, x, z, d: path.includes('tower') ? 900 : 450 }); } }
  if (col) {   // one box from the model's bounds (perf lead, Nov 19: no big trimeshes built during play); jet bridges leave room to walk under
    let bb = BOX.get(path); if (!bb) { bb = new THREE.Box3().setFromObject(src); BOX.set(path, bb); }
    const y0 = path.includes('jet_bridge') ? Math.max(bb.min.y, 3.0) : bb.min.y, hx = (bb.max.x - bb.min.x) / 2 * scale, hy = (bb.max.y - y0) / 2 * scale, hz = (bb.max.z - bb.min.z) / 2 * scale;
    const cx = (bb.max.x + bb.min.x) / 2 * scale, cy = (bb.max.y + y0) / 2 * scale, cz = (bb.max.z + bb.min.z) / 2 * scale, c = Math.cos(heading), sn = Math.sin(heading);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    try { world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x + cx * c + cz * sn, y + cy, z - cx * sn + cz * c).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), body); } catch (e) { /* */ }
  }
  await new Promise((r) => requestAnimationFrame(() => r()));   // spread the placements over frames
  return o;
}

function signTex(text, kind) {   // kind: 'loc' (yellow on black), 'dir' (black on yellow), 'hold' (white on red)
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = kind === 'loc' ? '#121212' : kind === 'hold' ? '#c3121b' : '#f2c21b'; g.fillRect(0, 0, 512, 128);
  if (kind === 'loc') { g.strokeStyle = '#f2c21b'; g.lineWidth = 8; g.strokeRect(10, 10, 492, 108); }
  g.fillStyle = kind === 'loc' ? '#f2c21b' : kind === 'hold' ? '#ffffff' : '#121212'; g.font = 'bold 86px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export async function buildStructures(ap, ctx) {
  const { group, ground, world, RAPIER, game } = ctx;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const C = { ...ctx, body, lods: [] };
  const out = { lods: C.lods, socks: [], props: [] };
  // ---- tower
  if (ap.tower) await place('buildings/' + ap.tower.model, ap.tower.x, ground(ap.tower.x, ap.tower.z), ap.tower.z, ap.tower.heading, C);
  // ---- hangars
  for (const h of ap.hangars || []) await place('buildings/' + h.model, h.x, ground(h.x, h.z), h.z, h.heading, C);
  // ---- jet bridges
  for (const st of ap.stands || []) if (st.jb) await place('buildings/jet_bridge', st.jb.x, ground(st.jb.x, st.jb.z), st.jb.z, st.jb.heading, C);
  // ---- wind socks: a striped frustum on a pole with a swivel; points downwind, droops with little wind
  const sockMat = new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'); for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#ff5a14'; g.fillRect(i * 256 / 5, 0, 256 / 5 + 1, 32); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.8, side: THREE.DoubleSide, emissive: 0x331100, emissiveIntensity: 0 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5, metalness: 0.4 });
  for (const [x, z] of ap.windsocks || []) {
    const y = ground(x, z), g = new THREE.Group(); g.position.set(x, y, z); group.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6.5, 10).translate(0, 3.25, 0), poleMat); pole.castShadow = true; g.add(pole);
    const pivot = new THREE.Group(); pivot.position.y = 6.3; g.add(pivot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 20), poleMat); ring.rotation.y = Math.PI / 2; pivot.add(ring);
    const cone = new THREE.CylinderGeometry(0.18, 0.45, 3.6, 16, 6, true); cone.rotateZ(Math.PI / 2); cone.translate(1.8, 0, 0);   // along +x from the ring
    const sock = new THREE.Mesh(cone, sockMat); sock.castShadow = true; pivot.add(sock);
    // the base pad: a white circle
    const pad = new THREE.Mesh(new THREE.CircleGeometry(4, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); pad.position.y = 0.03; pad.receiveShadow = true; g.add(pad);
    world.createCollider(RAPIER.ColliderDesc.cylinder(3.25, 0.1).setTranslation(x, y + 3.25, z), body);
    out.socks.push({ pivot, sock, yaw: Math.random() * 6, droop: 0.8, flap: Math.random() * 10 });
  }
  // ---- taxiway signs: location sign (black / yellow) at every taxiway's start, holding-position sign (red) at hold bars
  const signG = new THREE.BoxGeometry(1, 1, 1);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.6, metalness: 0.4 });
  const mkSign = (x, z, heading, text, kind) => {
    const w = Math.max(1.4, text.length * 0.42 + 0.6), y = ground(x, z), t = signTex(text, kind);
    const face = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.6 });
    const m = new THREE.Mesh(signG, [legMat, legMat, legMat, legMat, face, face]); m.scale.set(w, 0.9, 0.3); m.position.set(x, y + 0.95, z); m.rotation.y = heading; m.castShadow = true; group.add(m);
    for (const sx of [-0.35, 0.35]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), legMat); l.position.set(x + Math.cos(heading) * sx * w, y + 0.25, z - Math.sin(heading) * sx * w); group.add(l); }
    out.props.push({ m, face, kind });
  };
  for (const t of ap.taxiways) {
    const L = polyLen(t.pts); if (L < 30) continue;
    const a = along(t.pts, Math.min(25, L / 3)), hd = Math.atan2(a.tx, a.tz), side = t.w / 2 + 9;
    mkSign(a.x + a.tz * side, a.z - a.tx * side, hd + Math.PI / 2, t.id, 'loc');
    for (const end of [0, 1]) { const h = t['hold' + end]; if (!h) continue; const rw = ap.runways.find((r) => r.id === h.rw); const sd = t.w / 2 + 8;
      mkSign(h.x + h.tz * sd, h.z - h.tx * sd, Math.atan2(h.tx, h.tz) + Math.PI / 2, (rw?.id || '').replace('/', '-'), 'hold'); }
  }
  // ---- ground equipment at the stands: baggage cart trains, catering truck beside the forward right door, tug
  const rnd = mulberry(ap.id.length * 977 + 13);
  for (const st of ap.stands || []) {
    const hx = Math.sin(st.heading), hz = Math.cos(st.heading), rx = -hz, rz = hx;   // right of the aircraft (nose = heading)
    const big = !!st.bridge, cL = big ? 37.6 : 27.2, ctrBack = cL / 2;
    const P = (fwd, right) => [st.x - hx * ctrBack + hx * fwd + rx * right, st.z - hz * ctrBack + hz * fwd + rz * right];
    // cart train behind the wing, right side
    const n = 2 + Math.floor(rnd() * 3), [cx, cz] = P(-4, big ? 9 : 7);
    for (let k = 0; k < n; k++) { const x = cx - hx * k * 4.6, z = cz - hz * k * 4.6; await place('airport/baggage_cart', x, ground(x, z), z, st.heading + (rnd() - 0.5) * 0.08, { ...C, col: true }); }
    if (big && rnd() < 0.7) { const [tx, tz] = P(8, 8); await place('airport/catering_truck', tx, ground(tx, tz), tz, st.heading + Math.PI / 2 + 0.05, { ...C, col: true }); }
  }
  // GA ramp: a few carts by the hangars
  for (const h of (ap.hangars || []).slice(0, 2)) { const x = h.x + Math.sin(h.heading) * 30, z = h.z + Math.cos(h.heading) * 30; await place('airport/baggage_cart', x, ground(x, z), z, h.heading + 1.2, C); }
  out.update = (dt, cam, t) => {
    const w = game.wind || { vx: 2, vz: 1 }, ws = Math.sqrt((w.vx || 0) ** 2 + (w.vz || 0) ** 2), dir = Math.atan2(w.vz || 0, w.vx || 1);
    const night = game.env?.nightFactor ?? 0;
    for (const s of out.socks) {
      const want = -dir; let d = want - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); s.yaw += d * Math.min(1, dt * 1.5);
      const lift = Math.min(1, ws / 7.5); s.flap += dt * (3 + ws);
      s.pivot.rotation.set(0, s.yaw + Math.sin(s.flap) * 0.05 * lift, 0);
      s.sock.rotation.z = -(1 - lift) * 1.25 + Math.sin(s.flap * 1.7) * 0.04 * lift;
    }
    if (sockMat.emissiveIntensity !== night * 0.6) sockMat.emissiveIntensity = night * 0.6;
    for (const p of out.props) p.face.emissiveIntensity = 0.05 + night * 0.9;
    if (cam) for (const l of out.lods) { const dx = cam.position.x - l.x, dz = cam.position.z - l.z, far = dx * dx + dz * dz > l.d * l.d; if (l.far.visible !== far) { l.far.visible = far; l.near.visible = !far; } }
  };
  return out;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { frame };
