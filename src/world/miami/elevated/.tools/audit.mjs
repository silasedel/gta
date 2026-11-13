// ELEVATED audit: every lane of every elevated chain, sampled every 25 cm on the lane centre and both wheel tracks:
// holes, steps (> 2 cm / > 5 cm), vertical kinks, collider vs heightAt mismatch, barriers / piers on the lane (car box sweep),
// ramp-foot transitions onto the street, plus structure checks (piers in roads, clearance, grades).
import fs from 'node:fs';
import { makeWorld } from './world.mjs';
import { P } from '../params.js';
const W = await makeWorld();
const { RAPIER, world, net, el, kind } = W;
const cnt = {}, ex = {}, allF = []; const bump = (k, x, z, info) => { cnt[k] = (cnt[k] || 0) + 1; allF.push([k, x, z, info && info[0]]); (ex[k] ||= []).length < 4000 && ex[k].push([+x.toFixed(1), +z.toFixed(1), info]); };
const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
function castDown(x, z, yTop) { ray.origin = { x, y: yTop, z }; const h = world.castRay(ray, 6, true); if (!h) return null; return { y: yTop - h.timeOfImpact, k: kind.get(h.collider.handle) }; }
const box = new RAPIER.Cuboid(0.95, 0.42, 2.2);
const quatYP = (yaw, pitch) => { const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(-pitch / 2), sp = Math.sin(-pitch / 2); return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp }; };
let nRay = 0, nBox = 0, maxStep = 0, maxStepAt = null, maxKink = 0;
const t0 = performance.now();
const F = {};
for (const c of net.chains) {
  if (c.s1 - c.s0 < 4) continue;
  const extA = c.endA === 'street' || c.endA === 'junction' ? 6 : 0, extB = c.endB === 'street' || c.endB === 'junction' ? 6 : 0;
  const mid = net.laneOffsets(c, c.n >> 1); const nL = mid.length;
  for (let k = 0; k < nL; k++) for (const track of [0, -0.85, 0.85]) {
    let prev = null, prev2 = null, skipStep = false;
    for (let s = c.s0 - extA + 0.3; s <= c.s1 + extB - 0.3; s += 0.25) {
      const sc = Math.max(0, Math.min(c.length, s)); net.framesAt(c, sc, F);
      const o = mid[k].o + track; if (Math.abs(mid[k].o) > F.hw - 1.0 + 1e-6 && Math.abs(mid[k].o) > 0.01) { prev = null; prev2 = null; continue; } // lane dropped here
      const beyond = s - sc; // extrapolate straight past the chain end (street)
      const x = F.x - F.tz * o + F.tx * beyond, z = F.z + F.tx * o + F.tz * beyond;
      const onDeck = s >= c.s0 && s <= c.s1;
      const yE = onDeck ? F.y + P.ROAD_Y + F.bank * o : P.ROAD_Y;
      nRay++; const h = castDown(x, z, yE + 1.6);
      if (!h || h.y < yE - 0.12) { bump('hole', x, z, [c.id, c.name, +s.toFixed(1), +yE.toFixed(2), h ? +h.y.toFixed(2) : null]); prev = null; continue; }
      if (h.k !== 'deck' && h.k !== 'street' && h.k !== 'ground') { bump('laneHits_' + h.k, x, z, [c.id, c.name, +s.toFixed(1)]); prev = null; continue; }
      if (onDeck && track === 0 && h.k === 'deck') { const hq = el.heightAt(x, z, yE); if (hq === null || Math.abs(hq - h.y) > 0.01) bump('heightAtMismatch', x, z, [c.id, hq, h.y]); }
      if (prev && h.k !== 'ground') {
        const d = prev2 ? Math.abs((h.y - prev.y) - (prev.y - prev2.y)) : Math.abs((h.y - prev.y) - (yE - prev.yE)); // step: change of the height increment between consecutive 25 cm samples
        const dd = Math.abs(h.y - prev.y);
        if (dd > maxStep) { maxStep = dd; maxStepAt = [x, z, c.id]; }
        if (skipStep) skipStep = false; else if (d > 0.05) { bump('step>5cm', x, z, [c.id, c.name, +s.toFixed(1), +(h.y - prev.y).toFixed(3)]); skipStep = true; } else if (d > 0.02) { bump('step>2cm', x, z, [c.id, c.name, +s.toFixed(1), +(h.y - prev.y).toFixed(3)]); skipStep = true; }
        if (prev2) { const kk = Math.abs(h.y - 2 * prev.y + prev2.y) / (0.25 * 0.25); if (kk > maxKink) maxKink = kk; if (kk > 0.25) bump('kink', x, z, [c.id, c.name, +s.toFixed(1), +kk.toFixed(3)]); }
      }
      if (h.k === 'ground') { prev = null; prev2 = null; continue; }
      prev2 = prev; prev = { y: h.y, yE };
    }
  }
  // car box sweep on each lane centre, 1 m spacing: barriers / piers intruding into the lane
  for (let k = 0; k < nL; k++) for (let s = c.s0 + 1; s <= c.s1 - 1; s += 1) {
    net.framesAt(c, s, F); const o = mid[k].o; if (Math.abs(o) > F.hw - 1.0 + 1e-6 && Math.abs(o) > 0.01) continue;
    const x = F.x - F.tz * o, z = F.z + F.tx * o, y = F.y + P.ROAD_Y + F.bank * o + 0.12 + 0.42;
    const pitch = Math.atan2(net.framesAt(c, Math.min(c.length, s + 1)).y - net.framesAt(c, Math.max(0, s - 1)).y, 2);
    nBox++; let hit = null;
    world.intersectionsWithShape({ x, y, z }, quatYP(Math.atan2(F.tx, F.tz), pitch), box, (col) => { const kd = kind.get(col.handle); if (kd !== 'deck' && kd !== 'street' && kd !== 'ground') { hit = kd; return false; } return true; });
    if (hit) bump('boxHit_' + hit, x, z, [c.id, c.name, +s.toFixed(1), k]);
  }
}
// streets under / next to the elevated network: a car-height box (2.0 m tall) along every lane of every non-owned street
{ const tall = new RAPIER.Cuboid(0.95, 1.0, 2.2); const G = W.data.roadGraph;
  const near = new Set(); for (const c of net.chains) for (let i = 0; i < c.n; i += 4) near.add(Math.floor(c.x[i] / 40) * 100000 + Math.floor(c.z[i] / 40));
  for (const e of G.edges) { if (net.own[e.id] || /footway|path|steps|pedestrian/.test(e.kind)) continue; const P0 = e.pts, tot = Math.max(1, e.lanesFwd + e.lanesBack), lw = e.width / tot;
    for (let i = 0; i < P0.length - 1; i++) { const [ax, az] = P0[i], [bx, bz] = P0[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue; const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let s = 0; s < L; s += 1.5) { const cx = ax + dx * s, cz = az + dz * s; if (!near.has(Math.floor(cx / 40) * 100000 + Math.floor(cz / 40))) continue;
        for (let k = 0; k < tot; k++) { const o = -e.width / 2 + lw * (k + 0.5), x = cx - dz * o, z = cz + dx * o; nBox++; let hit = null;
          world.intersectionsWithShape({ x, y: 0.05 + 0.15 + 1.0, z }, quatYP(Math.atan2(dx, dz), 0), tall, (col) => { const kd = kind.get(col.handle); if (kd !== 'street' && kd !== 'ground') { hit = kd; return false; } return true; });
          if (hit) bump('streetHit_' + hit, x, z, [-1, e.name || e.kind, e.id]); } } } } }
// structure checks
for (const p of net.piers) for (const [cx, cz] of p.cols) {
  const r = W.data.roadGraph.nearestEdge(cx, cz, {}, 30, (e) => !net.own[e.id]);
  if (r && r.dist < r.edge.width / 2 + p.r + 0.3) bump('pierInRoad', cx, cz, [p.chain, r.edge.name]);
}
let maxGrade = 0, gradeAt = null; for (const c of net.chains) for (let i = 1; i < c.n; i++) { const g = Math.abs(c.y[i] - c.y[i - 1]) / (c.s[i] - c.s[i - 1] || 1); if (g > maxGrade) { maxGrade = g; gradeAt = [c.id, c.name, c.x[i] | 0, c.z[i] | 0]; } if (g > 0.08) bump('grade>8%', c.x[i], c.z[i], [c.id, c.name, +g.toFixed(3)]); }
const out = { network: { chains: net.chains.length, ms: Math.round(net.ms), createMs: Math.round(W.tCreate), stats: net.stats, piers: net.piers.length, lamps: net.lamps.length }, worstTileStepMs: +W.worstStep.toFixed(1), worstTile: W.worstTile, rays: nRay, boxes: nBox, maxStep: +maxStep.toFixed(3), maxStepAt, maxKink: +maxKink.toFixed(3), maxGrade: +maxGrade.toFixed(3), gradeAt, counts: cnt, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
console.log(JSON.stringify(out, null, 1));
if (process.argv[2] === 'ex') { const cid = +process.argv[3]; for (const [k, l] of Object.entries(ex)) { const f = l.filter((e) => !process.argv[3] || (e[2] && e[2][0] === cid)); if (f.length) console.log(k, f.length, JSON.stringify(f.filter((_, i) => i % Math.ceil(f.length / 10) === 0))); } }
fs.writeFileSync(new URL('./last_audit.json', import.meta.url), JSON.stringify({ out, ex }));

// failure map (whole network) + per-cluster summary
{ const { Canvas } = await import('./png.mjs'); const B = W.data.bounds, Wd = 2400, sc = Wd / (B.maxX - B.minX), H = Math.ceil((B.maxZ - B.minZ) * sc), cv = new Canvas(Wd, H);
  for (const e of W.data.roadGraph.edges) { const P0 = e.pts; for (let i = 0; i < P0.length - 1; i++) cv.line((P0[i][0] - B.minX) * sc, (P0[i][1] - B.minZ) * sc, (P0[i + 1][0] - B.minX) * sc, (P0[i + 1][1] - B.minZ) * sc, net.own[e.id] ? [90, 110, 160] : [55, 55, 55]); }
  const colOf = { hole: [255, 0, 0], 'step>5cm': [255, 140, 0], 'step>2cm': [255, 220, 0], kink: [180, 180, 0], laneHits_barrier: [255, 0, 255], boxHit_barrier: [255, 0, 255], heightAtMismatch: [0, 255, 255], 'grade>8%': [0, 255, 0] };
  for (const [k, x, z] of allF) cv.dot((x - B.minX) * sc, (z - B.minZ) * sc, 2, colOf[k] || [255, 255, 255]);
  cv.save(process.env.SP + 'audit_map.png');
  const byChain = {}; for (const [k, x, z, cid] of allF) { const o = (byChain[cid] ||= { n: 0, k: {} }); o.n++; o.k[k] = (o.k[k] || 0) + 1; }
  const top = Object.entries(byChain).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
  for (const [cid, o] of top) { const c = net.chains[cid]; console.log(cid, c ? c.name + ' ' + c.kind + ' ' + c.x[0].toFixed(0) + ',' + c.z[0].toFixed(0) : '', JSON.stringify(o.k)); }
}
