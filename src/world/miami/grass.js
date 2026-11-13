// Miami city — near-camera 3D grass: instanced alpha-card tufts on grass surfaces within ~40 m of the camera.
// Wind sway + distance fade in the vertex shader; beyond the fade the textured grass ground takes over.
// Placement is cached per 8 m cell (stable hashed jitter), so moving the camera only concatenates cached cells.
import * as THREE from 'three';

const R = 30, CELL = 8, STEP = 0.5, MAX = 16000;

function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  let s = 1234; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 150; i++) {
    const bx = 4 + r() * 248, h = 40 + r() * 86, lean = (r() - 0.5) * 34, w = 3 + r() * 4;
    const l = 22 + r() * 22, hue = 78 + r() * 34;
    const g = x.createLinearGradient(0, 128, 0, 128 - h); g.addColorStop(0, `hsl(${hue},45%,${l * 0.55}%)`); g.addColorStop(1, `hsl(${hue - 8},${40 + r() * 20}%,${l + 14}%)`);
    x.fillStyle = g; x.beginPath(); x.moveTo(bx - w / 2, 128); x.quadraticCurveTo(bx + lean * 0.4, 128 - h * 0.6, bx + lean, 128 - h); x.quadraticCurveTo(bx + lean * 0.4 + w * 0.3, 128 - h * 0.6, bx + w / 2, 128); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGrassField({ M, root, data, lawnAt = null, lawnTester = null }) {
  const surf = data?.surfaceAt, gh = data?.groundHeightAt;
  // tuft: 3 crossed cards, 1.1 m wide x 0.42 m tall (base at y=0)
  const parts = [];
  for (let k = 0; k < 3; k++) { const p = new THREE.PlaneGeometry(0.55, 0.4); p.translate(0, 0.2, 0); p.rotateX((k - 1) * 0.18); p.rotateY((k / 3) * Math.PI + k * 0.4); parts.push(p); }
  const pos = [], nor = [], uv = [], idx = []; let base = 0;
  for (const p of parts) {
    const P = p.attributes.position, U = p.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(0, 1, 0); uv.push(U.getX(i), U.getY(i)); }
    for (let i = 0; i < p.index.count; i++) idx.push(base + p.index.getX(i));
    base += P.count; p.dispose();
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xc8dca0 });
  const timeU = M.timeU || { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindTime = timeU;
    sh.vertexShader = 'uniform float uWindTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 gIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float gD = distance(gIp.xz, cameraPosition.xz);
        float gFade = 1.0 - smoothstep(${(R - 12).toFixed(1)}, ${(R - 1).toFixed(1)}, gD);
        transformed.y *= gFade;
        float gPh = gIp.x * 0.31 + gIp.z * 0.23;
        float gW = (sin(uWindTime * 2.1 + gPh) * 0.6 + sin(uWindTime * 3.7 + gPh * 1.9) * 0.3) * transformed.y * 0.35;
        transformed.x += gW; transformed.z += gW * 0.5;
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
      const a = h1 * 6.28, co = Math.cos(a), si = Math.sin(a), sy = (s === 'grass_long' ? 1.2 : 0.55) + h2 * 0.45;
      mm.push(co, 0, -si, 0, 0, sy, 0, 0, si, 0, co, 0, wx, y + 0.012, wz, 1);
      cc.push(0.85 + h1 * 0.3, 0.9 + h1 * 0.15, 0.7 + h1 * 0.2);
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
