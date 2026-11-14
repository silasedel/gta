// KEYS-SIGN track: sign faces drawn on canvas: route shields, green guide panels, exit tabs, street-name blades.
import { drawFHWA, measureFHWA } from './lettering.js';
import { makeCanvas, rng } from './util.js';
const GREEN = '#0a6847', WHITE = '#f4f6f2', YELLOW = '#f6c416';
const rr = (x, a, b, w, h, r) => { x.beginPath(); x.roundRect(a, b, w, h, r); };

// route shield centered at (cx, cy), height h. type: I | US | SR | CR
export function drawShield(x, type, num, cx, cy, h) {
  const n = String(num), wide = n.length > 2, w = h * (wide ? 1.22 : 1.0); x.save(); x.translate(cx, cy);
  if (type === 'I') {
    const p = new Path2D(); p.moveTo(-w / 2, -h * 0.42); p.quadraticCurveTo(-w * 0.25, -h * 0.52, 0, -h * 0.44); p.quadraticCurveTo(w * 0.25, -h * 0.52, w / 2, -h * 0.42);
    p.bezierCurveTo(w * 0.56, h * 0.05, w * 0.34, h * 0.36, 0, h * 0.5); p.bezierCurveTo(-w * 0.34, h * 0.36, -w * 0.56, h * 0.05, -w / 2, -h * 0.42); p.closePath();
    x.fillStyle = WHITE; x.fill(p); x.save(); x.clip(p); x.fillStyle = '#17458f'; x.fillRect(-w, -h, w * 2, h * 2); x.fillStyle = '#b8222b'; x.fillRect(-w, -h, w * 2, h * 0.77); x.restore();
    x.lineWidth = h * 0.045; x.strokeStyle = WHITE; x.stroke(p); x.beginPath(); x.moveTo(-w * 0.5, -h * 0.225); x.lineTo(w * 0.5, -h * 0.225); x.stroke();
    drawFHWA(x, 'INTERSTATE', 0, -h * 0.28, h * 0.085, { series: 'C', align: 'center', color: WHITE });
    drawFHWA(x, n, 0, h * 0.24, h * 0.4, { series: wide ? 'C' : 'D', align: 'center', color: WHITE });
  } else if (type === 'US') {
    const p = new Path2D(); p.moveTo(-w * 0.5, -h * 0.34); p.quadraticCurveTo(-w * 0.36, -h * 0.36, -w * 0.3, -h * 0.5); p.quadraticCurveTo(0, -h * 0.4, w * 0.3, -h * 0.5); p.quadraticCurveTo(w * 0.36, -h * 0.36, w * 0.5, -h * 0.34);
    p.bezierCurveTo(w * 0.36, -h * 0.05, w * 0.62, h * 0.3, 0, h * 0.5); p.bezierCurveTo(-w * 0.62, h * 0.3, -w * 0.36, -h * 0.05, -w * 0.5, -h * 0.34); p.closePath();
    x.fillStyle = WHITE; x.fill(p); x.lineWidth = h * 0.035; x.strokeStyle = '#111'; x.stroke(p);
    drawFHWA(x, n, 0, h * 0.2, h * 0.42, { series: wide ? 'C' : 'D', align: 'center', color: '#111' });
  } else if (type === 'SR') { // Florida state road: the state's outline on a square
    rr(x, -w / 2, -h / 2, w, h, h * 0.08); x.fillStyle = '#111'; x.fill();
    const s = h / 100, F = [[-48, -40], [-10, -40], [-8, -36], [30, -38], [40, -30], [44, -6], [50, 22], [46, 40], [38, 44], [30, 26], [20, 4], [10, -14], [0, -22], [-12, -18], [-24, -24], [-48, -26]];
    x.beginPath(); F.forEach(([a, b], i) => x[i ? 'lineTo' : 'moveTo'](a * s * (wide ? 1.2 : 1), b * s)); x.closePath(); x.fillStyle = WHITE; x.fill();
    rr(x, -w * 0.42, -h * 0.3, w * 0.84, h * 0.5, h * 0.04); x.fillStyle = WHITE; x.fill();
    drawFHWA(x, n, 0, h * 0.14, h * 0.36, { series: n.length > 2 ? 'B' : 'D', align: 'center', color: '#111' });
  } else { // county road pentagon
    const p = new Path2D(); p.moveTo(-w * 0.5, -h * 0.5); p.lineTo(w * 0.5, -h * 0.5); p.lineTo(w * 0.5, h * 0.12); p.lineTo(0, h * 0.5); p.lineTo(-w * 0.5, h * 0.12); p.closePath();
    x.fillStyle = '#1a4a9a'; x.fill(p); x.lineWidth = h * 0.05; x.strokeStyle = YELLOW; x.stroke(p); drawFHWA(x, n, 0, h * 0.1, h * 0.36, { series: 'C', align: 'center', color: YELLOW });
  }
  x.restore(); return w;
}
function arrow(x, cx, cy, s, kind, color) {
  x.save(); x.translate(cx, cy); x.rotate(kind === 'down' ? Math.PI : kind === 'upleft' ? -Math.PI / 4 : Math.PI / 4); x.fillStyle = color;
  x.beginPath(); x.moveTo(0, -s * 0.5); x.lineTo(s * 0.42, -s * 0.02); x.lineTo(s * 0.14, -s * 0.02); x.lineTo(s * 0.14, s * 0.5); x.lineTo(-s * 0.14, s * 0.5); x.lineTo(-s * 0.14, -s * 0.02); x.lineTo(-s * 0.42, -s * 0.02); x.closePath(); x.fill(); x.restore();
}
function wear(x, W, H, seed) { // retroreflective sheeting with a few years on it: sheet seams, dirt runs, specks
  const R = rng(seed); x.save(); x.globalAlpha = 0.07; x.fillStyle = '#000'; for (let sx = 122; sx < W; sx += 122) x.fillRect(sx, 0, 1.5, H); x.restore();
  for (let i = 0; i < 9; i++) { const sx = R() * W, g = x.createLinearGradient(0, 0, 0, H * (0.4 + R() * 0.6)); g.addColorStop(0, 'rgba(40,38,30,0.22)'); g.addColorStop(1, 'rgba(40,38,30,0)'); x.fillStyle = g; x.fillRect(sx, 0, 3 + R() * 14, H); }
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '20,20,18' : '230,230,220'},${0.08 + R() * 0.12})`; x.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
}
// guide panel -> { canvas, w, h (meters), tab: { canvas, w, h } | null }
export function drawGuidePanel(p, { ppm = 150, seed = 1 } = {}) {
  const cap = 0.4 * ppm, sh = 0.9 * ppm, pad = 0.22 * ppm, gap = 0.2 * ppm;
  const rows = []; if (p.routes.length || p.cardinal) rows.push('shields'); for (const l of p.lines) rows.push(l);
  const shW = p.routes.reduce((a, r) => a + sh * (String(r.num).length > 2 ? 1.22 : 1) + gap * 0.6, 0) + (p.cardinal ? measureFHWA(p.cardinal, cap * 0.72, 'E') + gap : 0);
  const textW = Math.max(shW, ...p.lines.map((l) => measureFHWA(l, cap, 'EM')), 2.2 * ppm);
  const bandH = p.exitOnly ? 0.62 * ppm : 0, arrowH = p.exitOnly ? 0 : 0.78 * ppm;
  const W = Math.ceil(textW + pad * 4), H = Math.ceil(pad * 2 + (rows.includes('shields') ? sh + gap : 0) + p.lines.length * (cap * 1.32 + gap * 0.5) + arrowH + bandH + gap * 0.5);
  const c = makeCanvas(W, H), x = c.getContext('2d'); rr(x, 0, 0, W, H, pad * 0.9); x.fillStyle = GREEN; x.fill();
  let y = pad + gap * 0.4;
  if (rows.includes('shields')) { let sx = (W - shW) / 2; for (const r of p.routes) { const w = sh * (String(r.num).length > 2 ? 1.22 : 1); drawShield(x, r.type, r.num, sx + w / 2, y + sh / 2, sh); sx += w + gap * 0.6; } if (p.cardinal) { const big = cap * 0.72; drawFHWA(x, p.cardinal[0], sx + gap * 0.4, y + sh * 0.5 + big * 0.5, big, { series: 'E', color: WHITE }); const w0 = measureFHWA(p.cardinal[0], big, 'E'); drawFHWA(x, p.cardinal.slice(1), sx + gap * 0.4 + w0 + big * 0.14, y + sh * 0.5 + big * 0.5, big * 0.82, { series: 'E', color: WHITE }); } y += sh + gap; }
  for (const l of p.lines) { y += cap * 1.08; drawFHWA(x, l, W / 2, y, cap, { series: 'EM', align: 'center', color: WHITE }); y += cap * 0.24 + gap * 0.5; }
  if (p.exitOnly) { rr(x, pad * 0.5, H - bandH - pad * 0.5, W - pad, bandH, pad * 0.5); x.fillStyle = YELLOW; x.fill(); const by = H - pad * 0.5 - bandH / 2 + cap * 0.3; drawFHWA(x, 'EXIT', W * 0.26, by, cap * 0.6, { series: 'E', align: 'center', color: '#111' }); drawFHWA(x, 'ONLY', W * 0.74, by, cap * 0.6, { series: 'E', align: 'center', color: '#111' }); arrow(x, W / 2, H - pad * 0.5 - bandH / 2, bandH * 0.86, p.arrow, '#111'); }
  else arrow(x, W / 2, H - pad - arrowH * 0.5, arrowH * 0.92, p.arrow, WHITE);
  x.lineWidth = pad * 0.24; x.strokeStyle = WHITE; rr(x, pad * 0.22, pad * 0.22, W - pad * 0.44, H - pad * 0.44, pad * 0.75); x.stroke(); wear(x, W, H, seed);
  let tab = null;
  if (p.exit) { const tw = Math.ceil(measureFHWA('EXIT ' + p.exit, cap * 0.62, 'E') + pad * 3), th = Math.ceil(cap * 0.62 + pad * 1.7), tc = makeCanvas(tw, th), t = tc.getContext('2d'); rr(t, 0, 0, tw, th, pad * 0.6); t.fillStyle = GREEN; t.fill(); drawFHWA(t, 'EXIT ' + p.exit, tw / 2, th - pad * 0.85, cap * 0.62, { series: 'E', align: 'center', color: WHITE }); t.lineWidth = pad * 0.2; t.strokeStyle = WHITE; rr(t, pad * 0.2, pad * 0.2, tw - pad * 0.4, th - pad * 0.4, pad * 0.5); t.stroke(); tab = { canvas: tc, w: tw / ppm, h: th / ppm }; }
  return { canvas: c, w: W / ppm, h: H / ppm, tab };
}
// street-name blade into a cell of an atlas: (x0, y0, w, h) pixels. Miami style: green, white border, small quadrant and suffix
export function drawBlade(x, s, x0, y0, w, h) {
  x.save(); x.translate(x0, y0); rr(x, 1, 1, w - 2, h - 2, h * 0.14); x.fillStyle = GREEN; x.fill(); x.lineWidth = h * 0.05; x.strokeStyle = WHITE; rr(x, h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14, h * 0.1); x.stroke();
  const L = s.label, big = h * 0.5, small = h * 0.27, base = h * 0.76, main = /^\d+$/.test(L.main) ? L.main : L.main.toUpperCase();
  const wp = L.pre ? measureFHWA(L.pre, small, 'C') + small * 0.5 : 0, ws = L.suf ? measureFHWA(L.suf, small, 'C') + small * 0.4 : 0;
  let series = 'D', wm = measureFHWA(main, big, series); const room = w - h * 0.5 - wp - ws - (s.block ? h * 0.9 : 0); if (wm > room) { series = 'C'; wm = measureFHWA(main, big, series); } if (wm > room) { series = 'B'; wm = measureFHWA(main, big, series); }
  const sc = wm > room ? room / wm : 1; let cx = (w - (s.block ? h * 0.8 : 0) - (wp + wm * sc + ws)) / 2;
  if (L.pre) { drawFHWA(x, L.pre, cx, base, small, { series: 'C', color: WHITE }); cx += wp; }
  x.save(); x.translate(cx, 0); x.scale(sc, 1); drawFHWA(x, main, 0, base, big, { series, color: WHITE }); x.restore(); cx += wm * sc + small * 0.4;
  if (L.suf) drawFHWA(x, L.suf, cx, base - big + small, small, { series: 'C', color: WHITE });
  if (s.block) drawFHWA(x, String(s.block), w - h * 0.22, h * 0.42, h * 0.2, { series: 'C', color: WHITE, align: 'right' });
  x.restore();
}
