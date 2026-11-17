import * as THREE from 'three';

// Visible sea floor around the player: a 2 m grid (240 m square) that follows the player and takes its heights from
// city.seabedDepthAt (the same seabed the swim code uses; ignores bridge decks overhead). Land vertices are tucked just under the land surface, so the
// shoreline becomes a natural underwater slope. Rebuilt a few rows per frame when the player moves, so there is no hitch.
export function createSeabed(game, city) {
  const SIZE = 240, STEP = 2, N = SIZE / STEP + 1, SEA = city.seaLevel ?? -0.12;
  const geoms = [0, 1].map(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, N - 1, N - 1);
    g.rotateX(-Math.PI / 2);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    return g;
  });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geoms[0], mat);
  mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false; mesh.visible = false;
  mesh.name = 'seabed';
  game.scene.add(mesh);

  // cheap value noise for sand ripples, darker rock and seagrass patches
  const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const SAND = new THREE.Color(0xc8b48a), WET = new THREE.Color(0x8f7f5f), GRASS = new THREE.Color(0x3f5a2e), ROCK = new THREE.Color(0x6b6558), _c = new THREE.Color();

  let center = null, job = null, cur = 0;
  // ground pass: a shallow shelf along every shore (0.3 m at the waterline, ~2 m at 14 m out) instead of a cliff straight down to the
  // data depth: docks / riprap at the waterline stand in shallow water, and the see-through waterline shows sand, not a void
  const SH_R = [1.5, 3, 5, 8, 11, 14], SH_D = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  function shelfAt(x, z) {
    const W = city.isWater; if (!W) return 99;
    for (const r of SH_R) for (const [dx, dz] of SH_D) if (!W(x + dx * r, z + dz * r)) return 0.3 + r * 0.12 + r * r * 0.004;
    return 99;
  }
  function startBuild(cx, cz) {
    const g = geoms[1 - cur];
    job = { g, cx, cz, row: 0, water: 0 };
  }
  function stepBuild(rows) {
    const j = job, pos = j.g.attributes.position.array, col = j.g.attributes.color.array;
    const x0 = j.cx - SIZE / 2, z0 = j.cz - SIZE / 2;
    for (let r = 0; r < rows && j.row < N; r++, j.row++) {
      const z = z0 + j.row * STEP;
      for (let i = 0; i < N; i++) {
        const x = x0 + i * STEP, k = j.row * N + i;
        const water = city.isWater ? city.isWater(x, z) : false;
        let y = water ? SEA - Math.max(0.2, Math.min(city.seabedDepthAt(x, z), shelfAt(x, z))) : -0.35; // under land: hidden by the land surface, forms the shore slope
        if (!Number.isFinite(y)) y = SEA - 3;
        if (water) { j.water++; y += (noise(x * 0.35, z * 0.35) - 0.5) * 0.35; }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        const n1 = noise(x * 0.08, z * 0.08), n2 = noise(x * 0.6 + 17, z * 0.6 - 9);
        _c.copy(SAND).lerp(WET, 0.35 + 0.4 * n2);
        if (n1 > 0.62) _c.lerp(GRASS, Math.min(1, (n1 - 0.62) * 4)); // seagrass meadows
        else if (n1 < 0.18) _c.lerp(ROCK, Math.min(1, (0.18 - n1) * 5)); // rocky patches
        col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
      }
    }
    if (j.row >= N) {
      j.g.attributes.position.needsUpdate = true; j.g.attributes.color.needsUpdate = true;
      j.g.computeVertexNormals(); j.g.computeBoundingSphere();
      cur = 1 - cur; mesh.geometry = j.g; mesh.visible = j.water > 0;
      center = { x: j.cx, z: j.cz }; job = null;
    }
  }
  function update() {
    const p = game.player?.position; if (!p || !city.seabedDepthAt) return;
    const cx = Math.round(p.x / 20) * 20, cz = Math.round(p.z / 20) * 20;
    // only rebuild when the player is in or right next to water (swimming, boating, on a pier or beach): driving across
    // land never pays for it, and the floor is only visible from (or through) nearby water anyway
    const W = city.isWater, nearWater = !!W && (W(p.x, p.z) || W(p.x + 40, p.z) || W(p.x - 40, p.z) || W(p.x, p.z + 40) || W(p.x, p.z - 40));
    if (!job && nearWater && (!center || Math.hypot(cx - center.x, cz - center.z) > 40)) startBuild(cx, cz);
    if (job) stepBuild(center ? 6 : N); // first build at once (loading), later builds spread over ~20 frames
  }
  game.updaters.push(update);
  return { mesh, update };
}
