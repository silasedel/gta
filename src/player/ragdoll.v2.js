// Southline — the player's active ragdoll, GTA style (PLAYER helper). Uses the crowd's ragdoll system
// (src/npc/ragdoll.js, people helper) on Nico's body (character.ragdollRadii fits the capsules to his mesh):
//   - hit by a car above ~15 km/h, killed, falling more than ~4 m, caught in an explosion -> ragdoll
//   - alive: once the body lies still, the root is placed under the pelvis and Nico blends into the get-up clip
//     (face up / face down), then control comes back; dead: he stays down until the respawn.
// While ragdolled the player's capsule follows the pelvis (camera, queries), its collider is off, and the
// character's own animation update is skipped (character.__ragdoll), so the bodies drive the bones.
// game.playerRagdoll = { trigger(kind, opts), active, phase, sys }   (also for tests: kind 'car' | 'fall' | 'explosion' | 'death' | 'test')
import * as THREE from 'three';
import { createRagdollSystem } from '../npc/ragdoll.js';

export const order = 46;
const CAR_KMH = 15, FALL_M = 4.0;
// Nov 19 (user: "lies on the ground too long, then glitches up"): get up 0.6-1.1 s after the body stops travelling (the
// pelvis and chest, not every twitching limb), through the slower get-ups (proceduralClips getUpRoll / getUpProne: roll
// over, hands and knees, one foot, stand). Control returns just before the clip ends (its last 0.3 s blends to idle).
// ?getup=old = the old clips and timing.
const OLD_GETUP = typeof location !== 'undefined' && /[?&]getup=old\b/.test(location.search);
const GETUP_S = OLD_GETUP ? { back: 2.6, fwd: 2.4 } : { roll: 3.35, prone: 2.95 };
const CALM_V = 0.35, MAX_DOWN = 4.5;

export async function initV2(game) {
  const P = game.player, R = game.RAPIER, W = game.world;
  let sys = null;
  try { sys = createRagdollSystem(game, 1); } catch (e) { console.warn('[playerRagdoll] no ragdoll system', e); return; }
  const S = { rd: null, phase: null, t: 0, calm: 0, hold: 0.8, face: 'back', lethal: false, lastDir: new THREE.Vector3(0, 0, 1), air: 0, peakY: null, wasGrounded: true };
  const ch = () => game.playerCharacter;
  const groundAt = (x, y, z) => {
    try { const h = W.castRay(new R.Ray({ x, y: y + 1.5, z }, { x: 0, y: -1, z: 0 }), 12, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC | R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.collider); return h ? y + 1.5 - h.timeOfImpact : y; } catch (e) { return y; }
  };
  const can = () => {
    const c = ch();
    return !!(c && c.tripo && c.getBone && !S.phase && !P.state.inVehicle && !P.swimming && !P.script && c.root.visible !== false);
  };

  function trigger(kind, o = {}) {
    if (!can()) return false;
    const c = ch();
    const lethal = o.lethal ?? P.health <= 0;
    try {
      c.root.updateMatrixWorld(true);
      const rd = sys.start(c, { vel: o.vel || { x: 0, y: 0, z: 0 }, spin: o.spin || 0, hit: o.impulse ? { impulse: o.impulse, point: o.point || null } : null, kind: o.ragKind || kind, strength: o.strength ?? 0.6, lethal, balance: false });
      if (!rd) return false;
      S.rd = rd; S.phase = 'rag'; S.t = 0; S.calm = 0; S.hold = 0.6 + Math.random() * 0.5; S.lethal = lethal; S.kind = kind;
      c.__ragdoll = true;
      try { P.collider?.setEnabled(false); } catch (e) { /* ignore */ }
      // hold the player: no input movement; the main loop still places the root, our fixed hook moves the capsule
      P.script = { lock: true, ragdoll: true, fixed() {}, anim: { speed: 0, grounded: true, ragdoll: true } };
      P.ragdoll = true;
      game.emit?.('playerRagdoll', { kind, lethal });
      return true;
    } catch (e) { console.warn('[playerRagdoll] start failed', e); S.rd = null; S.phase = null; return false; }
  }

  function release() {     // hand control back (after the get-up, or on respawn)
    const c = ch();
    if (c) c.__ragdoll = false;
    S.phase = null; S.rd = null; P.ragdoll = false;
    if (P.script?.ragdoll) P.script = null;
    try { P.collider?.setEnabled(true); } catch (e) { /* ignore */ }
  }

  function getUp() {
    const c = ch(), rd = S.rd;
    const info = sys.poseInfo(rd);
    if (!info || !c) { sys.remove(rd); release(); return; }
    const hx = info.head.x - info.pelvis.x, hz = info.head.z - info.pelvis.z;
    const face = OLD_GETUP ? (info.faceUp ? 'back' : 'fwd') : (info.faceUp ? 'roll' : 'prone');
    // the old back get-up lies with the head toward local -Z; the others toward +Z
    const heading = face === 'back' ? Math.atan2(-hx, -hz) : Math.atan2(hx, hz);
    const gy = groundAt(info.pelvis.x, info.pelvis.y, info.pelvis.z);
    P.heading = heading; P.position.set(info.pelvis.x, gy, info.pelvis.z);
    try { P.body.setTranslation({ x: info.pelvis.x, y: gy + (P.capsule?.center ?? 0.9) + 0.02, z: info.pelvis.z }, true); } catch (e) { /* ignore */ }
    c.root.position.set(info.pelvis.x, gy, info.pelvis.z); c.root.rotation.set(0, heading, 0); c.root.updateMatrixWorld(true);
    sys.handoff(rd);                       // bones re-expressed under the moved root: the snapshot below blends without a pop
    c.__ragdoll = false;
    c.snapshotPose?.(OLD_GETUP ? 0.6 : 0.45);
    S.rd = null; S.phase = 'getup'; S.t = 0; S.face = face; c.__face = face;
    P.script = { lock: true, ragdoll: true, fixed() {}, anim: { speed: 0, grounded: true, getUp: face } };
  }

  // capsule follows the pelvis while ragdolled (after every other fixed hook, so a car knock-back does not fight it)
  game.fixedHooks.push(function playerRagdollFixed() {
    if (S.phase !== 'rag' || !S.rd) return;
    if (S.lethal && P.health > 0) return;            // respawn in progress: gameplay moves the body now
    const p = sys.pelvisPos(S.rd); if (!p) return;
    const gy = groundAt(p.x, p.y, p.z);
    try { P.body.setNextKinematicTranslation({ x: p.x, y: gy + (P.capsule?.center ?? 0.9), z: p.z }); } catch (e) { /* ignore */ }
    P.position.set(p.x, gy, p.z);
  });

  game.updaters.push(function playerRagdoll(dt) {
    try { sys.update(dt); } catch (e) { console.warn('[playerRagdoll] update', e); }
    S.t += dt;
    if (S.phase === 'rag') {
      if (S.lethal) {
        if (P.health > 0) { sys.remove(S.rd); release(); }                 // respawned
      } else if (OLD_GETUP) { if (S.rd?.recovered || sys.readyToGetUp(S.rd) || S.t > 7) getUp(); }
      else {
        // calm = the pelvis and chest have (nearly) stopped; limbs may still settle
        const rd = S.rd, pv = rd?.byKey?.pelvis?.body, cv = rd?.byKey?.chest?.body;
        let v = 0; try { if (pv) { const a = pv.linvel(); v = Math.hypot(a.x, a.y, a.z); } if (cv) { const b2 = cv.linvel(); v = Math.max(v, Math.hypot(b2.x, b2.y, b2.z)); } } catch (e) { v = 0; }
        S.calm = rd?.frozen || v < CALM_V ? S.calm + dt : Math.max(0, S.calm - dt * 2);
        if (rd?.recovered || (S.calm >= S.hold && S.t > 0.7) || S.t > MAX_DOWN) getUp();
      }
      return;
    }
    if (S.phase === 'getup') {
      if (S.t > (GETUP_S[S.face] || 2.5)) release();
      return;
    }
    // ---- triggers that need watching: death and long falls
    if (P.health <= 0 && !game.ui?.arrested && !game.ui?.busted) {
      const d = S.lastDir; trigger('death', { lethal: true, kind: 'melee', vel: { x: d.x * 1.2, y: 0, z: d.z * 1.2 }, strength: 0.15 });
      return;
    }
    const grounded = P.state.grounded !== false || P.swimming;
    if (!grounded && !P.state.inVehicle) { S.peakY = S.peakY === null ? P.position.y : Math.max(S.peakY, P.position.y); }
    else if (S.peakY !== null) {
      const drop = S.peakY - P.position.y; S.peakY = null;
      if (drop > FALL_M && !P.swimming && !P.state.inVehicle) {
        const dmg = Math.min(100, (drop - FALL_M) * 9 + 5);
        P.health -= dmg;
        try { game.emit?.('hit', { target: 'player', kind: 'fall', damage: dmg, point: P.position.clone() }); } catch (e) { /* ignore */ }
        const v = P.velocity || new THREE.Vector3();
        trigger('fall', { ragKind: 'fall', lethal: P.health <= 0, strength: Math.max(0.2, 0.8 - drop * 0.04), vel: { x: v.x * 0.8, y: -Math.min(12, Math.sqrt(2 * 9.81 * drop)) * 0.25, z: v.z * 0.8 } });
      }
    }
  });

  // car hits (main.js resolves them and emits 'hit' with the car): above 15 km/h the body goes over the hood
  game.on?.('hit', (e) => {
    if (!e || e.target !== 'player') return;
    if (e.point && P.position) { const d = new THREE.Vector3(P.position.x - e.point.x, 0, P.position.z - e.point.z); if (d.lengthSq() > 1e-4) S.lastDir.copy(d.normalize()); }
    if (e.kind !== 'car' || !e.object?.body) return;
    let lv; try { lv = e.object.body.linvel(); } catch (e2) { return; }
    const sp = Math.hypot(lv.x, lv.z), kmh = sp * 3.6;
    if (kmh < CAR_KMH) return;
    const dx = lv.x / sp, dz = lv.z / sp; S.lastDir.set(dx, 0, dz);
    const v = Math.min(16, sp) * 0.8;
    // trigger next frame: main.js set the knock-back and health in this same call
    queueMicrotask(() => trigger('car', { ragKind: 'car', lethal: P.health <= 0, strength: Math.min(1, kmh / 60), vel: { x: dx * v, y: Math.min(3.2, kmh / 22), z: dz * v }, spin: Math.min(3, kmh / 20),
      point: P.position.clone().setY(P.position.y + 0.9), impulse: new THREE.Vector3(dx * v * 6, 0, dz * v * 6) }));
  });
  // explosions: inside 80 % of the blast radius the body is thrown away from the center
  game.on?.('explosion', (e) => {
    if (!e?.position || !P.position) return;
    const d = new THREE.Vector3().subVectors(P.position, e.position); const dist = d.length(), R0 = (e.radius || 7) * 0.8;
    if (dist > R0) return;
    d.y = 0; if (d.lengthSq() < 1e-4) d.set(Math.sin(P.heading), 0, Math.cos(P.heading)); d.normalize(); S.lastDir.copy(d);
    const k = 1 - dist / R0, v = 3 + 9 * k;
    setTimeout(() => trigger('explosion', { ragKind: 'explosion', lethal: P.health <= 0, strength: 0.3, vel: { x: d.x * v, y: 2 + 5 * k, z: d.z * v }, spin: 2 * k,
      point: P.position.clone().setY(P.position.y + 0.9), impulse: new THREE.Vector3(d.x * v * 8, (2 + 5 * k) * 6, d.z * v * 8) }), 0);
  });

  game.playerRagdoll = { trigger, get active() { return !!S.phase; }, get phase() { return S.phase; }, sys, release };
}
