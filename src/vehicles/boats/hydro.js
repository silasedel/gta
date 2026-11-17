// r2-water: boat physics v2 (?boatphys=2): per-point hydrostatics + hydrodynamics + ground contact.
// Each hull carries ~20 sample points over its bottom (keel line + both chines, stem to transom). Every fixed step each point:
//   - reads the water surface above it (the shared Gerstner swell from src/world/env/waves.js + other boats' wakes, or the
//     Everglades sheet water), and pushes up along the wave normal by its submerged depth (a spring sized so the boat floats
//     at its design draft), damped by the point's own velocity (v + w x r): pitch, roll and heave all come out of this, so
//     hulls ride the swell and bounce over wakes instead of one bobbing value
//   - resists sideways motion in proportion to how wet it is, more toward the stern (skeg, keel, outboard legs) than the
//     bow: a sliding hull straightens into its track, so the boat carves; planing (fewer wet points) loosens it into a skid
//   - touches the ground (sand, mud, seabed, land) with a stiff spring + Coulomb friction from the surface underneath:
//     a beached hull grinds to a stop on its bottom instead of clipping into the beach
// The forward drag, thrust, steering servo and trim (weight transfer) stay in boats.js, fed by what this returns.
import * as THREE from 'three';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const RHO_G = 9.81;
// friction on a hull bottom (aluminum / gelcoat) by surface
export const HULL_MU = { water: 0, sheet: 0.07, marsh: 0.1, sawgrass: 0.14, mud: 0.16, damp: 0.24, grass: 0.3, scrub: 0.32, lawn: 0.3, sand: 0.42, shell: 0.5, dirt: 0.38, gravel: 0.5, rock: 0.55, asphalt: 0.55, concrete: 0.55, wood: 0.45, default: 0.45 };

// sample points in the boat's local frame (+z bow, y = 0 at the design waterline, x = port)
export function hullSamples(t) {
  const L = t.L, hw = t.W / 2, pts = [];
  const flat = !!t.airboat;
  const ST = flat ? [-0.46, -0.31, -0.16, 0, 0.15, 0.29, 0.42] : [-0.46, -0.31, -0.16, 0, 0.16, 0.31, 0.44];
  for (const s of ST) {
    const u = s + 0.5, bowT = clamp((u - (flat ? 0.72 : 0.55)) / (flat ? 0.28 : 0.45), 0, 1);
    const w = hw * (flat ? 1 - 0.18 * bowT * bowT : t.pointy ? Math.cos(bowT * Math.PI / 2) ** 1.1 : Math.sqrt(Math.max(0, 1 - bowT * bowT))) * (1 - 0.06 * (1 - u));
    const keel = -t.draft + (flat ? 0.55 : t.bowRise * 1.6) * bowT * bowT;
    const chine = flat ? keel + 0.02 : keel + t.draft * 0.55;
    const sheer = t.sheer + (flat ? 0.1 : t.bowRise * 0.6) * bowT * bowT;
    const lat = 0.55 + 0.9 * (1 - u); // stern grips more than the bow
    const share = Math.max(0.15, w / hw);
    pts.push({ p: new THREE.Vector3(0, keel, s * L), w: share * (flat ? 1 : 1.2), col: sheer - keel, lat: lat * 1.3, keel: true });
    for (const sx of [1, -1]) pts.push({ p: new THREE.Vector3(sx * w * (flat ? 0.86 : 0.78), chine, s * L), w: share, col: sheer - chine, lat, keel: false });
  }
  // calibrate: the springs carry the weight at the design draft (y = 0 at rest)
  let sw = 0; for (const q of pts) sw += q.w * Math.max(0, -q.p.y);
  const m = t.mass, g = RHO_G, wsum = pts.reduce((a, q) => a + q.w, 0);
  for (const q of pts) { q.k = q.w * m * g / Math.max(1e-3, sw); q.m = m * q.w / wsum; q.c = 2 * 0.42 * Math.sqrt(q.k * q.m); q.rest = Math.max(0.03, -q.p.y); }
  pts.pitchK = pts.reduce((a, q) => a + q.k * q.p.z * q.p.z, 0);
  pts.groundK = m * g / (pts.length * 0.035);
  return pts;
}

const _q = new THREE.Quaternion(), _w = new THREE.Vector3(), _pt = { x: 0, y: 0, z: 0 }, _imp = { x: 0, y: 0, z: 0 }, _s = { y: 0, nx: 0, ny: 1, nz: 0, kind: null };
const _f = new THREE.Vector3(), _r = new THREE.Vector3();
// env: { surface(x, z, out) -> bool (fills out.y / normal / kind), ground(x, z) -> { y, kind } , deepAt(x, z, y) -> bool }
export function hydroStep(b, dt, env) {
  const body = b.body, t = b.spec, P = b.hydro;
  const tr = body.translation(), r = body.rotation(); _q.set(r.x, r.y, r.z, r.w);
  const lv = body.linvel(), av = body.angvel();
  _f.set(0, 0, 1).applyQuaternion(_q); _r.set(1, 0, 0).applyQuaternion(_q); // bow, port (body axes)
  const planing = b.planingF || 0;
  const latK = (t.airboat ? 0.22 : 1.0) * (1 - 0.45 * planing);
  const deep = env.deepAt(tr.x, tr.z, tr.y); // no ground anywhere near the hull: skip the per-point ground queries
  let wet = 0, sternWet = false, ground = 0, muSum = 0, gKind = null, wetBottom = 0, depthSum = 0, scrape = 0, imm = 0;
  const GK = P.groundK;
  for (let i = 0; i < P.length; i++) {
    const q = P[i];
    _w.copy(q.p).applyQuaternion(_q);
    const px = tr.x + _w.x, py = tr.y + _w.y, pz = tr.z + _w.z;
    // point velocity v + w x r
    const vx = lv.x + (av.y * _w.z - av.z * _w.y), vy = lv.y + (av.z * _w.x - av.x * _w.z), vz = lv.z + (av.x * _w.y - av.y * _w.x);
    let fx = 0, fy = 0, fz = 0;
    if (env.surface(px, pz, _s)) {
      const depth = _s.y - py;
      if (depth > 0) {
        wet++; depthSum += depth; if (q.p.z < -t.L * 0.3) sternWet = true; if (_s.kind === 'sheet') wetBottom++;
        const d = Math.min(depth, q.col); imm += d * q.k;
        // buoyancy along the surface normal (a hull slides down the face of a swell), heave damping on the point velocity
        const fb = q.k * d - q.c * vy;
        const nl = Math.hypot(_s.nx * 0.6, _s.ny, _s.nz * 0.6) || 1;
        if (fb > 0) { fx += fb * _s.nx * 0.6 / nl; fy += fb * _s.ny / nl; fz += fb * _s.nz * 0.6 / nl; }
        // sideways resistance (hull frame lateral axis), proportional to how wet the point is
        const wetK = clamp(depth / Math.max(0.05, t.draft * 0.5), 0, 1.5);
        const vl = vx * _r.x + vy * _r.y + vz * _r.z;
        const fl = -q.m * (1.25 * vl + 0.32 * vl * Math.abs(vl)) * q.lat * latK * wetK;
        fx += _r.x * fl; fy += _r.y * fl; fz += _r.z * fl;
      }
    }
    // ground contact: sand, mud, seabed, banks, land
    if (!deep) {
      const gr = env.ground(px, pz);
      if (gr && py < gr.y) {
        const pen = Math.min(0.6, gr.y - py), gy = gr.y, gk = gr.kind, wetK = _s.kind;
        // the ground's slope (a beach face pushes back, not just up)
        const sx = (env.ground(px + 0.5, pz).y - gy) / 0.5, sz = (env.ground(px, pz + 0.5).y - gy) / 0.5, nl = Math.hypot(sx, 1, sz);
        const nx = -sx / nl, ny = 1 / nl, nz = -sz / nl;
        const vn = vx * nx + vy * ny + vz * nz;
        const N = Math.max(0, GK * pen * ny - 2 * 0.7 * Math.sqrt(GK * q.m) * vn);
        if (N > 0) {
          // Coulomb friction from the surface + plowing: the deeper the bottom digs into sand / mud, the harder it drags
          const mu = env.mu(gk, wetK, Math.hypot(lv.x, lv.z)) + Math.min(0.5, pen * (gk === 'sand' || gk === 'mud' || gk === 'marsh' ? 2.2 : 1.0));
          const tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz, vt = Math.hypot(tx, ty, tz), s = vt / Math.max(vt, 0.35), iv = 1 / Math.max(vt, 1e-3);
          fx += N * nx - mu * N * tx * iv * s; fy += N * ny - mu * N * ty * iv * s; fz += N * nz - mu * N * tz * iv * s;
          ground++; muSum += mu; gKind = gk; scrape += N * vt;
        }
      }
    }
    if (fx || fy || fz) { _pt.x = px; _pt.y = py; _pt.z = pz; _imp.x = fx * dt; _imp.y = fy * dt; _imp.z = fz * dt; body.applyImpulseAtPoint(_imp, _pt, true); }
  }
  const out = b.hydroOut || (b.hydroOut = {});
  out.wf = wet / P.length; out.sternWet = sternWet; out.ground = ground / P.length; out.mu = ground ? muSum / ground : 0; out.groundKind = gKind;
  out.immersion = imm / (t.mass * RHO_G); out.sheet = wet ? wetBottom / wet : 0; out.depth = wet ? depthSum / wet : 0; out.scrape = scrape / Math.max(1, t.mass * 9.81);
  return out;
}
