// r9: what stands in Nico's canal (H x 12.6..24.6, z wallZ..20): every scene object whose world bounds center falls in the water box
(async () => { const m = await import('/src/world/setpieces/nicoHouse/r4/plan4.js'), T = game.THREE, NH = game.nicoHouse, P = m.P4, Cn = P.canal;
  const toW = (hx, hz) => { const [gx, gz] = m.HtoG(hx, hz); return NH.toWorld(new T.Vector3(gx, 0, gz)); };
  const o = toW(0, 0), ax = toW(1, 0).sub(o), az = toW(0, 1).sub(o), out = [], bb = new T.Box3(), c = new T.Vector3();
  const inC = (p) => { const d = p.clone().sub(o); const hx = d.dot(ax), hz = d.dot(az); return hx > Cn.x0 + 0.3 && hx < Cn.x1 - 0.3 && hz > P.wallZ - 3 && hz < Cn.z1 - 0.3 ? [hx, hz] : null; };
  game.scene.traverse((ob) => { if (!(ob.isMesh || ob.isInstancedMesh) || !ob.visible) return; if (ob.isInstancedMesh) { const M4 = new T.Matrix4(); for (let i = 0; i < ob.count; i++) { ob.getMatrixAt(i, M4); c.setFromMatrixPosition(M4.premultiply(ob.matrixWorld)); const h = inC(c); if (h) out.push({ n: ob.name || ob.material?.name, inst: i, h: h.map((v) => +v.toFixed(1)), y: +c.y.toFixed(2), p: ob.parent?.name }); } return; }
    bb.setFromObject(ob); if (bb.isEmpty()) return; bb.getCenter(c); const s = bb.getSize(new T.Vector3()); if (s.x > 20 || s.z > 20) return; const h = inC(c); if (h) out.push({ n: ob.name || ob.material?.name, h: h.map((v) => +v.toFixed(1)), y: +c.y.toFixed(2), size: [s.x, s.y, s.z].map((v) => +v.toFixed(1)), p: ob.parent?.name, pp: ob.parent?.parent?.name }); });
  return JSON.stringify({ n: out.length, out: out.slice(0, 120) }, null, 0); })()
