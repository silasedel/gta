// Interiors engine kit: canvas atlases for everything printed (labels, posters, tags, menus, signs, screens).
// GLOBAL holds prints shared by every store (product labels, brand posters); each interior owns a small local Atlas for prints
// that carry its own name, prices or lore, disposed with the interior so GPU memory stays level.
import * as THREE from 'three';
import { note } from './prof.js';
import { css, inkOn } from './util.js';

const NODEFER = typeof location !== 'undefined' && /[?&]nodefer=1\b/.test(location.search); // r7: ?nodefer=1 = cells drawn at once (A/B)
export class Atlas {
  constructor(size = 2048, pad = 4) { this.size = size; this.pad = pad; this.pages = []; this.cells = new Map(); }
  _page() { const c = document.createElement('canvas'); c.width = c.height = this.size; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, this.size, this.size);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.flipY = false; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const p = { c, g, tex, x: 0, y: 0, rowH: 0, dirty: false }; this.pages.push(p); return p; }
  // Reserve (or fetch) a w x h pixel cell and draw into it once: draw(ctx, w, h) with the origin at the cell's top-left.
  // -> { tex, rect: [u0, v0, u1, v1] (v0 = bottom edge), page, w, h }
  cell(key, w, h, draw) {
    let cl = this.cells.get(key); if (cl) return cl;
    w = Math.min(Math.ceil(w), this.size - 2 * this.pad); h = Math.min(Math.ceil(h), this.size - 2 * this.pad); const P = this.pad, S = this.size;
    let p = this.pages[this.pages.length - 1] || this._page();
    if (p.x + w + 2 * P > S) { p.x = 0; p.y += p.rowH; p.rowH = 0; }
    if (p.y + h + 2 * P > S) p = this._page();
    const x = p.x + P, y = p.y + P; p.x += w + 2 * P; p.rowH = Math.max(p.rowH, h + 2 * P);
    // r7 (zero-hitch entry): with a defer queue the cell is reserved now (rect known, geometry can use it) and drawn later by
    // flush(ms), a few ms per frame; the engine flushes the queues before an interior is shown
    const job = () => {
      const tc = performance.now(), g = p.g; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.clearRect(0, 0, w, h); try { draw(g, w, h); } catch (e) { console.warn('[interiors] atlas draw failed', key, e); g.fillStyle = '#c33'; g.fillRect(0, 0, w, h); } g.restore();
      g.drawImage(p.c, x, y, w, 1, x, y - P, w, P); g.drawImage(p.c, x, y + h - 1, w, 1, x, y + h, w, P); g.drawImage(p.c, x, y - P, 1, h + 2 * P, x - P, y - P, P, h + 2 * P); g.drawImage(p.c, x + w - 1, y - P, 1, h + 2 * P, x + w, y - P, P, h + 2 * P);
      p.dirty = true; note('cell:' + String(key).slice(0, 24), performance.now() - tc);
    };
    let dj = null; if (this.deferQ && !this.direct && !NODEFER) this.deferQ.push(dj = { job, p, cl: null }); else { job(); p.tex.needsUpdate = true; }
    cl = { tex: p.tex, page: this.pages.indexOf(p), rect: [x / S, (y + h) / S, (x + w) / S, y / S], px: [x, y, w, h], w, h, canvas: p.c }; if (dj) dj.cl = cl; this.cells.set(key, cl); return cl;
  }
  // draw deferred cells for up to ms milliseconds; -> cells still waiting
  flush(ms = 2) { const q = this.deferQ; if (!q || !q.length) return 0; const t0 = performance.now(), touched = new Set(); while (q.length && performance.now() - t0 < ms) { const j = q.shift(); try { j.job(); } catch (e) { /* drawn as an error tile inside */ } touched.add(j.p); } for (const p of touched) p.tex.needsUpdate = true; return q.length; }
  // redraw an existing cell (screens, clocks, running totals)
  redraw(cl, draw) { const q = this.deferQ; if (q?.length) { const i = q.findIndex((j) => j.cl === cl); if (i >= 0) q.splice(i, 1); } /* the redraw replaces its pending first draw */ const p = this.pages[cl.page], [x, y, w, h] = cl.px, g = p.g; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.clearRect(0, 0, w, h); draw(g, w, h); g.restore(); p.tex.needsUpdate = true; }
  dispose() { for (const p of this.pages) p.tex.dispose(); this.pages.length = 0; this.cells.clear(); }
  bytes() { return this.pages.length * this.size * this.size * 4 * 1.33; }
}
export const GLOBAL = new Atlas(2048);

// ---------------------------------------------------------------- text and print helpers (2D canvas)
export const FONTS = {
  block: '900 PX "Arial Black", "Helvetica Neue", Arial, sans-serif', cond: '700 PX "Arial Narrow", "Helvetica Neue", Arial, sans-serif', sans: '600 PX "Helvetica Neue", Helvetica, Arial, sans-serif', light: '400 PX "Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: '700 PX Georgia, "Times New Roman", serif', slab: '700 PX Rockwell, "Courier New", Georgia, serif', script: 'italic 700 PX "Brush Script MT", "Snell Roundhand", "Segoe Script", cursive', mono: '600 PX "Courier New", Menlo, monospace', round: '700 PX "Arial Rounded MT Bold", "Trebuchet MS", Verdana, sans-serif', impact: '400 PX Impact, "Arial Narrow Bold", "Arial Black", sans-serif', marker: '700 PX "Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive', deco: '700 PX Futura, "Century Gothic", "Trebuchet MS", sans-serif',
};
export const font = (role, px) => (FONTS[role] || FONTS.sans).replace('PX', Math.max(4, px).toFixed(1) + 'px');
// draw text fitted into a box (shrinks to fit, optional wrap to maxLines). o: { role, color, align, base, stroke, strokeW, maxLines, track, upper }
export function text(g, str, x, y, w, h, o = {}) {
  str = String(str ?? ''); if (o.upper) str = str.toUpperCase(); const role = o.role || 'sans'; let px = h; g.textBaseline = 'middle'; g.textAlign = o.align || 'center';
  let lines = [str];
  const fit = () => { g.font = font(role, px); if ((o.maxLines || 1) > 1) { const words = str.split(/\s+/); lines = ['']; for (const wd of words) { const t = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + wd : wd; if (g.measureText(t).width > w && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = t; } } return Math.max(...lines.map((l) => g.measureText(l).width)); };
  px = h / Math.min(o.maxLines || 1, 1); let mw = fit();
  if ((o.maxLines || 1) > 1) { let n = 0; while ((lines.length * px * 1.08 > h || mw > w) && n++ < 30) { px *= 0.92; mw = fit(); } } else if (mw > w) { px *= w / mw; g.font = font(role, px); }
  const lh = px * 1.08, y0 = y + h / 2 - (lines.length - 1) * lh / 2, ax = g.textAlign === 'center' ? x + w / 2 : g.textAlign === 'right' ? x + w : x;
  lines.forEach((l, i) => { if (o.stroke) { g.lineJoin = 'round'; g.strokeStyle = css(o.stroke); g.lineWidth = o.strokeW || px * 0.14; g.strokeText(l, ax, y0 + i * lh); } g.fillStyle = css(o.color || '#111'); g.fillText(l, ax, y0 + i * lh); });
  return px;
}
export function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function barcode(g, x, y, w, h, seed = 1) { g.fillStyle = '#fff'; g.fillRect(x, y, w, h); g.fillStyle = '#111'; let s = seed >>> 0 || 1, cx = x + w * 0.06; while (cx < x + w * 0.94) { s = (s * 1664525 + 1013904223) >>> 0; const bw = (1 + (s >>> 30)) * w * 0.012; g.fillRect(cx, y + h * 0.08, bw, h * 0.7); cx += bw + (1 + ((s >>> 27) & 3)) * w * 0.012; } }
export function starburst(g, cx, cy, r0, r1, n, col) { g.fillStyle = css(col); g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r0 : r1, a = i * Math.PI / n; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); }
// paper wear over a finished print: creases, yellowing, tape corners, sun fade
export function weather(g, w, h, R, k = 0.5) {
  if (k <= 0) return; g.fillStyle = `rgba(190,160,90,${0.1 * k})`; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6 * k; i++) { g.strokeStyle = `rgba(255,255,255,${0.12 * k})`; g.lineWidth = 1; g.beginPath(); const y = R() * h; g.moveTo(0, y); g.lineTo(w, y + R.jit(h * 0.1)); g.stroke(); }
  for (let i = 0; i < 14 * k; i++) { const x = R() * w, y = R() * h, r = R.range(w * 0.02, w * 0.12), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(90,70,40,${0.14 * k})`); gr.addColorStop(1, 'rgba(90,70,40,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  const fade = g.createLinearGradient(0, 0, w, h); fade.addColorStop(0, `rgba(255,250,235,${0.16 * k})`); fade.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = fade; g.fillRect(0, 0, w, h);
}
export { css, inkOn };
