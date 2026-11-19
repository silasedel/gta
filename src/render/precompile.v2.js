// Stage 1 perf (guard): background shader precompile for models loaded at run time.
// Library models (street furniture, library buildings, people, cars, guns) are GLB files loaded on demand while you play.
// The first time one of their materials was drawn, three.js compiled its shader synchronously: a 100 ms - 1.7 s freeze
// mid-drive. Every GLTFLoader result is compiled before its owner receives it (see the parse hook) and then queued; a few
// frames later (after the owner has patched its materials) its
// shaders are compiled in the background for the HDR target the game draws into - as loaded (plain / skinned meshes) and
// as instanced copies (models are often drawn through instanced pools) - while the GPU links them in parallel
// (KHR_parallel_shader_compile). When the model is first drawn, its programs are ready: no freeze. Nothing is drawn or
// changed; compiling a variant that is never used only costs a little GPU memory. Their textures are uploaded one per
// tick as well (a newly shown model uploaded all of them inside one frame: up to 0.6 s).
// Also registered (and re-scanned every 10 s): the city street kit and the house / Nico house material kits.
// API: game.precompile = { queue(object3d | material[]), stats: { queued, compiled, ms } }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { compileForGame } from '../core/pace.js';

export const order = 940; // before the boot warm-up (render/warmup.v2.js, main.js) so start-up models are included

const pending = [];
const texQ = [],
  texSeen = new WeakSet();
const TEX_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'clearcoatNormalMap',
  'transmissionMap',
  'specularIntensityMap',
  'sheenColorMap',
];
const stats = { queued: 0, compiled: 0, ms: 0, errors: 0 };
let gameRef = null;
const done = new WeakSet();

const OFF = typeof location !== 'undefined' && /[?&]noprecompile\b/.test(location.search); // A/B tests
function enqueue(x) {
  if (x && !OFF) {
    pending.push(x);
    stats.queued++;
  }
}

// GLTFLoader.parse: hand the result to its owner first (it patches materials / builds pools), then queue it for the
// instanced variants and texture uploads.
if (!GLTFLoader.prototype.__psPrecompile) {
  GLTFLoader.prototype.__psPrecompile = true;
  const parse0 = GLTFLoader.prototype.parse;
  GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
    return parse0.call(
      this,
      data,
      path,
      (gltf) => {
        try {
          onLoad(gltf);
        } finally {
          try {
            enqueue(gltf?.scene);
          } catch (e) {
            /* never break loading */
          }
        }
      },
      onError,
    );
  };
}

// Show-when-ready: anything added to the scene while the game runs whose material was never compiled (a new kind of
// model, outfit, building or prop) gets its shaders compiled right before the frame, outside the render, and stays out of
// the main view (layer 0) until the GPU has linked them (at most MAX_WAIT ms, usually 1-10 frames) instead of freezing the
// whole frame while they compile. Never within 25 m of the camera or the player (those draw at once, as before).
// Shadows and physics are unaffected. Objects whose materials are known (the usual case)
// are untouched. game.precompile.showWhenReady = false turns it off.
const MAX_WAIT = 1500;
const added = [],
  waiting = [];
if (!THREE.Object3D.prototype.__psAddHook) {
  THREE.Object3D.prototype.__psAddHook = true;
  const add0 = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...objs) {
    if (gameRef && gameRef.ready && !OFF)
      for (const o of objs) if (o && o.isObject3D && added.length < 4000) added.push(o);
    return add0.apply(this, objs);
  };
}
const NEAR_R = 25,
  _sph = new THREE.Sphere();
function nearViewer(c, g) {
  let bs = null;
  try {
    if (c.isInstancedMesh) {
      if (!c.boundingSphere) c.computeBoundingSphere();
      bs = c.boundingSphere;
    } else if (c.geometry) {
      if (!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
      bs = c.geometry.boundingSphere;
    }
  } catch (e) {
    return true;
  }
  if (!bs) return true;
  _sph.copy(bs);
  if (!c.isInstancedMesh) _sph.applyMatrix4(c.matrixWorld);
  else _sph.applyMatrix4(c.matrixWorld);
  const cp = g.camera.position,
    pp = g.player?.position;
  if (_sph.center.distanceTo(cp) - _sph.radius < NEAR_R) return true;
  if (pp && _sph.center.distanceTo(pp) - _sph.radius < NEAR_R) return true;
  return false;
}
function inScene(o, scene) {
  for (let p = o; p; p = p.parent) if (p === scene) return true;
  return false;
}
function beforeFrame() {
  const g = gameRef;
  if (!g || !g.renderer || !g.scene) return;
  const r = g.renderer,
    scene = g.scene,
    props = r.properties;
  if (added.length && g.precompile.showWhenReady !== false) {
    const list = added.splice(0, added.length);
    for (const o of list) {
      if (!inScene(o, scene)) continue;
      let fresh = false;
      // fresh = a material never compiled, or never compiled for this kind of object (instanced / skinned / per-instance
      // color: a loaded model's material compiled as a plain mesh, then drawn through an instanced pool)
      o.traverse((c) => {
        if (fresh || !c.material) return;
        for (const m of [].concat(c.material)) {
          if (!m) continue;
          const P = props.get(m);
          if (
            !P.currentProgram ||
            P.instancing !== !!c.isInstancedMesh ||
            P.skinning !== !!c.isSkinnedMesh ||
            (c.isInstancedMesh && P.instancingColor !== !!c.instanceColor)
          ) {
            fresh = true;
            break;
          }
        }
      });
      if (!fresh) continue;
      const n0 = r.info.programs.length;
      try {
        compileForGame(r, THREE, o, g.camera, scene);
      } catch (e) {
        continue;
      }
      const progs = r.info.programs.slice(n0).filter((p) => p.isReady && !p.isReady());
      if (!progs.length) continue;
      // never held back near the camera or the player (lead: a prop or car popping in next to you looks worse than a
      // one-time hitch): those draw this frame and wait for their shader as before
      o.updateMatrixWorld(true);
      const hidden = [];
      o.traverse((c) => {
        if (
          (c.isMesh || c.isPoints || c.isLine || c.isSprite) &&
          c.layers.isEnabled(0) &&
          !nearViewer(c, g)
        ) {
          c.layers.disable(0);
          hidden.push(c);
        }
      });
      if (!hidden.length) continue;
      waiting.push({ progs, hidden, t: performance.now() });
      stats.held = (stats.held || 0) + 1;
    }
  } else if (added.length) added.length = 0;
  for (let i = waiting.length - 1; i >= 0; i--) {
    const w = waiting[i];
    if (performance.now() - w.t > MAX_WAIT || w.progs.every((p) => p.isReady())) {
      for (const c of w.hidden) c.layers.enable(0);
      waiting.splice(i, 1);
    }
  }
}

const dummyGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3),
  );
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  return g;
})();
const I = new THREE.Matrix4();

// Work is split into small batches (at most ~4 materials = 12 programs) and a new batch starts only when the GPU has
// linked the previous one, so the GPU process is never flooded with compiles (that stalls frames too).
const matQ = [];
let lastProgs = [];
function expand(item) {
  const game = gameRef,
    r = game.renderer,
    cam = game.camera,
    scene = game.scene;
  const mats = new Set();
  if (item.isObject3D) {
    // skinned / morphing meshes: compile them as loaded (their variants need the real skeleton / morph layout)
    const special = new THREE.Group();
    const keep = [];
    item.updateMatrixWorld?.(true);
    item.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.isSkinnedMesh || o.morphTargetInfluences) keep.push(o);
      else for (const m of [].concat(o.material)) if (m) mats.add(m);
    });
    for (const o of keep) {
      try {
        compileForGame(r, THREE, o, cam, scene);
      } catch (e) {
        /* drawn later instead */
      }
    }
    void special;
  } else for (const m of item) if (m?.isMaterial) mats.add(m);
  for (const m of mats) {
    if (done.has(m)) continue;
    done.add(m);
    for (const k of TEX_KEYS) {
      const t = m[k];
      if (t?.isTexture && !texSeen.has(t)) {
        texSeen.add(t);
        texQ.push(t);
      }
    }
    matQ.push(m);
  }
}
function compileBatch() {
  const game = gameRef,
    r = game.renderer;
  if (lastProgs.some((p) => p.isReady && !p.isReady())) return; // GPU still linking the last batch
  const n0 = r.info.programs.length;
  const root = new THREE.Group();
  for (let i = 0; i < 4 && matQ.length; i++) {
    const m = matQ.shift();
    root.add(new THREE.Mesh(dummyGeo, m));
    const a = new THREE.InstancedMesh(dummyGeo, m, 1);
    a.setMatrixAt(0, I);
    root.add(a);
    const b = new THREE.InstancedMesh(dummyGeo, m, 1);
    b.setMatrixAt(0, I);
    b.setColorAt(0, new THREE.Color(1, 1, 1));
    root.add(b);
  }
  if (root.children.length) compileForGame(r, THREE, root, game.camera, game.scene);
  for (const c of root.children) if (c.isInstancedMesh) c.dispose();
  lastProgs = r.info.programs.slice(n0);
  stats.compiled += root.children.length / 3;
}

export async function initV2(game) {
  gameRef = game;
  game.precompile = { queue: enqueue, stats, showWhenReady: true };
  // right before each frame's render (outside it: the compile runs the scene's light hooks itself)
  const post = game.post;
  if (post?.render && !OFF) {
    const pr = post.render;
    post.render = function (...a) {
      try {
        beforeFrame();
      } catch (e) {
        /* never break the frame */
      }
      return pr.apply(this, a);
    };
  }
  // material registries of the city systems (street kit: signals, signs, lamps, shelters...; house / Nico house kits:
  // materials made on demand per style, e.g. house:shopGlass). Re-scanned every 10 s: new entries get compiled too.
  const seenReg = new WeakSet();
  const scanRegistries = () => {
    const out = [];
    const add = (m) => {
      if (m?.isMaterial && !seenReg.has(m)) {
        seenReg.add(m);
        out.push(m);
      }
    };
    try {
      const k = game.city?.streetKit;
      for (const m of k?.materials || []) add(m);
      for (const m of k?.lensMats || []) add(m);
    } catch (e) {
      /* no kit */
    }
    for (const kit of [game.houses?.kit, game.nicoHouse?.house?.kit, game.nicoHouse?.kit]) {
      try {
        if (kit?.materials?.values) for (const m of kit.materials.values()) add(m);
      } catch (e) {
        /* */
      }
    }
    if (out.length) enqueue(out);
  };
  scanRegistries();
  setInterval(scanRegistries, 10000);
  // worker: one queued item per ~120 ms, only when the frame has time (never inside a frame)
  const tick = () => {
    setTimeout(tick, pending.length || texQ.length || matQ.length ? 60 : 400);
    if (!game.renderer || !game.camera) return;
    if (texQ.length) {
      const t0 = performance.now();
      const t = texQ.shift();
      try {
        if (t.image && (t.image.width || t.image.data)) {
          game.renderer.initTexture(t);
          stats.textures = (stats.textures || 0) + 1;
        }
      } catch (e) {
        /* drawn later instead */
      }
      stats.ms += performance.now() - t0;
    }
    if (!pending.length && !matQ.length) return;
    const t0 = performance.now();
    try {
      if (pending.length) expand(pending.shift());
      else compileBatch();
    } catch (e) {
      stats.errors++;
    }
    stats.ms += performance.now() - t0;
  };
  setTimeout(tick, 400);
}
