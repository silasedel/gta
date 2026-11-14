// Drawing primitives for brand marks and label art. All take a 2D context and plain numbers; none set colors unless
// a color argument is given, so they compose inside any mark function.
//   mark(g, s, P) { P.primary ...; sunRays(g, s/2, s/2, s*0.2, s*0.45, 12); g.fill(); }
export { roundRect, polygon, star } from '../util.js';
export { arcText, containerPath, col } from './engine.js';
import { font } from '../fonts.js';
export { font };

export const TAU = Math.PI * 2;
// filled circle / ring helpers
export function disc(g, cx, cy, r, fill) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } }
export function ring(g, cx, cy, r, width, stroke) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); } }
// wedge-shaped rays around a center (path only: call g.fill()). a0/a1 limit the sweep (radians).
export function sunRays(g, cx, cy, r0, r1, n = 12, duty = 0.5, a0 = 0, a1 = TAU) {
  g.beginPath(); const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) { const a = a0 + i * step, b = a + step * duty; g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a - step * 0.06) * r1, cy + Math.sin(a - step * 0.06) * r1); g.lineTo(cx + Math.cos(b + step * 0.06) * r1, cy + Math.sin(b + step * 0.06) * r1); g.lineTo(cx + Math.cos(b) * r0, cy + Math.sin(b) * r0); g.closePath(); }
}
// pointed (triangular) rays
export function spikes(g, cx, cy, r0, r1, n = 16, a0 = 0, a1 = TAU) {
  g.beginPath(); const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) { const a = a0 + i * step; g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a + step / 2) * r1, cy + Math.sin(a + step / 2) * r1); g.lineTo(cx + Math.cos(a + step) * r0, cy + Math.sin(a + step) * r0); g.closePath(); }
}
// a sine wave band between x0 and x1 (closed shape of the given thickness)
export function waveBand(g, x0, x1, y, amp, waves = 2, thick = 4, phase = 0) {
  g.beginPath(); const n = 48;
  for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, yy = y + Math.sin(phase + t * waves * TAU) * amp - thick / 2; i ? g.lineTo(x, yy) : g.moveTo(x, yy); }
  for (let i = n; i >= 0; i--) { const t = i / n, x = x0 + (x1 - x0) * t; g.lineTo(x, y + Math.sin(phase + t * waves * TAU) * amp + thick / 2); }
  g.closePath();
}
// a leaf / petal / flame-like teardrop from (x0,y0) to tip (x1,y1), `w` = half-width, `bias` moves the belly toward the tip
export function leaf(g, x0, y0, x1, y1, w, bias = 0.4) {
  const dx = x1 - x0, dy = y1 - y0, nx = -dy, ny = dx, L = Math.hypot(dx, dy) || 1, ux = nx / L * w, uy = ny / L * w;
  const mx = x0 + dx * bias, my = y0 + dy * bias;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx + ux, my + uy, x1, y1); g.quadraticCurveTo(mx - ux, my - uy, x0, y0); g.closePath();
}
// a water / oil drop, point up
export function drop(g, cx, cy, r) { g.beginPath(); g.moveTo(cx, cy - r * 1.55); g.bezierCurveTo(cx + r * 0.2, cy - r * 0.9, cx + r, cy - r * 0.35, cx + r, cy + r * 0.25); g.arc(cx, cy + r * 0.25, r, 0, Math.PI); g.bezierCurveTo(cx - r, cy - r * 0.35, cx - r * 0.2, cy - r * 0.9, cx, cy - r * 1.55); g.closePath(); }
// a flame, point up
export function flame(g, cx, cy, r) { g.beginPath(); g.moveTo(cx, cy - r * 1.5); g.bezierCurveTo(cx + r * 0.9, cy - r * 0.7, cx + r * 1.05, cy + r * 0.1, cx + r * 0.6, cy + r * 0.75); g.bezierCurveTo(cx + r * 0.3, cy + r * 1.15, cx - r * 0.3, cy + r * 1.15, cx - r * 0.6, cy + r * 0.75); g.bezierCurveTo(cx - r * 1.1, cy + r * 0.05, cx - r * 0.35, cy - r * 0.2, cx - r * 0.4, cy - r * 0.8); g.bezierCurveTo(cx - r * 0.1, cy - r * 0.55, cx - r * 0.05, cy - r * 1.0, cx, cy - r * 1.5); g.closePath(); }
// a heart
export function heart(g, cx, cy, r) { g.beginPath(); g.moveTo(cx, cy + r); g.bezierCurveTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.8, cy - r * 1.3, cx, cy - r * 0.45); g.bezierCurveTo(cx + r * 0.8, cy - r * 1.3, cx + r * 1.6, cy - r * 0.1, cx, cy + r); g.closePath(); }
// a lightning bolt in a box of height h centered at cx, cy
export function bolt(g, cx, cy, h) { const w = h * 0.5; g.beginPath(); g.moveTo(cx + w * 0.25, cy - h / 2); g.lineTo(cx - w * 0.5, cy + h * 0.06); g.lineTo(cx - w * 0.02, cy + h * 0.06); g.lineTo(cx - w * 0.28, cy + h / 2); g.lineTo(cx + w * 0.5, cy - h * 0.1); g.lineTo(cx + w * 0.04, cy - h * 0.1); g.closePath(); }
// a crown of n points, width w, height h, centered
export function crown(g, cx, cy, w, h, n = 3) { g.beginPath(); g.moveTo(cx - w / 2, cy + h / 2); g.lineTo(cx - w / 2, cy - h * 0.2); for (let i = 0; i < n; i++) { const x0 = cx - w / 2 + (i / n) * w, x1 = cx - w / 2 + ((i + 1) / n) * w; g.lineTo((x0 + x1) / 2 - (x1 - x0) * 0.0, cy - h / 2); if (i < n - 1) g.lineTo(x1, cy - h * 0.05); } g.lineTo(cx + w / 2, cy - h * 0.2); g.lineTo(cx + w / 2, cy + h / 2); g.closePath(); }
// a palm tree: curved trunk from the base to a crown of fronds. Fills with the current fillStyle.
export function palm(g, bx, by, h, lean = 0.18, fronds = 7, spread = 0.52) {
  const tx = bx + h * lean, ty = by - h; const w = h * 0.045;
  g.beginPath(); g.moveTo(bx - w, by); g.quadraticCurveTo(bx + h * lean * 0.2 - w, by - h * 0.55, tx - w * 0.6, ty); g.lineTo(tx + w * 0.6, ty); g.quadraticCurveTo(bx + h * lean * 0.2 + w, by - h * 0.55, bx + w * 1.2, by); g.closePath(); g.fill();
  for (let i = 0; i < fronds; i++) { const t = fronds === 1 ? 0.5 : i / (fronds - 1), a = Math.PI * (1.08 - t * 1.16), L = h * spread * (0.82 + 0.18 * Math.sin(t * Math.PI));
    const ex = tx + Math.cos(a) * L, ey = ty - Math.sin(a) * L * 0.55 + L * 0.34 * Math.abs(Math.cos(a)) ** 1.5; const cx = tx + Math.cos(a) * L * 0.5, cy = ty - Math.sin(a) * L * 0.75 - L * 0.12;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(cx, cy, ex, ey); g.quadraticCurveTo(cx + L * 0.02, cy + L * 0.2, tx, ty + h * 0.03); g.closePath(); g.fill(); }
}
// an anchor centered at cx, cy with height h. Strokes and fills with the current styles.
export function anchor(g, cx, cy, h) {
  const lw = h * 0.085; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(cx, cy - h * 0.4, h * 0.09, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(cx, cy - h * 0.31); g.lineTo(cx, cy + h * 0.46); g.moveTo(cx - h * 0.2, cy - h * 0.16); g.lineTo(cx + h * 0.2, cy - h * 0.16); g.stroke();
  g.beginPath(); g.arc(cx, cy + h * 0.1, h * 0.36, Math.PI * 0.08, Math.PI * 0.92); g.stroke();
  for (const sx of [-1, 1]) { g.beginPath(); const ax = cx + sx * h * 0.36 * Math.cos(Math.PI * 0.08), ay = cy + h * 0.1 + h * 0.36 * Math.sin(Math.PI * 0.08); g.moveTo(ax + sx * h * 0.09, ay + h * 0.02); g.lineTo(ax - sx * h * 0.02, ay - h * 0.15); g.lineTo(ax - sx * h * 0.1, ay + h * 0.03); g.closePath(); g.fill(); }
}
// interlocked / stacked monogram letters. style: 'overlap' | 'stack' | 'mirror' | 'side'
export function monogram(g, letters, cx, cy, size, fontRole = 'didone', fill = '#111', style = 'overlap', opts = {}) {
  g.save(); g.fillStyle = fill; g.strokeStyle = fill; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.font = font(fontRole, size, opts.font || {});
  const L = [...letters]; const mh = g.measureText('H').actualBoundingBoxAscent || size * 0.7; const by = cy + mh / 2;
  if (style === 'stack') { g.font = font(fontRole, size * 0.62, opts.font || {}); const m2 = g.measureText('H').actualBoundingBoxAscent; L.forEach((ch, i) => g.fillText(ch, cx, cy - (L.length - 1) * m2 * 0.55 + i * m2 * 1.1 + m2 / 2)); }
  else if (style === 'mirror') { const w = g.measureText(L[0]).width; g.fillText(L[0], cx + w * 0.3, by); g.save(); g.translate(cx - w * 0.3, 0); g.scale(-1, 1); g.fillText(L[1] || L[0], 0, by); g.restore(); }
  else if (style === 'side') { const tw = L.reduce((a, ch) => a + g.measureText(ch).width, 0); let x = cx - tw / 2; L.forEach((ch) => { const w = g.measureText(ch).width; g.fillText(ch, x + w / 2, by); x += w; }); }
  else { const off = (opts.offset ?? 0.3) * size; L.forEach((ch, i) => { const k = i - (L.length - 1) / 2; g.fillText(ch, cx + k * off, by + k * (opts.drop ?? 0.16) * size); }); }
  g.restore();
}
// laurel branch halves around a center (decor for crests). Fills with the current fillStyle.
export function laurel(g, cx, cy, r, leaves = 9, sweep = 2.3) {
  for (const s of [-1, 1]) for (let i = 0; i < leaves; i++) { const a = Math.PI / 2 + s * (0.25 + (i / (leaves - 1)) * sweep); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; const ta = a + s * 1.15; leaf(g, x, y, x + Math.cos(ta) * r * 0.3, y + Math.sin(ta) * r * 0.3, r * 0.085, 0.5); g.fill(); }
}
// a simple fish (body + tail), nose toward +x, length L
export function fish(g, cx, cy, L, fat = 0.32) { g.beginPath(); g.moveTo(cx + L * 0.5, cy); g.quadraticCurveTo(cx + L * 0.1, cy - L * fat, cx - L * 0.28, cy); g.lineTo(cx - L * 0.5, cy - L * 0.2); g.lineTo(cx - L * 0.42, cy); g.lineTo(cx - L * 0.5, cy + L * 0.2); g.lineTo(cx - L * 0.28, cy); g.quadraticCurveTo(cx + L * 0.1, cy + L * fat, cx + L * 0.5, cy); g.closePath(); }
// a long-legged wading bird silhouette (heron / egret / flamingo). Height h, feet at (bx, by). Uses the current fillStyle.
export function wader(g, bx, by, h, opts = {}) {
  const k = h; const neckCurl = opts.curl ?? 1; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle;
  g.lineWidth = k * 0.022; g.beginPath(); g.moveTo(bx - k * 0.02, by); g.lineTo(bx - k * 0.01, by - k * 0.42); g.moveTo(bx + k * 0.06, by); g.lineTo(bx + k * 0.03, by - k * 0.25); g.lineTo(bx + k * 0.05, by - k * 0.42); g.stroke();
  g.beginPath(); g.ellipse(bx + k * 0.0, by - k * 0.5, k * 0.2, k * 0.115, -0.25, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(bx - k * 0.17, by - k * 0.46); g.lineTo(bx - k * 0.33, by - k * 0.4); g.lineTo(bx - k * 0.12, by - k * 0.54); g.closePath(); g.fill();
  g.lineWidth = k * 0.05; g.beginPath(); g.moveTo(bx + k * 0.14, by - k * 0.55); g.bezierCurveTo(bx + k * 0.3 * neckCurl, by - k * 0.68, bx - k * 0.02 * neckCurl, by - k * 0.78, bx + k * 0.12, by - k * 0.9); g.stroke();
  g.beginPath(); g.ellipse(bx + k * 0.14, by - k * 0.915, k * 0.05, k * 0.04, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(bx + k * 0.17, by - k * 0.94); g.lineTo(bx + k * (opts.beak ?? 0.36), by - k * (opts.beakDrop ? 0.86 : 0.9)); g.lineTo(bx + k * 0.17, by - k * 0.89); g.closePath(); g.fill();
}
// a five-petal hibiscus-like flower
export function flower(g, cx, cy, r, petals = 5, rot = -Math.PI / 2) { for (let i = 0; i < petals; i++) { const a = rot + (i / petals) * TAU; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, r * 0.34, a, 0, TAU); g.fill(); } }
// a gear outline (path only)
export function gear(g, cx, cy, r, teeth = 10, depth = 0.18) { g.beginPath(); const n = teeth * 4; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = (i % 4 < 2) ? r : r * (1 - depth); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
// stripes clipped to the current path region: call after g.clip()
export function stripes(g, x, y, w, h, n, colors, angle = 0) { g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(angle); const d = Math.hypot(w, h), sw = d / n; for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.fillRect(-d / 2 + i * sw, -d / 2, sw + 0.5, d); } g.restore(); }
// chevron (arrowhead) pointing right, centered
export function chevron(g, cx, cy, w, h, t) { g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2); g.lineTo(cx - w / 2 + t, cy - h / 2); g.lineTo(cx + w / 2, cy); g.lineTo(cx - w / 2 + t, cy + h / 2); g.lineTo(cx - w / 2, cy + h / 2); g.lineTo(cx + w / 2 - t, cy); g.closePath(); }
// a wing (half), root at (x, y), spanning w to the right, height h. Mirror with g.scale(-1, 1) for the other side.
export function wing(g, x, y, w, h, feathers = 4) { for (let i = 0; i < feathers; i++) { const t = i / feathers, yy = y + t * h, ww = w * (1 - t * 0.55); g.beginPath(); g.moveTo(x, yy); g.quadraticCurveTo(x + ww * 0.6, yy - h * 0.35, x + ww, yy - h * 0.1); g.quadraticCurveTo(x + ww * 0.6, yy + h * 0.1, x, yy + h / feathers * 0.9); g.closePath(); g.fill(); } }
