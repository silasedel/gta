// Settings: appearance (automatic by time of day, light, dark), wallpaper, sounds (ringtone, volume, silent), how the
// phone behaves in the game (free mouse cursor, banners while the phone is down, 24-hour clock) and About.
import './apps.css';

const WALLS = [
  ['dusk', 'Dusk Bay'],
  ['lagoon', 'Lagoon'],
  ['midnight', 'Midnight'],
];
const TONES = ['Lagoon', 'Causeway', 'Night Market', 'Pelican', 'Tidewater'];

export default function settingsApp(os) {
  const { esc, GLYPH: G, prefs } = os;
  const save = () => os.savePrefs();
  function root(app) {
    return {
      title: 'Settings',
      large: true,
      back: false,
      body: `<div class="kp-group st-me"><div class="kp-row"><span class="kp-av" style="--s:60px;--h:28">N</span><span class="kp-row-t"><b class="st-name">Nico</b><small>Kestrel account, backups and purchases</small></span></div></div>
        ${os.rowsHTML([
          {
            icon: G.paint,
            tile: '#2a6cf5',
            title: 'Appearance',
            value: esc(
              { auto: 'Automatic', light: 'Light', dark: 'Dark' }[prefs.appearance] || 'Automatic',
            ),
            act: 'appearance',
          },
          {
            icon: G.photo,
            tile: '#3fb0d8',
            title: 'Wallpaper',
            value: esc(WALLS.find((w) => w[0] === prefs.wallpaper)?.[1] || 'Dusk Bay'),
            act: 'wall',
          },
        ])}
        ${os.rowsHTML([
          {
            icon: G.speaker,
            tile: '#ff3b5c',
            title: 'Sounds',
            value: esc(prefs.ringtone),
            act: 'sounds',
          },
          {
            icon: G.moonSmall,
            tile: '#5e5ce6',
            title: 'Silent mode',
            sub: 'No sounds, no banners',
            right: `<span class="kp-switch ${prefs.silent ? 'on' : ''}"></span>`,
            act: 'silent',
            chevron: false,
          },
        ])}
        ${os.rowsHTML([
          {
            icon: G.cursor,
            tile: '#8e8e93',
            title: 'Mouse cursor',
            sub: 'Free the cursor while the phone is up',
            right: `<span class="kp-switch ${prefs.freeCursor ? 'on' : ''}"></span>`,
            act: 'cursor',
            chevron: false,
          },
          {
            icon: G.bell,
            tile: '#ff9500',
            title: 'Peek banners',
            sub: 'Phone peeks up for new messages',
            right: `<span class="kp-switch ${prefs.peek ? 'on' : ''}"></span>`,
            act: 'peek',
            chevron: false,
          },
          {
            icon: G.clock,
            tile: '#34c759',
            title: '24-hour time',
            right: `<span class="kp-switch ${prefs.h24 ? 'on' : ''}"></span>`,
            act: 'h24',
            chevron: false,
          },
        ])}
        ${os.rowsHTML([{ icon: G.info, tile: '#8e8e93', title: 'About', act: 'about' }])}
        <div class="kp-foot st-keys">Phone: P or Arrow Up · Back: Backspace or Esc · Controller: D-pad Up, A, B</div>`,
      acts: {
        appearance: () => os.push(appearancePage(app)),
        wall: () => os.push(wallPage(app)),
        sounds: () => os.push(soundsPage(app)),
        about: () => os.push(aboutPage()),
        silent: (el) => toggle(el, 'silent'),
        cursor: (el) => toggle(el, 'freeCursor'),
        peek: (el) => toggle(el, 'peek'),
        h24: (el) => toggle(el, 'h24'),
      },
      onShow: (el, o) => {
        if (o?.back) os.replaceTop(root(app));
      },
    };
  }
  function toggle(el, k) {
    prefs[k] = !prefs[k];
    el.querySelector('.kp-switch').classList.toggle('on', !!prefs[k]);
    save();
    os.sound('tick', 0.5);
  }
  function appearancePage(app) {
    const card = (k, n) =>
      `<button class="st-look ${prefs.appearance === k ? 'on' : ''}" data-act="set" data-k="${k}" data-f><span class="st-mini ${k}"><i></i><i></i><i></i></span><b>${n}</b><span class="st-radio"></span></button>`;
    return {
      title: 'Appearance',
      back: 'Settings',
      body: `<div class="kp-group st-looks">${card('light', 'Light')}${card('dark', 'Dark')}${card('auto', 'Automatic')}</div>
        <div class="kp-foot" style="margin-top:0">Automatic turns dark after sunset and light at sunrise, game time.</div>`,
      acts: {
        set: (el) => {
          prefs.appearance = el.dataset.k;
          save();
          os.sound('tick', 0.5);
          el.parentElement
            .querySelectorAll('.st-look')
            .forEach((b) => b.classList.toggle('on', b === el));
        },
      },
    };
  }
  function wallPage(app) {
    return {
      title: 'Wallpaper',
      back: 'Settings',
      body: `<div class="st-walls">${WALLS.map(([k, n]) => `<button class="st-wall ${prefs.wallpaper === k ? 'on' : ''}" data-act="set" data-k="${k}" data-f><span class="st-wprev" data-wall="${k}"><i></i></span><b>${n}</b></button>`).join('')}</div>`,
      acts: {
        set: (el) => {
          prefs.wallpaper = el.dataset.k;
          save();
          os.sound('tick', 0.5);
          el.parentElement
            .querySelectorAll('.st-wall')
            .forEach((b) => b.classList.toggle('on', b === el));
        },
      },
    };
  }
  function soundsPage(app) {
    return {
      title: 'Sounds',
      back: 'Settings',
      body: `<div class="kp-sec">Volume</div><div class="kp-group"><div class="kp-row st-vol" data-f data-act="vol">${G.speaker}<span class="st-slider"><i style="--v:${(prefs.volume * 100).toFixed(0)}%"></i></span><b>${Math.round(prefs.volume * 100)}%</b></div></div>
        <div class="kp-foot">Use ← → to change it, or click the bar.</div>
        <div class="kp-sec">Ringtone</div>
        ${os.rowsHTML(TONES.map((t) => ({ title: esc(t), right: prefs.ringtone === t ? `<span class="st-check">${G.check}</span>` : '', act: 'tone', data: { t }, chevron: false })))}`,
      acts: {
        tone: (el) => {
          prefs.ringtone = el.dataset.t;
          save();
          os.sound('notify', 1);
          os.replaceTop(soundsPage(app));
        },
        vol: (el, e) => {
          if (!e?.clientX) return;
          const r = el.querySelector('.st-slider').getBoundingClientRect();
          setVol(el, (e.clientX - r.left) / r.width);
        },
      },
      mount: (el) => {
        const row = el.querySelector('.st-vol');
        row._nav = (dir) => {
          if (dir !== 'left' && dir !== 'right') return false;
          setVol(row, prefs.volume + (dir === 'right' ? 0.1 : -0.1));
          return true;
        };
      },
    };
  }
  function setVol(row, v) {
    prefs.volume = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
    save();
    row.querySelector('i').style.setProperty('--v', `${prefs.volume * 100}%`);
    row.querySelector('b').textContent = `${Math.round(prefs.volume * 100)}%`;
    os.sound('tick', 1);
  }
  function aboutPage() {
    return {
      title: 'About',
      back: 'Settings',
      body: `<div class="st-about">${os.APP_ICONS.settings.svg}<b>${esc(os.OS_NAME)} ${esc(os.OS_VERSION)}</b><small>Kestrel 15 · Ocean Blue</small></div>
        ${os.rowsHTML([
          { title: 'Name', value: 'Nico’s Kestrel' },
          { title: 'Model', value: 'Kestrel 15' },
          { title: 'Carrier', value: 'Gulfwave 5G' },
          { title: 'Storage', value: '128 GB · 41 GB free' },
          { title: 'Phone number', value: '(305) 555-0100' },
        ])}`,
    };
  }
  return {
    id: 'settings',
    name: 'Settings',
    launch(app) {
      os.push(root(app), { instant: true, sound: false });
    },
  };
}
