// B5 Free Roam Unlock (docs/v2/plan/STORY_INTRO_SCRIPT.md): the night after the job. Vale calls about more work, the
// intro ends, free roam opens and the optional mission markers appear on the map.
import { defineMission } from '../runner.js';
import { house } from './lib/intro.js';
import { INTRO_DONE_FLAG, FREE_ROAM_UNLOCK } from '../intro.js';

function homeCutscene(ctx) {
  const yard = house(ctx.game, 'spawnYard');
  return {
    id: 'freeRoamUnlock.home',
    frame: yard,
    player: { at: yard },
    events: [{ at: 0, run: (cs) => (cs.game.timeOfDay = 21.5), always: true }],
    shots: [
      { dur: 5, mm: 24, from: { pos: [12, 6, -30], look: [0, 3, 0] }, to: { pos: [9, 5, -24] } },
      { dur: 4, mm: 50, from: { pos: [2.5, 1.6, 2.5], look: 'player' } },
      { dur: 4.5, mm: 85, cut: 'dissolve', from: { pos: [1.4, 1.7, 1.8], look: 'player' } },
    ],
    phone: { who: 'Vale', from: 2, to: 13 },
    lines: [
      { at: 2.4, who: 'Vale', text: 'You did good work today, son.', ms: 2200 },
      {
        at: 4.8,
        who: 'Vale',
        text: 'There’s more where that came from. Guns, money, things under the water.',
        ms: 3000,
      },
      { at: 7.9, who: 'Vale', text: 'When you’re ready, find me.', ms: 1800 },
      { at: 9.8, who: 'Nico', text: 'And if I’m not?', ms: 1400 },
      { at: 11.3, who: 'Vale', text: 'Everybody’s ready eventually.', ms: 2000 },
    ],
  };
}

export default defineMission({
  id: 'intro.freeRoamUnlock',
  title: 'Free Roam',
  giver: 'Vale',
  intro: true,
  requires: ['intro.seaplaneEscape'],
  rewards: { unlocks: [FREE_ROAM_UNLOCK] },
  flags: { [INTRO_DONE_FLAG]: true },
  end: { at: (game) => house(game, 'spawnYard') },
  steps: [
    { id: 'home', cutscene: homeCutscene },
    {
      id: 'unlocked',
      enter(ctx) {
        ctx.notify('Free roam unlocked. New jobs show on the map.', 6000);
      },
    },
  ],
});
