// Material recolouring for the character bases. Uses bind-pose (pre-skinning) positions in shaders so
// clothing regions (open shirt / tee, shoe soles, hairline) are resolved per pixel independent of UV layout.
import * as THREE from 'three';

function bbox(geometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox;
}

const VERT_DECL = 'varying vec3 vBindPos;\nvarying vec3 vBindN;\nvarying vec4 vLimb;\n';
// vLimb = (upper arm, forearm+hand, thigh, shin+foot) skin weights -> sleeve / trouser-length masks
function injectVertex(shader) {
  shader.vertexShader =
    'uniform vec4 uArmIdx; uniform vec4 uLegIdx;\n' +
    VERT_DECL +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
 vBindPos = position; vBindN = normal; vLimb = vec4(0.0);
 #ifdef USE_SKINNING
 {
   vec4 si = skinIndex; vec4 sw = skinWeight;
   vLimb.x = dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uArmIdx.x))) + dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uArmIdx.y)));
   vLimb.y = dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uArmIdx.z))) + dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uArmIdx.w)));
   vLimb.z = dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uLegIdx.x))) + dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uLegIdx.y)));
   vLimb.w = dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uLegIdx.z))) + dot(sw, vec4(1.0) - step(vec4(0.5), abs(si - uLegIdx.w)));
 }
 #endif`,
    );
}
const SHADE_FN = `
float lumOf(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
`;

// bone indices for limb masks (per skeleton)
export function limbIndices(skeleton) {
  const find = (re) => {
    const i = skeleton ? skeleton.bones.findIndex((b) => re.test(b.name)) : -1;
    return i < 0 ? -10 : i;
  };
  return {
    arm: new THREE.Vector4(
      find(/LeftArm$/),
      find(/RightArm$/),
      find(/LeftForeArm$/),
      find(/RightForeArm$/),
    ),
    leg: new THREE.Vector4(
      find(/LeftUpLeg$/),
      find(/RightUpLeg$/),
      find(/LeftLeg$/),
      find(/RightLeg$/),
    ),
    hand: new THREE.Vector2(find(/LeftHand$/), find(/RightHand$/)),
    foot: new THREE.Vector2(find(/LeftFoot$/), find(/RightFoot$/)),
  };
}
const skinLin = (tone) =>
  new THREE.Color().setRGB(0.8 * tone[0], 0.63 * tone[1], 0.55 * tone[2], THREE.SRGBColorSpace);

// Top: outer shirt/jacket + inner layer, optional short sleeves / tank (arms painted as skin), pleats
export function makeTopMaterial(src, geometry, o, limbs) {
  const m = src.clone();
  const bb = bbox(geometry);
  const c = bb.getCenter(new THREE.Vector3());
  m.roughness = 0.9;
  m.metalness = 0;
  m.metalnessMap = null;
  m.userData.uniforms = {
    uShirt: { value: new THREE.Color(o.shirt) },
    uTee: { value: new THREE.Color(o.shirt2 ?? 0xd8d4cc) },
    uOpen: { value: 1 },
    uHem: { value: o.hemY ?? -1e9 },
    uBowY: { value: bb.max.y - 0.16 },
    uCx: { value: c.x },
    uCz: { value: c.z },
    uNeckY: { value: bb.max.y - 0.04 },
    uWaistY: { value: bb.min.y },
    uSleeve: { value: o.sleeve || 0 },
    uStripe: { value: o.stripe || 0 },
    uCuff: { value: o.cuff ? 1 : 0 },
    uSkinC: { value: skinLin(o.skin || [1, 1, 1]) },
    uArmIdx: { value: limbs ? limbs.arm : new THREE.Vector4(-10, -10, -10, -10) },
    uLegIdx: { value: limbs ? limbs.leg : new THREE.Vector4(-10, -10, -10, -10) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    injectVertex(shader);
    shader.fragmentShader =
      VERT_DECL +
      `uniform vec3 uShirt; uniform vec3 uTee; uniform float uOpen; uniform vec3 uSkinC;
uniform float uCx, uCz, uNeckY, uWaistY, uHem, uBowY, uSleeve, uStripe, uCuff;` +
      SHADE_FN +
      shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `
#ifdef USE_MAP
  if (vBindPos.y < uHem + 0.015 * sin(vBindPos.x * 40.0)) discard;
  vec4 texel = texture2D(map, vMapUv);
  float lum = lumOf(texel.rgb);
  float blur = lumOf(texture2D(map, vMapUv, 6.0).rgb);
  float shade = clamp(lum / max(blur, 0.03), 0.6, 1.35);
  float darkKeep = mix(0.45, 1.0, smoothstep(0.015, 0.09, blur));
  float tY = clamp((uNeckY - vBindPos.y) / max(uNeckY - uWaistY, 0.01), 0.0, 1.0);
  float halfW = mix(0.05, 0.115, pow(tY, 0.7));
  float ax = abs(vBindPos.x - uCx);
  float front = smoothstep(uCz + 0.0, uCz + 0.035, vBindPos.z) * step(vBindPos.y, uNeckY + 0.06);
  float inOpen = (1.0 - smoothstep(halfW - 0.004, halfW + 0.002, ax)) * front * uOpen;
  if (uOpen > 0.5 && vBindPos.y > uBowY && ax < 0.07 && vBindPos.z > uCz + 0.025) discard;
  {
    vec3 sc = pow(max(texel.rgb, vec3(0.0)), vec3(1.0 / 2.2));
    float mx = max(sc.r, max(sc.g, sc.b)), mn = min(sc.r, min(sc.g, sc.b));
    float sat = (mx - mn) / max(mx, 1e-3);
    if (sat > 0.5 && ((sc.r > sc.g * 1.6 && sc.b > sc.r * 0.3) || (sc.g > sc.r * 1.4 && sc.g > sc.b * 1.4))) discard;
  }
  float edgeShadow = smoothstep(halfW - 0.03, halfW, ax) * inOpen;
  float placket = smoothstep(0.012, 0.0, abs(ax - halfW - 0.012)) * front * uOpen;
  vec3 pat = uShirt * (0.94 + 0.08 * hash3(floor(vBindPos * 420.0)));
  pat *= 1.0 - uStripe * 0.16 * smoothstep(0.6, 1.0, sin(vBindPos.x * 260.0)) * front;
  vec3 shirt = pat * (1.0 - 0.18 * placket);
  vec3 col = mix(shirt, uTee * (0.96 + 0.06 * hash3(floor(vBindPos * 500.0))) * (1.0 - 0.45 * edgeShadow), inOpen);
  if (!gl_FrontFacing) col = (uOpen > 0.5 && vBindPos.y > uBowY - 0.02 && vBindPos.z > uCz - 0.02) ? uTee * 0.8 : col * 0.55;
  float skinM = 0.0;
  float cuffB = uCuff * smoothstep(0.12, 0.22, vLimb.y) * (1.0 - smoothstep(0.36, 0.42, vLimb.y));
  if (uSleeve > 0.5) skinM = smoothstep(0.38, 0.45, vLimb.y);
  if (uSleeve > 1.5) skinM = max(skinM, smoothstep(0.55, 0.8, vLimb.x + vLimb.y));
  if (uSleeve > 2.5) skinM = 1.0; // shirtless (swimwear)
  // rolled-up sleeve: folded band of fabric just below the elbow
  col = mix(col, uShirt * (0.78 + 0.18 * smoothstep(0.4, 1.0, sin(vLimb.y * 160.0))), cuffB);
  // inner tee: flat jersey (ignore the source garment's waistcoat detail), soft vertical shading
  float teeShade = mix(1.0, shade, 0.12) * (0.93 + 0.07 * smoothstep(uWaistY, uNeckY, vBindPos.y));
  vec3 outC = mix(col * mix(shade * darkKeep, teeShade, inOpen), uSkinC * mix(1.0, shade, 0.3), skinM);
  diffuseColor.rgb *= outC;
#endif
`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
#ifdef USE_MAP
  normal = normalize(mix(normal, nonPerturbedNormal, inOpen * 0.92)); // smooth jersey for the tee
#endif
`,
        );
  };
  m.side = THREE.DoubleSide;
  m.customProgramCacheKey = () => 'charTop2';
  return m;
}

// Trousers / shoes recolour: optional shorts (shins painted as skin), sandals (skin + strap + sole)
export function makeRecolorMaterial(src, geometry, o, limbs) {
  const m = src.clone();
  const bb = bbox(geometry);
  m.roughness = o.roughness ?? 0.85;
  m.metalness = 0;
  m.metalnessMap = null;
  m.userData.uniforms = {
    uColor: { value: new THREE.Color(o.color) },
    uSole: { value: new THREE.Color(o.sole ?? o.color) },
    uSoleY: { value: o.sole !== undefined ? bb.min.y + 0.028 : -1e9 },
    uDenim: { value: o.denim ? 1 : 0 },
    uShorts: { value: o.shorts || 0 },
    uSandal: { value: o.sandal || 0 },
    uSkinC: { value: skinLin(o.skin || [1, 1, 1]) },
    uArmIdx: { value: limbs ? limbs.arm : new THREE.Vector4(-10, -10, -10, -10) },
    uLegIdx: { value: limbs ? limbs.leg : new THREE.Vector4(-10, -10, -10, -10) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    injectVertex(shader);
    shader.fragmentShader =
      VERT_DECL +
      'uniform vec3 uColor; uniform vec3 uSole; uniform float uSoleY; uniform float uDenim; uniform float uShorts; uniform float uSandal; uniform vec3 uSkinC;\n' +
      SHADE_FN +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
#ifdef USE_MAP
  vec4 texel = texture2D(map, vMapUv);
  float lum = lumOf(texel.rgb);
  float blur = lumOf(texture2D(map, vMapUv, 6.0).rgb);
  float shade = clamp(lum / max(blur, 0.03), 0.55, 1.45);
  float darkKeep = mix(0.35, 1.0, smoothstep(0.012, 0.08, blur));
  vec3 col = uColor;
  if (uDenim > 0.5) {
    float tw = sin((vBindPos.x * 0.7 + vBindPos.y + vBindPos.z * 0.7) * 1400.0) * 0.5 + 0.5;
    float n = hash3(floor(vBindPos * 260.0));
    col *= 0.86 + 0.1 * tw + 0.12 * n;
    col *= 1.0 + 0.22 * smoothstep(0.0, 0.06, vBindPos.z) * (0.5 + 0.5 * sin(vBindPos.y * 9.0));
  }
  float soleM = 1.0 - smoothstep(uSoleY - 0.003, uSoleY + 0.003, vBindPos.y);
  col = mix(col, uSole, soleM);
  float skinM = 0.0;
  if (uShorts > 0.5) skinM = smoothstep(0.45, 0.7, vLimb.w);
  if (uSandal > 0.5) { float strap = step(0.6, fract(vBindPos.z * 28.0)) * (1.0 - soleM); skinM = (1.0 - soleM) * (1.0 - strap * 0.8); }
  vec3 outC = mix(col * shade * mix(darkKeep, 1.0, soleM), uSkinC * mix(1.0, shade, 0.3), skinM);
  diffuseColor.rgb *= outC;
#endif
`,
      );
  };
  m.customProgramCacheKey = () => 'charRecolor2';
  return m;
}

export function makeSkinMaterial(src, geometry, o) {
  const m = src.clone();
  const bb = bbox(geometry);
  const c = bb.getCenter(new THREE.Vector3());
  m.color.setRGB(...o.tone);
  m.roughness = 0.68;
  m.metalness = 0;
  m.userData.uniforms = {
    uHair: { value: new THREE.Color(o.hair) },
    uHairOn: { value: o.hairStyle ? 1 : 0 },
    uStubble: { value: o.stubble ?? 0 },
    uTop: { value: bb.max.y },
    uHC: { value: new THREE.Vector3(c.x, 0, c.z) },
    uArmIdx: { value: new THREE.Vector4(-10, -10, -10, -10) },
    uLegIdx: { value: new THREE.Vector4(-10, -10, -10, -10) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    injectVertex(shader);
    shader.fragmentShader =
      VERT_DECL +
      'uniform vec3 uHair; uniform float uHairOn; uniform float uTop; uniform vec3 uHC; uniform float uStubble;\n' +
      SHADE_FN +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  {
    vec2 d = vBindPos.xz - uHC.xz;
    float fwd = d.y / max(length(d), 1e-4);
    float hairline = uTop - mix(0.098, 0.066, smoothstep(0.25, 0.92, fwd)) - 0.075 * smoothstep(-0.15, -0.85, fwd);
    float n = hash3(floor(vBindPos * 900.0));
    float n2 = hash3(floor(vBindPos * 180.0));
    float n3 = hash3(floor(vBindPos * 2400.0));
    float m = smoothstep(hairline - 0.007, hairline + 0.006, vBindPos.y + (n3 - 0.5) * 0.006 + (n2 - 0.5) * 0.002) * uHairOn;
    vec3 hc = uHair * (0.7 + 0.45 * n + 0.25 * n3);
    diffuseColor.rgb = mix(diffuseColor.rgb, hc, m * 0.97);
    // light stubble: darker, speckled jaw / upper-lip tint
    float jaw = smoothstep(uTop - 0.265, uTop - 0.245, vBindPos.y) * (1.0 - smoothstep(uTop - 0.19, uTop - 0.175, vBindPos.y)) * smoothstep(-0.35, 0.1, fwd);
    float st = jaw * uStubble * (0.55 + 0.45 * n);
    diffuseColor.rgb *= 1.0 - 0.32 * st;
    diffuseColor.rgb = mix(diffuseColor.rgb, uHair * 1.5, 0.18 * st);
  }
`,
      );
  };
  m.customProgramCacheKey = () => 'charSkin2';
  return m;
}

// Michelle atlas: recolour the yellow trousers per variant
export function makeMichelleVariantMap(srcMap, vi) {
  const img = srcMap.image;
  const w = img.width,
    h = img.height;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h);
  const p = d.data;
  // per-variant palette: trousers, crop-top tint, skin tone, hair colour
  let sn = 0;
  const rr = () => {
    const x = Math.sin(++sn * 12.9898 + vi * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const PANTS = [
    [52, 66, 92],
    [92, 96, 74],
    [196, 186, 166],
    [48, 48, 52],
    [224, 128, 104],
    [47, 138, 134],
    [230, 179, 181],
    [156, 193, 222],
    [240, 237, 230],
  ];
  const TOPS = [
    [240, 237, 230],
    [224, 128, 104],
    [47, 138, 134],
    [232, 215, 138],
    [184, 168, 210],
    [166, 211, 191],
    [42, 52, 66],
    [220, 220, 220],
  ];
  const HAIRC = [null, null, [90, 58, 35], [160, 124, 76], [60, 38, 25], [120, 70, 40]];
  const tgt = PANTS[Math.floor(rr() * PANTS.length)],
    top = TOPS[Math.floor(rr() * TOPS.length)];
  const skinK = [1, 1.3, 1.55, 0.78, 1.15, 1.75][Math.floor(rr() * 6)];
  const hairC = HAIRC[Math.floor(rr() * HAIRC.length)];
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i],
      gg = p[i + 1],
      b = p[i + 2];
    const mx = Math.max(r, gg, b),
      mn = Math.min(r, gg, b);
    const sat = mx ? (mx - mn) / mx : 0;
    if (sat > 0.45 && mx > 120 && r > b * 1.6 && gg > b * 1.4 && gg > r * 0.62) {
      // yellow trousers
      const v = mx / 235;
      p[i] = Math.min(255, tgt[0] * v);
      p[i + 1] = Math.min(255, tgt[1] * v);
      p[i + 2] = Math.min(255, tgt[2] * v);
    } else if (r > gg && gg > b && sat > 0.22 && sat < 0.72 && mx < 215 && mx > 40) {
      // skin
      p[i] = Math.min(255, r * skinK);
      p[i + 1] = Math.min(255, gg * skinK * (skinK > 1 ? 0.97 : 1));
      p[i + 2] = Math.min(255, b * skinK * (skinK > 1 ? 0.93 : 1));
    } else if (sat < 0.14 && mx > 95 && mx < 235) {
      // grey crop top
      const v = mx / 190;
      p[i] = Math.min(255, top[0] * v);
      p[i + 1] = Math.min(255, top[1] * v);
      p[i + 2] = Math.min(255, top[2] * v);
    } else if (hairC && mx < 60 && sat < 0.5) {
      // dark hair
      const v = 0.35 + mx / 60;
      p[i] = hairC[0] * v;
      p[i + 1] = hairC[1] * v;
      p[i + 2] = hairC[2] * v;
    } else if (sat > 0.45) {
      // loud accent: desaturate + darken
      const l = 0.3 * r + 0.59 * gg + 0.11 * b;
      p[i] = (l + (r - l) * 0.3) * 0.8;
      p[i + 1] = (l + (gg - l) * 0.3) * 0.8;
      p[i + 2] = (l + (b - l) * 0.3) * 0.8;
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = srcMap.flipY;
  t.wrapS = srcMap.wrapS;
  t.wrapT = srcMap.wrapT;
  t.anisotropy = 4;
  return t;
}
