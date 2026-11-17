// Ground pass: terrain <-> hard surface transitions (wraps the terrain ground shader, src/world/terrain/groundShader.js).
// Reads the surface mask (surfaceMask.js) around the camera:
//   - shoulders: next to asphalt / pavement the terrain recipe gives way to a shoulder recipe (Keys: pale coral sand; mainland:
//     sandy gravel / dirt) through a noise- and height-weighted boundary, so sand and gravel break up into the grass in
//     irregular patches instead of a ruled line; the band is wider and more ragged beside open roads than beside pavement
//   - crumbs: just outside an asphalt edge, small asphalt crumbs and broken chunks lie in the sand
//   - lowered under hard surfaces: terrain vertices under a road / slab drop 25 cm (no ground poking through a road on relief)
//   - sand washed onto the road edge is drawn by the asphalt side (materials.js, roadEdge)
// patchTerrainEdges(mat, { sand: recipeIndex, gravel: recipeIndex })
import { GM_GLSL, gmUniforms } from './surfaceMask.js';

const OFF = typeof location !== 'undefined' && /[?&](gmask|gedge)=0\b/.test(location.search);

export function patchTerrainEdges(mat, o = {}) {
  if (!mat || OFF || mat.userData.gmEdge) return mat; mat.userData.gmEdge = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const SAND = o.sand ?? 6, GRAV = o.gravel ?? 14, DIRT = o.dirt ?? 8, SHELL = o.shell ?? 7;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    if (!sh.fragmentShader.includes('// macro variation over everything')) { console.warn('[ground] terrain shader anchor missing: edges off'); return; }
    gmUniforms(sh.uniforms);
    sh.vertexShader = GM_GLSL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec2 gmw = (modelMatrix * vec4(transformed, 1.0)).xz;
        vec4 gmh = gmHard(gmw);
        transformed.y -= 0.25 * smoothstep(0.55, 0.95, max(gmh.r, gmh.g)) * gmFine(gmw);
      }`);
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
          GS dr = gRecipe(${SHELL}, wp, gdx, gdy, gWantN); dr.alb *= vec3(1.03, 1.0, 0.94) * mix(0.82, 1.06, dn);
          gs = gsMix(gs, dr, wd * 0.96);
        }
        if (gmNr > 0.015) {
          float keys = smoothstep(4150.0, 4500.0, wp.y);
          GS shS = gRecipe(${SHELL}, wp, gdx, gdy, gWantN); shS.alb *= vec3(1.02, 1.0, 0.95); // Keys: pale crushed coral / shell
          GS shG = shS; if (keys < 0.99) shG = gRecipe(${GRAV}, wp, gdx, gdy, gWantN);
          GS sh = gsMix(shG, shS, keys);
          sh.alb *= mix(vec3(0.94, 0.9, 0.84), vec3(1.0), keys); // mainland shoulders: dustier, a touch darker than beach sand
          float n1 = gN(wp * 0.9 + 4.7), n2 = gN(wp * 3.1 - 2.3), n3 = gF(wp * 0.23 + 1.1);
          // asphalt: ragged shoulder 1-2.5 m; pavement: a narrow worn strip
          float t = gmA * 2.3 + gmP * 1.25 - 0.3 + (n3 - 0.5) * 0.9 + (n1 - 0.5) * 0.45 + (n2 - 0.5) * 0.18 + (sh.h - gs.h) * 0.55;
          gmSh = smoothstep(0.32, 0.5, t);
          // between shoulder and grass: a band of bare dirt / thin grass (height based: the grass texture's tall blades survive longest)
          float tb = smoothstep(0.12, 0.32, t) * (1.0 - gmSh);
          if (tb > 0.01) { GS dt = gRecipe(${DIRT}, wp, gdx, gdy, gWantN); dt.alb = mix(dt.alb, sh.alb, 0.45); gs = gsMix(gs, dt, tb * smoothstep(0.35, 0.65, 1.0 - gs.h + (n2 - 0.5) * 0.6) * 0.85); }
          gs = gsMix(gs, sh, gmSh);
          // asphalt crumbs and broken chunks in the first ~0.8 m beyond the edge (only where fine mask detail exists)
          float cz = smoothstep(0.16, 0.36, gmA) * (1.0 - smoothstep(0.5, 0.62, gmA)) * gmFine(wp);
          if (cz > 0.0) {
            float c1 = gN(wp * 7.3 + 1.7), c2 = gN(wp * 19.0 - 3.1), c3 = gN(wp * 2.1 + 8.8);
            gmCrumb = cz * max(step(0.79 - c3 * 0.22, c1 * 0.55 + c2 * 0.45), step(0.86, c2) * 0.8);
            gs.alb = mix(gs.alb, vec3(0.105, 0.102, 0.098) * (0.75 + 0.5 * c2), gmCrumb); gs.rough = mix(gs.rough, 0.85, gmCrumb); gs.h = mix(gs.h, 0.7, gmCrumb);
          }
        }
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
        if (fine > 0.01 && vGmW.y < 1.2) {
          vec4 gn = gmNear(w);
          float open = (1.0 - smoothstep(0.06, 0.18, gn.g)) * fine;
          if (open > 0.01 && gn.r < 0.82) {
            float n1 = reN(w * 1.6 + 3.1), n2 = reN(w * 5.3 - 1.7), n3 = reN(w * 17.0 + 0.3);
            float cut = 0.5 + (n1 * 0.55 + n2 * 0.3 + n3 * 0.15) * 0.2 * open + 0.012;
            if (gn.r < cut) discard;
            float keys = smoothstep(4150.0, 4500.0, w.y);
            float edge = 1.0 - smoothstep(cut, cut + 0.13, gn.r); // last ~0.4 m before the break
            float drift = edge * smoothstep(0.35, 0.7, reN(w * 0.8 + 7.7) * 0.6 + n2 * 0.4) * open;
            vec3 sandC = mix(vec3(0.42, 0.38, 0.31), vec3(0.62, 0.56, 0.45), keys);
            diffuseColor.rgb = mix(diffuseColor.rgb * mix(1.0, 1.12, edge * open), sandC * (0.85 + 0.3 * n3), drift * 0.85);
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
