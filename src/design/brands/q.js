// Compact brand notation. One call per brand; expands to the full B() definition (see define.js and README.md).
//
//   Q(name, 'category/sub', 'tier presence weight [@district,district]', 'primary secondary accent ink paper',
//     'displayFont[/textFont]', [lockup, mark, wordFlags, logoExtra], tagline, story, extra)
//
// lockup:   h (horizontal) | s (stacked) | w (wordmark) | r (roundel) | e (emblem)
// mark:     'name' | 'name@backing[:color[:ring]]' | 'mono:AB:style' | 'glyph:24' | null     (names: logos/marks*.js)
// wordFlags (space separated): U upper, L lower, t12 tracking .12, k8 skew .08, o outline(ink), O thick paper outline,
//           s hard shadow, u swoosh underline, v wave underline, 2 two-tone (second word or CamelCase half in accent),
//           S stack the words as lines, J justify stacked lines, fp/fs/fa/fi/fw fill = primary/secondary/accent/ink/paper,
//           a15 arch .15, x80 scale .8, i inline stripe
// logoExtra: { sub, over, c: 'shape:fill[:stroke]', ms, gap, rev, ring: { top, bottom }, word: {...overrides} }
// extra:    any brand field (id, legal, founded, owner, sign, pack, menu, family, appears, tags, storefront, pattern ...)
import { B } from './define.js';
import { CATEGORIES } from './categories.js';
import { drawMark } from '../logos/allmarks.js';
import { hashStr } from '../util.js';

const FILL = { p: 'primary', s: 'secondary', a: 'accent', i: 'ink', w: 'paper', n: 'neon' };
const LOCK = { h: 'horizontal', s: 'stacked', w: 'wordmark', r: 'roundel', e: 'emblem' };
const STORE_GROUPS = new Set(['retail', 'food', 'nightlife', 'stay', 'entertainment']);
const STORE_CATS = new Set([
  'salon',
  'tattoo',
  'bank',
  'finance',
  'real-estate',
  'legal',
  'medical',
  'gym',
  'car-rental',
  'car-dealer',
  'car-wash',
  'garage',
  'marina',
  'tackle',
  'dive-shop',
  'surf-shop',
  'marine-supply',
  'auto-parts',
  'church',
  'education',
  'air-charter',
  'jewelry',
  'eyewear',
  'insurance',
]);

export function parseMark(m) {
  if (!m) return null;
  if (Array.isArray(m) || typeof m === 'function') return m;
  const [left, back] = String(m).split('@');
  const [name, a1, a2, a3] = left.split(':');
  const o = {};
  if (name === 'mono') {
    o.t = a1;
    if (a2) o.style = a2;
    if (a3) o.f = a3;
  } else if (name === 'glyph') {
    o.t = a1;
    if (a2) o.f = a2;
  } else {
    if (a1) o.a = a1;
    if (a2) o.b = a2;
    if (a3) o.c = a3;
  }
  if (back) {
    const [on, onc, ring] = back.split(':');
    o.on = on;
    if (onc) o.onc = onc;
    if (ring) o.ring = ring;
  }
  return [name, o];
}
function parseWord(name, flags, font, hasPlate) {
  const w = { text: name, font, fill: hasPlate ? 'paper' : 'ink' };
  let two = false,
    stack = false;
  for (const f of String(flags || '')
    .split(/\s+/)
    .filter(Boolean)) {
    if (f === 'U') w.case = 'upper';
    else if (f === 'L') w.case = 'lower';
    else if (/^t-?\d+$/.test(f)) w.tracking = +f.slice(1) / 100;
    else if (/^k-?\d+$/.test(f)) w.skew = +f.slice(1) / 100;
    else if (f === 'o') w.outline = { color: 'ink', width: 0.07 };
    else if (f === 'O') w.outline2 = { color: 'paper', width: 0.18 };
    else if (f === 's') w.shadow = { color: 'ink', dx: 0.045, dy: 0.045 };
    else if (f === 'u') w.underline = { type: 'swoosh', color: 'accent' };
    else if (f === 'v') w.underline = { type: 'wave', color: 'accent', width: 0.06 };
    else if (f === 'i') w.inlineStripe = { color: 'paper', width: 0.045 };
    else if (f === '2') two = true;
    else if (f === 'S') stack = true;
    else if (f === 'J') w.justify = true;
    else if (/^f[psaiwn]$/.test(f)) w.fill = FILL[f[1]];
    else if (/^a-?\d+$/.test(f)) w.arch = +f.slice(1) / 100;
    else if (/^x\d+$/.test(f)) w.scale = +f.slice(1) / 100;
  }
  const words = name.split(' ');
  if (stack && words.length > 1) {
    // biggest word large, the rest smaller
    const longest = Math.max(...words.map((x) => x.length));
    const groups =
      words.length > 3
        ? [
            words.slice(0, Math.ceil(words.length / 2)).join(' '),
            words.slice(Math.ceil(words.length / 2)).join(' '),
          ]
        : words;
    w.lines = groups.map((t, i) => ({
      text: t,
      ...(two && i % 2 ? { fill: 'accent' } : {}),
      ...(w.justify
        ? {}
        : {
            scale:
              (w.scale || 1) *
              (t.length >= longest
                ? 1
                : Math.max(0.5, Math.min(1, 0.55 + (t.length / longest) * 0.45))),
          }),
    }));
    delete w.text;
    w.lineGap = 0.08;
  } else if (two) {
    let a, b2;
    if (words.length > 1) {
      a = words[0];
      b2 = words.slice(1).join(' ');
      w.parts = [
        { text: a, gap: 0.22 },
        { text: b2, fill: 'accent' },
      ];
    } else {
      const m = /^(.+?[a-zà-ÿ0-9])([A-ZÀ-Ý0-9].*)$/.exec(name);
      if (m) w.parts = [{ text: m[1] }, { text: m[2], fill: 'accent' }];
      else {
        const h = Math.ceil(name.length / 2);
        w.parts = [{ text: name.slice(0, h) }, { text: name.slice(h), fill: 'accent' }];
      }
    }
    delete w.text;
  }
  return w;
}
const pickBy = (seed, list) => list[hashStr(seed) % list.length];
function defaultSign(b) {
  const g = CATEGORIES[b.category]?.group,
    id = b.id;
  if (b.presence === 'civic')
    return { type: pickBy(id, ['carved-stone', 'brass-plaque', 'backlit-box']) };
  if (b.presence === 'local')
    return {
      type: pickBy(
        id,
        b.tier === 'luxury'
          ? ['brass-plaque', 'reverse-channel', 'blade']
          : [
              'hand-painted-wall',
              'painted-wood',
              'awning',
              'vinyl-window',
              'neon',
              'blade',
              'backlit-box',
            ],
      ),
    };
  if (g === 'nightlife')
    return { type: pickBy(id, ['neon', 'marquee', 'reverse-channel', 'blade']) };
  if (g === 'stay')
    return {
      type: pickBy(
        id,
        b.tier === 'luxury'
          ? ['reverse-channel', 'brass-plaque', 'rooftop-letters']
          : ['neon', 'rooftop-letters', 'pylon', 'blade'],
      ),
    };
  if (b.tier === 'luxury')
    return {
      type: pickBy(id, ['reverse-channel', 'brass-plaque', 'carved-stone', 'channel-letters']),
    };
  if (b.tier === 'budget')
    return {
      type: pickBy(id, ['backlit-box', 'channel-letters', 'pylon', 'awning', 'vinyl-window']),
    };
  return {
    type: pickBy(id, ['channel-letters', 'backlit-box', 'blade', 'reverse-channel', 'pylon']),
  };
}
function defaultPack(b) {
  if (b.tier === 'luxury')
    return { style: pickBy(b.id, ['luxe-foil', 'minimal', 'heritage-crest']) };
  if (b.presence === 'local')
    return {
      style: pickBy(b.id, ['bodega-classic', 'hand-lettered', 'craft-kraft', 'vintage-label']),
    };
  if (b.tier === 'budget')
    return { style: pickBy(b.id, ['bold-block', 'loud-burst', 'store-brand', 'retro-stripe']) };
  return {
    style: pickBy(b.id, [
      'bold-block',
      'retro-stripe',
      'minimal',
      'tropical-illustrated',
      'vintage-label',
      'tech-clean',
    ]),
  };
}

export function Q(name, cat, meta, colors, fonts, logo, tagline, story, extra = {}) {
  const [category, sub] = cat.split('/');
  const m = meta.split(/\s+/);
  const tier = m[0],
    presence = m[1] || 'chain',
    weight = +(m[2] || 5);
  const at = m.find((x) => x[0] === '@');
  const districts = at ? at.slice(1).split(',') : ['*'];
  const [primary, secondary, accent, ink, paper, neon] = colors
    .split(/\s+/)
    .map((c) => (c[0] === '#' ? c : '#' + c));
  const [display, text] = fonts.split('/');
  const [lk, mk, flags, lx0] = logo || ['w'];
  const lx = lx0 || {};
  const markSpec = parseMark(mk);
  let container = null;
  if (lx.c) {
    const [shape, fill, stroke] = lx.c.split(':');
    container = { shape, fill: fill || 'primary', ...(stroke ? { stroke } : {}), ...(lx.cx || {}) };
  }
  const word =
    lk === 'r' && !lx.word && !flags
      ? null
      : { ...parseWord(lx.text || name, flags, display, !!container?.fill), ...(lx.word || {}) };
  const L = {
    lockup: LOCK[lk] || lk,
    ...(markSpec ? { mark: (g, s, P) => drawMark(g, s, P, markSpec), markSpec } : {}),
    ...(word ? { word } : {}),
  };
  if (lx.sub)
    L.sub =
      typeof lx.sub === 'string'
        ? { text: lx.sub, font: text || 'din', fill: container?.fill ? 'paper' : 'ink' }
        : lx.sub;
  if (lx.over)
    L.over =
      typeof lx.over === 'string'
        ? { text: lx.over, font: text || 'din', fill: container?.fill ? 'paper' : 'ink' }
        : lx.over;
  if (container) L.container = container;
  L.markScale =
    lx.ms || (lk === 'h' && !(word && word.lines) ? 1.7 : lk === 'h' ? 1.15 : undefined);
  if (!L.markScale) delete L.markScale;
  if (lx.gap != null) L.gap = lx.gap;
  if (lx.rev) L.reverse = lx.rev;
  if (lx.side) L.markSide = lx.side;
  if (lk === 'r') {
    L.ring = {
      top: (lx.ring?.top || name).toUpperCase(),
      bottom: lx.ring?.bottom || lx.sub || '',
      font: display,
      fill: 'paper',
      ...(lx.ring || {}),
    };
    L.container = L.container || { fill: 'primary', stroke: 'ink', inner: 'paper' };
    if (markSpec && !markSpec[1].on) L.ring.core = lx.ring?.core || 'paper';
    delete L.sub;
  }
  if (!L.reverse && !container && lk !== 'r')
    L.reverse = { ink: 'paper', primary: lx.revp || 'paper' };
  const { sign, pack, ...rest } = extra;
  const def = {
    name,
    category,
    sub,
    tier,
    presence,
    weight,
    districts,
    tagline,
    story,
    palette: { primary, secondary, accent, ink, paper, ...(neon ? { neon } : {}) },
    fonts: { display, text: text || 'text' },
    logo: L,
    ...rest,
  };
  if (presence === 'local' && at && !def.home) def.home = districts[0];
  if (def.storefront == null)
    def.storefront =
      presence !== 'product' &&
      presence !== 'maker' &&
      (STORE_GROUPS.has(CATEGORIES[category]?.group) ||
        STORE_CATS.has(category) ||
        category === 'fashion' ||
        category === 'coffee');
  const b = B(def);
  b.signStyle =
    typeof sign === 'string'
      ? { type: sign }
      : sign
        ? { type: 'channel-letters', ...sign }
        : defaultSign(b);
  b.packaging =
    typeof pack === 'string'
      ? { style: pack }
      : pack
        ? { style: 'bold-block', ...pack }
        : defaultPack(b);
  if (!b.appears.length)
    b.appears =
      presence === 'product'
        ? ['package', 'shelf-strip', 'cooler-decal', 'billboard', 'truck']
        : presence === 'maker'
          ? ['nameplate', 'decal', 'service-van']
          : presence === 'civic'
            ? ['seal', 'vehicle', 'building-sign', 'uniform']
            : ['storefront', 'bag', 'receipt', 'uniform', 'billboard'];
  return b;
}
