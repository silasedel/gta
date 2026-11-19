// District casting (r6-casting; user: "make the npcs fit the area: rich looking business men should only be in richer
// areas, rugged and rural looking people should only be in those area types").
// Every person in public/assets/npc/people/index.json carries a look class ("look", written by tools/v2/npcs/people.json
// -> build_index.py). Every spot of the map has an area type (from the district name, refined by the zone). ALLOW says
// how likely each look class is in each area type; 0 (or missing) = never. Both tiers (near people: cast.js createPed /
// createDriver / fits, far crowd: cast.js farPerson) pick only from the allowed classes. A thin pool falls back to
// NEUTRAL (plain casual clothes), never to a class that does not belong.
export const LOOKS = [
  'business',
  'evening',
  'casual',
  'tourist',
  'beach',
  'swim',
  'sport',
  'rugged',
  'worker',
  'street',
  'gang',
  'staff',
  'uniform',
];
export const NEUTRAL = 'casual';

// area type per district (names: public/assets/miami/world.json "districts")
const AREAS = {
  upscale: [
    'Downtown',
    'Brickell',
    'Brickell Hammock',
    'Fisher Island',
    'Star Island',
    'Key Biscayne',
    'Coconut Grove',
    'Naples',
  ],
  urban: [
    'Arts & Entertainment District',
    'Edgewater',
    'Midtown',
    'Wynwood',
    'Design District',
    'Buena Vista',
    'Spring Garden',
    'Health District',
    'Little Havana',
    'The Roads',
  ],
  rough: ['Overtown', 'Allapattah', 'Liberty City', 'Opa-locka'],
  beach: [
    'South of Fifth',
    'South Beach',
    'Bayshore',
    'Collins Park',
    'Mid-Beach',
    'Miami Beach',
    'Virginia Key',
    'Sanibel',
  ],
  keys: ['Key Largo', 'Key West', 'Marathon', 'Florida Bay'],
  rural: [
    'Lake Okeechobee',
    'Big Cypress',
    'Clewiston',
    'Homestead',
    'Okeechobee',
    'Everglades City',
    'Florida City',
    'Everglades',
  ],
  industrial: ['Dodge Island Port'],
  airport: ['Miami International Airport'],
  suburb: ['Miami Gardens', 'Hialeah Gardens', 'Fort Myers', 'Port Charlotte'],
};
export const DISTRICT_AREA = {};
for (const a in AREAS) for (const d of AREAS[a]) DISTRICT_AREA[d] = a;
// districts the table does not name (a later map build): by name pattern
const PATTERNS = [
  [/\bkeys?\b|islamorada|tavernier|marathon|paloma|tern/i, 'keys'],
  [/glades|cypress|okeechobee|citrus|sawpalm|farm|grove$/i, 'rural'],
  [/brickell|downtown|financial|fisher|star island/i, 'upscale'],
  [/beach|collins|ocean drive/i, 'beach'],
  [/overtown|liberty|allapattah|opa/i, 'rough'],
  [/\bport\b|dodge/i, 'industrial'],
  [/airport/i, 'airport'],
];

// look class weights per area type (0 / missing = never there)
//   business: suits, office shirts, blazers         evening: club dresses, dressed-up night people
//   casual:   plain everyday clothes (the neutral pool)   tourist: resort shirts, sundresses, vacation wear
//   beach:    beachwear that walks the street        swim: swimsuits (sand and water only, see lookWeight)
//   sport:    joggers, gym people                    rugged: fishermen, farmers, hunters, worn outdoor work clothes
//   worker:   trades in work gear (construction, delivery, mechanics, boat captains)
//   street:   rough city looks (hoodies, leather, worn layers)    gang: crews (placed by their own role only)
//   staff:    service uniforms off shift (cashier, cook, maid)    uniform: medics, guards (police have their own hook)
export const ALLOW = {
  upscale: {
    business: 1,
    evening: 0.6,
    casual: 0.55,
    tourist: 0.4,
    sport: 0.4,
    worker: 0.2,
    staff: 0.25,
    uniform: 0.15,
  },
  urban: {
    casual: 1,
    tourist: 0.6,
    evening: 0.5,
    sport: 0.5,
    worker: 0.5,
    street: 0.5,
    staff: 0.3,
    uniform: 0.2,
    beach: 0.1,
  },
  rough: { street: 1, casual: 0.8, worker: 0.7, sport: 0.3, staff: 0.2, uniform: 0.1 },
  beach: {
    tourist: 1,
    beach: 1,
    casual: 0.8,
    sport: 0.8,
    evening: 0.6,
    staff: 0.2,
    street: 0.15,
    worker: 0.1,
  },
  suburb: {
    casual: 1,
    sport: 0.6,
    worker: 0.6,
    tourist: 0.3,
    street: 0.3,
    staff: 0.3,
    uniform: 0.2,
    beach: 0.1,
  },
  keys: {
    rugged: 1,
    casual: 0.7,
    tourist: 0.6,
    worker: 0.6,
    beach: 0.5,
    sport: 0.2,
    street: 0.15,
    staff: 0.15,
  },
  rural: { rugged: 1, worker: 0.8, casual: 0.5, tourist: 0.15, sport: 0.1, street: 0.1 },
  industrial: { worker: 1, casual: 0.3, street: 0.3, staff: 0.1, uniform: 0.1 },
  airport: { tourist: 1, casual: 0.8, worker: 0.4, staff: 0.3, uniform: 0.2, sport: 0.1 },
};

// zones where anybody may walk (the look rules apply); every other "zone" is a job / venue role with its own people
const PUBLIC =
  /^(beach|water|business|downtown|commercial|nightlife|night|port|industrial|rural|wilderness|park|causeway|airport|casual|residential)$/;
const BEACH_ACT = /^(sunbathe|swim|wade|volley|frisbee)$/;
export const isPublicZone = (zone) => !zone || PUBLIC.test(zone);

/** area type at a spot: the district decides, the zone refines (a port stays a port, sand is a beach) */
export function areaType(district, zone, pos) {
  const d = String(district || '');
  let a = DISTRICT_AREA[d] || null;
  if (!a && d)
    for (const [re, t] of PATTERNS)
      if (re.test(d)) {
        a = t;
        break;
      }
  const country = a === 'keys' || a === 'rural';
  if (!country) {
    if (zone === 'port' || zone === 'industrial') return 'industrial';
    if (zone === 'airport') return 'airport';
    if (zone === 'rural' || zone === 'wilderness') return 'rural';
    if (zone === 'beach') return 'beach';
  }
  if (a) return a;
  // open water / unnamed ground: the zone decides
  if (zone === 'business' || zone === 'downtown') return 'upscale';
  if (zone === 'nightlife' || zone === 'night' || zone === 'commercial') return 'urban';
  if (zone === 'water') return 'beach';
  return 'suburb';
}

/** look class of an index row (rows without a "look" get one from their role / places, so a new model is never unclassed) */
export function lookOf(p) {
  if (!p) return NEUTRAL;
  if (p.look) return p.look;
  const pl = p.places || [],
    role = String(p.role || ''),
    has = (x) => pl.includes(x);
  if (
    /police|swat|lifeguard|paramedic|nurse|firefighter|security/.test(role) ||
    has('police') ||
    has('police_swat') ||
    has('lifeguard') ||
    has('medic') ||
    has('fire')
  )
    return 'uniform';
  if (role === 'gang' || has('gang')) return 'gang';
  if (/business|office|finance|detective/.test(role) || pl[0] === 'business') return 'business';
  if (
    /fisher|farmer|hunter|guide|ranger/.test(role) ||
    pl[0] === 'rural' ||
    pl[0] === 'farm' ||
    pl[0] === 'fishing'
  )
    return 'rugged';
  if (has('swim')) return 'swim';
  if (pl[0] === 'beach') return 'beach';
  if (pl[0] === 'work' || pl[0] === 'port' || pl[0] === 'industrial' || pl[0] === 'dock')
    return 'worker';
  if (pl[0] === 'shop_staff' || pl[0] === 'kitchen' || pl[0] === 'bar' || pl[0] === 'hotel_staff')
    return 'staff';
  if (pl[0] === 'nightlife') return 'evening';
  if (pl[0] === 'sport') return 'sport';
  if (pl[0] === 'tourist') return 'tourist';
  if (pl[0] === 'rough') return 'street';
  return NEUTRAL;
}

/** weight (0 = never) of a look class at a spot. ctx: { area, zone, act, night } */
export function lookWeight(look, ctx = {}) {
  const zone = ctx.zone,
    act = ctx.act;
  if (!isPublicZone(zone)) return 1; // job / venue roles: the role's own people
  if (look === 'gang') return 0; // crews only through their own role
  const sand = zone === 'beach' || zone === 'water' || BEACH_ACT.test(act || '');
  if (look === 'swim') return sand ? 1 : 0; // swimsuits never leave the sand
  if (BEACH_ACT.test(act || '')) return look === 'beach' ? 1 : 0;
  const T = ALLOW[ctx.area] || ALLOW.suburb;
  let w = T[look] || 0;
  if (look === 'evening' && !ctx.night) w *= 0.35; // dressed-up people mostly after dark
  if (look === 'beach' && sand && ctx.area !== 'rural') w = Math.max(w, 1);
  return w;
}
