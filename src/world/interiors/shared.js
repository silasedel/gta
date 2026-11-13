// Shared, load-time GPU resources for store interiors (INTERIORS agent).
// Goal: streaming an interior in never compiles a shader or uploads a texture. Everything here is created
// once at load: a neon glyph atlas (all store names, menus and signs are glyph-quad geometry on ONE material),
// cached materials keyed by colour (same program for every colour), shared floor materials, and a warm-up pass
// that puts one tiny mesh per material/variant in the scene so main's renderer.compile/compileAsync sees them.
import * as THREE from 'three';

const FONT = '"Barlow Condensed","Arial Narrow",Arial,sans-serif';
const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&'-.,!?/+:()$#%\"’@*ÁÉÍÓÚÑÜáéíóúñüÈÀèàçÇ";
const CW = 64, CHH = 96, COLS = 16; // glyph cell (px)

let GLYPH = null;
function glyphAtlas() {
  if (GLYPH) return GLYPH;
  const rows = Math.ceil(CHARS.length / COLS);
  const c = document.createElement('canvas'); c.width = COLS * CW; c.height = 1024;
  const g = c.getContext('2d');
  g.font = `bold 66px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
  const map = new Map();
  for (let i = 0; i < CHARS.length; i++) {
    const ch = CHARS[i]; const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CHH;
    const adv = Math.max(0.28, g.measureText(ch).width / CW); // advance in cell widths
    g.save(); g.beginPath(); g.rect(cx, cy, CW, CHH); g.clip();
    g.shadowColor = '#ffffff'; g.shadowBlur = 14; g.fillStyle = '#ffffff'; g.globalAlpha = 0.9; g.fillText(ch, cx + CW / 2, cy + CHH / 2 + 3);
    g.shadowBlur = 0; g.globalAlpha = 1; g.fillText(ch, cx + CW / 2, cy + CHH / 2 + 3);
    g.restore();
    map.set(ch, { u0: cx / c.width, v0: 1 - (cy + CHH) / c.height, u1: (cx + CW) / c.width, v1: 1 - cy / c.height, adv });
  }
  void rows;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, vertexColors: true, toneMapped: false, side: THREE.FrontSide });
  GLYPH = { tex, mat, map };
  return GLYPH;
}

// Text as glyph quads in the XY plane (facing +Z), centred. Returns geometry with a colour attribute.
// opts: { size (cap height-ish, m), color (THREE.Color, may be >1 for bloom), maxWidth (m), align: 'center'|'left' }
export function textGeo(text, { size = 0.3, color = new THREE.Color(1, 1, 1), maxWidth = Infinity, align = 'center' } = {}) {
  const { map } = glyphAtlas();
  const chars = [...String(text)].map((ch) => map.get(ch) || map.get(ch.toUpperCase()) || map.get('?'));
  let wsum = 0; for (const g of chars) wsum += g.adv;
  const cellW = size * (CW / CHH) * 1.5, cellH = size * 1.5; // glyph cell incl. glow
  let scale = 1; if (wsum * cellW * 0.82 > maxWidth) scale = maxWidth / (wsum * cellW * 0.82);
  const cw = cellW * scale, chh = cellH * scale;
  const total = wsum * cw * 0.82;
  const pos = [], uv = [], col = [], idx = [];
  let x = align === 'center' ? -total / 2 : 0;
  chars.forEach((g, i) => {
    const adv = g.adv * cw * 0.82; const cx = x + adv / 2; const hx = cw / 2, hy = chh / 2;
    const b = i * 4;
    pos.push(cx - hx, -hy, 0, cx + hx, -hy, 0, cx + hx, hy, 0, cx - hx, hy, 0);
    uv.push(g.u0, g.v0, g.u1, g.v0, g.u1, g.v1, g.u0, g.v1);
    for (let k = 0; k < 4; k++) col.push(color.r, color.g, color.b);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    // tiny z offset per glyph avoids glow quads z-fighting each other
    for (let k = 0; k < 4; k++) pos[(b + k) * 3 + 2] = i * 0.0004;
    x += adv;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.userData.width = total; geo.userData.base = new Float32Array(col);
  return geo;
}
export function textMesh(text, opts) { const m = new THREE.Mesh(textGeo(text, opts), glyphAtlas().mat); m.renderOrder = 2; return m; }
// scale a text mesh's colours (neon brightness) without touching the material
export function setTextBrightness(mesh, k) {
  const a = mesh.geometry.attributes.color, base = mesh.geometry.userData.base; if (!a || !base) return;
  for (let i = 0; i < base.length; i++) a.array[i] = base[i] * k; a.needsUpdate = true;
}

// ---- material caches (one program per kind; colour is just a uniform) ----
const STD = new Map(), BASIC = new Map();
export function stdMat(hex, rough = 0.6) { const k = hex + ':' + rough; if (!STD.has(k)) STD.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough })); return STD.get(k); }
export function glowMat(color) { const c = color instanceof THREE.Color ? color : new THREE.Color(color); const k = c.r.toFixed(3) + ',' + c.g.toFixed(3) + ',' + c.b.toFixed(3); if (!BASIC.has(k)) BASIC.set(k, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); return BASIC.get(k); }
let PANELS = null;
export function panelMats() {
  if (PANELS) return PANELS;
  const P = (e, i) => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: e, emissiveIntensity: i });
  PANELS = { std: P(0xfff4e0, 2.0), bar: P(0xffc38a, 1.0), club: P(0xff2bd6, 0.7), off: P(0xfff4e0, 0.04) };
  return PANELS;
}
let FLOORS = null;
export function floorMats(floorTex) {
  if (FLOORS) return FLOORS;
  FLOORS = {};
  for (const st of ['tile', 'tile2', 'checker', 'wood', 'concrete', 'marble', 'dark']) {
    const t = floorTex(st); t.repeat.set(1, 1); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    FLOORS[st] = new THREE.MeshStandardMaterial({ map: t, roughness: st === 'marble' ? 0.15 : st === 'concrete' || st === 'dark' ? 0.6 : 0.35, metalness: 0.05 });
  }
  return FLOORS;
}
// floor slab with world-scaled UVs (texture repeat is baked into the geometry, so one material serves all sizes)
export function floorGeo(W, D, style) { const tile = floorTile(style); const g = new THREE.PlaneGeometry(W, D); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / tile, uv.getY(i) * D / tile); return g; }
let DANCE = null;
export function danceMat() { return DANCE || (DANCE = new THREE.MeshBasicMaterial({ toneMapped: false })); }

// ---- warm-up ----
// Builds one tiny mesh per material (and per variant: instanced+instanceColor, vertex colours, textures) and
// adds them to the scene for a frame so compile/compileAsync covers every program. Also pre-uploads textures.
export function warmup(game, materials, instMats = []) {
  const { scene, renderer } = game;
  const grp = new THREE.Group(); grp.name = 'interiors-warmup';
  const tiny = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const cam = game.camera; const at = new THREE.Vector3(); cam?.getWorldDirection?.(at);
  const place = (o) => { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; o.position.copy(cam ? cam.position : new THREE.Vector3()).addScaledVector(at, 1.5); grp.add(o); };
  const seen = new Set();
  for (const m of materials) { if (!m || seen.has(m)) continue; seen.add(m); place(new THREE.Mesh(tiny, m)); }
  const gl = glyphAtlas(); place(textMesh('A', { size: 0.01 }));
  const im = new THREE.InstancedMesh(tiny, danceMat(), 1); im.setColorAt(0, new THREE.Color(1, 0, 0)); place(im);
  for (const m of instMats) { const ii = new THREE.InstancedMesh(tiny, m, 1); ii.setMatrixAt(0, new THREE.Matrix4()); place(ii); }
  scene.add(grp);
  const texes = new Set([gl.tex]); for (const m of seen) { if (m.map) texes.add(m.map); }
  for (const t of texes) { try { renderer.initTexture?.(t); } catch (e) { /* */ } }
  try { renderer.compile?.(scene, cam); } catch (e) { /* main also compiles */ }
  return () => { scene.remove(grp); };
}
export { glyphAtlas };

// ---- surface library: wall finishes + extra floors (canvas, drawn once at load; materials cached by style+tint) ----
function cv(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
function noise(g, w, h, n, a, seed = 1) { let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280); for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * a})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); } }
// metres covered by one texture repeat
const WALL_TILE = { brick: 1.2, whitebrick: 1.2, plaster: 2, wallpaperPalm: 1.2, damask: 1, subway: 0.9, cubanTile: 0.8, woodPanel: 1.6, concrete: 2.5, bamboo: 1.2, shoji: 1.8, stripe: 1.2, velvetWall: 1.5, chalk: 2, dark: 2 };
const WALL_DRAW = {
  brick: (g, w, h, light) => { g.fillStyle = light ? '#d9d4cc' : '#7a3b2a'; g.fillRect(0, 0, w, h); const bh = h / 8; for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) { const x = c * w / 4 + (r % 2) * w / 8; g.fillStyle = light ? `hsl(30,8%,${84 + ((r * 7 + c * 3) % 5) * 2}%)` : `hsl(${8 + ((r + c) % 3) * 4},45%,${30 + ((r * 5 + c * 7) % 6) * 2}%)`; g.fillRect(x + 2, r * bh + 2, w / 4 - 4, bh - 4); } noise(g, w, h, 900, 0.12, 3); },
  plaster: (g, w, h) => { g.fillStyle = '#f2ece2'; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 0.05, 5); },
  wallpaperPalm: (g, w, h) => { g.fillStyle = '#f3efe2'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { const x = (i % 3) * w / 3 + (i > 2 ? w / 6 : 0), y = (i > 2 ? h / 2 : 0) + h / 4; g.strokeStyle = '#2d6a4f'; g.lineWidth = 3; for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.33; g.beginPath(); g.moveTo(x, y + 30); g.quadraticCurveTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30, x + Math.cos(a) * 55, y + Math.sin(a) * 45 + 10); g.stroke(); } } },
  damask: (g, w, h) => { g.fillStyle = '#3b1f2b'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(201,162,39,0.45)'; for (let i = 0; i < 4; i++) { const x = (i % 2) * w / 2 + w / 4, y = Math.floor(i / 2) * h / 2 + h / 4; g.beginPath(); g.ellipse(x, y, 28, 46, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x, y - 52, 10, 14, 0, 0, Math.PI * 2); g.fill(); } },
  subway: (g, w, h) => { g.fillStyle = '#b9b5ad'; g.fillRect(0, 0, w, h); const bh = h / 10; for (let r = 0; r < 10; r++) for (let c = -1; c < 5; c++) { g.fillStyle = '#f7f6f2'; g.fillRect(c * w / 4 + (r % 2) * w / 8 + 1.5, r * bh + 1.5, w / 4 - 3, bh - 3); } },
  cubanTile: (g, w, h) => { const n = 4, s = w / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const cx = x * s + s / 2, cy = y * s + s / 2; g.fillStyle = '#f1e9d8'; g.fillRect(x * s, y * s, s, s); g.fillStyle = '#2a9d8f'; g.beginPath(); g.moveTo(cx, y * s + 4); g.lineTo(x * s + s - 4, cy); g.lineTo(cx, y * s + s - 4); g.lineTo(x * s + 4, cy); g.fill(); g.fillStyle = '#e9c46a'; g.beginPath(); g.arc(cx, cy, s * 0.16, 0, 7); g.fill(); g.fillStyle = '#c0392b'; for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { g.beginPath(); g.arc(x * s + u * s, y * s + v * s, s * 0.14, 0, 7); g.fill(); } } },
  woodPanel: (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(25,${38 + (i % 3) * 6}%,${22 + (i * 7) % 9}%)`; g.fillRect(i * w / 8, 0, w / 8, h); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(i * w / 8, 0, 2, h); } noise(g, w, h, 1200, 0.08, 7); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.62, w, 6); },
  concrete: (g, w, h) => { g.fillStyle = '#9a9893'; g.fillRect(0, 0, w, h); noise(g, w, h, 4000, 0.07, 9); g.fillStyle = 'rgba(0,0,0,0.12)'; for (const [x, y] of [[w * 0.25, h * 0.3], [w * 0.75, h * 0.3], [w * 0.25, h * 0.8], [w * 0.75, h * 0.8]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } },
  bamboo: (g, w, h) => { for (let i = 0; i < 10; i++) { g.fillStyle = `hsl(42,${45 + (i % 3) * 5}%,${55 + (i * 3) % 8}%)`; g.fillRect(i * w / 10, 0, w / 10 - 2, h); g.fillStyle = 'rgba(80,50,10,0.5)'; for (let y = (i * 37) % 60; y < h; y += 64) g.fillRect(i * w / 10, y, w / 10 - 2, 4); } },
  shoji: (g, w, h) => { g.fillStyle = '#f5f0e1'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a2a1a'; for (let x = 0; x <= w; x += w / 4) g.fillRect(x - 3, 0, 6, h); for (let y = 0; y <= h; y += h / 5) g.fillRect(0, y - 3, w, 6); },
  stripe: (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e8e2d6'; g.fillRect(i * w / 8, 0, w / 8, h); } },
  velvetWall: (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? '#2b1020' : '#3d1830'); g.fillStyle = gr; g.fillRect(0, 0, w, h); noise(g, w, h, 1200, 0.05, 11); },
  chalk: (g, w, h) => { g.fillStyle = '#25332c'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, 0.06, 13); },
  dark: (g, w, h) => { g.fillStyle = '#16141c'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, 0.05, 17); },
};
const FLOOR_EXTRA = {
  darkwood: { tile: 3, draw: (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(22,${40 + (i % 3) * 6}%,${16 + (i * 5) % 7}%)`; g.fillRect(0, i * h / 8, w, h / 8); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, i * h / 8, w, 2); g.fillRect(((i * 97) % 200) + 20, i * h / 8, 2, h / 8); } noise(g, w, h, 1500, 0.06, 19); } },
  herringbone: { tile: 1.6, draw: (g, w, h) => { g.fillStyle = '#5a3a22'; g.fillRect(0, 0, w, h); const s = w / 8; for (let y = -2; y < 10; y++) for (let x = -2; x < 10; x++) { g.save(); g.translate(x * s, y * s + (x % 2) * s / 2); g.rotate((x % 2 ? 1 : -1) * Math.PI / 4); g.fillStyle = `hsl(28,${40 + ((x + y) % 3) * 6}%,${36 + ((x * 3 + y) % 4) * 4}%)`; g.fillRect(0, 0, s * 1.3, s * 0.42); g.restore(); } } },
  terrazzo: { tile: 2, draw: (g, w, h) => { g.fillStyle = '#ede6da'; g.fillRect(0, 0, w, h); let s = 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280); const cols = ['#e76f51', '#2a9d8f', '#264653', '#e9c46a', '#8d99ae', '#ffffff']; for (let i = 0; i < 420; i++) { g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 5, 1 + rnd() * 4, rnd() * 3, 0, 7); g.fill(); } } },
  cubanTile: { tile: 1.2, draw: (g, w, h) => WALL_DRAW.cubanTile(g, w, h) },
  hex: { tile: 1.2, draw: (g, w, h) => { g.fillStyle = '#6f6a63'; g.fillRect(0, 0, w, h); const r = w / 8; for (let y = -1; y < 9; y++) for (let x = -1; x < 6; x++) { const cx = x * r * 3 + (y % 2) * r * 1.5, cy = y * r * 0.866; g.fillStyle = (x + y) % 5 ? '#f4f2ee' : '#1d1d1f'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * (r - 1.5), cy + Math.sin(a) * (r - 1.5)); } g.fill(); } } },
};
const WALLTEX = {}, WALLMAT = new Map(), XFLOOR = {};
export function wallTex(style) { if (!WALLTEX[style]) { const d = WALL_DRAW[style] || WALL_DRAW.plaster; WALLTEX[style] = cv(256, 256, (g, w, h) => d(g, w, h, style === 'whitebrick')); } return WALLTEX[style]; }
WALL_DRAW.whitebrick = WALL_DRAW.brick;
export function wallMat(style, tint = 0xffffff) { const k = style + ':' + tint; if (!WALLMAT.has(k)) WALLMAT.set(k, new THREE.MeshStandardMaterial({ map: wallTex(style), color: tint, roughness: style === 'subway' ? 0.25 : style === 'velvetWall' ? 0.95 : 0.85 })); return WALLMAT.get(k); }
export function wallTile(style) { return WALL_TILE[style] || 1.5; }
// vertical wall plane with world-scaled UVs, facing +Z
export function wallGeo(len, h, style) { const t = wallTile(style); const g = new THREE.PlaneGeometry(len, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / t, uv.getY(i) * h / t); return g; }
export function extraFloorMat(style) { if (!FLOOR_EXTRA[style]) return null; if (!XFLOOR[style]) { const f = FLOOR_EXTRA[style]; XFLOOR[style] = new THREE.MeshStandardMaterial({ map: cv(256, 256, f.draw), roughness: style === 'herringbone' || style === 'darkwood' ? 0.45 : 0.3, metalness: 0.03 }); } return XFLOOR[style]; }
export function floorTile(style) { return FLOOR_EXTRA[style]?.tile || (style === 'checker' ? 2 : 4); }
export const WALL_STYLES = Object.keys(WALL_DRAW), FLOOR_EXTRA_STYLES = Object.keys(FLOOR_EXTRA);
