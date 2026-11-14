// Ground seam audit (track: ground-continuity). Runs in the page against the live colliders and meshes:
//   const A = await import('/src/world/ground/seamAudit.js'); A.auditSpot(game, { name, x, z, r }); A.waterMaskScan(game)
// Checks (STEP = 0.15 m):
//   roadEnds   every dead-end road node (degree 1) in the area: 'abrupt' when nothing road-like (asphalt / junction / apron)
//              is drawn past the end of the ribbon (hard rectangle end), 'step' when the collider height changes by more than
//              STEP between 2 m before the end and 3 m past it
//   pads       every set-piece ground claim border: collider height 1 m inside vs 1.5 m outside (land only)
//   holes      3 m grid of land points (water mask says land) with no fixed collider within 2 m of the expected ground
//   waterSolid 3 m grid of water points (mask says water, so the player swims) with a solid fixed collider at / above the
//              surface: the "swimming under a sand slab" class
//   islets     tiny land specks (< 2500 m2 on a 16 m probe) standing in open water around the spot: flat slabs on the sea
// waterMaskScan: map-wide count of water-mask slivers (raw water cells that are really a gap between land polygons) and how
// many are still treated as water.
const STEP = 0.15;

function tools(game) {
  const R = game.RAPIER, W = game.world, T = game.THREE || window.THREE, city = game.city;
  const QF = R.QueryFilterFlags, FIX = QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS;
  const ray = (x, z, top = 40) => { const h = W.castRay(new R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), top + 20, true, FIX); return h ? top - h.timeOfImpact : null; };
  // ground-ish collider height: first fixed hit below `ref + 1.6` (skips roofs, canopies, trees)
  const ground = (x, z, ref) => ray(x, z, (ref ?? 0) + 1.6);
  const rc = new T.Raycaster(), down = new T.Vector3(0, -1, 0), o = new T.Vector3();
  const roots = [city.root, game.nicoHouse?.group].filter(Boolean);
  const render = (x, z, ref) => { o.set(x, (ref ?? 0) + 1.2, z); rc.set(o, down); rc.far = 4; const hs = rc.intersectObjects(roots, true).filter((q) => q.object.isMesh && !q.object.isInstancedMesh && q.object.visible); return hs[0] || null; };
  return { R, W, T, city, ray, ground, render, sea: city.seaLevel ?? -0.12 };
}

export function auditSpot(game, spot) {
  const t = tools(game), { city } = t, rg = game.miamiData?.roadGraph || city.roadGraph, res = { name: spot.name, x: spot.x, z: spot.z, r: spot.r, roadEnds: { n: 0, abrupt: 0, step: 0, list: [] }, pads: { n: 0, step: 0, maxStep: 0, list: [] }, holes: { n: 0, list: [] }, waterSolid: { n: 0, list: [] }, islets: { n: 0, list: [] } };
  const isW = (x, z) => city.isWater(x, z), gh = (x, z) => city.groundHeightAt(x, z);
  // road materials seen on ribbons / junctions in this area (anything drawn with them counts as a finished road end)
  const roadMats = new Set();
  const near = (x, z) => Math.hypot(x - spot.x, z - spot.z) < spot.r;
  for (const e of rg.edges) { const m = e.pts[(e.pts.length / 2) | 0]; if (!near(m[0], m[1]) || e.elevated) continue; const h = t.render(m[0], m[1], 0.1); if (h) roadMats.add(h.object.material); if (roadMats.size > 6) break; }
  for (const n of rg.nodes) { if ((n.edges || []).length >= 3 && near(n.x, n.z)) { const h = t.render(n.x, n.z, 0.1); if (h) roadMats.add(h.object.material); } }
  // ---- dead ends ----
  for (const n of rg.nodes) {
    if ((n.edges || []).length !== 1 || !near(n.x, n.z)) continue;
    const e = rg.edges[n.edges[0]]; if (!e || !e.pts || e.elevated) continue;
    const atB = Math.hypot(e.pts[e.pts.length - 1][0] - n.x, e.pts[e.pts.length - 1][1] - n.z) < 1, p = atB ? e.pts[e.pts.length - 1] : e.pts[0], q = atB ? e.pts[e.pts.length - 2] : e.pts[1];
    let ox = p[0] - q[0], oz = p[1] - q[1]; const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
    if (isW(p[0] + ox * 3, p[1] + oz * 3)) continue; // ends at the water (ramp / pier)
    res.roadEnds.n++;
    const hw = (e.width || 6) / 2, g0 = gh(p[0], p[1]);
    // finished end: road-like surface 0.6 hw past the end on the centre line and at +-0.5 hw
    const GC = game.city.groundClaims;
    let abrupt, step = null;
    if (GC && GC.at(p[0], p[1], 2)) { // ends inside a set piece's own ground: it must meet that ground flush at the claim edge (apron)
      let s = 0; while (s < 150 && GC.at(p[0] - ox * s, p[1] - oz * s, 0.2)) s += 0.5;
      const ex = p[0] - ox * s, ez = p[1] - oz * s, hIn = t.ground(ex - ox * 2, ez - oz * 2, g0 + 1), hOut = t.ground(ex + ox * 2, ez + oz * 2, g0 + 1);
      step = hIn !== null && hOut !== null ? Math.abs(hIn - hOut) : null; abrupt = step !== null && step > STEP;
    } else {
      let ok = 0; for (const [a, b] of [[0.6, 0], [0.35, 0.5], [0.35, -0.5]]) { const x = p[0] + ox * hw * a - oz * hw * b, z = p[1] + oz * hw * a + ox * hw * b, h = t.render(x, z, g0 + 0.1); if (h && roadMats.has(h.object.material)) ok++; }
      const hIn = t.ground(p[0] - ox * 2, p[1] - oz * 2, g0), hOut = t.ground(p[0] + ox * 3, p[1] + oz * 3, g0); step = hIn !== null && hOut !== null ? Math.abs(hIn - hOut) : null;
      abrupt = ok < 2;
    }
    const bad = step !== null && step > STEP;
    if (abrupt) res.roadEnds.abrupt++; if (bad) res.roadEnds.step++;
    if (abrupt || bad) res.roadEnds.list.push({ x: +p[0].toFixed(1), z: +p[1].toFixed(1), name: e.name || e.kind, abrupt, step: step === null ? null : +step.toFixed(2) });
  }
  // ---- set-piece pads ----
  const claims = (game.city.groundClaims?.list) || [];
  for (const cl of claims) {
    const R0 = cl.ring; let cx = 0, cz = 0; for (const [x, z] of R0) { cx += x; cz += z; } cx /= R0.length; cz /= R0.length;
    if (Math.hypot(cx - spot.x, cz - spot.z) > spot.r + 80) continue;
    for (let i = 0; i < R0.length; i++) { const a = R0[i], b = R0[(i + 1) % R0.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 1; s < L - 1; s += 2) { const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L; let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }
        const xo = x + nx * 1.5, zo = z + nz * 1.5; if (isW(xo, zo)) continue; res.pads.n++;
        const hi = t.ground(x - nx, z - nz, 2), ho = t.ground(xo, zo, 2); if (hi === null || ho === null) continue; const st = Math.abs(hi - ho);
        res.pads.maxStep = Math.max(res.pads.maxStep, +st.toFixed(2));
        if (st > STEP) { res.pads.step++; if (res.pads.list.length < 12) res.pads.list.push({ id: cl.id, x: +x.toFixed(1), z: +z.toFixed(1), step: +st.toFixed(2) }); } } }
  }
  // ---- grid: holes and solid ground over swimmable water ----
  for (let z = spot.z - spot.r; z <= spot.z + spot.r; z += 3) for (let x = spot.x - spot.r; x <= spot.x + spot.r; x += 3) {
    if (!near(x, z)) continue;
    if (!isW(x, z)) { const g = gh(x, z), h = t.ground(x, z, g); if (h === null || h < g - 2) { res.holes.n++; if (res.holes.list.length < 12) res.holes.list.push([+x.toFixed(0), +z.toFixed(0)]); } }
    else { const h = t.ray(x, z, t.sea + 1.2); if (h !== null && h > t.sea - 0.08 && h < t.sea + 0.4) { res.waterSolid.n++; if (res.waterSolid.list.length < 12) res.waterSolid.list.push([+x.toFixed(0), +z.toFixed(0), +h.toFixed(2)]); } }
  }
  return res;
}

// small land specks in open water within R of (x, z): 16 m probe, flood fill, report components < 2500 m2 whose ring is all water
export function islets(game, x0, z0, R = 1500) {
  const city = game.city, S = 16, N = Math.ceil(R / S), W = 2 * N + 1, land = new Uint8Array(W * W), seen = new Uint8Array(W * W), out = [];
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) land[j * W + i] = city.isWater(x0 + (i - N) * S, z0 + (j - N) * S) ? 0 : 1;
  for (let k = 0; k < W * W; k++) { if (!land[k] || seen[k]) continue; const st = [k], cells = []; seen[k] = 1; let edge = false;
    while (st.length) { const c = st.pop(); cells.push(c); const ci = c % W, cj = (c / W) | 0; if (ci === 0 || cj === 0 || ci === W - 1 || cj === W - 1) edge = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue; const q = nj * W + ni; if (land[q] && !seen[q]) { seen[q] = 1; st.push(q); } } if (cells.length > 40) break; }
    if (!edge && cells.length * S * S < 2500) { let sx = 0, sz = 0; for (const c of cells) { sx += x0 + ((c % W) - N) * S; sz += z0 + (((c / W) | 0) - N) * S; } out.push({ x: +(sx / cells.length).toFixed(0), z: +(sz / cells.length).toFixed(0), cells: cells.length }); }
  }
  return out;
}

// map-wide water-mask slivers (2 m cells, sampled every 4 m over the real-Miami rectangle and the Keys box)
export function waterMaskScan(game, boxes) {
  const d = game.miamiData; if (!d || !d.isWaterRaw) return null;
  const rr = d.realRect, B = boxes || [[rr.minX, rr.minZ, rr.maxX, rr.maxZ], [-9000, 11000, -5000, 16000]];
  let slivers = 0, still = 0; const t0 = performance.now();
  for (const [a, b, c, e] of B) for (let z = b; z < e; z += 4) for (let x = a; x < c; x += 4) { if (!d.isWaterRaw(x, z)) continue; if (d.isSliver(x, z)) { slivers++; if (d.isWater(x, z)) still++; } }
  return { slivers, stillWater: still, m2: slivers * 16, ms: Math.round(performance.now() - t0) };
}
