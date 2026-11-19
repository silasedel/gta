// Story markers: the available-mission markers (a lettered blip on the minimap and pause map, plus a ground ring in the
// world when the player is near) and the objective waypoint of the running mission (blip, ring, map waypoint).
// Rings are the shared GTA-style marker (src/gameplay/markers.js through src/jobs/kit.js); blips go through
// game.mapBlips like every other system (see src/activities/common.js).
import { makeMarker, removeMarker } from '../jobs/kit.js';

export const STORY_PINK = '#ff2e8a';
export const OBJECTIVE_YELLOW = '#ffd25a';
const RING_SHOW_M = 220; // build the ground ring inside this distance, drop it past RING_SHOW_M + 40
const START_R = 2.6; // stepping into this radius starts the mission

// ---------------------------------------------------------------- blips
const ICONS = new Map();
function blipIcon(letter, color) {
  const key = letter + color;
  if (ICONS.has(key)) return ICONS.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fillStyle = '#140c22';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = color;
  if (letter) {
    g.font = '900 32px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, 32, 34);
  } else {
    g.beginPath();
    g.arc(32, 32, 10, 0, Math.PI * 2);
    g.fill();
  }
  ICONS.set(key, c);
  return c;
}

export function addBlip(game, { x, z, letter = '', color = STORY_PINK, label = '', size = 9 }) {
  const img = blipIcon(letter, color);
  const b = {
    x,
    z,
    kind: 'story',
    label,
    prio: 90,
    draw(g, sx, sy, k = 1) {
      const r = size * k;
      g.drawImage(img, sx - r, sy - r, r * 2, r * 2);
    },
  };
  game.mapBlips = (game.mapBlips || []).concat([b]);
  return b;
}

export function removeBlip(game, b) {
  if (b && Array.isArray(game.mapBlips)) game.mapBlips = game.mapBlips.filter((q) => q !== b);
}

// ---------------------------------------------------------------- objective waypoint (one at a time)
// target: { x, z } or a function returning one (a moving car, a fleeing man). opts.ring = false skips the ground ring.
export function createObjectiveMarker(game) {
  const W = { target: null, blip: null, ring: null, opts: {}, t: 0 };

  W.set = (target, opts = {}) => {
    W.clear();
    if (!target) return;
    W.target = target;
    W.opts = opts;
    const p = W.pos();
    if (!p) return;
    W.blip = addBlip(game, { x: p.x, z: p.z, color: OBJECTIVE_YELLOW, label: opts.label || '' });
    if (opts.ring !== false) {
      W.ring = makeMarker(game, p, 0xffd25a, { radius: opts.radius ?? 2.2 });
    }
    if (opts.gps !== false) game.waypoint = { x: p.x, z: p.z };
  };

  W.pos = () => {
    const t = typeof W.target === 'function' ? W.target() : W.target;
    return t && Number.isFinite(t.x) && Number.isFinite(t.z) ? t : null;
  };

  // moving targets: the blip follows every frame, the map waypoint (route) every 1.5 s
  W.update = (dt) => {
    if (!W.target || typeof W.target !== 'function') return;
    const p = W.pos();
    if (!p || !W.blip) return;
    W.blip.x = p.x;
    W.blip.z = p.z;
    if (W.ring) W.ring.position.set(p.x, W.ring.position.y, p.z);
    W.t += dt;
    if (W.t > 1.5 && W.opts.gps !== false) {
      W.t = 0;
      const pp = game.player.position;
      if (Math.hypot(p.x - pp.x, p.z - pp.z) > 30) game.waypoint = { x: p.x, z: p.z };
    }
  };

  W.clear = () => {
    removeBlip(game, W.blip);
    removeMarker(game, W.ring);
    if (W.target && game.waypoint) game.waypoint = null;
    W.blip = null;
    W.ring = null;
    W.target = null;
  };
  return W;
}

// ---------------------------------------------------------------- available-mission markers
// story: the game.story object (missions, state, active, startMission). Runs from index.js's updater.
export function createMissionMarkers(game, story) {
  const shown = new Map(); // mission id -> { blip, ring, at }
  let latch = null; // mission id the player is standing in (no restart until he steps out)
  let checkT = 0;

  function startPoint(def) {
    const at = def.start?.at;
    const p = typeof at === 'function' ? at(game) : at;
    return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : null;
  }

  function available(def) {
    if (!def.start?.marker) return false;
    if (story.state.isDone(def.id) && !def.repeatable) return false;
    return story.state.meets(def.requires);
  }

  function show(def) {
    const at = startPoint(def);
    if (!at) return;
    const letter = (def.giver || def.title || '?').trim().charAt(0).toUpperCase();
    const blip = addBlip(game, {
      x: at.x,
      z: at.z,
      letter,
      color: def.color || STORY_PINK,
      label: def.title,
    });
    shown.set(def.id, { def, blip, ring: null, at });
  }

  function hide(id) {
    const m = shown.get(id);
    if (!m) return;
    removeBlip(game, m.blip);
    removeMarker(game, m.ring);
    shown.delete(id);
  }

  // which markers should exist: re-run whenever the state changes or a mission ends
  function refresh() {
    const busy = !!story.active;
    for (const def of story.missions.values()) {
      const want = !busy && available(def);
      if (want && !shown.has(def.id)) show(def);
      else if (!want && shown.has(def.id)) hide(def.id);
    }
  }

  function update(dt) {
    if ((checkT -= dt) > 0) return;
    checkT = 0.2;
    if (story.active || game.ui?.title || game.frontEnd?.active) return;
    const pp = game.player.position;
    for (const [id, m] of shown) {
      // the start spot may move once its set piece has loaded (house anchors): follow it
      const at = startPoint(m.def);
      if (at && (at.x !== m.at.x || at.z !== m.at.z)) moveMarker(m, at);
      const d = Math.hypot(pp.x - m.at.x, pp.z - m.at.z);
      if (d < RING_SHOW_M && !m.ring) m.ring = makeMarker(game, m.at, 0xff2e8a, { radius: 2.4 });
      else if (d > RING_SHOW_M + 40 && m.ring) {
        removeMarker(game, m.ring);
        m.ring = null;
      }
      if (latch === id && d > START_R + 3) latch = null;
      if (d < START_R && latch !== id && canStart()) {
        latch = id;
        story.startMission(id, { from: 'marker' });
        return;
      }
    }
  }

  function moveMarker(m, at) {
    m.at = at;
    m.blip.x = at.x;
    m.blip.z = at.z;
    removeMarker(game, m.ring);
    m.ring = null;
  }

  function canStart() {
    const ui = game.ui || {};
    if (ui.paused || ui.dead || ui.arrested || ui.phoneOpen) return false;
    if ((game.wanted?.level || 0) > 0) return false;
    const st = game.player.state;
    return !(st?.inVehicle && Math.abs(st.vehicle?.speedKmh || 0) > 15);
  }

  return {
    refresh,
    update,
    shown,
    latch: (id) => {
      latch = id;
    },
  };
}
