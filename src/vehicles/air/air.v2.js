// r4-air: flyable aircraft in the game (user: "make planes work: steal planes, seaplanes, jets, little prop planes at
// airports ... and an actual metal fence all around the airport"). ?air=0 disables all of it, ?airfence=0 only the fence.
//   Types (src/vehicles/air/types.js, the user's library models): Caloosa Skimmer 210 (high-wing prop), Matecumbe Skipjack
//   Float (floatplane), Biscayne Solstice 45 (business jet). Spawns: GA apron at Miami International (2 props, the
//   floatplane, the jet), a prop plane at the Key West airfield, a floatplane moored off Key Largo.
//   The parked airliners at the MIA gates stay static set dressing (src/world/miami/bldmodels.js, not flyable).
// Controls (in an aircraft): W / S throttle up / down (the lever stays where you leave it, shown as a bar on screen); the MOUSE is the stick (tilt: pitch and roll, springs back to centre); A / D roll (and nose-wheel / water-rudder steering), Q / E rudder,
//   K / I (or Numpad 5 / 8) pitch up / down, Space brakes, X / Z flaps down / up, G gear (jet), V camera, F exit (< 25 km/h).
// Vehicle kind 'aircraft' (game.vehicles.registerKind): F / E to enter like cars, stealing reports 'vehicle_theft'.
// Physics: src/vehicles/air/flight/sim.js (pure JS, kinematic Rapier body so cars and people collide with the plane,
// static-collider probes for crashes). VFX: src/vehicles/air/airfx.js. Fence: src/world/airport/fence.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AIR_TYPES } from './types.js';
import { createSim, stepSim, attitude } from './flight/sim.js';
import { createAirFx, makePropDisc } from './airfx.js';
import AIRPORT_DATA from '../../world/airport/airports.json';

export const order = 186;
const Q = typeof location !== 'undefined' ? location.search : '';
const OFF = /[?&]air=0\b/.test(Q), FENCE_OFF = /[?&]airfence=0\b/.test(Q);
const BASE = ((typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/') + 'assets/vehicles/air/';
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// airports (world layout.json): runway centerlines; spawn lists
const AIRPORTS = [
  { id: 'mia', name: 'Miami International', runways: [[[-2057, 528], [-792, 572]], [[-2002, 924], [-825, 1683]]], rect: [-2250, 330, -620, 1900],
    avoid: [[-1480, 1000, -1160, 1135]],   // terminal + gate stands
    spawn: ['prop', 'prop', 'floatplane', 'bizjet'] },
  { id: 'eyw', name: 'Key West International', runways: [[[-5225, 6446], [-4631, 5698]], [[-4818, 5522], [-4587, 6468]]], rect: [-5450, 5350, -4350, 6650], avoid: [], spawn: ['prop'] },
];
const MOORINGS = [{ id: 'keylargo', near: [-836, 5272], spawn: ['floatplane'] }];

export async function initV2(game) {
  if (OFF) return;
  const { scene, world, RAPIER } = game, city = game.city;
  if (!scene || !world || !RAPIER || !city?.groundHeightAt) return;
  const QF = RAPIER.QueryFilterFlags, STATIC_ONLY = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  const sea = () => city.seaLevel ?? -0.12;
  const fx = createAirFx(scene);
  const list = [];
  const loader = new GLTFLoader(), glbs = new Map();
  const loadGlb = (name) => {
    if (!glbs.has(name)) glbs.set(name, loader.loadAsync(BASE + name + '.glb').then((g) => {
      g.scene.traverse((o) => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
        for (const m of [].concat(o.material)) { if (m.metalness > 0.6) m.metalness = 0.6; if (m.map) m.map.anisotropy = 4; if (/transparent|glass|vitre|стекло/i.test(m.name)) { m.transparent = true; m.opacity = Math.min(m.opacity, 0.45); m.depthWrite = false; m.roughness = 0.08; m.metalness = 0.2; } } });
      return g.scene;
    }).catch((e) => { console.warn('[air] model missing', name, e?.message); return null; }));
    return glbs.get(name);
  };
  const wq = {   // world queries for the sim
    sea: sea(),
    ground: (x, z, y) => city.groundHeightAt(x, z, y),
    water: (x, z) => !!city.isWater?.(x, z),
    probe(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz); if (len < 1e-3) return null;
      try {
        const h = world.castRayAndGetNormal(new RAPIER.Ray({ x: a.x, y: a.y, z: a.z }, { x: dx / len, y: dy / len, z: dz / len }), len, true, STATIC_ONLY);
        if (!h) return null; const t = h.timeOfImpact ?? h.toi;
        return { point: new THREE.Vector3(a.x + dx / len * t, a.y + dy / len * t, a.z + dz / len * t), normal: new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z), depth: len - t + 0.05 };
      } catch (e) { return null; }
    },
  };

  // ---------------------------------------------------------------- aircraft object
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
  function makeGearVisual(T) {   // struts + wheels for the jet (its library model has no gear)
    const g = new THREE.Group(); g.name = 'air-gear';
    const strut = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 }), tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 }), hub = new THREE.MeshStandardMaterial({ color: 0x8d9195, metalness: 0.6, roughness: 0.4 });
    for (const gp of T.gear) {
      const r = gp.r || 0.3, [x, , z] = gp.p, top = T.gearH + 0.25;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, top - r, 10), strut); s.position.set(x, r + (top - r) / 2, z); g.add(s);
      for (const sx of gp.steer ? [-0.14, 0.14] : [-0.2, 0.2]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 20).rotateZ(Math.PI / 2), tire); w.position.set(x + sx, r, z); g.add(w);
        const hcap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.24, 14).rotateZ(Math.PI / 2), hub); hcap.position.copy(w.position); g.add(hcap);
      }
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8).rotateZ(Math.PI / 2), strut); axle.position.set(x, r, z); g.add(axle);
    }
    return g;
  }
  async function createAircraft(key, pos, heading, opts = {}) {
    const T = AIR_TYPES[key]; if (!T) return null;
    const src = await loadGlb(T.glb); if (!src) return null;
    const cg = new THREE.Vector3(...T.cg);
    const mesh = new THREE.Group(); mesh.name = 'air-' + key;
    const model = src.clone(true); model.position.set(-cg.x, (T.gearH || 0) - cg.y, -cg.z); mesh.add(model);
    let gearVis = null; if (T.gearH) { gearVis = makeGearVisual(T); gearVis.position.set(-cg.x, -cg.y, -cg.z); mesh.add(gearVis); }
    const nodes = {}; model.traverse((o) => { if (/^(PROP\d|AIL_L|AIL_R|ELEV|RUD)$/.test(o.name)) nodes[o.name] = o; });
    const discs = [];
    for (const p of T.props) { const n = nodes[p.node]; if (!n) continue; const d = makePropDisc(p.r); d.position.copy(n.position); d.position.z += 0.06; n.parent.add(d); discs.push({ n, d, a: 0 }); }
    for (const k of ['AIL_L', 'AIL_R', 'ELEV', 'RUD']) if (nodes[k]) nodes[k].userData.r0 = nodes[k].rotation.clone();
    scene.add(mesh);
    const S = createSim(T, pos, heading); S.ctl.brake = 1;
    // kinematic body: fuselage + wing boxes, so cars, people and the camera collide with it
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z).setRotation(S.q));
    const hh = T.half, wz = T.wing.z - cg.z;
    const fuseY = T.gearH ? T.gearH + 1.0 : T.floats ? 2.1 : hh[1];
    if (T.hit) {   // fitted boxes along the fuselage, tail, wings, floats and wheels (types.js: model frame, minus the CG)
      for (const h of T.hit) for (const sx of h[6] ? [1, -1] : [1]) world.createCollider(RAPIER.ColliderDesc.cuboid(h[3], h[4], h[5]).setTranslation(sx * h[0] - cg.x, h[1] - cg.y, h[2] - cg.z).setFriction(0.6), body);
    } else {
      world.createCollider(RAPIER.ColliderDesc.cuboid(hh[0], hh[1] * 0.75, hh[2]).setTranslation(0, fuseY - cg.y, -cg.z).setFriction(0.6), body);
      world.createCollider(RAPIER.ColliderDesc.cuboid(T.wing.span / 2, 0.12, T.wing.chord / 2).setTranslation(0, T.wing.y - cg.y, wz), body);
      if (T.floats) for (const sx of [1, -1]) world.createCollider(RAPIER.ColliderDesc.cuboid(0.35, 0.3, 2.6).setTranslation(sx * 0.95, 0.35 - cg.y, 1.45 - cg.z), body);
    }
    const A = {
      kind: 'aircraft', air: true, isAircraft: true, typeKey: key, T, S, mesh, body, nodes, discs, gearVis,
      name: `${T.brand} ${T.model}`, spec: { brand: T.brand, model: T.model, label: `${T.brand} ${T.model}`, air: true },
      model: { key, brand: T.brand, name: T.model, class: T.cls, engine: T.engine, idleRpm: T.idleRpm, maxRpm: T.maxRpm, gears: 1, sound: T.engine },
      health: 1000, disabled: false, locked: false, owned: !!opts.owned, stolen: false, playerDriven: false, active: false, rest: 0,
      speed: 0, speedKmh: 0, velocity: new THREE.Vector3(), position: mesh.position, rpm: 0, gear: 1, throttle: 0, load: 0, submerged: 0,
      home: opts.home || null, trails: null, camMode: 0, ap: null, engineOn: true,
      setControls(c) { this._mainCtl = c; },
      horn() {},
      exitPosition() { const p = new THREE.Vector3(T.exit[0] - cg.x, 0, T.exit[2] - cg.z).applyQuaternion(S.q).add(S.pos); p.y = city.groundHeightAt(p.x, p.z, S.pos.y); return p; },
      seatPosition() { return new THREE.Vector3(T.seat[0] - cg.x, T.seat[1] - cg.y, T.seat[2] - cg.z).applyQuaternion(S.q).add(S.pos); },
    };
    syncMesh(A, 0);
    list.push(A); game.emit?.('aircraft:spawned', { vehicle: A });
    return A;
  }
  function removeAircraft(A) {
    A.disposed = true; A.alive = false;   // main.js' enter/exit guard hook skips disposed vehicles (no access to a removed body)
    const i = list.indexOf(A); if (i >= 0) list.splice(i, 1);
    scene.remove(A.mesh); try { world.removeRigidBody(A.body); } catch (e) { /* */ }
    if (A.trails) for (const t of A.trails) fx.dropTrail(t);
    game.emit?.('aircraft:removed', { vehicle: A });
  }
  function syncMesh(A, dt) {
    const S = A.S, T = A.T;
    A.mesh.position.copy(S.pos); A.mesh.quaternion.copy(S.q);
    if (!A.active && S.onWater !== true && A.home?.water) A.mesh.position.y += Math.sin(game.clock.elapsed * 1.3 + A.mesh.id) * 0.04;
    // props: visible blades at low rpm, blur disc at speed
    for (const p of A.discs) {
      const spin = S.rpm * (T.maxRpm / 60) * Math.PI * 2;
      p.a += Math.min(spin, 60) * dt; p.n.rotation.z = p.a;
      const blur = clamp((S.rpm - 0.32) / 0.25, 0, 1);
      p.n.visible = blur < 0.95; p.d.visible = blur > 0.02; p.d.material.opacity = 0.85 * blur; p.d.rotation.z = -p.a * 0.07;
    }
    const n = A.nodes, c = S.ctl;
    const rot = (k, ax, a) => { const o = n[k]; if (!o) return; o.rotation.copy(o.userData.r0); o.rotation[ax] += a; };
    rot('AIL_L', 'x', -c.roll * 0.35); rot('AIL_R', 'x', c.roll * 0.35); rot('ELEV', 'x', c.pitch * 0.4); rot('RUD', 'y', c.yaw * 0.4);
    if (A.gearVis) { A.gearVis.visible = S.gearPos > 0.25; A.gearVis.position.y = -T.cg[1] + (1 - S.gearPos) * T.gearH * 0.9; }
  }

  // ---------------------------------------------------------------- spawn spots
  const groundRayOk = (x, z, r) => {   // nothing built over this footprint (hangars, bridges, lamp posts...)
    const gy = city.groundHeightAt(x, z);
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
      const px = x + a * r, pz = z + b * r;
      if (city.isWater?.(px, pz)) return false;
      const g2 = city.groundHeightAt(px, pz); if (Math.abs(g2 - gy) > 0.6) return false;
      let h = null; try { h = world.castRay(new RAPIER.Ray({ x: px, y: gy + 30, z: pz }, { x: 0, y: -1, z: 0 }), 40, true, STATIC_ONLY); } catch (e) { /* */ }
      if (h && gy + 30 - (h.timeOfImpact ?? h.toi) > g2 + 0.5) return false;
    }
    return true;
  };
  const distSeg = (x, z, [[ax, az], [bx, bz]]) => { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
  const coverAt = city.coverAt || city.data?.coverAt || null;
  function apronSpots(ap) {
    const [x0, z0, x1, z1] = ap.rect, out = [];
    for (let z = z0; z < z1; z += 12) for (let x = x0; x < x1; x += 12) {
      if (city.zoneAt(x, z) !== 'airport' && !(coverAt && /apron/.test(coverAt(x, z) || ''))) continue;
      const cv = coverAt ? coverAt(x, z) : '';
      const surf = city.surfaceAt?.(x, z) || '';
      if (coverAt ? !/apron|taxiway/.test(cv || '') : !/concrete|asphalt/.test(surf)) continue;
      if (ap.runways.some((r) => distSeg(x, z, r) < 110)) continue;
      if (ap.avoid.some(([a, b, c, d]) => x > a - 25 && x < c + 25 && z > b - 25 && z < d + 25)) continue;
      out.push({ x, z, cv });
    }
    return out;
  }
  function pickSpots(ap, cands, kinds) {
    // densest open patch of apron (most candidates within 70 m), planes in a row from there, nose toward the runway
    let best = null, bn = -1;
    for (const c of cands) { let n = 0; for (const d of cands) if (Math.abs(d.x - c.x) < 70 && Math.abs(d.z - c.z) < 70) n++; if (n > bn) { bn = n; best = c; } }
    if (!best) return [];
    const sorted = cands.slice().sort((a, b) => Math.hypot(a.x - best.x, a.z - best.z) - Math.hypot(b.x - best.x, b.z - best.z));
    const placed = [];
    for (const kind of kinds) {
      const R = kind === 'bizjet' ? 15 : 7.5;
      for (const c of sorted) {
        if (placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < p.R + R + 5)) continue;
        if (!groundRayOk(c.x, c.z, R)) continue;
        // nose toward the nearest runway (perpendicular), parked as on a GA line
        let rb = null, rd = 1e9; for (const r of ap.runways) { const d = distSeg(c.x, c.z, r); if (d < rd) { rd = d; rb = r; } }
        const [[ax, az], [bx, bz]] = rb, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
        const toward = ((ax - c.x) * nx + (az - c.z) * nz) > 0 ? 1 : -1;
        placed.push({ kind, x: c.x, z: c.z, R, heading: Math.atan2(nx * toward, nz * toward) });
        break;
      }
    }
    return placed;
  }
  function mooringSpot(m) {
    const [cx, cz] = m.near;
    let best = null, bd = 1e9;
    for (let r = 20; r < 700 && !best; r += 15) for (let a = 0; a < Math.PI * 2; a += 12 / r) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!city.isWater?.(x, z)) continue;
      let ok = true; for (let k = 0; k < 10 && ok; k++) { const b = k / 10 * Math.PI * 2; if (!city.isWater(x + Math.cos(b) * 16, z + Math.sin(b) * 16)) ok = false; }
      if (!ok || (city.seabedDepthAt?.(x, z) ?? 3) < 1.0) continue;
      let shore = false; for (let k = 0; k < 12 && !shore; k++) { const b = k / 12 * Math.PI * 2; if (!city.isWater(x + Math.cos(b) * 45, z + Math.sin(b) * 45)) shore = true; }
      if (!shore) continue;
      if (r < bd) { bd = r; best = { x, z, heading: a + Math.PI / 2 }; }
    }
    return best;
  }

  // ---------------------------------------------------------------- streaming (spawn near, drop far)
  const sites = [...AIRPORTS.map((a) => ({ ...a, kind: 'airport', cx: (a.rect[0] + a.rect[2]) / 2, cz: (a.rect[1] + a.rect[3]) / 2 })), ...MOORINGS.map((m) => ({ ...m, kind: 'mooring', cx: m.near[0], cz: m.near[1] }))];
  for (const s of sites) { s.state = 'idle'; s.planes = []; s.fence = null; s.tries = 0; s.next = 0; }
  async function populate(s) {
    s.state = 'busy';
    try {
      if (s.kind === 'airport') {
        if (city.collidersReadyAt && !city.collidersReadyAt(s.cx, s.cz) && s.tries++ < 20) { s.state = 'idle'; s.next = game.clock.elapsed + 3; return; }
        // GA ramp stands from the airport layout (src/world/airport/airports.json gaStands); the old apron scan as fallback
        const apd = AIRPORT_DATA.airports.find((a) => a.id === s.id), ga = apd?.gaStands || [];
        const spots = ga.length ? s.spawn.map((kind, i) => { const g = kind === 'bizjet' ? ga[ga.length - 1] : ga[Math.min(i, ga.length - 2)]; return g && { kind, x: g.x, z: g.z, heading: g.heading, R: kind === 'bizjet' ? 15 : 7.5 }; }).filter(Boolean) : pickSpots(s, apronSpots(s), s.spawn);
        s.spotInfo = spots;
        for (const p of spots) {
          const T = AIR_TYPES[p.kind], gy = city.groundHeightAt(p.x, p.z);
          const A = await createAircraft(p.kind, new THREE.Vector3(p.x, gy + T.cg[1] - 0.03, p.z), p.heading, { home: s });
          if (A) s.planes.push(A);
        }
      } else {
        const m = mooringSpot(s); s.spotInfo = m;
        if (m) for (const kind of s.spawn) { const T = AIR_TYPES[kind]; const A = await createAircraft(kind, new THREE.Vector3(m.x, sea() + T.cg[1] - 0.28, m.z), m.heading, { home: { ...s, water: true } }); if (A) s.planes.push(A); }
      }
      s.state = 'live';
    } catch (e) { console.error('[air] populate', s.id, e); s.state = 'failed'; }
  }
  // the perimeter fence is built by src/world/airport (airports.json airside polygon, gates, climbable)
  function streamSites() {
    const pp = game.player?.position; if (!pp) return;
    for (const s of sites) {
      const d = Math.hypot(pp.x - s.cx, pp.z - s.cz);
      // far away: hide only (never remove Rapier bodies at runtime: other systems may still hold the vehicle / handles)
      if (s.state === 'idle' && d < 1500 && game.clock.elapsed >= s.next) populate(s);
      if (s.state === 'live') for (const A of s.planes) { const show = d < 2800 || A.playerDriven || A.active; if (A.mesh.visible !== show) A.mesh.visible = show; }
    }
  }

  // ---------------------------------------------------------------- input, physics, effects
  const inp = game.input;
  const key = (c) => !!inp?.down?.(c);
  function readControls(A, dt) {
    const S = A.S, c = S.ctl, blocked = game.ui?.paused || game.ui?.phoneOpen;
    if (blocked) { c.pitch = c.roll = c.yaw = 0; return; }
    const W = key('KeyW'), Sk = key('KeyS');
    c.throttle = clamp(c.throttle + ((W ? 1 : 0) - (Sk ? 1 : 0)) * dt * 0.7, 0, 1);
    const ax = (a, b) => (key(a) ? 1 : 0) - (key(b) ? 1 : 0);
    const ease = (cur, want, r) => cur + clamp(want - cur, -r * dt, r * dt);
    // mouse = the stick (user: W/S only set the throttle, the camera/mouse does the tilt): mouse movement pushes a virtual stick
    // (right = roll right, up = nose up) that springs back to centre when the mouse stops; keys still work and add to it
    const st = A.stick || (A.stick = { x: 0, y: 0, idle: 0 });
    const mdx = inp.mouseDX || 0, mdy = inp.mouseDY || 0;
    if (mdx || mdy) { st.x = clamp(st.x + mdx * 0.0042, -1, 1); st.y = clamp(st.y - mdy * 0.0042, -1, 1); st.idle = 0; }
    else { st.idle += dt; if (st.idle > 0.12) { const k = Math.min(1, dt * 1.8); st.x -= st.x * k; st.y -= st.y * k; } }
    const keyRoll = ax('KeyD', 'KeyA'), keyPitch = (key('KeyK') || key('Numpad5') ? 1 : 0) - (key('KeyI') || key('Numpad8') ? 1 : 0);
    c.roll = ease(c.roll, clamp(keyRoll + st.x, -1, 1), 7);
    c.yaw = ease(c.yaw, ax('KeyE', 'KeyQ'), 4);
    c.pitch = ease(c.pitch, clamp(keyPitch + st.y, -1, 1), 7);
    c.brake = key('Space') ? 1 : S.onGround && c.throttle < 0.02 && S.vel.length() < 1 ? 1 : 0;
    if (inp.pressed?.('KeyX')) c.flaps = Math.min(1, c.flaps + 0.5);
    if (inp.pressed?.('KeyZ')) c.flaps = Math.max(0, c.flaps - 0.5);
    if (inp.pressed?.('KeyG') && A.T.retract && !(S.onGround && c.gearDown)) c.gearDown = !c.gearDown;
    if (inp.pressed?.('KeyV')) A.camMode = (A.camMode + 1) % 3;
  }
  let lastDriven = null;
  function fixed(h) {
    for (const A of list) {
      if (A.playerDriven && !A.active) A.active = true;
      if (!A.active) continue;
      const S = A.S;
      if (A.ap) { try { A.ap(A, S, h); } catch (e) { A.ap = null; console.error('[air] autopilot', e); } }
      else if (!A.playerDriven) { S.ctl.throttle = 0; S.ctl.brake = 1; S.ctl.pitch = S.ctl.roll = S.ctl.yaw = 0; }
      S.engineOn = A.playerDriven || !!A.ap;
      wq.sea = sea();
      stepSim(S, h / 2, wq); stepSim(S, h / 2, wq);
      if (!Number.isFinite(S.pos.x + S.pos.y + S.pos.z + S.q.x + S.vel.x)) { console.warn('[air] sim NaN, reset'); S.vel.set(0, 0, 0); S.w.set(0, 0, 0); S.q.identity(); S.pos.copy(A.mesh.position); }
      A.body.setNextKinematicTranslation({ x: S.pos.x, y: S.pos.y, z: S.pos.z }); A.body.setNextKinematicRotation({ x: S.q.x, y: S.q.y, z: S.q.z, w: S.q.w });
      for (const e of S.events) handleEvent(A, e);
      S.events.length = 0;
      const sp = S.vel.length();
      A.speed = S.vel.dot(_v.set(0, 0, 1).applyQuaternion(S.q)); A.speedKmh = sp * 3.6 * Math.sign(A.speed || 1); A.velocity.copy(S.vel);
      A.rpm = T_rpm(A); A.throttle = S.ctl.throttle; A.load = S.ctl.throttle; A.health = Math.round(1000 * (1 - S.damage)); A.submerged = S.submerged;
      // asleep again once at rest, nobody aboard
      if (!A.playerDriven && !A.ap) { A.rest = (sp < 0.15 && (S.onGround || S.onWater)) ? A.rest + h : 0; if (A.rest > 2.5) { A.active = false; S.vel.set(0, 0, 0); S.w.set(0, 0, 0); S.rpm = 0; } }
    }
  }
  const T_rpm = (A) => A.T.idleRpm + (A.T.maxRpm - A.T.idleRpm) * clamp((A.S.rpm - 0.28) / 0.72, 0, 1) * (A.S.rpm > 0.05 ? 1 : 0);
  function handleEvent(A, e) {
    const S = A.S;
    if (e.type === 'crash') game.emit?.('crash', { vehicle: A, impulse: e.speed * A.T.mass, dv: e.speed, speedKmh: e.speed * 3.6, point: e.point, byPlayer: A.playerDriven });
    else if (e.type === 'touchdown') game.emit?.('aircraft:touchdown', { vehicle: A, vs: e.vs, surface: e.water ? 'water' : 'ground' });
    if (e.type === 'damage') { (A.dmgLog ||= []).push([+S.t.toFixed(2), e.cause, +e.amount.toFixed(3)]); if (A.dmgLog.length > 30) A.dmgLog.shift(); }
    if (e.type === 'damage' && A.playerDriven && e.amount > 0.08) game.hud?.notify?.(S.damage > 0.7 ? 'Aircraft badly damaged' : 'Aircraft damaged', 1500);
    else if (e.type === 'destroyed') {
      A.disabled = true; A.engineOn = false;
      game.emit?.('explosion', { position: S.pos.clone(), radius: A.T.cls === 'jet' ? 14 : 8, source: A });
      game.emit?.('aircraft:destroyed', { vehicle: A, position: S.pos.clone(), cause: S.onWater ? 'water' : 'crash' });
      A.mesh.traverse((o) => { if (o.isMesh && !o.userData.burnt) { o.userData.burnt = true; o.material = [].concat(o.material).map((m) => { const c = m.clone(); c.color?.multiplyScalar(0.22); return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
      if (A.playerDriven) game.hud?.notify?.('Aircraft destroyed', 2500);
    }
  }
  const _p = new THREE.Vector3(), _w = new THREE.Vector3();
  function update(dt) {
    streamSites();
    const pv = game.player?.state?.vehicle;
    const driving = pv && pv.air ? pv : null;
    if (driving !== lastDriven) { onDriveChange(lastDriven, driving); lastDriven = driving; }
    if (driving && !driving.ap) readControls(driving, dt);
    const cam = game.camera, t = game.clock.elapsed;
    for (const A of list) {
      syncMesh(A, dt);
      if (!A.active) continue;
      const S = A.S, T = A.T, sp = S.vel.length();
      if (cam && A.mesh.position.distanceTo(cam.position) > 1500) continue;
      // exhaust (always faint; dark and thick when damaged), fire smoke when destroyed
      for (const e of T.exhaust) { _p.set(e[0] - T.cg[0], e[1] - T.cg[1], e[2] - T.cg[2]).applyQuaternion(S.q).add(S.pos); if (S.rpm > 0.05 || S.damage > 0.3) fx.emitSmoke(_p, S.vel, S.destroyed ? 1 : S.damage, S.rpm, dt); }
      // wingtip condensation: high G or high speed + humid sea air
      const cond = clamp((S.g - 1.5) / 1.6, 0, 1) * clamp((sp - 30) / 25, 0, 1) + clamp((sp - 62) / 30, 0, 0.35) + clamp((S.aoa - 0.1) / 0.15, 0, 0.5) * clamp((sp - 35) / 20, 0, 1);
      if (!A.trails && cond > 0.02) A.trails = [fx.trail(), fx.trail()];
      if (A.trails) T.tips.forEach((tp, i) => { _p.set(tp[0] - T.cg[0], tp[1] - T.cg[1], tp[2] - T.cg[2]).applyQuaternion(S.q).add(S.pos); fx.trailSample(A.trails[i], _p, Math.min(1, cond), t, dt); });
      // spray from the floats (and wheels / hull in the water)
      if (S.onWater && sp > 2.5) {
        const k = clamp((sp - 2.5) / 18, 0, 1) * (1 - clamp((sp - 34) / 10, 0, 0.7));
        for (const fl of S.floats.length ? S.floats.filter((f, i) => i < 2 && f.contact) : []) { _w.copy(fl.c).applyQuaternion(S.q).add(S.pos); _w.y = sea() + 0.05; fx.emitSpray(_w, S.vel, k, dt); }
      }
    }
    if (cam) fx.update(dt, cam, t);
    hudUpdate(driving);
  }

  // ---------------------------------------------------------------- enter / exit, theft, camera
  function onDriveChange(prev, cur) {
    if (prev) { prev.leftAt = game.clock.elapsed; prev.S.ctl.throttle = 0; prev.S.ctl.brake = 1; prev.S.ctl.pitch = prev.S.ctl.roll = prev.S.ctl.yaw = 0; prev.rest = 0; }
    if (cur) {
      cur.active = true; cur.S.engineOn = true; cur.S.ctl.brake = 0;
      if (!cur.owned && !cur.stolen) { cur.stolen = true; game.emit?.('crime', { type: 'vehicle_theft', position: cur.mesh.position.clone(), severity: 2, vehicle: cur }); game.hud?.notify?.('Stolen aircraft: ' + cur.name, 2200); }
      if (!game.cameraOverride || game.cameraOverride === airCam) { game.cameraOverride = airCam; camInit = false; }
    } else if (game.cameraOverride === airCam) { game.cameraOverride = null; restoreFov(); }
  }
  const camPos = new THREE.Vector3(), camFwd = new THREE.Vector3(0, 0, 1), camUp = new THREE.Vector3(0, 1, 0), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3(), _o = new THREE.Vector3();
  let camInit = false, orbitYaw = 0, orbitPitch = 0, lastMouse = 0, baseFov = null;
  const restoreFov = () => { const cam = game.camera; if (cam && baseFov) { cam.fov = baseFov; cam.updateProjectionMatrix(); } baseFov = null; };
  function airCam(dt, cam) {
    const A = game.player?.state?.vehicle;
    if (!A?.air) { if (game.cameraOverride === airCam) game.cameraOverride = null; restoreFov(); return false; }
    const S = A.S, T = A.T;
    if (baseFov === null) baseFov = cam.fov;
    _f.set(0, 0, 1).applyQuaternion(S.q); _u.set(0, 1, 0).applyQuaternion(S.q);
    // up: mostly the world's up in normal flight (horizon stays calm), the plane's own up in loops / inverted
    const wUp = clamp(1 - (Math.abs(_f.y) - 0.55) / 0.35, 0, 1) * (_u.y > 0.15 ? 1 : 0);
    const upDes = _t.copy(_u).lerp(_o.set(0, 1, 0), 0.75 * wUp).normalize();
    const k = 1 - Math.exp(-dt * (S.onGround || S.onWater ? 5 : 3.2));
    if (!camInit) { camFwd.copy(_f); camUp.copy(upDes); }
    camFwd.lerp(_f, k).normalize(); camUp.lerp(upDes, k); camUp.addScaledVector(camFwd, -camUp.dot(camFwd)).normalize();
    // mouse orbit (eases back behind the plane after 1.5 s)
    const sens = 0.0022 * (game.settings?.mouseSens || 1);
    if (!game.ui?.paused && (inp.mouseDX || inp.mouseDY)) { orbitYaw -= inp.mouseDX * sens; orbitPitch = clamp(orbitPitch + inp.mouseDY * sens, -0.6, 1.0); lastMouse = game.clock.elapsed; }
    if (game.clock.elapsed - lastMouse > 1.5) { orbitYaw *= Math.exp(-dt * 2); orbitPitch *= Math.exp(-dt * 2); }
    const sp = S.vel.length();
    const mode = A.camMode;
    if (mode === 2) {   // cockpit
      const seat = A.seatPosition();
      cam.position.copy(seat).addScaledVector(_u, 0.62).addScaledVector(_f, -0.05);
      cam.up.copy(_u); cam.lookAt(_p.copy(cam.position).addScaledVector(_f, 50));
      if (orbitYaw || orbitPitch) { cam.rotateY(orbitYaw); cam.rotateX(-orbitPitch * 0.6); }
    } else {
      const dist = T.chase.dist * (mode === 1 ? 1.9 : 1) * (1 + clamp(sp / 120, 0, 0.25)), hgt = T.chase.height * (mode === 1 ? 1.6 : 1);
      const back = _o.copy(camFwd).multiplyScalar(-dist).applyAxisAngle(camUp, orbitYaw);
      const side = _t.crossVectors(camUp, back).normalize();
      back.applyAxisAngle(side, -orbitPitch * 0.8);
      const want = _w.copy(S.pos).add(back).addScaledVector(camUp, hgt);
      const gy = city.isWater?.(want.x, want.z) ? sea() : city.groundHeightAt(want.x, want.z, want.y);
      if (want.y < gy + 1.2) want.y = gy + 1.2;
      if (!camInit) camPos.copy(want); else camPos.lerp(want, 1 - Math.exp(-dt * 9));
      cam.position.copy(camPos); cam.up.copy(camUp);
      cam.lookAt(_p.copy(S.pos).addScaledVector(camFwd, T.chase.dist * 0.35).addScaledVector(camUp, hgt * 0.32));
    }
    camInit = true;
    const fov = (baseFov || 60) + clamp((sp - 20) / 60, 0, 1) * 8;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 2); cam.updateProjectionMatrix(); }
    game.cameraYaw = Math.atan2(-camFwd.x, -camFwd.z); game.cameraPitch = 0.25;
    return true;
  }

  // ---------------------------------------------------------------- HUD: brand / model on the vehicle card (spec), altitude + throttle by the speedometer
  let hudEl = null, spEl = null, barEl = null;
  function hudUpdate(A) {
    if (!spEl || !spEl.isConnected) { spEl = document.querySelector('.ps-speedo'); if (hudEl && spEl) spEl.appendChild(hudEl); }
    const sp = spEl;
    if (!sp) return;
    if (!hudEl) {
      const st = document.createElement('style');
      st.textContent = `.ps-speedo.ps-air .ps-gear{opacity:0}.ps-air-read{position:absolute;right:6px;top:-24px;white-space:nowrap;font:600 12px/1.2 var(--ps-font, system-ui, sans-serif);letter-spacing:.08em;color:#f4f1ea;text-shadow:0 1px 2px rgba(0,0,0,.7);display:none;gap:12px}
.ps-speedo.ps-air .ps-air-read{display:flex}.ps-air-read b{font-weight:800;color:#fff}.ps-air-read .warn{color:#ff6a5c}`;
      document.head.appendChild(st);
      hudEl = document.createElement('div'); hudEl.className = 'ps-air-read'; sp.appendChild(hudEl);
    }
    sp.classList.toggle('ps-air', !!A);
    // throttle lever on screen: a vertical bar that stays where the lever is set (W / S move it), plus the mouse stick marker
    if (!barEl) {
      const st2 = document.createElement('style');
      st2.textContent = `.ps-thr{position:fixed;left:28px;top:50%;transform:translateY(-50%);width:46px;display:none;flex-direction:column;align-items:center;gap:8px;z-index:30;pointer-events:none;font:700 11px/1 var(--ps-cond, system-ui, sans-serif);letter-spacing:.14em;color:#f3ede2;text-shadow:0 1px 2px rgba(0,0,0,.8)}
.ps-thr.on{display:flex}.ps-thr .trk{position:relative;width:16px;height:190px;border-radius:9px;background:rgba(8,12,20,.62);box-shadow:inset 0 0 0 1px rgba(243,237,226,.28);overflow:hidden}
.ps-thr .fill{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(0deg,#d462ff,#ff8ad9);border-radius:9px;transition:height .08s linear}
.ps-thr .tick{position:absolute;left:0;right:0;height:1px;background:rgba(243,237,226,.35)}
.ps-thr .val{font-size:15px;letter-spacing:.06em}`;
      document.head.appendChild(st2);
      barEl = document.createElement('div'); barEl.className = 'ps-thr';
      barEl.innerHTML = '<div class="val">0%</div><div class="trk"><div class="fill"></div><div class="tick" style="bottom:25%"></div><div class="tick" style="bottom:50%"></div><div class="tick" style="bottom:75%"></div></div><div>THR</div>';
      document.body.appendChild(barEl);
    }
    barEl.classList.toggle('on', !!A);
    if (!A) return;
    { const th = clamp(A.S.ctl.throttle, 0, 1); const pc = Math.round(th * 100); if (barEl._p !== pc) { barEl._p = pc; barEl.querySelector('.fill').style.height = pc + '%'; barEl.querySelector('.val').textContent = pc + '%'; } }
    const S = A.S, alt = Math.max(0, Math.round(S.agl)), thr = Math.round(S.ctl.throttle * 100);
    const txt = `ALT <b>${alt}</b> m&nbsp;&nbsp;THR <b>${thr}</b>%${S.ctl.flaps > 0.05 ? '&nbsp;&nbsp;FLAPS' : ''}${A.T.retract ? (S.ctl.gearDown ? '&nbsp;&nbsp;GEAR' : '') : ''}${S.stall > 0.3 ? '&nbsp;&nbsp;<span class="warn">STALL</span>' : ''}`;
    if (hudEl._t !== txt) { hudEl._t = txt; hudEl.innerHTML = txt; }
  }

  // ---------------------------------------------------------------- registration + debug API
  const impl = {
    types: Object.keys(AIR_TYPES).map((k) => 'plane_' + k).concat(['plane', 'seaplane', 'jet']), list,
    spawn(type, pos, heading = 0, opts = {}) {
      const k = AIR_TYPES[type] ? type : type === 'seaplane' ? 'floatplane' : type === 'jet' ? 'bizjet' : String(type || '').replace(/^plane_/, '') in AIR_TYPES ? String(type).replace(/^plane_/, '') : 'prop';
      const p = pos || game.player.position; const T = AIR_TYPES[k];
      const water = city.isWater?.(p.x, p.z);
      return createAircraft(k, new THREE.Vector3(p.x, (water ? sea() - 0.28 : city.groundHeightAt(p.x, p.z)) + T.cg[1], p.z), heading, opts);
    },
    remove: removeAircraft,
    nearest(pos, maxDist) { let best = null, bd = maxDist; for (const A of list) { if (A.disabled) continue; const d = hullDist(A, pos); if (d < bd) { bd = d; best = A; } } return best; },
    distance: (A, pos) => hullDist(A, pos),
    update, fixed,
  };
  function hullDist(A, pos) {   // 2D distance to the fuselage box (cabin doors), so you board from beside the cockpit
    const S = A.S, T = A.T; _q.copy(S.q).invert();
    const l = _v.set(pos.x - S.pos.x, 0, pos.z - S.pos.z).applyQuaternion(_q);
    const cz = T.seat[2] - T.cg[2];
    const dx = Math.max(0, Math.abs(l.x) - T.half[0]), dz = Math.max(0, Math.abs(l.z - cz) - 1.6);
    return Math.hypot(dx, dz) + (Math.abs(pos.y - S.pos.y) > 6 ? 99 : 0);
  }
  game.vehicles?.registerKind?.('aircraft', impl);
  game.air = { list, types: AIR_TYPES, fx, sites, spawn: impl.spawn, remove: removeAircraft, attitude: (A) => attitude(A.S), fenceStats: () => game.airport?.fenceStats?.() || [] };
}
