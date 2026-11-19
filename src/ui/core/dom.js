// SOUTHLINE UI: small DOM and formatting helpers shared by every UI module.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** el('div', 'cls', '<b>html</b>') or el('div', { class, text, html, attrs..., on: { click } }, ...children) */
export function el(tag, a, ...kids) {
  const e = document.createElement(tag);
  if (typeof a === 'string') {
    if (a) e.className = a;
    if (typeof kids[0] === 'string') {
      e.innerHTML = kids.shift();
    }
  } else if (a && typeof a === 'object' && !(a instanceof Node)) {
    for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
      else e.setAttribute(k, v === true ? '' : v);
    }
  } else if (a instanceof Node) kids.unshift(a);
  for (const k of kids) if (k != null && k !== false) e.append(k);
  return e;
}
export const qs = (root, sel) => root.querySelector(sel);
export const qsa = (root, sel) => [...root.querySelectorAll(sel)];
/** Re-trigger a CSS animation class. */
export function retrigger(e, cls) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

// ---- formatting ----
export const fmtMoney = (v, { cents = false } = {}) =>
  (v < 0 ? '-$' : '$') +
  Math.abs(cents ? Math.round(v * 100) / 100 : Math.round(v)).toLocaleString(
    'en-US',
    cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined,
  );
export const fmtMoneyShort = (v) => {
  const a = Math.abs(v),
    s = v < 0 ? '-$' : '$';
  return a >= 1e9
    ? s + (a / 1e9).toFixed(2) + 'B'
    : a >= 1e6
      ? s + (a / 1e6).toFixed(2) + 'M'
      : a >= 1e4
        ? s + (a / 1e3).toFixed(1) + 'K'
        : s + Math.round(a).toLocaleString('en-US');
};
const wrap24 = (t) => ((num(t, 9) % 24) + 24) % 24;
/** Clock text for hours-float t. h12=true gives "6:42 PM". */
export function fmtClock(t, h12 = true) {
  t = wrap24(t);
  let h = Math.floor(t);
  const m = Math.floor((t - h) * 60 + 1e-6);
  if (!h12) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
export function fmtClockParts(t, h12 = true) {
  const s = fmtClock(t, h12);
  const i = s.indexOf(' ');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** Distance text following the units setting ('imperial' | 'metric'). */
export function fmtDist(m, units = 'imperial') {
  m = Math.max(0, num(m));
  if (units === 'metric')
    return m >= 1000
      ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km'
      : Math.round(m / 10) * 10 + ' m';
  const ft = m * 3.28084,
    mi = m / 1609.344;
  return mi >= 0.1
    ? mi.toFixed(mi >= 10 ? 0 : 1) + ' mi'
    : Math.max(10, Math.round(ft / 10) * 10) + ' ft';
}
export const speedFromKmh = (kmh, units = 'imperial') =>
  units === 'metric' ? kmh : kmh * 0.621371;
export const speedUnit = (units = 'imperial') => (units === 'metric' ? 'KM/H' : 'MPH');
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(num(sec)));
  const h = Math.floor(sec / 3600),
    m = Math.floor(sec / 60) % 60,
    s = sec % 60;
  return h
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : m
      ? `${m}m ${String(s).padStart(2, '0')}s`
      : `${s}s`;
}
export function fmtEta(sec) {
  sec = Math.max(0, num(sec));
  const m = Math.round(sec / 60);
  return m < 1 ? '<1 min' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}
export function hashHue(t) {
  let h = 0;
  for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
export function hash32(t) {
  let h = 2166136261;
  for (const ch of String(t)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/** localStorage JSON with a safe fallback (private mode, quota). */
export const store = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      return false;
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* */
    }
  },
};
/** Tiny event emitter. */
export function emitter() {
  const m = new Map();
  return {
    on(n, f) {
      let a = m.get(n);
      if (!a) m.set(n, (a = new Set()));
      a.add(f);
      return () => a.delete(f);
    },
    emit(n, d) {
      const a = m.get(n);
      if (a)
        for (const f of [...a]) {
          try {
            f(d);
          } catch (e) {
            console.error('[ui event ' + n + ']', e);
          }
        }
    },
  };
}
