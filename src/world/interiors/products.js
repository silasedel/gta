// Product atlas + individually modelled, labelled products for Port Solana stores (INTERIORS agent).
// All brand names are made up. One shared canvas atlas; every product geometry has UVs remapped into its label cell,
// so a whole shop's stock merges into a single mesh (one draw call).
import * as THREE from 'three';

const CELLS = 21, CPX = 96, SIZE = CELLS * CPX; // ~2k atlas, 441 cells of 96 px
let ATLAS = null;

function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const BRANDS = {
  chips: ['CRUNCHWAVE', 'SOL CHIPS', 'PLANTAÑA', 'REEF RIPPLES', 'KETTLE KEY', 'TIKI CRISP'],
  soda: ['SOL FIZZ', 'BRISA COLA', 'MANGO MOJO', 'LIME LAGOON', 'GUAVA POP', 'ROOT REEF'],
  energy: ['VOLTUP', 'RIPTIDE', 'HURRICANE', 'NEON RUSH'],
  cereal: ["PALMETTO O'S", 'COCO LOOPS', 'SUNNY FLAKES', 'MANGO CRUNCH'],
  candy: ['CARAMEL KEY', 'CHOCO DUNE', 'TAFFY TIDE', 'NUTTY GULL', 'MINT BREEZE'],
  bread: ['SUNRISE', 'ABUELA\'S', 'CUBANO LOAF'],
  water: ['TIDEPOOL', 'SPRINGWELL', 'AGUA CLARA'],
  mag: ['SOLANA LIFE', 'GEAR HEAD', 'SURF LINE', 'GLOSS', 'BEAT', 'TECH NOW'],
  liquor: ['REEF RUM', 'CALORA GOLD', 'LOBO LAGER', 'SILVER HERON', 'OLD CYPRESS', 'PELICAN GIN', 'MARLIN VODKA'],
  pharm: ['CALMEX', 'DOLORIN', 'VITASOL', 'ALOE+', 'SNEEZEFREE', 'DERMACALM'],
  beauty: ['GLOW THEORY', 'LUMIÈRE', 'PETAL', 'VELVET', 'NOVA'],
  perfume: ['NOIR', 'SOLEIL', 'MAREA', 'ÉCLAT'],
  tech: ['VOLTLINE', 'PULSE', 'ZAPCORD', 'NEXA'],
  auto: ['TORQUEMAX', 'GRIPLINE', 'SURGE', 'ROADKING'],
  ammo: ['SOLANA ARMS', 'TARGETLINE', 'COASTGUARD'],
  shoe: ['STRIDE', 'KAIZEN', 'AERO', 'DUNEWALK'],
  pasta: ['NONNA SOL', 'BAYPASTA', 'FARFALLA', 'DURO'],
  soup: ['ABUELA', 'HARBOR', 'CALDO'],
  sauce: ['FUEGO', 'KEY WEST', 'MOSTAZA', 'TOMATÍN'],
  dairy: ['COW BAY', 'CREMA', 'FINCA', 'LECHERA'],
  frozen: ['ICEBOX', 'POLAR PALM', 'FROSTLINE'],
  wine: ['VIÑA MAR', 'CORAL ROUGE', 'BAY ROSÉ', 'TERRAZA', 'OLD PIER'],
  console: ['NEXA', 'ORBIT', 'PULSE PLAY'],
  coffee: ['OLA', 'CAFÉ BRISA', 'TOSTADO', 'BAYROAST'],
  icecream: ['GELATO SOL', 'FROSTY FLAMINGO', 'COCO FRÍO'],
  soap: ['SUDSY', 'FRESCA', 'WAVE WASH'],
  souvenir: ['MIAMI', 'SOUTH BEACH', 'BISCAYNE', 'OCEAN DR'],
  tea: ['TÉ VERDE', 'HIBISCUS', 'CHAMOMILA'],
  snack: ['POPPA', 'NUTTY BAY', 'GRANOLA SOL'],
  paint: ['COASTAL COAT', 'SUNPROOF', 'PALMETTO PAINT'],
};

function hsl(h, s, l) { return `hsl(${Math.round(h * 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`; }

function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const cells = new Map(); let next = 0;
  const alloc = (key, draw) => {
    if (cells.has(key)) return cells.get(key);
    if (next >= CELLS * CELLS) return cells.get('white') || cells.values().next().value;
    const i = next++; const cx = (i % CELLS) * CPX, cy = Math.floor(i / CELLS) * CPX;
    g.save(); g.beginPath(); g.rect(cx, cy, CPX, CPX); g.clip(); g.translate(cx, cy); draw(g, CPX); g.restore();
    const pad = 2 / SIZE;
    const cell = { u0: cx / SIZE + pad, v0: 1 - (cy + CPX) / SIZE + pad, w: CPX / SIZE - 2 * pad, h: CPX / SIZE - 2 * pad };
    cells.set(key, cell); if (ATLAS) ATLAS.dirty = true; return cell;
  };
  const font = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px "Barlow Condensed","Arial Narrow",Arial,sans-serif`;
  const text = (gg, t, x, y, px, col, maxW = CPX - 8) => { px = Math.round(px * CPX / 128); gg.font = font(px); let p = px; while (gg.measureText(t).width > maxW && p > 8) { p -= 2; gg.font = font(p); } gg.fillStyle = col; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(t, x, y); };
  const solid = (key, col, noise = 0) => alloc(key, (gg, s) => { gg.fillStyle = col; gg.fillRect(0, 0, s, s); if (noise) { const r = rng(key.length * 77); for (let i = 0; i < 300; i++) { gg.fillStyle = `rgba(0,0,0,${r() * noise})`; gg.fillRect(r() * s, r() * s, 2 + r() * 6, 1 + r() * 2); } } });
  // generic label: background, art and brand text
  const label = (cat, i, opts = {}) => alloc(`${cat}:${i}`, (gg, s) => {
    const r = rng(cat.length * 131 + i * 17 + 3);
    const names = BRANDS[cat] || ['BRAND'];
    const name = names[i % names.length];
    const hue = r(); const bg = hsl(hue, 0.75, opts.dark ? 0.18 : 0.5 + r() * 0.1); const fg = '#ffffff';
    const gr = gg.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, bg); gr.addColorStop(1, hsl(hue + 0.05, 0.8, opts.dark ? 0.08 : 0.32));
    gg.fillStyle = gr; gg.fillRect(0, 0, s, s);
    const art = opts.art || 'circle';
    gg.globalAlpha = 0.9;
    if (art === 'circle') { gg.fillStyle = hsl(hue + 0.5, 0.9, 0.6); gg.beginPath(); gg.arc(s * 0.5, s * 0.62, s * 0.22, 0, Math.PI * 2); gg.fill(); }
    else if (art === 'wave') { gg.fillStyle = hsl(hue + 0.4, 0.8, 0.7); gg.beginPath(); gg.moveTo(0, s * 0.7); for (let x = 0; x <= s; x += 8) gg.lineTo(x, s * 0.7 + Math.sin(x / 12) * 8); gg.lineTo(s, s); gg.lineTo(0, s); gg.fill(); }
    else if (art === 'bowl') { gg.fillStyle = '#fff'; gg.beginPath(); gg.ellipse(s * 0.5, s * 0.72, s * 0.32, s * 0.14, 0, 0, Math.PI); gg.fill(); for (let k = 0; k < 14; k++) { gg.fillStyle = hsl(r() * 0.15, 0.9, 0.55); gg.beginPath(); gg.arc(s * (0.25 + r() * 0.5), s * (0.62 + r() * 0.08), 5, 0, Math.PI * 2); gg.fill(); } }
    else if (art === 'stripe') { for (let k = 0; k < 5; k++) { gg.fillStyle = k % 2 ? hsl(hue + 0.5, 0.7, 0.6) : 'rgba(255,255,255,0.7)'; gg.fillRect(0, s * (0.55 + k * 0.06), s, s * 0.03); } }
    else if (art === 'bolt') { gg.fillStyle = hsl(hue + 0.3, 1, 0.6); gg.beginPath(); gg.moveTo(s * 0.55, s * 0.4); gg.lineTo(s * 0.35, s * 0.7); gg.lineTo(s * 0.5, s * 0.7); gg.lineTo(s * 0.42, s * 0.95); gg.lineTo(s * 0.68, s * 0.6); gg.lineTo(s * 0.52, s * 0.6); gg.closePath(); gg.fill(); }
    else if (art === 'face') { gg.fillStyle = hsl(0.07, 0.4, 0.75); gg.beginPath(); gg.ellipse(s * 0.5, s * 0.62, s * 0.18, s * 0.24, 0, 0, Math.PI * 2); gg.fill(); gg.fillStyle = hsl(r(), 0.5, 0.25); gg.fillRect(s * 0.3, s * 0.36, s * 0.4, s * 0.1); }
    gg.globalAlpha = 1;
    gg.fillStyle = 'rgba(0,0,0,0.35)'; gg.fillRect(0, s * 0.12, s, s * 0.26);
    text(gg, name, s / 2, s * 0.25, 30, fg);
    if (opts.sub) text(gg, opts.sub, s / 2, s * 0.45, 16, '#ffe9a8');
    gg.fillStyle = 'rgba(255,255,255,0.9)'; gg.fillRect(s * 0.06, s * 0.88, s * 0.22, s * 0.08); // barcode-ish
    gg.fillStyle = '#000'; for (let k = 0; k < 10; k++) gg.fillRect(s * 0.07 + k * 2.5, s * 0.89, 1, s * 0.06);
  });
  const textCell = (key, t, bg, fg) => alloc(key, (gg, s) => { gg.fillStyle = bg; gg.fillRect(0, 0, s, s); text(gg, t, s / 2, s / 2, 44, fg, s - 4); });
  ATLAS = { canvas: c, alloc, solid, label, textCell, cells };
  // shared solids
  for (const [k, col, n] of [['wood', '#9a6b43', 0.25], ['cardboard', '#c49a6c', 0.15], ['metal', '#8c9196', 0.1], ['black', '#141416', 0], ['white', '#f4f4f0', 0],
    ['gold', '#e8b923', 0.05], ['silver', '#d8dde3', 0.05], ['gunmetal', '#2a2d31', 0.1], ['rubber', '#1b1b1b', 0.2], ['orange', '#f39c12', 0.05], ['apple', '#c0392b', 0.05],
    ['lime', '#7cb342', 0.05], ['banana', '#f4d03f', 0.05], ['glass', '#bfe3ea', 0], ['glassG', '#2f5d3a', 0], ['glassA', '#8a5a1e', 0], ['pegboard', '#d8c3a0', 0], ['tan', '#c8a97e', 0.2], ['olive', '#4b5320', 0.15], ['red', '#d62828', 0], ['navy', '#1d3557', 0.05]]) ATLAS.solid(k, col, n);
  ATLAS.alloc('stock', (gg, s) => { const r = rng(4242); for (let y = 0; y < s; y += 32) { let x = 0; while (x < s) { const w = 6 + r() * 14; gg.fillStyle = hsl(r(), 0.7, 0.35 + r() * 0.3); gg.fillRect(x, y + 4 + r() * 6, w - 1, 28 - r() * 8); x += w; } gg.fillStyle = '#ddd'; gg.fillRect(0, y + 30, s, 2); } });
  ATLAS.alloc('pegboard', (gg, s) => { gg.fillStyle = '#d8c3a0'; gg.fillRect(0, 0, s, s); gg.fillStyle = '#6b5a40'; for (let y = 8; y < s; y += 16) for (let x = 8; x < s; x += 16) { gg.beginPath(); gg.arc(x, y, 2.5, 0, Math.PI * 2); gg.fill(); } });
  ATLAS.tex = new THREE.CanvasTexture(c); ATLAS.tex.colorSpace = THREE.SRGBColorSpace; ATLAS.tex.anisotropy = 4; ATLAS.tex.generateMipmaps = true;
  return ATLAS;
}
export function getAtlas() { return ATLAS || makeAtlas(); }

// ---------- geometry templates ----------
function clean(g) { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }
function mapUV(g, cell) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, cell.u0 + THREE.MathUtils.clamp(uv.getX(i), 0, 1) * cell.w, cell.v0 + THREE.MathUtils.clamp(uv.getY(i), 0, 1) * cell.h); uv.needsUpdate = true; return g; }
const TPL = new Map();
function part(geo, cell, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const g = mapUV(clean(geo), cell); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z)); return g; }
function mergeParts(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); uv.set(p.attributes.uv.array, o * 2); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function bagGeo(w, h, d, seed) { // crinkled pillow bag with crimped ends
  const g = new THREE.BoxGeometry(w, h, d, 2, 4, 1); const p = g.attributes.position; const r = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / (h / 2); const x = p.getX(i) / (w / 2);
    const puff = Math.max(0.05, 1 - Math.pow(Math.abs(y), 3)) * (1 - 0.25 * x * x);
    p.setZ(i, p.getZ(i) * puff * (0.9 + r() * 0.2));
    if (Math.abs(y) > 0.85) p.setY(i, p.getY(i) + (r() - 0.5) * 0.01);
    p.setX(i, p.getX(i) * (1 + (r() - 0.5) * 0.04));
  }
  g.computeVertexNormals(); return g;
}

// labelled cylinder: front half and back half each show the whole label (so text reads from the front)
function lcyl(r, h, seg, cell, y = 0, backCell = null, open = false) {
  const ps = [part(new THREE.CylinderGeometry(r, r, h, seg, 1, true, -Math.PI / 2, Math.PI), cell, 0, y + h / 2, 0), part(new THREE.CylinderGeometry(r, r, h, seg, 1, true, Math.PI / 2, Math.PI), backCell || cell, 0, y + h / 2, 0)];
  if (!open) ps.push(part(new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2), A().cells.get('silver'), 0, y + h, 0));
  return ps;
}
// bottle: labelled body + glass shoulder/neck + cap
function lbottle(r, h, neck, labelCell, glassKey = 'glassG', capKey = 'gold') {
  const hb = h * (1 - neck), hs = h * neck * 0.35, hn = h * neck * 0.65;
  const gl = A().cells.get(glassKey) || A().cells.get('glass');
  return mergeParts([
    ...lcyl(r, hb, 7, labelCell, 0, gl, true),
    part(new THREE.CylinderGeometry(r * 0.34, r, hs, 7, 1, true), gl, 0, hb + hs / 2, 0),
    part(new THREE.CylinderGeometry(r * 0.32, r * 0.32, hn, 5, 1, true), gl, 0, hb + hs + hn / 2, 0),
    part(new THREE.CylinderGeometry(r * 0.36, r * 0.36, h * 0.06, 5, 1, true), A().cells.get(capKey), 0, h - h * 0.03, 0), part(new THREE.CircleGeometry(r * 0.36, 5).rotateX(-Math.PI / 2), A().cells.get(capKey), 0, h, 0),
  ]);
}
function bottleGeo(r0, h, neck = 0.3, seg = 6) {
  const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r0, h * (1 - neck)), new THREE.Vector2(r0 * 0.4, h * (1 - neck * 0.4)), new THREE.Vector2(r0 * 0.32, h), new THREE.Vector2(0.001, h)];
  return new THREE.LatheGeometry(pts, seg);
}
const A = () => getAtlas();
// key -> builder returning merged geometry (feet at y=0, front facing +Z)
const BUILDERS = {
  chips: (i) => part(bagGeo(0.2, 0.3, 0.09, i + 5), A().label('chips', i, { art: ['wave', 'circle', 'stripe'][i % 3], sub: ['SEA SALT', 'MANGO HABANERO', 'LIME', 'BBQ'][i % 4] }), 0, 0.15, 0),
  can: (i) => mergeParts(lcyl(0.033, 0.12, 8, A().label('soda', i, { art: 'stripe' }))),
  sixpack: (i) => { const ps = [part(new THREE.BoxGeometry(0.21, 0.12, 0.14), A().label('soda', i, { art: 'wave', sub: '6 PACK' }), 0, 0.06, 0)]; for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) ps.push(part(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 5), A().cells.get('silver'), (a - 1) * 0.068, 0.124, (b - 0.5) * 0.068)); return mergeParts(ps); },
  energy: (i) => mergeParts(lcyl(0.028, 0.165, 8, A().label('energy', i, { art: 'bolt', dark: true }))),
  cereal: (i) => part(new THREE.BoxGeometry(0.2, 0.3, 0.07), A().label('cereal', i, { art: 'bowl', sub: 'WHOLE GRAIN' }), 0, 0.15, 0),
  candy: (i) => part(new THREE.BoxGeometry(0.13, 0.025, 0.045), A().label('candy', i, { art: 'stripe' }), 0, 0.0125, 0),
  bread: (i) => { const g = new THREE.SphereGeometry(0.5, 8, 5); g.scale(0.28, 0.12, 0.13); return part(g, A().label('bread', i, { art: 'wave' }), 0, 0.06, 0); },
  water: (i) => { const ps = [part(new THREE.BoxGeometry(0.28, 0.2, 0.21), A().label('water', i, { art: 'wave', sub: '24 PACK' }), 0, 0.1, 0)]; for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) ps.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 5), A().cells.get('navy'), (a - 1.5) * 0.068, 0.21, (b - 1) * 0.068)); return mergeParts(ps); },
  crate: (i) => { const fruit = ['orange', 'apple', 'lime', 'banana'][i % 4]; const ps = [part(new THREE.BoxGeometry(0.5, 0.18, 0.36), A().cells.get('wood'), 0, 0.09, 0)]; const r = rng(i + 9); for (let k = 0; k < 12; k++) ps.push(part(new THREE.SphereGeometry(0.05, 5, 4), A().cells.get(fruit), (r() - 0.5) * 0.4, 0.19 + r() * 0.04, (r() - 0.5) * 0.26)); return mergeParts(ps); },
  mag: (i) => part(new THREE.BoxGeometry(0.21, 0.28, 0.008), A().label('mag', i, { art: 'face', sub: 'SUMMER ISSUE' }), 0, 0.14, 0),
  blister: (i) => mergeParts([part(new THREE.BoxGeometry(0.12, 0.18, 0.01), A().label('tech', i, { art: 'bolt', dark: true, sub: ['USB-C', 'EARBUDS', 'CASE', 'CHARGER'][i % 4] }), 0, -0.09, 0), part(new THREE.BoxGeometry(0.07, 0.09, 0.03), A().cells.get(['black', 'white', 'navy'][i % 3]), 0, -0.1, 0.02)]),
  perfume: (i) => mergeParts([part(new THREE.BoxGeometry(0.07, 0.09, 0.04), A().label('perfume', i, { art: 'circle', dark: true }), 0, 0.045, 0), part(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), A().cells.get('gold'), 0, 0.105, 0)]),
  palette: (i) => part(new THREE.BoxGeometry(0.14, 0.015, 0.1), A().label('beauty', i, { art: 'circle', sub: 'PALETTE' }), 0, 0.0075, 0),
  lipstick: (i) => mergeParts([part(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 6), A().cells.get('gold'), 0, 0.025, 0), part(new THREE.CylinderGeometry(0.008, 0.009, 0.02, 6), A().cells.get(['red', 'apple'][i % 2]), 0, 0.06, 0)]),
  sunglasses: (i) => mergeParts([part(new THREE.BoxGeometry(0.055, 0.035, 0.008), A().cells.get('black'), -0.032, 0, 0), part(new THREE.BoxGeometry(0.055, 0.035, 0.008), A().cells.get('black'), 0.032, 0, 0), part(new THREE.BoxGeometry(0.14, 0.008, 0.008), A().cells.get(i % 2 ? 'gold' : 'black'), 0, 0.018, 0)]),
  liquor: (i) => lbottle(0.038, 0.3 + (i % 3) * 0.03, 0.38, A().label('liquor', i, { art: ['stripe', 'circle', 'wave'][i % 3], dark: i % 2 === 0, sub: ['AÑEJO', 'LAGER', 'GIN', 'VODKA', 'RESERVA'][i % 5] }), ['glassA', 'glassG', 'glass'][i % 3]),
  pills: (i) => part(new THREE.BoxGeometry(0.1, 0.13, 0.04), A().label('pharm', i, { art: 'stripe', sub: ['200MG', 'NIGHT', 'DAY', 'KIDS'][i % 4] }), 0, 0.065, 0),
  pillbottle: (i) => mergeParts([...lcyl(0.03, 0.08, 7, A().label('pharm', i + 7, { art: 'circle' }), 0, A().cells.get('orange'), true), part(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 7), A().cells.get('white'), 0, 0.09, 0)]),
  jug: (i) => mergeParts([part(new THREE.BoxGeometry(0.16, 0.22, 0.09), A().label('auto', i, { art: 'stripe', sub: '5W-30' }), 0, 0.11, 0), part(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), A().cells.get('black'), 0.05, 0.24, 0)]),
  battery: (i) => mergeParts([part(new THREE.BoxGeometry(0.26, 0.19, 0.17), A().label('auto', i + 3, { art: 'bolt', dark: true, sub: '750 CCA' }), 0, 0.095, 0), part(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), A().cells.get('red'), 0.08, 0.2, 0), part(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), A().cells.get('black'), -0.08, 0.2, 0)]),
  tire: () => part(new THREE.TorusGeometry(0.26, 0.09, 8, 16), A().cells.get('rubber'), 0, 0.35, 0),
  pistol: () => mergeParts([part(new THREE.BoxGeometry(0.2, 0.035, 0.03), A().cells.get('gunmetal'), 0, 0.12, 0), part(new THREE.BoxGeometry(0.035, 0.1, 0.028), A().cells.get('black'), -0.06, 0.06, 0, 0, 0, -0.25)]),
  rifle: (i) => mergeParts([part(new THREE.BoxGeometry(0.035, 0.75, 0.04), A().cells.get('gunmetal'), 0, 0.5, 0), part(new THREE.BoxGeometry(0.05, 0.28, 0.06), A().cells.get(i % 2 ? 'wood' : 'black'), 0, 0.14, 0), part(new THREE.BoxGeometry(0.03, 0.08, 0.1), A().cells.get('black'), 0, 0.5, 0.04)]),
  ammo: (i) => part(new THREE.BoxGeometry(0.1, 0.06, 0.07), A().label('ammo', i, { art: 'stripe', dark: true, sub: ['9MM', '12GA', '.45', '5.56'][i % 4] }), 0, 0.03, 0),
  vest: () => mergeParts([part(new THREE.BoxGeometry(0.42, 0.5, 0.08), A().cells.get('olive'), 0, 0.25, 0), part(new THREE.BoxGeometry(0.12, 0.12, 0.04), A().cells.get('black'), -0.1, 0.3, 0.05), part(new THREE.BoxGeometry(0.12, 0.12, 0.04), A().cells.get('black'), 0.1, 0.3, 0.05)]),
  ring: (i) => part(new THREE.TorusGeometry(0.018, 0.005, 4, 8), A().cells.get(i % 2 ? 'gold' : 'silver'), 0, 0.02, 0),
  necklace: (i) => part(new THREE.TorusGeometry(0.07, 0.004, 3, 12), A().cells.get(i % 2 ? 'gold' : 'silver'), 0, 0.005, 0, Math.PI / 2),
  watch: (i) => mergeParts([part(new THREE.TorusGeometry(0.03, 0.008, 4, 8), A().cells.get('black'), 0, 0.03, 0), part(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 12), A().cells.get(i % 2 ? 'gold' : 'silver'), 0, 0.03, 0.03, Math.PI / 2)]),
  shirts: (i) => { const ps = []; const col = ['navy', 'white', 'red', 'olive', 'tan', 'black'][i % 6]; for (let k = 0; k < 4; k++) ps.push(part(new THREE.BoxGeometry(0.3, 0.035, 0.24), A().cells.get(col), 0, 0.02 + k * 0.04, 0, 0, (k % 2) * 0.05)); return mergeParts(ps); },
  shoebox: (i) => part(new THREE.BoxGeometry(0.32, 0.12, 0.2), A().label('shoe', i, { art: 'wave' }), 0, 0.06, 0),
  guitar: (i) => mergeParts([part(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 14), A().cells.get(i % 2 ? 'wood' : 'red'), 0, 0.2, 0, Math.PI / 2), part(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 14), A().cells.get(i % 2 ? 'wood' : 'red'), 0, 0.42, 0, Math.PI / 2), part(new THREE.BoxGeometry(0.05, 0.5, 0.025), A().cells.get('black'), 0, 0.8, 0)]),
  bottlecleaner: (i) => lbottle(0.04, 0.25, 0.3, A().label('pharm', i + 3, { art: 'wave', sub: 'CLEAN' }), 'white', 'navy'),
};
const C = (k) => A().cells.get(k) || A().solid(k, k.startsWith('#') ? k : '#888888');
const COLOR_FAMILIES = ['#1d3557', '#e63946', '#f1faee', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#ff99c8', '#a8dadc', '#111111', '#7b2cbf', '#8d6e63'];
export const GARMENT_COLORS = COLOR_FAMILIES;
Object.assign(BUILDERS, {
  pasta: (i) => part(new THREE.BoxGeometry(0.09, 0.26, 0.06), A().label('pasta', i, { art: 'stripe', sub: ['PENNE', 'SPAGHETTI', 'FUSILLI', 'RIGATONI'][i % 4] }), 0, 0.13, 0),
  soup: (i) => mergeParts(lcyl(0.038, 0.11, 8, A().label('soup', i, { art: 'bowl', sub: ['BLACK BEAN', 'CHICKEN', 'TOMATO'][i % 3] }))),
  sauce: (i) => lbottle(0.03, 0.2, 0.35, A().label('sauce', i, { art: 'circle', sub: ['KETCHUP', 'MUSTARD', 'HOT SAUCE', 'MOJO'][i % 4] }), ['apple', 'banana', 'red', 'orange'][i % 4], 'white'),
  milk: (i) => mergeParts([part(new THREE.BoxGeometry(0.11, 0.22, 0.11), A().label('dairy', i, { art: 'wave', sub: ['WHOLE', '2%', 'OAT', 'SKIM'][i % 4] }), 0, 0.11, 0), part(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), C(['white', 'red', 'navy'][i % 3]), 0, 0.235, 0)]),
  yogurt: (i) => { const ps = []; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) ps.push(part(new THREE.CylinderGeometry(0.032, 0.026, 0.07, 6), A().label('dairy', i + 4, { art: 'circle', sub: 'YOGUR' }), (a - 0.5) * 0.07, 0.035, (b - 0.5) * 0.07)); return mergeParts(ps); },
  frozen: (i) => part(new THREE.BoxGeometry(0.24, 0.05, 0.18), A().label('frozen', i, { art: 'bowl', dark: true, sub: ['PIZZA', 'EMPANADAS', 'DINNER', 'WAFFLES'][i % 4] }), 0, 0.025, 0, Math.PI / 2 * 0),
  frozenUp: (i) => part(new THREE.BoxGeometry(0.2, 0.26, 0.05), A().label('frozen', i, { art: 'bowl', dark: true, sub: ['PIZZA', 'EMPANADAS', 'DINNER', 'WAFFLES'][i % 4] }), 0, 0.13, 0),
  wine: (i) => lbottle(0.037, 0.31, 0.42, A().label('wine', i, { art: ['stripe', 'circle'][i % 2], dark: true, sub: ['MALBEC', 'ROSÉ', 'BLANCO', 'TINTO', 'CAVA'][i % 5] }), i % 5 === 2 ? 'glass' : 'glassG', 'red'),
  wineLying: (i) => { const g = lbottle(0.037, 0.31, 0.42, A().label('wine', i, { dark: true }), 'glassG', 'red'); g.rotateX(Math.PI / 2); g.translate(0, 0.04, -0.15); return g; },
  console: (i) => part(new THREE.BoxGeometry(0.36, 0.1, 0.28), A().label('console', i, { art: 'bolt', dark: true, sub: ['PRO', 'SLIM', 'X'][i % 3] }), 0, 0.05, 0),
  consoleUp: (i) => part(new THREE.BoxGeometry(0.3, 0.38, 0.1), A().label('console', i, { art: 'bolt', dark: true, sub: 'CONSOLE' }), 0, 0.19, 0),
  phonebox: (i) => part(new THREE.BoxGeometry(0.09, 0.17, 0.05), A().label('tech', i + 2, { art: 'circle', sub: ['X PHONE', 'MINI', 'MAX'][i % 3] }), 0, 0.085, 0),
  headphones: (i) => mergeParts([part(new THREE.TorusGeometry(0.08, 0.012, 4, 10, Math.PI), C(['black', 'white', 'red'][i % 3]), 0, 0.1, 0), part(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), C(['black', 'white', 'red'][i % 3]), 0.08, 0.1, 0, 0, 0, Math.PI / 2), part(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), C(['black', 'white', 'red'][i % 3]), -0.08, 0.1, 0, 0, 0, Math.PI / 2)]),
  tvbox: (i) => part(new THREE.BoxGeometry(0.95, 0.6, 0.14), A().label('tech', i + 5, { art: 'wave', dark: true, sub: ['55" 4K', '65" OLED', '43" SMART'][i % 3] }), 0, 0.3, 0),
  coffeebag: (i) => part(bagGeo(0.14, 0.22, 0.07, i + 31), A().label('coffee', i, { art: 'circle', dark: true, sub: ['ESPRESSO', 'CUBANO', 'DECAF'][i % 3] }), 0, 0.11, 0),
  cups: () => { const ps = []; for (let k = 0; k < 8; k++) ps.push(part(new THREE.CylinderGeometry(0.045, 0.034, 0.1, 7, 1, true), C('white'), 0, 0.05 + k * 0.025, 0)); return mergeParts(ps); },
  donut: (i) => mergeParts([part(new THREE.TorusGeometry(0.045, 0.022, 5, 8), C('tan'), 0, 0.022, 0, Math.PI / 2), part(new THREE.TorusGeometry(0.045, 0.018, 3, 8), C(['#ff99c8', '#5c3317', '#f1faee', '#e9c46a'][i % 4]), 0, 0.032, 0, Math.PI / 2)]),
  pastry: (i) => { const g = new THREE.SphereGeometry(0.5, 7, 4); g.scale(0.14, 0.06, 0.09); return part(g, C(['#d4a373', '#e9c46a', '#bc6c25'][i % 3]), 0, 0.03, 0); },
  tub: (i) => mergeParts([part(new THREE.BoxGeometry(0.24, 0.12, 0.17), C('silver'), 0, 0.06, 0), part(new THREE.BoxGeometry(0.22, 0.02, 0.15), C(['#ff99c8', '#5c3317', '#f1faee', '#a7c957', '#ffb703', '#e63946', '#c8b6ff'][i % 7]), 0, 0.125, 0)]),
  detergent: (i) => mergeParts([part(new THREE.BoxGeometry(0.17, 0.26, 0.11), A().label('soap', i, { art: 'wave', sub: ['FRESH', 'COLOR', 'SPORT'][i % 3] }), 0, 0.13, 0), part(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 6), C(['orange', 'navy', 'lime'][i % 3]), 0.04, 0.28, 0)]),
  flamingo: () => mergeParts([part(new THREE.SphereGeometry(0.05, 6, 4), C('#ff7eb6'), 0, 0.12, 0), part(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4), C('#ff7eb6'), 0.03, 0.2, 0, 0, 0, -0.3), part(new THREE.SphereGeometry(0.018, 5, 3), C('#ff7eb6'), 0.05, 0.25, 0), part(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 3), C('black'), 0, 0.04, 0)]),
  snowglobe: (i) => mergeParts([part(new THREE.CylinderGeometry(0.05, 0.055, 0.035, 8), C('wood'), 0, 0.0175, 0), part(new THREE.SphereGeometry(0.05, 8, 6), C(['#bde0fe', '#caffbf'][i % 2]), 0, 0.08, 0)]),
  postcard: (i) => part(new THREE.BoxGeometry(0.15, 0.1, 0.004), A().label('souvenir', i, { art: 'wave', sub: 'GREETINGS' }), 0, 0.05, 0),
  tee: (i) => part(new THREE.BoxGeometry(0.42, 0.55, 0.012), A().label('souvenir', i + 4, { art: ['wave', 'circle'][i % 2], sub: 'EST. 1896' }), 0, -0.3, 0),
  garment: (i) => mergeParts([part(new THREE.BoxGeometry(0.44, 0.7, 0.03), C(COLOR_FAMILIES[i % COLOR_FAMILIES.length]), 0, -0.4, 0), part(new THREE.TorusGeometry(0.035, 0.004, 3, 6, Math.PI), C('silver'), 0, 0.0, 0)]),
  dress: (i) => { const g = new THREE.CylinderGeometry(0.08, 0.26, 0.95, 7, 1, true); return mergeParts([part(g, C(COLOR_FAMILIES[i % COLOR_FAMILIES.length]), 0, -0.52, 0), part(new THREE.TorusGeometry(0.035, 0.004, 3, 6, Math.PI), C('silver'), 0, 0.0, 0)]); },
  shoe: (i) => mergeParts([part(new THREE.BoxGeometry(0.1, 0.07, 0.27), C(COLOR_FAMILIES[(i * 5) % COLOR_FAMILIES.length]), -0.06, 0.035, 0), part(new THREE.BoxGeometry(0.1, 0.07, 0.27), C(COLOR_FAMILIES[(i * 5) % COLOR_FAMILIES.length]), 0.06, 0.035, 0), part(new THREE.BoxGeometry(0.22, 0.02, 0.28), C('white'), 0, 0.01, 0)]),
  hat: (i) => mergeParts([part(new THREE.CylinderGeometry(0.09, 0.1, 0.1, 9), C(['tan', '#f1faee', 'navy'][i % 3]), 0, 0.06, 0), part(new THREE.CylinderGeometry(0.18, 0.18, 0.01, 10), C(['tan', '#f1faee', 'navy'][i % 3]), 0, 0.01, 0)]),
  purse: (i) => mergeParts([part(new THREE.BoxGeometry(0.26, 0.18, 0.1), C(COLOR_FAMILIES[(i * 3) % COLOR_FAMILIES.length]), 0, 0.09, 0), part(new THREE.TorusGeometry(0.08, 0.008, 3, 8, Math.PI), C('#5c3317'), 0, 0.18, 0)]),
  produce: (i) => { const fruit = ['orange', 'apple', 'lime', 'banana', '#6a994e', '#9d0208', '#ffb703'][i % 7]; const r = rng(i * 7 + 1); const ps = []; for (let k = 0; k < 16; k++) ps.push(part(new THREE.SphereGeometry(i % 7 === 3 ? 0.04 : 0.05, 5, 4), C(fruit), (r() - 0.5) * 0.5, 0.05 + r() * 0.07, (r() - 0.5) * 0.36)); return mergeParts(ps); },
  bananas: () => { const ps = []; for (let k = 0; k < 5; k++) ps.push(part(new THREE.CylinderGeometry(0.018, 0.022, 0.18, 5), C('banana'), (k - 2) * 0.035, 0.03, 0, Math.PI / 2, 0, (k - 2) * 0.08)); return mergeParts(ps); },
  snack: (i) => part(bagGeo(0.15, 0.2, 0.06, i + 51), A().label('snack', i, { art: 'circle', sub: ['TRAIL MIX', 'PEANUTS', 'GRANOLA'][i % 3] }), 0, 0.1, 0),
  tea: (i) => part(new THREE.BoxGeometry(0.15, 0.08, 0.07), A().label('tea', i, { art: 'wave', sub: '20 BAGS' }), 0, 0.04, 0),
  beer: (i) => part(new THREE.BoxGeometry(0.4, 0.13, 0.27), A().label('liquor', i + 2, { art: 'stripe', sub: '12 PACK' }), 0, 0.065, 0),
  barbottle: (i) => lbottle(0.04, 0.3 + (i % 4) * 0.03, 0.35, A().label('liquor', i, { art: ['stripe', 'circle', 'wave'][i % 3], dark: i % 2 === 0 }), ['glassA', 'glassG', 'glass'][i % 3]),
  glassware: () => { const ps = []; for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) ps.push(part(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 7, 1, true), C('glass'), (a - 1) * 0.08, 0.055, (b - 0.5) * 0.08)); return mergeParts(ps); },
  cash: () => part(new THREE.BoxGeometry(0.16, 0.02, 0.07), C('#7cb342'), 0, 0.01, 0),
  plate: (i) => mergeParts([part(new THREE.CylinderGeometry(0.13, 0.11, 0.015, 10), C('white'), 0, 0.008, 0), part(new THREE.SphereGeometry(0.06, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), C(['#bc6c25', '#6a994e', '#e9c46a'][i % 3]), 0, 0.015, 0)]),
  mug: () => part(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 8), C('white'), 0, 0.045, 0),
  napkin: () => part(new THREE.BoxGeometry(0.1, 0.09, 0.07), C('silver'), 0, 0.045, 0),
  menu: (i) => part(new THREE.BoxGeometry(0.2, 0.004, 0.3), A().label('coffee', i + 3, { art: 'stripe', dark: true, sub: 'MENU' }), 0, 0.002, 0),
  paint: (i) => mergeParts([...lcyl(0.085, 0.19, 10, A().label('paint', i, { art: 'wave', sub: ['SEAFOAM', 'CORAL', 'SAND', 'FLAMINGO'][i % 4] })), part(new THREE.TorusGeometry(0.07, 0.004, 3, 8, Math.PI), A().cells.get('silver'), 0, 0.19, 0)]),
  bulbs: (i) => part(new THREE.BoxGeometry(0.08, 0.12, 0.08), A().label('auto', i + 6, { art: 'bolt', sub: 'LED' }), 0, 0.06, 0),
});
export function cellUV(geo, cellKey) { const cell = getAtlas().cells.get(cellKey) || getAtlas().cells.get('white'); return mapUV(clean(geo), cell); }
export function labelUV(geo, cat, i, opts) { return mapUV(clean(geo), getAtlas().label(cat, i, opts || {})); }
export function productGeo(kind, variant = 0) {
  const key = kind + ':' + variant;
  if (!TPL.has(key)) { const b = BUILDERS[kind]; if (!b) return null; TPL.set(key, b(variant)); }
  return TPL.get(key);
}
export const PRODUCT_KINDS = Object.keys(BUILDERS);

// Collects product placements and merges them into one mesh with the atlas material.
export class ProductBatch {
  constructor() { this.parts = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(1, 1, 1); this.p = new THREE.Vector3(); }
  add(kind, variant, x, y, z, ry = 0, scale = 1, rx = 0, rz = 0) {
    const g = productGeo(kind, variant); if (!g) return false;
    this.verts = (this.verts || 0) + g.attributes.position.count;
    if (this.budget && this.verts > this.budget) { this.verts -= g.attributes.position.count; return false; }
    this.e.set(rx, ry, rz); this.q.setFromEuler(this.e); this.s.setScalar(scale); this.p.set(x, y, z);
    this.parts.push([g, this.m.clone().compose(this.p, this.q, this.s), this.chunkOf ? this.chunkOf(x, z) : 0]);
    return true;
  }
  chunkVerts() { const m = new Map(); for (const [g, , k] of this.parts) m.set(k, (m.get(k) || 0) + g.attributes.position.count); return m; }
  // Incremental build: call step() each frame until it returns a mesh (spreads CPU cost).
  stepper(material, vertsPerStep = 40000, key) {
    const parts = key === undefined ? this.parts : this.parts.filter((p) => p[2] === key);
    let n = 0; for (const [g] of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3(); let o = 0, pi = 0;
    return () => {
      let budget = vertsPerStep;
      while (pi < parts.length && budget > 0) {
        const [g, m] = parts[pi++]; nm.getNormalMatrix(m);
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        for (let i = 0; i < P.count; i++, o++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
          uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i);
        }
        budget -= P.count;
      }
      if (pi < parts.length) return null;
      if (!n) return false;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; mesh.castShadow = false;
      return mesh;
    };
  }
  build(material) {
    if (!this.parts.length) return null;
    let n = 0; for (const [g] of this.parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3(); let o = 0;
    for (const [g, m] of this.parts) {
      nm.getNormalMatrix(m);
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      for (let i = 0; i < P.count; i++, o++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
        uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; mesh.castShadow = false;
    return mesh;
  }
}

// Fill one double-sided shelf unit (local coords; levels = shelf top y's) with a store-appropriate mix.
export const SHELF_MIX = {
  mart: [['chips', 6], ['cereal', 4], ['sixpack', 6], ['candy', 5], ['bread', 3], ['water', 3], ['can', 6]],
  bodega: [['chips', 6], ['can', 6], ['bread', 3], ['candy', 5], ['sixpack', 6], ['crate', 4]],
  pharmacy: [['pills', 6], ['pillbottle', 6], ['bottlecleaner', 4], ['candy', 5], ['palette', 5]],
  liquor: [['liquor', 7], ['liquor', 7], ['sixpack', 6], ['chips', 6]],
  auto: [['jug', 4], ['battery', 4], ['jug', 4]],
  sport: [['shoebox', 4], ['energy', 4], ['shoebox', 4]],
  pawn: [['guitar', 2], ['watch', 2], ['blister', 4]],
};
function itemWidth(kind) { return { chips: 0.21, cereal: 0.21, sixpack: 0.22, candy: 0.06, bread: 0.29, water: 0.29, can: 0.07, energy: 0.06, pills: 0.11, pillbottle: 0.07, bottlecleaner: 0.09, palette: 0.15, liquor: 0.09, jug: 0.17, battery: 0.28, shoebox: 0.21, guitar: 0.4, watch: 0.08, blister: 0.13, crate: 0.52 }[kind] || 0.12; }
export function stockShelf(batch, mix, x, z0, z1, levels, r, depthOffset = 0.25) {
  levels.forEach((y, li) => {
    for (const side of [-1, 1]) {
      const [kind, nv] = mix[Math.floor(r() * mix.length)];
      let z = z0 + 0.08; let variant = Math.floor(r() * nv);
      while (z < z1 - 0.1) {
        const w = itemWidth(kind) * (kind === 'shoebox' ? 1.0 : 1);
        if (z + w > z1 - 0.05) break;
        if (r() < 0.08) { z += w; continue; } // gaps where stock sold out
        const ry = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        const rows = kind === 'candy' ? 2 : 1;
        for (let k = 0; k < rows; k++) batch.add(kind, variant, x + side * (depthOffset + 0.04 - k * 0.09), y + (kind === 'candy' ? k * 0.0 : 0), z + w / 2, ry + (r() - 0.5) * 0.08);
        z += w + 0.01;
        if (r() < 0.12) variant = Math.floor(r() * nv);
      }
    }
  });
}

// Flat plane (w x h, facing +Z) showing a text cell from the atlas (aisle signs, price boards).
export function textPlaneGeo(key, text, bg, fg, w, h) {
  const cell = getAtlas().textCell(key, text, bg, fg);
  const g = mapUV(clean(new THREE.PlaneGeometry(w, h)), cell);
  return g;
}
export function atlasCellPlane(cellKey, w, h) { const cell = getAtlas().cells.get(cellKey); const g = mapUV(clean(new THREE.PlaneGeometry(w, h)), cell); return g; }
export function labelPlaneGeo(cat, i, opts, w, h) { const g = mapUV(clean(new THREE.PlaneGeometry(w, h)), getAtlas().label(cat, i, opts || {})); return g; }
