// Everglades r7: glades wildlife near the camera.
//  - alligators (the user's Alligator 1-3 models): sunning on the banks, head to the water, or lying in the shallows with
//    only the eyes, snout and back ridge above the tea water; one that is approached slides into the water and is gone
//  - great egrets (white) and great blue herons (slate) wading in the shallows and on the flooded prairie; they flush
//    when approached and fly off low over the sawgrass, neck folded, legs trailing; a few more always cross the sky
// Deterministic per 70 m cell (the same gator is on the same bank each visit), streamed within ~320 m, all instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel, partsOf } from './models.js';
import { hash2 } from './region.js';

const CELL = 70, R = 320, MAXG = 48, MAXB = 160, MAXF = 24;
// per gator model: file, yaw that turns the head to +Z, extra pre-rotation (the scan stands on its tail), scale
const GATORS = [
  { f: 'everglades/gator_a.glb', yaw: Math.PI, s: 1.0 },
  { f: 'everglades/gator_b.glb', yaw: Math.PI, s: 1.0 },
  { f: 'everglades/gator_c.glb', yaw: 0, rx: -Math.PI / 2, s: 0.95 },
];

function birdGeo(kind, flying) {
  const parts = [], col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (!g.attributes.aWing) g.setAttribute('aWing', new THREE.BufferAttribute(new Float32Array(n), 1)); return g; };
  const egret = kind === 'egret';
  const C = egret ? { body: [0.9, 0.9, 0.87], neck: [0.92, 0.92, 0.9], beak: [0.82, 0.62, 0.1], leg: [0.05, 0.05, 0.05] } : { body: [0.33, 0.37, 0.42], neck: [0.55, 0.53, 0.5], beak: [0.7, 0.55, 0.2], leg: [0.2, 0.2, 0.14] };
  const legH = flying ? 0 : 0.5;
  const body = new THREE.SphereGeometry(0.5, 12, 8); body.scale(0.15, 0.15, 0.34); body.rotateX(flying ? 0 : -0.35); body.translate(0, legH + 0.12, 0); parts.push(col(body, C.body));
  const tail = new THREE.ConeGeometry(0.07, 0.22, 6); tail.rotateX(-Math.PI / 2 - (flying ? 0 : 0.5)); tail.translate(0, legH + (flying ? 0.12 : 0.04), -0.24); parts.push(col(tail, C.body));
  // neck: an S up and forward when wading, folded back onto the shoulders in flight
  const pts = flying ? [[0, 0.16, 0.12], [0, 0.22, 0.14], [0, 0.2, 0.22], [0, 0.17, 0.3]] : [[0, legH + 0.18, 0.12], [0, legH + 0.34, 0.1], [0, legH + 0.46, 0.2], [0, legH + 0.56, 0.14], [0, legH + 0.62, 0.2]];
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const neck = new THREE.TubeGeometry(curve, 10, egret ? 0.026 : 0.032, 6, false); parts.push(col(neck, C.neck));
  const hp = pts[pts.length - 1];
  const head = new THREE.SphereGeometry(0.045, 8, 6); head.scale(0.9, 0.9, 1.3); head.translate(hp[0], hp[1] + 0.01, hp[2] + 0.02); parts.push(col(head, C.neck));
  const beak = new THREE.ConeGeometry(0.016, 0.15, 5); beak.rotateX(Math.PI / 2); beak.translate(hp[0], hp[1], hp[2] + 0.12); parts.push(col(beak, C.beak));
  if (!flying) for (const sx of [-0.04, 0.04]) { const l = new THREE.CylinderGeometry(0.009, 0.007, legH + 0.06, 4); l.translate(sx, (legH + 0.06) / 2, 0.01); parts.push(col(l, C.leg)); }
  else { const l = new THREE.CylinderGeometry(0.008, 0.006, 0.42, 4); l.rotateX(Math.PI / 2); l.translate(0, 0.1, -0.42); parts.push(col(l, C.leg)); // legs trailing
    for (const s of [-1, 1]) { const w = new THREE.PlaneGeometry(0.72, 0.3, 3, 1); w.rotateX(-Math.PI / 2); w.translate(s * 0.4, 0.14, 0.02); const p = w.attributes.position, a = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) { a[i] = Math.abs(p.getX(i)) / 0.76; p.setZ(i, p.getZ(i) - a[i] * a[i] * 0.12); } w.setAttribute('aWing', new THREE.BufferAttribute(a, 1)); parts.push(col(w, egret ? C.body : [0.3, 0.33, 0.37])); } }
  for (const p of parts) { p.deleteAttribute('uv'); }
  const g = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p)); g.computeVertexNormals(); return g;
}

export function createWildlife(game, G) {
  const scene = game.scene, SEA = G.SEA, uT = { value: 0 };
  const group = new THREE.Group(); group.name = 'gl7Wildlife'; scene.add(group);
  const stats = { gators: 0, birds: 0, flying: 0, cells: 0 };
  // ---------- gators
  const gpools = []; // per model: [{ mesh }]
  const gMats = new Map();
  GATORS.forEach((spec, mi) => {
    loadModel(spec.f).then((sc) => {
      if (!sc) return;
      const pre = new THREE.Matrix4().makeRotationY(spec.yaw); if (spec.rx) pre.multiply(new THREE.Matrix4().makeRotationX(spec.rx));
      const box = new THREE.Box3(); for (const p of partsOf(sc, pre)) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox.clone().applyMatrix4(p.matrix)); }
      const fix = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2).multiply(new THREE.Matrix4().makeScale(spec.s, spec.s, spec.s));
      const parts = partsOf(sc, pre).map((p) => { const g = p.geometry.clone(); g.applyMatrix4(p.matrix); g.applyMatrix4(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)); g.scale(spec.s, spec.s, spec.s);
        let m = gMats.get(p.material); if (!m) { m = p.material.clone(); m.roughness = 0.55; if (m.color) m.color.multiplyScalar(0.85); gMats.set(p.material, m); }
        const im = new THREE.InstancedMesh(g, m, MAXG); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.name = 'gl7Gator' + mi; group.add(im); return im; });
      void fix; gpools[mi] = { parts, len: box.max.z - box.min.z }; dirty = true;
    });
  });
  // ---------- birds
  const birdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  const flyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  flyMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGlT; attribute float aWing;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = instanceMatrix[3][0] * 0.71 + instanceMatrix[3][2] * 0.37; float fl = sin(uGlT * 5.2 + ph); transformed.y += fl * aWing * 0.34; transformed.x *= 1.0 - 0.12 * aWing * max(0.0, fl); }`);
  };
  flyMat.customProgramCacheKey = () => 'gl7-bird-fly';
  const stand = { egret: new THREE.InstancedMesh(birdGeo('egret', false), birdMat, MAXB), heron: new THREE.InstancedMesh(birdGeo('heron', false), birdMat, MAXB) };
  const fly = { egret: new THREE.InstancedMesh(birdGeo('egret', true), flyMat, MAXF), heron: new THREE.InstancedMesh(birdGeo('heron', true), flyMat, MAXF) };
  for (const m of [...Object.values(stand), ...Object.values(fly)]) { m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; group.add(m); }

  // ---------- population per cell (deterministic)
  const cells = new Map(); let dirty = false;
  function genCell(ci, cj) {
    const out = { gators: [], birds: [] }, x0 = ci * CELL, z0 = cj * CELL;
    if (!G.inGlades(x0 + CELL / 2, z0 + CELL / 2)) return out;
    for (let k = 0; k < 7; k++) {
      const x = x0 + hash2(ci, cj, k * 3 + 1) * CELL, z = z0 + hash2(ci, cj, k * 3 + 2) * CELL, r = hash2(ci, cj, k * 3 + 3);
      const water = G.isWater(x, z);
      if (!water) { // bank: land with water a few meters away -> a sunning gator (25 %) or nothing
        if (out.gators.length || r > 0.3) continue; const tw = G.towardWater(x, z, 7); if (!tw || G.roadDist(x, z, 30) < 12) continue;
        const gy = G.ground(x, z); if (gy > SEA + 1.2) continue;
        out.gators.push({ x, z, y: gy - 0.04, h: Math.atan2(tw[0], tw[1]) + (hash2(ci, k, cj) - 0.5) * 0.8, m: (hash2(cj, ci, k) * 3) | 0, s: 0.75 + hash2(k, ci, cj) * 0.4, st: 0, inWater: false });
      } else {
        const land = G.waterRing(x, z, 6) < 8; // near a bank
        if (land && r < 0.18 && out.gators.length < 2) { out.gators.push({ x, z, y: SEA - 0.47, h: hash2(ci, cj, k + 40) * 6.28, m: (hash2(cj, ci, k + 1) * 3) | 0, s: 0.8 + hash2(k, cj, ci) * 0.35, st: 0, inWater: true }); continue; }
        if (land && r > 0.55 && out.birds.length < 4) { const n = r > 0.86 ? 3 : 1; for (let b = 0; b < n; b++) { const bx = x + (hash2(k, b, ci) - 0.5) * 6, bz = z + (hash2(b, k, cj) - 0.5) * 6; out.birds.push({ x: bx, z: bz, y: SEA - 0.16, h: hash2(ci, b, k) * 6.28, egret: hash2(cj, b, k) < 0.68, s: 0.9 + hash2(b, ci, k) * 0.22 }); } }
      }
    }
    // flooded prairie: a wader or two on the sheet water
    for (let k = 0; k < 2; k++) { const x = x0 + hash2(ci, cj, 60 + k) * CELL, z = z0 + hash2(ci, cj, 70 + k) * CELL; if (hash2(ci, cj, 80 + k) > 0.22) continue;
      const lv = G.waterLevel(x, z); if (lv == null || G.isWater(x, z)) continue; out.birds.push({ x, z, y: lv - 0.06, h: hash2(cj, ci, 90 + k) * 6.28, egret: hash2(ci, k, 91) < 0.6, s: 0.9 + hash2(k, cj, 92) * 0.2 }); }
    return out;
  }
  const flying = []; // { x, y, z, vx, vz, vy, t, egret, life }
  function flush(b, px, pz) {
    if (flying.length >= MAXF * 2) return; const a = Math.atan2(b.x - px, b.z - pz) + (Math.random() - 0.5) * 0.8;
    flying.push({ x: b.x, y: b.y + 0.2, z: b.z, vx: Math.sin(a) * 7, vz: Math.cos(a) * 7, vy: 2.2, t: 0, egret: b.egret, life: 30 });
  }
  // ambient fliers: a few birds crossing the sky low over the prairie
  let ambT = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  function rebuild() {
    let ng = 0; const cnt = gpools.map(() => 0), sc = { egret: 0, heron: 0 };
    for (const c of cells.values()) {
      for (const g of c.gators) {
        if (g.gone) continue; const pool = gpools[g.m]; if (!pool) continue; const i = cnt[g.m]; if (i >= MAXG) continue;
        _q.setFromEuler(_e.set(g.pitch || 0, g.h, 0)); _s.setScalar(g.s); _p.set(g.x, g.y, g.z); _m.compose(_p, _q, _s);
        for (const im of pool.parts) _m.toArray(im.instanceMatrix.array, i * 16); cnt[g.m]++; ng++;
      }
      for (const b of c.birds) {
        if (b.gone) continue; const k = b.egret ? 'egret' : 'heron', i = sc[k]; if (i >= MAXB) continue;
        _q.setFromAxisAngle(_p.set(0, 1, 0), b.h); _s.setScalar(b.s * (b.egret ? 1 : 1.25)); _p.set(b.x, b.y, b.z); _m.compose(_p, _q, _s); _m.toArray(stand[k].instanceMatrix.array, i * 16); sc[k]++;
      }
    }
    gpools.forEach((pool, mi) => { if (!pool) return; for (const im of pool.parts) { im.count = cnt[mi]; im.instanceMatrix.needsUpdate = true; } });
    for (const k of ['egret', 'heron']) { stand[k].count = sc[k]; stand[k].instanceMatrix.needsUpdate = true; }
    stats.gators = ng; stats.birds = sc.egret + sc.heron;
  }
  let scanT = 0, nearT = 0;
  const moving = new Set();
  function update(dt, cam, active, player) {
    uT.value += dt;
    // flying birds (every frame, a handful of matrices)
    if (flying.length || fly.egret.count || fly.heron.count) {
      const fc = { egret: 0, heron: 0 };
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]; f.t += dt; f.life -= dt; if (f.life <= 0) { flying.splice(i, 1); continue; }
        f.vy = f.t < 2.5 ? Math.max(0.2, f.vy - dt * 0.6) : Math.max(-0.3, (f.cruise ?? 14) - f.y) * 0.3;
        f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
        const k = f.egret ? 'egret' : 'heron', j = fc[k]; if (j >= MAXF) continue;
        _q.setFromEuler(_e.set(-f.vy * 0.06, Math.atan2(f.vx, f.vz), Math.sin(f.t * 0.7) * 0.08)); _s.setScalar(f.egret ? 1.05 : 1.3); _p.set(f.x, f.y, f.z); _m.compose(_p, _q, _s);
        _m.toArray(fly[k].instanceMatrix.array, j * 16); fc[k]++;
      }
      for (const k of ['egret', 'heron']) { fly[k].count = fc[k]; fly[k].instanceMatrix.needsUpdate = true; } stats.flying = flying.length;
    }
    // sliding gators
    if (moving.size) {
      for (const g of moving) { g.st += dt; const k = Math.min(1, g.st / 2.6); g.x += g.dx * dt * 1.6 * (1 - k * 0.5); g.z += g.dz * dt * 1.6 * (1 - k * 0.5);
        g.y = Math.max(SEA - 0.9, g.y0 - k * k * 1.1); g.pitch = 0.12 * Math.sin(k * Math.PI); if (k >= 1) { g.gone = true; moving.delete(g); } }
      dirty = true;
    }
    if (!active) { if (cells.size) { cells.clear(); dirty = true; } if (dirty) { dirty = false; rebuild(); } return; }
    // reactions to the player / their boat (5 Hz)
    if ((nearT -= dt) <= 0 && player) {
      nearT = 0.2; const px = player.x, pz = player.z, ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const c = cells.get((ci + di) + ',' + (cj + dj)); if (!c) continue;
        for (const b of c.birds) if (!b.gone && (b.x - px) ** 2 + (b.z - pz) ** 2 < 18 * 18) { b.gone = true; flush(b, px, pz); dirty = true; }
        for (const g of c.gators) if (!g.gone && !g.st && !moving.has(g) && (g.x - px) ** 2 + (g.z - pz) ** 2 < 9 * 9) { const tw = g.inWater ? [Math.sin(g.h), Math.cos(g.h)] : G.towardWater(g.x, g.z, 10) || [Math.sin(g.h), Math.cos(g.h)]; g.dx = tw[0]; g.dz = tw[1]; g.h = Math.atan2(tw[0], tw[1]); g.y0 = g.y; g.st = 0.001; moving.add(g); }
      }
      // ambient fliers
      if ((ambT -= 0.2) <= 0) { ambT = 9 + Math.random() * 10; if (flying.length < 6) { const a = Math.random() * 6.28, d = 160; flying.push({ x: px + Math.cos(a) * d, y: 10 + Math.random() * 14, z: pz + Math.sin(a) * d, vx: -Math.cos(a + 0.4) * 8, vz: -Math.sin(a + 0.4) * 8, vy: 0, t: 3, cruise: 12 + Math.random() * 14, egret: Math.random() < 0.65, life: 40 }); } }
    }
    if ((scanT -= dt) <= 0) {
      scanT = 0.5; const ci0 = Math.floor(cam.x / CELL), cj0 = Math.floor(cam.z / CELL), rc = Math.ceil(R / CELL); let built = 0;
      for (const [k, c] of cells) { if (Math.hypot(c.cx - cam.x, c.cz - cam.z) > R + 140) { cells.delete(k); dirty = true; } }
      for (let dj = -rc; dj <= rc && built < 6; dj++) for (let di = -rc; di <= rc && built < 6; di++) {
        const ci = ci0 + di, cj = cj0 + dj, k = ci + ',' + cj; if (cells.has(k)) continue; const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL; if (Math.hypot(cx - cam.x, cz - cam.z) > R) continue;
        const c = genCell(ci, cj); c.cx = cx; c.cz = cz; cells.set(k, c); built++; dirty = true;
      }
      stats.cells = cells.size;
    }
    if (dirty) { dirty = false; rebuild(); }
  }
  return { update, group, stats, flush, cells };
}
