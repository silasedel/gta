// Loads a row of mission props through src/story/props.js for a quick in-engine check
// (tools/v2/mission/check.mjs drives it through tools/v2/browser.mjs).
import * as THREE from 'three';
import { loadMissionProp } from '../../../src/story/props.js';

const IDS = [
  'package_waterproof',
  'crate_cargo',
  'dive_tank',
  'scuba_mask',
  'flare_gun',
  'phone',
  'cash_case_open',
  'money_stack_20',
  'cash_100',
];

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x30343a);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
  camera.position.set(0, 1.1, 2.4);
  camera.lookAt(0, 0.15, 0);

  const loaded = [];
  for (let i = 0; i < IDS.length; i++) {
    const prop = await loadMissionProp(IDS[i]);
    prop.position.x = (i - (IDS.length - 1) / 2) * 0.32;
    scene.add(prop);
    loaded.push(IDS[i]);
  }
  // the destroyer through its LOD, far away, proves the LOD path loads
  const ship = await loadMissionProp('navy_destroyer', { lod: true });
  ship.position.set(0, -20, -400);
  scene.add(ship);

  renderer.render(scene, camera);
  window.stats = { loaded, lodLevels: ship.levels.length };
  window.ready = true;
}

main().catch((e) => {
  window.error = String(e);
  window.ready = true;
});
