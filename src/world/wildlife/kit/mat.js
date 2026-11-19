// Wildlife kit: materials. One standard PBR material per animal (albedo + normal + roughness from tex.js), plus
// shader-animated variants for instanced crowds (fish schools, distant flocks, seagrass) that cost one draw call.

// Standard creature material. alphaTest cuts out transparent texels (feather tips, fin edges, crests).
export function skinMaterial(
  THREE,
  tex,
  {
    alphaTest = 0,
    doubleSide = false,
    roughness = 1,
    metalness = 0,
    normalScale = 1,
    envMapIntensity = 0.9,
    color = 0xffffff,
    emissive = null,
  } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    roughnessMap: tex.roughnessMap,
    roughness,
    metalness,
    color,
    envMapIntensity,
    alphaTest,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.normalScale.set(normalScale, normalScale);
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveMap = tex.map;
  }
  if (alphaTest > 0) m.shadowSide = THREE.DoubleSide;
  return m;
}

// Instanced swimmer material: the body (along Z, nose at +Z) bends side to side in the vertex shader, with the
// amplitude growing toward the tail. Per-instance attribute `aSwim` = vec2(phase, speedScale).
// opts: head = z of the nose, len = body length, amp = tail swing (m), wave = waves along the body, hz = tail beats/s,
//       vertical = true for dolphins/manatees/rays (up-down undulation).
// The returned material has .userData.time (uniform { value }) that the owner advances.
export function swimMaterial(
  THREE,
  tex,
  {
    head = 0.5,
    len = 1,
    amp = 0.08,
    wave = 1.2,
    hz = 2.5,
    vertical = false,
    alphaTest = 0,
    doubleSide = true,
    roughness = 1,
    envMapIntensity = 1,
  } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    roughnessMap: tex.roughnessMap,
    roughness,
    metalness: 0,
    envMapIntensity,
    alphaTest,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const time = { value: 0 };
  m.userData.time = time;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      attribute vec2 aSwim; uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      {
        float s = clamp((${head.toFixed(4)} - position.z) / ${len.toFixed(4)}, 0.0, 1.0);
        float ph = uTime * ${(hz * 6.2832).toFixed(4)} * aSwim.y + aSwim.x - s * ${(wave * 6.2832).toFixed(4)};
        float k = ${amp.toFixed(4)} * (0.12 + 0.88 * s * s);
        float off = sin(ph) * k;
        transformed.${vertical ? 'y' : 'x'} += off;
        transformed.z += cos(ph) * k * 0.15 * s;
      }`,
      );
  };
  m.customProgramCacheKey = () => `swim|${head}|${len}|${amp}|${wave}|${hz}|${vertical}`;
  return m;
}

// Instanced flapping material for distant birds, bats and insects: vertices rotate about the body axis (Z) in
// proportion to |x| (span). Per-instance attribute `aFlap` = vec3(phase, flapAmount 0..1 (0 = glide), rateScale).
export function flapMaterial(
  THREE,
  tex,
  { hz = 3, amp = 0.9, dihedral = 0.12, alphaTest = 0.4, bodyHalf = 0.05, color = 0xffffff } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    map: tex?.map || null,
    normalMap: tex?.normalMap || null,
    roughnessMap: tex?.roughnessMap || null,
    roughness: 1,
    metalness: 0,
    alphaTest,
    side: THREE.DoubleSide,
    color,
  });
  const time = { value: 0 };
  m.userData.time = time;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      attribute vec3 aFlap; uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      {
        float span = max(0.0, abs(position.x) - ${bodyHalf.toFixed(4)});
        float sgn = sign(position.x);
        float beat = sin(uTime * ${(hz * 6.2832).toFixed(4)} * aFlap.z + aFlap.x);
        float ang = (${dihedral.toFixed(4)} + beat * ${amp.toFixed(4)} * aFlap.y) ;
        float c = cos(ang), s = sin(ang);
        transformed.x = sgn * (${bodyHalf.toFixed(4)} + span * c);
        transformed.y += span * s;
      }`,
      );
  };
  m.customProgramCacheKey = () => `flap|${hz}|${amp}|${dihedral}|${bodyHalf}`;
  return m;
}

// Swaying material for seagrass, sea fans, soft corals and kelp-like plants: vertices sway with height above the
// base (position.y), phase-shifted by world position, so one InstancedMesh holds a whole meadow.
export function swayMaterial(
  THREE,
  tex,
  {
    amp = 0.12,
    hz = 0.35,
    height = 1,
    alphaTest = 0.4,
    doubleSide = true,
    color = 0xffffff,
    roughness = 1,
  } = {},
) {
  const m = new THREE.MeshStandardMaterial({
    map: tex?.map || null,
    normalMap: tex?.normalMap || null,
    roughnessMap: tex?.roughnessMap || null,
    roughness,
    metalness: 0,
    alphaTest,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    color,
  });
  const time = { value: 0 };
  m.userData.time = time;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec3 wp = (instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vec3 wp = position;
        #endif
        float k = clamp(position.y / ${height.toFixed(4)}, 0.0, 1.5); k *= k;
        float ph = uTime * ${(hz * 6.2832).toFixed(4)} + wp.x * 0.35 + wp.z * 0.27;
        transformed.x += (sin(ph) + 0.35 * sin(ph * 2.3 + 1.7)) * ${amp.toFixed(4)} * k;
        transformed.z += cos(ph * 0.8 + 0.6) * ${(amp * 0.6).toFixed(4)} * k;
      }`,
      );
  };
  m.customProgramCacheKey = () => `sway|${amp}|${hz}|${height}`;
  return m;
}
