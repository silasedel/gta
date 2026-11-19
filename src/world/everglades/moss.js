// Everglades r7: Spanish moss hanging from the cypress, oaks and gumbo limbo of the glades (not palms).
// Curtains of strands (two crossed cards, alpha tested) hung inside each crown near the camera, swaying a little in the wind.
// One InstancedMesh, refilled from the countryside trees (game.vegetation.countryside.treesNear) when the camera has moved.
import * as THREE from 'three';
import { mossTexture } from './textures.js';
import { hash2 } from './region.js';

const R = 150, MAX = 9000;
// per tree kind: [curtains min, extra, crown height band lo..hi (share of the model height), crown radius (share of height)]
const KIND = { cypress: [7, 8, 0.42, 0.86, 0.2], liveoak: [9, 10, 0.4, 0.78, 0.42], banyan: [7, 6, 0.4, 0.75, 0.4], gumbo: [3, 4, 0.45, 0.8, 0.3], mangrove: [1, 2, 0.4, 0.7, 0.3], oak: [8, 8, 0.4, 0.78, 0.4], shade: [4, 4, 0.45, 0.8, 0.35] };

export function createMoss(game, G) {
  const geo = new THREE.BufferGeometry();
  { // two crossed cards 1 x 1, hanging from y = 0 down to y = -1, a slight bow outward
    const P = [], U = [], I = [];
    for (let c = 0; c < 2; c++) {
      const a = c * Math.PI / 2 + 0.4, dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5, b = P.length / 3;
      for (let r = 0; r <= 4; r++) { const v = r / 4, y = -v, bow = Math.sin(v * Math.PI) * 0.08; for (const s of [-1, 1]) { P.push(dx * s * (1 - 0.35 * v) - dz * bow, y, dz * s * (1 - 0.35 * v) + dx * bow); U.push(s < 0 ? 0 : 1, 1 - v); } }
      for (let r = 0; r < 4; r++) { const k = b + r * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I);
    const N = new Float32Array(P.length); for (let i = 0; i < N.length; i += 3) N[i + 1] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); // lit like foliage from above
  }
  const uT = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ name: 'gl7Moss', map: mossTexture(), color: 0xc4c7b2, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGlT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float hang = -position.y; vec3 o = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          float ph = o.x * 0.37 + o.z * 0.23; transformed.x += sin(uGlT * 1.3 + ph) * 0.06 * hang * hang; transformed.z += cos(uGlT * 1.1 + ph * 1.7) * 0.05 * hang * hang; }`);
  };
  mat.customProgramCacheKey = () => 'gl7-moss';
  const mesh = new THREE.InstancedMesh(geo, mat, MAX); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'gl7Moss';
  game.scene.add(mesh);
  const stats = { trees: 0, curtains: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let lastX = 1e9, lastZ = 1e9, lastN = -1, t = 0;
  function heightOf(kind) { const md = game.city?.flora?.models?.[kind]; return md?.height || (kind === 'cypress' ? 16 : 10); }
  function fill(cam) {
    const cs = game.vegetation?.countryside, cy = game.everglades?.parts?.cypress;
    const trees = cs?.treesNear ? cs.treesNear(cam.x, cam.z, R) : []; let n = 0; const arr = mesh.instanceMatrix.array;
    // the glades' own cypress domes (cypress.js): moss on most of them, longer and lower in the old ones
    if (cy?.treesNear) for (const tr of cy.treesNear(cam.x, cam.z, R)) {
      const ix = Math.round(tr.x * 3), iz = Math.round(tr.z * 3); if (hash2(ix, iz, 2) < 0.25) continue;
      const cnt = 3 + Math.floor(hash2(ix, iz, 1) * 9 * Math.min(1, tr.H / 20));
      for (let q = 0; q < cnt && n < MAX; q++) {
        const a = hash2(ix, iz, 10 + q) * 6.283, rr = tr.H * 0.13 * (0.3 + 0.7 * Math.sqrt(hash2(iz, ix, 30 + q))), hy = tr.H * (0.48 + 0.42 * hash2(ix + q, iz, 50));
        const len = (1.0 + hash2(q, ix, iz) * 2.2) * (0.6 + tr.H / 40), wid = 0.5 + hash2(iz, q, ix) * 0.5;
        _p.set(tr.x + Math.cos(a) * rr, tr.y + hy, tr.z + Math.sin(a) * rr); _q.setFromAxisAngle(UP, hash2(ix, q, 70) * 6.283); _s.set(wid, len, wid); _m.compose(_p, _q, _s); _m.toArray(arr, n * 16); n++;
      }
    }
    for (const tr of trees) {
      if (tr.palm || n >= MAX) continue; const base = tr.kind.replace(/_.*$/, ''), K = KIND[tr.kind] || KIND[base] || (/oak/.test(tr.kind) ? KIND.oak : null); if (!K) continue;
      if (!G.inGlades(tr.x, tr.z)) continue;
      const H = heightOf(tr.kind) * (tr.s || 1), ix = Math.round(tr.x * 3), iz = Math.round(tr.z * 3), cnt = K[0] + Math.floor(hash2(ix, iz, 1) * K[1]);
      if (hash2(ix, iz, 2) < 0.12) continue; // a few clean trees
      for (let q = 0; q < cnt && n < MAX; q++) {
        const a = hash2(ix, iz, 10 + q) * 6.283, rr = H * K[4] * (0.25 + 0.75 * Math.sqrt(hash2(iz, ix, 30 + q))), hy = H * (K[2] + (K[3] - K[2]) * hash2(ix + q, iz, 50));
        const len = (1.1 + hash2(q, ix, iz) * 2.4) * (0.7 + H / 40), wid = 0.55 + hash2(iz, q, ix) * 0.6;
        _p.set(tr.x + Math.cos(a) * rr, tr.y + hy, tr.z + Math.sin(a) * rr); _q.setFromAxisAngle(UP, hash2(ix, q, 70) * 6.283); _s.set(wid, len, wid);
        _m.compose(_p, _q, _s); _m.toArray(arr, n * 16); n++;
      }
      stats.trees++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; stats.curtains = n; lastN = trees.length;
  }
  let chkT = 0;
  function update(dt, cam, active) {
    uT.value += dt; t += dt;
    if (!active) { if (mesh.count) { mesh.count = 0; lastX = 1e9; } return; }
    if ((chkT -= dt) > 0) return; chkT = 1.0;
    const cs = game.vegetation?.countryside; const nNow = cs?.treesNear ? -2 : -1;
    const moved = Math.hypot(cam.x - lastX, cam.z - lastZ);
    if (moved > 30 || (moved > 4 && t > 3 && stats.curtains < 50)) { stats.trees = 0; fill(cam); lastX = cam.x; lastZ = cam.z; t = 0; }
    void nNow;
  }
  return { update, mesh, stats, refill: () => { lastX = 1e9; } };
}
