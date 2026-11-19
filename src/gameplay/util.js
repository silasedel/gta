// Shared helpers for the gameplay systems (GAMEPLAY agent).
import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const warned = new Set();
export function warnOnce(key, e) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[gameplay]', key, e);
}
export function tryCall(key, fn, fallback) {
  try {
    return fn();
  } catch (e) {
    warnOnce(key, e);
    return fallback;
  }
}

// ---------------------------------------------------------------- sound
// Uses game.audio.play when the PLAYER agent provides it; otherwise a tiny procedural fallback.
let ctx = null,
  noiseBuf = null,
  master = null;
function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function burst(c, vol, dur, freq, type = 'lowpass', q = 0.7) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}
function tone(c, vol, freq, dur, type = 'sine', delay = 0, endFreq = null) {
  const o = c.createOscillator();
  o.type = type;
  const t = c.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const NATIVE_OK = new Set([
  'punch_hit',
  'bullet_hit_flesh',
  'pistol',
  'revolver',
  'microsmg',
  'smg',
  'rifle',
  'carbine',
  'shotgun',
  'sawnoff',
  'sniper',
  'grenade',
  'explosion',
  'reload',
  'empty',
  'ricochet',
  'car_crash',
  'glass',
  'door',
  'cash',
  'siren',
  'scream',
  'splash',
]);
export function sfx(game, name, pos = null, volume = 1, flavour = null) {
  if (flavour && !game.audio?.play) name = flavour; // synth fallback flavour
  if (game.audio?.play) {
    // audio.js has real recordings + its own synth fallback for every key
    try {
      game.audio.play(name, { position: pos, volume });
      return;
    } catch (e) {
      /* fall through */
    }
  }
  const c = ac();
  if (!c) return;
  let v = volume;
  if (pos && game.camera) v *= 1 / (1 + game.camera.position.distanceTo(pos) * 0.05);
  if (v < 0.01) return;
  try {
    switch (name) {
      case 'pistol':
        burst(c, 0.9 * v, 0.22, 2400);
        tone(c, 0.5 * v, 160, 0.12, 'square', 0, 50);
        break;
      case 'smg':
        burst(c, 0.6 * v, 0.11, 3000);
        tone(c, 0.3 * v, 200, 0.07, 'square', 0, 70);
        break;
      case 'shotgun':
        burst(c, 1.0 * v, 0.45, 1400);
        tone(c, 0.7 * v, 110, 0.25, 'square', 0, 40);
        break;
      case 'rifle':
        burst(c, 0.9 * v, 0.2, 3200);
        tone(c, 0.5 * v, 140, 0.1, 'square', 0, 45);
        break;
      case 'light':
        burst(c, 0.5 * v, 0.08, 3600);
        break;
      case 'heavy':
        burst(c, 1.0 * v, 0.35, 1800);
        tone(c, 0.7 * v, 120, 0.2, 'square', 0, 40);
        break;
      case 'sniper':
        burst(c, 1.0 * v, 0.6, 2000);
        tone(c, 0.8 * v, 90, 0.35, 'square', 0, 30);
        break;
      case 'explosion':
        burst(c, 1.4 * v, 1.4, 500);
        burst(c, 0.8 * v, 0.5, 2500);
        tone(c, 1.0 * v, 70, 0.9, 'sine', 0, 25);
        break;
      case 'casing':
        tone(c, 0.08 * v, 3400 + Math.random() * 900, 0.09, 'triangle');
        tone(c, 0.05 * v, 5200, 0.05, 'sine', 0.06);
        break;
      case 'shell_drop':
        tone(c, 0.08 * v, 700, 0.06, 'triangle');
        burst(c, 0.08 * v, 0.05, 1500);
        break;
      case 'empty':
        tone(c, 0.2 * v, 1800, 0.03, 'square');
        break;
      case 'reload':
        tone(c, 0.15 * v, 900, 0.04, 'square');
        tone(c, 0.15 * v, 600, 0.05, 'square', 0.12);
        break;
      case 'swing':
        burst(c, 0.25 * v, 0.18, 900, 'bandpass', 2);
        break;
      case 'bat_hit':
        burst(c, 0.7 * v, 0.12, 700);
        tone(c, 0.3 * v, 220, 0.1, 'triangle');
        break;
      case 'cash':
        tone(c, 0.25 * v, 1320, 0.12, 'triangle');
        tone(c, 0.25 * v, 1760, 0.2, 'triangle', 0.08);
        break;
      case 'pickup':
        tone(c, 0.2 * v, 520, 0.18, 'triangle', 0, 1040);
        break;
      case 'health':
        tone(c, 0.2 * v, 660, 0.15, 'sine');
        tone(c, 0.2 * v, 880, 0.2, 'sine', 0.1);
        break;
      case 'armor':
        tone(c, 0.2 * v, 300, 0.2, 'square', 0, 600);
        break;
      case 'can':
        tone(c, 0.25 * v, 180, 0.15, 'square', 0, 80);
        burst(c, 0.3 * v, 0.2, 4000, 'highpass');
        break;
      case 'beep':
        tone(c, 0.15 * v, 1200, 0.08, 'square');
        break;
      case 'ring':
        tone(c, 0.12 * v, 440, 0.4, 'sine');
        tone(c, 0.12 * v, 480, 0.4, 'sine');
        break;
      case 'door':
        burst(c, 0.4 * v, 0.15, 500);
        break;
      case 'punch_hit':
        burst(c, 0.6 * v, 0.1, 600);
        break;
      case 'bullet_hit_flesh':
        burst(c, 0.4 * v, 0.08, 900);
        break;
      case 'ricochet':
        tone(c, 0.12 * v, 2400, 0.25, 'sine', 0, 900);
        break;
      case 'whistle':
        tone(c, 0.18 * v, 2200, 0.25, 'sine', 0, 2600);
        tone(c, 0.18 * v, 2200, 0.3, 'sine', 0.3, 2600);
        break;
      default:
        break;
    }
  } catch (e) {
    /* ignore */
  }
}

// ---------------------------------------------------------------- physics helpers
export function fixedOnlyFlags(RAPIER) {
  const F = RAPIER.QueryFilterFlags;
  return F.EXCLUDE_DYNAMIC | F.EXCLUDE_KINEMATIC | F.EXCLUDE_SENSORS;
}
// line of sight against static world only (buildings, props)
export function hasLOS(game, a, b) {
  try {
    const { RAPIER, world } = game;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return true;
    const ray = new RAPIER.Ray({ x: a.x, y: a.y, z: a.z }, { x: dx / d, y: dy / d, z: dz / d });
    const h = world.castRay(ray, d, true, fixedOnlyFlags(RAPIER));
    if (!h) return true;
    return (h.timeOfImpact ?? h.toi) >= d - 0.4;
  } catch (e) {
    return true;
  }
}
export function groundAt(game, x, z, fromY = 30) {
  try {
    const { RAPIER, world } = game;
    const h = world.castRay(
      new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }),
      fromY + 5,
      true,
      fixedOnlyFlags(RAPIER),
    );
    if (h) return fromY - (h.timeOfImpact ?? h.toi);
  } catch (e) {
    /* ignore */
  }
  return 0;
}

// point near `center` on a sidewalk or road lane (uses city.grid)
const _f = new THREE.Vector3();
export function inView(game, p, cos = 0.45) {
  const cam = game.camera;
  if (!cam) return false;
  cam.getWorldDirection(_f);
  const dx = p.x - cam.position.x,
    dy = p.y + 1 - cam.position.y,
    dz = p.z - cam.position.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  return (dx * _f.x + dy * _f.y + dz * _f.z) / d > cos;
}
export function pointNear(
  game,
  center,
  minD,
  maxD,
  kind = 'sidewalk',
  avoidView = false,
  tries = 50,
) {
  const city = game.city || {};
  const g = city.grid;
  const half = city.half || 500;
  for (let i = 0; i < tries; i++) {
    let pos,
      heading = 0;
    if (g && g.xs && g.zs) {
      const vertical = Math.random() < 0.5;
      const lines = vertical ? g.xs : g.zs;
      const lat0 = vertical ? center.x : center.z,
        along0 = vertical ? center.z : center.x;
      const cand = lines.filter((c) => Math.abs(c - lat0) < maxD);
      if (!cand.length) continue;
      const C = pick(cand);
      const along = along0 + rand(-maxD, maxD);
      if (Math.abs(along) > half - 15) continue;
      const RW = g.roadWidth || 14,
        SW = g.sidewalkWidth || 4;
      if (kind === 'road') {
        const dir = Math.sign(along0 - along) || 1;
        const off = (g.laneOffsets && g.laneOffsets[0]) || 1.75;
        pos = vertical
          ? new THREE.Vector3(C - dir * off, 0, along)
          : new THREE.Vector3(along, 0, C + dir * off);
        heading = vertical ? Math.atan2(0, dir) : Math.atan2(dir, 0);
      } else {
        const s = Math.random() < 0.5 ? -1 : 1;
        const off = s * (RW / 2 + SW * (kind === 'wall' ? 0.85 : 0.5));
        pos = vertical
          ? new THREE.Vector3(C + off, g.curbHeight ?? 0.15, along)
          : new THREE.Vector3(along, g.curbHeight ?? 0.15, C + off);
        // face the road
        heading = vertical ? Math.atan2(-s, 0) : Math.atan2(0, -s);
        if (kind === 'wall') {
          // keep away from intersections
          const cross = vertical ? g.zs : g.xs;
          if (cross.some((c) => Math.abs(c - along) < RW / 2 + SW + 3)) continue;
        }
      }
    } else if (kind !== 'road' && city.randomSidewalkPoint) {
      pos = city.randomSidewalkPoint().clone();
    } else if (city.randomRoadPoint) {
      const r = city.randomRoadPoint();
      pos = r.position.clone();
      heading = r.heading;
    } else return null;
    const d = Math.hypot(pos.x - center.x, pos.z - center.z);
    if (d < minD || d > maxD) continue;
    if (avoidView && inView(game, pos)) continue;
    const gy = groundAt(game, pos.x, pos.z);
    if (gy > 1.2) continue; // inside a building / on a prop
    pos.y = Math.max(gy, 0);
    return { position: pos, heading };
  }
  return null;
}

// world position of a bone matching regex inside a root
export function findBone(root, re) {
  let found = null;
  root?.traverse?.((o) => {
    if (!found && (o.isBone || o.type === 'Bone') && re.test(o.name)) found = o;
  });
  return found;
}

// shared geometry cache: one BoxGeometry per size, never per instance
const _boxCache = new Map();
export function sharedBox(w, h, d) {
  const k = w + ',' + h + ',' + d;
  let g = _boxCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    _boxCache.set(k, g);
  }
  return g;
}
const _markerMats = new Map();
// simple marker sprite (canvas) e.g. "!" above a witness; material cached per text/colour
export function makeMarker(text, color = '#ff4d5e', size = 0.6) {
  const mk = text + '|' + color;
  const cached = _markerMats.get(mk);
  if (cached) {
    const s = new THREE.Sprite(cached);
    s.scale.setScalar(size);
    s.renderOrder = 999;
    return s;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 40px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  }); /* occluded by buildings and roofs (playtest P2) */
  _markerMats.set(mk, mat);
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = 999;
  return s;
}

// Post-animation IK-lite: rotate an upper-arm bone so shoulder->hand points at `target` (world).
const _pa = new THREE.Vector3(),
  _ph = new THREE.Vector3(),
  _d1 = new THREE.Vector3(),
  _d2 = new THREE.Vector3();
const _qa = new THREE.Quaternion(),
  _qb = new THREE.Quaternion(),
  _qc = new THREE.Quaternion(),
  _qi = new THREE.Quaternion();
export function aimArm(arm, hand, target, weight = 1) {
  if (!arm || !hand || !arm.parent) return;
  arm.updateWorldMatrix(true, true);
  arm.getWorldPosition(_pa);
  hand.getWorldPosition(_ph);
  _d1.subVectors(_ph, _pa);
  _d2.subVectors(target, _pa);
  if (_d1.lengthSq() < 1e-8 || _d2.lengthSq() < 1e-8) return;
  _d1.normalize();
  _d2.normalize();
  _qa.setFromUnitVectors(_d1, _d2);
  if (weight < 1) _qa.slerp(_qi, 1 - weight);
  arm.getWorldQuaternion(_qb).premultiply(_qa);
  arm.parent.getWorldQuaternion(_qc).invert();
  arm.quaternion.copy(_qc.multiply(_qb));
  arm.updateWorldMatrix(false, true);
}

// Remove colliders/bodies and refresh the query pipeline right away, so vehicle controllers / ray casts that run
// before the next world.step() never see a stale handle (that panics Rapier's wasm with "unreachable").
// a vehicle/body is only safe to touch while it still exists in the physics world
// (reading a removed RigidBody panics Rapier's wasm and poisons the whole world)
export function bodyAlive(game, body) {
  if (!body) return false;
  try {
    return game.world.bodies.contains(body.handle) && game.world.getRigidBody(body.handle) === body;
  } catch (e) {
    return false;
  }
}
export function vAlive(game, v) {
  return !!v && !v.removed && !v.disposed && bodyAlive(game, v.body);
}
export function removeColliderSafe(game, col) {
  if (!col) return;
  try {
    game.world.removeCollider(col, true);
  } catch (e) {
    /* already gone */
  }
  try {
    game.world.updateSceneQueries?.();
  } catch (e) {
    /* ignore */
  }
}
export function removeBodySafe(game, body) {
  if (!body) return;
  try {
    game.world.removeRigidBody(body);
  } catch (e) {
    /* already gone */
  }
  try {
    game.world.updateSceneQueries?.();
  } catch (e) {
    /* ignore */
  }
}
