// Core brands: the reference set every other brand file follows (one of each lockup, sign style and packaging style
// family). Written by the design-system lead; read this file before adding brands anywhere else.
import { B } from '../define.js';
import { disc, ring, sunRays, waveBand, leaf, palm, wader, monogram, TAU, font } from '../../logos/prims.js';

export default [
  // ------------------------------------------------------------------ fuel: mid-premium major chain
  B({
    id: 'egret', name: 'Egret', legal: 'Egret Petroleum Company', category: 'fuel', sub: 'station', tier: 'mid', presence: 'chain', weight: 8, storefront: true,
    tagline: 'Go lightly.', story: 'Founded in Port Cassia in 1958 as a marine fuel dock; the white egret has stood on its canopies ever since.',
    founded: 1958, districts: ['*'],
    palette: { primary: '#0b6b63', secondary: '#f3efe2', accent: '#f29f1f', ink: '#0d2b2a', paper: '#f7f4ea', neon: '#3fe0c8' },
    fonts: { display: 'geoBold', text: 'gill' },
    logo: {
      lockup: 'horizontal', markScale: 1.5, gap: 0.26, reverse: { primary: '#084f49', ink: 'paper' },
      mark(g, s, P) { // white egret in a teal roundel, low orange sun behind
        g.save(); g.beginPath(); g.arc(s / 2, s / 2, s * 0.49, 0, TAU); g.fillStyle = P.primary; g.fill(); g.clip();
        disc(g, s * 0.66, s * 0.62, s * 0.2, P.accent);
        g.fillStyle = 'rgba(0,0,0,0.18)'; waveBand(g, 0, s, s * 0.82, s * 0.018, 2.5, s * 0.07); g.fill(); g.fillRect(0, s * 0.84, s, s * 0.2);
        g.fillStyle = P.paper; wader(g, s * 0.4, s * 0.86, s * 0.74, { curl: 1.15, beak: 0.37 });
        g.restore(); ring(g, s / 2, s / 2, s * 0.47, s * 0.025, P.paper);
      },
      word: { text: 'EGRET', font: 'geoBold', tracking: 0.14, fill: 'ink' },
      sub: { text: 'FUEL · MARKET', font: 'gill', tracking: 0.3, fill: 'ink', scale: 0.2 },
    },
    signStyle: { type: 'pylon', face: 'backlit-box', canopy: { fascia: 'primary', stripe: 'accent' }, price: 'led-amber' },
    packaging: { style: 'minimal', bg: 'paper', band: 'primary' },
    appears: ['storefront', 'canopy', 'pump', 'billboard', 'tanker-truck', 'cup', 'uniform', 'receipt'],
    tags: ['fuel', 'coastal'],
  }),

  // ------------------------------------------------------------------ convenience: budget, open all night
  B({
    id: 'desvelo-24', name: 'Desvelo 24', legal: 'Desvelo Markets LLC', category: 'convenience', sub: 'chain', tier: 'budget', presence: 'chain', weight: 8, storefront: true,
    tagline: 'Nunca cerramos. We never close.', story: 'A Little Havana bodega that stopped locking its door in 1991 and grew into the city\'s all-night chain.',
    founded: 1991, districts: ['*'], avoid: ['bay-islands'],
    palette: { primary: '#4a1f8f', secondary: '#ffd21f', accent: '#ff5aa0', ink: '#1c0f33', paper: '#fff8e1', neon: '#b98cff' },
    fonts: { display: 'rounded', text: 'cond' },
    logo: {
      lockup: 'horizontal', gap: 0.14, markScale: 1.25,
      mark(g, s, P) { // a sleepless moon: crescent with one wide-open eye
        disc(g, s * 0.5, s * 0.5, s * 0.44, P.secondary);
        g.globalCompositeOperation = 'destination-out'; disc(g, s * 0.68, s * 0.4, s * 0.36, '#000'); g.globalCompositeOperation = 'source-over';
        disc(g, s * 0.64, s * 0.44, s * 0.17, P.paper); disc(g, s * 0.66, s * 0.45, s * 0.095, P.ink); disc(g, s * 0.69, s * 0.42, s * 0.03, P.paper);
        g.strokeStyle = P.accent; g.lineWidth = s * 0.03; g.lineCap = 'round';
        for (const a of [-1.2, -0.75, -0.3]) { g.beginPath(); g.moveTo(s * 0.64 + Math.cos(a) * s * 0.22, s * 0.44 + Math.sin(a) * s * 0.22); g.lineTo(s * 0.64 + Math.cos(a) * s * 0.3, s * 0.44 + Math.sin(a) * s * 0.3); g.stroke(); }
      },
      word: { parts: [{ text: 'Desvelo', fill: 'secondary' }, { text: '24', fill: 'accent', scale: 1.15, gap: 0.12 }], font: 'rounded', tracking: -0.01, shadow: { color: '#2b0f5c', dx: 0.05, dy: 0.05 } },
      container: { shape: 'pill', fill: 'primary', padX: 0.42, padY: 0.24 },
    },
    signStyle: { type: 'backlit-box', shape: 'pill', border: 'secondary', windowPosters: true, neonAccent: 'accent' },
    packaging: { style: 'store-brand', bg: 'primary', band: 'secondary' },
    appears: ['storefront', 'bag', 'cup', 'receipt', 'window-poster', 'uniform', 'coffee-cup'],
    tags: ['24h', 'latino', 'bodega'],
  }),

  // ------------------------------------------------------------------ fashion house: luxury, with a monogram canvas
  B({
    id: 'vauclere', name: 'Vauclère', legal: 'Maison Vauclère S.A.', category: 'fashion', sub: 'house', tier: 'luxury', presence: 'chain', weight: 2, storefront: true,
    tagline: 'Depuis 1894.', story: 'A Lyon trunk maker turned fashion house; its diamond-V canvas is the most copied pattern on the Southline flea markets.',
    founded: 1894, districts: ['design-district', 'brickell', 'south-beach', 'mid-beach', 'airport'],
    palette: { primary: '#173a2c', secondary: '#c9a35a', accent: '#7a1f2b', ink: '#141311', paper: '#efe6d2', neon: '#f3e2b8' },
    fonts: { display: 'didoneLight', text: 'gillLight' },
    logo: {
      lockup: 'stacked', gap: 0.2, markScale: 1.5, reverse: { ink: 'secondary' },
      mark(g, s, P) { // two V's point to point: a diamond with a pearl
        g.strokeStyle = P.ink; g.lineWidth = s * 0.055; g.lineJoin = 'miter'; g.miterLimit = 8;
        g.beginPath(); g.moveTo(s * 0.2, s * 0.06); g.lineTo(s * 0.5, s * 0.62); g.lineTo(s * 0.8, s * 0.06); g.stroke();
        g.lineWidth = s * 0.022; g.beginPath(); g.moveTo(s * 0.2, s * 0.94); g.lineTo(s * 0.5, s * 0.38); g.lineTo(s * 0.8, s * 0.94); g.stroke();
        disc(g, s * 0.5, s * 0.5, s * 0.035, P.secondary);
      },
      word: { text: 'VAUCLÈRE', font: 'didoneLight', tracking: 0.22, fill: 'ink' },
      sub: { text: 'LYON · 1894', font: 'gillLight', tracking: 0.42, fill: 'ink', scale: 0.17 },
    },
    pattern: {
      bg: 'primary', ink: 'secondary',
      draw(g, size, P, b, c) { // half-drop diamond-V canvas with small sun ticks between
        const n = 4, cell = size / n; g.strokeStyle = c.ink; g.fillStyle = c.ink; g.lineJoin = 'miter';
        for (let j = -1; j <= n * 2; j++) for (let i = -1; i <= n; i++) {
          const x = i * cell + (j % 2 ? cell / 2 : 0), y = j * cell / 2, k = cell * 0.2;
          if ((i + Math.floor(j / 2)) % 2 === 0) {
            g.lineWidth = cell * 0.035; g.beginPath(); g.moveTo(x - k, y - k * 0.95); g.lineTo(x, y + k * 0.25); g.lineTo(x + k, y - k * 0.95); g.stroke();
            g.lineWidth = cell * 0.014; g.beginPath(); g.moveTo(x - k, y + k * 0.95); g.lineTo(x, y - k * 0.25); g.lineTo(x + k, y + k * 0.95); g.stroke();
          } else {
            g.lineWidth = cell * 0.014; g.beginPath(); g.arc(x, y, cell * 0.05, 0, TAU); g.stroke();
            for (let t = 0; t < 8; t++) { const a = t / 8 * TAU; g.beginPath(); g.moveTo(x + Math.cos(a) * cell * 0.075, y + Math.sin(a) * cell * 0.075); g.lineTo(x + Math.cos(a) * cell * 0.115, y + Math.sin(a) * cell * 0.115); g.stroke(); }
          }
        }
      },
    },
    signStyle: { type: 'reverse-channel', metal: 'brass', mount: 'limestone', halo: '#fff1d0', height: 0.42 },
    packaging: { style: 'luxe-foil', bg: 'primary', foil: 'secondary', ribbon: 'accent' },
    appears: ['storefront', 'shopping-bag', 'billboard', 'airport-ad', 'handbag', 'luggage'],
    tags: ['monogram', 'leather-goods', 'french'],
  }),

  // ------------------------------------------------------------------ Cuban walk-up window: local independent
  B({
    id: 'yolis-ventanita', name: "Yoli's Ventanita", legal: 'Yolanda Ruiz Cafetería Inc.', category: 'cuban-cafe', sub: 'ventanita', tier: 'budget', presence: 'local', weight: 1, storefront: true,
    tagline: 'El cafecito de la esquina.', story: 'Yolanda Ruiz has pulled coladas through the same window on SW 8th Street since 1984; her regulars argue politics on the sidewalk by 6 AM.',
    founded: 1984, owner: 'Yolanda Ruiz', districts: ['little-havana'], home: 'little-havana',
    palette: { primary: '#c8102e', secondary: '#f6d55c', accent: '#1f6f8b', ink: '#3b1d10', paper: '#fdf3dc', neon: '#ff5a4d' },
    fonts: { display: 'signpainter', text: 'slab' },
    logo: {
      lockup: 'stacked', gap: 0.02, markScale: 0.9, reverse: { primary: 'secondary', ink: 'paper', accent: 'paper' },
      mark(g, s, P) { // a tacita of Cuban coffee with three curls of steam
        g.strokeStyle = P.ink; g.lineWidth = s * 0.03; g.lineCap = 'round';
        for (const dx of [-0.12, 0, 0.12]) { g.beginPath(); g.moveTo(s * (0.5 + dx), s * 0.44); g.bezierCurveTo(s * (0.42 + dx), s * 0.34, s * (0.58 + dx), s * 0.26, s * (0.5 + dx), s * 0.14); g.stroke(); }
        g.fillStyle = P.paper; g.beginPath(); g.moveTo(s * 0.26, s * 0.52); g.lineTo(s * 0.74, s * 0.52); g.quadraticCurveTo(s * 0.72, s * 0.84, s * 0.5, s * 0.84); g.quadraticCurveTo(s * 0.28, s * 0.84, s * 0.26, s * 0.52); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = P.ink; g.beginPath(); g.ellipse(s * 0.5, s * 0.535, s * 0.21, s * 0.035, 0, 0, TAU); g.fill();
        g.beginPath(); g.arc(s * 0.78, s * 0.63, s * 0.075, -1.3, 1.5); g.stroke();
        g.fillStyle = P.accent; g.beginPath(); g.ellipse(s * 0.5, s * 0.9, s * 0.34, s * 0.04, 0, 0, TAU); g.fill();
      },
      word: { lines: [{ text: "Yoli's", font: 'signpainter', fill: 'primary', scale: 1.3, outline2: { color: 'paper', width: 0.16 }, shadow: { color: 'ink', dx: 0.035, dy: 0.035 } },
        { text: 'VENTANITA', font: 'slab', fill: 'ink', scale: 0.42, tracking: 0.2 }], lineGap: 0.02 },
      sub: { text: 'CAFÉ CUBANO · DESDE 1984', font: 'slab', tracking: 0.14, fill: 'accent', scale: 0.2, rule: true },
    },
    signStyle: { type: 'hand-painted-wall', board: 'painted-wood', lettering: 'one-shot enamel', extras: ['menu-board', 'neon-open', 'window-decals'] },
    packaging: { style: 'bodega-classic', bg: 'paper', band: 'primary' },
    appears: ['storefront', 'cup', 'paper-bag', 'menu', 'receipt', 'apron'],
    tags: ['cuban', 'coffee', 'calle-ocho', 'named-local'],
  }),

  // ------------------------------------------------------------------ cola: budget-to-mid product brand
  B({
    id: 'zafra-cola', name: 'Zafra', legal: 'Zafra Bottling Works', category: 'beverage', sub: 'cola', tier: 'mid', presence: 'product', weight: 9,
    tagline: 'Sweet as the harvest.', story: 'Cane-sugar cola bottled in Citrus Flats since 1936; every corner cooler in the city has a row of it.',
    founded: 1936, districts: ['*'],
    palette: { primary: '#0f3fae', secondary: '#f4e9c9', accent: '#f2b705', ink: '#0a1f55', paper: '#f4e9c9', neon: '#5d8bff' },
    fonts: { display: 'brush', text: 'cond' },
    logo: {
      lockup: 'wordmark',
      word: { text: 'Zafra', font: 'brush', fill: 'paper', skew: 0.08, outline2: { color: 'primary', width: 0.2 }, shadow: { color: 'ink', dx: 0.03, dy: 0.04 }, underline: { type: 'swoosh', color: 'accent', width: 0.08, offset: 0.12 } },
      sub: { text: 'CANE SUGAR COLA', font: 'condHeavy', tracking: 0.22, fill: 'paper', scale: 0.17 },
      container: { shape: 'oval', fill: 'primary', stroke: 'accent', strokeWidth: 0.03, inner: 'paper', innerGap: 0.05, padX: 0.42, padY: 0.3 },
    },
    signStyle: { type: 'marquee', note: 'product brand: appears on coolers, wall murals, bottle-cap signs and delivery trucks' },
    packaging: { style: 'retro-stripe', bg: 'primary', band: 'paper', stripe: 'accent', icon: 'sugarcane' },
    appears: ['can', 'bottle', 'cooler-decal', 'wall-mural', 'truck', 'billboard', 'umbrella', 'bottle-cap-sign'],
    tags: ['soda', 'heritage'],
  }),

  // ------------------------------------------------------------------ private bank: luxury, engraved
  B({
    id: 'cormorant-trust', name: 'Cormorant Trust', legal: 'The Cormorant Trust Company, N.A.', category: 'bank', sub: 'private', tier: 'luxury', presence: 'regional', weight: 2, storefront: true,
    tagline: 'Patience compounds.', story: 'Old shipping money; the Brickell tower lobby still has the 1926 vault door on display.',
    founded: 1926, districts: ['brickell', 'downtown', 'bay-islands', 'mid-beach'],
    palette: { primary: '#10243d', secondary: '#b8975a', accent: '#b8975a', ink: '#10243d', paper: '#f2efe8', neon: '#e7d3a3' },
    fonts: { display: 'copperplate', text: 'baskerville' },
    logo: {
      lockup: 'emblem', gap: 0.14, markScale: 1.25,
      mark(g, s, P) { // a cormorant drying its wings, drawn as one engraved silhouette
        g.fillStyle = P.secondary; g.strokeStyle = P.secondary; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(s * 0.5, s * 0.92); g.lineTo(s * 0.44, s * 0.6);
        g.quadraticCurveTo(s * 0.2, s * 0.62, s * 0.04, s * 0.3); g.quadraticCurveTo(s * 0.16, s * 0.42, s * 0.2, s * 0.36); g.quadraticCurveTo(s * 0.26, s * 0.46, s * 0.31, s * 0.4); g.quadraticCurveTo(s * 0.36, s * 0.48, s * 0.44, s * 0.42);
        g.quadraticCurveTo(s * 0.47, s * 0.3, s * 0.45, s * 0.2); g.quadraticCurveTo(s * 0.46, s * 0.1, s * 0.56, s * 0.1); g.lineTo(s * 0.72, s * 0.13); g.lineTo(s * 0.57, s * 0.17);
        g.quadraticCurveTo(s * 0.54, s * 0.3, s * 0.57, s * 0.42); g.quadraticCurveTo(s * 0.64, s * 0.48, s * 0.69, s * 0.4); g.quadraticCurveTo(s * 0.74, s * 0.46, s * 0.8, s * 0.36); g.quadraticCurveTo(s * 0.84, s * 0.42, s * 0.96, s * 0.3);
        g.quadraticCurveTo(s * 0.8, s * 0.62, s * 0.56, s * 0.6); g.closePath(); g.fill();
        g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(s * 0.3, s * 0.95); g.lineTo(s * 0.7, s * 0.95); g.stroke();
      },
      word: { text: 'CORMORANT TRUST', font: 'copperplate', tracking: 0.12, fill: 'paper', scale: 0.6 },
      sub: { text: 'PRIVATE BANKING · EST. 1926', font: 'copperplateLight', tracking: 0.22, fill: 'secondary', scale: 0.15, rule: true },
      container: { shape: 'rect', fill: 'primary', inner: 'secondary', innerGap: 0.045, innerWidth: 0.008, padX: 0.55, padY: 0.42 },
    },
    signStyle: { type: 'brass-plaque', mount: 'granite', letters: 'engraved, black-filled', secondary: 'carved-stone' },
    packaging: { style: 'heritage-crest', bg: 'paper', band: 'primary' },
    appears: ['storefront', 'atm', 'card', 'statement', 'pen', 'billboard'],
    tags: ['bank', 'old-money'],
  }),

  // ------------------------------------------------------------------ brewery: local craft, roundel lockup
  B({
    id: 'tern-key-brewing', name: 'Tern Key Brewing Co.', legal: 'Tern Key Brewing Company', category: 'beer', sub: 'craft', tier: 'mid', presence: 'regional', weight: 4, storefront: true,
    tagline: 'Last call before Cuba.', story: 'Two charter captains started brewing in a boat shed at the end of the Keys in 2009; the taproom still smells like bottom paint.',
    founded: 2009, districts: ['*'], home: 'tern-key',
    palette: { primary: '#14506b', secondary: '#f1e4c3', accent: '#e8652a', ink: '#0d2f40', paper: '#f1e4c3', neon: '#ffb35c' },
    fonts: { display: 'slab', text: 'typewriter' },
    logo: {
      lockup: 'roundel', markScale: 0.86,
      mark(g, s, P) { // a tern diving over a striped sunset
        g.save(); g.beginPath(); g.arc(s / 2, s / 2, s * 0.5, 0, TAU); g.clip();
        g.fillStyle = P.paper; g.fillRect(0, 0, s, s);
        g.fillStyle = P.accent; g.beginPath(); g.arc(s / 2, s * 0.66, s * 0.3, Math.PI, 0); g.fill();
        g.fillStyle = P.paper; for (let i = 0; i < 4; i++) g.fillRect(0, s * (0.44 + i * 0.062), s, s * 0.016 * (i + 1) * 0.6);
        g.fillStyle = P.primary; g.fillRect(0, s * 0.66, s, s * 0.4);
        g.fillStyle = P.paper; for (let i = 0; i < 3; i++) { waveBand(g, 0, s, s * (0.74 + i * 0.09), s * 0.012, 3, s * 0.018, i); g.fill(); }
        g.restore();
        g.fillStyle = P.ink; g.beginPath(); // tern: swept wings, forked tail, pointing down-right
        g.moveTo(s * 0.7, s * 0.56); g.lineTo(s * 0.52, s * 0.4); g.quadraticCurveTo(s * 0.62, s * 0.2, s * 0.84, s * 0.1); g.quadraticCurveTo(s * 0.62, s * 0.26, s * 0.48, s * 0.36);
        g.lineTo(s * 0.2, s * 0.14); g.lineTo(s * 0.3, s * 0.25); g.lineTo(s * 0.14, s * 0.24); g.lineTo(s * 0.4, s * 0.4);
        g.quadraticCurveTo(s * 0.22, s * 0.4, s * 0.06, s * 0.52); g.quadraticCurveTo(s * 0.28, s * 0.46, s * 0.46, s * 0.5); g.closePath(); g.fill();
      },
      ring: { top: 'TERN KEY BREWING CO.', bottom: 'EST. 2009 · MILE 0', font: 'slab', fill: 'paper', tracking: 0.1, inner: 0.335, scale: 0.5 },
      container: { fill: 'primary', stroke: 'ink', inner: 'paper' },
    },
    signStyle: { type: 'painted-wood', board: 'weathered cypress', rope: true, lit: 'gooseneck' },
    packaging: { style: 'craft-kraft', bg: 'paper', band: 'primary' },
    appears: ['can', 'bottle', 'tap-handle', 'coaster', 'storefront', 'neon-bar-sign', 'truck', 'tee'],
    tags: ['beer', 'keys', 'craft'],
  }),
];
