// Everglades r7: ground mist over the water and the wet prairie. Thick at dawn (it burns off by ~10:00), a thin veil
// after dusk and at night. World-anchored soft puffs (cylindrical billboards, lit like the ground so dawn mist takes the
// low sun's color), deterministic per 80 m cell, within ~360 m; faded out near the camera so you never see a card edge.
import * as THREE from 'three';
import { mistTexture } from './textures.js';
import { hash2 } from './region.js';

const CELL = 80, R = 360, MAX = 420;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function mistAmount(h) { // 0..1 by hour of day
  return Math.max(ss(4.6, 6.0, h) * (1 - ss(8.0, 10.2, h)), 0.32 * ss(19.2, 21.5, h), 0.32 * (1 - ss(3.0, 4.6, h)));
}

export function createMist(game, G) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  { const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }
  const mat = new THREE.MeshBasicMaterial({ name: 'gl7Mist', map: mistTexture(), color: 0xe9ecef, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide, fog: true });
  mat.defines = { NO_WET: '' };
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vMistK;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]); vec2 d = cameraPosition.xz - ip.xz; float L = max(length(d), 0.001); d /= L;
          transformed = vec3(-d.y * position.x, position.y, d.x * position.x);
          vMistK = (1.0 - 0.8 * smoothstep(4.0, 30.0, cameraPosition.y - ip.y)) * smoothstep(10.0, 45.0, L) * (1.0 - smoothstep(${(R - 80).toFixed(1)}, ${R.toFixed(1)}, L)); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMistK;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vMistK;');
  };
  mat.customProgramCacheKey = () => 'gl7-mist';
  const mesh = new THREE.InstancedMesh(geo, mat, MAX); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 5; mesh.name = 'gl7Mist';
  game.scene.add(mesh);
  const cells = new Map(), stats = { puffs: 0, amount: 0 };
  function gen(ci, cj) {
    const out = [], x0 = ci * CELL, z0 = cj * CELL; if (!G.inGlades(x0 + CELL / 2, z0 + CELL / 2)) return out;
    for (let k = 0; k < 3; k++) { const x = x0 + hash2(ci, cj, k + 3) * CELL, z = z0 + hash2(cj, ci, k + 9) * CELL; if (!G.isWater(x, z) && !G.wetLayer(x, z)) continue; if (hash2(ci, k, cj) > 0.75) continue;
      const w = 26 + hash2(k, ci, cj) * 40; out.push([x, G.SEA - 0.3 + hash2(cj, k, ci) * 0.8, z, w, 3.5 + hash2(ci + k, cj, 7) * 5]); }
    return out;
  }
  const _m = new THREE.Matrix4();
  function rebuild() { let n = 0; for (const c of cells.values()) for (const p of c) { if (n >= MAX) break; _m.makeScale(p[3], p[4], p[3]); _m.setPosition(p[0], p[1], p[2]); _m.toArray(mesh.instanceMatrix.array, n * 16); n++; } mesh.count = n; mesh.instanceMatrix.needsUpdate = true; stats.puffs = n; }
  let scanT = 0;
  function update(dt, cam, active) {
    const h = (((game.timeOfDay ?? 12) % 24) + 24) % 24, a = active ? mistAmount(h) * (game.weather?.kind === 'rain' ? 0.6 : 1) : 0;
    mat.opacity = a * 0.8; mesh.visible = a > 0.01; stats.amount = +a.toFixed(2);
    if (mesh.visible) { const env = game.env, sc = env?.sun?.color, df = env?.dayFactor ?? 1; // unlit puffs take the light's color: warm at dawn, gray-blue at night
      const k = 0.25 + 0.75 * Math.min(1, df * 1.4); if (sc) mat.color.setRGB((0.62 + 0.38 * sc.r) * k, (0.64 + 0.36 * sc.g) * k, (0.68 + 0.32 * sc.b) * k); }
    if (!mesh.visible) { if (cells.size && !active) { cells.clear(); rebuild(); } return; }
    if ((scanT -= dt) > 0) return; scanT = 0.8;
    const ci0 = Math.floor(cam.x / CELL), cj0 = Math.floor(cam.z / CELL), rc = Math.ceil(R / CELL); let d = false;
    for (const k of cells.keys()) { const [i, j] = k.split(',').map(Number); if (Math.hypot((i + 0.5) * CELL - cam.x, (j + 0.5) * CELL - cam.z) > R + 100) { cells.delete(k); d = true; } }
    for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) { const ci = ci0 + di, cj = cj0 + dj, k = ci + ',' + cj; if (cells.has(k) || Math.hypot((ci + 0.5) * CELL - cam.x, (cj + 0.5) * CELL - cam.z) > R) continue; cells.set(k, gen(ci, cj)); d = true; }
    if (d) rebuild();
  }
  return { update, stats, mesh };
}
