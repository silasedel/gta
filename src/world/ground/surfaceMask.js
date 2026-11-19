// Ground surface mask (overnight ground pass): a top-down raster of every hard ground surface around the camera, so ground
// materials and vegetation know where asphalt, pavement and cars are without CPU queries.
//   R = asphalt (road ribbons, junction outlines, cul-de-sacs, dirt tracks)
//   G = other paved / built ground (sidewalk slabs, plazas, parking, docks, driveways, aprons)
//   B = mulch rings at street trees (half value). Cars are NOT rasterized any more (r2-ground): their footprint boxes made a
//       dark mulch outline around every car (the bilinear edge of a car box crosses the mulch band) and cut grass in a box.
//       Cars are analytic instead: per-frame rounded footprints in uniforms (gmCarPress(wp, dir) below), so plants flatten
//       and bend away under and around a car with a soft, car-shaped falloff and never lag a moving car.
// Two cascades: near (160 m, 0.16 m / texel) and far (640 m, 0.63 m / texel). Each has a sharp target and a Gaussian-blurred
// target (sigma ~1.4 m): the blurred value is ~0.5 at a surface edge and falls off over ~3 m, which drives
//   - the terrain shoulder blend (asphalt crumbs -> sand / gravel -> patchy grass, noise-cut, height weighted),
//   - the noise-cut crumbling edge of open (curb-less) asphalt,
//   - vegetation thinning toward an edge and no plants on any hard surface or under a car.
// Meshes join with register(mesh, 'asphalt' | 'paved'); proxies share the geometry (no copies) and leave when the source mesh
// leaves the scene. Shader side: GM_GLSL (gmHard(wp) / gmNear(wp) -> vec4, wp = world xz) + gmUniforms(sh.uniforms).
import * as THREE from 'three';

const OFF = typeof location !== 'undefined' && /[?&]gmask=0\b/.test(location.search); // A/B switch (audits)
const CASC = [
  { span: 160, size: 1024, blur: 512, bs: 1.5, every: 0.35, move: 10 },
  { span: 640, size: 2048, blur: 1024, bs: 0.75, every: 1.6, move: 48 },
];
const U = {
  uGMH0: { value: null },
  uGMN0: { value: null },
  uGMR0: { value: new THREE.Vector4(0, 0, 1, 0) },
  uGMH1: { value: null },
  uGMN1: { value: null },
  uGMR1: { value: new THREE.Vector4(0, 0, 1, 0) },
  uGMN2: { value: null },
  uGMR2: { value: new THREE.Vector4(0, 0, 1, 0) }, // far road field (whole road graph, 2 km around the camera): cheap shoulders at distance
  // cars near the camera, every frame: [x, z, half width, half length] and [cos yaw, sin yaw, press weight, 0]
  uGMCar: { value: Array.from({ length: 12 }, () => new THREE.Vector4(1e6, 1e6, 1, 1)) },
  uGMCarR: { value: Array.from({ length: 12 }, () => new THREE.Vector4(1, 0, 0, 0)) },
};
export const GM_UNIFORMS = U;
export function gmUniforms(uniforms) {
  Object.assign(uniforms, U);
  return uniforms;
}

// world xz -> cascade uv (the mask camera looks straight down, image top = -z)
export const GM_GLSL = /* glsl */ `
#ifndef GM_DEF
#define GM_DEF
uniform sampler2D uGMH0; uniform sampler2D uGMN0; uniform vec4 uGMR0;
uniform sampler2D uGMH1; uniform sampler2D uGMN1; uniform vec4 uGMR1;
vec2 gmUV(vec4 R, vec2 wp) { return vec2((wp.x - R.x) * R.z, 1.0 - (wp.y - R.y) * R.z); }
float gmW(vec2 uv) { vec2 e = min(uv, 1.0 - uv); return smoothstep(0.015, 0.07, min(e.x, e.y)); }
vec4 gmS(sampler2D t0, sampler2D t1, vec2 wp) {
  vec2 u0 = gmUV(uGMR0, wp), u1 = gmUV(uGMR1, wp);
  float w0 = uGMR0.w > 0.5 ? gmW(u0) : 0.0, w1 = uGMR1.w > 0.5 ? gmW(u1) : 0.0;
  vec4 a = w1 > 0.0 ? textureLod(t1, u1, 0.0) * w1 : vec4(0.0);
  if (w0 > 0.0) a = mix(a, textureLod(t0, u0, 0.0), w0);
  return a;
}
vec4 gmHard(vec2 wp) { return gmS(uGMH0, uGMH1, wp); }
vec4 gmNear(vec2 wp) { return gmS(uGMN0, uGMN1, wp); }
uniform sampler2D uGMN2; uniform vec4 uGMR2;
// blurred road field from the road graph (asphalt only, r), valid where the fine / mid cascades do not reach; 0 elsewhere
float gmFarRoad(vec2 wp) { if (uGMR2.w < 0.5) return 0.0; vec2 u = gmUV(uGMR2, wp); float w = gmW(u); if (w <= 0.0) return 0.0;
  float inner = uGMR1.w > 0.5 ? gmW(gmUV(uGMR1, wp)) : 0.0; return textureLod(uGMN2, u, 0.0).r * w * (1.0 - inner); }
// 1 inside the near cascade (fine detail available), 0 outside
float gmFine(vec2 wp) { return uGMR0.w > 0.5 ? gmW(gmUV(uGMR0, wp)) : 0.0; }
// car press: 1 under a car body, easing to 0 about 0.7 m outside its rounded plan outline (no box, no lag); dir = outward (world xz)
uniform vec4 uGMCar[12]; uniform vec4 uGMCarR[12];
float gmCarPress(vec2 wp, out vec2 dir) {
  float best = 0.0; dir = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    vec4 c = uGMCar[i]; vec2 d = wp - c.xy; if (dot(d, d) > 49.0) continue;
    vec4 r = uGMCarR[i];
    vec2 l = vec2(d.x * r.x - d.y * r.y, d.x * r.y + d.y * r.x); // car-local: x across, y along
    float rc = min(0.6, c.z * 0.6); vec2 q = abs(l) - (c.zw - rc);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rc;
    float p = (1.0 - smoothstep(-0.3, 0.7, sd)) * r.z;
    if (p > best) { best = p;
      vec2 qq = max(q, 0.0); vec2 g = qq.x + qq.y > 1e-4 ? normalize(qq) * sign(l) : (q.x > q.y ? vec2(sign(l.x), 0.0) : vec2(0.0, sign(l.y)));
      dir = vec2(g.x * r.x + g.y * r.y, -g.x * r.y + g.y * r.x); }
  }
  return best;
}
#endif
`;

const KIND = {
  asphalt: new THREE.Color(1, 0, 0),
  paved: new THREE.Color(0, 1, 0),
  car: new THREE.Color(0, 0, 1),
};
// A = unpaved drives / yard tracks (crushed shell, sand): drawn by the terrain shader, not by a slab
function maxMat(col) {
  return new THREE.MeshBasicMaterial({
    color: col,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false, // alpha 0: the A channel belongs to drives
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
}

export function createSurfaceMask() {
  const proxies = new Map();
  let registered = 0,
    dropped = 0; // source mesh -> proxy
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  const mats = { asphalt: maxMat(KIND.asphalt), paved: maxMat(KIND.paved), car: maxMat(KIND.car) };
  const carGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // unit quad (drives)
  // drives: unit quads in the alpha channel (MeshBasic writes alpha = opacity; color black, max blend keeps the other channels)
  const driveMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const DRV_N = 4096,
    drives = new THREE.InstancedMesh(carGeo, driveMat, DRV_N);
  drives.frustumCulled = false;
  drives.count = 0;
  drives.matrixAutoUpdate = false;
  scene.add(drives);
  const drvList = [];
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  cam.rotation.set(-Math.PI / 2, 0, 0);
  cam.matrixAutoUpdate = true;
  let R = null,
    built = false;
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  const qScene = new THREE.Scene();
  qScene.add(quad);
  // separable Gaussian (13 taps via 7 bilinear fetches), sigma in texels of the blur target
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tSrc, vUv) * 0.1592;
        c += (texture2D(tSrc, vUv + uDir * 1.4706) + texture2D(tSrc, vUv - uDir * 1.4706)) * 0.2659;
        c += (texture2D(tSrc, vUv + uDir * 3.4302) + texture2D(tSrc, vUv - uDir * 3.4302)) * 0.1263;
        c += (texture2D(tSrc, vUv + uDir * 5.4000) + texture2D(tSrc, vUv - uDir * 5.4000)) * 0.0332;
        c += (texture2D(tSrc, vUv + uDir * 7.3800) + texture2D(tSrc, vUv - uDir * 7.3800)) * 0.0050;
        gl_FragColor = c / 1.02;
      }`,
  });
  const rt = (n) => {
    const t = new THREE.WebGLRenderTarget(n, n, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    t.texture.colorSpace = THREE.NoColorSpace;
    return t;
  };
  const C = CASC.map((c, i) => ({
    ...c,
    i,
    hard: rt(c.size),
    b0: rt(c.blur),
    b1: rt(c.blur),
    t: 1e9,
    cx: 1e9,
    cz: 1e9,
  }));
  // far road field: one static mesh of every at-grade road-graph edge as a ribbon (built once), rendered into its own target
  const F = {
    span: 2048,
    size: 1024,
    blur: 512,
    bs: 1.0,
    every: 4,
    move: 220,
    i: 2,
    hard: rt(1024),
    b0: rt(512),
    b1: rt(512),
    t: 1e9,
    cx: 1e9,
    cz: 1e9,
  };
  U.uGMN2.value = F.b1.texture;
  const farScene = new THREE.Scene();
  farScene.matrixWorldAutoUpdate = false;
  let farBuilt = false;
  function buildFar(game) {
    farBuilt = true;
    const G = game.city && game.city.roadGraph;
    if (!G || !G.edges) return;
    const P = [];
    for (const e of G.edges) {
      if (!e || e.elevated || e.bridge || !e.pts || e.pts.length < 2) continue;
      const hw = (e.width || 6) / 2;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i],
          b = e.pts[i + 1],
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          L = Math.hypot(dx, dz);
        if (L < 0.01) continue;
        const nx = (-dz / L) * hw,
          nz = (dx / L) * hw;
        P.push(
          a[0] + nx,
          0,
          a[1] + nz,
          b[0] + nx,
          0,
          b[1] + nz,
          b[0] - nx,
          0,
          b[1] - nz,
          a[0] + nx,
          0,
          a[1] + nz,
          b[0] - nx,
          0,
          b[1] - nz,
          a[0] - nx,
          0,
          a[1] - nz,
        );
      }
    }
    if (!P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const m = new THREE.Mesh(g, mats.asphalt);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.matrixWorldAutoUpdate = false;
    farScene.add(m);
    stats.farTris = P.length / 9;
  }
  C.forEach((c) => {
    U['uGMH' + c.i].value = c.hard.texture;
    U['uGMN' + c.i].value = c.b1.texture;
  });
  const stats = { meshes: 0, renders: 0, ms: 0, cars: 0 };

  // an unpaved drive / track: center (x, z), heading ry (three.js rotation.y, local +z along the drive), width w, length len (m)
  // per-tile point features in the B channel at half value (B > 0.75 = car, 0.3-0.7 = mulch ring at a tree): [[x, z, r], ...];
  // the set follows `owner` (a tile group): it leaves the mask when the owner leaves the scene
  const discGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    mulchMat = maxMat(new THREE.Color(0, 0, 0.5));
  function registerPoints(owner, pts) {
    if (OFF || !owner || !pts || !pts.length || proxies.has(owner)) return;
    const im = new THREE.InstancedMesh(discGeo, mulchMat, pts.length);
    im.frustumCulled = false;
    im.matrixAutoUpdate = false;
    im.matrixWorldAutoUpdate = false;
    pts.forEach(([x, z, r], i) => {
      _m.makeScale(r, 1, r);
      _m.setPosition(x, 0, z);
      im.setMatrixAt(i, _m);
    });
    im.userData.src = owner;
    im.userData.t0 = performance.now();
    im.visible = false;
    im.userData.points = true;
    proxies.set(owner, im);
    scene.add(im);
    registered++;
  }
  function addDrive(x, z, ry, w, len) {
    if (OFF || drvList.length >= DRV_N || !Number.isFinite(x + z + ry + w + len)) return false;
    _q.setFromAxisAngle(_p.set(0, 1, 0), ry);
    _m.compose(_p.set(x, 0, z), _q, _s.set(w, 1, len));
    drives.setMatrixAt(drvList.length, _m);
    drvList.push([x, z, ry, w, len]);
    drives.count = drvList.length;
    drives.instanceMatrix.needsUpdate = true;
    for (const c of C) c.t = 1e9;
    return true;
  }
  function register(mesh, kind = 'asphalt') {
    if (OFF || !mesh || !mesh.geometry || proxies.has(mesh) || !mats[kind]) return;
    const p = new THREE.Mesh(mesh.geometry, mats[kind]);
    p.matrixAutoUpdate = false;
    p.matrixWorldAutoUpdate = false;
    p.frustumCulled = false;
    p.userData.src = mesh;
    p.userData.t0 = performance.now();
    p.visible = false;
    proxies.set(mesh, p);
    scene.add(p);
    registered++;
  }
  function sync(root) {
    for (const [src, p] of proxies) {
      let o = src,
        top = src,
        vis = true;
      while (o) {
        if (o.visible === false) vis = false;
        top = o;
        o = o.parent;
      }
      const on = top === root;
      if (!on) {
        p.visible = false;
        if (p.userData.seen || performance.now() - p.userData.t0 > 120000) {
          scene.remove(p);
          proxies.delete(src);
          dropped++;
        }
        continue;
      } // built but not attached yet: wait; detached after showing: gone
      p.userData.seen = true;
      p.visible = vis;
      if (!p.userData.points) p.matrixWorld.copy(src.matrixWorld);
    }
    stats.meshes = proxies.size;
  }
  const _m = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _p = new THREE.Vector3(),
    _s = new THREE.Vector3(),
    _e = new THREE.Euler();
  function renderCascade(renderer, c, x, z, sc = scene) {
    const tx = (c.span / c.size) * 8;
    const cx = Math.round(x / tx) * tx,
      cz = Math.round(z / tx) * tx,
      h = c.span / 2; // snapped: no texel swim
    cam.left = -h;
    cam.right = h;
    cam.top = h;
    cam.bottom = -h;
    cam.position.set(cx, 2000, cz);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    renderer.setRenderTarget(c.hard);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(sc, cam);
    quad.material = blurMat;
    blurMat.uniforms.tSrc.value = c.hard.texture;
    blurMat.uniforms.uDir.value.set(c.bs / c.blur, 0);
    renderer.setRenderTarget(c.b0);
    renderer.render(qScene, quadCam);
    blurMat.uniforms.tSrc.value = c.b0.texture;
    blurMat.uniforms.uDir.value.set(0, c.bs / c.blur);
    renderer.setRenderTarget(c.b1);
    renderer.render(qScene, quadCam);
    U['uGMR' + c.i].value.set(cx - h, cz - h, 1 / c.span, 1);
    c.cx = cx;
    c.cz = cz;
    c.t = 0;
  }
  // set-piece yard plants (Nico's house details: weeds, grass, strap plants, palmettos) follow the same rule: nothing on the road
  let autoT = 2;
  const autoDone = new WeakSet(),
    _bb = new THREE.Box3();
  function autoVeg(game) {
    const roots = [game.nicoHouse && game.nicoHouse.group].filter(Boolean);
    // flat set-piece hard surfaces (slabs, walks, pads, low decks, dock footprints): into the mask as pavement, so no grass grows
    // through them; the yard ground sheet itself ('ground:*' material) and see-through parts are left out
    for (const r of roots)
      r.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || autoDone.has(o) || !o.geometry) return;
        autoDone.add(o);
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.transparent || /^ground:|water|glass/i.test(m.name || '')) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        const h = _bb.max.y - _bb.min.y,
          ax = _bb.max.x - _bb.min.x,
          az = _bb.max.z - _bb.min.z,
          gy =
            game.city && game.city.groundHeightAt
              ? game.city.groundHeightAt(
                  (_bb.min.x + _bb.max.x) / 2,
                  (_bb.min.z + _bb.max.z) / 2,
                ) || 0
              : 0;
        if (
          o.userData.groundMask === 'skip' ||
          (o.parent && o.parent.userData.groundMask === 'skip')
        )
          return; // set pieces can opt a mesh out
        if (
          h < 0.6 &&
          _bb.max.y < gy + 1.4 &&
          ax * az > 1.5 &&
          ax * az <= 400 &&
          ax < 80 &&
          az < 80
        ) {
          register(o, 'paved');
          stats.autoPaved = (stats.autoPaved || 0) + 1;
        }
      }); // > 400 m2: a yard / ground sheet, never a slab
    for (const r of roots)
      r.traverse((o) => {
        if (!o.isInstancedMesh || autoDone.has(o)) return;
        autoDone.add(o);
        const m = Array.isArray(o.material) ? o.material[0] : o.material,
          nm =
            (o.name || '') +
            ' ' +
            ((m && m.name) || '') +
            ' ' +
            ((o.parent && o.parent.name) || '');
        if (!/plant|weed|grass|palmetto|fern|shrub|bush|flower/i.test(nm)) return;
        const edge = /weed|grass/i.test(nm);
        if (m) gmVeg(m, { edge });
        if (o.customDepthMaterial) gmVeg(o.customDepthMaterial, { edge });
        stats.autoVeg = (stats.autoVeg || 0) + 1;
      });
  }
  // per-frame car footprints (12 nearest the camera within 90 m): plan size from the car's own mesh bounds (cached per car)
  const dims = new WeakMap(),
    _bx = new THREE.Box3(),
    _bi = new THREE.Matrix4(),
    _cand = [];
  function carDims(v, o) {
    let d = dims.get(v);
    if (d) return d;
    const sp = v.spec || {};
    let hw = (sp.width || v.width || 0) / 2,
      hl = (sp.length || v.length || 0) / 2;
    if (!(hw > 0.4 && hl > 1) && o && o.isObject3D) {
      try {
        o.updateMatrixWorld(true);
        _bi.copy(o.matrixWorld).invert();
        const B = new THREE.Box3();
        o.traverse((m) => {
          if (!m.isMesh || !m.geometry || m.visible === false) return;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          _bx.copy(m.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(_bi, m.matrixWorld));
          B.union(_bx);
        });
        if (!B.isEmpty()) {
          const sx = B.max.x - B.min.x,
            sz = B.max.z - B.min.z;
          hw = Math.min(sx, sz) / 2;
          hl = Math.max(sx, sz) / 2;
        }
      } catch (e) {
        /* fallback below */
      }
    }
    if (!(hw > 0.4 && hl > 1)) {
      hw = 0.95;
      hl = 2.3;
    }
    d = { hw: Math.min(1.6, hw), hl: Math.min(7, hl) };
    dims.set(v, d);
    return d;
  }
  function carUniforms(game) {
    const L = (game.vehicles && game.vehicles.list) || [],
      cp = game.camera.position,
      A = U.uGMCar.value,
      B = U.uGMCarR.value;
    _cand.length = 0;
    for (const v of L) {
      if (!v || v.boat || v.isBoat || v.disposed) continue;
      const b = v.body && v.body.translation ? v.body.translation() : null,
        o = v.mesh || v.group || v.root || v.object;
      const p = b || (o && o.position);
      if (!p || !Number.isFinite(p.x)) continue;
      const d2 = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2;
      if (d2 > 8100) continue;
      _cand.push([d2, v, p, o]);
    }
    _cand.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, v, p, o] of _cand) {
      if (n >= 12) break;
      let yaw = 0;
      if (v.body && v.body.rotation) {
        const r = v.body.rotation();
        _q.set(r.x, r.y, r.z, r.w);
      } else if (o && o.quaternion) _q.copy(o.quaternion);
      else _q.identity();
      _e.setFromQuaternion(_q, 'YXZ');
      yaw = _e.y;
      const dm = carDims(v, o);
      // airborne / flipped cars press nothing; a car resting on its wheels presses fully
      let gy = null;
      try {
        gy = game.city && game.city.groundHeightAt ? game.city.groundHeightAt(p.x, p.z, p.y) : null;
      } catch (e) {
        gy = null;
      }
      const up = Math.cos(_e.x) * Math.cos(_e.z),
        hAbove = Number.isFinite(gy) ? p.y - gy : 0.6,
        w =
          THREE.MathUtils.clamp((2.2 - hAbove) / 1.2, 0, 1) *
          THREE.MathUtils.clamp((up - 0.3) / 0.4, 0, 1);
      A[n].set(p.x, p.z, dm.hw, dm.hl);
      B[n].set(Math.cos(yaw), Math.sin(yaw), w, 0);
      n++;
    }
    for (let i = n; i < 12; i++) {
      A[i].set(1e6, 1e6, 1, 1);
      B[i].set(1, 0, 0, 0);
    }
    stats.cars = n;
  }
  function update(dt, game) {
    if (OFF || !game || !game.renderer || !game.camera || !game.scene) return;
    carUniforms(game);
    if (!api.enabled) {
      U.uGMR0.value.w = 0;
      U.uGMR1.value.w = 0;
      U.uGMR2.value.w = 0;
      for (const c of C) c.t = 1e9;
      F.t = 1e9;
      return;
    } // A/B: everything falls back to no mask
    const renderer = game.renderer,
      p = game.camera.position;
    for (const c of C) c.t += dt;
    F.t += dt;
    autoT -= dt;
    if (autoT <= 0) {
      autoT = 3;
      autoVeg(game);
    }
    const due = C.filter((c) => c.t > c.every || Math.hypot(p.x - c.cx, p.z - c.cz) > c.move);
    if (!due.length && !(F.t > F.every || Math.hypot(p.x - F.cx, p.z - F.cz) > F.move)) return;
    const t0 = performance.now();
    sync(game.scene);
    const prevRT = renderer.getRenderTarget(),
      prevAC = renderer.autoClear,
      prevCol = renderer.getClearColor(new THREE.Color()),
      prevA = renderer.getClearAlpha(),
      prevSh = renderer.shadowMap.autoUpdate,
      prevNU = renderer.shadowMap.needsUpdate;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    const farDue = F.t > F.every || Math.hypot(p.x - F.cx, p.z - F.cz) > F.move;
    try {
      for (const c of due) renderCascade(renderer, c, p.x, p.z);
      if (farDue) {
        if (!farBuilt) buildFar(game);
        if (farScene.children.length) renderCascade(renderer, F, p.x, p.z, farScene);
      }
    } finally {
      renderer.setRenderTarget(prevRT);
      renderer.autoClear = prevAC;
      renderer.setClearColor(prevCol, prevA);
      renderer.shadowMap.autoUpdate = prevSh;
      renderer.shadowMap.needsUpdate = prevNU;
    }
    stats.renders++;
    stats.ms = performance.now() - t0;
    built = true;
  }
  // CPU readback for audits only (slow): hard mask value at (x, z) from the near cascade
  function debugRead(game, x, z) {
    const c = C[0],
      R4 = U.uGMR0.value;
    const u = (x - R4.x) * R4.z,
      v = 1 - (z - R4.y) * R4.z;
    if (u < 0 || v < 0 || u > 1 || v > 1) return null;
    const buf = new Uint8Array(4);
    game.renderer.readRenderTargetPixels(
      c.hard,
      Math.floor(u * c.size),
      Math.floor(v * c.size),
      1,
      1,
      buf,
    );
    return Array.from(buf);
  }
  const debug = () => {
    let seen = 0,
      vis = 0,
      reg = registered;
    for (const p of proxies.values()) {
      if (p.userData.seen) seen++;
      if (p.visible) vis++;
    }
    return {
      proxies: proxies.size,
      seen,
      vis,
      reg,
      dropped,
      drives: drvList.length,
      rect0: U.uGMR0.value.toArray(),
      rect1: U.uGMR1.value.toArray(),
    };
  };
  const api = {
    enabled: true,
    register,
    registerPoints,
    addDrive,
    debug,
    drives: drvList,
    update,
    stats,
    debugRead,
    get ready() {
      return built;
    },
    off: OFF,
    uniforms: U,
    cascades: C,
  };
  return api;
}

// one shared instance per page (tile builders register into it, the frame loop updates it)
let _inst = null;
export function surfaceMask() {
  if (_inst) return _inst;
  _inst = createSurfaceMask();
  const g = globalThis.game;
  if (g && Array.isArray(g.updaters) && !_inst.off)
    g.updaters.push(function groundMaskTick(dt) {
      _inst.update(dt, globalThis.game);
    });
  if (g) g.groundMask = _inst;
  return _inst;
}

// ---- consumers ----
const hashGL =
  'float gmH1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n';
// vegetation (instanced): no plant on asphalt / pavement / under a car; ground cover (edge = true) also thins out toward a hard
// edge in patches (some tufts survive right at the edge, most give way 0.5-2 m out)
export function gmVeg(mat, o = {}) {
  if (!mat || OFF || mat.userData.gmVeg) return mat;
  mat.userData.gmVeg = true;
  const prev = mat.onBeforeCompile,
    prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const edge = o.edge ? 1 : 0;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    gmUniforms(sh.uniforms);
    if (!sh.vertexShader.includes('#include <begin_vertex>')) return;
    sh.vertexShader =
      GM_GLSL +
      hashGL +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      #ifdef USE_INSTANCING
      {
        vec2 gmo = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        vec4 gmh = gmHard(gmo);
        float gmk = 1.0 - smoothstep(0.25, 0.55, max(max(gmh.r, gmh.g), max(gmh.b, gmh.a * ${edge ? '0.0' : '1.0'})));
        ${edge ? 'gmk *= 1.0 - smoothstep(0.3, 0.6, gmh.a) * step(gmH1(floor(gmo * 2.7) + 5.0), 0.86); // drives: a few weeds survive' : ''}
        ${o.noPaved ? '{ vec4 gmp = gmNear(gmo); gmk *= 1.0 - smoothstep(0.04, 0.15, gmp.g); } // city verges: no loose rocks / pebbles near pavement' : ''}
        ${
          edge
            ? `vec4 gmn = gmNear(gmo); float gme = max(gmn.r, gmn.g * 0.85), gmr = gmH1(floor(gmo * 3.0));
        gmk *= smoothstep(0.0, 0.3, 1.0 - gme * 1.75 + gmr * 0.55 - 0.08);`
            : ''
        }
        transformed *= gmk;
        ${
          o.noPaved
            ? ''
            : `{ // r2-ground: under and around a car the plant is pressed flat and bends away from the body (soft, car-shaped)
          vec2 gcd; float gcp = gmCarPress(gmo, gcd) * ${edge ? '1.0' : '0.75'};
          if (gcp > 0.001) { mat3 gIM = mat3(modelMatrix * instanceMatrix); vec3 gld = vec3(gcd.x, 0.0, gcd.y) * gIM; vec2 gl2 = length(gld.xz) > 1e-5 ? normalize(gld.xz) : vec2(0.0);
            float gh0 = max(transformed.y, 0.0); transformed.y *= mix(1.0, 0.1, gcp); transformed.xz += gl2 * gh0 * gcp * 0.6; }
        }`
        }
      }
      #endif`,
      );
  };
  mat.customProgramCacheKey = () => prevKey() + '|gm2' + edge + (o.noPaved ? 'p' : '');
  mat.needsUpdate = true;
  return mat;
}
