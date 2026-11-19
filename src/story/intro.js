// The main introduction (Phase B): five missions played in this order from Play. Their files go in ./missions/ with
// exactly these ids; until one exists, Play falls back to the stub in index.js (beginPlay).
export const INTRO_MISSIONS = [
  'intro.firstJob',
  'intro.oceanSmuggling',
  'intro.swampRescue',
  'intro.seaplaneEscape',
  'intro.freeRoamUnlock',
];

// set once the whole intro is behind the player (played or skipped through Free Roam)
export const INTRO_DONE_FLAG = 'intro.done';
export const FREE_ROAM_UNLOCK = 'freeRoam';
