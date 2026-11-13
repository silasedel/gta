// Optional activities (no story): taxi fares, deliveries, street races, store hit-list, armored-car intercepts,
// bounty targets, collectibles. Started from the phone (game.activities.list -> start()) or world triggers.
// Exposes game.activities = { list, active, waypoint, route, cancel(), start(id) } for the HUD (GPS line, phone app).
import * as THREE from 'three';
import { createCharacter } from '../player/characterModel.js';
import { rand, pick, sfx, tryCall, distXZ, groundAt, inView, removeBodySafe, vAlive } from './util.js';
import { createCellStreamer } from './stream.js';

const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
const NAMES = ['Rico "Two-Tone" Valdés', 'Marisol Cray', 'Dex Okafor', 'Lenny Shoals', 'Tavi Brandt', 'Corinne "Gator" Mays', 'Jules Ferro', 'Big Sal Ortega', 'Nadia Quill', 'Hollis Reef'];
const SHOPS = ['a corner bodega', 'a liquor store', 'a gas station', 'a pawn shop', 'a 24/7 mart'];

export function createActivities(game, G) {
  const { scene, world, RAPIER } = game;
  const P = game.player;
  const C = G.city;
  const A = { list: [], active: null, waypoint: null, route: null, stats: { taxiFares: 0, deliveries: 0, racesWon: 0, bounties: 0, shells: 0 } };
  game.activities = A;

  // ---------------------------------------------------------------- markers
  const beamGeo = new THREE.CylinderGeometry(0.9, 1.1, 40, 18, 1, true).translate(0, 20, 0);
  const ringGeo = new THREE.TorusGeometry(2.2, 0.12, 8, 40);
  function beamTex() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0.8)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c);
  }
  const BT = beamTex();
  const _mats = new Map();
  function cmat(kind, color, make) { const k = kind + color; let m = _mats.get(k); if (!m) { m = make(); _mats.set(k, m); } return m; }
  const _archGeo = new Map();
  function archGeo(width) { let g = _archGeo.get(width); if (!g) { g = { post: new THREE.BoxGeometry(0.35, 5, 0.35), top: new THREE.BoxGeometry(width, 0.4, 0.35), flag: new THREE.PlaneGeometry(width * 0.9, 0.8) }; _archGeo.set(width, g); } return g; }
  function marker(pos, color = 0xffd25a, opts = {}) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(beamGeo, cmat('beam', color, () => new THREE.MeshBasicMaterial({ map: BT, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.55, toneMapped: false })));
    beam.scale.set(opts.r || 1, opts.h || 1, opts.r || 1);
    const ring = new THREE.Mesh(ringGeo, cmat('ring', color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false })));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; ring.scale.setScalar(opts.r || 1);
    g.add(beam, ring);
    g.position.set(pos.x, (pos.y ?? C.groundHeight(pos.x, pos.z)) + 0.02, pos.z);
    scene.add(g);
    g.userData.ring = ring;
    return g;
  }
  function arch(pos, heading, color = 0x2fe0d0, width = 12) { // race checkpoint gate
    const g = new THREE.Group();
    const mat = cmat('arch', color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }));
    const AG = archGeo(width);
    const l = new THREE.Mesh(AG.post, mat), r = new THREE.Mesh(AG.post, mat), top = new THREE.Mesh(AG.top, mat);
    l.position.set(-width / 2, 2.5, 0); r.position.set(width / 2, 2.5, 0); top.position.set(0, 5, 0);
    const flag = new THREE.Mesh(AG.flag, cmat('flag', 0, () => new THREE.MeshBasicMaterial({ map: checkerTex(), transparent: true, side: THREE.DoubleSide, toneMapped: false })));
    flag.position.set(0, 4.4, 0);
    g.add(l, r, top, flag);
    g.position.set(pos.x, pos.y ?? C.groundHeight(pos.x, pos.z), pos.z); g.rotation.y = heading;
    scene.add(g);
    return g;
  }
  let _ck = null;
  function checkerTex() {
    if (_ck) return _ck;
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * 4, j * 4, 4, 4); }
    _ck = new THREE.CanvasTexture(c); _ck.magFilter = THREE.NearestFilter; return _ck;
  }
  const rm = (o) => { if (o) scene.remove(o); };

  // ---------------------------------------------------------------- helpers
  function pay(amount, why) {
    P.money = (P.money || 0) + Math.round(amount);
    sfx(game, 'cash', P.position, 0.8);
    tryCall('notify', () => game.hud?.notify?.(`${why}: +${fmt(amount)}`, 3200));
  }
  function mission(text) { tryCall('mission', () => game.hud?.setMission?.(text)); }
  function setWaypoint(p, label) {
    A.waypoint = p ? { x: p.x, z: p.z, label } : null;
    A.route = null; routeT = 0;
  }
  let routeT = 0;
  function routeTick(dt) {
    routeT -= dt;
    if (!A.waypoint || routeT > 0) return;
    routeT = 2;
    A.route = tryCall('route', () => C.findPath(P.position.x, P.position.z, A.waypoint.x, A.waypoint.z), null);
  }
  const inCar = () => !!P.state.inVehicle && P.state.vehicle;
  const carSpeed = () => (P.state.vehicle?.speedKmh || 0);
  function farPoint(minD, maxD) { // a sidewalk point at real distance via a random bearing
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = rand(minD, maxD);
      const c = new THREE.Vector3(P.position.x + Math.cos(a) * d, 0, P.position.z + Math.sin(a) * d);
      if (!C.inBounds(c, 40)) continue;
      const p = C.sidewalkPoint(c, 0, 90, null, { tries: 6 });
      if (p && distXZ(p, P.position) > minD * 0.7) return p;
    }
    return C.sidewalkPoint(P.position, minD * 0.5, maxD);
  }
  function end(success, msg) {
    const a = A.active; if (!a) return;
    tryCall('activity.cleanup', () => a.cleanup?.());
    A.active = null; setWaypoint(null); mission(null);
    if (msg) tryCall('notify', () => game.hud?.notify?.(msg, 3500));
    game.emit?.('activityEnd', { id: a.id, success });
  }
  A.cancel = () => end(false, 'Activity cancelled.');

  // simple scripted NPC (fares, bounty targets): own character + kinematic capsule + KCC, hit-testable
  const npcs = [];
  const charPool = [];
  function makeNpc(pos, seed, opts = {}) {
    // characters are pooled (creating a new one per fare/bounty would leak GPU resources)
    let char = charPool.pop() || null;
    if (!char) char = tryCall('createCharacter', () => createCharacter(game, { variant: 'ped', seed }), null);
    if (!char) return null;
    char.root.visible = true;
    scene.add(char.root);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + 0.9, pos.z));
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.28), body);
    const kcc = world.createCharacterController(0.03); kcc.setUp({ x: 0, y: 1, z: 0 }); kcc.enableSnapToGround(0.4); kcc.enableAutostep(0.35, 0.2, true);
    const n = { char, body, collider, kcc, pos: pos.clone(), heading: opts.heading || 0, speed: 0, health: opts.health ?? 100, dead: false, deadT: 0, goal: null, run: false, wave: false, vy: 0, onDamage: opts.onDamage, alive: true };
    npcs.push(n);
    return n;
  }
  function removeNpc(n) {
    if (!n || !n.alive) return; n.alive = false;
    scene.remove(n.char.root);
    if (charPool.length < 6) charPool.push(n.char);
    try { world.removeCharacterController(n.kcc); } catch (e) { /* ignore */ }
    removeBodySafe(game, n.body);
    const i = npcs.indexOf(n); if (i >= 0) npcs.splice(i, 1);
  }
  function npcTick(n, dt) {
    if (!n.alive) return;
    if (n.dead) { n.deadT += dt; }
    else {
      let mx = 0, mz = 0;
      if (n.goal) {
        const dx = n.goal.x - n.pos.x, dz = n.goal.z - n.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.6) {
          const sp = n.run ? 5.6 : 1.5;
          mx = dx / d * sp * dt; mz = dz / d * sp * dt;
          let a = Math.atan2(dx, dz) - n.heading; a = Math.atan2(Math.sin(a), Math.cos(a)); n.heading += a * Math.min(1, dt * 8);
        } else n.goal = null;
      }
      n.vy = Math.max(-20, n.vy - 18 * dt);
      let mv = { x: mx, y: n.vy * dt, z: mz };
      try { n.kcc.computeColliderMovement(n.collider, mv, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS); mv = n.kcc.computedMovement(); if (n.kcc.computedGrounded()) n.vy = -1; } catch (e) { /* ignore */ }
      const t = n.body.translation();
      n.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
      n.speed = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);
      n.pos.set(t.x + mv.x, t.y + mv.y - 0.88, t.z + mv.z);
      if (n.wave && n.speed < 0.2) { const lk = P.position; let a = Math.atan2(lk.x - n.pos.x, lk.z - n.pos.z) - n.heading; a = Math.atan2(Math.sin(a), Math.cos(a)); n.heading += a * Math.min(1, dt * 4); }
    }
    n.char.root.position.copy(n.pos); n.char.root.rotation.y = n.heading;
    tryCall('npc anim', () => n.char.update(dt, { speed: n.speed, grounded: true, sprint: n.run && n.speed > 4, dead: n.dead, handsUp: n.wave && !n.dead && (game.clock.elapsed % 1.6) < 0.8, deadStyle: 'back' }));
  }
  // hit-test integration: G.extraTargets is read by hitbox.hitTargets
  G.extraTargets = npcs;
  G.damageNpc = (n, amount, dir, kind, point, info = {}) => {
    if (!n || n.dead) return;
    n.health -= amount;
    game.emit?.('hit', { target: 'ped', object: n, point: point || n.pos.clone().setY(n.pos.y + 1.2), normal: dir ? dir.clone().negate() : new THREE.Vector3(0, 1, 0), damage: amount, kind, byPlayer: true, zone: info.zone, limb: info.limb, strength: info.strength });
    if (n.health <= 0) { n.dead = true; n.collider.setEnabled(false); }
    tryCall('npc onDamage', () => n.onDamage?.(n, amount, kind));
  };

  // ---------------------------------------------------------------- TAXI
  const isTaxi = (v) => !!v && (v.typeKey === 'taxi' || v.model?.class === 'taxi' || v.spec?.cls === 'taxi' || /taxi|cab/i.test(v.name || ''));
  function startTaxi() {
    if (!isTaxi(P.state.vehicle)) { game.hud?.notify?.('Get behind the wheel of a taxi first.', 2600); return false; }
    const a = { id: 'taxi', title: 'Taxi: on duty', fare: null, cleanup() { if (a.fare) { removeNpc(a.fare.npc); rm(a.fare.mk); rm(a.fare.dmk); } } };
    A.active = a;
    newFare(a);
    game.hud?.notify?.('On duty. Pick up fares — press J to clock off.', 3000);
    return true;
  }
  function newFare(a) {
    const p = farPoint(90, 260 * Math.sqrt(C.mapScale));
    if (!p) { end(false, 'No fares around here.'); return; }
    const npc = makeNpc(p, 9000 + ((Math.random() * 999) | 0));
    if (npc) { npc.wave = true; }
    a.fare = { npc, pos: p, stage: 'pickup', mk: marker(p, 0xffd25a, { r: 0.6 }), t: 0 };
    setWaypoint(p, 'Fare'); mission('Pick up the fare waving at the curb.');
  }
  function tickTaxi(a, dt) {
    const v = P.state.vehicle, f = a.fare; if (!f) return;
    f.t += dt;
    if (!isTaxi(v)) { if (!a.leftT) a.leftT = 0; a.leftT += dt; if (a.leftT > 12) end(false, 'You left your cab. Off duty.'); return; }
    a.leftT = 0;
    if (f.stage === 'pickup') {
      if (f.npc?.dead) { rm(f.mk); removeNpc(f.npc); newFare(a); return; }
      if (distXZ(v.position, f.pos) < 9 && carSpeed() < 8) {
        f.npc.goal = v.position.clone(); f.boardT = (f.boardT || 0) + dt;
        if (f.boardT > 1.2) {
          removeNpc(f.npc); f.npc = null; rm(f.mk);
          const dst = farPoint(320 * C.mapScale, 900 * C.mapScale);
          if (!dst) { end(false, 'The fare changed their mind.'); return; }
          f.dst = dst; f.stage = 'ride'; f.dist = distXZ(f.pos, dst); f.limit = 20 + f.dist / 11; f.rideT = 0;
          f.dmk = marker(dst, 0x2fe0d0, { r: 0.8 });
          setWaypoint(dst, 'Drop-off');
          const where = C.districtAt(dst.x, dst.z) || C.city?.streetNameAt?.(dst.x, dst.z) || 'across town';
          mission(`Take the fare to ${where}. Tip if you're there in ${Math.round(f.limit)}s.`);
          sfx(game, 'door', v.position, 0.6);
        }
      } else f.boardT = 0;
    } else if (f.stage === 'ride') {
      f.rideT += dt;
      if (distXZ(v.position, f.dst) < 10 && carSpeed() < 8) {
        rm(f.dmk);
        const base = 8 + f.dist * 0.018, tip = f.rideT < f.limit ? base * (0.25 + 0.5 * (1 - f.rideT / f.limit)) : 0;
        pay(base + tip, tip > 0 ? `Fare + tip (${Math.round(f.rideT)}s)` : 'Fare');
        A.stats.taxiFares++;
        const out = makeNpc(f.dst.clone(), 9500 + ((Math.random() * 400) | 0));
        if (out) { out.goal = C.sidewalkPoint(f.dst, 10, 30) || f.dst.clone().add(new THREE.Vector3(8, 0, 0)); setTimeout(() => removeNpc(out), 12000); }
        a.fare = null; newFare(a);
      }
    }
  }

  // ---------------------------------------------------------------- DELIVERY
  function startDelivery() {
    const pickupFront = (C.storefrontsNear(P.position, 500).sort(() => Math.random() - 0.5)[0]);
    const pp = pickupFront ? new THREE.Vector3(pickupFront.x, pickupFront.y ?? C.groundHeight(pickupFront.x, pickupFront.z), pickupFront.z) : farPoint(60, 200);
    if (!pp) return false;
    const p = C.sidewalkPoint(pp, 0, 25) || pp;
    const a = { id: 'delivery', title: 'Solana Express delivery', stage: 'pickup', mk: marker(p, 0xff9a3a, { r: 0.6 }), pickupPos: p, drops: [], t: 0,
      cleanup() { rm(a.mk); for (const d of a.drops) rm(d.mk); } };
    A.active = a;
    setWaypoint(p, 'Depot'); mission('Solana Express: collect the parcels at the pickup point.');
    return true;
  }
  function tickDelivery(a, dt) {
    a.t += dt;
    if (a.stage === 'pickup') {
      if (distXZ(P.position, a.pickupPos) < 4.5 && (!inCar() || carSpeed() < 10)) {
        rm(a.mk); a.mk = null;
        const n = 3;
        for (let i = 0; i < n; i++) { const d = farPoint(150 * C.mapScale, 600 * C.mapScale); if (d) a.drops.push({ pos: d, mk: marker(d, 0xff9a3a, { r: 0.55 }), done: false }); }
        if (!a.drops.length) { end(false, 'No addresses on the manifest.'); return; }
        a.stage = 'deliver'; a.limit = 60 + a.drops.length * 55; a.timer = a.limit;
        sfx(game, 'pickup', P.position);
        nextDrop(a);
      }
    } else {
      a.timer -= dt;
      const d = a.drops.find((x) => !x.done && distXZ(P.position, x.pos) < 6 && (!inCar() || carSpeed() < 15));
      if (d) { d.done = true; rm(d.mk); pay(60 + Math.max(0, a.timer) * 0.8, 'Parcel delivered'); nextDrop(a); }
      if (a.drops.every((x) => x.done)) { A.stats.deliveries++; end(true, 'All parcels delivered. Solana Express thanks you.'); return; }
      if (a.timer <= 0) end(false, 'Too slow — the depot reassigned the route.');
      else mission(`Deliver parcels: ${a.drops.filter((x) => x.done).length}/${a.drops.length} · ${Math.ceil(a.timer)}s`);
    }
  }
  function nextDrop(a) {
    const left = a.drops.filter((x) => !x.done).sort((x, y) => distXZ(x.pos, P.position) - distXZ(y.pos, P.position));
    if (left[0]) setWaypoint(left[0].pos, 'Parcel');
  }

  // ---------------------------------------------------------------- STREET RACE
  function buildCourse(startPos, dir, length) {
    if (!C.graph) return null;
    const pts = [];
    let pos = { x: startPos.x, z: startPos.z }, d = { x: dir.x, z: dir.z }, total = 0;
    const ne = C.nearestEdge(pos.x, pos.z); if (!ne) return null;
    pos = { x: ne.point.x, z: ne.point.z };
    pts.push({ ...pos });
    for (let hop = 0; hop < 60 && total < length; hop++) {
      const step = C.roadAhead(pos, d, 120);
      if (!step) break;
      const seg = Math.hypot(step.x - pos.x, step.z - pos.z);
      if (seg < 5) { // dead end: turn around-ish
        d = { x: -d.z, z: d.x }; continue;
      }
      // occasionally turn at junctions
      pts.push({ x: step.x, z: step.z }); total += seg; pos = { x: step.x, z: step.z };
      d = step.dir;
      if (Math.random() < 0.35) d = Math.random() < 0.5 ? { x: -d.z, z: d.x } : { x: d.z, z: -d.x };
      const nd = C.roadAhead(pos, d, 15); if (!nd || Math.hypot(nd.x - pos.x, nd.z - pos.z) < 5) d = step.dir;
    }
    if (total < length * 0.4) return null;
    // resample into checkpoints every ~140 m
    const cps = []; let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z);
      let t = 140 - acc;
      while (t <= L) { const k = t / L; cps.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dir: { x: (b.x - a.x) / L, z: (b.z - a.z) / L } }); t += 140; }
      acc = (acc + L) % 140;
    }
    const last = pts[pts.length - 1], prev = pts[pts.length - 2] || pts[0];
    const ll = Math.hypot(last.x - prev.x, last.z - prev.z) || 1;
    cps.push({ x: last.x, z: last.z, dir: { x: (last.x - prev.x) / ll, z: (last.z - prev.z) / ll }, finish: true });
    return { cps, length: total };
  }
  function startRace(buyIn = 100) {
    const v = P.state.vehicle;
    if (!v) { game.hud?.notify?.('You need a car to race.', 2400); return false; }
    if ((P.money || 0) < buyIn) { game.hud?.notify?.(`Buy-in is ${fmt(buyIn)}.`, 2400); return false; }
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().copy(v.body.rotation()));
    const course = buildCourse(P.position, { x: fwd.x, z: fwd.z }, rand(1200, 2000) * Math.sqrt(C.mapScale));
    if (!course) { game.hud?.notify?.('No good race line from here. Try a bigger street.', 2600); return false; }
    P.money -= buyIn;
    const a = { id: 'race', title: 'Street race', course, cp: 0, gates: [], rivals: [], t: -3.5, buyIn, cleanup() { for (const g of a.gates) rm(g); for (const r of a.rivals) { tryCall('rm rival', () => { r.v.setChaseTarget?.(null); game.vehicles?.remove?.(r.v); }); } } };
    A.active = a;
    course.cps.forEach((c, i) => { if (i < 3) a.gates[i] = arch({ x: c.x, z: c.z }, Math.atan2(c.dir.x, c.dir.z), c.finish ? 0xffd25a : 0x2fe0d0); });
    // rivals line up beside/behind the player
    const right = { x: Math.cos(Math.atan2(fwd.x, fwd.z)), z: -Math.sin(Math.atan2(fwd.x, fwd.z)) };
    const spots = [[3.2, 0], [0, -8], [3.2, -8]];
    for (const [s, b] of spots) {
      const pos = new THREE.Vector3(P.position.x + right.x * s + fwd.x * b, 0, P.position.z + right.z * s + fwd.z * b);
      pos.y = C.groundHeight(pos.x, pos.z);
      const rv = tryCall('spawn rival', () => game.vehicles?.spawn?.(pick(['super', 'sports', 'muscle']), pos, Math.atan2(fwd.x, fwd.z), { ai: true, snap: false }), null);
      if (rv) { rv.name = pick(['Kai', 'Lupe', 'Vex', 'Dani', 'Ozzy']) + "'s ride"; a.rivals.push({ v: rv, cp: 0, tgt: new THREE.Vector3(), done: false }); tryCall('freeze', () => rv.setChaseTarget?.(null)); }
    }
    mission('Street race — get ready...');
    setWaypoint(course.cps[0], 'Checkpoint');
    return true;
  }
  function tickRace(a, dt) {
    a.t += dt;
    const cps = a.course.cps;
    if (a.t < 0) {
      const n = Math.ceil(-a.t);
      if (n !== a.lastCount) { a.lastCount = n; mission(`Street race — ${n}`); sfx(game, 'beep', P.position, 0.7); }
      for (const r of a.rivals) tryCall('hold', () => r.v.setControls?.({ throttle: 0, steer: 0, brake: 1 }));
      return;
    }
    if (!a.go) { a.go = true; mission('GO!'); sfx(game, 'whistle', P.position, 0.6); }
    // rivals chase their next checkpoint (slight look-ahead)
    for (const r of a.rivals) {
      if (r.done || !vAlive(game, r.v)) continue;
      const t = r.v.body.translation(), c = cps[r.cp];
      r.tgt.set(c.x, 0, c.z);
      if (r.v.chaseTarget !== r.tgt) tryCall('chase', () => r.v.setChaseTarget?.(r.tgt));
      if (Math.hypot(t.x - c.x, t.z - c.z) < 16) { r.cp++; if (r.cp >= cps.length) { r.done = true; r.finishT = a.t; tryCall('stop', () => r.v.setChaseTarget?.(null)); } }
    }
    const v = P.state.vehicle;
    if (!v) { a.offT = (a.offT || 0) + dt; if (a.offT > 8) end(false, 'You left your car — race forfeited.'); return; }
    a.offT = 0;
    const c = cps[a.cp];
    if (distXZ(v.position, c) < 14) {
      rm(a.gates[a.cp]); a.gates[a.cp] = null;
      a.cp++; sfx(game, 'beep', P.position, 0.8);
      const nxt = a.cp + 2;
      if (nxt < cps.length) a.gates[nxt] = arch({ x: cps[nxt].x, z: cps[nxt].z }, Math.atan2(cps[nxt].dir.x, cps[nxt].dir.z), cps[nxt].finish ? 0xffd25a : 0x2fe0d0);
      if (a.cp >= cps.length) {
        const place = 1 + a.rivals.filter((r) => r.done).length;
        const prize = place === 1 ? a.buyIn * 4 : place === 2 ? a.buyIn * 1.5 : 0;
        if (prize) pay(prize, `Finished P${place} (${a.t.toFixed(1)}s)`);
        if (place === 1) A.stats.racesWon++;
        end(place === 1, place === 1 ? 'You won the street race!' : `You finished P${place}.`);
        return;
      }
      setWaypoint(cps[a.cp], cps[a.cp].finish ? 'Finish' : 'Checkpoint');
    }
    const ahead = a.rivals.filter((r) => r.cp > a.cp || (r.cp === a.cp && vAlive(game, r.v) && Math.hypot(r.v.body.translation().x - c.x, r.v.body.translation().z - c.z) < distXZ(v.position, c))).length;
    mission(`Street race · P${ahead + 1}/${a.rivals.length + 1} · CP ${a.cp}/${cps.length} · ${a.t.toFixed(1)}s`);
    if (a.t > 600) end(false, 'Race timed out.');
  }

  // ---------------------------------------------------------------- STORE HIT LIST
  function startHit() {
    const shops = (game.interiors?.list || []).filter((s) => s.center && s.open !== false && !s.robbed && distXZ(s.center, P.position) < 900);
    if (!shops.length) { game.hud?.notify?.('No soft targets nearby right now.', 2600); return false; }
    const s = shops.sort((x, y) => distXZ(x.center, P.position) - distXZ(y.center, P.position))[Math.min(shops.length - 1, (Math.random() * 3) | 0)];
    const a = { id: 'hit', title: 'Hit list', shop: s, stage: 'rob', mk: marker(s.center, 0xff4d5e, { r: 0.7 }), cleanup() { rm(a.mk); } };
    A.active = a;
    setWaypoint(s.center, s.name || 'Target');
    mission(`Hit list: rob ${s.name || pick(SHOPS)}, then lose the heat.`);
    a.off = game.on?.('crime', (d) => { if (A.active === a && a.stage === 'rob' && d?.type === 'robbery' && d.position && distXZ(d.position, s.center) < 40) { a.stage = 'escape'; rm(a.mk); a.mk = null; setWaypoint(null); mission('Lose the cops to collect the bonus.'); } });
    return true;
  }
  function tickHit(a) {
    if (a.stage === 'escape' && G.wanted.level === 0 && !G.dead && !G.busted) { pay(400 + Math.random() * 400, 'Hit-list bonus'); end(true, 'Clean getaway.'); }
    if (G.dead || G.busted) end(false, 'The job went south.');
  }

  // ---------------------------------------------------------------- ARMORED CAR
  function startArmored() {
    const r = C.roadPoint(P.position, 180, 320, { avoidView: true, inView: (q) => inView(game, q) });
    if (!r) return false;
    const v = tryCall('spawn armored', () => game.vehicles?.spawn?.('van', r.position, r.heading, { ai: true, color: 0x8a8f86 }), null);
    if (!v) { game.hud?.notify?.('No armored car on the streets right now.', 2600); return false; }
    v.name = 'SolGuard armored truck'; v.health = Math.max(v.health ?? 1000, 1400); v._gpArmored = true;
    if (v.ai) v.ai.cruise = 13;
    const a = { id: 'armored', title: 'Armored-car intercept', v, stage: 'chase', mk: null, startHp: v.health, cleanup() { rm(a.mk); } };
    A.active = a;
    mission('Intercept the SolGuard armored truck. Disable it to crack the rear doors.');
    return true;
  }
  function tickArmored(a, dt) {
    const v = a.v;
    if (!vAlive(game, v)) { end(false, 'The armored truck got away.'); return; }
    const t = v.body.translation();
    setWaypoint({ x: t.x, z: t.z }, 'Armored truck');
    if (!a.mk) a.mk = marker({ x: t.x, z: t.z }, 0xff4d5e, { r: 0.6, h: 0.5 });
    a.mk.position.set(t.x, t.y - 0.6, t.z);
    if (a.stage === 'chase') {
      const disabled = (v.health ?? 1000) < a.startHp * 0.45 || ((v.speedKmh || 0) < 2 && distXZ(t, P.position) < 25 && a.hitOnce);
      if ((v.health ?? 1000) < a.startHp - 50 && !a.hitOnce) { a.hitOnce = true; G.reportCrime?.('robbery', new THREE.Vector3(t.x, t.y, t.z), null, { police: true }); if (v.ai) v.ai.cruise = 22; }
      if (disabled) {
        a.stage = 'loot';
        tryCall('stop', () => { v.ejectDriver?.(); v.ai = null; v.setControls?.({ throttle: 0, steer: 0, brake: 1, handbrake: true }); });
        const r = v.body.rotation(); const back = new THREE.Vector3(0, 0, -3.2).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        const n = 5 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) G.pickups?.spawn?.('cash', new THREE.Vector3(t.x + back.x + rand(-1.4, 1.4), C.groundHeight(t.x + back.x, t.z + back.z) + 0.05, t.z + back.z + rand(-1.4, 1.4)), { temp: true, life: 60, amount: (250 + Math.random() * 400) | 0 });
        sfx(game, 'explosion', new THREE.Vector3(t.x, t.y, t.z), 0.5);
        G.wanted?.add?.(3, new THREE.Vector3(t.x, t.y, t.z));
        mission('The rear doors are open — grab the cash bags!');
        a.lootT = 0;
      }
      if (distXZ(t, P.position) > 600 * C.mapScale) end(false, 'You lost the armored truck.');
    } else {
      a.lootT += dt;
      if (a.lootT > 30) end(true, 'Armored-car job done. Now get clear.');
    }
  }

  // ---------------------------------------------------------------- BOUNTY
  function startBounty() {
    const p = farPoint(250 * Math.sqrt(C.mapScale), 600 * Math.sqrt(C.mapScale));
    if (!p) return false;
    const name = pick(NAMES), reward = 600 + ((Math.random() * 1200) | 0);
    const a = { id: 'bounty', title: `Bounty: ${name}`, name, reward, npc: null, area: p.clone().add(new THREE.Vector3(rand(-40, 40), 0, rand(-40, 40))), spotted: false, mk: null,
      cleanup() { rm(a.mk); if (a.npc && !a.npc.dead) removeNpc(a.npc); else if (a.npc) setTimeout(() => removeNpc(a.npc), 15000); } };
    const npc = makeNpc(p, 12000 + ((Math.random() * 999) | 0), { health: 140, onDamage: () => { a.npc.run = true; } });
    if (!npc) return false;
    a.npc = npc;
    A.active = a;
    setWaypoint(a.area, 'Last seen');
    mission(`Bounty: ${name} was last seen around here. ${fmt(reward)}, dead or alive (knock them out with a melee weapon for a bonus).`);
    return true;
  }
  function tickBounty(a, dt) {
    const n = a.npc; if (!n) return;
    const d = distXZ(n.pos, P.position);
    if (!a.spotted && d < 28) { a.spotted = true; a.mk = marker(n.pos, 0xff4d5e, { r: 0.35, h: 0.2 }); game.hud?.notify?.(`That's ${a.name}!`, 2000); setWaypoint(null); }
    if (a.mk) a.mk.position.set(n.pos.x, n.pos.y + 0.02, n.pos.z);
    if (!n.dead) {
      if (d < 16 || n.run) { // flee: run away from the player along open ground
        n.run = true;
        if (!n.goal || distXZ(n.goal, n.pos) < 2) {
          const away = new THREE.Vector3(n.pos.x - P.position.x, 0, n.pos.z - P.position.z).normalize();
          const q = C.sidewalkPoint(new THREE.Vector3(n.pos.x + away.x * 40, 0, n.pos.z + away.z * 40), 0, 30, null, { tries: 4 });
          n.goal = q || new THREE.Vector3(n.pos.x + away.x * 20, n.pos.y, n.pos.z + away.z * 20);
        }
      } else if (!n.goal && Math.random() < dt * 0.2) { n.goal = C.sidewalkPoint(n.pos, 5, 25, null, { tries: 3 }); }
      if (d > 700 * C.mapScale) end(false, `${a.name} slipped away.`);
    } else {
      const melee = (game.clock.elapsed - (G.lastMeleeHitT ?? -99)) < 1.5;
      pay(a.reward * (melee ? 1.25 : 1), `Bounty on ${a.name}${melee ? ' (taken alive)' : ''}`);
      A.stats.bounties++;
      end(true, null);
    }
  }

  // ---------------------------------------------------------------- COLLECTIBLES: "Solana Shells"
  const shellKey = 'portsolana.shells.v1';
  let found = new Set(); try { found = new Set(JSON.parse(localStorage.getItem(shellKey) || '[]')); } catch (e) { /* ignore */ }
  A.stats.shells = found.size;
  const shellGeo = (() => { // fan-shaped scallop shell
    const s = new THREE.Shape(); s.moveTo(0, 0);
    for (let i = 0; i <= 12; i++) { const a = Math.PI * 0.15 + (i / 12) * Math.PI * 0.7; const r = 0.22 + (i % 2 ? 0.015 : 0); s.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }); g.center(); return g;
  })();
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xffd2b8, roughness: 0.25, metalness: 0.1, iridescence: 1, iridescenceIOR: 1.5, emissive: 0x552211, emissiveIntensity: 0.4 });
  const shellStream = createCellStreamer(game, {
    cell: 200, loadR: 220, unloadR: 380, perTick: 1,
    generate(cell) {
      const id = `${cell.i}:${cell.j}`;
      const zone = C.zoneAt(cell.cx, cell.cz);
      const chance = zone === 'beach' ? 0.55 : zone === 'park' ? 0.4 : zone === 'water' ? 0 : 0.18;
      if (Math.random() > chance) return { shell: null };
      for (let k = 0; k < 20; k++) { // hidden: off-road, open ground, ideally tucked away
        const x = cell.cx + rand(-90, 90), z = cell.cz + rand(-90, 90);
        if (!C.inBounds({ x, z }) || C.isWater(x, z)) continue;
        const ne = C.nearestEdge(x, z); if (ne && ne.dist < (ne.edge?.width || 10) / 2 + 3) continue;
        const gh = C.groundHeight(x, z);
        if (groundAt(game, x, z, gh + 40) > gh + 0.8) continue;
        return { shell: { id, x, y: gh, z } };
      }
      return { shell: null };
    },
    load(cell) {
      const s = cell.data.shell; if (!s || found.has(s.id)) return;
      const m = new THREE.Mesh(shellGeo, shellMat); m.castShadow = true;
      m.position.set(s.x, s.y + 0.45, s.z); scene.add(m); cell.data.mesh = m;
      shells.push(cell.data);
    },
    unload(cell) { if (cell.data.mesh) { scene.remove(cell.data.mesh); cell.data.mesh = null; } const i = shells.indexOf(cell.data); if (i >= 0) shells.splice(i, 1); },
  });
  const shells = [];
  function shellTick(dt) {
    shellStream.tick(dt);
    for (const d of shells.slice()) {
      const m = d.mesh; if (!m) continue;
      m.rotation.y += dt * 1.2; m.position.y = d.shell.y + 0.45 + Math.sin(game.clock.elapsed * 2 + d.shell.x) * 0.06;
      if (distXZ(m.position, P.position) < 1.3 && Math.abs(m.position.y - P.position.y) < 2) {
        found.add(d.shell.id); scene.remove(m); d.mesh = null; shells.splice(shells.indexOf(d), 1);
        A.stats.shells = found.size;
        try { localStorage.setItem(shellKey, JSON.stringify([...found])); } catch (e) { /* ignore */ }
        sfx(game, 'pickup', P.position, 1);
        const bonus = found.size % 10 === 0 ? 1000 : 50;
        pay(bonus, `Solana Shell #${found.size}`);
      }
    }
  }

  // ---------------------------------------------------------------- registry + phone/keyboard menu
  const REG = [
    { id: 'taxi', name: 'Taxi fares', desc: 'Drive a cab and ferry fares across town. Tips for speed.', start: startTaxi, tick: tickTaxi, needsCar: 'taxi' },
    { id: 'delivery', name: 'Solana Express', desc: 'Pick up parcels and deliver them before the clock runs out.', start: startDelivery, tick: tickDelivery },
    { id: 'race', name: 'Street race', desc: 'Race rivals through checkpoints on real streets ($100 buy-in).', start: () => startRace(100), tick: tickRace, needsCar: true },
    { id: 'hit', name: 'Hit list', desc: 'Rob a marked store and shake the heat for a bonus.', start: startHit, tick: tickHit },
    { id: 'armored', name: 'Armored truck', desc: 'Intercept and disable a SolGuard truck, grab the cash.', start: startArmored, tick: tickArmored },
    { id: 'bounty', name: 'Bounties', desc: 'Track down a wanted target; taken alive pays more.', start: startBounty, tick: tickBounty },
  ];
  for (const r of REG) A.list.push({ id: r.id, name: r.name, desc: r.desc, start: () => A.start(r.id), get available() { return !A.active && !G.dead && !G.busted; } });
  A.start = (id) => {
    if (A.active) { game.hud?.notify?.('Finish or cancel your current activity first (J).', 2500); return false; }
    const r = REG.find((x) => x.id === id); if (!r) return false;
    const ok = tryCall('activity.start.' + id, () => r.start(), false);
    if (ok && A.active) { A.active.tick = r.tick; A.active.name = r.name; game.emit?.('activityStart', { id }); sfx(game, 'beep', P.position, 0.6); }
    return !!ok;
  };
  A.collectibles = () => ({ found: found.size, kind: 'Solana Shells' });

  // minimal on-screen menu (J) in case the phone app isn't wired: lists activities, 1-6 to start, J again to cancel
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;right:24px;top:50%;transform:translateY(-50%);width:330px;padding:16px 18px;border-radius:14px;background:rgba(12,16,24,.82);backdrop-filter:blur(8px);color:#e9eef5;font:14px/1.35 system-ui,sans-serif;z-index:45;display:none;box-shadow:0 10px 40px rgba(0,0,0,.4)';
  document.body.appendChild(menu);
  let menuOpen = false;
  function renderMenu() {
    menu.innerHTML = `<div style="font-weight:700;letter-spacing:.12em;font-size:12px;color:#2fe0d0;margin-bottom:8px">SIDE HUSTLES</div>` +
      REG.map((r, i) => `<div style="padding:7px 0;border-top:1px solid rgba(255,255,255,.08)"><b style="color:#ffd25a">${i + 1}</b>&nbsp; <b>${r.name}</b><br><span style="opacity:.7;font-size:12.5px">${r.desc}</span></div>`).join('') +
      `<div style="margin-top:8px;opacity:.6;font-size:12px">Solana Shells found: ${found.size} · Fares ${A.stats.taxiFares} · Races won ${A.stats.racesWon} · Bounties ${A.stats.bounties}</div>`;
  }
  function toggleMenu(on) { menuOpen = on; if (on) renderMenu(); menu.style.display = on ? 'block' : 'none'; }

  // world triggers: race start flags on big roads (streamed), taxi auto-hint
  const raceStream = createCellStreamer(game, {
    cell: 400, loadR: 300, unloadR: 500, perTick: 1,
    generate(cell) {
      if (Math.random() > 0.45) return { flag: null };
      const r = C.roadPoint(new THREE.Vector3(cell.cx, 0, cell.cz), 0, 180, { tries: 6 });
      return { flag: r ? { x: r.position.x, y: r.position.y, z: r.position.z, h: r.heading } : null };
    },
    load(cell) { const f = cell.data.flag; if (!f) return; cell.data.mk = marker(f, 0xffffff, { r: 0.7, h: 0.6 }); cell.data.mk.userData.ring.material.color.setHex(0x2fe0d0); flags.push(cell.data); },
    unload(cell) { rm(cell.data.mk); cell.data.mk = null; const i = flags.indexOf(cell.data); if (i >= 0) flags.splice(i, 1); },
  });
  const flags = [];
  let taxiHinted = false, helpOwned = false;

  function update(dt) {
    if (!(dt > 0)) return;
    const inp = game.input, ui = game.ui || {};
    const free = !ui.paused && !ui.phoneOpen && !ui.title && !ui.weaponWheel;
    if (free && inp.pressed('KeyJ')) {
      if (A.active) A.cancel(); else toggleMenu(!menuOpen);
    }
    if (menuOpen) {
      for (let i = 0; i < REG.length; i++) if (inp.pressed('Digit' + (i + 1))) { toggleMenu(false); A.start(REG[i].id); }
      if (inp.pressed('Escape')) toggleMenu(false);
    }
    G.menuOpen = menuOpen; // weapons ignore digit keys while the menu is open
    tryCall('npcs', () => { for (const n of npcs.slice()) npcTick(n, dt); });
    if (A.active) { tryCall('activity.tick', () => A.active.tick?.(A.active, dt)); routeTick(dt); }
    tryCall('shells', () => shellTick(dt));
    tryCall('races', () => raceStream.tick(dt));
    // race flag trigger
    let help = null;
    if (!A.active && inCar() && free) {
      const v = P.state.vehicle;
      const f = flags.find((x) => distXZ(x.flag, v.position) < 14);
      if (f && carSpeed() < 25) { help = 'Press <b>E</b> to start a street race ($100 buy-in)'; if (inp.pressed('KeyE')) A.start('race'); }
      else if (isTaxi(v) && !taxiHinted) { taxiHinted = true; game.hud?.notify?.('Taxi: press J and pick "Taxi fares" to go on duty.', 3500); }
    }
    for (const f of flags) if (f.mk) f.mk.userData.ring.rotation.z += dt;
    if (help) { tryCall('help', () => game.hud?.help?.(help)); helpOwned = true; } else if (helpOwned) { tryCall('help', () => game.hud?.help?.(null)); helpOwned = false; }
  }
  return A.api = { update, list: A.list, start: A.start, cancel: A.cancel, npcs };
}
