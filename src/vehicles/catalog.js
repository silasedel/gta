// Parametric vehicle catalogue for Southline: original archetypes + made-up brands.
// Every model = archetype body/physics params, scaled + overridden, plus engine/sound/gearbox data.
// Variants (trim, body kit, wheels, colour) are rolled at spawn time from the model's palettes.

// ---------------------------------------------------------------- archetypes (body shape + base physics)
// Shell coords: ground y=0, +z forward, mid-wheelbase at z=0. zA windshield base, zB roof front, zC roof rear, zD rear glass base.
import { rng, hashSeed } from './model/rng.js';
import { plateText, STICKER_COUNT, TRIM_IDS, ACCESSORIES, DASH_ITEMS } from './model/extras.js';
import { WHEEL_STYLES } from './model/wheels.js';

const A = {
  citycar: { L: 3.55, W: 1.68, wb: 2.35, r: 0.3, tw: 0.2, yb: 0.2, belt: 0.92, noseY: 0.74, tailY: 1.0, roofY: 1.55, zA: 0.62, zB: -0.05, zC: -1.22, zD: -1.58, cabInset: 0.12,
    mass: 950, engine: 4600, vmax: 150, steer: 0.65, grip: 2.3, drive: 'fwd', susp: [0.33, 38], rollK: 1.1 },
  hatch: { L: 4.1, W: 1.78, wb: 2.6, r: 0.32, tw: 0.22, yb: 0.2, belt: 0.93, noseY: 0.7, tailY: 0.98, roofY: 1.47, zA: 0.75, zB: 0.02, zC: -1.32, zD: -1.84, cabInset: 0.14,
    mass: 1150, engine: 5800, vmax: 175, steer: 0.62, grip: 2.3, drive: 'fwd', susp: [0.34, 38], rollK: 1 },
  sedan: { L: 4.75, W: 1.86, wb: 2.8, r: 0.33, tw: 0.24, yb: 0.22, belt: 0.97, noseY: 0.72, tailY: 0.98, roofY: 1.46, zA: 0.85, zB: 0.08, zC: -0.95, zD: -1.48, cabInset: 0.15,
    mass: 1400, engine: 6800, vmax: 185, steer: 0.6, grip: 2.2, drive: 'fwd', susp: [0.36, 34], rollK: 1 },
  lux: { L: 5.15, W: 1.92, wb: 3.1, r: 0.36, tw: 0.26, yb: 0.2, belt: 0.98, noseY: 0.78, tailY: 1.0, roofY: 1.48, zA: 0.95, zB: 0.15, zC: -1.15, zD: -1.7, cabInset: 0.15,
    bigGrille: true, lux: true, mass: 1950, engine: 11000, vmax: 250, steer: 0.55, grip: 2.3, drive: 'awd', susp: [0.38, 29], rollK: 1.2 },
  coupe: { L: 4.6, W: 1.88, wb: 2.7, r: 0.34, tw: 0.26, yb: 0.18, belt: 0.88, noseY: 0.64, tailY: 0.92, roofY: 1.34, zA: 0.6, zB: -0.12, zC: -0.85, zD: -1.65, cabInset: 0.16,
    coupe: true, mass: 1450, engine: 8200, vmax: 230, steer: 0.57, grip: 2.4, drive: 'rwd', susp: [0.32, 40], rollK: 0.8 },
  gt: { L: 4.45, W: 1.94, wb: 2.62, r: 0.345, tw: 0.28, yb: 0.17, belt: 0.8, noseY: 0.56, tailY: 0.86, roofY: 1.22, zA: 0.5, zB: -0.18, zC: -0.85, zD: -1.8, cabInset: 0.17,
    coupe: true, wing: true, mass: 1350, engine: 9800, vmax: 260, steer: 0.55, grip: 2.6, drive: 'rwd', powerSlide: 0.2, susp: [0.3, 42], rollK: 0.7 },
  roadster: { L: 4.2, W: 1.86, wb: 2.5, r: 0.33, tw: 0.26, yb: 0.15, belt: 0.8, noseY: 0.58, tailY: 0.84, roofY: 1.12, zA: 0.35, zB: -0.05, zC: -0.75, zD: -1.0, cabInset: 0.15,
    coupe: true, convertible: true, mass: 1150, engine: 8600, vmax: 235, steer: 0.6, grip: 2.6, drive: 'rwd', susp: [0.3, 44], rollK: 0.7 },
  muscle: { L: 4.85, W: 1.96, wb: 2.85, r: 0.36, tw: 0.3, yb: 0.2, belt: 0.92, noseY: 0.82, tailY: 0.95, roofY: 1.32, zA: 0.45, zB: -0.25, zC: -0.95, zD: -1.6, cabInset: 0.17,
    coupe: true, bigGrille: true, hoodScoop: true, mass: 1650, engine: 10500, vmax: 250, steer: 0.55, grip: 2.25, drive: 'rwd', rearGrip: 0.72, powerSlide: 0.5, susp: [0.36, 31], rollK: 1.1 },
  super: { L: 4.6, W: 2.04, wb: 2.7, r: 0.35, tw: 0.32, yb: 0.12, belt: 0.74, noseY: 0.42, tailY: 0.9, roofY: 1.12, zA: 0.75, zB: 0.05, zC: -0.75, zD: -1.95, cabInset: 0.22,
    coupe: true, wing: true, wedge: true, intakes: true, shift: 0.07, mass: 1450, engine: 13200, vmax: 330, steer: 0.5, grip: 3.1, drive: 'awd', downforce: 1.6, susp: [0.26, 56], rollK: 0.45 },
  suv: { L: 4.8, W: 1.98, wb: 2.86, r: 0.39, tw: 0.28, yb: 0.38, belt: 1.17, noseY: 0.98, tailY: 1.12, roofY: 1.83, zA: 1.02, zB: 0.42, zC: -2.02, zD: -2.22, cabInset: 0.14,
    bigGrille: true, roofRails: true, mass: 1850, engine: 8200, vmax: 200, steer: 0.58, grip: 2.2, drive: 'awd', susp: [0.42, 25], rollK: 1.6 },
  offroad: { L: 4.55, W: 1.95, wb: 2.75, r: 0.42, tw: 0.32, yb: 0.48, belt: 1.25, noseY: 1.15, tailY: 1.25, roofY: 1.98, zA: 0.95, zB: 0.7, zC: -1.95, zD: -2.05, cabInset: 0.1,
    bigGrille: true, offroad: true, mass: 2100, engine: 8000, vmax: 170, steer: 0.6, grip: 2.0, drive: 'awd', susp: [0.48, 22], rollK: 1.8 },
  pickup: { L: 5.3, W: 2.0, wb: 3.25, r: 0.4, tw: 0.29, yb: 0.44, belt: 1.2, noseY: 1.08, tailY: 1.2, roofY: 1.92, zA: 1.02, zB: 0.52, zC: -1.2, zD: -1.32, cabInset: 0.12,
    bigGrille: true, bed: true, mass: 2100, engine: 9800, vmax: 180, steer: 0.55, grip: 2.1, drive: 'rwd', susp: [0.42, 29], rollK: 1.4 },
  van: { L: 5.1, W: 2.0, wb: 3.2, r: 0.36, tw: 0.25, yb: 0.32, belt: 1.15, noseY: 0.98, tailY: 2.0, roofY: 2.18, zA: 1.55, zB: 1.0, zC: -2.35, zD: -2.45, cabInset: 0.08,
    bigGrille: true, van: true, mass: 2300, engine: 7200, vmax: 150, steer: 0.55, grip: 1.9, drive: 'rwd', comHigh: true, susp: [0.4, 28], rollK: 2.0 },
  box: { L: 6.8, W: 2.3, wb: 4.0, r: 0.46, tw: 0.3, yb: 0.45, belt: 1.35, noseY: 1.25, tailY: 1.35, roofY: 2.45, zA: 2.55, zB: 2.15, zC: 1.4, zD: 1.3, cabInset: 0.08,
    bigGrille: true, box: { front: 1.2, top: 3.25 }, mass: 5200, engine: 15000, vmax: 115, steer: 0.5, grip: 1.8, drive: 'rwd', comHigh: true, susp: [0.42, 30], rollK: 1.8, heavy: true },
  bus: { L: 11.8, W: 2.55, wb: 6.0, r: 0.5, tw: 0.3, yb: 0.32, belt: 1.15, noseY: 1.15, tailY: 1.3, roofY: 3.0, zA: 5.62, zB: 5.4, zC: -5.55, zD: -5.7, cabInset: 0.04,
    bus: true, mass: 11000, engine: 26000, vmax: 95, steer: 0.55, grip: 1.8, drive: 'rwd', comHigh: true, susp: [0.42, 30], rollK: 1.5, heavy: true },
};

// ---------------------------------------------------------------- brands (all invented)
export const BRANDS = ['Solano', 'Marlin', 'Cayo', 'Ridgeback', 'Pico', 'Brava', 'Vireo', 'Aurelia', 'Corvo', 'Kestrel', 'Halcyon', 'Mirabel', 'Atlas', 'Osprey', 'Tarpon'];

const P = { // colour palettes
  std: [0xeeeeea, 0x101214, 0xa9aeb4, 0x5a6470, 0x173b8f, 0xb3121b, 0x2f6d3a, 0xe7dcc4, 0x0e5e7a, 0x7a1f2b],
  fun: [0xff6a2b, 0x1fb5b0, 0xf0b62a, 0xd9447a, 0x7c2fbf, 0x9be22d, 0x2a8cff, 0xeeeeea],
  sport: [0xff5a1f, 0xffc21a, 0xb3121b, 0x101214, 0xeeeeea, 0x1d3f8f, 0x9be22d, 0x2a8cff],
  lux: [0x101214, 0x3a3f46, 0xe7dcc4, 0x2a2140, 0xeeeeea, 0x1c2a3a, 0x5b1a22],
  work: [0xf2f2f2, 0xeeeeea, 0xa9aeb4, 0x2f6d3a, 0x173b8f, 0xd8cdb0],
};

// engine profiles -> sound hints for AUDIO + gearbox data
const E = {
  i3: { engine: 'i4', cylinders: 3, aspiration: 'turbo', exhaust: 'quiet', maxRpm: 6500, idleRpm: 850, gears: [3.6, 2.0, 1.3, 0.97, 0.78], final: 4.2 },
  i4: { engine: 'i4', cylinders: 4, aspiration: 'na', exhaust: 'quiet', maxRpm: 6500, idleRpm: 750, gears: [3.6, 2.1, 1.4, 1.0, 0.8], final: 3.9 },
  i4t: { engine: 'i4', cylinders: 4, aspiration: 'turbo', exhaust: 'sporty', maxRpm: 7000, idleRpm: 850, gears: [3.5, 2.1, 1.45, 1.1, 0.88, 0.74], final: 4.0 },
  v6: { engine: 'v6', cylinders: 6, aspiration: 'na', exhaust: 'sporty', maxRpm: 7000, idleRpm: 750, gears: [4.0, 2.4, 1.6, 1.2, 0.95, 0.78], final: 3.6 },
  v6t: { engine: 'v6', cylinders: 6, aspiration: 'twin-turbo', exhaust: 'sporty', maxRpm: 7800, idleRpm: 900, gears: [3.4, 2.3, 1.7, 1.32, 1.06, 0.86], final: 3.7 },
  v8: { engine: 'v8', cylinders: 8, aspiration: 'na', exhaust: 'loud', maxRpm: 6600, idleRpm: 650, gears: [2.7, 1.8, 1.3, 1.0, 0.75], final: 3.4 },
  v8s: { engine: 'v8', cylinders: 8, aspiration: 'supercharged', exhaust: 'loud', maxRpm: 6800, idleRpm: 700, gears: [2.9, 1.95, 1.4, 1.1, 0.88, 0.7], final: 3.3 },
  v8l: { engine: 'v8', cylinders: 8, aspiration: 'twin-turbo', exhaust: 'quiet', maxRpm: 6600, idleRpm: 600, gears: [4.7, 3.1, 2.1, 1.67, 1.29, 1.0, 0.84, 0.67], final: 2.9 },
  v10: { engine: 'v10', cylinders: 10, aspiration: 'na', exhaust: 'race', maxRpm: 8800, idleRpm: 1000, gears: [3.1, 2.2, 1.65, 1.3, 1.07, 0.9, 0.76], final: 3.6 },
  v12: { engine: 'v12', cylinders: 12, aspiration: 'na', exhaust: 'race', maxRpm: 9000, idleRpm: 1000, gears: [3.1, 2.2, 1.65, 1.3, 1.07, 0.9, 0.76], final: 3.6 },
  w16: { engine: 'v12', cylinders: 16, aspiration: 'quad-turbo', exhaust: 'race', maxRpm: 7400, idleRpm: 900, gears: [3.2, 2.3, 1.75, 1.4, 1.15, 0.95, 0.8], final: 3.4 },
  dsl: { engine: 'diesel', cylinders: 6, aspiration: 'turbo', exhaust: 'diesel', maxRpm: 4500, idleRpm: 650, gears: [4.0, 2.4, 1.6, 1.15, 0.85, 0.68], final: 3.4 },
  dslH: { engine: 'diesel', cylinders: 6, aspiration: 'turbo', exhaust: 'diesel', maxRpm: 2800, idleRpm: 600, gears: [6.0, 3.6, 2.3, 1.5, 1.0, 0.75], final: 4.6 },
  ev: { engine: 'electric', cylinders: 0, aspiration: 'electric', exhaust: 'none', maxRpm: 14000, idleRpm: 0, gears: [9.0], final: 1.0 },
};

// m(key, brand, name, class, archetype, engineProfile, palette, overrides)
const DEFS = [];
const m = (key, brand, name, cls, arch, eng, pal, o = {}) => DEFS.push({ key, brand, name, cls, arch, eng, pal, o });

// city cars + hatches
m('compact', 'Pico', 'Pebble', 'compact', 'hatch', 'i4', 'fun', { sz: 0.96 });
m('pico_volt', 'Pico', 'Ampere', 'compact', 'citycar', 'ev', 'fun', { engine: 5200, vmax: 150 });
m('mirabel_dot', 'Mirabel', 'Dot', 'compact', 'citycar', 'i3', 'fun', { sz: 0.94, sy: 1.02 });
m('tarpon_go', 'Tarpon', 'Zip', 'compact', 'citycar', 'i3', 'std', { sz: 1.04, sx: 1.02 });
m('marlin_hatch', 'Marlin', 'Coast 5', 'compact', 'hatch', 'i4', 'std', { sz: 1.03 });
m('kestrel_line_h', 'Kestrel', 'Line H', 'compact', 'hatch', 'i4t', 'std', { sx: 1.02, engine: 6600 });
m('pico_rs', 'Pico', 'Pebble RS', 'sports', 'hatch', 'i4t', 'sport', { sy: 0.97, engine: 8200, vmax: 230, grip: 2.7, kit: 'sport', wing: true, rimColor: 0x1d1f22, caliper: 0xd8261b, spokes: 10, susp: [0.3, 44] });
m('kestrel_rally', 'Kestrel', 'Mesa R', 'sports', 'hatch', 'i4t', 'sport', { sx: 1.04, engine: 9000, vmax: 225, drive: 'awd', grip: 2.6, rally: true, wing: true, r: 0.34, yb: 0.26, susp: [0.38, 36], spokes: 6, rimColor: 0xeeeeee });
// sedans
m('kestrel_line', 'Kestrel', 'Line', 'sedan', 'sedan', 'i4', 'std', { sz: 0.93, sx: 0.97 });
m('sedan', 'Marlin', 'Coastline', 'sedan', 'sedan', 'i4', 'std', {});
m('osprey_mid', 'Osprey', 'Palmetto', 'sedan', 'sedan', 'v6', 'std', { sz: 1.02, sy: 1.01, engine: 7600 });
m('cayo_grand', 'Cayo', 'Gran Vista', 'sedan', 'sedan', 'v6', 'lux', { sz: 1.06, sx: 1.03, mass: 1650, engine: 8400, bigGrille: true });
m('tarpon_cabrio', 'Tarpon', 'Bayline Cabrio', 'sports', 'sedan', 'i4', 'fun', { year: 1988, sz: 0.93, sy: 0.97, convertible: true, coupe: true, zC: -0.45, zD: -0.85, engine: 6400, vmax: 200, rimColor: 0xb9bdc1 });
m('marlin_cab', 'Marlin', 'Coastline Cabrio', 'sports', 'sedan', 'v6', 'fun', { sz: 0.95, convertible: true, coupe: true, zC: -0.5, zD: -0.9, engine: 7600 });
// luxury / executive
m('luxury', 'Aurelia', 'Regent', 'sedan', 'lux', 'v8l', 'lux', {});
m('aurelia_sov', 'Aurelia', 'Regalia L', 'sedan', 'lux', 'v8l', 'lux', { sz: 1.06, mass: 2150, engine: 12000 });
m('halcyon_vesta', 'Halcyon', 'Vesper', 'sedan', 'lux', 'v6t', 'lux', { sz: 0.96, sy: 0.97, engine: 10500, drive: 'rwd' });
m('halcyon_e', 'Halcyon', 'Vesper E', 'sedan', 'lux', 'ev', 'lux', { sz: 0.97, engine: 13000, vmax: 240, bigGrille: false });
// coupes / GT / roadsters
m('solano_corsa', 'Solano', 'Corsara', 'sports', 'coupe', 'i4t', 'sport', {});
m('sports', 'Solano', 'GT 400', 'sports', 'gt', 'v6t', 'sport', {});
m('aurelia_gt', 'Aurelia', 'Gran Tourer', 'sports', 'coupe', 'v12', 'lux', { sz: 1.06, sx: 1.03, engine: 12500, vmax: 300, lux: true, mass: 1800, drive: 'rwd' });
m('roadster', 'Aurelia', 'Spyder', 'sports', 'roadster', 'i4t', 'sport', {});
m('pico_spider', 'Pico', 'Spider', 'sports', 'roadster', 'i4', 'fun', { sz: 0.9, sx: 0.95, engine: 6600, vmax: 205, mass: 1000 });
m('vireo_barchetta', 'Vireo', 'Barchetta', 'super', 'roadster', 'v10', 'sport', { sx: 1.06, engine: 12500, vmax: 310, drive: 'awd', intakes: true, grip: 3.0, downforce: 1.2 });
// muscle
m('muscle', 'Brava', 'Thunder 6.4', 'muscle', 'muscle', 'v8', 'sport', {});
m('brava_stallion', 'Brava', 'Stallion', 'muscle', 'muscle', 'v8s', 'sport', { sz: 0.97, zD: -1.9, zC: -0.75, engine: 11800, vmax: 270 });
m('tarpon_classic', 'Tarpon', 'Bayline 69', 'muscle', 'muscle', 'v8', 'fun', { sz: 1.05, sy: 1.02, hoodScoop: false, chromeBumpers: true, engine: 9200, vmax: 220 });
// supercars / hyper
m('super', 'Vireo', 'Saetta V12', 'super', 'super', 'v12', 'sport', {});
m('vireo_fulmine', 'Vireo', 'Fulmine', 'super', 'super', 'v10', 'sport', { sz: 0.97, roofY: 1.1, engine: 12600, vmax: 320 });
m('solano_scirocco', 'Solano', 'Libeccio', 'super', 'super', 'v8s', 'sport', { sz: 1.02, sx: 0.98, noseY: 0.48, wing: false, engine: 12000, vmax: 315 });
m('vireo_aeterna', 'Vireo', 'Aeterna', 'super', 'super', 'w16', 'lux', { sz: 1.04, sx: 1.03, engine: 17000, vmax: 400, mass: 1800, downforce: 2.0, hyper: true });
// SUVs / off-road
m('cayo_mini', 'Cayo', 'Sola', 'suv', 'suv', 'i4t', 'fun', { sz: 0.9, sx: 0.94, sy: 0.92, mass: 1450, engine: 6600 });
m('suv', 'Cayo', 'Trail XL', 'suv', 'suv', 'v6', 'std', {});
m('cayo_max', 'Cayo', 'Max', 'suv', 'suv', 'v8', 'std', { sz: 1.12, sx: 1.05, sy: 1.04, mass: 2500, engine: 10500 });
m('aurelia_x', 'Aurelia', 'Xanthe', 'suv', 'suv', 'v8l', 'lux', { sz: 1.02, lux: true, engine: 11500, vmax: 250 });
m('ridgeback_scout', 'Ridgeback', 'Outrider', 'suv', 'offroad', 'v6', 'work', {});
m('ridgeback_dune', 'Ridgeback', 'Dune 2', 'suv', 'offroad', 'v8', 'fun', { sz: 0.9, convertible: true, zC: -1.2, zD: -1.4 });
// pickups
m('ridgeback_mid', 'Ridgeback', '1500 Trail', 'pickup', 'pickup', 'v6', 'work', { sz: 0.94, sx: 0.96, mass: 1900 });
m('pickup', 'Ridgeback', '2500 HD', 'pickup', 'pickup', 'dsl', 'work', {});
m('ridgeback_3500', 'Ridgeback', '3500 Dually', 'pickup', 'pickup', 'dsl', 'work', { sz: 1.08, sx: 1.06, sy: 1.04, mass: 2900, engine: 11500, vmax: 165 });
// vans / buses / trucks
m('van', 'Corvo', 'Cargo', 'van', 'van', 'dsl', 'work', {});
m('corvo_shuttle', 'Corvo', 'Shuttle', 'van', 'van', 'dsl', 'work', { windows: true, sz: 1.05 });
m('corvo_minibus', 'Corvo', 'Metro 16', 'van', 'van', 'dsl', 'work', { windows: true, sz: 1.35, sy: 1.12, mass: 3400, engine: 9500, vmax: 130 });
m('atlas_box', 'Atlas', 'Box 26', 'truck', 'box', 'dslH', 'work', {});
m('atlas_step', 'Atlas', 'Step Van', 'truck', 'box', 'dsl', 'work', { sz: 0.9, sx: 0.96, step: true, box: { front: 2.0, top: 2.85 }, zA: 2.15, zB: 1.95, zC: 1.95, zD: 1.95, roofY: 2.6, noseY: 1.15, mass: 4000 });
m('citybus', 'Southline Transit', 'Metro S12', 'bus', 'bus', 'dslH', 'work', { busLivery: true });
// service vehicles
m('taxi', 'Marlin', 'Coastline Cab', 'taxi', 'sedan', 'i4', 'std', { taxi: true, vmax: 170 });
m('taxi_xl', 'Cayo', 'Trail Cab XL', 'taxi', 'suv', 'v6', 'std', { taxi: true });
m('police', 'Marlin', 'Patrol PX', 'police', 'sedan', 'v8', 'std', { police: 'bar', engine: 8800, vmax: 230, grip: 2.5, rimColor: 0x1d1f22, pushBar: true });
m('police_suv', 'Cayo', 'Patrol PX Utility', 'police', 'suv', 'v8', 'std', { police: 'bar', engine: 9800, vmax: 220, pushBar: true });
m('unmarked', 'Osprey', 'Palmetto (unmarked)', 'police', 'sedan', 'v8', 'std', { police: 'hidden', sz: 1.02, engine: 8800, vmax: 230, rimColor: 0x2a2d30 });
m('ambulance', 'Corvo', 'Medic One', 'van', 'box', 'dsl', 'work', { sz: 0.92, sx: 0.95, ambulance: true, police: 'ambulance', box: { front: 1.25, top: 2.95 }, mass: 4200, engine: 13000, vmax: 140 });
m('firetruck', 'Atlas', 'Engine 9', 'truck', 'box', 'dslH', 'work', { sz: 1.25, sx: 1.04, fire: true, police: 'fire', box: { front: 1.4, top: 2.9 }, mass: 9000, engine: 24000, vmax: 120 });

// ---------------------------------------------------------------- build specs
const PAL_SPECIAL = { tarpon_cabrio: [0xa3231f, 0xeeeeea, 0x101214, 0x1d3f8f, 0x2f6d3a], taxi: [0xf5b800], taxi_xl: [0xf5b800], police: [0x0b1a33], police_suv: [0x0b1a33], unmarked: [0x2b2f36, 0x101214, 0x3a3f46],
  ambulance: [0xf4f4f2], firetruck: [0xc4161c], citybus: [0xf2f2f2] };

function scaleSpec(s, sx = 1, sy = 1, sz = 1) {
  const o = { ...s };
  for (const k of ['L', 'wb', 'zA', 'zB', 'zC', 'zD']) o[k] = s[k] * sz;
  o.W = s.W * sx;
  for (const k of ['belt', 'noseY', 'tailY', 'roofY']) o[k] = s[k] * sy;
  if (s.box) o.box = { front: s.box.front * sz, top: s.box.top * sy };
  o.r = s.r * Math.min(1.12, Math.max(0.92, (sy + sz) / 2));
  return o;
}

export const CAR_TYPES = {};
export const MODELS = {};
export const CLASSES = {};
for (const d of DEFS) {
  const base = A[d.arch];
  const o = d.o;
  let spec = scaleSpec(base, o.sx, o.sy, o.sz);
  spec = { ...spec, ...o };
  delete spec.sx; delete spec.sy; delete spec.sz;
  if (o.box) spec.box = { ...o.box };
  spec.label = `${d.brand} ${d.name}`;
  spec.vmax = (o.vmax ?? base.vmax) / 3.6;
  spec.cls = d.cls; spec.arch = d.arch;
  spec.rimColor ??= [0xc9ced3, 0xd8dcdf, 0x9da2a6, 0x2b2e33][(d.key.length * 7) % 4];
  spec.caliper ??= spec.coupe ? 0xd8261b : 0x333333;
  spec.spokes ??= [5, 6, 8, 10, 12][(d.key.charCodeAt(0) + d.key.length) % 5];
  spec.palette = PAL_SPECIAL[d.key] || P[d.pal] || P.std;
  CAR_TYPES[d.key] = spec;
  const e = E[d.eng];
  MODELS[d.key] = {
    key: d.key, brand: d.brand, name: d.name, class: d.cls, engine: e.engine, maxRpm: e.maxRpm, idleRpm: e.idleRpm, gears: e.gears, final: e.final,
    sound: { engine: e.engine, cylinders: e.cylinders, aspiration: e.aspiration, exhaust: e.exhaust },
  };
  // model year (drives the body era: 0 boxy < 1996, 1 rounded, 2 sharp modern) and price tier 1 beater .. 5 exotic
  const yh = hashSeed(d.key) % 1000 / 1000;
  const year = o.year ?? (d.key === 'tarpon_classic' ? 1969 : d.arch === 'bus' || d.arch === 'box' ? 2008 + Math.round(yh * 14) : d.pal === 'work' ? 1998 + Math.round(yh * 26) : 2004 + Math.round(yh * 21));
  const tier = o.hyper ? 5 : d.cls === 'super' ? 5 : d.pal === 'lux' || o.lux ? 4 : d.cls === 'sports' || d.cls === 'muscle' ? 3 : d.pal === 'work' || d.cls === 'compact' ? 1.5 : 2;
  spec.year = year; spec.era ??= year < 1996 ? 0 : year < 2012 ? 1 : 2; spec.tier = tier;
  Object.assign(MODELS[d.key], { year, tier, price: Math.round(9000 * Math.pow(2.6, tier - 1) * (0.85 + yh * 0.3) / 100) * 100 });
  (CLASSES[d.cls] ||= []).push(d.key);
}

// trims / body kits / wheels rolled per spawned car -> hundreds of variants
export function rollVariant(key, rnd = Math.random) {
  const t = CAR_TYPES[key];
  const pal = t.palette;
  const color = pal[(rnd() * pal.length) | 0];
  const kits = t.heavy || t.police || t.taxi ? ['base'] : t.cls === 'sports' || t.cls === 'super' || t.cls === 'muscle' ? ['base', 'sport', 'sport'] : ['base', 'base', 'sport', 'lux'];
  const kit = t.kit || kits[(rnd() * kits.length) | 0];
  const spokesOpts = [5, 6, 8, 10, 12];
  const rimOpts = [0xc9ced3, 0xd8dcdf, 0x2b2e33, 0x16181b, 0x9da2a6, 0xb08d57];
  const wheel = t.heavy || t.police ? { spokes: t.spokes, rimColor: t.rimColor } :
    rnd() < 0.5 ? { spokes: t.spokes, rimColor: t.rimColor } : { spokes: spokesOpts[(rnd() * 5) | 0], rimColor: rimOpts[(rnd() * rimOpts.length) | 0] };
  const twoTone = !t.heavy && !t.police && !t.taxi && rnd() < 0.15;
  return { color, kit, wheel, blackRoof: twoTone };
}

export const ALL_KEYS = Object.keys(CAR_TYPES);


// ---------------------------------------------------------------- per-car looks ("no repeating car")
// rollLook(key, seed, env) -> plain JSON look, fully deterministic from (key, seed, env).  env = { income: 0..1, zone, salt, rural }.
// Every visual axis is rolled: paint (hue/lightness jitter, finish, two-tone, fade), wheels, ride height, tint, dirt kind and level,
// rust, patch panel, dents, missing hubcaps, stickers, plate (number + design), accessories, cabin trim, dash clutter.
const INCOME = { business: 0.92, beach: 0.82, downtown: 0.74, nightlife: 0.7, causeway: 0.6, keys: 0.6, residential: 0.5, park: 0.5, commercial: 0.42, suburb: 0.45, rural: 0.32, farm: 0.28, port: 0.3, industrial: 0.24, water: 0.5 };
export function incomeFor(zone) { return INCOME[zone] ?? 0.5; }
const DIRT_BY_ZONE = { beach: 'sand', keys: 'salt', causeway: 'salt', port: 'soot', industrial: 'soot', rural: 'mud', farm: 'clay', park: 'mud', wetland: 'mud' };
const hexJitter = (c, r, amt) => {
  let R = (c >> 16) & 255, G = (c >> 8) & 255, B = c & 255;
  const k = 1 + (r() - 0.5) * amt * 2, s = (r() - 0.5) * amt * 40;
  R = Math.max(0, Math.min(255, Math.round(R * k + s))); G = Math.max(0, Math.min(255, Math.round(G * k + s * 0.7))); B = Math.max(0, Math.min(255, Math.round(B * k + s * 0.4)));
  return (R << 16) | (G << 8) | B;
};
const EXTRA_COLORS = [0x6b4f3a, 0x8a9a5b, 0xc2b280, 0x4b5320, 0x9e1b32, 0xd4c4a8, 0x36454f, 0x7b3f00, 0xb87333, 0x2e5894, 0xf4f0e6, 0x5d3954, 0x00704a, 0xc0c0c0, 0x7f7f7f];
const STYLE_TAGS = { super: ['sport', 'lux'], sports: ['sport'], muscle: ['muscle', 'classic', 'sport'], suv: ['std', 'lux', 'offroad'], pickup: ['truck', 'offroad', 'work'], van: ['work', 'std'], truck: ['truck', 'heavy'], bus: ['heavy'], taxi: ['std', 'cheap'], police: ['std'], compact: ['std', 'cheap'], sedan: ['std', 'lux', 'cheap'] };
const RIMS = [0xc9ced3, 0xd8dcdf, 0x9da2a6, 0x2b2e33, 0x16181b, 0xb08d57, 0x5c6066, 0xe8e8e8, 0x8a1c1c, 0x1f3f7a];
export function rollLook(key, seed, env = {}) {
  const t = CAR_TYPES[key] || CAR_TYPES.sedan, mi = MODELS[key] || MODELS.sedan;
  seed = seed >>> 0;
  const r = rng(hashSeed(key, seed));
  const income = env.income ?? incomeFor(env.zone);
  const fleet = !!(t.police || t.taxi || t.heavy || t.busLivery || t.ambulance || t.fire);
  const tier = mi.tier || 2;
  // age 0 new .. 1 tired beater: poorer areas and cheaper models skew older, fleets are maintained
  const ageBias = 0.62 - income * 0.5 - (tier - 2) * 0.08 + (fleet ? -0.2 : 0);
  const age = Math.max(0, Math.min(1, ageBias + r.normal() * 0.28));
  const pal = t.palette;
  let base = fleet ? pal[r.int(pal.length)] : r() < 0.82 ? pal[r.int(pal.length)] : EXTRA_COLORS[r.int(EXTRA_COLORS.length)];
  const color = fleet ? base : hexJitter(base, r, 0.07);
  const finish = fleet ? 'gloss' : r.weighted({ metallic: 5, gloss: 3, pearl: tier >= 3.5 ? 2 : 0.4, satin: tier >= 3 ? 0.8 : 0.2, matte: tier >= 3 ? 0.6 : 0.05, primer: age > 0.75 ? 0.15 : 0 });
  let twoTone = null;
  if (!fleet && r() < 0.13) {
    const c2 = r() < 0.5 ? 0x141518 : EXTRA_COLORS[r.int(EXTRA_COLORS.length)];
    twoTone = !t.convertible && r() < 0.6 ? { roof: c2 } : { color: c2, y: Math.round((0.32 + r() * 0.2) * 100) / 100 };
  }
  const kits = fleet ? ['base'] : t.cls === 'sports' || t.cls === 'super' || t.cls === 'muscle' ? ['base', 'sport', 'sport'] : ['base', 'base', 'sport', 'lux'];
  const kit = t.kit || kits[r.int(kits.length)];
  const tags = t.heavy ? ['heavy', 'truck'] : (STYLE_TAGS[t.cls] || ['std']).concat(age > 0.6 ? ['cheap'] : [], t.offroad ? ['offroad'] : []);
  const styles = WHEEL_STYLES.filter((s) => s.tags.some((g) => tags.includes(g)) && (t.heavy ? true : s.id !== 'truck8')).map((s) => s.id);
  const wheel = {
    style: fleet ? (t.heavy ? 'truck8' : t.police ? 'steel' : 'hubcap') : styles[r.int(styles.length)] || 'star5',
    rimColor: fleet ? (t.rimColor ?? 0x9da2a6) : r() < 0.45 ? t.rimColor : RIMS[r.int(RIMS.length)],
    finish: r() < (tier >= 3 ? 0.25 : 0.06) ? 'chrome' : 'alloy',
  };
  const ride = fleet ? 0 : Math.round((t.offroad || t.bed ? (r() < 0.25 ? 0.03 + r() * 0.05 : 0) : (r() < 0.18 && tier >= 2 ? -(0.015 + r() * 0.035) : (r() - 0.5) * 0.02) + age * 0.015 * r.sign()) * 1000) / 1000;
  const tint = fleet ? 1 : r.weighted([[0, 2 + (1 - income) * 2], [1, 4], [2, 2 + income * 2], [3, tier >= 3 ? 1.6 : 0.4]]);
  const dirtColor = env.salt ? 'salt' : DIRT_BY_ZONE[env.zone] || (env.rural ? 'mud' : r.pick(['dust', 'dust', 'sand', 'mud', 'clay']));
  const wear = {
    dirt: Math.round(Math.min(1, 0.03 + r() * 0.12 + age * age * 0.5 + (env.rural ? 0.2 : 0)) * 100) / 100, dirtColor,   // most city cars are washed; only old ones carry real grime
    rust: age > 0.7 ? Math.round(Math.min(1, (age - 0.7) * 1.6 * (0.3 + r() * 0.7) + (env.salt ? 0.12 : 0)) * 100) / 100 : 0,
    fade: age > 0.45 ? Math.round(Math.min(0.8, (age - 0.45) * 1.4 * r()) * 100) / 100 : 0,
    age: Math.round(age * 100) / 100, seed: seed % 997,
    patch: !fleet && age > 0.68 && r() < 0.4 ? { panel: r.pick(['hood', 'trunk', 'doorFL', 'doorFR', 'fenderFL', 'fenderFR']), color: r() < 0.4 ? 0x6f7276 : pal[r.int(pal.length)] } : null,
  };
  const dents = [];
  for (let n = Math.floor(age * 3.4 * r() + (r() < 0.12 ? 1 : 0)), i = 0; i < n; i++) {
    const side = r.sign(), z = (r() - 0.5) * t.L * 0.85, onEnd = r() < 0.35;
    dents.push({ x: onEnd ? (r() - 0.5) * t.W * 0.6 : side * t.W / 2, y: t.yb + (t.belt - t.yb) * (0.3 + r() * 0.6), z: onEnd ? Math.sign(z || 1) * t.L / 2 : z,
      depth: Math.round((0.02 + r() * 0.05) * 1000) / 1000, radius: Math.round((0.14 + r() * 0.22) * 100) / 100 });
  }
  const missing = [];
  if (wheel.style === 'hubcap') for (let i = 0; i < 4; i++) if (r() < age * 0.3) missing.push('hubcap' + i);
  const stickers = [];
  const nSt = fleet ? 0 : Math.min(5, Math.floor(r() * (1.2 + (1 - income) * 2.4 + age * 1.4)));
  for (let i = 0; i < nSt; i++) stickers.push({ id: r.int(STICKER_COUNT), where: r.pick(['glass', 'trunk', 'bumper', 'bumper']), u: Math.round((r() * 2 - 1) * 100) / 100, rot: Math.round(r.normal() * 0.08 * 100) / 100, scale: Math.round((0.8 + r() * 0.45) * 100) / 100 });
  // accessories (roof racks, ladders, toolboxes, bars...) by model and neighborhood
  const accessories = [];
  if (!fleet || (t.bed && !t.police)) {
    const want = { roofRack: 0.14, roofBox: 0.06, kayak: env.zone === 'beach' || env.salt ? 0.08 : 0.025, surfboard: env.zone === 'beach' || env.salt ? 0.1 : 0.02, ladder: t.van || t.bed ? 0.3 : 0, lightBar: 0.2, bullBar: 0.18, hitch: 0.35, bedBox: 0.45, bedCargo: 0.35, flag: 0.03, wing: tier >= 3 ? 0.12 : 0.04 };
    for (const id in want) {
      const A0 = ACCESSORIES[id]; if (!A0 || !A0.fits(t) || !(r() < want[id])) continue;
      if (A0.needs && !accessories.some((a) => a.id === A0.needs)) accessories.push({ id: A0.needs });
      if (!accessories.some((a) => a.id === id)) accessories.push({ id, c: r.int(6) });
    }
  }
  const trim = tier >= 3.5 ? r.pick(['leatherBlack', 'leatherTan', 'leatherRed', 'leatherCream']) : r.pick(TRIM_IDS);
  const dash = [];
  for (const id of DASH_ITEMS) if (r() < (fleet ? 0.08 : 0.22)) dash.push(id);
  const mirrorCharm = !fleet && r() < 0.35 ? r.pick(['freshener', 'beads', 'dice', 'rosary', 'tassel', 'charm']) : null;
  const year = Math.max(1960, (mi.year || 2015) - (age > 0.5 ? r.int(8) : r.int(3)));
  const plate = {
    text: plateText(hashSeed(seed, key)),
    style: t.heavy || t.van && fleet || t.box ? 4 : year < 1985 ? 6 : age < 0.08 && r() < 0.25 ? 5 : r.weighted([[0, 10], [1, env.salt || env.zone === 'beach' ? 3 : 1.2], [2, env.rural ? 3 : 1], [3, env.salt ? 4 : 1]]),
  };
  const look = { key, seed, color, finish, twoTone, kit, trim, wheel, ride, tint, wear, dents, missing, stickers, accessories, dash, mirrorCharm, plate, year, zone: env.zone || null };
  look.signature = lookSignature(look);
  return look;
}
// canonical string of everything visible about the car (plate included): two cars are the same car iff equal
export function lookSignature(L) {
  return [L.key, L.color, L.finish, JSON.stringify(L.twoTone), L.kit, L.trim, L.wheel?.style, L.wheel?.rimColor, L.wheel?.finish, L.ride, L.tint,
    L.wear?.dirt, L.wear?.dirtColor, L.wear?.rust, L.wear?.fade, JSON.stringify(L.wear?.patch), JSON.stringify(L.dents), (L.missing || []).join(','),
    JSON.stringify(L.stickers), JSON.stringify(L.accessories), (L.dash || []).join(','), L.mirrorCharm, L.plate?.text, L.plate?.style].join('|');
}
// the same, without the plate number: what a player could tell apart at a glance
export function visualSignature(L) {
  const q = (c) => ((c >> 19) & 31) + ',' + ((c >> 11) & 31) + ',' + ((c >> 3) & 31); // 5-bit per channel color bucket
  return [L.key, q(L.color), L.finish, L.twoTone ? 1 : 0, L.kit, L.wheel?.style, L.wheel?.rimColor, L.tint, Math.round((L.wear?.dirt || 0) * 4), L.wear?.dirtColor,
    Math.round((L.wear?.rust || 0) * 4), L.wear?.patch ? 1 : 0, (L.dents || []).length, (L.stickers || []).map((s) => s.id).sort().join(','), (L.accessories || []).map((a) => a.id).join(','), L.plate?.style].join('|');
}
// old call style buildCar(key, color, { kit, wheel: { spokes, rimColor }, blackRoof }) -> a clean look
export function legacyLook(key, color, opts = {}) {
  const t = CAR_TYPES[key] || CAR_TYPES.sedan;
  const sp = opts.wheel?.spokes, style = sp === 5 ? 'star5' : sp === 6 ? 'six' : sp === 8 ? 'turbine' : sp === 10 ? 'multi10' : sp === 12 ? 'multi15' : t.heavy ? 'truck8' : 'split5';
  const look = { key, seed: (color ?? 0) >>> 0, color: color ?? t.palette[0], finish: t.taxi || t.heavy ? 'gloss' : 'metallic', twoTone: opts.blackRoof ? { roof: 0x141518 } : null,
    kit: opts.kit || t.kit || 'base', trim: 'clothBlack', wheel: { style, rimColor: opts.wheel?.rimColor ?? t.rimColor, finish: 'alloy' }, ride: 0, tint: 1,
    wear: { dirt: 0.06, dirtColor: 'dust', rust: 0, fade: 0, age: 0, seed: 0, patch: null }, dents: [], missing: [], stickers: [], accessories: [], dash: [], mirrorCharm: null,
    plate: { text: plateText(hashSeed(key, color ?? 0)), style: 0 }, year: t.year };
  look.signature = lookSignature(look);
  return look;
}
// neighborhood-matched fleet: class weights for a spot with this income (0 poor .. 1 wealthy)
export function fleetMix(income = 0.5, parked = false) {
  const rich = Math.max(0, income - 0.5) * 2, poor = Math.max(0, 0.5 - income) * 2;
  return { sedan: 26, compact: 20 + poor * 12, suv: 18 + rich * 8, pickup: 8 + poor * 6, van: 7 + poor * 3, taxi: parked ? 0 : 7, sports: 4 + rich * 14, muscle: 2 + poor * 2,
    police: parked ? 0 : 3, truck: (parked ? 2 : 3) * (1 - rich * 0.7), bus: parked ? 0 : 1.5, super: 0.4 + rich * 7 };
}
// tier filter used by the spawner: wealthy streets rarely show a beater model, poor streets rarely show an exotic
export function tierWeight(key, income = 0.5) { const tr = MODELS[key]?.tier ?? 2; return Math.max(0.05, 1 + (tr - 2.5) * (income - 0.5) * 1.6); }
