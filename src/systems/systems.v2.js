// Core systems loader (order 5): builds the simulation backbone (src/systems/index.js) on the game object and
// wires it to the running game: clock takeover, cash alias for v1 code, player save slice, boot (continue or new
// game), exit snapshot. Everything is guarded: if this module fails, the game keeps its v1 money and clock.
import { createSystems } from './index.js';

export const order = 5;

export async function initV2(game) {
  const params = new URLSearchParams(location.search);
  const sys = createSystems(game, {
    appVersion: '2.1.0-dev',
    physics: {
      ground: (x, z) => game.city?.groundHeightAt?.(x, z) ?? 0,
      ray: () => null,
    },
  });
  sys.attach();

  // ---- clock: the systems clock drives game.timeOfDay (writes still work for staging shots)
  game.timeExternal = true;
  const startHour = Number(game.timeOfDay);
  Object.defineProperty(game, 'timeOfDay', {
    configurable: true,
    enumerable: true,
    get: () => sys.time.hour,
    set: (h) => sys.time.stageHour(Number(h)),
  });
  if (Number.isFinite(startHour)) sys.time.stageHour(startHour);

  // ---- v1 code reads and writes game.player.money: alias it to carried cash
  const P = game.player;
  Object.defineProperty(P, 'money', {
    configurable: true,
    enumerable: true,
    get: () => sys.wallet.cash,
    set: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      // v1 death/arrest code deducts its own bill; the systems apply the v2 rules on 'playerDied' / 'arrest'
      if (n < sys.wallet.cash && (game.ui?.dead || game.ui?.arrested)) return;
      sys.wallet.setCashDirect(n);
    },
  });

  // ---- player slice: where Nico is and how he is
  sys.save.register('player', {
    version: 1,
    order: 40,
    save: () => {
      const p = P.position;
      return {
        pos: [p.x, p.y, p.z],
        heading: P.heading || 0,
        health: Number(P.health) || 100,
        armor: Number(P.armor) || 0,
        weapon: P.weapon || 'fist',
        outfit: P.outfit || null,
      };
    },
    load: (d) => {
      if (!d) return;
      if (Array.isArray(d.pos) && d.pos.every(Number.isFinite)) {
        try {
          game.teleport(d.pos[0], d.pos[1], d.pos[2], d.heading);
        } catch (e) {
          console.warn('[systems] restore position failed', e);
        }
      }
      if (Number.isFinite(d.health)) P.health = Math.max(20, d.health);
      if (Number.isFinite(d.armor)) P.armor = d.armor;
      if (d.outfit) P.outfit = d.outfit;
    },
  });

  // ---- per-frame
  game.updaters.push(function systemsTick(dt) {
    try {
      sys.update(dt);
    } catch (e) {
      console.error('[systems] update', e);
    }
  });
  let last = performance.now();
  const always = () => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    try {
      sys.updateAlways(dt);
    } catch (e) {
      /* never break the frame */
    }
    requestAnimationFrame(always);
  };
  requestAnimationFrame(always);

  // ---- boot: continue the newest slot, else a new game (after game.ready, so teleports land on a built world)
  const noSave = params.has('nosave');
  if (noSave) sys.save.enabled = false;
  const boot = async () => {
    if (sys.save.manualBoot) return;
    try {
      if (!params.has('newgame') && !noSave && (await sys.save.hasContinue())) {
        const r = await sys.save.continue();
        if (r?.ok) {
          game.hud?.notify?.(`Welcome back. ${sys.time.date.text}, ${sys.time.clockText()}`, 3500);
          return;
        }
      }
      await sys.save.newGame({ slot: 'slot1' });
    } catch (e) {
      console.error('[systems] boot failed', e);
    }
  };
  const waitReady = () => {
    if (game.ready) boot();
    else setTimeout(waitReady, 100);
  };
  waitReady();

  addEventListener('pagehide', () => {
    try {
      sys.save.saveExitSync();
    } catch (e) {
      /* */
    }
  });
}
