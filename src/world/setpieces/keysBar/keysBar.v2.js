// KEYS-BAR track: places "Low Tide Lola's" (see keysBar.js) on Key Paloma.
// No world coordinates are hard-coded here: the anchor (position and heading) is read at load, and the bar with its lot is one
// self-contained group in local coordinates placed on that anchor, so it follows the map when the layout is redrawn.
// Spot: layout.setpieces.keys_bar from public/assets/world/layout.json when present; otherwise a roadside lot found
// beside the Overseas Highway a little past layout.setpieces.keys_sign. If the layout file or the Keys land is not
// there yet, nothing is placed (game.keysBarLayoutSpot keeps the wanted spot) and the game carries on.
// game.keysBar = { group, position, heading, name, anchors (world space), interact (world space), lights, stats() }.
// Emits 'keysBar:ready' { position, heading, anchors }.
import * as THREE from 'three';
import { buildKeysBar } from './keysBar.js';
export const order = 72;
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
const toWorld = (sp, lx, lz) => { const c = Math.cos(sp.heading), s = Math.sin(sp.heading); return [sp.x + lx * c + lz * s, sp.z - lx * s + lz * c]; };

function fits(game, sp) {
  const city = game.city; if (!city) return false;
  try {
    const y0 = city.groundHeightAt?.(sp.x, sp.z) ?? 0;
    for (const [lx, lz] of [[0, 0], [0, -9], [0, 16], [-19, 3], [19, 3], [-14, -7], [14, -7], [-14, 13], [14, 13]]) { const [x, z] = toWorld(sp, lx, lz); if (city.isWater?.(x, z)) return false; const h = city.groundHeightAt?.(x, z); if (h != null && Math.abs(h - y0) > 0.9) return false; }
    const ne = city.roadGraph?.nearestEdge?.(sp.x, sp.z, null, 80); if (!ne) return false;                      // no road nearby: the Keys are not in the loaded world yet
    const [bx, bz] = toWorld(sp, 0, -3); const nb = city.roadGraph.nearestEdge(bx, bz, null, 30); if (nb && nb.dist < (nb.edge?.width || 8) / 2 + 9) return false;   // the building itself must be clear of any road
    for (const b of city.buildings || []) if (Math.abs(b.x - sp.x) < (b.w || 10) / 2 + 20 && Math.abs(b.z - sp.z) < (b.d || 10) / 2 + 18) return false;
    return true;
  } catch (e) { return false; }
}
// The layout spot is a lot center; streets and buildings authored later can end up inside the lot. Slide the bar along
// its own axes (smallest move first) until the yard footprint is clear of roads, buildings and water.
const FOOT = [[0, 3], [16, 3], [-16, 3], [12, 12], [-12, 12], [12, -6], [-12, -6], [0, 15], [0, -9], [6, 14], [-6, 14], [8, 3], [-8, 3], [15, 9], [-15, 9]];
function clear(game, sp) {
  const city = game.city, G = city.roadGraph, B = city.buildings || [];
  for (const [lx, lz] of FOOT) { const [x, z] = toWorld(sp, lx, lz); if (city.isWater?.(x, z)) return false; const ne = G?.nearestEdge?.(x, z, null, 30); if (ne && ne.dist < (ne.edge?.width || 7) / 2 + 1.5) return false; for (const b of B) if (Math.abs(b.x - x) < (b.w || 10) / 2 + 1.5 && Math.abs(b.z - z) < (b.d || 10) / 2 + 1.5) return false; }
  return true;
}
function settle(game, sp) {
  try {
    if (!game.city?.roadGraph?.nearestEdge || clear(game, sp)) return sp;
    const tries = []; for (let dx = -18; dx <= 18; dx += 2) for (let dz = -10; dz <= 6; dz += 2) tries.push([Math.abs(dx) + Math.abs(dz) * 1.2, dx, dz]);
    tries.sort((a, b) => a[0] - b[0]);
    for (const [, dx, dz] of tries) { const [x, z] = toWorld(sp, dx, dz), c = { ...sp, x, z, moved: [dx, dz] }; if (clear(game, c)) return c; }
  } catch (e) { /* keep the layout spot */ }
  return { ...sp, crowded: true };
}
function findSpot(game, L) {
  // setpieces may be an array of { id, x, z, heading } or an object keyed by id; position may be x/z, position or pos
  const raw = L?.setpieces ?? L?.data?.setpieces, get = (id) => { const e = Array.isArray(raw) ? raw.find((s) => s?.id === id) : raw?.[id]; if (!e) return null; const p = e.position ?? e.pos ?? e.at, x = Number(e.x ?? p?.x ?? p?.[0]), z = Number(e.z ?? p?.z ?? p?.[p?.length === 3 ? 2 : 1]); return Number.isFinite(x) && Number.isFinite(z) ? { x, z, heading: Number(e.heading ?? e.rotation ?? 0) || 0 } : null; };
  const own = get('keys_bar');
  if (own) return settle(game, { ...own, from: 'layout' });
  const sign = get('keys_sign'); if (!sign) return null;
  const h = sign.heading || 0, tx = -Math.sin(h), tz = -Math.cos(h), rx = -tz, rz = tx;          // traffic direction past the sign, and its right-hand side
  let first = null;
  for (const [side, off] of [[1, 20], [1, 26], [-1, 40], [-1, 46]]) for (let along = 70; along <= 330; along += 20) {
    const sp = { x: sign.x + tx * along + rx * side * off, z: sign.z + tz * along + rz * side * off, heading: Math.atan2(-rx * side, -rz * side), from: 'near keys_sign' };
    first = first || sp; if (fits(game, sp)) return sp;
  }
  return { ...first, wanted: true };
}

export async function initV2(game) {
  let L = null; try { const r = await fetch(BASE + 'assets/world/layout.json'); if (r.ok) L = await r.json(); } catch (e) { /* not written yet */ }
  const spot = findSpot(game, L);
  if (!spot) { console.info('[keys-bar] no layout spot (layout.json or setpieces.keys_sign missing); not placed'); return; }
  if (spot.wanted || (spot.from === 'layout' && game.city?.isWater?.(spot.x, spot.z))) { console.info('[keys-bar] no clear land beside the highway in the loaded world yet; not placed'); game.keysBarLayoutSpot = spot; return; }
  const bar = buildKeysBar(THREE, { assetBase: BASE, design: game.design || null, vegetation: game.vegetation || null, anisotropy: game.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8, timeOfDay: game.timeOfDay ?? 12 });
  const y = Math.max(0, game.city?.groundHeightAt?.(spot.x, spot.z) ?? 0);
  bar.group.position.set(spot.x, y, spot.z); bar.group.rotation.y = spot.heading; bar.group.updateMatrixWorld(true); game.scene.add(bar.group);
  const { world, RAPIER } = game, q = new THREE.Quaternion(), v = new THREE.Vector3(), W = (p) => v.set(p[0], p[1], p[2]).applyMatrix4(bar.group.matrixWorld).toArray();
  let made = 0;
  try { game.sand?.addArea?.({ name: 'keys_bar', x: spot.x, z: spot.z, heading: spot.heading, rx: 19, rz: 15.5, cz: 3.2, y: y + 0.04, exclude: [-4.7, 7.7, -7.5, 3.4] }); } catch (e) { /* footprints stay off on this lot */ }
  for (const c of bar.colliders) {
    try {
      v.set(c.x, c.y, c.z).applyMatrix4(bar.group.matrixWorld); q.setFromEuler(new THREE.Euler(0, spot.heading + (c.ry || 0), 0));
      const d = c.type === 'cyl' ? RAPIER.ColliderDesc.cylinder(c.hh, c.r) : RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz);
      world.createCollider(d.setTranslation(v.x, v.y, v.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })); made++;
    } catch (e) { /* visual only */ }
  }
  try { for (const l of bar.lights) { const p = W(l.pos); game.env?.lamps?.add?.(p[0], p[1], p[2], { color: l.color, intensity: l.intensity * 4, range: l.range * 1.6, gy: y }); } } catch (e) { /* */ }
  const mapA = (a) => ({ ...a, pos: W(a.pos), heading: (a.heading || 0) + spot.heading, route: a.route?.map(([lx, lz]) => toWorld(spot, lx, lz)) });
  const anchors = { patrons: bar.anchors.patrons.map(mapA), staff: bar.anchors.staff.map(mapA), perches: bar.anchors.perches.map(mapA), parking: bar.anchors.parking.map(mapA) };
  const interact = bar.interact.map((i) => ({ ...i, pos: W(i.pos) }));
  const local = new THREE.Vector3(), people = [];
  let peopled = false;
  game.updaters.push((dt) => {
    const P = game.player?.position; if (!P || P.distanceToSquared(bar.group.position) > 400 * 400) return;
    // first time the player comes near: a few locals at the standing spots (the NPC system fills the seated anchors later)
    if (!peopled && P.distanceToSquared(bar.group.position) < 160 * 160 && game.peds?.spawnAt) { peopled = true; for (const a of anchors.patrons.filter((a) => /^(dance|chat|rail[01])/.test(a.id))) { try { const p = game.peds.spawnAt(new THREE.Vector3(a.pos[0], a.pos[1], a.pos[2]), { heading: a.heading, anchor: a, pose: a.pose, idle: true, venue: 'keys_bar' }); if (p) people.push(p); } catch (e) { /* the ped system decides */ } } }
    local.copy(P); bar.group.worldToLocal(local);
    bar.update(dt, { night: game.env?.nightFactor, timeOfDay: game.timeOfDay, playerLocal: local, wind: game.env?.wind?.strength });
  });
  if (spot.moved) console.info('[keys-bar] layout lot is crossed by a road or building; bar moved by', spot.moved, 'm (local x, z)'); if (spot.crowded) console.warn('[keys-bar] layout lot is crossed by a road or building and no clear spot was found nearby');
  game.keysBar = { people, moved: spot.moved || null, crowded: !!spot.crowded, group: bar.group, position: bar.group.position, heading: spot.heading, name: bar.name, from: spot.from, anchors, interact, lights: bar.lights, colliders: made, stats: bar.stats, brandsUsed: bar.brandsUsed };
  game.emit?.('keysBar:ready', { position: bar.group.position, heading: spot.heading, anchors });
}
