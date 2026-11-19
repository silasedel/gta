// city-look: ONE shared PBR material for every street prop (poles, bins, benches, shelters, signals, rooftop gear ...).
// Geometry carries two extra per-vertex attributes besides position/normal/color:
//   aSurf (vec3): x = surface layer (SURF.* below), y = emissive strength 0..1 (lamp lenses, signal lights; scaled by uEmis),
//                 z = 1 where the per-instance color (InstancedMesh.setColorAt) tints this vertex, 0 where it must not
//                 (so one bench geometry can have its slats recolored per instance while its cast-iron ends stay iron)
// The albedo comes from a sampler2DArray of real CC0 PBR sets sampled triplanar in world space, tinted by the vertex color,
// so props need no UV unwrap, never stretch, and one InstancedMesh pool per geometry covers all of its surfaces.
import * as THREE from 'three';
import { loadArray, atlasCells, flatLayer } from './pbr.js';

export const SURF = {
  paint: 0, // smooth painted metal (takes the vertex tint)
  galv: 1, // galvanized / spangled steel
  rust: 2, // heavy rust
  wood: 3, // finished wood (native color, tint near white)
  concrete: 4, // cast concrete
  plaster: 5, // stucco / plaster
  rustPaint: 6, // paint with rust blooms and chips
  planks: 7, // weathered grey boards
  iron: 8, // dark cast iron / checker plate
  patina: 9, // worn green enamel with rust
  plastic: 10, // molded plastic (takes the tint)
  steel: 11, // brushed stainless / aluminum
  rubber: 12, // matte black rubber
  glass: 13, // tinted glazing panel (reflective, takes the tint)
  bark: 14, // palm / tree bark for wooden utility poles
  creosote: 15, // dark treated timber
};
// world tile size (m) per layer, metalness, roughness multiplier
const LAYER_DEF = [
  { key: 'paint', cell: 0, neutral: 1, level: 0.82, metal: 0.0, tile: 1.6 },
  { key: 'galv', cell: 1, neutral: 0.8, level: 0.7, metal: 0.9, tile: 1.4 },
  { key: 'rust', cell: 2, neutral: 0, metal: 0.25, tile: 1.4 },
  { key: 'wood', cell: 3, neutral: 0, level: 0.55, metal: 0, tile: 1.2 },
  { key: 'concrete', cell: 4, neutral: 0.7, level: 0.72, metal: 0, tile: 2.0 },
  { key: 'plaster', cell: 5, neutral: 1, level: 0.82, metal: 0, tile: 2.0 },
  {
    key: 'rustPaint',
    name: 'rusty_painted_metal',
    neutral: 0.55,
    level: 0.7,
    metal: 0.15,
    tile: 1.8,
  },
  { key: 'planks', name: 'weathered_planks', neutral: 0.2, level: 0.5, metal: 0, tile: 1.8 },
  { key: 'iron', name: 'metal_plate', neutral: 0.9, level: 0.3, metal: 0.85, tile: 1.0 },
  { key: 'patina', name: 'green_metal_rust', neutral: 0.75, level: 0.75, metal: 0.2, tile: 1.6 },
  {
    key: 'plastic',
    synth: flatLayer({ luma: 205, grain: 8, rough: 120, bump: 5, seed: 11 }),
    metal: 0,
    tile: 1,
  },
  { key: 'steel', cell: 1, neutral: 1, level: 0.85, metal: 1.0, rough: 0.55, tile: 0.9 },
  {
    key: 'rubber',
    synth: flatLayer({ luma: 46, grain: 14, rough: 235, bump: 16, seed: 23 }),
    metal: 0,
    tile: 0.6,
  },
  {
    key: 'glass',
    synth: flatLayer({ luma: 210, grain: 2, rough: 14, bump: 1, seed: 37 }),
    metal: 0.7,
    tile: 1,
  },
  { key: 'bark', name: 'palm_bark', neutral: 0.1, level: 0.42, metal: 0, tile: 1.3 },
  { key: 'creosote', name: 'bark_willow', neutral: 0.5, level: 0.2, metal: 0, tile: 1.5 },
];

let arrP = null;
export function loadPropArray(renderer) {
  if (!arrP) {
    arrP = (async () => {
      const base = (import.meta.env?.BASE_URL ?? '/') + 'assets/city/tex/';
      const cellOf = await atlasCells(
        [base + 'props_color.jpg', base + 'props_normal.jpg', base + 'props_rough.jpg'],
        3,
        2,
      );
      const layers = LAYER_DEF.map((d) => ({
        ...d,
        name: d.name || d.key,
        synth: d.synth || (d.cell !== undefined ? cellOf(d.cell) : undefined),
      }));
      const arr = await loadArray(renderer, layers, { size: 512 });
      arr.tiles = LAYER_DEF.map((d) => 1 / d.tile);
      return arr;
    })();
  }
  return arrP;
}

// Patches any MeshStandardMaterial (vertexColors on) to read the prop array. Returns the material.
// uniforms.uEmis (shared object) scales the per-vertex emissive; pass the same object to every prop material.
// opts.surf (a SURF.* layer): use ONE layer for the whole material instead of the per-vertex aSurf attribute (for older merged
// geometry without aSurf); the regular vertex / instance colors then tint everything. opts.emis: constant emissive 0..1.
export function patchPropMaterial(mat, arr, shared = {}, opts = {}) {
  const uEmis = shared.uEmis || (shared.uEmis = { value: 0 }),
    uni = opts.surf !== undefined;
  mat.userData.pbr =
    'prop-array:' + (uni ? Object.keys(SURF).find((k) => SURF[k] === opts.surf) : 'per-vertex');
  const prev = mat.onBeforeCompile;
  if (!uni) mat.vertexColors = true;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uPropCol = { value: arr.colR };
    sh.uniforms.uPropNrm = { value: arr.nrmAO };
    sh.uniforms.uPropEmis = uEmis;
    sh.uniforms.uPropTile = { value: arr.tiles };
    if (uni) sh.uniforms.uPropSurf = { value: new THREE.Vector3(opts.surf, opts.emis || 0, 1) };
    sh.vertexShader =
      (uni ? 'uniform vec3 uPropSurf;\n#define aSurf uPropSurf\n' : 'attribute vec3 aSurf;\n') +
      'flat out vec2 vSurf;\nout vec3 vPrP;\nout vec3 vPrN;\n' +
      sh.vertexShader
        .replace(
          '#include <color_vertex>',
          uni
            ? '#include <color_vertex>'
            : `#include <color_vertex>
      #ifdef USE_INSTANCING_COLOR
        vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, aSurf.z);
      #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
      vSurf = aSurf.xy;
      { vec4 pw = vec4(transformed, 1.0); vec3 pn = objectNormal;
      #ifdef USE_INSTANCING
        pw = instanceMatrix * pw; pn = mat3(instanceMatrix) * pn;
      #endif
        pw = modelMatrix * pw; vPrP = pw.xyz; vPrN = normalize(mat3(modelMatrix) * pn); }`,
        );
    sh.fragmentShader =
      `uniform sampler2DArray uPropCol;\nuniform sampler2DArray uPropNrm;\nuniform float uPropEmis;\nuniform float uPropTile[${arr.count}];\nflat in vec2 vSurf;\nin vec3 vPrP;\nin vec3 vPrN;\nvec4 gPrN; float gPrR; float gPrE;\n` +
      sh.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
        { float L = floor(vSurf.x + 0.5); float ts = uPropTile[int(L)];
          vec3 bw = pow(abs(vPrN), vec3(5.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
          vec2 ux = vPrP.zy * ts, uy = vPrP.xz * ts, uz = vPrP.xy * ts;
          vec4 c = texture(uPropCol, vec3(ux, L)) * bw.x + texture(uPropCol, vec3(uy, L)) * bw.y + texture(uPropCol, vec3(uz, L)) * bw.z;
          vec4 nx = texture(uPropNrm, vec3(ux, L)), ny = texture(uPropNrm, vec3(uy, L)), nz = texture(uPropNrm, vec3(uz, L));
          gPrN = nx * bw.x + ny * bw.y + nz * bw.z; gPrR = c.a;
          // whiteout-blended world normal from the three projections
          vec3 wn = normalize(vPrN);
          vec3 tX = vec3(nx.xy * 2.0 - 1.0, 1.0), tY = vec3(ny.xy * 2.0 - 1.0, 1.0), tZ = vec3(nz.xy * 2.0 - 1.0, 1.0);
          tX = vec3(tX.xy + wn.zy, abs(tX.z) * wn.x); tY = vec3(tY.xy + wn.xz, abs(tY.z) * wn.y); tZ = vec3(tZ.xy + wn.xy, abs(tZ.z) * wn.z);
          gPrN.xyz = normalize(tX.zyx * bw.x + tY.xzy * bw.y + tZ.xyz * bw.z);
          // large-scale grime so identical props still differ a little from place to place
          float gr = fract(sin(dot(floor(vPrP.xz * 0.35), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= c.rgb * (0.9 + 0.2 * gr);
          gPrE = vSurf.y; }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(gPrR, 0.04, 1.0);',
        )
        .replace(
          '#include <metalnessmap_fragment>',
          '#include <metalnessmap_fragment>\n  metalnessFactor = gPrN.a;',
        )
        .replace(
          '#include <normal_fragment_maps>',
          '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(gPrN.xyz, 0.0)).xyz) * faceDirection;',
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * gPrE * uPropEmis * 3.0;',
        )
        .replace(
          '#include <aomap_fragment>',
          '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= mix(1.0, gPrN.b, 0.85);',
        );
  };
  mat.customProgramCacheKey = () =>
    'ps-prop-' +
    arr.count +
    (uni ? '-u' + opts.surf + (opts.emis ? 'e' : '') : '') +
    (prev ? '-p' + (mat.userData.pbrKey || mat.uuid) : '');
  mat.needsUpdate = true;
  return mat;
}

export async function createPropMaterial(renderer, shared = {}, params = {}) {
  const arr = await loadPropArray(renderer);
  return patchPropMaterial(
    new THREE.MeshStandardMaterial({ vertexColors: true, ...params }),
    arr,
    shared,
  );
}

// ---- geometry helpers for prop builders ----
// Merge parts into one non-indexed BufferGeometry with position/normal/uv/color/aSurf.
// part: { g: BufferGeometry, m?: Matrix4, color?: hex | THREE.Color, surf?: SURF.*, emis?: 0..1, tint?: 0 | 1 }
const _c = new THREE.Color();
export function mergeProp(parts) {
  const P = [],
    N = [],
    U = [],
    C = [],
    S = [];
  for (const pt of parts) {
    let g = pt.g.index ? pt.g.toNonIndexed() : pt.g.clone();
    if (pt.m) g.applyMatrix4(pt.m);
    const p = g.attributes.position.array,
      n = g.attributes.normal.array,
      u = g.attributes.uv ? g.attributes.uv.array : null;
    const gc = g.attributes.color ? g.attributes.color.array : null;
    _c.set(pt.color ?? 0xffffff);
    for (let i = 0, k = 0; i < p.length; i += 3, k += 2) {
      P.push(p[i], p[i + 1], p[i + 2]);
      N.push(n[i], n[i + 1], n[i + 2]);
      U.push(u ? u[k] : 0, u ? u[k + 1] : 0);
      if (gc) C.push(gc[i] * _c.r, gc[i + 1] * _c.g, gc[i + 2] * _c.b);
      else C.push(_c.r, _c.g, _c.b);
      S.push(pt.surf ?? 0, pt.emis ?? 0, pt.tint ?? 0);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  out.setAttribute('aSurf', new THREE.Float32BufferAttribute(S, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
