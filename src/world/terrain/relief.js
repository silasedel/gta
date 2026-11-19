// Micro-relief (r2-ground, item 17): the gentle, sculpted unevenness a level artist would paint into open ground: broad swells,
// small mounds and dips, meandering drainage lows (where rain collects) and grassy roadside swales with a slight bank, on top of
// the map's 16 m terrain grid. It is folded into data.terrainHeightAt itself (src/world/miami/data.js), so the terrain mesh,
// its colliders, groundHeightAt, tile props, houses, trees and NPC feet all read the same heights.
// Flat where things are built: zero on and next to roads, buildings, sidewalks, piers, paved / sports covers, set-piece claims
// (Nico's lot: r2-keys sculpts that yard sheet itself), shores and water, and in real Miami; weak in towns and residential lots.
// Deterministic (pure function of x, z) and cheap per call: 4 m samples, computed on first use and cached (bilinear lookup).
//   withRelief(baseHeightAt, ctx) -> heightAt        ctx: { surfAt, coverAt, zoneAt, roadEdge, isWater, inReal, setpieces }
//   heightAt.relief(x, z) -> the relief part alone (m); heightAt.lowAt(x, z) -> 0..1 drainage-low strength (puddles)
// Default OFF; ?relief=1 turns it on (A/B).
import { groundClaims } from '../ground/claims.js';

const OFF = typeof location === 'undefined' || !/[?&]relief=1\b/.test(location.search); // OFF by default until every placement reads the same heights (lead, 11:xx): ?relief=1 turns it on
const BUILT = new Set(['asphalt', 'concrete', 'pavers', 'tile', 'wood', 'metal', 'sidewalk', 'pier', 'building', 'water']);
const FLAT_COVER = new Set(['parking', 'plaza', 'marina', 'pool', 'paved', 'apron', 'runway', 'taxiway', 'pitch', 'playground', 'construction', 'campground']);
const COVER_W = { golf: 0.6, cemetery: 0.3, garden: 0.5, farmland: 0.35, grove: 0.6, park: 0.8, grass: 0.8, sand: 0.6, dune: 1.2, sawgrass: 0.45, wetland: 0.3, mangrove: 0.2 };
const ZONE_W = { rural: 1, wilderness: 1, park: 0.75, residential: 0.4, beach: 0.45, causeway: 0.25, airport: 0 }; // airports agent (Nov 19): an airfield is graded flat (runways, taxiways and aprons are drawn by src/world/airport on y = ground)
const SWALE_Z = { rural: 1, wilderness: 1, residential: 0.7, park: 0.5, causeway: 0.6, beach: 0.3 };
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];

const hash = (x, z) => { let h = Math.imul((x * 73856093) ^ (z * 19349663), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
function vn(x, z) { const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }
const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function withRelief(base, ctx) {
  if (OFF || !ctx || typeof base !== 'function') return base;
  const CS = 4;
  let claims = null;
  const stats = { chunks: 0, ms: 0 }; // chunks = 4 m samples computed
  // slow-varying weights on a 16 m grid (zone, cover, built ground and shore within ~20 m), cached: [relief weight, swale weight, residential]
  const WG = 16, cW = new Map(), D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function weightAt(i, j) {
    const key = i * 1048576 + j; let r = cW.get(key); if (r) return r;
    const x = i * WG, z = j * WG; r = [0, 0, 0];
    (() => {
      if (ctx.inReal(x, z)) return;
      const zn = ctx.zoneAt(x, z); let w = ZONE_W[zn] ?? 0; if (!w) return; r[2] = zn === 'residential' ? 1 : 0;
      const cv = ctx.coverAt(x, z); if (FLAT_COVER.has(cv)) return; w *= COVER_W[cv] ?? 1;
      let built = BUILT.has(ctx.surfAt(x, z)) ? 0 : 1; // built ground within ~12 m: fades out
      for (const rr of [5, 11]) { if (!built) break; for (const [dx, dz] of D8) if (BUILT.has(ctx.surfAt(x + dx * rr, z + dz * rr))) { built = rr < 6 ? 0 : 0.35; break; } if (built < 1) break; }
      if (!built) return;
      let shore = 1; for (const rr of [6, 13, 22]) { if (D8.some(([dx, dz]) => ctx.isWater(x + dx * rr, z + dz * rr))) { shore = rr < 7 ? 0 : rr < 14 ? 0.2 : 0.55; break; } }
      r[0] = w * built * shore; r[1] = (SWALE_Z[zn] || 0) * built * shore;
    })();
    if (cW.size > 200000) cW.clear();
    cW.set(key, r); return r;
  }
  // relief (m) and drainage-low strength at one 4 m sample point
  function sample(x, z, out) {
    out[0] = 0; out[1] = 0;
    if (ctx.inReal(x, z) || ctx.isWater(x, z) || BUILT.has(ctx.surfAt(x, z))) return;
    for (const [dx, dz] of D4) if (BUILT.has(ctx.surfAt(x + dx * 3, z + dz * 3))) return; // right next to a building / slab / pier: flat
    const fi = x / WG, fj = z / WG, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const A = weightAt(i, j), B = weightAt(i + 1, j), C = weightAt(i, j + 1), D = weightAt(i + 1, j + 1);
    const bl = (k) => (A[k] * (1 - u) + B[k] * u) * (1 - v) + (C[k] * (1 - u) + D[k] * u) * v;
    let k = bl(0), sw = bl(1); if (k <= 0.002 && sw <= 0.002) return;
    if (!claims) claims = groundClaims(ctx.setpieces ? ctx.setpieces() : []);
    if (claims.at(x, z, 5)) return; if (claims.at(x, z, 16)) { k *= 0.25; sw *= 0.25; }
    const e = ctx.roadEdge(x, z, 40); // meters from the nearest road's edge (40 = none near)
    if (e < 2) return;
    const rr = ss(2.5, bl(2) > 0.5 ? 24 : 15, e);
    // shapes: broad swells (~70 m), mounds and dips (~22 m), small lumps (~9 m), meandering drainage lows (valley lines of a ridged noise)
    const big = (vn(x / 70 + 11.3, z / 70 - 4.1) * 0.65 + vn(x / 31 - 2.2, z / 31 + 7.9) * 0.35 - 0.5) * 0.5;
    const mid = (vn(x / 21 + 5.5, z / 21 + 1.3) - 0.5) * 0.26;
    const sml = (vn(x / 8.5 - 9.1, z / 8.5 + 3.7) - 0.5) * 0.08;
    const vl = 1 - Math.abs(2 * vn(x / 46 + 3.1 + vn(x / 120, z / 120) * 1.5, z / 46 - 1.7) - 1), low = Math.pow(vl, 5);
    let h = (big + mid + sml - low * 0.2) * k * rr;
    // roadside swale: a shallow grassy ditch ~6.5 m off the edge with a slight bank toward the road (varies along the road)
    if (sw > 0.002 && e < 14) { const sd = (0.08 + 0.16 * vn(x / 37 + 1.1, z / 37 - 6.3)) * sw * ss(2.2, 4, e); h -= sd * Math.exp(-(((e - 6.5) / 2.1) ** 2)); out[1] = Math.max(out[1], ss(0.1, 0.2, sd) * Math.exp(-(((e - 6.5) / 1.4) ** 2))); }
    out[0] = h; out[1] = Math.max(out[1], low * k * rr * ss(0.35, 0.7, low));
  }
  // sparse cache of 4 m samples (a lone query costs 4 samples, a terrain tile reuses its neighbors' samples)
  const _o = [0, 0], cH = new Map(), cL = new Map();
  function at(i, j, low) {
    const key = i * 1048576 + j; let v = cH.get(key);
    if (v === undefined) { const t0 = performance.now(); try { sample(i * CS, j * CS, _o); } catch (e) { _o[0] = 0; _o[1] = 0; if (!stats.err) { stats.err = String(e); console.warn('[relief] sample failed, flat here', e); } }
      if (cH.size > 400000) { cH.clear(); cL.clear(); }
      v = _o[0]; cH.set(key, v); cL.set(key, _o[1]); stats.chunks++; stats.ms += performance.now() - t0; }
    return low ? cL.get(key) : v;
  }
  function lookup(x, z, low) {
    const fx = x / CS, fz = z / CS, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (at(i, j, low) * (1 - u) + at(i + 1, j, low) * u) * (1 - v) + (at(i, j + 1, low) * (1 - u) + at(i + 1, j + 1, low) * u) * v;
  }
  const relief = (x, z) => (ctx.inReal(x, z) ? 0 : lookup(x, z, false));
  const heightAt = (x, z) => { const b = base(x, z); try { return ctx.inReal(x, z) ? b : b + lookup(x, z, false); } catch (e) { return b; } }; // fail-safe: flat
  heightAt.relief = relief;
  heightAt.lowAt = (x, z) => (ctx.inReal(x, z) ? 0 : lookup(x, z, true));
  heightAt.reliefStats = stats;
  return heightAt;
}
