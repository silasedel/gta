// r2-look albedo audit (page side): every lit material on meshes within R m of the player -> estimated linear albedo
// (color x mean of the map, sRGB decoded), roughness, metalness, mesh count. window.__albedoAudit(R) -> array.
window.__albedoAudit = (R = 90) => {
  const THREE = game.THREE,
    P = game.player.position,
    out = new Map();
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const texMean = new Map();
  const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  function meanOf(t) {
    if (!t || !t.image) return null;
    if (texMean.has(t)) return texMean.get(t);
    let m = null;
    try {
      const im = t.image;
      if (im.data && im.width) {
        // DataTexture
        const d = im.data,
          n = d.length / 4;
        let r = 0,
          g = 0,
          b = 0,
          k = 0;
        const st = Math.max(1, Math.floor(n / 4096));
        const sc = d instanceof Uint8Array || d instanceof Uint8ClampedArray ? 255 : 1;
        for (let i = 0; i < n; i += st) {
          r += d[i * 4] / sc;
          g += d[i * 4 + 1] / sc;
          b += d[i * 4 + 2] / sc;
          k++;
        }
        m = [r / k, g / k, b / k];
        if (t.colorSpace === THREE.SRGBColorSpace) m = m.map(s2l);
      } else if (im.width) {
        cx.clearRect(0, 0, 32, 32);
        cx.drawImage(im, 0, 0, 32, 32);
        const d = cx.getImageData(0, 0, 32, 32).data;
        let r = 0,
          g = 0,
          b = 0,
          w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3] / 255;
          if (a < 0.4) continue;
          r += s2l(d[i] / 255);
          g += s2l(d[i + 1] / 255);
          b += s2l(d[i + 2] / 255);
          w++;
        }
        m = w ? [r / w, g / w, b / w] : null;
        if (m && t.colorSpace !== THREE.SRGBColorSpace) m = null; // non-color map
      }
    } catch (e) {
      m = null;
    }
    texMean.set(t, m);
    return m;
  }
  const wp = new THREE.Vector3();
  game.scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    o.getWorldPosition(wp);
    if (!o.isInstancedMesh && Math.hypot(wp.x - P.x, wp.z - P.z) > R) return;
    if (o.isInstancedMesh) {
      const sp = o.geometry.boundingSphere || (o.computeBoundingSphere?.(), o.boundingSphere);
    }
    for (const m of [].concat(o.material)) {
      if (!m || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial))
        continue;
      let e = out.get(m);
      if (!e) {
        const mm = meanOf(m.map);
        let vc = [1, 1, 1];
        if (m.vertexColors && o.geometry?.attributes?.color) {
          const ca = o.geometry.attributes.color;
          let r = 0,
            g = 0,
            b = 0,
            k = 0;
          const st = Math.max(1, Math.floor(ca.count / 3000));
          for (let i = 0; i < ca.count; i += st) {
            r += ca.getX(i);
            g += ca.getY(i);
            b += ca.getZ(i);
            k++;
          }
          if (k) vc = [r / k, g / k, b / k];
        }
        let ic = [1, 1, 1];
        if (o.isInstancedMesh && o.instanceColor) {
          const a = o.instanceColor.array;
          let r = 0,
            g = 0,
            b = 0,
            k = 0;
          for (let i = 0; i < a.length; i += 3 * Math.max(1, Math.floor(a.length / 3000))) {
            r += a[i];
            g += a[i + 1];
            b += a[i + 2];
            k++;
          }
          if (k) ic = [r / k, g / k, b / k];
        }
        const c = m.color;
        const t = mm || [1, 1, 1];
        const al = [0, 1, 2].map((i) => [c.r, c.g, c.b][i] * t[i] * vc[i] * ic[i]);
        e = {
          name: m.name || '',
          obj: o.name || o.parent?.name || '',
          type: m.type.replace('Material', ''),
          albedo: al.map((x) => +x.toFixed(3)),
          lum: +(0.2126 * al[0] + 0.7152 * al[1] + 0.0722 * al[2]).toFixed(3),
          rough: m.roughness ?? null,
          roughMap: !!m.roughnessMap,
          metal: m.metalness ?? null,
          map: !!m.map,
          mapMean: mm && mm.map((x) => +x.toFixed(3)),
          vc: !!m.vertexColors,
          alpha: {
            test: m.alphaTest,
            a2c: !!m.alphaToCoverage,
            transp: !!m.transparent,
            hash: !!m.alphaHash,
          },
          env: m.envMapIntensity,
          n: 0,
        };
        out.set(m, e);
      }
      e.n++;
    }
  });
  return [...out.values()].sort((a, b) => b.n - a.n);
};
