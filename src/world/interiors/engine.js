// Interiors engine (V2): streams store interiors around the player. Lots come from city.storefronts; each lot whose kind matches a
// registered store type gets a real floor plan, baked lighting, physical items, doors, staff and customers.
// Public API (game.interiors.v2): see README.md.
import * as THREE from 'three';
import { typeFor, standoutFor, getStoreType, registerStoreType, storeTypes } from './registry.js';
import { baseProfile } from './variation.js';
import { buildInterior, disposeBuilt } from './build.js';
import { updateDoors } from './doors.js';
import { updateSky, createLightPool } from './lighting.js';
import { pumpBakes, bakesPending } from './kit/bake.js';
import { GLOBAL } from './kit/atlas.js';
import { setDesign, getProduct } from './items/catalog.js';
import { rng, hashStr, clamp } from './kit/util.js';
import { probeJob, probePlaceholder } from './kit/probe.js';
import { setProbePlaceholder } from './kit/materials.js';
import { surfaceTextures } from './kit/surfaces.js';

const ACTIVE_R = 70, DISPOSE_R = 140, MAX_ACTIVE = 3, CACHE = 2, WALL_T = 0.25, GF_H = 4.2, BUILD_MS = 4;
export const isOpenAt = (h, hrs) => { const [o, c] = hrs; if (c - o >= 24) return true; return o < c ? h >= o && h < c : h >= o || h < c; };

export function createEngine(game, opts = {}) {
  const { scene, world, RAPIER } = game, city = game.city || {}, list = [], byKey = new Map(), claimed = new WeakSet();
  const state = (game.interiorState ||= new Map()); // key -> persisted per-store state
  const pool = createLightPool(scene, opts.poolLights ?? 4), hooks = { people: null, interact: null }, tmp = new THREE.Vector3();
  let current = null, pending = null, fitter = opts.fitter || null, ingN = 0, ingSrc = null, pollT = 0, scanT = 0, nearList = [], upMax = 0, buildMax = 0, clock = 0;
  try { if (game.design) setDesign(game.design); } catch (e) { /* */ }
  try { if (game.renderer) setProbePlaceholder(probePlaceholder(game.renderer, 256)); } catch (e) { console.warn('[interiors] probe placeholder', e); }

  // ---------------------------------------------------------------- store records
  const keyOf = (sf) => (sf.id != null ? 'id' + sf.id : `${Math.round(sf.x * 10)},${Math.round(sf.z * 10)}`);
  function claims(sf) { if (claimed.has(sf)) return true; if (sf.v2 === false) return false; const fit = fitter?.get ? fitter.get(sf) : null; const lw = fit?.ok ? fit.w : sf.w, ld = fit?.ok ? fit.d : sf.d; return !!typeFor(sf, Math.max(3, lw - 2 * WALL_T), Math.max(3, ld - WALL_T)); }
  function addStore(sf) {
    const key = keyOf(sf); if (byKey.has(key)) return byKey.get(key);
    const fit = fitter?.get ? fitter.get(sf) : null; if (fit && !fit.ok) return null;
    const facing = sf.facing || 0, cos = Math.cos(facing), sin = Math.sin(facing), lw = fit ? fit.w : sf.w, ld = fit ? fit.d : sf.d, off = (fit ? fit.off : 0) + WALL_T / 2;
    const W = Math.max(3, lw - 2 * WALL_T), D = Math.max(3, ld - WALL_T), def = typeFor(sf, W, D); if (!def) return null;
    const cx = sf.x + sin * off, cz = sf.z + cos * off, seed = (hashStr(key) ^ Math.imul(Math.round(sf.x * 7.3 + sf.z * 13.7), 2654435761)) >>> 0 || 1;
    let baseY = sf.y ?? 0; if (!(sf.y > 0) && city.groundHeightAt) { try { const gy = city.groundHeightAt(sf.x + sin * (D / 2 + 1.5), sf.z + cos * (D / 2 + 1.5)); if (Number.isFinite(gy) && gy > -2) baseY = gy; } catch (e) { /* */ } }
    const s = { key, sf, seed, def, type: def.type, W, D, H: clamp(sf.h || GF_H, 2.9, 6), levels: 1, facing, cos, sin, baseY, center: new THREE.Vector3(cx, baseY, cz), doorW: Math.min(sf.doorW || 1.9, W - 1.2), built: null, dist: Infinity, open: true, v2: true };
    s.doorX = clamp(-(sf.doorX || 0), -W / 2 + s.doorW / 2 + 0.45, W / 2 - s.doorW / 2 - 0.45);
    s.toWorld = (lx, lz, out = new THREE.Vector3()) => out.set(cx + lx * cos + lz * sin, baseY, cz - lx * sin + lz * cos);
    s.toLocal = (wx, wz, out = {}) => { const dx = wx - cx, dz = wz - cz; out.x = dx * cos - dz * sin; out.z = dx * sin + dz * cos; return out; };
    s.isInside = (p) => { const l = s.toLocal(p.x, p.z); return Math.abs(l.x) < W / 2 && Math.abs(l.z) < D / 2 && p.y < baseY + s.H + 0.5 && p.y > baseY - 1.5; };
    const standout = standoutFor(def, sf), prof = baseProfile(seed, sf, def); s.profile = prof; s.standout = standout;
    try { Object.assign(prof, def.profile ? def.profile(prof, { sf, store: s, design: game.design || null, R: rng(seed, 'type') }) || {} : {}); if (standout?.apply) standout.apply(prof, { sf, store: s }); } catch (e) { console.warn('[interiors] profile failed', def.type, e); }
    s.name = prof.name || sf.name || def.label; s.hours = prof.open24 ? [0, 24] : prof.hours; s.zone = sf.zone || null; s.address = sf.street || null;
    s.priceOf = (pid) => { const p = getProduct(pid); if (!p) return 0; const v = p.price * prof.priceK; return p.price >= 1 && !p.scratch ? Math.max(0.49, Math.round(v * 10) / 10 - 0.01) : p.price; };
    if (!state.has(key)) state.set(key, { taken: new Set(), dvr: true, lights: true, robbedUntil: -1, banned: false, cash: null }); s.state = state.get(key);
    s.counterPos = s.center.clone(); claimed.add(sf); sf.v2Facade = true; byKey.set(key, s); list.push(s); return s;
  }
  function ingest() {
    const src = (Array.isArray(city.storefronts) && city.storefronts.length ? city.storefronts : city.shopLots) || []; if (src === ingSrc && src.length === ingN) return;
    const start = src === ingSrc ? ingN : 0; ingSrc = src; ingN = src.length; const fresh = src.slice(start);
    if (fitter?.fit) { try { fitter.fit(fresh.filter((sf) => sf.shell ?? (sf.buildingId != null))); } catch (e) { console.warn('[interiors] lot fit', e); } }
    for (const sf of fresh) { try { if (sf.v2 !== false) addStore(sf); } catch (e) { console.warn('[interiors] store failed', e); } }
  }
  const hasShell = (s) => { if (opts.standalone) return true; if (typeof city.storefrontHasShell === 'function') { try { return !!city.storefrontHasShell(s.sf); } catch (e) { return false; } } return s.sf.h != null || s.sf.doorX != null || s.sf.doorW != null || s.sf.buildingId == null; };

  // ---------------------------------------------------------------- physics bodies (created while an interior is shown)
  const dead = [];
  function makeBody(s) { const b = s.built; if (!b || b.body) return; const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.facing);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.center.x, s.baseY, s.center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    for (const c of b.colliders) { const [x, y, z, hx, hy, hz, ry] = c; if (hx < 0.004 || hy < 0.004 || hz < 0.004) continue; const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.6); if (ry) d.setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) }); world.createCollider(d, body); }
    for (const d of b.doors) { if (!d.half) continue; d.col = world.createCollider(RAPIER.ColliderDesc.cuboid(d.half[0], d.half[1], d.half[2]).setTranslation(d.x, d.y + d.h / 2, d.z), body); d.col.setEnabled(false); d.blocking = false; }
    b.body = body; }
  function killBody(s) { const b = s.built; if (b?.body) { dead.push(b.body); b.body = null; for (const d of b.doors) d.col = null; } }
  function flushBodies(max = 3) { for (let i = 0; i < max && dead.length; i++) { const b = dead.shift(); try { world.removeRigidBody(b); } catch (e) { console.warn('[interiors] removeRigidBody', e); } } }
  // generate the store's surface textures in idle time before it is built (the build would otherwise draw them in one slice)
  function prewarm(s) { s.warmQ = true; const p = s.profile, w = { wear: p.wear }, list = [];
    const add = (spec, extra) => { if (Array.isArray(spec) && typeof spec[0] === 'string') list.push([spec[0], { ...(spec[1] || {}), ...extra }]); };
    add(p.floor, w); add(p.wall?.surf, w); add(p.wall?.wainscot?.surf, w); try { for (const it of s.def.prewarm?.(p) || []) list.push(it); } catch (e) { /* */ }
    const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 30)); const step = () => { const it = list.shift(); if (!it || s.built) return; try { surfaceTextures(it[0], it[1]); } catch (e) { /* unknown surface: the build reports it */ } idle(step, { timeout: 400 }); }; idle(step, { timeout: 400 }); }
  // compile the interior's shaders in the background (KHR_parallel_shader_compile) before it is first drawn: no stall on show
  let compileRT = null; // the game draws the scene into the post composer's HDR target: compile for that (tone mapping / color space are part of the program key)
  function precompile(b) { const r = game.renderer; b.compiled = true; if (!r?.compileAsync || !game.camera || opts.noPrecompile) return; b.compiled = false; const g = b.group, v = g.visible, prevT = r.getRenderTarget(); let p = null;
    const viaPost = !!(game.post?.composer || opts.compileToTarget); if (viaPost && !compileRT) compileRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    try { g.visible = true; r.setRenderTarget(viaPost ? compileRT : null); p = r.compileAsync(g, game.camera, scene); } catch (e) { b.compiled = true; } finally { r.setRenderTarget(prevT); g.visible = v; }
    if (p) { const done = () => { b.compiled = true; }; p.then(done, done); setTimeout(done, 6000); }
    // and upload its textures a few milliseconds per frame (first use would otherwise upload them all in one frame)
    const tex = new Set(); g.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) { const t = m[k] || m.uniforms?.[k]?.value; if (t && t.isTexture && !t.isRenderTargetTexture) tex.add(t); } }); b.texQ = [...tex]; }
  function uploadTick(b, ms = 3) { const r = game.renderer, q = b.texQ; if (!q || !r?.initTexture) { b.texQ = null; return; } const t0 = performance.now(); while (q.length && performance.now() - t0 < ms) { try { r.initTexture(q.shift()); } catch (e) { /* */ } } if (!q.length) b.texQ = null; }
  function show(s) { const b = s.built; if (!b || b.visible || !b.ready || b.compiled === false) return; if (b.texQ) { uploadTick(b); if (b.texQ) return; } b.visible = true; b.group.visible = true; if (!b.group.parent) scene.add(b.group); try { makeBody(s); } catch (e) { console.warn('[interiors] colliders', e); } }
  function hide(s) { const b = s.built; if (!b || !b.visible) return; b.visible = false; b.group.visible = false; killBody(s); try { hooks.people?.release(s); } catch (e) { /* */ } }
  function dispose(s) { const b = s.built; if (!b) return; if (probeBusy === s) probeBusy = null; hide(s); try { hooks.interact?.forget(s); } catch (e) { /* */ } disposeBuilt(b); s.built = null; }

  // ---------------------------------------------------------------- frame update
  function levelsFor(s, hour) { const open = s.open, lightsOn = s.state.lights !== false; return [lightsOn ? (open ? 1 : 0.06) : 0, 1]; }
  function update(dt) { const t = performance.now(); try { inner(dt); } catch (e) { console.error('[interiors]', e); } const d = performance.now() - t; if (d > upMax) upMax = d; }
  // stage 1 perf: an interior is ~200-250 separate meshes (almost one material each). Seen from behind its back wall and
  // below the roof line it is completely hidden by the building, yet every mesh was drawn. Right before the main render
  // (final camera) such interiors leave the main view (layer 0 off); they keep casting shadows (layers 6/7), so the static
  // shadow map never changes. game.interiorCull = false turns it off.
  const _lc = {}, viewCull = { culled: 0 };
  function cullForView(cam) {
    const on = game.interiorCull !== false; let n = 0;
    for (const s of list) { const b = s.built; if (!b || !b.visible) continue;
      const l = s.toLocal(cam.x, cam.z, _lc);
      const cull = on && l.z < -s.D / 2 - 0.5 && cam.y < s.baseY + s.H + 2 && !s.isInside(cam);
      if (cull) n++;
      if (!!b._viewCulled !== cull) { b._viewCulled = cull; b.group.traverse((o) => { if (cull) o.layers.disable(0); else o.layers.enable(0); }); }
    }
    viewCull.culled = n;
  }
  if (scene) { const prevBR = scene.onBeforeRender; scene.onBeforeRender = function (r, sc, cam, ...rest) { if (cam === game.camera) { try { cullForView(cam.position); } catch (e) { /* never break the frame */ } } if (prevBR) prevBR.call(this, r, sc, cam, ...rest); }; }
  function inner(dt) {
    const P = game.player; if (!P) return; const pp = P.position, hour = game.timeOfDay ?? 12; clock += dt;
    pumpBakes(3); if (dead.length) flushBodies();
    pollT -= dt; if (pollT <= 0) { pollT = 1; ingest(); }
    scanT -= dt; if (scanT <= 0) { scanT = 0.25; nearList = list.filter((s) => Math.abs(s.center.x - pp.x) < DISPOSE_R + 30 && Math.abs(s.center.z - pp.z) < DISPOSE_R + 30); }
    for (const s of nearList) s.dist = Math.hypot(pp.x - s.center.x, pp.z - s.center.z); nearList.sort((a, b) => a.dist - b.dist);
    const wanted = []; for (const s of nearList) { if (s.dist > ACTIVE_R || wanted.length >= MAX_ACTIVE) break; if (!s.failed) wanted.push(s); }
    for (const s of nearList) { if (s.dist > 160) break; if (!s.built && !s.warmQ) prewarm(s); }
    for (const s of wanted) { if (!s.built) { if (!pending && hasShell(s)) pending = { s, it: buildInterior(game, s, s.def) }; } else if (!s.built.visible) show(s); }
    if (pending) { const t0 = performance.now(); try { while (performance.now() - t0 < BUILD_MS) { const r = pending.it.next(); if (r.done) { pending.s.built = r.value; scene.add(r.value.group); precompile(r.value); pending = null; break; } } } catch (e) { console.error('[interiors] build failed', pending.s.name, e); pending.s.failed = true; pending = null; } const d = performance.now() - t0; if (d > buildMax) buildMax = d; }
    const sky = updateSky(hour);
    let hidden = 0;
    for (const s of list) { const b = s.built; if (!b) continue; if (!nearList.includes(s)) s.dist = Math.hypot(pp.x - s.center.x, pp.z - s.center.z);
      if (b.visible && (s.dist > DISPOSE_R || (!wanted.includes(s) && s.dist > 30 && !s.isInside(pp)))) hide(s); if (!b.visible && b.ready) hidden++; }
    if (hidden > CACHE) { const far = list.filter((s) => s.built && !s.built.visible && s.built.ready && !wanted.includes(s)).sort((a, b) => b.dist - a.dist); while (far.length > CACHE) dispose(far.shift()); }
    // inside detection
    let inside = null; if (!P.state?.inVehicle) for (const s of nearList) { if (s.built?.visible && s.dist < Math.max(s.W, s.D) && s.isInside(pp)) { inside = s; break; } }
    if (inside !== current) { const prev = current; current = inside; api.current = inside; try { game.emit?.('interior', { store: inside, prev }); } catch (e) { /* */ } if (inside) { try { hooks.interact?.entered(inside); } catch (e) { console.error(e); } } else if (prev) { try { hooks.interact?.left(prev); } catch (e) { console.error(e); } } }
    if (P.state) { if (inside && !P.state.indoor) { P.state.indoor = true; try { game.env?.setIndoor?.(true); } catch (e) { /* */ } api._indoor = true; } else if (!inside && api._indoor && !game.interiors?.legacyCurrent?.()) { P.state.indoor = false; try { game.env?.setIndoor?.(false); } catch (e) { /* */ } api._indoor = false; } }
    // per-store simulation
    const cam = game.camera?.position || pp; let lit = inside;
    for (const s of nearList) { const b = s.built; if (!b || !b.visible) continue;
      const open = isOpenAt(hour, s.hours) && !(s.state.robbedUntil > (game.day ?? 0) * 24 + hour); if (open !== s.open) { s.open = open; try { game.emit?.('store-open', { store: s, open }); } catch (e) { /* */ } }
      const lv = levelsFor(s, hour); b.levels[0] += clamp(lv[0] - b.levels[0], -dt * 2.5, dt * 2.5); b.levels[1] = lv[1]; b.M.setLevels(b.levels[0], b.levels[1], 1);
      if (b.ready && b.probe && s.dist < 45) probeTick(s, b);
      if (b.ctx.shaftMat) { const k = sky.day * 0.085; b.ctx.shaftMat.color.setRGB(k, k * 0.95, k * 0.82); }
      if (b.spill) { const k = sky.night * (0.25 + 0.75 * b.levels[0]) * 0.5; const c = s.profile.spillC || [1, 0.92, 0.78]; b.spill.material.color.setRGB(c[0] * k, c[1] * k, c[2] * k); b.spill.visible = k > 0.01; }
      // doors: player + people near the store, in store-local coordinates
      const actors = b.actorsTmp || (b.actorsTmp = []); actors.length = 0; if (s.dist < 40 && !P.state?.inVehicle) { const l = s.toLocal(pp.x, pp.z, {}); l.level = 0; l.player = true; actors.push(l); } for (const p of b.people) if (!p.hidden) actors.push(p);
      const fd = b.doors.find((d) => d.def.frontDoor); if (fd) { const l = actors[0]?.player ? actors[0] : null; fd.locked = !s.open && !(l && l.z < s.D / 2 && Math.abs(l.x) < s.W / 2); }
      updateDoors(b.doors, dt, actors, s);
      if (s.dist < 60) { for (const a of b.anim) { try { a(dt, clock, s, hour); } catch (e) { console.error('[interiors] anim', e); b.anim.splice(b.anim.indexOf(a), 1); break; } } try { hooks.people?.update(s, dt, hour, sky); } catch (e) { console.error('[interiors] people', e); } }
      if (!lit && s.dist < 25) lit = s;
    }
    if (lit?.built) { const l = lit.toLocal(cam.x, cam.z, {}); pool.update(dt, lit, { x: l.x, y: (cam.y ?? pp.y + 1.6) - lit.baseY, z: l.z }, lit.built.levels[0], lit.built.levels[1]); } else pool.update(dt, null, tmp, 0, 0);
    try { hooks.interact?.update(dt, inside, hour); } catch (e) { console.error('[interiors] interact', e); }
  }
  // reflection probe (kit/probe.js): captured once the bake is applied and the interior is shown, again when its light levels move a lot
  function probeTick(s, b) { const p = b.probe, lv = b.levels[0] * 0.6 + b.levels[1] * 0.4; if (!game.renderer) return;
    if (!p.job) { if (p.rt && Math.abs(lv - p.lv) < 0.2) return; if (probeBusy && probeBusy !== s) return; probeBusy = s; p.lv = lv; p.t0 = 0; p.size = 256; // must match the placeholder size (kit/probe.js)
      p.job = probeJob(game.renderer, s, b, p.box, p.at, p); }
    const t0 = performance.now(); try { const r = p.job.next(); const dt = performance.now() - t0; p.t0 += dt; p.slice = Math.max(p.slice || 0, dt); (p.steps ||= []).push([r.value === undefined ? 'end' : String(r.value), Math.round(dt)]); if (p.steps.length > 40) p.steps.shift(); if (r.done) { p.rt?.dispose(); p.rt = r.value; p.job = null; p.ms = Math.round(p.t0); probeBusy = null; } }
    catch (e) { console.warn('[interiors] probe', e); b.probe = null; probeBusy = null; } }
  let probeBusy = null;
  // ---------------------------------------------------------------- persistence (core-systems save hooks)
  const saveState = () => { const o = {}; for (const [k, v] of state) if (v.taken.size || !v.dvr || v.robbedUntil > 0 || v.banned) o[k] = { ...v, taken: [...v.taken] }; return o; };
  const loadState = (o) => { for (const k of Object.keys(o || {})) { const v = o[k]; state.set(k, { dvr: true, lights: true, robbedUntil: -1, banned: false, ...v, taken: new Set(v.taken || []) }); const s = byKey.get(k); if (s) { s.state = state.get(k); if (s.built) dispose(s); } } };
  try { game.on?.('save', (d) => { if (d) d.interiors = saveState(); }); game.on?.('load', (d) => { if (d?.interiors) loadState(d.interiors); }); } catch (e) { /* */ }

  ingest();
  const api = { list, byKey, update, viewCull, current: null, claims, addStore, hooks, pool, saveState, loadState, registerStoreType, getStoreType, storeTypes, rebuild(s) { if (s.built) dispose(s); s.failed = false; }, dispose, show, hide,
    setFitter(f) { fitter = f; }, pending: () => !!pending || bakesPending() > 0,
    stats(reset) { const r = { stores: list.length, built: list.filter((s) => s.built).length, visible: list.filter((s) => s.built?.visible).length, updMaxMs: Math.round(upMax * 10) / 10, buildSliceMaxMs: Math.round(buildMax * 10) / 10, atlasMB: Math.round(GLOBAL.bytes() / 1e5) / 10, bakes: bakesPending() }; if (reset) { upMax = 0; buildMax = 0; } return r; } };
  return api;
}
export { registerStoreType };
