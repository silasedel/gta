// Dev-only viewer: http://127.0.0.1:5173/assets/characters/test.html  (not used by the game)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { preloadCharacters, createCharacter } from './characterModel.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb4d0);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(
  new RoomEnvironment(),
  0.04,
).texture;
const sun = new THREE.DirectionalLight(0xffe0c0, 2.5);
sun.position.set(3, 6, 4);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x777777 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200);
camera.position.set(0, 1.6, 4.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
const game = { THREE, scene, camera, renderer };
await preloadCharacters(game);
const q = new URLSearchParams(location.search);
const chars = [];
const player = createCharacter(game, { variant: 'player', seed: 1 });
scene.add(player.root);
chars.push(player);
const nPeds = +(q.get('peds') || 6);
for (let i = 0; i < nPeds; i++) {
  const c = createCharacter(game, {
    variant: 'ped',
    seed: 1000 + i * 37,
    outfit: q.get('outfit') || undefined,
  });
  c.root.position.set(
    (i + 1) * 1.1 * (i % 2 ? 1 : -1) * 0.6 + (i % 2 ? 1 : -1),
    0,
    -1.5 - (i >> 1) * 0.3,
  );
  scene.add(c.root);
  chars.push(c);
}
window.anim = {
  speed: 0,
  grounded: true,
  jumping: false,
  sprint: false,
  driving: false,
  punch: false,
  dead: false,
};
window.chars = chars;
window.camera = camera;
window.controls = controls;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (!window.paused) {
    for (const c of chars) c.update(dt, window.anim);
    window.anim.punch = false;
  }
  controls.update();
  renderer.render(scene, camera);
  document.getElementById('ui').textContent = JSON.stringify(window.anim);
});
// manual stepping for background tabs: step(frames, dt)
window.step = (n = 30, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    for (const c of chars) c.update(dt, window.anim);
    window.anim.punch = false;
  }
  controls.update();
  renderer.render(scene, camera);
  return 'stepped';
};
// ragdoll test: window.ragTest(index, vx, vz) then window.ragStep(n)
window.ragTest = async (i = 1, vx = 0, vz = 6) => {
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
  await RAPIER.init();
  const { createRagdollSystem } = await import('../npc/ragdoll.js');
  if (!window.__rw) {
    window.__rw = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    window.__rw.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.1, 50).setTranslation(0, -0.1, 0));
  }
  window.__rs = window.__rs || createRagdollSystem({ world: window.__rw, RAPIER }, 6);
  return !!window.__rs.start(chars[i], { vel: { x: vx, y: 1.0, z: vz }, spin: 2 });
};
window.ragStep = (n = 60) => {
  for (let k = 0; k < n; k++) {
    window.__rw.step();
    window.__rs.update(1 / 60);
  }
  return 'ok';
};
