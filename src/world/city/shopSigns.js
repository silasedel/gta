// Shop sign lettering for the street-front sign boards (r8, user: downtown ground floors without signs read flat).
// One shared canvas atlas of made-up brands (64 cells, 8:1 boards), painted once: lettering, background, a thin border, a
// little sun fade and grime. Back-lit look: the letters glow a little by day and properly at night (emissive follows
// M.lampHead like the street lamps when present).
//   import { shopSignAtlas, signQuad } from '../city/shopSigns.js'
//   const A = shopSignAtlas(); signQuad(batch, A, cellIndex, corners [[x,y,z] x4: bottom-left, bottom-right, top-right, top-left], normal)
import * as THREE from 'three';

const A1 = [
  'Coral',
  'Bayside',
  'Keystone',
  'Palmetto',
  'Tarpon',
  'Biscayne',
  'Sunrise',
  'Mangrove',
  'Pelican',
  'Royal',
  'Ocean',
  'Flamingo',
  'Calle',
  'Vizcaya',
  'Gulfstream',
  'Seabreeze',
];
const A2 = [
  'Pharmacy',
  'Deli',
  'Cafe',
  'Wireless',
  'Insurance',
  'Optical',
  'Bakery',
  'Dry Cleaners',
  'Market',
  'Cuban Kitchen',
  'Shoes',
  'Tailors',
  'Liquors',
  'Jewelers',
  'Barber Co.',
  'Bank',
  'Realty',
  'Travel',
  'Dental',
  'Fitness',
  'Books',
  'Tacos',
  'Pizza',
  'Florist',
];
const STY = [
  // [background, ink, accent]
  ['#f2ede2', '#1d3c5a', '#b23a2e'],
  ['#1c2a3a', '#f4efe2', '#e2b04a'],
  ['#9e2b25', '#fbf4e6', '#f4d27a'],
  ['#0f5c5a', '#f6f1e4', '#f0a35c'],
  ['#efe4c9', '#2b2b2b', '#2f6f8f'],
  ['#222222', '#f2c14e', '#f2c14e'],
  ['#e8e8e4', '#a8322a', '#1f4e79'],
  ['#2e4b2e', '#f1ead6', '#d9a441'],
];
let atlas = null;
const hash = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
export function shopSignAtlas() {
  if (atlas) return atlas;
  const COLS = 4,
    ROWS = 16,
    CW = 512,
    CH = 64;
  const cv = document.createElement('canvas');
  cv.width = COLS * CW;
  cv.height = ROWS * CH;
  const g = cv.getContext('2d');
  const fonts = [
    'bold 40px Georgia, serif',
    'bold 38px "Arial Black", Arial, sans-serif',
    'italic bold 40px Georgia, serif',
    'bold 36px "Trebuchet MS", Arial, sans-serif',
    '600 38px "Futura", "Avenir Next", Arial, sans-serif',
  ];
  for (let i = 0; i < COLS * ROWS; i++) {
    const x = (i % COLS) * CW,
      y = Math.floor(i / COLS) * CH,
      st = STY[(hash(i * 3.7) * STY.length) | 0];
    const name =
      A1[(hash(i * 1.3) * A1.length) | 0] + ' ' + A2[(hash(i * 2.9 + 5) * A2.length) | 0];
    g.fillStyle = st[0];
    g.fillRect(x, y, CW, CH);
    g.strokeStyle = st[2];
    g.lineWidth = 3;
    g.strokeRect(x + 5, y + 5, CW - 10, CH - 10);
    g.font = fonts[(hash(i * 5.1) * fonts.length) | 0];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fs = 1;
    const w = g.measureText(name.toUpperCase()).width;
    if (w > CW - 40) fs = (CW - 40) / w;
    g.save();
    g.translate(x + CW / 2, y + CH / 2 + 2);
    g.scale(fs, 1);
    g.fillStyle = st[1];
    g.fillText(hash(i * 7.7) < 0.7 ? name.toUpperCase() : name, 0, 0);
    g.restore();
    // weathering: sun fade toward the top, a few dark specks and a drip under the board
    const lg = g.createLinearGradient(0, y, 0, y + CH);
    lg.addColorStop(0, 'rgba(255,250,235,0.10)');
    lg.addColorStop(1, 'rgba(40,35,30,0.10)');
    g.fillStyle = lg;
    g.fillRect(x, y, CW, CH);
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(30,28,24,${0.05 + hash(i * 13 + k) * 0.1})`;
      g.fillRect(x + hash(i * 17 + k) * CW, y + hash(i * 19 + k) * CH, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(1, 0.94, 0.84),
    emissiveIntensity: 0.08,
    roughness: 0.55,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  mat.name = 'shop-signs';
  atlas = { mat, COLS, ROWS, n: COLS * ROWS };
  return atlas;
}
// a lettered face (two triangles) over a sign board; q = 4 corners (bl, br, tr, tl), n = outward normal [x, y, z]
export function signQuad(batch, A, cell, q, n, col) {
  const c = cell % A.n,
    u0 = (c % A.COLS) / A.COLS,
    u1 = u0 + 1 / A.COLS,
    v1 = 1 - Math.floor(c / A.COLS) / A.ROWS,
    v0 = v1 - 1 / A.ROWS;
  const uv = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  for (const k of [0, 1, 2, 0, 2, 3])
    batch.vert(q[k][0], q[k][1], q[k][2], n[0], n[1], n[2], uv[k][0], uv[k][1], col);
}
// night glow: back-lit letters follow the street lamps
export function updateSignGlow(lampI) {
  if (atlas) atlas.mat.emissiveIntensity = 0.08 + Math.min(1, (lampI || 0) / 6) * 1.1;
}
