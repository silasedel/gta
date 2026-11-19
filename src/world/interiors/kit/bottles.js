// Interior art kit: procedural liquor bottles for back bars, shelves and tables.
// Seven lathe shapes (whisky, square decanter, gin, vodka, rum, tequila, wine/champagne, liqueur flask), each instanced: one draw
// for the glass+liquid+cap body and one for the label band, whatever the bottle count. Labels are painted once into a shared
// atlas of invented brands (no real names). Bottles are lit by the interior bake (one sample per bottle) and reflect the room probe;
// the liquid glows when the shelf under it is lit (o.glow), which is what makes a lit back bar read.
//   const B = new BottleField(ctx); B.add(x, y, z, ry, { shape, liquid, level, glow }); ... B.row(x0, x1, y, z, o); ... B.build();
import * as THREE from 'three';
import { rng } from './util.js';

// ---------------------------------------------------------------- shapes: profile [r, y] (meters), label band [y0, y1], cap
const SHAPES = {
  whisky: {
    p: [
      [0.038, 0],
      [0.042, 0.004],
      [0.043, 0.16],
      [0.04, 0.19],
      [0.03, 0.215],
      [0.013, 0.235],
      [0.012, 0.27],
      [0.014, 0.275],
    ],
    band: [0.03, 0.14],
    cap: [0.0145, 0.275, 0.03],
    seg: 14,
  },
  decanter: {
    p: [
      [0.046, 0],
      [0.05, 0.005],
      [0.05, 0.15],
      [0.044, 0.17],
      [0.018, 0.19],
      [0.014, 0.22],
      [0.018, 0.225],
    ],
    band: [0.035, 0.12],
    cap: [0.026, 0.225, 0.045],
    seg: 4,
    rot: Math.PI / 4,
  },
  gin: {
    p: [
      [0.039, 0],
      [0.041, 0.005],
      [0.041, 0.2],
      [0.035, 0.235],
      [0.016, 0.26],
      [0.014, 0.3],
      [0.016, 0.305],
    ],
    band: [0.04, 0.17],
    cap: [0.016, 0.305, 0.025],
    seg: 14,
  },
  vodka: {
    p: [
      [0.034, 0],
      [0.036, 0.004],
      [0.036, 0.22],
      [0.03, 0.26],
      [0.013, 0.285],
      [0.012, 0.32],
      [0.014, 0.325],
    ],
    band: [0.05, 0.2],
    cap: [0.014, 0.325, 0.03],
    seg: 14,
  },
  rum: {
    p: [
      [0.045, 0],
      [0.047, 0.005],
      [0.047, 0.13],
      [0.042, 0.16],
      [0.022, 0.19],
      [0.015, 0.215],
      [0.015, 0.24],
      [0.017, 0.245],
    ],
    band: [0.025, 0.12],
    cap: [0.017, 0.245, 0.025],
    seg: 14,
  },
  tequila: {
    p: [
      [0.05, 0],
      [0.051, 0.006],
      [0.044, 0.09],
      [0.04, 0.16],
      [0.032, 0.2],
      [0.016, 0.225],
      [0.015, 0.25],
      [0.017, 0.255],
    ],
    band: [0.03, 0.14],
    cap: [0.03, 0.255, 0.05],
    seg: 14,
  },
  wine: {
    p: [
      [0.037, 0],
      [0.038, 0.004],
      [0.038, 0.19],
      [0.034, 0.215],
      [0.016, 0.245],
      [0.014, 0.3],
      [0.0155, 0.305],
    ],
    band: [0.05, 0.15],
    cap: [0.0158, 0.27, 0.04],
    seg: 14,
  },
  flask: {
    p: [
      [0.04, 0],
      [0.046, 0.03],
      [0.047, 0.1],
      [0.038, 0.15],
      [0.016, 0.175],
      [0.013, 0.2],
      [0.015, 0.205],
    ],
    band: [0.035, 0.11],
    cap: [0.016, 0.205, 0.022],
    seg: 14,
  },
};
export const BOTTLE_SHAPES = Object.keys(SHAPES);

// ---------------------------------------------------------------- invented brands (never real names)
const BRANDS = [
  ['Pelican Reach', 'whisky', 'SINGLE CASK'],
  ['Old Tarpon', 'whisky', 'STRAIGHT BOURBON'],
  ['Marrow Creek', 'whisky', 'RYE'],
  ['Glen Corvo', 'decanter', 'AGED 12 YEARS'],
  ['Harbor Oak', 'whisky', 'SMALL BATCH'],
  ['Seven Keys', 'decanter', 'RESERVE'],
  ['Calloway Bend', 'whisky', 'SOUR MASH'],
  ['Ironheron', 'decanter', 'BLENDED'],
  ['Isla Vela', 'rum', 'AÑEJO'],
  ['Ron Garza', 'rum', 'BLANCO'],
  ['Manatí', 'rum', 'DARK RUM'],
  ['Brisa', 'rum', 'SPICED'],
  ['Marea Negra', 'rum', 'OVERPROOF'],
  ['Mangrove', 'gin', 'DRY GIN'],
  ['Saltmarsh', 'gin', 'LONDON DRY'],
  ['Heron & Lime', 'gin', 'CITRUS GIN'],
  ['Bay Botanic', 'gin', 'NAVY STRENGTH'],
  ['Velo', 'vodka', 'VODKA'],
  ['Kirova', 'vodka', 'TRIPLE DISTILLED'],
  ['Polar Strait', 'vodka', 'WINTER WHEAT'],
  ['Sol de Piedra', 'tequila', 'REPOSADO'],
  ['Cielo Rojo', 'tequila', 'BLANCO'],
  ['Dos Halcones', 'tequila', 'AÑEJO'],
  ['Amaro Vespa', 'flask', 'AMARO'],
  ['Crème Southline', 'flask', 'LIQUEUR'],
  ['Naranja Dulce', 'flask', 'TRIPLE SEC'],
  ['Bitter Isla', 'flask', 'APERITIVO'],
  ['Maison Ravel', 'wine', 'BRUT'],
  ['Vallon', 'wine', 'ROSÉ'],
  ['Casa Lumbre', 'wine', 'TINTO'],
  ['Undertow Club', 'decanter', 'HOUSE RESERVE'],
  ['Blue Heron', 'gin', 'OLD TOM'],
  ['Copper Jack', 'whisky', 'TENNESSEE STYLE'],
  ['Cayo Verde', 'rum', 'GOLD'],
  ['Norte', 'vodka', 'CITRON'],
  ['Mezcal Brujo', 'tequila', 'MEZCAL'],
  ['Coral Point', 'rum', 'COCONUT'],
  ['Fennel & Fig', 'flask', 'HERBAL'],
  ['Silver Mullet', 'vodka', 'PREMIUM'],
  ['Biscayne Barrel', 'whisky', 'CASK STRENGTH'],
];
// liquid colors by family (linear-ish sRGB 0..1) and glass tints
const LIQ = {
  whisky: [
    [0.62, 0.3, 0.06],
    [0.7, 0.38, 0.1],
    [0.5, 0.22, 0.05],
  ],
  decanter: [
    [0.58, 0.26, 0.05],
    [0.66, 0.34, 0.08],
  ],
  rum: [
    [0.45, 0.18, 0.04],
    [0.8, 0.55, 0.2],
    [0.6, 0.3, 0.06],
  ],
  gin: [
    [0.6, 0.85, 0.75],
    [0.55, 0.75, 0.85],
    [0.8, 0.6, 0.3],
  ],
  vodka: [
    [0.75, 0.55, 0.3],
    [0.9, 0.93, 0.98],
  ],
  tequila: [
    [0.92, 0.88, 0.75],
    [0.8, 0.6, 0.25],
  ],
  flask: [
    [0.75, 0.16, 0.1],
    [0.9, 0.5, 0.1],
    [0.25, 0.5, 0.12],
    [0.6, 0.1, 0.35],
  ],
  wine: [
    [0.32, 0.03, 0.06],
    [0.9, 0.55, 0.5],
    [0.85, 0.8, 0.55],
  ],
};
const GLASS = {
  whisky: [[0.5, 0.44, 0.38]],
  decanter: [[0.75, 0.75, 0.78]],
  rum: [
    [0.3, 0.22, 0.14],
    [0.6, 0.6, 0.62],
  ],
  gin: [
    [0.55, 0.75, 0.78],
    [0.35, 0.5, 0.6],
  ],
  vodka: [[0.8, 0.82, 0.86]],
  tequila: [[0.75, 0.78, 0.8]],
  flask: [[0.6, 0.6, 0.62]],
  wine: [
    [0.1, 0.18, 0.08],
    [0.16, 0.12, 0.08],
  ],
};
const CAPS = [
  [0.08, 0.08, 0.09],
  [0.55, 0.42, 0.18],
  [0.75, 0.75, 0.78],
  [0.35, 0.05, 0.06],
  [0.05, 0.08, 0.2],
  [0.22, 0.14, 0.08],
];

// ---------------------------------------------------------------- label atlas (shared, painted once)
const CELLS = 8;
let ATLAS = null;
const LABEL_STYLES = [
  ['#f2e6c8', '#1c1a18', '#a8842c'],
  ['#101012', '#d9b45a', '#d9b45a'],
  ['#7a1420', '#f6e9d0', '#e3c070'],
  ['#0f2a3d', '#f3efe2', '#c9a24a'],
  ['#f7f7f2', '#20242a', '#2a7a6b'],
  ['#1d3b2a', '#f0e6c8', '#d4b062'],
  ['#e8d6a8', '#5a1d14', '#5a1d14'],
  ['#2b1838', '#f2d8ff', '#ff6ad5'],
  ['#d7dde2', '#14202a', '#14202a'],
  ['#c8401c', '#fff2e0', '#ffe0a0'],
];
function labelAtlas() {
  if (ATLAS) return ATLAS;
  const S = 1024,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'),
    cw = S / CELLS,
    R = rng(9157, 'labels');
  g.fillStyle = '#222';
  g.fillRect(0, 0, S, S);
  BRANDS.forEach(([name, fam, sub], i) => {
    const x0 = (i % CELLS) * cw,
      y0 = Math.floor(i / CELLS) * cw,
      st = LABEL_STYLES[(i * 7 + 3) % LABEL_STYLES.length],
      [bg, ink, acc] = st;
    g.save();
    g.translate(x0, y0);
    g.fillStyle = bg;
    g.fillRect(0, 0, cw, cw);
    const grd = g.createLinearGradient(0, 0, cw, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.25)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    grd.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = grd;
    g.fillRect(0, 0, cw, cw);
    g.strokeStyle = acc;
    g.lineWidth = 2;
    g.strokeRect(6, 6, cw - 12, cw - 12);
    if (i % 3 === 0) {
      g.lineWidth = 1;
      g.strokeRect(10, 10, cw - 20, cw - 20);
    }
    // emblem: crest / circle / bird / star per brand
    const ex = cw / 2,
      ey = cw * 0.3;
    g.fillStyle = acc;
    g.strokeStyle = acc;
    g.lineWidth = 2;
    const e = i % 4;
    if (e === 0) {
      g.beginPath();
      g.arc(ex, ey, 14, 0, 7);
      g.stroke();
      g.beginPath();
      g.arc(ex, ey, 9, 0, 7);
      g.fill();
    } else if (e === 1) {
      g.beginPath();
      g.moveTo(ex - 13, ey - 12);
      g.lineTo(ex + 13, ey - 12);
      g.lineTo(ex + 13, ey + 2);
      g.quadraticCurveTo(ex, ey + 18, ex - 13, ey + 2);
      g.closePath();
      g.stroke();
      g.font = '700 13px Georgia, serif';
      g.textAlign = 'center';
      g.fillText(name[0], ex, ey + 4);
    } else if (e === 2) {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5,
          r = k % 2 ? 6 : 14;
        g.lineTo(ex + Math.cos(a) * r, ey + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else {
      g.beginPath();
      g.moveTo(ex - 16, ey + 6);
      g.quadraticCurveTo(ex - 4, ey - 14, ex + 2, ey - 2);
      g.quadraticCurveTo(ex + 8, ey - 12, ex + 16, ey - 8);
      g.stroke();
      g.beginPath();
      g.moveTo(ex + 2, ey - 2);
      g.lineTo(ex, ey + 12);
      g.stroke();
    }
    // name (fit to width), sub line, small print
    g.textAlign = 'center';
    g.fillStyle = ink;
    let fs = 24;
    const serif =
      i % 2 ? 'Georgia, "Times New Roman", serif' : '"Didot", "Bodoni 72", Georgia, serif';
    g.font = `700 ${fs}px ${serif}`;
    while (g.measureText(name.toUpperCase()).width > cw - 22 && fs > 10) {
      fs--;
      g.font = `700 ${fs}px ${serif}`;
    }
    g.fillText(name.toUpperCase(), ex, cw * 0.62);
    g.fillStyle = acc;
    g.font = `600 10px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(sub, ex, cw * 0.75);
    g.fillStyle = ink;
    g.globalAlpha = 0.6;
    g.font = '8px Arial, sans-serif';
    g.fillText(`${40 + (i % 7)}% ALC/VOL · ${700 + (i % 3) * 50} ML`, ex, cw * 0.87);
    g.globalAlpha = 1;
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.05})`;
      g.fillRect(R() * cw, R() * cw, 2, 2);
    }
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.id2 = 'bottleLabels';
  ATLAS = {
    tex: t,
    rect: (i) => {
      const x = (i % CELLS) / CELLS,
        y = Math.floor(i / CELLS) / CELLS,
        d = 1 / CELLS;
      return [x + 0.01 * d, 1 - y - d + 0.01 * d, d * 0.98, d * 0.98];
    },
  };
  return ATLAS;
}
export const brandsFor = (fam) =>
  BRANDS.map((b, i) => [b, i])
    .filter(([b]) => !fam || b[1] === fam)
    .map(([, i]) => i);

// ---------------------------------------------------------------- geometry per shape (body+cap with a part attribute, label band)
const GEO = new Map();
function shapeGeo(name) {
  let g = GEO.get(name);
  if (g) return g;
  const S = SHAPES[name],
    H = S.p[S.p.length - 1][1];
  const body = new THREE.LatheGeometry(
    S.p.map(([r, y]) => new THREE.Vector2(r, y)),
    S.seg,
  );
  if (S.rot) body.rotateY(S.rot);
  const [cr, cy, ch] = S.cap,
    cap = new THREE.CylinderGeometry(cr, cr, ch, Math.max(8, S.seg), 1);
  cap.translate(0, cy - ch / 2 + 0.002, 0);
  if (S.rot) cap.rotateY(S.rot);
  const merge = (geos) => {
    let n = 0,
      ni = 0;
    for (const q of geos) {
      n += q.attributes.position.count;
      ni += q.index ? q.index.count : q.attributes.position.count;
    }
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      uv = new Float32Array(n * 2),
      part = new Float32Array(n),
      idx = [];
    let o = 0;
    geos.forEach((q, k) => {
      const c = q.attributes.position.count;
      pos.set(q.attributes.position.array, o * 3);
      nor.set(q.attributes.normal.array, o * 3);
      uv.set(q.attributes.uv.array, o * 2);
      part.fill(k, o, o + c);
      if (q.index) for (let i = 0; i < q.index.count; i++) idx.push(q.index.getX(i) + o);
      else for (let i = 0; i < c; i++) idx.push(i + o);
      o += c;
    });
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.setAttribute('part', new THREE.BufferAttribute(part, 1));
    m.setIndex(idx);
    return m;
  };
  const bodyGeo = merge([body, cap]);
  bodyGeo.userData = { h: H, shared: true };
  // label: front-facing partial cylinder just outside the glass in the band
  const [b0, b1] = S.band;
  let rb = 0;
  for (const [r, y] of S.p) if (y >= b0 && y <= b1) rb = Math.max(rb, r);
  rb = rb * (S.seg === 4 ? 0.74 : 1) + 0.0012;
  const label =
    S.seg === 4
      ? new THREE.PlaneGeometry(rb * 1.9, b1 - b0)
      : new THREE.CylinderGeometry(rb, rb, b1 - b0, 16, 1, true, -1.25, 2.5);
  if (S.seg === 4) label.translate(0, (b0 + b1) / 2, rb * 1.0 + 0.0008);
  else label.translate(0, (b0 + b1) / 2, 0);
  label.userData = { shared: true };
  g = { body: bodyGeo, label, h: H };
  GEO.set(name, g);
  return g;
}

const BODY_PATCH = (sh) => {
  sh.vertexShader =
    'attribute float part;\nattribute float iGlow;\nvarying float vGlow;\nattribute vec4 iLiq;\nattribute vec3 iGlass;\nattribute vec4 iCap;\nvarying float vPart;\nvarying float vY;\nvarying vec4 vLiq;\nvarying vec3 vGlass;\nvarying vec4 vCap;\n' +
    sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tvPart = part; vGlow = iGlow; vY = position.y; vLiq = iLiq; vGlass = iGlass; vCap = iCap;',
    );
  sh.fragmentShader =
    'varying float vGlow;\nvarying float vPart;\nvarying float vY;\nvarying vec4 vLiq;\nvarying vec3 vGlass;\nvarying vec4 vCap;\n' +
    sh.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
	float liquid = step( vY, vLiq.a ) * step( vPart, 0.5 );
	vec3 glassC = vGlass * 0.12;
	diffuseColor.rgb = vPart > 0.5 ? vCap.rgb : mix( glassC, vLiq.rgb * vLiq.rgb * 0.5, liquid );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n\troughnessFactor = vPart > 0.5 ? 0.35 : 0.06;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\n\tmetalnessFactor = vPart > 0.5 ? vCap.a : 0.0;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
	{ float lit = exp( -vY * 9.0 ) * 0.85 + 0.15;
	  totalEmissiveRadiance += pow( vLiq.rgb, vec3( 2.2 ) ) * liquid * lit * uBottleGlow * 1.6 * vGlow;
	  totalEmissiveRadiance += vGlass * ( 1.0 - liquid ) * ( 1.0 - step( 0.5, vPart ) ) * exp( -vY * 14.0 ) * uBottleGlow * 0.18 * vGlow; }`,
      );
  sh.fragmentShader = 'uniform float uBottleGlow;\n' + sh.fragmentShader;
};

export class BottleField {
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    this.list = [];
    this.R = rng(ctx.store.seed, 'bottles');
    this.glow = { value: o.glow ?? 1 };
  }
  // one bottle at (x, y, z) in the current G frame. o: { shape, brand (index), liquid [r,g,b], level 0..1, glow 0..1 (backlight), s (scale) }
  add(x, y, z, ry = 0, o = {}) {
    const { G } = this.ctx,
      R = this.R,
      p = G.local(x, y, z),
      shape = o.shape || R.pick(BOTTLE_SHAPES),
      fam = shape;
    const brands = brandsFor(fam),
      brand = o.brand ?? (brands.length ? R.pick(brands) : R.int(0, BRANDS.length - 1)),
      H = shapeGeo(shape).h;
    const liq = o.liquid || R.pick(LIQ[fam] || LIQ.whisky),
      glass = o.glass || R.pick(GLASS[fam] || GLASS.whisky),
      cap = o.cap || R.pick(CAPS);
    const level =
      H * (o.level ?? (R.chance(0.15) ? R.range(0.12, 0.4) : R.range(0.55, 0.92))) * 0.82;
    this.list.push({
      shape,
      x: p.x,
      y: p.y,
      z: p.z,
      ry: G.yaw() + ry,
      s: o.s || 1,
      brand,
      liq,
      glass,
      cap,
      capMetal: cap[0] > 0.5 && cap[1] > 0.38 ? 0.9 : 0.1,
      level,
      glow: o.glow ?? 1,
    });
  }
  // a shelf row from x0 to x1 at height y (bottom of bottles) and depth z, facing +z. o: { gap, fams, glow, jitter, sparse }
  row(x0, x1, y, z, o = {}) {
    const R = this.R;
    let x = x0 + 0.05;
    const fams = o.fams || BOTTLE_SHAPES;
    while (x < x1 - 0.05) {
      const shape = R.pick(fams),
        w =
          SHAPES[shape].p.reduce((m, q) => Math.max(m, q[0]), 0) *
          2 *
          (SHAPES[shape].seg === 4 ? 1.1 : 1);
      if (x + w > x1) break;
      if (!o.sparse || !R.chance(o.sparse))
        this.add(x + w / 2, y, z + R.jit(o.jitter ?? 0.02), R.jit(0.25), {
          shape,
          glow: o.glow ?? 1,
        });
      x += w + (o.gap ?? 0.012) + R() * 0.01;
    }
  }
  build() {
    const ctx = this.ctx;
    if (!this.list.length) return;
    const at = labelAtlas(),
      M = ctx.M,
      by = new Map();
    for (const b of this.list) {
      let l = by.get(b.shape);
      if (!l) by.set(b.shape, (l = []));
      l.push(b);
    }
    const bodyMat = M.baked(
      'bottle:body',
      () => new THREE.MeshStandardMaterial({ roughness: 0.06, metalness: 0, color: 0xffffff }),
      {
        direct: 0.5,
        spec: 1,
        probe: 1.2,
        patch: (sh) => {
          sh.uniforms.uBottleGlow = this.glow;
          BODY_PATCH(sh);
        },
      },
    );
    const labelMat = M.items(at.tex),
      n = this.list.length,
      pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3),
      order = [];
    let k = 0;
    const _m = new THREE.Matrix4(),
      _q = new THREE.Quaternion(),
      _e = new THREE.Euler(),
      _p = new THREE.Vector3(),
      _s = new THREE.Vector3();
    for (const [shape, list] of by) {
      const g = shapeGeo(shape),
        cnt = list.length,
        bg = g.body.clone(),
        lg = g.label.clone();
      bg.userData = {};
      lg.userData = {};
      const bi = new THREE.InstancedMesh(bg, bodyMat, cnt),
        li = new THREE.InstancedMesh(lg, labelMat, cnt),
        liq = new Float32Array(cnt * 4),
        gl = new Float32Array(cnt * 3),
        cap = new Float32Array(cnt * 4),
        uv = new Float32Array(cnt * 4),
        gw = new Float32Array(cnt);
      list.forEach((b, i) => {
        _e.set(0, b.ry, 0);
        _m.compose(_p.set(b.x, b.y, b.z), _q.setFromEuler(_e), _s.set(b.s, b.s, b.s));
        bi.setMatrixAt(i, _m);
        li.setMatrixAt(i, _m);
        liq.set([b.liq[0], b.liq[1], b.liq[2], b.level], i * 4);
        gl.set(b.glass, i * 3);
        gw[i] = b.glow;
        cap.set([...b.cap, b.capMetal], i * 4);
        uv.set(at.rect(b.brand), i * 4);
        pos.set(
          [b.x + Math.sin(b.ry) * 0.05, b.y + g.h * 0.45, b.z + Math.cos(b.ry) * 0.05],
          k * 3,
        );
        nor.set([Math.sin(b.ry) * 0.85, 0.5, Math.cos(b.ry) * 0.85], k * 3);
        k++;
      });
      bg.setAttribute('iLiq', new THREE.InstancedBufferAttribute(liq, 4));
      bg.setAttribute('iGlass', new THREE.InstancedBufferAttribute(gl, 3));
      bg.setAttribute('iCap', new THREE.InstancedBufferAttribute(cap, 4));
      bg.setAttribute('iGlow', new THREE.InstancedBufferAttribute(gw, 1));
      lg.setAttribute('iUv', new THREE.InstancedBufferAttribute(uv, 4));
      const bk = ['bk0', 'bk1', 'bk2'].map(
        () => new THREE.InstancedBufferAttribute(new Float32Array(cnt * 3), 3),
      );
      ['bk0', 'bk1', 'bk2'].forEach((a, j) => {
        bg.setAttribute(a, bk[j]);
        lg.setAttribute(a, bk[j]);
      });
      for (const im of [bi, li]) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.matrixAutoUpdate = false;
        ctx.group.add(im);
        ctx.disposables.push(im.geometry, { dispose: () => im.dispose() });
      }
      order.push({ bk, cnt });
    }
    // one bake sample per bottle (applied to both instanced meshes of its shape)
    ctx.bakeParts.push({
      pos,
      nor,
      count: n,
      apply: (b0, b1, b2, off) => {
        let j = off;
        for (const o of order) {
          [b0, b1, b2].forEach((src, c) => {
            o.bk[c].array.set(src.subarray(j * 3, (j + o.cnt) * 3));
            o.bk[c].needsUpdate = true;
          });
          j += o.cnt;
        }
      },
    });
    this.count = n;
  }
}
