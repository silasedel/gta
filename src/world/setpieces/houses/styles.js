// House generator: the six styles and their palettes (track: houses). All colors are our own picks (no references to brands).
export const STYLES = ['keys', 'ranch', 'med', 'deco', 'mcm', 'bungalow'];

// Muted Florida palettes (lead review, Nov 17): sun-faded pastels, white, beige, light gray, sage; trims white / cream / soft tones,
// no saturated lime, purple or tomato. ?housepal=old keeps the earlier set (before/after sheets).
const OLD_PAL = typeof location !== 'undefined' && /[?&]housepal=old\b/.test(location.search);
const PALETTES_NEW = {
  keys: { body: [0x9fbdb0, 0xe6d9b2, 0xf0ece0, 0xa9c1d2, 0xe4c2b0, 0xcdd6b4, 0xd9b9c2, 0xb7cbc4, 0xeadcae, 0x93b9b5, 0xd6cadd], trim: [0xf2f0ea, 0xe8e2d2, 0xd8d0b8], accent: [0x4a6a7a, 0x3a5a4a, 0x2a4a6a, 0x6a5a4a, 0x3f7478, 0x8a5a50], roof: [0xb8bcc0, 0x9aa0a8, 0xc9c6bd, 0x8e9a8e] },
  ranch: { body: [0xefe6d2, 0xd9cdb5, 0xc8d4cc, 0xe6d3b8, 0xd8dccf, 0xf1e8dc, 0xb9c7cf, 0xe7d9c4, 0xdedfda], trim: [0xf6f3ec, 0xffffff, 0xe2dccd], accent: [0x2f4a5c, 0x5a3a2a, 0x3e5a3a, 0x6a3a34, 0x3b3b3b], roof: [0x5e5a55, 0x7a7068, 0x4a4e52, 0x8a7a6a, 0x6b6f72] },
  med: { body: [0xf2dfc0, 0xe9d4b2, 0xf4e6d0, 0xe3c8ab, 0xf7ead8, 0xdcc6a8, 0xece6da], trim: [0xfaf3e6, 0xe8dcc8], accent: [0x3c2a20, 0x5a3a24, 0x2a3a2a, 0x1e2a36], roof: [0xb85a38, 0xc06a44, 0xa9553a, 0xc87a52] },
  deco: { body: [0xf4efe6, 0xf1e4df, 0xe2ece8, 0xf3ead6, 0xe6e4ec, 0xe2ebe2, 0xeceae4], trim: [0xf8f6f0, 0xd9d3c6, 0x9fb7ad, 0xa8bcc6, 0xcfb9a6, 0xb9b3c8], accent: [0x3e6a72, 0x8a5a62, 0x3f6a58, 0x5a5a7a], roof: [0xd8d4cc] },
  mcm: { body: [0xf4f1ea, 0xe9e4d8, 0xd7d9d4, 0xf0e2c8, 0xdfe3dc], trim: [0x3a3a3a, 0xf4f1ea, 0x6b5a46], accent: [0xc0784a, 0x3f7f7a, 0xc0a24a, 0x3f5f86, 0xa8554a], roof: [0xe8e6e0, 0xbab6ae] },
  bungalow: { body: [0xe9dcb8, 0xe3c4b0, 0xb9cfc6, 0xe8d0d0, 0xc8d3b8, 0xbccbd6, 0xf0ece0, 0xd9d2c4, 0xdcd0e0], trim: [0xffffff, 0xf4efe2, 0xe6e0d2], accent: [0x2a5a72, 0x7a3a42, 0x2f5a3a, 0x3a3a3a, 0x9a7a3a], roof: [0x8a8e92, 0x6a5a50, 0xb06a4a, 0x5a6a72] },
};
const PALETTES_OLD = {
  keys: { body: [0x8fb8a8, 0xe8d8a8, 0xf0ece0, 0x9ab8d0, 0xe8b8a0, 0xc8d8a0, 0xd8a8b8, 0xb0c8c0, 0xf0d890, 0x7fb5b0, 0xd9c1e0], trim: [0xf2f0ea, 0xe8e2d2, 0xd8d0b8], accent: [0x4a6a7a, 0x3a5a4a, 0x2a4a6a, 0x6a5a4a, 0x2f7d82, 0xa0524a], roof: [0xb8bcc0, 0x9aa0a8, 0xc9c6bd, 0x8e9a8e] },
  ranch: { body: [0xefe6d2, 0xd9cdb5, 0xc8d4cc, 0xe6d3b8, 0xd8dccf, 0xf1e8dc, 0xb9c7cf, 0xe7d9c4], trim: [0xf6f3ec, 0xffffff, 0x6a5a48], accent: [0x2f4a5c, 0x5a3a2a, 0x3e5a3a, 0x7a2e2a, 0x2b2b2b], roof: [0x5e5a55, 0x7a7068, 0x4a4e52, 0x8a7a6a, 0x6b6f72] },
  med: { body: [0xf2dfc0, 0xe9cfa8, 0xf4e6d0, 0xe6c2a0, 0xf7ead8, 0xdcc0a0], trim: [0xfaf3e6, 0xe8dcc8], accent: [0x3c2a20, 0x5a3a24, 0x2a3a2a, 0x1e2a36], roof: [0xb85a38, 0xc8643c, 0xa9553a, 0xd2774a] },
  deco: { body: [0xf6efe4, 0xfbe3e8, 0xd9f2ee, 0xfff3d6, 0xe8e0ff, 0xdff3e3], trim: [0x4fb3c8, 0xf28aa0, 0x7fd0b5, 0xf3b562, 0x9a86d8, 0x58a6e8], accent: [0x2e6b7a, 0xb84a68, 0x2f7a5a, 0x7a4fb0], roof: [0xd8d4cc] },
  mcm: { body: [0xf4f1ea, 0xe9e4d8, 0xd7d9d4, 0xf0e2c8], trim: [0x2b2b2b, 0xf4f1ea, 0x6b5a46], accent: [0xe07a2a, 0x2f8f8a, 0xd8b130, 0x2b5f9e, 0xc8453a], roof: [0xe8e6e0, 0xbab6ae] },
  bungalow: { body: [0xf0c94a, 0xe8794a, 0x5fb3a8, 0xf09ab0, 0x9ad070, 0x72a8e0, 0xf2e6c8, 0xe85a6a, 0xc69be8], trim: [0xffffff, 0xf4efe2], accent: [0x2a6a8a, 0x8a2a3a, 0x2a6a3a, 0x3a3a3a, 0xe0a030], roof: [0x8a8e92, 0x6a5a50, 0xb85a38, 0x5a6a72] },
};
export const PALETTES = OLD_PAL ? PALETTES_OLD : PALETTES_NEW;

// curtain / blind colors seen through the glass (lit at night)
export const CURTAINS = [0xe8dcc0, 0xf2eee4, 0xd8c8a0, 0xc8d8e0, 0xe8c8b0, 0xb8a888, 0xf0e0d0, 0x9ab0c0, 0xd0b8d8];

// which styles fit a district (fictional names follow the real neighborhoods' character)
export function styleWeights(district = '', zone = '', stilt = false) {
  const d = String(district || '');
  if (stilt) return { keys: 1 };
  if (/Key |Keys|Paloma|Satsuma|Coontie|Marathon|Islamorada|Largo|Tavernier/i.test(d)) return { keys: 4, ranch: 3, bungalow: 2, mcm: 1.5 };
  if (/Beach|Collins|Flamingo|Normandy|Surfside|Nautilus|Lummus|South Pointe|Bay Harbor/i.test(d)) return { deco: 4, mcm: 2, med: 1.5, ranch: 0.5 };
  if (/Havana|Shenandoah|Allapattah|Little|Flagami|Overtown|Hialeah|Silver Bluff/i.test(d)) return { bungalow: 4, ranch: 2.5, deco: 1, med: 0.8 };
  if (/Gables|Coral|Coconut|Grove|Granada|Riviera|Pinecrest|Bay Point|Morningside/i.test(d)) return { med: 4, mcm: 2, ranch: 1.5, bungalow: 0.5 };
  if (/Shores|Biscayne|Park|Upper East|Palm/i.test(d)) return { mcm: 3, med: 2, ranch: 2, deco: 1 };
  return { ranch: 3, bungalow: 2, med: 2, mcm: 1.5, deco: 1 };
}
export function pickWeighted(w, r) { let t = 0; for (const v of Object.values(w)) t += v; let x = r() * t; for (const [k, v] of Object.entries(w)) { x -= v; if (x <= 0) return k; } return Object.keys(w)[0]; }
