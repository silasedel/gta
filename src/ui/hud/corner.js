// SOUTHLINE — top-right HUD corner: clock and weapon (small), six wanted stars,
// the three "what the police know" badges (outfit, face, vehicle) and the money lines
// (bank with a house badge, cash with a wallet badge). All icons are original SVG.
import './corner.css';
import './polish.css';

// money numerals use the semi-condensed cut of the HUD face (bundled locally in src/ui/styles/fonts.css, OFL)
import '../styles/fonts.css';

const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const CORNER_ICONS = {
  star: SVG(
    '<path d="M12 2.6l2.75 5.9 6.45.78-4.76 4.43 1.24 6.38L12 16.92 6.32 20.1l1.24-6.38L2.8 9.28l6.45-.78z"/>',
  ),
  // clothes hanger: hook, shoulders, bar
  hanger: SVG(
    '<path d="M10.2 6.1a1.9 1.9 0 1 1 2.6 1.75c-.5.2-.8.62-.8 1.15v.9"'
    + ' fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M12 9.9l-8 5.5c-.8.55-.42 1.75.55 1.75h14.9c.97 0 1.35-1.2.55-1.75z"'
    + ' fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>',
  ),
  // head and shoulders
  face: SVG(
    '<ellipse cx="12" cy="8.6" rx="4.1" ry="4.7" fill="#fff"/>'
    + '<path d="M4.6 20.2c.5-3.7 3.5-6 7.4-6s6.9 2.3 7.4 6z" fill="#fff"/>',
  ),
  // car, front view
  car: SVG(
    '<path d="M6.3 10.2l1.3-3.4c.3-.8 1-1.3 1.9-1.3h5c.9 0 1.6.5 1.9 1.3l1.3 3.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<rect x="3.6" y="10" width="16.8" height="6.4" rx="1.6" fill="#fff"/>'
    + '<rect x="5" y="16" width="2.8" height="2.7" rx=".8" fill="#fff"/>'
    + '<rect x="16.2" y="16" width="2.8" height="2.7" rx=".8" fill="#fff"/>'
    + '<circle class="ps-k-cut" cx="6.9" cy="13.1" r="1.25"/>'
    + '<circle class="ps-k-cut" cx="17.1" cy="13.1" r="1.25"/>'
    + '<rect class="ps-k-cut" x="9.6" y="12.4" width="4.8" height="1.4" rx=".7"/>',
  ),
  house: SVG(
    '<path d="M12 4.2l-8.4 7.1h2.4v7.9h4.3v-4.9h3.4v4.9h4.3v-7.9h2.4z" fill="#fff"/>',
  ),
  wallet: SVG(
    '<path d="M6.2 7.3l8.6-2.9c.7-.25 1.4.2 1.5.9l.25 2" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>'
    + '<path d="M5.2 7.6h12.6a2 2 0 0 1 2 2v1.2h-3.6a2.6 2.6 0 0 0 0 5.2h3.6v1.2a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2V9.6a2 2 0 0 1 2-2z" fill="#fff"/>'
    + '<circle cx="16.4" cy="13.4" r="1.15" fill="#fff"/>',
  ),
};

const KNOWN_KEYS = ['outfit', 'face', 'vehicle'];
const KNOWN_TITLES = {
  outfit: 'Police know your outfit',
  face: 'Police know your face',
  vehicle: 'Police know your vehicle',
};
const ICON_FOR = { outfit: 'hanger', face: 'face', vehicle: 'car' };

function div(cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}

function restart(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

const fmtMoney = (v) => '$' + Math.round(v).toLocaleString('en-US');
const tryGet = (fn, fallback) => {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
};

// Reads the evidence system: which of outfit / face / vehicle the police currently hold as a valid fact.
function knownFromEvidence(game) {
  const ev = game.evidence;
  if (!ev || typeof ev.snapshot !== 'function') return null;
  const snap = tryGet(() => ev.snapshot(), null);
  if (!snap || !Array.isArray(snap.facts)) return null;
  const out = { outfit: false, face: false, vehicle: false };
  for (const f of snap.facts) {
    const k = String(f?.key || '');
    if (k === 'face') out.face = true;
    else if (k.startsWith('outfit.')) out.outfit = true;
    else if (k === 'vehicle' || k === 'plate') out.vehicle = true;
  }
  return out;
}

/**
 * Builds the corner. `parts` are the existing HUD nodes that keep their own update code:
 * topRow (weapon + clock), moneyEl and moneyDelta (cash readout).
 */
export function createCorner(game, parts) {
  const root = div('ps-status ps-corner');

  // stars
  const starsEl = div('ps-stars ps-cstars');
  const starEls = [];
  for (let i = 0; i < 6; i++) {
    const s = div('ps-star ps-cstar', CORNER_ICONS.star);
    starEls.push(s);
    starsEl.appendChild(s);
  }

  // what the police know
  const knownEl = div('ps-known');
  const badges = {};
  for (const k of KNOWN_KEYS) {
    const b = div('ps-kbadge', CORNER_ICONS[ICON_FOR[k]]);
    b.dataset.k = k;
    b.title = KNOWN_TITLES[k];
    badges[k] = b;
    knownEl.appendChild(b);
  }

  // money: bank above cash
  const bankLine = div('ps-mline ps-mline-bank');
  const bankVal = div('ps-mval', '$0');
  bankLine.append(bankVal, div('ps-mbadge ps-mbadge-bank', CORNER_ICONS.house));
  const cashLine = div('ps-mline ps-mline-cash ps-money-wrap');
  parts.moneyEl.classList.add('ps-mval');
  cashLine.append(parts.moneyDelta, parts.moneyEl, div('ps-mbadge ps-mbadge-cash', CORNER_ICONS.wallet));
  const moneyCol = div('ps-mcol');
  moneyCol.append(bankLine, cashLine);

  root.append(parts.topRow, starsEl, knownEl, moneyCol);

  let manual = null;
  let lastKnownKey = '';
  let knownShown = false;
  let pollT = 0;
  let bankShown = null;
  let bankTarget = null;

  function setKnown(k) {
    if (k == null) {
      manual = null;
      return;
    }
    manual = {
      outfit: !!k.outfit,
      face: !!k.face,
      vehicle: !!k.vehicle,
    };
    pollT = 0;
  }

  function bankBalance() {
    const b = game.bank;
    if (!b) return null;
    const v = tryGet(() => b.balance, null);
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function update(dt, wanted) {
    pollT -= dt;
    if (pollT <= 0) {
      pollT = 0.25;
      const k = manual || knownFromEvidence(game) || { outfit: false, face: false, vehicle: false };
      const any = k.outfit || k.face || k.vehicle;
      const show = wanted > 0 || (!!manual && any);
      const key = KNOWN_KEYS.map((n) => (k[n] ? 1 : 0)).join('');
      if (key !== lastKnownKey) {
        for (const n of KNOWN_KEYS) {
          const was = badges[n].classList.contains('on');
          badges[n].classList.toggle('on', !!k[n]);
          if (k[n] && !was) restart(badges[n], 'pop');
        }
        lastKnownKey = key;
      }
      if (show !== knownShown) {
        knownShown = show;
        knownEl.classList.toggle('show', show);
      }
      // bank line exists only when the banking system does
      bankTarget = bankBalance();
      bankLine.classList.toggle('none', bankTarget == null);
    }
    if (bankTarget != null) {
      if (bankShown == null) bankShown = bankTarget;
      if (bankShown !== bankTarget) {
        const d = bankTarget - bankShown;
        bankShown = Math.abs(d) < 1 ? bankTarget : bankShown + d * Math.min(1, dt * 5) + Math.sign(d) * 0.5;
      }
      const txt = fmtMoney(bankShown);
      if (bankVal.textContent !== txt) bankVal.textContent = txt;
    }
  }

  function bumpStars() {
    restart(starsEl, 'bump');
  }

  return {
    root,
    starsEl,
    starEls,
    cashLine,
    knownEl,
    update,
    setKnown,
    bumpStars,
  };
}
