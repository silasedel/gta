// SUBWAY LIFE (activities): the Southline stations (src/world/metro, game.metro) get their regulars. Each time you come
// down to a platform (from the street or off a train) the far ends of the platform fill with people who live down here:
// hobos on cardboard by a burning drum (sitting, sleeping, one who asks for change and sometimes gets pushy), and at
// rougher stations a small crew hanging out who taunt you, try to mug you and fight as a group (src/activities/crew.js).
// Melee works as anywhere: they fight back; beat a crew and you pick up the cash they drop.
// API (game.subwayLife): { state, crew, hobos, populate(), clear() }. Off with ?subwaylife=0.
import * as THREE from 'three';
import {
  getHub,
  help,
  notify,
  canAct,
  say,
  payCash,
  sfx,
  loadGLB,
  fit,
  shadows,
  canvasTex,
  castPed,
  stillOurs,
} from '../common.js';
import { createCrew } from '../crew.js';
import { SUBWAY_CAST } from '../sites.data.js';

export const order = 186;
const PLAT_Y = 0.837; // must match src/world/metro/metro.v2.js
const HOBO_LINES = {
  ask: [
    'Spare a dollar, friend?',
    'Got any change? Anything helps.',
    'Hey... hey. You got a couple bucks?',
    "Train's late again. Help a guy out?",
  ],
  thanks: ['God bless you, man.', "You're alright. You're alright.", 'Thank you. Really.'],
  ignored: ['Yeah, yeah. Keep walking.', 'Cheapskate.', 'Whatever, man.'],
  mutter: [
    'They took my spot... they took it...',
    "Don't look at me.",
    'Shhh. The trains are listening.',
    'Twelve years down here. Twelve.',
    "You smell that? That's freedom.",
  ],
  pushy: ['I said gimme a dollar!', "You think you're better than me?!"],
};

export async function initV2(game) {
  if (/[?&]subwaylife=0\b/.test(location.search)) return;
  const H = getHub(game);
  const L = {
    state: 'off',
    here: -1,
    hobos: [],
    crew: null,
    crewPeds: [],
    props: null,
    mode: null,
    askT: 0,
    pushy: null,
    lastMutter: 0,
  };
  const M = () => game.metro;
  const P = () => game.player.position;
  const W = (x, z, y = PLAT_Y) => M().root.localToWorld(new THREE.Vector3(x, y, z));
  const faceTrack = () => M().root.rotation.y + Math.PI;

  function spawn(x, z, outfit, style, heading, seed, any = false) {
    const peds = game.peds;
    if (!peds?.spawnAt) return null;
    const w = W(x, z);
    const p = castPed(game, w, outfit, 6, any);
    if (!p) return null;
    p.pinned = 1e9;
    p.v21 = { venue: 'subway', y: w.y };
    p.nav = null;
    p.group = null;
    p.target = null;
    p.state = 'talk';
    p.act = 'talk';
    p.stateT = 1e9;
    p.idleStyle = style;
    p.heading = heading;
    p.pos.copy(w);
    p.groundY = w.y;
    p.health = 100;
    p.seed = seed;
    p.floorY = w.y;
    p.style0 = style;
    if (p.root) {
      p.root.position.copy(w);
      p.root.rotation.y = heading;
    }
    return p;
  }

  // ---------------------------------------------------------------- props: cardboard, bedroll, burning drum, trash
  let fireMat = null;
  function buildProps(end) {
    const g = new THREE.Group();
    g.name = 'subway-camp';
    const card = new THREE.MeshStandardMaterial({
      name: 'swCardboard',
      roughness: 0.95,
      map: canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#9b7a52';
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
          c.fillStyle = `rgba(80,55,30,${0.05 + Math.random() * 0.1})`;
          c.fillRect(0, Math.random() * h, w, 3);
        }
        c.fillStyle = 'rgba(60,40,20,.35)';
        c.fillRect(w * 0.48, 0, 6, h);
        c.font = '700 28px Arial';
        c.fillStyle = 'rgba(40,30,20,.7)';
        c.fillText('THIS SIDE UP', 30, 60);
        for (let i = 0; i < 40; i++) {
          c.fillStyle = `rgba(40,30,20,${Math.random() * 0.15})`;
          c.beginPath();
          c.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 18, 0, 7);
          c.fill();
        }
      }),
    });
    const blanket = new THREE.MeshStandardMaterial({
      name: 'swBlanket',
      color: 0x4c5a4a,
      roughness: 1,
    });
    const bag = new THREE.MeshStandardMaterial({
      name: 'swTrashBag',
      color: 0x1a1b1d,
      roughness: 0.35,
      metalness: 0.1,
    });
    const add = (geo, mat, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      const w = W(x, z, PLAT_Y + y);
      m.position.copy(w);
      m.rotation.y = M().root.rotation.y + ry;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const s = end; // +1 east end, -1 west end
    add(new THREE.BoxGeometry(1.0, 0.015, 1.9), card, s * 64, 0.008, 14.8, 0.08);
    add(new THREE.BoxGeometry(1.1, 0.015, 0.8), card, s * 62.6, 0.012, 15.0, -0.2);
    add(new THREE.BoxGeometry(0.75, 0.12, 1.7), blanket, s * 60.5, 0.06, 15.1, 0.03);
    for (let i = 0; i < 3; i++) {
      const b = add(
        new THREE.SphereGeometry(0.32, 10, 8),
        bag,
        s * (66.5 + i * 0.5),
        0.26,
        15.5 - i * 0.6,
      );
      b.scale.set(1, 0.85 + Math.random() * 0.3, 1);
    }
    // burning drum: the user's steel drum (converted GLB) with a fire of crossed flame cards (unlit, flickering)
    const drumAt = W(s * 58, 13.8);
    loadGLB('assets/models/keys/steel_drum.glb').then((m) => {
      if (!m || !L.props) return;
      const d = shadows(fit(m, { height: 0.9 }));
      d.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.color?.setHex(0x5a3a26);
          o.material.roughness = 0.9;
        }
      });
      d.position.copy(drumAt);
      g.add(d);
    });
    fireMat ||= new THREE.MeshBasicMaterial({
      map: canvasTex(128, 256, (c, w, h) => {
        const gr = c.createRadialGradient(w / 2, h * 0.85, 4, w / 2, h * 0.75, h * 0.7);
        gr.addColorStop(0, 'rgba(255,250,210,1)');
        gr.addColorStop(0.25, 'rgba(255,190,60,.95)');
        gr.addColorStop(0.6, 'rgba(230,80,20,.5)');
        gr.addColorStop(1, 'rgba(120,20,0,0)');
        c.fillStyle = gr;
        c.beginPath();
        c.moveTo(w * 0.1, h);
        c.quadraticCurveTo(w * 0.05, h * 0.4, w * 0.5, 0);
        c.quadraticCurveTo(w * 0.95, h * 0.4, w * 0.9, h);
        c.fill();
      }),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const fire = new THREE.Group();
    fire.position.copy(drumAt);
    fire.position.y += 0.9;
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.85), fireMat);
      f.position.y = 0.38;
      f.rotation.y = (i / 3) * Math.PI;
      fire.add(f);
    }
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(3, 32),
      new THREE.MeshBasicMaterial({
        map: canvasTex(128, 128, (c, w, h) => {
          const gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
          gr.addColorStop(0, 'rgba(255,150,60,1)');
          gr.addColorStop(0.4, 'rgba(255,110,40,.35)');
          gr.addColorStop(1, 'rgba(255,90,20,0)');
          c.fillStyle = gr;
          c.fillRect(0, 0, w, h);
        }),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.copy(drumAt);
    glow.position.y += 0.02;
    g.add(fire, glow);
    g.userData.fire = fire;
    g.userData.glow = glow;
    g.userData.fireAt = drumAt;
    game.scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- populate one visit
  function populate(o = {}) {
    clear();
    const m = M();
    if (!m?.root || m.mode !== 'platform') return;
    const st = m.stations[m.here];
    if (!st) return;
    const cast = SUBWAY_CAST[st.id] || SUBWAY_CAST.default;
    L.here = m.here;
    L.state = 'on';
    const end = Math.random() < 0.5 ? 1 : -1; // the camp end; the crew takes the other end
    L.props = buildProps(end);
    const ft = faceTrack();
    const spots = [
      [end * 63.6, 15.0, 'sitGround', ft + 0.3],
      [end * 60.6, 15.0, 'lie', ft + (Math.PI / 2) * end],
      [end * 56.5, 12.6, null, ft - 0.6 * end],
      [end * 59.2, 12.4, 'lean_wall', ft],
    ].slice(0, cast.hobos);
    // spawn one person per few frames (casting retries are not free); the one who asks for change first
    spots.sort((a, b) => (a[2] === null ? -1 : 0) - (b[2] === null ? -1 : 0));
    L.jobs = spots.map(([x, z, style, hd], i) => () => {
      const p = spawn(x, z, 'rough', style, hd, 100 + i, style === null);
      if (p) {
        p.hobo = { style, asked: false, kind: style === null ? 'ask' : 'mutter' };
        L.hobos.push(p);
      }
    });
    if (o.crew ?? Math.random() < cast.crew) {
      const n = 2 + (Math.random() < 0.6 ? 1 : 0);
      const cx = -end * 58,
        cz = 9.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4,
          x = cx + Math.cos(a) * 1.1,
          z = cz + Math.sin(a) * 1.1;
        L.jobs.push(() => {
          const p = spawn(
            x,
            z,
            'gang',
            i === 0 ? 'talk' : i === 1 ? 'cross_arms' : null,
            Math.atan2(cx - x, cz - z) + M().root.rotation.y,
            200 + i,
            i === 0,
          );
          if (p) L.crewPeds.push(p);
        });
      }
      L.jobs.push(() => {
        if (L.crewPeds.length)
          L.crew = createCrew(game, {
            peds: L.crewPeds,
            name: 'Platform crew',
            knife: cast.knife,
            noticeR: 11,
            onEnd: (o) => {
              game.emit?.('activity:end', { id: 'subwayCrew', outcome: o });
            },
          });
      });
    }
    L.jobT = 0;
    game.emit?.('activity:start', {
      id: 'subwayLife',
      station: st.id,
      hobos: L.hobos.length,
      crew: L.crewPeds.length,
    });
  }
  function clear() {
    for (const p of [...L.hobos, ...L.crewPeds]) {
      if (!stillOurs(p)) continue;
      p.pinned = 0;
      p.v21 = null;
      p.despawnNow = true;
    }
    L.hobos = [];
    L.crewPeds = [];
    L.crew = null;
    L.pushy = null;
    L.jobs = [];
    if (L.props) {
      game.scene.remove(L.props);
      L.props = null;
    }
    help(game, 'subway', null);
    help(game, 'crew', null);
    L.state = 'off';
  }

  // ---------------------------------------------------------------- per frame (only while on a platform)
  function hoboTick(dt) {
    const now = performance.now() / 1000;
    let nearAsk = null;
    for (const p of L.hobos) {
      if (!p.active || p.dead) continue;
      const d = Math.hypot(p.pos.x - P().x, p.pos.z - P().z);
      if (p.hobo.kind === 'ask' && d < 7 && p !== L.pushy) {
        const a = Math.atan2(P().x - p.pos.x, P().z - p.pos.z);
        let da = Math.atan2(Math.sin(a - p.heading), Math.cos(a - p.heading));
        p.heading += da * Math.min(1, dt * 3);
        if (p.root) p.root.rotation.y = p.heading;
      }
      if (d < 3.2 && p.hobo.kind === 'ask' && !p.hobo.done) nearAsk = p;
      else if (d < 4 && p.hobo.kind === 'mutter' && now - L.lastMutter > 7) {
        L.lastMutter = now;
        say(
          game,
          'Hobo',
          HOBO_LINES.mutter[(Math.random() * HOBO_LINES.mutter.length) | 0],
          2600,
          '#c9b38a',
        );
      }
      if ((p.health ?? 100) < 96 && !p.hobo.fought) {
        p.hobo.fought = true;
        p.idleStyle = null;
        p.hobo.kind = 'fight';
        p.fightT = 12;
      }
      if (p.hobo.kind === 'fight') {
        if ((p.fightT -= dt) > 0 && d < 20) {
          p.state = 'fight';
          p.stateT = 5;
          p.guard = true;
        } else {
          p.hobo.kind = 'done';
          p.state = 'talk';
          p.stateT = 1e9;
        }
      }
    }
    if (L.pushy) {
      // he follows you, yelling, and swings once his patience runs out (hitCd), then gives up
      const p = L.pushy;
      L.pushyT += dt;
      if (!p.active || p.dead || L.pushyT > 12) {
        if (p.active && !p.dead) {
          p.state = 'talk';
          p.stateT = 1e9;
          p.guard = false;
        }
        L.pushy = null;
      } else {
        p.state = 'fight';
        p.stateT = 5;
        if (L.pushyT > 4 && !L.pushySaid) {
          L.pushySaid = true;
          say(game, 'Hobo', HOBO_LINES.pushy[1], 2200, '#c9b38a');
        }
      }
    }
    if (nearAsk) {
      const p = nearAsk;
      if (!p.hobo.asked) {
        p.hobo.asked = true;
        p.idleStyle = 'talk';
        say(
          game,
          'Hobo',
          HOBO_LINES.ask[(Math.random() * HOBO_LINES.ask.length) | 0],
          2600,
          '#c9b38a',
        );
        L.askT = 0;
      }
      L.askT += dt;
      help(game, 'subway', 'Press <b>E</b> to give him $5');
      if (canAct(game) && game.input.pressed('KeyE')) {
        help(game, 'subway', null);
        if (
          payCash(game, 5, {
            to: 'A man in the subway',
            memo: 'Spare change',
            category: 'gift',
            accepts: ['cash'],
          })
        ) {
          say(game, 'Hobo', HOBO_LINES.thanks[(Math.random() * 3) | 0], 2400, '#c9b38a');
          p.hobo.done = true;
          p.idleStyle = null;
          game.stats?.add?.('charity', 5);
        } else say(game, 'Hobo', 'No cash? Story of my life.', 2200, '#c9b38a');
        p.hobo.done = true;
      }
    } else {
      help(game, 'subway', null);
      for (const p of L.hobos)
        if (p.hobo.asked && !p.hobo.done && Math.hypot(p.pos.x - P().x, p.pos.z - P().z) > 4.5) {
          p.hobo.done = true;
          p.idleStyle = null;
          if (Math.random() < 0.35 && !L.pushy) {
            L.pushy = p;
            L.pushyT = 0;
            L.pushySaid = false;
            say(game, 'Hobo', HOBO_LINES.pushy[0], 2200, '#c9b38a');
            p.state = 'fight';
            p.stateT = 5;
            p.hitCd = 4.5;
            p.guard = false;
          } // follows, then swings
          else say(game, 'Hobo', HOBO_LINES.ignored[(Math.random() * 3) | 0], 2000, '#c9b38a');
        }
    }
  }
  game.updaters.push(function subwayLifeTick(dt) {
    if (!(dt > 0)) return;
    const m = M();
    if (!m) return;
    const mode = m.mode === 'platform' && !m.busy ? 'platform' : m.mode;
    if (mode !== L.mode) {
      const prev = L.mode;
      L.mode = mode;
      if (mode === 'platform')
        setTimeout(() => {
          if (M().mode === 'platform') populate();
        }, 300);
      else if (prev === 'platform') clear();
    } else if (mode === 'platform' && L.state === 'on' && m.here !== L.here) populate();
    if (L.state !== 'on') return;
    if (L.jobs?.length && (L.jobT -= dt) <= 0) {
      L.jobT = 0.12;
      try {
        L.jobs.shift()();
      } catch (e) {
        console.warn('[subwayLife] spawn', e);
      }
    }
    if (L.props) {
      const f = L.props.userData.fire,
        t = performance.now() / 1000;
      f.scale.set(
        1 + Math.sin(t * 13) * 0.08,
        0.9 + Math.sin(t * 9.3) * 0.15 + Math.sin(t * 21) * 0.05,
        1,
      );
      f.rotation.y += dt * 0.7;
      L.props.userData.glow.material.opacity =
        0.42 + Math.sin(t * 11) * 0.08 + Math.random() * 0.06;
    }
    // drop people the crowd took back (pool recycling), keep everyone on the platform floor and in their pose
    L.hobos = L.hobos.filter(stillOurs);
    L.crewPeds = L.crewPeds.filter((p) => stillOurs(p) || (p.active && p.dead)); // (the crowd code resets idle styles of 'talk' people)
    for (const p of [...L.hobos, ...L.crewPeds]) {
      if (!p.active) continue;
      if (Math.abs(p.pos.y - p.floorY) > 0.01) {
        p.pos.y = p.floorY;
        if (p.root) p.root.position.y = p.floorY;
        try {
          const t = p.body?.translation();
          if (t && Math.abs(t.y - p.floorY - 0.9) > 0.3)
            p.body.setTranslation({ x: p.pos.x, y: p.floorY + 0.9, z: p.pos.z }, true);
        } catch (e) {
          /* */
        }
      }
      if (
        p.state === 'talk' &&
        p.style0 !== undefined &&
        (!p.hobo || p.hobo.kind === 'mutter' || (p.hobo.kind === 'ask' && !p.hobo.asked)) &&
        !(L.crew && L.crew.state !== 'idle' && L.crewPeds.includes(p))
      )
        p.idleStyle = p.style0;
    }
    hoboTick(dt);
    L.crew?.tick(dt);
  });
  void H;
  void notify;
  void sfx;
  game.subwayLife = H.apis.subwayLife = {
    get state() {
      return L.state;
    },
    get crew() {
      return L.crew;
    },
    get hobos() {
      return L.hobos;
    },
    populate,
    clear,
  };
}
