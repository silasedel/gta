// Southline city — texture helpers (procedural CanvasTextures + CC0 PBR loader)
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, renderer, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function noise(ctx, w, h, r, amt, n = 4000) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * amt})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
}

const LIT = ['#ffd9a0', '#ffe7c2', '#ffc98a', '#fff1d8', '#cfe3ff', '#ffb3d9', '#b0fff4'];

// Punched-window office / plaster facade. Tile = 8 bays x 8 floors (bay 3m, floor 3.5m) => 24m x 28m
export function officeFacade(renderer, seed = 1) {
  const r = rng(seed), S = 1024, C = 128;
  const [c, x] = canvas(S, S), [e, ex] = canvas(S, S), [m, mx] = canvas(S, S);
  x.fillStyle = '#ece6dc'; x.fillRect(0, 0, S, S); noise(x, S, S, r, 0.06, 9000);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  mx.fillStyle = 'rgb(0,220,0)'; mx.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 8; fy++) {
    const floorDensity = r() * 0.7;
    // floor slab line
    x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(0, fy * C + C - 6, S, 6);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, fy * C + C - 9, S, 3);
    for (let bx = 0; bx < 8; bx++) {
      const X = bx * C + 22, Y = fy * C + 26, W = C - 44, H = C - 50;
      const g = x.createLinearGradient(X, Y, X + W, Y + H);
      g.addColorStop(0, '#2b4152'); g.addColorStop(0.5, '#3f6377'); g.addColorStop(1, '#1d2c38');
      x.fillStyle = g; x.fillRect(X, Y, W, H);
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(X + W * 0.15, Y, W * 0.12, H);
      x.strokeStyle = '#f7f3ea'; x.lineWidth = 4; x.strokeRect(X, Y, W, H);
      x.fillStyle = '#d6cfc2'; x.fillRect(X - 6, Y + H + 2, W + 12, 7); // sill
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(X - 6, Y + H + 9, W + 12, 4);
      x.fillStyle = '#e9e4da'; x.fillRect(X + W / 2 - 2, Y, 4, H); // mullion
      mx.fillStyle = 'rgb(0,30,200)'; mx.fillRect(X, Y, W, H);
      if (r() < floorDensity) {
        ex.fillStyle = LIT[(r() * 4) | 0]; ex.globalAlpha = 0.55 + r() * 0.45;
        ex.fillRect(X + 2, Y + 2, W - 4, H - 4);
        if (r() < 0.4) { ex.fillStyle = '#000'; ex.globalAlpha = 0.5; ex.fillRect(X + 2, Y + 2, W - 4, H * (0.2 + r() * 0.5)); }
        ex.globalAlpha = 1;
      }
    }
  }
  return { map: finish(c, renderer), emissive: finish(e, renderer), rm: finish(m, renderer, false), tileW: 24, tileH: 28 };
}

// Art-deco ribbon windows w/ eyebrows. Tile = 4 bays x 4 floors (bay 4m, floor 3.4m)
export function decoFacade(renderer, seed = 2) {
  const r = rng(seed), S = 1024, C = 256;
  const [c, x] = canvas(S, S), [e, ex] = canvas(S, S), [m, mx] = canvas(S, S);
  x.fillStyle = '#fbf8f2'; x.fillRect(0, 0, S, S); noise(x, S, S, r, 0.05, 9000);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  mx.fillStyle = 'rgb(0,235,0)'; mx.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 4; fy++) {
    const Y0 = fy * C;
    // eyebrow ledge + shadow
    x.fillStyle = '#ffffff'; x.fillRect(0, Y0 + 44, S, 12);
    const sg = x.createLinearGradient(0, Y0 + 56, 0, Y0 + 92);
    sg.addColorStop(0, 'rgba(0,0,0,0.28)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sg; x.fillRect(0, Y0 + 56, S, 36);
    // horizontal speed-line grooves (deco)
    x.fillStyle = 'rgba(0,0,0,0.07)';
    for (let k = 0; k < 3; k++) x.fillRect(0, Y0 + 214 + k * 12, S, 3);
    for (let bx = 0; bx < 4; bx++) {
      const X = bx * C + 26, Y = Y0 + 74, W = C - 52, H = 118;
      const g = x.createLinearGradient(X, Y, X, Y + H);
      g.addColorStop(0, '#1f3b48'); g.addColorStop(0.6, '#2f6070'); g.addColorStop(1, '#173039');
      x.fillStyle = g; x.fillRect(X, Y, W, H);
      x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.strokeRect(X, Y, W, H);
      x.fillStyle = '#f4f1ea';
      for (let k = 1; k < 4; k++) x.fillRect(X + (W * k) / 4 - 2, Y, 4, H);
      x.fillRect(X, Y + H * 0.3, W, 3);
      mx.fillStyle = 'rgb(0,25,180)'; mx.fillRect(X, Y, W, H);
      if (r() < 0.45) {
        ex.fillStyle = LIT[(r() * LIT.length) | 0]; ex.globalAlpha = 0.6 + r() * 0.4;
        ex.fillRect(X + 3, Y + 3, W - 6, H - 6);
        ex.fillStyle = '#000'; ex.globalAlpha = 0.6;
        for (let k = 1; k < 4; k++) ex.fillRect(X + (W * k) / 4 - 2, Y, 4, H);
        ex.globalAlpha = 1;
      }
    }
  }
  return { map: finish(c, renderer), emissive: finish(e, renderer), rm: finish(m, renderer, false), tileW: 16, tileH: 13.6 };
}

// Glass curtain wall. Tile = 16 panels (2m) x 16 floors (4m) => 32m x 64m
export function glassFacade(renderer, seed = 3, opts = {}) {
  const variance = opts.variance ?? 1;
  const r = rng(seed), S = 1024, CW = 64, CH = 64;
  const [c, x] = canvas(S, S), [e, ex] = canvas(S, S), [m, mx] = canvas(S, S);
  x.fillStyle = '#7f93a4'; x.fillRect(0, 0, S, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  mx.fillStyle = 'rgb(0,12,255)'; mx.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 16; fy++) {
    const density = r() < 0.3 ? 0.85 : r() * 0.35;
    const lit = r() < 0.7 ? '#e9f3ff' : '#ffe2b0';
    for (let bx = 0; bx < 16; bx++) {
      const X = bx * CW, Y = fy * CH;
      const v = 125 + (r() - 0.5) * 45 * variance + 22;
      x.fillStyle = `rgb(${v * 0.85},${v},${v * 1.12})`; x.fillRect(X, Y, CW, CH);
      if (r() < density) { ex.fillStyle = lit; ex.globalAlpha = 0.5 + r() * 0.5; ex.fillRect(X + 2, Y + 12, CW - 4, CH - 14); ex.globalAlpha = 1; }
    }
    // spandrel
    x.fillStyle = '#2c333a'; x.fillRect(0, fy * CH, S, 10);
    mx.fillStyle = 'rgb(0,90,140)'; mx.fillRect(0, fy * CH, S, 10);
  }
  x.fillStyle = '#3a4148';
  for (let bx = 0; bx <= 16; bx++) x.fillRect(bx * CW - 2, 0, 4, S);
  mx.fillStyle = 'rgb(0,90,160)';
  for (let bx = 0; bx <= 16; bx++) mx.fillRect(bx * CW - 2, 0, 4, S);
  return { map: finish(c, renderer), emissive: finish(e, renderer), rm: finish(m, renderer, false), tileW: 32, tileH: 64 };
}

// Palm trunk (ring ridges)
export function trunkTexture(renderer) {
  const [c, x] = canvas(64, 256); const r = rng(9);
  x.fillStyle = '#8a7258'; x.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) {
    const g = x.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#5e4a38'); g.addColorStop(0.25, '#a68c6d'); g.addColorStop(0.8, '#8a7258'); g.addColorStop(1, '#4e3d2e');
    x.fillStyle = g; x.fillRect(0, y, 64, 16);
  }
  noise(x, 64, 256, r, 0.12, 1500);
  return finish(c, renderer);
}

// Palm frond (alpha)
export function frondTexture(renderer) {
  const W = 256, H = 512; const [c, x] = canvas(W, H); const r = rng(11);
  x.clearRect(0, 0, W, H);
  const n = 46;
  for (let i = 0; i < n; i++) {
    const t = i / n, y = 8 + t * (H - 16);
    const len = (W / 2 - 6) * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (0.85 + r() * 0.15);
    for (const s of [-1, 1]) {
      const g = 40 + r() * 50;
      x.strokeStyle = `rgb(${30 + r() * 30},${g + 70},${25 + r() * 20})`;
      x.lineWidth = 5 + (1 - t) * 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(W / 2, y);
      x.quadraticCurveTo(W / 2 + s * len * 0.5, y + 6, W / 2 + s * len, y + 26 + t * 10); x.stroke();
    }
  }
  x.strokeStyle = '#7d8a3c'; x.lineWidth = 6; x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
  return finish(c, renderer);
}

// Billboard atlas: 4x2 ads, each 512x256
export const ADS = [
  { bg: ['#ff5f6d', '#ffc371'], t: 'SOLARA COLA', s: 'Taste the Sunset', fg: '#fff' },
  { bg: ['#1fa2ff', '#12d8fa'], t: 'SOUTHLINE AIR', s: 'Fly the Coast · from $49', fg: '#fff' },
  { bg: ['#f7971e', '#ffd200'], t: 'MANGO BAY', s: 'Island Spiced Rum', fg: '#3b1d00' },
  { bg: ['#8e2de2', '#4a00e0'], t: 'WAVE 101.3', s: "Southline's Hit Music", fg: '#fff' },
  { bg: ['#0f0c29', '#302b63'], t: 'CLUB VESPER', s: 'Neon Nights · Thu–Sun', fg: '#ff4fd8' },
  { bg: ['#11998e', '#38ef7d'], t: 'TROPICOOL', s: 'Sunscreen SPF 50', fg: '#fff' },
  { bg: ['#232526', '#414345'], t: 'VIPERA MOTORS', s: 'Feel the Bite', fg: '#ffcc00' },
  { bg: ['#ee9ca7', '#ffdde1'], t: 'PELICAN BURGER', s: 'Open 24/7 on Southline Dr', fg: '#7a1030' },
];
export function adsTexture(renderer) {
  const [c, x] = canvas(2048, 512);
  ADS.forEach((a, i) => {
    const X = (i % 4) * 512, Y = Math.floor(i / 4) * 256;
    const g = x.createLinearGradient(X, Y, X + 512, Y + 256);
    g.addColorStop(0, a.bg[0]); g.addColorStop(1, a.bg[1]);
    x.fillStyle = g; x.fillRect(X, Y, 512, 256);
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.beginPath(); x.arc(X + 430, Y + 60, 110, 0, Math.PI * 2); x.fill();
    x.fillStyle = a.fg; x.textAlign = 'center';
    x.font = 'bold 74px "Arial Black", Impact, sans-serif'; x.fillText(a.t, X + 256, Y + 130, 480);
    x.font = 'italic 34px Georgia, serif'; x.fillText(a.s, X + 256, Y + 190, 480);
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 8; x.strokeRect(X + 4, Y + 4, 504, 248);
  });
  const t = finish(c, renderer); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

export function radialTexture(renderer, inner = 'rgba(255,220,160,1)') {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.5, 'rgba(255,190,120,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function helipadTexture(renderer) {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#3a3d42'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#ffd400'; x.lineWidth = 10; x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#ffffff'; x.font = 'bold 150px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 128, 136);
  return finish(c, renderer);
}

// Load a CC0 PBR set from /assets/city/<slug>_{diff,nor_gl,rough}.jpg. Never throws.
export async function loadPBR(renderer, slug, repeat = 1) {
  const L = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const one = async (suffix, srgb) => {
    try {
      const t = await L.loadAsync(`/assets/city/${slug}_${suffix}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.repeat.set(repeat, repeat);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    } catch (e) { console.warn('[city] texture missing', slug, suffix); return null; }
  };
  const [map, normalMap, roughnessMap] = await Promise.all([one('diff', true), one('nor_gl', false), one('rough', false)]);
  return { map, normalMap, roughnessMap };
}

// Storefront ground floors: 8 variants, each 8m wide x ground-floor height
const SHOPS = [
  { n: 'CAFÉ LUNA', bg: '#2b1b14', fg: '#ffd27a', aw: ['#e85d3f', '#fff3e0'] },
  { n: 'SURF SHACK', bg: '#0c4a6e', fg: '#7ff6ff', aw: ['#16a3b8', '#ffffff'] },
  { n: 'BODEGA SOL', bg: '#3a1030', fg: '#ff7ad9', aw: ['#ffcc33', '#ff5f6d'] },
  { n: 'FARMACIA +', bg: '#0f3d26', fg: '#6dff9e', aw: ['#1f8f55', '#ffffff'] },
  { n: 'GELATO MIO', bg: '#fff0f5', fg: '#e0457b', aw: ['#ff9ec4', '#ffffff'] },
  { n: 'TACO REY', bg: '#401a00', fg: '#ffb703', aw: ['#e63946', '#ffb703'] },
  { n: 'BOUTIQUE AZUL', bg: '#101d3a', fg: '#9ecbff', aw: ['#264b96', '#e8eefc'] },
  { n: 'PALM LAUNDRY', bg: '#1c1c1c', fg: '#b6ff4f', aw: ['#2ec4b6', '#f1f1f1'] },
];
export function shopFacade(renderer, seed = 21) {
  const r = rng(seed), W = 256, S = 512;
  const [c, x] = canvas(W * 8, S), [e, ex] = canvas(W * 8, S), [m, mx] = canvas(W * 8, S);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W * 8, S);
  mx.fillStyle = 'rgb(0,200,0)'; mx.fillRect(0, 0, W * 8, S);
  SHOPS.forEach((s, i) => {
    const X = i * W;
    x.fillStyle = '#e9e3d8'; x.fillRect(X, 0, W, S);
    // sign band
    x.fillStyle = s.bg; x.fillRect(X + 8, 14, W - 16, 74);
    x.font = 'bold 34px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = s.fg; x.fillText(s.n, X + W / 2, 52, W - 30);
    ex.font = x.font; ex.textAlign = 'center'; ex.textBaseline = 'middle'; ex.fillStyle = s.fg; ex.fillText(s.n, X + W / 2, 52, W - 30);
    // awning stripes (painted valance)
    for (let k = 0; k < 8; k++) { x.fillStyle = s.aw[k % 2]; x.fillRect(X + 8 + k * 30, 96, 30, 40); }
    for (let k = 0; k < 8; k++) { x.fillStyle = s.aw[k % 2]; x.beginPath(); x.arc(X + 23 + k * 30, 136, 15, 0, Math.PI); x.fill(); }
    // glass storefront
    const gy = 160, gh = 330;
    const g = x.createLinearGradient(0, gy, 0, gy + gh);
    g.addColorStop(0, '#2a3a44'); g.addColorStop(1, '#4b5d66');
    x.fillStyle = g; x.fillRect(X + 10, gy, W - 20, gh);
    // interior hints
    // window displays: mannequins (fashion/surf), shelves of products (shops/cafes)
    if (i === 1 || i === 4 || i === 6) {
      for (const mx2 of [X + 50, X + 128, X + 206]) {
        const cc = `hsl(${(r() * 360) | 0},70%,${45 + r() * 20}%)`;
        x.fillStyle = '#e8d8c8'; x.beginPath(); x.arc(mx2, gy + 105, 13, 0, Math.PI * 2); x.fill();
        x.fillStyle = cc; x.beginPath(); x.moveTo(mx2 - 22, gy + 125); x.lineTo(mx2 + 22, gy + 125); x.lineTo(mx2 + 30, gy + 235); x.lineTo(mx2 - 30, gy + 235); x.fill();
        x.fillStyle = '#333'; x.fillRect(mx2 - 14, gy + 235, 10, 70); x.fillRect(mx2 + 4, gy + 235, 10, 70); x.fillRect(mx2 - 3, gy + 305, 6, 20);
      }
      if (i === 1) for (let k = 0; k < 4; k++) { x.fillStyle = `hsl(${(r() * 360) | 0},80%,55%)`; x.beginPath(); x.ellipse(X + 30 + k * 60, gy + 200, 12, 95, 0.05, 0, Math.PI * 2); x.fill(); }
    } else {
      for (let sh = 0; sh < 3; sh++) {
        const syy = gy + 120 + sh * 70;
        x.fillStyle = '#6b5a4a'; x.fillRect(X + 16, syy + 40, W - 32, 5);
        for (let px2 = X + 20; px2 < X + W - 30; px2 += 12 + r() * 10) { x.fillStyle = `hsl(${(r() * 360) | 0},${60 + r() * 30}%,${40 + r() * 25}%)`; const ph2 = 18 + r() * 20; x.fillRect(px2, syy + 40 - ph2, 8 + r() * 6, ph2); }
      }
    }
    // small neon OPEN sign
    x.fillStyle = '#111'; x.fillRect(X + 170, gy + 20, 60, 24); ex.font = 'bold 18px Arial'; ex.textAlign = 'center'; ex.fillStyle = '#ff3b6b'; ex.fillText('OPEN', X + 200, gy + 38);
    x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillStyle = '#ff3b6b'; x.fillText('OPEN', X + 200, gy + 38);
    const ig = ex.createLinearGradient(0, gy, 0, gy + gh);
    ig.addColorStop(0, '#ffd9a8'); ig.addColorStop(1, '#a86a3a');
    ex.globalAlpha = 0.75; ex.fillStyle = ig; ex.fillRect(X + 10, gy, W - 20, gh); ex.globalAlpha = 1;
    // frames + door
    x.fillStyle = '#2a2a2a';
    x.fillRect(X + 10, gy, W - 20, 6); x.fillRect(X + 10, gy, 6, gh); x.fillRect(X + W - 16, gy, 6, gh);
    x.fillRect(X + 96, gy, 6, gh); x.fillRect(X + 154, gy, 6, gh); x.fillRect(X + 96, gy + 40, 64, 4);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(X + 30, gy + 10, 18, gh - 20);
    ex.fillStyle = '#000'; ex.fillRect(X + 96, gy, 6, gh); ex.fillRect(X + 154, gy, 6, gh);
    mx.fillStyle = 'rgb(0,20,200)'; mx.fillRect(X + 10, gy, W - 20, gh);
    x.fillStyle = '#5a5550'; x.fillRect(X, S - 22, W, 22);
  });
  return { map: finish(c, renderer), emissive: finish(e, renderer), rm: finish(m, renderer, false), tileW: 64, tileH: 1 };
}

// Vertical neon blade-sign names (8 columns, transparent bg)
export const FIN_NAMES = ['CORALINE', 'PELICAN', 'AZURE', 'BREEZE', 'SOUTHLINE', 'MARLOW', 'TIDES', 'LUMEN'];
export function finSignTexture(renderer) {
  const [c, x] = canvas(1024, 1024);
  const cols = ['#ff4fd8', '#3df2ff', '#ffd23f', '#ff7a1a', '#b07cff', '#5dff9a', '#ff3366', '#7fd4ff'];
  FIN_NAMES.forEach((n, i) => {
    const X = i * 128 + 64, step = Math.min(120, 1000 / n.length);
    x.font = `bold ${Math.floor(step * 0.95)}px "Arial Black", Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = cols[i]; x.shadowBlur = 14; x.fillStyle = '#fff';
    for (let k = 0; k < n.length; k++) x.fillText(n[k], X, 12 + step * (k + 0.5));
    x.shadowBlur = 0; x.fillStyle = cols[i];
    for (let k = 0; k < n.length; k++) x.fillText(n[k], X, 12 + step * (k + 0.5));
  });
  const t = finish(c, renderer); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// Modern ribbon-window office: tile 16 mullion bays (1.5m) x 8 floors (3.8m) => 24m x 30.4m
export function bandFacade(renderer, seed = 31) {
  const r = rng(seed), S = 1024, CW = 64, CH = 128;
  const [c, x] = canvas(S, S), [e, ex] = canvas(S, S), [m, mx] = canvas(S, S);
  x.fillStyle = '#f1efe9'; x.fillRect(0, 0, S, S); noise(x, S, S, r, 0.05, 6000);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  mx.fillStyle = 'rgb(0,200,0)'; mx.fillRect(0, 0, S, S);
  for (let fy = 0; fy < 8; fy++) {
    const Y = fy * CH + 34, H = CH - 52;
    const g = x.createLinearGradient(0, Y, 0, Y + H);
    g.addColorStop(0, '#24414d'); g.addColorStop(0.5, '#3f6e7c'); g.addColorStop(1, '#1d323b');
    x.fillStyle = g; x.fillRect(0, Y, S, H);
    mx.fillStyle = 'rgb(0,15,220)'; mx.fillRect(0, Y, S, H);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, Y + H, S, 5);
    const dens = r() * 0.8;
    for (let bx = 0; bx < 16; bx++) {
      if (r() < dens) { ex.fillStyle = LIT[(r() * 5) | 0]; ex.globalAlpha = 0.5 + r() * 0.5; ex.fillRect(bx * CW + 3, Y + 3, CW - 6, H - 6); ex.globalAlpha = 1; }
      x.fillStyle = '#c9cdd0'; x.fillRect(bx * CW - 2, Y, 4, H);
    }
  }
  return { map: finish(c, renderer), emissive: finish(e, renderer), rm: finish(m, renderer, false), tileW: 24, tileH: 30.4 };
}
