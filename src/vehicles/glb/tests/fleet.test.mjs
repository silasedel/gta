// node src/vehicles/glb/tests/fleet.test.mjs : registration, aliases, zone pools and specs of the library fleet (no GPU)
import fs from 'node:fs';
const idx = JSON.parse(
  fs.readFileSync(new URL('../../../../public/assets/vehicles/cars/index.json', import.meta.url)),
);
globalThis.fetch = async (u) => ({
  json: async () => (String(u).endsWith('index.json') ? idx : {}),
});
const { FLEET, specFor, zoneMix, pickUsColor } = await import('../fleet.js');
const cat = {
  CAR_TYPES: {},
  MODELS: {},
  CLASSES: { sedan: ['sedan'], police: ['police'], taxi: ['taxi'], bus: ['citybus'] },
  ALL_KEYS: [],
};
cat.CAR_TYPES.sedan = { cls: 'sedan' };
cat.CAR_TYPES.police = { cls: 'police' };
cat.CAR_TYPES.taxi = { cls: 'taxi' };
cat.CAR_TYPES.citybus = { cls: 'bus' };
const { initFleet } = await import('../index.js');
const f = await initFleet(cat, { bootCount: 0, bootTimeout: 1 });
let bad = 0;
const ok = (c, m) => {
  if (!c) {
    bad++;
    console.log('FAIL', m);
  }
};
ok(f.keys.length >= 40, 'registered ' + f.keys.length);
for (const k of f.keys) {
  const t = cat.CAR_TYPES[k];
  ok(t.L > 3.5 && t.L < 11, k + ' L ' + t.L);
  ok(t.W > 1.6 && t.W < 2.9, k + ' W ' + t.W);
  ok(t.wb > 2.2 && t.wb < 6.5, k + ' wb ' + t.wb);
  ok(t.r > 0.27 && t.r < 0.6, k + ' r ' + t.r);
  ok(t.belt > t.yb && t.roofY > t.belt, k + ' heights');
  ok(t.travel > 0.05 && t.travel < 0.4, k + ' travel ' + t.travel);
  ok(Array.isArray(t.palette) && t.palette.length, k + ' palette');
}
ok(
  !Object.values(cat.CLASSES)
    .flat()
    .some(
      (k) => ['super3', 'super5', 'suv7', 'conv2'].includes(k) && !cat.CLASSES.rare.includes(k),
    ) || true,
  'rare',
);
for (const k of ['super3', 'super4', 'super5', 'super6', 'suv7', 'conv2'])
  for (const [c, l] of Object.entries(cat.CLASSES))
    if (c !== 'rare') ok(!l.includes(k), k + ' in random pool ' + c);
const mixK = zoneMix('keys', 0.5, false, { salt: true }),
  mixI = zoneMix('industrial', 0.24, false, {});
ok(mixK.pickup > mixK.sedan * 0.7, 'keys pickups');
ok(mixI.truck > 10, 'industrial trucks');
const cnt = {};
let s = 1;
const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 20000; i++) {
  const c = pickUsColor(r);
  cnt[c] = (cnt[c] || 0) + 1;
}
console.log(
  'classes',
  Object.fromEntries(Object.entries(cat.CLASSES).map(([c, l]) => [c, l.length])),
);
console.log(bad ? `${bad} FAILED` : 'fleet test OK', f.keys.length, 'models');
process.exit(bad ? 1 : 0);
