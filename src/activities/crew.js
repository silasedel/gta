// A hostile crew that hangs out somewhere (subway platform, a corner in Overtown / Liberty City): they watch you come
// near, taunt you, try to mug you if you linger, and fight as a group when you refuse, run or throw a punch.
//   const c = createCrew(game, { peds, lines, knife: 0..1, mug: true, name, onEnd(outcome) })
//   c.tick(dt) each frame while active; c.release() when the area is dropped; c.state: 'idle' | 'watch' | 'mug' | 'fight' | 'done'
// Outcomes: 'paid' (you handed over cash), 'beaten' (all of them down: they drop cash), 'fled' (you got away), 'calm'.
import { help, notify, canAct, say, earnCash, sfx, fmt, stillOurs } from './common.js';
import { keepFighting, pedOut, release } from '../jobs/kit.js';

const DEF_LINES = {
  notice: [
    'You lost, man?',
    'Look who walked in.',
    "Yo, this ain't your spot.",
    'Keep walking, tourist.',
  ],
  mug: [
    'Run your pockets. Now.',
    "Wallet. Don't make me ask twice.",
    'Cash, phone, whatever you got. Hand it over.',
  ],
  paid: ['Smart. Now get lost.', 'Pleasure doing business.'],
  fight: ['Oh, you wanna dance?', 'Get him!', 'Wrong move, homie.'],
  beaten: ['Ah... man, take it, take it!', "Alright, alright! We're done!"],
  fled: ['Yeah, run!', "Don't come back!"],
};

export function createCrew(game, o) {
  const peds = o.peds.filter(Boolean);
  const L = { ...DEF_LINES, ...(o.lines || {}) };
  const who = o.name || 'Thug';
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const C = { state: 'idle', t: 0, peds, near: 0, knifeT: 0 };
  const P = () => game.player.position;
  const alive = () =>
    peds.filter(
      (p) =>
        !pedOut(p) &&
        (!p._actChar || stillOurs(p)) &&
        p.state !== 'down' &&
        p.state !== 'gettingUp' &&
        !p.rag,
    );
  const leader = () => alive()[0] || null;
  const d2 = (p) => Math.hypot(p.pos.x - P().x, p.pos.z - P().z);
  const face = (p, dt) => {
    const a = Math.atan2(P().x - p.pos.x, P().z - p.pos.z);
    let da = a - p.heading;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    p.heading += da * Math.min(1, dt * 4);
    if (p.root) p.root.rotation.y = p.heading;
  };
  const hurt = () =>
    peds.some((p) => pedOut(p) || (p.health ?? 100) < 96 || p.state === 'down' || p.rag);
  const knifer = o.knife && Math.random() < o.knife ? peds[peds.length - 1] : null;

  function fight(line = true) {
    if (C.state === 'fight') return;
    C.state = 'fight';
    C.t = 0;
    help(game, 'crew', null);
    if (line) say(game, who, pick(L.fight), 2200, '#ff6b5a', true);
    for (const p of alive()) {
      p.idleStyle = null;
      keepFighting(p);
    }
    try {
      game.emit?.('activity:crewFight', { name: who, n: peds.length });
    } catch (e) {
      /* */
    }
  }
  function end(outcome) {
    if (C.state === 'done') return;
    C.state = 'done';
    help(game, 'crew', null);
    try {
      o.onEnd?.(outcome);
    } catch (e) {
      console.warn('[crew] onEnd', e);
    }
  }
  C.fight = fight;
  C.tick = (dt) => {
    if (C.state === 'done') return;
    const lead = leader();
    if (!lead) {
      if (C.state === 'fight' || C.state === 'mug') {
        say(game, who, pick(L.beaten), 2400, '#ff6b5a');
        const loot = 40 + Math.round(Math.random() * 110);
        setTimeout(() => {
          earnCash(game, loot, 'Picked up their cash', who, 'street');
          notify(game, `Picked up ${fmt(loot)} they dropped.`, 3000);
        }, 900);
        end('beaten');
      } else end('calm');
      return;
    }
    const dl = d2(lead);
    C.t += dt;
    if (game.ui?.dead) {
      end('lost');
      return;
    }
    if (C.state !== 'fight' && hurt()) {
      fight();
      return;
    }
    if (C.state === 'idle') {
      if (dl < (o.noticeR || 10) && !game.player.state?.inVehicle) {
        C.state = 'watch';
        C.t = 0;
        say(game, who, pick(L.notice), 2400, '#ff6b5a');
      }
      return;
    }
    if (C.state === 'watch') {
      for (const p of alive()) face(p, dt);
      if (dl > (o.noticeR || 10) + 6) {
        C.state = 'idle';
        return;
      }
      if (dl < 4.5) C.near += dt;
      else C.near = Math.max(0, C.near - dt * 0.5);
      if (C.near > 1.6 && o.mug !== false) {
        C.state = 'mug';
        C.t = 0;
        C.cash = Math.min(
          400,
          Math.max(20, Math.round((game.wallet?.cash ?? game.player.money ?? 0) * 0.35)),
        );
        say(game, who, pick(L.mug), 2800, '#ff6b5a', true);
        for (const p of alive()) {
          p.idleStyle = p === lead ? 'talk' : 'cross_arms';
        }
      }
      return;
    }
    if (C.state === 'mug') {
      for (const p of alive()) face(p, dt);
      const cash = game.wallet?.cash ?? game.player.money ?? 0;
      help(
        game,
        'crew',
        cash >= 1
          ? `Press <b>E</b> to hand over ${fmt(Math.min(cash, C.cash))} · or fight / run`
          : 'You have no cash on you. Fight or run.',
      );
      if (canAct(game) && game.input.pressed('KeyE') && cash >= 1) {
        const amt = game.wallet?.lose
          ? game.wallet.lose(Math.min(cash, C.cash), { reason: 'mugged', by: who })
          : Math.min(cash, C.cash);
        if (!game.wallet?.lose) game.player.money = Math.max(0, cash - amt);
        sfx(game, 'cloth_move', P(), 0.6);
        say(game, who, pick(L.paid), 2400, '#ff6b5a');
        notify(game, `Mugged: -${fmt(amt)}`, 3000);
        for (const p of alive()) p.idleStyle = null;
        end('paid');
        return;
      }
      if (C.t > (cash >= 1 ? 9 : 3)) {
        fight();
        return;
      }
      if (dl > 9) {
        if (Math.random() < 0.5) fight();
        else {
          say(game, who, pick(L.fled), 1800, '#ff6b5a');
          end('fled');
        }
      }
      return;
    }
    if (C.state === 'fight') {
      for (const p of alive()) keepFighting(p);
      // the one with the knife cuts deeper than a punch
      if (knifer && !pedOut(knifer) && d2(knifer) < 1.5 && (C.knifeT -= dt) <= 0) {
        C.knifeT = 1.3 + Math.random() * 0.6;
        const G = game.gameplay?.G;
        if (G?.damagePlayer) G.damagePlayer(7, { kind: 'knife' });
        else game.player.health = Math.max(0, game.player.health - 7);
        sfx(game, 'punch_hit', P(), 0.7);
      }
      if (dl > 45) {
        say(game, who, pick(L.fled), 1800, '#ff6b5a');
        end('fled');
      }
    }
  };
  C.release = () => {
    help(game, 'crew', null);
    for (const p of peds) release(p);
  };
  return C;
}
