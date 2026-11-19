// B3 Swamp Rescue (docs/v2/plan/STORY_INTRO_SCRIPT.md): land at the creek, go into the Everglades on foot, clear the
// Sawgrass Boys at the shack, cut Cisco loose, hold off the second wave, run west to the floatplane at the far dock.
// Skeleton: the crews are crowd peds in a kit (src/jobs/kit.js); Cisco is a staged person who meets you at the dock.
import { defineMission } from '../runner.js';
import { PLACES, CAST, spawnCrew, crewFight } from './lib/intro.js';

const CLEARING = { x: PLACES.shack.x, z: PLACES.shack.z + 40 };
const CISCO_AT = { x: PLACES.shack.x + 1.5, z: PLACES.shack.z + 1.5, heading: Math.PI };
const SWAMP_AREA = { at: PLACES.shack, r: 1100 };

function landing() {
  return {
    id: 'swampRescue.landing',
    frame: PLACES.sawgrassLanding,
    actors: { dex: { person: CAST.dex, at: [1.2, 0, 1.5, Math.PI], pose: 'idle' } },
    shots: [
      { dur: 4, mm: 24, from: { pos: [-10, 4, -12], look: [0, 0.5, 0] }, to: { pos: [-8, 3, -9] } },
      { dur: 3.5, mm: 50, from: { pos: [-1.5, 1.7, 3], look: 'actor:dex' } },
      { dur: 3, mm: 85, cut: 'dissolve', from: { pos: [2, 1.6, 1], look: 'player' } },
    ],
    lines: [
      {
        at: 0.4,
        who: 'Dex',
        text: 'I stay with the boat and the cargo. You go get Cisco.',
        ms: 3000,
      },
      { at: 4.2, who: 'Dex', text: 'Take this. You know how?', ms: 2200 },
      { at: 7.6, who: 'Nico', text: 'If I’m not back in an hour, don’t wait.', ms: 2800 },
    ],
    // the pistol is a change to the world, not the picture: it is given on a skip too
    events: [{ at: 4.2, always: true, run: (cs) => givePistol(cs.game) }],
  };
}

function givePistol(game) {
  try {
    game.weapons?.give?.('pistol', 60);
  } catch (e) {
    console.warn('[swampRescue] pistol', e);
  }
}

function freeCisco() {
  return {
    id: 'swampRescue.cisco',
    frame: PLACES.shack,
    shots: [
      { dur: 3.5, mm: 50, from: { pos: [-1.5, 1.4, -1.5], look: 'actor:cisco' } },
      { dur: 3.5, mm: 50, from: { pos: [3, 1.7, 3], look: 'player' } },
      { dur: 3.5, mm: 35, from: { pos: [1, 1.6, -3], look: 'actor:cisco' } },
    ],
    lines: [
      { at: 0.3, who: 'Cisco', text: 'Took you long enough. Who are you?', ms: 2300 },
      { at: 2.8, who: 'Nico', text: 'The boat guy.', ms: 1300 },
      {
        at: 4.4,
        who: 'Cisco',
        text: 'Wade’s coming back with more. There’s a plane at the old dock, west.',
        ms: 3000,
      },
      { at: 7.6, who: 'Cisco', text: 'Vale keeps it there.', ms: 2000 },
    ],
  };
}

export default defineMission({
  id: 'intro.swampRescue',
  title: 'Swamp Rescue',
  giver: 'Vale',
  intro: true,
  requires: ['intro.oceanSmuggling'],
  flags: { 'cisco.saved': true },
  end: { at: PLACES.farDock },
  fail: { leftArea: SWAMP_AREA },
  // a skip (Free Roam) leaves Nico with the pistol Dex hands him in the landing cutscene
  apply(story, how) {
    if (how === 'skip') givePistol(story.game);
  },
  steps: [
    { id: 'landing', cutscene: landing },
    {
      id: 'approach',
      text: 'Go into the swamp.',
      trigger: { reach: { at: CLEARING, r: 15, onFoot: true } },
    },
    {
      id: 'firstWave',
      text: 'Deal with the Sawgrass Boys.',
      checkpoint: { at: CLEARING },
      enter(ctx) {
        ctx.spawnActor('cisco', { person: CAST.cisco, at: CISCO_AT, pose: 'kneel' });
        spawnCrew(ctx, 'wave1', PLACES.shack, 4, 11);
      },
      onTick: (ctx, dt) => crewFight(ctx, 'wave1', dt),
      trigger: { killAll: 'wave1' },
      waypoint: PLACES.shack,
    },
    {
      id: 'free',
      text: 'Free Cisco.',
      enter: (ctx) => ctx.spawnProp('ties', 'zip_tie', CISCO_AT),
      trigger: { interact: { at: 'cisco', r: 2.4, label: 'cut the zip ties' } },
    },
    {
      id: 'ciscoTalk',
      cutscene: freeCisco,
      exit: (ctx) => ctx.h.cisco?.setPose?.('idle'),
    },
    {
      id: 'secondWave',
      text: 'Hold off Wade’s crew.',
      checkpoint: {
        at: PLACES.shack,
        restore: (ctx) =>
          ctx.spawnActor('cisco', { person: CAST.cisco, at: CISCO_AT, pose: 'idle' }),
      },
      enter: (ctx) => spawnCrew(ctx, 'wave2', CLEARING, 4, 31),
      onTick: (ctx, dt) => crewFight(ctx, 'wave2', dt),
      trigger: { killAll: 'wave2' },
      fail: { protect: 'cisco' },
    },
    {
      id: 'run',
      text: 'Run to the plane at the far dock.',
      // Cisco runs ahead (staged people stand still for now): he waits at the dock
      enter(ctx) {
        ctx.h.cisco?.remove?.();
        ctx.spawnActor('cisco', {
          person: CAST.cisco,
          at: { x: PLACES.farDock.x + 2, z: PLACES.farDock.z + 2, heading: 0 },
          pose: 'idle',
        });
      },
      trigger: { reach: { at: PLACES.farDock, r: 8, onFoot: true } },
    },
  ],
});
