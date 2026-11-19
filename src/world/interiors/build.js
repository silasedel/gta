// Builds one interior: plan -> shell -> storefront -> doors -> the store type's fixtures, stock and lights -> meshes -> colliders,
// nav grid and the light bake. A generator: the manager advances it a few milliseconds per frame, and the bake runs in a Worker.
import * as THREE from 'three';
import { Geo, M4 } from './kit/geo.js';
import { MatSet } from './kit/materials.js';
import { rng } from './kit/util.js';
import { bake } from './kit/bake.js';
import { Plan } from './plan.js';
import { buildShell, FLOOR_Y } from './shell.js';
import { prepareFront, buildFacade } from './facade.js';
import { buildDoors } from './doors.js';
import { defaultRig, registerDaylight, FIXTURES, gridRig } from './lighting.js';
import { ItemField } from './items/field.js';
import { Prints } from './prints.js';
import { buildNav } from './nav.js';
import { autoWear } from './clutter.js';
import { dressFront } from './frontDress.js';
const NO_DRESS = /[?&]shops=0\b/.test(globalThis.location?.search || ''); // shops pass A/B

const _v = new THREE.Vector3();
export function makeContext(game, store) {
  const group = new THREE.Group(); group.position.set(store.center.x, store.baseY, store.center.z); group.rotation.y = store.facing; group.updateMatrixWorld(true); group.visible = false;
  const M = new MatSet(), G = new Geo(), plan = new Plan({ W: store.W, D: store.D, H: store.H, levels: store.levels, doorX: store.doorX, doorW: store.doorW });
  const ctx = { game, store, group, M, G, plan, R: rng(store.seed, 'build'), profile: store.profile, colliders: [], occ: [], lights: [], fixtureLights: [], windows: [], pois: [], uses: [], anim: [], disposables: [], bakeParts: [], tags: [], seats: [], light: FIXTURES, gridRig: (room, o) => { room.lit = true; return gridRig(ctx, room, o); }, FLOOR_Y };
  ctx.items = new ItemField(store, M); ctx.prints = new Prints(M, store);
  // ---- helpers (all coordinates in the current G frame unless noted)
  // solid box x0..x1, y0..y1, z0..z1: collider, and a bake occluder when it is tall enough to throw shade. o: { occ: bool, soft: no collider }
  ctx.solid = (x0, y0, z0, x1, y1, z1, o = {}) => { const c = G.local((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, _v), yaw = G.yaw(), q = Math.round(yaw / (Math.PI / 2)), al = Math.abs(yaw - q * Math.PI / 2) < 0.012; let hx = Math.abs(x1 - x0) / 2, hz = Math.abs(z1 - z0) / 2; const hy = Math.abs(y1 - y0) / 2;
    if (al) { if (q & 1) { const t = hx; hx = hz; hz = t; } if (!o.soft) ctx.colliders.push([c.x, c.y, c.z, hx, hy, hz]); if (o.occ ?? (hy * 2 > 0.9)) ctx.occ.push(c.x - hx, c.y - hy, c.z - hz, c.x + hx, c.y + hy, c.z + hz); }
    else { if (!o.soft) ctx.colliders.push([c.x, c.y, c.z, hx, hy, hz, yaw]); if (o.occ ?? (hy * 2 > 0.9)) { const r = Math.min(hx, hz) * 0.9; ctx.occ.push(c.x - r, c.y - hy, c.z - r, c.x + r, c.y + hy, c.z + r); } } };
  ctx.shadow = (x, z, w, d, k = 1) => { G.plane(M.shadow(), x, FLOOR_Y + 0.006 - G.local(0, 0, 0, _v).y * 0, z, w * 1.25, d * 1.25, { rx: -Math.PI / 2 }); void k; };
  // point of interest for behaviors: tag 'browse' | 'register' | 'queue' | 'restock' | 'sweep' | 'post' | ... ; ry = the way a person standing there faces
  ctx.poi = (tag, x, z, ry = 0, data = {}) => { const p = G.local(x, 0, z, _v); const q = { tag, x: p.x, z: p.z, ry: G.yaw() + ry, ...data }; ctx.pois.push(q); return q; };
  // interactable: { kind, label | prompt(api), key ('KeyE'), r (reach), onUse(api), ...state }. Position in the current frame.
  ctx.use = (x, y, z, def) => { const p = G.local(x, y, z, _v); const u = { x: p.x, y: p.y, z: p.z, r: 1.3, key: 'KeyE', ...def }; ctx.uses.push(u); return u; };
  // separately animated part (door leaf, drawer, fan blade, clock hand): returns a Group at (x, y, z, ry) in STORE-LOCAL coordinates
  ctx.dyn = (x, y, z, ry, fn) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.matrixAutoUpdate = false; g.updateMatrix(); group.add(g); const LG = new Geo(); fn(LG); const b = LG.build(g); const m = g.matrix, n3 = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < b.bake.count; i++) { _v.fromArray(b.bake.pos, i * 3).applyMatrix4(m).toArray(b.bake.pos, i * 3); _v.fromArray(b.bake.nor, i * 3).applyMatrix3(n3).normalize().toArray(b.bake.nor, i * 3); } if (b.bake.count) ctx.bakeParts.push(b.bake); g.userData.meshes = b.meshes; return g; };
  // same, positioned in the current G frame
  ctx.dynHere = (x, y, z, ry, fn) => { const p = G.local(x, y, z, new THREE.Vector3()); return ctx.dyn(p.x, p.y, p.z, G.yaw() + ry, fn); };
  // place a product in the current frame (see ItemField.add)
  ctx.item = (pid, x, y, z, ry = 0, o) => { const p = G.local(x, y, z, _v); return ctx.items.add(pid, p.x, p.y, p.z, G.yaw() + ry, o); };
  return ctx;
}

export function* buildInterior(game, store, def) {
  const t0 = performance.now(), ctx = makeContext(game, store), { G, plan, group } = ctx, prof = {};
  const lap = (k) => { prof[k] = Math.round((performance.now() - t0) * 10) / 10; };
  def.plan(plan, ctx); if (!plan.rooms.length) plan.room('sales', 'sales', plan.lot); prepareFront(plan); plan.finalize(); lap('plan'); yield;
  buildShell(ctx); lap('shell'); yield;
  ctx.front = buildFacade(ctx); const doors = buildDoors(ctx); lap('facade'); yield;
  const it = def.fixtures(ctx); if (it && typeof it.next === 'function') { let n = 0, t = performance.now(), r = it.next(); prof.stepMax = 0; while (!r.done) { const d = performance.now() - t; if (d > prof.stepMax) { prof.stepMax = Math.round(d); prof.stepAt = n; } yield; n++; t = performance.now(); r = it.next(); } } // r7: longest fixture group (ms) and its index try { autoWear(ctx); } catch (e) { console.warn('[interiors] wear pass failed', e); } if (!NO_DRESS) try { dressFront(ctx, def); } catch (e) { console.warn('[interiors] front dressing failed', e); } lap('fixtures'); yield;
  if (def.lighting) def.lighting(ctx); for (const r of plan.rooms) if (!r.lit) { defaultRig(ctx, r); r.lit = true; }
  registerDaylight(ctx, store.profile.daylight ?? 1); lap('lights'); yield;
  // ---- meshes
  const built = yield* G.buildIter(group, { slice: 3 }); ctx.bakeParts.unshift(built.bake); lap('meshes'); yield;
  const ib = yield* ctx.items.buildIter(group, 3); lap('items'); yield;
  // ---- nav (level 0) + bake input
  const nav = buildNav(plan, ctx.colliders); lap('nav'); yield;
  let n = ib.count; for (const b of ctx.bakeParts) n += b.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), gain = new Float32Array(n).fill(1); let off = 0; const parts = [];
  for (const b of ctx.bakeParts) { pos.set(b.pos, off * 3); nor.set(b.nor, off * 3); parts.push([b, off]); off += b.count; }
  pos.set(ib.pos, off * 3); nor.set(ib.nor, off * 3); gain.set(ib.gain, off); const itemOff = off;
  const rooms = plan.rooms.map((r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: r.y0, y1: r.ceilY }));
  const input = { pos, nor, gain, count: n, lights: ctx.lights, occ: new Float32Array(ctx.occ), rooms, bounce: (store.profile.bounce ?? 0.55) * 0.85, ao: 0.85 };
  const b = { probe: ctx.probe || null, ctx, group, plan, M: ctx.M, prints: ctx.prints, items: ctx.items, doors, colliders: ctx.colliders, nav, pois: ctx.pois, uses: ctx.uses, anim: ctx.anim, seats: ctx.seats, fixtureLights: ctx.fixtureLights, spill: ctx.spill, front: ctx.front, disposables: ctx.disposables, meshes: built.meshes, body: null, ready: false, visible: false, levels: [1, 1], prof, verts: n, lights: ctx.lights.length, people: [], t0 };
  b.baked = bake(input).then((out) => { if (b.disposed) return; for (const [p, o] of parts) p.apply(out[0], out[1], out[2], o); ctx.items.applyBake(out[0], out[1], out[2], itemOff); b.ready = true; prof.bake = Math.round(performance.now() - t0); }).catch((e) => { console.warn('[interiors] bake failed', store.name, e); b.ready = true; b.M.uBk.value.set(0, 0, 0); });
  ctx.bakeParts = null; lap('total');
  return b;
}
export function disposeBuilt(b) {
  b.disposed = true; try { b.probe?.job?.return?.(); b.probe?.rt?.dispose(); } catch (e) { /* */ } b.group.traverse((o) => { if (o.isInstancedMesh) return; if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
  b.items.dispose(); b.M.dispose(); b.prints.dispose(); for (const d of b.disposables) d.dispose?.(); b.group.removeFromParent();
}
export { M4 };
