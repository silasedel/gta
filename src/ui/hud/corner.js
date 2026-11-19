// SOUTHLINE — top-right HUD corner, built to match docs/v2/plan/hud_corner_target.webp.
// Rows, top to bottom: six wanted stars in one row, five "what the police know" badges, then either ammo (clip /
// reserve) and the weapon art (weapon out) or the money rows in the style of references/ref_46 (bank with the house badge,
// cash with the wallet badge; with a weapon out they only show for a few seconds after a change), and the clock last. Every row is an inline SVG drawn in the target image's own pixel
// space (1 unit = 1 px of the 1536x1024 target), so sizes, spacing and outlines match it; the whole corner is
// then scaled to the screen (UNIT px per unit at 1080p). All art is original: the numerals are our own squared
// heavy digits (no font file), the icons and the pistol are drawn here.
//
// API (returned object, also reachable as game.hud.* through hud.js):
// Weapon art: the hand-drawn pistol for 'pistol', every other weapon from public/assets/ui/weapons/<id>.png (baked from
// the game's own weapon models in the same flat, outlined style by tools/v2/hudcorner/bake-icons.mjs).
//   update(dt, s)          s = { wanted 0..6, evading bool, weapon id, weaponSvg (fallback art), ammo {clip,reserve,total,throw}|null,
//                                reloading, low, empty, clock 'HH:MM', tod 'sun'|'dusk'|'moon' }
//   setCash(text) / cashFly(diff) / setBank(text|null)
//   setKnown({cameras, witnesses, outfit, face, weapon}) | setKnown(null)   force the evidence badges (null = read game.evidence)
//   setWantedFlash(true|false|null)   force the GTA-style star flash on/off; null = automatic (flashes while game.wanted.evading)
import './corner.css';
import './polish.css';
import '../styles/fonts.css';

const NS = 'http://www.w3.org/2000/svg';
export const UNIT = 1 / 5.2;           // px per target unit at 1080p (six stars = 238 px wide, r2: was 191)
const VX0 = 150, VW = 1240;            // shared horizontal window of the target (x 150..1390)
const ROWS = { stars: [40, 222], known: [262, 246], ammo: [508, 208], gun: [716, 300] }; // [y0, height] per row

// ------------------------------------------------------------------ numerals (original squared heavy digits)
// Design space: 153 units tall (the target's "20 73"), bars 36 thick, side bars 45 wide. Each glyph is a union of
// rectangles / polygons; it is drawn inset by IN and stroked with its own color (round joins) so outer corners
// come out rounded, then a black outline of OL units is laid underneath.
const GH = 153, IN = 14, OL = 13, GAP = 11;
const TB = [0, 0, 104, 36], MB = [0, 58.5, 104, 94.5], BB = [0, 117, 104, 153];
const LU = [0, 0, 45, 94.5], LD = [0, 58.5, 45, 153], RU = [59, 0, 104, 94.5], RD = [59, 58.5, 104, 153], LF = [0, 0, 45, 153], RF = [59, 0, 104, 153];
const GLYPHS = {
  0: { w: 104, r: [TB, BB, LF, RF] },
  1: { w: 74, r: [[29, 0, 74, 153], [0, 0, 45, 36]] },
  2: { w: 104, r: [TB, RU, MB, LD, BB] },
  3: { w: 104, r: [TB, RF, [24, 58.5, 104, 94.5], BB] },
  4: { w: 104, r: [LU, MB, RF] },
  5: { w: 104, r: [TB, LU, MB, RD, BB] },
  6: { w: 104, r: [TB, LF, MB, RD, BB] },
  7: { w: 112, r: [[0, 0, 112, 36]], p: [[[62, 14], [112, 14], [112, 30], [50, 153], [0, 153]]] },
  8: { w: 104, r: [TB, MB, BB, LF, RF] },
  9: { w: 104, r: [TB, LU, RF, MB, BB] },
  $: { w: 104, r: [TB, LU, MB, RD, BB, [38, -22, 66, 175]] },
  ',': { w: 38, r: [[0, 112, 38, 153]], p: [[[8, 140], [38, 140], [24, 186], [2, 186]]] },
  ':': { w: 38, r: [[0, 22, 38, 60], [0, 93, 38, 131]] },
  '+': { w: 104, r: [[34, 22, 70, 131], MB] },
  '-': { w: 84, r: [[0, 58.5, 84, 94.5]] },
  ' ': { w: 40, r: [] },
};
function glyphPath(g, x, y, k) {
  let d = '';
  const P = (a, b) => `${(x + a * k).toFixed(1)} ${(y + b * k).toFixed(1)}`;
  for (const [a, b, c, e] of g.r) d += `M${P(a + IN, b + IN)}H${(x + (c - IN) * k).toFixed(1)}V${(y + (e - IN) * k).toFixed(1)}H${(x + (a + IN) * k).toFixed(1)}Z`;
  for (const poly of g.p || []) {
    // shrink polygons toward their centroid by IN (good enough for the convex stems used here)
    const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length, cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
    d += 'M' + poly.map(([a, b]) => { const dx = a - cx, dy = b - cy, l = Math.hypot(dx, dy) || 1; return P(a - (dx / l) * IN, b - (dy / l) * IN); }).join('L') + 'Z';
  }
  return d;
}
export function textWidth(str, h = GH) {
  const k = h / GH;
  let w = 0, n = 0;
  for (const ch of String(str)) { const g = GLYPHS[ch]; if (!g) continue; w += g.w * k; n++; }
  return w + Math.max(0, n - 1) * GAP * k;
}
// returns { ol, fill } path markup for a run of text whose right edge is at xr and top at y
function runPaths(str, xr, y, h, color) {
  const k = h / GH;
  let x = xr - textWidth(str, h), d = '';
  for (const ch of String(str)) { const g = GLYPHS[ch]; if (!g) continue; d += glyphPath(g, x, y, k); x += (g.w + GAP) * k; }
  if (!d) return { ol: '', fill: '' };
  const sw = 2 * IN * k;
  return {
    ol: `<path d="${d}" fill="#000" stroke="#000" stroke-width="${(sw + 2 * OL * k).toFixed(1)}" stroke-linejoin="round"/>`,
    fill: `<path d="${d}" fill="${color}" stroke="${color}" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round"/>`,
  };
}
// money / clock text (ref_46): the same squared digits with a thin dark outline
function textSVGThin(runs, xr, y, h) {
  let x = xr, ol = '', fill = '';
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i], k = h / GH;
    let xx = x - textWidth(r.t, h), d = '';
    for (const ch of String(r.t)) { const g = GLYPHS[ch]; if (!g) continue; d += glyphPath(g, xx, y, k); xx += (g.w + GAP) * k; }
    const sw = 2 * IN * k;
    ol += `<path d="${d}" fill="#14161c" stroke="#14161c" stroke-width="${(sw + 2 * 8 * k).toFixed(1)}" stroke-linejoin="round" opacity=".9"/>`;
    fill += `<path d="${d}" fill="${r.color}" stroke="${r.color}" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round"/>`;
    x -= textWidth(r.t, h) + (r.gap ?? 82) * k;
  }
  return `<g class="gl-thin"><g class="gl-ol">${ol}</g>${fill}</g>`;
}
// several runs laid right-to-left; runs = [{ t, color, gap }] (gap = space before the run to its left)
function textSVG(runs, xr, y, h, cls = '') {
  let x = xr, ol = '', fill = '';
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    const p = runPaths(r.t, x, y, h, r.color);
    ol += p.ol; fill += `<g class="${r.cls || ''}">${p.fill}</g>`;
    x -= textWidth(r.t, h) + (r.gap ?? 82) * (h / GH);
  }
  return `<g class="${cls}"><g class="gl-ol">${ol}</g>${fill}</g>`;
}

// ------------------------------------------------------------------ stars
const STAR_CX0 = 263.5, STAR_DX = 201.7, STAR_CY = 158.6, STAR_R = 88.6, STAR_RI = 0.41;
function starPoints(cx, cy, R) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * STAR_RI : R;
    p.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return p.join(' ');
}

// ------------------------------------------------------------------ evidence badges (what the police know)
export const KNOWN_KEYS = ['cameras', 'witnesses', 'outfit', 'face', 'weapon'];
const KNOWN_TITLES = {
  cameras: 'Cameras have you on footage',
  witnesses: 'Witnesses described you',
  outfit: 'Police know your outfit',
  face: 'Police know your face',
  weapon: 'Police know your weapon',
};
const KNOWN_CX = [332.5, 557.5, 780.5, 1003, 1231.5], KNOWN_CY = 394, KNOWN_R = 95, KNOWN_RING = 11;
const RED = '#800c0b';
// glyphs centered on (0,0), drawn white; "cut" parts use the badge color so they read as holes
const KNOWN_ART = {
  cameras:
    '<g transform="rotate(18 5 -32)"><rect x="-42" y="-54" width="94" height="42" rx="4"/>'
    + '<rect class="cut" x="-30" y="-46" width="15" height="14"/>'
    + '<rect x="56" y="-30" width="17" height="21" rx="2"/></g>'
    + '<path d="M-5 3 L11 8 L0 39 L-33 39 L-33 29 L-8 29 Z"/>'
    + '<rect x="-48.5" y="16" width="15.5" height="38" rx="1.5"/>',
  witnesses:
    '<ellipse cx="32" cy="-33" rx="25" ry="34"/>'
    + '<path d="M14 34 Q17 7 38 6 Q58 8 62 30 Q40 39 14 34Z"/>'
    + '<g class="sep"><ellipse cx="-17" cy="-17" rx="30" ry="39"/>'
    + '<path d="M-57 51 Q-52 22 -17 21 Q16 22 20 49 Q-18 59 -57 51Z"/></g>',
  outfit:
    '<path class="line" d="M-12 -52 A15 15 0 1 1 7 -38 C1 -35 0 -32 0 -27 L-55 26 Q-63 36 -51 37 L51 37 Q63 36 55 26 L0 -27"/>',
  face:
    '<path d="M-44 53 Q-41 21 -12 17 Q1 22 15 17 Q44 21 46 53 Q1 63 -44 53Z"/>'
    + '<g class="sep"><ellipse cx="1.5" cy="-26" rx="33" ry="42.5"/></g>',
  weapon:
    '<path fill-rule="evenodd" d="M-47 -51 H64 Q68 -51 68 -47 V-23 Q68 -19 64 -19 H34 V-12 Q33 9 12 9 H-8 L-11 -6 L-21 39 H-63 Q-68 39 -67 34 L-53 -22 V-47 Q-53 -51 -49 -51 Z'
    + ' M0 -16 H22 Q20 -4 12 -4 H-1 Z"/>'
    + '<path class="cut" d="M10 -14 Q15 -12 15 -6 L12 -6 Q12 -10 9 -12 Z"/>',
};

// ------------------------------------------------------------------ weapon art
// The pistol (barrel to the left) in target units; silhouette follows the target, details drawn by hand.
const PISTOL_BODY = 'M1271 1000 L1154 1000 L1150 994 L1150 979 L1110 904 L1101 894 L1093 892 L991 892 L986 887 L984 846 L972 834 L808 832 L802 827 L800 820 L800 760 L804 753 L813 746 L819 746 L826 736 L850 736 L855 746 L1217 746 L1224 736 L1237 736 L1243 746 L1249 746 L1256 753 L1268 796 L1268 805 L1264 811 L1242 828 L1238 838 L1238 855 L1284 935 L1292 952 L1292 971 L1286 990 L1280 998 Z';
const PISTOL_HOLE = 'M1015 844 L1050 844 Q1056 844 1055 851 L1053 864 Q1052 870 1045 870 L1015 870 Q1010 870 1010 865 L1010 849 Q1010 844 1015 844 Z';
// the black ring around the hole: the hole grown by 11 units
const PISTOL_RING = 'M1012 833 L1053 833 Q1068 833 1066 850 L1064 866 Q1062 881 1046 881 L1012 881 Q999 881 999 868 L999 846 Q999 833 1012 833 Z';
function pistolSVG() {
  let s = `<defs><linearGradient id="hudGunG" x1="0" y1="736" x2="0" y2="1000" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4b5379"/><stop offset=".45" stop-color="#454c71"/><stop offset="1" stop-color="#3a4064"/></linearGradient>
    <linearGradient id="hudGunHi" x1="806" y1="0" x2="1110" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d6dae8"/><stop offset=".7" stop-color="#c3c8db"/><stop offset="1" stop-color="#a6adc6"/></linearGradient>
    <clipPath id="hudGunClip"><path d="${PISTOL_BODY}"/></clipPath></defs>`;
  // outline: the silhouette stroked 2x12 units, the trigger-guard hole ringed the same way
  s += `<path d="${PISTOL_BODY}" fill="none" stroke="#000" stroke-width="24" stroke-linejoin="round"/>`;
  s += `<path d="${PISTOL_BODY} ${PISTOL_HOLE}" fill="#000" fill-rule="evenodd"/>`;
  s += `<path d="${PISTOL_BODY} ${PISTOL_RING}" fill="url(#hudGunG)" fill-rule="evenodd"/>`;
  s += '<g clip-path="url(#hudGunClip)">';
  // dust cover (frame under the slide), a touch lighter
  s += '<path d="M800 801 H975 L972 834 L800 834 Z" fill="#4c5479"/>';
  // slide top highlight, a long bright flat that steps down to a thin strip toward the rear sight
  s += '<path d="M806 747 H1100 Q1106 747 1108 753 L1110 762 H812 Q806 762 806 756 Z" fill="url(#hudGunHi)"/>';
  s += '<path d="M1104 748 H1250 L1252 753 H1106 Z" fill="#9aa1bd"/>';
  s += '<rect x="826" y="736" width="24" height="5" fill="#8d94b4"/><rect x="1224" y="736" width="13" height="5" fill="#8d94b4"/>';
  // slide / frame parting line
  s += '<rect x="802" y="795" width="462" height="6" rx="2" fill="#a9b0c9"/>';
  // rear serrations
  for (let i = 0; i < 5; i++) { const x = 1143 + i * 16; s += `<path d="M${x} 754 H${x + 6} L${x + 10} 793 H${x + 4} Z" fill="#272c47"/>`; }
  // accessory rail groove and its lower highlight
  s += '<rect x="812" y="807.5" width="146" height="7" rx="3.5" fill="#2a2f4b"/><rect x="806" y="819" width="152" height="3" rx="1.5" fill="#a0a7c3"/>';
  // takedown lever
  s += '<rect x="1003" y="804" width="57" height="11" rx="5.5" fill="#596188" stroke="#a5acc6" stroke-width="2"/>';
  // shade under the slide at the rear
  s += '<path d="M1100 806 Q1170 800 1236 812 L1236 824 Q1170 816 1104 822 Z" fill="#33395a" opacity=".55"/>';
  // grip panel and its lit edges
  s += '<path d="M1121 884 L1236 862 L1276 942 L1278 984 L1164 984 L1123 905 Z" fill="#383e62"/>';
  s += '<path d="M1110 898 L1152 978" stroke="#8a91b0" stroke-width="3" stroke-linecap="round"/>';
  s += '<path d="M1246 862 L1283 938" stroke="#7d84a4" stroke-width="3" stroke-linecap="round"/>';
  // magazine base plate
  s += '<rect x="1152" y="985" width="130" height="10" rx="3" fill="#b5bbd2"/>';
  // slide stop pin and its glint
  s += '<path d="M1120 852 L1194 847 L1194 850 L1120 860 Z" fill="#b9bfd7" opacity=".85"/>';
  s += '<ellipse cx="1112" cy="856" rx="9.5" ry="6.5" fill="#dfe2ee"/>';
  s += '</g>';
  // trigger (black, inside the guard) with a faint lit face
  s += '<path d="M1053 843 C1076 842 1090 858 1088 884 L1078 884 C1077 866 1068 853 1057 850 Z" fill="#000"/>';
  s += '<path d="M1060 850 C1071 855 1077 866 1078 878" stroke="#5c6488" stroke-width="3" fill="none" stroke-linecap="round"/>';
  return s;
}
// other weapons: the HUD's own silhouettes (64x64, barrel right) shown in the same slate finish with a black outline,
// mirrored so every gun points the same way as the pistol.
// baked icons: public/assets/ui/weapons/index.json = { id: { w, h } } in target units (outline included)
const ICONS = { idx: null, p: null };
function loadIcons() {
  if (!ICONS.p) ICONS.p = fetch(new URL('assets/ui/weapons/index.json', document.baseURI)).then((r) => (r.ok ? r.json() : {})).then((j) => (ICONS.idx = j || {})).catch(() => (ICONS.idx = {}));
  return ICONS.p;
}
function iconSVG(id) {
  const m = ICONS.idx && ICONS.idx[id];
  if (!m) return null;
  // right edge and baseline match the hand-drawn pistol's outline box (x 1295, y 1012); taller art grows upward
  const k = Math.min(1, 288 / m.h, 940 / m.w), w = m.w * k, h = m.h * k;
  const href = new URL(`assets/ui/weapons/${id}.png`, document.baseURI).href;
  return `<image href="${href}" x="${(1295 - w).toFixed(1)}" y="${(1012 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMaxYMax meet"/>`;
}
function genericGunSVG(svg) {
  const inner = String(svg || '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<g transform="translate(1292 736) scale(-7.7 7.7) translate(0 -8)"><g class="gx-ol">${inner}</g><g class="gx-fill">${inner}</g></g>`;
}

// ------------------------------------------------------------------ money badges (same style as the evidence badges)
const BADGE = {
  bank: { color: '#6b4fcf', art: '<path d="M0 -40 L-46 -2 H-33 V40 H-11 V14 H11 V40 H33 V-2 H46 Z"/>' },
  cash: { color: '#3f9a3a', art: '<path d="M-40 -22 L26 -40 Q34 -42 36 -34 L38 -24 Z"/><path fill-rule="evenodd" d="M-44 -22 H38 Q46 -22 46 -14 V-6 H20 Q6 -6 6 8 Q6 22 20 22 H46 V30 Q46 38 38 38 H-44 Q-52 38 -52 30 V-14 Q-52 -22 -44 -22 Z M20 2 A6 6 0 1 0 20.1 2 Z"/>' },
};

// ------------------------------------------------------------------ DOM helpers
function div(cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}
function svgRow(cls, y0, h, inner = '') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', 'hc-row ' + cls);
  s.setAttribute('viewBox', `${VX0} ${y0} ${VW} ${h}`);
  s.setAttribute('aria-hidden', 'true');
  s.style.setProperty('--h', h);
  s.innerHTML = inner;
  return s;
}
function restart(node, cls) {
  node.classList.remove(cls);
  void node.getBoundingClientRect();
  node.classList.add(cls);
}
const tryGet = (fn, fallback) => {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
};

// Reads the evidence system: cameras / witnesses currently on file, and the outfit / face / weapon facts police hold.
function knownFromEvidence(game) {
  const ev = game.evidence;
  if (!ev || typeof ev.snapshot !== 'function') return null;
  const snap = tryGet(() => ev.snapshot(), null);
  if (!snap) return null;
  const out = { cameras: false, witnesses: false, outfit: false, face: false, weapon: false };
  const src = snap.sources || {};
  out.cameras = (src.cameras?.length || 0) > 0;
  out.witnesses = (src.witnesses?.length || 0) > 0;
  for (const f of snap.facts || []) {
    const k = String(f?.key || '');
    if (k === 'face') out.face = true;
    else if (k.startsWith('outfit.')) out.outfit = true;
    else if (k === 'weapon') out.weapon = true;
  }
  return out;
}

/** Builds the corner. Returns the API described at the top of this file. */
export function createCorner(game) {
  const root = div('ps-status ps-corner');

  // stars: one SVG, outlines first so neighbors never cut into each other
  // the user's rule (hud_corner_target / ref_46): earned stars are solid white with the heavy black outline, empty stars
  // are semi-transparent gray with a faint outline; like GTA, stars are earned from the right (1 star = the rightmost)
  let starsInner = '<g class="hc-star-ol">';
  for (let i = 0; i < 6; i++) starsInner += `<polygon class="hc-star-o" points="${starPoints(STAR_CX0 + i * STAR_DX, STAR_CY, STAR_R)}"/>`;
  starsInner += '</g>';
  for (let i = 0; i < 6; i++) starsInner += `<polygon class="hc-star" style="transform-origin:${STAR_CX0 + i * STAR_DX}px ${STAR_CY}px" points="${starPoints(STAR_CX0 + i * STAR_DX, STAR_CY, STAR_R)}"/>`;
  const starsEl = svgRow('hc-stars', ROWS.stars[0], ROWS.stars[1], starsInner);
  const starEls = [...starsEl.querySelectorAll('.hc-star')], starOls = [...starsEl.querySelectorAll('.hc-star-o')];

  // evidence badges
  let kn = '';
  KNOWN_KEYS.forEach((k, i) => {
    kn += `<g class="hc-k" data-k="${k}" transform="translate(${KNOWN_CX[i]} ${KNOWN_CY})"><title>${KNOWN_TITLES[k]}</title>`
      + `<circle class="hc-k-ring" r="${KNOWN_R + KNOWN_RING}"/><circle class="hc-k-bg" r="${KNOWN_R}"/><g class="hc-k-art">${KNOWN_ART[k]}</g></g>`;
  });
  const knownEl = svgRow('hc-known', ROWS.known[0], ROWS.known[1], kn);
  const badges = {};
  for (const g of knownEl.querySelectorAll('.hc-k')) badges[g.dataset.k] = g;

  // ammo and weapon art
  const ammoEl = svgRow('hc-ammo', ROWS.ammo[0], ROWS.ammo[1]);
  const gunEl = svgRow('hc-gun', ROWS.gun[0], ROWS.gun[1]);

  // money and clock (HTML rows holding SVG text so the cash fly-out can sit beside them)
  const cashLine = div('hc-line hc-money hc-cash');
  const cashSvg = svgRow('hc-text', 0, 245);
  cashLine.appendChild(cashSvg);
  const bankLine = div('hc-line hc-money hc-bank none');
  const bankSvg = svgRow('hc-text', 0, 245);
  bankLine.appendChild(bankSvg);
  const clockLine = div('hc-line hc-clock');
  const clockSvg = svgRow('hc-text', 0, 128);
  clockLine.appendChild(clockSvg);

  // police state tag left of the stars (Nov 19 playtest, groundwork for missions): IN PURSUIT while the police see you,
  // SEARCHING while they have lost sight (the stars breathe); hidden with no stars
  const copTag = div('hc-police', '<i></i><span></span>');
  const copTxt = copTag.querySelector('span');
  root.append(starsEl, knownEl, ammoEl, gunEl, bankLine, cashLine, clockLine, copTag);
  loadIcons().then(() => { if (lastWeapon && lastWeapon !== 'pistol') setWeapon(lastWeapon, lastWeaponSvg); });

  // scale with the window (designed at 1080p)
  const fit = () => {
    const k = Math.max(0.72, Math.min(1.6, (window.innerHeight || 1080) / 1080));
    root.style.setProperty('--u', String(UNIT * k));
  };
  fit();
  addEventListener('resize', fit);

  // ---- state
  let manual = null, flashForce = null;
  let lastKnownKey = '', knownShown = null, pollT = 0;
  let lastCop = '';
  let lastW = -1, lastFlash = null, lastWeapon = null, lastWeaponSvg = null, lastAmmoKey = null;
  let cashText = '', bankText = null, clockText = '';

  // ref_46 money rows: squared digits with a light outline, right-aligned against a badge whose right edge lines up
  // with the stars; badges are the evidence badges' size (r 95 + 11 ring)
  const MB = { bx: 1262, r: 95, ring: 11, h: 140, gap: 40, rowH: 245 };
  const moneyRight = () => MB.bx - MB.r - MB.ring - MB.gap;
  function moneyLine(svg, text, color, badge) {
    const H = MB.rowH, top = (H - MB.h) / 2;
    let inner = textSVGThin([{ t: text, color }], moneyRight(), top, MB.h);
    const B = BADGE[badge], cy = H / 2;
    inner += `<g transform="translate(${MB.bx} ${cy})"><circle r="${MB.r + MB.ring}" fill="#000"/><circle r="${MB.r}" fill="${B.color}"/><g fill="#fff">${B.art}</g></g>`;
    svg.innerHTML = inner;
  }
  let moneyHold = 0;
  function showMoney(sec = 5) { moneyHold = Math.max(moneyHold, sec); root.classList.add('money-on'); }
  function setCash(text) {
    text = String(text);
    if (text === cashText) return;
    cashText = text;
    moneyLine(cashSvg, text, '#ffffff', 'cash');
  }
  function setBank(text) {
    const t = text == null ? null : String(text);
    if (t === bankText) return;
    bankText = t;
    bankLine.classList.toggle('none', t == null);
    if (t != null) moneyLine(bankSvg, t, '#ffffff', 'bank');
  }
  function moneyFly(line, rowText, diff) {
    if (!diff) return;
    showMoney(5);
    const up = diff > 0;
    const t = (up ? '+' : '-') + '$' + Math.round(Math.abs(diff)).toLocaleString('en-US');
    const fly = div('hc-fly ' + (up ? 'up' : 'down'));
    fly.style.right = `calc(var(--u) * ${(VX0 + VW - (moneyRight() - textWidth(rowText || '', MB.h)) + 30).toFixed(0)}px)`;
    const w = textWidth(t, 104) + 40;
    fly.innerHTML = `<svg viewBox="0 0 ${w} ${MB.rowH}" style="--w:${w};--h:${MB.rowH}" aria-hidden="true">${textSVGThin([{ t, color: up ? '#8fe07a' : '#ff6f61' }], w - 20, (MB.rowH - 104) / 2, 104)}</svg>`;
    line.appendChild(fly);
    setTimeout(() => fly.remove(), 1700);
    restart(line, 'pop');
  }
  function cashFly(diff) { moneyFly(cashLine, cashText, diff); }
  // bank row: wires, deposits and card payments from the phone's bank app fly out the same way as cash
  let bankNum = null;
  function bankChanged(v) {
    if (bankNum != null && Math.abs(v - bankNum) >= 0.5) moneyFly(bankLine, bankText, v - bankNum);
    bankNum = v;
  }
  try { for (const n of ['loaded', 'newGame']) game.on?.(n, () => { bankNum = null; }); } catch (e) { /* no event bus */ }
  function setClock(text) {
    if (text === clockText) return;
    clockText = text;
    clockSvg.innerHTML = textSVGThin([{ t: text, color: '#eceef2' }], 1358, 18, 92);
  }

  let crimeShirt = null, hadStars = false;
  function setKnown(k) {
    if (k == null) { manual = null; return; }
    manual = {};
    for (const n of KNOWN_KEYS) manual[n] = !!k[n];
    pollT = 0;
  }
  function setWantedFlash(v) { flashForce = v == null ? null : !!v; }

  function setWeapon(id, fallbackSvg) {
    const armed = !!id && id !== 'fist';
    root.classList.toggle('armed', armed);
    if (!armed) { gunEl.innerHTML = ''; return; }
    gunEl.innerHTML = id === 'pistol' ? pistolSVG() : (iconSVG(id) || genericGunSVG(fallbackSvg));
    gunEl.dataset.weapon = id;
    restart(gunEl, 'swap');
  }
  function setAmmo(ai, flags) {
    root.classList.toggle('has-ammo', !!ai);
    if (!ai) { ammoEl.innerHTML = ''; return; }
    const H = 153, top = 536, xr = 1310;
    const clipCol = flags.empty ? '#ff5a4d' : '#fbfbfb';
    let runs;
    if (ai.throw || ai.clip == null) runs = [{ t: String(ai.total), color: clipCol }];
    else runs = [{ t: String(ai.clip), color: clipCol, cls: 'hc-clip' }, { t: String(ai.reserve), color: '#b1b1b0', gap: 82 }];
    ammoEl.innerHTML = textSVG(runs, xr, top, H);
    ammoEl.classList.toggle('reloading', !!flags.reloading);
    ammoEl.classList.toggle('empty', !!flags.empty);
    ammoEl.classList.toggle('low', !!flags.low);
  }

  function update(dt, s) {
    // stars
    const w = Math.max(0, Math.min(6, s.wanted | 0));
    if (w !== lastW) {
      // stars are earned from the right: gained ones light up in order (right to left), lost ones fade from the left
      let gi = 0, li = 0;
      for (let i = 5; i >= 0; i--) {
        const el = starEls[i], ol = starOls[i], on = i >= 6 - w, was = el.classList.contains('on');
        if (on === was) continue;
        el.classList.remove('gain', 'lose', 'pop', 'spotted'); ol.classList.remove('gain', 'lose');
        el.classList.toggle('on', on); ol.classList.toggle('on', on);
        if (lastW < 0) continue;
        const d = on ? gi++ * 0.11 : li++ * (w === 0 ? 0 : 0.12);
        el.style.setProperty('--d', d + 's'); ol.style.setProperty('--d', d + 's');
        restart(el, on ? 'gain' : 'lose'); restart(ol, on ? 'gain' : 'lose');
      }
      root.classList.toggle('wanted', w > 0);
      if (w > lastW && lastW >= 0) restart(starsEl, 'bump');
      lastW = w;
    }
    const flash = w > 0 && (flashForce ?? !!s.evading);
    if (flash !== lastFlash) {
      lastFlash = flash; root.classList.toggle('evading', flash);
      if (!flash && w > 0) for (const el of starEls) if (el.classList.contains('on')) { el.classList.remove('gain'); restart(el, 'spotted'); }
    }

    const cop = w > 0 ? (s.evading ? 'search' : 'pursuit') : '';
    if (cop !== lastCop) {
      lastCop = cop;
      copTag.classList.toggle('on', !!cop); copTag.classList.toggle('search', cop === 'search');
      if (cop) { copTxt.textContent = cop === 'search' ? 'SEARCHING' : 'IN PURSUIT'; restart(copTag, 'pop'); }
    }

    // evidence badges (polled; the evidence snapshot is not free)
    pollT -= dt;
    if (pollT <= 0) {
      pollT = 0.25;
      const k = Object.assign({}, manual || knownFromEvidence(game) || {});
      // clothes: once a crime brings stars the police know what you wear, until you change your shirt
      const shirt = tryGet(() => game.wardrobe?.current?.().top ?? '', '');
      if (w > 0 && !hadStars) crimeShirt = shirt;      // a fresh crime (stars from none) fixes the shirt they saw
      hadStars = w > 0;
      if (crimeShirt != null && shirt !== crimeShirt) crimeShirt = null;
      if (crimeShirt != null) k.outfit = true;
      const any = KNOWN_KEYS.some((n) => k[n]);
      const show = true;                       // user: the five icons always show (gray when police know nothing)
      const key = KNOWN_KEYS.map((n) => (k[n] ? 1 : 0)).join('');
      if (key !== lastKnownKey) {
        for (const n of KNOWN_KEYS) {
          const was = badges[n].classList.contains('on');
          badges[n].classList.toggle('on', !!k[n]);
          if (k[n] && !was && knownShown) restart(badges[n], 'pop');
        }
        lastKnownKey = key;
      }
      if (show !== knownShown) { knownShown = show; root.classList.toggle('known', show); }
      // bank line exists only when the banking system does
      const b = game.bank ? tryGet(() => game.bank.balance, null) : null;
      setBank(typeof b === 'number' && isFinite(b) ? '$' + Math.round(b).toLocaleString('en-US') : null);
      if (typeof b === 'number' && isFinite(b)) bankChanged(b);
    }

    // weapon + ammo
    if (s.weapon !== lastWeapon) { lastWeapon = s.weapon; lastWeaponSvg = s.weaponSvg; setWeapon(s.weapon, s.weaponSvg); lastAmmoKey = null; }
    if (moneyHold > 0) { moneyHold -= dt; if (moneyHold <= 0) root.classList.remove('money-on'); }
    const ai = s.ammo;
    const akey = !ai ? '' : `${ai.throw ? 'T' : ''}${ai.clip ?? ''}/${ai.reserve ?? ai.total}|${s.reloading ? 1 : 0}${s.empty ? 1 : 0}${s.low ? 1 : 0}`;
    if (akey !== lastAmmoKey) { lastAmmoKey = akey; setAmmo(ai, s); }

    if (s.clock) setClock(s.clock);
  }

  function bumpStars() { restart(starsEl, 'bump'); }

  return { root, starsEl, starEls, cashLine, knownEl, update, setKnown, setWantedFlash, setCash, setBank, cashFly, setClock, bumpStars };
}
