// Car bodies v3: crisp, merged, low-draw-call traffic bodies built from a design sheet per archetype.
//
// Construction (shell space: ground y = 0, +Z forward, +X left, z = 0 mid-wheelbase):
//  * The TOP RING is the plan outline of the body's shoulder (the crease where the side meets the hood / deck): straight sides
//    with superellipse ends.  Everything else hangs off it.
//  * The WALL is a loft around the ring: every ring point carries a cross-section profile (9 rows from the underside tuck to
//    the shoulder) offset along the ring's plan normal; side, front-fascia and rear-fascia profiles blend around the corners, so
//    creases (sill, character line, shoulder, bumper lips) run continuously around the car.  Rows are split into smoothing bands,
//    which gives real feature lines instead of a soap-bar blob.  Wheel arches are cut from the wall with a flared lip.
//  * LIDS (hood, deck, roof) are height fields H(x, z) sampled on cross rows whose ends are exactly the ring points.
//  * The GREENHOUSE is a loft from a base loop (cowl line, belt, backlight base) to the roof loop; panes, pillars, frit bands
//    and the black window surrounds are assigned per quad on sample lines placed exactly on their edges.
//  * Details (lamp units with housing / reflector / projector / LED strip / clear lens, grilles with mesh, intakes, mirrors,
//    shut lines, handles, plate, badges, interior) are layered on the wall through its exact parametrization wallAt(s, y).
// Output per LOD: four merged geometries (paint, trim, glass, lamp) + anchors + hull points.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAT, LAMP, sheetUV } from './mats.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { if (Math.abs(b - a) < 1e-9) return x < a ? 0 : 1; const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mixv = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const SEAT_CH = 15;

// ---------------------------------------------------------------- materials (per-quad classes)
const M = (part, o = {}) => ({ part, ...o, key: part + '|' + JSON.stringify(o) });
const T = (c, rough, metal, pat = 0) => M('trim', { c, rm: [rough, metal], pat });
export const MAT = {
  paint: M('paint'),
  black: T([0.03, 0.031, 0.033], 0.6, 0), gloss: T([0.012, 0.012, 0.014], 0.12, 0), satinBlack: T([0.02, 0.02, 0.022], 0.35, 0.2),
  rubber: T([0.016, 0.016, 0.017], 0.88, 0), under: T([0.025, 0.024, 0.023], 0.95, 0), liner: T([0.02, 0.02, 0.021], 0.92, 0),
  chrome: T([0.95, 0.96, 0.98], 0.06, 1), alu: T([0.72, 0.74, 0.77], 0.3, 1), darkChrome: T([0.32, 0.34, 0.37], 0.14, 1),
  housing: T([0.05, 0.052, 0.056], 0.3, 0.7), reflector: T([0.82, 0.84, 0.87], 0.1, 1), cladding: T([0.045, 0.045, 0.047], 0.75, 0, 0),
  grilleHex: T([0.05, 0.05, 0.055], 0.35, 0.3, PAT.hex), grilleHexChrome: T([0.85, 0.86, 0.88], 0.12, 1, PAT.hex),
  grilleSlat: T([0.06, 0.06, 0.065], 0.3, 0.3, PAT.slats), grilleSlatChrome: T([0.62, 0.63, 0.66], 0.12, 1, PAT.slats),
  grilleSquare: T([0.05, 0.05, 0.055], 0.4, 0.3, PAT.square), vslatChrome: T([0.6, 0.61, 0.64], 0.12, 1, PAT.vslats),
  gap: T([0.035, 0.035, 0.036], 0.8, 0), wiper: T([0.02, 0.02, 0.02], 0.55, 0.1),
  dash: T([0.035, 0.035, 0.038], 0.7, 0), dashSoft: T([0.06, 0.058, 0.056], 0.85, 0), headliner: T([0.42, 0.4, 0.37], 0.95, 0), carpet: T([0.05, 0.05, 0.052], 0.98, 0),
  screen: T([0.01, 0.012, 0.015], 0.08, 0), tread: T([0.025, 0.025, 0.026], 0.85, 0, PAT.tread), box: T([0.92, 0.92, 0.9], 0.38, 0), boxRed: T([0.62, 0.05, 0.05], 0.3, 0.1),
  bedliner: T([0.03, 0.03, 0.032], 0.9, 0, PAT.square), exhaust: T([0.7, 0.71, 0.72], 0.25, 1), exhaustIn: T([0.02, 0.02, 0.02], 0.9, 0),
  // glass
  win: M('glass', { win: 1 }), lens: M('glass', { win: 0 }),
  // lamp sheet (per-car material)
  head: M('lamp', { lamp: LAMP.head, c: [0.86, 0.88, 0.9], rm: [0.12, 0.9] }), lensProj: M('lamp', { lamp: LAMP.lens, c: [0.06, 0.07, 0.09], rm: [0.04, 0.3] }),
  drl: M('lamp', { lamp: LAMP.drl, c: [0.82, 0.85, 0.9], rm: [0.25, 0] }), fog: M('lamp', { lamp: LAMP.fog, c: [0.75, 0.78, 0.8], rm: [0.1, 0.8] }),
  tail: M('lamp', { lamp: LAMP.tail, c: [0.36, 0.02, 0.02], rm: [0.18, 0] }), tailLed: M('lamp', { lamp: LAMP.tailLed, c: [0.62, 0.04, 0.03], rm: [0.25, 0] }),
  tailDark: M('lamp', { lamp: LAMP.tail, c: [0.12, 0.012, 0.012], rm: [0.15, 0] }),
  reverse: M('lamp', { lamp: LAMP.reverse, c: [0.8, 0.8, 0.82], rm: [0.15, 0.3] }),
  blinkL: M('lamp', { lamp: LAMP.blinkL, c: [0.72, 0.36, 0.04], rm: [0.2, 0], mirror: 'blinkR' }), blinkR: M('lamp', { lamp: LAMP.blinkR, c: [0.72, 0.36, 0.04], rm: [0.2, 0], mirror: 'blinkL' }),
  amber: M('lamp', { lamp: LAMP.amber, c: [0.7, 0.34, 0.03], rm: [0.2, 0] }),
  red: M('lamp', { lamp: LAMP.red, c: [0.5, 0.02, 0.02], rm: [0.2, 0] }), blue: M('lamp', { lamp: LAMP.blue, c: [0.03, 0.06, 0.5], rm: [0.2, 0] }),
  sign: M('lamp', { lamp: LAMP.sign, c: [1, 0.96, 0.82], rm: [0.4, 0] }),
  seat: M('lamp', { lamp: SEAT_CH, c: [1, 1, 1], rm: [0.75, 0] }), seatDark: M('lamp', { lamp: SEAT_CH, c: [0.55, 0.55, 0.55], rm: [0.8, 0] }),
  decal: M('lamp', { lamp: LAMP.none, c: [1, 1, 1], rm: [0.4, 0.1] }), plate: M('lamp', { lamp: LAMP.plate, c: [1, 1, 1], rm: [0.45, 0.2] }),
  badge: M('lamp', { lamp: LAMP.none, c: [1, 1, 1], rm: [0.18, 0.85] }),
  gauge: M('lamp', { lamp: LAMP.drl, c: [0.05, 0.08, 0.1], rm: [0.1, 0] }),
};
MAT.blinkL.mirrorMat = MAT.blinkR; MAT.blinkR.mirrorMat = MAT.blinkL;
const WHITE_UV = sheetUV('white', 0.5, 0.5);

// ---------------------------------------------------------------- merged geometry builder
class Buf { constructor() { this.pos = []; this.nor = []; this.col = []; this.rm = []; this.pat = []; this.lamp = []; this.win = []; this.uv = []; this.idx = []; } }
class GB {
  constructor() { this.B = { paint: new Buf(), trim: new Buf(), glass: new Buf(), lamp: new Buf() }; }
  v(m, p, n, uv) {
    const B = this.B[m.part], i = B.pos.length / 3;
    B.pos.push(p[0], p[1], p[2]); B.nor.push(n[0], n[1], n[2]);
    const c = m.c || [1, 1, 1]; B.col.push(c[0], c[1], c[2]);
    const rm = m.rm || [0.5, 0]; B.rm.push(rm[0], rm[1]);
    B.pat.push(m.pat || 0); B.lamp.push(m.lamp || 0); B.win.push(m.win ?? 1);
    const u = uv || (m.part === 'lamp' ? WHITE_UV : [0, 0]); B.uv.push(u[0], u[1]);
    return i;
  }
  tri(m, a, b, c) { this.B[m.part].idx.push(a, b, c); }
  // grid P[j][i] (rows j, cols i) of [x,y,z]; N same shape; cls(i, j) -> material for quad (i..i+1, j..j+1) or null
  grid(P, N, cls, o = {}) {
    const rows = P.length, cols = P[0].length, wrap = !!o.wrapU;
    N ||= gridNormals(P, wrap, o.hint);
    for (const mir of o.mirror ? [false, true] : [false]) {
      const cache = new Map();
      const vid = (m, j, i) => {
        const k = m.key + ':' + j + ':' + i;
        let id = cache.get(k);
        if (id === undefined) {
          let p = P[j][i], n = N[j][i];
          const of = (m.off || 0) + (o.off || 0);
          if (of) p = add(p, mul(n, of));
          if (mir) { p = [-p[0], p[1], p[2]]; n = [-n[0], n[1], n[2]]; }
          id = this.v(m, p, n, o.uv ? o.uv(i, j, mir) : null);
          cache.set(k, id);
        }
        return id;
      };
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < (wrap ? cols : cols - 1); i++) {
        let m = cls(i, j); if (!m) continue;
        if (mir && m.mirrorMat) m = m.mirrorMat;
        const i1 = (i + 1) % cols;
        const a = P[j][i], b = P[j][i1], c = P[j + 1][i], d = P[j + 1][i1];
        const gn = cross(sub(d, a), sub(c, b));
        const nn = add(add(N[j][i], N[j][i1]), add(N[j + 1][i], N[j + 1][i1]));
        let flip = dot(gn, nn) < 0; if (mir) flip = !flip;
        const A = vid(m, j, i), Bv = vid(m, j, i1), C = vid(m, j + 1, i), Dv = vid(m, j + 1, i1);
        const t1 = len(cross(sub(b, a), sub(d, a))) > 1e-10, t2 = len(cross(sub(d, a), sub(c, a))) > 1e-10;
        if (flip) { if (t1) this.tri(m, A, Dv, Bv); if (t2) this.tri(m, A, C, Dv); }
        else { if (t1) this.tri(m, A, Bv, Dv); if (t2) this.tri(m, A, Dv, C); }
      }
    }
  }
  // a THREE geometry with one material (optionally mirrored to -x as well)
  geo(g, m, o = {}) {
    if (o.mat4) g.applyMatrix4(o.mat4);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (const mir of o.mirror ? [false, true] : [false]) {
      const mm = mir && m.mirrorMat ? m.mirrorMat : m;
      const base = [];
      for (let i = 0; i < p.count; i++) {
        let P0 = [p.getX(i), p.getY(i), p.getZ(i)], N0 = n ? [n.getX(i), n.getY(i), n.getZ(i)] : [0, 1, 0];
        if (mir) { P0[0] = -P0[0]; N0[0] = -N0[0]; }
        base.push(this.v(mm, P0, N0, o.uvf ? o.uvf(uv ? [uv.getX(i), uv.getY(i)] : [0, 0]) : (o.keepUV && uv ? [uv.getX(i), uv.getY(i)] : null)));
      }
      const I = g.index ? Array.from(g.index.array) : base.map((_, i) => i);
      for (let k = 0; k < I.length; k += 3) { if (mir) this.tri(mm, base[I[k]], base[I[k + 2]], base[I[k + 1]]); else this.tri(mm, base[I[k]], base[I[k + 1]], base[I[k + 2]]); }
    }
    g.dispose();
  }
  quad(m, a, b, c, d, n, uvs) { // a b c d counter-clockwise seen from the normal side
    const i0 = this.v(m, a, n, uvs?.[0]), i1 = this.v(m, b, n, uvs?.[1]), i2 = this.v(m, c, n, uvs?.[2]), i3 = this.v(m, d, n, uvs?.[3]);
    this.tri(m, i0, i1, i2); this.tri(m, i0, i2, i3);
  }
  build() {
    const out = {};
    for (const k in this.B) {
      const B = this.B[k];
      if (!B.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      if (k === 'trim' || k === 'lamp') { g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(B.rm, 2)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2)); }
      if (k === 'trim') g.setAttribute('aPat', new THREE.Float32BufferAttribute(B.pat, 1));
      if (k === 'lamp') g.setAttribute('aLamp', new THREE.Float32BufferAttribute(B.lamp, 1));
      if (k === 'glass') g.setAttribute('aWin', new THREE.Float32BufferAttribute(B.win, 1));
      if (k === 'paint') g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      const n = B.pos.length / 3;
      g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      out[k] = g;
    }
    return out;
  }
}
// central-difference normals over a grid; consistent orientation chosen with hint(p) -> outward direction
function gridNormals(P, wrap, hint) {
  const rows = P.length, cols = P[0].length, N = [];
  let score = 0;
  for (let j = 0; j < rows; j++) {
    const row = [];
    for (let i = 0; i < cols; i++) {
      let n = null;
      for (const step of [1, 2, 3]) {
        const il = wrap ? (i - step + cols) % cols : Math.max(0, i - step), ir = wrap ? (i + step) % cols : Math.min(cols - 1, i + step);
        const jd = Math.max(0, j - step), ju = Math.min(rows - 1, j + step);
        const du = sub(P[j][ir], P[j][il]), dv = sub(P[ju][i], P[jd][i]);
        const c = cross(du, dv);
        if (len(c) > 1e-12) { n = norm(c); break; }
      }
      row.push(n || [0, 1, 0]);
      if (hint) score += dot(n || [0, 0, 0], hint(P[j][i]));
    }
    N.push(row);
  }
  if (hint && score < 0) for (const row of N) for (let i = 0; i < row.length; i++) row[i] = mul(row[i], -1);
  return N;
}

// ---------------------------------------------------------------- design sheet
export function familyOf(t) {
  return t.bus ? 'bus' : t.box ? 'box' : t.van ? 'van' : t.bed ? 'pickup' : t.offroad ? 'offroad' : t.arch === 'suv' ? 'suv' : t.wedge ? 'super'
    : t.arch === 'citycar' ? 'citycar' : t.arch === 'hatch' ? 'hatch' : t.arch === 'muscle' ? 'muscle' : t.arch === 'roadster' ? 'roadster'
      : t.arch === 'gt' || (t.arch === 'coupe') ? 'coupe' : t.arch === 'lux' ? 'lux' : 'sedan';
}
export function design(t) {
  const fam = familyOf(t), era = t.era ?? 1, hw = t.W / 2;
  const D = { fam, era, hw, L: t.L, zf: t.L / 2, zr: -t.L / 2, wb: t.wb, r: t.r, tw: t.tw, yb: t.yb, belt: t.belt, noseY: t.noseY, tailY: t.tailY, roofY: t.roofY,
    zA: t.zA, zB: t.zB, zC: t.zC, zD: t.zD, conv: !!t.convertible, t };
  // defaults: modern midsize sedan
  Object.assign(D, {
    noseOv: 0.17, tailOv: 0.13, aF: 0.42, pF: 2.5, aR: 0.36, pR: 2.8, sideIn: 0.07, taperF: 0.035, taperR: 0.03,
    shR: 0.05, charY: 0.17, sill: 0.11, ybF: t.yb + 0.04, ybR: t.yb + 0.06, hoodP: 2.2, deckP: 2.5, beltRise: 0.035, cowlDrop: 0.03,
    hoodCrown: 0.03, deckCrown: 0.025, roofCrown: 0.045, roofSag: 0.03, tumble: 0.24, aRf: 0.2, pRf: 2.6, aRr: 0.24, pRr: 2.6,
    glassBow: 0.022, archGap: 0.045, flare: 0.016, flareW: 0.09, bands: [1, 2, 5, 6], softShoulder: false,
    lamp: 'swept', tail: 'wrap', grille: 'hex', grilleW: 0.42, grilleH: 0.17, intake: true, cladding: false, chromeTrim: false,
    pillarB: 'gloss', pillarC: 'paint', panes: null, wrapR: false, wrapF: false, hoodRidge: era >= 2 ? 0.006 : 0,
  });
  const set = (o) => Object.assign(D, o);
  if (era === 0) set({ aF: 0.2, pF: 4, aR: 0.18, pR: 4.2, shR: 0.03, charY: 0.22, beltRise: 0, hoodCrown: 0.015, deckCrown: 0.012, roofCrown: 0.025, tumble: 0.17, aRf: 0.1, aRr: 0.12, pRf: 3.6, pRr: 3.6,
    glassBow: 0.01, lamp: 'rect', tail: 'rect', grille: 'slatsChrome', chromeTrim: true, flare: 0.006, bands: [1, 2, 5, 7], noseOv: 0.13, tailOv: 0.12, hoodRidge: 0, pillarB: 'black' });
  if (era === 1) set({ aF: 0.4, pF: 2.3, shR: 0.07, charY: 0.2, softShoulder: true, bands: [1, 2], lamp: 'round', tail: 'wrap', grille: 'slats', beltRise: 0.02 });
  switch (fam) {
    case 'citycar': set({ noseOv: 0.13, tailOv: 0.1, aF: 0.32, aR: 0.2, pR: 3.4, sideIn: 0.06, tumble: 0.16, aRf: 0.16, aRr: 0.12, pRr: 3.4, wrapR: true, roofCrown: 0.03, grilleW: 0.3, grilleH: 0.1, hoodCrown: 0.03 }); break;
    case 'hatch': set({ noseOv: 0.15, tailOv: 0.1, aF: 0.36, aR: 0.22, pR: 3.2, tumble: 0.19, aRf: 0.18, aRr: 0.14, pRr: 3.2, wrapR: true, grilleW: 0.34, grilleH: 0.12 }); break;
    case 'lux': set({ noseOv: 0.18, aF: 0.36, pF: 2.8, tumble: 0.25, grille: 'slatsChrome', grilleW: 0.48, grilleH: 0.24, chromeTrim: true, roofCrown: 0.05 }); break;
    case 'coupe': set({ noseOv: 0.14, aF: 0.5, pF: 2.2, tumble: 0.27, aRf: 0.22, aRr: 0.35, pRr: 2.2, sideIn: 0.08, flare: 0.026, archGap: 0.04, grilleW: 0.36, grilleH: 0.14, roofCrown: 0.05, pillarC: 'paint' }); break;
    case 'roadster': set({ noseOv: 0.13, aF: 0.5, pF: 2.1, tumble: 0.2, aRf: 0.2, aRr: 0.3, sideIn: 0.08, flare: 0.028, archGap: 0.04, grilleW: 0.3, grilleH: 0.12 }); break;
    case 'muscle': set({ noseOv: 0.12, tailOv: 0.12, aF: 0.18, pF: 3.6, aR: 0.2, pR: 3.6, tumble: 0.25, aRr: 0.3, sideIn: 0.06, shR: 0.04, flare: 0.03, archGap: 0.04, grille: 'hexWide', grilleW: 0.7, grilleH: 0.2,
      lamp: era === 0 ? 'rect' : 'quad', tail: 'bar', hoodCrown: 0.02, hoodRidge: 0.012, charY: 0.2, bands: [1, 2, 5, 6] }); break;
    case 'super': set({ noseOv: 0.08, tailOv: 0.1, aF: 0.62, pF: 2.0, aR: 0.4, pR: 2.4, sideIn: 0.1, taperF: 0.08, tumble: 0.3, aRf: 0.28, pRf: 2.2, aRr: 0.5, pRr: 2.0, flare: 0.04, flareW: 0.14, archGap: 0.035,
      hoodCrown: 0.02, roofCrown: 0.05, lamp: 'blade', tail: 'blade', grille: 'none', intake: 'super', shR: 0.03, charY: 0.15, cowlDrop: -0.03, ybF: t.yb + 0.0, ybR: t.yb + 0.05, glassBow: 0.04 }); break;
    case 'suv': set({ noseOv: 0.15, tailOv: 0.1, aF: 0.3, pF: 2.8, aR: 0.2, pR: 3.4, sideIn: 0.06, tumble: 0.16, aRf: 0.2, aRr: 0.12, pRr: 3.6, wrapR: true, cladding: true, flare: 0.022, archGap: 0.06,
      ybF: t.yb + 0.0, ybR: t.yb + 0.04, grille: era === 2 ? 'hexChrome' : 'slatsChrome', grilleW: 0.56, grilleH: 0.26, roofCrown: 0.025, roofSag: 0.01, hoodCrown: 0.025, sill: 0.14 }); break;
    case 'offroad': set({ noseOv: 0.12, tailOv: 0.08, aF: 0.14, pF: 5, aR: 0.12, pR: 5, sideIn: 0.035, tumble: 0.08, aRf: 0.08, aRr: 0.06, pRf: 4, pRr: 5, wrapR: true, cladding: true, flare: 0.05, flareW: 0.12, archGap: 0.09,
      shR: 0.025, charY: 0.25, ybF: t.yb - 0.04, ybR: t.yb, grille: 'vslats', grilleW: 0.5, grilleH: 0.24, lamp: 'round', roofCrown: 0.012, roofSag: 0, hoodCrown: 0.01, beltRise: 0, softShoulder: false, bands: [1, 2, 5, 6], glassBow: 0.005 }); break;
    case 'pickup': set({ noseOv: 0.12, tailOv: 0.07, aF: 0.16, pF: 4.2, aR: 0.08, pR: 6, sideIn: 0.045, tumble: 0.12, aRf: 0.12, aRr: 0.08, pRr: 4, flare: 0.03, archGap: 0.07, cladding: false,
      ybF: t.yb - 0.04, ybR: t.yb + 0.02, grille: 'slatsChrome', grilleW: 0.62, grilleH: 0.32, lamp: 'quad', tail: 'vertical', roofCrown: 0.02, roofSag: 0.005, hoodCrown: 0.02, beltRise: 0, sill: 0.13, glassBow: 0.008 }); break;
    case 'van': set({ noseOv: 0.13, tailOv: 0.06, aF: 0.3, pF: 2.6, aR: 0.1, pR: 5, sideIn: 0.04, tumble: 0.1, aRf: 0.3, pRf: 2.4, aRr: 0.08, pRr: 5, wrapR: true, flare: 0.012, archGap: 0.06,
      ybF: t.yb - 0.02, ybR: t.yb + 0.02, grille: 'slats', grilleW: 0.5, grilleH: 0.16, lamp: 'quad', tail: 'vertical', roofCrown: 0.02, roofSag: 0, hoodCrown: 0.04, hoodP: 1.6, beltRise: 0, sill: 0.08, glassBow: 0.01 }); break;
    case 'box': set({ noseOv: 0.1, tailOv: 0.04, aF: 0.14, pF: 4, aR: 0.06, pR: 6, sideIn: 0.03, tumble: 0.06, aRf: 0.12, pRf: 3.2, aRr: 0.04, pRr: 6, flare: 0.01, archGap: 0.06, ybF: t.yb - 0.05, ybR: t.yb,
      grille: 'slats', grilleW: 0.6, grilleH: 0.34, lamp: 'rect', tail: 'vertical', roofCrown: 0.01, roofSag: 0, hoodCrown: 0.03, beltRise: 0, glassBow: 0.006, hoodP: 1.5 }); break;
    case 'bus': set({ noseOv: 0.06, tailOv: 0.05, aF: 0.12, pF: 4.5, aR: 0.12, pR: 4.5, sideIn: 0.03, tumble: 0.04, aRf: 0.14, pRf: 4, aRr: 0.14, pRr: 4, wrapR: true, wrapF: true, flare: 0.006, archGap: 0.05,
      ybF: t.yb, ybR: t.yb, grille: 'none', intake: false, lamp: 'rect', tail: 'vertical', roofCrown: 0.03, roofSag: 0, hoodCrown: 0.01, beltRise: 0, sill: 0.06, glassBow: 0.004 }); break;
  }
  if (t.lux && fam !== 'lux') D.chromeTrim = true;
  if (t.bigGrille && (fam === 'sedan')) set({ grille: 'slatsChrome', grilleW: 0.5, grilleH: 0.22 });
  if (t.wedge && fam !== 'super') D.lamp = 'blade';
  if (fam === 'roadster' || t.convertible) D.conv = true;
  if (t.police || t.taxi) D.chromeTrim = false;
  // ends: the top ring sits noseOv / tailOv inside the bumpers
  D.topF = D.zf - D.noseOv; D.topR = D.zr + D.tailOv;
  // keep the wheel arches on the straight part of the ring (the plan corners start ahead of / behind them)
  { const Ra = t.r + D.archGap + 0.06; D.aF = Math.max(0.12, Math.min(D.aF, D.topF - (t.wb / 2 + Ra))); D.aR = Math.max(0.08, Math.min(D.aR, (-t.wb / 2 - Ra) - D.topR)); }
  D.zcF = D.topF - D.aF; D.zcR = D.topR + D.aR;
  D.Xm = hw - D.sideIn;
  // keep the cabin inside the straight part of the ring (or switch to a wrapped end)
  if (D.zD - D.topR < 0.32) D.wrapR = true;
  if (D.topF - D.zA < 0.2) D.wrapF = true;
  if (D.wrapR) D.zDg = Math.max(D.zcR, D.zD); else D.zDg = Math.max(D.zD, D.zcR + 0.02);
  if (D.wrapF) D.zAg = Math.min(D.zcF, D.zA); else D.zAg = Math.min(D.zA, D.zcF - 0.02);
  if (D.zAg - D.zDg < 0.6) D.zDg = D.zAg - 0.6;
  // roof plan
  D.Xr = D.Xm - D.tumble;
  const rf = Math.max(D.zB, D.zC + 0.4), rr = Math.min(D.zC, rf - 0.4);
  D.rTopF = rf; D.rTopR = rr;
  D.aRf = Math.min(D.aRf, (rf - rr) * 0.35); D.aRr = Math.min(D.aRr, (rf - rr) * 0.35);
  D.rcF = rf - D.aRf; D.rcR = rr + D.aRr;
  // wheels
  D.wx = hw - t.tw / 2 - 0.03; D.wzF = t.wb / 2; D.wzR = -t.wb / 2; D.Ra = t.r + D.archGap; D.wcy = t.r;
  D.bPillar = (t.zB + t.zC) / 2 + 0.1;
  return D;
}

// ---------------------------------------------------------------- shape functions
function Xside(D, z) { return D.Xm - D.taperF * sstep(D.zAg, D.zcF, z) - D.taperR * sstep(D.zDg, D.zcR, z); }
// shoulder (top ring) height along z
function ysh(D, z) {
  const beltA = D.belt + (D.wrapF ? 0 : -D.cowlDrop), beltD = D.belt + D.beltRise;
  if (z >= D.zA) {
    if (D.wrapF) return D.belt;
    const u = clamp((D.topF - z) / Math.max(0.05, D.topF - D.zA), 0, 1);
    return D.noseY + (beltA - D.noseY) * (1 - Math.pow(1 - u, D.hoodP));
  }
  if (z >= D.zD) { const u = (D.zA - z) / Math.max(0.05, D.zA - D.zD); return lerp(beltA, beltD, u); }
  const u = clamp((z - D.topR) / Math.max(0.05, D.zD - D.topR), 0, 1);
  if (D.wrapR) return lerp(D.tailY, beltD, Math.pow(u, 0.6));
  return D.tailY + (beltD - D.tailY) * (1 - Math.pow(1 - u, D.deckP));
}
function crownAt(D, z) { return z >= D.zA ? D.hoodCrown : z <= D.zD ? D.deckCrown : 0; }
// lid height field (hood and deck): crowned across, shoulder line at x = X(z)
function Hlid(D, x, z) {
  const X = Xside(D, z), u = clamp(Math.abs(x) / X, 0, 1.2);
  let y = ysh(D, z) + crownAt(D, z) * (1 - u * u);
  if (D.hoodRidge && z > D.zA) y += D.hoodRidge * Math.exp(-Math.pow((u - 0.42) / 0.12, 2)) * sstep(D.zA, D.zA + 0.3, z);
  return y;
}
function roofTop(D, z) { const m = (D.rTopF + D.rTopR) / 2, h = (D.rTopF - D.rTopR) / 2; return D.roofY - D.roofSag * Math.pow((z - m) / h, 2); }
function Hroof(D, x, z) { const u = clamp(Math.abs(x) / D.Xr, 0, 1.2); return roofTop(D, z) - D.roofCrown * u * u; }
// superellipse end of the ring: e in [0,1] (0 = joins the side, 1 = tip) -> [x, z]
function ringEnd(D, front, e) {
  const th = e * Math.PI / 2, a = front ? D.aF : D.aR, p = front ? D.pF : D.pR, zc = front ? D.zcF : D.zcR, X = Xside(D, zc);
  const c = Math.cos(th), s = Math.sin(th);
  return [X * Math.pow(Math.max(0, c), 2 / p), front ? zc + a * Math.pow(Math.max(0, s), 2 / p) : zc - a * Math.pow(Math.max(0, s), 2 / p)];
}
function roofEnd(D, front, e, byX) {
  const a = front ? D.aRf : D.aRr, p = front ? D.pRf : D.pRr, zc = front ? D.rcF : D.rcR, X = D.Xr;
  let x, f;
  if (byX) { x = X * (1 - e); f = Math.pow(Math.max(0, 1 - Math.pow(1 - e, p)), 1 / p); }
  else { const th = e * Math.PI / 2; x = X * Math.pow(Math.max(0, Math.cos(th)), 2 / p); f = Math.pow(Math.max(0, Math.sin(th)), 2 / p); }
  return [x, front ? zc + a * f : zc - a * f];
}

// side, front and rear wall profiles: rows 0..8 as { d (outward along the plan normal), y }
function profSide(D, z, y8) {
  const si = D.sideIn, yb = D.yb, h = y8 - yb;
  const yChar = y8 - Math.min(D.charY, h * 0.35);
  return [
    { d: -0.06, y: yb }, { d: si * 0.55, y: yb + 0.015 }, { d: si * 0.8, y: yb + Math.min(D.sill, h * 0.25) },
    { d: si * 0.9, y: yb + h * 0.26 }, { d: si * 0.955, y: yb + h * 0.5 }, { d: si, y: yChar },
    { d: si * 0.86, y: y8 - D.shR }, { d: si * 0.52, y: y8 - D.shR * 0.32 }, { d: 0, y: y8 },
  ];
}
function profEnd(D, front, y8) {
  const ov = front ? D.noseOv : D.tailOv, yb = front ? D.ybF : D.ybR, h = y8 - yb;
  const lip = front ? 0.05 : 0.035;
  return [
    { d: ov * 0.15, y: yb }, { d: ov * 0.72, y: yb + 0.012 }, { d: ov * 0.92, y: yb + Math.min(0.07, h * 0.12) },
    { d: ov, y: yb + h * 0.22 }, { d: ov * 0.97, y: yb + h * 0.4 }, { d: ov * 0.66, y: y8 - h * 0.42 },
    { d: lip, y: y8 - Math.min(0.065, h * 0.12) }, { d: lip * 0.5, y: y8 - 0.02 }, { d: 0, y: y8 },
  ];
}

// ---------------------------------------------------------------- quality per LOD
function quality(lod) {
  return lod === 0 ? { nE: 14, dz: 0.1, nArch: 22, E: [0, 0.04, 0.085, 0.18, 0.32, 0.48, 0.64, 0.8, 0.92, 1], rows: [0, 1, 2, 3, 4, 5, 6, 7, 8], tG: [0, 0.03, 0.06, 0.25, 0.5, 0.75, 0.86, 0.9, 0.95, 1], detail: 2 }
    : lod === 1 ? { nE: 7, dz: 0.28, nArch: 10, E: [0, 0.06, 0.3, 0.6, 1], rows: [0, 1, 2, 4, 5, 6, 8], tG: [0, 0.05, 0.5, 0.88, 1], detail: 1 }
      : { nE: 3, dz: 0.7, nArch: 5, E: [0, 0.5, 1], rows: [0, 2, 5, 8], tG: [0, 0.5, 1], detail: 0 };
}

// ---------------------------------------------------------------- ring
function buildRing(D, Q) {
  // side z samples (between the two superellipse ends)
  const z0 = D.zcR, z1 = D.zcF, must = [], soft = [];
  for (let z = z0; z <= z1 + 1e-6; z += (z1 - z0) / Math.max(1, Math.ceil((z1 - z0) / Q.dz))) soft.push(z);
  for (const zw of [D.wzF, D.wzR]) {
    for (let k = 0; k <= Q.nArch; k++) { const z = zw + D.Ra * Math.cos(Math.PI * k / Q.nArch); must.push(z); }
    must.push(zw - D.Ra - D.flareW, zw + D.Ra + D.flareW, zw - D.Ra - D.flareW * 0.4, zw + D.Ra + D.flareW * 0.4);
  }
  must.push(D.zDg, D.zAg);
  for (const p of panesOf(D)) must.push(p[0], p[1], p[0] + 0.035, p[1] - 0.035);
  const zs = [];
  const all = [...must.map((z) => [z, 1]), ...soft.map((z) => [z, 0])].filter(([z]) => z >= z0 - 1e-6 && z <= z1 + 1e-6).sort((a, b) => a[0] - b[0]);
  for (const [z, hard] of all) {
    const last = zs[zs.length - 1];
    if (last && z - last.z < (Q.detail ? 0.012 : 0.05)) { if (hard && !last.hard) { last.z = z; last.hard = 1; } continue; }
    zs.push({ z, hard });
  }
  if (zs[0].z > z0 + 1e-4) zs.unshift({ z: z0 }); if (zs[zs.length - 1].z < z1 - 1e-4) zs.push({ z: z1 });
  zs[0].z = z0; zs[zs.length - 1].z = z1;
  const pts = [];
  for (let k = Q.nE; k >= 1; k--) { const [x, z] = ringEnd(D, false, k / Q.nE); pts.push({ x, z, zone: 'R', e: k / Q.nE }); }
  for (const s of zs) pts.push({ x: Xside(D, s.z), z: s.z, zone: 'S' });
  for (let k = 1; k <= Q.nE; k++) { const [x, z] = ringEnd(D, true, k / Q.nE); pts.push({ x, z, zone: 'F', e: k / Q.nE }); }
  pts[0].x = 0; pts[pts.length - 1].x = 0;
  // plan normals, arc lengths, heights
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    pts[i].nx = tz; pts[i].nz = -tx;
    if (i === 0) { pts[i].nx = 0; pts[i].nz = -1; } if (i === pts.length - 1) { pts[i].nx = 0; pts[i].nz = 1; }
    pts[i].y8 = Hlid(D, pts[i].x, pts[i].z);
  }
  let s = 0; pts[pts.length - 1].sF = 0;
  for (let i = pts.length - 2; i >= 0; i--) { s += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); pts[i].sF = s; }
  s = 0; pts[0].sR = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].sR = s; }
  return pts;
}
function panesOf(D) {
  if (D.panes) return D.panes;
  const zA = D.zAg, zD = D.zDg, zBp = clamp(D.bPillar, zD + 0.5, zA - 0.5), f = D.fam, P = [];
  const bw = 0.045;
  if (D.conv) return (D.panes = []);
  if (f === 'coupe' || f === 'muscle' || f === 'super' || f === 'roadster' || (D.t.coupe && f !== 'hatch')) P.push([zD + (f === 'super' ? 0.42 : 0.3), zA]);
  else if (f === 'suv' || f === 'offroad') { const zC2 = Math.max(zD + 0.45, zBp - 0.95); P.push([zBp + bw, zA], [zC2 + bw, zBp - bw], [zD + 0.12, zC2 - bw]); }
  else if (f === 'van') {
    P.push([zA - Math.min(0.9, (zA - zD) * 0.3), zA]);
    if (D.t.windows) { const z1 = zA - 1.0; const n = Math.max(1, Math.round((z1 - zD - 0.2) / 1.0)); for (let i = 0; i < n; i++) { const a = zD + 0.18 + i * (z1 - zD - 0.2) / n; P.push([a + bw, a + (z1 - zD - 0.2) / n - bw]); } }
  } else if (f === 'box') P.push([zD + 0.12, zA]);
  else if (f === 'bus') { const z1 = zA - 1.1; const n = Math.max(2, Math.round((z1 - zD - 0.3) / 1.25)); for (let i = 0; i < n; i++) { const a = zD + 0.3 + i * (z1 - zD - 0.3) / n; P.push([a + 0.04, a + (z1 - zD - 0.3) / n - 0.04]); } P.push([zA - 1.0, zA]); }
  else if (f === 'pickup') P.push([zBp + bw, zA], [zD + 0.1, zBp - bw]);
  else P.push([zBp + bw, zA], [zD + (f === 'hatch' || f === 'citycar' ? 0.2 : 0.15), zBp - bw]);
  return (D.panes = P.filter((p) => p[1] - p[0] > 0.12));
}

// wall cross section at an (interpolated) ring point
function wallProfile(D, rp) {
  const w = sstep(0.15, 0.92, Math.abs(rp.nz));
  const S = profSide(D, rp.z, rp.y8), E = profEnd(D, rp.nz > 0, rp.y8);
  return S.map((s, k) => ({ d: lerp(s.d, E[k].d, w), y: lerp(s.y, E[k].y, w) }));
}
function wallPoint(rp, d, y) { return [rp.x + rp.nx * d, y, rp.z + rp.nz * d]; }
function archCut(D, p) {
  // returns the arch-cut y floor at this point (or -inf when not in an arch)
  for (const zw of [D.wzF, D.wzR]) { const dz = p[2] - zw; if (Math.abs(dz) < D.Ra && Math.abs(p[0]) > D.wx - D.tw) return D.wcy + Math.sqrt(D.Ra * D.Ra - dz * dz); }
  return -Infinity;
}
function flareAt(D, z, y) {
  let f = 0;
  for (const zw of [D.wzF, D.wzR]) { const r = Math.hypot(z - zw, y - D.wcy) - D.Ra; if (r > -0.01 && r < D.flareW) f = Math.max(f, Math.pow(1 - Math.max(0, r) / D.flareW, 2)); }
  return f * D.flare * (y > D.wcy - 0.05 ? 1 : sstep(D.wcy - 0.25, D.wcy - 0.05, y));
}
// interpolated ring point at fractional index
function ringAt(R, f) {
  const i = clamp(Math.floor(f), 0, R.length - 2), t = clamp(f - i, 0, 1), a = R[i], b = R[i + 1];
  const nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t), l = Math.hypot(nx, nz) || 1;
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), nx: nx / l, nz: nz / l, y8: lerp(a.y8, b.y8, t), sF: lerp(a.sF, b.sF, t), sR: lerp(a.sR, b.sR, t) };
}
function ringIndexAtS(R, s, front) {
  const key = front ? 'sF' : 'sR';
  if (front) { for (let i = R.length - 1; i > 0; i--) { if (R[i - 1][key] >= s) { const a = R[i - 1][key], b = R[i][key]; return i - 1 + (a - s) / Math.max(1e-6, a - b); } } return 0; }
  for (let i = 1; i < R.length; i++) if (R[i][key] >= s) { const a = R[i - 1][key], b = R[i][key]; return i - 1 + (s - a) / Math.max(1e-6, b - a); }
  return R.length - 1;
}
function ringIndexAtZ(R, z) {
  for (let i = 1; i < R.length; i++) if (R[i].z >= z && R[i - 1].z <= z) return i - 1 + (z - R[i - 1].z) / Math.max(1e-6, R[i].z - R[i - 1].z);
  return z < R[0].z ? 0 : R.length - 1;
}
// exact point on the (uncut) wall at fractional ring index f and height y -> { p, n }
function wallAtF(D, R, f, y) {
  const P = (ff, yy) => {
    const rp = ringAt(R, ff), pr = wallProfile(D, rp);
    let k = 0; while (k < 7 && pr[k + 1].y < yy) k++;
    const a = pr[k], b = pr[k + 1], t = clamp((yy - a.y) / Math.max(1e-5, b.y - a.y), 0, 1);
    return wallPoint(rp, lerp(a.d, b.d, t) + flareAt(D, rp.z, yy), yy);
  };
  const p = P(f, y), e = 0.02;
  const pu = sub(P(f + e, y), P(f - e, y)), pv = sub(P(f, y + 0.004), P(f, y - 0.004));
  let n = norm(cross(pu, pv));
  const out = [p[0], 0, p[2] - (D.zf + D.zr) / 2];
  if (dot(n, out) < 0) n = mul(n, -1);
  return { p, n };
}
// (s along the ring from the front or rear tip, signed: + left / - right) -> point on the wall
function wallAtS(D, R, front, s, y) {
  const f = ringIndexAtS(R, Math.abs(s), front), r = wallAtF(D, R, f, y);
  if (s < 0) { r.p[0] = -r.p[0]; r.n[0] = -r.n[0]; }
  return r;
}

// ---------------------------------------------------------------- patches laid on the wall
// a quad region in (s, y) on the front or rear fascia, bilinear between 4 corners [s, y] (inner-bottom, outer-bottom, outer-top, inner-top)
function fasciaPatch(gb, D, R, front, C, mat, o = {}) {
  const nu = o.nu ?? 8, nv = o.nv ?? 3, off = o.off ?? 0.004, P = [], N = [];
  for (let j = 0; j <= nv; j++) {
    const rp = [], rn = [];
    for (let i = 0; i <= nu; i++) {
      const a = i / nu, b = j / nv;
      let s = lerp(lerp(C[0][0], C[1][0], a), lerp(C[3][0], C[2][0], a), b);
      let y = lerp(lerp(C[0][1], C[1][1], a), lerp(C[3][1], C[2][1], a), b);
      if (o.round) { // round the corners: pull toward the center along the diagonal near corners
        const ca = Math.abs(a - 0.5) * 2, cb = Math.abs(b - 0.5) * 2, k = Math.max(0, Math.pow(Math.pow(ca, 6) + Math.pow(cb, 6), 1 / 6) - 1 + o.round) / o.round;
        if (k > 0 && ca > 1 - o.round && cb > 1 - o.round) { const sc = (C[0][0] + C[1][0] + C[2][0] + C[3][0]) / 4, yc = (C[0][1] + C[1][1] + C[2][1] + C[3][1]) / 4; s = lerp(s, sc, k * 0.12 * o.round * 4); y = lerp(y, yc, k * 0.25 * o.round * 4); }
      }
      const w = wallAtS(D, R, front, s, y);
      const bulge = o.bulge ? o.bulge * Math.sin(Math.PI * a) * Math.sin(Math.PI * b) : 0;
      rp.push(add(w.p, mul(w.n, off + bulge))); rn.push(w.n);
    }
    P.push(rp); N.push(rn);
  }
  gb.grid(P, o.flatN ? null : N, typeof mat === 'function' ? mat : () => mat, { mirror: !!o.mirror, uv: o.uv, hint: (p) => [p[0], 0, p[2]] });
  return { P, N };
}
// skirt between a patch outline at off0 and off1 (lamp bezel / grille frame wall)
function patchSkirt(gb, D, R, front, C, mat, off0, off1, o = {}) {
  const nu = o.nu ?? 8, nv = o.nv ?? 3, loop = [];
  for (let i = 0; i <= nu; i++) loop.push([i / nu, 0]);
  for (let j = 1; j <= nv; j++) loop.push([1, j / nv]);
  for (let i = nu - 1; i >= 0; i--) loop.push([i / nu, 1]);
  for (let j = nv - 1; j >= 1; j--) loop.push([0, j / nv]);
  const P = [[], []], N = [[], []];
  for (const [a, b] of loop) {
    const s = lerp(lerp(C[0][0], C[1][0], a), lerp(C[3][0], C[2][0], a), b), y = lerp(lerp(C[0][1], C[1][1], a), lerp(C[3][1], C[2][1], a), b);
    const w = wallAtS(D, R, front, s, y);
    P[0].push(add(w.p, mul(w.n, off0))); P[1].push(add(w.p, mul(w.n, off1))); N[0].push(w.n); N[1].push(w.n);
  }
  gb.grid(P, null, () => mat, { wrapU: true, mirror: !!o.mirror });
}
// a thin strip along a polyline of (f, y) wall coordinates (shut lines, trims)
function wallStrip(gb, D, R, pts, width, mat, o = {}) {
  const P = [[], []], N = [[], []];
  const W = pts.map(([f, y]) => wallAtF(D, R, f, y));
  for (let i = 0; i < W.length; i++) {
    const a = W[Math.max(0, i - 1)].p, b = W[Math.min(W.length - 1, i + 1)].p;
    const tng = norm(sub(b, a)), bn = norm(cross(W[i].n, tng));
    const p = add(W[i].p, mul(W[i].n, o.off ?? 0.0015));
    P[0].push(add(p, mul(bn, -width / 2))); P[1].push(add(p, mul(bn, width / 2))); N[0].push(W[i].n); N[1].push(W[i].n);
  }
  gb.grid(P, N, () => mat, { mirror: o.mirror !== false });
}
function disc(gb, center, n, r, mat, segs = 16, o = {}) {
  // flat disc facing n
  const up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], u = norm(cross(up, n)), v = cross(n, u);
  const c0 = gb.v(mat, center, n, o.uvc), ids = [];
  for (let k = 0; k <= segs; k++) { const a = k / segs * Math.PI * 2; ids.push(gb.v(mat, add(center, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r))), n, o.uvf ? o.uvf(Math.cos(a), Math.sin(a)) : null)); }
  for (let k = 0; k < segs; k++) gb.tri(mat, c0, ids[k], ids[k + 1]);
}
function ring(gb, center, n, r0, r1, mat, segs = 16, depth = 0) {
  const up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], u = norm(cross(up, n)), v = cross(n, u), P = [[], []], N = [[], []];
  for (let k = 0; k <= segs; k++) {
    const a = k / segs * Math.PI * 2, dir = add(mul(u, Math.cos(a)), mul(v, Math.sin(a)));
    P[0].push(add(center, add(mul(dir, r0), mul(n, -depth)))); P[1].push(add(center, mul(dir, r1)));
    const nn = depth ? norm(add(mul(dir, -1), mul(n, 0.3))) : n; N[0].push(nn); N[1].push(n);
  }
  gb.grid(P, N, () => mat, {});
}
const G = {
  box: (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz),
  rbox: (sx, sy, sz, r, seg = 2) => new RoundedBoxGeometry(sx, sy, sz, seg, Math.min(r, sx / 2.05, sy / 2.05, sz / 2.05)),
  cyl: (r0, r1, h, seg = 12, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open),
  sph: (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs),
};
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'))); g.translate(x, y, z); return g; };

// ---------------------------------------------------------------- main
const cache = new Map();
export function buildBodyGeo(t, key, kit = 'base', lod = 0) {
  const ck = key + '|' + kit + '|' + lod;
  if (cache.has(ck)) return cache.get(ck);
  const D = design(t), Q = quality(lod), gb = new GB();
  const sporty = kit === 'sport' || t.cls === 'super' || t.cls === 'sports';
  if (kit === 'lux') D.chromeTrim = true;
  const R = buildRing(D, Q), NR = R.length;
  const rows = Q.rows;

  // ---- WALL: full loop = left half (rear tip -> front tip) + mirrored right half back to the rear tip
  const loop = [...R.map((r) => r), ...R.slice(1, -1).reverse().map((r) => ({ ...r, x: -r.x, nx: -r.nx, mirror: true }))];
  const nL = loop.length;
  const Praw = rows.map(() => []), Pcut = rows.map(() => []);
  for (let i = 0; i < nL; i++) {
    const rp = loop[i], pr = wallProfile(D, rp);
    rows.forEach((k, j) => {
      const fl = flareAt(D, rp.z, pr[k].y);
      const p = wallPoint(rp, pr[k].d + fl, pr[k].y);
      Praw[j].push(p);
      // arch cut: raise into the arch outline
      const yc = Math.abs(rp.nx) > 0.45 ? archCut(D, p) : -Infinity;
      if (pr[k].y < yc) {
        let kk = 0; while (kk < 7 && pr[kk + 1].y < yc) kk++;
        const a = pr[kk], b = pr[kk + 1], tt = clamp((yc - a.y) / Math.max(1e-5, b.y - a.y), 0, 1);
        Pcut[j].push(wallPoint(rp, lerp(a.d, b.d, tt) + flareAt(D, rp.z, yc), yc));
      } else Pcut[j].push(p);
    });
  }
  // smoothing bands between crease rows
  const creases = [0, ...D.bands.filter((k) => rows.includes(k)).map((k) => rows.indexOf(k)), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const sillMat = D.cladding ? MAT.cladding : MAT.paint;
  const isCab = (z) => z > D.zDg + 0.02 && z < D.zAg - 0.02;
  for (let b = 0; b < creases.length - 1; b++) {
    const j0 = creases[b], j1 = creases[b + 1];
    const Pr = Praw.slice(j0, j1 + 1), Pc = Pcut.slice(j0, j1 + 1);
    const N = gridNormals(Pr, true, (p) => [p[0], 0, p[2] - (D.zf + D.zr) / 2]);
    gb.grid(Pc, N, (i, j) => {
      const k = rows[j0 + j], rp = loop[i];
      if (k === 0) return MAT.under;
      // lower cladding / black bumper corners on utility bodies
      const z = Pc[j][i][2], y = Pc[j][i][1];
      if (D.cladding && k < 3 && Math.abs(rp.nx) > 0.3) return MAT.cladding;
      if (D.cladding && flareAt(D, z, y) > D.flare * 0.55 && y < D.belt - 0.12 && Math.abs(rp.nx) > 0.5) return MAT.cladding;
      if ((D.fam === 'pickup' || D.fam === 'van' || D.fam === 'box' || D.fam === 'offroad') && k < 4 && Math.abs(rp.nz) > 0.5) return D.chromeTrim && D.fam === 'pickup' ? MAT.chrome : MAT.black;
      if (k === 1) return sillMat === MAT.paint && D.fam !== 'super' ? MAT.paint : sillMat;
      return MAT.paint;
    }, { wrapU: true });
  }

  // ---- LIDS (hood, deck) and the bed on pickups
  const U = Q.E.map((e) => 1 - e); // 1 .. 0
  const UU = [...U.map((u) => -u), ...U.slice(0, -1).reverse()]; // -1..0..1 (center once)
  const lidRows = (sel) => R.filter(sel).sort((a, b) => a.z - b.z);
  const lidGrid = (rowsR, H, mat, o = {}) => {
    const P = [], N = [];
    for (const r of rowsR) {
      const pr = [], nr = [];
      for (const u of UU) {
        const x = u * r.x, y = H(x, r.z);
        pr.push([x, y, r.z]);
        const e = 0.004, hx = (H(x + e, r.z) - H(x - e, r.z)) / (2 * e), hz = (H(x, r.z + e) - H(x, r.z - e)) / (2 * e);
        nr.push(norm([-hx, 1, -hz]));
      }
      P.push(pr); N.push(nr);
    }
    if (P.length > 1) gb.grid(P, N, typeof mat === 'function' ? mat : () => mat, o);
    return P;
  };
  if (!D.wrapF) lidGrid(lidRows((r) => r.z >= D.zAg - 1e-6), (x, z) => Hlid(D, x, z), MAT.paint);
  const bedFloor = D.yb + Math.max(0.36, D.r + 0.12);
  if (!D.wrapR && !t.bed) lidGrid(lidRows((r) => r.z <= D.zDg + 1e-6), (x, z) => Hlid(D, x, z), MAT.paint);
  if (t.bed && Q.detail >= 0) {
    // rail cap, inner walls, floor, front wall
    const rr = lidRows((r) => r.z <= D.zDg + 1e-6);
    const inner = (r, inset) => { const x = r.x - (r.nx * inset), z = r.z - r.nz * inset; return [x, z]; };
    const capP = [[], []], wallP = [[], []];
    for (const r of [...rr.slice().reverse().map((q) => ({ ...q, x: -q.x, nx: -q.nx })), ...rr.slice(1)]) {}
    const side = (sgn) => {
      const C0 = [], C1 = [], W0 = [], W1 = [];
      for (const r of rr) { const [x, z] = inner(r, 0.06); C0.push([sgn * r.x, r.y8, r.z]); C1.push([sgn * x, r.y8, z]); W0.push([sgn * x, r.y8, z]); W1.push([sgn * x, bedFloor, z]); }
      gb.grid([C0, C1], null, () => MAT.paint, { hint: () => [0, 1, 0] });
      gb.grid([W0, W1], null, () => MAT.bedliner, { hint: () => [-sgn, 0, 0] });
    };
    side(1); side(-1);
    // floor
    const FP = rr.map((r) => { const [x, z] = inner(r, 0.06); return UU.map((u) => [u * x, bedFloor, z]); });
    gb.grid(FP, null, () => MAT.bedliner, { hint: () => [0, 1, 0] });
    // front wall of the bed (back of the cab, below the rear window)
    const zf = rr[rr.length - 1].z, xf = rr[rr.length - 1].x - 0.06, yt = rr[rr.length - 1].y8;
    gb.quad(MAT.bedliner, [-xf, bedFloor, zf], [xf, bedFloor, zf], [xf, yt, zf], [-xf, yt, zf], [0, 0, -1]);
    gb.quad(MAT.paint, [-xf - 0.06, yt, zf + 0.0], [xf + 0.06, yt, zf + 0.0], [xf + 0.06, yt, zf + 0.04], [-xf - 0.06, yt, zf + 0.04], [0, 1, 0]);
  }

  // ---- GREENHOUSE
  const E = Q.E, tG = Q.tG;
  const baseLoop = [], roofLoop = [];
  const cab = R.filter((r) => r.zone === 'S' && r.z >= D.zDg - 1e-6 && r.z <= D.zAg + 1e-6);
  // base-z -> roof-z map
  const rS0 = D.rcR, rS1 = D.rcF;
  const ctrl = [[D.zDg, rS0], [D.zAg, rS1]];
  const zBpB = clamp(D.bPillar, D.zDg + 0.5, D.zAg - 0.5);
  if (!['coupe', 'muscle', 'super', 'roadster', 'box', 'bus', 'van'].includes(D.fam)) ctrl.push([zBpB, clamp(zBpB - 0.06, rS0 + 0.1, rS1 - 0.1)]);
  ctrl.sort((a, b) => a[0] - b[0]);
  const mapZ = (z) => { for (let i = 1; i < ctrl.length; i++) if (z <= ctrl[i][0]) return lerp(ctrl[i - 1][1], ctrl[i][1], (z - ctrl[i - 1][0]) / Math.max(1e-6, ctrl[i][0] - ctrl[i - 1][0])); return ctrl[ctrl.length - 1][1]; };
  // rear segment (center -> edge), side, front segment (edge -> center)
  const yRoof = (x, z) => Hroof(D, x, z);
  const rearB = [], rearR = [];
  for (let k = E.length - 1; k >= 1; k--) {
    const e = E[k];
    if (D.wrapR) { const [x, z] = ringEnd(D, false, e * (1 - 1e-9)); const rp = R[ringIndexAtSafe(R, x, z, false)]; rearB.push({ p: [x, Hlid(D, x, z), z], seg: 'R', e }); }
    else { const x = (1 - e) * Xside(D, D.zDg), z = D.zDg; rearB.push({ p: [x, Hlid(D, x, z), z], seg: 'R', e }); }
    const [xr, zr] = roofEnd(D, false, e, !D.wrapR); rearR.push({ p: [xr, yRoof(xr, zr), zr] });
  }
  baseLoop.push(...rearB); roofLoop.push(...rearR);
  for (const r of cab) { baseLoop.push({ p: [r.x, r.y8, r.z], seg: 'S', z: r.z }); const zr = mapZ(r.z); roofLoop.push({ p: [D.Xr, yRoof(D.Xr, zr), zr] }); }
  for (let k = 1; k < E.length; k++) {
    const e = E[k];
    if (D.wrapF) { const [x, z] = ringEnd(D, true, e); baseLoop.push({ p: [x, Hlid(D, x, z), z], seg: 'F', e }); }
    else { const x = (1 - e) * Xside(D, D.zAg), z = D.zAg; baseLoop.push({ p: [x, Hlid(D, x, z), z], seg: 'F', e }); }
    const [xr, zr] = roofEnd(D, true, e, !D.wrapF); roofLoop.push({ p: [xr, yRoof(xr, zr), zr] });
  }
  // the wrapped ends start where the cab side ends: make the e=0 samples coincide with the cab end samples
  // full loop with mirrored right half
  const gLoopB = [...baseLoop, ...baseLoop.slice(1, -1).reverse().map((q) => ({ ...q, p: [-q.p[0], q.p[1], q.p[2]], mir: true }))];
  const gLoopR = [...roofLoop, ...roofLoop.slice(1, -1).reverse().map((q) => ({ p: [-q.p[0], q.p[1], q.p[2]] }))];
  const nG = gLoopB.length;
  const conv = D.conv, tTop = conv ? 0.55 : 1;
  const GP = tG.filter((t0) => t0 <= tTop + 1e-6).map((tt) => gLoopB.map((b, i) => {
    const r = gLoopR[i].p, bp = b.p;
    let p = mixv(bp, r, tt);
    if (conv && tt === tG.filter((t0) => t0 <= tTop + 1e-6).slice(-1)[0]) p = mixv(bp, r, tTop);
    // bulge outward along the horizontal outward direction
    const out = norm([lerp(bp[0], r[0], 0.5), 0, b.seg === 'S' ? 0 : (b.seg === 'F' ? 1 : -1) * (Math.abs(bp[0]) < 0.05 ? 1 : 0.6)]);
    const bow = (b.seg === 'S' ? D.glassBow : D.glassBow * 1.4) * 4 * tt * (1 - tt);
    return add(p, mul(out, bow));
  }));
  // classify greenhouse quads
  const panes = panesOf(D);
  const paneAt = (z) => panes.findIndex((p) => z >= p[0] - 1e-4 && z <= p[1] + 1e-4);
  const frameW = 0.035;
  const pillarMat = (which) => (which === 'paint' ? MAT.paint : which === 'gloss' ? MAT.gloss : MAT.black);
  const winGlassRowsR = D.wrapR ? [0.18, 0.86] : [0.06, 0.86];
  const gCls = (i, j) => {
    const t0 = GP.length > 1 ? tG[j] : 0, t1 = tG[j + 1];
    const tm = (t0 + t1) / 2;
    const a = gLoopB[i], b = gLoopB[(i + 1) % nG];
    if (Q.detail === 0) return tm < 0.06 ? MAT.black : tm > 0.88 ? MAT.paint : (a.seg === 'S' && b.seg === 'S' && paneAt((a.z + b.z) / 2) < 0 ? pillarMat(D.pillarB === 'gloss' ? 'gloss' : D.pillarC) : MAT.gloss);
    if (a.seg !== 'S' || b.seg !== 'S') {
      // windshield (F) / backlight (R): e is 0 at the pillar edge
      const seg = a.seg === 'S' ? b.seg : a.seg;
      const ea = a.seg === 'S' ? 0 : a.e, eb = b.seg === 'S' ? 0 : b.e, em = Math.min(ea, eb);
      const front = seg === 'F';
      const [g0, g1] = front ? [0.06, conv ? 0.97 : 0.88] : winGlassRowsR;
      const pillar = em < (Q.detail > 1 ? 0.04 : 0.06) - 1e-6;
      if (pillar) return front ? (D.pillarA === 'black' ? MAT.gloss : MAT.paint) : pillarMat(D.wrapR && D.fam !== 'van' && D.fam !== 'bus' ? (D.era >= 2 ? 'gloss' : 'paint') : D.pillarC);
      if (front && tm < 0.03) return MAT.black;                                    // cowl panel
      if (tm < g0 || tm > g1) return front || !D.wrapR ? (tm > g1 && tm > 0.9 ? MAT.paint : MAT.gloss) : (tm < g0 ? (tm < g0 - 0.03 ? MAT.paint : MAT.gloss) : MAT.paint);
      if (em < 0.085 - 1e-6 && Q.detail > 1) return MAT.gloss;                     // frit band
      if ((t.van && !t.windows && !front) || (t.box && !front)) return MAT.paint;
      return MAT.win;
    }
    const zm = (a.z + b.z) / 2, pi = paneAt(zm);
    if (tm < 0.03) return D.chromeTrim ? MAT.chrome : MAT.black;                 // belt molding
    if (tm > 0.9) return MAT.paint;                                               // roof rail
    if (pi < 0) {
      // pillar: B between front panes, C / D at the rear
      const behind = panes.every((p) => zm < p[0]);
      return behind ? pillarMat(D.pillarC) : pillarMat(D.pillarB);
    }
    const p = panes[pi];
    if (tm < 0.06 || tm > 0.86) return D.chromeTrim && tm > 0.86 ? MAT.chrome : MAT.gloss;
    if (zm < p[0] + frameW || zm > p[1] - frameW) return MAT.gloss;
    return MAT.win;
  };
  if (!(t.box && false)) {
    // split into bands: belt molding | glass | rail (normals per band so the molding and rail read as separate parts)
    const bandEdges = [0, ...[0.06, 0.88].map((v) => tG.indexOf(tG.reduce((m, x) => (Math.abs(x - v) < Math.abs(m - v) ? x : m), 0))), GP.length - 1].filter((v, i, a) => v >= 0 && v < GP.length && a.indexOf(v) === i).sort((a, b) => a - b);
    for (let b = 0; b < bandEdges.length - 1; b++) {
      const j0 = bandEdges[b], j1 = bandEdges[b + 1]; if (j1 <= j0) continue;
      const Pp = GP.slice(j0, j1 + 1);
      const N = gridNormals(Pp, true, (p) => [p[0], (p[1] - D.belt) * 0.5, p[2] - (D.zAg + D.zDg) / 2]);
      // glass sits 8 mm inside the frame
      gb.grid(Pp, N, (i, j) => { const m = gCls(i, j + j0); return m === MAT.win ? null : m; }, { wrapU: true });
      gb.grid(Pp, N, (i, j) => { const m = gCls(i, j + j0); return m === MAT.win ? m : null; }, { wrapU: true, off: -0.008 });
    }
  }
  // roof lid
  if (!conv) {
    const rl = [...roofLoop].sort((a, b) => a.p[2] - b.p[2]);
    const P = [], N = [];
    for (const q of rl) { const pr = [], nr = []; for (const u of UU) { const x = u * q.p[0], y = yRoof(x, q.p[2]); pr.push([x, y, q.p[2]]); const e = 0.004; nr.push(norm([-(yRoof(x + e, q.p[2]) - yRoof(x - e, q.p[2])) / (2 * e), 1, -(yRoof(x, q.p[2] + e) - yRoof(x, q.p[2] - e)) / (2 * e)])); } P.push(pr); N.push(nr); }
    gb.grid(P, N, () => (t.police === 'bar' && false ? MAT.paint : MAT.paint), {});
    // headliner just under the roof skin
    if (Q.detail > 0) gb.grid(P.map((r) => r.map((p) => [p[0] * 0.97, p[1] - 0.03, p[2]])), N.map((r) => r.map((n) => mul(n, -1))), () => MAT.headliner, {});
    if (t.roofRails && Q.detail > 0) for (const sx of [1, -1]) {
      const zr0 = D.rcR + 0.05, zr1 = D.rcF - 0.05, x = sx * (D.Xr - 0.08);
      const g = G.rbox(0.035, 0.035, zr1 - zr0, 0.012, 1); place(g, x, roofTop(D, (zr0 + zr1) / 2) + 0.012, (zr0 + zr1) / 2); gb.geo(g, MAT.satinBlack);
      for (const zz of [zr0 + 0.04, zr1 - 0.04]) { const f = G.box(0.045, 0.05, 0.08); place(f, x, yRoof(x, zz) + 0.0, zz); gb.geo(f, MAT.black); }
    }
  }

  // ---- arch liners and underbody
  if (Q.detail > 0) for (const zw of [D.wzF, D.wzR]) {
    const P = [[], []], N = [[], []], n = Q.detail > 1 ? 18 : 8;
    for (let k = 0; k <= n; k++) {
      const a = lerp(-0.12, Math.PI + 0.12, k / n), z = zw + D.Ra * Math.cos(a) * 0.995, y = Math.min(D.wcy + D.Ra * Math.sin(a) * 0.995, ysh(D, z) - 0.035); // never above the fender top (low noses)
      const xo = wallAtF(D, R, ringIndexAtZ(R, z), y).p[0] - 0.004, xi = Math.max(0.15, D.wx - D.tw - 0.12);
      P[0].push([xo, y, z]); P[1].push([xi, y, z]);
      const nn = norm([0, -Math.sin(a), -Math.cos(a)]); N[0].push(nn); N[1].push(nn);
    }
    gb.grid(P, N, () => MAT.liner, { mirror: true });
  }
  {
    const y = D.yb + 0.02, x0 = D.Xm - 0.09, xin = Math.max(0.2, D.wx - D.tw - 0.12);
    const zs = [Math.min(D.zcR, D.wzR - D.Ra - 0.05), D.wzR - D.Ra, D.wzR + D.Ra, D.wzF - D.Ra, D.wzF + D.Ra, Math.max(D.zcF, D.wzF + D.Ra + 0.05)].sort((a, b) => a - b);
    for (let k = 0; k < zs.length - 1; k++) {
      const z0 = zs[k], z1 = zs[k + 1], arch = k === 1 || k === 3, xx = arch ? xin : x0;
      gb.quad(MAT.under, [xx, y, z0], [-xx, y, z0], [-xx, y, z1], [xx, y, z1], [0, -1, 0]);
    }
  }

  // ---- DETAILS (fascias, lamps, grilles, mirrors, trims, interior)
  const det = Q.detail;
  const yF = R[NR - 1].y8, yR8 = R[0].y8;
  const fasciaH = yF - D.ybF;
  const frontW = R[NR - 1].sF > 0 ? R[0].sF : 1; // unused
  // arc length to where the front fascia turns into the side (roughly the corner end)
  const sFcorner = R[ringIndexAtSafeZ(R, D.zcF)]?.sF ?? D.hw;
  const sRcorner = R[ringIndexAtSafeZ(R, D.zcR)]?.sR ?? D.hw;
  const hwF = Xside(D, D.zcF);
  addFront(gb, D, R, t, Q, { yF, fasciaH, sFcorner, hwF, sporty, key });
  addRear(gb, D, R, t, Q, { yR8, sRcorner, sporty, key });
  if (det > 0) addSides(gb, D, R, t, Q, { cab, mapZ, sporty });
  if (det > 0) addCabin(gb, D, R, t, Q, { cab });
  if (t.box) addBox(gb, D, t, Q);
  addRoofEquipment(gb, D, t, Q);
  if (lod === 2) { // wheels as plain tire cylinders (no wheel nodes rendered at this range)
    for (const [x, z] of [[D.wx, D.wzF], [-D.wx, D.wzF], [D.wx, D.wzR], [-D.wx, D.wzR]]) { const g = G.cyl(D.r, D.r, D.tw, 10); place(g, x, D.r, z, 0, 0, Math.PI / 2); gb.geo(g, MAT.rubber); const h = G.cyl(D.r * 0.62, D.r * 0.62, D.tw + 0.01, 8); place(h, x, D.r, z, 0, 0, Math.PI / 2); gb.geo(h, MAT.alu); }
  }

  const geos = gb.build();
  // anchors (same names as the previous body engine, for stickers / accessories / dash items / plates)
  const yRearPlate = plateY(D, t);
  const rearZAt = (x, y) => wallAtS(D, R, false, x, y).p[2];
  const A = {
    plateR: [0, yRearPlate, 0], plateRz: rearZAt(0.001, yRearPlate) - 0.012,
    bumperRy: D.ybR + 0.2, bumperRz: rearZAt(0.3, D.ybR + 0.2) - 0.012, trunkY: yR8 - 0.12, trunkZ: rearZAt(0.4, yR8 - 0.12) - 0.012, hwRear: Xside(D, D.zcR) * 0.9,
    glassRear: D.wrapR && !(t.van && !t.windows) && !t.box ? (() => { const tt = 0.5; const b = gLoopB[0].p, r = gLoopR[0].p; return [lerp(b[1], r[1], tt), lerp(b[2], r[2], tt) - 0.01]; })() : null,
    badgeF: [0, yF - 0.08, D.zf + 0.01], badgeR: [0, yR8 - 0.07, D.zr - 0.01], letterY: yR8 - 0.15,
    cowlY: Hlid(D, 0, D.zAg) + 0.0, dashX: Xside(D, D.zAg) - 0.12, seatHalf: Xside(D, 0) - 0.1, roofHalf: D.Xr, roofTopY: D.roofY,
  };
  const hull = hullPoints(D, R, rows, Praw, roofLoop, t);
  const res = { ...geos, anchors: A, hull, D, stats: statsOf(geos) };
  cache.set(ck, res);
  return res;
}
function ringIndexAtSafe(R, x, z) { let best = 0, bd = 1e9; for (let i = 0; i < R.length; i++) { const d = Math.hypot(R[i].x - x, R[i].z - z); if (d < bd) { bd = d; best = i; } } return best; }
function ringIndexAtSafeZ(R, z) { let best = 0, bd = 1e9; for (let i = 0; i < R.length; i++) { const d = Math.abs(R[i].z - z) + (R[i].zone === 'S' ? 0 : 0.001); if (d < bd) { bd = d; best = i; } } return best; }
function statsOf(g) { let tris = 0, calls = 0; for (const k in g) { if (!g[k]?.isBufferGeometry) continue; tris += g[k].index.count / 3; calls++; } return { tris, calls }; }
function plateY(D, t) { return D.wrapR || t.bed ? D.ybR + Math.min(0.42, (D.tailY - D.ybR) * 0.42) : D.ybR + (D.tailY - D.ybR) * 0.55; }
function hullPoints(D, R, rows, Praw, roofLoop, t) {
  const out = [], minY = Math.max(D.yb + 0.06, 0.28);
  const take = [rows.indexOf(2), rows.indexOf(4), rows.indexOf(rows[rows.length - 1])].filter((j) => j >= 0);
  const n = Praw[0].length, step = Math.max(1, Math.floor(n / 28));
  for (const j of take) for (let i = 0; i < n; i += step) { const p = Praw[j][i]; out.push(p[0], Math.max(minY, p[1]), p[2]); }
  if (!D.conv) for (const q of roofLoop) for (const s of [1, -1]) out.push(s * q.p[0], q.p[1], q.p[2]);
  if (t.box) for (const sx of [1, -1]) for (const z of [D.zr + 0.05, t.box.front]) for (const y of [D.belt, t.box.top]) out.push(sx * (D.hw + 0.02), y, z);
  return new Float32Array(out);
}

// ---------------------------------------------------------------- front end
function addFront(gb, D, R, t, Q, o) {
  const det = Q.detail, yF = o.yF, h = o.fasciaH, fam = D.fam, sc = o.sFcorner;
  const ev = MODELSENGINE.get(o.key) === 'electric';
  // lamp geometry in (s, y): s = arc length from the front tip along the ring (left side)
  const yTop = yF - Math.min(0.055, h * 0.1);
  let lamp;
  const hwF = o.hwF;
  const sIn = hwF * (D.lamp === 'blade' ? 0.36 : 0.44), sOut = sc * (D.lamp === 'blade' ? 0.98 : 0.86);
  const lh = D.fam === 'suv' || D.fam === 'pickup' || D.fam === 'van' ? 1.25 : D.fam === 'citycar' || D.fam === 'hatch' ? 1.1 : 1;
  if (D.lamp === 'swept') lamp = { C: [[sIn, yTop - 0.072 * lh], [sOut, yTop - 0.115 * lh], [sOut + 0.05, yTop - 0.004], [sIn - 0.03, yTop - 0.014]] };
  else if (D.lamp === 'blade') lamp = { C: [[sIn, yTop - 0.045], [sOut, yTop - 0.05], [sOut + 0.08, yTop - 0.004], [sIn - 0.02, yTop - 0.012]] };
  else if (D.lamp === 'round') lamp = { C: [[sIn, yTop - 0.12 * lh], [sOut, yTop - 0.11 * lh], [sOut + 0.03, yTop - 0.008], [sIn - 0.01, yTop - 0.015]] };
  else if (D.lamp === 'quad') lamp = { C: [[hwF * 0.5, yTop - 0.17], [sc * 0.82, yTop - 0.17], [sc * 0.84, yTop - 0.01], [hwF * 0.5, yTop - 0.01]] };
  else lamp = { C: [[hwF * 0.52, yTop - 0.14], [sc * 0.8, yTop - 0.14], [sc * 0.81, yTop - 0.01], [hwF * 0.52, yTop - 0.01]] }; // rect (80s / trucks)
  if (fam === 'bus' || fam === 'box') lamp = { C: [[hwF * 0.55, D.ybF + 0.32], [hwF * 0.92, D.ybF + 0.32], [hwF * 0.92, D.ybF + 0.5], [hwF * 0.55, D.ybF + 0.5]] };
  if (fam === 'offroad') lamp = { C: [[hwF * 0.52, yTop - 0.2], [hwF * 0.8, yTop - 0.2], [hwF * 0.8, yTop - 0.02], [hwF * 0.52, yTop - 0.02]] };
  const C = lamp.C;
  const nu = det > 1 ? 10 : det ? 5 : 2, nv = det > 1 ? 4 : 2;
  if (det === 0) { fasciaPatch(gb, D, R, true, C, MAT.head, { nu: 3, nv: 1, off: 0.006, mirror: true }); }
  else {
    // housing (dark), inner reflector, projectors, DRL light guide, amber, clear lens, bezel
    fasciaPatch(gb, D, R, true, C, MAT.housing, { nu, nv, off: 0.004, mirror: true });
    const sub4 = (a0, a1, b0, b1) => [0, 1, 2, 3].map((k) => { const a = [a0, a1, a1, a0][k], b = [b0, b0, b1, b1][k]; return [lerp(lerp(C[0][0], C[1][0], a), lerp(C[3][0], C[2][0], a), b), lerp(lerp(C[0][1], C[1][1], a), lerp(C[3][1], C[2][1], a), b)]; });
    if (D.lamp === 'rect' || D.lamp === 'quad' || D.lamp === 'round') {
      const cells = D.lamp === 'quad' ? 2 : 1;
      for (let c = 0; c < cells; c++) {
        const q = sub4(0.06 + c * 0.5, (c + 1) / cells - 0.06 + (cells === 1 ? -0.0 : 0), 0.1, 0.9);
        fasciaPatch(gb, D, R, true, q, D.era === 0 ? MAT.reflector : MAT.darkChrome, { nu: 6, nv: 3, off: 0.007, mirror: true });
        const ctr = q.reduce((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4], [0, 0]);
        if (det > 1) for (const sgn of [1, -1]) { const w = wallAtS(D, R, true, sgn * ctr[0], ctr[1]); disc(gb, add(w.p, mul(w.n, 0.012)), w.n, Math.min(0.045, (q[2][1] - q[1][1]) * 0.32), MAT.head, 14); ring(gb, add(w.p, mul(w.n, 0.0125)), w.n, Math.min(0.045, (q[2][1] - q[1][1]) * 0.32), Math.min(0.05, (q[2][1] - q[1][1]) * 0.36), MAT.chrome, 14); }
      }
      if (D.lamp !== 'rect') fasciaPatch(gb, D, R, true, sub4(0.86, 1, 0.08, 0.92), MAT.blinkL, { nu: 2, nv: 2, off: 0.009, mirror: true });
    } else {
      // modern: projector pair + DRL light guide along the top + amber at the outer end
      fasciaPatch(gb, D, R, true, sub4(0.03, 0.84, 0.12, 0.78), MAT.darkChrome, { nu: 8, nv: 3, off: 0.0062, mirror: true });
      if (det > 1) {
        const hAt = (a) => lerp(C[3][1], C[2][1], a) - lerp(C[0][1], C[1][1], a);
        for (const a of D.lamp === 'blade' ? [0.42, 0.62] : [0.3, 0.56]) {
          const b = 0.42, s = lerp(lerp(C[0][0], C[1][0], a), lerp(C[3][0], C[2][0], a), b), y = lerp(lerp(C[0][1], C[1][1], a), lerp(C[3][1], C[2][1], a), b);
          const pr = clamp(hAt(a) * 0.33, 0.014, 0.036);
          for (const sgn of [1, -1]) {
            const w = wallAtS(D, R, true, sgn * s, y);
            ring(gb, add(w.p, mul(w.n, 0.0085)), w.n, pr * 0.7, pr * 1.18, MAT.chrome, 18, 0.006);
            disc(gb, add(w.p, mul(w.n, 0.0092)), w.n, pr * 0.7, MAT.lensProj, 18);
            disc(gb, add(w.p, mul(w.n, 0.0094)), w.n, pr * 0.28, MAT.head, 10);
          }
        }
      }
      // DRL: a thin bright light guide following the top edge and turning down at the inner end (signature)
      const drlQ = sub4(0.02, 0.98, 0.8, 0.94);
      fasciaPatch(gb, D, R, true, drlQ, MAT.drl, { nu: 10, nv: 1, off: 0.0095, mirror: true });
      if (det > 1 && D.lamp !== 'blade') fasciaPatch(gb, D, R, true, sub4(0.02, 0.07, 0.2, 0.8), MAT.drl, { nu: 1, nv: 2, off: 0.0095, mirror: true });
      fasciaPatch(gb, D, R, true, sub4(0.86, 0.99, 0.1, 0.7), MAT.blinkL, { nu: 2, nv: 2, off: 0.008, mirror: true });
    }
    // clear lens cover + bezel skirt
    fasciaPatch(gb, D, R, true, C, MAT.lens, { nu, nv, off: 0.0145, mirror: true, bulge: 0.003 });
    if (det > 1) patchSkirt(gb, D, R, true, C, MAT.housing, 0.0, 0.0145, { nu, nv, mirror: true });
  }

  // grille + intakes (centered: s from -w to +w across the tip)
  const gW = Math.min(hwF * (D.grilleW / 0.42) * 0.48, C[0][0] - 0.035);
  const gTop = D.grille === 'none' ? 0 : Math.min(yTop - 0.02, C[3][1] + 0.0);
  const gBot = gTop - (D.grilleH + (fam === 'pickup' || fam === 'suv' || fam === 'box' ? 0.08 : 0));
  const gridMat = { hex: MAT.grilleHex, hexChrome: MAT.grilleHex, hexWide: MAT.grilleHex, slats: MAT.grilleSlat, slatsChrome: MAT.grilleSlatChrome, vslats: MAT.vslatChrome }[D.grille] || MAT.grilleHex;
  const frameMat = D.chromeTrim || D.grille === 'hexChrome' || D.grille === 'slatsChrome' ? MAT.chrome : MAT.gloss;
  if (D.grille !== 'none' && !(ev && det > 0 && fam !== 'pickup')) {
    const GC = [[-gW, gBot], [gW, gBot], [gW * 1.02, gTop], [-gW * 1.02, gTop]];
    fasciaPatch(gb, D, R, true, GC, det ? gridMat : MAT.black, { nu: det > 1 ? 12 : 3, nv: det > 1 ? 4 : 1, off: 0.003, flatN: false });
    if (det > 0) {
      const fw = 0.018;
      const FR = [[-gW - fw, gBot - fw], [gW + fw, gBot - fw], [gW * 1.02 + fw, gTop + fw], [-gW * 1.02 - fw, gTop + fw]];
      patchSkirt(gb, D, R, true, FR, frameMat, 0.003, 0.012, { nu: 12, nv: 3 });
      patchSkirt(gb, D, R, true, GC, frameMat, 0.003, 0.012, { nu: 12, nv: 3 });
      // the frame face
      frameRing(gb, D, R, true, GC, FR, frameMat, 0.012);
    }
  } else if (ev && det > 0) {
    // EV: a closed panel with a slim gloss strip between the lamps
    fasciaPatch(gb, D, R, true, [[-hwF * 0.42, yTop - 0.06], [hwF * 0.42, yTop - 0.06], [hwF * 0.42, yTop - 0.04], [-hwF * 0.42, yTop - 0.04]], MAT.gloss, { nu: 10, nv: 1, off: 0.004 });
  }
  // lower intake (bumper) and fogs
  if (D.intake && det >= 0) {
    const iy0 = D.ybF + Math.min(0.08, h * 0.1), iy1 = iy0 + (D.intake === 'super' ? Math.min(0.2, h * 0.5) : Math.min(0.13, h * 0.2));
    const iw = D.intake === 'super' ? hwF * 0.62 : hwF * 0.5;
    if (fam !== 'bus') fasciaPatch(gb, D, R, true, [[-iw, iy0], [iw, iy0], [iw * 1.04, iy1], [-iw * 1.04, iy1]], det ? MAT.grilleHex : MAT.black, { nu: det > 1 ? 12 : 3, nv: 2, off: 0.003 });
    if (det > 1 && fam !== 'bus') patchSkirt(gb, D, R, true, [[-iw, iy0], [iw, iy0], [iw * 1.04, iy1], [-iw * 1.04, iy1]], MAT.gloss, 0.0, 0.008, { nu: 12, nv: 2 });
    if (D.intake === 'super' && det > 0) for (const sgn of [1]) {
      // big side intakes under the lamps
      const q = [[hwF * 0.66, iy0], [sc + 0.05, iy0 + 0.02], [sc + 0.02, iy1 + 0.06], [hwF * 0.68, iy1 + 0.04]];
      fasciaPatch(gb, D, R, true, q, MAT.grilleHex, { nu: 8, nv: 3, off: 0.003, mirror: true });
      if (det > 1) patchSkirt(gb, D, R, true, q, MAT.gloss, 0.0, 0.01, { nu: 8, nv: 3, mirror: true });
    }
    if (det > 1 && (D.era >= 1) && fam !== 'super' && fam !== 'bus') {
      const fy = (iy0 + iy1) / 2, fs = Math.min(sc * 0.95, hwF * 0.78);
      for (const sgn of [1, -1]) { const w = wallAtS(D, R, true, sgn * fs, fy); disc(gb, add(w.p, mul(w.n, 0.006)), w.n, 0.035, MAT.fog, 12); ring(gb, add(w.p, mul(w.n, 0.006)), w.n, 0.035, 0.05, MAT.gloss, 12); }
    }
    // splitter / chin
    if (det > 0 && (o.sporty || fam === 'super')) fasciaPatch(gb, D, R, true, [[-hwF * 0.85, D.ybF - 0.0], [hwF * 0.85, D.ybF - 0.0], [hwF * 0.88, D.ybF + 0.03], [-hwF * 0.88, D.ybF + 0.03]], MAT.gloss, { nu: 12, nv: 1, off: 0.012 });
  }
  // 80s / chrome bumpers and truck bumpers: a bar across the front
  if (det > 0 && (D.era === 0 || D.t.chromeBumpers || fam === 'pickup' || fam === 'offroad' || fam === 'box')) {
    const by0 = D.ybF + Math.min(0.1, h * 0.14), by1 = by0 + Math.min(0.15, h * 0.22);
    const bw = sc + 0.12, mat = D.t.chromeBumpers || (D.chromeTrim && D.era === 0) || (fam === 'pickup' && D.chromeTrim) ? MAT.chrome : MAT.black;
    fasciaPatch(gb, D, R, true, [[-bw, by0], [bw, by0], [bw, by1], [-bw, by1]], mat, { nu: 18, nv: 2, off: 0.022, bulge: 0.006 });
    if (det > 1) { patchSkirt(gb, D, R, true, [[-bw, by0], [bw, by0], [bw, by1], [-bw, by1]], mat, 0.0, 0.022, { nu: 18, nv: 2 }); }
  }
  // badge
  if (det > 1 && !t.bus) {
    const by = D.grille === 'none' || ev ? yTop - 0.04 : (gTop + gBot) / 2 + (gTop - gBot) * 0.1, w = wallAtS(D, R, true, 0.0001, by);
    const s = 0.04, n = w.n, c = add(w.p, mul(n, 0.016));
    const u = norm(cross([0, 1, 0], n)), v = [0, 1, 0];
    gb.quad(MAT.badge, add(c, add(mul(u, -s), mul(v, -s))), add(c, add(mul(u, s), mul(v, -s))), add(c, add(mul(u, s), mul(v, s))), add(c, add(mul(u, -s), mul(v, s))), n,
      [sheetUV('badge', 1, 0), sheetUV('badge', 0, 0), sheetUV('badge', 0, 1), sheetUV('badge', 1, 1)]);
  }
  // hood shut line (front edge + sides) and bumper split
  if (det > 1 && !D.wrapF) {
    const pts = [];
    const iA = ringIndexAtZ(R, D.zAg + 0.03), iEnd = R.length - 1;
    for (let f = iA; f <= iEnd; f += 0.5) { const rp = ringAt(R, f); pts.push([f, rp.y8 - 0.012]); }
    wallStrip(gb, D, R, pts, 0.005, MAT.gap, { off: 0.0012 });
  }
}
// a flat frame face between an inner and outer quad outline, at offset off
function frameRing(gb, D, R, front, Ci, Co, mat, off) {
  const loopOf = (C, n) => { const L = []; for (let k = 0; k < 4; k++) for (let i = 0; i < n; i++) { const a = i / n, A = C[k], B = C[(k + 1) % 4]; L.push([lerp(A[0], B[0], a), lerp(A[1], B[1], a)]); } return L; };
  const n = 6, Li = loopOf(Ci, n), Lo = loopOf(Co, n), P = [[], []], N = [[], []];
  for (let i = 0; i < Li.length; i++) { const wi = wallAtS(D, R, front, Li[i][0], Li[i][1]), wo = wallAtS(D, R, front, Lo[i][0], Lo[i][1]); P[0].push(add(wi.p, mul(wi.n, off))); P[1].push(add(wo.p, mul(wo.n, off))); N[0].push(wi.n); N[1].push(wo.n); }
  gb.grid(P, N, () => mat, { wrapU: true });
}

// ---------------------------------------------------------------- rear end
function addRear(gb, D, R, t, Q, o) {
  const det = Q.detail, y8 = o.yR8, sc = o.sRcorner, fam = D.fam, hwR = Xside(D, D.zcR);
  const h = y8 - D.ybR;
  // tail lamps in (s, y) from the rear tip
  let C;
  if (D.tail === 'vertical') C = [[hwR * 0.84, D.ybR + h * 0.42], [sc + 0.03, D.ybR + h * 0.42], [sc + 0.04, y8 - 0.03], [hwR * 0.84, y8 - 0.03]];
  else if (D.tail === 'bar') C = [[0.02, y8 - 0.14], [sc + 0.06, y8 - 0.14], [sc + 0.07, y8 - 0.04], [0.02, y8 - 0.04]];
  else if (D.tail === 'blade') C = [[hwR * 0.35, y8 - 0.07], [sc * 0.98, y8 - 0.05], [sc * 0.98 + 0.06, y8 - 0.012], [hwR * 0.33, y8 - 0.03]];
  else if (D.tail === 'rect') C = [[hwR * 0.48, y8 - 0.2], [sc * 0.82, y8 - 0.2], [sc * 0.83, y8 - 0.03], [hwR * 0.48, y8 - 0.03]];
  else C = [[hwR * 0.5, y8 - 0.14], [sc * 0.9, y8 - 0.11], [sc * 0.9 + 0.05, y8 - 0.02], [hwR * 0.48, y8 - 0.025]];
  if (D.wrapR && D.tail === 'wrap') C = [[hwR * 0.66, y8 - 0.26], [sc * 0.92, y8 - 0.24], [sc * 0.92 + 0.04, y8 - 0.015], [hwR * 0.7, y8 - 0.02]];
  if (fam === 'bus' || fam === 'box') C = [[hwR * 0.78, D.ybR + 0.4], [sc + 0.0, D.ybR + 0.4], [sc + 0.0, D.ybR + 0.85], [hwR * 0.78, D.ybR + 0.85]];
  const sub4 = (a0, a1, b0, b1) => [0, 1, 2, 3].map((k) => { const a = [a0, a1, a1, a0][k], b = [b0, b0, b1, b1][k]; return [lerp(lerp(C[0][0], C[1][0], a), lerp(C[3][0], C[2][0], a), b), lerp(lerp(C[0][1], C[1][1], a), lerp(C[3][1], C[2][1], a), b)]; });
  const mirror = D.tail !== 'bar';
  if (det === 0) fasciaPatch(gb, D, R, false, C, MAT.tail, { nu: 3, nv: 1, off: 0.006, mirror });
  else {
    fasciaPatch(gb, D, R, false, C, MAT.tailDark, { nu: 10, nv: 3, off: 0.005, mirror });
    if (D.tail === 'vertical') {
      fasciaPatch(gb, D, R, false, sub4(0.08, 0.92, 0.55, 0.95), MAT.tail, { nu: 3, nv: 3, off: 0.009, mirror });
      fasciaPatch(gb, D, R, false, sub4(0.08, 0.92, 0.3, 0.52), MAT.blinkL, { nu: 3, nv: 2, off: 0.009, mirror });
      fasciaPatch(gb, D, R, false, sub4(0.08, 0.92, 0.05, 0.27), MAT.reverse, { nu: 3, nv: 2, off: 0.009, mirror });
    } else {
      // stop/tail lens, an LED light guide inside, reverse + amber cells at the inner end
      fasciaPatch(gb, D, R, false, sub4(0.18, 0.98, 0.08, 0.92), MAT.tail, { nu: 10, nv: 3, off: 0.0085, mirror, bulge: 0.002 });
      if (det > 1) fasciaPatch(gb, D, R, false, D.era === 0 ? sub4(0.2, 0.96, 0.4, 0.6) : sub4(0.24, 0.97, 0.58, 0.72), MAT.tailLed, { nu: 10, nv: 1, off: 0.0105, mirror });
      if (det > 1 && D.era >= 1) fasciaPatch(gb, D, R, false, sub4(0.9, 0.97, 0.2, 0.72), MAT.tailLed, { nu: 1, nv: 2, off: 0.0105, mirror });
      fasciaPatch(gb, D, R, false, sub4(0.03, 0.13, 0.5, 0.88), MAT.reverse, { nu: 2, nv: 2, off: 0.0085, mirror });
      fasciaPatch(gb, D, R, false, sub4(0.03, 0.13, 0.12, 0.46), MAT.blinkL, { nu: 2, nv: 2, off: 0.0085, mirror });
      if (det > 1 && D.era === 0) for (const a of [0.43, 0.7]) fasciaPatch(gb, D, R, false, sub4(a, a + 0.012, 0.08, 0.92), MAT.housing, { nu: 1, nv: 2, off: 0.0115, mirror });
    }
    fasciaPatch(gb, D, R, false, C, MAT.lens, { nu: 10, nv: 3, off: 0.0135, mirror, bulge: 0.002 });
    if (det > 1) patchSkirt(gb, D, R, false, C, MAT.housing, 0.0, 0.0135, { nu: 10, nv: 3, mirror });
    // third brake light on the roof spoiler / rear glass top
  }
  // plate recess + plate + plate lamp, badge, lettering
  const py = plateY(D, t);
  if (det > 0) {
    const pw = 0.165, ph = 0.085;
    const RC = [[-pw - 0.02, py - ph - 0.02], [pw + 0.02, py - ph - 0.02], [pw + 0.02, py + ph + 0.025], [-pw - 0.02, py + ph + 0.025]];
    fasciaPatch(gb, D, R, false, RC, MAT.black, { nu: 6, nv: 2, off: 0.0015 });
    const recess = det > 1 && !t.bed && fam !== 'bus' && fam !== 'box';
    if (recess) { // [ref_57] plate set into a pocket: paint walls stand 2 cm proud of the pocket floor, with a lip on top
      patchSkirt(gb, D, R, false, RC, MAT.paint, 0.0015, 0.02, { nu: 6, nv: 2 });
      const L = 0.03, E = (a, b) => fasciaPatch(gb, D, R, false, a, MAT.paint, { nu: 4, nv: 1, off: 0.02 });
      E([[RC[3][0] - L, RC[3][1]], [RC[2][0] + L, RC[2][1]], [RC[2][0] + L, RC[2][1] + L], [RC[3][0] - L, RC[3][1] + L]]);
      for (const sg of [1, -1]) E([[sg * RC[1][0], RC[1][1]], [sg * (RC[1][0] + L), RC[1][1]], [sg * (RC[2][0] + L), RC[2][1]], [sg * RC[2][0], RC[2][1]]]);
    }
    const w = wallAtS(D, R, false, 0.0001, py), n = w.n, c = add(w.p, mul(n, recess ? 0.004 : 0.006)), u = norm(cross([0, 1, 0], n)), v = [0, 1, 0];
    const W = 0.1525, H = 0.076;
    gb.quad(MAT.plate, add(c, add(mul(u, -W), mul(v, -H))), add(c, add(mul(u, W), mul(v, -H))), add(c, add(mul(u, W), mul(v, H))), add(c, add(mul(u, -W), mul(v, H))), n,
      [sheetUV('plate', 0, 0), sheetUV('plate', 1, 0), sheetUV('plate', 1, 1), sheetUV('plate', 0, 1)]);
    if (det > 1 && !t.bus) {
      // brand badge center, model lettering on the right
      const by = D.wrapR ? Math.min(y8 - 0.06, py + 0.17) : y8 - 0.07, wb = wallAtS(D, R, false, 0.0001, by), cb = add(wb.p, mul(wb.n, 0.007)), ub = norm(cross([0, 1, 0], wb.n));
      const s = 0.034;
      gb.quad(MAT.badge, add(cb, add(mul(ub, -s), mul(v, -s))), add(cb, add(mul(ub, s), mul(v, -s))), add(cb, add(mul(ub, s), mul(v, s))), add(cb, add(mul(ub, -s), mul(v, s))), wb.n,
        [sheetUV('badge', 0, 0), sheetUV('badge', 1, 0), sheetUV('badge', 1, 1), sheetUV('badge', 0, 1)]);
      const ly = by - 0.035, wl = wallAtS(D, R, false, -hwR * 0.45, ly), cl = add(wl.p, mul(wl.n, 0.006)), ul = norm(cross([0, 1, 0], wl.n)), lw = 0.17, lh = 0.03;
      gb.quad(MAT.badge, add(cl, add(mul(ul, -lw), mul(v, -lh))), add(cl, add(mul(ul, lw), mul(v, -lh))), add(cl, add(mul(ul, lw), mul(v, lh))), add(cl, add(mul(ul, -lw), mul(v, lh))), wl.n,
        [sheetUV('letter', 0, 0), sheetUV('letter', 1, 0), sheetUV('letter', 1, 1), sheetUV('letter', 0, 1)]);
    }
  }
  // rear bumper: diffuser / lower black, reflectors, exhaust
  if (det > 0) {
    const dy0 = D.ybR, dy1 = D.ybR + Math.min(fam === 'super' || o.sporty ? 0.17 : 0.1, h * 0.25), dw = hwR * 0.86;
    if (fam !== 'bus') fasciaPatch(gb, D, R, false, [[-dw, dy0], [dw, dy0], [dw, dy1], [-dw, dy1]], o.sporty || fam === 'super' ? MAT.grilleHex : MAT.black, { nu: 14, nv: 1, off: 0.004 });
    const finned = det > 1 && (fam === 'sedan' || fam === 'coupe' || fam === 'lux' || fam === 'super' || fam === 'hatch' || o.sporty) && !D.t.police && !D.t.taxi;
    if (finned) { // [ref_57] diffuser: a deeper black tray with vertical strakes
      fasciaPatch(gb, D, R, false, [[-dw * 0.62, dy0], [dw * 0.62, dy0], [dw * 0.62, dy1 + 0.03], [-dw * 0.62, dy1 + 0.03]], MAT.satinBlack, { nu: 10, nv: 1, off: 0.007 });
      const nf = fam === 'super' || o.sporty ? 7 : 5;
      for (let i = 0; i < nf; i++) { const s = (i / (nf - 1) - 0.5) * dw * 1.0, fw = 0.011;
        fasciaPatch(gb, D, R, false, [[s - fw, dy0], [s + fw, dy0], [s + fw, dy1 + 0.02], [s - fw, dy1 + 0.02]], MAT.gloss, { nu: 1, nv: 1, off: 0.03 });
        patchSkirt(gb, D, R, false, [[s - fw, dy0], [s + fw, dy0], [s + fw, dy1 + 0.02], [s - fw, dy1 + 0.02]], MAT.gloss, 0.007, 0.03, { nu: 1, nv: 1 }); }
    }
    if (det > 1) for (const sgn of [1, -1]) fasciaPatch(gb, D, R, false, [[sgn * hwR * 0.9, dy1 + 0.02], [sgn * (sc + 0.02), dy1 + 0.02], [sgn * (sc + 0.02), dy1 + 0.045], [sgn * hwR * 0.9, dy1 + 0.045]], MAT.tailDark, { nu: 2, nv: 1, off: 0.005 });
    if ((D.era === 0 || D.t.chromeBumpers || fam === 'pickup' || fam === 'offroad' || fam === 'box') && fam !== 'bus') {
      const by0 = D.ybR + 0.08, by1 = by0 + Math.min(0.15, h * 0.24), bw = sc + 0.1, mat = D.t.chromeBumpers || fam === 'pickup' && D.chromeTrim ? MAT.chrome : MAT.black;
      fasciaPatch(gb, D, R, false, [[-bw, by0], [bw, by0], [bw, by1], [-bw, by1]], mat, { nu: 18, nv: 2, off: 0.022, bulge: 0.004 });
      if (det > 1) patchSkirt(gb, D, R, false, [[-bw, by0], [bw, by0], [bw, by1], [-bw, by1]], mat, 0.0, 0.022, { nu: 18, nv: 2 });
    }
    const ev = MODELSENGINE.get(o.key) === 'electric';
    if (!ev && det > 1 && fam !== 'bus') {
      // [ref_57] dual tips each side on sedans / coupes / luxury / sporty; one tip on utility bodies
      const both = o.sporty || fam === 'super' || fam === 'muscle' || fam === 'sedan' || fam === 'coupe' || fam === 'lux' || D.t.lux;
      const pair = both && !D.t.police && !D.t.taxi;
      const er = fam === 'super' || fam === 'muscle' ? 0.042 : 0.033, ey = D.ybR + 0.055;
      for (const sgn of both ? [1, -1] : [1]) for (const k of pair ? [-1, 1] : [0]) {
        const ex = hwR * 0.6 + k * er * 1.15, w = wallAtS(D, R, false, sgn * ex, ey);
        const g = G.cyl(er, er, 0.14, 16, true); place(g, w.p[0], ey, w.p[2] + 0.03, Math.PI / 2); gb.geo(g, MAT.exhaust);
        ring(gb, [w.p[0], ey, w.p[2] - 0.04], [0, 0, -1], er * 0.82, er * 1.02, MAT.chrome, 16, 0.004);
        disc(gb, [w.p[0], ey, w.p[2] - 0.035], [0, 0, -1], er * 0.82, MAT.exhaustIn, 14);
      }
    }
  }
  // deck / tailgate shut lines
  if (det > 1) {
    if (!D.wrapR && !t.bed) {
      const pts = [], i1 = ringIndexAtZ(R, D.zDg - 0.04);
      for (let f = 0; f <= i1; f += 0.5) pts.push([f, ringAt(R, f).y8 - 0.012]);
      wallStrip(gb, D, R, pts, 0.005, MAT.gap, { off: 0.0012 });
    } else if (D.wrapR && fam !== 'bus') {
      // tailgate: vertical cut near the corner + horizontal cut above the bumper
      const yb = D.ybR + h * 0.38, sCut = Math.min(sc * 0.98, C[0][0] - 0.01);
      const iC = ringIndexAtS(R, sCut, false), pts = [];
      for (let y = yb; y <= y8 - 0.01; y += 0.05) pts.push([iC, y]);
      wallStrip(gb, D, R, pts, 0.005, MAT.gap, { off: 0.0012 });
      const pts2 = []; for (let f = 0; f <= iC; f += 0.5) pts2.push([f, yb]);
      wallStrip(gb, D, R, pts2, 0.005, MAT.gap, { off: 0.0012 });
    }
  }
}

// ---------------------------------------------------------------- sides: door cuts, handles, mirrors, trims, side markers
function addSides(gb, D, R, t, Q, o) {
  const det = Q.detail, panes = panesOf(D);
  const yS = D.yb + D.sill + 0.02;
  // door cuts at the pane edges (front door front edge just behind the front arch / at the A pillar base)
  const cuts = [];
  if (!['bus', 'box'].includes(D.fam)) {
    const front = Math.min(D.zAg + 0.02, D.wzF - D.Ra - 0.05);
    cuts.push(front);
    if (panes.length >= 2 && D.fam !== 'van') { cuts.push(panes[0][0] - 0.03); if (D.fam !== 'pickup' || true) cuts.push(Math.max(D.wzR + D.Ra + 0.05, panes[1][0] - 0.02)); }
    else if (panes.length === 1) cuts.push(Math.max(D.wzR + D.Ra + 0.05, panes[0][0] - 0.02));
    if (D.fam === 'van') cuts.push(panes[0][0] - 0.03, panes[0][0] - 1.15);
    if (t.bed) cuts.push(D.zDg - 0.05);
  }
  if (det > 1) {
    for (const z of cuts) {
      const f = ringIndexAtZ(R, z), y8 = ringAt(R, f).y8, pts = [];
      for (let y = yS; y <= y8 - 0.02; y += 0.06) pts.push([f, y]);
      pts.push([f, y8 - 0.015]);
      wallStrip(gb, D, R, pts, 0.005, MAT.gap, { off: 0.0012 });
    }
    // sill line under the doors
    if (cuts.length >= 2) { const f0 = ringIndexAtZ(R, Math.min(...cuts)), f1 = ringIndexAtZ(R, Math.max(...cuts)), pts = []; for (let f = f0; f <= f1; f += 0.5) pts.push([f, yS]); wallStrip(gb, D, R, pts, 0.005, MAT.gap, { off: 0.0012 }); }
    // front fender / bumper split line behind the front arch top
    // handles
    for (const p of panes) {
      if (D.fam === 'bus' || D.fam === 'box') break;
      const zh = p[0] + 0.18, f = ringIndexAtZ(R, zh), rp = ringAt(R, f), y = rp.y8 - Math.min(0.12, D.charY * 0.6);
      const w = wallAtF(D, R, f, y), n = w.n, c = add(w.p, mul(n, 0.006)), u = [0, 0, 1], v = norm(cross(n, u));
      const hl = 0.075, hh = 0.016, mat = D.chromeTrim ? MAT.chrome : MAT.paint;
      const g = G.rbox(0.02, hh * 2, hl * 2, 0.008, 1); place(g, c[0] - 0.004, c[1], c[2]); gb.geo(g, mat, { mirror: true });
      const pocket = G.box(0.004, hh * 2.6, hl * 2.2); place(pocket, w.p[0] + 0.001, c[1] - 0.004, c[2]); gb.geo(pocket, MAT.gloss, { mirror: true });
    }
    // side marker (amber, front corner) and red (rear corner)
    {
      const f = ringIndexAtZ(R, D.zf - D.noseOv - 0.12), rp = ringAt(R, f), y = rp.y8 - 0.1, w = wallAtF(D, R, f, y);
      const g = G.rbox(0.006, 0.025, 0.06, 0.004, 1); place(g, w.p[0] + 0.003, w.p[1], w.p[2]); gb.geo(g, MAT.amber, { mirror: true });
    }
    if (D.chromeTrim && !['bus', 'box', 'van'].includes(D.fam)) {
      const f0 = ringIndexAtZ(R, D.wzR + D.Ra + 0.08), f1 = ringIndexAtZ(R, D.wzF - D.Ra - 0.08), pts = [];
      for (let f = f0; f <= f1; f += 0.5) pts.push([f, D.yb + D.sill * 0.6]);
      wallStrip(gb, D, R, pts, 0.014, MAT.chrome, { off: 0.003 });
    }
    // fuel door (right rear quarter)
    if (!['bus', 'box'].includes(D.fam)) {
      const z = D.wzR + D.Ra + 0.25, f = ringIndexAtZ(R, z), y = ringAt(R, f).y8 - 0.12, w = wallAtF(D, R, f, y);
      const ctr = [-w.p[0], w.p[1], w.p[2]], n = [-w.n[0], w.n[1], w.n[2]], P = [[], []];
      for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 2, d = [0, Math.sin(a) * 0.075, Math.cos(a) * 0.075], q = add(ctr, d); P[0].push(add(q, mul(n, 0.0012))); P[1].push(add(add(ctr, mul(d, 0.94)), mul(n, 0.0012))); }
      gb.grid(P, null, () => MAT.gap, { hint: () => n });
    }
  }
  // mirrors
  if (D.fam !== 'bus') {
    const zA = D.zAg, z = zA - (D.fam === 'van' || D.fam === 'box' ? 0.1 : 0.2), f = ringIndexAtZ(R, z), rp = ringAt(R, f), y = rp.y8 + 0.1;
    const big = D.fam === 'box' || D.fam === 'van' || D.fam === 'pickup';
    const hs = big ? [0.13, 0.24, 0.09] : [0.2, 0.105, 0.085];
    const x = rp.x + (big ? 0.2 : 0.155), ym = y + (big ? 0.06 : 0.02);
    // housing: a rounded block, tapered toward the door, flat glass face at the back
    const body = det > 0 ? G.rbox(hs[0], hs[1], hs[2], hs[2] * 0.42, det > 1 ? 3 : 1) : G.box(hs[0], hs[1], hs[2]);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / hs[0] + 0.5; // 0 inner .. 1 outer
      p.setY(i, p.getY(i) * (0.72 + 0.28 * Math.min(1, u * 1.6)) + (1 - u) * 0.012);
      if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) * (0.8 + 0.4 * u));
    }
    body.computeVertexNormals();
    place(body, x, ym, z, 0, 0.06, 0);
    gb.geo(body, D.era === 0 || big || D.t.police ? MAT.black : MAT.paint, { mirror: true });
    if (det > 0) {
      const sail = G.rbox(0.09, 0.05, 0.13, 0.015, 1); place(sail, rp.x + 0.035, rp.y8 + 0.03, z - 0.01); gb.geo(sail, MAT.gloss, { mirror: true });
      const arm = G.rbox(0.08, 0.035, 0.05, 0.012, 1); place(arm, x - hs[0] * 0.45, ym - hs[1] * 0.2, z + 0.005); gb.geo(arm, MAT.black, { mirror: true });
      const gl = G.rbox(hs[0] * 0.9, hs[1] * 0.82, 0.006, 0.02, 1); place(gl, x + 0.005, ym, z - hs[2] / 2 - 0.001, 0, 0.06, 0); gb.geo(gl, MAT.chrome, { mirror: true });
      if (det > 1 && D.era >= 2 && !big) { const bl = G.rbox(hs[0] * 0.75, 0.01, 0.012, 0.004, 1); place(bl, x + 0.02, ym - hs[1] * 0.38, z + hs[2] * 0.42); gb.geo(bl, MAT.amber, { mirror: true }); }
    }
  }
  // wipers + cowl vent strip
  if (det > 1 && !D.conv || det > 1 && D.conv) {
    const y = Hlid(D, 0, D.zAg) + 0.03, z = D.zAg - 0.01;
    for (const [x0, len0] of [[0.05, D.Xm * 0.8], [-D.Xm * 0.72, D.Xm * 0.72]]) { const g = G.box(len0, 0.012, 0.02); place(g, x0 + len0 / 2, y + 0.005, z - 0.03, 0.5, 0, 0.06); gb.geo(g, MAT.wiper); }
  }
  // antenna (shark fin on modern cars)
  if (det > 1 && !D.conv && D.fam !== 'bus' && D.fam !== 'box') {
    if (D.era >= 2) { const g = G.sph(1, 8, 6); g.scale(0.03, 0.04, 0.09); place(g, 0, Hroof(D, 0, D.rcR + 0.08) + 0.01, D.rcR + 0.06); gb.geo(g, MAT.gloss); }

  }
}

// ---------------------------------------------------------------- interior (seen through the glass)
function addCabin(gb, D, R, t, Q, o) {
  const det = Q.detail;
  const zA = D.zAg, zD = D.zDg, x0 = Xside(D, (zA + zD) / 2) - 0.08, floor = D.yb + 0.12, belt = D.belt;
  const front = D.fam === 'box' || D.fam === 'bus' || D.fam === 'van' ? zA - 0.75 : zA - (t.coupe ? 1.05 : 1.15);
  const seatY = Math.max(floor + 0.28, belt - 0.42), backH = Math.min(0.62, (D.roofY - belt) * 0.55 + 0.25);
  // floor, door cards, rear bulkhead
  gb.quad(MAT.carpet, [-x0, floor, zD], [x0, floor, zD], [x0, floor, zA], [-x0, floor, zA], [0, 1, 0]);
  for (const s of [1, -1]) gb.quad(MAT.dashSoft, [s * x0, floor, zD], [s * x0, floor, zA], [s * x0, belt - 0.02, zA], [s * x0, belt - 0.02, zD], [-s, 0, 0]);
  if (!t.bed && !D.wrapR) gb.quad(MAT.dashSoft, [-x0, floor, zD + 0.02], [x0, floor, zD + 0.02], [x0, belt - 0.16, zD + 0.02], [-x0, belt - 0.16, zD + 0.02], [0, 0, 1]);
  // dashboard: a sculpted slab under the windshield + binnacle + screen + vents
  const cy = Hlid(D, 0, zA), dashZ = zA - 0.32, dashTop = cy - 0.02;
  { const g = G.rbox(2 * x0, 0.22, 0.5, 0.08, 2); place(g, 0, dashTop - 0.09, zA - 0.22); gb.geo(g, MAT.dash); }
  if (det > 1) {
    const g = G.rbox(0.34, 0.1, 0.16, 0.04, 2); place(g, 0.38, dashTop + 0.02, dashZ - 0.06); gb.geo(g, MAT.dash);
    const scr = G.box(0.24, 0.13, 0.01); place(scr, 0.05, dashTop + 0.04, dashZ - 0.15, -0.25); gb.geo(scr, MAT.gauge);
    const gauge = G.box(0.24, 0.08, 0.008); place(gauge, 0.38, dashTop + 0.02, dashZ - 0.145, -0.2); gb.geo(gauge, MAT.gauge);
    // steering wheel (static; car.steeringWheel is a lightweight node)
    const sw = new THREE.TorusGeometry(0.18, 0.018, 8, 22); place(sw, 0.38, dashTop - 0.02, dashZ - 0.24, -0.38 + (D.fam === 'box' || D.fam === 'bus' ? -0.7 : 0)); gb.geo(sw, MAT.dash);
    const hub = G.cyl(0.055, 0.06, 0.05, 12); place(hub, 0.38, dashTop - 0.02, dashZ - 0.24, Math.PI / 2 - 0.38); gb.geo(hub, MAT.dash);
    const sp = G.box(0.32, 0.03, 0.015); place(sp, 0.38, dashTop - 0.03, dashZ - 0.235, -0.38); gb.geo(sp, MAT.dash);
    // console
    const con = G.rbox(0.2, 0.2, Math.max(0.3, front - zD - 0.4), 0.04, 1); place(con, 0, seatY - 0.04, (front + zD) / 2 + 0.25); gb.geo(con, MAT.dash);
    // rear-view mirror
    if (!D.conv) { const m = G.rbox(0.22, 0.06, 0.03, 0.015, 1); place(m, 0, Hroof(D, 0, D.rcF) - 0.14, D.rcF - 0.1); gb.geo(m, MAT.dash); }
  }
  // seats (per-car trim color through the lamp material)
  const seat = (x, z, w) => {
    const c = G.rbox(w, 0.13, 0.5, 0.05, det > 1 ? 2 : 1); place(c, x, seatY, z); gb.geo(c, MAT.seat);
    const b = G.rbox(w - 0.03, backH, 0.13, 0.06, det > 1 ? 2 : 1); place(b, x, seatY + backH / 2 + 0.02, z - 0.28, -0.16); gb.geo(b, MAT.seat);
    if (w < 0.8 && det > 1) { const hr = G.rbox(0.24, 0.17, 0.09, 0.04, 1); place(hr, x, Math.min(seatY + backH + 0.12, D.roofY - 0.16), z - 0.35, -0.16); gb.geo(hr, MAT.seatDark); }
  };
  seat(0.38, front, 0.5); seat(-0.38, front, 0.5);
  const rearZ = Math.max(front - 0.95, zD + 0.5);
  if (!t.coupe && !D.conv && rearZ < front - 0.6 && !['box', 'van'].includes(D.fam)) seat(0, rearZ, 2 * x0 - 0.14);
  if (D.fam === 'bus') for (let z = front - 1.2; z > zD + 0.6; z -= 0.85) for (const x of [0.75, 0.35, -0.35, -0.75]) { const c = G.rbox(0.38, 0.5, 0.42, 0.05, 1); place(c, x, seatY + 0.15, z); gb.geo(c, MAT.seat); }
  if (D.conv) {
    // folded top / tonneau behind the seats and the door tops
    const zt = Math.max(zD + 0.05, rearZ - 0.4), g = G.rbox(2 * x0 + 0.06, 0.16, 0.5, 0.07, 2); place(g, 0, belt + 0.02, zt); gb.geo(g, MAT.black);
    for (let i = 0; i < cabFromR(R, zD, zA).length - 1; i++) {}
  }
}
function cabFromR(R, zD, zA) { return R.filter((r) => r.zone === 'S' && r.z >= zD && r.z <= zA); }

// ---------------------------------------------------------------- cargo box (trucks, ambulance, fire engine)
function addBox(gb, D, t, Q) {
  const bz0 = D.zr + 0.02, bz1 = t.box.front, bw = D.W ? D.W : D.hw * 2 + 0.06, y0 = D.belt - 0.04, y1 = t.box.top;
  const mat = t.fire ? MAT.boxRed : MAT.box;
  const g = G.rbox(D.hw * 2 + 0.06, y1 - y0, bz1 - bz0, 0.05, Q.detail > 1 ? 2 : 1); place(g, 0, (y0 + y1) / 2, (bz0 + bz1) / 2); gb.geo(g, mat);
  if (Q.detail > 0) {
    const rail = G.box(D.hw * 2 + 0.08, 0.07, bz1 - bz0 + 0.02); place(rail, 0, y0 + 0.02, (bz0 + bz1) / 2); gb.geo(rail, MAT.alu);
    const cap = G.box(D.hw * 2 + 0.08, 0.05, bz1 - bz0 + 0.02); place(cap, 0, y1 - 0.02, (bz0 + bz1) / 2); gb.geo(cap, MAT.alu);
    // rear roller door ribs
    for (let y = y0 + 0.15; y < y1 - 0.1; y += 0.12) { const r = G.box(D.hw * 2 - 0.1, 0.012, 0.01); place(r, 0, y, bz0 - 0.005); gb.geo(r, MAT.gap); }
    if (t.fire) for (let z = bz0 + 0.4; z < bz1 - 0.3; z += 0.9) for (const s of [1, -1]) { const p = G.box(0.012, (y1 - y0) * 0.62, 0.78); place(p, s * (D.hw + 0.035), y0 + (y1 - y0) * 0.45, z); gb.geo(p, MAT.alu); }
    // chassis rails under the box
    for (const s of [1, -1]) { const c = G.box(0.1, 0.18, bz1 - bz0); place(c, s * 0.42, D.yb + 0.15, (bz0 + bz1) / 2); gb.geo(c, MAT.under); }
  }
}
// ---------------------------------------------------------------- light bars, taxi signs, bus destination sign
function addRoofEquipment(gb, D, t, Q) {
  const top = t.box ? t.box.top : D.roofY, zb = t.box ? t.box.front - 0.2 : (D.rcF + D.rcR) / 2 + 0.1;
  if (t.taxi) {
    const b = G.rbox(0.66, 0.04, 0.26, 0.015, 1); place(b, 0, top + 0.02, zb); gb.geo(b, MAT.black);
    const s = G.box(0.58, 0.17, 0.2); place(s, 0, top + 0.12, zb); gb.geo(s, MAT.sign);
  }
  if (t.police === 'bar' || t.police === 'ambulance' || t.police === 'fire') {
    const bw = Math.min(1.3, D.hw * 2 - 0.5);
    const base = G.rbox(bw + 0.1, 0.05, 0.3, 0.02, 1); place(base, 0, top + 0.03, zb); gb.geo(base, MAT.black);
    const r = G.rbox(bw / 2 - 0.04, 0.1, 0.24, 0.04, Q.detail > 1 ? 2 : 1); place(r, bw / 4 + 0.02, top + 0.1, zb); gb.geo(r, MAT.red);
    const b = G.rbox(bw / 2 - 0.04, 0.1, 0.24, 0.04, Q.detail > 1 ? 2 : 1); place(b, -bw / 4 - 0.02, top + 0.1, zb); gb.geo(b, MAT.blue);
  }
  if (t.police === 'hidden') for (const [m, x] of [[MAT.red, 0.2], [MAT.blue, -0.2]]) { const g = G.box(0.1, 0.03, 0.03); place(g, x, D.belt + 0.1, D.zAg - 0.3); gb.geo(g, m); }
  if (t.busLivery) { const g = G.box(D.hw * 2 - 0.7, 0.22, 0.03); place(g, 0, D.roofY - 0.22, D.zf - 0.1); gb.geo(g, MAT.sign); }
  if (t.pushBar && Q.detail > 0) {
    const zf = D.zf + 0.12, y0 = D.ybF;
    for (const x of [0.28, -0.28]) { const g = G.box(0.05, 0.42, 0.05); place(g, x, y0 + 0.3, zf); gb.geo(g, MAT.black); }
    for (const y of [0.2, 0.46]) { const g = G.box(D.hw * 1.0, 0.05, 0.05); place(g, 0, y0 + y, zf); gb.geo(g, MAT.black); }
  }
  if (t.wing && Q.detail > 0) {
    const zw = D.zr + 0.25, y = D.tailY + (t.wedge ? 0.28 : 0.13);
    const g = G.rbox(D.hw * 2 - 0.24, 0.03, 0.26, 0.012, 1); place(g, 0, y, zw); gb.geo(g, MAT.gloss);
    for (const s of [1, -1]) { const p = G.box(0.03, y - D.tailY, 0.1); place(p, s * (D.hw - 0.45), (y + D.tailY) / 2, zw + 0.02); gb.geo(p, MAT.gloss); }
  }
  if (t.hoodScoop && Q.detail > 0) {
    const zs = (D.zAg + D.topF) / 2, g = G.sph(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(0.3, 0.08, 0.42);
    place(g, 0, Hlid(D, 0, zs) - 0.01, zs); gb.geo(g, MAT.paint);
    const v = G.box(0.4, 0.05, 0.02); place(v, 0, Hlid(D, 0, zs) + 0.035, zs + 0.38); gb.geo(v, MAT.grilleHex);
  }
}

// engine kinds per model key (filled by carModel2 so the body knows EVs without importing the catalog)
export const MODELSENGINE = new Map();
export function bodyCacheStats() { return { entries: cache.size }; }
