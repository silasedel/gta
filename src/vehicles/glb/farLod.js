// Far LOD for library cars (Nov 19 perf push: downtown spent ~345 of ~1,220 draw calls per frame on cars).
//
// Beyond FAR_LOD_M a car draws as ONE mesh with ONE material instead of ~10-14 draws (four body slots, two wheel sets,
// plate, decals).  Per model, once: the LOD1 slots (paint, trim, window glass, lamps) and the wheels at rest are merged into
// one geometry, with each slot's look baked per vertex:
//   color = albedo, aFar = (roughness, metalness, clear coat, kind), aLamp = lamp channel (model/body/mats.js LAMP)
//   kind: 0 paint, 1 trim, 2 lamp, 3 window glass, 4 wheel
// Per car, the far material is a second instance of the car's own paint shader (carPaint with the same options and the SAME
// wear / two-tone / wet uniform objects), so the paint at the switch is the same shader on the same LOD1 surface; the other
// kinds replace albedo / roughness / metalness / clear coat from the vertex attributes.  Lamps read the car's live lamp
// uniforms (uLampE), so head and tail lights still glow at night.  Nothing in the slot shaders that differs at 40 m is
// left out: their close-up detail (lamp facets, grille holes, tread, flakes) fades out by 6-14 m.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carPaint, R3PAINT } from '../model/materials.js';

// switch distance in m (times 2.2 for heavy vehicles); the LOD1 -> far switch is ~0.3 px of shading at this range
export const FAR_LOD_M = 40;

const KIND = { paint: 0, trim: 1, lamp: 2, glass: 3, wheel: 4 };
// trim patterns that the trim shader averages to 0.45 x albedo at distance (grille mesh, slats, square mesh)
const DARK_PATTERNS = new Set([1, 2, 4, 5]);
const LAMP_CHANNELS = 16;
const SEAT_CHANNEL = 15;
const PLATE_CHANNEL = 14;

/** a triangle index for g (an identity one when g is not indexed) */
function triangleIndex(g) {
  if (g.index) return g.index.array;
  const n = g.getAttribute('position').count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  return idx;
}

/** true when all three corners of a triangle are cabin vertices (hidden behind the opaque far glass) */
function inCabin(mask, a, b, c) {
  return !!mask && mask[a] === 1 && mask[b] === 1 && mask[c] === 1;
}

/**
 * One slot geometry -> a far part with the common attribute set (position, normal, color, aFar, aLamp) and an index.
 * keepTri(a, b, c) drops triangles (cabin interior, lamp lenses).
 */
function farPart(g, kind, keepTri = null) {
  if (!g?.getAttribute('position')) return null;
  const pos = g.getAttribute('position');
  const n = pos.count;
  let nrm = g.getAttribute('normal');
  if (!nrm) {
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', pos);
    if (g.index) tmp.setIndex(g.index);
    tmp.computeVertexNormals();
    nrm = tmp.getAttribute('normal');
  }
  const col = g.getAttribute('color');
  const rm = g.getAttribute('aRM');
  const pat = g.getAttribute('aPat');
  const lamp = g.getAttribute('aLamp');
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const C = new Float32Array(n * 3);
  const F = new Float32Array(n * 4);
  const L = new Float32Array(n);
  const coat = kind === KIND.lamp || kind === KIND.glass ? 1 : 0;
  for (let i = 0; i < n; i++) {
    P[i * 3] = pos.getX(i);
    P[i * 3 + 1] = pos.getY(i);
    P[i * 3 + 2] = pos.getZ(i);
    N[i * 3] = nrm.getX(i);
    N[i * 3 + 1] = nrm.getY(i);
    N[i * 3 + 2] = nrm.getZ(i);
    let r = 1;
    let gg = 1;
    let b = 1;
    if (col && kind !== KIND.paint && kind !== KIND.glass) {
      r = col.getX(i);
      gg = col.getY(i);
      b = col.getZ(i);
    }
    if (pat && DARK_PATTERNS.has(Math.round(pat.getX(i)))) {
      r *= 0.45;
      gg *= 0.45;
      b *= 0.45;
    }
    const ch = lamp ? Math.round(lamp.getX(i)) : 0;
    if (ch === PLATE_CHANNEL) {
      // the plate's decal (white field, dark letters) averages to a light gray at distance
      r = gg = b = 0.62;
    }
    C[i * 3] = r;
    C[i * 3 + 1] = gg;
    C[i * 3 + 2] = b;
    F[i * 4] = rm ? rm.getX(i) : 0.5;
    F[i * 4 + 1] = rm ? rm.getY(i) : 0;
    F[i * 4 + 2] = coat;
    F[i * 4 + 3] = kind;
    L[i] = ch;
  }
  const src = triangleIndex(g);
  const idx = [];
  for (let t = 0; t + 2 < src.length; t += 3) {
    const a = src[t];
    const b = src[t + 1];
    const c = src[t + 2];
    if (keepTri && !keepTri(a, b, c)) continue;
    idx.push(a, b, c);
  }
  if (!idx.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('aFar', new THREE.BufferAttribute(F, 4));
  out.setAttribute('aLamp', new THREE.BufferAttribute(L, 1));
  out.setIndex(idx);
  return out;
}

/** a wheel geometry placed at (x, y, z) in the body frame; the left side (side < 0) turned around like syncWheels does */
function placedWheel(geo, x, y, z, side) {
  const g = geo.clone();
  const m = new THREE.Matrix4();
  if (side < 0) m.makeRotationY(Math.PI);
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

/** wheel centers at rest in the body frame: [x, z, side, rear] for every drawn wheel (virtual axle wheels left out) */
function wheelSpots(man) {
  const sides = [1, -1, 1, -1];
  const spots = [];
  (man.wheels || []).forEach((w, i) => {
    if (w.virtual) return;
    spots.push([sides[i] * Math.abs(w.pos[0]), w.pos[2], sides[i], i >= 2]);
  });
  for (const e of man.extraWheels || []) {
    spots.push([e.side * Math.abs(e.pos[0]), e.pos[2], e.side, true]);
  }
  return spots;
}

/**
 * M (a loaded model record) -> { geo, wheelY } : the merged far geometry, shared by every car of the model.
 * wheelY: the wheel center height the wheels were baked at (the car shifts them to its own ride height in the shader).
 */
export function buildFarGeometry(M) {
  const G = M.lv[1];
  if (!G?.paint) return null;
  const parts = [];
  parts.push(farPart(G.paint, KIND.paint));
  if (G.trim) {
    const mask = G.trim.userData.cabMask;
    parts.push(farPart(G.trim, KIND.trim, (a, b, c) => !inCabin(mask, a, b, c)));
  }
  if (G.glass) {
    // windows only: the clear lamp lenses would be an opaque sheet over the lamps
    const win = G.glass.getAttribute('aWin');
    const keep = (a, b, c) => !win || win.getX(a) + win.getX(b) + win.getX(c) > 1.5;
    parts.push(farPart(G.glass, KIND.glass, keep));
  }
  if (G.lamp) {
    const mask = G.lamp.userData.cabMask;
    parts.push(farPart(G.lamp, KIND.lamp, (a, b, c) => !inCabin(mask, a, b, c)));
  }
  const wheelY = M.man.r || 0.33;
  const front = M.wheel?.[1] || M.wheel?.[0];
  const rear = M.wheelR?.[1] || M.wheelR?.[0] || front;
  if (front) {
    for (const [x, z, side, isRear] of wheelSpots(M.man)) {
      const geo = isRear ? rear : front;
      parts.push(farPart(placedWheel(geo, x, wheelY, z, side), KIND.wheel));
    }
  }
  const list = parts.filter(Boolean);
  const geo = mergeGeometries(list, false);
  for (const p of list) p.dispose();
  if (!geo) return null;
  geo.name = 'car-far-' + M.key;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return { geo, wheelY };
}

// ------------------------------------------------------------------ far material (per car)
const FAR_VERT_DECL = /* glsl */ `
attribute vec4 aFar;
attribute float aLamp;
uniform float uWheelY;
varying vec4 vFar;
varying float vFarLamp;
`;
// non-paint surfaces win their near-coplanar ties with the paint (the slot materials' polygon offset): pulled toward the
// camera along the view ray by a fraction of the distance (the screen position does not change, only the depth)
const FAR_PROJECT = /* glsl */ `
  if (aFar.w > 0.5 && aFar.w < 3.5) {
    float pull = aFar.w > 2.5 ? 0.0006 : 0.0003;
    gl_Position = projectionMatrix * vec4(mvPosition.xyz * (1.0 - pull), 1.0);
  }
`;
const FAR_FRAG_DECL = /* glsl */ `
uniform vec3 uLampE[${LAMP_CHANNELS}];
uniform vec3 uSeat;
uniform vec4 uGlass;      // rgb = window tint (linear), a = opacity
uniform float uGlassRough;
varying vec4 vFar;
varying float vFarLamp;
float farEnvK = 1.0;      // the slot materials' own reflection strength, relative to the paint's
`;
// after the paint's own color / wear / roughness / metalness: the other kinds take their baked look (lamps: the far half of
// the lamp shader, model/body/mats.js lampMaterial, with the close-up facets already faded out)
const FAR_SURFACE = /* glsl */ `
  {
    int kind = int(vFar.w + 0.5);
    if (kind != 0) {
      wearDirt = 0.0;
      wearRust = 0.0;
      wearFade = 0.0;
      wearPatch = 0.0;
      wearFlare = 0.0;
      diffuseColor.rgb = vColor.rgb;
      roughnessFactor = vFar.x;
      metalnessFactor = vFar.y;
      farEnvK = kind == 1 ? 1.25 : kind == 2 ? 1.2 : kind == 3 ? 1.35 : 1.3;
    }
    if (kind == 3) {
      // tinted window over a dark cabin (the near glass is see-through: tint x opacity + cabin x the rest)
      diffuseColor.rgb = mix(vec3(0.15), uGlass.rgb, uGlass.a);
      roughnessFactor = uGlassRough;
      metalnessFactor = 0.0;
    }
    if (kind == 2) {
      int ch = int(vFarLamp + 0.5);
      if (ch == ${SEAT_CHANNEL}) diffuseColor.rgb *= uSeat;
      float ndv = clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
      bool white = ch == 1 || ch == 2 || ch == 3 || ch == 4 || ch == 7;
      bool colored = ch == 5 || ch == 6 || ch == 8 || ch == 9 || ch == 10 || ch == 13;
      if (white) {
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.81, 0.83), 0.65);
        metalnessFactor = 0.92;
        roughnessFactor = 0.07;
      } else if (colored) {
        diffuseColor.rgb *= 0.38 + 0.62 * ndv;
        metalnessFactor = 0.0;
        roughnessFactor = 0.12;
      }
      vec3 E = uLampE[ch];
      if (white) E = min(E, vec3(1.6));
      float core = white ? 0.35 + 2.6 * pow(ndv, 9.0) : 0.45 + 0.75 * pow(ndv, 1.6);
      float facets = white ? 0.75 : colored ? 0.7 : 1.0;
      totalEmissiveRadiance = E * core * facets;
    }
  }
`;
// before the paint's wear / wet clear coat rules (those see zeroed wear masks on the non-paint kinds)
const FAR_COAT = /* glsl */ `
  #ifdef USE_CLEARCOAT
  if (vFar.w > 0.5) {
    material.clearcoat = vFar.z;
    material.clearcoatRoughness = vFar.w > 2.5 && vFar.w < 3.5 ? 0.07 : 0.035;
  }
  #endif
`;
// a see-through pane reflects only its opacity's share (alpha blending); the opaque far pane does the same here
const FAR_GLASS_SPEC = /* glsl */ `
  if (vFar.w > 2.5 && vFar.w < 3.5) {
    float seen = mix(1.0, uGlass.a, 0.5);
    reflectedLight.directSpecular *= seen;
    reflectedLight.indirectSpecular *= seen;
    #ifdef USE_CLEARCOAT
    material.clearcoat *= seen;
    #endif
  }
`;

function insertAfter(src, token, code) {
  if (!src.includes(token)) {
    console.warn('[cars] far LOD shader: missing', token);
    return src;
  }
  return src.replace(token, token + '\n' + code);
}

function farShader(sh, U) {
  Object.assign(sh.uniforms, U);
  let v = sh.vertexShader;
  v = insertAfter(v, '#include <common>', FAR_VERT_DECL);
  v = insertAfter(
    v,
    '#include <begin_vertex>',
    '  vFar = aFar;\n  vFarLamp = aLamp;\n  if (aFar.w > 3.5) transformed.y += uWheelY;',
  );
  v = insertAfter(v, '#include <project_vertex>', FAR_PROJECT);
  sh.vertexShader = v;
  // the env map strength is a uniform; scaled per kind through farEnvK (the chunk is inlined here to reach it)
  const envChunk = THREE.ShaderChunk.envmap_physical_pars_fragment.replaceAll(
    '* envMapIntensity',
    '* envMapIntensity * farEnvK',
  );
  let f = sh.fragmentShader;
  f = insertAfter(f, '#include <common>', FAR_FRAG_DECL);
  f = f.replace('#include <envmap_physical_pars_fragment>', envChunk);
  f = insertAfter(f, '#include <emissivemap_fragment>', FAR_SURFACE);
  f = insertAfter(f, '#include <lights_physical_fragment>', FAR_COAT);
  f = insertAfter(f, '#include <aomap_fragment>', FAR_GLASS_SPEC);
  sh.fragmentShader = f;
}

/**
 * The far material of one car: carPaint(paintOpts) sharing `paint`'s wear uniforms, plus the car's lamp uniforms and its
 * window glass.  -> { material, uniforms, sync() }; sync() copies the live paint parameters (respray, finish changes).
 */
export function farMaterial(paintOpts, paint, lamps, glass) {
  const m = carPaint(paintOpts);
  m.name = 'car-far';
  m.userData.wearUniforms = paint.userData.wearUniforms;
  m.vertexColors = true;
  m.side = THREE.DoubleSide;
  const gc = glass.color.clone();
  const U = {
    uLampE: lamps.uniforms.uLampE,
    uSeat: lamps.uniforms.uSeat,
    uGlass: { value: new THREE.Vector4(gc.r, gc.g, gc.b, glass.opacity) },
    uGlassRough: { value: glass.roughness },
    uWheelY: { value: 0 },
  };
  const paintShader = m.onBeforeCompile;
  m.onBeforeCompile = (sh, renderer) => {
    paintShader(sh, renderer);
    farShader(sh, U);
  };
  m.customProgramCacheKey = () => 'ps-carfar-v1' + (R3PAINT ? '-r3' : '');
  const sync = () => {
    m.color.copy(paint.color);
    m.metalness = paint.metalness;
    m.roughness = paint.roughness;
    m.clearcoat = paint.clearcoat;
    m.clearcoatRoughness = paint.clearcoatRoughness;
    m.envMapIntensity = paint.envMapIntensity;
  };
  sync();
  return { material: m, uniforms: U, sync };
}
