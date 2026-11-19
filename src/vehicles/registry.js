// Vehicle registry: the plug-in surface other tracks use (hero cars, boats, yachts, aircraft, scooters).
// Pure data + adapters; no physics here.  See src/vehicles/README.md for the full contract.
import * as THREE from 'three';

// ---------------------------------------------------------------- external car models (registerModel)
// name -> { entry, builder }
const externalModels = new Map();
const modelListeners = [];

const ENGINE_DEFAULTS = {
  i4: {
    engine: 'i4',
    cylinders: 4,
    aspiration: 'na',
    exhaust: 'quiet',
    maxRpm: 6500,
    idleRpm: 750,
    gears: [3.6, 2.1, 1.4, 1.0, 0.8],
    final: 3.9,
  },
  v6: {
    engine: 'v6',
    cylinders: 6,
    aspiration: 'na',
    exhaust: 'sporty',
    maxRpm: 7000,
    idleRpm: 750,
    gears: [4.0, 2.4, 1.6, 1.2, 0.95, 0.78],
    final: 3.6,
  },
  v8: {
    engine: 'v8',
    cylinders: 8,
    aspiration: 'na',
    exhaust: 'loud',
    maxRpm: 6600,
    idleRpm: 650,
    gears: [2.7, 1.8, 1.3, 1.0, 0.75],
    final: 3.4,
  },
  v8tt: {
    engine: 'v8',
    cylinders: 8,
    aspiration: 'twin-turbo',
    exhaust: 'loud',
    maxRpm: 7200,
    idleRpm: 750,
    gears: [3.3, 2.2, 1.6, 1.25, 1.0, 0.82, 0.68],
    final: 3.3,
  },
  v10: {
    engine: 'v10',
    cylinders: 10,
    aspiration: 'na',
    exhaust: 'race',
    maxRpm: 8800,
    idleRpm: 1000,
    gears: [3.1, 2.2, 1.65, 1.3, 1.07, 0.9, 0.76],
    final: 3.6,
  },
  v12: {
    engine: 'v12',
    cylinders: 12,
    aspiration: 'na',
    exhaust: 'race',
    maxRpm: 9000,
    idleRpm: 1000,
    gears: [3.1, 2.2, 1.65, 1.3, 1.07, 0.9, 0.76],
    final: 3.6,
  },
  w16: {
    engine: 'v12',
    cylinders: 16,
    aspiration: 'quad-turbo',
    exhaust: 'race',
    maxRpm: 7400,
    idleRpm: 900,
    gears: [3.2, 2.3, 1.75, 1.4, 1.15, 0.95, 0.8],
    final: 3.4,
  },
  diesel: {
    engine: 'diesel',
    cylinders: 6,
    aspiration: 'turbo',
    exhaust: 'diesel',
    maxRpm: 4500,
    idleRpm: 650,
    gears: [4.0, 2.4, 1.6, 1.15, 0.85, 0.68],
    final: 3.4,
  },
  electric: {
    engine: 'electric',
    cylinders: 0,
    aspiration: 'electric',
    exhaust: 'none',
    maxRpm: 14000,
    idleRpm: 0,
    gears: [9.0],
    final: 1.0,
  },
};

// physics / proportion defaults per class when an entry leaves a field out
const CLASS_SPEC = {
  super: {
    L: 4.6,
    W: 2.02,
    wb: 2.7,
    r: 0.35,
    tw: 0.32,
    yb: 0.12,
    belt: 0.74,
    noseY: 0.45,
    tailY: 0.9,
    roofY: 1.14,
    zA: 0.75,
    zB: 0.05,
    zC: -0.75,
    zD: -1.95,
    cabInset: 0.22,
    coupe: true,
    mass: 1500,
    engine: 13500,
    vmax: 330,
    steer: 0.5,
    grip: 3.1,
    drive: 'awd',
    downforce: 1.6,
    susp: [0.26, 56],
    rollK: 0.45,
    boost: 1,
  },
  sports: {
    L: 4.45,
    W: 1.94,
    wb: 2.62,
    r: 0.345,
    tw: 0.28,
    yb: 0.17,
    belt: 0.8,
    noseY: 0.56,
    tailY: 0.86,
    roofY: 1.24,
    zA: 0.5,
    zB: -0.18,
    zC: -0.85,
    zD: -1.8,
    cabInset: 0.17,
    coupe: true,
    mass: 1400,
    engine: 9800,
    vmax: 265,
    steer: 0.55,
    grip: 2.6,
    drive: 'rwd',
    powerSlide: 0.2,
    susp: [0.3, 42],
    rollK: 0.7,
    boost: 0.6,
  },
  suv: {
    L: 5.0,
    W: 2.0,
    wb: 3.0,
    r: 0.4,
    tw: 0.3,
    yb: 0.36,
    belt: 1.15,
    noseY: 0.98,
    tailY: 1.12,
    roofY: 1.68,
    zA: 1.0,
    zB: 0.4,
    zC: -1.9,
    zD: -2.2,
    cabInset: 0.14,
    mass: 2200,
    engine: 14500,
    vmax: 300,
    steer: 0.55,
    grip: 2.7,
    drive: 'awd',
    susp: [0.4, 30],
    rollK: 1.2,
  },
  sedan: {
    L: 4.75,
    W: 1.86,
    wb: 2.8,
    r: 0.33,
    tw: 0.24,
    yb: 0.22,
    belt: 0.97,
    noseY: 0.72,
    tailY: 0.98,
    roofY: 1.46,
    zA: 0.85,
    zB: 0.08,
    zC: -0.95,
    zD: -1.48,
    cabInset: 0.15,
    mass: 1400,
    engine: 6800,
    vmax: 185,
    steer: 0.6,
    grip: 2.2,
    drive: 'fwd',
    susp: [0.36, 34],
    rollK: 1,
  },
};

/**
 * Normalize a registerModel() entry into the internal { spec, model } pair used by vehicles.js.
 * Throws on a malformed entry (missing key).
 */
export function normalizeEntry(entry) {
  if (!entry || typeof entry.key !== 'string' || !entry.key)
    throw new Error('registerModel: entry.key (string) is required');
  const cls = entry.class || entry.cls || 'sports';
  const base =
    CLASS_SPEC[cls] || CLASS_SPEC[cls === 'muscle' || cls === 'compact' ? 'sedan' : 'sports'];
  const s = { ...base, ...(entry.spec || {}) };
  // vmax arrives in km/h, the physics spec stores m/s
  s.vmax = (entry.spec?.vmaxKmh ?? entry.spec?.vmax ?? base.vmax) / 3.6;
  s.cls = cls;
  s.arch = entry.arch || cls;
  s.label = `${entry.brand || 'Custom'} ${entry.name || entry.key}`;
  s.palette = entry.palette && entry.palette.length ? entry.palette.slice() : [0x101214];
  s.rimColor ??= 0x1d1f22;
  s.caliper ??= 0xd8261b;
  s.spokes ??= 10;
  s.external = true;
  s.tier = entry.tier || (cls === 'super' ? 'super' : 'mid');
  const e =
    typeof entry.engine === 'string'
      ? ENGINE_DEFAULTS[entry.engine] || ENGINE_DEFAULTS.v8
      : { ...ENGINE_DEFAULTS.v8, ...(entry.engine || {}) };
  const model = {
    key: entry.key,
    brand: entry.brand || 'Custom',
    name: entry.name || entry.key,
    class: cls,
    engine: e.engine,
    maxRpm: e.maxRpm,
    idleRpm: e.idleRpm,
    gears: e.gears,
    final: e.final,
    sound: {
      engine: e.engine,
      cylinders: e.cylinders,
      aspiration: e.aspiration,
      exhaust: e.exhaust,
      ...(entry.sound || {}),
    },
    tier: s.tier,
    hero: !!entry.hero,
    spawn: entry.spawn || null,
    price: entry.price ?? null,
  };
  return { spec: s, model };
}

export function addExternalModel(entry, builder) {
  if (typeof builder !== 'function')
    throw new Error('registerModel: builder must be a function (THREE, opts) -> parts');
  const n = normalizeEntry(entry);
  externalModels.set(entry.key, { entry, builder, ...n });
  for (const f of modelListeners) {
    try {
      f(entry.key, n);
    } catch (e) {
      console.error('[vehicles] model listener', e);
    }
  }
  return n;
}
export const hasExternalModel = (key) => externalModels.has(key);
export const getExternalModel = (key) => externalModels.get(key);
export const externalModelKeys = () => [...externalModels.keys()];
export const onModelRegistered = (f) => modelListeners.push(f);

// a light-material handle that fans emissiveIntensity / color changes out to several real materials
function fan(mats) {
  const list = (Array.isArray(mats) ? mats : [mats]).filter(Boolean);
  const h = {
    list,
    _i: list[0]?.emissiveIntensity ?? 0,
    get emissiveIntensity() {
      return this._i;
    },
    set emissiveIntensity(x) {
      if (x === this._i) return;
      this._i = x;
      for (const m of list) m.emissiveIntensity = x * (m.userData?.gain ?? 1);
    },
    color: {
      setHex(hx) {
        for (const m of list) m.color?.setHex(hx);
      },
    },
    emissive: {
      setHex(hx) {
        for (const m of list) m.emissive?.setHex(hx);
      },
    },
    dispose() {
      /* owned by the external builder */
    },
  };
  return h;
}
const LIGHT_KEYS = [
  'head',
  'tail',
  'reverse',
  'amber',
  'drl',
  'lens',
  'tailLed',
  'blinkL',
  'blinkR',
  'fog',
  'sign',
  'red',
  'blue',
  'brake',
  'interior',
];

/**
 * Run an external builder and adapt its output to the internal car shape used by vehicles.js.
 * Returns null if the builder fails (the caller falls back to a stock model).
 */
export function buildExternalCar(key, color, opts = {}) {
  const ext = externalModels.get(key);
  if (!ext) return null;
  let r = null;
  try {
    r = ext.builder(THREE, {
      color,
      seed: opts.seed ?? 0,
      variant: opts.variant || null,
      quality: opts.quality || 'high',
      custom: opts.custom || null,
    });
  } catch (e) {
    console.error('[vehicles] external builder failed:', key, e);
    return null;
  }
  if (!r || !(r.group || r.root)) {
    console.error('[vehicles] external builder returned no group:', key);
    return null;
  }
  const t = ext.spec;
  const root = new THREE.Group(),
    shell = new THREE.Group();
  root.add(shell);
  const body = r.group || r.root;
  shell.add(body);
  // wheels: FL, FR, RL, RR  (+x = left).  node = pivot at the wheel center, spinning about its local X axis.
  const wheels = [];
  const order = [
    [1, true],
    [-1, true],
    [1, false],
    [-1, false],
  ];
  const given = Array.isArray(r.wheels) ? r.wheels : [];
  order.forEach(([side, front], i) => {
    const w =
      given.find((g) => (g.side ?? Math.sign(g.x || 1)) === side && !!g.front === front) ||
      given[i] ||
      null;
    const steer = new THREE.Group(),
      spin = new THREE.Group();
    steer.add(spin);
    const x = w?.x ?? side * (t.W / 2 - t.tw / 2 - 0.03),
      z = w?.z ?? (front ? t.wb / 2 : -t.wb / 2);
    const detail = [];
    if (w?.node) {
      w.node.parent?.remove(w.node);
      w.node.position.set(0, 0, 0);
      spin.add(w.node);
      w.node.traverse((o) => {
        if (o.isMesh) detail.push(o);
      });
    }
    root.add(steer);
    wheels.push({
      steer,
      spin,
      side,
      front,
      detail: w?.lodDetail || [],
      lo: w?.lo || null,
      x,
      z,
      external: true,
      node: w?.node || null,
      caliper: w?.caliper || null,
    });
  });
  const lightMats = {};
  const lights = r.lights || {};
  for (const k of LIGHT_KEYS)
    lightMats[k] = fan(lights[k] || (k === 'tailLed' ? lights.brake : null) || []);
  const paintMats = Array.isArray(r.paint) ? r.paint : r.paint ? [r.paint] : [];
  const glass = Array.isArray(r.glass) ? r.glass : [];
  const deform = Array.isArray(r.deformable) ? r.deformable : [];
  return {
    root,
    shell,
    wheels,
    lightMats,
    spec: t,
    paint: paintMats[0] || new THREE.MeshPhysicalMaterial({ color }),
    paintMats,
    parts: { paint: deform[0] || null, roof: deform[1] || null },
    deformable: deform,
    slots: { paint: r.paintMeshes || [], glass, roof: [] },
    steeringWheel: r.steeringWheel || null,
    info: ext.model,
    lod: { levels: [] },
    kit: 'base',
    hull: r.hull || null,
    _res: null,
    external: r,
    doors: r.doors || [],
    detachable: r.detachable || {},
    seats: r.seats || null,
    extUpdate: typeof r.update === 'function' ? r.update : null,
    extDispose: typeof r.dispose === 'function' ? r.dispose : null,
  };
}

// ---------------------------------------------------------------- non-car kinds (registerKind)
// kind -> impl { spawn, list, nearest, update, fixed?, remove?, types? }
export function createKindRegistry() {
  const kinds = new Map();
  return {
    kinds,
    register(kind, impl) {
      if (typeof kind !== 'string' || !kind)
        throw new Error('registerKind: kind (string) is required');
      if (!impl || typeof impl !== 'object')
        throw new Error('registerKind: impl object is required');
      const k = { list: [], ...impl, kind };
      if (!Array.isArray(k.list)) k.list = [];
      kinds.set(kind, k);
      return k;
    },
    get: (kind) => kinds.get(kind) || null,
    has: (kind) => kinds.has(kind),
    // "boat:skiff" -> ['boat', 'skiff'];  a bare type that some kind lists in impl.types is routed to it
    route(type) {
      if (typeof type !== 'string') return null;
      const i = type.indexOf(':');
      if (i > 0 && kinds.has(type.slice(0, i)))
        return [kinds.get(type.slice(0, i)), type.slice(i + 1)];
      if (kinds.has(type)) return [kinds.get(type), null];
      for (const k of kinds.values())
        if (
          Array.isArray(k.types)
            ? k.types.includes(type)
            : typeof k.types === 'function' && k.types(type)
        )
          return [k, type];
      return null;
    },
    nearest(pos, maxDist) {
      let best = null,
        bd = maxDist;
      for (const k of kinds.values()) {
        if (typeof k.nearest !== 'function') continue;
        let v = null;
        try {
          v = k.nearest(pos, maxDist);
        } catch (e) {
          console.error('[vehicles] kind nearest', k.kind, e);
        }
        if (!v) continue;
        let d = maxDist * 0.999;
        try {
          d = typeof k.distance === 'function' ? k.distance(v, pos) : distTo(v, pos);
        } catch (e) {
          /* keep default */
        }
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
      return best ? { vehicle: best, dist: bd } : null;
    },
    update(dt) {
      for (const k of kinds.values())
        if (typeof k.update === 'function') {
          try {
            k.update(dt);
          } catch (e) {
            console.error('[vehicles] kind update', k.kind, e);
          }
        }
    },
    fixed(dt) {
      for (const k of kinds.values())
        if (typeof k.fixed === 'function') {
          try {
            k.fixed(dt);
          } catch (e) {
            console.error('[vehicles] kind fixed', k.kind, e);
          }
        }
    },
    all() {
      const out = [];
      for (const k of kinds.values()) for (const v of k.list || []) out.push(v);
      return out;
    },
  };
}
function distTo(v, pos) {
  const p = v.position || v.mesh?.position;
  if (!p) return Infinity;
  return Math.hypot(p.x - pos.x, (p.y ?? 0) - (pos.y ?? 0), p.z - pos.z);
}
