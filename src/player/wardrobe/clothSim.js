// Port Solana V2 — multi-point cloth for the camp shirt (CHARACTER track).
// About 36 verlet particles ride on the loose parts of the shirt: 16 around the hem, 6 around each sleeve opening,
// 4 along each open lapel / placket edge and the collar tips. Each particle is anchored to the skinned rest position of its
// garment vertex; it lags behind body motion, is pushed by the air moving past it (game.wind.sample with gusts), and is
// kept outside the body (no inward motion past the anchor surface, thigh capsules for the hem). Fixed 120 Hz substeps
// with a capped accumulator, so it stays stable at low frame rates. The vertex shader blends the two nearest particle
// offsets into each loose vertex (attribute `clothW`, uniform array `uCP`).
import * as THREE from 'three';

export const MAX_CP = 40;
const LAP_CLOSED = [1.385, 1.41, 1.44, 1.47];
const LAP_OPEN = [0.93, 1.05, 1.17, 1.29, 1.385, 1.44];
const STEP = 1 / 120;
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Vector3();
const tread = new THREE.Vector3();
const _zero = new THREE.Vector3();
let soak = 0;                                        // wet cloth is heavy and clings: less drag, stiffer, less reach
const _air = { x: 0, z: 0 };

// pick control points in bind space from the garment's loose vertices (color.b = looseness, color.g = edge)
function pickPoints(geo, open) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const nrm = geo.attributes.normal;
  const n = pos.count;
  const pts = [];
  const add = (i, group, k) => pts.push({ i, group, k });
  // hem: lowest loose vertex in each of 16 angular bins around the torso axis
  const hem = new Array(16).fill(-1);
  const sleeve = { L: new Array(6).fill(-1), R: new Array(6).fill(-1) };
  const sc = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  const scn = { L: 0, R: 0 };
  for (let i = 0; i < n; i++) {
    const f = col.getZ(i);
    if (f < 0.5) continue;
    const y = pos.getY(i);
    const x = pos.getX(i);
    if (y < 1.0 && Math.abs(x) < 0.3) {
      const a = Math.atan2(pos.getZ(i), x);
      const b = Math.floor((a + Math.PI) / (Math.PI * 2) * 16) % 16;
      if (hem[b] < 0 || y < pos.getY(hem[b])) hem[b] = i;
    } else if (y > 1.05 && Math.abs(x) > 0.15) {
      const s = x > 0 ? 'L' : 'R';
      sc[s].x += x; sc[s].y += y; sc[s].z += pos.getZ(i);
      scn[s]++;
    }
  }
  hem.forEach((i, k) => { if (i >= 0) add(i, 'hem', k); });
  for (const s of ['L', 'R']) {
    if (!scn[s]) continue;
    sc[s].divideScalar(scn[s]);
    let best = new Array(6).fill(-1);
    let bestD = new Array(6).fill(-1);
    for (let i = 0; i < n; i++) {
      const f = col.getZ(i);
      const x = pos.getX(i);
      if (f < 0.35 || pos.getY(i) <= 1.05 || Math.abs(x) <= 0.15 || (x > 0) !== (s === 'L')) continue;
      _v.set(x, pos.getY(i), pos.getZ(i)).sub(sc[s]);
      const a = Math.atan2(_v.z, _v.y);
      const b = Math.floor((a + Math.PI) / (Math.PI * 2) * 6) % 6;
      const d = Math.abs(x);
      if (d > bestD[b]) { bestD[b] = d; best[b] = i; }
    }
    best.forEach((i, k) => { if (i >= 0) add(i, 'sleeve' + s, k); });
  }
  // lapels / open placket edge and collar tips: collar-fall vertices (looseness 0.1..0.45, high, front)
  for (const side of [1, -1]) {
    const bands = open ? LAP_OPEN : LAP_CLOSED;
    bands.forEach((by, k) => {
      let bi = -1;
      let bd = 1e9;
      for (let i = 0; i < n; i++) {
        const f = col.getZ(i);
        if (f < 0.12 || (!open && f > 0.5) || pos.getZ(i) < 0.02 || Math.sign(pos.getX(i)) !== side) continue;
        if (open && Math.abs(pos.getX(i)) > 0.13) continue;
        const d = open
          ? Math.abs(pos.getY(i) - by) * 4 + Math.abs(pos.getX(i)) * 0.5                 // the free front edge
          : Math.abs(pos.getY(i) - by) * 4 + (1 - col.getY(i)) * 0.05 - Math.abs(pos.getX(i)) * 0.2;
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0) add(bi, side > 0 ? 'lapelL' : 'lapelR', k);
    });
  }
  // per-vertex weights: interpolate between the two neighboring particles of the vertex's own chain (continuous, so
  // the cloth bends instead of tearing), scaled by how loose the vertex is (0 at the waist / shoulder, 1 at the edge)
  const P = pts.slice(0, MAX_CP).map((p) => new THREE.Vector3(pos.getX(p.i), pos.getY(p.i), pos.getZ(p.i)));
  const idx = {};
  pts.slice(0, MAX_CP).forEach((p, j) => { idx[p.group + ':' + p.k] = j; });
  const find = (g, k, n) => {
    for (let d = 0; d < n; d++) {
      const a = idx[g + ':' + ((k + d) % n)];
      if (a !== undefined) return a;
      const b = idx[g + ':' + ((k - d + n * 4) % n)];
      if (b !== undefined) return b;
    }
    return 0;
  };
  const W = new Float32Array(n * 4);
  const lapY = open ? LAP_OPEN : LAP_CLOSED;
  for (let i = 0; i < n; i++) {
    const f = col.getZ(i);
    if (f < 0.02) continue;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let g = null, a = 0, nb = 0, amp = 0;
    const inLapel = open
      ? (z > 0.0 && Math.abs(x) < 0.13 && y > 0.95 && y < 1.47)
      : (y > 1.3 && z > 0.0 && f >= 0.08 && f <= 0.5);
    if (inLapel) {
      g = x > 0 ? 'lapelL' : 'lapelR';
      const nL = lapY.length;
      let k = 0;
      while (k < nL - 2 && y > lapY[k + 1]) k++;
      const t = THREE.MathUtils.clamp((y - lapY[k]) / (lapY[k + 1] - lapY[k]), 0, 1);
      const j0 = idx[g + ':' + k], j1 = idx[g + ':' + (k + 1)];
      if (j0 !== undefined && j1 !== undefined) {
        amp = Math.min(1, f / 0.4) * (open ? 1.0 : 0.6);
        if (open && y < 1.05) {
          // bottom of an open panel: share with the hem chain so the corner moves with both
          amp *= 0.6;
        }
        W[i * 4] = j0; W[i * 4 + 1] = (1 - t) * amp; W[i * 4 + 2] = j1; W[i * 4 + 3] = t * amp;
        continue;
      }
      g = null;
    }
    if (y < 1.05 && Math.abs(x) < 0.3) {
      g = 'hem'; nb = 16;
      a = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * 16 - 0.5;
      amp = Math.min(1, f / 0.85);
    } else if (y > 1.05 && Math.abs(x) > 0.15 && f >= 0.25) {
      const sd = x > 0 ? 'L' : 'R';
      if (!scn[sd]) continue;
      g = 'sleeve' + sd; nb = 6;
      a = (Math.atan2(z - sc[sd].z, y - sc[sd].y) + Math.PI) / (Math.PI * 2) * 6 - 0.5;
      amp = Math.min(1, f / 0.55);
    }
    if (!g) continue;
    const k0 = Math.floor(a), t = a - k0;
    const j0 = find(g, ((k0 % nb) + nb) % nb, nb), j1 = find(g, (((k0 + 1) % nb) + nb) % nb, nb);
    W[i * 4] = j0; W[i * 4 + 1] = (1 - t) * amp; W[i * 4 + 2] = j1; W[i * 4 + 3] = t * amp;
  }
  geo.setAttribute('clothW', new THREE.BufferAttribute(W, 4));
  return pts.slice(0, MAX_CP).map((p, k) => ({
    ...p,
    rest: P[k].clone(),
    nrm: new THREE.Vector3(nrm.getX(p.i), nrm.getY(p.i), nrm.getZ(p.i)).normalize(),
    loose: col.getZ(p.i),
  }));
}

export function createShirtCloth({ mesh, model, bone, game, open = false }) {
  const geo = mesh.geometry;
  if (!geo.userData.clothPts) geo.userData.clothPts = pickPoints(geo, open);
  const defs = geo.userData.clothPts;
  const uCP = { value: Array.from({ length: MAX_CP }, () => new THREE.Vector3()) };
  const skin = mesh.skeleton;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  // dominant bone per point; rest offset in that bone's space
  const P = defs.map((d) => {
    let bb = 0, bw = -1;
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(d.i, c);
      if (w > bw) { bw = w; bb = si.getComponent(d.i, c); }
    }
    const local = d.rest.clone().applyMatrix4(mesh.bindMatrix).applyMatrix4(skin.boneInverses[bb]);
    const nLocal = d.nrm.clone().transformDirection(_m.copy(skin.boneInverses[bb]).multiply(mesh.bindMatrix));
    return { ...d, b: skin.bones[bb], local, nLocal, x: new THREE.Vector3(), px: new THREE.Vector3(), anchor: new THREE.Vector3(), an: new THREE.Vector3(), init: false };
  });
  const thighs = ['Left', 'Right'].map((s) => [bone(s + 'UpLeg'), bone(s + 'Leg')]);
  let acc = 0;
  let t = Math.random() * 50;
  const restLen = new Map();
  const ring = (g) => P.filter((p) => p.group === g).sort((a, b) => a.k - b.k);
  const chains = ['hem', 'sleeveL', 'sleeveR', 'lapelL', 'lapelR'].map((g) => ({ g, pts: ring(g), closed: g !== 'lapelL' && g !== 'lapelR' }));

  function anchors() {
    for (const p of P) {
      p.anchor.copy(p.local).applyMatrix4(p.b.matrixWorld);
      p.an.copy(p.nLocal).transformDirection(p.b.matrixWorld);
    }
  }
  function wind(p, out) {
    const gw = game?.wind;
    let s = 1;
    if (gw?.sample) {
      gw.sample(p.x, p.z, t, _air);
      out.set(_air.x, 0, _air.z);
      if (gw.strength) s = gw.strength(p.x, p.z, t);
    } else if (gw && typeof gw.speed === 'number' && gw.dir) {
      out.set(gw.dir.x, 0, gw.dir.y ?? gw.dir.z ?? 0).multiplyScalar(gw.speed * (1 + (gw.gust || 0)));
    } else {
      const a = 0.6 + Math.sin(t * 0.05) * 0.8;
      out.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(1.6 + 1.2 * Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 1.9)));
    }
    return s;
  }
  function step(h) {
    t += h;
    for (const p of P) {
      // verlet with spring back to the anchor, damping and air drag
      _v.subVectors(p.x, p.px);                                    // velocity * h
      const vel = _w.copy(_v).divideScalar(h);
      const s = wind(p.x, _a);
      const gust = game?.wind?.gust ?? 0.3;
      // turbulence: each point gets its own flapping on top of the mean flow
      const ph = p.k * 1.7 + (p.group.length * 0.9);
      const turb = 0.35 + 0.65 * Math.abs(Math.sin(t * 7.0 + ph) * Math.sin(t * 3.1 + ph * 0.5));
      _a.multiplyScalar(s * turb);
      _a.sub(vel).sub(tread);                                      // air relative to the cloth
      const air = _a.length();
      const k = 70 * (1.1 - p.loose * 0.5) * (1 + soak * 2.5);
      _b.subVectors(p.anchor, p.x).multiplyScalar(k);              // spring
      _b.addScaledVector(_a, 0.24 * air * p.loose * (1 - soak * 0.8));                // quadratic drag: 6 m/s pushes the loose cloth 4 to 7 cm
      _b.y += air * air * 0.16 * gust * turb * p.loose * (p.group === 'hem' ? 1 : 0.5); // gusts lift the hem
      p.px.copy(p.x);
      p.x.addScaledVector(_v, 0.975).addScaledVector(_b, h * h);
    }
    // keep chains coherent (neighbor distance near the rest distance)
    for (const c of chains) {
      const n = c.pts.length;
      for (let i = 0; i < (c.closed ? n : n - 1); i++) {
        const a = c.pts[i], b = c.pts[(i + 1) % n];
        const key = a.i + ':' + b.i;
        if (!restLen.has(key)) restLen.set(key, a.anchor.distanceTo(b.anchor));
        const r = restLen.get(key);
        _v.subVectors(b.x, a.x);
        const d = _v.length();
        if (d < 1e-6) continue;
        const corr = (d - r) / d * 0.25;
        a.x.addScaledVector(_v, corr);
        b.x.addScaledVector(_v, -corr);
      }
    }
    // collision: never behind the anchor surface, limited reach, out of the thighs
    for (const p of P) {
      _v.subVectors(p.x, p.anchor);
      const dn = _v.dot(p.an);
      if (dn < 0) p.x.addScaledVector(p.an, -dn);
      _v.subVectors(p.x, p.anchor);
      const maxR = 0.03 + 0.07 * p.loose;
      if (_v.length() > maxR) p.x.copy(p.anchor).add(_v.setLength(maxR));
      if (p.group === 'hem') {
        for (const [u, l] of thighs) {
          if (!u || !l) continue;
          u.getWorldPosition(_a);
          l.getWorldPosition(_b);
          const ab = _n.subVectors(_b, _a);
          const L2 = ab.lengthSq();
          // distance of the anchor from the thigh axis: the particle may not get closer than that (or 9.5 cm)
          const ta = THREE.MathUtils.clamp(_w.subVectors(p.anchor, _a).dot(ab) / L2, 0, 1);
          const anchorD = _w.subVectors(p.anchor, _c.copy(_a).addScaledVector(ab, ta)).length();
          const tt = THREE.MathUtils.clamp(_v.subVectors(p.x, _a).dot(ab) / L2, 0, 1);
          _c.copy(_a).addScaledVector(ab, tt);
          _v.subVectors(p.x, _c);
          const d = _v.length();
          const R = Math.min(0.095, anchorD * 0.98);
          if (d < R && d > 1e-5) p.x.copy(_c).addScaledVector(_v, R / d);
        }
      }
    }
  }
  const inv = new THREE.Matrix4();
  return {
    uCP,
    update(dt, treadmill, wet = 0) {
      if (!P.length) return;
      soak = wet;
      tread.copy(treadmill || _zero);
      model.updateMatrixWorld(true);
      anchors();
      for (const p of P) {
        if (!p.init || p.x.distanceToSquared(p.anchor) > 1) {          // first frame and teleports
          p.x.copy(p.anchor);
          p.px.copy(p.anchor);
          p.init = true;
        }
      }
      acc = Math.min(acc + Math.min(dt, 0.1), STEP * 8);
      while (acc >= STEP) {
        step(STEP);
        acc -= STEP;
      }
      // offsets into the mesh's bind space (rotation only, model scale removed)
      inv.copy(mesh.matrixWorld).invert();
      inv.decompose(_b, _q, _n);
      P.forEach((p, k) => {
        uCP.value[k].subVectors(p.x, p.anchor).applyQuaternion(_q).multiply(_n);
      });
    },
  };
}
