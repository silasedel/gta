// r2-water: Everglades sheet water. The "river of grass" is a few centimeters to a foot of slow water over the sawgrass
// prairie and marsh, with deeper sloughs and dry tussock / mud-flat patches. The city data has the glades as dry land (the
// sawgrass / marsh terrain layers at about y = 0), so this lays a water sheet over those layers near the camera:
//  - level = the local mean ground (+-9 m) + 5 cm, +4 cm in sloughs, -16 cm on dry patches: the micro-relief lows hold
//    water, highs and tussocks stay dry, and the edge fades with the depth (no hard waterline)
//  - levelAt(x, z) gives the same surface to the physics (airboats glide on it; anything else just gets wet feet)
//  - drawn as tea-dark freshwater with sky reflection (Fresnel) and the ocean's ripple normals, streamed in 48 m chunks
//    within ~300 m (the ground shader's wet patches carry the look farther out)
// ?glades=0 turns it off. r7b (everglades pass): thinner from above, browner, softer edges.
import * as THREE from 'three';
import { vnoise } from '../terrain/terrain.js';

const GL_DIST = /^(Everglades|Everglades City|Big Cypress)$/;
const CH = 48, CELL = 3, R = 300;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createGladesWater(game, opts = {}) {
  const city = game.city; if (!city?.terrain?.layerAt || !city.districtAt) return null;
  const LK = city.terrain.LAYERS.map((l) => l.key);
  const gh = (x, z) => city.groundHeightAt(x, z, 3);
  // ---------- the surface function (cached per 2 m cell for the physics)
  const cache = new Map();
  function wetLayer(x, z) { const k = LK[city.terrain.layerAt(x, z)]; return k === 'sawgrass' ? 1 : k === 'marsh' ? 1 : 0; }
  function inGlades(x, z) { const d = city.districtAt(x, z); return !!d && GL_DIST.test(d); }
  function fields(x, z) {
    const dry = ss(0.6, 0.74, vnoise(x / 46, z / 46) * 0.7 + vnoise(x / 13 + 9.1, z / 13 - 4.7) * 0.3);
    const slough = ss(0.56, 0.8, vnoise((x + 500) / 95, z / 175 + 3.3));
    return { dry, slough };
  }
  // returns [level, ground, slough] or null (dry / not glades / open water)
  function evalAt(x, z) {
    if (city.isWater(x, z) || !inGlades(x, z) || !wetLayer(x, z)) return null;
    const g0 = gh(x, z);
    if (!(g0 < 1.2)) return null; // raised roads, levees, tree islands on fill
    const gm = (gh(x + 9, z) + gh(x - 9, z) + gh(x, z + 9) + gh(x, z - 9)) / 4;
    const { dry, slough } = fields(x, z);
    const lv = Math.min(gm, g0 + 0.25) + 0.05 + 0.04 * slough - 0.16 * dry;
    return [lv, g0, slough];
  }
  function levelAt(x, z) {
    const k = Math.round(x / 2) * 100003 + Math.round(z / 2);
    let v = cache.get(k);
    if (v === undefined) { const e = evalAt(Math.round(x / 2) * 2, Math.round(z / 2) * 2); v = e && e[0] > e[1] - 0.01 ? e[0] : null; if (cache.size > 60000) cache.clear(); cache.set(k, v); }
    return v;
  }
  // ---------- rendering
  const nt = game.env?.ocean?.uniforms?.tNormal?.value || null;
  let nmap = null; if (nt) { nmap = nt.clone(); nmap.wrapS = nmap.wrapT = THREE.RepeatWrapping; nmap.repeat.set(1 / 9, 1 / 9); nmap.needsUpdate = true; }
  const mat = new THREE.MeshStandardMaterial({ name: 'gladesWater', color: 0x2b2416, roughness: 0.08, metalness: 0, transparent: true, depthWrite: false, vertexColors: true,
    normalMap: nmap, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const uFade = { value: R - 50 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGwFade = uFade;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGwFade;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { float ndv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0); float fr = pow(1.0 - ndv, 4.0);
          // r7b (everglades): seen from above the sheet is a thin film over the sawgrass and peat (it read as black blotches
          // from the air); at grazing angles it is the sky's reflection on the flooded prairie
          gl_FragColor.a = clamp(gl_FragColor.a * mix(1.0, 0.38, smoothstep(0.35, 0.9, ndv)) + fr * 0.45 * step(0.02, vColor.a), 0.0, 1.0) * (1.0 - smoothstep(uGwFade, uGwFade + 50.0, length(vViewPosition))); }`);
  };
  mat.customProgramCacheKey = () => 'r2water-glades';
  const group = new THREE.Group(); group.name = 'gladesWater'; group.renderOrder = -4; game.scene.add(group);
  const chunks = new Map(); let job = null; const stats = { chunks: 0, verts: 0, buildMs: 0 };
  function* buildChunk(cx, cz) {
    const n = CH / CELL + 1, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 4); let any = false, t0 = performance.now();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = cx * CH + i * CELL, z = cz * CH + j * CELL, k = j * n + i, e = evalAt(x, z);
        let y, a = 0;
        if (e) { const d = e[0] - e[1]; y = e[0]; a = ss(-0.01, 0.09, d) * (0.42 + 0.4 * e[2] + 0.12 * ss(0.05, 0.2, d)); if (a > 0.01) any = true; } // r7b: gentler edge ramp (no hard dark outlines)
        else { y = gh(x, z) - 0.05; }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; col[k * 4] = 1; col[k * 4 + 1] = 1; col[k * 4 + 2] = 1; col[k * 4 + 3] = a;
      }
      if (performance.now() - t0 > 1.5) { stats.buildMs += performance.now() - t0; yield; t0 = performance.now(); }
    }
    stats.buildMs += performance.now() - t0;
    if (!any) return null;
    const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      if (col[a * 4 + 3] + col[b * 4 + 3] + col[c * 4 + 3] + col[d * 4 + 3] > 0.02) idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx);
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; m.renderOrder = -4; m.matrixAutoUpdate = false;
    return m;
  }
  let scanT = 0, t = 0;
  function update(dt) {
    t += dt;
    if (nmap) { nmap.offset.x = (t * 0.004) % 1; nmap.offset.y = (t * 0.0025) % 1; }
    const cam = game.camera?.position; if (!cam) return;
    if (job) {
      const t0 = performance.now();
      try { while (performance.now() - t0 < 2) { const r = job.it.next(); if (r.done) { const m = r.value; chunks.set(job.key, m); if (m) { group.add(m); stats.verts += m.geometry.attributes.position.count; } job = null; break; } } }
      catch (e) { console.warn('[glades water] chunk', e); chunks.set(job.key, null); job = null; }
      return;
    }
    if ((scanT -= dt) > 0) return; scanT = 0.25;
    const ccx = Math.floor(cam.x / CH), ccz = Math.floor(cam.z / CH), rc = Math.ceil(R / CH);
    // drop far chunks
    for (const [k, m] of chunks) { const [x, z] = k.split(',').map(Number); if (Math.hypot((x + 0.5) * CH - cam.x, (z + 0.5) * CH - cam.z) > R + 90) { if (m) { group.remove(m); stats.verts -= m.geometry.attributes.position.count; m.geometry.dispose(); } chunks.delete(k); } }
    // nearest missing chunk in range (only where the glades are)
    let best = null, bd = 1e9;
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const x = ccx + dx, z = ccz + dz, k = x + ',' + z; if (chunks.has(k)) continue;
      const mx = (x + 0.5) * CH, mz = (z + 0.5) * CH, d = Math.hypot(mx - cam.x, mz - cam.z); if (d > R || d >= bd) continue;
      if (!inGlades(mx, mz) && !inGlades(x * CH, z * CH) && !inGlades((x + 1) * CH, (z + 1) * CH)) { chunks.set(k, null); continue; }
      best = [x, z, k]; bd = d;
    }
    if (best) job = { key: best[2], it: buildChunk(best[0], best[1]) };
    stats.chunks = [...chunks.values()].filter(Boolean).length;
  }
  return { levelAt, inGlades, update, group, material: mat, stats, dispose() { game.scene.remove(group); for (const m of chunks.values()) m?.geometry.dispose(); mat.dispose(); nmap?.dispose(); } };
}
