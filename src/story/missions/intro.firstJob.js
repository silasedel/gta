// B1 First Job (docs/v2/plan/STORY_INTRO_SCRIPT.md): Vale calls, Nico drives his truck to Pelican Point Marina and meets
// Dex and Lou on the dock. Skeleton: real steps, waypoints, checkpoints, cutscenes with the script's lines.
import { defineMission } from '../runner.js';
import { PLACES, CAST, house, nicoTruck } from './lib/intro.js';

// the two associates stand a few meters apart on the marina dock
const DEX_AT = { x: PLACES.marinaDock.x + 1.2, z: PLACES.marinaDock.z + 1.5, heading: 0.9 };
const LOU_AT = { x: PLACES.marinaDock.x - 1.4, z: PLACES.marinaDock.z + 2.2, heading: 0.9 };

function callCutscene(ctx) {
  const yard = house(ctx.game, 'truck');
  return {
    id: 'firstJob.call',
    frame: yard,
    shots: [
      { dur: 5, mm: 24, from: { pos: [-9, 3, -10], look: 'player' }, to: { pos: [-7, 2.6, -8] } },
      { dur: 3, mm: 50, from: { pos: [2.2, 1.5, 1.5], look: 'player' } },
      { dur: 5, mm: 85, cut: 'dissolve', from: { pos: [1.6, 1.7, 2.6], look: 'player' } },
      { dur: 3, mm: 35, from: { pos: [-3, 1.8, 3], look: 'player' } },
    ],
    phone: { who: 'Vale', from: 0.5, to: 12 },
    lines: [
      { at: 3.2, who: 'Vale', text: 'Nico. Augusto Vale. Your name came up.', ms: 2600 },
      { at: 6, who: 'Nico', text: 'Came up where?', ms: 1700 },
      {
        at: 7.8,
        who: 'Vale',
        text: 'With people who say you can drive a boat and keep your mouth shut.',
        ms: 2800,
      },
      { at: 10.8, who: 'Vale', text: 'Pelican Point Marina. One hour. Ask for Dex.', ms: 2600 },
    ],
    end: { player: { at: house(ctx.game, 'spawnYard') } },
  };
}

function dockCutscene() {
  return {
    id: 'firstJob.dock',
    frame: PLACES.marinaDock,
    actors: {
      vale: { person: CAST.vale, at: [0, 0, -6, 0], pose: 'idle' },
    },
    shots: [
      { dur: 4, mm: 35, from: { pos: [0.6, 1.75, -3], look: 'actor:dex' } },
      { dur: 4, mm: 50, from: { pos: [2, 1.7, -2], look: 'actor:vale' } },
      { dur: 3, mm: 85, cut: 'dissolve', from: { pos: [-1.5, 1.7, 1.5], look: 'player' } },
    ],
    lines: [
      {
        at: 0.2,
        who: 'Dex',
        text: 'So you’re the boat guy. You’re smaller than I pictured.',
        ms: 2200,
      },
      { at: 2.4, who: 'Lou', text: 'He’s late.', ms: 1200 },
      { at: 3.4, who: 'Nico', text: 'Traffic on the Overseas.', ms: 1200 },
      {
        at: 4.4,
        who: 'Vale',
        text: 'There he is. Tomorrow a plane drops some packages off the reef. You pick them up.',
        ms: 2400,
      },
      {
        at: 6.8,
        who: 'Vale',
        text: 'Five thousand for a morning on the water. Easy money, son.',
        ms: 1800,
      },
      { at: 8.6, who: 'Nico', text: 'Nothing out there is easy.', ms: 2300 },
    ],
  };
}

export default defineMission({
  id: 'intro.firstJob',
  title: 'First Job',
  giver: 'Vale',
  intro: true,
  rewards: { money: 500 },
  flags: { 'vale.met': true },
  start: { teleport: true, at: (game) => house(game, 'spawnYard') },
  end: { at: PLACES.marinaDock },
  steps: [
    { id: 'call', cutscene: callCutscene },
    {
      id: 'truck',
      text: 'Get in your truck.',
      enter: (ctx) => nicoTruck(ctx),
      trigger: { enterVehicle: (v, ctx) => !ctx.h.ute || v === ctx.h.ute },
      waypoint: 'ute',
    },
    {
      id: 'drive',
      text: 'Drive to Pelican Point Marina.',
      checkpoint: { at: (game) => house(game, 'spawnYard'), restore: (ctx) => nicoTruck(ctx) },
      trigger: { reach: { at: PLACES.marinaLot, r: 12, inVehicle: true } },
    },
    {
      id: 'findCrew',
      text: 'Find Dex and Lou on the dock.',
      enter(ctx) {
        ctx.spawnActor('dex', { person: CAST.dex, at: DEX_AT, pose: 'talk_g' });
        ctx.spawnActor('lou', { person: CAST.lou, at: LOU_AT, pose: 'cross_arms' });
      },
      trigger: { reach: { at: PLACES.marinaDock, r: 5, onFoot: true } },
    },
    {
      id: 'talk',
      text: 'Talk to Dex.',
      trigger: { interact: { at: 'dex', r: 2.6, label: 'talk to Dex' } },
    },
    { id: 'dockTalk', cutscene: dockCutscene },
  ],
});
