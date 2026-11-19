// B2 Ocean Smuggling (docs/v2/plan/STORY_INTRO_SCRIPT.md): briefing at the marina, the console boat out to the reef,
// follow the drop plane, fish six packages out of the water, Lou's radio call (Cisco is taken), head for the swamp.
// Skeleton: the drop plane is a moving point (blip + waypoint) for now; the real aircraft on a scripted path comes next.
import { defineMission } from '../runner.js';
import { PLACES, CAST, along } from './lib/intro.js';

const PLANE_SPEED = 45; // m/s along the drop line
const PACKAGES = 6;

// where the plane drops package i (evenly along the line, a little scatter)
function dropPoints() {
  const pts = [];
  for (let i = 0; i < PACKAGES; i++) {
    const p = along(PLACES.dropLineA, PLACES.dropLineB, (i + 0.5) / PACKAGES);
    pts.push({ x: p.x + Math.sin(i * 2.3) * 14, z: p.z + Math.cos(i * 1.7) * 14 });
  }
  return pts;
}

function briefing() {
  return {
    id: 'oceanSmuggling.briefing',
    frame: PLACES.marinaDock,
    actors: {
      dex: { person: CAST.dex, at: [1.5, 0, 2, Math.PI], pose: 'idle' },
      lou: { person: CAST.lou, at: [-1.5, 0, 3, Math.PI], pose: 'phone_text' },
    },
    shots: [
      { dur: 4, mm: 28, from: { pos: [-6, 2.5, -4], look: [0, 0.8, 6] } },
      { dur: 5, mm: 50, from: { pos: [-0.5, 1.7, 0.5], look: 'actor:lou' } },
      { dur: 3, mm: 35, from: { pos: [3, 1.8, -1], look: 'actor:dex' } },
    ],
    lines: [
      {
        at: 4.3,
        who: 'Lou',
        text: 'Plane’s wheels up. It comes in low over the reef, drops six, and keeps going.',
        ms: 3200,
      },
      { at: 7.7, who: 'Dex', text: 'We follow it, we fish them out, we come home.', ms: 2200 },
      { at: 9.9, who: 'Dex', text: 'Nobody waves at the Coast Guard.', ms: 1900 },
    ],
  };
}

function radioCall() {
  return {
    id: 'oceanSmuggling.radio',
    letterbox: false,
    fadeIn: false,
    fadeOut: false,
    shots: [{ dur: 8.5, mm: 35, from: { pos: 'player', look: 'player' } }],
    phone: { who: 'Lou', from: 0, to: 8.5 },
    lines: [
      {
        at: 0.3,
        who: 'Lou',
        text: 'Nico. Cisco’s not answering. Our man in the Glades.',
        ms: 2600,
      },
      {
        at: 3,
        who: 'Lou',
        text: 'His last call said airboats. The Sawgrass boys have him. And they want what’s in your boat.',
        ms: 3400,
      },
      { at: 6.6, who: 'Dex', text: 'Then we go get him.', ms: 1800 },
    ],
  };
}

// the camera for the radio call sits behind and above the boat
function radioCallFor(ctx) {
  const cs = radioCall();
  const p = ctx.game.player.position;
  const h = ctx.game.player.heading || 0;
  const back = [p.x - Math.sin(h) * 9, p.y + 4, p.z - Math.cos(h) * 9];
  cs.shots[0].from = { pos: back, look: [p.x, p.y + 1, p.z] };
  return cs;
}

export default defineMission({
  id: 'intro.oceanSmuggling',
  title: 'Ocean Smuggling',
  giver: 'Vale',
  intro: true,
  requires: ['intro.firstJob'],
  flags: {},
  end: { at: PLACES.sawgrassLanding },
  steps: [
    { id: 'briefing', cutscene: briefing },
    {
      id: 'boat',
      text: 'Get in the boat.',
      enter: (ctx) => ctx.spawnBoat('boat', 'console', PLACES.marinaWater),
      trigger: { enterVehicle: 'boat' },
      waypoint: 'boat',
    },
    {
      id: 'reef',
      text: 'Head out to the reef.',
      checkpoint: {
        at: PLACES.marinaDock,
        restore: (ctx) => ctx.spawnBoat('boat', 'console', PLACES.marinaWater),
      },
      trigger: { reach: { at: PLACES.dropEntry, r: 60, inVehicle: 'boat' } },
      fail: { vehicleDestroyed: 'boat' },
    },
    {
      id: 'follow',
      text: 'Follow the plane.',
      enter(ctx) {
        ctx.data.planeT = 0;
        ctx.data.plane = { ...PLACES.dropLineA };
      },
      onTick(ctx, dt) {
        const len = Math.hypot(
          PLACES.dropLineB.x - PLACES.dropLineA.x,
          PLACES.dropLineB.z - PLACES.dropLineA.z,
        );
        ctx.data.planeT = Math.min(1, ctx.data.planeT + (dt * PLANE_SPEED) / len);
        Object.assign(ctx.data.plane, along(PLACES.dropLineA, PLACES.dropLineB, ctx.data.planeT));
      },
      until: (ctx) => ctx.data.planeT >= 1,
      waypoint: (ctx) => ctx.data.plane,
      fail: {
        vehicleDestroyed: 'boat',
        escaped: { target: (ctx) => ctx.data.plane, dist: 700, text: 'You lost the plane.' },
      },
    },
    {
      id: 'packages',
      text: 'Collect the packages',
      checkpoint: {
        at: PLACES.dropEntry,
        restore: (ctx) => ctx.spawnBoat('boat', 'console', PLACES.dropEntry),
      },
      async enter(ctx) {
        const pts = dropPoints();
        ctx.data.pkgs = pts;
        for (let i = 0; i < pts.length; i++) {
          const y = ctx.game.city?.seaLevel ?? -0.12;
          await ctx.spawnProp('pkg' + i, 'package_waterproof', { ...pts[i], y });
        }
      },
      trigger: {
        collect: {
          items: (ctx) => ctx.data.pkgs,
          r: 6,
          onCollect(ctx, p) {
            const i = ctx.data.pkgs.indexOf(p);
            const obj = ctx.h['pkg' + i];
            if (obj) ctx.game.scene.remove(obj);
          },
        },
      },
      fail: { vehicleDestroyed: 'boat' },
    },
    { id: 'radio', cutscene: radioCallFor },
    {
      id: 'swamp',
      text: 'Head to the swamp.',
      trigger: { reach: { at: PLACES.sawgrassLanding, r: 40, inVehicle: 'boat' } },
      fail: { vehicleDestroyed: 'boat' },
    },
  ],
});
