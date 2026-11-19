// Maps: the game's own map renderer (the minimap / pause map art, passed in by the HUD as hooks.drawMap) in the phone,
// following the player, plus place search and "nearest" categories from game.nav.places, with directions that set the
// game's waypoint. "Full map" opens the pause map.
import './apps.css';

const CATS = [
  ['atm', 'ATM', 'dollar'],
  ['gas', 'Gas', 'fuel'],
  ['food', 'Food', 'cup'],
  ['coffee', 'Coffee', 'cup'],
  ['clothing', 'Clothes', 'bag'],
  ['hospital', 'Hospital', 'cross'],
  ['garage', 'Repair', 'briefcase'],
  ['hotel', 'Hotel', 'home'],
];

export default function mapsApp(os) {
  const { esc, GLYPH: G, game, hooks } = os;
  let zoom = 1;
  const pos = () => game.player?.position || { x: 0, z: 0 };
  const places = () => game.nav?.places || null;
  const where = () => {
    const p = pos();
    let d = null,
      s = null;
    try {
      d = game.city?.districtAt?.(p.x, p.z);
    } catch (e) {
      /* */
    }
    try {
      s = game.city?.streetNameAt?.(p.x, p.z);
    } catch (e) {
      /* */
    }
    return { district: d ? String(d) : 'Southline', street: s ? String(s) : null };
  };
  function draw(canvas, radius) {
    if (!canvas || !hooks.drawMap) return false;
    const p = pos();
    try {
      return hooks.drawMap(canvas, {
        cx: p.x,
        cz: p.z,
        radius,
        heading: game.player?.heading || 0,
      });
    } catch (e) {
      return false;
    }
  }
  function nearest(cat, n = 6) {
    const P = places();
    if (!P?.nearest) return [];
    try {
      return (P.nearest(cat, pos(), { limit: n }) || []).map((x) => ({
        ...x,
        d: Math.hypot(x.x - pos().x, x.z - pos().z),
      }));
    } catch (e) {
      return [];
    }
  }
  function search(q) {
    const P = places();
    if (!P?.search || !q) return [];
    try {
      return (P.search(q, { near: pos(), limit: 8 }) || []).map((x) => ({
        ...x,
        d: Math.hypot(x.x - pos().x, x.z - pos().z),
      }));
    } catch (e) {
      return [];
    }
  }
  const resultRows = (list) =>
    list.length
      ? os.rowsHTML(
          list.map((r) => ({
            icon: G.pin,
            tile: '#ff5a4f',
            title: esc(r.name),
            sub: esc([r.sub, os.distText(r.d)].filter(Boolean).join(' · ')),
            right: '<span class="mp-go">Go</span>',
            act: 'go',
            data: { x: r.x, z: r.z, n: r.name },
            chevron: false,
          })),
        )
      : `<div class="kp-empty" style="padding:22px">${places() ? 'Nothing found nearby.' : 'Search is still loading the city.'}</div>`;

  function mapPage(app) {
    const w = where(),
      wp = game.waypoint;
    return {
      nav: false,
      cls: 'mp-page',
      status: 'dark',
      body: `<div class="mp-map"><canvas width="786" height="1100"></canvas><i class="mp-me"></i><div class="mp-nomap" hidden>${G.map}<span>Map is loading</span></div></div>
        <div class="mp-top glass2"><div class="kp-search">${G.search}<input class="kp-input" placeholder="Search Maps" data-f></div></div>
        <div class="mp-ctl glass2"><button data-act="zin" data-f>${G.plus}</button><i></i><button data-act="zout" data-f><svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button><i></i><button data-act="full" data-f>${G.map}</button></div>
        <div class="mp-card glass2">
          <div class="mp-here"><b>${esc(w.street || w.district)}</b><small>${esc(w.street ? w.district : 'Southline')}</small>${wp ? `<button class="kp-chip" data-act="clear" data-f>Clear route</button>` : ''}</div>
          <div class="kp-chips mp-cats">${CATS.map(([k, n, g]) => `<button class="kp-chip" data-act="cat" data-k="${k}" data-n="${n}" data-f>${G[g]}${n}</button>`).join('')}</div>
        </div>`,
      acts: {
        zin: () => {
          zoom = Math.min(4, zoom * 1.5);
          paint(app);
        },
        zout: () => {
          zoom = Math.max(0.25, zoom / 1.5);
          paint(app);
        },
        full: () => {
          os.close();
          try {
            hooks.openPauseMap?.();
          } catch (e) {
            /* */
          }
        },
        clear: () => {
          game.waypoint = null;
          try {
            game.nav?.clear?.();
          } catch (e) {
            /* */
          }
          os.toast('Route cleared');
          os.replaceTop(mapPage(app));
        },
        cat: (el) => resultsSheet(app, el.dataset.n, nearest(el.dataset.k)),
      },
      mount: (el) => {
        const i = el.querySelector('input');
        i.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            i.blur();
            if (i.value.trim()) resultsSheet(app, `"${i.value.trim()}"`, search(i.value.trim()));
          }
        });
        requestAnimationFrame(() => paint(app));
      },
      tick: (dt, el) => {
        el._t = (el._t || 0) + dt;
        if (el._t > 0.25) {
          el._t = 0;
          paint(app);
        }
      },
    };
  }
  function paint(app) {
    const el = app.stack[0];
    if (!el) return;
    const ok = draw(el.querySelector('.mp-map canvas'), 260 / zoom);
    el.querySelector('.mp-nomap').hidden = ok !== false;
    const me = el.querySelector('.mp-me');
    if (me)
      me.style.setProperty(
        '--r',
        `${((-(game.player?.heading || 0) * 180) / Math.PI + 180).toFixed(1)}deg`,
      );
  }
  function resultsSheet(app, title, list) {
    os.sheet({
      title,
      body: resultRows(list),
      acts: {
        go: (el) => {
          os.setWaypoint(Number(el.dataset.x), Number(el.dataset.z), el.dataset.n);
          os.closeSheet();
          setTimeout(() => os.replaceTop(mapPage(app)), 320);
        },
      },
    });
  }

  return {
    id: 'maps',
    name: 'Maps',
    launch(app) {
      os.push(mapPage(app), { instant: true, sound: false });
    },
    widget: () => {
      const w = where(),
        a = nearest('atm', 1)[0];
      return `<div class="mp-wg"><canvas data-draw="maps" width="688" height="328"></canvas><i class="mp-me sm"></i><div class="mp-wg-t"><b>${esc(w.street || w.district)}</b><small>${esc(w.district)}${a ? ` · ATM ${os.distText(a.d)}` : ''}</small></div></div>`;
    },
    drawWidget: (c) => {
      draw(c, 190);
    },
  };
}
