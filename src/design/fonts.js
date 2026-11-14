// Typeface roles for the design system. Every brand picks roles, never raw font names, so the look can be
// re-pointed in one place. Each role is a CSS stack: an optional bundled family first (files dropped into
// public/assets/design/fonts/ are picked up by loadFonts), then macOS faces, then Windows/generic fallbacks.
//
// font('geoBlack', 64)                       -> '800 64px "PS Geo", Futura, "Century Gothic", ...'
// font('script', 48, { italic: true })       -> 'italic 700 48px "PS Script", "Snell Roundhand", ...'
// font({ role: 'slab', weight: 400 }, 30)    -> role objects are accepted too
import { hasDOM } from './util.js';

const R = (stack, weight = 700, opts = {}) => ({ stack, weight, ...opts });
export const FONT_ROLES = {
  // ---- geometric and grotesque sans
  geo: R('"PS Geo", Futura, "Century Gothic", "Trebuchet MS", sans-serif', 500),
  geoBold: R('"PS Geo", Futura, "Century Gothic", "Trebuchet MS", sans-serif', 700),
  geoCond: R('"PS Geo Condensed", Futura, "Arial Narrow", sans-serif', 500, { stretch: 'condensed' }),
  geoCondBlack: R('"PS Geo Condensed", Futura, Impact, "Arial Narrow", sans-serif', 800, { stretch: 'condensed' }),
  grotesk: R('"PS Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif', 700),
  groteskBlack: R('"PS Grotesk", "Helvetica Neue", "Arial Black", Arial, sans-serif', 900),
  groteskThin: R('"PS Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif', 100),
  groteskCond: R('"PS Grotesk Condensed", "Helvetica Neue", "Arial Narrow", sans-serif', 900, { stretch: 'condensed' }),
  avenir: R('"PS Avenir", "Avenir Next", Avenir, "Segoe UI", sans-serif', 600),
  avenirHeavy: R('"PS Avenir", "Avenir Next", Avenir, "Segoe UI Black", sans-serif', 900),
  cond: R('"PS Cond", "Avenir Next Condensed", "Arial Narrow", sans-serif', 700),
  condHeavy: R('"PS Cond", "Avenir Next Condensed", Impact, "Arial Narrow", sans-serif', 900),
  condItalic: R('"PS Cond", "Avenir Next Condensed", Impact, "Arial Narrow", sans-serif', 900, { italic: true }),
  din: R('"PS Din", "DIN Alternate", "Bahnschrift", "Arial Narrow", sans-serif', 700),
  dinCond: R('"PS Din Condensed", "DIN Condensed", "Bahnschrift Condensed", "Arial Narrow", sans-serif', 400),
  impact: R('"PS Impact", Impact, "Haettenschweiler", "Arial Narrow", sans-serif', 400),
  black: R('"PS Black", "Arial Black", "Avenir Next", sans-serif', 900),
  wide: R('"PS Wide", "Hiragino Sans", "Arial Black", Verdana, sans-serif', 900),
  verdana: R('Verdana, Geneva, sans-serif', 700),
  rounded: R('"PS Rounded", "Arial Rounded MT Bold", "Varela Round", "Trebuchet MS", sans-serif', 700),
  // ---- humanist sans
  gill: R('"PS Gill", "Gill Sans", "Gill Sans MT", Calibri, sans-serif', 700),
  gillLight: R('"PS Gill", "Gill Sans", "Gill Sans MT", Calibri, sans-serif', 300),
  gillUltra: R('"PS Gill", "Gill Sans", "Gill Sans Ultra Bold", "Arial Black", sans-serif', 900),
  optima: R('"PS Optima", Optima, Candara, "Segoe UI", sans-serif', 700),
  optimaBlack: R('"PS Optima", Optima, Candara, "Segoe UI", sans-serif', 900),
  seravek: R('Seravek, "Gill Sans", Calibri, sans-serif', 700),
  skia: R('Skia, Optima, Candara, sans-serif', 700),
  // ---- serifs
  didone: R('"PS Didone", Didot, "Bodoni 72", "Bodoni MT", "Times New Roman", serif', 700),
  didoneLight: R('"PS Didone", Didot, "Bodoni 72", "Bodoni MT", "Times New Roman", serif', 400),
  didoneItalic: R('"PS Didone", Didot, "Bodoni 72", "Bodoni MT", "Times New Roman", serif', 400, { italic: true }),
  bodoni: R('"PS Bodoni", "Bodoni 72", Didot, "Bodoni MT", serif', 700),
  bodoniCaps: R('"Bodoni 72 Smallcaps", "Bodoni 72", Didot, serif', 400),
  baskerville: R('"PS Baskerville", Baskerville, "Baskerville Old Face", Georgia, serif', 700),
  baskervilleItalic: R('"PS Baskerville", Baskerville, "Baskerville Old Face", Georgia, serif', 400, { italic: true }),
  caslon: R('"Big Caslon", "Book Antiqua", Palatino, Georgia, serif', 400),
  cochin: R('Cochin, Georgia, "Times New Roman", serif', 700),
  hoefler: R('"Hoefler Text", "Baskerville Old Face", Garamond, Georgia, serif', 700),
  hoeflerBlack: R('"Hoefler Text", Georgia, serif', 900),
  palatino: R('Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif', 700),
  charter: R('Charter, "Bitstream Charter", Cambria, Georgia, serif', 900),
  georgia: R('Georgia, "Times New Roman", serif', 700),
  mincho: R('"Hiragino Mincho ProN", "Songti SC", "Times New Roman", serif', 700),
  // ---- slabs and typewriters
  slab: R('"PS Slab", Rockwell, "Rockwell Nova", "Courier New", serif', 700),
  slabLight: R('"PS Slab", Rockwell, "Rockwell Nova", "Courier New", serif', 400),
  clarendon: R('"PS Clarendon", Superclarendon, Rockwell, Georgia, serif', 900),
  typewriter: R('"PS Typewriter", "American Typewriter", "Courier New", monospace', 700),
  typewriterCond: R('"PS Typewriter", "American Typewriter", "Courier New", monospace', 300, { stretch: 'condensed' }),
  // ---- engraved and titling
  copperplate: R('"PS Copperplate", Copperplate, "Copperplate Gothic Bold", "Trajan Pro", serif', 700),
  copperplateLight: R('"PS Copperplate", Copperplate, "Copperplate Gothic Light", serif', 300),
  engraved: R('"Academy Engraved LET", "Colonna MT", Didot, serif', 400),
  inline: R('"PS Inline", Phosphate, Impact, sans-serif', 400),
  // ---- scripts and hand lettering
  script: R('"PS Script", "Snell Roundhand", "Edwardian Script ITC", "Segoe Script", cursive', 700),
  scriptBlack: R('"PS Script", "Snell Roundhand", "Segoe Script", cursive', 900),
  scriptFine: R('"Savoye LET", "Snell Roundhand", "Segoe Script", cursive', 400),
  flourish: R('Zapfino, "Snell Roundhand", cursive', 400),
  chancery: R('"Apple Chancery", "Lucida Calligraphy", "Segoe Script", cursive', 400),
  brush: R('"PS Brush", "Brush Script MT", "Segoe Script", cursive', 400),
  signpainter: R('"PS Signpainter", SignPainter, "Brush Script MT", "Segoe Script", cursive', 400),
  marker: R('"PS Marker", "Marker Felt", "Comic Sans MS", cursive', 700),
  chalk: R('Chalkduster, "Marker Felt", "Comic Sans MS", cursive', 400),
  chalkboard: R('"Chalkboard SE", "Comic Sans MS", cursive', 700),
  hand: R('"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive', 700),
  note: R('Noteworthy, "Segoe Print", "Comic Sans MS", cursive', 700),
  // ---- display and character faces
  roman: R('Herculanum, Papyrus, "Trajan Pro", fantasy', 400),
  papyrus: R('Papyrus, Herculanum, fantasy', 400),
  uncial: R('Trattatello, Luminari, fantasy', 400),
  gothic: R('Luminari, Trattatello, fantasy', 400),
  party: R('"Party LET", "Snell Roundhand", fantasy', 400),
  tech: R('Silom, Krungthep, "Lucida Console", monospace', 400),
  techWide: R('Krungthep, Silom, "Lucida Console", monospace', 400),
  kefa: R('Kefa, Georgia, serif', 700),
  // ---- mono
  mono: R('"PS Mono", Menlo, Consolas, "Courier New", monospace', 700),
  monoLight: R('"PS Mono", Menlo, Consolas, "Courier New", monospace', 400),
  ptmono: R('"PT Mono", Menlo, Consolas, monospace', 700),
  courier: R('"Courier New", Courier, monospace', 700),
  // ---- text faces for small print (labels, receipts, menus)
  text: R('"Helvetica Neue", Helvetica, Arial, sans-serif', 400),
  textBold: R('"Helvetica Neue", Helvetica, Arial, sans-serif', 700),
  textNarrow: R('"PT Sans Narrow", "Arial Narrow", Arial, sans-serif', 400),
  textNarrowBold: R('"PT Sans Narrow", "Arial Narrow", Arial, sans-serif', 700),
  textSerif: R('Georgia, "Times New Roman", serif', 400),
  receipt: R('"PT Mono", Menlo, "Courier New", monospace', 400),
};
export const fontRoles = Object.keys(FONT_ROLES);

export function fontSpec(role) {
  if (role && typeof role === 'object') { const base = FONT_ROLES[role.role] || FONT_ROLES.grotesk; return { ...base, ...role }; }
  return FONT_ROLES[role] || (role && /[",]/.test(role) ? R(role) : FONT_ROLES.grotesk);
}
// CSS font shorthand for a role at a pixel size.
export function font(role, px, over = {}) {
  const s = { ...fontSpec(role), ...over };
  return `${s.italic ? 'italic ' : ''}${s.weight || 400} ${s.stretch ? s.stretch + ' ' : ''}${Math.max(1, Math.round(px * 10) / 10)}px ${s.stack}`;
}

// Optional bundled faces: public/assets/design/fonts/<file> registered under the "PS ..." family names above.
// The manifest is empty until the lead approves a font license (see docs/v2/reports/design-system.md).
export const BUNDLED_FONTS = [/* { family: 'PS Geo', file: 'ps-geo.woff2', weight: '400 900' } */];
let fontsPromise = null;
export function loadFonts(base = 'assets/design/fonts/') {
  if (fontsPromise) return fontsPromise;
  if (!hasDOM || !BUNDLED_FONTS.length || typeof FontFace === 'undefined') return (fontsPromise = Promise.resolve([]));
  fontsPromise = Promise.all(BUNDLED_FONTS.map(async (f) => {
    try { const face = new FontFace(f.family, `url(${base}${f.file})`, { weight: f.weight || '400', style: f.style || 'normal' }); await face.load(); document.fonts.add(face); return f.family; }
    catch (e) { return null; }
  }));
  return fontsPromise;
}
