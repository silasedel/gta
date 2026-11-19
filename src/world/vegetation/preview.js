// Vegetation preview: ?kinds=coconut,royal&n=1&seed=1&cam=x,y,z&look=x,y,z&sun=az,el&t=seconds&lod=0&field=0&hud=1
import * as THREE from 'three';
import { build, KINDS, KIND_TYPE } from './index.js';
import { updateVegetation, vegUniforms } from './materials.js';
import { createVegField } from './field.js';

const q = new URLSearchParams(location.search),
  num = (k, d) => (q.has(k) ? +q.get(k) : d),
  vec = (k, d) => (q.get(k) || d).split(',').map(Number);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exp', 1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
{
  // sky gradient
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const x = c.getContext('2d'),
    g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#4f86c6');
  g.addColorStop(0.55, '#a9c8e6');
  g.addColorStop(1, '#e8eef0');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xc8dbe8, 120, 900);
const camera = new THREE.PerspectiveCamera(num('fov', 50), innerWidth / innerHeight, 0.05, 3000);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x8a7a5a, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
const [saz, sel] = vec('sun', '0.8,0.75');
sun.position.set(
  Math.cos(saz) * Math.cos(sel) * 60,
  Math.sin(sel) * 60,
  Math.sin(saz) * Math.cos(sel) * 60,
);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -40;
sc.right = sc.top = 40;
sc.far = 200;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
{
  // ground: sandy soil with grit, procedural
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#b9a98a';
  x.fillRect(0, 0, 512, 512);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30000; i++) {
    const v = 120 + r() * 100;
    x.fillStyle = `rgba(${v},${v * 0.9},${v * 0.72},${0.25 + r() * 0.4})`;
    x.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.anisotropy = 8;
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }),
  );
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
}
const fields = [];
if (q.get('field')) {
  // LOD field test: ?field=coconut:400,sabal:150,... spread over a square of side `area`
  const A = num('area', 600);
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const spec of q.get('field').split(',')) {
    const [kind, cnt] = spec.split(':');
    const items = [];
    for (let i = 0; i < +cnt; i++)
      items.push({
        x: (r() - 0.5) * A,
        y: 0,
        z: (r() - 0.5) * A - A * 0.3,
        ry: r() * 6.28,
        s: 0.85 + r() * 0.3,
      });
    const f = createVegField(renderer, kind, items, { variants: num('variants', 4) });
    scene.add(f.group);
    fields.push(f);
  }
}
const kinds = (q.get('field') ? '' : q.get('kinds') || 'coconut,royal,sabal,date,queen,palmetto')
  .split(',')
  .filter((k) => KIND_TYPE[k]);
const n = num('n', 1),
  gap = num('gap', 8),
  lod = num('lod', 0);
let tris = 0,
  x0 = -((kinds.length * n - 1) * gap) / 2,
  k = 0;
const stats = [];
for (const kind of kinds)
  for (let i = 0; i < n; i++) {
    const t0 = performance.now(),
      p = build(kind, { seed: num('seed', 1) + k * 13 + i * 7, lod });
    p.group.position.set(x0 + k * gap, 0, (k % 2) * num('stagger', 0));
    p.group.rotation.y = num('rot', 0) + k * 0.7;
    scene.add(p.group);
    k++;
    tris += p.tris;
    stats.push(
      `${kind}#${i} h=${p.height.toFixed(1)} tris=${p.tris} ${(performance.now() - t0).toFixed(0)}ms`,
    );
  }
let focusSet = false;
if (q.get('focus')) {
  // frame the first plant: crown | trunk | whole
  const g0 = scene.children[scene.children.length - 1],
    bb = new THREE.Box3().setFromObject(g0),
    c = bb.getCenter(new THREE.Vector3()),
    sz = bb.getSize(new THREE.Vector3());
  const f = q.get('focus'),
    d = num('dist', 1),
    ang = num('ang', 0.6);
  let tgt = c.clone(),
    R = Math.max(sz.x, sz.z) * 1.1 * d;
  if (f === 'crown') {
    const lb = new THREE.Box3().setFromObject(g0.children[g0.children.length - 1]);
    tgt = lb.getCenter(new THREE.Vector3());
    R = Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z) * 0.95 * d;
  }
  if (f === 'trunk') {
    tgt = new THREE.Vector3(g0.position.x, num('ty', 1.4), g0.position.z);
    R = 2.6 * d;
  }
  if (f === 'whole') R = Math.max(sz.y, sz.x) * 1.25 * d;
  camera.position.set(
    tgt.x + Math.cos(ang) * R,
    tgt.y + num('dy', f === 'crown' ? -R * 0.25 : 0.3),
    tgt.z + Math.sin(ang) * R,
  );
  camera.lookAt(tgt);
  focusSet = true;
}
if (!focusSet)
  camera.position.set(...vec('cam', `0,6,${Math.max(18, kinds.length * n * gap * 0.75)}`));
if (!focusSet) camera.lookAt(...vec('look', '0,5,0'));
const info = document.getElementById('i');
info.textContent = stats.join('\n') + `\ntotal tris ${tris}`;
if (q.get('hud') === '0') info.style.display = 'none';
window.vegStats = { tris, stats };
const T = num('t', 3);
let frames = 0;
// contact sheet: ?sheet=crown|trunk|whole renders each built plant alone into a tile (cols x rows) of one frame
const sheet = q.get('sheet'),
  plants = scene.children.filter((o) => o.name && o.name.startsWith('veg_'));
function renderSheet() {
  const cols = num('cols', 3),
    rows = Math.ceil(plants.length / cols),
    W = innerWidth,
    H = innerHeight,
    tw = Math.floor(W / cols),
    th = Math.floor(H / rows);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x000000, 1);
  plants.forEach((g0, i) => {
    plants.forEach((o) => (o.visible = o === g0));
    const bb = new THREE.Box3().setFromObject(g0),
      lb = new THREE.Box3().setFromObject(g0.children[g0.children.length - 1]),
      ang = num('ang', 0.6) + i * 0.4;
    let tgt, R;
    if (sheet === 'trunk') {
      tgt = new THREE.Vector3(g0.position.x, num('ty', 1.3), g0.position.z);
      R = num('dist', 2.4);
    } else if (sheet === 'crown') {
      tgt = lb.getCenter(new THREE.Vector3());
      R = Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z, 2) * 0.9 * num('dist', 1);
    } else {
      tgt = bb.getCenter(new THREE.Vector3());
      R = Math.max(bb.max.y - bb.min.y, bb.max.x - bb.min.x) * 1.15 * num('dist', 1);
    }
    camera.aspect = tw / th;
    camera.updateProjectionMatrix();
    camera.position.set(
      tgt.x + Math.cos(ang) * R,
      tgt.y + (sheet === 'crown' ? -R * 0.22 : sheet === 'trunk' ? 0.25 : R * 0.1),
      tgt.z + Math.sin(ang) * R,
    );
    camera.lookAt(tgt);
    const x = (i % cols) * tw,
      y = H - (Math.floor(i / cols) + 1) * th;
    renderer.setViewport(x, y, tw, th);
    renderer.setScissor(x, y, tw, th);
    renderer.render(scene, camera);
  });
  renderer.setScissorTest(false);
}
if (sheet) plants.forEach((g, i) => g.position.set(0, 0, 0));
function loop() {
  updateVegetation(T + (frames / 60) * (q.get('anim') === '1' ? 1 : 0), scene, sun);
  for (const f of fields) f.update(camera);
  if (fields.length && frames === 2) {
    window.vegStats = { fields: fields.map((f) => f.stats()), renderer: renderer.info.render };
    info.textContent =
      JSON.stringify(
        window.vegStats.fields.map((s) => [
          s.kind,
          s.instancesPerLOD,
          s.drawCalls,
          s.tris,
          s.trisPerPlant[0],
        ]),
      ) +
      '\ncalls ' +
      renderer.info.render.calls +
      ' tris ' +
      renderer.info.render.triangles;
  }
  if (sheet) renderSheet();
  else renderer.render(scene, camera);
  frames++;
  if (frames === 3) window.ready = true;
  requestAnimationFrame(loop);
}
loop();
