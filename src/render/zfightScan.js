// Z-FIGHT DETECTOR (render track, Nov 18). In game: await game.zfight({ scale: 0.5 }) (src/render/zfight.v2.js loads this
// module on first use; no cost before). CLI: node tools/v2/render/zfight.mjs (views around the spawn / Nico's house).
//   -> { flagged, self, pct, pairs: [{ px, a, b, at, scr }], overlay: png dataURL (flagged pixels magenta) }
// How: the real scene (real materials, so LOD hide masks and dithers count) is rendered into a float target with a
// 24-bit depth buffer, then the SAME frame again with (1) other near planes (x / y rasterization and shading are
// identical, only depth quantization changes) and (2) LESS instead of LEQUAL for every material (exact ties resolve the
// other way). A pixel whose color changes is a depth tie or near-tie between two surfaces: z-fighting. Silhouette edges
// never change (no jitter), so there are no edge false positives. To name the surfaces, the same variants are rendered
// once more with a flat ID color per mesh + material group; at each flagged pixel the two IDs give the pair.
import * as THREE from 'three';

export function makeZFightScanner(game) {
  const T = THREE, R = game.renderer, scene = game.scene;
  const VS = `
    #include <common>
    #include <batching_pars_vertex>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    varying vec2 vUv;
    void main() {
      vUv = uv;
      #include <batching_vertex>
      #include <begin_vertex>
      #include <morphinstance_vertex>
      #include <morphtarget_vertex>
      #include <skinbase_vertex>
      #include <skinning_vertex>
      #include <project_vertex>
    }`;
  const FS = `
    uniform vec3 uId; uniform sampler2D uMap; uniform float uAT;
    varying vec2 vUv;
    void main() { if (uAT > 0.0 && texture2D(uMap, vUv).a < uAT) discard; gl_FragColor = vec4(uId, 1.0); }`;
  const mat = new T.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uId: { value: new T.Vector3() }, uMap: { value: null }, uAT: { value: 0 } } });
  mat.toneMapped = false;
  const idOf = new Map(), byId = new Map();
  let nextId = 1;
  function idFor(o, gi) {
    const k = o.id * 64 + (gi | 0);
    let id = idOf.get(k);
    if (!id) { id = nextId++; idOf.set(k, id); byId.set(id, { o, gi }); }
    return id;
  }
  const hooks = [];
  function install() {
    scene.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh)) return;
      const prev = o.onBeforeRender;
      o.onBeforeRender = function (r, s, c, g, m, group) {
        const om = Array.isArray(o.material) ? o.material[group?.materialIndex ?? 0] : o.material;
        const id = idFor(o, group?.materialIndex);
        mat.uniforms.uId.value.set((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255);
        const at = om && (om.alphaTest > 0 || (om.transparent && om.map && !om.depthWrite)) && om.map ? Math.max(om.alphaTest, 0.3) : 0;
        mat.uniforms.uMap.value = at ? om.map : null; mat.uniforms.uAT.value = at;
        mat.uniformsNeedUpdate = true;
        if (om) {
          mat.side = om.side; mat.polygonOffset = om.polygonOffset; mat.polygonOffsetFactor = om.polygonOffsetFactor; mat.polygonOffsetUnits = om.polygonOffsetUnits;
          mat.depthWrite = om.depthWrite; mat.depthTest = om.depthTest; mat.colorWrite = om.colorWrite !== false && om.visible !== false;
        }
      };
      hooks.push([o, prev]);
    });
  }
  function uninstall() { for (const [o, p] of hooks) o.onBeforeRender = p; hooks.length = 0; }
  let rt = null, rtF = null;
  function renderReal(cam, w, h, less) {
    if (!rtF || rtF.width !== w || rtF.height !== h) { rtF?.dispose(); rtF = new T.WebGLRenderTarget(w, h, { type: T.FloatType, depthBuffer: true, samples: 0 }); }
    const saved = [];
    if (less) scene.traverse((o) => { if (!o.material) return; for (const m of [].concat(o.material)) if (m.depthFunc === T.LessEqualDepth) { m.depthFunc = T.LessDepth; saved.push(m); } });
    const sh = R.shadowMap.autoUpdate, prevRT = R.getRenderTarget();
    R.shadowMap.autoUpdate = false; R.setRenderTarget(rtF); R.clear(true, true, true);
    try { R.render(scene, cam); } finally { R.shadowMap.autoUpdate = sh; R.setRenderTarget(prevRT); for (const m of saved) m.depthFunc = T.LessEqualDepth; }
    const buf = new Float32Array(w * h * 4);
    R.readRenderTargetPixels(rtF, 0, 0, w, h, buf);
    return buf;
  }
  function renderIds(cam, w, h, depthFunc) {
    if (!rt || rt.width !== w || rt.height !== h) { rt?.dispose(); rt = new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType, depthBuffer: true, samples: 0 }); }
    mat.depthFunc = depthFunc;
    const ov = scene.overrideMaterial, bg = scene.background, fog = scene.fog, tm = R.toneMapping, sh = R.shadowMap.autoUpdate;
    scene.overrideMaterial = mat; scene.background = null; scene.fog = null; R.shadowMap.autoUpdate = false;
    const prevRT = R.getRenderTarget(), cc = R.getClearColor(new T.Color()), ca = R.getClearAlpha();
    R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(true, true, true);
    try { R.render(scene, cam); } finally {
      scene.overrideMaterial = ov; scene.background = bg; scene.fog = fog; R.shadowMap.autoUpdate = sh; R.toneMapping = tm;
      R.setClearColor(cc, ca); R.setRenderTarget(prevRT);
    }
    const buf = new Uint8Array(w * h * 4);
    R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    return buf;
  }
  const name = (o) => { const p = []; for (let x = o; x && x !== scene && p.length < 4; x = x.parent) if (x.name) p.push(x.name); return p.join('<') || o.type; };
  const mname = (o, gi) => { const m = Array.isArray(o.material) ? o.material[gi | 0] : o.material; return m ? (m.name || m.type) + (m.polygonOffset ? ` po${m.polygonOffsetFactor}/${m.polygonOffsetUnits}` : '') : '?'; };
  return function scan(opts = {}) {
    const scale = opts.scale ?? 0.5;
    const cam0 = game.camera;
    const w = Math.max(64, Math.round(innerWidth * scale)), h = Math.max(64, Math.round(innerHeight * scale));
    const cam = cam0.clone(); cam.aspect = w / h; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    install();
    const cams = [cam];
    for (const k of opts.nears || [0.8, 0.6, 0.45, 1.15]) { const c = cam.clone(); c.near = cam0.near * k; c.updateProjectionMatrix(); c.updateMatrixWorld(true); cams.push(c); }
    const realBase = renderReal(cam, w, h, false), real = [renderReal(cam, w, h, true), ...cams.slice(1).map((c) => renderReal(c, w, h, false))];
    let base, alts = [];
    install();
    try {
      base = renderIds(cam, w, h, T.LessEqualDepth);
      alts.push(renderIds(cam, w, h, T.LessDepth));
      for (const c of cams.slice(1)) alts.push(renderIds(c, w, h, T.LessEqualDepth));
    } finally { uninstall(); }
    const dec = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
    const pairs = new Map(); const flag = new Uint8Array(w * h); let flagged = 0, self = 0;
    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      let hit = -1;
      for (let v = 0; v < real.length && hit < 0; v++) { const X = real[v]; for (let c = 0; c < 3; c++) { const d = Math.abs(X[i + c] - realBase[i + c]); if (d > 0.01 + 0.03 * Math.abs(realBase[i + c])) { hit = v; break; } } }
      if (hit < 0) continue;
      const a = dec(base, i); let b = a;
      for (const alt of [alts[hit], ...alts]) { const x = dec(alt, i); if (x !== a && x) { b = x; break; } }
      if (a === b || !a) { self++; continue; } // shading changed but no other surface won: depth-dependent shader effects (sky, LOD dither), not counted
      flag[p] = 1; flagged++;
      const k = a < b ? a + ':' + b : b + ':' + a;
      const e = pairs.get(k) || { n: 0, x: 0, y: 0 }; e.n++; e.x += p % w; e.y += (p / w) | 0; pairs.set(k, e);
    }
    const minPx = opts.minPx ?? 6;
    const out = [...pairs.entries()].filter(([, e]) => e.n >= minPx).sort((p, q) => q[1].n - p[1].n).slice(0, opts.top || 30).map(([k, e]) => {
      const [a, b] = k.split(':').map(Number), A = byId.get(a), B = byId.get(b);
      const wp = (A?.o && new T.Box3().setFromObject(A.o).getCenter(new T.Vector3())) || null;
      return { px: e.n, scr: [Math.round(e.x / e.n / w * 1000) / 1000, Math.round((1 - e.y / e.n / h) * 1000) / 1000],
        a: A ? name(A.o) + ' [' + mname(A.o, A.gi) + ']' : '?', b: a === b ? '(same mesh)' : B ? name(B.o) + ' [' + mname(B.o, B.gi) + ']' : '?', aId: A?.o.id, bId: B?.o.id,
        at: wp ? wp.toArray().map((v) => Math.round(v * 10) / 10) : null };
    });
    // overlay: flagged pixels in magenta over a dimmed id image (ids hashed to colors) for a quick look
    let overlay = null;
    if (opts.overlay !== false) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); const im = cx.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (h - 1 - y) * w + x, i = p * 4, o = (y * w + x) * 4, id = dec(base, i);
        if (flag[p]) { im.data[o] = 255; im.data[o + 1] = 0; im.data[o + 2] = 255; }
        else { const hsh = (id * 2654435761) >>> 0; im.data[o] = 40 + ((hsh >> 16) & 127); im.data[o + 1] = 40 + ((hsh >> 8) & 127); im.data[o + 2] = 40 + (hsh & 127); }
        im.data[o + 3] = 255;
      }
      cx.putImageData(im, 0, 0); overlay = cv.toDataURL('image/png');
    }
    return { size: [w, h], near: cam0.near, far: cam0.far, flagged, self, pct: +(100 * flagged / (w * h)).toFixed(3), pairs: out, overlay };
  };
}
