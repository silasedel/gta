import * as THREE from 'three';

// Shared wind (game.wind). One cheap analytic field every system can read:
//   wind.dir        THREE.Vector2, unit (x, z): where the air is moving TO
//   wind.speed      m/s, mean speed (sea breeze by day, light land breeze at night, stronger in rain / storms)
//   wind.gust       0..1 current gust factor at the camera
//   wind.vx, vz     current wind vector at the camera (m/s, gust included)
//   wind.time       seconds; pass it (or nothing) as t to sample()
//   wind.sample(x, z, t?, out?) -> out {x, z}: local wind vector in m/s; gust fronts are bands that travel downwind,
//                   so a row of palms / flags / string lights reacts one after another
//   wind.strength(x, z, t?) -> 0..1.6 scalar gust multiplier only (cheapest form, good for per-instance sway amplitude)
//   wind.uniforms   { uWindDir (Vector2), uWindSpeed, uWindGust, uWindTime }: share these objects in shader materials
//   wind.set({ angle, speed })  override (radians, m/s); wind.set(null) returns to automatic
// Event: 'wind:ready' (payload: wind) once it exists; game.wind is set before any V2 module loads.
export function createWind(game) {
  const dir = new THREE.Vector2(-1, 0);
  const uniforms = {
    uWindDir: { value: dir },
    uWindSpeed: { value: 3 },
    uWindGust: { value: 0 },
    uWindTime: { value: 0 },
  };
  let angle = Math.PI,
    override = null;
  const tmp = { x: 0, z: 0 };
  const TAU = Math.PI * 2;
  // gust field: three travelling bands (long fronts, medium puffs, short flutter) plus a slow cross-wind meander
  function gustAt(x, z, t, speed) {
    const along = x * dir.x + z * dir.y,
      across = -x * dir.y + z * dir.x;
    const s = Math.max(speed, 0.5);
    const a = Math.sin(TAU * ((along - s * 0.9 * t) / 140 + 0.13 * Math.sin(across / 90)));
    const b = Math.sin(TAU * ((along - s * 0.7 * t) / 37 + across / 210) + 1.7);
    const c = Math.sin(TAU * ((along - s * 0.6 * t) / 9.5) + across * 0.11 + 4.1);
    const g = 0.5 + 0.3 * a + 0.16 * b + 0.07 * c;
    return g < 0 ? 0 : g > 1 ? 1 : g;
  }
  const wind = {
    dir,
    speed: 0.6,
    gust: 0,
    vx: -0.6,
    vz: 0,
    time: 0,
    uniforms,
    strength(x, z, t = wind.time) {
      return 0.75 + 0.5 * gustAt(x, z, t, wind.speed);
    },
    sample(x, z, t = wind.time, out = tmp) {
      const k = wind.speed * (0.75 + 0.5 * gustAt(x, z, t, wind.speed));
      // gusts also veer a few degrees
      const veer = 0.18 * Math.sin(TAU * ((x * dir.y - z * dir.x) / 120 + t / 23));
      out.x = (dir.x - dir.y * veer) * k;
      out.z = (dir.y + dir.x * veer) * k;
      return out;
    },
    set(o) {
      override = o || null;
    },
    update(dt, env, camera) {
      wind.time += dt;
      const day = env?.dayFactor ?? 1;
      const w = game.weather;
      const kind = String(
        typeof w === 'string' ? w : w?.kind || w?.type || w?.current || w?.state || 'clear',
      ).toLowerCase();
      const rain =
        typeof w?.rain === 'number'
          ? w.rain
          : /storm|hurricane/.test(kind)
            ? 1
            : /rain|shower/.test(kind)
              ? 0.6
              : 0;
      const storm = /storm|hurricane|squall/.test(kind) ? 1 : 0;
      // sea breeze: onshore (from the Atlantic in the east, moving west) by day, weak offshore drift late at night
      const wantAngle =
        override?.angle ??
        Math.PI * (0.25 + 0.75 * day) +
          0.35 * Math.sin(wind.time / 97) +
          0.2 * Math.sin(wind.time / 41 + 2);
      // clear weather is near calm: a faint drift, plus a light breeze that comes and goes every few minutes
      const swell = Math.sin(wind.time / 53) * 0.6 + Math.sin(wind.time / 131 + 1.3) * 0.4;
      const breeze = swell > 0.35 ? Math.pow((swell - 0.35) / 0.65, 2) : 0;
      const calmSpeed = 0.35 + 0.35 * day + 1.6 * breeze;
      const wantSpeed =
        override?.speed ??
        (typeof w?.wind === 'number' ? w.wind : calmSpeed + 4.5 * rain + 7 * storm);
      let d = wantAngle - angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      angle += d * Math.min(1, dt * 0.25);
      wind.speed += (wantSpeed - wind.speed) * Math.min(1, dt * 0.3);
      dir.set(Math.cos(angle), Math.sin(angle));
      const cx = camera?.position.x || 0,
        cz = camera?.position.z || 0;
      wind.gust = gustAt(cx, cz, wind.time, wind.speed);
      const v = wind.sample(cx, cz, wind.time, tmp);
      wind.vx = v.x;
      wind.vz = v.z;
      uniforms.uWindSpeed.value = wind.speed;
      uniforms.uWindGust.value = wind.gust;
      uniforms.uWindTime.value = wind.time;
    },
  };
  return wind;
}
