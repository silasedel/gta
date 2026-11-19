// Talking to people (NPC-AI track). Walk up to anyone, press U: the camera eases to a two-shot and a dialogue
// wheel offers greet, compliment, insult, ask about the area, ask for directions, threaten, goodbye.
// Replies come from the person's voice group, mood, memory of the player and the hour; choices have consequences.
import * as THREE from 'three';
import { VOICE_GROUP } from './lines.js';
import { clamp } from './rand.js';
import { hasLOS } from '../gameplay/util.js';

// ---------------------------------------------------------------- replies: topic -> tier -> core lines
// tiers: warm (likes you / good mood), neutral, cold (you were rude before / bad mood)
const R = {
  greet: {
    warm: [
      'Hey! Good to see a friendly face.',
      "Hi there, how's your day going?",
      "Well hello! You look like you're having a good one.",
      "Hey you. What's new?",
      'Oh hi! I was just thinking this street needs more smiles.',
      "Hey, hey. Pull up, what's going on?",
    ],
    neutral: [
      'Hi. Can I help you?',
      'Hey. Something you need?',
      'Hello. Do I know you?',
      "Yeah, hi. What's up?",
      "Hey there. Make it quick, I'm on my way somewhere.",
      'Hi... you lost or something?',
    ],
    cold: [
      'You again. What now?',
      "Oh, it's you. Last time you were a real charmer.",
      'I remember you. Keep it short.',
      'Not you. Not today.',
      'What do you want? And watch your mouth this time.',
      "Mm. I haven't forgotten how you talked to me.",
    ],
  },
  compliment: {
    warm: [
      'Aw, stop it. You just made my whole day.',
      "Really? Thank you, that's so sweet.",
      'Ha! Okay, I like you already.',
      'You noticed? Nobody ever notices.',
      'That is the nicest thing a stranger said to me all week.',
      'Thank you! My cousin said it looked silly.',
    ],
    neutral: [
      'Oh. Thanks, I guess.',
      'Uh, thank you. Is this a sales pitch?',
      'Thanks. You want something?',
      "Okay, that's nice of you.",
      "Ha. Thanks. Didn't expect that.",
      'Appreciate it. Have a good one.',
    ],
    cold: [
      'Compliments now? After last time? No.',
      "Save it. I know what you're like.",
      'Nice try. Still not forgetting.',
      'Wow. Smooth. Still annoyed with you.',
      'You think a compliment fixes it? Cute.',
      "Uh huh. Whatever you're selling, no.",
    ],
  },
  insult: {
    warm: [
      'Wow. Okay. I thought you were nice.',
      "That's... that's really mean, you know that?",
      'Excuse me? Where did that come from?',
      'Ouch. Bad day or are you always like this?',
      "Okay, I'm walking away now.",
      'Seriously? I was being friendly.',
    ],
    neutral: [
      'Excuse me? Who raised you?',
      'Wow. Have a nice life.',
      'Say that again, I dare you.',
      'Real classy. Real classy.',
      'Get out of my face with that.',
      'Did you just insult me? On a Tuesday?',
    ],
    cold: [
      "Again with this? You're a broken record.",
      'Same mouth as last time, huh?',
      'You really came back for round two?',
      'I knew it. Some people never change.',
      'Keep talking and see what happens.',
      "You're lucky I'm in a hurry.",
    ],
  },
  area: {
    warm: [
      'Around {district}? Best part of the city, if you ask me.',
      'Here? Get a cafecito at the window on the corner, trust me.',
      'This part of {district} has the best food after dark.',
      'People are nice here. Mostly. Watch the drivers.',
      'I grew up around {district}. It changed a lot, but I love it.',
      "Go down to the water at sunset, it's free and it's beautiful.",
    ],
    neutral: [
      "It's {district}. Busy, loud, expensive.",
      "Traffic's bad, parking's worse. Welcome.",
      "It's fine. Rent's too high, like everywhere.",
      '{district}? Lots of new buildings, not a lot of shade.',
      "Some good spots, some tourist traps. You'll figure it out.",
      "It's alright. Keep your car locked.",
    ],
    cold: [
      'Look it up on your phone.',
      'Why would I tell you anything?',
      "It's a neighborhood. Go explore it somewhere else.",
      'Ask someone who likes you.',
      'Nope. Next question.',
      'You figure it out.',
    ],
  },
  directions: {
    warm: [
      "{place}? Easy. That way, {dir}, you can't miss it.",
      'Oh, {place}! Head {dir}, maybe {dist}. Tell them I said hi.',
      'You want {place}. Go {dir}, about {dist}. Want me to draw it?',
      '{place} is right over there, {dir}. {dist}, more or less.',
      'Sure! {place}, {dir}. Follow the palm trees, ha.',
      "That's {place}, {dir}, {dist}. Have fun!",
    ],
    neutral: [
      '{place}? That way. {dir}. Around {dist}.',
      'Go {dir}. {place} is about {dist}.',
      'Uh... {place}. {dir}, I think. {dist}?',
      "{dir}, {dist}. That's {place}.",
      "Pretty sure {place} is {dir}. Don't quote me.",
      "Keep going {dir}, you'll hit {place}.",
    ],
    cold: [
      '{place}? That way. Bye.',
      '{dir}. Now leave me alone.',
      "It's {dir}. Don't follow me.",
      'Somewhere {dir}. Good luck.',
      'Ugh. {place}, {dir}. We done?',
      'Figure it out. Fine, {dir}.',
    ],
  },
  threatBrave: {
    warm: ['Whoa. Okay, I misjudged you.', 'Really? I was being nice to you.'],
    neutral: [
      'You threatening me? Try it.',
      'Back up. Right now.',
      "Big talk. Let's see it.",
      "I've dealt with worse than you before breakfast.",
    ],
    cold: ['I knew you were trouble.', 'You want it? Come on then.'],
  },
  threatTimid: {
    warm: ["Please, I don't want any trouble!", "Okay, okay! I'm going!"],
    neutral: [
      "Don't hurt me, please!",
      "I'm leaving, I'm leaving!",
      'Help! Somebody help!',
      "I'm calling the police!",
    ],
    cold: ["I knew it, I'm calling 911!", 'Stay away from me!'],
  },
  bye: {
    warm: [
      'Bye! Come say hi again.',
      'Take care of yourself, okay?',
      'See you around, friend.',
      'Cuídate! Stay out of the sun.',
      'Nice talking to you!',
      "Later! Don't be a stranger.",
    ],
    neutral: [
      'Okay. Bye.',
      'See ya.',
      'Alright, later.',
      'Have a good one.',
      'Take it easy.',
      'Bye now.',
    ],
    cold: [
      'Finally.',
      "Don't come back.",
      'Yeah, go.',
      'Bye. Forever, hopefully.',
      'Good riddance.',
      'Keep walking.',
    ],
  },
};
// voice-group flavor added to the start or end of a reply
const TAGS = {
  warm: { pre: ['Ay, ', 'Oh, ', 'Honey, ', ''], post: [' Bendiciones.', ' Okay?', ' Ha!', ''] },
  kreyol: {
    pre: ['Eh, ', 'Mezanmi, ', 'Cheri, ', ''],
    post: [' Bondye bon.', ' Wi.', " N'ap boule.", ''],
  },
  tourist: {
    pre: ['Oh gosh, ', 'Wow, ', 'Um, ', ''],
    post: [" We're from Ohio, by the way.", ' This place is wild.', ' Ha!', ''],
  },
  elder: {
    pre: ['Mira, ', 'Oye, mijo, ', 'Ay, ', 'Chico, '],
    post: [' Así es.', ' Te lo digo yo.', ' Qué cosa.', ''],
  },
  gruff: {
    pre: ['Look, ', 'Listen, ', 'Pff. ', ''],
    post: [' Got it?', ' Capisce?', ' Done.', ''],
  },
  anxious: {
    pre: ['Um, ', 'Oh! ', 'Uh, sorry, ', ''],
    post: [' Sorry.', ' I think.', ' Is that okay?', ''],
  },
  chill: {
    pre: ['Yo, ', 'Bro, ', 'Dale, ', 'Ey, '],
    post: [' Easy.', ' You feel me?', ' Wepa.', ''],
  },
  pro: {
    pre: ['Right. ', 'Look, ', 'Okay. ', ''],
    post: [' I have a call.', ' Moving on.', ' Anyway.', ''],
  },
  slick: {
    pre: ['Ey, papi, ', 'Babe, ', 'Listen, ', ''],
    post: [' I got a guy, by the way.', ' Follow me online.', ' Ha.', ''],
  },
};
const TIME = {
  morning: ['Morning. ', 'Too early for this, but ', 'Before coffee? Okay. ', ''],
  afternoon: ['', 'In this heat? ', 'Lunch hour, so ', ''],
  evening: ['Evening. ', 'Long day, so ', '', "Sun's going down, "],
  night: ['At this hour? ', "It's late, but ", 'Night owl, huh? ', ''],
};
const PLAYER = {
  greet: ["Hey, how's it going?", 'Hi there.', "What's up?", 'Buenas.'],
  compliment: [
    'Love the {item}.',
    'That {item} looks great on you.',
    "You've got style.",
    'Nice {item}, seriously.',
  ],
  insult: [
    'Nice {item}. Did you lose a bet?',
    'You walk like a lost tourist.',
    "Move, you're blocking the sidewalk.",
    'Who dressed you?',
  ],
  area: ["What's this area like?", 'Anything good around here?', 'What do people do around here?'],
  directions: ['Which way to {place}?', 'How do I get to {place}?', 'Is {place} near here?'],
  threat: ['Give me your wallet.', 'Walk away before you get hurt.', 'You want problems?'],
  bye: ['See you around.', 'Take care.', 'Later.'],
};
// follow-up openers when the player comes back within about 90 s (short-term memory, playtest P6)
const FOLLOW_UP = {
  afterRude: [
    'You again? After what you just said?',
    'Seriously? You just insulted me. Walk away.',
    'Oh, now you want to talk? No.',
    "Round two? I don't think so.",
    'Still here? You said enough already.',
  ],
  afterKind: [
    "Back again? Okay, you're sweet, I'll give you that.",
    'Hi again! Still smiling about what you said.',
    "Oh, it's you again. Hi.",
  ],
  afterDirections: [
    "Lost again already? It's the way I pointed.",
    'Did you find it? No? Okay, listen this time.',
  ],
  again: ['Hey, we just talked. What else?', "Back so soon? What's up?", 'Forgot something?'],
};

const OPTIONS = [
  { key: 'greet', label: 'Greet' },
  { key: 'compliment', label: 'Compliment' },
  { key: 'insult', label: 'Insult' },
  { key: 'area', label: 'Ask about the area' },
  { key: 'directions', label: 'Ask for directions' },
  { key: 'threat', label: 'Threaten' },
  { key: 'bye', label: 'Goodbye' },
];
const ITEM_WORD = {
  hat: 'hat',
  sunglasses: 'shades',
  glasses: 'glasses',
  headphones: 'headphones',
  chain: 'chain',
  briefcase: 'briefcase',
  purse: 'bag',
  tote: 'bag',
  backpack: 'backpack',
  shoppingBags: 'shopping haul',
  camera: 'camera',
};

export function talkLineCount() {
  let n = 0;
  for (const t in R) for (const k in R[t]) n += R[t][k].length;
  return n;
}

export function createTalk(game, people) {
  const memory = new Map(); // identity id -> { talks, rude, warm, last }
  const recent = [];
  const recentSet = new Set();
  const log = [];
  let convo = null; // { ped, k, out, saved: { pos, quat } }
  let prompted = null;

  // ---------------------------------------------------------------- UI
  const css = document.createElement('style');
  css.textContent = `
    .npcTalkPrompt { position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 41;
      padding: 7px 14px; border-radius: 18px; background: rgba(18,20,24,0.78); color: #f4f1ea;
      font: 600 14px system-ui, sans-serif; pointer-events: none; display: none; }
    .npcTalkPrompt b { display: inline-block; min-width: 18px; margin-right: 8px; padding: 1px 6px; border-radius: 5px;
      background: #f4f1ea; color: #15171a; text-align: center; }
    .npcWheel { position: fixed; left: 50%; top: 64%; width: 0; height: 0; z-index: 42; display: none; pointer-events: none; }
    .npcWheel div { position: absolute; transform: translate(-50%, -50%); padding: 8px 13px; border-radius: 16px;
      background: rgba(18,20,24,0.82); color: #f4f1ea; font: 600 14px system-ui, sans-serif; white-space: nowrap;
      border: 1px solid rgba(255,255,255,0.18); }
    .npcWheel div i { font-style: normal; color: #ffcf6e; margin-right: 7px; }
    .npcWheel .hub { padding: 10px 16px; background: rgba(250,248,242,0.94); color: #1d1d1f; text-align: center; }
    .npcWheel .hub small { display: block; font-weight: 500; opacity: 0.7; }`;
  document.head.appendChild(css);
  const prompt = document.createElement('div');
  prompt.className = 'npcTalkPrompt';
  document.body.appendChild(prompt);
  const wheel = document.createElement('div');
  wheel.className = 'npcWheel';
  document.body.appendChild(wheel);

  function showWheel(ped) {
    const id = ped.identity;
    const mem = memory.get(id.id);
    const R0 = 150;
    let html = `<div class="hub" style="left:0;top:0">${id.first}, ${id.age}<small>${id.job} · ${moodWord(ped)}${mem?.rude ? ' · remembers you were rude' : mem?.talks ? ' · knows you' : ''}</small></div>`;
    OPTIONS.forEach((o, i) => {
      const a = -Math.PI / 2 + (i / OPTIONS.length) * Math.PI * 2;
      const x = Math.cos(a) * R0 * 1.25;
      const y = Math.sin(a) * R0 * 0.72;
      html += `<div style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px"><i>${i + 1}</i>${o.label}</div>`;
    });
    wheel.innerHTML = html;
    wheel.style.display = 'block';
  }
  const moodWord = (ped) => {
    const m = ped.mood ?? 0.5;
    return m > 0.72
      ? 'cheerful'
      : m > 0.55
        ? 'relaxed'
        : m > 0.4
          ? 'so-so'
          : m > 0.25
            ? 'grumpy'
            : 'in a foul mood';
  };

  // ---------------------------------------------------------------- picking lines
  function pick(arr, salt) {
    for (let k = 0; k < 12; k++) {
      const s = arr[(Math.random() * arr.length) | 0];
      if (!recentSet.has(s + salt)) return s;
    }
    return arr[(Math.random() * arr.length) | 0];
  }
  function remember(s) {
    recent.push(s);
    recentSet.add(s);
    if (recent.length > 160) recentSet.delete(recent.shift());
  }
  function hourBand() {
    const h = (((game.timeOfDay ?? 14) % 24) + 24) % 24;
    return h >= 5 && h < 11.5 ? 'morning' : h < 17.5 ? 'afternoon' : h < 21.5 ? 'evening' : 'night';
  }
  function tierFor(ped) {
    const mem = memory.get(ped.identity.id);
    if (mem?.rude || (ped.mood ?? 0.5) < 0.3) return 'cold';
    if (
      (mem?.warm || 0) > 0 ||
      (ped.mood ?? 0.5) > 0.62 + (1 - ped.identity.traits.kindness) * 0.15
    )
      return 'warm';
    return 'neutral';
  }
  function compose(ped, topic, vars) {
    const group = VOICE_GROUP[ped.identity.voice] || 'warm';
    const tier = tierFor(ped);
    const pool = R[topic][tier] || R[topic].neutral;
    // try combinations until one has not been said recently
    let text = '';
    for (let k = 0; k < 10; k++) {
      const core = pick(pool, '');
      const T = TAGS[group];
      const pre = topic === 'greet' || topic === 'bye' ? pick(TIME[hourBand()], '') : '';
      const tag = Math.random() < 0.6 ? pick(T.pre, '') : '';
      const post = Math.random() < 0.5 ? pick(T.post, '') : '';
      const lead = pre || tag;
      let core2 = core;
      // after a lead-in that runs on ("Look, ", "It's late, but ") the reply continues in lower case
      if (lead && /[,a-z] $/.test(lead) && !/^I\b/.test(core))
        core2 = core.charAt(0).toLowerCase() + core.slice(1);
      text = lead + core2 + post;
      text = text.replace(/\{(\w+)\}/g, (m, k2) => vars[k2] ?? m);
      if (!recentSet.has(text)) break;
    }
    remember(text);
    return text;
  }

  // ---------------------------------------------------------------- places for directions
  function nearbyPlace(ped) {
    const city = game.city;
    const here = ped.pos;
    let curStreet = null;
    try {
      curStreet = city?.streetNameAt?.(here.x, here.z) || null;
    } catch (e) {
      /* */
    }
    const cands = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const d of [120, 260, 420]) {
        const x = here.x + Math.sin(a) * d;
        const z = here.z + Math.cos(a) * d;
        let name = null;
        try {
          name = city?.streetNameAt?.(x, z) || null;
        } catch (e) {
          /* */
        }
        if (!name) {
          try {
            name = city?.districtAt?.(x, z) || null;
          } catch (e) {
            /* */
          }
        }
        if (name && name !== curStreet && !/water|bay$/i.test(name))
          cands.push({ name: String(name), x, z, d });
      }
    }
    if (!cands.length) return null;
    return cands[(Math.random() * cands.length) | 0];
  }
  const compass = (dx, dz) => {
    const a = Math.atan2(dx, -dz); // x east, z south: north is -z
    return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][
      ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
    ];
  };

  // ---------------------------------------------------------------- conversation flow
  function say(ped, text, ms) {
    people.bubble?.(ped, text, ms);
    ped.speakT = Math.min(4.5, 0.9 + text.length * 0.05);
    log.push({ who: ped.identity?.name || 'Nico', text });
    if (log.length > 300) log.shift();
  }
  function playerSays(text) {
    people.bubble?.(
      { pos: game.player.position, look: { height: 1.8 }, active: true, isPlayer: true },
      text,
      2600,
    );
    log.push({ who: 'Nico', text });
  }
  function itemOf(ped) {
    const acc = ped.look?.acc || [];
    const a = acc.find((x) => ITEM_WORD[x.kind]);
    return a ? ITEM_WORD[a.kind] : ped.look?.cls === 'business' ? 'suit' : 'outfit';
  }

  function start(ped) {
    if (!ped?.identity || convo) return false;
    const cam = game.camera;
    convo = {
      ped,
      k: 0,
      out: false,
      saved: { pos: cam.position.clone(), quat: cam.quaternion.clone() },
      choices: 0,
    };
    ped.state = 'convo';
    ped.pending = null;
    ped.leaveGroup = true;
    ped.stateT = 60;
    const mem = memory.get(ped.identity.id) ||
      ped._talkMem || { talks: 0, rude: false, warm: 0, last: 0 };
    memory.set(ped.identity.id, mem);
    ped._talkMem = mem;
    // short-term memory (playtest P6): talking again right after a conversation picks up where it left off
    const now = game.clock?.elapsed ?? 0;
    const since = mem.talks > 0 ? now - (mem.endedAt ?? mem.last) : 1e9;
    let opener = null;
    if (since < 90) {
      if (mem.lastTopic === 'insult' || mem.lastTopic === 'threat') {
        opener = pick(FOLLOW_UP.afterRude, '');
        ped.mood = clamp((ped.mood ?? 0.5) - 0.08);
      } else if (mem.lastTopic === 'compliment') {
        opener = pick(FOLLOW_UP.afterKind, '');
      } else if (mem.lastTopic === 'directions') {
        opener = pick(FOLLOW_UP.afterDirections, '');
      } else {
        opener = pick(FOLLOW_UP.again, '');
      }
    }
    say(ped, opener || compose(ped, 'greet', {}));
    mem.talks++;
    mem.last = now;
    // someone who was just insulted does not stand around for a second round
    if (opener && (mem.lastTopic === 'insult' || mem.lastTopic === 'threat') && since < 30) {
      convo.shortFuse = true;
      setTimeout(() => {
        if (convo?.ped === ped && !convo.out && convo.choices === 0) {
          end(
            ped.identity.traits.temper > 0.6 && ped.identity.traits.courage > 0.45
              ? 'swing'
              : 'leave',
          );
        }
      }, 3500);
    }
    showWheel(ped);
    game.cameraOverride = cameraTwoShot;
    try {
      game.emit?.('npcTalk', { phase: 'start', name: ped.identity.name });
    } catch (e) {
      /* */
    }
    return true;
  }

  function choose(i) {
    if (!convo || convo.out) return;
    const o = OPTIONS[i];
    if (!o) return;
    const ped = convo.ped;
    const id = ped.identity;
    const T = id.traits;
    const mem = memory.get(id.id);
    if (o.key !== 'bye' || !mem.lastTopic) {
      mem.lastTopic = o.key;
    }
    const place = o.key === 'directions' ? nearbyPlace(ped) : null;
    const vars = {
      item: itemOf(ped),
      district: (() => {
        try {
          return game.city?.districtAt?.(ped.pos.x, ped.pos.z) || 'this neighborhood';
        } catch (e) {
          return 'this neighborhood';
        }
      })(),
      place: place?.name || 'the beach',
    };
    if (place) {
      vars.dir = compass(place.x - ped.pos.x, place.z - ped.pos.z);
      vars.dist =
        place.d < 180
          ? 'a couple of blocks'
          : place.d < 330
            ? 'five minutes walking'
            : 'ten minutes walking';
    }
    const pl = PLAYER[o.key];
    playerSays(pick(pl, '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m));
    convo.choices++;
    const after = (fn, s) =>
      setTimeout(() => {
        if (convo?.ped === ped) fn();
      }, s * 1000);

    if (o.key === 'greet') {
      ped.mood = clamp((ped.mood ?? 0.5) + 0.03 * T.kindness);
      after(() => say(ped, compose(ped, 'greet', vars)), 0.9);
    } else if (o.key === 'compliment') {
      const pleased = T.vanity * 0.5 + T.kindness * 0.3 + 0.2;
      ped.mood = clamp((ped.mood ?? 0.5) + 0.12 * pleased);
      if (!mem.rude) mem.warm++;
      after(() => say(ped, compose(ped, 'compliment', vars)), 0.9);
    } else if (o.key === 'insult') {
      after(() => say(ped, compose(ped, 'insult', vars)), 0.8);
      mem.rude = true;
      mem.warm = 0;
      ped.mood = clamp((ped.mood ?? 0.5) - 0.25);
      if (T.temper > 0.6 && T.courage > 0.45) {
        after(() => end('swing'), 2.2);
      } else if (T.courage < 0.3) {
        after(() => end('flee'), 2.2);
      } else {
        after(() => end('leave'), 2.6);
      }
    } else if (o.key === 'area') {
      after(() => say(ped, compose(ped, 'area', vars)), 0.9);
    } else if (o.key === 'directions') {
      if (place) {
        ped.pointAt = { x: place.x, z: place.z };
        ped.waveT = 2.2;
      }
      after(() => say(ped, compose(ped, 'directions', vars)), 0.9);
    } else if (o.key === 'threat') {
      mem.rude = true;
      mem.warm = 0;
      const brave = T.courage > 0.62 || (T.courage > 0.45 && T.temper > 0.65);
      after(() => say(ped, compose(ped, brave ? 'threatBrave' : 'threatTimid', vars)), 0.7);
      after(
        () =>
          end(brave ? (T.temper > 0.5 ? 'swing' : 'leave') : T.honesty > 0.4 ? 'call911' : 'flee'),
        2.0,
      );
    } else if (o.key === 'bye') {
      after(() => say(ped, compose(ped, 'bye', vars)), 0.6);
      after(() => end('leave'), 1.8);
    }
  }

  function end(outcome = 'leave') {
    if (!convo) return;
    const ped = convo.ped;
    try {
      const m = memory.get(ped.identity?.id) || ped._talkMem;
      if (m) {
        m.endedAt = game.clock?.elapsed ?? 0;
        m.lastOutcome = outcome;
      }
    } catch (e) {
      // memory is best effort
    }
    convo.out = true;
    wheel.style.display = 'none';
    ped.pointAt = null;
    const pp = game.player.position;
    if (ped.active && !ped.dead && ped.state === 'convo') {
      if (outcome === 'swing') {
        ped.state = 'fight';
        ped.stateT = 6 + ped.identity.traits.temper * 5;
        ped.hitCd = 0.4;
        ped.guard = true;
        ped.foughtBack = true;
      } else if (outcome === 'flee') {
        ped.state = 'flee';
        ped.fleeT = 5;
        ped.threat = { x: pp.x, z: pp.z };
        ped.scream = true;
      } else if (outcome === 'call911') {
        ped.state = 'walk';
        ped.pending = { react: 'call911', x: pp.x, z: pp.z, t: 0.6, src: 'threat' };
        ped.threat = { x: pp.x, z: pp.z };
      } else {
        ped.state = 'walk';
        ped.act = 'walk';
      }
      ped.idleStyle = null;
    }
    try {
      game.emit?.('npcTalk', { phase: 'end', outcome, name: ped.identity?.name });
    } catch (e) {
      /* */
    }
  }

  // ---------------------------------------------------------------- camera two-shot
  const _mid = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);
  function cameraTwoShot(dt, camera) {
    if (!convo) return false;
    const ped = convo.ped;
    const pp = game.player.position;
    convo.k = clamp(convo.k + (convo.out ? -dt * 1.6 : dt * 1.4));
    if (convo.out && convo.k <= 0.01) {
      convo = null;
      game.cameraOverride = null;
      return false;
    }
    const dx = ped.pos.x - pp.x;
    const dz = ped.pos.z - pp.z;
    const d = Math.hypot(dx, dz) || 1;
    _mid.set((pp.x + ped.pos.x) / 2, Math.max(pp.y, ped.pos.y) + 1.55, (pp.z + ped.pos.z) / 2);
    // to the side of the line between them, a little back toward the player
    const sx = -dz / d;
    const sz = dx / d;
    _pos.set(_mid.x + sx * 2.9 - (dx / d) * 0.9, _mid.y + 0.15, _mid.z + sz * 2.9 - (dz / d) * 0.9);
    _m.lookAt(_pos, _mid, _up);
    _q.setFromRotationMatrix(_m);
    const e = convo.k * convo.k * (3 - 2 * convo.k);
    camera.position.copy(convo.saved.pos).lerp(_pos, e);
    camera.quaternion.copy(convo.saved.quat).slerp(_q, e);
    camera.updateMatrixWorld();
    return true;
  }

  // ---------------------------------------------------------------- talking motion (after the animation pose)
  const t0 = performance.now();
  function speechMotion(ped) {
    if (!(ped.speakT > 0) || !ped.char) return;
    const t = (performance.now() - t0) / 1000;
    const head = ped.char.getBone?.('Head');
    if (!ped._jaw) {
      ped._jaw = { bone: null };
      ped.char.root.traverse((o) => {
        if (o.isBone && /jaw/i.test(o.name)) ped._jaw.bone = o;
      });
    }
    const open = Math.abs(Math.sin(t * 13.0)) * (0.5 + 0.5 * Math.sin(t * 3.1));
    if (ped._jaw.bone) ped._jaw.bone.rotation.x += open * 0.22;
    if (head) {
      head.rotation.x += open * 0.05 - 0.02;
      head.rotation.y += Math.sin(t * 1.7) * 0.06;
    }
  }
  const scene = game.scene;
  const prevBR = scene.onBeforeRender;
  scene.onBeforeRender = function (...args) {
    try {
      for (const p of game.peds.list)
        if (p.active && p.speakT > 0 && p.root?.visible) speechMotion(p);
    } catch (e) {
      /* never break rendering */
    }
    if (prevBR) return prevBR.apply(this, args);
  };

  // ---------------------------------------------------------------- input and per-frame
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (convo && !convo.out) {
      const n = Number(e.key);
      if (n >= 1 && n <= OPTIONS.length) {
        choose(n - 1);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyU' || e.code === 'Escape') {
        end('leave');
        return;
      }
    } else if (e.code === 'KeyU' && prompted && !convo) {
      start(prompted);
    }
  });
  let losPed = null,
    losT = 0,
    losOK = true;
  const _lc = new THREE.Vector3(),
    _le = new THREE.Vector3();
  function nearestTalkable() {
    const P = game.player;
    if (!P?.position || P.state?.inVehicle) return null;
    const pp = P.position;
    const fx = Math.sin(P.heading || 0);
    const fz = Math.cos(P.heading || 0);
    let best = null;
    let bd = 3.2;
    for (const p of game.peds.list) {
      if (!p.active || p.dead || !p.identity || p.isCop) continue;
      if (['flee', 'fight', 'down', 'dead', 'gettingUp', 'swim', 'cower'].includes(p.state))
        continue;
      const dx = p.pos.x - pp.x;
      const dz = p.pos.z - pp.z;
      const d = Math.hypot(dx, dz);
      if (d > bd) continue;
      if (d > 1.2 && (dx * fx + dz * fz) / d < 0.2) continue;
      if (!p.char || p.root?.visible === false) continue; // no model shown: nobody to talk to
      bd = d;
      best = p;
    }
    // QA: "Talk to Chad" showed for a man hidden behind a dumpster: the person must be in plain sight of Nico and of
    // the camera (static world: walls, dumpsters, props with colliders); re-checked 4x a second
    if (best) {
      const t = performance.now();
      if (best !== losPed || t - losT > 250) {
        losPed = best;
        losT = t;
        const chest = _lc.set(best.pos.x, best.pos.y + 1.3, best.pos.z);
        losOK =
          hasLOS(game, _le.set(pp.x, pp.y + 1.55, pp.z), chest) &&
          (!game.camera || hasLOS(game, game.camera.position, chest));
      }
      if (!losOK) return null;
    }
    return best;
  }
  function update(dt) {
    for (const p of game.peds.list) if (p.speakT > 0) p.speakT -= dt;
    if (convo && !convo.out) {
      const ped = convo.ped;
      const pp = game.player.position;
      if (
        !ped.active ||
        ped.dead ||
        ped.state !== 'convo' ||
        Math.hypot(ped.pos.x - pp.x, ped.pos.z - pp.z) > 7
      )
        end('leave');
    }
    prompted = convo ? null : nearestTalkable();
    if (prompted) {
      prompt.innerHTML = `<b>U</b>Talk to ${prompted.identity.first}`;
      prompt.style.display = 'block';
    } else {
      prompt.style.display = 'none';
    }
  }

  return {
    update,
    start,
    choose,
    end,
    get active() {
      return convo && !convo.out ? convo.ped : null;
    },
    memory: () => Object.fromEntries(memory),
    log: () => log.slice(),
    lineCount: talkLineCount,
  };
}
