// Standalone yacht preview: builds one yacht (or the whole fleet side by side) with sky, sun and water, no game needed.
//   preview.html?yacht=<id>            one yacht, orbit camera (drag to orbit, wheel to zoom)
//   &cam=px,py,pz,tx,ty,tz             fixed camera (for screenshots)
//   &view=<name>                       named camera from the yacht's own view list (ext, stern, bow, deck:<id>, ...)
//   &lod=0|1|2  &tod=<hour>  &night=1  &fleet=1 (contact sheet)  &walk=1 (walk aboard, see onboard.js)
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildYacht, lodStats } from './buildYacht.js';
import { tex } from './kit/tex.js';

const Q = new URLSearchParams(location.search);
const mods = import.meta.glob('./fleet/*.js');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.5;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(+Q.get('fov') || 50, innerWidth / innerHeight, 0.08, 6000);

// ---- sky, sun, environment
const tod = +(Q.get('tod') ?? (Q.get('night') ? 21.5 : 15.5));
const night = tod < 6 || tod > 19.5;
const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
const sunDir = new THREE.Vector3();
{
  const el = night ? -8 : Math.max(4, 62 * Math.sin(((tod - 6) / 13.5) * Math.PI)), az = 200 + (tod - 12) * 14;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
  const u = sky.material.uniforms; u.turbidity.value = 2.2; u.rayleigh.value = night ? 0.15 : 1.1; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(sunDir);
}
const sun = new THREE.DirectionalLight(0xfff0dc, night ? 0.05 : 4.2); sun.position.copy(sunDir).multiplyScalar(120); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 320; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(night ? 0x1b2a44 : 0xbfd8ff, night ? 0x05070a : 0x3a5a6a, night ? 0.25 : 0.55));
{
  const pm = new THREE.PMREMGenerator(renderer), s2 = new THREE.Scene(), sk = new Sky(); sk.scale.setScalar(1000); Object.assign(sk.material.uniforms.sunPosition.value, sunDir);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sk.material.uniforms[k].value = sky.material.uniforms[k].value;
  s2.add(sk); const sea = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: night ? 0x04080d : 0x1b5f7e })); sea.rotation.x = -Math.PI / 2; sea.position.y = -2; s2.add(sea);
  scene.environment = pm.fromScene(s2, 0.02).texture; scene.environmentIntensity = night ? 0.25 : 0.9;
}
// ---- water
const SEA = 0;
const wn = tex('peel'); const waterN = wn.normalMap.clone(); waterN.wrapS = waterN.wrapT = THREE.RepeatWrapping; waterN.repeat.set(160, 160); waterN.needsUpdate = true;
const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshPhysicalMaterial({ color: night ? 0x06202c : 0x0d6f8f, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.86, normalMap: waterN, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 1.3 }));
water.rotation.x = -Math.PI / 2; water.position.y = SEA; water.receiveShadow = true; water.renderOrder = 1; scene.add(water);
const bed = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x0a3d4d, roughness: 1 })); bed.rotation.x = -Math.PI / 2; bed.position.y = -7; scene.add(bed);

// ---- yacht(s)
const PV = (window.PV = { ready: false, built: [], THREE, scene, camera, renderer, errors: [] });
const ui = document.getElementById('ui');
async function load(id) {
  const k = './fleet/' + id + '.js'; if (!mods[k]) throw new Error('no yacht ' + id + ' (have: ' + Object.keys(mods).join(', ') + ')');
  const def = (await mods[k]()).default; const t0 = performance.now();
  const b = buildYacht(def, { seed: Q.get('seed') ?? def.id, maxLod: Q.has('maxLod') ? +Q.get('maxLod') : 2 });
  b.buildMs = Math.round(performance.now() - t0); return b;
}
const ids = Q.get('fleet') ? Object.keys(mods).map((k) => k.slice(8, -3)).filter((k) => k[0] !== '_' && k !== 'index') : [Q.get('yacht') || '_kitcheck'];
let xOff = 0;
for (const id of ids) {
  try {
    const b = await load(id); b.group.position.set(xOff, 0, 0); if (ids.length > 1) xOff -= (b.def.dims?.B ?? 7) + 7;
    if (Q.has('lod')) b.setLod(+Q.get('lod'));
    scene.add(b.group); PV.built.push(b); b.lodStats = lodStats(b);
    // light groups on at night
    if (night || Q.get('lights')) for (const g of b.mats.emissive.keys()) b.mats.setGroup(g, g === 'uw' ? 6 : 3);
  } catch (e) { console.error('[preview] ' + id, e); PV.errors.push(String(e)); }
}
const B0 = PV.built[0];
// ---- camera
let orbit = { yaw: 0.9, pitch: 0.28, dist: (B0?.def.dims?.L ?? 24) * 1.5, target: new THREE.Vector3(0, 2.5, 0) };
PV.cam = (px, py, pz, tx, ty, tz, fov) => { orbit = null; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
if (Q.get('cam')) { const c = Q.get('cam').split(',').map(Number); PV.cam(...c); }
else if (Q.get('view') && B0?.def.views?.[Q.get('view')]) PV.cam(...B0.def.views[Q.get('view')]);
addEventListener('mousemove', (e) => { if (orbit && e.buttons & 1) { orbit.yaw -= e.movementX * 0.005; orbit.pitch = Math.max(-0.2, Math.min(1.4, orbit.pitch + e.movementY * 0.005)); } });
addEventListener('wheel', (e) => { if (orbit) orbit.dist = Math.max(3, Math.min(400, orbit.dist * (1 + e.deltaY * 0.001))); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
if (B0) ui.innerHTML = PV.built.map((b) => `<b>${b.def.name}</b> · ${b.def.builder || ''} ${b.def.model || ''} · ${b.def.lengthFt} ft\ntris ${b.stats.tris.toLocaleString()} (far ${b.lodStats.far.tris.toLocaleString()} / mid ${b.lodStats.mid.tris.toLocaleString()}) · meshes ${b.stats.meshes} · colliders ${b.stats.colliders} · build ${b.buildMs} ms`).join('\n');
if (Q.get('noui')) ui.style.display = 'none';
PV.hooks = [];
const clock = new THREE.Clock(); let time = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); time += dt;
  if (orbit) { const cp = Math.cos(orbit.pitch); camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist); camera.lookAt(orbit.target); }
  waterN.offset.set(time * 0.004, time * 0.0025);
  for (const b of PV.built) { const rt = b.rt || (b.rt = { time: 0, state: { speed: 0, rudder: 0, throttle: 0, rpm: 0, heading: 0, roll: 0, pitch: 0 }, parts: b.parts, built: b, night, wind: 4 }); rt.time = time; for (const u of b.updaters) { try { u(dt, rt); } catch (e) { if (!b._uerr) { b._uerr = 1; console.error('[preview] updater', e); } } } }
  for (const h of PV.hooks) h(dt, time);
  sun.target.position.copy(orbit ? orbit.target : camera.position); sun.position.copy(sun.target.position).addScaledVector(sunDir, 140);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
PV.info = () => PV.built.map((b) => ({ id: b.def.id, stats: b.stats, lod: b.lodStats, buildMs: b.buildMs, nodes: b.nav.nodes.size, links: b.nav.links.length, spots: b.spots.length, interacts: b.interacts.length, areas: b.areas.length, lights: b.lights.length, doors: b.doors.length, calls: renderer.info.render.calls, frameTris: renderer.info.render.triangles }));
setTimeout(() => { PV.ready = true; }, 600);
