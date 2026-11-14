// SOUTHLINE: the title screen's camera scenes (main-menu track). Real places on our map, resolved at run time from
// the city (road graph, water test, Nico's house anchors) so they follow the world when it changes.
// A scene: { id, place, hour, player: { x, z, heading, visible }, shot: cinema shot }.
import * as THREE from 'three';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function ground(game, x, z, y = 40) { const g = game.city?.groundHeightAt?.(x, z, y); return Number.isFinite(g) ? g : 0; }
function road(game, x, z, re) {
  try { const g = game.city?.roadGraph; const r = g?.nearestEdge?.(x, z, {}, 900, re ? (e) => re.test(e.name || '') : undefined); if (r) return { x: r.point.x, z: r.point.z, dx: r.dir.x, dz: r.dir.z, w: r.edge.width || 8, name: r.edge.name }; } catch (e) { /* */ }
  return null;
}
const water = (game, x, z) => { try { return !!game.city?.isWater?.(x, z); } catch (e) { return false; } };

export function buildTitleScenes(game) {
  const out = [];
  const nh = game.nicoHouse, A = nh?.anchors || {};
  // ---- 1. The Keys: Nico on his yard at golden hour, slow low orbit, the stilt house soft behind him
  const yard = (A.spawnYard || A.spawn)?.pos || game.city?.playerSpawn;
  if (yard) {
    const hx = nh?.spot?.x ?? yard.x, hz = nh?.spot?.z ?? yard.z;
    // Nico faces away from the house (toward the water / open side); the camera sits in front of him
    const away = Math.atan2(yard.x - hx, yard.z - hz);
    const ny = ground(game, yard.x, yard.z, (yard.y ?? 0) + 3);
    const nico = v3(yard.x, ny, yard.z);
    // hero: Nico at the end of his dock with the low sun behind him (sun sets toward -X, a little south)
    const dock = A.dock?.pos;
    const hp = dock ? v3(dock.x, ground(game, dock.x, dock.z, (dock.y ?? 0) + 3), dock.z) : nico;
    if (dock && Number.isFinite(dock.y)) hp.y = Math.max(hp.y, dock.y);
    const sunAway = Math.atan2(0.94, 0.34);
    out.push({
      id: 'keys_hero', place: 'Key Paloma', sub: 'The Keys', hour: 18.75, flareGain: 0.55,
      player: { x: hp.x, z: hp.z, heading: sunAway - 0.45, visible: true, pose: 'hero' },
      shot: { dur: 14, fov: 30, fov1: 27, aperture: 2.2, maxCoc: 14, focus: () => hp.clone().setY(hp.y + 1.5),
        orbit: { center: () => hp.clone().setY(hp.y + 1.25), a0: sunAway + 0.32, a1: sunAway + 0.62, r0: 5.2, r1: 4.4, h0: -0.35, h1: -0.15, lookOffset: 0.3, side: 0.9 } },
    });
    // wide: Nico small at the end of his dock, the low sun off to the side, the water in front
    out.push({
      id: 'dock_wide', place: 'Key Paloma', sub: 'The Keys', hour: 18.55,
      player: { x: hp.x, z: hp.z, heading: sunAway + 2.2, visible: true },
      shot: { dur: 14, fov: 34, aperture: 0.5, maxCoc: 6, focus: () => hp.clone().setY(hp.y + 1),
        orbit: { center: () => hp.clone().setY(hp.y + 1.4), a0: sunAway + 0.75, a1: sunAway + 1.05, r0: 24, r1: 20, h0: 5.5, h1: 6.5, lookOffset: 0.4 } },
    });
    // wide: the stilt house from the water side, dolly across
    const back = Math.atan2(yard.x - hx, yard.z - hz);
    const wx = hx + Math.sin(back) * 34, wz = hz + Math.cos(back) * 34;
    out.push({
      id: 'keys_wide', place: "Nico's place", sub: 'Key Paloma, the Keys', hour: 18.45,
      player: { x: yard.x, z: yard.z, heading: away + Math.PI, visible: true },
      shot: { dur: 13, fov: 38, aperture: 0.6, maxCoc: 7,
        from: { pos: v3(wx + Math.cos(back) * 9, 3.2, wz - Math.sin(back) * 9), look: v3(hx, 4.2, hz) },
        to: { pos: v3(wx - Math.cos(back) * 9, 3.8, wz + Math.sin(back) * 9), look: v3(hx, 4.6, hz) } },
    });
  }
  // ---- 2. Biscayne Bay at sunset: low over the water, the downtown skyline against the sun
  {
    const dt = { x: -2420, z: 520 };
    let sx = dt.x; for (let i = 0; i < 80; i++) { sx += 25; if (water(game, sx, dt.z) && water(game, sx + 25, dt.z) && water(game, sx + 50, dt.z)) break; }
    const cx = sx + 130, cz = dt.z + 40;
    out.push({
      id: 'bay', place: 'Biscayne Bay', sub: 'Downtown skyline', hour: 19.38,
      player: { x: sx - 120, z: dt.z, heading: -Math.PI / 2, visible: false },
      stream: { x: sx - 200, z: dt.z },
      shot: { dur: 15, fov: 34, fov1: 32, aperture: 0.25, maxCoc: 6, focus: 900,
        from: { pos: v3(cx, 3.2, cz + 70), look: v3(sx - 260, 58, dt.z + 30) },
        to: { pos: v3(cx - 50, 4.2, cz - 40), look: v3(sx - 260, 55, dt.z - 40) }, handheld: 0.3 },
    });
  }
  // ---- 3. Ocean Drive at dusk: street-level dolly between the deco fronts and their neon
  {
    const r = road(game, 3478, -77, /Ocean Dr/i) || { x: 3478, z: -77, dx: 0, dz: -1, w: 10 };
    const gy = ground(game, r.x, r.z);
    const side = r.w / 2 + 0.5; const nx = -r.dz, nz = r.dx;
    // on the sidewalk in front of the deco fronts, low, looking up the street under the palms and string lights
    const off = -(side + 2.4);
    const p0 = v3(r.x - r.dx * 12 + nx * off, gy + 1.05, r.z - r.dz * 12 + nz * off);
    const p1 = v3(r.x + r.dx * 4 + nx * off, gy + 1.25, r.z + r.dz * 4 + nz * off);
    out.push({
      id: 'ocean', place: 'Ocean Drive', sub: 'South Beach', hour: 20.15,
      player: { x: r.x - r.dx * 30 - nx * (side + 3), z: r.z - r.dz * 30 - nz * (side + 3), heading: Math.atan2(r.dx, r.dz), visible: false },
      shot: { dur: 14, fov: 40, aperture: 0.9, maxCoc: 9, focus: 28,
        from: { pos: p0, look: v3(r.x + r.dx * 60 - nx * side * 0.2, gy + 4.6, r.z + r.dz * 60 - nz * side * 0.2) },
        to: { pos: p1, look: v3(r.x + r.dx * 76 - nx * side * 0.1, gy + 5.2, r.z + r.dz * 76 - nz * side * 0.1) } },
    });
  }
  return out;
}
