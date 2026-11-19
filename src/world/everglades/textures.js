// Everglades r7: small procedural textures (canvas, made once at boot): Spanish moss strands, lily pads, mist puffs,
// weathered gray snag bark. Everything else uses the user's library models.
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 16; /* W4: crisp at grazing angles */ t.needsUpdate = true; return t;
}

// Spanish moss: a curtain of thin wavy gray-green strands, dense at the top (where it hangs off the branch), thinning
// and tapering toward the tips. Alpha in the texture (alphaTest), color slightly varied per strand.
export function mossTexture() {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rng(7);
  g.clearRect(0, 0, W, H);
  for (let n = 0; n < 75; n++) {
    const x0 = 8 + r() * (W - 16), len = H * (0.25 + 0.75 * Math.pow(r(), 0.7)), amp = 3 + r() * 7, f = 0.012 + r() * 0.02, ph = r() * 6.28;
    const v = 150 + r() * 60, gr = v + 6 + r() * 10, b = v - 18 - r() * 16;
    g.strokeStyle = `rgba(${v | 0},${gr | 0},${b | 0},1)`;
    let px = x0, py = 0;
    for (let y = 4; y < len; y += 4) {
      const t = y / len; g.lineWidth = Math.max(0.5, (1 - t) * (0.9 + r() * 1.1));
      const x = x0 + Math.sin(y * f + ph) * amp * (0.4 + t) + (r() - 0.5) * 1.5;
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); px = x; py = y;
      if (r() < 0.05) { const bx = x + (r() - 0.5) * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(bx, y + 10 + r() * 30); g.stroke(); }
    }
  }
  // a dense band at the top (the clump over the branch)
  for (let n = 0; n < 260; n++) { const x = W * (0.15 + r() * 0.7), y = r() * r() * 50, v = 140 + r() * 60; g.fillStyle = `rgba(${v | 0},${(v + 8) | 0},${(v - 22) | 0},1)`; g.fillRect(x, y, 1 + r() * 2.5, 2 + r() * 5); }
  return tex(c);
}

// lily pads: a 2 x 2 atlas (three round notched pads, one with a white water-lily flower)
export function lilyTexture() {
  const S = 256, c = canvas(S * 2, S * 2), g = c.getContext('2d'), r = rng(11);
  g.clearRect(0, 0, S * 2, S * 2);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * S + S / 2, oy = ((k / 2) | 0) * S + S / 2, R = S * 0.44, notch = r() * 6.28;
    const base = [[58, 92, 34], [72, 98, 36], [50, 80, 30], [66, 96, 40]][k];
    g.save(); g.translate(ox, oy); g.rotate(notch);
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, 0.16, Math.PI * 2 - 0.16); g.closePath();
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, R); gr.addColorStop(0, `rgb(${base[0] + 18},${base[1] + 20},${base[2] + 6})`); gr.addColorStop(0.8, `rgb(${base[0]},${base[1]},${base[2]})`); gr.addColorStop(1, `rgb(${base[0] + 40},${base[1] + 12},${base[2] - 6})`);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(30,45,15,0.35)'; g.lineWidth = 1.2; for (let v = 0; v < 16; v++) { const a = 0.25 + (v / 16) * (Math.PI * 2 - 0.5); g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96); g.stroke(); }
    for (let n = 0; n < 40; n++) { const a = r() * 6.28, d = R * (0.5 + r() * 0.48); g.fillStyle = `rgba(${120 + r() * 60},${90 + r() * 40},${30},${0.25 + r() * 0.3})`; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 2 + r() * 6, 0, 6.28); g.fill(); } // sun-burnt edges / spots
    g.restore();
    if (k === 3) { // white water lily
      g.save(); g.translate(ox + 10, oy - 8);
      for (let p = 0; p < 14; p++) { const a = (p / 14) * 6.28 + r() * 0.2; g.save(); g.rotate(a); g.fillStyle = p % 2 ? '#f4f1e8' : '#e9e6dc'; g.beginPath(); g.ellipse(0, -26, 9, 26, 0, 0, 6.28); g.fill(); g.restore(); }
      g.fillStyle = '#f1c838'; g.beginPath(); g.arc(0, 0, 9, 0, 6.28); g.fill(); g.restore();
    }
  }
  return tex(c);
}

// mist puff: a soft, slightly lumpy radial blob (white; tinted in the shader)
export function mistTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d'), r = rng(23);
  g.clearRect(0, 0, S, S);
  for (let n = 0; n < 26; n++) {
    const x = S / 2 + (r() - 0.5) * S * 0.45, y = S / 2 + (r() - 0.5) * S * 0.3, R = S * (0.15 + r() * 0.22);
    const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = tex(c); t.colorSpace = THREE.NoColorSpace; return t;
}

// weathered snag bark: silver-gray vertical fibres, cracks, darker water stain at the foot (v = 0 at the bottom)
export function snagTexture() {
  const W = 128, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rng(31);
  g.fillStyle = '#8d8a82'; g.fillRect(0, 0, W, H);
  for (let n = 0; n < 420; n++) { const x = r() * W, v = 105 + r() * 70; g.fillStyle = `rgba(${v | 0},${(v - 3) | 0},${(v - 10) | 0},0.55)`; g.fillRect(x, r() * H, 1 + r() * 2, 20 + r() * 160); }
  for (let n = 0; n < 60; n++) { const x = r() * W; g.fillStyle = 'rgba(40,36,32,0.55)'; g.fillRect(x, r() * H, 1, 10 + r() * 90); }
  const gr = g.createLinearGradient(0, H, 0, H * 0.72); gr.addColorStop(0, 'rgba(48,40,28,0.9)'); gr.addColorStop(1, 'rgba(48,40,28,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const t = tex(c, true, true); t.wrapT = THREE.RepeatWrapping; return t;
}

// dirt track / camp yard: packed gray-brown marl with two darker wet tire ruts along v, shell grit, puddles; alpha fades
// at the u edges so the ribbon melts into the grass (u across the track, v along it, repeats in v)
export function dirtTexture() {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rng(41);
  const im = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, k = (y * W + x) * 4, n = r();
    const rut = Math.exp(-(((u - 0.3) / 0.06) ** 2)) + Math.exp(-(((u - 0.7) / 0.06) ** 2)), crown = Math.exp(-(((u - 0.5) / 0.08) ** 2));
    let v = 118 + n * 26 - rut * 38 + crown * 6;
    im.data[k] = v; im.data[k + 1] = v * 0.9; im.data[k + 2] = v * 0.72;
    const edge = Math.min(1, Math.min(u, 1 - u) / 0.16); im.data[k + 3] = Math.round(255 * Math.min(1, edge * (0.75 + n * 0.5)));
  }
  g.putImageData(im, 0, 0);
  for (let n = 0; n < 7; n++) { const x = W * (r() < 0.5 ? 0.3 : 0.7) + (r() - 0.5) * 20, y = r() * H; g.fillStyle = 'rgba(52,44,30,0.65)'; g.beginPath(); g.ellipse(x, y, 10 + r() * 16, 20 + r() * 40, 0, 0, 6.28); g.fill(); }
  for (let n = 0; n < 1600; n++) { const v = 170 + r() * 70; g.fillStyle = `rgba(${v | 0},${(v - 8) | 0},${(v - 20) | 0},0.5)`; g.fillRect(W * (0.12 + r() * 0.76), r() * H, 1.5, 1.5); }
  const t = tex(c, true, false); t.wrapT = THREE.RepeatWrapping; return t;
}

// painted plywood sign (made-up businesses): weathered board, hand-lettered lines
export function signTexture(lines, opts = {}) {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d'), r = rng(lines.join('').length * 13 + 5);
  g.fillStyle = opts.bg || '#d9d2bf'; g.fillRect(0, 0, W, H);
  for (let n = 0; n < 50; n++) { g.fillStyle = `rgba(90,80,60,${0.05 + r() * 0.1})`; g.fillRect(0, r() * H, W, 1 + r() * 3); }
  g.strokeStyle = opts.edge || '#2f5d3a'; g.lineWidth = 14; g.strokeRect(10, 10, W - 20, H - 20);
  const sizes = opts.sizes || [64, 40, 34]; let y = 30;
  lines.forEach((t, i) => { const s = sizes[i] || 30; g.font = `bold ${s}px Impact, 'Arial Black', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = (opts.ink || ['#7a1e14', '#1f3a25', '#1f1f1f'])[i] || '#1f1f1f'; g.fillText(t, W / 2, y); y += s + 12; });
  for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(200,190,170,${r() * 0.5})`; g.fillRect(r() * W, r() * H, 1 + r() * 4, 1 + r() * 2); } // paint loss
  return tex(c);
}
