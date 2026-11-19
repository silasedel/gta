// W6 helicopter route (airports agent, Nov 19): a small helipad on Key Largo near Nico's house (Overseas Highway corridor)
// with a stealable light helicopter, and a flyable helicopter kind (game.vehicles.registerKind('helicopter')) so it can be
// flown to the military air base (src/world/airport/base.js), landed on its pad and walked away from (stealth there).
// The model is the police track's procedural light twin (src/gameplay/police/modelsAir.js) in a civilian tour livery.
// Arcade flight: W / S collective (climb / descend, hover hands-off), A / D yaw, the MOUSE is the cyclic like the planes
// (down = nose down, fly forward; up = nose up, back; sideways = bank), or I / K / J / L, arrows, numpad 8 / 5 / 4 / 6. V camera.
// F exits once landed. Hard landings (> 9 m/s down) or flying into things at speed damage it; a wreck explodes.
// game.heli = { list, pad, spawn(pos, heading), tp() }   ?heli=0 turns it off.
import * as THREE from 'three';
import { buildPoliceHeli } from '../../gameplay/police/modelsAir.js';

export const order = 187;
const Q = typeof location !== 'undefined' ? location.search : '';
const OFF = /[?&]heli=0\b/.test(Q);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const NICO = { x: -1007.7, z: 5174.4 };
const SKID = 0.06;   // model origin is the bottom of the skids

function liveryCanvas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'), w = 1024, h = 512;
  g.fillStyle = '#f1efe8'; g.fillRect(0, 0, w, h);
  const band = (v0, v1, col) => { g.fillStyle = col; g.fillRect(0, (1 - v1) * h, w, (v1 - v0) * h); };
  band(0, 0.14, '#137a7f'); band(0.86, 1, '#137a7f'); band(0.42, 0.58, '#137a7f'); band(0.14, 0.18, '#f2724b'); band(0.82, 0.86, '#f2724b');
  for (const vc of [0.25, 0.75]) { const y = (1 - vc) * h, flip = vc > 0.5;
    g.save(); g.translate(w * 0.33, y - (flip ? -1 : 1) * 10); g.scale(vc < 0.5 ? -1 : 1, flip ? -1 : 1);
    g.fillStyle = '#137a7f'; g.font = '900 46px Arial'; g.textAlign = 'center'; g.fillText('KEYS AIR TOURS', 0, 0); g.font = 'bold 18px Arial'; g.fillStyle = '#2a2d31'; g.fillText('N417KT  ·  KEY LARGO', 0, 24); g.restore(); }
  g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1.5; for (const u of [0.2, 0.45, 0.7, 0.86]) { g.beginPath(); g.moveTo(u * w, 0); g.lineTo(u * w, h); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function padTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#7d7f7c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
  g.strokeStyle = '#f2c21b'; g.lineWidth = 16; g.beginPath(); g.arc(256, 256, 200, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#f4f4f0'; g.lineWidth = 10; g.beginPath(); g.arc(256, 256, 246, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f4f4f0'; g.fillRect(176, 146, 40, 220); g.fillRect(296, 146, 40, 220); g.fillRect(176, 236, 160, 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// a concrete helipad disc (also used by the base): returns the group; adds a thin fixed collider
export function buildHelipad(game, x, z, r = 11, parent = game.scene) {
  const city = game.city, y = Math.max(city.groundHeightAt(x, z), city.groundHeightAt(x + r * 0.7, z), city.groundHeightAt(x - r * 0.7, z), city.groundHeightAt(x, z + r * 0.7), city.groundHeightAt(x, z - r * 0.7)) + 0.12;
  const g = new THREE.Group(); g.name = 'helipad'; g.position.set(x, y, z);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 40), [new THREE.MeshStandardMaterial({ color: 0x7d7f7c, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x7d7f7c })]);
  top.receiveShadow = true; g.add(top);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.15, r + 0.4, 1.6, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.95 })); base.position.y = -0.8; g.add(base);
  const lm = new THREE.MeshBasicMaterial({ color: 0x44ff66 }); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), lm); l.position.set(Math.cos(a) * (r - 0.3), 0.06, Math.sin(a) * (r - 0.3)); g.add(l); }
  parent.add(g);
  try { const b = game.world.createRigidBody(game.RAPIER.RigidBodyDesc.fixed()); game.world.createCollider(game.RAPIER.ColliderDesc.cylinder(0.05, r).setTranslation(x, y - 0.03, z), b); } catch (e) { /* */ }
  return { group: g, x, y, z, r };
}

export async function initV2(game) {
  if (OFF) return;
  const { scene, world, RAPIER } = game, city = game.city, P = game.player;
  if (!scene || !world || !RAPIER || !city?.groundHeightAt) return;
  const QF = RAPIER.QueryFilterFlags, STATIC = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  const sea = () => city.seaLevel ?? -0.12;
  const list = [];
  const livery = liveryCanvas();
  const teal = new THREE.MeshStandardMaterial({ color: 0x137a7f, roughness: 0.4, metalness: 0.35 });
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

  function floorAt(x, z, y) {   // ground or a roof / pad under (x, z) from height y
    let f = city.groundHeightAt(x, z, y);
    try { const h = world.castRay(new RAPIER.Ray({ x, y: y + 0.5, z }, { x: 0, y: -1, z: 0 }), 80, true, STATIC); if (h) { const t = h.timeOfImpact ?? h.toi; f = Math.max(f, y + 0.5 - t); } } catch (e) { /* */ }
    if (city.isWater?.(x, z)) f = Math.max(f, sea() - 0.4);
    return f;
  }
  function spawn(pos, heading = 0, opts = {}) {
    const m = buildPoliceHeli(THREE, { seed: 77 + list.length });
    if (m.spot) { m.spot.parent?.remove(m.spot); m.spot.intensity = 0; }
    m.beam?.parent?.remove(m.beam);
    m.group.traverse((o) => { if (!o.isMesh) return; const mt = o.material;
      if (mt?.map?.image?.width === 1024 && mt.map.image.height === 512) { o.material = mt.clone(); o.material.map = livery; }
      else if (mt?.color && Math.abs(mt.color.getHex() - 0x0b1a33) < 0x30000 && mt.color.r < 0.08 && mt.color.b > 0.03) o.material = teal; });
    const mesh = new THREE.Group(); mesh.name = 'heli'; mesh.add(m.group); scene.add(mesh);
    const y0 = opts.y ?? floorAt(pos.x, pos.z, (pos.y ?? 0) + 3);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, y0 + SKID, pos.z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.85, 2.4).setTranslation(0, 1.45, 0.1).setFriction(0.6), body);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.3, 2.3).setTranslation(0, 2.0, -4.6), body);
    const H = {
      kind: 'helicopter', heli: true, typeKey: 'heli_light', name: 'Okeelanta Anhinga 5T', mesh, body, model: { key: 'heli_light', brand: 'Okeelanta', name: 'Anhinga 5T', class: 'heli', engine: 'electric', idleRpm: 2000, maxRpm: 9000, gears: 1, sound: 'electric' },
      spec: { brand: 'Okeelanta', model: 'Anhinga 5T', label: 'Okeelanta Anhinga 5T', heli: true },
      pos: new THREE.Vector3(pos.x, y0 + SKID, pos.z), position: mesh.position, velocity: new THREE.Vector3(), heading, pitch: 0, roll: 0, yawRate: 0,
      rotor: 0, onGround: true, agl: 0, health: 1000, disabled: false, locked: false, playerDriven: false, speed: 0, speedKmh: 0, rpm: 0, gear: 1, throttle: 0, load: 0, submerged: 0,
      engineOn: false, camMode: 0, parts: m, home: opts.home || null, stick: { x: 0, y: 0, idle: 0 },
      setControls(c) { this._mainCtl = c; }, horn() {},
      exitPosition() { const s = Math.cos(this.heading), c = Math.sin(this.heading); const p = new THREE.Vector3(this.pos.x - s * 2.3, 0, this.pos.z + c * 2.3); p.y = floorAt(p.x, p.z, this.pos.y + 1); return p; },
      seatPosition() { return _v.set(-0.36, 1.0, 1.1).applyQuaternion(_q.setFromEuler(_e.set(this.pitch, this.heading, this.roll, 'YXZ'))).add(this.pos).clone(); },
    };
    sync(H, 0); list.push(H); game.emit?.('aircraft:spawned', { vehicle: H });
    return H;
  }
  function remove(H) { const i = list.indexOf(H); if (i >= 0) list.splice(i, 1); scene.remove(H.mesh); try { world.removeRigidBody(H.body); } catch (e) { /* */ } H.disposed = true; }
  function sync(H, dt) {
    H.mesh.position.copy(H.pos); H.mesh.rotation.set(H.pitch, H.heading, H.roll, 'YXZ');
    H.parts.update?.(dt, { rotorSpeed: H.rotor });
  }

  // ---------------------------------------------------------------- flight
  const inp = game.input, key = (c) => !!inp?.down?.(c);
  function controls(H, dt) {
    const blocked = game.ui?.paused || game.ui?.phoneOpen;
    const c = H.ctl || (H.ctl = { col: 0, yaw: 0, fwd: 0, side: 0 });
    if (blocked) { c.col = c.yaw = c.fwd = c.side = 0; return c; }
    const ax = (a, b) => (key(a) ? 1 : 0) - (key(b) ? 1 : 0);
    c.col = ax('KeyW', 'KeyS'); c.yaw = ax('KeyA', 'KeyD');
    const st = H.stick, mdx = inp.mouseDX || 0, mdy = inp.mouseDY || 0;
    if (mdx || mdy) { st.x = clamp(st.x + mdx * 0.004, -1, 1); st.y = clamp(st.y + mdy * 0.004, -1, 1); st.idle = 0; }
    else { st.idle += dt; if (st.idle > 0.15) { const k = Math.min(1, dt * 1.6); st.x -= st.x * k; st.y -= st.y * k; } }
    const kf = (key('KeyI') || key('ArrowUp') || key('Numpad8') ? 1 : 0) - (key('KeyK') || key('ArrowDown') || key('Numpad5') ? 1 : 0);
    const ks = (key('KeyL') || key('ArrowRight') || key('Numpad6') ? 1 : 0) - (key('KeyJ') || key('ArrowLeft') || key('Numpad4') ? 1 : 0);
    c.fwd = clamp(kf + st.y, -1, 1); c.side = clamp(ks + st.x, -1, 1);
    if (inp.pressed?.('KeyV')) H.camMode = (H.camMode + 1) % 2;
    return c;
  }
  function step(H, h) {
    const drive = H.playerDriven && !H.disabled, c = drive ? H.ctl || { col: 0, yaw: 0, fwd: 0, side: 0 } : { col: 0, yaw: 0, fwd: 0, side: 0 };
    H.rotor = clamp(H.rotor + (drive ? h / 3.5 : -h / 9), 0, 1);
    H.engineOn = drive;
    const lift = clamp((H.rotor - 0.75) / 0.25, 0, 1);   // usable lift once spooled up
    const v = H.velocity;
    // attitude (visual and the thrust direction): nose down to go forward, bank to slide
    const pT = (H.onGround ? 0 : c.fwd * 0.32), rT = (H.onGround ? 0 : c.side * 0.42);
    H.pitch += (pT - H.pitch) * Math.min(1, h * 2.6); H.roll += (rT - H.roll) * Math.min(1, h * 2.6);
    const yr = c.yaw * 1.25 * (H.onGround ? 0.35 * lift : 1) * lift; H.yawRate += (yr - H.yawRate) * Math.min(1, h * 3.5); H.heading = wrap(H.heading + H.yawRate * h);
    // horizontal: thrust from the tilt, the bank also turns a little (coordinated), drag
    const fx = Math.sin(H.heading), fz = Math.cos(H.heading), rx = -fz, rz = fx;   // heading 0 faces +z, right is -x; +roll = bank right, +pitch = nose down
    if (!H.onGround) {
      const af = H.pitch / 0.32 * 15 * lift, as = H.roll / 0.42 * 11 * lift;
      v.x += (fx * af + rx * as) * h; v.z += (fz * af + rz * as) * h;
      H.heading = wrap(H.heading - H.roll * 0.35 * h * clamp(Math.hypot(v.x, v.z) / 20, 0, 1));
      const k = Math.exp(-0.27 * h); v.x *= k; v.z *= k;
    } else { const k = Math.exp(-5 * h); v.x *= k; v.z *= k; }
    // vertical: collective sets the climb rate; hands off it holds height (when spooled)
    const vyT = lift > 0.05 ? c.col * (c.col > 0 ? 8.5 : 7) : -12;
    if (lift > 0.05) v.y += (vyT - v.y) * Math.min(1, h * 1.8 * lift) + (1 - lift) * -9.81 * h;
    else v.y -= 9.81 * h;
    // integrate with collision probes
    const np = _v.set(H.pos.x + v.x * h, H.pos.y + v.y * h, H.pos.z + v.z * h);
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0.5) {
      try { const len = hs * h + 4.5, hit = world.castRay(new RAPIER.Ray({ x: H.pos.x, y: H.pos.y + 1.5, z: H.pos.z }, { x: v.x / hs, y: 0, z: v.z / hs }), len, true, STATIC);
        if (hit) { const t = hit.timeOfImpact ?? hit.toi; if (t < len - 0.01) { if (hs > 12) damage(H, hs * 22, 'hit'); v.x *= -0.25; v.z *= -0.25; np.x = H.pos.x; np.z = H.pos.z; } } } catch (e) { /* */ }
    }
    const fl = floorAt(np.x, np.z, Math.max(np.y, H.pos.y) + 1.5);
    H.agl = Math.max(0, np.y - fl);
    if (np.y <= fl + SKID) {
      if (!H.onGround && v.y < -9) damage(H, (-v.y - 9) * 110 + 150, 'hard landing');
      else if (!H.onGround) game.emit?.('aircraft:touchdown', { vehicle: H, vs: v.y, surface: city.isWater?.(np.x, np.z) ? 'water' : 'ground' });
      np.y = fl + SKID; if (v.y < 0) v.y = 0; H.onGround = c.col <= 0 || lift < 0.95;
      if (city.isWater?.(np.x, np.z) && fl <= sea()) { damage(H, h * 400, 'water'); H.submerged = 1; }
    } else if (H.agl > 0.4) H.onGround = false;
    if (H.onGround && c.col > 0 && lift >= 0.95) { H.onGround = false; v.y = Math.max(v.y, 1.5); }
    H.pos.copy(np);
    H.speed = hs; H.speedKmh = hs * 3.6; H.rpm = 2000 + 7000 * H.rotor; H.throttle = lift * (0.4 + Math.max(0, c.col) * 0.6); H.load = H.throttle;
    _q.setFromEuler(_e.set(H.pitch, H.heading, H.roll, 'YXZ'));
    H.body.setNextKinematicTranslation({ x: H.pos.x, y: H.pos.y, z: H.pos.z }); H.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  }
  function damage(H, amt, why) {
    if (H.disabled) return;
    H.health -= amt;
    if (H.playerDriven && amt > 60) game.hud?.notify?.(H.health < 350 ? 'Helicopter badly damaged' : 'Helicopter damaged', 1500);
    if (H.health <= 0) {
      H.disabled = true; H.rotor = 0;
      game.emit?.('explosion', { position: H.pos.clone(), radius: 9, source: H });
      game.emit?.('aircraft:destroyed', { vehicle: H, position: H.pos.clone(), cause: why });
      H.mesh.traverse((o) => { if (o.isMesh && !o.userData.burnt) { o.userData.burnt = true; o.material = [].concat(o.material).map((m) => { const c = m.clone(); c.color?.multiplyScalar(0.2); return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
      if (H.playerDriven) { try { game.exitVehicle?.(); } catch (e) { /* */ } }
    }
  }

  // ---------------------------------------------------------------- camera (chase; V: closer / higher)
  const cp = new THREE.Vector3(), cl = new THREE.Vector3(); let camOn = null, camInit = false;
  const heliCam = (dt, cam) => {
    const H = P.state?.vehicle; if (!H || !H.heli) return false;
    const back = H.camMode ? 10 : 17, up = H.camMode ? 3.2 : 5.5, fx = Math.sin(H.heading), fz = Math.cos(H.heading);
    const want = _v.set(H.pos.x - fx * back, H.pos.y + up + Math.max(0, -H.velocity.y) * 0.2, H.pos.z - fz * back);
    const gy = city.groundHeightAt(want.x, want.z) + 1.2; if (want.y < gy) want.y = gy;
    if (!camInit) { cp.copy(want); camInit = true; } else cp.lerp(want, 1 - Math.exp(-dt * 5));
    cl.set(H.pos.x + fx * 6, H.pos.y + 1.6, H.pos.z + fz * 6);
    cam.position.copy(cp); cam.up.set(0, 1, 0); cam.lookAt(cl); return true;
  };

  // rotor sound: filtered noise chopped at the blade rate
  let snd = null;
  function sound(H) {
    try {
      if (!snd) {
        const ctx = game.audio?.ctx || game.audio?.context || new (window.AudioContext || window.webkitAudioContext)();
        const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = n; src.loop = true;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        const chop = ctx.createGain(), out = ctx.createGain(); out.gain.value = 0; chop.gain.value = 0.5;
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(chop.gain);
        const whine = ctx.createOscillator(), wg = ctx.createGain(); whine.type = 'triangle'; whine.frequency.value = 900; wg.gain.value = 0.02; whine.connect(wg); wg.connect(out);
        src.connect(lp); lp.connect(chop); chop.connect(out); out.connect(ctx.destination); src.start(); lfo.start(); whine.start();
        snd = { ctx, out, lfo, whine, lp };
      }
      const r = H ? H.rotor : 0, t = snd.ctx.currentTime;
      snd.out.gain.setTargetAtTime(H ? 0.22 * r * (game.audio?.muted ? 0 : 1) : 0, t, 0.15);
      snd.lfo.frequency.setTargetAtTime(4 + r * 13, t, 0.2); snd.whine.frequency.setTargetAtTime(500 + r * 900, t, 0.2); snd.lp.frequency.setTargetAtTime(250 + r * 400 + (H?.throttle || 0) * 300, t, 0.2);
    } catch (e) { /* */ }
  }

  const impl = {
    types: ['heli', 'helicopter'], list,
    spawn: (type, pos, heading, opts) => spawn(pos || P.position, heading || 0, opts || {}),
    remove,
    nearest(pos, maxDist) { let best = null, bd = maxDist; for (const H of list) { if (H.disabled || H.disposed) continue; const d = Math.hypot(H.pos.x - pos.x, H.pos.z - pos.z) - 1.8 + (Math.abs(pos.y - H.pos.y) > 4 ? 99 : 0); if (d < bd) { bd = d; best = H; } } return best; },
    distance: (H, pos) => Math.max(0, Math.hypot(H.pos.x - pos.x, H.pos.z - pos.z) - 1.8),
    fixed(h) { for (const H of list) { if (!H.playerDriven && H.onGround && H.rotor <= 0 && !H.disabled) continue; step(H, h); } },
    update(dt) {
      const pv = P.state?.vehicle, drv = pv && pv.heli ? pv : null;
      if (drv) controls(drv, dt);
      if (drv && game.cameraOverride !== heliCam && !game.cameraOverride) { game.cameraOverride = heliCam; camInit = false; camOn = drv; }
      if (!drv && game.cameraOverride === heliCam) { game.cameraOverride = null; camOn = null; }
      for (const H of list) { const d = Math.hypot(H.pos.x - P.position.x, H.pos.z - P.position.z); H.mesh.visible = d < 3000 || H.playerDriven; if (H.mesh.visible) sync(H, dt); }
      let loud = drv; if (!loud) for (const H of list) if (H.rotor > 0.05 && Math.hypot(H.pos.x - P.position.x, H.pos.z - P.position.z) < 120) loud = H;
      if (loud || snd) sound(loud);
    },
  };
  game.vehicles?.registerKind?.('helicopter', impl);
  if (!game.vehicles?.registerKind) { game.fixedHooks?.push?.((h) => impl.fixed(h)); game.updaters.push((dt) => impl.update(dt)); }

  // ---------------------------------------------------------------- the Key Largo helipad (dry, flat, off the road, near Nico's)
  const pad = { x: null, z: null, state: 'idle', heli: null };
  function findPadSpot() {
    const rd = (x, z) => { try { const r = city.roadGraph?.nearestEdge?.(x, z, {}, 40); return r ? r.dist - (r.edge.width || 8) / 2 : 99; } catch (e) { return 99; } };
    let best = null, bs = -1e9;
    for (let r = 120; r <= 520; r += 20) for (let a = 0; a < Math.PI * 2; a += 10 / r) {
      const x = NICO.x + Math.cos(a) * r, z = NICO.z + Math.sin(a) * r;
      if (city.isWater?.(x, z)) continue;
      let ok = true; const g0 = city.groundHeightAt(x, z);
      for (let k = 0; k < 12 && ok; k++) { const b = k / 12 * Math.PI * 2, px = x + Math.cos(b) * 14, pz = z + Math.sin(b) * 14; if (city.isWater?.(px, pz) || Math.abs(city.groundHeightAt(px, pz) - g0) > 0.8) ok = false; }
      if (!ok) continue;
      const dr = rd(x, z); if (dr < 10) continue;
      let blocked = false; try { for (const [ox, oz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) { const h = world.castRay(new RAPIER.Ray({ x: x + ox, y: g0 + 40, z: z + oz }, { x: 0, y: -1, z: 0 }), 45, true, STATIC); if (h && g0 + 40 - (h.timeOfImpact ?? h.toi) > g0 + 0.8) blocked = true; } } catch (e) { /* */ }
      if (blocked) continue;
      const s = -Math.abs(r - 220) * 0.4 - Math.abs(dr - 25) * 0.6;   // ~200 m from the house, close to (not on) the highway
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best;
  }
  async function placePad() {
    pad.state = 'busy';
    for (let i = 0; i < 40 && city.collidersReadyAt && !city.collidersReadyAt(NICO.x, NICO.z); i++) await new Promise((r) => setTimeout(r, 500));
    const s = findPadSpot() || { x: NICO.x + 160, z: NICO.z - 120 };
    pad.x = s.x; pad.z = s.z;
    const hp = buildHelipad(game, s.x, s.z, 11); pad.y = hp.y; pad.group = hp.group;
    // a little windsock and a sign
    const sign = document.createElement('canvas'); sign.width = 256; sign.height = 96; const g = sign.getContext('2d'); g.fillStyle = '#137a7f'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#fff'; g.font = '900 30px Arial'; g.textAlign = 'center'; g.fillText('KEYS AIR TOURS', 128, 42); g.font = 'bold 18px Arial'; g.fillText('HELIPAD  ·  PRIVATE', 128, 74);
    const st = new THREE.CanvasTexture(sign); st.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshStandardMaterial({ map: st, side: THREE.DoubleSide })); sm.position.set(13.5, 1.4, 0); sm.rotation.y = Math.PI / 2; hp.group.add(sm);
    for (const zz of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), new THREE.MeshStandardMaterial({ color: 0x777777 })); p.position.set(13.5, 0.5, zz); hp.group.add(p); }
    pad.heli = spawn(new THREE.Vector3(s.x, hp.y + 1, s.z), Math.atan2(NICO.x - s.x, NICO.z - s.z), { y: hp.y, home: 'keys-pad' });
    pad.state = 'live';
    console.log('[heli] Key Largo helipad at', Math.round(s.x), Math.round(s.z));
  }
  game.updaters.push(function heliPadStream() {
    const pp = P?.position; if (!pp || pad.state !== 'idle') return;
    if (Math.hypot(pp.x - NICO.x, pp.z - NICO.z) < 1800) placePad().catch((e) => { console.warn('[heli] pad', e); pad.state = 'failed'; });
  });
  game.heli = { list, pad, spawn: (pos, heading) => spawn(pos || P.position, heading || 0), tp: () => pad.x != null && game.dev?.teleportTo ? game.dev.teleportTo(pad.x + 16, pad.z) : game.teleport?.(pad.x + 16, undefined, pad.z, 0) };
}
