// Southline V2 perf: never wait for a shader program to link inside a frame (perf track, Nov 19).
// The game has ~950 distinct shader programs and keeps creating about one a second while driving (new props, cars,
// people, interiors). three.js links a new program on its first draw and asks for its link status right away
// (getProgramParameter), which blocks until the GPU process has compiled it: 120 ms a second of main-thread stalls
// downtown in the in-app benchmark (tools/v2/bench-prof.mjs). Streamed city tiles were already warmed
// (perfGuards.v2.js); this covers everything else, the way shipped engines skip a draw until its pipeline is ready:
//   - a main-scene draw whose material has no program yet is skipped and the object is queued;
//   - before the next frame the queued objects' programs are created in one renderer.compile() call (no draw, no
//     status query: KHR_parallel_shader_compile links them in the background);
//   - a draw whose program is still linking is skipped; once program.isReady() it draws normally (usually 1-3 frames).
// Shadow / depth / override passes and other scenes are never gated. ?shadergate=0 = off (A/B).
import * as THREE from 'three';
import { compileForGame } from '../core/pace.js';

export const order = 941;

export function initV2(game) {
  if (typeof location !== 'undefined' && /[?&]shadergate=0\b/.test(location.search)) return;
  const r = game.renderer;
  const gl = r.getContext();
  if (!gl.getExtension('KHR_parallel_shader_compile')) return; // without it nothing can link in the background
  const orig = r.renderBufferDirect;
  const props = r.properties;
  const queue = [];
  const stats = (game.shaderGate = { skipped: 0, queued: 0, compiled: 0, empty: 0, on: true });
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    // perf (Nov 19): instanced pools with no live instances still cost a full draw setup (program, uniforms, VAO) every
    // pass: about half of the ~400 city prop pools are empty at any time (measured 968 main-pass draws downtown)
    if (object.isInstancedMesh && object.count === 0) {
      stats.empty++;
      return;
    }
    if (stats.on && game.ready && scene === game.scene && material !== scene.overrideMaterial) {
      const om = object.material;
      if (om === material || (Array.isArray(om) && om.includes(material))) {
        const mp = props.get(material);
        const prog = mp.currentProgram;
        if (!prog) {
          if (!object.__psGateQ) {
            object.__psGateQ = true;
            queue.push(object);
            stats.queued++;
          }
          stats.skipped++;
          return;
        }
        if (!prog.__psOk) {
          if (!prog.isReady()) {
            stats.skipped++;
            return;
          }
          prog.__psOk = true;
        }
      }
    }
    return orig.call(this, camera, scene, geometry, material, object, group);
  };
  // Transparent double-sided materials: three.js draws them twice per frame, flipping material.side and setting
  // needsUpdate before each pass, so every such material re-ran getProgram (program parameters + cache-key string) twice a
  // frame (glass, decals: ~15 a frame measured), CPU time plus old-space garbage. Drawn in one pass instead (thin glass and
  // decals look the same). ?singlepass=0 = old.
  if (!/[?&]singlepass=0\b/.test(location.search)) {
    const MP = THREE.Material.prototype,
      obr = MP.onBeforeRender;
    MP.onBeforeRender = function (...a) {
      if (this.transparent && this.side === THREE.DoubleSide && !this.forceSinglePass)
        this.forceSinglePass = true;
      return obr.apply(this, a);
    };
  }
  // Shadow pass: three.js shares one depth material between all casters and rewrites its side / instancing / skinning per
  // object, so the shared material switched programs (program parameters + cache key) several times a frame. Each caster
  // class (side x instanced x skinned) gets its own depth material instead, assigned the first time it casts.
  // ?shadowdepth=0 = old.
  if (!/[?&]shadowdepth=0\b/.test(location.search)) {
    const DM = new Map();
    const SIDE = {
      [THREE.FrontSide]: THREE.BackSide,
      [THREE.BackSide]: THREE.FrontSide,
      [THREE.DoubleSide]: THREE.DoubleSide,
    };
    const OP = THREE.Object3D.prototype,
      obs = OP.onBeforeShadow;
    OP.onBeforeShadow = function (
      renderer,
      object,
      camera,
      shadowCamera,
      geometry,
      depthMaterial,
      group,
    ) {
      if (
        this.customDepthMaterial === undefined &&
        depthMaterial &&
        depthMaterial.isMeshDepthMaterial &&
        depthMaterial.depthPacking === THREE.RGBADepthPacking &&
        !Array.isArray(this.material) &&
        this.material
      ) {
        const m = this.material;
        const side =
          m.shadowSide !== null && m.shadowSide !== undefined ? m.shadowSide : SIDE[m.side];
        const k =
          side +
          '|' +
          (this.isInstancedMesh ? 1 : 0) +
          '|' +
          (this.isSkinnedMesh ? 1 : 0) +
          '|' +
          (this.isBatchedMesh ? 1 : 0);
        let d = DM.get(k);
        if (!d) {
          d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
          d.name = 'psShadowDepth ' + k;
          DM.set(k, d);
        }
        this.customDepthMaterial = d;
      }
      return obs.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group);
    };
  }
  // the queued objects' programs, created between frames in one compile call (one light traversal for all of them)
  const batch = [];
  const fake = {
    traverse(cb) {
      for (let i = 0; i < batch.length; i++) cb(batch[i]);
    },
    traverseVisible() {
      /* the queued objects hold no lights */
    },
  };
  game.updaters.push(function shaderGateCompile() {
    if (!queue.length) return;
    batch.length = 0;
    for (let i = 0; i < queue.length && batch.length < 64; i++) {
      const o = queue[i];
      o.__psGateQ = false;
      if (o.material) batch.push(o);
    }
    queue.splice(0, Math.min(queue.length, 64));
    try {
      compileForGame(r, THREE, fake, game.camera, game.scene);
      stats.compiled += batch.length;
    } catch (e) {
      console.warn('[shaderGate] compile', e);
    }
    batch.length = 0;
  });
}
