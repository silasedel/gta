// Ground pass: road decals that belong to the asphalt they lie on.
// The decal mesh (tilebuild.js roadDecals: one alpha-blended merged mesh per tile, atlas uv in `uv`) is drawn with the ROAD's own
// maps sampled in world space (same uv = world xz / 7 as the road ribbons, same repeat, mip bias, normal scale, tint, and the same
// world-space wear chain added by materials.js groundWear), so every decal starts from exactly the asphalt under it and only
// changes what that decal changes:
//   crack / crack network / tar crack: dark thin cracks (atlas alpha, speckle removed), tar is a bit glossier
//   sealed patch: irregular soft-edged blob (world noise, so no two alike), fresher = darker and smoother, rim slightly raised
//   pothole: a real dip (parallax-occlusion march into a noise-shaped bowl, 3-7 cm deep), broken crumbly rim, darker gravel
//            bottom from the scan, inner walls shaded; fills with water after rain (uWeather.y puddles)
//   patched pothole: a slightly sunken, darker patch with a tar seam
//   oil: darker and glossier asphalt; manhole / water meter / grate: the scanned cover (cut to the iron, no foreign asphalt ring)
//   arrows: worn paint over the asphalt
// makeDecalMaterial(THREE, asphalt, { col, nrm, arm }) -> material (wrap with groundWear(..., 'a') like the asphalt afterwards)
export function makeDecalMaterial(THREE, asphalt, atlas) {
  const m = new THREE.MeshStandardMaterial({
    map: asphalt.map,
    normalMap: asphalt.normalMap,
    roughnessMap: asphalt.roughnessMap,
    aoMap: asphalt.aoMap,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -10,
  });
  m.color.copy(asphalt.color);
  if (asphalt.normalScale) m.normalScale.copy(asphalt.normalScale);
  m.name = 'roadDecals';
  m.userData.mipBias = asphalt.userData.mipBias ?? 0.35;
  m.userData.decal = true;
  const U = {
    uDecRep: { value: asphalt.map ? asphalt.map.repeat : new THREE.Vector2(1, 1) },
    tDecC: { value: atlas.col },
    tDecN: { value: atlas.nrm },
    tDecA: { value: atlas.arm },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader =
      'varying vec2 vDecUv;\nvarying vec3 vDecW;\n' +
      sh.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
      {
        vec4 dW4 = modelMatrix * vec4(position, 1.0); vDecW = dW4.xyz; vDecUv = uv;
        vec2 dWuv = dW4.xz / 7.0;
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(dWuv, 1.0)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = (normalMapTransform * vec3(dWuv, 1.0)).xy;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = (roughnessMapTransform * vec3(dWuv, 1.0)).xy;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv = (aoMapTransform * vec3(dWuv, 1.0)).xy;
        #endif
      }`,
      );
    sh.fragmentShader =
      /* glsl */ `uniform vec2 uDecRep; uniform sampler2D tDecC; uniform sampler2D tDecN; uniform sampler2D tDecA;
varying vec2 vDecUv; varying vec3 vDecW;
float dH1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dH1(i), dH1(i + vec2(1.0, 0.0)), f.x), mix(dH1(i + vec2(0.0, 1.0)), dH1(i + vec2(1.0, 1.0)), f.x), f.y); }
// irregular blob edge value at local p (0..1 cell coords) and world w: < 1 inside
float dBlob(vec2 lc, vec2 w, float rough) { vec2 q = (lc - 0.5) * 2.0; float r = length(q);
  float a = atan(q.y, q.x); float lobe = sin(a * 3.0 + dH1(floor(w * 0.2)) * 6.0) * 0.07 + sin(a * 5.0 + 1.3) * 0.04;
  return r + lobe + (dN(w * 1.15) - 0.5) * 0.42 * rough + (dN(w * 3.7 + 5.1) - 0.5) * 0.16 * rough + (dN(w * 11.0) - 0.5) * 0.05; }
` +
      sh.fragmentShader
        .replace(
          'void main() {',
          /* glsl */ `void main() {
        // decal frame: cell + local coords, world <-> local jacobian (affine on the quad, so screen derivatives are exact)
        vec2 dCell = floor(vDecUv * 4.0); float dId = dCell.y * 4.0 + dCell.x;
        vec2 dLc = clamp((vDecUv - dCell * 0.25 - 0.002) / 0.246, 0.0, 1.0);
        mat2 dJw = mat2(dFdx(vDecW.xz), dFdy(vDecW.xz)), dJl = mat2(dFdx(dLc), dFdy(dLc));
        float dDet = determinant(dJw); mat2 dL2W = dDet != 0.0 ? dJw * inverse(dJl + mat2(1e-9, 0.0, 0.0, 1e-9)) : mat2(1.0); mat2 dW2L = dDet != 0.0 ? dJl * inverse(dJw) : mat2(0.0);
        bool dPot = dId > 1.5 && dId < 2.5;
        vec2 dOffW = vec2(0.0); float dDepth = 0.0, dWall = 0.0, dRimN = 0.0, dHole = 0.0;
        if (dPot) { // parallax march into the bowl
          vec3 dV = normalize(cameraPosition - vDecW); vec2 dStep = -dV.xz / max(dV.y, 0.22);
          float D = 0.035 + 0.035 * dH1(floor(vDecW.xz * 0.5) + 3.3);
          float hit = 0.0;
          for (int i = 0; i <= 12; i++) { float d = D * float(i) / 12.0; vec2 ow = dStep * d; vec2 lc2 = dLc + dW2L * ow;
            float e = dBlob(lc2, vDecW.xz + ow, 1.0); float hd = D * (1.0 - smoothstep(0.42, 0.66, e)) * (0.82 + 0.18 * dN((vDecW.xz + ow) * 6.0));
            if (d >= hd) { hit = d; dOffW = ow; break; } } // first step where the ray is at / below the bowl surface
          dDepth = hit / D; dHole = hit > 0.0 ? 1.0 : 0.0;
        }`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
        diffuseColor *= texture2D(map, vMapUv + dOffW / 7.0 * uDecRep, ${m.userData.mipBias.toFixed(2)});
      #endif`,
        )
        .replace(
          '#include <normal_fragment_begin>',
          /* glsl */ `{
        vec2 lcH = dLc + dW2L * dOffW; vec2 wH = vDecW.xz + dOffW;
        vec4 dc = texture2D(tDecC, (dCell + 0.002 / 0.25 + lcH * (0.246 / 0.25)) * 0.25);
        vec4 da = texture2D(tDecA, (dCell + 0.002 / 0.25 + lcH * (0.246 / 0.25)) * 0.25);
        vec3 dAvg = max(textureLod(tDecC, (dCell + 0.5) * 0.25, 7.0).rgb, vec3(0.03));
        float dLum = clamp(dot(dc.rgb, vec3(0.333)) / dot(dAvg, vec3(0.333)), 0.4, 1.8);
        float A = 0.0; vec3 alb = diffuseColor.rgb; float rgh = roughnessFactor, met = 0.0;
        vec2 rim = vec2(0.0);
        float edgeFade = 1.0 - smoothstep(0.4, 0.5, max(abs(dLc.x - 0.5), abs(dLc.y - 0.5)));
        if (dId < 1.5 || dId > 14.5) { // cracks / crack networks / tar cracks: thin, dark, speckle-free
          float c = smoothstep(dId > 0.5 && dId < 1.5 ? 0.42 : 0.3, 0.7, dc.a) * edgeFade;
          bool tar = dId > 14.5;
          A = c; alb *= tar ? 0.52 : 0.42; rgh = tar ? rgh * 0.62 : min(1.0, rgh * 1.05);
        } else if (dPot) {
          float e = dBlob(dLc, vDecW.xz, 1.0);
          float rimZ = smoothstep(0.5, 0.62, e) * (1.0 - smoothstep(0.78, 0.92, e));
          // broken rim: crumbled asphalt lumps and cracks around the hole
          float lump = smoothstep(0.55, 0.7, dN(vDecW.xz * 9.0) * 0.6 + dN(vDecW.xz * 23.0) * 0.4);
          float crk = 0.0;
          A = 1.0 - smoothstep(0.84, 0.95, e + (dN(vDecW.xz * 7.0) - 0.5) * 0.12);
          // exposed base course: gravel and dust, a bit warmer / lighter than the wearing course, darker only deep in the hole
          vec3 grav = alb * vec3(1.06, 1.0, 0.92) * mix(0.7, 1.25, clamp(dLum - 0.4, 0.0, 1.0)) * (0.85 + 0.3 * dN(wH * 23.0));
          alb = mix(alb, grav * mix(1.0, 0.68, dDepth), dHole);
          alb *= 1.0 - rimZ * (0.18 * lump + 0.45 * crk);
          float wall = dHole * smoothstep(0.15, 0.75, dDepth) * (1.0 - smoothstep(0.85, 1.0, dDepth)); alb *= 1.0 - 0.22 * wall;
          rgh = mix(rgh, 0.95, dHole * 0.6);
          // inner wall normals: the bowl gradient (faces the hole center)
          vec2 g = (dLc - 0.5); rim = -normalize(dL2W * g + 1e-5) * (wall * 0.9 + rimZ * lump * 0.25);
          // rain: a puddle fills the bottom
          float fill = uWeather.y * 0.85 + uWeather.x * 0.15;
          float water = dHole * smoothstep(1.0 - fill - 0.02, 1.0 - fill + 0.02, dDepth) * step(0.02, fill);
          alb = mix(alb, alb * 0.25 + vec3(0.012, 0.014, 0.016), water); rgh = mix(rgh, 0.03, water); rim *= 1.0 - water;
        } else if (dId > 13.5 || (dId > 2.5 && dId < 3.5)) { // sealed patch / patched pothole: irregular, fresher (darker) asphalt
          bool pp = dId < 3.5;
          float e = dBlob(dLc, vDecW.xz, pp ? 0.8 : 1.3);
          A = 1.0 - smoothstep(0.8, 0.9, e);
          float seam = smoothstep(0.74, 0.81, e) * (1.0 - smoothstep(0.84, 0.9, e));
          alb *= (pp ? 0.76 : 0.82) * mix(0.93, 1.06, dN(vDecW.xz * 2.3)) * mix(1.0, 0.86, seam * (pp ? 1.0 : 0.5));
          rgh *= pp ? 0.86 : 0.9;
          // raised (patch) or sunken (patched pothole) rim: tilt along the blob gradient in the edge band
          vec2 g = dLc - 0.5; rim = normalize(dL2W * g + 1e-5) * seam * (pp ? -0.22 : 0.3);
        } else if (dId > 6.5 && dId < 8.5) { // oil
          A = smoothstep(0.1, 0.7, dc.a) * edgeFade * smoothstep(0.25, 0.65, dN(vDecW.xz * 3.1) * 0.6 + dN(vDecW.xz * 11.0) * 0.4); alb *= 0.76; rgh = mix(rgh, 0.38, 0.7); // oil: a faint, broken, slightly glossy stain - never a dark disc
        } else if (dId > 3.5 && dId < 6.5) { // covers: the scanned iron only
          float r = length(dLc - 0.5) * 2.0;
          A = dId > 5.5 ? dc.a : 1.0 - smoothstep(dId < 4.5 ? 0.76 : 0.74, dId < 4.5 ? 0.8 : 0.78, r);
          alb = dc.rgb * 0.95; rgh = da.g; met = da.b;
        } else { // arrows: worn paint
          float wearN = smoothstep(0.25, 0.6, dN(vDecW.xz * 1.7) * 0.6 + dN(vDecW.xz * 9.0) * 0.4);
          A = dc.a * mix(0.55, 0.95, wearN); alb = mix(alb, dc.rgb * 0.82, 0.92); rgh = mix(rgh, 0.7, 0.6);
        }
        diffuseColor.rgb = alb; diffuseColor.a = clamp(A, 0.0, 1.0) * opacity; roughnessFactor = rgh; metalnessFactor = met;
        vDecRim = rim;
      }
      #include <normal_fragment_begin>`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
      normal = normalize(normal + (viewMatrix * vec4(vDecRim.x, 0.0, vDecRim.y, 0.0)).xyz);`,
        )
        .replace('void main() {', 'vec2 vDecRim;\nvoid main() {');
  };
  m.customProgramCacheKey = () => 'ground-decal-v1';
  return m;
}
