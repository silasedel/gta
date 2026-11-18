// r3-world: automatic check over EVERY intersection of the live map (data level, no browser; same junction geometry as the game:
// src/world/miami/roadgeo.js buildJunction). Finds:
//   cross     two at-grade roads crossing (or one road's carriageway running over another's) with no shared graph node: no junction
//             surface is drawn there, the ribbons pass through each other
//   clash     a deck / ramp crossing an at-grade road (or another deck) with less than 4.3 m of headroom
//   overlap   two junction outlines overlapping (curb returns of one junction drawn across the other junction's carriageway)
//   curb      a junction's outline (= its curb line) cutting through the carriageway of a road that is not one of its legs
//   short     a leg whose curb returns do not fit on the leg (mouth clamped to 48 % of the leg: curbs end inside the next junction)
//   wall      a ramp / deck stretch at 0.3-4.5 m (side walls, embankment face) reaching into an at-grade street's carriageway
//   grade     (r3-roads) an at-grade junction (a street leg, below 2 m) whose node is raised > 0.3 m: a ramp runs straight
//             through the junction, its walls start at the corner (SR 934 x SW 10th Ave)
//   blocked   (r3-roads) an at-grade junction with a raised ramp / deck (0.35-5.5 m) over its center or mouth: the game drops
//             the whole junction surface there (grass in the middle of the crossing: SR 934 x SW 9th Ave)
//   hump      (r3-roads) a street that leaves the ground and comes back without carrying a bridge: a stretch of the street
//             raised on walls for nothing (SW 11th St between the Brickell Ave ramps)
//   island    a small piece of ground (grass / median) enclosed by carriageways next to a junction (a junction drawn as two or more
//             close nodes with a grass triangle between them)
//   node --max-old-space-size=4096 tools/v2/maproads/junction-audit.mjs [--build <dir>] [--json docs/v2/reports/junction-audit.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROOT = path.join(GAME, 'public/assets/miami');
const bi = process.argv.indexOf('--build');
globalThis.fetch = async (url) => {   // same shim as tools/osm/audit.mjs
  let f = path.join(ROOT, String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/assets\/miami\//, ''));
  if (bi > 0 && f.endsWith('world.json')) f = path.join(process.argv[bi + 1], 'world.json');
  if (bi > 0 && !fs.existsSync(f)) f = path.join(path.dirname(process.argv[bi + 1]), path.relative(ROOT, f));
  if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => { throw new Error('404 ' + url); }, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = fs.readFileSync(f);
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const { loadMiamiData } = await import(pathToFileURL(path.join(GAME, 'src/world/miami/data.js')).href);
const { buildJunction } = await import(pathToFileURL(path.join(GAME, 'src/world/miami/roadgeo.js')).href);
const data = await loadMiamiData(null);
const G = data.roadGraph, E = G.edges, N = G.nodes;
const out = { build: data.manifest?.build, when: new Date().toISOString(), counts: {}, issues: [] };
const add = (kind, x, z, info) => out.issues.push({ kind, x: +x.toFixed(1), z: +z.toFixed(1), ...info });
const nm = (e) => e.name || e.ref || e.kind;
const laneEdge = (e) => /service|track|footway|path|cycleway|pedestrian/.test(e.kind || '');
// height of an edge at arc length s (absolute; at-grade edges: 0 + terrain)
const yAt = (e, s) => { if (!e.y || !e.y.length || e.terrain) return 0; const c = e.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++; const t = Math.max(0, Math.min(1, (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1))); return e.y[i - 1] + (e.y[i] - e.y[i - 1]) * t; };
const atGrade = (e, s) => yAt(e, s) < 1.2;
// ---- segment grid
const CELL = 40, grid = new Map(), key = (i, j) => i * 100003 + j;
const segs = [];
for (const e of E) { if (!e || e.a === e.b || laneEdge(e) || e.pts.length < 2) continue;
  for (let i = 0; i < e.pts.length - 1; i++) { const [x0, z0] = e.pts[i], [x1, z1] = e.pts[i + 1]; const sg = { e, i, x0, z0, x1, z1, s0: e.cum[i], s1: e.cum[i + 1] }; segs.push(sg);
    const pad = e.width / 2 + 2; for (let gi = Math.floor((Math.min(x0, x1) - pad) / CELL); gi <= Math.floor((Math.max(x0, x1) + pad) / CELL); gi++) for (let gj = Math.floor((Math.min(z0, z1) - pad) / CELL); gj <= Math.floor((Math.max(z0, z1) + pad) / CELL); gj++) { const k = key(gi, gj); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(sg); } } }
const near = (x, z, r = 0) => { const set = new Set(); for (let gi = Math.floor((x - r) / CELL); gi <= Math.floor((x + r) / CELL); gi++) for (let gj = Math.floor((z - r) / CELL); gj <= Math.floor((z + r) / CELL); gj++) for (const s of grid.get(key(gi, gj)) || []) set.add(s); return set; };
const segDist = (px, pz, s) => { const dx = s.x1 - s.x0, dz = s.z1 - s.z0, L2 = dx * dx + dz * dz; let u = L2 ? ((px - s.x0) * dx + (pz - s.z0) * dz) / L2 : 0; u = Math.max(0, Math.min(1, u)); return { d: Math.hypot(px - s.x0 - dx * u, pz - s.z0 - dz * u), s: s.s0 + (s.s1 - s.s0) * u }; };
const shareNode = (a, b) => a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b;
const nodeDist = (e, x, z) => Math.min(Math.hypot(N[e.a].x - x, N[e.a].z - z), Math.hypot(N[e.b].x - x, N[e.b].z - z));
// ---- 1. crossings without a node / deck clashes
const seenX = new Set();
for (const A of segs) for (const B of near((A.x0 + A.x1) / 2, (A.z0 + A.z1) / 2, Math.hypot(A.x1 - A.x0, A.z1 - A.z0) / 2)) {
  if (B.e.id <= A.e.id) continue;
  const rx = A.x1 - A.x0, rz = A.z1 - A.z0, sx = B.x1 - B.x0, sz = B.z1 - B.z0, den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) continue;
  const t = ((B.x0 - A.x0) * sz - (B.z0 - A.z0) * sx) / den, u = ((B.x0 - A.x0) * rz - (B.z0 - A.z0) * rx) / den; if (t < 0 || t > 1 || u < 0 || u > 1) continue;
  const x = A.x0 + rx * t, z = A.z0 + rz * t, sa = A.s0 + (A.s1 - A.s0) * t, sb = B.s0 + (B.s1 - B.s0) * u;
  if (shareNode(A.e, B.e) && Math.min(nodeDist(A.e, x, z), nodeDist(B.e, x, z)) < 2) continue; // the shared junction node itself
  const k = A.e.id + ':' + B.e.id + ':' + Math.round(x / 10) + ':' + Math.round(z / 10); if (seenX.has(k)) continue; seenX.add(k);
  const ya = yAt(A.e, sa), yb = yAt(B.e, sb), dy = Math.abs(ya - yb);
  if (dy < 1.2) add('cross', x, z, { a: A.e.id, b: B.e.id, na: nm(A.e), nb: nm(B.e), ya: +ya.toFixed(1), yb: +yb.toFixed(1), note: shareNode(A.e, B.e) ? 'legs of one node cross again away from it' : 'no junction node' });
  else if (dy < 4.3) add('clash', x, z, { a: A.e.id, b: B.e.id, na: nm(A.e), nb: nm(B.e), ya: +ya.toFixed(1), yb: +yb.toFixed(1), headroom: +dy.toFixed(1) });
}
// carriageways running into each other without crossing centerlines (an at-grade road ending inside another's carriageway, parallel
// roads overlapping): sample each edge every 4 m away from its own end nodes
for (const e of E) { if (!e || e.a === e.b || laneEdge(e) || e.pts.length < 2) continue;
  for (let s = 0; s <= e.length; s += 4) { const c = e.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++; const t = Math.max(0, Math.min(1, (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1))); const x = e.pts[i - 1][0] + (e.pts[i][0] - e.pts[i - 1][0]) * t, z = e.pts[i - 1][1] + (e.pts[i][1] - e.pts[i - 1][1]) * t;
    if (!atGrade(e, s)) continue;
    for (const B of near(x, z, 12)) { const f = B.e; if (f.id === e.id) continue; const q = segDist(x, z, B); const lim = (e.width + f.width) / 2 - 1.0; if (q.d > lim) continue; if (!atGrade(f, q.s)) continue;
      // inside the mouth of a junction they share is fine; so is the stretch next to a node where both meet
      const shared = shareNode(e, f) ? [e.a, e.b].filter((n) => n === f.a || n === f.b).map((n) => N[n]) : [];
      if (shared.some((n) => Math.hypot(n.x - x, n.z - z) < Math.max(e.width, f.width) * 1.6 + 25)) continue;
      const k = Math.min(e.id, f.id) + ':' + Math.max(e.id, f.id); if (seenX.has('o' + k)) continue; seenX.add('o' + k);
      add('cross', x, z, { a: e.id, b: f.id, na: nm(e), nb: nm(f), note: `carriageways overlap ${(lim + 1 - q.d).toFixed(1)} m (center lines ${q.d.toFixed(1)} m apart)` }); break; } } }
// ramp / deck walls standing in a street (lead, item 28): a raised stretch (0.3-4.5 m up: walls or an embankment face at car height)
// whose footprint reaches into an at-grade carriageway that is not one of its own connections
for (const e of E) { if (!e || e.a === e.b || laneEdge(e) || !e.y || e.terrain || e.pts.length < 2) continue;
  for (let s = 0; s <= e.length; s += 3) { const y = yAt(e, s); if (y < 0.3 || y > 4.5) continue; const c = e.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++; const t = Math.max(0, Math.min(1, (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1))); const x = e.pts[i - 1][0] + (e.pts[i][0] - e.pts[i - 1][0]) * t, z = e.pts[i - 1][1] + (e.pts[i][1] - e.pts[i - 1][1]) * t;
    let hit = null; for (const B of near(x, z, 14)) { const f = B.e; if (f.id === e.id || shareNode(e, f) && nodeDist(f, x, z) < 40) continue; const q = segDist(x, z, B); if (!atGrade(f, q.s) || q.d > (e.width + f.width) / 2 + 0.3) continue; hit = { f, d: q.d }; break; }
    if (hit) { const k = 'w' + e.id + ':' + hit.f.id; if (!seenX.has(k)) { seenX.add(k); add('wall', x, z, { a: e.id, b: hit.f.id, na: nm(e), nb: nm(hit.f), y: +y.toFixed(1), note: `ramp at ${y.toFixed(1)} m, its edge ${((e.width + hit.f.width) / 2 + 0.3 - hit.d).toFixed(1)} m inside the street` }); } } } }
// ---- 2. junction outlines
const J = new Map();
for (const n of N) { if (!n || (n.edges || []).length < 3) continue; if (n.y > 0.3 && !n.edges.every((k) => !E[k].y || E[k].terrain || Math.max(...E[k].y) < 2)) continue;
  let j = null; try { j = buildJunction(G, n, { swOf: (e) => (laneEdge(e) ? 0 : e.sidewalk || 0) }); } catch (err) { add('error', n.x, n.z, { node: n.id, err: String(err) }); }
  if (j && j.poly.length > 2) J.set(n.id, j); }
const pip = (P, x, z) => { let ins = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const xa = P[a][0], za = P[a][1], xb = P[b][0], zb = P[b][1]; if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) ins = !ins; } return ins; };
const bb = (P) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; };
const jl = [...J.values()].map((j) => ({ j, b: bb(j.poly) }));
const jName = (j) => [...new Set(j.legs.map((l) => nm(l.edge)))].join(' x ');
for (let a = 0; a < jl.length; a++) for (let b = a + 1; b < jl.length; b++) { const A = jl[a], B = jl[b];
  if (A.b[2] < B.b[0] || B.b[2] < A.b[0] || A.b[3] < B.b[1] || B.b[3] < A.b[1]) continue;
  let n = 0, cx = 0, cz = 0; const x0 = Math.max(A.b[0], B.b[0]), x1 = Math.min(A.b[2], B.b[2]), z0 = Math.max(A.b[1], B.b[1]), z1 = Math.min(A.b[3], B.b[3]);
  for (let x = x0 + 0.25; x < x1; x += 0.5) for (let z = z0 + 0.25; z < z1; z += 0.5) if (pip(A.j.poly, x, z) && pip(B.j.poly, x, z)) { n++; cx += x; cz += z; }
  if (n * 0.25 > 4) add('overlap', cx / n, cz / n, { nodes: [A.j.node.id, B.j.node.id], m2: +(n * 0.25).toFixed(0), apart: +Math.hypot(A.j.node.x - B.j.node.x, A.j.node.z - B.j.node.z).toFixed(1), name: jName(A.j) + ' / ' + jName(B.j) }); }
for (const j of J.values()) { const legIds = new Set(j.legs.map((l) => l.edge.id));
  for (const L of j.legs) if (Math.max(L.tA, L.tB) > L.len * 0.48 + 0.5) add('short', j.node.x, j.node.z, { node: j.node.id, leg: L.edge.id, name: jName(j), legLen: +L.len.toFixed(1), returns: +Math.max(L.tA, L.tB).toFixed(1) });
  const P = j.poly; let worst = 0, wx = 0, wz = 0, we = null;
  for (let k = 0; k < P.length; k++) { const [x, z] = P[k];
    for (const B of near(x, z, 12)) { if (legIds.has(B.e.id) || !atGrade(B.e, (B.s0 + B.s1) / 2)) continue; const q = segDist(x, z, B), pen = B.e.width / 2 - 0.6 - q.d; if (pen > worst) { worst = pen; wx = x; wz = z; we = B.e; } } }
  if (worst > 0.3) add('curb', wx, wz, { node: j.node.id, name: jName(j), into: nm(we), edge: we.id, m: +worst.toFixed(1) }); }
// ---- 2b. r3-roads: raised at-grade junctions, junctions under a ramp, humps
{ const owned = new Set(); // same rule as src/world/miami/elevated/network.js: elevated edges >= 0.3 m in components that reach 1 m
  const ymax = (e) => (e.y && e.y.length ? Math.max(...e.y) : 0), elev = (e) => e && e.elevated && !e.terrain && e.pts.length >= 2 && ymax(e) >= 0.3;
  const seen = new Set();
  for (const e0 of E) { if (!elev(e0) || seen.has(e0.id)) continue; const comp = [], st = [e0.id]; seen.add(e0.id); let mx = 0;
    while (st.length) { const id = st.pop(), e = E[id]; comp.push(id); mx = Math.max(mx, ymax(e)); for (const n of [e.a, e.b]) for (const k of N[n].edges) if (elev(E[k]) && !seen.has(k)) { seen.add(k); st.push(k); } }
    if (mx >= 1.0) for (const id of comp) owned.add(id); }
  const ptAt = (e, s) => { const c = e.cum; let i = 1; while (i < c.length - 1 && c[i] < s) i++; const t = Math.max(0, Math.min(1, (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1))); return [e.pts[i - 1][0] + (e.pts[i][0] - e.pts[i - 1][0]) * t, e.pts[i - 1][1] + (e.pts[i][1] - e.pts[i - 1][1]) * t]; };
  for (const n of N) { if (!n || (n.edges || []).length < 3) continue; const legs = n.edges.map((k) => E[k]);
    if (!legs.some((e) => !e.bridge && !e.terrain)) continue; const yN = n.y || 0; if (yN >= 2.0) continue;
    const name = [...new Set(legs.map(nm))].join(' x ');
    if (yN > 0.3 && !n.terrain) { add('grade', n.x, n.z, { node: n.id, name, y: +yN.toFixed(1), note: 'a ramp runs through the junction' }); continue; }
    const W = Math.max(...legs.map((e) => e.width)), R = W / 2 + 3; let hit = null;
    for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) { const px = n.x + dx, pz = n.z + dz;
      for (const B of near(px, pz, 14)) { if (!owned.has(B.e.id)) continue; const q = segDist(px, pz, B); if (q.d > B.e.width / 2) continue; const y = yAt(B.e, q.s); if (y > 0.35 && y < 5.5) { hit = { e: B.e, y }; break; } }
      if (hit) break; }
    if (hit) add('blocked', n.x, n.z, { node: n.id, name, by: nm(hit.e), edge: hit.e.id, y: +hit.y.toFixed(1), note: 'junction surface dropped (ramp at ' + hit.y.toFixed(1) + ' m over it)' }); }
  for (const e of E) { if (!e || !owned.has(e.id) || e.bridge || !e.y || e.y.length < 3) continue; const y0 = e.y[0], y1 = e.y[e.y.length - 1], m = ymax(e);
    if (y0 < 0.3 && y1 < 0.3 && m > 0.3) { let at = 0; for (let i = 0; i < e.y.length; i++) if (e.y[i] === m) at = i; const [x, z] = ptAt(e, e.cum[at]);
      add('hump', x, z, { a: e.id, na: nm(e), y: +m.toFixed(1), note: 'street raised on walls without a crossing' }); } } }
// ---- 3. enclosed islands next to junctions (1 m raster around each junction node)
const R = 70, done = new Set();
for (const j of J.values()) { const n = j.node, gx0 = Math.floor(n.x - R), gz0 = Math.floor(n.z - R), W = 2 * R; const road = new Uint8Array(W * W);
  const segsN = [...near(n.x, n.z, R + 10)].filter((s) => atGrade(s.e, (s.s0 + s.s1) / 2));
  for (let gz = 0; gz < W; gz++) for (let gx = 0; gx < W; gx++) { const x = gx0 + gx + 0.5, z = gz0 + gz + 0.5; for (const s of segsN) if (segDist(x, z, s).d < s.e.width / 2 + 0.3) { road[gz * W + gx] = 1; break; } }
  for (const o of jl) if (Math.abs(o.j.node.x - n.x) < R + 40 && Math.abs(o.j.node.z - n.z) < R + 40) { const [x0, z0, x1, z1] = o.b; for (let x = Math.max(gx0, Math.floor(x0)); x <= Math.min(gx0 + W - 1, Math.ceil(x1)); x++) for (let z = Math.max(gz0, Math.floor(z0)); z <= Math.min(gz0 + W - 1, Math.ceil(z1)); z++) if (pip(o.j.poly, x + 0.5, z + 0.5)) road[(z - gz0) * W + (x - gx0)] = 1; }
  // flood from the window border: what is not reached is enclosed by carriageway
  const seen = new Uint8Array(W * W), st = []; for (let k = 0; k < W; k++) for (const c of [k, (W - 1) * W + k, k * W, k * W + W - 1]) if (!road[c] && !seen[c]) { seen[c] = 1; st.push(c); }
  while (st.length) { const c = st.pop(), x = c % W, z = (c / W) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= W || Z >= W) continue; const q = Z * W + X; if (!road[q] && !seen[q]) { seen[q] = 1; st.push(q); } } }
  for (let c0 = 0; c0 < W * W; c0++) { if (road[c0] || seen[c0]) continue; const comp = [c0]; seen[c0] = 1; let cx = 0, cz = 0, dmin = 1e9;
    for (let h = 0; h < comp.length; h++) { const c = comp[h], x = c % W, z = (c / W) | 0; cx += x; cz += z; dmin = Math.min(dmin, Math.hypot(gx0 + x - n.x, gz0 + z - n.z)); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= W || Z >= W) continue; const q = Z * W + X; if (!road[q] && !seen[q]) { seen[q] = 1; comp.push(q); } } }
    const area = comp.length, ix = gx0 + cx / area, iz = gz0 + cz / area, k = Math.round(ix / 4) + ':' + Math.round(iz / 4);
    if (area > 2 && area < 2500 && dmin < j.legs.reduce((m, l) => Math.max(m, l.hw), 0) + 30 && !done.has(k)) { done.add(k);
      let bld = false; for (const b of data.buildingsNear ? data.buildingsNear(ix, iz, 10) : []) { bld = true; break; }
      add('island', ix, iz, { node: n.id, name: jName(j), m2: area, building: bld || undefined }); } } }
for (const i of out.issues) out.counts[i.kind] = (out.counts[i.kind] || 0) + 1;
const jf = (() => { const k = process.argv.indexOf('--json'); return k > 0 ? process.argv[k + 1] : 'docs/v2/reports/junction-audit.json'; })();
fs.writeFileSync(path.resolve(GAME, jf), JSON.stringify(out, null, 1));
console.log('junctions', J.size, 'issues', JSON.stringify(out.counts), '->', jf);
const SHOW = process.argv.includes('--show') ? +process.argv[process.argv.indexOf('--show') + 1] : 80;
for (const i of out.issues.slice(0, SHOW)) console.log(i.kind.padEnd(8), String(i.x).padStart(8), String(i.z).padStart(8), JSON.stringify(Object.fromEntries(Object.entries(i).filter(([k]) => !['kind', 'x', 'z'].includes(k)))));
process.exit(0);
