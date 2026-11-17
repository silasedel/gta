// A sheared fire hydrant gushes (overnight props pass, Nov 17; track: props). src/world/miami/breakables.js emits 'propBreak'
// { kind: 'hydrant', point } when a car hits a hydrant hard; here a water column shoots up from the stub for ~30 s: a tapered
// animated water sheet (scrolling streaks, soft edges, lit by the sky color) plus falling droplets (one Points draw) that
// splash back down around it. At most 3 at once; nothing exists until a hydrant breaks.
//   import { initHydrantSpray } from '../props/hydrantSpray.v2.js'; initHydrantSpray(game)
import * as THREE from 'three';

const MAX = 3, DROPS = 420, LIFE = 32;

export function initHydrantSpray(game) {
  if (!game || !game.on || !game.scene || game._hydrantSpray) return null;
  const live = [];
  const colGeo = new THREE.CylinderGeometry(0.32, 0.08, 1, 16, 6, true); colGeo.translate(0, 0.5, 0);
  const colMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float streak = n(vec2(vUv.x * 18.0, vUv.y * 3.0 - uT * 9.0)) * 0.6 + n(vec2(vUv.x * 40.0, vUv.y * 8.0 - uT * 14.0)) * 0.4;
        float rim = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 1.5);
        float top = 1.0 - smoothstep(0.7, 1.0, vUv.y);
        float a = (0.55 + 0.45 * streak) * (0.7 + 0.3 * rim) * top * uA;
        vec3 c = mix(vec3(0.62, 0.74, 0.82), vec3(0.97, 0.99, 1.0), streak * 0.8);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const dropMat = new THREE.PointsMaterial({ color: 0xdfeef5, size: 0.1, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });

  function start({ point }) {
    if (!point) return;
    if (live.length >= MAX) stop(live[0]);
    const y0 = (point.y ?? 0) - 0.3, h = 4.2 + Math.random() * 1.2;
    const col = new THREE.Mesh(colGeo, colMat.clone()); col.position.set(point.x, y0 + 0.25, point.z); col.scale.set(1, h, 1); col.renderOrder = 3; col.frustumCulled = false;
    const pos = new Float32Array(DROPS * 3), vel = new Float32Array(DROPS * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, dropMat.clone()); pts.frustumCulled = false;
    const s = { col, pts, pos, vel, t: 0, x: point.x, y: y0 + 0.25, z: point.z, h, ground: y0 + 0.3 };
    for (let i = 0; i < DROPS; i++) respawn(s, i, Math.random());
    game.scene.add(col, pts); live.push(s);
    try { game.audio?.play?.('splash', { position: point, volume: 0.5 }); } catch (e) { /* optional */ }
  }
  function respawn(s, i, age = 0) { // a drop leaves the top of the column and arcs out
    const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8, up = Math.sqrt(2 * 9.8 * s.h) * (0.15 + Math.random() * 0.25);
    s.pos[i * 3] = s.x + Math.cos(a) * 0.1; s.pos[i * 3 + 1] = s.y + s.h * (0.75 + Math.random() * 0.25); s.pos[i * 3 + 2] = s.z + Math.sin(a) * 0.1;
    s.vel[i * 3] = Math.cos(a) * sp; s.vel[i * 3 + 1] = up; s.vel[i * 3 + 2] = Math.sin(a) * sp;
    if (age) for (let k = 0; k < 3; k++) { s.pos[i * 3 + k] += s.vel[i * 3 + k] * age; } // spread the first frame
  }
  function stop(s) { game.scene.remove(s.col, s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); s.col.material.dispose(); live.splice(live.indexOf(s), 1); }
  function update(dt) {
    if (!live.length) return; dt = Math.min(dt, 0.05);
    for (let k = live.length - 1; k >= 0; k--) {
      const s = live[k]; s.t += dt; const fade = s.t > LIFE - 6 ? Math.max(0, (LIFE - s.t) / 6) : 1;
      s.col.material.uniforms.uT.value = s.t; s.col.material.uniforms.uA.value = fade; s.col.scale.y = s.h * (0.3 + 0.7 * fade) * (0.96 + Math.sin(s.t * 9) * 0.04);
      const P = s.pos, V = s.vel;
      for (let i = 0; i < DROPS; i++) { V[i * 3 + 1] -= 9.8 * dt; P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt; if (P[i * 3 + 1] < s.ground) { if (fade > 0.05) respawn(s, i); else P[i * 3 + 1] = -1e4; } }
      s.pts.geometry.attributes.position.needsUpdate = true; s.pts.material.opacity = 0.85 * fade;
      if (s.t >= LIFE) stop(s);
    }
  }
  game.on('propBreak', (e) => { if (e && e.kind === 'hydrant') start(e); });
  if (game.updaters) game.updaters.push(update);
  return (game._hydrantSpray = { start, live });
}
