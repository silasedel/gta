// KEYS-SIGN track: places the "Welcome to the Keys" set piece. Uses layout.setpieces.keys_sign from
// public/assets/world/layout.json (heading = the way the board faces) when the world-layout track has written it;
// until then it stands at a temporary roadside spot on Watson Island so it can be seen and tested in the game.
// game.keysSign = { group, position, perches (world), scatterBirds(), temporary }.  Emits 'keysSign:birdsScatter'.
import * as THREE from 'three';
import { buildKeysSign, loadKeysSignTextures } from './keysSign.js';
export const order = 70;
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

// Is there room for the set piece on the right-hand shoulder at this road point, for traffic heading (dx, dz)?
function roomAt(game, p, dx, dz, width) {
  const city = game.city, G = city.roadGraph, rx = -dz, rz = dx, off = width / 2 + 5.2, cx = p.x + rx * off, cz = p.z + rz * off;
  for (const [a, b] of [[0, 0], [9, 0], [-4, 0], [4, 12], [4, -12], [8, 30], [8, -30], [-3, 14], [-3, -12]]) {
    const x = cx + rx * a - dx * b, z = cz + rz * a - dz * b; if (city.isWater(x, z)) return null;
    const ne = G.nearestEdge(x, z, null, 30); if (ne && a >= 0 && ne.dist < ne.edge.width / 2 + 0.5) return null;
  }
  for (const b of city.buildings || []) if (Math.abs(b.x - cx) < b.w / 2 + 15 && Math.abs(b.z - cz) < b.d / 2 + 15) return null;
  return { x: cx, z: cz, heading: Math.atan2(-dx, -dz) };
}
function temporarySpot(game) {
  const G = game.city.roadGraph, pref = [/MacArthur Causeway/, /Parrot Jungle|Watson/, /Biscayne Boulevard|Alton Road/];
  for (const re of pref) for (const e of G.edges) {
    if (!re.test(e.name || '') || e.elevated || e.bridge || /_link|service/.test(e.kind) || e.length < 70) continue;
    for (let s = 35; s < e.length - 35; s += 15) { const p = G.pointAt(e, s, {}), c = roomAt(game, p, p.dx, p.dz, e.width); if (c) return { ...c, temporary: true }; }
  }
  return null;
}
// Snap the layout spot to the nearest clear right-hand shoulder for traffic driving into the Keys (south-west).
function snapToRoad(game, L) {
  const G = game.city.roadGraph, into = [-0.95, 0.32];
  const ne = G.nearestEdge(L.x, L.z, null, 150, (e) => !/_link|service|residential|track|living/.test(e.kind)); if (!ne) return null;
  const e = ne.edge; let best = null, near = null;
  for (let k = 0; k <= 30; k++) for (const sd of k ? [1, -1] : [1]) { // slide along the highway, nearest first
    const s = ne.s + sd * k * 10; if (s < 5 || s > e.length - 5) continue;
    const p = G.pointAt(e, s, {}), sg = p.dx * into[0] + p.dz * into[1] >= 0 ? 1 : -1, dx = sg * p.dx, dz = sg * p.dz;
    if (!near) { const off = e.width / 2 + 5.2; near = { x: p.x - dz * off, z: p.z + dx * off, heading: Math.atan2(-dx, -dz), dd: 0, tight: true }; }
    const c = roomAt(game, p, dx, dz, e.width); if (c) { best = { ...c, dd: k * 10 }; break; }
  }
  return best || near; // no fully clear shoulder nearby: at least stand on the right-hand shoulder
}

export async function initV2(game) {
  let spot = null;
  try { const r = await fetch(BASE + 'assets/world/layout.json'); if (r.ok) { const L = await r.json(), sp = (L.setpieces || []).find((s) => s.id === 'keys_sign'); if (sp) spot = { x: sp.x, z: sp.z, heading: sp.heading || 0, temporary: false }; } } catch (e) { /* not written yet */ }
  // the layout spot only counts once the merged world has land and a road there; until then use the temporary spot
  if (spot) { let ok = false; try { const ne = game.city.roadGraph.nearestEdge(spot.x, spot.z, null, 80); ok = !!ne && !game.city.isWater(spot.x, spot.z); } catch (e) { /* */ } if (!ok) { console.info('[keys-sign] layout spot has no land/road in the loaded world yet; using the temporary spot'); game.keysSignLayoutSpot = spot; spot = null; } }
  if (spot) { const sn = snapToRoad(game, spot); if (sn) spot = { x: sn.x, z: sn.z, heading: sn.heading, temporary: false, snapped: Math.round(sn.dd), tight: !!sn.tight }; }
  if (!spot) spot = temporarySpot(game);
  if (!spot) { console.warn('[keys-sign] no place found for the sign'); return; }
  const textures = await loadKeysSignTextures(THREE, { anisotropy: game.renderer.capabilities.getMaxAnisotropy() });
  const ks = buildKeysSign(THREE, { textures });
  const y = game.city.groundHeightAt?.(spot.x, spot.z) ?? 0;
  ks.group.position.set(spot.x, Math.max(0, y), spot.z); ks.group.rotation.y = spot.heading; ks.group.updateMatrixWorld(true);
  game.scene.add(ks.group);
  const { world, RAPIER } = game, q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (const c of ks.colliders) {
    try {
      v.set(c.x, c.y, c.z).applyMatrix4(ks.group.matrixWorld); q.setFromEuler(new THREE.Euler(0, spot.heading + (c.ry || 0), 0));
      const d = c.type === 'cyl' ? RAPIER.ColliderDesc.cylinder(c.hh, c.r) : RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz);
      world.createCollider(d.setTranslation(v.x, v.y, v.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    } catch (e) { /* visual only */ }
  }
  try { for (const l of ks.lights) { const p = l.position.clone().applyMatrix4(ks.group.matrixWorld); game.env?.lamps?.add?.(p.x, p.y, p.z, { color: l.color, intensity: 220, range: 18, gy: ks.group.position.y }); } } catch (e) { /* */ }
  const perches = ks.perches.map((p) => p.clone().applyMatrix4(ks.group.matrixWorld)), local = new THREE.Vector3();
  let loud = 0;
  for (const ev of ['shot', 'gunshot', 'explosion', 'horn']) game.on(ev, (d) => { const p = d?.position || d?.point || game.player.position; if (p && p.distanceTo(ks.group.position) < 90) loud = 0.3; });
  game.updaters.push((dt) => {
    const P = game.player.position; if (P.distanceToSquared(ks.group.position) > 500 * 500) return;
    local.copy(P); ks.group.worldToLocal(local); loud = Math.max(0, loud - dt);
    ks.update(dt, { night: game.env?.nightFactor ?? 0, playerLocal: local, loud: loud > 0 });
  });
  game.keysSign = { group: ks.group, position: ks.group.position, perches, temporary: spot.temporary, snapped: spot.snapped ?? null, tight: !!spot.tight, heading: spot.heading, scatterBirds: (why) => { const r = ks.scatterBirds(why); if (r) game.emit('keysSign:birdsScatter', { position: ks.group.position, why }); return r; } };
}
