// Boat wakes and spray: persistent foam ribbons (prop wash + two bow-wave arms that travel outward), GPU spray particles
// (bow sheets, rooster tails, slams, bilge and telltale streams), and the wake height field other hulls bounce over.
// Everything is ring-buffered and animated in the shaders: the CPU only writes new samples.
import * as THREE from 'three';

export function createWakeFx(scene, opts = {}) {
  const MAXQ = opts.quads || 3600,
    MAXP = opts.particles || 3200;
  // ---------------- foam ribbons: each quad = 4 verts {center xyz, dir xz * side, birth, w0, kind/strength}
  const pos = new Float32Array(MAXQ * 4 * 3),
    dir = new Float32Array(MAXQ * 4 * 2),
    dat = new Float32Array(MAXQ * 4 * 4),
    idx = new Uint32Array(MAXQ * 6);
  for (let i = 0; i < MAXQ; i++) {
    const a = i * 4;
    idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
    aDir = new THREE.BufferAttribute(dir, 2).setUsage(THREE.DynamicDrawUsage),
    aDat = new THREE.BufferAttribute(dat, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos);
  g.setAttribute('adir', aDir);
  g.setAttribute('adat', aDat);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const uni = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(0.93, 0.97, 1.0) },
    uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: uni,
    vertexShader: `attribute vec2 adir; attribute vec4 adat; uniform float uTime; varying float vAge; varying float vLife; varying float vKind; varying float vStr; varying vec2 vW; varying float vSide;
      void main(){ float age = max(0.0, uTime - adat.x); vAge = age; vKind = adat.z; vStr = adat.w; vLife = adat.z < 0.5 ? 13.0 : 9.0;
        float sgn = sign(adat.y); float w0 = abs(adat.y);
        float spread = adat.z < 0.5 ? 0.22 * age : 2.1 * age * exp(-age * 0.05);   // wash widens slowly; arms run outward
        float halfW = adat.z < 0.5 ? w0 + spread : 0.0;
        vec3 p = position; vec2 off = adir * (adat.z < 0.5 ? sgn * halfW : (spread + w0) + sgn * (0.35 + 0.1 * age));
        p.xz += off; vSide = sgn; vW = p.xz;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uTint; uniform float uNight; varying float vAge; varying float vLife; varying float vKind; varying float vStr; varying vec2 vW; varying float vSide;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){ float t = clamp(vAge / vLife, 0.0, 1.0); float fade = (1.0 - t) * (1.0 - t);
        float foam = n(vW * 1.7 + uTime * 0.05) * 0.6 + n(vW * 5.3 - uTime * 0.08) * 0.4;
        float edge = vKind < 0.5 ? smoothstep(1.0, 0.55, abs(vSide)) : smoothstep(1.0, 0.2, abs(vSide));
        float thresh = mix(0.4, 0.78, t);                                   // foam breaks up into patches as it ages
        float a = smoothstep(thresh, thresh + 0.3, foam) * fade * vStr * edge * 0.7;
        a += fade * fade * vStr * 0.12 * edge * (vKind < 0.5 ? 1.0 : 0.6);   // milky aerated water under the foam
        if (a < 0.01) discard; gl_FragColor = vec4(uTint * mix(1.0, 0.35, uNight), min(a, 0.8)); }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  let qHead = 0,
    qCount = 0,
    qDirty = false;
  const last = new Map(); // key -> { x, y, z, rx, rz, w, t }
  function quad(ax, ay, az, arx, arz, aw, at, bx, by, bz, brx, brz, bw, bt, kind, str, sgnA, sgnB) {
    const i = qHead;
    qHead = (qHead + 1) % MAXQ;
    qCount = Math.min(MAXQ, qCount + 1);
    const v = i * 4;
    // verts: A-, A+, B-, B+ ; for arms (kind 1) both verts sit on one side (sgn selects port/starboard arm), edges encoded +-1
    const S = kind < 0.5 ? [-1, 1, -1, 1] : [-1, 1, -1, 1];
    const P = [
      [ax, ay, az, arx, arz, aw, at],
      [ax, ay, az, arx, arz, aw, at],
      [bx, by, bz, brx, brz, bw, bt],
      [bx, by, bz, brx, brz, bw, bt],
    ];
    for (let k = 0; k < 4; k++) {
      const p = P[k],
        sd = kind < 0.5 ? 1 : k < 2 ? sgnA : sgnB;
      pos[(v + k) * 3] = p[0];
      pos[(v + k) * 3 + 1] = p[1];
      pos[(v + k) * 3 + 2] = p[2];
      dir[(v + k) * 2] = p[3] * sd;
      dir[(v + k) * 2 + 1] = p[4] * sd;
      dat[(v + k) * 4] = p[6];
      dat[(v + k) * 4 + 1] = Math.max(0.001, p[5]) * S[k];
      dat[(v + k) * 4 + 2] = kind;
      dat[(v + k) * 4 + 3] = str;
    }
    qDirty = true;
  }
  // add a wake sample at the stern. (rx, rz) = unit vector to port. w = half width of the wash, str 0..1, arms: bow-wave strength
  function addWake(key, x, y, z, rx, rz, w, str, arms, time) {
    const L = last.get(key);
    if (L && time - L.t < 1.2 && Math.hypot(x - L.x, z - L.z) < 12) {
      quad(L.x, y, L.z, L.rx, L.rz, L.w, L.t, x, y, z, rx, rz, w, time, 0, str, 1, 1);
      if (arms > 0.02) {
        quad(L.x, y, L.z, L.rx, L.rz, L.w, L.t, x, y, z, rx, rz, w, time, 1, arms, 1, 1);
        quad(L.x, y, L.z, L.rx, L.rz, L.w, L.t, x, y, z, rx, rz, w, time, 1, arms, -1, -1);
      }
    }
    last.set(key, { x, y, z, rx, rz, w, t: time });
  }
  function endWake(key) {
    last.delete(key);
  }
  // ---------------- spray particles (ballistic in the vertex shader)
  const pp = new Float32Array(MAXP * 3),
    pv = new Float32Array(MAXP * 3),
    pd = new Float32Array(MAXP * 3);
  const pg = new THREE.BufferGeometry();
  const bP = new THREE.BufferAttribute(pp, 3).setUsage(THREE.DynamicDrawUsage),
    bV = new THREE.BufferAttribute(pv, 3).setUsage(THREE.DynamicDrawUsage),
    bD = new THREE.BufferAttribute(pd, 3).setUsage(THREE.DynamicDrawUsage);
  pg.setAttribute('position', bP);
  pg.setAttribute('avel', bV);
  pg.setAttribute('adat', bD);
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  for (let i = 0; i < MAXP; i++) pd[i * 3] = -100;
  const pmat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: uni.uTime,
      uSea: { value: -0.12 },
      uScale: { value: 600 },
      uNight: uni.uNight,
    },
    vertexShader: `attribute vec3 avel; attribute vec3 adat; uniform float uTime; uniform float uSea; uniform float uScale; varying float vA;
      void main(){ float age = uTime - adat.x; float life = adat.z; vec3 p = position + avel * age * exp(-age * 0.35) + vec3(0.0, -4.9 * age * age, 0.0);
        float t = clamp(age / life, 0.0, 1.0); vA = (age < 0.0 || age > life || p.y < uSea - 0.05) ? 0.0 : (1.0 - t) * 0.42;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(48.0, adat.y * (1.0 + 1.6 * t) * uScale / max(0.5, -mv.z)); }`,
    fragmentShader: `uniform float uNight; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; float a = vA * smoothstep(1.0, 0.1, d); if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.95, 0.98, 1.0) * mix(1.0, 0.4, uNight), a); }`,
  });
  const pts = new THREE.Points(pg, pmat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  scene.add(pts);
  let pHead = 0,
    pDirty = false;
  function spray(x, y, z, vx, vy, vz, size, life, time) {
    const i = pHead;
    pHead = (pHead + 1) % MAXP;
    pp[i * 3] = x;
    pp[i * 3 + 1] = y;
    pp[i * 3 + 2] = z;
    pv[i * 3] = vx;
    pv[i * 3 + 1] = vy;
    pv[i * 3 + 2] = vz;
    pd[i * 3] = time;
    pd[i * 3 + 1] = size;
    pd[i * 3 + 2] = life;
    pDirty = true;
  }
  // a burst of n droplets around a direction
  function burst(n, x, y, z, vx, vy, vz, jitter, size, life, time) {
    for (let k = 0; k < n; k++)
      spray(
        x + (Math.random() - 0.5) * 0.3,
        y,
        z + (Math.random() - 0.5) * 0.3,
        vx + (Math.random() - 0.5) * jitter,
        vy * (0.6 + Math.random() * 0.7),
        vz + (Math.random() - 0.5) * jitter,
        size * (0.6 + Math.random() * 0.8),
        life * (0.7 + Math.random() * 0.6),
        time,
      );
  }
  function update(time, night, sea, viewH) {
    uni.uTime.value = time;
    uni.uNight.value = night ? 1 : 0;
    pmat.uniforms.uSea.value = sea;
    if (viewH) pmat.uniforms.uScale.value = viewH * 0.55;
    if (qDirty) {
      aPos.needsUpdate = aDir.needsUpdate = aDat.needsUpdate = true;
      qDirty = false;
      g.setDrawRange(0, qCount * 6);
    }
    if (pDirty) {
      bP.needsUpdate = bV.needsUpdate = bD.needsUpdate = true;
      pDirty = false;
    }
  }
  // ---------------- wake height field (physics): circles expanding from recent hull positions of fast boats
  const sources = new Map(); // key -> { samples: [{x, z, t, a}], x, z }
  function source(key, x, z, t, amp) {
    let s = sources.get(key);
    if (!s) sources.set(key, (s = { samples: [], x, z, lastT: -1 }));
    s.x = x;
    s.z = z;
    if (t - s.lastT < 0.4) return;
    s.lastT = t;
    s.samples.push({ x, z, t, a: amp });
    if (s.samples.length > 22) s.samples.shift();
  }
  function dropSource(key) {
    sources.delete(key);
  }
  const C = 2.1,
    K = (Math.PI * 2) / 3.2;
  function heightAt(x, z, t, skipKey) {
    let h = 0;
    for (const [key, s] of sources) {
      if (key === skipKey) continue;
      if (Math.abs(s.x - x) > 110 || Math.abs(s.z - z) > 110) continue;
      const sm = s.samples;
      for (let i = sm.length - 1; i >= 0; i--) {
        const q = sm[i],
          age = t - q.t;
        if (age > 9) break;
        const dx = x - q.x,
          dz = z - q.z,
          d2 = dx * dx + dz * dz,
          R = C * age + 0.8;
        if (d2 > (R + 4) * (R + 4)) continue;
        const d = Math.sqrt(d2),
          e = (d - R) / 1.3;
        if (e * e > 6) continue;
        h +=
          (q.a * Math.exp(-age * 0.3) * Math.exp(-e * e) * Math.cos((d - R) * K)) / (1 + R * 0.12);
      }
    }
    return h;
  }
  function dispose() {
    scene.remove(mesh);
    scene.remove(pts);
    g.dispose();
    pg.dispose();
    mat.dispose();
    pmat.dispose();
  }
  return {
    addWake,
    endWake,
    spray,
    burst,
    update,
    source,
    dropSource,
    heightAt,
    dispose,
    mesh,
    points: pts,
  };
}
