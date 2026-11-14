// POLICE track: ground props for the police systems. Original procedural models, real scale (meters), PBR materials with
// canvas-drawn detail. Pure builders: buildX(THREE, opts) -> { group, ...api }. Preview: src/gameplay/police/preview.html
import { PSPD, rng, canvasTex, grain, surfaceTex, pbr, glow, mesh, box, cyl, sph, geo, drawBadge, hazardTex } from './modelKit.js';

const M = {
  get galv() { return pbr('galv', '#9aa1a6', { metal: 0.75, rough: 0.5, streaks: 10, scuffs: 12 }); },
  get dark() { return pbr('darkmetal', '#23262b', { metal: 0.6, rough: 0.55, scuffs: 18 }); },
  get black() { return pbr('blackplastic', '#15171a', { rough: 0.75, scuffs: 8 }); },
  get rubber() { return pbr('rubber', '#1b1b1c', { rough: 0.95, grain: 0.12 }); },
  get white() { return pbr('whitepaint', '#e9e9e4', { rough: 0.5, streaks: 6, scuffs: 14 }); },
  get navy() { return pbr('navypaint', PSPD.navy, { rough: 0.45, metal: 0.2, scuffs: 16 }); },
  get steel() { return pbr('steel', '#c4c8cc', { metal: 0.95, rough: 0.28, scuffs: 20 }); },
  get orange() { return pbr('coneorange', '#f0621a', { rough: 0.7, streaks: 8, scuffs: 14, grain: 0.1 }); },
  get concrete() { return pbr('concrete', '#8c8a84', { rough: 0.95, grain: 0.16, streaks: 6 }); },
  get lens() { return pbr('lens', '#0a0c10', { rough: 0.08, metal: 0.9, grain: 0.02 }); },
};

// ------------------------------------------------------------------ witness marker (sprite above a caller's head)
// Our own glyph: a handset inside a ring that fills as the call goes through; a running figure when they have no phone.
export function buildWitnessMarker(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true }) /* occluded by buildings and roofs (playtest P2) */;
  const sprite = new THREE.Sprite(mat); sprite.scale.setScalar(0.62); sprite.renderOrder = 999; sprite.userData.ownTex = true;
  let last = -1, lastMode = '';
  function set(k, mode = 'call') {
    const q = Math.round(Math.max(0, Math.min(1, k)) * 24);
    if (q === last && mode === lastMode) return; last = q; lastMode = mode;
    g.clearRect(0, 0, 96, 96);
    g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fillStyle = 'rgba(12,16,24,.86)'; g.fill();
    g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,.2)'; g.stroke();
    g.beginPath(); g.arc(48, 48, 40, -Math.PI / 2, -Math.PI / 2 + (q / 24) * Math.PI * 2); g.strokeStyle = mode === 'run' ? '#ffd27a' : '#ff5a5a'; g.lineCap = 'round'; g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    if (mode === 'run') { // running figure: they are looking for a phone
      g.beginPath(); g.arc(56, 28, 6.5, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.beginPath(); g.moveTo(52, 38); g.lineTo(44, 54); g.lineTo(54, 62); g.lineTo(50, 76); g.moveTo(44, 54); g.lineTo(32, 62); g.lineTo(26, 72); g.moveTo(50, 42); g.lineTo(38, 42); g.lineTo(32, 50); g.moveTo(52, 42); g.lineTo(64, 48); g.lineTo(70, 42); g.stroke();
    } else { // handset with signal arcs
      g.save(); g.translate(46, 50); g.rotate(-0.6);
      g.beginPath(); g.roundRect(-20, -6, 40, 12, 6); g.fill();
      g.beginPath(); g.roundRect(-22, -4, 13, 17, 5); g.fill(); g.beginPath(); g.roundRect(9, -4, 13, 17, 5); g.fill();
      g.restore();
      g.lineWidth = 3.5; g.beginPath(); g.arc(56, 36, 10, -1.25, 0.1); g.stroke(); g.beginPath(); g.arc(56, 36, 17, -1.25, 0.1); g.stroke();
    }
    tex.needsUpdate = true;
  }
  set(0);
  return { sprite, set, dispose() { tex.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------ traffic enforcement camera
export function buildTrafficCamera(THREE, o = {}) {
  const r = rng(o.seed || 11), group = new THREE.Group();
  const cabTex = canvasTex('tc:cab', 128, 160, (g, w, h) => { g.fillStyle = '#8f979c'; g.fillRect(0, 0, w, h); grain(g, w, h, { a: 0.1, streaks: 8, scuffs: 10 }); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16); for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(24, 26 + i * 7, w - 48, 3); } g.fillStyle = '#16181c'; g.fillRect(w - 26, h / 2 - 8, 10, 16); g.fillStyle = PSPD.navy; g.fillRect(18, h - 44, 52, 22); g.fillStyle = '#fff'; g.font = 'bold 13px Arial'; g.fillText('PSPD', 24, h - 28); });
  const signTex = canvasTex('tc:sign', 256, 160, (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#16181c'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#16181c'; g.textAlign = 'center'; g.font = '900 44px Arial'; g.fillText('PHOTO', w / 2, 66); g.fillText('ENFORCED', w / 2, 116); g.font = 'bold 15px Arial'; g.fillText('SOUTHLINE TRAFFIC DIVISION', w / 2, 142); grain(g, w, h, { a: 0.08, streaks: 5, scuffs: 6 }); }, { clamp: true });
  const galv = M.galv, dark = M.dark;
  // mast with base plate, bolts and a control cabinet
  group.add(mesh(cyl(0.085, 0.11, 5.6, 14), galv, 0, 2.8, 0));
  group.add(mesh(cyl(0.2, 0.22, 0.05, 14), galv, 0, 0.025, 0));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; group.add(mesh(cyl(0.018, 0.018, 0.06, 6), M.steel, Math.cos(a) * 0.16, 0.07, Math.sin(a) * 0.16)); }
  const cab = mesh(box(0.42, 0.7, 0.26), new THREE.MeshStandardMaterial({ map: cabTex, roughness: 0.55, metalness: 0.6 }), 0.34, 0.75, 0); group.add(cab);
  group.add(mesh(box(0.46, 0.04, 0.3), galv, 0.34, 1.12, 0)); group.add(mesh(box(0.3, 0.4, 0.2), M.concrete, 0.34, 0.2, 0));
  // arm toward the junction (+Z) with the camera housing, sunshield, flash and radar
  const arm = mesh(cyl(0.05, 0.06, 2.4, 10), galv, 0, 5.35, 1.15, { rx: Math.PI / 2 }); group.add(arm);
  group.add(mesh(cyl(0.035, 0.035, 1.5, 8), galv, 0, 4.9, 0.6, { rx: Math.PI / 2 - 0.62 }));
  const head = new THREE.Group(); head.position.set(0, 5.2, 2.2); head.rotation.x = 0.36; group.add(head);
  head.add(mesh(box(0.26, 0.22, 0.52), M.white, 0, 0, 0));
  head.add(mesh(box(0.3, 0.025, 0.62), M.white, 0, 0.125, 0.06));
  head.add(mesh(cyl(0.07, 0.075, 0.08, 16), dark, 0, 0, 0.29, { rx: Math.PI / 2 }));
  const lens = mesh(cyl(0.055, 0.055, 0.02, 16), M.lens, 0, 0, 0.335, { rx: Math.PI / 2 }); head.add(lens);
  head.add(mesh(box(0.05, 0.1, 0.05), dark, 0, 0.16, -0.15));
  const flashMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.25, map: surfaceTex('flashglass', '#e6e8ea', { a: 0.06 }) });
  const fl = new THREE.Group(); fl.position.set(0.42, 5.2, 2.1); fl.rotation.x = 0.36; group.add(fl);
  fl.add(mesh(box(0.3, 0.2, 0.18), dark, 0, 0, 0)); fl.add(mesh(box(0.26, 0.16, 0.02), flashMat, 0, 0, 0.1));
  group.add(mesh(box(0.5, 0.05, 0.05), galv, 0.2, 5.33, 2.1));
  const radar = mesh(box(0.2, 0.2, 0.08), M.white, -0.36, 5.2, 2.1, { rx: 0.36 }); group.add(radar);
  group.add(mesh(box(0.42, 0.05, 0.05), galv, -0.18, 5.33, 2.1));
  const sign = mesh(geo('tcsign', () => new THREE.PlaneGeometry(0.62, 0.39)), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }), 0, 3.0, 0.1); group.add(sign);
  group.add(mesh(box(0.66, 0.43, 0.012), galv, 0, 3.0, 0.09));
  const led = mesh(sph(0.012, 6, 5), glow('tcled', 0xff2a2a, 3), 0.08, 0.06, 0.262); head.add(led);
  const light = new THREE.PointLight(0xffffff, 0, 40, 1.6); light.position.set(0.42, 5.1, 2.3); group.add(light);
  let ft = 0, t = r() * 6;
  return {
    group, lens,
    flash() { ft = 0.22; },
    update(dt) { t += dt; led.material = glow((t % 1.6) < 0.8 ? 'tcled' : 'tcledoff', (t % 1.6) < 0.8 ? 0xff2a2a : 0x220000, (t % 1.6) < 0.8 ? 3 : 0.4); if (ft > 0 || light.intensity > 0) { ft -= dt; const k = Math.max(0, ft / 0.22); flashMat.emissiveIntensity = 0.05 + k * 30; light.intensity = k * 900; } },
    dispose() { flashMat.dispose(); cab.material.dispose(); sign.material.dispose(); },
  };
}

// ------------------------------------------------------------------ store camera recorder (DVR)
export function buildRecorder(THREE, o = {}) {
  const r = rng(o.seed || 5), group = new THREE.Group();
  const face = (dead) => canvasTex('dvr:' + (dead ? 'dead' : 'live'), 256, 64, (g, w, h) => {
    g.fillStyle = '#1a1c20'; g.fillRect(0, 0, w, h); grain(g, w, h, { a: 0.1, scuffs: 6 });
    g.fillStyle = '#0c0d10'; for (let i = 0; i < 4; i++) g.fillRect(10 + i * 34, 12, 30, 40); // drive bays
    g.strokeStyle = 'rgba(255,255,255,.14)'; for (let i = 0; i < 4; i++) g.strokeRect(10.5 + i * 34, 12.5, 29, 39);
    g.fillStyle = dead ? '#06080a' : '#0f3a2a'; g.fillRect(154, 14, 58, 22); g.fillStyle = dead ? '#111' : '#7dffb0'; g.font = 'bold 11px monospace'; if (!dead) { g.fillText('REC  4CH', 158, 24); g.fillText('00:' + String(10 + ((r() * 49) | 0)), 158, 34); }
    g.fillStyle = '#c9cdd2'; g.font = 'bold 12px Arial'; g.fillText('VIGILO', 154, 52); g.font = '8px Arial'; g.fillText('NVR-4', 204, 52);
    g.fillStyle = '#2a2d33'; g.beginPath(); g.arc(234, 30, 9, 0, 6.3); g.fill();
    if (dead) { g.strokeStyle = 'rgba(220,225,230,.7)'; g.lineWidth = 1.2; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(120 + r() * 30, 30 + r() * 8); g.lineTo(60 + r() * 180, r() * 64); g.stroke(); } g.fillStyle = '#050506'; g.beginPath(); g.ellipse(132, 32, 26, 15, 0.2, 0, 6.3); g.fill(); }
  }, { clamp: true });
  const body = mesh(box(0.44, 0.09, 0.3), M.dark, 0, 0.045, 0); group.add(body);
  const frontMat = new THREE.MeshStandardMaterial({ map: face(false), roughness: 0.5, metalness: 0.3 });
  const front = mesh(geo('dvrf', () => new THREE.PlaneGeometry(0.44, 0.09)), frontMat, 0, 0.045, 0.151); group.add(front);
  for (const x of [-0.19, 0.19]) group.add(mesh(box(0.03, 0.012, 0.26), M.rubber, x, -0.004, 0));
  group.add(mesh(box(0.4, 0.004, 0.2), pbr('vent', '#101114', { rough: 0.8, grain: 0.2 }), 0, 0.092, -0.02));
  const leds = [];
  for (let i = 0; i < 3; i++) { const l = mesh(sph(0.006, 6, 4), glow('dvr' + i, i === 2 ? 0xffb020 : 0x30ff70, 3), 0.13 + i * 0.022, 0.066, 0.153); group.add(l); leds.push(l); }
  // cables out the back, one to the wall
  const cableMat = M.rubber;
  for (let i = 0; i < 3; i++) { const c = mesh(cyl(0.006, 0.006, 0.22, 5), cableMat, -0.12 + i * 0.1, 0.03, -0.24, { rx: Math.PI / 2 - 0.25 + i * 0.1 }); group.add(c); }
  const dangle = mesh(cyl(0.006, 0.006, 0.3, 5), cableMat, 0.2, -0.05, -0.2, { rz: 0.5 }); dangle.visible = false; group.add(dangle);
  let dead = false, t = r() * 9;
  return {
    group, size: { x: 0.44, y: 0.09, z: 0.3 },
    setDestroyed(on) { dead = !!on; frontMat.map = face(dead); frontMat.needsUpdate = true; dangle.visible = dead; body.rotation.z = dead ? 0.06 : 0; front.rotation.z = body.rotation.z; for (const l of leds) l.visible = !dead; },
    update(dt, tt) { if (dead) return; t += dt; leds[0].visible = (t * 3 % 1) < 0.6; leds[2].visible = (t * 0.9 % 1) < 0.5; },
  };
}

// ------------------------------------------------------------------ spike strip (our own accordion design)
export function buildSpikeStrip(THREE, o = {}) {
  const L = o.length || 7, group = new THREE.Group(), N = Math.round(L / 0.25);
  const frameMat = pbr('spikeframe', '#2c2f33', { metal: 0.7, rough: 0.5, scuffs: 20 });
  const caseMat = pbr('spikecase', '#c9871a', { rough: 0.6, scuffs: 16, streaks: 4 });
  const links = new THREE.Group(); group.add(links);
  // scissor links: two instanced sets of flat bars crossing, plus hollow spikes on the pivots
  const barG = geo('spikebar', () => new THREE.BoxGeometry(0.36, 0.012, 0.022));
  const spikeG = geo('spike', () => { const g = new THREE.ConeGeometry(0.011, 0.07, 6); g.translate(0, 0.045, 0); return g; });
  const bars = new THREE.InstancedMesh(barG, frameMat, N * 2), spikes = new THREE.InstancedMesh(spikeG, M.steel, N * 3);
  bars.castShadow = true; spikes.castShadow = true; links.add(bars, spikes);
  const caseBox = mesh(box(0.34, 0.12, 0.42), caseMat, -L / 2 - 0.1, 0.06, 0); group.add(caseBox);
  group.add(mesh(box(0.36, 0.02, 0.44), M.dark, -L / 2 - 0.1, 0.13, 0));
  const handle = mesh(geo('spikehandle', () => new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI)), M.dark, -L / 2 - 0.1, 0.14, 0); group.add(handle);
  const cord = mesh(cyl(0.004, 0.004, 1, 5), pbr('cord', '#e8e2c8', { rough: 0.9 }), 0, 0.012, 0, { rz: Math.PI / 2 }); group.add(cord);
  const endCap = mesh(box(0.05, 0.04, 0.4), M.dark, 0, 0.02, 0); group.add(endCap);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), e = new THREE.Euler();
  let k = -1;
  function setDeployed(kk) {
    kk = Math.max(0.02, Math.min(1, kk)); if (Math.abs(kk - k) < 0.002) return; k = kk;
    const pitch = (L / N) * kk, ang = Math.acos(Math.min(0.999, pitch / 0.36)); // bars fold up as the strip closes
    const x0 = -L / 2 + 0.1;
    for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * pitch;
      for (let b = 0; b < 2; b++) { e.set(0, (b ? 1 : -1) * ang, 0); q.setFromEuler(e); p.set(x, 0.012 + b * 0.012, 0); m4.compose(p, q, s1); bars.setMatrixAt(i * 2 + b, m4); }
      const hz = Math.sin(ang) * 0.18;
      for (let s = 0; s < 3; s++) { e.set(s === 1 ? 0 : (s === 0 ? -0.35 : 0.35), 0, 0); q.setFromEuler(e); p.set(x + (s === 1 ? 0 : pitch / 2), 0.024, s === 1 ? 0 : (s === 0 ? -hz : hz)); m4.compose(p, q, s1); spikes.setMatrixAt(i * 3 + s, m4); }
    }
    bars.instanceMatrix.needsUpdate = true; spikes.instanceMatrix.needsUpdate = true;
    const xe = x0 + N * pitch;
    endCap.position.x = xe + 0.02; cord.scale.y = Math.max(0.05, 0.9 * kk); cord.position.x = xe + 0.05 + 0.45 * kk;
    bars.computeBoundingSphere(); spikes.computeBoundingSphere();
  }
  setDeployed(o.deployed ?? 1);
  return { group, length: L, setDeployed };
}

// ------------------------------------------------------------------ barriers, cones, flares, lockdown wedge
export function buildBarrier(THREE, kind = 'sawhorse', o = {}) {
  const r = rng(o.seed || 3), group = new THREE.Group();
  let size = { x: 1, y: 1, z: 0.4 }, update = null, extra = {};
  if (kind === 'sawhorse') {
    const stripe = canvasTex('saw:stripe', 256, 32, (g, w, h) => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8641a'; for (let i = -1; i < 9; i++) { g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 16, h); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.fill(); } g.fillStyle = PSPD.navy; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.fillText('POLICE LINE · PSPD · DO NOT CROSS', w / 2, 21); grain(g, w, h, { a: 0.12, scuffs: 10, seed: 9 }); }, { clamp: true });
    const boardM = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.55 });
    group.add(mesh(box(3, 0.24, 0.04), boardM, 0, 0.98, 0)); group.add(mesh(box(3, 0.14, 0.03), boardM, 0, 0.6, 0));
    const leg = pbr('sawleg', '#d8d4c4', { rough: 0.8, streaks: 6, scuffs: 10 });
    for (const x of [-1.25, 1.25]) for (const s of [-1, 1]) group.add(mesh(box(0.07, 1.16, 0.045), leg, x, 0.56, s * 0.2, { rx: s * -0.33 }));
    for (const x of [-1.25, 1.25]) group.add(mesh(box(0.07, 0.04, 0.3), leg, x, 0.42, 0));
    const lamps = [];
    for (const x of [-1.25, 1.25]) { group.add(mesh(box(0.14, 0.08, 0.1), M.black, x, 1.15, 0)); const l = mesh(cyl(0.08, 0.08, 0.05, 12), glow('amber' + x, 0xffa010, 2.5), x, 1.24, 0.03, { rx: Math.PI / 2 }); group.add(l); lamps.push(l); }
    size = { x: 3, y: 1.1, z: 0.44 };
    update = (dt, t) => { const on = (t * 1.4 % 1) < 0.5; lamps[0].visible = on; lamps[1].visible = !on; };
  } else if (kind === 'jersey') {
    const prof = geo('jersey', () => { const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.12); s.lineTo(0.14, 0.4); s.lineTo(0.1, 0.9); s.lineTo(-0.1, 0.9); s.lineTo(-0.14, 0.4); s.lineTo(-0.3, 0.12); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }); g.translate(0, 0, -1); g.rotateY(Math.PI / 2); return g; });
    const tex = canvasTex('jersey:' + (o.color || 'w'), 256, 128, (g, w, h) => { g.fillStyle = o.color === 'navy' ? PSPD.navy : '#e9e6dc'; g.fillRect(0, 0, w, h); grain(g, w, h, { a: 0.14, streaks: 12, scuffs: 24, seed: 21 }); g.fillStyle = o.color === 'navy' ? '#fff' : PSPD.navy; g.font = '900 30px Arial'; g.textAlign = 'center'; g.fillText('PSPD', w / 2, 60); drawBadge(g, 40, 50, 18); }, {});
    group.add(mesh(prof, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })));
    for (const x of [-0.6, 0.6]) group.add(mesh(cyl(0.05, 0.05, 0.03, 10), M.black, x, 0.915, 0));
    size = { x: 2, y: 0.9, z: 0.6 };
  } else if (kind === 'cone') {
    const tex = canvasTex('cone', 64, 128, (g, w, h) => { g.fillStyle = '#f0621a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; g.fillRect(0, 36, w, 20); g.fillRect(0, 68, w, 12); grain(g, w, h, { a: 0.16, streaks: 10, scuffs: 14, seed: 2 }); g.fillStyle = 'rgba(40,30,20,.35)'; g.fillRect(0, 104, w, 24); }, {});
    group.add(mesh(geo('coneg', () => new THREE.CylinderGeometry(0.035, 0.15, 0.66, 16, 1, true)), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }), 0, 0.36, 0));
    group.add(mesh(box(0.38, 0.03, 0.38), M.rubber, 0, 0.015, 0));
    size = { x: 0.38, y: 0.7, z: 0.38 };
  } else if (kind === 'flare') {
    group.add(mesh(cyl(0.012, 0.012, 0.24, 8), pbr('flarebody', '#b01818', { rough: 0.7 }), 0, 0.014, 0, { rz: Math.PI / 2 }));
    const tip = mesh(sph(0.03, 8, 6), glow('flare', 0xff3018, 12), 0.13, 0.03, 0); group.add(tip);
    const sprMat = new THREE.SpriteMaterial({ map: canvasTex('flareglow', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,230,200,1)'); gr.addColorStop(0.25, 'rgba(255,90,40,.7)'); gr.addColorStop(1, 'rgba(255,40,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, { clamp: true }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const spr = new THREE.Sprite(sprMat); spr.position.set(0.13, 0.08, 0); spr.scale.setScalar(0.5); group.add(spr);
    const light = o.light === false ? null : new THREE.PointLight(0xff4020, 6, 9, 2); if (light) { light.position.set(0.13, 0.25, 0); group.add(light); }
    const ph = r() * 9;
    update = (dt, t) => { const f = 0.75 + 0.25 * Math.sin(t * 31 + ph) * Math.sin(t * 17.3 + ph); spr.scale.setScalar(0.42 + f * 0.2); if (light) light.intensity = 5 * f; };
    size = { x: 0.3, y: 0.1, z: 0.1 }; extra.light = light;
  } else if (kind === 'wedge') {
    // heavy road-closure wedge for bridge lockdowns: steel plate that rises out of a ground frame
    const W = o.width || 3.5;
    const haz = new THREE.MeshStandardMaterial({ map: hazardTex('wedge'), roughness: 0.55, metalness: 0.4 }); haz.map.repeat.set(W / 1.2, 1);
    group.add(mesh(box(W + 0.3, 0.08, 1.5), M.dark, 0, 0.04, 0));
    const plate = new THREE.Group(); plate.position.set(0, 0.08, 0.7); group.add(plate);
    const p1 = mesh(box(W, 0.06, 1.45), haz, 0, 0, -0.72); plate.add(p1);
    plate.add(mesh(box(W, 0.2, 0.08), M.dark, 0, -0.07, -1.42));
    const rams = [];
    for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) { const ram = mesh(cyl(0.05, 0.05, 1, 8), M.steel, x, 0.3, -0.2); group.add(ram); rams.push(ram); }
    const beacons = [];
    for (const x of [-W / 2 - 0.05, W / 2 + 0.05]) { group.add(mesh(cyl(0.07, 0.09, 1.1, 10), M.navy, x, 0.55, 0.6)); const b = mesh(sph(0.075, 10, 8), glow('wedgeb' + x, 0xff2020, 5), x, 1.16, 0.6); group.add(b); beacons.push(b); }
    let raised = -1;
    extra.setRaised = (k) => { k = Math.max(0, Math.min(1, k)); if (k === raised) return; raised = k; plate.rotation.x = -k * 0.72; for (const ram of rams) { ram.scale.y = 0.15 + k * 0.85; ram.position.y = 0.08 + ram.scale.y * 0.5; ram.rotation.x = -0.25 * k; } };
    extra.setRaised(o.raised ?? 1);
    update = (dt, t) => { const on = (t * 2 % 1) < 0.5; beacons[0].visible = on; beacons[1].visible = !on; };
    size = { x: W, y: 1.0, z: 1.5 };
  }
  return { group, size, update: update || (() => {}), ...extra };
}

// ------------------------------------------------------------------ walk-through metal detector
export function buildMetalDetector(THREE, o = {}) {
  const group = new THREE.Group();
  const shell = pbr('mdshell', '#d9dcdf', { rough: 0.45, metal: 0.25, scuffs: 14 });
  const stripTex = (state) => canvasTex('md:strip:' + state, 16, 256, (g, w, h) => { g.fillStyle = '#0d0f12'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { g.fillStyle = state === 'alarm' ? '#ff2a2a' : state === 'ok' ? '#30ff70' : '#1d6a54'; g.fillRect(3, 6 + i * 15.6, w - 6, 9); } }, { clamp: true });
  const stripMat = new THREE.MeshStandardMaterial({ map: stripTex('idle'), emissiveMap: stripTex('idle'), emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.4 });
  for (const s of [-1, 1]) {
    group.add(mesh(box(0.16, 2.08, 0.58), shell, s * 0.48, 1.06, 0));
    group.add(mesh(box(0.2, 0.04, 0.66), M.rubber, s * 0.48, 0.02, 0));
    group.add(mesh(geo('mdstrip', () => new THREE.PlaneGeometry(0.035, 1.8)), stripMat, s * 0.48, 1.1, 0.292));
    group.add(mesh(geo('mdstrip', () => new THREE.PlaneGeometry(0.035, 1.8)), stripMat, s * 0.48, 1.1, -0.292, { ry: Math.PI }));
  }
  group.add(mesh(box(1.12, 0.2, 0.58), shell, 0, 2.2, 0));
  const panelTex = canvasTex('md:panel', 256, 64, (g, w, h) => { g.fillStyle = '#14171b'; g.fillRect(0, 0, w, h); g.fillStyle = '#9fe0ff'; g.font = 'bold 20px monospace'; g.fillText('VIGILO  GATE-6', 14, 28); g.font = '13px monospace'; g.fillStyle = '#7dffb0'; g.fillText('ZONES 6 · SENS 4 · READY', 14, 50); grain(g, w, h, { a: 0.06 }); }, { clamp: true });
  group.add(mesh(geo('mdpanel', () => new THREE.PlaneGeometry(0.6, 0.15)), new THREE.MeshStandardMaterial({ map: panelTex, emissiveMap: panelTex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3 }), 0, 2.2, 0.292));
  let st = 'idle', at = 0;
  return {
    group, size: { x: 1.12, y: 2.3, z: 0.6 }, opening: { width: 0.8, height: 2.08 },
    alarm(on) { st = on ? 'alarm' : 'idle'; at = on ? 2.5 : 0; stripMat.map = stripMat.emissiveMap = stripTex(st); stripMat.needsUpdate = true; },
    pass() { st = 'ok'; at = 1.2; stripMat.map = stripMat.emissiveMap = stripTex(st); stripMat.needsUpdate = true; },
    update(dt, t) { if (at > 0) { at -= dt; stripMat.emissiveIntensity = st === 'alarm' ? ((t * 6 % 1) < 0.5 ? 2.4 : 0.5) : 1.2; if (at <= 0) { st = 'idle'; stripMat.map = stripMat.emissiveMap = stripTex('idle'); stripMat.emissiveIntensity = 0.7; stripMat.needsUpdate = true; } } },
  };
}

// ------------------------------------------------------------------ impound yard kit
export function buildImpoundLot(THREE, o = {}) {
  const W = o.width || 34, D = o.depth || 26, r = rng(o.seed || 17), group = new THREE.Group(), colliders = [], lights = [];
  const padTex = canvasTex('imp:pad', 512, 512, (g, w, h) => {
    g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, w, h); grain(g, w, h, { a: 0.22, n: 9000, seed: 5 });
    g.strokeStyle = 'rgba(15,15,15,.6)'; g.lineWidth = 1.5; for (let i = 0; i < 16; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h, rr = 8 + r() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(8,8,10,.55)'); gr.addColorStop(1, 'rgba(8,8,10,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  }, {});
  const padMat = new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.95 }); padMat.map.repeat.set(W / 12, D / 12);
  const pad = mesh(geo(`imp:pad${W},${D}`, () => new THREE.PlaneGeometry(W, D)), padMat, 0, 0.03, 0, { rx: -Math.PI / 2, shadow: false }); group.add(pad);
  // stalls with painted numbers
  const stalls = [];
  const nS = Math.floor((W - 8) / 3.1), lineM = pbr('stallpaint', '#e8e4d0', { rough: 0.85, grain: 0.2 });
  for (let i = 0; i <= nS; i++) { const x = -W / 2 + 4 + i * 3.1; group.add(mesh(box(0.1, 0.012, 5.2), lineM, x, 0.04, -D / 2 + 3.6, { shadow: false })); if (i < nS) stalls.push({ x: x + 1.55, z: -D / 2 + 3.6, heading: 0 }); }
  for (let i = 0; i < Math.min(nS, 9); i++) { const t = canvasTex('imp:num' + i, 64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#e8e4d0'; g.font = '900 44px Arial'; g.textAlign = 'center'; g.fillText(String(i + 1), 32, 48); grain(g, 64, 64, { a: 0.2 }); }, { clamp: true }); group.add(mesh(geo('impnum', () => new THREE.PlaneGeometry(0.9, 0.9)), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9 }), stalls[i].x, 0.045, -D / 2 + 6.8, { rx: -Math.PI / 2, shadow: false })); }
  // chain-link fence with barbed top
  const linkTex = canvasTex('imp:link', 64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(170,176,180,1)'; g.lineWidth = 2.2; for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } }, {});
  const fenceMat = (len) => { const m = new THREE.MeshStandardMaterial({ map: linkTex.clone(), alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.7 }); m.map.repeat.set(len / 0.45, 2.4 / 0.45); m.map.needsUpdate = true; return m; };
  const post = M.galv, gateW = 7;
  function run(x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, ry = Math.atan2(-(z2 - z1), x2 - x1);
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; group.add(g);
    g.add(mesh(new THREE.PlaneGeometry(len, 2.4), fenceMat(len), 0, 1.2, 0, { shadow: false }));
    g.add(mesh(cyl(0.022, 0.022, len, 6), post, 0, 2.4, 0, { rz: Math.PI / 2 }));
    for (let k = 0; k < 3; k++) g.add(mesh(cyl(0.006, 0.006, len, 4), M.steel, 0, 2.5 + k * 0.07, 0.04 + k * 0.05, { rz: Math.PI / 2, shadow: false }));
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) { g.add(mesh(cyl(0.035, 0.035, 2.5, 8), post, -len / 2 + (len / n) * i, 1.25, 0)); g.add(mesh(box(0.02, 0.26, 0.02), post, -len / 2 + (len / n) * i, 2.58, 0.07, { rx: 0.5 })); }
    colliders.push({ x: cx, y: 1.25, z: cz, hx: len / 2, hy: 1.25, hz: 0.06, rotY: ry });
  }
  run(-W / 2, -D / 2, W / 2, -D / 2); run(-W / 2, -D / 2, -W / 2, D / 2); run(W / 2, -D / 2, W / 2, D / 2);
  run(-W / 2, D / 2, -gateW / 2 - 2.6, D / 2); run(gateW / 2, D / 2, W / 2, D / 2);
  // sliding gate, parked open along the fence
  const gate = new THREE.Group(); gate.position.set(gateW / 2 + gateW / 2 + 0.3, 0, D / 2 + 0.25); group.add(gate);
  gate.add(mesh(new THREE.PlaneGeometry(gateW, 2.2), fenceMat(gateW), 0, 1.2, 0, { shadow: false }));
  for (const y of [0.12, 2.3]) gate.add(mesh(box(gateW, 0.07, 0.07), post, 0, y, 0)); for (const x of [-gateW / 2, 0, gateW / 2]) gate.add(mesh(box(0.07, 2.2, 0.07), post, x, 1.2, 0));
  for (const x of [-gateW / 2 + 0.4, gateW / 2 - 0.4]) gate.add(mesh(cyl(0.09, 0.09, 0.05, 12), M.rubber, x, 0.09, 0, { rx: Math.PI / 2 }));
  // payment booth left of the gate
  const bx = -gateW / 2 - 1.3, bz = D / 2 - 0.2;
  const wallTex = canvasTex('imp:wall', 256, 256, (g, w, h) => { g.fillStyle = '#cfc8b4'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, w, 2); } grain(g, w, h, { a: 0.14, streaks: 18, scuffs: 10, seed: 31 }); g.fillStyle = PSPD.navy; g.fillRect(0, h - 56, w, 56); grain(g, w, h, { a: 0.06 }); }, {});
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
  const booth = new THREE.Group(); booth.position.set(bx, 0, bz); group.add(booth);
  booth.add(mesh(box(2.4, 2.6, 2.2), wallM, 0, 1.3, 0));
  booth.add(mesh(box(2.8, 0.12, 2.9), pbr('boothroof', '#3b4046', { rough: 0.7, metal: 0.4, streaks: 8 }), 0, 2.66, 0.2));
  const winTex = canvasTex('imp:win', 256, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f2e6b8'); gr.addColorStop(1, '#c9b77a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(30,26,20,.75)'; g.fillRect(150, 30, 70, 98); g.beginPath(); g.arc(185, 34, 18, 0, 6.3); g.fill(); g.fillStyle = '#2a2d33'; g.fillRect(20, 70, 90, 58); g.fillStyle = '#7dffb0'; g.font = '10px monospace'; g.fillText('IMPOUND LOG', 26, 86); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(90, 0); g.lineTo(30, h); g.lineTo(0, h); g.fill(); }, { clamp: true });
  const winMat = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.2 });
  booth.add(mesh(geo('impwin', () => new THREE.PlaneGeometry(1.5, 0.9)), winMat, 0, 1.55, 1.105));
  booth.add(mesh(box(1.7, 0.06, 0.36), M.steel, 0, 1.06, 1.24));
  booth.add(mesh(box(0.9, 2.0, 0.05), pbr('boothdoor', '#39424e', { rough: 0.6, metal: 0.4, scuffs: 12 }), -1.21, 1.0, 0, { ry: Math.PI / 2 }));
  const signTex = canvasTex('imp:sign', 512, 128, (g, w, h) => { g.fillStyle = PSPD.navy; g.fillRect(0, 0, w, h); g.strokeStyle = PSPD.gold; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12); drawBadge(g, 62, 64, 40); g.fillStyle = '#fff'; g.font = '900 40px Arial'; g.fillText('PSPD VEHICLE IMPOUND', 116, 58); g.font = 'bold 24px Arial'; g.fillStyle = PSPD.teal; g.fillText('PAY HERE · OPEN 24 HOURS', 118, 98); grain(g, w, h, { a: 0.07, scuffs: 8 }); }, { clamp: true });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.5 });
  booth.add(mesh(box(2.7, 0.68, 0.08), signMat, 0, 3.12, 1.2)); booth.add(mesh(box(0.08, 0.5, 0.08), M.dark, -1, 2.85, 1.2)); booth.add(mesh(box(0.08, 0.5, 0.08), M.dark, 1, 2.85, 1.2));
  colliders.push({ x: bx, y: 1.3, z: bz, hx: 1.2, hy: 1.3, hz: 1.1, rotY: 0 });
  // floodlight poles
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2d0, emissiveIntensity: 0.1, roughness: 0.3, map: surfaceTex('lamp', '#dddddd', { a: 0.05 }) });
  for (const [x, z] of [[-W / 2 + 1, -D / 2 + 1], [W / 2 - 1, -D / 2 + 1], [W / 2 - 1, D / 2 - 1]]) {
    group.add(mesh(cyl(0.07, 0.1, 7, 10), post, x, 3.5, z));
    const hd = mesh(box(0.5, 0.12, 0.3), M.dark, x - Math.sign(x) * 0.3, 7, z - Math.sign(z) * 0.2); group.add(hd);
    group.add(mesh(box(0.42, 0.02, 0.24), lampMat, x - Math.sign(x) * 0.3, 6.93, z - Math.sign(z) * 0.2));
    const sp = new THREE.SpotLight(0xfff0d0, 0, 34, 1.0, 0.6, 1.4); sp.position.set(x - Math.sign(x) * 0.3, 6.9, z - Math.sign(z) * 0.2); sp.target.position.set(x * 0.3, 0, z * 0.3); group.add(sp, sp.target); lights.push(sp);
    colliders.push({ x, y: 3.5, z, hx: 0.1, hy: 3.5, hz: 0.1, rotY: 0 });
  }
  return {
    group, size: { x: W, y: 7, z: D }, colliders, stalls, lights, gate: { x: 0, z: D / 2, width: gateW },
    payPoint: new THREE.Vector3(bx, 0, bz + 1.9),
    update(dt, t, s = {}) { const n = s.night ? 1 : 0; lampMat.emissiveIntensity = 0.1 + n * 4; for (const l of lights) l.intensity = n * 260; winMat.emissiveIntensity = 0.25 + n * 0.9; signMat.emissiveIntensity = 0.15 + n * 0.8; },
  };
}

// ------------------------------------------------------------------ officer gear (attached to head / chest bones)
export function buildSwatGear(THREE, o = {}) {
  const hm = pbr('swathelmet', '#1d2126', { rough: 0.6, scuffs: 22, grain: 0.1 });
  const helmet = new THREE.Group();
  helmet.add(mesh(geo('swatdome', () => { const g = new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62); g.scale(1, 1.02, 1.12); return g; }), hm, 0, 0.012, -0.006));
  helmet.add(mesh(geo('swatrim', () => new THREE.TorusGeometry(0.126, 0.008, 6, 20)), M.rubber, 0, -0.022, -0.004, { rx: Math.PI / 2, sc: [1, 1.12, 1] }));
  for (const s of [-1, 1]) { helmet.add(mesh(box(0.012, 0.03, 0.09), M.dark, s * 0.13, 0.03, 0)); helmet.add(mesh(cyl(0.034, 0.034, 0.03, 12), M.black, s * 0.128, -0.045, 0.0, { rz: Math.PI / 2 })); }
  helmet.add(mesh(box(0.05, 0.02, 0.03), M.dark, 0, 0.09, 0.12));
  const goggles = mesh(box(0.17, 0.045, 0.03), pbr('goggles', '#0c0e12', { rough: 0.15, metal: 0.6 }), 0, 0.055, 0.118); helmet.add(goggles);
  helmet.add(mesh(box(0.2, 0.012, 0.012), M.rubber, 0, 0.055, 0.1));
  const vestTex = (back) => canvasTex('swatvest' + back, 256, 256, (g, w, h) => { g.fillStyle = '#20252b'; g.fillRect(0, 0, w, h); grain(g, w, h, { a: 0.2, n: 5000, seed: 12 }); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3; for (let y = 96; y < h; y += 26) { g.beginPath(); g.moveTo(10, y); g.lineTo(w - 10, y); g.stroke(); } g.fillStyle = '#eef0f2'; g.fillRect(48, 28, 160, 46); g.fillStyle = '#12151a'; g.font = '900 30px Arial'; g.textAlign = 'center'; g.fillText(back ? 'POLICE' : 'PSPD', w / 2, 62); if (!back) { g.font = 'bold 13px Arial'; g.fillStyle = '#cfd4d8'; g.fillText('SWAT', w / 2, 92); for (let i = 0; i < 3; i++) { g.fillStyle = '#191d22'; g.fillRect(34 + i * 66, 150, 54, 78); g.strokeStyle = 'rgba(255,255,255,.08)'; g.strokeRect(34 + i * 66, 150, 54, 78); g.fillStyle = '#0e1114'; g.fillRect(34 + i * 66, 150, 54, 16); } } }, { clamp: true });
  const vest = new THREE.Group();
  const vg = geo('swatvestg', () => { const g = new THREE.CylinderGeometry(0.2, 0.185, 0.46, 16, 1, true, -Math.PI / 2 + 0.25, Math.PI - 0.5); g.scale(1.06, 1, 0.74); return g; });
  vest.add(mesh(vg, new THREE.MeshStandardMaterial({ map: vestTex(0), roughness: 0.85, side: THREE.DoubleSide }), 0, 0, 0.0));
  vest.add(mesh(vg, new THREE.MeshStandardMaterial({ map: vestTex(1), roughness: 0.85, side: THREE.DoubleSide }), 0, 0, 0.0, { ry: Math.PI }));
  for (const s of [-1, 1]) vest.add(mesh(box(0.07, 0.03, 0.2), M.black, s * 0.13, 0.235, 0));
  const shieldTex = canvasTex('swatshield', 256, 420, (g, w, h) => { g.fillStyle = '#16191d'; g.fillRect(0, 0, w, h); grain(g, w, h, { a: 0.16, scuffs: 40, seed: 44 }); g.fillStyle = 'rgba(150,190,210,.35)'; g.fillRect(58, 48, 140, 56); g.strokeStyle = '#0a0b0d'; g.lineWidth = 6; g.strokeRect(58, 48, 140, 56); g.fillStyle = '#eef0f2'; g.font = '900 46px Arial'; g.textAlign = 'center'; g.fillText('POLICE', w / 2, 190); drawBadge(g, w / 2, 280, 44); }, { clamp: true });
  const shield = new THREE.Group();
  shield.add(mesh(geo('swatshieldg', () => { const g = new THREE.CylinderGeometry(0.75, 0.75, 1.0, 14, 1, true, -0.4, 0.8); g.translate(0, 0, -0.72); return g; }), new THREE.MeshStandardMaterial({ map: shieldTex, roughness: 0.6, side: THREE.DoubleSide }), 0, 0, 0));
  shield.add(mesh(box(0.03, 0.2, 0.05), M.rubber, 0, 0, -0.03));
  return { helmet, vest, shield };
}
export function buildPatrolCap(THREE) { // eight-point patrol cap of our own cut with a gold badge
  const g = new THREE.Group();
  const cloth = pbr('capcloth', '#141c30', { rough: 0.8, grain: 0.14 });
  g.add(mesh(cyl(0.104, 0.112, 0.06, 16), cloth, 0, 0.05, 0));
  g.add(mesh(geo('captop', () => new THREE.CylinderGeometry(0.135, 0.108, 0.04, 8)), cloth, 0, 0.098, 0, { ry: Math.PI / 8 }));
  g.add(mesh(geo('capvisor', () => { const s = new THREE.Shape(); s.absarc(0, 0, 0.115, Math.PI * 0.12, Math.PI * 0.88, false); s.lineTo(0, 0); const e = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false }); e.rotateX(Math.PI / 2 + 0.2); return e; }), pbr('capvisor', '#060708', { rough: 0.25 }), 0, 0.03, 0.03));
  g.add(mesh(box(0.2, 0.014, 0.01), pbr('capband', '#0a0d16', { rough: 0.4 }), 0, 0.032, 0.105));
  const bt = canvasTex('capbadge', 64, 64, (c) => { c.clearRect(0, 0, 64, 64); drawBadge(c, 32, 32, 28); }, { clamp: true });
  g.add(mesh(geo('capbadgeg', () => new THREE.PlaneGeometry(0.045, 0.045)), new THREE.MeshStandardMaterial({ map: bt, transparent: true, metalness: 0.8, roughness: 0.3 }), 0, 0.07, 0.112, { shadow: false }));
  return g;
}
