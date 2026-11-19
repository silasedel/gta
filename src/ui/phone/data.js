// SOUTHLINE phone: contacts, message threads and the phone's own save slice. DOM-free (the wire test runs it in Node).
// Contacts come from the game's real systems where they exist (story cast seed, side-job clients, business staff) plus
// a small fixed in-world cast. Phone numbers use the 555-01xx block that is reserved for fiction.

export const PHONE_SAVE_KEY = 'phone';
const THREAD_KEEP = 60,
  THREADS_MAX = 40;

const hue = (s) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
};
const initials = (n) =>
  String(n)
    .replace(/["“”]/g, '')
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '#';
const num555 = (i) => `(305) 555-01${String(10 + (i % 90)).padStart(2, '0')}`;
// valid ABA routing numbers (3-7-1 checksum) for in-world banks
export function abaValid(r) {
  const s = String(r || '');
  if (!/^\d{9}$/.test(s)) return false;
  const d = [...s].map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}
function makeRouting(seed) {
  let h = hue(seed) * 7919 + 1301;
  const d = [];
  for (let i = 0; i < 8; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    d.push((h >>> 16) % 10);
  }
  d[0] = 0;
  d[1] = 6 + (d[1] % 4); // Florida-ish Federal Reserve prefix 06xx
  for (let c = 0; c < 10; c++) {
    const t = [...d, c];
    if (abaValid(t.join(''))) return t.join('');
  }
  return '063100277';
}

// fixed in-world cast (Key Paloma / Miami). `kind` drives the money hooks in wire.js.
const CAST = [
  {
    id: 'rafa',
    name: 'Tío Rafa',
    role: 'Charter captain',
    place: 'Key Paloma dock',
    kind: 'family',
    fav: true,
  },
  {
    id: 'lucia',
    name: 'Abuela Lucía',
    role: 'Family',
    place: 'Key Paloma',
    kind: 'family',
    fav: true,
  },
  {
    id: 'marisol',
    name: 'Marisol Vega',
    role: 'Fixer',
    place: 'Overtown',
    kind: 'fixer',
    fav: true,
  },
  { id: 'tiny', name: '"Tiny" Okafor', role: 'Garage', place: 'Little Havana', kind: 'garage' },
  {
    id: 'mirta',
    name: 'Mirta',
    role: 'Walk-up window, Calle Ocho',
    place: 'Little Havana',
    kind: 'friend',
  },
  { id: 'dre', name: 'Dre Castillo', role: 'Knows a guy', place: 'Overtown', kind: 'friend' },
  {
    id: 'inez',
    name: 'Captain Inez',
    role: 'Yacht captain',
    place: 'Miami Beach Marina',
    kind: 'friend',
  },
  { id: 'anand', name: 'Dr. Anand', role: 'Southline General', place: 'Downtown', kind: 'service' },
  {
    id: 'hush',
    name: 'Hush Line',
    role: 'Discreet problem solving',
    place: 'Unlisted',
    kind: 'hush',
    number: 'Unknown',
  },
  { id: 'mom', name: 'Mom', role: 'Family', place: 'Kendall', kind: 'family', fav: true },
];

export function createPhoneData(game) {
  const S = defaults();
  function defaults() {
    return {
      v: 1,
      threads: {},
      read: {},
      recents: [],
      calls: [],
      payees: [],
      wires: { day: 0, instant: 0, wire: 0 },
      hushCredit: 0,
      tinyTab: 350,
      balHist: {},
      seq: 0,
      seeded: false,
      likes: {},
    };
  }
  const now = () =>
    Number.isFinite(game.time?.now)
      ? game.time.now
      : ((game.time?.day || 1) - 1) * 1440 + (Number(game.timeOfDay) || 12) * 60;
  const listeners = new Set();
  const changed = (what) => {
    for (const f of listeners) {
      try {
        f(what);
      } catch (e) {
        console.error('[phone data]', e);
      }
    }
  };

  // ---------------------------------------------------------------- contacts
  let cache = null,
    cacheAt = -1;
  function contacts() {
    const t = Math.floor(now() / 30);
    if (cache && cacheAt === t) return cache;
    const out = [],
      seen = new Set();
    const add = (c) => {
      if (!c?.name || seen.has(c.id)) return;
      seen.add(c.id);
      const i = out.length;
      out.push({
        number: num555(hue(c.id) + i),
        initials: initials(c.name),
        hue: hue(c.id),
        routing: makeRouting(c.id),
        account: '•••• ' + String(1000 + ((hue(c.id + 'acct') * 37) % 9000)).slice(-4),
        ...c,
      });
    };
    CAST.forEach(add);
    for (const c of Array.isArray(game.contactsSeed) ? game.contactsSeed : [])
      add({
        id: String(c.id),
        name: c.name,
        role: c.role || '',
        place: c.place || '',
        kind: 'friend',
      });
    // side-job clients
    try {
      for (const j of game.jobs?.list || [])
        if (j?.client && !/worried/i.test(j.client))
          add({
            id: 'job:' + j.id,
            name: j.client,
            role: j.name,
            place: 'Side jobs',
            kind: 'client',
            job: j.id,
          });
    } catch (e) {
      /* jobs not loaded */
    }
    // business staff (bonus by wire)
    try {
      for (const b of game.business?.owned?.() || [])
        for (const s of b.staff || [])
          add({
            id: `staff:${b.id}:${s.id}`,
            name: s.name,
            role: `${cap(s.role)} · ${b.name}`,
            place: b.name,
            kind: 'staff',
            bizId: b.id,
            staffId: s.id,
          });
    } catch (e) {
      /* no businesses */
    }
    for (const p of S.payees) add({ ...p, kind: 'payee', payee: true });
    cache = out;
    cacheAt = t;
    return out;
  }
  const contact = (id) =>
    contacts().find((c) => c.id === id) ||
    (id === 'bank'
      ? bankContact()
      : id === 'city'
        ? { id: 'city', name: 'Southline Traffic', initials: 'ST', hue: 210, kind: 'service' }
        : null);
  function bankContact() {
    return {
      id: 'bank',
      name:
        game.bank?.name && game.bank.name !== 'your bank'
          ? `${game.bank.name} Alerts`
          : 'Bank Alerts',
      initials: '$',
      hue: 222,
      kind: 'service',
      number: '72-622',
    };
  }
  const cap = (s) =>
    String(s || '')
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());

  // ---------------------------------------------------------------- threads
  function thread(id) {
    return (S.threads[id] ||= []);
  }
  function addMessage(id, text, o = {}) {
    if (!id || !text) return null;
    const t = thread(id);
    const m = {
      id: ++S.seq,
      from: o.from || 'them',
      text: String(text),
      t: o.t ?? now(),
      kind: o.kind || null,
      data: o.data || null,
      ...(o.silent ? { silent: true } : {}),
    };
    t.push(m);
    if (t.length > THREAD_KEEP) t.splice(0, t.length - THREAD_KEEP);
    if (m.from === 'me') S.read[id] = m.id;
    const ids = Object.keys(S.threads);
    if (ids.length > THREADS_MAX) {
      ids.sort((a, b) => lastT(a) - lastT(b));
      for (const k of ids.slice(0, ids.length - THREADS_MAX)) {
        delete S.threads[k];
        delete S.read[k];
      }
    }
    changed({ kind: 'message', id, message: m });
    return m;
  }
  const lastT = (id) => {
    const t = S.threads[id];
    return t?.length ? t[t.length - 1].t : -1;
  };
  const unread = (id) => {
    const t = S.threads[id] || [],
      r = S.read[id] || 0;
    let n = 0;
    for (const m of t) if (m.from !== 'me' && m.id > r) n++;
    return n;
  };
  const markRead = (id) => {
    const t = S.threads[id];
    if (t?.length) {
      S.read[id] = t[t.length - 1].id;
      changed({ kind: 'read', id });
    }
  };
  const totalUnread = () => Object.keys(S.threads).reduce((s, id) => s + unread(id), 0);
  function threadList() {
    return Object.keys(S.threads)
      .filter((id) => S.threads[id].length)
      .sort((a, b) => lastT(b) - lastT(a))
      .map((id) => ({
        id,
        contact: contact(id) || { id, name: id, initials: '?', hue: 0 },
        last: S.threads[id][S.threads[id].length - 1],
        unread: unread(id),
      }));
  }

  function seed() {
    if (S.seeded) return;
    S.seeded = true;
    const t0 = now();
    addMessage('marisol', 'Got a job on the boardwalk. Bring a fast car, keep it clean.', {
      t: t0 - 300,
      silent: true,
    });
    addMessage('marisol', 'On my way. Which pier?', { from: 'me', t: t0 - 290, silent: true });
    addMessage('marisol', "Pier 7. After sunset. Don't be late, sunshine.", {
      t: t0 - 280,
      silent: true,
    });
    addMessage(
      'tiny',
      `That coupe you scratched? It's on your tab. $${S.tinyTab}. Wire it whenever, I know where you live.`,
      { t: t0 - 200, silent: true },
    );
    addMessage('rafa', 'Bring my cooler back and DO NOT sell the skiff. Call your mother.', {
      t: t0 - 900,
      silent: true,
    });
    addMessage('mom', 'Did you eat today? Rafa says you never call.', { t: t0 - 60, silent: true });
    S.read.rafa = S.threads.rafa[S.threads.rafa.length - 1].id;
  }

  // ---------------------------------------------------------------- balance history (end-of-day snapshots)
  function snapshot() {
    const B = game.bank;
    if (!B) return;
    const day = game.time?.day || 1;
    S.balHist[day] = Math.round(((Number(B.balance) || 0) + (Number(B.savings) || 0)) * 100) / 100;
    const keys = Object.keys(S.balHist)
      .map(Number)
      .sort((a, b) => a - b);
    while (keys.length > 60) delete S.balHist[keys.shift()];
  }
  /** Bank (checking + savings) balance at the end of each of the last `days` game days, oldest first. */
  function balanceSeries(days = 14) {
    const B = game.bank,
      today = game.time?.day || 1;
    const out = [];
    const ledger = Array.isArray(B?.ledger) ? B.ledger : [];
    // balance per account after the last entry of each day
    const endOf = { checking: {}, savings: {} };
    for (const e of ledger)
      if (e.account === 'checking' || e.account === 'savings') endOf[e.account][e.day] = e.balance;
    const firstOf = (acc) => ledger.find((e) => e.account === acc);
    const base = {
      checking: firstOf('checking')
        ? firstOf('checking').balance - firstOf('checking').amount
        : Number(B?.balance) || 0,
      savings: firstOf('savings')
        ? firstOf('savings').balance - firstOf('savings').amount
        : Number(B?.savings) || 0,
    };
    const lastKnown = (acc, d) => {
      let v = null;
      for (const k of Object.keys(endOf[acc])) {
        const kd = Number(k);
        if (kd <= d && (v == null || kd >= v.d)) v = { d: kd, b: endOf[acc][k] };
      }
      return v ? v.b : base[acc];
    };
    const ledgerFrom = ledger.length ? ledger[0].day : Infinity;
    for (let d = today - days + 1; d <= today; d++) {
      let v;
      if (d === today) v = (Number(B?.balance) || 0) + (Number(B?.savings) || 0);
      else if (d < ledgerFrom && S.balHist[d] != null)
        v = S.balHist[d]; // older than the ledger keeps: daily snapshot
      else v = lastKnown('checking', d) + lastKnown('savings', d);
      out.push({ day: d, v: Math.round(v * 100) / 100 });
    }
    return out;
  }

  // ---------------------------------------------------------------- save slice
  const slice = {
    version: 1,
    order: 75,
    save: () => JSON.parse(JSON.stringify(S)),
    load: (d) => {
      const fresh = defaults();
      for (const k of Object.keys(S)) delete S[k];
      Object.assign(S, fresh);
      if (d && typeof d === 'object')
        for (const k of Object.keys(fresh))
          if (d[k] !== undefined) S[k] = JSON.parse(JSON.stringify(d[k]));
      cache = null;
      seed();
      changed({ kind: 'load' });
    },
  };
  // the HUD (and so the phone) is built before the core systems: register the slice as soon as game.save exists
  let regTries = 0;
  const register = () => {
    if (game.save?.register) {
      try {
        game.save.register(PHONE_SAVE_KEY, slice);
      } catch (e) {
        console.warn('[phone] save slice', e);
      }
      return;
    }
    if (++regTries < 1200) setTimeout(register, 500);
  };
  register();

  return {
    S,
    contacts,
    contact,
    thread,
    addMessage,
    unread,
    markRead,
    totalUnread,
    threadList,
    seed,
    snapshot,
    balanceSeries,
    slice,
    on: (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    invalidate: () => {
      cache = null;
    },
    now,
    addPayee(p) {
      const id = 'payee:' + p.routing + ':' + p.accountNo;
      const e = {
        id,
        name: p.name,
        role: 'Saved payee',
        place: `Routing ${p.routing}`,
        routing: p.routing,
        accountNo: p.accountNo,
        account: '•••• ' + String(p.accountNo).slice(-4),
      };
      S.payees = S.payees.filter((x) => x.id !== id);
      S.payees.push(e);
      if (S.payees.length > 12) S.payees.shift();
      cache = null;
      return id;
    },
    pushRecent(id) {
      S.recents = [id, ...S.recents.filter((x) => x !== id)].slice(0, 8);
    },
  };
}
