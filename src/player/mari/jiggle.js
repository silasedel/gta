// Southline — Mari's secondary motion: subtle soft-tissue jiggle (chest, glutes) and ponytail sway.
// The Tripo rig has no bones for these, so it is done in the vertex shader: a painted weight per vertex (attribute
// `aJiggle` = chest, glutes, hair; computed here once from the rest-pose mesh, hair told apart from skin by the albedo)
// moves the skinned vertex by a per-region offset uniform. The offsets come from damped springs driven by the
// acceleration of her hips (walking bob, jump landings, hit reactions, sudden stops): small amplitude, quickly damped.
// Off (springs reset, offsets zero) past JIGGLE_DIST from the camera or at mesh LOD > 0. ?jiggle=0 turns it off.
import * as THREE from 'three';

export const JIGGLE_DIST = 14;
const ON = !(typeof location !== 'undefined' && /[?&]jiggle=0\b/.test(location.search));

// per region: natural frequency (Hz), damping ratio, gain (how much of the hips' acceleration, s^2), max offset (m)
const REGIONS = [
  { name: 'chest', hz: 5.2, zeta: 0.32, gain: 0.0011, max: 0.011 },
  { name: 'glutes', hz: 4.4, zeta: 0.36, gain: 0.0009, max: 0.009 },
  { name: 'hair', hz: 1.9, zeta: 0.3, gain: 0.0035, max: 0.035 },
];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Weights from the rest pose, in the character's root frame (feet at y 0, facing +Z).
function paintWeights(mesh, albedo) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const M = mesh.matrixWorld;
  const n = pos.count;
  const P = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(M);
    P[i * 3] = v.x;
    P[i * 3 + 1] = v.y;
    P[i * 3 + 2] = v.z;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  const H = maxY - minY;
  // torso / head center depth (z) at a height: middle of the slice near the body axis
  const centerZ = (y, halfW) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      if (Math.abs(P[i * 3 + 1] - y) > 0.006 * H || Math.abs(P[i * 3]) > halfW * H) continue;
      lo = Math.min(lo, P[i * 3 + 2]);
      hi = Math.max(hi, P[i * 3 + 2]);
    }
    return Number.isFinite(lo) ? (lo + hi) / 2 : 0;
  };
  const zChest = centerZ(minY + 0.66 * H, 0.06);
  const zHips = centerZ(minY + 0.53 * H, 0.05);
  const zHead = centerZ(minY + 0.9 * H, 0.04);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3];
    const y = (P[i * 3 + 1] - minY) / H;
    const z = P[i * 3 + 2];
    const ax = Math.abs(x) / H;
    // chest: in front of the ribcage between the bust line limits, near the middle (the T-posed arms are far out)
    const fwd = z - zChest;
    out[i * 3] =
      smooth(0.035, 0.085, fwd) *
      smooth(0.68, 0.71, y) *
      smooth(0.79, 0.75, y) *
      smooth(0.1, 0.07, ax);
    // glutes: behind the pelvis, between the hip crease and the small of the back
    const back = zHips - z;
    out[i * 3 + 1] =
      smooth(0.04, 0.09, back) *
      smooth(0.45, 0.49, y) *
      smooth(0.6, 0.55, y) *
      smooth(0.11, 0.08, ax);
    // ponytail: dark (hair) texels behind the skull, more toward the tip
    let dark = 1;
    if (albedo && uv) {
      const u = uv.getX(i);
      const w = uv.getY(i);
      const px = Math.min(albedo.w - 1, Math.max(0, Math.floor(u * albedo.w)));
      const py = Math.min(albedo.h - 1, Math.max(0, Math.floor(w * albedo.h)));
      const k = (py * albedo.w + px) * 4;
      const lum = (0.3 * albedo.d[k] + 0.59 * albedo.d[k + 1] + 0.11 * albedo.d[k + 2]) / 255;
      dark = smooth(0.38, 0.22, lum);
    }
    const behind = zHead - z;
    out[i * 3 + 2] =
      dark * smooth(0.1, 0.17, behind) * smooth(0.74, 0.8, y) * smooth(0.09, 0.05, ax);
  }
  g.setAttribute('aJiggle', new THREE.BufferAttribute(out, 3));
}

// albedo pixels for the hair mask (the 1K preview texture; flipY false = glTF UV origin at the top left)
async function loadAlbedo(url) {
  try {
    const img = await new THREE.ImageLoader().loadAsync(url);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data };
  } catch (e) {
    return null;
  }
}

// Hooks the jiggle into the hero material's vertex shader and returns { update(dt, near) }.
export async function addJiggle(character, { material, mesh, albedoUrl }) {
  if (!ON || !mesh?.geometry) return null;
  character.root.updateMatrixWorld(true);
  paintWeights(mesh, await loadAlbedo(albedoUrl));
  const u = {
    uJigChest: { value: new THREE.Vector3() },
    uJigGlute: { value: new THREE.Vector3() },
    uJigHair: { value: new THREE.Vector3() },
  };
  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (sh, r) => {
    prevCompile?.call(material, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aJiggle;
uniform vec3 uJigChest; uniform vec3 uJigGlute; uniform vec3 uJigHair;`,
      )
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
transformed += aJiggle.x * uJigChest + aJiggle.y * uJigGlute + aJiggle.z * uJigHair;`,
      );
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + 'J';
  material.needsUpdate = true;

  const hips =
    character.root.getObjectByName('mixamorig:Hips') ||
    character.root.getObjectByName('mixamorigHips') ||
    character.root.getObjectByName('Hips');
  const springs = REGIONS.map((r) => ({
    ...r,
    x: new THREE.Vector3(),
    v: new THREE.Vector3(),
    k: (2 * Math.PI * r.hz) ** 2,
    c: 2 * r.zeta * 2 * Math.PI * r.hz,
  }));
  const uniforms = [u.uJigChest, u.uJigGlute, u.uJigHair];
  const p0 = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const inv = new THREE.Matrix3();
  let hasPrev = false;
  let active = true;

  function reset() {
    for (const s of springs) {
      s.x.set(0, 0, 0);
      s.v.set(0, 0, 0);
    }
    for (const un of uniforms) un.value.set(0, 0, 0);
    hasPrev = false;
  }

  const J = {
    // this frame's offset per region (cm), for tests
    peak: [0, 0, 0],
    // tests: fixed world-space offsets per region (exaggerated) to see the painted masks; null = springs
    debug: null,
    update(dt, near) {
      if (J.debug) {
        inv.setFromMatrix4(mesh.matrixWorld).invert();
        J.debug.forEach((d, i) => uniforms[i].value.set(d[0], d[1], d[2]).applyMatrix3(inv));
        return;
      }
      if (!near || !hips || dt <= 0) {
        if (active) reset();
        active = false;
        return;
      }
      active = true;
      dt = Math.min(dt, 1 / 30);
      hips.getWorldPosition(tmp);
      // first frame, or a teleport / seat snap (more than 1.5 m in one frame): restart from rest
      if (!hasPrev || tmp.distanceToSquared(p0) > 2.25) {
        acc.set(0, 0, 0);
        p0.copy(tmp);
        vel.set(0, 0, 0);
        hasPrev = true;
        return;
      }
      // hips velocity / acceleration (light low-pass: the animation's own frame steps are not jolts)
      const nv = tmp.clone().sub(p0).divideScalar(dt);
      p0.copy(tmp);
      acc.lerp(nv.clone().sub(vel).divideScalar(dt), Math.min(1, dt * 14));
      vel.copy(nv);
      if (acc.length() > 120) acc.setLength(120); // teleports, seat snaps
      // world -> the skinned mesh's local frame (the shader adds the offset after skinning)
      inv.setFromMatrix4(mesh.matrixWorld).invert();
      springs.forEach((s, i) => {
        // tissue lags behind the body: pushed opposite the acceleration, pulled back by the spring
        const f = tmp
          .copy(acc)
          .multiplyScalar(-s.gain * s.k)
          .sub(s.x.clone().multiplyScalar(s.k));
        f.sub(s.v.clone().multiplyScalar(s.c));
        s.v.addScaledVector(f, dt);
        s.x.addScaledVector(s.v, dt);
        if (s.x.length() > s.max) {
          s.x.setLength(s.max);
          s.v.multiplyScalar(0.5);
        }
        uniforms[i].value.copy(s.x).applyMatrix3(inv);
        J.peak[i] = s.x.length() * 100;
      });
    },
  };
  return J;
}
