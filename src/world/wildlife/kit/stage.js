// Wildlife kit: preview stage and fake world (used only by preview pages; the game provides the real world).
// modes: 'studio' (neutral turntable), 'land' (grass + a road strip), 'shore' (sand, water for x > 4), 'marsh'
// (sawgrass flats with pools), 'underwater' (camera below the surface, seabed at -9 m).
import * as THREE from 'three';
import * as T from './tex.js';

export function groundTextures(kind, size = 512) {
  const key = 'ground|' + kind;
  return T.skinTextures(THREE, key, () => {
    const s = new T.Skin(size, { base: kind === 'sand' ? '#d9c79c' : kind === 'asphalt' ? '#4a4a4c' : kind === 'mud' ? '#5a4a36' : '#5d7a35', rough: 0.95, seed: 4 });
    s.noise([0, 0, 1, 1], { cells: 6, amount: 0.5 }).noise([0, 0, 1, 1], { cells: 32, amount: 0.35, seed: 3 }).noise([0, 0, 1, 1], { cells: 48, amount: 0.9, target: 'h', seed: 5 });
    if (kind === 'grass') s.fur([0, 0, 1, 1], { n: 60000, len: 0.012, width: 0.9, angle: () => -Math.PI / 2, curl: 1.4, color: (u, v, R) => T.mix('#3a5a20', '#86a348', R()), bump: 0.6 });
    if (kind === 'sand') s.spots([0, 0, 1, 1], { n: 900, r: [0.001, 0.004], color: (u, v, R) => (R() < 0.5 ? '#f3ead0' : '#8c7a55'), alpha: 0.7, soft: 0.3, height: 0.7 });
    if (kind === 'asphalt') s.spots([0, 0, 1, 1], { n: 5000, r: [0.001, 0.003], color: (u, v, R) => (R() < 0.5 ? '#77777a' : '#222'), alpha: 0.6, soft: 0.2, height: 0.75 });
    if (kind === 'mud') s.spots([0, 0, 1, 1], { n: 300, r: [0.01, 0.04], color: '#2e2418', alpha: 0.35, soft: 0.9, rough: 0.35 });
    return s;
  }, { repeat: true, normal: 3 });
}

export async function createStage({ mode = 'studio', hour = 10.5, width = innerWidth, height = innerHeight, ground = null, size = 60 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, width / height, 0.03, 600);
  const under = mode === 'underwater', SEA = mode === 'shore' || mode === 'marsh' ? -0.12 : under ? 0 : -50;

  // sky dome + image-based light
  const dayK = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI)), low = 1 - Math.min(1, dayK * 1.6);
  const sunDir = new THREE.Vector3(Math.cos((hour - 6) / 12 * Math.PI) * 0.8, Math.max(0.08, dayK), 0.45).normalize();
  const zen = new THREE.Color(mode === 'studio' ? 0x8f99a6 : 0x2f6fc4).lerp(new THREE.Color(0x101830), 1 - Math.min(1, dayK * 2 + 0.15));
  const hor = new THREE.Color(mode === 'studio' ? 0xd9dde2 : 0xbfdcf2).lerp(new THREE.Color(0xff9a55), low * 0.8).multiplyScalar(0.25 + 0.75 * Math.min(1, dayK * 2 + 0.1));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { z: { value: zen }, h: { value: hor }, s: { value: sunDir } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 d; uniform vec3 z, h, s; void main(){ float t = pow(max(0., d.y), .55); vec3 c = mix(h, z, t); c = mix(c, h * .55, smoothstep(0., -.25, d.y)); c += vec3(1.,.9,.7) * pow(max(0., dot(normalize(d), s)), 180.) * 3.; gl_FragColor = vec4(c, 1.); }' }));
  const envScene = new THREE.Scene(); envScene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; pm.dispose(); scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xfff2dd).lerp(new THREE.Color(0xff8a40), low), under ? 1.2 : 3.2 * (0.25 + 0.75 * dayK));
  sun.position.copy(sunDir).multiplyScalar(60); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -14; sc.right = sc.top = 14; sc.near = 1; sc.far = 160; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target, new THREE.HemisphereLight(hor, 0x4a4030, under ? 0.5 : 0.55));

  // fake terrain
  const hN = (x, z) => T.fbm(x * 0.08 + 40, z * 0.08 + 40, 3, 5);
  const groundY = mode === 'shore' ? (x, z) => (x < 4 ? 0.25 + Math.max(0, -x) * 0.01 : Math.max(-6, 0.25 - (x - 4) * 0.16)) + (hN(x, z) - 0.5) * 0.08
    : mode === 'marsh' ? (x, z) => (hN(x, z) - 0.5) * 1.6 - 0.1
    : under ? (x, z) => -9 + (hN(x * 0.6, z * 0.6) - 0.5) * 2.2
    : () => 0;
  const isWater = (x, z) => groundY(x, z) < SEA;
  const onRoad = mode === 'land' ? (x, z) => Math.abs(z - 6) < 3.5 : () => false;
  const gKind = ground || (mode === 'shore' || under ? 'sand' : mode === 'marsh' ? 'mud' : mode === 'studio' ? null : 'grass');
  if (gKind) {
    const N = mode === 'studio' ? 1 : 120, geo = new THREE.PlaneGeometry(size * 2, size * 2, N, N); geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, groundY(P.getX(i), P.getZ(i))); geo.computeVertexNormals();
    const gt = groundTextures(gKind); for (const t of Object.values(gt)) t.repeat.set(size / 1.2, size / 1.2);
    const g = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...gt, roughness: 1 })); g.receiveShadow = true; scene.add(g);
    if (mode === 'land') { const rt = groundTextures('asphalt'); const rd = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, 7), new THREE.MeshStandardMaterial({ ...rt, roughness: 1 })); rd.rotation.x = -Math.PI / 2; rd.position.set(0, 0.01, 6); rd.receiveShadow = true; scene.add(rd); }
  } else {
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.92 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  }
  let water = null, caustic = null, causticTex = null;
  if (SEA > -40) {
    const nt = new THREE.CanvasTexture(T.normalFromHeight(T.noiseTile(256, 6, 4, 9), 3, true)); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(size / 3, size / 3);
    water = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), new THREE.MeshPhysicalMaterial({ color: mode === 'marsh' ? 0x2b3a2a : 0x1f7fa0, roughness: 0.08, metalness: 0, transparent: true, opacity: under ? 0.55 : mode === 'marsh' ? 0.82 : 0.72, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide, envMapIntensity: 1.4 }));
    water.rotation.x = -Math.PI / 2; water.position.y = SEA; water.renderOrder = 2; scene.add(water); water.userData.nt = nt;
  }
  if (under) {
    const fogC = new THREE.Color(0x1d7f95); scene.fog = new THREE.FogExp2(fogC, 0.045); scene.background = fogC; sky.visible = false;
    // caustics: an animated cookie on a spotlight from above
    const cc = T.makeCanvas(256), cx = cc.getContext('2d'); causticTex = new THREE.CanvasTexture(cc); causticTex.colorSpace = THREE.SRGBColorSpace;
    caustic = new THREE.SpotLight(0xcff6ff, 900, 80, 0.9, 0.6, 1.2); caustic.position.set(4, 26, 3); caustic.target.position.set(0, -9, 0); caustic.map = causticTex; scene.add(caustic, caustic.target);
    caustic.userData.draw = (t) => {
      cx.fillStyle = '#0a1418'; cx.fillRect(0, 0, 256, 256); cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = 'rgba(190,240,255,0.5)'; cx.lineWidth = 2.2;
      for (let k = 0; k < 3; k++) for (let i = -1; i < 9; i++) { cx.beginPath(); for (let x = -8; x <= 264; x += 8) { const y = i * 32 + Math.sin(x * 0.045 + t * (0.7 + k * 0.3) + i * 1.7 + k * 2) * 14 + Math.sin(x * 0.11 - t * 0.9 + k) * 6; x === -8 ? cx.moveTo(k === 1 ? y : x, k === 1 ? x : y) : cx.lineTo(k === 1 ? y : x, k === 1 ? x : y); } cx.stroke(); }
      cx.globalCompositeOperation = 'source-over'; causticTex.needsUpdate = true;
    };
  }

  // fake world
  let seed = 12345; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const player = { pos: new THREE.Vector3(999, 0, 999), vel: new THREE.Vector3(), speed: 0, inVehicle: false, swimming: false, underwater: under };
  const perchList = [];
  const world = {
    THREE, scene, time: 0, dt: 0, hour, frame: 0, seaLevel: SEA, tide: 0,
    isWater, groundY, waterDepth: (x, z) => Math.max(0, SEA - groundY(x, z)), surface: (x, z) => (isWater(x, z) ? 'water' : onRoad(x, z) ? 'asphalt' : gKind || 'grass'), zone: () => (mode === 'shore' ? 'beach' : 'park'), onRoad,
    player, cam: camera.position, threats: [],
    threatNear(pos, max = 30) { let best = null, bd = max; for (const t of world.threats) { const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) - (t.radius || 0); if (d < bd) { bd = d; best = t; } } return best ? { t: best, dist: bd } : null; },
    weather: { rain: 0, wind: 0.2, windDir: [1, 0], storm: false, tempC: 27 },
    perches(pos, radius = 40) { return perchList.filter((p) => p.pos.distanceTo(pos) < radius); },
    addPerch(x, y, z, kind = 'pile') { const p = { pos: new THREE.Vector3(x, y, z), kind, taken: null }; perchList.push(p); return p; },
    fx: { splash(pos, k = 1) { world.events.push(['splash', pos.x, pos.y, pos.z, k]); spawnRing(pos, k); }, ripple(pos) { spawnRing(pos, 0.4); }, dust() {} },
    sound(name, pos, o) { world.events.push(['sound', name]); },
    hurtPlayer(d, kind) { world.events.push(['hurt', d, kind]); },
    // cross-species signals: world.signal('baitball', pos, ttl) / world.signalsNear('baitball', pos, radius) -> [{ kind, pos, data, until }]
    signals: [],
    signal(kind, pos, ttl = 5, data = null) { const s = { kind, pos: pos.clone(), data, until: world.time + ttl }; world.signals.push(s); return s; },
    signalsNear(kind, pos, radius = 60) { const out = []; for (const s of world.signals) if (s.kind === kind && s.until > world.time && Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) < radius) out.push(s); return out; },
    rand, events: [],
  };
  const rings = [];
  function spawnRing(pos, k) { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(pos.x, SEA + 0.02, pos.z); m.userData = { t: 0, k }; scene.add(m); rings.push(m); }

  const actors = [];
  const stage = {
    THREE, renderer, scene, camera, world, sun, sunDir, actors, mode,
    add(actor) { actors.push(actor); if (actor.root) scene.add(actor.root); return actor; },
    // simple props for perches and scale: wooden pile, wire between poles
    pile(x, z, h = 2.2) { const y0 = groundY(x, z); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, h + 2, 10), new THREE.MeshStandardMaterial({ ...groundTextures('mud'), color: 0x9a8a78, roughness: 1 })); m.position.set(x, Math.max(y0, SEA) + h / 2 - 1, z); m.castShadow = true; scene.add(m); return world.addPerch(x, Math.max(y0, SEA) + h, z, 'pile'); },
    wire(ax, az, bx, bz, h = 6, n = 10) { const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x40362c, roughness: 0.9 }); for (const [x, z] of [[ax, az], [bx, bz]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, h + 0.6, 8), mat); p.position.set(x, (h + 0.6) / 2, z); p.castShadow = true; g.add(p); }
      const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector3(ax + (bx - ax) * t, h - Math.sin(t * Math.PI) * 0.45, az + (bz - az) * t)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 5), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }))); scene.add(g);
      return { a: new THREE.Vector3(ax, h, az), b: new THREE.Vector3(bx, h, bz), sag: 0.45, n }; },
    // stucco wall facing +Z (for anoles and geckos): returns a site fragment { x, y, z, normal, w, h }
    wall(x = 0, z = -2, w = 6, h = 3) { const t = groundTextures('sand'); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, color: 0xe8dcc8, roughness: 0.95 })); m.position.set(x, h / 2, z - 0.1); m.castShadow = m.receiveShadow = true; scene.add(m); return { x, y: 0, z, normal: [0, 0, 1], w, h }; },
    setCam(pos, look) { camera.position.set(...pos); camera.lookAt(...look); },
    step(dt) {
      world.dt = dt; world.time += dt; world.frame++;
      for (let i = world.signals.length - 1; i >= 0; i--) if (world.signals[i].until < world.time) world.signals.splice(i, 1);
      for (const a of actors) a.update?.(dt, world);
      for (let i = actors.length - 1; i >= 0; i--) if (actors[i].dead) { scene.remove(actors[i].root); actors[i].dispose?.(); actors.splice(i, 1); }
      if (water) { water.userData.nt.offset.x = world.time * 0.012; water.userData.nt.offset.y = world.time * 0.008; }
      if (caustic) caustic.userData.draw(world.time);
      for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.userData.t += dt; const s = 0.3 + r.userData.t * 2.2 * r.userData.k; r.scale.setScalar(s); r.material.opacity = Math.max(0, 0.7 - r.userData.t * 0.5); if (r.material.opacity <= 0) { scene.remove(r); rings.splice(i, 1); } }
    },
    render() { renderer.setViewport(0, 0, width, height); renderer.setScissorTest(false); renderer.render(scene, camera); },
    run(onFrame) { let last = performance.now(); const loop = () => { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; stage.step(dt); onFrame?.(dt); stage.render(); stage.frames = (stage.frames || 0) + 1; requestAnimationFrame(loop); }; loop(); },
  };
  return stage;
}
