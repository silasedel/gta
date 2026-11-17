// r2-look: dump the materials of one object tree (name, type, color, map mean, roughness, metalness, clearcoat, alpha).
window.__matDump = (root) => {
  const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cx = cv.getContext('2d', { willReadFrequently: true });
  const mean = (t) => { try { if (!t?.image?.width || t.image.data) return null; cx.clearRect(0, 0, 32, 32); cx.drawImage(t.image, 0, 0, 32, 32); const d = cx.getImageData(0, 0, 32, 32).data; let r = 0, g = 0, b = 0, w = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 100) continue; r += s2l(d[i] / 255); g += s2l(d[i + 1] / 255); b += s2l(d[i + 2] / 255); w++; } return w ? [r / w, g / w, b / w].map((x) => +x.toFixed(3)) : null; } catch (e) { return 'err'; } };
  const seen = new Map();
  root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m)) { if (m) seen.get(m).n++; continue; }
    let vc = null; if (m.vertexColors && o.geometry.attributes.color) { const c = o.geometry.attributes.color; let r = 0, g = 0, b = 0; const st = Math.max(1, Math.floor(c.count / 2000)); let k = 0; for (let i = 0; i < c.count; i += st) { r += c.getX(i); g += c.getY(i); b += c.getZ(i); k++; } vc = [r / k, g / k, b / k].map((x) => +x.toFixed(3)); }
    seen.set(m, { mesh: o.name, name: m.name, type: m.type, color: m.color ? [m.color.r, m.color.g, m.color.b].map((x) => +x.toFixed(3)) : null, map: m.map ? (m.map.name || 'map') : null, mapMean: mean(m.map), vc,
      rough: m.roughness, rMap: !!m.roughnessMap, metal: m.metalness, mMap: !!m.metalnessMap, cc: m.clearcoat, ccR: m.clearcoatRoughness, env: m.envMapIntensity, nMap: !!m.normalMap,
      at: m.alphaTest, a2c: m.alphaToCoverage, tr: m.transparent, op: m.opacity, side: m.side, defines: Object.keys(m.defines || {}).join(' '), n: 1 }); } });
  return [...seen.values()];
};
