// Loads the story framework (src/story/index.js) with the other v2 modules, before the front end (order 950) so the
// main menu's Play / Free Roam / Restart Story can use game.story.
import { createStory } from './index.js';

export const order = 940;

export async function initV2(game) {
  try {
    game.story = createStory(game);
  } catch (e) {
    console.error('[story] init failed', e);
  }
}
