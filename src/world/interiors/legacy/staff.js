// Venue staff personas (INTERIORS agent): named characters with a personality, a behaviour that fits the place,
// and lines for the player's actions. All names are invented.
import { srng } from './types.js';
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

const FIRST = {
  m: [
    'Hiro',
    'Ramón',
    'Tomás',
    'Dario',
    'Marco',
    'Luis',
    'Kenji',
    'Andre',
    'Felix',
    'Omar',
    'Rafi',
    'Gus',
    'Teo',
    'Jamal',
    'Sal',
    'Benny',
    'Rico',
    'Wes',
    'Malik',
    'Ike',
  ],
  f: [
    'Rosa',
    'Yuki',
    'Marisol',
    'Lexi',
    'Nadia',
    'Carmen',
    'Bea',
    'Tasha',
    'Lucía',
    'Mae',
    'Priya',
    'Dina',
    'Ivy',
    'Coco',
    'Gloria',
    'Remy',
    'Sofía',
    'Jade',
    'Pilar',
    'Kiki',
  ],
};
// behaviour keys: counter, wipe, waiter, bartend, chef, door, dj, cook, browse-helper
const VENUE = {
  sushi: [
    ['chef', 'Chef', 'polite', 'chef'],
    ['waiter', '', 'rushed', 'waiter'],
  ],
  cuban: [
    ['owner', 'Don', 'gruff', 'wipe'],
    ['waiter', '', 'chatty', 'waiter'],
  ],
  pizza: [
    ['pizzaiolo', '', 'chatty', 'cook'],
    ['waiter', '', 'rushed', 'waiter'],
  ],
  burger: [
    ['cashier', '', 'bored', 'counter'],
    ['cook', '', 'gruff', 'cook'],
  ],
  taqueria: [
    ['taquero', '', 'chatty', 'cook'],
    ['cashier', '', 'polite', 'counter'],
  ],
  steak: [
    ['host', '', 'polite', 'counter'],
    ['waiter', '', 'rushed', 'waiter'],
    ['chef', 'Chef', 'gruff', 'cook'],
  ],
  seafood: [
    ['shucker', '', 'chatty', 'cook'],
    ['waiter', '', 'rushed', 'waiter'],
  ],
  diner: [
    ['cook', '', 'gruff', 'cook'],
    ['waitress', '', 'chatty', 'waiter'],
  ],
  wok: [
    ['chef', 'Chef', 'rushed', 'cook'],
    ['cashier', '', 'bored', 'counter'],
  ],
  poke: [['server', '', 'chatty', 'counter']],
  juice: [['barista', '', 'chatty', 'counter']],
  coffee: [
    ['barista', '', 'bored', 'counter'],
    ['barista', '', 'polite', 'wipe'],
  ],
  tiki: [
    ['bartender', '', 'flair', 'bartend'],
    ['waiter', '', 'chatty', 'waiter'],
  ],
  lounge: [
    ['mixologist', '', 'flair', 'bartend'],
    ['host', '', 'polite', 'counter'],
  ],
  sports: [
    ['bartender', '', 'chatty', 'bartend'],
    ['waiter', '', 'rushed', 'waiter'],
  ],
  wine: [['sommelier', '', 'polite', 'bartend']],
  dive: [['bartender', '', 'gruff', 'bartend']],
  club: [
    ['bartender', '', 'flair', 'bartend'],
    ['dj', 'DJ', 'chatty', 'dj'],
    ['bouncer', '', 'tough', 'door'],
  ],
  gelato: [['server', '', 'chatty', 'counter']],
};
const SHOP = {
  convenience: [['clerk', '', 'bored', 'counter']],
  bodega: [['owner', 'Don', 'gruff', 'wipe']],
  pharmacy: [['pharmacist', 'Dr.', 'nervous', 'counter']],
  guns: [['owner', '', 'tough', 'door']],
  electronics: [['tech', '', 'polite', 'counter']],
  clothing: [['stylist', '', 'chatty', 'counter']],
  beauty: [['artist', '', 'chatty', 'counter']],
  jewelry: [['jeweler', '', 'nervous', 'counter']],
  pawn: [['owner', '', 'gruff', 'counter']],
  bank: [['teller', '', 'polite', 'counter']],
  barber: [['barber', '', 'chatty', 'counter']],
  salon: [['stylist', '', 'chatty', 'counter']],
  laundromat: [['attendant', '', 'bored', 'wipe']],
  liquor: [['clerk', '', 'gruff', 'counter']],
  auto: [['parts guy', '', 'polite', 'counter']],
  sport: [['coach', '', 'chatty', 'counter']],
  surf: [['shaper', '', 'chatty', 'counter']],
  souvenir: [['clerk', '', 'chatty', 'counter']],
  hardware: [['clerk', '', 'gruff', 'counter']],
  grocery: [['cashier', '', 'bored', 'counter']],
  cafe: [['barista', '', 'chatty', 'counter']],
  restaurant: [['host', '', 'polite', 'counter']],
  bar: [['bartender', '', 'chatty', 'bartend']],
  fastfood: [['cashier', '', 'bored', 'counter']],
  icecream: [['server', '', 'chatty', 'counter']],
  club: [['bartender', '', 'flair', 'bartend']],
};
// lines by personality and event
const LINES = {
  polite: {
    enter: ['Welcome! Please, come in.', 'Good to see you.', 'Welcome in.'],
    buy: ['Thank you so much.', 'Enjoy!'],
    steal: ['Excuse me — you need to pay for that.'],
    rob: ['Please, stay calm… take it.'],
    punch: ['Please, no trouble here.'],
  },
  gruff: {
    enter: ['Yeah, yeah, come in.', '¿Qué pasa? What do you want?', 'Make it quick.'],
    buy: ['Next!', "There. Don't say I never gave you nothing."],
    steal: ['Hey! I SAW that. Put it back!'],
    rob: ["You're gonna regret this…"],
    punch: ['Out of my shop!'],
  },
  chatty: {
    enter: [
      "Heyyy! First time here? You'll love it.",
      'Welcome in, babe! Grab a seat anywhere.',
      'Oh, perfect timing!',
    ],
    buy: ['Great choice, honestly my favourite.', 'Enjoy, come back soon!'],
    steal: ['Um… you forgot to pay, hon.'],
    rob: ["Okay okay okay, don't shoot!"],
    punch: ['Whoa, whoa! Chill!'],
  },
  rushed: {
    enter: ['Be right with you!', 'One sec — hot plate!'],
    buy: ['Got it, got it.'],
    steal: ['Hey — wait!'],
    rob: ['Not today, please…'],
    punch: ['Hey!'],
  },
  bored: {
    enter: ['…hey.', 'Welcome to… whatever.', 'Mm-hm.'],
    buy: ['Cool.', "Receipt's in the bag. Or not."],
    steal: ['Bro. Cameras. Seriously?'],
    rob: ["I don't get paid enough for this."],
    punch: ['Dude, what?'],
  },
  nervous: {
    enter: ['Oh! H-hello. Can I help you?'],
    buy: ['Th-thank you.'],
    steal: ["I, uh, I'm calling someone…"],
    rob: ['P-please! Take it! Take everything!'],
    punch: ['Security! Somebody!'],
  },
  tough: {
    enter: ["Hands where I can see 'em, friend.", 'Look all you want. Touch, you buy.'],
    buy: ['Pleasure doing business.'],
    steal: ["Try that again and you'll leave on a stretcher."],
    rob: ['Bad idea, pal.'],
    punch: ['You just picked the wrong store.'],
  },
  flair: {
    enter: ['Welcome to the show!', 'What are we celebrating tonight?'],
    buy: ['One for you… and a little flair!'],
    steal: ['Nice try, sticky fingers.'],
    rob: ["Easy! The bar's all yours…"],
    punch: ['Not cool, man.'],
  },
};
export function makeStaff(s, theme, seed) {
  const r = srng(seed * 17 + 3);
  const roles = (theme && VENUE[theme.key]) || SHOP[s.type] || [['clerk', '', 'polite', 'counter']];
  return roles.map(([role, title, personality, behaviour], i) => {
    const gender = r() < 0.5 ? 'f' : 'm';
    const first = pick(r, FIRST[gender]);
    const t = title === 'Don' && gender === 'f' ? 'Doña' : title;
    return {
      role,
      behaviour,
      personality,
      gender,
      name: first,
      label: (t ? t + ' ' : '') + first,
      index: i,
      theme: theme?.key || null,
    };
  });
}
// venue-flavoured greetings (only for warm personalities; a gruff owner stays gruff)
const THEME_ENTER = {
  sushi: ['Irasshaimase!', 'Irasshaimase — counter seat is free.'],
  cuban: ['¡Bienvenido! Cafecito?', '¡Oye, pasa, pasa!'],
  taqueria: ['¡Bienvenidos! Pastor just came off the trompo.'],
  tiki: ['Aloha! Grab a mug.'],
  poke: ['Aloha! Build your bowl.'],
  pizza: ['Benvenuti! Slice or a whole pie?'],
  wok: ['Welcome, welcome! Sit anywhere.'],
  steak: ['Good evening. Your table is ready.'],
  wine: ['Good evening — something red tonight?'],
  diner: ['Sit anywhere, hon. Coffee?'],
  club: ['Wristband? Go on in.'],
};
export function line(persona, event, r = Math.random) {
  const L = LINES[persona?.personality] || LINES.polite;
  let a = L[event] || L.enter;
  if (
    event === 'enter' &&
    THEME_ENTER[persona?.theme] &&
    /polite|friendly|chatty|flair/.test(persona.personality || 'polite') &&
    r() < 0.6
  )
    a = THEME_ENTER[persona.theme];
  return `${persona.label}: "${a[Math.floor(r() * a.length) % a.length]}"`;
}
