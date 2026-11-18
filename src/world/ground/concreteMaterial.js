// Ground pass: cast concrete for elevated decks, barriers, fascias, walls, piers and soffits (src/world/miami/elevated*).
// The old material only multiplied a low-contrast generic atlas cell, so a shaded barrier read as one flat colored slab.
// This one is world-space and needs no uvs except the barrier height channel:
//   - the user's Concrete 3 scan (public/assets/textures/roads/concrete_*), triplanar, two scales (detail + macro), albedo
//     normalized so the per-face vertex colors keep the tone, plus its normal map (formwork pitting) and roughness
//   - formwork seams: a thin recessed joint every 6 m along the run (tie-hole dots on tall walls), each cast panel a touch
//     different in tone
//   - grime: rain streaks running down from tops / copings, tyre spray darkening the lower barrier, salt / algae near the
//     ground on piers and walls
//   - barrier faces (uv.y = 100 + height fraction, written by elevated/build.js): a black rubber scuff line 6-25 cm above the
//     deck and drain scuppers (dark slots at the base every 8 m)
// makeElevatedConcrete(THREE, base) -> material (vertexColors on)
// r4-shoreland (?r4barrier=0 = old): barrier faces read as slip-formed cast concrete instead of a blotchy scan print: the scan's
// pitting is toned down on them, contraction joints (V-groove, chipped lips) every 6.1 m along the run replace the world-axis
// formwork lines, faint horizontal drag marks of the slip form, road grime + dust caked at the base, streaks under the joints.
const R4B = !(typeof location !== 'undefined' && /[?&]r4barrier=0\b/.test(location.search));
let _tex = null;
function texSet(THREE) {
  if (_tex) return _tex;
  const L = new THREE.TextureLoader(), B = (import.meta.env?.BASE_URL ?? '/') + 'assets/textures/roads/concrete_';
  const t = (n, srgb) => { const x = L.load(B + n + '.jpg'); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
  _tex = { col: t('col', true), nrm: t('nrm', false), arm: t('arm', false) };
  return _tex;
}
export function makeElevatedConcrete(THREE, base = null) {
  const T = texSet(THREE);
  const m = base || new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: true });
  m.vertexColors = true; m.name = 'elevated-concrete';
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    Object.assign(sh.uniforms, { tCcC: { value: T.col }, tCcN: { value: T.nrm }, tCcA: { value: T.arm } });
    sh.vertexShader = 'varying vec3 vCcP;\nvarying vec3 vCcN;\nvarying vec2 vCcUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 cp = modelMatrix * vec4(transformed, 1.0); vCcP = cp.xyz; vCcN = normalize(mat3(modelMatrix) * objectNormal); vCcUv = uv; }`);
    sh.fragmentShader = /* glsl */`uniform sampler2D tCcC; uniform sampler2D tCcN; uniform sampler2D tCcA;
varying vec3 vCcP; varying vec3 vCcN; varying vec2 vCcUv;
float ccH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ccN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ccH(i), ccH(i + vec2(1.0, 0.0)), f.x), mix(ccH(i + vec2(0.0, 1.0)), ccH(i + vec2(1.0, 1.0)), f.x), f.y); }
vec4 ccTri(sampler2D t, vec3 p, vec3 w, float s) { return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s) * w.y + texture2D(t, p.xy * s) * w.z; }
vec3 ccNrmT = vec3(0.0);
` + sh.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      {
        vec3 wn = normalize(vCcN), bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
        vec3 c1 = ccTri(tCcC, vCcP, bw, 1.0 / 1.7).rgb, c2 = ccTri(tCcC, vCcP + 17.3, bw, 1.0 / 9.0).rgb;
        vec3 avg = max(textureLod(tCcC, vec2(0.5), 11.0).rgb, vec3(0.05));
        float l1 = dot(c1 / avg, vec3(0.333)), l2 = dot(c2 / avg, vec3(0.333));
        float dk = mix(0.3, 0.1, abs(wn.y)); // decks / soffits: the scan's streaks read as wood grain from below, keep them faint
        float det = clamp(mix(1.0, l1, dk) * mix(1.0, l2, dk), 0.82, 1.18); // cast concrete is smooth-ish: fine pitting, soft tone drift
        // run coordinate along the wall (dominant horizontal axis), height
        float run = abs(wn.x) > abs(wn.z) ? vCcP.z : vCcP.x, hy = vCcP.y;
        float vert = 1.0 - abs(wn.y);
        // formwork: recessed joint every 6 m + panel tone
        float pj = fract(run / 6.0), jw = 0.012 / 6.0 + fwidth(run / 6.0);
        float joint = (1.0 - smoothstep(0.0, jw * 2.0, pj) * smoothstep(1.0, 1.0 - jw * 2.0, pj)) * vert;
        float panel = mix(0.92, 1.08, ccH(vec2(floor(run / 6.0), floor(hy / 3.0) + 3.1)));
        // grime: rain streaks from the top (vertical noise), heavier lower down
        float streak = ccN(vec2(run * 2.3, hy * 0.18)) * 0.6 + ccN(vec2(run * 7.1, hy * 0.5 + 3.0)) * 0.4;
        float grime = smoothstep(0.55, 0.85, streak) * vert * 0.35;
        ${R4B ? `if (vCcUv.y > 99.5 && vCcUv.y < 299.5) { det = mix(det, 1.0, 0.72); joint = 0.0; grime *= 0.55; panel = mix(1.0, panel, 0.6); } // r4: slip-formed barrier, no world-axis formwork lines` : ''}
        vec3 cc = diffuseColor.rgb * det * panel;
        cc *= 1.0 - grime; cc *= 1.0 - joint * 0.45;
        // barrier faces: height fraction in uv.y (100 + h), scuff line, scuppers, tyre spray
        if (vCcUv.y > 99.5 && vCcUv.y < 299.5) {
          float hf = vCcUv.y - 100.0, sAlong = vCcUv.x;
          float scuff = smoothstep(0.04, 0.07, hf) * (1.0 - smoothstep(0.2, 0.26, hf)) * smoothstep(0.35, 0.65, ccN(vec2(sAlong * 0.8, 1.7)) * 0.7 + ccN(vec2(sAlong * 6.0, 4.4)) * 0.3);
          float spray = 1.0 - smoothstep(0.0, 0.55, hf);
          float sc = fract(sAlong / 8.0) * 8.0, scup = step(0.0, sc) * (1.0 - step(0.45, sc)) * (1.0 - step(0.1, hf));
          cc *= 1.0 - spray * 0.22 * (0.6 + 0.4 * ccN(vec2(sAlong * 1.3, 9.0)));
          cc = mix(cc, vec3(0.025, 0.024, 0.023), scuff * 0.75);
          cc = mix(cc, vec3(0.01), scup * 0.9);
          ccNrmT.y = scuff;
          ${R4B ? `{ // r4-shoreland: contraction joints every 6.1 m (V-groove + chipped lip + stain), drag marks, grime caked at the base
            float jq = sAlong / 6.1, jd = abs(fract(jq + 0.5) - 0.5) * 6.1, jw = 0.006 + fwidth(sAlong) * 0.75;
            float jt = 1.0 - smoothstep(jw, jw * 2.2, jd), lip = (1.0 - smoothstep(jw * 2.2, jw * 4.5, jd)) * (1.0 - jt);
            float jn = ccN(vec2(floor(jq + 0.5) * 3.7, hf * 9.0));
            cc *= 1.0 - jt * 0.6; cc *= 1.0 + lip * 0.07 * jn;
            float wet = (1.0 - smoothstep(0.03, 0.32 + 0.2 * jn, jd)) * smoothstep(0.15, 0.95, hf + 0.25 * ccN(vec2(sAlong * 5.0, hf * 2.0)));
            cc *= 1.0 - wet * 0.13; // water runs down through the joint from the top
            cc *= 1.0 + 0.03 * (ccN(vec2(sAlong * 0.21, hf * 34.0)) - 0.5) + 0.02 * (ccN(vec2(sAlong * 1.7, hf * 90.0)) - 0.5); // slip-form drag marks
            float bn = ccN(vec2(sAlong * 2.3, 6.6)), base = 1.0 - smoothstep(0.0, 0.07 + 0.08 * bn, hf);
            cc = mix(cc, cc * vec3(0.52, 0.5, 0.46), base * 0.85); // road grime caked at the toe
            cc = mix(cc, cc * vec3(1.07, 1.0, 0.88), (1.0 - smoothstep(0.05, 0.42, hf)) * 0.45 * (0.5 + 0.5 * bn)); // dust / road film on the lower slope
            cc *= 1.0 + smoothstep(0.93, 1.0, hf) * 0.05; // top edge catches the sky
            ccNrmT.y = max(ccNrmT.y, base * 0.4);
          }` : ''}
        }
        if (wn.y < -0.6) { // soffits: smooth precast / plywood-formed panels (2.44 x 1.22 m) with faint seams and per-panel tone, efflorescence blooms
          vec2 fp = vCcP.xz / vec2(2.44, 1.22), ff = fract(fp), fw = fwidth(fp) * 1.5 + 0.004;
          float seam = 1.0 - smoothstep(0.0, fw.x, min(ff.x, 1.0 - ff.x)) * smoothstep(0.0, fw.y, min(ff.y, 1.0 - ff.y));
          cc *= mix(0.95, 1.05, ccH(floor(fp) + 7.7)) * (1.0 - seam * 0.18);
          float eff = smoothstep(0.62, 0.8, ccN(vCcP.xz * 0.35 + 2.0) * 0.7 + ccN(vCcP.xz * 1.9) * 0.3);
          cc = mix(cc, vec3(dot(cc, vec3(0.3333))) * 1.18, eff * 0.35);
        }
        { // r2-art: neutral concrete (sat <= 0.14, L 0.20-0.35): no beige / yellow cast from the vertex tint or the scan
          float cl = dot(cc, vec3(0.2126, 0.7152, 0.0722));
          cc = mix(vec3(cl) * vec3(1.0, 1.0, 0.98), cc, 0.35);
          cc *= mix(1.0, clamp(0.27 / max(cl, 1e-3), 0.7, 1.5), 0.55);
        }
        if (vCcUv.y > 299.5) { // r3-concrete: earth berm at a wall base (uv.x = 0 at the wall -> 1 at the terrain): dark soil by the wall, dry grass and soil toward the terrain, fines + pebbles
          float un = clamp(vCcUv.x, 0.0, 1.0), nz1 = ccN(vCcP.xz * 3.1), nz2 = ccN(vCcP.xz * 11.0 + 5.0), nz3 = ccN(vCcP.xz * 0.7 + 2.0);
          vec3 soil = mix(vec3(0.052, 0.040, 0.030), vec3(0.095, 0.074, 0.052), nz3) * (0.75 + 0.5 * nz1) * (0.85 + 0.3 * nz2);
          vec3 turf = vec3(0.062, 0.078, 0.030) * (0.7 + 0.6 * nz1);
          float gr = smoothstep(0.35, 0.8, un + (nz3 - 0.5) * 0.5);
          cc = mix(soil, turf, gr * 0.85);
          cc = mix(cc, vec3(0.30, 0.285, 0.26) * (0.6 + 0.6 * nz2), step(0.93, nz2) * 0.5 * (1.0 - gr)); // pebbles
          ccNrmT.y = 0.0;
        }
        diffuseColor.rgb = cc;
        ccNrmT.x = joint;
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      { vec3 wn = normalize(vCcN), bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
        roughnessFactor = clamp(mix(0.88, ccTri(tCcA, vCcP, bw, 1.0 / 2.6).g, 0.7) - ccNrmT.y * 0.25, 0.3, 1.0); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 wn = normalize(vCcN), bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
        vec3 tX = texture2D(tCcN, vCcP.zy / 1.7).xyz * 2.0 - 1.0, tY = texture2D(tCcN, vCcP.xz / 1.7).xyz * 2.0 - 1.0, tZ = texture2D(tCcN, vCcP.xy / 1.7).xyz * 2.0 - 1.0;
        float nK = ${R4B ? '(vCcUv.y > 99.5 && vCcUv.y < 299.5) ? 0.14 : 0.35' : '0.35'}; // r4: slip-formed barrier faces are smooth, only a faint pitting
        tX = vec3(tX.xy * nK + wn.zy, abs(tX.z) * wn.x); tY = vec3(tY.xy * nK + wn.xz, abs(tY.z) * wn.y); tZ = vec3(tZ.xy * nK + wn.xy, abs(tZ.z) * wn.z);
        vec3 nW = normalize(tX.zyx * bw.x + tY.xzy * bw.y + tZ.xyz * bw.z);
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz) * (gl_FrontFacing ? 1.0 : 1.0); }`);
  };
  m.customProgramCacheKey = () => 'ground-elevated-concrete-v3' + (R4B ? '-r4b' : '');
  m.needsUpdate = true;
  return m;
}
