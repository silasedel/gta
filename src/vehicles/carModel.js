// Procedural, original car models for Port Solana.
// Shell coordinates: ground at y=0, car faces +Z, centered on x=0, z=0 (mid wheelbase).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, boundsFn } from './bodyLoft.js';

// ---------------------------------------------------------------- types (parametric catalogue)
import { CAR_TYPES, MODELS, CLASSES, ALL_KEYS, rollVariant } from './catalog.js';
export { CAR_TYPES, MODELS, CLASSES, ALL_KEYS, rollVariant };

// ---------------------------------------------------------------- shared materials
let M = null;
function materials() {
  if (M) return M;
  M = {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1118, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.72, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.08 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.2, roughness: 0.55 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x1a1714, metalness: 0, roughness: 0.85 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0, roughness: 0.92 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.9, roughness: 0.45 }),
    under: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1 }),
    plate: null,
    rims: new Map(), paints: new Map(), calipers: new Map(),
  };
  M.plate = new THREE.MeshStandardMaterial({ map: textTexture(256, 128, (c) => {
    c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = '#1b3f73'; c.lineWidth = 8; c.strokeRect(6, 6, 244, 116);
    c.fillStyle = '#d2552a'; c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.fillText('CALORA', 128, 36);
    c.fillStyle = '#132a4d'; c.font = 'bold 58px monospace'; c.fillText('7SL 482', 128, 104);
  }), roughness: 0.5, metalness: 0.2 });
  return M;
}
function rimMat(color) {
  const m = materials();
  if (!m.rims.has(color)) m.rims.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.95, roughness: 0.22 }));
  return m.rims.get(color);
}
function caliperMat(color) {
  const m = materials();
  if (!m.calipers.has(color)) m.calipers.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 }));
  return m.calipers.get(color);
}
let _broken = null;
export function brokenGlassMat() {
  return _broken ||= new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: 0.1, roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false });
}
export function paintMat(color, flake = 0.55) {
  const m = materials();
  const key = color + ':' + flake;
  if (!m.paints.has(key)) {
    m.paints.set(key, new THREE.MeshPhysicalMaterial({
      color, metalness: flake, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25,
    }));
  }
  return m.paints.get(key);
}
function textTexture(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- geometry helpers
function norm(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}
class Bucket {
  constructor() { this.parts = {}; }
  add(key, geo, pos, rot, mirrorX) {
    const g = geo.clone();
    if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0)));
    if (pos) g.translate(pos[0], pos[1], pos[2]);
    (this.parts[key] ||= []).push(norm(g));
    if (mirrorX) {
      const g2 = geo.clone();
      if (rot) g2.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] || 0, -(rot[1] || 0), -(rot[2] || 0))));
      if (pos) g2.translate(-pos[0], pos[1], pos[2]);
      (this.parts[key] ||= []).push(norm(g2));
    }
  }
  box(key, sx, sy, sz, pos, rot, mirrorX) { this.add(key, new THREE.BoxGeometry(sx, sy, sz), pos, rot, mirrorX); }
  merged() {
    const out = {};
    for (const k in this.parts) out[k] = mergeGeometries(this.parts[k], false);
    return out;
  }
}

// side-profile shape (x = car z, y = height) extruded across width, centered on x
let CURVE_SEG = 14;
function extrudeProfile(shape, width, bevel = 0.07, seg = 4) {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: CURVE_SEG < 8 ? Math.min(seg, 2) : seg, curveSegments: CURVE_SEG,
  });
  // shape x -> car z, extrusion z -> car x
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}

// ---------------------------------------------------------------- body
const bodyCache = new Map();
function buildBody(t, typeKey, kit = 'base', lod = 0) {
  const ck = typeKey + '|' + kit + '|' + lod;
  if (bodyCache.has(ck)) return bodyCache.get(ck);
  const b = new Bucket();
  const D = lod === 0, D1 = lod <= 1; // detail gates
  CURVE_SEG = lod === 0 ? 14 : lod === 1 ? 7 : 3;
  const { L, W, wb, r, yb, belt, noseY, tailY, roofY, zA, zB, zC, zD } = t;
  const zf = L / 2, zr = -L / 2, zF = wb / 2, zR = -wb / 2, ra = r + 0.07;

  // lower body
  const s = new THREE.Shape();
  s.moveTo(zr + 0.18, yb);
  s.lineTo(zR - ra - 0.02, yb);
  s.lineTo(zR - ra, r * 0.92);
  s.absarc(zR, r * 0.92, ra, Math.PI, 0, true);
  s.lineTo(zR + ra, yb);
  s.lineTo(zF - ra, yb);
  s.lineTo(zF - ra, r * 0.92);
  s.absarc(zF, r * 0.92, ra, Math.PI, 0, true);
  s.lineTo(zF + ra + 0.02, yb);
  s.lineTo(zf - 0.22, yb + 0.02);
  s.quadraticCurveTo(zf + 0.02, yb + 0.04, zf + 0.02, yb + 0.22);
  s.lineTo(zf, noseY - 0.12);
  s.quadraticCurveTo(zf - 0.01, noseY + 0.02, zf - 0.25, noseY + 0.04);
  {
    // hood must clear the front wheel arch (low-nosed cars get raised fenders/hood)
    const hoodMin = r * 0.92 + ra + 0.04;
    const naturalAtF = (noseY + 0.04) + (belt - noseY - 0.04) * clamp01((zf - 0.25 - zF) / Math.max(0.1, zf - 0.25 - zA - 0.05)) * 0.6;
    if (naturalAtF < hoodMin && zF > zA + 0.1) s.splineThru([new THREE.Vector2(zF + ra * 0.9, (noseY + hoodMin) / 2 + 0.02), new THREE.Vector2(zF, hoodMin), new THREE.Vector2(zA + 0.05, belt)]);
    else s.quadraticCurveTo((zf + zA) / 2, belt - 0.02, zA + 0.05, belt);
  }
  s.lineTo(zD, belt + (tailY - belt) * 0.6);
  s.quadraticCurveTo((zD + zr) / 2, tailY + 0.01, zr + 0.14, tailY);
  s.quadraticCurveTo(zr - 0.02, tailY - 0.02, zr - 0.02, tailY - 0.2);
  s.lineTo(zr, yb + 0.2);
  s.quadraticCurveTo(zr + 0.01, yb, zr + 0.18, yb);
  // ---- shared width function: barrel sides, rounded shoulder at the local top, tumblehome, plan rounding
  const lowerB = boundsFn(s.getPoints(24));
  const tumble = t.box || t.bus ? 0.02 : t.van ? 0.06 : t.offroad ? 0.08 : 0.17;
  const planR = t.bus || t.box ? 0.03 : 0.1;
  const shoulderK = t.box || t.bus || t.van ? 0.05 : t.offroad ? 0.08 : 0.13;
  const S = (y, z) => {
    const lb = lowerB(Math.max(zr + 0.01, Math.min(zf - 0.01, z)));
    const ytop = lb ? lb[1] : belt;
    let f;
    if (y <= ytop + 0.02) {
      const v = clamp01((y - yb) / Math.max(0.1, ytop - yb));
      f = (1 - 0.035 * ((v - 0.5) / 0.5) ** 2) * (v > 0.68 ? 1 - shoulderK * ((v - 0.68) / 0.32) ** 2 : 1);
    } else {
      const u = clamp01((y - belt) / (roofY - belt));
      f = (1 - 0.055) * (1 - tumble * Math.pow(u, 1.25));
    }
    const zt = clamp01(Math.abs(z) / (L / 2));
    return f * (1 - planR * Math.pow(zt, 5));
  };
  const LB = new Bucket(); // lofted panels (already shaped: not sculpted again)
  const NZ = lod === 0 ? 56 : lod === 1 ? 30 : 14, NS = lod === 0 ? 8 : lod === 1 ? 5 : 3, NT = lod === 0 ? 8 : lod === 1 ? 5 : 3;
  {
    const g = loft({ shape: s, curveSeg: lod === 0 ? 24 : 12, zs: [zr, zf], n: NZ, side: NS, top: NT,
      halfW: (y, z) => (W / 2) * S(y, z), classify: () => 'paint' });
    for (const k in g) LB.parts[k] = [norm(g[k])];
  }
  // wheel-arch flares
  if (D1) for (const z of [zF, zR]) {
    if (r * 0.92 + ra + 0.06 > Math.min(z > 0 ? noseY + 0.15 : tailY, belt)) continue; // low noses: flare would stick out
    const fl = new THREE.TorusGeometry(ra + 0.02, t.offroad || t.rally || kit === 'sport' ? 0.06 : 0.035, 6, 18, Math.PI);
    b.add(t.offroad ? 'trim' : 'paint', fl, [W / 2 - 0.03, r * 0.92, z], [0, Math.PI / 2, 0], true);
  }
  // cargo / equipment box (trucks, ambulance, fire engine)
  if (t.box) {
    const bz0 = zr + 0.02, bz1 = t.box.front, bh = t.box.top - belt + 0.02;
    const boxW = W + 0.06;
    b.add(t.fire ? 'paint' : 'box', roundedBox(boxW, bh, bz1 - bz0, 0.06), [0, belt - 0.02 + bh / 2, (bz0 + bz1) / 2]);
    if (D1) {
      b.box('trim', boxW + 0.02, 0.08, bz1 - bz0 + 0.02, [0, belt + 0.02, (bz0 + bz1) / 2]); // rub rail
      b.box('trim', 0.04, bh - 0.1, 0.04, [0, belt + bh / 2, zr - 0.01]); // rear door split
    }
    if (D && t.fire) {
      // roll-up equipment lockers + ladder on the roof
      const nL = Math.max(2, Math.floor((bz1 - bz0) / 1.1));
      for (let i = 0; i < nL; i++) {
        const zc = bz0 + (i + 0.5) * (bz1 - bz0) / nL;
        b.box('chrome', 0.02, bh * 0.62, (bz1 - bz0) / nL - 0.12, [boxW / 2 + 0.005, belt + bh * 0.45, zc], null, true);
        for (let k = 1; k < 6; k++) b.box('trim', 0.025, 0.008, (bz1 - bz0) / nL - 0.14, [boxW / 2 + 0.012, belt + bh * 0.14 + k * bh * 0.105, zc], null, true);
      }
      for (const x of [0.35, -0.35]) b.box('chrome', 0.05, 0.05, L * 0.9, [x, t.box.top + 0.2, -0.2]);
      for (let i = 0; i < 18; i++) b.box('chrome', 0.7, 0.03, 0.03, [0, t.box.top + 0.2, -L * 0.42 + i * L * 0.05]);
      b.box('chrome', 0.05, 0.25, 0.05, [0.35, t.box.top + 0.08, zr + 0.5], null, true);
    }
    if (D && t.ambulance) {
      b.box('stripeR', 0.01, 0.22, bz1 - bz0 - 0.1, [boxW / 2 + 0.006, belt + bh * 0.42, (bz0 + bz1) / 2], null, true);
      b.box('stripeR', boxW - 0.1, 0.22, 0.01, [0, belt + bh * 0.42, zr - 0.015]);
    }
    if (D && t.step) b.box('glass', 0.02, 0.7, 0.5, [W / 2 - 0.02, belt + 0.55, zA - 0.75], null, true); // step-van side door window
  }

  // cabin glass
  const Wc = W - 2 * t.cabInset;
  const c = new THREE.Shape();
  c.moveTo(zA + 0.08, belt - 0.03);
  c.quadraticCurveTo(zA - (zA - zB) * 0.45, roofY - (roofY - belt) * 0.35, zB + 0.12, roofY - 0.025);
  c.quadraticCurveTo(zB, roofY, zB - 0.2, roofY);
  c.lineTo(zC + 0.18, roofY);
  c.quadraticCurveTo(zC, roofY, zC - 0.1, roofY - 0.04);
  c.quadraticCurveTo(zD + (zC - zD) * 0.4, belt + (roofY - belt) * 0.3, zD, belt - 0.02);
  c.lineTo(zA + 0.08, belt - 0.03);
  const zBp = (zB + zC) / 2 + 0.1;
  if (!t.convertible) {
    const sail = ['sedan', 'lux', 'coupe', 'gt', 'muscle', 'super'].includes(t.arch) && !t.bus;
    const g = loft({ shape: c, curveSeg: lod === 0 ? 20 : 10, zs: [zD, zA + 0.08], n: Math.round(NZ * 0.6), side: NS, top: NT,
      halfW: (y, z) => (Wc / 2) * S(y, z), capKey: 'glass',
      classify: (z, part, ia, ib, k) => {
        const leftSide = k < NS, rightSide = k >= NS + NT, top = !leftSide && !rightSide;
        const corner = k === NS || k === NS + NT - 1, drip = k === NS - 1 || k === NS + NT;
        if (top) {
          if (z <= zB + 0.02 && z >= zC - 0.02) return 'roof';
          if (corner && !t.bus) return 'paint';            // A / C pillars
          return 'glass';                                   // windshield / rear window
        }
        if (drip && !t.bus) return 'roof';                  // painted drip rail along the roof edge
        if (!t.bus && Math.abs(z - zBp) < 0.06) return 'trim'; // B pillar
        if (sail && z < zC + 0.1) return 'paint';           // sail panel / C pillar side
        if (t.van && !t.windows && z < zBp - 0.2) return 'paint'; // panel van: no rear side windows
        return 'glass';
      } });
    for (const k in g) (LB.parts[k] ||= []).push(norm(g[k]));
  }
  else {
    // windshield only + roll hoops
    const wl = Math.hypot(zA - zB, roofY - belt);
    b.box('glass', Wc - 0.1, 0.025, wl, [0, (belt + roofY) / 2, (zA + zB) / 2], [-Math.atan2(roofY - belt, zA - zB) + Math.PI, 0, 0]);
    b.box('chrome', Wc - 0.08, 0.04, 0.05, [0, roofY - 0.01, zB + 0.02]);
    for (const x of [0.38, -0.38]) b.add('chrome', new THREE.TorusGeometry(0.2, 0.03, 8, 16, Math.PI), [x, belt + 0.02, zC + 0.15], [0, Math.PI / 2, 0]);
    b.box('interior', Wc - 0.12, 0.05, zA - zD - 0.4, [0, belt - 0.04, (zA + zD) / 2 - 0.1]); // tonneau / door caps
  }

  // roof panel (painted, slightly proud)
  const rf = new THREE.Shape();
  rf.moveTo(zB + 0.08, roofY - 0.03);
  rf.quadraticCurveTo(zB - 0.02, roofY + 0.012, zB - 0.22, roofY + 0.012);
  rf.lineTo(zC + 0.2, roofY + 0.012);
  rf.quadraticCurveTo(zC + 0.02, roofY + 0.012, zC - 0.06, roofY - 0.03);
  rf.lineTo(zC - 0.04, roofY - 0.075);
  rf.lineTo(zB + 0.06, roofY - 0.075);
  // (roof panel is part of the lofted cabin)
  if (t.bus) {
    // window pillars along the whole side, doors, destination sign, roof pods
    const n = Math.floor((zB - zC) / 1.25);
    for (let i = 0; i <= n; i++) b.box('trim', 0.1, roofY - belt - 0.05, 0.1, [Wc / 2 - 0.03, (roofY + belt) / 2, zC + i * (zB - zC) / n], null, true);
    if (D1) {
      b.box('trim', 0.04, belt + 0.8, 1.2, [W / 2 + 0.003, (belt + 0.8) / 2 + 0.2, zA - 1.2]);           // front door (right side = -x? kerb side)
      b.box('trim', 0.04, belt + 0.8, 1.2, [-W / 2 - 0.003, (belt + 0.8) / 2 + 0.2, zA - 1.2]);
      b.box('trim', 0.04, belt + 0.8, 1.2, [-W / 2 - 0.003, (belt + 0.8) / 2 + 0.2, -0.6]);
      b.add('roof', roundedBox(Wc - 0.4, 0.3, 3.2, 0.1), [0, roofY + 0.15, -2.2]); // AC pod
      b.box('trim', W - 0.5, 0.28, 0.06, [0, roofY - 0.25, zf - 0.05]);
    }
  }


  // pillars
  const xp = Wc / 2 - 0.035;
  const pillar = (z1, y1, z2, y2, key, th = 0.085) => {
    const len = Math.hypot(z2 - z1, y2 - y1);
    const ang = Math.atan2(y2 - y1, z2 - z1);
    b.box(key, th, 0.05, len, [xp, (y1 + y2) / 2, (z1 + z2) / 2], [-ang, 0, 0], true);
  };
  if (t.convertible) pillar(zA + 0.04, belt, zB + 0.1, roofY - 0.03, 'paint', 0.09);  // windshield frame
  if (t.roofRails || t.van || t.offroad) {
    b.box('trim', 0.08, roofY - belt - 0.04, 0.14, [xp, (roofY + belt) / 2, (zBp + zC) / 2 - 0.1], null, true); // C (black)
  }
  if (t.van) {
    // sliding door rail (+ blanked cargo panels on panel vans)
    b.box('trim', 0.03, 0.03, 1.6, [W / 2 + 0.005, belt + 0.05, zBp - 1.0], null, true);
    if (t.windows) for (let z = zBp - 1.1; z > zC + 0.3; z -= 1.1) b.box('trim', 0.08, roofY - belt - 0.04, 0.1, [xp, (roofY + belt) / 2, z], null, true);
    b.box('trim', W - 0.2, 0.04, 0.04, [0, roofY - 0.3, zr - 0.01]);
  }
  // window chrome belt line
  b.box('chrome', 0.03, 0.025, zA - zD - 0.15, [Wc / 2 + 0.02, belt + 0.005, (zA + zD) / 2], null, true);

  // underbody / tub to close the arches
  b.box('under', W - 0.5, 0.3, L - 0.6, [0, yb + 0.15, 0]);
  // arch liners
  for (const z of [zF, zR]) b.box('under', W - 0.5, 0.05, ra * 2, [0, r + ra * 0.6, z]);

  // interior: dash, seats, wheel
  if (D) {
  b.box('interior', Wc - 0.1, 0.18, 0.4, [0, belt + 0.02, zA - 0.25]);
  b.box('interior', 0.18, 0.2, 0.7, [0, belt - 0.12, zA - 0.95]); // centre console
  b.box('chrome', 0.03, 0.12, 0.03, [0, belt + 0.0, zA - 0.75], [-0.3, 0, 0]); // gear lever
  b.add('trim', new THREE.SphereGeometry(0.035, 8, 6), [0, belt + 0.06, zA - 0.78]);
  const seatZ = zA - (t.coupe ? 1.15 : 1.25);
  const backH = Math.min(0.62, (roofY - belt) * 0.55 + 0.2);
  for (const x of [0.38]) {
    b.box('interior', 0.5, 0.12, 0.5, [x, belt - 0.15, seatZ], null, true);
    b.box('interior', 0.48, backH, 0.12, [x, belt - 0.18 + backH / 2, seatZ - 0.3], [-0.2, 0, 0], true);
  }
  if (!t.coupe) b.box('interior', Wc - 0.15, backH - 0.1, 0.14, [0, belt - 0.2 + backH / 2, seatZ - 1.05], [-0.15, 0, 0]);
  b.box('trim', 0.06, 0.06, 0.3, [0.38, belt + 0.05, zA - 0.38], [-0.6, 0, 0]); // steering column
  b.box('chrome', Wc - 0.4, 0.01, 0.01, [0, belt + 0.11, zA - 0.33]); // dash trim line
  b.box('under', 0.3, 0.08, 0.01, [0.38, belt + 0.15, zA - 0.3], [-0.3, 0, 0]); // gauge cluster
  for (const x of [0.38, -0.38]) b.add('interior', roundedBox(0.3, 0.16, 0.12, 0.05), [x, Math.min(belt + 0.38, roofY - 0.2), seatZ - 0.38], [-0.2, 0, 0]); // head rests
  }
  // wipers + antenna
  if (D1 && !t.convertible) {
    for (const x of [0.3, -0.26]) b.box('trim', 0.42, 0.012, 0.022, [x, belt + 0.035, zA - 0.04], [0, 0.12, 0.04]);
    if (!t.bus && !t.box) b.add('trim', new THREE.CylinderGeometry(0.003, 0.005, 0.3, 5), [-(Wc / 2 - 0.25), roofY + 0.13, zC + 0.15], [-0.35, 0, 0]);
  }

  // front: grille, intake, splitter, plate, headlight housings
  const big = !!t.bigGrille;
  const gw = big ? W * 0.55 : W * 0.42;
  b.box('trim', gw, big ? 0.26 : 0.13, 0.08, [0, noseY - 0.2, zf - 0.02]);
  b.box('chrome', gw + 0.04, 0.025, 0.09, [0, noseY - 0.2 + (big ? 0.14 : 0.075), zf - 0.02]);
  if (D1 && (!t.coupe || big)) {
    const gh = big ? 0.26 : 0.13, n = big ? 4 : 2;
    for (let i = 1; i <= n; i++) b.box('chrome', gw - 0.06, 0.012, 0.02, [0, noseY - 0.2 - gh / 2 + (gh * i) / (n + 1), zf + 0.025]);
    b.box('chrome', 0.012, gh - 0.02, 0.02, [0, noseY - 0.2, zf + 0.026]);
  }
  b.box('trim', W * 0.62, 0.1, 0.08, [0, yb + 0.12, zf - 0.0]);
  b.box('trim', W - 0.25, 0.04, 0.14, [0, yb + 0.02, zf - 0.08]);
  b.box('plate', 0.5, 0.11, 0.02, [0, yb + 0.26, zf + 0.03]);
  b.add('trim', roundedBox(0.48, 0.16, 0.2, 0.06), [W / 2 - 0.3, noseY - 0.09, zf - 0.11], [0.12, 0, 0], true);
  // rear: bumper, diffuser, plate, exhausts
  b.box('trim', W - 0.2, 0.14, 0.1, [0, yb + 0.1, zr + 0.03]);
  b.box('plate', 0.5, 0.11, 0.02, [0, tailY - 0.3, zr - 0.025]);
  const ex = new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12, 1, true);
  b.add('chrome', ex, [W / 2 - 0.45, yb + 0.1, zr - 0.02], [Math.PI / 2, 0, 0], t.coupe);
  b.add('trim', new THREE.CircleGeometry(0.04, 12), [W / 2 - 0.45, yb + 0.1, zr - 0.06], [0, Math.PI, 0], t.coupe);

  // sides: mirrors, handles, seams, skirts
  if (D1) {
  b.add('paint', roundedBox(0.16, 0.1, 0.07, 0.03), [W / 2 + 0.07, belt + 0.11, zA - 0.14], [0, 0.2, 0], true);
  b.box('trim', 0.1, 0.03, 0.04, [W / 2 - 0.02, belt + 0.07, zA - 0.12], null, true);
  b.box('mirror', 0.12, 0.07, 0.006, [W / 2 + 0.075, belt + 0.11, zA - 0.18], [0, 0.2, 0], true); // mirror glass
  b.box('chrome', 0.025, 0.025, 0.16, [W / 2 + 0.008, belt - 0.12, zBp + 0.15], null, true);
  if (!t.coupe) b.box('chrome', 0.025, 0.025, 0.16, [W / 2 + 0.008, belt - 0.12, zBp - 0.75], null, true);
  const seamH = belt - yb - 0.12;
  for (const z of t.coupe ? [zA - 0.02, zBp - 0.2] : [zA - 0.02, zBp - 0.03, zBp - 0.9]) {
    b.box('under', 0.012, seamH, 0.012, [W / 2 + 0.003, yb + 0.08 + seamH / 2, z], null, true);
  }
  b.box('trim', 0.06, 0.08, zF - zR - 2 * ra - 0.05, [W / 2 - 0.02, yb + 0.05, (zF + zR) / 2], null, true);
  }

  // shut lines: hood (cowl + sides), trunk / tailgate
  if (D) {
    const hy = (noseY + belt) / 2;
    const hoodL = zf - 0.25 - (zA + 0.05);
    const hoodAng = Math.atan2(belt - (noseY + 0.04), (zf - 0.25) - (zA + 0.05));
    if (!t.van) {
      b.box('under', W - 0.5, 0.008, 0.012, [0, belt + 0.004, zA + 0.08]);
      // hood side shut lines follow the actual hood surface
      for (let z = zA + 0.15; z < zf - 0.3; z += 0.12) {
        const lb = lowerB(z); if (!lb) continue;
        const lb2 = lowerB(z + 0.12) || lb;
        b.box('under', 0.012, 0.008, 0.125, [W / 2 - 0.2, lb[1] + 0.006, z + 0.06], [Math.atan2(lb[1] - lb2[1], 0.12), 0, 0], true);
      }
    }
    if (!t.bed && !t.van && !t.wedge) b.box('under', W - 0.45, 0.008, 0.012, [0, tailY + 0.004, zD - 0.06]);
    if (t.van || t.roofRails || t.arch === 'hatch' || t.arch === 'citycar') b.box('under', 0.012, (roofY - yb) * 0.75, 0.012, [W / 2 - 0.15, (roofY + yb) / 2, zr - 0.012], null, true);
  }
  // body kits
  if (D1 && kit === 'sport' && !t.wedge && !t.heavy && !t.bed) {
    b.box('trim', W - 0.2, 0.05, 0.18, [0, yb + 0.0, zf - 0.04]);                         // front lip
    b.box('trim', 0.05, 0.07, zF - zR - 2 * ra - 0.1, [W / 2 - 0.0, yb + 0.02, (zF + zR) / 2], null, true); // side skirts
    if (!t.wing) b.box('trim', W - 0.4, 0.025, 0.16, [0, tailY + 0.05, zr + 0.15], [0.12, 0, 0]); // lip spoiler
    for (let i = -2; i <= 2; i++) b.box('trim', 0.02, 0.1, 0.25, [i * 0.25, yb + 0.06, zr + 0.1]); // diffuser
  }
  if (D1 && kit === 'lux') {
    b.box('chrome', 0.015, 0.03, zF - zR - 2 * ra - 0.1, [W / 2 + 0.006, yb + 0.25, (zF + zR) / 2], null, true);
    b.box('chrome', W - 0.5, 0.025, 0.03, [0, yb + 0.3, zr - 0.015]);
  }
  if (t.chromeBumpers) {
    b.box('chrome', W + 0.04, 0.12, 0.12, [0, yb + 0.2, zf + 0.02]);
    b.box('chrome', W + 0.04, 0.12, 0.12, [0, yb + 0.2, zr - 0.02]);
  }
  if (t.rally) {
    for (const x of [W / 2 - 0.25, -(W / 2 - 0.25)]) b.box('trim', 0.25, 0.3, 0.01, [x, yb + 0.1, zR - ra - 0.06]); // mud flaps
    b.add('trim', roundedBox(0.4, 0.1, 0.5, 0.04), [0, roofY + 0.04, zB - 0.4]); // roof scoop
  }
  if (t.offroad) {
    b.add('tire', new THREE.CylinderGeometry(r * 0.95, r * 0.95, t.tw, 18), [0, (belt + roofY) / 2 - 0.05, zr - t.tw / 2 - 0.02], [Math.PI / 2, 0, 0]); // spare wheel
    b.box('trim', W - 0.1, 0.12, 0.16, [0, yb + 0.22, zf + 0.05]);  // steel bumper
    b.box('trim', W - 0.1, 0.12, 0.16, [0, yb + 0.22, zr - 0.05]);
    for (const x of [-0.45, 0, 0.45]) b.box('trim', 0.05, 0.05, zB - zC, [x, roofY + 0.12, (zB + zC) / 2]); // roof rack
    b.box('trim', 0.08, roofY - belt + 0.1, 0.1, [W / 2 - 0.05, (roofY + belt) / 2, zA - 0.05], null, false); // snorkel
  }
  if (t.pushBar) {
    b.box('trim', W * 0.55, 0.32, 0.06, [0, yb + 0.28, zf + 0.14]);
    for (const x of [0.3, -0.3]) b.box('trim', 0.06, 0.4, 0.2, [x, yb + 0.3, zf + 0.06]);
  }
  // type specific extras
  if (t.wing && !t.wedge) {
    b.box('trim', W - 0.25, 0.03, 0.22, [0, tailY + 0.1, zr + 0.25], [0.12, 0, 0]);
    b.box('trim', 0.05, 0.1, 0.12, [0.6, tailY + 0.04, zr + 0.25], null, true);
    // hood vents
    b.box('trim', 0.25, 0.015, 0.35, [0.35, (noseY + belt) / 2 + 0.06, (zf + zA) / 2], [-0.12, 0, 0], true);
  }
  if (t.wedge) {
    // big rear wing on swan-neck mounts
    b.add('trim', roundedBox(W - 0.1, 0.05, 0.36, 0.02), [0, tailY + 0.38, zr + 0.3], [0.1, 0, 0]);
    for (const x of [0.55, -0.55]) b.box('trim', 0.04, 0.4, 0.12, [x, tailY + 0.18, zr + 0.35], [0.25, 0, 0]);
    for (const x of [W / 2 - 0.06, -W / 2 + 0.06]) b.box('trim', 0.02, 0.24, 0.42, [x, tailY + 0.32, zr + 0.3]); // end plates
    // diffuser fins + rear grille mesh
    for (let i = -3; i <= 3; i++) b.box('trim', 0.02, 0.16, 0.45, [i * 0.22, yb + 0.08, zr + 0.2]);
    b.box('trim', W - 0.5, 0.14, 0.04, [0, tailY - 0.3, zr - 0.005]);
    for (let i = 0; i < 5; i++) b.box('chrome', W - 0.56, 0.008, 0.01, [0, tailY - 0.36 + i * 0.028, zr - 0.03]);
    // engine cover louvres
    for (let i = 0; i < 6; i++) b.box('trim', Wc - 0.3, 0.012, 0.05, [0, belt + 0.02 + i * 0.012, zC - 0.25 - i * 0.16], [0.18, 0, 0]);
    // front splitter + hood ducts
    b.box('trim', W - 0.1, 0.03, 0.25, [0, yb + 0.01, zf - 0.05]);
  }
  if (t.intakes) {
    // big side intakes behind the doors (scissor-door look: door cut line arcs up)
    b.add('trim', roundedBox(0.04, 0.26, 0.55, 0.05), [W / 2 + 0.0, belt - 0.22, zR + 0.75], null, true);
    for (let i = 0; i < 4; i++) b.box('chrome', 0.045, 0.008, 0.5, [W / 2 + 0.005, belt - 0.32 + i * 0.06, zR + 0.75], null, true);
    b.box('under', 0.012, 0.012, 0.9, [W / 2 + 0.004, belt + 0.02, zA - 0.5], [0.35, 0, 0], true);
  }
  if (t.hoodScoop) {
    const zs0 = (zf + zA) / 2 - 0.1, hy0 = (lowerB(zs0) || [0, (noseY + belt) / 2])[1];
    b.add('paint', roundedBox(0.55, 0.12, 0.7, 0.05), [0, hy0 + 0.05, zs0], [-0.06, 0, 0]);
    b.box('trim', 0.48, 0.07, 0.02, [0, hy0 + 0.07, zs0 + 0.35]);
    for (const x of [0.55, -0.55]) b.box('trim', 0.12, 0.016, 0.5, [x, hy0 + 0.012, zs0 + 0.1], [-0.08, 0, 0]); // hood vents
    b.box('trim', W - 0.3, 0.04, 0.18, [0, tailY + 0.03, zr + 0.18], [0.15, 0, 0]); // ducktail
  }
  if (t.lux) {
    b.box('chrome', 0.02, 0.04, zF - zR - 2 * ra - 0.1, [W / 2 + 0.008, yb + 0.22, (zF + zR) / 2], null, true); // rocker chrome
    b.box('chrome', W * 0.3, 0.05, 0.04, [0, noseY + 0.02, zf - 0.12]); // hood ornament bar
    b.box('chrome', W - 0.4, 0.03, 0.03, [0, tailY - 0.25, zr - 0.02]);
  }
  if (t.bed) {
    const bl = zD - zr;
    b.box('trim', 0.09, 0.06, bl - 0.05, [W / 2 - 0.08, tailY + 0.03, (zD + zr) / 2], null, true); // bed rails
    b.box('trim', W - 0.12, 0.05, 0.08, [0, tailY + 0.03, zr + 0.06]);
    b.box('trim', W - 0.2, 0.02, bl - 0.15, [0, tailY + 0.005, (zD + zr) / 2]); // tonneau cover
    b.box('under', W - 0.1, 0.012, 0.012, [0, tailY - 0.05, zr - 0.005]); // tailgate seam
    b.box('trim', W - 0.1, 0.2, 0.12, [0, yb + 0.12, zr - 0.02]); // step bumper
    b.box('chrome', W - 0.12, 0.05, 0.13, [0, yb + 0.24, zr - 0.02]);
    b.box('trim', 0.08, 0.05, zF - zR - 2 * ra, [W / 2 + 0.06, yb + 0.06, (zF + zR) / 2], null, true);
  }
  if (t.roofRails) {
    b.box('trim', 0.05, 0.05, zB - zC - 0.1, [Wc / 2 - 0.12, roofY + 0.04, (zB + zC) / 2], null, true);
    b.box('trim', W - 0.1, 0.06, 0.12, [0, yb + 0.2, zf + 0.06]);
    b.box('trim', 0.08, 0.05, zF - zR - 2 * ra, [W / 2 + 0.06, yb + 0.06, (zF + zR) / 2], null, true);
  }

  // lights (positions exported for light materials)
  const lights = new Bucket();
  lights.add('head', roundedBox(0.42, 0.11, 0.1, 0.045), [W / 2 - 0.3, noseY - 0.09, zf - 0.03], [0.12, 0, 0], true);
  lights.box('head', 0.12, 0.03, 0.03, [W / 2 - 0.62, noseY - 0.04, zf - 0.05], null, true); // DRL strip
  lights.box('drl', 0.4, 0.014, 0.02, [W / 2 - 0.3, noseY - 0.035, zf + 0.012], [0.12, 0, 0], true); // LED DRL line
  for (const dx of [-0.1, 0.06]) lights.add('lens', new THREE.CylinderGeometry(0.038, 0.038, 0.02, 14), [W / 2 - 0.3 + dx, noseY - 0.095, zf + 0.022], [Math.PI / 2 + 0.12, 0, 0], true); // projector lenses
  if (t.coupe) {
    lights.box('tail', W - 0.5, 0.03, 0.04, [0, tailY - 0.07, zr - 0.012]);
    lights.add('tail', roundedBox(0.36, 0.075, 0.07, 0.03), [W / 2 - 0.3, tailY - 0.09, zr + 0.0], null, true);
  } else {
    lights.add('tail', roundedBox(0.44, 0.13, 0.08, 0.035), [W / 2 - 0.28, tailY - 0.13, zr + 0.005], null, true);
  }
  // tail inner detail: LED segments over the lens
  for (let i = 0; i < 4; i++) lights.box('tailLed', 0.07, 0.012, 0.012, [W / 2 - 0.42 + i * 0.09, tailY - (t.coupe ? 0.09 : 0.11), zr - 0.04], null, true);
  lights.box('reverse', 0.1, 0.06, 0.05, [W / 2 - 0.58, tailY - (t.coupe ? 0.16 : 0.13), zr + 0.005], null, true);
  // side marker ambers
  lights.box('amber', 0.02, 0.04, 0.1, [W / 2 + 0.005, noseY - 0.1, zf - 0.38], null, true);
  // turn signals (left = +X side, right = -X side), front corners + rear corners
  for (const [key, sx] of [['blinkL', 1], ['blinkR', -1]]) {
    lights.box(key, 0.14, 0.05, 0.06, [sx * (W / 2 - 0.12), noseY - 0.17, zf - 0.07], [0.12, 0, 0]);
    lights.box(key, 0.12, 0.05, 0.05, [sx * (W / 2 - 0.2), tailY - (t.coupe ? 0.2 : 0.24), zr + 0.01]);
  }
  // fog lamps
  lights.add('fog', new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14), [W / 2 - 0.32, yb + 0.14, zf + 0.0], [Math.PI / 2, 0, 0], true);

  if (t.taxi) {
    b.box('trim', 0.7, 0.04, 0.3, [0, roofY + 0.03, (zB + zC) / 2]);
    lights.box('sign', 0.62, 0.2, 0.26, [0, roofY + 0.15, (zB + zC) / 2]);
  }
  if (t.police === 'bar' || t.police === 'ambulance' || t.police === 'fire') {
    const top = t.box ? t.box.top : roofY;
    const zb = t.box ? t.box.front - 0.2 : (zB + zC) / 2 + 0.1;
    const bw = Math.min(1.4, W - 0.4);
    b.box('trim', bw + 0.1, 0.06, 0.3, [0, top + 0.04, zb]);
    lights.box('red', bw / 2 - 0.05, 0.11, 0.24, [bw / 4 + 0.02, top + 0.12, zb]);
    lights.box('blue', bw / 2 - 0.05, 0.11, 0.24, [-bw / 4 - 0.02, top + 0.12, zb]);
    b.box('chrome', 0.06, 0.12, 0.25, [0, top + 0.12, zb]);
    if (t.box) { // rear corner beacons on boxes
      for (const x of [W / 2 - 0.12, -(W / 2 - 0.12)]) lights.box(x > 0 ? 'red' : 'blue', 0.12, 0.2, 0.12, [x, top - 0.1, zr + 0.02]);
    }
  }
  if (t.police) {
    lights.box('blue', 0.12, 0.05, 0.03, [0.25, noseY - 0.2, zf + 0.03]);
    lights.box('red', 0.12, 0.05, 0.03, [-0.25, noseY - 0.2, zf + 0.03]);
    if (t.police === 'hidden') { lights.box('red', 0.1, 0.03, 0.03, [0.2, belt + 0.12, zA - 0.25]); lights.box('blue', 0.1, 0.03, 0.03, [-0.2, belt + 0.12, zA - 0.25]); }
  }
  if (t.busLivery) lights.box('sign', W - 0.6, 0.22, 0.03, [0, roofY - 0.25, zf - 0.01]); // destination board
  const res = { body: b.merged(), lights: lights.merged() };
  // LOD trimming: fewer materials = fewer draw calls far away
  const keepBody = lod === 2 ? ['paint', 'glass', 'roof', 'box', 'trim'] : lod === 1 ? ['paint', 'glass', 'roof', 'box', 'trim', 'chrome', 'under', 'stripeR'] : null;
  const keepLights = lod === 2 ? ['head', 'tail'] : lod === 1 ? ['head', 'tail', 'blinkL', 'blinkR', 'red', 'blue', 'sign', 'tailLed'] : null;
  if (keepBody) for (const k of Object.keys(res.body)) if (!keepBody.includes(k)) delete res.body[k];
  if (keepLights) for (const k of Object.keys(res.lights)) if (!keepLights.includes(k)) delete res.lights[k];
  // sculpt details onto the same surfaces, then add the lofted panels
  for (const grp of [res.body, res.lights]) for (const k in grp) sculpt(grp[k], S);
  const lofted = LB.merged();
  for (const k in lofted) res.body[k] = res.body[k] ? mergeGeometries([res.body[k], lofted[k]], false) : lofted[k];
  // crown: hood, deck and roof bulge up toward the centre line (position-only => no cracks)
  const crownC = t.box || t.bus ? 0.012 : t.van ? 0.025 : t.wedge ? 0.05 : 0.04;
  const ymid = (yb + belt) / 2;
  for (const grp of [res.body, res.lights]) for (const k in grp) crown(grp[k], crownC, W, ymid, belt);
  bodyCache.set(ck, res);
  return res;
}

function roundedBox(w, h, d, r) {
  const sh = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  sh.moveTo(x0 + r, y0); sh.lineTo(x0 + w - r, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  sh.lineTo(x0 + w, y0 + h - r); sh.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  sh.lineTo(x0 + r, y0 + h); sh.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
  const bv = Math.min(r, d / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, d - 2 * bv), bevelEnabled: true, bevelSize: bv, bevelThickness: bv, bevelOffset: -bv, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * bv) / 2);
  return g;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function crown(g, c, W, ymid, belt) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const hw = W / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const h = clamp01((y - ymid) / Math.max(0.05, belt - ymid));
    if (h <= 0) continue;
    const u = Math.min(1, Math.abs(x) / hw);
    pos.setY(i, y + c * h * (1 - u * u));
    if (nor) {
      const fx = -c * h * 2 * x / (hw * hw);
      const nx = nor.getX(i) - fx * nor.getY(i), ny = nor.getY(i), nz = nor.getZ(i);
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(i, nx / l, ny / l, nz / l);
    }
  }
  pos.needsUpdate = true;
}
function sculpt(g, S) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const e = 0.01;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const s0 = S(y, z);
    const sy = (S(y + e, z) - S(y - e, z)) / (2 * e);
    const sz = (S(y, z + e) - S(y, z - e)) / (2 * e);
    pos.setX(i, x * s0);
    if (nor) {
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      let ax = nx / s0, ay = ny - (x * sy / s0) * nx, az = nz - (x * sz / s0) * nx;
      const l = Math.hypot(ax, ay, az) || 1;
      nor.setXYZ(i, ax / l, ay / l, az / l);
    }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  g.computeBoundingSphere();
}

// ---------------------------------------------------------------- wheels
const wheelCache = new Map();
function buildWheel(t, typeKey, spokesOverride) {
  const spokes = spokesOverride || t.spokes;
  const ck = t.r.toFixed(3) + '|' + t.tw.toFixed(3) + '|' + spokes;
  if (wheelCache.has(ck)) return wheelCache.get(ck);
  const { r, tw } = t;
  const ri = r * 0.68;
  // tire via lathe (axis Y -> rotate to X)
  const p = [];
  const sw = tw / 2;
  p.push(new THREE.Vector2(ri * 0.98, -sw * 0.85));
  p.push(new THREE.Vector2(r - 0.05, -sw));
  p.push(new THREE.Vector2(r - 0.012, -sw + 0.02));
  p.push(new THREE.Vector2(r, -sw + 0.05));
  p.push(new THREE.Vector2(r, sw - 0.05));
  p.push(new THREE.Vector2(r - 0.012, sw - 0.02));
  p.push(new THREE.Vector2(r - 0.05, sw));
  p.push(new THREE.Vector2(ri * 0.98, sw * 0.85));
  const tire = new THREE.LatheGeometry(p, 32);
  tire.rotateZ(Math.PI / 2);
  // tread grooves (slightly inset rings)
  const tb = new Bucket();
  tb.add('tire', tire);
  for (const x of [-sw * 0.35, sw * 0.35]) tb.add('tire', new THREE.TorusGeometry(r - 0.004, 0.008, 4, 32), [x, 0, 0], [0, Math.PI / 2, 0]);
  {
    // tread blocks
    const nb = 40, blk = new THREE.BoxGeometry(tw * 0.22, 0.008, 2 * Math.PI * r / nb * 0.45);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2;
      for (const x of [-sw * 0.62, 0, sw * 0.62]) {
        const g = blk.clone(); g.translate(x, r - 0.002, 0); g.rotateX(a + (x === 0 ? Math.PI / nb : 0)); tb.add('tire', g);
      }
    }
  }

  // rim (outer face at +x)
  const rb = new Bucket();
  const face = sw - 0.03;
  rb.add('rim', new THREE.CylinderGeometry(ri, ri, tw * 0.85, 28, 1, true), [0, 0, 0], [0, 0, Math.PI / 2]);
  rb.add('rim', new THREE.TorusGeometry(ri - 0.012, 0.018, 6, 28), [face, 0, 0], [0, Math.PI / 2, 0]);
  rb.add('rim', new THREE.CylinderGeometry(0.075, 0.09, 0.06, 16), [face - 0.02, 0, 0], [0, 0, Math.PI / 2]);
  const n = spokes;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const len = ri - 0.07;
    const g = new THREE.BoxGeometry(0.035, len, n > 6 ? 0.03 : 0.055);
    g.translate(0, 0.07 + len / 2, 0);
    g.rotateX(a);
    g.rotateY(0); // keep
    // slight concave dish
    g.translate(face - 0.03, 0, 0);
    rb.add('rim', g);
  }
  // sidewall lettering band + disc hat
  rb.add('disc', new THREE.TorusGeometry((r + ri) / 2 + 0.01, 0.005, 4, 40), [sw * 0.93, 0, 0], [0, Math.PI / 2, 0]);
  rb.add('disc', new THREE.CylinderGeometry(ri * 0.42, ri * 0.42, 0.05, 18), [face - 0.1, 0, 0], [0, 0, Math.PI / 2]);
  // inner dark barrel disc to hide the hollow
  rb.add('disc', new THREE.CircleGeometry(ri * 0.98, 24), [-sw * 0.3, 0, 0], [0, Math.PI / 2, 0]);
  const brake = new THREE.CylinderGeometry(ri * 0.82, ri * 0.82, 0.03, 24);
  brake.rotateZ(Math.PI / 2);
  rb.add('disc', brake, [face - 0.12, 0, 0]);

  const cal = new THREE.BoxGeometry(0.06, 0.16, 0.12);
  cal.translate(face - 0.1, ri * 0.62, 0);
  const lo = new THREE.LatheGeometry(p.filter((_, i) => i % 2 === 0 || i === p.length - 1), 14);
  lo.rotateZ(Math.PI / 2);
  const loDisc = new THREE.CircleGeometry(ri, 10); loDisc.rotateY(Math.PI / 2); loDisc.translate(sw * 0.6, 0, 0);
  const res = { tire: tb.merged().tire, tireLo: mergeGeometries([norm(lo), norm(loDisc)], false), rim: rb.merged(), caliper: norm(cal) };
  wheelCache.set(ck, res);
  return res;
}

// ---------------------------------------------------------------- assemble
/**
 * Build a car (3 LOD levels). Returns { root, shell, wheels[], lightMats{}, spec, paint, parts, slots, steeringWheel, info, lod }.
 * root is in physics body frame; shell is offset by -groundOffset so its ground = y 0.
 * opts: { kit, wheel: {spokes, rimColor}, blackRoof }
 */
export function buildCar(typeKey, color, opts = {}) {
  const t = CAR_TYPES[typeKey] || CAR_TYPES.sedan;
  const m = materials();
  const kit = opts.kit || t.kit || 'base';
  const root = new THREE.Group();
  const shell = new THREE.Group();
  root.add(shell);
  const paint = paintMat(color, t.taxi || t.heavy ? 0.25 : 0.55);
  const matFor = {
    paint, glass: m.glass, chrome: m.chrome, trim: m.trim, interior: m.interior, under: m.under, plate: plateMat(), mirror: m.chrome,
    tire: m.tire, box: paintMat(t.fire ? color : 0xf4f4f2, 0.2), stripeR: paintMat(0xc8141c, 0.2),
    roof: t.police === 'bar' && !t.box ? paintMat(0xf2f2f2, 0.3) : opts.blackRoof ? paintMat(0x0c0d0f, 0.4) : paint,
  };
  const lightMats = {
    head: new THREE.MeshStandardMaterial({ color: 0xdfe6ec, emissive: 0xfff2dc, emissiveIntensity: 0.4, metalness: 0.85, roughness: 0.06 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0606, emissive: 0xff1a0a, emissiveIntensity: 0.3, roughness: 0.25 }),
    reverse: new THREE.MeshStandardMaterial({ color: 0xbfbfbf, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x8a4a00, emissive: 0xff8a00, emissiveIntensity: 0.4, roughness: 0.3 }),
    drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 0, roughness: 0.2 }),
    lens: new THREE.MeshStandardMaterial({ color: 0xcfd8e0, emissive: 0xfff6e8, emissiveIntensity: 0, metalness: 0.9, roughness: 0.05 }),
    tailLed: new THREE.MeshStandardMaterial({ color: 0x700808, emissive: 0xff2010, emissiveIntensity: 0.3, roughness: 0.3 }),
    blinkL: new THREE.MeshStandardMaterial({ color: 0x8a5200, emissive: 0xff9000, emissiveIntensity: 0, roughness: 0.25 }),
    blinkR: new THREE.MeshStandardMaterial({ color: 0x8a5200, emissive: 0xff9000, emissiveIntensity: 0, roughness: 0.25 }),
    fog: new THREE.MeshStandardMaterial({ color: 0xd8dde0, emissive: 0xfff3d6, emissiveIntensity: 0, metalness: 0.6, roughness: 0.1 }),
    sign: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: t.busLivery ? 0xffb020 : 0xffe9a0, emissiveIntensity: 0.6, roughness: 0.4,
      map: t.busLivery ? busSignTex() : taxiSignTex(), emissiveMap: t.busLivery ? busSignTex() : taxiSignTex() }),
    red: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff0a0a, emissiveIntensity: 0.2, roughness: 0.3 }),
    blue: new THREE.MeshStandardMaterial({ color: t.police === 'ambulance' ? 0x404040 : 0x000a40, emissive: t.police === 'ambulance' ? 0xffffff : t.police === 'fire' ? 0xff2a0a : 0x1a3cff, emissiveIntensity: 0.2, roughness: 0.3 }),
  };
  const lod = new THREE.LOD();
  const slots = { paint: [], glass: [], roof: [] };
  const parts = {};
  const levels = [];
  for (const level of [0, 1, 2]) {
    const geo = buildBody(t, typeKey, kit, level);
    const g = new THREE.Group();
    for (const k in geo.body) {
      const mesh = new THREE.Mesh(geo.body[k], matFor[k] || m.trim);
      if (level === 0) parts[k] = mesh;
      if (slots[k]) slots[k].push(mesh);
      mesh.castShadow = level < 2 && (k === 'paint' || k === 'under' || k === 'roof' || k === 'box');
      mesh.receiveShadow = level === 0 && (k === 'paint' || k === 'trim');
      g.add(mesh);
    }
    for (const k in geo.lights) g.add(new THREE.Mesh(geo.lights[k], lightMats[k]));
    levels.push(g);
  }
  const big = t.heavy ? 2.2 : 1;
  lod.addLevel(levels[0], 0);
  lod.addLevel(levels[1], 38 * big);
  lod.addLevel(levels[2], 110 * big);
  shell.add(lod);
  const detail = levels[0], mid = levels[1];
  // decals
  if (t.taxi || t.police === 'bar') { addDecals(detail, t, t.taxi ? 'taxi' : 'police'); addDecals(mid, t, t.taxi ? 'taxi' : 'police'); }
  if (t.busLivery || t.ambulance || t.fire) { addDecals(detail, t, t.busLivery ? 'bus' : t.ambulance ? 'ambulance' : 'fire'); addDecals(mid, t, t.busLivery ? 'bus' : t.ambulance ? 'ambulance' : 'fire'); }
  // brand badges front + rear (made-up marques)
  const mdl = MODELS[typeKey];
  if (mdl) {
    const bm = badgeMat(mdl.brand);
    const bg = new THREE.PlaneGeometry(0.34, 0.085);
    const f = new THREE.Mesh(bg, bm); f.position.set(0, t.noseY - 0.2 + (t.bigGrille ? 0.2 : 0.12), t.L / 2 + 0.03); detail.add(f);
    const r = new THREE.Mesh(bg, bm); r.position.set(0, t.tailY - 0.2, -t.L / 2 - 0.04); r.rotation.y = Math.PI; detail.add(r);
  }
  // steering wheel (separate so it can turn)
  const sw = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 8, 20), m.trim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2), m.trim);
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.015), m.trim);
  const swInner = new THREE.Group(); // rotates about the column
  swInner.add(rim, hub, spoke);
  sw.add(swInner);
  sw.position.set(0.38, t.belt + 0.12, t.zA - 0.5);
  sw.rotation.x = t.bus || t.box ? -1.1 : -0.35;
  detail.add(sw);

  // wheels
  const wv = opts.wheel || {};
  const wg = buildWheel(t, typeKey, wv.spokes);
  const rmat = rimMat(wv.rimColor ?? t.rimColor);
  const cmat = caliperMat(t.caliper);
  const wheels = [];
  for (const [side, front] of [[1, true], [-1, true], [1, false], [-1, false]]) {
    const steer = new THREE.Group();
    const spin = new THREE.Group();
    steer.add(spin);
    const tire = new THREE.Mesh(wg.tire, m.tire); tire.castShadow = true;
    spin.add(tire);
    const tireLo = new THREE.Mesh(wg.tireLo, m.tire); tireLo.visible = false;
    spin.add(tireLo);
    const detailMeshes = [tire];
    for (const k in wg.rim) { const dm = new THREE.Mesh(wg.rim[k], k === 'rim' ? rmat : m.disc); spin.add(dm); detailMeshes.push(dm); }
    const cal = new THREE.Mesh(wg.caliper, cmat);
    steer.add(cal); detailMeshes.push(cal);
    if (side < 0) steer.scale.x = -1; // mirror so face is outward
    root.add(steer);
    wheels.push({ steer, spin, side, front, detail: detailMeshes, lo: tireLo, x: side * (t.W / 2 - t.tw / 2 - 0.03), z: front ? t.wb / 2 : -t.wb / 2 });
  }
  return { root, shell, wheels, lightMats, spec: t, paint, parts, slots, steeringWheel: swInner, info: MODELS[typeKey], lod, kit, hull: hullPoints(t, typeKey, kit) };
}

// convex hull point cloud (shell coords) from the coarse LOD body: paint + cabin + roof + box
const hullCache = new Map();
function hullPoints(t, typeKey, kit) {
  const ck = typeKey + '|' + kit;
  if (hullCache.has(ck)) return hullCache.get(ck);
  const geo = buildBody(t, typeKey, kit, 2).body;
  const out = [];
  const minY = t.yb + 0.06;
  for (const k of ['paint', 'glass', 'roof', 'box']) {
    const g = geo[k]; if (!g) continue;
    const a = g.attributes.position;
    const step = Math.max(1, Math.floor(a.count / 220));
    for (let i = 0; i < a.count; i += step) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      if (Math.abs(x) > t.W / 2 + 0.02 || Math.abs(z) > t.L / 2 + 0.05) continue; // mirrors / wings stay out of the hull
      out.push(x * 0.985, Math.max(minY, y), z);
    }
  }
  const res = new Float32Array(out);
  hullCache.set(ck, res);
  return res;
}

// made-up Calora plates, unique per car
// a small pool of made-up plates (canvas textures are not free to create per car)
const platePool = [];
function plateMat() {
  if (platePool.length >= 24) return platePool[(Math.random() * platePool.length) | 0];
  const m = makePlateMat(); platePool.push(m); return m;
}
// geometry build state: lets the game prebuild during loading and avoid cold builds in-game
export function isBuilt(key, kit = 'base') {
  const t = CAR_TYPES[key]; if (!t) return false;
  return bodyCache.has(key + '|' + kit + '|0') && bodyCache.has(key + '|' + kit + '|1') && bodyCache.has(key + '|' + kit + '|2');
}
export function wheelBuilt(key, spokes) {
  const t = CAR_TYPES[key]; if (!t) return false;
  return wheelCache.has(t.r.toFixed(3) + '|' + t.tw.toFixed(3) + '|' + (spokes || t.spokes));
}
export function prebuild(key, kit = 'base') {
  const t = CAR_TYPES[key]; if (!t) return;
  for (const l of [0, 1, 2]) buildBody(t, key, kit, l);
  hullPoints(t, key, kit);
  buildWheel(t, key);
}
function makePlateMat() {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ', d = () => (Math.random() * 10) | 0, l = () => L[(Math.random() * L.length) | 0];
  const code = `${d()}${l()}${l()}${l()} ${d()}${d()}${d()}`;
  const tex = textTexture(256, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#fbf6ea'); g.addColorStop(1, '#f0d9b0');
    c.fillStyle = g; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = '#1b3f73'; c.lineWidth = 6; c.strokeRect(5, 5, 246, 118);
    c.fillStyle = '#e0602a'; c.beginPath(); c.arc(128, 30, 14, Math.PI, 0); c.fill(); // little sunset
    c.fillStyle = '#1b3f73'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.fillText('CALORA', 128, 28);
    c.fillStyle = '#122a4c'; c.font = 'bold 50px monospace'; c.fillText(code, 128, 92);
    c.font = '13px sans-serif'; c.fillText('SUNSHINE COAST', 128, 116);
  });
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.25 });
}
const badgeCache = new Map();
function badgeMat(brand) {
  if (badgeCache.has(brand)) return badgeCache.get(brand);
  const tex = textTexture(256, 64, (c) => {
    c.clearRect(0, 0, 256, 64);
    const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.5, '#9aa2aa'); g.addColorStop(1, '#e8ecef');
    c.fillStyle = g; c.font = 'italic bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(brand.toUpperCase(), 128, 34);
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.9, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  badgeCache.set(brand, mat);
  return mat;
}
let _busTex = null;
function busSignTex() {
  return _busTex ||= textTexture(512, 64, (c) => {
    c.fillStyle = '#120a02'; c.fillRect(0, 0, 512, 64);
    c.fillStyle = '#ffb020'; c.font = 'bold 40px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('12  OCEAN DR - DOWNTOWN', 256, 34);
  });
}
let _signTex = null;
function taxiSignTex() {
  if (_signTex) return _signTex;
  _signTex = textTexture(256, 96, (c) => {
    c.fillStyle = '#fff6d0'; c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#1a1a1a'; c.font = 'bold 60px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('TAXI', 128, 52);
  });
  return _signTex;
}
const decalTex = {};
function addDecals(shell, t, typeKey) {
  if (!decalTex[typeKey]) {
    decalTex[typeKey] = textTexture(512, 128, (c) => {
      c.clearRect(0, 0, 512, 128);
      if (typeKey === 'taxi') {
        for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) {
          c.fillStyle = (i + j) % 2 ? '#111' : 'rgba(0,0,0,0)'; c.fillRect(i * 16, 90 + j * 16, 16, 16);
        }
        c.fillStyle = '#111'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center';
        c.fillText('SOLANA CAB', 256, 70);
      } else if (typeKey === 'bus') {
        c.fillStyle = '#0e8f9a'; c.fillRect(0, 70, 512, 24); c.fillStyle = '#ff7a2b'; c.fillRect(0, 96, 512, 10);
        c.fillStyle = '#0b2a3a'; c.font = 'bold 34px sans-serif'; c.textAlign = 'left'; c.fillText('SOLANA TRANSIT', 14, 50);
      } else if (typeKey === 'ambulance') {
        c.fillStyle = '#c8141c'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('AMBULANCE', 256, 50);
        c.fillRect(236, 82, 40, 40); c.fillStyle = '#fff'; c.fillRect(250, 86, 12, 32); c.fillRect(240, 96, 32, 12);
      } else if (typeKey === 'fire') {
        c.fillStyle = '#f2d14b'; c.fillRect(0, 96, 512, 14);
        c.fillStyle = '#f7f2e0'; c.font = 'bold 34px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('PORT SOLANA FIRE RESCUE', 256, 52, 490);
      } else {
        c.fillStyle = '#f2f4f7'; c.fillRect(0, 0, 512, 128);
        c.fillStyle = '#c9a227'; c.fillRect(0, 0, 512, 10); c.fillRect(0, 118, 512, 10);
        c.fillStyle = '#0b1a33'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('PSPD', 256, 52);
        c.font = 'bold 20px sans-serif'; c.fillText('PORT SOLANA POLICE', 256, 100);
      }
    });
  }
  const mat = new THREE.MeshStandardMaterial({
    map: decalTex[typeKey], transparent: true, roughness: 0.35, metalness: 0.1,
    polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false,
  });
  let len = t.wb - 2 * (t.r + 0.1) + 0.1, h = (t.belt - t.yb) * 0.62, y = t.yb + 0.08 + h / 2, zc = -0.1, xw = t.W / 2 + 0.006;
  if (t.box) { const bl = t.box.front + t.L / 2; len = bl * 0.85; h = len / 4; zc = (t.box.front - t.L / 2) / 2; y = t.belt + (t.box.top - t.belt) * 0.55; xw = (t.W + 0.06) / 2 + 0.008; }
  if (t.bus) { len = t.L * 0.8; h = len / 4; y = t.yb + 0.15 + h / 2; zc = 0; }
  const geo = new THREE.PlaneGeometry(len, h);
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(geo, mat);
    p.position.set(s * xw, y, zc);
    p.rotation.y = s * Math.PI / 2;
    shell.add(p);
  }
}
