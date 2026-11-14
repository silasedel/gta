// POLICE track: plain-language wording for the knowledge model. Pure (no THREE, no DOM).
// Turns facts into the description the dispatcher reads out, and names colors, garments, vehicles and weapons.
import { plateShown, plateKnownCount, FACT_ORDER } from './evidence.js';

// ---- color naming (sRGB hex -> everyday color word, the way a witness would say it)
const NAMED = [
  ['black', 0x101012], ['charcoal', 0x2b2f36], ['gray', 0x7d8187], ['silver', 0xb9bdc2], ['white', 0xf2f2f0], ['cream', 0xe9e2cc],
  ['red', 0xc4161c], ['dark red', 0x7a1016], ['orange', 0xf07a1a], ['yellow', 0xf5c400], ['gold', 0xc9a13a], ['tan', 0xc9ab7c], ['khaki', 0xb5a47a],
  ['brown', 0x6b4426], ['green', 0x2f8a3a], ['dark green', 0x1d4a2a], ['lime', 0x9bd32a], ['olive', 0x6b6b2a], ['teal', 0x2aa9a6], ['turquoise', 0x3fd0c9],
  ['blue', 0x1f5fd0], ['light blue', 0x7fb6ea], ['navy', 0x14234a], ['denim blue', 0x2f4a6e], ['purple', 0x6a2fb0], ['pink', 0xf08ab4], ['magenta', 0xc41e8a], ['maroon', 0x5a1626], ['beige', 0xd9c8a5],
];
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function lab(hex) {
  const r = lin((hex >> 16) & 255), g = lin((hex >> 8) & 255), b = lin(hex & 255);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const NAMED_LAB = NAMED.map(([n, h]) => [n, lab(h)]);
export function colorName(hex) {
  if (typeof hex === 'string') { if (!/^#?[0-9a-f]{6}$/i.test(hex)) return hex; hex = parseInt(hex.replace('#', ''), 16); }
  if (hex && typeof hex === 'object') { if (typeof hex.getHex === 'function') hex = hex.getHex(); else if ('r' in hex) hex = (Math.round(hex.r * 255) << 16) | (Math.round(hex.g * 255) << 8) | Math.round(hex.b * 255); }
  if (!Number.isFinite(hex)) return '';
  const L = lab(hex); let best = 'gray', bd = 1e9;
  for (const [n, q] of NAMED_LAB) { const d = (L[0] - q[0]) ** 2 * 0.7 + (L[1] - q[1]) ** 2 + (L[2] - q[2]) ** 2; if (d < bd) { bd = d; best = n; } }
  return best;
}

// ---- vehicles and weapons
const CLS_WORD = { compact: 'compact car', sedan: 'sedan', suv: 'SUV', muscle: 'muscle car', sports: 'sports car', super: 'supercar', van: 'van', taxi: 'taxi', police: 'police cruiser',
  pickup: 'pickup truck', truck: 'truck', bus: 'bus', boat: 'boat', bike: 'motorcycle', scooter: 'scooter', heli: 'helicopter', plane: 'small plane', jetski: 'jet ski' };
export const vehicleWord = (cls) => CLS_WORD[cls] || cls || 'vehicle';
export const vehicleLabel = (v) => [v.color, vehicleWord(v.cls)].filter(Boolean).join(' ');
const WEAPON_WORD = { handgun: 'handgun', smg: 'submachine gun', rifle: 'rifle', shotgun: 'shotgun', sniper: 'scoped rifle', melee: 'blunt weapon', throwable: 'explosives', bat: 'baseball bat', knife: 'knife' };
export const weaponWord = (cls) => WEAPON_WORD[cls] || cls || 'weapon';

// ---- direction of travel
// World frame: +X east, +Z south, heading 0 faces +Z.
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export function compassOf(dx, dz) { const a = Math.atan2(dx, -dz); return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
export const compassOfHeading = (h) => compassOf(Math.sin(h), Math.cos(h));
export function directionPhrase(d) {
  if (!d) return '';
  const where = d.street ? ` on ${d.street}` : d.district ? ` in ${d.district}` : '';
  if (d.still) return `last seen${where || ' nearby'}`;
  return `last seen ${d.compass}bound${where}${d.mode === 'foot' ? ' on foot' : d.mode === 'boat' ? ' by boat' : ''}`;
}

// ---- the description
// believed: evidence.believed(); opts.validOnly drops facts that no longer match reality (HUD "still true" line)
export function describeParts(believed, opts = {}) {
  const parts = [];
  const use = (k) => { const f = believed[k]; return f && (!opts.validOnly || f.valid) ? f : null; };
  parts.push({ key: 'sex', text: opts.sex || 'male', conf: 1, valid: true });
  for (const k of ['outfit.head', 'outfit.top', 'outfit.bottom', 'outfit.shoes', 'outfit.extra']) { const f = use(k); if (f) parts.push({ key: k, text: f.value.label, conf: f.conf, valid: f.valid }); }
  { const f = use('traces'); if (f) parts.push({ key: 'traces', text: f.value.label, conf: f.conf, valid: f.valid }); }
  { const f = use('weapon'); if (f) parts.push({ key: 'weapon', text: `armed with a ${weaponWord(f.value.cls)}`, conf: f.conf, valid: f.valid }); }
  { const f = use('companions'); if (f) parts.push({ key: 'companions', text: f.value.label || 'not alone', conf: f.conf, valid: f.valid }); }
  { const f = use('vehicle'); if (f) parts.push({ key: 'vehicle', text: f.value.label || vehicleLabel(f.value), conf: f.conf, valid: f.valid }); }
  { const f = use('plate'); if (f) { const n = plateKnownCount(f.value), full = !f.value.mask || f.value.mask.every(Boolean); parts.push({ key: 'plate', text: full ? `plate ${f.value.text}` : n ? `partial plate ${plateShown(f.value, '-')}` : 'plate not read', conf: f.conf, valid: f.valid }); } }
  { const f = use('direction'); if (f) parts.push({ key: 'direction', text: directionPhrase(f.value), conf: f.conf, valid: true }); }
  return parts;
}
export function describe(believed, opts = {}) {
  const parts = describeParts(believed, opts);
  if (parts.length <= 1) return opts.empty ?? 'no description';
  return parts.map((p) => p.text).join(', ');
}
// one line per fact for the "what they know" card
export function factLine(f) {
  const v = f.value || {};
  switch (f.key) {
    case 'face': return f.concealed ? 'Your face is on file, but it is covered right now' : f.conf > 0.75 ? 'They know your face' : f.conf > 0.45 ? 'They have a partial look at your face' : 'They have a vague idea of your face';
    case 'outfit.top': case 'outfit.bottom': case 'outfit.shoes': case 'outfit.head': case 'outfit.extra': return `Wearing: ${v.label}`;
    case 'weapon': return `Armed with a ${weaponWord(v.cls)}`;
    case 'traces': return `Seen at the crime: ${v.label}`;
    case 'companions': return v.label || 'Not alone';
    case 'vehicle': return `Driving a ${v.label || vehicleLabel(v)}`;
    case 'plate': { const full = !v.mask || v.mask.every(Boolean); return full ? `Plate ${v.text}` : `Partial plate ${plateShown(v, '·')}`; }
    case 'direction': { const s = directionPhrase(v); return s.charAt(0).toUpperCase() + s.slice(1); }
    case 'home': return `They know where you live${v.label ? ' (' + v.label + ')' : ''}`;
    default: return f.name || f.key;
  }
}
export const SHORT = { face: 'Face', 'outfit.top': 'Top', 'outfit.bottom': 'Legs', 'outfit.shoes': 'Shoes', 'outfit.head': 'Hat', 'outfit.extra': 'Extra', weapon: 'Weapon', traces: 'Traces', companions: 'Crew', vehicle: 'Vehicle', plate: 'Plate', direction: 'Heading', home: 'Home', cameras: 'Cameras', witnesses: 'Witnesses', units: 'Units' };
export function changeLine(ch) {
  const what = SHORT[ch.key] || ch.key;
  const val = ch.value?.label || (ch.key === 'plate' && ch.value ? plateShown(ch.value, '·') : '') || (ch.key === 'weapon' && ch.value ? weaponWord(ch.value.cls) : '');
  switch (ch.kind) {
    case 'gained': return `${what} known${val ? ': ' + val : ''} (${ch.label})`;
    case 'updated': return `${what} updated${val ? ': ' + val : ''} (${ch.label})`;
    case 'corroborated': return `${what} confirmed by ${ch.label}`;
    case 'cleared': return `${what} cleared: ${ch.reason}`;
    case 'restored': return `${what} matches again`;
    case 'stale': return `${what} went stale`;
    case 'retracted': return ch.key === 'witnesses' || ch.key === 'cameras' ? `${ch.label}: ${ch.reason}` : `${what} dropped: ${ch.reason}`;
    case 'averted': return `${ch.label}: ${ch.reason}`;
    case 'incoming': return `${ch.label}…`;
    case 'concealed': return 'Face covered';
    case 'revealed': return 'Face uncovered';
    default: return `${what}`;
  }
}

// ---- crime names and our own radio codes (PSPD "Marker" codes; all original)
export const CRIME = {
  assault: { name: 'Assault', code: 'Marker 3', radio: 'an assault' }, shoplift: { name: 'Shoplifting', code: 'Marker 4', radio: 'a shoplifter' },
  vehicle_theft: { name: 'Vehicle theft', code: 'Marker 5', radio: 'a stolen vehicle' }, carjack: { name: 'Carjacking', code: 'Marker 5 Alpha', radio: 'a carjacking' },
  robbery: { name: 'Armed robbery', code: 'Marker 6', radio: 'an armed robbery' }, shooting: { name: 'Shots fired', code: 'Marker 7', radio: 'shots fired' },
  hit_pedestrian: { name: 'Hit and run', code: 'Marker 8', radio: 'a hit and run' }, murder: { name: 'Homicide', code: 'Marker 10', radio: 'a homicide' },
  cop_assault: { name: 'Assault on an officer', code: 'Marker 9', radio: 'an officer assaulted' }, cop_shot: { name: 'Officer under fire', code: 'Marker 9 Red', radio: 'an officer under fire' },
  cop_murder: { name: 'Officer down', code: 'Marker 9 Black', radio: 'an officer down' }, speeding: { name: 'Speeding', code: 'Marker 1', radio: 'a speeder' },
  red_light: { name: 'Ran a red light', code: 'Marker 1', radio: 'a red-light runner' }, reckless: { name: 'Reckless driving', code: 'Marker 1 Alpha', radio: 'a reckless driver' },
  evading: { name: 'Fleeing a traffic stop', code: 'Marker 12', radio: 'a driver fleeing a stop' }, trespass: { name: 'Trespassing', code: 'Marker 2', radio: 'a trespasser' },
  weapon_display: { name: 'Brandishing a weapon', code: 'Marker 7 Alpha', radio: 'a person with a gun' }, bribery: { name: 'Attempted bribery', code: 'Marker 11', radio: 'an attempted bribe' },
  resisting: { name: 'Resisting arrest', code: 'Marker 12 Alpha', radio: 'a suspect resisting' }, vandalism: { name: 'Vandalism', code: 'Marker 2 Alpha', radio: 'property damage' },
  alarm: { name: 'Alarm', code: 'Marker 0', radio: 'an alarm' },
};
export const CONDITION = ['Clear', 'Condition Blue', 'Condition Amber', 'Condition Red', 'Skywatch', 'Ironside', 'Tidewall'];
export const crimeName = (t) => (CRIME[t] || {}).name || String(t || 'Crime').replace(/_/g, ' ');
export { FACT_ORDER };
