// Breakable small street props (track: clipping sweep / X1). Bins, hydrants, sign posts, mailboxes, bushes and fence
// segments get their own cheap box collider (never part of a merged tile trimesh). A car that meets one above ~15 km/h
// knocks it over: the collider goes, the visual instance is hidden, 3-6 debris pieces fly (they sleep, and are removed
// after 20 s), a crunch plays, and the car takes a little damage and loses a little speed. Below that speed the box is
// solid, so a car never ends up inside a static prop.
//   import { breakables } from './breakables.js'; breakables.add({ x, y, z, hx, hy, hz, ry, kind, owner, hide, color }) -> rec
//   breakables.removeOwner(owner); breakables.stats. Uses the global game (window.game); its update runs as a game updater.
import { initHydrantSpray } from '../props/hydrantSpray.v2.js';
const BREAK_SPEED = 15 / 3.6, HYDRANT_SPEED = 28 / 3.6;
const CELL = 8;

export function createBreakables(game) {
  const THREE = game.THREE || globalThis.THREE, { world, RAPIER, scene } = game;
  const grid = new Map(), byOwner = new Map(), debris = [];
  const key = (i, j) => i * 100003 + j;
  const stats = { items: 0, broken: 0, debris: 0 };
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const mats = new Map();
  const matFor = (c) => { let m = mats.get(c); if (!m) mats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.15 }))); return m; };
  const COLORS = { bin: 0x2f5d50, hydrant: 0xd8261c, signPost: 0x8a9094, mailbox: 0x3a3e44, bush: 0x4f7a3a, fence: 0xd8d4c8, chain: 0xb8bab6 };

  function add(rec) {
    if (!world || !RAPIER || !Number.isFinite(rec.x) || !Number.isFinite(rec.z)) return null;
    const ry = rec.ry || 0;
    try {
      rec.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(rec.hx, rec.hy, rec.hz).setTranslation(rec.x, (rec.y || 0) + rec.hy, rec.z).setRotation({ x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) }));
    } catch (e) { return null; }
    rec.r = Math.hypot(rec.hx, rec.hz);
    rec.k = key(Math.floor(rec.x / CELL), Math.floor(rec.z / CELL));
    let a = grid.get(rec.k); if (!a) grid.set(rec.k, (a = [])); a.push(rec);
    if (rec.owner !== undefined) { let s = byOwner.get(rec.owner); if (!s) byOwner.set(rec.owner, (s = [])); s.push(rec); }
    stats.items++;
    return rec;
  }
  function drop(rec) {
    const a = grid.get(rec.k); if (a) { const i = a.indexOf(rec); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) grid.delete(rec.k); }
    if (rec.collider) { try { if (world.getCollider(rec.collider.handle) === rec.collider) world.removeCollider(rec.collider, false); } catch (e) { /* already gone */ } rec.collider = null; }
    stats.items--;
  }
  function removeOwner(owner) { const s = byOwner.get(owner); if (!s) return; for (const rec of s) if (rec.collider) drop(rec); byOwner.delete(owner); }

  function spawnDebris(rec, vx, vz, speed, car) {
    const n = 3 + ((Math.abs(Math.sin(rec.x * 12.9 + rec.z * 78.2)) * 4) | 0), col = rec.color ?? COLORS[rec.kind] ?? 0x888888;
    for (let i = 0; i < n; i++) {
      const sx = Math.min(0.55, Math.max(0.06, rec.hx * (0.4 + Math.random() * 0.6))), sy = Math.min(0.5, Math.max(0.06, rec.hy * (0.3 + Math.random() * 0.5))), sz = Math.min(0.3, Math.max(0.03, rec.hz * (0.4 + Math.random() * 0.6))); // boards / panels / lids, never a whole wall
      const m = new THREE.Mesh(boxG, matFor(col)); m.scale.set(sx * 2, sy * 2, sz * 2); m.castShadow = true;
      // pieces start clear of the car body (beside its flanks, never inside it: no depenetration launch)
      let px = rec.x + (Math.random() - 0.5) * rec.hx, py = (rec.y || 0) + rec.hy * (0.5 + i / n), pz = rec.z + (Math.random() - 0.5) * rec.hz, sideX = 0, sideZ = 0;
      if (car) { const lx = (px - car.x) * car.c - (pz - car.z) * car.s, lz = (px - car.x) * car.s + (pz - car.z) * car.c, sd = (lx >= 0 ? 1 : -1), nl = Math.max(Math.abs(lx), car.hw + 0.35 + sx);
        const lz2 = Math.min(lz, car.hl + 0.4); px = car.x + (sd * nl) * car.c + lz2 * car.s; pz = car.z - (sd * nl) * car.s + lz2 * car.c; sideX = sd * car.c; sideZ = -sd * car.s; }
      m.position.set(px, py, pz); scene.add(m);
      let body = null;
      try {
        body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(px, py, pz).setLinearDamping(0.3).setAngularDamping(0.4).setCanSleep(true));
        world.createCollider(RAPIER.ColliderDesc.cuboid(sx, sy, sz).setDensity(60).setFriction(0.8).setRestitution(0.15)
          , body);
        const k = 0.55 + Math.random() * 0.35;
        body.setLinvel({ x: vx * k + sideX * (1.5 + Math.random() * 2), y: 1.5 + Math.random() * 2.5 + speed * 0.08, z: vz * k + sideZ * (1.5 + Math.random() * 2) }, true);
        body.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
      } catch (e) { body = null; }
      debris.push({ m, body, t: 20 });
      stats.debris++;
    }
  }

  function breakIt(rec, v, speed, car) {
    drop(rec);
    if (rec.byOwner !== false && rec.owner !== undefined) { const s = byOwner.get(rec.owner); if (s) { const i = s.indexOf(rec); if (i >= 0) s.splice(i, 1); } }
    // r2-physics impacts (flag): the collider goes now (no solid hit), the visible break + momentum + damage when the car arrives
    if (game.physics?.impacts && game.physics.deferImpact && !car?.now) { game.physics.deferImpact(v, { x: rec.x, z: rec.z, r: Math.min(0.4, rec.r || 0.15) }, () => breakNow(rec, v, car), () => add(rec)); return; }
    breakNow(rec, v, car);
  }
  function breakNow(rec, v, car) {
    const speed = (() => { try { const l = v.body.linvel(); return Math.hypot(l.x, l.z); } catch (e) { return 0; } })();
    // r2-physics energy model: the car's kinetic energy at the contact decides; below the object's snap energy it is a rigid hit (the
    // impulse stops / deflects the car there) and the object stays standing with its collider back
    let imp = null;
    if (game.physics?.impacts && game.physics.propImpact) { imp = game.physics.propImpact(v, { kind: rec.kind, x: rec.x, y: rec.y || 0, z: rec.z, top: rec.hy * 2, broke: true }); if (imp && imp.broke === false) { add(rec); return; } }
    try { rec.hide && rec.hide(); } catch (e) { console.warn('[breakables] hide', e); }
    const lv = v.body.linvel();
    if (car && game.physics?.impacts) { try { const p = v.body.translation(), r = v.body.rotation(); const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x)); car = { ...car, x: p.x, z: p.z, c: Math.cos(yaw), s: Math.sin(yaw) }; } catch (e) { /* */ } }
    spawnDebris(rec, lv.x, lv.z, speed, car);
    const at = new THREE.Vector3(rec.x, (rec.y || 0) + rec.hy, rec.z);
    if (!game.physics?.impacts) try { if (game.audio?.play) game.audio.play(rec.kind === 'fence' || rec.kind === 'chain' ? 'door' : 'car_crash', { position: at, volume: rec.kind === 'bush' ? 0.15 : 0.35 }); } catch (e) { /* audio optional */ }
    // r2-physics impacts (flag): momentum from the object's mass + snap strength at the real contact point, damage where it hit
    if (!imp && !game.physics?.impacts) {
      const slow = rec.kind === 'bush' ? 0.96 : rec.kind === 'hydrant' ? 0.82 : 0.9;
      v.body.setLinvel({ x: lv.x * slow, y: lv.y, z: lv.z * slow }, true);
      try { v.damage?.(rec.kind === 'bush' ? 1 : rec.kind === 'hydrant' ? 12 : 5, null); } catch (e) { /* */ }
    }
    stats.broken++;
    game.emit?.('propBreak', { kind: rec.kind, point: at, vehicle: v });
  }

  const _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function update(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.t -= dt;
      if (d.body) { if (d.t <= 0 || !world.getRigidBody(d.body.handle)) { try { world.removeRigidBody(d.body); } catch (e) { /* */ } d.body = null; }
        else if (!d.body.isSleeping()) { const p = d.body.translation(), r = d.body.rotation(); d.m.position.set(p.x, p.y, p.z); d.m.quaternion.set(r.x, r.y, r.z, r.w); } }
      if (d.t <= 0) { scene.remove(d.m); debris.splice(i, 1); stats.debris--; }
    }
    const list = game.vehicles?.list; if (!list || !grid.size) return;
    for (const v of list) {
      const b = v.body; if (!b || (b.isValid && !b.isValid())) continue;
      if (v.spec?.boat || v.isBoat || v.kind === 'boat' || v.type === 'heli' || v.type === 'plane') continue;
      if (v.ai && !v.playerDriven && !v.chaseTarget) continue; // props pass: lane-following traffic never shears hydrants / snaps posts (it clips corners)
      const lv = b.linvel(), speed = Math.hypot(lv.x, lv.z); if (speed < (game.physics?.impacts ? 4 / 3.6 : BREAK_SPEED)) continue; // r2-physics energy model: it decides break vs rigid from ~4 km/h up
      const p = b.translation(), r = b.rotation(); _q.set(r.x, r.y, r.z, r.w); _e.setFromQuaternion(_q, 'YXZ');
      const yaw = _e.y, c = Math.cos(yaw), s = Math.sin(yaw), hl = (v.spec?.L || 4.6) / 2, hw = (v.spec?.W || 1.9) / 2, ahead = speed * Math.max(dt, 1 / 60) * 2.5 + 0.25;
      const R = hl + ahead + 2, i0 = Math.floor((p.x - R) / CELL), i1 = Math.floor((p.x + R) / CELL), j0 = Math.floor((p.z - R) / CELL), j1 = Math.floor((p.z + R) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = grid.get(key(i, j)); if (!a) continue;
        for (let k = a.length - 1; k >= 0; k--) {
          const rec = a[k]; if (Math.abs((rec.y || 0) + rec.hy - p.y) > 2.5) continue;
          const dx = rec.x - p.x, dz = rec.z - p.z, lx = dx * c - dz * s, lz = dx * s + dz * c; // car local: z forward
          if (rec.kind === 'hydrant' && speed < HYDRANT_SPEED && !game.physics?.impacts) continue; // props pass: a cast-iron hydrant only shears off in a real hit
          if (Math.abs(lx) < hw + rec.r * 0.8 && Math.abs(lz) < hl + rec.r * 0.8 + ahead) breakIt(rec, v, speed, { x: p.x, z: p.z, c, s, hw, hl });
        }
      }
    }
  }
  if (game.updaters) game.updaters.push(update);
  function near(x, z, r) { const out = []; for (const a of grid.values()) for (const rec of a) if (Math.hypot(rec.x - x, rec.z - z) < r) out.push(rec); return out; }
  return { add, removeOwner, update, near, stats, BREAK_SPEED };
}
// lazy singleton on the global game (tiles, world-dressing and set pieces all register into the same one)
let inst = null;
const OFF = typeof location !== 'undefined' && /[?&]clipfix=0/.test(location.search);
function get() { if (inst) return inst; const g = globalThis.game; if (!g || !g.world || !g.RAPIER || !g.scene) return null; inst = createBreakables(g); if (g) g.breakables = inst; try { initHydrantSpray(g); } catch (e) { /* optional */ } return inst; }
export const breakables = {
  get enabled() { return !OFF && !!get(); },
  add(rec) { const b = get(); return b ? b.add(rec) : null; },
  removeOwner(owner) { if (inst) inst.removeOwner(owner); },
  get stats() { return inst ? inst.stats : null; },
};
