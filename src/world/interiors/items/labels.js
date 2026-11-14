// Label and packaging art (2D canvas), drawn once per product into the global atlas.
// Brands come from the design system when it is loaded (brand.drawLogo); otherwise a provisional wordmark is drawn from the brand's palette.
import { text, rrect, barcode, starburst, font } from '../kit/atlas.js';
import { css, shade, mixc, inkOn, rng, lum } from '../kit/util.js';

// small pictograms used on packs and posters: ICONS.name(g, cx, cy, r, color, color2)
export const ICONS = {
  bolt(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); [[0.15, -1], [-0.55, 0.12], [-0.05, 0.12], [-0.2, 1], [0.55, -0.2], [0.05, -0.2]].forEach(([a, b], i) => (i ? g.lineTo(x + a * r, y + b * r) : g.moveTo(x + a * r, y + b * r))); g.fill(); },
  drop(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.moveTo(x, y - r); g.bezierCurveTo(x + r * 1.1, y + r * 0.1, x + r * 0.7, y + r, x, y + r); g.bezierCurveTo(x - r * 0.7, y + r, x - r * 1.1, y + r * 0.1, x, y - r); g.fill(); },
  citrus(g, x, y, r, c, c2) { g.fillStyle = css(c); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = css(c2 || shade(c, 0.5)); g.beginPath(); g.arc(x, y, r * 0.84, 0, 7); g.fill(); g.strokeStyle = css(c); g.lineWidth = r * 0.07; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(i * Math.PI / 4) * r * 0.84, y + Math.sin(i * Math.PI / 4) * r * 0.84); g.stroke(); } },
  cherry(g, x, y, r, c) { g.strokeStyle = '#3a6b2a'; g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(x - r * 0.4, y + r * 0.3); g.quadraticCurveTo(x, y - r, x + r * 0.5, y - r * 0.9); g.moveTo(x + r * 0.45, y + r * 0.4); g.quadraticCurveTo(x + r * 0.3, y - r * 0.5, x + r * 0.5, y - r * 0.9); g.stroke(); g.fillStyle = css(c); for (const [a, b] of [[-0.4, 0.45], [0.45, 0.55]]) { g.beginPath(); g.arc(x + a * r, y + b * r, r * 0.42, 0, 7); g.fill(); } g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(x - r * 0.52, y + r * 0.32, r * 0.1, 0, 7); g.fill(); },
  pineapple(g, x, y, r, c) { g.fillStyle = '#3f8a3a'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x, y - r * 0.2); g.quadraticCurveTo(x + i * r * 0.3, y - r * 0.9, x + i * r * 0.42, y - r * 1.05); g.quadraticCurveTo(x + i * r * 0.1, y - r * 0.6, x, y - r * 0.2); g.fill(); } g.fillStyle = css(c); g.beginPath(); g.ellipse(x, y + r * 0.3, r * 0.55, r * 0.7, 0, 0, 7); g.fill(); g.strokeStyle = css(shade(c, -0.35)); g.lineWidth = r * 0.04; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x - r * 0.55, y + r * 0.3 + i * r * 0.22); g.lineTo(x + r * 0.55, y + r * 0.3 + i * r * 0.22 + r * 0.4); g.moveTo(x + r * 0.55, y + r * 0.3 + i * r * 0.22); g.lineTo(x - r * 0.55, y + r * 0.3 + i * r * 0.22 + r * 0.4); g.stroke(); } },
  mango(g, x, y, r, c) { const gr = g.createLinearGradient(x - r, y - r, x + r, y + r); gr.addColorStop(0, css(c)); gr.addColorStop(1, '#d8432e'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 0.9, r * 0.68, -0.5, 0, 7); g.fill(); g.fillStyle = '#3f8a3a'; g.beginPath(); g.ellipse(x + r * 0.5, y - r * 0.7, r * 0.34, r * 0.13, -0.6, 0, 7); g.fill(); },
  chip(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.ellipse(x, y, r, r * 0.72, 0.3, 0, 7); g.fill(); g.strokeStyle = css(shade(c, -0.25)); g.lineWidth = r * 0.06; for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(x + i * r * 0.2, y, r * 0.12, r * 0.6, 0.3, -1.2, 1.2); g.stroke(); } },
  flame(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.1, y + r * 0.6, x - r * 0.6, y - r * 0.3, x - r * 0.1, y - r); g.bezierCurveTo(x, y - r * 0.4, x + r * 0.5, y - r * 0.5, x + r * 0.3, y - r * 0.95); g.bezierCurveTo(x + r * 1.2, y - r * 0.1, x + r * 0.9, y + r * 0.8, x, y + r); g.fill(); g.fillStyle = 'rgba(255,230,120,0.85)'; g.beginPath(); g.ellipse(x, y + r * 0.45, r * 0.3, r * 0.45, 0, 0, 7); g.fill(); },
  pepper(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.moveTo(x - r * 0.7, y - r * 0.5); g.bezierCurveTo(x + r * 0.2, y - r * 0.9, x + r, y, x + r * 0.7, y + r); g.bezierCurveTo(x + r * 0.3, y + r * 0.2, x - r * 0.2, y, x - r * 0.7, y - r * 0.5); g.fill(); g.fillStyle = '#3f8a3a'; g.fillRect(x - r * 0.95, y - r * 0.75, r * 0.35, r * 0.2); },
  bean(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.ellipse(x, y, r * 0.62, r, 0.5, 0, 7); g.fill(); g.strokeStyle = css(shade(c, 0.4)); g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(x - r * 0.3, y - r * 0.7); g.quadraticCurveTo(x + r * 0.3, y, x - r * 0.1, y + r * 0.8); g.stroke(); },
  wave(g, x, y, r, c) { g.strokeStyle = css(c); g.lineWidth = r * 0.22; g.lineCap = 'round'; for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 20; i++) { const px = x - r + i * r / 10, py = y + (k - 0.5) * r * 0.7 + Math.sin(i * 0.9) * r * 0.2; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke(); } },
  sun(g, x, y, r, c) { starburst(g, x, y, r * 0.62, r, 12, c); g.fillStyle = css(shade(c, 0.3)); g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fill(); },
  palm(g, x, y, r, c) { g.strokeStyle = css(c); g.lineCap = 'round'; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(x - r * 0.1, y + r); g.quadraticCurveTo(x + r * 0.1, y, x, y - r * 0.4); g.stroke(); g.lineWidth = r * 0.14; for (let i = 0; i < 7; i++) { const a = -Math.PI * (0.02 + i / 6 * 0.96); g.beginPath(); g.moveTo(x, y - r * 0.4); g.quadraticCurveTo(x + Math.cos(a) * r * 0.6, y - r * 0.4 + Math.sin(a) * r * 0.75, x + Math.cos(a) * r, y - r * 0.4 + Math.sin(a) * r * 0.25 + r * 0.25); g.stroke(); } },
  star(g, x, y, r, c) { starburst(g, x, y, r * 0.42, r, 5, c); },
  leaf(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.moveTo(x - r, y + r * 0.6); g.quadraticCurveTo(x - r * 0.4, y - r, x + r, y - r * 0.7); g.quadraticCurveTo(x + r * 0.5, y + r * 0.8, x - r, y + r * 0.6); g.fill(); },
  wolf(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); [[-0.9, -0.2], [-0.5, -1], [-0.25, -0.45], [0.25, -0.45], [0.5, -1], [0.9, -0.2], [0.45, 0.5], [0, 1], [-0.45, 0.5]].forEach(([a, b], i) => (i ? g.lineTo(x + a * r, y + b * r) : g.moveTo(x + a * r, y + b * r))); g.fill(); },
  gator(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r * 0.2, y - r * 0.45); g.lineTo(x + r, y - r * 0.3); g.lineTo(x + r, y + r * 0.1); g.lineTo(x - r, y + r * 0.2); g.fill(); g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x - r * 0.7 + i * r * 0.3, y + r * 0.18); g.lineTo(x - r * 0.6 + i * r * 0.3, y + r * 0.42); g.lineTo(x - r * 0.5 + i * r * 0.3, y + r * 0.16); g.fill(); } g.beginPath(); g.arc(x + r * 0.45, y - r * 0.22, r * 0.09, 0, 7); g.fill(); },
  bird(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.ellipse(x, y + r * 0.1, r * 0.7, r * 0.45, -0.3, 0, 7); g.fill(); g.beginPath(); g.arc(x + r * 0.55, y - r * 0.4, r * 0.3, 0, 7); g.fill(); g.beginPath(); g.moveTo(x + r * 0.8, y - r * 0.45); g.lineTo(x + r * 1.2, y - r * 0.35); g.lineTo(x + r * 0.8, y - r * 0.25); g.fill(); g.beginPath(); g.moveTo(x - r * 0.5, y); g.lineTo(x - r * 1.2, y + r * 0.5); g.lineTo(x - r * 0.3, y + r * 0.4); g.fill(); },
  fish(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.ellipse(x - r * 0.1, y, r * 0.75, r * 0.38, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(x + r * 0.5, y); g.lineTo(x + r, y - r * 0.4); g.lineTo(x + r, y + r * 0.4); g.fill(); g.beginPath(); g.moveTo(x - r * 0.3, y - r * 0.3); g.lineTo(x + r * 0.1, y - r * 0.75); g.lineTo(x + r * 0.2, y - r * 0.3); g.fill(); },
  cup(g, x, y, r, c) { g.fillStyle = css(c); g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.5); g.lineTo(x + r * 0.6, y - r * 0.5); g.lineTo(x + r * 0.42, y + r * 0.8); g.lineTo(x - r * 0.42, y + r * 0.8); g.fill(); g.strokeStyle = css(c); g.lineWidth = r * 0.12; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * r * 0.3, y - r * 0.65); g.quadraticCurveTo(x + i * r * 0.3 + r * 0.15, y - r * 0.85, x + i * r * 0.3, y - r * 1.05); g.stroke(); } },
  none() {},
};

// provisional logo: a wordmark in the brand's display font inside its container shape
export function drawLogo(g, brand, x, y, w, h, o = {}) {
  if (brand && typeof brand.drawLogoOn === 'function' && !brand.prov) { try { brand.drawLogoOn(g, o.bg || brand.palette?.primary || '#fff', x, y, w, h, o); return; } catch (e) { /* fall through */ } }
  const P = brand.palette, ink = o.ink || P.onPrimary || inkOn(o.bg || P.primary), shape = brand.logo?.shape || 'plain';
  g.save();
  if (shape === 'oval') { g.fillStyle = css(P.secondary); g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); g.fill(); g.strokeStyle = css(P.accent || ink); g.lineWidth = h * 0.05; g.stroke(); }
  else if (shape === 'badge') { g.fillStyle = css(P.secondary); rrect(g, x, y, w, h, h * 0.22); g.fill(); g.strokeStyle = css(P.accent || ink); g.lineWidth = h * 0.05; g.stroke(); }
  else if (shape === 'slant') { g.fillStyle = css(P.secondary); g.beginPath(); g.moveTo(x + h * 0.3, y); g.lineTo(x + w, y); g.lineTo(x + w - h * 0.3, y + h); g.lineTo(x, y + h); g.fill(); }
  else if (shape === 'burst') starburst(g, x + w / 2, y + h / 2, h * 0.5, Math.min(w * 0.5, h * 0.72), 16, P.secondary);
  else if (shape === 'underline') { g.fillStyle = css(P.accent || P.secondary); g.fillRect(x + w * 0.1, y + h * 0.86, w * 0.8, h * 0.08); }
  const inked = shape === 'plain' || shape === 'underline' ? ink : (brand.logo?.ink || inkOn(P.secondary));
  const pad = shape === 'plain' ? 0 : shape === 'oval' || shape === 'burst' ? 0.18 : 0.1; const ic = brand.logo?.icon;
  let tx = x + w * pad, tw = w * (1 - 2 * pad);
  if (ic && ICONS[ic] && !o.wordOnly) { const r = h * 0.3; ICONS[ic](g, tx + r, y + h / 2, r, brand.logo.iconC || P.accent || inked, P.primary); tx += r * 2.3; tw -= r * 2.3; }
  text(g, brand.logo?.text || brand.name, tx, y + h * 0.14, tw, h * (shape === 'underline' ? 0.66 : 0.72), { role: brand.logo?.font || 'block', color: inked, stroke: brand.logo?.outline, strokeW: h * 0.06, upper: brand.logo?.upper });
  g.restore();
}

function facts(g, x, y, w, h, prod, ink) { // nutrition panel
  g.save(); g.fillStyle = '#fff'; g.fillRect(x, y, w, h); g.strokeStyle = '#111'; g.lineWidth = Math.max(1, w * 0.02); g.strokeRect(x, y, w, h); const n = prod.nutrition || {}, rows = [['Calories', n.kcal ?? '-'], ['Total Fat', (n.fat ?? 0) + 'g'], ['Sodium', (n.sodium ?? 0) + 'mg'], ['Total Carb', (n.carbs ?? 0) + 'g'], ['Sugars', (n.sugar ?? 0) + 'g'], ['Protein', (n.protein ?? 0) + 'g']];
  text(g, 'Nutrition Facts', x + w * 0.04, y + h * 0.02, w * 0.92, h * 0.15, { role: 'block', color: '#111', align: 'left' }); g.fillStyle = '#111'; g.fillRect(x + w * 0.04, y + h * 0.19, w * 0.92, h * 0.035);
  rows.forEach((r, i) => { const yy = y + h * (0.25 + i * 0.12); text(g, r[0], x + w * 0.05, yy, w * 0.6, h * 0.09, { role: i ? 'sans' : 'block', color: '#111', align: 'left' }); text(g, String(r[1]), x + w * 0.6, yy, w * 0.35, h * 0.09, { role: 'sans', color: '#111', align: 'right' }); g.fillRect(x + w * 0.04, yy + h * 0.105, w * 0.92, 1); }); g.restore(); void ink; }
const flavorBand = (g, x, y, w, h, t, bg, ink) => { g.fillStyle = css(bg); rrect(g, x, y, w, h, h * 0.4); g.fill(); text(g, t, x + w * 0.06, y + h * 0.14, w * 0.88, h * 0.72, { role: 'cond', color: ink || inkOn(bg), upper: true }); };

// Paint a product's atlas cell: swatches on top, label art below. prod.art = { style, bg, bg2, ink, icon, iconC, flavor, claim }
export function paintCell(g, w, h, prod, brand) {
  const R = rng(prod.id, 'label'), P = brand.palette, a = prod.art || {}, sh = Math.round(h * 0.2), lh = h - sh, sw = prod.swatch || [P.primary, a.bg || P.primary, P.secondary, '#c8ccd0'];
  for (let i = 0; i < 4; i++) { g.fillStyle = css(sw[i] || sw[0]); g.fillRect(i * w / 4, 0, w / 4 + 1, sh + 1); }
  g.save(); g.translate(0, sh); g.beginPath(); g.rect(0, 0, w, lh); g.clip();
  const bg = a.bg || P.primary, bg2 = a.bg2 || P.secondary, ink = a.ink || inkOn(bg), style = a.style || 'wrap', icon = ICONS[a.icon] ? a.icon : null, flavor = a.flavor || prod.flavor || '';
  const gr = g.createLinearGradient(0, 0, 0, lh); gr.addColorStop(0, css(shade(bg, 0.12))); gr.addColorStop(1, css(shade(bg, -0.12))); g.fillStyle = gr; g.fillRect(0, 0, w, lh);
  if (style === 'wrap' || style === 'band') { // cylinder wrap: front panel centered, facts + barcode on the back seam
    const fx = w * 0.3, fw = w * 0.4;
    if (style === 'band') { g.fillStyle = css(bg2); g.fillRect(0, lh * 0.3, w, lh * 0.4); } else { g.fillStyle = css(bg2); g.beginPath(); g.moveTo(0, lh * 0.78); g.bezierCurveTo(w * 0.3, lh * 0.5, w * 0.6, lh * 1.0, w, lh * 0.62); g.lineTo(w, lh); g.lineTo(0, lh); g.fill(); g.strokeStyle = css(a.accent || P.accent || ink, 0.9); g.lineWidth = lh * 0.02; g.beginPath(); g.moveTo(0, lh * 0.76); g.bezierCurveTo(w * 0.3, lh * 0.48, w * 0.6, lh * 0.98, w, lh * 0.6); g.stroke(); }
    drawLogo(g, brand, fx, lh * 0.14, fw, lh * 0.36, { bg }); if (icon) ICONS[icon](g, fx + fw * 0.5, lh * 0.66, lh * 0.13, a.iconC || P.accent || ink, bg);
    if (flavor) flavorBand(g, fx + fw * 0.08, lh * (icon ? 0.82 : 0.6), fw * 0.84, lh * 0.13, flavor, a.flavorBg || P.accent || bg2, a.flavorInk);
    if (a.claim) text(g, a.claim, fx, lh * 0.04, fw, lh * 0.08, { role: 'cond', color: ink, upper: true });
    facts(g, w * 0.02, lh * 0.14, w * 0.17, lh * 0.72, prod); barcode(g, w * 0.84, lh * 0.56, w * 0.13, lh * 0.3, R.int(1, 1e9)); text(g, prod.net || '12 FL OZ', w * 0.72, lh * 0.9, w * 0.26, lh * 0.07, { role: 'sans', color: ink });
    text(g, (brand.tagline || brand.name), w * 0.74, lh * 0.2, w * 0.24, lh * 0.2, { role: 'sans', color: ink, maxLines: 3 });
  } else if (style === 'bag' || style === 'box' || style === 'card') { // front on the left half, back on the right half
    const fw = w * 0.5;
    if (a.burst !== false) { const cx = fw * 0.5, cy = lh * 0.62; g.fillStyle = css(shade(bg, 0.25), 0.55); g.beginPath(); g.arc(cx, cy, fw * 0.4, 0, 7); g.fill(); }
    g.fillStyle = css(bg2); g.fillRect(0, 0, fw, lh * 0.07); g.fillRect(0, lh * 0.93, fw, lh * 0.07);
    drawLogo(g, brand, fw * 0.08, lh * 0.1, fw * 0.84, lh * 0.2, { bg });
    if (icon) { const n = style === 'bag' ? 3 : 1; for (let i = 0; i < n; i++) ICONS[icon](g, fw * (0.5 + (i - (n - 1) / 2) * 0.24), lh * (0.6 + (i % 2) * 0.05), fw * (n > 1 ? 0.17 : 0.24), a.iconC || P.accent || ink, bg); }
    if (flavor) flavorBand(g, fw * 0.1, lh * 0.33, fw * 0.8, lh * 0.09, flavor, a.flavorBg || P.accent || bg2, a.flavorInk);
    if (a.claim) { starburst(g, fw * 0.8, lh * 0.8, fw * 0.1, fw * 0.14, 12, a.claimBg || '#ffd21f'); text(g, a.claim, fw * 0.7, lh * 0.765, fw * 0.2, lh * 0.07, { role: 'cond', color: '#b01515', upper: true, maxLines: 2 }); }
    text(g, prod.net || '', fw * 0.05, lh * 0.875, fw * 0.5, lh * 0.045, { role: 'sans', color: ink, align: 'left' });
    g.fillStyle = css(shade(bg, -0.08)); g.fillRect(fw, 0, fw, lh); text(g, prod.name, fw * 1.06, lh * 0.05, fw * 0.88, lh * 0.08, { role: 'cond', color: ink, upper: true }); text(g, prod.blurb || brand.story || brand.tagline || '', fw * 1.08, lh * 0.15, fw * 0.84, lh * 0.2, { role: 'light', color: ink, maxLines: 5, align: 'left' });
    facts(g, fw * 1.08, lh * 0.4, fw * 0.5, lh * 0.5, prod); barcode(g, fw * 1.64, lh * 0.72, fw * 0.3, lh * 0.18, R.int(1, 1e9)); drawLogo(g, brand, fw * 1.62, lh * 0.44, fw * 0.32, lh * 0.12, { bg: shade(bg, -0.08) });
  } else if (style === 'bar') { // top face in the upper half, back in the lower half; reads along the bar
    g.fillStyle = css(bg2); g.fillRect(0, lh * 0.46, w, lh * 0.04); drawLogo(g, brand, w * 0.06, lh * 0.06, w * 0.5, lh * 0.36, { bg }); if (flavor) flavorBand(g, w * 0.6, lh * 0.12, w * 0.34, lh * 0.24, flavor, a.flavorBg || P.accent || bg2); if (icon) ICONS[icon](g, w * 0.95, lh * 0.24, lh * 0.14, a.iconC || P.accent, bg);
    g.fillStyle = css(shade(bg, -0.15)); g.fillRect(0, lh * 0.5, w, lh * 0.5); barcode(g, w * 0.04, lh * 0.58, w * 0.16, lh * 0.34, R.int(1, 1e9)); text(g, `${prod.name} · ${prod.nutrition?.kcal ?? ''} cal · ${prod.net || ''}`, w * 0.24, lh * 0.62, w * 0.72, lh * 0.22, { role: 'sans', color: ink, align: 'left' });
  } else if (style === 'skin') { // food surface: mottled gradient with grill marks / sugar / toast
    const c = a.bg || [150, 70, 40]; for (let i = 0; i < 260; i++) { g.fillStyle = css(shade(c, R.jit(0.22)), 0.5); g.beginPath(); g.ellipse(R() * w, R() * lh, R.range(2, w * 0.06), R.range(1, lh * 0.08), R() * 3, 0, 7); g.fill(); }
    if (a.marks) { g.strokeStyle = css(shade(c, -0.55), 0.55); g.lineWidth = lh * 0.05; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * w / 8 - w * 0.03, 0); g.lineTo(i * w / 8 + w * 0.03, lh); g.stroke(); } }
    if (a.gloss) { const gg = g.createLinearGradient(0, 0, 0, lh); gg.addColorStop(0.2, 'rgba(255,255,255,0)'); gg.addColorStop(0.32, 'rgba(255,240,220,0.5)'); gg.addColorStop(0.44, 'rgba(255,255,255,0)'); g.fillStyle = gg; g.fillRect(0, 0, w, lh); }
    if (a.glaze) { g.fillStyle = css(a.glaze, 0.92); g.fillRect(0, 0, w, lh); for (let i = 0; i < (a.sprinkles ? 120 : 0); i++) { g.fillStyle = css(R.pick(['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#ffffff', '#b5179e'])); g.save(); g.translate(R() * w, R() * lh); g.rotate(R() * 3); g.fillRect(0, 0, w * 0.035, lh * 0.012); g.restore(); } const gg = g.createRadialGradient(w * 0.4, lh * 0.35, 0, w * 0.4, lh * 0.35, w * 0.4); gg.addColorStop(0, 'rgba(255,255,255,0.4)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gg; g.fillRect(0, 0, w, lh); }
    if (a.pizza) { g.fillStyle = '#e8c35a'; g.fillRect(0, 0, w, lh); for (let i = 0; i < 60; i++) { g.fillStyle = css(shade([232, 190, 90], R.jit(0.2)), 0.7); g.beginPath(); g.arc(R() * w, R() * lh, R.range(3, 9), 0, 7); g.fill(); } for (let i = 0; i < 9; i++) { const px = R.range(0.25, 0.75) * w, py = R.range(0.1, 0.8) * lh; g.fillStyle = '#a3261c'; g.beginPath(); g.arc(px, py, w * 0.07, 0, 7); g.fill(); g.fillStyle = 'rgba(255,200,160,0.3)'; g.beginPath(); g.arc(px - 2, py - 2, w * 0.03, 0, 7); g.fill(); } }
  } else { // 'plain': logo over a flat field (cups, lighters, small packs, cases)
    if (a.stripe) { g.fillStyle = css(bg2); g.fillRect(0, lh * 0.72, w, lh * 0.12); } const n = a.repeat || 1; for (let i = 0; i < n; i++) drawLogo(g, brand, w * (i + 0.12) / n, lh * 0.18, w * 0.76 / n, lh * 0.42, { bg }); if (flavor) text(g, flavor, 0, lh * 0.64, w, lh * 0.14, { role: 'cond', color: ink, upper: true }); if (icon) ICONS[icon](g, w * 0.5, lh * 0.86, lh * 0.1, a.iconC || P.accent || ink, bg);
  }
  g.restore();
}
export { text, font, lum, mixc };
