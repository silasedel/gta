// Shared data for the intro missions (docs/v2/plan/STORY_INTRO_SCRIPT.md): places, cast and small helpers.
// Not a mission file (the loader only reads src/story/missions/*.js).
import { keepFighting, fireAtPlayer, pedOut } from '../../../jobs/kit.js';

// World meters (CONVENTIONS section 1). Water spots were checked with game.city.isWater.
export const PLACES = {
  // Pelican Point Marina, Key Largo strip (Vale's office): the lot, the dock and the water off it
  marinaLot: { x: -1262, z: 5760, heading: -2.23 },
  marinaDock: { x: -1300, z: 5800, heading: -2.23 },
  marinaWater: { x: -1330, z: 5830, heading: -2.23 },
  // open Atlantic off the reef, south-east of Key Largo: the plane flies from A to B and drops on the way
  dropEntry: { x: -700, z: 6300 },
  dropLineA: { x: -900, z: 6600 },
  dropLineB: { x: -300, z: 6100 },
  // the Everglades: creek landing (boat), the Sawgrass shack (stilt camp), the far dock with the floatplane
  sawgrassLanding: { x: -2600, z: -200, heading: Math.PI },
  shack: { x: -2600, z: -330, heading: 0 },
  farDock: { x: -2950, z: -820, heading: -1.6 },
};

// the cast (index rows in public/assets/npc/people/index.json)
export const CAST = {
  vale: 'p44',
  dex: 'p159',
  lou: 'p162',
  cisco: 'p155',
  wade: 'p150',
  sawgrass: ['p151', 'p152', 'p153', 'p154', 'p156', 'p157'],
};

// Nico's house anchors in world space (src/world/setpieces/nicoHouse), with the set piece spot as a fallback
export function house(game, name = 'spawnYard') {
  const a = game.nicoHouse?.anchors?.[name];
  if (a?.pos) return { x: a.pos.x, y: a.pos.y, z: a.pos.z, heading: a.heading || 0 };
  return { x: -1008, z: 5174, heading: 0.42 };
}

// Nico's own pickup in the yard (game.vehicles.nicoCars[0]); missions use it as the 'ute' handle
export function nicoTruck(ctx) {
  const v = ctx.game.vehicles?.nicoCars?.[0] || null;
  if (v) ctx.h.ute = v;
  return v;
}

// point `t` (0..1) along the line a -> b
export function along(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

// a gang crew around a point: list handle `name`, `n` peds in the Sawgrass kit
const SAWGRASS_KIT = {
  top: [0x4a5a3a, 0x6b5a3e, 0x2f3a2a],
  bottom: [0x3a3226, 0x2e3440],
  shoes: [0x2a2018, 0x111111],
  hats: ['capBack', 'beanie'],
  chain: 0.2,
};
export function spawnCrew(ctx, name, around, n, seed = 1) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const at = { x: around.x + Math.sin(a) * 9, z: around.z + Math.cos(a) * 9 };
    ctx.spawnPed(name, {
      at,
      kit: SAWGRASS_KIT,
      gang: true,
      seed: seed + i,
      list: true,
      health: 90,
    });
  }
}

// every frame of a fight step: the crew keeps attacking, armed members shoot about once a second when close
export function crewFight(ctx, name, dt) {
  const list = ctx.h[name] || [];
  ctx.data.shotT = (ctx.data.shotT || 0) - dt;
  for (const p of list) {
    if (pedOut(p)) continue;
    keepFighting(p);
    if (ctx.data.shotT <= 0 && ctx.dist(p) < 45) {
      fireAtPlayer(ctx.game, p.pos, 0.22, 6);
      ctx.data.shotT = 0.9 + Math.random() * 0.8;
    }
  }
}
