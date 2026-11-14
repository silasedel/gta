// Traffic driver personalities.  Every AI car gets a seeded driver: a type (careful, aggressive, distracted, lost,
// in a hurry, elderly, tourist, show-off) plus per-driver jitter, so no two drivers behave exactly alike.
// vehicles.js reads these numbers inside aiDrive(); traffic/stats below collects what each type actually did.
import { rng, hashSeed } from '../model/rng.js';

// speed: cruise speed relative to the posted limit; gap: standstill gap (m); headway: time gap (s) kept at speed;
// react: reaction delay (s); brake: braking aggressiveness (1 = normal, >1 late and hard); accel: throttle scale;
// lane: lane changes per minute when a slower car is ahead; redRun: chance to run a fresh red; amberGo: keeps going on amber
// up to this many meters from the line; stopFull: full stop at stop signs (else rolls through); stopWait: seconds stopped;
// honk: horn eagerness; pedMargin: extra lateral margin (m) around pedestrians; siren: chance to notice a siren and pull over;
// wander: 0..1 random slowdowns and odd turns (lost / tourist); phone: 0..1 time spent glancing away (distracted)
export const DRIVER_TYPES = {
  careful:    { w: 22, speed: 0.9,  gap: 4.5, headway: 2.2, react: 0.45, brake: 0.8, accel: 0.6, lane: 0.25, redRun: 0,    amberGo: 3,  stopFull: 1,    stopWait: 1.4, honk: 0.1, pedMargin: 0.8, siren: 0.98, wander: 0,    phone: 0 },
  aggressive: { w: 14, speed: 1.16, gap: 1.6, headway: 0.8, react: 0.3,  brake: 1.5, accel: 1.0, lane: 2.2,  redRun: 0.12, amberGo: 30, stopFull: 0.15, stopWait: 0.2, honk: 1,   pedMargin: 0,   siren: 0.6,  wander: 0,    phone: 0 },
  distracted: { w: 14, speed: 0.97, gap: 3.0, headway: 1.4, react: 1.1,  brake: 1.3, accel: 0.7, lane: 0.5,  redRun: 0.05, amberGo: 12, stopFull: 0.6,  stopWait: 0.8, honk: 0.2, pedMargin: 0.2, siren: 0.45, wander: 0.15, phone: 0.35 },
  lost:       { w: 9,  speed: 0.8,  gap: 3.5, headway: 1.8, react: 0.7,  brake: 1.1, accel: 0.55, lane: 0.9, redRun: 0.02, amberGo: 6,  stopFull: 0.9,  stopWait: 1.6, honk: 0.1, pedMargin: 0.5, siren: 0.8,  wander: 0.7,  phone: 0.1 },
  hurry:      { w: 14, speed: 1.22, gap: 2.0, headway: 1.0, react: 0.35, brake: 1.35, accel: 0.95, lane: 1.6, redRun: 0.06, amberGo: 25, stopFull: 0.35, stopWait: 0.4, honk: 0.7, pedMargin: 0.1, siren: 0.75, wander: 0,   phone: 0.05 },
  elderly:    { w: 9,  speed: 0.78, gap: 5.5, headway: 2.6, react: 0.9,  brake: 0.7, accel: 0.45, lane: 0.1, redRun: 0.01, amberGo: 2,  stopFull: 1,    stopWait: 2.0, honk: 0.05, pedMargin: 1.0, siren: 0.7, wander: 0.1,  phone: 0 },
  tourist:    { w: 10, speed: 0.84, gap: 3.8, headway: 1.9, react: 0.65, brake: 1.2, accel: 0.6, lane: 0.4,  redRun: 0.02, amberGo: 5,  stopFull: 0.85, stopWait: 1.2, honk: 0.15, pedMargin: 0.6, siren: 0.85, wander: 0.45, phone: 0.15 },
  showoff:    { w: 8,  speed: 1.1,  gap: 2.2, headway: 1.0, react: 0.35, brake: 1.4, accel: 1.0, lane: 1.4,  redRun: 0.05, amberGo: 22, stopFull: 0.4,  stopWait: 0.3, honk: 0.6, pedMargin: 0.2, siren: 0.7,  wander: 0,    phone: 0.05 },
};
export const DRIVER_TYPE_IDS = Object.keys(DRIVER_TYPES);

// rollDriver(seed, env) -> { type, ...numbers }.  env.zone biases the mix (tourists by the beach, hurry downtown).
export function rollDriver(seed, env = {}) {
  const r = rng(hashSeed('driver', seed >>> 0));
  const w = {};
  for (const id of DRIVER_TYPE_IDS) w[id] = DRIVER_TYPES[id].w;
  if (env.zone === 'beach' || env.zone === 'nightlife') { w.tourist *= 2.2; w.showoff *= 1.8; }
  if (env.zone === 'downtown' || env.zone === 'business') { w.hurry *= 1.7; w.aggressive *= 1.3; }
  if (env.zone === 'residential' || env.rural) { w.elderly *= 1.8; w.careful *= 1.3; }
  if (env.fleet) { w.lost = 0.5; w.tourist = 0.2; w.hurry *= 1.6; }
  const type = r.weighted(w), b = DRIVER_TYPES[type], j = (x, k) => x * (1 + r.normal() * k);
  return {
    type, seed,
    speed: j(b.speed, 0.05), gap: Math.max(1, j(b.gap, 0.15)), headway: Math.max(0.5, j(b.headway, 0.15)), react: Math.max(0.15, j(b.react, 0.2)),
    brake: j(b.brake, 0.1), accel: Math.min(1, j(b.accel, 0.1)), lane: Math.max(0, j(b.lane, 0.3)), redRun: b.redRun, amberGo: b.amberGo,
    stopFull: b.stopFull, stopWait: j(b.stopWait, 0.2), honk: b.honk, pedMargin: b.pedMargin, siren: b.siren, wander: b.wander, phone: b.phone,
  };
}

// per-type accumulators for the measurement script: game.vehicles.trafficStats()
export function createDriverStats() {
  const by = {};
  const get = (type) => by[type] ||= { cars: 0, seconds: 0, meters: 0, gapSum: 0, gapN: 0, ratioSum: 0, ratioN: 0, laneChanges: 0, redApproach: 0, redRun: 0, stopApproach: 0, stopRolled: 0, honks: 0, sirenYields: 0, pedYields: 0, seen: new Set() };
  return {
    get,
    report() {
      const out = {};
      for (const [type, s] of Object.entries(by)) {
        out[type] = {
          cars: s.seen.size, minutes: +(s.seconds / 60).toFixed(1), km: +(s.meters / 1000).toFixed(2),
          avgGapM: s.gapN ? +(s.gapSum / s.gapN).toFixed(1) : null, speedVsLimit: s.ratioN ? +(s.ratioSum / s.ratioN).toFixed(2) : null,
          laneChangesPerKm: s.meters > 50 ? +(s.laneChanges / (s.meters / 1000)).toFixed(2) : null, laneChanges: s.laneChanges,
          redLights: s.redApproach, redRun: s.redRun, stopSigns: s.stopApproach, stopRolled: s.stopRolled, honks: s.honks, sirenYields: s.sirenYields, pedYields: s.pedYields,
        };
      }
      return out;
    },
    reset() { for (const k in by) delete by[k]; },
  };
}
