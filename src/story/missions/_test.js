// Dev test mission (loaded only with ?storytest=1): a short cutscene, then two steps at Nico's house. It exercises the
// runner end to end: start marker, phone-call cutscene with an actor, a reach step, a checkpoint, an interact step,
// a fail rule (leave the area), rewards (money, an item, an unlock, flags) and the end position used by a skip.
import { defineMission } from '../runner.js';

// house anchors in world space (src/world/setpieces/nicoHouse), with the Key Largo set-piece spot as a fallback
function anchor(game, name) {
  const a = game.nicoHouse?.anchors?.[name];
  if (a?.pos) return { x: a.pos.x, y: a.pos.y, z: a.pos.z, heading: a.heading || 0 };
  return { x: -836, z: 5272, heading: 0.91 };
}

// the package waits on the dock, 2 m along it from the dock anchor
function packageSpot(game) {
  const d = anchor(game, 'dock');
  return { x: d.x + Math.sin(d.heading) * 2, z: d.z + Math.cos(d.heading) * 2, heading: d.heading };
}

export default defineMission({
  id: 'test.errand',
  title: 'Test Errand',
  giver: 'Dev',
  start: { marker: true, at: (game) => anchor(game, 'carport') },
  rewards: {
    money: 500,
    items: [{ id: 'water', qty: 1 }],
    unlocks: ['test.bonus'],
  },
  flags: { 'test.favor': 1 },
  end: { at: (game) => anchor(game, 'dock') },
  fail: {
    leftArea: { x: -836, z: 5272, r: 260 },
  },
  steps: [
    {
      id: 'call',
      // a phone call over two shots of the dock, a stranger waiting by the water
      cutscene: (ctx) => {
        const dock = anchor(ctx.game, 'dock');
        return {
          id: 'test.call',
          frame: { x: dock.x, z: dock.z, heading: dock.heading },
          actors: { stranger: { place: 'dock', at: [0, 0, 2, Math.PI], pose: 'cross_arms' } },
          shots: [
            {
              dur: 3.2,
              mm: 28,
              from: { pos: [-6, 3.5, -8], look: 'actor:stranger' },
              to: { pos: [-4, 2.6, -6] },
            },
            {
              dur: 3,
              mm: 50,
              cut: 'dissolve',
              from: { pos: [1.6, 1.7, -1.5], look: 'actor:stranger' },
            },
          ],
          phone: { who: 'Dev', from: 0.2, to: 6 },
          lines: [
            {
              at: 0.4,
              who: 'Dev',
              text: 'There is a package on your dock. Bring it in.',
              ms: 2600,
            },
            { at: 3.3, who: 'Dev', text: 'Do not wander off.', ms: 2400 },
          ],
          end: { player: { at: anchor(ctx.game, 'carport') } },
        };
      },
    },
    {
      id: 'dock',
      text: 'Go to the dock.',
      trigger: { reach: { at: (ctx) => anchor(ctx.game, 'dock'), r: 4, onFoot: true } },
    },
    {
      id: 'package',
      text: 'Pick up the package.',
      checkpoint: { at: (game) => anchor(game, 'dock') },
      trigger: {
        interact: { at: (ctx) => packageSpot(ctx.game), r: 2.5, label: 'pick up the package' },
      },
    },
  ],
});
