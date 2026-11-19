// B4 Seaplane Escape (docs/v2/plan/STORY_INTRO_SCRIPT.md): board Vale's floatplane at the far dock, take off from the
// water, fly to Pelican Point Marina, land, taxi to the dock, get paid by Vale, drive home and go inside.
import { defineMission } from '../runner.js';
import { PLACES, CAST, house, loadCast } from './lib/intro.js';

const TAKEOFF_Y = 40; // meters above the sea counts as airborne
const SEA = -0.12;
const PILOT_AT = { x: PLACES.farDock.x - 2, z: PLACES.farDock.z + 4, heading: 0.2 };

function onFoot(ctx) {
  return !ctx.game.player.state?.inVehicle;
}

// speed of whatever the player sits in (aircraft and cars report km/h differently: read what exists)
function speedKmh(ctx) {
  const v = ctx.game.player.state?.vehicle;
  return Math.abs(v?.speedKmh ?? v?.S?.speedKmh ?? v?.speed ?? 0);
}

function paidCutscene() {
  return {
    id: 'seaplaneEscape.paid',
    frame: PLACES.marinaDock,
    actors: {
      vale: { person: CAST.vale, at: [0, 0, 3, Math.PI], pose: 'idle' },
      lou: { person: CAST.lou, at: [-2, 0, 4.5, Math.PI], pose: 'cross_arms' },
      // Vale's bodyguards behind him
      guardPolo: { person: CAST.guards[0], at: [1.9, 0, 4.4, Math.PI], pose: 'cross_arms' },
      guardSuit: { person: CAST.guards[1], at: [-0.3, 0, 5.3, Math.PI], pose: 'idle' },
    },
    props: { case: { prop: 'briefcase', at: [0.6, 0, 2.4, 0] } },
    player: { at: [0, 0, 0, 0] },
    shots: [
      { dur: 4, mm: 35, from: { pos: [-1, 1.75, -2], look: 'actor:vale' } },
      { dur: 4.5, mm: 50, from: { pos: [2.5, 1.6, 1.5], look: 'actor:vale' } },
      { dur: 3, mm: 85, cut: 'dissolve', from: { pos: [0.6, 1.7, 2], look: 'player' } },
    ],
    lines: [
      {
        at: 0.3,
        who: 'Vale',
        text: 'Cisco called me from the air. He says you walked in there with one pistol.',
        ms: 3200,
      },
      { at: 3.6, who: 'Nico', text: 'It was enough.', ms: 1500 },
      {
        at: 5.2,
        who: 'Vale',
        text: 'Five thousand, as promised. And a little more for the trouble.',
        ms: 3000,
      },
      { at: 8.6, who: 'Vale', text: 'Go home. Sleep. I’ll call.', ms: 2600 },
    ],
  };
}

export default defineMission({
  id: 'intro.seaplaneEscape',
  title: 'Seaplane Escape',
  giver: 'Vale',
  intro: true,
  requires: ['intro.swampRescue'],
  rewards: { money: 5000 },
  flags: { 'vale.trust': 1 },
  start: { teleport: true, at: PLACES.farDock },
  end: { at: (game) => house(game, 'spawn') },
  setup: () => loadCast([CAST.seaplanePilot, CAST.vale, CAST.lou, ...CAST.guards]),
  steps: [
    {
      id: 'board',
      text: 'Get in the seaplane.',
      enter(ctx) {
        ctx.spawnAircraft('plane', 'floatplane', { ...PLACES.farDockWater, y: SEA });
        // Vale's floatplane pilot waits on the dock beside it
        ctx.spawnActor('pilot', { person: CAST.seaplanePilot, at: PILOT_AT, pose: 'idle' });
      },
      trigger: { enterVehicle: true },
      waypoint: 'plane',
    },
    {
      id: 'takeoff',
      text: 'Take off.',
      until: (ctx) => ctx.game.player.position.y > SEA + TAKEOFF_Y,
      waypoint: false,
    },
    {
      id: 'fly',
      text: 'Fly to Pelican Point Marina.',
      checkpoint: {
        at: PLACES.farDock,
        restore: (ctx) => ctx.spawnAircraft('plane', 'floatplane', { ...PLACES.farDock, y: SEA }),
      },
      until: (ctx) => ctx.dist(PLACES.marinaWater) < 400,
      waypoint: PLACES.marinaWater,
    },
    {
      id: 'land',
      text: 'Land on the water.',
      until: (ctx) => ctx.game.player.position.y < SEA + 3 && speedKmh(ctx) < 60,
      waypoint: PLACES.marinaWater,
      fail: {
        leftArea: { at: PLACES.marinaWater, r: 3000, text: 'You flew away from the marina.' },
      },
    },
    {
      id: 'taxi',
      text: 'Taxi to the dock.',
      trigger: { reach: { at: PLACES.marinaWater, r: 18, inVehicle: true } },
    },
    { id: 'exit', text: 'Get out.', until: onFoot, waypoint: false },
    { id: 'paid', cutscene: paidCutscene },
    {
      id: 'driveHome',
      text: 'Drive home.',
      checkpoint: { at: PLACES.marinaLot },
      // his truck is still parked at the marina lot from First Job (skeleton: any vehicle or on foot counts)
      trigger: { reach: { at: (ctx) => house(ctx.game, 'spawnYard'), r: 14 } },
    },
    {
      id: 'inside',
      text: 'Go inside.',
      trigger: { interact: { at: (ctx) => house(ctx.game, 'spawn'), r: 3, label: 'go inside' } },
    },
  ],
});
