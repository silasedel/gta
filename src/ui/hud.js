// SOUTHLINE — HUD (original design). Owns: minimap, status cluster, speedometer,
// help/notifications/mission, district toast, phone, pause menu, title + death screens.
import { VERSION } from '../version.js';
import { BRAND } from './brand.js';
import './styles/fonts.css';
import './hud.css';
import { createCorner } from './hud/corner.js';
import { createMapRenderer, MAP_COLORS, setMapPalette } from './mapRender.js';
import { createGPS } from './gps.js';
import { createPhone } from './phone/phone.js';
import { mountPauseSettings, mountPauseControls } from './menu/pauseSettings.js';

const TAU = Math.PI * 2;
const MAP_X0 = -580, MAP_X1 = 760, MAP_Z0 = -580, MAP_Z1 = 580; // baked world rect (m)
const BAKE_PPM = 2;                                             // baked pixels per meter

const DISTRICTS = {
  'Coral Beach': '#ff5fa8', 'Downtown': '#ffffff', 'Palmetto Heights': '#9be37a',
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
  if (/surf|beach|board/.test(t)) return ['wave', '#ff5fa8'];
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

export function createHUD(game) {
  // fonts: bundled (src/ui/styles/fonts.css)
  const ui = (game.ui = game.ui || {});
  ui.phoneOpen = false; ui.paused = false; ui.title = true;
  const settings = loadSettings(game);

  const mapR = createMapRenderer(game), gps = createGPS(game);
  // V2 world layout (bounds, palette, place names, set pieces) read from data, never hard-coded
  let worldLayout = null;
  try {
    fetch(new URL('assets/world/layout.json', document.baseURI))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.bounds) return;
        worldLayout = j;
        game.worldLayout = game.worldLayout || j;
        setMapPalette(j.palette);
        mapR.invalidate();
      })
      .catch(() => {});
  } catch (e) { /* no layout: v1 behavior */ }
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
  mm.append(mmFrame, mmInfo);
  root.appendChild(mm);
  // user (Nov 18, docs/v2/plan/hud_health_target.png): health lives top-left as a heart badge + one pink bar (armor a thin
  // blue line under it only while you have armor); the minimap is just the frosted map (docs/v2/plan/hud_minimap_target.png)
  const vitals = el('div', 'ps-vitals', '<span class="ps-heart"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="#f0a6c6" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.2 1.8-2 3.2-3.2 5.4-3.2 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg></span>');
  vitals.appendChild(bars);
  root.appendChild(vitals);
  // vehicle card above the minimap while in any vehicle (user reference docs/v2/plan/hud_vehicle_target.png): brand, model,
  // an engine badge (green / amber / red by vehicle health) and a fuel ring (no fuel system yet: shown full)
  const vehCard = el('div', 'ps-vehcard', '<div class="ps-vc-brand"></div><div class="ps-vc-model"></div><div class="ps-vc-icons">'
    + '<span class="ps-vc-eng"><svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M7 8h3V6h4v2h2l2 2h2v6h-2l-2 2H8l-2-2H4v-5h2l1-1zm-1 4v3h1.5l2 2h6l2-2H19v-3h-1.5l-2-2H8.5z"/></svg></span>'
    + '<span class="ps-vc-fuel"><svg viewBox="0 0 34 34" width="34" height="34"><circle class="ps-vc-ring" cx="17" cy="17" r="14.5" fill="none" stroke-width="2.4" stroke-dasharray="91.1 91.1" transform="rotate(-90 17 17)"/></svg><svg class="ps-vc-pump" viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M5 3h9v8h1.5a1.5 1.5 0 0 1 1.5 1.5V17a1 1 0 0 0 2 0V9.4L16.3 7l1.4-1.4L21 8.9V17a3 3 0 0 1-6 0v-4h-1v8H5zm2 2v4h5V5z"/></svg></span></div>');
  const vcBrand = vehCard.querySelector('.ps-vc-brand'), vcModel = vehCard.querySelector('.ps-vc-model'), vcEng = vehCard.querySelector('.ps-vc-eng');
  root.appendChild(vehCard);
  const MW = 260, MH = 170;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mmCanvas.width = MW * dpr; mmCanvas.height = MH * dpr;
  const mctx = mmCanvas.getContext('2d');

  // ---------- Status cluster (top-right) ----------
  // V2 corner (src/ui/hud/corner.js, matches docs/v2/plan/hud_corner_target.webp): six stars, five evidence badges,
  // ammo, weapon art, cash / bank and the clock
  let lastClock = '';
  const corner = createCorner(game);
  const status = corner.root;
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
      <defs><linearGradient id="psSpdGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff5fa8"/><stop offset=".65" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff6b5a"/></linearGradient></defs>
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
  const deathEl = el('div', 'ps-death', `<div class="ps-death-flash"></div><div class="ps-death-bar top"></div><div class="ps-death-bar bot"></div><div class="ps-death-card"><div class="ps-death-rule"></div><h1>LIGHTS OUT</h1><p><span>RESPAWNING</span> Southline General Hospital</p></div>`);
  root.appendChild(deathEl);
  const arrestEl = el('div', 'ps-arrest', `<div class="ps-arrest-bars"></div><h1>DETAINED</h1><p class="ps-arrest-fee"></p><small>Released from ${BRAND.name} Central Holding</small>`);
  root.appendChild(arrestEl);
  const arrestFee = arrestEl.querySelector('.ps-arrest-fee');
  let arrestTimer = 0;
  const xhair = el('div', 'ps-xhair', '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b>');
  root.appendChild(xhair);
  const hitm = el('div', 'ps-hitm', '<i></i><i></i><i></i><i></i>');
  root.appendChild(hitm);
  let spread = 0, lastShotAt = -1e9, lastPunchAt = -1e9;
  const wheel = el('div', 'ps-wheel');
  wheel.innerHTML = `<div class="ps-wheel-ring"><div class="ps-wheel-hl"></div><div class="ps-wslots"></div><div class="ps-wheel-center"><b></b><small></small><em></em></div></div>`;
  root.appendChild(wheel);
  const wSlotsHost = wheel.querySelector('.ps-wslots'), wHl = wheel.querySelector('.ps-wheel-hl');
  const wName = wheel.querySelector('.ps-wheel-center b'), wInfo = wheel.querySelector('.ps-wheel-center small'), wSlotNo = wheel.querySelector('.ps-wheel-center em');
  let wslots = [], wheelGroups = [], wheelPick = [];
  let wheelSel = 0, wheelVec = { x: 0, y: 0 };
  const photoHint = el('div', 'ps-photo-hint', 'PHOTO MODE');
  root.appendChild(photoHint);

  // ---------- Phone (src/ui/phone: Kestrel OS) ----------
  // P / Arrow Up / pad Up toggle it. While it is up the bindings layer runs in 'phone' mode (arrows, Enter, Backspace,
  // Esc and digits drive the phone; WASD still walks) and the mouse cursor is freed (phone setting) so apps can be
  // clicked and scrolled. Releasing the pointer lock for the phone does not pause the game.
  let phoneLeaveMode = null, phoneFreedLock = false, phoneHadLock = false;
  const phone = createPhone(game, {
    root,
    drawMap: (c, o) => drawPhoneMap(c, o),
    openPauseMap: () => { setPaused(true, false); setTab(T_MAP); },
    setPhoto: (on) => setPhoto(!!on),
    onOpenChange: (o) => {
      ui.phoneOpen = o;
      root.classList.toggle('phone', o);
      const B = game.bindings;
      if (o) {
        closeWheel(false);
        if (B?.pushMode && !phoneLeaveMode) {
          phoneLeaveMode = B.pushMode('phone');
          const offNav = B.on?.('nav', (d) => { if (ui.phoneOpen && B.mode === 'phone') phone.nav(d.dir, d); });
          const offDigit = B.on?.('digit', (n) => { if (ui.phoneOpen && B.mode === 'phone') phone.digit(n); });
          const leave = phoneLeaveMode;
          phoneLeaveMode = () => { leave(); try { offNav?.(); offDigit?.(); } catch (e) { /* */ } };
        }
        phoneHadLock = !!document.pointerLockElement;
        if (phone.prefs.freeCursor && document.pointerLockElement) { phoneFreedLock = true; document.exitPointerLock?.(); }
      } else {
        if (phoneLeaveMode) { phoneLeaveMode(); phoneLeaveMode = null; }
        if (phoneHadLock && !ui.paused && !ui.photo && !document.pointerLockElement) requestLock();
        phoneHadLock = false;
      }
    },
  });

  // ---------- Pause menu ----------
  // Tabs (user, Nov 19): Map, Wardrobe, Settings, Controls, Stats. Settings is the one settings menu (src/ui/menu/
  // pauseSettings.js, the old "All settings" screen merged in, Codes at its bottom); Wardrobe opens the wardrobe stage.
  // Navigation: mouse; keyboard (Q / E tabs, arrows or WASD + Enter on the Settings / Controls pages, map keys on the
  // map, Esc resumes); controller (the bindings run in 'pause' mode: LB / RB tabs, D-pad + A, B or START resumes,
  // sticks pan / zoom the map).
  const T_MAP = 0, T_WARD = 1, T_SET = 2, T_CTL = 3, T_STATS = 4;
  const TAB_NAMES = ['MAP', 'WARDROBE', 'SETTINGS', 'CONTROLS', 'STATS'];
  const pause = el('div', 'ps-pause');
  pause.innerHTML = `
    <div class="ps-pause-top">
      <div class="ps-pause-brand"><span class="ps-pb-sol">${BRAND.name.toUpperCase()}</span></div>
      <div class="ps-tabs">${TAB_NAMES.map((t, i) => `<button class="ps-tab${i ? '' : ' on'}" data-tab="${i}" data-nav>${t}</button>`).join('')}</div>
      <div class="ps-pause-meta"><span class="ps-pm-clock">18:00</span><span class="ps-pm-money">$0</span></div>
    </div>
    <div class="ps-pages">
      <div class="ps-page ps-page-map on"><canvas class="ps-bigmap"></canvas><div class="ps-map-frame"></div><div class="ps-map-zoom"><button data-z="in" title="Zoom in (+)">+</button><button data-z="out" title="Zoom out (−)">−</button><button data-z="fit" title="Whole map (F)">⤢</button><button data-z="me" title="Centre on me (C)">◎</button></div>
        <div class="ps-map-layers"><button class="ps-map-layer" data-layer="subway" title="Subway lines (U)"><i class="ps-ml-ico"></i><span>SUBWAY</span><kbd>U</kbd></button></div>
        <div class="ps-map-loc"></div></div>
      <div class="ps-page ps-page-ward is-inert"><div class="ps-ward-card"><small>WARDROBE</small><h2>Dress Nico</h2><p class="ps-ward-now"></p><button class="ps-ward-open" data-nav>OPEN WARDROBE</button></div></div>
      <div class="ps-page ps-page-settings is-inert"><div class="ps-settings"></div></div>
      <div class="ps-page ps-page-controls is-inert"><div class="ps-controls"></div></div>
      <div class="ps-page ps-page-stats is-inert"><div class="ps-stats-grid"></div></div>
    </div>
    <div class="ps-pause-foot"><button class="ps-resume" data-nav data-nav-key="start">RESUME</button><span class="ps-pause-hint"><b>Q</b><b>E</b> tabs</span><span class="ps-foot-tag">v${VERSION} · ${BRAND.name.toUpperCase()}</span></div>`;
  root.appendChild(pause);
  const tabs = [...pause.querySelectorAll('.ps-tab')], pages = [...pause.querySelectorAll('.ps-page')];
  const bigmap = pause.querySelector('.ps-bigmap'), bctx = bigmap.getContext('2d');
  const mapLoc = pause.querySelector('.ps-map-loc');
  pause.querySelectorAll('.ps-map-zoom button').forEach((b) => b.addEventListener('click', () => {
    const r = bigmap.getBoundingClientRect(), z = b.dataset.z;
    if (z === 'in') zoomAt(r.width / 2, r.height / 2, 1.6); else if (z === 'out') zoomAt(r.width / 2, r.height / 2, 1 / 1.6); else if (z === 'fit') fitMap(); else centreOnPlayer();
  }));
  const subwayBtn = pause.querySelector('.ps-map-layer[data-layer="subway"]');
  const subwayOn = () => game.settings?.mapSubway !== false;
  function setSubway(on) {
    const S = game.uiSettings;
    if (S?.set) S.set('mapSubway', !!on); else { game.settings.mapSubway = !!on; saveSettings(); }
    paintSubwayBtn(); drawBigMap();
  }
  function paintSubwayBtn() { subwayBtn.classList.toggle('on', subwayOn()); }
  subwayBtn.addEventListener('click', () => setSubway(!subwayOn()));
  const statsGrid = pause.querySelector('.ps-stats-grid');
  const pmClock = pause.querySelector('.ps-pm-clock'), pmMoney = pause.querySelector('.ps-pm-money');
  const wardNow = pause.querySelector('.ps-ward-now');
  let curTab = 0;
  tabs.forEach((t, i) => t.addEventListener('click', () => { setTab(i); if (i === T_WARD) openWardrobe(); }));
  pause.querySelector('.ps-resume').addEventListener('click', () => setPaused(false, true));
  pause.querySelector('.ps-ward-open').addEventListener('click', () => openWardrobe());
  function openWardrobe() {
    const fe = game.frontEnd;
    if (!fe?.openWardrobe) { notify('The wardrobe is not available right now', 1800); return; }
    try { fe.openWardrobe({ from: 'pause', onClose: () => { if (ui.paused) setTab(T_WARD); } }); } catch (e) { console.warn('[hud] wardrobe', e); }
  }
  function paintWardrobe() {
    let name = '';
    try { const w = game.wardrobe; const n = w?.currentOutfit?.name || w?.outfitName; name = typeof n === 'string' ? n : ''; } catch (e) { /* */ }
    wardNow.textContent = name ? `Wearing: ${name}` : 'Change Nico\'s outfit. The police remember what you wore.';
  }
  // Settings / Controls pages: the settings store and bindings live in the UI context (built by the frontend after the
  // HUD), so the pages are mounted the first time the menu opens. Test pages without the context keep the short list.
  let pzMounted = false;
  function mountPausePages() {
    if (pzMounted) return;
    const ctx = game.uiContext;
    if (!ctx?.settings) { if (!pause.querySelector('.ps-set-row')) { buildSettings(pause.querySelector('.ps-settings')); buildControls(pause.querySelector('.ps-controls')); } return; }
    pzMounted = true;
    const hs = pause.querySelector('.ps-settings'), hc = pause.querySelector('.ps-controls');
    hs.innerHTML = ''; hc.innerHTML = '';
    hs.classList.add('pz'); hc.classList.add('pz');
    try { mountPauseSettings(game, ctx, hs); mountPauseControls(game, ctx, hc); } catch (e) { console.error('[hud] pause settings', e); }
  }
  // focus scope for the keyboard and the controller while paused
  let pauseNav = null, leavePauseMode = null, offPadAxes = null;
  pause.addEventListener('pz:refocus', (e) => { if (!pauseNav) return; const d = e.detail || {}; const t = d.el || (d.sel && pause.querySelector(d.sel)); if (t) pauseNav.focus(t, d.how || 'auto'); });
  function pauseNavOn() {
    const ctx = game.uiContext; if (!ctx?.nav || pauseNav) return;
    const B = ctx.bindings;
    try { leavePauseMode = B?.pushMode?.('pause') || null; } catch (e) { leavePauseMode = null; }
    pauseNav = ctx.nav.push({
      root: pause, wrap: true,
      initial: '.ps-tab.on',
      onBack: () => setPaused(false, true),
      onTab: (d) => setTab((curTab + d + tabs.length) % tabs.length, true),
      onAction: (name) => { if (name === 'select') setTab(T_MAP, true); },
      onNav: (d) => {
        // controller on the map page: the D-pad pans (the sticks are read below); triggers zoom
        if (curTab === T_MAP && d.src === 'pad') {
          const r = bigmap.getBoundingClientRect(), st = 160 / mapView.ppm;
          if (d.dir === 'up') { mapView.cz -= st; clampView(); drawBigMap(); return true; }
          if (d.dir === 'down') { mapView.cz += st; clampView(); drawBigMap(); return true; }
          if (d.dir === 'left') { mapView.cx -= st; clampView(); drawBigMap(); return true; }
          if (d.dir === 'right') { mapView.cx += st; clampView(); drawBigMap(); return true; }
          if (d.dir === 'pageUp') { zoomAt(r.width / 2, r.height / 2, 1 / 1.5); return true; }
          if (d.dir === 'pageDown') { zoomAt(r.width / 2, r.height / 2, 1.5); return true; }
          if (d.dir === 'alt1') { fitMap(); return true; }
          if (d.dir === 'alt2') { setSubway(!subwayOn()); return true; }
          if (d.dir === 'accept' && pauseNav?.current?.classList.contains('ps-tab') !== true) { centreOnPlayer(); return true; }
        }
        return false;
      },
    });
    offPadAxes = B?.on?.('padaxes', (a) => {
      if (a.mode !== 'pause' || !ui.paused || curTab !== T_MAP || !pauseNav?.isTop()) return;
      const sp = 900 / mapView.ppm * a.dt;
      if (a.lx || a.ly) { mapView.cx += a.lx * sp; mapView.cz += a.ly * sp; clampView(); drawBigMap(); }
      if (Math.abs(a.ry) > 0.25) { const r = bigmap.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, Math.exp(-a.ry * a.dt * 2.2)); }
    }) || null;
  }
  function pauseNavOff() {
    try { pauseNav?.pop(); } catch (e) { /* */ }
    try { leavePauseMode?.(); offPadAxes?.(); } catch (e) { /* */ }
    pauseNav = null; leavePauseMode = null; offPadAxes = null;
  }
  // raw keyboard while paused (the bindings leave the keyboard to the game in 'pause' mode): Q / E switch tabs, and on
  // the pages with rows the arrows / WASD / Enter move and change them through the same focus scope
  const PAUSE_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Enter: 'accept', NumpadEnter: 'accept', Space: 'accept', Tab: 'next', PageUp: 'pageUp', PageDown: 'pageDown', Home: 'home', End: 'end' };
  function pauseKey(e) {
    if (!ui.paused || !pauseNav || !pauseNav.isTop() || e.metaKey || e.ctrlKey) return false;
    const t = e.target; if (t && (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/i.test(t.type) || t.tagName === 'TEXTAREA')) return false;
    const k = e.code;
    if ((k === 'KeyQ' || k === 'KeyE') && !e.repeat) { e.preventDefault(); setTab((curTab + (k === 'KeyE' ? 1 : -1) + tabs.length) % tabs.length, true); game.uiContext?.sfx?.('tab'); return true; }
    if (curTab === T_MAP) { if (k === 'KeyU' && !e.repeat) { e.preventDefault(); setSubway(!subwayOn()); return true; } return false; }
    const dir = PAUSE_KEYS[k]; if (!dir) return false;
    if (dir === 'accept' && e.repeat) return true;
    e.preventDefault();
    game.uiContext.nav.send(dir, 'kbm', e.repeat);
    return true;
  }

  // ---------- Title ----------
  // The only title screen and main menu is the frontend (src/ui/menu/frontend.v2.js). The old "SOUTHLINE / CLICK TO
  // PLAY" card that used to live here is gone. When the frontend does not run (?nomenu, ?menu=0, automated browsers)
  // the game simply waits for Enter, Space or a click on the game view, so tests can still start it the same way.
  const frontendRuns = (() => { try { const q = new URLSearchParams(location.search), f = q.get('menu'); return f === '1' || (f !== '0' && !q.has('nomenu') && !navigator.webdriver); } catch (e) { return false; } })();
  const startGame = (e) => { if (!ui.title || frontendRuns || game.frontEnd?.active) return; try { e?.preventDefault?.(); } catch (_) {} requestLock(); hideTitle(); };
  addEventListener('keydown', (e) => { if (ui.title && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) startGame(e); });
  addEventListener('pointerdown', (e) => { if (ui.title && e.target === game.renderer?.domElement) startGame(e); });
  document.addEventListener('pointerlockerror', () => { if (!ui.title) { try { game.hud?.notify?.('Click the game view to capture the mouse', 3000); } catch (_) {} } });

  // ---------- state ----------
  let bake = null, bakeTried = -1e9;
  let mmZoom = 1.0, moneyShown = num(game.player?.money), moneyTarget = moneyShown;
  let mmAngle = 0;
  let deadShown = false;
  let lastHp = 999, lastAr = -1, lastKmh = -1;
  let lastWanted = 0, lastDistrict = null, areaTimer = 0, helpText = null;
  let mapView = { cx: 60, cz: 0, ppm: 1 }, mapXform = null, drag = null;
  ui._mapView = () => mapView; // read-only debug hook for tests
  let bigPendingTimer = 0;
  function mapBounds() {
    const b = mapR.bounds() || game.city?.bounds || { minX: MAP_X0, maxX: MAP_X1, minZ: MAP_Z0, maxZ: MAP_Z1 };
    const L = worldLayout?.bounds;
    if (!L) return b;
    return {
      minX: Math.min(b.minX, L.minX),
      maxX: Math.max(b.maxX, L.maxX),
      minZ: Math.min(b.minZ, L.minZ),
      maxZ: Math.max(b.maxZ, L.maxZ),
    };
  }
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
    if (pauseKey(e)) return;
    if (e.repeat) return;
    if (ui.title) return;
    if (k === 'Escape') {
      const now = performance.now();
      if (k === 'Escape' && now - lockLostAt < 350 && ui.paused) return; // lock-loss already opened it
      if (now - pauseToggledAt < 150) return;
      if (ui.phoneOpen && k === 'Escape') { phone.back(); return; }
      setPaused(!ui.paused, true); e.preventDefault(); return;
    }
    if (ui.paused || deadShown || ui.weaponWheel) return;
    if (ui.photo) { if (['Backspace', 'ArrowUp', 'ArrowDown', 'Enter'].includes(k)) { setPhoto(false); e.preventDefault(); } return; }
    // phone: P is its key, Arrow Up and pad Up too (bindings: canonical 'ArrowUp'). With the bindings layer in 'phone'
    // mode the physical arrows arrive as nav events instead, so an ArrowUp here while the phone is up came from P.
    if (k === 'KeyP' && !game.bindings) { phone.toggle(); e.preventDefault(); return; }
    if (!ui.phoneOpen) { if (k === 'ArrowUp') { phone.setOpen(true); e.preventDefault(); } return; }
    if (game.bindings?.mode === 'phone') { if (k === 'ArrowUp') { phone.setOpen(false); e.preventDefault(); } return; }
    // no bindings layer (test pages): drive the phone from raw keys
    const NAVK = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'accept', NumpadEnter: 'accept', Backspace: 'back' };
    if (e.target?.tagName === 'INPUT' && !['Enter', 'NumpadEnter'].includes(k)) return;
    if (NAVK[k]) { e.preventDefault(); phone.nav(NAVK[k], { code: k }); }
    else if (/^Digit\d$/.test(k)) phone.digit(k.slice(5));
  }, true);

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { hideTitle(); if (ui.paused) setPaused(false, false); if (ui.phoneOpen && phone.prefs.freeCursor) phone.setOpen(false); }
    else if (phoneFreedLock) { phoneFreedLock = false; }
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
    if (!ui.paused || curTab !== T_MAP) return;
    if (pauseNav && !pauseNav.isTop()) return;   // the wardrobe or the code panel sits on top
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
  function hideTitle() { if (!ui.title || game.frontEnd?.active) return; ui.title = false; root.classList.add('live'); }

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
      mountPausePages();
      paintSubwayBtn();
      setTab(curTab);
      pauseNavOn();
      pauseLoop();
    } else {
      pauseNavOff();
      if (relock) requestLock();
    }
  }
  function pauseLoop() {
    if (!ui.paused) return;
    pmClock.textContent = fmtClock(game.timeOfDay);
    pmMoney.textContent = fmtMoney(num(game.player?.money));
    if (curTab === T_MAP && !drag) drawBigMap();
    if (curTab === T_STATS) renderStats();
    setTimeout(() => requestAnimationFrame(pauseLoop), 250);
  }
  function setTab(i, focusPage) {
    curTab = i;
    tabs.forEach((t, j) => t.classList.toggle('on', i === j));
    pages.forEach((p, j) => { p.classList.toggle('on', i === j); p.classList.toggle('is-inert', i !== j); });
    if (i === T_MAP) requestAnimationFrame(drawBigMap);
    if (i === T_STATS) renderStats();
    if (i === T_WARD) paintWardrobe();
    if (pauseNav) {
      // keyboard / controller: land on the page's first row (Wardrobe: its button); the map keeps focus on the tab
      const first = focusPage && i !== T_MAP ? pages[i].querySelector('.pm-row[data-nav], .ps-ward-open, [data-nav]') : null;
      pauseNav.focus(first || tabs[i], 'auto');
      if (first) pages[i].querySelector('.ps-scroll')?.scrollTo?.({ top: 0 });
    }
  }

  function setPhoto(on) {
    ui.photo = on;
    if (on) { setPhone(false); photoHint.classList.remove('on'); void photoHint.offsetWidth; photoHint.classList.add('on'); }
    root.classList.toggle('photo', on);
  }
  function setPhone(o) { phone.setOpen(!!o); }

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
  let mmAcc = 0, mmDrawnOnce = false;
  const HEADINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const mmProj = { cs: 1, sn: 0, cx: 0, cy: 0, px: 0, pz: 0, k: 1 }, mmPt = [0, 0], mmReserved = [0, 0, 30];
  function mmProject(x, z) { const P = mmProj, dx = x - P.px, dz = z - P.pz; mmPt[0] = P.cx + (dx * P.cs - dz * P.sn) * P.k; mmPt[1] = P.cy + (dx * P.sn + dz * P.cs) * P.k; return mmPt; }
  // static minimap icons: rebuilt when the player moved 10 m, the zoom changed 4 %, the shop / blip lists changed, or
  // after 0.6 s (shops open and close); sorted once by priority
  const miniCache = { list: null, t: 0, x: 0, z: 0, ppm: 0, shops: null, blips: null, blipN: 0 };
  function miniStaticIcons(p, ppm) {
    const C = miniCache, now = performance.now(), S = shops(), bl = game.mapBlips;
    if (!C.list || now - C.t > 600 || Math.abs(p.x - C.x) > 10 || Math.abs(p.z - C.z) > 10 || Math.abs(ppm / C.ppm - 1) > 0.04 || C.shops !== S || C.blips !== bl || (bl?.length | 0) !== C.blipN) {
      C.list = mapIcons(p, ppm, 'mini', null, false); C.list.sort((a, b) => b.prio - a.prio);
      C.t = now; C.x = p.x; C.z = p.z; C.ppm = ppm; C.shops = S; C.blips = bl; C.blipN = bl?.length | 0;
    }
    return C.list;
  }
  function drawMinimap(dt, speedKmh) {
    const g = mctx, p = game.player?.position;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = MAP_COLORS.sea; g.fillRect(0, 0, MW, MH);
    if (!p) return;
    const bigCity = mapR.ok() && (mapBounds().maxX - mapBounds().minX) > 2500;
    const targetZoom = bigCity ? clamp(1.05 - speedKmh / 170, 0.28, 1.05) : clamp(1.0 - speedKmh / 200, 0.42, 1.0);
    mmZoom += (targetZoom - mmZoom) * (1 - Math.exp(-dt * 1.8));
    const camA = camForward();
    const thT = settings.northUp ? 0 : -Math.PI / 2 - camA;
    let dA = thT - mmAngle; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    mmAngle += dA * Math.min(1, dt * 12);
    const th = mmAngle;
    const hdg = HEADINGS[((Math.round((camA + Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8];
    if (mmHdg.textContent !== hdg) mmHdg.textContent = hdg;
    const cx = MW / 2, cy = MH * 0.6;
    g.save();
    g.translate(cx, cy); g.rotate(th); g.scale(mmZoom, mmZoom); g.translate(-p.x, -p.z);
    {
      const R = Math.hypot(MW, MH) / 2 / mmZoom + 8;
      const drawn = mapR.draw(g, p.x - R, p.z - R, p.x + R, p.z + R, mmZoom * dpr, { id: 'mini' });
      if (!drawn && bake) { g.imageSmoothingEnabled = true; g.drawImage(bake, MAP_X0, MAP_Z0, MAP_X1 - MAP_X0, MAP_Z1 - MAP_Z0); }
    }
    // subway line (optional, off by default; cached path, see subwayData)
    if (settings.mapSubwayMini) { const sd = subwayData(); if (sd) strokeSubway(g, sd, 1 / mmZoom, 0.7); }
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
      // allocation-free per frame: the static icons (landmarks, blips, shop clusters) are rebuilt a few times a second at
      // most (miniIcons), live ones (police, pickups) come from pooled objects, the projection writes into one scratch pair
      mmProj.cs = Math.cos(th); mmProj.sn = Math.sin(th); mmProj.cx = cx; mmProj.cy = cy; mmProj.px = p.x; mmProj.pz = p.z; mmProj.k = mmZoom;
      mmReserved[0] = cx; mmReserved[1] = cy; mmReserved[2] = 30;
      const ppmI = Math.max(1, mmZoom);
      placeIconsMerged(g, miniStaticIcons(p, ppmI), dynamicIcons(p, ppmI, 'mini', null, dynMini), mmProject, MW, MH, mmReserved, 1, 0.9, 6);
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
      const [ex, ey] = edgePoint(nx, ny, cx - 19, ny < 0 ? cy - 19 : MH - cy - 19); // r2: clear of the rounded frame edge
      g.fillStyle = 'rgba(10,14,22,.85)'; g.beginPath(); g.arc(cx + ex, cy + ey, 9, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#fff'; g.font = '700 11px "Archivo Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('N', cx + ex, cy + ey + 0.5);
    }
    // player arrow
    const h = num(game.player?.heading);
    const a = th + Math.atan2(Math.cos(h), Math.sin(h));
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = 'rgba(47,224,208,.22)'; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill();
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 4;
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -7); g.lineTo(-3.5, 0); g.lineTo(-7, 7); g.closePath(); g.fill();
    g.shadowBlur = 0; g.strokeStyle = '#ff5fa8'; g.lineWidth = 1.4; g.stroke();
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
    const now = performance.now();
    if (shopCache && shopCache.src === L && shopCache.n === L.length && now - shopCache.t < 2000) return shopCache.out;
    // every 2 s (open / closed changes): the per-interior category / glyph / name lookups are kept in shopInfo
    const out = shopCache?.spare || [];
    out.length = 0;
    for (const it of L) {
      const c = it?.center || it?.pos || it?.position; if (!c || !isFinite(c.x)) continue;
      let o = shopInfo.get(it);
      if (!o || o.x !== c.x || o.z !== c.z) {
        const cat = shopCat(it.type || it.kind || it.name);
        const [glyph, col] = cat === 'other' ? SHOP_GLYPH(it.type || it.name) : CAT_STYLE[cat];
        o = { x: c.x, z: c.z, c: col, glyph, cat, name: String(it.name || it.type || 'Shop'), open: true, closed: false };
        shopInfo.set(it, o);
      }
      o.open = it.open !== false; o.closed = it.open === false;
      out.push(o);
    }
    // two arrays alternate so a list handed out earlier is never refilled while the new one is built
    shopCache = { src: L, n: L.length, t: now, out, spare: shopCache?.out || [] };
    return out;
  }
  const shopInfo = new WeakMap();
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
  // live icons (police while wanted, nearby pickups) from a pool: the objects are reused every frame
  const dynMini = { list: [], pool: [] }, dynBig = { list: [], pool: [] };
  function drawDynCop(g, x, y) { copBlipScreen(g, x, y, this.foot); }
  function drawDynPickup(g, x, y, s) { drawPickup(g, x, y, this.mapIcon, s); }
  function dynIcon(D, x, z, prio, draw) {
    let o = D.pool[D.list.length]; if (!o) D.pool.push((o = { x: 0, z: 0, prio: 0, foot: false, mapIcon: null, draw: null }));
    o.x = x; o.z = z; o.prio = prio; o.draw = draw; D.list.push(o); return o;
  }
  const copSeen = new Set();
  function dynamicIcons(p, ppm, mode, view, D) {
    D.list.length = 0;
    const lvl = num(game.wanted?.level, num(game.player?.wanted));
    if (lvl > 0 && p) {
      const near = (q) => q && Math.hypot(q.x - p.x, q.z - p.z) < 400;
      for (const u of game.police?.units || []) if (u && u.active !== false && !u.dead && u.pos && near(u.pos)) dynIcon(D, u.pos.x, u.pos.z, 95, drawDynCop).foot = true;
      copSeen.clear();
      for (const c of game.police?.cars || []) { const v = c?.v || c; const q = v?.mesh?.position; if (q && near(q)) { copSeen.add(v); dynIcon(D, q.x, q.z, 95, drawDynCop).foot = false; } }
      for (const v of game.vehicles?.list || []) { if (!v || copSeen.has(v) || v.playerDriven) continue; if (!(v.police || v.typeKey === 'police')) continue; const q = v.mesh?.position; if (near(q)) dynIcon(D, q.x, q.z, 95, drawDynCop).foot = false; }
      copSeen.clear();
    }
    const PL = game.pickups?.list;
    if (Array.isArray(PL) && p) {
      let n = 0;
      const bound = mapR.ok() && mapR.boundary();
      for (const pk of PL) {
        if (!pk || !pk.active || !pk.mapIcon || !pk.pos) continue;
        const d = Math.hypot(pk.pos.x - p.x, pk.pos.z - p.z);
        const zoomOK = mode === 'big' && ppm >= 1.4 && view && pk.pos.x > view[0] && pk.pos.x < view[2] && pk.pos.z > view[1] && pk.pos.z < view[3];
        if (d > 250 && !zoomOK) continue;
        if (++n > 60) break;
        if (bound && !mapR.inside(pk.pos.x, pk.pos.z)) continue;
        const pr = PICKUP_PRIO[pk.mapIcon] ?? 40;
        dynIcon(D, pk.pos.x, pk.pos.z, pr - d / 1000, drawDynPickup).mapIcon = pk.mapIcon;
      }
    }
    if (D.list.length > 1) D.list.sort((a, b) => b.prio - a.prio);
    return D.list;
  }
  const PICKUP_PRIO = { weapon: 70, armor: 56, health: 55, ammo: 50, cash: 45 };
  // dyn = false: only the static icons (the minimap adds the live ones from dynamicIcons)
  function mapIcons(p, ppm, mode, view, dyn = true) {
    const icons = [];
    for (const lm of landmarks(p)) icons.push({ x: lm.x, z: lm.z, prio: 88, lm: lm.kind, draw: (g, x, y, s) => drawLandmark(g, x, y, lm.kind, s) });
    // generic blips other systems publish (game.mapBlips: [{ x, z, kind, label, prio, draw(g, x, y, s) }]), e.g. metro stations
    for (const b of Array.isArray(game.mapBlips) ? game.mapBlips : []) {
      if (!b || !isFinite(b.x) || !isFinite(b.z) || typeof b.draw !== 'function') continue;
      icons.push({ x: b.x, z: b.z, prio: b.prio ?? 80, lm: b.kind, label: b.label, draw: (g, x, y, s) => { try { b.draw(g, x, y, s); } catch (e) { /* a bad blip must not break the map */ } } });
    }
    if (dyn) for (const c of policeEntities(p)) icons.push({ ...c, prio: 95, draw: (g, x, y) => copBlipScreen(g, x, y, c.kind === 'cop') });
    const PL = dyn ? game.pickups?.list : null;
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
    const col = kind === 'home' ? '#ff5fa8' : kind === 'hospital' ? '#ff5d6c' : '#4d8bff';
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
  // placeIcons for two lists already sorted by priority (static + live), without allocating: placed boxes go into one
  // reused flat array (x, y, size triples), the projection returns a scratch pair
  const placedBuf = [];
  function placeIconsMerged(g, A, Bl, project, W, H, reserved, nRes, s = 1, pad = 4) {
    const R = 8 * s + pad;
    let np = 0;
    for (let i = 0; i < nRes * 3; i++) placedBuf[np++] = reserved[i];
    let ia = 0, ib = 0;
    while (ia < A.length || ib < Bl.length) {
      const ic = ib < Bl.length && (ia >= A.length || Bl[ib].prio >= A[ia].prio) ? Bl[ib++] : A[ia++];
      const q = project(ic.x, ic.z), x = q[0], y = q[1];
      if (x < 8 || y < 8 || x > W - 8 || y > H - 8) continue;
      let hit = false;
      for (let j = 0; j < np; j += 3) { const rr = (placedBuf[j + 2] ?? R) / 2 + R / 2; if (Math.abs(placedBuf[j] - x) < rr && Math.abs(placedBuf[j + 1] - y) < rr) { hit = true; break; } }
      if (hit) continue;
      placedBuf[np++] = x; placedBuf[np++] = y; placedBuf[np++] = R;
      ic.draw(g, x, y, s);
    }
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
    g.save(); g.font = '800 9px "Archivo Black", sans-serif'; const w = Math.max(11, g.measureText(t).width + 6);
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
    g.fillStyle = MAP_COLORS.sea; g.fillRect(0, 0, r.width, r.height);
    mapView.ppm = clamp(mapView.ppm, fitPPM(), 6);
    const k = mapView.ppm, ox = r.width / 2 - mapView.cx * k, oz = r.height / 2 - mapView.cz * k;
    mapXform = { k, ox, oz };
    const view = [-ox / k, -oz / k, (r.width - ox) / k, (r.height - oz) / k];
    g.save(); g.translate(ox, oz); g.scale(k, k);
    const drawn = mapR.draw(g, view[0], view[1], view[2], view[3], k * d, { budget: 28, quality: 0.75, id: 'big' });
    if (drawn && mapR.pending > 0 && !bigPendingTimer) bigPendingTimer = setTimeout(() => { bigPendingTimer = 0; if (ui.paused && curTab === T_MAP) drawBigMap(); }, 20);
    if (!drawn && bake) g.drawImage(bake, MAP_X0, MAP_Z0, MAP_X1 - MAP_X0, MAP_Z1 - MAP_Z0);
    g.restore();
    // paper grain
    g.save(); g.globalAlpha = 0.05; g.globalCompositeOperation = 'overlay'; g.fillStyle = grain(g); g.fillRect(0, 0, r.width, r.height); g.restore();
    g.save(); g.translate(ox, oz); g.scale(k, k);
    const sub = subwayOn() ? subwayData() : null;
    if (sub) strokeSubway(g, sub, 1 / k, 1);
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
    if (sub) drawSubwayStations(g, sub, toScreen, r.width, r.height, reserved);
    // story set pieces from layout.json (Nico's house, the Keys bar, ...)
    if (Array.isArray(worldLayout?.setpieces)) {
      const SP_NAMES = { nico_house: "NICO'S HOUSE", keys_bar: "LOW TIDE LOLA'S" };
      const spDrawn = [];
      for (const sp of worldLayout.setpieces) {
        const nm = SP_NAMES[sp.id];
        if (!nm || !isFinite(sp.x) || !isFinite(sp.z)) continue;
        const [sx, sy] = toScreen(sp.x, sp.z);
        if (sx < -20 || sy < -20 || sx > r.width + 20 || sy > r.height + 20) continue;
        const crowded = spDrawn.some((q) => Math.abs(q[0] - sx) < 120 && Math.abs(q[1] - sy) < 22);
        drawSetPiece(g, sx, sy, sp.id, crowded ? null : nm);
        spDrawn.push([sx, sy]);
        reserved.push([sx, sy, 20], [sx + 55, sy, 90]);
      }
    }
    // district labels (higher priority than shops when zoomed out)
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const DL = mapR.districts();
    let labels = DL.length ? DL.map((d2) => [d2.name, d2.x, d2.z, d2.size]) : DISTRICT_LABELS.map(([n, x, z]) => [n, x, z, 20]);
    const PL = Array.isArray(worldLayout?.places) ? worldLayout.places : null;
    if (PL && PL.length) {
      // world places first (sized by kind and radius), then the real-Miami districts when zoomed in
      const KIND_SIZE = { region: 60, park: 40, airport: 38, lake: 34, town: 22, key: 20 };
      labels = PL.filter((q) => q && q.name && isFinite(q.x) && isFinite(q.z))
        .map((q) => [q.name, q.x, q.z, (KIND_SIZE[q.kind] || 20) + Math.sqrt(num(q.r, 400)) * 0.2])
        .concat(k > 0.35 ? labels : []);
    }
    labels = labels.filter((l) => !/^downtown$/i.test(String(l[0] || '').trim()));   // user: no DOWNTOWN labels
    labels.sort((a2, b2) => b2[3] - a2[3]);
    const fsBase = DL.length ? clamp(10 + k * 14, 12, 26) : clamp(13 * k / 0.6, 12, 26);
    const labelBoxes = [];
    if (k < 2.2) for (const [n, x, z, size] of labels) {
      const [sx, sy] = toScreen(x, z);
      if (sx < 40 || sy < 20 || sx > r.width - 40 || sy > r.height - 20) continue;
      if (DL.length && size < 3 && k < 0.6) continue;
      const fs = Math.round(fsBase * (DL.length ? clamp(0.8 + Math.sqrt(size) * 0.05, 0.8, 1.35) : 1));
      g.font = `800 ${fs}px "Archivo Black", sans-serif`;
      const txt = n.toUpperCase(), tw = g.measureText(txt).width;
      if (labelBoxes.some((q) => Math.abs(q[0] - sx) < (q[2] + tw) / 2 + 10 && Math.abs(q[1] - sy) < fs + 4)) continue;
      if (reserved.some((q) => Math.abs(q[0] - sx) < tw / 2 + 14 && Math.abs(q[1] - sy) < fs)) continue;
      labelBoxes.push([sx, sy, tw]);
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(20,24,30,.62)'; g.lineJoin = 'round'; g.strokeText(txt, sx, sy);
      g.fillStyle = PL ? '#ffffff' : distColor(n); g.globalAlpha = 0.95; g.fillText(txt, sx, sy); g.globalAlpha = 1;
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
        g.font = '700 14px "Archivo Black", sans-serif'; g.textAlign = 'center';
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
      g.fillStyle = '#fff'; g.strokeStyle = '#ff5fa8'; g.lineWidth = 1.6;
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
      if (sub) extra.push(['subway', 'Southline Metro']);
      const rows = cats.length + extra.length;
      if (rows) {
        const lw = 176, lh = 14 + rows * 21, lx = r.width - lw - 14, ly = r.height - lh - 40;
        g.fillStyle = 'rgba(9,11,18,.72)'; roundRect(g, lx, ly, lw, lh, 10); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1; g.stroke();
        let y = ly + 17;
        g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        for (const c of cats) { const st = CAT_STYLE[c]; drawPOI(g, lx + 17, y, { c: st[1], glyph: st[0] }, 0.8); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(st[2], lx + 32, y + 0.5); y += 21; }
        for (const [kd, txt] of extra) { if (kd === 'subway') subwaySwatch(g, lx + 17, y); else if (kd === 'cop') copBlipScreen(g, lx + 17, y, true); else if (kd.startsWith('lm:')) drawLandmark(g, lx + 17, y, kd.slice(3), 0.8); else drawPickup(g, lx + 17, y, 'weapon', 0.9); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(txt, lx + 32, y + 0.5); y += 21; }
        g.textAlign = 'center';
      }
    }
    // compass
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 14px "Archivo Black", sans-serif'; g.textAlign = 'center';
    g.fillText('N', r.width - 30, 26); g.fillRect(r.width - 31, 34, 2, 18);
  }
  // ---- subway layer (Southline Metro: game.metro.stations in line order, see src/world/metro/metro.v2.js) ----
  // The line is drawn in world space from a cached Path2D (no per-frame allocation); its colors follow the in-station line
  // map (gold -> coral -> pink). Big map: on by default (setting mapSubway, U on the map); minimap: setting mapSubwayMini.
  const SUBWAY_STOPS = ['#ffd27a', '#ff6b5a', '#ff5fa8'];
  let subwayCache = null;
  function subwayData() {
    const st = game.metro?.stations;
    if (!Array.isArray(st) || st.length < 2) return null;
    if (subwayCache && subwayCache.src === st && subwayCache.n === st.length) return subwayCache;
    const path = new Path2D();
    st.forEach((s2, i) => (i ? path.lineTo(s2.kx, s2.kz) : path.moveTo(s2.kx, s2.kz)));
    subwayCache = { src: st, n: st.length, path, grads: new Map() };
    return subwayCache;
  }
  function subwayGrad(g, d) {
    let gr = d.grads.get(g);
    if (!gr) {
      const a = d.src[0], b = d.src[d.n - 1];
      gr = g.createLinearGradient(a.kx, a.kz, b.kx, b.kz);
      SUBWAY_STOPS.forEach((c, i) => gr.addColorStop(i / (SUBWAY_STOPS.length - 1), c));
      d.grads.set(g, gr);
    }
    return gr;
  }
  // world-space stroke; px = world units per screen pixel
  function strokeSubway(g, d, px, s = 1) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(14,8,24,.78)'; g.lineWidth = 8.5 * s * px; g.stroke(d.path);
    g.strokeStyle = subwayGrad(g, d); g.lineWidth = 5 * s * px; g.stroke(d.path);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2 * s * px; g.stroke(d.path);
    g.restore();
  }
  function subwayStop(g, x, y, r, col) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#fff'; g.fill();
    g.lineWidth = r * 0.42; g.strokeStyle = '#140c22'; g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.42, 0, TAU); g.fillStyle = col; g.fill();
  }
  // station dots + names; each name tries right, left, above, below of its dot and is dropped (dot kept) when all four
  // would overlap another station's label or dot; the "METRO · street" line only shows when zoomed in
  const subBoxes = [];
  function drawSubwayStations(g, d, toScreen, W, H, reserved) {
    const n = d.n, k = mapXform?.k || 1, showSub = k >= 0.75;
    subBoxes.length = 0;
    const pts = [];
    for (let i = 0; i < n; i++) { const s2 = d.src[i], q = toScreen(s2.kx, s2.kz); pts.push(q); subBoxes.push([q[0] - 9, q[1] - 9, q[0] + 9, q[1] + 9]); }
    g.save();
    g.lineJoin = 'round'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const s2 = d.src[i], [x, y] = pts[i];
      if (x < -60 || y < -30 || x > W + 60 || y > H + 30) continue;
      subwayStop(g, x, y, 7.5, SUBWAY_STOPS[Math.round(i / Math.max(1, n - 1) * (SUBWAY_STOPS.length - 1))]);
      reserved.push([x, y, 26]);
      const txt = String(s2.name || '').toUpperCase(), sub2 = 'METRO' + (s2.sub ? ' · ' + String(s2.sub).toUpperCase() : '');
      g.font = '600 10px Inter, system-ui, sans-serif'; const sw = showSub ? g.measureText(sub2).width : 0;
      g.font = '800 13px "Archivo Black", sans-serif'; const tw = g.measureText(txt).width;
      const bw = Math.max(tw, sw), bh = showSub ? 28 : 15;
      // candidate boxes [x0, y0] for: right, left, above, below
      const cands = [[x + 13, y - 7.5, 'left'], [x - 13 - bw, y - 7.5, 'left'], [x - bw / 2, y - 14 - bh, 'left'], [x - bw / 2, y + 13, 'left']];
      let pick = null;
      for (const c of cands) {
        const b = [c[0] - 2, c[1] - 2, c[0] + bw + 2, c[1] + bh + 2];
        if (b[0] < 4 || b[2] > W - 4 || b[1] < 4 || b[3] > H - 4) continue;
        if (subBoxes.some((o, j) => j !== i && o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1])) continue;
        pick = c; subBoxes.push(b); break;
      }
      if (!pick) continue;
      const tx = pick[0], ty = pick[1] + 7.5;
      g.textAlign = 'left';
      g.lineWidth = 4; g.strokeStyle = 'rgba(14,8,24,.85)'; g.strokeText(txt, tx, ty);
      g.fillStyle = '#fff'; g.fillText(txt, tx, ty);
      if (showSub) {
        g.font = '600 10px Inter, system-ui, sans-serif';
        g.lineWidth = 3; g.strokeText(sub2, tx, ty + 14); g.fillStyle = '#ffb6dc'; g.fillText(sub2, tx, ty + 14);
      }
      reserved.push([tx + bw / 2, pick[1] + bh / 2, Math.max(bw, 60)]);
    }
    g.restore();
  }
  function subwaySwatch(g, x, y) {
    g.save(); g.lineCap = 'round';
    const gr = g.createLinearGradient(x - 9, 0, x + 9, 0); SUBWAY_STOPS.forEach((c, i) => gr.addColorStop(i / 2, c));
    g.strokeStyle = 'rgba(14,8,24,.9)'; g.lineWidth = 7; g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.stroke();
    g.strokeStyle = gr; g.lineWidth = 4; g.stroke();
    subwayStop(g, x, y, 4.5, '#ff6b5a');
    g.restore();
  }
  function drawSetPiece(g, x, y, id, name) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = 5;
    g.fillStyle = id === 'nico_house' ? '#6a4fd6' : '#e2763a';
    g.beginPath();
    g.arc(x, y, 9, 0, TAU);
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    if (id === 'nico_house') {
      g.moveTo(x, y - 5); g.lineTo(x - 5.5, y - 0.5); g.lineTo(x - 3.8, y - 0.5); g.lineTo(x - 3.8, y + 4.5);
      g.lineTo(x + 3.8, y + 4.5); g.lineTo(x + 3.8, y - 0.5); g.lineTo(x + 5.5, y - 0.5); g.closePath();
    } else {
      // cocktail glass
      g.moveTo(x - 5, y - 4.5); g.lineTo(x + 5, y - 4.5); g.lineTo(x + 0.9, y + 0.3); g.lineTo(x + 0.9, y + 3.2);
      g.lineTo(x + 3, y + 4.6); g.lineTo(x - 3, y + 4.6); g.lineTo(x - 0.9, y + 3.2); g.lineTo(x - 0.9, y + 0.3); g.closePath();
    }
    g.fill();
    if (!name) {
      g.restore();
      return;
    }
    g.font = 'italic 800 14px "Archivo Black", sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.lineWidth = 3.5;
    g.strokeStyle = 'rgba(20,24,30,.7)';
    g.lineJoin = 'round';
    g.strokeText(name, x + 14, y + 0.5);
    g.fillText(name, x + 14, y + 0.5);
    g.restore();
  }
  function drawSearchBig(fn) {
    if (!mapXform) return;
    bctx.save(); bctx.translate(mapXform.ox, mapXform.oz); bctx.scale(mapXform.k, mapXform.k); fn(bctx); bctx.restore();
  }
  function drawPhoneMap(c, o = {}) {
    const g = c.getContext('2d'), p = Number.isFinite(o.cx) ? { x: o.cx, z: o.cz } : game.player?.position || { x: 0, z: 0 };
    if (!bake && !mapR.ok()) bake = tryBake();
    g.fillStyle = MAP_COLORS.sea; g.fillRect(0, 0, c.width, c.height);
    const k = Number.isFinite(o.radius) ? Math.min(c.width, c.height) / 2 / o.radius : 1.2;
    g.save(); g.translate(c.width / 2, c.height / 2); g.scale(k, k); g.translate(-p.x, -p.z);
    const R = Math.hypot(c.width, c.height) / 2 / k;
    if (!mapR.draw(g, p.x - R, p.z - R, p.x + R, p.z + R, k, { id: 'phone' }) && bake) g.drawImage(bake, MAP_X0, MAP_Z0, MAP_X1 - MAP_X0, MAP_Z1 - MAP_Z0);
    if (routeShown && routeShown.length > 1) strokeRoute(g, routeShown, 1 / k, 6);
    g.restore();
    return true;
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
      ['GENERAL', [['P / ▲', 'Phone'], ['Arrows / Enter', 'Phone navigate / open'], ['Backspace / Esc', 'Phone back · close'], ['Esc', 'Pause menu']]],
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
  // r2 (QA first minutes #10): one message at a time. Notifications that arrive together are shown ~3 s apart, and in
  // the first seconds of play the area card comes first, then the messages, then the help prompt.
  const notifQ = [];
  let nextNotifAt = 0, playStartAt = 0;
  const OPENING_MS = 3200, NOTIF_GAP_MS = 3000;
  function notify(text, ms = 3500, opts = {}) {
    if (!text) return;
    const now = performance.now();
    if (ui.title || !playStartAt || notifQ.length || now < nextNotifAt) { if (notifQ.length < 6) notifQ.push([text, ms, opts]); return; }
    nextNotifAt = now + NOTIF_GAP_MS;
    notifyNow(text, ms, opts);
  }
  function pumpNotifs() {
    const now = performance.now();
    if (!playStartAt && !ui.title) { playStartAt = now; nextNotifAt = Math.max(nextNotifAt, now + OPENING_MS); }
    if (!notifQ.length || ui.title || now < nextNotifAt) return;
    const [t, ms, o] = notifQ.shift();
    nextNotifAt = now + NOTIF_GAP_MS;
    notifyNow(t, ms, o);
  }
  function notifyNow(text, ms = 3500, opts = {}) {
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
  let helpHeld = undefined;
  function help(text) {
    // the opening sequence owns the first seconds: the prompt waits until the area card and the first messages are read
    if (!playStartAt || performance.now() < playStartAt + 2 * OPENING_MS) { helpHeld = text || null; return; }
    if (text === helpText) return;
    helpText = text || null;
    if (helpText) { helpEl.innerHTML = formatKeys(helpText); helpEl.classList.add('on'); }
    else helpEl.classList.remove('on');
  }
  function pumpHelp() { if (helpHeld !== undefined && playStartAt && performance.now() >= playStartAt + 2 * OPENING_MS) { const t = helpHeld; helpHeld = undefined; help(t); } }
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
    areaSmall.textContent = BRAND.name.toUpperCase();
    areaName.textContent = name;
    areaStreet.textContent = street || '';
    areaEl.style.setProperty('--dc', distColor(name));
    streetEl.classList.remove('on'); streetTimer = 0;
    areaEl.classList.remove('on'); void areaEl.offsetWidth; areaEl.classList.add('on');
    areaTimer = 4.2;
  }

  // ---------- per-frame ----------
  const vnCache = { v: null, k: null, nm: '', br: '', md: '' };
  function update(dt) {
    pumpNotifs(); pumpHelp();
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

    // perf (user: unplayable fps): the minimap redraw is one of the biggest HUD costs, so it runs at 30 Hz with the elapsed time
    mmAcc += dt; if (mmAcc >= 1 / 30 - 0.002 || !mmDrawnOnce) { drawMinimap(mmAcc, kmh); mmAcc = 0; mmDrawnOnce = true; }

    // health / armor
    const hp = clamp(num(pl.health, 100), 0, 100), ar = clamp(num(pl.armor, 0), 0, 100);
    if (hp !== lastHp) {
      if (hp < lastHp - 0.5 && lastHp <= 100) { mm.classList.remove('hit'); void mm.offsetWidth; mm.classList.add('hit'); }
      lastHp = hp; setBar(hpBar, hp); hpBar.classList.toggle('low', hp < 30);
    }
    if (ar !== lastAr) { lastAr = ar; setBar(arBar, ar); arBar.classList.toggle('empty', ar <= 0); }

    // clock / money
    const clk = fmtClock(game.timeOfDay);
    if (lastClock !== clk) lastClock = clk;
    const money = num(pl.money);
    if (money !== moneyTarget) {
      const diff = money - moneyTarget; moneyTarget = money;
      corner.cashFly(diff);
    }
    if (moneyShown !== moneyTarget) {
      const d = moneyTarget - moneyShown;
      moneyShown = Math.abs(d) < 1 ? moneyTarget : moneyShown + d * Math.min(1, dt * 5) + Math.sign(d) * 0.5;
      corner.setCash(fmtMoney(moneyShown));
    }

    // wanted: game.wanted.level (0..6) drives the stars; game.wanted.evading (police lost sight, searching) makes them
    // flash. game.hud.setWantedFlash(bool|null) can force the flash for scripted moments.
    const w = clamp(Math.round(num(game.wanted?.level, num(pl.wanted))), 0, 6);
    const evading = w > 0 && !!game.wanted?.evading;
    if (evading !== mm.classList.contains('evading')) mm.classList.toggle('evading', evading);
    if (w !== lastWanted) { mm.classList.toggle('wanted', w > 0); lastWanted = w; }
    // weapon and ammo
    const wpn = typeof pl.weapon === 'string' && pl.weapon ? pl.weapon : 'fist';
    const reloading = !!game.weapons?.reloading;
    const ai = ammoInfo(wpn);
    const tod = num(game.timeOfDay, 18);
    corner.update(dt, {
      wanted: w, evading, weapon: wpn, weaponSvg: weaponIcon(wpn), ammo: ai, reloading,
      empty: !!ai && !reloading && (ai.clip != null ? ai.clip === 0 : ai.total === 0),
      low: !!ai && !reloading && ai.clip != null && ai.clip > 0 && ai.clip <= Math.max(1, Math.ceil(num(wDefs().defs[wpn]?.clip, 10) * 0.25)),
      clock: clk, tod: tod < 6 || tod >= 19.5 ? 'moon' : tod >= 17 || tod < 7.5 ? 'dusk' : 'sun',
    });
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
      // render track (Nov 18 perf): the name strings are built once per vehicle (were 4 regex / case passes every frame)
      const V0 = st.vehicle, nmKey = V0.name || V0.spec?.label || 'Vehicle';
      if (vnCache.v !== V0 || vnCache.k !== nmKey) {
        const nm0 = String(nmKey).replace(/\s*#\d+$/, '').toUpperCase(), sp = V0.spec || {}; let br = sp.brand || '', md = sp.model || sp.name || '';
        if (!br || !md) { const w = nm0.split(' '); br = br || w[0] || ''; md = md || w.slice(1).join(' '); }
        vnCache.v = V0; vnCache.k = nmKey; vnCache.nm = nm0; vnCache.br = String(br).toUpperCase(); vnCache.md = String(md).replace(/\s*#\d+$/, '').toUpperCase();
        if (spdName.textContent !== nm0) spdName.textContent = nm0;
        if (vcBrand.textContent !== vnCache.br) vcBrand.textContent = vnCache.br;
        if (vcModel.textContent !== vnCache.md) vcModel.textContent = vnCache.md;
      }
      { const V = st.vehicle;
        const hf = Number.isFinite(V.health) ? V.health / 1000 : 1;
        const ec = V.disabled || hf <= 0.15 ? 'bad' : hf < 0.5 ? 'warn' : 'ok';
        if (vcEng.dataset.s !== ec) { vcEng.dataset.s = ec; vcEng.className = 'ps-vc-eng ' + ec; } }
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

    phone.update(dt);
  }

  // initial
  corner.setCash(fmtMoney(moneyShown));
  if (document.pointerLockElement) hideTitle();
  const api = { setKnown: corner.setKnown, setWantedFlash: corner.setWantedFlash, startPlay: () => hideTitle(), update, notify, help, setMission, districtAt, setPaused, setPhone, showArrest, crimeToast, openWeaponWheel: openWheel, closeWeaponWheel: closeWheel,
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
  { x: -205, z: 205, c: '#ff5d6c', glyph: 'plus', name: 'Southline General' },
  { x: 10, z: -45, c: '#3fcf8e', glyph: 'dollar', name: 'First Southline Bank' },
  { x: 205, z: 255, c: '#ffb35a', glyph: 'wrench', name: "Tiny's Garage" },
  { x: -95, z: -250, c: '#c58cff', glyph: 'shirt', name: 'Threads' },
  { x: 300, z: -105, c: '#ff8fc8', glyph: 'cup', name: 'Neon Diner' },
  { x: -350, z: 45, c: '#6fb6ff', glyph: 'drop', name: 'Southline Gas' },
  { x: 470, z: -200, c: '#ff5fa8', glyph: 'wave', name: 'Pier 7' },
];
function drawGlyph(g, kind) {
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  switch (kind) {
    case 'plus': g.fillRect(-1.3, -4.2, 2.6, 8.4); g.fillRect(-4.2, -1.3, 8.4, 2.6); return;
    case 'dollar': g.font = '800 10px "Archivo Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 0.5); return;
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
    case 'dollar': g.font = `800 ${Math.round(9 * q * 1.2)}px "Archivo Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 0.5); break;
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
// fonts: bundled locally (src/ui/styles/fonts.css, OFL); no font CDN at runtime
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
