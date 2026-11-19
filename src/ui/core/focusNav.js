// SOUTHLINE UI: keyboard / controller focus navigation shared by every menu, the pause screen and the phone.
//
// Usage:
//   const scope = nav.push({ root, onBack() {…}, onTab(dir) {…}, onAction(name) {…}, initial: '.first' });
//   …later: scope.pop();
// Mark focusable elements with data-nav:
//   data-nav            button-like: Accept clicks it
//   data-nav="range"    Left/Right dispatch CustomEvent('nav:adjust', { detail: { dir: -1 | 1, fast } }) on it
//   data-nav="select"   same as range (cycle through options)
//   data-nav="text"     Accept focuses the <input> inside (or itself); Enter fires CustomEvent('nav:submit'); Esc leaves
// The focused element gets .is-focus (styled in tokens.css). Mouse hover moves the same focus.
// data-nav-key="alt1|alt2|alt3|start|select" on any element: that nav action clicks it (shown with a glyph hint).
import { clamp } from './dom.js';

export function createFocusNav(bindings, opts = {}) {
  const sfx = opts.sfx || (() => {});
  const stack = [];
  let lastSrc = 'kbm';
  const top = () => stack[stack.length - 1] || null;
  const visible = (e) => {
    if (
      !e.isConnected ||
      e.hasAttribute('disabled') ||
      e.classList.contains('is-disabled') ||
      e.closest('[hidden], .is-inert')
    )
      return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const items = (s) => [...s.root.querySelectorAll('[data-nav]')].filter(visible);

  function setFocus(s, e, how = 'key') {
    if (!s) return;
    if (s.focus === e) return;
    if (s.focus) s.focus.classList.remove('is-focus');
    s.focus = e || null;
    if (!e) return;
    e.classList.add('is-focus');
    if (how !== 'mouse') {
      try {
        e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (err) {
        /* */
      }
    }
    const active = document.activeElement;
    if (active && active !== document.body && active !== e && !e.contains(active)) {
      try {
        active.blur();
      } catch (err) {
        /* */
      }
    }
    try {
      s.onFocus?.(e, how);
    } catch (err) {
      console.error(err);
    }
    e.dispatchEvent(new CustomEvent('nav:focus', { bubbles: true, detail: { how } }));
  }
  function ensure(s) {
    if (s.focus && visible(s.focus) && s.root.contains(s.focus)) return s.focus;
    const list = items(s);
    if (!list.length) {
      setFocus(s, null);
      return null;
    }
    let e = null;
    if (s.initial) e = typeof s.initial === 'string' ? s.root.querySelector(s.initial) : s.initial;
    if (!e || !visible(e)) e = s.root.querySelector('[data-nav].on, [data-nav][data-nav-default]');
    if (!e || !visible(e)) e = list[0];
    setFocus(s, e, 'auto');
    return e;
  }
  function move(s, dir) {
    const cur = ensure(s);
    if (!cur) return false;
    const list = items(s).filter((e) => e !== cur);
    if (!list.length) return false;
    const a = cur.getBoundingClientRect(),
      ax = a.left + a.width / 2,
      ay = a.top + a.height / 2;
    const horiz = dir === 'left' || dir === 'right',
      sign = dir === 'left' || dir === 'up' ? -1 : 1;
    let best = null,
      bs = Infinity;
    for (const e of list) {
      const b = e.getBoundingClientRect(),
        bx = b.left + b.width / 2,
        by = b.top + b.height / 2;
      // edge-to-edge distance along the travel axis; perpendicular offset measured between the nearest edges
      const prim = horiz
        ? sign > 0
          ? b.left - a.right
          : a.left - b.right
        : sign > 0
          ? b.top - a.bottom
          : a.top - b.bottom;
      const centerAhead = horiz ? (bx - ax) * sign : (by - ay) * sign;
      if (centerAhead <= 1) continue;
      const perp = horiz
        ? Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
        : Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const cperp = horiz ? Math.abs(by - ay) : Math.abs(bx - ax);
      const score = Math.max(0, prim) + perp * 4 + cperp * 0.35 + (prim < -2 ? 40 : 0);
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    if (!best && s.wrap !== false && !horiz) {
      // wrap vertically inside the same column
      let far = null,
        fs = -Infinity;
      for (const e of list) {
        const b = e.getBoundingClientRect(),
          by = b.top + b.height / 2,
          bx = b.left + b.width / 2;
        if (Math.abs(bx - ax) > Math.max(a.width, b.width) * 0.6) continue;
        const d = (ay - by) * sign;
        if (d > fs) {
          fs = d;
          far = e;
        }
      }
      if (far && fs > 4) best = far;
    }
    if (!best) return false;
    setFocus(s, best, 'key');
    sfx('move');
    return true;
  }
  function adjust(e, dir, fast) {
    e.dispatchEvent(
      new CustomEvent('nav:adjust', { bubbles: true, detail: { dir, fast: !!fast } }),
    );
    sfx('tick');
  }
  function accept(s) {
    const e = ensure(s);
    if (!e) return;
    const kind = e.dataset.nav;
    if (kind === 'text') {
      const inp = e.matches('input, textarea') ? e : e.querySelector('input, textarea');
      if (inp) {
        inp.focus();
        inp.select?.();
      }
      return;
    }
    sfx(e.classList.contains('is-disabled') ? 'deny' : 'select');
    e.click();
  }
  function onNav(d) {
    const s = top();
    if (!s) return;
    lastSrc = d.src;
    const dir = d.dir,
      active = document.activeElement;
    const typing =
      active &&
      ((active.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/i.test(active.type)) ||
        active.tagName === 'TEXTAREA');
    if (typing) {
      if (dir === 'accept') {
        active.dispatchEvent(new CustomEvent('nav:submit', { bubbles: true }));
        if (active.tagName === 'INPUT') active.blur();
        d.handled = true;
        return;
      }
      if (dir === 'back') {
        active.blur();
        d.handled = true;
        return;
      }
      if (dir === 'up' || dir === 'down' || dir === 'next' || dir === 'prev') active.blur();
      else return;
    }
    try {
      if (s.onNav?.(d) === true) {
        d.handled = true;
        return;
      }
    } catch (e) {
      console.error('[nav]', e);
    }
    const cur = s.focus && visible(s.focus) ? s.focus : null;
    switch (dir) {
      case 'up':
      case 'down':
        move(s, dir);
        break;
      case 'left':
      case 'right': {
        const k = cur?.dataset.nav;
        if (k === 'range' || k === 'select') adjust(cur, dir === 'left' ? -1 : 1, d.repeat);
        else move(s, dir);
        break;
      }
      case 'next':
      case 'prev': {
        const list = items(s);
        if (!list.length) break;
        const i = list.indexOf(ensure(s));
        setFocus(s, list[(i + (dir === 'next' ? 1 : -1) + list.length) % list.length], 'key');
        sfx('move');
        break;
      }
      case 'home':
      case 'end': {
        const list = items(s);
        if (list.length) {
          setFocus(s, dir === 'home' ? list[0] : list[list.length - 1], 'key');
          sfx('move');
        }
        break;
      }
      case 'pageUp':
      case 'pageDown': {
        const sc = (cur || s.root).closest('.ps-scroll') || s.root.querySelector('.ps-scroll');
        if (sc)
          sc.scrollBy({
            top: (dir === 'pageUp' ? -0.8 : 0.8) * sc.clientHeight,
            behavior: 'smooth',
          });
        break;
      }
      case 'accept':
        accept(s);
        break;
      case 'back':
        sfx('back');
        if (s.onBack) s.onBack();
        break;
      case 'tabPrev':
      case 'tabNext':
        if (s.onTab) {
          sfx('tab');
          s.onTab(dir === 'tabNext' ? 1 : -1);
        }
        break;
      default: {
        const hot = [...s.root.querySelectorAll(`[data-nav-key="${dir}"]`)].find(visible);
        if (hot) {
          sfx('select');
          hot.click();
        } else s.onAction?.(dir);
      }
    }
    d.handled = true;
  }
  bindings.on('nav', onNav);
  // right stick scrolls the nearest scroll container
  bindings.on('padaxes', (a) => {
    const s = top();
    if (!s || Math.abs(a.ry) < 0.2) return;
    const sc = (s.focus || s.root).closest?.('.ps-scroll') || s.root.querySelector('.ps-scroll');
    if (sc) sc.scrollTop += a.ry * 900 * a.dt;
  });
  // mouse hover and click move the same focus
  function onPointer(e) {
    const s = top();
    if (!s || e.pointerType === 'touch') return;
    const t = e.target?.closest?.('[data-nav]');
    if (!t || !s.root.contains(t) || !visible(t)) return;
    if (e.type === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 1) return;
    setFocus(s, t, 'mouse');
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointermove', onPointer, true);
    document.addEventListener('pointerdown', onPointer, true);
  }

  return {
    /** Push a navigation scope; the top scope receives all navigation. */
    push(def) {
      const s = { wrap: true, ...def, focus: null };
      const prev = top();
      if (prev?.focus) prev.focus.classList.add('is-focus-parked');
      stack.push(s);
      const h = {
        scope: s,
        pop() {
          const i = stack.indexOf(s);
          if (i < 0) return;
          if (s.focus) s.focus.classList.remove('is-focus');
          stack.splice(i, 1);
          const t = top();
          if (t?.focus) {
            t.focus.classList.remove('is-focus-parked');
            if (!visible(t.focus)) {
              t.focus.classList.remove('is-focus');
              t.focus = null;
            }
          }
        },
        focus(e, how = 'auto') {
          if (typeof e === 'string') e = s.root.querySelector(e);
          if (e) setFocus(s, e, how);
        },
        /** Call after re-rendering the scope's content: restores a valid focus. */
        refresh(sel) {
          if (sel) {
            const e = typeof sel === 'string' ? s.root.querySelector(sel) : sel;
            if (e && visible(e)) {
              setFocus(s, e, 'auto');
              return;
            }
          }
          if (s.focus && (!s.focus.isConnected || !visible(s.focus))) {
            s.focus = null;
          }
          ensure(s);
        },
        get current() {
          return s.focus;
        },
        isTop: () => top() === s,
      };
      requestAnimationFrame(() => {
        if (top() === s) ensure(s);
      });
      return h;
    },
    get depth() {
      return stack.length;
    },
    /** Feed one navigation step to the top scope from outside the bindings layer (the pause menu reads raw keys). */
    send(dir, src = 'kbm', repeat = false) {
      const d = { dir, src, repeat, shift: false, handled: false, raw: null };
      onNav(d);
      return d.handled;
    },
    get lastSource() {
      return lastSrc;
    },
    top,
    clampIndex: (i, n) => clamp(i, 0, Math.max(0, n - 1)),
  };
}
