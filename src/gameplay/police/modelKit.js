// POLICE track: shared helpers for the procedural police models (textures drawn on canvas, lofted bodies, cached materials).
// Everything is original artwork generated in code. PSPD = Southline Police Department (navy, white, gold badge, teal accent).
import * as THREE from 'three';

export const PSPD = {
  navy: '#0b1a33',
  navyHex: 0x0b1a33,
  white: '#f2f2f0',
  gold: '#d8b04a',
  teal: '#2fe0d0',
  red: '#e02020',
  amber: '#ffb020',
};
const texCache = new Map(),
  matCache = new Map(),
  geoCache = new Map();

export function rng(seed = 1) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

export function canvasTex(key, w, h, draw, o = {}) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  texCache.set(key, t);
  return t;
}
// fine speckle + streak grain so nothing renders as a flat untextured color
export function grain(g, w, h, o = {}) {
  const r = rng(o.seed || 7),
    n = o.n ?? (w * h) / 22,
    a = o.a ?? 0.08;
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${(r() * a).toFixed(3)})`;
    g.fillRect(r() * w, r() * h, 1 + r() * (o.sx ?? 2), 1 + r() * (o.sy ?? 2));
  }
  if (o.streaks)
    for (let i = 0; i < o.streaks; i++) {
      g.fillStyle = `rgba(0,0,0,${(0.03 + r() * 0.07).toFixed(3)})`;
      const x = r() * w;
      g.fillRect(x, r() * h * 0.6, 1 + r() * 2, h * (0.2 + r() * 0.6));
    }
  if (o.scuffs)
    for (let i = 0; i < o.scuffs; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '20,20,20'},${(0.05 + r() * 0.12).toFixed(3)})`;
      g.lineWidth = 0.5 + r() * 1.5;
      g.beginPath();
      const x = r() * w,
        y = r() * h;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 14);
      g.stroke();
    }
}
export function surfaceTex(key, base, o = {}) {
  return canvasTex(
    'surf:' + key,
    o.size || 128,
    o.size || 128,
    (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      grain(g, w, h, o);
      if (o.after) o.after(g, w, h);
    },
    o,
  );
}
export function roughTex(key, level = 0.6, o = {}) {
  // grayscale roughness / bump detail
  return canvasTex(
    'rough:' + key,
    128,
    128,
    (g, w, h) => {
      const v = Math.round(level * 255);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, 0, w, h);
      grain(g, w, h, {
        a: o.a ?? 0.22,
        seed: o.seed || 3,
        streaks: o.streaks,
        scuffs: o.scuffs ?? 14,
      });
    },
    { srgb: false },
  );
}
// cached PBR material: albedo map with grain + roughness/bump detail
export function pbr(key, color, o = {}) {
  let m = matCache.get(key);
  if (m) return m;
  const rough = o.rough ?? 0.6;
  m = new THREE.MeshStandardMaterial({
    map:
      o.map ||
      surfaceTex(key, color, {
        seed: o.seed,
        a: o.grain ?? 0.07,
        streaks: o.streaks,
        scuffs: o.scuffs,
        size: o.size,
      }),
    roughnessMap: roughTex(key, 1, { a: 0.25, seed: (o.seed || 1) + 5, scuffs: o.scuffs ?? 10 }),
    roughness: rough,
    metalness: o.metal ?? 0,
    bumpMap: roughTex(key, 1, { a: 0.25, seed: (o.seed || 1) + 5 }),
    bumpScale: o.bump ?? 0.4,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    alphaTest: o.alphaTest ?? 0,
    emissive: new THREE.Color(o.emissive ?? 0x000000),
    emissiveIntensity: o.emissiveIntensity ?? 1,
  });
  if (o.repeat) {
    m.map = m.map.clone();
    m.map.repeat.set(o.repeat[0], o.repeat[1]);
    m.map.needsUpdate = true;
  }
  if (o.envMapIntensity != null) m.envMapIntensity = o.envMapIntensity;
  matCache.set(key, m);
  return m;
}
export function glow(key, hex, intensity = 2) {
  // small emissive lamp material (LEDs, lenses)
  let m = matCache.get('glow:' + key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: hex,
      emissiveIntensity: intensity,
      roughness: 0.3,
      map: surfaceTex('lamp', '#dddddd', { a: 0.05 }),
    });
    matCache.set('glow:' + key, m);
  }
  return m;
}
export const geo = (key, make) => {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
};
export function mesh(g, m, x = 0, y = 0, z = 0, o = {}) {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  if (o.rx) me.rotation.x = o.rx;
  if (o.ry) me.rotation.y = o.ry;
  if (o.rz) me.rotation.z = o.rz;
  if (o.s) me.scale.setScalar(o.s);
  if (o.sc) me.scale.set(o.sc[0], o.sc[1], o.sc[2]);
  me.castShadow = o.shadow !== false;
  me.receiveShadow = true;
  return me;
}
export const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const cyl = (rt, rb, h, seg = 14, open = false) =>
  geo(
    `c${rt},${rb},${h},${seg},${open}`,
    () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  );
export const sph = (r, ws = 14, hs = 10) =>
  geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));

// Lofted body: cross-sections (superellipses in the XY plane) joined along Z. u runs along the body, v around it starting at the bottom.
//   secs: [{ z, y = 0, rx, ry, e = 2 (2 = ellipse, higher = boxier), x = 0 }]   a0/a1: sweep in turns (0..1) for partial shells (canopies)
export function loft(secs, seg = 20, o = {}) {
  const a0 = o.a0 ?? 0,
    a1 = o.a1 ?? 1,
    n = secs.length,
    pos = [],
    uv = [],
    idx = [];
  const z0 = secs[0].z,
    z1 = secs[n - 1].z;
  for (let i = 0; i < n; i++) {
    const s = secs[i],
      e = s.e ?? 2;
    for (let j = 0; j <= seg; j++) {
      const tt = a0 + (a1 - a0) * (j / seg),
        a = -Math.PI / 2 + tt * Math.PI * 2;
      const c = Math.cos(a),
        sn = Math.sin(a);
      pos.push(
        (s.x || 0) + Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * s.rx,
        (s.y || 0) + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e) * s.ry,
        s.z,
      );
      uv.push((s.z - z0) / (z1 - z0 || 1), tt);
    }
  }
  const W = seg + 1;
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * W + j,
        b = a + 1,
        c = a + W,
        d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const cap = (i, flip) => {
    const s = secs[i],
      base = pos.length / 3;
    pos.push(s.x || 0, s.y || 0, s.z);
    uv.push((s.z - z0) / (z1 - z0 || 1), 0.5);
    for (let j = 0; j < seg; j++) {
      const a = i * W + j,
        b = a + 1;
      if (flip) idx.push(base, b, a);
      else idx.push(base, a, b);
    }
  };
  if (o.capStart) cap(0, true);
  if (o.capEnd) cap(n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// seven-point PSPD badge (our own design) drawn into a 2D context
export function drawBadge(g, cx, cy, r, o = {}) {
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + (i / 14) * Math.PI * 2,
      rr = i % 2 ? r * 0.62 : r;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = o.fill || PSPD.gold;
  g.fill();
  g.lineWidth = Math.max(1, r * 0.06);
  g.strokeStyle = o.stroke || '#7a5a14';
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.46, 0, Math.PI * 2);
  g.fillStyle = o.core || PSPD.navy;
  g.fill();
  g.strokeStyle = o.fill || PSPD.gold;
  g.lineWidth = Math.max(1, r * 0.05);
  g.stroke();
  // rising sun over a wave: the department mark
  g.beginPath();
  g.arc(0, r * 0.06, r * 0.2, Math.PI, 0);
  g.fillStyle = o.fill || PSPD.gold;
  g.fill();
  g.beginPath();
  g.moveTo(-r * 0.34, r * 0.16);
  g.quadraticCurveTo(-r * 0.17, r * 0.05, 0, r * 0.16);
  g.quadraticCurveTo(r * 0.17, r * 0.27, r * 0.34, r * 0.16);
  g.strokeStyle = PSPD.teal;
  g.lineWidth = Math.max(1, r * 0.06);
  g.stroke();
  g.restore();
}
export function hazardTex(key, a = '#f4c20d', b = '#16181c', o = {}) {
  return canvasTex(
    'haz:' + key,
    128,
    64,
    (g, w, h) => {
      g.fillStyle = a;
      g.fillRect(0, 0, w, h);
      g.fillStyle = b;
      for (let i = -2; i < 8; i++) {
        g.beginPath();
        g.moveTo(i * 32, h);
        g.lineTo(i * 32 + 16, h);
        g.lineTo(i * 32 + 16 + h, 0);
        g.lineTo(i * 32 + h, 0);
        g.fill();
      }
      grain(g, w, h, { a: 0.1, scuffs: 12, seed: 4 });
    },
    o,
  );
}
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isSprite && o.material?.map && o.userData.ownTex) {
      o.material.map.dispose();
      o.material.dispose();
    }
  });
}
export { THREE };
