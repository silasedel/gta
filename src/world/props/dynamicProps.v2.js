// Light street props that react like real objects (overnight props pass, Nov 17; track: props).
//   'push'  trash / recycling carts, cones, barricades, plastic chairs, crates: a Rapier DYNAMIC body that starts asleep.
//           Asleep it costs nothing (no contacts solved) and the prop keeps drawing from its instanced pool. The player's
//           character controller pushes it (kcc applyImpulsesToDynamicBodies), a car shoves it or sends it flying, it tips
//           over and can be pushed back up; once it sleeps again it stays where it ended up (pose kept on the item, so a
//           tile rebuild draws it there too).
//   'knock' mailboxes on posts, small sign posts: a FIXED collider (you cannot walk a post over) until a vehicle meets it
//           above ~6 km/h; then the post snaps and it becomes a dynamic body with the car's momentum. A slow bump only
//           bends it (a permanent lean).
// Heavy things (hydrants, lamps, dumpsters, bolted benches) stay static (hydrants keep src/world/miami/breakables.js).
//   import { dynProps } from '../props/dynamicProps.v2.js'
//   dynProps.add({ kind, cls, x, y, z, ry, rx?, rz?, s?, shapes, mass, owner, m?, setMatrix(Matrix4|null), save(m16) }) -> rec
//     shapes: colliders in the UNSCALED model frame (origin = base center, +Y up), matching the visible mesh:
//       { t: 'box', hx, hy, hz, x, y, z } | { t: 'cyl', r, hh, x, y, z }   (x/y/z = shape center). The body origin is the
//       model origin, so the drawn instance matrix is exactly the body pose (times the instance scale).
//     m = a saved pose matrix (array of 16) to start from (where the prop came to rest last time)
//   dynProps.removeOwner(owner); dynProps.stats; dynProps.near(x, z, r); game.dynProps (debug)
import * as THREE from 'three';

const CELL = 8;
const OFF = typeof location !== 'undefined' && /[?&](dynprops=0|clipfix=0)/.test(location.search);
const KNOCK_SPEED = 6 / 3.6, BEND_SPEED = 1.2;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _o = new THREE.Matrix4(), _p = new THREE.Vector3();

function create(game) {
  const { world, RAPIER } = game;
  const grid = new Map(), byOwner = new Map(), live = new Set();
  const stats = { items: 0, bodies: 0, awake: 0, knocked: 0, bent: 0, pushes: 0, syncMs: 0 };
  const key = (i, j) => i * 100003 + j;
  let soundT = 0;

  function poseOf(rec) { // base pose (Matrix4, unscaled) from a saved matrix or x/y/z + euler
    if (rec.m) { _m.fromArray(rec.m); _m.decompose(_v, _q, _s); return { pos: _v.clone(), q: _q.clone() }; }
    _e.set(rec.rx || 0, rec.ry || 0, rec.rz || 0, 'XYZ'); return { pos: new THREE.Vector3(rec.x, rec.y || 0, rec.z), q: new THREE.Quaternion().setFromEuler(_e) };
  }
  const volOf = (sh) => (sh.t === 'cyl' ? Math.PI * sh.r * sh.r * 2 * sh.hh : sh.t === 'cone' ? Math.PI * sh.r * sh.r * 2 * sh.hh / 3 : 8 * sh.hx * sh.hy * sh.hz);
  function shapeDescs(rec) { // scaled collider descs, local to the body (model origin)
    const s = rec.sc, tot = rec.shapes.reduce((a, sh) => a + volOf(sh), 0) * s * s * s, dens = Math.max(4, rec.mass / Math.max(1e-4, tot));
    return rec.shapes.map((sh) => (sh.t === 'cyl' ? RAPIER.ColliderDesc.cylinder(sh.hh * s, sh.r * s) : sh.t === 'cone' ? RAPIER.ColliderDesc.cone(sh.hh * s, sh.r * s) : RAPIER.ColliderDesc.cuboid(sh.hx * s, sh.hy * s, sh.hz * s))
      .setTranslation((sh.x || 0) * s, (sh.y || 0) * s, (sh.z || 0) * s).setFriction(rec.friction ?? 0.7).setRestitution(0.05).setDensity(dens));
  }
  function makeBody(rec, pos, q, sleeping) {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y + 0.004, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.2).setAngularDamping(0.45).setCanSleep(true).setSleeping(!!sleeping).setCcdEnabled(true));
    for (const d of shapeDescs(rec)) world.createCollider(d, b);
    rec.body = b; live.add(rec); stats.bodies++;
    return b;
  }
  function add(rec) {
    if (OFF || !world || !RAPIER || !Number.isFinite(rec.x) || !Number.isFinite(rec.z)) return null;
    const s = rec.s || 1; rec.sc = s; rec.mass = rec.mass || 15;
    if (!rec.shapes || !rec.shapes.length) rec.shapes = [{ t: 'box', hx: rec.hx || 0.25, hy: rec.hy || 0.5, hz: rec.hz || 0.25, y: rec.hy || 0.5 }];
    rec.top = Math.max(...rec.shapes.map((sh) => (sh.y || 0) + (sh.t === 'box' ? sh.hy : sh.hh))) * s; rec.rad = Math.max(...rec.shapes.map((sh) => Math.hypot(sh.x || 0, sh.z || 0) + (sh.t === 'box' ? Math.max(sh.hx, sh.hz) : sh.r))) * s;
    rec.cls = rec.cls || 'push';
    const { pos, q } = poseOf(rec);
    try {
      if (rec.cls === 'push') makeBody(rec, pos, q, true);
      else fixedColliders(rec, pos, q);
    } catch (e) { console.warn('[dynProps] add', e?.message); return null; }
    rec.k = key(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL)); rec.px = pos.x; rec.pz = pos.z; rec.py = pos.y;
    let a = grid.get(rec.k); if (!a) grid.set(rec.k, (a = [])); a.push(rec);
    if (rec.owner !== undefined) { let o = byOwner.get(rec.owner); if (!o) byOwner.set(rec.owner, (o = [])); o.push(rec); }
    stats.items++;
    return rec;
  }
  function fixedColliders(rec, pos, q) { // knock-class: the same shapes as a fixed rigid body (one handle, easy to move / drop)
    const fb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    for (const d of shapeDescs(rec)) world.createCollider(d, fb);
    rec.fixed = fb;
  }
  function dropFixed(rec) { if (rec.fixed) { try { if (world.getRigidBody(rec.fixed.handle) === rec.fixed) world.removeRigidBody(rec.fixed); } catch (e) { /* gone */ } rec.fixed = null; } }
  function drop(rec) {
    const a = grid.get(rec.k); if (a) { const i = a.indexOf(rec); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) grid.delete(rec.k); }
    if (rec.body) { try { if (world.getRigidBody(rec.body.handle) === rec.body) world.removeRigidBody(rec.body); } catch (e) { /* gone */ } rec.body = null; live.delete(rec); stats.bodies--; }
    dropFixed(rec);
    stats.items--; rec.dead = true;
  }
  function removeOwner(owner) { const o = byOwner.get(owner); if (!o) return; for (const rec of o) if (!rec.dead) { saveBack(rec); drop(rec); } byOwner.delete(owner); }
  // the item keeps its last resting pose (rec.save(m) writes it onto the tile / lot record)
  function saveBack(rec) { if (rec.body && rec.moved && rec.save) { try { rec.save(visualMatrix(rec).toArray()); } catch (e) { /* */ } } }
  function visualMatrix(rec) {
    const t = rec.body.translation(), r = rec.body.rotation();
    _q.set(r.x, r.y, r.z, r.w); _v.set(t.x, t.y, t.z);
    return _o.compose(_v, _q, _s.setScalar(rec.sc));
  }
  function knock(rec, vx, vz, speed) { // fixed post -> dynamic body moving with the car
    const { pos, q } = poseOf(rec);
    dropFixed(rec);
    rec.cls = 'push';
    const b = makeBody(rec, pos, q, false), k = 0.75 + Math.random() * 0.25;
    b.setLinvel({ x: vx * k, y: 1.2 + speed * 0.12, z: vz * k }, true);
    b.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 6 }, true);
    rec.moved = true; stats.knocked++;
    sound(rec, pos, 0.4);
    game.emit?.('propKnock', { kind: rec.kind, x: pos.x, z: pos.z, speed });
  }
  function bend(rec, vx, vz) { // slow bump: lean the post away from the car, a little, once or twice
    const { pos, q } = poseOf(rec), L = Math.hypot(vx, vz) || 1, ang = Math.min(0.32, (rec.bent || 0) + 0.12);
    rec.bent = ang; const axis = _v.set(vz / L, 0, -vx / L); const lean = new THREE.Quaternion().setFromAxisAngle(axis, ang);
    const q2 = lean.multiply(new THREE.Quaternion().setFromEuler(_e.set(0, rec.ry || 0, 0)));
    const m = new THREE.Matrix4().compose(pos, q2, _s.setScalar(rec.sc));
    rec.m = m.toArray(); rec.setMatrix?.(m); rec.save?.(rec.m);
    if (rec.fixed) { dropFixed(rec); fixedColliders(rec, pos, q2); }
    stats.bent++;
  }
  function sound(rec, at, vol) {
    if (soundT > 0) return; soundT = 0.12;
    try { game.audio?.play?.(rec.kind === 'mailbox' || rec.kind === 'signPost' ? 'door' : 'door', { position: at, volume: vol }); } catch (e) { /* optional */ }
  }

  const _cq = new THREE.Quaternion(), _ce = new THREE.Euler();
  const api = { paused: false };
  function update(dt) {
    if (api.paused) return; // perf A/B
    soundT -= dt;
    const t0 = performance.now();
    // knock-class posts: vehicles that reach them
    const list = game.vehicles?.list;
    if (list && grid.size) for (const v of list) {
      const b = v.body; if (!b || (b.isValid && !b.isValid())) continue;
      if (v.spec?.boat || v.isBoat || v.kind === 'boat' || v.type === 'heli' || v.type === 'plane') continue;
      const lv = b.linvel(), speed = Math.hypot(lv.x, lv.z); if (speed < BEND_SPEED) continue;
      const p = b.translation(), r = b.rotation(); _cq.set(r.x, r.y, r.z, r.w); _ce.setFromQuaternion(_cq, 'YXZ');
      const yaw = _ce.y, c = Math.cos(yaw), s = Math.sin(yaw), hl = (v.spec?.L || 4.6) / 2, hw = (v.spec?.W || 1.9) / 2, ahead = speed * Math.max(dt, 1 / 60) * 2 + 0.15;
      const R = hl + ahead + 1.5, i0 = Math.floor((p.x - R) / CELL), i1 = Math.floor((p.x + R) / CELL), j0 = Math.floor((p.z - R) / CELL), j1 = Math.floor((p.z + R) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = grid.get(key(i, j)); if (!a) continue;
        for (let k = a.length - 1; k >= 0; k--) {
          const rec = a[k]; if (rec.cls !== 'knock' || Math.abs(rec.py + rec.top / 2 - p.y) > 2.5) continue;
          const dx = rec.px - p.x, dz = rec.pz - p.z, lx = dx * c - dz * s, lz = dx * s + dz * c, rr = rec.rad;
          if (Math.abs(lx) < hw + rr && Math.abs(lz) < hl + rr + ahead) { if (speed >= KNOCK_SPEED) knock(rec, lv.x, lv.z, speed); else if ((rec.bent || 0) < 0.3 && !rec._bentBy?.has(v)) { (rec._bentBy ||= new WeakSet()).add(v); bend(rec, lv.x, lv.z); } }
        }
      }
    }
    // awake bodies: the instanced visual follows the body
    let awake = 0;
    for (const rec of live) {
      const b = rec.body; if (!b) continue;
      if (b.isSleeping()) { if (rec.awake) { rec.awake = false; rec.setMatrix?.(visualMatrix(rec)); saveBack(rec); const t = b.translation(); moveCell(rec, t.x, t.z); } continue; }
      if (!rec.awake) { rec.awake = true; rec.moved = true; stats.pushes++; const lv = b.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z); if (sp > 2.5) sound(rec, b.translation(), Math.min(0.5, 0.1 + sp * 0.03)); }
      awake++;
      const t = b.translation();
      if (t.y < rec.py - 30) { rec.setMatrix?.(null); drop(rec); continue; } // fell out of the world
      rec.setMatrix?.(visualMatrix(rec));
    }
    stats.awake = awake; stats.syncMs = +(performance.now() - t0).toFixed(3);
  }
  function moveCell(rec, x, z) {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL)); rec.px = x; rec.pz = z; if (k === rec.k) return;
    const a = grid.get(rec.k); if (a) { const i = a.indexOf(rec); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) grid.delete(rec.k); }
    rec.k = k; let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(rec);
  }
  function near(x, z, r) { const out = []; for (const a of grid.values()) for (const rec of a) if (Math.hypot(rec.px - x, rec.pz - z) < r) out.push(rec); return out; }
  if (game.updaters) game.updaters.push(update);
  return Object.assign(api, { add, removeOwner, update, near, stats, get count() { return stats.items; } });
}

let inst = null;
function get() { if (inst) return inst; const g = globalThis.game; if (!g || !g.world || !g.RAPIER) return null; inst = create(g); g.dynProps = inst; return inst; }
export const dynProps = {
  get enabled() { return !OFF && !!get(); },
  add(rec) { const d = get(); return d ? d.add(rec) : null; },
  removeOwner(owner) { if (inst) inst.removeOwner(owner); },
  near(x, z, r) { return inst ? inst.near(x, z, r) : []; },
  get stats() { return inst ? inst.stats : null; },
};
