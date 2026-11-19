// Airport pavement: runways (grooved dark asphalt with tire rubber in the touchdown zones), blast pads, shoulders,
// taxiways (asphalt) and aprons (poured concrete slabs with joints aligned to the terminal), from the non-overlapping
// polygons in airports.json (tools/v2/airport/design.py). One mesh per surface kind per airport; the polygons are
// triangulated with earcut and laid on the (flat, graded) airfield; every mesh joins the ground mask so grass and
// plants never grow through it.
import * as THREE from 'three';
import { loadSet } from '../city/pbr.js';
import { surfaceMask } from '../ground/surfaceMask.js';
import { frame } from './geom.js';

export const PAVE_Y = 0.03; // pavement top over the graded ground (polygonOffset keeps it on top of the terrain far away)

const SETS = {
  runway: ['asphalt_02', 3.2],
  blast: ['asphalt_04', 3.0],
  shoulder: ['worn_asphalt', 4.0],
  taxiway: ['asphalt_02', 3.2],
  apron: ['concrete_floor_worn_001', 4.0],
  forecourt: ['concrete_pavement', 3.0],
};
const TINT = {
  runway: 0x8a8a88,
  blast: 0x9a9890,
  shoulder: 0xb4b0a6,
  taxiway: 0x9d9d9a,
  apron: [3.4, 3.4, 3.3],
  forecourt: [1.4, 1.7, 2.2],
}; // linear multipliers on the set albedo (source means: worn concrete 86, pavers 128/116/102)

function triangulate(polys, ground, f, tile) {
  const pos = [],
    uv = [],
    fq = [],
    idx = [];
  for (const p of polys) {
    const outer = p.o.map(([x, z]) => new THREE.Vector2(x, z)),
      holes = (p.h || []).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
    if (THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
    for (const h of holes) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(outer, holes),
      all = outer.concat(...holes),
      b = pos.length / 3;
    for (const v of all) {
      pos.push(v.x, ground(v.x, v.y) + PAVE_Y, v.y);
      const s = f.s(v.x, v.y),
        q = f.q(v.x, v.y);
      uv.push(s / tile, q / tile);
      fq.push(s, q);
    }
    for (const t of tris) idx.push(b + t[0], b + t[2], b + t[1]); // y-up winding (x, z plane)
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('fq', new THREE.Float32BufferAttribute(fq, 2));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// runway frames for the shader: rubber deposits (touchdown zones), centerline wear
function rwUniforms(ap) {
  const A = [],
    B = [];
  for (let i = 0; i < 2; i++) {
    const r = ap.runways[i];
    if (!r) {
      A.push(new THREE.Vector4(1e6, 1e6, 1, 0));
      B.push(new THREE.Vector2(0, 0));
      continue;
    }
    const F = frame(r.a, r.b);
    A.push(new THREE.Vector4(r.a[0], r.a[1], F.ux, F.uz));
    B.push(new THREE.Vector2(F.L, r.w));
  }
  return { uRwA: { value: A }, uRwB: { value: B } };
}

function patch(mat, kind, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader =
      'attribute vec2 fq;\nvarying vec2 vFQ;\nvarying vec3 vAWP;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vFQ = fq; vAWP = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    sh.fragmentShader =
      'uniform vec4 uRwA[2];\nuniform vec2 uRwB[2];\nvarying vec2 vFQ;\nvarying vec3 vAWP;\n' +
      `
float apH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float apN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(apH(i), apH(i + vec2(1, 0)), f.x), mix(apH(i + vec2(0, 1)), apH(i + vec2(1, 1)), f.x), f.y); }
float apF(vec2 p) { return apN(p) * 0.5 + apN(p * 2.03) * 0.25 + apN(p * 4.1) * 0.125 + apN(p * 8.3) * 0.0625; }
` +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  {
    vec2 wp = vAWP.xz;
    float macro = apF(wp * 0.011) * 0.6 + apF(wp * 0.05) * 0.4;           // large patches: older / newer surface, sealer
    diffuseColor.rgb *= mix(0.86, 1.1, macro);
    ${
      kind === 'runway' || kind === 'taxiway'
        ? `
    // tire rubber: dark streaks along the centerline in each touchdown zone, polished wheel tracks on taxiways
    float rub = 0.0;
    for (int i = 0; i < 2; i++) {
      vec2 d = wp - uRwA[i].xy; float s = dot(d, uRwA[i].zw), q = dot(d, vec2(uRwA[i].w, -uRwA[i].z)); float L = uRwB[i].x, w = uRwB[i].y;
      if (L < 1.0 || abs(q) > w * 0.5 + 1.0 || s < -5.0 || s > L + 5.0) continue;
      float zA = smoothstep(80.0, 230.0, s) * (1.0 - smoothstep(420.0, 820.0, s)), zB = smoothstep(80.0, 230.0, L - s) * (1.0 - smoothstep(420.0, 820.0, L - s));
      float band = exp(-q * q / (w * w * 0.012)) + 0.6 * exp(-pow(abs(q) - 3.6, 2.0) / 2.5);   // main gear tracks either side of the line
      float streak = apN(vec2(s * 0.06, q * 1.7)) * 0.6 + apN(vec2(s * 0.015, q * 0.6)) * 0.6;
      rub = max(rub, clamp((zA + zB) * band * streak * 1.25, 0.0, 0.85));
    }
    diffuseColor.rgb *= 1.0 - rub * 0.72;`
        : ''
    }
    ${
      kind === 'apron' || kind === 'forecourt'
        ? `
    // slab joints every 5 m (sawn, dark, slightly wider where spalled), oil drips at the stands
    vec2 j = abs(fract(vFQ / 5.0 + 0.5) - 0.5) * 5.0; float jw = 0.018 + apN(vFQ * 0.7) * 0.012;
    float joint = 1.0 - smoothstep(jw, jw + 0.025, min(j.x, j.y));
    diffuseColor.rgb *= 1.0 - joint * 0.45;
    float oil = smoothstep(0.62, 0.8, apF(wp * 0.12)) * smoothstep(0.45, 0.7, apN(wp * 0.02));
    diffuseColor.rgb *= 1.0 - oil * 0.35;`
        : ''
    }
  }`,
      );
  };
  mat.customProgramCacheKey = () => 'airport-pave-' + kind;
}

export async function buildPavement(ap, { renderer, ground, group }) {
  const main = ap.runways.find((r) => r.use === 'airline') || ap.runways[0],
    F = frame(main.a, main.b);
  const U = rwUniforms(ap),
    GM = surfaceMask(),
    out = [];
  const sets = {};
  await Promise.all(
    Object.entries(SETS).map(async ([k, [name]]) => {
      try {
        sets[k] = await loadSet(renderer, name);
      } catch (e) {
        sets[k] = null;
      }
    }),
  );
  let order = 0;
  for (const kind of ['forecourt', 'apron', 'shoulder', 'taxiway', 'blast', 'runway']) {
    const polys = ap.pave?.[kind];
    if (!polys?.length) continue;
    const g = triangulate(polys, ground, F, SETS[kind][1]);
    if (!g) continue;
    const s = sets[kind];
    const mat = new THREE.MeshStandardMaterial({
      color: Array.isArray(TINT[kind]) ? new THREE.Color().setRGB(...TINT[kind]) : TINT[kind],
      roughness: 0.92,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    if (s) {
      mat.map = s.map;
      mat.normalMap = s.normalMap;
      mat.roughnessMap = s.arm;
      mat.normalScale = new THREE.Vector2(0.8, 0.8);
    }
    patch(mat, kind, U);
    const m = new THREE.Mesh(g, mat);
    m.name = 'airport-pave-' + kind;
    m.receiveShadow = true;
    m.castShadow = false;
    m.renderOrder = -1 + order++ * 0.01;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.userData.noDetailCull = true;
    group.add(m);
    out.push(m);
    try {
      if (!GM.off) GM.register(m, kind === 'apron' || kind === 'forecourt' ? 'paved' : 'asphalt');
    } catch (e) {
      /* the mask is optional */
    }
  }
  return out;
}
