// Made-up airline liveries painted over the user's airliner textures at run time (the user's rule: never ship a real
// brand: paint it out, paint our own name over it). Airliner (Plane 7): the source operator's name / web address are
// painted out in fuselage white, its red / green tail swoosh is recolored to the operator's two colors, and the operator
// name goes above the window line on both sides (the second side is stored mirrored in the atlas). Turboprop (Plane 4):
// the logo text and tail roundel are painted out, the blue cheatline / tail take the operator color, name painted on.
// One canvas texture per operator and source image, cached.
import * as THREE from 'three';

export const OPERATORS = {
  'Transcoastal': { a: '#0c2d6b', b: '#d7263d', text: 'TRANSCOASTAL', font: 'italic 700 46px "Optima", "Gill Sans", Arial' },
  'Zest Air': { a: '#7cc61a', b: '#ff4081', text: 'zest air', font: 'italic 800 52px "Arial Black", Arial' },
  'Southline Air': { a: '#11526b', b: '#f2a541', text: 'SOUTHLINE', font: '700 46px "Gill Sans", "Trebuchet MS", Arial' },
  'Conch Coast Air': { a: '#e86a2c', b: '#1d6f8a', text: 'Conch Coast', font: 'italic 700 40px Georgia, serif' },
  'Keys Island Link': { a: '#159a8c', b: '#ffcf3a', text: 'KEYS LINK', font: '800 40px Arial' },
};
const cache = new Map();
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function paint(img, kind, op, recolorOnly = false) {
  const W = img.width, H = img.height, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  const k = W / 1024, A = hexRGB(op.a), B = hexRGB(op.b);
  const d = g.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gg = p[i + 1], b = p[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx - mn;
    if (sat < 55 || mx < 60) continue;
    const y = ((i / 4) / W) | 0;
    if (kind === 'jet' && !recolorOnly && y > H * 0.62 && (i / 4) % W > W * 0.5) continue;   // engine / misc photos: leave them alone
    const lum = mx / 255;
    let tgt = null;
    if (kind === 'jet') tgt = r > gg ? A : B;                 // red -> primary, green -> secondary
    else tgt = b > r ? A : B;                                 // turboprop: blue -> primary, warm logo colors -> secondary
    p[i] = tgt[0] * lum; p[i + 1] = tgt[1] * lum; p[i + 2] = tgt[2] * lum;
  }
  g.putImageData(d, 0, 0);
  if (recolorOnly) { const t0 = new THREE.CanvasTexture(c); t0.colorSpace = THREE.SRGBColorSpace; t0.flipY = false; t0.anisotropy = 8; return t0; }
  const white = (x, y, w, h) => { g.fillStyle = '#f2f2f0'; g.fillRect(x * k, y * k, w * k, h * k); };
  g.textBaseline = 'middle';
  const name = (x, y, mirror, scale = 1) => { g.save(); g.translate(x * k, y * k); if (mirror) g.scale(-1, 1); g.scale(k * scale, k * scale); g.fillStyle = op.a; g.font = op.font; g.textAlign = 'left'; g.fillText(op.text, 0, 0); g.restore(); };
  if (kind === 'jet') {
    white(236, 14, 200, 44); white(236, 60, 200, 26);       // first side: name + web address
    white(236, 470, 200, 30); white(236, 498, 210, 46);     // second side (mirrored)
    name(250, 40, false); name(450, 522, true);
  } else {
    white(190, 30, 170, 40); white(190, 200, 170, 40);      // name above the windows, both sides
    white(330, 300, 160, 290); white(840, 300, 160, 290);   // tail roundels
    name(196, 50, false, 0.9); name(196, 220, false, 0.9);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}
// recolor every textured material of a cloned aircraft for an operator (materials are cloned once per operator)
export function applyLivery(root, kind, opName) {
  const op = OPERATORS[opName]; if (!op) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material).map((m) => {
      const img = m.map?.image; if (!img || !img.width || img.width < 512) return m;
      if (kind === 'jet' && !/Gltfnode(01|11|111|521)Mtl/.test(m.name || '')) return m;
      if (kind === 'turboprop' && !/Livery/i.test(m.name || '')) return m;
      const key = m.uuid + '|' + opName; let mm = cache.get(key);
      if (!mm) { mm = m.clone(); mm.map = paint(img, kind, op, /521/.test(m.name || '')); cache.set(key, mm); }
      return mm;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
}
