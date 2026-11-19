// W6 stealth (airports agent, Nov 19): a guarded zone (the military air base, the airside of Miami International).
// Armed guards walk patrol routes (or stand posts), security cameras sweep; each one has a view cone with line of sight
// (static colliders only, the chain-link fence is see-through), a short noticing delay that is shorter the closer you are,
// and a suspicion level shown above the guard ("?" amber, "!" red) and on the HUD meter (hud.js). Suspicious = on foot or
// in a vehicle inside the perimeter, or climbing its fence; a helicopter that flies normally is not (it is watched for
// erratic flying instead: very low or fast passes, circling, buzzing the guards). At full suspicion the zone goes on
// alert: wanted stars (cfg.stars; the base escalates to 5 if you are seen again on the alert), every guard runs at your
// last known spot and the armed ones open fire. Guards can be shot (listens to the player's 'shot' events).
// Cheap: all guards draw as 3 instanced meshes; observers only think while the player is within cfg.thinkR (400 m) of
// one; nothing at all runs beyond cfg.sleepR of the zone.
// Nov 19 (models pass): cfg.person = { id, retint } puts the user's rigged person (src/npc/people library, e.g. p123 the
// security guard, p12 the tactical officer retinted olive at the base) on the nearest guards: a pool of POOL skinned
// figures (LOD1 body, ~5k tris, shared idle / walk / run / death clips, rifle in the right hand) for guards within
// SKIN_R of the camera; the instanced figures stay for the far ones. cfg.camModel = a GLB path (models.js) for the
// camera heads (the user's library camera hangs from an arm on the pole). ?guardskin=0 = the old figures only.
//   createZone(game, cfg) -> { update(dt), guards, cams, state, alert(pos, why), tp(name) }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { meter } from './hud.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadPerson, personMaterial } from '../../npc/people/lib.js';
import { loadModel } from '../../world/airport/models.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const SKIN = !(typeof location !== 'undefined' && /[?&]guardskin=0\b/.test(location.search));
const POOL = 6;
const SKIN_R = 120;

// A low-poly rifle held in the right hand of the skinned guards.
const RIFLE_G = (() => {
  const parts = [
    [0.05, 0.08, 0.78, 0, 0, 0.12], // receiver + barrel
    [0.04, 0.15, 0.06, 0, -0.08, 0.02], // magazine
    [0.045, 0.05, 0.2, 0, 0.01, 0.6], // muzzle
    [0.04, 0.07, 0.22, 0, -0.01, -0.3], // stock
  ];
  const boxes = parts.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  return mergeGeometries(boxes);
})();

// Dark, low-saturation gear -> olive drab (skin and light parts kept): the tactical officer as a
// base guard.
function retinted(base, rgb) {
  const m = base.clone();
  m.userData = { ...base.userData, shared: false };
  const prev = base.onBeforeCompile;
  const olive = rgb.map((v) => v.toFixed(3)).join(', ');
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(base, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float l = dot(c, vec3(0.3, 0.59, 0.11));
        float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        float k = smoothstep(0.1, 0.03, sat) * smoothstep(0.45, 0.2, l);
        diffuseColor.rgb = mix(c, vec3(${olive}) * (0.45 + l * 2.2), k);
      }`,
    );
  };
  m.customProgramCacheKey = () => 'personBodyRetint' + rgb.join(',');
  return m;
}

// ---------------------------------------------------------------- guard figure (low poly, vertex colored, ~600 tris)
function colored(geo, hex) { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); return geo; }
const bx = (w, h, d, x, y, z, hex, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return colored(g, hex); };
const cy = (r0, r1, h, x, y, z, hex, seg = 8) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return colored(g, hex); };
function guardGeos(look) {
  const U = look.uniform, D = look.dark, S = look.skin, V = look.vest, HL = look.helmet;
  const body = mergeGeometries([
    bx(0.4, 0.55, 0.24, 0, 1.22, 0, U), bx(0.44, 0.4, 0.3, 0, 1.25, 0.005, V),             // torso, plate carrier
    bx(0.36, 0.14, 0.22, 0, 0.92, 0, D),                                                   // belt / hips
    cy(0.08, 0.09, 0.1, 0, 1.53, 0, S), (() => { const g = new THREE.SphereGeometry(0.115, 10, 8); g.translate(0, 1.66, 0.01); return colored(g, S); })(),
    (() => { const g = new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); g.translate(0, 1.67, 0); return colored(g, HL); })(),
    bx(0.09, 0.42, 0.1, 0.25, 1.24, 0.08, U, -0.5), bx(0.09, 0.42, 0.1, -0.25, 1.24, 0.08, U, -0.5),   // upper arms forward
    bx(0.08, 0.08, 0.34, 0.16, 1.07, 0.32, U), bx(0.08, 0.08, 0.3, -0.14, 1.12, 0.3, U),               // forearms on the rifle
    bx(0.05, 0.09, 0.82, 0.02, 1.13, 0.42, 0x1b1d1f), bx(0.04, 0.16, 0.06, 0.02, 1.03, 0.36, 0x1b1d1f), bx(0.05, 0.05, 0.2, 0.02, 1.15, 0.9, 0x0e0f10),   // rifle
  ]);
  const leg = mergeGeometries([bx(0.15, 0.82, 0.17, 0, -0.43, 0, U), bx(0.16, 0.12, 0.28, 0, -0.86, 0.05, D)]);   // top at the hip (origin)
  return { body, leg };
}

// ---------------------------------------------------------------- the zone
export function createZone(game, cfg) {
  const { scene, world, RAPIER } = game, city = game.city, P = game.player;
  const ground = (x, z) => city?.groundHeightAt?.(x, z) ?? 0;
  const QF = RAPIER.QueryFilterFlags, STATIC = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  const thinkR = cfg.thinkR || 400, sleepR = cfg.sleepR || 2500, dark = cfg.dark;
  const root = new THREE.Group(); root.name = 'stealth-' + cfg.id; scene.add(root);
  const st = { alert: false, alertT: 0, seenAgainT: 0, sus: 0, air: 0, why: '', detections: 0, circ: 0, lastH: null, kills: 0 };

  // guards ------------------------------------------------------------
  const look = cfg.look || { uniform: 0x5b6142, dark: 0x2c2f22, skin: 0x8a6448, vest: 0x4a5036, helmet: 0x4d5338 };
  const geos = guardGeos(look);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
  const guards = (cfg.guards || []).map((g, i) => {
    const pts = (g.route || [[g.x, g.z]]).map(([x, z]) => ({ x, z }));
    const p0 = pts[0];
    return { i, pts, wp: 1 % pts.length, x: p0.x, z: p0.z, y: ground(p0.x, p0.z), h: g.heading ?? 0, h0: g.heading ?? 0, post: pts.length < 2, speed: g.speed || 1.35,
      pause: 0, lookT: 0, lookA: 0, sus: 0, mode: 'patrol', fov: g.fov || 1.9, range: g.range || 46, hp: 100, dead: false, deadT: 0, phase: Math.random() * 6, fireCd: 1.5, armed: g.armed !== false, marker: null, tx: 0, tz: 0 };
  });
  const N = Math.max(1, guards.length);
  const imBody = new THREE.InstancedMesh(geos.body, mat, N), imL = new THREE.InstancedMesh(geos.leg, mat, N), imR = new THREE.InstancedMesh(geos.leg, mat, N);
  for (const im of [imBody, imL, imR]) { im.castShadow = true; im.frustumCulled = false; im.count = guards.length; root.add(im); }
  const M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), Qt = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), S0 = new THREE.Vector3(0, 0, 0);
  function drawGuard(g) {
    const walk = g.mode === 'walk' || g.mode === 'run', sw = walk ? Math.sin(g.phase) * (g.mode === 'run' ? 0.75 : 0.42) : 0;
    E.set(g.dead ? -Math.PI / 2 * Math.min(1, g.deadT * 2.5) : 0, g.h, 0, 'YXZ'); Qt.setFromEuler(E);
    M.compose(V.set(g.x, g.y + (g.dead ? 0.15 : 0), g.z), Qt, g.slot ? S0 : S1); imBody.setMatrixAt(g.i, M);
    for (const [im, s, side] of [[imL, sw, 0.1], [imR, -sw, -0.1]]) {
      M2.makeRotationX(g.dead ? 0 : s); M2.setPosition(side, 0.92, 0); im.setMatrixAt(g.i, M2.premultiply(M));
    }
  }
  function markerFor(g) {
    if (g.marker) return g.marker;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.scale.set(0.7, 0.7, 1); sp.renderOrder = 10; root.add(sp);
    g.marker = { sp, c, tex, k: '' }; return g.marker;
  }
  function drawMarker(g, d) {
    const k = g.dead ? '' : (st.alert && g.sus > 0.05) || g.sus >= 1 ? '!' : g.sus > 0.04 ? '?' + Math.round(g.sus * 8) : '';
    if (!k) { if (g.marker) g.marker.sp.visible = false; return; }
    const m = markerFor(g); m.sp.visible = d < 260; m.sp.position.set(g.x, g.y + 2.15, g.z); const s = 0.5 + d * 0.012; m.sp.scale.set(s, s, 1);
    if (m.k === k) return; m.k = k;
    const x = m.c.getContext('2d'); x.clearRect(0, 0, 64, 64);
    const red = k === '!'; const f = red ? 1 : (+k.slice(1)) / 8;
    x.fillStyle = 'rgba(10,12,16,.55)'; x.beginPath(); x.arc(32, 32, 26, 0, Math.PI * 2); x.fill();
    x.strokeStyle = red ? '#ff3b30' : '#ffb020'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); x.stroke();
    x.fillStyle = red ? '#ff3b30' : '#ffb020'; x.font = '900 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(red ? '!' : '?', 32, 34);
    m.tex.needsUpdate = true;
  }

  // skinned guards (the user's person model on the nearest guards) ----
  const slots = [];
  const _cp = new THREE.Vector3();
  if (SKIN && cfg.person?.id) {
    loadPerson(cfg.person.id)
      .then(buildSlots)
      .catch((e) => console.warn('[stealth] guard person', e));
  }

  function pickClip(base, ...names) {
    for (const n of names) if (base.clips[n]) return base.clips[n];
    return null;
  }

  function buildSlots(base) {
    if (!base) return;
    let bodyMat = personMaterial(base);
    if (cfg.person.retint) bodyMat = retinted(bodyMat, cfg.person.retint);
    const rifleMat = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.55, metalness: 0.4 });
    const clips = {
      idle: pickClip(base, 'idle'),
      walk: pickClip(base, 'walk_m', 'walk'),
      run: pickClip(base, 'run', 'jog'),
      dead: pickClip(base, 'deadBack', 'deadFwd'),
    };
    const n = Math.min(POOL, guards.length);
    for (let i = 0; i < n; i++) slots.push(makeSlot(base, bodyMat, rifleMat, clips));
  }

  // one pooled figure: the LOD1 body only, a rifle on the right hand, its own mixer
  function makeSlot(base, bodyMat, rifleMat, clips) {
    const o = SkeletonUtils.clone(base.scene);
    o.visible = false;
    root.add(o);
    let hand = null;
    o.traverse((m) => {
      if (m.isBone && /RightHand$/.test(m.name)) hand = m;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      m.visible = /LOD1/.test(m.name) || !/LOD\d/.test(m.name);
      if (m.visible) {
        m.material = bodyMat;
        m.castShadow = true;
      }
    });
    if (hand) {
      const rifle = new THREE.Mesh(RIFLE_G, rifleMat);
      rifle.position.set(-0.02, -0.04, 0.06);
      hand.add(rifle);
    }
    const mixer = new THREE.AnimationMixer(o);
    const acts = {};
    for (const k in clips) {
      if (!clips[k]) continue;
      acts[k] = mixer.clipAction(clips[k]);
      if (k === 'dead') {
        acts[k].setLoop(THREE.LoopOnce, 1);
        acts[k].clampWhenFinished = true;
      }
    }
    return { o, mixer, acts, g: null, cur: null };
  }

  // the guards nearest the camera (within SKIN_R) get a pooled figure; the rest stay instanced
  function nearestGuards() {
    const cam = game.camera?.position || P.position;
    _cp.copy(cam);
    return guards
      .filter((g) => !(g.dead && g.deadT > 30))
      .map((g) => ({ g, d: Math.hypot(g.x - _cp.x, g.z - _cp.z) }))
      .filter((e) => e.d < SKIN_R)
      .sort((p, q) => p.d - q.d)
      .slice(0, slots.length)
      .map((e) => e.g);
  }

  function release(slot) {
    slot.g.slot = null;
    slot.g = null;
    slot.o.visible = false;
    slot.cur = null;
  }

  function animate(slot, dt) {
    const g = slot.g;
    const look = g.mode === 'idle' ? (g.lookA || 0) * 0.3 : 0;
    slot.o.position.set(g.x, g.y, g.z);
    slot.o.rotation.set(0, g.h + look, 0);
    let k = 'idle';
    if (g.dead) k = 'dead';
    else if (g.mode === 'run') k = 'run';
    else if (g.mode === 'walk') k = 'walk';
    const act = slot.acts[k] || slot.acts.idle;
    if (slot.cur !== k && act) {
      const prev = slot.cur && slot.acts[slot.cur];
      act.reset();
      act.setEffectiveWeight(1);
      act.play();
      if (prev && prev !== act) prev.crossFadeTo(act, k === 'dead' ? 0.15 : 0.3, false);
      if (k === 'walk') act.timeScale = clamp(g.speed / 1.35, 0.7, 1.3);
      slot.cur = k;
    }
    slot.mixer.update(dt);
  }

  function skinPass(dt) {
    if (!slots.length) return;
    const want = nearestGuards();
    for (const slot of slots) {
      if (slot.g && !want.includes(slot.g)) release(slot);
    }
    for (const g of want) {
      if (g.slot) continue;
      const slot = slots.find((x) => !x.g);
      if (!slot) break;
      slot.g = g;
      g.slot = slot;
      slot.o.visible = true;
      drawGuard(g);
    }
    for (const slot of slots) if (slot.g) animate(slot, dt);
  }

  // cameras -----------------------------------------------------------
  const camMat = new THREE.MeshStandardMaterial({ color: 0xd9dbd6, roughness: 0.5, metalness: 0.3 }), camDark = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.4 });
  const poleG = new THREE.CylinderGeometry(0.07, 0.09, 1, 8).translate(0, 0.5, 0), headG = new THREE.BoxGeometry(0.22, 0.2, 0.5).translate(0, 0, 0.15), lensG = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10).rotateX(Math.PI / 2).translate(0, 0, 0.42);
  const armG = new THREE.BoxGeometry(0.08, 0.08, 0.5).translate(0, 0, 0.18);
  // the library camera hangs under a short arm on the pole; the box head goes
  function useCamModel(src, pole, head, h) {
    if (!src) return;
    for (const ch of head.children.slice()) {
      if (ch.geometry === headG || ch.geometry === lensG) head.remove(ch);
    }
    const arm = new THREE.Mesh(armG, camMat);
    arm.position.y = h + 0.12;
    pole.add(arm);
    const model = src.clone(true);
    model.scale.setScalar(1.15);
    model.position.set(0, -0.64, 0);
    head.add(model);
    head.position.y = h + 0.08;
  }
  const cams = (cfg.cams || []).map((c, i) => {
    const y0 = ground(c.x, c.z), h = c.h || 5.5, g = new THREE.Group(); g.position.set(c.x, y0, c.z); root.add(g);
    const pole = new THREE.Mesh(poleG, camMat); pole.scale.y = h; g.add(pole);
    const head = new THREE.Group(); head.position.y = h; g.add(head);
    head.add(new THREE.Mesh(headG, camMat)); head.add(new THREE.Mesh(lensG, camDark));
    const range = c.range || 38, fov = c.fov || 0.9, len = range, rad = Math.tan(fov / 2) * len;
    const coneM = new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 20, 1, true).translate(0, -len / 2, 0).rotateX(-Math.PI / 2), coneM); cone.renderOrder = 3; head.add(cone);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); led.position.set(0.08, 0.08, 0.38); head.add(led);
    const pitch = Math.atan2(h - 1, range * 0.55);
    if (cfg.camModel) loadModel(cfg.camModel).then((src) => useCamModel(src, g, head, h));
    return { i, x: c.x, z: c.z, y: y0 + h, yaw0: c.yaw, sweep: c.sweep ?? 0.9, period: c.period || 9, t: Math.random() * 10, yaw: c.yaw, range, fov, pitch, sus: 0, head, cone, coneM, led, dead: false };
  });

  // perception --------------------------------------------------------
  let fenceBody = null; const setFenceBody = (b) => { fenceBody = b; };
  const target = new THREE.Vector3();
  function playerTarget() {   // chest point of the player (or the vehicle he is in)
    const v = P.state?.vehicle; if (v) { const p = v.position || v.mesh?.position; if (p) return target.set(p.x, p.y + 1.0, p.z); }
    return target.set(P.position.x, P.position.y + 1.25, P.position.z);
  }
  function los(ex, ey, ez, t) {
    const dx = t.x - ex, dy = t.y - ey, dz = t.z - ez, L = Math.hypot(dx, dy, dz); if (L < 0.5) return true;
    try {
      const h = world.castRay(new RAPIER.Ray({ x: ex, y: ey, z: ez }, { x: dx / L, y: dy / L, z: dz / L }), L - 0.6, true, STATIC, undefined, undefined, fenceBody || undefined);
      return !h;
    } catch (e) { return true; }
  }
  const nightK = () => { const t = game.timeOfDay ?? 12; return t > 20 || t < 5.5 ? 0.62 : t > 19 || t < 6.5 ? 0.8 : 1; };
  // what the player is doing, from the zone's point of view: 0 = nothing wrong, 1 = trespassing
  function suspicious() {
    if (P.health <= 0 || P.state?.hidden) return 0;
    const v = P.state?.vehicle;
    if (v && v.heli && !v.onGround && st.air < 1) return 0;          // flying a helicopter normally: not (yet)
    const climbing = !!P.script?.climb;
    const x = P.position.x, z = P.position.z;
    if (climbing && cfg.nearFence?.(x, z)) return 1;
    return cfg.contains(x, z) ? 1 : 0;
  }
  function seeK(ex, ey, ez, facing, fov, range, t, peripheral) {   // 0..1 how well the observer sees the target (0 = not at all)
    const dx = t.x - ex, dz = t.z - ez, d = Math.hypot(dx, dz);
    let R = range * nightK(); const v = P.state?.vehicle;
    if (v) R *= 1.35; else if (P.state?.sprint) R *= 1.15; else if ((P.state?.speed || 0) < 1.2) R *= 0.8;   // still / slow: harder to spot
    if (d > R) return 0;
    if (d > peripheral) { const a = Math.abs(wrap(Math.atan2(dx, dz) - facing)); if (a > fov / 2) return 0; }
    if (Math.abs(t.y - ey) > R * 0.6) return 0;
    if (!los(ex, ey, ez, t)) return 0;
    return 1 - d / R;
  }

  // alert -------------------------------------------------------------
  const lkp = new THREE.Vector3(); let alarm = null;
  function alert(pos, why) {
    lkp.copy(pos || P.position);
    if (!st.alert) {
      st.alert = true; st.alertT = 0; st.detections++; st.why = why || 'seen';
      game.hud?.notify?.(cfg.alertText || 'Security alert: intruder spotted', 4000);
      try { game.wanted?.set?.(cfg.stars || 2, P.position.clone(), { visual: true, by: 'guard' }); } catch (e) { /* */ }
      game.emit?.('stealth:alert', { zone: cfg.id, why, stars: cfg.stars });
      if (cfg.siren) alarm = siren(alarm);
    } else if (cfg.stars2 && st.alertT > 10 && (game.wanted?.level ?? 0) < cfg.stars2) {
      try { game.wanted?.set?.(cfg.stars2, P.position.clone(), { visual: true, by: 'guard' }); } catch (e) { /* */ }
      game.hud?.notify?.(cfg.escalateText || 'Military response authorized', 3500);
    } else { try { const W = game.wanted; if ((W?.level ?? 0) < (cfg.stars || 2)) W?.set?.(cfg.stars || 2, P.position.clone(), { visual: true, by: 'guard' }); } catch (e) { /* */ } }
    st.alertT = Math.min(st.alertT, 30) ; st.lastSeen = game.clock?.elapsed ?? 0;
    for (const g of guards) if (!g.dead) g.sus = Math.max(g.sus, 0.5);
  }
  // a base siren (WebAudio, two tones, fades out after 20 s)
  function siren(prev) {
    try {
      const ctx = game.audio?.ctx || game.audio?.context || (siren.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
      if (prev) { try { prev.stop(); } catch (e) { /* */ } }
      const o = ctx.createOscillator(), gn = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 620; lfo.frequency.value = 0.45; lg.gain.value = 180; lfo.connect(lg); lg.connect(o.frequency);
      gn.gain.value = 0; o.connect(gn); gn.connect(ctx.destination);
      const t0 = ctx.currentTime; gn.gain.linearRampToValueAtTime(0.05, t0 + 0.6); gn.gain.setValueAtTime(0.05, t0 + 18); gn.gain.linearRampToValueAtTime(0, t0 + 22);
      o.start(); lfo.start(); o.stop(t0 + 22.5); lfo.stop(t0 + 22.5);
      return { stop() { try { gn.gain.cancelScheduledValues(ctx.currentTime); gn.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3); o.stop(ctx.currentTime + 0.4); lfo.stop(ctx.currentTime + 0.4); } catch (e) { /* */ } } };
    } catch (e) { return null; }
  }

  // guards fire -------------------------------------------------------
  const tracerGeo = new THREE.BufferGeometry(); tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0.9 })); tracer.visible = false; tracer.frustumCulled = false; root.add(tracer); let tracerT = 0;
  function damagePlayer(dmg) {
    if (P.health <= 0) return;
    const v = P.state?.vehicle; if (v) { v.health = (v.health ?? 1000) - dmg * 3; dmg *= 0.3; }
    if (P.armor > 0) { const a = Math.min(P.armor, dmg * 0.8); P.armor -= a; dmg -= a; }
    P.health = Math.max(0, P.health - dmg);
    game.emit?.('playerHit', { damage: dmg, from: 'guard' });
  }
  function guardShoot(g, t, d) {
    const ex = g.x + Math.sin(g.h) * 0.9, ez = g.z + Math.cos(g.h) * 0.9, ey = g.y + 1.15;
    const p = tracerGeo.attributes.position.array, miss = Math.random() > clamp(0.55 - d / 140, 0.12, 0.55);
    p[0] = ex; p[1] = ey; p[2] = ez; p[3] = t.x + (miss ? (Math.random() - 0.5) * 3 : 0); p[4] = t.y - 0.2 + (miss ? Math.random() : 0); p[5] = t.z + (miss ? (Math.random() - 0.5) * 3 : 0);
    tracerGeo.attributes.position.needsUpdate = true; tracer.visible = true; tracerT = 0.06;
    try { game.audio?.play?.('rifle', { position: { x: ex, y: ey, z: ez }, volume: 0.8 }); } catch (e) { /* */ }
    if (!miss) damagePlayer(7 + Math.random() * 7);
  }
  // the player's shots: a hit test against the guards (a 0.38 m capsule from the boots to the helmet)
  const onShot = (ev) => {
    if (!ev?.origin || !ev.dir || !live) return;
    const o = ev.origin, dr = ev.dir;
    let best = null, bt = 400;
    for (const g of guards) {
      if (g.dead) continue;
      const rx = g.x - o.x, rz = g.z - o.z, t = rx * dr.x + rz * dr.z; if (t < 0 || t > bt) continue;
      const hx = o.x + dr.x * t, hz = o.z + dr.z * t, hy = o.y + dr.y * t / Math.max(0.2, Math.hypot(dr.x, dr.z));
      if (Math.hypot(hx - g.x, hz - g.z) < 0.38 && hy > g.y - 0.1 && hy < g.y + 1.85) { bt = t; best = { g, head: hy > g.y + 1.5 }; }
    }
    if (best) { const g = best.g; g.hp -= best.head ? 100 : 45; g.sus = 1; if (g.hp <= 0) { g.dead = true; g.deadT = 0; st.kills++; game.emit?.('stealth:guardDown', { zone: cfg.id }); game.emit?.('crime', { type: 'murder', position: new THREE.Vector3(g.x, g.y, g.z), severity: 4, police: true }); } }
    // a loud shot near the zone puts everyone on alert
    if (!ev.suppressed) for (const g of guards) if (!g.dead && Math.hypot(g.x - o.x, g.z - o.z) < 90) { alert(new THREE.Vector3(o.x, o.y, o.z), 'gunfire'); break; }
  };
  game.on?.('shot', onShot);
  game.on?.('shot:suppressed', (ev) => { if (!ev?.origin) return; onShot({ ...ev, suppressed: true }); });

  // helicopter airspace -----------------------------------------------
  function airspace(dt) {
    const v = P.state?.vehicle; if (!v || !v.heli || !cfg.airspace) { st.air = Math.max(0, st.air - dt * 0.08); st.lastH = null; return; }
    const p = v.position, dc = Math.hypot(p.x - cfg.cx, p.z - cfg.cz);
    if (dc > cfg.airspace) { st.air = Math.max(0, st.air - dt * 0.1); st.lastH = null; st.circ *= Math.exp(-dt * 0.05); return; }
    const agl = v.agl ?? 99, sp = Math.hypot(v.velocity?.x || 0, v.velocity?.z || 0);
    let gain = 0, why = '';
    if (!v.onGround && agl < 22 && sp > 20) { gain += 0.35; why = 'low pass'; }
    if (agl < 140 && sp > 48) { gain += 0.25; why = why || 'high speed pass'; }
    for (const g of guards) if (!g.dead && Math.hypot(g.x - p.x, g.z - p.z) < 28 && agl < 18 && sp > 6) { gain += 0.9; why = 'buzzing the guards'; break; }
    if (st.lastH != null && !v.onGround) st.circ += wrap(v.heading - st.lastH); st.lastH = v.heading;
    st.circ *= Math.exp(-dt * 0.035);
    if (Math.abs(st.circ) > Math.PI * 2.4) { gain += 0.3; why = why || 'circling the base'; }
    st.air = gain ? Math.min(1.2, st.air + gain * dt) : Math.max(0, st.air - dt * 0.06);
    if (gain) st.airWhy = why;
    if (st.air >= 1 && !st.alert) { alert(p, 'erratic flight: ' + (st.airWhy || '')); game.hud?.notify?.('Tower: unidentified helicopter, ' + (st.airWhy || 'erratic flight') + '. Base on alert.', 4000); }
  }

  // update ------------------------------------------------------------
  let live = false, acc = 0, tick = 0;
  const hud = meter();
  function update(dt) {
    const pp = P?.position; if (!pp) return;
    const dz = Math.hypot(pp.x - cfg.cx, pp.z - cfg.cz);
    const awake = dz < sleepR;
    if (root.visible !== awake) root.visible = awake;
    if (!awake) { if (live) { live = false; hud.set(cfg.id, 0); } return; }
    live = true;
    const t = playerTarget(), susp = suspicious();
    tick++; acc += dt;
    airspace(dt);
    let maxSus = 0;
    // guards
    for (const g of guards) {
      const d = Math.hypot(g.x - pp.x, g.z - pp.z), near = d < thinkR;
      if (g.dead) { g.deadT += dt; if (g.deadT < 1) drawGuard(g); drawMarker(g, d); continue; }
      if (!near && !st.alert) { if (d < 900 && (tick + g.i) % 6 === 0) { moveGuard(g, dt * 6); drawGuard(g); } continue; }
      // perception (staggered: each guard looks every 3rd frame)
      if ((tick + g.i) % 3 === 0) {
        const k = susp ? seeK(g.x, g.y + 1.6, g.z, g.h + (g.lookA || 0), g.fov, g.range, t, 4.5) : 0;
        const dt3 = dt * 3;
        if (k > 0) { g.sus = Math.min(1, g.sus + dt3 * (0.35 + 2.4 * k * k) * (st.alert ? 3 : 1)); g.tx = t.x; g.tz = t.z; g.seeing = true; }
        else { g.seeing = false; g.sus = Math.max(0, g.sus - dt3 * (st.alert ? 0.03 : 0.18)); }
        if (g.sus >= 1 && g.seeing) alert(t, 'guard');
      }
      // behaviour
      if (st.alert && g.armed) {
        const dist = Math.hypot(lkp.x - g.x, lkp.z - g.z);
        if (g.seeing && susp) { lkp.copy(t); st.lastSeen = game.clock?.elapsed ?? 0; }
        const face = Math.atan2((g.seeing ? t.x : lkp.x) - g.x, (g.seeing ? t.z : lkp.z) - g.z); g.h += wrap(face - g.h) * Math.min(1, dt * 6); g.lookA = 0;
        if (g.seeing && d < 75) { g.mode = 'idle'; g.fireCd -= dt; if (g.fireCd <= 0) { g.fireCd = 0.35 + Math.random() * 0.6; guardShoot(g, t, d); } }
        else if (dist > 4 && d < 600) { const sp = 4.2; g.x += Math.sin(g.h) * sp * dt; g.z += Math.cos(g.h) * sp * dt; g.y = ground(g.x, g.z); g.mode = 'run'; g.phase += dt * 11; }
        else g.mode = 'idle';
      } else if (g.sus > 0.35 && g.seeing) {   // something is off: stop and stare
        g.mode = 'idle'; const face = Math.atan2(g.tx - g.x, g.tz - g.z); g.h += wrap(face - g.h) * Math.min(1, dt * 3); g.lookA = 0;
      } else moveGuard(g, dt);
      drawGuard(g); drawMarker(g, d);
      if (g.sus > maxSus) maxSus = g.sus;
    }
    skinPass(dt);
    imBody.instanceMatrix.needsUpdate = imL.instanceMatrix.needsUpdate = imR.instanceMatrix.needsUpdate = true;
    // cameras
    for (const c of cams) {
      const d = Math.hypot(c.x - pp.x, c.z - pp.z);
      if (c.dead) continue;
      c.t += dt; const track = st.alert && c.sus > 0.5;
      const want = track ? Math.atan2(t.x - c.x, t.z - c.z) : c.yaw0 + Math.sin(c.t / c.period * Math.PI * 2) * c.sweep;
      c.yaw += wrap(want - c.yaw) * Math.min(1, dt * (track ? 3 : 8));
      c.head.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
      if (d > thinkR) { c.sus = Math.max(0, c.sus - dt * 0.2); continue; }
      if ((tick + c.i) % 3 === 1) {
        const k = susp ? seeK(c.x, c.y, c.z, c.yaw, c.fov, c.range, t, 0) : 0, dt3 = dt * 3;
        c.seeing = k > 0;
        c.sus = k > 0 ? Math.min(1, c.sus + dt3 * (0.45 + 2.0 * k)) : Math.max(0, c.sus - dt3 * 0.25);
        if (c.sus >= 1 && k > 0) alert(t, 'camera');
      }
      const red = c.sus > 0.05; c.coneM.color.setHex(red ? (c.sus >= 1 ? 0xff2a1a : 0xffa020) : 0xfff3c0); c.coneM.opacity = (red ? 0.06 + c.sus * 0.05 : 0.05) * clamp(d / 25, 0.35, 1);   // fainter when you stand in it
      c.led.visible = ((game.clock?.elapsed ?? 0) * 2 % 1) < 0.5;
      if (c.sus > maxSus) maxSus = c.sus;
    }
    if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0) tracer.visible = false; }
    // alert lifetime: calms down after 45 s without a sighting
    if (st.alert) { st.alertT += dt; const since = (game.clock?.elapsed ?? 0) - (st.lastSeen ?? 0);
      if (since > 45 || P.health <= 0) { st.alert = false; for (const g of guards) { g.sus = 0; } for (const c of cams) c.sus = 0; try { alarm?.stop(); } catch (e) { /* */ } alarm = null; } }
    st.sus = maxSus;
    hud.set(cfg.id, st.alert ? 1.01 : Math.max(maxSus, st.air * 0.999), st.alert ? 'DETECTED' : st.air > maxSus && st.air > 0.02 ? 'AIRSPACE' : maxSus > 0.6 ? 'SUSPICIOUS' : 'NOTICED', cfg.label);
  }
  function moveGuard(g, dt) {
    if (g.post) {   // a post: look around now and then
      g.mode = 'idle'; g.lookT -= dt; if (g.lookT <= 0) { g.lookT = 3 + Math.random() * 5; g.lookTo = (Math.random() - 0.5) * 1.6; }
      g.h += wrap(g.h0 + (g.lookTo || 0) - g.h) * Math.min(1, dt * 1.5); return;
    }
    if (g.pause > 0) { g.pause -= dt; g.mode = 'idle'; g.lookA = Math.sin(g.pause * 0.9) * 0.9; return; }
    g.lookA = 0;
    const w = g.pts[g.wp], dx = w.x - g.x, dz = w.z - g.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { g.wp = (g.wp + 1) % g.pts.length; g.pause = Math.random() < 0.5 ? 2 + Math.random() * 3 : 0; return; }
    const want = Math.atan2(dx, dz); g.h += wrap(want - g.h) * Math.min(1, dt * 4);
    const s = Math.min(d, g.speed * dt); g.x += Math.sin(g.h) * s; g.z += Math.cos(g.h) * s; g.y = ground(g.x, g.z);
    g.mode = 'walk'; g.phase += dt * g.speed * 4.2;
  }
  for (const g of guards) drawGuard(g);
  imBody.instanceMatrix.needsUpdate = imL.instanceMatrix.needsUpdate = imR.instanceMatrix.needsUpdate = true;
  return { root, guards, cams, state: st, update, alert, setFenceBody, get live() { return live; } };
}
