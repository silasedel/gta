// POLICE track: dispatch radio. The dispatcher and units talk about what the police actually know: the description read out is
// the believed one (stale facts included, cleared ones too until they age out), so the player hears what cops are looking for.
// Text goes to the evidence HUD ticker; the AUDIO track can voice it: game.on('police:radio', ({ text, speaker, kind, code, priority }) => ...).
import { describe, CRIME, CONDITION, directionPhrase } from '../evidenceWords.js';
import { tryCall } from '../util.js';

const pick = (a) => a[(Math.random() * a.length) | 0];
export function createRadio(game, G, law) {
  const S = law.S, ev = law.ev, log = [], queue = [];
  let gap = 0, repeatT = 12, lastPhase = 'clean', lastLevel = 0, unitNo = 10 + ((Math.random() * 30) | 0), squelchOk = !/[?&]mute\b/.test(location.search);
  const sign = () => `${law.dispatchStation?.callsign || 'Southline'} ${unitNo + ((Math.random() * 6) | 0)}`;
  const where = (p) => { const C = G.city; const st = tryCall('st', () => C?.city?.streetNameAt?.(p.x, p.z), null), d = C?.districtAt?.(p.x, p.z); return st ? `${st}${d ? ', ' + d : ''}` : d || 'your sector'; };
  const desc = () => describe(ev.believed(), { sex: law.sense.reality().sex, empty: '' });
  const LINES = {
    dispatch: (d) => { const c = CRIME[d.inc.type] || { code: 'Marker 2', radio: 'a disturbance' }; const de = desc(); return ['Dispatch', `All units, ${c.code}: ${c.radio} at ${where(d.inc.pos)}. ${d.by === 'witness' ? 'Caller on the line. ' : d.by === 'alarm' ? 'Alarm drop, no caller. ' : ''}${de ? 'Suspect is ' + de + '.' : 'No description yet.'}`, 3, c.code]; },
    description: () => { const de = desc(); return de ? ['Dispatch', `${pick(['Repeating', 'Be advised', 'Description again'])}: ${de}.`, 1] : ['Dispatch', pick(['Still no description on the suspect. Canvass for witnesses.', 'No description yet. Stop anyone leaving the area in a hurry.']), 1]; },
    spotted: (d) => [d.unit || sign(), d.kind === 'heli' ? 'Skywatch has eyes on the suspect. Lighting him up.' : pick(['Eyes on the suspect!', 'I have him, I have him.', 'Suspect in sight, moving to intercept.', 'That is our guy. In pursuit.']), 3, 'Marker 12'],
    recognized: (d) => [d.unit || sign(), `${pick(['Dispatch, I have a match on that earlier description.', 'That is the one from the bulletin. Stopping him now.'])}`, 3],
    lostVisual: () => [sign(), `${pick(['Lost visual.', 'He slipped us.', 'No eyes on.'])} ${directionPhrase(ev.believed().direction?.value) || 'Last seen ' + where(S.lastKnown)}.`, 2],
    cordon: () => ['Dispatch', `Set a cordon, ${Math.round((S.search?.radius || 200) / 10) * 10} meters around ${where(S.search?.center || S.lastKnown)}. Check every match.`, 2],
    lost: () => ['Dispatch', pick(['All units, suspect is in the wind. Resume patrol. Description stays on the board.', 'Search is called off. Keep that description handy.']), 2, 'Code Clear'],
    roadblock: (d) => [sign(), `Block is set${d.street ? ' on ' + d.street : ''}. Sticks are out.`, 2],
    camera: (d) => ['Dispatch', `Camera hit: ${String(d.name || 'traffic camera').replace('Traffic camera, ', '')}. Plate matches. He is ${directionPhrase(ev.believed().direction?.value).replace('last seen ', '') || 'still moving'}.`, 2],
    level: (d) => ['Dispatch', [null, 'Condition Blue. One unit to check it out.', 'Condition Amber. Units in pursuit, keep it tight.', 'Condition Red. Blocks and sticks authorized. PIT at your discretion.', 'Skywatch is up. Marine units, cover the water.', 'Ironside is rolling. Patrol, hold the perimeter for SWAT.', 'TIDEWALL. Bridges are closing, spotters are up, alert is going to every phone in the county.'][d.level] || '', 3, CONDITION[d.level]],
    cooling: (d) => ['Dispatch', `No sightings. Scaling back to ${CONDITION[d.level]}.`, 1],
    stopMatch: (d) => [sign(), `Stopping a possible: ${d.what}. Stand by.`, 1],
    noMatch: () => [sign(), pick(['Negative, not him.', 'Wrong guy. Releasing.']), 0],
    k9: () => ['Kilo 9', pick(['K-9 is on the ground and has a track.', 'Dog has the scent. Moving.']), 2],
    k9lost: () => ['Kilo 9', pick(['Track ends here. He got in a vehicle or hit the water.', 'Dog lost it.']), 1],
    heliLost: () => ['Skywatch 1', 'Skywatch lost him under cover. Ground units, check structures.', 2],
    swat: () => ['Ironside 1', 'Ironside on scene. Stacking up.', 2],
    backup: (d) => [d.unit || sign(), pick(['Requesting another unit.', 'Send me backup, he is running.', 'Need one more out here.']), 1],
    officerDown: () => ['Dispatch', 'Officer down! All available units respond!', 3, 'Marker 9 Black'],
    stop: (d) => [d.unit || sign(), `Traffic stop on a ${d.what || 'vehicle'}, ${d.where || 'my location'}.`, 1, 'Marker 1'],
    stopClear: (d) => [d.unit || sign(), pick(['Driver cited and released.', 'Clear the stop.']), 0],
    fled: (d) => [d.unit || sign(), 'Vehicle is fleeing the stop! In pursuit!', 3, 'Marker 12'],
    bribe: (d) => [d.unit || sign(), 'Dispatch, add attempted bribery to that.', 2, 'Marker 11'],
    tow: (d) => ['Dispatch', `Tow requested for a ${d.what || 'vehicle'} in a no-parking zone, ${d.where || ''}.`, 0],
    call911: (d) => ['Dispatch', `${d.service === 'fire' ? 'Engine 9' : d.service === 'ambulance' ? 'Medic One' : sign()}, respond to a caller at ${d.where}.`, 1],
    security: (d) => ['Dispatch', `Security at ${d.where || 'a secured building'} reports ${d.what || 'an armed person'}.`, 2, 'Marker 7 Alpha'],
    bounty: () => ['Dispatch', 'Be advised, bail agents are working that warrant too.', 0],
    stale: (d) => ['Dispatch', `Drop the ${d.what} from the description, it is too old to rely on.`, 0],
    custody: () => [sign(), 'One in custody.', 2, 'Code Clear'],
  };
  function say(kind, data = {}) {
    const f = LINES[kind]; if (!f) return;
    const r = tryCall('radio.' + kind, () => f(data), null); if (!r || !r[1]) return;
    const m = { speaker: r[0], text: r[1], priority: r[2] ?? 1, code: r[3] || null, kind, t: game.clock.elapsed };
    if (queue.some((q) => q.kind === kind && q.priority < 3)) return; // never stack the same chatter
    queue.push(m); queue.sort((a, b) => b.priority - a.priority); if (queue.length > 5) queue.length = 5;
  }
  function squelch() {
    if (game.audio?.play) { tryCall('squelch', () => game.audio.play('radio_squelch', { volume: 0.35 })); return; }
    if (!squelchOk) return;
  }
  function tick(dt) {
    gap -= dt;
    const L = S.level;
    if (L !== lastLevel) { if (L > lastLevel) say('level', { level: L }); else if (L > 0) say('cooling', { level: L }); lastLevel = L; }
    if (S.phase !== lastPhase) { if (S.phase === 'search' && lastPhase === 'pursuit') { say('lostVisual'); repeatT = 7; } if (S.phase === 'search' && lastPhase !== 'pursuit') repeatT = 9; lastPhase = S.phase; }
    if (L > 0 && S.phase === 'search') { repeatT -= dt; if (repeatT <= 0) { repeatT = 16 + Math.random() * 8; say(Math.random() < 0.3 && S.search ? 'cordon' : 'description'); } }
    if (gap <= 0 && queue.length) {
      const m = queue.shift(); gap = 2.2 + Math.min(4.5, m.text.length * 0.045);
      m.shownT = game.clock.elapsed; m.dur = gap + 1.5;
      log.push(m); if (log.length > 12) log.shift();
      squelch();
      game.emit?.('police:radio', m);
    }
  }
  game.on?.('evidence:stale', (d) => say('stale', d));
  return { say, tick, log, get current() { const m = log[log.length - 1]; return m && game.clock.elapsed - m.shownT < m.dur ? m : null; } };
}
