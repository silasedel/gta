// Skid marks (ring buffer of ground quads) + simple tire-screech audio.
import * as THREE from 'three';

export function createSkids(scene, max = 1600) {
  const pos = new Float32Array(max * 4 * 3);
  const alpha = new Float32Array(max * 4);
  const idx = new Uint32Array(max * 6);
  for (let i = 0; i < max; i++) {
    const a = i * 4;
    idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { color: { value: new THREE.Color(0x0b0b0b) } },
    vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color, vA); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  let head = 0,
    count = 0,
    dirty = false;
  const last = new Map();

  function add(key, p, rx, rz, width, strength) {
    const prev = last.get(key);
    const y = p.y + 0.015;
    const hw = width / 2;
    const L = { x: p.x - rx * hw, z: p.z - rz * hw },
      R = { x: p.x + rx * hw, z: p.z + rz * hw };
    if (prev) {
      const d = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (d < 0.25) return;
      if (d < 3) {
        const o = head * 12;
        pos[o] = prev.L.x;
        pos[o + 1] = prev.y;
        pos[o + 2] = prev.L.z;
        pos[o + 3] = prev.R.x;
        pos[o + 4] = prev.y;
        pos[o + 5] = prev.R.z;
        pos[o + 6] = L.x;
        pos[o + 7] = y;
        pos[o + 8] = L.z;
        pos[o + 9] = R.x;
        pos[o + 10] = y;
        pos[o + 11] = R.z;
        const a = Math.min(0.5, strength * 0.7);
        alpha[head * 4] = alpha[head * 4 + 1] = prev.a;
        alpha[head * 4 + 2] = alpha[head * 4 + 3] = a;
        head = (head + 1) % max;
        count = Math.min(max, count + 1);
        dirty = true;
      }
    }
    last.set(key, { x: p.x, y, z: p.z, L, R, a: Math.min(0.5, strength * 0.7) });
  }
  function end(key) {
    last.delete(key);
  }
  function flush() {
    if (!dirty) return;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.setDrawRange(0, count * 6);
    dirty = false;
  }
  return { add, end, flush, mesh };
}

// Looping filtered noise "screech" whose gain follows skid intensity.
export function createScreech() {
  let ctx = null,
    g = null,
    f = null;
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = nb;
      src.loop = true;
      f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      f.Q.value = 9;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 2100;
      f2.Q.value = 12;
      g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      src.connect(f2);
      f.connect(g);
      f2.connect(g);
      g.connect(ctx.destination);
      src.start();
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }
  return {
    set(intensity, speed) {
      if (!ctx && intensity <= 0) return;
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(Math.min(0.09, intensity * 0.09), t, intensity > 0 ? 0.04 : 0.12);
      f.frequency.setTargetAtTime(1100 + Math.min(900, speed * 25), t, 0.1);
    },
  };
}

// Tire smoke: one Points draw call, soft procedural puffs.
export function createSmoke(scene, max = 220, opts = {}) {
  const pos = new Float32Array(max * 3),
    size = new Float32Array(max),
    alpha = new Float32Array(max);
  const vel = new Float32Array(max * 3),
    life = new Float32Array(max),
    maxLife = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { color: { value: new THREE.Color(opts.color ?? 0xd8d4cf) }, scale: { value: 500 } },
    vertexShader: `attribute float size; attribute float alpha; varying float vA;
      void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * 500.0 / max(0.5, -mv.z); }`,
    fragmentShader: `uniform vec3 color; varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float a = smoothstep(1.0, 0.0, r) * vA; gl_FragColor = vec4(color, a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 2;
  scene.add(pts);
  let next = 0;
  function emit(p, vx, vz, strength) {
    const i = next;
    next = (next + 1) % max;
    pos[i * 3] = p.x + (Math.random() - 0.5) * 0.3;
    pos[i * 3 + 1] = p.y + 0.15;
    pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
    vel[i * 3] = vx * 0.15 + (Math.random() - 0.5) * 0.8;
    vel[i * 3 + 1] = 0.5 + Math.random() * 0.6;
    vel[i * 3 + 2] = vz * 0.15 + (Math.random() - 0.5) * 0.8;
    maxLife[i] = life[i] = opts.fire ? 0.45 + Math.random() * 0.35 : 1.0 + Math.random() * 0.9;
    if (opts.fire) {
      vel[i * 3 + 1] = 1.6 + Math.random() * 1.4;
    }
    size[i] = 0.5;
    alpha[i] = Math.min(0.5, 0.18 + strength * 0.3);
  }
  function update(dt) {
    let any = false;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) {
          alpha[i] = 0;
          any = true;
        }
        continue;
      }
      any = true;
      life[i] -= dt;
      const t = 1 - life[i] / maxLife[i];
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      vel[i * 3] *= 0.97;
      vel[i * 3 + 2] *= 0.97;
      size[i] = opts.fire ? 0.9 * (1 - t) + 0.2 : (0.8 + t * 3.6) * (opts.scale || 1);
      alpha[i] = opts.fire
        ? Math.max(0, (1 - t) * 0.9)
        : opts.scale
          ? Math.max(0, (1 - t) * 0.3)
          : Math.max(0, Math.pow(1 - t, 1.4) * Math.min(1, t * 8 + 0.3) * 0.75);
    }
    if (any) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    }
  }
  return { emit, update, points: pts };
}

// Crash "crunch": short filtered noise burst + low thump.
let _cctx = null;
export function playImpact(strength) {
  try {
    _cctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _cctx,
      t = ctx.currentTime;
    const n = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = ctx.createBufferSource();
    src.buffer = n;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900 + strength * 1800;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.5, 0.12 + strength * 0.3);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const og = ctx.createGain();
    og.gain.setValueAtTime(Math.min(0.5, 0.2 + strength * 0.3), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.32);
  } catch (e) {
    /* ignore */
  }
}

// Glass shards: tiny glinting particles with gravity and a ground bounce.
export function createShards(scene, max = 300) {
  const pos = new Float32Array(max * 3),
    size = new Float32Array(max),
    alpha = new Float32Array(max);
  const vel = new Float32Array(max * 3),
    life = new Float32Array(max),
    floorY = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size; attribute float alpha; varying float vA;
      void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * 500.0 / max(0.5, -mv.z); }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = max(abs(d.x), abs(d.y)) * 2.0; if (r > 1.0) discard; gl_FragColor = vec4(0.82, 0.92, 1.0, vA * (1.0 - r * 0.5)); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let next = 0,
    active = 0;
  function burst(p, dir, n = 40, floor = 0) {
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % max;
      pos[i * 3] = p.x + (Math.random() - 0.5) * 0.8;
      pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.8;
      vel[i * 3] = (dir?.x || 0) * 2 + (Math.random() - 0.5) * 3;
      vel[i * 3 + 1] = 1 + Math.random() * 2.5;
      vel[i * 3 + 2] = (dir?.z || 0) * 2 + (Math.random() - 0.5) * 3;
      life[i] = 2.5 + Math.random() * 2;
      size[i] = 0.012 + Math.random() * 0.018;
      alpha[i] = 1;
      floorY[i] = floor + 0.02;
    }
    active = 5;
  }
  function update(dt) {
    if (active <= 0) return;
    active -= dt;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) {
        alpha[i] = 0;
        continue;
      }
      life[i] -= dt;
      active = Math.max(active, 0.1);
      vel[i * 3 + 1] -= 9.81 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < floorY[i]) {
        pos[i * 3 + 1] = floorY[i];
        vel[i * 3 + 1] *= -0.25;
        vel[i * 3] *= 0.5;
        vel[i * 3 + 2] *= 0.5;
      }
      alpha[i] = Math.min(1, life[i]) * (0.5 + 0.5 * Math.abs(Math.sin(life[i] * 13 + i))); // glint
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }
  return { burst, update, points: pts };
}
