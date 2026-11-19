// Fixture geometry builders for streamed store interiors (INTERIORS agent).
// Each builder adds merged static geometry (Bucket), labelled products (ProductBatch), low-LOD stock strips,
// colliders, item spots, points of interest and per-frame animations for one layout fixture.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getAtlas, cellUV, GARMENT_COLORS, labelPlaneGeo } from './products.js';
import { danceMat } from './shared.js';

// ---------- shared helpers ----------
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const FONT = '"Barlow Condensed","Arial Narrow",Arial,sans-serif';
export function signTex(text, color, w = 1024, fs = 110) {
  return canvasTex(w, 192, (g, cw, h) => {
    g.fillStyle = '#0b0b14';
    g.fillRect(0, 0, cw, h);
    let size = fs;
    g.font = `bold ${size}px ${FONT}`;
    while (g.measureText(text).width > cw - 40 && size > 30) {
      size -= 6;
      g.font = `bold ${size}px ${FONT}`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 30;
    g.fillStyle = color;
    g.fillText(text, cw / 2, h / 2 + 4);
    g.shadowBlur = 6;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.35;
    g.fillText(text, cw / 2, h / 2 + 4);
  });
}
export function stripeTex(a, b) {
  const t = canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 32, 0, 32, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const floorCache = {};
export function floorTex(style) {
  if (floorCache[style]) return floorCache[style];
  const t = canvasTex(256, 256, (g, w, h) => {
    if (style === 'checker') {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = (x + y) % 2 ? '#111' : '#f2f2f2';
          g.fillRect(x * 32, y * 32, 32, 32);
        }
    } else if (style === 'wood') {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsl(28,${35 + (i % 3) * 8}%,${34 + ((i * 7) % 12)}%)`;
        g.fillRect(0, i * 32, w, 32);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, i * 32, w, 2);
        g.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
      }
    } else if (style === 'dark') {
      g.fillStyle = '#1b1b20';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = `rgba(255,255,255,${((i * 37) % 7) / 200})`;
        g.fillRect((i * 53) % w, (i * 97) % h, 2, 2);
      }
    } else if (style === 'concrete') {
      g.fillStyle = '#8f8f8c';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `rgba(${i % 2 ? '0,0,0' : '255,255,255'},${((i * 37) % 9) / 100})`;
        g.fillRect((i * 53) % w, (i * 97) % h, 3, 3);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, 0, w, 2);
      g.fillRect(0, 0, 2, h);
    } else if (style === 'marble') {
      g.fillStyle = '#efece6';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(120,110,100,0.35)';
      for (let i = 0; i < 14; i++) {
        g.lineWidth = 1 + (i % 3);
        g.beginPath();
        let x = (i * 61) % w,
          y = 0;
        g.moveTo(x, y);
        while (y < h) {
          x += ((i * y) % 30) - 15;
          y += 20;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(0, 0, w, 1);
      g.fillRect(0, 0, 1, h);
    } else if (style === 'tile2') {
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x * 3 + y) % 4 ? '#c9d6df' : '#b8c6d1';
          g.fillRect(x * 64, y * 64, 64, 64);
        }
      g.strokeStyle = '#7d8a96';
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * 64, 0);
        g.lineTo(i * 64, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * 64);
        g.lineTo(w, i * 64);
        g.stroke();
      }
    } else {
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 ? '#e9e4da' : '#d6cfc2';
          g.fillRect(x * 64, y * 64, 64, 64);
        }
      g.strokeStyle = '#9a9286';
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * 64, 0);
        g.lineTo(i * 64, h);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i * 64);
        g.lineTo(w, i * 64);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  floorCache[style] = t;
  return t;
}
let tvTexCache = null;
export function tvTex() {
  if (tvTexCache) return tvTexCache;
  tvTexCache = canvasTex(512, 144, (g, w, h) => {
    const cols = [
      ['#ff5f6d', '#ffc371'],
      ['#2ec5ff', '#7b2cbf'],
      ['#06d6a0', '#118ab2'],
      ['#f72585', '#4361ee'],
    ];
    cols.forEach(([a, b], i) => {
      const gr = g.createLinearGradient(i * 128, 0, i * 128 + 128, h);
      gr.addColorStop(0, a);
      gr.addColorStop(1, b);
      g.fillStyle = gr;
      g.fillRect(i * 128, 0, 128, h);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(i * 128 + 88, 50, 18, 0, 7);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(i * 128, h * 0.72, 128, h * 0.28);
      g.fillStyle = '#fff';
      g.font = `bold 20px ${FONT}`;
      g.fillText(['8K ULTRA', 'NEXA PLAY', 'SPORTS', 'MUSIC'][i], i * 128 + 8, h - 12);
    });
  });
  tvTexCache.wrapS = THREE.RepeatWrapping;
  tvTexCache.repeat.set(0.25, 1);
  return tvTexCache;
}
let targetCache = null;
function targetTex() {
  if (targetCache) return targetCache;
  targetCache = canvasTex(128, 170, (g, w) => {
    g.fillStyle = '#f4f1de';
    g.fillRect(0, 0, w, 170);
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(w / 2, 40, 20, 0, Math.PI * 2);
    g.fill();
    g.fillRect(w / 2 - 38, 60, 76, 100);
    for (let r = 50; r > 0; r -= 12) {
      g.strokeStyle = r % 24 ? '#e63946' : '#fff';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(w / 2, 105, r, 0, Math.PI * 2);
      g.stroke();
    }
  });
  return targetCache;
}
export function menuTex(title, items, accent) {
  return canvasTex(512, 320, (g, w, h) => {
    g.fillStyle = '#141414';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = accent;
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = accent;
    g.font = `bold 46px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(title.toUpperCase(), w / 2, 62);
    g.font = `30px ${FONT}`;
    g.textAlign = 'left';
    items.slice(0, 6).forEach(([n, p], i) => {
      g.fillStyle = '#f1faee';
      g.fillText(n, 30, 112 + i * 36);
      g.textAlign = 'right';
      g.fillStyle = '#ffd166';
      g.fillText(`$${p}`, w - 30, 112 + i * 36);
      g.textAlign = 'left';
    });
  });
}
export function textTex(text, bg, fg, w = 512, h = 128) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    let s = h * 0.6;
    g.font = `bold ${s}px ${FONT}`;
    while (g.measureText(text).width > w - 30 && s > 14) {
      s -= 4;
      g.font = `bold ${s}px ${FONT}`;
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// Geometry bucket: collects transformed geometries per material, merged at the end.
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _v = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _n = new THREE.Matrix3();
const NI = new WeakMap();
function nonIndexed(g) {
  if (!g.index) return g;
  let r = NI.get(g);
  if (!r) {
    r = g.toNonIndexed();
    NI.set(g, r);
  }
  return r;
}
// Geometry bucket: transforms pieces straight into per-material vertex arrays (no per-piece clones), merged at build().
export class Bucket {
  constructor() {
    this.map = new Map();
    this.yOff = 0;
    this.verts = 0;
  }
  add(mat, geo, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = nonIndexed(geo);
    const P = g.attributes.position,
      N = g.attributes.normal,
      U = g.attributes.uv;
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y + this.yOff, z), _q, _s.set(sx, sy, sz));
    _n.getNormalMatrix(_m);
    let a = this.map.get(mat);
    if (!a) {
      a = { p: [], n: [], u: [] };
      this.map.set(mat, a);
    }
    const me = _m.elements,
      ne = _n.elements,
      pa = a.p,
      na = a.n,
      ua = a.u;
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i),
        py = P.getY(i),
        pz = P.getZ(i);
      pa.push(
        me[0] * px + me[4] * py + me[8] * pz + me[12],
        me[1] * px + me[5] * py + me[9] * pz + me[13],
        me[2] * px + me[6] * py + me[10] * pz + me[14],
      );
      if (N) {
        const nx = N.getX(i),
          ny = N.getY(i),
          nz = N.getZ(i);
        const ox = ne[0] * nx + ne[3] * ny + ne[6] * nz,
          oy = ne[1] * nx + ne[4] * ny + ne[7] * nz,
          oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(ox, oy, oz) || 1;
        na.push(ox / l, oy / l, oz / l);
      } else na.push(0, 1, 0);
      if (U) ua.push(U.getX(i), U.getY(i));
      else ua.push(0, 0);
    }
    this.verts += P.count;
  }
  box(mat, x, y, z, sx, sy, sz, ry = 0) {
    this.add(mat, BOX, x, y, z, ry, 0, 0, sx, sy, sz);
  }
  build(group, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, a] of this.map) {
      if (!a.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.u, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

// ---------- shared materials ----------
let MATS = null;
export function mats() {
  if (MATS) return MATS;
  const S = (o) => new THREE.MeshStandardMaterial(o);
  MATS = {
    ceil: S({ color: 0xf2f0ea, roughness: 0.9 }),
    metal: S({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.8 }),
    shelf: S({ color: 0xeeeeee, roughness: 0.6, metalness: 0.2 }),
    wood: S({ color: 0x8a5a3a, roughness: 0.6 }),
    darkwood: S({ color: 0x4a2e1e, roughness: 0.5 }),
    counterTop: S({ color: 0x2b2b30, roughness: 0.25, metalness: 0.3 }),
    dark: S({ color: 0x1c1c22, roughness: 0.5 }),
    black: S({ color: 0x0c0c0e, roughness: 0.4 }),
    mat: S({ color: 0x23262b, roughness: 1 }),
    white: S({ color: 0xf5f5f2, roughness: 0.5 }),
    fridge: S({
      color: 0xcfe9ff,
      emissive: 0x9fd8ff,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      depthWrite: false,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xbfe6ee,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    vinyl: S({ color: 0xd8344a, roughness: 0.45 }),
    vinylDark: S({ color: 0x3b1f2b, roughness: 0.45 }),
    leather: S({ color: 0x1d1d1f, roughness: 0.35 }),
    chrome: S({ color: 0xe0e4ea, roughness: 0.15, metalness: 1 }),
    mirror: S({ color: 0xffffff, roughness: 0.02, metalness: 1 }),
    brass: S({ color: 0xc9a227, roughness: 0.3, metalness: 1 }),
    strip: new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 1.5, 1.4),
      toneMapped: false,
    }),
    screen: S({ color: 0x113322, emissive: 0x33ff99, emissiveIntensity: 0.8 }),
    screenBlue: new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.5, 0.9, 1.6),
      toneMapped: false,
    }),
    tv: new THREE.MeshBasicMaterial({ map: tvTex(), toneMapped: false }),
    led: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2), toneMapped: false }),
    heat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.2, 0.4), toneMapped: false }),
    plastic: S({ color: 0x2f6690, roughness: 0.5 }),
    plasticW: S({ color: 0xe8e8e8, roughness: 0.4 }),
    steel: S({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.9 }),
    curtain: S({ color: 0x6d597a, roughness: 0.9, side: THREE.DoubleSide }),
    leaf: S({ color: 0x2d6a4f, roughness: 0.8 }),
    pot: S({ color: 0xbc6c25, roughness: 0.8 }),
    felt: S({ color: 0x1b5e20, roughness: 0.95 }),
    rope: S({ color: 0x8b0000, roughness: 0.8 }),
    peg: S({ color: 0xd8c3a0, roughness: 0.9 }),
    target: S({ map: targetTex(), roughness: 0.8 }),
    atlas: S({ map: getAtlas().tex, roughness: 0.42, metalness: 0.05 }),
    board: [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xf1faee].map((c) =>
      S({ color: c, roughness: 0.35 }),
    ),
  };
  return MATS;
}

// ---------- product mixes ----------
// [kind, variants, width along shelf, height]
const W_ = {
  chips: [0.21, 0.3],
  cereal: [0.21, 0.3],
  sixpack: [0.22, 0.13],
  candy: [0.14, 0.03],
  bread: [0.29, 0.12],
  water: [0.29, 0.22],
  can: [0.075, 0.12],
  energy: [0.062, 0.17],
  pills: [0.11, 0.13],
  pillbottle: [0.07, 0.09],
  bottlecleaner: [0.09, 0.25],
  palette: [0.15, 0.02],
  liquor: [0.095, 0.34],
  jug: [0.17, 0.25],
  battery: [0.28, 0.21],
  shoebox: [0.34, 0.12],
  watch: [0.08, 0.05],
  blister: [0.13, 0.18],
  pasta: [0.1, 0.26],
  soup: [0.08, 0.11],
  sauce: [0.07, 0.2],
  milk: [0.12, 0.25],
  yogurt: [0.15, 0.07],
  frozenUp: [0.21, 0.26],
  wine: [0.085, 0.31],
  barbottle: [0.09, 0.34],
  console: [0.37, 0.1],
  consoleUp: [0.31, 0.38],
  phonebox: [0.1, 0.17],
  headphones: [0.2, 0.15],
  coffeebag: [0.15, 0.22],
  snack: [0.16, 0.2],
  tea: [0.16, 0.08],
  beer: [0.41, 0.13],
  flamingo: [0.12, 0.26],
  snowglobe: [0.11, 0.13],
  postcard: [0.16, 0.1],
  mug: [0.1, 0.09],
  bulbs: [0.09, 0.12],
  detergent: [0.18, 0.3],
  perfume: [0.08, 0.12],
  lipstick: [0.04, 0.07],
  shoe: [0.3, 0.07],
  hat: [0.36, 0.11],
  purse: [0.3, 0.2],
  ammo: [0.11, 0.06],
  paint: [0.18, 0.21],
};
export const MIX = {
  grocery: [
    ['cereal', 4],
    ['pasta', 4],
    ['soup', 3],
    ['sauce', 4],
    ['coffeebag', 3],
    ['tea', 3],
    ['snack', 3],
    ['chips', 6],
    ['bread', 3],
  ],
  convenience: [
    ['chips', 6],
    ['candy', 5],
    ['snack', 3],
    ['soup', 3],
    ['cereal', 4],
    ['sauce', 4],
  ],
  snacks: [
    ['chips', 6],
    ['snack', 3],
    ['candy', 5],
  ],
  bodega: [
    ['chips', 6],
    ['can', 6],
    ['bread', 3],
    ['candy', 5],
    ['soup', 3],
    ['sauce', 4],
    ['coffeebag', 3],
  ],
  drinks: [
    ['can', 6],
    ['energy', 4],
    ['water', 3],
    ['sixpack', 6],
  ],
  dairy: [
    ['milk', 4],
    ['yogurt', 4],
  ],
  frozen: [['frozenUp', 4]],
  beer: [
    ['beer', 5],
    ['sixpack', 6],
  ],
  liquor: [
    ['barbottle', 7],
    ['wine', 5],
    ['barbottle', 7],
  ],
  pharmacy: [
    ['pills', 6],
    ['pillbottle', 6],
    ['bottlecleaner', 4],
    ['tea', 3],
    ['palette', 5],
  ],
  electronics: [
    ['phonebox', 3],
    ['headphones', 3],
    ['console', 3],
    ['blister', 4],
  ],
  consoles: [
    ['consoleUp', 3],
    ['console', 3],
  ],
  souvenir: [
    ['flamingo', 1],
    ['snowglobe', 2],
    ['mug', 1],
    ['postcard', 4],
  ],
  auto: [
    ['jug', 4],
    ['battery', 4],
    ['bulbs', 3],
  ],
  sport: [
    ['shoebox', 4],
    ['energy', 4],
    ['snack', 3],
  ],
  pawn: [
    ['watch', 2],
    ['headphones', 3],
    ['phonebox', 3],
    ['console', 3],
  ],
  hardware: [
    ['paint', 4],
    ['bulbs', 3],
    ['blister', 4],
    ['detergent', 3],
    ['jug', 4],
  ],
  barber: [
    ['bottlecleaner', 4],
    ['pillbottle', 6],
  ],
  laundry: [['detergent', 3]],
  clothing: [
    ['shoebox', 4],
    ['hat', 3],
    ['purse', 6],
  ],
  beauty: [
    ['perfume', 4],
    ['palette', 5],
    ['lipstick', 2],
  ],
  restaurant: [['sauce', 4]],
  cafe: [
    ['coffeebag', 3],
    ['mug', 1],
  ],
  bar: [['barbottle', 7]],
  club: [['barbottle', 7]],
  icecream: [['mug', 1]],
  bank: [['tea', 3]],
  jewelry: [['watch', 2]],
  guns: [['ammo', 4]],
  surf: [
    ['hat', 3],
    ['purse', 6],
  ],
};

// ---------- context ----------
// ctx: { B, glassB, low, batch, cols:[], anim:[], R, H, def, palette, addItem(x,z,i?), poi(x,z,ry), grp }
const RY = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI };
const NRM = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
function frame(f) {
  const face = f.face || (f.axis === 'x' ? '+z' : '+x');
  const [fx, fz] = NRM[face];
  const along = fx !== 0 ? 'z' : 'x';
  const len = along === 'z' ? f.sz : f.sx,
    dep = along === 'z' ? f.sx : f.sz;
  const pt = (t, d) => ({
    x: f.x + (along === 'x' ? t : 0) + fx * d,
    z: f.z + (along === 'z' ? t : 0) + fz * d,
  });
  return { fx, fz, along, len, dep, pt, ry: RY[face], face };
}
const col = (ctx, x, y, z, sx, sy, sz) => ctx.cols.push([x, y, z, sx / 2, sy / 2, sz / 2]);
// box helper oriented with the fixture frame: (t along, d along normal)
function fbox(ctx, fr, mat, t, d, y, sl, sh, sd) {
  const p = fr.pt(t, d);
  if (fr.along === 'x') ctx.B.box(mat, p.x, y, p.z, sl, sh, sd);
  else ctx.B.box(mat, p.x, y, p.z, sd, sh, sl);
}
let STOCKBOX = null;
// low-LOD "printed stock" strip, split into <=2 m pieces so each lands in one LOD chunk
function lowStrip(ctx, fr, t0, t1, d, y, h) {
  const n = Math.max(1, Math.ceil((t1 - t0) / 2));
  const L = (t1 - t0) / n;
  for (let i = 0; i < n; i++) {
    const p = fr.pt(t0 + (i + 0.5) * L, d);
    if (!STOCKBOX) STOCKBOX = cellUV(new THREE.BoxGeometry(1, 1, 1), 'stock');
    (ctx.lowFor ? ctx.lowFor(p.x, p.z) : ctx.low).add(
      mats().atlas,
      STOCKBOX,
      p.x,
      y + h / 2,
      p.z,
      0,
      0,
      0,
      fr.along === 'x' ? L : 0.02,
      h,
      fr.along === 'x' ? 0.02 : L,
    );
  }
}
// stock a straight run of products facing fr's normal (or the opposite side if flip)
function stockRun(
  ctx,
  fr,
  t0,
  t1,
  d,
  y,
  mixKey,
  { flip = false, maxH = 0.36, rows = 1, gapP = 0.07 } = {},
) {
  const mix = MIX[mixKey] || MIX.convenience;
  const R = ctx.R;
  const [kind, nv] = mix[Math.floor(R() * mix.length)];
  const [w, h] = W_[kind] || [0.12, 0.15];
  if (h > maxH + 0.02)
    return stockRun(ctx, fr, t0, t1, d, y, mixKey === 'convenience' ? 'snacks' : 'convenience', {
      flip,
      maxH,
      rows: 1,
      gapP,
    });
  const ry = fr.ry + (flip ? Math.PI : 0);
  const nd = flip ? -1 : 1;
  let t = t0 + 0.04,
    variant = Math.floor(R() * nv);
  while (t + w < t1 - 0.02) {
    if (R() < gapP) {
      t += w;
      continue;
    }
    for (let k = 0; k < rows; k++) {
      const p = fr.pt(t + w / 2, d * nd - nd * k * 0.1);
      if (!ctx.batch.add(kind, variant, p.x, y + ctx.FY, p.z, ry + (R() - 0.5) * 0.06)) return;
    }
    t += w + 0.012;
    if (R() < 0.15) variant = Math.floor(R() * nv);
  }
  lowStrip(ctx, fr, t0, t1, d * nd, y + ctx.FY, Math.min(h, maxH));
}
function shelfStack(ctx, fr, t0, t1, d0, levels, mixKey, opts) {
  for (const y of levels) stockRun(ctx, fr, t0, t1, d0, y + 0.02, mixKey, opts);
}
function spotsAlong(ctx, fr, standD, n = 2, item) {
  for (let i = 0; i < n; i++) {
    const t = -fr.len / 2 + (fr.len * (i + 0.5)) / n;
    const p = fr.pt(t, standD);
    ctx.addItem(p.x, p.z, item);
    ctx.poi(p.x, p.z, fr.ry + Math.PI);
  }
}

// garments are plain coloured shapes, merged into the static bucket (visible at any distance, cheap)
const DRESS_G = new THREE.CylinderGeometry(0.08, 0.26, 0.95, 7, 1, true);
const SLEEVE_G = new THREE.BoxGeometry(1, 1, 1);
function garment(ctx, x, y, z, ry, ci, dress, sc = 1) {
  const m = ctx.colorMat(new THREE.Color(GARMENT_COLORS[((ci % 12) + 12) % 12]));
  if (dress) ctx.B.add(m, DRESS_G, x, y - 0.52 * sc, z, ry, 0, 0, sc, sc, sc);
  else ctx.B.add(m, SLEEVE_G, x, y - 0.38 * sc, z, ry, 0, 0, 0.44 * sc, 0.68 * sc, 0.035 * sc);
}
const hx = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
// ---------- builders ----------
const BUILD = {
  clerkzone(ctx, f) {
    ctx.B.box(mats().mat, f.x, 0.005, f.z, f.sx * 0.9, 0.01, f.sz * 0.9);
  },
  gondola(ctx, f) {
    const M = mats();
    const along = f.axis === 'x' ? 'x' : 'z';
    const len = along === 'z' ? f.sz : f.sx;
    const h = f.k === 'gondola-short' ? 1.35 : 1.75;
    const levels = h > 1.5 ? [0.12, 0.55, 0.98, 1.41] : [0.12, 0.55, 0.98];
    const fr = frame({ ...f, face: along === 'z' ? '+x' : '+z' });
    fbox(ctx, fr, ctx.shelfMat || M.shelf, 0, 0, h / 2, len, h, 0.1);
    fbox(ctx, fr, ctx.shelfTrim || M.dark, 0, 0, 0.06, len, 0.12, 0.9);
    if (ctx.shelfTrim) fbox(ctx, fr, ctx.shelfTrim, 0, 0, h + 0.05, len + 0.04, 0.1, 0.14);
    for (const y of levels) fbox(ctx, fr, ctx.shelfMat || M.shelf, 0, 0, y, len, 0.035, 0.88);
    for (const s of [-1, 1]) {
      fbox(ctx, fr, ctx.shelfMat || M.shelf, (s * len) / 2, 0, h / 2, 0.04, h, 0.9);
      for (const y of levels) {
        const p = fr.pt(0, s * 0.45);
        ctx.B.box(
          M.white,
          p.x,
          y + 0.02,
          p.z,
          along === 'x' ? len : 0.01,
          0.035,
          along === 'x' ? 0.01 : len,
        );
      }
    }
    const mix = f.mix || ctx.type;
    for (const flip of [false, true])
      shelfStack(ctx, fr, -len / 2, len / 2, 0.28, levels, mix, { flip, maxH: 0.38 });
    col(ctx, f.x, h / 2, f.z, f.sx, h, f.sz);
    for (const s of [-1, 1]) {
      const p = fr.pt(0, s * 0.95);
      ctx.addItem(p.x, p.z);
      ctx.poi(p.x, p.z, fr.ry + (s > 0 ? Math.PI : 0));
    }
    // header sign
    if (h > 1.5 && ctx.aisleSigns < 6) {
      ctx.aisleSigns++;
      ctx.signs.push({
        x: f.x,
        z: f.z,
        y: ctx.H - 0.9,
        along,
        text: (ctx.def.aisleNames || [ctx.def.label])[
          ctx.aisleSigns % (ctx.def.aisleNames || [1]).length
        ],
      });
    }
  },
  wallshelf(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const h = f.h || 2.0;
    const levels = h > 2.1 ? [0.1, 0.5, 0.9, 1.3, 1.7, 2.05] : [0.1, 0.5, 0.9, 1.3, 1.7];
    fbox(ctx, fr, ctx.shelfMat || M.shelf, 0, -fr.dep / 2 + 0.03, h / 2, fr.len, h, 0.05);
    for (const y of levels) fbox(ctx, fr, ctx.shelfMat || M.shelf, 0, 0, y, fr.len, 0.03, fr.dep);
    fbox(ctx, fr, ctx.shelfTrim || M.dark, 0, 0, 0.05, fr.len, 0.1, fr.dep);
    if (ctx.shelfTrim)
      fbox(ctx, fr, ctx.shelfTrim, 0, -fr.dep / 2 + 0.06, h + 0.08, fr.len, 0.16, 0.1);
    shelfStack(ctx, fr, -fr.len / 2, fr.len / 2, 0.02, levels, f.mix || ctx.type, { maxH: 0.36 });
    col(ctx, f.x, h / 2, f.z, f.sx, h, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, Math.max(1, Math.round(fr.len / 3)));
  },
  fridge(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const h = 2.15;
    const doorW = 0.78;
    const n = Math.max(1, Math.floor(fr.len / doorW));
    // hollow cabinet: back panel, top, base and end panels (products live inside, behind glass doors)
    fbox(ctx, fr, M.metal, 0, -fr.dep / 2 + 0.03, h / 2, fr.len, h, 0.05);
    fbox(ctx, fr, M.metal, 0, 0, h - 0.03, fr.len, 0.06, fr.dep);
    fbox(ctx, fr, M.metal, 0, 0, 0.08, fr.len, 0.16, fr.dep);
    for (const e of [-1, 1])
      fbox(ctx, fr, M.metal, e * (fr.len / 2 - 0.02), 0, h / 2, 0.04, h, fr.dep);
    fbox(ctx, fr, M.dark, 0, fr.dep / 2 - 0.02, h + 0.12, fr.len, 0.24, 0.04);
    for (let i = 0; i < n; i++) {
      const t = -fr.len / 2 + doorW * (i + 0.5) + (fr.len - n * doorW) / 2;
      const mix = f.alt && i % 3 === 2 ? f.alt : f.mix || 'drinks';
      fbox(ctx, fr, M.dark, t - doorW / 2 + 0.02, fr.dep / 2 - 0.02, h / 2, 0.04, h - 0.1, 0.05);
      const g =
        fr.along === 'x'
          ? new THREE.PlaneGeometry(doorW - 0.06, h - 0.25)
          : new THREE.PlaneGeometry(doorW - 0.06, h - 0.25).rotateY(Math.PI / 2);
      const p = fr.pt(t, fr.dep / 2 - 0.01);
      ctx.glassB.add(
        M.fridge,
        g,
        p.x,
        h / 2 + ctx.FY,
        p.z,
        fr.face === '-x' || fr.face === '-z' ? Math.PI : 0,
      );
      for (const y of [0.25, 0.7, 1.15, 1.6]) {
        fbox(ctx, fr, M.shelf, t, 0.05, y, doorW - 0.06, 0.02, fr.dep - 0.25);
        stockRun(ctx, fr, t - doorW / 2 + 0.05, t + doorW / 2 - 0.05, 0.12, y + 0.02, mix, {
          maxH: 0.3,
          gapP: 0.03,
        });
      }
    }
    const sp = fr.pt(0, fr.dep / 2 - 0.05);
    ctx.B.box(
      M.strip,
      sp.x,
      h - 0.05,
      sp.z,
      fr.along === 'x' ? fr.len - 0.1 : 0.02,
      0.02,
      fr.along === 'x' ? 0.02 : fr.len - 0.1,
    );
    col(ctx, f.x, h / 2, f.z, f.sx, h, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, Math.max(1, Math.round(fr.len / 2.5)), 'drink');
  },
  produce(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const n = Math.max(1, Math.floor(fr.len / 0.6));
    fbox(ctx, fr, M.wood, 0, 0, 0.4, fr.len, 0.8, fr.dep);
    for (let i = 0; i < n; i++) {
      const t = -fr.len / 2 + ((i + 0.5) * fr.len) / n;
      const p = fr.pt(t, 0.1);
      ctx.batch.add(
        i % 5 === 3 ? 'bananas' : 'produce',
        i % 7,
        p.x,
        0.8 + ctx.FY,
        p.z,
        fr.ry,
        1,
        0,
        0,
      );
      fbox(ctx, fr, M.white, t, fr.dep / 2 + 0.01, 0.7, 0.12, 0.07, 0.01);
    }
    lowStrip(ctx, fr, -fr.len / 2, fr.len / 2, 0, 0.8 + ctx.FY, 0.1);
    col(ctx, f.x, 0.45, f.z, f.sx, 0.9, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2, 'produce');
  },
  winerack(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const h = 2.1;
    fbox(ctx, fr, M.darkwood, 0, -fr.dep / 2 + 0.03, h / 2, fr.len, h, 0.05);
    for (let t = -fr.len / 2; t <= fr.len / 2 + 1e-3; t += 0.6)
      fbox(ctx, fr, M.darkwood, t, 0, h / 2, 0.03, h, fr.dep);
    let k = 0;
    for (let y = 0.15; y < h - 0.1; y += 0.21) {
      fbox(ctx, fr, M.darkwood, 0, 0, y - 0.05, fr.len, 0.015, fr.dep);
      for (let t = -fr.len / 2 + 0.1; t < fr.len / 2 - 0.05; t += 0.2) {
        const p = fr.pt(t, 0.05);
        ctx.batch.add('wineLying', (k++ >> 2) % 5, p.x, y + ctx.FY - 0.02, p.z, fr.ry);
      }
      lowStrip(ctx, fr, -fr.len / 2, fr.len / 2, fr.dep / 2, y + ctx.FY - 0.04, 0.08);
    }
    col(ctx, f.x, h / 2, f.z, f.sx, h, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2, 'wine');
  },
  wineisland(ctx, f) {
    const M = mats();
    ctx.B.box(M.darkwood, f.x, 0.35, f.z, f.sx, 0.7, f.sz);
    ctx.B.box(M.darkwood, f.x, 0.85, f.z, f.sx * 0.5, 0.3, f.sz - 0.2);
    const fr = frame({ ...f, face: '+x' });
    for (const flip of [false, true]) {
      stockRun(ctx, fr, -f.sz / 2, f.sz / 2, 0.3, 0.7, 'liquor', { flip, maxH: 0.4 });
      stockRun(ctx, fr, -f.sz / 2 + 0.1, f.sz / 2 - 0.1, 0.1, 1.0, 'liquor', { flip, maxH: 0.4 });
    }
    col(ctx, f.x, 0.5, f.z, f.sx, 1.0, f.sz);
    for (const s of [-1, 1]) {
      ctx.addItem(f.x + s * (f.sx / 2 + 0.55), f.z, 'wine');
      ctx.poi(f.x + s * (f.sx / 2 + 0.55), f.z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  },
  beerstack(ctx, f) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 2; j++)
        ctx.batch.add('beer', (i + j) % 5, f.x + (j - 0.5) * 0.42, ctx.FY + i * 0.13, f.z, 0);
    ctx.B.box(mats().wood, f.x, 0.06, f.z, 1, 0.12, 1);
    col(ctx, f.x, 0.4, f.z, f.sx, 0.8, f.sz);
  },
  tvwall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const rows = ctx.H > 3.6 ? 2 : 1;
    const n = Math.max(1, Math.floor(fr.len / 1.7));
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < n; i++) {
        const t = -fr.len / 2 + ((i + 0.5) * fr.len) / n;
        const y = 1.25 + r * 1.05;
        fbox(ctx, fr, M.black, t, -0.05, y, 1.55, 0.9, 0.06);
        const p = fr.pt(t, -0.01);
        const g = new THREE.PlaneGeometry(1.48, 0.83);
        const sm = ctx.tvMat;
        ctx.B.add(sm, g, p.x, y, p.z, fr.ry);
      }
    fbox(ctx, fr, M.dark, 0, 0, 0.3, fr.len, 0.6, fr.dep);
    for (let i = 0; i < n; i++) {
      const p = fr.pt(-fr.len / 2 + ((i + 0.5) * fr.len) / n, 0);
      ctx.batch.add('tvbox', i % 3, p.x, ctx.FY + 0.6, p.z, fr.ry, 0.5);
    }
    col(ctx, f.x, 1.2, f.z, f.sx, 2.4, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.9, 2);
  },
  pegwall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const h = 2.0;
    const g = cellUV(
      fr.along === 'x'
        ? new THREE.BoxGeometry(fr.len, h, 0.03)
        : new THREE.BoxGeometry(0.03, h, fr.len),
      'pegboard',
    );
    const p0 = fr.pt(0, -fr.dep / 2 + 0.02);
    ctx.B.add(M.atlas, g, p0.x, h / 2 + 0.3, p0.z);
    const ammo = f.mix === 'ammo';
    for (let y = 0.6; y < h + 0.1; y += 0.32)
      for (let t = -fr.len / 2 + 0.12; t < fr.len / 2 - 0.1; t += 0.2) {
        const p = fr.pt(t, 0.02);
        if (ammo) ctx.batch.add('ammo', Math.floor(ctx.R() * 4), p.x, y + ctx.FY, p.z, fr.ry);
        else ctx.batch.add('blister', Math.floor(ctx.R() * 4), p.x, y + 0.2 + ctx.FY, p.z, fr.ry);
      }
    if (ammo)
      for (let y = 0.55; y < h; y += 0.32) fbox(ctx, fr, M.shelf, 0, 0.02, y, fr.len, 0.02, 0.14);
    for (let y = 0.6; y < h + 0.1; y += 0.32)
      lowStrip(
        ctx,
        fr,
        -fr.len / 2,
        fr.len / 2,
        0.03,
        y + ctx.FY + (ammo ? 0 : 0.02),
        ammo ? 0.06 : 0.16,
      );
    col(ctx, f.x, 1.2, f.z, f.sx, 2.4, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2);
  },
  glasswall(ctx, f) {
    BUILD.glasscase(ctx, { ...f, wallMode: true });
  },
  glasscase(ctx, f) {
    const M = mats();
    const L = Math.max(f.sx, f.sz),
      Dp = Math.min(f.sx, f.sz);
    const alongX = f.sx >= f.sz;
    const bx = (y, h, mat, inset = 0) =>
      ctx.B.box(
        mat,
        f.x,
        y,
        f.z,
        alongX ? L - inset : Dp - inset,
        h,
        alongX ? Dp - inset : L - inset,
      );
    bx(0.42, 0.84, M.counterTop);
    bx(0.86, 0.02, M.strip, 0.06);
    ctx.glassB.box(M.glass, f.x, 1.04 + ctx.FY, f.z, alongX ? L : Dp, 0.36, alongX ? Dp : L);
    const mix = f.mix || 'jewelry';
    for (let u = -L / 2 + 0.15; u < L / 2 - 0.1; u += mix === 'jewelry' ? 0.16 : 0.3)
      for (const s of [-0.18, 0.18]) {
        const x = f.x + (alongX ? u : s * Dp),
          z = f.z + (alongX ? s * Dp : u);
        const R = ctx.R();
        if (mix === 'jewelry')
          ctx.batch.add(
            R < 0.4 ? 'ring' : R < 0.7 ? 'necklace' : 'watch',
            Math.floor(ctx.R() * 2),
            x,
            0.88 + ctx.FY,
            z,
            ctx.R() * 3,
          );
        else if (mix === 'pistols')
          ctx.batch.add(
            R < 0.65 ? 'pistol' : 'ammo',
            Math.floor(ctx.R() * 4),
            x,
            0.88 + ctx.FY,
            z,
            Math.PI / 2 + (ctx.R() - 0.5) * 0.4,
          );
        else if (mix === 'phones')
          ctx.batch.add(
            R < 0.6 ? 'phonebox' : 'headphones',
            Math.floor(ctx.R() * 3),
            x,
            0.88 + ctx.FY,
            z,
            0,
            0.8,
          );
        else ctx.batch.add('perfume', Math.floor(ctx.R() * 4), x, 0.88 + ctx.FY, z, 0);
      }
    col(ctx, f.x, 0.62, f.z, f.sx, 1.24, f.sz);
    const n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i < n; i++) {
      const u = -L / 2 + (L * (i + 0.5)) / n;
      for (const s of f.wallMode ? [f.face && f.face[0] === '+' ? 1 : -1] : [-1, 1]) {
        const d = (Dp / 2 + 0.55) * s;
        const x = f.x + (alongX ? u : d),
          z = f.z + (alongX ? d : u);
        ctx.addItem(x, z, mix === 'jewelry' ? 'smash' : null);
        ctx.poi(x, z, alongX ? (s > 0 ? Math.PI : 0) : s > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
    }
  },
  garmentwall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    let ci = Math.floor(ctx.R() * 12);
    for (const y of [1.25, 2.15]) {
      fbox(ctx, fr, M.chrome, 0, 0.05, y + 0.25, fr.len, 0.03, 0.03);
      for (let t = -fr.len / 2 + 0.1, k = 0; t < fr.len / 2 - 0.1; t += 0.07, k++) {
        if (k % 14 === 0) ci++;
        const p = fr.pt(t, 0.05);
        garment(ctx, p.x, y + 0.24, p.z, fr.ry + Math.PI / 2, ci, ctx.R() < 0.2, y > 2 ? 0.7 : 1);
      }
    }
    fbox(ctx, fr, M.wood, 0, 0, 2.62, fr.len, 0.03, fr.dep);
    for (let t = -fr.len / 2 + 0.2; t < fr.len / 2 - 0.2; t += 0.4) {
      const p = fr.pt(t, 0);
      ctx.batch.add('shirts', Math.floor(ctx.R() * 6), p.x, 2.64 + ctx.FY, p.z, fr.ry, 0.9);
    }
    col(ctx, f.x, 1.3, f.z, f.sx, 2.6, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2);
  },
  shoewall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    fbox(ctx, fr, M.wood, 0, -fr.dep / 2 + 0.03, 1.2, fr.len, 2.4, 0.05);
    for (let y = 0.3; y < 2.3; y += 0.38) {
      fbox(ctx, fr, M.white, 0, 0, y, fr.len, 0.025, fr.dep);
      lowStrip(ctx, fr, -fr.len / 2, fr.len / 2, 0.08, y + 0.02 + ctx.FY, 0.08);
      for (let t = -fr.len / 2 + 0.2; t < fr.len / 2 - 0.15; t += 0.36) {
        const p = fr.pt(t, 0.02);
        ctx.batch.add(
          'shoe',
          Math.floor(ctx.R() * 12),
          p.x,
          y + 0.02 + ctx.FY,
          p.z,
          fr.ry + Math.PI / 2,
          0.85,
          0.12,
        );
      }
    }
    col(ctx, f.x, 1.2, f.z, f.sx, 2.4, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2);
  },
  beautywall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    fbox(ctx, fr, M.white, 0, -fr.dep / 2 + 0.03, 1.3, fr.len, 2.6, 0.05);
    for (const y of [0.9, 1.3, 1.7, 2.1]) {
      fbox(ctx, fr, M.white, 0, 0, y, fr.len, 0.025, fr.dep);
      fbox(ctx, fr, M.strip, 0, fr.dep / 2, y + 0.015, fr.len, 0.015, 0.015);
      stockRun(ctx, fr, -fr.len / 2, fr.len / 2, 0.05, y + 0.015, 'beauty', { maxH: 0.13 });
    }
    for (let t = -fr.len / 2 + 0.8; t < fr.len / 2 - 0.5; t += 2.2)
      fbox(ctx, fr, M.mirror, t, -fr.dep / 2 + 0.07, 2.6, 0.9, 0.6, 0.02);
    fbox(ctx, fr, M.dark, 0, 0, 0.42, fr.len, 0.84, fr.dep);
    col(ctx, f.x, 1.3, f.z, f.sx, 2.6, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2);
  },
  boardwall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    fbox(ctx, fr, M.wood, 0, 0, 0.12, fr.len, 0.24, fr.dep);
    fbox(ctx, fr, M.wood, 0, -fr.dep / 2 + 0.04, 2.3, fr.len, 0.08, 0.08);
    let i = 0;
    for (let t = -fr.len / 2 + 0.25; t < fr.len / 2 - 0.2; t += 0.34, i++) {
      const p = fr.pt(t, 0.02);
      const bm = M.board[i % M.board.length];
      const g = new THREE.SphereGeometry(0.5, 10, 8).scale(0.52, 2.2, 0.07);
      ctx.B.add(bm, g, p.x, 1.3, p.z, fr.ry, -0.12);
    }
    col(ctx, f.x, 1.2, f.z, f.sx, 2.4, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2);
  },
  boardrack(ctx, f) {
    const M = mats();
    ctx.B.box(M.wood, f.x, 0.12, f.z, f.sx, 0.24, f.sz);
    ctx.B.box(M.wood, f.x, 1.1, f.z, 0.08, 1.9, f.sz);
    let i = 0;
    for (let z = f.z - f.sz / 2 + 0.2; z < f.z + f.sz / 2 - 0.1; z += 0.26, i++)
      for (const s of [-1, 1])
        ctx.B.add(
          M.board[(i + (s > 0 ? 2 : 0)) % 6],
          new THREE.SphereGeometry(0.5, 10, 6).scale(0.07, 2.1, 0.52),
          f.x + s * 0.2,
          1.2,
          z,
          0,
          0,
          s * 0.08,
        );
    col(ctx, f.x, 1.0, f.z, f.sx, 2.0, f.sz);
    for (const s of [-1, 1]) {
      ctx.addItem(f.x + s * 0.95, f.z);
      ctx.poi(f.x + s * 0.95, f.z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  },
  teewall(ctx, f) {
    const fr = frame(f);
    let i = 0;
    for (let y = 1.0; y < Math.min(ctx.H - 0.5, 3.2); y += 0.75)
      for (let t = -fr.len / 2 + 0.3; t < fr.len / 2 - 0.25; t += 0.55, i++) {
        const p = fr.pt(t, 0.02);
        ctx.batch.add('tee', i % 4, p.x, y + 0.6 + ctx.FY, p.z, fr.ry);
      }
    spotsAlong(ctx, fr, 0.7, 2);
  },
  menuwall(ctx, f) {
    const fr = frame(f);
    const p = fr.pt(0, 0.02);
    const m = ctx.menuBoard(Math.min(3.2, fr.len), 1.6);
    m.position.set(p.x, Math.min(ctx.H - 1.1, 2.4) + ctx.FY, p.z);
    m.rotation.y = fr.ry;
    ctx.grp.add(m);
  },
  washers(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const dryer = f.k === 'dryers' || f.k === 'dryerisland';
    const n = Math.max(1, Math.floor(fr.len / 0.72));
    for (let i = 0; i < n; i++) {
      const t = -fr.len / 2 + ((i + 0.5) * fr.len) / n;
      for (let lvl = 0; lvl < (dryer ? 2 : 1); lvl++) {
        const y0 = lvl * 0.9;
        fbox(ctx, fr, M.plasticW, t, 0, y0 + 0.45, 0.68, 0.88, fr.dep - 0.04);
        const p = fr.pt(t, fr.dep / 2);
        const door = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 14);
        door.rotateX(Math.PI / 2);
        ctx.B.add(M.black, door, p.x, y0 + 0.42, p.z, fr.ry);
        const ring = new THREE.TorusGeometry(0.21, 0.02, 4, 14);
        ctx.B.add(M.chrome, ring, p.x, y0 + 0.42, p.z, fr.ry);
        fbox(
          ctx,
          fr,
          lvl ? M.led : M.screenBlue,
          t + 0.22,
          fr.dep / 2 + 0.005,
          y0 + 0.78,
          0.08,
          0.04,
          0.01,
        );
      }
    }
    const h = dryer ? 1.8 : 0.9;
    col(ctx, f.x, h / 2, f.z, f.sx, h, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2, 'wash');
    if (!dryer)
      for (let i = 0; i < n; i += 3) {
        const p = fr.pt(-fr.len / 2 + ((i + 0.5) * fr.len) / n, 0);
        ctx.batch.add('detergent', i % 3, p.x, 0.9 + ctx.FY, p.z, fr.ry, 0.8);
      }
  },
  dryers(ctx, f) {
    BUILD.washers(ctx, f);
  },
  washerisland(ctx, f) {
    const fr = frame({ ...f, face: '+x' });
    for (const s of [-1, 1])
      BUILD.washers(ctx, {
        ...f,
        k: 'washers',
        x: f.x + (s * f.sx) / 4,
        sx: f.sx / 2,
        face: s > 0 ? '+x' : '-x',
      });
    void fr;
  },
  barberchairs(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const n = Math.max(1, Math.floor(fr.len / 1.9));
    for (let i = 0; i < n; i++) {
      const t = -fr.len / 2 + ((i + 0.5) * fr.len) / n;
      const c = fr.pt(t, 0.25);
      ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.25, 0.3, 0.1, 12), c.x, 0.05, c.z);
      ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), c.x, 0.3, c.z);
      ctx.B.box(M.leather, c.x, 0.58, c.z, 0.6, 0.14, 0.6);
      const b = fr.pt(t, -0.07);
      ctx.B.box(
        M.leather,
        b.x,
        0.98,
        b.z,
        fr.along === 'x' ? 0.55 : 0.12,
        0.8,
        fr.along === 'x' ? 0.12 : 0.55,
      );
      fbox(ctx, fr, M.mirror, t, -fr.dep / 2 + 0.02, 1.65, 1.2, 1.0, 0.02);
      fbox(ctx, fr, M.dark, t, -fr.dep / 2 + 0.2, 1.0, 1.4, 0.04, 0.35);
      for (let k = 0; k < 4; k++) {
        const p = fr.pt(t - 0.45 + k * 0.3, -fr.dep / 2 + 0.2);
        ctx.batch.add(
          k % 2 ? 'bottlecleaner' : 'pillbottle',
          k,
          p.x,
          1.02 + ctx.FY,
          p.z,
          fr.ry,
          0.7,
        );
      }
      col(ctx, c.x, 0.6, c.z, 0.7, 1.2, 0.7);
      const s = fr.pt(t + 0.7, 0.6);
      ctx.poi(s.x, s.z, fr.ry + Math.PI);
      ctx.addItem(s.x, s.z, 'cut');
      ctx.seats.push({ x: c.x, z: c.z, ry: fr.ry });
    }
  },
  gunwall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    fbox(ctx, fr, M.wood, 0, -fr.dep / 2 + 0.03, 1.6, fr.len, 2.4, 0.05);
    fbox(ctx, fr, M.darkwood, 0, 0, 0.4, fr.len, 0.06, fr.dep);
    for (let t = -fr.len / 2 + 0.25, k = 0; t < fr.len / 2 - 0.2; t += 0.32, k++) {
      const p = fr.pt(t, 0.02);
      ctx.batch.add('rifle', k % 2, p.x, 0.45 + ctx.FY, p.z, fr.ry, 1, 0, 0.04);
    }
    const p = fr.pt(0, -fr.dep / 2 + 0.06);
    const m = ctx.menuBoard(Math.min(3.2, fr.len), 0.9);
    m.position.set(p.x, 2.7 + ctx.FY, p.z);
    m.rotation.y = fr.ry;
    ctx.grp.add(m);
    col(ctx, f.x, 1.2, f.z, f.sx, 2.4, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 3);
  },
  guitarwall(ctx, f) {
    const M = mats();
    const fr = frame(f);
    fbox(ctx, fr, M.wood, 0, -fr.dep / 2 + 0.03, 1.7, fr.len, 2.6, 0.05);
    for (let t = -fr.len / 2 + 0.4, k = 0; t < fr.len / 2 - 0.3; t += 0.75, k++) {
      const p = fr.pt(t, 0.05);
      ctx.batch.add('guitar', k % 2, p.x, 1.0 + ctx.FY, p.z, fr.ry, 1.1);
    }
    col(ctx, f.x, 1.2, f.z, f.sx, 2.4, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 2);
  },
  tirestack(ctx, f) {
    const fr = frame(f);
    for (let t = -fr.len / 2 + 0.4; t < fr.len / 2 - 0.3; t += 0.72)
      for (let k = 0; k < 5; k++) {
        const p = fr.pt(t, 0);
        ctx.batch.add('tire', 0, p.x, ctx.FY - 0.26 + k * 0.19, p.z, 0, 1, Math.PI / 2);
      }
    col(ctx, f.x, 0.5, f.z, f.sx, 1.0, f.sz);
    spotsAlong(ctx, fr, fr.dep / 2 + 0.6, 1);
  },
  fitting(ctx, f) {
    const M = mats();
    const n = Math.max(1, Math.floor(Math.max(f.sx, f.sz) / 1.1));
    const alongX = f.sx >= f.sz;
    const L = alongX ? f.sx : f.sz;
    for (let i = 0; i <= n; i++) {
      const u = -L / 2 + (i * L) / n;
      ctx.B.box(
        M.white,
        f.x + (alongX ? u : 0),
        1.1,
        f.z + (alongX ? 0 : u),
        alongX ? 0.05 : Math.min(f.sx, f.sz),
        2.2,
        alongX ? Math.min(f.sx, f.sz) : 0.05,
      );
    }
    for (let i = 0; i < n; i++) {
      const u = -L / 2 + ((i + 0.5) * L) / n;
      const g = new THREE.PlaneGeometry(L / n - 0.1, 1.9);
      const d = Math.min(f.sx, f.sz) / 2;
      ctx.B.add(
        M.curtain,
        g,
        f.x + (alongX ? u : f.face === '-x' ? -d : d),
        1.1,
        f.z + (alongX ? (f.face === '-z' ? -d : d) : u),
        alongX ? 0 : Math.PI / 2,
      );
    }
    col(ctx, f.x, 1.1, f.z, f.sx, 2.2, f.sz);
  },
  counter(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const len = fr.len;
    const top = 1.0;
    fbox(ctx, fr, ctx.trimMat, 0, 0, top / 2, len, top, fr.dep);
    fbox(ctx, fr, M.counterTop, 0, 0, top + 0.025, len + 0.06, 0.05, fr.dep + 0.08);
    // register, card reader, lotto, gum rack, tip jar (customer side = +normal)
    const reg = fr.pt(-len * 0.25, -0.05);
    ctx.B.box(M.dark, reg.x, top + 0.13, reg.z, 0.4, 0.2, 0.35);
    const scr = fr.pt(-len * 0.25, -0.12);
    ctx.B.box(
      M.screen,
      scr.x,
      top + 0.36,
      scr.z,
      fr.along === 'x' ? 0.3 : 0.03,
      0.22,
      fr.along === 'x' ? 0.03 : 0.3,
    );
    const cr = fr.pt(-len * 0.05, fr.dep / 2 - 0.12);
    ctx.B.box(M.dark, cr.x, top + 0.08, cr.z, 0.1, 0.06, 0.15);
    ctx.B.box(M.screen, cr.x, top + 0.115, cr.z, 0.07, 0.005, 0.06);
    const lot = fr.pt(len * 0.35, -0.1);
    ctx.B.box(M.dark, lot.x, top + 0.25, lot.z, 0.4, 0.45, 0.3);
    for (let k = 0; k < 4; k++) {
      const p = fr.pt(len * 0.35 - 0.12 + (k % 2) * 0.22, 0.06);
      ctx.batch.add(
        'postcard',
        k,
        p.x,
        top + 0.1 + ctx.FY + Math.floor(k / 2) * 0.17,
        p.z,
        fr.ry,
        1.2,
      );
    }
    const gum = fr.pt(len * 0.1, fr.dep / 2 + 0.05);
    ctx.B.box(
      M.chrome,
      gum.x,
      0.5,
      gum.z,
      fr.along === 'x' ? 0.55 : 0.04,
      0.9,
      fr.along === 'x' ? 0.04 : 0.55,
    );
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) {
        const p = fr.pt(len * 0.1 - 0.2 + k * 0.13, fr.dep / 2 + 0.09);
        ctx.batch.add('candy', (r + k) % 5, p.x, 0.15 + ctx.FY + r * 0.22, p.z, fr.ry, 1, 0.9);
      }
    const jar = fr.pt(len * 0.2, 0.1);
    ctx.glassB.add(
      M.glass,
      new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10),
      jar.x,
      top + 0.13 + ctx.FY,
      jar.z,
    );
    ctx.batch.add('cash', 0, jar.x, top + 0.06 + ctx.FY, jar.z, 0.5, 0.5);
    col(ctx, f.x, 0.55, f.z, f.sx, 1.1, f.sz);
    const s = fr.pt(0, fr.dep / 2 + 0.6);
    ctx.poi(s.x, s.z, fr.ry + Math.PI, 'pay');
    ctx.addItem(s.x, s.z, 'counter');
  },
  rxcounter(ctx, f) {
    BUILD.counter(ctx, f);
    const fr = frame(f);
    const p = fr.pt(0, -fr.dep / 2 - 0.9);
    const m = ctx.textBoard('PHARMACY', 2.2, 0.45);
    m.position.set(p.x, Math.min(ctx.H - 0.7, 2.7) + ctx.FY, p.z);
    m.rotation.y = fr.ry;
    ctx.grp.add(m);
  },
  glasscounter(ctx, f) {
    BUILD.glasscase(ctx, { ...f, mix: ctx.type === 'guns' ? 'pistols' : 'jewelry' });
    const fr = frame(f);
    const reg = fr.pt(fr.len * 0.4, 0);
    ctx.B.box(mats().dark, reg.x, 1.36, reg.z, 0.35, 0.2, 0.3);
  },
  cafecounter(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const len = fr.len;
    fbox(ctx, fr, M.darkwood, 0, 0, 0.5, len, 1.0, fr.dep);
    fbox(ctx, fr, M.counterTop, 0, 0, 1.03, len + 0.06, 0.05, fr.dep + 0.08);
    const cw = Math.min(1.8, len * 0.35);
    const pc = fr.pt(len / 2 - cw / 2 - 0.1, 0.05);
    ctx.glassB.box(
      M.glass,
      pc.x,
      1.28 + ctx.FY,
      pc.z,
      fr.along === 'x' ? cw : fr.dep - 0.1,
      0.45,
      fr.along === 'x' ? fr.dep - 0.1 : cw,
    );
    for (let k = 0; k < 10; k++) {
      const p = fr.pt(len / 2 - cw + 0.1 + (k % 5) * (cw / 5), 0.05 + (k < 5 ? -0.12 : 0.12));
      ctx.batch.add(k % 3 ? 'pastry' : 'donut', k % 4, p.x, 1.07 + ctx.FY, p.z, ctx.R() * 3);
    }
    const em = fr.pt(-len / 2 + 0.6, -0.15);
    ctx.B.box(M.chrome, em.x, 1.3, em.z, 0.55, 0.45, 0.45);
    ctx.B.box(M.black, em.x, 1.15, em.z, 0.4, 0.06, 0.3);
    const cu = fr.pt(-len / 2 + 1.15, -0.2);
    ctx.batch.add('cups', 0, cu.x, 1.05 + ctx.FY, cu.z, 0);
    const reg = fr.pt(0, -0.05);
    ctx.B.box(M.dark, reg.x, 1.15, reg.z, 0.35, 0.2, 0.3);
    const jar = fr.pt(0.4, 0.15);
    ctx.glassB.add(
      M.glass,
      new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10),
      jar.x,
      1.14 + ctx.FY,
      jar.z,
    );
    // menu board on the wall behind the clerk
    const mb = fr.pt(0, -fr.dep / 2 - 1.1);
    const m = ctx.menuBoard(Math.min(3, len), 1.4);
    m.position.set(mb.x, Math.min(ctx.H - 1.0, 2.5) + ctx.FY, mb.z);
    m.rotation.y = fr.ry;
    ctx.grp.add(m);
    col(ctx, f.x, 0.55, f.z, f.sx, 1.1, f.sz);
    const s = fr.pt(0, fr.dep / 2 + 0.6);
    ctx.poi(s.x, s.z, fr.ry + Math.PI, 'pay');
    ctx.addItem(s.x, s.z, 'counter');
  },
  dinercounter(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const len = fr.len;
    fbox(ctx, fr, ctx.trimMat, 0, 0, 0.55, len, 1.1, fr.dep);
    fbox(ctx, fr, M.counterTop, 0, 0, 1.12, len + 0.1, 0.06, fr.dep + 0.12);
    fbox(ctx, fr, M.chrome, 0, fr.dep / 2 + 0.02, 0.15, len, 0.04, 0.04);
    for (let t = -len / 2 + 0.4; t < len / 2 - 0.3; t += 0.75) {
      const s = fr.pt(t, fr.dep / 2 + 0.45);
      const si = ctx.prop('stool', ctx.theme?.stool || 'chromeVinyl', s.x, s.z, fr.ry + Math.PI, {
        seat: hx(ctx.pal.fabric),
        frame: '#c8ccd0',
        h: 0.76,
      });
      ctx.seats.push({ x: s.x, z: s.z, ry: fr.ry + Math.PI, stool: true, prop: si });
      const pl = fr.pt(t, 0.15);
      ctx.batch.add(
        ctx.foodPick(),
        Math.floor(ctx.R() * 4),
        pl.x,
        1.15 + ctx.FY,
        pl.z,
        fr.ry + Math.PI,
      );
    }
    BUILD.kitchenWall(ctx, fr, len);
    col(ctx, f.x, 0.6, f.z, f.sx, 1.2, f.sz);
    const s = fr.pt(len / 2 - 0.5, fr.dep / 2 + 1.0);
    ctx.addItem(s.x, s.z, 'counter');
    ctx.poi(s.x, s.z, fr.ry + Math.PI, 'pay');
  },
  kitchenWall(ctx, fr, len) {
    const M = mats();
    const b = fr.pt(0, -fr.dep / 2 - 1.0);
    const wl = Math.min(len + 1, ctx.W - 0.6);
    ctx.B.box(
      M.steel,
      b.x,
      0.5,
      b.z,
      fr.along === 'x' ? wl : 0.6,
      1.0,
      fr.along === 'x' ? 0.6 : wl,
    );
    const hl = fr.pt(0, -fr.dep / 2 - 1.0);
    for (let t = -wl / 2 + 0.6; t < wl / 2 - 0.4; t += 1.2) {
      const p = fr.pt(t, -fr.dep / 2 - 1.0);
      ctx.B.box(M.heat, p.x, 1.7, p.z, 0.3, 0.05, 0.2);
      ctx.B.box(M.steel, p.x, 1.25, p.z, 0.5, 0.4, 0.3);
    }
    void hl;
  },
  kitchenpass(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const len = fr.len;
    fbox(ctx, fr, M.steel, 0, 0, 0.55, len, 1.1, fr.dep);
    fbox(ctx, fr, M.heat, 0, 0, 1.65, len * 0.9, 0.04, 0.15);
    for (let t = -len / 2 + 0.3; t < len / 2 - 0.2; t += 0.45) {
      const p = fr.pt(t, 0);
      ctx.batch.add('plate', Math.floor(ctx.R() * 3), p.x, 1.1 + ctx.FY, p.z, 0);
    }
    BUILD.kitchenWall(ctx, fr, len);
    const mb = fr.pt(-len / 2 - 0.9, -0.2);
    const m = ctx.menuBoard(1.4, 1.0);
    m.position.set(mb.x, 2.0 + ctx.FY, mb.z);
    m.rotation.y = fr.ry;
    ctx.grp.add(m);
    col(ctx, f.x, 0.55, f.z, f.sx, 1.1, f.sz);
    const s = fr.pt(0, fr.dep / 2 + 0.7);
    ctx.addItem(s.x, s.z, 'counter');
    ctx.poi(s.x, s.z, fr.ry + Math.PI, 'pay');
  },
  barcounter(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const len = fr.len;
    fbox(ctx, fr, M.darkwood, 0, 0, 0.55, len, 1.1, fr.dep);
    fbox(ctx, fr, M.counterTop, 0, 0.05, 1.12, len + 0.1, 0.06, fr.dep + 0.2);
    fbox(ctx, fr, M.brass, 0, fr.dep / 2 + 0.08, 0.2, len, 0.04, 0.04);
    fbox(ctx, fr, M.strip, 0, fr.dep / 2 + 0.01, 1.06, len, 0.02, 0.02);
    for (let t = -len / 2 + 0.4; t < len / 2 - 0.3; t += 0.7) {
      const s = fr.pt(t, fr.dep / 2 + 0.5);
      const si = ctx.prop('stool', ctx.theme?.stool || 'metal', s.x, s.z, fr.ry + Math.PI, {
        seat: hx(ctx.pal.fabric),
        frame: hx(ctx.pal.frame),
        h: 0.76,
      });
      ctx.seats.push({ x: s.x, z: s.z, ry: fr.ry + Math.PI, stool: true, prop: si });
      if (ctx.R() < 0.5) {
        const g = fr.pt(t, 0.25);
        ctx.batch.add(
          ctx.foodPick(),
          Math.floor(ctx.R() * 4),
          g.x,
          1.15 + ctx.FY,
          g.z,
          fr.ry + Math.PI,
        );
      }
    }
    // bar back: shelves of lit bottles + mirror against the wall
    const bbD = -fr.dep / 2 - 1.05;
    const wl = Math.min(len, f.small ? len : len);
    fbox(ctx, fr, M.mirror, 0, bbD - 0.12, 1.7, wl, 1.0, 0.02);
    for (const y of [1.25, 1.65, 2.05]) {
      fbox(ctx, fr, M.counterTop, 0, bbD, y, wl, 0.03, 0.3);
      fbox(ctx, fr, M.strip, 0, bbD + 0.14, y + 0.02, wl, 0.012, 0.012);
      const lfr = { ...fr, pt: (t, d) => fr.pt(t, bbD + d), ry: fr.ry };
      stockRun(ctx, lfr, -wl / 2 + 0.05, wl / 2 - 0.05, 0.02, y + 0.02, 'bar', {
        maxH: 0.38,
        gapP: 0.02,
      });
    }
    fbox(ctx, fr, M.darkwood, 0, bbD, 0.5, wl, 1.0, 0.5);
    col(ctx, f.x, 0.6, f.z, f.sx, 1.2, f.sz);
    const bb = fr.pt(0, bbD);
    col(ctx, bb.x, 0.6, bb.z, fr.along === 'x' ? wl : 0.5, 1.2, fr.along === 'x' ? 0.5 : wl);
    const s = fr.pt(0, fr.dep / 2 + 0.9);
    ctx.addItem(s.x, s.z, 'counter');
    ctx.poi(s.x, s.z, fr.ry + Math.PI, 'pay');
  },
  teller(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const len = fr.len;
    const n = ctx.L.tellers || Math.max(2, Math.floor(len / 1.6));
    fbox(ctx, fr, M.darkwood, 0, 0, 0.55, len, 1.1, fr.dep);
    fbox(ctx, fr, M.counterTop, 0, 0, 1.12, len + 0.06, 0.05, fr.dep + 0.06);
    const g =
      fr.along === 'x'
        ? new THREE.PlaneGeometry(len, 1.0)
        : new THREE.PlaneGeometry(len, 1.0).rotateY(Math.PI / 2);
    const p = fr.pt(0, 0);
    ctx.glassB.add(M.glass, g, p.x, 1.65 + ctx.FY, p.z);
    for (let i = 0; i <= n; i++)
      fbox(ctx, fr, M.brass, -len / 2 + (i * len) / n, 0, 1.65, 0.04, 1.0, 0.06);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + ((i + 0.5) * len) / n;
      const m = fr.pt(t, -0.2);
      ctx.B.box(M.black, m.x, 1.3, m.z, 0.4, 0.28, 0.05);
      const s = fr.pt(t, fr.dep / 2 + 0.6);
      ctx.poi(s.x, s.z, fr.ry + Math.PI, 'pay');
      if (i > 0) ctx.L.clerks.push({ ...fr.pt(t, -fr.dep / 2 - 0.5), ry: fr.ry });
    }
    col(ctx, f.x, 1.1, f.z, f.sx, 2.2, f.sz);
    const s = fr.pt(0, fr.dep / 2 + 0.6);
    ctx.addItem(s.x, s.z, 'counter');
  },
  icecase(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const len = fr.len;
    fbox(ctx, fr, M.white, 0, 0, 0.45, len, 0.9, fr.dep);
    ctx.glassB.add(
      M.glass,
      fr.along === 'x'
        ? new THREE.BoxGeometry(len, 0.4, fr.dep)
        : new THREE.BoxGeometry(fr.dep, 0.4, len),
      f.x,
      1.1 + ctx.FY,
      f.z,
    );
    let k = 0;
    for (let t = -len / 2 + 0.15; t < len / 2 - 0.1; t += 0.26)
      for (const d of [-0.18, 0.18]) {
        const p = fr.pt(t, d);
        ctx.batch.add('tub', k++ % 7, p.x, 0.78 + ctx.FY, p.z, 0);
      }
    fbox(ctx, fr, M.strip, 0, fr.dep / 2, 0.92, len, 0.02, 0.02);
    const mb = fr.pt(0, -fr.dep / 2 - 1.0);
    const m = ctx.menuBoard(Math.min(3, len), 1.3);
    m.position.set(mb.x, 2.3 + ctx.FY, mb.z);
    m.rotation.y = fr.ry;
    ctx.grp.add(m);
    col(ctx, f.x, 0.65, f.z, f.sx, 1.3, f.sz);
    const s = fr.pt(0, fr.dep / 2 + 0.6);
    ctx.addItem(s.x, s.z, 'counter');
    ctx.poi(s.x, s.z, fr.ry + Math.PI, 'pay');
  },
  table2(ctx, f) {
    BUILD.table4(ctx, f, 2);
  },
  table4(ctx, f, n = 4) {
    const hi = f.high;
    const th = hi ? 1.05 : 0.75;
    const tw = n === 4 ? 1.0 : 0.7;
    const T = ctx.theme;
    const P = ctx.pal;
    const tstyle = hi ? 'round' : T?.table || (n === 4 ? 'square' : 'round');
    ctx.prop('table', tstyle, f.x, f.z, 0, {
      top: hx(P.top),
      frame: hx(P.frame),
      cloth: '#f4f1ea',
      w: tw,
      d: tw,
      h: th,
    });
    const seats =
      n === 4
        ? [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ]
        : [
            [0, -1],
            [0, 1],
          ];
    for (const [a, b] of seats) {
      const cx = f.x + a * (tw / 2 + 0.32),
        cz = f.z + b * (tw / 2 + 0.32),
        ry = Math.atan2(-a, -b);
      const i = hi
        ? ctx.prop('stool', T?.stool || 'metal', cx, cz, ry, {
            seat: hx(P.fabric),
            frame: hx(P.frame),
            h: 0.76,
          })
        : ctx.prop('chair', T?.chair || 'wood', cx, cz, ry, {
            seat: hx(P.fabric),
            frame: hx(P.frame),
            back: hx(P.fabric),
          });
      ctx.seats.push({ x: cx, z: cz, ry, prop: i, stool: !!hi });
      if (ctx.R() < 0.75) {
        const pl = { x: f.x + a * tw * 0.27, z: f.z + b * tw * 0.27 };
        const fk = ctx.foodPick();
        ctx.batch.add(fk, Math.floor(ctx.R() * 4), pl.x, th + 0.02 + ctx.FY, pl.z, ry);
      }
    }
    if (ctx.type === 'restaurant')
      ctx.batch.add('napkin', 0, f.x + 0.12, th + 0.02 + ctx.FY, f.z + 0.1, 0);
    else if (ctx.type === 'cafe') ctx.batch.add('menu', 0, f.x, th + 0.02 + ctx.FY, f.z, ctx.R());
  },
  booth(ctx, f) {
    const M = mats();
    const left = f.face === '+x';
    const bx = f.x;
    const s = left ? 1 : -1;
    for (const e of [-1, 1]) {
      ctx.B.box(ctx.vinylMat, bx, 0.25, f.z + e * 0.8, 1.7, 0.5, 0.5);
      ctx.B.box(ctx.vinylMat, bx, 0.8, f.z + e * 1.02, 1.7, 0.9, 0.16);
    }
    ctx.B.box(ctx.tableMat, bx + s * 0.1, 0.75, f.z, 1.3, 0.05, 0.75);
    ctx.B.box(M.chrome, bx + s * 0.1, 0.37, f.z, 0.08, 0.74, 0.08);
    ctx.batch.add('sauce', 0, bx - s * 0.5, 0.78 + ctx.FY, f.z - 0.1, 0, 0.8);
    ctx.batch.add('sauce', 1, bx - s * 0.5, 0.78 + ctx.FY, f.z + 0.05, 0, 0.8);
    ctx.batch.add('plate', Math.floor(ctx.R() * 3), bx + s * 0.2, 0.78 + ctx.FY, f.z - 0.2, 0);
    col(ctx, f.x, 0.5, f.z, f.sx, 1.0, f.sz);
  },
  lounge(ctx, f) {
    const M = mats();
    const s = f.face === '+x' ? 1 : -1;
    ctx.B.box(M.vinylDark, f.x - s * 0.45, 0.25, f.z, 0.7, 0.5, f.sz);
    ctx.B.box(M.vinylDark, f.x - s * 0.75, 0.75, f.z, 0.2, 0.7, f.sz);
    ctx.B.box(M.black, f.x + s * 0.4, 0.22, f.z, 0.6, 0.44, 0.9);
    ctx.batch.add('barbottle', 2, f.x + s * 0.4, 0.44 + ctx.FY, f.z, 0);
    ctx.batch.add('glassware', 0, f.x + s * 0.4, 0.44 + ctx.FY, f.z + 0.25, 0, 0.5);
    col(ctx, f.x, 0.4, f.z, f.sx, 0.8, f.sz);
  },
  windowbar(ctx, f) {
    const M = mats();
    ctx.B.box(M.darkwood, f.x, 1.05, f.z, f.sx, 0.05, f.sz);
    for (let x = f.x - f.sx / 2 + 0.4; x < f.x + f.sx / 2 - 0.2; x += 0.8) {
      const si = ctx.prop('stool', ctx.theme?.stool || 'metal', x, f.z - 0.55, 0, {
        seat: hx(ctx.pal.fabric),
        frame: hx(ctx.pal.frame),
        h: 0.76,
      });
      ctx.seats.push({ x, z: f.z - 0.55, ry: 0, stool: true, prop: si });
    }
    for (const e of [-1, 1])
      ctx.B.box(M.dark, f.x + e * (f.sx / 2 - 0.05), 0.52, f.z, 0.05, 1.05, 0.05);
    col(ctx, f.x, 0.55, f.z, f.sx, 1.1, f.sz);
  },
  rack(ctx, f) {
    const M = mats();
    const L = f.sz;
    ctx.B.box(M.chrome, f.x, 1.45, f.z, 0.04, 0.04, L);
    for (const e of [-1, 1]) {
      ctx.B.box(M.chrome, f.x, 0.72, f.z + (e * L) / 2, 0.04, 1.45, 0.04);
      ctx.B.box(M.chrome, f.x, 0.02, f.z + (e * L) / 2, 0.55, 0.04, 0.06);
    }
    const ci = f.color ?? 0;
    for (let z = f.z - L / 2 + 0.12; z < f.z + L / 2 - 0.1; z += 0.075)
      garment(
        ctx,
        f.x,
        1.45,
        z,
        Math.PI / 2 + (ctx.R() - 0.5) * 0.1,
        ci + (ctx.R() < 0.15 ? 1 : 0),
        ctx.R() < 0.25,
      );
    col(ctx, f.x, 0.75, f.z, 0.55, 1.5, L);
    for (const s of [-1, 1]) {
      ctx.addItem(f.x + s * 0.75, f.z);
      ctx.poi(f.x + s * 0.75, f.z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  },
  roundrack(ctx, f) {
    const M = mats();
    ctx.B.add(
      M.chrome,
      new THREE.TorusGeometry(0.42, 0.015, 4, 20).rotateX(Math.PI / 2),
      f.x,
      1.3,
      f.z,
    );
    ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), f.x, 0.65, f.z);
    ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10), f.x, 0.02, f.z);
    for (let a = 0; a < 6.28; a += 0.24)
      garment(
        ctx,
        f.x + Math.sin(a) * 0.42,
        1.3,
        f.z + Math.cos(a) * 0.42,
        a + Math.PI / 2,
        f.color ?? 0,
        false,
        0.85,
      );
    col(ctx, f.x, 0.7, f.z, 1.0, 1.4, 1.0);
    ctx.addItem(f.x, f.z + 0.95);
    ctx.poi(f.x, f.z + 0.95, Math.PI);
  },
  mannequin(ctx, f) {
    const M = mats();
    const c = new THREE.Color(GARMENT_COLORS[Math.floor(ctx.R() * 12)]);
    const cm = ctx.colorMat(c);
    ctx.B.add(M.white, new THREE.SphereGeometry(0.11, 10, 8), f.x, 1.68, f.z);
    ctx.B.add(cm, new THREE.CylinderGeometry(0.17, 0.14, 0.62, 10), f.x, 1.28, f.z);
    ctx.B.add(
      ctx.colorMat(new THREE.Color(GARMENT_COLORS[Math.floor(ctx.R() * 12)])),
      new THREE.CylinderGeometry(0.14, 0.1, 0.8, 8),
      f.x,
      0.6,
      f.z,
    );
    ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), f.x, 0.015, f.z);
    col(ctx, f.x, 0.9, f.z, 0.45, 1.8, 0.45);
  },
  foldtable(ctx, f) {
    const M = mats();
    ctx.B.box(M.wood, f.x, 0.8, f.z, f.sx, 0.05, f.sz);
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      ctx.B.box(
        M.wood,
        f.x + u * (f.sx / 2 - 0.05),
        0.4,
        f.z + v * (f.sz / 2 - 0.05),
        0.05,
        0.8,
        0.05,
      );
    for (let x = f.x - f.sx / 2 + 0.25; x < f.x + f.sx / 2 - 0.15; x += 0.38)
      for (let z = f.z - f.sz / 2 + 0.2; z < f.z + f.sz / 2 - 0.1; z += 0.32)
        ctx.batch.add('shirts', Math.floor(ctx.R() * 6), x, 0.83 + ctx.FY, z, 0);
    col(ctx, f.x, 0.42, f.z, f.sx, 0.85, f.sz);
    ctx.addItem(f.x, f.z + f.sz / 2 + 0.55);
    ctx.poi(f.x, f.z + f.sz / 2 + 0.55, Math.PI);
  },
  'foldtable-l'(ctx, f) {
    BUILD.foldtable(ctx, f);
  },
  makeupisland(ctx, f) {
    const M = mats();
    const alongZ = f.sz >= f.sx;
    const L = alongZ ? f.sz : f.sx;
    const fr = frame({ ...f, face: alongZ ? '+x' : '+z' });
    fbox(ctx, fr, M.dark, 0, 0, 0.45, L, 0.9, 1.0);
    fbox(ctx, fr, M.white, 0, 0, 0.92, L + 0.04, 0.04, 1.04);
    fbox(ctx, fr, M.white, 0, 0, 1.15, L - 0.2, 0.42, 0.5);
    for (const s of [-1, 1]) {
      fbox(ctx, fr, M.strip, 0, s * 0.52, 0.9, L, 0.02, 0.02);
      fbox(ctx, fr, M.strip, 0, s * 0.26, 1.35, L - 0.2, 0.02, 0.02);
    }
    for (let t = -L / 2 + 0.6; t < L / 2 - 0.4; t += 1.4) {
      fbox(ctx, fr, M.mirror, t, 0, 1.7, 0.45, 0.6, 0.03);
    }
    for (const flip of [false, true]) {
      stockRun(ctx, fr, -L / 2, L / 2, 0.38, 0.94, 'beauty', { flip, maxH: 0.13 });
      stockRun(ctx, fr, -L / 2 + 0.1, L / 2 - 0.1, 0.16, 1.36, 'beauty', { flip, maxH: 0.13 });
    }
    col(ctx, f.x, 0.6, f.z, f.sx, 1.2, f.sz);
    for (const s of [-1, 1]) {
      const p = fr.pt(0, s * 1.05);
      ctx.addItem(p.x, p.z);
      ctx.poi(p.x, p.z, fr.ry + (s > 0 ? Math.PI : 0));
    }
  },
  demotable(ctx, f) {
    const M = mats();
    const alongZ = f.sz >= f.sx;
    const L = alongZ ? f.sz : f.sx;
    const fr = frame({ ...f, face: alongZ ? '+x' : '+z' });
    fbox(ctx, fr, M.wood, 0, 0, 0.45, L, 0.9, f.sx < f.sz ? f.sx : f.sz);
    fbox(ctx, fr, M.white, 0, 0, 0.92, L + 0.04, 0.04, (alongZ ? f.sx : f.sz) + 0.04);
    for (let t = -L / 2 + 0.25; t < L / 2 - 0.2; t += 0.42)
      for (const s of [-1, 1]) {
        const p = fr.pt(t, s * 0.32);
        if (ctx.R() < 0.55) {
          ctx.B.box(M.black, p.x, 0.955, p.z, 0.1, 0.012, 0.18);
          ctx.B.box(
            ctx.screenMats[Math.floor(ctx.R() * ctx.screenMats.length)],
            p.x,
            0.963,
            p.z,
            0.085,
            0.004,
            0.16,
          );
        } else {
          ctx.B.box(
            M.steel,
            p.x,
            0.955,
            p.z,
            fr.along === 'z' ? 0.22 : 0.32,
            0.02,
            fr.along === 'z' ? 0.32 : 0.22,
          );
          const sc = fr.pt(t, s * 0.45);
          ctx.B.add(
            ctx.screenMats[Math.floor(ctx.R() * ctx.screenMats.length)],
            new THREE.PlaneGeometry(0.3, 0.2),
            sc.x,
            1.07,
            sc.z,
            fr.ry + (s > 0 ? 0 : Math.PI),
            -0.25 * 0,
          );
        }
      }
    col(ctx, f.x, 0.5, f.z, f.sx, 1.0, f.sz);
    for (const s of [-1, 1]) {
      const p = fr.pt(0, s * 1.05);
      ctx.addItem(p.x, p.z);
      ctx.poi(p.x, p.z, fr.ry + (s > 0 ? Math.PI : 0));
    }
  },
  souvenirtable(ctx, f) {
    const M = mats();
    ctx.B.box(M.wood, f.x, 0.4, f.z, f.sx, 0.8, f.sz);
    ctx.B.box(M.wood, f.x, 0.95, f.z, f.sx * 0.6, 0.3, f.sz * 0.6);
    const kinds = f.mix === 'wax' ? ['tea'] : ['flamingo', 'snowglobe', 'mug'];
    let k = 0;
    for (let x = f.x - f.sx / 2 + 0.12; x < f.x + f.sx / 2 - 0.08; x += 0.18)
      for (let z = f.z - f.sz / 2 + 0.12; z < f.z + f.sz / 2 - 0.08; z += 0.2) {
        const inner = Math.abs(x - f.x) < f.sx * 0.3 && Math.abs(z - f.z) < f.sz * 0.3;
        ctx.batch.add(
          kinds[k++ % kinds.length],
          k % 2,
          x,
          (inner ? 1.1 : 0.8) + ctx.FY,
          z,
          ctx.R() * 6,
        );
      }
    col(ctx, f.x, 0.55, f.z, f.sx, 1.1, f.sz);
    ctx.addItem(f.x, f.z + f.sz / 2 + 0.55);
    ctx.poi(f.x, f.z + f.sz / 2 + 0.55, Math.PI);
  },
  spinner(ctx, f) {
    const M = mats();
    ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), f.x, 0.9, f.z);
    ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10), f.x, 0.015, f.z);
    for (let lvl = 0; lvl < 5; lvl++)
      for (let a = 0; a < 6.28; a += 0.9) {
        const x = f.x + Math.sin(a) * 0.17,
          z = f.z + Math.cos(a) * 0.17;
        if (f.mix === 'cards')
          ctx.batch.add('postcard', (lvl + Math.round(a)) % 4, x, 0.5 + lvl * 0.26 + ctx.FY, z, a);
        else ctx.batch.add('sunglasses', lvl % 2, x, 0.6 + lvl * 0.24 + ctx.FY, z, a);
      }
    col(ctx, f.x, 0.9, f.z, 0.5, 1.8, 0.5);
    ctx.addItem(f.x, f.z + 0.6);
  },
  magrack(ctx, f) {
    const M = mats();
    ctx.B.box(M.wood, f.x, 0.7, f.z, f.sx, 1.4, f.sz);
    for (let k = 0; k < 12; k++) {
      const z = f.z - f.sz / 2 + 0.2 + ((k % 4) * (f.sz - 0.3)) / 4,
        y = 0.35 + Math.floor(k / 4) * 0.42;
      ctx.batch.add('mag', k % 6, f.x + 0.18, y + ctx.FY, z, Math.PI / 2, 1, -0.25);
    }
    col(ctx, f.x, 0.7, f.z, f.sx, 1.4, f.sz);
  },
  vending(ctx, f) {
    const M = mats();
    ctx.B.box(M.dark, f.x, 0.95, f.z, 0.85, 1.9, 0.75);
    ctx.B.add(
      mats().atlas,
      labelPlaneGeo('soda', 0, { art: 'stripe' }, 0.6, 1.3),
      f.x,
      1.1,
      f.z + 0.38,
    );
    col(ctx, f.x, 0.95, f.z, 0.85, 1.9, 0.75);
  },
  chairs(ctx, f) {
    const M = mats();
    const n = Math.max(1, Math.floor(Math.max(f.sx, f.sz) / 0.55));
    const alongZ = f.sz > f.sx;
    for (let i = 0; i < n; i++) {
      const u = -(n - 1) * 0.275 + i * 0.55;
      const x = f.x + (alongZ ? 0 : u),
        z = f.z + (alongZ ? u : 0);
      ctx.B.box(M.plastic, x, 0.45, z, 0.45, 0.05, 0.45);
      ctx.B.box(
        M.plastic,
        x + (alongZ ? -0.2 : 0),
        0.7,
        z + (alongZ ? 0 : -0.2),
        alongZ ? 0.04 : 0.45,
        0.45,
        alongZ ? 0.45 : 0.04,
      );
      ctx.B.box(M.chrome, x, 0.22, z, 0.4, 0.44, 0.03);
      ctx.seats.push({
        x: x + (alongZ ? 0.35 : 0),
        z: z + (alongZ ? 0 : 0.35),
        ry: alongZ ? Math.PI / 2 : 0,
      });
    }
    col(ctx, f.x, 0.4, f.z, f.sx, 0.8, f.sz);
  },
  atm(ctx, f) {
    const M = mats();
    ctx.B.box(M.steel, f.x, 0.8, f.z, 0.7, 1.6, 0.5);
    ctx.B.box(M.screenBlue, f.x, 1.25, f.z + 0.26, 0.4, 0.3, 0.01);
    col(ctx, f.x, 0.8, f.z, 0.7, 1.6, 0.5);
    ctx.addItem(f.x, f.z + 0.7, 'atm');
  },
  host(ctx, f) {
    const M = mats();
    ctx.B.box(M.darkwood, f.x, 0.6, f.z, 0.6, 1.2, 0.45);
    ctx.B.box(M.brass, f.x, 1.2, f.z, 0.62, 0.03, 0.47);
    ctx.batch.add('menu', 1, f.x, 1.22 + ctx.FY, f.z, 0.3);
    col(ctx, f.x, 0.6, f.z, 0.6, 1.2, 0.45);
  },
  plant(ctx, f) {
    ctx.prop('plant', '', f.x, f.z, ctx.R() * 6, {
      pot: ['#bc6c25', '#f1faee', '#264653', '#c8a97e'][Math.floor(ctx.R() * 4)],
      leaf: ['#2d6a4f', '#40916c', '#1b4332'][Math.floor(ctx.R() * 3)],
    });
  },
  ballbin(ctx, f) {
    const M = mats();
    ctx.B.box(M.chrome, f.x, 0.35, f.z, f.sx, 0.7, f.sz);
    for (let i = 0; i < 9; i++)
      ctx.B.add(
        M.board[i % 6],
        new THREE.SphereGeometry(0.12, 8, 6),
        f.x + ((i % 3) - 1) * 0.26,
        0.72 + (i % 2) * 0.05,
        f.z + (Math.floor(i / 3) - 1) * 0.26,
      );
    col(ctx, f.x, 0.4, f.z, f.sx, 0.8, f.sz);
    ctx.addItem(f.x, f.z + 0.8);
  },
  pooltable(ctx, f) {
    const M = mats();
    ctx.B.box(M.darkwood, f.x, 0.4, f.z, f.sx, 0.8, f.sz);
    ctx.B.box(M.felt, f.x, 0.81, f.z, f.sx - 0.2, 0.02, f.sz - 0.2);
    for (let i = 0; i < 8; i++)
      ctx.B.add(
        M.board[i % 6],
        new THREE.SphereGeometry(0.03, 6, 4),
        f.x + ((i % 3) - 1) * 0.07,
        0.85,
        f.z - 0.4 + Math.floor(i / 3) * 0.06,
      );
    col(ctx, f.x, 0.42, f.z, f.sx, 0.85, f.sz);
    ctx.seats.push({ x: f.x + f.sx / 2 + 0.4, z: f.z, ry: -Math.PI / 2 });
  },
  djbooth(ctx, f) {
    const M = mats();
    ctx.B.box(M.black, f.x, 0.2, f.z, f.sx + 1, 0.4, f.sz);
    ctx.B.box(M.dark, f.x, 0.85, f.z + 0.3, f.sx, 0.9, 0.6);
    ctx.B.box(M.strip, f.x, 1.31, f.z + 0.6, f.sx, 0.02, 0.02);
    for (const s of [-1, 1]) {
      ctx.B.add(
        M.black,
        new THREE.CylinderGeometry(0.16, 0.16, 0.03, 14),
        f.x + s * 0.45,
        1.33,
        f.z + 0.3,
      );
      ctx.B.add(
        M.chrome,
        new THREE.CylinderGeometry(0.03, 0.03, 0.035, 6),
        f.x + s * 0.45,
        1.34,
        f.z + 0.3,
      );
    }
    ctx.B.box(M.dark, f.x, 1.32, f.z + 0.3, 0.35, 0.05, 0.3);
    ctx.B.box(ctx.ledMat, f.x, 0.85, f.z + 0.61, f.sx * 0.9, 0.6, 0.01);
    col(ctx, f.x, 0.6, f.z + 0.3, f.sx, 1.2, 0.6);
    col(ctx, f.x, 0.2, f.z, f.sx + 1, 0.4, f.sz);
  },
  dancefloor(ctx, f) {
    const n = Math.max(3, Math.floor(f.sx / 0.6));
    const s = f.sx / n;
    const geo = new THREE.BoxGeometry(s - 0.03, 0.02, s - 0.03);
    const mat = danceMat();
    const im = new THREE.InstancedMesh(geo, mat, n * n);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        m.makeTranslation(
          f.x - f.sx / 2 + (i + 0.5) * s,
          0.012 + ctx.FY,
          f.z - f.sz / 2 + (j + 0.5) * s,
        );
        im.setMatrixAt(i + j * n, m);
        im.setColorAt(i + j * n, c.setHSL(((i + j) % 6) / 6, 1, 0.5));
      }
    ctx.grp.add(im);
    let acc = 0,
      ph = 0;
    ctx.anim.push((dt, night) => {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      ph++;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const on = (i * 7 + j * 3 + ph) % 5 < 2;
          c.setHSL(((i + j + ph) % 8) / 8, 1, on ? 0.55 : 0.08);
          c.multiplyScalar(night ? 2.2 : 1.2);
          im.setColorAt(i + j * n, c);
        }
      im.instanceColor.needsUpdate = true;
    });
    ctx.disposables.push(geo);
  },
  speakerstack(ctx, f) {
    const M = mats();
    for (let k = 0; k < 2; k++) {
      ctx.B.box(M.black, f.x, 0.45 + k * 0.9, f.z, 0.75, 0.88, 0.7);
      ctx.B.add(
        M.dark,
        new THREE.CylinderGeometry(0.25, 0.25, 0.02, 12).rotateX(Math.PI / 2),
        f.x,
        0.45 + k * 0.9,
        f.z + 0.36,
      );
    }
    col(ctx, f.x, 0.9, f.z, 0.75, 1.8, 0.7);
  },
  desk(ctx, f) {
    const M = mats();
    ctx.B.box(M.darkwood, f.x, 0.75, f.z, f.sx, 0.05, f.sz);
    ctx.B.box(M.darkwood, f.x, 0.37, f.z - f.sz / 2 + 0.05, f.sx, 0.74, 0.04);
    ctx.B.box(M.black, f.x, 1.0, f.z - 0.15, 0.5, 0.32, 0.03);
    ctx.B.box(M.screenBlue, f.x, 1.0, f.z - 0.13, 0.45, 0.27, 0.005);
    ctx.B.box(M.leather, f.x, 0.48, f.z - 0.75, 0.5, 0.08, 0.5);
    ctx.B.box(M.leather, f.x, 0.85, f.z - 1.0, 0.5, 0.6, 0.08);
    col(ctx, f.x, 0.4, f.z, f.sx, 0.8, f.sz);
    ctx.L.clerks.push({ x: f.x, z: f.z - 0.75, ry: 0, role: 'desk' });
    ctx.seats.push({ x: f.x, z: f.z + 0.7, ry: Math.PI });
  },
  ropeposts(ctx, f) {
    const M = mats();
    const n = Math.max(2, Math.floor(f.sx / 1.0));
    for (const zz of [f.z - f.sz / 2, f.z + f.sz / 2]) {
      for (let i = 0; i <= n; i++) {
        const x = f.x - f.sx / 2 + (i * f.sx) / n;
        ctx.B.add(M.brass, new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), x, 0.47, zz);
        ctx.B.add(M.brass, new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10), x, 0.015, zz);
      }
      ctx.B.box(M.rope, f.x, 0.85, zz, f.sx, 0.03, 0.03);
    }
    for (let i = 0; i < 4; i++)
      ctx.seats.push({ x: f.x - f.sx / 2 + 0.5 + i * 0.7, z: f.z, ry: Math.PI });
  },
  deskrow(ctx, f) {
    const M = mats();
    const fr = frame(f);
    const n = Math.max(1, Math.floor(fr.len / 2.6));
    for (let i = 0; i < n; i++) {
      const t = -fr.len / 2 + ((i + 0.5) * fr.len) / n;
      fbox(ctx, fr, M.darkwood, t, 0.15, 0.75, 1.5, 0.05, 0.8);
      fbox(ctx, fr, M.darkwood, t, 0.15 + 0.38, 0.37, 1.5, 0.74, 0.04);
      fbox(ctx, fr, M.black, t, -0.05, 1.0, 0.5, 0.32, 0.03);
      const sc = fr.pt(t, -0.03);
      ctx.B.add(
        M.screenBlue,
        new THREE.PlaneGeometry(0.45, 0.27),
        sc.x,
        1.0,
        sc.z,
        fr.ry + Math.PI,
      );
      fbox(ctx, fr, M.leather, t, -0.6, 0.48, 0.5, 0.08, 0.5);
      fbox(ctx, fr, M.leather, t, -0.85, 0.85, 0.5, 0.6, 0.08);
      for (const e of [-0.35, 0.35]) {
        fbox(ctx, fr, ctx.chairMat, t + e, 0.95, 0.45, 0.42, 0.05, 0.42);
        fbox(ctx, fr, ctx.chairMat, t + e, 1.15, 0.7, 0.42, 0.5, 0.04);
      }
      const p = fr.pt(t, 0.15);
      col(ctx, p.x, 0.4, p.z, fr.along === 'x' ? 1.5 : 0.8, 0.8, fr.along === 'x' ? 0.8 : 1.5);
      const c = fr.pt(t, -0.6);
      ctx.L.clerks.push({ x: c.x, z: c.z, ry: fr.ry, role: 'desk' });
      const s = fr.pt(t + 0.35, 0.95);
      ctx.seats.push({ x: s.x, z: s.z, ry: fr.ry + Math.PI });
    }
  },
  brochure(ctx, f) {
    const M = mats();
    ctx.B.add(M.darkwood, new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), f.x, 0.75, f.z);
    ctx.B.add(M.chrome, new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), f.x, 0.37, f.z);
    for (let k = 0; k < 6; k++)
      ctx.batch.add(
        'postcard',
        k % 4,
        f.x + Math.sin(k) * 0.3,
        0.78 + ctx.FY,
        f.z + Math.cos(k) * 0.3,
        k,
        1.3,
        -Math.PI / 2,
      );
    col(ctx, f.x, 0.4, f.z, 1.1, 0.8, 1.1);
  },
  clerkdesk() {},
};
BUILD['gondola-short'] = BUILD.gondola;
BUILD.dryerisland = BUILD.washers;

export function buildFixture(ctx, f) {
  if (f.invisible && f.k !== 'clerkzone') return;
  const b = BUILD[f.k];
  if (!b) return;
  try {
    b(ctx, f);
  } catch (e) {
    console.warn('[interiors] fixture failed', f.k, e);
  }
}
export { frame, fbox, col, BUILD as FIXTURES };
