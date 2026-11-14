// POLICE track: air units and the K-9. Original procedural models (see modelKit.js). Preview: src/gameplay/police/preview.html
import { PSPD, rng, canvasTex, grain, surfaceTex, pbr, glow, mesh, box, cyl, sph, geo, loft, drawBadge } from './modelKit.js';

// ------------------------------------------------------------------ PSPD "Skywatch" helicopter (light twin, our own design)
// Origin at the bottom of the skids, nose toward +Z.
export function buildPoliceHeli(THREE, o = {}) {
  const r = rng(o.seed || 41), unit = o.unit || 1 + ((r() * 8) | 0), group = new THREE.Group();
  const livery = canvasTex('heli:livery:' + unit, 1024, 512, (g, w, h) => {
    g.fillStyle = PSPD.white; g.fillRect(0, 0, w, h);
    // v runs bottom (0) -> +X side (.25) -> top (.5) -> -X side (.75) -> bottom (1); canvas y = (1 - v) * h
    const band = (v0, v1, col) => { g.fillStyle = col; g.fillRect(0, (1 - v1) * h, w, (v1 - v0) * h); };
    band(0, 0.16, PSPD.navy); band(0.84, 1, PSPD.navy); band(0.4, 0.6, PSPD.navy);
    for (const vc of [0.25, 0.75]) {
      const y = (1 - vc) * h, flipY = vc > 0.5;
      g.save(); g.translate(0, y); g.scale(1, flipY ? -1 : 1);
      g.fillStyle = PSPD.navy; g.beginPath(); g.moveTo(0, 26); g.lineTo(w * 0.62, 26); g.lineTo(w * 0.8, -40); g.lineTo(w, -40); g.lineTo(w, 44); g.lineTo(0, 44); g.fill(); // sweeping lower stripe
      g.fillStyle = PSPD.teal; g.beginPath(); g.moveTo(0, 18); g.lineTo(w * 0.61, 18); g.lineTo(w * 0.79, -48); g.lineTo(w * 0.81, -48); g.lineTo(w * 0.63, 26); g.lineTo(0, 26); g.fill();
      // cabin windows (dark glass painted in)
      g.fillStyle = '#0c1118'; g.beginPath(); g.roundRect(w * 0.47, -58, w * 0.1, 56, 10); g.fill(); g.beginPath(); g.roundRect(w * 0.585, -58, w * 0.085, 56, 10); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(w * 0.46, -66, w * 0.225, 110); // door outline
      g.restore();
      // text: mirror so it reads correctly from outside on each side
      g.save(); g.translate(w * 0.33, y - (flipY ? -1 : 1) * 16); g.scale(vc < 0.5 ? -1 : 1, flipY ? -1 : 1);
      g.fillStyle = PSPD.navy; g.font = '900 54px Arial'; g.textAlign = 'center'; g.fillText('POLICE', 0, 0);
      g.font = 'bold 20px Arial'; g.fillText('PORT SOLANA · SKYWATCH ' + unit, 0, 22);
      g.restore();
      drawBadge(g, w * 0.14, y - (flipY ? -1 : 1) * 14, 30);
    }
    // panel lines, rivets and grime
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.5; for (const u of [0.2, 0.45, 0.7, 0.86]) { g.beginPath(); g.moveTo(u * w, 0); g.lineTo(u * w, h); g.stroke(); }
    grain(g, w, h, { a: 0.07, n: 16000, streaks: 30, scuffs: 50, seed: 23 });
  }, { clamp: true });
  const skin = new THREE.MeshStandardMaterial({ map: livery, roughness: 0.38, metalness: 0.35 });
  const navy = pbr('helinavy', PSPD.navy, { rough: 0.4, metal: 0.4, scuffs: 14 });
  const dark = pbr('helidark', '#1a1d21', { rough: 0.6, metal: 0.5, scuffs: 14 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1016, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.62, side: THREE.DoubleSide, map: surfaceTex('heliglass', '#8fa3b3', { a: 0.04 }) });
  const fus = [
    { z: -2.5, y: 1.86, rx: 0.26, ry: 0.3 }, { z: -1.7, y: 1.64, rx: 0.66, ry: 0.74, e: 2.4 }, { z: -0.4, y: 1.5, rx: 0.86, ry: 0.92, e: 2.6 }, { z: 0.8, y: 1.46, rx: 0.86, ry: 0.9, e: 2.6 },
    { z: 1.7, y: 1.36, rx: 0.74, ry: 0.76, e: 2.3 }, { z: 2.35, y: 1.2, rx: 0.5, ry: 0.5 }, { z: 2.72, y: 1.1, rx: 0.2, ry: 0.22 },
  ];
  group.add(mesh(loft(fus, 28, { capStart: true, capEnd: true }), skin));
  // canopy: glass shell over the front, sides and top
  const can = fus.slice(3).map((s) => ({ ...s, rx: s.rx * 1.012, ry: s.ry * 1.012 }));
  group.add(mesh(loft(can, 22, { a0: 0.19, a1: 0.81 }), glass, 0, 0, 0, { shadow: false }));
  for (const x of [-0.3, 0.3]) { group.add(mesh(sph(0.11, 10, 8), dark, x, 1.72, 1.25)); group.add(mesh(box(0.34, 0.5, 0.22), dark, x, 1.38, 1.2)); group.add(mesh(sph(0.125, 10, 6), pbr('helihelmet', '#e8e8e4', { rough: 0.4 }), x, 1.75, 1.24, { sc: [1, 0.8, 1] })); }
  // tail boom, fin, stabilizer
  group.add(mesh(loft([{ z: -6.7, y: 2.12, rx: 0.11, ry: 0.13 }, { z: -4.5, y: 2.02, rx: 0.19, ry: 0.22 }, { z: -2.3, y: 1.9, rx: 0.27, ry: 0.31 }], 14, { capStart: true }), navy));
  const fin = geo('helifin', () => { const s = new THREE.Shape(); s.moveTo(-6.2, 1.7); s.lineTo(-7.25, 1.55); s.lineTo(-7.5, 3.25); s.lineTo(-7.0, 3.3); s.lineTo(-6.3, 2.2); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }); g.translate(0, 0, -0.035); g.rotateY(-Math.PI / 2); return g; });
  group.add(mesh(fin, navy));
  group.add(mesh(box(1.9, 0.045, 0.42), navy, 0, 2.18, -5.5)); for (const x of [-0.95, 0.95]) group.add(mesh(box(0.04, 0.5, 0.48), skin, x, 2.25, -5.5));
  // engine cowl, exhausts, mast and hub
  group.add(mesh(loft([{ z: -1.9, y: 2.3, rx: 0.3, ry: 0.2 }, { z: -1.0, y: 2.38, rx: 0.52, ry: 0.32, e: 2.5 }, { z: 0.4, y: 2.36, rx: 0.5, ry: 0.3, e: 2.5 }, { z: 1.0, y: 2.22, rx: 0.28, ry: 0.14 }], 16, { capStart: true, capEnd: true }), navy));
  for (const x of [-0.34, 0.34]) group.add(mesh(cyl(0.085, 0.1, 0.4, 10), pbr('exhaust', '#3a3632', { metal: 0.8, rough: 0.6, streaks: 10 }), x, 2.42, -1.75, { rx: Math.PI / 2 - 0.35 }));
  group.add(mesh(cyl(0.06, 0.08, 0.5, 10), dark, 0, 2.86, -0.2));
  const rotor = new THREE.Group(); rotor.position.set(0, 3.12, -0.2); group.add(rotor);
  rotor.add(mesh(cyl(0.17, 0.2, 0.14, 12), dark, 0, 0, 0));
  const bladeM = pbr('heliblade', '#22252a', { rough: 0.5, metal: 0.3, scuffs: 8 }), blades = [];
  for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.y = i * Math.PI / 2; const bl = mesh(box(0.3, 0.03, 4.95), bladeM, 0, 0.02, 2.7, { rz: 0.07 }); b.add(bl); b.add(mesh(box(0.3, 0.032, 0.3), pbr('bladetip', '#f0c020', { rough: 0.5 }), 0, 0.02, 5.05, { rz: 0.07 })); rotor.add(b); blades.push(b); }
  const discTex = canvasTex('heli:disc', 256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(128, 128, 6, 128, 128, 127); gr.addColorStop(0, 'rgba(20,22,26,.5)'); gr.addColorStop(0.2, 'rgba(20,22,26,.14)'); gr.addColorStop(0.93, 'rgba(20,22,26,.2)'); gr.addColorStop(0.97, 'rgba(240,192,32,.3)'); gr.addColorStop(1, 'rgba(20,22,26,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(20,22,26,.1)'; for (let i = 0; i < 40; i++) { g.lineWidth = 1 + (i % 3); g.beginPath(); g.arc(128, 128, 14 + i * 2.8, i, i + 2.4); g.stroke(); } }, { clamp: true });
  const discM = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const disc = mesh(geo('helidisc', () => new THREE.CircleGeometry(5.25, 40)), discM, 0, 0.03, 0, { rx: -Math.PI / 2, shadow: false }); rotor.add(disc);
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.2, 2.75, -7.0); group.add(tailRotor);
  tailRotor.add(mesh(cyl(0.05, 0.05, 0.14, 8), dark, 0, 0, 0, { rz: Math.PI / 2 }));
  for (let i = 0; i < 2; i++) tailRotor.add(mesh(box(0.02, 1.02, 0.12), bladeM, 0.05, 0, 0, { rx: i * Math.PI / 2 }));
  const tdisc = mesh(geo('helitdisc', () => new THREE.CircleGeometry(0.56, 20)), discM, 0.06, 0, 0, { ry: Math.PI / 2, shadow: false }); tailRotor.add(tdisc);
  // skids
  const tube = pbr('heliskid', '#2a2d31', { metal: 0.7, rough: 0.45, scuffs: 12 });
  for (const s of [-1, 1]) {
    group.add(mesh(cyl(0.04, 0.04, 3.5, 8), tube, s * 1.02, 0.04, 0.15, { rx: Math.PI / 2 }));
    group.add(mesh(cyl(0.04, 0.04, 0.5, 8), tube, s * 1.02, 0.13, 2.1, { rx: Math.PI / 2 - 0.4 }));
    for (const z of [-0.8, 1.0]) group.add(mesh(cyl(0.035, 0.035, 0.95, 8), tube, s * 0.82, 0.44, z, { rz: s * -0.42 }));
    group.add(mesh(box(0.12, 0.02, 1.2), pbr('skidstep', '#3a3d42', { rough: 0.8, grain: 0.2 }), s * 1.02, 0.4, 0.9));
  }
  // sensor ball and searchlight pod
  const flir = new THREE.Group(); flir.position.set(0.34, 0.72, 2.0); group.add(flir);
  flir.add(mesh(sph(0.17, 14, 10), dark)); flir.add(mesh(cyl(0.07, 0.07, 0.04, 12), pbr('flirlens', '#101820', { rough: 0.05, metal: 0.9 }), 0, -0.05, 0.15, { rx: Math.PI / 2 - 0.3 })); group.add(mesh(cyl(0.06, 0.06, 0.16, 8), dark, 0.34, 0.9, 2.0));
  const pod = new THREE.Group(); pod.position.set(-0.36, 0.66, 1.65); group.add(pod); group.add(mesh(box(0.08, 0.2, 0.08), dark, -0.36, 0.82, 1.65));
  pod.add(mesh(cyl(0.15, 0.12, 0.3, 14), dark, 0, 0, 0.02, { rx: Math.PI / 2 }));
  const lensM = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdfeaff, emissiveIntensity: 0.1, roughness: 0.2, map: surfaceTex('lamp', '#dddddd', { a: 0.05 }) });
  pod.add(mesh(cyl(0.135, 0.135, 0.02, 14), lensM, 0, 0, 0.18, { rx: Math.PI / 2 }));
  const spot = new THREE.SpotLight(0xdfeaff, 0, 240, 0.15, 0.45, 1.1); spot.position.set(0, 0, 0.2); pod.add(spot);
  const spotTarget = new THREE.Object3D(); spot.target = spotTarget;
  const beamTex = canvasTex('heli:beam', 8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(0.25, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,.03)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { clamp: true });
  const beamM = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = mesh(geo('helibeam', () => { const g = new THREE.CylinderGeometry(1, 0.012, 1, 28, 1, true); g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2); return g; }), beamM, 0, 0, 0.2, { shadow: false }); beam.renderOrder = 5; pod.add(beam);
  // ground pool (the caller adds it to the scene and it is moved by aimSpot)
  const poolTex = canvasTex('heli:pool', 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(0.8, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }, { clamp: true });
  const pool = new THREE.Mesh(geo('helipool', () => new THREE.CircleGeometry(1, 28)), new THREE.MeshBasicMaterial({ map: poolTex, color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  pool.rotation.x = -Math.PI / 2; pool.renderOrder = 4;
  // navigation lights: red on the left (+X), green on the right, white tail strobe, red beacon
  const navLights = [];
  const nl = (key, hex, x, y, z) => { const m = mesh(sph(0.045, 8, 6), glow('heli' + key, hex, 8), x, y, z, { shadow: false }); group.add(m); navLights.push(m); return m; };
  const nRed = nl('red', 0xff2020, 0.98, 2.2, -5.5), nGreen = nl('green', 0x20ff50, -0.98, 2.2, -5.5), nTail = nl('tail', 0xffffff, 0, 3.3, -7.3), nBeacon = nl('beacon', 0xff3030, 0, 2.72, -1.0), nBelly = nl('belly', 0xffffff, 0, 0.58, -0.6);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  let on = false, t = r() * 10, spin = 0;
  function aimSpot(p) {
    pod.lookAt(p); spotTarget.position.copy(p); spotTarget.updateMatrixWorld();
    pod.getWorldPosition(_v); const d = _v.distanceTo(p), rad = Math.tan(spot.angle) * d;
    beam.scale.set(rad, rad, d);
    pool.position.set(p.x, p.y + 0.06, p.z); pool.scale.setScalar(rad * 1.15);
  }
  return {
    group, rotor, tailRotor, spot, spotTarget, beam, pool, navLights, pod, rotorRadius: 5.25, unit,
    setSpot(v, k = 1) { on = !!v; spot.intensity = on ? 9000 * k : 0; beamM.opacity = on ? 0.16 * k : 0; pool.material.opacity = on ? 0.3 * k : 0; lensM.emissiveIntensity = on ? 14 : 0.1; },
    aimSpot,
    update(dt, s = {}) {
      t += dt; const rs = s.rotorSpeed ?? 1; spin += dt * rs * 38;
      rotor.rotation.y = spin; tailRotor.rotation.x = spin * 2.6;
      const fast = rs > 0.45; disc.visible = tdisc.visible = fast; for (const b of blades) b.visible = !fast || (((spin * 3) | 0) % 2 === 0);
      discM.opacity = Math.min(1, rs);
      nTail.visible = (t % 1.1) < 0.08; nBelly.visible = ((t + 0.5) % 1.1) < 0.08; nBeacon.visible = (t % 0.9) < 0.45; nRed.visible = nGreen.visible = true;
    },
    dispose() { skin.dispose(); glass.dispose(); discM.dispose(); beamM.dispose(); pool.material.dispose(); lensM.dispose(); },
  };
}

// ------------------------------------------------------------------ spotter drone (six-star response)
export function buildSpotterDrone(THREE, o = {}) {
  const r = rng(o.seed || 77), group = new THREE.Group();
  const shell = pbr('droneshell', '#e6e8ea', { rough: 0.4, scuffs: 10 }), dark = pbr('dronedark', '#17191d', { rough: 0.55, metal: 0.4 });
  const top = canvasTex('drone:top', 128, 128, (g, w, h) => { g.fillStyle = PSPD.navy; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 30px Arial'; g.textAlign = 'center'; g.fillText('PSPD', w / 2, 56); g.font = 'bold 20px Arial'; g.fillStyle = PSPD.teal; g.fillText('SPOTTER ' + (1 + ((r() * 20) | 0)), w / 2, 90); grain(g, w, h, { a: 0.08, scuffs: 6 }); }, { clamp: true });
  group.add(mesh(loft([{ z: -0.17, y: 0, rx: 0.07, ry: 0.035 }, { z: -0.06, y: 0, rx: 0.11, ry: 0.05, e: 2.6 }, { z: 0.1, y: 0, rx: 0.1, ry: 0.045, e: 2.6 }, { z: 0.19, y: -0.005, rx: 0.05, ry: 0.03 }], 14, { capStart: true, capEnd: true }), shell));
  group.add(mesh(geo('dronetop', () => new THREE.PlaneGeometry(0.16, 0.2)), new THREE.MeshStandardMaterial({ map: top, roughness: 0.5 }), 0, 0.051, 0.0, { rx: -Math.PI / 2, shadow: false }));
  const props = [], discM = new THREE.MeshBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ax = sx * 0.3, az = sz * 0.27;
    const arm = mesh(box(0.035, 0.022, Math.hypot(ax - sx * 0.08, az - sz * 0.05)), dark, (ax + sx * 0.08) / 2, 0.01, (az + sz * 0.05) / 2, { ry: Math.atan2(ax - sx * 0.08, az - sz * 0.05) }); group.add(arm);
    group.add(mesh(cyl(0.026, 0.03, 0.06, 10), dark, ax, 0.03, az));
    const p = mesh(geo('droneprop', () => new THREE.CircleGeometry(0.16, 16)), discM, ax, 0.068, az, { rx: -Math.PI / 2, shadow: false }); group.add(p); props.push(p);
    const bl = mesh(box(0.31, 0.004, 0.022), dark, ax, 0.066, az); group.add(bl); props.push(bl);
    group.add(mesh(sph(0.012, 6, 4), glow(sz > 0 ? 'dronefront' : 'droneback', sz > 0 ? 0xffffff : 0xff2020, 5), ax, -0.005, az, { shadow: false }));
    group.add(mesh(cyl(0.006, 0.006, 0.12, 5), dark, ax * 0.7, -0.07, az * 0.75));
  }
  for (const sz of [-1, 1]) group.add(mesh(cyl(0.007, 0.007, 0.44, 5), dark, 0, -0.13, sz * 0.2, { rz: Math.PI / 2 }));
  const gim = new THREE.Group(); gim.position.set(0, -0.07, 0.13); group.add(gim);
  gim.add(mesh(sph(0.05, 12, 10), dark));
  const eye = mesh(cyl(0.022, 0.022, 0.012, 12), glow('droneeye', 0xff2a2a, 6), 0, -0.012, 0.046, { rx: Math.PI / 2 - 0.25, shadow: false }); gim.add(eye);
  group.add(mesh(cyl(0.003, 0.003, 0.16, 4), dark, 0.05, 0.12, -0.12));
  const light = new THREE.SpotLight(0xdfeaff, 0, 60, 0.22, 0.5, 1.3); light.position.set(0, -0.06, 0.1); const tgt = new THREE.Object3D(); tgt.position.set(0, -6, 6); group.add(light, tgt); light.target = tgt;
  let t = r() * 10, spin = 0;
  return {
    group, eye, light, lightTarget: tgt, gimbal: gim,
    setLight(on) { light.intensity = on ? 900 : 0; },
    update(dt, s = {}) { t += dt; spin += dt * 60; for (let i = 0; i < props.length; i += 2) props[i + 1].rotation.y = spin + i; group.rotation.z = Math.sin(t * 2.3) * 0.04 * (s.hover ?? 1); group.rotation.x = Math.sin(t * 1.7 + 1) * 0.04 * (s.hover ?? 1) + (s.pitch || 0); eye.visible = (t % 0.8) < 0.6; },
    dispose() { discM.dispose(); },
  };
}

// ------------------------------------------------------------------ K-9 (shepherd build, procedural gait)
export function buildK9(THREE, o = {}) {
  const r = rng(o.seed || 9), group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const furTex = canvasTex('k9:fur', 256, 256, (g, w, h) => {
    g.fillStyle = '#b98a4e'; g.fillRect(0, 0, w, h);
    // black saddle over the back (v .3 .. .7 is the top half of the loft), darker along the spine
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(185,138,78,0)'); gr.addColorStop(0.3, 'rgba(24,20,18,.0)'); gr.addColorStop(0.42, 'rgba(24,20,18,.9)'); gr.addColorStop(0.58, 'rgba(24,20,18,.9)'); gr.addColorStop(0.7, 'rgba(24,20,18,0)'); gr.addColorStop(1, 'rgba(185,138,78,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rr = rng(5); for (let i = 0; i < 5200; i++) { const x = rr() * w, y = rr() * h; g.strokeStyle = `rgba(${rr() < 0.5 ? '30,22,14' : '230,200,150'},${(0.06 + rr() * 0.14).toFixed(2)})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5 + rr() * 6, y + (rr() - 0.5) * 3); g.stroke(); }
  }, {});
  const fur = new THREE.MeshStandardMaterial({ map: furTex, roughness: 0.92 });
  const tan = pbr('k9tan', '#b98a4e', { rough: 0.92, grain: 0.2 }), blackFur = pbr('k9black', '#1c1815', { rough: 0.9, grain: 0.2 });
  // torso: chest deep at the front, tucked waist; u runs tail -> chest
  const H = 0.46; // belly height
  body.add(mesh(loft([{ z: -0.42, y: H + 0.12, rx: 0.07, ry: 0.08 }, { z: -0.3, y: H + 0.1, rx: 0.12, ry: 0.13 }, { z: -0.05, y: H + 0.08, rx: 0.125, ry: 0.14 }, { z: 0.22, y: H + 0.06, rx: 0.14, ry: 0.17 }, { z: 0.36, y: H + 0.1, rx: 0.12, ry: 0.15 }, { z: 0.44, y: H + 0.16, rx: 0.08, ry: 0.1 }], 16, { capStart: true, capEnd: true }), fur));
  // neck + head group (pivot at the shoulders)
  const neck = new THREE.Group(); neck.position.set(0, H + 0.17, 0.38); body.add(neck);
  neck.add(mesh(loft([{ z: -0.04, y: 0, rx: 0.085, ry: 0.1 }, { z: 0.12, y: 0.1, rx: 0.07, ry: 0.08 }, { z: 0.2, y: 0.17, rx: 0.065, ry: 0.07 }], 12, {}), fur));
  const head = new THREE.Group(); head.position.set(0, 0.19, 0.2); neck.add(head);
  head.add(mesh(loft([{ z: -0.09, y: 0, rx: 0.07, ry: 0.07 }, { z: 0.0, y: 0.005, rx: 0.075, ry: 0.07, e: 2.4 }, { z: 0.07, y: -0.01, rx: 0.055, ry: 0.05 }], 12, { capStart: true }), tan));
  const muzzle = mesh(loft([{ z: 0.06, y: -0.022, rx: 0.045, ry: 0.036 }, { z: 0.17, y: -0.03, rx: 0.034, ry: 0.028 }, { z: 0.2, y: -0.03, rx: 0.026, ry: 0.022 }], 10, { capEnd: true }), blackFur); head.add(muzzle);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.045, 0.06); head.add(jaw); jaw.add(mesh(box(0.05, 0.016, 0.13), blackFur, 0, 0, 0.065));
  jaw.add(mesh(box(0.03, 0.006, 0.09), pbr('k9tongue', '#c9606a', { rough: 0.5 }), 0, 0.01, 0.075));
  head.add(mesh(sph(0.016, 8, 6), pbr('k9nose', '#0c0b0b', { rough: 0.3 }), 0, -0.022, 0.2));
  for (const s of [-1, 1]) {
    head.add(mesh(sph(0.011, 8, 6), pbr('k9eye', '#2a1a0c', { rough: 0.15 }), s * 0.038, 0.022, 0.055));
    const ear = mesh(geo('k9ear', () => { const g = new THREE.ConeGeometry(0.03, 0.09, 4); g.scale(1, 1, 0.45); return g; }), blackFur, s * 0.045, 0.095, -0.04, { rz: s * -0.16, rx: -0.1 }); head.add(ear);
  }
  // legs: upper and lower segments on pivots
  const legs = [];
  const mkLeg = (x, z, front) => {
    const hip = new THREE.Group(); hip.position.set(x, H + (front ? 0.02 : 0.04), z); body.add(hip);
    hip.add(mesh(cyl(front ? 0.042 : 0.058, 0.03, 0.25, 10), front ? tan : fur, 0, -0.105, 0, { sc: [1, 1, front ? 1 : 1.25] }));
    const knee = new THREE.Group(); knee.position.set(0, -0.22, 0); hip.add(knee);
    knee.add(mesh(cyl(0.024, 0.02, 0.23, 8), tan, 0, -0.115, 0));
    knee.add(mesh(box(0.045, 0.03, 0.07), tan, 0, -0.235, 0.015));
    legs.push({ hip, knee, front, phase: 0 });
  };
  mkLeg(-0.09, 0.27, true); mkLeg(0.09, 0.27, true); mkLeg(-0.085, -0.3, false); mkLeg(0.085, -0.3, false);
  const tail = new THREE.Group(); tail.position.set(0, H + 0.14, -0.42); body.add(tail);
  tail.add(mesh(loft([{ z: 0, y: 0, rx: 0.03, ry: 0.035 }, { z: -0.18, y: -0.08, rx: 0.035, ry: 0.04 }, { z: -0.34, y: -0.2, rx: 0.014, ry: 0.016 }].reverse(), 8, { capStart: true }), blackFur));
  // harness with a K-9 patch and a grab handle
  const hTex = canvasTex('k9:harness', 128, 64, (g, w, h) => { g.fillStyle = '#12151a'; g.fillRect(0, 0, w, h); grain(g, w, h, { a: 0.2 }); g.fillStyle = '#eef0f2'; g.fillRect(24, 14, 80, 36); g.fillStyle = PSPD.navy; g.font = '900 26px Arial'; g.textAlign = 'center'; g.fillText('K-9', w / 2, 42); }, { clamp: true });
  const harn = mesh(geo('k9harn', () => { const g = new THREE.CylinderGeometry(0.152, 0.148, 0.2, 16, 1, true); g.scale(1, 1, 1.18); g.rotateX(Math.PI / 2); return g; }), pbr('k9strap', '#12151a', { rough: 0.9, grain: 0.2 }), 0, H + 0.07, 0.2); body.add(harn);
  for (const s of [-1, 1]) body.add(mesh(geo('k9patch', () => new THREE.PlaneGeometry(0.16, 0.08)), new THREE.MeshStandardMaterial({ map: hTex, roughness: 0.8 }), s * 0.153, H + 0.1, 0.2, { ry: s * Math.PI / 2, shadow: false }));
  body.add(mesh(geo('k9handle', () => new THREE.TorusGeometry(0.035, 0.007, 5, 10, Math.PI)), pbr('k9strap', '#12151a', {}), 0, H + 0.245, 0.2, { ry: Math.PI / 2 }));
  let ph = r() * 6, sitK = 0, barkT = 0, t = 0;
  return {
    group, head, tail,
    update(dt, s = {}) {
      t += dt;
      const sp = s.speed || 0, sit = s.sit ? 1 : 0;
      sitK += (sit - sitK) * Math.min(1, dt * 6);
      const gallop = sp > 4.2;
      ph += dt * (sp > 0.1 ? 3.2 + sp * 1.5 : 0);
      const amp = Math.min(0.9, 0.25 + sp * 0.12) * (sp > 0.1 ? 1 : 0);
      legs.forEach((L, i) => {
        // trot: diagonal pairs; gallop: front pair then rear pair
        const off = gallop ? (L.front ? 0 : Math.PI * 0.75) + (i % 2) * 0.35 : ((i === 0 || i === 3) ? 0 : Math.PI);
        const a = Math.sin(ph + off) * amp;
        L.hip.rotation.x = a * (L.front ? 1 : 0.9) + (L.front ? 0 : sitK * 1.25) - (L.front ? sitK * 0.15 : 0);
        L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(ph + off)) * amp * 0.9 - (L.front ? 0 : sitK * 2.1);
      });
      body.position.y = (sp > 0.1 ? Math.abs(Math.sin(ph * (gallop ? 1 : 2))) * (gallop ? 0.05 : 0.015) : 0) - sitK * 0.0;
      body.rotation.x = -sitK * 0.52 + (gallop ? Math.sin(ph) * 0.06 : 0);
      body.position.z = -sitK * 0.05;
      const sniff = s.sniff && !sit ? 1 : 0;
      neck.rotation.x += ((sniff ? 0.95 : sitK * -0.45) - neck.rotation.x) * Math.min(1, dt * 7);
      head.rotation.y = sniff ? Math.sin(t * 5) * 0.35 : Math.sin(t * 0.7) * 0.08;
      head.rotation.x = sniff ? 0.25 : 0;
      if (s.bark) barkT = (barkT + dt * 4.5) % 1; else barkT = 0;
      jaw.rotation.x = s.bark ? (barkT < 0.3 ? 0.5 : 0.05) : sp > 3 ? 0.22 + Math.sin(t * 9) * 0.05 : 0.04;
      if (s.bark && barkT < 0.3) head.rotation.x -= 0.25;
      tail.rotation.y = Math.sin(t * (sit ? 3 : 7)) * (sp > 0.1 || sit ? 0.35 : 0.15); tail.rotation.x = sp > 3 ? 0.5 : sitK * 0.6;
    },
  };
}
