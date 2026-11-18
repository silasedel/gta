// r2-physics: what a car feels and keeps when it hits street furniture (user: "if you hit a sign you slow down to some extent
// and the car gets damaged, different depending on speed"). On by default; ?impacts=0 / game.physics.impacts = false turns it off.
//
// game.physics.propImpact(v, { kind, x, y, z, top?, broke? }) -> { J, dv, tier } | null
//   Called by the prop systems when a car breaks / knocks / bends something (src/world/miami/breakables.js, src/world/props/
//   dynamicProps.v2.js). Momentum: the car pays the object's momentum (mass x closing speed x (1 + restitution)) plus the
//   impulse it takes to snap / shear it (PROPS[kind].jBreak), applied at the real contact point on the body, so an off-center
//   hit yaws the car. A light cone barely registers; a sign post takes ~5 % off at 50 km/h; a 4x4 mailbox post ~9 %; a
//   hydrant ~half the speed. Plus a short steering kick and camera jolt.
// game.physics.damageAt(v, worldPoint, { speedKmh, hardness, dir }) -> tier
//   Damage at the contact, persistent on that car: dents (paint, trim, glass and lamp meshes, LOD0 + LOD1) pushed along the
//   impact, scratch / scuff decals projected onto the paint, a smashed lamp (that lamp's vertices go dark, cracked lens) when
//   the hit lands on one, a sagging bumper from 40 km/h, a cracked windshield and a buckled hood on severe frontal hits.
//   Tiers by effective speed (speed x hardness factor): < 15 km/h scuff only; 15-40 dents + scratches; 40-80 deeper dents,
//   broken lights, sagging bumper; > 80 severe (buckled hood, cracked windshield, deep crumple).
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

// mass (kg), snap / shear impulse (N s), hardness 0..1 (damage), restitution
export const PROPS = {
  cone: { m: 3, jb: 0, h: 0.04, e: 0.3 }, channelizer: { m: 5, jb: 20, h: 0.05, e: 0.3 }, barricade: { m: 9, jb: 60, h: 0.12, e: 0.2 },
  bin: { m: 15, jb: 0, h: 0.12, e: 0.2 }, cart: { m: 14, jb: 0, h: 0.12, e: 0.2 }, chair: { m: 4, jb: 0, h: 0.05, e: 0.2 },
  bush: { m: 6, jb: 90, h: 0.02, e: 0 }, fence: { m: 24, jb: 520, h: 0.32, e: 0.1 }, chain: { m: 30, jb: 900, h: 0.38, e: 0.1 },
  signPost: { m: 15, jb: 800, h: 0.5, e: 0.15 }, mailbox: { m: 25, jb: 1300, h: 0.55, e: 0.15 }, meter: { m: 20, jb: 1800, h: 0.7, e: 0.1 },
  bench: { m: 60, jb: 2500, h: 0.6, e: 0.1 }, tree: { m: 40, jb: 2600, h: 0.62, e: 0.1 }, hydrant: { m: 150, jb: 7000, h: 1, e: 0.05 },
  default: { m: 20, jb: 600, h: 0.4, e: 0.15 },
};
const KIND_ALIAS = [[/sign|post/i, 'signPost'], [/mail/i, 'mailbox'], [/hydrant/i, 'hydrant'], [/meter/i, 'meter'], [/bench/i, 'bench'],
  [/cone/i, 'cone'], [/channel|bollard_flex|delineator/i, 'channelizer'], [/barric|jersey/i, 'barricade'], [/cart|bin_wheel/i, 'cart'], [/bin|trash|can/i, 'bin'],
  [/chair|table/i, 'chair'], [/bush|shrub|flower/i, 'bush'], [/chain/i, 'chain'], [/fence|picket|rail/i, 'fence'], [/tree|palm|sapling/i, 'tree']];
// impact sound material by object kind: leaves | wood | metal | concrete | glass | chain
const MAT_OF = [[/bush|shrub|hedge|flower|tree|palm|sapling/i, 'leaves'], [/fence(?!.*chain)|picket|pallet|crate|wood/i, 'wood'], [/chain/i, 'chain'],
  [/glass|window/i, 'glass'], [/wall|building|concrete|jersey|barrier|bollard|curb|planter/i, 'concrete'],
  [/sign|post|pole|lamp|meter|hydrant|mailbox|bin|cart|cone|channel|barric|bench|rail|car|vehicle|kiosk|bike|chair|table/i, 'metal']];
export function materialOf(kind) { for (const [re, m] of MAT_OF) if (re.test(String(kind || ''))) return m; return 'metal'; }
export function propClass(kind) { if (PROPS[kind]) return PROPS[kind]; for (const [re, k] of KIND_ALIAS) if (re.test(String(kind || ''))) return PROPS[k]; return PROPS.default; }

// ---- procedural textures (shared): scratches / scuffs and a windshield crack ----
let scratchTex = null, crackTex = null;
function makeScratch() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  let s = 91; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.clearRect(0, 0, 256, 256);
  // dull scuff: clear coat rubbed off (lighter, matte) with paint transfer smears
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 120); g.addColorStop(0, 'rgba(205,203,198,0.55)'); g.addColorStop(0.6, 'rgba(190,188,182,0.25)'); g.addColorStop(1, 'rgba(190,188,182,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(128, 128, 120, 70, 0, 0, Math.PI * 2); x.fill();
  // scratches along the sweep (horizontal in decal space), bright bare-metal ones near the center, primer gray around
  for (let i = 0; i < 120; i++) {
    const y = 128 + (r() - 0.5) * 140 * (0.4 + r() * 0.6), x0 = 128 + (r() - 0.5) * 220, len = 20 + r() * 110, bright = Math.abs(y - 128) < 40 && r() < 0.5;
    x.strokeStyle = bright ? `rgba(235,236,238,${0.55 + r() * 0.4})` : `rgba(${120 + r() * 60 | 0},${120 + r() * 60 | 0},${118 + r() * 60 | 0},${0.35 + r() * 0.4})`;
    x.lineWidth = 0.6 + r() * (bright ? 1.6 : 1.1);
    x.beginPath(); x.moveTo(x0 - len / 2, y); x.quadraticCurveTo(x0, y + (r() - 0.5) * 8, x0 + len / 2, y + (r() - 0.5) * 6); x.stroke();
  }
  // dark rubber / debris smudges
  for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(30,30,32,${0.12 + r() * 0.2})`; x.beginPath(); x.ellipse(128 + (r() - 0.5) * 160, 128 + (r() - 0.5) * 80, 8 + r() * 26, 3 + r() * 8, (r() - 0.5) * 0.4, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function makeCrack() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.clearRect(0, 0, 256, 256); x.lineCap = 'round';
  // radial cracks from the strike point with branches, then concentric arcs
  for (let i = 0; i < 22; i++) {
    let a = (i / 22) * Math.PI * 2 + r() * 0.2, px = 128, py = 128, L = 30 + r() * 110;
    x.strokeStyle = `rgba(240,244,246,${0.5 + r() * 0.45})`; x.lineWidth = 0.7 + r() * 1.1; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 0.35; px += Math.cos(a) * L / 6; py += Math.sin(a) * L / 6; x.lineTo(px, py); }
    x.stroke();
  }
  for (let ring = 1; ring <= 3; ring++) { x.strokeStyle = `rgba(235,240,242,${0.35})`; x.lineWidth = 0.8; for (let i = 0; i < 18; i++) { const a0 = (i / 18) * Math.PI * 2, a1 = a0 + 0.25 + r() * 0.2, R = ring * 18 + r() * 8; x.beginPath(); x.arc(128, 128, R, a0, a1); x.stroke(); } }
  x.fillStyle = 'rgba(245,248,250,0.8)'; x.beginPath(); x.arc(128, 128, 6, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const decalMat = () => new THREE.MeshStandardMaterial({ map: (scratchTex ||= makeScratch()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.55, metalness: 0.35, name: 'car-scratch' });
const crackMat = () => new THREE.MeshStandardMaterial({ map: (crackTex ||= makeCrack()), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.2, metalness: 0, name: 'car-glass-crack' });

export function installImpacts(game) {
  const P = (game.physics ||= {});
  if (P.impacts == null) P.impacts = !/[?&]impacts=0/.test(globalThis.location?.search || ''); // on by default (verified 17 Nov: sign 18 / 50 km/h); ?impacts=0 = the old flat slowdown
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const ray = new THREE.Raycaster();
  const jolt = { t: 0, amp: 0, yaw: 0, pitch: 0 };
  P.impactLog = [];
  // material sound for a hit: volume and weight scale with the impact speed (real recordings for metal / concrete / glass, synth for
  // leaves / wood / chain-link from src/core/audio.js)
  let sndT = 0;
  function impactSound(kind, kmh, pos) {
    const a = game.audio; if (!a?.play) return null;
    const now = performance.now(); if (now - sndT < 60) return null; sndT = now;
    const m = materialOf(kind), k = Math.max(0.12, Math.min(1, kmh / 70)), at = { x: pos.x, y: pos.y ?? 0.6, z: pos.z };
    try {
      if (m === 'leaves') a.play('impact_leaves', { position: at, volume: 0.5 + 0.5 * k, strength: k });
      else if (m === 'wood') a.play('impact_wood', { position: at, volume: 0.6 + 0.4 * k, strength: k });
      else if (m === 'chain') a.play('impact_rattle', { position: at, volume: 0.6 + 0.4 * k, strength: k });
      else if (m === 'glass') a.play('glass', { position: at, volume: 0.5 + 0.5 * k });
      else if (m === 'concrete') { a.play(k > 0.55 ? 'vehicles:crash_heavy' : 'vehicles:crash_medium', { position: at, volume: 0.6 + 0.4 * k }); a.play('impact_thud', { position: at, volume: 0.7, strength: k }); }
      else a.play(k > 0.45 ? 'vehicles:crash_light' : 'vehicles:clunk', { position: at, volume: 0.45 + 0.55 * k });
    } catch (e) { /* audio optional */ }
    (P.soundLog ||= []).push({ kind, material: m, kmh: +kmh.toFixed(1) }); if (P.soundLog.length > 40) P.soundLog.shift();
    return m;
  }
  P.impactSound = impactSound;
  // driving through bushes: a leafy rustle (and twig snaps) while the player's car pushes through
  let rustleT = 0;
  game.updaters?.push?.(function bushRustle(dt) {
    if ((rustleT -= dt) > 0) return; rustleT = 0.12;
    const v = (game.vehicles?.list || []).find((c) => c.playerDriven); if (!v?.body) return;
    const t = v.body.translation(), lv = v.body.linvel(), sp = Math.hypot(lv.x, lv.z); if (sp < 1.5) return;
    let bd = 0; try { bd = game.city?.bushAt?.(t.x, t.z, 0.9) || 0; } catch (e) { bd = 0; }
    if (bd > 0.05) { impactSound('bush', sp * 3.6 * Math.min(1, bd * 2), t); rustleT = 0.35 - Math.min(0.2, sp * 0.01); }
  });

  // meshes of a car that take dents: every mesh of LOD0 and LOD1 (paint, trim, glass, lamps, textured parts); not wheels
  function bodyMeshes(v) {
    const out = []; const levels = v.car?.lod?.levels || [];
    for (let li = 0; li < Math.min(2, levels.length); li++) levels[li].object.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry?.attributes?.position && !o.userData.r2Decal) out.push({ o, lod: li }); });
    return out;
  }
  function own(o) { if (!o.userData.ownGeo) { o.geometry = o.geometry.clone(); o.userData.ownGeo = true; } return o.geometry; }
  // push vertices within radius along `dir` (shell space, unit), smooth falloff, a little crumple noise; sag pulls down too
  function dent(o, c, dir, depth, radius, sag = 0) {
    const g = own(o), pos = g.attributes.position, r2 = radius * radius; let touched = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), dx = x - c.x, dy = y - c.y, dz = z - c.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const f = 1 - Math.sqrt(d2) / radius, k = f * f * (3 - 2 * f), n = 0.75 + 0.5 * Math.abs(Math.sin(x * 37.1 + y * 11.3 + z * 21.7));
      const a = depth * k * n;
      pos.setXYZ(i, x + dir.x * a, y + dir.y * a - sag * k * (y < c.y + 0.1 ? 1 : 0.3), z + dir.z * a);
      touched++;
    }
    if (touched) { pos.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); }
    return touched;
  }
  // smashed lamp: lamp-channel vertices near the hit go dark (channel 0 = unlit) and gray (broken lens)
  function smashLamp(o, c, radius) {
    const g = o.geometry, ch = g.attributes.aLamp; if (!ch) return 0;
    own(o); const L = o.geometry.attributes.aLamp, pos = o.geometry.attributes.position, col = o.geometry.attributes.color; let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const l = L.getX(i); if (l < 0.5 || l > 13.5) continue;
      const dx = pos.getX(i) - c.x, dy = pos.getY(i) - c.y, dz = pos.getZ(i) - c.z; if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
      L.setX(i, 0); if (col) col.setXYZ(i, col.getX(i) * 0.35 + 0.08, col.getY(i) * 0.35 + 0.08, col.getZ(i) * 0.35 + 0.08); n++;
    }
    if (n) { L.needsUpdate = true; if (col) col.needsUpdate = true; }
    return n;
  }
  function decalOn(v, mesh, worldP, worldN, size, mat, spin = 0) {
    try {
      mesh.updateMatrixWorld(true);
      _m.lookAt(worldP, _w.copy(worldP).add(worldN), new THREE.Vector3(0, 1, 0));
      const e = new THREE.Euler().setFromRotationMatrix(_m); e.z += spin;
      const dg = new DecalGeometry(mesh, worldP, e, new THREE.Vector3(size, size * 0.6, 0.6));
      if (!dg.attributes.position || dg.attributes.position.count < 3) { dg.dispose(); return null; }
      const parent = mesh.parent; parent.updateMatrixWorld(true);
      dg.applyMatrix4(_m.copy(parent.matrixWorld).invert());
      const d = new THREE.Mesh(dg, mat); d.userData.r2Decal = true; d.renderOrder = 3; d.castShadow = false; d.receiveShadow = true;
      parent.add(d); (v._r2Decals ||= []).push(d);
      return d;
    } catch (e) { return null; }
  }
  // tiers by impact speed (the user's spec); the object's hardness scales how deep it goes and whether lamps / hood / glass break
  function tierOf(kmh, hardness) { const ve = hardness < 0.15 ? kmh * 0.4 : kmh; return ve < 15 ? 1 : ve < 40 ? 2 : ve < 80 ? 3 : 4; }

  // damage at a world-space contact on car v (dirWorld: direction of the impact INTO the car, horizontal unit)
  function damageAt(v, worldPoint, o = {}) {
    if (!v?.car?.shell) return 0;
    if (!v.car._r2Wrapped) { // per-car clones and decals are freed with the car
      const d0 = v.car.dispose?.bind(v.car); v.car._r2Wrapped = true;
      v.car.dispose = () => { try { for (const { o: m } of bodyMeshes(v)) if (m.userData.ownGeo && m !== v.car.parts?.paint) m.geometry.dispose(); for (const d of v._r2Decals || []) { d.geometry.dispose(); d.material.dispose(); } } catch (e) { /* */ } d0?.(); };
    }
    const kmh = o.speedKmh ?? (v.speedKmh || 0), hard = o.hardness ?? 0.5, tier = tierOf(kmh, hard);
    // geometry work (dents, decals) only where someone can see it: the player's car or within 60 m of the player
    { const pp = game.player?.position, t0 = v.body.translation(); if (!v.playerDriven && pp && (t0.x - pp.x) ** 2 + (t0.z - pp.z) ** 2 > 3600) return tier; }
    const shell = v.car.shell; shell.updateMatrixWorld(true);
    const inv = _m.copy(shell.matrixWorld).invert();
    // contact on the real surface: ray from just outside the point toward the car's center at that height
    const meshes = bodyMeshes(v), lod0 = meshes.filter((m) => m.lod === 0).map((m) => m.o);
    const t = v.body.translation();
    const dirW = (o.dir ? _n.copy(o.dir) : _n.set(t.x - worldPoint.x, 0, t.z - worldPoint.z)).setY(0).normalize();
    ray.set(_w.copy(worldPoint).addScaledVector(dirW, -0.6), dirW); ray.far = 3;
    const paint = v.car.parts?.paint || lod0[0];
    let hit = null; try { const hs = ray.intersectObjects(lod0, false); hit = hs[0] || null; } catch (e) { hit = null; }
    const wp = hit ? hit.point.clone() : worldPoint.clone();
    const wn = hit?.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dirW.clone().negate();
    const c = wp.clone().applyMatrix4(inv); // shell space
    const dirS = dirW.clone().transformDirection(inv).setY(0).normalize(); // shell space, into the car
    const spec = v.spec || {}, L = spec.L || 4.6, front = c.z > L / 2 - 0.9, rear = c.z < -L / 2 + 0.9;
    const depth = [0, 0.004, 0.028, 0.065, 0.13][tier] * (0.6 + 0.6 * hard), radius = [0, 0.22, 0.32, 0.45, 0.62][tier] * (0.8 + 0.4 * hard);
    const sag = tier >= 3 && (front || rear) && c.y < 0.75 ? 0.025 * (tier - 2) : 0;
    if (tier >= 2) for (const { o: m } of meshes) dent(m, c, dirS, depth, radius, sag);
    // scratches / scuff decal on the paint (always, sized by tier)
    if (paint) decalOn(v, paint, wp, wn, [0, 0.32, 0.5, 0.75, 1.0][tier], decalMat(), (Math.random() - 0.5) * 0.4);
    // a lamp at the contact breaks from tier 3 (or a hard hit in tier 2)
    let lamps = 0; if ((tier >= 3 && hard >= 0.3) || (tier === 2 && hard > 0.8)) for (const m of lod0) lamps += smashLamp(m, c, radius * 0.8);
    for (const { o: m, lod } of meshes) if (lod === 1 && ((tier >= 3 && hard >= 0.3) || (tier === 2 && hard > 0.8))) smashLamp(m, c, radius * 0.8);
    // severe frontal: buckled hood (a crease across it, lifted toward the front) and a cracked windshield
    if (tier >= 4 && front && hard >= 0.45) {
      const belt = spec.belt || 1.0, zc = L / 2 - 0.75;
      for (const { o: m } of meshes) { const g = own(m), pos = g.attributes.position; let n = 0;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (y < belt - 0.12 || z < zc - 0.7 || z > L / 2 - 0.05 || Math.abs(x) > (spec.W || 1.9) / 2 - 0.12) continue;
          const crease = Math.max(0, 1 - Math.abs(z - zc) / 0.45), edge = Math.max(0, (z - zc) / 0.7); pos.setY(i, y + 0.07 * crease * (0.8 + 0.4 * Math.sin(x * 9)) + 0.03 * edge); n++; }
        if (n) { pos.needsUpdate = true; g.computeVertexNormals(); } }
      const glass = (v.car.slots?.glass || [])[0];
      if (glass && !v._r2Cracked) { v._r2Cracked = true; const gp = new THREE.Vector3(0.15 * Math.sign(c.x || 1), belt + 0.28, (spec.zA ?? L / 2 - 1.4) - 0.25).applyMatrix4(shell.matrixWorld);
        const gn = new THREE.Vector3(0, 0.55, 1).normalize().transformDirection(shell.matrixWorld); decalOn(v, glass, gp, gn, 0.9, crackMat()); }
    }
    v._r2Damage = (v._r2Damage || 0) + tier;
    P.impactLog.push({ car: v.typeKey, kmh: +kmh.toFixed(1), tier, hard, at: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], lamps, hit: !!hit });
    if (P.impactLog.length > 50) P.impactLog.shift();
    return tier;
  }

  function propImpact(v, o = {}) {
    if (!P.impacts || !v?.body) return null;
    const C = propClass(o.kind), b = v.body, lv = b.linvel(), t = b.translation();
    const obj = new THREE.Vector3(o.x, (o.y || 0) + Math.min(0.55, (o.top || 1) * 0.5), o.z);
    // contact normal: from the object toward the car center (horizontal); closing speed along it
    const n = _v.set(t.x - obj.x, 0, t.z - obj.z); const dl = n.length() || 1; n.multiplyScalar(1 / dl);
    const vn = -(lv.x * n.x + lv.z * n.z); // > 0: moving into the object
    const speed = Math.hypot(lv.x, lv.z);
    if (!(vn > 0.3)) return null;
    const mCar = b.mass() || v.spec?.mass || 1500;
    let J = C.m * vn * (1 + C.e) + C.jb * Math.min(1.15, 0.55 + vn / 20);
    J = Math.min(J, mCar * vn * 0.92);
    // contact point on the body side facing the object (bumper height), world space
    const cp = obj.clone().addScaledVector(n, 0.15); cp.y = t.y - (v.groundOff || 0.6) + Math.min(0.6, Math.max(0.35, (o.top || 1) * 0.45));
    try { b.applyImpulseAtPoint({ x: n.x * J, y: 0, z: n.z * J }, { x: cp.x, y: cp.y, z: cp.z }, true); } catch (e) { /* */ }
    // steering kick toward the hit side and a camera jolt, both scaled by the speed lost
    const dv = J / mCar;
    try { const r0 = b.rotation(); _q.set(r0.x, r0.y, r0.z, r0.w); const loc = obj.clone().sub(_w.set(t.x, t.y, t.z)).applyQuaternion(_q.invert());
      v.steerCur = (v.steerCur || 0) + Math.sign(loc.x || 0) * Math.min(0.12, dv * 0.05); } catch (e) { /* */ }
    if (v.playerDriven) { jolt.t = 0.25; jolt.amp = Math.min(0.06, 0.006 + dv * 0.012); }
    const tier = damageAt(v, obj, { speedKmh: speed * 3.6, hardness: C.h, dir: n.clone() });
    impactSound(o.kind, vn * 3.6, obj);
    try { v.damage?.(Math.min(140, 2 + tier * tier * 6 * (0.4 + C.h)), null); } catch (e) { /* health only (no second dent: localPoint null) */ }
    return { J: Math.round(J), dv: +dv.toFixed(3), tier };
  }

  // the prop systems detect a hit up to a few meters early (look-ahead against tunneling at low frame rates); the momentum,
  // the damage and the visible break wait until the car's body really reaches the object: deferImpact(v, { x, z, r }, fn)
  const pending = [];
  function deferImpact(v, o, fn, miss) { pending.push({ v, x: o.x, z: o.z, r: o.r || 0.15, fn, miss, t: 0, best: Infinity }); }
  function gapTo(v, x, z) { // distance from the car's body outline (box L x W) to (x, z), in the car frame
    const b = v.body, t = b.translation(), r = b.rotation(); _q.set(r.x, r.y, r.z, r.w).invert();
    const l = _w.set(x - t.x, 0, z - t.z).applyQuaternion(_q), hl = (v.spec?.L || 4.6) / 2, hw = (v.spec?.W || 1.9) / 2;
    const ex = Math.max(0, Math.abs(l.x) - hw), ez = Math.max(0, Math.abs(l.z) - hl); return Math.hypot(ex, ez);
  }
  game.fixedHooks?.push?.(function impactPending(dt) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i]; p.t += dt; let fire = false;
      let g = 0; try { g = gapTo(p.v, p.x, p.z); fire = g <= p.r + 0.05 || p.t > 0.9 || (g > p.best + 0.3 && p.t > 0.1); p.best = Math.min(p.best, g); } catch (e) { fire = true; }
      if (fire) { pending.splice(i, 1); const hit = p.best <= p.r + 0.35 || !p.miss; try { if (hit) p.fn(); else p.miss(); } catch (e) { console.warn('[r2-physics] impact', e); } } // swerved past: the object stays
    }
  });
  // camera jolt (after the camera update: game.updaters run after it)
  game.updaters?.push?.(function impactJolt(dt) {
    if (jolt.t <= 0 || !game.camera) return; jolt.t -= dt;
    const k = Math.max(0, jolt.t / 0.25), a = jolt.amp * k * Math.sin((0.25 - jolt.t) * 70);
    game.camera.rotateX(a * 0.6); game.camera.rotateZ(a * 0.4);
  });
  Object.assign(P, { propImpact, damageAt, deferImpact, propClass, PROPS });
  return P;
}
