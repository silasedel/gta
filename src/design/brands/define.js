// Brand definition helper (DESIGN-SYSTEM track). Every brand in src/design/brands/data/*.js goes through B(), which
// fills defaults, validates the shape and attaches the drawing methods. See src/design/README.md for the schema.
import { makeCanvas, ctx2d, hexNum, inkOn, lighten, darken, slug, rng } from '../util.js';
import { drawLogo, logoCanvas, logoAspect, logoOn } from '../logos/engine.js';

export const TIERS = ['luxury', 'mid', 'budget'];
export const PRESENCE = ['chain', 'regional', 'local', 'product', 'maker', 'civic'];
export const SIGN_TYPES = [
  'channel-letters',
  'reverse-channel',
  'neon',
  'blade',
  'painted-wood',
  'backlit-box',
  'pylon',
  'awning',
  'vinyl-window',
  'marquee',
  'hand-painted-wall',
  'carved-stone',
  'brass-plaque',
  'led-screen',
  'stencil',
  'rooftop-letters',
];
export const PACKAGING_STYLES = [
  'bold-block',
  'minimal',
  'retro-stripe',
  'craft-kraft',
  'luxe-foil',
  'clinical',
  'loud-burst',
  'tropical-illustrated',
  'heritage-crest',
  'neon-energy',
  'kids-cartoon',
  'store-brand',
  'hand-lettered',
  'tech-clean',
  'vintage-label',
  'bodega-classic',
];
export const DISTRICTS = [
  'south-beach',
  'mid-beach',
  'bay-islands',
  'port',
  'downtown',
  'brickell',
  'little-havana',
  'overtown',
  'wynwood',
  'edgewater',
  'design-district',
  'airport',
  'south-suburbs',
  'everglades',
  'key-paloma',
  'middle-keys',
  'tern-key',
  'north-suburbs',
  'lake-amaro',
  'citrus-flats',
  'sawpalm-ridge',
  'port-cassia',
];

const texCache = new WeakMap(); // brand -> Map(key -> texture)

function methods(b) {
  return {
    // number colors for three.js materials
    color(key = 'primary') {
      return hexNum(b.palette[key] || key);
    },
    logoAspect(opts) {
      return logoAspect(b, opts);
    },
    // draw the logo fitted in a box on any 2D canvas
    drawLogo(g, x, y, w, h, opts) {
      return drawLogo(g, b, x, y, w, h, opts);
    },
    // same, but picks a knockout treatment when the brand colors would vanish on `bg`
    drawLogoOn(g, bg, x, y, w, h, opts) {
      return logoOn(g, b, bg, x, y, w, h, opts);
    },
    logoCanvas(size = 1024, opts) {
      return logoCanvas(b, size, opts);
    },
    logoTexture(THREE, size = 1024, opts = {}) {
      let m = texCache.get(b);
      if (!m) texCache.set(b, (m = new Map()));
      const key = size + '|' + JSON.stringify(opts);
      if (m.has(key)) return m.get(key);
      const c = logoCanvas(b, size, opts);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.userData = { aspect: c.width / c.height, brand: b.id };
      m.set(key, t);
      return t;
    },
    // A seamless repeat tile of the brand pattern (monogram canvas for fashion houses, a mark repeat for everyone else).
    patternCanvas(size = 512, opts = {}) {
      const c = makeCanvas(size, size),
        g = ctx2d(c);
      const P = b.palette;
      const bg = opts.bg || b.pattern?.bg || P.paper;
      const ink = opts.ink || b.pattern?.ink || P.primary;
      g.fillStyle = P[bg] || bg;
      g.fillRect(0, 0, size, size);
      if (typeof b.pattern?.draw === 'function') {
        b.pattern.draw(g, size, P, b, { ink: P[ink] || ink, bg: P[bg] || bg });
        return c;
      }
      // default: half-drop repeat of the mark (or the wordmark when there is no mark)
      const n = b.pattern?.repeat || 4,
        cell = size / n;
      const variant = typeof b.logo?.mark === 'function' ? 'mark' : 'word';
      for (let j = -1; j <= n; j++)
        for (let i = -1; i <= n; i++) {
          const ox = i * cell + (j % 2 ? cell / 2 : 0),
            oy = j * cell;
          for (const [dx, dy] of [
            [0, 0],
            [size, 0],
            [-size, 0],
          ])
            drawLogo(g, b, ox + dx + cell * 0.2, oy + dy + cell * 0.2, cell * 0.6, cell * 0.6, {
              variant,
              mono: P[ink] || ink,
            });
        }
      return c;
    },
    patternTexture(THREE, size = 512, opts = {}) {
      let m = texCache.get(b);
      if (!m) texCache.set(b, (m = new Map()));
      const key = 'pat' + size + '|' + JSON.stringify(opts);
      if (m.has(key)) return m.get(key);
      const t = new THREE.CanvasTexture(this.patternCanvas(size, opts));
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      m.set(key, t);
      return t;
    },
    dispose() {
      const m = texCache.get(b);
      if (m) {
        for (const t of m.values()) t.dispose();
        m.clear();
      }
    },
  };
}

export function B(def) {
  if (!def || !def.name) throw new Error('brand needs a name');
  const b = { ...def };
  b.id = def.id || slug(def.name);
  b.tier = def.tier || 'mid';
  b.presence = def.presence || 'chain';
  b.weight = def.weight ?? (b.presence === 'local' ? 1 : 5);
  b.districts = def.districts || ['*'];
  b.tags = def.tags || [];
  const p = def.palette || {};
  b.palette = {
    primary: '#1b4f9c',
    secondary: '#f2b233',
    accent: p.secondary || '#e23d28',
    ink: '#14171c',
    paper: '#ffffff',
    ...p,
  };
  b.palette.neon = b.palette.neon || lighten(b.palette.primary, 0.25);
  b.palette.onPrimary =
    b.palette.onPrimary || inkOn(b.palette.primary, b.palette.paper, b.palette.ink);
  b.palette.dark = b.palette.dark || darken(b.palette.primary, 0.55);
  b.fonts = { display: 'grotesk', text: 'text', ...(def.fonts || {}) };
  b.logo = def.logo || {
    lockup: 'wordmark',
    word: { text: b.name, font: b.fonts.display, fill: 'primary' },
  };
  if (b.logo.word && !b.logo.word.text && !b.logo.word.parts && !b.logo.word.lines)
    b.logo.word.text = b.name;
  b.signStyle = { type: 'channel-letters', ...(def.signStyle || {}) };
  b.packaging = { style: 'bold-block', ...(def.packaging || {}) };
  b.appears = def.appears || [];
  Object.assign(b, methods(b));
  b.seed = (rng(b.id)() * 1e9) >>> 0;
  return b;
}
