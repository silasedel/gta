// SOUTHLINE: the cinematic director (main-menu track). One camera rig shared by the title screen, the wardrobe
// backdrop and the arrival intros. It never edits src/render: it adds one pass to the existing composer and wraps two
// existing passes from the outside.
//   const cin = getCinema(game);
//   cin.begin({ letterbox: true, dof: true, grain: 1.6 })      take the camera (game.cameraOverride)
//   cin.shot({ from: {pos, look}, to: {pos, look}, dur, fov, focus, ease })   current camera move (vectors or [x,y,z])
//   cin.crossfade(ms)      freeze the last frame on top and dissolve it into whatever renders next
//   cin.end()              hand the camera back
// Look: depth of field (golden-angle gather on a linear-depth copy), lens flare (ghosts, halo, anamorphic streak,
// occlusion-tested against the depth), extra grain and vignette during cinematics, CSS letterbox bars.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { LOOK_OFF } from '../../world/env/fogChunks.js';

const V = (v, out = new THREE.Vector3()) => (Array.isArray(v) ? out.set(v[0], v[1], v[2]) : v?.isVector3 ? out.copy(v) : typeof v === 'function' ? V(v(), out) : v ? out.set(v.x, v.y, v.z) : out.set(0, 0, 0));
/** Vertical field of view (degrees) of a full-frame lens of `mm` focal length (24 mm sensor height). */
export const mmToFov = (mm) => 2 * Math.atan(12 / mm) * 180 / Math.PI;
export const EASE = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  // long, soft ends (dolly on a slider)
  slider: (t) => { const s = t * t * t * (t * (t * 6 - 15) + 10); return 0.15 * t + 0.85 * s; },
};

// ---------------------------------------------------------------- shaders
const DepthCopyShader = {
  uniforms: { tDepth: { value: null }, uNear: { value: 0.25 }, uFar: { value: 8000 }, uFocus: { value: 10 }, uAperture: { value: 1 }, uMaxCoc: { value: 12 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDepth; uniform float uNear, uFar, uFocus, uAperture, uMaxCoc; varying vec2 vUv;
    void main() {
      float d = texture2D(tDepth, vUv).x;
      float z = d >= 0.99999 ? uFar : -perspectiveDepthToViewZ(d, uNear, uFar);
      // circle of confusion in pixels (thin-lens style: |1/focus - 1/depth|), signed: negative = in front of the focus
      float c = (1.0 / uFocus - 1.0 / max(z, 0.05)) * uAperture;
      gl_FragColor = vec4(z, clamp(c, -1.0, 1.0) * uMaxCoc, (d >= 0.99999 || z > 2500.0) ? 1.0 : 0.0, 1.0);
    }`,
};
const CinemaShader = {
  uniforms: {
    tDiffuse: { value: null }, tCoc: { value: null }, uPixel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uAspect: { value: 16 / 9 },
    uDof: { value: 1 }, uMaxCoc: { value: 12 }, uRadScale: { value: 1.4 },
    uSunPos: { value: new THREE.Vector2(0.5, 0.5) }, uSunOn: { value: 0 }, uSunColor: { value: new THREE.Vector3(1, 0.8, 0.6) }, uFlare: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tCoc; uniform vec2 uPixel, uSunPos; uniform float uAspect, uDof, uMaxCoc, uRadScale, uSunOn, uFlare; uniform vec3 uSunColor;
    varying vec2 vUv;
    const float GOLDEN = 2.39996323;
    vec3 dof(vec2 uv) {
      vec4 c0 = texture2D(tCoc, uv);
      vec3 col = texture2D(tDiffuse, uv).rgb;
      float cs = abs(c0.y);
      float tot = 1.0, r = uRadScale, ang = 0.0;
      for (int i = 0; i < 160; i++) {
        if (r >= uMaxCoc) break;
        vec2 tc = uv + vec2(cos(ang), sin(ang)) * uPixel * r;
        vec3 sc = texture2D(tDiffuse, tc).rgb;
        vec4 cc = texture2D(tCoc, tc);
        float ss = abs(cc.y);
        if (cc.x > c0.x) ss = clamp(ss, 0.0, cs * 2.0);            // background never bleeds over a sharper foreground
        float m = smoothstep(r - 0.5, r + 0.5, ss);
        col += mix(col / tot, sc, m); tot += 1.0;
        r += uRadScale / r; ang += GOLDEN;
      }
      return col / tot;
    }
    float occl() {                                                // fraction of sky around the sun (1 = unblocked)
      float s = 0.0;
      for (int i = 0; i < 9; i++) { vec2 o = vec2(float(i % 3) - 1.0, float(i / 3) - 1.0) * vec2(0.006 / uAspect, 0.006); s += texture2D(tCoc, clamp(uSunPos + o, 0.001, 0.999)).z; }
      return s / 9.0;
    }
    vec3 flare(vec2 uv) {
      vec2 sp = uSunPos; vec2 toC = vec2(0.5) - sp;
      float vis = occl() * uSunOn * uFlare;
      if (vis <= 0.001) return vec3(0.0);
      vec3 acc = vec3(0.0);
      vec2 a = vec2(uAspect, 1.0);
      // ghosts along the sun-center axis
      for (int k = 0; k < 6; k++) {
        float t = float(k) * 0.37 + 0.35, rad = 0.018 + 0.03 * fract(float(k) * 0.618);
        vec2 gp = sp + toC * 2.0 * t;
        float d = length((uv - gp) * a);
        float disc = smoothstep(rad, rad * 0.55, d) * (0.6 + 0.4 * smoothstep(0.0, rad, d));
        vec3 tint = mix(vec3(0.35, 0.9, 0.85), vec3(1.0, 0.45, 0.3), fract(float(k) * 0.43));
        acc += tint * disc * 0.05;
      }
      // halo ring around the frame center opposite the sun
      vec2 hp = sp + toC * 1.0;
      float hd = length((uv - hp) * a);
      acc += vec3(1.0, 0.55, 0.35) * smoothstep(0.03, 0.0, abs(hd - 0.32)) * 0.03;
      // anamorphic streak and soft glow at the sun
      vec2 dv = (uv - sp) * a;
      acc += uSunColor * exp(-abs(dv.y) * 260.0) * exp(-abs(dv.x) * 2.2) * 0.55;
      acc += uSunColor * exp(-length(dv) * 9.0) * 0.35;
      return acc * vis;
    }
    void main() {
      vec3 c = uDof > 0.5 ? dof(vUv) : texture2D(tDiffuse, vUv).rgb;
      c += flare(vUv);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// ---------------------------------------------------------------- DOM: letterbox + crossfade layer
const CSS = `
.pm-cine { position: fixed; inset: 0; pointer-events: none; z-index: 45; }
.pm-cine-bar { position: absolute; left: 0; right: 0; height: var(--pm-bar, 11.5vh); background: #000; transform: scaleY(0); transition: transform 1.4s cubic-bezier(.65,0,.35,1); }
.pm-cine-bar.t { top: 0; transform-origin: 50% 0; } .pm-cine-bar.b { bottom: 0; transform-origin: 50% 100%; }
.pm-cine.lb .pm-cine-bar { transform: scaleY(1); }
.pm-cine-fade { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; object-fit: cover; }
.pm-cine-black { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity .6s ease; }
`;

let single = null;
export function getCinema(game) {
  if (single) return single;
  const { renderer, camera } = game;
  const post = game.post;
  const state = {
    active: false, expo: 1, bloomK: 1, stage: null, stageExposure: 1, dof: true, flare: true, grain: 1, vignette: 0, letterbox: false,
    shot: null, t: 0, focus: 8, aperture: 1, maxCoc: 10, fov: camera.fov, roll: 0,
  };
  // ---- DOM
  if (!document.getElementById('pm-cine-css')) { const st = document.createElement('style'); st.id = 'pm-cine-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.className = 'pm-cine';
  root.innerHTML = '<canvas class="pm-cine-fade"></canvas><div class="pm-cine-black"></div><div class="pm-cine-bar t"></div><div class="pm-cine-bar b"></div>';
  document.body.appendChild(root);
  const fadeCv = root.querySelector('.pm-cine-fade'), fadeCx = fadeCv.getContext('2d'), black = root.querySelector('.pm-cine-black');
  const barH = () => { const ar = innerWidth / Math.max(1, innerHeight), want = 2.2; document.documentElement.style.setProperty('--pm-bar', ar >= want ? '0px' : Math.min(8.5, (1 - ar / want) * 50).toFixed(2) + 'vh'); };
  barH(); addEventListener('resize', barH);

  // ---- render hooks (only when post exists and has a composer)
  let pass = null, depthRT = null, copyQuad = null;
  const comp = post?.composer;
  if (comp && post.grade) {
    try {
      copyQuad = new FullScreenQuad(new THREE.ShaderMaterial({ ...DepthCopyShader, uniforms: THREE.UniformsUtils.clone(DepthCopyShader.uniforms), depthTest: false, depthWrite: false }));
      depthRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      pass = new ShaderPass(CinemaShader);
      pass.enabled = false;
      const outIdx = comp.passes.findIndex((p) => p.isOutputPass || p.constructor?.name === 'OutputPass');
      comp.insertPass(pass, outIdx >= 0 ? outIdx : comp.passes.length - 2);
      // after the scene render: copy linear depth + CoC from the scene buffer (the depth attachment is not bound then)
      const rp = comp.passes[0];
      const prevRender = rp.render.bind(rp);
      rp.render = (r, wb, rb, dt, mask) => {
        if (state.stage) { rp.scene = state.stage; r.toneMappingExposure = state.stageExposure; } else if (rp.scene !== game.scene) rp.scene = game.scene;
        if (state.active && !state.stage) { r.toneMappingExposure *= state.expo; if (post.bloom) post.bloom.strength *= state.bloomK; }
        prevRender(r, wb, rb, dt, mask);
        if (!pass.enabled || !rb?.depthTexture) return;
        if (depthRT.width !== rb.width || depthRT.height !== rb.height) depthRT.setSize(rb.width, rb.height);
        const u = copyQuad.material.uniforms;
        // look track: with MSAA the scene depth lives in post.sceneDepth
        u.tDepth.value = post.sceneDepth || rb.depthTexture; u.uNear.value = camera.near; u.uFar.value = camera.far;
        u.uFocus.value = Math.max(0.3, state.focus); u.uAperture.value = state.aperture; u.uMaxCoc.value = state.maxCoc * (rb.width / Math.max(1, innerWidth)) ;
        const prevRT = r.getRenderTarget();
        r.setRenderTarget(depthRT); copyQuad.render(r); r.setRenderTarget(prevRT);
        pass.uniforms.tCoc.value = depthRT.texture;
        pass.uniforms.uPixel.value.set(1 / rb.width, 1 / rb.height);
        pass.uniforms.uMaxCoc.value = u.uMaxCoc.value;
        pass.uniforms.uRadScale.value = Math.max(1.1, 1.35 * rb.width / Math.max(1, innerWidth));
        pass.uniforms.uAspect.value = rb.width / Math.max(1, rb.height);
      };
    } catch (e) { console.warn('[cinema] post hooks unavailable', e); pass = null; }
    // grade: grain / vignette / motion blur follow the settings; cinematics add their own look on top
    const gu = post.grade.uniforms, baseGrain = gu.uGrain.value;
    const prevGrade = post.grade.render.bind(post.grade);
    post.grade.render = (r, wb, rb, dt, mask) => {
      const S = game.settings || {};
      const g = Number.isFinite(S.filmGrain) ? S.filmGrain * 2 : 1;
      gu.uGrain.value = baseGrain * g * (state.active ? state.grain : 1);
      if (S.motionBlur === false) gu.uSpeed.value = 0;
      if (state.stage) { gu.uSunOn.value = 0; gu.uRays.value = 0; gu.uSpeed.value = 0; }
      if (state.active) { gu.uVignette.value += state.vignette; gu.uSunOn.value *= 0.35; gu.uRays.value *= 0.35; }
      if (pass && pass.enabled) {                       // lens flare follows the post's own sun tracking
        pass.uniforms.uSunPos.value.copy(gu.uSunPos.value); pass.uniforms.uSunOn.value = gu.uSunOn.value;
        pass.uniforms.uSunColor.value.copy(gu.uSunColor.value);
      }
      prevGrade(r, wb, rb, dt, mask);
    };
  }
  // crossfade snapshot: drawn right after the frame renders (the drawing buffer is still valid in the same task)
  let snapWant = null;
  if (post?.render) {
    const prev = post.render;
    post.render = (dt) => { blendIn(dt); prev(dt); if (snapWant) { const cb = snapWant; snapWant = null; try { cb(); } catch (e) { console.warn('[cinema] snapshot', e); } } };
  }

  // ---- handoff: after end(), blend from the last cinematic pose into whatever camera the game computed this frame
  const hand = { t: 0, dur: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 60 };
  function blendIn(dt) {
    if (hand.t >= hand.dur || state.active) return;
    hand.t = Math.min(hand.dur, hand.t + dt);
    const k = EASE.inOut(hand.t / hand.dur), cam = camera;
    cam.position.lerpVectors(hand.p, cam.position, k);
    cam.quaternion.slerpQuaternions(hand.q, cam.quaternion, k);
    cam.fov = hand.fov + (cam.fov - hand.fov) * k; cam.updateProjectionMatrix();
  }
  // ---- camera rig
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), L0 = new THREE.Vector3(), L1 = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3(), fp = new THREE.Vector3();
  const shake = { t: Math.random() * 100 };
  function override(dt, cam) {
    if (!state.active) return false;
    const s = state.shot;
    if (!s) return true;
    state.t = Math.min(s.dur, state.t + dt * (s.speed ?? 1));
    const k = (s.ease || EASE.slider)(s.dur > 0 ? state.t / s.dur : 1);
    if (s.from) { V(s.from.pos, P0); V(s.to?.pos ?? s.from.pos, P1); V(s.from.look, L0); V(s.to?.look ?? s.from.look, L1); tmpP.lerpVectors(P0, P1, k); tmpL.lerpVectors(L0, L1, k); }
    if (s.orbit) {                                   // orbit: angle sweep around a center (from.look)
      const o = s.orbit, a = o.a0 + (o.a1 - o.a0) * k, r = o.r0 + ((o.r1 ?? o.r0) - o.r0) * k, h = o.h0 + ((o.h1 ?? o.h0) - o.h0) * k;
      V(o.center, tmpL); tmpP.set(tmpL.x + Math.sin(a) * r, tmpL.y + h, tmpL.z + Math.cos(a) * r);
      if (o.lookOffset) tmpL.y += o.lookOffset;
      if (o.side) { const dx = tmpL.x - tmpP.x, dz = tmpL.z - tmpP.z, l = Math.hypot(dx, dz) || 1; tmpL.x -= (-dz / l) * o.side; tmpL.z -= (dx / l) * o.side; }
    }
    // never under the ground (crane moves that end low, sloped streets): cheap height query, cinematics only
    if (s.clampGround !== false && !state.stage) { const g = game.city?.groundHeightAt?.(tmpP.x, tmpP.z, tmpP.y); if (Number.isFinite(g) && tmpP.y < g + 0.35) tmpP.y = g + 0.35; }
    // handheld: an operator's slow drift as small rotations (layered incommensurate sines = no visible loop), not a
    // positional wobble; longer lenses magnify it the way a real one does, so it is scaled by the field of view
    shake.t += dt;
    const amp = (s.handheld ?? 0.6) * (game.uiSettings?.get?.('reducedMotion') ? 0 : 1);
    const fov = s.fov1 != null ? s.fov + (s.fov1 - s.fov) * k : (s.fov ?? 40);
    cam.position.copy(tmpP); cam.up.set(0, 1, 0); cam.lookAt(tmpL);
    if (amp > 0) {
      const t = shake.t, lens = Math.min(1.4, Math.max(0.45, fov / 40)) * amp;
      cam.rotateY((Math.sin(t * 0.61) * 0.6 + Math.sin(t * 1.43 + 1.1) * 0.28 + Math.sin(t * 3.1 + 0.3) * 0.08) * 0.0042 * lens);
      cam.rotateX((Math.sin(t * 0.47 + 2.0) * 0.6 + Math.sin(t * 1.21 + 0.6) * 0.3 + Math.sin(t * 2.7 + 1.9) * 0.08) * 0.0032 * lens);
      cam.rotateZ((Math.sin(t * 0.39 + 0.8) * 0.7 + Math.sin(t * 0.97 + 2.4) * 0.3) * 0.0022 * lens);
    }
    if (s.roll) cam.rotateZ(s.roll);
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // focus: a point (distance to it), a number, or the look target
    if (s.focus != null) state.focus = typeof s.focus === 'number' ? s.focus : V(s.focus, fp).distanceTo(tmpP);
    else state.focus = tmpL.distanceTo(tmpP);
    if (s.focus1 != null) { const f1 = typeof s.focus1 === 'number' ? s.focus1 : V(s.focus1, fp).distanceTo(tmpP), r = EASE.inOut(Math.min(1, Math.max(0, (k - 0.35) / 0.4))); state.focus += (f1 - state.focus) * r; }
    // look track (z-fighting): the near plane follows the shot's focus distance. Wide skyline shots get up to 1.5 m
    // (depth precision far away is about 7x better than at 0.2), close-ups keep 0.2.
    if (!LOOK_OFF) {
      const wantNear = Math.min(1.5, Math.max(0.2, state.focus * 0.02));
      if (Math.abs(cam.near - wantNear) > 0.02) {
        cam.near = wantNear;
        cam.updateProjectionMatrix();
      }
    }
    state.aperture = s.aperture ?? 1.2;
    state.maxCoc = s.maxCoc ?? 11;
    return true;
  }

  const api = {
    get active() { return state.active; },
    state, root,
    begin(o = {}) {
      state.active = true; state.grain = o.grain ?? 1.6; state.vignette = o.vignette ?? 0.12; state.expo = o.exposure ?? 0.86; state.bloomK = o.bloom ?? 0.65;
      api.setLook(o);
      game.cameraOverride = override; api._owner = o.owner || 'cinema';
      if (game.camera) { game.camera.near = 0.2; game.camera.updateProjectionMatrix(); }
    },
    setLook(o = {}) {
      const S = game.settings || {};
      state.dof = (o.dof ?? true) && S.depthOfField !== false;
      state.flare = (o.flare ?? true) && S.lensFlare !== false;
      if (pass) { pass.enabled = state.active && (state.dof || state.flare); pass.uniforms.uDof.value = state.dof ? 1 : 0; pass.uniforms.uFlare.value = state.flare ? (o.flareGain ?? 0.2) : 0; }
      api.letterbox(o.letterbox ?? state.letterbox);
    },
    letterbox(on) { state.letterbox = !!on; root.classList.toggle('lb', !!on && (game.settings?.letterbox !== false)); },
    shot(s) { state.shot = { dur: 10, ...s }; state.t = 0; if (s.fov != null && game.camera) { game.camera.fov = s.fov; game.camera.updateProjectionMatrix(); } },
    get progress() { const s = state.shot; return s ? state.t / s.dur : 1; },
    /** Freeze the next rendered frame on top and dissolve it over `ms`. Optional hold (promise) keeps it up until resolved. */
    crossfade(ms = 1400, hold = null) {
      return new Promise((resolve) => {
        snapWant = () => {
          const c = renderer.domElement, w = Math.max(2, Math.floor(c.width / 2)), h = Math.max(2, Math.floor(c.height / 2));
          if (fadeCv.width !== w || fadeCv.height !== h) { fadeCv.width = w; fadeCv.height = h; }
          fadeCx.drawImage(c, 0, 0, w, h);
          fadeCv.style.transition = 'none'; fadeCv.style.opacity = '1'; fadeCv.style.transform = 'scale(1)';
          resolve();
          Promise.resolve(hold).then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
            fadeCv.style.transition = `opacity ${ms}ms cubic-bezier(.4,0,.2,1), transform ${ms}ms linear`;
            fadeCv.style.opacity = '0'; fadeCv.style.transform = 'scale(1.025)';
          })));
        };
      });
    },
    cancelFade() { snapWant = null; fadeCv.style.transition = 'none'; fadeCv.style.opacity = '0'; },
    /** Fade to / from black (ms). */
    black(on, ms = 600) { black.style.transition = `opacity ${ms}ms ease`; black.style.opacity = on ? '1' : '0'; return new Promise((r) => setTimeout(r, ms)); },
    /** Render another scene through the full post chain (wardrobe stage). null restores the world. */
    stage(scene, o = {}) { state.stage = scene || null; state.stageExposure = o.exposure ?? 1; },
    handoff(ms = 1000) { hand.p.copy(camera.position); hand.q.copy(camera.quaternion); hand.fov = camera.fov; hand.t = 0; hand.dur = ms / 1000; },
    end() {
      state.active = false; state.shot = null;
      if (pass) pass.enabled = false;
      if (game.cameraOverride === override) game.cameraOverride = null;
      api.letterbox(false);
      if (game.camera) { game.camera.near = 0.25; game.camera.updateProjectionMatrix(); }
    },
    /** Streaming readiness around a point: near tiles built, few jobs pending. */
    streamReady(x, z, r = 260) {
      const st = game.city?.streamer; if (!st) return true;
      let ok = true;
      for (const t of st.tiles.values()) { if (Math.hypot(t.cx - x, t.cz - z) < r && !t.near && (t.job || t.d < 330)) { ok = false; break; } }
      return ok && (st.pending?.() ?? 0) < 4;
    },
    waitStream(x, z, maxMs = 5000, r = 260) {
      const t0 = performance.now();
      return new Promise((res) => { const tick = () => { if (api.streamReady(x, z, r) || performance.now() - t0 > maxMs) res(); else setTimeout(tick, 120); }; tick(); });
    },
  };
  single = api;
  game.cinema = api;
  return api;
}
