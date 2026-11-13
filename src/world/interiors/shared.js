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
export function floorGeo(W, D, style) { const tile = style === 'checker' ? 2 : 4; const g = new THREE.PlaneGeometry(W, D); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / tile, uv.getY(i) * D / tile); return g; }
let DANCE = null;
export function danceMat() { return DANCE || (DANCE = new THREE.MeshBasicMaterial({ toneMapped: false })); }

// ---- warm-up ----
// Builds one tiny mesh per material (and per variant: instanced+instanceColor, vertex colours, textures) and
// adds them to the scene for a frame so compile/compileAsync covers every program. Also pre-uploads textures.
export function warmup(game, materials) {
  const { scene, renderer } = game;
  const grp = new THREE.Group(); grp.name = 'interiors-warmup';
  const tiny = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const cam = game.camera; const at = new THREE.Vector3(); cam?.getWorldDirection?.(at);
  const place = (o) => { o.frustumCulled = false; o.position.copy(cam ? cam.position : new THREE.Vector3()).addScaledVector(at, 1.5); grp.add(o); };
  const seen = new Set();
  for (const m of materials) { if (!m || seen.has(m)) continue; seen.add(m); place(new THREE.Mesh(tiny, m)); }
  const gl = glyphAtlas(); place(textMesh('A', { size: 0.01 }));
  const im = new THREE.InstancedMesh(tiny, danceMat(), 1); im.setColorAt(0, new THREE.Color(1, 0, 0)); place(im);
  scene.add(grp);
  const texes = new Set([gl.tex]); for (const m of seen) { if (m.map) texes.add(m.map); }
  for (const t of texes) { try { renderer.initTexture?.(t); } catch (e) { /* */ } }
  try { renderer.compile?.(scene, cam); } catch (e) { /* main also compiles */ }
  return () => { scene.remove(grp); };
}
export { glyphAtlas };
