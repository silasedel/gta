// SOUTHLINE: the logo lockup, drawn as original SVG (no copied logo). Heavy slanted wordmark set in the UI display
// font (var(--ps-cond), bundled), cream fill, thick plum outline, a dark offset extrude, a hot-pink brush swoosh and a
// soft pink glow. Above it: a striped sunset disc (yellow to pink) behind a black skyline and two palm silhouettes.
//   logoSVG({ variant: 'full' | 'line' | 'emblem' })  -> SVG markup that scales with its container's width
import { BRAND } from '../brand.js';
let uid = 0;
const INK = '#1a0b22', PLUM = '#3b0f46', EXTRUDE = '#22092b', PINK = '#ff2e8a';

// skyline: [x, width, height] on a base line; one spire tower
const TOWERS = [[318, 22, 38], [338, 18, 62], [356, 26, 48], [380, 20, 96], [398, 30, 74], [426, 16, 120], [440, 26, 88], [464, 22, 150], [484, 30, 112], [512, 18, 168], [528, 26, 104], [552, 20, 132], [570, 30, 84], [598, 18, 110], [614, 26, 66], [638, 22, 52], [658, 22, 34]];
function skyline(base) {
  let d = '';
  for (const [x, w, h] of TOWERS) d += `M${x} ${base}V${base - h}h${w}V${base}z`;
  d += `M519 ${base - 168}l2-26 2 26z`;                     // spire
  d += `M300 ${base}h400v7H300z`;                            // ground
  return `<path d="${d}" fill="${INK}"/>`;
}
function palm(x, base, s, flip) {
  const f = flip ? -1 : 1;
  const trunk = `M${x} ${base}C${x + 6 * f * s} ${base - 60 * s} ${x + 4 * f * s} ${base - 120 * s} ${x + 22 * f * s} ${base - 168 * s}l${7 * f * s} ${3 * s}C${x + 16 * f * s} ${base - 118 * s} ${x + 18 * f * s} ${base - 60 * s} ${x + 12 * f * s} ${base}z`;
  const tx = x + 25 * f * s, ty = base - 168 * s;
  const leaf = (ang, len, droop) => {
    const a = (ang * Math.PI) / 180, ex = tx + Math.cos(a) * len * s * f, ey = ty - Math.sin(a) * len * s + droop * s;
    const mx = tx + Math.cos(a) * len * 0.55 * s * f, my = ty - Math.sin(a) * len * 0.55 * s - 14 * s;
    return `M${tx} ${ty}Q${mx} ${my - 8 * s} ${ex} ${ey}Q${mx} ${my + 10 * s} ${tx} ${ty + 4 * s}z`;
  };
  const leaves = [[160, 80, 38], [130, 74, 26], [95, 60, 22], [60, 76, 26], [25, 84, 40], [-10, 70, 46], [190, 66, 44]].map((l) => leaf(...l)).join('');
  return `<path d="${trunk}${leaves}" fill="${INK}"/>`;
}
function sun(id, cx, cy, r) {
  const stripes = [0.06, 0.2, 0.33, 0.45, 0.56].map((t, i) => `<rect x="${cx - r - 2}" y="${cy + r * t}" width="${2 * r + 4}" height="${3 + i * 2.6}" fill="#000"/>`).join('');
  return `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff27d"/><stop offset=".38" stop-color="#ffc23a"/><stop offset=".68" stop-color="#ff7a59"/><stop offset="1" stop-color="#ff3d8b"/></linearGradient>
    <mask id="${id}m" maskUnits="userSpaceOnUse" x="${cx - r - 4}" y="${cy - r - 4}" width="${2 * r + 8}" height="${2 * r + 8}"><rect x="${cx - r - 4}" y="${cy - r - 4}" width="${2 * r + 8}" height="${2 * r + 8}" fill="#fff"/>${stripes}</mask>
    <radialGradient id="${id}h"><stop offset=".55" stop-color="#ff5fa8" stop-opacity=".55"/><stop offset="1" stop-color="#ff5fa8" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r * 1.28}" fill="url(#${id}h)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}s)" mask="url(#${id}m)"/>`;
}
function wordmark(id, cx, base, size, width) {
  const word = String(BRAND.line2 || BRAND.name).toUpperCase();
  const t = (extra) => `<text x="${cx}" y="${base}" text-anchor="middle" textLength="${width}" lengthAdjust="spacingAndGlyphs" style="font-family:var(--ps-cond,'Archivo Black'),'Archivo Black',sans-serif;font-weight:900;font-size:${size}px" ${extra}>${word}</text>`;
  let ext = '';
  for (let i = 9; i >= 1; i--) ext += `<g transform="translate(${i * 1.5} ${i * 1.7})">${t(`fill="${EXTRUDE}" stroke="${EXTRUDE}" stroke-width="20" stroke-linejoin="round"`)}</g>`;
  // brush swoosh under the word (rough edge from a turbulence displacement)
  const sw = `M${cx - width * 0.5} ${base + 30}C${cx - width * 0.2} ${base + 8} ${cx + width * 0.22} ${base + 4} ${cx + width * 0.54} ${base - 6}C${cx + width * 0.26} ${base + 22} ${cx - width * 0.1} ${base + 40} ${cx - width * 0.46} ${base + 58}z`;
  return `<defs><linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#ffeedd"/><stop offset="1" stop-color="#ffd2c4"/></linearGradient>
      <filter id="${id}b" x="-5%" y="-40%" width="110%" height="180%"><feTurbulence type="fractalNoise" baseFrequency=".9 .08" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
      <filter id="${id}g" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="16"/></filter></defs>
    <g transform="translate(${cx} ${base}) skewX(-11) translate(${-cx} ${-base})">
      <g class="ps-logo-glow" filter="url(#${id}g)" opacity=".75">${t(`fill="#ff4fa3" stroke="#ff4fa3" stroke-width="26"`)}</g>
      ${ext}
      <path d="${sw}" fill="${PINK}" filter="url(#${id}b)"/>
      ${t(`fill="none" stroke="${PLUM}" stroke-width="20" stroke-linejoin="round"`)}
      ${t(`fill="url(#${id}c)"`)}
    </g>`;
}

export function logoSVG(opts = {}) {
  const { variant = 'full', title = BRAND.name } = opts;
  const id = 'pslogo' + (++uid);
  if (variant === 'emblem') {
    return `<svg class="ps-logo ps-logo-emblem" viewBox="300 0 400 320" role="img" aria-label="${title}" fill="none">${sun(id, 500, 175, 150)}${palm(318, 306, 0.9, false)}${palm(682, 306, 0.9, true)}${skyline(306)}</svg>`;
  }
  if (variant === 'line') {
    return `<svg class="ps-logo ps-logo-line" viewBox="40 40 920 200" role="img" aria-label="${title}" fill="none">${wordmark(id, 500, 180, 170, 860)}</svg>`;
  }
  return `<svg class="ps-logo ps-logo-full" viewBox="40 -30 920 560" role="img" aria-label="${title}" fill="none">
    ${sun(id, 500, 160, 140)}${palm(312, 296, 0.95, false)}${palm(688, 296, 0.95, true)}${skyline(296)}
    ${wordmark(id, 500, 452, 172, 860)}</svg>`;
}
/** Element helper. */
export function logoEl(opts = {}) { const d = document.createElement('div'); d.className = 'ps-logo-wrap' + (opts.class ? ' ' + opts.class : ''); d.innerHTML = logoSVG(opts); return d; }
