// POLICE track: where units are dispatched from. Real station sites inside real Miami (public addresses), plus our own
// precincts for the condensed regions (approximate until WORLD-LAYOUT publishes layout.json). Map data wins when it exists:
// city.pois.police, then storefronts of kind 'police'.
// stage 1 map v3: stations at the district centers of the new map (tools/v2/map3/build_v3.py ANCHORS; x = (px - 700) * 11,
// z = (py - 800) * 11). Each one snaps to the nearest road at run time.
export const STATION_SITES = [
  { name: 'Southline PD Headquarters', callsign: 'Harbor', x: 407, z: -110 },
  { name: 'Southline PD Beach District Station', callsign: 'Coral', x: 2332, z: -660 },
  { name: 'Southline PD Seaport Unit', callsign: 'Crane', x: 1595, z: 792 },
  { name: 'Southline PD Brickell Substation', callsign: 'Ledger', x: 0, z: 1760 },
  { name: 'Southline PD Edgewater Substation', callsign: 'Mural', x: 308, z: -1452 },
  { name: 'Southline PD Little Havana Station', callsign: 'Domino', x: -660, z: -55 },
  { name: 'Miami International Airport Police', callsign: 'Runway', x: -1210, z: 1045 },
  { name: 'Southline County Sheriff, Homestead', callsign: 'Canal', x: -1320, z: 3190 },
  { name: 'Southline County Sheriff, Key Largo', callsign: 'Pelican', x: -1155, z: 5500 },
  { name: 'Key West Police Department', callsign: 'Tern', x: -4895, z: 5940 },
  { name: 'Southline County Sheriff, Clewiston', callsign: 'Amaro', x: -1540, z: -2805 },
  { name: 'Fort Myers Police Department', callsign: 'Cassia', x: -5335, z: -3960 },
  { name: 'Naples Police Department', callsign: 'Gulf', x: -4730, z: -220 },
  { name: 'Southline County Sheriff, Okeechobee', callsign: 'Lake', x: -2200, z: -6435 },
  { name: 'Southline PD Miami Gardens Station', callsign: 'Stadium', x: 715, z: -3080 },
];
export function createStations(game, C) {
  const list = [];
  const b = C?.bounds;
  const inB = (p) => !b || (p.x > b.minX + 20 && p.x < b.maxX - 20 && p.z > b.minZ + 20 && p.z < b.maxZ - 20);
  function add(s) {
    if (!Number.isFinite(s.x) || !inB(s)) return;
    let road = null;
    try { const ne = C?.nearestEdge?.(s.x, s.z); if (ne && ne.dist < 260) road = { x: ne.point.x, z: ne.point.z }; } catch (e) { /* no graph */ }
    if (!road) return; // not reachable by road in the current map
    if (list.some((q) => Math.hypot(q.x - s.x, q.z - s.z) < 250)) return;
    list.push({ name: s.name, callsign: s.callsign || 'Southline', x: s.x, z: s.z, road });
  }
  const pois = C?.city?.pois?.police || C?.city?.pois?.police_station;
  if (Array.isArray(pois)) for (const p of pois) add({ name: p.name ? `Southline PD ${p.name}` : 'Southline PD Station', x: p.x ?? p.pos?.x, z: p.z ?? p.pos?.z });
  for (const sf of C?.city?.storefronts || []) if (sf.kind === 'police' || sf.poi === 'police') add({ name: 'Southline PD Station', x: sf.x, z: sf.z });
  for (const s of STATION_SITES) add(s);
  function nearest(pos, n = 1) {
    const s = list.slice().sort((a, q) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(q.x - pos.x, q.z - pos.z));
    return n === 1 ? s[0] || null : s.slice(0, n);
  }
  return { list, nearest };
}
