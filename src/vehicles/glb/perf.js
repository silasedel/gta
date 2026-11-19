// Per-model performance (W2, Nov 19 playtest): every library car gets the acceleration, top speed, weight, drivetrain, handling
// and engine voice of the real car it is styled after (no brands in game; the "like" column is only a tuning reference).
//   t100   0-100 km/h in seconds (real road-test figure)        vmax   top speed km/h (real, limiter included)
//   mass   curb weight kg                                         drive  'fwd' | 'rwd' | 'awd'
//   grip   tire friction (class default if omitted)              steer  max steer angle (class default if omitted)
//   rollK  visual body roll (1 = normal)  comY  center of mass height m   brakeK  braking decel scale (1 = 8.4 m/s2)
//   eng    engine profile (glb/index.js E)   voice   audio engine character (core/audio.js ENGINE key) when not the profile's own
// The drive force is solved from t100 (solveEngineForce: the same force law, torque curve and gearbox as vehicles.js) so the
// numbers stay true when the physics changes; FORCE_TRIM corrects for what the 1-D model misses (wheel slip, suspension squat),
// measured in the sandbox by tools/v2/cars/accel.mjs.
export const FORCE_TRIM = 1.0;
// tire rolling / scrub loss the ray-cast wheels show in the sandbox (~0.3 m/s2 whatever the car: tools/v2/cars/accel.mjs)
const RESIST = 0.3;

export const PERF = {
  // like: Camry 2.5 / Corolla / Malibu / Jetta / Accord 1.5T / Elantra N / Elantra / Model 3 LR / M340i / C300
  sedan1: { t100: 8.0, vmax: 200, mass: 1500, drive: 'fwd' },
  sedan2: { t100: 4.4, vmax: 250, mass: 1700, drive: 'rwd', grip: 2.7, steer: 0.58, comY: 0.46, brakeK: 1.15, eng: 'v6t' },
  sedan3: { t100: 6.0, vmax: 250, mass: 1700, drive: 'rwd', grip: 2.4, brakeK: 1.05 },
  sedan4: { t100: 4.2, vmax: 233, mass: 1850, drive: 'awd', grip: 2.6, comY: 0.42, brakeK: 1.1 },
  sedan5: { t100: 9.2, vmax: 180, mass: 1350, drive: 'fwd' },
  sedan6: { t100: 8.0, vmax: 200, mass: 1500, drive: 'fwd' },
  sedan7: { t100: 7.4, vmax: 210, mass: 1400, drive: 'fwd' },
  sedan8: { t100: 7.4, vmax: 200, mass: 1480, drive: 'fwd' },
  sedan9: { t100: 5.3, vmax: 250, mass: 1440, drive: 'fwd', grip: 2.6, steer: 0.6, brakeK: 1.1 },
  sedan10: { t100: 8.6, vmax: 190, mass: 1300, drive: 'fwd' },
  police1: { t100: 5.8, vmax: 240, mass: 1950, drive: 'rwd', grip: 2.45, brakeK: 1.1 },   // V8 pursuit sedan
  taxi1: { t100: 8.4, vmax: 190, mass: 1550, drive: 'fwd' },
  // hatches: Civic sport hatch, Prius
  hatch1: { t100: 7.0, vmax: 210, mass: 1350, drive: 'fwd', steer: 0.64 },
  hatch2: { t100: 10.2, vmax: 180, mass: 1400, drive: 'fwd', grip: 2.1, voice: 'i3' },
  // muscle / classic: Mustang GT, '65 drop-top, Chevelle SS 454, '65 pony coupe
  coupe2: { t100: 4.4, vmax: 250, mass: 1750, drive: 'rwd' },
  conv1: { t100: 8.5, vmax: 190, mass: 1450, drive: 'rwd' },
  coupe4: { t100: 6.0, vmax: 210, mass: 1700, drive: 'rwd' },
  ute1: { t100: 7.0, vmax: 200, mass: 1700, drive: 'rwd', grip: 2.1, rollK: 1.35, antiRoll: 3.5, powerSlide: 0.45, eng: 'v8', voice: 'v8' },   // '70 coupe-utility SS 396 (350 hp): soft springs, lazy rear
  coupe5: { t100: 7.8, vmax: 195, mass: 1300, drive: 'rwd' },
  // sports: M4-like twin-turbo six coupe, C8-like mid-engine convertible
  coupe3: { t100: 3.9, vmax: 290, mass: 1725, drive: 'rwd', grip: 2.85, steer: 0.57, rollK: 0.65, comY: 0.44, antiRoll: 6.5, brakeK: 1.1, powerSlide: 0.12, eng: 'v6t' },
  conv2: { t100: 3.0, vmax: 312, mass: 1680, drive: 'rwd', grip: 3.0, steer: 0.55, rollK: 0.55, comY: 0.42, brakeK: 1.3, eng: 'v8' },
  // super / hyper: 488-like twin-turbo V8 (rwd), 911 GT3 RS-like (rear engine, sharp), Chiron-like, Countach-like
  super3: { t100: 3.0, vmax: 330, mass: 1475, drive: 'rwd', grip: 3.1, powerSlide: 0.1, brakeK: 1.0, eng: 'v8f', voice: 'v10' },
  super4: { t100: 3.2, vmax: 296, mass: 1450, drive: 'rwd', grip: 3.3, steer: 0.56, downforce: 2.4, brakeK: 1.1, powerSlide: 0, eng: 'f6', voice: 'flat6' },
  super5: { t100: 2.4, vmax: 420, mass: 1995, drive: 'awd', brakeK: 1.4 },
  super6: { t100: 4.9, vmax: 295, mass: 1490, drive: 'rwd', grip: 2.6, downforce: 1.1, brakeK: 1.0 },
  // SUVs: G63 (heavy, boxy, loud twin-turbo V8), old Land Cruiser, Escalade, RAV4, Q7, Tucson, Cullinan, HR-V, RAV4, Kona,
  // CX-5, Bronco 2-door, Crosstrek, 4Runner, Highlander
  suv1: { t100: 4.5, vmax: 220, mass: 2560, drive: 'awd', grip: 2.05, steer: 0.52, rollK: 1.7, comY: 0.72, antiRoll: 5, brakeK: 0.92, eng: 'v8tt' },
  suv2: { t100: 12.5, vmax: 160, mass: 2100, drive: 'awd', grip: 1.9, rollK: 1.9 },
  suv3: { t100: 6.0, vmax: 210, mass: 2700, drive: 'awd', grip: 2.1, rollK: 1.5, comY: 0.66, brakeK: 0.95 },
  suv4: { t100: 8.5, vmax: 190, mass: 1600, drive: 'awd' },
  suv5: { t100: 5.9, vmax: 250, mass: 2200, drive: 'awd', grip: 2.35, eng: 'v6t' },
  suv6: { t100: 8.8, vmax: 190, mass: 1650, drive: 'fwd' },
  suv7: { t100: 5.2, vmax: 250, mass: 2750, drive: 'awd', grip: 2.2, rollK: 1.2, brakeK: 0.95, voice: 'v8' },   // V12, near silent: smooth V8 voice
  suv8: { t100: 10.5, vmax: 175, mass: 1350, drive: 'fwd' },
  suv9: { t100: 8.2, vmax: 190, mass: 1650, drive: 'awd' },
  suv10: { t100: 9.0, vmax: 185, mass: 1450, drive: 'fwd' },
  suv11: { t100: 8.0, vmax: 195, mass: 1600, drive: 'awd' },
  suv12: { t100: 6.6, vmax: 180, mass: 2050, drive: 'awd', rollK: 1.8 },
  suv13: { t100: 9.5, vmax: 185, mass: 1500, drive: 'awd' },
  suv14: { t100: 8.5, vmax: 175, mass: 2100, drive: 'awd', rollK: 1.8 },
  suv15: { t100: 7.5, vmax: 200, mass: 2000, drive: 'awd' },
  // trucks / vans: Ram 2500 Cummins, Raptor, Sprinter, '90s van, Odyssey, Sienna
  truck2: { t100: 8.5, vmax: 160, mass: 3300, drive: 'awd' },
  truck9: { t100: 5.6, vmax: 180, mass: 2600, drive: 'awd', rollK: 1.6 },
  van1: { t100: 13, vmax: 160, mass: 2700, drive: 'rwd' },
  van5: { t100: 12, vmax: 160, mass: 2400, drive: 'rwd' },
  van6: { t100: 7.4, vmax: 190, mass: 2000, drive: 'fwd' },
  van7: { t100: 7.8, vmax: 180, mass: 2100, drive: 'fwd' },
  // military: M1151-like Humvee (6.5 L turbo diesel, 4,700 kg armored)
  humvee1: { t100: 18, vmax: 113, mass: 4700, drive: 'awd', grip: 2.0, steer: 0.55, rollK: 1.4, comY: 0.9, antiRoll: 6, brakeK: 0.85 },
};

// engine profiles that the fleet's real cars need beyond glb/index.js E (merged there)
export const EXTRA_ENGINES = {
  f6: { engine: 'flat6', cylinders: 6, aspiration: 'na', exhaust: 'race', maxRpm: 9000, idleRpm: 950, gears: [3.75, 2.38, 1.72, 1.34, 1.11, 0.96, 0.84], final: 4.97 },
  f6t: { engine: 'flat6', cylinders: 6, aspiration: 'twin-turbo', exhaust: 'sporty', maxRpm: 7500, idleRpm: 850, gears: [3.91, 2.29, 1.58, 1.18, 0.94, 0.79, 0.62, 0.5], final: 3.62 },
  v8f: { engine: 'v8', cylinders: 8, aspiration: 'twin-turbo', exhaust: 'race', maxRpm: 8000, idleRpm: 950, gears: [3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], final: 4.44 },
  v8tt: { engine: 'v8', cylinders: 8, aspiration: 'twin-turbo', exhaust: 'loud', maxRpm: 6500, idleRpm: 650, gears: [4.38, 2.86, 1.92, 1.37, 1.0, 0.82, 0.73, 0.6], final: 3.27 },
};

// 1-D replica of vehicles.js longitudinal drive (force law, torque curve, automatic gearbox) -> seconds to 100 km/h
function torqueCurve(model, rpm) {
  const n = Math.min(1, Math.max(0, rpm / model.maxRpm));
  return model.engine === 'diesel' ? 1.15 - 0.45 * n : model.engine === 'electric' ? 1.8 - 0.85 * n : 0.82 + 0.38 * Math.sin(Math.PI * Math.min(1, n * 1.05));
}
export function timeTo100(F, spec, model) {
  const h = 1 / 60, m = spec.mass, G = model.gears, r = spec.r || 0.33, vmax = spec.vmax, shiftDur = spec.shift ?? 0.22;
  let v = 0, t = 0, gear = 1, shiftT = 0, rpm = model.idleRpm;
  while (v < 27.78 && t < 60) {
    if (shiftT > 0) shiftT -= h;
    const wheelRpm = v / r * 60 / (2 * Math.PI);
    let target = wheelRpm * G[gear - 1] * model.final;
    if (shiftT <= 0 && target > model.maxRpm * 0.92 && gear < G.length) { gear++; shiftT = shiftDur; target = wheelRpm * G[gear - 1] * model.final; }
    const slip = model.idleRpm + model.maxRpm * (spec.drive === 'rwd' && v < 6 ? 0.75 : 0.45);
    if (v < 7) target = Math.max(target, slip * (1 - v / 9) + target * 0.3);
    target = Math.min(model.maxRpm, Math.max(model.idleRpm, target));
    if (model.engine === 'electric') target = wheelRpm * G[0] * model.final;
    rpm += (target - rpm) * Math.min(1, h * (shiftT > 0 ? 18 : 10));
    let f = F * Math.max(0, 1 - Math.pow(v / vmax, 2.2)) * (v < 6 ? 1.15 : 1) * torqueCurve(model, rpm);
    if (shiftT > 0) f *= 0.2;
    v += Math.max(0, f / m - RESIST) * h; t += h;
  }
  return t;
}
/** drive force (N) that makes this spec + engine profile reach 100 km/h in t100 seconds */
export function solveEngineForce(spec, model, t100) {
  let lo = spec.mass * 1.0, hi = spec.mass * 30;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (timeTo100(mid, spec, model) > t100) lo = mid; else hi = mid; }
  return Math.round((lo + hi) / 2 * FORCE_TRIM);
}
