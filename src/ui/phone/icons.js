// SOUTHLINE phone (Kestrel OS): original app icons and UI glyphs. Every shape here is drawn for this game; nothing is
// traced from a real phone OS. App icons are a rounded-square tile (CSS gradient) with a white glyph on a 60x60 grid.

const G = (body, vb = '0 0 60 60') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

// cog with n teeth, built once (no font glyph)
function cogPath(cx, cy, rOut, rIn, n, hole) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, w = (Math.PI * 2) / n;
    const pts = [[a0 - w * 0.22, rIn], [a0 - w * 0.13, rOut], [a0 + w * 0.13, rOut], [a0 + w * 0.22, rIn], [a0 + w * 0.5 - w * 0.22, rIn]];
    for (const [a, r] of pts) d += `${d ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  }
  d += 'Z';
  d += `M${cx + hole} ${cy}a${hole} ${hole} 0 1 0 ${-hole * 2} 0a${hole} ${hole} 0 1 0 ${hole * 2} 0Z`;
  return d;
}

// ---------------------------------------------------------------- app icons (tile gradient + glyph)
export const APP_ICONS = {
  phone: {
    bg: 'linear-gradient(165deg,#5fe08a 0%,#22b45a 100%)',
    svg: G('<path fill="#fff" d="M21.6 14.2c1.6-.9 3.6-.3 4.5 1.3l3.1 5.6c.8 1.5.5 3.3-.8 4.4l-2.3 1.9c1.9 4.1 5.1 7.4 9.2 9.4l2-2.3c1.1-1.3 3-1.6 4.5-.7l5.5 3.3c1.6.9 2.1 3 1.2 4.5l-1.9 3.2c-1.2 2-3.5 3.1-5.8 2.8C27.7 45.7 15.8 33.4 14 18.3c-.3-2.2.8-4.4 2.7-5.5z"/>'),
  },
  messages: {
    bg: 'linear-gradient(165deg,#47d7ff 0%,#1f86f0 100%)',
    svg: G('<path fill="#fff" fill-opacity=".55" d="M35 20h9.5c4.1 0 7.5 3.2 7.5 7.2v6.6c0 3-1.9 5.6-4.7 6.7l.9 5.2-5.6-4.5H35c-4.1 0-7.5-3.2-7.5-7.2v-6.8c0-4 3.4-7.2 7.5-7.2z"/><path fill="#fff" d="M17.5 13h17c4.7 0 8.5 3.6 8.5 8.1v8.3c0 4.5-3.8 8.1-8.5 8.1H25l-7.6 6.2 1.1-6.4C13.6 36.6 9 33.4 9 29.4v-8.3C9 16.6 12.8 13 17.5 13z"/>'),
  },
  maps: {
    bg: 'linear-gradient(160deg,#f6f1e4 0%,#e3d8bf 100%)',
    svg: G('<path fill="#7fc6a4" d="M8 16l14-5 16 5 14-5v33l-14 5-16-5-14 5z"/><path fill="#5fb08c" d="M22 11l16 5v33l-16-5z"/><path fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" d="M8 35c8-1 11-9 18-9s9 9 26 6"/><path fill="none" stroke="#f3c25c" stroke-width="2.2" stroke-linecap="round" d="M8 35c8-1 11-9 18-9s9 9 26 6"/><path fill="#ff5a4f" d="M40 9.5a8 8 0 018 8c0 6-8 13.5-8 13.5s-8-7.5-8-13.5a8 8 0 018-8z"/><circle cx="40" cy="17.5" r="3" fill="#fff"/>'),
  },
  camera: {
    bg: 'linear-gradient(165deg,#c9ced8 0%,#8a919f 100%)',
    svg: G('<rect x="8" y="17" width="44" height="31" rx="7" fill="#2a2e37"/><path fill="#2a2e37" d="M22 12h16l3.5 6h-23z"/><circle cx="30" cy="32.5" r="11" fill="#e8ebf1"/><circle cx="30" cy="32.5" r="8" fill="#1b1e25"/><circle cx="30" cy="32.5" r="5" fill="#3d5a8a"/><circle cx="27.6" cy="30.2" r="1.8" fill="#fff" fill-opacity=".8"/><circle cx="45.5" cy="23" r="2" fill="#ffcf5a"/>'),
  },
  weather: {
    bg: 'linear-gradient(170deg,#3d8cf5 0%,#7cc4ff 100%)',
    svg: G('<circle cx="23" cy="23" r="9.5" fill="#ffd34d"/><g stroke="#ffd34d" stroke-width="2.6" stroke-linecap="round"><path d="M23 7.5v3.2M23 35.3v3.2M7.5 23h3.2M10 12l2.3 2.3M33.7 12l-2.3 2.3M10 34l2.3-2.3"/></g><path fill="#fff" d="M22.5 46a8 8 0 01-.6-16 11 11 0 0121 2.6 6.8 6.8 0 01.7 13.4z"/>'),
  },
  work: {
    bg: 'linear-gradient(165deg,#ffbf47 0%,#f2862b 100%)',
    svg: G('<path fill="#fff" fill-opacity=".9" d="M23 14h14a3 3 0 013 3v4h-4v-3.4H24V21h-4v-4a3 3 0 013-3z"/><rect x="9" y="20" width="42" height="27" rx="5" fill="#fff"/><path fill="#f2862b" fill-opacity=".35" d="M9 30h42v3H9z"/><rect x="26" y="28" width="8" height="7" rx="1.6" fill="#f2862b"/>'),
  },
  wavvy: {
    bg: 'linear-gradient(150deg,#ff5fb8 0%,#7a5cff 100%)',
    svg: G('<path d="M8 36c5-9 9-9 13 0s8 9 12 0 8-9 13 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="45" cy="16" r="5" fill="#fff"/>'),
  },
  settings: {
    bg: 'linear-gradient(165deg,#9aa1ad 0%,#5d636f 100%)',
    svg: G(`<path fill="#e9ebef" fill-rule="evenodd" d="${cogPath(30, 30, 21, 16.5, 12, 7)}"/><circle cx="30" cy="30" r="12.5" fill="none" stroke="#5d636f" stroke-opacity=".45" stroke-width="2"/>`),
  },
  bank: {
    bg: 'linear-gradient(160deg,#1d4ed8 0%,#0b2a6b 100%)',
    svg: G('<path fill="#fff" d="M30 9l21 10v4H9v-4z"/><path fill="#fff" d="M13 26h5v15h-5zM23 26h5v15h-5zM32 26h5v15h-5zM42 26h5v15h-5zM9 44h42v5H9z"/>'),
  },
};

// ---------------------------------------------------------------- UI glyphs (24x24, currentColor)
const U = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const S = (d, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
export const GLYPH = {
  back: U(S('M15 4.5L7.5 12l7.5 7.5', 2.6)),
  chevron: U(S('M9.5 5.5L16 12l-6.5 6.5', 2.2)),
  close: U(S('M6 6l12 12M18 6L6 18', 2.2)),
  plus: U(S('M12 5v14M5 12h14', 2.4)),
  search: U(S('M10.5 4.5a6 6 0 110 12 6 6 0 010-12zM15 15l5 5', 2.2)),
  send: U(S('M4 12l15-7-5 15-3-6z', 2) + S('M11 14l8-9', 2)),
  transfer: U(S('M5 8h13l-3.5-3.5M19 16H6l3.5 3.5', 2.1)),
  deposit: U(S('M12 4v10m-4.5-4.5L12 14l4.5-4.5M5 19h14', 2.2)),
  withdraw: U(S('M12 15V5m-4.5 4.5L12 5l4.5 4.5M5 19h14', 2.2)),
  card: U('<rect x="3" y="5.5" width="18" height="13" rx="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18" stroke="currentColor" stroke-width="2.4"/><path d="M6.5 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  home: U(S('M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5', 2.1)),
  list: U(S('M8 7h12M8 12h12M8 17h12', 2.1) + '<circle cx="4.5" cy="7" r="1.3" fill="currentColor"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor"/><circle cx="4.5" cy="17" r="1.3" fill="currentColor"/>'),
  bell: U(S('M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5H5zM10 20.5h4', 2)),
  lock: U('<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/>' + S('M8 10.5V8a4 4 0 018 0v2.5', 2.2)),
  snow: U(S('M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6.5l2.5-2M9.5 19.5L12 17.5l2.5 2', 1.8)),
  check: U(S('M5 12.5l4.5 4.5L19 7.5', 2.6)),
  backspace: U(S('M9 5h10.5A1.5 1.5 0 0121 6.5v11a1.5 1.5 0 01-1.5 1.5H9L3 12zM11.5 9.5l5 5M16.5 9.5l-5 5', 2)),
  pin: U('<path fill="currentColor" d="M12 2.5a6.5 6.5 0 016.5 6.5c0 4.9-6.5 12.5-6.5 12.5S5.5 13.9 5.5 9A6.5 6.5 0 0112 2.5zm0 4a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>'),
  nav: U('<path fill="currentColor" d="M20.5 3.5L3.5 11l7.2 2.3 2.3 7.2z"/>'),
  phone: U('<path fill="currentColor" d="M7.4 3.1c.7-.4 1.6-.1 2 .6l1.4 2.5c.4.7.2 1.5-.4 2l-1 .8a9 9 0 004.1 4.2l.9-1c.5-.6 1.4-.7 2-.3l2.5 1.5c.7.4.9 1.3.5 2l-.9 1.4c-.5.9-1.6 1.4-2.6 1.3C9 17.4 3.7 11.9 2.9 5.2c-.1-1 .4-2 1.2-2.5z"/>'),
  message: U('<path fill="currentColor" d="M6.5 4h11A3.5 3.5 0 0121 7.5v6a3.5 3.5 0 01-3.5 3.5H11l-4.5 3.6.7-3.7A3.5 3.5 0 013 13.5v-6A3.5 3.5 0 016.5 4z"/>'),
  dollar: U(S('M12 3.5v17M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4.3 1.3-4.3 3.2 0 4.5 9.1 2.4 9.1 7 0 2-1.9 3.3-4.8 3.3-2.3 0-4-.8-4.8-2.3', 2.1)),
  camera: U('<path fill="currentColor" d="M8.5 4.5h7l1.5 2.5h2.5A2.5 2.5 0 0122 9.5v8a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 17.5v-8A2.5 2.5 0 014.5 7H7zM12 9.5a4 4 0 100 8 4 4 0 000-8z"/>'),
  flip: U(S('M4 10a8 8 0 0114.5-3.5L20 8M20 4v4h-4M20 14a8 8 0 01-14.5 3.5L4 16M4 20v-4h4', 1.9)),
  map: U(S('M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13', 1.8)),
  star: U('<path fill="currentColor" d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.8l-5.6 3.2 1.3-6.3L2.9 9.4l6.4-.7z"/>'),
  heart: U('<path fill="currentColor" d="M12 20.5S3.5 15 3.5 9A4.5 4.5 0 0112 6.6 4.5 4.5 0 0120.5 9c0 6-8.5 11.5-8.5 11.5z"/>'),
  heartLine: U(S('M12 20.5S3.5 15 3.5 9A4.5 4.5 0 0112 6.6 4.5 4.5 0 0120.5 9c0 6-8.5 11.5-8.5 11.5z', 1.9)),
  face: U(S('M8 3.5H5.5a2 2 0 00-2 2V8M16 3.5h2.5a2 2 0 012 2V8M8 20.5H5.5a2 2 0 01-2-2V16M16 20.5h2.5a2 2 0 002-2V16M9 9v1.5M15 9v1.5M12 9.5v3.5h-1M9 16c1.8 1.4 4.2 1.4 6 0', 1.8)),
  shield: U(S('M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z', 1.9)),
  sun: U('<circle cx="12" cy="12" r="4.4" fill="currentColor"/>' + S('M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5', 1.9)),
  moon: U('<path fill="currentColor" d="M14.5 3a8.8 8.8 0 106.6 13.9A7.4 7.4 0 0114.5 3z"/>'),
  cloud: U('<path fill="currentColor" d="M7.5 19a4.5 4.5 0 01-.4-9 6.3 6.3 0 0112.1 1.6A3.8 3.8 0 0118.5 19z"/>'),
  rain: U('<path fill="currentColor" d="M7.5 15a4.5 4.5 0 01-.4-9 6.3 6.3 0 0112.1 1.6A3.8 3.8 0 0118.5 15z"/>' + S('M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5', 1.8)),
  storm: U('<path fill="currentColor" d="M7.5 14a4.5 4.5 0 01-.4-9 6.3 6.3 0 0112.1 1.6A3.8 3.8 0 0118.5 14z"/><path fill="#ffd34d" d="M12.5 13l-3.5 5h3l-1 4 4.5-6h-3l1.2-3z"/>'),
  fog: U(S('M4 9h16M6 13h12M4 17h16', 2)),
  drop: U('<path fill="currentColor" d="M12 3s6.5 7.2 6.5 11.5a6.5 6.5 0 01-13 0C5.5 10.2 12 3 12 3z"/>'),
  wind: U(S('M3 9h11a3 3 0 10-3-3M3 14h15a3 3 0 11-3 3M3 19h7', 1.9)),
  wave: U(S('M2.5 14c2.4-3.6 4.4-3.6 6.6 0s4.4 3.6 6.6 0 4.4-3.6 6.6 0', 2)),
  briefcase: U('<path fill="currentColor" d="M9 4h6a2 2 0 012 2v1.5h2.5A2.5 2.5 0 0122 10v8.5a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 18.5V10a2.5 2.5 0 012.5-2.5H7V6a2 2 0 012-2zm0 2v1.5h6V6z"/>'),
  store: U('<path fill="currentColor" d="M4 4h16l1.5 5a3 3 0 01-5.2 2 3 3 0 01-4.3.1A3 3 0 017.7 11 3 3 0 012.5 9zM4.5 13h15v7.5h-5v-5h-5v5h-5z"/>'),
  bag: U('<path fill="currentColor" d="M7.5 8V7a4.5 4.5 0 019 0v1h2.3l.9 12.5H4.3L5.2 8zm2 0h5V7a2.5 2.5 0 00-5 0z"/>'),
  cup: U('<path fill="currentColor" d="M5 7h12v6.5A5.5 5.5 0 0111.5 19h-1A5.5 5.5 0 015 13.5zm12 1.5h1a3 3 0 010 6h-1.3c.2-.6.3-1.3.3-2v-.5h1a1 1 0 000-2h-1zM4 20.5h14v1.5H4z"/>'),
  fuel: U('<path fill="currentColor" d="M5 3.5h8a1.5 1.5 0 011.5 1.5v15.5h-11V5A1.5 1.5 0 015 3.5zm1.5 2v5h5v-5zM15.5 8l3 3v7a1.5 1.5 0 01-3 0v-3h-1v-2h1.5a1.5 1.5 0 011.5 1.5v3.5h.1V11.8l-2.6-2.6z"/>'),
  ticket: U('<path fill="currentColor" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v2.5a2.5 2.5 0 000 5V17a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.5a2.5 2.5 0 000-5zm6 1v1.6h1.6V8zm0 3.2v1.6h1.6v-1.6zm0 3.2V16h1.6v-1.6z"/>'),
  cross: U('<path fill="currentColor" d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>'),
  coins: U('<ellipse cx="9" cy="7" rx="6" ry="2.6" fill="currentColor"/><path fill="currentColor" d="M3 8.6c1.1 1.2 3.4 2 6 2s4.9-.8 6-2V11c0 1.4-2.7 2.6-6 2.6S3 12.4 3 11zM3 13.3c1.1 1.2 3.4 2 6 2 .6 0 1.2 0 1.8-.1-.2.5-.3 1-.3 1.6v.7c-.5.1-1 .1-1.5.1-3.3 0-6-1.2-6-2.6z"/><circle cx="16.5" cy="16.5" r="5" fill="currentColor"/>'),
  sparkle: U('<path fill="currentColor" d="M12 2.5l1.8 5.7 5.7 1.8-5.7 1.8L12 17.5l-1.8-5.7L4.5 10l5.7-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>'),
  alert: U('<path fill="currentColor" d="M10.3 3.9a2 2 0 013.4 0l8 13.6A2 2 0 0120 20.5H4a2 2 0 01-1.7-3zM11 9v5h2V9zm0 6.5V17.5h2v-2z"/>'),
  percent: U(S('M18 6L6 18', 2.2) + '<circle cx="7" cy="7" r="2.6" fill="currentColor"/><circle cx="17" cy="17" r="2.6" fill="currentColor"/>'),
  bills: U('<rect x="2.5" y="6" width="19" height="12" rx="2" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="var(--tile-ink,#fff)"/>'),
  keypad: U('<g fill="currentColor"><circle cx="6" cy="5" r="1.8"/><circle cx="12" cy="5" r="1.8"/><circle cx="18" cy="5" r="1.8"/><circle cx="6" cy="11" r="1.8"/><circle cx="12" cy="11" r="1.8"/><circle cx="18" cy="11" r="1.8"/><circle cx="6" cy="17" r="1.8"/><circle cx="12" cy="17" r="1.8"/><circle cx="18" cy="17" r="1.8"/><circle cx="12" cy="22" r="1.5"/></g>'),
  clock: U('<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2"/>' + S('M12 7v5.2l3.4 2', 2)),
  person: U('<circle cx="12" cy="8" r="4.2" fill="currentColor"/><path fill="currentColor" d="M3.8 20.5c.9-4.2 4.2-6.5 8.2-6.5s7.3 2.3 8.2 6.5z"/>'),
  info: U('<circle cx="12" cy="12" r="9.3" fill="currentColor"/><path fill="var(--tile-ink,#fff)" d="M11 10.5h2V17h-2zM12 6.4a1.3 1.3 0 110 2.6 1.3 1.3 0 010-2.6z"/>'),
  moonSmall: U('<path fill="currentColor" d="M13.5 4.5a7.5 7.5 0 106 11.9 6.3 6.3 0 01-6-11.9z"/>'),
  speaker: U('<path fill="currentColor" d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/>' + S('M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11', 1.8)),
  cursor: U('<path fill="currentColor" d="M6 3.5l12 8.4-5.2 1.1 3 5.9-2.4 1.2-3-5.9L6.5 17.8z"/>'),
  paint: U('<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="8.3" cy="10" r="1.7" fill="var(--tile-ink,#fff)"/><circle cx="12" cy="7.5" r="1.7" fill="var(--tile-ink,#fff)"/><circle cx="15.8" cy="10" r="1.7" fill="var(--tile-ink,#fff)"/>'),
  photo: U('<rect x="3" y="5" width="18" height="14" rx="2.6" fill="currentColor"/><path fill="var(--tile-ink,#fff)" d="M6 16.5l3.6-4.4 2.6 3 2-2.2 3.8 3.6z"/><circle cx="15.8" cy="9" r="1.6" fill="var(--tile-ink,#fff)"/>'),
  share: U(S('M12 14V3.5M8 7.5l4-4 4 4M6.5 10.5H5.5A1.5 1.5 0 004 12v7.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V12a1.5 1.5 0 00-1.5-1.5h-1', 1.9)),
  dots: U('<g fill="currentColor"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></g>'),
  signal: U(''),
};

// status bar
export function signalBars(n) {
  let s = '';
  for (let i = 0; i < 4; i++) s += `<rect x="${i * 4.6}" y="${9 - (i + 1) * 2.25}" width="3.1" height="${(i + 1) * 2.25 + 0.4}" rx=".9" fill="currentColor" opacity="${i < n ? 1 : 0.3}"/>`;
  return `<svg viewBox="0 0 17.5 10" aria-hidden="true">${s}</svg>`;
}
export function batteryIcon(level, charging = false) {
  const w = Math.max(1.5, 18.6 * Math.min(1, Math.max(0, level / 100)));
  const col = level <= 20 && !charging ? '#ff453a' : 'currentColor';
  return `<svg viewBox="0 0 27 13" aria-hidden="true"><rect x=".6" y=".6" width="23" height="11.8" rx="3.6" fill="none" stroke="currentColor" stroke-opacity=".38" stroke-width="1.1"/><rect x="2.4" y="2.4" width="${w.toFixed(2)}" height="8.2" rx="2.1" fill="${col}"/><path d="M25 4.4v4.2c.9-.3 1.4-1.1 1.4-2.1s-.5-1.8-1.4-2.1z" fill="currentColor" fill-opacity=".45"/>${charging ? '<path d="M13.6 2.2l-4 5h2.8l-1 3.6 4.1-5.1h-2.9z" fill="#fff" stroke="#000" stroke-opacity=".25" stroke-width=".5"/>' : ''}</svg>`;
}
export const wifiIcon = '<svg viewBox="0 0 16 12" aria-hidden="true"><path fill="currentColor" d="M8 2.6c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 008 .8 10.4 10.4 0 00.8 3.7L2 5c1.6-1.5 3.7-2.4 6-2.4zm0 3.5c1.4 0 2.6.5 3.5 1.4l1.2-1.3A6.7 6.7 0 008 4.3c-1.8 0-3.5.7-4.7 1.9l1.2 1.3c.9-.9 2.1-1.4 3.5-1.4zM8 9.6l-2.2-2.3a3.1 3.1 0 014.4 0z"/></svg>';

/** Category of a ledger entry -> [glyph, tile color]. */
export function categoryLook(e) {
  const c = String(e?.category || ''), m = String(e?.memo || '').toLowerCase(), p = String(e?.party || '').toLowerCase();
  if (c === 'wire') return ['send', '#5b6cff'];
  if (c === 'transfer') return [/deposit/.test(m) ? 'deposit' : /withdraw/.test(m) ? 'withdraw' : 'transfer', '#7c8494'];
  if (c === 'wages' || c === 'jobs' || c === 'income') return ['briefcase', '#1fae64'];
  if (c === 'tips') return ['coins', '#1fae64'];
  if (c === 'business') return ['store', '#d9822b'];
  if (c === 'fines' || c === 'court') return ['ticket', '#e5484d'];
  if (c === 'medical') return ['cross', '#e5484d'];
  if (c === 'insurance') return ['shield', '#3e7bd6'];
  if (c === 'loan') return ['coins', '#8a5cf5'];
  if (c === 'interest') return ['sparkle', '#1fae64'];
  if (c === 'fees') return ['percent', '#7c8494'];
  if (c === 'lost') return ['alert', '#e5484d'];
  if (c === 'cash_in' || c === 'cash_out') return ['bills', '#2fa36b'];
  if (/fuel|gas/.test(c + m + p)) return ['fuel', '#3e7bd6'];
  if (/food|drink|cafe|coffee|bar|restaurant|diner|burger|taco|pizza|cafecito/.test(c + ' ' + m + ' ' + p)) return ['cup', '#ef6c3d'];
  if (/rent|property|house|home/.test(c + m)) return ['home', '#8a5cf5'];
  return ['bag', '#e0469b'];
}
