// Southline — who stands together (r7-groups; user, Nov 18 #23: "about 10 NPCs stand clumped together doing nothing ...
// mismatched: old people, a little girl, a random old man"). Shared by the near people (peds.js crowd()) and the far crowd
// tier (people.v2.js spawnGroup). A person here is an entry of public/assets/npc/people/index.json ({ g, age, years, look,
// places }). The first member of a group sets its theme; every other member must be a groupMate of that first person.
export const AGE = (m) => {
  const y = m?.years || 0;
  if (!m) return 'adult';
  if (m.age === 'kid' || (y && y < 13)) return 'kid';
  if (m.age === 'teen' || (y && y < 20)) return 'teen';
  if (m.age === 'elderly' || m.age === 'older' || y >= 60) return 'senior';
  return 'adult';
};
const LOOK_FAM = {
  business: 'smart',
  evening: 'smart',
  casual: 'easy',
  tourist: 'easy',
  beach: 'easy',
  swim: 'easy',
  sport: 'easy',
  street: 'street',
  gang: 'street',
  worker: 'work',
  staff: 'work',
  rugged: 'work',
  uniform: 'uniform',
};
export const famOf = (m) => LOOK_FAM[m?.look] || 'easy';
export const yrs = (m) =>
  m?.years || (AGE(m) === 'senior' ? 70 : AGE(m) === 'teen' ? 16 : AGE(m) === 'kid' ? 9 : 32);
export const civ = (m) =>
  famOf(m) !== 'uniform' &&
  !(m?.places || []).some((x) => x === 'police' || x === 'police_swat' || x === 'lifeguard');
export const GROUP_THEMES = {
  friends: { n: [2, 4], lead: (m) => civ(m) && AGE(m) === 'adult' && famOf(m) !== 'work' },
  seniors: { n: [2, 3], lead: (m) => civ(m) && AGE(m) === 'senior' },
  teens: {
    n: [2, 4],
    lead: (m) => civ(m) && (AGE(m) === 'teen' || (AGE(m) === 'adult' && yrs(m) < 23)),
  },
  workers: {
    n: [2, 4],
    lead: (m) => civ(m) && famOf(m) === 'work' && AGE(m) !== 'kid' && AGE(m) !== 'teen',
  },
  business: { n: [2, 3], lead: (m) => civ(m) && m?.look === 'business' },
  family: {
    n: [3, 4],
    lead: (m) =>
      civ(m) &&
      AGE(m) === 'adult' &&
      yrs(m) >= 26 &&
      yrs(m) <= 50 &&
      famOf(m) !== 'work' &&
      famOf(m) !== 'street',
  },
  night: {
    n: [2, 5],
    lead: (m) => civ(m) && AGE(m) === 'adult' && yrs(m) < 42 && famOf(m) !== 'work',
  },
};
const FAM_MIX = {
  easy: ['easy', 'street'],
  street: ['street', 'easy'],
  smart: ['smart', 'easy'],
  work: ['work'],
  uniform: [],
};
// may person m join a group whose first member is L (k = this member's slot)?
export function groupMate(theme, L, m, k) {
  if (!civ(m)) return false;
  const a = AGE(m),
    la = AGE(L),
    dy = Math.abs(yrs(m) - yrs(L));
  switch (theme) {
    case 'seniors':
      return a === 'senior';
    case 'teens':
      return (a === 'teen' || (a === 'adult' && yrs(m) < 23)) && dy <= 6;
    case 'family':
      if (k === 1)
        return a === 'adult' && dy <= 10 && (!L?.g || m.g !== L.g) && famOf(m) !== 'work';
      return a === 'kid' || (a === 'teen' && yrs(L) >= 36);
    case 'workers':
      return famOf(m) === 'work' && (a === 'adult' || a === 'senior') && dy <= 22;
    case 'business':
      return (
        (famOf(m) === 'smart' || m.look === 'casual') && a !== 'kid' && a !== 'teen' && dy <= 18
      );
    case 'night':
      return a === 'adult' && dy <= 12 && famOf(m) !== 'work';
    default:
      return (
        a === la && a !== 'kid' && dy <= 12 && (FAM_MIX[famOf(L)] || ['easy']).includes(famOf(m))
      );
  }
}
export function pickTheme(zone, night, h = 12) {
  const r = Math.random();
  if (night || zone === 'nightlife') return 'night';
  if (zone === 'port' || zone === 'industrial') return r < 0.8 ? 'workers' : 'friends';
  if (zone === 'business' || zone === 'downtown')
    return r < 0.45 ? 'business' : r < 0.75 ? 'friends' : 'workers';
  if (zone === 'beach')
    return r < 0.45 ? 'friends' : r < 0.75 && h > 8 && h < 19 ? 'family' : 'teens';
  // residential / park / keys / anything else
  if (r < 0.28 && h > 7 && h < 20) return 'seniors';
  if (r < 0.5 && h > 8 && h < 20) return 'family';
  if (r < 0.68 && h > 14) return 'teens';
  if (r < 0.8 && h > 6 && h < 18) return 'workers';
  return 'friends';
}
