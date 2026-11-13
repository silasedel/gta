// Port Solana vehicles: procedural cars + Rapier raycast-vehicle physics + lane-following traffic AI.
import * as THREE from 'three';
import { buildCar, CAR_TYPES, MODELS, CLASSES, ALL_KEYS, rollVariant, brokenGlassMat, isBuilt, wheelBuilt, prebuild } from './carModel.js';
import { dentMesh } from './damage.js';
import { buildRoadNet, project, sampleEdge, laneOffset, laneCount, driveLaneMax, lanePointAt, exitsAt, edgeDirAt, signalState, randomLane } from './roadnet.js';
import { createCharacter } from '../player/characterModel.js';
import { createSkids, createScreech, createSmoke, createShards, playImpact } from './skids.js';

const PALETTE = [
  0xff6a2b, 0x1fb5b0, 0x173b8f, 0xeeeeea, 0x101214, 0xa9aeb4, 0xb3121b, 0x7c2fbf,
  0x2f6d3a, 0xf0b62a, 0x5a6470, 0xd9447a, 0x0e5e7a, 0xe7dcc4,
];
const UP = new THREE.Vector3(0, 1, 0);
const DRIVER_Y = 0;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// finite-or-fallback, then clamp to +-lim (lim only for magnitude)
const fin = (x, fallback, lim) => (Number.isFinite(x) ? Math.max(-lim, Math.min(lim, x)) : fallback);
const lerp = (a, b, t) => a + (b - a) * t;

export async function createVehicles(game) {
  const { RAPIER, world, scene } = game;
  const city = game.city;
  const list = [];

  // ------------------------------------------------------------ road network (city.roadGraph or legacy grid)
  const net = buildRoadNet(city);
  const groundY = (x, z, y) => (y != null ? y : (city?.groundHeightAt?.(x, z) ?? 0));
  const isNear = (p, R) => list.some((v) => v.body && distXZ(v.body.translation(), p) < Math.max(R, (v.spec.L + 5) / 2 + 1.2));
  // footprint test: inflated chassis box vs every existing collider (buildings, props, kerbs above 0.3 m, other cars)
  const _fq = new THREE.Quaternion();
  function spotFree(pos, heading, spec = CAR_TYPES.sedan, ignoreBody = null) {
    if (isNear(pos, (spec.L + 4.5) / 2 + 0.8)) {
      // precise check against our own cars (oriented boxes, fast path)
      for (const v of list) {
        if (v.body === ignoreBody) continue;
        const t = v.body.translation();
        const need = (spec.L + v.spec.L) / 2 + 0.8;
        if (distXZ(t, pos) < need && Math.abs(t.y - v.groundOff - (pos.y || 0)) < 3) {
          // lateral separation along our heading's right axis
          const dx = t.x - pos.x, dz = t.z - pos.z;
          const lat = Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading));
          const lon = Math.abs(dx * Math.sin(heading) + dz * Math.cos(heading));
          if (lat < (spec.W + v.spec.W) / 2 + 0.35 && lon < need) return false;
        }
      }
    }
    try {
      const hh = Math.max(0.3, (spec.roofY - 0.35) / 2);
      _fq.setFromAxisAngle(UP, heading);
      const shape = new RAPIER.Cuboid(spec.W / 2 + 0.25, hh, spec.L / 2 + 0.35);
      const hit = world.intersectionWithShape({ x: pos.x, y: (pos.y || 0) + 0.35 + hh, z: pos.z }, { x: _fq.x, y: _fq.y, z: _fq.z, w: _fq.w }, shape,
        QF.EXCLUDE_SENSORS, undefined, undefined, ignoreBody || undefined);
      if (hit) return false;
      if (city?.collidersReadyAt && !city.collidersReadyAt(pos.x, pos.z)) return false;
      // the ground (streamed static colliders) must exist under the spot
      const gh = world.castRay(new RAPIER.Ray({ x: pos.x, y: (pos.y || 0) + 2.5, z: pos.z }, { x: 0, y: -1, z: 0 }), 6, true,
        QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS);
      if (!gh) return false;
    } catch (e) { return false; /* query pipeline not ready: try later */ }
    return true;
  }
  // random lane position: { edge, dir, d, lane, pos: Vector3, heading }
  const MINOR = /service|living|track|path|parking|driveway|pedestrian/;
  const trafficEdge = { edge: (e) => !MINOR.test(e.kind || '') };
  function randomLanePos(nearPos, minD, maxD, notInView, tries = 40, spec) {
    for (let i = 0; i < tries; i++) {
      const info = randomLane(net, nearPos, minD, maxD, trafficEdge, 4);
      if (!info) continue;
      const pos = new THREE.Vector3(info.x, groundY(info.x, info.z, info.y), info.z);
      if (notInView && inView(pos)) continue;
      if (isNear(pos, 10)) continue;
      if (!spotFree(pos, info.heading, spec || CAR_TYPES.sedan)) continue;
      // keep clear of junctions
      if (info.d < 10 || info.edge.len - info.d < 10) continue;
      return { ...info, pos };
    }
    return null;
  }
  const PARK_KINDS = /residential|living|unclassified|tertiary|secondary|street|service/;
  function parkedSpot(near, minD, maxD, notInView = false, spec = CAR_TYPES.suv) {
    for (let i = 0; i < 60; i++) {
      const info = randomLane(net, near, minD, maxD, null, 3);
      if (!info) continue;
      const e = info.edge;
      if (e.bridge || (!net.legacy && !PARK_KINDS.test(e.kind || ''))) continue;
      if (info.d < 12 || e.len - info.d < 12) continue;
      const curb = (e.oneway ? e.width / 2 : e.width / 2) - 1.15;
      const p = lanePointAt(e, info.dir, info.d, curb);
      const pos = new THREE.Vector3(p.x, groundY(p.x, p.z, p.y), p.z);
      if (city?.isWater?.(pos.x, pos.z)) continue;
      if (notInView && inView(pos)) continue;
      if (isNear(pos, 7)) continue;
      const heading = Math.atan2(p.fx, p.fz);
      if (!spotFree(pos, heading, spec)) continue;
      return { pos, heading, edge: e };
    }
    return null;
  }
  const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const _frus = new THREE.Frustum(), _pm = new THREE.Matrix4();
  function inView(p) {
    const cam = game.camera;
    if (!cam) return false;
    cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frus.setFromProjectionMatrix(_pm);
    return _frus.intersectsSphere(new THREE.Sphere(new THREE.Vector3(p.x, 1, p.z), 4)) && cam.position.distanceTo(p) < 260;
  }

  // ------------------------------------------------------------ shared headlight spot (player car only)
  const spot = new THREE.SpotLight(0xfff0dc, 0, 80, 0.62, 0.55, 1.2);
  spot.castShadow = false;
  scene.add(spot); scene.add(spot.target);
  const spot2 = new THREE.SpotLight(0xfff0dc, 0, 45, 0.9, 0.8, 1.4); // wide near fill
  scene.add(spot2); scene.add(spot2.target);

  const skids = createSkids(scene);
  const screech = createScreech();
  const smoke = createSmoke(scene);
  const shards = createShards(scene);
  const exhaust = createSmoke(scene, 80, { color: 0x9a9894, scale: 0.3 });
  const fire = createSmoke(scene, 160, { color: 0xff7a1a, additive: true, fire: true });
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 18, 1.5);
  scene.add(fireLight);
  let impactCooldown = 0;

  // fake headlight pools on the ground (cheap night glow for every car)
  function poolTexture(red) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, red ? 32 : 24, 0, 32, red ? 32 : 28, red ? 30 : 28);
    g.addColorStop(0, red ? 'rgba(255,40,20,0.9)' : 'rgba(255,240,215,1)');
    g.addColorStop(0.5, red ? 'rgba(255,20,10,0.25)' : 'rgba(255,225,190,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(false), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -3, fog: true });
  const tailPoolMat = new THREE.MeshBasicMaterial({ map: poolTexture(true), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, polygonOffset: true, polygonOffsetFactor: -3, fog: true });
  const poolGeo = new THREE.PlaneGeometry(6.5, 13).rotateX(-Math.PI / 2);
  const tailPoolGeo = new THREE.PlaneGeometry(2.6, 2.0).rotateX(-Math.PI / 2);

  const copRed = new THREE.PointLight(0xff1a1a, 0, 28, 1.6);
  const copBlue = new THREE.PointLight(0x2a4dff, 0, 28, 1.6);
  scene.add(copRed, copBlue);

  // ------------------------------------------------------------ horn audio
  let actx = null;
  function horn(vehicle) {
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const now = actx.currentTime;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      g.gain.setValueAtTime(0.18, now + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      g.connect(f); f.connect(actx.destination);
      const cls = vehicle?.spec?.cls;
      const base = vehicle?.spec?.heavy ? 260 : cls === 'sports' || cls === 'super' ? 470 : cls === 'suv' || cls === 'pickup' ? 330 : 400;
      for (const fr of [base, base * 1.26]) {
        const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(g); o.start(now); o.stop(now + 0.6);
      }
    } catch (e) { /* no audio */ }
  }

  let siren = null;
  function sirenAudio(on) {
    try {
      if (on && !siren) {
        actx ||= new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        const o = actx.createOscillator(); o.type = 'square'; o.frequency.value = 750;
        const lfo = actx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.35;
        const lg = actx.createGain(); lg.gain.value = 320; lfo.connect(lg).connect(o.frequency);
        const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
        const g = actx.createGain(); g.gain.value = 0.045;
        o.connect(f).connect(g).connect(actx.destination);
        o.start(); lfo.start();
        siren = { o, lfo, g };
      } else if (!on && siren) {
        const t = actx.currentTime;
        siren.g.gain.setTargetAtTime(0, t, 0.05);
        siren.o.stop(t + 0.3); siren.lfo.stop(t + 0.3);
        siren = null;
      }
    } catch (e) { siren = null; }
  }

  // ------------------------------------------------------------ vehicle factory
  let nameCounter = 0;
  function createVehicle(typeKey, color, pos, heading, opts = {}) {
    if (!CAR_TYPES[typeKey]) typeKey = 'sedan';
    const spec = CAR_TYPES[typeKey];
    const variant = opts.variant || rollVariant(typeKey);
    if (!isBuilt(typeKey, variant.kit)) variant.kit = 'base';
    if (variant.wheel && !wheelBuilt(typeKey, variant.wheel.spokes)) variant.wheel = { spokes: spec.spokes, rimColor: variant.wheel.rimColor };
    if (color == null) color = variant.color;
    const model = buildCar(typeKey, color, { kit: variant.kit, wheel: variant.wheel, blackRoof: variant.blackRoof });
    const [restLen, stiff] = spec.susp || [0.36, 34];
    const eqLen = restLen - 9.81 / (4 * stiff);
    const groundOff = eqLen + spec.r; // body origin height above ground at rest
    model.shell.position.y = -groundOff;
    scene.add(model.root);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(0, -groundOff + 0.04, spec.L / 2 + 6.0);
    pool.visible = false; pool.renderOrder = 1;
    const tailPool = new THREE.Mesh(tailPoolGeo, tailPoolMat);
    tailPool.position.set(0, -groundOff + 0.04, -spec.L / 2 - 0.3);
    tailPool.visible = false; tailPool.renderOrder = 1;
    model.root.add(pool, tailPool);
    model.pool = pool; model.tailPool = tailPool;

    // rigid body
    const q = new THREE.Quaternion().setFromAxisAngle(UP, heading);
    const mass = spec.mass;
    const L = spec.L, W = spec.W, H = spec.belt - spec.yb;
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, (pos.y || 0) + groundOff + 0.08, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCcdEnabled(false)
      .setLinearDamping(0.02)
      .setAngularDamping(0.35)
      .setCanSleep(true)
      .setAdditionalMassProperties(
        mass,
        { x: 0, y: spec.comHigh ? 0.05 : spec.wedge ? -0.24 : -0.18, z: spec.wedge ? -0.15 : 0.05 },
        { x: mass / 12 * (H * H + L * L) * 1.15, y: mass / 12 * (W * W + L * L) * 1.15, z: mass / 12 * (W * W + H * H) * 1.3 },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    const body = world.createRigidBody(bd);
    const rr = 0.08;
    const lowerCy = (spec.yb + 0.06 + spec.belt) / 2 - groundOff;
    const c1 = RAPIER.ColliderDesc.roundCuboid(W / 2 - 0.02 - rr, (spec.belt - spec.yb - 0.06) / 2 - rr, L / 2 - 0.03 - rr, rr)
      .setTranslation(0, lowerCy, 0).setDensity(0).setFriction(0.35).setRestitution(0.08);
    const Wc = W - 2 * spec.cabInset;
    const c2 = RAPIER.ColliderDesc.roundCuboid(Wc / 2 - rr, (spec.roofY - spec.belt) / 2 - rr, (spec.zA - spec.zD) / 2 - rr, rr)
      .setTranslation(0, (spec.roofY + spec.belt) / 2 - groundOff, (spec.zA + spec.zD) / 2).setDensity(0).setFriction(0.3).setRestitution(0.05);
    let col1 = null;
    try {
      const hp = model.hull;
      if (hp && hp.length >= 12) {
        const pts = new Float32Array(hp.length);
        for (let i = 0; i < hp.length; i += 3) { pts[i] = hp[i]; pts[i + 1] = hp[i + 1] - groundOff; pts[i + 2] = hp[i + 2]; }
        const hd = RAPIER.ColliderDesc.convexHull(pts);
        if (hd) col1 = world.createCollider(hd.setDensity(0).setFriction(0.35).setRestitution(0.08), body);
      }
    } catch (e) { col1 = null; }
    if (!col1) { col1 = world.createCollider(c1, body); world.createCollider(c2, body); }

    // raycast vehicle
    const vc = makeController(body, model.wheels, spec, restLen, stiff);

    const v = {
      name: opts.name || `${spec.label} #${++nameCounter}`,
      typeKey, spec, body, vc, mesh: model.root, car: model, collider: col1,
      groundOff, restLen, stiff, id: nameCounter,
      speedKmh: 0, speed: 0, playerDriven: false, lightsOn: false,
      braking: false, reversing: false, sirenActive: false, sirenOn: false,
      police: !!spec.police || !!opts.police, health: 1000, disabled: false, locked: !!opts.locked, variant,
      alive: true, disposed: false, external: !!opts.external,
      engineOn: !!opts.ai, engineOffT: 0, submerged: 0, inWater: false, flooded: false, velocity: new THREE.Vector3(), wheelDmg: [0, 0, 0, 0],
      driver: null, driverChar: null, chaseTarget: null,
      model: { key: typeKey, ...(MODELS[typeKey] || MODELS.sedan) },
      rpm: (MODELS[typeKey] || MODELS.sedan).idleRpm, gear: 1, throttle: 0, load: 0, shiftT: 0, guardT: 0, prevPD: false,
      ctrl: { throttle: 0, steer: 0, brake: 0, handbrake: false },
      steerCur: 0, flipT: 0,
      ai: opts.ai ? makeAI() : null,
      parked: !opts.ai,
      setControls(c) {
        const k = this.ctrl;
        k.throttle = clamp(+c.throttle || 0, -1, 1);
        k.steer = clamp(+c.steer || 0, -1, 1);
        k.brake = clamp(+c.brake || 0, 0, 1);
        k.handbrake = !!c.handbrake;
      },
      exitPosition() {
        const t = body.translation(), r = body.rotation();
        _q.set(r.x, r.y, r.z, r.w);
        const p = new THREE.Vector3(spec.W / 2 + 1.05, 0, 0.35).applyQuaternion(_q);
        p.y = 0;
        return new THREE.Vector3(t.x + p.x, Math.max(0, t.y - groundOff), t.z + p.z);
      },
      seatPosition() {
        const r = body.rotation();
        _q.set(r.x, r.y, r.z, r.w);
        const p = new THREE.Vector3(0.38, spec.belt - 0.25 - groundOff, spec.zA - 1.25).applyQuaternion(_q);
        const t = body.translation();
        return p.add(_v.set(t.x, t.y, t.z));
      },
      horn() {
        if (this.police) { this.sirenOn = !this.sirenOn; return; }
        horn(this);
      },
      siren(on) { this.sirenOn = on === undefined ? !this.sirenOn : !!on; return this.sirenOn; },
      setChaseTarget(target) {
        this.chaseTarget = target || null;
        if (target) {
          if (!this.ai) this.ai = makeAI();
          this.ai.chase = { stuckT: 0, revT: 0 };
          this.parked = false;
          if (this.police) this.sirenOn = true;
        } else if (this.ai) { this.ai.chase = null; this.ai.edge = null; this.ai.next = null; this.ai.stuckT = 0; }
      },
      ejectDriver() {
        const p = this.exitPosition();
        removeDriver(this);
        if (this.ai) this.ai = null;
        return p;
      },
      damage(amount, localPoint) { applyDamage(this, amount, localPoint); },
      flip() { flipReset(this); },
      get position() { const t = body.translation(); return new THREE.Vector3(t.x, t.y, t.z); },
      get heading() {
        const r = body.rotation(); _q.set(r.x, r.y, r.z, r.w);
        _v.set(0, 0, 1).applyQuaternion(_q); return Math.atan2(_v.x, _v.z);
      },
    };
    list.push(v);
    // driver is added lazily in update() when the car is near (one per frame)
    return v;
  }
  // (re)build a ray-cast vehicle controller; a fresh one never holds stale ground-collider handles
  function makeController(body, wheels, spec, restLen, stiff) {
    const vc = world.createVehicleController(body);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    wheels.forEach((w, i) => {
      vc.addWheel({ x: w.x, y: 0, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, restLen, spec.r);
      vc.setWheelSuspensionStiffness(i, stiff);
      vc.setWheelSuspensionCompression(i, 0.55 * 2 * Math.sqrt(stiff));
      vc.setWheelSuspensionRelaxation(i, 0.75 * 2 * Math.sqrt(stiff));
      vc.setWheelMaxSuspensionTravel(i, 0.25);
      vc.setWheelMaxSuspensionForce(i, spec.mass * 40);
      vc.setWheelFrictionSlip(i, spec.grip);
      vc.setWheelSideFrictionStiffness(i, 1.0);
    });
    return vc;
  }
  function makeAI() {
    return { edge: null, dir: 1, d: 0, lane: 0, next: null, cruiseK: 0.85 + Math.random() * 0.25, stuckT: 0, blockedT: 0, fleeT: 0, honkT: 0, chase: null };
  }

  // ------------------------------------------------------------ drivers (ped models seated in AI cars)
  let driverSeed = 500;
  function addDriver(v) {
    if (v.driver) return;
    let ch = null;
    try { ch = createCharacter(game, { variant: 'ped', seed: driverSeed++ }); } catch (e) { ch = null; }
    if (!ch || !ch.root) return;
    const spec = v.spec;
    const seatZ = spec.zA - (spec.coupe ? 1.15 : 1.25);
    ch.root.position.set(0.38, Math.min(spec.belt - 0.09, spec.roofY - 0.88) + DRIVER_Y, seatZ + 0.2);
    ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    v.car.shell.add(ch.root);
    ch.update?.(0.5, { driving: true, speed: 0, grounded: true });
    v.driver = ch.root; v.driverChar = ch;
  }
  function removeDriver(v) {
    if (!v.driver) return;
    v.driver.parent?.remove(v.driver);
    v.driver = null; v.driverChar = null;
  }

  // ------------------------------------------------------------ damage
  const _lp = new THREE.Vector3();
  function applyDamage(v, amount, localPoint) {
    if (v.health <= 0) return;
    v.health = Math.max(0, v.health - amount);
    const spec = v.spec;
    if (localPoint) {
      // shell coordinates (ground = 0)
      const sp = { x: localPoint.x, y: localPoint.y + v.groundOff, z: localPoint.z, cy: spec.belt * 0.7 };
      const depth = Math.min(0.22, amount / 900);
      dentMesh(v.car.parts?.paint, sp, depth, 0.75);
      dentMesh(v.car.parts?.roof, sp, depth, 0.75);
      if (localPoint.z > spec.L / 2 - 0.7 && amount > 60 && !v.headBroken) {
        v.headBroken = true;
        const hm = v.car.lightMats.head; hm.color.setHex(0x2a2d30); hm.emissive.setHex(0x000000);
      }
      if (amount > 160 && !v.glassBroken) breakGlass(v);
      if (amount > 120) {
        v.car.wheels.forEach((w, i) => {
          const d = Math.hypot(localPoint.x - w.x, localPoint.z - w.z);
          if (d < 1.0) { v.wheelDmg[i] = Math.min(1, v.wheelDmg[i] + amount / 500); w.steer.rotation.z = (w.side > 0 ? -1 : 1) * 0.12 * v.wheelDmg[i]; }
        });
      }
    }
    if (v.health <= 0) disableVehicle(v);
  }
  function breakGlass(v) {
    if (v.glassBroken) return;
    v.glassBroken = true;
    for (const g of v.car.slots?.glass || []) g.material = brokenGlassMat();
    const t = v.body.translation();
    shards.burst({ x: t.x, y: t.y + 0.5, z: t.z }, null, 50, Math.max(0, t.y - v.groundOff));
    game.audio?.play?.('glass', { position: new THREE.Vector3(t.x, t.y, t.z), volume: 0.8 });
  }
  function disableVehicle(v) {
    v.disabled = true;
    const t = v.body.translation();
    const pos = new THREE.Vector3(t.x, t.y + 0.5, t.z);
    game.fx?.sparks?.(pos, UP);
    game.fx?.smoke?.(pos);
    game.audio?.play?.('car_crash', { position: pos, volume: 1 });
    game.emit?.('crash', { vehicle: v, impulse: v.spec.mass * 12, point: pos });
    // charred paint
    const burnt = v.car.paint.clone(); burnt.color.setHex(0x16120f); burnt.metalness = 0.2; burnt.roughness = 0.8; burnt.clearcoat = 0.1;
    for (const mm of [...(v.car.slots?.paint || []), ...(v.car.slots?.roof || [])]) mm.material = burnt;
    breakGlass(v);
    v.body.applyImpulse({ x: 0, y: v.spec.mass * 5, z: 0 }, true);
    v.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * v.spec.mass * 2, y: 0, z: (Math.random() - 0.5) * v.spec.mass * 2 }, true);
    if (v.ai) v.ai = null;
    removeDriver(v);
  }

  function placeVehicle(v, pos, heading) {
    if (v.ghost) { v.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); v.ghost = false; if (!v.vc) v.vc = makeController(v.body, v.car.wheels, v.spec, v.restLen, v.stiff); }
    const q = new THREE.Quaternion().setFromAxisAngle(UP, heading);
    v.body.setTranslation({ x: pos.x, y: (pos.y || 0) + v.groundOff + 0.08, z: pos.z }, true);
    v.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    v.steerCur = 0;
    v.bodySway = null;
    if (v.frozen) thaw(v);
    else if (v.vc) { // teleported: drop wheel ground caches by rebuilding the controller
      try { world.removeVehicleController(v.vc); } catch (e) { /* ignore */ }
      v.vc = makeController(v.body, v.car.wheels, v.spec, v.restLen, v.stiff);
    }
  }
  function flipReset(v) {
    const t = v.body.translation();
    placeVehicle(v, { x: t.x, y: Math.max(0, t.y - v.groundOff) + 0.6, z: t.z }, v.heading);
  }

  // ------------------------------------------------------------ physics per tick
  const QF = RAPIER.QueryFilterFlags;
  const wheelFilter = (QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC);
  const _up = new THREE.Vector3(), _fw = new THREE.Vector3();

  // engine torque shape over the rev range (0..1 of maxRpm)
  function torqueCurve(v) {
    const m = v.model, n = clamp(v.rpm / m.maxRpm, 0, 1);
    return m.engine === 'diesel' ? 1.15 - 0.45 * n : m.engine === 'electric' ? 1.1 - 0.3 * n : 0.82 + 0.38 * Math.sin(Math.PI * Math.min(1, n * 1.05));
  }
  // automatic gearbox: drives v.rpm / v.gear / v.throttle / v.load for audio and torque
  function gearbox(v, speed, c, engine, brake, dt) {
    const m = v.model, G = m.gears, r = v.spec.r;
    const thr = v.disabled || !v.engineOn ? 0 : Math.abs(c.throttle || 0) * (brake > 0.3 ? 0 : 1);
    if (v.shiftT > 0) v.shiftT -= dt;
    let gear = v.gear;
    if (v.reversing || (speed < -0.5 && c.throttle < 0)) gear = -1;
    else if (gear < 1) gear = 1;
    const wheelRpm = Math.abs(speed) / r * 60 / (2 * Math.PI);
    const ratio = gear === -1 ? G[0] * 1.1 : G[gear - 1];
    let rpm = wheelRpm * ratio * m.final;
    if (gear > 0 && v.shiftT <= 0) {
      if (rpm > m.maxRpm * (0.42 + 0.5 * thr * thr * thr) && gear < G.length && (thr > 0.05 || rpm > m.maxRpm * 0.6)) { gear++; v.shiftT = 0.22; }
      else if ((rpm < m.maxRpm * 0.28 || (thr > 0.95 && rpm < m.maxRpm * 0.5 && gear > 2)) && gear > 1) { gear--; v.shiftT = 0.15; }
      rpm = wheelRpm * G[gear - 1] * m.final;
    }
    // clutch slip / burnout at low speed
    const slipRpm = m.idleRpm + thr * m.maxRpm * (v.spec.drive === 'rwd' && Math.abs(speed) < 6 ? 0.75 : 0.45);
    if (Math.abs(speed) < 7 && gear >= 1) rpm = Math.max(rpm, slipRpm * (1 - Math.abs(speed) / 9) + rpm * 0.3);
    rpm = clamp(Math.max(rpm, m.idleRpm), m.idleRpm, m.maxRpm);
    if (m.engine === 'electric') rpm = Math.max(0, wheelRpm * G[0] * m.final);
    if (v.disabled || !v.engineOn) rpm = 0;
    v.gear = gear;
    v.rpm += (rpm - v.rpm) * Math.min(1, dt * (v.shiftT > 0 ? 18 : 10));
    v.throttle = thr;
    v.load = clamp(thr * (v.shiftT > 0 ? 0.25 : 1) * (0.5 + 0.5 * clamp(Math.abs(engine) / v.spec.engine, 0, 1)), 0, 1);
  }

  // ---- water: stall, float briefly nose-up, sink with heavy drag, no traction; flooded cars stay dead
  const SEA = city?.seaLevel ?? -0.12;
  const _wp = { x: 0, y: 0, z: 0 }, _wi = { x: 0, y: 0, z: 0 };
  function waterTick(v, dt) {
    const body = v.body, t = body.translation();
    const below = t.y < SEA + 0.3 && (city?.isWater ? city.isWater(t.x, t.z) : t.y < SEA);
    const roofY = t.y - v.groundOff + v.spec.roofY;
    v.submerged = v.inWater ? clamp((SEA - roofY) / 0.3, 0, 1) : 0;
    if (!below) return;
    if (!v.inWater) {
      v.inWater = true; v.flooded = true; v.floodT = 0;
      const lv = body.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
      game.fx?.splash?.(new THREE.Vector3(t.x, SEA, t.z), clamp(sp / 15, 0.3, 3));
      game.audio?.play?.('splash', { position: new THREE.Vector3(t.x, SEA, t.z), volume: clamp(sp / 20, 0.3, 1) });
      if (v.engineOn) { v.engineOn = false; game.emit?.('engineStop', { vehicle: v }); }
      body.setLinearDamping(2.5); body.setAngularDamping(2);
      if (v.ai) v.ai = null;
    }
    v.floodT += dt;
    // buoyancy: starts above weight, decays over ~4 s; applied ahead of the centre -> floats nose-up
    const buoy = v.spec.mass * 9.81 * 1.25 * Math.exp(-v.floodT / 1.6) * dt;
    if (buoy > 1) {
      const r = body.rotation(); _q.set(r.x, r.y, r.z, r.w); _v.set(0, 0, v.spec.L * 0.22).applyQuaternion(_q);
      _wp.x = t.x + _v.x; _wp.y = t.y; _wp.z = t.z + _v.z; _wi.y = buoy;
      body.applyImpulseAtPoint(_wi, _wp, true);
    }
    v.engineOn = false;
  }
  const PARK_CTRL = { throttle: 0, steer: 0, brake: 1, handbrake: true };
  const DEAD_CTRL = { throttle: 0, steer: 0, brake: 0.5, handbrake: true };
  function physicsTick(v, dt) {
    // a chassis removed behind our back (another module) must never reach updateVehicle -> wasm panic
    if (v.body.isValid && !v.body.isValid()) { dropVehicle(v); return; }
    if (v.frozen || !v.vc) { v.speed = 0; return; }
    // never drive onto ground whose colliders are not streamed in (would fall through the world)
    if (!v.playerDriven && city?.collidersReadyAt && ((v.edgeT = (v.edgeT || 0) - dt) <= 0)) {
      v.edgeT = 0.2;
      const t0 = v.body.translation(), lv = v.body.linvel();
      const ax = t0.x + clamp(lv.x * 0.6, -12, 12), az = t0.z + clamp(lv.z * 0.6, -12, 12);
      if (!city.collidersReadyAt(t0.x, t0.z) || !city.collidersReadyAt(ax, az)) { freeze(v); v.speed = 0; return; }
    }
    const body = v.body;
    const tt = body.translation();
    if (!Number.isFinite(tt.x) || !Number.isFinite(tt.y) || tt.y < -30) {
      // fell out of the world / NaN: never teleport onto the player; freeze at the last good spot or drop it
      if (v.playerDriven && v.lastGood) { placeVehicle(v, { x: v.lastGood.x, y: v.lastGoodY ?? 0, z: v.lastGood.z }, v.heading || 0); return; }
      if (v.lastGood && groundReady(v.lastGood.x, v.lastGoodY ?? 0, v.lastGood.z)) placeVehicle(v, { x: v.lastGood.x, y: v.lastGoodY ?? 0, z: v.lastGood.z }, 0);
      else if (v.external) freeze(v);
      else removeVehicle(v);
      return;
    }
    if ((v.goodT = (v.goodT || 0) + dt) > 1) { v.goodT = 0; if (v.vc && v.vc.wheelIsInContact(0)) { (v.lastGood ||= new THREE.Vector3()).set(tt.x, 0, tt.z); v.lastGoodY = tt.y - v.groundOff; } }
    // enter/exit transition guard: kill absurd velocity spikes (player capsule overlap etc.)
    if (v.playerDriven !== v.prevPD) {
      v.prevPD = v.playerDriven; v.guardT = 0.8;
      if (v.playerDriven) {
        if (!v.engineOn && !v.disabled && !v.flooded) { v.engineOn = true; v.rpm = v.model.idleRpm * 1.8; game.emit?.('engineStart', { vehicle: v }); }
        v.engineOffT = 0;
      } else { v.shiftT = 0; v.engineOffT = 4; }
    }
    if (v.engineOffT > 0 && !v.playerDriven) { v.engineOffT -= dt; if (v.engineOffT <= 0 && !v.ai) { v.engineOn = false; game.emit?.('engineStop', { vehicle: v }); } }
    if (v.guardT > 0 || (!v.playerDriven && !v.ai && !v.disabled)) {
      if (v.guardT > 0) v.guardT -= dt;
      const lv = body.linvel(), av = body.angvel();
      const maxUp = v.guardT > 0 ? 2.5 : 6;
      if (lv.y > maxUp || Math.abs(av.x) > 2 || Math.abs(av.z) > 2) {
        body.setLinvel({ x: lv.x, y: Math.min(lv.y, maxUp), z: lv.z }, true);
        body.setAngvel({ x: clamp(av.x, -1.5, 1.5), y: av.y, z: clamp(av.z, -1.5, 1.5) }, true);
        v.spikeCount = (v.spikeCount || 0) + 1;
      }
    }
    if (!v.playerDriven && (!v.ai || v.disabled) && body.isSleeping()) { v.speed = 0; v.rpm = 0; v.throttle = 0; v.load = 0; return; }
    const spec = v.spec;
    const vc = v.vc;
    if (v.ai && !v.playerDriven) aiDrive(v, dt);
    waterTick(v, dt);
    const c = v.disabled || v.flooded ? DEAD_CTRL : (v.playerDriven || v.ai ? v.ctrl : PARK_CTRL);
    const speed = vc.currentVehicleSpeed();
    const aspd = Math.abs(speed);
    // CCD only when it matters (fast or player-driven) - it is costly with a dense city
    const lv0 = body.linvel();
    const wantCcd = v.playerDriven;
    if (wantCcd !== v.ccd) { body.enableCcd(wantCcd); v.ccd = wantCcd; }

    // steering (speed sensitive, smoothed)
    const maxSteer = spec.steer * lerp(1, 0.24, clamp(aspd / 42, 0, 1));
    const target = c.steer * maxSteer;
    const rate = (Math.sign(target - v.steerCur) !== Math.sign(v.steerCur) ? 5.0 : 2.8) * spec.steer * lerp(1, 0.5, clamp(aspd / 40, 0, 1));
    v.steerCur += clamp(target - v.steerCur, -rate * dt, rate * dt);

    // longitudinal
    let engine = 0, brake = 0;
    v.reversing = false;
    if (c.brake > 0.05 && !(c.throttle < 0 && speed < 1)) {
      brake = c.brake;
    } else if (c.throttle > 0.02) {
      if (speed < -1) brake = 1;
      else engine = c.throttle * spec.engine * Math.max(0, 1 - Math.pow(Math.max(0, speed) / spec.vmax, 2.2)) * (speed < 6 ? 1.15 : 1) * torqueCurve(v);
    } else if (c.throttle < -0.02) {
      if (speed > 1) brake = 1;
      else { engine = c.throttle * spec.engine * 0.55 * (speed > -8.5 ? 1 : 0); v.reversing = true; }
    } else {
      brake = 0.06; // engine braking / rolling resistance
    }
    v.braking = brake > 0.3;
    if (!v.engineOn) engine = 0;
    gearbox(v, speed, c, engine, brake, dt);
    if (v.shiftT > 0) engine *= 0.2;
    const brakeImpulse = brake * spec.mass * 2.6 * dt; // per wheel
    const drive = spec.drive;
    const nDrive = drive === 'awd' ? 4 : 2;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      vc.setWheelSteering(i, fin((front ? v.steerCur : 0) + (v.wheelDmg[i] ? 0.035 * v.wheelDmg[i] * (i % 2 ? -1 : 1) : 0), 0, 1));
      const driven = drive === 'awd' || (drive === 'fwd' ? front : !front);
      vc.setWheelEngineForce(i, fin(driven ? engine / nDrive : 0, 0, spec.engine * 2));
      let b = brakeImpulse * (front ? 1.15 : 0.85);
      let slip = spec.grip * (front ? 1 : (spec.rearGrip || 1)) * (1 - 0.45 * (v.wheelDmg[i] || 0)), side = 1.0;
      if (!front && spec.powerSlide && engine > 0 && v.shiftT <= 0) {
        const k = spec.powerSlide * clamp(c.throttle, 0, 1) * clamp(Math.abs(c.steer) * 1.5 + 0.3, 0, 1);
        side = 1 - k; slip *= 1 - 0.9 * k;
      }
      if (c.handbrake && !front) {
        b = Math.max(b, spec.mass * 0.9 * dt);
        slip = spec.grip * 0.45; side = 0.75;
      }
      vc.setWheelBrake(i, fin(b, 0, spec.mass * 10));
      vc.setWheelFrictionSlip(i, fin(v.inWater ? 0.03 : slip, spec.grip, 10));
      vc.setWheelSideFrictionStiffness(i, fin(side, 1, 2));
    }
    // sanity: never hand Rapier a body that left the world or holds NaN state
    { const lv = body.linvel(), av = body.angvel();
      if (![lv.x, lv.y, lv.z, av.x, av.y, av.z].every(Number.isFinite) || Math.hypot(lv.x, lv.y, lv.z) > 160) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    vc.updateVehicle(dt, wheelFilter);

    // downforce + upright assist
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _up.set(0, 1, 0).applyQuaternion(_q);
    let grounded = 0;
    for (let i = 0; i < 4; i++) if (vc.wheelIsInContact(i)) grounded++;
    if (grounded >= 2) {
      const df = spec.mass * 9.81 * 0.35 * (spec.downforce || 1) * Math.min(4, (aspd / 30) ** 2);
      body.applyImpulse({ x: -_up.x * df * dt, y: -_up.y * df * dt, z: -_up.z * df * dt }, true);
    }
    if (_up.y < 0.64) {
      _v.copy(_up).cross(UP);
      const len = _v.length();
      if (len > 1e-4) {
        _v.multiplyScalar((1 / len) * spec.mass * 7 * (1 - _up.y) * dt);
        body.applyTorqueImpulse({ x: _v.x, y: _v.y, z: _v.z }, true);
      }
      if (_up.y < 0.3 && aspd < 3) v.flipT += dt; else v.flipT = Math.max(0, v.flipT - dt);
      if (v.flipT > 2.5) { v.flipT = 0; flipReset(v); }
    } else v.flipT = 0;
    // airborne: mild pitch/roll stabilization so jumps land wheels-down
    if (grounded === 0) {
      const av = body.angvel();
      body.setAngvel({ x: av.x * 0.985, y: av.y, z: av.z * 0.985 }, true);
    }
    // yaw-rate cap keeps spins catchable
    {
      const av = body.angvel();
      const cap = 2.2;
      if (Math.abs(av.y) > cap) body.setAngvel({ x: av.x, y: av.y - (av.y - Math.sign(av.y) * cap) * 0.15, z: av.z }, true);
    }
    v.speed = speed;
  }

  // ------------------------------------------------------------ AI
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _rt = new THREE.Vector3(), _tgt = new THREE.Vector3();

  function aiAssign(v, info) {
    const ai = v.ai;
    ai.edge = info.edge; ai.dir = info.dir; ai.d = info.d ?? 0; ai.lane = Math.min(info.lane ?? 0, driveLaneMax(info.edge, info.dir)); ai.next = null; ai.stuckT = 0; ai.waitT = 0;
  }
  function laneOfV(v) { return laneOffset(v.ai.edge, v.ai.dir, v.ai.lane); }
  function snapAI(v, t) {
    let best = null, bd = 1e9;
    for (const e of net.near(t.x, t.z, 40)) {
      const pr = project(e, t.x, t.z);
      if (pr.dist < bd) { bd = pr.dist; best = { e, pr }; }
    }
    if (!best || bd > 25) return false;
    const e = best.e, sd = {};
    sampleEdge(e, best.pr.s, sd);
    let dir = sd.dx * _f.x + sd.dz * _f.z >= 0 ? 1 : -1;
    if (laneCount(e, dir) <= 0) dir = -dir;
    const n = laneCount(e, dir);
    aiAssign(v, { edge: e, dir, d: dir > 0 ? best.pr.s : e.len - best.pr.s, lane: Math.max(0, Math.min(n - 1, Math.round(Math.abs(best.pr.lat) / e.laneW - 0.5))) });
    return true;
  }
  function endNodeOf(ai) { return ai.dir > 0 ? ai.edge.b : ai.edge.a; }
  function chooseNext(v) {
    const ai = v.ai, node = endNodeOf(ai);
    const opts = exitsAt(net, node, ai.edge);
    if (!opts.length) { ai.next = null; ai.deadEnd = true; return; }
    ai.deadEnd = false;
    const din = edgeDirAt(ai.edge, ai.dir, false);
    let tot = 0;
    for (const o of opts) {
      const dout = edgeDirAt(o.edge, o.dir, true);
      const cross = din.x * dout.z - din.z * dout.x, dot = din.x * dout.x + din.z * dout.z;
      o.ang = Math.atan2(cross, dot); // >0 = turning left (heading convention)
      const a = Math.abs(o.ang);
      o.w = o.edge === ai.edge ? 0.02 : a < 0.45 ? 1.0 : a < 2.4 ? 0.45 : 0.05;
      // prefer bigger roads a little
      o.w *= 0.7 + 0.15 * Math.min(4, laneCount(o.edge, o.dir));
      if (MINOR.test(o.edge.kind || '')) o.w *= 0.04;
      tot += o.w;
    }
    let r = Math.random() * tot, pick = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
    const n = driveLaneMax(pick.edge, pick.dir) + 1;
    const lane = pick.ang < -0.45 ? n - 1 : pick.ang > 0.45 ? 0 : Math.min(ai.lane, n - 1);
    ai.next = { edge: pick.edge, dir: pick.dir, lane, ang: pick.ang };
  }
  const _lp1 = {}, _lp2 = {};
  // lane point at distance `ahead` beyond the car's current position along its route
  function routePoint(ai, ahead, out) {
    const rem = ai.edge.len - ai.d;
    if (ahead <= rem || !ai.next) return lanePointAt(ai.edge, ai.dir, Math.min(ai.edge.len, ai.d + ahead), laneOffset(ai.edge, ai.dir, ai.lane), out);
    const n = ai.next;
    return lanePointAt(n.edge, n.dir, Math.min(n.edge.len, ahead - rem), laneOffset(n.edge, n.dir, n.lane), out);
  }

  function aiDrive(v, dt) {
    const ai = v.ai, body = v.body;
    const t = body.translation();
    _p.set(t.x, t.y, t.z);
    const r = body.rotation(); _q.set(r.x, r.y, r.z, r.w);
    _f.set(0, 0, 1).applyQuaternion(_q); _f.y = 0; _f.normalize();
    const left = _v2.set(_f.z, 0, -_f.x); // left of forward (heading 0 -> +X)
    if (v.chaseTarget) { chaseDrive(v, dt, t, left); return; }
    if (ai.fleeT > 0) ai.fleeT -= dt;
    const fleeing = ai.fleeT > 0;
    if (!ai.edge && !snapAI(v, t)) { v.ctrl.throttle = 0; v.ctrl.brake = 1; ai.stuckT += dt; return; }
    // progress along the current edge
    const pr = project(ai.edge, t.x, t.z, ai.dir > 0 ? ai.d : ai.edge.len - ai.d);
    ai.d = ai.dir > 0 ? pr.s : ai.edge.len - pr.s;
    if (pr.dist > 14) { ai.edge = null; return; }
    if (!ai.next && !ai.deadEnd) chooseNext(v);
    if (ai.d > ai.edge.len - 0.8 && ai.next) {
      const n = ai.next;
      const p2 = project(n.edge, t.x, t.z);
      ai.edge = n.edge; ai.dir = n.dir; ai.lane = n.lane; ai.d = n.dir > 0 ? p2.s : n.edge.len - p2.s; ai.next = null; ai.waitT = 0;
      chooseNext(v);
    } else if (ai.d > ai.edge.len - 0.8 && ai.deadEnd) {
      if (!inView(_p)) { respawnAI(v); return; }
      ai.dir = -ai.dir; ai.d = ai.edge.len - ai.d; ai.deadEnd = false; chooseNext(v); // U-turn
    }
    const spd = Math.max(0, v.speed);
    // pure pursuit along the route
    const Ld = Math.max(6, spd * 0.9);
    routePoint(ai, Ld, _lp1);
    _tgt.set(_lp1.x - t.x, 0, _lp1.z - t.z);
    const lx = _tgt.dot(left), lz = _tgt.dot(_f);
    const wb = v.spec.wb;
    let steerAng = Math.atan2(2 * wb * lx, Math.max(1, lx * lx + lz * lz));
    if (lz < 0) steerAng = Math.sign(lx || 1) * v.spec.steer;
    const maxSteer = v.spec.steer * lerp(1, 0.24, clamp(spd / 42, 0, 1));
    v.ctrl.steer = clamp(steerAng / maxSteer, -1, 1);

    // target speed: speed limit, curves, junction turns
    const limit = Math.min(v.spec.vmax * 0.85, (ai.edge.speedKmh || 40) / 3.6 * ai.cruiseK);
    let desired = fleeing ? Math.min(v.spec.vmax * 0.8, limit * 1.6 + 6) : limit;
    const distToNode = ai.edge.len - ai.d;
    if (ai.next && distToNode < 40) {
      const a = Math.abs(ai.next.ang);
      const vTurn = a > 2.4 ? 3 : a > 1.1 ? 5 : a > 0.6 ? 8 : a > 0.3 ? 12 : desired;
      desired = Math.min(desired, lerp(vTurn, desired, clamp((distToNode - 6) / 30, 0, 1)));
    }
    // curvature ahead on the polyline (roundabouts, ramps, bends)
    routePoint(ai, Math.min(30, 8 + spd * 1.2), _lp2);
    const curve = Math.abs(Math.atan2(_lp1.fx * _lp2.fz - _lp1.fz * _lp2.fx, _lp1.fx * _lp2.fx + _lp1.fz * _lp2.fz));
    if (curve > 0.25) desired = Math.min(desired, Math.max(5, 17 - curve * 12));
    if (Math.abs(steerAng) > 0.25) desired = Math.min(desired, 7);

    // obstacles: other vehicles + player
    let block = 99;
    for (const o of list) {
      if (o === v) continue;
      const ot = o.body.translation();
      const dx = ot.x - t.x, dz = ot.z - t.z;
      if (dx * dx + dz * dz > 900 || Math.abs(ot.y - t.y) > 4) continue;
      const a = dx * _f.x + dz * _f.z, lat = Math.abs(dx * left.x + dz * left.z);
      if (a > 0 && a < 25 && lat < 1.9 + Math.min(0.6, Math.abs(steerAng))) block = Math.min(block, a - (o.spec.L + v.spec.L) / 2);
    }
    let byPlayer = false;
    for (const o of list) {
      if (!o.playerDriven || o === v) continue;
      const ot = o.body.translation();
      const dx = ot.x - t.x, dz = ot.z - t.z;
      const a = dx * _f.x + dz * _f.z, lat = Math.abs(dx * left.x + dz * left.z);
      if (a > 0 && a < 12 && lat < 2.2) byPlayer = true;
    }
    const pp = game.player?.position;
    if (pp && !game.player?.state?.inVehicle) {
      const dx = pp.x - t.x, dz = pp.z - t.z;
      const a = dx * _f.x + dz * _f.z, lat = Math.abs(dx * left.x + dz * left.z);
      if (a > 0 && a < 16 && lat < 2.0) { block = Math.min(block, a - v.spec.L / 2); byPlayer = true; }
    }
    const peds = game.peds?.list;
    if (peds) {
      for (const ped of peds) {
        if (!ped || ped.dead) continue;
        const q2 = ped.pos || ped.root?.position; if (!q2) continue;
        const dx = q2.x - t.x, dz = q2.z - t.z;
        if (dx * dx + dz * dz > 300) continue;
        const a = dx * _f.x + dz * _f.z, latS = dx * left.x + dz * left.z, lat = Math.abs(latS);
        if (a > 0 && a < 15 && lat < 1.8) {
          block = Math.min(block, a - v.spec.L / 2);
          if (a < 11 && v.speed > 4) v.ctrl.steer = clamp(v.ctrl.steer - Math.sign(latS || 1) * 0.45, -1, 1);
        }
      }
    }
    // signals / yielding at the junction ahead
    const node = net.nodes.get(endNodeOf(ai));
    if (node && node.edges.length >= 3 && distToNode < 45 && !fleeing) {
      let clear = 4;
      for (const e of node.edges) if (e !== ai.edge) clear = Math.max(clear, e.width / 2 + 1.5);
      const stopAt = distToNode - clear - v.spec.L / 2; // distance from our nose to the stop line
      const sig = signalState(net, node.id, ai.edge);
      let mustStop = false;
      if (sig === 'red') mustStop = stopAt > -1.5;
      else if (sig === 'yellow') mustStop = stopAt > 6 && spd < stopAt * 1.2 + 3 ? true : stopAt > 14;
      else if (!sig && ai.next && stopAt < 14 && stopAt > -1) {
        // uncontrolled junction: yield to anyone already moving through it
        for (const o of list) {
          if (o === v) continue;
          const ot = o.body.translation();
          const dn = Math.hypot(ot.x - node.x, ot.z - node.z);
          if (dn < clear + 3 && Math.abs(o.speed) > 1.5 && (!o.ai || o.ai.edge !== ai.edge)) { mustStop = true; break; }
        }
        if (Math.abs(ai.next.ang) > 0.45) desired = Math.min(desired, 6);
      }
      if (mustStop) { block = Math.min(block, stopAt + 2.5); ai.waitT += dt; } else ai.waitT = 0;
    }
    if (fleeing) block = Math.max(block, 99 * (block > 6 ? 1 : 0) || block);
    // ray for anything else (props, unknown obstacles)
    const fr = v.spec.L / 2 + 0.2;
    ray.origin = { x: t.x + _f.x * fr, y: t.y + 0.15, z: t.z + _f.z * fr };
    ray.dir = { x: _f.x, y: 0, z: _f.z };
    if ((tickN + v.id) % 3 === 0) {
      // only keep plain numbers between ticks (a stored hit would reference a collider that may be gone)
      const hit = world.castRay(ray, 12, true, QF.EXCLUDE_SENSORS, undefined, undefined, body);
      if (hit) { const pb = hit.collider.parent(); ai.rayToi = hit.timeOfImpact ?? hit.toi; ai.rayFixed = !pb || pb.isFixed(); } else ai.rayToi = null;
    }
    if (ai.rayToi != null) {
      if (ai.rayFixed) { if (ai.rayToi < 4) block = Math.min(block, ai.rayToi); }
      else block = Math.min(block, ai.rayToi);
    }
    if (block < 99) desired = Math.min(desired, Math.max(0, (block - 2.5) * 0.9));

    const err = desired - v.speed;
    if (desired < 0.3) { v.ctrl.throttle = 0; v.ctrl.brake = v.speed > 0.2 ? 1 : 0.6; }
    else if (err < -1.2) { v.ctrl.throttle = 0; v.ctrl.brake = clamp(-err / 6, 0.15, 1); }
    else { v.ctrl.brake = 0; v.ctrl.throttle = clamp(err * 0.35 + 0.15, 0, 0.9); }
    v.ctrl.handbrake = false;

    if (byPlayer && v.speed < 1) {
      ai.honkT += dt;
      if (ai.honkT > 1.6) {
        ai.honkT = -4 - Math.random() * 3;
        const hp = new THREE.Vector3(t.x, t.y, t.z);
        if (game.audio?.play) game.audio.play('horn', { position: hp, volume: 0.6 });
        else if (pp && distXZ(t, pp) < 40) horn(v);
      }
    } else if (ai.honkT > 0) ai.honkT = 0;

    // stuck detection (waiting at a red light does not count)
    if (Math.abs(v.speed) < 0.5 && ai.waitT <= 0) ai.stuckT += dt; else ai.stuckT = 0;
  }

  // aggressive pursuit: ignores lanes, rams, avoids buildings with forward rays
  const _cr = new THREE.Vector3();
  function rayFree(v, t, dx, dz, len) {
    const fr = v.spec.L / 2 + 0.15;
    ray.origin = { x: t.x + dx * fr, y: t.y + 0.1, z: t.z + dz * fr };
    ray.dir = { x: dx, y: 0, z: dz };
    const hit = world.castRay(ray, len, true, QF.EXCLUDE_SENSORS | QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC, undefined, undefined, v.body);
    return hit ? (hit.timeOfImpact ?? hit.toi) : len;
  }
  function chaseDrive(v, dt, t, left) {
    const ai = v.ai, ch = ai.chase ||= { stuckT: 0, revT: 0 };
    const tg = v.chaseTarget;
    const tx = tg.x ?? tg.position?.x, tz = tg.z ?? tg.position?.z;
    const dx = tx - t.x, dz = tz - t.z;
    const dist = Math.hypot(dx, dz);
    const lx = dx * left.x + dz * left.z, lz = dx * _f.x + dz * _f.z;
    let steerAng = Math.atan2(lx, lz) * 1.4;
    const spd = v.speed;
    // building avoidance
    const len = 8 + Math.max(0, spd) * 0.8;
    const c = rayFree(v, t, _f.x, _f.z, len);
    if (c < len) {
      const a = 0.5, ca = Math.cos(a), sa = Math.sin(a);
      const lxv = _f.x * ca + left.x * sa, lzv = _f.z * ca + left.z * sa;
      const rxv = _f.x * ca - left.x * sa, rzv = _f.z * ca - left.z * sa;
      const lf = rayFree(v, t, lxv, lzv, len), rf = rayFree(v, t, rxv, rzv, len);
      steerAng += (lf >= rf ? 1 : -1) * (1 - c / len) * 1.2;
    }
    const maxSteer = v.spec.steer * lerp(1, 0.3, clamp(Math.abs(spd) / 42, 0, 1));
    let desired = dist > 35 ? 34 : Math.max(7, dist * 0.8);
    if (c < 10 && spd > 14) desired = Math.min(desired, 12);
    if (Math.abs(steerAng) > 0.9 && spd > 14) desired = Math.min(desired, 14);
    // unstick: reverse with opposite lock
    if (ch.revT > 0) {
      ch.revT -= dt;
      v.ctrl.throttle = -1; v.ctrl.brake = 0; v.ctrl.handbrake = false;
      v.ctrl.steer = clamp(-Math.sign(steerAng || 1), -1, 1);
      return;
    }
    if (Math.abs(spd) < 1.2) { ch.stuckT += dt; if (ch.stuckT > 1.4) { ch.stuckT = 0; ch.revT = 1.3; } } else ch.stuckT = 0;
    v.ctrl.steer = clamp(steerAng / maxSteer, -1, 1);
    const err = desired - spd;
    if (err < -4) { v.ctrl.throttle = 0; v.ctrl.brake = clamp(-err / 10, 0.2, 1); }
    else { v.ctrl.brake = 0; v.ctrl.throttle = clamp(err * 0.3 + 0.4, 0, 1); }
    v.ctrl.handbrake = Math.abs(steerAng) > 1.1 && spd > 11;
    ai.stuckT = 0;
  }

  let respawnCount = 0;
  function respawnAI(v) {
    respawnCount++;
    const pp = game.player?.position || city?.playerSpawn || new THREE.Vector3();
    const info = randomLanePos(pp, 80, PHYS_R - 20, true, 40, v.spec) || randomLanePos(pp, 45, PHYS_R - 20, false, 40, v.spec);
    if (!info) return false;
    placeVehicle(v, info.pos, info.heading);
    aiAssign(v, info);
    return true;
  }

  // ------------------------------------------------------------ prebuild every model during the loading screen
  // (a cold parametric build costs ~100-200 ms; doing it in-game caused long frames)
  {
    const t0 = performance.now();
    const keys = ALL_KEYS.slice();
    const sportKeys = keys.filter((k) => ['sports', 'super', 'muscle'].includes(CAR_TYPES[k].cls));
    for (const [k, kit] of [...keys.map((k) => [k, 'base']), ...sportKeys.map((k) => [k, 'sport'])]) {
      if (!isBuilt(k, kit)) { try { prebuild(k, kit); } catch (e) { console.warn('[vehicles] prebuild', k, e); } }
      await new Promise((r) => setTimeout(r, 0)); // keep the loading screen alive
    }
    console.info(`[vehicles] prebuilt ${keys.length} models in ${Math.round(performance.now() - t0)} ms`);
  }

  // ------------------------------------------------------------ spawn
  const spawn = city?.playerSpawn || new THREE.Vector3();
  // weighted class mixes -> random model of that class
  const pickW = (w) => { let tot = 0; for (const k in w) tot += w[k]; let r = Math.random() * tot; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };
  const fromClass = (cls) => { const ks = CLASSES[cls] || CLASSES.sedan; return ks[(Math.random() * ks.length) | 0]; };
  const TRAFFIC_MIX = { sedan: 26, compact: 20, suv: 18, pickup: 8, van: 7, taxi: 7, sports: 4, muscle: 2, police: 3, truck: 3, bus: 1.5, super: 0.6 };
  const PARKED_MIX = { sedan: 26, compact: 22, suv: 18, pickup: 9, van: 7, sports: 6, muscle: 4, truck: 2, super: 1 };
  const EXOTIC_MIX = { super: 4, sports: 5, muscle: 2 };
  const colorFor = () => null; // colour comes from the model's palette via rollVariant
  const randomModel = (mix) => {
    const k = fromClass(pickW(mix));
    // police class: unmarked/SUV/sedan; never ambulance/fire in random traffic too often
    return k;
  };
  const zoneAt = (p) => city?.zoneAt?.(p.x, p.z) || 'commercial';
  const RICH = new Set(['beach', 'nightlife', 'downtown', 'business']);
  function parkedTypeFor(pos) {
    if (RICH.has(zoneAt(pos)) && Math.random() < 0.2) return randomModel(EXOTIC_MIX);
    let k = randomModel(PARKED_MIX);
    if (CAR_TYPES[k].police && CAR_TYPES[k].police !== 'hidden' && Math.random() < 0.7) k = 'sedan';
    return k;
  }
  function trafficTypeFor() {
    let k = randomModel(TRAFFIC_MIX);
    if ((k === 'firetruck' || k === 'ambulance') && Math.random() < 0.6) k = 'atlas_box';
    if (CAR_TYPES[k].cls === 'super' && Math.random() < 0.5) k = fromClass('sports');
    return k;
  }
  // a hero sports car right next to the player spawn + special spawns close by so they are found quickly
  const specials = new Set();
  const pendingSpecials = [['sports', 0xff5a1f, 'Solano GT 400', 18], ['super', 0xffc21a, null, 30], ['muscle', 0x1d3f8f, null, 30], ['roadster', 0xb3121b, null, 30]];
  function trySpecials() {
    try { world.updateSceneQueries?.(); } catch (e) { /* older rapier */ }
    for (const entry of pendingSpecials.slice()) {
      const [type, color, name, r0] = entry;
      let sp = null;
      for (let k = 0; k < 8 && !sp; k++) sp = parkedSpot(spawn, type === 'sports' ? 0 : 6, r0 + k * 14, false, CAR_TYPES[type]);
      if (sp) { specials.add(createVehicle(type, color, sp.pos, sp.heading, name ? { name } : {})); pendingSpecials.splice(pendingSpecials.indexOf(entry), 1); }
    }
  }
  trySpecials();
  for (let k = 0; k < 40 && list.length < 14; k++) {
    const s = parkedSpot(spawn, 10, 170 + k * 8);
    if (s) { const type = parkedTypeFor(s.pos); createVehicle(type, colorFor(type), s.pos, s.heading, { locked: Math.random() < 0.4 }); }
  }
  for (let k = 0; k < 60 && list.filter((v) => v.ai).length < 12; k++) {
    const info = randomLanePos(spawn, 25, 260 + k * 10, false);
    if (!info) continue;
    const type = trafficTypeFor();
    const v = createVehicle(type, colorFor(type), info.pos, info.heading, { ai: true });
    aiAssign(v, info);
  }

  // ------------------------------------------------------------ traffic density manager (stream around the player)
  const PHYS_R = 190; // simulate cars within this radius of the player (colliders stream to ~250-300 m)
  const DENS = { downtown: 1.45, business: 1.35, causeway: 1.25, nightlife: 1.25, commercial: 1.1, beach: 0.95, residential: 0.8, port: 0.7, industrial: 0.7, park: 0.55, water: 0.5 };
  let mgrT = 0;
  // simulation tiers: full ray-cast physics within SIM_R; beyond it AI traffic becomes a kinematic
  // "ghost" that follows its lane on the road graph (no controller, no wheel rays), parked cars freeze.
  const SIM_R = 120;
  function physicsRange(pp) {
    for (const v of list) {
      if (v.playerDriven) { if (v.ghost) fromGhost(v, true); if (v.frozen) thaw(v, true); continue; }
      const t = v.body.translation();
      const d = distXZ(t, pp);
      const aiCar = v.ai && !v.chaseTarget && !v.disabled;
      if (aiCar) {
        if (v.frozen && d < PHYS_R) { thaw(v, true); toGhost(v); }
        else if (!v.ghost && !v.frozen && d > SIM_R + 10 && v.ai.edge) toGhost(v);
        else if (v.ghost && d < SIM_R - 10) fromGhost(v);
      } else {
        if (v.ghost) fromGhost(v, true);
        if (!v.frozen && d > SIM_R + 10) freeze(v);
        else if (v.frozen && d < SIM_R - 10) thaw(v);
      }
    }
  }
  const RBT = RAPIER.RigidBodyType;
  function toGhost(v) {
    if (v.ghost || !v.ai) return;
    if (!v.ai.edge) { freeze(v); return; }
    if (v.vc) { try { world.removeVehicleController(v.vc); } catch (e) { /* ignore */ } v.vc = null; }
    try { v.body.setEnabled(true); } catch (e) { /* ignore */ }
    v.body.setBodyType(RBT.KinematicPositionBased, true);
    if (v.ccd) { v.body.enableCcd(false); v.ccd = false; }
    v.ghost = true; v.frozen = false; v.ghostSpeed = Math.max(0, v.speed || 8); v.hitCd = 0.6;
    v.ai.next = null; v.ai.deadEnd = false;
  }
  function fromGhost(v, force = false) {
    if (!v.ghost) return;
    const t = v.body.translation();
    if (!force && !groundReady(t.x, t.y - v.groundOff, t.z)) return;
    v.body.setBodyType(RBT.Dynamic, true);
    const r = v.body.rotation(); _q.set(r.x, r.y, r.z, r.w); _v.set(0, 0, 1).applyQuaternion(_q);
    const sp = v.ghostSpeed || 0;
    v.body.setLinvel({ x: _v.x * sp, y: 0, z: _v.z * sp }, true);
    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    v.vc = makeController(v.body, v.car.wheels, v.spec, v.restLen, v.stiff);
    v.ghost = false; v.bodySway = null; v.hitCd = 0.6;
  }
  const _gp = {}, _gq = new THREE.Quaternion(), _gTr = { x: 0, y: 0, z: 0 }, _gRo = { x: 0, y: 0, z: 0, w: 1 };
  function ghostTick(v, dt) {
    const ai = v.ai;
    if (!ai || !ai.edge) { v.speed = 0; return; }
    // speed: limit, junction slow-down, keep distance to the car ahead (cheap scan)
    let desired = Math.min(v.spec.vmax * 0.8, (ai.edge.speedKmh || 40) / 3.6 * ai.cruiseK);
    const distToNode = ai.edge.len - ai.d;
    if (!ai.next && !ai.deadEnd) chooseNext(v);
    if (ai.next && distToNode < 30 && Math.abs(ai.next.ang) > 0.45) desired = Math.min(desired, lerp(6, desired, clamp((distToNode - 5) / 25, 0, 1)));
    if ((tickN + v.id) % 6 === 0) {
      const t = v.body.translation();
      const fx = Math.sin(v.ghostHeading || 0), fz = Math.cos(v.ghostHeading || 0);
      let block = 99;
      for (let i = 0; i < list.length; i++) {
        const o = list[i]; if (o === v) continue;
        const ot = o.body.translation();
        const dx = ot.x - t.x, dz = ot.z - t.z;
        if (dx * dx + dz * dz > 625) continue;
        const a = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (a > 0 && lat < 2) block = Math.min(block, a - (o.spec.L + v.spec.L) / 2);
      }
      ai.ghostBlock = block;
    }
    if (ai.ghostBlock < 99) desired = Math.min(desired, Math.max(0, (ai.ghostBlock - 3) * 0.9));
    const sp = v.ghostSpeed = v.ghostSpeed + clamp(desired - v.ghostSpeed, -6 * dt, 3 * dt);
    ai.d += sp * dt;
    if (ai.d > ai.edge.len) {
      if (ai.next) { const n = ai.next; ai.d -= ai.edge.len; ai.edge = n.edge; ai.dir = n.dir; ai.lane = n.lane; ai.next = null; chooseNext(v); }
      else { ai.dir = -ai.dir; ai.d = 0; ai.deadEnd = false; }
    }
    lanePointAt(ai.edge, ai.dir, Math.min(ai.edge.len, ai.d), laneOffset(ai.edge, ai.dir, ai.lane), _gp);
    const h = Math.atan2(_gp.fx, _gp.fz);
    // smooth heading through corners
    let dh = h - (v.ghostHeading ?? h); dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    v.ghostHeading = (v.ghostHeading ?? h) + dh * Math.min(1, dt * 6);
    const gy = _gp.y != null ? _gp.y : (city?.groundHeightAt?.(_gp.x, _gp.z) ?? 0);
    _gTr.x = _gp.x; _gTr.y = gy + v.groundOff; _gTr.z = _gp.z;
    _gq.setFromAxisAngle(UP, v.ghostHeading);
    _gRo.x = _gq.x; _gRo.y = _gq.y; _gRo.z = _gq.z; _gRo.w = _gq.w;
    v.body.setNextKinematicTranslation(_gTr);
    v.body.setNextKinematicRotation(_gRo);
    v.speed = sp;
    ai.stuckT = 0;
  }
  // freeze: controller removed (its wheels cache ground-collider handles), body disabled
  function freeze(v) {
    if (v.frozen) return;
    v.frozen = true;
    if (v.vc) { try { world.removeVehicleController(v.vc); } catch (e) { /* ignore */ } v.vc = null; }
    try { v.body.setEnabled(false); } catch (e) { /* old rapier */ }
    v.speed = 0;
  }
  function groundReady(x, y, z) {
    if (city?.collidersReadyAt && !city.collidersReadyAt(x, z)) return false;
    const gh = world.castRay(new RAPIER.Ray({ x, y: y + 2.5, z }, { x: 0, y: -1, z: 0 }), 7, true, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS);
    return !!gh;
  }
  function thaw(v, force = false) {
    if (!v.frozen) return;
    const t = v.body.translation();
    if (!force && !groundReady(t.x, t.y - v.groundOff, t.z)) return;
    v.frozen = false;
    try { v.body.setEnabled(true); v.body.wakeUp(); } catch (e) { /* ignore */ }
    if (!v.vc) v.vc = makeController(v.body, v.car.wheels, v.spec, v.restLen, v.stiff);
    v.bodySway = null;
  }
  // the CITY tells us before it drops a tile's colliders: freeze everything standing on it
  city?.onTileCollidersRemoving?.((b) => {
    const pad = 6;
    for (const v of list) {
      if (v.playerDriven || v.frozen) continue;
      const t = v.body.translation();
      if (t.x > b.minX - pad && t.x < b.maxX + pad && t.z > b.minZ - pad && t.z < b.maxZ + pad) freeze(v);
    }
  });
  function trafficManager(dt) {
    mgrT -= dt;
    if (mgrT > 0) return;
    mgrT = 0.5;
    syncQueries();
    const pp = game.player?.position;
    if (!pp) return;
    physicsRange(pp);
    if (pendingSpecials.length && (game.clock?.elapsed ?? 0) < 90) trySpecials();
    const h = game.timeOfDay ?? 12;
    const tf = h < 5 ? 0.4 : h < 6.5 ? 0.6 : (h > 7 && h < 9.5) || (h > 16 && h < 19) ? 1.2 : h > 22 ? 0.65 : 1;
    const target = clamp(Math.round(11 * (DENS[zoneAt(pp)] ?? 1) * tf), 4, 16);
    const ais = list.filter((v) => v.ai && !v.chaseTarget && !v.playerDriven && !v.disabled && !v.external);
    // recycle far / stuck traffic
    let moved = 0;
    for (const v of ais) {
      const t = v.body.translation();
      const far = distXZ(t, pp) > PHYS_R + 15, stuck = v.ai.stuckT > 10;
      if ((far || stuck) && moved < 2) {
        if (stuck && !far && inView(new THREE.Vector3(t.x, t.y, t.z))) continue;
        if (ais.length > target + 1 && far) { removeVehicle(v); moved++; continue; }
        if (respawnAI(v)) moved++;
      }
    }
    if (ais.length < target && moved < 2) {
      const info = randomLanePos(pp, 80, PHYS_R - 20, true);
      if (info) { const type = trafficTypeFor(); const v = createVehicle(type, colorFor(type), info.pos, info.heading, { ai: true }); aiAssign(v, info); }
    }
    // parked cars: keep ~10 at the curbs near the player
    const parked = list.filter((v) => !v.ai && !v.playerDriven && !v.everDriven && !specials.has(v));
    const nearParked = parked.filter((v) => distXZ(v.body.translation(), pp) < PHYS_R).length;
    if (nearParked < 10) {
      const farP = parked.find((v) => distXZ(v.body.translation(), pp) > PHYS_R + 60);
      const sp = parkedSpot(pp, 50, PHYS_R - 20, true);
      if (sp) {
        if (farP) { placeVehicle(farP, sp.pos, sp.heading); farP.locked = Math.random() < 0.4; }
        else if (parked.length < 18) { const type = parkedTypeFor(sp.pos); createVehicle(type, colorFor(type), sp.pos, sp.heading, { locked: Math.random() < 0.4 }); }
      }
    }
  }
  // ------------------------------------------------------------ hooks
  // Rapier's query pipeline (used by the wheel ray casts and every castRay / intersection query) is only
  // refreshed inside world.step(). Streaming removes/adds static colliders (and we enable/disable far
  // cars) between steps, so a ray cast against the stale BVH can touch a freed collider -> wasm panic
  // ("unreachable" in update_vehicle). Refresh it before we query anything.
  function syncQueries() { try { world.updateSceneQueries(); } catch (e) { /* older rapier: no-op */ } }
  let tickN = 0;
  function vehiclesFixed(dt) {
    if (!(dt > 0 && dt < 0.2)) return;
    tickN++;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      try { if (v.ghost) ghostTick(v, dt); else physicsTick(v, dt); } catch (e) { console.error('[vehicles] tick', v.name, e); }
    }
  }
  Object.defineProperty(vehiclesFixed, 'name', { value: 'vehiclesFixed' }); // survives minification for the profiler
  game.fixedHooks.push(vehiclesFixed);

  // ------------------------------------------------------------ per-frame visuals
  let lastT = -1;
  const _spotPos = new THREE.Vector3();
  function update(dt) {
    const et = game.clock?.elapsed ?? performance.now() / 1000;
    if (et === lastT) return;
    lastT = et;
    const tod = game.timeOfDay ?? 18;
    const night = tod < 6.6 || tod > 18.7;
    const pp = game.player?.position;
    let playerCar = null;
    let sirenBest = null, sirenBestD = 1e9;
    let driverBuiltThisFrame = false;
    try { trafficManager(dt); } catch (e) { console.error('[traffic]', e); }
    let fireBest = null, fireBestD = 1e9;
    for (const v of list) {
      const t = v.body.translation(), r = v.body.rotation();
      v.mesh.position.set(t.x, t.y, t.z);
      v.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      v.speedKmh = Math.abs(v.speed) * 3.6;
      { const lv = v.body.linvel(); v.velocity.set(lv.x, lv.y, lv.z); }
      if (game.camera) {
        const cd = game.camera.position.distanceTo(v.mesh.position);
        const wd = cd < (v.spec.heavy ? 160 : 70);
        if (wd !== v._wheelDetail) { v._wheelDetail = wd; for (const w of v.car.wheels) { for (const dm of w.detail) dm.visible = wd; if (w.lo) w.lo.visible = !wd; } }
      }
      v.lightsOn = night && !v.disabled && (v.ai || v.playerDriven);
      if (v.flooded) { const ft = v.floodT || 0; v.lightsOn = ft < 4 && Math.random() < 1 - ft / 4.5; }
      if (v.playerDriven) {
        playerCar = v; v.everDriven = true;
        if (v.ai) { v.ai = null; }
        v.parked = false;
      }
      // visual body roll / pitch from local acceleration (spring-damped for a weighty feel)
      if (dt > 0 && dt < 0.2) {
        const lv = v.body.linvel();
        const bs = v.bodySway ||= { pv: new THREE.Vector3(lv.x, lv.y, lv.z), ax: 0, az: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0 };
        _q.set(r.x, r.y, r.z, r.w).invert();
        _v.set((lv.x - bs.pv.x) / dt, (lv.y - bs.pv.y) / dt, (lv.z - bs.pv.z) / dt).applyQuaternion(_q); // world accel -> local
        bs.pv.set(lv.x, lv.y, lv.z);
        {
          const dv = Math.hypot(_v.x, _v.z, Math.min(0, _v.y + 9.81) * 0.5) * dt; // horizontal-ish velocity change this frame (m/s)
          if (v.ghost || v.frozen) v.hitCd = 0.6; // kinematic/frozen tiers: no impact damage from tier switches
          if (dv > 3.2 && (v.hitCd || 0) <= 0) {
            v.hitCd = 0.25;
            // impact point: opposite of the acceleration direction, projected to the body box
            _lp.set(-_v.x, 0, -_v.z).normalize();
            const sx = Math.abs(_lp.x) > 1e-3 ? (v.spec.W / 2) / Math.abs(_lp.x) : 1e9;
            const sz = Math.abs(_lp.z) > 1e-3 ? (v.spec.L / 2) / Math.abs(_lp.z) : 1e9;
            _lp.multiplyScalar(Math.min(sx, sz));
            _lp.y = v.spec.belt * 0.6 - v.groundOff;
            applyDamage(v, 2.2 * Math.pow(dv - 3, 1.75) + 4, _lp.clone());
            if (dv > 4.5) {
              const wp = _lp.clone().applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_v2.set(t.x, t.y, t.z));
              game.emit?.('crash', { vehicle: v, impulse: dv * v.spec.mass, point: wp });
              game.fx?.sparks?.(wp, _v2.set(0, 1, 0));
              if (v.playerDriven && impactCooldown <= 0) {
                if (game.audio?.play) game.audio.play('car_crash', { position: wp, volume: Math.min(1, (dv - 4) / 10) });
                else playImpact(Math.min(1, (dv - 4.5) / 10));
                impactCooldown = 0.35;
              }
            }
          }
          else if (dv > 0.9 && Math.abs(v.speed) > 4 && (v.scrapeCd || 0) <= 0 && pp && distXZ(t, pp) < 80) {
            // scraping along a wall / another car: sparks at the contact side
            v.scrapeCd = 0.06;
            _lp.set(-_v.x, 0, -_v.z).normalize();
            const sx = Math.abs(_lp.x) > 1e-3 ? (v.spec.W / 2) / Math.abs(_lp.x) : 1e9;
            const sz = Math.abs(_lp.z) > 1e-3 ? (v.spec.L / 2) / Math.abs(_lp.z) : 1e9;
            _lp.multiplyScalar(Math.min(sx, sz)); _lp.y = v.spec.yb + 0.25 - v.groundOff;
            const wp = _lp.clone().applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_v2.set(t.x, t.y, t.z));
            game.fx?.sparks?.(wp, _lp.clone().applyQuaternion(_q).negate().normalize());
          }
          v.scrapeCd = (v.scrapeCd || 0) - dt;
          v.hitCd = (v.hitCd || 0) - dt;
        }
        const k = Math.min(1, dt * 8);
        bs.ax += (clamp(_v.x, -30, 30) - bs.ax) * k;
        bs.az += (clamp(_v.z, -30, 30) - bs.az) * k;
        const rollK = v.spec.rollK || 1;
        const tRoll = clamp(bs.ax * 0.0065 * rollK, -0.075 * rollK, 0.075 * rollK);
        const tPitch = clamp(-bs.az * 0.0042, -0.05, 0.05);
        bs.rollV += ((tRoll - bs.roll) * 70 - bs.rollV * 11) * dt;
        bs.pitchV += ((tPitch - bs.pitch) * 60 - bs.pitchV * 10) * dt;
        bs.roll += bs.rollV * dt; bs.pitch += bs.pitchV * dt;
        v.car.shell.rotation.set(bs.pitch, 0, bs.roll);
      }
      // wheels
      const vc = v.vc;
      if (vc) for (let i = 0; i < 4; i++) {
        const w = v.car.wheels[i];
        const sl = vc.wheelSuspensionLength(i) ?? v.restLen;
        w.steer.position.set(w.x, -sl, w.z);
        w.steer.rotation.y = vc.wheelSteering(i) || 0;
        w.spin.rotation.x = vc.wheelRotation(i) || 0;
      }
      if (v.car.steeringWheel) v.car.steeringWheel.rotation.z = -v.steerCur * 7;
      // lights
      const lm = v.car.lightMats;
      lm.head.emissiveIntensity = v.lightsOn ? 7 : (v.ai || v.playerDriven ? 0.9 : 0.05);
      const alive = (v.ai || v.playerDriven) && !v.disabled && (!v.flooded || v.lightsOn);
      if (v.flooded && !v.lightsOn) lm.head.emissiveIntensity = 0;
      if (lm.drl) lm.drl.emissiveIntensity = v.headBroken ? 0 : alive ? 6 : 0;
      if (lm.lens) lm.lens.emissiveIntensity = v.headBroken ? 0 : v.lightsOn ? 12 : 0;
      if (lm.tailLed) lm.tailLed.emissiveIntensity = v.disabled ? 0 : v.braking && alive ? 14 : v.lightsOn ? 4 : alive ? 1.2 : 0.2;
      lm.tail.emissiveIntensity = v.disabled ? 0 : v.braking && (v.ai || v.playerDriven) ? 7 : (v.lightsOn ? 2.2 : 0.15);
      // exhaust backfire pops when lifting off at high revs (player car)
      if (v.playerDriven && !v.disabled) {
        const thr = v.ctrl.throttle;
        const perf = ['sports', 'super', 'muscle'].includes(v.spec.cls) || v.spec.police === 'bar';
        if (perf && (v.prevThr || 0) > 0.8 && thr < 0.2 && v.speed > 12) v.popT = 0.45;
        if (perf && v.shiftT > 0.18 && Math.random() < 0.3) v.popT = Math.max(v.popT || 0, 0.12);
        v.prevThr = thr;
        if (v.popT > 0) {
          v.popT -= dt;
          if (Math.random() < 0.5) {
            const ex = v.spec.W / 2 - 0.45;
            for (const sx of v.spec.coupe ? [1, -1] : [1]) {
              _spotPos.set(sx * ex, v.spec.yb + 0.1 - v.groundOff, -v.spec.L / 2 - 0.12); v.mesh.localToWorld(_spotPos);
              fire.emit(_spotPos, 0, 0, 1);
            }
            if (Math.random() < 0.25) game.audio?.play?.('backfire', { position: _spotPos.clone(), volume: 0.4 });
          }
        }
      }
      lm.reverse.emissiveIntensity = v.reversing ? 4 : 0;
      lm.fog.emissiveIntensity = v.lightsOn ? 4 : 0;
      // turn signals: AI announces planned turns; player car blinks while steering hard at low speed; hazards when parked by player
      let bl = 0, br = 0;
      const blinkOn = (et * 1.6) % 1 < 0.5 ? 1 : 0;
      if (v.ai && !v.playerDriven && v.ai.next && v.ai.edge && Math.abs(v.ai.next.ang) > 0.45) {
        if (v.ai.edge.len - v.ai.d < 40) { if (v.ai.next.ang > 0) bl = blinkOn; else br = blinkOn; }
      } else if (v.playerDriven && Math.abs(v.ctrl.steer) > 0.5 && Math.abs(v.speed) < 8) {
        if (v.ctrl.steer > 0) bl = blinkOn; else br = blinkOn;
      }
      lm.blinkL.emissiveIntensity = bl * 6;
      lm.blinkR.emissiveIntensity = br * 6;
      v.car.pool.visible = v.lightsOn && !v.headBroken;
      v.car.tailPool.visible = v.lightsOn || (v.braking && (v.ai || v.playerDriven) && night);
      v.sirenActive = v.police && !v.disabled && (!!v.sirenOn || (!v.playerDriven && !!v.ai && !!v.chaseTarget));
      if (v.sirenActive && pp) { const d = distXZ(t, pp); if (d < sirenBestD) { sirenBestD = d; sirenBest = v; } }
      if (v.spec.police) {
        const ph = (et * 2.6) % 1;
        const strobe = (x) => (x < 0.1 || (x > 0.18 && x < 0.28)) ? 1 : 0;
        lm.red.emissiveIntensity = v.sirenActive ? 10 * strobe(ph) + 0.2 : 0.15;
        lm.blue.emissiveIntensity = v.sirenActive ? 10 * strobe((ph + 0.5) % 1) + 0.2 : 0.15;
      }
      if (v.spec.taxi || v.spec.busLivery) lm.sign.emissiveIntensity = night ? 2.5 : 0.8;
      // skid marks
      let skidAmt = 0;
      if (vc && pp && distXZ(t, pp) < 140 && !v.body.isSleeping()) {
        const lv = v.body.linvel();
        _q.set(r.x, r.y, r.z, r.w);
        _rt.set(1, 0, 0).applyQuaternion(_q);
        const lat = Math.abs(lv.x * _rt.x + lv.y * _rt.y + lv.z * _rt.z);
        const aspd = Math.abs(v.speed);
        const c = v.ctrl;
        const drv = v.playerDriven || v.ai;
        for (let i = 0; i < 4; i++) {
          const front = i < 2;
          let s = Math.max(0, (lat - 2.6) / 4);
          if (drv && v.braking && aspd > 9) s = Math.max(s, front ? 0.35 : 0.3);
          if (drv && c.handbrake && aspd > 4 && !front) s = Math.max(s, 0.6);
          if (drv && c.throttle > 0.9 && aspd < 8 && v.spec.drive === 'rwd' && !front) s = Math.max(s, 0.55);
          const key = v.name + i;
          if (s > 0.05 && vc.wheelIsInContact(i)) {
            const cp = vc.wheelContactPoint(i);
            if (cp) {
              skids.add(key, cp, _rt.x, _rt.z, v.spec.tw * 0.9, 0.25 + s);
              const sm = v.smokeAcc = (v.smokeAcc || 0) + dt * (s > 0.3 ? 40 * Math.min(1.5, s) : 0);
              if (sm >= 1) { v.smokeAcc = 0; if (game.fx?.tireSmoke) game.fx.tireSmoke(new THREE.Vector3(cp.x, cp.y, cp.z)); else smoke.emit(cp, lv.x, lv.z, s); }
            }
            skidAmt = Math.max(skidAmt, s);
          } else skids.end(key);
        }
      }
      if (v.playerDriven) screech.set(Math.min(1, skidAmt), Math.abs(v.speed));
      // driver: created lazily near the player (at most one per frame); hidden when far
      if (!v.driver && v.ai && !v.disabled && !v.flooded && !driverBuiltThisFrame && pp && distXZ(t, pp) < 60) { addDriver(v); driverBuiltThisFrame = true; }
      if (v.driver) {
        if (v.playerDriven) {
          // nobody carjacked properly: the driver bails out and runs
          const ep = v.ejectDriver();
          game.peds?.spawnAt?.(ep, { state: 'flee' });
        }
        else {
          const near = pp ? distXZ(t, pp) < 70 : true;
          v.driver.visible = near;
          if (near) v.driverChar.update?.(dt, { driving: true, speed: 0, grounded: true });
        }
      }
      // burning wreck
      if (v.disabled && (v.burnT = (v.burnT ?? 25) - dt) > 0 && pp && distXZ(t, pp) < 150) {
        v.fireAcc = (v.fireAcc || 0) + dt * 45;
        while (v.fireAcc >= 1) {
          v.fireAcc -= 1;
          _spotPos.set((Math.random() - 0.5) * v.spec.W * 0.6, v.spec.belt - v.groundOff, v.spec.L / 2 - 0.6 - Math.random() * 1.2); v.mesh.localToWorld(_spotPos);
          fire.emit(_spotPos, 0, 0, 1);
        }
        const d = distXZ(t, pp);
        if (d < fireBestD) { fireBestD = d; fireBest = v; }
      }
      // exhaust: faint idle smoke / heat puffs, harder on throttle
      if (!v.disabled && (v.playerDriven || v.ai) && pp && distXZ(t, pp) < 35) {
        v.exAcc = (v.exAcc || 0) + dt * (Math.abs(v.speed) < 2 ? 2.5 + v.throttle * 10 : v.throttle > 0.8 ? 3 : 0);
        if (v.exAcc >= 1) {
          v.exAcc = 0;
          _spotPos.set(v.spec.W / 2 - 0.45, v.spec.yb + 0.1 - v.groundOff, -v.spec.L / 2 - 0.15); v.mesh.localToWorld(_spotPos);
          exhaust.emit(_spotPos, 0, 0, 0.2);
        }
      }
      // smoking engine when badly damaged
      if (v.health < 300) {
        v.smokeT = (v.smokeT || 0) - dt;
        if (v.smokeT <= 0 && pp && distXZ(t, pp) < 120) {
          v.smokeT = v.health <= 0 ? 0.08 : 0.25;
          _spotPos.set(0, v.spec.belt - v.groundOff + 0.1, v.spec.L / 2 - 0.7); v.mesh.localToWorld(_spotPos);
          if (game.fx?.smoke) game.fx.smoke(_spotPos.clone()); else smoke.emit(_spotPos, 0, 0, 0.8);
        }
      }
      // pedestrian hits
      if (Math.abs(v.speed) > 5.5 && game.peds?.list?.length) hitPeds(v, t, r);
    }
    sirenAudio(playerCar && playerCar.sirenActive && !game.audio?.play);
    // police light bar point lights on the nearest active siren
    if (sirenBest && sirenBestD < 90) {
      const m = sirenBest.mesh, sp = sirenBest.spec;
      const ph = (et * 2.6) % 1;
      const zb = (sp.zB + sp.zC) / 2 + 0.1, y = sp.roofY + 0.3 - sirenBest.groundOff;
      _spotPos.set(0.5, y, zb); m.localToWorld(_spotPos); copRed.position.copy(_spotPos);
      _spotPos.set(-0.5, y, zb); m.localToWorld(_spotPos); copBlue.position.copy(_spotPos);
      copRed.intensity = ph < 0.5 ? 40 : 0; copBlue.intensity = ph >= 0.5 ? 40 : 0;
    } else { copRed.intensity = 0; copBlue.intensity = 0; }
    skids.flush();
    smoke.update(dt);
    {
      // smoke is unlit: dim it with the time of day
      const day = clamp(1 - Math.abs(tod - 13) / 7, 0, 1);
      const b = 0.22 + 0.63 * Math.min(1, day * 1.6);
      smoke.points.material.uniforms.color.value.setRGB(b, b * 0.98, b * 0.95);
    }
    fire.update(dt);
    shards.update(dt);
    exhaust.update(dt);
    if (fireBest) {
      _spotPos.set(0, fireBest.spec.belt - fireBest.groundOff + 0.6, fireBest.spec.L / 2 - 1); fireBest.mesh.localToWorld(_spotPos);
      fireLight.position.copy(_spotPos);
      fireLight.intensity = 25 + Math.sin(et * 23) * 6 + Math.sin(et * 37) * 5;
    } else fireLight.intensity = 0;
    impactCooldown -= dt;
    if (!playerCar) screech.set(0, 0);
    // player's headlight spot
    if (playerCar && night && !playerCar.disabled && !playerCar.headBroken) {
      const m = playerCar.mesh;
      _spotPos.set(0, 0.1, playerCar.spec.L / 2 + 0.2); m.localToWorld(_spotPos);
      spot.position.copy(_spotPos); spot2.position.copy(_spotPos);
      _spotPos.set(0, -1.2, 30); m.localToWorld(_spotPos); spot.target.position.copy(_spotPos);
      _spotPos.set(0, -1.5, 10); m.localToWorld(_spotPos); spot2.target.position.copy(_spotPos);
      spot.intensity = 320; spot2.intensity = 60;
    } else { spot.intensity = 0; spot2.intensity = 0; }
  }
  game.updaters?.push(update);

  const _pl = new THREE.Vector3();
  function hitPeds(v, t, r) {
    _q.set(r.x, r.y, r.z, r.w).invert();
    const spec = v.spec;
    for (const ped of game.peds.list) {
      if (!ped || ped.dead) continue;
      const pp = ped.pos || ped.root?.position;
      if (!pp) continue;
      const dx = pp.x - t.x, dz = pp.z - t.z;
      if (dx * dx + dz * dz > 25) continue;
      if (Math.abs((pp.y ?? 0) - (t.y - v.groundOff)) > 1.5) continue;
      _pl.set(dx, 0, dz).applyQuaternion(_q);
      const ahead = 0.45 + Math.min(1.2, Math.abs(v.speed) * 0.07);
      if (Math.abs(_pl.x) > spec.W / 2 + 0.35 || _pl.z > spec.L / 2 + (v.speed > 0 ? ahead : 0.45) || _pl.z < -spec.L / 2 - (v.speed < 0 ? ahead : 0.45)) continue;
      const now = game.clock?.elapsed ?? 0;
      if (ped._carHitT && now - ped._carHitT < 1.2) continue;
      ped._carHitT = now;
      const lv = v.body.linvel();
      const kmh = Math.abs(v.speed) * 3.6;
      const dir = new THREE.Vector3(lv.x, 0.35 * Math.hypot(lv.x, lv.z), lv.z).normalize();
      game.peds.damage?.(ped, kmh * 1.5, dir, 'car');
      const point = new THREE.Vector3(pp.x, (pp.y ?? 0) + 1, pp.z);
      game.emit?.('hit', { target: 'ped', object: ped, point, normal: dir.clone().negate(), damage: kmh * 1.5, kind: 'car' });
      if (v.playerDriven) game.emit?.('crime', { type: 'hit_pedestrian', position: point.clone(), severity: kmh > 50 ? 3 : 2, witnessed: true });
      applyDamage(v, 15, null);
    }
  }

  // ------------------------------------------------------------ events: locked cars, gunshots
  const _shot = new THREE.Vector3();
  if (game.on) {
    game.on('enterVehicle', (e) => {
      const v = e?.vehicle;
      if (!v || !v.locked || v.breakingIn) return;
      v.breakingIn = true;
      game.audio?.play?.('glass', { position: v.mesh.position.clone(), volume: 0.9 });
      breakGlass(v);
      game.emit?.('crime', { type: 'vehicle_theft', position: v.mesh.position.clone(), severity: 1 });
      game.hud?.notify?.('Breaking in...', 1200);
      setTimeout(() => {
        v.locked = false; v.breakingIn = false;
        const pp = game.player?.position;
        if (pp && !game.player.state?.inVehicle && distXZ(v.body.translation(), pp) < 6) game.enterVehicle?.(v);
      }, 1200);
      return false;
    });
    game.on('shot', (e) => {
      const o = e?.origin; if (!o) return;
      for (const v of list) {
        if (!v.ai || v.chaseTarget || v.playerDriven) continue;
        if (distXZ(v.body.translation(), o) < 70) v.ai.fleeT = 10 + Math.random() * 5;
      }
    });
  }

  function dropVehicle(v) {
    const i = list.indexOf(v); if (i >= 0) list.splice(i, 1);
    v.alive = false; v.disposed = true;
    if (v.vc) { try { world.removeVehicleController(v.vc); } catch (e) { /* ignore */ } v.vc = null; }
    scene.remove(v.mesh);
    console.warn('[vehicles] chassis body vanished (removed externally?) - vehicle dropped:', v.name);
  }
  function removeVehicle(v) {
    const i = list.indexOf(v);
    if (i < 0 || v.playerDriven) return false;
    list.splice(i, 1);
    v.alive = false; v.disposed = true;
    for (let k = 0; k < 4; k++) skids.end(v.name + k);
    scene.remove(v.mesh);
    if (v.vc) { try { world.removeVehicleController(v.vc); } catch (e) { /* ignore */ } v.vc = null; }
    try { world.removeRigidBody(v.body); } catch (e) { /* ignore */ }
    return true;
  }

  function spawnVehicle(type = 'sedan', pos, heading = 0, opts = {}) {
    const key = CAR_TYPES[type] ? type : CLASSES[type] ? fromClass(type) : (opts.police ? 'police' : 'sedan');
    const color = opts.color ?? null;
    let p = pos || game.player?.position || new THREE.Vector3();
    if (opts.snap !== false) {
      // snap onto the nearest lane so we never spawn inside a building
      let best = null, bd = 1e9;
      for (const e of net.near(p.x, p.z, 60)) { const pr = project(e, p.x, p.z); if (pr.dist < bd) { bd = pr.dist; best = { e, pr }; } }
      if (best && bd > best.e.width / 2 - 1) {
        const e = best.e, sd = sampleEdge(e, best.pr.s, {});
        let dir = (Math.sin(heading) * sd.dx + Math.cos(heading) * sd.dz) >= 0 ? 1 : -1;
        if (laneCount(e, dir) <= 0) dir = -dir;
        const lp = lanePointAt(e, dir, dir > 0 ? best.pr.s : e.len - best.pr.s, laneOffset(e, dir, 0));
        p = new THREE.Vector3(lp.x, groundY(lp.x, lp.z, lp.y), lp.z);
        heading = Math.atan2(lp.fx, lp.fz);
      }
    }
    if (opts.snap !== false && !spotFree(p, heading, CAR_TYPES[key])) {
      const alt = randomLanePos(p, 0, 45, false, 40, CAR_TYPES[key]);
      if (alt) { p = alt.pos; heading = alt.heading; }
    }
    if (!isBuilt(key, 'base')) prebuild(key, 'base'); // API spawns may need a cold build (rare models)
    const v = createVehicle(key, color, p, heading, { ai: !!opts.ai, police: !!opts.police || key === 'police', external: true });
    return v;
  }

  function nearest(pos, maxDist = 6) {
    let best = null, bd = maxDist;
    for (const v of list) {
      if (v.disabled) continue;
      const t = v.body.translation();
      const d = Math.hypot(t.x - pos.x, t.y - v.groundOff - (pos.y || 0), t.z - pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // ---- warm-up: compile every vehicle material variant and upload every texture now (loading screen), so
  // entering a car / seeing LOD0 / first skid or smoke never compiles shaders mid-game.
  function warmup() {
    const r = game.renderer, cam = game.camera;
    if (!r || !cam) return;
    const restore = [];
    const show = (o) => { if (!o.visible) { restore.push(o); o.visible = true; } };
    for (const v of list) {
      for (const lvl of v.car.lod.levels) { show(lvl.object); lvl.object.traverse(show); }
      for (const w of v.car.wheels) { for (const d of w.detail) show(d); if (w.lo) show(w.lo); }
      show(v.car.pool); show(v.car.tailPool);
    }
    const ranges = [];
    for (const o of [skids.mesh, smoke.points, fire.points, exhaust.points, shards.points]) {
      if (o?.geometry) { ranges.push([o.geometry, o.geometry.drawRange.count]); o.geometry.setDrawRange(0, Infinity); }
    }
    // also the broken-glass material (used when windows shatter)
    const probe = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), brokenGlassMat());
    probe.position.copy(cam.position); scene.add(probe);
    try {
      r.compile(scene, cam);
      scene.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap']) if (m[k]?.isTexture) r.initTexture(m[k]);
      });
    } catch (e) { console.warn('[vehicles] warmup', e); }
    scene.remove(probe);
    for (const o of restore) o.visible = false;
    for (const [g, c] of ranges) g.setDrawRange(0, c);
  }
  try { warmup(); } catch (e) { /* non-fatal */ }

  return { list, nearest, update, warmup, spawn: spawnVehicle, remove: removeVehicle, respawn: respawnAI, get respawnCount() { return respawnCount; } };
}
