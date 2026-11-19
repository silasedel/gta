// game.story: story state, missions, cutscenes and the menu's Play / Free Roam / Restart Story flows.
//
//   game.story.state                        flags, unlocks, done, granted (state.js)
//   game.story.defineMission(def)           register a mission (runner.js; files in ./missions/ register themselves)
//   game.story.startMission(id, opts?)      { checkpoint, from } -> Promise<bool>
//   game.story.skipMission(id, opts?)       apply a pass without playing it (flags, unlocks, money, items, end position)
//   game.story.quitMission()                leave the running mission (no fail screen)
//   game.story.playCutscene(def, opts?)     -> Promise<{ skipped, actors, vehicles, props }> (cutscene.js)
//   game.story.restartStory()               wipe every save slot and start a fresh game at Nico's house
//   game.story.skipIntro()                  Free Roam: every intro mission skipped, free roam unlocked
//   game.story.beginPlay({ fresh })         Play: resume the mission in progress, else the next intro mission
//   game.story.stage()                      next intro mission id, or 'freeRoam'
//   game.story.active                       the running mission ({ def, ctx, index, checkpoint }) or null
// Events: mission:start { id, replay }, mission:step { id, step }, mission:pass { id, money, items },
// mission:fail { id, reason }, mission:quit { id }, mission:skip { id }, cutscene:start / cutscene:end { id, skipped }.
import { createStoryState } from './state.js';
import { createRunner, defineMission } from './runner.js';
import { createCutscenes } from './cutscene.js';
import { createMissionMarkers } from './markers.js';
import { INTRO_MISSIONS, INTRO_DONE_FLAG, FREE_ROAM_UNLOCK } from './intro.js';

export { defineMission };

const MISSION_FILES = import.meta.glob('./missions/*.js', { eager: true });

export function createStory(game) {
  const params = new URLSearchParams(location.search);
  const state = createStoryState();
  const story = {
    state,
    intro: INTRO_MISSIONS,
    test: params.get('storytest') === '1',
  };
  story.cutscenes = createCutscenes(game);
  story.markers = createMissionMarkers(game, story);
  const runner = createRunner(game, story);
  story.runner = runner;
  story.missions = runner.missions;

  // ---------------------------------------------------------------- public API
  story.defineMission = (def) => runner.register(def);
  story.startMission = (id, opts) => runner.start(id, opts);
  story.skipMission = (id, opts) => runner.skip(id, opts);
  story.quitMission = () => runner.quit();
  story.playCutscene = (def, opts) => story.cutscenes.play(def, opts);
  Object.defineProperty(story, 'active', { get: () => runner.active });

  story.introComplete = () =>
    state.has(INTRO_DONE_FLAG) || INTRO_MISSIONS.every((id) => state.isDone(id));
  story.nextIntro = () => INTRO_MISSIONS.find((id) => !state.isDone(id)) || null;
  story.stage = () => story.nextIntro() || 'freeRoam';
  story.hasProgress = () =>
    Object.keys(state.done).length > 0 || Object.keys(state.flags).length > 0;

  // Nico's yard (the house set piece's spawn anchor), else the map's player spawn
  story.houseSpawn = () => {
    const a = game.nicoHouse?.anchors?.spawnYard || game.nicoHouse?.anchors?.spawn;
    if (a?.pos) return { x: a.pos.x, y: a.pos.y, z: a.pos.z, heading: a.heading };
    const c = game.city;
    if (c?.playerSpawn)
      return { x: c.playerSpawn.x, z: c.playerSpawn.z, heading: c.playerSpawnHeading };
    return null;
  };
  story.toHouse = () => {
    const h = story.houseSpawn();
    if (h) game.teleport(h.x, h.y ?? null, h.z, h.heading);
  };

  // Free Roam: the intro counts as done (each mission's flags, unlocks, money and items), then home
  story.skipIntro = async (opts = {}) => {
    runner.quit();
    for (const id of INTRO_MISSIONS) await runner.skip(id, { save: false, teleport: false });
    state.set(INTRO_DONE_FLAG, true);
    state.unlock(FREE_ROAM_UNLOCK);
    state.resume = null;
    if (opts.teleport !== false) story.toHouse();
    story.markers.refresh();
    if (opts.save !== false) await runner.autosave('freeRoam');
  };

  // Restart Story: every slot goes (a single story per player), then a fresh game in slot1 at the house
  story.restartStory = async (opts = {}) => {
    runner.quit();
    const S = game.save;
    if (S?.list) {
      const slots = await S.list();
      for (const s of slots) await S.delete(s.slot);
    }
    await S?.newGame?.({ slot: 'slot1' });
    state.reset();
    story.toHouse();
    story.markers.refresh();
    if (opts.save !== false) await runner.autosave('restart');
  };

  // Where Play puts the player before the world loads (the loading screen waits for the ground there).
  story.preparePlay = () => {
    const r = state.resume;
    const def = r && runner.missions.get(r.id);
    const cp = def?.steps?.[r.checkpoint]?.checkpoint?.at;
    const at = typeof cp === 'function' ? cp(game) : cp;
    if (at) game.teleport(at.x, at.y ?? null, at.z, at.heading);
  };

  // Play, once the player is in the world: the mission he quit in (from its checkpoint), else the next intro mission.
  // The intro missions (Phase B) do not exist yet: the stub runs the test mission (?storytest=1) or leaves a note.
  story.beginPlay = async () => {
    const r = state.resume;
    if (r && runner.missions.has(r.id)) {
      return runner.start(r.id, { checkpoint: r.checkpoint || 0, from: 'play' });
    }
    state.resume = null;
    const next = story.nextIntro();
    if (!next) return false;
    if (runner.missions.has(next)) return runner.start(next, { from: 'play' });
    if (story.test && runner.missions.has('test.errand') && !state.isDone('test.errand')) {
      return runner.start('test.errand', { from: 'play' });
    }
    game.hud?.notify?.(
      'The story starts here soon. Until then the Keys are yours: explore, or pick Free Roam.',
      6000,
    );
    return false;
  };

  // ---------------------------------------------------------------- save slice
  game.save?.register?.('story', {
    version: 1,
    order: 66,
    save: () => state.toJSON(),
    load: (d) => {
      if (runner.active) runner.quit();
      if (d) state.fromJSON(d);
      else state.reset();
      story.markers.refresh();
    },
  });

  // ---------------------------------------------------------------- missions in ./missions/ (files starting with _ are
  // dev missions: only with ?storytest=1)
  for (const [path, mod] of Object.entries(MISSION_FILES)) {
    const file = path.split('/').pop();
    if (file.startsWith('_') && !story.test) continue;
    const defs = [].concat(mod.default || []);
    for (const def of defs) {
      try {
        runner.register(def);
      } catch (e) {
        console.error(`[story] ${file}:`, e);
      }
    }
  }

  game.updaters.push(function storyTick(dt) {
    runner.update(dt);
    story.markers.update(dt);
  });
  story.markers.refresh();
  return story;
}
