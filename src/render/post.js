import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradeShader } from './gradeShader.js';

// Pipeline (HDR linear until OutputPass, display-referred after):
// Render -> [GTAO half-res, high quality only] -> UnrealBloom -> Output (ACES + sRGB) -> SMAA -> Grade (to screen)
export function createPost(game) {
  const { renderer, scene, camera } = game;
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pr = renderer.getPixelRatio();
  let W = Math.max(1, size.x), H = Math.max(1, size.y);

  const target = new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, target);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let gtao = null;
  try {
    gtao = new GTAOPass(scene, camera, Math.floor(W / 2), Math.floor(H / 2));
    gtao.blendIntensity = 0.7;
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 8 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    const gtaoSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => gtaoSetSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    gtao.enabled = false;
    // GTAO's G-buffer pass calls renderer.render(): skip the (already rendered) shadow map there
    const gtaoRender = gtao.render.bind(gtao);
    gtao.render = (r, wb, rb, dt, mask) => {
      const au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
      try { gtaoRender(r, wb, rb, dt, mask); } finally { r.shadowMap.autoUpdate = au; }
    };
    composer.addPass(gtao);
  } catch (e) { console.warn('[post] GTAO unavailable', e); gtao = null; }

  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.55, 0.92);
  composer.addPass(bloom);

  const output = new OutputPass();
  composer.addPass(output);

  const smaa = new SMAAPass(W * pr, H * pr);
  composer.addPass(smaa);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const gu = grade.uniforms;
  // ShaderPass clones uniforms: arrays -> use vectors for safety
  gu.uRes.value = new THREE.Vector2(W * pr, H * pr);
  for (const k of ['uLift', 'uGamma', 'uGain', 'uShadowTint', 'uHighTint', 'uSunColor']) gu[k].value = new THREE.Vector3().fromArray(gu[k].value);
  gu.uSunPos.value = new THREE.Vector2(0.5, 0.5);

  const sunWorld = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let speedSmooth = 0, adapt = 1, frameAvg = 1 / 60, aoAllowed = true, aoTimer = 0;
  let time = 0;

  function setSize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    const p = renderer.getPixelRatio();
    composer.setPixelRatio(p);
    composer.setSize(W, H);
    gu.uRes.value.set(W * p, H * p);
    gu.uAspect.value = W / H;
  }
  setSize(W, H);

  // ---------- performance stats + FPS-adaptive resolution ----------
  renderer.info.autoReset = false;
  const perf = game.perf = { fps: 60, frameMs: 16.7, drawCalls: 0, triangles: 0, pixelRatio: renderer.getPixelRatio(), resScale: 1, gtao: false };
  const basePR = renderer.getPixelRatio();
  const minPR = Math.max(0.5, basePR * 0.8); // floor: never below 80% of the native ratio
  let lastNow = performance.now(), winMs = 0, winN = 0, evalT = 0, goodT = 0, sinceChange = 0, upBlockT = 0, lastUpAt = -1e9, clock = 0;
  function applyPR(pr) {
    pr = Math.round(THREE.MathUtils.clamp(pr, minPR, basePR) * 100) / 100;
    if (Math.abs(pr - renderer.getPixelRatio()) < 0.01) return false;
    renderer.setPixelRatio(pr);
    setSize(W, H);
    perf.pixelRatio = pr; perf.resScale = pr / basePR; sinceChange = 0;
    return true;
  }
  function governor() {
    const now = performance.now();
    const ms = now - lastNow; lastNow = now;
    if (ms <= 0 || ms > 120) return; // hidden tab / hitch: ignore
    clock += ms / 1000; sinceChange += ms / 1000; upBlockT -= ms / 1000;
    perf.frameMs += (ms - perf.frameMs) * 0.1;
    perf.fps = 1000 / perf.frameMs;
    winMs += ms; winN++; evalT += ms / 1000;
    if (evalT < 1) return;
    const avg = winMs / winN; winMs = 0; winN = 0; evalT = 0;
    if (game.settings?.dynamicRes === false) { if (renderer.getPixelRatio() !== basePR) applyPR(basePR); return; }
    if (avg > 19.5 && sinceChange > 2) {
      if (clock - lastUpAt < 5) upBlockT = 30; // the last step up was too much: stay put for a while
      applyPR(renderer.getPixelRatio() * (avg > 26 ? 0.82 : 0.9));
      goodT = 0;
    } else if (avg < 17.6) {
      goodT += 1;
      if (goodT >= 5 && sinceChange > 6 && upBlockT <= 0 && renderer.getPixelRatio() < basePR) {
        if (applyPR(renderer.getPixelRatio() * 1.08)) lastUpAt = clock;
        goodT = 0;
      }
    } else goodT = 0;
  }

  let failed = false;
  const api = {
    perf,
    setBasePixelRatio(pr) { applyPR(pr); },
    composer, bloom, grade, gtao, smaa,
    setSize,
    render(dt) {
      if (failed) { renderer.info.reset(); renderer.render(scene, camera); return; }
      try { renderImpl(dt); } catch (e) { failed = true; console.error('[post] render failed, falling back', e); renderer.render(scene, camera); }
    },
  };
  function renderImpl(dt) {
    {
      governor();
      renderer.info.reset();
      dt = dt || 0.016;
      time += dt;
      const env = game.env;
      const night = env?.nightFactor ?? 0;
      const day = env?.dayFactor ?? 1;

      // adaptive GTAO: only on 'high', and only while the frame rate can afford it (hysteresis)
      const ft = Math.min(dt, 0.1);
      frameAvg += (ft - frameAvg) * 0.05;
      if (gtao) {
        // GTAO re-renders the whole scene (G-buffer): only on 'ultra' at city scale
        const want = game.settings?.quality === 'ultra';
        if (!want) aoAllowed = false;
        else if (game.settings?.quality === 'ultra') aoAllowed = true;
        else {
          aoTimer += dt;
          if (aoAllowed && frameAvg > 1 / 50 && aoTimer > 2) { aoAllowed = false; aoTimer = 0; }
          else if (!aoAllowed && frameAvg < 1 / 62 && aoTimer > 6) { aoAllowed = true; aoTimer = 0; }
        }
        gtao.enabled = aoAllowed;
      }

      // bloom: more generous at night (neon), tasteful by day
      bloom.strength = 0.26 + 0.16 * night;
      bloom.radius = 0.45 + 0.1 * night;
      bloom.threshold = 0.95 - 0.2 * night;

      // speed streaks
      const st = game.player?.state;
      const kmh = st?.inVehicle && st.vehicle ? (st.vehicle.speedKmh || 0) : 0;
      const target = THREE.MathUtils.clamp((Math.abs(kmh) - 70) / 110, 0, 1);
      speedSmooth += (target - speedSmooth) * Math.min(1, dt * 3);
      gu.uSpeed.value = speedSmooth;

      // sun glare
      let sunOn = 0;
      if (env?.sunDir && day > 0.01) {
        camera.getWorldDirection(camDir);
        sunWorld.copy(camera.position).addScaledVector(env.sunDir, 1000);
        if (camDir.dot(env.sunDir) > 0) {
          sunNdc.copy(sunWorld).project(camera);
          const edge = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y));
          if (edge < 1.6) {
            gu.uSunPos.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
            sunOn = day * THREE.MathUtils.clamp((1.6 - edge) / 0.6, 0, 1);
            const c = env.sun.color;
            gu.uSunColor.value.set(c.r, c.g * 0.92, c.b * 0.8);
          }
        }
      }
      sunOn *= 1 - (env?.indoor || 0);
      gu.uSunOn.value = sunOn;
      // simple eye adaptation: stop down when staring into the sun, open up slightly otherwise
      const adaptTarget = 1.0 - 0.22 * sunOn * day;
      adapt += (adaptTarget - adapt) * Math.min(1, dt * 1.5);
      if (env?.exposure) renderer.toneMappingExposure = env.exposure * adapt;
      // god rays: only when the sun is on/near screen; stronger when low (golden hour)
      const low = 1 - THREE.MathUtils.smoothstep(env?.sunDir?.y ?? 1, 0.1, 0.5);
      gu.uRays.value = sunOn > 0 ? Math.min(1, sunOn * 1.5) * (0.45 + 0.55 * low) : 0;

      // grade: warmer, punchier at golden hour; cooler & bluer at night
      const golden = day * (1 - THREE.MathUtils.smoothstep(env?.sunDir?.y ?? 0.3, 0.05, 0.35));
      gu.uHighTint.value.set(0.03 + 0.03 * golden - 0.02 * night, 0.012 + 0.004 * golden - 0.005 * night, -0.025 - 0.02 * golden + 0.02 * night);
      gu.uShadowTint.value.set(-0.015 - 0.005 * night, 0.012, 0.03 + 0.02 * night);
      gu.uSat.value = (1.18 + 0.12 * golden) * (1 - 0.92 * (game.deathFade || 0));
      if (gu._vigBase === undefined) gu._vigBase = gu.uVignette.value;
      gu.uVignette.value = gu._vigBase + Math.max(0, 0.35 + 0.55 * (game.deathFade || 0) - gu._vigBase) * Math.min(1, (game.deathFade || 0) * 4);
      gu.uTime.value = time;
      gu.uUnder.value = env?.underwater || 0;
      if (env?.underwater) { gu.uSunOn.value = 0; gu.uRays.value = 0; }

      composer.render(dt);
      perf.drawCalls = renderer.info.render.calls;
      perf.triangles = renderer.info.render.triangles;
      perf.gtao = !!gtao?.enabled;
    }
  }
  return api;
}
