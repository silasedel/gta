// (r2-veg) Lush Keys yards (lead review of the deck mock-up: "everything past the yard is lush and layered"). For every house lot in
// the Keys within 150 m of the camera, once its house colliders exist:
//  - foundation planting: shrub clusters hugging the house (free spots 1.2 m off a wall / porch / stilt collider), mixed sea grape,
//    round shrubs, hibiscus, bougainvillea, tropical beds
//  - 1-2 big canopy trees in the back corners when the lot has fewer than two trees (poinciana, gumbo / shade tree, rubber fig)
//  - understory and shade ground cover under every tree and palm standing in the lot (ferns, palmetto, tropical beds)
// Lot-line hedges and side-yard trees come from the countryside streamer (countryside.js lotHedges / lotTrees). Nico's own lot is
// r2-keys' (yard.data.js) and is skipped. Lots beyond 400 m are cleared again. ?vegyards=0 turns it off.
import * as THREE from 'three';
import { lots as houseLots } from '../setpieces/houses/lots.js';

const ON = typeof location === 'undefined' || !/[?&]vegyards=0\b/.test(location.search);
const NEAR = 150, FAR = 400;
const hh = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
const FOUND = ['green_shrub', 'bush_round', 'bush_round', 'hibiscus', 'tropical_bed', 'bougainvillea', 'bush_leafy', 'bougainvillea_b', 'bush_round'];
const CANOPY = ['poinciana_c', 'shade_tree', 'poinciana', 'rubber_fig', 'oak_pale_b'];
const UNDER = ['fern_clump', 'tropical_bed', 'fern_a', 'fern_b', 'tropical_bed'];

let _ray = null;
function hitH(game, x, z) { // height above the ground of the first collider over (x, z) (houses, fences, parked cars), or -1
  const W = game.world, R = game.RAPIER, C = game.city; if (!W || !R || !C) return -1;
  _ray ||= new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }); const g = C.groundHeightAt(x, z) || 0; _ray.origin = { x, y: g + 20, z };
  let hit = null; try { hit = W.castRay(_ray, 19.6, true, R.QueryFilterFlags.EXCLUDE_SENSORS); } catch (e) { return -1; }
  if (!hit) return -1; const sh = hit.collider?.shape?.type; if (sh === R.ShapeType.Cylinder || sh === R.ShapeType.Capsule || sh === R.ShapeType.Ball) return -1; // trunks / poles
  return 20 - (hit.timeOfImpact ?? hit.toi ?? 20);
}

// can a plant stand here? Only what really blocks: water, roads (trees 1.8 m off the edge, shrubs 0.5 m), paving, a structure
// overhead (house, roof, raised porch: a static collider > 1.6 m up) or a low deck / pad (0.25-0.9 m). Fences, yard sheets and lot
// setbacks do not block: hedges sit right on the property line.
export function plantable(game, x, z, tree = false) {
  const C = game.city, V = game.vegetation; if (!C) return false;
  if (C.isWater?.(x, z) || V?.blockedAt?.(x, z, tree ? 1.2 : 0.3)) return false;
  const e = C.roadGraph?.nearestEdge?.(x, z, {}, 20); if (e && e.dist - e.edge.width / 2 < (tree ? 1.8 : 0.5)) return false;
  let sf = ''; try { sf = String(C.surfaceAt?.(x, z) || ''); } catch (er) { /* */ }
  if (/asphalt|sidewalk|pavers|tile|pier|wood|building/.test(sf) || (tree && /concrete/.test(sf))) return false;
  for (const [dx, dz] of tree ? [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]] : [[0, 0]]) { const h = hitH(game, x + dx, z + dz); if (h > 1.6 || (h > 0.25 && h < 0.9)) return false; }
  return true;
}

export function createLotPlanting(game) {
  if (!ON || !houseLots?.near) return null;
  const done = new Map(), tries = new Map(), st = { lots: 0, plants: 0 }; let t = 0, nicoLot = undefined;
  function plant(l) {
    const V = game.vegetation, C = game.city, c = Math.cos(l.heading), s = Math.sin(l.heading), hw = l.w / 2, hd = l.d / 2, id = Math.abs(Math.round(l.x * 7.31 + l.z * 3.17));
    const W = (u, v) => [l.x + c * u + s * v, l.z - s * u + c * v], hs = [], put = (key, x, z, sc) => { const h = V.place(key, x, z, { model: key, s: sc }); if (h.item) { hs.push(h); st.plants++; } return !!h.item; };
    const taken = []; const free = (x, z, r) => !taken.some(([a, b, q]) => (a - x) ** 2 + (b - z) ** 2 < (r + q) ** 2);
    // foundation ring: free ground 1.2 m from a structure
    const cand = [];
    const occ = new Map(), occAt = (i, j) => { const k = i * 1000 + j; let o = occ.get(k); if (o === undefined) { const [x, z] = W(-hw + 1 + i * 1.2, -hd + 1 + j * 1.2); o = hitH(game, x, z); occ.set(k, o); } return o; }; // one ray per grid point (~250 per lot)
    for (let i = 0, u = -hw + 1; u <= hw - 1; u += 1.2, i++) for (let j = 0, v = -hd + 1; v <= hd - 1.5; v += 1.2, j++) { const [x, z] = W(u, v);
      if (occAt(i, j) > 0.4 || C.isWater?.(x, z)) continue;
      let near = false; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (occAt(i + di, j + dj) > 0.6) { near = true; break; }
      if (near && plantable(game, x, z)) cand.push([x, z, hh(id, u, v)]); }
    cand.sort((a, b) => a[2] - b[2]); let nf = 0;
    for (const [x, z, r] of cand) { if (nf >= 20) break; if (!free(x, z, 0.8)) continue; const k = FOUND[(r * 977 | 0) % FOUND.length]; if (put(k, x, z, 0.85 + r * 0.5)) { taken.push([x, z, 0.8]); nf++; } }
    // canopy trees in the back corners when the lot is thin on trees
    const cs = V.countryside, trees = cs?.treesNear ? cs.treesNear(l.x, l.z, Math.max(hw, hd)).filter((q) => houseLots.at(q.x, q.z) === l) : [];
    let nt = trees.length;
    for (const [k, [u, v]] of [[-1, -1], [1, -1], [-1, 0.2], [1, 0.2]].entries()) { if (nt >= 2) break; const [x, z] = W(u * (hw - 2.4), v < 0 ? -(hd - 2.4) : v * hd);
      if (!free(x, z, 2.2) || !plantable(game, x, z, true)) continue; const kk = CANOPY[(hh(id, k, 9) * 97 | 0) % CANOPY.length];
      if (put(kk, x, z, 0.95 + hh(id, k, 10) * 0.25)) { taken.push([x, z, 2.2]); trees.push({ x, z, palm: false }); nt++; } }
    // lot-line planting right on the property line (front behind the fence, both sides, the back): hedge runs with natural gaps,
    // sea grape clumps, bougainvillea climbing some fences
    for (const [li, [su, sv]] of [[0, 1], [-1, 0], [1, 0], [0, -1]].entries()) { const len = su ? l.d : l.w, n = Math.floor((len - 1) / 1.35);
      for (let k = 0; k <= n; k++) { const t = -len / 2 + 0.5 + k * 1.35, g = hh(id + li * 13, k >> 2, 41); if (g < 0.22) continue; // runs and gaps
        const u = su ? su * (hw - 0.45) : t, v = sv ? sv * (hd - 0.45) : t, [x, z] = W(u, v); if (!free(x, z, 0.5) || !plantable(game, x, z)) continue;
        const r = hh(id + li, k, 42), key = r < 0.55 ? 'bush_round' : r < 0.72 ? 'green_shrub' : r < 0.82 ? (li === 0 ? 'hibiscus' : 'bush_leafy') : r < 0.92 ? 'bougainvillea' : 'tropical_bed'; /* hedge runs mostly the light round shrub (244 tris; the dense green shrub is 14k) */
        if (put(key, x, z, 1.0 + hh(id + li, k, 43) * 0.45)) taken.push([x, z, 0.5]); } }
    // a canopy tree at a front corner, so the crown overhangs the street (Keys streets are tunnels of green)
    { const side = hh(id, 5, 51) < 0.5 ? -1 : 1; for (const sd of [side, -side]) { const [x, z] = W(sd * (hw - 1.6), hd - 1.6);
      if (!free(x, z, 1.8) || !plantable(game, x, z, true)) continue; if (put(['poinciana_c', 'shade_tree', 'poinciana', 'oak_pale_b'][(hh(id, sd, 52) * 4) | 0], x, z, 1.05 + hh(id, sd, 53) * 0.25)) { taken.push([x, z, 1.8]); trees.push({ x, z, palm: false }); break; } } }
    // understory / shade ground cover under every tree and palm in the lot
    for (const [i, q] of trees.entries()) { const n = 2 + (hh(id, i, 21) * 3 | 0);
      for (let k = 0; k < n; k++) { const a = hh(id, i * 7 + k, 22) * 6.283, d = (q.palm ? 0.9 : 1.5) + hh(id, i * 7 + k, 23) * 1.6, x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
        if (houseLots.at(x, z) !== l || !free(x, z, 0.6) || !plantable(game, x, z)) continue;
        if (put(UNDER[(hh(id, i, 24 + k) * 31 | 0) % UNDER.length], x, z, 0.8 + hh(id, i, 30 + k) * 0.5)) taken.push([x, z, 0.6]); } }
    st.lots++; return hs;
  }
  function update(dt, cam) {
    t += dt || 0; if (t < 1.5 || !cam || !game.vegetation?.place || !game.world) return; t = 0;
    const T = game.city?.terrain; if (!T?.isKeys) return;
    if (nicoLot === undefined && game.nicoHouse?.toWorld) { const p = game.nicoHouse.toWorld(new THREE.Vector3()); nicoLot = houseLots.at(p.x, p.z) || null; }
    for (const [lot, hs] of done) if (Math.hypot(lot.x - cam.position.x, lot.z - cam.position.z) > FAR) { for (const h of hs) h.remove(); done.delete(lot); }
    let n = 0; for (const l of houseLots.near(cam.position.x, cam.position.z, NEAR, [])) { if (done.has(l) || l === nicoLot || !T.isKeys(l.x, l.z)) continue;
      if (hitH(game, l.x, l.z) < 0 && hitH(game, l.x + 2, l.z) < 0 && (tries.set(l, (tries.get(l) || 0) + 1).get(l)) < 4) continue; /* the house's colliders are not in yet: retry a few passes */
      try { done.set(l, plant(l)); } catch (e) { done.set(l, []); } if (++n >= 2) break; } /* two lots per pass (no hitch) */
  }
  return { update, stats: () => ({ ...st, active: done.size }) };
}
