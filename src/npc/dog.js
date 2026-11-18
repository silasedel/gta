// r4-library (Nov 18): walked dogs use the user's rigged Doberman (Models/Animals/Dog 1 -> public/assets/models/animals/
// dog_doberman.glb, built by tools/v2/animals/build_dogs.py; coat variants by tools/v2/animals/dog_variants.py).
// The source has no animation, so the walk / trot / idle here is procedural on its quadruped bones.
// createLibDog() returns null until the file has loaded (or when it is missing): peds.js then builds its old code dog.
// ?libdog=0 = the old code-built dog.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = '/assets/models/animals/';
const OFF = typeof location !== 'undefined' && /[?&]libdog=0/.test(location.search);
let tpl = null, mats = null, started = false;
export const libDogReady = () => !!tpl;
export function preloadDog() {
  if (started || OFF) return; started = true;
  new GLTFLoader().loadAsync(BASE + 'dog_doberman.glb').then((g) => {
    let base = null;
    g.scene.traverse((o) => { if (o.isSkinnedMesh) { base = o.material; o.castShadow = true; o.receiveShadow = true; } });
    if (!base) throw new Error('no skinned mesh');
    if (base.map) base.map.anisotropy = 4;
    mats = [base];
    const tl = new THREE.TextureLoader();
    for (const v of ['red', 'blue']) {
      const m = base.clone(); mats.push(m);
      tl.load(BASE + 'dog_doberman_' + v + '.jpg', (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; m.map = t; m.needsUpdate = true; }, undefined, () => { m.map = base.map; });
    }
    tpl = g.scene;
  }).catch((e) => console.warn('[dog] library dog missing, code dog used', e?.message));
}

// bone names as GLTFLoader sanitizes them ("front_thigh.L" -> "front_thighL")
const LEGS = [ // [upper, lower, foot, phase offset (lateral-sequence walk), hind?]
  ['thighL', 'shinL', 'footL', 0.0, true], ['front_thighL', 'front_shinL', 'front_footL', 0.25, false],
  ['thighR', 'shinR', 'footR', 0.5, true], ['front_thighR', 'front_shinR', 'front_footR', 0.75, false],
];
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _a = new THREE.Vector3();

export function createLibDog(scene, rnd = Math.random) {
  if (!tpl) return null;
  const root = SkeletonUtils.clone(tpl);
  const g = new THREE.Group(); g.add(root);
  const s = 0.9 + rnd() * 0.18; root.scale.setScalar(s);
  const coat = mats[rnd() < 0.55 ? 0 : rnd() < 0.6 ? 1 : 2];
  root.traverse((o) => { if (o.isSkinnedMesh) { o.material = coat; o.castShadow = true; o.receiveShadow = true; } });
  root.updateMatrixWorld(true);
  const rootQi = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name.replace(/\./g, '')] = o; });
  // per bone: rest local rotation + the dog's side (X) and up (Y) axes expressed in that bone's frame
  const J = (n) => {
    const b = bones[n]; if (!b) return null;
    const qw = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootQi).invert();
    return { b, rest: b.quaternion.clone(), x: X.clone().applyQuaternion(qw), y: Y.clone().applyQuaternion(qw) };
  };
  const legs = LEGS.map(([u, l, f, off, hind]) => ({ u: J(u), l: J(l), f: J(f), off, hind }));
  const neck = J('spine011'), head = J('spine012'), chest = J('spine008'), hips = J('spine005');
  const all = [...legs.flatMap((L) => [L.u, L.l, L.f]), neck, head, chest, hips].filter(Boolean);
  const set = (j, ax, ay = 0) => {
    if (!j) return;
    j.b.quaternion.copy(j.rest);
    if (ax) j.b.quaternion.multiply(_q.setFromAxisAngle(j.x, ax));
    if (ay) j.b.quaternion.multiply(_q.setFromAxisAngle(j.y, ay));
  };
  scene.add(g);
  const st = { phase: rnd() * 6.28, amp: 0, v: 0, t: rnd() * 100, look: 0, lookT: 0, lookTo: 0, sniff: 0 };
  return {
    g, scale: s, ok: all.length >= 14,
    // sp = ground speed (m/s), dt seconds; positive X rotation swings a leg's tip backward
    pose(dt, sp) {
      st.t += dt; st.v += (sp - st.v) * Math.min(1, dt * 5);
      const v = st.v, moving = Math.min(1, v / 0.35);
      st.amp += (moving - st.amp) * Math.min(1, dt * 6);
      const trot = Math.min(1, Math.max(0, (v - 1.7) / 0.8));
      const stride = 0.62 * s * (1 + trot * 0.5);
      st.phase += dt * (v / stride) * Math.PI * 2;
      const A = st.amp;
      for (const L of legs) {
        const off = L.hind ? L.off : L.off + 0.25 * trot; // trot: diagonal pairs move together
        const ph = st.phase + off * Math.PI * 2, sw = Math.sin(ph), lift = Math.max(0, -Math.cos(ph));
        const reach = (L.hind ? 0.34 : 0.4) * (1 + trot * 0.35);
        if (L.hind) { set(L.u, A * (sw * reach - lift * 0.18)); set(L.l, A * lift * 0.55); set(L.f, -A * lift * 0.5); }
        else { set(L.u, A * (sw * reach - lift * 0.22)); set(L.l, -A * lift * 0.25); set(L.f, A * lift * 1.1); }
      }
      // idle: breathing, slow look-around, now and then a sniff at the ground
      if (st.t > st.lookT) { st.lookT = st.t + 1.5 + rnd() * 3; st.lookTo = (rnd() - 0.5) * 0.9; st.sniff = rnd() < 0.3 ? 1 : 0; }
      const idle = 1 - A;
      st.look += (st.lookTo * idle - st.look) * Math.min(1, dt * 2.5);
      const breathe = Math.sin(st.t * 3.1) * 0.012 * idle;
      const bob = Math.sin(st.phase * 2) * 0.05 * A;
      set(chest, breathe);
      set(hips, -Math.sin(st.phase * 2 + 0.6) * 0.03 * A);
      set(neck, bob + st.sniff * idle * 0.45, st.look * 0.6);
      set(head, -bob * 0.6 + st.sniff * idle * 0.25, st.look * 0.4);
      root.position.y = Math.abs(Math.sin(st.phase)) * 0.012 * A * s;
    },
    collar(out) { return neck ? neck.b.getWorldPosition(out) : out.copy(g.position).setY(g.position.y + 0.5 * s); },
    dispose() { scene.remove(g); root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton?.dispose?.(); }); },
  };
}
