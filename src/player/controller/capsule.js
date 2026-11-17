// Player collision capsule, fitted to the user's Nico (1.83 m, shoulders 0.60 m wide with the arms down, chest 0.29 m
// deep; tools/v2/player/measure.py): radius 0.28 m covers the shoulders and hanging arms, the top reaches 1.80 m (the
// crown of the head, hair excluded) so he cannot walk his head into low beams / ceilings. Feet = capsule bottom.
export const PLAYER_CAPSULE = { half: 0.62, r: 0.28 };
export const PLAYER_CENTER = PLAYER_CAPSULE.half + PLAYER_CAPSULE.r;      // capsule center above the feet (0.90 m)
