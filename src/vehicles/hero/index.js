// Hero cars for Southline V2: original premium designs (no real brands, badges or replicas).
//   heroCatalog              : data for all five models (names, proportions, handling, engine, audio character, build status)
//   buildHeroCar(THREE, key, opts) -> the builder result vehicles-core expects from registerModel() (see src/vehicles/README.md)
//   models                   : [{ entry, builder }] for every model whose body is built; vehicles.js picks this export up automatically
import * as THREE from 'three';
import { PACK, HERO_KEYS } from './packages.js';
import { buildHeroCar as assemble } from './build.js';
import { DEFS } from './cars/index.js';

const E = {
  hero_green_suv: {
    engine: 'v8',
    cylinders: 8,
    aspiration: 'twin-turbo',
    exhaust: 'loud',
    maxRpm: 6800,
    idleRpm: 750,
    gears: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67],
    final: 3.2,
  },
  hero_red_v10: {
    engine: 'v10',
    cylinders: 10,
    aspiration: 'na',
    exhaust: 'race',
    maxRpm: 8700,
    idleRpm: 1000,
    gears: [3.13, 2.59, 1.96, 1.24, 0.98, 0.98 * 0.86, 0.84 * 0.84],
    final: 3.6,
  },
  hero_graphite_v12: {
    engine: 'v12',
    cylinders: 12,
    aspiration: 'na',
    exhaust: 'race',
    maxRpm: 8900,
    idleRpm: 1000,
    gears: [3.91, 2.44, 1.81, 1.46, 1.19, 0.97, 0.84],
    final: 2.9,
  },
  hero_purple_gt: {
    engine: 'v12',
    cylinders: 16,
    aspiration: 'quad-turbo',
    exhaust: 'race',
    maxRpm: 7100,
    idleRpm: 850,
    gears: [3.2, 2.3, 1.75, 1.4, 1.15, 0.95, 0.8],
    final: 3.4,
  },
  hero_orange_mid: {
    engine: 'v8',
    cylinders: 8,
    aspiration: 'twin-turbo',
    exhaust: 'race',
    maxRpm: 8500,
    idleRpm: 900,
    gears: [3.98, 2.61, 1.9, 1.48, 1.16, 0.91, 0.69],
    final: 3.3,
  },
};
const PHYS = {
  hero_green_suv: {
    mass: 2200,
    engine: 15500,
    vmaxKmh: 305,
    steer: 0.55,
    grip: 2.75,
    drive: 'awd',
    susp: [0.4, 30],
    rollK: 1.1,
    boost: 0.6,
    yb: 0.21,
    belt: 1.12,
    noseY: 0.95,
    tailY: 1.1,
    roofY: 1.64,
    zA: 0.98,
    zB: 0.18,
    zC: -1.9,
    zD: -2.4,
    cabInset: 0.14,
  },
  hero_red_v10: {
    mass: 1480,
    engine: 13000,
    vmaxKmh: 325,
    steer: 0.5,
    grip: 3.1,
    drive: 'awd',
    susp: [0.26, 56],
    rollK: 0.45,
    downforce: 1.5,
    boost: 1,
    wedge: true,
    coupe: true,
    yb: 0.115,
    belt: 0.8,
    noseY: 0.46,
    tailY: 0.88,
    roofY: 1.165,
    zA: 0.98,
    zB: 0.28,
    zC: -0.45,
    zD: -1.5,
    cabInset: 0.2,
  },
  hero_graphite_v12: {
    mass: 1575,
    engine: 15200,
    vmaxKmh: 352,
    steer: 0.48,
    grip: 3.25,
    drive: 'awd',
    susp: [0.25, 60],
    rollK: 0.4,
    downforce: 2.2,
    boost: 1,
    wedge: true,
    coupe: true,
    yb: 0.11,
    belt: 0.78,
    noseY: 0.42,
    tailY: 0.9,
    roofY: 1.135,
    zA: 1.05,
    zB: 0.3,
    zC: -0.45,
    zD: -1.7,
    cabInset: 0.22,
  },
  hero_purple_gt: {
    mass: 1990,
    engine: 19500,
    vmaxKmh: 420,
    steer: 0.48,
    grip: 3.2,
    drive: 'awd',
    susp: [0.27, 54],
    rollK: 0.5,
    downforce: 1.8,
    boost: 1,
    wedge: true,
    coupe: true,
    yb: 0.115,
    belt: 0.9,
    noseY: 0.55,
    tailY: 0.92,
    roofY: 1.21,
    zA: 0.85,
    zB: 0.1,
    zC: -0.5,
    zD: -1.6,
    cabInset: 0.2,
  },
  hero_orange_mid: {
    mass: 1420,
    engine: 13600,
    vmaxKmh: 341,
    steer: 0.5,
    grip: 3.15,
    drive: 'rwd',
    powerSlide: 0.25,
    susp: [0.26, 56],
    rollK: 0.45,
    downforce: 1.6,
    boost: 1,
    wedge: true,
    coupe: true,
    yb: 0.115,
    belt: 0.82,
    noseY: 0.45,
    tailY: 0.9,
    roofY: 1.195,
    zA: 0.95,
    zB: 0.2,
    zC: -0.5,
    zD: -1.5,
    cabInset: 0.22,
  },
};
const AUDIO = {
  hero_green_suv:
    'Twin-turbo hot-V V8: deep cross-plane burble at idle, turbo whoosh and whistle on boost, heavy bass, muted pops on lift-off; lower and thicker than the supercars.',
  hero_red_v10:
    'Naturally aspirated 5.2 L V10, odd-fire howl: metallic bark at idle, rising to a hard-edged shriek at 8,700 rpm, sharp throttle blips, crackles on overrun, lightning-fast dual-clutch shifts.',
  hero_graphite_v12:
    'Naturally aspirated 6.5 L V12: smooth dense howl that turns into a scream near 8,900 rpm, loud titanium exhaust with flames-and-pops on lift-off, a kick on every single-clutch shift.',
  hero_purple_gt:
    'Quad-turbo sixteen-cylinder: low thunder with a huge sub-bass layer, four-turbo whoosh and wastegate whine, relentless turbine-like surge rather than a scream; refined, not raspy.',
  hero_orange_mid:
    'Flat-plane twin-turbo V8: high, hard, buzzy flat-plane note, loud turbo spool and blow-off flutter, raw and mechanical, revs to 8,500 rpm.',
};
const PRICE = {
  hero_green_suv: 262000,
  hero_red_v10: 289000,
  hero_graphite_v12: 585000,
  hero_purple_gt: 3400000,
  hero_orange_mid: 318000,
};
const SPAWN = {
  hero_green_suv: { zones: ['brickell', 'miami-beach', 'business'], weight: 0.25, valet: true },
  hero_red_v10: { zones: ['miami-beach', 'brickell', 'design-district'], weight: 0.2, valet: true },
  hero_graphite_v12: {
    zones: ['miami-beach', 'bay-islands'],
    weight: 0.08,
    valet: true,
    garage: true,
  },
  hero_purple_gt: {
    zones: ['luxury-hotel'],
    weight: 0.04,
    valet: true,
    parkedAt: 'luxury hotel forecourt',
  },
  hero_orange_mid: { zones: ['brickell', 'miami-beach', 'bay-islands'], weight: 0.25, valet: true },
};

function entryFor(key) {
  const pk = PACK[key],
    d = pk.dims,
    f = pk.wheels.front,
    r = pk.wheels.rear;
  return {
    key,
    brand: pk.brand,
    name: pk.name,
    class: pk.cls,
    hero: true,
    pool: 'hero',
    tier: pk.tier,
    palette: [pk.paint.hex],
    engine: E[key],
    price: PRICE[key],
    spawn: SPAWN[key],
    sound: {
      character: AUDIO[key],
      layout: pk.engineBay.where,
      displacement: {
        hero_green_suv: 4.0,
        hero_red_v10: 5.2,
        hero_graphite_v12: 6.5,
        hero_purple_gt: 8.0,
        hero_orange_mid: 4.0,
      }[key],
    },
    spec: {
      L: d.L,
      W: d.W,
      wb: d.wb,
      r: +((f.r + r.r) / 2).toFixed(4),
      tw: +((f.tw + r.tw) / 2).toFixed(3),
      ...PHYS[key],
    },
  };
}
export const heroCatalog = Object.fromEntries(
  HERO_KEYS.map((k) => [
    k,
    {
      ...entryFor(k),
      paint: PACK[k].paint,
      dims: PACK[k].dims,
      doors: PACK[k].doors.map((q) => q.type),
      built: !!DEFS[k],
    },
  ]),
);

/** Builder in the registerModel() contract.  opts = { color, seed, variant, quality, custom }. */
export function buildHeroCar(_THREE, key, opts = {}) {
  const c = assemble(THREE, key, opts),
    pk = PACK[key];
  const L = c.lights;
  return {
    group: c.group,
    wheels: c.wheels.map((w) => ({
      node: w.node,
      side: w.side,
      front: w.front,
      x: w.x,
      z: w.z,
      caliper: w.calHold,
    })),
    lights: {
      head: [L.head],
      drl: [L.drl],
      lens: [L.lens],
      fog: [L.fog],
      tail: [L.tail],
      brake: [L.brake],
      tailLed: [L.brake],
      reverse: [L.reverse],
      blinkL: [L.blinkL],
      blinkR: [L.blinkR],
      amber: [L.amber],
      interior: [L.interior],
    },
    paint: c.paint,
    paintMeshes: c.paintMeshes,
    glass: c.glass,
    deformable: c.paintMeshes.filter(
      (m) => m.parent && m.parent.parent && m.parent.parent.name === 'lod0',
    ),
    detachable: {
      hood: c.parts.hood,
      trunk: c.parts.engineCover,
      bumperF: c.parts.bumperF,
      bumperR: c.parts.bumperR,
      doorFL: c.parts.doorL,
      doorFR: c.parts.doorR,
    },
    doors: [], // door opening animation is not built yet (panels are separate, pivots are not)
    steeringWheel: c.steeringWheel,
    seats: pk.seats.map((s) => ({ x: s.x, y: s.y, z: s.z })),
    eye: pk.eye,
    hull: c.hull,
    plate: c.plate,
    tris: c.tris,
    update() {
      for (const w of c.wheels)
        if (w.calHold && w.node.parent) w.calHold.rotation.x = -(w.node.parent.rotation.x || 0);
    },
    dispose() {
      for (const k in L) L[k].dispose();
      for (const m of c.paint) m.dispose();
    },
  };
}
export const models = HERO_KEYS.filter((k) => DEFS[k]).map((k) => ({
  entry: entryFor(k),
  builder: (T, o) => buildHeroCar(T, k, o),
}));
export { HERO_KEYS, PACK };
