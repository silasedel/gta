// r4-air: headless flight-model check (node tools/v2/air/simtest.mjs [type] [land|water])
// takeoff run -> climb -> loop -> level -> descent; prints a trace every 2 s
import * as THREE from 'three';
import { AIR_TYPES } from '../../../src/vehicles/air/types.js';
import { createSim, stepSim, attitude } from '../../../src/vehicles/air/flight/sim.js';
const key = process.argv[2] || 'prop', mode = process.argv[3] || 'land';
const T = AIR_TYPES[key];
const water = mode === 'water';
const world = { sea: -0.12, ground: () => (water ? -20 : 0), water: () => water, probe: null };
const y0 = (water ? -0.12 + 0.25 : 0) + T.cg[1] - (T.gearH ? 0 : 0);
const S = createSim(T, new THREE.Vector3(0, y0 + 0.05, 0), 0);
S.engineOn = true;
let loopPitch = 0, phase = 'roll', t = 0, tLoop = 0, maxAlt = 0, distTO = null, minSpd = 1e9;
const dt = 1 / 120;
for (let i = 0; i < 120 * 90; i++) {
  t += dt;
  const at = attitude(S), c = S.ctl, sp = S.vel.length();
  c.throttle = 1; c.flaps = phase === 'roll' ? 0.3 : 0;
  if (phase === 'roll') { c.pitch = sp > T.vRot ? 0.7 : 0; if (S.agl > 3) { phase = 'climb'; distTO = S.pos.z; } }
  else if (phase === 'climb') { c.pitch = (0.15 - at.pitch) * 3; if (S.pos.y > 180) { phase = 'accel'; tLoop = t; } }
  else if (phase === 'accel') { c.pitch = (-0.06 - at.pitch) * 3; c.roll = -at.roll * 2; if (t - tLoop > 14) { phase = 'loop'; tLoop = t; } }
  else if (phase === 'loop') { c.pitch = 0.85; c.roll = Math.abs(at.pitch) < 1.2 ? -at.roll * (S.q.y >= -2 ? 1 : 1) * 0 : 0; minSpd = Math.min(minSpd, sp); const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(S.q).y; if (t - tLoop > 6 && upY > 0.9 && at.pitch > -0.2) phase = 'level'; loopPitch = Math.max(loopPitch, upY < 0 ? 1 : 0); if (t - tLoop > 25) phase = 'level'; }
  else if (phase === 'level') { c.pitch = (0 - at.pitch) * 3; c.roll = -at.roll * 2; c.throttle = 0.6; }
  stepSim(S, dt, world);
  maxAlt = Math.max(maxAlt, S.pos.y);
  if (i % 240 === 0) console.log(`t=${t.toFixed(0)} ${phase} spd=${(sp * 3.6).toFixed(0)}kmh alt=${S.pos.y.toFixed(1)} pitch=${(at.pitch * 57.3).toFixed(0)} roll=${(at.roll * 57.3).toFixed(0)} aoa=${(S.aoa * 57.3).toFixed(1)} g=${S.g.toFixed(2)} dmg=${S.damage.toFixed(2)} water=${S.onWater} gnd=${S.onGround} z=${S.pos.z.toFixed(0)}`);
  if (S.destroyed) { console.log('DESTROYED', S.events.slice(-5)); break; }
}
console.log({ takeoffRun: distTO && +distTO.toFixed(0), maxAlt: +maxAlt.toFixed(0), loopMinKmh: +(minSpd * 3.6).toFixed(0), wentInverted: !!loopPitch, damage: +S.damage.toFixed(3), events: S.events.filter((e) => e.type !== 'damage').slice(0, 5) });
