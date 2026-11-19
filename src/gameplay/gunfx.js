// Combat FX (COMBAT track): gun-mounted muzzle flashes and smoke, moving tracers, ejected casings that bounce, land
// and roll, dropped magazines, per-surface bullet impacts (decal + chips + dust / sparks / splinters / spray / blood),
// explosions with a shockwave ring and scorch mark, flames. Everything is pooled: 1 draw call for decals, 1 for chips,
// 2 for particles, 1 for tracers, 1 per casing type.
import * as THREE from 'three';
import { groundAt, sfx } from './util.js';
import { MATERIALS } from './combat/shared.js';

const rnd = (a, b) => a + Math.random() * (b - a);
function cnv(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function starTex(points, inner, soft) {
  const c = cnv(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(0.2, 'rgba(255,220,140,0.95)');
    gr.addColorStop(0.55, 'rgba(255,140,40,0.45)');
    gr.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2,
        r = i % 2 ? 64 * inner : 64;
      g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    if (soft) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = gr;
      g.beginPath();
      g.arc(64, 64, 34, 0, 6.3);
      g.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function sideTex() {
  const c = cnv(128, 32, (g) => {
    const gr = g.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, 'rgba(255,250,220,1)');
    gr.addColorStop(0.3, 'rgba(255,200,110,0.85)');
    gr.addColorStop(1, 'rgba(255,100,20,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 6);
    g.quadraticCurveTo(64, 0, 128, 16);
    g.quadraticCurveTo(64, 32, 0, 26);
    g.closePath();
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// particle sprite atlas (2x2): soft disc, billowy smoke, droplet, hard chip
function particleAtlas() {
  const c = cnv(256, 256, (g) => {
    let gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      const x = 192 + rnd(-30, 30),
        y = 64 + rnd(-30, 30),
        r = rnd(14, 30);
      gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.33)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    gr = g.createRadialGradient(64, 200, 0, 64, 192, 40);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(64, 192, 26, 44, 0, 0, 6.3);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(160, 160);
    g.lineTo(224, 172);
    g.lineTo(214, 226);
    g.lineTo(170, 214);
    g.closePath();
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  return t;
}
// decal atlas (4x2 cells of 256): concrete crater, wood hole, glass hole, metal hole, plastic hole, dirt pock, blood, scorch
const DECAL_CELL = {
  concrete: 0,
  wood: 1,
  glass: 2,
  metal: 3,
  plastic: 4,
  dirt: 5,
  sand: 5,
  blood: 6,
  scorch: 7,
};
function decalAtlas() {
  const c = cnv(1024, 512, (g) => {
    const cell = (i, fn) => {
      g.save();
      g.translate((i % 4) * 256 + 128, Math.floor(i / 4) * 256 + 128);
      fn();
      g.restore();
    };
    const blob = (r, col) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, r, 0, 6.3);
      g.fill();
    };
    cell(0, () => {
      // concrete: pale chipped crater, dark core, short cracks
      g.fillStyle = 'rgba(215,210,198,0.9)';
      g.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * 6.283,
          r = rnd(46, 84);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(150,146,136,0.9)';
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * 6.283,
          r = rnd(26, 46);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      blob(26, 'rgba(18,16,14,0.98)');
      g.strokeStyle = 'rgba(40,38,34,0.75)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = rnd(0, 6.3);
        g.beginPath();
        g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
        g.lineTo(
          Math.cos(a + rnd(-0.2, 0.2)) * rnd(70, 118),
          Math.sin(a + rnd(-0.2, 0.2)) * rnd(70, 118),
        );
        g.stroke();
      }
    });
    cell(1, () => {
      // wood: torn hole with pale splinters along the grain
      g.fillStyle = 'rgba(214,180,128,0.92)';
      for (let i = 0; i < 14; i++) {
        const y = rnd(-26, 26),
          l = rnd(30, 110),
          s = Math.random() < 0.5 ? -1 : 1;
        g.beginPath();
        g.moveTo(0, y - 4);
        g.lineTo(s * l, y + rnd(-3, 3));
        g.lineTo(0, y + 4);
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(20,12,6,0.98)';
      g.beginPath();
      g.ellipse(0, 0, 26, 20, 0, 0, 6.3);
      g.fill();
      g.strokeStyle = 'rgba(60,36,16,0.7)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const y = rnd(-18, 18);
        g.beginPath();
        g.moveTo(-rnd(30, 100), y);
        g.lineTo(rnd(30, 100), y + rnd(-3, 3));
        g.stroke();
      }
    });
    cell(2, () => {
      // glass: small hole, white crush ring, radial + concentric cracks
      g.strokeStyle = 'rgba(235,245,250,0.85)';
      g.lineWidth = 1.6;
      const rays = [];
      for (let i = 0; i < 13; i++) {
        const a = (i / 13) * 6.283 + rnd(-0.15, 0.15),
          r = rnd(60, 124);
        rays.push([a, r]);
        g.beginPath();
        g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
        g.lineTo(Math.cos(a + rnd(-0.05, 0.05)) * r * 0.6, Math.sin(a) * r * 0.6);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        g.stroke();
      }
      for (const rr of [30, 54, 84])
        for (let i = 0; i < rays.length; i++) {
          const [a0, r0] = rays[i],
            [a1, r1] = rays[(i + 1) % rays.length];
          if (r0 < rr || r1 < rr || Math.random() < 0.3) continue;
          g.beginPath();
          g.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
          g.lineTo(Math.cos(a1) * (rr + rnd(-6, 6)), Math.sin(a1) * (rr + rnd(-6, 6)));
          g.stroke();
        }
      blob(24, 'rgba(240,248,252,0.9)');
      g.fillStyle = 'rgba(8,10,12,0.96)';
      g.beginPath();
      for (let i = 0; i <= 9; i++) {
        const a = (i / 9) * 6.283,
          r = rnd(8, 13);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.fill();
    });
    cell(3, () => {
      blob(64, 'rgba(30,30,32,0.5)');
      g.fillStyle = 'rgba(205,208,214,0.95)';
      g.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * 6.283,
          r = rnd(24, 34);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.fill();
      g.fillStyle = 'rgba(6,6,7,1)';
      g.beginPath();
      g.arc(0, 0, 17, 0, 6.3);
      g.fill();
      g.strokeStyle = 'rgba(250,250,255,0.8)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 20, 3.6, 5.6);
      g.stroke();
    });
    cell(4, () => {
      blob(50, 'rgba(250,250,250,0.35)');
      g.fillStyle = 'rgba(10,10,10,0.97)';
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * 6.283,
          r = rnd(15, 22);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.fill();
      g.strokeStyle = 'rgba(20,20,20,0.7)';
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = rnd(0, 6.3);
        g.beginPath();
        g.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
        g.lineTo(Math.cos(a) * rnd(40, 70), Math.sin(a) * rnd(40, 70));
        g.stroke();
      }
    });
    cell(5, () => {
      blob(90, 'rgba(40,30,20,0.55)');
      blob(40, 'rgba(25,18,12,0.8)');
      for (let i = 0; i < 30; i++) {
        const a = rnd(0, 6.3),
          r = rnd(40, 110);
        g.fillStyle = 'rgba(50,38,26,0.5)';
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, rnd(2, 6), 0, 6.3);
        g.fill();
      }
    });
    cell(6, () => {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(${rnd(95, 135)},${rnd(4, 12)},${rnd(6, 14)},0.92)`;
        const a = rnd(0, 6.3),
          d = rnd(0, 36),
          r = rnd(18, 46);
        g.beginPath();
        g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r, r * rnd(0.55, 1), a, 0, 6.3);
        g.fill();
      }
      for (let i = 0; i < 46; i++) {
        const a = rnd(0, 6.3),
          d = rnd(40, 122);
        g.fillStyle = `rgba(${rnd(90, 130)},6,10,0.9)`;
        g.beginPath();
        g.ellipse(Math.cos(a) * d, Math.sin(a) * d, rnd(1.5, 7), rnd(1.5, 4), a, 0, 6.3);
        g.fill();
      }
    });
    cell(7, () => {
      blob(124, 'rgba(12,10,8,0.85)');
      blob(70, 'rgba(4,4,4,0.9)');
      g.strokeStyle = 'rgba(10,8,6,0.5)';
      for (let i = 0; i < 40; i++) {
        const a = rnd(0, 6.3);
        g.lineWidth = rnd(1, 5);
        g.beginPath();
        g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
        g.lineTo(Math.cos(a) * rnd(80, 126), Math.sin(a) * rnd(80, 126));
        g.stroke();
      }
    });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FLASH = {
  pistol: { front: 0.16, side: 0.18, tex: 'star5', light: 2.5, smoke: 1 },
  revolver: { front: 0.26, side: 0.24, tex: 'star6', light: 4, gap: true, smoke: 2 },
  rifle: { front: 0.22, side: 0.34, tex: 'star3', light: 3.2, smoke: 1 },
  shotgun: { front: 0.34, side: 0.42, tex: 'soft', light: 5, smoke: 3 },
  suppressed: { front: 0.04, side: 0.05, tex: 'soft', light: 0.25, smoke: 2 },
};
// what an impact throws out, per material: [chips, chipColor, dust, dustColor, sparks, size]
const IMPACT = {
  concrete: { chips: 7, col: 0xb9b5aa, dust: 5, dcol: 0xcfcabc, sparks: 1, size: 0.11 },
  asphalt: { chips: 6, col: 0x3a3b3d, dust: 4, dcol: 0x6a6a6c, sparks: 1, size: 0.1 },
  brick: { chips: 7, col: 0x9a5a44, dust: 5, dcol: 0xb98a78, sparks: 0, size: 0.11 },
  stucco: { chips: 6, col: 0xd8cdb8, dust: 6, dcol: 0xe2d9c8, sparks: 0, size: 0.12 },
  tile: { chips: 7, col: 0xe6e2d8, dust: 3, dcol: 0xdedbd2, sparks: 1, size: 0.1 },
  metal: { chips: 2, col: 0x9da2a8, dust: 1, dcol: 0x8a8a8a, sparks: 9, size: 0.07 },
  vehicle: { chips: 2, col: 0x8a8f96, dust: 1, dcol: 0x777777, sparks: 7, size: 0.07 },
  wood: { chips: 8, col: 0xc9a06a, dust: 3, dcol: 0xb89a70, sparks: 0, size: 0.11, splinter: true },
  drywall: { chips: 5, col: 0xe8e4da, dust: 6, dcol: 0xeeeae0, sparks: 0, size: 0.1 },
  glass: { chips: 9, col: 0xd8f0f6, dust: 1, dcol: 0xe8f4f8, sparks: 0, size: 0.13, glass: true },
  plastic: { chips: 4, col: 0xc9482f, dust: 1, dcol: 0x999999, sparks: 0, size: 0.07 },
  rubber: { chips: 2, col: 0x151515, dust: 1, dcol: 0x333333, sparks: 0, size: 0.06 },
  sand: { chips: 0, col: 0xd9c79a, dust: 9, dcol: 0xdccba0, sparks: 0, size: 0.14 },
  dirt: { chips: 3, col: 0x5e4a33, dust: 7, dcol: 0x7a644a, sparks: 0, size: 0.13 },
  grass: { chips: 4, col: 0x4c7430, dust: 5, dcol: 0x7a6a4a, sparks: 0, size: 0.12 },
  foliage: { chips: 4, col: 0x4c8a34, dust: 0, dcol: 0, sparks: 0, size: 0 },
  cloth: { chips: 0, col: 0, dust: 1, dcol: 0xbbbbbb, sparks: 0, size: 0 },
};

export function createGunFX(game) {
  const { scene } = game;
  const T = {
    star5: starTex(5, 0.42, false),
    star6: starTex(6, 0.35, true),
    star3: starTex(3, 0.22, false),
    soft: starTex(8, 0.6, true),
    side: sideTex(),
  };
  const fmat = (tex) =>
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  const MATS = {
    star5: fmat(T.star5),
    star6: fmat(T.star6),
    star3: fmat(T.star3),
    soft: fmat(T.soft),
    side: fmat(T.side),
  };
  const plane = new THREE.PlaneGeometry(1, 1),
    sidePlane = new THREE.PlaneGeometry(1, 0.28).translate(0.5, 0, 0);
  const stats = { particles: 0, chips: 0, decals: 0, casings: 0, tracers: 0 };
  const _v = new THREE.Vector3(),
    _v2 = new THREE.Vector3(),
    _q = new THREE.Quaternion(),
    _m = new THREE.Matrix4(),
    _one = new THREE.Vector3(1, 1, 1),
    _e = new THREE.Euler(),
    _c = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0),
    ZV = new THREE.Vector3(0, 0, 1);
  const QX90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const dayLight = () => {
    const tod = game.timeOfDay ?? 12;
    return Math.max(0.16, Math.min(1, Math.sin(((tod - 5.5) / 13) * Math.PI) * 1.4));
  };

  // ---------------- muzzle flash rig (re-parented onto whichever gun fires)
  const rig = new THREE.Group();
  rig.visible = false;
  const front = new THREE.Mesh(plane, MATS.star5);
  front.renderOrder = 10;
  const s1 = new THREE.Mesh(sidePlane, MATS.side);
  s1.rotation.y = -Math.PI / 2;
  s1.renderOrder = 10;
  const s2 = s1.clone();
  s2.rotation.set(Math.PI / 2, -Math.PI / 2, 0, 'YXZ');
  const gapL = new THREE.Mesh(plane, MATS.soft),
    gapR = gapL.clone();
  rig.add(front, s1, s2, gapL, gapR);
  const light = new THREE.PointLight(0xffb060, 0, 11, 2);
  rig.add(light);
  let flashT = 0;
  function flash(model, kind = 'pistol') {
    const f = FLASH[kind] || FLASH.pistol;
    if (!model) return;
    if (rig.parent !== model) model.add(rig);
    const m = model.userData.muzzle || new THREE.Vector3(0, 0, 0.2);
    rig.position.copy(m);
    const j = 0.75 + Math.random() * 0.5;
    front.material = MATS[f.tex];
    front.scale.setScalar(f.front * j);
    front.rotation.z = Math.random() * Math.PI * 2;
    s1.scale.set(f.side * j, f.side * j * 0.9, 1);
    s2.scale.copy(s1.scale);
    s1.visible = s2.visible = kind !== 'suppressed' || Math.random() < 0.25;
    gapL.visible = gapR.visible = !!f.gap;
    if (f.gap) {
      const back = m.z - 0.07;
      gapL.position.set(0.035, -0.006, -back);
      gapR.position.set(-0.035, -0.006, -back);
      gapL.scale.setScalar(0.08);
      gapR.scale.setScalar(0.08);
      gapL.rotation.y = Math.PI / 2;
      gapR.rotation.y = -Math.PI / 2;
    }
    light.intensity = f.light * (0.8 + Math.random() * 0.4);
    rig.visible = true;
    flashT = 0.045 + Math.random() * 0.02;
    // smoke drifting from the muzzle (and the ejection port)
    model.localToWorld(_v.copy(m));
    _v2.set(0, 0, 1).transformDirection(model.matrixWorld);
    for (let i = 0; i < f.smoke; i++)
      emit(0, _v, {
        vx: _v2.x * rnd(0.6, 2.2) + rnd(-0.2, 0.2),
        vy: _v2.y * rnd(0.6, 2) + rnd(0.1, 0.5),
        vz: _v2.z * rnd(0.6, 2.2) + rnd(-0.2, 0.2),
        life: rnd(0.5, 1.1),
        s0: 0.05,
        s1: rnd(0.22, 0.45),
        color: 0xc8c8c8,
        a: 0.22,
        drag: 3,
        grav: -0.25,
        tex: 1,
      });
  }

  // ---------------- particles: two THREE.Points (alpha, additive) with a tiny custom shader
  const atlas = particleAtlas();
  function makePoints(max, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3),
      col = new Float32Array(max * 4),
      misc = new Float32Array(max * 2);
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aMisc', new THREE.BufferAttribute(misc, 2).setUsage(THREE.DynamicDrawUsage)); // size (m), atlas cell
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uMap: { value: atlas }, uLight: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader:
        'attribute vec4 aColor; attribute vec2 aMisc; varying vec4 vC; varying float vCell; uniform float uScale; void main(){ vC=aColor; vCell=aMisc.y; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(aMisc.x*uScale/max(0.1,-mv.z),0.0,420.0); }',
      fragmentShader:
        'uniform sampler2D uMap; uniform float uLight; varying vec4 vC; varying float vCell; void main(){ vec2 o=vec2(mod(vCell,2.0),floor(vCell/2.0))*0.5; float a=texture2D(uMap,o+gl_PointCoord*0.5).a*vC.a; if(a<0.01) discard; gl_FragColor=vec4(vC.rgb*uLight,a); }',
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 9 : 8;
    scene.add(pts);
    return {
      pts,
      pos,
      col,
      misc,
      max,
      n: 0,
      additive,
      p: Array.from({ length: max }, () => ({ alive: false })),
    };
  }
  const PA = makePoints(1400, false),
    PB = makePoints(700, true);
  // kind: 0 alpha, 1 additive. o: { vx, vy, vz, life, s0, s1, color, a, drag, grav, tex, floor }
  function emit(kind, p, o) {
    const S = kind ? PB : PA;
    let it = null;
    for (let k = 0; k < 8; k++) {
      const i = (S.n + k) % S.max;
      if (!S.p[i].alive) {
        it = S.p[i];
        S.n = i + 1;
        break;
      }
    }
    if (!it) {
      it = S.p[S.n % S.max];
      S.n++;
    }
    it.alive = true;
    it.x = p.x;
    it.y = p.y;
    it.z = p.z;
    it.vx = o.vx || 0;
    it.vy = o.vy || 0;
    it.vz = o.vz || 0;
    it.life = it.max = o.life || 0.6;
    it.s0 = o.s0 ?? 0.05;
    it.s1 = o.s1 ?? it.s0;
    _c.set(o.color ?? 0xffffff);
    it.r = _c.r;
    it.g = _c.g;
    it.b = _c.b;
    it.a = o.a ?? 1;
    it.drag = o.drag || 0;
    it.grav = o.grav ?? 9.81;
    it.tex = o.tex || 0;
    it.floor = o.floor ?? -1e9;
  }
  function tickPoints(S, dt) {
    let n = 0;
    const { pos, col, misc } = S;
    for (let i = 0; i < S.max; i++) {
      const it = S.p[i];
      if (!it.alive) continue;
      it.life -= dt;
      if (it.life <= 0) {
        it.alive = false;
        continue;
      }
      const k = Math.exp(-it.drag * dt);
      it.vx *= k;
      it.vy = it.vy * k - it.grav * dt;
      it.vz *= k;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      if (it.y < it.floor) {
        it.y = it.floor;
        it.vy *= -0.25;
        it.vx *= 0.5;
        it.vz *= 0.5;
      }
      const t = 1 - it.life / it.max;
      pos[n * 3] = it.x;
      pos[n * 3 + 1] = it.y;
      pos[n * 3 + 2] = it.z;
      col[n * 4] = it.r;
      col[n * 4 + 1] = it.g;
      col[n * 4 + 2] = it.b;
      col[n * 4 + 3] = it.a * (t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9);
      misc[n * 2] = it.s0 + (it.s1 - it.s0) * t;
      misc[n * 2 + 1] = it.tex;
      n++;
    }
    const g = S.pts.geometry;
    g.setDrawRange(0, n);
    if (n || S.had) {
      g.attributes.position.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
      g.attributes.aMisc.needsUpdate = true;
    }
    S.had = n > 0;
    return n;
  }

  // ---------------- chips: instanced debris bits (concrete chips, wood splinters, glass bits, metal flakes) with bounce
  const CH_N = 420;
  const chipGeo = new THREE.TetrahedronGeometry(1, 0);
  chipGeo.scale(1, 0.55, 0.8);
  const chipMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
  const chips = new THREE.InstancedMesh(chipGeo, chipMat, CH_N);
  chips.frustumCulled = false;
  chips.castShadow = true;
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const chipItems = Array.from({ length: CH_N }, () => ({
    alive: false,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    w: new THREE.Vector3(),
    s: new THREE.Vector3(),
  }));
  {
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CH_N; i++) {
      chips.setMatrixAt(i, z);
      chips.setColorAt(i, _c.set(0xffffff));
    }
    scene.add(chips);
  }
  let chipNext = 0,
    chipsDirty = false;
  function chip(p, v, color, size, o = {}) {
    const i = chipNext;
    chipNext = (chipNext + 1) % CH_N;
    const it = chipItems[i];
    it.alive = true;
    it.p.copy(p);
    it.v.copy(v);
    it.life = o.life ?? rnd(5, 9);
    it.rest = false;
    it.q.setFromEuler(_e.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)));
    it.w.set(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20));
    const s = size * rnd(0.5, 1.2);
    if (o.splinter) it.s.set(s * 0.35, s * 0.3, s * rnd(2, 4));
    else if (o.flat) it.s.set(s * 1.3, s * 0.18, s * 1.1);
    else it.s.set(s, s, s);
    it.floor = o.floor ?? -1e9;
    it.r = Math.max(it.s.x, it.s.y) * 0.5;
    chips.setColorAt(i, _c.set(color).multiplyScalar(rnd(0.75, 1.1)));
    if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
  }
  function tickChips(dt) {
    let n = 0;
    for (let i = 0; i < CH_N; i++) {
      const it = chipItems[i];
      if (!it.alive) continue;
      n++;
      it.life -= dt;
      if (it.life <= 0) {
        it.alive = false;
        chips.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      if (!it.rest) {
        it.v.y -= 9.81 * dt;
        it.p.addScaledVector(it.v, dt);
        if (it.p.y < it.floor + it.r) {
          it.p.y = it.floor + it.r;
          if (it.v.y < -0.8) {
            it.v.y *= -0.3;
            it.v.x *= 0.55;
            it.v.z *= 0.55;
            it.w.multiplyScalar(0.5);
          } else {
            it.rest = true;
          }
        }
        _q.setFromEuler(_e.set(it.w.x * dt, it.w.y * dt, it.w.z * dt));
        it.q.multiply(_q);
      } else if (it.life > 1) continue;
      const k = it.life < 1 ? it.life : 1;
      chips.setMatrixAt(i, _m.compose(it.p, it.q, _v.copy(it.s).multiplyScalar(k)));
    }
    if (n || chipsDirty) chips.instanceMatrix.needsUpdate = true;
    chipsDirty = n > 0;
    return n;
  }

  // ---------------- decals: one instanced quad mesh, per-instance atlas cell
  const DC_N = 420,
    decTex = decalAtlas();
  const decGeo = new THREE.PlaneGeometry(1, 1);
  const uvOff = new Float32Array(DC_N * 2);
  decGeo.setAttribute('aUvOff', new THREE.InstancedBufferAttribute(uvOff, 2));
  const decMat = new THREE.MeshLambertMaterial({
    map: decTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  decMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUvOff;')
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * vec2(0.25, 0.5) + aUvOff;\n#endif',
      );
  };
  const decals = new THREE.InstancedMesh(decGeo, decMat, DC_N);
  decals.frustumCulled = false;
  decals.renderOrder = 3;
  decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const decItems = Array.from({ length: DC_N }, () => ({
    alive: false,
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    s: 0,
    life: 0,
  }));
  {
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < DC_N; i++) decals.setMatrixAt(i, z);
    scene.add(decals);
  }
  let decNext = 0;
  function decal(kind, point, normal, size = 0.12, life = 60) {
    const cell = DECAL_CELL[kind];
    if (cell == null) return;
    const i = decNext;
    decNext = (decNext + 1) % DC_N;
    const it = decItems[i];
    const n = normal && normal.lengthSq() > 0.01 ? _v.copy(normal).normalize() : _v.set(0, 1, 0);
    it.alive = true;
    it.p.copy(point).addScaledVector(n, 0.012 + (i % 7) * 0.0006);
    it.q.setFromUnitVectors(ZV, n);
    it.q.multiply(_q.setFromAxisAngle(ZV, rnd(0, 6.283)));
    it.s = size;
    it.life = life;
    it.grow = kind === 'blood' ? 0.35 : 0;
    it.age = 0;
    uvOff[i * 2] = (cell % 4) * 0.25;
    uvOff[i * 2 + 1] = 1 - (Math.floor(cell / 4) + 1) * 0.5;
    decGeo.attributes.aUvOff.needsUpdate = true;
    decals.setMatrixAt(i, _m.compose(it.p, it.q, _v2.set(size, size, 1)));
    decals.instanceMatrix.needsUpdate = true;
  }
  function tickDecals(dt) {
    let n = 0,
      dirty = false;
    for (let i = 0; i < DC_N; i++) {
      const it = decItems[i];
      if (!it.alive) continue;
      n++;
      it.life -= dt;
      it.age += dt;
      if (it.life <= 0) {
        it.alive = false;
        decals.setMatrixAt(i, _m.makeScale(0, 0, 0));
        dirty = true;
        continue;
      }
      if (it.life < 1.5 || (it.grow && it.age < 1.2)) {
        const s =
          it.s *
          (it.life < 1.5 ? it.life / 1.5 : 1) *
          (it.grow ? 1 + it.grow * Math.min(1, it.age / 1.2) : 1);
        decals.setMatrixAt(i, _m.compose(it.p, it.q, _v2.set(s, s, 1)));
        dirty = true;
      }
    }
    if (dirty) decals.instanceMatrix.needsUpdate = true;
    return n;
  }

  // ---------------- tracers: stretched camera-facing quads that travel from the muzzle to the hit point
  const TR_N = 48,
    trGeo = new THREE.PlaneGeometry(1, 1);
  const trTex = new THREE.CanvasTexture(
    cnv(64, 16, (g) => {
      const gr = g.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, 'rgba(255,200,120,0)');
      gr.addColorStop(0.7, 'rgba(255,225,160,0.9)');
      gr.addColorStop(1, 'rgba(255,255,240,1)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(32, 8, 32, 5, 0, 0, 6.3);
      g.fill();
    }),
  );
  const tracerMesh = new THREE.InstancedMesh(
    trGeo,
    new THREE.MeshBasicMaterial({
      map: trTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    TR_N,
  );
  tracerMesh.frustumCulled = false;
  tracerMesh.renderOrder = 11;
  tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(tracerMesh);
  const trItems = Array.from({ length: TR_N }, () => ({
    alive: false,
    a: new THREE.Vector3(),
    d: new THREE.Vector3(),
    len: 0,
    t: 0,
  }));
  {
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < TR_N; i++) tracerMesh.setMatrixAt(i, z);
  }
  let trNext = 0;
  function tracer(a, b, o = {}) {
    const it = trItems[trNext];
    trNext = (trNext + 1) % TR_N;
    it.a.copy(a);
    it.d.subVectors(b, a);
    it.len = it.d.length();
    if (it.len < 0.5) return;
    it.d.multiplyScalar(1 / it.len);
    it.alive = true;
    it.t = 0;
    it.speed = o.speed || 320;
    it.w = o.width || 0.035;
    it.streak = Math.min(it.len, o.streak || 9);
  }
  const _bx = new THREE.Vector3(),
    _by = new THREE.Vector3(),
    _bz = new THREE.Vector3();
  function tickTracers(dt) {
    let n = 0;
    const cam = game.camera.position;
    for (let i = 0; i < TR_N; i++) {
      const it = trItems[i];
      if (!it.alive) continue;
      n++;
      const head = Math.min(it.len, it.t * it.speed + it.streak * 0.6),
        tail = Math.max(0, head - it.streak);
      it.t += dt;
      if (tail >= it.len - 0.01 || it.t > 1.5) {
        it.alive = false;
        tracerMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      _v.copy(it.a).addScaledVector(it.d, (head + tail) / 2);
      _bx.copy(it.d);
      _bz.subVectors(cam, _v).normalize();
      _by.crossVectors(_bz, _bx).normalize();
      _bz.crossVectors(_bx, _by);
      const L = head - tail,
        wd = it.w * (1 + _v.distanceTo(cam) * 0.02);
      _m.makeBasis(_bx.clone().multiplyScalar(L), _by.clone().multiplyScalar(wd), _bz).setPosition(
        _v,
      );
      tracerMesh.setMatrixAt(i, _m);
    }
    if (n || tickTracers.had) tracerMesh.instanceMatrix.needsUpdate = true;
    tickTracers.had = n > 0;
    return n;
  }

  // ---------------- casings: land, bounce (with ring), then roll and settle; magazines dropped on reload
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14f, metalness: 1, roughness: 0.28 });
  const lathe = (pts) =>
    new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      10,
    );
  const shellGeo = (() => {
    const g = lathe([
      [0, -0.033],
      [0.0112, -0.033],
      [0.0112, -0.021],
      [0.0102, -0.021],
      [0.0102, 0.031],
      [0.0085, 0.033],
      [0, 0.033],
    ]);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const b = g.attributes.position.getY(i) < -0.02;
      col[i * 3] = b ? 0.79 : 0.62;
      col[i * 3 + 1] = b ? 0.63 : 0.1;
      col[i * 3 + 2] = b ? 0.31 : 0.08;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  })();
  const CAS = {
    pistol: {
      geo: lathe([
        [0, -0.0095],
        [0.0049, -0.0095],
        [0.0049, -0.0082],
        [0.0043, -0.0078],
        [0.0046, -0.0072],
        [0.0046, 0.0095],
        [0.0038, 0.0095],
      ]),
      mat: brass,
      n: 48,
      r: 0.0048,
      len: 0.019,
    },
    rifle: {
      geo: lathe([
        [0, -0.0225],
        [0.0048, -0.0225],
        [0.0048, -0.021],
        [0.0042, -0.0205],
        [0.0047, -0.0198],
        [0.0046, 0.012],
        [0.0031, 0.0165],
        [0.0031, 0.0225],
        [0.0026, 0.0225],
      ]),
      mat: brass,
      n: 72,
      r: 0.0048,
      len: 0.045,
    },
    shell: {
      geo: shellGeo,
      mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }),
      n: 28,
      r: 0.0105,
      len: 0.066,
    },
  };
  for (const k in CAS) {
    const c = CAS[k];
    c.mesh = new THREE.InstancedMesh(c.geo, c.mat, c.n);
    c.mesh.castShadow = true;
    c.mesh.frustumCulled = false;
    c.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    c.items = Array.from({ length: c.n }, () => ({
      alive: false,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      w: new THREE.Vector3(),
      life: 0,
      floor: 0,
      bounces: 0,
    }));
    c.next = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < c.n; i++) c.mesh.setMatrixAt(i, zero);
    scene.add(c.mesh);
  }
  function eject(type, pos, vel) {
    const c = CAS[type] || CAS.pistol;
    const it = c.items[c.next];
    c.next = (c.next + 1) % c.n;
    it.alive = true;
    it.p.copy(pos);
    it.v.copy(vel);
    it.life = 22;
    it.bounces = 0;
    it.state = 0;
    it.q.setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    it.w.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 40);
    it.floor = groundAt(game, pos.x, pos.z, pos.y + 0.3);
    if (!(it.floor > -100)) it.floor = pos.y - 1.4;
    it.surface = null;
  }
  function tickCasings(dt) {
    let total = 0;
    for (const k in CAS) {
      const c = CAS[k];
      let any = false;
      for (let i = 0; i < c.n; i++) {
        const it = c.items[i];
        if (!it.alive) continue;
        any = true;
        total++;
        it.life -= dt;
        if (it.life <= 0) {
          it.alive = false;
          c.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
          continue;
        }
        if (it.state === 0) {
          // airborne / bouncing
          it.v.y -= 9.81 * dt;
          it.p.addScaledVector(it.v, dt);
          if (it.p.y < it.floor + c.r) {
            it.p.y = it.floor + c.r;
            const soft = (it.surface ??= game.surfaceAt?.(it.p.x, it.p.z) || 'concrete'),
              dead =
                soft === 'sand' ||
                soft === 'grass_short' ||
                soft === 'grass_long' ||
                soft === 'dirt' ||
                soft === 'water';
            if (soft === 'water' && it.floor < (game.city?.seaLevel ?? -0.12) - 0.3) {
              it.alive = false;
              c.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
              continue;
            }
            if (it.v.y < -0.5 && !dead && it.bounces < 3) {
              if (it.p.distanceToSquared(game.camera.position) < 500)
                sfx(game, k === 'shell' ? 'shell_drop' : 'casing', it.p, 0.4 / (1 + it.bounces));
              it.v.y = -it.v.y * rnd(0.3, 0.45);
              it.v.x = it.v.x * 0.6 + rnd(-0.25, 0.25);
              it.v.z = it.v.z * 0.6 + rnd(-0.25, 0.25);
              it.w.multiplyScalar(0.6);
              it.bounces++;
            } else {
              // lay it on its side and let it roll
              it.state = dead ? 2 : 1;
              it.v.y = 0;
              const yaw = Math.atan2(it.v.x, it.v.z) + Math.PI / 2 + rnd(-0.5, 0.5);
              it.yaw = yaw;
              it.roll = 0;
              it.rv = Math.min(0.9, Math.hypot(it.v.x, it.v.z)) * (dead ? 0 : 1);
              it.rdx = Math.sin(yaw + Math.PI / 2);
              it.rdz = Math.cos(yaw + Math.PI / 2);
            }
          }
          if (it.state === 0) {
            _q.setFromEuler(_e.set(it.w.x * dt, it.w.y * dt, it.w.z * dt));
            it.q.multiply(_q);
          }
        } else if (it.state === 1) {
          // rolling: axis horizontal along yaw, moves perpendicular to it
          it.rv *= Math.exp(-dt * 1.6);
          if (it.rv < 0.02) it.state = 2;
          it.p.x += it.rdx * it.rv * dt;
          it.p.z += it.rdz * it.rv * dt;
          it.roll += (it.rv * dt) / c.r;
          it.yaw += it.rv * dt * 0.6; // casings are tapered: they roll in an arc
        }
        if (it.state > 0) {
          it.q
            .setFromAxisAngle(UP, it.yaw)
            .multiply(QX90)
            .multiply(_q.setFromAxisAngle(UP, it.roll));
          if (it.state === 2 && it.life > 1 && it.settled) continue;
          it.settled = it.state === 2;
        }
        const s = it.life < 1 ? it.life : 1;
        c.mesh.setMatrixAt(i, _m.compose(it.p, it.q, _one.set(s, s, s)));
      }
      if (any || c.dirty) {
        c.mesh.instanceMatrix.needsUpdate = true;
        c.dirty = any;
      }
    }
    return total;
  }
  const mags = [];
  function dropMag(obj, pos, vel, quat) {
    if (!obj) return;
    if (mags.length >= 8) {
      const o = mags.shift();
      scene.remove(o.obj);
    }
    obj.position.copy(pos);
    if (quat) obj.quaternion.copy(quat);
    scene.add(obj);
    mags.push({
      obj,
      v: vel.clone(),
      w: new THREE.Vector3(rnd(-6, 6), rnd(-3, 3), rnd(-6, 6)),
      life: 25,
      floor: groundAt(game, pos.x, pos.z, pos.y + 0.3),
      rest: false,
    });
  }
  function tickMags(dt) {
    for (let i = mags.length - 1; i >= 0; i--) {
      const m = mags[i];
      m.life -= dt;
      if (m.life <= 0) {
        scene.remove(m.obj);
        mags.splice(i, 1);
        continue;
      }
      if (m.rest) {
        if (m.life < 1) m.obj.scale.setScalar(m.life);
        continue;
      }
      m.v.y -= 9.81 * dt;
      m.obj.position.addScaledVector(m.v, dt);
      m.obj.rotateX(m.w.x * dt);
      m.obj.rotateZ(m.w.z * dt);
      if (m.obj.position.y < m.floor + 0.012) {
        m.obj.position.y = m.floor + 0.012;
        if (m.v.y < -1) {
          m.v.y *= -0.25;
          m.v.x *= 0.5;
          m.v.z *= 0.5;
          m.w.multiplyScalar(0.4);
          sfx(game, 'casing', m.obj.position, 0.5);
        } else {
          m.rest = true;
          m.obj.rotation.set(Math.PI / 2, m.obj.rotation.y, 0);
        }
      }
    }
  }

  // ---------------- composite effects
  // i: { point, normal, material, dir, weapon, power (0..1.5), exit (bool), dynamic (bool: no decal on moving bodies) }
  function impact(i) {
    const mat = i.material || 'concrete',
      M = MATERIALS[mat] || MATERIALS.concrete,
      I = IMPACT[mat];
    const n = i.normal || UP,
      p = i.point,
      pw = i.power ?? 1;
    if (mat === 'water') return waterSplash(p, 0.5 + pw * 0.5);
    if (mat === 'flesh') return blood(p, i.dir, 0.6 + pw * 0.4);
    if (!I) return;
    const floor = n.y > 0.5 ? p.y : groundAt(game, p.x + n.x * 0.3, p.z + n.z * 0.3, p.y + 0.2);
    if (M.decal && !i.dynamic)
      decal(
        M.decal,
        p,
        n,
        I.size * (0.8 + pw * 0.45) * (i.exit ? 1.5 : 1),
        mat === 'sand' || mat === 'dirt' || mat === 'grass' ? 25 : 70,
      );
    const dl = Math.max(0.25, dayLight());
    for (let k = 0; k < I.chips * (0.6 + pw * 0.5); k++) {
      _v.set(
        n.x * rnd(1, 4.5) + rnd(-1.6, 1.6),
        n.y * rnd(1, 4.5) + rnd(0.3, 2.6),
        n.z * rnd(1, 4.5) + rnd(-1.6, 1.6),
      );
      chip(
        _v2.copy(p).addScaledVector(n, 0.02),
        _v,
        I.col,
        mat === 'glass' ? 0.028 : I.splinter ? 0.016 : 0.022,
        { splinter: I.splinter, flat: I.glass, floor },
      );
    }
    for (let k = 0; k < I.dust * (0.7 + pw * 0.4); k++)
      emit(0, p, {
        vx: n.x * rnd(0.4, 2.4) + rnd(-0.5, 0.5),
        vy: n.y * rnd(0.4, 2.4) + rnd(0.1, 0.8),
        vz: n.z * rnd(0.4, 2.4) + rnd(-0.5, 0.5),
        life: rnd(0.5, 1.4),
        s0: 0.06,
        s1: rnd(0.3, 0.7),
        color: I.dcol,
        a: 0.42 * dl + 0.1,
        drag: 2.6,
        grav: 0.4,
        tex: 1,
      });
    for (let k = 0; k < I.sparks; k++)
      emit(1, p, {
        vx: n.x * rnd(2, 9) + rnd(-3, 3),
        vy: n.y * rnd(2, 9) + rnd(-1, 4),
        vz: n.z * rnd(2, 9) + rnd(-3, 3),
        life: rnd(0.12, 0.4),
        s0: 0.035,
        s1: 0.008,
        color: 0xffc070,
        a: 1,
        drag: 1,
        grav: 9.81,
        tex: 0,
      });
    if (mat === 'sand' || mat === 'dirt' || mat === 'grass')
      for (let k = 0; k < 6; k++)
        emit(0, p, {
          vx: rnd(-1, 1),
          vy: rnd(1.5, 4),
          vz: rnd(-1, 1),
          life: rnd(0.3, 0.6),
          s0: 0.03,
          s1: 0.02,
          color: I.col,
          a: 0.9,
          drag: 0.5,
          grav: 9.81,
          tex: 3,
          floor: p.y,
        });
  }
  function blood(p, dir, amount = 1) {
    const d = dir || UP;
    for (let k = 0; k < 6 * amount; k++)
      emit(0, p, {
        vx: d.x * rnd(0.5, 3) + rnd(-0.8, 0.8),
        vy: rnd(-0.2, 1.6),
        vz: d.z * rnd(0.5, 3) + rnd(-0.8, 0.8),
        life: rnd(0.25, 0.55),
        s0: 0.03,
        s1: 0.09,
        color: 0x7a0a0e,
        a: 0.85,
        drag: 2.5,
        grav: 6,
        tex: k % 2 ? 2 : 0,
      });
    for (let k = 0; k < 3 * amount; k++)
      emit(0, p, {
        vx: -d.x * rnd(0.3, 1.2) + rnd(-0.4, 0.4),
        vy: rnd(0, 1),
        vz: -d.z * rnd(0.3, 1.2) + rnd(-0.4, 0.4),
        life: 0.3,
        s0: 0.05,
        s1: 0.16,
        color: 0x8a1014,
        a: 0.4,
        drag: 4,
        grav: 2,
        tex: 1,
      });
  }
  function waterSplash(p, strength = 1) {
    const sl = game.city?.seaLevel ?? -0.12;
    _v.set(p.x, Math.max(p.y, sl) + 0.02, p.z);
    for (let k = 0; k < 9 * strength; k++)
      emit(0, _v, {
        vx: rnd(-0.7, 0.7) * strength,
        vy: rnd(2, 5.5) * Math.sqrt(strength),
        vz: rnd(-0.7, 0.7) * strength,
        life: rnd(0.35, 0.8),
        s0: 0.05,
        s1: 0.12,
        color: 0xe6f6ff,
        a: 0.75,
        drag: 0.6,
        grav: 9.81,
        tex: k % 2 ? 2 : 0,
      });
    for (let k = 0; k < 4 * strength; k++)
      emit(0, _v, {
        vx: rnd(-0.4, 0.4),
        vy: rnd(0.3, 1),
        vz: rnd(-0.4, 0.4),
        life: rnd(0.6, 1.1),
        s0: 0.1,
        s1: 0.5 * strength,
        color: 0xffffff,
        a: 0.3,
        drag: 2,
        grav: 0.5,
        tex: 1,
      });
    try {
      game.fx?.ripple?.(_v);
      if (strength > 1.2) game.fx?.splash?.(_v, strength * 0.6);
    } catch (e) {
      /* */
    }
  }
  let boomLight = null,
    boomT = 0;
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  const rings = [];
  function shockwave(pos, radius) {
    let r = rings.find((q) => !q.alive);
    if (!r) {
      if (rings.length >= 6) return;
      r = {
        mesh: new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({
            color: 0xfff2dc,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
        ),
      };
      r.mesh.renderOrder = 7;
      scene.add(r.mesh);
      rings.push(r);
    }
    r.alive = true;
    r.t = 0;
    r.R = radius * 1.6;
    r.mesh.visible = true;
    r.mesh.position.set(pos.x, pos.y + 0.15, pos.z);
  }
  function explosion(pos, radius = 7.5, o = {}) {
    const floor = groundAt(game, pos.x, pos.z, pos.y + 1),
      k = radius / 7.5;
    for (let i = 0; i < 26 * k; i++)
      emit(1, pos, {
        vx: rnd(-6, 6) * k,
        vy: rnd(0.5, 8) * k,
        vz: rnd(-6, 6) * k,
        life: rnd(0.25, 0.6),
        s0: rnd(0.5, 1.2) * k,
        s1: rnd(1.6, 3) * k,
        color: i % 3 ? 0xff8a2a : 0xffd27a,
        a: 0.9,
        drag: 3.2,
        grav: -1.5,
        tex: 1,
      });
    for (let i = 0; i < 30 * k; i++)
      emit(1, pos, {
        vx: rnd(-16, 16),
        vy: rnd(2, 18),
        vz: rnd(-16, 16),
        life: rnd(0.4, 1.1),
        s0: 0.07,
        s1: 0.015,
        color: 0xffb050,
        a: 1,
        drag: 0.8,
        grav: 9.81,
        tex: 0,
        floor,
      });
    for (let i = 0; i < 22 * k; i++)
      emit(0, pos, {
        vx: rnd(-3.5, 3.5) * k,
        vy: rnd(1, 6) * k,
        vz: rnd(-3.5, 3.5) * k,
        life: rnd(1.8, 4.2),
        s0: 0.8 * k,
        s1: rnd(3, 5.5) * k,
        color: i % 2 ? 0x2a2622 : 0x4a443c,
        a: 0.62,
        drag: 1.4,
        grav: -0.7,
        tex: 1,
      });
    for (let i = 0; i < 16; i++)
      emit(0, pos, {
        vx: rnd(-7, 7),
        vy: rnd(0.2, 1.2),
        vz: rnd(-7, 7),
        life: rnd(0.8, 1.6),
        s0: 0.5,
        s1: 2.4,
        color: 0x9a8e7c,
        a: 0.38,
        drag: 2.2,
        grav: 0,
        tex: 1,
      });
    for (let i = 0; i < 34 * k; i++) {
      _v.set(rnd(-9, 9), rnd(3, 13), rnd(-9, 9));
      chip(
        _v2.set(pos.x + rnd(-0.5, 0.5), pos.y + 0.2, pos.z + rnd(-0.5, 0.5)),
        _v,
        i % 3 ? 0x4a4640 : 0x8a8478,
        rnd(0.03, 0.08),
        { floor, life: rnd(7, 12) },
      );
    }
    if (!o.noScorch && pos.y - floor < 1.5)
      decal('scorch', _v.set(pos.x, floor, pos.z), UP, radius * 0.75, 110);
    shockwave(pos, radius);
    if (!boomLight) {
      boomLight = new THREE.PointLight(0xffa040, 0, 45, 2);
      scene.add(boomLight);
    }
    boomLight.position.set(pos.x, pos.y + 1.2, pos.z);
    boomLight.intensity = 900 * k;
    boomT = 0.3;
    if (pos.y < (game.city?.seaLevel ?? -0.12) + 0.6 && game.surfaceAt?.(pos.x, pos.z) === 'water')
      waterSplash(pos, 3.5);
  }
  // one frame of fire at a point (call every frame while it burns): flames + embers + smoke
  function flame(pos, size = 1, dt = 1 / 60) {
    const n = Math.max(1, Math.round(size * 70 * dt));
    for (let i = 0; i < n; i++)
      emit(
        1,
        _v.set(pos.x + rnd(-0.3, 0.3) * size, pos.y + rnd(0, 0.25), pos.z + rnd(-0.3, 0.3) * size),
        {
          vx: rnd(-0.3, 0.3),
          vy: rnd(1.2, 2.8) * Math.sqrt(size),
          vz: rnd(-0.3, 0.3),
          life: rnd(0.35, 0.8),
          s0: rnd(0.35, 0.6) * size,
          s1: 0.08,
          color: Math.random() < 0.3 ? 0xffe08a : 0xff7a1e,
          a: 0.75,
          drag: 0.6,
          grav: -1.8,
          tex: 1,
        },
      );
    if (Math.random() < dt * 22 * size)
      emit(
        0,
        _v.set(pos.x + rnd(-0.3, 0.3) * size, pos.y + 0.9 * size, pos.z + rnd(-0.3, 0.3) * size),
        {
          vx: rnd(-0.3, 0.3),
          vy: rnd(1.4, 2.6),
          vz: rnd(-0.3, 0.3),
          life: rnd(1.6, 3.2),
          s0: 0.4 * size,
          s1: 1.9 * size,
          color: 0x24211e,
          a: 0.5,
          drag: 0.4,
          grav: -0.9,
          tex: 1,
        },
      );
    if (Math.random() < dt * 9)
      emit(1, pos, {
        vx: rnd(-1, 1),
        vy: rnd(2, 5),
        vz: rnd(-1, 1),
        life: rnd(0.6, 1.4),
        s0: 0.03,
        s1: 0.01,
        color: 0xffb050,
        a: 1,
        drag: 0.8,
        grav: -0.5,
        tex: 0,
      });
  }
  function sparks(pos, n = 8, normal = UP) {
    for (let k = 0; k < n; k++)
      emit(1, pos, {
        vx: normal.x * rnd(1, 6) + rnd(-3, 3),
        vy: normal.y * rnd(1, 6) + rnd(0, 4),
        vz: normal.z * rnd(1, 6) + rnd(-3, 3),
        life: rnd(0.15, 0.5),
        s0: 0.035,
        s1: 0.008,
        color: 0xffc070,
        a: 1,
        drag: 1,
        grav: 9.81,
        tex: 0,
      });
  }
  function dust(pos, n = 6, color = 0xcfcabc, size = 0.6) {
    const dl = Math.max(0.25, dayLight());
    for (let k = 0; k < n; k++)
      emit(0, pos, {
        vx: rnd(-1, 1),
        vy: rnd(0.2, 1.2),
        vz: rnd(-1, 1),
        life: rnd(0.6, 1.5),
        s0: 0.1,
        s1: rnd(0.5, 1) * size,
        color,
        a: 0.35 * dl + 0.08,
        drag: 2.2,
        grav: 0.2,
        tex: 1,
      });
  }

  function update(dt) {
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) {
        rig.visible = false;
        light.intensity = 0;
      }
    }
    const cam = game.camera,
      h = game.renderer?.domElement?.height || innerHeight;
    const sc = h / (2 * Math.tan((cam.fov * Math.PI) / 180 / 2));
    PA.pts.material.uniforms.uScale.value = sc;
    PB.pts.material.uniforms.uScale.value = sc;
    PA.pts.material.uniforms.uLight.value = Math.max(0.3, dayLight());
    stats.particles = tickPoints(PA, dt) + tickPoints(PB, dt);
    stats.chips = tickChips(dt);
    stats.decals = tickDecals(dt);
    stats.tracers = tickTracers(dt);
    stats.casings = tickCasings(dt);
    tickMags(dt);
    for (const r of rings) {
      if (!r.alive) continue;
      r.t += dt;
      const k = r.t / 0.45;
      if (k >= 1) {
        r.alive = false;
        r.mesh.visible = false;
        continue;
      }
      const s = r.R * (1 - (1 - k) * (1 - k));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 0.55 * (1 - k);
    }
    if (boomLight && boomT > 0) {
      boomT -= dt;
      boomLight.intensity = Math.max(0, boomT / 0.3) * 900;
    }
  }
  return {
    flash,
    eject,
    dropMag,
    tracer,
    impact,
    blood,
    decal,
    waterSplash,
    explosion,
    shockwave,
    flame,
    sparks,
    dust,
    emit,
    chip,
    update,
    stats,
  };
}
