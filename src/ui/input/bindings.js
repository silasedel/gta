// SOUTHLINE UI: input layer. Full key rebinding, controller support (Gamepad API), UI navigation events and
// key glyphs that follow the current bindings and the last-used device.
//
// How rebinding works without touching anyone's code:
//   Game code keeps asking for its DEFAULT ("canonical") key, e.g. input.pressed('KeyF') or e.code === 'KeyF'.
//   This layer sits first in the window capture chain (its listeners are installed when this module is imported,
//   before any game system exists). When the player has re-bound an action, the physical key event is swallowed and
//   a synthetic event carrying the canonical code is dispatched instead. With default bindings the layer is
//   transparent (events pass through untouched). Controller buttons are turned into the same canonical events, so
//   every system that listens to the keyboard also works on a controller. Mouse buttons use codes 'Mouse0'..'Mouse4'.
//
// Other tracks: register your actions so they appear in Settings > Controls and can be re-bound:
//   game.bindings.register({ id: 'air.gear', label: 'Landing gear', group: 'Aircraft', context: 'air', key: 'KeyG', pad: 'Y' })
//   game.bindings.glyph('enterVehicle')  -> HTML for the current key or controller button
//   game.input.padMove {x, y}, game.input.padLook {x, y}, game.input.padTrigger {l, r}  (analog values, 0 when no pad)
import { emitter, store, clamp } from '../core/dom.js';

const CTX_ANY = 'any';
// id, label, group, context, default key (canonical code), default alternate, default pad button, flags
const A = (id, label, group, context, key, pad = null, extra = {}) => ({ id, label, group, context, key, alt: extra.alt || null, pad, ...extra });
export const DEFAULT_ACTIONS = [
  A('moveForward', 'Move forward', 'On foot', 'foot', 'KeyW', 'LS_UP'),
  A('moveBack', 'Move back', 'On foot', 'foot', 'KeyS', 'LS_DOWN'),
  A('moveLeft', 'Move left', 'On foot', 'foot', 'KeyA', 'LS_LEFT'),
  A('moveRight', 'Move right', 'On foot', 'foot', 'KeyD', 'LS_RIGHT'),
  A('sprint', 'Sprint', 'On foot', 'foot', 'ShiftLeft', 'L3', { toggleable: 'sprint' }),
  A('walk', 'Walk slowly', 'On foot', 'foot', 'AltLeft', null),
  A('jump', 'Jump / climb / swim up', 'On foot', 'foot', 'Space', 'A'),
  A('crouch', 'Crouch / dive', 'On foot', 'foot', 'KeyC', 'B', { alt: 'ControlLeft', toggleable: 'crouch' }),
  A('interact', 'Interact / talk', 'On foot', 'foot', 'KeyE', 'X'),
  A('grab', 'Pick up / steal', 'On foot', 'foot', 'KeyG', 'RIGHT'),
  A('enterVehicle', 'Enter vehicle', 'On foot', 'foot', 'KeyF', 'Y'),
  A('cover', 'Take cover / next weapon', 'On foot', 'foot', 'KeyQ', 'RB'),
  A('activity', 'Start activity', 'On foot', 'foot', 'KeyJ', null),
  A('fire', 'Attack / fire', 'Combat', CTX_ANY, 'Mouse0', 'RT'),
  A('aim', 'Aim', 'Combat', CTX_ANY, 'Mouse2', 'LT', { toggleable: 'aim' }),
  A('reload', 'Reload', 'Combat', 'foot', 'KeyR', 'X'),
  A('weaponWheel', 'Weapon wheel (hold)', 'Combat', CTX_ANY, 'Tab', 'LB'),
  A('swapShoulder', 'Swap aiming shoulder', 'Combat', 'foot', 'KeyV', 'R3'),
  A('lockOn', 'Lock on', 'Combat', 'foot', 'KeyX', null),
  A('flashlight', 'Weapon light', 'Combat', 'foot', 'KeyT', null),
  A('laser', 'Weapon laser', 'Combat', 'foot', 'KeyB', null),
  A('accelerate', 'Accelerate', 'Vehicle', 'vehicle', 'KeyW', 'RT'),
  A('brake', 'Brake / reverse', 'Vehicle', 'vehicle', 'KeyS', 'LT'),
  A('steerLeft', 'Steer left', 'Vehicle', 'vehicle', 'KeyA', 'LS_LEFT'),
  A('steerRight', 'Steer right', 'Vehicle', 'vehicle', 'KeyD', 'LS_RIGHT'),
  A('handbrake', 'Handbrake', 'Vehicle', 'vehicle', 'Space', 'A'),
  A('horn', 'Horn', 'Vehicle', 'vehicle', 'KeyH', 'L3'),
  A('exitVehicle', 'Exit vehicle', 'Vehicle', 'vehicle', 'KeyF', 'Y'),
  A('vehicleFire', 'Drive-by fire', 'Vehicle', 'vehicle', 'Mouse0', 'RB'),
  A('radioNext', 'Radio: next station', 'Vehicle', 'vehicle', 'Period', 'RIGHT'),
  A('radioPrev', 'Radio: previous station', 'Vehicle', 'vehicle', 'Comma', 'LEFT'),
  A('headlights', 'Headlights', 'Vehicle', 'vehicle', 'KeyL', null),
  // canonical ArrowUp (what the HUD listens for); P is the default primary key, Arrow Up the alternate
  A('phone', 'Phone', 'General', CTX_ANY, 'ArrowUp', 'UP', { bind: ['KeyP', 'ArrowUp'] }),
  A('map', 'Map', 'General', CTX_ANY, 'KeyM', 'BACK'),
  A('pause', 'Pause menu', 'General', CTX_ANY, 'Escape', 'START', { fixed: true }),
  A('photo', 'Hide HUD (photo)', 'General', CTX_ANY, 'F8', null),
  A('quickSave', 'Quick save', 'General', CTX_ANY, 'F5', null),
  A('pushToTalk', 'Push to talk (multiplayer)', 'General', CTX_ANY, 'KeyN', 'DOWN'),
  A('textChat', 'Text chat (multiplayer)', 'General', CTX_ANY, 'KeyY', null),
];

// ---- labels for codes ----
const CODE_LABEL = {
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R Shift', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt', MetaLeft: 'Cmd', MetaRight: 'R Cmd',
  Tab: 'Tab', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Num Enter', Backspace: 'Bksp', CapsLock: 'Caps', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
};
export function codeLabel(code) {
  if (!code) return '';
  if (CODE_LABEL[code]) return CODE_LABEL[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}
const LABEL_TO_CODE = (() => { const m = new Map(); for (const [c, l] of Object.entries(CODE_LABEL)) m.set(l.toLowerCase(), c); for (let i = 65; i <= 90; i++) m.set(String.fromCharCode(i).toLowerCase(), 'Key' + String.fromCharCode(i)); for (let i = 0; i <= 9; i++) m.set(String(i), 'Digit' + i); for (const [l, c] of [['shift', 'ShiftLeft'], ['ctrl', 'ControlLeft'], ['control', 'ControlLeft'], ['alt', 'AltLeft'], ['esc', 'Escape'], ['escape', 'Escape'], ['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight'], ['▲', 'ArrowUp'], ['▼', 'ArrowDown'], ['◀', 'ArrowLeft'], ['▶', 'ArrowRight'], ['lmb', 'Mouse0'], ['rmb', 'Mouse2'], ['click', 'Mouse0'], ['backspace', 'Backspace'], ['space', 'Space'], ['spacebar', 'Space'], ['enter', 'Enter'], ['tab', 'Tab']]) m.set(l, c); return m; })();
function keyOf(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return ({ Space: ' ', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', ShiftLeft: 'Shift', ControlLeft: 'Control', AltLeft: 'Alt', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Period: '.', Comma: ',' })[code] || code;
}

// ---- controller ----
export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME'];
const PAD_LABEL = { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', BACK: 'View', START: 'Menu', L3: 'L3', R3: 'R3', UP: 'D↑', DOWN: 'D↓', LEFT: 'D←', RIGHT: 'D→', LS_UP: 'L↑', LS_DOWN: 'L↓', LS_LEFT: 'L←', LS_RIGHT: 'L→', LS: 'L', RS: 'R' };
export const padLabel = (b) => PAD_LABEL[b] || b || '';
// Controller layout presets: overrides of the default pad button per action.
export const PAD_LAYOUTS = {
  standard: { label: 'Standard', map: {} },
  bumper: { label: 'Bumper drive', map: { accelerate: 'RB', brake: 'LB', vehicleFire: 'RT', handbrake: 'X' } },
  southpaw: { label: 'Southpaw', map: {}, swapSticks: true },
  classic: { label: 'Face-button drive', map: { accelerate: 'A', brake: 'X', handbrake: 'RB', vehicleFire: 'RT' } },
};

// =====================================================================================================
// Raw listeners: installed at import time so they run before every other listener on window.
// =====================================================================================================
const synthetic = new WeakSet();
let active = null; // the bindings instance that receives raw events
function rawKey(e) { if (!active || synthetic.has(e)) return; active._key(e); }
function rawMouse(e) { if (!active || synthetic.has(e)) return; active._mouse(e); }
if (typeof window !== 'undefined' && !window.__psBindingsInstalled) {
  window.__psBindingsInstalled = true;
  window.addEventListener('keydown', rawKey, true);
  window.addEventListener('keyup', rawKey, true);
  window.addEventListener('mousedown', rawMouse, true);
  window.addEventListener('mouseup', rawMouse, true);
}
function synthKey(type, code, repeat = false) {
  const ev = new KeyboardEvent(type, { code, key: keyOf(code), bubbles: true, cancelable: true, repeat });
  synthetic.add(ev); (document.body || window).dispatchEvent(ev);
}
function synthMouse(type, button) {
  const ev = new MouseEvent(type, { button, buttons: type === 'mousedown' ? (button === 0 ? 1 : button === 2 ? 2 : 4) : 0, bubbles: true, cancelable: true });
  synthetic.add(ev); (document.querySelector('canvas#game') || document.body || window).dispatchEvent(ev);
}
const isMouseCode = (c) => /^Mouse\d$/.test(c || '');
function synth(code, down, repeat) { if (isMouseCode(code)) { if (!repeat) synthMouse(down ? 'mousedown' : 'mouseup', +code.slice(5)); } else synthKey(down ? 'keydown' : 'keyup', code, repeat); }
const isTextTarget = (t) => !!t && (t.tagName === 'INPUT' ? !/^(range|checkbox|radio|button)$/i.test(t.type) : t.tagName === 'TEXTAREA' || t.isContentEditable);

export function createBindings(game, opts = {}) {
  const ev = emitter();
  const STORE_KEY = opts.storeKey || 'portsolana.v2.bindings';
  const actions = new Map();
  for (const a of DEFAULT_ACTIONS) actions.set(a.id, { ...a });
  let saved = store.get(STORE_KEY, {}) || {};
  let user = saved.keys || {};      // id -> [key, alt]
  let userPad = saved.pad || {};    // id -> button
  let layout = PAD_LAYOUTS[saved.layout] ? saved.layout : 'standard';
  const cfg = { toggle: { sprint: false, aim: false, crouch: false }, padSens: 1, padDeadzone: 0.18, padInvertY: false, invertY: false, vibration: true, ...(opts.config || {}) };
  let device = 'kbm';
  const modes = [];                 // stack of { kind: 'ui' | 'phone' | 'capture' }
  const held = new Set();           // physical codes held (all modes)
  const emitted = new Map();        // physical code -> canonical codes we synthesized on keydown
  const latched = new Map();        // toggle actions: canonical code -> bool
  const padState = { buttons: {}, axes: [0, 0, 0, 0], connected: false, id: '', repeat: {} };
  let captureResolve = null, captureKind = null;
  let table = null;                 // context -> Map(physical -> [{canon, action}])

  const defKeys = (a) => (a.bind ? [a.bind[0] ?? null, a.bind[1] ?? null] : [a.key, a.alt]);
  const keysOf = (a) => { const u = user[a.id]; return u ? [u[0] ?? null, u[1] ?? null] : defKeys(a); };
  const padOf = (a) => (a.id in userPad ? userPad[a.id] : (PAD_LAYOUTS[layout].map[a.id] ?? a.pad));
  const isDefault = () => !Object.keys(user).length;
  function context() {
    if (game.inputContext) return game.inputContext;
    const st = game.player?.state;
    if (st?.inVehicle) { const v = st.vehicle; return v && (v.isAircraft || v.kind === 'aircraft' || v.kind === 'heli' || v.kind === 'plane') ? 'air' : 'vehicle'; }
    return 'foot';
  }
  function build() {
    table = { foot: new Map(), vehicle: new Map(), air: new Map() };
    for (const a of actions.values()) {
      const ctxs = a.context === CTX_ANY ? ['foot', 'vehicle', 'air'] : [a.context];
      for (const c of ctxs) { const t = table[c] || (table[c] = new Map()); for (const k of keysOf(a)) { if (!k) continue; let arr = t.get(k); if (!arr) t.set(k, (arr = [])); if (!arr.some((x) => x.canon === a.key)) arr.push({ canon: a.key, action: a }); } }
    }
  }
  build();
  function persist() { store.set(STORE_KEY, { keys: user, pad: userPad, layout }); ev.emit('change', api); try { game.emit?.('bindings:changed', api); } catch (e) { /* */ } }
  const mode = () => (modes.length ? modes[modes.length - 1].kind : 'game');
  function setDevice(d) { if (d === device) return; device = d; ev.emit('device', d); try { game.emit?.('input:device', d); } catch (e) { /* */ } }

  // ---------------------------------------------------------------- actions out
  function fireAction(a, down, src) { ev.emit('action', { id: a.id, down, src, action: a }); ev.emit((down ? 'down:' : 'up:') + a.id, { src }); }
  function actionsFor(code, ctx = context()) { return table[ctx]?.get(code) || []; }

  // ---------------------------------------------------------------- UI navigation
  const NAV_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Enter: 'accept', NumpadEnter: 'accept', Space: 'accept', Escape: 'back', Backspace: 'back', KeyQ: 'tabPrev', KeyE: 'tabNext', BracketLeft: 'tabPrev', BracketRight: 'tabNext', Tab: 'next', KeyF: 'alt1', KeyR: 'alt2', KeyX: 'alt3', Delete: 'alt3', KeyP: 'start', KeyM: 'select', PageUp: 'pageUp', PageDown: 'pageDown', Home: 'home', End: 'end' };
  const PHONE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Backspace', 'Escape']);
  const NAV_PAD = { UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right', LS_UP: 'up', LS_DOWN: 'down', LS_LEFT: 'left', LS_RIGHT: 'right', A: 'accept', B: 'back', LB: 'tabPrev', RB: 'tabNext', X: 'alt1', Y: 'alt2', START: 'start', BACK: 'select', LT: 'pageUp', RT: 'pageDown', R3: 'alt3' };
  function nav(dir, src, e) { const d = { dir, src, repeat: !!e?.repeat, shift: !!e?.shiftKey, handled: false, raw: e || null }; ev.emit('nav', d); return d; }

  // ---------------------------------------------------------------- keyboard
  function swallow(e) { e.stopImmediatePropagation(); }
  function _key(e) {
    const down = e.type === 'keydown', code = e.code;
    if (!code) return;
    if (down) held.add(code); else held.delete(code);
    if (down && !e.repeat) setDevice('kbm');
    const m = mode();
    if (m === 'capture') {
      swallow(e); e.preventDefault();
      if (down && !e.repeat && captureKind !== 'pad') { const r = captureResolve; captureResolve = null; modes.pop(); r?.(code === 'Escape' ? null : code); }
      return;
    }
    if (m === 'ui') {
      // Menus own the keyboard. Text fields keep typing; Enter and Escape still navigate.
      const text = isTextTarget(e.target);
      if (/^F\d+$/.test(code) || e.metaKey) return;     // dev overlay and browser shortcuts stay untouched
      swallow(e);
      if (text && !['Enter', 'NumpadEnter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown'].includes(code)) return;
      if (['Tab', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace'].includes(code) && !text) e.preventDefault();
      if (code === 'Tab') e.preventDefault();
      ev.emit('uikey', { code, down, repeat: e.repeat, raw: e });
      if (down) { const dir = code === 'Tab' && e.shiftKey ? 'prev' : NAV_KEYS[code]; if (dir && !(text && (dir === 'up' || dir === 'down') && e.target.tagName === 'TEXTAREA')) nav(dir, 'kbm', e); }
      return;
    }
    if (m === 'phone') {
      // Phone up: arrows, Enter, Backspace and digits drive the phone; everything else still reaches the game (walk and talk).
      const PH = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'accept', NumpadEnter: 'accept', Backspace: 'back', Escape: 'back' };
      const text = isTextTarget(e.target);
      if (text) { swallow(e); if (down && (code === 'Enter' || code === 'Escape')) nav(code === 'Enter' ? 'accept' : 'back', 'kbm', e); return; }
      if (PH[code] || /^Digit\d$/.test(code)) { swallow(e); e.preventDefault(); if (down) { if (PH[code]) nav(PH[code], 'kbm', e); else ev.emit('digit', +code.slice(5)); } return; }
    }
    // ---- game mode (and pass-through part of phone mode) ----
    if (e.metaKey || (e.ctrlKey && code !== 'ControlLeft' && code !== 'ControlRight')) return; // browser shortcuts stay untouched
    const ctx = context();
    const hits = actionsFor(code, ctx);
    if (!down) {
      const was = emitted.get(code);
      for (const h of actionsFor(code, ctx)) fireAction(h.action, false, 'kbm');
      if (was) { emitted.delete(code); swallow(e); for (const c of was) if (!latched.get(c)) synth(c, false); return; }
      return;
    }
    if (!e.repeat) for (const h of hits) fireAction(h.action, true, 'kbm');
    // toggle (latch) handling and re-mapping
    const needToggle = hits.some((h) => h.action.toggleable && cfg.toggle[h.action.toggleable]);
    const identity = hits.length ? hits.every((h) => h.canon === code) : !isCanonicalSomewhere(code, ctx);
    if (identity && !needToggle) return;                    // default binding: let the real event through
    swallow(e); e.preventDefault();
    if (!hits.length) return;                               // key's default action was moved elsewhere: now unbound
    const out = [];
    for (const h of hits) {
      if (h.action.toggleable && cfg.toggle[h.action.toggleable]) {
        if (e.repeat) continue;
        const on = !latched.get(h.canon); latched.set(h.canon, on); synth(h.canon, on); ev.emit('latch', { id: h.action.id, on });
      } else { synth(h.canon, true, e.repeat); out.push(h.canon); }
    }
    if (out.length) emitted.set(code, out);
  }
  const anyToggle = () => cfg.toggle.sprint || cfg.toggle.aim || cfg.toggle.crouch;
  function isCanonicalSomewhere(code, ctx) { for (const a of actions.values()) if (a.key === code && (a.context === CTX_ANY || a.context === ctx)) return true; return false; }

  // ---------------------------------------------------------------- mouse buttons
  function _mouse(e) {
    const down = e.type === 'mousedown', code = 'Mouse' + e.button;
    if (down) { held.add(code); setDevice('kbm'); } else held.delete(code);
    const m = mode();
    if (m === 'capture') {
      if (captureKind === 'pad') return;
      if (down && e.target?.closest?.('[data-capture-cancel]')) return;
      swallow(e); e.preventDefault();
      if (down) { const r = captureResolve; captureResolve = null; modes.pop(); r?.(code); }
      return;
    }
    if (m === 'ui') { if (e.target === game.renderer?.domElement || e.target?.id === 'game') swallow(e); return; }  // clicks reach the UI, never the game canvas
    if (m === 'phone') { if (document.pointerLockElement) { swallow(e); if (down) nav(e.button === 2 ? 'back' : 'accept', 'kbm', e); } return; }
    if (!document.pointerLockElement && e.target?.closest?.('.ps-interactive, .ps-ui button, .ps-ui input')) return; // DOM UI click
    const ctx = context(), hits = actionsFor(code, ctx);
    if (!down) {
      for (const h of hits) fireAction(h.action, false, 'kbm');
      const was = emitted.get(code);
      if (was) { emitted.delete(code); swallow(e); for (const c of was) if (!latched.get(c)) synth(c, false); }
      return;
    }
    for (const h of hits) fireAction(h.action, true, 'kbm');
    const needToggle = hits.some((h) => h.action.toggleable && cfg.toggle[h.action.toggleable]);
    const identity = hits.length ? hits.every((h) => h.canon === code) : !isCanonicalSomewhere(code, ctx);
    if (identity && !needToggle) return;
    swallow(e); e.preventDefault();
    const out = [];
    for (const h of hits) {
      if (h.action.toggleable && cfg.toggle[h.action.toggleable]) { const on = !latched.get(h.canon); latched.set(h.canon, on); synth(h.canon, on); ev.emit('latch', { id: h.action.id, on }); }
      else { synth(h.canon, true); out.push(h.canon); }
    }
    if (out.length) emitted.set(code, out);
  }
  function releaseAll() {
    for (const [, canon] of emitted) for (const c of canon) synth(c, false);
    emitted.clear();
    for (const [c, on] of latched) if (on) synth(c, false);
    latched.clear();
    for (const b of Object.keys(padState.down || {})) padRelease(b);
  }
  if (typeof window !== 'undefined') window.addEventListener('blur', () => { held.clear(); releaseAll(); });

  // ---------------------------------------------------------------- gamepad
  padState.down = {};  // button -> canonical codes synthesized
  function padRelease(b) { const was = padState.down[b]; if (!was) return; delete padState.down[b]; for (const c of was) synth(c, false); }
  function padActions(btn, ctx) { const out = []; for (const a of actions.values()) if (padOf(a) === btn && (a.context === CTX_ANY || a.context === ctx)) out.push(a); return out; }
  function padButton(btn, down) {
    if (down) setDevice('pad');
    const m = mode();
    if (m === 'capture') { if (down && captureKind !== 'key') { const r = captureResolve; captureResolve = null; modes.pop(); r?.(btn === 'START' ? null : btn); } return; }
    // 'pause' (the pause menu): the controller navigates like 'ui' while the keyboard still reaches the game's own key
    // listeners (map pan, dev keys), which the pause menu reads itself
    if (m === 'ui' || m === 'pause' || (m === 'phone' && ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B'].includes(btn))) {
      ev.emit('uipad', { btn, down });
      if (!down) padRelease(btn);   // a game key synthesized before the menu opened (START -> Escape) still gets its keyup
      if (down) { const dir = NAV_PAD[btn]; if (dir) nav(dir, 'pad'); padState.repeat[btn] = performance.now() + 380; } else delete padState.repeat[btn];
      return;
    }
    const ctx = context();
    if (!down) { for (const a of padActions(btn, ctx)) fireAction(a, false, 'pad'); padRelease(btn); return; }
    const out = [];
    for (const a of padActions(btn, ctx)) { fireAction(a, true, 'pad'); if (!out.includes(a.key)) { synth(a.key, true); out.push(a.key); } }
    if (out.length) padState.down[btn] = out;
  }
  const dz = (v) => { const d = cfg.padDeadzone, a = Math.abs(v); return a < d ? 0 : Math.sign(v) * (a - d) / (1 - d); };
  let padRaf = 0, padLast = 0;
  function pollPad(now) {
    padRaf = requestAnimationFrame(pollPad);
    const dt = Math.min(0.05, (now - (padLast || now)) / 1000); padLast = now;
    let gp = null;
    try { const all = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of all) if (g && g.connected !== false && g.buttons?.length >= 10) { gp = g; break; } } catch (e) { /* */ }
    const inp = game.input || {};
    if (!gp) {
      if (padState.connected) { padState.connected = false; for (const b of Object.keys(padState.buttons)) if (padState.buttons[b]) { padState.buttons[b] = false; padButton(b, false); } ev.emit('pad', { connected: false }); if (inp.padMove) { inp.padMove.x = inp.padMove.y = 0; inp.padLook.x = inp.padLook.y = 0; inp.padTrigger.l = inp.padTrigger.r = 0; } setDevice('kbm'); }
      return;
    }
    if (!padState.connected) { padState.connected = true; padState.id = gp.id || 'Controller'; ev.emit('pad', { connected: true, id: padState.id }); }
    const sw = !!PAD_LAYOUTS[layout].swapSticks;
    const ax = gp.axes || [];
    const lx = dz(ax[sw ? 2 : 0] || 0), ly = dz(ax[sw ? 3 : 1] || 0), rx = dz(ax[sw ? 0 : 2] || 0), ry = dz(ax[sw ? 1 : 3] || 0);
    padState.axes = [lx, ly, rx, ry];
    const B = {};
    PAD_BUTTONS.forEach((n, i) => { const b = gp.buttons[i]; B[n] = !!b && (b.pressed || b.value > 0.5); });
    B.LS_UP = ly < -0.5; B.LS_DOWN = ly > 0.5; B.LS_LEFT = lx < -0.5; B.LS_RIGHT = lx > 0.5;
    for (const n of Object.keys(B)) { if (B[n] !== !!padState.buttons[n]) { padState.buttons[n] = B[n]; padButton(n, B[n]); } }
    if (Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.3) setDevice('pad');
    const m = mode();
    if (m === 'ui' || m === 'phone' || m === 'pause') {
      for (const n of Object.keys(padState.repeat)) if (now > padState.repeat[n] && B[n]) { const dir = NAV_PAD[n]; if (dir && ['up', 'down', 'left', 'right', 'pageUp', 'pageDown'].includes(dir)) nav(dir, 'pad', { repeat: true }); padState.repeat[n] = now + 110; }
      if (m === 'ui' || m === 'pause') ev.emit('padaxes', { lx, ly, rx, ry, lt: gp.buttons[6]?.value || 0, rt: gp.buttons[7]?.value || 0, dt, mode: m });
      if (m === 'ui' || m === 'pause') return;
    }
    // analog values for systems that want them, plus right-stick camera through the mouse-look path
    if (!inp.padMove) { inp.padMove = { x: 0, y: 0 }; inp.padLook = { x: 0, y: 0 }; inp.padTrigger = { l: 0, r: 0 }; }
    inp.padMove.x = lx; inp.padMove.y = ly; inp.padLook.x = rx; inp.padLook.y = ry;
    inp.padTrigger.l = gp.buttons[6]?.value || 0; inp.padTrigger.r = gp.buttons[7]?.value || 0;
    if ((rx || ry) && !game.ui?.paused) {
      const k = 1500 * cfg.padSens * dt, curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
      inp.mouseDX = (inp.mouseDX || 0) + curve(rx) * k;
      inp.mouseDY = (inp.mouseDY || 0) + curve(ry) * k * 0.7 * (cfg.padInvertY ? -1 : 1);
    }
  }
  if (typeof requestAnimationFrame !== 'undefined') padRaf = requestAnimationFrame(pollPad);
  function rumble(strength = 0.5, ms = 160) {
    if (!cfg.vibration || device !== 'pad') return;
    try { const all = navigator.getGamepads?.() || []; for (const g of all) g?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: clamp(strength, 0, 1), weakMagnitude: clamp(strength * 0.7, 0, 1) }); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------- mouse Y inversion (through game.input.mouseDY)
  function installInvert() {
    const inp = game.input; if (!inp || inp.__psInvert) return;
    let cur = inp.mouseDY || 0;
    try {
      Object.defineProperty(inp, 'mouseDY', { configurable: true, enumerable: true, get: () => cur, set: (v) => { if (v === 0) { cur = 0; return; } const d = v - cur; cur += cfg.invertY ? -d : d; } });
      inp.__psInvert = true;
    } catch (e) { /* input object is frozen: inversion unavailable */ }
  }
  installInvert();

  // ---------------------------------------------------------------- glyphs
  const MOUSE_SVG = (b) => `<svg viewBox="0 0 20 28"><rect x="1.5" y="1.5" width="17" height="25" rx="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.5v10M1.5 11.5h17" stroke="currentColor" stroke-width="1.2" fill="none"/>${b === 0 ? '<path d="M9.4 2.3C5.4 2.6 2.3 5.8 2.3 9.9v1h7.1z" fill="currentColor"/>' : b === 2 ? '<path d="M10.6 2.3c4 .3 7.1 3.5 7.1 7.6v1h-7.1z" fill="currentColor"/>' : '<rect x="8.4" y="4.2" width="3.2" height="6" rx="1.6" fill="currentColor"/>'}</svg>`;
  function codeGlyph(code) {
    if (!code) return '<span class="ps-key" style="opacity:.5">—</span>';
    if (/^Mouse[012]$/.test(code)) return `<span class="ps-key mouse" title="${codeLabel(code)}">${MOUSE_SVG(+code.slice(5))}</span>`;
    const l = codeLabel(code);
    return `<span class="ps-key${l.length > 1 ? ' wide' : ''}">${l.replace(/[<&]/g, '')}</span>`;
  }
  function padGlyph(btn) {
    if (!btn) return '<span class="ps-key pad" style="opacity:.5">—</span>';
    const face = { A: '#3ddc84', B: '#ff4757', X: '#4d8dff', Y: '#ffc247' }[btn];
    if (face) return `<span class="ps-key pad" style="box-shadow:inset 0 0 0 1.5px ${face};color:${face}">${btn}</span>`;
    return `<span class="ps-key pad shoulder">${padLabel(btn)}</span>`;
  }
  /** HTML glyph for an action in the current context and device. */
  function glyph(id, o = {}) {
    const a = actions.get(id); if (!a) return '';
    const dev = o.device || device;
    if (dev === 'pad') { const p = padOf(a); if (p) return padGlyph(p); }
    const ks = keysOf(a); return codeGlyph(ks[0] || ks[1]);
  }
  /** Glyph for whatever currently triggers a canonical code (used to rewrite prompts written with default keys). */
  function glyphForCanonical(code, ctx = context()) {
    for (const a of actions.values()) if (a.key === code && (a.context === CTX_ANY || a.context === ctx)) return glyph(a.id);
    return device === 'pad' ? codeGlyph(code) : codeGlyph(code);
  }
  /** Turns 'Press <b>F</b> to enter' / '[F]' / '<kbd>F</kbd>' into live glyph HTML (escapes everything else). */
  function formatPrompt(text) {
    const s = String(text ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    return s.replace(/&lt;(b|kbd)&gt;(.{1,14}?)&lt;\/\1&gt;|\[([^\]]{1,12})\]|\{([a-zA-Z.]{2,24})\}/g, (m0, t, a1, b1, act) => {
      if (act) return actions.has(act) ? glyph(act) : m0;
      const raw = (a1 || b1 || '').trim(), code = LABEL_TO_CODE.get(raw.toLowerCase());
      return code ? glyphForCanonical(code) : `<span class="ps-key wide">${raw}</span>`;
    });
  }

  // ---------------------------------------------------------------- public API
  const api = {
    actions: () => [...actions.values()],
    groups() { const g = new Map(); for (const a of actions.values()) { if (!g.has(a.group)) g.set(a.group, []); g.get(a.group).push(a); } return g; },
    register(def) { if (!def?.id) return; const a = { group: 'Other', context: CTX_ANY, alt: null, pad: null, ...actions.get(def.id), ...def }; actions.set(a.id, a); build(); ev.emit('change', api); return a; },
    keysOf: (id) => (actions.has(id) ? keysOf(actions.get(id)) : [null, null]),
    padOf: (id) => (actions.has(id) ? padOf(actions.get(id)) : null),
    isCustom: (id) => id in user || id in userPad,
    /** Bind a key (slot 0 primary, 1 alternate). Returns the actions that lost this key (same context conflicts). */
    setKey(id, slot, code) {
      const a = actions.get(id); if (!a || a.fixed) return [];
      const lost = [];
      if (code) for (const b of actions.values()) {
        if (b === a || b.fixed) continue;
        const same = a.context === CTX_ANY || b.context === CTX_ANY || a.context === b.context;
        if (!same || b.key === a.key) continue; // actions sharing a canonical key may share a physical key
        const ks = keysOf(b); let ch = false;
        for (let i = 0; i < 2; i++) if (ks[i] === code) { ks[i] = null; ch = true; }
        if (ch) { user[b.id] = ks; lost.push(b); }
      }
      const ks = keysOf(a); ks[slot ? 1 : 0] = code || null; if (code && ks[slot ? 0 : 1] === code) ks[slot ? 0 : 1] = null;
      const dk = defKeys(a); if (ks[0] === dk[0] && ks[1] === dk[1]) delete user[id]; else user[id] = ks;
      for (const b of lost) { const k2 = user[b.id], db = defKeys(b); if (k2 && k2[0] === db[0] && k2[1] === db[1]) delete user[b.id]; }
      releaseAll(); build(); persist(); return lost;
    },
    setPad(id, btn) { const a = actions.get(id); if (!a) return; if ((PAD_LAYOUTS[layout].map[id] ?? a.pad) === btn) delete userPad[id]; else userPad[id] = btn || null; persist(); },
    resetAction(id) { delete user[id]; delete userPad[id]; releaseAll(); build(); persist(); },
    resetAll() { user = {}; userPad = {}; layout = 'standard'; releaseAll(); build(); persist(); },
    get layout() { return layout; },
    setLayout(l) { if (!PAD_LAYOUTS[l]) return; layout = l; userPad = {}; persist(); },
    /** Wait for the next key / mouse button / controller button. kind: 'key' | 'pad' | 'any'. Resolves null on Esc. */
    capture(kind = 'any') { if (captureResolve) { const r = captureResolve; captureResolve = null; modes.pop(); r(null); } captureKind = kind; modes.push({ kind: 'capture' }); return new Promise((res) => { captureResolve = res; }); },
    cancelCapture() { if (captureResolve) { const r = captureResolve; captureResolve = null; modes.pop(); r(null); } },
    /** Enter a UI input mode ('ui' = menus own all input, 'phone' = phone keys only). Returns a function that leaves it. */
    pushMode(kind) {
      const m = { kind };
      // keys held right now would never see their keyup once the mode swallows it: release them for the game first
      if (kind === 'ui' || kind === 'pause') releaseAll();
      for (const c of [...held]) { if (isMouseCode(c)) { if (kind === 'ui') synthMouse('mouseup', +c.slice(5)); continue; } if (kind === 'ui' || PHONE_KEYS.has(c) || /^Digit\d$/.test(c)) synthKey('keyup', c); }
      modes.push(m); ev.emit('mode', mode()); return () => { const i = modes.indexOf(m); if (i >= 0) modes.splice(i, 1); ev.emit('mode', mode()); }; },
    get mode() { return mode(); },
    get device() { return device; },
    get context() { return context(); },
    get pad() { return padState; },
    held: (code) => held.has(code),
    padHeld: (btn) => !!padState.buttons[btn],
    config: cfg,
    configure(c) { Object.assign(cfg, c); if (c.toggle) cfg.toggle = { ...cfg.toggle, ...c.toggle }; if (!anyToggle()) { for (const [k, on] of latched) if (on) synth(k, false); latched.clear(); } },
    on: ev.on, glyph, codeGlyph, padGlyph, glyphForCanonical, formatPrompt, codeLabel, padLabel, rumble, releaseAll,
    synth, // for tests
    destroy() { if (active === api) active = null; cancelAnimationFrame(padRaf); },
    _key, _mouse,
  };
  active = api;
  return api;
}
