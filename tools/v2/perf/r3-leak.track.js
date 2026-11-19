// r3-leak tracker (page side): every BufferGeometry / Texture made after this runs is remembered (WeakRef + the creating
// call site). census() lists the ones three.js still holds on the GPU (its dispose listener is attached) that no object in
// the scene uses any more: orphans that only a dispose() would free, grouped by call site.
(() => {
  if (window.__trk) return 'already';
  const T = game.THREE,
    list = [];
  const site = () => {
    const s = (new Error().stack || '')
      .split('\n')
      .slice(2)
      .map((l) => l.trim())
      .filter((l) => !/three\.module|node_modules|r3-leak|<anonymous>/.test(l));
    return s
      .slice(0, 3)
      .map((l) =>
        l
          .replace(/^at /, '')
          .replace(/\(?https?:\/\/[^/]+\/(src\/)?/, '')
          .replace(/\?[^:]*:/, ':')
          .replace(/\)$/, ''),
      )
      .join(' < ');
  };
  const seen = new WeakSet();
  const note = (o, kind) => {
    if (seen.has(o)) return;
    seen.add(o);
    list.push({ r: new WeakRef(o), kind, site: site() });
  };
  const sa = T.BufferGeometry.prototype.setAttribute;
  T.BufferGeometry.prototype.setAttribute = function (n, a) {
    note(this, 'geo');
    return sa.call(this, n, a);
  };
  const d = Object.getOwnPropertyDescriptor(T.Texture.prototype, 'needsUpdate');
  Object.defineProperty(T.Texture.prototype, 'needsUpdate', {
    configurable: true,
    get: d.get,
    set(v) {
      note(this, 'tex');
      d.set.call(this, v);
    },
  });
  window.__trk = {
    list,
    census() {
      const used = new Set();
      const scanM = (m) => {
        if (!m) return;
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) used.add(v);
        }
        if (m.uniforms)
          for (const k in m.uniforms) {
            const v = m.uniforms[k]?.value;
            if (v && v.isTexture) used.add(v);
            if (Array.isArray(v)) for (const x of v) if (x && x.isTexture) used.add(x);
          }
      };
      game.scene.traverse((o) => {
        if (o.geometry) used.add(o.geometry);
        const m = o.material;
        if (Array.isArray(m)) m.forEach(scanM);
        else scanM(m);
        scanM(o.customDepthMaterial);
        scanM(o.customDistanceMaterial);
      });
      const by = {};
      let alive = 0,
        gpu = 0,
        orphan = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i].r.deref();
        if (!o) {
          list.splice(i, 1);
          continue;
        }
        alive++;
        const L = o._listeners?.dispose || [];
        if (!L.some((f) => /^on(Geometry|Texture)Dispose$/.test(f.name))) continue;
        gpu++;
        if (used.has(o)) continue;
        orphan++;
        const k = list[i].kind + ' ' + list[i].site;
        by[k] = (by[k] || 0) + 1;
      }
      return {
        alive,
        gpu,
        orphan,
        top: Object.entries(by)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 14),
      };
    },
  };
  return 'tracking';
})();
