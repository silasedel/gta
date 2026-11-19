// Wildlife kit: skeletons, skinning, IK and gait helpers. Animation is procedural (no clips): each frame a species
// controller poses the rig from its state. Bones are axis-aligned at rest, so rotations mean the same thing on every
// bone (right-hand rule about +X = animal's left, +Y = up, +Z = forward; applied yaw, then pitch, then roll):
//   rx > 0: a bone pointing forward (head, neck) pitches DOWN; a limb hanging down swings BACK; a tail (pointing back) lifts UP.
//   ry > 0: a bone pointing forward yaws to the animal's LEFT (+X); a tail swings to the animal's RIGHT.
//   rz > 0: rolls the left side UP (a left limb pointing out along +X lifts).

export function makeRig(THREE, spec) {
  // spec: [[name, parentName | null, [x, y, z] head position in model space], ...] parents listed before children
  const root = new THREE.Bone();
  root.name = 'root';
  const list = [root],
    bones = { root },
    restP = { root: new THREE.Vector3() },
    parentIx = [-1],
    ix = { root: 0 };
  for (const [name, parent, p] of spec) {
    const b = new THREE.Bone();
    b.name = name;
    const par = bones[parent || 'root'];
    if (!par) throw new Error(`rig: parent ${parent} of ${name} not defined yet`);
    restP[name] = new THREE.Vector3(...p);
    b.position.copy(restP[name]).sub(restP[parent || 'root']);
    par.add(b);
    ix[name] = list.length;
    list.push(b);
    bones[name] = b;
    parentIx.push(ix[parent || 'root']);
  }
  const restLocal = list.map((b) => b.position.clone());
  const armQ = list.map(() => new THREE.Quaternion()),
    armP = list.map(() => new THREE.Vector3());
  const _e = new THREE.Euler(),
    _q = new THREE.Quaternion(),
    _q2 = new THREE.Quaternion(),
    _v = new THREE.Vector3(),
    _v2 = new THREE.Vector3(),
    _v3 = new THREE.Vector3(),
    _v4 = new THREE.Vector3(),
    _v5 = new THREE.Vector3();
  const rig = {
    root,
    list,
    bones,
    ix,
    restP,
    parentIx,
    skeleton: new THREE.Skeleton(list),
    // rotation relative to rest, Euler XYZ radians
    set(name, rx = 0, ry = 0, rz = 0) {
      const b = bones[name];
      if (b) b.quaternion.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
      return rig;
    },
    // add a rotation on top of what is already set this frame
    add(name, rx = 0, ry = 0, rz = 0) {
      const b = bones[name];
      if (b) b.quaternion.multiply(_q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')));
      return rig;
    },
    // translate from rest (meters, parent space): body bob, jaw slide, sinking hips
    move(name, dx = 0, dy = 0, dz = 0) {
      const i = ix[name];
      if (i !== undefined)
        list[i].position.set(restLocal[i].x + dx, restLocal[i].y + dy, restLocal[i].z + dz);
      return rig;
    },
    reset() {
      for (let i = 0; i < list.length; i++) {
        list[i].quaternion.identity();
        list[i].position.copy(restLocal[i]);
      }
      return rig;
    },
    // armature-space forward kinematics (call after posing the spine and before IK; ikLeg keeps it current for its bones)
    fk() {
      for (let i = 0; i < list.length; i++) {
        const p = parentIx[i];
        if (p < 0) {
          armQ[i].copy(list[i].quaternion);
          armP[i].copy(list[i].position);
        } else {
          armQ[i].multiplyQuaternions(armQ[p], list[i].quaternion);
          armP[i].copy(list[i].position).applyQuaternion(armQ[p]).add(armP[p]);
        }
      }
      return rig;
    },
    posOf(name, out) {
      return out.copy(armP[ix[name]]);
    }, // armature-space head position (after fk)
    quatOf(name, out) {
      return out.copy(armQ[ix[name]]);
    },
    // set a bone's armature-space orientation (e.g. keep a paw flat or a head level). Needs fk() for its parent.
    setArmQ(name, q) {
      const i = ix[name],
        p = parentIx[i];
      list[i].quaternion.copy(_q.copy(armQ[p]).invert()).multiply(q);
      armQ[i].copy(q);
      return rig;
    },
    // Two-bone IK. `upper` and `lower` are bone names; `end` is the bone (or [x,y,z] rest-space tail of `lower`) that
    // should reach `target` (armature space). `pole` (armature-space direction) is where the middle joint points:
    // forward (0,0,1) for knees/stifles and wrists, backward (0,0,-1) for elbows and hocks, outward for sprawled lizards.
    // Returns the reach ratio (>1 means the target was out of reach and the leg is fully stretched).
    ikLeg(upper, lower, end, target, pole) {
      const iu = ix[upper],
        il = ix[lower],
        ip = parentIx[iu];
      const a = restLocal[il],
        b = Array.isArray(end)
          ? _v5.set(end[0], end[1], end[2]).sub(restP[lower])
          : restLocal[ix[end]];
      const l1 = a.length(),
        l2 = b.length();
      const pq = _q.copy(armQ[ip]).invert();
      const h = list[iu].position,
        d = _v.copy(target).sub(armP[ip]).applyQuaternion(pq).sub(h);
      const want = d.length(),
        dist = Math.min(Math.max(want, Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9995);
      d.multiplyScalar(1 / (want || 1));
      const cosA = Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))),
        sinA = Math.sqrt(1 - cosA * cosA);
      const pl = _v2.copy(pole).applyQuaternion(pq);
      pl.addScaledVector(d, -pl.dot(d));
      if (pl.lengthSq() < 1e-8) pl.set(0, 0, 1).addScaledVector(d, -d.z);
      pl.normalize();
      const ud = _v3.copy(d).multiplyScalar(cosA).addScaledVector(pl, sinA); // upper bone direction (parent space)
      const ld = _v4.copy(d).multiplyScalar(dist).addScaledVector(ud, -l1).normalize(); // lower bone direction (parent space)
      const U = list[iu],
        L = list[il];
      U.quaternion.setFromUnitVectors(_v.copy(a).normalize(), ud);
      ld.applyQuaternion(_q2.copy(U.quaternion).invert());
      L.quaternion.setFromUnitVectors(_v.copy(b).normalize(), ld);
      armQ[iu].multiplyQuaternions(armQ[ip], U.quaternion);
      armP[iu].copy(U.position).applyQuaternion(armQ[ip]).add(armP[ip]);
      armQ[il].multiplyQuaternions(armQ[iu], L.quaternion);
      armP[il].copy(L.position).applyQuaternion(armQ[iu]).add(armP[iu]);
      if (!Array.isArray(end)) {
        const ie = ix[end];
        armQ[ie].multiplyQuaternions(armQ[il], list[ie].quaternion);
        armP[ie].copy(list[ie].position).applyQuaternion(armQ[il]).add(armP[il]);
      }
      return want / (l1 + l2);
    },
  };
  return rig;
}

// ---- skin weights -------------------------------------------------------------------------------------------------
function ensureSkin(THREE, geo) {
  const n = geo.attributes.position.count;
  if (!geo.attributes.skinIndex) {
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(n * 4), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  }
  return n;
}
// every vertex follows one bone (eyes, beaks, claws, shells)
export function bindRigid(THREE, geo, rig, name) {
  const n = ensureSkin(THREE, geo),
    si = geo.attributes.skinIndex,
    sw = geo.attributes.skinWeight,
    b = rig.ix[name];
  if (b === undefined) throw new Error('bindRigid: no bone ' + name);
  for (let i = 0; i < n; i++) {
    si.setXYZW(i, b, 0, 0, 0);
    sw.setXYZW(i, 1, 0, 0, 0);
  }
  return geo;
}
// Bind a part to a chain of bones (spine + neck + head, tail segments, shoulder-elbow-wrist, hip-knee-ankle).
// chain: bone names from the part's start to its end. Each bone owns the stretch from its head to the next bone's head
// (the last one to `tail`, default: far away along the chain). Joints blend over `blend` (fraction of the segment).
// parent/parentBlend: blend the first stretch into a parent bone (a leg into the hips) so the root does not tear.
// Lofted parts are bound by their `along` parameter (robust for curved bodies); other geometry by nearest segment.
export function bindChain(
  THREE,
  geo,
  rig,
  chain,
  { blend = 0.35, parent = null, parentBlend = 0.3, tail = null, by = null } = {},
) {
  const n = ensureSkin(THREE, geo),
    P = geo.attributes.position,
    si = geo.attributes.skinIndex,
    sw = geo.attributes.skinWeight;
  const J = chain.map((nm) => {
    if (rig.ix[nm] === undefined) throw new Error('bindChain: no bone ' + nm);
    return rig.restP[nm];
  });
  const B = chain.map((nm) => rig.ix[nm]),
    last = chain.length - 1;
  const path = geo.userData.path,
    useAlong = (by || (path ? 'along' : 'pos')) === 'along' && path;
  let at = null;
  if (useAlong) {
    // along-parameter of each joint = nearest path ring to the bone head; forced monotonic
    at = J.map((j) => {
      let best = 0,
        bd = 1e9;
      for (const r of path) {
        const d = (r.p[0] - j.x) ** 2 + (r.p[1] - j.y) ** 2 + (r.p[2] - j.z) ** 2;
        if (d < bd) {
          bd = d;
          best = r.along;
        }
      }
      return best;
    });
    if (at[last] < at[0]) {
      at = null;
    } else {
      for (let i = 1; i <= last; i++) at[i] = Math.max(at[i], at[i - 1] + 1e-4);
      at.push(Math.max(1.0001, at[last] + 1e-4));
      at[0] = Math.min(at[0], 0);
    }
  }
  const tl = tail ? { x: tail[0], y: tail[1], z: tail[2] } : null;
  const pb = parent ? rig.ix[parent] : -1,
    al = geo.attributes.along;
  for (let v = 0; v < n; v++) {
    let seg = 0,
      s = 0;
    if (at) {
      const u = al.getX(v);
      seg = last;
      for (let i = 0; i < last; i++)
        if (u < at[i + 1]) {
          seg = i;
          break;
        }
      s = (u - at[seg]) / (at[seg + 1] - at[seg]);
    } else {
      const x = P.getX(v),
        y = P.getY(v),
        z = P.getZ(v);
      let bd = 1e18;
      for (let i = 0; i <= last; i++) {
        const a = J[i],
          b =
            i < last
              ? J[i + 1]
              : tl || {
                  x: a.x + (a.x - J[Math.max(0, i - 1)].x) * 4 || a.x,
                  y: a.y + (a.y - J[Math.max(0, i - 1)].y) * 4,
                  z: a.z + (a.z - J[Math.max(0, i - 1)].z) * 4,
                };
        const ex = b.x - a.x,
          ey = b.y - a.y,
          ez = b.z - a.z,
          L2 = ex * ex + ey * ey + ez * ez || 1e-9;
        const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / L2));
        const d = (x - a.x - ex * t) ** 2 + (y - a.y - ey * t) ** 2 + (z - a.z - ez * t) ** 2;
        if (d < bd - 1e-12) {
          bd = d;
          seg = i;
          s = t;
        }
      }
    }
    s = Math.min(1, Math.max(0, s));
    let b0 = B[seg],
      w0 = 1,
      b1 = 0,
      w1 = 0;
    if (s < blend && seg > 0) {
      b1 = B[seg - 1];
      const k = 1 - s / blend;
      w1 = 0.5 * k * k * (3 - 2 * k);
    } else if (s < parentBlend && seg === 0 && pb >= 0) {
      b1 = pb;
      const k = 1 - s / parentBlend;
      w1 = k * k * (3 - 2 * k) * 0.85;
    } else if (s > 1 - blend && seg < last) {
      b1 = B[seg + 1];
      const k = 1 - (1 - s) / blend;
      w1 = 0.5 * k * k * (3 - 2 * k);
    }
    w0 = 1 - w1;
    si.setXYZW(v, b0, b1, 0, 0);
    sw.setXYZW(v, w0, w1, 0, 0);
  }
  return geo;
}

// Assemble the skinned mesh: returns { mesh, group } where group holds mesh + skeleton root.
export function skinMesh(THREE, geo, material, rig, { shadow = true, cullPad = 1.8 } = {}) {
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(rig.root);
  mesh.bind(rig.skeleton);
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  geo.boundingSphere.radius *= cullPad;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  // SkinnedMesh.computeBoundingSphere walks every vertex each time it is called; the padded bind-pose sphere is enough here
  mesh.boundingSphere = geo.boundingSphere.clone();
  mesh.computeBoundingSphere = () => {};
  return mesh;
}

// ---- gait ---------------------------------------------------------------------------------------------------------
// Foot trajectory in a gait cycle. phase 0..1. Stance for `duty` of the cycle (foot planted, sliding from front to back
// under the body), then swing forward with a lift. Returns { x: +1 front ... -1 back, lift: 0..1, stance: bool }.
export function gaitFoot(phase, duty = 0.6) {
  phase -= Math.floor(phase);
  if (phase < duty) return { x: 1 - 2 * (phase / duty), lift: 0, stance: true };
  const t = (phase - duty) / (1 - duty),
    e = t * t * (3 - 2 * t);
  return { x: -1 + 2 * e, lift: Math.sin(Math.PI * t) ** 0.8, stance: false };
}
// phase offsets [leftHind, leftFore, rightHind, rightFore] and duty per gait
export const GAITS = {
  walk: { off: [0, 0.25, 0.5, 0.75], duty: 0.68 }, // lateral-sequence walk (dogs, cats, deer, raccoons)
  amble: { off: [0, 0.12, 0.5, 0.62], duty: 0.6 },
  trot: { off: [0, 0.5, 0.5, 0], duty: 0.5 }, // diagonal pairs
  sprawl: { off: [0, 0.5, 0.5, 0], duty: 0.6 }, // lizards and gators: diagonal pairs with body undulation
  gallop: { off: [0, 0.55, 0.12, 0.67], duty: 0.32 }, // rotary gallop with a suspension phase
  bound: { off: [0, 0.5, 0.04, 0.54], duty: 0.3 }, // hind pair then fore pair (deer stot, running cat)
  hop: { off: [0, 0, 0.5, 0.5], duty: 0.5 }, // birds walking: only the first and third are used
};

// critically-damped-ish spring for secondary motion (tails, ears, dewlaps, necks)
export class Spring {
  constructor(k = 60, d = 10, x = 0) {
    this.k = k;
    this.d = d;
    this.x = x;
    this.v = 0;
  }
  step(target, dt) {
    dt = Math.min(dt, 0.05);
    this.v += ((target - this.x) * this.k - this.v * this.d) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const dampAngle = (cur, target, rate, dt) => {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * (1 - Math.exp(-rate * dt));
};

// Bind a lofted body (or a crest made from it) to spine bones by its `along` parameter. Order does not matter: list
// every bone the part follows, e.g. ['head', 'neck', 'chest', 'spine', 'hips', 'tail1', 'tail2', 'tail3'] where hips
// is the root with the spine running forward and the tail running back. Each stretch between two neighboring joints
// belongs to whichever of the two bones is the ancestor of the other (a bone reaches from its own joint to its
// child's); the ends of the part belong to the outermost bones. Weights blend smoothly across every joint.
export function bindSpine(THREE, geo, rig, names, { blend = 0.5 } = {}) {
  const path = geo.userData.path;
  if (!path) throw new Error('bindSpine: geometry has no loft path');
  const n = ensureSkin(THREE, geo),
    si = geo.attributes.skinIndex,
    sw = geo.attributes.skinWeight,
    al = geo.attributes.along;
  const isAnc = (a, b) => {
    for (let i = rig.parentIx[b]; i >= 0; i = rig.parentIx[i]) if (i === a) return true;
    return false;
  };
  const J = names
    .map((nm) => {
      const b = rig.ix[nm];
      if (b === undefined) throw new Error('bindSpine: no bone ' + nm);
      const j = rig.restP[nm];
      let best = 0,
        bd = 1e9;
      for (const r of path) {
        const d = (r.p[0] - j.x) ** 2 + (r.p[1] - j.y) ** 2 + (r.p[2] - j.z) ** 2;
        if (d < bd) {
          bd = d;
          best = r.along;
        }
      }
      return { b, u: best };
    })
    .sort((a, b) => a.u - b.u);
  // owners[i] owns the stretch between joint i-1 and joint i (owners[0]: start..J[0], owners[J.length]: J[last]..end)
  const owners = [J[0].b];
  for (let i = 1; i < J.length; i++) owners.push(isAnc(J[i - 1].b, J[i].b) ? J[i - 1].b : J[i].b);
  owners.push(J[J.length - 1].b);
  const lo = (i) => (i === 0 ? Math.min(0, J[0].u - 0.05) : J[i - 1].u),
    hi = (i) => (i === J.length ? Math.max(1, J[J.length - 1].u + 0.05) : J[i].u);
  for (let v = 0; v < n; v++) {
    const u = al.getX(v);
    let k = 0;
    while (k < J.length && u >= J[k].u) k++; // stretch index
    let b0 = owners[k],
      b1 = b0,
      w1 = 0;
    const len = hi(k) - lo(k) || 1e-6;
    const dl = k > 0 ? (u - lo(k)) / (Math.min(len, hi(k - 1) - lo(k - 1) || len) * blend) : 2,
      dr = k < J.length ? (hi(k) - u) / (Math.min(len, hi(k + 1) - lo(k + 1) || len) * blend) : 2;
    if (dl < 1 && dl <= dr) {
      b1 = owners[k - 1];
      const q = 1 - dl;
      w1 = 0.5 * q * q * (3 - 2 * q);
    } else if (dr < 1) {
      b1 = owners[k + 1];
      const q = 1 - dr;
      w1 = 0.5 * q * q * (3 - 2 * q);
    }
    if (b1 === b0) w1 = 0;
    si.setXYZW(v, b0, b1, 0, 0);
    sw.setXYZW(v, 1 - w1, w1, 0, 0);
  }
  return geo;
}
