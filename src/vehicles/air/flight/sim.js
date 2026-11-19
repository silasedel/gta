// r4-air flight model: arcade-but-believable rigid body (three math only, no DOM / Rapier inside: the world is passed in).
// Body frame: +Z nose, +Y up, +X left wing (contract.js). Forces: thrust, lift by angle of attack (with stall), induced +
// parasite drag, side force; rates: the stick commands body rates (scaled by airspeed authority) on top of pitch / yaw
// weathervane stability, so a banked wing turns the plane. Ground: spring-damper gear legs with tire friction, nose-wheel
// steering and brakes; floats: buoyancy, hydro drag, planing lift on the step (water takeoff), water rudder.
// Crash probes (nose, tail, fin, wingtips, belly) hit terrain and static colliders (world.probe) and cause damage.
import * as THREE from 'three';

const G = 9.81,
  RHO = 1.225;
const _v = new THREE.Vector3(),
  _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3();
const _F = new THREE.Vector3(),
  _U = new THREE.Vector3(),
  _L = new THREE.Vector3(),
  _R = new THREE.Vector3();
const _tq = new THREE.Vector3(),
  _force = new THREE.Vector3(),
  _torque = new THREE.Vector3(),
  _wW = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _qi = new THREE.Quaternion();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function createSim(T, pos, heading) {
  const cg = new THREE.Vector3(...T.cg);
  const rel = (p) => new THREE.Vector3(p[0], p[1], p[2]).sub(cg);
  const S = {
    T,
    pos: pos.clone(),
    q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading),
    vel: new THREE.Vector3(),
    w: new THREE.Vector3(),
    gear: (T.gear || []).map((g) => ({
      c: rel(g.p),
      steer: !!g.steer,
      brake: !!g.brake,
      comp: 0,
      contact: false,
      r: g.r || 0.2,
    })),
    floats: (T.floats || []).map((p, i) => ({
      c: rel(p),
      step: (T.stepIdx || []).includes(i),
      depth: 0,
      contact: false,
    })),
    probes: Object.entries(T.probes).map(([name, p]) => ({
      name,
      c: rel(p),
      prev: new THREE.Vector3(),
      has: false,
    })),
    ctl: { throttle: 0, pitch: 0, roll: 0, yaw: 0, brake: 0, flaps: 0, gearDown: true },
    throttle: 0,
    rpm: 0,
    engineOn: false,
    flaps: 0,
    gearPos: 1,
    aoa: 0,
    beta: 0,
    ias: 0,
    g: 1,
    stall: 0,
    onGround: false,
    onWater: false,
    agl: 0,
    vs: 0,
    damage: 0,
    destroyed: false,
    submerged: 0,
    waterSpeed: 0,
    t: 0,
    lastHit: 0,
    events: [],
  };
  return S;
}

// world: { ground(x, z, yHint) -> y, water(x, z) -> bool, sea -> y, probe(from, to) -> { point, normal } | null }
export function stepSim(S, dt, world) {
  const T = S.T,
    c = S.ctl;
  S.t += dt;
  // ---- engine + levers
  S.throttle += clamp(c.throttle - S.throttle, -dt * 0.8, dt * 0.8);
  const rpmWant =
    S.engineOn && !S.destroyed
      ? 0.28 + 0.72 * S.throttle * (S.damage > 0.75 ? 0.55 + 0.25 * Math.sin(S.t * 7.3) : 1)
      : 0;
  S.rpm += (rpmWant - S.rpm) * Math.min(1, dt * (rpmWant > S.rpm ? 1.4 : 0.8));
  S.flaps += clamp(c.flaps - S.flaps, -dt * 0.35, dt * 0.35);
  if (T.retract) S.gearPos = clamp(S.gearPos + (c.gearDown ? dt : -dt) * 0.4, 0, 1);
  const q = S.q,
    m = T.mass;
  _F.set(0, 0, 1).applyQuaternion(q);
  _U.set(0, 1, 0).applyQuaternion(q);
  _L.set(1, 0, 0).applyQuaternion(q);
  _R.copy(_L).negate();
  const v = S.vel,
    sp = v.length();
  const vF = v.dot(_F),
    vU = v.dot(_U),
    vR = v.dot(_R);
  const aoa = sp > 1 ? Math.atan2(-vU, Math.max(Math.abs(vF), 0.5)) : 0,
    beta = sp > 1 ? Math.atan2(vR, Math.max(Math.abs(vF), 0.5)) : 0;
  S.aoa = aoa;
  S.beta = beta;
  S.ias = Math.max(0, vF);
  const qd = 0.5 * RHO * sp * sp;
  _force.set(0, -G * m, 0);
  _torque.set(0, 0, 0);
  // ---- lift / drag / side force
  const aS = T.aStall,
    flapCL = T.flapCL * S.flaps;
  const clAt = (a) => T.CL0 + flapCL + T.CLa * a;
  let CL,
    stall = 0;
  if (aoa > aS) {
    stall = clamp((aoa - aS) / 0.12, 0, 1);
    CL = clAt(aS) * (1 - 0.5 * stall);
  } else if (aoa < -aS * 0.8) {
    stall = clamp((-aS * 0.8 - aoa) / 0.12, 0, 1);
    CL = clAt(-aS * 0.8) * (1 - 0.5 * stall);
  } else CL = clAt(aoa);
  S.stall = clamp((aoa - aS * 0.85) / (aS * 0.2), 0, 1);
  if (sp > 1) {
    const vh = _a.copy(v).multiplyScalar(1 / sp);
    const liftDir = _b.copy(_U).addScaledVector(vh, -_U.dot(vh));
    const ll = liftDir.length();
    if (ll > 1e-3)
      _force.addScaledVector(liftDir, (qd * T.S * CL * (1 - 0.6 * S.damage * S.damage)) / ll);
    const CD =
      T.CD0 +
      T.K * CL * CL +
      T.flapCD * S.flaps +
      (T.retract ? 0.02 * S.gearPos : 0) +
      stall * 0.12 +
      S.damage * 0.03;
    _force.addScaledVector(vh, -qd * T.S * CD);
    _force.addScaledVector(_R, -qd * T.S * 0.9 * beta);
  }
  // ---- thrust (prop: falls with airspeed; jet nearly flat)
  const thr =
    T.thrust *
    Math.max(0, (S.rpm - 0.28) / 0.72) *
    Math.max(0.12, 1 - Math.max(0, vF) / T.vThrust) *
    (S.destroyed ? 0 : 1);
  _force.addScaledVector(_F, thr);
  // ---- angular: commanded rates + weathervane stability, scaled by airspeed authority
  // control power follows the airflow over the tail (forward speed); weathervane stability follows the total airspeed
  const auth = clamp((Math.max(0, vF) / T.vRef) ** 2, 0, 1.25),
    a1 = Math.min(1, auth),
    aSt = clamp((sp / T.vRef) ** 2, 0, 1.25),
    aS1 = Math.min(1, 0.25 + aSt);
  let upRate = c.pitch * T.rates.pitch * a1 - T.Ka * (aoa - T.aTrim) * aSt * 0.9;
  const bank = Math.asin(clamp(_L.y, -1, 1));
  let rollRate =
    c.roll * T.rates.roll * a1 -
    (Math.abs(c.roll) < 0.1 && Math.abs(bank) < 0.9 && _U.y > 0.3 ? bank * 0.35 * a1 : 0); // mild dihedral: hands off, the wings slowly come level
  let yawRate = c.yaw * T.rates.yaw * a1 + T.Kb * beta * aSt;
  if (stall > 0) {
    upRate -= Math.sign(aoa) * stall * 0.9;
    rollRate += stall * Math.sin(S.t * 1.7) * 0.9;
  }
  if (S.damage > 0.6) rollRate += (S.damage - 0.6) * Math.sin(S.t * 0.9) * 0.8;
  // body rate vector: nose-up = about -X, roll right = about +Z, yaw right = about -Y
  const wDx = -upRate,
    wDy = -yawRate,
    wDz = rollRate;
  const k = 1 - Math.exp(-dt * 5.5 * (S.onGround || S.onWater ? a1 : aS1) * (sp > 3 ? 1 : sp / 3));
  S.w.x += (wDx - S.w.x) * k;
  S.w.y += (wDy - S.w.y) * k;
  S.w.z += (wDz - S.w.z) * k;
  // ---- contacts (gear / floats / probes) add forces + torques (world)
  S.onGround = false;
  S.onWater = false;
  S.waterSpeed = 0;
  _wW.copy(S.w).applyQuaternion(q);
  const pointVel = (r, out) => out.copy(_wW).cross(r).add(v);
  const addAt = (r, f) => {
    _force.add(f);
    _torque.add(_tq.copy(r).cross(f));
  };
  let minAgl = 1e9;
  const gMul = T.retract ? S.gearPos : 1;
  if (gMul > 0.98)
    for (const g of S.gear) {
      const r = _a.copy(g.c).applyQuaternion(q),
        P = _d.copy(S.pos).add(r);
      const water = world.water(P.x, P.z),
        gy = water ? world.sea : world.ground(P.x, P.z, P.y + 1.5);
      const pen = gy - P.y;
      minAgl = Math.min(minAgl, -pen);
      g.contact = pen > 0;
      if (!g.contact) {
        g.comp = 0;
        continue;
      }
      const pv = pointVel(r, _b);
      if (water) {
        // wheels in the water: heavy drag, the plane noses over (crash)
        S.onWater = true;
        const f = _c.set(
          (-pv.x * 900 * m) / 1000,
          Math.max(0, pen * 4 * m - pv.y * m * 0.6),
          (-pv.z * 900 * m) / 1000,
        );
        addAt(r, f);
        if (sp > 12) hit(S, 'water', sp * 0.02 * dt * 60);
        continue;
      }
      S.onGround = true;
      if (!g.wasContact && pv.y < -3.2) {
        hit(S, 'gear vy ' + pv.y.toFixed(1), (-pv.y - 3.2) * 0.12);
        S.events.push({ type: 'touchdown', vs: pv.y });
      }
      const N = Math.max(0, T.k * pen - T.c * pv.y);
      const st = g.steer
        ? -c.yaw * clamp(0.6 - sp / 60, 0.08, 0.6) - c.roll * clamp(0.5 - sp / 50, 0, 0.45)
        : 0; // right = negative about up
      const wf = _c.copy(_F).multiplyScalar(Math.cos(st)).addScaledVector(_L, Math.sin(st));
      wf.y = 0;
      wf.normalize();
      const lat = _v.set(wf.z, 0, -wf.x);
      const vLong = pv.dot(wf),
        vLat = pv.dot(lat);
      const fLat = -clamp(vLat / 0.4, -1, 1) * 0.85 * N;
      const fLong = -clamp(vLong / 0.3, -1, 1) * N * (0.018 + (g.brake ? c.brake * 0.65 : 0));
      const f = new THREE.Vector3(0, N, 0).addScaledVector(wf, fLong).addScaledVector(lat, fLat);
      addAt(r, f);
      g.comp = pen;
    }
  for (const g of S.gear) g.wasContact = g.contact;
  for (const fl of S.floats) {
    const r = _a.copy(fl.c).applyQuaternion(q),
      P = _d.copy(S.pos).add(r);
    const water = world.water(P.x, P.z);
    const gy = water ? world.sea : world.ground(P.x, P.z, P.y + 1.5);
    const pen = gy - P.y;
    minAgl = Math.min(minAgl, -pen);
    fl.contact = pen > 0;
    fl.depth = Math.max(0, pen);
    if (!fl.contact) continue;
    const pv = pointVel(r, _b);
    const fh = _c.copy(_F);
    fh.y = 0;
    fh.normalize();
    const lat = _v.set(fh.z, 0, -fh.x);
    const vL = pv.dot(fh),
      vT = pv.dot(lat);
    if (!fl.was && pv.y < -4.5) {
      hit(S, 'float', (-pv.y - 4.5) * 0.1);
      S.events.push({ type: 'touchdown', vs: pv.y, water });
    }
    if (water) {
      S.onWater = true;
      S.waterSpeed = Math.max(S.waterSpeed, Math.abs(vL));
      const d = Math.min(pen, 0.7),
        dd = d / 0.7;
      const N = Math.max(0, T.k * 0.3 * d - T.c * 0.6 * pv.y);
      const plane = clamp((Math.abs(vL) - 7) / 9, 0, 1); // on the step above ~ 7..16 m/s
      const lift = fl.step ? Math.min(vL * vL, 900) * m * 0.0012 * dd : 0;
      const dragL = vL * (m * 0.11 + Math.abs(vL) * m * 0.012 * (1 - 0.82 * plane)) * dd;
      const dragT = vT * m * 0.9 * dd;
      const f = new THREE.Vector3(0, N + lift, 0)
        .addScaledVector(fh, -dragL / 6)
        .addScaledVector(lat, -dragT / 6);
      addAt(r, f);
    } else {
      S.onGround = true;
      const N = Math.max(0, T.k * pen - T.c * pv.y);
      const f = new THREE.Vector3(0, N, 0)
        .addScaledVector(fh, -clamp(vL / 0.4, -1, 1) * N * (0.14 + c.brake * 0.3))
        .addScaledVector(lat, -clamp(vT / 0.4, -1, 1) * N * 0.6);
      addAt(r, f);
    }
  }
  for (const fl of S.floats) fl.was = fl.contact;
  if (S.onWater && S.floats.length) {
    // water rudders: steer on the water at taxi speed
    const wr = -c.yaw * 0.55 - c.roll * 0.3;
    S.w.y += (wr * clamp(1 - sp / 25, 0.15, 1) - S.w.y) * Math.min(1, dt * 1.8);
  }
  // ---- crash probes: terrain + static colliders along their motion
  for (const p of S.probes) {
    const r = _a.copy(p.c).applyQuaternion(q),
      P = _d.copy(S.pos).add(r);
    const water = world.water(P.x, P.z);
    const gy = water ? world.sea : world.ground(P.x, P.z, P.y + 2);
    minAgl = Math.min(minAgl, P.y - gy);
    const pv = pointVel(r, _b);
    if (P.y < gy) {
      const pen = gy - P.y;
      if (water) {
        // fuselage / wing in the water: floats like a hull, big drag
        const f = _c.set(
          -pv.x * m * 0.5,
          Math.max(0, pen * m * 6 - pv.y * m * 1.2),
          -pv.z * m * 0.5,
        );
        addAt(r, f);
        S.submerged = Math.max(S.submerged, pen);
        if (sp > 9 && S.t - S.lastHit > 0.25) {
          hit(S, 'water', sp * 0.012);
          S.lastHit = S.t;
        }
      } else {
        const N = Math.max(0, m * 120 * pen - m * 8 * pv.y);
        const hv = _c.copy(pv);
        hv.y = 0;
        const hs = hv.length();
        const f = new THREE.Vector3(0, N, 0);
        if (hs > 0.01) f.addScaledVector(hv, (-0.6 * N) / hs);
        addAt(r, f);
        const scrape = p.name === 'tail' || p.name === 'belly' ? 0 : Math.max(0, hs - 6) * 0.008; // tail / belly scrapes only hurt when slammed down
        if ((-pv.y > 2.5 || scrape > 0) && S.t - S.lastHit > 0.25) {
          hit(
            S,
            'ground:' +
              p.name +
              ' pen ' +
              pen.toFixed(2) +
              ' gy ' +
              gy.toFixed(2) +
              ' vy ' +
              pv.y.toFixed(1) +
              ' hs ' +
              hs.toFixed(1),
            Math.max(0, -pv.y - 2) * 0.05 + scrape,
          );
          S.lastHit = S.t;
        }
      }
    }
    if (p.has && world.probe) {
      const h = world.probe(p.prev, P);
      if (h) {
        const n = h.normal,
          vn = pv.dot(n);
        // walls / hangars / fence only: ground and roofs come from world.ground (tile ground meshes would also
        // report their undersides when the gear sits a little below the collider surface)
        if (vn < 0 && Math.abs(n.y) < 0.7) {
          // push the body out of the collider and kill the velocity into it (rough rebound + scrape)
          S.pos.addScaledVector(n, Math.min(1.5, h.depth || 0.3));
          v.addScaledVector(n, -vn * 1.25);
          v.multiplyScalar(0.75);
          if (S.t - S.lastHit > 0.2) {
            hit(
              S,
              'hit:' +
                p.name +
                ' vn ' +
                vn.toFixed(1) +
                ' n ' +
                n.x.toFixed(2) +
                ',' +
                n.y.toFixed(2) +
                ',' +
                n.z.toFixed(2),
              Math.max(0, -vn - 3) * 0.045,
            );
            S.lastHit = S.t;
            S.events.push({ type: 'crash', speed: -vn, point: h.point.clone(), name: p.name });
          }
        }
      }
    }
    p.prev.copy(P).addScaledVector(v, 0);
    p.has = true;
  }
  S.agl = Math.max(0, minAgl);
  // ---- integrate
  const ax = _force.x / m,
    ay = _force.y / m,
    az = _force.z / m;
  S.g = _v.set(ax, ay + G, az).dot(_U) / G;
  v.x += ax * dt;
  v.y += ay * dt;
  v.z += az * dt;
  // torque -> body angular acceleration (diagonal inertia, body axes)
  _qi.copy(q).invert();
  _torque.applyQuaternion(_qi);
  S.w.x += (_torque.x / T.I[0]) * dt;
  S.w.y += (_torque.y / T.I[1]) * dt;
  S.w.z += (_torque.z / T.I[2]) * dt;
  const grounded = S.onGround || S.onWater;
  const damp = Math.exp(-dt * (grounded ? 1.6 : 0.6));
  S.w.multiplyScalar(damp);
  if (S.w.lengthSq() > 25) S.w.setLength(5);
  if (v.lengthSq() > 160000) v.setLength(400);
  S.pos.addScaledVector(v, dt);
  const wl = S.w.length();
  if (wl > 1e-6) {
    _q.setFromAxisAngle(_a.copy(S.w).multiplyScalar(1 / wl), wl * dt);
    q.multiply(_q).normalize();
  }
  S.vs = v.y;
  // parked / taxi creep: settle when at rest on the ground with the engine idle
  if (grounded && sp < 0.05 && S.throttle < 0.05) {
    v.multiplyScalar(0.5);
  }
  if (S.damage >= 1 && !S.destroyed) {
    S.destroyed = true;
    S.engineOn = false;
    S.events.push({ type: 'destroyed' });
  }
}

function hit(S, cause, amount) {
  if (!(amount > 0)) return;
  S.damage = Math.min(1, S.damage + amount);
  S.events.push({ type: 'damage', cause, amount });
}

// heading (game convention: atan2(fwd.x, fwd.z)), pitch (+ nose up), roll (+ right wing down) for the HUD / camera
export function attitude(S) {
  _F.set(0, 0, 1).applyQuaternion(S.q);
  _L.set(1, 0, 0).applyQuaternion(S.q);
  return {
    heading: Math.atan2(_F.x, _F.z),
    pitch: Math.asin(clamp(_F.y, -1, 1)),
    roll: Math.asin(clamp(_L.y, -1, 1)),
  };
}
