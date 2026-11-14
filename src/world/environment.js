import * as THREE from 'three';
import { patchFogChunks } from './env/fogChunks.js';
import { createSkyMaterial } from './env/skyShader.js';
import { createDistant } from './env/distant.js';
import { createFX } from '/src/fx/fx.js';
import { createLampSystem } from './env/lamps.js';
import { createOcean } from './env/ocean.js';
import { patchShadowChunks, createSplitShadows } from './env/shadows.js';

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
const SUN_COLOR = [[-0.06, [1.0, 0.22, 0.05]], [0.0, [1.0, 0.33, 0.10]], [0.06, [1.0, 0.48, 0.20]], [0.16, [1.0, 0.66, 0.40]], [0.35, [1.0, 0.86, 0.70]], [0.6, [1.0, 0.95, 0.88]], [1.0, [1.0, 0.97, 0.93]]];
const FOG_COLOR = [[-0.35, [0.0035, 0.0055, 0.013]], [-0.12, [0.012, 0.016, 0.035]], [-0.03, [0.07, 0.055, 0.09]], [0.02, [0.30, 0.17, 0.16]], [0.09, [0.48, 0.30, 0.22]], [0.2, [0.50, 0.42, 0.38]], [0.4, [0.42, 0.50, 0.60]], [1.0, [0.36, 0.48, 0.64]]];
const HEMI_SKY = [[-0.3, [0.030, 0.045, 0.095]], [-0.05, [0.08, 0.07, 0.15]], [0.05, [0.40, 0.34, 0.50]], [0.12, [0.46, 0.42, 0.60]], [0.3, [0.45, 0.58, 0.80]], [1.0, [0.40, 0.60, 0.95]]];
const HEMI_GROUND = [[-0.3, [0.008, 0.008, 0.012]], [0.0, [0.08, 0.05, 0.05]], [0.12, [0.24, 0.15, 0.14]], [0.3, [0.30, 0.25, 0.19]], [1.0, [0.32, 0.28, 0.22]]];
const CLOUD_AMB = [[-0.3, [0.012, 0.016, 0.03]], [-0.05, [0.07, 0.06, 0.10]], [0.03, [0.34, 0.20, 0.32]], [0.12, [0.50, 0.34, 0.52]], [0.22, [0.62, 0.55, 0.68]], [0.4, [0.74, 0.80, 0.92]], [1.0, [0.82, 0.88, 1.0]]];
const CIRRUS = [[-0.2, [0.01, 0.012, 0.025]], [-0.06, [0.35, 0.08, 0.14]], [0.0, [1.0, 0.34, 0.34]], [0.1, [1.0, 0.58, 0.62]], [0.25, [0.98, 0.88, 0.86]], [1.0, [1.0, 1.0, 1.0]]];
const EXPOSURE = [[-0.3, 1.45], [-0.05, 1.25], [0.05, 0.98], [0.2, 0.96], [1.0, 0.96]];
const FOG_DENSITY = [[-0.3, 0.00060], [0.0, 0.00048], [0.12, 0.00036], [0.3, 0.00026], [0.5, 0.00013], [1.0, 0.00011]];
const SKY_EXPOSURE = [[-0.2, 0.55], [0.0, 0.55], [0.15, 0.5], [1.0, 0.45]];

const SKY_ZENITH = [[-0.3, [0.002, 0.004, 0.012]], [-0.08, [0.012, 0.012, 0.05]], [0.0, [0.06, 0.045, 0.20]], [0.1, [0.13, 0.11, 0.42]], [0.2, [0.09, 0.15, 0.50]], [0.35, [0.026, 0.13, 0.50]], [1.0, [0.02, 0.125, 0.52]]];
const SKY_HORIZON = [[-0.3, [0.006, 0.010, 0.025]], [-0.08, [0.07, 0.04, 0.10]], [0.0, [0.46, 0.22, 0.36]], [0.1, [0.56, 0.36, 0.56]], [0.2, [0.58, 0.50, 0.68]], [0.35, [0.34, 0.54, 0.88]], [1.0, [0.30, 0.52, 0.90]]];
const SKY_HORIZON_SUN = [[-0.3, [0.006, 0.010, 0.025]], [-0.08, [0.22, 0.06, 0.06]], [0.0, [1.2, 0.40, 0.18]], [0.1, [1.25, 0.62, 0.45]], [0.2, [1.15, 0.85, 0.72]], [0.35, [0.90, 0.90, 0.95]], [1.0, [0.70, 0.82, 0.96]]];
const SKY_GLOW = [[-0.12, [0.0, 0.0, 0.0]], [-0.04, [0.5, 0.12, 0.04]], [0.0, [1.5, 0.55, 0.22]], [0.1, [1.5, 0.80, 0.55]], [0.3, [1.3, 1.05, 0.85]], [1.0, [1.0, 0.95, 0.9]]];
const tmpC = new THREE.Color();
let envFrame = 0;
const NIGHT_WATER = new THREE.Color().setRGB(0.002, 0.008, 0.016);

export async function createEnvironment(game) {
  const { scene, renderer, camera } = game;
  patchFogChunks();
  const splitOK = patchShadowChunks();
  const lamps = createLampSystem(game);

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
  const SHADOW_SIZE = 4096, SHADOW_R = 150;
  const DYN_SIZE = 2048, DYN_R = 42;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  Object.assign(sun.shadow.camera, { left: -SHADOW_R, right: SHADOW_R, top: SHADOW_R, bottom: -SHADOW_R, near: 1, far: 900 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.07;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // zero-intensity twin of the sun that only provides the per-frame dynamic shadow map
  const sunDyn = new THREE.DirectionalLight(0xffffff, 0);
  sunDyn.name = 'sun-dynamic-shadows';
  sunDyn.castShadow = !!splitOK;
  sunDyn.shadow.mapSize.set(DYN_SIZE, DYN_SIZE);
  Object.assign(sunDyn.shadow.camera, { left: -DYN_R, right: DYN_R, top: DYN_R, bottom: -DYN_R, near: 1, far: 900 });
  sunDyn.shadow.camera.updateProjectionMatrix();
  sunDyn.shadow.bias = -0.0003; sunDyn.shadow.normalBias = 0.03; sunDyn.shadow.radius = 2;
  scene.add(sunDyn, sunDyn.target);
  const split = splitOK ? createSplitShadows(game, sun, sunDyn) : null;
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
  const UP = new THREE.Vector3(0, 1, 0);
  const ORIGIN = new THREE.Vector3();
  let time = 0;

  const env = {
    sun, sunDyn, hemi, sky, water, ocean, distant, lamps,
    sunDir, moonDir,
    dayFactor: 1, nightFactor: 0, exposure: 1,
    seaLevel: -0.12, underwater: 0,
    indoor: 0,
    _indoorFlag: false,
    // interiors can call env.setIndoor(true/false) (or set game.player.state.indoor) to
    // get indoor exposure (brighter), thin fog and no sun glare/god rays
    setIndoor(flag) { env._indoorFlag = !!flag; },
    regenerateEnvMap() { envTimer = 1e9; },
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
        ramp(SUN_COLOR, s, sun.color);
        sun.intensity = dayF * (3.4 + 1.6 * (1 - THREE.MathUtils.smoothstep(s, 0.05, 0.4)));
      }

      // grazing light (low sun / moon): scale receiver offsets so ground/sidewalks don't get acne bands
      {
        const el = Math.max(lightDir.y, 0.1);
        sun.shadow.normalBias = Math.min(0.45, 0.065 / el);
        sun.shadow.bias = -0.0003 - 0.0004 * (1 - Math.min(1, el / 0.4));
        sunDyn.shadow.normalBias = Math.min(0.25, 0.035 / el);
        sunDyn.shadow.bias = -0.0003 - 0.0003 * (1 - Math.min(1, el / 0.4));
      }
      // shadow frustums follow the player, snapped to their texel grids (no shimmering)
      const focus = game.player?.position || ORIGIN;
      lookM.lookAt(lightDir, ORIGIN, UP);
      lightQ.setFromRotationMatrix(lookM); lightQInv.copy(lightQ).invert();
      const place = (light, center, R, size) => {
        const texel = (2 * R) / size;
        v.copy(center).applyQuaternion(lightQInv);
        v.x = Math.round(v.x / texel) * texel; v.y = Math.round(v.y / texel) * texel; v.z = Math.round(v.z / texel) * texel;
        v.applyQuaternion(lightQ);
        light.target.position.copy(v);
        light.position.copy(v).addScaledVector(lightDir, 450);
        light.target.updateMatrixWorld(); light.updateMatrixWorld();
      };
      if (split) {
        // static map: re-centre only when the focus enters a new 24 m cell / the sun moved / new geometry
        staticT += dt;
        const cx = Math.round(focus.x / 24) * 24, cz = Math.round(focus.z / 24) * 24;
        const tS = performance.now();
        const dirty = split.update(dt);
        prof('shadowTags', tS);
        if (dirty) staticPending = true;
        const moved = cx !== staticCell.x || cz !== staticCell.z;
        // capped: at most one static re-render per 0.75 s (moving), 1.5 s (streamed geometry), 2 s (sun drift)
        if ((moved && staticT > 0.75) || (staticPending && staticT > 1.5) || (staticSun.dot(lightDir) < 0.99999 && staticT > 2) || staticT > 12) {
          staticPending = false;
          staticCell.set(cx, focus.y, cz); staticSun.copy(lightDir); staticT = 0;
          place(sun, staticCell, SHADOW_R, SHADOW_SIZE);
          sun.shadow.needsUpdate = true;
        }
        place(sunDyn, focus, DYN_R, DYN_SIZE);
      } else {
        place(sun, focus, SHADOW_R, SHADOW_SIZE);
      }

      // --- hemisphere / fog / exposure ---
      ramp(HEMI_SKY, s, hemi.color);
      ramp(HEMI_GROUND, s, hemi.groundColor);
      hemi.intensity = 0.5 + 0.1 * dayF;
      ramp(SKY_HORIZON, s, scene.fog.color).multiplyScalar(0.9);
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
      ramp(CLOUD_AMB, s, u.uCloudAmbient.value);
      u.uCloudSun.value.copy(sun.color).multiplyScalar(useMoon ? 0.25 * nightF : 0.75 * THREE.MathUtils.smoothstep(s, -0.1, 0.02));
      ramp(CIRRUS, s, u.uCirrusColor.value);
      // sunset: clouds catch pink-rose light rather than plain orange (backlit rims stay warm through the forward-scatter term)
      env.golden = dayF * (1 - THREE.MathUtils.smoothstep(s, 0.06, 0.3));
      if (!useMoon) u.uCloudSun.value.lerp(tmpC.setRGB(0.95, 0.56, 0.60), 0.55 * env.golden);
      ramp(SKY_ZENITH, s, u.uZenith.value);
      ramp(SKY_HORIZON, s, u.uHorizon.value);
      ramp(SKY_HORIZON_SUN, s, u.uHorizonSun.value);
      ramp(SKY_GLOW, s, u.uSunGlow.value);
      u.uCloudCover.value = 0.385 + 0.11 * env.golden; // bigger, softer cloud banks toward sunset

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
