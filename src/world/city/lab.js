// city-look: tiny shared harness for standalone preview pages (real game sky / sun / env map when available).
//   const lab = await createLab();  lab.scene.add(...);  lab.start((dt, t) => { ... });
// URL params: ?cam=x,y,z&look=x,y,z&t=<hour>&fov=50   window.ready becomes true after the first rendered frames.
import * as THREE from 'three';

export async function createLab(o = {}) {
  const q = new URLSearchParams(location.search);
  const v = (k, d) => (q.get(k) || d).split(',').map(Number);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#000'; document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(Number(q.get('fov') || o.fov || 50), innerWidth / innerHeight, 0.1, 6000);
  camera.position.set(...v('cam', o.cam || '8,4,10')); const look = new THREE.Vector3(...v('look', o.look || '0,1.5,0')); camera.lookAt(look);
  const game = { THREE, renderer, scene, camera, updaters: [], fixedHooks: [], clock: { elapsed: 0, dt: 0 }, timeOfDay: Number(q.get('t') || o.hour || 14), timeExternal: true,
    player: { position: camera.position.clone() }, settings: {}, on() {}, emit() { return true; } };
  window.game = game;
  let env = null;
  if (o.sky !== false && q.get('sky') !== '0') {
    try { const m = await import('../environment.js'); env = await m.createEnvironment(game); } catch (e) { console.warn('[lab] game sky unavailable, using fallback', e?.message || e); }
  }
  if (!env) {
    scene.background = new THREE.Color(0x9cc4e8);
    const sun = new THREE.DirectionalLight(0xfff0dc, 3.2); sun.position.set(-30, 60, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -40; sc.right = sc.top = 40; sc.far = 200; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    scene.add(sun, new THREE.HemisphereLight(0xbfd8ff, 0x8a7a60, 0.9));
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  }
  if (o.ground !== false) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f6f6c, roughness: 0.95 }));
    g.receiveShadow = true; g.name = 'lab-ground'; scene.add(g);
  }
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  let frames = 0, last = performance.now();
  function start(fn) {
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      game.clock.dt = dt; game.clock.elapsed += dt; game.player.position.copy(camera.position);
      try { env?.update?.(dt); for (const u of game.updaters) u(dt); fn?.(dt, game.clock.elapsed); } catch (e) { console.error(e); }
      renderer.render(scene, camera);
      if (++frames === 20) window.ready = true;
      requestAnimationFrame(loop);
    };
    loop();
  }
  return { THREE, renderer, scene, camera, game, env, look, start, info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures }) };
}
