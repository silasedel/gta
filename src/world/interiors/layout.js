// Parametric store layout engine (INTERIORS agent).
// Local frame: x across the frontage [-W/2, W/2], z depth [-D/2, D/2], storefront/door wall at z = +D/2.
// Templates are data: a list of steps (counter placement, wall runs, fills). The engine places axis-aligned
// fixtures with overlap checks so any interior box size works, then builds a walk grid for patrons.
import { srng } from './types.js';

const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

// ---- templates ----------------------------------------------------------------------------------------------
// counter: where the till goes; walls: [wall, fixtureKind, opts]; fill: interior region filler.
const T = {
  'aisles-z': (r, t) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', t === 'grocery' ? 'fridge' : 'fridge', { mix: t === 'grocery' ? 'dairy' : 'drinks', alt: t === 'grocery' ? 'frozen' : 'beer' }], [r() < 0.5 ? 'left' : 'right', t === 'grocery' ? 'produce' : 'wallshelf', { mix: t === 'grocery' ? 'produce' : 'snacks' }], ['*', 'wallshelf', { mix: 'grocery' }]], fill: ['aisles', { axis: 'z', mix: t }], extras: ['mags', 'endcaps'] }),
  'aisles-x': (r, t) => ({ counter: pick(r, ['front-left', 'front-right', 'side-left', 'side-right']), walls: [['back', 'fridge', { mix: t === 'grocery' ? 'frozen' : 'drinks', alt: 'dairy' }], ['*', 'wallshelf', { mix: t }]], fill: ['aisles', { axis: 'x', mix: t }], extras: ['mags'] }),
  perimeter: (r, t) => ({ counter: pick(r, ['front-left', 'front-right', 'back']), walls: [['back', 'fridge', { mix: 'drinks', alt: 'beer' }], ['*', 'wallshelf', { mix: t }]], fill: ['islands', { kind: 'gondola-short', mix: t }], extras: ['mags'] }),
  'liquor-a': (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', 'fridge', { mix: 'beer', alt: 'drinks' }], ['*', 'winerack', {}]], fill: ['aisles', { axis: 'z', mix: 'liquor' }] }),
  'liquor-b': (r) => ({ counter: 'back', walls: [['*', 'wallshelf', { mix: 'liquor', h: 2.2 }]], fill: ['islands', { kind: 'wineisland' }], extras: ['beerstack'] }),
  'pharmacy-a': (r) => ({ counter: pick(r, ['front-left', 'front-right']), rx: 'back', walls: [['*', 'wallshelf', { mix: 'pharmacy' }]], fill: ['aisles', { axis: 'z', mix: 'pharmacy' }], extras: ['fridge-small'] }),
  'pharmacy-b': (r) => ({ counter: pick(r, ['front-left', 'front-right']), rx: pick(r, ['side-left', 'side-right']), walls: [['back', 'fridge', { mix: 'drinks' }], ['*', 'wallshelf', { mix: 'pharmacy' }]], fill: ['aisles', { axis: 'x', mix: 'pharmacy' }] }),
  'electronics-a': (r) => ({ counter: pick(r, ['back', 'side-left', 'side-right']), walls: [['back', 'tvwall', {}], [r() < 0.5 ? 'left' : 'right', 'pegwall', {}], ['*', 'wallshelf', { mix: 'electronics' }]], fill: ['islands', { kind: 'demotable' }] }),
  'electronics-b': (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', 'tvwall', {}], ['*', 'glasswall', { mix: 'phones' }]], fill: ['islands', { kind: 'demotable' }], extras: ['consoles'] }),
  'clothing-a': (r) => ({ counter: pick(r, ['back', 'side-left', 'side-right']), walls: [['back', 'fitting', {}], ['*', 'garmentwall', {}]], fill: ['racks', {}], extras: ['mannequins', 'foldtables'] }),
  'clothing-b': (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', 'shoewall', {}], ['*', 'garmentwall', {}]], fill: ['islands', { kind: 'foldtable' }], extras: ['mannequins', 'fitting-corner'] }),
  'clothing-c': (r) => ({ counter: 'back', walls: [['*', 'garmentwall', {}]], fill: ['racks', { round: true }], extras: ['mannequins', 'fitting-corner'] }),
  'beauty-a': () => ({ counter: 'back', walls: [['*', 'beautywall', {}]], fill: ['islands', { kind: 'makeupisland' }], extras: ['perfumecase'] }),
  'beauty-b': (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', 'beautywall', {}], ['*', 'beautywall', {}]], fill: ['aisles', { axis: 'z', kind: 'makeupisland' }] }),
  'surf-a': (r) => ({ counter: pick(r, ['back', 'side-left', 'side-right']), walls: [['*', 'boardwall', {}]], fill: ['racks', {}], extras: ['spinner-shades', 'waxtable'] }),
  'surf-b': (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', 'boardwall', {}], ['*', 'garmentwall', {}]], fill: ['islands', { kind: 'boardrack' }], extras: ['spinner-shades'] }),
  'souvenir-a': (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', 'teewall', {}], ['*', 'wallshelf', { mix: 'souvenir' }]], fill: ['islands', { kind: 'souvenirtable' }], extras: ['spinner-cards', 'spinner-shades'] }),
  'souvenir-b': (r) => ({ counter: 'back', walls: [['*', 'teewall', {}]], fill: ['aisles', { axis: 'z', mix: 'souvenir', short: true }], extras: ['spinner-cards'] }),
  icecream: (r) => ({ counter: 'icecase', walls: [['back', 'menuwall', {}]], fill: ['tables', { size: 2 }], extras: ['window-bar'] }),
  'cafe-a': (r) => ({ counter: 'cafe-back', walls: [], fill: ['tables', { size: 2 }], extras: ['window-bar', 'plants'] }),
  'cafe-b': (r) => ({ counter: pick(r, ['cafe-left', 'cafe-right']), walls: [], fill: ['tables', { size: 2 }], extras: ['booths-wall', 'plants'] }),
  diner: (r) => ({ counter: 'diner-back', walls: [], fill: ['booths', {}], extras: [] }),
  'restaurant-a': (r) => ({ counter: 'kitchen-back', walls: [], fill: ['tables', { size: 4 }], extras: ['booths-wall', 'host', 'plants'] }),
  'restaurant-b': (r) => ({ counter: 'kitchen-back', walls: [], fill: ['tables', { size: 4 }], extras: ['host', 'plants', 'smallbar'] }),
  'bar-a': (r) => ({ counter: pick(r, ['bar-left', 'bar-right']), walls: [], fill: ['tables', { size: 2, high: true }], extras: ['booths-wall', 'tvs', 'pool'] }),
  'bar-b': (r) => ({ counter: 'bar-back', walls: [], fill: ['tables', { size: 4, high: r() < 0.5 }], extras: ['booths-wall', 'tvs'] }),
  club: (r) => ({ counter: pick(r, ['bar-left', 'bar-right']), walls: [], fill: ['dance', {}], extras: ['dj', 'lounges', 'speakers'] }),
  'laundry-a': (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['left', 'washers', {}], ['right', 'dryers', {}], ['back', 'washers', {}]], fill: ['islands', { kind: 'foldtable-l' }], extras: ['chairs', 'vending'] }),
  'laundry-b': (r) => ({ counter: 'back', walls: [['left', 'dryers', {}], ['right', 'washers', {}]], fill: ['aisles', { axis: 'z', kind: 'washerisland' }], extras: ['chairs', 'vending'] }),
  bank: (r) => ({ counter: 'teller', walls: [['left', 'deskrow', {}], ['right', 'deskrow', {}]], fill: ['queue', {}], extras: ['atm', 'plants', 'chairs', 'brochure'] }),
  barber: (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [[r() < 0.5 ? 'left' : 'right', 'barberchairs', {}], ['back', 'wallshelf', { mix: 'barber' }]], fill: ['none', {}], extras: ['chairs', 'plants'] }),
  jewelry: (r) => ({ counter: 'back', walls: [['*', 'glasswall', { mix: 'jewelry' }]], fill: ['islands', { kind: 'glasscase', mix: 'jewelry' }], extras: ['plants'] }),
  guns: (r) => ({ counter: 'glass-L', walls: [['back', 'gunwall', {}], ['*', 'pegwall', { mix: 'ammo' }]], fill: ['islands', { kind: 'glasscase', mix: 'pistols' }], extras: ['targets'] }),
  pawn: (r) => ({ counter: 'glass-L', walls: [['back', 'guitarwall', {}], ['*', 'wallshelf', { mix: 'pawn' }]], fill: ['islands', { kind: 'glasscase', mix: 'jewelry' }] }),
  auto: (r, t) => ({ counter: pick(r, ['front-left', 'front-right', 'back']), walls: [['back', t === 'hardware' ? 'wallshelf' : 'tirestack', { mix: t === 'hardware' ? 'hardware' : 'auto', h: 2.2 }], ['*', 'wallshelf', { mix: t === 'hardware' ? 'hardware' : 'auto' }]], fill: ['aisles', { axis: pick(r, ['z', 'x']), mix: t === 'hardware' ? 'hardware' : 'auto' }] }),
  sport: (r) => ({ counter: pick(r, ['front-left', 'front-right']), walls: [['back', 'shoewall', {}], ['*', 'wallshelf', { mix: 'sport' }]], fill: ['racks', {}], extras: ['ballbins'] }),
};

// ---- engine -------------------------------------------------------------------------------------------------
export function generateLayout({ type, layout, W, D, H, doorX = 0, doorW = 2, seed = 1 }) {
  const r = srng(seed);
  const tmpl = (T[layout] || T.perimeter)(r, type);
  const x0 = -W / 2 + 0.12, x1 = W / 2 - 0.12, z0 = -D / 2 + 0.12, z1 = D / 2 - 0.12;
  const fixtures = [], occ = [], keep = [];
  const out = { fixtures, clerks: [], counterPos: null, seats: [], pois: [], W, D, H, doorX, doorW, x0, x1, z0, z1, template: layout };
  // keep-outs: entry, and a strip behind the front windows
  const entryDepth = Math.min(2.6, D * 0.3);
  keep.push({ ax: doorX - doorW / 2 - 0.6, bx: doorX + doorW / 2 + 0.6, az: z1 - entryDepth, bz: z1 + 1 });
  const overl = (a, b, m = 0) => a.ax < b.bx + m && a.bx > b.ax - m && a.az < b.bz + m && a.bz > b.az - m;
  const inside = (q) => q.ax >= x0 - 1e-3 && q.bx <= x1 + 1e-3 && q.az >= z0 - 1e-3 && q.bz <= z1 + 1e-3;
  const rect = (cx, cz, sx, sz) => ({ ax: cx - sx / 2, bx: cx + sx / 2, az: cz - sz / 2, bz: cz + sz / 2 });
  // place a fixture: f = {k, x, z, sx, sz, ...}; returns f or null
  const place = (f, { margin = 0.05, ignoreKeep = false, clear = 0 } = {}) => {
    const q = rect(f.x, f.z, f.sx, f.sz);
    if (!inside(q)) return null;
    for (const o of occ) if (overl(q, o, margin + Math.max(clear, o.clear || 0))) return null;
    if (!ignoreKeep) for (const k of keep) if (overl(q, k, 0)) return null;
    q.clear = clear; q.f = f; occ.push(q); fixtures.push(f); return f;
  };
  out.place = place;

  // ---- counters -------------------------------------------------------------------------------------------
  const C = tmpl.counter;
  const sideCounter = (left, zCenter, len, kind = 'counter') => {
    const sx = 0.75, cx = left ? x0 + 1.25 : x1 - 1.25;
    const f = place({ k: kind, x: cx, z: zCenter, sx, sz: len, face: left ? '+x' : '-x', axis: 'z' }, { ignoreKeep: true, clear: 0.2 });
    if (!f) return null;
    // clerk lane between counter and wall
    place({ k: 'clerkzone', x: left ? x0 + 0.45 : x1 - 0.45, z: zCenter, sx: 0.8, sz: len + 0.4, invisible: true }, { ignoreKeep: true, margin: 0 });
    out.clerks.push({ x: left ? x0 + 0.5 : x1 - 0.5, z: zCenter, ry: left ? Math.PI / 2 : -Math.PI / 2 });
    out.counterPos = { x: cx + (left ? 0.9 : -0.9), z: zCenter };
    return f;
  };
  const backCounter = (xc, len, kind = 'counter', depth = 0.75, gap = 1.1) => {
    const cz = z0 + gap + depth / 2;
    const f = place({ k: kind, x: xc, z: cz, sx: len, sz: depth, face: '+z', axis: 'x' }, { ignoreKeep: true, clear: 0.2 });
    if (!f) return null;
    place({ k: 'clerkzone', x: xc, z: z0 + gap / 2, sx: len + 0.4, sz: gap, invisible: true }, { ignoreKeep: true, margin: 0 });
    out.clerks.push({ x: xc, z: z0 + gap * 0.5, ry: 0 });
    out.counterPos = { x: xc, z: cz + depth / 2 + 0.6 };
    return f;
  };
  const len = (a, b, f) => Math.max(a, Math.min(b, f));
  if (C === 'front-left' || C === 'front-right') sideCounter(C === 'front-left', z1 - entryDepth * 0.5 - len(1.6, 3.2, D * 0.18) / 2 - 0.3, len(1.8, 3.2, D * 0.2));
  else if (C === 'side-left' || C === 'side-right') sideCounter(C === 'side-left', 0, len(2, 3.6, D * 0.25));
  else if (C === 'back') backCounter((r() - 0.5) * W * 0.3, len(2.2, 4.5, W * 0.3));
  else if (C === 'cafe-back') { const f = backCounter(0, len(3, 7, W * 0.55), 'cafecounter', 0.8, 1.2); if (f) out.menu = 'back'; }
  else if (C === 'cafe-left' || C === 'cafe-right') { const f = sideCounter(C === 'cafe-left', -D * 0.1, len(2.6, 5, D * 0.45), 'cafecounter'); if (f) out.menu = C === 'cafe-left' ? 'left' : 'right'; }
  else if (C === 'diner-back') { backCounter(0, len(4, W - 3, W * 0.7), 'dinercounter', 0.8, 1.4); out.kitchen = true; }
  else if (C === 'kitchen-back') { backCounter((r() - 0.5) * W * 0.2, len(3, 6, W * 0.4), 'kitchenpass', 0.6, 1.6); out.kitchen = true; }
  else if (C === 'bar-left' || C === 'bar-right') { sideCounter(C === 'bar-left', -D * 0.05, len(3, D - 3.4, D * 0.6), 'barcounter'); }
  else if (C === 'bar-back') backCounter(0, len(4, W - 2.5, W * 0.65), 'barcounter', 0.8, 1.3);
  else if (C === 'teller') { const n = Math.max(2, Math.min(6, Math.floor((W - 2) / 1.6))); backCounter(0, n * 1.6, 'teller', 0.8, 1.6); out.tellers = n; }
  else if (C === 'icecase') backCounter(0, len(2.8, 6, W * 0.5), 'icecase', 0.9, 1.1);
  else if (C === 'glass-L') { sideCounter(r() < 0.5, -D * 0.05, len(2.4, D - 4, D * 0.5), 'glasscounter'); }
  if (tmpl.rx) { // pharmacy Rx counter
    if (tmpl.rx === 'back') { const f = place({ k: 'rxcounter', x: (r() - 0.5) * W * 0.2, z: z0 + 1.6, sx: len(2.4, 4, W * 0.3), sz: 0.7, face: '+z', axis: 'x' }, { ignoreKeep: true, clear: 0.2 }); if (f) { place({ k: 'clerkzone', x: f.x, z: z0 + 0.6, sx: f.sx + 0.4, sz: 1.2, invisible: true, back: true }, { ignoreKeep: true, margin: 0 }); out.clerks.push({ x: f.x, z: z0 + 0.8, ry: 0 }); } }
    else sideCounter(tmpl.rx === 'side-left', -D * 0.15, len(2.2, 3.6, D * 0.25), 'rxcounter');
  }
  if (!out.counterPos) { // fallback: something always works
    backCounter(0, Math.min(3, W - 2)); if (!out.counterPos) out.counterPos = { x: 0, z: 0 };
    if (!out.clerks.length) out.clerks.push({ x: 0, z: z0 + 0.5, ry: 0 });
  }

  // ---- walls ----------------------------------------------------------------------------------------------
  const DEPTH = { fridge: 0.8, wallshelf: 0.5, produce: 1.0, winerack: 0.45, tvwall: 0.25, pegwall: 0.2, glasswall: 0.6, garmentwall: 0.55, shoewall: 0.4, beautywall: 0.45, boardwall: 0.5, teewall: 0.12, menuwall: 0.08, washers: 0.75, dryers: 0.8, barberchairs: 1.6, gunwall: 0.35, guitarwall: 0.3, tirestack: 0.75, fitting: 1.3, deskrow: 2.0 };
  const usedWalls = new Set();
  const wallRun = (wall, kind, opts) => {
    const dp = DEPTH[kind] || 0.5; const step = 0.3;
    const along = wall === 'back' ? [x0, x1] : [z0, z1 - (kind === 'garmentwall' || kind === 'wallshelf' || kind === 'teewall' ? 1.2 : 1.6)];
    const mk = (a, b) => {
      const L = b - a; if (L < 1.0) return;
      const c = (a + b) / 2;
      const f = wall === 'back' ? { k: kind, x: c, z: z0 + dp / 2, sx: L, sz: dp, face: '+z', axis: 'x', wall, ...opts }
        : { k: kind, x: wall === 'left' ? x0 + dp / 2 : x1 - dp / 2, z: c, sx: dp, sz: L, face: wall === 'left' ? '+x' : '-x', axis: 'z', wall, ...opts };
      place(f, { margin: 0.02, clear: kind === 'barberchairs' ? 0 : 0.0 });
    };
    // scan free intervals
    let a = null;
    for (let t = along[0]; t <= along[1] + 1e-6; t += step) {
      const q = wall === 'back' ? rect(t, z0 + dp / 2, step, dp) : rect(wall === 'left' ? x0 + dp / 2 : x1 - dp / 2, t, dp, step);
      let free = inside(q); if (free) for (const o of occ) if (overl(q, o, 0.12)) { free = false; break; }
      if (free) for (const k of keep) if (overl(q, k, 0)) { free = false; break; }
      if (free && a === null) a = t - step / 2;
      if (!free && a !== null) { mk(a, t - step / 2); a = null; }
    }
    if (a !== null) mk(a, Math.min(along[1], along[1] + step / 2));
    usedWalls.add(wall);
  };
  for (const [wall, kind, opts] of tmpl.walls) {
    if (wall === '*') { for (const w of ['left', 'right', 'back']) if (!usedWalls.has(w)) wallRun(w, kind, opts); }
    else wallRun(wall, kind, opts);
  }
  if (tmpl.extras?.includes('fitting-corner')) place({ k: 'fitting', x: x1 - 1.0, z: z0 + 1.6, sx: 1.9, sz: 3.0, face: '-x' }, { margin: 0 });

  // ---- interior region for fills (inside wall fixtures, behind the entry zone) ------------------------------
  let rx0 = x0, rx1 = x1, rz0 = z0, rz1 = z1 - entryDepth - 0.2;
  for (const o of occ) { // shrink by wall-hugging fixtures
    const f = o.f; if (!f.wall && f.k !== 'clerkzone' && !/counter|teller|icecase|kitchenpass|rxcounter/.test(f.k)) continue;
    if (f.wall === 'left' || (o.ax <= x0 + 0.05 && o.bx < 0)) rx0 = Math.max(rx0, o.bx); else if (f.wall === 'right' || (o.bx >= x1 - 0.05 && o.ax > 0)) rx1 = Math.min(rx1, o.ax);
    if (f.wall === 'back' || o.az <= z0 + 0.05 || /teller|kitchenpass|cafecounter|dinercounter|icecase|barcounter/.test(f.k) && f.axis === 'x') rz0 = Math.max(rz0, o.bz);
  }
  const aisle = 1.25;
  rx0 += aisle; rx1 -= aisle; rz0 += aisle; rz1 -= 0.3;
  const RW = rx1 - rx0, RD = rz1 - rz0;
  const [fill, fo] = tmpl.fill;
  const islandKind = fo.kind || 'gondola';
  if (fill === 'aisles' && RW > 0.8 && RD > 1.2) {
    const unitW = islandKind === 'gondola' || islandKind === 'gondola-short' ? 0.9 : islandKind === 'makeupisland' ? 1.0 : islandKind === 'washerisland' ? 1.5 : 1.0;
    const pitch = unitW + (fo.axis === 'z' ? 1.45 : 1.5);
    if (fo.axis === 'z') {
      const n = Math.max(1, Math.floor((RW + pitch - unitW) / pitch)); const span = (n - 1) * pitch; const segs = RD > 8 ? 2 : 1;
      for (let i = 0; i < n; i++) for (let s = 0; s < segs; s++) {
        const segLen = (RD - (segs - 1) * 1.4) / segs; const cz = rz0 + segLen / 2 + s * (segLen + 1.4);
        place({ k: islandKind, x: (rx0 + rx1) / 2 - span / 2 + i * pitch, z: cz, sx: unitW, sz: Math.min(segLen, fo.short ? 3 : 20), axis: 'z', mix: fo.mix || type, double: true }, { margin: 0.3 });
      }
    } else {
      const n = Math.max(1, Math.floor((RD + pitch - unitW) / pitch)); const span = (n - 1) * pitch; const segs = RW > 9 ? 2 : 1;
      for (let i = 0; i < n; i++) for (let s = 0; s < segs; s++) {
        const segLen = (RW - (segs - 1) * 1.4) / segs; const cx = rx0 + segLen / 2 + s * (segLen + 1.4);
        place({ k: islandKind, x: cx, z: (rz0 + rz1) / 2 - span / 2 + i * pitch, sx: Math.min(segLen, fo.short ? 3 : 20), sz: unitW, axis: 'x', mix: fo.mix || type, double: true }, { margin: 0.3 });
      }
    }
  } else if (fill === 'islands' && RW > 0.8 && RD > 0.8) {
    const S = { 'gondola-short': [0.9, 2.2], demotable: [1.1, 2.0], foldtable: [1.3, 0.9], makeupisland: [1.0, 2.2], wineisland: [1.0, 2.0], glasscase: [0.8, 2.0], boardrack: [0.8, 2.4], souvenirtable: [1.2, 1.2], 'foldtable-l': [0.9, 2.4] }[islandKind] || [1, 2];
    const px = S[0] + 1.6, pz = S[1] + 1.5;
    const nx = Math.max(1, Math.floor((RW + 1.6) / px)), nz = Math.max(1, Math.floor((RD + 1.5) / pz));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) place({ k: islandKind, x: (rx0 + rx1) / 2 + (i - (nx - 1) / 2) * px, z: (rz0 + rz1) / 2 + (j - (nz - 1) / 2) * pz, sx: S[0], sz: S[1], axis: 'z', mix: fo.mix, double: true }, { margin: 0.3 });
  } else if (fill === 'racks' && RW > 0.8 && RD > 0.8) {
    if (fo.round) {
      const p = 2.7; const nx = Math.max(1, Math.min(6, Math.floor((RW + 0.8) / p))), nz = Math.max(1, Math.min(5, Math.floor((RD + 0.8) / p)));
      let ci = Math.floor(r() * 12);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) place({ k: 'roundrack', x: (rx0 + rx1) / 2 + (i - (nx - 1) / 2) * p, z: (rz0 + rz1) / 2 + (j - (nz - 1) / 2) * p, sx: 1.1, sz: 1.1, color: ci++ }, { margin: 0.3 });
    } else {
      const pitch = 1.9; const n = Math.max(1, Math.floor((RW + pitch - 0.6) / pitch)); const span = (n - 1) * pitch;
      let ci = Math.floor(r() * 12);
      for (let i = 0; i < n; i++) place({ k: 'rack', x: (rx0 + rx1) / 2 - span / 2 + i * pitch, z: (rz0 + rz1) / 2, sx: 0.6, sz: Math.min(RD, 3.2), axis: 'z', color: ci++ }, { margin: 0.3 });
    }
  } else if (fill === 'tables') {
    const four = fo.size === 4; const tw = four ? 1.0 : 0.7; const p = four ? 2.9 : 2.2;
    const tx0 = (C === 'bar-left' ? x0 + 3.4 : x0 + 1.2), tx1 = (C === 'bar-right' ? x1 - 3.4 : x1 - 1.2);
    const tz0 = Math.max(rz0 - aisle + 0.6, z0 + 1.2), tz1 = z1 - entryDepth;
    const nx = Math.max(1, Math.floor((tx1 - tx0 + 0.6) / p)), nz = Math.max(1, Math.floor((tz1 - tz0 + 0.6) / p));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const f = place({ k: four ? 'table4' : 'table2', high: !!fo.high, x: (tx0 + tx1) / 2 + (i - (nx - 1) / 2) * p, z: (tz0 + tz1) / 2 + (j - (nz - 1) / 2) * p, sx: tw + 0.9, sz: tw + 0.9 }, { margin: 0.25 });
      if (f) { const seats = four ? [[0, -1], [0, 1], [-1, 0], [1, 0]] : [[0, -1], [0, 1]]; for (const [a, b] of seats) out.seats.push({ x: f.x + a * (tw / 2 + 0.35), z: f.z + b * (tw / 2 + 0.35), ry: Math.atan2(-a, -b) }); }
    }
  } else if (fill === 'booths') {
    for (const left of [true, false]) for (let z = z0 + 3.2; z < z1 - entryDepth - 1; z += 2.4) {
      const f = place({ k: 'booth', x: left ? x0 + 1.0 : x1 - 1.0, z, sx: 1.9, sz: 2.2, face: left ? '+x' : '-x' }, { margin: 0.05 });
      if (f) out.seats.push({ x: f.x + (left ? 0.3 : -0.3), z: f.z - 0.75, ry: 0 }, { x: f.x + (left ? 0.3 : -0.3), z: f.z + 0.75, ry: Math.PI });
    }
  } else if (fill === 'dance') {
    const s = Math.min(RW + 2, RD + 2, 9);
    const f = place({ k: 'dancefloor', x: (rx0 + rx1) / 2, z: (rz0 + rz1) / 2, sx: s, sz: s, walkable: true }, { margin: 0.2 });
    if (f) for (let i = 0; i < 14; i++) out.seats.push({ x: f.x + (r() - 0.5) * s * 0.8, z: f.z + (r() - 0.5) * s * 0.8, ry: r() * 6.28, dance: true });
  } else if (fill === 'queue') {
    const qz = z0 + 1.6 + 0.8 + 1.4;
    place({ k: 'ropeposts', x: 0, z: qz + 1.0, sx: Math.min(4, W - 4), sz: 1.4 }, { margin: 0.2 });
  }

  // ---- extras ---------------------------------------------------------------------------------------------
  const ex = tmpl.extras || [];
  const tryCorner = (k, sx, sz, opts = {}) => {
    const cands = [[x0 + sx / 2 + 0.1, z1 - entryDepth - sz / 2 - 0.4], [x1 - sx / 2 - 0.1, z1 - entryDepth - sz / 2 - 0.4], [x0 + sx / 2 + 0.1, z1 - sz / 2 - 0.3], [x1 - sx / 2 - 0.1, z1 - sz / 2 - 0.3], [x0 + sx / 2 + 0.1, 0], [x1 - sx / 2 - 0.1, 0]];
    for (const [x, z] of cands) { const f = place({ k, x, z, sx, sz, ...opts }, { margin: 0.25 }); if (f) return f; }
    return null;
  };
  if (ex.includes('mags')) tryCorner('magrack', 0.35, 1.4, { face: '+x' });
  if (ex.includes('mannequins')) { tryCorner('mannequin', 0.6, 0.6); tryCorner('mannequin', 0.6, 0.6); }
  if (ex.includes('spinner-shades')) tryCorner('spinner', 0.7, 0.7, { mix: 'shades' });
  if (ex.includes('spinner-cards')) tryCorner('spinner', 0.7, 0.7, { mix: 'cards' });
  if (ex.includes('waxtable')) tryCorner('souvenirtable', 1.1, 0.8, { mix: 'wax' });
  if (ex.includes('perfumecase')) tryCorner('glasscase', 0.8, 1.8, { mix: 'perfume' });
  if (ex.includes('consoles')) tryCorner('gondola-short', 0.9, 2.0, { mix: 'consoles', double: true, axis: 'z' });
  if (ex.includes('beerstack')) tryCorner('beerstack', 1.0, 1.0);
  if (ex.includes('fridge-small')) tryCorner('fridge', 0.8, 1.6, { face: '+x', mix: 'drinks', axis: 'z' });
  if (ex.includes('vending')) tryCorner('vending', 0.9, 0.8);
  if (ex.includes('chairs')) tryCorner('chairs', 0.6, 2.4, { face: '+x' });
  if (ex.includes('atm')) { tryCorner('atm', 0.8, 0.5); }
  if (ex.includes('host')) tryCorner('host', 0.7, 0.5);
  if (ex.includes('plants')) { tryCorner('plant', 0.6, 0.6); tryCorner('plant', 0.6, 0.6); }
  if (ex.includes('ballbins')) { tryCorner('ballbin', 0.9, 0.9); }
  if (ex.includes('targets')) out.targets = true;
  if (ex.includes('tvs')) out.tvs = true;
  if (ex.includes('pool') && W > 9 && D > 9) tryCorner('pooltable', 1.5, 2.6);
  if (ex.includes('dj')) { const f = place({ k: 'djbooth', x: 0, z: z0 + 1.1, sx: Math.min(4, W - 3), sz: 1.8 }, { margin: 0.1 }); if (f) out.clerks.push({ x: 0, z: z0 + 0.9, ry: 0, role: 'dj' }); }
  if (ex.includes('speakers')) { place({ k: 'speakerstack', x: x0 + 0.5, z: z0 + 0.6, sx: 0.8, sz: 0.8 }, { margin: 0 }); place({ k: 'speakerstack', x: x1 - 0.5, z: z0 + 0.6, sx: 0.8, sz: 0.8 }, { margin: 0 }); }
  if (ex.includes('lounges') || ex.includes('booths-wall')) {
    const left = !(C === 'bar-left'), xs = left ? x0 + 0.9 : x1 - 0.9;
    for (let z = z0 + 2.4; z < z1 - entryDepth - 1; z += 2.6) { const f = place({ k: ex.includes('lounges') ? 'lounge' : 'booth', x: xs, z, sx: 1.7, sz: 2.2, face: left ? '+x' : '-x' }, { margin: 0.05 }); if (f) out.seats.push({ x: f.x + (left ? 0.4 : -0.4), z: f.z - 0.7, ry: 0 }, { x: f.x + (left ? 0.4 : -0.4), z: f.z + 0.7, ry: Math.PI }); }
  }
  if (ex.includes('window-bar')) { // counter along the window, stools facing out
    const f = place({ k: 'windowbar', x: doorX > 0 ? (x0 + doorX - doorW / 2) / 2 - 0.3 : (x1 + doorX + doorW / 2) / 2 + 0.3, z: z1 - 0.35, sx: Math.min(4, W / 2 - doorW), sz: 0.45 }, { margin: 0.05, ignoreKeep: true });
    if (f) for (let i = 0; i < Math.floor(f.sx / 0.8); i++) out.seats.push({ x: f.x - f.sx / 2 + 0.4 + i * 0.8, z: f.z - 0.6, ry: 0 });
  }
  if (ex.includes('smallbar')) tryCorner('barcounter', 0.8, 2.6, { face: '+x', axis: 'z', small: true });
  if (ex.includes('desks')) { for (const s of [-1, 1]) place({ k: 'desk', x: s * (W / 2 - 1.6), z: z1 - entryDepth - 1.4, sx: 1.6, sz: 0.8 }, { margin: 0.2 }); }
  if (ex.includes('endcaps')) { /* gondolas already show product on ends */ }
  if (ex.includes('foldtables')) { tryCorner('foldtable', 1.3, 0.9); }
  if (ex.includes('brochure')) { place({ k: 'brochure', x: 0, z: (z0 + z1) / 2 + 1.5, sx: 1.2, sz: 1.2 }, { margin: 0.4 }); }

  out.occ = occ.filter((o) => !o.f.walkable);
  return out;
}

// ---- walk grid ----------------------------------------------------------------------------------------------
export function buildNav(L, cell = 0.4) {
  const nx = Math.max(2, Math.ceil((L.x1 - L.x0) / cell)), nz = Math.max(2, Math.ceil((L.z1 - L.z0) / cell));
  const grid = new Uint8Array(nx * nz); // 0 free, 1 blocked
  const R = 0.32;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = L.x0 + (i + 0.5) * cell, z = L.z0 + (j + 0.5) * cell;
    if (x < L.x0 + R || x > L.x1 - R || z < L.z0 + R) grid[i + j * nx] = 1;
  }
  for (const o of L.occ) { // rasterize each (inflated) fixture rect
    const i0 = Math.max(0, Math.ceil((o.ax - R - L.x0) / cell - 0.5)), i1 = Math.min(nx - 1, Math.floor((o.bx + R - L.x0) / cell - 0.5));
    const j0 = Math.max(0, Math.ceil((o.az - R - L.z0) / cell - 0.5)), j1 = Math.min(nz - 1, Math.floor((o.bz + R - L.z0) / cell - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[i + j * nx] = 1;
  }
  const toCell = (x, z) => [Math.max(0, Math.min(nx - 1, Math.floor((x - L.x0) / cell))), Math.max(0, Math.min(nz - 1, Math.floor((z - L.z0) / cell)))];
  const center = (i, j) => ({ x: L.x0 + (i + 0.5) * cell, z: L.z0 + (j + 0.5) * cell });
  const nearestFree = (x, z) => {
    const [ci, cj] = toCell(x, z);
    for (let rr = 0; rr < 8; rr++) for (let di = -rr; di <= rr; di++) for (let dj = -rr; dj <= rr; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== rr) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      if (!grid[i + j * nx]) return [i, j];
    }
    return null;
  };
  // reachability from the door
  const door = nearestFree(L.doorX, L.z1 - 0.3);
  const reach = new Uint8Array(nx * nz);
  if (door) { const q = [door[0] + door[1] * nx]; reach[q[0]] = 1; while (q.length) { const c = q.pop(); const i = c % nx, j = (c / nx) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const k = a + b * nx; if (!grid[k] && !reach[k]) { reach[k] = 1; q.push(k); } } } }
  const prev = new Int32Array(nx * nz);
  function path(ax, az, bx, bz) {
    const s = nearestFree(ax, az), t = nearestFree(bx, bz); if (!s || !t) return null;
    const si = s[0] + s[1] * nx, ti = t[0] + t[1] * nx;
    prev.fill(-1); prev[si] = si; const q = [si]; let h = 0;
    while (h < q.length) {
      const c = q[h++]; if (c === ti) break; const i = c % nx, j = (c / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const k = a + b * nx;
        if (grid[k] || prev[k] !== -1) continue;
        if (di && dj && (grid[a + j * nx] || grid[i + b * nx])) continue;
        prev[k] = c; q.push(k);
      }
    }
    if (prev[ti] === -1) return null;
    const pts = []; let c = ti; while (c !== si) { pts.push(c); c = prev[c]; }
    pts.reverse();
    // string-pull: drop cells that keep line of sight
    const out = []; let last = si;
    const clear = (a, b) => { const ai = a % nx, aj = (a / nx) | 0, bi = b % nx, bj = (b / nx) | 0; const n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2; for (let k = 1; k < n; k++) { const i = Math.round(ai + (bi - ai) * k / n), j = Math.round(aj + (bj - aj) * k / n); if (grid[i + j * nx]) return false; } return true; };
    for (let k = 0; k < pts.length; k++) { const nxt = pts[k + 1]; if (nxt === undefined || !clear(last, nxt)) { out.push(center(pts[k] % nx, (pts[k] / nx) | 0)); last = pts[k]; } }
    return out;
  }
  const freeReachable = (x, z) => { const c = nearestFree(x, z); return c && reach[c[0] + c[1] * nx] ? center(c[0], c[1]) : null; };
  return { nx, nz, cell, grid, reach, path, freeReachable, door: door ? center(door[0], door[1]) : { x: L.doorX, z: L.z1 - 0.5 } };
}
