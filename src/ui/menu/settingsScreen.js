// SOUTHLINE: the settings screen (main-menu track). Renders src/ui/settings/schema.js through the settings store:
// every change applies live and persists; the world keeps running behind a translucent panel so you see the result.
// Keyboard / controller: arrows move, left / right change a value, Q / E (LB / RB) switch tabs, Esc (B) goes back.
import { el, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';

const TAB_LABEL = {
  graphics: 'Graphics',
  audio: 'Audio',
  controls: 'Controls',
  display: 'Display',
  access: 'Accessibility',
  game: 'Game',
};
const SKIP = new Set([
  'padDiagram',
  'palettePreview',
  'accessNote',
  'saveTools',
  'externalSettings',
]);

/** One settings row as HTML (shared by this screen and the pause menu's Settings tab, src/ui/menu/pauseSettings.js). */
export function settingRowHTML(game, S, B, t, it) {
  const v = S.get(it.key);
  const lab = `<span class="pm-row-l">${esc(t(it.label || ''))}</span>`;
  if (it.type === 'range') {
    const p = ((v - it.min) / (it.max - it.min)) * 100;
    return `<div class="pm-row" data-nav="range" data-key="${it.key}">${lab}<span class="pm-range" style="--p:${p.toFixed(1)}%"><input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}" tabindex="-1"><output>${esc(S.formatValue(it.key))}</output></span></div>`;
  }
  if (it.type === 'toggle')
    return `<div class="pm-row" data-nav data-key="${it.key}" data-kind="toggle">${lab}<span class="pm-tog${v ? ' on' : ''}"><i></i></span><span class="pm-row-v">${v ? t('On') : t('Off')}</span></div>`;
  if (it.type === 'choice') {
    if (it.options.length <= 5)
      return `<div class="pm-row" data-nav="select" data-key="${it.key}">${lab}<span class="pm-segs">${it.options.map((op) => `<button class="pm-seg${op.value === v ? ' on' : ''}" data-val="${esc(String(op.value))}" tabindex="-1">${esc(t(op.label))}</button>`).join('')}</span></div>`;
    return `<div class="pm-row" data-nav="select" data-key="${it.key}">${lab}<span class="pm-pick"><i>${icon('back')}</i><b>${esc(t(S.formatValue(it.key)))}</b><i>${icon('forward')}</i></span></div>`;
  }
  if (it.type === 'action' && it.action === 'devCode') {
    const on = !!game?.dev?.on;
    return `<div class="pm-row" data-nav data-key="${it.key}" data-kind="action">${lab}<span class="pm-row-v">${on ? t('On') : t('Off')}</span><span class="ps-btn${on ? ' danger' : ''}">${esc(t(on ? 'Turn off' : it.button || 'Enter code'))}</span></div>`;
  }
  if (it.type === 'action')
    return `<div class="pm-row" data-nav data-key="${it.key}" data-kind="action">${lab}<span class="ps-btn${it.danger ? ' danger' : ''}">${esc(t(it.button || 'Apply'))}</span></div>`;
  if (it.type === 'custom' && it.widget === 'bindings') return bindingsHTML(B);
  if (it.type === 'custom' && it.widget === 'subtitlePreview')
    return `<div class="pm-subprev" data-size="${S.get('subtitleSize')}" data-bg="${S.get('subtitleBackground')}"><span>${S.get('subtitleSpeaker') ? '<b>MARISOL:</b> ' : ''}Pier 7. After sunset. Don't be late.</span></div>`;
  return '';
}
/** The rebindable key list (every action group, two key slots each). */
export function bindingsHTML(B) {
  let h = '<div class="pm-binds">';
  for (const [g, list] of B.groups()) {
    h += `<div class="pm-bind-grp"><div class="pm-bind-g">${esc(g)}</div>`;
    for (const a of list) {
      const ks = B.keysOf(a.id);
      h += `<div class="pm-bind${B.isCustom(a.id) ? ' custom' : ''}"><span class="pm-row-l">${esc(a.label)}</span>
        <button class="pm-key" data-nav data-bind="${a.id}" data-slot="0"${a.fixed ? ' disabled' : ''}>${B.codeGlyph(ks[0])}</button>
        <button class="pm-key" data-nav data-bind="${a.id}" data-slot="1"${a.fixed ? ' disabled' : ''}>${ks[1] ? B.codeGlyph(ks[1]) : '<span class="pm-key-empty">+</span>'}</button></div>`;
    }
    h += '</div>';
  }
  return h + '</div>';
}

export function openSettingsScreen(game, ctx, o = {}) {
  const S = ctx.settings,
    B = ctx.bindings,
    t = ctx.t;
  const fromPause = o.from === 'pause';
  const leaveUI = fromPause ? B.pushMode('ui') : null;
  const tabs = S.schema.map((x) => x.id);
  let tab = o.tab && tabs.includes(o.tab) ? o.tab : 'graphics';
  let showAdv = false;
  try {
    showAdv = localStorage.getItem('southline.settings.advanced') === '1';
  } catch (e) {
    /* storage blocked */
  }
  const root = el('div', 'pm-set ps-interactive' + (fromPause ? ' from-pause' : ''));
  root.innerHTML = `
    <div class="pm-set-panel">
      <header class="pm-set-head"><span class="pm-kicker">${icon('gear')} ${esc(t('Settings'))}</span>
        <div class="pm-set-tabs">${S.schema.map((x) => `<button class="pm-set-tab" data-tab="${x.id}">${icon(x.icon)}<span>${esc(t(TAB_LABEL[x.id] || x.label))}</span></button>`).join('')}</div></header>
      <div class="pm-set-body ps-scroll"></div>
      <aside class="pm-set-desc"><b></b><p></p></aside>
      <footer class="pm-set-foot ps-hints"></footer>
    </div>`;
  ctx.layer('modal').appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));
  const body = root.querySelector('.pm-set-body'),
    descB = root.querySelector('.pm-set-desc b'),
    descP = root.querySelector('.pm-set-desc p');
  const foot = root.querySelector('.pm-set-foot');
  foot.innerHTML = `<button class="ps-btn ghost pm-set-reset" data-nav>${esc(t('Restore defaults'))}</button>`;

  const row = (it) => settingRowHTML(game, S, B, t, it);
  function render(keepKey) {
    root
      .querySelectorAll('.pm-set-tab')
      .forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const T = S.schema.find((x) => x.id === tab);
    body.innerHTML = T.sections
      .map((sec) => {
        const rows = sec.items
          .filter((it) => !(it.type === 'custom' && SKIP.has(it.widget)) && (showAdv || it.basic))
          .map(row)
          .join('');
        return rows ? `<section><h3>${esc(t(sec.title))}</h3>${rows}</section>` : '';
      })
      .join('');
    body.insertAdjacentHTML(
      'beforeend',
      `<div class="pm-row pm-adv${showAdv ? ' open' : ''}" data-nav data-adv><span class="pm-row-l">${esc(t(showAdv ? 'Hide advanced settings' : 'Show advanced settings'))}</span><span class="pm-tog${showAdv ? ' on' : ''}"><i></i></span></div>`,
    );
    if (tab === 'graphics')
      body.insertAdjacentHTML(
        'afterbegin',
        `<div class="pm-set-note">${icon('info')}<span>${esc(qualityNote())}</span></div>`,
      );
    scope.refresh(keepKey ? `[data-key="${keepKey}"]` : null);
  }
  function qualityNote() {
    const q = game.quality;
    const gpu = q?.stats?.gpu
      ? q.stats.gpu
          .replace(/^ANGLE \((.*)\)$/, '$1')
          .split(',')
          .slice(0, 2)
          .join(',')
      : '';
    return `Running ${q?.current?.label || 'High'}${gpu ? ' on ' + gpu : ''}${game.perf?.fps ? ` · ${Math.round(game.perf.fps)} fps now` : ''}. Changes apply instantly: watch the scene behind this panel.`;
  }
  function describe(e) {
    const k = e?.dataset?.key || e?.closest?.('[data-key]')?.dataset.key;
    const it = k && S.item(k);
    if (e?.dataset?.bind) {
      const a = B.actions().find((x) => x.id === e.dataset.bind);
      descB.textContent = a?.label || '';
      descP.textContent =
        'Press Enter, then the new key or mouse button. Esc cancels. Delete clears the alternate.';
      return;
    }
    descB.textContent = it ? t(it.label) : '';
    descP.textContent = it?.desc ? t(it.desc) : '';
  }
  function adjust(e, dir) {
    const k = e.dataset.key,
      it = S.item(k);
    if (!it) return;
    ctx.sfx('move');
    if (it.type === 'range') S.set(k, S.get(k) + dir * it.step * (it.max - it.min > 2 ? 1 : 1));
    else if (it.type === 'choice') {
      const i = it.options.findIndex((x) => x.value === S.get(k));
      const n = it.options[(i + dir + it.options.length) % it.options.length];
      S.set(k, n.value);
    } else if (it.type === 'toggle') S.set(k, !S.get(k));
  }
  const scope = ctx.nav.push({
    root,
    wrap: true,
    onBack: close,
    onTab(d) {
      const i = tabs.indexOf(tab);
      tab = tabs[(i + d + tabs.length) % tabs.length];
      render();
      body.scrollTop = 0;
    },
    onFocus: describe,
  });
  root.addEventListener('nav:adjust', (e) => {
    const r = e.target.closest('[data-key]');
    if (r) adjust(r, e.detail.dir);
  });
  root.addEventListener('input', (e) => {
    const r = e.target.closest('[data-key]');
    if (r && e.target.type === 'range') (ctx.sfx('move'), S.set(r.dataset.key, +e.target.value));
  });
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-adv]')) {
      showAdv = !showAdv;
      try {
        localStorage.setItem('southline.settings.advanced', showAdv ? '1' : '0');
      } catch (e2) {
        /* */
      }
      ctx.sfx('select');
      render();
      const a = body.querySelector('[data-adv]');
      if (a) {
        scope.focus(a, 'auto');
        a.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    const tb = e.target.closest('.pm-set-tab');
    if (tb) {
      tab = tb.dataset.tab;
      ctx.sfx('tab');
      render();
      return;
    }
    if (e.target.closest('.pm-set-reset')) {
      S.reset(tab);
      ctx.sfx('select');
      render();
      return;
    }
    const kb = e.target.closest('[data-bind]');
    if (kb) {
      kb.classList.add('listening');
      kb.innerHTML = '<span class="pm-key-wait">Press a key</span>';
      const code = await B.capture('key');
      if (code) {
        const lost = B.setKey(kb.dataset.bind, +kb.dataset.slot, code);
        if (lost.length) ctx.notify?.(`Moved from: ${lost.map((x) => x.label).join(', ')}`, 2500);
      }
      render();
      scope.refresh(`[data-bind="${kb.dataset.bind}"][data-slot="${kb.dataset.slot}"]`);
      return;
    }
    const seg = e.target.closest('.pm-seg');
    const r = e.target.closest('[data-key]');
    if (seg && r) {
      const it = S.item(r.dataset.key);
      const op = it.options.find((x) => String(x.value) === seg.dataset.val);
      if (op) {
        S.set(r.dataset.key, op.value);
        ctx.sfx('move');
      }
      return;
    }
    if (!r) return;
    // action rows (dev code, detect, restore) are not value settings, so S.item() does not know them: look in the schema
    const it =
      S.item(r.dataset.key) ||
      S.schema
        .flatMap((x) => x.sections.flatMap((sec) => sec.items))
        .find((x) => x.key === r.dataset.key);
    if (r.dataset.kind === 'toggle') {
      S.set(r.dataset.key, !S.get(r.dataset.key));
      ctx.sfx('select');
    } else if (r.dataset.kind === 'action') {
      if (it?.action === 'detect') {
        const d = S.detect();
        S.applyPreset(d.preset);
        ctx.notify?.(`Picked ${d.preset}: ${d.reason}`, 3500);
      } else if (it?.action === 'resetAll') {
        S.reset();
      } else if (it?.action === 'devCode') {
        // off: the code panel (the right code turns it on and closes the panel); on: this row turns it off
        const D = game?.dev;
        if (D?.on) {
          D.setOn(false);
          ctx.notify?.('Dev mode OFF', 2000);
        } else
          D?.openCodes?.({
            closeOnSuccess: true,
            onClose: () => {
              if (root.isConnected) render(r.dataset.key);
            },
          });
      }
      render(r.dataset.key);
    } else if (e.target.closest('.pm-pick i')) {
      const i = [...r.querySelectorAll('.pm-pick i')].indexOf(e.target.closest('.pm-pick i'));
      adjust(r, i === 0 ? -1 : 1);
    }
  });
  // live: re-render the touched row (and everything on preset changes)
  const off = S.on('*', ({ key }) => {
    if (!root.isConnected) return;
    const it = S.item(key);
    if (key === 'gfxPreset' || !it || it.tab !== tab) {
      if (it?.tab === tab) render(key);
      return;
    }
    const old = body.querySelector(`[data-key="${key}"]`);
    if (old) {
      const tmp = document.createElement('div');
      tmp.innerHTML = row(it);
      const n = tmp.firstElementChild;
      const foc = old.classList.contains('is-focus');
      old.replaceWith(n);
      if (foc) scope.focus(n, 'auto');
    }
    if (key.startsWith('subtitle')) {
      const sp = body.querySelector('.pm-subprev');
      if (sp) {
        const tmp = document.createElement('div');
        tmp.innerHTML = row({ type: 'custom', widget: 'subtitlePreview' });
        sp.replaceWith(tmp.firstElementChild);
      }
    }
  });
  render();
  function close() {
    off();
    scope.pop();
    B.cancelCapture?.();
    leaveUI?.();
    root.classList.remove('in');
    root.classList.add('out');
    setTimeout(() => root.remove(), 320);
    o.onClose?.();
  }
  return { close };
}
