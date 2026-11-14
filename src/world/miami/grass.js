// Miami city — near-camera 3D grass: instanced alpha-card tufts on grass surfaces within ~40 m of the camera.
// Wind sway + distance fade in the vertex shader; beyond the fade the textured grass ground takes over.
// Placement is cached per 8 m cell (stable hashed jitter), so moving the camera only concatenates cached cells.
import * as THREE from 'three';

const R = 30, CELL = 8, STEP = 0.44, MAX = 20000;

function bladeTexture() { // 512 x 256 atlas: left = mixed grass blades (thin / broad / seed heads), right = blades with clover, daisies and small weeds
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  let s = 1234; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const blade = (ox, bx, h, lean, w, hue, l, sat) => { const g = x.createLinearGradient(0, 256, 0, 256 - h); g.addColorStop(0, `hsl(${hue + 6},${sat}%,${l * 0.45}%)`); g.addColorStop(0.5, `hsl(${hue},${sat}%,${l}%)`); g.addColorStop(1, `hsl(${hue - 10},${sat - 8}%,${l + 16}%)`);
    x.fillStyle = g; x.beginPath(); x.moveTo(ox + bx - w / 2, 256); x.quadraticCurveTo(ox + bx + lean * 0.35, 256 - h * 0.62, ox + bx + lean, 256 - h); x.quadraticCurveTo(ox + bx + lean * 0.35 + w * 0.25, 256 - h * 0.62, ox + bx + w / 2, 256); x.fill(); };
  for (const ox of [0, 256]) for (let i = 0; i < 230; i++) { const tall = r() < 0.18; blade(ox, 4 + r() * 248, tall ? 150 + r() * 100 : 60 + r() * 120, (r() - 0.5) * 60, tall ? 2 + r() * 2 : 3 + r() * 6, 72 + r() * 40, 22 + r() * 24, 38 + r() * 26); }
  for (let i = 0; i < 14; i++) { const bx = 10 + r() * 236, top = 40 + r() * 70; x.strokeStyle = '#8a8a52'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx, 256); x.quadraticCurveTo(bx + 4, 150, bx + (r() - 0.5) * 30, top); x.stroke(); for (let k = 0; k < 7; k++) { x.fillStyle = `hsl(48,${30 + r() * 20}%,${55 + r() * 15}%)`; x.beginPath(); x.ellipse(bx + (r() - 0.5) * 10, top + k * 6, 2.5, 5, 0.3, 0, 7); x.fill(); } } // seed heads
  for (let i = 0; i < 60; i++) { const fx = 256 + 10 + r() * 236, fy = 120 + r() * 120, kind = r(); // flowers / clover in the right half
    if (kind < 0.4) { x.fillStyle = '#f4f1e6'; for (let p = 0; p < 7; p++) { x.beginPath(); x.ellipse(fx + Math.cos(p * 0.9) * 5, fy + Math.sin(p * 0.9) * 5, 4, 2, p * 0.9, 0, 7); x.fill(); } x.fillStyle = '#e8b923'; x.beginPath(); x.arc(fx, fy, 2.5, 0, 7); x.fill(); }
    else if (kind < 0.7) { x.fillStyle = '#f2c41e'; x.beginPath(); x.arc(fx, fy, 4.5, 0, 7); x.fill(); x.fillStyle = '#d99a0c'; x.beginPath(); x.arc(fx, fy, 1.8, 0, 7); x.fill(); }
    else { x.fillStyle = `hsl(110,40%,${28 + r() * 10}%)`; for (let p = 0; p < 3; p++) { x.beginPath(); x.arc(fx + Math.cos(p * 2.1) * 4, fy + Math.sin(p * 2.1) * 4, 4.5, 0, 7); x.fill(); } } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGrassField({ M, root, data, lawnAt = null, lawnTester = null }) {
  const surf = data?.surfaceAt, gh = data?.groundHeightAt;
  // tuft: 3 crossed cards, 1.1 m wide x 0.42 m tall (base at y=0)
  const parts = [];
  // 4 cards of different size / tilt / offset per tuft (no regular star pattern); uv u in [0, 0.5] (variant picks the half in the shader)
  let ss = 99; const rr = () => ((ss = (ss * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 4; k++) { const w = 0.2 + rr() * 0.16, h = 0.2 + rr() * 0.16, p = new THREE.PlaneGeometry(w, h); /* vegetation track: smaller cards = finer blades */ p.translate(0, h / 2, 0); p.rotateX((rr() - 0.5) * 0.45); p.rotateY(rr() * Math.PI); p.translate((rr() - 0.5) * 0.3, 0, (rr() - 0.5) * 0.3); parts.push(p); }
  const pos = [], nor = [], uv = [], idx = []; let base = 0;
  for (const p of parts) {
    const P = p.attributes.position, U = p.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(0, 1, 0); uv.push(U.getX(i) * 0.5, U.getY(i)); }
    for (let i = 0; i < p.index.count; i++) idx.push(base + p.index.getX(i));
    base += P.count; p.dispose();
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xc8dca0 });
  const timeU = M.timeU || { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindTime = timeU;
    sh.vertexShader = 'uniform float uWindTime;\nvarying float vGv;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vGv = length(instanceMatrix[0].xyz) > 1.004 ? 1.0 : 0.0;
        #ifdef USE_MAP
          vMapUv.x += vGv * 0.5;
        #endif
      #endif`).replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 gIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float gD = distance(gIp.xz, cameraPosition.xz);
        float gFade = 1.0 - smoothstep(${(R - 12).toFixed(1)}, ${(R - 1).toFixed(1)}, gD);
        transformed.y *= gFade;
        float gPh = gIp.x * 0.31 + gIp.z * 0.23;
        float gWave = sin(dot(gIp.xz, vec2(0.11, 0.07)) - uWindTime * 1.4) * 0.5 + 0.5; // rolling gust waves across the lawn
        float gW = (sin(uWindTime * 2.1 + gPh) * 0.35 + sin(uWindTime * 3.7 + gPh * 1.9) * 0.15 + gWave * 0.6) * transformed.y * 0.38;
        transformed.x += gW; transformed.z += gW * 0.5;
      #endif`);
    sh.fragmentShader = 'varying float vGv;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
        diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 0.55, vMapUv.y)); // ground occlusion at the blade base
      #endif`);
  };
  M.grassBlades = mat; // precompiled with the other city materials
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'grassBlades';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color());
  root.add(mesh);

  const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // cell cache: ready-made instance matrices + colours (bulk-copied into the InstancedMesh); max 4 new cells per frame
  const cells = new Map(), EMPTY = { m: new Float32Array(0), c: new Float32Array(0), n: 0 }; let pendingCells = false, built = 0;
  function cell(ci, cj) {
    const key = ci * 100003 + cj; let c = cells.get(key); if (c) { cells.delete(key); cells.set(key, c); return c; }
    if (built >= 1) { pendingCells = true; return EMPTY; }
    const test = lawnTester ? lawnTester(ci * CELL, cj * CELL, ci * CELL + CELL, cj * CELL + CELL) : null;
    if (lawnTester && test === null) { pendingCells = true; return EMPTY; } // tile not built yet: don't cache
    built++;
    const mm = [], cc = [];
    if (surf) for (let x = 0; x < CELL; x += STEP) for (let z = 0; z < CELL; z += STEP) {
      const i = Math.round(x / STEP), j = Math.round(z / STEP), h1 = hash(ci * 64 + i, cj * 64 + j), h2 = hash(cj * 64 + j + 7, ci * 64 + i + 3);
      const wx = ci * CELL + x + (h1 - 0.5) * STEP * 0.9, wz = cj * CELL + z + (h2 - 0.5) * STEP * 0.9;
      const s = surf(wx, wz), lawn = test ? test(wx, wz) : null;
      if (lawn === false || (lawn === null && s !== 'grass_short' && s !== 'grass_long')) continue;
      if (s === 'water' || s === 'asphalt') continue;
      const y = gh ? gh(wx, wz) : 0; if (!(y > -0.5 && y < 0.3)) continue; // ground-level lawns only
      let edge = 1; if (test) for (const [ox, oz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) if (!test(wx + ox, wz + oz)) edge = Math.min(edge, 0.45); // thin out towards lawn edges
      const patch = Math.sin(wx * 0.045 + Math.sin(wz * 0.03) * 2) * Math.cos(wz * 0.05 - wx * 0.02) * 0.5 + 0.5; // lush / dry patches
      const a = h1 * 6.28, flower = hash(ci * 977 + i, cj * 131 + j) < 0.07 + patch * 0.05, sxz = flower ? 1.012 : 1, co = Math.cos(a) * sxz, si = Math.sin(a) * sxz, sy = ((s === 'grass_long' ? 1.25 : 0.6) + h2 * 0.55) * (0.75 + patch * 0.35) * edge;
      mm.push(co, 0, -si, 0, 0, sy, 0, 0, si, 0, co, 0, wx, y + 0.012, wz, 1);
      const dry = Math.max(0, 0.6 - patch) * 0.9; cc.push(0.82 + h1 * 0.25 + dry * 0.35, 0.92 + h1 * 0.12 - dry * 0.05, 0.62 + h1 * 0.2 - dry * 0.25);
    }
    c = { m: new Float32Array(mm), c: new Float32Array(cc), n: cc.length / 3 }; cells.set(key, c);
    if (cells.size > 400) cells.delete(cells.keys().next().value);
    return c;
  }
  const last = { x: 1e9, z: 1e9 };
  function update(cam) {
    const cx = cam.position.x, cz = cam.position.z;
    if (cam.position.y > 120) { mesh.count = 0; return; }
    if ((cx - last.x) ** 2 + (cz - last.z) ** 2 < 9 && !pendingCells) return;
    last.x = cx; last.z = cz; pendingCells = false; built = 0;
    let n = 0; const M4 = mesh.instanceMatrix.array, C3 = mesh.instanceColor.array;
    const c0 = Math.floor((cx - R) / CELL), c1 = Math.floor((cx + R) / CELL), d0 = Math.floor((cz - R) / CELL), d1 = Math.floor((cz + R) / CELL);
    for (let ci = c0; ci <= c1; ci++) for (let cj = d0; cj <= d1; cj++) {
      const ex = Math.max(ci * CELL - cx, 0, cx - (ci + 1) * CELL), ez = Math.max(cj * CELL - cz, 0, cz - (cj + 1) * CELL);
      if (ex * ex + ez * ez > R * R) continue;
      const a = cell(ci, cj); if (!a.n || n + a.n > MAX) continue;
      M4.set(a.m, n * 16); C3.set(a.c, n * 3); n += a.n;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  }
  return { mesh, update, dispose() { root.remove(mesh); mesh.dispose(); geo.dispose(); mat.map.dispose(); mat.dispose(); } };
}
