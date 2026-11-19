// Shared studio for every hero-car preview page (body, wheels, cockpit, engine): one look, so parts are judged in the same light.
//   const st = createStudio({ env: 'studio' | 'sky' | 'night' });  st.scene.add(thing);  st.view('front34', dims);  st.start();
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function basic(v, r = 1, g = 1, b = 1) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  m.color.setRGB(v * r, v * g, v * b);
  return m;
}

/** Automotive photo studio: big overhead softbox, long side strips (they draw the highlight lines along the body), dark floor. */
function studioEnvScene() {
  const s = new THREE.Scene();
  const box = (w, h, d, x, y, z, mat, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    s.add(m);
    return m;
  };
  // room shell (dim, slightly cool), graded walls: darker near the floor
  box(40, 0.2, 40, 0, -0.1, 0, basic(0.035));
  box(40, 0.2, 40, 0, 12, 0, basic(0.1));
  for (let i = 0; i < 6; i++) {
    const y = 1 + i * 2,
      v = 0.05 + i * 0.035;
    box(40, 2, 0.2, 0, y, -20, basic(v));
    box(40, 2, 0.2, 0, y, 20, basic(v));
    box(0.2, 2, 40, -20, y, 0, basic(v));
    box(0.2, 2, 40, 20, y, 0, basic(v));
  }
  // overhead softbox (long, along the car) + two narrower strips beside it
  box(4.2, 0.05, 13, 0, 7.5, 0.5, basic(11));
  box(1.0, 0.05, 12, -4.6, 7.0, 0, basic(5), 0, 0.25);
  box(1.0, 0.05, 12, 4.6, 7.0, 0, basic(5), 0, -0.25);
  // side light walls (horizon lines on the doors)
  box(0.05, 1.5, 16, -11, 2.9, 0, basic(6.5));
  box(0.05, 1.5, 16, 11, 2.9, 0, basic(6.5));
  box(0.05, 0.25, 16, -11, 0.9, 0, basic(2.2));
  box(0.05, 0.25, 16, 11, 0.9, 0, basic(2.2));
  // front / rear fills and a warm kicker
  box(9, 1.6, 0.05, 0, 3.2, 13, basic(4.2));
  box(9, 1.2, 0.05, 0, 3.0, -13, basic(3.2, 1.0, 0.93, 0.85));
  box(2.5, 2.5, 0.05, -9, 5.5, 11, basic(7, 1.0, 0.96, 0.9), 0.5);
  return s;
}
/** Outdoor Miami daylight: blue zenith, bright warm horizon haze, sun, sand-gray ground. */
function skyEnvScene(night) {
  const s = new THREE.Scene();
  const g = new THREE.SphereGeometry(50, 48, 24);
  const col = new Float32Array(g.attributes.position.count * 3);
  const zen = night ? [0.004, 0.006, 0.014] : [0.16, 0.36, 0.95],
    hor = night ? [0.03, 0.035, 0.06] : [1.25, 1.35, 1.5],
    gnd = night ? [0.008, 0.008, 0.01] : [0.22, 0.2, 0.18];
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / 50;
    let c;
    if (y >= 0) {
      const t = Math.pow(y, 0.45);
      c = hor.map((h, k) => h + (zen[k] - h) * t);
    } else {
      const t = Math.min(1, -y * 6);
      c = hor.map((h, k) => h * 0.55 + (gnd[k] - h * 0.55) * t);
    }
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(
    new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false }),
    ),
  );
  if (!night) {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8), basic(260, 1, 0.95, 0.85));
    sun.position.set(-18, 34, 22);
    s.add(sun);
    // a few soft clouds as bright blobs so reflections are not a flat gradient
    const r = (a) => {
      const x = Math.sin(a * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(3 + r(i) * 5, 10, 6),
        basic(1.9 + r(i + 5) * 1.2),
      );
      const a = r(i + 9) * Math.PI * 2,
        e = 0.12 + r(i + 3) * 0.5;
      c.position.set(
        Math.cos(a) * 44 * Math.cos(e),
        44 * Math.sin(e),
        Math.sin(a) * 44 * Math.cos(e),
      );
      c.scale.y = 0.35;
      s.add(c);
    }
  } else {
    // street lamps and neon bars for night reflections
    const lamp = (x, y, z, v, rr, gg, bb, w = 0.6) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, w), basic(v, rr, gg, bb));
      m.position.set(x, y, z);
      s.add(m);
    };
    lamp(-9, 8, 6, 60, 1, 0.75, 0.45);
    lamp(10, 8, -12, 60, 1, 0.75, 0.45);
    lamp(-12, 8, -20, 40, 1, 0.75, 0.45);
    lamp(18, 3, 4, 14, 1, 0.1, 0.6, 5);
    lamp(-20, 4, -2, 12, 0.1, 0.8, 1, 6);
    lamp(2, 5, 24, 9, 0.4, 0.2, 1, 7);
  }
  return s;
}

export function createStudio(opts = {}) {
  const q = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(+(q.get('dpr') || opts.dpr || Math.min(2, devicePixelRatio)));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.03, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  const pm = new THREE.PMREMGenerator(renderer);
  const envs = {};
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 5;
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 60 });
  scene.add(key, key.target);
  const fill = new THREE.HemisphereLight(0xffffff, 0x202024, 0.25);
  scene.add(fill);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x17181b,
    roughness: 0.32,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const st = { renderer, scene, camera, controls, key, floor, envName: null, q };

  st.setEnv = (name = 'studio') => {
    if (!envs[name]) {
      const sc = name === 'studio' ? studioEnvScene() : skyEnvScene(name === 'night');
      envs[name] = { tex: pm.fromScene(sc, 0.012, 0.1, 200).texture };
    }
    st.envName = name;
    scene.environment = envs[name].tex;
    if (name === 'studio') {
      scene.background = new THREE.Color(0x0d0e10);
      scene.environmentIntensity = 1.0;
      key.color.set(0xffffff);
      key.intensity = 1.6;
      key.position.set(-4, 14, 6);
      fill.intensity = 0.15;
      floorMat.color.set(0x0b0c0e);
      floorMat.roughness = 0.55;
    } else if (name === 'sky') {
      scene.background = new THREE.Color(0xa9c8ea);
      scene.environmentIntensity = 1.0;
      scene.backgroundBlurriness = 0;
      key.color.set(0xfff1dc);
      key.intensity = 3.4;
      key.position.set(-9, 17, 11);
      fill.intensity = 0.2;
      floorMat.color.set(0x55565a);
      floorMat.roughness = 0.9;
    } else {
      scene.background = new THREE.Color(0x04050a);
      scene.environmentIntensity = 1.0;
      key.color.set(0x8fa8ff);
      key.intensity = 0.12;
      key.position.set(-6, 15, 4);
      fill.intensity = 0.03;
      floorMat.color.set(0x101114);
      floorMat.roughness = 0.45;
    }
    key.target.position.set(0, 0, 0);
  };
  st.setEnv(opts.env || q.get('env') || 'studio');

  /** Named camera views for something with dims { L, W, H } centered on x=0,z=0 with ground at y=0. */
  st.view = (name, dims = { L: 4.6, W: 2, H: 1.2 }, o = {}) => {
    const { L, W, H } = dims,
      k = o.dist || 1,
      c = new THREE.Vector3(0, H * 0.45, 0);
    const D = (L * 1.32 + 0.8) * k;
    const V =
      {
        front34: [[W * 1.55 + 1.2, H * 0.62 + 0.25, L * 0.92 + 1.4], c, 30],
        front34low: [[W * 1.25 + 0.9, 0.42, L * 0.95 + 1.2], [0, H * 0.4, 0.2], 30],
        rear34: [[-(W * 1.55 + 1.2), H * 0.7 + 0.3, -(L * 0.92 + 1.4)], c, 30],
        rear34r: [[W * 1.55 + 1.2, H * 0.7 + 0.3, -(L * 0.92 + 1.4)], c, 30],
        side: [[D * 1.25, H * 0.5, 0], [0, H * 0.48, 0], 22],
        sideR: [[-D * 1.25, H * 0.5, 0], [0, H * 0.48, 0], 22],
        front: [[0, H * 0.5, D * 1.1], [0, H * 0.46, 0], 22],
        rear: [[0, H * 0.55, -D * 1.1], [0, H * 0.46, 0], 22],
        top: [[0.001, D * 1.5, 0], [0, 0, 0], 24],
        high34: [[W * 1.3 + 1, H * 1.9 + 1.2, L * 0.8 + 1], [0, H * 0.3, 0], 32],
      }[name] || null;
    if (!V) return false;
    camera.position.set(V[0][0] * k, V[0][1], V[0][2] * k);
    if (name === 'top') camera.up.set(1, 0, 0);
    else camera.up.set(0, 1, 0);
    const t = Array.isArray(V[1]) ? new THREE.Vector3(...V[1]) : V[1];
    camera.fov = o.fov || V[2];
    camera.near = 0.03;
    camera.updateProjectionMatrix();
    camera.lookAt(t);
    controls.target.copy(t);
    controls.update();
    return true;
  };
  /** Free camera: position + look-at target + fov. */
  st.cam = (pos, look, fov = 32, near = 0.03) => {
    camera.up.set(0, 1, 0);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.fov = fov;
    camera.near = near;
    camera.updateProjectionMatrix();
    camera.lookAt(look[0], look[1], look[2]);
    controls.target.set(look[0], look[1], look[2]);
    controls.update();
  };
  st.stats = () => ({
    calls: renderer.info.render.calls,
    tris: renderer.info.render.triangles,
    geos: renderer.info.memory.geometries,
    tex: renderer.info.memory.textures,
  });
  st.onFrame = null;
  let last = performance.now();
  st.frame = () => {
    const now = performance.now(),
      dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (st.onFrame) st.onFrame(dt, now / 1000);
    if (!st.lockCam) controls.update();
    renderer.render(scene, camera);
  };
  st.start = () => renderer.setAnimationLoop(st.frame);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  return st;
}
