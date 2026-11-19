// r4-air VFX: wingtip condensation trails (camera-facing ribbons that fade with age), a shared soft-particle pool for
// engine exhaust (faint, darker and thicker when damaged), float spray / rooster tails on the water, and the prop blur
// disc (radial gradient) that replaces the blades at speed. One draw call per effect; nothing allocates per frame.
import * as THREE from 'three';

const TRAIL_N = 120; // points per wingtip trail (~3 s at 40 Hz sampling)

function discTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'),
    r = g.createRadialGradient(64, 64, 6, 64, 64, 63);
  r.addColorStop(0, 'rgba(30,30,32,0.0)');
  r.addColorStop(0.12, 'rgba(40,40,42,0.55)');
  r.addColorStop(0.2, 'rgba(70,70,74,0.16)');
  r.addColorStop(0.86, 'rgba(90,90,94,0.18)');
  r.addColorStop(0.93, 'rgba(200,200,200,0.28)');
  r.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makePropDisc(radius) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 40),
    new THREE.MeshBasicMaterial({
      map: discTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0,
      fog: true,
    }),
  );
  m.name = 'air-propdisc';
  m.renderOrder = 3;
  m.visible = false;
  return m;
}

const PVS = `attribute float aSize; attribute vec4 aCol; varying vec4 vCol;
void main() { vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * (520.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }`;
const PFS = `varying vec4 vCol; void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = vCol.a * (1.0 - r) * (1.0 - r); gl_FragColor = vec4(vCol.rgb, a); }`;

export function createAirFx(scene) {
  // ---- particles (exhaust smoke + spray)
  const N = 1400;
  const pos = new Float32Array(N * 3),
    col = new Float32Array(N * 4),
    size = new Float32Array(N);
  const vel = new Float32Array(N * 3),
    life = new Float32Array(N),
    age = new Float32Array(N),
    kind = new Uint8Array(N),
    s0 = new Float32Array(N),
    s1 = new Float32Array(N),
    a0 = new Float32Array(N),
    shade = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const pts = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: PVS,
      fragmentShader: PFS,
      transparent: true,
      depthWrite: false,
    }),
  );
  pts.name = 'air-particles';
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  scene.add(pts);
  let head = 0,
    alive = 0;
  function emit(k, p, v, lf, sa, sb, alpha, sh) {
    const i = head;
    head = (head + 1) % N;
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    vel[i * 3] = v.x;
    vel[i * 3 + 1] = v.y;
    vel[i * 3 + 2] = v.z;
    life[i] = lf;
    age[i] = 0;
    kind[i] = k;
    s0[i] = sa;
    s1[i] = sb;
    a0[i] = alpha;
    shade[i] = sh;
  }
  // ---- wingtip trails: ribbons (2 verts per sample), alpha from age and strength
  const trails = [];
  function makeTrail() {
    const g = new THREE.BufferGeometry(),
      P = new Float32Array(TRAIL_N * 2 * 3),
      A = new Float32Array(TRAIL_N * 2),
      idx = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(A, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader:
        'attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(0.97, 0.98, 1.0, vA); }',
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.name = 'air-trail';
    scene.add(mesh);
    const T = { mesh, P, A, pts: [], acc: 0 };
    for (let i = 0; i < TRAIL_N; i++) T.pts.push({ x: 0, y: 0, z: 0, t: -99, s: 0 });
    T.n = 0;
    trails.push(T);
    return T;
  }
  const _side = new THREE.Vector3(),
    _dir = new THREE.Vector3(),
    _toCam = new THREE.Vector3();
  function trailPush(T, p, strength, t) {
    // ring buffer kept in order: shift is cheap enough at 120 points
    const last = T.pts.pop();
    last.x = p.x;
    last.y = p.y;
    last.z = p.z;
    last.t = t;
    last.s = strength;
    T.pts.unshift(last);
  }
  function trailDraw(T, cam, t) {
    const P = T.P,
      A = T.A,
      pts = T.pts;
    for (let i = 0; i < TRAIL_N; i++) {
      const a = pts[i],
        b = pts[Math.min(TRAIL_N - 1, i + 1)],
        c0 = pts[Math.max(0, i - 1)];
      const ageS = t - a.t;
      _dir.set(c0.x - b.x, c0.y - b.y, c0.z - b.z);
      if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
      _toCam.set(cam.position.x - a.x, cam.position.y - a.y, cam.position.z - a.z);
      _side.crossVectors(_dir, _toCam);
      const sl = _side.length() || 1;
      const w = 0.07 + Math.min(ageS, 3) * 0.16;
      _side.multiplyScalar(w / sl);
      const j = i * 6;
      P[j] = a.x + _side.x;
      P[j + 1] = a.y + _side.y;
      P[j + 2] = a.z + _side.z;
      P[j + 3] = a.x - _side.x;
      P[j + 4] = a.y - _side.y;
      P[j + 5] = a.z - _side.z;
      const al =
        ageS > 3 || ageS < 0
          ? 0
          : a.s * (1 - ageS / 3) * (1 - ageS / 3) * Math.min(1, i / 3) * 0.55;
      A[i * 2] = A[i * 2 + 1] = al;
    }
    T.mesh.geometry.attributes.position.needsUpdate = true;
    T.mesh.geometry.attributes.aA.needsUpdate = true;
  }
  const _p = new THREE.Vector3(),
    _v = new THREE.Vector3(),
    _w = new THREE.Vector3();
  const api = {
    emitSmoke(p, baseVel, damage, rpm, dt) {
      // faint gray exhaust always, dark and dense when damaged; rate per second
      const rate = (6 + rpm * 10) * (1 + damage * 5);
      let n = rate * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const dark = damage > 0.3 ? 0.1 + (1 - damage) * 0.2 : 0.55;
          _v.set(
            baseVel.x * 0.35 + (Math.random() - 0.5) * 0.8,
            baseVel.y * 0.35 + 0.4 + Math.random() * 0.6,
            baseVel.z * 0.35 + (Math.random() - 0.5) * 0.8,
          );
          emit(
            0,
            p,
            _v,
            1.6 + damage * 2.5,
            0.25 + damage * 0.5,
            1.6 + damage * 4.5,
            damage > 0.3 ? 0.55 : 0.16,
            dark,
          );
        }
        n -= 1;
      }
    },
    emitSpray(p, vel, strength, dt) {
      let n = strength * 80 * dt;
      while (n > 0) {
        if (Math.random() < n) {
          _v.set(
            -vel.x * 0.25 + (Math.random() - 0.5) * 2.5,
            1.2 + Math.random() * 3.2 * strength,
            -vel.z * 0.25 + (Math.random() - 0.5) * 2.5,
          );
          emit(1, p, _v, 0.9 + Math.random() * 0.6, 0.3, 1.4 + strength * 1.6, 0.55, 0.96);
        }
        n -= 1;
      }
    },
    trail() {
      return makeTrail();
    },
    trailSample(T, p, strength, t, dt) {
      T.acc += dt;
      if (T.acc < 1 / 40) {
        const h = T.pts[0];
        h.x = p.x;
        h.y = p.y;
        h.z = p.z;
        return;
      }
      T.acc = 0;
      trailPush(T, p, strength, t);
    },
    dropTrail(T) {
      scene.remove(T.mesh);
      T.mesh.geometry.dispose();
      T.mesh.material.dispose();
      trails.splice(trails.indexOf(T), 1);
    },
    update(dt, cam, t) {
      alive = 0;
      for (let i = 0; i < N; i++) {
        if (age[i] >= life[i]) {
          col[i * 4 + 3] = 0;
          size[i] = 0;
          continue;
        }
        alive++;
        age[i] += dt;
        const k = age[i] / life[i];
        if (kind[i] === 1) vel[i * 3 + 1] -= 9.8 * dt;
        else {
          vel[i * 3] *= 1 - dt * 1.2;
          vel[i * 3 + 1] = vel[i * 3 + 1] * (1 - dt * 1.2) + dt * 0.5;
          vel[i * 3 + 2] *= 1 - dt * 1.2;
        }
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] = s0[i] + (s1[i] - s0[i]) * Math.sqrt(k);
        const sh = shade[i];
        col[i * 4] = sh;
        col[i * 4 + 1] = sh;
        col[i * 4 + 2] = sh * (kind[i] === 1 ? 1.02 : 1.0);
        col[i * 4 + 3] = a0[i] * (1 - k) * Math.min(1, k * 8);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aCol.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      for (const T of trails) trailDraw(T, cam, t);
    },
    stats: () => ({ particles: alive, trails: trails.length }),
  };
  void _p;
  void _w;
  return api;
}
