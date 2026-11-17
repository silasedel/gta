// r2-physics: shape-cast suspension + tire model for cars ("carphys 2"). A drop-in replacement for Rapier's
// DynamicRayCastVehicleController: same method names (addWheel is done by the constructor), so vehicles.js keeps calling
// setWheelSteering / setWheelEngineForce / setWheelBrake / setWheelFrictionSlip / setWheelSideFrictionStiffness /
// updateVehicle / wheelIsInContact / wheelSuspensionLength / wheelSteering / wheelRotation / wheelContactPoint /
// currentVehicleSpeed, and world.removeVehicleController(vc) just calls vc.free().
//
// Per wheel, every fixed tick:
//   1. contact: a rounded cylinder of the real tire radius and width is swept down the suspension axis, from one tire
//      radius above full bump to past full droop (Rapier castShape). The tire meets a curb at its front-lower quadrant, so
//      the wheel climbs the edge over the distance a real tire does (contact normal tilts back and up), instead of the
//      thin-ray teleport. Far cars (> 70 m from the player, not player-driven) use one ray (cheap) with the same model.
//      Road relief that has no collider triangles (pothole bowls, manhole seats, joints, surface micro-roughness) is added
//      on top of the swept contact by game.physics.relief (src/vehicles/physics/relief.js).
//   2. vertical: two-mass quarter car. The wheel (unsprung mass) rides on a tire spring (radial stiffness + damping) and
//      carries the body through a coil spring (per-class ride frequency, preloaded so the static ride height is unchanged),
//      a damper with separate bump and rebound rates (digressive above 0.2 m/s), a progressive rubber bump stop over the
//      last 45 % of bump travel and a hard stop at the measured arch gap (spec.archGap), a droop limit, and an anti-roll
//      bar per axle. The wheel ODE runs 4 sub-steps per tick (stiff tire); the body gets the averaged spring force at the
//      hardpoint, plus the horizontal part of the tire's contact force at the contact point (the curb-strike jolt).
//   3. tire forces: brush-style lateral curve on the slip angle (linear, peak at ~7 deg, falls to 82 % sliding), lag by a
//      relaxation length (tire compliance), load-sensitive peak friction (more load -> lower mu), friction ellipse with the
//      longitudinal force (drive, brakes, rolling resistance), all solved as sequential impulses on the chassis velocity.
//      Surface (game.surfaceAt per wheel, 5 Hz) sets grip, rolling resistance and roughness; rain wetness lowers grip.
// Body pitch and roll come from the real forces now: brake dive, throttle squat (forces at the contact patch below the
// center of mass, with a little anti-dive / roll-center height), lean in corners against springs + anti-roll bars.
import { WEATHER_U } from '../../render/wetSurfaces.js';

const G = 9.81;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// surface table: mu multiplier, rolling-resistance coefficient, micro-roughness amplitude (m) and wavelength (m)
const SURF = {
  asphalt: { mu: 1.0, rr: 0.013, rough: 0.0018, wl: 0.9 },
  concrete: { mu: 0.97, rr: 0.012, rough: 0.0014, wl: 1.4 },
  pavers: { mu: 0.9, rr: 0.016, rough: 0.0035, wl: 0.25 },
  wood: { mu: 0.78, rr: 0.016, rough: 0.004, wl: 0.15 },
  grass: { mu: 0.62, rr: 0.05, rough: 0.012, wl: 1.6 },
  dirt: { mu: 0.68, rr: 0.035, rough: 0.016, wl: 1.1 },
  gravel: { mu: 0.64, rr: 0.04, rough: 0.012, wl: 0.4 },
  sand: { mu: 1.0, rr: 0.0, rough: 0.006, wl: 2.2 }, // sand drag / grip loss is r2-cars' soft-ground model (v.soft) in vehicles.js
  mud: { mu: 0.45, rr: 0.08, rough: 0.012, wl: 1.2 },
};
function surfKind(name) {
  const k = String(name || '');
  if (!k || /asphalt|road|parking|runway|deck/.test(k)) return 'asphalt';
  if (/sidewalk|concrete|plaza|curb|tile/.test(k)) return 'concrete';
  if (/paver|brick|cobble|terrazzo/.test(k)) return 'pavers';
  if (/wood|pier|board|dock/.test(k)) return 'wood';
  if (/sand|dune|beach|shell/.test(k)) return 'sand';
  if (/mud|swamp|wetland|mangrove|marsh/.test(k)) return 'mud';
  if (/gravel|rock|coral/.test(k)) return 'gravel';
  if (/dirt|soil|track|farm|scrub/.test(k)) return 'dirt';
  if (/grass|lawn|turf|field|park|meadow|sawgrass/.test(k)) return 'grass';
  return 'asphalt';
}
// smooth 1D value noise on world xz (fixed in the world, so a car feels the same bumps on the same spot)
function hash2(x, z) { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w) * 2 - 1;
}

// class tuning: ride frequency scale, damping ratios (bump, rebound), droop travel, peak slip angle (tan)
function classTune(spec) {
  const c = spec.arch || spec.cls || 'sedan';
  const T = { fk: 1, zb: 0.27, zr: 0.48, droop: 0.12, tp: 0.12, rcF: 0.06, rcR: 0.12 };
  if (/super|hyper/.test(c)) Object.assign(T, { fk: 1.12, zb: 0.36, zr: 0.62, droop: 0.075, tp: 0.1, rcF: 0.05, rcR: 0.08 });
  else if (/sports|sportsedan|muscle|ev/.test(c)) Object.assign(T, { fk: 1.05, zb: 0.32, zr: 0.55, droop: 0.095, tp: 0.105 });
  else if (/classic/.test(c)) Object.assign(T, { fk: 0.92, zb: 0.2, zr: 0.36, droop: 0.14, tp: 0.13 });
  else if (/offroad/.test(c)) Object.assign(T, { fk: 0.95, zb: 0.24, zr: 0.42, droop: 0.22, tp: 0.14, rcF: 0.2, rcR: 0.3 });
  else if (/suv|luxsuv|pickup/.test(c)) Object.assign(T, { zb: 0.25, zr: 0.45, droop: 0.15, tp: 0.13, rcF: 0.12, rcR: 0.22 });
  else if (/van|box|semi|fire|bus|truck/.test(c) || spec.heavy) Object.assign(T, { zb: 0.24, zr: 0.42, droop: 0.12, tp: 0.14, rcF: 0.12, rcR: 0.2 });
  return T;
}

export function createShapeVehicle(game, body, wheels, spec, restLen, stiff, opts = {}) {
  const { RAPIER, world } = game;
  const QF = RAPIER.QueryFilterFlags;
  const T = classTune(spec);
  const mass = spec.mass || 1500, r = spec.r || 0.33, tw = spec.tw || 0.22;
  const Lstatic = restLen - G / (4 * stiff);              // wheel length at rest (same ride height as the Rapier controller)
  // bump travel: to the measured arch gap (tire top meets the arch lip); procedural cars use their class value
  // (the visible gap over the tire plus ~4.5 cm of tuck into the wheel well liner, as on a real car at full compression)
  const bump = clamp((spec.archGap != null ? spec.archGap + 0.045 : spec.wedge ? 0.07 : spec.offroad ? 0.17 : (spec.heavy || /pickup|suv|van/.test(spec.arch || spec.cls || '')) ? 0.12 : 0.09), 0.065, 0.2);
  const droop = T.droop;
  const Lmin = Lstatic - bump, Lmax = Lstatic + droop;
  const mu0 = clamp(0.5 * (spec.grip || 2.2), 0.6, 1.9);   // spec.grip is Rapier's friction-slip scale; ~1.1 for a sedan
  const mU = clamp(mass * 0.028, 25, mass > 4000 ? 220 : 90); // unsprung mass per wheel
  const kT = (mass > 4000 ? 9e5 : 2.3e5) * clamp(r / 0.33, 0.8, 1.6); // tire radial stiffness N/m
  const cT = 2 * 0.06 * Math.sqrt(kT * mU);
  const lift = Math.min(r * 0.9, 0.32);                   // cast starts this far above full bump: obstacles up to bump + lift climb
  const ws = wheels.map((w, i) => ({
    x: w.x, z: w.z, front: i < 2, side: w.x > 0 ? 1 : -1,
    steer: 0, steerApplied: 0, engine: 0, brake: 0, slip: spec.grip || 2.2, sideK: 1,
    l: Lstatic, vw: 0, contact: false, lc: Lmax + 1, n: { x: 0, y: 1, z: 0 }, p: { x: 0, y: 0, z: 0 }, ft: 0, fs: 0,
    fyPrev: 0, rot: 0, omega: 0, spin: 0, lock: false, surf: 'asphalt', surfT: Math.random() * 0.2, hitBody: null, k: 0, c: 0, n0: 0, kArb: 0, relief: 0,
    stopJ: 0,
  }));
  // static load per wheel from the center of mass position along the wheelbase
  let zc = 0; try { zc = body.localCom().z; } catch (e) { /* */ }
  const zf = Math.max(...ws.map((w) => w.z)), zr = Math.min(...ws.map((w) => w.z));
  const fShare = clamp(zf > zr ? (zc - zr) / (zf - zr) : 0.5, 0.3, 0.7);
  const fn0 = 0.72 * Math.sqrt(4 * stiff) / (2 * Math.PI) * T.fk; // ride frequency (Hz) from the class stiffness
  const arbK = clamp((spec.antiRoll ?? 5) / 5, 0.4, 1.6);
  for (const w of ws) {
    w.n0 = mass * G * (w.front ? fShare : 1 - fShare) / 2;
    const ms = w.n0 / G, fn = fn0 * (w.front ? 0.96 : 1.06), om = 2 * Math.PI * fn;
    w.k = ms * om * om;
    const cc = 2 * Math.sqrt(w.k * ms);
    w.cb = cc * T.zb; w.cr = cc * T.zr;
    w.kArb = w.k * arbK * (w.front ? 0.85 : 0.45);
    w.kBs = 3 * w.n0 / Math.pow(0.45 * bump, 2);          // progressive bump stop: +3 x static load at the hard stop
    w.d0 = w.n0 / kT;                                     // static tire deflection (the visual wheel sits on the ground at rest)
  }
  const wb = Math.max(1.5, zf - zr), wheelHalfTrack = Math.max(0.5, Math.abs(ws[0].x));
  let freed = false, lastSpeed = 0, shapeMode = true, debug = null;
  const st = { up: { x: 0, y: 1, z: 0 }, fw: { x: 0, y: 0, z: 1 }, lf: { x: 1, y: 0, z: 0 }, roughK: 1, roughT: 0 };
  // pavement age by road class: highways are smooth, residential streets worn, Keys / rural lanes and service roads rough
  const ROUGH = [[/motorway|trunk/, 0.6], [/primary/, 0.85], [/secondary|tertiary/, 1], [/residential|unclassified|living/, 1.45], [/service|track|lane|parking|driveway/, 2.2]];
  // ---- small vector helpers on plain objects (no allocations in the tick) ----
  const rotV = (q, x, y, z, o) => { // o = q * (x, y, z)
    const ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z;
    o.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y; o.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z; o.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x; return o;
  };
  const qmul = (a, b, o) => { const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z; o.x = x; o.y = y; o.z = z; o.w = w; return o; };
    const _qs = { x: 0, y: 0, z: 0, w: 1 }, _qw = { x: 0, y: 0, z: 0, w: 1 }, _qt = { x: 0, y: 0, z: 0, w: 1 };
  const _h = { x: 0, y: 0, z: 0 }, _s0 = { x: 0, y: 0, z: 0 }, _dir = { x: 0, y: -1, z: 0 }, _tmp = { x: 0, y: 0, z: 0 };
  const _ax = { x: 0, y: 0, z: 0 }, _wf = { x: 0, y: 0, z: 0 };
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  // inverse world inertia (3x3, row-major) of the chassis
  const invI = new Float64Array(9);
  function inertia(q) {
    let I = { x: 1, y: 1, z: 1 }, ql = { x: 0, y: 0, z: 0, w: 1 };
    try { I = body.principalInertia(); ql = body.principalInertiaLocalFrame(); } catch (e) { /* */ }
    const R = qmul(q, ql, _qt);
    const c0 = rotV(R, 1, 0, 0, { x: 0, y: 0, z: 0 }), c1 = rotV(R, 0, 1, 0, { x: 0, y: 0, z: 0 }), c2 = rotV(R, 0, 0, 1, { x: 0, y: 0, z: 0 });
    const ix = I.x > 1e-6 ? 1 / I.x : 0, iy = I.y > 1e-6 ? 1 / I.y : 0, iz = I.z > 1e-6 ? 1 / I.z : 0;
    const C = [c0, c1, c2], D = [ix, iy, iz], K = ['x', 'y', 'z'];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { let s = 0; for (let k = 0; k < 3; k++) s += C[k][K[a]] * D[k] * C[k][K[b]]; invI[a * 3 + b] = s; }
  }
  const mulI = (x, y, z, o) => { o.x = invI[0] * x + invI[1] * y + invI[2] * z; o.y = invI[3] * x + invI[4] * y + invI[5] * z; o.z = invI[6] * x + invI[7] * y + invI[8] * z; return o; };
  // effective mass of the chassis for an impulse along unit d at offset (rx, ry, rz) from the center of mass
  const _c = { x: 0, y: 0, z: 0 }, _ic = { x: 0, y: 0, z: 0 };
  function effMass(invM, rx, ry, rz, dx, dy, dz) {
    _c.x = ry * dz - rz * dy; _c.y = rz * dx - rx * dz; _c.z = rx * dy - ry * dx;
    mulI(_c.x, _c.y, _c.z, _ic);
    const k = invM + _c.x * _ic.x + _c.y * _ic.y + _c.z * _ic.z;
    return k > 1e-9 ? 1 / k : 0;
  }
  // apply impulse (jx, jy, jz) at offset r from COM to the velocity copy V / W
  function applyJ(V, W, invM, rx, ry, rz, jx, jy, jz) {
    V.x += jx * invM; V.y += jy * invM; V.z += jz * invM;
    mulI(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, _ic);
    W.x += _ic.x; W.y += _ic.y; W.z += _ic.z;
  }
  const surfaceAt = game.surfaceAt || game.city?.surfaceAt;

  // ---- tire profile contact: rays along the suspension axis from points on the tire's lower arc (and across its width),
  // each ray says how high the wheel center must be for that point of the tire to touch; the highest requirement wins.
  // A step between two neighboring rays (curb edge, pothole rim, rock flank) is found by bisection and solved exactly as
  // the tire circle resting on that corner: the wheel rolls up and over a curb along the true arc, never a ray teleport.
  // (Rapier's castShape was tried first: its time of impact is off by up to 9 cm on flat ground, so the wheel chattered.)
  const ANG_FULL = [0, 0.44, -0.44, 0.84, -0.84, 1.2, -1.2], ANG_LITE = [0, 0.75, -0.75], ANG_FAR = [0];
  const _o = { x: 0, y: 0, z: 0 }, _fwW = { x: 0, y: 0, z: 0 }, _axW = { x: 0, y: 0, z: 0 };
  const samp = []; for (let k = 0; k < 24; k++) samp.push({ x: 0, lg: 0, hit: false, nx: 0, ny: 1, nz: 0, px: 0, py: 0, pz: 0, col: null });
  let castCount = 0;
  function rayAt(xo, yo, s0, maxT, filter, out) {
    const up = st.up;
    ray.origin.x = _s0.x + _fwW.x * xo + _axW.x * yo; ray.origin.y = _s0.y + _fwW.y * xo + _axW.y * yo; ray.origin.z = _s0.z + _fwW.z * xo + _axW.z * yo;
    ray.dir.x = -up.x; ray.dir.y = -up.y; ray.dir.z = -up.z;
    let rh = null; castCount++;
    try { rh = world.castRayAndGetNormal(ray, maxT, false, filter, undefined, undefined, body); } catch (e) { rh = null; }
    out.x = xo; out.hit = false;
    if (!rh) return out;
    const toi = rh.timeOfImpact ?? rh.toi;
    if (!(toi > 1e-4)) return out; // started inside something (a wall beside the tire): not a support for this ray
    const nd = rh.normal.x * up.x + rh.normal.y * up.y + rh.normal.z * up.z; if (nd < 0.2) return out; // underside / vertical face
    out.hit = true; out.col = rh.collider;
    out.px = ray.origin.x - up.x * toi; out.py = ray.origin.y - up.y * toi; out.pz = ray.origin.z - up.z * toi;
    out.nx = rh.normal.x; out.ny = rh.normal.y; out.nz = rh.normal.z;
    // road relief under this point (pothole bowls, patch / cover seats) + surface micro-roughness: the ground is lower by dip
    const S = SURF[out.surf || 'asphalt'] || SURF.asphalt;
    let dip = 0; try { dip = game.physics?.reliefDip?.(out.px, out.pz) || 0; } catch (e) { dip = 0; }
    const nz0 = vnoise(out.px / S.wl, out.pz / S.wl) * 0.65 + vnoise(out.px / (S.wl * 0.37) + 17.3, out.pz / (S.wl * 0.37) - 4.1) * 0.35;
    out.lg = s0 + toi + dip + nz0 * S.rough * (S === SURF.asphalt ? st.roughK : 1);
    return out;
  }
  function castWheel(w, i, q, T0, filter, tier) { // tier 2: full tire profile, 1: 3-ray arc + edge solve, 0: one ray
    const full = tier === 2;
    rotV(q, w.x, 0, w.z, _h); _h.x += T0.x; _h.y += T0.y; _h.z += T0.z;
    const up = st.up, fw = st.fw, lf = st.lf;
    const sa = w.steerApplied, cs = Math.cos(sa), sn = Math.sin(sa);
    _fwW.x = fw.x * cs + lf.x * sn; _fwW.y = fw.y * cs + lf.y * sn; _fwW.z = fw.z * cs + lf.z * sn;
    _axW.x = lf.x * cs - fw.x * sn; _axW.y = lf.y * cs - fw.y * sn; _axW.z = lf.z * cs - fw.z * sn;
    const s0 = Lmin - lift;
    _s0.x = _h.x - up.x * s0; _s0.y = _h.y - up.y * s0; _s0.z = _h.z - up.z * s0;
    const maxT = (Lmax + 0.06 + r) - s0;
    w.hitBody = null;
    const ANG = tier === 2 ? ANG_FULL : tier === 1 ? ANG_LITE : ANG_FAR, lines = full ? [-0.3 * tw, 0.3 * tw] : [0];
    let best = Infinity, bx = 0, bs = null, nS = 0;
    const surfK = w.surf;
    for (const yo of lines) {
      const base = nS;
      for (const th of ANG) { const sm = samp[nS++]; sm.surf = surfK; rayAt(r * Math.sin(th), yo, s0, maxT, filter, sm); }
      // candidates from every ray: center length needed for that tire point to touch
      for (let k = base; k < nS; k++) { const sm = samp[k]; if (!sm.hit) continue; const lc = sm.lg - Math.sqrt(Math.max(0, r * r - sm.x * sm.x)); if (lc < best) { best = lc; bx = sm.x; bs = sm; } }
      // steps between neighbors along the arc (sorted by x): bisect to the corner and solve the circle on that corner
      if (tier >= 1) {
        const ord = []; for (let k = base; k < nS; k++) ord.push(samp[k]); ord.sort((p1, p2) => p1.x - p2.x);
        for (let k = 0; k + 1 < ord.length; k++) {
          const A0 = ord[k], B0 = ord[k + 1];
          const la = A0.hit ? A0.lg : Infinity, lb = B0.hit ? B0.lg : Infinity;
          if (!(Math.abs(la - lb) > 0.012)) continue;
          let H = la < lb ? A0 : B0, Lw = la < lb ? B0 : A0; // H = the high side (shorter ray)
          let hx = H.x, lx = Lw.x, hlg = H.lg, hs = H;
          for (let it = 0; it < 4; it++) {
            const mx = (hx + lx) / 2, sm = samp[Math.min(23, nS)]; sm.surf = surfK; rayAt(mx, yo, s0, maxT, filter, sm);
            if (sm.hit && Math.abs(sm.lg - hlg) < 0.01) { hx = mx; hlg = Math.min(hlg, sm.lg); hs = { ...sm }; } else lx = mx;
          }
          const xe = (hx + lx) / 2; if (Math.abs(xe) >= r) continue;
          const lc = hlg - Math.sqrt(r * r - xe * xe);
          if (lc < best) { best = lc; bx = xe; bs = hs; }
        }
      }
    }
    let lc = Lmax + 1, nx = up.x, ny = up.y, nz = up.z, px = 0, py = 0, pz = 0;
    if (bs) {
      lc = best;
      // normal: from the contact point on the tire arc toward the axle, plus the ground's own sideways tilt
      const cz = Math.sqrt(Math.max(0, r * r - bx * bx)) / r, cx = -bx / r;
      const side = bs.nx * _axW.x + bs.ny * _axW.y + bs.nz * _axW.z;
      nx = _fwW.x * cx + up.x * cz + _axW.x * side; ny = _fwW.y * cx + up.y * cz + _axW.y * side; nz = _fwW.z * cx + up.z * cz + _axW.z * side;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      px = bs.px; py = bs.py; pz = bs.pz;
      try { const pb = bs.col?.parent(); if (pb && pb.isDynamic()) w.hitBody = pb; } catch (e) { /* */ }
      if ((w.surfT -= opts.dt || 1 / 60) <= 0) { w.surfT = 0.2; try { w.surf = surfKind(surfaceAt?.(px, pz, py)); } catch (e) { w.surf = 'asphalt'; } }
    }
    w.relief = 0;
    w.lc = lc; w.n.x = nx; w.n.y = ny; w.n.z = nz; w.p.x = px; w.p.y = py; w.p.z = pz;
    w.hx = _h.x; w.hy = _h.y; w.hz = _h.z;
    return !!bs;
  }

  const vc = {
    isShapeVehicle: true, ownsAntiRoll: true,
    get numWheels() { return ws.length; },
    // Rapier-compatible setters (vehicles.js sets these every tick)
    setWheelSteering(i, a) { ws[i].steer = a; },
    setWheelEngineForce(i, f) { ws[i].engine = f; },
    setWheelBrake(i, b) { ws[i].brake = b; },
    setWheelFrictionSlip(i, s) { ws[i].slip = s; },
    setWheelSideFrictionStiffness(i, k) { ws[i].sideK = k; },
    setWheelSuspensionStiffness() {}, setWheelSuspensionCompression() {}, setWheelSuspensionRelaxation() {},
    setWheelMaxSuspensionTravel() {}, setWheelMaxSuspensionForce() {},
    wheelIsInContact(i) { return ws[i].contact; },
    wheelSuspensionLength(i) { const w = ws[i]; return w.l; },
    wheelSteering(i) { return ws[i].steerApplied; },
    wheelRotation(i) { return ws[i].rot; },
    wheelContactPoint(i) { const w = ws[i]; return w.contact ? w.p : null; },
    currentVehicleSpeed() { return lastSpeed; },
    free() { freed = true; },
    // diagnostics (tests / overlay)
    params: { Lstatic, Lmin, Lmax, bump, droop, mu0, mU, kT, fShare, k: ws.map((w) => +w.k.toFixed(0)), n0: ws.map((w) => +w.n0.toFixed(0)), fn: +fn0.toFixed(2) },
    wheelState(i) { const w = ws[i]; return { l: w.l, travel: Lstatic - w.l, lc: w.lc, ft: w.ft, fs: w.fs, contact: w.contact, surf: w.surf, relief: w.relief, n: { ...w.n }, slip: w.slipInfo || null, lock: w.lock, spin: w.spin }; },
    debugWheels() { return debug; },
    get rayCount() { return castCount; },
    set shapeCasts(b) { shapeMode = !!b; }, get shapeCasts() { return shapeMode; },
    updateVehicle(dt, filter = QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC) {
      if (freed || !(dt > 0)) return;
      opts.dt = dt;
      const T0 = body.translation(), R0 = body.rotation(), q = { x: R0.x, y: R0.y, z: R0.z, w: R0.w };
      const up = rotV(q, 0, 1, 0, st.up), fw = rotV(q, 0, 0, 1, st.fw), lf = rotV(q, 1, 0, 0, st.lf);
      const lv = body.linvel(), av = body.angvel();
      const V = { x: lv.x, y: lv.y, z: lv.z }, W = { x: av.x, y: av.y, z: av.z };
      const C = body.worldCom();
      const m = body.mass(); if (!(m > 0)) return; const invM = 1 / m;
      inertia(q);
      lastSpeed = V.x * fw.x + V.y * fw.y + V.z * fw.z;
      // contact detail by distance: the player's car and anything within 22 m get the full tire profile (14 rays + edge solve per
      // wheel), traffic to 70 m a 3-ray arc with the edge solve (still climbs curbs on the arc), beyond that one ray per wheel
      let tier = shapeMode ? 2 : 1;
      if (!opts.isPlayer?.()) { const pp = game.player?.position; if (pp) { const dx = pp.x - T0.x, dz = pp.z - T0.z, d2 = dx * dx + dz * dz; tier = d2 < 22 * 22 ? tier : d2 < 70 * 70 ? 1 : 0; } }
      if ((st.roughT -= dt) <= 0) { st.roughT = 0.5 + Math.random() * 0.1; try { const G = game.city?.roadGraph, e = G?.nearestEdge?.(T0.x, T0.z, {}, 12)?.edge; const k = String(e?.kind || ''); st.roughK = 1; for (const [re, f] of ROUGH) if (re.test(k)) { st.roughK = f; break; } if (e && /keys|rural/.test(String(e.style || e.zone || ''))) st.roughK = Math.max(st.roughK, 1.8); } catch (e) { st.roughK = 1; } }
      const wet = clamp(WEATHER_U[0] || 0, 0, 1);
      // Ackermann steering (70 %): the inner front wheel turns more
      for (const w of ws) {
        if (!w.front || Math.abs(w.steer) < 1e-4) { w.steerApplied = w.steer; continue; }
        const t = Math.tan(w.steer), ack = Math.atan2(wb * t, wb - w.x * t);
        w.steerApplied = w.steer + (ack - w.steer) * 0.7;
      }
      // ---- 1. contacts ----
      for (let i = 0; i < ws.length; i++) castWheel(ws[i], i, q, T0, filter, tier);
      // ---- 2. vertical: quarter-car per wheel, sub-stepped ----
      const NS = 4, h = dt / NS, gUp = -G * up.y; // gravity along the suspension axis (negative = pulls the wheel down)
      for (const w of ws) {
        // hardpoint velocity along the axis
        const rx = w.hx - C.x, ry = w.hy - C.y, rz = w.hz - C.z;
        const vhx = V.x + W.y * rz - W.z * ry, vhy = V.y + W.z * rx - W.x * rz, vhz = V.z + W.x * ry - W.y * rx;
        w.vh = vhx * up.x + vhy * up.y + vhz * up.z;
        w.sh = 0; w.sw = -w.l; w.fsAcc = 0; w.ftAcc = 0; w.stopJ = 0; w.atStop = 0;
      }
      for (let k = 0; k < NS; k++) {
        for (let i = 0; i < ws.length; i++) {
          const w = ws[i], o = ws[i ^ 1];
          w.sh += w.vh * h;
          const l = w.sh - w.sw, ldot = w.vh - w.vw;
          // tire: deflection below the rigid contact (+ static preload so the visual tire sits on the ground at rest)
          const sg = -w.lc + w.vh * 0; // ground along the axis, relative to the hardpoint at tick start (fixed in the world)
          const defl = (sg - w.sw) + w.d0 * (w.lc < Lmax + 0.5 ? 1 : 0);
          let ft = 0;
          if (w.lc < Lmax + 0.5 && defl > 0) ft = Math.max(0, kT * defl - cT * w.vw);
          // suspension: preloaded coil, digressive bump / rebound damper, progressive bump stop, anti-roll bar
          let fs = w.n0 + w.k * (Lstatic - l);
          if (fs < 0) fs = 0; // the spring unseats in full droop, it never pulls
          const vc0 = -ldot, kn = 0.2; // compression rate (m/s), damper knee
          const cdmp = vc0 > 0 ? w.cb : w.cr, av0 = Math.abs(vc0);
          fs += Math.sign(vc0) * cdmp * (av0 < kn ? av0 : kn + (av0 - kn) * 0.45);
          const xb = (Lstatic - 0.55 * bump) - l; if (xb > 0) fs += w.kBs * xb * xb;
          fs += w.kArb * ((o.l ?? l) - l);
          // wheel (unsprung mass) along the axis
          w.vw += ((ft - fs) / mU + gUp) * h;
          w.sw += w.vw * h;
          let l2 = w.sh - w.sw, fBody = fs;
          if (l2 < Lmin) { // hard bump stop: the wheel moves with the body, the tire load goes straight into the chassis
            w.sw = w.sh - Lmin; l2 = Lmin;
            if (w.vw > w.vh) { w.stopJ += mU * (w.vw - w.vh); w.vw = w.vh; }
            fBody = Math.max(fs, ft + mU * gUp); w.atStop++;
          } else if (l2 > Lmax) { // droop limit: the hanging wheel is carried by the body
            w.sw = w.sh - Lmax; l2 = Lmax;
            if (w.vw < w.vh) { w.stopJ += mU * (w.vw - w.vh); w.vw = w.vh; }
          }
          w.l = l2;
          w.fsAcc += fBody; w.ftAcc += ft;
        }
      }
      // ---- apply suspension forces to the chassis (velocity copy) ----
      let grounded = 0;
      for (const w of ws) {
        w.fs = w.fsAcc / NS; w.ft = Math.min(w.ftAcc / NS, w.n0 * 25);
        w.contact = w.ft > 1;
        if (w.contact) grounded++;
        const J = w.fs * dt + w.stopJ;
        const rx = w.hx - C.x, ry = w.hy - C.y, rz = w.hz - C.z;
        applyJ(V, W, invM, rx, ry, rz, up.x * J, up.y * J, up.z * J);
        // horizontal part of the tire contact force (tilted contact normal at a curb edge, a rock, a pothole rim)
        if (w.contact) {
          const nd = w.n.x * up.x + w.n.y * up.y + w.n.z * up.z;
          const npx = w.n.x - up.x * nd, npy = w.n.y - up.y * nd, npz = w.n.z - up.z * nd;
          const npl = Math.hypot(npx, npy, npz);
          if (npl > 0.02) {
            const fe = Math.min(w.ft * npl / Math.max(nd, 0.4), w.ft * 2.2) * dt;
            const prx = w.p.x - C.x, pry = w.p.y - C.y, prz = w.p.z - C.z;
            applyJ(V, W, invM, prx, pry, prz, npx / npl * fe, npy / npl * fe, npz / npl * fe);
          }
        }
      }
      // ---- 3. tire forces (sequential impulses) ----
      const order = (Math.floor(performance.now() / 16) & 1) ? [0, 1, 2, 3] : [1, 0, 3, 2];
      for (const i of order) {
        const w = ws[i]; if (!w || !w.contact) { if (w) { w.fyPrev *= 0.8; w.spin = 0; w.lock = false; w.slipInfo = null; } continue; }
        const S = SURF[w.surf] || SURF.asphalt;
        // contact frame: n, forward f (wheel heading projected on the contact plane), side s
        const sa = w.steerApplied, cs = Math.cos(sa), sn = Math.sin(sa);
        _wf.x = fw.x * cs + lf.x * sn; _wf.y = fw.y * cs + lf.y * sn; _wf.z = fw.z * cs + lf.z * sn;
        const n = w.n, fdn = _wf.x * n.x + _wf.y * n.y + _wf.z * n.z;
        let fx = _wf.x - n.x * fdn, fy = _wf.y - n.y * fdn, fz = _wf.z - n.z * fdn; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
        const sx = n.y * fz - n.z * fy, sy = n.z * fx - n.x * fz, sz = n.x * fy - n.y * fx; // side = n x f (points to the car's left)
        // normal load along n (the suspension carries its axis component)
        const nd = Math.max(0.45, n.x * up.x + n.y * up.y + n.z * up.z);
        const N = w.ft / nd;
        // peak friction: per-wheel slip scale (handbrake, power slide, damage set it), surface, wet roads, load sensitivity
        const wetK = /asphalt|concrete|pavers/.test(w.surf) ? 1 - 0.26 * wet : /wood/.test(w.surf) ? 1 - 0.35 * wet : 1 - 0.18 * wet;
        const loadK = clamp(1 - 0.1 * (N / w.n0 - 1), 0.78, 1.08);
        const mu = mu0 * (w.slip / (spec.grip || 2.2)) * S.mu * wetK * loadK;
        const Jmax = mu * N * dt;
        // velocities at the contact
        const rx = w.p.x - C.x, ry = w.p.y - C.y, rz = w.p.z - C.z;
        const vpx = V.x + W.y * rz - W.z * ry, vpy = V.y + W.z * rx - W.x * rz, vpz = V.z + W.x * ry - W.y * rx;
        const vLong = vpx * fx + vpy * fy + vpz * fz, vLat = vpx * sx + vpy * sy + vpz * sz;
        // longitudinal: drive, brakes, rolling resistance
        const mL = effMass(invM, rx, ry, rz, fx, fy, fz);
        const bMax = w.brake + S.rr * N * dt * (1 + Math.abs(vLong) * 0.004);
        let jx = w.engine * dt;
        const stopJ = -vLong * mL;
        if (bMax > 0) jx += clamp(stopJ - jx * 0, -bMax, bMax);
        // lateral: brush curve on the slip angle, lagged by the relaxation length
        const lyh = w.front ? T.rcF : T.rcR; // roll-center height: lateral force acts this far above the patch
        const rxs = rx + up.x * lyh, rys = ry + up.y * lyh, rzs = rz + up.z * lyh;
        const mS = effMass(invM, rxs, rys, rzs, sx, sy, sz);
        const jRigid = -vLat * mS;
        const tanA = Math.abs(vLat) / Math.max(Math.abs(vLong), 2.2);
        const sig = tanA / T.tp;
        const curve = sig < 1 ? sig * (2 - sig) : Math.max(0.82, 1 - 0.09 * (sig - 1));
        let fyCap = mu * N * curve * w.sideK * dt;
        let jy = Math.sign(jRigid) * Math.min(Math.abs(jRigid), fyCap);
        const lag = clamp(dt * (Math.abs(vLong) + 3) / 0.45, 0.2, 1);
        jy = w.fyPrev + (jy - w.fyPrev) * lag;
        if (Math.abs(jy) > Math.abs(jRigid) && Math.sign(jy) === Math.sign(jRigid)) jy = jRigid; // never push past zero slip
        // friction ellipse (drive / brake vs cornering); sliding loses ~8 %
        const ex = jx / Math.max(1e-9, Jmax), ey = jy / Math.max(1e-9, Jmax * Math.max(0.2, w.sideK));
        const e2 = ex * ex + ey * ey;
        w.spin = 0; w.lock = false;
        if (e2 > 1) {
          const kk = 0.92 / Math.sqrt(e2);
          if (w.engine * dt > Math.abs(stopJ) * 0.5 && Math.abs(ex) > Math.abs(ey) * 0.5) w.spin = Math.min(1, Math.sqrt(e2) - 1 + 0.2);
          if (w.brake > 0 && Math.abs(ex) > 0.6 && w.engine === 0) w.lock = Math.abs(vLong) > 1;
          jx *= kk; jy *= kk;
        }
        w.fyPrev = jy;
        w.slipInfo = { a: Math.atan(tanA) * Math.sign(vLat), use: Math.min(1.5, Math.sqrt(e2)), mu: +mu.toFixed(3) };
        // longitudinal at a little above the patch (anti-dive / anti-squat geometry, ~25 %)
        const lxh = 0.08;
        const ix = fx * jx, iy = fy * jx, iz = fz * jx;
        applyJ(V, W, invM, rx + up.x * lxh, ry + up.y * lxh, rz + up.z * lxh, ix, iy, iz);
        const jsx = sx * jy, jsy = sy * jy, jsz = sz * jy;
        applyJ(V, W, invM, rxs, rys, rzs, jsx, jsy, jsz);
        // the ground pushes back: a dynamic body under the wheel (another car's roof, a push prop) takes the reaction
        if (w.hitBody) { try { const Jn = w.fs * dt; w.hitBody.applyImpulseAtPoint({ x: -(ix + jsx) - up.x * Jn, y: -(iy + jsy) - up.y * Jn, z: -(iz + jsz) - up.z * Jn }, w.p, true); } catch (e) { /* */ } }
        // wheel spin (visual / audio): rolls with the ground, spins up on wheelspin, stops when locked
        const roll = vLong / r;
        w.omega = w.lock ? w.omega * 0.6 : roll + w.spin * 14 * Math.sign(w.engine || 1);
      }
      for (const w of ws) { if (!w.contact) w.omega *= Math.exp(-dt * 0.4); w.rot += w.omega * dt; if (w.rot > 1e4 || w.rot < -1e4) w.rot %= Math.PI * 2; }
      if (![V.x, V.y, V.z, W.x, W.y, W.z].every(Number.isFinite)) return; // leave the body alone; vehicles.js' NaN guard rebuilds
      body.setLinvel(V, true); body.setAngvel(W, true);
      vc.grounded = grounded;
      if (opts.debug || game.physics?.colliderOverlay?.on) {
        debug = ws.map((w) => {
          const cx = w.hx - up.x * w.l, cy = w.hy - up.y * w.l, cz = w.hz - up.z * w.l, sa = w.steerApplied, c2 = Math.cos(sa), s2 = Math.sin(sa);
          return { c: { x: cx, y: cy, z: cz }, ax: { x: lf.x * c2 - fw.x * s2, y: lf.y * c2 - fw.y * s2, z: lf.z * c2 - fw.z * s2 }, fw: { x: fw.x * c2 + lf.x * s2, y: fw.y * c2 + lf.y * s2, z: fw.z * c2 + lf.z * s2 }, up: { ...up }, r, hw: tw / 2, contact: w.contact, p: { ...w.p }, n: { ...w.n } };
        });
      } else debug = null;
    },
  };
  void _ax; void _tmp; void wheelHalfTrack;
  return vc;
}
