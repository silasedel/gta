// ELEVATED agent: shared constants for the elevated-road network (decks, ramps, barriers, piers).
// Units are metres. Frame (CONTRACT4): +X east, +Z south, +Y up.
export const P = {
  SAMPLE: 2.0, // longitudinal sample spacing of every deck chain
  ROAD_Y: 0.05, // road surface sits this far above the profile height (same as the city's ground ribbons)
  SHOULDER: 0.6, // paved shoulder between the outer lane line and the barrier toe
  BAR_BASE: 0.6, // jersey barrier width at the deck
  BAR_TOP: 0.25, // jersey barrier width at the top
  BAR_H: 1.07, // jersey barrier height above the deck surface
  BRIDGE_SIDEWALKS: false, // raised sidewalks + parapets on urban bridges (off: wider decks clip side streets at bridge ends)
  CURB_H: 0.15, // raised sidewalk on urban bridges (Venetian, Brickell Ave, S Miami Ave ...)
  PAR_W: 0.32, // concrete parapet width behind a bridge sidewalk
  PAR_H: 0.9, // parapet height above the sidewalk (+ steel railing above, visual)
  DECK_D: 1.25, // slab + girder depth (deck top to soffit) at the fascia
  SLAB_T: 0.32, // slab thickness at the cantilever edge (girders hang below)
  CLEAR: 4.85, // vertical clearance under a deck (soffit to the road below)
  GAP_JOIN: 2.2, // parallel decks closer than this (edge to edge) at the same level are joined into one slab
  JOIN_DY: 1.6, // ... when their target heights differ by less than this
  PAR_COS: 0.82, // |cos| of the angle between tangents above which two carriageways count as parallel
  OPEN_MIN: 3.6, // deck height above ground where an embankment becomes an open viaduct
  GRADE_Y: 0.2, // below this a deck over land is an at-grade road (no barriers, no walls)
  SPAN: 34, // nominal pier spacing
  LAMP_SP: 48, // lamp spacing on the barrier line
  BANK_K: 40, // superelevation = BANK_K * curvature (clamped)
  BANK_MAX: 0.06,
  SMOOTH_LAMBDA: 3.0e4,
  TENSION: 300, // first-difference penalty (kills spline overshoot next to pinned stretches) // vertical-curve stiffness of the profile solver (per 2 m sample)
  MIN_OWN_Y: 0.3, // OSM edges whose deck height reaches this belong to the elevated network
};

// road-class rank: higher ranks win when parallel decks are merged (they keep their full cross-section)
export const RANK = {
  motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, motorway_link: 4, trunk_link: 4,
  primary_link: 3, secondary_link: 3, tertiary_link: 3, unclassified: 2, residential: 2, living_street: 1, service: 1,
};
export const rankOf = (kind) => RANK[kind] ?? 1;
