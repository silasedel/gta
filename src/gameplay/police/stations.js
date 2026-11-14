// POLICE track: where units are dispatched from. Real station sites inside real Miami (public addresses), plus our own
// precincts for the condensed regions (approximate until WORLD-LAYOUT publishes layout.json). Map data wins when it exists:
// city.pois.police, then storefronts of kind 'police'.
const LAT0 = 25.7790, LON0 = -80.1650, KX = Math.cos(LAT0 * Math.PI / 180) * 111320;
const ll = (lat, lon) => ({ x: (lon - LON0) * KX, z: -(lat - LAT0) * 110574 });
export const STATION_SITES = [
  { name: 'PSPD Beach District Station', callsign: 'Coral', ...ll(25.7813, -80.1337), real: '1100 Washington Ave' },
  { name: 'PSPD Headquarters', callsign: 'Harbor', ...ll(25.7778, -80.1975), real: '400 NW 2nd Ave' },
  { name: 'PSPD Seaport Unit', callsign: 'Crane', ...ll(25.7745, -80.1700), real: 'Port of Miami' },
  { name: 'PSPD Brickell Substation', callsign: 'Ledger', ...ll(25.7600, -80.1950) },
  { name: 'PSPD Wynwood Substation', callsign: 'Mural', ...ll(25.8010, -80.1990) },
  { name: 'PSPD Mid-Beach Substation', callsign: 'Dune', ...ll(25.8080, -80.1290) },
  { name: 'PSPD Little Havana Station', callsign: 'Domino', ...ll(25.7690, -80.2080) },
  { name: 'Solana International Airport Police', callsign: 'Runway', x: -6400, z: -300 },
  { name: 'Calora County Sheriff, South Substation', callsign: 'Canal', x: -1800, z: 4000 },
  { name: 'Key Paloma Sheriff Substation', callsign: 'Pelican', x: 300, z: 6350 },
  { name: 'Tern Key Sheriff Substation', callsign: 'Tern', x: -6000, z: 7500 },
  { name: 'Port Cassia Police Department', callsign: 'Cassia', x: 2600, z: -6400 },
  { name: 'Calora County Sheriff, Lake Amaro Post', callsign: 'Amaro', x: -1500, z: -4700 },
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
    list.push({ name: s.name, callsign: s.callsign || 'Solana', x: s.x, z: s.z, road });
  }
  const pois = C?.city?.pois?.police || C?.city?.pois?.police_station;
  if (Array.isArray(pois)) for (const p of pois) add({ name: p.name ? `PSPD ${p.name}` : 'PSPD Station', x: p.x ?? p.pos?.x, z: p.z ?? p.pos?.z });
  for (const sf of C?.city?.storefronts || []) if (sf.kind === 'police' || sf.poi === 'police') add({ name: 'PSPD Station', x: sf.x, z: sf.z });
  for (const s of STATION_SITES) add(s);
  function nearest(pos, n = 1) {
    const s = list.slice().sort((a, q) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(q.x - pos.x, q.z - pos.z));
    return n === 1 ? s[0] || null : s.slice(0, n);
  }
  return { list, nearest };
}
