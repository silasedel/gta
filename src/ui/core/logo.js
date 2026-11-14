// PORT SOLANA: the wordmark and emblem, drawn as original SVG letterforms (no font involved).
// Construction: heavy geometric deco capitals with a see-through inline cut down every stroke; the O of SOLANA is the
// "tide sun", a coral disc sinking into three wave bands. Cap height 100 units, stroke 19.
//   logoSVG({ variant: 'full' | 'line' | 'emblem', caption: true })  -> SVG markup (scales with its container's width)
import { BRAND } from '../brand.js';
let uid = 0;
const W = 19, INLINE = 3.2;
// letter: [advance width, stroke path]
const L = {
  P: [58, 'M9.5 100V0M9.5 9.500H31a22.500 22.500 0 0 1 0 45H9.500'],
  O: [84, 'M42 9.500a32.500 40.500 0 1 0 .01 0z'],
  R: [62, 'M9.500 100V0M9.500 9.500H31a22.500 22.500 0 0 1 0 45H9.500M29 54.500L54 100'],
  T: [64, 'M0 9.500H64M32 9.500V100'],
  S: [66, 'M56 24A22 21 0 0 0 33 9.500A20.250 20.250 0 0 0 33 50A20.250 20.250 0 0 1 33 90.500A22 21 0 0 1 10 76'],
  L: [56, 'M9.500 0V90.500H56'],
  A: [74, 'M5 100L37 6L69 100M19.500 72H54.500'],
  N: [72, 'M9.500 100V4L62.500 96V0'],
};
function word(text, x0, gap) {
  let x = x0; const out = [];
  for (const ch of text) { const g = L[ch]; if (!g) { x += 30; continue; } out.push({ ch, x, d: g[1], w: g[0] }); x += g[0] + gap; }
  return { glyphs: out, width: x - gap - x0 };
}
const paths = (glyphs, sw, extra = '') => glyphs.map((g) => `<path transform="translate(${g.x} 0)" d="${g.d}" stroke-width="${sw}" ${extra}/>`).join('');

/** The tide sun (the O of SOLANA and the stand-alone emblem). cx, cy = center, r = radius. */
function tideSun(cx, cy, r, id, accent, o = {}) {
  const wave = (y, amp, ph) => { let d = `M${cx - r - 6} ${y}`; const n = 6, step = (2 * r + 12) / n; for (let i = 0; i < n; i++) { const x1 = cx - r - 6 + step * (i + 0.5), x2 = cx - r - 6 + step * (i + 1); d += `Q${x1} ${y + ((i + ph) % 2 ? amp : -amp)} ${x2} ${y}`; } return d; };
  const y1 = cy + r * 0.2, y2 = cy + r * 0.5, y3 = cy + r * 0.76;
  // sun above the first wave; below it, wave-edged bands separated by see-through gaps
  const top = `<path d="${wave(y1 - r * 0.07, r * 0.07, 0)}L${cx + r + 6} ${cy - r - 4}L${cx - r - 6} ${cy - r - 4}Z"/>`;
  const strip = (ya, h, ph) => `<path d="${wave(ya, r * 0.06, ph)}" fill="none" stroke="#fff" stroke-width="${h}" stroke-linecap="butt"/>`;
  return `<defs><clipPath id="${id}c"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><mask id="${id}m" maskUnits="userSpaceOnUse" x="${cx - r - 8}" y="${cy - r - 8}" width="${2 * r + 16}" height="${2 * r + 16}"><g fill="#fff">${top}</g>${strip(y1 + r * 0.115, r * 0.17, 1)}${strip(y2 + r * 0.03, r * 0.13, 0)}${strip(y3 + r * 0.02, r * 0.09, 1)}</mask></defs>`
    + `<g clip-path="url(#${id}c)"><rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" fill="${accent}" mask="url(#${id}m)"/></g>`
    + (o.ring ? `<circle cx="${cx}" cy="${cy}" r="${r + o.ring}" fill="none" stroke="${o.ringColor || 'currentColor'}" stroke-width="${o.ringWidth || 2}"/>` : '');
}

// Used when the name has letters the drawn alphabet does not cover: emblem + bold condensed type.
function fallbackSVG(opts, id) {
  const { variant = 'full', accent = 'var(--ps-coral, #ff6a4d)', color = 'currentColor' } = opts;
  const big = String(BRAND.line2 || BRAND.name).toUpperCase(), small = String(BRAND.line1 || '').toUpperCase();
  const font = "'Barlow Condensed','Avenir Next Condensed','Arial Narrow',sans-serif";
  if (variant === 'line') { const w = 130 + (small.length + big.length + 1) * 52; return `<svg class="ps-logo ps-logo-line" viewBox="0 0 ${w} 112" role="img" aria-label="${BRAND.name}" fill="none">${tideSun(52, 56, 44, id, accent)}<text x="118" y="92" fill="${color}" style="font:800 104px ${font};letter-spacing:.04em">${small ? small + ' ' : ''}${big}</text></svg>`; }
  const w = Math.max(520, big.length * 86 + 120);
  return `<svg class="ps-logo ps-logo-full" viewBox="0 0 ${w} 250" role="img" aria-label="${BRAND.name}" fill="none">${tideSun(50, 150, 46, id, accent)}<text x="4" y="52" fill="${color}" opacity=".85" style="font:700 44px ${font};letter-spacing:.5em">${small}</text><text x="112" y="196" fill="${color}" style="font:800 150px ${font};letter-spacing:.03em">${big}</text><text x="4" y="240" fill="${color}" opacity=".8" style="font:600 19px ${font};letter-spacing:.42em">${opts.caption === false ? '' : BRAND.tagline}</text></svg>`;
}

export function logoSVG(opts = {}) {
  const { variant = 'full', caption = true, accent = 'var(--ps-coral, #ff6a4d)', color = 'currentColor', title = BRAND.name } = opts;
  const id = 'pslogo' + (++uid);
  if (variant === 'emblem') {
    return `<svg class="ps-logo ps-logo-emblem" viewBox="0 0 120 120" role="img" aria-label="${title}" fill="none">${tideSun(60, 60, 44, id, accent, { ring: 9, ringColor: color, ringWidth: 2.500 })}<path d="M60 3v9M60 108v9M3 60h9M108 60h9" stroke="${color}" stroke-width="2.500" stroke-linecap="butt"/></svg>`;
  }
  // SOLANA with the sun as its O
  const gap = 15, sunR = 46;
  const big = String(BRAND.line2 || '').toUpperCase(), small = String(BRAND.line1 || '').toUpperCase(), si = BRAND.sunLetter;
  if (![...big, ...small].every((ch) => L[ch])) return fallbackSVG(opts, id);
  // big word, with the tide sun standing in for one letter
  const sol = []; let cx = 0, sunX = -1;
  [...big].forEach((ch, i) => { if (i === si) { sunX = cx + sunR; cx += 2 * sunR + gap; } else { sol.push({ ch, x: cx, d: L[ch][1], w: L[ch][0] }); cx += L[ch][0] + gap; } });
  const solW = cx - gap;
  const mask = (glyphs, mid, x, y, w, h, sc = 1) => `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><g fill="none" stroke-linejoin="miter" stroke-miterlimit="2.200" stroke-linecap="butt"><g stroke="#fff">${paths(glyphs, W)}</g><g stroke="#000">${paths(glyphs, INLINE / sc)}</g></g></mask>`;
  if (variant === 'line') {
    // one line: PORT · sun · SOLANA at small sizes (pause header, phone boot, credits)
    const p = word(small, 0, 13), k = 1;
    const sx = p.width + 34;
    const H = 100, total = sx + solW;
    return `<svg class="ps-logo ps-logo-line" viewBox="-4 -6 ${total + 8} ${H + 12}" role="img" aria-label="${title}" fill="none"><defs>${mask(p.glyphs, id + 'p', -12, -12, p.width + 24, 124, k)}${mask(sol, id + 's', -12, -12, solW + 24, 124)}</defs>`
      + `<rect x="-12" y="-12" width="${p.width + 24}" height="124" fill="${color}" mask="url(#${id}p)" opacity=".72"/>`
      + `<g transform="translate(${sx} 0)"><rect x="-12" y="-12" width="${solW + 24}" height="124" fill="${color}" mask="url(#${id}s)"/>${sunX >= 0 ? tideSun(sunX, 50, sunR, id, accent) : ''}</g></svg>`;
  }
  // full lockup: small PORT row with a chart rule and coordinates, then SOLANA
  const ps = 0.33, p = word(small, 0, 26);
  const topH = 100 * ps, padTop = 2, ruleY = padTop + topH / 2, solY = padTop + topH + 26;
  const totalH = solY + 100 + (caption ? 44 : 6);
  const px = 2;
  return `<svg class="ps-logo ps-logo-full" viewBox="-6 -6 ${solW + 12} ${totalH + 8}" role="img" aria-label="${title}" fill="none">`
    + `<defs>${mask(p.glyphs, id + 'p', -12, -12, p.width + 24, 124, ps * 0.62)}${mask(sol, id + 's', -12, -12, solW + 24, 124)}</defs>`
    + `<g transform="translate(${px} ${padTop}) scale(${ps})"><rect x="-12" y="-12" width="${p.width + 24}" height="124" fill="${color}" mask="url(#${id}p)"/></g>`
    + `<path d="M${px + p.width * ps + 22} ${ruleY}H${solW - 150}" stroke="${color}" stroke-width="1.600" opacity=".55"/>`
    + `<path d="M${solW - 150} ${ruleY - 6}v12" stroke="${color}" stroke-width="1.600" opacity=".55"/>`
    + `<text x="${solW}" y="${ruleY + 6.500}" text-anchor="end" fill="${color}" opacity=".8" style="font:600 17px 'Barlow Condensed','Avenir Next Condensed','Arial Narrow',sans-serif;letter-spacing:.2em">${BRAND.coords}</text>`
    + `<g transform="translate(0 ${solY})"><rect x="-12" y="-12" width="${solW + 24}" height="124" fill="${color}" mask="url(#${id}s)"/>${sunX >= 0 ? tideSun(sunX, 50, sunR, id, accent) : ''}</g>`
    + (caption ? `<g transform="translate(0 ${solY + 100 + 30})"><path d="M0 -6h26" stroke="${accent}" stroke-width="3"/><text x="38" y="0" fill="${color}" opacity=".86" style="font:600 19px 'Barlow Condensed','Avenir Next Condensed','Arial Narrow',sans-serif;letter-spacing:.42em">${opts.captionText || BRAND.tagline}</text></g>` : '')
    + '</svg>';
}
/** Element helper. */
export function logoEl(opts = {}) { const d = document.createElement('div'); d.className = 'ps-logo-wrap' + (opts.class ? ' ' + opts.class : ''); d.innerHTML = logoSVG(opts); return d; }
