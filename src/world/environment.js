import * as THREE from 'three';
import { patchFogChunks } from './env/fogChunks.js';
import { createSkyMaterial } from './env/skyShader.js';
import { createDistant } from './env/distant.js';
import { createFX } from '/src/fx/fx.js';
import { createLampSystem } from './env/lamps.js';
import { createOcean } from './env/ocean.js';
import { patchShadowChunks, createSplitShadows } from './env/shadows.js';
import { createWind } from './env/wind.js';

// ---------------------------------------------------------------------------
// Time-of-day helpers
// ---------------------------------------------------------------------------
const RISE = 6.0, SET = 19.5, DAY_LEN = SET - RISE;

function sunDirectionAt(t, out) {
  t = ((t % 24) + 24) % 24;
  let a;
  if (t >= RISE && t <= SET) a = ((t - RISE) / DAY_LEN) * Math.PI;
  else a = Math.PI + ((((t - SET) + 24) % 24) / (24 - DAY_LEN)) * Math.PI;
  // rises in the east (+X, over the ocean), arcs through the south (-Z), sets in the west (-X)
  // elevation profile flattened near the horizon so late afternoon (17-19h) is long and golden
  const sa = Math.sin(a);
  const elev = Math.asin(Math.sign(sa) * 0.93 * Math.pow(Math.abs(sa), 1.7));
  const hx = Math.cos(a), hz = -0.36 * Math.abs(sa) - 0.12;
  const hl = Math.hypot(hx, hz) || 1;
  const ce = Math.cos(elev);
  out.set(ce * hx / hl, Math.sin(elev), ce * hz / hl);
  return out.normalize();
}

// piecewise-linear color/scalar ramps keyed on sun elevation (dir.y)
function ramp(keys, x, out) {
  if (x <= keys[0][0]) return set(out, keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [x0, v0] = keys[i - 1], [x1, v1] = keys[i];
      const f = (x - x0) / (x1 - x0);
      if (typeof v0 === 'number') return v0 + (v1 - v0) * f;
      return out.setRGB(v0[0] + (v1[0] - v0[0]) * f, v0[1] + (v1[1] - v0[1]) * f, v0[2] + (v1[2] - v0[2]) * f);
    }
  }
  return set(out, keys[keys.length - 1][1]);
}
function set(out, v) { return typeof v === 'number' ? v : out.setRGB(v[0], v[1], v[2]); }

// all colors linear
const SUN_COLOR = [[-0.06, [1.0, 0.22, 0.05]], [0.0, [1.0, 0.33, 0.10]], [0.06, [1.0, 0.48, 0.20]], [0.16, [1.0, 0.66, 0.40]], [0.35, [1.0, 0.86, 0.70]], [0.6, [1.0, 0.93, 0.82]], [1.0, [1.0, 0.94, 0.85]]];
// r2-look: look3 sun by day is closer to white (about 5600 K at noon instead of ~5000 K): with the warm grade on top, sand,
// concrete and white paint all went cream-yellow (the mock-up's sand and concrete are near neutral)
const L3_SUN_COLOR = [[-0.06, [1.0, 0.22, 0.05]], [0.0, [1.0, 0.33, 0.10]], [0.06, [1.0, 0.48, 0.20]], [0.16, [1.0, 0.68, 0.43]], [0.35, [1.0, 0.89, 0.76]], [0.6, [1.0, 0.945, 0.88]], [1.0, [1.0, 0.955, 0.90]]];
const FOG_COLOR = [[-0.35, [0.0035, 0.0055, 0.013]], [-0.12, [0.012, 0.016, 0.035]], [-0.03, [0.07, 0.055, 0.09]], [0.02, [0.30, 0.17, 0.16]], [0.09, [0.48, 0.30, 0.22]], [0.2, [0.50, 0.42, 0.38]], [0.4, [0.42, 0.50, 0.60]], [1.0, [0.36, 0.48, 0.64]]];
const HEMI_SKY = [[-0.3, [0.030, 0.045, 0.095]], [-0.05, [0.08, 0.07, 0.15]], [0.05, [0.40, 0.34, 0.50]], [0.12, [0.46, 0.42, 0.60]], [0.3, [0.45, 0.58, 0.80]], [1.0, [0.40, 0.60, 0.95]]];
const HEMI_GROUND = [[-0.3, [0.008, 0.008, 0.012]], [0.0, [0.08, 0.05, 0.05]], [0.12, [0.24, 0.15, 0.14]], [0.3, [0.30, 0.25, 0.19]], [1.0, [0.32, 0.28, 0.22]]];
const CLOUD_AMB = [[-0.3, [0.012, 0.016, 0.03]], [-0.05, [0.07, 0.06, 0.10]], [0.03, [0.34, 0.20, 0.32]], [0.12, [0.50, 0.34, 0.52]], [0.22, [0.62, 0.55, 0.68]], [0.4, [0.74, 0.80, 0.92]], [1.0, [0.82, 0.88, 1.0]]];
const CIRRUS = [[-0.2, [0.01, 0.012, 0.025]], [-0.06, [0.35, 0.08, 0.14]], [0.0, [1.0, 0.34, 0.34]], [0.1, [1.0, 0.58, 0.62]], [0.25, [0.98, 0.88, 0.86]], [1.0, [1.0, 1.0, 1.0]]];
const EXPOSURE = [[-0.3, 1.45], [-0.05, 1.25], [0.05, 0.98], [0.2, 0.96], [1.0, 0.96]];
const FOG_DENSITY = [[-0.3, 0.00060], [0.0, 0.00070], [0.12, 0.00058], [0.3, 0.00026], [0.5, 0.00013], [1.0, 0.00011]];
const SKY_EXPOSURE = [[-0.2, 0.55], [0.0, 0.55], [0.15, 0.5], [1.0, 0.45]];

const SKY_ZENITH = [[-0.3, [0.002, 0.004, 0.012]], [-0.08, [0.012, 0.012, 0.05]], [0.0, [0.06, 0.045, 0.20]], [0.1, [0.13, 0.11, 0.42]], [0.2, [0.09, 0.15, 0.50]], [0.35, [0.026, 0.13, 0.50]], [1.0, [0.02, 0.125, 0.52]]];
const SKY_HORIZON = [[-0.3, [0.006, 0.010, 0.025]], [-0.08, [0.07, 0.04, 0.10]], [0.0, [0.46, 0.22, 0.36]], [0.1, [0.56, 0.36, 0.56]], [0.2, [0.58, 0.50, 0.68]], [0.35, [0.34, 0.54, 0.88]], [1.0, [0.30, 0.52, 0.90]]];
const SKY_HORIZON_SUN = [[-0.3, [0.006, 0.010, 0.025]], [-0.08, [0.22, 0.06, 0.06]], [0.0, [1.2, 0.40, 0.18]], [0.1, [1.25, 0.62, 0.45]], [0.2, [1.15, 0.85, 0.72]], [0.35, [0.90, 0.90, 0.95]], [1.0, [0.70, 0.82, 0.96]]];
const SKY_GLOW = [[-0.12, [0.0, 0.0, 0.0]], [-0.04, [0.5, 0.12, 0.04]], [0.0, [1.5, 0.55, 0.22]], [0.1, [1.5, 0.80, 0.55]], [0.3, [1.3, 1.05, 0.85]], [1.0, [1.0, 0.95, 0.9]]];
// look3 sky (lead review 05:30): Florida sky by sun elevation. Noon: deep blue, white clouds with soft gray bases.
// Low sun: gold-orange toward the sun, pale yellow, then blue overhead; clouds gold on the sun side, gray-blue in shade;
// only a hint of pink right at sunset (the old ramps went lavender-purple). Night a touch bluer (moonlit).
const L3_SKY_ZENITH = [[-0.3, [0.004, 0.008, 0.024]], [-0.08, [0.010, 0.016, 0.050]], [0.0, [0.035, 0.065, 0.18]], [0.1, [0.05, 0.11, 0.36]], [0.2, [0.04, 0.13, 0.45]], [0.35, [0.026, 0.13, 0.50]], [1.0, [0.02, 0.125, 0.52]]];
const L3_SKY_HORIZON = [[-0.3, [0.010, 0.016, 0.040]], [-0.08, [0.05, 0.055, 0.11]], [0.0, [0.40, 0.31, 0.30]], [0.1, [0.50, 0.48, 0.50]], [0.2, [0.46, 0.55, 0.70]], [0.35, [0.34, 0.54, 0.88]], [1.0, [0.30, 0.52, 0.90]]];
const L3_SKY_HORIZON_SUN = [[-0.3, [0.010, 0.016, 0.040]], [-0.08, [0.25, 0.08, 0.04]], [0.0, [1.3, 0.50, 0.16]], [0.1, [1.3, 0.78, 0.38]], [0.2, [1.15, 0.92, 0.62]], [0.35, [0.90, 0.90, 0.92]], [1.0, [0.70, 0.82, 0.96]]];
const L3_CLOUD_AMB = [[-0.3, [0.012, 0.016, 0.03]], [-0.05, [0.06, 0.065, 0.10]], [0.03, [0.26, 0.25, 0.32]], [0.12, [0.42, 0.45, 0.56]], [0.22, [0.58, 0.62, 0.72]], [0.4, [0.74, 0.80, 0.92]], [1.0, [0.82, 0.88, 1.0]]];
const L3_CIRRUS = [[-0.2, [0.01, 0.012, 0.025]], [-0.06, [0.30, 0.10, 0.08]], [0.0, [1.0, 0.45, 0.25]], [0.1, [1.0, 0.72, 0.48]], [0.25, [0.98, 0.92, 0.86]], [1.0, [1.0, 1.0, 1.0]]];
const tmpC = new THREE.Color();
let envFrame = 0;
const CLOUD_BASE_M = 1100; // r2-look: fair-weather cumulus base height (m) for the world-anchored cloud field and its ground shadows
const cloudWind = new THREE.Vector2();
const NIGHT_WATER = new THREE.Color().setRGB(0.002, 0.008, 0.016);

export async function createEnvironment(game) {
  const { scene, renderer, camera } = game;
  patchFogChunks();
  const splitOK = patchShadowChunks();
  const lamps = createLampSystem(game);
  // shared wind field (game.wind): exists before every other system so anything can read it
  let wind = null;
  try { wind = game.wind = createWind(game); setTimeout(() => { try { game.emit?.('wind:ready', wind); } catch (e) { /* listeners must not break the env */ } }, 0); } catch (e) { console.error('[env] wind init failed', e); }

  renderer.shadowMap.enabled = true;
  if (renderer.shadowMap.type === THREE.BasicShadowMap) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.background = null;
  scene.fog = new THREE.FogExp2(0xffffff, 0.0012);

  // ---------------- Sky dome ----------------
  const skyMat = createSkyMaterial();
  const skyGeo = new THREE.SphereGeometry(1, 48, 24);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.scale.setScalar(1000);
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(sky);

  // sky-only scene for PMREM generation
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(skyGeo, skyMat);
  envSky.frustumCulled = false; envSky.scale.setScalar(50);
  envScene.add(envSky);
  // look3: the lower half of the environment map is ground (sun- and sky-lit sand / asphalt / grass), not more haze:
  // car paint, glass and wet roads reflected a bright fog-colored floor and every underside got lit from below
  const envGroundMat = new THREE.MeshBasicMaterial({ color: 0x404040, fog: false, side: THREE.DoubleSide, toneMapped: false });
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), envGroundMat);
  envGround.position.y = -1.2; // about 0.2 degrees below the horizon at 400 m: the haze band stays above the ground line
  envGround.frustumCulled = false;
  envScene.add(envGround);
  const envGroundCol = new THREE.Color();
  // r2-look: surroundings ring in the env map (look3 only). With just sky + flat floor, every car body, window and wet road
  // reflected an empty horizon: paint read as one flat pale color with no horizon line. Real streets reflect a dark band
  // of trees and houses up to ~5-10 degrees. An irregular open cylinder (tree crowns, roof lines, poles) with per-vertex
  // albedo (foliage ~0.10, pastel walls ~0.35); its color (irradiance) is refreshed with the env map, sun side brighter.
  const envRing = (() => {
    const N = 192, R = 300, pos = [], col = [], idx = [];
    const hsh = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // crown line: a few octaves of hashed bumps (trees 4-9 deg, a house roof now and then, rare taller palm heads)
      const k = i % N, n1 = hsh(Math.floor(k / 6)), n2 = hsh(k + 17), n3 = hsh(Math.floor(k / 2) + 91);
      const house = n1 < 0.28;
      let el = house ? 3.2 + 2.0 * n3 : 4.5 + 3.5 * n2 + 2.0 * n3;
      if (!house && hsh(k + 401) > 0.93) el += 3.5; // palm heads
      const top = R * Math.tan((el * Math.PI) / 180);
      pos.push(R * ca, -1.2, R * sa, R * ca, top, R * sa);
      const alb = house ? [0.36 + 0.1 * n2, 0.33 + 0.06 * n3, 0.30 + 0.05 * n2] : [0.075 + 0.03 * n3, 0.10 + 0.04 * n2, 0.05 + 0.02 * n3];
      const topK = house ? 1.0 : 1.25; // crown tops catch more sky
      col.push(alb[0] * 0.8, alb[1] * 0.8, alb[2] * 0.8, alb[0] * topK, alb[1] * topK, alb[2] * topK);
      if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('albedo', new THREE.Float32BufferAttribute(col.slice(), 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, toneMapped: false }));
    m.frustumCulled = false; m.renderOrder = 1;
    return m;
  })();
  envScene.add(envRing);
  envRing.userData.on = true; // runtime A/B: game.env.envRing.userData.on = false (then game.env.regenerateEnvMap())
  // env map: sky -> 128 cube (CubeCamera) -> PMREM into a *reused* target; the two steps run on different frames
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ENV_CUBE = 64;
  const envCubeRT = new THREE.WebGLCubeRenderTarget(ENV_CUBE, { type: THREE.HalfFloatType, generateMipmaps: false });
  const envCubeCam = new THREE.CubeCamera(0.1, 100, envCubeRT);
  envScene.add(envCubeCam);
  let envRT = null, envPhase = 0;
  let envTimer = 1e9;
  const lastEnvSun = new THREE.Vector3(0, -2, 0);

  // ---------------- Lights ----------------
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'sun';
  sun.castShadow = true;
  // static (city) shadow map: large, updated on demand; dynamic map (sunDyn): small, every frame
  // mutable: game.quality changes them through env.setShadowQuality()
  let SHADOW_SIZE = 4096, SHADOW_R = 150;
  let DYN_SIZE = 2048, DYN_R = 42;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  Object.assign(sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 1, far: 900 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.07;
  sun.shadow.radius = 2 * SHADOW_R; // look3: soft-shadow filter reads the frustum width in meters from here
  scene.add(sun, sun.target);
  // zero-intensity twin of the sun that only provides the per-frame dynamic shadow map
  const sunDyn = new THREE.DirectionalLight(0xffffff, 0);
  sunDyn.name = 'sun-dynamic-shadows';
  sunDyn.castShadow = !!splitOK;
  sunDyn.shadow.mapSize.set(DYN_SIZE, DYN_SIZE);
  Object.assign(sunDyn.shadow.camera, { left: -DYN_R, right: DYN_R, top: DYN_R, bottom: -DYN_R, near: 1, far: 900 });
  sunDyn.shadow.camera.updateProjectionMatrix();
  sunDyn.shadow.bias = -0.0003; sunDyn.shadow.normalBias = 0.03; sunDyn.shadow.radius = 2 * DYN_R;
  scene.add(sunDyn, sunDyn.target);
  // r2-look: near static cascade. The city map (4096 over 300 m = 7 cm texels) drew house, deck-rail and tree shadows
  // next to the player as soft blocky stair-steps. A second static map over +-NEAR_R m around the camera (2 cm texels)
  // takes over near the player and blends into the far map at its edge. Zero-intensity twin of the sun like sunDyn; the
  // patched shader (env/shadows.js) multiplies it into the sun. Re-rendered with the far map, and when the camera's
  // aim point leaves a 10 m cell (at most every 0.3 s). game.shadowNear = false turns it off (before load: ?nonear).
  const NEAR_ON = splitOK && !(typeof location !== 'undefined' && /[?&]nonear\b/.test(location.search));
  let NEAR_SIZE = 4096, NEAR_R = 40;
  const sunNear = new THREE.DirectionalLight(0xffffff, 0);
  sunNear.name = 'sun-near-static-shadows';
  sunNear.castShadow = NEAR_ON;
  sunNear.shadow.mapSize.set(NEAR_SIZE, NEAR_SIZE);
  Object.assign(sunNear.shadow.camera, { left: -NEAR_R, right: NEAR_R, top: NEAR_R, bottom: -NEAR_R, near: 1, far: 900 });
  sunNear.shadow.camera.updateProjectionMatrix();
  sunNear.shadow.bias = -0.0003; sunNear.shadow.normalBias = 0.03; sunNear.shadow.radius = 2 * NEAR_R;
  sunNear.shadow.autoUpdate = false;
  if (NEAR_ON) scene.add(sunNear, sunNear.target);
  let nearT = 0; const nearCell = new THREE.Vector3(1e9, 0, 0);
  const split = splitOK ? createSplitShadows(game, sun, sunDyn, NEAR_ON ? sunNear : null) : null;
  game.__psSplit = split;
  if (split) sun.shadow.autoUpdate = false;
  let staticT = 0, staticPending = false; const staticCell = new THREE.Vector3(1e9, 0, 0), staticSun = new THREE.Vector3();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  scene.add(hemi);

  // ---------------- Ocean (global, camera-following) ----------------
  const waterNormals = await new THREE.TextureLoader().loadAsync('/assets/env/waternormals.jpg').catch(() => null);
  if (waterNormals) { waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping; waterNormals.anisotropy = 4; }
  const ocean = createOcean(game, skyMat.uniforms, waterNormals);
  scene.add(ocean.mesh);
  const water = ocean.mesh;

  // ---------------- Distant scenery ----------------
  const distant = createDistant(scene);

  // ---------------- per-frame state ----------------
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const lookM = new THREE.Matrix4();
  const lightQ = new THREE.Quaternion(), lightQInv = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  const staticAim = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const ORIGIN = new THREE.Vector3();
  let time = 0;

  const env = {
    sun, sunDyn, sunNear, hemi, sky, water, ocean, distant, lamps, wind, envRing,
    sunDir, moonDir,
    dayFactor: 1, nightFactor: 0, exposure: 1,
    seaLevel: -0.12, underwater: 0,
    indoor: 0,
    _indoorFlag: false,
    // interiors can call env.setIndoor(true/false) (or set game.player.state.indoor) to
    // get indoor exposure (brighter), thin fog and no sun glare/god rays
    setIndoor(flag) { env._indoorFlag = !!flag; },
    regenerateEnvMap() { envTimer = 1e9; },
    /** shadow quality (playtest-fixes): { size, radius, dynSize, dynRadius, dynamic } */
    setShadowQuality(q) {
      const apply = (light, size, R) => {
        if (light.shadow.mapSize.x !== size) {
          light.shadow.mapSize.set(size, size);
          if (light.shadow.map) {
            light.shadow.map.dispose();
            light.shadow.map = null;
          }
        }
        Object.assign(light.shadow.camera, { left: -R, right: R, top: R, bottom: -R });
        light.shadow.radius = 2 * R; // look3 soft shadows: frustum width in meters
        light.shadow.camera.updateProjectionMatrix();
      };
      SHADOW_SIZE = q.size ?? SHADOW_SIZE;
      SHADOW_R = q.radius ?? SHADOW_R;
      DYN_SIZE = q.dynSize ?? DYN_SIZE;
      DYN_R = q.dynRadius ?? DYN_R;
      apply(sun, SHADOW_SIZE, SHADOW_R);
      apply(sunDyn, DYN_SIZE, DYN_R);
      if (NEAR_ON) { NEAR_SIZE = Math.min(4096, SHADOW_SIZE); apply(sunNear, NEAR_SIZE, NEAR_R); nearCell.set(1e9, 0, 0); }
      // keep the shader variant (two directional shadow maps) the same; just stop redrawing the dynamic one
      sunDyn.shadow.autoUpdate = q.dynamic !== false;
      staticCell.set(1e9, 0, 0);
      staticPending = true;
    },
    update(dt) {
      try { updateImpl(dt); } catch (e) { if (!env._warned) { env._warned = true; console.error('[env] update failed', e); } }
    },
  };
  // particle / decal FX (game.fx) — created here so it exists before other modules load
  try { game.fx = createFX(game, env); env.fx = game.fx; } catch (e) { console.error('[env] fx init failed', e); }
  const UNDER_FOG = new THREE.Color().setRGB(0.012, 0.075, 0.085);

  // lightweight section profiler: env.prof[name] = { last, max } (max decays slowly)
  env.prof = {};
  function prof(name, t0) { const d = performance.now() - t0; const p = env.prof[name] || (env.prof[name] = { last: 0, max: 0 }); p.last = d; p.max = Math.max(d, p.max * 0.999); }

  function updateImpl(dt) {
    {
      dt = Math.min(dt || 0.016, 0.1);
      time += dt;
      envFrame++;
      const tod = game.timeOfDay ?? 18;
      sunDirectionAt(tod, sunDir);
      // moon roughly opposite, offset so it is not exactly antipodal
      moonDir.set(-sunDir.x * 0.9, -sunDir.y, -sunDir.z + 0.25).normalize();
      const s = sunDir.y;
      const dayF = THREE.MathUtils.smoothstep(s, -0.035, 0.08);
      const nightF = THREE.MathUtils.smoothstep(-s, 0.0, 0.16);
      env.dayFactor = dayF; env.nightFactor = nightF;

      // --- light: sun by day, moon by night ---
      const useMoon = s < -0.03;
      lightDir.copy(useMoon ? moonDir : sunDir);
      if (useMoon) {
        sun.color.setRGB(0.6, 0.72, 1.0);
        sun.intensity = 0.55 * nightF * THREE.MathUtils.smoothstep(moonDir.y, 0.0, 0.15);
      } else {
        ramp(game.look3 === true && game.lookR2 !== false ? L3_SUN_COLOR : SUN_COLOR, s, sun.color);
        sun.intensity = dayF * (3.9 + 1.1 * (1 - THREE.MathUtils.smoothstep(s, 0.05, 0.4)));
      }

      // grazing light (low sun / moon): scale receiver offsets so ground/sidewalks don't get acne bands
      {
        // from the direction the shadow maps were rendered with (constant between static re-renders), so the
        // bias never changes under a shadow map that was not redrawn (that made edges pulse while moving)
        const el = Math.max((staticSun.lengthSq() > 0.5 ? staticSun : lightDir).y, 0.1);
        sun.shadow.normalBias = Math.min(0.45, 0.065 / el);
        sun.shadow.bias = -0.0003 - 0.0004 * (1 - Math.min(1, el / 0.4));
        sunDyn.shadow.normalBias = Math.min(0.25, 0.035 / el);
        sunDyn.shadow.bias = -0.0003 - 0.0003 * (1 - Math.min(1, el / 0.4));
        sunNear.shadow.normalBias = Math.min(0.25, 0.03 / el);
        sunNear.shadow.bias = -0.0003 - 0.0003 * (1 - Math.min(1, el / 0.4));
      }
      // Shadow frustums follow the player, snapped to their texel grids (no shimmering).
      // The static (city) map keeps the light direction it was last rendered with: re-centering after a
      // move reuses that exact direction, so every shadow edge lands on the same texels and nothing crawls.
      // Only a real sun drift (about 0.25 degrees) re-renders it with a new direction.
      const focus = game.player?.position || ORIGIN;
      const place = (light, center, R, size, dir) => {
        lookM.lookAt(dir, ORIGIN, UP);
        lightQ.setFromRotationMatrix(lookM);
        lightQInv.copy(lightQ).invert();
        const texel = (2 * R) / size;
        v.copy(center).applyQuaternion(lightQInv);
        v.x = Math.round(v.x / texel) * texel;
        v.y = Math.round(v.y / texel) * texel;
        v.z = Math.round(v.z / texel) * texel;
        v.applyQuaternion(lightQ);
        light.target.position.copy(v);
        light.position.copy(v).addScaledVector(dir, 450);
        light.target.updateMatrixWorld();
        light.updateMatrixWorld();
      };
      if (split) {
        // static map: centered a little ahead of the camera (where the visible shadows are), re-centered
        // when that point leaves a 24 m cell, the sun moved, or new geometry streamed in
        staticT += dt;
        camera.getWorldDirection(camFwd);
        camFwd.y = 0;
        if (camFwd.lengthSq() > 1e-6) {
          camFwd.normalize();
        }
        staticAim.copy(focus).addScaledVector(camFwd, SHADOW_R * 0.35);
        const cx = Math.round(staticAim.x / 24) * 24;
        const cz = Math.round(staticAim.z / 24) * 24;
        const tS = performance.now();
        const dirty = split.update(dt);
        prof('shadowTags', tS);
        if (dirty) {
          staticPending = true;
        }
        const moved = cx !== staticCell.x || cz !== staticCell.z;
        const sunDrift = staticSun.dot(lightDir) < 0.99999;
        // capped: at most one static re-render per 0.4 s (moving), 1.5 s (streamed geometry), 2 s (sun drift)
        if ((moved && staticT > 0.4) || (staticPending && staticT > 1.5) || (sunDrift && staticT > 2) || staticT > 12) {
          staticPending = false;
          staticCell.set(cx, focus.y, cz);
          if (sunDrift || staticSun.lengthSq() < 0.5) {
            staticSun.copy(lightDir);
          }
          staticT = 0;
          place(sun, staticCell, SHADOW_R, SHADOW_SIZE, staticSun);
          sun.shadow.needsUpdate = true;
          nearT = 1e9; // the near map always follows a far re-render (same light direction, same streamed geometry)
        }
        if (NEAR_ON) {
          nearT += dt;
          const nOn = game.shadowNear !== false && game.lookR2 !== false;
          if (sunNear.castShadow !== nOn) { sunNear.castShadow = nOn; } // (changes the shader variant: A/B only)
          const ax = focus.x + camFwd.x * NEAR_R * 0.3, az = focus.z + camFwd.z * NEAR_R * 0.3;
          const nx = Math.round(ax / 10) * 10, nz = Math.round(az / 10) * 10;
          if (nOn && staticSun.lengthSq() > 0.5 && (nearT > 1e8 || ((nx !== nearCell.x || nz !== nearCell.z) && nearT > 0.3) || nearT > 12)) {
            nearT = 0; nearCell.set(nx, focus.y, nz);
            place(sunNear, nearCell, NEAR_R, NEAR_SIZE, staticSun);
            sunNear.shadow.needsUpdate = true;
          }
        }
        // the per-frame dynamic map uses the same direction as the static one, so the two always agree
        place(sunDyn, focus, DYN_R, DYN_SIZE, staticSun.lengthSq() > 0.5 ? staticSun : lightDir);
      } else {
        place(sun, focus, SHADOW_R, SHADOW_SIZE, lightDir);
      }

      // --- hemisphere / fog / exposure ---
      ramp(HEMI_SKY, s, hemi.color);
      ramp(HEMI_GROUND, s, hemi.groundColor);
      hemi.intensity = 0.52 - 0.04 * dayF;
      const L3 = game.look3 === true;
      if (!scene.fog) scene.fog = new THREE.FogExp2(0xffffff, 0.0012); // a tool or cutscene that cleared it must not stop the env update
      ramp(L3 ? L3_SKY_HORIZON : SKY_HORIZON, s, scene.fog.color).multiplyScalar(0.9);
      scene.fog.density = ramp(FOG_DENSITY, s) * (1 - 0.8 * env.indoor);
      const wantIndoor = env._indoorFlag || !!game.player?.state?.indoor;
      env.indoor += ((wantIndoor ? 1 : 0) - env.indoor) * Math.min(1, dt * 2.5);
      env.exposure = ramp(EXPOSURE, s) * (1 + 0.35 * env.indoor);
      renderer.toneMappingExposure = env.exposure;
      if ('environmentIntensity' in scene) scene.environmentIntensity = 0.85 + 0.25 * dayF;

      // --- sky uniforms ---
      const u = skyMat.uniforms;
      u.sunDir.value.copy(sunDir);
      u.moonDir.value.copy(moonDir);
      u.lightDir.value.copy(lightDir);
      u.lightColor.value.copy(sun.color).multiplyScalar(sun.intensity);
      u.uTime.value = time;
      u.uNight.value = nightF;
      u.uFogColor.value.copy(scene.fog.color);
      u.uSkyExposure.value = ramp(SKY_EXPOSURE, s);
      u.rayleigh.value = 1.5 + 2.5 * (1 - THREE.MathUtils.smoothstep(s, 0.0, 0.4));
      u.mieCoefficient.value = 0.005 + 0.004 * (1 - THREE.MathUtils.smoothstep(s, 0.0, 0.3));
      u.turbidity.value = 5.5 + 4.5 * (1 - THREE.MathUtils.smoothstep(s, 0.0, 0.3));
      ramp(L3 ? L3_CLOUD_AMB : CLOUD_AMB, s, u.uCloudAmbient.value);
      u.uCloudSun.value.copy(sun.color).multiplyScalar(useMoon ? 0.25 * nightF : 0.75 * THREE.MathUtils.smoothstep(s, -0.1, 0.02));
      ramp(L3 ? L3_CIRRUS : CIRRUS, s, u.uCirrusColor.value);
      // sunset: clouds catch pink-rose light rather than plain orange (backlit rims stay warm through the forward-scatter term)
      env.golden = dayF * (1 - THREE.MathUtils.smoothstep(s, 0.06, 0.3));
      if (!useMoon && !L3) u.uCloudSun.value.lerp(tmpC.setRGB(0.95, 0.56, 0.60), 0.55 * env.golden);
      // look3: clouds catch gold, a pink hint only in the last minutes before the sun touches the horizon
      if (!useMoon && L3) u.uCloudSun.value.lerp(tmpC.setRGB(1.0, 0.62, 0.30), 0.35 * env.golden).lerp(tmpC.setRGB(0.98, 0.55, 0.52), 0.3 * dayF * (1 - THREE.MathUtils.smoothstep(s, 0.0, 0.05)));
      ramp(L3 ? L3_SKY_ZENITH : SKY_ZENITH, s, u.uZenith.value);
      ramp(L3 ? L3_SKY_HORIZON : SKY_HORIZON, s, u.uHorizon.value);
      ramp(L3 ? L3_SKY_HORIZON_SUN : SKY_HORIZON_SUN, s, u.uHorizonSun.value);
      ramp(SKY_GLOW, s, u.uSunGlow.value);
      u.uCloudCover.value = 0.40 + 0.07 * env.golden;
      if (wind) { cloudWind.x -= wind.dir.x * wind.speed * dt * 0.0012; cloudWind.y -= wind.dir.y * wind.speed * dt * 0.0012; }
      // r2-look: the cloud field is anchored to the world (it used to ride along with the camera): driving under the clouds
      // shows them drift past, and the ground cloud shadows (post.js) use the same field. 1 cloud unit = CLOUD_BASE_M / 1.9 m.
      if (game.look3 === true && game.lookR2 !== false) u.uCloudOff.value.set(cloudWind.x + camera.position.x * 1.9 / CLOUD_BASE_M, cloudWind.y + camera.position.z * 1.9 / CLOUD_BASE_M);
      else u.uCloudOff.value.copy(cloudWind);
      env.cloudBase = CLOUD_BASE_M;
      u.uCloudR2.value = game.look3 === true && game.lookR2 !== false ? 1 : 0;
      { const dayN = Math.floor(game.day ?? game.clock?.day ?? 0); const hsh = Math.abs(Math.sin(dayN * 12.9898 + 4.1)) % 1; u.uCirrus.value = hsh < 0.45 ? 0.12 : 0.25 + 0.6 * hsh; } // thin cirrus only on some days // bigger, softer cloud banks toward sunset

      if (wind) wind.update(dt, env, camera);
      // --- ocean ---
      { const tO = performance.now(); ocean.update(dt, camera, env); prof('ocean', tO); }
      // the generic distant ridges/skyline only suit the small legacy map
      env._distantT = (env._distantT || 0) - dt;
      if (game.city && env._distantT <= 0) {
        env._distantT = 3;
        const bb = game.city.bounds;
        distant.group.visible = !!bb && Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ) < 3000;
      }
      distant.setNight(Math.max(nightF, 1 - dayF) * 0.9 + 0.1 * (1 - dayF));

      // --- underwater (camera below the ocean surface) ---
      const sea = game.city?.seaLevel ?? env.seaLevel;
      const under = camera.position.y < sea - 0.02 && (game.city?.isWater ? game.city.isWater(camera.position.x, camera.position.z) : true) ? 1 : 0;
      env.underwater = under;
      if (under) {
        scene.fog.color.copy(UNDER_FOG).multiplyScalar(0.25 + 0.75 * dayF);
        scene.fog.density = 0.07;
        sky.visible = false;
        scene.background = scene.fog.color;
      } else if (!sky.visible) {
        sky.visible = true;
        scene.background = null;
      }
      { const tF = performance.now(); if (game.fx && game.fx !== env._extFx) game.fx.update(dt); prof('fx', tF); }

      // --- street lamps (clustered lights + far pools) ---
      env.lampsOn = 1 - THREE.MathUtils.smoothstep(s, -0.03, 0.06);
      { const tL = performance.now(); lamps.update(dt, camera, env.lampsOn); prof('lamps', tL); }

      // --- environment map regeneration (every ~4 real seconds or when the sun moved) ---
      envTimer += dt;
      const tE = performance.now();
      if (envPhase === 1) {
        // step 2 (next frame): prefilter into the reused PMREM target (no allocation, no recompiles)
        envRT = pmrem.fromCubemap(envCubeRT.texture, envRT);
        if (scene.environment !== envRT.texture) scene.environment = envRT.texture;
        envPhase = 0;
      } else if (envTimer > 6 || lastEnvSun.distanceToSquared(sunDir) > 0.0006) {
        // step 1: render the sky into a small cube
        envTimer = 0; lastEnvSun.copy(sunDir);
        // ground irradiance for the env map floor: sun on flat ground + sky fill, times a warm sandy/paved albedo (~0.22)
        envGround.visible = game.look3 === true;
        if (envGround.visible) {
          const sunE = sun.intensity * Math.max(0, lightDir.y) / Math.PI;
          envGroundCol.copy(sun.color).multiplyScalar(sunE).add(tmpC.copy(hemi.color).multiplyScalar(hemi.intensity * 0.9));
          envGroundCol.multiply(tmpC.setRGB(0.24, 0.21, 0.17));
          // blend toward the haze color so the floor meets the horizon without a dark band
          envGroundMat.color.copy(envGroundCol).lerp(scene.fog.color, 0.25);
        }
        envRing.visible = game.look3 === true && game.lookR2 !== false && envRing.userData.on !== false;
        if (envRing.visible) {
          // per-vertex radiance: albedo x (sun on the faces turned toward the sun + sky fill), a little haze at the top
          const sunE = sun.intensity * Math.max(0, lightDir.y) / Math.PI, A = envRing.geometry.attributes.albedo, C = envRing.geometry.attributes.color, P = envRing.geometry.attributes.position;
          const lx = lightDir.x, lz = lightDir.z, ll = Math.hypot(lx, lz) || 1, hz = scene.fog.color;
          for (let i = 0; i < A.count; i++) {
            const px = P.getX(i), pz = P.getZ(i), pl = Math.hypot(px, pz) || 1;
            const facing = Math.max(0, -(px * lx + pz * lz) / (pl * ll)); // inner face lit when the sun is behind the viewer
            const e = 0.25 + 0.75 * facing * (0.45 + 0.55 * Math.max(0, 1 - lightDir.y)); // vertical faces: less sun at noon
            const hf = (i & 1) ? 0.18 : 0.0; // aerial haze toward the crown line
            for (let c = 0; c < 3; c++) {
              const sc = c === 0 ? sun.color.r : c === 1 ? sun.color.g : sun.color.b, hc = c === 0 ? hemi.color.r : c === 1 ? hemi.color.g : hemi.color.b;
              const hzc = c === 0 ? hz.r : c === 1 ? hz.g : hz.b;
              const v = A.getComponent(i, c) * (sc * sunE * e + hc * hemi.intensity * 0.9);
              C.setComponent(i, c, v * (1 - hf) + hzc * hf * 0.5);
            }
          }
          C.needsUpdate = true;
        }
        envCubeCam.update(renderer, envScene);
        envPhase = 1;
      }
      prof('envmap', tE);
    }
  }
  env.update(0);
  env.update(0); // second phase: env map ready before the first frame
  return env;
}
