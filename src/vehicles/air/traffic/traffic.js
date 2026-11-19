// AI airline traffic (airports agent, Nov 19): airliners and turboprops that land, roll out, vacate, taxi to a free gate,
// park (engines off, ground crew around), push back, taxi to the active runway end, hold short, line up and take off on
// a believable schedule; one runway user at a time (arrivals and departures are sequenced, departures hold short while
// an arrival is on final). Kinematic: each flight follows smoothed taxi paths built from airports.json (parallel
// taxiway, connectors, stands) and parametric roll / climb / approach / flare profiles. Night: nav lights (red left,
// green right, white tail), red anti-collision beacons, white strobes and landing lights (one point draw per aircraft).
// Cheap when far: nothing updates beyond 6 km of an airport, models swap to their far LOD past 600 m.
//   createTraffic(game, airports) -> { update(dt), flights, book(from, to) ... }
import * as THREE from 'three';
import { loadModel, loadCollision } from '../../../world/airport/models.js';
import { frame, polyLen, along } from '../../../world/airport/geom.js';
import { applyLivery } from './livery.js';

const TYPES = {
  jet: { model: 'buildings/airliner', far: 'buildings/airliner_lod1', len: 37.6, span: 34.4, tail: 11.8, yaw: 0, vr: 72, acc: 2.9, vApp: 70, climb: 0.13, ops: ['Transcoastal', 'Zest Air', 'Southline Air'] },
  turboprop: { model: 'airport/turboprop', far: 'airport/turboprop_lod1', len: 27.2, span: 27.2, tail: 7.7, yaw: 0, vr: 52, acc: 2.4, vApp: 55, climb: 0.11, ops: ['Conch Coast Air', 'Keys Island Link'] },
};
const DEST = { mia: ['Key West', 'Atlanta', 'New York', 'Chicago', 'Havana', 'Nassau', 'Bogota', 'Dallas', 'Orlando', 'Houston'], eyw: ['Miami', 'Tampa', 'Fort Myers', 'Orlando', 'Nassau'] };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Catmull-Rom resample of a control polyline (keeps the ends), step ~3 m
function smooth(pts, step = 3) {
  if (pts.length < 3) { const out = []; const L = polyLen(pts); for (let d = 0; d <= L; d += step) { const a = along(pts, d); out.push([a.x, a.z]); } const e = pts[pts.length - 1]; out.push([e[0], e[1]]); return out; }
  const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2], L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); }
  }
  const e = pts[pts.length - 1]; out.push([e[0], e[1]]); return out;
}
function pathOf(pts) { const p = smooth(pts); const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return { p, cum, L: cum[cum.length - 1] }; }
function samplePath(P, d, out) {
  d = clamp(d, 0, P.L); let lo = 0, hi = P.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] <= d) lo = m; else hi = m; }
  const a = P.p[lo], b = P.p[hi], seg = P.cum[hi] - P.cum[lo] || 1, t = (d - P.cum[lo]) / seg;
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t; out.h = Math.atan2(b[0] - a[0], b[1] - a[1]);
  // curvature ahead (for speed): heading change over the next 30 m
  const j = Math.min(P.p.length - 1, hi + 10), c = P.p[j], h2 = Math.atan2(c[0] - b[0], c[1] - b[1]); let dh = h2 - out.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); out.turn = Math.abs(dh);
  return out;
}

const NAV_VS = /* glsl */`
attribute vec3 col; attribute vec2 md; uniform float uTime; uniform float uNight; uniform float uScale; varying vec3 vC; varying float vI;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); float dist = length(cameraPosition - wp.xyz);
  float on = 1.0; if (md.x > 0.5 && md.x < 1.5) on = step(fract(uTime * 1.1 + md.y), 0.1); else if (md.x > 1.5 && md.x < 2.5) on = step(fract(uTime * 0.9 + md.y), 0.06) * 2.5; else if (md.x > 2.5) on = md.y;
  vI = on * mix(0.5, 1.0, uNight) * exp(-dist / 12000.0); vC = col; gl_Position = projectionMatrix * viewMatrix * wp;
  gl_PointSize = on > 0.001 ? clamp((md.x > 2.5 ? 2.4 : 0.9) * uScale / max(dist, 1.0), 1.6, 64.0) : 0.0; }`;
const NAV_FS = /* glsl */`varying vec3 vC; varying float vI; void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard; gl_FragColor = vec4(vC * (exp(-r2 * 8.0) * 8.0 + exp(-r2 * 2.5) * 0.6) * vI, 1.0); }`;

export function createTraffic(game, airports) {
  const scene = game.scene, world = game.world, RAPIER = game.RAPIER;
  const navU = { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 600 } };
  const navMat = new THREE.ShaderMaterial({ vertexShader: NAV_VS, fragmentShader: NAV_FS, uniforms: navU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const flights = [];
  let fid = 100 + Math.floor(Math.random() * 600);
  const AP = airports.map((ap) => prepAirport(ap));

  function prepAirport(ap) {
    const rw = ap.runways.find((r) => r.use === 'airline') || ap.runways[0], F = frame(rw.a, rw.b);
    const par = ap.taxiways.find((t) => t.id === 'A'), TA = F.q(par.pts[0][0], par.pts[0][1]);
    const parS = [F.s(...par.pts[0]), F.s(...par.pts[par.pts.length - 1])].sort((a, b) => a - b);
    const conns = ap.taxiways.filter((t) => /^A\d/.test(t.id)).map((t) => { const a = t.pts[0], b = t.pts[t.pts.length - 1]; const onRw = Math.abs(F.q(...a)) < Math.abs(F.q(...b)) ? 0 : 1; const pts = onRw === 0 ? t.pts.slice().reverse() : t.pts.slice(); // pts: parallel -> runway
      return { id: t.id, pts, sPar: F.s(...pts[0]), sRw: F.s(...pts[pts.length - 1]) }; });
    const stands = (ap.stands || []).filter((s) => s.kind === 'gate' || s.kind === 'remote').map((s) => ({ ...s, busy: null, type: ap.id === 'eyw' || s.kind === 'remote' ? 'turboprop' : 'jet' }));
    const A = { ap, rw, F, TA, parS, conns, stands, busyUntil: 0, nextArr: 8 + Math.random() * 20, nextDep: 25 + Math.random() * 30, dir: 1, live: false, cx: ap.center[0], cz: ap.center[1], board: [] };
    return A;
  }
  // active runway direction: take off / land into the wind (headwind component along u)
  function runwayDir(A) { const w = game.wind || { vx: 0, vz: 0 }; const head = -((w.vx || 0) * A.F.ux + (w.vz || 0) * A.F.uz); if (Math.abs(head) > 1.2) A.dir = head > 0 ? 1 : -1; return A.dir; }

  // ---------------------------------------------------------------- aircraft object
  async function makeAircraft(type, op) {
    const T = TYPES[type], src = await loadModel(T.model); if (!src) return null;
    const g = new THREE.Group(); g.name = 'ai-' + type;
    const near = src.clone(true); near.rotation.y = T.yaw; g.add(near); try { applyLivery(near, type, op); } catch (e) { /* plain livery */ }
    let far = null; const fs = await loadModel(T.far); if (fs) { far = fs.clone(true); far.rotation.y = T.yaw; far.visible = false; g.add(far); far.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }
    // nav / beacon / strobe / landing lights (model frame: +z nose, +x left wing)
    const hs = T.span / 2 - 0.3, L2 = T.len / 2;
    const pts = [hs, 3.2, -1, -hs, 3.2, -1, 0, T.tail - 0.5, -L2 + 0.3, 0, 4.4, 0, 0, 0.5, 2, hs, 3.2, -1.3, -hs, 3.2, -1.3, 0.8, 1.6, L2 - 6, -0.8, 1.6, L2 - 6];
    const col = [1, 0.08, 0.05, 0.1, 1, 0.3, 1, 1, 0.95, 1, 0.1, 0.05, 1, 0.1, 0.05, 1, 1, 1, 1, 1, 1, 1, 0.97, 0.9, 1, 0.97, 0.9];
    const md = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0.5, 2, 0, 2, 0.15, 3, 0, 3, 0];
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); lg.setAttribute('col', new THREE.Float32BufferAttribute(col, 3)); lg.setAttribute('md', new THREE.Float32BufferAttribute(md, 2));
    const lp = new THREE.Points(lg, navMat); lp.frustumCulled = false; lp.renderOrder = 6; g.add(lp);
    scene.add(g);
    // kinematic hitboxes: fuselage + wings (cars, people and the camera bump into it)
    let body = null;
    try {
      body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      world.createCollider(RAPIER.ColliderDesc.cuboid(1.9, 2.0, L2 - 1).setTranslation(0, 3.2, 0), body);
      world.createCollider(RAPIER.ColliderDesc.cuboid(hs, 0.35, 2.8).setTranslation(0, 3.0, -1), body);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 2.6, 2.5).setTranslation(0, T.tail - 2.6, -L2 + 3), body);
    } catch (e) { body = null; }
    return { g, near, far, lp, body, T, type };
  }

  // ---------------------------------------------------------------- flights
  // phases: 'parked' -> 'push' -> 'taxiOut' -> 'hold' -> 'lineup' -> 'roll' -> 'climb' -> gone
  //         'final' -> 'flare' -> 'rollout' -> 'vacate' -> 'taxiIn' -> 'parked'
  const _s = {};
  function stOf(st) { const hx = Math.sin(st.heading), hz = Math.cos(st.heading), T = TYPES[st.type]; return { cx: st.x - hx * T.len / 2, cz: st.z - hz * T.len / 2, hx, hz }; }
  async function spawnParked(A, st, depIn) {
    const id = flightNo(A, st.type), ac = await makeAircraft(st.type, id.op); if (!ac) return null;
    const c = stOf(st);
    const f = { A, ac, st, phase: 'parked', t: 0, depAt: depIn, x: c.cx, z: c.cz, y: 0, h: st.heading, pitch: 0, roll: 0, v: 0, id, dest: pick(DEST[A.ap.id]), engines: 0 };
    st.busy = f; flights.push(f); place(f); return f;
  }
  function flightNo(A, type) { const op = pick(TYPES[type].ops); fid += 1 + Math.floor(Math.random() * 37); return { op, code: (op === 'Transcoastal' ? 'TC' : op === 'Zest Air' ? 'ZA' : op === 'Southline Air' ? 'SL' : op === 'Conch Coast Air' ? 'CC' : 'KL') + ' ' + (fid % 900 + 100) }; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function ground(x, z) { return game.city?.groundHeightAt?.(x, z) ?? 0; }

  function depPath(A, f) {
    const { F, TA } = A, dir = runwayDir(A), st = f.st, c = stOf(st);
    const conn = A.conns.slice().sort((a, b) => (dir > 0 ? a.sRw - b.sRw : b.sRw - a.sRw))[0];
    const sSt = F.s(c.cx, c.cz), qSt = F.q(c.cx, c.cz);
    let push = null, pts = [];
    if (st.bridge) {   // push back to the taxilane, nose toward the departure end
      const qLane = Math.max(TA + 30, qSt - 52);
      push = pathOf([[c.cx, c.cz], F.P(sSt, (qSt + qLane) / 2 + 6), F.P(sSt + dir * 22, qLane)]);   // reversed: the tail leads
      pts = [F.P(sSt + dir * 22, qLane), F.P(sSt - dir * 20, qLane - 4), F.P(sSt - dir * 70, TA + 8), F.P(sSt - dir * 110, TA)];
    } else {           // drive-through stand: forward out of it, then onto the parallel taxiway
      const hx = c.hx, hz = c.hz, alongS = Math.sign(hx * F.ux + hz * F.uz) || 1, toward = Math.sign(conn.sPar - sSt) || 1;
      if (alongS === toward) pts = [[c.cx, c.cz], [c.cx + hx * 25, c.cz + hz * 25], F.P(sSt + alongS * 55, (qSt + TA) / 2), F.P(sSt + alongS * 85, TA)];
      else { const sN = sSt + alongS * TYPES[st.type].len / 2; pts = [[c.cx, c.cz], [c.cx + hx * 18, c.cz + hz * 18], F.P(sN + alongS * 26, (qSt + TA) / 2 + 3), F.P(sN + alongS * 8, TA + 2), F.P(sN - alongS * 30, TA)]; }   // U-turn on the apron
    }
    const last = pts[pts.length - 1], sLast = F.s(last[0], last[1]);
    if ((conn.sPar - sLast) * -dir > 0 || true) pts.push(F.P(conn.sPar + dir * 35, TA));
    for (const p of conn.pts) pts.push(p);
    const lineup = F.P(conn.sRw + dir * 2, 0);
    return { push, taxi: pathOf(pts), conn, lineup, dir };
  }
  function arrPath(A, f, exitS) {
    const { F, TA } = A, dir = f.dir;
    // the first connector at / beyond the exit point that does not point back against the landing direction
    const cand = A.conns.filter((c) => (c.sRw - exitS) * dir >= 15 && (c.sPar - c.sRw) * dir >= -5).sort((a, b) => (a.sRw - b.sRw) * dir);
    const conn = cand[0] || A.conns.slice().sort((a, b) => (b.sRw - a.sRw) * dir)[0];
    const st = f.st, c = stOf(st), sSt = F.s(c.cx, c.cz), qSt = F.q(c.cx, c.cz);
    const pts = [[f.x, f.z]]; if ((conn.sRw - exitS) * dir > 30) pts.push(F.P(conn.sRw - dir * 15, 0)); pts.push(...conn.pts.slice().reverse());
    const along2 = st.bridge ? 0 : (Math.sign(c.hx * F.ux + c.hz * F.uz) || 1);
    if (st.bridge) { pts.push(F.P(sSt + (conn.sPar > sSt ? 70 : -70), TA)); pts.push(F.P(sSt + (conn.sPar > sSt ? 25 : -25), TA + 12)); pts.push(F.P(sSt, (TA + qSt) / 2 + 8)); pts.push([c.cx, c.cz]); }
    else { pts.push(F.P(sSt - along2 * 95, TA)); pts.push(F.P(sSt - along2 * 45, (TA + qSt) / 2 + 4)); pts.push([c.cx - c.hx * 12, c.cz - c.hz * 12]); pts.push([c.cx, c.cz]); }
    return { taxi: pathOf(pts), conn };
  }
  async function spawnArrival(A) {
    const free = A.stands.filter((s) => !s.busy && !s.held); if (!free.length) return null;
    const st = pick(free), dir = runwayDir(A), id = flightNo(A, st.type), ac = await makeAircraft(st.type, id.op); if (!ac) return null;
    const T = TYPES[st.type], F = A.F, td = dir > 0 ? 330 : F.L - 330;
    const f = { A, ac, st, phase: 'final', t: 0, dir, td, x: 0, z: 0, y: 0, h: Math.atan2(F.ux * dir, F.uz * dir), pitch: 0.03, roll: 0, v: T.vApp, dist: 7000, id, from: pick(DEST[A.ap.id]), engines: 0.4 };
    st.busy = f; flights.push(f); return f;   // the runway is reserved only once it is on a 3 km final (below)
  }
  function place(f) {
    const g = f.ac.g; g.position.set(f.x, f.y, f.z); g.rotation.set(0, 0, 0); g.rotateY(f.h); g.rotateX(-f.pitch); g.rotateZ(f.roll);
    if (f.ac.body) { try { const q = g.quaternion; f.ac.body.setNextKinematicTranslation({ x: f.x, y: f.y, z: f.z }); f.ac.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); } catch (e) { /* */ } }
  }
  function remove(f) {
    const i = flights.indexOf(f); if (i >= 0) flights.splice(i, 1);
    scene.remove(f.ac.g); f.ac.lp.geometry.dispose();
    if (f.ac.body) try { f.ac.body.setEnabled(false); world.removeRigidBody(f.ac.body); } catch (e) { /* */ }
    if (f.st && f.st.busy === f) f.st.busy = null;
  }
  // ---------------------------------------------------------------- step
  function stepFlight(f, dt) {
    const A = f.A, F = A.F, T = f.ac.T; f.t += dt;
    const gy = ground(f.x, f.z);
    switch (f.phase) {
      case 'parked': {
        f.y = gy; f.engines = Math.max(0, f.engines - dt * 0.1);
        if (f.depAt !== undefined && f.t > f.depAt && !f.passengerHold) { const p = depPath(A, f); f.route = p; f.phase = p.push ? 'push' : 'taxiOut'; f.d = 0; f.t = 0; f.engines = 0.3; }
        break;
      }
      case 'push': {   // tail first along the push path at 1.2 m/s
        f.d += dt * 1.3; samplePath(f.route.push, f.d, _s); f.x = _s.x; f.z = _s.z; f.h = _s.h + Math.PI; f.y = gy;
        if (f.d >= f.route.push.L) { f.phase = 'taxiOut'; f.d = 0; f.t = 0; f.st.busy = null; }
        break;
      }
      case 'taxiOut': case 'taxiIn': {
        const P = f.route.taxi, rem = P.L - f.d; samplePath(P, f.d, _s);
        let want = 12 - Math.min(9, _s.turn * 12); if (rem < 60) want = Math.min(want, 2 + rem / 12);
        // hold short of the runway while it is busy (departures)
        if (f.phase === 'taxiOut' && rem < 70 && (A.busyUntil > now() || A.rwUser && A.rwUser !== f)) want = Math.min(want, Math.max(0, (rem - 62) * 0.4));
        // keep 70 m behind another taxiing aircraft
        for (const o of flights) if (o !== f && o.A === A && (o.phase === 'taxiOut' || o.phase === 'taxiIn' || o.phase === 'hold')) { const dx = o.x - f.x, dz = o.z - f.z, ahead = dx * Math.sin(f.h) + dz * Math.cos(f.h); if (ahead > 0 && ahead < 75 && Math.abs(dx * Math.cos(f.h) - dz * Math.sin(f.h)) < 20) want = Math.min(want, Math.max(0, (ahead - 45) * 0.2)); }
        f.v += clamp(want - f.v, -1.5 * dt, 0.8 * dt); f.d += f.v * dt;
        samplePath(P, f.d, _s); f.x = _s.x; f.z = _s.z; f.y = gy; let dh = _s.h - f.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); f.h += dh * Math.min(1, dt * 3);
        f.engines = 0.35;
        if (f.phase === 'taxiOut' && rem < 1.5) { if (A.busyUntil > now() || (A.rwUser && A.rwUser !== f)) { f.phase = 'hold'; } else { A.rwUser = f; f.phase = 'lineup'; f.t = 0; f.lu0 = { x: f.x, z: f.z, h: f.h }; } }
        if (f.vacating && Math.abs(F.q(f.x, f.z)) > A.rw.w / 2 + 30) { f.vacating = false; if (A.rwUser === f) A.rwUser = null; A.busyUntil = now() + 4; }
        if (f.phase === 'taxiIn' && rem < 0.4) { f.phase = 'parked'; f.t = 0; f.v = 0; f.depAt = 240 + Math.random() * 420; f.h = f.st.heading; f.arrived = true; }
        break;
      }
      case 'hold': { f.y = gy; f.v = 0; if (!(A.busyUntil > now()) && (!A.rwUser || A.rwUser === f)) { A.rwUser = f; f.phase = 'lineup'; f.t = 0; f.lu0 = { x: f.x, z: f.z, h: f.h }; } break; }
      case 'lineup': {   // swing onto the centerline, nose along the take-off direction (8 s)
        const k = Math.min(1, f.t / 8), e = k * k * (3 - 2 * k), dir = f.route.dir, L = f.route.lineup, th = Math.atan2(F.ux * dir, F.uz * dir);
        f.x = lerp(f.lu0.x, L[0], e); f.z = lerp(f.lu0.z, L[1], e); let dh = th - f.lu0.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); f.h = f.lu0.h + dh * e; f.y = gy;
        if (k >= 1) { f.phase = 'roll'; f.t = 0; f.v = 0; f.engines = 1; f.dir = dir; }
        break;
      }
      case 'roll': case 'climb': {
        const dir = f.dir; f.engines = 1;
        if (f.phase === 'roll') { f.v += T.acc * dt; if (f.v > T.vr) { f.pitch = Math.min(0.14, f.pitch + dt * 0.05); if (f.v > T.vr + 4 && f.pitch > 0.1) { f.phase = 'climb'; f.t = 0; } } }
        else { f.v = Math.min(f.v + 1.2 * dt, T.vr * 1.4); f.pitch = lerp(f.pitch, 0.15, dt * 0.5); f.vy = (f.vy || 0) + (f.v * T.climb - (f.vy || 0)) * Math.min(1, dt * 0.6); f.y += f.vy * dt; if (f.t > 6 && A.rwUser === f) { A.rwUser = null; A.busyUntil = now() + 20; } }
        f.x += Math.sin(f.h) * f.v * dt; f.z += Math.cos(f.h) * f.v * dt;
        if (f.phase === 'roll') f.y = gy;
        void dir;
        if (f.phase === 'climb' && (f.t > 70 || f.y > 1400)) { if (A.rwUser === f) A.rwUser = null; f.gone = true; }
        break;
      }
      case 'final': {   // 3 degree glide path to the touchdown point
        const dir = f.dir, tdP = F.P(f.td, 0);
        f.v = lerp(f.v, T.vApp - 4, dt * 0.05); f.dist -= f.v * dt;
        f.x = tdP[0] - F.ux * dir * f.dist; f.z = tdP[1] - F.uz * dir * f.dist;
        const gyT = ground(tdP[0], tdP[1]); f.y = gyT + Math.max(0, f.dist) * Math.tan(0.0524) + 0.4; f.pitch = 0.035; f.engines = 0.45;
        if (A.rwUser && A.rwUser !== f && f.dist < 2600 && !f.goAround) { /* a departure is still on the runway: it will be gone by the time we arrive (it lined up first) */ }
        if (f.dist < 3000 && !f.locked) { f.locked = true; A.busyUntil = Infinity; }   // departures hold short from here on
        if (f.dist < 2400 && !A.rwUser) A.rwUser = f;
        if (f.y - gyT < 9) { f.phase = 'flare'; f.t = 0; f.vy = -f.v * Math.tan(0.0524); }
        break;
      }
      case 'flare': {
        f.vy = lerp(f.vy, -1.1, dt * 2.0); f.y += f.vy * dt; { const sRun = (F.s(f.x, f.z) - f.td) * f.dir; if (sRun > 220) f.y = Math.min(f.y, gy + 0.01); }   // never float past the touchdown zone f.pitch = lerp(f.pitch, 0.085, dt * 1.5); f.v -= 0.6 * dt;
        f.x += Math.sin(f.h) * f.v * dt; f.z += Math.cos(f.h) * f.v * dt;
        if (f.y <= gy + 0.02) { f.y = gy; f.phase = 'rollout'; f.t = 0; f.engines = 0.8; game.emit?.('aircraft:aiTouchdown', { flight: f.id.code, x: f.x, z: f.z }); }
        break;
      }
      case 'rollout': {
        f.pitch = Math.max(0, f.pitch - dt * 0.06); f.v = Math.max(13, f.v - 3.1 * dt); f.y = gy; f.engines = f.t < 12 ? 0.9 : 0.4;
        f.x += Math.sin(f.h) * f.v * dt; f.z += Math.cos(f.h) * f.v * dt;
        const s = F.s(f.x, f.z);
        if (f.v <= 13.5) { const p = arrPath(A, f, s); f.route = p; f.phase = 'taxiIn'; f.d = 0; f.t = 0; f.vacating = true; }
        break;
      }
      case 'vacate': {   // roll to the exit start along the runway, then the taxi path
        const P = f.route.taxi; samplePath(P, 0, _s); const dx = _s.x - f.x, dz = _s.z - f.z, dd = Math.hypot(dx, dz);
        f.v = Math.max(6, Math.min(f.v, 4 + dd * 0.3)); f.v -= 1.0 * dt;
        if (dd < f.v * dt + 0.5) { f.phase = 'taxiIn'; f.d = 0; if (A.rwUser === f) A.rwUser = null; A.busyUntil = now() + 6; }
        else { f.x += dx / dd * f.v * dt; f.z += dz / dd * f.v * dt; let dh = Math.atan2(dx, dz) - f.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); f.h += dh * Math.min(1, dt * 2); }
        f.y = gy;
        break;
      }
    }
    // gentle bank in taxi turns is wrong for aircraft: keep wings level on the ground
    f.roll = 0;
  }
  const now = () => game.clock?.elapsed ?? performance.now() / 1000;

  // ---------------------------------------------------------------- schedule
  async function seed(A) {
    // gates mostly occupied at start: some leave soon, others later
    const gates = A.stands.slice();
    let k = 0;
    for (const st of gates) { if (Math.random() < (st.kind === 'gate' ? 0.8 : 0.5)) await spawnParked(A, st, 30 + (k++) * 70 + Math.random() * 60); }
  }
  let busy = false;
  async function schedule(A, dt) {
    if (busy) return;
    A.nextArr -= dt; A.nextDep -= dt;
    const air = flights.filter((f) => f.A === A && (f.phase === 'final' || f.phase === 'flare' || f.phase === 'rollout')).length;
    if (A.nextArr <= 0 && !air && !A.rwUser) { busy = true; try { await spawnArrival(A); } finally { busy = false; } A.nextArr = 70 + Math.random() * 80; }
  }
  let lastBoard = 0;
  function boardRows(A) {
    const rows = [];
    for (const f of flights) if (f.A === A && (f.phase === 'parked' || f.phase === 'push') && f.depAt !== undefined) {
      const left = Math.max(0, f.depAt - f.t), tod = (game.timeOfDay ?? 12) + left / 60 / 2, hh = Math.floor(tod) % 24, mm = Math.floor((tod % 1) * 60);
      rows.push({ left, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, flight: f.id.code, dest: f.dest || 'Atlanta', gate: f.st.id, status: f.phase === 'push' ? 'DEPARTED' : left < 150 ? 'BOARDING' : left < 400 ? 'ON TIME' : 'SCHEDULED' });
    }
    return rows.sort((a, b) => a.left - b.left);
  }
  return {
    flights, AP, TYPES,
    update(dt, playerPos, cam, renderer) {
      navU.uTime.value = now(); navU.uNight.value = clamp(game.env?.nightFactor ?? 0, 0, 1);
      if (cam) navU.uScale.value = (renderer?.domElement?.height || 720) / (2 * Math.tan((cam.fov * Math.PI) / 360));
      for (const A of AP) {
        const d = playerPos ? Math.hypot(playerPos.x - A.cx, playerPos.z - A.cz) : 1e9;
        const live = d < 5500 || flights.some((f) => f.A === A && f.passenger);
        if (live && !A.live && !A.seeding) { A.seeding = true; seed(A).then(() => { A.live = true; A.seeding = false; }); }
        for (const f of flights) if (f.A === A) f.ac.g.visible = live;
        if (!A.live || !live) continue;
        schedule(A, dt).catch((e) => console.warn('[traffic] schedule', e));
        if (now() - lastBoard > 4) { lastBoard = now(); A.board = boardRows(A); A.onBoard?.(A.board); }
      }
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i]; if (!f.A.live && !f.passenger) continue;
        stepFlight(f, dt); place(f);
        if (f.gone) { remove(f); continue; }
        // far LOD
        if (cam && f.ac.far) { const dx = cam.position.x - f.x, dz = cam.position.z - f.z, far = dx * dx + dz * dz > 600 * 600; if (f.ac.far.visible !== far) { f.ac.far.visible = far; f.ac.near.visible = !far; } }
        // departure schedule: keep at most one aircraft pushing / taxiing out per airport at once
      }
      for (const A of AP) { const out = flights.filter((f) => f.A === A && ['push', 'taxiOut', 'hold', 'lineup'].includes(f.phase)).length; for (const f of flights) if (f.A === A && f.phase === 'parked' && out > 0 && f.depAt !== undefined && f.t > f.depAt) f.depAt = f.t + 25; }
    },
    remove, spawnArrival, spawnParked, depPath, runwayDir, boardRows,
    stats: () => ({ flights: flights.length, phases: flights.map((f) => `${f.A.ap.id}:${f.id.code}:${f.phase}`) }),
  };
}
