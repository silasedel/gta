// Invented marine brands for Port Solana. None of these is a real builder, engine maker or electronics brand.
// When the design system (src/design/) is ready these should move there; `game.design.brands.marine` overrides this table
// when present (see resolveBrands()).
export const BUILDERS = {
  brackwater: { name: 'Brackwater', full: 'Brackwater Skiff Co.', style: 'serif', tag: 'Poled, not pushed', color: '#2f6d5a' },
  tinbelly: { name: 'Tinbelly', full: 'Tinbelly Marine', style: 'stencil', tag: 'Welded tough', color: '#3b4a3a' },
  tidewright: { name: 'Tidewright', full: 'Tidewright Boatworks', style: 'sans', tag: 'Built for the bay', color: '#1d4f8f' },
  marazul: { name: 'Marazul', full: 'Marazul Offshore', style: 'script', tag: 'Run farther', color: '#0b6a8a' },
  solenne: { name: 'Solenne', full: 'Solenne Sport Boats', style: 'script', tag: 'Weekends, perfected', color: '#b3263a' },
  driftwell: { name: 'Driftwell', full: 'Driftwell Pontoons', style: 'round', tag: 'Float easy', color: '#2a7a8c' },
  zafiro: { name: 'Zafiro', full: 'Zafiro Powerboats', style: 'italic', tag: 'Nothing passes', color: '#d21f2b' },
  corriente: { name: 'Corriente', full: 'Corriente Cruisers', style: 'serif', tag: 'Stay a while', color: '#243b63' },
  gaviota: { name: 'Gaviota', full: 'Gaviota Sportfishing Yachts', style: 'script', tag: 'First lines in', color: '#0f3a5c' },
  alisio: { name: 'Alisio', full: 'Alisio Sailcraft', style: 'serif', tag: 'Follow the trades', color: '#1f5d8a' },
  twinreef: { name: 'Twinreef', full: 'Twinreef Catamarans', style: 'sans', tag: 'Two hulls, one horizon', color: '#178a86' },
  ironcove: { name: 'Ironcove', full: 'Ironcove Shipyard', style: 'slab', tag: 'Work boats since 1961', color: '#5a2a1c' },
  calder: { name: 'Calder Bros.', full: 'Calder Bros. Boatyard', style: 'slab', tag: 'Hauls every day', color: '#27482f' },
  bulwark: { name: 'Bulwark', full: 'Bulwark Patrol Craft', style: 'stencil', tag: 'Hold the line', color: '#1a2a44' },
  sawtooth: { name: 'Sawtooth', full: 'Sawtooth Airboats', style: 'stencil', tag: 'Grass is a road', color: '#7a3b12' },
  pico: { name: 'Pico', full: 'Pico Watercraft', style: 'italic', tag: 'Small. Loud. Yours.', color: '#ff5a1f' },
  zumo: { name: 'Zumo', full: 'Zumo Watersports', style: 'round', tag: 'Squeeze the day', color: '#8ad11a' },
  mangle: { name: 'Mangle', full: 'Mangle Paddle Co.', style: 'round', tag: 'Quiet water', color: '#c2571a' },
  lowtide: { name: 'Lowtide', full: 'Lowtide Boards', style: 'sans', tag: 'Stand up', color: '#12a3a8' },
  burbuja: { name: 'Burbuja', full: 'Burbuja Inflatables', style: 'round', tag: 'Tender loving care', color: '#d9480f' },
  nubbin: { name: 'Nubbin', full: 'Nubbin Tenders', style: 'serif', tag: 'Row home', color: '#6a4a2a' },
};
export const OUTBOARDS = {
  tormenta: { name: 'TORMENTA', cowl: [0x15171a, 0x1b1d20, 0x101216], accent: 0xd21f2b, font: 'italic 900', hp: [40, 60, 90, 115, 150, 200, 250, 300, 350, 400], shape: 'tall' },
  kestrel: { name: 'Kestrel', cowl: [0xe9ecef, 0xf2f2ee, 0xdfe3e6], accent: 0x1d4f8f, font: '800', hp: [9.9, 15, 25, 40, 70, 115, 150, 200, 250, 300, 425], shape: 'round' },
  vantro: { name: 'VANTRO', cowl: [0x6b7178, 0x4a4f55, 0x8a9097], accent: 0xf3c318, font: '900', hp: [20, 30, 50, 90, 140, 175, 225, 300, 450], shape: 'wedge' },
  okuda: { name: 'OKUDA', cowl: [0x10243f, 0x15171a, 0xf2f2ee], accent: 0xf2641a, font: 'italic 800', hp: [6, 9.9, 20, 40, 60, 100, 150, 250, 350], shape: 'round' },
};
export const ELECTRONICS = { lumenav: { name: 'LUMENAV' }, fathomline: { name: 'Fathomline' }, sondeo: { name: 'SONDEO' } };
export const COOLERS = { glacera: { name: 'GLACERA' }, frionorte: { name: 'Frio Norte' } };
export function resolveBrands(game) { const d = game?.design?.brands?.marine; return d ? { BUILDERS: { ...BUILDERS, ...d.builders }, OUTBOARDS: { ...OUTBOARDS, ...d.outboards } } : { BUILDERS, OUTBOARDS }; }
