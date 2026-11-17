// SOUTHLINE: world markers for missions, jobs, races, deliveries, hits and businesses (r2, item 7).
// GTA-style and subtle: a soft translucent ground ring, a knee-high glow fading upward and a small floating chevron
// that turns slowly. No light pillar into the sky. Long-range finding is the map / minimap blip's job.
//   - Day: normal blending (tinted glass), so it reads on bright sand and concrete. Night: unlit colors (toneMapped off)
//     glow by themselves.
//   - The chevron grows a little with distance (up to ~2.4x at 80 m+), so it stays readable at mid range without being
//     big up close. Animation runs in onBeforeRender, so callers need no tick.
//   - Shared geometry and textures. Materials are shared per color; when a caller swaps or recolors the ring's material
//     (business.v2 does), the wall and icon follow it through per-marker copies.
// API: createMarker(THREE, { color, radius, wall, icon: 'chevron' | 'arrow' | 'flag' | null, iconY, dir: {x,z} }) -> Group
//   group.userData.ring : the ground ring mesh (material.color drives the whole marker)
//   group.userData.setDir(x, z) : 'arrow' icon direction (race checkpoints point at the next one)

let K = null; // shared kit, built on first use

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function kit(THREE) {
  if (K) return K;
  // ground ring: faint fill, a soft bright band near the rim, a short outer glow; white so the material color tints it
  const disc = canvasTex(THREE, 256, 256, (g, w) => {
    const im = g.createImageData(w, w), d = im.data, R = w / 2;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const r = Math.hypot(i + 0.5 - R, j + 0.5 - R) / R;
      const band = Math.exp(-(((r - 0.84) / 0.045) ** 2));
      const inner = Math.exp(-(((r - 0.6) / 0.03) ** 2)) * 0.22;
      const fill = r < 0.84 ? 0.1 + 0.12 * (r / 0.84) ** 3 : 0;
      const glow = r > 0.84 ? Math.exp(-((r - 0.84) / 0.07)) * 0.35 : 0;
      const a = Math.min(1, band * 0.95 + inner + fill + glow) * (r < 1 ? 1 : 0);
      const k = (j * w + i) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(a * 255);
    }
    g.putImageData(im, 0, 0);
  });
  // race arrow: two chevrons pointing up, soft dark edge so it reads on a bright sky
  const arrow = canvasTex(THREE, 128, 128, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const chev = (y) => { g.beginPath(); g.moveTo(26, y + 30); g.lineTo(64, y - 4); g.lineTo(102, y + 30); };
    for (const [lw, col] of [[26, 'rgba(0,0,0,0.28)'], [16, '#fff']]) { g.lineWidth = lw; g.strokeStyle = col; chev(30); g.stroke(); chev(70); g.stroke(); }
  });
  // finish flag: rounded checkered square
  const flag = canvasTex(THREE, 128, 128, (g) => {
    g.save(); g.beginPath(); g.roundRect ? g.roundRect(14, 22, 100, 84, 12) : g.rect(14, 22, 100, 84); g.clip();
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#1a1a1a' : '#ffffff'; g.fillRect(14 + i * 20, 22 + j * 21, 20, 21); }
    g.restore(); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.roundRect ? g.roundRect(14, 22, 100, 84, 12) : g.rect(14, 22, 100, 84); g.stroke();
  });
  // floating chevron: a thick V pointing down (GTA mission marker), centered on its tip at y = 0
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.36, 0.42); s.lineTo(0.2, 0.42); s.lineTo(0, 0.19); s.lineTo(-0.2, 0.42); s.lineTo(-0.36, 0.42); s.closePath();
  const chevron = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 1 });
  chevron.translate(0, 0, -0.045);
  // painted shading (unlit): brighter along the top edge, a touch deeper toward the tip, so it reads as a solid piece
  { const pos = chevron.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const t = Math.min(1, Math.max(0, pos.getY(i) / 0.44)), k = 0.8 + 0.2 * t * t; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
    chevron.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  K = {
    disc, arrow, flag, chevron,
    discGeo: new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
    wallGeo: new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0),
    planeGeo: new THREE.PlaneGeometry(1, 1),
    mats: new Map(),
  };
  return K;
}

// knee-high glow: rises softly from the ground ring and fades out toward the top AND toward the silhouette, so it
// reads as a haze of light, never as a glass slab with hard edges (view-angle fade in the shader)
function wallMaterial(THREE, color) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0.3 } }]),
    vertexShader: `
      varying float vH; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_vertex>
      void main() {
        vH = position.y;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uAlpha;
      varying float vH; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_fragment>
      void main() {
        float h = clamp(vH, 0.0, 1.0);
        float rise = pow(1.0 - h, 2.6);
        float face = smoothstep(0.05, 0.75, abs(dot(normalize(vN), normalize(vV))));
        gl_FragColor = vec4(uColor, uAlpha * rise * face);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  // same .color API as the basic materials (callers and the sync recolor through it), kept across clones
  const alias = (x) => { x.color = x.uniforms.uColor.value; const base = x.clone.bind(x); x.clone = () => alias(base()); return x; };
  return alias(m);
}

function mat(THREE, kind, color) {
  const k = kind + ':' + color;
  let m = K.mats.get(k);
  if (m) return m;
  const base = { color, transparent: true, depthWrite: false, toneMapped: false };
  if (kind === 'disc') m = new THREE.MeshBasicMaterial({ ...base, map: K.disc, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  else if (kind === 'wall') m = wallMaterial(THREE, color);
  else if (kind === 'cap') m = new THREE.MeshBasicMaterial({ color, vertexColors: true, toneMapped: false, transparent: true, opacity: 0.94, fog: false });
  else if (kind === 'side') m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.62), vertexColors: true, toneMapped: false, transparent: true, opacity: 0.94, fog: false });
  else if (kind === 'arrow') m = new THREE.MeshBasicMaterial({ ...base, map: K.arrow, side: THREE.DoubleSide, opacity: 0.95, fog: false });
  else if (kind === 'flag') m = new THREE.MeshBasicMaterial({ map: K.flag, color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(0.92), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, opacity: 0.92, fog: false });
  K.mats.set(k, m);
  return m;
}

const _white = { r: 1, g: 1, b: 1 };
const _v = { cam: null, q: null, z: null, p: null };
export function createMarker(THREE, opts = {}) {
  kit(THREE);
  if (!_v.cam) { _v.cam = new THREE.Vector3(); _v.q = new THREE.Quaternion(); _v.z = new THREE.Quaternion(); _v.p = new THREE.Vector3(); _v.r = new THREE.Vector3(); _v.f = new THREE.Vector3(); _v.ax = new THREE.Vector3(0, 0, 1); }
  const color = opts.color ?? 0xffd25a;
  const radius = Math.max(0.9, opts.radius ?? 1.4);
  const wallH = opts.wall ?? Math.min(1.1, 0.5 + radius * 0.18);
  const icon = opts.icon === undefined ? 'chevron' : opts.icon;
  const g = new THREE.Group();
  g.name = 'marker';

  const ring = new THREE.Mesh(K.discGeo, mat(THREE, 'disc', color));
  ring.scale.setScalar(radius * 1.12); ring.position.y = 0.06; ring.renderOrder = 3;
  const wall = new THREE.Mesh(K.wallGeo, mat(THREE, 'wall', color));
  wall.scale.set(radius * 0.94, wallH, radius * 0.94); wall.position.y = 0.04; wall.renderOrder = 4;
  for (const m of [ring, wall]) { m.castShadow = false; m.receiveShadow = false; }
  g.add(ring, wall);

  let iconMesh = null;
  const baseMat = ring.material;
  const dir = { x: opts.dir?.x ?? 0, z: opts.dir?.z ?? 1 };
  if (icon === 'chevron') {
    iconMesh = new THREE.Mesh(K.chevron, [mat(THREE, 'cap', color), mat(THREE, 'side', color)]);
    iconMesh.position.y = opts.iconY ?? 2.1;
  } else if (icon === 'arrow' || icon === 'flag') {
    iconMesh = new THREE.Mesh(K.planeGeo, mat(THREE, icon, color));
    iconMesh.position.y = opts.iconY ?? 2.6;
    iconMesh.frustumCulled = false;
  }
  if (iconMesh) {
    iconMesh.castShadow = false; iconMesh.renderOrder = 5;
    const y0 = iconMesh.position.y, phase = Math.random() * 6.28, size = opts.iconSize ?? (icon === 'chevron' ? 1 : icon === 'flag' ? 0.95 : 1.5);
    iconMesh.onBeforeRender = (renderer, scene, camera) => {
      const t = performance.now() / 1000;
      g.getWorldPosition(_v.p);
      camera.getWorldPosition(_v.cam);
      const d = _v.cam.distanceTo(_v.p);
      const k = size * Math.min(2.8, Math.max(1, d / 32)); // a little bigger far away, never huge up close
      if (icon === 'chevron') {
        iconMesh.position.y = y0 + Math.sin(t * 2.1 + phase) * 0.07 * k;
        iconMesh.rotation.set(0, t * 1.3 + phase, 0);
        iconMesh.scale.setScalar(k);
      } else {
        // screen-facing card; the arrow turns in screen space toward dir ("away from the camera" = up)
        camera.getWorldQuaternion(_v.q);
        let roll = 0;
        if (icon === 'arrow') {
          _v.r.set(1, 0, 0).applyQuaternion(_v.q); _v.f.set(0, 0, -1).applyQuaternion(_v.q); _v.f.y = 0; _v.f.normalize();
          roll = Math.atan2(-(dir.x * _v.r.x + dir.z * _v.r.z), dir.x * _v.f.x + dir.z * _v.f.z);
        }
        _v.z.setFromAxisAngle(_v.ax, roll);
        if (g.parent) { g.parent.getWorldQuaternion(iconMesh.quaternion); iconMesh.quaternion.invert().multiply(_v.q); } else iconMesh.quaternion.copy(_v.q);
        iconMesh.quaternion.multiply(_v.z);
        iconMesh.position.y = y0 + Math.sin(t * 2.1 + phase) * 0.06 * k;
        iconMesh.scale.setScalar(k);
      }
      iconMesh.updateMatrix();
      iconMesh.matrixWorld.multiplyMatrices(g.matrixWorld, iconMesh.matrix);
    };
    g.add(iconMesh);
  }
  // a caller may swap / recolor the ring material (business.v2 does): wall and icon get their own copies that follow it
  const sync = () => {
    if (ring.material === baseMat) return;
    if (!g.userData.own) {
      g.userData.own = true;
      wall.material = wall.material.clone();
      if (iconMesh) iconMesh.material = Array.isArray(iconMesh.material) ? iconMesh.material.map((m) => m.clone()) : iconMesh.material.clone();
    }
    const c = ring.material.color;
    wall.material.color.copy(c);
    if (!iconMesh) return;
    if (icon === 'flag') { iconMesh.material.color.copy(c).lerp(_white, 0.55).multiplyScalar(0.92); return; }
    if (Array.isArray(iconMesh.material)) { iconMesh.material[0].color.copy(c); iconMesh.material[1].color.copy(c).multiplyScalar(0.62); } else iconMesh.material.color.copy(c);
  };
  wall.onBeforeRender = sync;
  g.userData.ring = ring;
  g.userData.icon = iconMesh;
  g.userData.setDir = (x, z) => { const l = Math.hypot(x, z) || 1; dir.x = x / l; dir.z = z / l; };
  if (opts.dir) g.userData.setDir(opts.dir.x, opts.dir.z);
  return g;
}
