// Nico's house in the world (track: nico-house). Thin placement module: reads the anchor from the world layout
// (`setpieces.nico_house`: x, z, heading), builds the self-contained set piece there, creates its Rapier colliders,
// feeds its lights to the clustered lamp system and runs its interactions (E). Nothing here hard-codes world coordinates.
import { buildNicoHouse } from './index.js';
export const order = 65;   // after vegetation (60)

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
  const sea = game.city?.seaLevel ?? -0.12;
  const yGround = Number.isFinite(spot.y) ? spot.y : sea + 1.0;                 // the lot sits 1 m above the water
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
  const house = await buildNicoHouse(THREE, {
    seaY: sea - yGround,
    timeOfDay: game.timeOfDay,
    residentName: game.player?.fullName,
    vegetation: game.vegetation,
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

  game.nicoHouse = { house, group: g, anchors, spot, temporary, toWorld, spawn: anchors.spawn || null };
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
