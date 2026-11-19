// Utility covers (round 2, r2-roads, item 13): sanitary manholes, storm manholes, curb-inlet grates and water valve boxes from the
// user's library (tools/v2/roads/covers.sh -> public/assets/models/roads/*.glb), set flush in the asphalt at a realistic US density:
//   sanitary sewer manhole  on the street centerline (the main runs down the middle) every ~95-125 m, plus one near the middle of
//                           every curbed junction (where mains meet); each sits in a slightly darker utility-cut patch (settlement
//                           ring) drawn as an asphalt decal
//   curb inlet (storm)      in the gutter against the curb, just upstream of most curb-return tangents (corners collect the water)
//                           and at mid-block low points (~1 per 110 m per side)
//   storm manhole           now and then a few meters off a corner inlet (the junction box the inlets drain to)
//   water valve box         one or two per approach, a few meters behind the stop bar / crosswalk, a third of the way in from a curb
// Only on curbed (sewered) streets and town / city zones: no covers on rural roads, Keys lanes, dirt roads or decks.
// Stations are fixed to the graph edge, so every tile split gives the same covers. `?covers=0` = the old decal covers (A/B).
import * as THREE from 'three';
import { ladder } from '../ground/depthLadder.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const COVERS_OFF = typeof location !== 'undefined' && /[?&]covers=0\b/.test(location.search);
const BASE = '/assets/models/roads/';
const FILES = ['mh_sewer', 'mh_pack', 'mh_storm', 'inlet', 'valve'];
export const COVER_TOP = 0.0636; // cover top: over the asphalt (0.05) and its decals (0.062), under the paint (0.065)

let parts = null;
const ready = COVERS_OFF ? Promise.resolve(null) : (async () => {
  if (typeof window === 'undefined') return null;
  const gl = new GLTFLoader(), out = {};
  await Promise.all(FILES.map(async (f) => {
    try {
      const sc = (await gl.loadAsync(BASE + f + '.glb')).scene; sc.updateMatrixWorld(true);
      const gs = []; let mat = null;
      sc.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!/^(position|normal|uv)$/.test(k)) g.deleteAttribute(k); gs.push(g.index ? g.toNonIndexed() : g); mat = mat || o.material; } });
      if (!gs.length) return;
      const g = gs.length > 1 ? mergeGeometries(gs) : gs[0];
      const Pp = g.attributes.position, Nn = g.attributes.normal;
      if (f === 'inlet') { // the pack's drain sits rotated in its source file: turn its long axis onto local +X (the curb direction)
        let mx = 0, mz = 0; for (let i = 0; i < Pp.count; i++) { mx += Pp.getX(i); mz += Pp.getZ(i); } mx /= Pp.count; mz /= Pp.count;
        let cxx = 0, czz = 0, cxz = 0; for (let i = 0; i < Pp.count; i++) { const dx = Pp.getX(i) - mx, dz = Pp.getZ(i) - mz; cxx += dx * dx; czz += dz * dz; cxz += dx * dz; }
        g.translate(-mx, 0, -mz); g.rotateY(0.5 * Math.atan2(2 * cxz, cxx - czz)); }
      g.computeBoundingBox(); g.computeBoundingSphere();
      // seat height: the largest flat up-facing level in the upper half (the cover / collar top), not a small knob above it
      let seat = g.boundingBox.max.y; { const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, bins = new Map();
        for (let i = 0; i < Pp.count; i++) { if (Nn && Nn.getY(i) < 0.85) continue; const y = Pp.getY(i); if (y < y0 + (y1 - y0) * 0.45) continue; const b = Math.round(y / 0.002); bins.set(b, (bins.get(b) || 0) + 1); }
        let best = -1; for (const [b, n] of bins) if (n > best) { best = n; seat = b * 0.002 + 0.001; } }
      g.userData.lodMax = f === 'valve' ? 70 : 130; // flush and small: never drawn far away (the asphalt decal ring stays)
      const m = mat.clone(); m.name = 'cover-' + f;
      if (m.map) m.map.anisotropy = 8;
      m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; ladder(m, 'cover'); // never z-fights with the asphalt it sits in (W4: ground ladder rung over asphalt / junction / shoulder)
      if (m.metalness > 0.55) m.metalness = 0.55; // cast iron reads near-black without a street reflection probe
      m.roughness = Math.max(m.roughness ?? 0.6, f === 'inlet' ? 0.5 : 0.55);
      m.userData.cover = true;
      if (f === 'inlet') m.color.setRGB(0.5, 0.44, 0.4); // rust-orange pack texture -> weathered dark cast iron (one style with the other covers)
      out[f] = { geometry: g, material: m, top: seat, size: g.boundingBox.getSize(new THREE.Vector3()) };
    } catch (e) { console.warn('[covers] missing', f, e?.message); }
  }));
  parts = Object.keys(out).length ? out : null;
  return parts;
})();
export const covers = { ready, get parts() { return parts; } };

const SEWER_ZONE = /downtown|business|brickell|commercial|residential|nightlife|beach|park|industrial|port|airport|arts|edgewater|overtown|midtown/;
// h(n): hash in [0, 1). ctx: { r, pe, hw, lane, s0, s1, L (piece length), sample(sLocal) -> { x, z, dx, dz, nx, nz }, blocked(x, z), zoneAt(x, z),
//   decal(x, z, ax, az, len, wid, k) (utility-cut patch under a manhole) }
// Returns { items: { mh_sewer: [...], ... }, decals: n } with instance items { x, y, z, ry, color }.
export function placeCovers(ctx, h) {
  const P = parts; if (!P || COVERS_OFF) return null;
  const { r, pe, hw, lane, s0, s1, sample, blocked, zoneAt } = ctx;
  if (!pe || lane || r.surface === 'dirt' || /track|service|path|footway|motorway/.test(r.kind || '')) return null;
  const e = pe.e, curbed = (e && (e.sidewalk || 0) > 0) || !!r.sidewalks; if (!curbed) return null;
  const m = sample(Math.max(s0, Math.min(s1, (s0 + s1) / 2))), zn = String(zoneAt ? zoneAt(m.x, m.z) || '' : '');
  if (zn && !SEWER_ZONE.test(zn)) return null;
  const out = { mh_sewer: [], mh_pack: [], mh_storm: [], inlet: [], valve: [] }, eid = (r.edgeId ?? 0) + 1, base = pe.s0, LE = pe.LE;
  const H = (s, salt) => h(Math.floor(s * 1.7) * 92821 + eid * 7919 + salt);
  const tint = (k) => new THREE.Color().setScalar(k);
  const put = (part, sEdge, o, ry, k = 1) => { // sEdge: arc length on the graph edge from node A; o: lateral (+ = frame normal side)
    const P0 = P[part]; if (!P0) return null; const sl = sEdge - base; if (sl < s0 - 0.01 || sl > s1 + 0.01) return null;
    const q = sample(sl), nl = Math.hypot(q.nx, q.nz) || 1, x = q.x + q.nx / nl * o, z = q.z + q.nz / nl * o; if (blocked(x, z)) return null;
    const it = { x, y: COVER_TOP - P0.top, z, ry: ry ?? Math.atan2(-q.dz, q.dx), color: tint(k) }; out[part].push(it); const AL = (globalThis.__covers ||= []); if (AL.length < 3000) AL.push([part, +x.toFixed(1), +z.toFixed(1)]); return { it, q, x, z }; // review list
  };
  // stations clear of each junction's crosswalk / stop bar (mk) plus a margin
  const aEnd = pe.A ? pe.A.mk + 4 : 6, bEnd = LE - (pe.B ? pe.B.mk + 4 : 6);
  // sanitary sewer: centerline manholes every ~95-125 m (edge stations; first one offset by the edge id)
  const SP = 110, first = H(0, 1) * SP;
  for (let k = 0, s = aEnd + first * 0.6; s < bEnd; k++) {
    const sj = s + (H(k, 2) - 0.5) * 22;
    if (sj > aEnd && sj < bEnd) { const side = H(k, 3) < 0.5 ? -1 : 1, o = r.oneway ? (H(k, 4) - 0.5) * hw : side * (0.7 + H(k, 5) * 0.8);
      const got = put(H(k, 6) < 0.78 ? 'mh_sewer' : 'mh_pack', sj, o, H(k, 7) * 6.283, 0.82 + H(k, 8) * 0.2);
      if (got && ctx.decal) ctx.decal(got.x, got.z, got.q.dx, got.q.dz, 1.25 + H(k, 9) * 0.5, 1.15 + H(k, 10) * 0.45, 0.93 + H(k, 11) * 0.06); }
    s += SP + (H(k, 12) - 0.5) * 30;
  }
  // per junction end: curb inlets at the curb-return tangents, a valve box or two, the junction sewer manhole (once per junction)
  for (const [L, atB, J] of [[pe.A, false, pe.Ja], [pe.B, true, pe.Jb]]) {
    if (!L || !J) continue; const urbanJ = J.legs.some((l) => (l.sw || 0) > 0); if (!urbanJ) continue;
    const st = (d) => (atB ? LE - d : d), sideE = (side) => (atB ? -side : side); // leg frame -> edge frame
    for (const side of [-1, 1]) { const tan = side > 0 ? L.tB : L.tA, s = Math.max(tan, L.bar ? L.bar[1] : L.cw ? L.cw[1] : 0) + 1.2 + H(side * 5 + (atB ? 9 : 0), 20) * 1.5; // just past the return / stop bar
      if (H(side * 7 + (atB ? 3 : 0), 21) < 0.45 && s < LE * 0.45) { const got = put('inlet', st(s), sideE(side) * (hw - 0.36), undefined, 0.8 + H(side, 22) * 0.2);
        if (got && H(side * 11 + (atB ? 5 : 0), 23) < 0.25) put('mh_storm', st(s + 2.6), sideE(side) * (hw - 1.3), H(side, 24) * 6.283, 0.5 + H(side, 25) * 0.12); } }
    const nv = H(atB ? 31 : 37, 26) < 0.55 ? 1 : 0;
    for (let k = 0; k < nv + (L.ctrl === 'signal' ? 1 : 0); k++) { const side = H(k * 3 + (atB ? 1 : 0), 27) < 0.5 ? -1 : 1, s = (L.bar ? L.bar[1] : L.cw ? L.cw[1] : L.D) + 1.5 + H(k, 28) * 4; // on the approach behind the stop bar / crosswalk (no paint over the lid)
      if (s > 0.5 && s < LE * 0.45) put('valve', st(s), sideE(side) * hw * (0.35 + H(k, 29) * 0.25), H(k, 30) * 6.283, 0.8 + H(k, 31) * 0.2); }
    // junction manhole: the leg with the smallest edge id adds it, near the node center
    const minId = Math.min(...J.legs.map((l) => l.edgeId)); if (minId !== r.edgeId) continue;
    const n = J.node, hj = h(n.id * 7919 + 17), a = hj * 6.283, rr = 1.2 + hj * 2.2, x = n.x + Math.cos(a) * rr, z = n.z + Math.sin(a) * rr;
    if (!(atB ? base + (ctx.L ?? 0) > LE - 0.05 : base < 0.05)) continue; // only the piece that touches that node (one tile)
    const P0 = P.mh_sewer; if (P0) { out.mh_sewer.push({ x, y: COVER_TOP - P0.top, z, ry: hj * 40, color: tint(0.85 + hj * 0.15) }); if (ctx.decal) ctx.decal(x, z, Math.cos(a), Math.sin(a), 1.4, 1.3, 0.94); }
  }
  return out;
}
