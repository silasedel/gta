// Crash injury (user: "if you crash the plane or any other vehicle you take a realistic amount of damage").
// Every vehicle kind (cars, bikes, boats, aircraft) emits game 'crash' { vehicle, impulse, dv?, speedKmh? } when it hits something hard.
// This turns the impact into damage to the PLAYER while the player is inside that vehicle, scaled by how hard the stop was:
//   dv (m/s, the speed lost in the impact)  ->  share of full health
//   below 5 m/s (18 km/h): a bump, nothing        10 m/s (36 km/h): about 9 %       15 m/s (54 km/h): about 25 %
//   20 m/s (72 km/h): about 46 %                    25 m/s (90 km/h): about 71 %      30+ m/s (108 km/h): lethal
// Planes are harsher (no airbag, a harder stop) and a destroyed aircraft kills whoever is in it. Armor soaks 80 % first, like gunfire.
// A short per-vehicle cooldown stops one scrape from counting twice. Notes: ?crashinjury=0 turns it off.
export const order = 190;
const OFF = typeof location !== 'undefined' && /[?&]crashinjury=0\b/.test(location.search);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function injuryFraction(dv, kind = 'car') {
  const k = kind === 'aircraft' ? 1.25 : kind === 'boat' ? 0.8 : kind === 'bike' ? 1.2 : 1;
  const x = clamp((dv - 5) / 25, 0, 1.2);
  return clamp(Math.pow(x, 1.5) * k, 0, 1.5);
}

export function initV2(game) {
  if (OFF) return;
  const last = new WeakMap();
  const P = () => game.player;
  const hurt = (amount, why) => {
    const p = P(); if (!p || !(amount > 0.5)) return;
    if (game.gameplay?.damagePlayer) { game.gameplay.damagePlayer(amount, why); return; }
    let a = amount;
    if (p.armor > 0) { const ab = Math.min(p.armor, a * 0.8); p.armor -= ab; a -= ab; }
    p.health = Math.max(0, (p.health ?? 100) - a);
    game.emit?.('playerHit', { damage: amount, from: why });
  };
  const mine = (v) => { const p = P(); return !!v && !!p && (v.playerDriven || p.state?.vehicle === v); };
  const kindOf = (v) => (v?.S && v?.T?.cls ? 'aircraft' : v?.isBoat ? 'boat' : (v?.isBike || v?.spec?.bike) ? 'bike' : 'car');

  game.on?.('crash', (e) => {
    const v = e?.vehicle; if (!mine(v)) return;
    const now = game.clock?.elapsed ?? 0, t0 = last.get(v) ?? -9; if (now - t0 < 0.45) return;
    const mass = v.spec?.mass || v.T?.mass || 1400;
    const dv = Number.isFinite(e.dv) ? e.dv : (e.impulse || 0) / mass;
    const f = injuryFraction(dv, kindOf(v));
    if (f <= 0) return;
    last.set(v, now);
    hurt(f * 100, 'crash');
    if (f > 0.35) game.hud?.notify?.('Heavy impact', 1200);
  });
  // an aircraft that is destroyed with the player inside kills them
  game.on?.('aircraft:destroyed', (e) => { if (mine(e?.vehicle)) hurt(1000, 'aircraft'); });
}
