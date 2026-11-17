// r2-art material audit (page side). Built on r2-look's albedo debug branch (look3.js: lookV.w = 1 -> lit built-in
// materials output their base color) and tools/v2/look/albedo-audit.page.js (texture means).
//   window.__artCover(tag)  render the current view twice into small targets: (1) a material-ID pass (every visible mesh
//                           drawn with a flat ID color, alpha cut-outs kept) and (2) the albedo view. Per material it
//                           accumulates screen coverage and the on-screen mean base color (what the shader really outputs,
//                           incl. weathering / grade patches), keyed by view tag.
//   window.__artStats()     per material seen in any view: texture-estimated albedo, effective roughness / metalness
//                           (scalar x map mean), normal map strength, texture size, texel density (px/m from the mesh UVs),
//                           source (object chain, glTF or code), coverage per view.
//   window.__artReset()     clear the accumulators.
(() => {
  const T = game.THREE;
  const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d', { willReadFrequently: true });
  const texCache = new Map();
  // texture means: color maps are decoded sRGB -> linear; data maps (roughness / metalness / normal) stay raw
  function texInfo(t) {
    if (!t || !t.image) return null;
    if (texCache.has(t)) return texCache.get(t);
    let info = null;
    try {
      const im = t.image, w = im.width || im.videoWidth || 0, h = im.height || im.videoHeight || 0;
      let px = null, a8 = true;
      if (im.data && w) { px = im.data; a8 = px instanceof Uint8Array || px instanceof Uint8ClampedArray; }
      else if (w) { cx.clearRect(0, 0, 64, 64); cx.drawImage(im, 0, 0, 64, 64); px = cx.getImageData(0, 0, 64, 64).data; }
      if (px) {
        const n = px.length / 4, st = Math.max(1, Math.floor(n / 4096)), sc = a8 ? 255 : 1;
        let r = 0, g = 0, b = 0, k = 0, tilt = 0, rl = 0, gl = 0, bl = 0;
        for (let i = 0; i < n; i += st) {
          if (px[i * 4 + 3] / sc < 0.4 && !(im.data)) continue;
          const R = px[i * 4] / sc, G = px[i * 4 + 1] / sc, B = px[i * 4 + 2] / sc;
          r += R; g += G; b += B; rl += s2l(R); gl += s2l(G); bl += s2l(B); k++;
          tilt += Math.hypot(R * 2 - 1, G * 2 - 1);
        }
        if (k) info = { w, h, raw: [r / k, g / k, b / k], lin: [rl / k, gl / k, bl / k], tilt: tilt / k, name: t.name || '', gltf: !!(t.userData && t.userData.mimeType), srgb: t.colorSpace === T.SRGBColorSpace };
      }
      if (!info) info = { w, h, raw: null, lin: null, tilt: null, name: t.name || '', gltf: !!(t.userData && t.userData.mimeType), srgb: t.colorSpace === T.SRGBColorSpace, compressed: !!t.isCompressedTexture };
    } catch (e) { info = { err: String(e).slice(0, 80) }; }
    texCache.set(t, info); return info;
  }
  const S = window.__ART || (window.__ART = { mats: new Map(), views: [], idOf: new Map(), byId: [] });
  window.__artReset = () => { S.mats.clear(); S.views.length = 0; S.idOf.clear(); S.byId.length = 0; };
  const chain = (o) => { const a = []; let p = o; for (let i = 0; p && i < 8; i++, p = p.parent) { const u = p.userData ? Object.keys(p.userData).filter((k) => /veh|car|npc|ped|player|prop|tile|lib|kit|house|veg|plant|road|ground|water|weapon|pickup|shop|interior|sign/i.test(k)).slice(0, 3) : []; if (p.name || u.length) a.push((p.name || '') + (u.length ? '{' + u.join(',') + '}' : '')); } return a.join(' < '); };
  function rec(m, o) {
    let e = S.mats.get(m);
    if (!e) {
      e = { mat: m, objs: new Map(), cover: {}, scr: {}, id: S.byId.length };
      S.mats.set(m, e); S.byId.push(e);
    }
    if (!e.objs.has(o) && e.objs.size < 6) e.objs.set(o, 1);
    return e;
  }
  const idMats = new Map(); // material -> ID material
  function idMat(m, e) {
    let im = idMats.get(m);
    if (im) return im;
    const id = e.id + 1;
    if (m.isShaderMaterial && !m.isRawShaderMaterial && m.fragmentShader) { // custom shaders keep their vertex stage (displacement, instancing attributes) and discards
      im = m.clone(); im.uniforms = Object.assign({}, m.uniforms, { uArtIdC: { value: new T.Vector3((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255) } });
      const fs = m.fragmentShader, k = fs.lastIndexOf('}');
      im.fragmentShader = 'uniform vec3 uArtIdC;\n' + fs.slice(0, k) + '\n gl_FragColor = vec4(uArtIdC, 1.0);\n}';
      im.transparent = false; im.blending = T.NormalBlending; im.depthWrite = true; im.fog = false; im.toneMapped = false;
      idMats.set(m, im); return im;
    }
    const cut = m.map && (m.alphaTest > 0 || m.alphaToCoverage || m.alphaHash || (m.transparent && m.opacity > 0.05));
    im = new T.MeshBasicMaterial({ fog: false, side: m.side ?? T.FrontSide, toneMapped: false });
    im.color.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, T.LinearSRGBColorSpace);
    if (cut) { im.map = null; im.alphaMap = m.map; im.alphaTest = Math.max(0.3, m.alphaTest || 0.5); im.alphaMap.channel = m.map.channel; }
    // alphaMap reads .g; for RGBA color maps alpha lives in .a: use a tiny onBeforeCompile to read .a instead
    if (cut) { im.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#ifdef USE_ALPHAMAP\n diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).a;\n#endif'); }; im.customProgramCacheKey = () => 'artid-a'; }
    idMats.set(m, im); return im;
  }
  const skip = (o) => !o.isMesh || o.isSprite || o.isLine || o.isPoints || o.userData?.artSkip;
  window.__artCover = async (tag, scale = 0.5) => {
    const r = game.renderer, cam = game.camera, sc = game.scene, LV = game.lookV;
    const w = Math.max(64, Math.floor(r.domElement.width * scale)), h = Math.max(36, Math.floor(r.domElement.height * scale));
        // ---- (2) albedo view first (normal materials) ----
    const rtA = new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType }); rtA.texture.colorSpace = T.NoColorSpace;
    const bg = sc.background, sa = r.shadowMap.autoUpdate, cc0 = r.getClearColor(new T.Color()), ca0 = r.getClearAlpha();
    r.shadowMap.autoUpdate = false;
    const pa = new Uint8Array(w * h * 4);
    for (let t = 0; t < 4; t++) {
      LV[3] = 1;
      try { r.setRenderTarget(rtA); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam); } finally { r.setRenderTarget(null); LV[3] = 0; r.setClearColor(cc0, ca0); }
      r.readRenderTargetPixels(rtA, 0, 0, w, h, pa);
      let any = false; for (let i = 3; i < pa.length; i += 64) if (pa[i]) { any = true; break; }
      if (any) break;
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 60)));
    }
    rtA.dispose();
    // ---- (1) ID pass (materials swapped only for the duration of one synchronous render; the scene's background, fog and
    // clear color are restored before anything else runs, so game frames never see the ID view) ----
    const rt = new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType }); rt.texture.colorSpace = T.NoColorSpace;
    const cc = r.getClearColor(new T.Color()), ca = r.getClearAlpha();
    let calls = 0;
    const idRender = () => {
      const swapped = [];
      sc.traverseVisible((o) => {
        if (skip(o)) { if ((o.isSprite || o.isLine || o.isPoints) && o.visible) { swapped.push([o, null, true]); } return; }
        const mats = [].concat(o.material);
        const ids = mats.map((m) => { if (!m) return null; const e = rec(m, o); return idMat(m, e); });
        swapped.push([o, o.material, false]);
        o.material = Array.isArray(o.material) ? ids : ids[0];
      });
      for (const q of swapped) if (q[2]) q[0].visible = false;
      sc.background = null;
      const c0 = r.info.render.calls;
      try { r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam); calls = r.info.render.calls - c0; }
      finally {
        r.setRenderTarget(null); sc.background = bg; r.setClearColor(cc, ca);
        for (const [o, m, hid] of swapped) { if (hid) o.visible = true; else o.material = m; }
      }
    };
    // twice: the first draw of new ID programs can come back empty (programs still compiling in parallel); the second counts
    // read back; an all-zero read (seen sporadically in the headless test browser although the draws ran) is retried after a frame
    const px = new Uint8Array(w * h * 4); let tries = 0;
    idRender(); await new Promise((res) => setTimeout(res, 150));
    for (; tries < 5; tries++) {
      idRender(); r.readRenderTargetPixels(rt, 0, 0, w, h, px);
      let any = false; for (let i = 0; i < px.length; i += 64) if (px[i] | px[i + 1] | px[i + 2]) { any = true; break; }
      if (any) break;
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 60)));
    }
    r.shadowMap.autoUpdate = sa; rt.dispose();
    const cnt = new Map(), acc = new Map(); let sky = 0;
    for (let i = 0; i < w * h; i++) {
      const id = px[i * 4] | (px[i * 4 + 1] << 8) | (px[i * 4 + 2] << 16);
      if (!id) { sky++; continue; }
      cnt.set(id, (cnt.get(id) || 0) + 1);
      let a = acc.get(id); if (!a) acc.set(id, (a = [0, 0, 0, 0]));
      if (pa[i * 4 + 3] > 0) { a[0] += pa[i * 4] / 255; a[1] += pa[i * 4 + 1] / 255; a[2] += pa[i * 4 + 2] / 255; a[3]++; }
    }
    const N = w * h;
    for (const [id, c] of cnt) {
      const e = S.byId[id - 1]; if (!e) continue;
      e.cover[tag] = (e.cover[tag] || 0) + c / N;
      const a = acc.get(id); if (a && a[3] > 4) e.scr[tag] = [a[0] / a[3], a[1] / a[3], a[2] / a[3], a[3]];
    }
    S.views.push({ tag, sky: sky / N, w, h, cam: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(1)) });
    return { tag, mats: cnt.size, sky: +(sky / N).toFixed(3), calls, tries };
  };
  // texel density of one mesh + material group: total uv area x texture px / total world area (sampled triangles)
  const vA = new T.Vector3(), vB = new T.Vector3(), vC = new T.Vector3(), M4 = new T.Matrix4();
  function texel(o, m, tw, th) {
    const g = o.geometry; if (!g || !tw) return null;
    const ch = m.map ? m.map.channel || 0 : 0, uv = g.attributes[ch ? 'uv' + ch : 'uv'], pos = g.attributes.position; if (!uv || !pos) return null;
    const idx = g.index ? g.index.array : null, triN = (idx ? idx.length : pos.count) / 3; if (!triN) return null;
    M4.copy(o.matrixWorld); if (o.isInstancedMesh && o.count > 0) { const mi = new T.Matrix4(); o.getMatrixAt(0, mi); M4.multiply(mi); }
    const rep = m.map ? m.map.repeat : { x: 1, y: 1 };
    const st = Math.max(1, Math.floor(triN / 400)); let wa = 0, ua = 0;
    let range = [0, triN];
    if (Array.isArray(o.material) && g.groups.length) { const gi = g.groups.find((q) => o.material[q.materialIndex] === m); if (gi) range = [gi.start / 3, (gi.start + gi.count) / 3]; }
    for (let t = range[0]; t < range[1]; t += st) {
      const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      if (i2 === undefined || i2 >= pos.count) break;
      vA.fromBufferAttribute(pos, i0).applyMatrix4(M4); vB.fromBufferAttribute(pos, i1).applyMatrix4(M4); vC.fromBufferAttribute(pos, i2).applyMatrix4(M4);
      const area = vB.sub(vA).cross(vC.sub(vA)).length() / 2;
      const u0 = uv.getX(i0) * rep.x, w0 = uv.getY(i0) * rep.y, u1 = uv.getX(i1) * rep.x, w1 = uv.getY(i1) * rep.y, u2 = uv.getX(i2) * rep.x, w2 = uv.getY(i2) * rep.y;
      const uarea = Math.abs((u1 - u0) * (w2 - w0) - (u2 - u0) * (w1 - w0)) / 2;
      if (area > 1e-6 && uarea > 1e-12) { wa += area; ua += uarea; }
    }
    return wa > 1e-4 ? Math.sqrt((ua * tw * th) / wa) : null;
  }
  window.__artStats = () => {
    const out = [];
    for (const e of S.mats.values()) {
      if (!Object.keys(e.cover).length) continue;
      const m = e.mat, mi = texInfo(m.map), ri = texInfo(m.roughnessMap), me = texInfo(m.metalnessMap), ni = texInfo(m.normalMap);
      const objs = [...e.objs.keys()];
      const o0 = objs[0];
      let vc = null; if (m.vertexColors && o0?.geometry?.attributes?.color) { const ca = o0.geometry.attributes.color; let r = 0, g = 0, b = 0, k = 0; const st = Math.max(1, Math.floor(ca.count / 3000)); for (let i = 0; i < ca.count; i += st) { r += ca.getX(i); g += ca.getY(i); b += ca.getZ(i); k++; } if (k) vc = [r / k, g / k, b / k]; }
      let ic = null; if (o0?.isInstancedMesh && o0.instanceColor) { const a = o0.instanceColor.array, n = Math.min(a.length, (o0.count || 1) * 3); let r = 0, g = 0, b = 0, k = 0; for (let i = 0; i < n; i += 3 * Math.max(1, Math.floor(n / 3000))) { r += a[i]; g += a[i + 1]; b += a[i + 2]; k++; } if (k) ic = [r / k, g / k, b / k]; }
      const col = m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1];
      const tm = mi && mi.lin ? (mi.srgb ? mi.lin : mi.raw) : [1, 1, 1];
      const est = [0, 1, 2].map((i) => col[i] * tm[i] * (vc ? vc[i] : 1) * (ic ? ic[i] : 1));
      // on-screen albedo (coverage-weighted over views), when the albedo branch produced it
      let scr = null, sw = 0; for (const [tag, v] of Object.entries(e.scr)) { const c = e.cover[tag] || 0; if (!scr) scr = [0, 0, 0]; for (let i = 0; i < 3; i++) scr[i] += v[i] * c; sw += c; }
      if (scr && sw) scr = scr.map((v) => v / sw);
      const lit = m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial;
      const rough = m.roughness !== undefined ? m.roughness * (ri && ri.raw ? ri.raw[1] : 1) : null;
      const metal = m.metalness !== undefined ? m.metalness * (me && me.raw ? me.raw[2] : 1) : null;
      let tx = null; if (mi && mi.w) { const ds = objs.slice(0, 4).map((o) => texel(o, m, mi.w, mi.h)).filter((v) => v); if (ds.length) tx = ds.sort((a, b) => a - b)[ds.length >> 1]; }
      out.push({
        name: m.name || '', type: m.type.replace('Material', ''), obj: chain(o0), objNames: objs.map((o) => o.name || o.parent?.name || '').slice(0, 4),
        gltf: !!((mi && mi.gltf) || (ni && ni.gltf) || m.userData?.gltfExtensions || /\.glb|gltf/i.test(chain(o0))), custom: !!(m.onBeforeCompile && m.onBeforeCompile.toString().length > 30) || m.isShaderMaterial,
        color: col.map((v) => +v.toFixed(3)), vc: vc && vc.map((v) => +v.toFixed(3)), ic: ic && ic.map((v) => +v.toFixed(3)),
        mapName: mi?.name || '', mapRes: mi ? [mi.w, mi.h] : null, compressed: !!mi?.compressed,
        est: est.map((v) => +v.toFixed(3)), scr: scr && scr.map((v) => +v.toFixed(3)), lit,
        rough: rough === null ? null : +rough.toFixed(3), roughMap: !!m.roughnessMap, metal: metal === null ? null : +metal.toFixed(3), metalMap: !!m.metalnessMap,
        normal: m.normalMap ? { scale: +(m.normalScale?.x ?? 1).toFixed(2), tilt: ni && ni.tilt != null ? +ni.tilt.toFixed(3) : null, res: ni ? [ni.w, ni.h] : null } : null,
        bump: m.bumpMap ? +(m.bumpScale ?? 1).toFixed(3) : null,
        shaderPBR: !!(m.onBeforeCompile && /roughnessFactor\s*=|metalnessFactor\s*=/.test(m.onBeforeCompile.toString())),
        calCls: m.userData?.artCal?.cls || null,
        noColor: m.colorWrite === false || (m.opacity === 0 && m.transparent), ud: Object.keys(m.userData || {}).slice(0, 8).join(' '), src: m.userData?.src || '',
        env: m.envMapIntensity ?? null, cc: m.clearcoat ?? null, ccR: m.clearcoatRoughness ?? null, emissive: m.emissive ? +(Math.max(m.emissive.r, m.emissive.g, m.emissive.b) * (m.emissiveIntensity ?? 1)).toFixed(3) : 0, emMap: !!m.emissiveMap,
        transparent: !!m.transparent, alphaTest: m.alphaTest || 0, side: m.side, opacity: m.opacity,
        texel: tx && +tx.toFixed(1), cover: Object.fromEntries(Object.entries(e.cover).map(([k, v]) => [k, +v.toFixed(5)])),
      });
    }
    return out;
  };
  return 1;
})();
