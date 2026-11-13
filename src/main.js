import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createInput } from './core/input.js';
import { createEnvironment } from './world/environment.js';
import { createCity } from './world/city.js';
import { preloadCharacters, createCharacter } from './player/characterModel.js';
import { createVehicles } from './vehicles/vehicles.js';
import { createPeds } from './npc/peds.js';
import { createHUD } from './ui/hud.js';
import { createPost } from './render/post.js';
import { createAudio } from './core/audio.js';
import { createInteriors } from './world/interiors.js';
import { createGameplay } from './gameplay/gameplay.js';
import { createSurfaceAt, seaLevel, SEA_X } from './player/controller/surface.js';

const loadMsg = (t, p) => {
  const m = document.getElementById('loadmsg'); if (m) m.textContent = t;
  const b = document.getElementById('loadbar'); if (b) b.style.width = `${p}%`;
};

async function safe(name, fn, fallback) {
  try { return await fn(); } catch (e) { console.error(`[${name}] failed`, e); return fallback; }
}

async function boot() {
  loadMsg('INITIALISING PHYSICS', 5);
  await RAPIER.init();

  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 8000);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  const game = {
    THREE, RAPIER, renderer, scene, camera, world,
    input: createInput(canvas),
    clock: { elapsed: 0, dt: 0 },
    timeOfDay: 18.0,
    fixedHooks: [], updaters: [],
    settings: { mouseSens: 1, quality: 'high', fov: 62 },
    ui: { phoneOpen: false, paused: false },
    player: {
      position: new THREE.Vector3(), heading: 0, velocity: new THREE.Vector3(),
      state: { speed: 0, grounded: true, sprint: false, jumping: false, inVehicle: false, vehicle: null, punch: false },
      health: 100, armor: 50, money: 2450, wanted: 0, weapon: 'fist',
    },
    cameraYaw: 0, cameraPitch: 0.25,
  };
  const _ev = {};
  game.on = (n, f) => ((_ev[n] ||= []).push(f), f);
  game.emit = (n, d) => { let veto = false; for (const f of _ev[n] || []) { try { if (f(d) === false) veto = true; } catch (e) { console.error(e); } } return !veto; };
  window.game = game;

  loadMsg('BUILDING SKY', 15);
  game.env = await safe('env', () => createEnvironment(game), { update() {} });
  loadMsg('BUILDING PORT SOLANA', 30);
  // Map switch: ?map=miami loads the real-scale Miami city (when present); ?map=old forces the original grid city.
  const mapParam = new URLSearchParams(location.search).get('map');
  const MIAMI_DEFAULT = true; // flipped to true once the Miami city is ready
  const wantMiami = mapParam ? mapParam === 'miami' : MIAMI_DEFAULT;
  const miamiMods = import.meta.glob('./world/miami/city.js');
  let city = null;
  if (wantMiami && miamiMods['./world/miami/city.js']) {
    loadMsg('LOADING MIAMI', 32);
    city = await safe('miami', async () => (await miamiMods['./world/miami/city.js']()).createMiamiCity(game), null);
  }
  game.city = city || await createCity(game);
  game.mapName = city ? 'miami' : 'old';
  loadMsg('LOADING CHARACTERS', 55);
  await safe('chars', () => preloadCharacters(game));

  // ---------- PLAYER ----------
  const P = game.player;
  P.position.copy(game.city.playerSpawn || new THREE.Vector3(0, 0, 0));
  if (typeof game.city.playerSpawnHeading === 'number') { P.heading = game.city.playerSpawnHeading; game.cameraYaw = P.heading + Math.PI; }
  const CAP_HALF = 0.55, CAP_R = 0.32, CENTER = CAP_HALF + CAP_R;
  const pBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(P.position.x, P.position.y + CENTER + 0.05, P.position.z));
  const pCol = world.createCollider(RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_R).setFriction(0), pBody);
  const kcc = world.createCharacterController(0.02);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.enableAutostep(0.35, 0.2, false);
  kcc.enableSnapToGround(0.35);
  kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
  kcc.setMinSlopeSlideAngle(40 * Math.PI / 180);
  kcc.setApplyImpulsesToDynamicBodies(true);
  kcc.setCharacterMass(80);
  let character = await safe('playerModel', () => createCharacter(game, { variant: 'player', seed: 1 }), null);
  if (character) scene.add(character.root);
  P.body = pBody; P.collider = pCol;

  loadMsg('SPAWNING TRAFFIC', 70);
  game.vehicles = await safe('vehicles', () => createVehicles(game), { list: [], nearest: () => null, update() {} });
  loadMsg('POPULATING STREETS', 80);
  game.peds = await safe('peds', () => createPeds(game), { list: [], update() {} });
  loadMsg('OPENING STORES', 86);
  game.interiors = await safe('interiors', () => createInteriors(game), { list: [], update() {} });
  game.gameplay = await safe('gameplay', () => createGameplay(game), { update() {} });
  loadMsg('FINAL TOUCHES', 90);
  game.hud = await safe('hud', () => createHUD(game), { update() {}, notify() {}, help() {}, setMission() {} });
  game.post = await safe('post', () => createPost(game), { render() { renderer.render(scene, camera); }, setSize() {} });

  const audio = createAudio(game); game.audio = audio;
  // surface query alias (CITY agent's city.surfaceAt preferred; heuristic fallback)
  game.surfaceAt = createSurfaceAt(game);
  // movement state
  let vy = 0, moveSpeed = 0, punchTimer = 0, enterCooldown = 0;
  const moveDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let lastMouseTime = 0;
  // locomotion feel state
  const L = {
    blockT: 0, speedF: 0, animSpeed: 0, turnInPlace: false, wasAir: false, airVy: 0,
    swimming: false, depth: 0, groundY: 0, rippleT: 0, strideAcc: 0, lastCharStep: -10,
    bobPhase: 0, visY: null, tilt: 0, swimBlend: 0, enterSplashT: 0,
  };
  P.swimming = false; P.waterDepth = 0;
  const QF = RAPIER.QueryFilterFlags;
  const STATIC_ONLY = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  game.on('footstep', (e) => { if (e && e.src !== 'main') L.lastCharStep = game.clock.elapsed; });

  function camForward() { return new THREE.Vector3(-Math.sin(game.cameraYaw), 0, -Math.cos(game.cameraYaw)); }
  const hardBlocked = () => !!(game.ui.busted || game.ui.arrested || game.ui.dead);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  // water depth under the capsule (sea only)
  function probeWater(t) {
    const c = game.city;
    const water = c?.isWater ? c.isWater(t.x, t.z) : t.x > SEA_X - 2 && Math.abs(t.z) <= 520;
    if (!water) { L.depth = 0; return; }
    const hit = world.castRay(new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), 12, true, STATIC_ONLY, undefined, pCol);
    const seabed = c?.groundHeightAt ? c.groundHeightAt(t.x, t.z, t.y) : t.y - 8;
    L.groundY = hit ? Math.max(t.y - hit.timeOfImpact, Number.isFinite(seabed) ? seabed : -20) : (Number.isFinite(seabed) ? seabed : t.y - 8);
    L.depth = Math.max(0, seaLevel(game) - L.groundY);
  }

  function playerFixed(dt) {
    const st = P.state;
    if (st.inVehicle) return;
    const inp = game.input, blocked = game.ui.paused || game.ui.phoneOpen || hardBlocked();
    const f = (!blocked && inp.down('KeyW') ? 1 : 0) - (!blocked && inp.down('KeyS') ? 1 : 0);
    const r = (!blocked && inp.down('KeyD') ? 1 : 0) - (!blocked && inp.down('KeyA') ? 1 : 0);
    const fwd = camForward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    moveDir.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, r);
    const hasInput = moveDir.lengthSq() > 0.01;
    if (hasInput) moveDir.normalize();
    const t0 = pBody.translation();
    probeWater(t0);
    const SEA = seaLevel(game);
    // swim state with hysteresis
    if (!L.swimming && L.depth > 1.25) {
      L.swimming = true;
      if (L.enterSplashT <= 0) { audio.play?.('splash', { position: { x: t0.x, y: SEA, z: t0.z }, volume: 0.6 }); L.enterSplashT = 1; }
    } else if (L.swimming && L.depth < 1.0) L.swimming = false;
    L.enterSplashT -= dt;
    const swim = L.swimming;
    P.swimming = swim; P.waterDepth = L.depth;
    if (!swim) L.dive = 0;
    P.headUnderwater = swim && (L.dive || 0) > 0.35;
    // ---- climb out of the water onto docks / seawalls / ledges (mantle) ----
    if (L.mantle) {
      const m = L.mantle; m.t += dt / 0.6;
      const k = Math.min(1, m.t), e = k * k * (3 - 2 * k);
      const mx = m.fx + (m.tx - m.fx) * e, mz = m.fz + (m.tz - m.fz) * e;
      const my = m.fy + (m.ty - m.fy) * Math.min(1, e * 1.7) + Math.sin(Math.PI * e) * 0.2;
      pBody.setNextKinematicTranslation({ x: mx, y: my, z: mz }); P.position.set(mx, my - CENTER, mz);
      st.speed = 0; P.velocity.set(0, 0, 0);
      if (k >= 1) { L.mantle = null; L.swimming = false; P.swimming = false; P.headUnderwater = false; L.dive = 0; vy = 0; moveSpeed = 0; st.grounded = true; }
      return;
    }
    L.mantleCheck = (L.mantleCheck || 0) - dt;
    if ((swim || L.depth > 0.45) && hasInput && !blocked && L.mantleCheck <= 0) {
      L.mantleCheck = 0.12;
      const dx = moveDir.x, dz = moveDir.z;
      // something solid right in front of us at water level?
      // probe at chest height (seawalls/docks) and knee height (sloped banks, low shore lips under the swimmer's legs)
      let wall = null;
      for (const fy of [Math.max(t0.y, SEA + 0.2), SEA - 0.55, SEA - 0.95]) {
        wall = world.castRay(new RAPIER.Ray({ x: t0.x, y: fy, z: t0.z }, { x: dx, y: 0, z: dz }), CAP_R + 0.9, true, STATIC_ONLY, undefined, pCol);
        if (wall) break;
      }
      if (!wall && (L.blockT || 0) > 0.25) wall = { timeOfImpact: CAP_R + 0.2 };   // blocked by something the rays missed: try climbing anyway
      if (wall) {
        const reach = wall.timeOfImpact + 0.55;
        const px = t0.x + dx * reach, pz = t0.z + dz * reach;
        const top = world.castRay(new RAPIER.Ray({ x: px, y: SEA + 3.0, z: pz }, { x: 0, y: -1, z: 0 }), 3.6, true, STATIC_ONLY, undefined, pCol);
        if (top) {
          const ty = SEA + 3.0 - top.timeOfImpact;
          if (ty > SEA - 0.1 && ty < SEA + 2.3 && !(game.city?.isWater?.(px, pz) && ty < SEA + 0.05) && spotFree(px, ty, pz)) {
            L.mantle = { t: 0, fx: t0.x, fy: t0.y, fz: t0.z, tx: px, ty: ty + CENTER + 0.03, tz: pz };
            P.heading = Math.atan2(dx, dz);
            try { audio.play?.('splash', { position: { x: t0.x, y: SEA, z: t0.z }, volume: 0.35 }); } catch (e) {}
            return;
          }
        }
      }
    }
    const sprintKey = inp.down('ShiftLeft');
    st.sprint = hasInput && sprintKey && !swim;
    const walk = inp.down('AltLeft') || inp.down('ControlLeft');
    let target = hasInput ? (swim ? (sprintKey ? 3.0 : 1.8) : st.sprint ? 7.2 : walk ? 1.7 : 4.2) : 0;
    if (!swim && L.depth > 0.08) { // wading
      const w = clamp01((L.depth - 0.4) / 0.8);
      target *= 0.9 - 0.45 * w;
      if (w > 0.3) st.sprint = false;
    }
    // heading: turn-in-place for big changes at low speed, plant-and-pivot at speed (momentum)
    let dAng = 0;
    if (hasInput) dAng = wrapA(Math.atan2(moveDir.x, moveDir.z) - P.heading);
    const big = Math.abs(dAng) > 1.9;
    if (hasInput && big && moveSpeed < 2.2 && st.grounded && !swim) L.turnInPlace = true;
    if (L.turnInPlace && (!hasInput || Math.abs(dAng) < 0.45)) L.turnInPlace = false;
    let turnRate = swim ? 3.2 : st.sprint ? 6.5 : 10, maxTurn = swim ? 2 : st.sprint ? 5 : 9; // rad/s cap
    if (L.turnInPlace) { turnRate = 12; maxTurn = 10; target = Math.min(target, 0.5); }
    else if (hasInput && !swim && st.grounded && (L.pivot || (big && moveSpeed > 4.6))) {
      // momentum: plant and brake before reversing at speed, then pivot
      L.pivot = moveSpeed > 2.0 && Math.abs(dAng) > 1.2; target = Math.min(target, 0.8); maxTurn = 1.6;
    } else L.pivot = false;
    if (hasInput && punchTimer <= 0) { const da = Math.max(-maxTurn * dt, Math.min(maxTurn * dt, dAng * Math.min(1, dt * turnRate))); P.heading = wrapA(P.heading + da); }
    // speed: exponential ease capped by accel/decel limits (smooth start and stop)
    const accel = swim ? 3 : st.grounded ? 9 : 2;
    const decel = swim ? 2.5 : !st.grounded ? 2 : L.pivot ? 13 : moveSpeed > 5 && !hasInput ? 9 : 16;
    const dv = (target - moveSpeed) * (1 - Math.exp(-dt * 7)) + Math.sign(target - moveSpeed) * 0.02;
    moveSpeed += Math.max(-decel * dt, Math.min(accel * dt, dv));
    if (Math.abs(target - moveSpeed) < 0.03) moveSpeed = target;
    const hx = Math.sin(P.heading), hz = Math.cos(P.heading);
    // moving along facing gives the weighty "turn then go" feel; blend with input dir for responsiveness
    const dirX = hasInput && !L.turnInPlace ? hx * 0.65 + moveDir.x * 0.35 : hx, dirZ = hasInput && !L.turnInPlace ? hz * 0.65 + moveDir.z * 0.35 : hz;
    const dl = Math.hypot(dirX, dirZ) || 1;
    const sp = punchTimer > 0 ? moveSpeed * 0.2 : moveSpeed;
    // vertical: swim float / gravity / jump
    if (swim) {
      const bob = Math.sin(game.clock.elapsed * 1.7) * 0.05;
      // dive: hold C / Ctrl to go down, Space to come up (breath drains while the head is under)
      const diveIn = !blocked && (inp.down('KeyC') || inp.down('ControlLeft')), upIn = !blocked && inp.down('Space');
      const maxDive = Math.max(0, (SEA - L.groundY) - 2.2);
      // camera-directed swimming: looking down while swimming forward dives, looking up rises
      const pitchDown = Math.max(-1, Math.min(1, (game.cameraPitch - 0.3) / 0.6));   // + = camera looking down
      const fwdIn = !blocked && inp.down('KeyW') ? 1 : 0;
      let dv = diveIn ? 1.8 : upIn ? -2.6 : 0;
      if (!diveIn && !upIn && fwdIn) dv = pitchDown > 0.15 ? 1.9 * pitchDown : pitchDown < -0.15 ? 2.2 * pitchDown : ((L.dive || 0) > 0.3 ? 0 : -0.9);
      if (!diveIn && !upIn && !fwdIn) dv = (L.dive || 0) > 0.3 ? -0.35 : -0.9;    // gently float up when idle underwater
      L.dive = Math.min(maxDive, Math.max(0, (L.dive || 0) + dv * dt));
      if (!L.swimHintShown) { L.swimHintShown = true; try { game.hud?.notify?.('Swimming: look down + W or hold C to dive · Space to surface · swim into a dock or wall to climb out', 6000); } catch (e) {} }
      const targetY = Math.max(L.groundY + 0.4, SEA - 1.25 - L.dive + (L.dive > 0.05 ? 0 : bob)) + CENTER;
      const wantVy = Math.max(-3, Math.min(2, (targetY - t0.y) * 3));
      vy += (wantVy - vy) * Math.min(1, dt * 4);
      st.jumping = false; st.grounded = true;
    } else if (st.grounded) {
      vy = -1;
      st.jumping = false;
      if (!blocked && inp.pressed('Space') && L.depth < 0.7) { vy = 5.2; st.jumping = true; st.grounded = false; }
    } else {
      vy -= 18 * dt;
      if (L.depth > 0.3 && t0.y - CENTER < SEA) vy *= Math.exp(-dt * 6); // water drag when falling in
    }
    vy = Math.max(vy, -40);
    const desired = { x: dirX / dl * sp * dt, y: vy * dt, z: dirZ / dl * sp * dt };
    kcc.computeColliderMovement(pCol, desired, QF.EXCLUDE_SENSORS);
    const mv = kcc.computedMovement();
    const nx = t0.x + mv.x, nz = t0.z + mv.z;
    let ny = t0.y + mv.y;
    // de-penetrate: the KCC slowly sinks into ground-collider seams while moving, which turns 0.15m curbs
    // into ~0.3m walls that autostep intermittently fails on (the 'pause in place' hitch). Keep feet on top.
    let rayGround = false;
    if (vy <= 0) {
      const gh = world.castRay(new RAPIER.Ray({ x: nx, y: ny + 0.5, z: nz }, { x: 0, y: -1, z: 0 }), CENTER + 0.6, true, STATIC_ONLY, undefined, pCol);
      if (gh) {
        const groundTop = ny + 0.5 - gh.timeOfImpact;
        const pen = groundTop + CENTER + 0.015 - ny;
        if (pen > 0.004 && pen < 0.45) ny += pen;
        // feet within 8 cm of static ground counts as grounded (KCC's flag misses some streamed trimesh ground)
        rayGround = (ny - CENTER) - groundTop < 0.08;
      }
    }
    pBody.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    const g = kcc.computedGrounded() || rayGround;
    if (!swim) { if (g && vy < 0) st.grounded = true; else if (!g) st.grounded = false; }
    if (mv.y > desired.y + 1e-4 && vy > 0 && !swim) vy = 0; // bonked head
    // splash when landing in / falling into water
    if (!st.grounded) L.airVy = Math.min(L.airVy, vy);
    if (L.airVy < -3 && L.depth > 0.25 && ny - CENTER <= SEA + 0.05) {
      const s = Math.min(1, -L.airVy / 10);
      audio.play?.('splash', { position: { x: nx, y: SEA, z: nz }, volume: 0.4 + s * 0.6 });
      L.airVy = 0; L.enterSplashT = 1;
    }
    if (st.grounded || swim) L.airVy = 0;
    P.velocity.set(mv.x / dt, mv.y / dt, mv.z / dt);
    const actual = Math.hypot(P.velocity.x, P.velocity.z);
    // genuinely blocked? (wall normal against input for > 0.15s) — ignore autostep/curb flicker
    let wall = false;
    if (hasInput) {
      const n = kcc.numComputedCollisions();
      for (let i = 0; i < n; i++) {
        const c = kcc.computedCollision(i); const nn = c && c.normal1;
        if (nn && Math.abs(nn.y) < 0.6 && nn.x * moveDir.x + nn.z * moveDir.z < -0.45) { wall = true; break; }
      }
    }
    if (hasInput && wall && actual < sp * 0.4) L.blockT += dt; else L.blockT = Math.max(0, L.blockT - dt * 2);
    if (L.blockT > 0.15) moveSpeed += (Math.max(actual, 1.0) - moveSpeed) * Math.min(1, dt * 10);
    L.speedF += (actual - L.speedF) * Math.min(1, dt * 10);
    st.speed = L.speedF;
    P.position.set(nx, ny - CENTER, nz);
    if (P.position.y < -20) { const s = game.city.playerSpawn; pBody.setTranslation({ x: s.x, y: s.y + CENTER + 1, z: s.z }, true); vy = 0; }
  }
  game.fixedHooks.unshift(playerFixed);

  // ---- vehicle enter/exit safety (prevents cars being launched by overlapping kinematic capsules) ----
  const capShape = new RAPIER.Capsule(CAP_HALF, CAP_R);
  const IDQ = { x: 0, y: 0, z: 0, w: 1 };
  function groundY(x, z, fromY) {
    const h = world.castRay(new RAPIER.Ray({ x, y: fromY + 3, z }, { x: 0, y: -1, z: 0 }), 12, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, pCol);
    return h ? fromY + 3 - h.timeOfImpact : 0;
  }
  function spotFree(x, y, z) {
    return !world.intersectionWithShape({ x, y: y + CENTER + 0.06, z }, IDQ, capShape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, pCol);
  }
  function safeExitSpot(v) {
    const t = v.body.translation(), r = v.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q); right.y = 0; right.normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
    const cands = [];
    if (v.exitPosition) { try { cands.push(v.exitPosition()); } catch (e) {} }
    for (const d of [1.9, 2.4, 3.0]) {
      cands.push(new THREE.Vector3(t.x, t.y, t.z).addScaledVector(right, d));   // driver side (+X = left)
      cands.push(new THREE.Vector3(t.x, t.y, t.z).addScaledVector(right, -d));  // passenger side
    }
    for (const d of [3.4, 4.2]) {
      cands.push(new THREE.Vector3(t.x, t.y, t.z).addScaledVector(fwd, -d));
      cands.push(new THREE.Vector3(t.x, t.y, t.z).addScaledVector(fwd, d));
    }
    for (const c of cands) {
      const gy = Math.max(groundY(c.x, c.z, t.y), (game.city?.seaLevel ?? -0.12) - 3);
      if (spotFree(c.x, gy, c.z)) return new THREE.Vector3(c.x, gy, c.z);
    }
    return new THREE.Vector3(t.x, t.y + 2.2, t.z); // last resort: on the roof
  }
  // Clamp sudden launch/spin spikes on a car for a short window after enter/exit
  const guard = { v: null, until: 0 };
  function armGuard(v) { guard.v = v; guard.until = game.clock.elapsed + 0.6; }
  game.fixedHooks.push(() => {
    const v = guard.v; if (!v || v.alive === false || v.disposed || game.clock.elapsed > guard.until) { if (v && (v.alive === false || v.disposed)) guard.v = null; return; }
    try {
      const lv = v.body.linvel(), av = v.body.angvel();
      if (lv.y > 2.5) v.body.setLinvel({ x: lv.x, y: Math.min(lv.y, 0.5), z: lv.z }, true);
      const am = Math.hypot(av.x, av.y, av.z);
      if (am > 2.0) { const k = 2.0 / am; v.body.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true); }
    } catch (e) { guard.v = null; }
  });
  // Kinematic characters (player, peds, cops) must never push dynamic bodies through the solver
  // (infinite mass => cars get flung). Their character controllers still block them via queries.
  let solverSweepT = 0;
  function sweepKinematicSolver() {
    // collect first, mutate after: touching colliders inside a world callback triggers Rapier's "recursive use" error
    // Vehicles are excluded: kinematic (lane-following) traffic must keep solid contacts with other cars.
    const carBodies = new Set();
    for (const v of game.vehicles?.list || []) { try { if (v.body) carBodies.add(v.body.handle); } catch (e) {} }
    const kin = [];
    world.forEachRigidBody((b) => { if (b.isKinematic() && !carBodies.has(b.handle) && !b.userData?.vehicle) kin.push(b); });
    for (const v of game.vehicles?.list || []) {
      try { const b = v.body; for (let i = 0, n = b.numColliders(); i < n; i++) { const c = b.collider(i); if (c && c.solverGroups() === 0) c.setSolverGroups(0xffffffff); } } catch (e) {}
    }
    for (const b of kin) {
      for (let i = 0, n = b.numColliders(); i < n; i++) { const c = b.collider(i); if (c && c.solverGroups() !== 0) c.setSolverGroups(0); }
    }
  }
  game.updaters.push((dt) => { solverSweepT -= dt; if (solverSweepT <= 0) { solverSweepT = 0.5; try { sweepKinematicSolver(); } catch (e) {} } });
  // Cars now pass through the player's capsule in the solver, so resolve car->player hits here.
  let carHitCd = 0;
  game.updaters.push((dt) => {
    carHitCd -= dt;
    if (P.state.inVehicle || carHitCd > 0 || game.ui.dead) return;
    for (const v of game.vehicles?.list || []) {
      let t; try { t = v.body.translation(); } catch (e) { continue; }
      const dx = P.position.x - t.x, dz = P.position.z - t.z;
      if (dx * dx + dz * dz > 9 || Math.abs(P.position.y + 0.9 - t.y) > 2) continue;
      const lv = v.body.linvel(); const sp = Math.hypot(lv.x, lv.z);
      if (!Number.isFinite(sp) || sp < 4) continue; // frozen/disabled cars can report NaN velocity
      // is the player inside the car's swept footprint? use local-space box test
      const r = v.body.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
      const loc = new THREE.Vector3(dx, 0, dz).applyQuaternion(q);
      if (Math.abs(loc.x) > 1.35 || Math.abs(loc.z) > 2.7) continue;
      const kmh = sp * 3.6, dmg = Math.min(95, kmh * 0.7);
      if (P.armor > 0) { const a = Math.min(P.armor, dmg * 0.5); P.armor -= a; P.health -= dmg - a; } else P.health -= dmg;
      const nx = lv.x / sp, nz = lv.z / sp;
      moveSpeed = 0; vy = Math.min(7, 2 + kmh / 20); P.state.grounded = false;
      knock.set(nx * Math.min(14, sp * 0.8), 0, nz * Math.min(14, sp * 0.8));
      carHitCd = 1.0;
      game.emit('hit', { target: 'player', object: v, point: P.position.clone(), damage: dmg, kind: 'car' });
      try { audio.play?.('punch_hit', { position: P.position, volume: 1 }); } catch (e) {}
      break;
    }
  });
  const knock = new THREE.Vector3();
  game.fixedHooks.push((dt) => {
    if (knock.lengthSq() < 0.01 || P.state.inVehicle) { knock.set(0, 0, 0); return; }
    kcc.computeColliderMovement(pCol, { x: knock.x * dt, y: vy * dt, z: knock.z * dt }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv = kcc.computedMovement(), t = pBody.translation();
    pBody.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    knock.multiplyScalar(Math.exp(-dt * 4));
  });

  function enterVehicle(v) {
    const st = P.state;
    st.inVehicle = true; st.vehicle = v; v.playerDriven = true;
    pCol.setEnabled(false);
    armGuard(v);
    if (character) character.setVisible(false);
    game.hud.notify?.(`${v.name || 'Vehicle'}`, 2000);
  }
  game.enterVehicle = (v) => enterVehicle(v);
  game.exitVehicle = () => exitVehicle();
  function exitVehicle() {
    const st = P.state, v = st.vehicle;
    v.playerDriven = false; v.setControls({ throttle: 0, steer: 0, brake: 1, handbrake: true });
    armGuard(v);
    const spot = safeExitSpot(v);
    pBody.setTranslation({ x: spot.x, y: spot.y + CENTER + 0.05, z: spot.z }, true);
    P.position.set(spot.x, spot.y, spot.z);
    pCol.setEnabled(true);
    st.inVehicle = false; st.vehicle = null; vy = 0; moveSpeed = 0;
    L.blockT = 0; L.speedF = 0; L.animSpeed = 0; L.turnInPlace = false; L.visY = null; L.airVy = 0;
    P.heading = Math.atan2(-Math.sin(game.cameraYaw), -Math.cos(game.cameraYaw));
    if (character) character.setVisible(true);
  }

  function vehicleControl() {
    const v = P.state.vehicle; if (!v) return;
    const inp = game.input, blocked = game.ui.paused || game.ui.phoneOpen || hardBlocked();
    const W = !blocked && inp.down('KeyW') ? 1 : 0, S = !blocked && inp.down('KeyS') ? 1 : 0;
    const A = !blocked && inp.down('KeyA') ? 1 : 0, D = !blocked && inp.down('KeyD') ? 1 : 0;
    const lv = v.body.linvel(); const rot = v.body.rotation();
    const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const fs = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z;
    v.setControls({
      throttle: W - (S && fs < 1.0 ? 1 : 0),
      steer: A - D,
      brake: S && fs > 1.0 ? 1 : 0,
      handbrake: !blocked && inp.down('Space'),
    });
    if (inp.pressed('KeyH')) { v.horn ? v.horn() : audio.horn(); }
    const t = v.body.translation();
    P.position.set(t.x, t.y, t.z);
    P.heading = Math.atan2(fwd.x, fwd.z);
    P.state.speed = Math.hypot(lv.x, lv.z);
    P.velocity.set(lv.x, lv.y, lv.z);
  }

  // ---------- CAMERA ----------
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camDist = 4.2, camInit = false, colDist = 4.2, camDriving = null;
  const raydir = new THREE.Vector3();
  const camSphere = new RAPIER.Ball(0.24);
  const pivS = new THREE.Vector3();
  function updateCamera(dt) {
    if (!Number.isFinite(L.speedF)) L.speedF = 0;
    if (!Number.isFinite(L.bobPhase)) L.bobPhase = 0;
    if (!Number.isFinite(L.animSpeed)) L.animSpeed = 0;
    if (!Number.isFinite(moveSpeed)) moveSpeed = 0;
    if (!(Number.isFinite(pivS.x) && Number.isFinite(pivS.y) && Number.isFinite(pivS.z))) pivS.set(P.position.x, P.position.y + 1.55, P.position.z);
    const inp = game.input, sens = 0.0022 * (game.settings.mouseSens || 1);
    if (!game.ui.paused && !game.ui.phoneOpen && !game.ui.weaponWheel && !hardBlocked()) {
      if (inp.mouseDX || inp.mouseDY) lastMouseTime = game.clock.elapsed;
      game.cameraYaw -= inp.mouseDX * sens;
      game.cameraPitch = THREE.MathUtils.clamp(game.cameraPitch + inp.mouseDY * sens, -0.6, 1.2);
    }
    const st = P.state, driving = st.inVehicle;
    let pivot, wantDist, sideOff = 0;
    if (driving) {
      const t = st.vehicle.mesh.position;
      pivot = tmp.set(t.x, t.y + 1.6, t.z);
      const kmh = st.vehicle.speedKmh || 0;
      wantDist = 6.8 + Math.min(kmh / 60, 2.5);
      // auto-follow behind car
      if (game.clock.elapsed - lastMouseTime > 1.2 && kmh > 8) {
        const want = P.heading + Math.PI;
        let d = want - game.cameraYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        game.cameraYaw += d * Math.min(1, dt * 2.5);
        game.cameraPitch += (0.18 - game.cameraPitch) * Math.min(1, dt * 1.5);
      }
    } else {
      const swim = P.swimming;
      // walk/run bob driven by stride phase; gentle float bob when swimming
      const spd = L.speedF;
      L.bobPhase += dt * spd / (st.sprint ? 1.45 : spd > 3 ? 1.15 : 0.75) * Math.PI;
      const amp = swim ? 0 : st.grounded ? Math.min(0.045, spd * 0.0065) : 0;
      const bobY = swim ? Math.sin(game.clock.elapsed * 1.7) * 0.07 : Math.abs(Math.sin(L.bobPhase)) * amp * 2 - amp;
      const sway = swim ? 0 : Math.sin(L.bobPhase) * amp * 0.5;
      const baseY = swim ? seaLevel(game) + 0.35 - (L.dive || 0) : P.position.y + 1.55;
      pivot = tmp.set(P.position.x + Math.cos(game.cameraYaw) * sway, baseY + bobY, P.position.z - Math.sin(game.cameraYaw) * sway);
      const zoom = Math.max(0.3, Math.min(1.5, game.cameraZoom || 1));
      wantDist = (swim ? 4.4 : st.sprint ? 4.6 : 3.8) * zoom;
      sideOff = 0.45 + (zoom < 1 ? (1 - zoom) * 0.9 : 0);
      // slight lag on sprint (body pulls ahead of the camera), tight otherwise
      if (camDriving !== false || pivS.distanceToSquared(pivot) > 9) pivS.copy(pivot);
      else pivS.lerp(pivot, 1 - Math.exp(-dt * ((game.cameraZoom || 1) < 0.95 ? 25 : st.sprint ? 8 : swim ? 6 : 18)));
      pivot = tmp.copy(pivS);
    }
    camDriving = driving;
    const cy = Math.cos(game.cameraPitch);
    raydir.set(Math.sin(game.cameraYaw) * cy, Math.sin(game.cameraPitch), Math.cos(game.cameraYaw) * cy);
    const rightX = Math.cos(game.cameraYaw), rightZ = -Math.sin(game.cameraYaw);
    const piv = new THREE.Vector3(pivot.x + rightX * sideOff, pivot.y, pivot.z + rightZ * sideOff);
    camDist += (wantDist - camDist) * Math.min(1, dt * 3);
    // camera collision: static world only (peds/vehicles/player never snap the camera)
    // Sweep a small sphere (≈ the near plane's half-width) instead of a thin ray, so the camera can't slip
    // past the edges of poles, posts, signs and wall corners and show their insides.
    let hit = world.castRay(new RAPIER.Ray(piv, raydir), camDist + 0.3, true, STATIC_ONLY);
    try {
      const sh = world.castShape(piv, IDQ, raydir, camSphere, 0, camDist + 0.3, false, STATIC_ONLY);
      if (sh && Number.isFinite(sh.time_of_impact) && (!hit || sh.time_of_impact < hit.timeOfImpact)) hit = { timeOfImpact: sh.time_of_impact };
    } catch (e) { /* keep ray result */ }
    const wantD = hit ? Math.max(0.6, hit.timeOfImpact - 0.3) : camDist;
    if (wantD < colDist) colDist = wantD; else colDist += (wantD - colDist) * Math.min(1, dt * 2.5);
    const target = piv.clone().addScaledVector(raydir, colDist);
    const cw = game.city?.isWater?.(target.x, target.z);
    const under = (P.headUnderwater || (driving && (st.vehicle?.submerged || 0) > 0.3));
    const minY = cw ? (under ? (game.city.groundHeightAt?.(target.x, target.z) ?? -30) + 0.4 : seaLevel(game) + 0.3) : 0.3;
    if (target.y < minY) target.y = minY;
    // NaN guard: one bad value (e.g. a NaN pivot or ray) must never poison the camera permanently
    const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    if (!Number.isFinite(camDist)) camDist = wantDist;
    if (!Number.isFinite(colDist)) colDist = camDist;
    if (!finite(target)) {
      const px = P.position.x, py = P.position.y, pz = P.position.z;
      target.set(px + Math.sin(game.cameraYaw) * 4, (Number.isFinite(py) ? py : 0) + 2.2, pz + Math.cos(game.cameraYaw) * 4);
    }
    if (!finite(camPos)) camInit = false;
    if (!camInit) { camPos.copy(target); camInit = true; }
    if (driving) {
      camPos.lerp(target, 1 - Math.exp(-dt * 12));
      if (hit) camPos.copy(target);
    } else camPos.copy(target);
    camera.position.copy(camPos);
    camLook.copy(piv).addScaledVector(raydir, -10);
    camera.lookAt(camLook);
    const kmh = driving ? st.vehicle.speedKmh || 0 : 0;
    const aimZ = !driving ? Math.max(0.3, Math.min(1, game.cameraZoom || 1)) : 1;
    const fov = (game.settings.fov || 62) * (0.75 + 0.25 * aimZ) + (driving ? Math.min(kmh / 12, 12) : st.sprint && aimZ > 0.95 ? 4 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * (aimZ < 0.95 || Math.abs(fov - camera.fov) > 6 ? 9 : 3));
    camera.updateProjectionMatrix();
  }

  // ---------- LOOP ----------
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); game.post.setSize?.(innerWidth, innerHeight);
  });
  canvas.addEventListener('click', () => { if (!game.ui.paused) canvas.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => {
    const t = document.getElementById('title'); if (t && document.pointerLockElement) t.style.display = 'none';
  });

  const loading = document.getElementById('loading');
  // Precompile every shader and render one warm-up frame behind the loading screen, so the first
  // visible frame doesn't stall for seconds compiling materials.
  loadMsg('COMPILING SHADERS', 96);
  try {
    updateCamera(1 / 60);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    game.post.render(1 / 60);
    // Run ~1 s of real frames behind the loading screen: streams the spawn area, renders the
    // shadow maps (their depth-only shader variants are not covered by compileAsync) and lets
    // every system create its first-use materials before the player sees anything.
    renderer.shadowMap.needsUpdate = true;
    const tWarm = performance.now();
    for (let i = 0; i < 60 && performance.now() - tWarm < 6000; i++) {
      const wdt = 1 / 60;
      for (const u of game.updaters) { try { u(wdt); } catch (e) {} }
      try { game.vehicles.update?.(wdt); game.peds.update?.(wdt); game.interiors.update?.(wdt); } catch (e) {}
      try { updateCamera(wdt); game.env.update?.(wdt); } catch (e) {}
      if (i % 10 === 0) renderer.shadowMap.needsUpdate = true;
      game.post.render(wdt);
      if (i % 6 === 0) { loadMsg('WARMING UP', 96 + Math.min(3, i / 20)); await new Promise((r) => requestAnimationFrame(() => r())); }
    }
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  } catch (e) { console.warn('[boot] shader warm-up skipped', e); }
  loadMsg('READY', 100);
  loading.style.pointerEvents = 'none'; // never swallow the first click while fading out
  setTimeout(() => { loading.style.opacity = 0; setTimeout(() => loading.remove(), 700); }, 200);
  game.hud.notify?.('Welcome to Port Solana. Click to play.', 4000);

  // ---- F3 performance overlay ----
  const perfEl = document.createElement('div');
  perfEl.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;font:12px/1.35 ui-monospace,Menlo,monospace;color:#d8ffe8;background:rgba(0,0,0,.55);padding:6px 9px;border-radius:6px;white-space:pre;pointer-events:none;display:none';
  document.body.appendChild(perfEl);
  const perfS = { acc: 0, frames: 0, worst: 0, fps: 0, ms: 0, worstShown: 0 };
  addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); perfEl.style.display = perfEl.style.display === 'none' ? 'block' : 'none'; } });
  function perfTick(dt) {
    perfS.acc += dt; perfS.frames++; perfS.worst = Math.max(perfS.worst, dt);
    if (perfS.acc >= 0.5) {
      perfS.fps = perfS.frames / perfS.acc; perfS.ms = (perfS.acc / perfS.frames) * 1000; perfS.worstShown = perfS.worst * 1000;
      perfS.acc = 0; perfS.frames = 0; perfS.worst = 0;
      game.perf = Object.assign(game.perf || {}, { fps: perfS.fps, frameMs: perfS.ms, worstMs: perfS.worstShown });
      if (perfEl.style.display !== 'none') {
        const ri = renderer.info, p = P.position;
        perfEl.textContent = `${perfS.fps.toFixed(0)} fps  ${perfS.ms.toFixed(1)} ms  (worst ${perfS.worstShown.toFixed(0)} ms)\n` +
          `draw ${ri.render.calls}  tris ${(ri.render.triangles / 1e6).toFixed(2)}M  geo ${ri.memory.geometries}  tex ${ri.memory.textures}\n` +
          `map ${game.mapName}  px ${renderer.getPixelRatio().toFixed(2)}  bodies ${world.bodies.len()}  colliders ${world.colliders.len()}\n` +
          `pos ${p.x.toFixed(0)}, ${p.y.toFixed(1)}, ${p.z.toFixed(0)}  ${game.city.districtAt?.(p.x, p.z) || ''}`;
      }
    }
  }
  game.updaters.push(perfTick);
  // diagnostics for freeze reports: GPU context loss and physics halts are recorded in game.perf
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); (game.perf.events ||= []).push({ t: game.clock.elapsed, ev: 'contextlost' }); console.error('[gpu] WebGL context lost'); });
  canvas.addEventListener('webglcontextrestored', () => { (game.perf.events ||= []).push({ t: game.clock.elapsed, ev: 'contextrestored' }); });
  // ---- breath / drowning ----
  P.breath = 100;
  const breathEl = document.createElement('div');
  breathEl.style.cssText = 'position:fixed;left:50%;bottom:118px;transform:translateX(-50%);width:220px;height:8px;border-radius:5px;background:rgba(0,0,0,.45);box-shadow:0 0 0 1px rgba(255,255,255,.25);z-index:60;pointer-events:none;opacity:0;transition:opacity .4s';
  const breathFill = document.createElement('div');
  breathFill.style.cssText = 'height:100%;width:100%;border-radius:5px;background:linear-gradient(90deg,#7fe9ff,#2fe0d0);transition:background .3s';
  const breathLbl = document.createElement('div');
  breathLbl.textContent = 'BREATH';
  breathLbl.style.cssText = 'position:absolute;left:0;right:0;top:-18px;text-align:center;font:700 11px/1 Inter,Arial,sans-serif;letter-spacing:.2em;color:#e8fbff;text-shadow:0 1px 3px #000';
  breathEl.append(breathFill, breathLbl); document.body.appendChild(breathEl);
  let drownCd = 0;
  game.updaters.push(function breathTick(dt) {
    const st = P.state, v = st.vehicle;
    const under = st.inVehicle ? (v?.submerged || 0) >= 0.8 : !!P.headUnderwater;
    if (under) P.breath = Math.max(0, P.breath - dt * (100 / 30));      // ~30 s of air
    else P.breath = Math.min(100, P.breath + dt * 35);
    if (P.breath <= 0 && P.health > 0) {
      P.health = Math.max(0, P.health - dt * 14);                       // suffocating
      drownCd -= dt; if (drownCd <= 0) { drownCd = 1.2; game.emit('hit', { target: 'player', kind: 'drown', damage: 14, point: P.position.clone() }); }
    }
    if (st.inVehicle && (v?.submerged || 0) > 0.5 && P.breath < 70 && !game.ui.dead) game.hud?.help?.('Car is flooding! Press <b>F</b> to get out and swim up');
    const show = under || P.breath < 99.5;
    breathEl.style.opacity = show ? 1 : 0;
    breathFill.style.width = P.breath.toFixed(1) + '%';
    breathFill.style.background = P.breath < 25 ? 'linear-gradient(90deg,#ff5a5a,#ff8a5a)' : 'linear-gradient(90deg,#7fe9ff,#2fe0d0)';
    if (game.ui.dead) P.breath = 100;
  });
  // ---- anti-stuck safeguards ----
  // If the player capsule is genuinely inside solid geometry (a door closing on them, clipping into a wall/prop/car),
  // push them to the nearest free spot. Pressing into a wall is NOT stuck (uses a slightly shrunk capsule).
  const coreShape = new RAPIER.Capsule(CAP_HALF - 0.05, CAP_R - 0.07);
  const unstuck = { t: 0, wheelT: 0 };
  game.updaters.push(function unstuckTick(dt) {
    const st = P.state;
    // UI watchdog: a weapon wheel left open without Tab held must never block mouse look
    if (game.ui.weaponWheel && !game.input.down('Tab')) { unstuck.wheelT += dt; if (unstuck.wheelT > 0.5) { try { game.hud?.closeWeaponWheel?.(); } catch (e) {} game.ui.weaponWheel = false; unstuck.wheelT = 0; } } else unstuck.wheelT = 0;
    if (st.inVehicle || game.ui.dead || P.swimming || !pCol.isEnabled()) { unstuck.t = 0; return; }
    const t = pBody.translation();
    // fell through a hole in the ground? (on land, well below where the ground should be) -> put back on top
    const c = game.city;
    if (c?.groundHeightAt && c.isWater && !c.isWater(t.x, t.z) && !L.mantle) {
      const gh = c.groundHeightAt(t.x, t.z, t.y + 30);
      if (Number.isFinite(gh) && t.y - CENTER < gh - 1.5) {
        pBody.setTranslation({ x: t.x, y: gh + CENTER + 0.25, z: t.z }, true);
        P.position.set(t.x, gh, t.z); vy = 0; knock.set(0, 0, 0);
        console.warn('[player] fell below ground, restored at', t.x.toFixed(1), t.z.toFixed(1));
        unstuck.t = 0; return;
      }
    }
    let hit = null;
    try { hit = world.intersectionWithShape({ x: t.x, y: t.y + 0.03, z: t.z }, IDQ, coreShape, QF.EXCLUDE_SENSORS, undefined, pCol, undefined, (c) => { const b = c.parent(); return !b || !b.isDynamic() || true; }); } catch (e) { hit = null; }
    if (!hit) { unstuck.t = 0; return; }
    unstuck.t += dt;
    if (unstuck.t < 0.4) return;
    unstuck.t = 0;
    for (const r of [0.6, 0.9, 1.3, 1.8, 2.5, 3.5]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + r, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
        const gy = groundY(x, z, t.y - CENTER);
        if (Math.abs(gy - (t.y - CENTER)) > 1.2) continue;
        if (spotFree(x, gy, z)) {
          pBody.setTranslation({ x, y: gy + CENTER + 0.05, z }, true);
          P.position.set(x, gy, z); vy = 0; moveSpeed = 0; knock.set(0, 0, 0);
          console.info('[player] freed from overlap', hit.handle);
          return;
        }
      }
    }
  });
  // safety net: any module writing NaN into health/armor must never disable death or regen
  let lastHealth = 100, lastArmor = 0;
  game.updaters.push(() => {
    if (Number.isFinite(P.health)) lastHealth = P.health; else { console.warn('[player] health was NaN, restored'); P.health = lastHealth; }
    if (Number.isFinite(P.armor)) lastArmor = P.armor; else P.armor = lastArmor;
  });

  let last = performance.now();
  // ---- frame-spike profiler: per-system timings of any frame (or gap) over 40 ms -> game.perf.spikes ----
  const PT = {}; let PTn = 0;
  const tm = (k, t) => { PT[k] = (PT[k] || 0) + performance.now() - t; };
  const spikes = []; game.perf = Object.assign(game.perf || {}, { spikes, longTasks: [] });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { game.perf.longTasks.push({ t: +(e.startTime / 1000).toFixed(1), ms: Math.round(e.duration), src: (e.attribution?.[0]?.containerSrc || e.attribution?.[0]?.name || e.name || '') }); if (game.perf.longTasks.length > 60) game.perf.longTasks.shift(); } }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
  function frame(now) {
    const gap = now - last, fStart = performance.now();
    for (const k in PT) PT[k] = 0;
    requestAnimationFrame(frame);
    // dt is clamped to (0.001 .. 0.1]: never negative (rAF timestamps can precede performance.now() at boot)
    // and never zero (physics/velocity code divides by dt)
    let dt = Math.max(0.001, Math.min((now - last) / 1000, 0.1));
    last = Math.max(last, now);
    game.clock.dt = dt; game.clock.elapsed += dt;
    // cinematic death: slow-mo world, desaturate (post reads game.deathFade), pull-away camera
    const dying = !!game.ui.dead;
    if (dying && !L.deathStart) { L.deathStart = game.clock.elapsed; L.deathYaw = game.cameraYaw; try { audio.play?.('death_hit', { volume: 1 }); } catch (e) {} }
    if (!dying) L.deathStart = 0;
    const deathT = dying ? game.clock.elapsed - L.deathStart : 0;
    game.deathFade = (game.deathFade || 0) + ((dying ? Math.min(1, deathT / 0.9) : 0) - (game.deathFade || 0)) * Math.min(1, dt * (dying ? 5 : 2.5));
    const simDt = dying ? dt * (deathT < 0.25 ? 0.12 : 0.3) : dt;
    const inp = game.input;
    if (inp.pressed('Escape') || inp.pressed('KeyP')) { /* HUD toggles pause */ }
    const paused = game.ui.paused;
    if (!paused) {
      game.timeOfDay = (game.timeOfDay + dt / 120) % 24;
      // interactions
      enterCooldown -= dt; punchTimer -= dt;
      P.state.punch = false;
      if (!game.ui.phoneOpen && inp.pressed('KeyF') && enterCooldown <= 0) {
        enterCooldown = 0.6;
        if (P.state.inVehicle) {
          if ((P.state.vehicle.speedKmh || 0) < 25 || (P.state.vehicle.submerged || 0) > 0.3) exitVehicle();
        } else {
          const v = game.vehicles.nearest?.(P.position, 4.0);
          if (v && game.emit('enterVehicle', { vehicle: v })) enterVehicle(v);
        }
      }
      if (!P.state.inVehicle && inp.mouseClicked && punchTimer <= 0 && !game.ui.phoneOpen && !game.ui.weaponWheel && !hardBlocked()) { P.state.punch = true; punchTimer = 0.45; game.emit('punch', { position: P.position.clone(), heading: P.heading }); }
      if (P.state.inVehicle) vehicleControl();
      // boat boarding (VEHICLES): show the character climbing over the side / hopping onto the deck while the scripted move runs
      { const bb = game.vehicles?.boatBoarding;
        if (character && bb?.active && bb.position) {
          character.setVisible(true); L.boardShown = true;
          character.root.rotation.order = 'YXZ'; character.root.rotation.x = 0;
          character.root.position.set(bb.position.x, bb.position.y, bb.position.z);
          character.root.rotation.y = bb.heading ?? P.heading;
          try { character.update(dt, { speed: 0.6, grounded: bb.type !== 'hop', jumping: bb.type === 'hop', sprint: false, driving: false, punch: false, dead: false, swimming: bb.type === 'climb' && (bb.t ?? 0) < 0.45, wading: false }); } catch (e) { /* */ }
        } else if (L.boardShown) { L.boardShown = false; if (character && P.state.inVehicle) character.setVisible(false); }
      }
      // help prompt
      if (!P.state.inVehicle) {
        const v = game.vehicles.nearest?.(P.position, 4.0);
        game.hud.help?.(v ? 'Press <b>F</b> to enter vehicle' : null);
      } else game.hud.help?.(null);
      // physics (sub-step to keep ≤1/60)
      const steps = Math.max(1, Math.ceil(simDt / (1 / 60)));
      const h = simDt / steps;
      world.timestep = h;
      if (!game.physicsDead) for (let i = 0; i < steps; i++) {
        // Streaming/despawn code adds & removes colliders between steps; refresh the query BVH so
        // vehicle wheel rays, character controllers and camera rays never touch stale handles.
        try { world.updateSceneQueries(); } catch (e) { /* older builds */ }
        for (const f of game.fixedHooks) { const t1 = performance.now(); try { f(h); } catch (e) { console.error(e); if (/unreachable|recursive use/i.test(String(e))) { game.physicsDead = 'hook ' + (f.name || '?') + ': ' + String(e) + ' | ' + (e.stack || '').split('\n').filter(l => !/wasm-function/.test(l)).slice(0, 6).join(' | '); break; } } tm('fixed:' + (f.name || 'anon'), t1); }
        if (game.physicsDead) break;
        const tS = performance.now(); try { world.step(); } catch (e) { game.physicsDead = 'step: ' + String(e) + ' | ' + (e.stack || '').split('\n').filter(l => !/wasm-function/.test(l)).slice(0, 6).join(' | '); console.error('[physics] Rapier panic — physics halted', e); break; } finally { tm('world.step', tS); }
      }
      if (P.state.inVehicle) { const t = P.state.vehicle.body.translation(); P.position.set(t.x, t.y, t.z); }
      // character visual
      if (character && !P.state.inVehicle) try {
        const t = pBody.translation();
        let fy = t.y - CENTER;
        if (P.state.grounded && !P.swimming) {
          const gh = world.castRay(new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), CENTER + 0.4, true, undefined, undefined, pCol);
          if (gh) fy = t.y - gh.timeOfImpact;
        }
        // smooth small step-ups/downs (curbs, autostep, sand<->slope seam) — snap when airborne or big jumps
        if (L.visY === null || !P.state.grounded || Math.abs(fy - L.visY) > 0.6) L.visY = fy;
        else L.visY += (fy - L.visY) * Math.min(1, dt * 16);
        const SEA = seaLevel(game);
        L.swimBlend += ((P.swimming ? 1 : 0) - L.swimBlend) * Math.min(1, dt * 4);
        const sb = L.swimBlend;
        const hx = Math.sin(P.heading), hz = Math.cos(P.heading);
        // swim pose: tilt root forward ~70deg, float with head above water, centre the body on the capsule
        L.tilt = sb * 1.2;
        const back = Math.sin(L.tilt) * 0.8;
        const rootY = L.visY * (1 - sb) + (SEA - 0.27 + Math.sin(game.clock.elapsed * 1.7) * 0.04) * sb;
        character.root.rotation.order = 'YXZ';
        character.root.position.set(t.x - hx * back, rootY, t.z - hz * back);
        character.root.rotation.x = L.tilt;
        P.position.y = fy;
        character.root.rotation.y = P.heading;
        // anim speed: intended speed unless genuinely blocked, low-passed (no flicker from autostep/curbs)
        const intended = L.blockT > 0.15 ? L.speedF : Math.min(moveSpeed, L.speedF + 1.2);
        L.animSpeed += (intended - L.animSpeed) * Math.min(1, dt * 8);
        const swim = P.swimming;
        const aSpeed = swim ? 1.2 + L.animSpeed * 0.9 : L.animSpeed;
        character.update(simDt, { speed: aSpeed, grounded: P.state.grounded || swim, jumping: P.state.jumping, sprint: P.state.sprint, driving: false, punch: P.state.punch, dead: P.health <= 0, swimming: swim, wading: !swim && P.waterDepth > 0.4 });
        // ripples while moving in water; stride footsteps fallback; swim strokes
        const pos = P.position;
        if (P.waterDepth > 0.15) {
          L.rippleT -= dt * (L.speedF > 0.5 ? 1 : 0.35);
          if (L.rippleT <= 0) { L.rippleT = 0.3; } // fx module spawns ripples/splashes for the player itself
        }
        const stride = swim ? 1.7 : P.state.sprint ? 1.45 : L.speedF > 3 ? 1.15 : 0.75;
        if ((P.state.grounded || swim) && L.speedF > 0.4) L.strideAcc += L.speedF * dt; else L.strideAcc = Math.min(L.strideAcc, stride * 0.5);
        if (L.strideAcc >= stride) {
          L.strideAcc -= stride;
          if (swim) audio.play?.('swim', { position: { x: pos.x, y: SEA, z: pos.z }, volume: 0.5 + Math.min(0.5, L.speedF / 6) });
          else if (game.clock.elapsed - L.lastCharStep > 0.8) {
            const surface = P.waterDepth > 0.06 ? 'water' : (game.surfaceAt?.(pos.x, pos.z) || 'concrete');
            game.emit('footstep', { surface, position: pos.clone(), run: L.speedF > 3, src: 'main' });
          }
        }
      } catch (e) { console.error('[player visual]', e); }
      for (const u of game.updaters) { const t1 = performance.now(); try { u(simDt); } catch (e) { console.error(e); } tm('upd:' + (u.name || 'anon'), t1); }
      { const t1 = performance.now(); try { game.vehicles.update?.(simDt); } catch (e) { console.error(e); } tm('vehicles', t1); }
      { const t1 = performance.now(); try { game.peds.update?.(simDt); } catch (e) { console.error(e); } tm('peds', t1); }
      { const t1 = performance.now(); try { game.interiors.update?.(simDt); } catch (e) { console.error(e); } tm('interiors', t1); }
      { const t1 = performance.now(); try { game.gameplay.update?.(dt); } catch (e) { console.error(e); } tm('gameplay', t1); }
    }
    { const t1 = performance.now(); try { updateCamera(dt); } catch (e) { console.error('[camera]', e); } tm('camera', t1); }
    if (dying) try {
      const k = 1 - Math.exp(-deathT * 0.9);            // eases 0 -> 1
      const yaw = L.deathYaw + deathT * 0.22;           // slow orbit
      const dist = 4.5 + 6 * k, hgt = 2.2 + 8 * k;
      const px = P.position.x, py = P.position.y, pz = P.position.z;
      camera.position.set(px + Math.sin(yaw) * dist, py + hgt, pz + Math.cos(yaw) * dist);
      camera.lookAt(px, py + 0.6, pz);
      camera.fov += (48 - camera.fov) * Math.min(1, dt * 1.5); camera.updateProjectionMatrix();
    } catch (e) { console.error('[deathcam]', e); }
    { const t1 = performance.now(); try { game.env.update?.(dt); } catch (e) { console.error(e); } tm('env', t1); }
    { const t1 = performance.now(); try { game.hud.update?.(dt); } catch (e) { console.error(e); } tm('hud', t1); }
    { const t1 = performance.now(); try { audio.update(dt); } catch (e) { console.error(e); } tm('audio', t1); }
    const progs0 = renderer.info.programs?.length || 0, tex0 = renderer.info.memory.textures, geo0 = renderer.info.memory.geometries;
    { const t1 = performance.now(); game.post.render(dt); tm('render', t1); }
    const dProg = (renderer.info.programs?.length || 0) - progs0, dTex = renderer.info.memory.textures - tex0, dGeo = renderer.info.memory.geometries - geo0;
    inp.endFrame();
    const work = performance.now() - fStart;
    if ((gap > 40 || work > 40) && game.clock.elapsed > 3) {
      const top = Object.entries(PT).filter(([, v]) => v > 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}`);
      spikes.push({ t: +game.clock.elapsed.toFixed(1), gap: Math.round(gap), work: Math.round(work), top, newPrograms: dProg, newTextures: dTex, newGeometries: dGeo, calls: renderer.info.render.calls });
      if (spikes.length > 80) spikes.shift();
    }
  }
  requestAnimationFrame(frame);
}

boot().catch((e) => { console.error(e); loadMsg('ERROR: ' + e.message, 100); });
