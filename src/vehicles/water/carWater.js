// r2-water: a car in the water (?carwater=2; vehicles.js waterTick hands over when game.carWater is set).
// Real cars float for a while on the air in the cabin and trunk, the engine bay floods first so the nose goes down,
// water climbs the glass, the cabin fills, and the car sinks nose-first, settling on the bottom. Here:
//  - 8 sample points (4 low at the sills, 4 at the belt line) each lift by their submerged depth (an air-volume spring),
//    on the shared swell (src/world/env/waves.js) once the ocean draws it
//  - air leaks out per zone: the engine bay in ~2 s, the cabin over ~9 s (faster with the windows deep under), the trunk
//    last; the buoyancy follows, so the car floats level, pitches nose-down, then goes under
//  - heavy water drag on every wet point (linear + quadratic), a soft bed contact if the seabed has no collider
//  - bubbles / ripples while the air escapes
import * as THREE from 'three';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const _q = new THREE.Quaternion(), _w = new THREE.Vector3(), _pt = { x: 0, y: 0, z: 0 }, _imp = { x: 0, y: 0, z: 0 };

export function createCarWater(game) {
  const city = game.city, SEA = city?.seaLevel ?? -0.12;
  const isWater = (x, z) => (city?.isWater ? city.isWater(x, z) : false);
  const bedY = (x, z) => { const g = city?.groundHeightAt ? city.groundHeightAt(x, z) : SEA - 5; const sb = city?.seabed?.heightAt?.(x, z); return Number.isFinite(sb) ? Math.max(g, sb) : g; }; // r2-ground's seabed floor
  const surfY = (x, z) => SEA + (game.waves?.shaderOn ? game.waves.heightAt(x, z) : 0);
  function points(v) {
    const s = v.spec, L = s.L, W = s.W, go = v.groundOff, lo = (s.yb ?? 0.3) - go + 0.05, hi = (s.belt ?? 1.0) - go, roof = (s.roofY ?? 1.4) - go;
    const P = [];
    for (const [zf, zone] of [[0.4, 0], [0.05, 1], [-0.2, 1], [-0.42, 2]]) for (const sx of [1, -1]) { P.push({ p: new THREE.Vector3(sx * W * 0.4, lo, zf * L), top: roof, zone }); }
    return P;
  }
  // returns true when it handled the tick (the caller then skips its own water code)
  return function carWaterTick(v, dt) {
    const body = v.body, t = body.translation();
    const wet = t.y < SEA + 1.2 && isWater(t.x, t.z);
    const sy = surfY(t.x, t.z), floor = t.y - v.groundOff; // the car's ground-contact level (wheel bottoms at rest)
    const onCar = sy - floor;                              // water depth over the wheel bottoms
    v.submerged = v.inWater ? clamp((sy - (floor + v.spec.roofY)) / 0.3, 0, 1) : 0;
    v.waterDepth = wet ? Math.max(0, onCar) : 0;
    if (!wet || onCar <= 0.02) { if (v.inWater && !isWater(t.x, t.z)) { v.inWater = false; v.cw = null; body.setLinearDamping(0.05); body.setAngularDamping(0.1); } return !!v.cw && wet; }
    // wading: water below the air intake (~0.5 m cars, ~0.8 m trucks / SUVs / vans) and the wheels still on the bottom: it
    // drives on, with heavy water drag by depth, a little lift, and spray + a wake off the wheels
    const tall = /truck|pickup|suv|van|bus|jeep|4x4|offroad/.test(String(v.spec.cls || v.model?.class || '')) || (v.spec.r || 0.33) > 0.38;
    const intake = tall ? 0.8 : 0.5;
    const bed = bedY(t.x, t.z), touching = floor - bed < 0.25;
    if (!v.cw && onCar < intake && touching) {
      const lv = body.linvel(), sp = Math.hypot(lv.x, lv.z), m0 = v.spec.mass, d = Math.min(onCar, intake);
      const k = m0 * (0.32 * d) * (1 + 0.15 * sp);
      body.applyImpulse({ x: -lv.x * k * dt, y: m0 * 9.81 * 0.12 * (d / intake) * dt, z: -lv.z * k * dt }, true);
      v.wading = d;
      const wk = game.boatSystem?.wake;
      if (wk && sp > 1.5 && ((v._spT = (v._spT || 0) - dt) <= 0)) {
        v._spT = 0.08; const r = body.rotation(); _q.set(r.x, r.y, r.z, r.w); const tm = game.clock?.elapsed ?? performance.now() / 1000;
        for (const [sx, sz] of [[0.45, 0.32], [-0.45, 0.32], [0.45, -0.32], [-0.45, -0.32]]) { _w.set(sx * v.spec.W, 0, sz * v.spec.L).applyQuaternion(_q);
          wk.burst(Math.min(5, 1 + Math.round(sp / 5)), t.x + _w.x, sy + 0.05, t.z + _w.z, lv.x * 0.25 + _w.x * 0.8, 0.6 + sp * 0.12 * Math.min(1, d / 0.3), lv.z * 0.25 + _w.z * 0.8, 1.2 + sp * 0.05, 0.16 + d * 0.3, 0.8, game.boatSystem.timeNow?.() ?? tm); }
        _w.set(0, 0, -v.spec.L / 2).applyQuaternion(_q); const rx = Math.cos(Math.atan2(lv.x, lv.z)), rz = -Math.sin(Math.atan2(lv.x, lv.z));
        wk.addWake(v, t.x + _w.x, sy + 0.03, t.z + _w.z, rx, rz, v.spec.W * 0.5, Math.min(0.9, 0.3 + sp / 15), Math.min(0.8, sp / 12), game.boatSystem.timeNow?.() ?? tm);
      }
      return true; // keep driving (vehicles.js does not flood it)
    }
    v.wading = 0;
    const m = v.spec.mass, g = 9.81;
    if (!v.inWater || !v.cw) {
      if (!v.inWater) {
        const lv = body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
        game.fx?.splash?.(new THREE.Vector3(t.x, SEA, t.z), clamp(sp / 15, 0.3, 3));
        game.audio?.play?.('splash', { position: new THREE.Vector3(t.x, SEA, t.z), volume: clamp(sp / 20, 0.3, 1) });
        if (v.engineOn) { v.engineOn = false; game.emit?.('engineStop', { vehicle: v }); }
        if (v.ai) v.ai = null;
      }
      v.inWater = true; v.flooded = true; v.floodT = 0;
      const P = points(v);
      // air per zone (fraction), and a spring that floats the car at ~60% of the body height with full air
      const hBody = Math.max(0.6, (v.spec.roofY ?? 1.4) - (v.spec.yb ?? 0.3));
      const k = 1.35 * m * g / (P.length * hBody * 0.55);
      v.cw = { P, k, air: [1, 1, 1], bubbleT: 0 };
      body.setLinearDamping(0.15); body.setAngularDamping(0.6);
    }
    const C = v.cw; v.floodT += dt;
    const r = body.rotation(); _q.set(r.x, r.y, r.z, r.w);
    const lv = body.linvel(), av = body.angvel();
    let wetN = 0, deepTop = 0;
    for (const q of C.P) {
      _w.copy(q.p).applyQuaternion(_q);
      const px = t.x + _w.x, py = t.y + _w.y, pz = t.z + _w.z;
      const vx = lv.x + (av.y * _w.z - av.z * _w.y), vy = lv.y + (av.z * _w.x - av.x * _w.z), vz = lv.z + (av.x * _w.y - av.y * _w.x);
      const sy = surfY(px, pz), depth = sy - py; let fx = 0, fy = 0, fz = 0;
      if (depth > 0) {
        wetN++; const col = q.top - q.p.y, d = Math.min(depth, col);
        if (depth > col) deepTop++;
        fy += C.k * d * C.air[q.zone];
        const dk = m / C.P.length * (1.6 + 0.9 * Math.min(1, d / col)); // water drag (heavy: a car is a box)
        const sp = Math.hypot(vx, vy, vz);
        fx -= dk * vx * (1 + 0.25 * sp); fy -= dk * vy * (1 + 0.25 * sp) * 1.4; fz -= dk * vz * (1 + 0.25 * sp);
      }
      // the bottom: a soft bed contact (the seabed is not a collider everywhere)
      const by = bedY(px, pz);
      if (py < by + 0.02) { const pen = Math.min(0.5, by + 0.02 - py); fy += m * g / C.P.length * (pen / 0.05) - m / C.P.length * 4 * Math.min(0, vy); fx -= vx * m * 0.4 / C.P.length; fz -= vz * m * 0.4 / C.P.length; }
      if (fx || fy || fz) { _pt.x = px; _pt.y = py; _pt.z = pz; _imp.x = fx * dt; _imp.y = fy * dt; _imp.z = fz * dt; body.applyImpulseAtPoint(_imp, _pt, true); }
    }
    // flooding: engine bay first, cabin as the water climbs the doors and glass, trunk last
    const sub = wetN / C.P.length, glass = deepTop / C.P.length;
    const rate = [0.3, 0.035 + 0.12 * glass, 0.025 + 0.06 * glass]; // engine bay ~3 s, cabin ~15-25 s, trunk last
    for (let i = 0; i < 3; i++) C.air[i] = Math.max(0, C.air[i] - C.air[i] * rate[i] * dt * (0.4 + sub));
    // air escaping: bubbles at the surface above the car
    C.bubbleT -= dt; const airLeft = (C.air[0] + C.air[1] + C.air[2]) / 3;
    if (C.bubbleT <= 0 && airLeft > 0.04 && sub > 0.2) { C.bubbleT = 0.25 + (1 - airLeft) * 0.6; game.fx?.ripple?.(new THREE.Vector3(t.x + (Math.random() - 0.5) * v.spec.W, SEA, t.z + (Math.random() - 0.5) * v.spec.L * 0.6));
    }
    v.engineOn = false;
    return true;
  };
}
