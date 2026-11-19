// Southline phone (Phase F1): the story cast in Contacts and their short subtitled calls.
// Each call is a few lines ({ who, text }); the phone shows them on the call screen, game.characters.call(id) shows
// them as subtitles. Every line also fires game.emit('call:line', { contact, who, text, index }) so recorded voice
// lines can be hooked in later (look up `contact` + `index`).
// The other protagonist (Mari while you play Nico, Nico while you play Mari) comes from game.characters: calling them
// asks for help (they come and follow you) or sends them off again.

export const STORY_CONTACTS = [
  { id: 'vale', name: 'Vale', role: 'Boss', place: 'Key Largo marina', kind: 'story', fav: true },
  { id: 'dex', name: 'Dex', role: 'Crew', place: 'Key Largo', kind: 'story' },
  { id: 'lou', name: 'Lou', role: 'Crew', place: 'Key Largo', kind: 'story' },
  { id: 'cisco', name: 'Cisco', role: 'Pilot', place: 'The Glades', kind: 'story' },
];

// conversations per contact; one is picked per call (in turn). `me` is replaced with the player's name.
const CALLS = {
  vale: [
    [
      { who: 'me', text: 'Vale. Anything for me?' },
      { who: 'Vale', text: 'When there is, you will know. Keep your phone on.' },
    ],
    [
      { who: 'me', text: 'Just checking in.' },
      { who: 'Vale', text: 'Do not check in. Work comes to you, not the other way around.' },
      { who: 'Vale', text: 'Stay close to the water.' },
    ],
  ],
  dex: [
    [
      { who: 'Dex', text: 'Yo. You good?' },
      { who: 'me', text: 'Good. You?' },
      { who: 'Dex', text: 'Fixing the outboard again. Lou says hi. Lou does not say hi.' },
    ],
    [
      { who: 'Dex', text: 'If this is about the boat, it was like that when I got it.' },
      { who: 'me', text: 'Sure it was.' },
    ],
  ],
  lou: [
    [
      { who: 'Lou', text: 'What.' },
      { who: 'me', text: 'Nothing. Seeing if you pick up.' },
      { who: 'Lou', text: 'I picked up. Bye.' },
    ],
    [
      { who: 'Lou', text: 'Dex owes me forty bucks. Tell him I know where he sleeps.' },
      { who: 'me', text: 'On the boat.' },
      { who: 'Lou', text: 'Exactly.' },
    ],
  ],
  cisco: [
    [
      { who: 'Cisco', text: 'Signal is bad out here. Make it quick.' },
      { who: 'me', text: 'How is the plane?' },
      { who: 'Cisco', text: 'She flies. Mostly. Call me when you need a ride.' },
    ],
    [
      { who: 'Cisco', text: 'Mosquitoes are the size of my hand today.' },
      { who: 'me', text: 'Stay safe out there.' },
    ],
  ],
};

const count = {};

// The other protagonist(s) as contacts (not the one you are playing).
export function heroContacts(game) {
  const C = game.characters;
  if (!C?.list) return [];
  return C.list
    .filter((c) => !c.active)
    .map((c) => ({
      id: c.id,
      name: c.name,
      role: c.follow ? 'With you' : c.role || 'Partner',
      place: c.place || '',
      kind: 'hero',
      fav: true,
    }));
}

// The call for a contact id: { lines: [{ who, text }], onEnd() } or null (not a story contact).
export function callScript(game, id) {
  const C = game.characters;
  if (C?.list?.some((c) => c.id === id)) return C.callScript?.(id) || null;
  const sets = CALLS[id];
  if (!sets) return null;
  const n = count[id] || 0;
  count[id] = n + 1;
  const me = C?.active?.name || 'Nico';
  return {
    lines: sets[n % sets.length].map((l) => ({ who: l.who === 'me' ? me : l.who, text: l.text })),
  };
}

export function lineMs(text) {
  return Math.max(1800, String(text).length * 62);
}
