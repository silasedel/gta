// W6 military air base (airports agent, Nov 19): Key West International (the smaller airport) becomes "Southline Air
// Station", a fictional military airfield. No airline traffic, no terminal: a hangar stands where the terminal was.
//   planBase(ap, ctx)            -> { climbSpots, pad, gate } (before the fence: the fence needs the climb spots)
//   buildBase(ap, ctx, plan, F)  -> dressing (hangar, C-130 stand-in, gate checkpoint signs and sandbags, crates at the
//                                   climb spots, helipad), stealable grey jets (game.air), olive Humvees (game.vehicles),
//                                   and the stealth zone config (guards, cameras) for src/gameplay/stealth/zone.js
// The fence (fence.js) is 3.4 m with a concertina coil, climbable only at the climb spots (crates stacked outside; a
// sweeping camera and a patrol cover each one, so it can be done but needs timing). No real-world insignia anywhere.
import * as THREE from 'three';
import { loadModel } from './models.js';
import { pip } from './geom.js';
import { buildHelipad } from './heli.v2.js';

export const BASE_NAME = 'Southline Air Station';
const OLIVE = 0x4b5320;

// perimeter walk: points every `step` m with the inward normal
function walkRing(ring, step) {
  const out = [], n = ring.length; let s = 0;
  for (let k = 0; k < n; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % n], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let d = 0; d < L; d += step) { out.push({ x: ax + ux * d, z: az + uz * d, ux, uz, s: s + d }); }
    s += L;
  }
  for (const p of out) { let nx = -p.uz, nz = p.ux; if (!pip(ring, p.x + nx * 3, p.z + nz * 3)) { nx = -nx; nz = -nz; } p.nx = nx; p.nz = nz; }   // inward
  return { pts: out, L: s };
}

export function planBase(ap, ctx) {
  const { game } = ctx, city = game.city, ring = ap.airside;
  const W = walkRing(ring, 6);
  const gates = ap.fenceGates || [];
  const T = ap.terminal;
  const ok = (p) => {
    if (gates.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 220)) return false;
    if (T && Math.hypot(T.x - p.x, T.z - p.z) < 120) return false;
    for (const k of [-4, 4, -9, 9]) { const x = p.x + p.nx * k, z = p.z + p.nz * k; if (city.isWater?.(x, z)) return false; }
    const g0 = city.groundHeightAt(p.x - p.nx * 4, p.z - p.nz * 4), g1 = city.groundHeightAt(p.x + p.nx * 4, p.z + p.nz * 4);
    if (Math.abs(g0 - g1) > 1.0) return false;
    // not on a runway or taxiway
    for (const r of ap.runways) { const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p.x - r.a[0]) * dx + (p.z - r.a[1]) * dz) / L2)); if (Math.hypot(r.a[0] + dx * t - p.x, r.a[1] + dz * t - p.z) < 90) return false; }
    return true;
  };
  const cands = W.pts.filter(ok);
  const climbSpots = [];
  for (const f of [0.12, 0.42, 0.7]) {   // three spots spread round the perimeter
    let best = null, bd = 1e9; for (const p of cands) { const d = Math.abs(p.s - f * W.L); if (d < bd && climbSpots.every((c) => Math.hypot(c.x - p.x, c.z - p.z) > 400)) { bd = d; best = p; } }
    if (best) climbSpots.push(best);
  }
  // main gate: the landside gate by the old terminal (the one without a road of its own sits on the forecourt)
  const main = gates.find((g) => !g.road) || gates[0], back = gates.find((g) => g !== main) || null;
  const pad = { x: -4566, z: 6128, r: 10 };
  return { climbSpots, main, back, pad, perimeter: W.L };
}

function fenceSign(g) {   // the base's warning signs (fictional, no insignia)
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#b3171d'; g.fillRect(0, 0, 256, 34);
  g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('WARNING', 128, 25);
  g.fillStyle = '#1b1b1b'; g.font = 'bold 17px Arial'; g.fillText('RESTRICTED AREA', 128, 56); g.font = '13px Arial'; g.fillText('Southline Air Station. Use of', 128, 80); g.fillText('deadly force authorized.', 128, 98); g.fillText('Photography prohibited.', 128, 116);
}
export const fenceOpts = { height: 3.4, razor: true, sign: fenceSign };

function signMesh(w, h, draw) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d'); draw(g, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide }));
}

export async function buildBase(ap, ctx, plan, F) {
  const { group, ground, world, RAPIER, game } = ctx;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const out = { jets: [], humvees: [], statics: [] };
  const boxCol = (cx, cy, cz, hx, hy, hz, rotY = 0) => { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY); try { world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }), body); } catch (e) { /* */ } };
  const T = ap.terminal, th = T.heading, fx = Math.sin(th), fz = Math.cos(th), axx = Math.sin(th + Math.PI / 2), axz = Math.cos(th + Math.PI / 2);
  const at = (f, a) => ({ x: T.x + fx * f + axx * a, z: T.z + fz * f + axz * a });
  const grey = (o, hex = 0x6d7379, keepMap = false) => o.traverse((m) => { if (!m.isMesh) return; m.material = [].concat(m.material).map((mt) => { const c = mt.clone(); if (!keepMap) c.map = null; c.color?.setHex(hex); c.roughness = 0.62; c.metalness = 0.35; return c; }); if (m.material.length === 1) m.material = m.material[0]; });
  async function place(path, x, z, heading, scale = 1, col = true, tint = null) {
    const src = await loadModel(path); if (!src) return null;
    const o = src.clone(true), y = ground(x, z); o.position.set(x, y, z); o.rotation.y = heading; o.scale.setScalar(scale); if (tint != null) grey(o, tint); group.add(o);
    if (col) { const bb = new THREE.Box3().setFromObject(src), hx = (bb.max.x - bb.min.x) / 2 * scale, hy = (bb.max.y - bb.min.y) / 2 * scale, hz = (bb.max.z - bb.min.z) / 2 * scale; boxCol(x, y + hy, z, hx, hy, hz, heading); }
    await new Promise((r) => requestAnimationFrame(() => r()));
    return o;
  }
  // the hangar where the terminal stood (long side along the old terminal front), doors to the apron
  const hc = at(6, 0); out.statics.push(await place('buildings/hangar_arch', hc.x, hc.z, th + Math.PI / 2, 1, true));
  // C-130 stand-in: the airline turboprop, 1.4x, plain grey (static set dressing until the user's model arrives)
  const g1 = ap.stands.find((s) => s.id === 'G1') || ap.stands[0];
  if (g1) { const c130 = await place('airport/turboprop', g1.x - 8, g1.z + 2, g1.heading, 1.4, false, 0x5f666c); if (c130) { boxCol(g1.x - 8, ground(g1.x - 8, g1.z + 2) + 3.2, g1.z + 2, 2.4, 2.6, 17, g1.heading); out.statics.push(c130); } }
  // gate checkpoint: big sign, sandbag walls, a stop sign and a second barrier inside the gate
  const mg = plan.main, gs = F?.gates?.find((s) => Math.hypot((s.a.x + s.b.x) / 2 - mg.x, (s.a.z + s.b.z) / 2 - mg.z) < 15);
  if (gs) {
    const mx = (gs.a.x + gs.b.x) / 2, mz = (gs.a.z + gs.b.z) / 2, dx = gs.b.x - gs.a.x, dz = gs.b.z - gs.a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    let ox = -uz, oz = ux; if (pip(ap.airside, mx + ox * 3, mz + oz * 3)) { ox = -ox; oz = -oz; }   // outward
    out.gate = { x: mx, z: mz, ox, oz, ux, uz };
    const big = signMesh(6, 2.2, (g, w, h) => { g.fillStyle = '#2d3324'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9c78a'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#e8dcb0'; g.textAlign = 'center'; g.font = 'bold 50px Arial'; g.fillText('SOUTHLINE AIR STATION', w / 2, h * 0.42); g.font = 'bold 28px Arial'; g.fillText('MAIN GATE  ·  ALL VISITORS STOP FOR INSPECTION', w / 2, h * 0.72); });
    const sx = mx + ox * 14 + ux * (L / 2 + 7), sz = mz + oz * 14 + uz * (L / 2 + 7); big.position.set(sx, ground(sx, sz) + 2.2, sz); big.rotation.y = Math.atan2(ox, oz); group.add(big);
    const legM = new THREE.MeshStandardMaterial({ color: 0x3a3d33 }); for (const k of [-2.6, 2.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), legM); leg.position.set(sx + ux * k, ground(sx, sz) + 1.1, sz + uz * k); group.add(leg); }
    const stop = signMesh(1, 1, (g, w, h) => { g.fillStyle = '#c3121b'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2); } g.fill(); g.fillStyle = '#fff'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', w / 2, h / 2 + 8); });
    const px = mx + ox * 9 - ux * (L / 2 + 1.5), pz = mz + oz * 9 - uz * (L / 2 + 1.5); stop.position.set(px, ground(px, pz) + 2.0, pz); stop.rotation.y = Math.atan2(ox, oz); group.add(stop);
    // sandbag walls (rounded boxes) flanking the approach
    const bagM = new THREE.MeshStandardMaterial({ color: 0x8c7c5a, roughness: 1 }), bagG = new THREE.BoxGeometry(0.62, 0.24, 0.36);
    const bags = []; const wall = (cx, cz, along, n, rows) => { for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) { const k = (i - (n - 1) / 2 + (r % 2) * 0.5) * 0.64; bags.push([cx + along[0] * k, ground(cx, cz) + 0.12 + r * 0.24, cz + along[1] * k, Math.atan2(along[0], along[1]) + Math.PI / 2]); } boxCol(cx, ground(cx, cz) + rows * 0.12, cz, 0.2, rows * 0.12, n * 0.32, Math.atan2(along[0], along[1])); };
    for (const s of [-1, 1]) wall(mx + ox * 18 + ux * s * (L / 2 + 3), mz + oz * 18 + uz * s * (L / 2 + 3), [ox, oz], 7, 4);
    wall(mx - ox * 10 + ux * (L / 2 + 4), mz - oz * 10 + uz * (L / 2 + 4), [ox, oz], 6, 4);
    const im = new THREE.InstancedMesh(bagG, bagM, bags.length); const M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    bags.forEach(([x, y, z, r], i) => { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r + (Math.random() - 0.5) * 0.12); M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, M); });
    im.castShadow = true; im.receiveShadow = true; group.add(im);
    // a second barrier arm inside the gate (red / white, with a collider: no driving straight through)
    const armT = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 8; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff' : '#d01a1a'; g.fillRect(i * 16, 0, 16, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const ix = mx - ox * 7, iz = mz - oz * 7, arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, L), new THREE.MeshStandardMaterial({ map: armT })); arm.position.set(ix, ground(ix, iz) + 1.0, iz); arm.rotation.y = Math.atan2(ux, uz); group.add(arm);
    boxCol(ix, ground(ix, iz) + 0.6, iz, 0.15, 0.6, L / 2, Math.atan2(ux, uz));
  }
  // climb spots: pallets and crates stacked against the outside of the fence (no colliders: the climb needs the fence face)
  const crateM = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }), palM = new THREE.MeshStandardMaterial({ color: 0xa88a5c, roughness: 1 });
  for (const c of plan.climbSpots) {
    const ox = -c.nx, oz = -c.nz, h = Math.atan2(c.ux, c.uz);
    for (const [a, o, s, y, m] of [[2.6, 1.2, [1.2, 0.9, 1.0], 0, crateM], [2.4, 1.3, [1.0, 0.8, 0.9], 0.9, crateM], [-2.4, 1.0, [1.2, 0.14, 1.0], 0, palM], [-2.4, 1.0, [1.2, 0.14, 1.0], 0.14, palM], [-2.6, 1.1, [1.2, 0.14, 1.0], 0.28, palM]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(...s), m); const x = c.x + c.ux * a + ox * o, z = c.z + c.uz * a + oz * o; b.position.set(x, ground(x, z) + y + s[1] / 2, z); b.rotation.y = h + (Math.random() - 0.5) * 0.2; b.castShadow = true; group.add(b);
    }
  }
  // the base helipad, by the tower
  out.pad = buildHelipad(game, plan.pad.x, plan.pad.z, plan.pad.r, group);
  // stealable jets (the user's jets replace these when they arrive): business jets in a dark grey scheme
  const spawnJet = async (x, z, h) => { try { const A = await game.air?.spawn?.('bizjet', new THREE.Vector3(x, 0, z), h, { home: { id: 'base' } }); if (A) { grey(A.mesh, 0x5b6268, true); A.military = true; A.name = 'Grey bizjet (base)'; out.jets.push(A); } } catch (e) { console.warn('[base] jet', e); } };
  const g2 = ap.stands.find((s) => s.id === 'G2'); if (g2) await spawnJet(g2.x, g2.z, g2.heading);
  const ga = ap.gaStands || []; if (ga[2]) await spawnJet(ga[2].x - 6, ga[2].z, ga[2].heading);
  // Humvees (the vehicles agent's humvee1 when it is in the car index, else an olive SUV)
  let hkey = 'suv1'; try { const idx = await (await fetch(((import.meta.env?.BASE_URL) || '/') + 'assets/vehicles/cars/index.json')).json(); if (idx.humvee1) hkey = 'humvee1'; } catch (e) { /* */ }
  const hv = [at(-2, 36), at(-10, 36), out.gate ? { x: out.gate.x - out.gate.ox * 16 + out.gate.ux * 9, z: out.gate.z - out.gate.oz * 16 + out.gate.uz * 9 } : null].filter(Boolean);
  for (const p of hv) { try { const v = await game.vehicles?.spawnParked?.(hkey, { x: p.x, z: p.z, heading: th + Math.PI / 2, color: OLIVE, keepSpot: true, locked: false }); if (v) { v.military = true; out.humvees.push(v); } } catch (e) { console.warn('[base] humvee', e); } }
  out.humveeModel = hkey;
  return out;
}

// guards and cameras for the stealth zone
export function zoneConfig(ap, plan, built, F) {
  const inside = (x, z) => pip(ap.airside, x, z);
  const guards = [], cams = [];
  const T = ap.terminal, th = T.heading, fx = Math.sin(th), fz = Math.cos(th), axx = Math.sin(th + Math.PI / 2), axz = Math.cos(th + Math.PI / 2);
  const at = (f, a) => [T.x + fx * f + axx * a, T.z + fz * f + axz * a];
  const G = built.gate;
  if (G) {
    // two at the booth outside (watching the road), one inside the gate
    guards.push({ x: G.x + G.ox * 5 + G.ux * 4, z: G.z + G.oz * 5 + G.uz * 4, heading: Math.atan2(G.ox, G.oz), range: 40 });
    guards.push({ x: G.x + G.ox * 5 - G.ux * 4, z: G.z + G.oz * 5 - G.uz * 4, heading: Math.atan2(G.ox, G.oz), range: 40 });
    guards.push({ x: G.x - G.ox * 9 - G.ux * 3, z: G.z - G.oz * 9 - G.uz * 3, heading: Math.atan2(-G.ox, -G.oz) + 0.6, range: 45 });
    cams.push({ x: G.x - G.ox * 12 + G.ux * 8, z: G.z - G.oz * 12 + G.uz * 8, yaw: Math.atan2(G.ox, G.oz), sweep: 0.5, period: 8, range: 34 });
  }
  // each climb spot: a sweeping camera and a patrol along the inside of the fence
  for (const c of plan.climbSpots) {
    const cx = c.x + c.nx * 13 + c.ux * 16, cz = c.z + c.nz * 13 + c.uz * 16;
    cams.push({ x: cx, z: cz, yaw: Math.atan2(c.x - cx, c.z - cz), sweep: 1.0, period: 11, range: 36, fov: 0.75 });
    const r = [[c.x + c.nx * 9 - c.ux * 60, c.z + c.nz * 9 - c.uz * 60], [c.x + c.nx * 9 + c.ux * 60, c.z + c.nz * 9 + c.uz * 60]].filter(([x, z]) => inside(x, z));
    if (r.length === 2) guards.push({ route: r, speed: 1.3 });
  }
  // apron patrols (two out of phase), the hangars, the helipad and the tower
  const apron = [at(18, -55), at(18, 55), at(40, 55), at(40, -55)].filter(([x, z]) => inside(x, z));
  if (apron.length >= 3) { guards.push({ route: apron }); guards.push({ route: apron.slice(2).concat(apron.slice(0, 2)) }); }
  const ga = ap.aprons.find((a) => a.id === 'GA');
  if (ga) { const cxz = ga.poly.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]); const r = ga.poly.map(([x, z]) => [x + (cxz[0] - x) * 0.25, z + (cxz[1] - z) * 0.25]); guards.push({ route: r }); }
  const pd = plan.pad; guards.push({ x: pd.x + 14, z: pd.z + 6, heading: Math.atan2(-14, -6), range: 50 });
  cams.push({ x: pd.x + 16, z: pd.z - 12, yaw: Math.atan2(-16, 12), sweep: 0.6, period: 10, range: 40 });
  const tw = ap.tower; guards.push({ x: tw.x + 9, z: tw.z - 3, heading: -1.3, range: 50 });
  cams.push({ x: at(26, -30)[0], z: at(26, -30)[1], yaw: th, sweep: 1.1, period: 14, range: 40 });
  cams.push({ x: at(26, 32)[0], z: at(26, 32)[1], yaw: th, sweep: 1.1, period: 12, range: 40 });
  if (plan.back) { const b = plan.back, p = F?.nearest?.(b.x, b.z, 20); const nx = p ? -p.nx : 0, nz = p ? -p.nz : 0; guards.push({ x: b.x + nx * 8, z: b.z + nz * 8, heading: Math.atan2(-nx, -nz), range: 45 }); cams.push({ x: b.x + nx * 12 + 6, z: b.z + nz * 12, yaw: Math.atan2(-nx, -nz), sweep: 0.5, range: 32 }); }
  // a runway-crossing patrol by vehicle road
  const rw = ap.runways[0], mid = [(rw.a[0] + rw.b[0]) / 2, (rw.a[1] + rw.b[1]) / 2];
  const tA = at(45, 0); if (inside(mid[0] + 60, mid[1]) && inside(tA[0], tA[1])) guards.push({ route: [tA, [mid[0] + 60, mid[1]]], speed: 1.5 });
  return { guards, cams };
}
