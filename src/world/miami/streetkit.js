// Street furniture kit (stage 1 jobs 4-5): the user's library models converted by tools/v2/street-models/*.py into
// public/assets/models/street/*.glb (sources + licenses: public/assets/models/street/SOURCES.txt), loaded once and handed to
// the tile builder as instancing parts {geometry, material} (one global InstancedMesh pool per part, see tilebuild inst()).
//   kit.parts[name]   -> [{ geometry, material }]   (all meshes of the GLB merged per material; origin at the base center,
//                        front toward +Z, meters)
//   kit.signal        -> { pole, arm, head, lensR, lensA, lensG, ped, pedWalk, pedDont } single parts (mast-arm frame: pole
//                        axis at the origin, arm along +X, signal faces -Z); lens / icon materials light from the per-instance
//                        signal data (instance color = [node offset / 34, phase, kind]) with the same fixed-time plan as the
//                        traffic AI (src/vehicles/roadnet.js fixedSignal), so the lit lamp always matches what cars obey
//   kit.SIG           -> measured kit numbers (arm tip, head hanger height, pole height ...)
//   kit.signs         -> { stop, dne, noparking, nostanding, oneway_l, oneway_r, ..., post } sign plates (face +Z, centered)
//   kit.speedPlate(mph) -> { geometry, material } SPEED LIMIT plate (library plate, face repainted with original art)
//   kit.lampLens(part) -> true for the luminaire material of a lamp model (warm glow at night)
//   kit.variants[name] -> { n, set, layers, material } texture-array variants of that part's main material (draw its
//                        instances with colors: true; instance color = variantColor(layer, brightness, fade))
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadVariants } from '../props/variants.v2.js';
import { calibrate } from '../art/calibrate.js';

const BASE = '/assets/models/street/';
const FILES = [
  'hydrant_a',
  'hydrant_b',
  'bench_wood',
  'bench_iron',
  'bin_metal',
  'bin_wood',
  'bin_wheel',
  'bin_set',
  'dumpster',
  'shelter_glass',
  'shelter_long',
  'shelter_black',
  'shelter_old',
  'meter',
  'mailbox_post',
  'mailbox_twin',
  'mailbox_drop',
  'transformer',
  'cabinet',
  'lantern_post',
  'flexpost',
  'lamp_single',
  'lamp_twin',
  'upole_gear',
  // overnight props pass (tools/v2/street-models/build_props.sh): curbside cart, work-zone kit, construction site, yard chairs
  'cart',
  'cone',
  'channelizer',
  'tc_bollard',
  'barricade2',
  'jersey',
  'rolloff',
  'chair',
  'patio_table',
  'bin_commercial',
  'tarp_crates',
  'site_cabin',
  'umbrella_cafe',
  'planter_pot',
  'planter_box',
  'food_cart',
  'bike_rack',
  'can',
  'cup',
];
// signal_kit.json (tools/v2/street-models/signals.py): arm tip x, head hanger (top) height, pole height, lens centers
export const SIG = {
  armTip: 4.316,
  headX: 4.537,
  headTop: 7.768,
  headH: 1.398,
  poleH: 6.708,
  pedTop: 3.25,
  pedBottom: 2.41,
};
export const SIG_CYCLE = 34,
  SIG_GREEN = 13,
  SIG_YELLOW = 3; // = src/vehicles/roadnet.js fixed-time plan

export async function loadStreetKit({ M } = {}) {
  const gl = new GLTFLoader();
  const load = async (f) => {
    try {
      const s = (await gl.loadAsync(BASE + f + '.glb')).scene;
      s.updateMatrixWorld(true);
      return s;
    } catch (e) {
      console.warn('[streetkit] missing', f, e?.message);
      return null;
    }
  };
  const meshesOf = (scene, pick) => {
    const out = [];
    scene.traverse((o) => {
      if (o.isMesh && (!pick || pick(o))) out.push(o);
    });
    return out;
  };
  // all meshes of a scene merged per material
  const partsOf = (scene, pick, file = '') => {
    if (!scene) return null;
    const by = new Map();
    for (const o of meshesOf(scene, pick)) {
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const k = o.material.uuid;
      if (!by.has(k)) by.set(k, { mat: o.material, gs: [] });
      by.get(k).gs.push(g);
    }
    const out = [];
    for (const { mat, gs } of by.values()) {
      let g = gs[0];
      if (gs.length > 1) {
        try {
          const idx = gs.every((q) => q.index);
          g = mergeGeometries(idx ? gs : gs.map((q) => (q.index ? q.toNonIndexed() : q))) || gs[0];
        } catch (e) {
          g = gs[0];
        }
      }
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.push({ geometry: g, material: tune(mat, file) });
    }
    return out;
  };
  const tuned = new Set();
  function tune(m, file = '') {
    if (tuned.has(m)) return m;
    tuned.add(m);
    if (/glass/i.test(m.name)) {
      m.transparent = true;
      m.opacity = 0.28;
      m.roughness = 0.06;
      m.metalness = 0.1;
      m.depthWrite = false;
      m.side = THREE.DoubleSide;
      m.color?.multiplyScalar(0.75);
      m.map = null;
      m.needsUpdate = true;
    }
    if (m.map) m.map.anisotropy = 8;
    if (m.metalnessMap && m.metalness > 0.6) m.metalness = 0.6; // library metal maps read near-black without a city reflection probe
    if (m.name === '86 86 1') m.color.setRGB(0.16, 0.165, 0.17); // davit lamp: galvanized gray, not near-white
    if (m.name === 'Material12 3') m.color.setRGB(0.42, 0.42, 0.42); // lamp base plate: weathered concrete, not bright white
    if (m.name === 'Material11') m.color.setRGB(1.5, 1.35, 1.2); // utility pole shaft: weathered timber, lighter than the dark CAD texture
    m.userData.streetKit = true;
    // r2-art: library street furniture calibrated to the shared material ranges (src/world/art/calibrate.js); the glass
    // panels above keep their see-through tuning
    if (!/glass/i.test(m.name)) calibrate(m, { hint: 'street/' + file, fallback: 'generic' });
    // playtest Nov 18 #19 ("the light post has an unrealistic bright edge"): the painted steel shafts of the lamp models were
    // glossy metal, so the lamp's own light and the sky ran down the silhouette as a hard white line. Weathered paint:
    // mostly dielectric, satin-rough (the lens / bowl materials are left alone)
    if (/^(lamp_|lantern_post|upole)/.test(file) && !/glass|E05|LIGHT/i.test(m.name)) {
      if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.3);
      if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 1, 0.62);
      if ('envMapIntensity' in m) m.envMapIntensity = Math.min(m.envMapIntensity ?? 1, 0.7);
      m.needsUpdate = true;
    }
    return m;
  }
  const scenes = {};
  await Promise.all(
    FILES.concat(['signal_kit', 'sign_set1', 'sign_set5']).map(async (f) => {
      scenes[f] = await load(f);
    }),
  );
  const parts = {};
  for (const f of FILES) {
    const p = partsOf(scenes[f], null, f);
    if (p && p.length) parts[f] = p;
  }
  // the lantern post's origin goes to the foot of its post (the converter centered the whole post + arm footprint)
  if (parts.lantern_post) {
    let sx = 0,
      sz = 0,
      n = 0;
    for (const q of parts.lantern_post) {
      const P = q.geometry.attributes.position;
      for (let i = 0; i < P.count; i++)
        if (P.getY(i) < 0.8) {
          sx += P.getX(i);
          sz += P.getZ(i);
          n++;
        }
    }
    if (n)
      for (const q of parts.lantern_post) {
        q.geometry.translate(-sx / n, 0, -sz / n);
        q.geometry.computeBoundingSphere();
        q.geometry.computeBoundingBox();
      }
  }

  // ---- lamp luminaires: the lens / bowl material of each lamp model glows warm at night (follows M.lampHead) ----
  const lensMats = [];
  const lampLens = (name, rx) => {
    for (const p of parts[name] || [])
      if (rx.test(p.material.name)) {
        const m = p.material.clone();
        m.emissive = new THREE.Color(0xffd9a8);
        m.emissiveIntensity = 0;
        m.userData.lampLens = true;
        p.material = m;
        lensMats.push(m);
      }
  };
  lampLens('lamp_single', /Color E05/);
  lampLens('lamp_twin', /Color E05/);
  lampLens('lamp_arm', /Color E05/);
  lampLens('lantern_post', /^(LIGHT|Glass)$/);

  // ---- traffic signals ----
  const sig = {};
  const sk = scenes.signal_kit;
  const node = (n) => {
    let r = null;
    sk?.traverse((o) => {
      if (!r && o.isMesh && (o.name === n || o.parent?.name === n)) r = o;
    });
    return r;
  };
  const basePaint = (m, surf) => {
    m.vertexColors = true;
    m.roughness = 0.5;
    m.metalness = 0;
    /* r2-art: painted mast arms / heads are dielectric (was 0.35: neither paint nor metal) */ try {
      M?.propify?.(m, surf);
    } catch (e) {
      /* plain */
    }
    return m;
  };
  if (sk) {
    const piece = (n) => {
      const o = node(n);
      if (!o) return null;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const c = g.attributes.color;
      if (c && c.itemSize === 4) {
        const a = new Float32Array(c.count * 3);
        for (let i = 0; i < c.count; i++) {
          a[i * 3] = c.getX(i);
          a[i * 3 + 1] = c.getY(i);
          a[i * 3 + 2] = c.getZ(i);
        }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      } // rgb only (prop shader expects vec3)
      g.computeBoundingSphere();
      g.userData.lodMax = /^(lens|ped_)/.test(n) ? 460 : n === 'head' || n === 'ped' ? 330 : 420;
      return g;
    }; // lit lenses carry furthest (night)
    const poleMat = basePaint(new THREE.MeshStandardMaterial({ name: 'sig-pole' }), 'paint');
    const headMat = basePaint(new THREE.MeshStandardMaterial({ name: 'sig-head' }), 'paint');
    for (const [k, n, m] of [
      ['pole', 'pole', poleMat],
      ['arm', 'arm', poleMat],
      ['head', 'head', headMat],
      ['ped', 'ped', headMat],
    ]) {
      const g = piece(n);
      if (g) sig[k] = { geometry: g, material: m };
    }
    // lit lenses: kind 0 red, 1 amber, 2 green, 3 WALK, 4 DONT WALK
    const LC = [
        [1.0, 0.035, 0.015],
        [1.0, 0.36, 0.0],
        [0.04, 1.0, 0.5],
        [0.95, 0.95, 0.88],
        [1.0, 0.36, 0.03],
      ],
      BASEC = [0x2a0504, 0x2e1500, 0x05221a, 0x161616, 0x1c0d04];
    for (const [k, n, kind] of [
      ['lensR', 'lens_r', 0],
      ['lensA', 'lens_a', 1],
      ['lensG', 'lens_g', 2],
      ['pedWalk', 'ped_walk', 3],
      ['pedDont', 'ped_dont', 4],
    ]) {
      const g = piece(n);
      if (!g) continue;
      g.deleteAttribute('color');
      const m = new THREE.MeshStandardMaterial({
        name: 'sig-lens-' + n,
        color: BASEC[kind],
        roughness: 0.18,
        metalness: 0.0,
      });
      m.userData.sigLens = kind;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uSigT = sigU.uSigT;
        sh.uniforms.uSigGlow = sigU.uSigGlow;
        sh.vertexShader =
          'varying vec3 vSig;\n' +
          sh.vertexShader.replace(
            '#include <color_vertex>',
            `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec3( 1.0 );
#endif
#ifdef USE_INSTANCING_COLOR
  vSig = instanceColor;
#else
  vSig = vec3( 0.0, 0.0, 1.0 );
#endif`,
          );
        sh.fragmentShader =
          'uniform float uSigT;\nuniform float uSigGlow;\nvarying vec3 vSig;\n' +
          sh.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
  {
    float k = mod( uSigT + vSig.x * ${SIG_CYCLE}.0, ${SIG_CYCLE}.0 );
    float s = vSig.y < 0.5 ? k : mod( k + ${SIG_CYCLE / 2}.0, ${SIG_CYCLE}.0 );
    float on = 0.0;
    float blink = step( 0.5, fract( uSigT * 0.9 ) );
    ${
      kind === 0
        ? `on = vSig.z > 0.5 ? step( ${SIG_GREEN + SIG_YELLOW}.0, s ) : blink;`
        : kind === 1
          ? `on = vSig.z > 0.5 ? step( ${SIG_GREEN}.0, s ) * ( 1.0 - step( ${SIG_GREEN + SIG_YELLOW}.0, s ) ) : 0.0;`
          : kind === 2
            ? `on = vSig.z > 0.5 ? 1.0 - step( ${SIG_GREEN}.0, s ) : 0.0;`
            : kind === 3
              ? `on = 1.0 - step( ${SIG_GREEN - 4}.0, s );`
              : `on = step( ${SIG_GREEN - 4}.0, s ) * ( s < ${SIG_GREEN + SIG_YELLOW}.0 ? blink : 1.0 );`
    }
    totalEmissiveRadiance += vec3( ${LC[kind].map((v) => v.toFixed(3)).join(', ')} ) * on * uSigGlow;
  }`,
          );
      };
      m.customProgramCacheKey = () => 'sig-lens-' + kind;
      sig[k] = { geometry: g, material: m };
    }
  }
  const sigU = { uSigT: { value: 0 }, uSigGlow: { value: 3 } };

  // ---- regulatory sign plates ----
  const signs = {};
  for (const set of ['sign_set1', 'sign_set5']) {
    const s = scenes[set];
    if (!s) continue;
    for (const o of meshesOf(s)) {
      const n = o.name || o.parent?.name;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g.computeBoundingSphere();
      signs[n] = { geometry: g, material: tune(o.material) };
    }
  }
  // map audit (user: every street STOP plate sat off its post): the converter left the post and the plates off their own axes, so a
  // post scaled 2.4x across drifted sideways from its plate. Every sign part is centred on x = z = 0 here (heights kept), so any
  // placer puts post and plate on one axis (regulatory.v2.js, the Keys yard)
  if (!(typeof location !== 'undefined' && /[?&]mapfix=0\b/.test(location.search)))
    for (const k in signs) {
      const g = signs[k].geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
  if (signs.post) {
    signs.post.material = signs.post.material.clone();
    signs.post.material.metalness = 0.75;
    signs.post.material.roughness = 0.45;
  }
  // SPEED LIMIT plates: the library 24x30 plate (NO PARKING) with its face repainted (original art; worn background cropped
  // from the same sign's blank back in the library atlas). One atlas for every speed value; front UVs remapped per value.
  const speedCache = new Map();
  let speedAtlas = null;
  const SPEEDS = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70],
    COLS = 4,
    CW = 256,
    CH = 320;
  function speedTexture() {
    if (speedAtlas) return speedAtlas;
    const cv = document.createElement('canvas');
    cv.width = COLS * CW;
    cv.height = Math.ceil((SPEEDS.length + 1) / COLS) * CH;
    const x = cv.getContext('2d');
    const img = signs.noparking?.material?.map?.image;
    SPEEDS.concat([0]).forEach((mph, i) => {
      const X = (i % COLS) * CW,
        Y = Math.floor(i / COLS) * CH;
      x.fillStyle = mph ? '#f3f2ec' : '#9ea4a6';
      x.fillRect(X, Y, CW, CH);
      if (img) {
        try {
          const W = img.width,
            H = img.height;
          x.save();
          x.globalAlpha = mph ? 0.9 : 0.5;
          x.drawImage(img, 0.582 * W, 0.665 * H, 0.1 * W, 0.13 * H, X, Y, CW, CH);
          x.restore();
        } catch (e) {
          /* plain */
        }
      }
      if (!mph) return;
      x.strokeStyle = '#151515';
      x.lineWidth = 7;
      const r = 14,
        b = 12;
      x.beginPath();
      x.roundRect(X + b, Y + b, CW - 2 * b, CH - 2 * b, r);
      x.stroke();
      x.fillStyle = '#151515';
      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      x.font = `bold ${Math.round(CW * 0.19)}px "Arial Narrow", Helvetica, Arial, sans-serif`;
      x.fillText('SPEED', X + CW / 2, Y + CH * 0.24);
      x.fillText('LIMIT', X + CW / 2, Y + CH * 0.42);
      x.font = `bold ${Math.round(CW * 0.5)}px "Arial Narrow", Helvetica, Arial, sans-serif`;
      x.fillText(String(mph), X + CW / 2, Y + CH * 0.86);
    });
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.anisotropy = 8;
    const base = signs.noparking?.material;
    speedAtlas = new THREE.MeshStandardMaterial({
      map: t,
      roughness: 0.42,
      metalness: 0.05,
      normalMap: base?.normalMap || null,
      name: 'speed-limit',
    });
    return speedAtlas;
  }
  function speedPlate(mph) {
    const v = SPEEDS.reduce((a, b) => (Math.abs(b - mph) < Math.abs(a - mph) ? b : a), SPEEDS[0]);
    if (speedCache.has(v)) return speedCache.get(v);
    const src = signs.noparking;
    if (!src) return null;
    const g = src.geometry.clone(),
      uv = g.attributes.uv,
      rows = Math.ceil((SPEEDS.length + 1) / COLS);
    const art = [0.5782, 1 - 0.1911, 0.6879, 1 - 0.0415]; // library atlas rect of the plate's front art (three.js uv, y down)
    const cell = (i) => [(i % COLS) / COLS, Math.floor(i / COLS) / rows];
    const ci = cell(SPEEDS.indexOf(v)),
      cb = cell(SPEEDS.length);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i),
        w = uv.getY(i);
      if (u >= art[0] - 0.004 && u <= art[2] + 0.004 && w >= art[1] - 0.004 && w <= art[3] + 0.004)
        uv.setXY(
          i,
          ci[0] + (u - art[0]) / (art[2] - art[0]) / COLS,
          ci[1] + (w - art[1]) / (art[3] - art[1]) / rows,
        );
      else uv.setXY(i, cb[0] + 0.5 / COLS, cb[1] + 0.5 / rows);
    }
    uv.needsUpdate = true;
    const r = { geometry: g, material: speedTexture() };
    speedCache.set(v, r);
    return r;
  }

  // per-frame: signal clock (same clock as the traffic AI: performance.now()), lens brightness, lamp glow
  let raf = 0;
  const tick = () => {
    sigU.uSigT.value = (performance.now() / 1000) % SIG_CYCLE;
    const n = M?.lampHead ? Math.min(1, M.lampHead.emissiveIntensity / 6) : 0;
    sigU.uSigGlow.value = 1.5 + 3.0 * n;
    for (const m of lensMats) m.emissiveIntensity = (M?.lampHead?.emissiveIntensity ?? 0) * 0.9;
    raf = requestAnimationFrame(tick);
  };
  if (typeof requestAnimationFrame !== 'undefined') tick();
  // per-instance texture variants (src/world/props/variants.v2.js): patched materials sample a texture array layer per instance
  let variants = {};
  try {
    variants = await loadVariants(parts);
  } catch (e) {
    console.warn('[streetkit] variants', e?.message);
  }
  const materials = [
    ...new Set(
      [...Object.values(parts).flat(), ...Object.values(sig), ...Object.values(signs)].map(
        (p) => p.material,
      ),
    ),
  ];
  return {
    parts,
    signal: sig,
    signs,
    speedPlate,
    SIG,
    sigU,
    materials,
    lensMats,
    variants,
    stop: () => cancelAnimationFrame(raf),
  };
}

// ---- signal phase per approach, exactly as the traffic AI computes it (src/vehicles/roadnet.js fromGraph + fixedSignal) ----
const NOT_ROAD = /foot|path|cycle|steps|pedestrian|track|service_private/;
function angleAt(e, nodeId) {
  const p = e.pts,
    atB = e.b === nodeId,
    i0 = atB ? p.length - 1 : 0,
    i1 = atB ? Math.max(0, p.length - 2) : Math.min(p.length - 1, 1);
  return Math.atan2(p[i1][0] - p[i0][0], p[i1][1] - p[i0][1]);
}
const _ax = new Map();
// node incident road edges in the AI's order (graph edge order; a self loop counts twice)
function aiEdges(G, n) {
  let r = _ax.get(n.id);
  if (r) return r;
  const ks = [...new Set(n.edges || [])]
    .filter((k) => {
      const e = G.edges[k];
      return e && e.pts && e.pts.length >= 2 && !NOT_ROAD.test(e.kind || 'road');
    })
    .sort((a, b) => a - b);
  const list = [];
  for (const k of ks) {
    const e = G.edges[k];
    if (e.a === n.id) list.push(e);
    if (e.b === n.id) list.push(e);
  }
  r = { list, ref: list.length ? angleAt(list[0], n.id) : 0 };
  _ax.set(n.id, r);
  return r;
}
export function signalPhase(G, n, e) {
  // -> { off (s), phase 0|1, live (the AI really runs a signal here) }
  n = G.nodes[n.id] && G.nodes[n.id].id === n.id ? G.nodes[n.id] : n; // the graph node (tile node records carry dirs, not edges)
  const A = aiEdges(G, n),
    d = Math.abs(Math.sin(angleAt(e, n.id) - A.ref));
  return {
    off: (((n.id * 7.31) % SIG_CYCLE) + SIG_CYCLE) % SIG_CYCLE,
    phase: d < 0.6 ? 0 : 1,
    live: !!(n.signal || n.control === 'signal') && A.list.length >= 3,
  };
}
// pedestrians crossing in direction (dx, dz) follow the edge most parallel to their walk (src/npc/streetlife.js walkState)
export function walkPhase(G, n, dx, dz) {
  n = G.nodes[n.id] && G.nodes[n.id].id === n.id ? G.nodes[n.id] : n;
  const A = aiEdges(G, n),
    ca = Math.atan2(dx, dz);
  let best = A.list[0],
    bs = -1;
  for (const e of A.list) {
    const s = Math.abs(Math.cos(angleAt(e, n.id) - ca));
    if (s > bs) {
      bs = s;
      best = e;
    }
  }
  return best ? signalPhase(G, n, best) : { off: 0, phase: 0, live: false };
}
