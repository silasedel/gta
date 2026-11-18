// Library building models (the user's Models/*, converted by tools/v2/buildings/convert_v2.sh / models.json into
// public/assets/models/buildings/*.glb: meters, origin at the footprint center on the ground, front toward +Z, WebP textures,
// optional <name>_lod1.glb far LOD and <name>_col.glb collision mesh): placed on generated lots whose style, district and
// footprint fit a model.
//   pick(b, ...)     deterministic per building id and metadata only (works before the GLBs load), so the near, mid and far
//                    builders and the colliders all agree on which lots carry a model (those skip their procedural shell)
//   register(...)    any builder that meets a model lot records its instance (idempotent by building id): ground line from the
//                    terrain under the footprint (front door at the street-side ground, a concrete plinth down to the lowest corner)
//   collide(...)     the model's own collision mesh (walls, steps, porches, overhangs) into a tile collider batch
//   one InstancedMesh per (model, material, LOD, condition) per 900 m cell, filled every few frames with the instances in range
// Per-instance variation without extra draw calls: mirrored copies (text-free models), a facade tint / shade per instance
// (instanceColor), shader weathering keyed on the instance origin (rain streaks, splash-zone dirt, rust in the rough districts),
// per-building lit-window share and color at night. Rough districts (Overtown, Liberty City): rundown / abandoned variants.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { compileForGame, programsReady } from '../../core/pace.js';
import { calibrate, trackClone } from '../art/calibrate.js';

const BASE = '/assets/models/buildings/';
// w x d x h in model units (glTF x / z / y); k = meters per unit at real size; cls: which lots it may take.
// use: res | office | any (towers); rough: 0 never in Overtown/Liberty City, 1 allowed, 2 preferred there; mir: may be mirrored
// (no lettering); lod1: has a far LOD file; tint: facade shade family; wt: pick weight; only: district regex; not: district regex
export const LIB = {
  // ---- towers (h > 60 m) ----
  podium_tower: { w: 94.97, d: 94.97, h: 152.53, k: 1, lod1: 1, cls: 'tower', use: 'any', glow: 0.55, mir: 1, tint: 'glass' },
  slim_residential: { w: 66.66, d: 51.3, h: 162.49, k: 1, lod1: 1, cls: 'tower', use: 'res', glow: 0.55, mir: 1, tint: 'glass' },
  red_band_tower: { w: 59.28, d: 56.44, h: 105.81, k: 1, lod1: 1, cls: 'tower', use: 'office', glow: 0.5, mir: 1, tint: 'glass' },
  curved_glass_tower: { w: 34.53, d: 51.67, h: 169.81, k: 1, lod1: 1, cls: 'tower', use: 'office', glow: 0.45, wt: 0.45, mir: 1, tint: 'glass' },
  hotel_tower: { w: 67.65, d: 45.3, h: 150.24, k: 1, cls: 'tower', use: 'res', glow: 0.5, lod1: 1, mir: 1, tint: 'stone', wt: 1.3 },
  grid_tower: { w: 60.83, d: 96.85, h: 212, k: 1, lod1: 1, cls: 'tower', use: 'office', glow: 0.55, mir: 1, tint: 'glass' },
  deco_tower: { w: 56, d: 40, h: 122.47, k: 1, cls: 'tower', use: 'any', glow: 0.5, lod1: 1, mir: 1, tint: 'stone' },
  curved_res_tower: { w: 39.37, d: 100.04, h: 220, k: 1, cls: 'tower', use: 'res', glow: 0.5, lod1: 1, mir: 1, tint: 'stone', wt: 0.8 },
  concrete_tower: { w: 43.08, d: 29.28, h: 85.63, k: 1, cls: 'tower', use: 'any', glow: 0.35, mir: 1, tint: 'concrete', rough: 2, wt: 0.6 },
  ribbed_tower: { w: 69.55, d: 42.81, h: 104.99, k: 1, cls: 'tower', use: 'office', glow: 0.5, lod1: 1, mir: 1, tint: 'glass' },
  gold_crown_tower: { w: 60.99, d: 44.28, h: 138, k: 1, cls: 'tower', use: 'res', glow: 0.5, lod1: 1, mir: 1, tint: 'glass', wt: 1.2 },
  // ---- mid-rise blocks (12-60 m) ----
  old_brick_towers: { w: 24.73, d: 39.96, h: 40.05, k: 1, cls: 'mid', use: 'any', glow: 0.35, lod1: 1, mir: 1, tint: 'brick', rough: 2 },
  black_glass_14: { w: 43.2, d: 43.2, h: 50.21, k: 1, cls: 'mid', use: 'office', glow: 0.5, lod1: 1, mir: 1, tint: 'glass', not: 'Overtown|Liberty' },
  stepped_midrise: { w: 32, d: 33.29, h: 49.45, k: 1, cls: 'mid', use: 'any', glow: 0.45, mir: 1, tint: 'stone' },
  blue_glass_tower: { w: 59.91, d: 50.76, h: 56.11, k: 1, lod1: 1, beach: 1, cls: 'mid', use: 'any', glow: 0.5, mir: 1, tint: 'glass', not: 'Overtown|Liberty' },
  grid_block: { w: 32, d: 31.37, h: 23.76, k: 1, cls: 'mid', use: 'office', glow: 0.45, mir: 1, tint: 'stone', rough: 1 },
  angular_block: { w: 65.51, d: 56.62, h: 29.23, k: 1, cls: 'mid', use: 'office', glow: 0.45, mir: 1, tint: 'stone' },
  strip_office: { w: 15.12, d: 36.12, h: 14, k: 1, cls: 'mid', use: 'office', glow: 0.45, mir: 1, tint: 'glass' },
  green_apartment: { off: 1, w: 19.19, d: 21.93, h: 14.47, k: 1, beach: 1, cls: 'mid', use: 'res', glow: 0.3, lod1: 1, mir: 1, tint: 'paint', rough: 1, wt: 1.4 },
  fire_station: { w: 31.27, d: 23.61, h: 10.57, k: 1, gain: 2.1, not: 'Downtown|Brickell|Edgewater|Miami Beach|South Beach', lod1: 1, cls: 'mid', use: 'any', glow: 0.3, tint: 'brick', rough: 2, wt: 0.25 },
  // ---- shops and roadside (low) ----
  graffiti_shop: { w: 12.22, d: 15.7, h: 5.24, k: 1, cls: 'shop', glow: 0.3, tint: 'none', rough: 2, not: 'Downtown|Brickell|Edgewater|Miami Beach|South Beach|Coral Gables' }, // r2-art (QA 17): blank white wall, rusted door slabs and a lean-to roof over the sidewalk: rough-side only
  gun_shop: { w: 9, d: 12.29, h: 5.68, k: 1, lod1: 1, cls: 'shop', glow: 0.3, tint: 'brick', rough: 2, wt: 0.3 },
  stone_shop: { w: 13.64, d: 11.69, h: 8.64, k: 1, cls: 'shop', glow: 0.35, lod1: 1, tint: 'stone', not: 'Overtown|Liberty' },
  brick_shopfront: { off: 1, w: 6.32, d: 3.4, h: 3.69, k: 1, cls: 'shop', glow: 0.35, lod1: 1, tint: 'brick', rough: 1 },
  bookshop: { w: 5.2, d: 3.13, h: 7.48, k: 1, cls: 'shop', glow: 0.35, lod1: 1, tint: 'paint', not: 'Overtown|Liberty' },
  strip_diner: { w: 31.5, d: 11.2, h: 5.8, k: 1, lod1: 1, cls: 'shop', glow: 0.4, tint: 'paint', rough: 1, not: 'Downtown|Brickell' },
  motel: { off: 1 /* r2-art: 256 px textures over 4400 m2 (~7 px/m), below the bar; model requested */, w: 50.33, d: 42.64, h: 12.83, k: 1, cls: 'shop', glow: 0.35, lod1: 1, tint: 'none', rough: 1, not: 'Downtown|Brickell|Edgewater' },
  gas_station: { w: 48.41, d: 26.02, h: 10.56, k: 1, cls: 'shop', glow: 0.5, lod1: 1, tint: 'none', not: 'Downtown|Brickell|Edgewater|South Beach|Miami Beach' },
  // ---- houses ----
  brick_cottage: { w: 20.12, d: 16.12, h: 7.2, k: 1, cls: 'house', glow: 0.25, mir: 1, tint: 'brick' },
  blue_house: { w: 1596.02, d: 1739.36, h: 1652.04, k: 0.0062, lod1: 1, cls: 'house', glow: 0.25, mir: 1, tint: 'paint' },
  brick_duplex: { w: 10.2, d: 16.93, h: 8.03, k: 1, lod1: 1, cls: 'house', glow: 0.25, mir: 1, tint: 'brick', rough: 1 },
  blue_gable_house: { w: 9.84, d: 8.06, h: 7.06, k: 1, lod1: 1, cls: 'house', glow: 0.25, mir: 1, tint: 'paint', rough: 1 },
  ranch_house: { w: 8.14, d: 8.09, h: 3.99, k: 1, cls: 'house', glow: 0.25, mir: 1, tint: 'paint', rough: 1, wt: 1.3 },
  stilt_shack: { w: 0.77, d: 1.0, h: 0.67, k: 11, cls: 'stilt', glow: 0.2, mir: 1, tint: 'none' },
  // ---- industrial / port / airport ----
  factory_plant: { w: 51.93, d: 60, h: 42.6, k: 1, cls: 'ind', glow: 0.1, tint: 'brick', rough: 2 },
  factory_sewing: { w: 20.5, d: 27.4, h: 9.96, k: 1, lod1: 1, cls: 'ind', glow: 0.3, tint: 'brick', rough: 2 },
  garage_row: { w: 26.94, d: 4.9, h: 2.76, k: 1, lod1: 1, cls: 'ind', glow: 0, mir: 1, tint: 'none', rough: 2, wt: 0.6 },
  hangar_quonset: { w: 19.22, d: 27.44, h: 8.27, k: 1, lod1: 1, cls: 'hangar', glow: 0.15, tint: 'none', wt: 0.8 },
  hangar_arch: { w: 35.1, d: 54.64, h: 10.06, k: 1, lod1: 1, cls: 'hangar', glow: 0.15, mir: 1, tint: 'none' },
  hangar_long: { w: 45.16, d: 136.85, h: 14.96, k: 1, cls: 'hangar', glow: 0.15, mir: 1, tint: 'paint' },
  // ---- roof / wall clutter (procedural roofs and rough-side walls) ----
  roof_vents: { w: 2.72, d: 0.79, h: 0.12, k: 1, cls: 'clutter', glow: 0, tint: 'none' },
  roof_tank: { w: 4.83, d: 2.35, h: 1.83, k: 1, cls: 'clutter', glow: 0, tint: 'none' },
  util_cabinet: { w: 1.0, d: 0.44, h: 1.99, k: 1, cls: 'clutter', glow: 0, tint: 'none' },
  fire_escape: { w: 3.14, d: 9.12, h: 18.57, k: 1, cls: 'clutter', glow: 0, tint: 'none' },
  tarp_shack: { w: 6.62, d: 5.43, h: 2.66, k: 1, cls: 'clutter', glow: 0, tint: 'none', col: 1 },
  booth_ruin: { w: 2.72, d: 2.89, h: 2.12, k: 1, cls: 'clutter', glow: 0, tint: 'none', col: 1 },
  // ---- fixed sites ----
  casino_tower: { w: 117.4, d: 132.4, h: 64.4, k: 1, lod1: 1, cls: 'fixed', glow: 0.5, tint: 'none' },
  control_tower: { w: 23, d: 23, h: 90.17, k: 1, cls: 'fixed', glow: 0.4, lod1: 1, tint: 'none' },
  control_tower_sm: { w: 9.91, d: 9.91, h: 30, k: 1, cls: 'fixed', glow: 0.3, tint: 'none' },
  jet_bridge: { w: 4.55, d: 25.55, h: 9.21, k: 1, cls: 'fixed', glow: 0.2, tint: 'none' },
  airliner: { w: 34.38, d: 37.59, h: 11.79, k: 1, lod1: 1, cls: 'fixed', glow: 0.15, tint: 'none', desat: 1 }, // Plane 7 (livery blurred at intake), parked nose-in at the gates
};
const RANGE = { tower: 7000, fixed: 4000, mid: 4000, house: 1600, shop: 1600, stilt: 1600, ind: 2500, hangar: 3000, rlow: 1600, clutter: 450 }, CELL = 1500, LOD_D = 250;
const CHANCE = { tower: 0.55, mid: 0.5, house: 0.32, shop: 0.5, stilt: 0.3, ind: 0.55, hangar: 0.9, rlow: 0.42 }; // r2-art: mid / shop 0.42 / 0.4 -> 0.5 (calibrated library models carry more modeled detail than a procedural block)
const CLS_OK = { rlow: /^(house|shop|ind)$/ };
const MIRROR = false;
const ROUGH_D = /Overtown|Liberty City/;
// the Golden Palm Casino (stage 4 heist): one fixed site on a Miami Beach ocean block; lots under it are cleared
export const CASINO = { name: 'casino_tower', x: 2183, y: -2.3, z: -370, ry: -Math.PI / 2, s: 1 }; // y: the model's plaza sits 2.3 m below its lowest part // Miami Beach superblock, entrance faces Collins Ave (west)
// Miami International (layout.json airport, apron between the two runways), placed by hand: the terminal (synthetic lots that the
// procedural facade builder draws: glass curtain wall, canopy roof), the user's control tower and jet bridges at its gates, runway lights
export const AIRPORT = {
  // runway outlines (features.json areas a1 / a2): edge, threshold and approach lights are laid out from these
  runways: [[[-794.24, 636.31], [-789.76, 507.69], [-2054.76, 463.69], [-2059.24, 592.31]], [[-849.39, 1720.82], [-800.61, 1645.18], [-1977.61, 886.18], [-2026.39, 961.82]]],
  terminal: [ // footprints (x, z), heights: main hall, gate pier wing toward the access loop
    { id: -9101, ring: [[-1480, 1010], [-1220, 1010], [-1220, 1070], [-1480, 1070]], h: 21 },
    { id: -9102, ring: [[-1220, 1020], [-1172, 1020], [-1172, 1062], [-1220, 1062]], h: 13 },
  ],
  fixed: [
    { id: -9201, name: 'control_tower', x: -1060, z: 1075, ry: 0.6 },
    // jet bridges on the terminal's apron side (south face z = 1070), rotunda against the wall, cab toward the stands
    { id: -9211, name: 'jet_bridge', x: -1452, z: 1083.3, ry: 0 }, { id: -9212, name: 'jet_bridge', x: -1398, z: 1083.3, ry: 0 },
    { id: -9213, name: 'jet_bridge', x: -1344, z: 1083.3, ry: 0 }, { id: -9214, name: 'jet_bridge', x: -1290, z: 1083.3, ry: 0 },
    { id: -9215, name: 'jet_bridge', x: -1240, z: 1083.3, ry: 0 },
    // r2-art (QA 3): nose-in, one per gate, nose (local +Z) at the terminal with ry = PI; the fuselage's left side runs along the jet
    // bridge cab (centerline 4.3 m east of the bridge axis) and the forward left door meets the cab end (z ~1096): nose tip at z ~1090.5
    { id: -9221, name: 'airliner', x: -1452 + 4.3, z: 1109.3, ry: Math.PI }, { id: -9222, name: 'airliner', x: -1398 + 4.3, z: 1109.3, ry: Math.PI },
    { id: -9224, name: 'airliner', x: -1290 + 4.3, z: 1109.3, ry: Math.PI }, { id: -9225, name: 'airliner', x: -1240 + 4.3, z: 1109.3, ry: Math.PI },
  ],
};

const hash = (n) => { let x = Math.imul(n | 0, 2654435761) ^ (n >>> 13); x = Math.imul(x ^ (x >>> 16), 2246822507); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
const OFF = typeof location !== 'undefined' && /[?&]libmodels=0/.test(location.search);

function frame(ring) { // oriented box of a footprint (principal axes)
  let mx = 0, mz = 0; for (const [x, z] of ring) { mx += x; mz += z; } mx /= ring.length; mz /= ring.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of ring) { const dx = x - mx, dz = z - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const an = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(an), uz = Math.sin(an); let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, z] of ring) { const s = (x - mx) * ux + (z - mz) * uz, q = -(x - mx) * uz + (z - mz) * ux; a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, q); b1 = Math.max(b1, q); }
  const cs = (a0 + a1) / 2, cq = (b0 + b1) / 2; return { cx: mx + ux * cs - uz * cq, cz: mz + uz * cs + ux * cq, ux, uz, L: a1 - a0, W: b1 - b0 };
}
const areaOf = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };
// facade shade families (instanceColor multiplies the textures: kept near white so textures keep their look)
const TINTS = {
  glass: [[1, 1, 1], [0.93, 0.97, 1.02], [1.02, 1, 0.95], [0.9, 0.93, 0.95], [0.97, 1.02, 1.0]],
  stone: [[1, 1, 1], [1.04, 0.99, 0.92], [0.94, 0.94, 0.95], [1.03, 1.01, 0.97], [0.9, 0.88, 0.86]],
  concrete: [[1, 1, 1], [0.92, 0.92, 0.93], [1.04, 1.02, 0.98], [0.86, 0.86, 0.85]],
  brick: [[1, 1, 1], [0.93, 0.88, 0.86], [1.04, 0.98, 0.94], [0.88, 0.86, 0.85]],
  paint: [[1, 1, 1], [1.05, 0.97, 0.9], [0.93, 1.0, 1.04], [1.04, 1.03, 0.92], [0.96, 0.94, 1.04], [1.02, 0.95, 0.97]],
  none: [[1, 1, 1], [0.97, 0.97, 0.97], [1.02, 1.02, 1.0]],
};

export function createBuildingModels({ root, roadDist = null, districtAt = null, near = null, ground = null, argsOf = null }) {
  const entries = new Map(); // building id -> { name, x, y, z, ry, s, sy, cls, mir, var, col, plinth }
  const meshes = new Map(); // 'name|lod|mir|var' -> [{ geo, mat }]
  const cells = new Map(); // key + '|cx,cz' -> [{ p, im, cap }]
  const cols = new Map(); // name -> Float32Array triangle soup (model units) | null
  const nightU = { value: 0 };
  let tickFrame = -1, lastX = 1e9, lastZ = 1e9, dirty = true, lastT = 0;
  const group = new THREE.Group(); group.name = 'library-buildings'; root.add(group);
  const condOf = (b, d) => (ROUGH_D.test(d) ? (hash(((b.id | 0) % 2147483647) + 6101) < 0.18 ? 'a' : 'r') : '');

  // ---- selection ----
  function classOf(b, style, zone, d) {
    if (b.style === 'stilt') return 'stilt';
    if (b.style === 'hangar') return 'hangar';
    if ((style === 'glass' || style === 'band' || style === 'office') && b.h > 60 && (b.area || 0) > 700) return 'tower';
    if (style === 'house' && b.style === 'house' && b.h < 10 && (b.area || 0) > 45 && !/Star|Fisher|Key Biscayne|Virginia/.test(d)) return 'house';
    if ((style === 'warehouse' || b.style === 'industrial') && b.h < 45) return 'ind';
    if ((b.style === 'strip' || (b.style === 'lowrise' && /commercial|business|nightlife|downtown/.test(zone))) && b.h < 10 && zone !== 'beach') return 'shop';
    if ((style === 'office' || style === 'band' || style === 'glass' || style === 'deco') && b.h >= 11 && b.h <= 62 && (b.area || 0) > 200) return 'mid';
    if (ROUGH_D.test(d) && b.h < 12 && (b.area || 0) > 50) return 'rlow'; // walk-ups, corner stores and sheds of the rough side
    return null;
  }
  const picked = new Map(); // id -> result (near / mid / collider builders agree)
  function pick(b, style, zone) {
    if (OFF) return null;
    if (b._lib !== undefined) return b._lib;
    if (picked.has(b.id)) return (b._lib = picked.get(b.id));
    b._lib = null;
    if (b.kind === 'terminal' || !b.rings || b.rings.length !== 1 || b.part || b._passage || b._overlap || ((b.minH || 0) > 0.5 && b.style !== 'stilt')) return null;
    const d = districtAt ? districtAt(b.cx, b.cz) || '' : '';
    const cls = classOf(b, style, zone, d); if (!cls) return null;
    const seed = ((b.id | 0) % 2147483647) | 0, rough = ROUGH_D.test(d);
    if (hash(seed + 7771) > CHANCE[cls] * (rough && cls !== 'tower' ? 1.4 : 1)) return null;
    const ring = b.rings[0]; if (ring.length < 4) return null;
    const f = frame(ring); if (f.L < 4 || f.W < 2.8) return null;
    if (areaOf(ring) / (f.L * f.W) < (cls === 'tower' ? 0.8 : 0.72)) return null; // only near-rectangular lots (the model fills its box)
    const res = /residential|beach/.test(zone) || /apartments|hotel|residential/.test(b.kind || '');
    const cands = [];
    for (const [name, m] of Object.entries(LIB)) {
      if (m.cls !== cls && !(CLS_OK[cls] && CLS_OK[cls].test(m.cls))) continue;
      if (m.off) continue; // below the street-level bar (see the row comment): not placed
      if (rough && !m.rough) continue;
      if (m.not && new RegExp(m.not).test(d)) continue;
      if (m.only && !new RegExp(m.only).test(d)) continue;
      if (cls === 'mid' && (/beach|nightlife/.test(zone) || /South Beach|Miami Beach/.test(d)) && !m.beach) continue; // Ocean Drive / Collins keep their pastel deco: only beach-style mid-rises
      if ((cls === 'tower' || cls === 'mid') && ((m.use === 'res' && !res && hash(seed + 7791) < 0.75) || (m.use === 'office' && res && hash(seed + 7790) < 0.7))) continue;
      for (const rot of [0, 1]) {
        const mw = (rot ? m.d : m.w), md = (rot ? m.w : m.d); // model extents along the lot's u (long) and v axes
        const s = Math.min(f.L / mw, f.W / md) * 0.97;
        let sy = s, score;
        if (cls === 'tower') {
          const fill = (mw * s * md * s) / (f.L * f.W); if (fill < 0.55) continue;
          sy = Math.min(s * 1.4, Math.max(s * 0.85, b.h / m.h)); score = Math.abs(Math.log((b.h / m.h) / s)) + (1 - fill);
          if (m.h * sy < 55) continue;
        } else {
          const r = s / m.k, lo = cls === 'mid' ? 0.72 : 0.8, hi = cls === 'mid' ? 1.35 : cls === 'hangar' ? 1.6 : 1.3; if (r < lo || r > hi) continue;
          const fill = (mw * s * md * s) / (f.L * f.W); if (fill < (cls === 'hangar' ? 0.45 : 0.55)) continue;
          if (cls === 'mid') { sy = Math.min(s * 1.18, Math.max(s * 0.9, b.h / m.h)); }
          score = Math.abs(Math.log(r)) + Math.abs(Math.log((mw / md) / (f.L / f.W))) * 0.3 + (1 - fill) * 0.5 + (cls === 'mid' ? Math.abs(Math.log(b.h / (m.h * s))) * 0.3 : 0);
        }
        cands.push({ name, rot, s, sy, score });
      }
    }
    if (!cands.length) return null;
    // variety: any model that fits about as well as the best (one orientation each), weighted, never the same model as a
    // neighbor that already carries one (when every fitting model is next door, the best fit still goes: picks never depend
    // on which tiles happen to be loaded)
    cands.sort((a, c) => a.score - c.score);
    // neighbors with a smaller id choose first (memoized, so any load order gives the same city)
    const nbs = near ? near(b) : [];
    if (argsOf) for (const o of nbs) if (o._lib === undefined && (o.id | 0) < (b.id | 0)) { const ar = argsOf(o); if (ar) pick(o, ar[0], ar[1]); }
    const nbNames = new Set(nbs.map((o) => o._lib && o._lib.name).filter(Boolean));
    const seenN = new Set(), pool = [];
    for (const c0 of cands) { if (c0.score > cands[0].score + 0.6 || seenN.has(c0.name)) continue; seenN.add(c0.name); if (!nbNames.has(c0.name)) pool.push(c0); }
    if (!pool.length) pool.push(cands[0]);
    const wOf = (n) => (LIB[n].wt ?? 1) * (rough && LIB[n].rough === 2 ? 2 : 1);
    let wsum = 0; for (const c0 of pool) wsum += wOf(c0.name);
    let r = hash(seed + 7781) * wsum, c = pool[0]; for (const c0 of pool) { r -= wOf(c0.name); if (r <= 0) { c = c0; break; } }
    const m = LIB[c.name];
    // model +Z (its front) faces the nearest street
    const ax = c.rot ? [f.ux, f.uz] : [-f.uz, f.ux], ext = (c.rot ? m.w : m.d) * c.s / 2;
    let dir = 1;
    if (roadDist) { const dp = roadDist(f.cx + ax[0] * (ext + 5), f.cz + ax[1] * (ext + 5)), dn = roadDist(f.cx - ax[0] * (ext + 5), f.cz - ax[1] * (ext + 5)); dir = dp <= dn ? 1 : -1; }
    const fx = ax[0] * dir, fz = ax[1] * dir, ry = Math.atan2(fx, fz);
    const hw = m.w * c.s / 2, hd = m.d * c.s / 2, cr = Math.cos(ry), sr = Math.sin(ry);
    const corner = (lx, lz) => [f.cx + lx * cr + lz * sr, f.cz - lx * sr + lz * cr];
    const mir = MIRROR && m.mir && hash(seed + 7795) < 0.5 ? 1 : 0; // mirrored copies cost a second draw per material: off (tint + orientation vary instead)
    const t = TINTS[m.tint || 'none'], tc = t[(hash(seed + 7797) * t.length) | 0].map((v) => v * (m.gain || 1));
    b._lib = { name: c.name, cls, x: f.cx, z: f.cz, ry, s: c.s, sy: c.sy, h: m.h * c.sy, mir, cond: condOf(b, d), tint: tc, front: [fx, fz],
      rect: [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)] };
    picked.set(b.id, b._lib);
    return b._lib;
  }
  // ground line: the front door sits at the ground in front of it; where the lot falls away a plinth runs down to the lowest corner
  function seat(L, y0) {
    if (!ground || L._y !== undefined) return L._y ?? y0;
    let lo = Infinity, hi = -Infinity; for (const [x, z] of L.rect) { const g = ground(x, z); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    const m = LIB[L.name], fd = m.d * L.s / 2 + 1.2, gF = ground(L.x + L.front[0] * fd, L.z + L.front[1] * fd), gC = ground(L.x, L.z);
    lo = Math.min(lo, gC); hi = Math.max(hi, gC);
    let y = Math.min(hi, Math.max(lo, Number.isFinite(gF) ? gF : y0)) - 0.04;
    if (!Number.isFinite(y)) y = y0;
    L._y = Math.max(y, y0 - 0.2);
    if (L._y - lo > 0.1 && L.cls !== 'stilt') L.plinth = { y0: lo - 0.35, y1: L._y + 0.06 };
    return L._y;
  }
  function register(b, L, y = 0) {
    if (entries.has(b.id)) return entries.get(b.id).y;
    const yy = seat(L, y);
    entries.set(b.id, { name: L.name, cls: L.cls, x: L.x, y: yy, z: L.z, ry: L.ry, s: L.s, sy: L.sy, mir: L.mir, cond: L.cond || '', tint: L.tint, plinth: L.plinth, L }); dirty = true;
    return yy;
  }
  function addFixed(id, name, x, y, z, ry, s) { entries.set(id, { name, cls: LIB[name].cls, x, y, z, ry, s, sy: s, mir: 0, cond: '', tint: [1, 1, 1] }); dirty = true; }
  function has(id) { return entries.has(id); }
  function addClutter(key, name, x, y, z, ry, s = 1, sy = s) { if (OFF || entries.has(key)) return; entries.set(key, { name, cls: 'clutter', x, y, z, ry, s, sy, mir: 0, cond: '', tint: [1, 1, 1] }); dirty = true; }

  // ---- collision meshes (loaded up front: small, positions only) ----
  const loader = new GLTFLoader();
  async function loadCol(name) {
    try {
      const sc = (await loader.loadAsync(BASE + name + '_col.glb')).scene; sc.updateMatrixWorld(true); const out = [];
      sc.traverse((o) => { if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld); const a = g.attributes.position.array; for (let i = 0; i < a.length; i++) out.push(a[i]); });
      cols.set(name, new Float32Array(out));
    } catch (e) { cols.set(name, null); }
  }
  if (!OFF) for (const n of Object.keys(LIB)) if (LIB[n].cls !== 'clutter' || LIB[n].col) loadCol(n);
  // the model's collision mesh into a collider batch (vert(x,y,z,...) triangle soup); a box when it has not loaded (yet)
  const WHITE = new THREE.Color(0xffffff);
  function collide(coll, L, dy = 0) {
    const m = LIB[L.name], P = cols.get(L.name), y = (L._y ?? 0) + dy;
    const cr = Math.cos(L.ry), sr = Math.sin(L.ry), sx = (L.s / m.k) * (L.mir ? -1 : 1), sz = L.s / m.k;
    let sy = L.sy / m.k;
    // r2-physics: a collision mesh authored shorter than the drawn model (grid_tower: roof 112 m vs collider 101 m) is stretched to
    // the model's drawn height, so the roof you see is the roof you stand on
    if (P && P.length >= 9 && L.h > 0) { let top = P._top; if (top === undefined) { top = -Infinity; for (let i = 1; i < P.length; i += 3) top = Math.max(top, P[i]); P._top = top; }
      const colH = top * sy; if (colH > 1 && colH < L.h - 0.4) sy *= L.h / colH; }
    if (P && P.length >= 9) {
      for (let i = 0; i < P.length; i += 3) { const lx = P[i] * sx, ly = P[i + 1] * sy, lz = P[i + 2] * sz; coll.vert(L.x + lx * cr + lz * sr, y + ly, L.z - lx * sr + lz * cr, 0, 1, 0, 0, 0, WHITE); }
    } else {
      const r = L.rect, h = L.h;
      for (let i = 0; i < 4; i++) { const p = r[i], q = r[(i + 1) % 4]; const v = (x, yy, z) => coll.vert(x, yy, z, 0, 1, 0, 0, 0, WHITE);
        v(p[0], y, p[1]); v(q[0], y, q[1]); v(q[0], y + h, q[1]); v(p[0], y, p[1]); v(q[0], y + h, q[1]); v(p[0], y + h, p[1]); }
      const v = (p) => coll.vert(p[0], y + h, p[1], 0, 1, 0, 0, 0, WHITE); v(r[0]); v(r[2]); v(r[1]); v(r[0]); v(r[3]); v(r[2]);
    }
    if (L.plinth) { const r = L.rect, a = L.plinth.y0 + dy, b2 = L.plinth.y1 + dy; for (let i = 0; i < 4; i++) { const p = r[i], q = r[(i + 1) % 4]; const v = (x, yy, z) => coll.vert(x, yy, z, 0, 1, 0, 0, 0, WHITE); v(p[0], a, p[1]); v(q[0], a, q[1]); v(q[0], b2, q[1]); v(p[0], a, p[1]); v(q[0], b2, q[1]); v(p[0], b2, p[1]); } }
  }

  // ---- render meshes ----
  const glassy = /glass|window|pane|glazing/i;
  // close-up wall detail (the user's Concrete 3 / Plaster 1 scans, tools: baked by the buildings pass into one RGBA WebP:
  // rg = detail normal, b = concrete grain, a = plaster grain): world-aligned on walls within ~60 m, strongest at street level,
  // where many library models only carry 512 px - 1K textures
  const detailTex = typeof document !== 'undefined' ? new THREE.TextureLoader().load('/assets/textures/buildings/wall_detail.webp') : null;
  if (detailTex) { detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; detailTex.anisotropy = 8; detailTex.colorSpace = THREE.NoColorSpace; }
  const detailU = { value: detailTex };
  const matCache = new Map(); // source material -> variant -> material
  function variantMat(mat0, m, cond, name = '') {
    let vm = matCache.get(mat0); if (!vm) matCache.set(mat0, (vm = new Map()));
    if (vm.has(cond)) return vm.get(cond);
    const g = mat0.userData.libGlass ?? (mat0.userData.libGlass = glassy.test(mat0.name || '') || !!mat0.transparent); // first visit (the opaque variant flips .transparent)
    if (!mat0.userData.artCal) {
      // r2-art: one style for every library model (src/world/art/calibrate.js): exporter-default metalness 1 on masonry, 98 %
      // white marble, roughness 0 / 1 extremes and gray "glass" pulled into their class ranges; untagged materials of glass-skin
      // towers are never brightened (their dark facade texture IS the curtain wall)
      if (g && !mat0.map) mat0.color.lerp(new THREE.Color(0x6f7f8c), 0.6); // dielectric window glass, a little blue-gray (dark: the env reflection does the rest)
      mat0.envMapIntensity = g ? 1.3 : 0.8;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (mat0[k] && mat0[k].anisotropy < 8) { mat0[k].anisotropy = 8; mat0[k].needsUpdate = true; } // glTF default 1: facades smeared at street-level grazing angles
      calibrate(mat0, { hint: 'buildings/' + name, cls: g && !mat0.map ? 'glass' : m.tint === 'glass' && /facade|building|tower|body|curtain/i.test(mat0.name || '') ? 'building' : null, /* a glass tower's 'Building Facade' atlas IS its curtain wall: not stucco */ fallback: 'building', lift: m.tint !== 'glass' });
    }
    const mat = cond ? trackClone(mat0.clone(), mat0) : mat0;
    if (mat.transparent || mat.alphaMode === 'BLEND') { mat.transparent = false; mat.depthWrite = true; mat.opacity = 1; mat.alphaTest = mat.map ? 0.5 : 0; }
    mat.side = THREE.FrontSide;
    const glow = m.glow, rough = cond === 'r' ? 1 : cond === 'a' ? 2 : 0;
    const img = mat.map && mat.map.image, lowres = !!(img && Math.max(img.width || 0, img.height || 0) > 0 && Math.max(img.width, img.height) < 600 && !g); // tiny wall textures (275 px stucco): re-grained with the user's plaster scan
    // r2-art: a map stretched below ~110 px/m (texel density, whatever the file size: 2K window-grid atlases on a 60 m facade) keeps its
    // picture (windows) but gets the stronger street-level grain + detail normal, so close up it reads as material, not as blur
    const lowDens = !lowres && !g && !!img && mat0.userData.texelPx > 0 && mat0.userData.texelPx < 110;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLibNight = nightU; sh.uniforms.uLibDetail = detailU; sh.uniforms.uLibGlow = { value: glow }; // per-material value, shared program
      sh.vertexShader = 'varying vec3 vLibW; varying vec3 vLibN; varying vec3 vLibO;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vLibW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vLibO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vLibN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`);
      sh.fragmentShader = 'uniform float uLibNight; uniform float uLibGlow; uniform sampler2D uLibDetail;\nvarying vec3 vLibW; varying vec3 vLibN; varying vec3 vLibO;\nfloat libH(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\n'
        + 'float libN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = libH(vec3(i, 0.0)), b = libH(vec3(i + vec2(1.0, 0.0), 0.0)), c = libH(vec3(i + vec2(0.0, 1.0), 0.0)), d = libH(vec3(i + vec2(1.0, 1.0), 0.0)); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }\n'
        + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
  { // weathering keyed on the instance: rain streaks under ledges, splash-zone dirt at the base, blotches; more on the rough side
    float iS = libH(floor(vLibO * 0.37) + 3.1);
    float side = 1.0 - smoothstep(0.35, 0.7, abs(vLibN.y));
    vec2 wp = vec2((vLibW.x + vLibW.z) * 0.9 + iS * 40.0, vLibW.y);
    float streak = libN(vec2(wp.x * 2.3, wp.y * 0.12)); streak = streak * streak;
    float blot = libN(wp * 0.21 + 7.0);
    float base = smoothstep(${rough ? '2.2' : '1.3'}, 0.0, vLibW.y - vLibO.y) * (0.5 + 0.5 * libN(wp * vec2(1.7, 4.0)));
    float k = ${rough === 2 ? '0.55' : rough ? '0.38' : '0.16'} * (0.6 + 0.8 * iS);
    float dirt = side * clamp(streak * k + base * ${rough ? '0.42' : '0.22'} + (blot - 0.5) * k * 0.5, 0.0, 0.75);
    diffuseColor.rgb *= 1.0 - dirt * vec3(0.78, 0.84, 0.93);
    ${rough ? 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 0.82, 0.68), side * smoothstep(0.55, 0.85, libN(wp * vec2(0.6, 0.35) + 3.0)) * 0.6); // rust / tobacco stains' : ''}
    ${rough === 2 ? 'diffuseColor.rgb *= 0.86;' : ''}
    ${m.desat ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(0.92, 0.95, 1.0), 0.88); // real airline livery colors -> neutral gray stripes' : ''}
    float camD = distance(vLibW, cameraPosition), dK = (1.0 - smoothstep(30.0, 65.0, camD)) * side;
    if (dK > 0.001) {
      vec3 Tw = normalize(vec3(vLibN.z, 0.0, -vLibN.x) + vec3(1e-4, 0.0, 0.0));
      vec4 dt = texture2D(uLibDetail, vec2(dot(vLibW, Tw), vLibW.y) / ${lowres ? '1.3' : lowDens ? '1.8' : '2.4'});
      float street = 1.0 - smoothstep(4.5, 9.0, vLibW.y - vLibO.y), a = ${lowres ? 'dt.b' : 'mix(dt.b, dt.a, step(0.5, iS))'};
      ${lowres ? 'diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, vMapUv, 6.0).rgb * diffuseColor.rgb / max(texture2D(map, vMapUv).rgb, vec3(0.04)), 0.8 * dK);' : ''}
      diffuseColor.rgb *= 1.0 + (a - 0.5) * (${lowres ? '0.22' : lowDens ? '0.2' : '0.14'} + 0.2 * street) * dK;
      libDN = (dt.rg - 0.5) * 2.0 * dK * (${lowDens ? '0.5' : '0.35'} + 0.45 * street); libDT = Tw;
    }
  }`)
          .replace('void main() {', 'void main() {\n  vec2 libDN = vec2(0.0); vec3 libDT = vec3(1.0, 0.0, 0.0);')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  if (libDN.x != 0.0 || libDN.y != 0.0) normal = normalize(normal + (viewMatrix * vec4(libDT * libDN.x + vec3(0.0, 1.0, 0.0) * libDN.y, 0.0)).xyz * 0.55);')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uLibNight > 0.01) {
    // window cells along the facade (x+z) per floor; each building has its own lit share, color temperature and floor bias,
    // so neighbors never light the same grid
    float iS2 = libH(floor(vLibO * 0.37) + 9.7), iS3 = libH(floor(vLibO * 0.37) + 17.3);
    float cw = 2.6 + 1.2 * iS3;
    vec2 cellP = floor(vec2((vLibW.x + vLibW.z) / cw, (vLibW.y - vLibO.y) / 3.4));
    float hh = mix(libH(vec3(cellP, 1.0 + iS2)), libH(vec3(0.0, cellP.y, 3.0 + iS2)), 0.35 + 0.4 * iS3), lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    ${mat.map && !g ? 'lum = dot(texture2D(map, vMapUv, 3.0).rgb * diffuse, vec3(0.3, 0.55, 0.15));' : ''}
    float glassK = ${g ? '0.85' : '1.0 - smoothstep(0.14, 0.3, lum)'};
    float share = ${rough === 2 ? '0.0' : rough ? '0.12 + 0.12 * iS2' : '0.14 + 0.32 * iS2'};
    float gfl = 1.0 - step(4.6, vLibW.y - vLibO.y); // lobbies and shop floors stay lit in the evening (not on abandoned buildings)
    share = mix(share, ${rough === 2 || !g ? 'share' : '0.75'}, gfl); // only real glass materials (dark texels of masonry must not glow)
    float on = step(hh, share) * glassK * step(${g ? '0.4' : '2.5'}, vLibW.y - vLibO.y);
    vec3 wc = mix(vec3(1.0, 0.7, 0.42), vec3(0.8, 0.88, 1.0), step(0.62 - 0.3 * iS3, libH(vec3(cellP, 7.1))));
    wc *= 0.75 + 0.5 * libH(vec3(cellP, 11.0));
    totalEmissiveRadiance += wc * (on * 0.85 + glassK * 0.04 * (1.0 - float(${rough === 2 ? 1 : 0}))) * uLibNight * uLibGlow;
  }`);
    };
    mat.customProgramCacheKey = () => 'libbld5-' + (g ? 'g' : 'w') + '-' + rough + (m.desat ? 'd' : '') + (lowres ? 'l' : lowDens ? 'n' : '') + (mat.map ? 'm' : '');
    mat.needsUpdate = true;
    vm.set(cond, mat); return mat;
  }
  function mirrorGeo(g0) { // x -> -x with the winding flipped (front faces stay front faces; no double-sided materials)
    const g = g0.clone(); const p = g.attributes.position.array, n = g.attributes.normal ? g.attributes.normal.array : null;
    for (let i = 0; i < p.length; i += 3) p[i] = -p[i]; if (n) for (let i = 0; i < n.length; i += 3) n[i] = -n[i];
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
    else { const sw = (attr, k) => { const a = attr.array; for (let i = 0; i < a.length; i += 3 * k) for (let c = 0; c < k; c++) { const t = a[i + k + c]; a[i + k + c] = a[i + 2 * k + c]; a[i + 2 * k + c] = t; } }; for (const nm in g.attributes) sw(g.attributes[nm], g.attributes[nm].itemSize); }
    g.computeBoundingSphere(); return g;
  }
  const srcParts = new Map(); // 'name|lod' -> Promise<[{geo, mat}]>
  function loadParts(name, lod) {
    const key = name + '|' + lod; if (srcParts.has(key)) return srcParts.get(key);
    const m = LIB[name];
    const p = (async () => {
      try {
        const sc = (await loader.loadAsync(BASE + name + (lod ? '_lod1' : '') + '.glb')).scene; sc.updateMatrixWorld(true);
        const parts = [];
        sc.traverse((o) => { if (!o.isMesh) return; const mats = Array.isArray(o.material) ? o.material : [o.material];
          const g0 = o.geometry.clone(); g0.applyMatrix4(o.matrixWorld);
          if (mats.length === 1) parts.push({ geo: g0, mat: mats[0] });
          else for (const gr of g0.groups) { const g1 = g0.clone(); g1.setIndex(g0.index ? Array.from(g0.index.array.slice(gr.start, gr.start + gr.count)) : null); g1.clearGroups(); parts.push({ geo: g1, mat: mats[gr.materialIndex] }); } });
        const byMat = new Map(); for (const q of parts) { if (!byMat.has(q.mat)) byMat.set(q.mat, []); byMat.get(q.mat).push(q.geo); }
        const out = [];
        for (const [mat, geos] of byMat) { const geo = geos.length === 1 ? geos[0] : mergeGeos(geos); if (!geo) continue; geo.scale(m.k, m.k, m.k); geo.computeBoundingSphere(); out.push({ geo, mat });
          const tp = texelPx(geo, mat); if (tp && !(mat.userData.texelPx < tp)) mat.userData.texelPx = tp; } // r2-art: lowest texel density (px/m) this material is drawn at
        return out;
      } catch (e) { if (lod) return loadParts(name, 0); console.warn('[buildings] library model failed', name, e); return []; }
    })();
    srcParts.set(key, p); return p;
  }
  function ensure(key) { // key 'name|lod|mir|cond'
    if (meshes.has(key)) return; meshes.set(key, null);
    const [name, lod, mir, cond] = key.split('|');
    loadParts(name, +lod ? 1 : 0).then((parts) => {
      const P2 = parts.map((q) => ({ geo: +mir ? mirrorGeo(q.geo) : q.geo, mat: variantMat(q.mat, LIB[name], cond, name) }));
      // compile the programs off the frame (parallel compile, the game's HDR target and light set) before the first draw:
      // a model variant first seen mid-game (e.g. far LODs when the camera lifts) otherwise stalled a frame for seconds
      if (R && CAM) { const tmp = new THREE.Group(); for (const q of P2) { const im = new THREE.InstancedMesh(q.geo, q.mat, 1); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3); tmp.add(im); }
        let sc = group; while (sc.parent) sc = sc.parent;
        try { compileForGame(R, THREE, tmp, CAM, sc); } catch (e) { /* compiled on first draw instead */ }
        programsReady(R, 5000).then(() => { meshes.set(key, P2); dirty = true; }, () => { meshes.set(key, P2); dirty = true; });
      } else { meshes.set(key, P2); dirty = true; }
    });
  }
  // texel density of a material on a geometry (model meters): sqrt(uv area x map pixels / surface area), area-weighted
  function texelPx(g, mat) {
    const img = mat.map && mat.map.image, W = img && img.width, H = img && img.height, uv = g.attributes.uv, P = g.attributes.position;
    if (!W || !H || !uv || !P) return 0;
    const idx = g.index ? g.index.array : null, n = idx ? idx.length : P.count; let wa = 0, ua = 0;
    const st = Math.max(1, Math.floor(n / 3 / 3000)) * 3;
    for (let t = 0; t + 2 < n; t += st) {
      const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, c = idx ? idx[t + 2] : t + 2;
      const ax = P.getX(b) - P.getX(a), ay = P.getY(b) - P.getY(a), az = P.getZ(b) - P.getZ(a), bx = P.getX(c) - P.getX(a), by = P.getY(c) - P.getY(a), bz = P.getZ(c) - P.getZ(a);
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; const A = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
      const U = Math.abs((uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) - (uv.getX(c) - uv.getX(a)) * (uv.getY(b) - uv.getY(a))) / 2;
      if (A > 1e-6) { wa += A; ua += U; }
    }
    return wa > 0.5 ? Math.sqrt((ua * W * H) / wa) : 0;
  }
  function mergeGeos(geos) {
    const attrs = ['position', 'normal', 'uv']; let n = 0; for (const g of geos) n += (g.index ? g.index.count : g.attributes.position.count);
    const out = {}; for (const a of attrs) out[a] = new Float32Array(n * (a === 'uv' ? 2 : 3));
    let o = 0;
    for (const g of geos) { const idx = g.index ? g.index.array : null, cnt = idx ? idx.length : g.attributes.position.count;
      for (const a of attrs) { const src = g.attributes[a], k = a === 'uv' ? 2 : 3; if (!src) continue; for (let i = 0; i < cnt; i++) { const v = idx ? idx[i] : i; for (let c = 0; c < k; c++) out[a][(o + i) * k + c] = src.array[v * k + c]; } }
      o += cnt; }
    const g = new THREE.BufferGeometry(); for (const a of attrs) g.setAttribute(a, new THREE.BufferAttribute(out[a], a === 'uv' ? 2 : 3)); return g;
  }
  // plinths: one instanced box (concrete) for every lot whose ground falls away under the model
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x9c978e, roughness: 0.92, metalness: 0 });
  const plinth = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), plinthMat, 256); plinth.count = 0; plinth.castShadow = false; plinth.receiveShadow = true; plinth.name = 'lib-plinths'; plinth.frustumCulled = false; group.add(plinth);

  // ---- per-frame fill (driven by a tiny always-drawn mesh; cheap: only when the camera moved or entries changed) ----
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
  function nightOf(h) { return h >= 19.5 || h < 6 ? 1 : h > 18.6 ? (h - 18.6) / 0.9 : h < 7 ? 1 - (h - 6) : 0; }
  let R = null, CAM = null;
  function tick(renderer, cam) {
    R = renderer; CAM = cam;
    const fr = renderer.info.render.frame; if (fr === tickFrame) return; tickFrame = fr;
    const tod = globalThis.game && Number.isFinite(globalThis.game.timeOfDay) ? globalThis.game.timeOfDay : 12; nightU.value = nightOf(((tod % 24) + 24) % 24);
    const now = performance.now();
    const moved = Math.hypot(cam.position.x - lastX, cam.position.z - lastZ) > 25;
    if (!dirty && !moved && !fenceDirty) return; if (!moved && now - lastT < 250) return;
    lastX = cam.position.x; lastZ = cam.position.z; lastT = now; dirty = false;
    // instances grouped per model variant and 900 m cell: each cell's meshes get a tight bounding sphere, so off-screen cells
    // are culled in the main view and in the shadow passes; cells beyond LOD_D draw the far LOD
    const lists = new Map(); let np = 0;
    for (const e of entries.values()) {
      const r = RANGE[e.cls] || 400; if (Math.abs(e.x - lastX) > r || Math.abs(e.z - lastZ) > r) continue;
      const cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL);
      const ld = e.cls === 'tower' || e.cls === 'mid' || e.cls === 'fixed' ? LOD_D : LOD_D * 0.45; // per instance: towers keep full detail to ~250 m, houses / shops to ~110 m
      const dd = Math.hypot(e.x - lastX, e.z - lastZ), lod = LIB[e.name].lod1 && dd > ld ? (dd > 700 || e.cls !== 'tower' ? 2 : 1) : 0; // 1 = far LOD that still casts (towers to 700 m), 2 = far LOD without shadow
      const key = e.name + '|' + lod + '|' + (e.mir ? 1 : 0) + '|' + (e.cond || '');
      ensure(key);
      const k = key + '|' + cx + ',' + cz; if (!lists.has(k)) lists.set(k, []); lists.get(k).push(e);
      if (e.plinth && np < plinth.instanceMatrix.count && Math.abs(e.x - lastX) < 1600 && Math.abs(e.z - lastZ) < 1600) {
        const L = e.L, m = LIB[e.name], w = m.w * L.s - 0.1, d = m.d * L.s - 0.1, h = e.plinth.y1 - e.plinth.y0;
        Q.setFromAxisAngle(Y, e.ry); V.set(e.x, e.plinth.y0, e.z); S.set(w, h, d); M4.compose(V, Q, S); plinth.setMatrixAt(np++, M4);
      }
    }
    plinth.count = np; plinth.instanceMatrix.needsUpdate = true;
    if (fenceDirty || moved) { fenceDirty = false; fillFences(lastX, lastZ); }
    for (const [k, cm] of cells) if (!lists.has(k)) for (const p of cm) if (p.im) p.im.visible = false;
    for (const [k, L] of lists) {
      const key = k.slice(0, k.lastIndexOf('|')), parts = meshes.get(key); if (!parts || !parts.length) continue;
      const name = key.slice(0, key.indexOf('|')), m = LIB[name];
      let cm = cells.get(k); if (!cm) { cm = parts.map((p) => ({ p, im: null, cap: 0 })); cells.set(k, cm); }
      for (const c of cm) {
        if (L.length > c.cap) { if (c.im) { group.remove(c.im); c.im.dispose(); } c.cap = Math.max(4, 1 << Math.ceil(Math.log2(L.length))); c.im = new THREE.InstancedMesh(c.p.geo, c.p.mat, c.cap); c.im.castShadow = key.split('|')[1] !== '2'; /* past 700 m (towers) / the LOD distance (others): no shadow draw (a 1.5 km cell's bounds hit every cascade) */ c.im.receiveShadow = true; c.im.name = 'lib-' + name; c.im.userData.noDetailCull = true; c.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c.cap * 3).fill(1), 3); group.add(c.im); }
        L.forEach((e, i) => { Q.setFromAxisAngle(Y, e.ry); V.set(e.x, e.y, e.z); S.set(e.s / m.k, e.sy / m.k, e.s / m.k); M4.compose(V, Q, S); c.im.setMatrixAt(i, M4); const t = e.tint || [1, 1, 1]; C.setRGB(t[0], t[1], t[2]); c.im.setColorAt(i, C); });
        c.im.count = L.length; c.im.instanceMatrix.needsUpdate = true; c.im.instanceColor.needsUpdate = true; c.im.visible = true; c.im.computeBoundingSphere();
      }
    }
  }
  // a tiny always-drawn ticker so instances appear even before any library mesh exists
  const tk = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); tk.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -1e4, 0, 0, -1e4, 0, 0, -1e4, 0], 3));
  tk.frustumCulled = false; tk.name = 'library-buildings-ticker'; tk.onBeforeRender = (r, s, c) => tick(r, c); group.add(tk);
  const stats = () => { const o = {}; let draws = 0; for (const [k, cm] of cells) { const n = k.slice(0, k.indexOf('|')); o[n] = o[n] || { cells: 0, inst: 0, mats: cm.length }; if (cm[0].im && cm[0].im.visible) { o[n].cells++; o[n].inst += cm[0].im.count; draws += cm.length; } } return { entries: entries.size, plinths: plinth.count, draws, models: o }; };
  if (!OFF) for (const f of AIRPORT.fixed) addFixed(f.id, f.name, f.x, ground ? ground(f.x, f.z) || 0 : 0, f.z, f.ry, 1);
  // ---- runway lights: edge lights every 60 m (white), threshold bars (green / red ends), approach light bars; glow at night ----
  {
    const pts = [], col = [];
    const add = (x, z, c) => { pts.push(x, z); col.push(c); };
    for (const r of AIRPORT.runways) {
      let mx = 0, mz = 0; for (const [x, z] of r) { mx += x; mz += z; } mx /= 4; mz /= 4;
      const e0 = [r[1][0] - r[0][0], r[1][1] - r[0][1]], e1 = [r[2][0] - r[1][0], r[2][1] - r[1][1]], l0 = Math.hypot(...e0), l1 = Math.hypot(...e1);
      const [u, L, W] = l1 > l0 ? [[e1[0] / l1, e1[1] / l1], l1, l0] : [[e0[0] / l0, e0[1] / l0], l0, l1], v = [-u[1], u[0]];
      const P = (s, q) => [mx + u[0] * s + v[0] * q, mz + u[1] * s + v[1] * q];
      const hw = Math.min(W / 2, 30) + 1.5; // painted runway inside the cleared strip
      for (let s = -L / 2 + 10; s <= L / 2 - 10; s += 60) for (const q of [-hw, hw]) add(...P(s, q), 0);
      for (const e of [-1, 1]) {
        for (let q = -hw; q <= hw + 0.1; q += 4) add(...P(e * (L / 2 - 4), q), 1);
        for (let k = 1; k <= 6; k++) for (let q = -12; q <= 12.1; q += 3) add(...P(e * (L / 2 + k * 30), q), 2);
      }
    }
    const n = pts.length / 2, g = new THREE.CylinderGeometry(0.32, 0.4, 0.45, 8).translate(0, 0.22, 0); // fixture + lens glow: stays a few pixels wide from the terminal
    const COLS = [new THREE.Color(1, 0.92, 0.75), new THREE.Color(0.25, 1, 0.35), new THREE.Color(1, 0.95, 0.85)];
    const lm = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.5, metalness: 0.3 });
    lm.onBeforeCompile = (sh) => { sh.uniforms.uLibNight = nightU; sh.fragmentShader = 'uniform float uLibNight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor * (uLibNight * 14.0 + 0.6);').replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(vec3(0.6), diffuseColor.rgb, 0.0);'); };
    lm.customProgramCacheKey = () => 'libbld-rwylight';
    const im = new THREE.InstancedMesh(g, lm, n); im.name = 'runway-lights'; im.userData.noDetailCull = true; im.castShadow = false; im.receiveShadow = false;
    for (let i = 0; i < n; i++) { const x = pts[i * 2], z = pts[i * 2 + 1]; M4.makeTranslation(x, ground ? ground(x, z) || 0 : 0, z); im.setMatrixAt(i, M4); im.setColorAt(i, COLS[col[i]]); }
    im.computeBoundingSphere(); if (!OFF) group.add(im);
  }
  // ---- rough side: chain-link fences around the vacant overgrown lots (tile areas cls 'dirt' in Overtown / Liberty City) ----
  // panels 1.8 m on galvanized posts, inset 0.4 m into the lot, some panels missing (cut open) or leaning; one instanced draw
  // for the mesh (transparent, mip-mapped wire pattern: no alpha-test crawl) and one for the posts, city-wide
  const fences = new Map(); // tile key -> [{ x0, z0, x1, z1, lean }] panels
  const fenceTex = (() => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(176,180,178,1)'; x.lineWidth = 3.2; x.beginPath(); x.moveTo(0, 32); x.lineTo(32, 0); x.lineTo(64, 32); x.lineTo(32, 64); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(-32, 32); x.lineTo(0, 0); x.moveTo(64, 0); x.lineTo(96, 32); x.stroke();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d0, map: fenceTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.55, roughness: 0.45 });
  panelMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  #ifdef USE_INSTANCING\n  vMapUv *= vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz)) / 0.065;\n  #endif'); };
  panelMat.customProgramCacheKey = () => 'libbld-chainlink';
  const panelGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, 0.5, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9a9e9c, metalness: 0.6, roughness: 0.5 });
  const fencePanels = new THREE.InstancedMesh(panelGeo, panelMat, 4096), fencePosts = new THREE.InstancedMesh(postGeo, postMat, 4096);
  for (const m of [fencePanels, fencePosts]) { m.count = 0; m.frustumCulled = false; m.receiveShadow = true; group.add(m); } fencePosts.castShadow = true; fencePanels.name = 'rough-fence-mesh'; fencePosts.name = 'rough-fence-posts';
  let fenceDirty = false;
  function lotFences(tile) {
    if (OFF || !districtAt || !tile || tile.x0 === undefined) return null; const key = tile.x0 + ',' + tile.z0;
    if (fences.has(key)) return fences.get(key); const out = []; fences.set(key, out);
    for (const a of tile.areas || []) {
      if (a.cls !== 'dirt' || !a.rings || !a.rings[0] || a.rings[0].length < 3) continue; const r = a.rings[0];
      let cx = 0, cz = 0; for (const [x, z] of r) { cx += x; cz += z; } cx /= r.length; cz /= r.length;
      if (!ROUGH_D.test(districtAt(cx, cz) || '') || areaOf(r) > 4000 || areaOf(r) < 60) continue;
      const seed = (Math.round(cx * 7) * 73856093 ^ Math.round(cz * 7) * 19349663) | 0; if (hash(seed) < 0.15) continue; // a few lots stay open
      let open = (hash(seed + 1) * r.length) | 0; // one side has a cut-open gate
      for (let i = 0; i < r.length; i++) {
        const p = r[i], q = r[(i + 1) % r.length], ins = (pt) => { const dx = cx - pt[0], dz = cz - pt[1], l = Math.hypot(dx, dz) || 1; return [pt[0] + dx / l * 0.4, pt[1] + dz / l * 0.4]; };
        const A = ins(p), B = ins(q), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1.5) continue;
        const n = Math.max(1, Math.round(L / 3));
        for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, hk = hash(seed + i * 31 + k * 7 + 3);
          if ((i === open && k === (n >> 1)) || hk < 0.07) continue; // missing panel
          out.push({ x0: A[0] + (B[0] - A[0]) * t0, z0: A[1] + (B[1] - A[1]) * t0, x1: A[0] + (B[0] - A[0]) * t1, z1: A[1] + (B[1] - A[1]) * t1, lean: hk > 0.9 ? (hk - 0.9) * 2.2 : 0, h: 1.75 + hash(seed + i) * 0.15 }); }
      }
      const f = frame(r), h5 = hash(seed + 5), ry = hash(seed + 6) * 6.283; // squatter shack or an old concrete booth on some lots
      const nm = h5 < 0.3 && f.L > 9 && f.W > 8 ? 'tarp_shack' : h5 < 0.45 && f.L > 5 && f.W > 5 ? 'booth_ruin' : null;
      if (nm) { const o = { name: nm, x: f.cx + f.ux * (hash(seed + 7) - 0.5) * (f.L - 8), z: f.cz + f.uz * (hash(seed + 7) - 0.5) * (f.L - 8), ry }; (out.objs || (out.objs = [])).push(o);
        addClutter('lot' + seed, nm, o.x, ground ? ground(o.x, o.z) - 0.05 : 0, o.z, ry, 1); }
    }
    if (out.length) fenceDirty = true; return out;
  }
  const _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
  function fillFences(cx, cz) {
    let np = 0, nq = 0;
    for (const L of fences.values()) for (const f of L) {
      if (Math.abs(f.x0 - cx) > 700 || Math.abs(f.z0 - cz) > 700) continue; if (np >= fencePanels.instanceMatrix.count - 1 || nq >= fencePosts.instanceMatrix.count - 2) break;
      const dx = f.x1 - f.x0, dz = f.z1 - f.z0, len = Math.hypot(dx, dz), y0 = ground ? ground(f.x0, f.z0) || 0 : 0, ry = Math.atan2(-dz, dx);
      _e.set(f.lean, ry, 0, 'YXZ'); _q2.setFromEuler(_e); V.set(f.x0, y0 + 0.04, f.z0); S.set(len, f.h, 1); M4.compose(V, _q2, S); fencePanels.setMatrixAt(np++, M4);
      Q.identity(); S.set(1, f.h + 0.05, 1); V.set(f.x0, y0, f.z0); M4.compose(V, Q, S); fencePosts.setMatrixAt(nq++, M4);
      V.set(f.x1, y0, f.z1); M4.compose(V, Q, S); fencePosts.setMatrixAt(nq++, M4);
    }
    fencePanels.count = np; fencePosts.count = nq; fencePanels.instanceMatrix.needsUpdate = true; fencePosts.instanceMatrix.needsUpdate = true;
  }
  function colInstance(coll, name, x, y, z, ry, s = 1) { const P = cols.get(name); if (!P) return; const cr = Math.cos(ry), sr = Math.sin(ry);
    for (let i = 0; i < P.length; i += 3) { const lx = P[i] * s, ly = P[i + 1] * s, lz = P[i + 2] * s; coll.vert(x + lx * cr + lz * sr, y + ly, z - lx * sr + lz * cr, 0, 1, 0, 0, 0, WHITE); } }
  function fixedCollide(coll, x0, z0, size) { // fixed sites (casino, airport tower, jet bridges, parked airliners): their collision meshes, absolute y
    for (const e of entries.values()) if (e.cls === 'fixed' && e.x >= x0 && e.x < x0 + size && e.z >= z0 && e.z < z0 + size) colInstance(coll, e.name, e.x, e.y, e.z, e.ry, e.s / LIB[e.name].k);
  }
  function fenceCollide(coll, tile, relief = false) { // thin wall per standing panel (missing panels stay open); relief tiles: y relative (the collider builder lifts it)
    const L = lotFences(tile); if (!L) return;
    for (const o of L.objs || []) colInstance(coll, o.name, o.x, relief || !ground ? -0.05 : ground(o.x, o.z) - 0.05, o.z, o.ry);
    for (const f of L) { if (f.lean) continue; const y0 = relief || !ground ? 0 : ground(f.x0, f.z0) || 0, y1 = y0 + f.h, v = (x, y, z) => coll.vert(x, y, z, 0, 1, 0, 0, 0, WHITE);
      v(f.x0, y0, f.z0); v(f.x1, y0, f.z1); v(f.x1, y1, f.z1); v(f.x0, y0, f.z0); v(f.x1, y1, f.z1); v(f.x0, y1, f.z0); }
  }
  // audit: library lots by class / model, plinths, fence panels, clutter (node tools/v2/buildings/probe.mjs --js ...)
  function audit() { const cls = {}, mdl = {}; let fp = 0, lots = 0; for (const e of entries.values()) { cls[e.cls] = (cls[e.cls] || 0) + 1; mdl[e.name] = (mdl[e.name] || 0) + 1; }
    const sample = []; for (const L of fences.values()) { fp += L.length; if (L.length && sample.length < 5) sample.push([+L[0].x0.toFixed(1), +L[0].z0.toFixed(1)]); lots++; }
    return { entries: entries.size, byClass: cls, byModel: mdl, fencePanels: fp, fenceTiles: lots, fenceSamples: sample, plinths: [...entries.values()].filter((e) => e.plinth).length }; }
  const api = { pick, register, addFixed, addClutter, has, audit, collide, lotFences, fenceCollide, fixedCollide, stats, entries, group, LIB };
  globalThis.__libBuildings = api; // debugging / audits: __libBuildings.stats(), .entries
  return api;
}
