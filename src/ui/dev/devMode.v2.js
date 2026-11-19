// SOUTHLINE dev mode (r2-mapui). Unlocked with a code, off by default, remembered in localStorage.
//  - Pause menu → Settings → Codes opens a numeric code panel (keypad or keyboard). Code 6969 toggles dev mode; a wrong code
//    shakes the field. The panel also has the dev switches (police lock, turn dev mode off) and the dev key list.
//  - DEV badge at the bottom right (above the speedometer while driving, hidden behind the phone).
//  - Pause map: with a waypoint set, a TELEPORT button sits beside the pin (or press T). The player (and their car, landed
//    on the nearest lane heading along it) is moved there behind the main menu's loading screen (src/ui/menu/loadScreen.js,
//    user Nov 19; it was a plain black veil) and held in place
//    until the tile colliders and the near tiles around the spot are streamed, so nothing falls through the world.
//    Water spots move to the nearest dry, walkable ground.
//  - Police lock: a lock beside the wanted stars (click it while the cursor is free, or ; / L in the pause menu). Locked =
//    no crime events reach the police / witness / evidence systems at all, any stars are cleared and none can be set.
//  - Dev keys (gameplay): [ / ] time -1 h / +1 h, \ next weather, ' spawn your last car beside you, ; police lock.
// API: game.dev = { on, policeLock, setOn(b), setPoliceLock(b), teleportTo(x, z), openCodes() }
import './devMode.css';
import { seaLevel } from '../../player/controller/surface.js';
import { createLoadScreen } from '../menu/loadScreen.js';

export const order = 900; // after the police / law system and the HUD, so the crime filter wraps theirs

const CODE = '6969';
const LS_MONEY = 'southline.dev.money';
const LS_ON = 'southline.dev',
  LS_LOCK = 'southline.dev.policeLock';
const ls = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {
      /* private window / blocked */
    }
  },
};
const el = (tag, cls, html) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
};
const notify = (game, t, ms = 2200) => {
  try {
    game.hud?.notify?.(t, ms);
  } catch (e) {
    /* */
  }
};

const LOCK_SVG = `<svg viewBox="0 0 224 240" aria-hidden="true">
  <path class="ol-s" d="M62 108 V78 A50 50 0 0 1 162 78 V108"/>
  <rect class="ol" x="32" y="104" width="160" height="120" rx="24"/>
  <path class="shackle" d="M62 108 V78 A50 50 0 0 1 162 78 V108"/>
  <rect class="body" x="32" y="104" width="160" height="120" rx="24"/>
  <circle class="key" cx="112" cy="152" r="17"/><rect class="key" x="104" y="156" width="16" height="36" rx="6"/>
</svg>`;

export async function initV2(game) {
  const ui = (game.ui = game.ui || {});
  const S = {
    on: ls.get(LS_ON) === '1',
    lock: ls.get(LS_LOCK) === '1',
    money: ls.get(LS_MONEY) === '1',
    busy: false,
    lastCar: null,
  };

  // ------------------------------------------------------------------ DOM
  const hud = document.getElementById('ps-hud') || document.querySelector('.ps-hud');
  const pause = hud?.querySelector('.ps-pause');
  const corner = hud?.querySelector('.ps-corner');
  const mapPage = hud?.querySelector('.ps-page-map');
  const bigmap = hud?.querySelector('.ps-bigmap');

  const badge = el('div', 'ps-dev-badge', '<i></i>DEV');
  badge.title = 'Dev mode is on (pause menu → Settings → Codes)';
  hud?.appendChild(badge);

  // the code panel opens from the bottom of the pause menu's Settings tab (Codes section, src/ui/menu/pauseSettings.js);
  // this button is no longer placed in the pause menu (user, Nov 19: no separate CODES button)
  const codesBtn = el('button', 'ps-dev-codes', 'CODES');

  const panel = el(
    'div',
    'ps-dev-panel',
    `<div class="ps-dev-card" role="dialog" aria-label="Enter code">
    <h3>ENTER CODE</h3>
    <input class="ps-dev-field" readonly inputmode="none" maxlength="8" autocomplete="off" spellcheck="false" aria-label="Code" tabindex="-1">
    <div class="ps-dev-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="del" aria-label="Delete">⌫</button><button data-k="0">0</button><button data-k="ok" class="ok" aria-label="Confirm">✓</button></div>
    <div class="ps-dev-extra"></div></div>`,
  );
  document.body.appendChild(panel);
  const field = panel.querySelector('.ps-dev-field'),
    extra = panel.querySelector('.ps-dev-extra');

  const tpBtn = el('button', 'ps-dev-tp', 'TELEPORT<kbd>T</kbd>');
  mapPage?.appendChild(tpBtn);

  const lockBtn = el('button', 'ps-dev-lock', LOCK_SVG);
  lockBtn.title = 'Police lock (dev): no wanted level, no crimes reported';
  corner?.appendChild(lockBtn);

  // ------------------------------------------------------------------ state -> view
  function paint() {
    hud?.classList.toggle('dev', S.on);
    corner?.classList.toggle('dev', S.on);
    corner?.classList.toggle('police-locked', S.on && S.lock);
    lockBtn.classList.toggle('on', S.lock);
    badge.classList.toggle('locked', S.on && S.lock);
    badge.innerHTML = `<i></i>DEV${S.on && S.lock ? ' · NO COPS' : ''}`;
    codesBtn.classList.toggle('on', S.on);
    extra.innerHTML = S.on
      ? `<div class="ps-dev-row"><button data-a="lock" class="${S.lock ? 'on' : ''}">POLICE LOCK: ${S.lock ? 'ON' : 'OFF'}</button><button data-a="money" class="${S.money ? 'on' : ''}">INFINITE MONEY: ${S.money ? 'ON' : 'OFF'}</button><button data-a="off">TURN DEV MODE OFF</button></div>
      <div class="ps-dev-status"><b>Dev mode is on.</b><br><kbd>T</kbd>teleport to the map waypoint (pause map)<br><kbd>[</kbd><kbd>]</kbd>time −1 h / +1 h · <kbd>\\</kbd>next weather<br><kbd>'</kbd>spawn your last car · <kbd>;</kbd>police lock (<kbd>L</kbd> in this menu)</div>`
      : '';
  }
  function setOn(b) {
    S.on = !!b;
    ls.set(LS_ON, S.on ? '1' : null);
    if (!S.on && S.lock) setPoliceLock(false, true);
    paint();
  }
  // infinite money: keep cash topped up (spending still works, it just refills)
  const MONEY_FLOOR = 5e6,
    MONEY_TOP = 9999999;
  function topUp() {
    const w = game.wallet;
    if (!w) return;
    try {
      if (w.cash < MONEY_FLOOR) w.setCashDirect(MONEY_TOP, 'Dev money');
    } catch (e) {
      /* no wallet yet */
    }
  }
  function setMoney(b) {
    S.money = !!b;
    ls.set(LS_MONEY, S.money ? '1' : null);
    if (S.on && S.money) topUp();
    paint();
  }
  function setPoliceLock(b, quiet) {
    S.lock = !!b;
    ls.set(LS_LOCK, S.lock ? '1' : null);
    if (S.lock) {
      installLaw();
      clearLaw();
    }
    paint();
    if (!quiet)
      notify(
        game,
        S.lock ? 'Police lock ON: no wanted level, no crimes reported' : 'Police lock OFF',
        2200,
      );
  }

  // ------------------------------------------------------------------ code panel
  // while the panel is open the input bindings are in 'ui' mode (menus own the keyboard): nothing reaches the game or
  // the pause menu; Enter / Escape / digits arrive as 'uikey' events, typing in the field works natively
  let panelOpen = false,
    leaveUI = null,
    offUI = null,
    navH = null,
    panelOpts = {};
  // one handler for both routes a key can take (bindings 'uikey' while they own the keyboard, or the raw keydown when they
  // let it through); the event is marked so the same key press is never handled twice
  function panelKey(c, ev, text) {
    if (!panelOpen || !ev || ev.__dev) return false;
    ev.__dev = true;
    if (c === 'Escape') {
      if (!navH) {
        closeCodes();
        keepPaused();
      }
      return true;
    } // with a nav scope its onBack closes
    if (c === 'Enter' || c === 'NumpadEnter') {
      ev.preventDefault?.();
      submit();
      return true;
    }
    // digits and Backspace are always handled here (native typing is prevented), so code-only key events (gamepads,
    // automation, remapped keyboards) type exactly like a real keyboard and nothing is ever entered twice
    if (/^(Digit|Numpad)[0-9]$/.test(c)) {
      ev.preventDefault?.();
      if (field.value.length < 8) field.value += c.slice(-1);
      field.classList.remove('bad');
      return true;
    }
    if (c === 'Backspace') {
      ev.preventDefault?.();
      field.value = field.value.slice(0, -1);
      return true;
    }
    if (!text && c === 'KeyL' && S.on) {
      setPoliceLock(!S.lock);
      return true;
    }
    return false;
  }
  function onUIKey(k) {
    if (k?.down && k.raw) panelKey(k.code, k.raw, false);
  }
  // Escape belongs to the panel: if anything else also resumed the game on that key press, put the pause menu back
  let keepPausedUntil = 0;
  function keepPaused() {
    keepPausedUntil = performance.now() + 400;
  }
  // openCodes({ closeOnSuccess, onClose }): Settings opens it this way (the right code closes it and the row updates)
  function openCodes(o = {}) {
    if (panelOpen) return;
    panelOpts = o || {};
    panelOpen = true;
    panel.classList.add('open');
    field.value = '';
    field.classList.remove('bad', 'good');
    paint();
    panel.style.zIndex = '2147483000';
    document.body.appendChild(panel); // above every menu layer (settings from the title)
    // never focus the (read-only) field: the input bindings swallow keys aimed at a focused text field, so digits would never
    // arrive; unfocused, every key reaches panelKey() through the bindings' 'uikey' event (or the raw keydown)
    try {
      const a = document.activeElement;
      if (a && a !== document.body && a.blur) a.blur();
    } catch (e) {
      /* */
    }
    const B = game.bindings;
    try {
      if (B?.pushMode) leaveUI = B.pushMode('ui');
      if (B?.on) offUI = B.on('uikey', onUIKey);
    } catch (e) {
      leaveUI = offUI = null;
    }
    try {
      navH =
        game.uiContext?.nav?.push?.({
          root: panel.querySelector('.ps-dev-card'),
          wrap: true,
          onNav: (d) => d.dir === 'accept' && d.src !== 'pad',
          onBack: () => {
            closeCodes();
            keepPaused();
          },
        }) || null;
    } catch (e) {
      navH = null;
    }
  }
  function closeCodes() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.classList.remove('open');
    field.blur();
    try {
      offUI?.();
      leaveUI?.();
      navH?.pop?.();
    } catch (e) {
      /* */
    }
    offUI = leaveUI = navH = null;
    const cb = panelOpts.onClose;
    panelOpts = {};
    try {
      cb?.();
    } catch (e) {
      /* */
    }
  }
  function submit() {
    const v = field.value.replace(/\D/g, '');
    if (v === CODE) {
      field.classList.remove('bad');
      field.classList.add('good');
      // from the Settings "Dev mode" toggle (unlock) the code only turns it on; the bare Codes panel still toggles
      setOn(panelOpts.unlock ? true : !S.on);
      notify(game, S.on ? 'Dev mode ON' : 'Dev mode OFF', 2000);
      setTimeout(() => {
        field.value = '';
        field.classList.remove('good');
        if (panelOpts.closeOnSuccess) closeCodes();
      }, 500);
    } else {
      field.classList.remove('bad');
      void field.offsetWidth;
      field.classList.add('bad');
      setTimeout(() => {
        field.value = '';
      }, 260);
    }
  }
  codesBtn.addEventListener('click', openCodes);
  panel.addEventListener('pointerdown', (e) => {
    if (e.target === panel) closeCodes();
  });
  panel.querySelector('.ps-dev-pad').addEventListener('click', (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (!k) return;
    if (k === 'del') field.value = field.value.slice(0, -1);
    else if (k === 'ok') submit();
    else if (field.value.length < 8) {
      field.value += k;
      field.classList.remove('bad');
    }
  });
  field.addEventListener('focus', () => field.blur());
  field.addEventListener('input', () => {
    field.value = field.value.replace(/\D/g, '').slice(0, 8);
    field.classList.remove('bad');
  });
  extra.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'lock') setPoliceLock(!S.lock);
    else if (a === 'money') {
      setMoney(!S.money);
      notify(game, S.money ? 'Infinite money ON' : 'Infinite money OFF', 2000);
    } else if (a === 'off') {
      setOn(false);
      notify(game, 'Dev mode OFF', 2000);
    }
  });

  // ------------------------------------------------------------------ police lock: filter crimes at the source
  let emitInner = null,
    emitOuter = null,
    lawFor = null;
  function installLaw() {
    if (game.emit !== emitOuter && typeof game.emit === 'function') {
      emitInner = game.emit;
      emitOuter = function (n, d) {
        if (S.on && S.lock && (n === 'crime' || n === 'wanted:report')) return false;
        return emitInner.apply(this, arguments);
      };
      game.emit = emitOuter;
    }
    const W = game.wanted;
    if (W && lawFor !== W) {
      lawFor = W;
      for (const k of ['add', 'set']) {
        const f = W[k];
        if (typeof f !== 'function') continue;
        try {
          W[k] = function (stars, ...rest) {
            if (S.on && S.lock && (k === 'add' || +stars > 0)) return undefined;
            return f.call(this, stars, ...rest);
          };
        } catch (e) {
          /* frozen */
        }
      }
    }
  }
  function clearLaw() {
    try {
      if ((game.wanted?.level || 0) > 0) game.wanted.clear('dev police lock');
    } catch (e) {
      /* */
    }
  }
  lockBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPoliceLock(!S.lock);
  });

  // ------------------------------------------------------------------ teleport
  const city = () => game.city;
  const gy = (x, z) => {
    try {
      const y = city()?.groundHeightAt?.(x, z);
      return Number.isFinite(y) ? y : 0;
    } catch (e) {
      return 0;
    }
  };
  const wet = (x, z) => {
    try {
      return !!city()?.isWater?.(x, z);
    } catch (e) {
      return false;
    }
  };
  const blocked = (x, z) => {
    try {
      const s = city()?.surfaceAt?.(x, z);
      return s === 'building' || s === 'water';
    } catch (e) {
      return false;
    }
  };
  function dryNear(x, z) {
    for (let r = 6; r <= 900; r += r < 60 ? 6 : 15) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 8));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2,
          px = x + Math.cos(a) * r,
          pz = z + Math.sin(a) * r;
        if (!wet(px, pz) && clearOfBuildings(px, pz) && !nearBuildingPoly(px, pz))
          return { x: px, z: pz, moved: r };
      }
    }
    return { x, z, moved: 0 };
  }
  // on foot: the closest sidewalk near the spot (always outdoors and walkable); away from streets, the nearest dry ground
  // that is not inside a building footprint
  function clearOfBuildings(x, z) {
    for (const [dx, dz] of [
      [0, 0],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ])
      if (blocked(x + dx, z + dz)) return false;
    return true;
  }
  function footNear(x, z) {
    // in town, the closest sidewalk (buildings from every source line the streets, the sidewalk is always outside them)
    let best = null;
    for (let i = 0; i < 12; i++) {
      let p = null;
      try {
        p = city()?.randomSidewalkPoint?.({ x, z }, 60);
      } catch (e) {
        p = null;
      }
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 75 && (!best || d < best.moved)) best = { x: p.x, z: p.z, moved: d };
    }
    if (best) return best;
    // away from streets (beach, wilderness): the pin itself when it is open dry ground, else the nearest such spot
    if (!wet(x, z) && clearOfBuildings(x, z) && !nearBuildingPoly(x, z)) return { x, z, moved: 0 };
    return dryNear(x, z);
  }
  // building footprints from the map layers (the surface grid can miss small storefront shells)
  function nearBuildingPoly(x, z) {
    const L = city()?.mapLayers?.buildingPolys;
    if (!Array.isArray(L)) return false;
    if (!nearBuildingPoly.grid) {
      const g = new Map();
      for (const b of L) {
        const r = b.outer || b;
        if (!r?.length) continue;
        let cx = 0,
          cz = 0;
        for (const q of r) {
          cx += q[0];
          cz += q[1];
        }
        cx /= r.length;
        cz /= r.length;
        const k = Math.floor(cx / 50) + ',' + Math.floor(cz / 50);
        let a = g.get(k);
        if (!a) g.set(k, (a = []));
        a.push(r);
      }
      nearBuildingPoly.grid = g;
    }
    const gx = Math.floor(x / 50),
      gz = Math.floor(z / 50);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const r of nearBuildingPoly.grid.get(gx + i + ',' + (gz + j)) || []) {
          let inside = false;
          for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
            const [xa, za] = r[a],
              [xb, zb] = r[b];
            if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
          }
          if (inside) return true;
        }
    return false;
  }
  function roadNear(x, z) {
    const C = city();
    for (const R of [25, 60, 150, 400]) {
      let best = null;
      for (let i = 0; i < 6; i++) {
        let r = null;
        try {
          r = C?.randomRoadPoint?.({ x, z }, R);
        } catch (e) {
          r = null;
        }
        const p = r?.position || r?.pos;
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (!best || d < best.d) best = { x: p.x, y: p.y, z: p.z, heading: r.heading ?? 0, d };
      }
      if (best) return best;
    }
    return null;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n = 1) =>
    new Promise((r) => {
      const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    });
  function areaReady(x, z) {
    const C = city(),
      st = C?.streamer;
    const col = C?.collidersReadyAt
      ? C.collidersReadyAt(x, z)
      : st?.collidersReadyAt
        ? st.collidersReadyAt(x, z)
        : true;
    // Nov 19 (user: buildings visibly loaded in close in front of him after a teleport): the veil stays until the full
    // building ring (near builds within 320 m) is in and the job queue has drained, so nothing pops in at arm's length
    const near = st?.readyAround ? st.readyAround(x, z, 320) : true;
    if (!near && performance.now() - (areaReady.t0 || 0) < 15000) return false;
    const q = st?.pending ? st.pending() : 0;
    return !!col && (q <= 4 || performance.now() - (areaReady.t0 || 0) > 15000);
  }
  // the physics ground under a point: a ray down from a little above the drawn ground (static colliders only, so the car,
  // the player and peds never count). Returns the hit height or null while that collider is not built yet.
  function groundHit(x, y, z) {
    const W = game.world,
      R = game.RAPIER;
    if (!W || !R?.Ray) return null;
    try {
      const flags =
        (R.QueryFilterFlags?.EXCLUDE_SENSORS || 0) |
        (R.QueryFilterFlags?.EXCLUDE_DYNAMIC || 0) |
        (R.QueryFilterFlags?.EXCLUDE_KINEMATIC || 0);
      const top = y + 3,
        hit = W.castRay(new R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 8, true, flags);
      if (!hit) return null;
      const t = hit.timeOfImpact ?? hit.toi;
      const hy = top - t;
      return Math.abs(hy - y) <= 2 ? hy : null;
    } catch (e) {
      return null;
    }
  }
  // freeze the player (kinematic, no gravity) at a spot while the area streams in; returns release()
  function holdPlayer(pos) {
    const P = game.player,
      prev = P.script;
    const anim = {
      speed: 0,
      grounded: true,
      sprint: false,
      jumping: false,
      driving: false,
      punch: false,
      dead: false,
      swimming: false,
      wading: false,
    };
    P.script = {
      lock: true,
      devTeleport: true,
      anim,
      fixed() {
        try {
          game.movePlayerTo(pos.x, pos.y, pos.z);
        } catch (e) {
          /* */
        }
      },
    };
    return () => {
      if (P.script?.devTeleport) P.script = prev && !prev.devTeleport ? prev : null;
    };
  }
  function holdCar(v, pos) {
    const b = v.body;
    let gs = 1;
    try {
      gs = b.gravityScale?.() ?? 1;
      b.setGravityScale?.(0, true);
    } catch (e) {
      /* */
    }
    const put = () => {
      try {
        game.vehicles.placeVehicle(v, { x: pos.x, y: pos.y, z: pos.z }, pos.heading);
        b.setGravityScale?.(0, true);
      } catch (e) {
        /* */
      }
    };
    return {
      put,
      release: () => {
        try {
          b.setGravityScale?.(gs || 1, true);
          b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        } catch (e) {
          /* */
        }
      },
    };
  }
  async function teleportTo(x, z) {
    if (S.busy || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    S.busy = true;
    const P = game.player,
      v = P?.state?.inVehicle ? P.state.vehicle : null;
    const SEA = seaLevel(game);
    let dest;
    if (v && !v.isBoat) {
      const r = roadNear(x, z);
      dest = r
        ? {
            x: r.x,
            z: r.z,
            y: Number.isFinite(r.y) ? r.y : gy(r.x, r.z),
            heading: r.heading,
            car: true,
          }
        : { ...dryNear(x, z), heading: v.heading || 0, car: true };
      if (dest.y == null) dest.y = gy(dest.x, dest.z);
    } else if (wet(x, z)) {
      // into the water: swimming at the surface where it is deep, standing on the bottom where it is shallow
      const g = gy(x, z),
        deep = SEA - g > 1.4;
      dest = {
        x,
        z,
        y: deep ? SEA - 1.0 : g,
        heading: P?.heading ?? 0,
        car: false,
        swim: deep,
        moved: 0,
      };
    } else {
      const d = footNear(x, z);
      dest = {
        x: d.x,
        z: d.z,
        y: gy(d.x, d.z),
        heading: P?.heading ?? 0,
        car: false,
        moved: d.moved,
      };
    }
    // the main menu's loading screen (key art, LOADING bar, tips), not a black veil (user, Nov 19)
    const load = createLoadScreen({ mount: document.body });
    load.el.style.zIndex = '2147481000';
    load.place(
      (() => {
        try {
          return city()?.districtAt?.(dest.x, dest.z) || '';
        } catch (e) {
          return '';
        }
      })(),
    );
    load.set(4, 'Loading area');
    await sleep(750);
    try {
      game.hud?.setPaused?.(false, true);
    } catch (e) {
      /* */
    }
    // move there and freeze: the player kinematic (player.script), the car without gravity, re-placed every tick
    let releaseP = null,
      car = null;
    if (dest.car && v && game.vehicles?.placeVehicle) {
      car = holdCar(v, dest);
      car.put();
    } else {
      try {
        game.teleport(dest.x, dest.y + 0.05, dest.z);
      } catch (e) {
        /* */
      }
      releaseP = holdPlayer({ x: dest.x, y: dest.y + 0.05, z: dest.z });
    }
    const t0 = performance.now();
    areaReady.t0 = t0;
    let ok = false,
      hitY = null;
    while (performance.now() - t0 < 30000) {
      await sleep(100);
      if (car) car.put();
      {
        const t = performance.now() - t0,
          q = city()?.streamer?.pending?.() || 0;
        load.set(
          Math.min(94, 6 + 88 * (1 - Math.exp(-t / 3500))),
          q > 4 ? `Streaming the area · ${q}` : 'Placing you',
        );
      }
      if (performance.now() - t0 < 600 || !areaReady(dest.x, dest.z)) continue;
      if (dest.swim) {
        ok = true;
        break;
      } // open water: nothing to stand on, the swim code takes over at the surface
      // the collider under the exact landing point must exist (ray hit within 2 m of the drawn ground)
      hitY = groundHit(dest.x, dest.y, dest.z);
      if (hitY != null) {
        ok = true;
        break;
      }
    }
    if (hitY != null) dest.y = hitY;
    if (car) {
      car.put();
      await frames(2);
      car.release();
    } else {
      releaseP?.();
      try {
        game.teleport(dest.x, dest.y + 0.05, dest.z);
      } catch (e) {
        /* */
      }
    }
    await frames(3);
    try {
      if (game.renderer?.shadowMap) game.renderer.shadowMap.needsUpdate = true;
    } catch (e) {
      /* */
    }
    load.set(100, 'Ready');
    load.close();
    game.waypoint = null;
    S.busy = false;
    S.lastTeleport = { ...dest, ok, hitY, ms: Math.round(performance.now() - t0) };
    notify(
      game,
      !ok
        ? 'Teleported (area still loading)'
        : dest.swim
          ? 'Teleported (in the water)'
          : dest.moved > 3
            ? `Teleported (${Math.round(dest.moved)} m from the pin, on open ground)`
            : 'Teleported',
      1800,
    );
    return true;
  }
  tpBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const w = game.waypoint;
    if (w) teleportTo(w.x, w.z);
  });
  tpBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  // teleport button follows the waypoint pin on the pause map
  function mapOpen() {
    return !!(ui.paused && mapPage?.classList.contains('on'));
  }
  function placeTp() {
    requestAnimationFrame(placeTp);
    if (!ui.paused && performance.now() < keepPausedUntil && !S.busy) {
      keepPausedUntil = 0;
      try {
        game.hud?.setPaused?.(true, false);
      } catch (e) {
        /* */
      }
    }
    const w = game.waypoint,
      show = S.on && mapOpen() && !!w && !S.busy && !!bigmap;
    tpBtn.classList.toggle('show', show);
    if (!show) return;
    const view = ui._mapView?.();
    if (!view) return;
    const r = bigmap.getBoundingClientRect(),
      pr = mapPage.getBoundingClientRect();
    let sx = r.width / 2 + (w.x - view.cx) * view.ppm,
      sy = r.height / 2 + (w.z - view.cz) * view.ppm;
    sx = Math.max(8, Math.min(r.width - 190, sx));
    sy = Math.max(24, Math.min(r.height - 24, sy));
    tpBtn.style.left = `${(r.left - pr.left + sx).toFixed(0)}px`;
    tpBtn.style.top = `${(r.top - pr.top + sy).toFixed(0)}px`;
  }
  requestAnimationFrame(placeTp);

  // ------------------------------------------------------------------ keys
  const typing = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  window.addEventListener(
    'keydown',
    (e) => {
      const k = e.code;
      if (panelOpen) {
        panelKey(k, e, false);
        e.preventDefault();
        e.stopImmediatePropagation(); // nothing reaches the game, the pause menu or the map keys while the panel is open
        return;
      }
      if (!S.on || e.repeat || typing(e)) return;
      if (ui.paused) {
        if (k === 'KeyT' && mapOpen() && game.waypoint) {
          e.preventDefault();
          e.stopImmediatePropagation();
          teleportTo(game.waypoint.x, game.waypoint.z);
        } else if (k === 'KeyL') {
          e.preventDefault();
          e.stopImmediatePropagation();
          setPoliceLock(!S.lock);
        }
        return;
      }
      if (ui.title || ui.phoneOpen || S.busy) return;
      if (k === 'BracketLeft' || k === 'BracketRight') {
        const h = ((game.timeOfDay ?? 12) + (k === 'BracketRight' ? 1 : -1) + 24) % 24;
        game.timeOfDay = h;
        try {
          game.env?.regenerateEnvMap?.();
        } catch (e2) {
          /* */
        }
        notify(
          game,
          `Time ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`,
          1200,
        );
      } else if (k === 'Backslash') {
        const W = game.weather;
        if (W?.set && Array.isArray(W.states)) {
          const i = (W.states.indexOf(W.kind) + 1) % W.states.length;
          W.set(W.states[i], { instant: true });
          notify(game, `Weather: ${W.states[i]}`, 1400);
        } else if (W?.next) {
          W.next();
          notify(game, 'Weather: next', 1400);
        }
      } else if (k === 'Quote') spawnLastCar();
      else if (k === 'Semicolon') setPoliceLock(!S.lock);
    },
    true,
  );

  function spawnLastCar() {
    const P = game.player,
      V = game.vehicles;
    if (!P || !V?.spawn) return;
    const t = S.lastCar || 'sedan',
      h = P.heading ?? 0;
    const pos = {
      x: P.position.x + Math.sin(h) * 6,
      y: P.position.y,
      z: P.position.z + Math.cos(h) * 6,
    };
    let v = null;
    try {
      v = V.spawn(t, new P.position.constructor(pos.x, pos.y, pos.z), h, {});
    } catch (e) {
      v = null;
    }
    notify(game, v ? `Spawned ${v.name || t}` : 'Could not spawn a car here', 1600);
  }

  // ------------------------------------------------------------------ per frame
  (game.updaters = game.updaters || []).push(() => {
    const st = game.player?.state;
    if (st?.inVehicle && st.vehicle && !st.vehicle.isBoat)
      S.lastCar = st.vehicle.typeKey || st.vehicle.type || st.vehicle.kind || S.lastCar;
    if (S.on && S.lock) {
      installLaw();
      clearLaw();
    }
    if (S.on && S.money) topUp();
  });

  paint();
  if (S.on && S.lock) {
    installLaw();
    clearLaw();
  }
  game.dev = {
    get on() {
      return S.on;
    },
    get policeLock() {
      return S.on && S.lock;
    },
    get busy() {
      return S.busy;
    },
    get lastTeleport() {
      return S.lastTeleport || null;
    },
    setOn,
    setPoliceLock,
    setMoney,
    get infiniteMoney() {
      return S.on && S.money;
    },
    teleportTo,
    openCodes,
    closeCodes,
    code: () => CODE.length,
  };
}
