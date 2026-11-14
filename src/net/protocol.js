// Port Solana multiplayer wire protocol (MULTIPLAYER track). Shared by the Node server (server/*) and the
// browser client (src/net/*): plain JS, no DOM, no three.js.
//
// Transport: one WebSocket per client. Hot state travels as small binary frames; everything else
// (join, chat, shots, vehicles, world rules) is JSON text frames.
//
// Binary frames (all little-endian):
//   C->S  STATE      client state, sent at TICK_HZ (quantized, about 34 bytes on foot, 40 in a car)
//   S->C  SNAPSHOT   per-client delta snapshot of the players inside the interest radius
//   S->C  CORRECT    reconciliation: the server rejected or clamped one of our states
//
// Quantization: positions 1/64 m in int24 (+-131 km), velocities 1/32 m/s in int16 (+-1024 m/s),
// heading as uint16 of a full turn, pitch/roll as int16 of a half turn.

export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 30;
export const MAX_PLAYERS = 16;
export const INTEREST_RADIUS = 400;
export const INTEREST_DROP = 430;

export const MSG_STATE = 1;
export const MSG_SNAPSHOT = 2;
export const MSG_CORRECT = 3;

// player flags (STATE and SNAPSHOT)
export const F_IN_VEHICLE = 1;
export const F_GROUNDED = 2;
export const F_SPRINT = 4;
export const F_JUMPING = 8;
export const F_SWIMMING = 16;
export const F_DEAD = 32;
export const F_AIMING = 64;
export const F_PUNCH = 128;

// vehicle flags
export const V_LIGHTS = 1;
export const V_BRAKE = 2;
export const V_REVERSE = 4;
export const V_SIREN = 8;
export const V_HORN = 16;

// snapshot entity masks
export const M_POS = 1;
export const M_ROT = 2;
export const M_ANIM = 4;
export const M_STAT = 8;
export const M_VEH = 16;
export const M_ENTER = 32;

export const SEAT_NONE = 255;

// correction reasons
export const C_SPEED = 1;
export const C_TELEPORT = 2;
export const C_RESPAWN = 3;

export const POS_Q = 64;
export const VEL_Q = 32;
const TAU = Math.PI * 2;

// Weapon index order on the wire. Damage, fire interval, range and pellets mirror src/gameplay/weapons.js;
// the server uses them for hit validation (it never trusts a damage number sent by a client).
export const WEAPONS = [
  { key: 'fist', dmg: 8, rate: 0.4, range: 1.6, pellets: 1, melee: true },
  { key: 'knife', dmg: 75, rate: 0.5, range: 1.9, pellets: 1, melee: true },
  { key: 'bat', dmg: 55, rate: 0.6, range: 2.2, pellets: 1, melee: true },
  { key: 'crowbar', dmg: 60, rate: 0.6, range: 2.1, pellets: 1, melee: true },
  { key: 'bottle', dmg: 30, rate: 0.5, range: 1.8, pellets: 1, melee: true },
  { key: 'pistol', dmg: 30, rate: 0.2, range: 140, pellets: 1 },
  { key: 'revolver', dmg: 72, rate: 0.55, range: 170, pellets: 1 },
  { key: 'microsmg', dmg: 13, rate: 0.052, range: 70, pellets: 1 },
  { key: 'smg', dmg: 18, rate: 0.075, range: 100, pellets: 1 },
  { key: 'rifle', dmg: 29, rate: 0.1, range: 230, pellets: 1 },
  { key: 'carbine', dmg: 38, rate: 0.15, range: 260, pellets: 1 },
  { key: 'shotgun', dmg: 14, rate: 0.85, range: 45, pellets: 8 },
  { key: 'sawnoff', dmg: 13, rate: 0.3, range: 24, pellets: 11 },
  { key: 'sniper', dmg: 165, rate: 1.25, range: 500, pellets: 1 },
  { key: 'grenade', dmg: 0, rate: 1, range: 0, pellets: 0 },
  { key: 'molotov', dmg: 0, rate: 1, range: 0, pellets: 0 },
];
const WEAPON_INDEX = new Map();
for (let i = 0; i < WEAPONS.length; i++) {
  WEAPON_INDEX.set(WEAPONS[i].key, i);
}
export function weaponIndex(key) {
  return WEAPON_INDEX.get(key) ?? 0;
}
export function weaponKey(i) {
  return WEAPONS[i]?.key || 'fist';
}

// ---------------------------------------------------------------- quantization helpers
export function qPos(v) {
  const q = Math.round(v * POS_Q);
  return q < -8388608 ? -8388608 : q > 8388607 ? 8388607 : q;
}
export function qVel(v) {
  const q = Math.round(v * VEL_Q);
  return q < -32768 ? -32768 : q > 32767 ? 32767 : q;
}
export function qHeading(a) {
  let t = (a % TAU) / TAU;
  if (t < 0) {
    t += 1;
  }
  return Math.round(t * 65536) & 0xffff;
}
export function dqHeading(q) {
  const a = (q / 65536) * TAU;
  return a > Math.PI ? a - TAU : a;
}
export function qAngle(a) {
  const w = Math.atan2(Math.sin(a), Math.cos(a));
  const q = Math.round((w / Math.PI) * 32767);
  return q < -32767 ? -32767 : q > 32767 ? 32767 : q;
}
export function dqAngle(q) {
  return (q / 32767) * Math.PI;
}
function clampU8(v) {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}
function clampI8(v) {
  const r = Math.round(v);
  return r < -127 ? -127 : r > 127 ? 127 : r;
}

// ---------------------------------------------------------------- byte writer / reader (reused, no per-message allocation in steady state)
export class Writer {
  constructor(size = 2048) {
    this.buf = new ArrayBuffer(size);
    this.dv = new DataView(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.o = 0;
  }
  reset() {
    this.o = 0;
    return this;
  }
  ensure(n) {
    if (this.o + n <= this.buf.byteLength) {
      return;
    }
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(this.u8);
    this.buf = nb;
    this.dv = new DataView(nb);
    this.u8 = new Uint8Array(nb);
  }
  w8(v) {
    this.ensure(1);
    this.dv.setUint8(this.o, v & 0xff);
    this.o += 1;
  }
  wi8(v) {
    this.ensure(1);
    this.dv.setInt8(this.o, v);
    this.o += 1;
  }
  w16(v) {
    this.ensure(2);
    this.dv.setUint16(this.o, v & 0xffff, true);
    this.o += 2;
  }
  wi16(v) {
    this.ensure(2);
    this.dv.setInt16(this.o, v, true);
    this.o += 2;
  }
  w32(v) {
    this.ensure(4);
    this.dv.setUint32(this.o, v >>> 0, true);
    this.o += 4;
  }
  wi24(v) {
    this.ensure(3);
    const u = v & 0xffffff;
    this.u8[this.o] = u & 0xff;
    this.u8[this.o + 1] = (u >> 8) & 0xff;
    this.u8[this.o + 2] = (u >> 16) & 0xff;
    this.o += 3;
  }
  // a copy of the written bytes (what goes on the wire)
  bytes() {
    return this.u8.slice(0, this.o);
  }
}

export class Reader {
  constructor(data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.o = 0;
  }
  get left() {
    return this.u8.byteLength - this.o;
  }
  r8() {
    const v = this.dv.getUint8(this.o);
    this.o += 1;
    return v;
  }
  ri8() {
    const v = this.dv.getInt8(this.o);
    this.o += 1;
    return v;
  }
  r16() {
    const v = this.dv.getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  ri16() {
    const v = this.dv.getInt16(this.o, true);
    this.o += 2;
    return v;
  }
  r32() {
    const v = this.dv.getUint32(this.o, true);
    this.o += 4;
    return v;
  }
  ri24() {
    const u = this.u8[this.o] | (this.u8[this.o + 1] << 8) | (this.u8[this.o + 2] << 16);
    this.o += 3;
    return (u << 8) >> 8;
  }
}

// ---------------------------------------------------------------- client state (C->S)
// s: { seq, time, flags, x, y, z, vx, vy, vz, heading, animSpeed, health, armor, wanted, weapon (index),
//      veh (net id, 0 = none), seat (SEAT_NONE when on foot), pitch, roll, steer (-1..1), vflags }
export function encodeState(w, s) {
  w.reset();
  w.w8(MSG_STATE);
  w.w16(s.seq);
  w.w32(s.time);
  w.w8(s.flags);
  w.wi24(qPos(s.x));
  w.wi24(qPos(s.y));
  w.wi24(qPos(s.z));
  w.wi16(qVel(s.vx));
  w.wi16(qVel(s.vy));
  w.wi16(qVel(s.vz));
  w.w16(qHeading(s.heading));
  w.w8(clampU8(s.animSpeed * 16));
  w.w8(clampU8(s.health));
  w.w8(clampU8(s.armor));
  w.w8(clampU8(s.wanted));
  w.w8(s.weapon & 0xff);
  w.w16(s.veh || 0);
  w.w8(s.seat ?? SEAT_NONE);
  if ((s.seat ?? SEAT_NONE) !== SEAT_NONE) {
    w.wi16(qAngle(s.pitch || 0));
    w.wi16(qAngle(s.roll || 0));
    w.wi8(clampI8((s.steer || 0) * 127));
    w.w8(s.vflags || 0);
  }
  return w;
}

// decodes into `out` (a reusable object); returns out or null when malformed
export function decodeState(data, out) {
  const r = new Reader(data);
  if (r.left < 34 || r.r8() !== MSG_STATE) {
    return null;
  }
  out.seq = r.r16();
  out.time = r.r32();
  out.flags = r.r8();
  out.qx = r.ri24();
  out.qy = r.ri24();
  out.qz = r.ri24();
  out.x = out.qx / POS_Q;
  out.y = out.qy / POS_Q;
  out.z = out.qz / POS_Q;
  out.qvx = r.ri16();
  out.qvy = r.ri16();
  out.qvz = r.ri16();
  out.vx = out.qvx / VEL_Q;
  out.vy = out.qvy / VEL_Q;
  out.vz = out.qvz / VEL_Q;
  out.qh = r.r16();
  out.heading = dqHeading(out.qh);
  out.qAnim = r.r8();
  out.animSpeed = out.qAnim / 16;
  out.health = r.r8();
  out.armor = r.r8();
  out.wanted = r.r8();
  out.weapon = r.r8();
  out.veh = r.r16();
  out.seat = r.r8();
  out.qPitch = 0;
  out.qRoll = 0;
  out.qSteer = 0;
  out.vflags = 0;
  if (out.seat !== SEAT_NONE) {
    if (r.left < 6) {
      return null;
    }
    out.qPitch = r.ri16();
    out.qRoll = r.ri16();
    out.qSteer = r.ri8();
    out.vflags = r.r8();
  }
  out.pitch = dqAngle(out.qPitch);
  out.roll = dqAngle(out.qRoll);
  out.steer = out.qSteer / 127;
  return out;
}

// ---------------------------------------------------------------- snapshot (S->C)
// Server side: the caller writes the header, then one entity block per player, then the removals.
export function writeSnapshotHeader(w, tick, serverTime, ackSeq, count) {
  w.reset();
  w.w8(MSG_SNAPSHOT);
  w.w32(tick);
  w.w32(serverTime);
  w.w16(ackSeq);
  w.w8(count);
}

// e holds quantized values (q*); mask says which groups follow
export function writeEntity(w, id, mask, e, sampleDt) {
  w.w8(id);
  w.w8(mask);
  if (mask & M_POS) {
    const d = sampleDt < -32768 ? -32768 : sampleDt > 32767 ? 32767 : sampleDt;
    w.wi16(d);
    w.wi24(e.qx);
    w.wi24(e.qy);
    w.wi24(e.qz);
    w.wi16(e.qvx);
    w.wi16(e.qvy);
    w.wi16(e.qvz);
  }
  if (mask & M_ROT) {
    w.w16(e.qh);
  }
  if (mask & M_ANIM) {
    w.w8(e.flags);
    w.w8(e.qAnim);
  }
  if (mask & M_STAT) {
    w.w8(e.health);
    w.w8(e.armor);
    w.w8(e.wanted);
    w.w8(e.weapon);
  }
  if (mask & M_VEH) {
    w.w16(e.veh);
    w.w8(e.seat);
    if (e.seat !== SEAT_NONE) {
      w.wi16(e.qPitch);
      w.wi16(e.qRoll);
      w.wi8(e.qSteer);
      w.w8(e.vflags);
    }
  }
}

export function writeRemovals(w, ids) {
  w.w8(ids.length);
  for (const id of ids) {
    w.w8(id);
  }
}

// Client side: calls onEntity(id, mask, fields, sampleTime) for each block; fields is reused between calls.
const _ent = {
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: 0, flags: 0, animSpeed: 0,
  health: 0, armor: 0, wanted: 0, weapon: 0, veh: 0, seat: SEAT_NONE, pitch: 0, roll: 0, steer: 0, vflags: 0,
};
export function decodeSnapshot(data, head, onEntity, onRemove) {
  const r = new Reader(data);
  if (r.left < 12 || r.r8() !== MSG_SNAPSHOT) {
    return false;
  }
  head.tick = r.r32();
  head.serverTime = r.r32();
  head.ack = r.r16();
  const n = r.r8();
  for (let i = 0; i < n; i++) {
    const id = r.r8();
    const mask = r.r8();
    let sampleTime = head.serverTime;
    const e = _ent;
    if (mask & M_POS) {
      sampleTime = head.serverTime + r.ri16();
      e.x = r.ri24() / POS_Q;
      e.y = r.ri24() / POS_Q;
      e.z = r.ri24() / POS_Q;
      e.vx = r.ri16() / VEL_Q;
      e.vy = r.ri16() / VEL_Q;
      e.vz = r.ri16() / VEL_Q;
    }
    if (mask & M_ROT) {
      e.heading = dqHeading(r.r16());
    }
    if (mask & M_ANIM) {
      e.flags = r.r8();
      e.animSpeed = r.r8() / 16;
    }
    if (mask & M_STAT) {
      e.health = r.r8();
      e.armor = r.r8();
      e.wanted = r.r8();
      e.weapon = r.r8();
    }
    if (mask & M_VEH) {
      e.veh = r.r16();
      e.seat = r.r8();
      if (e.seat !== SEAT_NONE) {
        e.pitch = dqAngle(r.ri16());
        e.roll = dqAngle(r.ri16());
        e.steer = r.ri8() / 127;
        e.vflags = r.r8();
      }
    }
    onEntity(id, mask, e, sampleTime);
  }
  if (r.left > 0) {
    const g = r.r8();
    for (let i = 0; i < g; i++) {
      onRemove(r.r8());
    }
  }
  return true;
}

// ---------------------------------------------------------------- correction (S->C)
export function encodeCorrect(w, seq, x, y, z, reason) {
  w.reset();
  w.w8(MSG_CORRECT);
  w.w16(seq);
  w.wi24(qPos(x));
  w.wi24(qPos(y));
  w.wi24(qPos(z));
  w.w8(reason);
  return w;
}
export function decodeCorrect(data) {
  const r = new Reader(data);
  if (r.left < 13 || r.r8() !== MSG_CORRECT) {
    return null;
  }
  return {
    seq: r.r16(),
    x: r.ri24() / POS_Q,
    y: r.ri24() / POS_Q,
    z: r.ri24() / POS_Q,
    reason: r.r8(),
  };
}

// 16-bit sequence compare (handles wrap)
export function seqNewer(a, b) {
  return ((a - b) & 0xffff) !== 0 && ((a - b) & 0xffff) < 0x8000;
}

// room codes: 4-8 letters and digits, no look-alike characters
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function cleanRoom(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
export function cleanName(s) {
  const t = String(s || '').replace(/[\u0000-\u001f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return t || 'Player';
}
export function cleanChat(s) {
  return String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}
