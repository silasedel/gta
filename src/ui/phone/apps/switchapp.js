// Switch: play as the other protagonist (game.characters, src/player/characters.v2.js). The phone closes and the
// camera does the sky cut over to them. Also lists where each one is and whether they follow you.
import './apps.css';

const ICON = {
  bg: 'linear-gradient(165deg,#ffb26b 0%,#e8603c 100%)',
  svg: `<svg viewBox="0 0 60 60"><g fill="#fff"><circle cx="21" cy="22" r="7"/><path d="M8 44c0-7 6-12 13-12s13 5 13 12z"/>
    <circle cx="40" cy="22" r="6" fill-opacity=".7"/><path d="M33 33c2-1 4-1 7-1 6 0 12 4 12 11H36c0-4-1-7-3-10z" fill-opacity=".7"/></g></svg>`,
};

export default function switchApp(os) {
  const { esc, GLYPH: G, game } = os;

  function page() {
    const C = game.characters;
    const list = C?.list || [];
    const rows = list.map((c) => ({
      icon: G.person,
      tile: c.active ? '#3fd1c4' : '#e8603c',
      title: esc(c.name),
      sub: esc(
        [c.active ? 'Playing' : c.follow ? 'With you' : 'Idle', c.place]
          .filter(Boolean)
          .join(' · '),
      ),
      right: c.active ? '' : '<span class="bk-pill wk-pill">Switch</span>',
      act: c.active ? null : 'go',
      data: { id: c.id },
      chevron: false,
    }));
    return {
      title: 'Switch',
      large: true,
      back: false,
      body: `${list.length ? os.rowsHTML(rows) : '<div class="kp-group"><div class="kp-empty" style="padding:24px">Nobody else to play right now.</div></div>'}
        <div class="kp-foot">${C?.locked ? 'You cannot switch during this job.' : 'Hold O in the world for the character wheel.'}</div>`,
      acts: {
        go: (el) => {
          if (C?.locked) {
            os.toast('Not now', 'bad');
            return;
          }
          os.close();
          setTimeout(() => C?.switchTo(el.dataset.id), 120);
        },
      },
    };
  }

  return {
    id: 'switch',
    name: 'Switch',
    icon: () => ICON,
    launch() {
      os.push(page(), { instant: true, sound: false });
    },
  };
}
