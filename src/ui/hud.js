// PORT SOLANA — HUD (original design). Owns: minimap, status cluster, speedometer,
// help/notifications/mission, district toast, phone, pause menu, title + death screens.
import './hud.css';
import { createMapRenderer, MAP_COLORS } from './mapRender.js';
import { createGPS } from './gps.js';

const TAU = Math.PI * 2;
const MAP_X0 = -580, MAP_X1 = 760, MAP_Z0 = -580, MAP_Z1 = 580; // baked world rect (m)
const BAKE_PPM = 2;                                             // baked pixels per meter

const DISTRICTS = {
  'Coral Beach': '#2fe0d0', 'Downtown': '#ffffff', 'Palmetto Heights': '#9be37a',
  'Marina Vista': '#6fb6ff', 'Neon Row': '#ff5fb8', 'Harbor District': '#ffb35a',
  'Old Town': '#e8c28a', 'Sunset Flats': '#ff6b5a',
};
export function districtAt(x, z) {
  if (x > 380) return 'Coral Beach';
  if (Math.abs(x) < 150 && Math.abs(z) < 150) return 'Downtown';
  if (z < -150) return x < 0 ? 'Palmetto Heights' : 'Marina Vista';
  if (z > 150) return x < 0 ? 'Sunset Flats' : 'Harbor District';
  return x < 0 ? 'Old Town' : 'Neon Row';
}
const DISTRICT_LABELS = [
  ['Coral Beach', 470, 0], ['Downtown', 0, 0], ['Palmetto Heights', -300, -320], ['Marina Vista', 230, -320],
  ['Sunset Flats', -300, 320], ['Harbor District', 230, 320], ['Old Town', -320, 0], ['Neon Row', 265, 0],
];

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const fmtMoney = (v) => '$' + Math.round(v).toLocaleString('en-US');
const fmtClock = (t) => { t = ((num(t, 18) % 24) + 24) % 24; const h = Math.floor(t), m = Math.floor((t - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };

// ---------- SVG icons (original) ----------
const ICON = {
  fist: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M18 22c0-3 2-5 5-5s5 2 5 5v-3c0-3 2-5 5-5s5 2 5 5v2c0-3 2-5 5-5s5 2 5 5v3c1-1 2-2 4-2 3 0 5 2 5 5v11c0 9-7 17-17 17H30c-8 0-14-5-16-12l-3-9c-1-3 1-6 4-7 1 0 2 0 3 1z"/><path fill="rgba(0,0,0,.35)" d="M28 22v8M38 21v9M48 23v8" stroke="rgba(0,0,0,.35)" stroke-width="2.2" stroke-linecap="round"/><path fill="none" stroke="rgba(0,0,0,.3)" stroke-width="2.2" stroke-linecap="round" d="M18 33c4-2 9-2 12 1"/></svg>`,
  bat: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M9 57l-3-3 26-27c5-5 13-13 20-17 3-2 6-1 7 0s2 4 0 7c-4 7-12 15-17 20L15 63l-3-3"/><path fill="rgba(0,0,0,.35)" d="M8 52l5 5-2 2-5-5z"/></svg>`,
  pistol: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M6 18h48l3 3v8H34l-2 3h-5l-5 18H9l5-18-3-2V22H6z"/><path fill="rgba(0,0,0,.35)" d="M24 32c1 4 4 6 8 6l2-6zM10 22h44v2H10z"/></svg>`,
  smg: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M2 22h6v-2h40v3h12v5H48v5H36l-2 3v14h-7V36h-5l-3 10h-7l3-13H8v-3H2z"/><path fill="rgba(0,0,0,.35)" d="M10 24h36v2H10z"/></svg>`,
  shotgun: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M2 34l14-9h46v5H44v4H30v-2h-6l-6 4-14 8z"/><path fill="rgba(0,0,0,.35)" d="M30 30h14v4H30zM18 27h42v1.6H18z"/></svg>`,
  knife: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M22 36L52 12c4-3 8-4 10-3-1 4-4 8-8 11L28 42z"/><path fill="currentColor" d="M6 52l14-14 6 6-14 14c-2 2-4 2-6 0s-2-4 0-6z"/><path fill="rgba(0,0,0,.35)" d="M24 40l26-21 1 1-26 22z M10 50l3 3-2 2-3-3z"/></svg>`,
  revolver: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M34 18h26v6H38z"/><rect fill="currentColor" x="22" y="15" width="16" height="15" rx="4"/><path fill="currentColor" d="M14 20h10v12l-4 4 2 16H10l-2-14c-1-6 2-12 6-18z"/><path fill="rgba(0,0,0,.35)" d="M24 19h12v2H24zM24 24h12v2H24zM22 32c2 3 5 4 8 4l1-4z"/></svg>`,
  microsmg: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M10 20h36v4h8v4h-8v4H34l-1 2v18h-6V34h-3l-3 8h-6l3-10h-8z"/><path fill="rgba(0,0,0,.35)" d="M12 23h32v2H12z"/></svg>`,
  rifle: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M2 25l12-2h4v-3h24v-3h4v3h4v4h12v3H50v3H38l2 12-6 2-3-14h-6l-2 8h-6l2-8h-5l-12 4z"/><path fill="rgba(0,0,0,.35)" d="M18 23h28v1.6H18zM24 17h12v3H24z"/></svg>`,
  carbine: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M4 26l10-2h6v-3h22v3h18v3H42v3H32l1 8h-6l-1-8h-5l-2 7h-6l2-7-11 3z"/><rect fill="currentColor" x="22" y="13" width="16" height="5" rx="2.5"/><path fill="currentColor" d="M26 18h2v3h-2zM33 18h2v3h-2z"/><path fill="rgba(0,0,0,.35)" d="M20 24h22v1.6H20z"/></svg>`,
  sawnoff: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M22 24h36v4H22zM22 29h36v4H22z"/><path fill="currentColor" d="M8 30c4-4 10-6 16-6v10h-4l-6 10H6l4-8c-2-1-3-4-2-6z"/><path fill="rgba(0,0,0,.35)" d="M22 28h36v1H22zM34 33h8v3h-8z"/></svg>`,
  sniper: `<svg viewBox="0 0 64 64"><path fill="currentColor" d="M2 30l10-3h8v-2h22v2h20v3H40v3H26l-4 6h-6l2-6h-6l-10 3z"/><rect fill="currentColor" x="20" y="16" width="20" height="6" rx="3"/><path fill="currentColor" d="M18 17h3v4h-3zM39 17h3v4h-3zM26 22h2v3h-2zM33 22h2v3h-2zM46 33l-4 12h2l4-12zM48 33l4 12h-2l-4-12z"/></svg>`,
  grenade: `<svg viewBox="0 0 64 64"><ellipse fill="currentColor" cx="30" cy="40" rx="13" ry="15"/><path fill="currentColor" d="M24 22h12v6H24z"/><path fill="currentColor" d="M36 22l12 6-2 3-12-5z"/><circle fill="none" stroke="currentColor" stroke-width="2.5" cx="20" cy="20" r="5"/><path fill="rgba(0,0,0,.3)" d="M18 36h24v2H18zM18 44h24v2H18zM29 26h2v28h-2z"/></svg>`,
  lock: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 10V7a5 5 0 0110 0v3h1a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2zm2 0h6V7a3 3 0 00-6 0z"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 2.2l2.7 6.3 6.8.6-5.2 4.5 1.6 6.7L12 16.7l-5.9 3.6 1.6-6.7L2.5 9.1l6.8-.6z"/></svg>`,
  contacts: `<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4" fill="#fff"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6z" fill="#fff"/></svg>`,
  messages: `<svg viewBox="0 0 24 24"><path d="M4 5h16a2 2 0 012 2v8a2 2 0 01-2 2h-9l-5 4v-4H4a2 2 0 01-2-2V7a2 2 0 012-2z" fill="#fff"/></svg>`,
  camera: `<svg viewBox="0 0 24 24"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" fill="#fff"/><circle cx="12" cy="13" r="4" fill="#3a3f4b"/><circle cx="12" cy="13" r="2.2" fill="#fff"/></svg>`,
  map: `<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="#fff"/><path d="M9 4v14M15 6v14" stroke="#2a8a7f" stroke-width="1.6"/></svg>`,
  wavvy: `<svg viewBox="0 0 24 24"><path d="M2 14c3-5 5-5 7 0s4 5 6 0 4-5 7 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="18.5" cy="6" r="2" fill="#fff"/></svg>`,
  bank: `<svg viewBox="0 0 24 24"><path d="M12 2l10 5v2H2V7z" fill="#fff"/><path d="M4 10h3v8H4zM10.5 10h3v8h-3zM17 10h3v8h-3zM2 19h20v3H2z" fill="#fff"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.6 5l1.9 1.5-2 3.4-2.3-.9c-.6.5-1.3.9-2 1.2L15.8 22h-4l-.4-2.4c-.7-.3-1.4-.7-2-1.2l-2.3.9-2-3.4L7 14.4a7 7 0 010-2.3L5.1 10.6l2-3.4 2.3.9c.6-.5 1.3-.9 2-1.2L11.8 4.5h4l.4 2.4c.7.3 1.4.7 2 1.2l2.3-.9 2 3.4-1.9 1.5c.1.8.1 1.6 0 2.4z" transform="translate(-1.8 -1.3)"/></svg>`,
  signal: `<svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#fff"/><rect x="5" y="5" width="3" height="7" rx="1" fill="#fff"/><rect x="10" y="2.5" width="3" height="9.5" rx="1" fill="#fff"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#fff" opacity=".45"/></svg>`,
  battery: `<svg viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="#fff" opacity=".6"/><rect x="2" y="2" width="15" height="8" rx="1.6" fill="#fff"/><rect x="23.5" y="4" width="2" height="4" rx="1" fill="#fff" opacity=".6"/></svg>`,
  palm: `<svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMax meet"><path d="M104 258c-6-50-4-110 6-160l7 1c-9 50-11 108-5 159z"/><path d="M112 96c-20-22-52-30-86-20 30-2 54 8 74 28-26-6-52 0-72 18 26-12 52-14 78-6zM114 96c14-28 42-46 78-46-30 8-52 24-64 44 26-12 54-10 72 4-26-6-52-2-78 8zM112 92c-6-30-26-52-54-62 22 14 36 34 42 58zM114 92c10-26 34-44 62-48-22 8-40 24-52 50zM112 98c-4 26-18 50-40 64 16-20 26-42 30-66zM116 98c14 18 20 42 18 68-6-22-14-42-26-60z"/></svg>`,
};

const WEAPONS = [
  { id: 'fist', name: 'Fists' }, { id: 'bat', name: 'Bat' }, { id: 'pistol', name: 'Pistol' },
  { id: 'smg', name: 'SMG' }, { id: 'shotgun', name: 'Shotgun' },
];
const CRIME_NAMES = {
  assault: 'Assault', carjack: 'Carjacking', vehicle_theft: 'Vehicle theft', shoplift: 'Shoplifting', robbery: 'Armed robbery',
  shooting: 'Shots fired', hit_pedestrian: 'Hit and run', murder: 'Homicide', cop_assault: 'Assaulting an officer',
};
const SHOP_GLYPH = (t = '') => {
  t = String(t).toLowerCase();
  if (/surf|beach|board/.test(t)) return ['wave', '#2fe0d0'];
  if (/electr|tech|phone|volt/.test(t)) return ['bolt', '#ffe066'];
  if (/beauty|salon|spa|cosmet/.test(t)) return ['sparkle', '#ff9ad5'];
  if (/cloth|apparel|fashion|boutique|sport|outfit/.test(t)) return ['shirt', '#c58cff'];
  if (/food|diner|cafe|restaurant|burger|taco|pizza|bar/.test(t)) return ['cup', '#ff8fc8'];
  if (/gas|fuel/.test(t)) return ['drop', '#6fb6ff'];
  if (/bank|atm/.test(t)) return ['dollar', '#3fcf8e'];
  if (/gun|ammo|weapon/.test(t)) return ['target', '#ff6b5a'];
  if (/hospital|clinic|pharm/.test(t)) return ['plus', '#ff5d6c'];
  if (/garage|mechanic|auto/.test(t)) return ['wrench', '#ffb35a'];
  return ['bag', '#ffd27a'];
};
const APPS = [
  { id: 'contacts', name: 'Contacts', bg: 'linear-gradient(140deg,#ffb35a,#ff6b5a)' },
  { id: 'messages', name: 'Messages', bg: 'linear-gradient(140deg,#4be38a,#18b07a)' },
  { id: 'camera', name: 'Camera', bg: 'linear-gradient(140deg,#5d6578,#2c3140)' },
  { id: 'map', name: 'Map', bg: 'linear-gradient(140deg,#2fe0d0,#1a8fb0)' },
  { id: 'wavvy', name: 'Wavvy', bg: 'linear-gradient(140deg,#ff5fb8,#7a5cff)' },
  { id: 'bank', name: 'Bank', bg: 'linear-gradient(140deg,#2b3550,#121828)' },
  { id: 'settings', name: 'Settings', bg: 'linear-gradient(140deg,#8a93a6,#4b5263)' },
];

export function createHUD(game) {
  injectFonts();
  const ui = (game.ui = game.ui || {});
  ui.phoneOpen = false; ui.paused = false; ui.title = true;
  const settings = loadSettings(game);

  const mapR = createMapRenderer(game), gps = createGPS(game);
  let route = null, routeShown = null, routeFor = null, routeAt = -1e9, routeCheck = 0, routeLen = 0;
  const distName = (x, z) => { try { const d = game.city?.districtAt?.(x, z); if (d) return String(d); } catch (e) { /* */ } return districtAt(x, z); };
  const streetName = (x, z) => { try { const s2 = game.city?.streetNameAt?.(x, z); return s2 ? String(s2) : null; } catch (e) { return null; } };
  const distColor = (n) => DISTRICTS[n] || `hsl(${hashHue(n)} 85% 72%)`;
  const root = el('div', 'ps-hud'); root.id = 'ps-hud';
  document.body.appendChild(root);

  // ---------- Minimap ----------
  const mm = el('div', 'ps-minimap');
  const mmFrame = el('div', 'ps-mm-frame');
  const mmCanvas = el('canvas', 'ps-mm-canvas');
  const mmGloss = el('div', 'ps-mm-gloss');
  const mmDist = el('div', 'ps-mm-dist');
  mmFrame.append(mmCanvas, mmGloss, mmDist);
  const bars = el('div', 'ps-bars');
  const hpBar = el('div', 'ps-bar ps-hp', '<u></u><i></i><b></b>');
  const arBar = el('div', 'ps-bar ps-ar', '<u></u><i></i><b></b>');
  bars.append(hpBar, arBar);
  const mmInfo = el('div', 'ps-mm-info', '<span class="ps-mm-zone"></span><span class="ps-mm-hdg"></span>');
  const mmZone = mmInfo.firstChild, mmHdg = mmInfo.lastChild;
  mm.append(mmFrame, bars, mmInfo);
  root.appendChild(mm);
  const MW = 260, MH = 170;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mmCanvas.width = MW * dpr; mmCanvas.height = MH * dpr;
  const mctx = mmCanvas.getContext('2d');

  // ---------- Status cluster (top-right) ----------
  const status = el('div', 'ps-status');
  const clockEl = el('div', 'ps-clock', '<i class="ps-tod"></i><span></span>');
  const clockTxt = clockEl.lastChild, todEl = clockEl.firstChild;
  const weaponEl = el('div', 'ps-weapon', `<div class="ps-weapon-ico">${ICON.fist}</div><div class="ps-ammo"></div>`);
  const weaponIco = weaponEl.firstChild, ammoEl = weaponEl.lastChild;
  let lastWeapon = 'fist', lastAmmo = null;
  const topRow = el('div', 'ps-toprow');
  topRow.append(weaponEl, clockEl);
  const moneyWrap = el('div', 'ps-money-wrap');
  const moneyEl = el('div', 'ps-money', '$0');
  const moneyDelta = el('div', 'ps-money-delta');
  moneyWrap.append(moneyDelta, moneyEl);
  const starsEl = el('div', 'ps-stars');
  const starEls = [];
  for (let i = 0; i < 6; i++) { const s = el('span', 'ps-star', ICON.star); starEls.push(s); starsEl.appendChild(s); }
  status.append(topRow, moneyWrap, starsEl);
  root.appendChild(status);

  // ---------- Speedometer ----------
  const speedo = el('div', 'ps-speedo');
  const ARC_R = 74, ARC_LEN = Math.PI * 2 * ARC_R * 0.75;
  let ticks = '';
  for (let i = 0; i <= 12; i++) {
    const a = (135 + i * 22.5) * Math.PI / 180, r1 = i % 2 ? 62 : 58, r2 = 66;
    ticks += `<line x1="${90 + Math.cos(a) * r1}" y1="${90 + Math.sin(a) * r1}" x2="${90 + Math.cos(a) * r2}" y2="${90 + Math.sin(a) * r2}" />`;
  }
  speedo.innerHTML = `
    <svg class="ps-speedo-svg" viewBox="0 0 180 180">
      <defs><linearGradient id="psSpdGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2fe0d0"/><stop offset=".65" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff6b5a"/></linearGradient></defs>
      <circle cx="90" cy="90" r="${ARC_R}" class="ps-arc-bg" stroke-dasharray="${ARC_LEN} 999" transform="rotate(135 90 90)"/>
      <circle cx="90" cy="90" r="${ARC_R}" class="ps-arc" stroke="url(#psSpdGrad)" stroke-dasharray="0 999" transform="rotate(135 90 90)"/>
      <g class="ps-ticks">${ticks}</g>
      <circle class="ps-tip" r="5" cx="${90 + Math.cos(135 * Math.PI / 180) * ARC_R}" cy="${90 + Math.sin(135 * Math.PI / 180) * ARC_R}"/>
    </svg>
    <div class="ps-speedo-read"><div class="ps-spd">0</div><div class="ps-unit">KM/H</div></div>
    <div class="ps-gear">N</div>
    <div class="ps-vname">VEHICLE</div>`;
  root.appendChild(speedo);
  const spdArc = speedo.querySelector('.ps-arc');
  const spdNum = speedo.querySelector('.ps-spd');
  const spdName = speedo.querySelector('.ps-vname');
  const spdGear = speedo.querySelector('.ps-gear');
  const spdTip = speedo.querySelector('.ps-tip');

  // ---------- Help / notifications / mission / area ----------
  const leftCol = el('div', 'ps-leftcol');
  const helpEl = el('div', 'ps-help');
  const notifs = el('div', 'ps-notifs');
  leftCol.append(helpEl, notifs);
  root.appendChild(leftCol);
  const missionEl = el('div', 'ps-mission');
  root.appendChild(missionEl);
  const areaEl = el('div', 'ps-area', '<small></small><span></span><em class="ps-area-street"></em>');
  root.appendChild(areaEl);
  const areaSmall = areaEl.querySelector('small'), areaName = areaEl.querySelector('span'), areaStreet = areaEl.querySelector('em');
  const streetEl = el('div', 'ps-street', '<i></i><span></span>');
  root.appendChild(streetEl);
  const streetTxt = streetEl.querySelector('span');
  let streetTimer = 0, curStreet = null, candStreet = null, candN = 0, streetCheck = 0;

  // ---------- Death screen ----------
  const deathEl = el('div', 'ps-death', `<div class="ps-death-flash"></div><div class="ps-death-bar top"></div><div class="ps-death-bar bot"></div><div class="ps-death-card"><div class="ps-death-rule"></div><h1>LIGHTS OUT</h1><p><span>RESPAWNING</span> Solana General Hospital</p></div>`);
  root.appendChild(deathEl);
  const arrestEl = el('div', 'ps-arrest', `<div class="ps-arrest-bars"></div><h1>DETAINED</h1><p class="ps-arrest-fee"></p><small>Released from Port Solana Central Holding</small>`);
  root.appendChild(arrestEl);
  const arrestFee = arrestEl.querySelector('.ps-arrest-fee');
  let arrestTimer = 0;
  const xhair = el('div', 'ps-xhair', '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b>');
  root.appendChild(xhair);
  const hitm = el('div', 'ps-hitm', '<i></i><i></i><i></i><i></i>');
  root.appendChild(hitm);
  let spread = 0, lastShotAt = -1e9, lastPunchAt = -1e9;
  const wheel = el('div', 'ps-wheel');
  wheel.innerHTML = `<div class="ps-wheel-ring"><div class="ps-wheel-hl"></div><div class="ps-wslots"></div><div class="ps-wheel-center"><b></b><small></small><em></em></div></div><div class="ps-wheel-hint">Mouse or ◀ ▶ choose slot · ▲ ▼ cycle slot · release <kbd>Tab</kbd></div>`;
  root.appendChild(wheel);
  const wSlotsHost = wheel.querySelector('.ps-wslots'), wHl = wheel.querySelector('.ps-wheel-hl');
  const wName = wheel.querySelector('.ps-wheel-center b'), wInfo = wheel.querySelector('.ps-wheel-center small'), wSlotNo = wheel.querySelector('.ps-wheel-center em');
  let wslots = [], wheelGroups = [], wheelPick = [];
  let wheelSel = 0, wheelVec = { x: 0, y: 0 };
  const photoHint = el('div', 'ps-photo-hint', 'PHOTO MODE · HUD hidden · <kbd>Backspace</kbd> to exit');
  root.appendChild(photoHint);

  // ---------- Phone ----------
  const phone = el('div', 'ps-phone');
  phone.innerHTML = `<div class="ps-phone-body"><div class="ps-phone-screen">
      <div class="ps-phone-status"><span class="ps-ph-time">18:00</span><span class="ps-ph-notch"></span><span class="ps-ph-icons">${ICON.signal}${ICON.battery}</span></div>
      <div class="ps-phone-home">
        <div class="ps-ph-big"><div class="ps-ph-bigtime">18:00</div><div class="ps-ph-date">Friday · Port Solana</div></div>
        <div class="ps-ph-grid"></div>
        <div class="ps-ph-hint">◀ ▶ ▲ select · Enter open · ▼ close</div>
      </div>
      <div class="ps-phone-app"><div class="ps-app-head"><span class="ps-app-back">‹</span><span class="ps-app-title"></span></div><div class="ps-app-body"></div></div>
      <div class="ps-phone-bar"></div>
    </div></div>`;
  root.appendChild(phone);
  const phGrid = phone.querySelector('.ps-ph-grid');
  const phTime = phone.querySelector('.ps-ph-time'), phBig = phone.querySelector('.ps-ph-bigtime');
  const phApp = phone.querySelector('.ps-phone-app'), phAppTitle = phone.querySelector('.ps-app-title'), phAppBody = phone.querySelector('.ps-app-body');
  const appEls = APPS.map((a, i) => {
    const b = el('div', 'ps-app', `<div class="ps-app-ico" style="background:${a.bg}">${ICON[a.id]}</div><div class="ps-app-name">${a.name}</div>`);
    b.addEventListener('click', () => { phoneSel = i; openApp(i); });
    phGrid.appendChild(b); return b;
  });
  phone.querySelector('.ps-app-back').addEventListener('click', () => closeApp());
  let phoneSel = 0, phoneAppOpen = -1;

  // ---------- Pause menu ----------
  const pause = el('div', 'ps-pause');
  pause.innerHTML = `
    <div class="ps-pause-top">
      <div class="ps-pause-brand"><span class="ps-pb-port">PORT</span><span class="ps-pb-sol">SOLANA</span></div>
      <div class="ps-tabs">${['MAP', 'STATS', 'SETTINGS', 'CONTROLS'].map((t, i) => `<button class="ps-tab${i ? '' : ' on'}" data-tab="${i}">${t}</button>`).join('')}</div>
      <div class="ps-pause-meta"><span class="ps-pm-clock">18:00</span><span class="ps-pm-money">$0</span></div>
    </div>
    <div class="ps-pages">
      <div class="ps-page ps-page-map on"><canvas class="ps-bigmap"></canvas><div class="ps-map-frame"></div><div class="ps-map-zoom"><button data-z="in" title="Zoom in (+)">+</button><button data-z="out" title="Zoom out (−)">−</button><button data-z="fit" title="Whole map (F)">⤢</button><button data-z="me" title="Centre on me (C)">◎</button></div>
        <div class="ps-map-legend"><b>Drag / WASD</b> pan · <b>Wheel / pinch</b> zoom · <b>Click</b> waypoint · <b>Right-click</b> clear · <b>F</b> whole map</div>
        <div class="ps-map-loc"></div><div class="ps-map-attrib">Map data © OpenStreetMap contributors</div></div>
      <div class="ps-page ps-page-stats"><div class="ps-stats-grid"></div></div>
      <div class="ps-page ps-page-settings"><div class="ps-settings"></div></div>
      <div class="ps-page ps-page-controls"><div class="ps-controls"></div></div>
    </div>
    <div class="ps-pause-foot"><button class="ps-resume">RESUME <kbd>ESC</kbd></button><span class="ps-foot-tag">CALORA · EST. 1921 <i>· Map data © OpenStreetMap contributors (ODbL)</i></span></div>`;
  root.appendChild(pause);
  const tabs = [...pause.querySelectorAll('.ps-tab')], pages = [...pause.querySelectorAll('.ps-page')];
  const bigmap = pause.querySelector('.ps-bigmap'), bctx = bigmap.getContext('2d');
  const mapLoc = pause.querySelector('.ps-map-loc');
  pause.querySelectorAll('.ps-map-zoom button').forEach((b) => b.addEventListener('click', () => {
    const r = bigmap.getBoundingClientRect(), z = b.dataset.z;
    if (z === 'in') zoomAt(r.width / 2, r.height / 2, 1.6); else if (z === 'out') zoomAt(r.width / 2, r.height / 2, 1 / 1.6); else if (z === 'fit') fitMap(); else centreOnPlayer();
  }));
  const statsGrid = pause.querySelector('.ps-stats-grid');
  const pmClock = pause.querySelector('.ps-pm-clock'), pmMoney = pause.querySelector('.ps-pm-money');
  let curTab = 0;
  tabs.forEach((t, i) => t.addEventListener('click', () => setTab(i)));
  pause.querySelector('.ps-resume').addEventListener('click', () => setPaused(false, true));
  buildSettings(pause.querySelector('.ps-settings'));
  buildControls(pause.querySelector('.ps-controls'));

  // ---------- Title ----------
  const title = el('div', 'ps-title');
  title.id = 'title';
  title.innerHTML = `
    <div class="ps-title-sky"></div>
    <div class="ps-title-sun"></div>
    <div class="ps-title-sea"></div>
    <div class="ps-title-palm ps-palm-l">${ICON.palm}</div>
    <div class="ps-title-palm ps-palm-r">${ICON.palm}</div>
    <div class="ps-logo">
      <div class="ps-logo-port">PORT</div>
      <div class="ps-logo-solana">SOLANA</div>
      <div class="ps-logo-sub"><i></i>CALORA<i></i></div>
    </div>
    <div class="ps-title-cta">CLICK TO PLAY<span style="display:block;margin-top:8px;font-size:11px;letter-spacing:.25em;opacity:.65;font-weight:500">OR PRESS ENTER</span></div>
    <div class="ps-title-foot">WASD move · Mouse look · F vehicles · ▲ phone · Esc pause</div>`;
  root.appendChild(title);
  // Robust start: pointerdown fires even if a click gets swallowed; Enter/Space also start; a failed mouse
  // capture never blocks starting (the player can click the game view to capture the mouse later).
  const startGame = (e) => { try { e?.preventDefault?.(); } catch (_) {} requestLock(); hideTitle(); };
  title.addEventListener('pointerdown', startGame);
  title.addEventListener('click', startGame);
  addEventListener('keydown', (e) => { if (ui.title && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) startGame(e); });
  document.addEventListener('pointerlockerror', () => { if (!ui.title) { try { game.hud?.notify?.('Click the game view to capture the mouse', 3000); } catch (_) {} } });

  // ---------- state ----------
  let bake = null, bakeTried = -1e9;
  let mmZoom = 1.0, moneyShown = num(game.player?.money), moneyTarget = moneyShown, deltaTimer = 0;
  let mmAngle = 0;
  let deadShown = false;
  let lastHp = 999, lastAr = -1, lastKmh = -1;
  let lastWanted = 0, lastDistrict = null, areaTimer = 0, helpText = null;
  let mapView = { cx: 60, cz: 0, ppm: 1 }, mapXform = null, drag = null;
  ui._mapView = () => mapView; // read-only debug hook for tests
  let bigPendingTimer = 0;
  function mapBounds() { return mapR.bounds() || game.city?.bounds || { minX: MAP_X0, maxX: MAP_X1, minZ: MAP_Z0, maxZ: MAP_Z1 }; }
  function fitPPM() { const r = bigmap.getBoundingClientRect(), B = mapBounds(); return Math.min((r.width || 1000) / Math.max(100, B.maxX - B.minX), (r.height || 600) / Math.max(100, B.maxZ - B.minZ)) * 0.95; }
  const stats = { time: 0, dist: 0, driveDist: 0, topSpeed: 0, last: null, vehiclesEntered: 0, wasIn: false, deaths: 0, wasDead: false };
  const tmpDir = game.THREE ? new game.THREE.Vector3() : null;
  let lockLostAt = 0, pauseToggledAt = 0;

  // ---------- input ----------
  window.addEventListener('keyup', (e) => { if (e.code === 'Tab') closeWheel(true); }, true);
  window.addEventListener('blur', () => closeWheel(false));
  document.addEventListener('mousemove', (e) => {
    if (!ui.weaponWheel) return;
    wheelVec.x = clamp(wheelVec.x + (e.movementX || 0), -120, 120); wheelVec.y = clamp(wheelVec.y + (e.movementY || 0), -120, 120);
    if (Math.hypot(wheelVec.x, wheelVec.y) > 28) {
      let a = Math.atan2(wheelVec.y, wheelVec.x) + Math.PI / 2; a = ((a % TAU) + TAU) % TAU;
      const n = Math.max(1, wheelGroups.length), i = Math.round(a / (TAU / n)) % n;
      if (i !== wheelSel) { wheelSel = i; paintWheel(); }
    }
  });
  window.addEventListener('keydown', (e) => {
    const k = e.code;
    if (k === 'Tab') { e.preventDefault(); if (!e.repeat && !ui.title && !ui.paused && !ui.phoneOpen && !deadShown) openWheel(); return; }
    if (ui.weaponWheel) {
      const n = Math.max(1, wheelGroups.length);
      if (k === 'ArrowLeft') { wheelSel = (wheelSel + n - 1) % n; paintWheel(); e.preventDefault(); return; }
      if (k === 'ArrowRight') { wheelSel = (wheelSel + 1) % n; paintWheel(); e.preventDefault(); return; }
      if (k === 'ArrowUp' || k === 'ArrowDown') { cycleInSlot(k === 'ArrowDown' ? 1 : -1); e.preventDefault(); return; }
      if (/^Digit[1-9]$/.test(k)) { const i = +k.slice(5) - 1; if (i < n) { wheelSel = i; paintWheel(); } return; }
      if (k === 'Escape') { closeWheel(false); return; }
    }
    if (e.repeat) return;
    if (ui.title) return;
    if (k === 'Escape' || k === 'KeyP') {
      const now = performance.now();
      if (k === 'Escape' && now - lockLostAt < 350 && ui.paused) return; // lock-loss already opened it
      if (now - pauseToggledAt < 150) return;
      if (ui.phoneOpen && k === 'Escape') { setPhone(false); return; }
      setPaused(!ui.paused, true); e.preventDefault(); return;
    }
    if (ui.paused || deadShown || ui.weaponWheel) return;
    if (ui.photo) { if (['Backspace', 'ArrowUp', 'ArrowDown', 'Enter'].includes(k)) { setPhoto(false); e.preventDefault(); } return; }
    if (!ui.phoneOpen) { if (k === 'ArrowUp') { setPhone(true); e.preventDefault(); } return; }
    // phone open
    e.preventDefault();
    if (phoneAppOpen >= 0) {
      if (k === 'Backspace' || k === 'ArrowLeft') closeApp();
      else if (k === 'ArrowDown') setPhone(false);
      return;
    }
    if (k === 'ArrowLeft') phoneSel = (phoneSel + APPS.length - 1) % APPS.length;
    else if (k === 'ArrowRight') phoneSel = (phoneSel + 1) % APPS.length;
    else if (k === 'ArrowUp') phoneSel = (phoneSel + APPS.length - 3) % APPS.length;
    else if (k === 'Enter' || k === 'Space') openApp(phoneSel);
    else if (k === 'Backspace' || k === 'ArrowDown') setPhone(false);
    refreshPhoneSel();
  }, true);

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { hideTitle(); if (ui.paused) setPaused(false, false); }
    else if (!ui.title && !ui.paused) { if (ui.phoneOpen) setPhone(false); lockLostAt = performance.now(); setPaused(true, false); }
  });

  // big map interactions
  bigmap.addEventListener('contextmenu', (e) => { e.preventDefault(); game.waypoint = null; notify('Waypoint cleared', 1800); drawBigMap(); });
  function clampView() {
    const B = mapBounds(), r = bigmap.getBoundingClientRect(), k = mapView.ppm || 1;
    const hw = (r.width || 1000) / 2 / k, hh = (r.height || 600) / 2 / k, m = 150;
    // centre may roam anywhere that keeps some of the playable area on screen
    const loX = B.minX - m - hw * 0.6, hiX = B.maxX + m + hw * 0.6, loZ = B.minZ - m - hh * 0.6, hiZ = B.maxZ + m + hh * 0.6;
    const cxMid = (B.minX + B.maxX) / 2, czMid = (B.minZ + B.maxZ) / 2;
    mapView.cx = loX > hiX ? cxMid : clamp(mapView.cx, Math.min(loX, cxMid), Math.max(hiX, cxMid));
    mapView.cz = loZ > hiZ ? czMid : clamp(mapView.cz, Math.min(loZ, czMid), Math.max(hiZ, czMid));
  }
  bigmap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, cx: mapView.cx, cz: mapView.cz, moved: false, id: e.pointerId };
    try { bigmap.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    zoomAnim = null; bigmap.classList.add('grab');
  });
  bigmap.addEventListener('pointermove', (e) => {
    if (!drag || !mapXform) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) { mapView.cx = drag.cx - dx / mapView.ppm; mapView.cz = drag.cz - dy / mapView.ppm; clampView(); drawBigMap(); }
  });
  const endDrag = (e, cancel) => {
    if (!drag) return;
    const d = drag; drag = null; bigmap.classList.remove('grab');
    try { bigmap.releasePointerCapture(d.id); } catch (err) { /* */ }
    if (cancel || d.moved || !mapXform) return;
    const r = bigmap.getBoundingClientRect();
    const x = (e.clientX - r.left - mapXform.ox) / mapXform.k, z = (e.clientY - r.top - mapXform.oz) / mapXform.k;
    if (mapR.ok() && mapR.boundary() && !mapR.inside(x, z)) { notify('That spot is outside the playable area', 1600); return; }
    const B = mapBounds();
    if (x < B.minX - 50 || x > B.maxX + 50 || z < B.minZ - 50 || z > B.maxZ + 50) return;
    game.waypoint = { x, z }; route = null; routeShown = null;
    const sn = streetName(x, z);
    notify(`Waypoint set · ${sn ? sn + ', ' : ''}${distName(x, z)}`, 2200);
    drawBigMap();
  };
  bigmap.addEventListener('pointerup', (e) => endDrag(e, false));
  bigmap.addEventListener('pointercancel', (e) => endDrag(e, true));
  bigmap.addEventListener('dblclick', (e) => { const r = bigmap.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2); });
  // keyboard pan / zoom while the map tab is open
  const mapKeys = new Set();
  window.addEventListener('keydown', (e) => {
    if (!ui.paused || curTab !== 0) return;
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { e.preventDefault(); if (!mapKeys.size) requestAnimationFrame(keyPanStep); mapKeys.add(k); }
    else if (k === 'Equal' || k === 'NumpadAdd') { const r = bigmap.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.5); }
    else if (k === 'Minus' || k === 'NumpadSubtract') { const r = bigmap.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.5); }
    else if (k === 'KeyF') fitMap();
    else if (k === 'KeyC') centreOnPlayer();
  });
  window.addEventListener('keyup', (e) => mapKeys.delete(e.code));
  window.addEventListener('blur', () => mapKeys.clear());
  let keyLast = 0;
  function keyPanStep(t) {
    if (!mapKeys.size || !ui.paused) { keyLast = 0; return; }
    const dt = keyLast ? Math.min(0.05, (t - keyLast) / 1000) : 0.016; keyLast = t;
    const sp = 700 / mapView.ppm * dt; // ~700 screen px per second
    if (mapKeys.has('KeyW') || mapKeys.has('ArrowUp')) mapView.cz -= sp;
    if (mapKeys.has('KeyS') || mapKeys.has('ArrowDown')) mapView.cz += sp;
    if (mapKeys.has('KeyA') || mapKeys.has('ArrowLeft')) mapView.cx -= sp;
    if (mapKeys.has('KeyD') || mapKeys.has('ArrowRight')) mapView.cx += sp;
    clampView(); drawBigMap();
    requestAnimationFrame(keyPanStep);
  }
  function minPPM() { return fitPPM(); }
  function zoomAt(sx, sy, f) {
    if (!mapXform) drawBigMap(); if (!mapXform) return;
    const r = bigmap.getBoundingClientRect();
    const wx = (sx - mapXform.ox) / mapXform.k, wz = (sy - mapXform.oz) / mapXform.k;
    const tgt = clamp((zoomAnim ? zoomAnim.tgt : mapView.ppm) * f, minPPM(), 6);
    const running = !!zoomAnim;
    zoomAnim = { tgt, wx, wz, sx, sy, W: r.width, H: r.height };
    if (!running) requestAnimationFrame(stepZoom);
  }
  function fitMap() { const B = mapBounds(), r = bigmap.getBoundingClientRect(); zoomAnim = null; mapView.ppm = minPPM(); mapView.cx = (B.minX + B.maxX) / 2; mapView.cz = (B.minZ + B.maxZ) / 2; drawBigMap(); }
  function centreOnPlayer() { const pp = game.player?.position; if (!pp) return; zoomAnim = null; mapView.cx = pp.x; mapView.cz = pp.z; clampView(); drawBigMap(); }
  let zoomAnim = null;
  bigmap.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!mapXform) return;
    const r = bigmap.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
    const dX = e.deltaX * px, dY = e.deltaY * px;
    // Vertical scroll (mouse wheel or two-finger trackpad) always zooms at the cursor; pinch (ctrlKey) zooms faster.
    // A mostly-sideways trackpad swipe pans horizontally. Dragging pans in any direction.
    if (!e.ctrlKey && Math.abs(dX) > Math.abs(dY) * 1.5) { zoomAnim = null; mapView.cx += dX / mapView.ppm; clampView(); drawBigMap(); return; }
    if (dY) zoomAt(sx, sy, Math.exp(-clamp(dY, -240, 240) * (e.ctrlKey ? 0.01 : 0.0022)));
  }, { passive: false });
  function stepZoom() {
    const z = zoomAnim; if (!z) return;
    const lp = Math.log(mapView.ppm), lt = Math.log(z.tgt), nl = lp + (lt - lp) * 0.28;
    mapView.ppm = Math.exp(Math.abs(lt - nl) < 0.004 ? lt : nl);
    mapView.cx = z.wx - (z.sx - z.W / 2) / mapView.ppm; mapView.cz = z.wz - (z.sy - z.H / 2) / mapView.ppm;
    clampView(); drawBigMap();
    if (mapView.ppm === z.tgt || !ui.paused) { zoomAnim = null; return; }
    requestAnimationFrame(stepZoom);
  }
  window.addEventListener('resize', () => { if (ui.paused) drawBigMap(); });

  // ---------- functions ----------
  function requestLock() { try { const c = game.renderer?.domElement; c?.requestPointerLock && c.requestPointerLock()?.catch?.(() => {}); } catch (e) { /* ignore */ } }
  function hideTitle() { if (!ui.title) return; ui.title = false; title.classList.add('out'); root.classList.add('live'); setTimeout(() => (title.style.display = 'none'), 900); }

  function setPaused(p, relock) {
    if (ui.paused === p) return;
    pauseToggledAt = performance.now();
    ui.paused = p;
    pause.classList.toggle('on', p);
    root.classList.toggle('is-paused', p);
    if (p) {
      closeWheel(false);
      if (ui.photo) setPhoto(false);
      if (ui.phoneOpen) setPhone(false);
      if (document.pointerLockElement) document.exitPointerLock?.();
      const pp = game.player?.position;
      if (pp) { mapView.cx = pp.x; mapView.cz = pp.z; }
      mapView.ppm = mapR.ok() && (mapBounds().maxX - mapBounds().minX) > 2500 ? 0.55 : Math.max(fitPPM() * 1.6, 0.5);
      setTab(curTab);
      pauseLoop();
    } else if (relock) requestLock();
  }
  function pauseLoop() {
    if (!ui.paused) return;
    pmClock.textContent = fmtClock(game.timeOfDay);
    pmMoney.textContent = fmtMoney(num(game.player?.money));
    if (curTab === 0 && !drag) drawBigMap();
    if (curTab === 1) renderStats();
    setTimeout(() => requestAnimationFrame(pauseLoop), 250);
  }
  function setTab(i) {
    curTab = i;
    tabs.forEach((t, j) => t.classList.toggle('on', i === j));
    pages.forEach((p, j) => p.classList.toggle('on', i === j));
    if (i === 0) requestAnimationFrame(drawBigMap);
    if (i === 1) renderStats();
  }

  function setPhoto(on) {
    ui.photo = on;
    if (on) { setPhone(false); photoHint.classList.remove('on'); void photoHint.offsetWidth; photoHint.classList.add('on'); }
    root.classList.toggle('photo', on);
  }
  function setPhone(o) {
    if (ui.phoneOpen === o) return;
    ui.phoneOpen = o;
    phone.classList.toggle('on', o);
    root.classList.toggle('phone', o);
    if (!o) closeApp(); else refreshPhoneSel();
  }
  function refreshPhoneSel() { appEls.forEach((a, i) => a.classList.toggle('sel', i === phoneSel)); }
  function closeApp() { phoneAppOpen = -1; phApp.classList.remove('on'); }
  function openApp(i) {
    phoneAppOpen = i; const a = APPS[i];
    phAppTitle.textContent = a.name;
    phApp.style.setProperty('--app-bg', a.bg);
    phAppBody.innerHTML = appContent(a.id);
    phApp.classList.add('on');
    if (a.id === 'map') { const c = phAppBody.querySelector('canvas'); if (c) drawPhoneMap(c); }
    if (a.id === 'camera') setTimeout(() => { if (phoneAppOpen === i && ui.phoneOpen) setPhoto(true); }, 450);
  }
  function appContent(id) {
    const money = num(game.player?.money);
    switch (id) {
      case 'contacts': return list([['Marisol Vega', 'Fixer · Neon Row'], ['"Tiny" Okafor', 'Garage · Harbor District'], ['Dr. Anand', 'Solana General'], ['Coral Cabs', 'Dispatch'], ['Mom', 'Palmetto Heights'], ['Unknown', 'Blocked']]);
      case 'messages': return `<div class="ps-msgs">
          <div class="ps-msg in"><b>Marisol</b>Got a job on the boardwalk. Bring a fast car, keep it clean.</div>
          <div class="ps-msg out">On my way. Which pier?</div>
          <div class="ps-msg in"><b>Marisol</b>Pier 7. After sunset. Don't be late, sunshine.</div>
          <div class="ps-msg in"><b>Tiny</b>That coupe you scratched? It's on your tab. 😤</div></div>`;
      case 'camera': return `<div class="ps-cam"><div class="ps-cam-vf"><i></i><i></i><i></i><i></i></div><div class="ps-cam-shutter"></div></div>`;
      case 'map': return `<canvas class="ps-ph-map" width="440" height="560"></canvas><div class="ps-ph-maploc">${distName(num(game.player?.position?.x), num(game.player?.position?.z))}</div>`;
      case 'wavvy': return `<div class="ps-feed">
          ${post('@sunsetsally', 'Golden hour on Coral Beach never misses 🌅', 'linear-gradient(160deg,#ff9a5a,#ff5f8a 55%,#5a3c8a)', 2481)}
          ${post('@neonrow_eats', 'Late-night empanadas, open till 4. Line around the block.', 'linear-gradient(160deg,#ff5fb8,#3b2a7a)', 932)}
          ${post('@spd_calora', 'Reminder: the speed limit on Ocean Blvd is NOT a suggestion.', 'linear-gradient(160deg,#2a4b8a,#121a33)', 17)}</div>`;
      case 'bank': return `<div class="ps-bank"><div class="ps-bank-card"><span>FIRST CALORA</span><b>${fmtMoney(money)}</b><small>•••• 0721</small></div>
          ${list([['Coral Cabs', '-$18'], ['Pier 7 Bait & Tackle', '-$42'], ['Transfer · M. Vega', '+$1,500'], ['Solana Gas', '-$64']])}</div>`;
      case 'settings': return list([['Airplane mode', 'Off'], ['Ringtone', 'Lagoon Pulse'], ['Wallpaper', 'Sunset Gradient'], ['Graphics', String(settings.quality).toUpperCase()], ['Mouse sensitivity', settings.mouseSens.toFixed(2)], ['Version', 'SolanaOS 7.2']]);
    }
    return '';
  }
  function list(rows) { return `<div class="ps-list">${rows.map(([a, b]) => `<div class="ps-row"><span>${a}</span><small>${b}</small></div>`).join('')}</div>`; }
  function post(user, text, bg, likes) { return `<div class="ps-post"><div class="ps-post-u">${user}</div><div class="ps-post-img" style="background:${bg}"></div><div class="ps-post-t">${text}</div><div class="ps-post-l">♥ ${likes.toLocaleString()}</div></div>`; }

  // ---------- city bake ----------
  function tryBake() {
    const city = game.city;
    if (!city || !Array.isArray(city.roads)) return null;
    const W = Math.round((MAP_X1 - MAP_X0) * BAKE_PPM), H = Math.round((MAP_Z1 - MAP_Z0) * BAKE_PPM);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const P = (x) => (x - MAP_X0) * BAKE_PPM, Q = (z) => (z - MAP_Z0) * BAKE_PPM;
    const half = num(city.half, 500), L = -half - 20, T = -half - 20, LW = (440 + half + 20), LH = 2 * half + 40;
    // water: deep gradient away from shore
    const wg = g.createLinearGradient(P(520), 0, P(MAP_X1), 0);
    wg.addColorStop(0, '#1d7f8f'); wg.addColorStop(0.08, '#13596e'); wg.addColorStop(1, '#0a2f45');
    g.fillStyle = wg; g.fillRect(0, 0, W, H);
    const wg2 = g.createLinearGradient(P(L), 0, 0, 0);
    wg2.addColorStop(0, '#13596e'); wg2.addColorStop(1, '#0a2f45');
    g.fillStyle = wg2; g.fillRect(0, 0, P(L), H);
    // land
    g.fillStyle = '#1e2633'; g.fillRect(P(L), Q(T), LW * BAKE_PPM, LH * BAKE_PPM);
    // beach gradient + wet sand + surf foam
    const bg = g.createLinearGradient(P(440), 0, P(520), 0);
    bg.addColorStop(0, '#a89067'); bg.addColorStop(0.75, '#d9c08a'); bg.addColorStop(1, '#b7a275');
    g.fillStyle = bg; g.fillRect(P(440), Q(T), 80 * BAKE_PPM, LH * BAKE_PPM);
    g.fillStyle = 'rgba(220,255,250,.75)'; g.fillRect(P(519.5), Q(T), 2.5 * BAKE_PPM, LH * BAKE_PPM);
    g.fillStyle = 'rgba(160,240,235,.25)'; g.fillRect(P(522), Q(T), 6 * BAKE_PPM, LH * BAKE_PPM);
    // gentle water swell lines
    g.strokeStyle = 'rgba(160,240,235,.07)'; g.lineWidth = 2;
    for (let x = 536; x < MAP_X1; x += 18) { g.beginPath(); for (let z = MAP_Z0; z <= MAP_Z1; z += 20) { const xx = P(x + Math.sin(z * 0.03 + x) * 3); z === MAP_Z0 ? g.moveTo(xx, Q(z)) : g.lineTo(xx, Q(z)); } g.stroke(); }
    // roads: dark casing, sidewalk, asphalt fill, centre line
    const roads = city.roads.filter((r) => r && isFinite(r.x1) && isFinite(r.z1) && isFinite(r.x2) && isFinite(r.z2));
    const stroke = (style, extra, lw) => { g.strokeStyle = style; for (const r of roads) { g.lineWidth = lw ?? (num(r.width, 12) + extra) * BAKE_PPM; g.beginPath(); g.moveTo(P(r.x1), Q(r.z1)); g.lineTo(P(r.x2), Q(r.z2)); g.stroke(); } };
    g.lineCap = 'square';
    stroke('#10151e', 12);   // casing
    stroke('#3a4558', 8);    // sidewalk
    stroke('#141a24', 1.2);  // inner edge
    stroke('#6f7d96', 0);    // asphalt (light fill)
    g.lineCap = 'butt'; g.setLineDash([3 * BAKE_PPM, 3 * BAKE_PPM]);
    stroke('rgba(255,220,150,.45)', 0, 1.2);
    g.setLineDash([]);
    // buildings: soft drop shadow, body gradient by height, lit top edge
    const blds = (Array.isArray(city.buildings) ? city.buildings : []).filter((b) => b && isFinite(b.x) && isFinite(b.z));
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 6; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
    for (const b of blds) {
      const w = num(b.w, 10), d = num(b.d, 10), t = clamp(num(b.h, 10) / 120, 0, 1);
      g.fillStyle = `rgb(${40 + t * 38},${49 + t * 42},${66 + t * 50})`;
      roundRect(g, P(b.x - w / 2), Q(b.z - d / 2), w * BAKE_PPM, d * BAKE_PPM, 2.5); g.fill();
    }
    g.restore();
    for (const b of blds) {
      const w = num(b.w, 10), d = num(b.d, 10), x = P(b.x - w / 2), y = Q(b.z - d / 2);
      const gr = g.createLinearGradient(x, y, x + w * BAKE_PPM, y + d * BAKE_PPM);
      gr.addColorStop(0, 'rgba(255,255,255,.14)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
      g.fillStyle = gr; roundRect(g, x, y, w * BAKE_PPM, d * BAKE_PPM, 2.5); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1; g.stroke();
    }
    return c;
  }

  // ---------- minimap ----------
  function camForward() {
    let fx = 0, fz = -1;
    try {
      if (tmpDir && game.camera?.getWorldDirection) { game.camera.getWorldDirection(tmpDir); fx = tmpDir.x; fz = tmpDir.z; }
      else if (isFinite(game.cameraYaw)) { fx = -Math.sin(game.cameraYaw); fz = -Math.cos(game.cameraYaw); }
    } catch (e) { /* ignore */ }
    if (fx * fx + fz * fz < 1e-6) { fx = Math.sin(num(game.player?.heading)); fz = Math.cos(num(game.player?.heading)); }
    return Math.atan2(fz, fx);
  }
  function edgePoint(dx, dy, hw, hh) {
    const t = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
    return [dx * t, dy * t];
  }
  function drawMinimap(dt, speedKmh) {
    const g = mctx, p = game.player?.position;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = MAP_COLORS.water; g.fillRect(0, 0, MW, MH);
    if (!p) return;
    const bigCity = mapR.ok() && (mapBounds().maxX - mapBounds().minX) > 2500;
    const targetZoom = bigCity ? clamp(1.05 - speedKmh / 170, 0.28, 1.05) : clamp(1.0 - speedKmh / 200, 0.42, 1.0);
    mmZoom += (targetZoom - mmZoom) * (1 - Math.exp(-dt * 1.8));
    const camA = camForward();
    const thT = settings.northUp ? 0 : -Math.PI / 2 - camA;
    let dA = thT - mmAngle; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    mmAngle += dA * Math.min(1, dt * 12);
    const th = mmAngle;
    const hdg = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][((Math.round((camA + Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8];
    if (mmHdg.textContent !== hdg) mmHdg.textContent = hdg;
    const cx = MW / 2, cy = MH * 0.6;
    g.save();
    g.translate(cx, cy); g.rotate(th); g.scale(mmZoom, mmZoom); g.translate(-p.x, -p.z);
    {
      const R = Math.hypot(MW, MH) / 2 / mmZoom + 8;
      const drawn = mapR.draw(g, p.x - R, p.z - R, p.x + R, p.z + R, mmZoom * dpr, { id: 'mini' });
      if (!drawn && bake) { g.imageSmoothingEnabled = true; g.drawImage(bake, MAP_X0, MAP_Z0, MAP_X1 - MAP_X0, MAP_Z1 - MAP_Z0); }
    }
    // GPS route
    if (routeShown && routeShown.length > 1) strokeRoute(g, routeShown, 1 / mmZoom, 5);
    // police search area
    drawSearch(g, 1 / mmZoom);
    // vehicles
    const vl = game.vehicles?.list;
    if (Array.isArray(vl)) {
      for (const v of vl) {
        if (!v || v.playerDriven) continue;
        const vp = v.mesh?.position; if (!vp) continue;
        const police = v.police || v.typeKey === 'police' || /police|patrol|cruiser/i.test(v.name || '');
        if (police) continue; // drawn by the icon pass while wanted
        if (Math.abs(vp.x - p.x) > 400 || Math.abs(vp.z - p.z) > 400) continue;
        g.fillStyle = 'rgba(216,222,232,.85)';
        g.beginPath(); g.arc(vp.x, vp.z, 3 / mmZoom, 0, TAU); g.fill();
        g.lineWidth = 1 / mmZoom; g.strokeStyle = 'rgba(10,14,22,.85)'; g.stroke();
      }
    }
    g.restore();
    // icons (upright, decluttered)
    {
      const cs = Math.cos(th), sn = Math.sin(th);
      const toScreen = (x, z) => [cx + ((x - p.x) * cs - (z - p.z) * sn) * mmZoom, cy + ((x - p.x) * sn + (z - p.z) * cs) * mmZoom];
      const reserved = [[cx, cy, 30]];
      placeIcons(g, mapIcons(p, Math.max(1, mmZoom), 'mini'), toScreen, MW, MH, reserved, 0.9, 6);
    }
    // waypoint
    const wp = game.waypoint;
    if (wp && isFinite(wp.x) && isFinite(wp.z)) {
      const dx = wp.x - p.x, dz = wp.z - p.z, straight = Math.hypot(dx, dz);
      const dist = routeShown ? Math.max(straight, routeLen) : straight;
      if (straight < 14) { game.waypoint = null; route = routeShown = null; notify('Destination reached', 2000); mmDist.textContent = ''; }
      else {
        const sx = (dx * Math.cos(th) - dz * Math.sin(th)) * mmZoom, sy = (dx * Math.sin(th) + dz * Math.cos(th)) * mmZoom;
        let x = cx + sx, y = cy + sy, inside = x > 12 && x < MW - 12 && y > 12 && y < MH - 12;
        if (!inside) { const [ex, ey] = edgePoint(sx, sy, cx - 12, sy < 0 ? cy - 12 : MH - cy - 12); x = cx + ex; y = cy + ey; }
        // guide line (only when no road route)
        if (!routeShown) { g.strokeStyle = 'rgba(255,107,90,.55)'; g.setLineDash([4, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); g.setLineDash([]); }
        drawPin(g, x, y);
        mmDist.textContent = dist > 999 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m';
      }
    } else mmDist.textContent = '';
    // north marker
    {
      const nx = Math.sin(th), ny = -Math.cos(th);
      const [ex, ey] = edgePoint(nx, ny, cx - 13, ny < 0 ? cy - 13 : MH - cy - 13);
      g.fillStyle = 'rgba(10,14,22,.85)'; g.beginPath(); g.arc(cx + ex, cy + ey, 9, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#fff'; g.font = '700 11px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('N', cx + ex, cy + ey + 0.5);
    }
    // player arrow
    const h = num(game.player?.heading);
    const a = th + Math.atan2(Math.cos(h), Math.sin(h));
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = 'rgba(47,224,208,.22)'; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill();
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 4;
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -7); g.lineTo(-3.5, 0); g.lineTo(-7, 7); g.closePath(); g.fill();
    g.shadowBlur = 0; g.strokeStyle = '#2fe0d0'; g.lineWidth = 1.4; g.stroke();
    g.restore();
  }
  function drawSearch(g, px) {
    const W = game.wanted, c = W?.searchCenter, r = num(W?.searchRadius, 0);
    if (!c || !(r > 0) || !isFinite(c.x)) return;
    const cz = isFinite(c.z) ? c.z : num(c.y), blink = (performance.now() / 500 | 0) % 2;
    g.fillStyle = blink ? 'rgba(255,77,94,.16)' : 'rgba(77,139,255,.16)';
    g.beginPath(); g.arc(c.x, cz, r, 0, TAU); g.fill();
    g.strokeStyle = blink ? 'rgba(255,77,94,.85)' : 'rgba(77,139,255,.85)'; g.lineWidth = 2 * px;
    g.setLineDash([6 * px, 5 * px]); g.stroke(); g.setLineDash([]);
  }
  function copBlip(g, x, z, s, foot) {
    const blink = (performance.now() / 220 | 0) % 2;
    g.save(); g.translate(x, z);
    g.fillStyle = blink ? '#ff4d5e' : '#4d8bff';
    g.beginPath();
    if (foot) { g.moveTo(0, -s); g.lineTo(s, 0); g.lineTo(0, s); g.lineTo(-s, 0); g.closePath(); }
    else g.arc(0, 0, s, 0, TAU);
    g.fill(); g.lineWidth = s * 0.35; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
  }
  function livePOIs() {
    if (mapR.ok()) return shops().filter((q) => q.open);
    const L = game.interiors?.list;
    if (!Array.isArray(L) || !L.length) return mapR.ok() ? [] : POIS;
    if (livePOIs.src === L && livePOIs.n === L.length && performance.now() - livePOIs.t < 1000) return livePOIs.out;
    const out = [];
    for (const it of L) {
      const c = it?.center || it?.pos || it?.position; if (!c || !isFinite(c.x)) continue;
      const [glyph, col] = SHOP_GLYPH(it.type || it.name);
      out.push({ x: c.x, z: c.z, c: col, glyph, name: String(it.name || it.type || 'Shop'), closed: it.open === false, robbed: !!it.robbed });
    }
    if (!mapR.ok() && !out.some((o) => o.glyph === 'plus')) out.push(POIS[0]);
    Object.assign(livePOIs, { src: L, n: L.length, t: performance.now(), out });
    return out;
  }
  // ---- map icon model: every icon maps to a live entity ----
  function shopCat(t) {
    t = String(t || '').toLowerCase();
    if (/gun|arms|ammo/.test(t)) return 'guns';
    if (/cloth|apparel|fashion|boutique|sport|surf|shoe|outfit/.test(t)) return 'clothing';
    if (/bank|atm|pawn|exchange/.test(t)) return 'bank';
    if (/convenience|grocery|bodega|mart|supermarket|liquor|restaurant|cafe|coffee|fast|food|diner|icecream|ice_cream|bakery|bar\b|pizza|taco/.test(t)) return 'food';
    if (/pharm|clinic|hospital/.test(t)) return 'health';
    return 'other';
  }
  const CAT_STYLE = { guns: ['target', '#ff6b5a', 'Gun store'], clothing: ['shirt', '#c58cff', 'Clothing'], food: ['cup', '#ff8fc8', 'Food & convenience'], bank: ['dollar', '#3fcf8e', 'Bank / ATM'], health: ['plus', '#ff5d6c', 'Pharmacy'], other: ['bag', '#ffd27a', 'Shop'] };
  const KEY_CATS = new Set(['guns', 'clothing', 'food', 'bank']);
  let shopCache = null;
  function shops() {
    const L = game.interiors?.list;
    if (!Array.isArray(L) || !L.length) return mapR.ok() ? [] : POIS.map((q) => ({ ...q, cat: 'other', open: true }));
    if (shopCache && shopCache.src === L && shopCache.n === L.length && performance.now() - shopCache.t < 2000) return shopCache.out;
    const out = [];
    for (const it of L) {
      const c = it?.center || it?.pos || it?.position; if (!c || !isFinite(c.x)) continue;
      const cat = shopCat(it.type || it.kind || it.name);
      const [glyph, col] = cat === 'other' ? SHOP_GLYPH(it.type || it.name) : CAT_STYLE[cat];
      out.push({ x: c.x, z: c.z, c: col, glyph, cat, name: String(it.name || it.type || 'Shop'), open: it.open !== false, closed: it.open === false });
    }
    shopCache = { src: L, n: L.length, t: performance.now(), out };
    return out;
  }
  function policeEntities(p) {
    const out = [], lvl = num(game.wanted?.level, num(game.player?.wanted));
    if (!(lvl > 0) || !p) return out;
    const near = (q) => q && Math.hypot(q.x - p.x, q.z - p.z) < 400;
    for (const u of game.police?.units || []) if (u && u.active !== false && !u.dead && u.pos && near(u.pos)) out.push({ x: u.pos.x, z: u.pos.z, kind: 'cop' });
    const seen = new Set();
    for (const c of game.police?.cars || []) { const v = c?.v || c; const q = v?.mesh?.position; if (q && near(q)) { seen.add(v); out.push({ x: q.x, z: q.z, kind: 'copcar' }); } }
    for (const v of game.vehicles?.list || []) { if (!v || seen.has(v) || v.playerDriven) continue; if (!(v.police || v.typeKey === 'police')) continue; const q = v.mesh?.position; if (near(q)) out.push({ x: q.x, z: q.z, kind: 'copcar' }); }
    return out;
  }
  // mode 'mini' | 'big'; ppm = screen px per metre
  let respawnCache = null;
  function landmarks(p) {
    const out = [], c = game.city;
    const sp = c?.playerSpawn;
    if (sp && isFinite(sp.x)) out.push({ x: sp.x, z: sp.z, kind: 'home', label: 'Home (spawn)' });
    const api = game.gameplayCity;
    if (p && typeof api?.respawnPoint === 'function') {
      if (!respawnCache || Math.hypot(respawnCache.x - p.x, respawnCache.z - p.z) > 400) {
        const pts = {};
        for (const kind of ['hospital', 'police']) { try { const q = api.respawnPoint(kind, p); if (q && isFinite(q.x)) pts[kind] = { x: q.x, z: q.z }; } catch (e) { /* */ } }
        respawnCache = { x: p.x, z: p.z, pts };
      }
      if (respawnCache.pts.hospital) out.push({ ...respawnCache.pts.hospital, kind: 'hospital', label: 'Hospital (respawn)' });
      if (respawnCache.pts.police) out.push({ ...respawnCache.pts.police, kind: 'station', label: 'Police station (release)' });
    }
    return out;
  }
  function mapIcons(p, ppm, mode, view) {
    const icons = [];
    for (const lm of landmarks(p)) icons.push({ x: lm.x, z: lm.z, prio: 88, lm: lm.kind, draw: (g, x, y, s) => drawLandmark(g, x, y, lm.kind, s) });
    for (const c of policeEntities(p)) icons.push({ ...c, prio: 95, draw: (g, x, y) => copBlipScreen(g, x, y, c.kind === 'cop') });
    const PL = game.pickups?.list;
    if (Array.isArray(PL) && p) {
      let n = 0;
      for (const pk of PL) {
        if (!pk || !pk.active || !pk.mapIcon || !pk.pos) continue;
        const d = Math.hypot(pk.pos.x - p.x, pk.pos.z - p.z);
        const zoomOK = mode === 'big' && ppm >= 1.4 && view && pk.pos.x > view[0] && pk.pos.x < view[2] && pk.pos.z > view[1] && pk.pos.z < view[3];
        if (d > 250 && !zoomOK) continue;
        if (++n > 60) break;
        const pr = { weapon: 70, armor: 56, health: 55, ammo: 50, cash: 45 }[pk.mapIcon] ?? 40;
        icons.push({ x: pk.pos.x, z: pk.pos.z, prio: pr - d / 1000, draw: (g, x, y, s) => drawPickup(g, x, y, pk.mapIcon, s) });
      }
    }
    const S = shops();
    const far = mode === 'big' ? ppm < 0.9 : ppm < 0.55;
    if (far) {
      const cell = Math.max(500, (mode === 'big' ? 230 : 120) / Math.max(0.02, ppm)), cl = new Map();
      for (const sh of S) {
        if (!sh.open || !KEY_CATS.has(sh.cat)) continue;
        if (sh.cat === 'food' && ppm < 0.35) continue;
        if (view && (sh.x < view[0] || sh.x > view[2] || sh.z < view[1] || sh.z > view[3])) continue;
        const k = sh.cat + ':' + Math.floor(sh.x / cell) + ':' + Math.floor(sh.z / cell);
        let c = cl.get(k); if (!c) cl.set(k, (c = { x: 0, z: 0, n: 0, sh }));
        c.x += sh.x; c.z += sh.z; c.n++;
      }
      for (const c of cl.values()) {
        const poi = { ...c.sh, closed: false }, n = c.n;
        icons.push({ x: c.x / n, z: c.z / n, prio: (poi.cat === 'guns' ? 65 : 38) + Math.min(5, n * 0.3), cat: poi.cat, draw: (g, x, y, s) => { drawPOI(g, x, y, poi, s); if (n > 1) countBadge(g, x + 7 * s, y - 7 * s, n); } });
      }
    } else {
      // close zoom: individual open stores, lightly clustered by screen distance so dense blocks stay readable
      const showClosed = mode === 'big' && ppm >= 3.5;
      const showMinor = ppm >= 2.5 || mode === 'mini';
      const cell = 110 / Math.max(0.05, ppm), cl = new Map();
      for (const sh of S) {
        if (!sh.open && !showClosed) continue;
        if (!showMinor && !KEY_CATS.has(sh.cat)) continue;
        if (view && (sh.x < view[0] || sh.x > view[2] || sh.z < view[1] || sh.z > view[3])) continue;
        if (!view && p && (Math.abs(sh.x - p.x) > 350 || Math.abs(sh.z - p.z) > 350)) continue;
        const k2 = sh.cat + (sh.open ? '' : '~') + ':' + Math.floor(sh.x / cell) + ':' + Math.floor(sh.z / cell);
        let c = cl.get(k2); if (!c) cl.set(k2, (c = { x: 0, z: 0, n: 0, sh }));
        c.x += sh.x; c.z += sh.z; c.n++;
      }
      for (const c of cl.values()) {
        const sh = c.sh, n = c.n, x = n === 1 ? sh.x : c.x / n, z = n === 1 ? sh.z : c.z / n;
        icons.push({ x, z, cat: sh.cat, prio: (sh.cat === 'guns' ? 65 : sh.cat === 'bank' ? 42 : KEY_CATS.has(sh.cat) ? 36 : 30) - (sh.open ? 0 : 15) + Math.min(4, n * 0.3),
          draw: (g, x2, y2, s2) => { drawPOI(g, x2, y2, sh, s2); if (n > 1) countBadge(g, x2 + 7 * s2, y2 - 7 * s2, n); } });
      }
    }
    if (mapR.ok() && mapR.boundary()) return icons.filter((ic) => ic.prio >= 88 || mapR.inside(ic.x, ic.z));
    return icons;
  }
  function drawLandmark(g, x, y, kind, s = 1) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
    const col = kind === 'home' ? '#2fe0d0' : kind === 'hospital' ? '#ff5d6c' : '#4d8bff';
    g.fillStyle = '#0b0f17'; roundRect(g, -8.5, -8.5, 17, 17, 5); g.fill(); g.shadowColor = 'transparent';
    g.strokeStyle = col; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = col; g.strokeStyle = col;
    if (kind === 'home') { g.beginPath(); g.moveTo(0, -5); g.lineTo(5.2, -0.6); g.lineTo(3.6, -0.6); g.lineTo(3.6, 4.6); g.lineTo(-3.6, 4.6); g.lineTo(-3.6, -0.6); g.lineTo(-5.2, -0.6); g.closePath(); g.fill(); g.fillStyle = '#0b0f17'; g.fillRect(-1.1, 1.4, 2.2, 3.2); }
    else if (kind === 'hospital') { g.fillRect(-1.5, -5, 3, 10); g.fillRect(-5, -1.5, 10, 3); }
    else { g.beginPath(); g.moveTo(0, -5.2); g.lineTo(4.6, -3.2); g.lineTo(4, 1.2); g.quadraticCurveTo(2.6, 4, 0, 5.4); g.quadraticCurveTo(-2.6, 4, -4, 1.2); g.lineTo(-4.6, -3.2); g.closePath(); g.fill(); g.fillStyle = '#0b0f17'; g.beginPath(); g.arc(0, 0, 1.6, 0, TAU); g.fill(); }
    g.restore();
  }
  // place icons by priority with screen-space collision avoidance
  function placeIcons(g, icons, toScreen, W, H, reserved, s = 1, pad = 4) {
    icons.sort((a, b) => b.prio - a.prio);
    const placed = reserved.slice(), shown = [];
    const R = 8 * s + pad;
    for (const ic of icons) {
      const [x, y] = toScreen(ic.x, ic.z);
      if (x < 8 || y < 8 || x > W - 8 || y > H - 8) continue;
      let hit = false;
      for (const q of placed) { const rr = (q[2] ?? R) / 2 + R / 2; if (Math.abs(q[0] - x) < rr && Math.abs(q[1] - y) < rr) { hit = true; break; } }
      if (hit) continue;
      placed.push([x, y, R]); shown.push(ic);
      ic.draw(g, x, y, s);
    }
    return { placed, shown };
  }
  function copBlipScreen(g, x, y, foot) {
    const blink = (performance.now() / 220 | 0) % 2, s2 = foot ? 4.2 : 5.2;
    g.save(); g.translate(x, y);
    g.fillStyle = blink ? '#ff4d5e' : '#4d8bff'; g.beginPath();
    if (foot) { g.moveTo(0, -s2); g.lineTo(s2, 0); g.lineTo(0, s2); g.lineTo(-s2, 0); g.closePath(); } else g.arc(0, 0, s2, 0, TAU);
    g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke(); g.restore();
  }
  function countBadge(g, x, y, n) {
    const t = n > 99 ? '99+' : String(n);
    g.save(); g.font = '800 9px "Barlow Condensed", sans-serif'; const w = Math.max(11, g.measureText(t).width + 6);
    g.fillStyle = '#0b0f17'; roundRect(g, x - w / 2, y - 5.5, w, 11, 5.5); g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y + 0.5); g.restore();
  }
  function strokeRoute(g, pts, px, w) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.strokeStyle = 'rgba(40,8,10,.75)'; g.lineWidth = (w + 3) * px; g.stroke();
    g.strokeStyle = '#ff6b5a'; g.lineWidth = w * px; g.stroke();
    g.setLineDash([2 * px, 10 * px]); g.lineDashOffset = -(performance.now() / 60) * px;
    g.strokeStyle = 'rgba(255,240,220,.85)'; g.lineWidth = Math.max(1, w * 0.35) * px; g.stroke();
    g.restore();
  }
  function updateRoute(dt) {
    const wp = game.waypoint, p = game.player?.position;
    if (!wp || !p || !isFinite(wp.x) || !gps.available()) { route = routeShown = null; routeFor = null; return; }
    routeCheck -= dt;
    if (routeCheck > 0 && route && routeFor === wp) { return; }
    routeCheck = 0.25;
    const now = performance.now();
    const off = route ? gps.distTo(route.pts, p.x, p.z) : Infinity;
    if (routeFor !== wp || (off > 40 && now - routeAt > 1500)) {
      routeAt = now; routeFor = wp;
      try { route = gps.route(p.x, p.z, wp.x, wp.z); } catch (e) { console.warn('[hud gps]', e); route = null; }
    }
    if (route) { routeShown = gps.trimFrom(route.pts, p.x, p.z); routeLen = gps.polyLen(routeShown); }
    else routeShown = null;
  }
  function drawPin(g, x, y, s = 1) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#ff6b5a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-7, -9, -7, -17, 0, -17); g.bezierCurveTo(7, -17, 7, -9, 0, 0); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -11, 2.6, 0, TAU); g.fill();
    g.restore();
  }

  // ---------- big map ----------
  let grainPat = null;
  function grain(g) {
    if (!grainPat) {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const x = c.getContext('2d'), im = x.createImageData(160, 160);
      for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0);
      grainPat = g.createPattern(c, 'repeat');
    }
    return grainPat;
  }
  function drawBigMap() {
    if (!bake && !mapR.ok()) bake = tryBake();
    const r = bigmap.getBoundingClientRect();
    if (r.width < 10) return;
    const d = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * d), H = Math.round(r.height * d);
    if (bigmap.width !== W || bigmap.height !== H) { bigmap.width = W; bigmap.height = H; }
    const g = bctx; g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = MAP_COLORS.water; g.fillRect(0, 0, r.width, r.height);
    mapView.ppm = clamp(mapView.ppm, fitPPM(), 6);
    const k = mapView.ppm, ox = r.width / 2 - mapView.cx * k, oz = r.height / 2 - mapView.cz * k;
    mapXform = { k, ox, oz };
    const view = [-ox / k, -oz / k, (r.width - ox) / k, (r.height - oz) / k];
    g.save(); g.translate(ox, oz); g.scale(k, k);
    const drawn = mapR.draw(g, view[0], view[1], view[2], view[3], k * d, { budget: 28, quality: 0.75, id: 'big' });
    if (drawn && mapR.pending > 0 && !bigPendingTimer) bigPendingTimer = setTimeout(() => { bigPendingTimer = 0; if (ui.paused && curTab === 0) drawBigMap(); }, 20);
    if (!drawn && bake) g.drawImage(bake, MAP_X0, MAP_Z0, MAP_X1 - MAP_X0, MAP_Z1 - MAP_Z0);
    g.restore();
    // paper grain
    g.save(); g.globalAlpha = 0.05; g.globalCompositeOperation = 'overlay'; g.fillStyle = grain(g); g.fillRect(0, 0, r.width, r.height); g.restore();
    g.save(); g.translate(ox, oz); g.scale(k, k);
    if (routeShown && routeShown.length > 1) strokeRoute(g, routeShown, 1 / k, 4.5);
    g.restore();
    drawSearchBig((g2) => drawSearch(g2, 1 / k));
    // street names (screen space, own collision handling)
    try { mapR.drawStreetLabels(g, mapXform, r.width, r.height); } catch (e) { /* */ }
    const toScreen = (x, z) => [ox + x * k, oz + z * k];
    const p = game.player?.position, wp = game.waypoint;
    const reserved = [];
    if (p) reserved.push([...toScreen(p.x, p.z), 34]);
    if (wp && isFinite(wp.x)) { const [wx, wy] = toScreen(wp.x, wp.z); reserved.push([wx, wy - 12, 34]); }
    // district labels (higher priority than shops when zoomed out)
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const DL = mapR.districts();
    const labels = DL.length ? DL.map((d2) => [d2.name, d2.x, d2.z, d2.size]) : DISTRICT_LABELS.map(([n, x, z]) => [n, x, z, 20]);
    labels.sort((a2, b2) => b2[3] - a2[3]);
    const fsBase = DL.length ? clamp(10 + k * 14, 12, 26) : clamp(13 * k / 0.6, 12, 26);
    const labelBoxes = [];
    if (k < 2.2) for (const [n, x, z, size] of labels) {
      const [sx, sy] = toScreen(x, z);
      if (sx < 40 || sy < 20 || sx > r.width - 40 || sy > r.height - 20) continue;
      if (DL.length && size < 3 && k < 0.6) continue;
      const fs = Math.round(fsBase * (DL.length ? clamp(0.8 + Math.sqrt(size) * 0.05, 0.8, 1.35) : 1));
      g.font = `800 ${fs}px "Barlow Condensed", sans-serif`;
      const txt = n.toUpperCase(), tw = g.measureText(txt).width;
      if (labelBoxes.some((q) => Math.abs(q[0] - sx) < (q[2] + tw) / 2 + 10 && Math.abs(q[1] - sy) < fs + 4)) continue;
      if (reserved.some((q) => Math.abs(q[0] - sx) < tw / 2 + 14 && Math.abs(q[1] - sy) < fs)) continue;
      labelBoxes.push([sx, sy, tw]);
      g.lineWidth = 4; g.strokeStyle = 'rgba(6,9,14,.7)'; g.lineJoin = 'round'; g.strokeText(txt, sx, sy);
      g.fillStyle = distColor(n); g.globalAlpha = 0.92; g.fillText(txt, sx, sy); g.globalAlpha = 1;
      reserved.push([sx, sy, Math.min(tw, 60)]);
    }
    // entity icons with declutter
    const iconS = clamp(0.85 + k * 0.4, 1, 1.5);
    const { shown } = placeIcons(g, mapIcons(p, k, 'big', view), toScreen, r.width, r.height, reserved, iconS, k < 0.9 ? 12 : 10);
    // waypoint
    if (wp && isFinite(wp.x)) {
      const [wx, wy] = toScreen(wp.x, wp.z);
      if (p && !routeShown) {
        g.strokeStyle = 'rgba(255,107,90,.8)'; g.lineWidth = 2.5; g.setLineDash([6, 6]); g.lineDashOffset = -performance.now() / 40;
        g.beginPath(); g.moveTo(...toScreen(p.x, p.z)); g.lineTo(wx, wy); g.stroke(); g.setLineDash([]);
      }
      if (p) {
        const dist = routeShown ? routeLen : Math.hypot(wp.x - p.x, wp.z - p.z);
        g.font = '700 14px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
        g.lineWidth = 3; g.strokeStyle = 'rgba(6,9,14,.8)'; const t = dist > 999 ? (dist / 1000).toFixed(2) + ' KM' : Math.round(dist) + ' M';
        g.strokeText(t, wx, wy + 14); g.fillStyle = '#fff'; g.fillText(t, wx, wy + 14);
      }
      drawPin(g, wx, wy, 1.4);
    }
    // player
    if (p) {
      const h = num(game.player?.heading), [sx, sy] = toScreen(p.x, p.z);
      const pulse = 10 + 4 * Math.sin(performance.now() / 300);
      g.fillStyle = 'rgba(47,224,208,.25)'; g.beginPath(); g.arc(sx, sy, pulse, 0, TAU); g.fill();
      g.save(); g.translate(sx, sy); g.rotate(Math.atan2(Math.cos(h), Math.sin(h)));
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 5;
      g.fillStyle = '#fff'; g.strokeStyle = '#2fe0d0'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(11, 0); g.lineTo(-8, -8); g.lineTo(-4, 0); g.lineTo(-8, 8); g.closePath(); g.fill(); g.shadowBlur = 0; g.stroke();
      g.restore();
      { const sn = streetName(p.x, p.z); mapLoc.innerHTML = `<small>YOU ARE IN</small>${distName(p.x, p.z)}${sn ? `<em>${sn.replace(/[<>&]/g, '')}</em>` : ''}`; }
    }
    // legend: categories actually on screen
    {
      const cats = [...new Set(shown.filter((q) => q.cat).map((q) => q.cat))].slice(0, 6);
      const extra = [];
      for (const [lk, lt] of [['home', 'Home (spawn)'], ['hospital', 'Hospital (respawn)'], ['station', 'Police station']]) if (shown.some((q) => q.lm === lk)) extra.push(['lm:' + lk, lt]);
      if (shown.some((q) => q.prio >= 95)) extra.push(['cop', 'Police (while wanted)']);
      if (shown.some((q) => q.prio >= 44 && q.prio < 88 && !q.cat && !q.lm)) extra.push(['pickup', 'Pickups nearby']);
      const rows = cats.length + extra.length;
      if (rows) {
        const lw = 176, lh = 14 + rows * 21, lx = r.width - lw - 14, ly = r.height - lh - 40;
        g.fillStyle = 'rgba(9,11,18,.72)'; roundRect(g, lx, ly, lw, lh, 10); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1; g.stroke();
        let y = ly + 17;
        g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        for (const c of cats) { const st = CAT_STYLE[c]; drawPOI(g, lx + 17, y, { c: st[1], glyph: st[0] }, 0.8); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(st[2], lx + 32, y + 0.5); y += 21; }
        for (const [kd, txt] of extra) { if (kd === 'cop') copBlipScreen(g, lx + 17, y, true); else if (kd.startsWith('lm:')) drawLandmark(g, lx + 17, y, kd.slice(3), 0.8); else drawPickup(g, lx + 17, y, 'weapon', 0.9); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(txt, lx + 32, y + 0.5); y += 21; }
        g.textAlign = 'center';
      }
    }
    // compass
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 14px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
    g.fillText('N', r.width - 30, 26); g.fillRect(r.width - 31, 34, 2, 18);
  }
  function drawSearchBig(fn) {
    if (!mapXform) return;
    bctx.save(); bctx.translate(mapXform.ox, mapXform.oz); bctx.scale(mapXform.k, mapXform.k); fn(bctx); bctx.restore();
  }
  function drawPhoneMap(c) {
    const g = c.getContext('2d'), p = game.player?.position || { x: 0, z: 0 };
    if (!bake && !mapR.ok()) bake = tryBake();
    g.fillStyle = MAP_COLORS.water; g.fillRect(0, 0, c.width, c.height);
    const k = 1.2;
    g.save(); g.translate(c.width / 2, c.height / 2); g.scale(k, k); g.translate(-p.x, -p.z);
    const R = Math.hypot(c.width, c.height) / 2 / k;
    if (!mapR.draw(g, p.x - R, p.z - R, p.x + R, p.z + R, k, { id: 'phone' }) && bake) g.drawImage(bake, MAP_X0, MAP_Z0, MAP_X1 - MAP_X0, MAP_Z1 - MAP_Z0);
    if (routeShown && routeShown.length > 1) strokeRoute(g, routeShown, 1 / k, 6);
    g.restore();
    g.fillStyle = '#2fe0d0'; g.beginPath(); g.arc(c.width / 2, c.height / 2, 7, 0, TAU); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
  }

  // ---------- settings / controls / stats ----------
  function buildSettings(host) {
    const mk = (label, key, min, max, step, fmt) => {
      const row = el('div', 'ps-set-row');
      row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><output>${fmt(settings[key])}</output>`;
      const inp = row.querySelector('input'), out = row.querySelector('output');
      const paint = () => inp.style.setProperty('--pct', ((inp.value - min) / (max - min) * 100) + '%');
      paint();
      inp.addEventListener('input', () => { settings[key] = parseFloat(inp.value); out.textContent = fmt(settings[key]); paint(); saveSettings(); });
      host.appendChild(row);
    };
    mk('Mouse sensitivity', 'mouseSens', 0.2, 3, 0.05, (v) => v.toFixed(2) + '×');
    mk('Field of view', 'fov', 50, 95, 1, (v) => Math.round(v) + '°');
    const q = el('div', 'ps-set-row');
    q.innerHTML = `<label>Graphics quality</label><div class="ps-seg"><button data-q="medium">MEDIUM</button><button data-q="high">HIGH</button></div><span></span>`;
    const btns = [...q.querySelectorAll('button')];
    const paintQ = () => btns.forEach((b) => b.classList.toggle('on', b.dataset.q === settings.quality));
    btns.forEach((b) => b.addEventListener('click', () => { settings.quality = b.dataset.q; paintQ(); saveSettings(); }));
    paintQ(); host.appendChild(q);
    const r = el('div', 'ps-set-row');
    r.innerHTML = `<label>Minimap orientation</label><div class="ps-seg"><button data-v="0">ROTATE</button><button data-v="1">NORTH UP</button></div><span></span>`;
    const rb = [...r.querySelectorAll('button')];
    const paintR = () => rb.forEach((b) => b.classList.toggle('on', (b.dataset.v === '1') === !!settings.northUp));
    rb.forEach((b) => b.addEventListener('click', () => { settings.northUp = b.dataset.v === '1'; paintR(); saveSettings(); }));
    paintR(); host.appendChild(r);
    host.appendChild(el('div', 'ps-set-note', 'Settings are saved on this device and apply instantly.'));
  }
  function saveSettings() {
    try {
      localStorage.setItem('portsolana.settings', JSON.stringify(settings));
      if (game.camera && isFinite(settings.fov) && game.camera.fov !== settings.fov && !game.settingsAppliedByMain) { /* main applies */ }
    } catch (e) { /* ignore */ }
  }
  function buildControls(host) {
    const rows = [
      ['ON FOOT', [['W A S D', 'Move'], ['Shift', 'Sprint'], ['Space', 'Jump'], ['Mouse', 'Look'], ['LMB', 'Punch'], ['F', 'Enter / exit vehicle']]],
      ['DRIVING', [['W / S', 'Throttle / brake · reverse'], ['A / D', 'Steer'], ['Space', 'Handbrake'], ['H', 'Horn'], ['F', 'Exit vehicle']]],
      ['GENERAL', [['▲ Arrow Up', 'Phone'], ['◀ ▶ / Enter', 'Phone navigate / open'], ['▼ / Backspace', 'Close phone · back'], ['Esc / P', 'Pause menu']]],
    ];
    host.innerHTML = rows.map(([h, items]) => `<div class="ps-ctl-col"><h3>${h}</h3>${items.map(([k, v]) => `<div class="ps-ctl"><span>${k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join('<em>/</em>')}</span><b>${v}</b></div>`).join('')}</div>`).join('');
  }
  function renderStats() {
    const t = stats.time, hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = Math.floor(t) % 60;
    const items = [
      ['Time on the streets', `${hh ? hh + 'h ' : ''}${mm}m ${String(ss).padStart(2, '0')}s`],
      ['Distance travelled', (stats.dist / 1000).toFixed(2) + ' km'],
      ['Distance driven', (stats.driveDist / 1000).toFixed(2) + ' km'],
      ['Top speed', Math.round(stats.topSpeed) + ' km/h'],
      ['Vehicles entered', stats.vehiclesEntered],
      ['Cash on hand', fmtMoney(num(game.player?.money))],
      ['Heat level', '★'.repeat(num(game.player?.wanted)) || 'Clean'],
      ['Times knocked out', stats.deaths],
      ['Current district', game.player?.position ? distName(game.player.position.x, game.player.position.z) : '—'],
    ];
    statsGrid.innerHTML = items.map(([a, b]) => `<div class="ps-stat"><small>${a}</small><b>${b}</b></div>`).join('');
  }

  function wDefs() {
    const W = game.weapons;
    if (W && W.defs && Array.isArray(W.order)) return { order: W.order, defs: W.defs };
    const defs = {}; WEAPONS.forEach((w, i) => { defs[w.id] = { name: w.name, slot: i + 1, melee: w.id === 'fist' || w.id === 'bat' }; });
    return { order: WEAPONS.map((w) => w.id), defs };
  }
  function hasWeapon(id) {
    if (id === 'fist') return true;
    if (typeof game.weapons?.has === 'function') { try { return !!game.weapons.has(id); } catch (e) { /* fall through */ } }
    const inv = game.player?.inventory;
    if (!inv) return id === game.player?.weapon;
    if (Array.isArray(inv)) return inv.includes(id);
    if (inv instanceof Set) return inv.has(id);
    if (typeof inv === 'object') return !!inv[id];
    return false;
  }
  function weaponIcon(id) {
    const d = wDefs().defs[id];
    return ICON[id] || (d && ICON[d.hud]) || ICON.fist;
  }
  // returns null for melee, {clip, reserve, total, throw}
  function ammoInfo(id) {
    const d = wDefs().defs[id] || {};
    if (id === 'fist' || id === 'bat' || id === 'knife' || d.melee || d.cls === 'melee') return null;
    const total = Math.max(0, Math.floor(num(game.player?.ammo?.[id], 0)));
    if (d.throw || d.cls === 'throwable') return { total, throw: true };
    const c = game.player?.clip?.[id];
    if (c == null) return { total };
    const clip = Math.max(0, Math.floor(num(c, 0)));
    return { clip, reserve: Math.max(0, total - clip), total };
  }
  function ammoText(id) {
    const a = ammoInfo(id);
    if (!a) return '';
    if (a.throw || a.clip == null) return '×' + a.total;
    return a.clip + ' / ' + a.reserve;
  }
  function ammoOf(id) { const a = ammoInfo(id); return a ? a.total : null; }
  function openWheel() {
    if (ui.weaponWheel) return;
    ui.weaponWheel = true; wheelVec = { x: 0, y: 0 };
    const { order, defs } = wDefs(), cur = game.player?.weapon || 'fist';
    const bySlot = new Map();
    for (const k of order) { const sl = num(defs[k]?.slot, 99); if (!bySlot.has(sl)) bySlot.set(sl, []); bySlot.get(sl).push(k); }
    wheelGroups = [...bySlot.entries()].sort((x, y) => x[0] - y[0]).map(([slot, keys]) => ({ slot, keys, owned: keys.filter(hasWeapon) }));
    wheelPick = wheelGroups.map((gr) => (gr.keys.includes(cur) ? gr.keys.indexOf(cur) : gr.keys.indexOf(gr.owned[0] ?? gr.keys[0])));
    wheelSel = Math.max(0, wheelGroups.findIndex((gr) => gr.keys.includes(cur)));
    const n = wheelGroups.length, R = n > 6 ? 36.5 : 35.5;
    wSlotsHost.innerHTML = wheelGroups.map((gr, i) => {
      const a = (i / n) * TAU - Math.PI / 2;
      return `<div class="ps-wslot" style="left:${(50 + Math.cos(a) * R).toFixed(2)}%;top:${(50 + Math.sin(a) * R).toFixed(2)}%"><span class="ps-wslot-no">${gr.slot}</span><div class="ps-wslot-ico"></div><div class="ps-wslot-ammo"></div><div class="ps-wslot-dots"></div><div class="ps-wslot-lock">${ICON.lock}</div></div>`;
    }).join('');
    wslots = [...wSlotsHost.children];
    const seg = 360 / Math.max(1, n);
    wHl.style.background = `conic-gradient(from ${-seg / 2}deg, rgba(255, 107, 90, .6) 0 ${seg}deg, transparent ${seg}deg)`;
    wslots.forEach((_, i) => paintSlot(i));
    paintWheel(); wheel.classList.add('on'); root.classList.add('wheel');
  }
  function paintSlot(i) {
    const gr = wheelGroups[i], sl = wslots[i]; if (!gr || !sl) return;
    const key = gr.keys[wheelPick[i]] ?? gr.keys[0], own = hasWeapon(key);
    sl.classList.toggle('locked', !gr.owned.length);
    sl.classList.toggle('unowned', !own);
    sl.querySelector('.ps-wslot-ico').innerHTML = weaponIcon(key);
    sl.querySelector('.ps-wslot-ammo').textContent = own ? ammoText(key) : '';
    sl.querySelector('.ps-wslot-dots').innerHTML = gr.keys.length > 1 ? gr.keys.map((k) => `<i class="${k === key ? 'cur' : ''}${hasWeapon(k) ? ' own' : ''}"></i>`).join('') : '';
  }
  function cycleInSlot(d) {
    const gr = wheelGroups[wheelSel]; if (!gr || gr.owned.length < 2) return;
    const curKey = gr.keys[wheelPick[wheelSel]], oi = Math.max(0, gr.owned.indexOf(curKey));
    wheelPick[wheelSel] = gr.keys.indexOf(gr.owned[(oi + d + gr.owned.length) % gr.owned.length]);
    paintSlot(wheelSel); paintWheel();
  }
  function paintWheel() {
    const n = Math.max(1, wheelGroups.length);
    wslots.forEach((sl, i) => sl.classList.toggle('sel', i === wheelSel));
    wHl.style.transform = `rotate(${(wheelSel / n) * 360}deg)`;
    const gr = wheelGroups[wheelSel]; if (!gr) return;
    const key = gr.keys[wheelPick[wheelSel]] ?? gr.keys[0], d = wDefs().defs[key] || {}, own = hasWeapon(key), a = ammoInfo(key);
    wName.textContent = String(d.name || key).toUpperCase();
    wInfo.textContent = !own ? (d.price ? 'NOT OWNED · ' + fmtMoney(d.price) : 'NOT OWNED') : !a ? 'MELEE' : a.throw ? a.total + ' LEFT' : a.clip == null ? a.total + ' ROUNDS' : a.clip + ' / ' + a.reserve;
    wSlotNo.textContent = 'SLOT ' + gr.slot + (gr.owned.length > 1 ? ' · ▲▼ ' + gr.owned.length + ' OWNED' : '');
  }
  function closeWheel(apply) {
    if (!ui.weaponWheel) return;
    ui.weaponWheel = false; wheel.classList.remove('on'); root.classList.remove('wheel');
    const gr = wheelGroups[wheelSel]; if (!gr) return;
    const key = gr.keys[wheelPick[wheelSel]] ?? gr.keys[0];
    if (!apply || !game.player || !hasWeapon(key) || game.player.weapon === key) return;
    if (typeof game.weapons?.select === 'function') { try { game.weapons.select(key); return; } catch (e) { /* fallback */ } }
    game.player.weapon = key; game.emit?.('weaponChange', { weapon: key });
  }
  function showArrest(fee) {
    const f = Math.max(0, Math.round(num(fee, 0)));
    arrestFee.innerHTML = f ? `Processing fee <b>${fmtMoney(f)}</b>` : 'No charges filed';
    arrestEl.classList.add('on'); arrestTimer = 5.5;
    if (ui.phoneOpen) setPhone(false); closeWheel(false);
  }
  const crimeSeen = {};
  function crimeToast(d) {
    if (!d) return;
    const t = String(d.type || 'crime'), now = performance.now();
    if (crimeSeen[t] && now - crimeSeen[t] < 4000) return;
    crimeSeen[t] = now;
    const name = CRIME_NAMES[t] || t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    notify(`Crime reported: ${name}`, 3200, { kind: 'crime', severity: d.severity });
  }
  // event bus hooks (all optional)
  if (typeof game.on === 'function') {
    game.on('shot', () => { lastShotAt = performance.now(); spread = Math.min(26, spread + 9); xhair.classList.remove('kick'); void xhair.offsetWidth; xhair.classList.add('kick'); });
    game.on('punch', () => { lastPunchAt = performance.now(); });
    game.on('hit', (d) => {
      if (!d || d.target === 'world') return;
      const now = performance.now(), byPlayer = now - lastShotAt < 700 || now - lastPunchAt < 700 || d.byPlayer || d.source === 'player';
      if (!byPlayer) return;
      const kill = !!(d.object && (d.object.dead || num(d.object.health, 1) <= 0));
      hitm.classList.remove('on', 'kill'); void hitm.offsetWidth; hitm.classList.add('on'); if (kill) hitm.classList.add('kill');
    });
    game.on('crime', (d) => { if (d && d.witnessed !== false) crimeToast(d); });
    game.on('arrest', (d) => showArrest(d?.fee));
    game.on('arrested', (d) => showArrest(d?.fee));
  }
  function setBar(bar, v) {
    const f = `scaleX(${v / 100})`;
    bar.children[1].style.transform = f;   // fill snaps quickly
    bar.children[0].style.transform = f;   // ghost trails behind (CSS delay)
  }

  // ---------- public API ----------
  function notify(text, ms = 3500, opts = {}) {
    if (!text) return;
    const n = el('div', 'ps-notif');
    const str = String(text);
    let kind = opts?.kind;
    const tm = /^(Purchased|Bought|Stole|Stolen|Shoplifted|Robbed|Looted|Pocketed)\b:?\s*(.+)$/i.exec(str);
    const verb = tm ? tm[1].toLowerCase() : '';
    if (!kind && tm) kind = /^(Purchased|Bought)$/i.test(tm[1]) ? 'purchase' : 'steal';
    if (!kind && /^Crime reported/i.test(str)) kind = 'crime';
    const m = kind ? null : /^([^:<>]{2,24}):\s+([\s\S]+)$/.exec(str);
    if (kind === 'purchase' || kind === 'steal') {
      const item = String(opts.item || (tm ? tm[2] : str)).replace(/\s+for\s+\$[\d,]+.*$/i, '').replace(/:?\s*[-+−]?\$[\d,]+.*$/, '').replace(/\s+\+\d+\s*health.*$/i, '').trim();
      const price = opts.price != null ? opts.price : (/\$([\d,]+)/.exec(str)?.[1] || '').replace(/,/g, '');
      const heal = /\+(\d+)\s*health/i.exec(str)?.[1];
      n.classList.add('item', kind);
      const thumb = el('div', 'ps-thumb'); thumb.style.setProperty('--h', String(hashHue(item)));
      if (opts.thumb) { const im = el('img'); im.src = opts.thumb; im.alt = ''; thumb.appendChild(im); }
      else thumb.textContent = item.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
      const body = el('div', 'ps-item-body');
      const lab = el('small'); lab.textContent = kind === 'purchase' ? 'PURCHASED' : verb === 'robbed' ? 'ROBBED' : 'STOLEN';
      const nm = el('b'); nm.textContent = item;
      body.append(lab, nm);
      if (heal) { const hl = el('em', 'ps-item-heal'); hl.textContent = '+' + heal + ' HEALTH'; body.appendChild(hl); }
      n.append(thumb, body);
      if (price !== '' && price != null) { const pr = el('span', 'ps-item-price'); pr.textContent = (kind === 'purchase' ? '−' : '+') + fmtMoney(num(+price)); n.appendChild(pr); }
    } else if (kind === 'crime') {
      n.classList.add('crime');
      const lab = el('small'); lab.textContent = 'CRIME REPORTED';
      const b = el('b'); b.textContent = str.replace(/^Crime reported:?\s*/i, '');
      n.append(lab, b);
      if (opts.severity) { const sv = el('span', 'ps-sev'); sv.textContent = '★'.repeat(clamp(Math.round(num(opts.severity, 1)), 1, 5)); n.appendChild(sv); }
    } else if (m) { const b = el('b', 'ps-notif-from'); b.textContent = m[1]; const sp = el('span'); sp.textContent = m[2]; n.append(b, sp); n.classList.add('msg'); }
    else n.textContent = str;
    notifs.prepend(n);
    while (notifs.children.length > 4) notifs.lastChild.remove();
    requestAnimationFrame(() => n.classList.add('in'));
    setTimeout(() => { n.classList.remove('in'); n.classList.add('out'); setTimeout(() => n.remove(), 450); }, Math.max(800, num(ms, 3500)));
  }
  function help(text) {
    if (text === helpText) return;
    helpText = text || null;
    if (helpText) { helpEl.innerHTML = formatKeys(helpText); helpEl.classList.add('on'); }
    else helpEl.classList.remove('on');
  }
  function formatKeys(t) {
    const esc = String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    return esc.replace(/&lt;(b|kbd)&gt;(.{1,14}?)&lt;\/\1&gt;|\[([^\]]{1,12})\]/g, (m, t, a, b) => `<kbd>${a || b}</kbd>`);
  }
  function setMission(text) {
    if (!text) { missionEl.classList.remove('on'); return; }
    missionEl.textContent = String(text);
    missionEl.classList.remove('on'); void missionEl.offsetWidth; missionEl.classList.add('on');
  }
  function showArea(name, street) {
    areaSmall.textContent = 'PORT SOLANA';
    areaName.textContent = name;
    areaStreet.textContent = street || '';
    areaEl.style.setProperty('--dc', distColor(name));
    streetEl.classList.remove('on'); streetTimer = 0;
    areaEl.classList.remove('on'); void areaEl.offsetWidth; areaEl.classList.add('on');
    areaTimer = 4.2;
  }

  // ---------- per-frame ----------
  function update(dt) {
    dt = num(dt, num(game.clock?.dt, 1 / 60)); dt = clamp(dt, 0, 0.1);
    const pl = game.player || {};
    if (!bake && !mapR.ok() && performance.now() - bakeTried > 1000) { bakeTried = performance.now(); bake = tryBake(); }
    updateRoute(dt);
    const st = pl.state || {};
    const inVeh = !!(st.inVehicle && st.vehicle);
    const kmh = inVeh ? Math.abs(num(st.vehicle.speedKmh)) : num(st.speed) * 3.6;

    if (!ui.paused) stats.time += dt;
    if (pl.position) {
      if (stats.last) { const d = Math.hypot(pl.position.x - stats.last.x, pl.position.z - stats.last.z); if (d < 20) { stats.dist += d; if (inVeh) stats.driveDist += d; } }
      stats.last = { x: pl.position.x, z: pl.position.z };
    }
    stats.topSpeed = Math.max(stats.topSpeed, kmh);
    if (inVeh && !stats.wasIn) stats.vehiclesEntered++;
    stats.wasIn = inVeh;

    drawMinimap(dt, kmh);

    // health / armor
    const hp = clamp(num(pl.health, 100), 0, 100), ar = clamp(num(pl.armor, 0), 0, 100);
    if (hp !== lastHp) {
      if (hp < lastHp - 0.5 && lastHp <= 100) { mm.classList.remove('hit'); void mm.offsetWidth; mm.classList.add('hit'); }
      lastHp = hp; setBar(hpBar, hp); hpBar.classList.toggle('low', hp < 30);
    }
    if (ar !== lastAr) { lastAr = ar; setBar(arBar, ar); arBar.classList.toggle('empty', ar <= 0); }

    // clock / money
    const clk = fmtClock(game.timeOfDay);
    if (clockTxt.textContent !== clk) {
      clockTxt.textContent = clk;
      const tod = num(game.timeOfDay, 18), night = tod < 6 || tod >= 19.5;
      todEl.className = 'ps-tod ' + (night ? 'moon' : tod >= 17 || tod < 7.5 ? 'dusk' : 'sun'); phTime.textContent = clk; phBig.textContent = clk; }
    const money = num(pl.money);
    if (money !== moneyTarget) {
      const diff = money - moneyTarget; moneyTarget = money;
      const fly = el('div', 'ps-money-fly ' + (diff > 0 ? 'up' : 'down'));
      fly.textContent = (diff > 0 ? '+' : '−') + fmtMoney(Math.abs(diff));
      moneyWrap.appendChild(fly); setTimeout(() => fly.remove(), 1700);
      moneyEl.classList.remove('pop'); void moneyEl.offsetWidth; moneyEl.classList.add('pop');
      deltaTimer = 2.4;
    }
    if (moneyShown !== moneyTarget) {
      const d = moneyTarget - moneyShown;
      moneyShown = Math.abs(d) < 1 ? moneyTarget : moneyShown + d * Math.min(1, dt * 5) + Math.sign(d) * 0.5;
      moneyEl.textContent = fmtMoney(moneyShown);
      moneyEl.classList.add('ticking');
    } else moneyEl.classList.remove('ticking');
    if (deltaTimer > 0) { deltaTimer -= dt; if (deltaTimer <= 0) moneyDelta.classList.remove('show'); }

    // wanted
    const w = clamp(Math.round(num(game.wanted?.level, num(pl.wanted))), 0, 6);
    const evading = w > 0 && !!game.wanted?.evading;
    if (evading !== status.classList.contains('evading')) { status.classList.toggle('evading', evading); mm.classList.toggle('evading', evading); }
    if (w !== lastWanted) {
      starEls.forEach((s, i) => s.classList.toggle('on', i < w));
      status.classList.toggle('wanted', w > 0);
      mm.classList.toggle('wanted', w > 0);
      if (w > lastWanted) { starsEl.classList.remove('bump'); void starsEl.offsetWidth; starsEl.classList.add('bump'); }
      lastWanted = w;
    }
    const wpn = typeof pl.weapon === 'string' && pl.weapon ? pl.weapon : 'fist';
    if (wpn !== lastWeapon) {
      lastWeapon = wpn; weaponIco.innerHTML = weaponIcon(wpn); weaponEl.dataset.weapon = wpn;
      weaponEl.dataset.cls = wDefs().defs[wpn]?.cls || '';
      weaponEl.classList.remove('swap'); void weaponEl.offsetWidth; weaponEl.classList.add('swap');
    }
    const reloading = !!game.weapons?.reloading;
    const ai = ammoInfo(wpn);
    const akey = reloading ? 'R' : !ai ? '' : ai.throw || ai.clip == null ? 'T' + ai.total : ai.clip + '/' + ai.reserve;
    if (akey !== lastAmmo) {
      lastAmmo = akey;
      if (!ai) ammoEl.innerHTML = '';
      else if (reloading) ammoEl.innerHTML = '<b>RELOAD</b>';
      else if (ai.throw || ai.clip == null) ammoEl.innerHTML = `<b>${ai.throw ? '×' : ''}${ai.total}</b>`;
      else ammoEl.innerHTML = `<b>${ai.clip}</b><span>${ai.reserve}</span>`;
      weaponEl.classList.toggle('has-ammo', !!ai);
      weaponEl.classList.toggle('reloading', reloading);
      weaponEl.classList.toggle('empty', !!ai && !reloading && (ai.clip != null ? ai.clip === 0 : ai.total === 0));
      weaponEl.classList.toggle('low', !!ai && !reloading && ai.clip != null && ai.clip > 0 && ai.clip <= Math.max(1, Math.ceil(num(wDefs().defs[wpn]?.clip, 10) * 0.25)));
    }
    // crosshair
    const aiming = !!(pl.aiming || st.aiming) && !inVeh && !ui.paused && !ui.scoped;
    root.classList.toggle('aiming', aiming);
    if (aiming) {
      const tgt = 3 + Math.min(14, num(st.speed) * 2.2) + (st.grounded === false ? 8 : 0);
      spread += (tgt - spread) * Math.min(1, dt * 9);
      xhair.style.setProperty('--sp', spread.toFixed(1) + 'px');
    }

    // speedometer
    root.classList.toggle('driving', inVeh);
    if (inVeh) {
      const frac = clamp(kmh / 240, 0, 1);
      const rk = Math.round(kmh);
      if (rk !== lastKmh) { lastKmh = rk; spdArc.setAttribute('stroke-dasharray', `${(ARC_LEN * frac).toFixed(1)} 999`); spdNum.textContent = rk;
        const ta = (135 + frac * 270) * Math.PI / 180;
        spdTip.setAttribute('cx', (90 + Math.cos(ta) * ARC_R).toFixed(1)); spdTip.setAttribute('cy', (90 + Math.sin(ta) * ARC_R).toFixed(1)); }
      const nm = String(st.vehicle.name || st.vehicle.spec?.label || 'Vehicle').replace(/\s*#\d+$/, '').toUpperCase();
      if (spdName.textContent !== nm) spdName.textContent = nm;
      const fwd = num(st.vehicle.speedKmh);
      spdGear.textContent = kmh < 1 ? 'N' : fwd < -0.5 ? 'R' : String(Math.min(6, 1 + Math.floor(kmh / 38)));
      speedo.classList.toggle('redline', kmh > 190);
    }

    // district toast
    if (pl.position) {
      streetCheck -= dt;
      if (streetCheck <= 0) {
        streetCheck = 0.3;
        const dname = distName(pl.position.x, pl.position.z);
        const sn = streetName(pl.position.x, pl.position.z);
        if (sn === candStreet) candN++; else { candStreet = sn; candN = 1; }
        const zoneTxt = (curStreet || dname);
        if (mmZone.textContent !== zoneTxt) { mmZone.textContent = zoneTxt; }
        mmZone.style.color = distColor(dname);
        if (dname !== lastDistrict) {
          if (!ui.title) showArea(dname, sn); lastDistrict = ui.title ? null : dname;
          curStreet = sn; candN = 0;
        } else if (candN >= 3 && sn !== curStreet) {
          curStreet = sn;
          if (sn && !ui.title) {
            if (areaEl.classList.contains('on')) areaStreet.textContent = sn;
            else { streetTxt.textContent = sn; streetEl.classList.remove('on'); void streetEl.offsetWidth; streetEl.classList.add('on'); streetTimer = 3; }
          }
        }
      }
    }
    if (areaTimer > 0) { areaTimer -= dt; if (areaTimer <= 0) areaEl.classList.remove('on'); }
    if (streetTimer > 0) { streetTimer -= dt; if (streetTimer <= 0) streetEl.classList.remove('on'); }

    // death
    const dead = !!ui.dead || (pl.health != null && num(pl.health, 100) <= 0);
    if (dead !== deadShown) {
      deadShown = dead; deathEl.classList.toggle('on', dead); root.classList.toggle('is-dead', dead);
      if (dead) { stats.deaths++; if (ui.phoneOpen) setPhone(false); closeWheel(false); }
    }
    // arrest
    if (ui.arrested && !arrestEl.classList.contains('on')) showArrest(typeof ui.arrested === 'object' ? ui.arrested.fee : ui.arrestFee);
    if (arrestTimer > 0) { arrestTimer -= dt; if (arrestTimer <= 0 && !ui.arrested) arrestEl.classList.remove('on'); }
    root.classList.toggle('flash-low', hp > 0 && hp < 25);

    // live phone map
    if (ui.phoneOpen && phoneAppOpen >= 0 && APPS[phoneAppOpen].id === 'map') {
      const c = phAppBody.querySelector('canvas'); if (c) drawPhoneMap(c);
    }
  }

  // initial
  refreshPhoneSel();
  moneyEl.textContent = fmtMoney(moneyShown);
  if (document.pointerLockElement) hideTitle();
  const api = { update, notify, help, setMission, districtAt, setPaused, setPhone, showArrest, crimeToast, openWeaponWheel: openWheel, closeWeaponWheel: closeWheel,
    _mapZoom(ppm, cx, cz) { const pp = game.player?.position; if (cx != null) { mapView.cx = cx; mapView.cz = cz; } else if (pp) { mapView.cx = pp.x; mapView.cz = pp.z; } mapView.ppm = ppm; drawBigMap(); },
    _mapPan(dx, dz) { mapView.cx += dx; mapView.cz += dz; clampView(); drawBigMap(); return [mapView.cx, mapView.cz]; },
    _mapFit() { fitMap(); return mapView.ppm; } };
  return api;
}

// ---------- helpers ----------
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// original POI glyphs, drawn in a 0..1 box centred on 0
const POIS = [
  { x: -205, z: 205, c: '#ff5d6c', glyph: 'plus', name: 'Solana General' },
  { x: 10, z: -45, c: '#3fcf8e', glyph: 'dollar', name: 'First Calora Bank' },
  { x: 205, z: 255, c: '#ffb35a', glyph: 'wrench', name: "Tiny's Garage" },
  { x: -95, z: -250, c: '#c58cff', glyph: 'shirt', name: 'Threads' },
  { x: 300, z: -105, c: '#ff8fc8', glyph: 'cup', name: 'Neon Diner' },
  { x: -350, z: 45, c: '#6fb6ff', glyph: 'drop', name: 'Solana Gas' },
  { x: 470, z: -200, c: '#2fe0d0', glyph: 'wave', name: 'Pier 7' },
];
function drawGlyph(g, kind) {
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  switch (kind) {
    case 'plus': g.fillRect(-1.3, -4.2, 2.6, 8.4); g.fillRect(-4.2, -1.3, 8.4, 2.6); return;
    case 'dollar': g.font = '800 10px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 0.5); return;
    case 'wrench': g.moveTo(-3.5, 3.5); g.lineTo(1.2, -1.2); g.stroke(); g.beginPath(); g.arc(2.2, -2.2, 2.2, Math.PI * 0.9, Math.PI * 2.6); g.stroke(); return;
    case 'shirt': g.moveTo(-1.6, -3.6); g.lineTo(-4.4, -2); g.lineTo(-3.4, 0); g.lineTo(-2.4, -0.6); g.lineTo(-2.4, 3.8); g.lineTo(2.4, 3.8); g.lineTo(2.4, -0.6); g.lineTo(3.4, 0); g.lineTo(4.4, -2); g.lineTo(1.6, -3.6); g.quadraticCurveTo(0, -2, -1.6, -3.6); g.fill(); return;
    case 'cup': g.moveTo(-3.4, -2); g.lineTo(2.4, -2); g.lineTo(1.8, 3.4); g.lineTo(-2.8, 3.4); g.closePath(); g.fill(); g.beginPath(); g.arc(2.6, 0.2, 1.5, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.moveTo(-1.5, -3.2); g.lineTo(-1, -4.6); g.moveTo(0.6, -3.2); g.lineTo(1.1, -4.6); g.lineWidth = 1; g.stroke(); return;
    case 'drop': g.moveTo(0, -4.4); g.bezierCurveTo(3.5, -0.5, 3.5, 3.8, 0, 3.8); g.bezierCurveTo(-3.5, 3.8, -3.5, -0.5, 0, -4.4); g.fill(); return;
    case 'target': g.arc(0, 0, 3.4, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 5); g.moveTo(-5, 0); g.lineTo(5, 0); g.lineWidth = 1.2; g.stroke(); return;
    case 'bag': g.moveTo(-3.6, -1.6); g.lineTo(3.6, -1.6); g.lineTo(3, 4); g.lineTo(-3, 4); g.closePath(); g.fill(); g.beginPath(); g.arc(0, -1.8, 2, Math.PI, 0); g.lineWidth = 1.3; g.stroke(); return;
    case 'bolt': g.moveTo(1, -4.8); g.lineTo(-3.2, 0.8); g.lineTo(-0.2, 0.8); g.lineTo(-1.2, 4.8); g.lineTo(3.2, -0.8); g.lineTo(0.2, -0.8); g.closePath(); g.fill(); return;
    case 'sparkle': g.moveTo(0, -4.8); g.quadraticCurveTo(0.6, -0.6, 4.8, 0); g.quadraticCurveTo(0.6, 0.6, 0, 4.8); g.quadraticCurveTo(-0.6, 0.6, -4.8, 0); g.quadraticCurveTo(-0.6, -0.6, 0, -4.8); g.fill(); return;
    case 'wave': g.moveTo(-4.2, 1); g.quadraticCurveTo(-2.1, -2.2, 0, 1); g.quadraticCurveTo(2.1, 4.2, 4.2, 1); g.stroke(); return;
  }
}
const PICK_STYLE = { weapon: ['#ff6b5a', 'gun'], ammo: ['#ffb35a', 'ammo'], health: ['#3fcf6e', 'plus'], armor: ['#4d8bff', 'shield'], cash: ['#2fbf6f', 'dollar'] };
function drawPickup(g, x, y, kind, s = 1) {
  const st = PICK_STYLE[kind] || ['#d8dee8', 'dot'];
  g.save(); g.translate(x, y); g.scale(s, s);
  const big = kind === 'weapon';
  if (big) { const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260); g.fillStyle = `rgba(255,107,90,${0.18 + pulse * 0.22})`; g.beginPath(); g.arc(0, 0, 9 + pulse * 2.5, 0, TAU); g.fill(); }
  const r = big ? 6 : 4.4;
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3;
  g.fillStyle = st[0]; roundRect(g, -r, -r, r * 2, r * 2, big ? 2.5 : 1.8); g.fill();
  g.shadowColor = 'transparent'; g.strokeStyle = '#fff'; g.lineWidth = big ? 1.3 : 1; g.stroke();
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  const q = r / 6;
  g.beginPath();
  switch (st[1]) {
    case 'gun': g.fillRect(-4.2 * q, -2.2 * q, 8.4 * q, 2.4 * q); g.fillRect(-3.6 * q, 0, 2.4 * q, 3.6 * q); break;
    case 'ammo': for (let i = -1; i <= 1; i++) { g.fillRect(i * 2.4 * q - 0.8 * q, -2 * q, 1.6 * q, 4.5 * q); g.beginPath(); g.arc(i * 2.4 * q, -2 * q, 0.8 * q, Math.PI, 0); g.fill(); } break;
    case 'plus': g.fillRect(-0.9 * q * 1.6, -3.2 * q * 1.2, 1.8 * q * 1.6, 6.4 * q * 1.2); g.fillRect(-3.8 * q, -1.4 * q, 7.6 * q, 2.8 * q); break;
    case 'shield': g.moveTo(0, -3.8 * q); g.lineTo(3.4 * q, -2.4 * q); g.lineTo(3 * q, 1 * q); g.quadraticCurveTo(2 * q, 3.4 * q, 0, 4.2 * q); g.quadraticCurveTo(-2 * q, 3.4 * q, -3 * q, 1 * q); g.lineTo(-3.4 * q, -2.4 * q); g.closePath(); g.fill(); break;
    case 'dollar': g.font = `800 ${Math.round(9 * q * 1.2)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 0.5); break;
    default: g.arc(0, 0, 1.6, 0, TAU); g.fill();
  }
  g.restore();
}
function hashHue(t) { let h = 0; for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
function drawPOI(g, x, y, poi, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 4; g.shadowOffsetY = 1;
  if (poi.closed) g.globalAlpha = 0.42;
  g.fillStyle = poi.closed ? '#5b6475' : poi.c; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2; g.stroke();
  drawGlyph(g, poi.glyph);
  g.restore();
}
if (typeof document !== 'undefined') { try { injectFonts(); } catch (e) { /* ignore */ } }
function injectFonts() {
  if (document.getElementById('ps-fonts')) return;
  const pre = document.createElement('link'); pre.rel = 'preconnect'; pre.href = 'https://fonts.gstatic.com'; pre.crossOrigin = '';
  const l = document.createElement('link'); l.id = 'ps-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;0,900;1,700;1,800;1,900&family=Inter:wght@400;500;600;700&display=swap';
  document.head.append(pre, l);
}
function loadSettings(game) {
  const s = game.settings || {};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('portsolana.settings') || '{}') || {}; } catch (e) { /* ignore */ }
  s.mouseSens = num(saved.mouseSens, num(s.mouseSens, 1));
  s.fov = num(saved.fov, num(s.fov, num(game.camera?.fov, 65)));
  s.northUp = !!saved.northUp;
  s.quality = saved.quality === 'medium' || saved.quality === 'high' ? saved.quality : (s.quality || 'high');
  game.settings = s;
  return s;
}
