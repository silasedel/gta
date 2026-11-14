import * as THREE from 'three';

// Port Solana FX: pooled, GPU-friendly particles (2 Points draws: alpha + additive),
// instanced ground/water rings, impact decals, one pooled muzzle-flash light.
// All public functions are safe to call any time; internal errors are swallowed.

const MAX_ALPHA = 1400;
const MAX_ADD = 500;
const MAX_RINGS = 48;
const MAX_DECALS = 64;

function makePointsSystem(max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const size = new Float32Array(max);
  const kind = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pkind', new THREE.BufferAttribute(kind, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 600 },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec4 pcolor;
      attribute float psize;
      attribute float pkind;
      uniform float uScale;
      varying vec4 vColor;
      varying float vKind;
      varying float vSeed;
      void main() {
        vColor = pcolor;
        vKind = pkind;
        vSeed = fract( position.x * 3.17 + position.z * 1.31 );
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp( psize * uScale / max( -mv.z, 0.1 ), 0.0, 256.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight;
      uniform float uTime;
      varying vec4 vColor;
      varying float vKind;
      varying float vSeed;
      float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( h( i ), h( i + vec2( 1, 0 ) ), f.x ), mix( h( i + vec2( 0, 1 ) ), h( i + vec2( 1, 1 ) ), f.x ), f.y ); }
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length( p );
        if ( r > 1.0 ) discard;
        float a;
        vec3 c = vColor.rgb;
        if ( vKind < 0.5 ) {            // soft puff (smoke / dust / spray mist)
          float n = vn( p * 2.5 + vSeed * 17.0 ) * 0.6 + vn( p * 5.0 - vSeed * 9.0 ) * 0.4;
          a = smoothstep( 1.0, 0.2, r + ( n - 0.5 ) * 0.6 );
          c *= 0.8 + 0.4 * n;
        } else if ( vKind < 1.5 ) {     // droplet / chip (hard-ish dot)
          a = smoothstep( 1.0, 0.55, r );
        } else {                        // glow (sparks, flash)
          a = pow( max( 1.0 - r, 0.0 ), 1.6 );
        }
        #ifdef LIT
          c *= uLight;
        #endif
        gl_FragColor = vec4( c, a * vColor.a );
        if ( gl_FragColor.a < 0.004 ) discard;
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    defines: additive ? {} : { LIT: 1 },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 11 : 10;
  pts.name = additive ? 'fx-additive' : 'fx-alpha';
  // CPU state
  const S = {
    max, n: 0, pts, geo, mat, pos, col, size, kind,
    vel: new Float32Array(max * 3),
    life: new Float32Array(max), maxLife: new Float32Array(max),
    s0: new Float32Array(max), s1: new Float32Array(max),
    rgb: new Float32Array(max * 3), a0: new Float32Array(max),
    grav: new Float32Array(max), drag: new Float32Array(max),
    floorY: new Float32Array(max),
  };
  return S;
}

function emit(S, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, kind, grav, drag, floorY = -1e9) {
  let i;
  if (S.n < S.max) i = S.n++;
  else { // recycle the oldest-ish: pick the particle with least remaining life fraction
    i = (Math.random() * S.max) | 0;
  }
  S.pos[i * 3] = x; S.pos[i * 3 + 1] = y; S.pos[i * 3 + 2] = z;
  S.vel[i * 3] = vx; S.vel[i * 3 + 1] = vy; S.vel[i * 3 + 2] = vz;
  S.life[i] = 0; S.maxLife[i] = life; S.s0[i] = s0; S.s1[i] = s1;
  S.rgb[i * 3] = r; S.rgb[i * 3 + 1] = g; S.rgb[i * 3 + 2] = b; S.a0[i] = a;
  S.kind[i] = kind; S.grav[i] = grav; S.drag[i] = drag; S.floorY[i] = floorY;
}

let WIND = null; // game.wind (set in createFX): light puffs (smoke, dust, mist) are carried by it
function stepSystem(S, dt) {
  let n = S.n;
  const wx = WIND ? WIND.vx : 0, wz = WIND ? WIND.vz : 0, wk = WIND ? Math.min(1, dt * 1.1) : 0;
  for (let i = 0; i < n; i++) {
    S.life[i] += dt;
    if (S.life[i] >= S.maxLife[i]) {
      // swap-remove with last
      const j = --n;
      if (i !== j) {
        for (let k = 0; k < 3; k++) { S.pos[i * 3 + k] = S.pos[j * 3 + k]; S.vel[i * 3 + k] = S.vel[j * 3 + k]; S.rgb[i * 3 + k] = S.rgb[j * 3 + k]; }
        S.life[i] = S.life[j]; S.maxLife[i] = S.maxLife[j]; S.s0[i] = S.s0[j]; S.s1[i] = S.s1[j]; S.a0[i] = S.a0[j];
        S.kind[i] = S.kind[j]; S.grav[i] = S.grav[j]; S.drag[i] = S.drag[j]; S.floorY[i] = S.floorY[j];
        i--;
      }
      continue;
    }
    const d = Math.max(0, 1 - S.drag[i] * dt);
    const i3 = i * 3;
    if (wk > 0 && S.kind[i] < 0.5 && S.drag[i] > 0) { const a = wk * Math.min(1, S.life[i] * 1.5); S.vel[i3] += (wx - S.vel[i3]) * a; S.vel[i3 + 2] += (wz - S.vel[i3 + 2]) * a; }
    S.vel[i3] *= d; S.vel[i3 + 1] = S.vel[i3 + 1] * d - S.grav[i] * dt; S.vel[i3 + 2] *= d;
    S.pos[i3] += S.vel[i3] * dt; S.pos[i3 + 1] += S.vel[i3 + 1] * dt; S.pos[i3 + 2] += S.vel[i3 + 2] * dt;
    if (S.pos[i3 + 1] < S.floorY[i]) { // hit floor: kill droplets quickly, bounce chips
      S.pos[i3 + 1] = S.floorY[i];
      if (S.kind[i] === 1) { S.vel[i3 + 1] *= -0.25; S.vel[i3] *= 0.5; S.vel[i3 + 2] *= 0.5; S.life[i] = Math.max(S.life[i], S.maxLife[i] - 0.25); }
      else S.vel[i3 + 1] = 0;
    }
    const t = S.life[i] / S.maxLife[i];
    S.size[i] = S.s0[i] + (S.s1[i] - S.s0[i]) * t;
    const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
    S.col[i * 4] = S.rgb[i3]; S.col[i * 4 + 1] = S.rgb[i3 + 1]; S.col[i * 4 + 2] = S.rgb[i3 + 2];
    S.col[i * 4 + 3] = S.a0[i] * Math.max(0, fade);
  }
  S.n = n;
  const g = S.geo;
  g.setDrawRange(0, n);
  if (n > 0) {
    g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true;
    g.attributes.psize.needsUpdate = true; g.attributes.pkind.needsUpdate = true;
    // only upload the live range
    for (const k of ['position', 'pcolor', 'psize', 'pkind']) {
      const a = g.attributes[k];
      a.clearUpdateRanges?.(); a.addUpdateRange?.(0, n * a.itemSize);
    }
  }
}

// flat expanding rings (water foam rings / ripples / ground shockwave), instanced
function makeRings(max) {
  const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
  const data = new Float32Array(max * 4); // age01, alpha, kind, seed
  const attr = new THREE.InstancedBufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('rdata', attr);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */`
      attribute vec4 rdata;
      varying vec2 vUv;
      varying vec4 vData;
      void main() {
        vUv = position.xz;
        vData = rdata;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight;
      varying vec2 vUv;
      varying vec4 vData;
      float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      void main() {
        float r = length( vUv );
        if ( r > 1.0 ) discard;
        float age = vData.x;
        float ang = atan( vUv.y, vUv.x );
        float wob = 0.04 * sin( ang * 7.0 + vData.w * 30.0 ) + 0.03 * sin( ang * 13.0 - vData.w * 11.0 );
        float rr = r + wob;
        float a;
        if ( vData.z < 0.5 ) {   // foam ring: thick broken band + inner froth
          float band = smoothstep( 0.72, 0.88, rr ) * smoothstep( 1.0, 0.9, rr );
          float froth = ( 1.0 - smoothstep( 0.0, 0.8, rr ) ) * ( 1.0 - age ) * 0.6;
          float brk = step( 0.35, h( floor( vec2( ang * 6.0, rr * 10.0 ) + vData.w * 40.0 ) ) );
          a = ( band * ( 0.55 + 0.45 * brk ) + froth * brk );
        } else {                  // thin ripple ring
          a = smoothstep( 0.86, 0.94, rr ) * smoothstep( 1.0, 0.95, rr );
        }
        a *= vData.y;
        if ( a < 0.004 ) discard;
        gl_FragColor = vec4( uLight * 0.95, a );
      }`,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 9; mesh.name = 'fx-rings';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const R = { mesh, data, attr, max, list: [] };
  return R;
}

// impact decals (bullet holes / scorch), instanced, oriented to the surface normal
function makeDecals(max) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const fade = new Float32Array(max);
  const attr = new THREE.InstancedBufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('dfade', attr);
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      attribute float dfade;
      varying vec2 vUv; varying float vFade;
      void main() { vUv = uv * 2.0 - 1.0; vFade = dfade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vFade;
      void main() {
        float r = length( vUv );
        float hole = smoothstep( 0.32, 0.18, r );
        float scorch = smoothstep( 1.0, 0.2, r ) * 0.55;
        float a = max( hole, scorch ) * vFade;
        if ( a < 0.01 ) discard;
        gl_FragColor = vec4( vec3( 0.02, 0.018, 0.016 ), a );
      }`,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 8; mesh.name = 'fx-decals';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, fade, attr, max, next: 0, used: 0, age: new Float32Array(max) };
}

// wet-sand band along the shoreline (sand profile matches city.js: flat 0.02 to x=505, then slopes into the sea)
function sandY(x) { return x > 505 ? -Math.min(2.5, (x - 505) / 24) - Math.max(0, (x - 565) * 0.03) : 0.02; }
function makeWetSand(seaX) {
  const X0 = 494, X1 = seaX + 4, Z = 1600, segX = 12;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z * 2, segX, 1); geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0, 0);
  const P = geo.attributes.position;
  const wet = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    P.setY(i, sandY(x) + 0.012);
    wet[i] = THREE.MathUtils.smoothstep(x, X0, seaX - 2);
  }
  geo.setAttribute('wet', new THREE.BufferAttribute(wet, 1));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b2f22, roughness: 0.28, metalness: 0.0, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float wet;\nvarying float vWet;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = wet;\nvWP = ( modelMatrix * vec4( position, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWet;\nvarying vec3 vWP;')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n{ float wob = sin( vWP.z * 0.11 ) * 0.5 + sin( vWP.z * 0.37 + 1.3 ) * 0.25; diffuseColor.a *= clamp( vWet * 1.15 + wob * 0.08, 0.0, 1.0 ) * 0.62; }');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.renderOrder = 1; mesh.name = 'wet-sand';
  return mesh;
}

export function createFX(game, env) {
  const { scene } = game;
  const A = makePointsSystem(MAX_ALPHA, false);
  const B = makePointsSystem(MAX_ADD, true);
  const R = makeRings(MAX_RINGS);
  const D = makeDecals(MAX_DECALS);
  scene.add(A.pts, B.pts, R.mesh, D.mesh);
  const inWater = (x, z) => (game.city?.isWater ? !!game.city.isWater(x, z) : false);
  WIND = game.wind || null;
  const seaLevel = () => (game.city?.seaLevel ?? env?.seaLevel ?? -0.12);

  // pooled muzzle flash light (kept in scene at 0 intensity so the light count never changes)
  const flashLight = new THREE.PointLight(0xffb060, 0, 9, 2);
  flashLight.castShadow = false;
  scene.add(flashLight);
  let flashT = 0;

  const light = new THREE.Color(1, 1, 1);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpV = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0), ZV = new THREE.Vector3(0, 0, 1);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const P = (p) => (p ? (p.isVector3 ? p : tmpV.set(p.x || 0, p.y || 0, p.z || 0)) : null);

  function ring(x, z, radius0, radius1, life, kind, alpha, y) {
    let r;
    if (R.list.length < R.max) { r = { i: R.list.length }; R.list.push(r); }
    else r = R.list.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    Object.assign(r, { x, z, y: y ?? seaLevel() + 0.03, r0: radius0, r1: radius1, t: 0, life, kind, alpha, seed: Math.random() });
  }

  const fx = {
    get count() { return A.n + B.n; },
    splash(pos, strength = 1) {
      const p = P(pos); if (!p) return;
      const s = THREE.MathUtils.clamp(strength, 0.2, 4);
      const y = seaLevel();
      const nDrop = Math.round(40 * s), nMist = Math.round(14 * s);
      for (let i = 0; i < nDrop; i++) {
        const a = Math.random() * Math.PI * 2, sp = rnd(1, 4.5) * Math.sqrt(s);
        emit(A, p.x + Math.cos(a) * 0.3 * s, y + 0.05, p.z + Math.sin(a) * 0.3 * s, Math.cos(a) * sp * 0.6, rnd(3, 7.5) * Math.sqrt(s), Math.sin(a) * sp * 0.6,
          rnd(0.7, 1.4), rnd(0.06, 0.12), 0.05, 0.85, 0.92, 1.0, 0.9, 1, 9.8, 0.3, y);
      }
      for (let i = 0; i < nMist; i++) {
        const a = Math.random() * Math.PI * 2, sp = rnd(0.5, 2) * s;
        emit(A, p.x + Math.cos(a) * 0.4 * s, y + rnd(0.1, 0.8) * s, p.z + Math.sin(a) * 0.4 * s, Math.cos(a) * sp * 0.6, rnd(2.5, 5) * Math.sqrt(s), Math.sin(a) * sp * 0.6,
          rnd(0.8, 1.5), 0.35 * s, 1.3 * s, 0.82, 0.86, 0.9, 0.28, 0, 3.0, 1.6, y);
      }
      ring(p.x, p.z, 0.3 * s, 3.2 * s, 2.6, 0, 0.9);
      ring(p.x, p.z, 0.5, 5 * s, 3.4, 1, 0.5);
    },
    ripple(pos) {
      const p = P(pos); if (!p) return;
      ring(p.x, p.z, 0.12, rnd(0.7, 1.05), 1.3, 1, 0.28); // subtle: small, faint rings
    },
    dust(pos, color) {
      const p = P(pos); if (!p) return;
      const c = color ? (color.isColor ? color : tmpC.set(color)) : tmpC.setRGB(0.76, 0.66, 0.5);
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2, sp = rnd(0.3, 1.1);
        emit(A, p.x, p.y + 0.08, p.z, Math.cos(a) * sp, rnd(0.2, 0.7), Math.sin(a) * sp, rnd(0.6, 1.1), 0.15, rnd(0.5, 0.8),
          c.r, c.g, c.b, 0.45, 0, -0.05, 2.2);
      }
    },
    sparks(pos, normal) {
      const p = P(pos); if (!p) return;
      const px = p.x, py = p.y, pz = p.z;
      const n = normal ? tmpN.set(normal.x || 0, normal.y || 0, normal.z || 0).normalize() : tmpN.set(0, 1, 0);
      for (let i = 0; i < 18; i++) {
        const sp = rnd(3, 9);
        const vx = n.x * sp + rnd(-3, 3), vy = n.y * sp + rnd(-1, 4), vz = n.z * sp + rnd(-3, 3);
        emit(B, px, py, pz, vx, vy, vz, rnd(0.2, 0.55), rnd(0.05, 0.09), 0.02, 4.0, rnd(1.6, 2.6), 0.5, 1, 2, 9.8, 1.0, 0.02);
      }
      emit(B, px, py, pz, 0, 0, 0, 0.07, 0.35, 0.6, 2.2, 1.4, 0.6, 1, 2, 0, 0);
    },
    tireSmoke(pos) {
      const p = P(pos); if (!p) return;
      if (bucket.tire < 1) return; bucket.tire -= 1;
      emit(A, p.x + rnd(-0.2, 0.2), p.y + 0.15, p.z + rnd(-0.2, 0.2), rnd(-0.4, 0.4), rnd(0.4, 1.0), rnd(-0.4, 0.4), rnd(1.6, 2.6), 0.4, rnd(2.2, 3.2),
        0.82, 0.82, 0.84, 0.32, 0, -0.15, 0.9);
    },
    smoke(pos) {
      const p = P(pos); if (!p) return;
      if (bucket.smoke < 1) return; bucket.smoke -= 1;
      emit(A, p.x + rnd(-0.15, 0.15), p.y, p.z + rnd(-0.15, 0.15), rnd(-0.3, 0.3), rnd(1.0, 1.8), rnd(-0.3, 0.3), rnd(1.8, 3.0), 0.35, rnd(1.6, 2.6),
        0.2, 0.19, 0.18, 0.32, 0, -0.4, 0.6);
    },
    muzzleFlash(pos, dir) {
      const p = P(pos); if (!p) return;
      const px = p.x, py = p.y, pz = p.z;
      const d = dir ? tmpN.set(dir.x || 0, dir.y || 0, dir.z || 0).normalize() : tmpN.set(0, 0, 1);
      emit(B, px, py, pz, 0, 0, 0, 0.05, 0.55, 0.35, 4.0, 2.4, 1.0, 1, 2, 0, 0);
      for (let i = 1; i <= 3; i++) emit(B, px + d.x * 0.12 * i, py + d.y * 0.12 * i, pz + d.z * 0.12 * i, d.x * 2, d.y * 2, d.z * 2, 0.045, 0.35 - i * 0.07, 0.1, 3.5, 1.8, 0.6, 1, 2, 0, 0);
      emit(A, px + d.x * 0.3, py + d.y * 0.3, pz + d.z * 0.3, d.x * 1.2, d.y * 1.2 + 0.3, d.z * 1.2, 0.7, 0.12, 0.6, 0.55, 0.55, 0.55, 0.25, 0, -0.2, 2.0);
      flashLight.position.set(px + d.x * 0.3, py + d.y * 0.3, pz + d.z * 0.3);
      flashT = 0.06;
    },
    bulletImpact(pos, normal, surface) {
      const p = P(pos); if (!p) return;
      const px = p.x, py = p.y, pz = p.z;
      const n = normal ? tmpN2.set(normal.x || 0, normal.y || 0, normal.z || 0) : tmpN2.set(0, 1, 0);
      if (n.lengthSq() < 1e-6) n.set(0, 1, 0); n.normalize();
      if (surface === 'water') { fx.splash(p, 0.35); return; }
      if (surface === 'flesh' || surface === 'ped') {
        for (let i = 0; i < 12; i++) {
          const sp = rnd(1, 3);
          emit(A, px, py, pz, n.x * sp + rnd(-1, 1), rnd(0, 2), n.z * sp + rnd(-1, 1), rnd(0.4, 0.7), rnd(0.03, 0.06), 0.03, 0.35, 0.02, 0.02, 1, 1, 9.8, 0.3, 0.02);
        }
        emit(A, px, py, pz, 0, 0.2, 0, 0.35, 0.1, 0.35, 0.4, 0.03, 0.03, 0.5, 0, 0, 1);
        return;
      }
      if (surface === 'vehicle') { fx.sparks(p, n); return; }
      if (surface === 'metal') { fx.sparks(p, n); }
      const chip = surface === 'sand' || surface === 'grass' ? [0.62, 0.52, 0.38] : surface === 'wood' ? [0.45, 0.3, 0.18] : [0.55, 0.53, 0.5];
      for (let i = 0; i < 10; i++) {
        const sp = rnd(2, 5);
        emit(A, px, py, pz, n.x * sp + rnd(-1.5, 1.5), n.y * sp + rnd(0, 2.5), n.z * sp + rnd(-1.5, 1.5), rnd(0.5, 0.9), rnd(0.03, 0.06), 0.03,
          chip[0], chip[1], chip[2], 1, 1, 9.8, 0.5, 0.02);
      }
      for (let i = 0; i < 4; i++) emit(A, px + n.x * 0.1, py + n.y * 0.1, pz + n.z * 0.1, n.x * rnd(0.3, 1), n.y * rnd(0.3, 1) + 0.2, n.z * rnd(0.3, 1), rnd(0.6, 1.1), 0.12, rnd(0.6, 0.9),
        chip[0] * 1.2, chip[1] * 1.2, chip[2] * 1.2, 0.4, 0, -0.1, 2.5);
      if (surface !== 'water') {
        const i = D.next; D.next = (D.next + 1) % D.max; D.used = Math.min(D.used + 1, D.max);
        tmpQ.setFromUnitVectors(ZV, n);
        tmpV.set(px + n.x * 0.01, py + n.y * 0.01, pz + n.z * 0.01);
        const s = rnd(0.12, 0.2);
        tmpM.compose(tmpV, tmpQ, tmpS.set(s, s, s));
        D.mesh.setMatrixAt(i, tmpM); D.age[i] = 0; D.fade[i] = 1;
        D.mesh.count = D.used; D.mesh.instanceMatrix.needsUpdate = true; D.attr.needsUpdate = true;
      }
    },
    update(dt) {
      try { updateImpl(dt); } catch (e) { if (!fx._warned) { fx._warned = true; console.error('[fx] update failed', e); } }
    },
  };
  const tmpC = new THREE.Color(), tmpN = new THREE.Vector3(), tmpN2 = new THREE.Vector3();
  const bucket = { tire: 20, smoke: 20 };

  // ---- automatic effects (player / vehicles in water, footsteps, events) ----
  let subscribed = false;
  let rippleT = 0, wasWet = false, wasGrounded = true, airT = 0;
  const vehWet = new WeakMap();
  function subscribe() {
    if (subscribed || typeof game.on !== 'function') return;
    subscribed = true;
    game.on('shot', (e) => { if (e?.origin) fx.muzzleFlash(e.origin, e.dir); });
    game.on('hit', (e) => {
      if (!e?.point) return;
      if (e.kind === 'bullet') fx.bulletImpact(e.point, e.normal, e.target === 'vehicle' ? 'vehicle' : e.target === 'ped' ? 'flesh' : (game.surfaceAt?.(e.point.x, e.point.z) || 'concrete'));
      else if (e.target === 'vehicle' && e.kind !== 'punch') fx.sparks(e.point, e.normal);
    });
    game.on('crash', (e) => { if (e?.point && (e.impulse ?? 10) > 4) fx.sparks(e.point, null); });
    game.on('footstep', (e) => {
      if (!e?.position) return;
      if (e.surface === 'sand' && (e.run || Math.random() < 0.4)) fx.dust(e.position);
      else if (e.surface === 'water' && !game.player?.swimming) fx.ripple(e.position); // wading only; swimming has its own small trail
    });
  }

  function updateImpl(dt) {
    dt = Math.min(dt || 0.016, 0.1);
    subscribe();
    bucket.tire = Math.min(24, bucket.tire + dt * 90);
    bucket.smoke = Math.min(16, bucket.smoke + dt * 30);
    // lighting for alpha particles: ambient sky + some sun
    if (env?.sun && env?.hemi) {
      const s = env.sun, h = env.hemi;
      light.setRGB(h.color.r * h.intensity * 1.2 + s.color.r * s.intensity * 0.18,
        h.color.g * h.intensity * 1.2 + s.color.g * s.intensity * 0.18,
        h.color.b * h.intensity * 1.2 + s.color.b * s.intensity * 0.18);
      A.mat.uniforms.uLight.value.copy(light);
      R.mesh.material.uniforms.uLight.value.copy(light);
    }
    const cam = game.camera;
    const scale = game.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 60) / 2));
    A.mat.uniforms.uScale.value = B.mat.uniforms.uScale.value = scale;
    stepSystem(A, dt); stepSystem(B, dt);

    // rings
    let live = 0;
    for (let k = 0; k < R.list.length; k++) {
      const r = R.list[k];
      r.t += dt;
      const t = Math.min(r.t / r.life, 1);
      if (t >= 1) continue;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 2.2));
      tmpM.makeScale(rad, 1, rad).setPosition(r.x, r.y, r.z);
      R.mesh.setMatrixAt(live, tmpM);
      R.data[live * 4] = t; R.data[live * 4 + 1] = r.alpha * (1 - t) * Math.min(1, t * 8); R.data[live * 4 + 2] = r.kind; R.data[live * 4 + 3] = r.seed;
      live++;
    }
    R.mesh.count = live;
    if (live) { R.mesh.instanceMatrix.needsUpdate = true; R.attr.needsUpdate = true; }

    // decals fade after 25 s
    if (D.used) {
      let ch = false;
      for (let i = 0; i < D.used; i++) { D.age[i] += dt; if (D.age[i] > 25) { const f = Math.max(0, 1 - (D.age[i] - 25) / 5); if (f !== D.fade[i]) { D.fade[i] = f; ch = true; } } }
      if (ch) D.attr.needsUpdate = true;
    }

    // muzzle flash light
    if (flashT > 0) { flashT -= dt; flashLight.intensity = flashT > 0 ? 40 * (flashT / 0.06) : 0; }
    else if (flashLight.intensity) flashLight.intensity = 0;

    // player wading / swimming
    const sl = seaLevel();
    const pl = game.player;
    if (pl?.position && !pl.state?.inVehicle) {
      const p = pl.position;
      const wet = p.y < sl + 0.05 && inWater(p.x, p.z);
      if (wet && !wasWet && !pl.swimming && (pl.velocity?.length?.() ?? 0) > 1.5) fx.splash(tmpV.set(p.x, sl, p.z), 0.6); // entering the water, not bobbing while swimming
      if (wet) {
        rippleT -= dt;
        const sp = Math.hypot(pl.velocity?.x || 0, pl.velocity?.z || 0);
        if (rippleT <= 0) { fx.ripple(tmpV.set(p.x, sl, p.z)); rippleT = sp > 0.5 ? 0.6 : 1.6; }
      }
      wasWet = wet;
      // landing puffs on sand / grass
      const g = !!pl.state?.grounded;
      if (g && !wasGrounded && airT > 0.35 && !wet) {
        const surf = game.city?.surfaceAt?.(p.x, p.z) || game.surfaceAt?.(p.x, p.z) || null;
        if (surf === 'sand') { fx.dust(p); fx.dust(p); }
        else if (surf === 'grass' || surf === 'grass_short' || surf === 'grass_long' || surf === 'dirt') fx.dust(p, tmpC.setRGB(0.45, 0.42, 0.3));
      }
      airT = g ? 0 : airT + dt;
      wasGrounded = g;
    }
    // vehicles hitting the water
    const vl = game.vehicles?.list;
    if (vl) for (const v of vl) {
      const b = v.body; if (!b?.translation) continue;
      const t = b.translation();
      const w = t.y < sl + 0.6 && inWater(t.x, t.z);
      const was = vehWet.get(v) || false;
      if (w && !was) { const lv = b.linvel?.(); const spd = lv ? Math.hypot(lv.x, lv.y, lv.z) : 5; if (spd > 2) fx.splash(tmpV.set(t.x, sl, t.z), Math.min(3, 0.8 + spd / 8)); }
      vehWet.set(v, w);
    }
  }

  return fx;
}
