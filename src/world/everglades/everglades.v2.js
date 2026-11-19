// Everglades r7: the glades as a place (user: "a really good looking, actually swampy Everglades area that's super
// realistic, that has things you can airboat through, occasional rednecks and little shacks living there").
// Adds on top of the map's sawgrass / marsh / sheet water (env/gladesWater.js, the countryside vegetation):
//   water.js     tannin film on the open water (tea-black, sky reflection, duckweed scum on the banks) + lily pads
//   cypress.js   cypress domes and strands (procedural bald cypress, 2 LODs, trunk colliders near the player)
//   moss.js      Spanish moss curtains in the cypress / oak / gumbo limbo crowns
//   snags.js     dead bleached cypress snags, cypress knees in the shallows
//   wildlife.js  alligators on the banks and in the shallows, egrets / herons wading, flushing and flying
//   mist.js      ground mist at dawn (and a thin veil at night)
//   camps.js     Gator Gus Airboat Rides (rentable airboats), stilt fish camps, a tarp shack, an airboat-only island shack,
//                with the user's people (fishermen, hunters, the airboat guide), old pickups, dirt tracks
// Everything is active only within ~500 m of the glades districts (Everglades, Everglades City, Big Cypress), streamed
// around the camera, instanced; no per-frame allocation. game.everglades = { parts, stats() }.
// URL: ?gl7=0 off entirely; ?gl7parts=water,moss,... only those parts.
import { createRegion } from './region.js';
import { createSwampWater } from './water.js';
import { createMoss } from './moss.js';
import { createCypress } from './cypress.js';
import { createSnags } from './snags.js';
import { createWildlife } from './wildlife.js';
import { createMist } from './mist.js';
import { createCamps } from './camps.js';

export const order = 160; // after the vegetation, boats and people systems

export async function initV2(game) {
  const q = globalThis.location?.search || '';
  if (/[?&]gl7=0\b/.test(q)) return;
  if (!game.city?.districtAt || !game.city?.isWater) return;
  const only = (/[?&]gl7parts=([a-z,]+)/.exec(q) || [])[1]?.split(',') || null;
  const G = createRegion(game);
  const make = {
    water: createSwampWater,
    cypress: createCypress,
    moss: createMoss,
    snags: createSnags,
    wildlife: createWildlife,
    mist: createMist,
    camps: createCamps,
  };
  const parts = {};
  for (const [k, f] of Object.entries(make)) {
    if (only && !only.includes(k)) continue;
    try {
      parts[k] = f(game, G);
    } catch (e) {
      console.warn('[everglades] ' + k, e);
    }
  }
  let active = false,
    chkT = 0;
  const pl = { x: 0, z: 0 };
  const timing = { ms: 0, max: 0 };
  game.updaters.push((dt) => {
    const cam = game.camera?.position;
    if (!cam) return;
    if ((chkT -= dt) <= 0) {
      chkT = 1;
      active = G.nearGlades(cam.x, cam.z, 500) && !game.interiors?.current;
    }
    const pp = game.player?.position;
    if (pp) {
      pl.x = pp.x;
      pl.z = pp.z;
    } else {
      pl.x = cam.x;
      pl.z = cam.z;
    }
    const t0 = performance.now();
    for (const k in parts) {
      try {
        parts[k].update(dt, cam, active, pl);
      } catch (e) {
        console.warn('[everglades] ' + k, e);
        delete parts[k];
      }
    }
    const ms = performance.now() - t0;
    timing.ms = timing.ms * 0.95 + ms * 0.05;
    if (ms > timing.max) timing.max = ms;
  });
  game.everglades = {
    parts,
    region: G,
    get active() {
      return active;
    },
    stats: () => ({
      active,
      ms: +timing.ms.toFixed(3),
      maxMs: +timing.max.toFixed(2),
      ...Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, p.stats])),
    }),
  };
}
