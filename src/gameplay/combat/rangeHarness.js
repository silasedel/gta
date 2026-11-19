// COMBAT track: standalone mini-game used by the range / arena preview page and by scripted tests.
// It reproduces the parts of main.js that combat and traversal modules depend on (same player capsule, KCC settings,
// player.script takeover, movePlayerTo, cameraOverride, event bus, updaters / fixedHooks order, on-foot camera) without
// loading the city, so every combat system can be exercised and screenshotted in seconds.
// The dummies implement the same interface as game.peds (list, damage, spawnAt), so module code paths are identical.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createInput } from '../../core/input.js';
import { preloadCharacters, createCharacter } from '../../player/characterModel.js';
import { createRagdollSystem } from '../../npc/ragdoll.js';
import { ensureCombat, setMaterial } from './shared.js';

const CAP_HALF = 0.55,
  CAP_R = 0.32,
  CENTER = CAP_HALF + CAP_R;

export async function createRangeGame(opts = {}) {
  await RAPIER.init();
  const canvas = opts.canvas || document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.sky ?? 0x9cc4e4);
  scene.fog = new THREE.Fog(opts.sky ?? 0x9cc4e4, 120, 420);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
    new RoomEnvironment(),
    0.04,
  ).texture;
  scene.environmentIntensity = 0.55;
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b6250, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-30, 46, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 40;
  sc.bottom = -40;
  sc.far = 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  const game = {
    THREE,
    RAPIER,
    renderer,
    scene,
    camera,
    world,
    isRange: true,
    sun,
    input: createInput(canvas),
    clock: { elapsed: 0, dt: 0 },
    timeOfDay: 12,
    fixedHooks: [],
    updaters: [],
    settings: { mouseSens: 1, fov: 62, quality: 'high' },
    ui: { paused: false, phoneOpen: false },
    player: {
      position: new THREE.Vector3(),
      heading: 0,
      velocity: new THREE.Vector3(),
      state: {
        speed: 0,
        grounded: true,
        sprint: false,
        jumping: false,
        inVehicle: false,
        vehicle: null,
        punch: false,
      },
      health: 100,
      armor: 0,
      money: 500,
      wanted: 0,
      weapon: 'fist',
    },
    cameraYaw: Math.PI,
    cameraPitch: 0.2,
    cameraZoom: 1,
    v2: { loaded: [], failed: [] },
    hud: {
      notify(t) {
        game.lastNotify = t;
      },
      help(t) {
        game.lastHelp = t;
      },
      update() {},
    },
  };
  const ev = {};
  game.on = (n, f) => ((ev[n] ||= []).push(f), f);
  game.emit = (n, d) => {
    let veto = false;
    (game.eventLog ||= []).push(n);
    if (game.eventLog.length > 400) game.eventLog.splice(0, 200);
    for (const f of ev[n] || []) {
      try {
        if (f(d) === false) veto = true;
      } catch (e) {
        console.error(e);
      }
    }
    return !veto;
  };
  window.game = game;
  ensureCombat(game);

  // ---------------- mock city: flat ground at y=0, optional water rectangles, painted surface zones
  const zones = []; // { x0, x1, z0, z1, surface }
  const waters = []; // { x0, x1, z0, z1, depth }
  const SEA = -0.12;
  const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  game.city = {
    seaLevel: SEA,
    playerSpawn: new THREE.Vector3(0, 0, 0),
    playerSpawnHeading: 0,
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    isWater: (x, z) => waters.some((w) => inRect(w, x, z)),
    groundHeightAt: (x, z) => {
      const w = waters.find((q) => inRect(q, x, z));
      return w ? SEA - w.depth : 0;
    },
    surfaceAt: (x, z) => {
      if (waters.some((w) => inRect(w, x, z))) return 'water';
      for (let i = zones.length - 1; i >= 0; i--)
        if (inRect(zones[i], x, z)) return zones[i].surface;
      return 'concrete';
    },
    zoneAt: () => 'commercial',
    districtAt: () => 'Combat Range',
  };
  game.surfaceAt = (x, z) => game.city.surfaceAt(x, z);
  game.mapName = 'range';

  // ---------------- build helpers (static world pieces with material tags)
  const texCache = new Map();
  function gridTex(base, line, n = 8) {
    const k = base + line + n;
    if (texCache.has(k)) return texCache.get(k);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0.03)`;
      g.fillRect(
        Math.random() * 256,
        Math.random() * 256,
        2 + Math.random() * 3,
        2 + Math.random() * 3,
      );
    }
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache.set(k, t);
    return t;
  }
  const MAT_LOOK = {
    concrete: { base: '#9a9891', line: '#7d7b75', rough: 0.92 },
    asphalt: { base: '#3b3d40', line: '#2c2e30', rough: 0.95 },
    wood: { base: '#8a6238', line: '#5e4020', rough: 0.7 },
    metal: { base: '#6d747b', line: '#454b51', rough: 0.4, metal: 0.9 },
    sand: { base: '#d9c79a', line: '#cbb886', rough: 1 },
    dirt: { base: '#6e5a40', line: '#5a4833', rough: 1 },
    grass: { base: '#5d8a3c', line: '#4c7430', rough: 1 },
    brick: { base: '#9a5a44', line: '#6e3d2e', rough: 0.9 },
    stucco: { base: '#d8c9b0', line: '#bfae92', rough: 0.95 },
    glass: { base: '#9fd0e0', line: '#6fa8ba', rough: 0.05 },
    plastic: { base: '#c9482f', line: '#8f2f1e', rough: 0.5 },
    tile: { base: '#e6e2d8', line: '#a9a59b', rough: 0.3 },
  };
  function lookMat(material, sx = 1, sy = 1) {
    const L = MAT_LOOK[material] || MAT_LOOK.concrete;
    const t = gridTex(L.base, L.line).clone();
    t.repeat.set(sx, sy);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map: t,
      roughness: L.rough,
      metalness: L.metal || 0,
      transparent: material === 'glass',
      opacity: material === 'glass' ? 0.4 : 1,
    });
  }
  // axis-aligned (optionally yawed) static box; (x, y, z) is the center of its base
  function addBox(x, y, z, w, h, d, material = 'concrete', o = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      o.mat ||
        lookMat(material, Math.max(1, Math.round(Math.max(w, d))), Math.max(1, Math.round(h))),
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = o.yaw || 0;
    mesh.castShadow = o.shadow !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const q = new THREE.Quaternion().setFromEuler(mesh.rotation);
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
        .setTranslation(x, y + h / 2, z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(0.9),
    );
    setMaterial(game, col, material, { thickness: o.thickness ?? Math.min(w, d) });
    return { mesh, col, material };
  }
  function addZone(x0, x1, z0, z1, surface) {
    zones.push({ x0, x1, z0, z1, surface });
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0),
      lookMat(surface, Math.round((x1 - x0) / 2), Math.round((z1 - z0) / 2)),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  // water basin: cuts no hole in the ground collider; the ground collider is built around basins (see finalize)
  function addWater(x0, x1, z0, z1, depth = 6) {
    waters.push({ x0, x1, z0, z1, depth });
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0),
      new THREE.MeshPhysicalMaterial({
        color: 0x1f7f97,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.78,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, SEA, (z0 + z1) / 2);
    scene.add(m);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lookMat('sand', 4, 4));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set((x0 + x1) / 2, SEA - depth, (z0 + z1) / 2);
    scene.add(bed);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.25, (z1 - z0) / 2).setTranslation(
        (x0 + x1) / 2,
        SEA - depth - 0.25,
        (z0 + z1) / 2,
      ),
    );
    return m;
  }
  // ground: slabs covering the arena except the water basins (simple row split along Z per basin)
  function finalizeGround(half = 120) {
    const mat = lookMat('concrete', half, half);
    const slab = (x0, x1, z0, z1) => {
      if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, -0.5, (z0 + z1) / 2);
      m.receiveShadow = true;
      scene.add(m);
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.5, (z1 - z0) / 2)
          .setTranslation((x0 + x1) / 2, -0.5, (z0 + z1) / 2)
          .setFriction(0.9),
      );
      col._ground = true;
    };
    const ws = waters.slice().sort((a, b) => a.z0 - b.z0);
    let z = -half;
    for (const w of ws) {
      slab(-half, half, z, w.z0);
      slab(-half, w.x0, w.z0, w.z1);
      slab(w.x1, half, w.z0, w.z1);
      z = w.z1;
    }
    slab(-half, half, z, half);
  }

  // ---------------- player (same capsule and controller settings as main.js)
  const P = game.player;
  const pBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CENTER + 0.05, 0),
  );
  const pCol = world.createCollider(
    RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_R).setFriction(0),
    pBody,
  );
  pCol.setSolverGroups(0);
  const kcc = world.createCharacterController(0.02);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.enableAutostep(0.35, 0.2, false);
  kcc.enableSnapToGround(0.35);
  kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
  kcc.setMinSlopeSlideAngle((40 * Math.PI) / 180);
  kcc.setApplyImpulsesToDynamicBodies(true);
  kcc.setCharacterMass(80);
  P.body = pBody;
  P.collider = pCol;
  let character = null;
  if (opts.characters !== false) {
    try {
      await preloadCharacters(game);
      character = createCharacter(game, { variant: 'player', seed: 1 });
      scene.add(character.root);
    } catch (e) {
      console.warn('[range] characters', e);
    }
  }
  Object.defineProperty(game, 'playerCharacter', { get: () => character, configurable: true });
  game.setPlayerCharacter = (c) => {
    if (character) scene.remove(character.root);
    character = c;
    scene.add(c.root);
  };
  let vy = 0,
    moveSpeed = 0,
    punchTimer = 0;
  const QF = RAPIER.QueryFilterFlags,
    STATIC_ONLY = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  game.teleport = (x, y, z, heading) => {
    const gy = y ?? 0;
    pBody.setTranslation({ x, y: gy + CENTER + 0.1, z }, true);
    P.position.set(x, gy, z);
    vy = 0;
    moveSpeed = 0;
    if (typeof heading === 'number') {
      P.heading = heading;
      game.cameraYaw = heading + Math.PI;
    }
  };
  game.movePlayerTo = (x, y, z) => {
    pBody.setNextKinematicTranslation({ x, y: y + CENTER, z });
    P.position.set(x, y, z);
  };
  // scripted input for tests: game.testKeys.add('KeyW') holds a key, game.testPress('Space') taps one
  game.testKeys = new Set();
  const taps = new Set();
  game.testPress = (c) => taps.add(c);
  const realDown = game.input.down,
    realPressed = game.input.pressed,
    realEnd = game.input.endFrame;
  game.input.down = (c) => realDown(c) || game.testKeys.has(c);
  game.input.pressed = (c) => realPressed(c) || taps.has(c);
  game.input.endFrame = () => {
    realEnd();
    taps.clear();
  };
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function playerFixed(dt) {
    const st = P.state;
    if (st.inVehicle) return;
    if (P.script) {
      try {
        P.script.fixed?.(dt);
      } catch (e) {
        console.error('[player.script]', e);
        P.script = null;
      }
      vy = 0;
      moveSpeed = 0;
      return;
    }
    const inp = game.input,
      blocked = game.ui.paused || game.ui.dead;
    const f = (!blocked && inp.down('KeyW') ? 1 : 0) - (!blocked && inp.down('KeyS') ? 1 : 0);
    const r = (!blocked && inp.down('KeyD') ? 1 : 0) - (!blocked && inp.down('KeyA') ? 1 : 0);
    const fx = -Math.sin(game.cameraYaw),
      fz = -Math.cos(game.cameraYaw);
    let mx = fx * f + -fz * r,
      mz = fz * f + fx * r;
    const ml = Math.hypot(mx, mz);
    const hasInput = ml > 0.01;
    if (hasInput) {
      mx /= ml;
      mz /= ml;
    }
    const t0 = pBody.translation();
    const water = game.city.isWater(t0.x, t0.z),
      depth = water ? SEA - game.city.groundHeightAt(t0.x, t0.z) : 0;
    const feet = t0.y - CENTER;
    const swim = water && depth > 1.25 && feet < SEA - 0.9;
    P.swimming = swim;
    P.waterDepth = water && feet < SEA ? depth : 0;
    P.headUnderwater = swim && feet < SEA - 1.7;
    st.sprint = hasInput && inp.down('ShiftLeft') && !swim;
    const target = hasInput
      ? swim
        ? 1.8
        : st.sprint
          ? 7.2
          : inp.down('ControlLeft')
            ? 1.7
            : 4.2
      : 0;
    if (hasInput && punchTimer <= 0) {
      const dA = wrapA(Math.atan2(mx, mz) - P.heading);
      P.heading = wrapA(P.heading + Math.max(-9 * dt, Math.min(9 * dt, dA * Math.min(1, dt * 10))));
    }
    moveSpeed += Math.max(-16 * dt, Math.min(9 * dt, target - moveSpeed));
    const hx = Math.sin(P.heading),
      hz = Math.cos(P.heading);
    const dirX = hasInput ? hx * 0.65 + mx * 0.35 : hx,
      dirZ = hasInput ? hz * 0.65 + mz * 0.35 : hz,
      dl = Math.hypot(dirX, dirZ) || 1;
    if (swim) {
      const ty = SEA - 1.25 + CENTER;
      vy += (Math.max(-3, Math.min(2, (ty - t0.y) * 3)) - vy) * Math.min(1, dt * 4);
      st.grounded = true;
      st.jumping = false;
    } else if (st.grounded) {
      vy = -1;
      st.jumping = false;
      if (!blocked && inp.pressed('Space') && !game.combat.jumpVeto) {
        vy = 5.2;
        st.jumping = true;
        st.grounded = false;
      }
    } else {
      vy -= 18 * dt;
      if (water && feet < SEA) vy *= Math.exp(-dt * 6);
    }
    vy = Math.max(vy, -40);
    const desired = {
      x: (dirX / dl) * moveSpeed * dt,
      y: vy * dt,
      z: (dirZ / dl) * moveSpeed * dt,
    };
    kcc.computeColliderMovement(pCol, desired, QF.EXCLUDE_SENSORS);
    const mv = kcc.computedMovement();
    const nx = t0.x + mv.x,
      ny = t0.y + mv.y,
      nz = t0.z + mv.z;
    pBody.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    const g = kcc.computedGrounded();
    if (!swim) {
      if (g && vy < 0) st.grounded = true;
      else if (!g) st.grounded = false;
    }
    if (mv.y > desired.y + 1e-4 && vy > 0) vy = 0;
    P.velocity.set(mv.x / dt, mv.y / dt, mv.z / dt);
    st.speed = Math.hypot(P.velocity.x, P.velocity.z);
    P.position.set(nx, ny - CENTER, nz);
    if (P.position.y < -30) game.teleport(0, 0, 0, 0);
  }
  game.fixedHooks.push(playerFixed);
  // external impulses on the player (explosions, car hits) for the range: decays like main.js' knock
  const knock = new THREE.Vector3();
  game.knockPlayer = (v) => {
    knock.copy(v);
    vy = Math.max(vy, v.y || 0);
    P.state.grounded = false;
  };
  game.fixedHooks.push((dt) => {
    if (knock.lengthSq() < 0.01 || P.script) {
      knock.set(0, 0, 0);
      return;
    }
    kcc.computeColliderMovement(
      pCol,
      { x: knock.x * dt, y: 0, z: knock.z * dt },
      QF.EXCLUDE_SENSORS,
    );
    const mv = kcc.computedMovement(),
      t = pBody.translation();
    pBody.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y, z: t.z + mv.z });
    knock.multiplyScalar(Math.exp(-dt * 4));
  });

  // ---------------- default on-foot camera (same formula as main.js)
  const camSphere = new RAPIER.Ball(0.24),
    IDQ = { x: 0, y: 0, z: 0, w: 1 };
  let camDist = 3.8,
    colDist = 3.8;
  function updateCamera(dt) {
    const inp = game.input,
      sens = 0.0022;
    game.cameraYaw -= inp.mouseDX * sens;
    game.cameraPitch = THREE.MathUtils.clamp(game.cameraPitch + inp.mouseDY * sens, -0.6, 1.2);
    const zoom = Math.max(0.3, Math.min(1.5, game.cameraZoom || 1));
    const wantDist = (P.state.sprint ? 4.6 : 3.8) * zoom,
      sideOff = 0.45 + (zoom < 1 ? (1 - zoom) * 0.9 : 0);
    const cy = Math.cos(game.cameraPitch);
    const rd = new THREE.Vector3(
      Math.sin(game.cameraYaw) * cy,
      Math.sin(game.cameraPitch),
      Math.cos(game.cameraYaw) * cy,
    );
    const piv = new THREE.Vector3(
      P.position.x + Math.cos(game.cameraYaw) * sideOff,
      P.position.y + 1.55,
      P.position.z - Math.sin(game.cameraYaw) * sideOff,
    );
    camDist += (wantDist - camDist) * Math.min(1, dt * 3);
    let hit = null;
    try {
      const sh = world.castShape(piv, IDQ, rd, camSphere, 0, camDist + 0.3, false, STATIC_ONLY);
      if (sh && Number.isFinite(sh.time_of_impact)) hit = sh.time_of_impact;
    } catch (e) {
      /* */
    }
    const wantD = hit != null ? Math.max(0.6, hit - 0.3) : camDist;
    if (wantD < colDist) colDist = wantD;
    else colDist += (wantD - colDist) * Math.min(1, dt * 2.5);
    camera.position.copy(piv).addScaledVector(rd, colDist);
    camera.lookAt(piv.clone().addScaledVector(rd, -10));
    const fov = (game.settings.fov || 62) * (0.75 + 0.25 * Math.min(1, zoom));
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 9);
    camera.updateProjectionMatrix();
  }
  game.defaultCamera = updateCamera;

  // ---------------- dummies: same interface as game.peds
  const rag = createRagdollSystem(game, 8);
  const peds = { list: [], rag };
  function pedGround(x, z, y) {
    const h = world.castRay(
      new RAPIER.Ray({ x, y: y + 1.2, z }, { x: 0, y: -1, z: 0 }),
      30,
      true,
      STATIC_ONLY,
    );
    return h ? y + 1.2 - h.timeOfImpact : 0;
  }
  peds.spawnAt = (pos, o = {}) => {
    const char = createCharacter(game, {
      variant: 'ped',
      seed: o.seed ?? 1000 + peds.list.length * 37,
      outfit: o.outfit,
    });
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        pos.x,
        (pos.y || 0) + CENTER,
        pos.z,
      ),
    );
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(CAP_HALF, 0.28), body);
    collider.setSolverGroups(0);
    const ped = {
      active: true,
      pos: new THREE.Vector3(pos.x, pos.y || 0, pos.z),
      heading: o.heading ?? 0,
      state: o.state || 'idle',
      dead: false,
      health: o.health ?? 100,
      root: char.root,
      char,
      body,
      collider,
      knock: new THREE.Vector3(),
      shoveT: 0,
      stateT: 0,
      isCop: !!o.cop,
      tough: !!o.tough,
      idleStyle: o.idleStyle || null,
      home: new THREE.Vector3(pos.x, pos.y || 0, pos.z),
      speed: 0,
      carry: o.carry || null,
      outfit: o.outfit || 'residential',
      name: o.name || null,
      job: o.job || null,
    };
    scene.add(char.root);
    peds.list.push(ped);
    return ped;
  };
  function knockDown(ped, d, o = {}) {
    if (ped.dead && ped.rag) return;
    const lethal = o.lethal !== false;
    ped.state = lethal ? 'dead' : 'down';
    if (lethal) {
      ped.dead = true;
      ped.health = 0;
    }
    ped.collider.setEnabled(false);
    if (!ped.rag) {
      ped.root.position.copy(ped.pos);
      ped.root.updateMatrixWorld(true);
      try {
        ped.rag = rag.start(ped.char, {
          vel: o.vel || { x: 0, y: 0, z: 0 },
          spin: o.spin || 0,
          hit: o.impulse ? { impulse: o.impulse, point: o.point || null } : null,
          kind: o.kind,
          strength: o.strength,
          lethal,
          balance: !!o.balance,
        });
      } catch (e) {
        ped.rag = null;
      }
    }
    if (!lethal) ped.getUpT = o.getUp ?? 2.6;
  }
  peds.knockDown = knockDown;
  peds.damage = (ped, amount = 25, dir = null, kind = 'melee', info = {}) => {
    if (!ped || !ped.active || (ped.dead && ped.state === 'dead')) return;
    const d = dir ? new THREE.Vector3(dir.x, 0, dir.z) : new THREE.Vector3(0, 0, 1);
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize();
    ped.health -= amount;
    const pt = info.point || ped.pos.clone().setY(ped.pos.y + 1.1);
    game.emit('hit', {
      target: 'ped',
      object: ped,
      point: pt,
      normal: d.clone().negate(),
      damage: amount,
      kind,
      zone: info.zone,
      limb: info.limb,
      byPlayer: info.byPlayer,
    });
    const strength = info.strength ?? Math.min(1, amount / 100);
    if (kind === 'car') {
      const kmh = amount / 1.5,
        v = Math.min(16, kmh / 3.6) * 0.8;
      knockDown(ped, d, {
        kind: 'car',
        strength: Math.min(1, kmh / 60),
        lethal: ped.health <= 0 || kmh > 32,
        vel: { x: d.x * v, y: Math.min(3.2, kmh / 22), z: d.z * v },
        spin: Math.min(3, kmh / 20),
        point: pt,
        impulse: new THREE.Vector3(d.x * v * 6, 0, d.z * v * 6),
      });
      return;
    }
    if (ped.health <= 0) {
      const I =
        kind === 'bullet' ? 9 + strength * 14 : kind === 'explosion' ? 120 : 25 + strength * 40;
      knockDown(ped, d, {
        kind,
        strength,
        lethal: true,
        vel: {
          x: d.x * (kind === 'explosion' ? 5 : 0.6),
          y: kind === 'explosion' ? 4 : 0,
          z: d.z * (kind === 'explosion' ? 5 : 0.6),
        },
        point: pt,
        impulse: new THREE.Vector3(d.x * I, I * 0.1, d.z * I),
      });
      return;
    }
    if ((info.heavy || strength > 0.85) && kind !== 'bullet') {
      knockDown(ped, d, {
        kind,
        strength,
        balance: true,
        lethal: false,
        vel: { x: d.x * 1.5, y: 0.3, z: d.z * 1.5 },
        point: pt,
        impulse: new THREE.Vector3(d.x * 30, 3, d.z * 30),
      });
      return;
    }
    ped.hitNow = true;
    ped.knock.set(d.x * (1.2 + strength * 2), 0, d.z * (1.2 + strength * 2));
    ped.shoveT = 0.35;
  };
  peds.update = (dt) => {
    try {
      rag.update(dt);
    } catch (e) {
      console.warn('[range ragdoll]', e);
    }
    for (const ped of peds.list) {
      if (!ped.active) continue;
      if (ped.state === 'down' || ped.state === 'dead') {
        if (ped.rag && !ped.dead && ped.state === 'down') {
          ped.getUpT -= dt;
          if (ped.rag.recovered) {
            // kept the feet: blend straight back into animation where the body stands
            const info = rag.poseInfo(ped.rag);
            if (info) {
              ped.pos.set(
                info.pelvis.x,
                pedGround(info.pelvis.x, info.pelvis.z, info.pelvis.y),
                info.pelvis.z,
              );
              ped.heading = info.heading;
              ped.root.position.copy(ped.pos);
              ped.root.rotation.y = ped.heading;
            }
            rag.handoff ? rag.handoff(ped.rag) : rag.remove(ped.rag);
            ped.rag = null;
            ped.char.snapshotPose?.(0.4);
            ped.state = 'idle';
            ped.collider.setEnabled(true);
            ped.hitNow = false;
          } else if (rag.readyToGetUp?.(ped.rag) || ped.getUpT < -2.5) {
            const info = rag.poseInfo(ped.rag);
            if (info) {
              ped.pos.set(
                info.pelvis.x,
                pedGround(info.pelvis.x, info.pelvis.z, info.pelvis.y),
                info.pelvis.z,
              );
              ped.heading =
                Math.atan2(info.head.x - info.pelvis.x, info.head.z - info.pelvis.z) +
                (info.faceUp ? Math.PI : 0);
              ped.root.position.copy(ped.pos);
              ped.root.rotation.y = ped.heading;
            }
            rag.handoff ? rag.handoff(ped.rag) : rag.remove(ped.rag);
            ped.rag = null;
            ped.char.snapshotPose?.(0.6);
            ped.getUp = info && !info.faceUp ? 'fwd' : 'back';
            ped.getUpClock = 2.4;
            ped.state = 'getup';
            ped.collider.setEnabled(true);
          }
        }
        if (ped.rag || ped.dead) {
          if (!ped.rag) ped.char.update(dt, { dead: true });
          continue;
        }
      }
      if (ped.state === 'getup') {
        ped.getUpClock -= dt;
        if (ped.getUpClock <= 0) {
          ped.getUp = null;
          ped.state = 'idle';
        }
      }
      if (ped.custom) {
        try {
          ped.custom(ped, dt);
        } catch (e) {
          /* */
        }
      }
      if (ped.shoveT > 0 || ped.knock.lengthSq() > 0.01) {
        ped.shoveT -= dt;
        ped.pos.x += ped.knock.x * dt;
        ped.pos.z += ped.knock.z * dt;
        ped.knock.multiplyScalar(Math.exp(-dt * 3.5));
      }
      ped.body.setNextKinematicTranslation({ x: ped.pos.x, y: ped.pos.y + CENTER, z: ped.pos.z });
      ped.root.position.copy(ped.pos);
      ped.root.rotation.y = ped.heading;
      const hit = ped.hitNow;
      ped.hitNow = false;
      if (ped.animOverride) ped.char.update(dt, ped.animOverride);
      else
        ped.char.update(dt, {
          speed: ped.speed || 0,
          grounded: true,
          idleStyle: ped.idleStyle || undefined,
          handsUp: ped.handsUp || ped.shoveT > 0.2,
          guard: ped.state === 'fight',
          hit,
          getUp: ped.getUp || null,
          dead: false,
        });
    }
  };
  peds.panic = () => {};
  game.peds = peds;

  // ---------------- simple vehicles (dynamic boxes with a car-like mesh) for cover, car-hit and windshield tests
  game.vehicles = { list: [], nearest: () => null, update() {} };
  game.vehicles.spawn = (type, pos, heading = 0, o = {}) => {
    const w = o.w ?? 1.9,
      h = o.h ?? 1.35,
      len = o.len ?? 4.5,
      mass = o.mass ?? 1400;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, (pos.y || 0) + h / 2 + 0.25, pos.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.4)
        .setAngularDamping(1.2),
    );
    body.userData = { vehicle: true };
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h * 0.3, len / 2)
        .setTranslation(0, -h * 0.2, 0)
        .setMass(mass * 0.8)
        .setFriction(0.6),
      body,
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2 - 0.12, h * 0.22, len * 0.27)
        .setTranslation(0, h * 0.3, -len * 0.05)
        .setMass(mass * 0.2),
      body,
    );
    const mesh = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({
      color: o.color ?? 0x2a6fdb,
      metalness: 0.6,
      roughness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.6, len), paint);
    lower.position.y = -h * 0.2;
    mesh.add(lower);
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.24, h * 0.44, len * 0.54),
      new THREE.MeshPhysicalMaterial({
        color: 0x1b2a33,
        roughness: 0.08,
        metalness: 0.3,
        transparent: true,
        opacity: 0.75,
      }),
    );
    cab.position.set(0, h * 0.3, -len * 0.05);
    mesh.add(cab);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const wh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18),
          new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
        );
        wh.rotation.z = Math.PI / 2;
        wh.position.set(sx * (w / 2 - 0.05), -h / 2 + 0.08, sz * len * 0.32);
        mesh.add(wh);
      }
    mesh.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(mesh);
    const v = {
      body,
      mesh,
      spec: { mass },
      health: 1000,
      name: 'Range sedan',
      typeKey: type || 'sedan',
      speedKmh: 0,
      alive: true,
      setControls() {},
      seatPosition: () => {
        const t = body.translation();
        return new THREE.Vector3(t.x, t.y + 0.2, t.z);
      },
    };
    Object.defineProperty(v, 'position', { get: () => mesh.position });
    game.vehicles.list.push(v);
    return v;
  };
  game.vehicles.update = () => {
    for (const v of game.vehicles.list) {
      const t = v.body.translation(),
        r = v.body.rotation(),
        lv = v.body.linvel();
      v.mesh.position.set(t.x, t.y, t.z);
      v.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      v.speedKmh = Math.hypot(lv.x, lv.z) * 3.6;
    }
  };
  game.enterVehicle = (v) => {
    P.state.inVehicle = true;
    P.state.vehicle = v;
    pCol.setEnabled(false);
    character?.setVisible(false);
  };
  game.exitVehicle = () => {
    const v = P.state.vehicle;
    if (!v) return;
    const t = v.body.translation();
    P.state.inVehicle = false;
    P.state.vehicle = null;
    pCol.setEnabled(true);
    character?.setVisible(true);
    pBody.setTranslation({ x: t.x + 2.2, y: CENTER + 0.1, z: t.z }, true);
    P.position.set(t.x + 2.2, 0, t.z);
  };

  // ---------------- frame loop (same order as main.js: fixed hooks -> step -> character -> updaters -> systems -> camera -> render)
  let last = performance.now();
  const frameTimes = [];
  game.frameTimes = frameTimes;
  game.gameplayUpdate = null; // set by the page: weapons / G update
  function tick(dt) {
    game.clock.dt = dt;
    game.clock.elapsed += dt;
    punchTimer -= dt;
    P.state.punch = false;
    const inp = game.input;
    if (!P.state.inVehicle && !P.script && inp.mouseClicked && punchTimer <= 0) {
      P.state.punch = true;
      punchTimer = 0.45;
      game.emit('punch', { position: P.position.clone(), heading: P.heading });
    }
    const steps = Math.max(1, Math.ceil(dt / (1 / 60))),
      h = dt / steps;
    world.timestep = h;
    for (let i = 0; i < steps; i++) {
      try {
        world.updateSceneQueries();
      } catch (e) {
        /* */
      }
      for (const f of game.fixedHooks) {
        try {
          f(h);
        } catch (e) {
          console.error(e);
        }
      }
      world.step();
    }
    if (P.state.inVehicle) {
      const t = P.state.vehicle.body.translation();
      P.position.set(t.x, t.y, t.z);
    }
    if (character && !P.state.inVehicle) {
      const t = pBody.translation();
      character.root.rotation.order = 'YXZ';
      character.root.position.set(t.x, P.swimming ? SEA - 0.05 : t.y - CENTER, t.z);
      character.root.rotation.y = P.heading;
      character.root.rotation.x = 0;
      if (P.script?.pose) {
        try {
          P.script.pose(dt, character);
        } catch (e) {
          console.error(e);
        }
      }
      if (P.script?.anim) character.update(dt, P.script.anim);
      else
        character.update(dt, {
          speed: P.swimming ? 0 : P.state.speed,
          idleStyle: P.swimming ? 'swim' : undefined,
          grounded: P.state.grounded || P.swimming,
          jumping: P.state.jumping,
          sprint: P.state.sprint,
          punch: P.state.punch,
          dead: P.health <= 0,
          swimming: P.swimming,
        });
    }
    for (const u of game.updaters) {
      try {
        u(dt);
      } catch (e) {
        console.error(e);
      }
    }
    game.vehicles.update(dt);
    peds.update(dt);
    try {
      game.gameplayUpdate?.(dt);
    } catch (e) {
      console.error(e);
    }
    try {
      if (!(game.cameraOverride && game.cameraOverride(dt, camera) === true)) updateCamera(dt);
    } catch (e) {
      console.error('[camera]', e);
    }
    sun.position.set(P.position.x - 30, 46, P.position.z + 24);
    sun.target.position.copy(P.position);
    renderer.render(scene, camera);
    inp.endFrame();
  }
  game.step = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) tick(dt);
    return game.clock.elapsed;
  };
  game.start = () => {
    const frame = (now) => {
      requestAnimationFrame(frame);
      if (game.manual) {
        last = now;
        return;
      }
      const dt = Math.max(0.001, Math.min((now - last) / 1000, 0.1));
      last = now;
      const t0 = performance.now();
      tick(dt);
      frameTimes.push(performance.now() - t0);
      if (frameTimes.length > 600) frameTimes.shift();
    };
    requestAnimationFrame(frame);
  };
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  canvas.addEventListener('click', () => canvas.requestPointerLock?.());
  // load V2 modules by explicit list (the page decides which), same contract as main.js
  game.loadV2 = async (mods) => {
    const list = mods.map((m) => [m.order ?? 100, m]).sort((a, b) => a[0] - b[0]);
    for (const [, m] of list) {
      try {
        await m.initV2(game);
        game.v2.loaded.push(m.name || '?');
      } catch (e) {
        console.error('[range v2] init failed', e);
        game.v2.failed.push(String(e));
      }
    }
  };
  game.range = { addBox, addZone, addWater, finalizeGround, lookMat, zones, waters, CENTER };
  return game;
}
