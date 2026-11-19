// Where the activities live (world meters, +X east, +Z south). Spots are search starts: each module snaps them to the map
// at run time (the shore, the nearest road, the platform...). Edit here to move or add a site.

// ---- jet ski rentals: x, z = a point on the beach / shore; the stand is placed 8 m inland of the nearest open water
export const JETSKI_SITES = [
  { id: 'sobe', name: 'South Beach', brand: 'Riptide', sub: 'Jet ski rentals · South Beach', x: 2720, z: 600, num0: 1 },
  { id: 'mbeach', name: 'Miami Beach', brand: 'Riptide', sub: 'Jet ski rentals · Miami Beach', x: 2700, z: -900, num0: 4 },
  { id: 'keylargo', name: 'Key Largo', brand: 'Coral Cove', sub: 'Watersports · Key Largo', x: -1415, z: 5650, num0: 7 },
];
export const JETSKI_PLANS = [
  { id: 'spin', label: 'Quick spin', blurb: '3 minutes', seconds: 180, price: 45 },
  { id: 'ride', label: 'Long ride', blurb: '8 minutes', seconds: 480, price: 95 },
];
export const DEPOSIT = 50;

// ---- subway regulars per Southline station (game.metro station ids): hobos at the camp end (0-4), chance of a crew at
// the other end, chance one of the crew carries a knife
export const SUBWAY_CAST = {
  airport: { hobos: 2, crew: 0.35, knife: 0.3 },
  havana: { hobos: 3, crew: 0.7, knife: 0.5 },
  downtown: { hobos: 4, crew: 0.55, knife: 0.4 },
  sobe: { hobos: 2, crew: 0.3, knife: 0.2 },
  default: { hobos: 2, crew: 0.4, knife: 0.3 },
};

// ---- yacht party: x, z = a point on the bay shore; the private pier runs from the nearest open water out to depth and
// the yacht moors stern-to at its end. tracks: CC BY music in public/assets/audio/music (see its index.json / CREDITS)
export const YACHT_PARTY = {
  id: 'midnight_tide', name: 'Yacht party · Midnight Tide', x: 2090, z: 360, bribe: 250,
  tracks: ['neon/disco_medusae.ogg', 'neon/stringed_disco.ogg', 'neon/hyperfun.ogg', 'lowtide/funkorama.ogg', 'neon/electro_sketch.ogg', 'lowtide/groove_grove.ogg'],
};

// ---- dock shift at the Dodge Island port: x, z = where to look for a port road; pay per crate / seal, bonus under par s
export const DOCK_JOB = { x: 1595, z: 792, perCrate: 22, perSeal: 18, bonus: 45, par: 240, cooldown: 90 };

// ---- ambient life. Performers: x, z = a spot snapped to the nearest sidewalk; place = cast place of the person
export const AMBIENT_PERFORMERS = [
  { id: 'sobe_statue', kind: 'statue', label: 'living statue', x: 2375, z: 600, heading: 1.6, place: 'street', pose: 'idle', seed: 11 },
  { id: 'downtown_dancer', kind: 'dancer', label: 'street dancer', x: 600, z: -40, heading: 0, place: 'nightlife', pose: 'dance_arms', seed: 23 },
  { id: 'havana_drummer', kind: 'drummer', label: 'bucket drummer', x: -640, z: -35, heading: 0, place: 'street', pose: 'sit', seed: 37 },
  { id: 'sobe_dancer', kind: 'dancer', label: 'street dancer', x: 2600, z: 200, heading: -1.6, place: 'beach', pose: 'dance', seed: 41 },
];
// fishermen: x, z = a point near a seawall / shore; n men side by side
export const AMBIENT_FISHING = [
  { id: 'keylargo_bay', x: -930, z: 5110, n: 2, seed: 1 },
  { id: 'sobe_point', x: 2440, z: 1130, n: 3, seed: 4 },
  { id: 'downtown_bayfront', x: 740, z: 60, n: 2, seed: 7 },
  { id: 'brickell_bay', x: 260, z: 1700, n: 2, seed: 9 },
];
export const HOBO_DISTRICTS = ['Downtown', 'Overtown', 'Liberty City', 'Little Havana', 'Edgewater'];
export const GANG_DISTRICTS = ['Overtown', 'Liberty City'];
