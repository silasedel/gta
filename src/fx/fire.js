// Southline V2: realistic fire, fireballs, embers and dark smoke (playtest-fixes track).
// Replaces the flat orange point sprites ("bubbling balls") used for burning cars, molotovs and explosions.
//   - Flames: camera-facing (around the vertical axis) sheets with a noise-driven flame shader: fbm turbulence
//     scrolling upward, a teardrop envelope that tears into tongues at the top, and a black-body color ramp
//     (deep red -> orange -> yellow -> near white in the core). Soft additive blending, HDR core for bloom.
//   - Fireballs: the same shader in a radial mode that billows out and burns down into smoke.
//   - Embers: tiny additive points that rise, drift with the wind and flicker out.
//   - Smoke: dark, noise-eroded puffs (normal blending) that rise, spread, thin out and drift with the wind;
//     young puffs are lit orange from below by the fire.
// One draw call each for flames, smoke and embers. Everything is pooled; nothing is allocated per frame.
//
//   const fire = createFireSystem(THREE, scene, { wind: () => game.wind });
//   fire.burn(key, pos, size)        call every frame while something burns (fades out ~1 s after the last call)
//   fire.explode(pos, radius)        one fireball with smoke and embers
//   fire.update(dt, camera)

const FLAME_MAX = 96;
const SMOKE_MAX = 220;
const EMBER_MAX = 320;

const NOISE_GLSL = /* glsl */`
float fHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float fNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = fHash(i);
  float b = fHash(i + vec2(1.0, 0.0));
  float c = fHash(i + vec2(0.0, 1.0));
  float d = fHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * fNoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

const BILLBOARD_VERT = /* glsl */`
attribute vec4 iPosSize;   // xyz position (base of a flame, center of smoke), w = width
attribute vec4 iParams;    // x height, y seed, z intensity / opacity, w mode or age
varying vec2 vUv;
varying vec4 vParams;
varying float vDist;
void main() {
  vUv = uv;
  vParams = iParams;
  vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec3 up = BILLBOARD_UP;
  vec3 wp = iPosSize.xyz + right * position.x * iPosSize.w + up * position.y * iParams.x;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FLAME_FRAG = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying vec4 vParams;
${NOISE_GLSL}
vec3 blackBody(float h) {
  vec3 c = mix(vec3(0.25, 0.015, 0.0), vec3(1.0, 0.22, 0.02), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(1.0, 0.55, 0.12), smoothstep(0.3, 0.6, h));
  c = mix(c, vec3(1.0, 0.86, 0.45), smoothstep(0.55, 0.85, h));
  c = mix(c, vec3(1.0, 0.97, 0.86), smoothstep(0.85, 1.0, h));
  return c;
}
void main() {
  float seed = vParams.y;
  float inten = vParams.z;
  float mode = vParams.w;
  float t = uTime;
  float heat;
  if (mode < 0.5) {
    // flame sheet: base at uv.y = 0, tongues tear off toward the top
    vec2 p = vec2(vUv.x - 0.5, vUv.y);
    float sway = (fNoise(vec2(seed * 7.0, t * 0.9)) - 0.5) * 0.4 * p.y;
    p.x += sway;
    float turb = fFbm(vec2(p.x * 2.6 + seed * 11.0, p.y * 2.0 - t * 2.4));
    float fine = fFbm(vec2(p.x * 6.5 - seed * 5.0, p.y * 5.0 - t * 4.4));
    // the body narrows upward and tears into separate tongues (horizontal warp grows with height)
    float width = mix(0.5, 0.16, pow(p.y, 0.9));
    float warp = (turb - 0.5) * 0.65 * p.y + (fine - 0.5) * 0.18;
    float env = 1.0 - smoothstep(width * 0.35, width, abs(p.x + warp));
    env *= smoothstep(0.0, 0.1, p.y);
    float tear = smoothstep(0.25, 0.75, fine + 0.35 - p.y * 0.55);
    heat = env * (0.5 + 0.6 * turb) * mix(1.0, tear, smoothstep(0.2, 0.7, p.y)) - p.y * 0.42;
    heat = clamp(heat * 1.35, 0.0, 1.0);
  } else {
    // fireball: a billowing radial mass that burns down as it ages (age in mode - 1, 0..1)
    float age = clamp(mode - 1.0, 0.0, 1.0);
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float ang = atan(p.y, p.x);
    float bill = fFbm(vec2(ang * 2.4 + seed * 9.0, r * 3.0 - t * 1.5 - age * 3.0));
    float edge = 0.62 + 0.42 * bill;
    float body = 1.0 - smoothstep(edge * 0.45, edge, r);
    // billowing lobes: a mottled mass of hot and cooler pockets, not a smooth disc
    float core = fFbm(p * 6.0 + vec2(seed * 3.0, -t * 2.0 - age * 4.0));
    float lobes = fFbm(p * 11.0 + vec2(-seed * 4.0, -t * 3.0));
    heat = body * (0.3 + 0.55 * core + 0.3 * lobes) * (1.0 - age * 0.95) - age * 0.5 * (1.0 - core);
    heat = clamp(heat * 1.1, 0.0, 1.0);
  }
  float a = smoothstep(0.03, 0.3, heat) * inten;
  if (a < 0.003) discard;
  // mostly orange and red; only the hottest core goes yellow-white and bright enough to bloom
  vec3 col = blackBody(heat * 0.85) * (0.7 + 1.2 * heat * heat * heat);
  // premultiplied, partly occluding: the flame adds light but also hides some of what is behind it, so it
  // stays orange against a bright sky instead of washing out to white
  gl_FragColor = vec4(col * a, a * (mode < 0.5 ? 0.45 : 0.7));
}
`;

const SMOKE_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uSmokeLight;
varying vec2 vUv;
varying vec4 vParams;
${NOISE_GLSL}
void main() {
  float seed = vParams.y;
  float op = vParams.z;
  float age = vParams.w;
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float n = fFbm(p * 2.6 + vec2(seed * 13.0, seed * 7.0 - uTime * 0.12));
  float n2 = fFbm(p * 6.0 + vec2(-seed * 5.0, uTime * 0.2));
  float shape = (1.0 - smoothstep(0.35 + 0.35 * n, 1.0, r + (n2 - 0.5) * 0.35)) * (1.0 - smoothstep(0.8, 0.98, r));
  float a = shape * op * (0.55 + 0.6 * n);
  if (a < 0.004) discard;
  // soot color, lit by the day light; the youngest puffs glow from the fire below them
  vec3 soot = mix(vec3(0.045, 0.04, 0.038), vec3(0.16, 0.15, 0.14), n2) * uSmokeLight;
  float glow = (1.0 - smoothstep(0.0, 0.25, age)) * (1.0 - smoothstep(-0.4, 0.3, p.y));
  vec3 col = soot + vec3(1.0, 0.38, 0.08) * glow * 0.3;
  gl_FragColor = vec4(col, a);
}
`;

const EMBER_VERT = /* glsl */`
attribute float aSize;
attribute float aGlow;
uniform float uScale;
varying float vGlow;
void main() {
  vGlow = aGlow;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * uScale / max(0.5, -mv.z));
}
`;
const EMBER_FRAG = /* glsl */`
varying float vGlow;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0 || vGlow < 0.01) discard;
  float a = (1.0 - r * r) * vGlow;
  vec3 c = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.8, 0.4), vGlow) * 3.0;
  gl_FragColor = vec4(c * a, a);
}
`;

function makeBillboards(THREE, max, fragmentShader, blending, uniforms, up) {
  const base = new THREE.PlaneGeometry(1, 1);
  if (up === 'flame') {
    base.translate(0, 0.5, 0);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const posSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const params = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  posSize.setUsage(THREE.DynamicDrawUsage);
  params.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPosSize', posSize);
  geo.setAttribute('iParams', params);
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BILLBOARD_VERT.replace('BILLBOARD_UP', up === 'flame' ? 'vec3(0.0, 1.0, 0.0)' : 'normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]))'),
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
    side: THREE.DoubleSide,
  });
  if (blending === THREE.CustomBlending) {
    // premultiplied "over" with partial alpha: color already carries alpha
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.blendSrcAlpha = THREE.ZeroFactor;
    mat.blendDstAlpha = THREE.OneFactor;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, geo, posSize, params };
}

export function createFireSystem(THREE, scene, opts = {}) {
  const uTime = { value: 0 };
  const uSmokeLight = { value: new THREE.Vector3(1, 1, 1) };
  const flames = makeBillboards(THREE, FLAME_MAX, FLAME_FRAG, THREE.CustomBlending, { uTime }, 'flame');
  flames.mesh.name = 'fx-fire-flames';
  flames.mesh.renderOrder = 6;
  const smoke = makeBillboards(THREE, SMOKE_MAX, SMOKE_FRAG, THREE.NormalBlending, { uTime, uSmokeLight }, 'smoke');
  smoke.mesh.name = 'fx-fire-smoke';
  smoke.mesh.renderOrder = 5;

  const ePos = new Float32Array(EMBER_MAX * 3);
  const eSize = new Float32Array(EMBER_MAX);
  const eGlow = new Float32Array(EMBER_MAX);
  const eVel = new Float32Array(EMBER_MAX * 3);
  const eLife = new Float32Array(EMBER_MAX);
  const eMax = new Float32Array(EMBER_MAX);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage));
  eGeo.setAttribute('aSize', new THREE.BufferAttribute(eSize, 1).setUsage(THREE.DynamicDrawUsage));
  eGeo.setAttribute('aGlow', new THREE.BufferAttribute(eGlow, 1).setUsage(THREE.DynamicDrawUsage));
  eGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const uScale = { value: 600 };
  const eMat = new THREE.ShaderMaterial({
    uniforms: { uScale },
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const embers = new THREE.Points(eGeo, eMat);
  embers.name = 'fx-fire-embers';
  embers.frustumCulled = false;
  embers.renderOrder = 7;
  scene.add(flames.mesh, smoke.mesh, embers);

  // one warm light that follows the strongest fire near the camera (a fixed light: the count never changes)
  const light = new THREE.PointLight(0xff7a2a, 0, 22, 1.6);
  light.castShadow = false;
  light.name = 'fx-fire-light';
  scene.add(light);

  const fires = new Map();
  const smokeP = [];
  for (let i = 0; i < SMOKE_MAX; i++) {
    smokeP.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, s1: 3, life: 0, max: 1, op: 0.5, seed: Math.random() });
  }
  let smokeNext = 0;
  let emberNext = 0;
  const balls = [];
  for (let i = 0; i < 8; i++) {
    balls.push({ alive: false, x: 0, y: 0, z: 0, r: 1, t: 0, dur: 1, seed: Math.random() });
  }
  let time = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const windV = { x: 0, z: 0 };

  function readWind() {
    const w = opts.wind?.();
    if (w && w.dir) {
      windV.x = (w.dir.x || 0) * (w.speed || 0);
      windV.z = (w.dir.y ?? w.dir.z ?? 0) * (w.speed || 0);
    } else {
      windV.x = 0.4;
      windV.z = 0.1;
    }
  }

  function puff(x, y, z, size, op, life, vy) {
    const p = smokeP[smokeNext];
    smokeNext = (smokeNext + 1) % SMOKE_MAX;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = rnd(-0.25, 0.25);
    p.vy = vy;
    p.vz = rnd(-0.25, 0.25);
    p.s0 = size;
    p.s1 = size * rnd(3.0, 4.5);
    p.life = 0;
    p.max = life;
    p.op = op;
    p.seed = Math.random();
  }

  function ember(x, y, z, speed) {
    const i = emberNext;
    emberNext = (emberNext + 1) % EMBER_MAX;
    ePos[i * 3] = x;
    ePos[i * 3 + 1] = y;
    ePos[i * 3 + 2] = z;
    eVel[i * 3] = rnd(-0.6, 0.6) * speed;
    eVel[i * 3 + 1] = rnd(1.2, 3.4) * speed;
    eVel[i * 3 + 2] = rnd(-0.6, 0.6) * speed;
    eLife[i] = 0;
    eMax[i] = rnd(0.8, 2.4);
    eSize[i] = rnd(0.03, 0.07);
  }

  function burn(key, pos, size = 1) {
    let f = fires.get(key);
    if (!f) {
      f = { x: pos.x, y: pos.y, z: pos.z, size, k: 0, last: time, smokeAcc: 0, emberAcc: 0, tongues: [] };
      const n = 4 + Math.round(size * 3);
      for (let i = 0; i < n; i++) {
        const lead = i < 2;
        f.tongues.push({
          ox: rnd(-0.55, 0.55) * size,
          oz: rnd(-0.55, 0.55) * size,
          w: (lead ? rnd(1.2, 1.6) : rnd(0.7, 1.2)) * size,
          h: (lead ? rnd(2.0, 2.7) : rnd(1.1, 2.0)) * size,
          seed: Math.random(),
          phase: Math.random() * 6.28,
        });
      }
      fires.set(key, f);
    }
    f.x = pos.x;
    f.y = pos.y;
    f.z = pos.z;
    f.size = size;
    f.last = time;
    return f;
  }

  function explode(pos, radius = 7.5) {
    const k = Math.max(0.4, radius / 7.5);
    const b = balls.find((q) => !q.alive) || balls[0];
    b.alive = true;
    b.x = pos.x;
    b.y = pos.y + 1.2 * k;
    b.z = pos.z;
    b.r = radius * 0.75;
    b.t = 0;
    b.dur = 1.1 + 0.3 * k;
    b.seed = Math.random();
    for (let i = 0; i < 70 * k; i++) {
      ember(pos.x + rnd(-1, 1), pos.y + rnd(0.3, 2), pos.z + rnd(-1, 1), 3.2 * k);
    }
    // the cloud left behind: thick black smoke, then a lingering column
    for (let i = 0; i < 16 * k; i++) {
      puff(pos.x + rnd(-2, 2) * k, pos.y + rnd(1, 4) * k, pos.z + rnd(-2, 2) * k, rnd(1.6, 2.6) * k, 0.8, rnd(3.5, 6.5), rnd(0.8, 2.2));
    }
  }

  const _hd = { d: 1e9, x: 0, y: 0, z: 0, s: 0 };
  function update(dt, camera) {
    dt = Math.min(dt || 0.016, 0.1);
    time += dt;
    uTime.value = time;
    readWind();
    if (camera) {
      const h = opts.viewportHeight?.() || 1080;
      uScale.value = h / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
    }
    const dayLight = opts.dayLight?.() ?? 1;
    uSmokeLight.value.setScalar(0.35 + 0.65 * dayLight);

    // ---- persistent fires
    let fi = 0;
    _hd.d = 1e9;
    _hd.s = 0;
    for (const [key, f] of fires) {
      const want = time - f.last < 0.25 ? 1 : 0;
      f.k += (want - f.k) * Math.min(1, dt * (want ? 2.5 : 1.2));
      if (!want && f.k < 0.02) {
        fires.delete(key);
        continue;
      }
      const flick = 0.85 + 0.15 * Math.sin(time * 17 + f.x) * Math.sin(time * 23 + f.z);
      for (const tg of f.tongues) {
        if (fi >= FLAME_MAX) {
          break;
        }
        const pulse = 0.82 + 0.18 * Math.sin(time * (3.1 + tg.seed * 2) + tg.phase);
        flames.posSize.setXYZW(fi, f.x + tg.ox + windV.x * 0.03, f.y, f.z + tg.oz + windV.z * 0.03, tg.w * (0.85 + 0.15 * f.k));
        flames.params.setXYZW(fi, tg.h * pulse * f.k, tg.seed, 0.95 * f.k * flick, 0);
        fi++;
      }
      // smoke column and embers
      f.smokeAcc += dt * (5 + 6 * f.size) * f.k;
      while (f.smokeAcc >= 1) {
        f.smokeAcc -= 1;
        puff(f.x + rnd(-0.4, 0.4) * f.size, f.y + 1.1 * f.size + rnd(0, 0.6), f.z + rnd(-0.4, 0.4) * f.size, 0.8 * f.size, 0.7, rnd(3.5, 6.5), rnd(1.1, 2.0));
      }
      f.emberAcc += dt * 9 * f.size * f.k;
      while (f.emberAcc >= 1) {
        f.emberAcc -= 1;
        ember(f.x + rnd(-0.4, 0.4) * f.size, f.y + rnd(0.2, 1.0) * f.size, f.z + rnd(-0.4, 0.4) * f.size, 1);
      }
      if (camera) {
        const d = Math.hypot(f.x - camera.position.x, f.z - camera.position.z);
        if (d < _hd.d) {
          _hd.d = d;
          _hd.x = f.x;
          _hd.y = f.y + 1.2 * f.size;
          _hd.z = f.z;
          _hd.s = f.k * f.size;
        }
      }
    }
    // ---- fireballs
    for (const b of balls) {
      if (!b.alive || fi >= FLAME_MAX) {
        continue;
      }
      b.t += dt;
      const a = b.t / b.dur;
      if (a >= 1) {
        b.alive = false;
        continue;
      }
      const grow = 1 - Math.pow(1 - Math.min(1, a * 2.2), 3);
      const size = b.r * (0.35 + 0.8 * grow);
      flames.posSize.setXYZW(fi, b.x, b.y - size * 0.5 + a * 2.5, b.z, size * 2);
      flames.params.setXYZW(fi, size * 2, b.seed, 1, 1 + a);
      fi++;
      if (camera) {
        const d = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
        if (d < _hd.d + 30) {
          _hd.d = d;
          _hd.x = b.x;
          _hd.y = b.y;
          _hd.z = b.z;
          _hd.s = 6 * (1 - a);
        }
      }
    }
    flames.geo.instanceCount = fi;
    flames.posSize.needsUpdate = true;
    flames.params.needsUpdate = true;

    // ---- smoke
    let si = 0;
    for (const p of smokeP) {
      if (!p.alive) {
        continue;
      }
      p.life += dt;
      const a = p.life / p.max;
      if (a >= 1) {
        p.alive = false;
        continue;
      }
      p.vy *= 1 - dt * 0.25;
      p.x += (p.vx + windV.x * 0.8 * a) * dt;
      p.y += p.vy * dt;
      p.z += (p.vz + windV.z * 0.8 * a) * dt;
      const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(a);
      smoke.posSize.setXYZW(si, p.x, p.y, p.z, s);
      smoke.params.setXYZW(si, s, p.seed, p.op * Math.min(1, a * 6) * (1 - a) * (1 - a), a);
      si++;
    }
    smoke.geo.instanceCount = si;
    smoke.posSize.needsUpdate = true;
    smoke.params.needsUpdate = true;

    // ---- embers
    for (let i = 0; i < EMBER_MAX; i++) {
      if (eMax[i] <= 0) {
        continue;
      }
      eLife[i] += dt;
      const a = eLife[i] / eMax[i];
      if (a >= 1) {
        eMax[i] = 0;
        eGlow[i] = 0;
        continue;
      }
      eVel[i * 3] += (windV.x * 0.6 - eVel[i * 3]) * dt * 0.8 + (Math.random() - 0.5) * dt * 3;
      eVel[i * 3 + 2] += (windV.z * 0.6 - eVel[i * 3 + 2]) * dt * 0.8 + (Math.random() - 0.5) * dt * 3;
      eVel[i * 3 + 1] -= dt * 0.6;
      ePos[i * 3] += eVel[i * 3] * dt;
      ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt;
      ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
      eGlow[i] = (1 - a) * (0.6 + 0.4 * Math.sin(time * 30 + i));
    }
    eGeo.attributes.position.needsUpdate = true;
    eGeo.attributes.aGlow.needsUpdate = true;
    eGeo.attributes.aSize.needsUpdate = true;

    // ---- warm flickering light from the nearest fire
    if (_hd.s > 0.01 && _hd.d < 120) {
      light.position.set(_hd.x, _hd.y, _hd.z);
      light.intensity = (9 + 4 * Math.sin(time * 19) * Math.sin(time * 31 + 1.3)) * Math.min(2.5, _hd.s);
    } else {
      light.intensity = 0;
    }
  }

  return {
    burn,
    explode,
    update,
    light,
    get count() {
      return fires.size;
    },
    meshes: [flames.mesh, smoke.mesh, embers],
  };
}
