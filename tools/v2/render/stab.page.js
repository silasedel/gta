// r2-render: image-stability probes, installed in the page with eval (idempotent).
//   window.__rInv(radius)          -> material inventory: stochastic / alpha techniques, by material, with counts and nearest distance
//   window.__rFreeze(on)           -> freeze the vegetation wind clock (frame-to-frame diffs then measure only render noise)
//   window.__rStab(n, crop, scale) -> grab n consecutive frames (crop [x, y, w, h] CSS px): returns
//        { mad: mean |dI| per frame pair (0..255 luma), hot: % of pixels with |dI| > 6, first: jpeg, diff: amplified diff jpeg, zoom: 2x crop jpeg }
//   window.__rCoplanar(radius)     -> coplanar overlapping mesh pairs near the camera (z-fight candidates)
//   window.__rAniso()              -> textures on large meshes with low anisotropy / no mipmaps
(() => {
  if (window.__rInv) return 'already';
  const r = game.renderer,
    gl = r.getContext(),
    scene = game.scene,
    cam = game.camera;
  const srcCache = new WeakMap();
  function fragSrc(mat) {
    try {
      const p = r.properties.get(mat)?.currentProgram;
      if (!p) return '';
      if (srcCache.has(p)) return srcCache.get(p);
      const sh = gl.getAttachedShaders(p.program) || [];
      let s = '';
      for (const x of sh)
        if (gl.getShaderParameter(x, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER)
          s = gl.getShaderSource(x) || '';
      srcCache.set(p, s);
      return s;
    } catch (e) {
      return '';
    }
  }
  function techniques(m, s) {
    const t = [];
    if (m.alphaHash) t.push('alphaHash');
    // known screen-space dithers (the shadow filter's psIgn is in every lit shader and is listed separately)
    if (/vegDither\(\)\s*;|float dn = vegDither/.test(s)) t.push('veg-LOD-dither');
    if (/psIgnT\( ?gl_FragCoord/.test(s) && !/vegDither/.test(s)) t.push('fade-dither');
    if (/ignT\( gl_FragCoord/.test(s)) t.push('hair-dither');
    if (/0\.0671, 0\.5831/.test(s)) t.push('room-fade-dither');
    if (/npcBayer\(/.test(s.replace(/float npcBayer[^}]*}/, ''))) t.push('bayer');
    if (m.alphaToCoverage) t.push('A2C');
    if (m.alphaTest > 0) t.push('alphaTest' + m.alphaTest);
    if (m.transparent) t.push('blend' + (m.depthWrite ? '+zw' : ''));

    if (m.polygonOffset) t.push('polyOff' + m.polygonOffsetFactor + '/' + m.polygonOffsetUnits);
    return t;
  }
  window.__rInv = (radius = 400) => {
    const out = {};
    const cp = cam.position,
      wp = new game.THREE.Vector3();
    scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.getWorldPosition(wp);
      const d = wp.distanceTo(cp);
      if (d > radius && !o.isInstancedMesh) return;
      for (const m of mats) {
        if (!m) continue;
        const s = fragSrc(m);
        const t = techniques(m, s);
        if (!t.some((x) => /alphaHash|dither|bayer|A2C|alphaTest|blend/.test(x))) continue;
        let path = [];
        for (let x = o; x && x !== scene && path.length < 4; x = x.parent)
          if (x.name) path.push(x.name);
        const key = (m.name || m.type) + ' | ' + t.join(',');
        const e =
          out[key] ||
          (out[key] = {
            mat: m.name || m.type,
            tech: t,
            n: 0,
            inst: 0,
            minD: 1e9,
            where: path.reverse().join('/').slice(0, 80),
            side: m.side,
            skinned: false,
          });
        e.n++;
        if (o.isInstancedMesh) e.inst += o.count;
        e.minD = Math.min(e.minD, Math.round(d));
        if (o.isSkinnedMesh) e.skinned = true;
      }
    });
    return Object.values(out).sort((a, b) => a.minD - b.minD);
  };
  // vegetation wind clock (shared uniform objects: found through any compiled vegetation program)
  let frozen = null;
  window.__rFreeze = (on) => {
    let u = null;
    scene.traverse((o) => {
      if (u || !o.material || Array.isArray(o.material)) return;
      const pu = r.properties.get(o.material)?.uniforms;
      if (pu?.uVegTime) u = pu.uVegTime;
    });
    if (!u) return 'no veg';
    if (on && !frozen) {
      const v = u.value;
      frozen = u;
      Object.defineProperty(u, 'value', { configurable: true, get: () => v, set: () => {} });
    }
    if (!on && frozen) {
      const v = frozen.value;
      delete frozen.value;
      frozen.value = v;
      frozen = null;
    }
    return 'ok';
  };
  window.__rStab = (n = 8, crop, scale = 1) =>
    new Promise((res) => {
      const cvs = r.domElement,
        k = cvs.width / cvs.clientWidth;
      const [x, y, w, h] = crop || [0, 0, cvs.clientWidth, cvs.clientHeight];
      const W = Math.round(w * k * scale),
        H = Math.round(h * k * scale);
      const c2 = document.createElement('canvas');
      c2.width = W;
      c2.height = H;
      const cx = c2.getContext('2d', { willReadFrequently: true });
      const frames = [];
      let first = null;
      const post = game.post,
        orig = post.render;
      post.render = function (dt) {
        orig.call(this, dt);
        cx.drawImage(cvs, x * k, y * k, w * k, h * k, 0, 0, W, H);
        const d = cx.getImageData(0, 0, W, H).data,
          L = new Float32Array(W * H);
        for (let i = 0, j = 0; i < d.length; i += 4, j++)
          L[j] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        frames.push(L);
        if (!first) first = c2.toDataURL('image/jpeg', 0.92);
        if (frames.length >= n) {
          post.render = orig;
          const mads = [],
            hots = [];
          const acc = new Float32Array(W * H);
          for (let f = 1; f < frames.length; f++) {
            let s = 0,
              hcount = 0;
            const A = frames[f],
              B = frames[f - 1];
            for (let i = 0; i < A.length; i++) {
              const dd = Math.abs(A[i] - B[i]);
              s += dd;
              if (dd > 6) hcount++;
              acc[i] += dd;
            }
            mads.push(s / A.length);
            hots.push((100 * hcount) / A.length);
          }
          // amplified mean diff image (x8): bright = unstable
          const id = cx.createImageData(W, H);
          for (let i = 0; i < acc.length; i++) {
            const v = Math.min(255, (acc[i] / (frames.length - 1)) * 8);
            id.data[i * 4] = v;
            id.data[i * 4 + 1] = v;
            id.data[i * 4 + 2] = v;
            id.data[i * 4 + 3] = 255;
          }
          cx.putImageData(id, 0, 0);
          const diff = c2.toDataURL('image/jpeg', 0.9);
          const avg = (a) => +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(3);
          // spatial detail of the first frame (mean |dI/dx| + |dI/dy|): a blurrier image also changes less per frame, so
          // the temporal noise is reported relative to it too (tsr = temporal / spatial)
          let sp = 0;
          const F = frames[0];
          for (let y = 0; y < H - 1; y++)
            for (let x = 0; x < W - 1; x++) {
              const i = y * W + x;
              sp += Math.abs(F[i + 1] - F[i]) + Math.abs(F[i + W] - F[i]);
            }
          sp /= (W - 1) * (H - 1);
          const mad = avg(mads);
          res({
            mad,
            hot: avg(hots),
            spatial: +sp.toFixed(3),
            tsr: +(mad / Math.max(sp, 1e-3)).toFixed(4),
            first,
            diff,
            W,
            H,
          });
        }
      };
    });
  // resolve after n rendered frames (TAA convergence is counted in frames, not seconds: headless runs at a few fps)
  window.__rFrames = (n = 60) =>
    new Promise((res) => {
      let k = 0;
      const post = game.post,
        orig = post.render;
      post.render = function (dt) {
        orig.call(this, dt);
        if (++k >= n) {
          post.render = orig;
          res(k);
        }
      };
    });
  // 2x nearest-neighbor zoom of a crop of the current frame
  window.__rZoom = (crop, z = 2) =>
    new Promise((res) => {
      const cvs = r.domElement,
        k = cvs.width / cvs.clientWidth;
      const [x, y, w, h] = crop;
      const c2 = document.createElement('canvas');
      c2.width = Math.round(w * k * z);
      c2.height = Math.round(h * k * z);
      const cx = c2.getContext('2d');
      cx.imageSmoothingEnabled = false;
      const post = game.post,
        orig = post.render;
      post.render = function (dt) {
        orig.call(this, dt);
        post.render = orig;
        cx.drawImage(cvs, x * k, y * k, w * k, h * k, 0, 0, c2.width, c2.height);
        res(c2.toDataURL('image/png'));
      };
    });
  // coplanar overlap probe: meshes within radius whose world bounding boxes overlap and that share a plane
  // (same axis-aligned extent collapsed to < 2 mm on one axis at the same height)
  window.__rCoplanar = (radius = 40) => {
    const T = game.THREE,
      cp = cam.position,
      list = [];
    scene.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || (m.transparent && !m.depthWrite)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (b.distanceToPoint(cp) > radius) return;
      const s = b.getSize(new T.Vector3());
      const ax = s.x < 0.004 ? 0 : s.y < 0.004 ? 1 : s.z < 0.004 ? 2 : -1;
      if (ax < 0) return;
      list.push({
        o,
        b,
        ax,
        c: [b.min.x, b.min.y, b.min.z][ax],
        po: m.polygonOffset ? m.polygonOffsetFactor + '/' + m.polygonOffsetUnits : '',
      });
    });
    const hits = [];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i],
          B = list[j];
        if (A.ax !== B.ax || Math.abs(A.c - B.c) > 0.003) continue;
        if (!A.b.intersectsBox(B.b)) continue;
        const nm = (o) => {
          const p = [];
          for (let x = o; x && x !== scene && p.length < 3; x = x.parent)
            if (x.name) p.push(x.name);
          return p.join('<') || o.type;
        };
        hits.push({
          a: nm(A.o),
          b: nm(B.o),
          axis: 'xyz'[A.ax],
          gap: +(Math.abs(A.c - B.c) * 1000).toFixed(1),
          po: [A.po, B.po],
          at: A.b
            .getCenter(new T.Vector3())
            .toArray()
            .map((v) => +v.toFixed(1)),
        });
        if (hits.length > 60) return hits;
      }
    return hits;
  };
  // in-session anisotropy A/B: every trilinear texture in view gets anisotropy n (re-uploaded once)
  window.__rAnisoSet = (n) => {
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (!ext) return -1;
    const seen = new Set();
    let c = 0;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats)
        for (const k of [
          'map',
          'normalMap',
          'roughnessMap',
          'aoMap',
          'metalnessMap',
          'emissiveMap',
        ]) {
          const t = m && m[k];
          if (!t || !t.isTexture || seen.has(t) || t.isRenderTargetTexture) continue;
          seen.add(t);
          if (t.minFilter !== 1008 && t.minFilter !== 1005) continue; // LinearMipmapLinear / NearestMipmapLinear only
          const wt = r.properties.get(t).__webglTexture;
          if (!wt || t.isCubeTexture || t.isData3DTexture || t.isDataArrayTexture) continue;
          gl.bindTexture(gl.TEXTURE_2D, wt);
          gl.texParameterf(
            gl.TEXTURE_2D,
            ext.TEXTURE_MAX_ANISOTROPY_EXT,
            Math.min(
              n > 0 ? Math.max(n, t.anisotropy) : Math.max(1, t.anisotropy),
              r.capabilities.getMaxAnisotropy(),
            ),
          );
          c++;
        }
    });
    gl.bindTexture(gl.TEXTURE_2D, null);
    r.resetState();
    return c;
  };
  // what material is under a screen point (fractions 0..1 of the canvas)
  window.__rPick = (fx, fy) => {
    const T = game.THREE,
      rc = new T.Raycaster();
    rc.setFromCamera(new T.Vector2(fx * 2 - 1, 1 - fy * 2), cam);
    const hit = rc
      .intersectObjects(scene.children, true)
      .find((h) => h.object.visible && h.object.material);
    if (!hit) return null;
    const o = hit.object,
      m = Array.isArray(o.material) ? o.material[hit.face?.materialIndex ?? 0] : o.material;
    const tx = (t) =>
      t
        ? {
            size: t.image ? [t.image.width, t.image.height] : null,
            aniso: t.anisotropy,
            rep: t.repeat?.toArray?.(),
          }
        : null;
    return {
      obj: o.name,
      parent: o.parent?.name,
      mat: m.name,
      type: m.type,
      rough: m.roughness,
      metal: m.metalness,
      map: tx(m.map),
      normal: tx(m.normalMap),
      ns: m.normalScale?.toArray?.(),
      bump: tx(m.bumpMap),
      bs: m.bumpScale,
      alphaTest: m.alphaTest,
      a2c: m.alphaToCoverage,
      transparent: m.transparent,
      dist: +hit.distance.toFixed(2),
    };
  };
  window.__rAniso = () => {
    const max = r.capabilities.getMaxAnisotropy(),
      out = {};
    const seen = new Set();
    scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats)
        for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) {
          const t = m && m[k];
          if (!t || !t.isTexture || seen.has(t)) continue;
          seen.add(t);
          const key = `aniso${t.anisotropy}${t.generateMipmaps === false && !t.mipmaps?.length ? ' NOMIP' : ''}${t.minFilter === 1006 ? ' minLinear' : t.minFilter === 1003 ? ' minNearest' : ''}`;
          (out[key] ||= { n: 0, ex: [] }).n++;
          if (out[key].ex.length < 6) out[key].ex.push((m.name || m.type) + '.' + k);
        }
    });
    return { max, out };
  };
  return 'ok';
})();
