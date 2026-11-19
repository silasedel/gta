// Pedestrian / NPC personalities (CHARACTER agent).
// Each profile tunes walk speed, idle choices, look-at behaviour and how the person reacts to the player and to
// incidents. Also used by other modules (e.g. INTERIORS staff) via createCharacter(game, { personality }).
//   walk      walk-speed multiplier
//   look      distance (m) at which they look at the player (0 = never), lookHold = seconds of attention
//   greet     chance to greet / wave at a passing player
//   shove     reaction when bumped: 'shove' (shoves back + argues), 'argue', 'apologise', 'flee', 'ignore'
//   fight     chance to fight back when hit
//   film      chance to film an incident instead of fleeing
//   cower     chance to cower when an incident is close
//   panic     incident radius multiplier (nervous people react from further away)
//   idles     preferred idle styles while standing (weighted list)
//   call      chance to be on a phone call while walking
//   sway      drunk weaving amplitude (rad)
//   voice     reaction voice bank hint for AUDIO: 'calm' | 'friendly' | 'rude' | 'nervous' | 'tough' | 'flirty' | 'drunk' | 'busy'
export const PERSONAS = {
  calm: {
    walk: 0.95,
    look: 6,
    lookHold: 1.5,
    greet: 0.05,
    shove: 'apologise',
    fight: 0.05,
    film: 0.25,
    cower: 0.15,
    panic: 0.9,
    idles: ['phone', null, null],
    call: 0.1,
    sway: 0,
    voice: 'calm',
  },
  friendly: {
    walk: 1.0,
    look: 9,
    lookHold: 2.5,
    greet: 0.45,
    shove: 'apologise',
    fight: 0.03,
    film: 0.3,
    cower: 0.15,
    panic: 1.0,
    idles: ['talk', 'talk', 'phone', null],
    call: 0.15,
    sway: 0,
    voice: 'friendly',
  },
  rude: {
    walk: 1.06,
    look: 6,
    lookHold: 1.0,
    greet: 0.0,
    shove: 'shove',
    fight: 0.35,
    film: 0.35,
    cower: 0.05,
    panic: 0.8,
    idles: ['phone', null],
    call: 0.25,
    sway: 0,
    voice: 'rude',
  },
  nervous: {
    walk: 1.12,
    look: 5,
    lookHold: 0.6,
    greet: 0.0,
    shove: 'flee',
    fight: 0.0,
    film: 0.03,
    cower: 0.5,
    panic: 1.8,
    idles: ['phone', null],
    call: 0.1,
    sway: 0,
    voice: 'nervous',
  },
  tough: {
    walk: 1.0,
    look: 8,
    lookHold: 3.0,
    greet: 0.05,
    shove: 'shove',
    fight: 0.75,
    film: 0.05,
    cower: 0.0,
    panic: 0.6,
    idles: [null, 'lean'],
    call: 0.05,
    sway: 0,
    voice: 'tough',
  },
  flirty: {
    walk: 0.9,
    look: 11,
    lookHold: 3.5,
    greet: 0.5,
    shove: 'argue',
    fight: 0.05,
    film: 0.4,
    cower: 0.1,
    panic: 1.0,
    idles: ['talk', 'phone', 'dance'],
    call: 0.2,
    sway: 0,
    voice: 'flirty',
  },
  drunk: {
    walk: 0.72,
    look: 7,
    lookHold: 2.0,
    greet: 0.35,
    shove: 'argue',
    fight: 0.3,
    film: 0.1,
    cower: 0.1,
    panic: 0.7,
    idles: ['dance', 'talk', null],
    call: 0.0,
    sway: 0.35,
    voice: 'drunk',
  },
  busy: {
    walk: 1.32,
    look: 2,
    lookHold: 0.3,
    greet: 0.0,
    shove: 'ignore',
    fight: 0.05,
    film: 0.05,
    cower: 0.1,
    panic: 1.1,
    idles: ['phone'],
    call: 0.6,
    sway: 0,
    voice: 'busy',
  },
  // staff archetypes (interiors / vendors)
  grumpy: {
    walk: 0.9,
    look: 6,
    lookHold: 2.0,
    greet: 0.0,
    shove: 'argue',
    fight: 0.4,
    film: 0.0,
    cower: 0.05,
    panic: 0.7,
    idles: ['lean', null],
    call: 0.0,
    sway: 0,
    voice: 'rude',
  },
  chatty: {
    walk: 1.0,
    look: 10,
    lookHold: 4.0,
    greet: 0.8,
    shove: 'apologise',
    fight: 0.02,
    film: 0.2,
    cower: 0.2,
    panic: 1.0,
    idles: ['talk', 'talk', 'talk'],
    call: 0.1,
    sway: 0,
    voice: 'friendly',
  },
  rushed: {
    walk: 1.45,
    look: 3,
    lookHold: 0.4,
    greet: 0.1,
    shove: 'ignore',
    fight: 0.0,
    film: 0.0,
    cower: 0.2,
    panic: 1.2,
    idles: [null],
    call: 0.0,
    sway: 0,
    voice: 'busy',
  },
  bored: {
    walk: 0.8,
    look: 4,
    lookHold: 1.0,
    greet: 0.05,
    shove: 'ignore',
    fight: 0.02,
    film: 0.1,
    cower: 0.2,
    panic: 0.9,
    idles: ['phone', 'phone', 'lean'],
    call: 0.0,
    sway: 0,
    voice: 'calm',
  },
};

// zone / time weighted choice of a personality for a pedestrian
export function pickPersona(zone, hour, rnd = Math.random) {
  const night = hour >= 21 || hour < 4;
  let w;
  switch (zone) {
    case 'business':
    case 'downtown':
      w = { busy: 5, calm: 3, rude: 2, friendly: 1, nervous: 1 };
      break;
    case 'nightlife':
      w = night
        ? { drunk: 4, flirty: 3, friendly: 2, rude: 2, tough: 2, calm: 1 }
        : { friendly: 3, calm: 3, flirty: 2, busy: 1, rude: 1 };
      break;
    case 'beach':
      w = { calm: 4, friendly: 4, flirty: 2, drunk: night ? 2 : 0.3, rude: 1, nervous: 0.5 };
      break;
    case 'port':
    case 'industrial':
      w = { tough: 4, busy: 3, calm: 2, rude: 2 };
      break;
    case 'residential':
    case 'park':
      w = { calm: 4, friendly: 3, nervous: 2, busy: 1, rude: 0.5 };
      break;
    default:
      w = {
        calm: 3,
        friendly: 2,
        busy: 2,
        rude: 1.5,
        nervous: 1.5,
        tough: 1,
        flirty: 1,
        drunk: night ? 1.5 : 0.1,
      };
  }
  let tot = 0;
  for (const k in w) tot += w[k];
  let r = rnd() * tot;
  for (const k in w) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return 'calm';
}
export const persona = (name) => PERSONAS[name] || PERSONAS.calm;
