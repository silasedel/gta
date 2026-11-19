// Car radio selector (W2, Nov 19 playtest: "a good-looking radio wheel or bar with station icons at the top").
// A bar at the top of the screen with every station's icon; it slides in when the player changes station (. / , while in a
// vehicle, the same keys core/audio.js switches on), highlights the one tuned in and fades out ~2.4 s later.
// Station order and the "off" slot mirror core/audio.js (real stations from /assets/audio/music/index.json, + off), so the
// highlighted tile is the station you hear.  Icons are original SVG art per station id (fallback: a dial in the station color).
// No per-frame cost: DOM work happens only on a key press.  ?radioui=0 = off.
const CSS = `
.sl-radio{position:fixed;left:50%;top:22px;transform:translate(-50%,-16px);display:flex;flex-direction:column;align-items:center;gap:8px;
 opacity:0;transition:opacity .22s ease,transform .22s ease;pointer-events:none;z-index:58;user-select:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.sl-radio.on{opacity:1;transform:translate(-50%,0)}
.sl-radio .row{display:flex;gap:10px;padding:10px 14px;border-radius:18px;background:linear-gradient(180deg,rgba(14,15,20,.78),rgba(8,9,12,.86));
 box-shadow:0 10px 34px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.07)}
.sl-radio .st{position:relative;width:54px;height:54px;border-radius:14px;display:grid;place-items:center;background:#1a1c22;
 box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transform:scale(.86);opacity:.5;filter:saturate(.55);transition:transform .2s,opacity .2s,filter .2s,box-shadow .2s}
.sl-radio .st svg{width:40px;height:40px}
.sl-radio .st.sel{transform:scale(1.08);opacity:1;filter:none;box-shadow:0 0 0 2px var(--c),0 0 22px var(--c),inset 0 0 0 1px rgba(255,255,255,.18)}
.sl-radio .lbl{min-width:220px;padding:7px 16px 8px;border-radius:12px;background:rgba(8,9,12,.82);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);text-align:center;color:#f3f0ea}
.sl-radio .nm{font-weight:800;font-size:15px;letter-spacing:.04em}
.sl-radio .nm i{font-style:normal;color:var(--c);margin-left:6px}
.sl-radio .gn{margin-top:2px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#a7a196}
`;
// original station icons (viewBox 0 0 40 40)
const ICON = {
  latin: (
    c,
  ) => `<svg viewBox="0 0 40 40"><defs><linearGradient id="g-latin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd36b"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
    <circle cx="20" cy="17" r="10" fill="url(#g-latin)"/><path d="M4 27c4-2.5 8-2.5 12 0s8 2.5 12 0 8-2.5 8-2.5" stroke="#fff3d6" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M4 32c4-2.5 8-2.5 12 0s8 2.5 12 0 8-2.5 8-2.5" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".85"/>
    <path d="M28 6c-3 1-5 4-5 8M28 6c2 2 3 5 1 8M28 6c-4-1-8 0-9 3" stroke="#2b7a3d" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  neon: (
    c,
  ) => `<svg viewBox="0 0 40 40"><defs><linearGradient id="g-neon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ad9"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
    <path d="M8 22a12 12 0 0 1 24 0z" fill="url(#g-neon)"/><g stroke="#14121c" stroke-width="1.6"><path d="M8 16h24M8 19h24"/></g>
    <g stroke="${c}" stroke-width="1.3" fill="none" opacity=".95"><path d="M3 24h34M5 28h30M8 33h24M20 24v10M13 24l-5 10M27 24l5 10"/></g></svg>`,
  lowtide: (
    c,
  ) => `<svg viewBox="0 0 40 40"><path d="M27 7a9 9 0 1 0 6 13 7.5 7.5 0 0 1-6-13z" fill="#e9f3ef"/>
    <path d="M3 25c3-3 6-3 9 0s6 3 9 0 6-3 9 0 5 2 7 1" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M6 31c3-2.4 6-2.4 9 0s6 2.4 9 0 6-2.4 9 0" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".6"/>
    <circle cx="12" cy="12" r="1.2" fill="#e9f3ef"/><circle cx="17" cy="7" r=".9" fill="#e9f3ef"/></svg>`,
  off: () => `<svg viewBox="0 0 40 40"><circle cx="20" cy="21" r="11" stroke="#9a958c" stroke-width="2.6" fill="none" stroke-dasharray="52 18" transform="rotate(-62 20 21)"/>
    <path d="M20 7v13" stroke="#e8e4dc" stroke-width="2.8" stroke-linecap="round"/></svg>`,
  dial: (c) =>
    `<svg viewBox="0 0 40 40"><rect x="5" y="11" width="30" height="21" rx="5" fill="${c}"/><circle cx="14" cy="22" r="5" fill="#14151a"/><path d="M24 18h7M24 22h7M24 26h5" stroke="#14151a" stroke-width="2"/><path d="M12 11l14-6" stroke="${c}" stroke-width="2"/></svg>`,
};
const OFF = typeof location !== 'undefined' && /[?&]radioui=0\b/.test(location.search);

export function createRadioUI(game) {
  if (OFF || typeof document === 'undefined') return null;
  let list = [],
    idx = -1,
    el = null,
    hideT = 0;
  fetch('/assets/audio/music/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      // same filter as src/audio/radio.js (a station with no playable track is not on the dial)
      list = (j?.stations || [])
        .filter((s) => (s.tracks || []).some((t) => t.dur > 5))
        .map((s) => ({ id: s.id, name: s.name, genre: s.genre, color: s.color || '#ffd166' }));
    })
    .catch(() => {
      /* no stations: no bar */
    });
  function mount() {
    if (el) return el;
    if (!document.getElementById('sl-radio-css')) {
      const s = document.createElement('style');
      s.id = 'sl-radio-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    el = document.createElement('div');
    el.className = 'sl-radio';
    el.innerHTML =
      '<div class="row"></div><div class="lbl"><div class="nm"></div><div class="gn"></div></div>';
    document.body.appendChild(el);
    return el;
  }
  function show() {
    mount();
    const row = el.querySelector('.row'),
      slots = [{ id: 'off', name: 'Radio off', genre: '', color: '#9a958c' }, ...list];
    if (row.childElementCount !== slots.length)
      row.innerHTML = slots
        .map(
          (s) =>
            `<div class="st" style="--c:${s.color}">${(ICON[s.id] || ICON.dial)(s.color)}</div>`,
        )
        .join('');
    const sel = idx < 0 ? 0 : idx + 1,
      cur = slots[sel];
    [...row.children].forEach((n, i) => n.classList.toggle('sel', i === sel));
    el.style.setProperty('--c', cur.color);
    const m = /^(.*?)\s*([\d.]+)$/.exec(cur.name || '');
    el.querySelector('.nm').innerHTML = m ? `${m[1]}<i>${m[2]}</i>` : cur.name || '';
    el.querySelector('.gn').textContent = cur.genre || (idx < 0 ? 'silence' : '');
    el.classList.add('on');
    clearTimeout(hideT);
    hideT = setTimeout(() => el && el.classList.remove('on'), 2400);
  }
  addEventListener('keydown', (e) => {
    if (e.code !== 'Period' && e.code !== 'Comma') return;
    const st = game.player?.state;
    if (!st?.inVehicle || !list.length) return;
    const n = list.length + 1; // + off (core/audio.js radio.idx rule)
    idx = ((idx + 1 + (e.code === 'Period' ? 1 : -1) + n) % n) - 1;
    show();
  });
  return {
    show,
    get index() {
      return idx;
    },
  };
}
