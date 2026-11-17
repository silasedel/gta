// Surfaces pass (overnight Nov 17): per-vertex road frame for the asphalt ribbons and the road paint.
// tilebuild sets the current road (frame, edge stations, lanes, class) before it emits a road's ribbon / markings; every vertex
// written into an attached batch then also records where it lies on that road:
//   aSrfA = (o: lateral offset from the road center line in m (+ = right of travel), s: arc length along the graph edge in m
//            (edge-global, so patterns run on across tile seams), hw: half width, lw: lane width)
//   aSrfB = (seed 0..1 per edge (0 = not on a road), sJA, sJB: edge stations of the junction mouths (wear fades into the junction),
//            cls: 0 Keys / rural lane, 1 minor, 2 secondary / tertiary, 3 main; +4 when the street is curbed (concrete gutter pan))
// The surface shaders (surfaceShaders.js) draw wheel paths, oil drip lines, lane paving joints, gutters, transverse cracks, and
// per-street / per-section pavement age from these. Vertices emitted while no road is set get seed 0 (world-space look only).

const NO_A = [0, 0, 0, 0], NO_B = [0, -1e5, 1e5, 1];

export function attachRoadChannel(batch) {
  if (!batch || batch._srf || typeof batch.vert !== 'function') return batch;
  const ch = { a: [], b: [], ctx: null, seg: 0 };
  batch._srf = ch;
  const v0 = batch.vert;
  batch.vert = function (x, y, z, nx, ny, nz, u, v, col) { push(ch, x, z); return v0.call(this, x, y, z, nx, ny, nz, u, v, col); };
  return batch;
}

// road: tilebuild road piece r; fr: polyFrame of the drawn profile; pe: pieceEnds(r) or null; ends: { a, b } local stations of
// junction mouths (null when that end is not a junction)
export function setRoad(batches, r, fr, pe, ends) {
  let ctx = null;
  if (r && fr && fr.length >= 2) {
    const total = Math.max(1, (r.lanesFwd || 0) + (r.lanesBack || 0)), lw = r.width / total;
    const kind = r.kind || '', lane = !!ends?.lane;
    const cls = lane ? 0 : /motorway|trunk|primary/.test(kind) ? 3 : /secondary|tertiary/.test(kind) ? 2 : 1;
    const curbed = !lane && (pe ? (pe.e?.sidewalk || 0) > 0 : !!r.sidewalks);
    const eid = r.edgeId ?? 0, s0 = pe ? pe.s0 || 0 : 0;
    const seed = 0.02 + (((eid * 2654435761) >>> 0) % 9973) / 9973 * 0.97;
    ctx = { fr, s0, hw: r.width / 2, lw, seed, cls: cls + (curbed ? 4 : 0),
      sJA: ends && ends.a != null ? ends.a + s0 : -1e5, sJB: ends && ends.b != null ? ends.b + s0 : 1e5 };
  }
  for (const b of batches) if (b && b._srf) { b._srf.ctx = ctx; b._srf.seg = 0; }
}

function push(ch, x, z) {
  const c = ch.ctx;
  if (!c) { ch.a.push(...NO_A); ch.b.push(...NO_B); return; }
  const fr = c.fr, n = fr.length - 1;
  // nearest segment: search around the last one first (ribbons emit in order), fall back to the whole polyline
  let best = -1, bd = Infinity, bt = 0;
  const test = (i) => { const A = fr[i], B = fr[i + 1], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - A.x) * dx + (z - A.z) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = A.x + dx * t, pz = A.z + dz * t, d = (x - px) * (x - px) + (z - pz) * (z - pz); if (d < bd) { bd = d; best = i; bt = t; } };
  const i0 = Math.max(0, ch.seg - 2), i1 = Math.min(n - 1, ch.seg + 2);
  for (let i = i0; i <= i1; i++) test(i);
  if (bd > (c.hw + 4) * (c.hw + 4)) for (let i = 0; i < n; i++) test(i);
  if (best < 0) { ch.a.push(...NO_A); ch.b.push(...NO_B); return; }
  ch.seg = best;
  const A = fr[best], B = fr[best + 1], t = bt;
  const px = A.x + (B.x - A.x) * t, pz = A.z + (B.z - A.z) * t, mnx = A.nx + (B.nx - A.nx) * t, mnz = A.nz + (B.nz - A.nz) * t;
  const m2 = mnx * mnx + mnz * mnz || 1, o = ((x - px) * mnx + (z - pz) * mnz) / m2; // in miter units, as the ribbon offsets were written
  const s = A.s + (B.s - A.s) * t + c.s0;
  ch.a.push(o, s, c.hw, c.lw); ch.b.push(c.seed, c.sJA, c.sJB, c.cls);
}

// after Batch.build: copy the channel into the mesh geometry (counts must match the position attribute)
export function applyRoadChannel(THREE, mesh, batch) {
  if (!mesh || !batch || !batch._srf) return false;
  const g = mesh.geometry, n = g.attributes.position.count, ch = batch._srf;
  if (ch.a.length !== n * 4) { console.warn('[surfaces] road channel count mismatch', ch.a.length / 4, n); fill(ch, n); }
  g.setAttribute('aSrfA', new THREE.Float32BufferAttribute(ch.a, 4));
  g.setAttribute('aSrfB', new THREE.Float32BufferAttribute(ch.b, 4));
  return true;
}
function fill(ch, n) { ch.a.length = Math.min(ch.a.length, n * 4); ch.b.length = Math.min(ch.b.length, n * 4); while (ch.a.length < n * 4) ch.a.push(...NO_A); while (ch.b.length < n * 4) ch.b.push(...NO_B); }
