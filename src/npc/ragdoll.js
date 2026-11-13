// Physics ragdolls (CHARACTER agent).
// 11 Rapier dynamic capsules with a human mass distribution (75 kg reference), hinge knees/elbows with
// anatomical limits, soft cone limits + joint friction on hips/shoulders/spine/neck, hit impulses at the
// struck point, settle detection and freezing. Bones are driven from the bodies every frame.
import * as THREE from 'three';

// key, bone, end bone, radius, parent, mass (kg), joint type, cone limit (rad) / hinge
const PARTS = [
  ['pelvis', 'Hips', 'Spine1', 0.12, null, 11.2, null, 0],
  ['chest', 'Spine2', 'Neck', 0.13, 'pelvis', 21.0, 'cone', 0.55],
  ['head', 'Head', 'HeadTop_End', 0.095, 'chest', 5.3, 'cone', 0.75],
  ['uArmL', 'LeftArm', 'LeftForeArm', 0.048, 'chest', 2.1, 'cone', 1.9], ['lArmL', 'LeftForeArm', 'LeftHand', 0.042, 'uArmL', 1.7, 'elbow', 0],
  ['uArmR', 'RightArm', 'RightForeArm', 0.048, 'chest', 2.1, 'cone', 1.9], ['lArmR', 'RightForeArm', 'RightHand', 0.042, 'uArmR', 1.7, 'elbow', 0],
  ['thighL', 'LeftUpLeg', 'LeftLeg', 0.075, 'pelvis', 7.6, 'cone', 1.35], ['shinL', 'LeftLeg', 'LeftFoot', 0.058, 'thighL', 4.6, 'knee', 0],
  ['thighR', 'RightUpLeg', 'RightLeg', 0.075, 'pelvis', 7.6, 'cone', 1.35], ['shinR', 'RightLeg', 'RightFoot', 0.058, 'thighR', 4.6, 'knee', 0],
];
export const LIMB_PARTS = {
  head: 'head', neck: 'head', chest: 'chest', torso: 'chest', spine: 'chest', back: 'chest', stomach: 'pelvis', pelvis: 'pelvis', hips: 'pelvis',
  leftarm: 'uArmL', leftupperarm: 'uArmL', leftforearm: 'lArmL', lefthand: 'lArmL', rightarm: 'uArmR', rightupperarm: 'uArmR', rightforearm: 'lArmR', righthand: 'lArmR',
  leftleg: 'thighL', leftthigh: 'thighL', leftshin: 'shinL', leftcalf: 'shinL', leftfoot: 'shinL', rightleg: 'thighR', rightthigh: 'thighR', rightshin: 'shinR', rightcalf: 'shinR', rightfoot: 'shinR',
};
const RAG_GROUP = 0x0004;
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
// hinge sign: +1 means a positive Rapier joint angle bends the knee backwards / elbow forwards
const HINGE_SIGN = -1;

function frameQuat(dir, right) {
  const y = dir.clone().normalize();
  let x = right.clone().addScaledVector(y, -right.dot(y));
  if (x.lengthSq() < 1e-6) x = new THREE.Vector3(1, 0, 0).addScaledVector(y, -y.x);
  x.normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
const q4 = (r) => _q.set(r.x, r.y, r.z, r.w);

export function createRagdollSystem(game, maxActive = 6) {
  const { world, RAPIER } = game;
  const active = [];

  function freeze(rd) {
    if (!rd || rd.frozen) return;
    rd.frozen = true;
    for (const p of rd.parts) { try { world.removeRigidBody(p.body); } catch (e) { /* ignore */ } }
    const i = active.indexOf(rd); if (i >= 0) active.splice(i, 1);
  }
  function remove(rd) {
    if (!rd) return;
    freeze(rd);
    rd.meshes.forEach((m) => { m.frustumCulled = true; });
  }

  /**
   * opts: { vel:{x,y,z}, spin, hit:{ point:Vector3, impulse:Vector3, part?:string }, scale }
   */
  function start(character, opts = {}) {
    if (!world || !RAPIER || !character?.getBone) return null;
    while (active.length >= maxActive) freeze(active[0]);
    character.root.updateMatrixWorld(true);
    const vel = opts.vel || { x: 0, y: 0, z: 0 };
    const rootQ = character.root.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(rootQ); // character faces +Z, its right is -X
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
    const parts = []; const byKey = {};
    const massScale = opts.massScale || 1;
    try {
      for (const [key, bn, en, rad, parentKey, mass, jt, lim] of PARTS) {
        const bone = character.getBone(bn);
        if (!bone) continue;
        const a = bone.getWorldPosition(new THREE.Vector3());
        let end = character.getBone(en);
        let b;
        if (end) b = end.getWorldPosition(new THREE.Vector3());
        else if (key === 'head') { const nk = character.getBone('Neck'); const nb = nk ? nk.getWorldPosition(new THREE.Vector3()) : a.clone().addScaledVector(Y, -0.1); b = a.clone().add(a.clone().sub(nb).normalize().multiplyScalar(0.2)); }
        else continue;
        const dir = b.clone().sub(a); let len = dir.length(); if (len < 0.02) { len = 0.1; dir.set(0, 1, 0); } dir.normalize();
        const mid = a.clone().addScaledVector(dir, len * 0.5);
        const bq = frameQuat(dir, right);
        const lv = new THREE.Vector3(vel.x, vel.y, vel.z);
        const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(mid.x, mid.y, mid.z).setRotation({ x: bq.x, y: bq.y, z: bq.z, w: bq.w })
          .setLinvel(lv.x, lv.y, lv.z).setLinearDamping(0.08).setAngularDamping(key === 'pelvis' || key === 'chest' ? 0.9 : 1.4)
          .setCcdEnabled(false).setCanSleep(true);
        const body = world.createRigidBody(desc);
        const half = Math.max(0.02, len * 0.5 - rad * 0.55);
        const col = RAPIER.ColliderDesc.capsule(half, rad).setMass(mass * massScale).setFriction(0.85).setRestitution(0.02)
          .setCollisionGroups((RAG_GROUP << 16) | (0xffff & ~RAG_GROUP));
        world.createCollider(col, body);
        bone.matrixWorld.decompose(_p, _q2, _s);
        const inv = bq.clone().invert();
        const part = { key, bone, body, offQ: inv.clone().multiply(_q2), offP: _p.clone().sub(mid).applyQuaternion(inv), scale: _s.clone(), mass: mass * massScale, jt, lim, parent: null, rel0: null };
        if (parentKey && byKey[parentKey]) {
          const pa = byKey[parentKey]; part.parent = pa;
          const pt = pa.body.translation(), pr = pa.body.rotation();
          const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w); const pInv = pq.clone().invert();
          const a1 = a.clone().sub(new THREE.Vector3(pt.x, pt.y, pt.z)).applyQuaternion(pInv);
          const a2 = a.clone().sub(mid).applyQuaternion(inv);
          let jd;
          if (jt === 'knee' || jt === 'elbow') {
            // hinge about the body's local X (character's right axis, same for both frames)
            jd = RAPIER.JointData.revolute({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z }, { x: 1, y: 0, z: 0 });
            // which sign flexes the joint the anatomical way? test by rotating the child dir about the axis
            const axisW = new THREE.Vector3(1, 0, 0).applyQuaternion(bq);
            const test = dir.clone().applyAxisAngle(axisW, 0.3).sub(dir);
            const wantSign = jt === 'knee' ? -1 : 1; // knee: shin goes backwards (-fwd); elbow: forearm goes forwards (+fwd)
            const s = Math.sign(test.dot(fwd)) === wantSign ? HINGE_SIGN : -HINGE_SIGN;
            const flexMax = jt === 'knee' ? 2.45 : 2.5;
            jd.limitsEnabled = true;
            jd.limits = s > 0 ? [-0.06, flexMax] : [-flexMax, 0.06];
          } else {
            jd = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z });
          }
          const j = world.createImpulseJoint(jd, pa.body, body, true);
          try { j.setContactsEnabled(false); } catch (e) { /* ignore */ }
          part.rel0 = pInv.clone().multiply(bq);
        }
        parts.push(part); byKey[key] = part;
      }
    } catch (e) {
      console.warn('[ragdoll] build failed', e);
      for (const p of parts) { try { world.removeRigidBody(p.body); } catch (e2) { /* ignore */ } }
      return null;
    }
    if (parts.length < 5) { for (const p of parts) world.removeRigidBody(p.body); return null; }
    // spin + hit impulse at the struck point
    if (opts.spin && byKey.pelvis) byKey.pelvis.body.setAngvel({ x: (Math.random() - 0.5) * opts.spin, y: (Math.random() - 0.5) * opts.spin * 0.5, z: (Math.random() - 0.5) * opts.spin }, true);
    if (opts.hit && opts.hit.impulse) {
      let tgt = opts.hit.part && byKey[opts.hit.part];
      const pt = opts.hit.point;
      if (!tgt && pt) { let bd = Infinity; for (const p of parts) { const t = p.body.translation(); const d = (t.x - pt.x) ** 2 + (t.y - pt.y) ** 2 + (t.z - pt.z) ** 2; if (d < bd) { bd = d; tgt = p; } } }
      if (tgt) {
        const I = opts.hit.impulse;
        try { if (pt) tgt.body.applyImpulseAtPoint({ x: I.x, y: I.y, z: I.z }, { x: pt.x, y: pt.y, z: pt.z }, true); else tgt.body.applyImpulse({ x: I.x, y: I.y, z: I.z }, true); } catch (e) { /* ignore */ }
      }
    }
    const meshes = []; character.model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; meshes.push(o); } });
    const rd = { parts, byKey, meshes, age: 0, still: 0, frozen: false, character };
    active.push(rd);
    return rd;
  }

  // soft anatomical cone limits + joint friction (natural slump, no rubbery flailing)
  const _rel = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _dq = new THREE.Quaternion();
  function joints(rd, dt) {
    const k60 = Math.min(dt * 60, 2);
    for (const p of rd.parts) {
      const pa = p.parent; if (!pa) continue;
      const pr = pa.body.rotation(), cr = p.body.rotation();
      _pq.set(pr.x, pr.y, pr.z, pr.w); _cq.set(cr.x, cr.y, cr.z, cr.w);
      const wp = pa.body.angvel(), wc = p.body.angvel();
      // joint friction: pull the child's angular velocity toward the parent's (velocity space -> unconditionally stable)
      const f = (p.jt === 'cone' ? 0.12 : 0.08) * k60;
      _v.set(wc.x + (wp.x - wc.x) * f, wc.y + (wp.y - wc.y) * f, wc.z + (wp.z - wc.z) * f);
      if (p.jt === 'cone') {
        _rel.copy(_pq).invert().multiply(_cq);
        _dq.copy(_rel).multiply(_q2.copy(p.rel0).invert());
        if (_dq.w < 0) { _dq.x *= -1; _dq.y *= -1; _dq.z *= -1; _dq.w *= -1; }
        const ang = 2 * Math.acos(Math.min(1, _dq.w));
        if (ang > p.lim) {
          const sn = Math.sqrt(Math.max(1e-9, 1 - _dq.w * _dq.w));
          _v2.set(_dq.x / sn, _dq.y / sn, _dq.z / sn).applyQuaternion(_pq); // world axis of the excess rotation
          // remove relative angular velocity that drives further past the limit, then push back softly
          const relW = (_v.x - wp.x) * _v2.x + (_v.y - wp.y) * _v2.y + (_v.z - wp.z) * _v2.z;
          if (relW > 0) _v.addScaledVector(_v2, -relW);
          _v.addScaledVector(_v2, -Math.min(6, (ang - p.lim) * 10));
        }
      }
      if (Number.isFinite(_v.x + _v.y + _v.z)) p.body.setAngvel({ x: _v.x, y: _v.y, z: _v.z }, true);
    }
  }

  function drive(rd) {
    for (const p of rd.parts) {
      const t = p.body.translation(), r = p.body.rotation();
      q4(r);
      const wq = _q.clone().multiply(p.offQ);
      const wp = p.offP.clone().applyQuaternion(_q).add(_p.set(t.x, t.y, t.z));
      _m.compose(wp, wq, p.scale);
      _m2.copy(p.bone.parent.matrixWorld).invert().multiply(_m);
      _m2.decompose(p.bone.position, p.bone.quaternion, p.bone.scale);
      p.bone.updateMatrixWorld(true);
    }
  }

  function update(dt) {
    for (const rd of active.slice()) {
      rd.age += dt;
      joints(rd, dt);
      drive(rd);
      let maxV = 0;
      for (const p of rd.parts) { const v = p.body.linvel(); maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z)); }
      if (!Number.isFinite(maxV) || maxV > 60) { freeze(rd); continue; }
      rd.still = maxV < 0.1 ? rd.still + dt : 0;
      if (rd.still > 0.7 || rd.age > 10) { chestForward(rd); freeze(rd); }
    }
  }
  function pelvisPos(rd) { if (!rd || rd.frozen) return null; const p = rd.parts?.[0]; return p ? p.body.translation() : null; }
  // the chest body frame is X=right, Y=up the spine, Z=right x up = backwards -> body forward = local -Z
  function chestForward(rd) {
    const ch = rd?.byKey?.chest; if (!ch) return null;
    if (rd.frozen) return rd.lastChestFwd || null;
    const r = ch.body.rotation();
    return (rd.lastChestFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)));
  }
  // pose summary for get-up: pelvis + head world positions, lying face up?
  function poseInfo(rd) {
    if (!rd) return null;
    const pel = rd.byKey.pelvis, hd = rd.byKey.head || rd.byKey.chest;
    if (!pel || !hd) return null;
    const f = chestForward(rd);
    return { pelvis: pel.bone.getWorldPosition(new THREE.Vector3()), head: hd.bone.getWorldPosition(new THREE.Vector3()), faceUp: f ? f.y > 0 : true };
  }
  return { start, update, remove, freeze, pelvisPos, poseInfo, chestForward, active };
}
