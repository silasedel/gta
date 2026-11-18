// Nico's house in the world (track: nico-house). Thin placement module: reads the anchor from the world layout
// (`setpieces.nico_house`: x, z, heading), builds the self-contained set piece there, creates its Rapier colliders,
// feeds its lights to the clustered lamp system and runs its interactions (E). Nothing here hard-codes world coordinates.
import { buildNicoHouse, PLAN } from './index.js';
import { CAR_SPOTS, PLANTING, LITTER, DRIVE, DRIVE_PUDDLE } from './yard.data.js';
import { patchPuddles } from '../../ground/puddles.js';
import { lots as houseLots } from '../houses/lots.js';
// r2-perf: the yard ground collider as a triangle mesh with the SAME vertices and cell triangulation as the heightfield
// descriptor. Rapier's heightfield has no BVH, so the player's character controller paid ~2.2 ms per call standing in the
// yard (3 calls a frame at the spawn: ~7 ms); the trimesh is ~0.13 ms. Same surface. ?hftri=0 = the heightfield (A/B).
const HF_TRI = !(typeof location !== 'undefined' && /[?&]hftri=0\b/.test(location.search));
function hfTrimesh(RAPIER, c) {
  const nr = c.nrows, nc = c.ncols, sx = c.scale[0], sy = c.scale[1], sz = c.scale[2], H = c.heights;
  const v = new Float32Array((nr + 1) * (nc + 1) * 3), idx = new Uint32Array(nr * nc * 6);
  // heights are column-major: (row i along z, column j along x) at j * (nr + 1) + i, centred on the collider origin
  for (let j = 0; j <= nc; j++) for (let i = 0; i <= nr; i++) { const k = j * (nr + 1) + i; v[k * 3] = (j / nc - 0.5) * sx; v[k * 3 + 1] = H[k] * sy; v[k * 3 + 2] = (i / nr - 0.5) * sz; }
  let o = 0;
  for (let j = 0; j < nc; j++) for (let i = 0; i < nr; i++) {
    const a = j * (nr + 1) + i, b = a + 1, cc = a + (nr + 1), d = cc + 1; // a (i,j)  b (i+1,j)  cc (i,j+1)  d (i+1,j+1)
    idx[o++] = a; idx[o++] = b; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = cc;
  }
  return RAPIER.ColliderDesc.trimesh(v, idx);
}

export const order = 65;   // after vegetation (60)
const KEYS_OFF = typeof location !== 'undefined' && /[?&]keys=0\b/.test(location.search);
export const HOUSE_YAW = 0.72;   // rad, house frame vs the layout's street frame (see initV2)

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
  // r2-keys (Nov 17, user review item 16): the house is turned HOUSE_YAW within its lot so that, from the west deck corner, the
  // view runs diagonally across the yard to the STOP corner of Pelican Point Ln exactly as in the front-deck mock-up (the
  // corner lot now fronts the east leg; the west leg runs down its west side). layout.json keeps the street frame:
  // spot.streetHeading (the neighbors in keysStreet.data.js and the dock line are in that frame); spot.heading is the house frame.
  // ?nhyaw=<rad> overrides the turn (0 = the house as it stood before).
  { const q = typeof location !== 'undefined' && /[?&]nhyaw=(-?[\d.]+)/.exec(location.search), yaw = temporary ? 0 : q ? +q[1] : HOUSE_YAW;
    spot = { ...spot, streetHeading: spot.heading || 0, heading: (spot.heading || 0) + yaw, yaw }; }
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
  // road ribbons (lead review): yard plants and weeds are rejected at the source inside any lane (+ pad), not only by the shader mask
  const roadClear = (lx, lz, pad = 0.3) => { const [x, z] = toW(lx, lz); let r = null; try { r = game.city?.roadGraph?.nearestEdge?.(x, z, {}, 25); } catch (e) { /* */ } if (!r || !r.edge) return true; return Math.hypot(r.point.x - x, r.point.z - z) > r.edge.width / 2 + pad; };
  // r2-keys: distance from the nearest asphalt edge (m, negative on the road); the yard sheet sinks under the road edges with it
  const roadDist = (lx, lz) => { const [x, z] = toW(lx, lz); let r = null; try { r = game.city?.roadGraph?.nearestEdge?.(x, z, {}, 25); } catch (e) { /* */ } if (!r || !r.edge) return 25; return Math.hypot(r.point.x - x, r.point.z - z) - r.edge.width / 2; };
  const groundAt = (lx, lz) => { const [x, z] = toW(lx, lz); const h = game.city?.groundHeightAt?.(x, z); return Number.isFinite(h) ? h - yGround : 0; };
  // keys pass (Nov 17): the dock (part 06, the user's pier kit) runs from the sand at the foot of the bay stair out past the
  // real waterline: find the water along the dock line, then 13 m beyond it
  // r2-keys: the dock line keeps its world direction (straight out into the bay pocket, in the STREET frame) when the house is
  // turned; part 06 builds it in that frame (dock.yaw) at X, the street-frame x of the bay stair's foot
  let dock = null;
  if (!gcOff && waterAt && !KEYS_OFF) {
    const Y = spot.yaw || 0, cy = Math.cos(Y), sy = Math.sin(Y), wS = (sx, sz) => waterAt(sx * cy - sz * sy, sx * sy + sz * cy);   // street -> house frame
    const X = Y ? -3.6 : 1.8; let zw = null; for (let lz = -9; lz > -160; lz -= 0.5) if (wS(X, lz) && wS(X, lz - 1.5) && wS(X, lz - 3)) { zw = lz; break; }
    if (zw !== null) dock = { ...PLAN.dock, kit: true, x: X, z1: zw + 0.2, zw, z0: zw - 12.5, y: 0.4, yaw: Y };   // starts at the waterline (lead review: nothing of the dock on the sand)
  }
  const house = await buildNicoHouse(THREE, {
    dock,
    seaY: sea - yGround,
    timeOfDay: game.timeOfDay,
    residentName: game.player?.fullName,
    vegetation: game.vegetation,
    game, waterAt, groundAt, roadClear, roadDist,
    skip: KEYS_OFF ? ['55_yard', '06_dock'] : undefined,   // ?keys=0: the house as it was before the keys pass (A/B)
  });
  const g = house.group; g.position.set(spot.x, yGround, spot.z); g.rotation.y = spot.heading || 0; g.updateMatrixWorld(true); scene.add(g);
  const toWorld = (v) => v.clone().applyMatrix4(g.matrixWorld), inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  // r2-keys: the after-rain puddle at the end of the drive is standing water on the yard sheet itself (r2-ground patchPuddles: fills
  // while it rains, shrinks toward the low spot part 05 sculpts there as the weather dries, soaked rim)
  if (!KEYS_OFF) try { let ym = null; g.traverse((o) => { if (!ym && o.isMesh && o.parent?.name === 'nh_site' && /^ground:pbr:shell_floor_01/.test(o.material?.name || '')) ym = o.material; });
    if (ym) { const p = new THREE.Vector3(DRIVE_PUDDLE.x, 0, DRIVE_PUDDLE.z).applyMatrix4(g.matrixWorld); patchPuddles(ym, [{ x: p.x, z: p.z, r: DRIVE_PUDDLE.r }]); ym.needsUpdate = true; } } catch (e) { console.warn('[nicoHouse] puddle', e); }
  const qH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.heading || 0);

  // ---- colliders: one fixed body at the house origin, descriptors are house-local ----
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(spot.x, yGround, spot.z).setRotation({ x: qH.x, y: qH.y, z: qH.z, w: qH.w }));
  const live = new Map();
  for (const c of house.colliders) {
    try {
      const d = c.shape === 'box' ? RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2]) : c.shape === 'hf' ? (HF_TRI ? hfTrimesh(RAPIER, c) : RAPIER.ColliderDesc.heightfield(c.nrows, c.ncols, c.heights, { x: c.scale[0], y: c.scale[1], z: c.scale[2] })) : RAPIER.ColliderDesc.cylinder(c.hh, c.r);   // hf: yard ground (part 05)
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
  const env = { game, emit: (n, d) => game.emit(n, d), notify: (t) => game.hud?.notify?.(t, 2500), timeOfDay: game.timeOfDay, camera: new THREE.Vector3(), camDir: new THREE.Vector3(), player: new THREE.Vector3() };
  const P = game.player, fwd = new THREE.Vector3(); let near = null, lightT = 0, shownHelp = false;
  game.updaters.push(function nicoHouseTick(dt) {
    env.timeOfDay = game.timeOfDay; env.camera.copy(game.camera.position).applyMatrix4(inv); game.camera.getWorldDirection(env.camDir).transformDirection(inv); env.player.copy(P.position).applyMatrix4(inv);
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
  g.userData.yardY = house.yardY;
  if (!KEYS_OFF) try { plantYard(game, g); } catch (e) { console.warn('[nicoHouse] planting', e); }
  // r2-keys: the yard's matted-grass patches also get the ground helper's grass clumps (the user's Grass Clump / Moss models, r2-ground
  // grass.v2.js; queued if that module is not up yet). Not on the drive (the ruts stay bare)
  if (!KEYS_OFF) try { const T = THREE, dD = (x, z) => { let b = 1e9; const P = DRIVE.main; for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); b = Math.min(b, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return b; };
    const L = LITTER.filter(([x, z, , , k]) => k === 'matted' && dD(x, z) > DRIVE.halfWidth + 0.5).flatMap(([x, z, r, d], i) => { const out = [], n = 2 + (i % 3);   // QA first-minutes #19: each mat as 2-4 tight clumps with bare sand between, not one even scatter
      for (let k = 0; k < n; k++) { const a = i * 2.39 + k * 2.1, dd = r * (0.25 + 0.45 * ((i * 7 + k * 3) % 5) / 4), p = new T.Vector3(x + Math.cos(a) * dd, 0, z + Math.sin(a) * dd).applyMatrix4(g.matrixWorld);
        out.push({ x: p.x, z: p.z, r: r * (0.3 + 0.12 * ((i + k) % 3)), density: Math.min(1, d * 1.6), kind: (i + k) % 4 === 3 ? 'dry' : 'clump' }); } return out; });   // lead: denser, lower, greener mats
    for (const [cx, cz] of [[-14, 2], [-14, 18], [2, 2], [2, 18], [-6, 10]]) { const p = new T.Vector3(cx, 0, cz).applyMatrix4(g.matrixWorld); L.push({ x: p.x, z: p.z, r: 10, kind: 'clear' }); }   // QA #19: no automatic grass in the lot, only these hand-placed clumps
    if (L.length) { if (game.groundGrass?.patches) game.groundGrass.patches(L); else (game.groundGrassQueue ||= []).push(...L); } } catch (e) { console.warn('[nicoHouse] grass patches', e); }
  // parked cars: the cars helper places Nico's pickup and classic itself (src/vehicles/vehicles.js NICO_CARS); yard.data.js
  // CAR_SPOTS documents the mock-up spots and is kept clear of props
  const parked = [];
  // stair flights in world space for the player's foot IK: { o (top nosing, flight center), dir (downhill), side, w, n, rise, run, yTop }
  const stairs = (house.stairs || []).map((f) => { const o = toWorld(new THREE.Vector3(f.x, f.y, f.z)), dir = new THREE.Vector3(f.dir[0], 0, f.dir[1]).applyQuaternion(qH).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
    return { o, dir, side, w: f.w, n: f.n, rise: f.rise, run: f.run, yTop: o.y }; });
  game.nicoHouse = { house, group: g, anchors, spot, temporary, toWorld, spawn: anchors.spawn || null, parked, carSpots: CAR_SPOTS, stairs };
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
    // r2-keys: inside the lot the plants stand on the yard sheet (its swells), not on the terrain under it
    const yy = g.userData.yardY, p = new T.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld), y = yy ? g.position.y + yy(lx, lz) - 0.04 + (o.yOff || 0) : game.city?.groundHeightAt?.(p.x, p.z) ?? p.y;
    if (typeof V.place === 'function') { try { V.place(kind, p.x, p.z, { ...o, y, keepY: !!yy, owner: 'nicoHouse' }); continue; } catch (e) { /* fall back to a field */ } }
    if (!V.kinds?.includes?.(kind)) continue;
    let l = byKind.get(kind); if (!l) byKind.set(kind, (l = [])); l.push({ x: p.x, y, z: p.z, ry: (lx * 7.1 + lz * 3.3) % 6.28, s: o.s || 1 });
  }
  // mangroves on the shore fringe at both ends of Nico's riprap (part 06 measured the waterline: anchors.shore, house-local)
  const shore = game.nicoHouse?.house?.anchors?.shore || g.userData.shore || [];
  for (const [lx, lz] of shore) { if (!(lx < -13 || lx > 7.5) || ((lx * 7) | 0) % 2) continue; const p = new T.Vector3(lx + 0.3, 0, lz + 0.9).applyMatrix4(g.matrixWorld), y = (game.city?.groundHeightAt?.(p.x, p.z) ?? 0) - 0.3;
    if (V.kinds?.includes?.('mangrove')) { let l = byKind.get('mangrove'); if (!l) byKind.set('mangrove', (l = [])); l.push({ x: p.x, y, z: p.z, ry: lx * 3.1, s: 0.7 + ((lx * 13) % 1 + 1) % 1 * 0.4 }); } }
  if (V.field) for (const [kind, items] of byKind) { try { V.field(kind, items, { variants: 2, seed: 17 }); } catch (e) { console.warn('[nicoHouse] field', kind, e); } }
}
