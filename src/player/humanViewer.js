// Dev-only viewer for generated humans: /assets/humans/view.html?f=_test1.glb
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fb4d0);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffe0c0, 2.5); sun.position.set(3, 6, 4); sun.castShadow = true; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x777777 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200); camera.position.set(0, 1.6, 3.5);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1, 0);
window.scene = scene; window.camera = camera; window.controls = controls; window.THREE = THREE;
const q = new URLSearchParams(location.search);
const files = (q.get('f') || '_test1.glb').split(',');
const loader = new GLTFLoader(); { const d = new DRACOLoader(); d.setDecoderPath('/assets/humans/draco/'); loader.setDRACOLoader(d); }
window.models = [];
for (let i = 0; i < files.length; i++) {
  const g = await loader.loadAsync('/assets/humans/' + files[i]);
  g.scene.position.x = (i - (files.length - 1) / 2) * 0.8;
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (/LOD/.test(o.name)) o.visible = false; const n = o.material.name; o.material = new THREE.MeshStandardMaterial({ color: /garment/.test(n) ? 0xd0503a : /body/.test(n) ? 0xd9b49a : 0x555555, roughness: 0.7 }); } });
  scene.add(g.scene); window.models.push(g);
}
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
