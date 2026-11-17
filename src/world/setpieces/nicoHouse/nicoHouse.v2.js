// Nico's house in the world (track: nico-house). Thin placement module: reads the anchor from the world layout
// (`setpieces.nico_house`: x, z, heading), builds the self-contained set piece there, creates its Rapier colliders,
// feeds its lights to the clustered lamp system and runs its interactions (E). Nothing here hard-codes world coordinates.
import { buildNicoHouse, PLAN } from './index.js';
import { CAR_SPOTS, PLANTING } from './yard.data.js';
import { lots as houseLots } from '../houses/lots.js';
export const order = 65;   // after vegetation (60)
const KEYS_OFF = typeof location !== 'undefined' && /[?&]keys=0\b/.test(location.search);

export async function initV2(game) {
  const { THREE, RAPIER, world, scene } = game;
  // ---- where: layout.json, else a temporary spot (flagged in game.nicoHouse.temporary) ----
  let spot = null, temporary = false;
  try {
    const base = (import.meta.env?.BASE_URL ?? '/') + 'assets/world/layout.json';
    const d = await (await fetch(base, { cache: 'no-cache' })).json(), sp = d.setpieces ?? d.data?.setpieces;
    spot = Array.isArray(sp) ? sp.find((s) => s.id === 'nico_house') : sp?.nico_house;
    if (spot?.position) spot = { ...spot, x: spot.position.x ?? spot.position[0], z: spot.position.z ?? spot.position[2] ?? spot.position[1] };
  } catch (e) { /* no layout yet */ }
  if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.z)) { const s0 = game.city?.playerSpawn; spot = { x: (s0?.x ?? 0) + 60, z: (s0?.z ?? 0) + 60, heading: 0 }; temporary = true; console.warn('[nicoHouse] layout.json has no setpieces.nico_house: using a temporary spot'); }
  // keys pass: Nico's lot is hand dressed (yard.data.js); reserve it so the countryside scatter and the house generator keep out
  if (!temporary) try { const L = PLAN.lot, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2, c = Math.cos(spot.heading || 0), s = Math.sin(spot.heading || 0);
    houseLots.reserve({ x: spot.x + cx * c + cz * s, z: spot.z - cx * s + cz * c, hw: (L.x1 - L.x0) / 2, hd: (L.z1 - L.z0) / 2, ry: spot.heading || 0, id: 'nico_house' }); } catch (e) { /* lots module off */ }
  const sea = game.city?.seaLevel ?? -0.12;
  // ground-continuity: the yard sits flush on the ground around it (it used to float 1 m above the water on a 0.88 m ledge
  // with no sides); +4 cm keeps the yard sheet above the terrain's own surface without a step you notice
  const gAt = (x, z) => { const h = game.city?.groundHeightAt?.(x, z); return Number.isFinite(h) && !(game.city?.isWater?.(x, z)) ? h : null; };
  const gs = [gAt(spot.x, spot.z), gAt(spot.x + 12, spot.z), gAt(spot.x - 12, spot.z), gAt(spot.x, spot.z + 12), gAt(spot.x, spot.z - 12)].filter((v) => v !== null);
  const gcOff = typeof location !== 'undefined' && /[?&]groundfix=0/.test(location.search);
  const yGround = Number.isFinite(spot.y) ? spot.y : gs.length && !gcOff ? Math.max(sea + 0.1, gs.reduce((a, b) => a + b, 0) / gs.length) + 0.04 : sea + 1.0;
  // palms come from the shared vegetation system when it is up (wait briefly for vegetation:ready, else use our own)
  if (!game.vegetation && game.on) {
    await new Promise((res) => {
      const tm = setTimeout(res, 4000);
      game.on('vegetation:ready', () => {
        clearTimeout(tm);
        res();
      });
    });
  }
  // house-local helpers for the builder: water and ground height (relative to the yard grade) at a plan point
  const cH = Math.cos(spot.heading || 0), sH = Math.sin(spot.heading || 0);
  const toW = (lx, lz) => [spot.x + lx * cH + lz * sH, spot.z - lx * sH + lz * cH];
  const waterAt = game.city?.isWater ? (lx, lz) => { const [x, z] = toW(lx, lz); return !!game.city.isWater(x, z); } : null;
  const groundAt = (lx, lz) => { const [x, z] = toW(lx, lz); const h = game.city?.groundHeightAt?.(x, z); return Number.isFinite(h) ? h - yGround : 0; };
  // keys pass (Nov 17): the dock (part 06, the user's pier kit) runs from the sand at the foot of the bay stair out past the
  // real waterline: find the water along the dock line, then 13 m beyond it
  let dock = null;
  if (!gcOff && waterAt && !KEYS_OFF) {
    const X = 1.8; let zw = null; for (let lz = -9; lz > -160; lz -= 0.5) if (waterAt(X, lz) && waterAt(X, lz - 1.5) && waterAt(X, lz - 3)) { zw = lz; break; }
    if (zw !== null) dock = { ...PLAN.dock, kit: true, x: X, z1: zw + 0.2, zw, z0: zw - 12.5, y: 0.55 };   // starts at the waterline (lead review: nothing of the dock on the sand)
  }
  const house = await buildNicoHouse(THREE, {
    dock,
    seaY: sea - yGround,
    timeOfDay: game.timeOfDay,
    residentName: game.player?.fullName,
    vegetation: game.vegetation,
    game, waterAt, groundAt,
    skip: KEYS_OFF ? ['55_yard', '06_dock'] : undefined,   // ?keys=0: the house as it was before the keys pass (A/B)
  });
  const g = house.group; g.position.set(spot.x, yGround, spot.z); g.rotation.y = spot.heading || 0; g.updateMatrixWorld(true); scene.add(g);
  const toWorld = (v) => v.clone().applyMatrix4(g.matrixWorld), inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const qH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.heading || 0);

  // ---- colliders: one fixed body at the house origin, descriptors are house-local ----
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(spot.x, yGround, spot.z).setRotation({ x: qH.x, y: qH.y, z: qH.z, w: qH.w }));
  const live = new Map();
  for (const c of house.colliders) {
    try {
      const d = c.shape === 'box' ? RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2]) : RAPIER.ColliderDesc.cylinder(c.hh, c.r);
      d.setTranslation(c.p[0], c.p[1], c.p[2]).setRotation({ x: c.q[0], y: c.q[1], z: c.q[2], w: c.q[3] });
      const rc = world.createCollider(d, body); rc.setEnabled(c.enabled !== false); live.set(c, { rc, en: c.enabled !== false });
    } catch (e) { /* skip a bad descriptor */ }
  }

  // ---- anchors in world space ----
  const anchors = {};
  for (const [k, a] of Object.entries(house.anchors)) if (a?.pos) anchors[k] = { ...a, pos: toWorld(a.pos), heading: (a.heading || 0) + (spot.heading || 0) };

  // ---- lights -> clustered lamps (added / removed as they switch) ----
  const lampIds = new Map(), lp = new THREE.Vector3();
  const syncLights = () => { const lamps = game.env?.lamps; if (!lamps?.add) return;
    for (const l of house.lights) { const id = lampIds.get(l); if (l.on && id == null) { lp.set(...l.pos).applyMatrix4(g.matrixWorld); lampIds.set(l, lamps.add(lp.x, lp.y, lp.z, { color: l.color ?? 0xffd9a8, intensity: (l.intensity ?? 40) * 2.2, range: l.range ?? 8, gy: lp.y - 2.4 })); } else if (!l.on && id != null) { lamps.removeGroup?.(id); lampIds.delete(l); } } };

  // ---- interactions (E) ----
  const env = { game, emit: (n, d) => game.emit(n, d), notify: (t) => game.hud?.notify?.(t, 2500), timeOfDay: game.timeOfDay, camera: new THREE.Vector3(), player: new THREE.Vector3() };
  const P = game.player, fwd = new THREE.Vector3(); let near = null, lightT = 0, shownHelp = false;
  game.updaters.push(function nicoHouseTick(dt) {
    env.timeOfDay = game.timeOfDay; env.camera.copy(game.camera.position).applyMatrix4(inv); env.player.copy(P.position).applyMatrix4(inv);
    const dist = Math.hypot(env.player.x, env.player.z);
    g.visible = Math.hypot(env.camera.x, env.camera.z) < 900;
    if (!g.visible) return;
    house.update(dt, env);
    for (const [c, s] of live) { const en = c.enabled !== false; if (en !== s.en) { s.rc.setEnabled(en); s.en = en; } }
    lightT -= dt; if (lightT <= 0) { lightT = 0.5; syncLights(); }
    near = null;
    if (dist < 45 && !P.state.inVehicle && !game.ui?.paused) {
      fwd.set(Math.sin(P.heading), 0, Math.cos(P.heading)).applyQuaternion(qH.clone().invert()); let bs = 1e9;
      for (const it of house.interact) { if (it.enabled === false) continue; const dx = it.pos.x - env.player.x, dy = it.pos.y - (env.player.y + 1.2), dz = it.pos.z - env.player.z, d = Math.hypot(dx, dy, dz); if (d > (it.radius ?? 1.3)) continue; const face = (dx * fwd.x + dz * fwd.z) / (Math.hypot(dx, dz) || 1), sc = d - face * 0.6; if (face > -0.3 && sc < bs) { bs = sc; near = it; } }
    }
    if (near) { game.hud?.help?.(`Press <b>E</b>: ${typeof near.label === 'function' ? near.label() : near.label}`); shownHelp = true; if (game.input.pressed('KeyE') && !game.ui?.phoneOpen) { try { near.use(env); } catch (e) { console.error('[nicoHouse] interaction failed', e); } } }
    else if (shownHelp) shownHelp = false;
  });

  // ---- keys pass: yard planting through the vegetation helper, parked cars through the cars helper (yard.data.js) ----
  g.userData.shore = house.anchors.shore || [];
  if (!KEYS_OFF) try { plantYard(game, g); } catch (e) { console.warn('[nicoHouse] planting', e); }
  // parked cars: the cars helper places Nico's pickup and classic itself (src/vehicles/vehicles.js NICO_CARS); yard.data.js
  // CAR_SPOTS documents the mock-up spots and is kept clear of props
  const parked = [];
  game.nicoHouse = { house, group: g, anchors, spot, temporary, toWorld, spawn: anchors.spawn || null, parked, carSpots: CAR_SPOTS };
  // other tracks: game.nicoHouse.anchors.{spawn, bed, wardrobe, dock, carport, truck, bike, kayak, skiff, mailbox, hoop, hammock}
  // the player starts right next to the house (on the drive in front of the carport), following the lot in layout.json
  const sp = anchors.spawnYard || anchors.spawn;
  if (sp && !temporary && game.city) {
    game.city.playerSpawn = sp.pos.clone();
    game.city.playerSpawnHeading = sp.heading;
    if (!game.ready && !game.v2NoHouseSpawn) {
      try {
        game.teleport?.(sp.pos.x, sp.pos.y, sp.pos.z, sp.heading);
      } catch (e) {
        console.warn('[nicoHouse] spawn teleport failed', e);
      }
    }
  }
  game.emit('nicoHouse:ready', game.nicoHouse);
}

// Yard planting (yard.data.js PLANTING) in world space: game.vegetation.place(kind, x, z, opts) when the vegetation helper
// offers it, else one instanced field per kind (the shared vegetation LODs). Seeds and sizes are part of the data.
function plantYard(game, g) {
  const V = game.vegetation; if (!V) return;
  const T = game.THREE, byKind = new Map();
  for (const [kind, lx, lz, o = {}] of PLANTING) {
    const p = new T.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld), y = game.city?.groundHeightAt?.(p.x, p.z) ?? p.y;
    if (typeof V.place === 'function') { try { V.place(kind, p.x, p.z, { ...o, y, owner: 'nicoHouse' }); continue; } catch (e) { /* fall back to a field */ } }
    if (!V.kinds?.includes?.(kind)) continue;
    let l = byKind.get(kind); if (!l) byKind.set(kind, (l = [])); l.push({ x: p.x, y, z: p.z, ry: (lx * 7.1 + lz * 3.3) % 6.28, s: o.s || 1 });
  }
  // mangroves on the shore fringe at both ends of Nico's riprap (part 06 measured the waterline: anchors.shore, house-local)
  const shore = game.nicoHouse?.house?.anchors?.shore || g.userData.shore || [];
  for (const [lx, lz] of shore) { if (!(lx < -13 || lx > 7.5) || ((lx * 7) | 0) % 2) continue; const p = new T.Vector3(lx + 0.3, 0, lz + 0.9).applyMatrix4(g.matrixWorld), y = (game.city?.groundHeightAt?.(p.x, p.z) ?? 0) - 0.3;
    if (V.kinds?.includes?.('mangrove')) { let l = byKind.get('mangrove'); if (!l) byKind.set('mangrove', (l = [])); l.push({ x: p.x, y, z: p.z, ry: lx * 3.1, s: 0.7 + ((lx * 13) % 1 + 1) % 1 * 0.4 }); } }
  if (V.field) for (const [kind, items] of byKind) { try { V.field(kind, items, { variants: 2, seed: 17 }); } catch (e) { console.warn('[nicoHouse] field', kind, e); } }
}
