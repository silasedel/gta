// Southline V2: run-time allocation guards (playtest-fixes track).
// The game produced about 1 GB of short-lived garbage every 20 s of play, so Chrome ran a major GC of a
// 2-3 GB heap every minute or so (the 1-2 s freezes) and peaked near the tab's memory limit (the crash).
// The two largest sources are fixed here without touching their owners' files:
//   1. game.interiors.list was a getter that built a new concatenated array on every read. The minimap
//      reads it every frame and keys its cache on the array identity, so its cache never hit and it
//      rebuilt every shop icon every frame. The getter now returns a cached array that only changes when
//      one of the two source lists changes.
//   2. Facade batches (FBatch) stored 16 floats per vertex in a growing JS array of doubles. They now
//      write into a growing Float32Array (half the bytes, no boxed growth copies).
//   3. Constant light counts. three.js bakes the number of point and spot lights into every shader, so each
//      time a light entered or left the scene (store lights, police light bars, muzzle and fire lights,
//      lazily created spotlights) EVERY material in view was recompiled: 250 programs after loading, in
//      bursts of 60-70, each burst a freeze of half a second or more. The renderer now always sees exactly
//      POINT_TARGET point lights and SPOT_TARGET spot lights: zero-intensity spares fill the gaps and, if
//      more real lights are present, the farthest ones sit out that frame.
// The owners (interiors-engine, city-look) should adopt 1 and 2 natively; see docs/v2/reports/playtest-fixes.md.
import * as THREE from 'three';
import { FBatch } from '../world/city/facade.js';
import { Batch } from '../world/city/geo.js';

export const order = 4;

function guardInteriorsList(game) {
  const it = game.interiors;
  if (!it) {
    return false;
  }
  const desc = Object.getOwnPropertyDescriptor(it, 'list');
  if (!desc || typeof desc.get !== 'function' || !desc.configurable) {
    return false;
  }
  const cache = {
    a: null,
    b: null,
    na: -1,
    nb: -1,
    out: [],
  };
  Object.defineProperty(it, 'list', {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      const a = it.v2?.list || null;
      const b = it.legacy?.list || null;
      const na = a ? a.length : 0;
      const nb = b ? b.length : 0;
      if (a !== cache.a || b !== cache.b || na !== cache.na || nb !== cache.nb) {
        cache.a = a;
        cache.b = b;
        cache.na = na;
        cache.nb = nb;
        cache.out = [];
        if (a) {
          for (let i = 0; i < na; i++) {
            cache.out.push(a[i]);
          }
        }
        if (b) {
          for (let i = 0; i < nb; i++) {
            cache.out.push(b[i]);
          }
        }
      }
      return cache.out;
    },
  });
  return true;
}

let fbatchPatched = false;
function guardFacadeBatch() {
  if (fbatchPatched || !FBatch?.prototype || !Batch?.prototype) {
    return false;
  }
  fbatchPatched = true;
  const baseVert = Batch.prototype.vert;
  FBatch.prototype.vert = function vert(x, y, z, nx, ny, nz, u, v, col) {
    baseVert.call(this, x, y, z, nx, ny, nz, u, v, col);
    let a = this._fxa;
    const n = this._fxn || 0;
    if (!a || n + 16 > a.length) {
      const grown = new Float32Array(Math.max(1024, a ? a.length * 2 : 0, n + 16));
      if (a) {
        grown.set(a.subarray(0, n));
      }
      a = grown;
      this._fxa = a;
    }
    const s = this.s;
    for (let i = 0; i < 16; i++) {
      a[n + i] = s[i];
    }
    this._fxn = n + 16;
  };
  const origAttach = FBatch.prototype.attach;
  FBatch.prototype.attach = function attach(g) {
    if (!this._fxa) {
      return origAttach.call(this, g);
    }
    // hand the exact-length data to the original attach (it copies arrays into a new Float32Array)
    this.fx = this._fxa.subarray(0, this._fxn);
    this._fxa = null;
    this._fxn = 0;
    return origAttach.call(this, g);
  };
  return true;
}

const POINT_TARGET = 16;
const SPOT_TARGET = 4;
let addPatched = false;
const tracked = new Set();
// render track (Nov 18): the per-render walk uses a plain array copy (for...of over the Set made an iterator per render)
let trackedArr = [], trackedDirty = true;
function trackedList() { if (trackedDirty) { trackedArr = Array.from(tracked); trackedDirty = false; } return trackedArr; }

function register(o) {
  if (o && (o.isPointLight || o.isSpotLight) && !o.userData.psSpareLight && !tracked.has(o)) {
    tracked.add(o); trackedDirty = true;
  }
}

function effectiveIn(o, scene, layers) {
  if (!o.layers.test(layers)) {
    return false;
  }
  for (let n = o; n; n = n.parent) {
    if (!n.visible) {
      return false;
    }
    if (n === scene) {
      return true;
    }
  }
  return false;
}

function stabilizeLights(game) {
  const { scene } = game;
  if (!scene || addPatched) {
    return false;
  }
  addPatched = true;
  // every light that is ever attached anywhere gets tracked (lights inside groups are added to the group first)
  const origAdd = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function add(...objs) {
    for (const o of objs) {
      register(o);
    }
    return origAdd.apply(this, objs);
  };
  scene.traverse(register);

  const spares = {
    point: [],
    spot: [],
  };
  for (let i = 0; i < POINT_TARGET; i++) {
    const l = new THREE.PointLight(0x000000, 0, 0.01, 2);
    l.userData.psSpareLight = true;
    l.position.set(0, -20000, 0);
    l.castShadow = false;
    origAdd.call(scene, l);
    spares.point.push(l);
  }
  for (let i = 0; i < SPOT_TARGET; i++) {
    const l = new THREE.SpotLight(0x000000, 0, 0.01, 0.3, 0, 2);
    l.userData.psSpareLight = true;
    l.position.set(0, -20000, 0);
    l.target.position.set(0, -20001, 0);
    l.castShadow = false;
    origAdd.call(scene, l);
    origAdd.call(scene, l.target);
    spares.spot.push(l);
  }

  const hiddenNow = [];
  const livePoint = [];
  const liveSpot = [];
  const camPos = new THREE.Vector3();
  const stats = {
    point: 0,
    spot: 0,
    benched: 0,
    tracked: 0,
  };
  const byDistance = (a, b) => a.userData.psD2 - b.userData.psD2;

  // Render track (Nov 18, user: "lighting snaps darker / brighter"): when more real lights were in view than the budget,
  // the ranking (distance / intensity) decided every frame which ones sat out, so lights popped on and off as the camera
  // moved. Now: a ranked-in light keeps a 40% bonus (hysteresis), and a light that changes sides fades over ~0.3 s
  // (intensity scaled for this render, restored after). A light seen for the first time appears at once (muzzle flashes).
  // If a newcomer needs a slot while one is still fading out, the weakest fading light gives way. ?lightfade=0 = old.
  const FADE = !(typeof location !== 'undefined' && /[?&]lightfade=0\b/.test(location.search));
  const scaled = [];
  function fit(list, target, spareList, cam, noFade) {
    let active = list.length;
    if (list.length > target) {
      for (let i = 0; i < list.length; i++) {
        const l = list[i];
        l.getWorldPosition(camPos);
        l.userData.psD2 = camPos.distanceToSquared(cam.position) / Math.max(0.05, l.intensity || 0.05) * (FADE && l.userData.psIn ? 0.6 : 1);
      }
      list.sort(byDistance);
      if (!FADE || noFade) {
        for (let i = target; i < list.length; i++) {
          list[i].visible = false;
          hiddenNow.push(list[i]);
        }
        active = target;
      } else {
        const now = performance.now() / 1000;
        active = 0;
        for (let i = 0; i < list.length; i++) {
          const l = list[i], u = l.userData, want = i < target;
          const h = u.psT === undefined ? 0 : Math.min(0.1, Math.max(0, now - u.psT));
          u.psT = now; u.psIn = want;
          if (u.psW === undefined) u.psW = want ? 1 : 0;
          else u.psW = want ? Math.min(1, u.psW + h * 3.3) : Math.max(0, u.psW - h * 3.3);
          if (u.psW > 0) active++;
        }
        // over the budget while lights cross over: the weakest fading-out lights give way
        for (let i = list.length - 1; i >= 0 && active > target; i--) { const u = list[i].userData; if (!u.psIn && u.psW > 0) { u.psW = 0; active--; } }
        for (let i = list.length - 1; i >= 0 && active > target; i--) { const u = list[i].userData; if (u.psW > 0) { u.psW = 0; active--; } }
        for (let i = 0; i < list.length; i++) {
          const l = list[i], w = l.userData.psW;
          if (w <= 0) { l.visible = false; hiddenNow.push(l); }
          else if (w < 1) { l.userData.psI0 = l.intensity; l.intensity *= w * w * (3 - 2 * w); scaled.push(l); }
        }
      }
    } else if (FADE) {
      for (let i = 0; i < list.length; i++) { const u = list[i].userData; u.psW = 1; u.psIn = true; u.psT = undefined; }
    }
    const need = Math.max(0, target - active);
    for (let i = 0; i < spareList.length; i++) {
      spareList[i].visible = i < need;
    }
  }
  function restoreScaled() { for (let i = 0; i < scaled.length; i++) { const l = scaled[i]; l.intensity = l.userData.psI0; } scaled.length = 0; }

  let pruneT = 0;
  const prevBefore = scene.onBeforeRender;
  const prevAfter = scene.onAfterRender;
  scene.onBeforeRender = function onBeforeRender(renderer, sc, cam, rt) {
    try {
      livePoint.length = 0;
      liveSpot.length = 0;
      const layers = cam.layers;
      restoreScaled(); // (a render that threw skipped onAfterRender: never compound the fade)
      const TL = trackedList();
      for (let ti = 0; ti < TL.length; ti++) {
        const l = TL[ti];
        if (!effectiveIn(l, scene, layers)) {
          continue;
        }
        if (l.isSpotLight) {
          liveSpot.push(l);
        } else {
          livePoint.push(l);
        }
      }
      fit(livePoint, POINT_TARGET, spares.point, cam);
      fit(liveSpot, SPOT_TARGET, spares.spot, cam);
      stats.point = livePoint.length;
      stats.spot = liveSpot.length;
      stats.benched = hiddenNow.length;
      stats.tracked = tracked.size;
      // forget lights that left the scene for good (checked every few hundred renders)
      if (++pruneT > 600) {
        pruneT = 0;
        for (const l of tracked) {
          let top = l;
          while (top.parent) {
            top = top.parent;
          }
          if (top !== scene) {
            l.userData.psGone = (l.userData.psGone || 0) + 1;
            if (l.userData.psGone > 3) {
              tracked.delete(l); trackedDirty = true;
            }
          } else {
            l.userData.psGone = 0;
          }
        }
      }
    } catch (e) {
      // never break rendering
    }
    if (prevBefore) {
      prevBefore.call(this, renderer, sc, cam, rt);
    }
  };
  scene.onAfterRender = function onAfterRender(renderer, sc, cam, rt) {
    for (const l of hiddenNow) {
      l.visible = true;
    }
    hiddenNow.length = 0;
    restoreScaled();
    if (prevAfter) {
      prevAfter.call(this, renderer, sc, cam, rt);
    }
  };
  game.lightBudget = stats;
  // r2-perf: shader programs are keyed on the light counts. Every precompile path (boot warm-up, compileForGame,
  // precompile.v2.js, streamed tiles, interiors) calls renderer.compile / compileAsync, which never runs
  // scene.onBeforeRender, so they compiled with the spare lights still hidden (1 point / 0 spot instead of 16 / 4) and the
  // real program compiled synchronously on first draw (a drive measured 1.2-4.5 s of link stalls, frames up to 8.7 s).
  // compile now sees the same light set as the render. ?compilelights=0 = old behavior.
  if (!(typeof location !== 'undefined' && /[?&]compilelights=0\b/.test(location.search))) {
    const r = game.renderer, comp0 = r.compile.bind(r);
    r.compile = function compile(sc, cam, target = null) {
      const ts = target || sc;
      if (ts !== scene || !cam || !cam.layers) return comp0(sc, cam, target);
      let fitted = false;
      try {
        livePoint.length = 0;
        liveSpot.length = 0;
        for (const l of tracked) {
          if (!effectiveIn(l, scene, cam.layers)) continue;
          if (l.isSpotLight) liveSpot.push(l); else livePoint.push(l);
        }
        fit(livePoint, POINT_TARGET, spares.point, cam, true);
        fit(liveSpot, SPOT_TARGET, spares.spot, cam, true);
        fitted = true;
      } catch (e) {
        // never break a compile
      }
      try {
        return comp0(sc, cam, target);
      } finally {
        if (fitted) {
          for (const l of hiddenNow) l.visible = true;
          hiddenNow.length = 0;
        }
      }
    };
  }
  return true;
}

// ---- 4. Even frame pacing on high-refresh displays (120 Hz MacBook Pro panels): a frame that misses 8.3 ms snapped
// to 25 ms and the game judders between 60 and 40 fps. requestAnimationFrame callbacks now run on every second
// display refresh when the display runs at 90 Hz or more, so frames present at an even 16.7 ms.
let pacingOn = false;
function evenPacing(game) {
  if (pacingOn || typeof window === 'undefined' || !window.requestAnimationFrame) {
    return false;
  }
  pacingOn = true;
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const pace = {
    hz: 0,
    on: false,
    skipped: 0,
  };
  game.framePacing = pace;
  // measure the display refresh for about half a second, using the browser's own callbacks
  const probe = [];
  const measure = (t) => {
    probe.push(t);
    if (probe.length < 40) {
      nativeRAF(measure);
      return;
    }
    const d = [];
    for (let i = 1; i < probe.length; i++) {
      d.push(probe[i] - probe[i - 1]);
    }
    d.sort((x, y) => x - y);
    const med = d[d.length >> 1];
    pace.hz = Math.round(1000 / med);
    pace.on = pace.hz >= 90 && game.settings?.fpsLimit !== 0 && game.settings?.evenPacing !== false;
  };
  nativeRAF(measure);

  let queue = [];
  let ids = 0;
  let scheduled = false;
  let lastFire = 0;
  function pump(now) {
    scheduled = false;
    // on a 120 Hz panel ticks come every 8.3 ms: fire every second tick (present at 16.7 ms)
    if (pace.on && now - lastFire < 12.5) {
      pace.skipped++;
      scheduled = true;
      nativeRAF(pump);
      return;
    }
    lastFire = now;
    const run = queue;
    queue = [];
    for (const e of run) {
      if (!e.cancelled) {
        try {
          e.cb(now);
        } catch (err) {
          console.error(err);
        }
      }
    }
  }
  window.requestAnimationFrame = function requestAnimationFrame(cb) {
    const e = { id: ++ids, cb, cancelled: false };
    queue.push(e);
    if (!scheduled) {
      scheduled = true;
      nativeRAF(pump);
    }
    return e.id;
  };
  window.cancelAnimationFrame = function cancelAnimationFrame(id) {
    for (const e of queue) {
      if (e.id === id) {
        e.cancelled = true;
      }
    }
    void nativeCancel;
  };
  return true;
}

// ---- 5. Shader warm-up for streamed geometry: new city tiles are hidden from the main camera (layer 0) until
// their shader programs have compiled in parallel (KHR_parallel_shader_compile through compileAsync), so a tile
// that needs a new program no longer stalls a frame for 100-250 ms. Usually that takes a frame or two.
let warmOn = false;
const POPFIX = !(typeof location !== 'undefined' && /[?&]popfix=0/.test(location.search));
function warmStreamedShaders(game) {
  const { renderer, scene, camera } = game;
  const root = game.city?.root;
  if (warmOn || !renderer?.compileAsync || !root) {
    return false;
  }
  warmOn = true;
  const stats = {
    warmed: 0,
    pending: 0,
    maxWaitMs: 0,
  };
  game.shaderWarm = stats;
  const origAdd = root.add;
  root.add = function add(...objs) {
    const r = origAdd.apply(this, objs);
    for (const o of objs) {
      if (!o || !o.isObject3D) {
        continue;
      }
      const hidden = [];
      o.traverse((m) => {
        if ((m.isMesh || m.isInstancedMesh || m.isPoints || m.isLine) && m.layers.isEnabled(0)) {
          m.layers.disable(0);
          hidden.push(m);
        }
      });
      if (!hidden.length) {
        continue;
      }
      stats.pending++;
      const t0 = performance.now();
      let finished = false;
      const done = () => {
        // runs once: the 1.5 s timeout and the compile promise can both arrive
        if (finished) {
          return;
        }
        finished = true;
        for (const m of hidden) {
          m.layers.enable(0);
        }
        stats.pending--;
        stats.warmed++;
        stats.maxWaitMs = Math.max(stats.maxWaitMs, performance.now() - t0);
      };
      // compile with layer 0 on for this object only (compile follows the camera layers)
      const mask = camera.layers.mask;
      let promise = null;
      try {
        for (const m of hidden) {
          m.layers.enable(0);
        }
        promise = renderer.compileAsync(o, camera, scene);
      } catch (e) {
        promise = null;
      } finally {
        for (const m of hidden) {
          m.layers.disable(0);
        }
        camera.layers.mask = mask;
      }
      // r3-perf (building pop, ?popfix=0 rolls back): every new tile was hidden until compileAsync resolved, at least a
      // frame and up to 1.5 s, even when all its shaders were long compiled. The mid LOD under a new near tile is cut away
      // the moment the tile exists, so its buildings vanished for that time. Meshes whose program is already linked show at once;
      // only ones that wait for a new shader stay hidden.
      if (POPFIX && promise && promise.then) {
        try {
          const props = renderer.properties;
          for (let i = hidden.length - 1; i >= 0; i--) {
            const m = hidden[i], mats = Array.isArray(m.material) ? m.material : [m.material];
            if (mats.every((mt) => { const p = mt && props.get(mt).currentProgram; return p && p.isReady && p.isReady(); })) { m.layers.enable(0); hidden.splice(i, 1); }
          }
        } catch (e) { /* keep them hidden until the promise */ }
      }
      if (promise && promise.then) {
        // never hold a tile back for long: show it after 1.5 s whatever happens
        const timer = setTimeout(done, 1500);
        promise.then(() => {
          clearTimeout(timer);
          done();
        }, () => {
          clearTimeout(timer);
          done();
        });
      } else {
        done();
      }
    }
    return r;
  };
  return true;
}

export async function initV2(game) {
  const done = {
    interiorsList: false,
    facadeBatch: false,
  };
  try {
    done.facadeBatch = guardFacadeBatch();
  } catch (e) {
    console.warn('[perfGuards] facade batch', e);
  }
  try {
    done.interiorsList = guardInteriorsList(game);
  } catch (e) {
    console.warn('[perfGuards] interiors list', e);
  }
  try {
    done.lights = stabilizeLights(game);
  } catch (e) {
    console.warn('[perfGuards] lights', e);
  }
  // production: do not stall on getProgramParameter right after every new program (the driver can link in parallel)
  try {
    if (!import.meta.env?.DEV && game.renderer?.debug) {
      game.renderer.debug.checkShaderErrors = false;
    }
  } catch (e) {
    // not fatal
  }
  try {
    done.pacing = evenPacing(game);
  } catch (e) {
    console.warn('[perfGuards] pacing', e);
  }
  try {
    done.shaderWarm = warmStreamedShaders(game);
  } catch (e) {
    console.warn('[perfGuards] shader warm', e);
  }
  game.perfGuards = done;
}
