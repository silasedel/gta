// Stage 1: weather (GTA-style). One state at a time with smooth transitions:
//   clear, partly (partly cloudy), overcast, rain, storm (heavy rain, thunder, lightning), fog. No hurricanes.
// Each state lasts a few in-game hours, then a weighted random next state (fog prefers early morning; storms prefer
// afternoons, as in South Florida). Transitions take ~90 real seconds.
// What it drives (applied right after env.update each frame so nothing overwrites it):
//   sky (overcast deck, cloud cover, flash), sun intensity (shadows fade under cloud), hemisphere and fog (density and
//   color), exposure, wetness and puddles (src/render/wetSurfaces.js), rain streaks around the camera (1 draw call),
//   lightning flashes with delayed thunder, rain and wind audio beds (synthesized, on the ambience bus), game.wind
//   (src/world/env/wind.js reads game.weather.kind / .rain).
// API (game.weather):
//   kind ('clear'|'partly'|'overcast'|'rain'|'storm'|'fog'), target, blend (0..1 of the current transition),
//   rain 0..1, wetness 0..1, puddles 0..1, cloud 0..1, fog 0..1, storm 0..1,
//   set(kind, { instant }) force a state (it then holds for its normal duration); next() pick a new state now;
//   hold(true|false) stop / resume automatic changes; forecast: [{ hour, kind }] the next two states.
// Events: 'weather' { kind, prev } when a transition starts; 'lightning' { x, z, distance }.
import * as THREE from 'three';
import { WEATHER_U } from '../../render/wetSurfaces.js';

export const order = 8;

// per state: cloud (cumulus cover), deck (overcast layer 0..1), sun (direct light scale), fog (extra density, 1/m),
// rain (streak density 0..1), storm 0..1, hours (min,max duration), weight (by part of day: night, morning, afternoon)
const STATES = {
  clear:    { cloud: 0.30, deck: 0.0,  sun: 1.0,  fog: 0.0,     rain: 0,   storm: 0, hours: [4, 9], w: [5, 5, 4] },
  partly:   { cloud: 0.58, deck: 0.0,  sun: 0.95, fog: 0.0,     rain: 0,   storm: 0, hours: [3, 7], w: [3, 4, 5] },
  overcast: { cloud: 0.80, deck: 0.92, sun: 0.12, fog: 0.00045, rain: 0,   storm: 0, hours: [2, 5], w: [1.5, 1.5, 2] },
  rain:     { cloud: 0.90, deck: 0.97, sun: 0.14, fog: 0.0010,  rain: 0.55, storm: 0, hours: [1, 3], w: [1, 1, 1.6] },
  storm:    { cloud: 1.00, deck: 1.0,  sun: 0.06, fog: 0.0016,  rain: 1.0, storm: 1, hours: [1, 2], w: [0.4, 0.3, 1.3] },
  fog:      { cloud: 0.45, deck: 0.55, sun: 0.45, fog: 0.0065,  rain: 0,   storm: 0, hours: [1, 3], w: [1.2, 2.2, 0] },
};
const KINDS = Object.keys(STATES);
const lerp = (a, b, t) => a + (b - a) * t;

export async function initV2(game) {
  const env = game.env;
  if (!env || !env.sky) { console.warn('[weather] no environment'); return; }
  const skyU = env.sky.material.uniforms;
  const rng = (() => { let s = (Date.now() & 0xffff) + 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

  // live blended parameters
  const cur = { ...STATES.clear };
  let from = { ...STATES.clear }, to = STATES.clear, blend = 1, blendDur = 90;
  let kind = 'clear', target = 'clear', holdUntil = 0, holding = false;
  let wet = 0, puddles = 0;
  const flash = { v: 0, t: 0, next: 8, light: null };

  const W = game.weather = {
    get kind() { return blend >= 1 ? kind : target; },
    get target() { return target; },
    get blend() { return blend; },
    get rain() { return cur.rain; },
    get storm() { return cur.storm; },
    get cloud() { return Math.max(cur.cloud, cur.deck); },
    get fog() { return Math.min(1, cur.fog / 0.0065); },
    get wetness() { return wet; },
    get puddles() { return puddles; },
    forecast: [],
    // instant: jump straight to the state, including soaked ground if it rains (tests, filming, missions)
    set(k, o = {}) {
      if (!STATES[k]) return false;
      start(k, o.instant ? 0.01 : (o.seconds ?? 60));
      if (o.instant) { Object.assign(cur, STATES[k]); blend = 1; kind = k; if (STATES[k].rain > 0) { wet = 1; puddles = Math.min(1, 0.4 + STATES[k].rain); } else { wet = 0; puddles = 0; } }
      return true;
    },
    next() { start(pick(), 90); },
    hold(b = true) { holding = !!b; },
    states: KINDS,
  };

  function hourNow() { return ((game.timeOfDay ?? 12) % 24 + 24) % 24; }
  function gameHours() { return (game.day ?? 0) * 24 + hourNow(); }
  function part(h) { return h < 6 || h >= 20 ? 0 : h < 13 ? 1 : 2; }
  function pick(h = hourNow()) {
    const p = part(h); let sum = 0;
    const ws = KINDS.map((k) => { const w = k === kind ? STATES[k].w[p] * 0.35 : STATES[k].w[p]; sum += w; return w; });
    let r = rng() * sum;
    for (let i = 0; i < KINDS.length; i++) { r -= ws[i]; if (r <= 0) return KINDS[i]; }
    return 'clear';
  }
  function start(k, seconds) {
    const prev = kind;
    from = { ...cur }; to = STATES[k]; target = k; blend = 0; blendDur = Math.max(0.01, seconds);
    const [a, b] = STATES[k].hours; holdUntil = gameHours() + a + rng() * (b - a);
    planForecast();
    game.emit?.('weather', { kind: k, prev });
  }
  function planForecast() {
    const h1 = holdUntil % 24, n1 = pick(h1);
    W.forecast = [{ hour: +h1.toFixed(1), kind: n1 }];
  }
  // weather from the URL for tests and filming: ?weather=storm
  try { const q = new URLSearchParams(location.search).get('weather'); if (q && STATES[q]) { kind = q; target = q; Object.assign(cur, STATES[q]); from = { ...cur }; to = STATES[q]; holdUntil = gameHours() + 6; } else { holdUntil = gameHours() + 3; } } catch (e) { holdUntil = gameHours() + 3; }
  planForecast();

  // ---------------- rain streaks: one instanced mesh of thin quads, wrapped in a box around the camera ----------------
  const N = 9000, BOX = 34, HGT = 22;
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = rng(); }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = 0;
  const rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uCol: { value: new THREE.Color(0.7, 0.75, 0.8) }, uAlpha: { value: 0.3 }, uLen: { value: 0.9 } };
  const rainMat = new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false, blending: THREE.NormalBlending, fog: false,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; uniform float uLen; varying float vA; varying vec2 vUv;
      void main() {
        float speed = 8.5 + 2.5 * aSeed.w;
        vec3 base = vec3( aSeed.x, aSeed.y, aSeed.z ) * vec3( ${BOX * 2}.0, ${HGT}.0, ${BOX * 2}.0 );
        // fall + drift, wrapped into the box around the camera (no popping: box is large and edges fade)
        vec3 vel = vec3( uWind.x, -speed, uWind.y );
        vec3 p = base + vel * uTime;
        vec3 org = uCam - vec3( ${BOX}.0, ${HGT * 0.35}, ${BOX}.0 );
        p = mod( p - org, vec3( ${BOX * 2}.0, ${HGT}.0, ${BOX * 2}.0 ) ) + org;
        vec3 dir = normalize( vel );
        // camera-facing streak along the fall direction
        vec3 toCam = normalize( uCam - p );
        vec3 side = normalize( cross( dir, toCam ) ) * 0.016;
        vec3 wp = p + side * ( position.x ) + dir * ( position.y * uLen * ( 0.7 + 0.6 * aSeed.w ) );
        float d = length( uCam.xz - p.xz );
        vA = ( 1.0 - smoothstep( ${BOX * 0.7}, ${BOX}.0, d ) ) * smoothstep( 0.6, 2.0, length( uCam - p ) );
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uAlpha; varying float vA; varying vec2 vUv;
      void main() { float e = 1.0 - abs( vUv.x * 2.0 - 1.0 ); float a = uAlpha * vA * e * smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 1.0, 0.6, vUv.y ); if ( a < 0.003 ) discard; gl_FragColor = vec4( uCol, a ); }`,
  });
  const rain = new THREE.Mesh(geo, rainMat);
  rain.name = 'weather-rain'; rain.frustumCulled = false; rain.renderOrder = 10; rain.userData.noDetailCull = true;
  game.scene.add(rain);

  // lightning: a short-lived bright light from the sky (no shadows, cheap)
  flash.light = new THREE.DirectionalLight(0xcfd8ff, 0); flash.light.position.set(0.3, 1, 0.2); game.scene.add(flash.light);

  // ---------------- audio beds (synthesized noise, on the ambience bus) ----------------
  const au = { ready: false };
  function audioInit() {
    const A = game.audio, ctx = A?.ctx, bus = A?.ambienceBus;
    if (!ctx || !bus || au.ready) return;
    const mk = (secs) => { const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = 0.97 * l + 0.03 * w; d[i] = w * 0.6 + l * 2.2; } return b; };
    const src = ctx.createBufferSource(); src.buffer = mk(3); src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp).connect(lp).connect(g).connect(bus); src.start();
    au.rainG = g; au.rainLP = lp; au.ctx = ctx; au.bus = bus; au.noise = src.buffer; au.ready = true;
  }
  function thunder(dist) {
    if (!au.ready) return;
    const ctx = au.ctx, t0 = ctx.currentTime + Math.min(6, dist / 343);
    const s = ctx.createBufferSource(); s.buffer = au.noise; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(dist < 600 ? 900 : 260, t0); lp.frequency.exponentialRampToValueAtTime(90, t0 + 4);
    const g = ctx.createGain(); const peak = Math.min(1.2, 900 / Math.max(300, dist)) * 0.9;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + (dist < 600 ? 0.04 : 0.4)); g.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.5);
    s.connect(lp).connect(g).connect(au.bus); s.start(t0); s.stop(t0 + 6);
  }

  // ---------------- per frame ----------------
  const fogCol = new THREE.Color(), deckCol = new THREE.Color(), tmpC = new THREE.Color();
  let time = 0;
  function tick(dt) {
    dt = Math.min(dt || 0.016, 0.1); time += dt;
    // state machine
    if (!holding && blend >= 1 && gameHours() > holdUntil) start(pick(), 90);
    if (blend < 1) {
      blend = Math.min(1, blend + dt / blendDur);
      const t = blend * blend * (3 - 2 * blend);
      for (const k of ['cloud', 'deck', 'sun', 'fog', 'rain', 'storm']) cur[k] = lerp(from[k], to[k], t);
      if (blend >= 1) kind = target;
    }
    // wetness follows rain with lag: soaks in ~40 s of rain, dries over a few minutes after
    const raining = cur.rain > 0.05;
    wet = raining ? Math.min(1, wet + dt * cur.rain / 40 * 1.6) : Math.max(0, wet - dt / 240);
    puddles = raining ? Math.min(wet, puddles + dt * cur.rain / 90) : Math.max(0, puddles - dt / 420);
    const indoor = env.indoor || 0;
    WEATHER_U[0] = wet * (1 - indoor); WEATHER_U[1] = puddles * (1 - indoor); WEATHER_U[2] = cur.rain * (1 - indoor); WEATHER_U[3] = time;
    // lightning
    flash.v = Math.max(0, flash.v - dt * 7);
    if (cur.storm > 0.6) {
      flash.next -= dt;
      if (flash.next <= 0) {
        flash.next = 6 + rng() * 18;
        const dist = 250 + rng() * 2500, ang = rng() * Math.PI * 2;
        flash.v = dist < 800 ? 1.4 : 0.7; flash.t = 0;
        // double strike now and then
        if (rng() < 0.4) setTimeout(() => { flash.v = Math.max(flash.v, 0.9); }, 140 + rng() * 120);
        thunder(dist);
        const c = game.camera.position; game.emit?.('lightning', { x: c.x + Math.cos(ang) * dist, z: c.z + Math.sin(ang) * dist, distance: dist });
      }
    }
    // audio
    if (!au.ready && game.audio?.ctx) audioInit();
    if (au.ready) {
      const inCar = !!game.player?.state?.inVehicle;
      const v = cur.rain * (1 - 0.6 * indoor) * (inCar ? 0.55 : 1);
      au.rainG.gain.setTargetAtTime(v * 0.22, au.ctx.currentTime, 0.4);
      au.rainLP.frequency.setTargetAtTime(inCar || indoor > 0.5 ? 1800 : 7000, au.ctx.currentTime, 0.3);
    }
    // rain streaks
    const n = Math.round(N * cur.rain * (1 - indoor));
    geo.instanceCount = n; rain.visible = n > 0;
    if (n > 0) {
      rainU.uTime.value = time; rainU.uCam.value.copy(game.camera.position);
      const w = game.wind; rainU.uWind.value.set((w?.vx ?? 0) * 0.8, (w?.vz ?? 0) * 0.8);
      const night = env.nightFactor ?? 0;
      rainU.uCol.value.setRGB(lerp(0.62, 0.22, night), lerp(0.66, 0.25, night), lerp(0.72, 0.3, night));
      rainU.uAlpha.value = 0.24 + 0.2 * cur.rain;
      rainU.uLen.value = 0.7 + 0.5 * cur.rain;
    }
  }
  // applied after the environment wrote its time-of-day values (and before the post pass reads them)
  function apply() {
    const s = env.sunDir?.y ?? 0.5, day = env.dayFactor ?? 1, night = env.nightFactor ?? 0;
    const deck = cur.deck, gloom = Math.max(deck, cur.storm);
    // direct light: clouds block the sun (shadows fade with it)
    if (env.sun) env.sun.intensity *= cur.sun;
    // ambient: an overcast sky is a big soft light; brighter, greyer fill
    if (env.hemi) {
      env.hemi.intensity *= 1 + 0.9 * deck * day - 0.35 * cur.storm;
      tmpC.setRGB(0.55, 0.58, 0.62).multiplyScalar(lerp(1, 0.25, night));
      env.hemi.color.lerp(tmpC, 0.75 * deck);
      env.hemi.groundColor.lerp(tmpC.multiplyScalar(0.45), 0.6 * deck);
      // city glow: at night a cloud deck reflects the street lights back down (overcast city nights are brighter)
      const glow = night * deck;
      if (glow > 0.01) { env.hemi.intensity += 0.55 * glow; env.hemi.color.lerp(tmpC.setRGB(0.36, 0.28, 0.22), glow); env.hemi.groundColor.lerp(tmpC.setRGB(0.12, 0.09, 0.07), glow); }
    }
    // fog: denser and greyer
    const sf = game.scene.fog;
    if (sf) {
      sf.density += cur.fog * (1 - 0.8 * (env.indoor || 0));
      fogCol.setRGB(0.52, 0.55, 0.58).multiplyScalar(lerp(1, 0.08, night) * lerp(1, 0.55, cur.storm));
      sf.color.lerp(fogCol, Math.min(1, 0.8 * gloom + (cur.fog > 0.003 ? 0.6 : 0)));
    }
    // exposure: compensate part of the lost sunlight (cameras open up under cloud)
    if (env.exposure) env.exposure *= 1 + 0.22 * deck * day;
    game.renderer.toneMappingExposure = env.exposure ?? game.renderer.toneMappingExposure;
    // sky
    skyU.uCloudCover.value = Math.max(skyU.uCloudCover.value, cur.cloud * 0.62);
    skyU.uOvercast.value = deck;
    deckCol.setRGB(0.4, 0.425, 0.46).multiplyScalar(lerp(1, 0.035, night) * lerp(1, 0.5, cur.storm) * lerp(1, 0.75, 1 - THREE.MathUtils.smoothstep(s, 0.0, 0.3)));
    deckCol.lerp(tmpC.setRGB(0.085, 0.062, 0.05).multiplyScalar(lerp(1, 0.6, cur.storm)), night); // night: the deck glows with city light from below
    skyU.uOvercastCol.value.copy(deckCol);
    skyU.uFogColor.value.copy(sf ? sf.color : deckCol);
    skyU.uCloudSun.value.multiplyScalar(1 - 0.7 * deck);
    // lightning flash
    skyU.uFlash.value = flash.v;
    flash.light.intensity = flash.v * 2.2;
    if (flash.v > 0.01 && env.hemi) env.hemi.intensity += flash.v * 0.8;
    // the environment map is the sky: refresh it while the sky changes a lot
    if (blend < 1 && Math.floor(time * 0.5) !== Math.floor((time - 0.016) * 0.5)) env.regenerateEnvMap?.();
  }
  const envUpdate = env.update.bind(env);
  env.update = (dt) => { envUpdate(dt); try { apply(); } catch (e) { if (!W._err) { W._err = true; console.error('[weather] apply', e); } } };
  game.updaters.push(function weatherTick(dt) { try { tick(dt); } catch (e) { if (!W._err2) { W._err2 = true; console.error('[weather] tick', e); } } });
}
