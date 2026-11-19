// Whole-map audit, page side. Driven by tools/v2/map-audit.mjs (imports this module in the running game).
//   const A = await import('/tools/v2/map-audit.page.js');
//   A.globalChecks(game)          -> whole map from the data (no streaming): bridges / elevated roads, buildings in water
//   A.areaChecks(game, area)      -> one streamed area: floating / sunken props, parked cars, signs, ground seams / verge
//   A.pickAreas(game, n)          -> n area centres spread over the map's roads (farthest-point sampling) + named spots
// Every finding: { cls, x, z, y?, ...detail }. Classes:
//   roadOnWater   a ground road (not an elevated deck) running over water: "road flat on the water"
//   deckLow       an elevated deck over water within 1 m of the sea: "bridge dips into the water"
//   deckStep      a deck profile with a step / kink (grade change > 6 % over 2 m, or grade > 9 %)
//   deckDangling  a deck end in the air (no road continues): "ramps that do not meet"
//   twinGap       water visible between two parallel decks (gap 0.3 .. 6 m)
//   bldWater      a map building footprint mostly over water ("house in the sea"); lotWater: a generated house lot over water
//   floatProp     a prop / plant base above (+) or below (-) the solid ground by more than 6 cm (clipaudit 'ground')
//   propRoad      a hard prop on a carriageway (clipaudit 'road'); signRoad: a regulatory sign on a carriageway
//   signPlate     a sign plate not centred on its post (> 4 cm)
//   carBush       a parked car inside a bush / hedge; carLane: a parked car blocking a narrow street's travel lane
//   groundSeam    two different ground materials meeting in a straight hard edge (two sand tones, slab cut)
//   noVerge       an open road edge whose neighbour ground has no verge blend (material without the ground-mask edge patch)
const r2 = (v) => Math.round(v * 100) / 100;
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; let t = L2 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const DRIVE = (k) => !/footway|path|pedestrian|steps|cycleway|track|bridleway|corridor|platform|proposed|construction/.test(String(k || ''));

// ------------------------------------------------------------------------------------------------- global (data) checks
export function globalChecks(game) {
  const city = game.city, D = game.miamiData, el = city.elevated, net = el?.network, out = [];
  const isW = (x, z) => { try { return !!city.isWater(x, z); } catch (e) { return false; } };
  const SEA = D?.seaLevel ?? city.seaLevel ?? 0;
  const foot = (x, z) => { try { return el?.footprintAt?.(x, z) || null; } catch (e) { return null; } };
  const deckH = (x, z, y) => { try { return el?.heightAt?.(x, z, y); } catch (e) { return null; } };
  const G = D?.roadGraph || city.roadGraph;
  // 1. ground roads over water (not owned by the elevated network)
  for (const e of G.edges) {
    if (!e || !e.pts || e.pts.length < 2 || !DRIVE(e.kind)) continue;
    if (net?.own?.[e.id]) continue;
    let run = 0, rx = 0, rz = 0, best = null;
    const flush = () => { if (run >= 6) { const f = { cls: 'roadOnWater', x: r2(rx / (run / 3)), z: r2(rz / (run / 3)), len: run, edge: e.id, kind: e.kind, name: e.name || null, bridgeTag: !!e.bridge, elevTag: !!e.elevated }; if (!best || f.len > best.len) best = f; } run = 0; rx = 0; rz = 0; };
    for (let i = 1; i < e.pts.length; i++) {
      const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k < n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (isW(x, z) && !foot(x, z)) { run += 3; rx += x; rz += z; } else flush(); }
    }
    flush(); if (best) out.push(best);
  }
  // 2. elevated chains: low decks over water, steps / kinks, dangling ends, water between twin decks
  if (net?.chains) for (const c of net.chains) {
    const n = c.n; if (!n) continue;
    let lowRun = 0, lowX = 0, lowZ = 0, lowMin = 99;
    const flushLow = () => { if (lowRun >= 3) out.push({ cls: 'deckLow', x: r2(lowX / lowRun), z: r2(lowZ / lowRun), len: lowRun * 2, minY: r2(lowMin), chain: c.id, name: c.name, kind: c.kind }); lowRun = 0; lowX = 0; lowZ = 0; lowMin = 99; };
    for (let i = 0; i < n; i++) {
      if (c.vis && !c.vis[i]) { flushLow(); continue; }
      if (c.water[i] && c.y[i] < SEA + 1.0) { lowRun++; lowX += c.x[i]; lowZ += c.z[i]; lowMin = Math.min(lowMin, c.y[i]); } else flushLow();
    }
    flushLow();
    let lastStep = -99;
    for (let i = 1; i < n - 1; i++) {
      const d0 = Math.hypot(c.x[i] - c.x[i - 1], c.z[i] - c.z[i - 1]) || 2, d1 = Math.hypot(c.x[i + 1] - c.x[i], c.z[i + 1] - c.z[i]) || 2;
      const g0 = (c.y[i] - c.y[i - 1]) / d0, g1 = (c.y[i + 1] - c.y[i]) / d1;
      if ((Math.abs(g1 - g0) > 0.06 || Math.abs(g1) > 0.09) && i - lastStep > 10) { lastStep = i; out.push({ cls: 'deckStep', x: r2(c.x[i]), z: r2(c.z[i]), y: r2(c.y[i]), grade: r2(g1 * 100), kink: r2((g1 - g0) * 100), chain: c.id, name: c.name, kind: c.kind }); }
    }
    for (const [end, i] of [[c.endA, 0], [c.endB, n - 1]]) if (end === 'dead' && c.y[i] > 0.8) out.push({ cls: 'deckDangling', x: r2(c.x[i]), z: r2(c.z[i]), y: r2(c.y[i]), chain: c.id, name: c.name, kind: c.kind });
    // twin gap: from each deck edge over water, look outward: no deck right at the edge but a deck at about the same height 1-6 m out
    let lastGap = -99;
    for (let i = 2; i < n - 2; i += 2) {
      if (!c.water[i] || (c.vis && !c.vis[i]) || i - lastGap < 15) continue;
      const tx = c.x[i + 1] - c.x[i - 1], tz = c.z[i + 1] - c.z[i - 1], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
      for (const side of [-1, 1]) {
        const e0 = side > 0 ? (c.vR ? c.vR[i] : c.hw[i]) : -(c.vL ? c.vL[i] : -c.hw[i]), base = Math.abs(e0) + 1.2; // past the barrier
        const y0 = c.y[i]; const at = (o) => { const h = deckH(c.x[i] + nx * side * o, c.z[i] + nz * side * o, y0 + 1); return h !== null && h !== undefined && Math.abs(h - y0) < 2 ? h : null; };
        if (at(base) !== null) continue;
        // a parallel twin for 16 m with water between
        const atJ = (j, o) => { const h = deckH(c.x[j] + nx * side * o, c.z[j] + nz * side * o, y0 + 1); return h !== null && h !== undefined && Math.abs(h - y0) < 2; };
        for (let o = base + 1; o <= base + 6; o += 1) if (at(o) !== null && atJ(Math.max(0, i - 4), o) && atJ(Math.min(n - 1, i + 4), o) && !atJ(Math.max(0, i - 4), base) && !atJ(Math.min(n - 1, i + 4), base)) { out.push({ cls: 'twinGap', x: r2(c.x[i] + nx * side * (base + o) / 2), z: r2(c.z[i] + nz * side * (base + o) / 2), gap: r2(o - base + 1.2), chain: c.id, name: c.name }); lastGap = i; break; }
        if (lastGap === i) break;
      }
    }
  }
  // 3. map buildings mostly over water
  const polys = D?.mapLayers?.buildingPolys || city.mapLayers?.buildingPolys || [];
  polys.forEach((b, bi) => {
    const r = b.outer; if (!r || r.length < 3) return;
    let cx = 0, cz = 0; for (const [x, z] of r) { cx += x; cz += z; } cx /= r.length; cz /= r.length;
    let w = 0, n = 0; const probe = (x, z) => { n++; if (isW(x, z)) w++; };
    probe(cx, cz); for (const [x, z] of r) probe(cx + (x - cx) * 0.8, cz + (z - cz) * 0.8);
    if (w / n >= 0.4) out.push({ cls: 'bldWater', x: r2(cx), z: r2(cz), frac: r2(w / n), h: b.h, idx: bi });
  });
  const counts = {}; for (const f of out) counts[f.cls] = (counts[f.cls] || 0) + 1;
  return { counts, findings: out };
}

// ------------------------------------------------------------------------------------------------- area picking
export function pickAreas(game, n = 24, extra = []) {
  const G = game.miamiData?.roadGraph || game.city.roadGraph, city = game.city;
  const pts = []; for (const nd of G.nodes) { if (!nd || (nd.edges || []).length < 2) continue; if (city.isWater(nd.x, nd.z)) continue; pts.push([nd.x, nd.z]); }
  const out = extra.map((e) => [e.x, e.z]); if (!out.length && pts.length) out.push(pts[(pts.length / 2) | 0]);
  const dmin = pts.map((p) => Math.min(...out.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
  while (out.length < n + extra.length && pts.length) {
    let bi = 0; for (let i = 1; i < pts.length; i++) if (dmin[i] > dmin[bi]) bi = i;
    const q = pts[bi]; out.push(q);
    for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]); if (d < dmin[i]) dmin[i] = d; }
  }
  return out.map(([x, z], i) => ({ name: i < extra.length ? extra[i].name : `a${i}`, x: r2(x), z: r2(z), district: String(city.districtAt?.(x, z) || ''), zone: String(city.zoneAt?.(x, z) || '') }));
}

// ------------------------------------------------------------------------------------------------- area checks
export async function areaChecks(game, A, opts = {}) {
  const city = game.city, T = game.THREE || window.THREE, out = [];
  const inA = (x, z) => (x - A.x) ** 2 + (z - A.z) ** 2 < A.r * A.r;
  // a. props: reuse the clipping audit (ground / road / building)
  try {
    const C = await import('/tools/v2/clipaudit.page.js');
    const r = await C.auditArea(game, A, { zfight: false });
    // plants are sunk on purpose (root flare / mud: shrubs 5 cm x scale, palms and trees 4-10 cm): only floating, or sunk deeper than that, counts
    const sinkOk = (g) => g.dy < 0 && ((/vegShrub|blob|flower/.test(g.kind) && g.dy > -0.25) || (/palm|tree|vegPalm|vegTree/.test(g.kind) && g.dy > -0.16));
    for (const g of r.ground || []) if (!sinkOk(g)) out.push({ cls: 'floatProp', x: g.x, y: g.y, z: g.z, dy: g.dy, kind: g.kind, src: g.src });
    for (const g of r.road || []) if (!/vegShrub|blob|flower/.test(g.kind)) out.push({ cls: 'propRoad', x: g.x, y: g.y, z: g.z, kind: g.kind, src: g.src, gap: g.gap, deck: g.deck });
    for (const g of r.building || []) out.push({ cls: 'propInBld', x: g.x, y: g.y, z: g.z, kind: g.kind, src: g.src });
  } catch (e) { out.push({ cls: 'error', where: 'clipaudit', msg: String(e.message || e) }); }
  // b. generated house lots over water
  try { const lots = (await import('/src/world/setpieces/houses/lots.js')).lots;
    for (const L of lots.list?.values?.() || []) { if (!inA(L.x, L.z)) continue; const w = L.sp?.w || 10, d = L.sp?.d || 10, c = Math.cos(L.ry || 0), s = Math.sin(L.ry || 0); let wn = 0, n = 0;
      for (const [u, v] of [[0, 0], [-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { n++; const x = L.x + c * u * w + s * v * d, z = L.z - s * u * w + c * v * d; if (city.isWater(x, z)) wn++; }
      if (wn / n >= 0.4) out.push({ cls: 'lotWater', x: r2(L.x), z: r2(L.z), frac: wn / n, id: L.id, src: L.src || L.kind || 'lots' }); } } catch (e) { /* no lots */ }
  // c. regulatory signs: on a carriageway, plate off its post
  const P = game.placement;
  for (const s of game.regSigns?.list?.(A.x, A.z, A.r) || []) {
    if (P?.onRoad?.(s.x, s.z, 0.15)) out.push({ cls: 'signRoad', x: r2(s.x), z: r2(s.z), kind: s.kind });
  }
  for (const name of ['reg-sign-posts']) {
    const posts = game.scene.getObjectByName(name), plate = game.scene.getObjectByName('reg-stop');
    if (!posts || !plate || A.signPlateDone) continue;
    const m = new T.Matrix4(), q = new T.Matrix4(), bb1 = new T.Box3(), bb2 = new T.Box3();
    posts.geometry.computeBoundingBox(); plate.geometry.computeBoundingBox();
    const n = Math.min(plate.count, 400); let bad = 0, worst = 0, wx = 0, wz = 0;
    // stops come first in the post list, in the same order as the plates
    for (let i = 0; i < n; i++) { posts.getMatrixAt(i, m); plate.getMatrixAt(i, q); bb1.copy(posts.geometry.boundingBox).applyMatrix4(m); bb2.copy(plate.geometry.boundingBox).applyMatrix4(q);
      const c1 = bb1.getCenter(new T.Vector3()), c2 = bb2.getCenter(new T.Vector3()); // plate centre vs post axis, sideways (across the plate)
      const ry = new T.Euler().setFromRotationMatrix(m, 'YXZ').y, ax = Math.cos(ry), az = -Math.sin(ry), off = Math.abs((c2.x - c1.x) * ax + (c2.z - c1.z) * az);
      if (off > 0.04) { bad++; if (off > worst) { worst = off; wx = c1.x; wz = c1.z; } } }
    if (bad) out.push({ cls: 'signPlate', x: r2(wx), z: r2(wz), count: bad, of: n, worst: r2(worst), global: true });
  }
  // d. parked cars: in a bush, or in a narrow street's travel lane
  const G = game.miamiData?.roadGraph || city.roadGraph, _o = {};
  for (const v of game.vehicles?.list || []) {
    if (!v || v.disposed || !v.parked || v.playerDriven || v.ai) continue; let p; try { p = v.body.translation(); } catch (e) { continue; } if (!inA(p.x, p.z)) continue;
    let rot; try { rot = v.body.rotation(); } catch (e) { rot = { x: 0, y: 0, z: 0, w: 1 }; }
    const h = Math.atan2(2 * (rot.w * rot.y + rot.x * rot.z), 1 - 2 * (rot.y * rot.y + rot.x * rot.x)), c = Math.cos(h), s = Math.sin(h), L = v.spec?.L || 4.6, W = v.spec?.W || 1.9;
    let bush = 0; for (const [a, b] of [[0, 0], [W / 2, L / 2], [-W / 2, L / 2], [W / 2, -L / 2], [-W / 2, -L / 2]]) { const x = p.x + a * c + b * s, z = p.z - a * s + b * c;
      bush = Math.max(bush, city.bushAt?.(x, z, 0.2) || 0, game.physics?.shrubs?.at?.(x, z, 0.3) || 0, game.vegetation?.shrubAt?.(x, z) || 0); }
    if (bush > 0.05) out.push({ cls: 'carBush', x: r2(p.x), z: r2(p.z), depth: r2(bush), model: v.key || v.type || '' });
    try { const e = G.nearestEdge(p.x, p.z, _o, 20); if (e && e.edge && DRIVE(e.edge.kind) && !/service|parking|driveway/.test(e.edge.kind || '')) { const w = e.edge.width || 6, two = !e.edge.oneway, inner = e.dist - W / 2; // car edge toward the centre line
      const free = two ? w / 2 - (w / 2 - inner) : w - (w / 2 - inner); // clear width beside the car on its own side (two-way: to the centre line)
      if (inner < w / 2 && ((two && w < 7.4) || (!two && w < 5.6) || free < 2.2)) out.push({ cls: 'carLane', x: r2(p.x), z: r2(p.z), width: r2(w), off: r2(e.dist), kind: e.edge.kind, model: v.key || v.type || '' }); } } catch (e) { /* */ }
  }
  // e. ground materials: hard seams and verge coverage (top-down rays against the visible ground meshes)
  if (opts.ground !== false) Object.assign(A, groundScan(game, A, out));
  const counts = {}; for (const f of out) counts[f.cls] = (counts[f.cls] || 0) + 1;
  return { counts, findings: out };
}

function groundScan(game, A, out) {
  const T = game.THREE || window.THREE, city = game.city, scene = game.scene, R = Math.min(A.r, 70);
  const cand = [], bb = new T.Box3();
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || !o.geometry) return;
    let vis = true; for (let p = o.parent; p; p = p.parent) if (!p.visible) { vis = false; break; } if (!vis) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || m.transparent && m.opacity < 0.5 || m.colorWrite === false) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    if (bb.max.x < A.x - R || bb.min.x > A.x + R || bb.max.z < A.z - R || bb.min.z > A.z + R) return;
    if (bb.min.y > 4 || bb.max.y < -3) return;
    cand.push(o);
  });
  const rc = new T.Raycaster(), dn = new T.Vector3(0, -1, 0), org = new T.Vector3();
  const top = (x, z) => { org.set(x, 40, z); rc.set(org, dn); rc.far = 60; const h = rc.intersectObjects(cand, false); for (const it of h) { if (it.face && it.face.normal && Math.abs(it.face.normal.y) < 0.3) continue; return it; } return null; };
  const fam = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return (o.name || o.parent?.name || '?') + '|' + (m?.name || m?.type || ''); };
  const verge = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material, u = m?.userData || {}; return !!(u.gmEdge || u.gmFill || u.gmVeg || u.verge || u.gmRoad); };
  // grid: 1.5 m cells; a seam = neighbour cells on different ground meshes whose surface heights match (coplanar join) and
  // whose material families differ, along a run of >= 4 cells in a straight line (a hard ruled cut, not a soft blend)
  const S = 2.0, N = Math.floor(R / S), grid = new Map();
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) { const x = A.x + i * S, z = A.z + j * S; if (i * i + j * j > N * N) continue; if (city.isWater(x, z)) continue; const h = top(x, z); if (h) grid.set(i * 4096 + j, { o: h.object, y: h.point.y, f: fam(h.object) }); }
  const seams = new Map();
  for (const [k, a] of grid) { const i = Math.round(k / 4096), j = k - i * 4096;
    for (const [di, dj] of [[1, 0], [0, 1]]) { const b = grid.get((i + di) * 4096 + j + dj); if (!b || a.o === b.o || a.f === b.f || a.f.split('|')[1] === b.f.split('|')[1]) continue; // same material across a tile / chunk seam: one surface if (Math.abs(a.y - b.y) > 0.25) continue;
      // only ground fills against ground fills (two sand / dirt / grass sheets meeting): road / deck / building edges are meant to be
      // hard, and terrain vs its own far LOD is the same surface
      const fill = (f) => !/asph|road|junction|line|mark|curb|deck|walk|slab|pave|lane|concrete|elevated|ocean|water|chunk-mid|facade|houses|wall|roof|town:|npcProp|panels/i.test(f);
      if (!fill(a.f) || !fill(b.f)) continue; if (/terrain/.test(a.f) && /terrain/.test(b.f)) continue;
      const key = [a.f, b.f].sort().join(' / '); let s = seams.get(key); if (!s) seams.set(key, (s = { n: 0, x: 0, z: 0 })); s.n++; s.x += A.x + (i + di / 2) * S; s.z += A.z + (j + dj / 2) * S; } }
  for (const [pair, s] of seams) if (s.n >= 5) out.push({ cls: 'groundSeam', x: r2(s.x / s.n), z: r2(s.z / s.n), cells: s.n, pair });
  // verge: just outside each open (no sidewalk) drivable road edge in the area
  const G = game.miamiData?.roadGraph || city.roadGraph, noV = new Map();
  for (const e of G.edges) { if (!e?.pts || !DRIVE(e.kind) || e.elevated || (e.sidewalk || 0) > 0 || e.sidewalks) continue;
    for (let i = 1; i < e.pts.length; i++) { const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i], L = Math.hypot(bx - ax, bz - az); if (!L) continue; const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 4; s < L - 4; s += 6) { const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L; if ((x - A.x) ** 2 + (z - A.z) ** 2 > R * R) continue;
        for (const side of [-1, 1]) { const o = (e.width || 6) / 2 + 1.2, px = x + nx * side * o, pz = z + nz * side * o; if (city.isWater(px, pz)) continue;
          const r0 = G.nearestEdge ? G.nearestEdge(px, pz, {}, 10) : null; if (r0 && r0.edge !== e && r0.dist < (r0.edge.width || 6) / 2 + 0.3) continue; // another road there
          const h = top(px, pz); if (!h) continue; const f = fam(h.object); if (/asph|road|junction|line|mark|curb|deck|walk|slab|pave|drive|lane|lot|park|houses|town:|fin:|wall|roof|facade|chunk-mid/i.test(f)) continue;
          if (!verge(h.object)) { let q = noV.get(f); if (!q) noV.set(f, (q = { n: 0, x: px, z: pz })); q.n++; } } } } }
  for (const [f, q] of noV) if (q.n >= 3) out.push({ cls: 'noVerge', x: r2(q.x), z: r2(q.z), samples: q.n, mesh: f });
  return { groundCells: grid.size, groundMeshes: cand.length };
}
