// Per-boat painted textures: the hull livery (color, bottom paint, boot stripe, graphics, wear) and the decal atlas
// (name, hailing port, registration, builder and engine marks). Plus the shared screen atlas for electronics.
import * as THREE from 'three';
import { S, rng, clamp, lerp } from './kit.js';
import { canvasEl, canvasTexture } from './materials.js';
import { colorUtil } from './identity.js';

const css = colorUtil.css;
const rgba = (hex, a) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;

// ---------------------------------------------------------------- hull livery
// Layout: top half = starboard side (x: stern -> bow), bottom half = port side (x: bow -> stern), y: height (LV range).
export function paintLivery(H, id, o = {}) {
  const W = o.width || 1024, Hh = o.height || 256, cv = canvasEl(W, Hh), c = cv.getContext('2d');
  const r = rng(id.seed * 7 + 3), C = id.colors, [y0, y1] = H.LV, L = H.L;
  const X = (u) => u * W, Y = (y) => (1 - (y - y0) / (y1 - y0)) * Hh;
  const sheerPath = (dy = 0, uA = 0, uB = 1) => { const n = 48; for (let i = 0; i <= n; i++) { const u = lerp(uA, uB, i / n); c.lineTo(X(u), Y(H.sheerY(u) + dy)); } };
  const chineOrWL = (u) => (H.chineY(u) ?? 0.12);
  const hull = C[S.hull], hull2 = C[S.hull2], g = id.gfx, style = id.graphics;
  // base
  c.fillStyle = css(hull); c.fillRect(0, 0, W, Hh);
  const band = (fn0, fn1, col, uA = 0, uB = 1) => { c.fillStyle = col; c.beginPath(); const n = 48; for (let i = 0; i <= n; i++) { const u = lerp(uA, uB, i / n); c.lineTo(X(u), Y(fn0(u))); } for (let i = n; i >= 0; i--) { const u = lerp(uA, uB, i / n); c.lineTo(X(u), Y(fn1(u))); } c.closePath(); c.fill(); };
  if (style === 'twotone') { const k = 0.3 + g.a * 0.3; band((u) => y0, (u) => lerp(0.1, H.sheerY(u), k) + (u - 0.5) * (g.b - 0.4) * 0.5, css(hull2)); }
  else if (style === 'fade') { const gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, css(hull2)); gr.addColorStop(0.35 + g.a * 0.3, css(hull)); c.fillStyle = gr; c.fillRect(0, 0, W, Hh); }
  else if (style === 'band') { const t = 0.5 + g.a * 0.25, wdt = 0.1 + g.b * 0.12; band((u) => H.sheerY(u) * t - wdt / 2, (u) => H.sheerY(u) * t + wdt / 2, css(hull2)); if (g.c > 0.5) band((u) => H.sheerY(u) * t + wdt / 2 + 0.02, (u) => H.sheerY(u) * t + wdt / 2 + 0.045, css(C[S.accent])); }
  else if (style === 'sheer') { const d = 0.07 + g.a * 0.06; band((u) => H.sheerY(u) - d - 0.035, (u) => H.sheerY(u) - d, css(C[S.accent])); if (g.b > 0.6) band((u) => H.sheerY(u) - d - 0.06, (u) => H.sheerY(u) - d - 0.048, css(hull2)); }
  else if (style === 'swoosh') { // a tapered sweep from the bow shoulder down toward the stern quarter
    for (const [k, col, wd] of [[0, css(hull2), 1], [0.045, css(C[S.accent]), 0.35]]) { c.fillStyle = col; c.beginPath(); const n = 40;
      const mid = (u) => lerp(H.sheerY(u) * (0.25 + g.a * 0.15), H.sheerY(u) * 0.82, Math.pow(u, 1.8 + g.b)) - k, th = (u) => (0.02 + 0.16 * Math.sin(Math.PI * clamp((u - 0.05) / 0.95, 0, 1)) ** 0.8) * wd;
      for (let i = 0; i <= n; i++) { const u = lerp(0.04, 0.97, i / n); c.lineTo(X(u), Y(mid(u) + th(u) / 2)); } for (let i = n; i >= 0; i--) { const u = lerp(0.04, 0.97, i / n); c.lineTo(X(u), Y(mid(u) - th(u) / 2)); } c.closePath(); c.fill(); } }
  else if (style === 'slash') { // offshore: raked color slashes aft + long spear forward
    const cols = [css(hull2), css(C[S.accent]), css(C[S.boot])]; const top = (u) => H.sheerY(u) + 0.1;
    for (let k = 0; k < 3; k++) { const u0 = 0.06 + k * (0.07 + g.a * 0.03), wd = 0.05 + g.b * 0.03, rk = 0.12 + g.c * 0.1; c.fillStyle = cols[k % 3]; c.beginPath(); c.moveTo(X(u0), Y(y0)); c.lineTo(X(u0 + wd), Y(y0)); c.lineTo(X(u0 + wd + rk), Y(top(u0))); c.lineTo(X(u0 + rk), Y(top(u0))); c.closePath(); c.fill(); }
    c.fillStyle = cols[0]; c.beginPath(); c.moveTo(X(0.34), Y(H.sheerY(0.34) * 0.62)); c.lineTo(X(0.97), Y(H.sheerY(0.97) * 0.86)); c.lineTo(X(0.36), Y(H.sheerY(0.36) * 0.42)); c.closePath(); c.fill(); }
  else if (style === 'camo') { const cols = [0x4b5136, 0x6b6a45, 0x2f3524, 0x8a8660, 0x3f3a2a]; c.fillStyle = css(cols[0]); c.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 70; i++) { c.fillStyle = css(cols[1 + (i % 4)]); c.beginPath(); const x = r() * W, y = r() * Hh, n = 7; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, rr = (10 + r() * 34) * (W / 1024); c.lineTo(x + Math.cos(a) * rr * 1.8, y + Math.sin(a) * rr * 0.7); } c.closePath(); c.fill(); } }
  else if (style === 'bare' || style === 'alu') { // bare aluminum: brushed streaks, weld seams, rivet rows
    c.fillStyle = css(hull); c.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '70,76,82'},${0.03 + r() * 0.05})`; c.fillRect(r() * W, r() * Hh, 20 + r() * 120, 1); }
    c.fillStyle = 'rgba(60,66,72,0.45)'; for (let u = 0.1; u < 0.95; u += 0.085) { c.fillRect(X(u), 0, 1.5, Hh); for (let y = 4; y < Hh; y += 7) { c.beginPath(); c.arc(X(u) + 4, y, 1.1, 0, 7); c.fill(); } }
    if (style === 'alu') band((u) => H.sheerY(u) - 0.2, (u) => H.sheerY(u) - 0.05, css(hull2)); }
  else if (style === 'checker') { const t = 0.55, sz = 0.085; for (let row = 0; row < 2; row++) for (let i = 0; i < Math.ceil(L / sz); i++) { if ((i + row) % 2) continue; const u0 = (i * sz) / L, u1 = ((i + 1) * sz) / L; band((u) => H.sheerY(u) * t + (row - 1) * sz, (u) => H.sheerY(u) * t + row * sz, css(hull2), u0, Math.min(1, u1)); } }
  else if (style === 'hash') { // patrol: three raked bars forward of amidships + a sheer band
    band((u) => H.sheerY(u) - 0.16, (u) => H.sheerY(u) - 0.04, css(hull2));
    const cols = [css(C[S.accent]), css(hull2), css(C[S.accent])]; for (let k = 0; k < 3; k++) { const u0 = 0.56 + k * 0.035, wd = [0.03, 0.012, 0.012][k], rk = 0.07; c.fillStyle = cols[k]; c.beginPath(); c.moveTo(X(u0), Y(0.04)); c.lineTo(X(u0 + wd), Y(0.04)); c.lineTo(X(u0 + wd + rk), Y(H.sheerY(u0) + 0.1)); c.lineTo(X(u0 + rk), Y(H.sheerY(u0) + 0.1)); c.closePath(); c.fill(); } }
  else if (style === 'work') { band((u) => H.sheerY(u) - 0.22, (u) => H.sheerY(u) + 0.1, css(hull2)); }
  else if (style === 'planks') { c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1.2; for (let k = 1; k < 7; k++) { c.beginPath(); for (let i = 0; i <= 40; i++) { const u = i / 40; c.lineTo(X(u), Y(lerp(H.keelY(u), H.sheerY(u), k / 7))); } c.stroke(); } }
  // bottom paint + boot stripe (follow the waterline; the stripe sweeps up slightly toward the bow as on a real hull)
  const wl = (u) => 0.035 + 0.05 * Math.pow(u, 3);
  if (id.bottomPaint) { band(() => y0 - 1, wl, css(C[S.bottom]));
    const bw = 0.045 + g.d * 0.035; band(wl, (u) => wl(u) + bw, css(C[S.boot])); if (g.c > 0.62) band((u) => wl(u) + bw + 0.018, (u) => wl(u) + bw + 0.036, css(C[S.boot])); }
  else if (style !== 'bare' && style !== 'camo') { /* trailer boat: gelcoat to the keel, thin pinstripe only */ if (g.d > 0.5) band((u) => 0.07, (u) => 0.085, css(C[S.boot])); }
  // ---- wear: waterline scum, rust / exhaust runs, scuffs, sun chalk
  const wear = id.wear;
  if (wear > 0.08) {
    const gr = c.createLinearGradient(0, Y(0.16), 0, Y(-0.05)); gr.addColorStop(0, 'rgba(92,96,60,0)'); gr.addColorStop(0.7, `rgba(92,96,60,${0.5 * wear})`); gr.addColorStop(1, `rgba(60,70,50,${0.65 * wear})`);
    c.fillStyle = gr; c.fillRect(0, Y(0.16), W, Y(-0.05) - Y(0.16));
    const nRun = Math.floor(wear * 16); for (let i = 0; i < nRun; i++) { const u = r(), yt = H.sheerY(u) - r() * 0.15, len = (0.15 + r() * 0.5) * (Y(0) - Y(1)); const x = X(u); const gg = c.createLinearGradient(0, Y(yt), 0, Y(yt) + len); const rust = r() < 0.45; gg.addColorStop(0, rust ? `rgba(120,62,24,${0.35 * wear + 0.1})` : `rgba(40,40,36,${0.3 * wear + 0.08})`); gg.addColorStop(1, 'rgba(60,50,40,0)'); c.fillStyle = gg; c.fillRect(x, Y(yt), 1.5 + r() * 3, len); }
    const nSc = Math.floor(wear * 40); c.lineCap = 'round'; for (let i = 0; i < nSc; i++) { const u = r(), y = lerp(0.1, H.sheerY(u) - 0.05, r()); c.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.12 + r() * 0.2})` : `rgba(30,30,30,${0.1 + r() * 0.18})`; c.lineWidth = 0.6 + r() * 1.6; c.beginPath(); c.moveTo(X(u), Y(y)); c.lineTo(X(u) + (r() - 0.3) * 60 * (W / 1024), Y(y) + (r() - 0.5) * 5); c.stroke(); }
    if (id.sunFade > 0.2) { c.fillStyle = `rgba(255,255,255,${0.12 * id.sunFade})`; c.fillRect(0, 0, W, Y(0.3)); }
  }
  if (o.extra) o.extra(c, { X, Y, W, Hh, band, r });
  // compose both sides
  const out = canvasEl(W, Hh * 2), oc = out.getContext('2d');
  oc.drawImage(cv, 0, 0); oc.save(); oc.translate(W, Hh); oc.scale(-1, 1); oc.drawImage(cv, 0, 0); oc.restore();
  const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- decal atlas (1024 x 512)
const NAME_FONTS = ['italic 700 96px "Brush Script MT", "Snell Roundhand", cursive', '900 82px "Arial Black", "Helvetica Neue", Arial, sans-serif', 'italic 700 88px Georgia, "Times New Roman", serif', '700 84px "Copperplate", "Copperplate Gothic Bold", Georgia, serif', 'italic 900 84px "Helvetica Neue", Arial, sans-serif', '700 90px "Snell Roundhand", "Brush Script MT", cursive'];
const BUILDER_FONT = { serif: '700 64px Georgia, serif', stencil: '900 60px "Arial Black", Impact, sans-serif', sans: '800 64px "Helvetica Neue", Arial, sans-serif', script: 'italic 700 72px "Snell Roundhand", "Brush Script MT", cursive', round: '800 64px "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif', italic: 'italic 900 66px "Helvetica Neue", Arial, sans-serif', slab: '700 60px "Rockwell", "Courier New", serif' };
export function paintDecals(id, o = {}) {
  const W = 1024, Hh = 1024, cv = canvasEl(W, Hh), c = cv.getContext('2d'); c.clearRect(0, 0, W, Hh);
  const rects = {};
  const put = (key, text, font, color, x0, y0, w, h, opt = {}) => {
    if (!text) return; c.save(); c.font = font; let m = c.measureText(text); let sc = Math.min(1, (w - 16) / Math.max(1, m.width)); const px = parseFloat(/(\d+)px/.exec(font)[1]) * sc;
    c.font = font.replace(/\d+px/, `${px.toFixed(1)}px`); m = c.measureText(text); c.textBaseline = 'middle'; c.textAlign = 'left';
    const tw = m.width, tx = x0 + 8, ty = y0 + h / 2;
    if (opt.shadow) { c.fillStyle = opt.shadow; c.fillText(text, tx + px * 0.04, ty + px * 0.045); }
    if (opt.stroke) { c.lineWidth = px * 0.09; c.strokeStyle = opt.stroke; c.lineJoin = 'round'; c.strokeText(text, tx, ty); }
    c.fillStyle = color; c.fillText(text, tx, ty);
    if (opt.underline) { c.fillStyle = opt.underline; c.fillRect(tx, ty + px * 0.42, tw, Math.max(2, px * 0.05)); }
    c.restore();
    const th = Math.min(h, px * 1.25), x1 = tx + tw + 8, ya = ty - th / 2, yb = ty + th / 2;
    rects[key] = { uv: [(tx - 6) / W, 1 - yb / Hh, x1 / W, 1 - ya / Hh], aspect: (x1 - tx + 6) / (yb - ya) };
  };
  const nc = css(id.nameColor), dark = colorUtil.lum(id.nameColor) < 0.5, edge = dark ? 'rgba(255,255,255,0.0)' : 'rgba(0,0,0,0.55)';
  const gold = id.r ? id.gfx.a > 0.7 : false;
  put('name', id.name, NAME_FONTS[id.nameFont % NAME_FONTS.length], nc, 0, 0, 1024, 150, { shadow: gold ? 'rgba(120,84,20,0.9)' : (dark ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.5)'), stroke: id.gfx.b > 0.75 ? edge : null });
  put('port', id.port, '700 44px "Helvetica Neue", Arial, sans-serif', nc, 0, 150, 512, 60);
  put('reg', id.reg, '900 62px "Arial Black", "Helvetica Neue", Arial, sans-serif', id.dark ? '#f4f4f0' : '#101214', 512, 150, 512, 80);
  const b = id.builder;
  put('builder', b.name, BUILDER_FONT[b.style] || BUILDER_FONT.sans, id.dark ? '#f4f4f0' : b.color, 0, 230, 512, 80, { underline: b.style === 'script' ? null : (id.dark ? 'rgba(244,244,240,0.8)' : b.color) });
  put('model', id.modelName, 'italic 700 46px "Helvetica Neue", Arial, sans-serif', id.dark ? '#d9dde0' : '#3d4349', 512, 230, 512, 80);
  const ob = id.outboard, cowlDark = colorUtil.lum(id.colors[S.cowl]) < 0.5;
  put('cowl', ob.name, `${ob.font} 70px "Helvetica Neue", Arial, sans-serif`, cowlDark ? '#f2f2ee' : '#15171a', 0, 310, 512, 100, { underline: css(ob.accent) });
  put('hp', String(o.hp ?? ''), 'italic 900 84px "Arial Black", "Helvetica Neue", Arial, sans-serif', css(ob.accent), 512, 310, 256, 100, { stroke: cowlDark ? null : 'rgba(0,0,0,0.25)' });
  put('unit', id.unit, '900 70px "Arial Black", Arial, sans-serif', id.dark ? '#f4f4f0' : '#101214', 768, 310, 256, 100);
  put('big', o.big, '900 86px "Arial Black", "Helvetica Neue", Arial, sans-serif', o.bigColor || (id.dark ? '#f4f4f0' : '#14284a'), 0, 410, 640, 102);
  put('big2', o.big2, '800 54px "Helvetica Neue", Arial, sans-serif', o.big2Color || (id.dark ? '#f4f4f0' : '#14284a'), 640, 410, 384, 102);
  // ---- drawn marks: builder emblem, capacity plate, warning labels, cowl graphics, fill labels, tag line
  const area = (key, x, y, w, h, fn) => { c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip(); fn(w, h); c.restore(); rects[key] = { uv: [x / W, 1 - (y + h) / Hh, (x + w) / W, 1 - y / Hh], aspect: w / h }; };
  const ink = id.dark ? '#f4f4f0' : b.color, hpN = o.hp || 0, r2 = rng(id.seed * 13 + 5);
  area('logo', 0, 512, 180, 180, (w, h) => { // round emblem: ring, wave bars, a mark per builder style, initial
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 9; c.beginPath(); c.arc(90, 90, 80, 0, 7); c.stroke(); c.lineWidth = 3; c.beginPath(); c.arc(90, 90, 68, 0, 7); c.stroke();
    c.lineWidth = 7; c.lineCap = 'round'; for (let k = 0; k < 3; k++) { c.beginPath(); for (let x = 34; x <= 146; x += 4) { const y = 118 + k * 13 + Math.sin((x - 34) / 112 * Math.PI * 3 + k) * 5; x === 34 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
    const st = b.style; c.beginPath();
    if (st === 'script' || st === 'serif') { c.moveTo(90, 26); c.quadraticCurveTo(140, 70, 96, 104); c.lineTo(90, 104); c.closePath(); c.fill(); c.fillRect(86, 22, 5, 86); c.beginPath(); c.moveTo(84, 40); c.quadraticCurveTo(50, 78, 82, 104); c.closePath(); c.fill(); } // sails
    else if (st === 'stencil' || st === 'slab') { c.moveTo(42, 100); c.lineTo(58, 70); c.lineTo(122, 70); c.lineTo(138, 100); c.closePath(); c.fill(); c.fillRect(78, 44, 30, 26); c.fillRect(88, 28, 8, 16); } // work boat
    else { c.moveTo(34, 92); c.quadraticCurveTo(90, 20, 150, 62); c.quadraticCurveTo(100, 62, 70, 100); c.closePath(); c.fill(); } // swept hull mark
    c.font = '900 30px "Helvetica Neue", Arial, sans-serif'; c.textAlign = 'center'; c.fillStyle = id.dark ? '#101214' : '#ffffff'; c.fillText((b.name || 'B')[0], 90, 96); c.textAlign = 'left'; });
  area('plate', 190, 512, 330, 220, (w, h) => { c.fillStyle = '#e9c21a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f6f3e6'; c.fillRect(8, 44, w - 16, h - 52); c.strokeStyle = '#15171a'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = '#15171a'; c.font = '900 22px Arial, sans-serif'; c.fillText('MAXIMUM CAPACITIES', 14, 32); const per = Math.max(2, Math.round((id.capacity || 8))), lb = per * 150 + 90;
    c.font = '900 34px Arial, sans-serif'; c.fillText(`${per} PERSONS OR ${lb} LBS`, 16, 86); c.font = '700 17px Arial, sans-serif'; c.fillText(`${lb + 950 + hpN * 2} LBS PERSONS, MOTORS, GEAR`, 16, 114); c.fillText(`${Math.max(hpN, 10) * (o.engines || 1)} HP MAXIMUM`, 16, 138);
    c.font = '600 11px Arial, sans-serif'; c.fillText('THIS BOAT COMPLIES WITH SAFETY STANDARDS IN EFFECT', 16, 162); c.fillText('ON THE DATE OF CERTIFICATION', 16, 176); c.font = '800 13px Arial, sans-serif'; c.fillText(`${(b.full || b.name || '').toUpperCase()}`, 16, 196);
    c.font = '700 11px "Courier New", monospace'; c.fillText(`HIN ${(b.name || 'PSB').slice(0, 3).toUpperCase()}${String(10000 + (id.seed % 89999))}${'ABCDEFGHJKL'[id.seed % 11]}${5 + (id.seed % 2)}26`, 16, 211); });
  area('warn', 530, 512, 300, 130, (w, h) => { c.fillStyle = '#f6f3e6'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2641a'; c.fillRect(0, 0, w, 36); c.strokeStyle = '#15171a'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3); c.fillStyle = '#15171a'; c.font = '900 24px Arial, sans-serif'; c.fillText('⚠ WARNING', 10, 27);
    c.font = '700 14px Arial, sans-serif'; ['ROTATING PROPELLER MAY CAUSE', 'SERIOUS INJURY. SHUT OFF ENGINE', 'WHEN NEAR SWIMMERS. DO NOT USE', 'LADDER WITH ENGINE RUNNING.'].forEach((t2, i) => c.fillText(t2, 10, 58 + i * 19)); });
  area('fuel', 840, 512, 90, 90, () => { c.fillStyle = '#c4161c'; c.beginPath(); c.arc(45, 45, 42, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '900 22px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('GAS', 45, 42); c.font = '700 10px Arial, sans-serif'; c.fillText('UNLEADED 89', 45, 58); c.textAlign = 'left'; });
  area('water', 930, 512, 90, 90, () => { c.fillStyle = '#1f5fbf'; c.beginPath(); c.arc(45, 45, 42, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '900 20px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('WATER', 45, 52); c.textAlign = 'left'; });
  area('battery', 840, 610, 180, 120, (w, h) => { c.fillStyle = '#15171a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f4f4f0'; c.font = '900 17px Arial, sans-serif'; c.fillText('BATTERY', 12, 24); c.font = '700 13px Arial, sans-serif'; c.fillText('OFF · 1 · ALL · 2', 12, 46); c.fillStyle = '#c4161c'; c.beginPath(); c.arc(120, 82, 30, 0, 7); c.fill(); c.fillStyle = '#f4f4f0'; c.fillRect(116, 54, 8, 30); });
  area('cowlfx', 0, 740, 600, 150, (w, h) => { // cowl side graphics: swept blades in the engine brand accent + spec line
    const acc = css(ob.accent), lt = cowlDark ? 'rgba(255,255,255,0.85)' : 'rgba(20,22,26,0.85)';
    for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? lt : acc; c.globalAlpha = k % 2 ? 0.5 : 1; c.beginPath(); c.moveTo(20 + k * 30, 110 - k * 4); c.quadraticCurveTo(260, 30 + k * 16, 590, 22 + k * 20); c.lineTo(590, 34 + k * 20); c.quadraticCurveTo(270, 46 + k * 16, 60 + k * 30, 118 - k * 4); c.closePath(); c.fill(); } c.globalAlpha = 1;
    c.fillStyle = lt; c.font = 'italic 800 24px "Helvetica Neue", Arial, sans-serif'; c.fillText(hpN >= 200 ? 'V6 · FOUR STROKE · DOHC' : hpN >= 40 ? 'FOUR STROKE · EFI' : 'FOUR STROKE', 250, 138); });
  area('tag', 0, 900, 600, 60, () => { c.fillStyle = ink; c.font = 'italic 600 34px Georgia, serif'; c.fillText(b.tag || '', 8, 42); });
  area('dealer', 610, 740, 400, 110, (w, h) => { const dn = r2.pick(['BAYSIDE MARINE', 'PALOMA BOAT WORKS', 'TERN KEY OUTFITTERS', 'CAUSEWAY MARINE CENTER', 'AMARO LAKESIDE BOATS', 'CASSIA HARBOR SALES']); c.fillStyle = id.dark ? '#f4f4f0' : '#15171a'; c.font = '800 30px "Helvetica Neue", Arial, sans-serif'; c.fillText(dn, 6, 40); c.font = '600 22px "Helvetica Neue", Arial, sans-serif'; c.fillText(`${r2.pick(['MIAMI', 'KEY PALOMA', 'PORT CASSIA', 'MIAMI BEACH'])}, FL · (305) 555-01${String(r2.int(10, 99))}`, 6, 78); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  return { texture: t, rects };
}

// ---------------------------------------------------------------- shared screen atlas (4 x 4 cells)
export const SCREEN = { chartA: 0, chartB: 1, sonar: 2, split: 3, engine: 4, radar: 5, tach: 6, speedo: 7, cluster: 8, switches: 9, vhf: 10, stereo: 11, compass: 12, pilot: 13, depth: 14, off: 15 };
export const screenRect = (i) => { const cx = i % 4, cy = (i / 4) | 0; return [cx / 4 + 0.004, 1 - (cy + 1) / 4 + 0.004, (cx + 1) / 4 - 0.004, 1 - cy / 4 - 0.004]; };
let SCREEN_TEX = null;
export function screenAtlas() {
  if (SCREEN_TEX) return SCREEN_TEX;
  const cv = canvasEl(1024, 1024), c = cv.getContext('2d'), r = rng(4242), Z = 256;
  const cell = (i, fn) => { c.save(); c.translate((i % 4) * Z, ((i / 4) | 0) * Z); c.beginPath(); c.rect(0, 0, Z, Z); c.clip(); fn(); c.restore(); };
  const chart = (zoom) => { c.fillStyle = '#9fc9e8'; c.fillRect(0, 0, Z, Z); // water
    c.fillStyle = '#cfe6f5'; for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(r() * Z, r() * Z, 30 + r() * 60 * zoom, 18 + r() * 40 * zoom, r() * 3, 0, 7); c.fill(); } // shallows
    c.fillStyle = '#e9dfa8'; c.strokeStyle = '#6a6a4a'; c.lineWidth = 1; for (let i = 0; i < 3; i++) { c.beginPath(); const x = r() * Z, y = r() * Z; for (let k = 0; k < 9; k++) { const a = (k / 9) * 7, rr = (22 + r() * 34) * zoom; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); } c.closePath(); c.fill(); c.stroke(); } // land
    c.fillStyle = '#35506a'; c.font = '9px sans-serif'; for (let i = 0; i < 26; i++) c.fillText(String((2 + r() * 28) | 0), r() * Z, r() * Z); // soundings
    c.strokeStyle = '#d0312d'; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(20, 230); c.lineTo(110, 150); c.lineTo(190, 60); c.stroke(); c.setLineDash([]); // route
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(128, 118); c.lineTo(136, 140); c.lineTo(128, 135); c.lineTo(120, 140); c.closePath(); c.fill(); // own ship
    c.fillStyle = 'rgba(12,18,26,0.82)'; c.fillRect(0, 0, Z, 26); c.fillStyle = '#e8f0f4'; c.font = 'bold 12px sans-serif'; c.fillText('SOG 24.6 kn', 6, 17); c.fillText('COG 187°', 100, 17); c.fillText('DPT 11.2 ft', 176, 17); };
  cell(0, () => chart(1)); cell(1, () => chart(1.8));
  const sonar = (x0 = 0, w = Z) => { const gr = c.createLinearGradient(0, 0, 0, Z); gr.addColorStop(0, '#061a3a'); gr.addColorStop(1, '#020812'); c.fillStyle = gr; c.fillRect(x0, 0, w, Z);
    c.fillStyle = '#c96a12'; c.beginPath(); c.moveTo(x0, Z); let y = 170; for (let x = 0; x <= w; x += 4) { y += (r() - 0.5) * 10; y = clamp(y, 130, 215); c.lineTo(x0 + x, y); } c.lineTo(x0 + w, Z); c.closePath(); c.fill();
    c.strokeStyle = '#f2d21a'; c.lineWidth = 2; for (let i = 0; i < 7; i++) { const x = x0 + r() * w, yy = 50 + r() * 90; c.beginPath(); c.arc(x, yy + 9, 9, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
    c.fillStyle = '#e8f0f4'; c.font = 'bold 22px sans-serif'; c.fillText('11.2', x0 + 8, 28); c.font = '10px sans-serif'; c.fillText('ft', x0 + 60, 28); };
  cell(2, () => sonar()); cell(3, () => { chart(1.2); sonar(128, 128); c.fillStyle = '#111'; c.fillRect(126, 0, 3, Z); });
  cell(4, () => { c.fillStyle = '#07090c'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#e8f0f4'; c.font = 'bold 13px sans-serif'; const rows = [['RPM', '4200'], ['FUEL', '18.4 gph'], ['TEMP', '164 F'], ['TRIM', '32%'], ['VOLT', '14.1'], ['HOURS', '612']]; rows.forEach((rw, i) => { const x = 14 + (i % 2) * 124, y = 40 + ((i / 2) | 0) * 72; c.fillStyle = '#7fd6e8'; c.font = '11px sans-serif'; c.fillText(rw[0], x, y); c.fillStyle = '#fff'; c.font = 'bold 26px sans-serif'; c.fillText(rw[1], x, y + 30); }); });
  cell(5, () => { c.fillStyle = '#020a06'; c.fillRect(0, 0, Z, Z); c.strokeStyle = '#1f7a3a'; for (const rr of [30, 60, 90, 120]) { c.beginPath(); c.arc(128, 128, rr, 0, 7); c.stroke(); } c.fillStyle = '#5cff7a'; for (let i = 0; i < 40; i++) { const a = r() * 7, d = 30 + r() * 90; c.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + r() * 6, 2 + r() * 3); } c.strokeStyle = '#9dffb0'; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 110, 128 - 50); c.stroke(); });
  const dial = (label, max, val, red) => { c.fillStyle = '#e9e6dc'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#0b0c0e'; c.beginPath(); c.arc(128, 128, 120, 0, 7); c.fill(); c.strokeStyle = '#f2f2ee'; c.fillStyle = '#f2f2ee'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i <= max; i++) { const a = Math.PI * 0.75 + (i / max) * Math.PI * 1.5; c.lineWidth = 4; c.strokeStyle = red != null && i >= red ? '#e0281e' : '#f2f2ee'; c.beginPath(); c.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); c.lineTo(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114); c.stroke(); c.fillText(String(i * (max > 8 ? 10 : 1)), 128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80); }
    c.font = 'bold 15px sans-serif'; c.fillText(label, 128, 180); const a = Math.PI * 0.75 + val * Math.PI * 1.5; c.strokeStyle = '#ff5a1f'; c.lineWidth = 6; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); c.stroke(); c.fillStyle = '#222'; c.beginPath(); c.arc(128, 128, 14, 0, 7); c.fill(); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; };
  cell(6, () => dial('RPM x1000', 7, 0.1, 6)); cell(7, () => dial('MPH', 8, 0.0, null));
  cell(8, () => { c.fillStyle = '#e9e6dc'; c.fillRect(0, 0, Z, Z); for (const [x, y, lb] of [[66, 66, 'FUEL'], [190, 66, 'TRIM'], [66, 190, 'VOLTS'], [190, 190, 'WATER']]) { c.fillStyle = '#0b0c0e'; c.beginPath(); c.arc(x, y, 56, 0, 7); c.fill(); c.strokeStyle = '#f2f2ee'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 44, Math.PI * 0.8, Math.PI * 2.2); c.stroke(); c.fillStyle = '#f2f2ee'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText(lb, x, y + 30); c.strokeStyle = '#ff5a1f'; c.lineWidth = 4; const a = Math.PI * (0.9 + r() * 1.1); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 40, y + Math.sin(a) * 40); c.stroke(); c.textAlign = 'left'; } });
  cell(9, () => { c.fillStyle = '#17191c'; c.fillRect(0, 0, Z, Z); const lb = ['NAV', 'ANC', 'BILGE', 'LIVE', 'WASH', 'COURT', 'ACC', 'HORN']; for (let i = 0; i < 8; i++) { const x = 18 + (i % 4) * 58, y = 40 + ((i / 4) | 0) * 110; c.fillStyle = '#2b2e33'; c.fillRect(x, y, 44, 70); c.fillStyle = i % 3 === 0 ? '#3ad1ff' : '#55595f'; c.fillRect(x + 6, y + 8, 32, 22); c.fillStyle = '#d9dde0'; c.font = 'bold 11px sans-serif'; c.fillText(lb[i], x + 4, y + 88); } });
  cell(10, () => { c.fillStyle = '#101214'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#ff8a1e'; c.fillRect(20, 40, 150, 80); c.fillStyle = '#1a1206'; c.font = 'bold 56px sans-serif'; c.fillText('16', 34, 100); c.font = 'bold 12px sans-serif'; c.fillText('DISTRESS', 104, 60); c.fillStyle = '#c4161c'; c.fillRect(190, 40, 46, 30); c.fillStyle = '#2b2e33'; for (let i = 0; i < 6; i++) c.fillRect(20 + (i % 3) * 52, 150 + ((i / 3) | 0) * 44, 40, 30); c.beginPath(); c.arc(212, 170, 26, 0, 7); c.fill(); });
  cell(11, () => { c.fillStyle = '#0c0d0f'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#12303a'; c.fillRect(16, 70, 224, 90); c.fillStyle = '#5fe3ff'; c.font = 'bold 20px sans-serif'; c.fillText('RADIO SOUTHLINE 98.3', 26, 106); c.font = '13px sans-serif'; c.fillText('BT  ·  VOL 18  ·  ZONE 2', 26, 138); c.fillStyle = '#2b2e33'; c.beginPath(); c.arc(128, 206, 26, 0, 7); c.fill(); });
  cell(12, () => { c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#16181b'; c.beginPath(); c.arc(128, 128, 118, 0, 7); c.fill(); c.strokeStyle = '#f2f2ee'; c.fillStyle = '#f2f2ee'; c.textAlign = 'center'; c.textBaseline = 'middle'; for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; c.lineWidth = i % 9 === 0 ? 4 : 1.5; c.beginPath(); c.moveTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); c.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); c.stroke(); } c.font = 'bold 30px serif'; [['N', 0], ['E', 1], ['S', 2], ['W', 3]].forEach(([t, k]) => { const a = -Math.PI / 2 + k * Math.PI / 2; c.fillStyle = t === 'N' ? '#ff5a1f' : '#f2f2ee'; c.fillText(t, 128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); }); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; });
  cell(13, () => { c.fillStyle = '#0a0c0f'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#e8f0f4'; c.font = 'bold 64px sans-serif'; c.fillText('187°', 40, 130); c.font = 'bold 16px sans-serif'; c.fillStyle = '#7fd6e8'; c.fillText('AUTO  ·  HDG HOLD', 44, 60); c.fillStyle = '#2b2e33'; c.fillRect(30, 170, 80, 50); c.fillRect(146, 170, 80, 50); c.fillStyle = '#e8f0f4'; c.fillText('-10', 52, 202); c.fillText('+10', 166, 202); });
  cell(14, () => { c.fillStyle = '#0a0c0f'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#9dffb0'; c.font = 'bold 96px sans-serif'; c.fillText('11.2', 20, 160); c.font = 'bold 20px sans-serif'; c.fillText('DEPTH ft', 24, 60); });
  cell(15, () => { c.fillStyle = '#050607'; c.fillRect(0, 0, Z, Z); c.fillStyle = '#1b1f24'; c.font = 'bold 22px sans-serif'; c.fillText('LUMENAV', 70, 136); });
  SCREEN_TEX = new THREE.CanvasTexture(cv); SCREEN_TEX.colorSpace = THREE.SRGBColorSpace; SCREEN_TEX.anisotropy = 8; SCREEN_TEX.needsUpdate = true;
  return SCREEN_TEX;
}
