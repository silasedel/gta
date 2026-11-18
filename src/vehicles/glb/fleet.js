// The library fleet: every road car is one of the user's models (Models/Cars, converted to public/assets/vehicles/cars).
// Invented brands and names only (the marques of src/vehicles/catalog.js).  Specs = class physics + the converted model's
// real dimensions (manifest).  `rare: true` models never appear in random traffic: one of each is placed by hand (placements.js).
// Real lengths (m) per model drive the scale in tools/v2/cars/cars.json (kept in sync with `L` here).

// class physics (mass kg, engine = peak drive force N, vmax km/h, susp [rest m, stiffness], rollK)
const PHYS = {
  compact: { mass: 1250, engine: 6000, vmax: 185, steer: 0.62, grip: 2.3, drive: 'fwd', susp: [0.34, 38], rollK: 1 },
  sedan: { mass: 1450, engine: 7000, vmax: 200, steer: 0.6, grip: 2.25, drive: 'fwd', susp: [0.36, 34], rollK: 1 },
  sportsedan: { mass: 1650, engine: 10500, vmax: 250, steer: 0.57, grip: 2.6, drive: 'rwd', powerSlide: 0.2, susp: [0.32, 40], rollK: 0.8 },
  ev: { mass: 1800, engine: 11000, vmax: 225, steer: 0.58, grip: 2.5, drive: 'awd', susp: [0.34, 38], rollK: 0.8 },
  muscle: { mass: 1750, engine: 11000, vmax: 260, steer: 0.55, grip: 2.3, drive: 'rwd', rearGrip: 0.72, powerSlide: 0.5, susp: [0.36, 31], rollK: 1.1 },
  classic: { mass: 1450, engine: 7600, vmax: 190, steer: 0.55, grip: 1.9, drive: 'rwd', powerSlide: 0.4, susp: [0.4, 26], rollK: 1.6 },
  sports: { mass: 1550, engine: 10500, vmax: 270, steer: 0.55, grip: 2.7, drive: 'rwd', powerSlide: 0.2, susp: [0.3, 44], rollK: 0.7 },
  super: { mass: 1450, engine: 13500, vmax: 325, steer: 0.5, grip: 3.1, drive: 'awd', downforce: 1.6, susp: [0.26, 56], rollK: 0.45, wedge: true, coupe: true },
  hyper: { mass: 1950, engine: 19000, vmax: 410, steer: 0.48, grip: 3.2, drive: 'awd', downforce: 1.8, susp: [0.27, 54], rollK: 0.5, wedge: true, coupe: true },
  suv: { mass: 2000, engine: 9000, vmax: 200, steer: 0.58, grip: 2.2, drive: 'awd', susp: [0.4, 27], rollK: 1.5 },
  luxsuv: { mass: 2500, engine: 12000, vmax: 240, steer: 0.55, grip: 2.3, drive: 'awd', susp: [0.42, 26], rollK: 1.4 },
  offroad: { mass: 2050, engine: 8200, vmax: 175, steer: 0.6, grip: 2.0, drive: 'awd', susp: [0.48, 22], rollK: 1.8, offroad: true },
  pickup: { mass: 2350, engine: 11000, vmax: 180, steer: 0.55, grip: 2.1, drive: 'rwd', susp: [0.44, 28], rollK: 1.4, bed: true },
  van: { mass: 2600, engine: 7800, vmax: 150, steer: 0.55, grip: 1.9, drive: 'rwd', comHigh: true, susp: [0.4, 28], rollK: 2.0 },
  box: { mass: 6500, engine: 17000, vmax: 115, steer: 0.5, grip: 1.8, drive: 'rwd', comHigh: true, susp: [0.42, 30], rollK: 1.8, heavy: true },
  semi: { mass: 8500, engine: 26000, vmax: 120, steer: 0.48, grip: 1.9, drive: 'rwd', comHigh: true, susp: [0.42, 32], rollK: 1.6, heavy: true },
  fire: { mass: 14000, engine: 32000, vmax: 115, steer: 0.48, grip: 1.8, drive: 'rwd', comHigh: true, susp: [0.42, 34], rollK: 1.6, heavy: true },
};
const ENG = { i4: 'i4', i4t: 'i4t', v6: 'v6', v6t: 'v6t', v8: 'v8', v8s: 'v8s', v8l: 'v8l', v10: 'v10', v12: 'v12', w16: 'w16', dsl: 'dsl', dslH: 'dslH', ev: 'ev', i3: 'i3' };

// colors: realistic US mix for everyday cars (white 24, black 22, gray 18, silver 12, blue 9, red 9, other 6)
// US / Miami paint mix (share %, colors, finish): white 25, black 22, gray 19, silver 11, blue 9, red 8, earth tones 4
// (dark green, brown, beige, gold), loud 2 (orange, yellow, purple, pink, lime).  Whites solid / pearl, silver / gray / blue
// mostly metallic.  Every everyday model rolls this table; rare cars keep their single factory color.
export const US_MIX = [
  [25, [0xf2f2ef, 0xeeeeea, 0xf5f3ec, 0xe9ebe8], ['gloss', 'gloss', 'pearl']],
  [22, [0x0e0f11, 0x15171a, 0x101214, 0x1b1c20], ['gloss', 'metallic']],
  [19, [0x5a5f66, 0x4a4e54, 0x6b7077, 0x3d4146], ['metallic', 'metallic', 'gloss']],
  [11, [0xa9aeb4, 0xb8bcc1, 0x9ca1a7, 0xc4c7cb], ['metallic']],
  [9, [0x173b8f, 0x1c2f5e, 0x2a5aa8, 0x24476e, 0x5b7fa6], ['metallic', 'metallic', 'gloss']],
  [8, [0xb3121b, 0x8e1018, 0xc41f22, 0x7a1f2b], ['metallic', 'gloss']],
  [4, [0x2f4a35, 0x3e5a3a, 0xd8c8a4, 0xb7a68a, 0x5b3a26, 0x6b4f3a, 0xb08d57], ['metallic', 'gloss']],
  [2, [0xe0701f, 0xe8b923, 0x5a2d82, 0xc04a7a, 0x8fbf2a, 0x0e5e7a], ['gloss']],
];
// pickUsColor(r, bias?) -> color; pickUsPaint(r, bias?) -> { color, finish }.  bias: per-bucket weight multipliers
// (sporty models: a little more red / blue / loud; work vehicles: more white)
export function pickUsPaint(r, bias = null) {
  const W = US_MIX.map(([w], i) => w * (bias?.[i] ?? 1)), tot = W.reduce((a, b) => a + b, 0);
  let x = r() * tot;
  for (let i = 0; i < US_MIX.length; i++) { x -= W[i]; if (x <= 0) { const [, list, fin] = US_MIX[i]; return { color: list[(r() * list.length) | 0], finish: fin[(r() * fin.length) | 0] }; } }
  return { color: US_MIX[0][1][0], finish: 'gloss' };
}
export const pickUsColor = (r, bias) => pickUsPaint(r, bias).color;
export const PAINT_BIAS = { sport: [0.8, 1, 0.9, 1, 1.5, 2, 1, 2], lux: [1, 1.4, 1.1, 1.1, 1, 0.8, 1, 0], work: [2.4, 0.7, 0.9, 1, 0.6, 0.5, 0.6, 0.2] };
// sporty / luxury models lean to bolder or darker colors
const PAL = {
  sport: [0xb3121b, 0xff5a1f, 0xffc21a, 0x101214, 0xeeeeea, 0x1d3f8f, 0x5a6470, 0x2a8cff, 0xa9aeb4],
  lux: [0x101214, 0x1b1c20, 0x3a3f46, 0xe7dcc4, 0xeeeeea, 0x1c2a3a, 0x5b1a22, 0xa9aeb4],
  work: [0xf2f2f2, 0xeeeeea, 0xeeeeea, 0xa9aeb4, 0x5a5f66, 0x101214, 0x173b8f, 0xd8cdb0],
};

// key, brand, name, class (traffic pool), phys, real length m, tier (1 beater .. 5 exotic), engine, year, extra
const F = [];
const c = (key, brand, name, cls, phys, L, tier, eng, year, o = {}) => F.push({ key, brand, name, cls, phys, L, tier, eng, year, ...o });
// sedans
c('sedan1', 'Marlin', 'Coastline', 'sedan', 'sedan', 4.88, 2, 'i4', 2021);
c('sedan2', 'Halcyon', 'Vesper S', 'sports', 'sportsedan', 4.67, 3.5, 'v6t', 2016, { pal: 'sport' });
c('sedan3', 'Aurelia', 'Regent C', 'sedan', 'sedan', 4.75, 3.5, 'i4t', 2020, { pal: 'lux' });
c('sedan4', 'Halcyon', 'Vesper E', 'sedan', 'ev', 4.69, 3, 'ev', 2022);
c('sedan5', 'Kestrel', 'Line', 'sedan', 'sedan', 4.64, 1.8, 'i4', 2017);
c('sedan6', 'Osprey', 'Palmetto', 'sedan', 'sedan', 4.93, 2, 'i4t', 2019);
c('sedan7', 'Mirabel', 'Arc', 'sedan', 'sedan', 4.70, 2, 'i4t', 2019);
c('sedan8', 'Tarpon', 'Alisio', 'sedan', 'sedan', 4.97, 2.3, 'i4t', 2021);
c('sedan9', 'Cayo', 'Elara N', 'sports', 'sportsedan', 4.68, 2.6, 'i4t', 2022, { pal: 'sport' });
c('sedan10', 'Cayo', 'Forta', 'sedan', 'sedan', 4.64, 1.8, 'i4', 2019);
c('police1', 'Brava', 'Patrol PX', 'police', 'muscle', 5.10, 3, 'v8', 2020, { police: 'bar', livery: 'police', palette: [0x0e0f11] });
c('taxi1', 'Osprey', 'Palmetto Cab', 'taxi', 'sedan', 4.93, 2, 'i4t', 2019, { model: 'sedan6', taxi: true, livery: 'taxi', palette: [0xf5b800] });
// compacts / hatches
c('hatch1', 'Mirabel', 'Pebble 5', 'compact', 'compact', 4.46, 2, 'i4', 2020);
c('hatch2', 'Pico', 'Eco', 'compact', 'compact', 4.54, 1.6, 'i4', 2012);
// coupes / muscle / classic
c('coupe2', 'Brava', 'Thunder', 'muscle', 'muscle', 4.81, 3, 'v8', 2024, { pal: 'sport' });
c('coupe3', 'Halcyon', 'Vesper Coupe', 'sports', 'sports', 4.80, 3.5, 'v6t', 2021, { pal: 'sport' });
c('conv1', 'Brava', 'Bayline 65', 'muscle', 'classic', 4.61, 2, 'v8', 1965, { convertible: true, classic: true, pal: 'sport' });
// Nico's second car (user-provided model): a 1970 two-door muscle coupe, sun-faded; parked at his place only
c('coupe4', 'Brava', 'Regalia 454', 'muscle', 'classic', 5.03, 2, 'v8', 1970, { classic: true, parkedOnly: true });
c('coupe5', 'Brava', 'Bayline Coupe', 'muscle', 'classic', 4.61, 2, 'v8', 1965, { classic: true, pal: 'sport' });
// rare: one of each on the map (placements.js), never random traffic
c('conv2', 'Brava', 'Mako R Spyder', 'sports', 'sports', 4.63, 4, 'v8', 2022, { rare: true, convertible: true, palette: [0xeeeeea] });   // rare: one factory color
c('super3', 'Vireo', 'Fulmine', 'super', 'super', 4.57, 5, 'v8s', 2017, { rare: true, palette: [0xb3121b] });
c('super4', 'Solano', 'Libeccio RS', 'super', 'super', 4.57, 5, 'v6t', 2023, { rare: true, palette: [0xa9aeb4] });
c('super5', 'Vireo', 'Aeterna', 'super', 'hyper', 4.54, 5, 'w16', 2021, { rare: true, palette: [0x1d3f8f] });
c('super6', 'Vireo', 'Sorpasso 84', 'super', 'super', 4.49, 5, 'v12', 1986, { rare: true, classic: true, palette: [0xb3121b] });
c('suv7', 'Aurelia', 'Regalia X', 'suv', 'luxsuv', 5.34, 5, 'v12', 2021, { rare: true, palette: [0x301d08] });   // user: only its original color (the source model's dark chocolate brown)
// SUVs
c('suv1', 'Aurelia', 'Bastion', 'suv', 'luxsuv', 4.87, 4.5, 'v8l', 2020, { pal: 'lux' });
c('suv2', 'Ridgeback', 'Trailcat', 'suv', 'offroad', 4.88, 2.6, 'v6', 2021);
c('suv3', 'Aurelia', 'Empire XL', 'suv', 'luxsuv', 5.38, 4, 'v8', 2019, { pal: 'lux' });
c('suv4', 'Cayo', 'Sola', 'suv', 'suv', 4.60, 2, 'i4', 2020);
c('suv5', 'Kestrel', 'Mesa', 'suv', 'suv', 4.70, 2.3, 'i4t', 2021);
c('suv6', 'Cayo', 'Tuxa', 'suv', 'suv', 4.63, 2, 'i4', 2022);
c('suv8', 'Osprey', 'Trek', 'compact', 'compact', 4.27, 1.7, 'i3', 2018);
c('suv9', 'Marlin', 'Ridge', 'suv', 'suv', 4.69, 2.2, 'i4t', 2023);
c('suv10', 'Cayo', 'Sporta', 'suv', 'suv', 4.66, 2, 'i4', 2023);
c('suv11', 'Mirabel', 'Crest', 'suv', 'suv', 4.55, 2.2, 'i4', 2019);
c('suv12', 'Ridgeback', 'Outrider 2', 'pickup', 'offroad', 4.41, 2.6, 'v6t', 2022);
c('suv13', 'Kestrel', 'Mesa X', 'compact', 'suv', 4.48, 2, 'i4', 2015);
c('suv14', 'Ridgeback', 'Trail 4', 'pickup', 'offroad', 4.82, 2, 'v6', 2008);
c('suv15', 'Marlin', 'Grand Ridge', 'suv', 'suv', 4.95, 2.5, 'v6', 2021);
// work
c('truck2', 'Ridgeback', '2500 HD', 'pickup', 'pickup', 6.2, 2.4, 'dsl', 2019, { pal: 'work', parkedOnly: true }); // its atlas mixes body, livery and windows: parked work truck only
// Nico's own truck (user-provided model): a wide high-performance off-road pickup; never in random traffic
c('truck9', 'Ridgeback', 'Sandhawk TR', 'pickup', 'offroad', 5.9, 3, 'v6t', 2020, { parkedOnly: true });
c('van1', 'Corvo', 'Cargo LWB', 'van', 'van', 6.95, 2, 'dsl', 2012, { pal: 'work' });
c('van5', 'Corvo', 'Wayfarer', 'van', 'van', 5.2, 1.2, 'v6', 1992, { pal: 'work' });
// family minivans (user models, Nov 17): the most common US family car
c('van6', 'Halcyon', 'Harbor 8', 'minivan', 'suv', 5.16, 2.5, 'v6', 2018);
c('van7', 'Marlin', 'Tidewater LX', 'minivan', 'suv', 5.18, 2.6, 'v6', 2025);
c('truck3', 'Atlas', 'Cab 14', 'truck', 'box', 6.6, 2, 'dsl', 2006, { palette: [0xf2f2f2] });
c('truck4', 'Atlas', 'Box 26', 'truck', 'box', 7.6, 1.5, 'dslH', 1994, { palette: [0xf2f2f2] });
c('truck7', 'Atlas', 'Box 20', 'truck', 'box', 7.0, 2, 'dsl', 2015, { palette: [0xf2f2f2] });
c('truck5', 'Atlas', 'Long Haul', 'truck', 'semi', 7.4, 2, 'dslH', 2010, { palette: [0x9a9a9a] });
c('truck8', 'Atlas', 'Vault', 'truck', 'box', 6.3, 3, 'dslH', 2018, { armored: true, palette: [0x101214] });
// city service trucks (user models, Nov 17 evening): a tow truck (traffic + parked) and the city's front-load refuse truck
c('truck10', 'Atlas', 'Hookline 90', 'tow', 'box', 7.4, 2, 'dsl', 1997, { palette: [0x16181c, 0xf2f2f2, 0xb3121b] });
c('truck13', 'Atlas', 'Southline Sanitation FL', 'garbage', 'box', 9.5, 2, 'dslH', 2016, { service: true, palette: [0x2a5aa8] });
c('truck6', 'Atlas', 'Engine 9', 'firetruck', 'fire', 8.2, 3, 'dslH', 2012, { police: 'fire', livery: 'fire', service: true, palette: [0xc4161c] });
c('van3', 'Corvo', 'Medic One', 'ambulance', 'box', 6.6, 2.5, 'dsl', 2014, { police: 'ambulance', livery: 'ambulance', service: true, palette: [0xf4f4f2] });
c('van4', 'Corvo', 'Medic Two', 'ambulance', 'box', 6.0, 2.5, 'dsl', 2018, { police: 'ambulance', livery: 'ambulance', service: true, palette: [0xf4f4f2] });
export const FLEET = F;
export const FLEET_BY_KEY = Object.fromEntries(F.map((e) => [e.key, e]));
export const fileKey = (key) => FLEET_BY_KEY[key]?.model || key;

/** spec (CAR_TYPES entry) from a fleet entry + its manifest */
export function specFor(e, man) {
  const P = PHYS[e.phys] || PHYS.sedan, s = man.shape, d = man.dims;
  const spec = {
    ...P, L: d.L, W: Math.min(d.W, s.bodyW || d.W), Wm: d.W, wb: man.wb, r: man.r, tw: Math.max(0.18, Math.min(0.4, man.tw)),
    yb: Math.max(0.1, s.yb), belt: s.belt < Math.max(s.yb + 0.3, s.roofY * 0.4) ? s.roofY * 0.55 : s.belt /* glass-derived belt fails on some low-poly trucks */, noseY: s.noseY, tailY: s.tailY, roofY: s.roofY,
    zA: s.zA, zB: s.zB, zC: s.zC, zD: s.zD, cabInset: 0.14,
    label: `${e.brand} ${e.name}`, cls: e.cls, arch: e.phys, vmax: (P.vmax) / 3.6, tier: e.tier, year: e.year, era: e.year < 1996 ? 0 : e.year < 2012 ? 1 : 2,
    rimColor: 0xc9ced3, caliper: 0x333333, spokes: 5, glb: true, fileKey: fileKey(e.key),
  };
  // suspension travel: compression from the resting height is limited to the measured room above the tire (arch gap), so a
  // compressed wheel never disappears into the fender and the tire never has to be pushed into the road to hide it
  { const sag = 9.81 / (4 * spec.susp[1]), gap = Math.max(0.04, Math.min(0.16, man.archGap ?? 0.08)); spec.archGap = gap;
    // physics keeps real bump travel (a bottomed-out ray suspension drops the hull onto the road and trips the car over);
    // the visual wheel is held under the fender by the arch cap in glbCar.syncWheels
    spec.travel = Math.max(0.2, sag + gap); }
  // seat anchors measured from the model's interior by tools/v2/cars/seats.py (hip = H-point, heel, steering wheel; shell space)
  if (man.seats?.length) { spec.seatAnchors = man.seats; spec.seats = man.seats.length; }
  if (man.wheel) spec.steerWheel = man.wheel;
  if (e.convertible) spec.convertible = true;
  if (e.police) spec.police = e.police;
  if (e.taxi) spec.taxi = true;
  if (e.livery) spec.livery = e.livery;
  if (e.classic) spec.classic = true;
  if (P.heavy) spec.heavy = true;
  if (e.phys === 'super' || e.phys === 'hyper' || e.phys === 'sports' || e.cls === 'muscle') spec.coupe = true;
  if (e.cls === 'muscle' || e.phys === 'sports' || e.phys === 'super' || e.phys === 'hyper') spec.coupe = !/sedan/.test(e.phys);
  // center of mass height above the ground (m) and anti-roll stiffness (body weights per meter of left/right travel)
  spec.comY = ({ super: 0.4, hyper: 0.4, sports: 0.44, sportsedan: 0.46, compact: 0.5, sedan: 0.48, ev: 0.46, muscle: 0.48, classic: 0.5, suv: 0.6, luxsuv: 0.62,
    offroad: 0.66, pickup: 0.68, van: 0.74, box: 0.9, semi: 0.95, fire: 0.95 })[e.phys] ?? 0.5;
  spec.antiRoll = ({ super: 7, hyper: 7, sports: 6, sportsedan: 6, compact: 5, sedan: 5, ev: 6, muscle: 5, classic: 3, suv: 6, luxsuv: 6, offroad: 4.5, pickup: 4.5, van: 6.5, box: 7, semi: 7, fire: 7 })[e.phys] ?? 5;
  spec.palette = e.palette || PAL[e.pal] || US_MIX.flatMap((x) => x[1]);
  if (!e.palette && !e.pal) spec.paletteMix = true; // fleet.look() rolls the US color mix
  spec.exhaustPos = [[spec.W / 2 - 0.45, spec.yb + 0.1, -spec.L / 2]];
  return spec;
}
export function modelFor(e) {
  return { key: e.key, brand: e.brand, name: e.name, class: e.cls, engineProfile: ENG[e.eng] || 'i4', tier: e.tier, year: e.year, rare: !!e.rare, parkedOnly: !!e.parkedOnly };
}

// zone fleets (class weights).  Industrial / port: trucks and vans; Keys and rural: pickups; rich zones: more SUVs and sports.
export function zoneMix(zone, income = 0.5, parked = false, env = {}) {
  const rich = Math.max(0, income - 0.5) * 2, poor = Math.max(0, 0.5 - income) * 2;
  const m = { sedan: 30, compact: 16 + poor * 10, suv: 22 + rich * 10, pickup: 6 + poor * 4, van: 5 + poor * 2, taxi: parked ? 0 : 5, sports: 3 + rich * 6, muscle: 2 + poor * 2,
    police: parked ? 0 : 2.5, truck: parked ? 1 : 2.5, firetruck: 0, ambulance: parked ? 0 : 0.4, bus: parked ? 0 : 1.2, minivan: 8 + (1 - rich) * 3, tow: parked ? 0.5 : 0.6, garbage: parked ? 0 : (zone === 'residential' || zone === 'suburb' ? 0.8 : 0.15) };
  if (zone === 'industrial' || zone === 'port') { m.truck = parked ? 10 : 16; m.van = 14; m.pickup = 14; m.sports = 0.5; m.taxi = parked ? 0 : 1; }
  if (zone === 'keys' || env.salt || zone === 'rural' || zone === 'farm' || env.rural) { m.pickup = 26; m.suv += 6; m.taxi = 0; m.bus = 0; m.truck = parked ? 1 : 3; m.sports = 1; m.compact = 10; m.minivan += 2; }
  if (zone === 'downtown' || zone === 'business') { m.taxi = parked ? 0 : 11; m.van += 3; m.truck = parked ? 0.5 : 3; m.minivan = 4; }
  if (zone === 'beach' || zone === 'nightlife') { m.sports += 5; m.muscle += 2; m.taxi = parked ? 0 : 8; }
  return m;
}
