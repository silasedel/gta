// Ground pass: terrain <-> hard surface transitions (wraps the terrain ground shader, src/world/terrain/groundShader.js).
// Reads the surface mask (surfaceMask.js) around the camera:
//   - shoulders: next to asphalt / pavement the terrain recipe gives way to a shoulder recipe (Keys: pale coral sand; mainland:
//     sandy gravel / dirt) through a noise- and height-weighted boundary, so sand and gravel break up into the grass in
//     irregular patches instead of a ruled line; the band is wider and more ragged beside open roads than beside pavement
//   - crumbs: just outside an asphalt edge, small asphalt crumbs and broken chunks lie in the sand
//   - sand washed onto the road edge is drawn by the asphalt side (materials.js, roadEdge)
// patchTerrainEdges(mat, { sand: recipeIndex, gravel: recipeIndex })
import { GM_GLSL, gmUniforms } from './surfaceMask.js';

const OFF = typeof location !== 'undefined' && /[?&](gmask|gedge)=0\b/.test(location.search);

export function patchTerrainEdges(mat, o = {}) {
  if (!mat || OFF || mat.userData.gmEdge) return mat; mat.userData.gmEdge = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const SAND = o.sand ?? 6, GRAV = o.gravel ?? 14, DIRT = o.dirt ?? 8, SHELL = o.shell ?? 7, LAWN = o.lawn ?? 0, MULCH = o.mulch ?? 2;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    if (!sh.fragmentShader.includes('// macro variation over everything')) { console.warn('[ground] terrain shader anchor missing: edges off'); return; }
    gmUniforms(sh.uniforms);
    // (no vertex lowering under roads: dropping the 4 m terrain grid let the low-detail land base show through in saw-tooth triangles)
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', GM_GLSL + /* glsl */`
GS gsMix(GS a, GS b, float w) { GS s; s.alb = mix(a.alb, b.alb, w); s.tilt = mix(a.tilt, b.tilt, w); s.ao = mix(a.ao, b.ao, w); s.rough = mix(a.rough, b.rough, w); s.h = mix(a.h, b.h, w); s.wet = mix(a.wet, b.wet, w); s.shore = mix(a.shore, b.shore, w); return s; }
void main() {`).replace('// macro variation over everything', /* glsl */`
      float gmCrumb = 0.0, gmSh = 0.0;
      {
        vec4 gmn = gmNear(wp);
        float gmA = gmn.r, gmP = gmn.g, gmNr = max(gmA, gmP * 0.75);
        if (gmn.a > 0.03) { // unpaved drive / yard track: crushed shell and sand, ragged edges, matted (no slab)
          float dn = gN(wp * 1.1 + 2.0) * 0.6 + gN(wp * 3.7 - 1.0) * 0.4;
          float wd = smoothstep(0.3, 0.62, gmn.a + (dn - 0.5) * 0.4 + (0.5 - gs.h) * 0.25);
          GS dr = gRecipe(${SAND}, wp, gdx, gdy, gWantN); GS dg = gRecipe(${SHELL}, wp, gdx, gdy, gWantN); dr = gsMix(dr, dg, 0.3 * smoothstep(0.4, 0.7, dn)); dr.alb = mix(dr.alb, gs.alb, 0.2) * vec3(1.05, 1.02, 0.97) * mix(0.86, 1.05, dn);
          gs = gsMix(gs, dr, wd * 0.96);
        }
        if (gmNr > 0.015) {
          float keys = smoothstep(4150.0, 4500.0, wp.y);
          GS shS = gRecipe(${SAND}, wp, gdx, gdy, gWantN); // Keys: sand (tone-matched to the yard below)
          GS shG = shS; if (keys < 0.99) shG = gRecipe(${GRAV}, wp, gdx, gdy, gWantN);
          GS sh = gsMix(shG, shS, keys);
          // tone-match: the shoulder keeps the surrounding ground's brightness and most of its hue (no pale polygon), only its
          // texture / roughness / height change; a touch lighter and warmer where traffic dust settles
          { float lg = dot(gs.alb, vec3(0.2126, 0.7152, 0.0722)), ls = max(dot(sh.alb, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
            vec3 hue = mix(gs.alb / max(lg, 1e-3), sh.alb / ls, 0.75);
            sh.alb = hue * mix(ls, lg, 0.6) * mix(vec3(0.97, 0.95, 0.92), vec3(1.05, 1.03, 0.99), keys); }
          float n1 = gN(wp * 0.9 + 4.7), n2 = gN(wp * 3.1 - 2.3), n3 = gF(wp * 0.23 + 1.1);
          // asphalt: ragged shoulder 1-2.5 m; pavement: a narrow worn strip
          // city verge (pavement within ~2 m: a tree lawn between curb and sidewalk, a lawn beside a plaza): no rural shoulder
          float urban = smoothstep(0.05, 0.2, gmP) * (1.0 - keys * 0.7);
          float t = gmA * 2.1 + gmP * 1.1 - mix(0.5, 0.36, keys) + (n3 - 0.5) * 0.9 + (n1 - 0.5) * 0.45 + (n2 - 0.5) * 0.18 + (sh.h - gs.h) * 0.55;
          gmSh = smoothstep(0.32, 0.5, t) * (1.0 - urban);
          // between shoulder and grass: a band of bare dirt / thin grass (height based: the grass texture's tall blades survive longest)
          float tb = smoothstep(0.12, 0.32, t) * (1.0 - gmSh) * (1.0 - urban);
          if (urban > 0.01) { // trimmed St. Augustine: lush, even lawn; worn soil patches near the curb; a thin soil lip at the paving edge
            GS lw = gRecipe(${LAWN}, wp, gdx, gdy, gWantN); lw.alb *= vec3(0.9, 1.0, 0.86);
            gs = gsMix(gs, lw, urban * 0.9);
            float worn = smoothstep(0.26, 0.42, gmA + (n1 - 0.5) * 0.3) * smoothstep(0.5, 0.72, n2 * 0.55 + n3 * 0.45);
            float lip = smoothstep(0.32, 0.45, gmP + (n2 - 0.5) * 0.07 + (gN(wp * 9.0) - 0.5) * 0.05);
            float wl = max(worn * 0.75, lip * 0.8) * urban;
            if (wl > 0.01) { GS so = gRecipe(${DIRT}, wp, gdx, gdy, gWantN); so.alb *= mix(1.0, 0.7, lip); so.tilt *= 1.4; gs = gsMix(gs, so, wl); }
          }
          if (tb > 0.01) { GS dt = gRecipe(${DIRT}, wp, gdx, gdy, gWantN); dt.alb = mix(dt.alb, sh.alb, 0.45); gs = gsMix(gs, dt, tb * smoothstep(0.35, 0.65, 1.0 - gs.h + (n2 - 0.5) * 0.6) * 0.85); }
          gs = gsMix(gs, sh, gmSh);
          // asphalt crumbs and broken chunks in the first ~0.8 m beyond the edge (only where fine mask detail exists)
          float cz = smoothstep(0.16, 0.36, gmA) * (1.0 - smoothstep(0.5, 0.62, gmA)) * gmFine(wp);
          if (cz > 0.0) {
            // small chunks (5-15 cm) and grit, densest at the edge; the sand around them is darkened by asphalt dust
            float c1 = gN(wp * 13.0 + 1.7), c2 = gN(wp * 37.0 - 3.1), c3 = gN(wp * 1.7 + 8.8);
            float edgeK = smoothstep(0.2, 0.48, gmA);
            gmCrumb = cz * max(step(0.86 - edgeK * 0.1 - c3 * 0.08, c1 * 0.6 + c2 * 0.4) * 0.85, step(0.9 - edgeK * 0.06, c2) * 0.6);
            gs.alb *= 1.0 - cz * edgeK * 0.18 * (0.6 + 0.4 * c3);
            gs.alb = mix(gs.alb, vec3(0.16, 0.155, 0.148) * (0.8 + 0.4 * c2), gmCrumb); gs.rough = mix(gs.rough, 0.85, gmCrumb); gs.h = mix(gs.h, 0.75, gmCrumb);
          }
        }
      }
      { // mulch rings at street trees (mask B channel, half value; cars are full value): dark shredded bark, ragged edge
        float mj = (gN(wp * 2.3 + 1.0) - 0.5) * 0.35;
        float mu = gmHard(wp + vec2(mj, -mj)).b;
        float mw = smoothstep(0.22, 0.34, mu) * (1.0 - smoothstep(0.72, 0.86, mu)) * gmFine(wp);
        if (mw > 0.01) { GS ml = gRecipe(${MULCH}, wp, gdx, gdy, gWantN); ml.alb *= vec3(0.47, 0.37, 0.3); ml.rough = 0.95; gs = gsMix(gs, ml, mw); }
      }
      // macro variation over everything`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|gmedge';
  mat.needsUpdate = true;
  return mat;
}

// Open asphalt edges (no curb, near the camera): the edge breaks up irregularly (noise-cut, 0-0.6 m in), sand / dust is washed onto
// the last half meter in drifts, and the asphalt there is a bit lighter and rougher (crumbling, sun-bleached). Curbed edges (pavement
// next to the asphalt), junction mouths and decks are left alone. patchRoadEdges(mat)
export function patchRoadEdges(mat) {
  if (!mat || OFF || mat.userData.gmRoad) return mat; mat.userData.gmRoad = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    gmUniforms(sh.uniforms);
    sh.vertexShader = 'varying vec3 vGmW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vGmW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = GM_GLSL + /* glsl */`varying vec3 vGmW;
float reP = 0.0;
float reH1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float reN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(reH1(i), reH1(i + vec2(1.0, 0.0)), f.x), mix(reH1(i + vec2(0.0, 1.0)), reH1(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <normal_fragment_begin>', /* glsl */`{
        vec2 w = vGmW.xz; float fine = gmFine(w);
        { // Keys asphalt (mock-up): pale, sun-bleached, a thin film of coral sand in patches; shallow puddles linger in the low spots
          float kk = smoothstep(4150.0, 4500.0, w.y);
          if (kk > 0.0 && vGmW.y < 1.2) {
            float b1 = reN(w * 0.21 + 1.3), b2 = reN(w * 1.7 - 4.1), b3 = reN(w * 6.3 + 2.2);
            float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 bleached = mix(diffuseColor.rgb, vec3(l) * vec3(1.06, 1.03, 0.96), 0.5) * 1.22;
            float film = smoothstep(0.45, 0.8, b1 * 0.6 + b2 * 0.4) * (0.55 + 0.45 * b3);
            diffuseColor.rgb = mix(diffuseColor.rgb, bleached, kk * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.47, 0.41) * (0.85 + 0.3 * b3), film * 0.4 * kk);
            roughnessFactor = mix(roughnessFactor, 0.97, film * 0.5 * kk);
            float lowSpot = smoothstep(0.62, 0.7, reN(w * 0.13 + 8.1) * 0.7 + b2 * 0.3);
            float kp = max(uWeather.y, 0.35 * kk) * lowSpot;
            if (kp > 0.0) { reP = max(reP, kp); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.32 + vec3(0.012), kp); roughnessFactor = mix(roughnessFactor, 0.03, kp); }
          }
        }
        if (fine > 0.01 && vGmW.y < 1.2) {
          vec4 gn = gmNear(w);
          float open = (1.0 - smoothstep(0.06, 0.18, gn.g)) * fine;
          if (open > 0.01 && gn.r < 0.82) {
            float n1 = reN(w * 1.6 + 3.1), n2 = reN(w * 5.3 - 1.7), n3 = reN(w * 17.0 + 0.3);
            float g1 = reN(w * 41.0 + 5.5);
            float cut = 0.5 + (n1 * 0.45 + n2 * 0.3 + n3 * 0.25) * 0.2 * open + (g1 - 0.5) * 0.035 * open + 0.012; // ragged at 3 scales, grit at the very edge
            if (gn.r < cut) discard;
            float keys = smoothstep(4150.0, 4500.0, w.y);
            float edge = 1.0 - smoothstep(cut, cut + 0.13, gn.r); // last ~0.4 m before the break
            float drift = edge * smoothstep(0.45, 0.8, reN(w * 0.8 + 7.7) * 0.6 + n2 * 0.4) * open * mix(0.45, 0.85, keys);
            drift *= smoothstep(0.25, 0.75, g1 * 0.6 + n3 * 0.4); // granular, not a smooth film
            vec3 sandC = mix(vec3(0.3, 0.28, 0.24), vec3(0.55, 0.5, 0.41), keys);
            diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, 1.08, edge * open), sandC * (0.8 + 0.4 * g1), drift);
            roughnessFactor = mix(roughnessFactor, 0.96, max(drift, edge * 0.5));
            // after rain: puddles in the sunken strip along the open edge
            float pz = (1.0 - smoothstep(cut + 0.06, cut + 0.36, gn.r)) * open;
            reP = uWeather.y * pz * smoothstep(0.5, 0.58, reN(w * 0.31 + 2.0) * 0.65 + n1 * 0.35);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.3 + vec3(0.01), reP); roughnessFactor = mix(roughnessFactor, 0.02, reP);
          }
        }
      }
      #include <normal_fragment_begin>`).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  if (reP > 0.0) normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), reP));');
  };
  mat.customProgramCacheKey = () => prevKey() + '|gmroad';
  mat.needsUpdate = true;
  return mat;
}

// City ground fills (real-Miami lawns and open land, drawn as area polygons, not terrain): a worn, dusty band along roads and
// pavement edges, broken up by noise (keeps the fill's own texture detail, recolored toward dry soil), plus asphalt crumbs beside
// open road edges. patchFillEdges(mat, { strength })
export function patchFillEdges(mat, o = {}) {
  if (!mat || OFF || mat.userData.gmFill) return mat; mat.userData.gmFill = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const K = (o.strength ?? 1).toFixed(3);
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    gmUniforms(sh.uniforms);
    sh.vertexShader = 'varying vec3 vGmW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vGmW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = GM_GLSL + /* glsl */`varying vec3 vGmW;
float feH1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float feN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(feH1(i), feH1(i + vec2(1.0, 0.0)), f.x), mix(feH1(i + vec2(0.0, 1.0)), feH1(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <normal_fragment_begin>', /* glsl */`{
        vec2 w = vGmW.xz; vec4 gn = gmNear(w); float nr = max(gn.r, gn.g * 0.8);
        if (nr > 0.02) {
          float n1 = feN(w * 0.9 + 4.7), n2 = feN(w * 3.1 - 2.3), n3 = feN(w * 0.23 + 1.1);
          float t = gn.r * 2.1 + gn.g * 1.3 - 0.32 + (n3 - 0.5) * 0.8 + (n1 - 0.5) * 0.4 + (n2 - 0.5) * 0.2;
          float wd = smoothstep(0.18, 0.5, t) * ${K};
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 soil = vec3(0.56, 0.48, 0.36) * (lum / 0.3) * mix(0.85, 1.1, n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, soil, wd * 0.85);
          roughnessFactor = mix(roughnessFactor, 0.95, wd);
          float cz = smoothstep(0.16, 0.36, gn.r) * (1.0 - smoothstep(0.5, 0.62, gn.r)) * gmFine(w) * (1.0 - smoothstep(0.06, 0.18, gn.g));
          float crumb = cz * step(0.8, feN(w * 7.3 + 1.7) * 0.55 + feN(w * 19.0 - 3.1) * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.098, 0.095), crumb);
        }
      }
      #include <normal_fragment_begin>`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|gmfill';
  mat.needsUpdate = true;
  return mat;
}
