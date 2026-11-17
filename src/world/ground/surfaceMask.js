// Ground surface mask (overnight ground pass): a top-down raster of every hard ground surface around the camera, so ground
// materials and vegetation know where asphalt, pavement and cars are without CPU queries.
//   R = asphalt (road ribbons, junction outlines, cul-de-sacs, dirt tracks)
//   G = other paved / built ground (sidewalk slabs, plazas, parking, docks, driveways, aprons)
//   B = vehicles (footprint boxes of every car in game.vehicles.list)
// Two cascades: near (160 m, 0.16 m / texel) and far (640 m, 0.63 m / texel). Each has a sharp target and a Gaussian-blurred
// target (sigma ~1.4 m): the blurred value is ~0.5 at a surface edge and falls off over ~3 m, which drives
//   - the terrain shoulder blend (asphalt crumbs -> sand / gravel -> patchy grass, noise-cut, height weighted),
//   - the noise-cut crumbling edge of open (curb-less) asphalt,
//   - vegetation thinning toward an edge and no plants on any hard surface or under a car.
// Meshes join with register(mesh, 'asphalt' | 'paved'); proxies share the geometry (no copies) and leave when the source mesh
// leaves the scene. Shader side: GM_GLSL (gmHard(wp) / gmNear(wp) -> vec4, wp = world xz) + gmUniforms(sh.uniforms).
import * as THREE from 'three';

const OFF = typeof location !== 'undefined' && /[?&]gmask=0\b/.test(location.search); // A/B switch (audits)
const CASC = [{ span: 160, size: 1024, blur: 512, bs: 1.5, every: 0.35, move: 10 }, { span: 640, size: 2048, blur: 1024, bs: 0.75, every: 1.6, move: 48 }];
const U = {
  uGMH0: { value: null }, uGMN0: { value: null }, uGMR0: { value: new THREE.Vector4(0, 0, 1, 0) },
  uGMH1: { value: null }, uGMN1: { value: null }, uGMR1: { value: new THREE.Vector4(0, 0, 1, 0) },
};
export const GM_UNIFORMS = U;
export function gmUniforms(uniforms) { Object.assign(uniforms, U); return uniforms; }

// world xz -> cascade uv (the mask camera looks straight down, image top = -z)
export const GM_GLSL = /* glsl */`
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
// 1 inside the near cascade (fine detail available), 0 outside
float gmFine(vec2 wp) { return uGMR0.w > 0.5 ? gmW(gmUV(uGMR0, wp)) : 0.0; }
#endif
`;

const KIND = { asphalt: new THREE.Color(1, 0, 0), paved: new THREE.Color(0, 1, 0), car: new THREE.Color(0, 0, 1) };
// A = unpaved drives / yard tracks (crushed shell, sand): drawn by the terrain shader, not by a slab
function maxMat(col) {
  return new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false, // alpha 0: the A channel belongs to drives
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
}

export function createSurfaceMask() {
  const proxies = new Map(); let registered = 0, dropped = 0; // source mesh -> proxy
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  const mats = { asphalt: maxMat(KIND.asphalt), paved: maxMat(KIND.paved), car: maxMat(KIND.car) };
  // cars: instanced unit boxes (footprint), rebuilt each near update
  const CAR_N = 256, carGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cars = new THREE.InstancedMesh(carGeo, mats.car, CAR_N);
  cars.frustumCulled = false; cars.count = 0; cars.matrixAutoUpdate = false; scene.add(cars);
  // drives: unit quads in the alpha channel (MeshBasic writes alpha = opacity; color black, max blend keeps the other channels)
  const driveMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  const DRV_N = 4096, drives = new THREE.InstancedMesh(carGeo, driveMat, DRV_N); drives.frustumCulled = false; drives.count = 0; drives.matrixAutoUpdate = false; scene.add(drives);
  const drvList = [];
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000); cam.rotation.set(-Math.PI / 2, 0, 0); cam.matrixAutoUpdate = true;
  let R = null, built = false;
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  // separable Gaussian (13 taps via 7 bilinear fetches), sigma in texels of the blur target
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tSrc, vUv) * 0.1592;
        c += (texture2D(tSrc, vUv + uDir * 1.4706) + texture2D(tSrc, vUv - uDir * 1.4706)) * 0.2659;
        c += (texture2D(tSrc, vUv + uDir * 3.4302) + texture2D(tSrc, vUv - uDir * 3.4302)) * 0.1263;
        c += (texture2D(tSrc, vUv + uDir * 5.4000) + texture2D(tSrc, vUv - uDir * 5.4000)) * 0.0332;
        c += (texture2D(tSrc, vUv + uDir * 7.3800) + texture2D(tSrc, vUv - uDir * 7.3800)) * 0.0050;
        gl_FragColor = c / 1.02;
      }`,
  });
  const rt = (n) => { const t = new THREE.WebGLRenderTarget(n, n, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false }); t.texture.colorSpace = THREE.NoColorSpace; return t; };
  const C = CASC.map((c, i) => ({ ...c, i, hard: rt(c.size), b0: rt(c.blur), b1: rt(c.blur), t: 1e9, cx: 1e9, cz: 1e9 }));
  C.forEach((c) => { U['uGMH' + c.i].value = c.hard.texture; U['uGMN' + c.i].value = c.b1.texture; });
  const stats = { meshes: 0, renders: 0, ms: 0, cars: 0 };

  // an unpaved drive / track: center (x, z), heading ry (three.js rotation.y, local +z along the drive), width w, length len (m)
  function addDrive(x, z, ry, w, len) {
    if (OFF || drvList.length >= DRV_N || !Number.isFinite(x + z + ry + w + len)) return false;
    _q.setFromAxisAngle(_p.set(0, 1, 0), ry); _m.compose(_p.set(x, 0, z), _q, _s.set(w, 1, len));
    drives.setMatrixAt(drvList.length, _m); drvList.push([x, z, ry, w, len]); drives.count = drvList.length; drives.instanceMatrix.needsUpdate = true;
    for (const c of C) c.t = 1e9; return true;
  }
  function register(mesh, kind = 'asphalt') {
    if (OFF || !mesh || !mesh.geometry || proxies.has(mesh) || !mats[kind]) return;
    const p = new THREE.Mesh(mesh.geometry, mats[kind]); p.matrixAutoUpdate = false; p.matrixWorldAutoUpdate = false; p.frustumCulled = false; p.userData.src = mesh; p.userData.t0 = performance.now(); p.visible = false;
    proxies.set(mesh, p); scene.add(p); registered++;
  }
  function sync(root) {
    for (const [src, p] of proxies) {
      let o = src, top = src, vis = true; while (o) { if (o.visible === false) vis = false; top = o; o = o.parent; }
      const on = top === root;
      if (!on) { p.visible = false; if (p.userData.seen || performance.now() - p.userData.t0 > 120000) { scene.remove(p); proxies.delete(src); dropped++; } continue; } // built but not attached yet: wait; detached after showing: gone
      p.userData.seen = true; p.visible = vis;
      p.matrixWorld.copy(src.matrixWorld);
    }
    stats.meshes = proxies.size;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  function syncCars(game) {
    const L = (game.vehicles && game.vehicles.list) || []; let n = 0;
    for (const v of L) { if (n >= CAR_N) break; if (!v || v.boat || v.isBoat) continue;
      const o = v.mesh || v.group || v.root || v.object; const b = v.body && v.body.translation ? v.body.translation() : null;
      const pos = b || (o && o.position); if (!pos || !Number.isFinite(pos.x)) continue;
      let yaw = 0; if (v.body && v.body.rotation) { const r = v.body.rotation(); _q.set(r.x, r.y, r.z, r.w); _e.setFromQuaternion(_q, 'YXZ'); yaw = _e.y; } else if (o && o.quaternion) { _e.setFromQuaternion(o.quaternion, 'YXZ'); yaw = _e.y; }
      const len = v.spec?.length || v.length || v.dims?.length || 4.7, wid = v.spec?.width || v.width || v.dims?.width || 2.0;
      _q.setFromAxisAngle(_p.set(0, 1, 0), yaw); _m.compose(_p.set(pos.x, 0, pos.z), _q, _s.set(wid + 0.5, 1, len + 0.6)); cars.setMatrixAt(n++, _m);
    }
    cars.count = n; cars.instanceMatrix.needsUpdate = true; stats.cars = n;
  }
  function renderCascade(renderer, c, x, z) {
    const tx = c.span / c.size * 8; const cx = Math.round(x / tx) * tx, cz = Math.round(z / tx) * tx, h = c.span / 2; // snapped: no texel swim
    cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h; cam.position.set(cx, 2000, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    cars.visible = c.i === 0;
    renderer.setRenderTarget(c.hard); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false); renderer.render(scene, cam);
    quad.material = blurMat;
    blurMat.uniforms.tSrc.value = c.hard.texture; blurMat.uniforms.uDir.value.set(c.bs / c.blur, 0); renderer.setRenderTarget(c.b0); renderer.render(qScene, quadCam);
    blurMat.uniforms.tSrc.value = c.b0.texture; blurMat.uniforms.uDir.value.set(0, c.bs / c.blur); renderer.setRenderTarget(c.b1); renderer.render(qScene, quadCam);
    U['uGMR' + c.i].value.set(cx - h, cz - h, 1 / c.span, 1);
    c.cx = cx; c.cz = cz; c.t = 0;
  }
  function update(dt, game) {
    if (OFF || !game || !game.renderer || !game.camera || !game.scene) return;
    if (!api.enabled) { U.uGMR0.value.w = 0; U.uGMR1.value.w = 0; for (const c of C) c.t = 1e9; return; } // A/B: everything falls back to no mask
    const renderer = game.renderer, p = game.camera.position;
    for (const c of C) c.t += dt;
    const due = C.filter((c) => c.t > c.every || Math.hypot(p.x - c.cx, p.z - c.cz) > c.move);
    if (!due.length) return;
    const t0 = performance.now();
    sync(game.scene); syncCars(game);
    const prevRT = renderer.getRenderTarget(), prevAC = renderer.autoClear, prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevSh = renderer.shadowMap.autoUpdate, prevNU = renderer.shadowMap.needsUpdate;
    renderer.autoClear = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
    try { for (const c of due) renderCascade(renderer, c, p.x, p.z); }
    finally { renderer.setRenderTarget(prevRT); renderer.autoClear = prevAC; renderer.setClearColor(prevCol, prevA); renderer.shadowMap.autoUpdate = prevSh; renderer.shadowMap.needsUpdate = prevNU; }
    stats.renders++; stats.ms = performance.now() - t0; built = true;
  }
  // CPU readback for audits only (slow): hard mask value at (x, z) from the near cascade
  function debugRead(game, x, z) {
    const c = C[0], R4 = U.uGMR0.value; const u = (x - R4.x) * R4.z, v = 1 - (z - R4.y) * R4.z; if (u < 0 || v < 0 || u > 1 || v > 1) return null;
    const buf = new Uint8Array(4); game.renderer.readRenderTargetPixels(c.hard, Math.floor(u * c.size), Math.floor(v * c.size), 1, 1, buf); return Array.from(buf);
  }
  const debug = () => { let seen = 0, vis = 0, reg = registered; for (const p of proxies.values()) { if (p.userData.seen) seen++; if (p.visible) vis++; } return { proxies: proxies.size, seen, vis, reg, dropped, drives: drvList.length, rect0: U.uGMR0.value.toArray(), rect1: U.uGMR1.value.toArray() }; };
  const api = { enabled: true, register, addDrive, debug, drives: drvList, update, stats, debugRead, get ready() { return built; }, off: OFF, uniforms: U, cascades: C };
  return api;
}

// one shared instance per page (tile builders register into it, the frame loop updates it)
let _inst = null;
export function surfaceMask() {
  if (_inst) return _inst;
  _inst = createSurfaceMask();
  const g = globalThis.game;
  if (g && Array.isArray(g.updaters) && !_inst.off) g.updaters.push(function groundMaskTick(dt) { _inst.update(dt, globalThis.game); });
  if (g) g.groundMask = _inst;
  return _inst;
}

// ---- consumers ----
const hashGL = 'float gmH1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n';
// vegetation (instanced): no plant on asphalt / pavement / under a car; ground cover (edge = true) also thins out toward a hard
// edge in patches (some tufts survive right at the edge, most give way 0.5-2 m out)
export function gmVeg(mat, o = {}) {
  if (!mat || OFF || mat.userData.gmVeg) return mat; mat.userData.gmVeg = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const edge = o.edge ? 1 : 0;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    gmUniforms(sh.uniforms);
    if (!sh.vertexShader.includes('#include <begin_vertex>')) return;
    sh.vertexShader = GM_GLSL + hashGL + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      {
        vec2 gmo = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        vec4 gmh = gmHard(gmo);
        float gmk = 1.0 - smoothstep(0.25, 0.55, max(max(gmh.r, gmh.g), max(gmh.b, gmh.a * ${edge ? '0.0' : '1.0'})));
        ${edge ? 'gmk *= 1.0 - smoothstep(0.3, 0.6, gmh.a) * step(gmH1(floor(gmo * 2.7) + 5.0), 0.86); // drives: a few weeds survive' : ''}
        ${edge ? `vec4 gmn = gmNear(gmo); float gme = max(gmn.r, gmn.g * 0.85), gmr = gmH1(floor(gmo * 3.0));
        gmk *= smoothstep(0.0, 0.3, 1.0 - gme * 1.75 + gmr * 0.55 - 0.08);` : ''}
        transformed *= gmk;
      }
      #endif`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|gm' + edge;
  mat.needsUpdate = true;
  return mat;
}
