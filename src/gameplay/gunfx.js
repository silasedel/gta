// Weapon FX owned by gameplay: pooled ejected casings with bounce physics, gun-mounted muzzle flashes per class.
import * as THREE from 'three';
import { groundAt, sfx } from './util.js';

function starTex(points, inner, soft) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,220,140,0.95)'); gr.addColorStop(0.55, 'rgba(255,140,40,0.45)'); gr.addColorStop(1, 'rgba(255,90,10,0)');
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < points * 2; i++) { const a = (i / (points * 2)) * Math.PI * 2, r = i % 2 ? 64 * inner : 64; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  if (soft) { g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 34, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sideTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,110,0.85)'); gr.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 6); g.quadraticCurveTo(64, 0, 128, 16); g.quadraticCurveTo(64, 32, 0, 26); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const FLASH = {
  pistol: { front: 0.16, side: 0.18, tex: 'star5', light: 2.5 },
  revolver: { front: 0.26, side: 0.24, tex: 'star6', light: 4, gap: true },
  rifle: { front: 0.22, side: 0.34, tex: 'star3', light: 3.2 },
  shotgun: { front: 0.34, side: 0.42, tex: 'soft', light: 5 },
  suppressed: { front: 0.05, side: 0.06, tex: 'soft', light: 0.4 },
};

export function createGunFX(game) {
  const { scene } = game;
  const T = { star5: starTex(5, 0.42, false), star6: starTex(6, 0.35, true), star3: starTex(3, 0.22, false), soft: starTex(8, 0.6, true), side: sideTex() };
  const mat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const MATS = { star5: mat(T.star5), star6: mat(T.star6), star3: mat(T.star3), soft: mat(T.soft), side: mat(T.side) };
  const plane = new THREE.PlaneGeometry(1, 1);
  const sidePlane = new THREE.PlaneGeometry(1, 0.28).translate(0.5, 0, 0);

  // flash rig is re-parented onto whichever gun fires
  const rig = new THREE.Group(); rig.visible = false;
  const front = new THREE.Mesh(plane, MATS.star5); front.renderOrder = 10;
  const s1 = new THREE.Mesh(sidePlane, MATS.side); s1.rotation.y = -Math.PI / 2; s1.renderOrder = 10;
  const s2 = s1.clone(); s2.rotation.set(Math.PI / 2, -Math.PI / 2, 0, 'YXZ');
  const gapL = new THREE.Mesh(plane, MATS.soft), gapR = gapL.clone();
  rig.add(front, s1, s2, gapL, gapR);
  const light = new THREE.PointLight(0xffb060, 0, 9, 2); rig.add(light);
  let flashT = 0;
  function flash(model, kind = 'pistol') {
    const f = FLASH[kind] || FLASH.pistol;
    if (!model) return;
    if (rig.parent !== model) model.add(rig);
    const m = model.userData.muzzle || new THREE.Vector3(0, 0, 0.2);
    rig.position.copy(m);
    const j = 0.75 + Math.random() * 0.5;
    front.material = MATS[f.tex]; front.scale.setScalar(f.front * j); front.rotation.z = Math.random() * Math.PI * 2;
    s1.scale.set(f.side * j, f.side * j * 0.9, 1); s2.scale.copy(s1.scale);
    s1.visible = s2.visible = kind !== 'suppressed' || Math.random() < 0.4;
    gapL.visible = gapR.visible = !!f.gap;
    if (f.gap) { gapL.position.set(0.035, 0, -m.z + 0.06); gapR.position.set(-0.035, 0, -m.z + 0.06); gapL.scale.setScalar(0.08); gapR.scale.setScalar(0.08); gapL.rotation.y = Math.PI / 2; gapR.rotation.y = -Math.PI / 2; }
    light.intensity = f.light * (0.8 + Math.random() * 0.4);
    rig.visible = true; flashT = 0.045 + Math.random() * 0.02;
  }

  // ---------------- casings
  const CAS = {
    pistol: { geo: new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 10), mat: new THREE.MeshStandardMaterial({ color: 0xc9a14f, metalness: 1, roughness: 0.28 }), n: 40 },
    rifle: { geo: new THREE.CylinderGeometry(0.0048, 0.0058, 0.045, 10), mat: new THREE.MeshStandardMaterial({ color: 0xc9a14f, metalness: 1, roughness: 0.28 }), n: 60 },
    shell: { geo: new THREE.CylinderGeometry(0.0105, 0.0105, 0.066, 12), mat: new THREE.MeshStandardMaterial({ color: 0xb2241c, roughness: 0.5 }), n: 24 },
  };
  for (const k in CAS) {
    const c = CAS[k];
    c.mesh = new THREE.InstancedMesh(c.geo, c.mat, c.n); c.mesh.castShadow = true; c.mesh.frustumCulled = false;
    c.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    c.items = []; for (let i = 0; i < c.n; i++) { c.items.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), life: 0, floor: 0, bounces: 0 }); }
    c.next = 0; c.mesh.count = c.n;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < c.n; i++) c.mesh.setMatrixAt(i, zero);
    scene.add(c.mesh);
  }
  const _m = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _e = new THREE.Euler(), _one = new THREE.Vector3(1, 1, 1);
  function eject(type, pos, vel) {
    const c = CAS[type] || CAS.pistol;
    const it = c.items[c.next]; c.next = (c.next + 1) % c.n;
    it.alive = true; it.p.copy(pos); it.v.copy(vel); it.life = 7; it.bounces = 0;
    it.q.setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    it.w.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 40);
    it.floor = groundAt(game, pos.x, pos.z, pos.y + 0.5);
    if (!(it.floor > -100)) it.floor = pos.y - 1.4;
    it.type = type;
  }
  function update(dt) {
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) { rig.visible = false; light.intensity = 0; } }
    for (const k in CAS) {
      const c = CAS[k]; let any = false;
      for (let i = 0; i < c.n; i++) {
        const it = c.items[i]; if (!it.alive) continue;
        any = true;
        it.life -= dt;
        if (it.life <= 0) { it.alive = false; c.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
        if (it.bounces < 4) {
          it.v.y -= 9.81 * dt;
          it.p.addScaledVector(it.v, dt);
          const r = k === 'shell' ? 0.0105 : 0.005;
          if (it.p.y < it.floor + r) {
            it.p.y = it.floor + r;
            if (it.v.y < -0.4) {
              if (it.bounces === 0 && it.p.distanceToSquared(game.camera.position) < 400) sfx(game, k === 'shell' ? 'shell_drop' : 'casing', it.p, 0.35);
              it.v.y = -it.v.y * 0.38; it.v.x *= 0.55; it.v.z *= 0.55; it.w.multiplyScalar(0.5); it.bounces++;
            } else { it.v.set(0, 0, 0); it.bounces = 4; }
            if (it.bounces >= 4) { // settle lying on its side
              _e.setFromQuaternion(it.q); it.q.setFromEuler(_e.set(Math.PI / 2, _e.y, 0));
            }
          }
          if (it.bounces < 4) { _dq.setFromEuler(_e.set(it.w.x * dt, it.w.y * dt, it.w.z * dt)); it.q.multiply(_dq); }
        }
        const s = it.life < 1 ? it.life : 1;
        c.mesh.setMatrixAt(i, _m.compose(it.p, it.q, _one.set(s, s, s)));
      }
      if (any || c.dirty) { c.mesh.instanceMatrix.needsUpdate = true; c.dirty = any; }
    }
  }
  return { flash, eject, update };
}
