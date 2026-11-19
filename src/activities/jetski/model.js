// Personal watercraft visual (code-built: there is no jet ski in Models/; see MODEL_REQUESTS_activities.md).
// Built in the boat frame of src/vehicles/boats.js: +Z bow, +X port, waterline y = 0, keel -0.22, length 3.2, beam 1.2.
// Lofted V hull with flare and a rub rail, footwell floor with a non-slip mat, one smooth deck body (pedestal, console and
// hood in one loft), a stepped two-up seat, handlebar with grips and mirrors, tinted visor, painted livery (made-up brand
// PICO, rental number). Returns a visual in the shape boats.js expects for b.visual ({ root, parts.wheel, anchors, mats })
// so the player seat solver poses the rider on it (centerline meshes the probe must skip are named '*prop*').
import * as THREE from 'three';

const L = 3.2;
const lerpT = (tab, x) => { // piecewise-linear table [[x, y], ...]
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [a, ya] = tab[i - 1], [b, yb] = tab[i]; const t = (x - a) / (b - a); const s = t * t * (3 - 2 * t); return ya + (yb - ya) * (0.35 * t + 0.65 * s); }
  return tab[tab.length - 1][1];
};
// hull plan / profile (t = 0 stern .. 1 bow)
const hw = (t) => (t < 0.5 ? 0.555 + 0.045 * Math.sin((t / 0.5) * Math.PI / 2) : Math.max(0.012, 0.6 * Math.pow(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2), 0.62)));
const keel = (t) => -0.22 + 0.36 * Math.pow(Math.max(0, (t - 0.55) / 0.45), 1.8);
const chine = (t) => -0.1 + 0.3 * Math.pow(Math.max(0, (t - 0.5) / 0.5), 1.6);
const gun = (t) => 0.31 + 0.1 * Math.pow(t, 2.2);
export const FLOOR_Y = 0.27;

function buildGeo(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// one hull side (sg = +1 port / -1 starboard): rings from the gunwale down to the keel; u along the length, v up the side
function hullSide(sg) {
  const N = 40, prof = [[1.0, 0], [1.012, -0.07], [0.985, -0.16], [0.93, -1], [0.62, -1.35], [0.0, -2]];
  const pos = [], uv = [], idx = [], R = prof.length;
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + t * L, w = hw(t), g = gun(t), c = chine(t), k = keel(t);
    for (let j = 0; j < R; j++) {
      const [fx, fy] = prof[j];
      const y = fy >= -0.16 ? g + fy : fy >= -1 ? lerpT([[-1, c], [-0.16, g - 0.16]], fy) : fy > -2 ? c + (k - c) * 0.42 : k;
      const x = sg * w * fx;
      pos.push(x, y, z);
      uv.push(sg > 0 ? 1 - t : t, (y - k) / Math.max(0.05, g - k));
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R - 1; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    if (sg > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  return buildGeo(pos, uv, idx);
}
// transom: the stern cap (a fan from the stern ring of both sides)
function transom() {
  const t = 0, w = hw(t), g = gun(t), c = chine(t), k = keel(t), z = -L / 2;
  const ring = [[w, g], [w * 1.012, g - 0.07], [w * 0.985, g - 0.16], [w * 0.93, c], [w * 0.62, c + (k - c) * 0.42], [0, k]];
  const pts = [...ring, ...ring.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
  const pos = [0, (g + k) / 2, z], uv = [0.5, 0.5], idx = [];
  for (const [x, y] of pts) { pos.push(x, y, z); uv.push(0.5 + x, (y - k) / (g - k)); }
  for (let i = 1; i < pts.length; i++) idx.push(0, i + 1, i);
  return buildGeo(pos, uv, idx);
}
// footwell floor: the hull plan at FLOOR_Y, inset 4 cm
function floor() {
  const sh = new THREE.Shape(), N = 30;
  for (let i = 0; i <= N; i++) { const t = i / N; const p = [hw(t) - 0.04, -L / 2 + 0.02 + t * (L - 0.08)]; if (i === 0) sh.moveTo(p[0], p[1]); else sh.lineTo(p[0], p[1]); }
  for (let i = N; i >= 0; i--) { const t = i / N; sh.lineTo(-(hw(t) - 0.04), -L / 2 + 0.02 + t * (L - 0.08)); }
  const g = new THREE.ShapeGeometry(sh, 2); g.rotateX(Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const t = (p.getZ(i) + L / 2) / L; p.setY(i, Math.min(FLOOR_Y, gun(t) - 0.04)); uv.setXY(i, p.getX(i) * 2.2, p.getZ(i) * 2.2); }
  g.computeVertexNormals(); return g;
}
// superellipse loft: sections centered on x = 0 from base y up over the top; open at the base
function loft(zs, W, TOP, BASE, n = 2.6, seg = 18, uScale = 1) {
  const pos = [], uv = [], idx = [], R = seg + 1;
  const Z = []; for (let i = 0; i < zs.length - 1; i++) for (let k = 0; k < 4; k++) Z.push(zs[i] + (zs[i + 1] - zs[i]) * k / 4); Z.push(zs[zs.length - 1]);
  const tabW = zs.map((z, i) => [z, W[i]]), tabT = zs.map((z, i) => [z, TOP[i]]), tabB = typeof BASE === 'number' ? null : zs.map((z, i) => [z, BASE[i]]);
  Z.forEach((z, i) => {
    const w = lerpT(tabW, z), top = lerpT(tabT, z), base = tabB ? lerpT(tabB, z) : BASE, h = Math.max(0.005, top - base);
    for (let j = 0; j <= seg; j++) {
      const a = Math.PI * (j / seg);   // 0 = port base, PI = starboard base
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n) * w, y = base + Math.pow(sa, 2 / n) * h;
      pos.push(x, y, z); uv.push(((z - zs[0]) / (zs[zs.length - 1] - zs[0])) * uScale, j / seg);
    }
  });
  for (let i = 0; i < Z.length - 1; i++) for (let j = 0; j < seg; j++) { const a = i * R + j, b = a + 1, c = a + R, d = c + 1; idx.push(a, b, c, b, d, c); }
  // end caps (fans)
  for (const [i, flip] of [[0, true], [Z.length - 1, false]]) {
    const c0 = pos.length / 3, z = Z[i];
    pos.push(0, (pos[(i * R) * 3 + 1] + pos[(i * R + seg / 2) * 3 + 1]) / 2, z); uv.push(0, 0.5);
    for (let j = 0; j < seg; j++) { const a = i * R + j, b = a + 1; if (flip) idx.push(c0, b, a); else idx.push(c0, a, b); }
  }
  return buildGeo(pos, uv, idx);
}
function tube(pts, r, closed = false, seg = 8) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(c, Math.max(8, pts.length * 6), r, seg, closed);
}

// ---------------------------------------------------------------- textures
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
function hullLivery(accent, num, owner) {
  return canvas(1024, 256, (g, w, h) => {
    g.fillStyle = '#f4f5f2'; g.fillRect(0, 0, w, h);
    // antifouling / dark lower hull below the chine line, a thin accent boot stripe above it
    g.fillStyle = '#26292e'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = hex(accent); g.fillRect(0, h * 0.58, w, h * 0.035);
    // sweeping graphic from the stern (u = 1 is the stern on this texture) up to the bow
    g.save(); g.beginPath(); g.moveTo(w, h * 0.55); g.bezierCurveTo(w * 0.7, h * 0.52, w * 0.45, h * 0.3, w * 0.12, h * 0.05); g.lineTo(w * 0.22, h * 0.05); g.bezierCurveTo(w * 0.5, h * 0.33, w * 0.72, h * 0.42, w, h * 0.42); g.closePath();
    g.fillStyle = hex(accent); g.fill(); g.restore();
    g.save(); g.beginPath(); g.moveTo(w, h * 0.38); g.bezierCurveTo(w * 0.74, h * 0.38, w * 0.55, h * 0.28, w * 0.3, h * 0.05); g.lineTo(w * 0.34, h * 0.05); g.bezierCurveTo(w * 0.58, h * 0.27, w * 0.76, h * 0.34, w, h * 0.34); g.closePath();
    g.fillStyle = '#16181c'; g.fill(); g.restore();
    // brand (made up) and the registration a rental fleet carries
    g.save(); g.translate(w * 0.68, h * 0.27); g.transform(1, 0, -0.25, 1, 0, 0);
    g.font = '900 58px "Archivo Black", Impact, sans-serif'; g.fillStyle = '#16181c'; g.textAlign = 'center'; g.fillText('PICO', 0, 0); g.restore();
    g.font = '700 30px Inter, Arial, sans-serif'; g.fillStyle = '#1f2a3a'; g.textAlign = 'left'; g.fillText('FL 4' + (100 + num * 37) + ' RT', w * 0.07, h * 0.48);
    if (owner) { g.font = '800 26px Inter, Arial, sans-serif'; g.fillStyle = hex(accent); g.fillText(owner.toUpperCase(), w * 0.42, h * 0.5); }
    // light grime toward the waterline
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(60,70,60,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, h * (0.5 + Math.random() * 0.12), 8 + Math.random() * 30, 2 + Math.random() * 4); }
  });
}
function bodyLivery(accent, num) {
  return canvas(1024, 256, (g, w, h) => {
    // v: 0 port base .. 1 starboard base (top = 0.5); u: 0 aft .. 1 bow
    g.fillStyle = hex(accent); g.fillRect(0, 0, w, h);
    const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0.28)'); sh.addColorStop(0.18, 'rgba(0,0,0,0)'); sh.addColorStop(0.82, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.28)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
    // black lower side panels and a white pinstripe
    g.fillStyle = '#17191d'; g.fillRect(0, 0, w, h * 0.1); g.fillRect(0, h * 0.9, w, h * 0.1);
    g.fillStyle = '#f4f5f2'; g.fillRect(w * 0.45, h * 0.115, w * 0.55, 4); g.fillRect(w * 0.45, h * 0.885 - 4, w * 0.55, 4);
    // rental number on both sides of the hood
    g.font = '900 44px "Archivo Black", Impact, sans-serif'; g.fillStyle = '#f4f5f2'; g.textAlign = 'center';
    const s = String(num).padStart(2, '0');
    g.textBaseline = 'middle'; g.save(); g.translate(w * 0.72, h * 0.28); g.scale(1, -1); g.fillText(s, 0, 0); g.restore();
    g.save(); g.translate(w * 0.72, h * 0.72); g.fillText(s, 0, 0); g.restore();
  });
}
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const seatTex = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#1c1d20'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
    g.fillStyle = '#4a4e55'; g.fillRect(0, h * 0.18, w, 6); g.fillRect(0, h * 0.82 - 6, w, 6);   // side piping
    g.strokeStyle = 'rgba(120,125,135,.5)'; g.setLineDash([4, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, h * 0.24); g.lineTo(w, h * 0.24); g.moveTo(0, h * 0.76); g.lineTo(w, h * 0.76); g.stroke();
  });
  seatTex.wrapS = seatTex.wrapT = THREE.RepeatWrapping;
  const matTex = canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#2c2f33'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3b3f45'; g.lineWidth = 3; for (let i = -w; i < w * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  });
  matTex.wrapS = matTex.wrapT = THREE.RepeatWrapping;
  SHARED = {
    seat: new THREE.MeshStandardMaterial({ name: 'jsSeat', map: seatTex, roughness: 0.62, metalness: 0 }),
    mat: new THREE.MeshStandardMaterial({ name: 'jsDeckMat', map: matTex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    black: new THREE.MeshStandardMaterial({ name: 'jsBlack', color: 0x15171a, roughness: 0.45, metalness: 0.1 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'jsRubber', color: 0x101113, roughness: 0.85 }),
    steel: new THREE.MeshStandardMaterial({ name: 'jsSteel', color: 0xb8bcc2, roughness: 0.25, metalness: 0.95 }),
    visor: new THREE.MeshPhysicalMaterial({ name: 'jsVisorGlass', color: 0x1b2430, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.55, clearcoat: 1 }),
    mirror: new THREE.MeshStandardMaterial({ name: 'jsMirror', color: 0x9aa6b4, roughness: 0.05, metalness: 1 }),
    lampOn: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d0, emissiveIntensity: 2.2 }),
    lampOff: new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.2 }),
    geo: { side: [hullSide(1), hullSide(-1)], transom: transom(), floor: floor() },
  };
  // the deck body: pedestal under the seat, console + steering neck, hood sloping to the bow
  SHARED.geo.body = loft([-1.34, -1.18, -0.6, 0.02, 0.24, 0.46, 0.78, 1.1, 1.38, 1.56],
    [0.2, 0.235, 0.245, 0.255, 0.33, 0.405, 0.42, 0.35, 0.2, 0.05],
    [0.43, 0.47, 0.49, 0.51, 0.63, 0.72, 0.665, 0.56, 0.46, 0.41], 0.22, 2.8, 22);
  SHARED.geo.seat = loft([-1.2, -1.08, -0.78, -0.55, -0.35, -0.1, 0.06, 0.16],
    [0.16, 0.2, 0.215, 0.215, 0.21, 0.205, 0.19, 0.13],
    [0.585, 0.65, 0.655, 0.63, 0.65, 0.665, 0.655, 0.6], [0.44, 0.47, 0.48, 0.49, 0.49, 0.5, 0.51, 0.52], 3.2, 18, 3);
  // rub rail along the gunwale outline
  const rail = []; for (let i = 0; i <= 30; i++) { const t = i / 30; rail.push([hw(t) + 0.012, gun(t), -L / 2 + t * L]); }
  for (let i = 29; i >= 1; i--) { const t = i / 30; rail.push([-(hw(t) + 0.012), gun(t), -L / 2 + t * L]); }
  SHARED.geo.rail = tube(rail, 0.03, true, 6);
  SHARED.geo.bar = tube([[0.27, 0.96, 0.5], [0.16, 0.985, 0.5], [0, 0.99, 0.48], [-0.16, 0.985, 0.5], [-0.27, 0.96, 0.5]], 0.014);
  SHARED.geo.grip = new THREE.CylinderGeometry(0.02, 0.02, 0.13, 10); SHARED.geo.grip.rotateZ(Math.PI / 2);
  SHARED.geo.neck = new THREE.CylinderGeometry(0.045, 0.06, 0.32, 12);
  SHARED.geo.mirror = new THREE.SphereGeometry(0.055, 12, 8); SHARED.geo.mirror.scale(1.3, 0.75, 0.35);
  SHARED.geo.stalk = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6);
  SHARED.geo.visor = new THREE.CylinderGeometry(0.42, 0.4, 0.17, 20, 1, true, -0.62, 1.24);
  SHARED.geo.lamp = new THREE.SphereGeometry(0.035, 10, 6);
  SHARED.geo.step = new THREE.BoxGeometry(0.5, 0.04, 0.16);
  SHARED.geo.nozzle = new THREE.CylinderGeometry(0.07, 0.085, 0.18, 14); SHARED.geo.nozzle.rotateX(Math.PI / 2);
  return SHARED;
}

const ACCENTS = [0xff5a1f, 0x2a8cff, 0xffc21a, 0x9be22d, 0xe8355d, 0x16b8a6];
/** build a jet ski visual. o: { accent, num, owner } */
export function buildJetSki(o = {}) {
  const S = shared(), G = S.geo;
  const accent = o.accent ?? ACCENTS[(o.num || 0) % ACCENTS.length];
  const root = new THREE.Group(); root.name = 'jetski-visual';
  const paint = new THREE.MeshPhysicalMaterial({ name: 'jsHullPaint', map: hullLivery(accent, o.num || 1, o.owner || ''), roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 });
  const bodyPaint = new THREE.MeshPhysicalMaterial({ name: 'jsBodyPaint', map: bodyLivery(accent, o.num || 1), roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
  const add = (geo, mat, name, cast = true) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast; m.receiveShadow = true; root.add(m); return m; };
  add(G.side[0], paint, 'js-hull-port'); add(G.side[1], paint, 'js-hull-stbd'); add(G.transom, S.black, 'js-transom');
  add(G.floor, S.mat, 'js-floor', false);
  add(G.rail, S.rubber, 'js-prop-rail');
  add(G.body, bodyPaint, 'js-prop-body');
  add(G.seat, S.seat, 'js-seat');
  // stern: boarding step, jet nozzle, tow eye
  const step = add(G.step, S.black, 'js-prop-step'); step.position.set(0, 0.18, -1.66);
  const noz = add(G.nozzle, S.black, 'js-prop-nozzle'); noz.position.set(0, -0.04, -1.62);
  // steering: neck, handlebar with grips and throttle, mirrors, visor; the whole assembly turns as 'wheel'
  const steer = new THREE.Group(); steer.name = 'js-prop-steer'; steer.position.set(0, 0, 0.44); root.add(steer);
  const sAdd = (geo, mat, name, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); m.castShadow = true; steer.add(m); return m; };
  const neck = sAdd(G.neck, S.black, 'js-prop-neck', 0, 0.82, 0.02); neck.rotation.x = -0.35;
  const bar = sAdd(G.bar, S.steel, 'js-prop-bar', 0, 0, -0.44);
  void bar;
  sAdd(G.grip, S.rubber, 'js-prop-gripL', 0.24, 0.965, 0.06); sAdd(G.grip, S.rubber, 'js-prop-gripR', -0.24, 0.965, 0.06);
  for (const sx of [1, -1]) { const st = sAdd(G.stalk, S.black, 'js-prop-stalk', sx * 0.3, 0.86, 0.18); st.rotation.z = sx * 0.6; sAdd(G.mirror, S.mirror, 'js-prop-mirror', sx * 0.36, 0.92, 0.2); }
  const vis = sAdd(G.visor, S.visor, 'js-glass-visor', 0, 0.74, -0.26); vis.rotation.x = -0.3;
  // bow nav lamp (lit at night by boats.js animateVisual via the mesh name)
  const lamp = add(G.lamp, S.lampOff, 'lamp', false); lamp.position.set(0, 0.47, 1.5);
  // the seat solver's handlebar anchor: wheel center (its rotation.z is set by boats.js from the steering)
  const wheel = new THREE.Object3D(); wheel.name = 'js-wheel'; wheel.position.set(0, 0.98, 0.56); root.add(wheel);
  return {
    root, parts: { wheel, steer }, anchors: { telltale: [], bilge: [] }, mats: { lampOn: S.lampOn, lampOff: S.lampOff },
    accent,
    dispose() { for (const m of [paint, bodyPaint]) { m.map?.dispose(); m.dispose(); } },
  };
}
