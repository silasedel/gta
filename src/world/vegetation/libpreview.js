// Library plant sheet (vegetation track): ?keys=royal_palm,coconut_b&view=whole|crown|base|row&n=5&lod=0|1|2&t=3&sun=0.8,0.75&exp=1
//   whole / crown / base: one tile per model (n instances side by side in 'row' view show the per-instance variation)
import * as THREE from 'three';
import { loadVegModels, VEG_MODELS } from './models.js';
import { updateVegetation, setVegCamera } from './materials.js';

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
scene.background = new THREE.Color(0x9cbad6);
scene.fog = new THREE.Fog(0xb8cde0, 200, 1500);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x8a7a5a, 1.0));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
const [saz, sel] = vec('sun', '0.8,0.75');
sun.position.set(
  Math.cos(saz) * Math.cos(sel) * 80,
  Math.sin(sel) * 80,
  Math.sin(saz) * Math.cos(sel) * 80,
);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -30;
sc.right = sc.top = 30;
sc.far = 300;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60000, 600),
  new THREE.MeshStandardMaterial({ color: 0xa89878, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(num('fov', 40), 1, 0.05, 3000);
const keys = (q.get('keys') || Object.keys(VEG_MODELS).join(',')).split(',').filter(Boolean),
  view = q.get('view') || 'whole',
  N = num('n', view === 'row' ? 5 : 1),
  lod = num('lod', 0);
const info = document.getElementById('i');
const models = await loadVegModels(renderer, keys);
const tiles = [];
for (const k of keys) {
  const md = models[k];
  if (!md) {
    tiles.push({ k, g: null });
    continue;
  }
  const g = new THREE.Group(),
    L = md.materials(
      [0, 0, 0, 0],
      lod === 1 ? [0, 0, 0, 0] : null,
      lod === 2 ? [0, 0, 0, 0] : null,
    ),
    parts = lod === 2 && L.imp ? [L.imp] : lod === 1 ? L.mid : L.near;
  const gap = Math.max(md.radius * 2.1, 1.2);
  for (const p of parts) {
    const im = new THREE.InstancedMesh(p.geo, p.mat, N);
    im.customDepthMaterial = p.depth;
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    for (let i = 0; i < N; i++)
      im.setMatrixAt(
        i,
        new THREE.Matrix4().compose(
          new THREE.Vector3((i - (N - 1) / 2) * gap + 1000 * tiles.length, 0, 0.37 * i),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            num('rot', 0.6) + i * 0.9,
          ),
          new THREE.Vector3(1, 1, 1),
        ),
      );
    g.add(im);
  }
  scene.add(g);
  tiles.push({ k, g, md, gap, x: 1000 * tiles.length });
}
const cols = num('cols', Math.min(4, tiles.length)),
  rows = Math.ceil(tiles.length / cols);
function draw(t) {
  updateVegetation(t, scene, sun);
  const W = innerWidth,
    H = innerHeight,
    tw = Math.floor(W / cols),
    th = Math.floor(H / rows);
  renderer.setScissorTest(true);
  tiles.forEach((T, i) => {
    const x = (i % cols) * tw,
      y = H - (Math.floor(i / cols) + 1) * th;
    renderer.setViewport(x, y, tw, th);
    renderer.setScissor(x, y, tw, th);
    if (!T.md) {
      renderer.setClearColor(0x400000);
      renderer.clear();
      return;
    }
    const h = T.md.height,
      r = T.md.radius,
      ang = num('ang', 0.5),
      wide = view === 'row' ? N * T.gap * 0.62 : 0;
    let tgt, R;
    if (view === 'crown') {
      tgt = new THREE.Vector3(T.x, (T.md.crownY + h) / 2, 0);
      R = Math.max(r, h - T.md.crownY) * 2.0;
    } else if (view === 'base') {
      tgt = new THREE.Vector3(T.x, Math.min(1.2, h * 0.25), 0);
      R = Math.max(2.5, r * 0.6);
    } else {
      tgt = new THREE.Vector3(T.x, h * 0.5, 0);
      R = Math.max(h * 1.1, r * 2.2, wide) * 1.75;
    }
    camera.aspect = tw / th;
    camera.updateProjectionMatrix();
    camera.position.set(
      tgt.x + Math.sin(ang) * R,
      tgt.y + (view === 'crown' ? -R * 0.15 : view === 'base' ? 0.6 : R * 0.05),
      tgt.z + Math.cos(ang) * R,
    );
    camera.lookAt(tgt);
    sun.target.position.copy(tgt);
    sun.position
      .copy(tgt)
      .add(
        new THREE.Vector3(
          Math.cos(saz) * Math.cos(sel) * 80,
          Math.sin(sel) * 80,
          Math.sin(saz) * Math.cos(sel) * 80,
        ),
      );
    sc.left = sc.bottom = -Math.max(h, wide);
    sc.right = sc.top = Math.max(h, wide);
    sc.updateProjectionMatrix();
    setVegCamera(camera);
    renderer.render(scene, camera);
  });
  renderer.setScissorTest(false);
}
let f = 0;
(function loop() {
  draw(num('t', 3) + (q.get('anim') ? f / 60 : 0));
  f++;
  if (f === 3) {
    window.libReady = true;
    info.textContent = tiles
      .map((T) =>
        T.md
          ? `${T.k} h=${T.md.height.toFixed(1)} r=${T.md.radius.toFixed(1)} tris=${T.md.tris.join('/')}`
          : `${T.k} MISSING`,
      )
      .join('\n');
    if (q.get('hud') === '0') info.style.display = 'none';
  }
  requestAnimationFrame(loop);
})();
