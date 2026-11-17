// Per-house curb furniture from the user's library models (overnight props pass, Nov 17; track: props).
// One mailbox per house at the end of its driveway (post mailbox facing the street, upright, aligned to the road edge;
// a twin box on a few duplex lots), and the household's trash + recycling carts: at the curb beside the driveway on the
// street's collection day (all streets: the side-of-house spot proved unreliable). No two neighbors alike: model, texture layer (recolors, rust, house
// numbers, stickers, tags; src/world/props/variants.v2.js), size +-6 %, a slight lean and yaw for the carts.
// The house generator (src/world/setpieces/houses) and the spawn street (src/world/dressing) hand over their spots instead of
// drawing their own code-built boxes:
//   import { lotProps } from '../../props/lotProps.v2.js'
//   lotProps.add(owner, [{ kind: 'mailbox' | 'carts' | 'rolloff' | 'chair', x, y, z, ry, seed, side?: { x, y, z, ry } }])
//      ry = the yaw the item's FRONT faces (toward the street); 'carts' = the household pair (two carts side by side,
//      lid openings toward the street, wheels toward the house); side = where the pair stands on a non-collection day
//   lotProps.remove(owner); lotProps.stats
// Drawing: one InstancedMesh per model part material (shared by every lot), shadows on. Physics: dynamicProps.v2.js
// (carts are pushable bodies, mailbox posts snap when a car hits them). Disable with ?lotprops=0 (owners draw their own).
import * as THREE from 'three';
import { dynProps } from './dynamicProps.v2.js';
import { physOf } from './propShapes.v2.js';
import { variantColor } from './variants.v2.js';
import { occupancy } from '../ground/occupancy.js';

const OFF = typeof location !== 'undefined' && /[?&]lotprops=0/.test(location.search);
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const CART_TRASH = [0, 1, 4, 5, 7, 9], CART_RECYCLE = [2, 6], CART_YARD = [3, 8];

function create(game) {
  const kit = game.city?.streetKit; if (!kit || !kit.parts) return null;
  const root = new THREE.Group(); root.name = 'lot-props'; game.scene.add(root);
  const pools = new Map(), owners = new Map(), recent = [];
  const stats = { owners: 0, items: 0, mailboxes: 0, carts: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

  function poolFor(q, colors) {
    const k = q.geometry.uuid + q.material.uuid; let P = pools.get(k);
    if (!P) {
      P = { q, colors, items: [], mesh: null, cap: 0, dirty: true }; pools.set(k, P); grow(P, 64);
    }
    return P;
  }
  function grow(P, cap) {
    const im = new THREE.InstancedMesh(P.q.geometry, P.q.material, cap); im.count = 0; im.castShadow = true; im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (P.colors) { im.setColorAt(0, _c.set(0xffffff)); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    im.name = 'lot-props:' + (P.q.material.name || ''); im.frustumCulled = true;
    if (P.mesh) { root.remove(P.mesh); P.mesh.dispose(); }
    P.mesh = im; P.cap = cap; root.add(im); P.dirty = true;
  }
  function flush() {
    for (const P of pools.values()) {
      if (!P.dirty) continue; P.dirty = false;
      if (P.items.length > P.cap) grow(P, Math.max(P.cap * 2, P.items.length + 32));
      const im = P.mesh;
      P.items.forEach((it, i) => { it._slot.set(P, i); im.instanceMatrix.array.set(it.hidden ? ZERO : it.mat, i * 16); if (P.colors) im.setColorAt(i, it.vc); });
      im.count = P.items.length; im.instanceMatrix.needsUpdate = true; if (P.colors && im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0).elements;
  function setMatrix(it, m) {
    if (m) it.mat = m.toArray ? m.toArray() : m; it.hidden = !m;
    for (const [P, i] of it._slot) { if (P.items[i] !== it) { P.dirty = true; continue; } P.mesh.instanceMatrix.array.set(it.hidden ? ZERO : it.mat, i * 16); P.mesh.instanceMatrix.needsUpdate = true; P.bsT = (P.bsT || 0) + 1; }
    clearTimeout(bsTimer); bsTimer = setTimeout(() => { for (const P of pools.values()) if (P.bsT) { P.bsT = 0; P.mesh.computeBoundingSphere(); } }, 400);
  }
  let bsTimer = 0;

  // texture layer with no repeat among the last few placed nearby (same model)
  function layerFor(name, x, z, seed, pool) {
    const vn = kit.variants?.[name], n = vn ? vn.n : 1; const cand = pool || [...Array(n).keys()];
    let k = Math.floor(hash(seed) * cand.length) % cand.length;
    for (let t = 0; t < cand.length; t++) { const l = cand[(k + t) % cand.length]; if (!recent.some((r) => r.name === name && r.l === l && (r.x - x) ** 2 + (r.z - z) ** 2 < 45 * 45)) { k = (k + t) % cand.length; break; } }
    const l = cand[k % cand.length]; recent.push({ name, l, x, z }); if (recent.length > 80) recent.shift(); return l;
  }
  // never in a lane: a spot closer to a road centerline than half its width + margin (+ the item's radius) is pushed out
  // across the road edge (lot spots are computed against the house, and lanes bend; the Keys audit caught carts in a lane)
  const ROAD_KEEP = /footway|path|cycleway|steps|pedestrian|track/;
  function offRoad(x, z, rad) {
    const G = game.city?.roadGraph; if (!G?.nearestEdge) return [x, z];
    for (let k = 0; k < 3; k++) { const r = G.nearestEdge(x, z, {}, 25); if (!r || ROAD_KEEP.test(r.edge.kind || '')) break;
      const dx = x - r.point.x, dz = z - r.point.z, d = Math.hypot(dx, dz), need = (r.edge.width || 6) / 2 + 0.55 + rad; if (d >= need) break;
      const ux = d > 1e-3 ? dx / d : -r.dir.z, uz = d > 1e-3 ? dz / d : r.dir.x; x = r.point.x + ux * need; z = r.point.z + uz * need; }
    return [x, z];
  }
  function place(owner, name, x, y, z, ry, seed, opts = {}) {
    const parts = kit.parts[name]; if (!parts) return null;
    [x, z] = offRoad(x, z, name.startsWith('mailbox') ? 0.15 : 0.32);
    const s = opts.s ?? 1 + (hash(seed * 3.1) - 0.5) * 0.12, rx = opts.lean ? (hash(seed * 5.3) - 0.5) * opts.lean : 0, rz = opts.lean ? (hash(seed * 7.7) - 0.5) * opts.lean : 0;
    _e.set(rx, ry, rz, 'XYZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.setScalar(s));
    const vn = kit.variants?.[name], it = { name, x, y, z, ry, rx, rz, s, seed, mat: _m.toArray(), _slot: new Map(), owner, vc: null };
    if (vn) { const l = opts.layer ?? layerFor(name, x, z, seed, opts.layers); it.vc = variantColor(l, 0.9 + hash(seed * 11.3) * 0.18, hash(seed * 13.7) < 0.3 ? hash(seed * 2.9) * 0.3 : 0, new THREE.Color()); }
    for (const q of parts) { const P = poolFor(q, !!(vn && q.material === vn.material)); P.items.push(it); P.dirty = true; }
    // physics: carts are pushable bodies, mailbox posts snap under a car
    const ph = physOf(name, parts);
    if (ph && ph.cls !== 'static' && dynProps.enabled) it.rec = dynProps.add({ kind: name.startsWith('mailbox') ? 'mailbox' : 'bin', cls: ph.cls, x, y, z, ry, rx, rz, s, shapes: ph.shapes, mass: ph.mass, friction: ph.friction, owner: 'lot:' + owner, setMatrix: (m) => setMatrix(it, m), save: (m) => { it.mat = m; } });
    else if (ph && game.world && game.RAPIER) { // static: a fixed body with the measured shapes
      try { const R = game.RAPIER, b = game.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }));
        for (const sh of ph.shapes) game.world.createCollider((sh.t === 'box' ? R.ColliderDesc.cuboid(sh.hx * s, sh.hy * s, sh.hz * s) : R.ColliderDesc.cylinder(sh.hh * s, sh.r * s)).setTranslation((sh.x || 0) * s, (sh.y || 0) * s, (sh.z || 0) * s), b);
        it.fixed = b; } catch (e) { /* no collider */ } }
    stats.items++;
    try { occupancy.add({ x, z, r: name.startsWith('mailbox') ? 0.25 : 0.33, y, h: 1.2, kind: name.startsWith('mailbox') ? 'mailbox' : 'bin', src: 'lotProps.v2.js', owner: 'lot:' + owner }); } catch (e) { /* */ }
    return it;
  }
  function add(owner, list) {
    if (owners.has(owner)) remove(owner);
    const out = []; owners.set(owner, out); stats.owners++;
    // collection day per street side (owner + rough position): the carts are out at the curb, else beside the house
    for (const L of list) {
      const seed = L.seed ?? hash(L.x * 0.37 + L.z * 1.91) * 1e5;
      // two lot sources can describe the same house (spawn street + map footprint): one mailbox / one cart pair per spot
      const taken = (kind, r) => { for (const [o, its] of owners) { if (o === owner) continue; for (const it of its) if (it.kindTag === kind && (it.x - L.x) ** 2 + (it.z - L.z) ** 2 < r * r) return true; } return false; };
      if ((L.kind === 'mailbox' && taken('mailbox', 7)) || (L.kind === 'carts' && taken('carts', 4))) continue;
      if (L.kind === 'mailbox') {
        const twin = hash(seed * 1.3) < 0.1, name = twin ? 'mailbox_twin' : 'mailbox_post';
        // the post mailbox model's door faces its local +X: turn it so the door faces the street
        const it = place(owner, name, L.x, L.y, L.z, L.ry + (twin ? 0 : -Math.PI / 2), seed, { lean: 0.045 });
        if (it) { it.kindTag = 'mailbox'; out.push(it); stats.mailboxes++; }
      } else if (L.kind === 'carts') {
        // beside the house only where that spot is open ground: not under a stilt deck / stairs (a collider overhead) and not
        // inside yard planting (occupancy index); otherwise the pair stays out at the curb
        const sideOk = (q) => { if (!q) return false; if (occupancy.blocked(q.x, q.z, 0.55, { y: q.y ?? L.y, h: 1.1 })) return false;
          try { const R = game.RAPIER, hit = game.world.castRay(new R.Ray({ x: q.x, y: (q.y ?? L.y) + 3.5, z: q.z }, { x: 0, y: -1, z: 0 }), 3.4, true); if (hit && 3.5 - hit.timeOfImpact > 0.35) return false; } catch (e) { /* */ }
          return true; };
        // collection day everywhere: the collider audit showed the 'beside the house' spots landing under stilt decks and in yard
        // planting (house colliders / shrubs are often not there yet when the lot is added), so the pair always stands at the curb
        const at = L;
        const wheel = hash(seed * 2.3) < 0.22, sx = Math.cos(at.ry), sz = -Math.sin(at.ry), gap = 0.36 + hash(seed * 4.1) * 0.25;
        const second = hash(seed * 6.7) < 0.75 ? CART_RECYCLE : CART_YARD;
        for (const [k, name, layers] of [[-1, wheel ? 'bin_wheel' : 'cart', wheel ? null : CART_TRASH], [1, 'cart', second]]) {
          const x = at.x + sx * k * gap, z = at.z + sz * k * gap, yaw = at.ry + (hash(seed * (k + 3)) - 0.5) * 0.35;
          const it = place(owner, name, x, at.y ?? L.y, z, yaw, seed * (k + 5), { lean: 0.03, layers });
          if (it) { it.kindTag = 'carts'; out.push(it); stats.carts++; }
        }
      } else if (L.kind === 'rolloff' || L.kind === 'chair' || L.kind === 'patio_table') {
        const it = place(owner, L.kind, L.x, L.y, L.z, L.ry, seed, { s: 1, lean: L.kind === 'chair' ? 0.04 : 0 }); if (it) out.push(it);
      }
    }
    flush();
    return out.length;
  }
  function remove(owner) {
    const out = owners.get(owner); if (!out) return;
    dynProps.removeOwner('lot:' + owner); try { occupancy.removeOwner('lot:' + owner); } catch (e) { /* */ }
    for (const it of out) { for (const P of pools.values()) { const i = P.items.indexOf(it); if (i >= 0) { P.items.splice(i, 1); P.dirty = true; } } if (it.fixed) { try { game.world.removeRigidBody(it.fixed); } catch (e) { /* */ } } stats.items--; if (it.kindTag === 'mailbox') stats.mailboxes--; else if (it.kindTag === 'carts') stats.carts--; }
    owners.delete(owner); stats.owners--; flush();
  }
  return { add, remove, stats, root, pools, owners };
}

let inst = null; const queue = [];
function get() {
  if (inst) return inst; const g = globalThis.game; if (OFF || !g || !g.scene || !g.city?.streetKit) return null;
  inst = create(g); if (inst) { g.lotProps = inst; for (const [o, l] of queue.splice(0)) inst.add(o, l); } return inst;
}
export const lotProps = {
  get enabled() { return !OFF; },
  add(owner, list) { const p = get(); if (p) return p.add(owner, list); if (!OFF) { queue.push([owner, list]); setTimeout(get, 500); } return 0; },
  remove(owner) { if (inst) inst.remove(owner); else { const i = queue.findIndex((q) => q[0] === owner); if (i >= 0) queue.splice(i, 1); } },
  get stats() { return inst ? inst.stats : null; },
};
