// KEYS-SIGN track: all sign lettering is drawn in code from one set of stroke skeletons (no font files, so every
// browser and the desktop app render the same letters).
//  - drawFHWA(): US highway-sign lettering in the public FHWA "Standard Alphabets" manner: monoline strokes, flat cut
//    terminals, wide round bowls, series B/C/D/E/E-Modified by width and weight.
//  - drawPen(): sign-painter lettering: the same skeletons swept by a flat brush (broad nib), which gives real thick/thin
//    stress. With `serif` it becomes a chunky carved Roman (slab serifs, beaks, ball terminals); with `slant` and
//    `bounce` it becomes one-stroke casual brush lettering.
// Glyph units: 100 = cap height, baseline y = 0 (y up), x-height 72, descender -28. Skeletons are centerlines drawn
// for a nominal half stroke of 9; yRemap() moves them so any weight still touches the baseline and cap line exactly.
import { rng, clamp } from './util.js';

// [left class, right class, ink width, strokes]   classes: s straight, r round, o open/diagonal
// stroke commands: M x y | L x y | Q cx cy x y | C x1 y1 x2 y2 x y | E cx cy rx ry a0 a1 (ellipse arc, degrees, y up)
// '^a b' at the end of a stroke clips it to a..b vertically (flat cuts on diagonals); strokes are separated by '|'
const G = {
  A: ['o', 'o', 84, 'M3 -9 L42 111 L81 -9 ^0 100|M21 29 L63 29'],
  B: ['s', 'r', 76, 'M9 0 L9 100|M9 91 L42 91 E42 70.5 21 20.5 90 -90 L9 50|M42 50 E44 29.5 23 20.5 90 -90 L9 9'],
  C: ['r', 'o', 73, 'E42 50 33 41 52 308'],
  D: ['s', 'r', 78, 'M9 0 L9 100|M9 91 L36 91 E36 50 33 41 90 -90 L9 9'],
  E: ['s', 'o', 66, 'M9 0 L9 100|M9 91 L66 91|M9 52 L56 52|M9 9 L66 9'],
  F: ['s', 'o', 64, 'M9 0 L9 100|M9 91 L64 91|M9 52 L54 52'],
  G: ['r', 's', 79, 'E42 50 33 41 52 322|M46 46 L70 46 L70 18'],
  H: ['s', 's', 76, 'M9 0 L9 100|M67 0 L67 100|M9 52 L67 52'],
  I: ['s', 's', 18, 'M9 0 L9 100'],
  J: ['o', 's', 60, 'M51 100 L51 30 E28 30 23 21 0 -155'],
  K: ['s', 'o', 76, 'M9 0 L9 100|M74 106 L9 38 ^0 100|M32 62 L77 -6 ^0 100'],
  L: ['s', 'o', 62, 'M9 100 L9 9 L62 9'],
  M: ['s', 's', 92, 'M9 0 L9 100|M83 0 L83 100|M9 112 L46 28 L83 112 ^0 100'],
  N: ['s', 's', 78, 'M9 0 L9 100|M69 0 L69 100|M7 108 L71 -8 ^0 100'],
  O: ['r', 'r', 84, 'E42 50 33 41 0 360'],
  P: ['s', 'r', 71, 'M9 0 L9 100|M9 91 L40 91 E40 68.5 22 22.5 90 -90 L9 46'],
  Q: ['r', 'r', 84, 'E42 50 33 41 0 360|M50 26 L80 -8 ^-4 100'],
  R: ['s', 'o', 75, 'M9 0 L9 100|M9 91 L42 91 E42 69.5 22 21.5 90 -90 L9 48|M40 48 L72 -6 ^0 100'],
  S: ['r', 'r', 74, 'E37 71.5 26 19.5 38 270 E37 30.5 28 21.5 90 -142'],
  T: ['o', 'o', 70, 'M35 0 L35 100|M0 91 L70 91'],
  U: ['s', 's', 76, 'M9 100 L9 36 E38 36 29 27 180 360 L67 100'],
  V: ['o', 'o', 80, 'M2 110 L40 -10 L78 110 ^0 100'],
  W: ['o', 'o', 112, 'M2 110 L30 -10 L56 110 L82 -10 L110 110 ^0 100'],
  X: ['o', 'o', 78, 'M3 -6 L75 106 ^0 100|M3 106 L75 -6 ^0 100'],
  Y: ['o', 'o', 78, 'M0 110 L39 46 L78 110 ^0 100|M39 48 L39 0'],
  Z: ['o', 'o', 70, 'M3 91 L66 91 L4 9 L67 9'],
  a: ['r', 's', 64, 'M55 0 L55 45 E32 45 23 18 0 152|M55 37 L30 37 E30 23 21 14 90 270 L55 9'],
  b: ['s', 'r', 70, 'M9 0 L9 100|E35 36 26 27 0 360'],
  c: ['r', 'o', 58, 'E33 36 24 27 50 310'],
  d: ['r', 's', 70, 'E35 36 26 27 0 360|M61 0 L61 100'],
  e: ['r', 'r', 66, 'M9 37 L65 37|E33 36 24 27 0 318'],
  f: ['o', 'o', 46, 'M18 0 L18 76 E38 76 20 15 180 62|M0 63 L40 63'],
  g: ['r', 's', 68, 'E33 36 24 27 0 360|M57 72 L57 -6 E33 -6 24 13 0 -150'],
  h: ['s', 's', 66, 'M9 0 L9 100|M9 44 E33 44 24 19 180 0 L57 0'],
  i: ['s', 's', 18, 'M9 0 L9 72|M9 84 L9 100'],
  j: ['o', 's', 34, 'M25 72 L25 -6 E7 -6 18 13 0 -115|M25 84 L25 100'],
  k: ['s', 'o', 64, 'M9 0 L9 100|M62 80 L9 26 ^0 72|M28 46 L64 -6 ^0 72'],
  l: ['s', 'o', 32, 'M9 100 L9 20 E24 20 15 11 180 285'],
  m: ['s', 's', 102, 'M9 0 L9 72|M9 46 E30 46 21 17 180 0 L51 0|M51 46 E72 46 21 17 180 0 L93 0'],
  n: ['s', 's', 66, 'M9 0 L9 72|M9 44 E33 44 24 19 180 0 L57 0'],
  o: ['r', 'r', 66, 'E33 36 24 27 0 360'],
  p: ['s', 'r', 70, 'M9 72 L9 -28|E35 36 26 27 0 360'],
  q: ['r', 's', 70, 'E35 36 26 27 0 360|M61 72 L61 -28'],
  r: ['s', 'o', 46, 'M9 0 L9 72|M9 42 E31 42 22 21 180 55'],
  s: ['r', 'r', 59, 'E30 50.5 20 12.5 38 270 E30 23.5 21 14.5 90 -142'],
  t: ['o', 'o', 44, 'M18 94 L18 20 E33 20 15 11 180 285|M0 63 L42 63'],
  u: ['s', 's', 66, 'M9 72 L9 28 E33 28 24 19 180 360|M57 72 L57 0'],
  v: ['o', 'o', 64, 'M2 80 L32 -8 L62 80 ^0 72'],
  w: ['o', 'o', 96, 'M2 80 L26 -8 L48 80 L70 -8 L94 80 ^0 72'],
  x: ['o', 'o', 64, 'M3 -5 L61 77 ^0 72|M3 77 L61 -5 ^0 72'],
  y: ['o', 'o', 64, 'M2 80 L34 -4 ^-28 72|M62 80 L20 -36 ^-28 72'],
  z: ['o', 'o', 58, 'M3 63 L54 63 L4 9 L55 9'],
  0: ['r', 'r', 72, 'E36 50 27 41 0 360'],
  1: ['o', 's', 38, 'M29 0 L29 100|M29 104 L5 78 ^0 100'],
  2: ['r', 'o', 70, 'E35 68 26 23 160 -42 L6 9 L68 9'],
  3: ['r', 'r', 70, 'E34 71.5 25 19.5 150 -90 E34 30.5 27 21.5 90 -150'],
  4: ['o', 's', 76, 'M56 108 L5 30 L76 30 ^0 100|M56 0 L56 100'],
  5: ['s', 'r', 70, 'M62 91 L15 91 L12 49 E34 33 27 24 140 -150'],
  6: ['r', 'r', 70, 'E35 32 26 23 0 360|M9 32 L9 55 E36 55 27 36 180 38'],
  7: ['o', 'o', 68, 'M2 91 L64 91 L24 -6 ^0 100'],
  8: ['r', 'r', 70, 'E35 72.5 22 18.5 0 360|E35 31.5 26 22.5 0 360'],
  9: ['r', 'r', 70, 'E35 68 26 23 0 360|M61 68 L61 45 E34 45 27 36 0 -142'],
  '-': ['o', 'o', 36, 'M3 45 L33 45'],
  '.': ['s', 's', 18, 'M9 0 L9 17'],
  ',': ['s', 's', 20, 'M11 17 L11 4 L4 -14'],
  "'": ['s', 's', 18, 'M9 100 L9 70'],
  '"': ['s', 's', 42, 'M9 100 L9 70|M33 100 L33 70'],
  '/': ['o', 'o', 50, 'M2 -8 L48 108 ^0 100'],
  ':': ['s', 's', 18, 'M9 0 L9 17|M9 50 L9 67'],
  '!': ['s', 's', 18, 'M9 100 L9 30|M9 0 L9 16'],
  '?': ['r', 'r', 60, 'E30 74 21 17 170 -60 L30 44 L30 30|M30 0 L30 16'],
  '(': ['r', 'o', 34, 'E44 45 35 62 125 235'],
  ')': ['o', 'r', 34, 'E-10 45 35 62 55 -55'],
  '&': ['r', 'o', 84, 'M78 -6 L27 62 E39 78 14 13 205 -25 L14 36 E36 26 26 17 150 392 L74 52 ^0 100'],
  '+': ['o', 'o', 64, 'M32 18 L32 82|M2 50 L62 50'],
  '$': ['r', 'r', 74, 'E37 71.5 26 19.5 38 270 E37 30.5 28 21.5 90 -142|M37 -10 L37 110'],
  '#': ['o', 'o', 76, 'M24 6 L32 94|M48 6 L56 94|M4 66 L74 66|M2 34 L72 34'],
  '·': ['s', 's', 22, 'M11 40 L11 58'],
  '°': ['r', 'r', 34, 'E17 82 9 9 0 360'],
};
const SPACE_W = 46;
const CACHE = new Map();

function arcToCubics(out, cx, cy, rx, ry, a0, a1) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), d = ((a1 - a0) / n) * Math.PI / 180, k = (4 / 3) * Math.tan(d / 4);
  let a = a0 * Math.PI / 180;
  const sx = cx + rx * Math.cos(a), sy = cy + ry * Math.sin(a);
  out.push(out.length ? ['L', sx, sy] : ['M', sx, sy]);
  for (let i = 0; i < n; i++) {
    const b = a + d, c0 = Math.cos(a), s0 = Math.sin(a), c1 = Math.cos(b), s1 = Math.sin(b);
    out.push(['C', cx + rx * (c0 - k * s0), cy + ry * (s0 + k * c0), cx + rx * (c1 + k * s1), cy + ry * (s1 - k * c1), cx + rx * c1, cy + ry * s1]);
    a = b;
  }
}
function parseGlyph(ch) {
  let g = CACHE.get(ch); if (g) return g;
  const def = G[ch]; if (!def) return null;
  const strokes = [];
  for (let s of def[3].split('|')) {
    let clip = null; const ci = s.indexOf('^');
    if (ci >= 0) { clip = s.slice(ci + 1).trim().split(/\s+/).map(Number); s = s.slice(0, ci); }
    const cmds = [], re = /([MLQCE])([^MLQCE]*)/g; let m;
    while ((m = re.exec(s))) {
      const a = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (m[1] === 'E') arcToCubics(cmds, ...a); else cmds.push([m[1], ...a]);
    }
    // flatten to a polyline with ~1.5 unit steps (for pen sweeps and serif detection)
    const pts = []; let px = 0, py = 0;
    for (const c of cmds) {
      if (c[0] === 'M') { px = c[1]; py = c[2]; pts.push([px, py]); }
      else if (c[0] === 'L') { const L = Math.hypot(c[1] - px, c[2] - py), n = Math.max(1, Math.ceil(L / 1.5)); for (let i = 1; i <= n; i++) pts.push([px + (c[1] - px) * i / n, py + (c[2] - py) * i / n]); px = c[1]; py = c[2]; }
      else if (c[0] === 'Q') { for (let i = 1; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push([u * u * px + 2 * u * t * c[1] + t * t * c[3], u * u * py + 2 * u * t * c[2] + t * t * c[4]]); } px = c[3]; py = c[4]; }
      else if (c[0] === 'C') { for (let i = 1; i <= 28; i++) { const t = i / 28, u = 1 - t; pts.push([u * u * u * px + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5], u * u * u * py + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6]]); } px = c[5]; py = c[6]; }
    }
    const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5;
    strokes.push({ cmds, clip, pts, closed });
  }
  const lower = ch >= 'a' && ch <= 'z';
  g = { l: def[0], r: def[1], w: def[2], strokes, lower, ch };
  CACHE.set(ch, g); return g;
}

// vertical remap so a stroke of half-thickness hh (glyph units) still touches the guide lines exactly
function yRemap(y, hh, lower) {
  const A = lower
    ? [[-28, -28], [-19, -28 + hh], [0, 0], [9, hh], [63, 72 - hh], [72, 72], [91, 100 - hh], [100, 100]]
    : [[-28, -28], [0, 0], [9, hh], [91, 100 - hh], [100, 100]];
  if (y <= A[0][0]) return y; if (y >= 100) return y;
  for (let i = 1; i < A.length; i++) if (y <= A[i][0]) { const [a0, b0] = A[i - 1], [a1, b1] = A[i]; return b0 + (b1 - b0) * (y - a0) / (a1 - a0); }
  return y;
}

const GAP = { ss: 1, sr: 0.84, rs: 0.84, rr: 0.7, so: 0.62, os: 0.62, ro: 0.58, or: 0.58, oo: 0.42 };
const KERN = { AV: -10, VA: -10, AT: -9, TA: -9, AY: -10, YA: -10, AW: -7, WA: -7, LT: -9, LY: -9, LV: -8, To: -8, Ta: -8, Te: -8, Tr: -5, Ty: -5, Yo: -8, Ya: -8, Ye: -8, Vo: -5, Va: -5, Ve: -5, Wa: -4, We: -4, Wo: -4, FA: -7, PA: -7, Ke: -3, Ko: -3, ry: -2, rt: 2, '11': 4, 'r.': -6, 'y.': -6, 'T.': -8 };

// decompose accented letters: returns [base, markType|null]
function splitAccent(ch) {
  const n = ch.normalize('NFD');
  if (n.length === 2) { const m = n.charCodeAt(1); return [n[0], m === 0x303 ? 'tilde' : m === 0x301 ? 'acute' : m === 0x308 ? 'dier' : m === 0x300 ? 'grave' : null]; }
  return [ch, null];
}

// lay text out: returns { items: [{ g, x (glyph units, left ink edge), mark }], width (glyph units) }
export function layoutText(text, { xs = 1, gap = 20, kern = true } = {}) {
  const items = []; let x = 0, prev = null, prevCh = '';
  for (const raw of String(text)) {
    if (raw === ' ') { x += SPACE_W * xs + gap * 0.3; prev = null; prevCh = ' '; continue; }
    const [base, mark] = splitAccent(raw);
    const g = parseGlyph(base) || parseGlyph(base.toUpperCase()) || parseGlyph('-');
    if (prev) x += gap * (GAP[prev.r + g.l] ?? 1) + (kern ? (KERN[prevCh + base] || 0) * xs : 0);
    items.push({ g, x, mark });
    x += g.w * xs; prev = g; prevCh = base;
  }
  return { items, width: x };
}

// ---------------------------------------------------------------- FHWA-style highway lettering
// xs = width scale of the skeleton, wt = stroke width (fraction of cap height), gap = letter spacing (glyph units)
export const SERIES = {
  B: { xs: 0.6, wt: 0.122, gap: 15 },
  C: { xs: 0.72, wt: 0.14, gap: 17 },
  D: { xs: 0.85, wt: 0.153, gap: 19 },
  E: { xs: 0.97, wt: 0.168, gap: 21 },
  EM: { xs: 1.0, wt: 0.19, gap: 22 }, // E Modified: the mixed-case guide-sign alphabet
  F: { xs: 1.12, wt: 0.172, gap: 23 },
};
export function measureFHWA(text, capH, series = 'EM', tracking = 1) {
  const S = typeof series === 'string' ? SERIES[series] : series;
  return layoutText(text, { xs: S.xs, gap: S.gap * tracking }).width * capH / 100;
}
function traceStroke(ctx, st, ox, oy, k, xs, hh, lower) {
  ctx.beginPath();
  for (const c of st.cmds) {
    if (c[0] === 'M') ctx.moveTo(ox + c[1] * xs * k, oy - yRemap(c[2], hh, lower) * k);
    else if (c[0] === 'L') ctx.lineTo(ox + c[1] * xs * k, oy - yRemap(c[2], hh, lower) * k);
    else if (c[0] === 'Q') ctx.quadraticCurveTo(ox + c[1] * xs * k, oy - yRemap(c[2], hh, lower) * k, ox + c[3] * xs * k, oy - yRemap(c[4], hh, lower) * k);
    else ctx.bezierCurveTo(ox + c[1] * xs * k, oy - yRemap(c[2], hh, lower) * k, ox + c[3] * xs * k, oy - yRemap(c[4], hh, lower) * k, ox + c[5] * xs * k, oy - yRemap(c[6], hh, lower) * k);
  }
  if (st.closed) ctx.closePath();
}
function drawMark(ctx, mark, cx, topY, k, lw) {
  ctx.lineWidth = lw * 0.8; ctx.beginPath();
  const y = topY - 14 * k;
  if (mark === 'tilde') { ctx.moveTo(cx - 20 * k, y + 3 * k); ctx.bezierCurveTo(cx - 10 * k, y - 12 * k, cx + 8 * k, y + 12 * k, cx + 20 * k, y - 4 * k); }
  else if (mark === 'acute') { ctx.moveTo(cx - 6 * k, y + 7 * k); ctx.lineTo(cx + 10 * k, y - 9 * k); }
  else if (mark === 'grave') { ctx.moveTo(cx + 6 * k, y + 7 * k); ctx.lineTo(cx - 10 * k, y - 9 * k); }
  else if (mark === 'dier') { ctx.moveTo(cx - 14 * k, y - 4 * k); ctx.lineTo(cx - 14 * k, y + 6 * k); ctx.moveTo(cx + 14 * k, y - 4 * k); ctx.lineTo(cx + 14 * k, y + 6 * k); }
  ctx.stroke();
}
// Draws text with its baseline at y. align: 'left' | 'center' | 'right'. Returns the drawn width in canvas units.
export function drawFHWA(ctx, text, x, y, capH, { series = 'EM', color = '#fff', align = 'left', tracking = 1, weight = 1 } = {}) {
  const S = typeof series === 'string' ? SERIES[series] : series, k = capH / 100;
  const lay = layoutText(text, { xs: S.xs, gap: S.gap * tracking }), W = lay.width * k;
  const x0 = align === 'center' ? x - W / 2 : align === 'right' ? x - W : x;
  const lw = S.wt * capH * weight, hh = S.wt * 50 * weight;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 4;
  for (const it of lay.items) {
    const ox = x0 + it.x * k, g = it.g;
    for (const st of g.strokes) {
      const clip = st.clip;
      if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(ox - capH, y - clip[1] * k, capH * 3 + g.w * k, (clip[1] - clip[0]) * k); ctx.clip(); }
      traceStroke(ctx, st, ox, y, k, S.xs, hh, g.lower); ctx.lineWidth = lw; ctx.stroke();
      if (clip) ctx.restore();
    }
    if (it.mark) drawMark(ctx, it.mark, ox + g.w * S.xs * k / 2, y - (g.lower ? 72 : 100) * k, k, lw);
  }
  ctx.restore();
  return W;
}

// ---------------------------------------------------------------- sign-painter lettering (flat brush / broad nib)
// style: { xs, gap, slant (tan of the lean), pen: { a (nib length, fraction of cap height), b (nib thickness), theta (rad) },
//          serif: { len, thick } | null, ball (terminal dot radius, fraction of cap height), bounce (baseline jitter, fraction),
//          tilt (per-letter rotation jitter, rad), swell (0..1 pressure swell mid-stroke), seed }
export const PEN_STYLES = {
  // chunky carved Roman with slab serifs: the gold-leaf title face
  roman: { xs: 1.0, gap: 27, slant: 0, pen: { a: 0.215, b: 0.075, theta: 0.2 }, serif: { len: 0.085, thick: 0.07 }, ball: 0.07, bounce: 0, tilt: 0, swell: 0 },
  // narrower Roman for sub-lines and ribbons
  romanCond: { xs: 0.82, gap: 25, slant: 0, pen: { a: 0.17, b: 0.07, theta: 0.2 }, serif: { len: 0.07, thick: 0.06 }, ball: 0.055, bounce: 0, tilt: 0, swell: 0 },
  // one-stroke casual: leaning flat-brush lettering every sign painter learns first
  casual: { xs: 0.9, gap: 13, slant: 0.2, pen: { a: 0.17, b: 0.085, theta: 0.6 }, serif: null, ball: 0, bounce: 0.03, tilt: 0.03, swell: 0.18 },
  // upright block gothic done with a brush (round ends, even weight)
  block: { xs: 0.9, gap: 16, slant: 0, pen: { a: 0.17, b: 0.15, theta: 0.3 }, serif: null, ball: 0, bounce: 0.012, tilt: 0.012, swell: 0.06 },
  // thin liner-brush script-ish caps for small notes
  liner: { xs: 0.86, gap: 16, slant: 0.14, pen: { a: 0.085, b: 0.06, theta: 0.7 }, serif: null, ball: 0, bounce: 0.02, tilt: 0.02, swell: 0.1 },
};
export function measurePen(text, capH, style = 'roman', tracking = 1) {
  const S = typeof style === 'string' ? PEN_STYLES[style] : style;
  return layoutText(text, { xs: S.xs, gap: S.gap * tracking }).width * capH / 100;
}
// Builds one Path2D with the whole text (fill it with 'nonzero'). grow (canvas units) fattens every stroke: use it for
// outlines, shadows and the carved "island" under a letter. Returns { path, width, x0 }.
export function penPath(text, x, y, capH, { style = 'roman', align = 'left', tracking = 1, grow = 0, arc = null } = {}) {
  const S = typeof style === 'string' ? PEN_STYLES[style] : style, k = capH / 100;
  const lay = layoutText(text, { xs: S.xs, gap: S.gap * tracking }), W = lay.width * k;
  const x0 = align === 'center' ? x - W / 2 : align === 'right' ? x - W : x;
  const R = rng((S.seed || 7) + text.length * 131 + text.charCodeAt(0));
  const path = new Path2D();
  const a = S.pen.a * capH / 2 + grow, b = S.pen.b * capH / 2 + grow, th = -S.pen.theta; // canvas y is down
  const cth = Math.cos(S.pen.theta), sth = Math.sin(S.pen.theta);
  const hh = (S.pen.a * Math.abs(sth) * 50 + S.pen.b * 50) * 0.92; // half thickness of a horizontal stroke, glyph units
  const stemHalf = (S.pen.a * Math.abs(cth) / 2 + S.pen.b * 0.25) * capH; // half width of a vertical stem, canvas units
  // optional arc baseline: { cx, cy, r, dir (+1 text reads over the top of the circle, -1 under it) }; x measures arc length
  const place = (px, py) => {
    if (!arc) return [px, py];
    const s = px - x, ang = (arc.dir >= 0 ? -Math.PI / 2 : Math.PI / 2) + (arc.dir >= 0 ? 1 : -1) * s / arc.r, rr = arc.r + (arc.dir >= 0 ? 1 : -1) * (y - py);
    return [arc.cx + Math.cos(ang) * rr, arc.cy + Math.sin(ang) * rr];
  };
  const rot = (px) => (arc ? (arc.dir >= 0 ? 1 : -1) * (px - x) / arc.r : 0);
  for (const it of lay.items) {
    const g = it.g, ox = x0 + it.x * k, by = y + (S.bounce ? R.gauss() * S.bounce * capH : 0), tl = S.tilt ? R.gauss() * S.tilt : 0;
    const gcx = ox + g.w * S.xs * k / 2, ct = Math.cos(tl), st = Math.sin(tl);
    const P = (gx, gy) => { // glyph units -> canvas, with slant, tilt and optional arc
      const yy = yRemap(gy, hh, g.lower) * k; let px = ox + gx * S.xs * k + S.slant * yy, py = by - yy;
      if (tl) { const dx = px - gcx, dy = py - (by - 36 * k); px = gcx + dx * ct - dy * st; py = by - 36 * k + dx * st + dy * ct; }
      return place(px, py);
    };
    const lrot = rot(gcx);
    const ends = []; // free terminals for serifs
    for (const s of g.strokes) {
      const n = s.pts.length, clip = s.clip;
      for (let i = 0; i < n; i++) {
        let [gx, gy] = s.pts[i];
        if (clip && (gy < clip[0] || gy > clip[1])) continue;
        const t = n > 1 ? i / (n - 1) : 0.5, sw = S.swell ? 1 - S.swell + S.swell * Math.sin(Math.PI * clamp(t * 1.15 - 0.05)) * 1.6 : 1;
        const [px, py] = P(gx, gy);
        path.moveTo(px + a * sw, py); // avoid a connecting line between stamps
        path.ellipse(px, py, Math.max(0.3, a * sw), Math.max(0.3, b * (0.8 + 0.2 * sw)), th + lrot + tl, 0, Math.PI * 2);
      }
      if (!s.closed && n > 2) {
        // terminals: first and last usable points with their outward tangents (glyph units)
        const first = clip ? s.pts.findIndex((p) => p[1] >= clip[0] && p[1] <= clip[1]) : 0;
        let last = n - 1; if (clip) { while (last > 0 && (s.pts[last][1] < clip[0] || s.pts[last][1] > clip[1])) last--; }
        if (first >= 0 && last > first + 1) {
          const f2 = s.pts[Math.min(n - 1, first + 3)], l2 = s.pts[Math.max(0, last - 3)];
          ends.push({ p: s.pts[first], t: [s.pts[first][0] - f2[0], s.pts[first][1] - f2[1]], s });
          ends.push({ p: s.pts[last], t: [s.pts[last][0] - l2[0], s.pts[last][1] - l2[1]], s });
        }
      }
    }
    if ((S.serif || S.ball) && /[A-Za-z0-9]/.test(g.ch)) {
      const sl = (S.serif?.len || 0) * capH, sth2 = (S.serif?.thick || 0) * capH, hk = hh * k;
      for (const e of ends) {
        if (e.s.pts.length < 16) continue; // dots
        const [ex, ey] = e.p, tl2 = Math.hypot(e.t[0], e.t[1]) || 1, tx = e.t[0] / tl2, ty = e.t[1] / tl2;
        // a terminal that lands on another stroke (or back on its own stroke) is a join, not a free end
        let free = true;
        for (const s2 of g.strokes) {
          const self = s2 === e.s, ei = self ? s2.pts.indexOf(e.p) : -1;
          for (let i = 0; i < s2.pts.length; i += 2) { if (self && Math.abs(i - ei) < 18) continue; const q = s2.pts[i]; if (Math.abs(q[0] - ex) < 11 && Math.abs(q[1] - ey) < 11) { free = false; break; } }
          if (!free) break;
        }
        const onLine = [0, 100, 72, -28].find((L) => Math.abs(ey - L) < 2.5);
        if (S.serif && Math.abs(ty) > 0.5 && onLine !== undefined && (free || Math.abs(ty) > 0.97)) {
          // bracketed slab serif sitting on the guide line
          const foot = ty < 0; // the stroke ends going down => serif at its foot
          const [cx, cy] = P(ex, onLine);
          const hw = stemHalf * (Math.abs(ty) > 0.97 ? 1 : 0.8), L = sl, T = sth2 + grow;
          const r = lrot + tl, cr = Math.cos(r), sr = Math.sin(r);
          const loc = (lx, ly) => [cx + lx * cr - ly * sr, cy + lx * sr + ly * cr];
          const sgn = foot ? -1 : 1; // canvas y direction from the guide line into the letter
          const y0 = -sgn * grow, y1 = sgn * T, y2 = sgn * (T + L * 0.95);
          const headLower = g.lower && !foot; // heads of lowercase stems carry a flag to the left only
          const Ll = L + grow, Lr = headLower ? grow * 0.5 : L + grow;
          let q = loc(-hw - Ll, y0); path.moveTo(q[0], q[1]);
          q = loc(hw + Lr, y0); path.lineTo(q[0], q[1]);
          q = loc(hw + Lr, y1); path.lineTo(q[0], q[1]);
          let c1 = loc(hw, y1), q2 = loc(hw, y2); path.quadraticCurveTo(c1[0], c1[1], q2[0], q2[1]);
          q = loc(-hw, y2); path.lineTo(q[0], q[1]);
          c1 = loc(-hw, y1); q2 = loc(-hw - Ll, y1); path.quadraticCurveTo(c1[0], c1[1], q2[0], q2[1]);
          path.closePath();
        } else if (S.serif && free && Math.abs(tx) > 0.92 && !g.lower && ey > 5) {
          // beak on a free horizontal bar end (E, F, T, Z, L, 2, 5, 7)
          const [cx, cy] = P(ex, ey), d = tx > 0 ? 1 : -1, bh = ey > 80 ? 1 : ey < 20 ? -1 : 0;
          const big = capH * (bh === 0 ? 0.1 : 0.19) + grow, flush = hk + grow;
          const yTop = bh > 0 ? -flush : -big, yBot = bh < 0 ? flush : big;
          path.moveTo(cx - d * capH * 0.09, cy - hk); path.lineTo(cx + d * (capH * 0.012 + grow), cy + yTop);
          path.lineTo(cx + d * (capH * 0.04 + grow), cy + yBot); path.lineTo(cx - d * capH * 0.09, cy + hk); path.closePath();
        } else if (S.ball && free && Math.abs(tx) < 0.92 && Math.abs(ty) < 0.97 && onLine === undefined) {
          const [cx, cy] = P(ex - tx * 4, ey - ty * 4), r = S.ball * capH + grow;
          path.moveTo(cx + r, cy); path.arc(cx, cy, r, 0, Math.PI * 2);
        }
      }
    }
    if (it.mark) {
      const [mx, my] = P(g.w / 2, (g.lower ? 72 : 100) + 16), r = b * 1.1 + grow * 0.5;
      if (it.mark === 'tilde') for (let i = -10; i <= 10; i++) { const px = mx + i * 2 * k, py = my + Math.sin(i / 10 * Math.PI) * 5 * k; path.moveTo(px + r, py); path.arc(px, py, r, 0, 6.3); }
      else for (let i = -4; i <= 4; i++) { const px = mx + i * 1.6 * k * (it.mark === 'grave' ? -1 : 1), py = my - i * 1.6 * k; path.moveTo(px + r, py); path.arc(px, py, r, 0, 6.3); }
    }
  }
  return { path, width: W, x0 };
}
export function drawPen(ctx, text, x, y, capH, opts = {}) {
  const r = penPath(text, x, y, capH, opts);
  ctx.save(); ctx.fillStyle = opts.color || '#000'; ctx.fill(r.path, 'nonzero'); ctx.restore();
  return r.width;
}
export const hasGlyph = (ch) => !!G[splitAccent(ch)[0]];
