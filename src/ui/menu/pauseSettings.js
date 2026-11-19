// SOUTHLINE: the pause menu's Settings and Controls pages (one settings menu: the old short pause list and the separate
// "All settings" screen are merged here). Rows come from the settings schema (src/ui/settings/schema.js) through the
// settings store, so every change applies live and persists. One scrolling list in clear sections, a section rail on the
// left, the focused row's description at the bottom, and Codes (dev mode) as the last section.
// Navigation: the pause menu's focus scope (src/ui/hud.js) drives these rows (keyboard and controller).
import { esc } from '../core/dom.js';
import { settingRowHTML, bindingsHTML } from './settingsScreen.js';

export const PAUSE_SECTIONS = [
  { id: 'graphics', title: 'Graphics', keys: ['gfxPreset', 'gfxAutoDetect', 'resolutionScale', 'renderDistance', 'shadows', 'reflections', 'antialias', 'vegetation', 'fpsLimit', 'showFps', 'fullscreen'] },
  { id: 'effects', title: 'Effects', keys: ['ambientOcclusion', 'bloom', 'motionBlur', 'depthOfField', 'lensFlare', 'filmGrain'] },
  { id: 'audio', title: 'Audio', keys: ['volMaster', 'volMusic', 'volRadio', 'volSfx', 'volVehicles', 'volAmbience', 'volVoice', 'volUi', 'audioOutput', 'dynamicRange', 'muteOnFocusLoss', 'menuMusic'] },
  { id: 'camera', title: 'Camera & mouse', keys: ['fov', 'mouseSens', 'invertY', 'sprintMode', 'aimMode', 'crouchMode', 'aimAssist', 'driveAssist'] },
  { id: 'pad', title: 'Controller', keys: ['padLayout', 'padSens', 'padDeadzone', 'padInvertY', 'vibration'] },
  { id: 'hud', title: 'HUD & map', keys: ['hudMode', 'uiScale', 'minimapMode', 'minimapSize', 'mapTheme', 'mapSubway', 'mapSubwayMini', 'showObjective', 'showNotifications', 'showStreetNames', 'showHints', 'crosshair', 'safeZone', 'letterbox', 'hudCentered'] },
  { id: 'subs', title: 'Subtitles', keys: ['subtitles', 'subtitleSize', 'subtitleBackground', 'subtitleSpeaker', 'subtitleAmbient', 'subtitlePreview'] },
  { id: 'access', title: 'Accessibility', keys: ['colorblind', 'highContrast', 'reducedMotion', 'reduceFlashes', 'phoneWalk'] },
  { id: 'game', title: 'Game', keys: ['units', 'clock24h', 'language', 'autosaveMinutes', 'resetAll'] },
  { id: 'codes', title: 'Codes', keys: ['devMode', 'codes'] },
];

/** Mounts the Settings page into `host`. Returns { render(keepKey), section(id) }. */
export function mountPauseSettings(game, ctx, host) {
  const S = ctx.settings, B = ctx.bindings, t = ctx.t;
  const all = S.schema.flatMap((x) => x.sections.flatMap((s) => s.items));
  const def = (k) => S.item(k) || all.find((x) => x.key === k) || null;
  host.innerHTML = `<div class="pz-set">
      <nav class="pz-rail">${PAUSE_SECTIONS.map((s) => `<button class="pz-rail-b" data-sec="${s.id}">${esc(t(s.title))}</button>`).join('')}</nav>
      <div class="pz-col"><div class="pz-body ps-scroll"></div><div class="pz-desc"><b></b><p></p></div></div>
    </div>`;
  const body = host.querySelector('.pz-body'), descB = host.querySelector('.pz-desc b'), descP = host.querySelector('.pz-desc p');
  const rail = [...host.querySelectorAll('.pz-rail-b')];

  function codesRow() {
    const on = !!game?.dev?.on;
    return `<div class="pm-row pz-codes" data-nav data-key="codes" data-kind="codes"><span class="pm-row-l">${esc(t('Enter a code'))}</span>${on ? '<span class="pz-chip">DEV MODE ON</span>' : ''}<span class="pz-btn">${esc(t('Enter code'))}</span></div>`;
  }
  // Dev mode (user, Nov 19): a plain toggle. Turning it ON asks for the dev code every time (the code panel, which turns it
  // on and closes); turning it OFF needs nothing.
  function devRow() {
    const on = !!game?.dev?.on;
    return `<div class="pm-row" data-nav data-key="devMode" data-kind="devmode"><span class="pm-row-l">${esc(t('Dev mode'))}</span><span class="pm-tog${on ? ' on' : ''}"><i></i></span><span class="pm-row-v">${on ? esc(t('On')) : esc(t('Off'))}</span></div>`;
  }
  function setDev(want) {
    const D = game?.dev; if (!D) return;
    if (!want) { if (D.on) { D.setOn(false); ctx.notify?.('Dev mode OFF', 1800); } render('devMode'); return; }
    if (D.on) return;
    D.openCodes({ unlock: true, closeOnSuccess: true, onClose: () => { if (host.isConnected) render('devMode'); } });
  }
  function row(k) {
    if (k === 'codes') return codesRow();
    if (k === 'devMode') return devRow();
    const it = def(k); if (!it) return '';
    return settingRowHTML(game, S, B, t, it);
  }
  function render(keepKey) {
    const top = body.scrollTop;
    body.innerHTML = PAUSE_SECTIONS.map((s) => {
      const rows = s.keys.map(row).join('');
      return rows ? `<section data-sec="${s.id}"><h3>${esc(t(s.title))}</h3>${rows}</section>` : '';
    }).join('') + `<div class="pz-foot-note">${esc(t('Settings are saved on this device and apply instantly.'))}</div>`;
    body.scrollTop = top;
    paintRail();
    if (keepKey) host.dispatchEvent(new CustomEvent('pz:refocus', { bubbles: true, detail: { sel: `[data-key="${keepKey}"]` } }));
  }
  function paintRail() {
    const secs = [...body.querySelectorAll('section')];
    const y = body.scrollTop + 40;
    let cur = secs[0]?.dataset.sec;
    for (const s of secs) if (s.offsetTop <= y) cur = s.dataset.sec;
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4 && secs.length) cur = secs[secs.length - 1].dataset.sec;
    rail.forEach((b) => b.classList.toggle('on', b.dataset.sec === cur));
  }
  function section(id) { const s = body.querySelector(`section[data-sec="${id}"]`); if (s) body.scrollTo({ top: s.offsetTop - 4, behavior: 'smooth' }); return s; }
  body.addEventListener('scroll', paintRail, { passive: true });
  host.addEventListener('click', (e) => { const b = e.target.closest('.pz-rail-b'); if (b) { ctx.sfx('tab'); const s = section(b.dataset.sec); const f = s?.querySelector('[data-nav]'); if (f) host.dispatchEvent(new CustomEvent('pz:refocus', { bubbles: true, detail: { el: f, how: 'mouse' } })); } });

  function describe(e) {
    const k = e?.dataset?.key || e?.closest?.('[data-key]')?.dataset.key;
    if (k === 'devMode') { descB.textContent = t('Dev mode'); descP.textContent = t('Teleport, time and weather keys, police lock and infinite money. Turning it on asks for the dev code.'); return; }
    if (k === 'codes') { descB.textContent = t('Codes'); descP.textContent = game?.dev?.on ? t('Dev mode is on. The code panel has the dev switches and turns it off.') : t('Type a code with the keyboard, the number keys or the keypad.'); return; }
    const it = k && def(k);
    descB.textContent = it ? t(it.label || '') : ''; descP.textContent = it?.desc ? t(it.desc) : '';
  }
  function adjust(e, dir) {
    if (e.dataset.key === 'devMode') { ctx.sfx('move'); setDev(!game?.dev?.on); return; }
    const k = e.dataset.key, it = S.item(k); if (!it) return;
    ctx.sfx('move');
    if (it.type === 'range') S.set(k, S.get(k) + dir * it.step);
    else if (it.type === 'choice') { const i = it.options.findIndex((x) => x.value === S.get(k)); const n = it.options[(i + dir + it.options.length) % it.options.length]; S.set(k, n.value); }
    else if (it.type === 'toggle') S.set(k, !S.get(k));
  }
  host.addEventListener('nav:adjust', (e) => { const r = e.target.closest('[data-key]'); if (r) adjust(r, e.detail.dir); });
  host.addEventListener('nav:focus', (e) => describe(e.target));
  host.addEventListener('pointerover', (e) => { const r = e.target.closest?.('[data-key]'); if (r) describe(r); });
  host.addEventListener('input', (e) => { const r = e.target.closest('[data-key]'); if (r && e.target.type === 'range') { ctx.sfx('move'); S.set(r.dataset.key, +e.target.value); } });
  host.addEventListener('click', (e) => {
    const seg = e.target.closest('.pm-seg'), r = e.target.closest('[data-key]');
    if (!r) return;
    if (seg) { const it = S.item(r.dataset.key); const op = it?.options.find((x) => String(x.value) === seg.dataset.val); if (op) { S.set(r.dataset.key, op.value); ctx.sfx('move'); } return; }
    const it = def(r.dataset.key);
    if (r.dataset.kind === 'toggle') { S.set(r.dataset.key, !S.get(r.dataset.key)); ctx.sfx('select'); }
    else if (r.dataset.kind === 'devmode') { ctx.sfx('select'); setDev(!game?.dev?.on); }
    else if (r.dataset.kind === 'codes') game?.dev?.openCodes?.({ onClose: () => { if (host.isConnected) render('codes'); } });
    else if (r.dataset.kind === 'action') {
      if (it?.action === 'detect') { const d = S.detect(); S.applyPreset(d.preset); ctx.notify?.(`Picked ${d.preset}: ${d.reason}`, 3500); }
      else if (it?.action === 'resetAll') { S.reset(); ctx.notify?.('Every setting is back to its default', 2200); }
      render(r.dataset.key);
    } else if (e.target.closest('.pm-pick i')) { const i = [...r.querySelectorAll('.pm-pick i')].indexOf(e.target.closest('.pm-pick i')); adjust(r, i === 0 ? -1 : 1); }
  });
  // live: re-render just the touched row (everything on preset changes)
  S.on('*', ({ key }) => {
    if (!host.isConnected) return;
    if (key === 'gfxPreset' || !body.querySelector(`[data-key="${key}"]`)) { if (key === 'gfxPreset') render(key); return; }
    const old = body.querySelector(`[data-key="${key}"]`);
    const tmp = document.createElement('div'); tmp.innerHTML = row(key); const n = tmp.firstElementChild;
    if (n) { const foc = old.classList.contains('is-focus'); old.replaceWith(n); if (foc) host.dispatchEvent(new CustomEvent('pz:refocus', { bubbles: true, detail: { el: n } })); }
    if (key.startsWith('subtitle')) { const sp = body.querySelector('.pm-subprev'); if (sp) { const tmp2 = document.createElement('div'); tmp2.innerHTML = settingRowHTML(game, S, B, t, { type: 'custom', widget: 'subtitlePreview' }); sp.replaceWith(tmp2.firstElementChild); } }
  });
  render();
  return { render, section, describe };
}

/** Controls page: the full key list, rebindable (Enter / click a key, then press the new one). */
export function mountPauseControls(game, ctx, host) {
  const B = ctx.bindings;
  function render(sel) {
    host.innerHTML = `<div class="pz-ctl-head"><span>${esc(ctx.t('Click a key to change it. Esc cancels.'))}</span><button class="pz-btn ghost" data-nav data-reset-binds>${esc(ctx.t('Restore default keys'))}</button></div><div class="pz-ctl-body ps-scroll">${bindingsHTML(B)}</div>`;
    if (sel) host.dispatchEvent(new CustomEvent('pz:refocus', { bubbles: true, detail: { sel } }));
  }
  host.addEventListener('click', async (e) => {
    if (e.target.closest('[data-reset-binds]')) { try { B.resetAll?.(); } catch (err) { /* */ } ctx.sfx('select'); render('[data-reset-binds]'); return; }
    const kb = e.target.closest('[data-bind]'); if (!kb || kb.disabled) return;
    kb.classList.add('listening'); kb.innerHTML = '<span class="pm-key-wait">Press a key</span>';
    const code = await B.capture('key');
    if (code) { const lost = B.setKey(kb.dataset.bind, +kb.dataset.slot, code); if (lost.length) ctx.notify?.(`Moved from: ${lost.map((x) => x.label).join(', ')}`, 2500); }
    render(`[data-bind="${kb.dataset.bind}"][data-slot="${kb.dataset.slot}"]`);
  });
  B.on?.('change', () => { if (host.isConnected && !host.querySelector('.listening')) render(); });
  render();
  return { render };
}
