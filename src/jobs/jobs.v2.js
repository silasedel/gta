// Side jobs (v2.1): short repeatable jobs with payouts, picked from a job board (K).
//  - Parcel run: pick up a parcel, drop it at two addresses against the clock.
//  - Debt collection: three people owe a lender; some pay, some run, some fight.
//  - Protect a shop: a shopkeeper is being leaned on; stop two waves of thugs.
// API: game.jobs = { list, active, start(id), cancel(), stats }. Stats persist in the 'jobs' save slice.
import { fmt, dist2, help, notify, canAct, getPanel, makeMarker, removeMarker, spawnKitPed, pedOut, release, keepFighting, fireAtPlayer } from './kit.js';

export const order = 130;

const THUG_KIT = { top: [0x3b3b3b, 0x5a4632, 0x22313f], bottom: [0x1f1f1f, 0x2e3440], shoes: [0x111111, 0xe9e7e2], hats: ['capBack', 'beanie'], chain: 0.4 };
const DEBTOR_KIT = { top: [0x9a8f7a, 0x51698a, 0xb7a58a, 0x6f7b62], bottom: [0x3b3f46, 0x6b5e4a], shoes: [0x3a2618, 0x222222], hats: null, chain: 0 };

export async function initV2(game) {
  const sf = (game.city?.storefronts || []).filter((s) => Number.isFinite(s.fx) && /^(South Beach|Downtown|Brickell|Overtown|Wynwood|Edgewater|Little Havana|South of Fifth|Arts & Entertainment District)$/.test(s.district || ''));
  if (!sf.length) return;
  const panel = getPanel(game);
  const S = { done: {}, earned: 0, cooldown: {} };
  game.save?.register?.('jobs', {
    version: 1,
    order: 62,
    save: () => ({ done: S.done, earned: S.earned }),
    load: (d) => {
      cancel(true);
      S.done = d?.done || {};
      S.earned = d?.earned || 0;
    },
  });
  const P = () => game.player.position;
  const frontOf = (s, k = 2.5) => {
    let dx = s.fx - s.x;
    let dz = s.fz - s.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: s.fx + (dx / l) * k, z: s.fz + (dz / l) * k, street: s.street, s };
  };
  const storeAt = (from, lo, hi, kinds = null) => {
    const c = sf.filter((s) => (!kinds || kinds.includes(s.kind)) && dist2(s, from) > lo && dist2(s, from) < hi);
    return c.length ? frontOf(c[Math.floor(Math.random() * c.length)]) : null;
  };
  let job = null;
  function setStage(text, at) {
    game.hud?.setMission?.(text);
    if (job.marker) removeMarker(game, job.marker);
    job.marker = at ? makeMarker(game, at, 0xffd25a) : null;
    game.waypoint = at ? { x: at.x, z: at.z } : null;
  }
  function finish(ok, pay = 0, text = '') {
    if (!job) return;
    const j = job;
    for (const p of j.people || []) release(p);
    if (j.marker) removeMarker(game, j.marker);
    job = null;
    game.hud?.setMission?.(null);
    game.waypoint = null;
    game.save?.release?.('job');
    if (ok) {
      pay = Math.round(pay);
      game.wallet?.earn?.(pay, { category: 'jobs', memo: j.def.name, from: j.def.client });
      S.done[j.def.id] = (S.done[j.def.id] || 0) + 1;
      S.earned += pay;
      game.stats?.add?.('sideJobs', 1);
      notify(game, `${j.def.name} done: +${fmt(pay)}${text ? ' · ' + text : ''}`, 4200);
      game.save?.requestAutosave?.(3);
    } else notify(game, `${j.def.name} failed${text ? ': ' + text : ''}.`, 3500);
    S.cooldown[j.def.id] = performance.now() + 20000;
    game.emit?.('jobEnd', { id: j.def.id, ok, pay });
  }
  function cancel(silent) {
    if (!job) return;
    if (silent) {
      for (const p of job.people || []) release(p);
      if (job.marker) removeMarker(game, job.marker);
      job = null;
      game.hud?.setMission?.(null);
      return;
    }
    finish(false, 0, 'cancelled');
  }

  // ---------------------------------------------------------------- job definitions
  const DEFS = [
    {
      id: 'parcel',
      name: 'Parcel run',
      client: 'Gulfstream Couriers',
      pay: '$220–420',
      blurb: 'Pick up a parcel, drop it at two addresses. Faster pays more.',
      start(j) {
        j.pick = storeAt(P(), 120, 450);
        j.drops = [storeAt(j.pick, 350, 900), null];
        j.drops[1] = storeAt(j.drops[0] || j.pick, 350, 900);
        if (!j.pick || !j.drops[0] || !j.drops[1]) return false;
        j.stage = 0;
        j.timer = 0;
        setStage(`Parcel run: pick up at ${j.pick.street || 'the shop'}`, j.pick);
        return true;
      },
      tick(j, dt) {
        j.timer += dt;
        const at = j.stage === 0 ? j.pick : j.drops[j.stage - 1];
        if (dist2(P(), at) > 6) return;
        if (game.player.state?.inVehicle && (game.player.state.vehicle?.speedKmh || 0) > 12) {
          help(game, 'jobs', 'Stop to hand over the parcel');
          return;
        }
        j.stage++;
        if (j.stage === 1) {
          j.par = 150 + dist2(j.pick, j.drops[0]) / 9 + dist2(j.drops[0], j.drops[1]) / 9;
          j.timer = 0;
          setStage(`Drop 1 of 2: ${j.drops[0].street || 'address'} (par ${Math.round(j.par)} s)`, j.drops[0]);
          notify(game, 'Parcel picked up. Two drops, beat the par time for a bonus.', 3000);
        } else if (j.stage === 2) {
          setStage(`Drop 2 of 2: ${j.drops[1].street || 'address'} (${Math.max(0, Math.round(j.par - j.timer))} s left on par)`, j.drops[1]);
        } else {
          const bonus = j.timer < j.par ? 1 - j.timer / j.par : 0;
          finish(true, 220 + 200 * bonus, bonus > 0 ? `beat par by ${Math.round(j.par - j.timer)} s` : 'over par');
        }
      },
    },
    {
      id: 'debts',
      name: 'Debt collection',
      client: 'Ray Okonjo Lending',
      pay: '$300–600',
      blurb: 'Three people owe Ray. Talk to them; if they run or swing, make them pay. You keep a cut.',
      start(j) {
        j.list = [];
        let from = P();
        for (let i = 0; i < 3; i++) {
          const a = storeAt(from, 80, 420);
          if (!a) return false;
          j.list.push({ at: a, owe: 400 + Math.round(Math.random() * 6) * 100, ped: null, mood: ['pay', 'run', 'fight'][(i + Math.floor(Math.random() * 3)) % 3], state: 'wait' });
          from = a;
        }
        j.i = 0;
        j.got = 0;
        j.people = [];
        setStage(`Collect from debtor 1 of 3 (${j.list[0].at.street || 'nearby'})`, j.list[0].at);
        return true;
      },
      tick(j, dt) {
        const d = j.list[j.i];
        const pd = dist2(P(), d.at);
        if (!d.ped && pd < 70) {
          d.ped = spawnKitPed(game, d.at, DEBTOR_KIT, 300 + j.i * 7, { tag: { debtor: true } });
          if (d.ped) {
            d.ped.state = 'watch';
            d.ped.stateT = 1e9;
            d.ped.nav = null;
            j.people.push(d.ped);
          }
        }
        if (!d.ped) return;
        const p = d.ped;
        const dp = dist2(P(), p.pos);
        const collect = (why) => {
          j.got += d.owe;
          notify(game, `${why} Collected ${fmt(d.owe)} for Ray.`, 2600);
          release(p);
          j.i++;
          if (j.i >= j.list.length) {
            finish(true, j.got * 0.2, `20% of ${fmt(j.got)}`);
            return;
          }
          const n = j.list[j.i];
          setStage(`Collect from debtor ${j.i + 1} of 3 (${n.at.street || 'nearby'})`, n.at);
        };
        if (d.state === 'wait') {
          if (dp < 3) {
            help(game, 'jobs', `Owes ${fmt(d.owe)} · <b>E</b> ask for Ray's money`);
            if (game.input.pressed('KeyE')) {
              help(game, 'jobs', null);
              if (d.mood === 'pay') collect('"Fine, fine. Tell Ray we\'re square."');
              else if (d.mood === 'run') {
                d.state = 'run';
                p.state = 'flee';
                p.fleeT = 60;
                p.threat = { x: P().x, z: P().z };
                p.scream = true;
                notify(game, 'He bolts. Catch him and knock some sense into him.', 2500);
              } else {
                d.state = 'fight';
                notify(game, '"Ray can come get it himself." He swings.', 2500);
              }
            }
          }
          return;
        }
        if (d.state === 'fight') keepFighting(p);
        if (d.state === 'run') {
          p.fleeT = Math.max(p.fleeT || 0, 5);
          if (dp > 120) {
            notify(game, 'He got away. Ray will not be happy.', 2500);
            release(p);
            j.i++;
            if (j.i >= j.list.length) finish(j.got > 0, j.got * 0.2, j.got ? `20% of ${fmt(j.got)}` : 'nobody paid');
            else setStage(`Collect from debtor ${j.i + 1} of 3`, j.list[j.i].at);
            return;
          }
        }
        // a few hits (or a knockdown) make anyone pay
        if ((p.health ?? 100) < 75 || p.state === 'down' || pedOut(p)) collect(d.state === 'run' ? 'Caught him.' : 'He gives up.');
      },
    },
    {
      id: 'protect',
      name: 'Protect a shop',
      client: 'A worried shopkeeper',
      pay: '$450–650',
      blurb: 'A crew is shaking down a corner shop. Be there when they show up and send them packing.',
      start(j) {
        j.shop = storeAt(P(), 150, 700, ['convenience', 'liquor', 'bakery', 'pharmacy', 'cafe', 'restaurant', 'fast_food']);
        if (!j.shop) return false;
        j.stage = 0;
        j.wave = 0;
        j.people = [];
        j.enemies = [];
        j.t = 0;
        j.hits = 0;
        setStage(`Protect the shop on ${j.shop.street || 'the corner'}`, j.shop);
        return true;
      },
      tick(j, dt) {
        const d = dist2(P(), j.shop);
        if (j.stage === 0) {
          if (d < 12) {
            j.stage = 1;
            j.t = 6;
            setStage('Wait by the door. They are on their way.', null);
            game.save?.inhibit?.('job');
          }
          return;
        }
        if (d > 110) {
          finish(false, 0, 'you left the shop');
          return;
        }
        j.t -= dt;
        const alive = j.enemies.filter((p) => !pedOut(p));
        if (!alive.length && j.t <= 0) {
          if (j.wave >= 2) {
            finish(true, 450 + Math.max(0, 200 - j.hits * 20), 'the shop is safe');
            return;
          }
          j.wave++;
          j.enemies = [];
          const n = j.wave === 1 ? 3 : 4;
          const s = j.shop;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const p = spawnKitPed(game, { x: s.x + Math.sin(a) * 24, z: s.z + Math.cos(a) * 24 }, THUG_KIT, 500 + j.wave * 10 + i, { tag: { thug: true } });
            if (!p) continue;
            p.armed = j.wave === 2 && i === 0;
            j.enemies.push(p);
            j.people.push(p);
          }
          game.hud?.setMission?.(`Protect the shop: wave ${j.wave} of 2`);
          notify(game, j.wave === 1 ? 'Here they come.' : 'They brought friends. One is armed.', 2500);
          j.t = 4;
        }
        for (const p of alive) {
          const dp = dist2(p.pos, P());
          if (p.armed && dp > 4 && dp < 30) {
            p.state = 'watch';
            p.stateT = 3;
            p.heading = Math.atan2(P().x - p.pos.x, P().z - p.pos.z);
            p._shot = (p._shot ?? 1.2) - dt;
            if (p._shot <= 0) {
              p._shot = 2 + Math.random();
              if (fireAtPlayer(game, p.pos, 0.25, 6)) j.hits++;
            }
          } else keepFighting(p);
        }
      },
    },
  ];
  const DEF = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  game.on?.('playerHit', () => {
    if (job?.def.id === 'protect') job.hits++;
  });

  function start(id) {
    const def = DEF[id];
    if (!def || job) return false;
    job = { def, people: [], marker: null };
    let ok = false;
    try {
      ok = def.start(job);
    } catch (e) {
      console.error('[jobs] start', e);
    }
    if (!ok) {
      job = null;
      notify(game, 'No work like that around here right now. Try another part of town.', 3000);
      return false;
    }
    notify(game, `${def.client}: ${def.blurb}`, 4500);
    game.emit?.('jobStart', { id });
    return true;
  }
  function board() {
    const html = `<h2>Side jobs</h2><div class="sub">Short work around town. Earned so far: ${fmt(S.earned)}</div>`;
    const acts = DEFS.map((d) => {
      const cd = (S.cooldown[d.id] || 0) - performance.now();
      return { label: `${d.name} · ${d.client}${S.done[d.id] ? ` (done ${S.done[d.id]}x)` : ''}`, price: cd > 0 ? `${Math.ceil(cd / 1000)} s` : d.pay, disabled: !!job || cd > 0, fn: () => { panel.hide(); start(d.id); } };
    });
    if (job) acts.push({ label: `Quit current job (${job.def.name})`, fn: () => { panel.hide(); cancel(false); } });
    acts.push({ label: 'Close', fn: () => panel.hide() });
    panel.show('jobs', html + DEFS.map((d) => `<div class="row"><span><b>${d.name}</b>: ${d.blurb}</span></div>`).join(''), acts);
  }

  game.updaters.push(function jobsTick(dt) {
    if (!(dt > 0) || game.ui?.paused) return;
    if (game.input.pressed('KeyK') && (canAct(game) || panel.owner === 'jobs')) {
      if (panel.open && panel.owner === 'jobs') panel.hide();
      else if (!panel.open) board();
    }
    if (!job) return;
    if (game.ui?.dead || game.ui?.arrested) {
      finish(false, 0, game.ui.dead ? 'you went down' : 'you got arrested');
      return;
    }
    try {
      job.def.tick(job, dt);
    } catch (e) {
      console.error('[jobs] tick', e);
      cancel(true);
    }
    if (job?.marker) job.marker.userData.ring.rotation.z += dt;
  });

  game.jobs = {
    list: DEFS,
    get active() {
      return job;
    },
    start,
    cancel: () => cancel(false),
    board,
    stats: S,
  };
}
