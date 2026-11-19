// Product catalog and model builders (DESIGN-SYSTEM track). See ../README.md "Products".
// Every product is a real little model at real-world size (meters), origin at the bottom center, front toward +Z,
// with label art rendered from its brand's packaging data. Food has bite stages carved into the geometry.
import { getBrand } from '../brands/index.js';
import { drawMark, MARKS } from '../logos/allmarks.js';
import {
  makeCanvas,
  ctx2d,
  rng,
  hexNum,
  inkOn,
  lighten,
  darken,
  mix,
  barcode,
  wrapText,
  fitText,
  speckle,
} from '../util.js';
import { font } from '../fonts.js';
import { CATALOG } from './data.js';

export const products = CATALOG;
export const productErrors = [];
const byId = new Map(products.map((p) => [p.id, p]));
for (const p of products)
  if (!getBrand(p.brand)) productErrors.push(`${p.id}: unknown brand ${p.brand}`);
export const getProduct = (id) => byId.get(id) || null;
const asList = (v) => (v == null ? null : Array.isArray(v) ? v : [v]);
export function productsFor(q = {}) {
  const c = asList(q.category),
    s = asList(q.sub),
    t = asList(q.tier),
    b = asList(q.brand),
    at = asList(q.soldAt),
    tg = asList(q.tag);
  return products.filter(
    (p) =>
      (!c || c.includes(p.category)) &&
      (!s || s.includes(p.sub)) &&
      (!t || t.includes(p.tier)) &&
      (!b || b.includes(p.brand)) &&
      (!at || at.some((x) => p.soldAt.includes(x))) &&
      (!tg || tg.some((x) => p.tags.includes(x))),
  );
}
export function pickProducts(seed, q, n = 1) {
  return rng(seed).shuffle(productsFor(q)).slice(0, n);
}

// ---------------------------------------------------------------- label art
const STYLE_FAMILY = {
  'bold-block': 'bold',
  'loud-burst': 'loud',
  'neon-energy': 'loud',
  'kids-cartoon': 'loud',
  'retro-stripe': 'stripe',
  'vintage-label': 'classic',
  'bodega-classic': 'classic',
  'heritage-crest': 'classic',
  minimal: 'minimal',
  clinical: 'minimal',
  'tech-clean': 'minimal',
  'store-brand': 'bold',
  'luxe-foil': 'luxe',
  'craft-kraft': 'craft',
  'hand-lettered': 'craft',
  'tropical-illustrated': 'stripe',
};
function nutritionPanel(g, p, x, y, w, h, ink = '#111', paper = '#fff') {
  const n = p.nutrition || {};
  g.fillStyle = paper;
  g.fillRect(x, y, w, h);
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, w * 0.012);
  g.strokeRect(x, y, w, h);
  const px = h / 11;
  g.fillStyle = ink;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = font('groteskBlack', px * 1.25);
  g.fillText('Nutrition Facts', x + w * 0.04, y + px * 0.25);
  g.fillRect(x + w * 0.04, y + px * 1.75, w * 0.92, px * 0.28);
  const rows = [
    ['Calories', n.kcal ?? 0, ''],
    ['Total Fat', n.fat ?? 0, 'g'],
    ['Sodium', n.sodium ?? 0, 'mg'],
    ['Total Carb.', n.carbs ?? 0, 'g'],
    ['  Sugars', n.sugar ?? 0, 'g'],
    ['Protein', n.protein ?? 0, 'g'],
    ...(n.caffeine ? [['Caffeine', n.caffeine, 'mg']] : []),
  ];
  rows.forEach((r, i) => {
    const yy = y + px * (2.3 + i * 1.15);
    g.font = font(i === 0 ? 'groteskBlack' : 'textNarrowBold', px * (i === 0 ? 1.05 : 0.85));
    g.textAlign = 'left';
    g.fillText(r[0], x + w * 0.04, yy);
    g.textAlign = 'right';
    g.fillText(r[1] + r[2], x + w * 0.96, yy);
    g.fillRect(x + w * 0.04, yy + px * 1.02, w * 0.92, 1);
  });
}
// Front panel of a package in a w x h box.
function drawFront(g, p, b, x, y, w, h) {
  const P = b.palette,
    pk = b.packaging || {},
    fam = STYLE_FAMILY[pk.style] || 'bold',
    mo = p.modelOpts || {};
  const flavor = mo.flavorColor || P.accent;
  const bg =
    mo.bg ||
    (fam === 'minimal'
      ? P.paper
      : fam === 'luxe'
        ? P.ink
        : fam === 'craft'
          ? '#c9a878'
          : P[pk.bg] || P.primary);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x, y);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, lighten(bg, 0.08));
  gr.addColorStop(1, darken(bg, 0.14));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const fg = inkOn(bg, P.paper, P.ink);
  if (fam === 'bold') {
    g.fillStyle = flavor;
    g.beginPath();
    g.moveTo(0, h * 0.62);
    g.lineTo(w, h * 0.48);
    g.lineTo(w, h * 0.8);
    g.lineTo(0, h * 0.94);
    g.fill();
    g.fillStyle = P.secondary;
    g.fillRect(0, h * 0.965, w, h * 0.035);
  } else if (fam === 'loud') {
    g.save();
    g.translate(w / 2, h * 0.36);
    g.fillStyle = mix(bg, '#ffffff', 0.18);
    for (let i = 0; i < 16; i++) {
      g.rotate(Math.PI / 8);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-w * 0.12, -h);
      g.lineTo(w * 0.12, -h);
      g.fill();
    }
    g.restore();
    g.fillStyle = flavor;
    g.fillRect(0, h * 0.72, w, h * 0.2);
  } else if (fam === 'stripe') {
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? P.secondary : flavor;
      g.fillRect(0, h * (0.6 + i * 0.045), w, h * 0.03);
    }
  } else if (fam === 'classic') {
    g.strokeStyle = P.secondary;
    g.lineWidth = w * 0.02;
    g.strokeRect(w * 0.05, h * 0.04, w * 0.9, h * 0.92);
    g.lineWidth = w * 0.006;
    g.strokeRect(w * 0.08, h * 0.06, w * 0.84, h * 0.88);
  } else if (fam === 'luxe') {
    g.strokeStyle = P.secondary;
    g.lineWidth = w * 0.008;
    g.strokeRect(w * 0.07, h * 0.05, w * 0.86, h * 0.9);
  } else if (fam === 'craft') {
    speckle(g, 0, 0, w, h, 900, p.id, 0.12);
    g.fillStyle = P.primary;
    g.fillRect(0, h * 0.7, w, h * 0.14);
  } else {
    g.fillStyle = flavor;
    g.fillRect(0, h * 0.74, w, h * 0.1);
  }
  // brand logo
  b.drawLogoOn(g, bg, w * 0.1, h * 0.07, w * 0.8, h * 0.34);
  // illustration
  const icon = mo.icon || pk.icon;
  if (icon && MARKS[icon]) {
    const s = Math.min(w, h) * 0.3;
    g.save();
    g.translate(w / 2 - s / 2, h * 0.43);
    drawMark(
      g,
      s,
      {
        ...P,
        primary: fam === 'luxe' ? P.secondary : fg === P.paper ? P.paper : flavor,
        secondary: fam === 'luxe' ? P.secondary : P.secondary,
        accent: flavor,
      },
      icon,
    );
    g.restore();
  }
  // variant name
  const name = (
    mo.variant ||
    p.variant ||
    p.name.replace(
      new RegExp('^' + b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'),
      '',
    )
  ).toUpperCase();
  const bandBg = fam === 'bold' || fam === 'loud' ? flavor : fam === 'craft' ? P.primary : bg;
  g.fillStyle = fam === 'luxe' ? P.secondary : inkOn(bandBg, '#ffffff', P.ink);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const f = (px) =>
    font(
      fam === 'luxe' ? 'gillLight' : b.fonts.text === 'text' ? 'condHeavy' : b.fonts.text,
      px,
      fam === 'luxe' ? {} : { weight: 800 },
    );
  const lines =
    name.length > 14 && name.includes(' ')
      ? [
          name.slice(0, name.lastIndexOf(' ', Math.ceil(name.length / 2) + 3)),
          name.slice(name.lastIndexOf(' ', Math.ceil(name.length / 2) + 3) + 1),
        ]
      : [name];
  lines.forEach((ln, i) => {
    fitText(g, ln, w * 0.84, h * 0.085, f);
    g.fillText(ln, w / 2, h * (0.8 + (i - (lines.length - 1) / 2) * 0.085));
  });
  if (mo.net) {
    g.font = font('textNarrowBold', h * 0.035);
    g.fillStyle = fg;
    g.fillText(mo.net, w / 2, h * 0.94);
  }
  if (mo.claim) {
    g.save();
    g.translate(w * 0.82, h * 0.5);
    g.rotate(-0.25);
    g.fillStyle = P.secondary;
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2,
        r = w * (i % 2 ? 0.1 : 0.125);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = inkOn(P.secondary, '#fff', P.ink);
    fitText(g, mo.claim, w * 0.17, h * 0.04, (px) => font('condHeavy', px));
    g.fillText(mo.claim, 0, 0);
    g.restore();
  }
  g.restore();
}
function drawBack(g, p, b, x, y, w, h) {
  const P = b.palette;
  g.save();
  g.translate(x, y);
  g.fillStyle = darken(P.primary, 0.1);
  g.fillRect(0, 0, w, h);
  const fg = inkOn(P.primary, '#ffffff', P.ink);
  b.drawLogoOn(g, P.primary, w * 0.25, h * 0.03, w * 0.5, h * 0.12);
  g.fillStyle = fg;
  g.font = font('textNarrow', h * 0.028);
  g.textAlign = 'left';
  g.textBaseline = 'top';
  wrapText(g, (b.story || '') + ' ' + (b.tagline || ''), w * 0.84)
    .slice(0, 5)
    .forEach((ln, i) => g.fillText(ln, w * 0.08, h * (0.17 + i * 0.034)));
  if (p.nutrition) nutritionPanel(g, p, w * 0.08, h * 0.37, w * 0.5, h * 0.4, '#111', '#fff');
  barcode(g, w * 0.62, h * 0.62, w * 0.3, h * 0.15, p.id);
  g.fillStyle = fg;
  g.font = font('textNarrow', h * 0.022);
  wrapText(
    g,
    `Distributed by ${b.legal || b.name + ' Co.'}, Southline. ${p.price ? '' : ''}Please recycle.`,
    w * 0.84,
  )
    .slice(0, 3)
    .forEach((ln, i) => g.fillText(ln, w * 0.08, h * (0.82 + i * 0.03)));
  g.restore();
}
const labelCache = new Map();
// Flat label art. kind 'wrap' (2:1, front centered, back info at the seam) for cans and bottles; 'front' / 'back' for flat faces.
export function labelCanvas(id, size = 512, kind) {
  const p = typeof id === 'string' ? getProduct(id) : id;
  if (!p) return null;
  const b = getBrand(p.brand);
  if (!b) return null;
  kind = kind || LABEL_KIND[p.model] || 'front';
  const key = p.id + '|' + size + '|' + kind;
  if (labelCache.has(key)) return labelCache.get(key);
  let c;
  if (kind === 'wrap') {
    c = makeCanvas(size * 2, size);
    const g = ctx2d(c);
    drawBack(g, p, b, 0, 0, size * 2, size);
    drawFront(g, p, b, size * 0.5, 0, size, size);
  } else if (kind === 'back') {
    c = makeCanvas(size, Math.round(size * (p.modelOpts?.aspect || 1.4)));
    drawBack(ctx2d(c), p, b, 0, 0, c.width, c.height);
  } else {
    c = makeCanvas(size, Math.round(size * (p.modelOpts?.aspect || 1.4)));
    drawFront(ctx2d(c), p, b, 0, 0, c.width, c.height);
  }
  labelCache.set(key, c);
  return c;
}
const LABEL_KIND = { can: 'wrap', bottle: 'wrap', cup: 'wrap', jar: 'wrap', tube: 'wrap' };

// ---------------------------------------------------------------- model kit
const cache = new Map();
let grainTex = null;
function tex(THREE, canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}
function grain(THREE) {
  // shared fine surface noise so no product surface is perfectly flat
  if (grainTex) return grainTex;
  const c = makeCanvas(128, 128),
    g = ctx2d(c);
  const r = rng('grain');
  const d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 110;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  grainTex = new THREE.CanvasTexture(c);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.repeat.set(3, 3);
  return grainTex;
}
const M = (THREE, color, rough = 0.6, metal = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color: typeof color === 'string' ? hexNum(color) : color,
    roughness: rough,
    metalness: metal,
    bumpMap: grain(THREE),
    bumpScale: extra.bump ?? 0.6,
    roughnessMap: extra.flatRough ? null : grain(THREE),
    ...extra,
    bump: undefined,
    flatRough: undefined,
  });
const lathe = (THREE, pts, seg = 28) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(0.00001, r), y)),
    seg,
  );
const mesh = (THREE, geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};
function labelBand(THREE, p, r, y0, y1, size) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 40, 1, true);
  const m = mesh(
    THREE,
    g,
    new THREE.MeshStandardMaterial({
      map: tex(THREE, labelCanvas(p, size, 'wrap')),
      roughness: p.modelOpts?.gloss ?? 0.42,
      metalness: p.model === 'can' ? 0.35 : 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    0,
    (y0 + y1) / 2,
    0,
  );
  m.rotation.y = Math.PI;
  return m;
}
function faceBox(THREE, p, w, h, d, size, sideColor) {
  // carton: label on front, info on back, brand color on the sides
  const b = getBrand(p.brand);
  const side = M(THREE, sideColor || b.palette.primary, 0.55);
  const mk = (kind) =>
    new THREE.MeshStandardMaterial({
      map: tex(
        THREE,
        labelCanvas({ ...p, modelOpts: { ...p.modelOpts, aspect: h / w } }, size, kind),
      ),
      roughness: 0.5,
      bumpMap: grain(THREE),
      bumpScale: 0.3,
    });
  const m = mesh(
    THREE,
    new THREE.BoxGeometry(w, h, d),
    [side, side, side, side, mk('front'), mk('back')],
    0,
    h / 2,
    0,
  );
  return m;
}
// Carve bite marks out of every mesh flagged userData.bite: vertices inside the bite sphere are pushed onto its surface.
function applyBites(THREE, group, bite, total, interior) {
  if (!bite) return;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const len = box.max.x - box.min.x;
  const cx = box.max.x - (bite / total) * len * 0.98 + len * 0.06,
    r = Math.max(len * 0.16, (box.max.z - box.min.z) * 0.62);
  const cy = (box.min.y + box.max.y) / 2;
  const v = new THREE.Vector3(),
    inv = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isMesh || !o.userData.bite) return;
    o.geometry = o.geometry.clone();
    const pos = o.geometry.attributes.position;
    inv.copy(o.matrixWorld).invert();
    const col = new Float32Array(pos.count * 3).fill(1);
    const ic = new THREE.Color(o.userData.inside || interior || 0xf3e2b8);
    const bc = o.material.color.clone();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      let hit = false;
      if (v.x > cx) {
        v.x = cx - (v.x - cx) * 0.02;
        hit = true;
      }
      for (const dz of [-0.6, 0, 0.6]) {
        const sx = cx - r * 0.25,
          sz = dz * r,
          dx = v.x - sx,
          dzz = v.z - sz,
          d = Math.hypot(dx, dzz);
        if (d < r * 0.62) {
          const k = (r * 0.62) / (d || 1e-6);
          v.x = sx + dx * k * (dx > 0 ? -0.2 : 1);
          v.z = sz + dzz * (dx > 0 ? 1 : k);
          hit = true;
        }
      }
      if (hit) {
        ic.toArray(col, i * 3);
        pos.setXYZ(i, ...v.applyMatrix4(inv).toArray());
      } else bc.toArray(col, i * 3);
      void cy;
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.geometry.computeVertexNormals();
    o.material = o.material.clone();
    o.material.color.set(0xffffff);
    o.material.vertexColors = true;
  });
}
const biteable = (m, inside) => {
  m.userData.bite = true;
  if (inside != null) m.userData.inside = inside;
  return m;
};

const CAN = {
  '12oz': [0.033, 0.122],
  '16oz': [0.033, 0.157],
  slim: [0.029, 0.156],
  small: [0.0265, 0.134],
  '24oz': [0.036, 0.19],
};
const BOTTLE = {
  // [radius, height, shoulder start, neck radius, label y0, label y1]
  longneck: [0.03, 0.23, 0.13, 0.0125, 0.03, 0.11],
  pet: [0.034, 0.22, 0.15, 0.014, 0.07, 0.14],
  water: [0.032, 0.205, 0.15, 0.014, 0.08, 0.13],
  wine: [0.037, 0.3, 0.17, 0.014, 0.05, 0.14],
  tall: [0.038, 0.3, 0.19, 0.015, 0.05, 0.16],
  squat: [0.05, 0.22, 0.14, 0.017, 0.035, 0.115],
  champagne: [0.044, 0.32, 0.15, 0.015, 0.05, 0.12],
  sauce: [0.022, 0.16, 0.09, 0.011, 0.02, 0.08],
  oil: [0.045, 0.21, 0.15, 0.02, 0.03, 0.13],
};
const BUILDERS = {
  can(THREE, p, o) {
    const [r, h] = CAN[o.size || '12oz'];
    const g = new THREE.Group();
    const al = M(THREE, 0xc9ccd1, 0.28, 0.95, { bump: 0.15 });
    g.add(
      mesh(
        THREE,
        lathe(THREE, [
          [0, 0.003],
          [r * 0.8, 0],
          [r, 0.008],
          [r, h - 0.016],
          [r * 0.83, h - 0.003],
          [r * 0.83, h],
          [r * 0.78, h - 0.004],
          [0, h - 0.004],
        ]),
        al,
      ),
    );
    g.add(labelBand(THREE, p, r + 0.0002, 0.009, h - 0.017, o.labelSize));
    const tab = mesh(
      THREE,
      new THREE.BoxGeometry(0.012, 0.0012, 0.022),
      al,
      0,
      h - 0.0028,
      o.state === 'open' ? -0.004 : 0.004,
    );
    if (o.state === 'open') tab.rotation.x = -0.5;
    g.add(tab);
    if (o.state === 'open') {
      const hole = mesh(
        THREE,
        new THREE.CircleGeometry(0.008, 16),
        new THREE.MeshBasicMaterial({ color: 0x0a0a0a }),
        0,
        h - 0.0038,
        0.013,
      );
      hole.rotation.x = -Math.PI / 2;
      hole.scale.set(0.8, 1.2, 1);
      g.add(hole);
    }
    return g;
  },
  bottle(THREE, p, o) {
    const [r, h, sh, nr, l0, l1] = BOTTLE[o.shape || 'longneck'];
    const g = new THREE.Group();
    const b = getBrand(p.brand);
    const glassCol = o.glass || b.packaging.glass || '#e8f1f2',
      liquid = o.liquid || b.packaging.liquid || '#6b3a12',
      ceramic = o.shape && o.ceramic;
    const prof = [
      [0, 0.004],
      [r * 0.9, 0],
      [r, 0.008],
      [r, sh],
      [r * 0.9, sh + (h - sh) * 0.25],
      [nr * 1.25, sh + (h - sh) * 0.62],
      [nr, sh + (h - sh) * 0.72],
      [nr, h - 0.006],
      [nr * 1.12, h - 0.004],
      [nr * 1.12, h],
    ];
    g.add(
      mesh(
        THREE,
        lathe(
          THREE,
          prof.map(([a, y]) => [a * 0.92, y * (o.fill ?? 0.9) + 0.003]),
        ),
        M(THREE, liquid, 0.25, 0, { flatRough: true, bump: 0 }),
      ),
    );
    g.add(
      mesh(
        THREE,
        lathe(THREE, prof, 36),
        ceramic
          ? M(THREE, glassCol, 0.3)
          : new THREE.MeshPhysicalMaterial({
              color: hexNum(glassCol),
              roughness: 0.06,
              metalness: 0,
              transparent: true,
              opacity: o.opacity ?? 0.42,
              clearcoat: 1,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
      ),
    );
    g.add(labelBand(THREE, p, r + 0.0004, l0, l1, o.labelSize));
    if (o.state !== 'open')
      g.add(
        mesh(
          THREE,
          new THREE.CylinderGeometry(nr * 1.18, nr * 1.18, o.cap === 'cork' ? 0.022 : 0.012, 20),
          M(
            THREE,
            o.capColor || b.palette.secondary,
            o.cap === 'cork' ? 0.9 : 0.35,
            o.cap === 'cork' ? 0 : 0.7,
          ),
          0,
          h + (o.cap === 'cork' ? 0.008 : 0.003),
          0,
        ),
      );
    if (o.foil)
      g.add(
        mesh(
          THREE,
          new THREE.CylinderGeometry(nr * 1.2, nr * 1.5, 0.07, 20, 1, true),
          M(THREE, b.palette.secondary, 0.3, 0.9),
          0,
          h - 0.035,
          0,
        ),
      );
    return g;
  },
  bag(THREE, p, o) {
    const w = o.w || 0.17,
      h = o.h || 0.24,
      d = o.d || 0.06;
    const geo = new THREE.BoxGeometry(w, h, d, 14, 18, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (w / 2),
        y = pos.getY(i) / (h / 2);
      const puff =
        Math.sqrt(Math.max(0, 1 - x * x)) *
        Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y), 3)), 0.6);
      const crimp = Math.abs(y) > 0.9 ? 0.04 : 1;
      pos.setZ(i, pos.getZ(i) * Math.max(0.04, puff) * crimp + Math.sin(x * 9 + y * 7) * 0.0012);
    }
    geo.computeVertexNormals();
    const b = getBrand(p.brand);
    const mk = (kind) =>
      new THREE.MeshStandardMaterial({
        map: tex(
          THREE,
          labelCanvas({ ...p, modelOpts: { ...p.modelOpts, aspect: h / w } }, o.labelSize, kind),
        ),
        roughness: 0.32,
        metalness: 0.25,
      });
    const side = M(THREE, b.palette.primary, 0.3, 0.3);
    return mesh(THREE, geo, [side, side, side, side, mk('front'), mk('back')], 0, h / 2, 0);
  },
  box(THREE, p, o) {
    return faceBox(THREE, p, o.w || 0.19, o.h || 0.27, o.d || 0.06, o.labelSize);
  },
  pack(THREE, p, o) {
    return faceBox(THREE, p, o.w || 0.056, o.h || 0.088, o.d || 0.023, o.labelSize);
  },
  bar(THREE, p, o) {
    const m = faceBox(THREE, p, o.w || 0.15, o.h || 0.045, o.d || 0.014, o.labelSize);
    return m;
  },
  ticket(THREE, p, o) {
    const w = o.w || 0.1,
      h = o.h || 0.15;
    const c = makeCanvas(256, 384),
      g = ctx2d(c);
    const b = getBrand(p.brand);
    g.fillStyle = o.color || b.palette.primary;
    g.fillRect(0, 0, 256, 384);
    b.drawLogoOn(g, o.color || b.palette.primary, 20, 8, 216, 60);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = font('impact', 40);
    fitText(g, p.name.toUpperCase(), 230, 40, (px) => font('impact', px));
    g.fillText(p.name.toUpperCase(), 128, 112);
    g.font = font('condHeavy', 24);
    g.fillText('WIN UP TO $' + (o.top || 5000).toLocaleString('en-US'), 128, 146);
    const r = rng(p.id);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = '#b9bcc0';
      g.beginPath();
      g.roundRect(22 + (i % 3) * 74, 176 + Math.floor(i / 3) * 78, 64, 64, 8);
      g.fill();
      g.fillStyle = '#8d9096';
      g.font = font('mono', 18);
      g.fillText(r() < 0.3 ? '$$$' : '???', 54 + (i % 3) * 74, 216 + Math.floor(i / 3) * 78);
    }
    g.fillStyle = '#fff';
    g.font = font('textNarrowBold', 20);
    g.fillText('$' + p.price + ' · PLAY RESPONSIBLY', 128, 362);
    const m = mesh(
      THREE,
      new THREE.BoxGeometry(w, 0.0006, h),
      [
        M(THREE, 0xf4f4f0),
        M(THREE, 0xf4f4f0),
        new THREE.MeshStandardMaterial({ map: tex(THREE, c), roughness: 0.3 }),
        M(THREE, 0xf4f4f0),
        M(THREE, 0xf4f4f0),
        M(THREE, 0xf4f4f0),
      ],
      0,
      0.0003,
      0,
    );
    return m;
  },
  tube(THREE, p, o) {
    const r = o.r || 0.024,
      h = o.h || 0.15;
    const g = new THREE.Group();
    const b = getBrand(p.brand);
    g.add(
      mesh(
        THREE,
        lathe(THREE, [
          [0, 0],
          [r * 0.7, 0],
          [r * 0.72, 0.022],
          [r, 0.03],
          [r, h * 0.8],
          [r * 0.9, h],
        ]),
        M(THREE, b.palette.paper, 0.5),
      ),
    );
    g.children[0].scale.z = 0.72;
    const lb = labelBand(THREE, p, r + 0.0003, 0.034, h * 0.8, o.labelSize);
    lb.scale.z = 0.72;
    g.add(lb);
    g.add(
      mesh(
        THREE,
        new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.024, 20),
        M(THREE, b.palette.primary, 0.4),
        0,
        0.012,
        0,
      ),
    );
    return g;
  },
  jar(THREE, p, o) {
    const r = o.r || 0.028,
      h = o.h || 0.07;
    const g = new THREE.Group();
    const b = getBrand(p.brand);
    g.add(
      mesh(
        THREE,
        lathe(THREE, [
          [0, 0],
          [r, 0],
          [r, h * 0.82],
          [r * 0.9, h * 0.86],
          [r * 0.9, h * 0.9],
        ]),
        M(THREE, o.body || '#ffffff', 0.35),
      ),
    );
    g.add(labelBand(THREE, p, r + 0.0003, h * 0.1, h * 0.78, o.labelSize));
    if (o.state !== 'open')
      g.add(
        mesh(
          THREE,
          new THREE.CylinderGeometry(r * 0.96, r * 0.96, h * 0.16, 24),
          M(THREE, o.capColor || b.palette.primary, 0.45),
          0,
          h * 0.92,
          0,
        ),
      );
    return g;
  },
  cup(THREE, p, o) {
    const r = o.r || 0.042,
      h = o.h || 0.12,
      rb = r * 0.72;
    const g = new THREE.Group();
    const b = getBrand(p.brand);
    g.add(
      mesh(
        THREE,
        lathe(THREE, [
          [0, 0.002],
          [rb, 0],
          [r, h],
          [r * 0.96, h],
          [rb * 0.96, 0.004],
        ]),
        M(THREE, o.body || '#f6f3ea', 0.75),
      ),
    );
    const band = new THREE.CylinderGeometry(
      r * 0.93 + 0.0004,
      rb + (r - rb) * 0.25 + 0.0004,
      h * 0.55,
      36,
      1,
      true,
    );
    const lb = mesh(
      THREE,
      band,
      new THREE.MeshStandardMaterial({
        map: tex(THREE, labelCanvas(p, o.labelSize, 'wrap')),
        roughness: 0.7,
      }),
      0,
      h * 0.5,
      0,
    );
    lb.rotation.y = Math.PI;
    g.add(lb);
    if (o.state === 'open' || o.noLid) {
      const top = mesh(
        THREE,
        new THREE.CircleGeometry(r * 0.95, 24),
        M(THREE, o.liquid || '#2a1408', 0.15, 0, { flatRough: true, bump: 0 }),
        0,
        h * (0.92 - 0.8 * (o.sipFrac || 0)),
        0,
      );
      top.rotation.x = -Math.PI / 2;
      top.scale.setScalar(1 - 0.25 * (o.sipFrac || 0));
      g.add(top);
    } else {
      g.add(
        mesh(
          THREE,
          lathe(THREE, [
            [r * 1.03, h - 0.004],
            [r * 1.03, h + 0.004],
            [r * 0.9, h + 0.012],
            [0, h + 0.012],
          ]),
          M(THREE, o.lid || '#1b1b1b', 0.5),
        ),
      );
      if (o.straw) {
        const s = mesh(
          THREE,
          new THREE.CylinderGeometry(0.003, 0.003, h * 0.9, 8),
          M(THREE, b.palette.accent, 0.4),
          r * 0.3,
          h * 0.95,
          0,
        );
        s.rotation.z = -0.15;
        g.add(s);
      }
    }
    return g;
  },
  hotdog(THREE, p, o) {
    const g = new THREE.Group();
    const bun = biteable(
      mesh(
        THREE,
        new THREE.CapsuleGeometry(0.02, 0.105, 10, 28),
        M(THREE, 0xd9a05b, 0.85),
        0,
        0.018,
        0,
      ),
      0xf6e7c4,
    );
    bun.rotation.z = Math.PI / 2;
    bun.scale.set(0.82, 1, 1.05);
    g.add(bun);
    const dog = biteable(
      mesh(
        THREE,
        new THREE.CapsuleGeometry(0.0115, 0.135, 10, 28),
        M(THREE, 0xa5432b, 0.45),
        0,
        0.034,
        0,
      ),
      0xc9705a,
    );
    dog.rotation.z = Math.PI / 2;
    g.add(dog);
    if (o.mustard !== false) {
      const pts = [];
      for (let i = 0; i <= 14; i++)
        pts.push(new THREE.Vector3(-0.062 + i * 0.0088, 0.0462, (i % 2 ? 1 : -1) * 0.005));
      g.add(
        biteable(
          mesh(
            THREE,
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0021, 6),
            M(THREE, o.sauce || 0xf2c200, 0.35),
          ),
          o.sauce || 0xf2c200,
        ),
      );
    }
    if (o.onions)
      for (let i = 0; i < 26; i++) {
        const r = rng(p.id + i);
        g.add(
          biteable(
            mesh(
              THREE,
              new THREE.BoxGeometry(0.004, 0.003, 0.004),
              M(THREE, 0xf4f1e4, 0.5),
              -0.06 + r() * 0.12,
              0.045 + r() * 0.002,
              (r() - 0.5) * 0.014,
            ),
            0xf4f1e4,
          ),
        );
      }
    return g;
  },
  burger(THREE, p, o) {
    const g = new THREE.Group();
    const R = o.r || 0.052;
    let y = 0;
    const add = (m) => {
      g.add(biteable(m[0], m[1]));
    };
    add([
      mesh(
        THREE,
        lathe(
          THREE,
          [
            [0, 0],
            [R * 0.92, 0],
            [R, 0.006],
            [R, 0.014],
            [0, 0.016],
          ],
          32,
        ),
        M(THREE, 0xd49a52, 0.85),
      ),
      0xf6e7c4,
    ]);
    y = 0.016;
    for (let k = 0; k < (o.patties || 1); k++) {
      add([
        mesh(
          THREE,
          lathe(
            THREE,
            [
              [0, 0],
              [R * 1.02, 0.001],
              [R * 1.05, 0.006],
              [R * 1.02, 0.011],
              [0, 0.012],
            ],
            32,
          ),
          M(THREE, 0x4a2a1a, 0.95, 0, { bump: 2 }),
          0,
          y,
          0,
        ),
        0x7a4a36,
      ]);
      y += 0.012;
      if (o.cheese !== false) {
        const c = mesh(
          THREE,
          new THREE.BoxGeometry(R * 1.9, 0.0025, R * 1.9, 8, 1, 8),
          M(THREE, 0xf5b62a, 0.5),
          0,
          y + 0.001,
          0,
        );
        c.rotation.y = 0.6 + k;
        add([c, 0xf5b62a]);
        y += 0.003;
      }
    }
    if (o.lettuce !== false) {
      const geo = new THREE.CylinderGeometry(R * 1.12, R * 1.12, 0.004, 40, 1);
      const ps = geo.attributes.position;
      for (let i = 0; i < ps.count; i++)
        ps.setY(
          i,
          ps.getY(i) +
            Math.sin(Math.atan2(ps.getZ(i), ps.getX(i)) * 9) *
              0.003 *
              (Math.hypot(ps.getX(i), ps.getZ(i)) / R),
        );
      geo.computeVertexNormals();
      add([mesh(THREE, geo, M(THREE, 0x5fa83a, 0.6), 0, y + 0.003, 0), 0x8fce5a]);
      y += 0.006;
      add([
        mesh(
          THREE,
          new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.005, 28),
          M(THREE, 0xc8372d, 0.4),
          0,
          y + 0.0025,
          0,
        ),
        0xe0584a,
      ]);
      y += 0.005;
    }
    const top = mesh(
      THREE,
      new THREE.SphereGeometry(R, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      M(THREE, 0xc98a42, 0.7),
      0,
      y,
      0,
    );
    top.scale.y = 0.62;
    add([top, 0xf6e7c4]);
    const r = rng(p.id);
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28,
        d = r() * R * 0.75,
        s = mesh(
          THREE,
          new THREE.SphereGeometry(0.0022, 6, 4),
          M(THREE, 0xf3e6c2, 0.6),
          Math.cos(a) * d,
          y + Math.sqrt(Math.max(0, 1 - (d / R) ** 2)) * R * 0.62 + 0.0005,
          Math.sin(a) * d,
        );
      s.scale.set(1, 0.5, 1.7);
      s.rotation.y = r() * 3;
      add([s, 0xf3e6c2]);
    }
    return g;
  },
  donut(THREE, p, o) {
    const g = new THREE.Group();
    const d = biteable(
      mesh(
        THREE,
        new THREE.TorusGeometry(0.03, 0.017, 18, 44),
        M(THREE, 0xc98f4c, 0.8),
        0,
        0.017,
        0,
      ),
      0xf3dfae,
    );
    d.rotation.x = Math.PI / 2;
    g.add(d);
    const ic = biteable(
      mesh(
        THREE,
        new THREE.TorusGeometry(0.03, 0.0172, 18, 44),
        M(THREE, o.icing || 0xf7e9d0, o.icing ? 0.3 : 0.18, 0, {
          transparent: !o.icing,
          opacity: o.icing ? 1 : 0.75,
        }),
        0,
        0.0215,
        0,
      ),
      0xf3dfae,
    );
    ic.rotation.x = Math.PI / 2;
    ic.scale.set(1, 1, 0.72);
    g.add(ic);
    if (o.sprinkles) {
      const r = rng(p.id);
      const cols = [0xff4d6d, 0x4cc9f0, 0xffd60a, 0x80ed99, 0xffffff];
      for (let i = 0; i < 40; i++) {
        const a = r() * 6.28,
          s = mesh(
            THREE,
            new THREE.CapsuleGeometry(0.0007, 0.003, 2, 5),
            M(THREE, cols[i % 5], 0.4),
            Math.cos(a) * (0.03 + (r() - 0.5) * 0.016),
            0.0335,
            Math.sin(a) * (0.03 + (r() - 0.5) * 0.016),
          );
        s.rotation.set(Math.PI / 2, 0, r() * 3);
        g.add(biteable(s));
      }
    }
    return g;
  },
  pastelito(THREE, p, o) {
    const s = new THREE.Shape();
    const w = 0.1;
    if (o.round) s.absarc(0, 0, 0.042, 0, Math.PI * 2);
    else {
      s.moveTo(-w / 2, -w * 0.35);
      s.lineTo(w / 2, -w * 0.35);
      s.lineTo(0, w * 0.5);
      s.closePath();
    }
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 4,
      curveSegments: 24,
    });
    geo.rotateX(-Math.PI / 2);
    const g = new THREE.Group();
    g.add(
      biteable(
        mesh(THREE, geo, M(THREE, 0xd9a441, 0.38, 0, { bump: 2.5 }), 0, 0.006, 0),
        o.filling || 0xb5173a,
      ),
    );
    return g;
  },
  croqueta(THREE, p) {
    const g = new THREE.Group();
    const c = biteable(
      mesh(
        THREE,
        new THREE.CapsuleGeometry(0.013, 0.045, 8, 20),
        M(THREE, 0xb8732e, 0.95, 0, { bump: 3 }),
        0,
        0.013,
        0,
      ),
      0xf0d9b0,
    );
    c.rotation.z = Math.PI / 2;
    g.add(c);
    return g;
  },
  sandwich(THREE, p, o) {
    const g = new THREE.Group();
    const L = o.len || 0.2,
      W = 0.075;
    const layers = o.layers || [
      [0xd9a85a, 0.014, 0xf6e7c4],
      [0xe9a3a0, 0.005],
      [0xc98b5e, 0.007],
      [0xf2d16b, 0.003],
      [0x6f9a3a, 0.003],
      [0xd9a85a, 0.012, 0xf6e7c4],
    ];
    let y = 0;
    layers.forEach(([c, h, inside], i) => {
      const k = i === 0 || i === layers.length - 1 ? 1 : 0.94 + (i % 2) * 0.05;
      g.add(
        biteable(
          mesh(
            THREE,
            new THREE.BoxGeometry(L * k, h, W * k, 24, 1, 6),
            M(THREE, c, i === 0 || i === layers.length - 1 ? 0.6 : 0.5, 0, { bump: 2 }),
            0,
            y + h / 2,
            0,
          ),
          inside ?? c,
        ),
      );
      y += h;
    });
    return g;
  },
  pizza(THREE, p, o) {
    const s = new THREE.Shape();
    s.moveTo(0.11, 0);
    s.lineTo(-0.09, 0.075);
    s.quadraticCurveTo(-0.1, 0, -0.09, -0.075);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.006,
      bevelEnabled: false,
      curveSegments: 12,
      steps: 1,
    });
    geo.rotateX(-Math.PI / 2);
    const g = new THREE.Group();
    g.add(
      biteable(mesh(THREE, geo, M(THREE, 0xf2c14e, 0.5, 0, { bump: 2 }), 0, 0.006, 0), 0xf6e7c4),
    );
    const cr = biteable(
      mesh(
        THREE,
        new THREE.CapsuleGeometry(0.009, 0.14, 6, 12),
        M(THREE, 0xc98a42, 0.85),
        -0.093,
        0.009,
        0,
      ),
      0xf6e7c4,
    );
    cr.rotation.x = Math.PI / 2;
    g.add(cr);
    if (o.pepperoni !== false)
      [
        [0.03, 0.005],
        [-0.03, 0.03],
        [-0.04, -0.03],
        [0.0, -0.022],
        [-0.065, 0.0],
      ].forEach(([x, z]) =>
        g.add(
          biteable(
            mesh(
              THREE,
              new THREE.CylinderGeometry(0.014, 0.014, 0.002, 16),
              M(THREE, 0xa82a1e, 0.5),
              x,
              0.0132,
              z,
            ),
            0xa82a1e,
          ),
        ),
      );
    return g;
  },
  nigiri(THREE, p, o) {
    const g = new THREE.Group();
    const rice = biteable(
      mesh(
        THREE,
        new THREE.CapsuleGeometry(0.014, 0.03, 8, 16),
        M(THREE, 0xf7f4ea, 0.9, 0, { bump: 4 }),
        0,
        0.012,
        0,
      ),
      0xf7f4ea,
    );
    rice.rotation.z = Math.PI / 2;
    rice.scale.set(0.8, 1, 1.1);
    g.add(rice);
    const fish = biteable(
      mesh(
        THREE,
        new THREE.CapsuleGeometry(0.012, 0.05, 8, 16),
        M(THREE, o.fish || 0xf08a5d, 0.3),
        0,
        0.026,
        0,
      ),
      o.fish || 0xf08a5d,
    );
    fish.rotation.z = Math.PI / 2;
    fish.scale.set(0.38, 1, 1.25);
    g.add(fish);
    return g;
  },
  coconut(THREE, p) {
    const g = new THREE.Group();
    g.add(
      mesh(
        THREE,
        new THREE.SphereGeometry(0.085, 28, 20, 0, Math.PI * 2, 0.5, Math.PI),
        M(THREE, 0x4f8a3a, 0.7, 0, { bump: 2 }),
        0,
        0.085,
        0,
      ),
    );
    const top = mesh(
      THREE,
      new THREE.CircleGeometry(0.041, 24),
      M(THREE, 0xf4f1e4, 0.6),
      0,
      0.1595,
      0,
    );
    top.rotation.x = -Math.PI / 2;
    g.add(top);
    const s = mesh(
      THREE,
      new THREE.CylinderGeometry(0.003, 0.003, 0.16, 8),
      M(THREE, 0xe63946, 0.4),
      0.012,
      0.2,
      0,
    );
    s.rotation.z = -0.2;
    g.add(s);
    return g;
  },
  phone(THREE, p, o) {
    const w = o.w || 0.0715,
      h = o.h || 0.147,
      d = o.d || 0.0078,
      rad = o.rad ?? 0.011;
    const b = getBrand(p.brand);
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + rad, -h / 2);
    s.lineTo(w / 2 - rad, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rad);
    s.lineTo(w / 2, h / 2 - rad);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - rad, h / 2);
    s.lineTo(-w / 2 + rad, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rad);
    s.lineTo(-w / 2, -h / 2 + rad);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rad, -h / 2);
    const body = mesh(
      THREE,
      new THREE.ExtrudeGeometry(s, {
        depth: d - 0.002,
        bevelEnabled: true,
        bevelThickness: 0.001,
        bevelSize: 0.001,
        bevelSegments: 3,
        curveSegments: 8,
      }),
      M(THREE, o.color || '#1c1c1e', o.plastic ? 0.6 : 0.22, o.plastic ? 0 : 0.85, {
        bump: o.plastic ? 1 : 0.1,
      }),
      0,
      h / 2,
      -d / 2 + 0.001,
    );
    g.add(body);
    const c = makeCanvas(256, 512),
      x = ctx2d(c);
    const os = b.os || { accent: b.palette.accent, iconShape: 'circle' };
    const gr = x.createLinearGradient(0, 0, 256, 512);
    gr.addColorStop(0, darken(os.accent, 0.5));
    gr.addColorStop(1, lighten(os.accent, 0.25));
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 512);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.font = font('groteskThin', 64);
    x.fillText('9:41', 128, 110);
    x.font = font('text', 15);
    x.fillText('Friday, November 13', 128, 134);
    const r = rng(p.id);
    const icons = Object.keys(MARKS);
    for (let i = 0; i < 16; i++) {
      const ix = 26 + (i % 4) * 56,
        iy = 190 + Math.floor(i / 4) * 66;
      x.fillStyle = `hsl(${Math.floor(r() * 360)},70%,${40 + r() * 25}%)`;
      x.beginPath();
      if (os.iconShape === 'circle') x.arc(ix + 22, iy + 22, 22, 0, 7);
      else x.roundRect(ix, iy, 44, 44, os.iconShape === 'square' ? 4 : 12);
      x.fill();
      x.save();
      x.translate(ix + 9, iy + 9);
      drawMark(
        x,
        26,
        {
          primary: '#fff',
          secondary: '#fff',
          accent: '#fff',
          ink: '#fff',
          paper: 'rgba(0,0,0,.25)',
        },
        icons[Math.floor(r() * icons.length)],
      );
      x.restore();
    }
    x.fillStyle = 'rgba(255,255,255,.25)';
    x.beginPath();
    x.roundRect(16, 448, 224, 52, 18);
    x.fill();
    x.fillStyle = '#000';
    x.beginPath();
    x.roundRect(96, 10, 64, 18, 9);
    x.fill();
    const bez = o.bezel ?? 0.0025;
    g.add(
      mesh(
        THREE,
        new THREE.PlaneGeometry(w - bez * 2, h - bez * 2),
        new THREE.MeshStandardMaterial({
          map: tex(THREE, c),
          emissiveMap: tex(THREE, c),
          emissive: 0xffffff,
          emissiveIntensity: o.off ? 0 : 0.7,
          roughness: 0.08,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
        0,
        h / 2,
        d / 2 + 0.0002,
      ),
    );
    const cams = o.cams || 1;
    const bump = mesh(
      THREE,
      new THREE.BoxGeometry(
        cams > 1 ? 0.034 : 0.016,
        cams > 2 ? 0.036 : 0.016 * Math.min(cams, 2),
        0.0018,
      ),
      M(THREE, o.color || '#2a2a2c', 0.3, 0.8),
      -w / 2 + (cams > 1 ? 0.024 : 0.016),
      h - (cams > 2 ? 0.026 : 0.02),
      -d / 2 - 0.0006,
    );
    g.add(bump);
    for (let i = 0; i < cams; i++) {
      const l = mesh(
        THREE,
        new THREE.CylinderGeometry(0.0058, 0.0058, 0.0016, 20),
        M(THREE, 0x0a0a0c, 0.05, 0.9),
        bump.position.x + (cams > 1 ? (i % 2 ? 0.008 : -0.008) : 0),
        bump.position.y + (cams > 2 ? (i < 2 ? 0.008 : -0.008) : 0),
        -d / 2 - 0.0018,
      );
      l.rotation.x = Math.PI / 2;
      g.add(l);
    }
    const lg = mesh(
      THREE,
      new THREE.PlaneGeometry(0.026, 0.026),
      new THREE.MeshStandardMaterial({
        map: b.logoTexture(THREE, 256, {
          variant: typeof b.logo.mark === 'function' ? 'mark' : 'full',
          mono: '#c9ccd1',
          square: true,
        }),
        transparent: true,
        roughness: 0.2,
        metalness: 0.8,
      }),
      0,
      h * 0.5,
      -d / 2 - 0.0002,
    );
    lg.rotation.y = Math.PI;
    g.add(lg);
    return g;
  },
  sneaker(THREE, p, o) {
    const b = getBrand(p.brand);
    const g = new THREE.Group();
    const L = o.len || 0.29,
      W = 0.098;
    const col = o.color || b.palette.paper,
      acc = o.accent || b.palette.primary;
    const ss = new THREE.Shape();
    ss.moveTo(0.004, 0);
    ss.lineTo(L * 0.86, 0);
    ss.quadraticCurveTo(L, 0.004, L, 0.026);
    ss.lineTo(L * 0.6, 0.03);
    ss.lineTo(0.0, o.high ? 0.04 : 0.036);
    ss.quadraticCurveTo(-0.004, 0.015, 0.004, 0);
    const ex = (shape, depth, bevel) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: depth - bevel * 2,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 4,
        curveSegments: 16,
      });
      geo.translate(-L / 2, 0, -depth / 2 + bevel);
      geo.rotateY(-Math.PI / 2);
      return geo;
    };
    g.add(
      mesh(THREE, ex(ss, W + 0.006, 0.004), M(THREE, o.sole || '#f4f1e8', 0.8, 0, { bump: 0.6 })),
    );
    const up = new THREE.Shape();
    const top = o.high ? 0.135 : 0.1;
    up.moveTo(0.012, 0.03);
    up.quadraticCurveTo(-0.002, 0.06, 0.012, top - 0.01);
    up.quadraticCurveTo(0.03, top + 0.006, 0.06, top - 0.004);
    up.quadraticCurveTo(0.085, top - 0.022, 0.115, top + 0.002);
    up.quadraticCurveTo(0.2, 0.07, L * 0.86, 0.052);
    up.quadraticCurveTo(L * 0.985, 0.046, L * 0.98, 0.03);
    up.closePath();
    g.add(mesh(THREE, ex(up, W - 0.006, 0.014), M(THREE, col, 0.7, 0, { bump: 0.5 })));
    const toe = new THREE.Shape();
    toe.moveTo(L * 0.7, 0.03);
    toe.quadraticCurveTo(L * 0.8, 0.062, L * 0.9, 0.05);
    toe.quadraticCurveTo(L * 0.99, 0.045, L * 0.98, 0.03);
    toe.closePath();
    g.add(mesh(THREE, ex(toe, W - 0.002, 0.012), M(THREE, acc, 0.6, 0, { bump: 0.5 })));
    const heel = new THREE.Shape();
    heel.moveTo(0.008, 0.03);
    heel.quadraticCurveTo(-0.004, 0.06, 0.01, top - 0.012);
    heel.lineTo(0.05, top - 0.02);
    heel.lineTo(0.06, 0.03);
    heel.closePath();
    g.add(mesh(THREE, ex(heel, W - 0.003, 0.012), M(THREE, acc, 0.6, 0, { bump: 0.5 })));
    for (let i = 0; i < 5; i++) {
      const lace = mesh(
        THREE,
        new THREE.CylinderGeometry(0.0016, 0.0016, W * 0.5, 6),
        M(THREE, o.lace || '#ffffff', 0.9),
        0,
        top - 0.012 - i * 0.008,
        -L / 2 + 0.125 + i * 0.022 + L / 2 - L / 2,
      );
      lace.rotation.z = Math.PI / 2;
      lace.position.z = L / 2 - (0.125 + i * 0.022);
      lace.position.z = -(0.125 + i * 0.022) + L / 2;
      g.add(lace);
    }
    for (const sx of [-1, 1]) {
      const lg = mesh(
        THREE,
        new THREE.PlaneGeometry(0.07, 0.04),
        new THREE.MeshStandardMaterial({
          map: b.logoTexture(THREE, 256, {
            variant: typeof b.logo.mark === 'function' ? 'mark' : 'word',
            mono: acc,
          }),
          transparent: true,
          roughness: 0.6,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
        sx * (W / 2 - 0.0022),
        0.062,
        0.01,
      );
      lg.rotation.y = (sx * Math.PI) / 2;
      g.add(lg);
    }
    g.rotation.y = Math.PI / 2;
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  },
};

function finish(THREE, g, p) {
  const box = new THREE.Box3().setFromObject(g);
  const s = new THREE.Vector3();
  box.getSize(s);
  g.userData = {
    productId: p.id,
    product: p,
    size: { w: s.x, h: s.y, d: s.z },
    grip: new THREE.Vector3(0, s.y * 0.45, 0),
  };
  g.name = 'product:' + p.id;
  return g;
}
// Build a product model. opts: { bite, sip, state, labelSize, shared }
export function buildProduct(THREE, id, opts = {}) {
  const p = getProduct(id);
  if (!p) {
    console.warn('[design] unknown product', id);
    return null;
  }
  const fn = BUILDERS[p.model];
  if (!fn) {
    console.warn('[design] product has no builder', id, p.model);
    return null;
  }
  const bite = Math.min(opts.bite || 0, p.bites || 0),
    state = opts.state || 'closed',
    sip = Math.min(opts.sip || 0, p.sips || 0);
  const key = `${id}|${bite}|${sip}|${state}|${opts.labelSize || 512}`;
  const shared = opts.shared !== false;
  if (shared && cache.has(key)) return cache.get(key).clone();
  const g0 = fn(THREE, p, {
    labelSize: opts.labelSize || 512,
    ...p.modelOpts,
    state: sip ? 'open' : state,
    sipFrac: p.sips ? sip / p.sips : 0,
  });
  const g = g0.isGroup ? g0 : new THREE.Group().add(g0);
  if (bite && p.bites) {
    if (bite >= p.bites) g.visible = false;
    else applyBites(THREE, g, bite, p.bites);
  }
  finish(THREE, g, p);
  if (shared) cache.set(key, g);
  return shared ? g.clone() : g;
}
// Flat list of { geometry, material, matrix } for instanced shelves.
export function productParts(THREE, id, opts = {}) {
  const g = buildProduct(THREE, id, opts);
  if (!g) return [];
  g.updateMatrixWorld(true);
  const out = [];
  g.traverse((o) => {
    if (o.isMesh)
      out.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
  });
  return out;
}
export function disposeProduct(id) {
  for (const [k, g] of cache)
    if (k.startsWith(id + '|')) {
      g.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          for (const m of [].concat(o.material)) {
            m.map?.dispose();
            m.dispose();
          }
        }
      });
      cache.delete(k);
    }
  for (const k of [...labelCache.keys()]) if (k.startsWith(id + '|')) labelCache.delete(k);
}
export const builderNames = Object.keys(BUILDERS);
