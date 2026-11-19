// Everglades r7: swamp water look over the open water of the glades (sloughs, channels, gator holes, the lakes).
// The shared ocean pass draws every water body; in the glades some of it is still classed as sea (clear, caustics,
// sandy bed). Here a thin tannin film is laid on that water near the camera:
//  - tea-black body with a sky reflection (Fresnel) and the ocean's slow ripple normals, the bed shows through only at the bank
//  - duckweed / algae scum and floating leaf litter drifting along the banks (per-vertex bank factor x world noise)
//  - lily pads (instanced, 4-pad atlas, one with a white water lily) in clumps along the banks and in the quiet bays
// Streamed in 64 m chunks within ~420 m (generator, ~1.5 ms per frame), one draw call for the film, one for the pads.
// ?gl7water=0 turns it off.
import * as THREE from 'three';
import { lilyTexture } from './textures.js';
import { hash2, vnoise } from './region.js';

const CH = 64, CELL = 4, R = 640, MAXPADS = 14000;

export function createSwampWater(game, G) {
  const SEA = G.SEA, Y = SEA + 0.014;
  const nt = game.env?.ocean?.uniforms?.tNormal?.value || null;
  let nmap = null; if (nt) { nmap = nt.clone(); nmap.wrapS = nmap.wrapT = THREE.RepeatWrapping; nmap.repeat.set(1 / 7, 1 / 7); nmap.needsUpdate = true; }
  const uT = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ name: 'gl7SwampFilm', color: 0x24170a, roughness: 0.05, metalness: 0, transparent: true, depthWrite: false, vertexColors: true,
    normalMap: nmap, normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 1.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGlW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vGlW; uniform float uGlT;
      float glH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float glN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(glH(i), glH(i + vec2(1, 0)), f.x), mix(glH(i + vec2(0, 1)), glH(i + vec2(1, 1)), f.x), f.y); }
      float glF(vec2 p) { return glN(p) * 0.55 + glN(p * 2.3 + 7.1) * 0.3 + glN(p * 5.1 - 3.7) * 0.15; }`)
      // duckweed / algae scum along the banks (vColor.r = bank factor), drifting very slowly; leaf litter specks
      .replace('#include <color_fragment>', `
        vec2 gp = vGlW.xz + vec2(uGlT * 0.05, uGlT * 0.03);
        float scumN = glF(gp * 0.11), bank = vColor.r;
        float scum = smoothstep(0.6, 0.78, scumN + bank * 0.3 - 0.08) * (0.15 + 0.6 * bank) * 0.85;
        float speck = 0.0;
        vec3 scumC = mix(vec3(0.03, 0.038, 0.012), vec3(0.055, 0.06, 0.018), glN(gp * 0.9));
        diffuseColor.rgb = mix(diffuseColor.rgb, scumC, scum);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.13, 0.06), speck * (1.0 - scum));
        float glScum = max(scum, speck * 0.6);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, glScum);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, normalize(vNormal), glScum));')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { float ndv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0); float fr = pow(1.0 - ndv, 5.0);
          // W4 (Nov 19 playtest: "Everglades crisp, water clarity"): clear tannin water. The bank shallows (vColor.r) let
          // the bed show through tea-tinted, the open sloughs stay dark; grazing views and scum stay opaque.
          float clearA = mix(0.9, 0.78, smoothstep(0.3, 0.9, bank));
          float a = mix(clearA, 0.97, fr);
          a = mix(a, 1.0, glScum);
          a *= 1.0 - smoothstep(${(R - 70).toFixed(1)}, ${(R - 10).toFixed(1)}, length(vViewPosition));
          gl_FragColor.a = a * vColor.a; }`);
  };
  mat.customProgramCacheKey = () => 'gl7-swamp-film';
  const group = new THREE.Group(); group.name = 'gl7SwampWater'; game.scene.add(group);

  // lily pads: flat quads, slightly cupped, instanced
  const padGeo = new THREE.PlaneGeometry(1, 1, 2, 2); padGeo.rotateX(-Math.PI / 2);
  { const p = padGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 0.04 * (1 - (x * x + z * z) * 2)); } padGeo.computeVertexNormals(); }
  const padMat = new THREE.MeshStandardMaterial({ name: 'gl7Lily', map: lilyTexture(), alphaTest: 0.5, roughness: 0.42, metalness: 0, side: THREE.DoubleSide });
  const padTile = new THREE.InstancedBufferAttribute(new Float32Array(MAXPADS * 2), 2);
  padGeo.setAttribute('aTile', padTile);
  padMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.5 + aTile;\n#endif');
  };
  padMat.customProgramCacheKey = () => 'gl7-lily';
  const pads = new THREE.InstancedMesh(padGeo, padMat, MAXPADS); pads.count = 0; pads.frustumCulled = false; pads.receiveShadow = true; pads.castShadow = false; pads.name = 'gl7LilyPads';
  group.add(pads);

  const chunks = new Map(); let job = null, padsDirty = false;
  const stats = { chunks: 0, verts: 0, pads: 0, buildMs: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function* buildChunk(cx, cz) {
    const n = CH / CELL + 1, N = n * n, w = new Uint8Array(N); let t0 = performance.now(), any = false;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) { const x = cx * CH + i * CELL, z = cz * CH + j * CELL; if (G.isWater(x, z) && G.inGlades(x, z)) { w[j * n + i] = 1; any = true; } }
      if (performance.now() - t0 > 1.5) { stats.buildMs += performance.now() - t0; yield; t0 = performance.now(); }
    }
    if (!any) return null;
    // bank factor: share of land within ~12 m (a 3-cell neighborhood, edge cells probe the world)
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), bankA = new Float32Array(N);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i, x = cx * CH + i * CELL, z = cz * CH + j * CELL; let land = 0, tot = 0;
        for (let dj = -3; dj <= 3; dj += 1) for (let di = -3; di <= 3; di += 1) { if (di * di + dj * dj > 9) continue; const ii = i + di, jj = j + dj; tot++;
          if (ii >= 0 && jj >= 0 && ii < n && jj < n) { if (!w[jj * n + ii]) land++; } else if (!G.isWater(x + di * CELL, z + dj * CELL)) land++; }
        const bank = Math.min(1, (land / tot) * 2.2); bankA[k] = bank;
        pos[k * 3] = x; pos[k * 3 + 1] = Y; pos[k * 3 + 2] = z; col[k * 4] = bank; col[k * 4 + 1] = 1; col[k * 4 + 2] = 1; col[k * 4 + 3] = 1;
      }
      if (performance.now() - t0 > 1.5) { stats.buildMs += performance.now() - t0; yield; t0 = performance.now(); }
    }
    const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; if (w[a] + w[b] + w[c] + w[d] > 0) idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx);
    const nrm = new Float32Array(N * 3); for (let k = 0; k < N; k++) nrm[k * 3 + 1] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.renderOrder = -3; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
    // lily pads: clumps in the bank zone and in quiet bays (noise), 0-5 pads per 2.5 m cell
    const P = [];
    for (let j = 0; j < CH / 2.5; j++) for (let i = 0; i < CH / 2.5; i++) {
      const gx = cx * CH + i * 2.5, gz = cz * CH + j * 2.5, ci = Math.min(n - 1, Math.round((gx - cx * CH) / CELL)), cj = Math.min(n - 1, Math.round((gz - cz * CH) / CELL));
      if (!w[cj * n + ci]) continue;
      const bank = bankA[cj * n + ci], cl = vnoise(gx / 17 + 3.1, gz / 17 - 8.4) * 0.7 + vnoise(gx / 6, gz / 6) * 0.3, want = (cl + bank * 0.45 - 0.68) * 9;
      if (want <= 0 || bank < 0.08) continue;
      const cnt = Math.min(5, Math.floor(want + hash2(i + cx * 97, j + cz * 89, 3)));
      for (let q = 0; q < cnt; q++) {
        const x = gx + (hash2(i, j, q * 5 + cx) - 0.5) * 2.6, z = gz + (hash2(j, i, q * 7 + cz) - 0.5) * 2.6; if (!G.isWater(x, z)) continue;
        const s = 0.42 + hash2(i + q, j, 9) * 0.5, t = hash2(i, j + q, 11); P.push(x, z, s, hash2(q, i, j) * 6.28, t < 0.07 ? 3 : (t * 3) | 0);
      }
    }
    return { mesh: m, pads: new Float32Array(P) };
  }
  function rebuildPads() {
    let n = 0; const arr = pads.instanceMatrix.array, tile = padTile.array;
    for (const c of chunks.values()) { if (!c) continue; const P = c.pads;
      for (let k = 0; k < P.length && n < MAXPADS; k += 5) {
        _q.setFromAxisAngle(UP, P[k + 3]); _s.set(P[k + 2], 1, P[k + 2]); _p.set(P[k], Y + 0.006 + (n % 7) * 0.0012, P[k + 1]); _m.compose(_p, _q, _s); _m.toArray(arr, n * 16);
        const t = P[k + 4]; tile[n * 2] = (t % 2) * 0.5; tile[n * 2 + 1] = t < 2 ? 0.5 : 0; n++; } }
    pads.count = n; pads.instanceMatrix.needsUpdate = true; padTile.needsUpdate = true; stats.pads = n;
  }
  let scanT = 0;
  function update(dt, cam, active) {
    uT.value += dt; if (nmap) { nmap.offset.x = (uT.value * 0.003) % 1; nmap.offset.y = (uT.value * 0.002) % 1; }
    if (job) {
      const t0 = performance.now();
      try { while (performance.now() - t0 < 2.5) { const r = job.it.next(); if (r.done) { const v = r.value; chunks.set(job.key, v); if (v) { group.add(v.mesh); stats.verts += v.mesh.geometry.attributes.position.count; padsDirty = true; } job = null; scanT = 0; break; } } }
      catch (e) { console.warn('[everglades] water chunk', e); chunks.set(job.key, null); job = null; }
      return;
    }
    if (padsDirty) { padsDirty = false; rebuildPads(); }
    if ((scanT -= dt) > 0) return; scanT = 0.3;
    const ccx = Math.floor(cam.x / CH), ccz = Math.floor(cam.z / CH), rc = Math.ceil(R / CH);
    for (const [k, v] of chunks) { const [x, z] = k.split(',').map(Number); if (Math.hypot((x + 0.5) * CH - cam.x, (z + 0.5) * CH - cam.z) > R + 100) { if (v) { group.remove(v.mesh); stats.verts -= v.mesh.geometry.attributes.position.count; v.mesh.geometry.dispose(); padsDirty = true; } chunks.delete(k); } }
    if (!active) { stats.chunks = 0; return; }
    let best = null, bd = 1e9;
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const x = ccx + dx, z = ccz + dz, k = x + ',' + z; if (chunks.has(k)) continue;
      const mx = (x + 0.5) * CH, mz = (z + 0.5) * CH, d = Math.hypot(mx - cam.x, mz - cam.z); if (d > R || d >= bd) continue;
      if (!G.inGlades(mx, mz) && !G.inGlades(x * CH, z * CH) && !G.inGlades((x + 1) * CH, (z + 1) * CH)) { chunks.set(k, null); continue; }
      best = [x, z, k]; bd = d;
    }
    if (best) job = { key: best[2], it: buildChunk(best[0], best[1]) };
    stats.chunks = [...chunks.values()].filter(Boolean).length;
  }
  return { update, group, stats, material: mat };
}
