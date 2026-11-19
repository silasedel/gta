// Port Solana multiplayer: one room (a shared free-roam session of up to 16 players).
// The server is authoritative for: who is in the room, accepted positions (speed and teleport checks with
// corrections), PvP hits and damage (lag compensated), vehicle ownership, chat, time of day and weather.
// Clients own their own physics (the city colliders live in the browser) and are validated here.
import {
  TICK_HZ,
  MAX_PLAYERS,
  INTEREST_RADIUS,
  INTEREST_DROP,
  SEAT_NONE,
  F_IN_VEHICLE,
  F_DEAD,
  M_POS,
  M_ROT,
  M_ANIM,
  M_STAT,
  M_VEH,
  M_ENTER,
  C_SPEED,
  C_TELEPORT,
  WEAPONS,
  Writer,
  decodeState,
  writeSnapshotHeader,
  writeEntity,
  writeRemovals,
  encodeCorrect,
  seqNewer,
  cleanName,
  cleanChat,
} from '../src/net/protocol.js';

const FOOT_MAX = 14; // m/s: sprint is ~7, knockbacks and falls add some
const VEHICLE_MAX = 125; // m/s: the fastest cars and aircraft
const UP_MAX_FOOT = 14;
const UP_MAX_VEHICLE = 90;
const SLACK = 1.5; // m of free error per state (quantization, kinematic nudges)
const TP_WINDOW_MS = 1500; // a declared teleport allows one big jump inside this window
const TP_MIN_GAP_MS = 2500; // at most one declared teleport every 2.5 s
const HISTORY_MS = 1200; // position history kept for lag compensation
const SPREAD = {
  shotgun: 0.055,
  sawnoff: 0.09,
};
const WEATHER_KINDS = [
  { kind: 'clear', rain: 0, w: 4 },
  { kind: 'partly', rain: 0, w: 4 },
  { kind: 'cloudy', rain: 0, w: 2 },
  { kind: 'rain', rain: 0.6, w: 1.2 },
  { kind: 'storm', rain: 1, w: 0.5 },
];

export class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.players = new Array(MAX_PLAYERS).fill(null);
    this.vehicles = new Map();
    this.tick = 0;
    this.now = opts.now || (() => Date.now());
    this.t0 = this.now();
    this.w = new Writer(4096);
    this.cw = new Writer(64);
    this.log = opts.log || (() => {});
    this.rand = opts.rand || Math.random;
    // shared world rules: a new room starts at 9 AM, clear; one game day lasts 144 real minutes (same as single-player)
    this.world = {
      tod: opts.tod ?? 9,
      dayMinutes: 144,
      weather: 'clear',
      rain: 0,
      weatherUntil: this.serverTime() + 8 * 60000,
    };
    this.worldSentAt = 0;
    this.stats = {
      shots: 0,
      hits: 0,
      corrections: 0,
      teleports: 0,
    };
  }

  serverTime() {
    return (this.now() - this.t0) >>> 0;
  }

  count() {
    let n = 0;
    for (const p of this.players) {
      if (p) {
        n++;
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- membership
  join(conn, hello) {
    const slot = this.players.indexOf(null);
    if (slot < 0) {
      return null;
    }
    let name = cleanName(hello.name);
    const taken = new Set(this.players.filter(Boolean).map((p) => p.name.toLowerCase()));
    for (let i = 2; taken.has(name.toLowerCase()); i++) {
      name = cleanName(hello.name).slice(0, 15) + ' ' + i;
    }
    const p = {
      id: slot,
      conn,
      name,
      outfit: Array.isArray(hello.outfit)
        ? hello.outfit.slice(0, 16).map((s) => String(s).slice(0, 40))
        : [],
      body: sanitizeBody(hello.body),
      st: null, // last accepted state (decoded, quantized fields)
      scratch: {},
      sampleSeq: 0,
      sampleTime: 0,
      lastSeq: -1,
      offset: null, // server time - client time (min filtered)
      hist: [], // [{ t, x, y, z }]
      tpUntil: 0,
      tpLast: -1e9,
      tpCount: 0,
      correctSeq: -1,
      correctAt: 0,
      strikes: 0,
      shotTimes: [],
      chatTokens: 5,
      chatAt: this.now(),
      interpDelay: 100,
      sent: new Map(), // other id -> last sent quantized values
      bytesOut: 0,
      bytesIn: 0,
      statesIn: 0,
      health: 100,
      dead: false,
    };
    this.players[slot] = p;
    this.send(p, {
      t: 'welcome',
      id: slot,
      name,
      room: this.code,
      tick: TICK_HZ,
      now: this.serverTime(),
      interest: INTEREST_RADIUS,
      players: this.players.filter((o) => o && o !== p).map((o) => this.publicInfo(o)),
      vehicles: [...this.vehicles.values()].map((v) => this.vehicleInfo(v)),
      world: this.worldInfo(),
    });
    this.broadcast({ t: 'join', ...this.publicInfo(p) }, p);
    this.log(`[room ${this.code}] ${name} joined as #${slot} (${this.count()}/${MAX_PLAYERS})`);
    return p;
  }

  leave(p) {
    if (!p || this.players[p.id] !== p) {
      return;
    }
    this.players[p.id] = null;
    for (const v of [...this.vehicles.values()]) {
      if (v.owner === p.id) {
        this.vehicles.delete(v.id);
        this.broadcast({ t: 'vgone', id: v.id });
      }
    }
    for (const o of this.players) {
      if (o) {
        o.sent.delete(p.id);
      }
    }
    this.broadcast({ t: 'leave', id: p.id, name: p.name });
    this.log(`[room ${this.code}] ${p.name} left (${this.count()}/${MAX_PLAYERS})`);
  }

  publicInfo(p) {
    return {
      id: p.id,
      name: p.name,
      outfit: p.outfit,
      body: p.body,
    };
  }

  vehicleInfo(v) {
    return {
      id: v.id,
      owner: v.owner,
      key: v.key,
      kind: v.kind,
      color: v.color,
      look: v.look,
      p: v.p,
      r: v.r,
      driver: v.driver,
    };
  }

  worldInfo() {
    return {
      tod: this.world.tod,
      dayMinutes: this.world.dayMinutes,
      weather: this.world.weather,
      rain: this.world.rain,
    };
  }

  send(p, msg) {
    const s = JSON.stringify(msg);
    p.bytesOut += s.length;
    p.conn.send(s);
  }

  sendBinary(p, bytes) {
    p.bytesOut += bytes.byteLength;
    p.conn.send(bytes);
  }

  broadcast(msg, except = null) {
    const s = JSON.stringify(msg);
    for (const p of this.players) {
      if (p && p !== except) {
        p.bytesOut += s.length;
        p.conn.send(s);
      }
    }
  }

  // to every player within `radius` of (x, z), except one
  broadcastNear(msg, x, z, radius, except = null) {
    const s = JSON.stringify(msg);
    for (const p of this.players) {
      if (!p || p === except || !p.st) {
        continue;
      }
      if (Math.hypot(p.st.x - x, p.st.z - z) <= radius) {
        p.bytesOut += s.length;
        p.conn.send(s);
      }
    }
  }

  // ---------------------------------------------------------------- binary state from a client
  onState(p, data) {
    const now = this.serverTime();
    p.bytesIn += data.byteLength;
    const s = decodeState(data, p.scratch);
    if (!s) {
      return;
    }
    if (p.lastSeq >= 0 && !seqNewer(s.seq, p.lastSeq)) {
      return;
    }
    p.lastSeq = s.seq;
    p.statesIn++;
    // map the client's clock onto ours: the smallest observed (arrival - send) is the best estimate
    const o = now - s.time;
    if (p.offset === null || o < p.offset) {
      p.offset = o;
    } else {
      p.offset += (o - p.offset) * 0.002;
    }
    let t = s.time + p.offset;
    if (t > now) {
      t = now;
    }
    if (t <= p.sampleTime) {
      t = p.sampleTime + 1;
    }
    const prev = p.st;
    const inVeh = (s.flags & F_IN_VEHICLE) !== 0;
    let accept = true;
    let reason = 0;
    if (prev) {
      const dt = Math.max(1 / 120, (t - p.sampleTime) / 1000);
      const dh = Math.hypot(s.x - prev.x, s.z - prev.z);
      const dy = s.y - prev.y;
      const vmax = inVeh || prev.flags & F_IN_VEHICLE ? VEHICLE_MAX : FOOT_MAX;
      const upMax = inVeh || prev.flags & F_IN_VEHICLE ? UP_MAX_VEHICLE : UP_MAX_FOOT;
      const okH = dh <= vmax * dt * 1.25 + SLACK;
      const okV = dy <= upMax * dt * 1.25 + SLACK;
      if (!okH || !okV) {
        if (now <= p.tpUntil) {
          p.tpUntil = 0;
          this.stats.teleports++;
        } else {
          accept = false;
          reason = dh > 60 ? C_TELEPORT : C_SPEED;
        }
      }
    }
    if (!accept) {
      // keep the last good position; tell the client once per episode (and again every second if it ignores us)
      p.strikes++;
      if (p.correctSeq < 0 || now - p.correctAt > 1000) {
        p.correctSeq = s.seq;
        p.correctAt = now;
        this.stats.corrections++;
        encodeCorrect(this.cw, s.seq, prev.x, prev.y, prev.z, reason);
        this.sendBinary(p, this.cw.bytes());
      }
      // the non-positional parts of the state still count
      prev.flags = s.flags;
      prev.qh = s.qh;
      prev.heading = s.heading;
      return;
    }
    p.correctSeq = -1;
    p.st = copyState(prev || {}, s);
    if (p.st.seat !== SEAT_NONE && !this.mayDrive(p, p.st.veh)) {
      p.st.seat = SEAT_NONE;
      p.st.veh = 0;
      p.st.flags &= ~F_IN_VEHICLE;
    }
    if (p.st.seat !== SEAT_NONE) {
      const v = this.vehicles.get(p.st.veh);
      v.driver = p.id;
      v.p = [p.st.x, p.st.y, p.st.z];
      v.r = [p.st.heading, p.st.pitch, p.st.roll];
    }
    p.st.health = Math.min(p.st.health, 200);
    p.st.wanted = Math.min(p.st.wanted, 5);
    p.health = p.st.health;
    p.dead = (p.st.flags & F_DEAD) !== 0;
    p.sampleTime = t;
    p.sampleSeq++;
    p.hist.push({ t, x: s.x, y: s.y, z: s.z });
    while (p.hist.length > 2 && p.hist[0].t < t - HISTORY_MS) {
      p.hist.shift();
    }
  }

  mayDrive(p, vid) {
    const v = this.vehicles.get(vid);
    return !!v && v.owner === p.id;
  }

  // ---------------------------------------------------------------- JSON messages from a client
  onMessage(p, m) {
    const now = this.serverTime();
    switch (m.t) {
      case 'ping':
        this.send(p, { t: 'pong', c: m.c, s: now });
        break;
      case 'cfg':
        p.interpDelay = Math.max(30, Math.min(400, Number(m.interp) || 100));
        break;
      case 'look':
        p.outfit = Array.isArray(m.outfit)
          ? m.outfit.slice(0, 16).map((s) => String(s).slice(0, 40))
          : p.outfit;
        p.body = sanitizeBody(m.body);
        this.broadcast({ t: 'look', id: p.id, outfit: p.outfit, body: p.body }, p);
        break;
      case 'tp':
        // a declared teleport (fast travel, respawn, entering an interior): allowed, but rate limited
        if (now - p.tpLast >= TP_MIN_GAP_MS) {
          p.tpLast = now;
          p.tpUntil = now + TP_WINDOW_MS;
          p.tpCount++;
        }
        break;
      case 'chat': {
        const text = cleanChat(m.text);
        const tn = this.now();
        p.chatTokens = Math.min(5, p.chatTokens + (tn - p.chatAt) / 2000);
        p.chatAt = tn;
        if (!text || p.chatTokens < 1) {
          break;
        }
        p.chatTokens -= 1;
        this.broadcast({ t: 'chat', id: p.id, name: p.name, text });
        break;
      }
      case 'veh':
        this.onVehicle(p, m);
        break;
      case 'vpark': {
        const v = this.vehicles.get(m.id);
        if (!v || v.owner !== p.id || !validVec(m.p, 3) || !validVec(m.r, 3)) {
          break;
        }
        if (p.st && Math.hypot(m.p[0] - p.st.x, m.p[2] - p.st.z) > INTEREST_DROP) {
          break;
        }
        v.p = m.p.map(Number);
        v.r = m.r.map(Number);
        if (v.driver === p.id) {
          v.driver = null;
        }
        this.broadcast({ t: 'vpark', id: v.id, p: v.p, r: v.r }, p);
        break;
      }
      case 'vgone': {
        const v = this.vehicles.get(m.id);
        if (v && v.owner === p.id) {
          this.vehicles.delete(v.id);
          this.broadcast({ t: 'vgone', id: v.id }, p);
        }
        break;
      }
      case 'claim':
        this.onClaim(p, m);
        break;
      case 'shot':
        this.onShot(p, m, now);
        break;
      case 'melee':
        this.onMelee(p, m, now);
        break;
      default:
        break;
    }
  }

  onVehicle(p, m) {
    // a vehicle this player now drives; net ids carry the owner slot in the top bits: ((slot + 1) << 10) | n
    const id = Number(m.id) | 0;
    if (id >> 10 !== p.id + 1 || (id & 1023) === 0) {
      return;
    }
    const prev = this.vehicles.get(id);
    if (prev && prev.owner !== p.id) {
      return;
    }
    let look = null;
    if (m.look && typeof m.look === 'object') {
      const s = JSON.stringify(m.look);
      if (s.length <= 6000) {
        look = m.look;
      }
    }
    const v = {
      id,
      owner: p.id,
      key: String(m.key || 'sedan').slice(0, 40),
      kind: String(m.kind || 'car').slice(0, 20),
      color: Number.isFinite(m.color) ? m.color : null,
      look,
      p: validVec(m.p, 3) ? m.p.map(Number) : [0, 0, 0],
      r: validVec(m.r, 3) ? m.r.map(Number) : [0, 0, 0],
      driver: p.id,
    };
    this.vehicles.set(id, v);
    this.broadcast({ t: 'veh', ...this.vehicleInfo(v) }, p);
  }

  onClaim(p, m) {
    const v = this.vehicles.get(m.id);
    if (!v || !p.st) {
      return;
    }
    const driver = v.driver !== null ? this.players[v.driver] : null;
    const occupied = driver && driver.st && driver.st.seat !== SEAT_NONE && driver.st.veh === v.id;
    const near = Math.hypot(v.p[0] - p.st.x, v.p[2] - p.st.z) <= 10;
    if (occupied || !near || v.owner === p.id) {
      this.send(p, { t: 'claim', id: v.id, ok: false });
      return;
    }
    // ownership moves; the vehicle keeps its net id (the old owner's slot bits are just a name)
    v.owner = p.id;
    v.driver = null;
    this.broadcast({ t: 'vown', id: v.id, owner: p.id, p: v.p, r: v.r });
  }

  // lag-compensated position of player o at server time t
  posAt(o, t, out) {
    const h = o.hist;
    if (!h.length) {
      out.x = o.st.x;
      out.y = o.st.y;
      out.z = o.st.z;
      return out;
    }
    if (t >= h[h.length - 1].t) {
      const a = h[h.length - 1];
      out.x = a.x;
      out.y = a.y;
      out.z = a.z;
      return out;
    }
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1];
      const b = h[i];
      if (t >= a.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        out.x = a.x + (b.x - a.x) * k;
        out.y = a.y + (b.y - a.y) * k;
        out.z = a.z + (b.z - a.z) * k;
        return out;
      }
    }
    out.x = h[0].x;
    out.y = h[0].y;
    out.z = h[0].z;
    return out;
  }

  // the time the shooter was looking at when it fired: its own send time minus its interpolation delay
  viewTime(p, clientTime, now, ip, vt) {
    // best: the client says which server time it was rendering when it fired
    if (Number.isFinite(vt) && vt <= now && vt >= now - 1000) {
      return vt;
    }
    if (Number.isFinite(ip)) {
      p.interpDelay = Math.max(30, Math.min(400, ip));
    }
    let t = Number.isFinite(clientTime) && p.offset !== null ? clientTime + p.offset : now;
    if (t > now || t < now - 1000) {
      t = now;
    }
    return t - p.interpDelay;
  }

  onShot(p, m, now) {
    if (!p.st || p.dead || !validVec(m.o, 3) || !validVec(m.d, 3)) {
      return;
    }
    const wi = WEAPONS.findIndex((w) => w.key === m.w);
    const W = WEAPONS[wi];
    if (!W || W.melee || W.pellets === 0) {
      return;
    }
    // fire rate: never faster than the weapon allows (20 % slack for network jitter)
    p.shotTimes.push(now);
    while (p.shotTimes.length && p.shotTimes[0] < now - 1000) {
      p.shotTimes.shift();
    }
    if (p.shotTimes.length > Math.ceil(1.2 / W.rate) + 1) {
      return;
    }
    const [ox, oy, oz] = m.o.map(Number);
    let [dx, dy, dz] = m.d.map(Number);
    const dl = Math.hypot(dx, dy, dz);
    if (dl < 0.5) {
      return;
    }
    dx /= dl;
    dy /= dl;
    dz /= dl;
    // the muzzle must be at the shooter (a car seat is further from the reported origin)
    const reach = p.st.seat !== SEAT_NONE ? 6 : 3.5;
    if (Math.hypot(ox - p.st.x, oz - p.st.z) > reach || Math.abs(oy - p.st.y - 1.2) > reach) {
      return;
    }
    this.stats.shots++;
    const maxLen = Math.min(W.range, Number.isFinite(m.wd) && m.wd > 0 ? m.wd + 0.5 : W.range);
    const tv = this.viewTime(p, m.ct, now, m.ip, m.vt);
    const pos = { x: 0, y: 0, z: 0 };
    let best = null;
    for (const o of this.players) {
      if (!o || o === p || !o.st || o.dead) {
        continue;
      }
      this.posAt(o, tv, pos);
      // capsule: feet + 0.15 .. feet + 1.75, radius 0.42 (a little more in a car: the whole cabin)
      const r = o.st.seat !== SEAT_NONE ? 0.9 : 0.42;
      const hit = rayCapsule(
        ox,
        oy,
        oz,
        dx,
        dy,
        dz,
        pos.x,
        pos.y + 0.15,
        pos.z,
        pos.y + 1.75,
        maxLen,
        r + (SPREAD[W.key] || 0) * 20,
      );
      if (hit && (!best || hit.t < best.t)) {
        best = { o, t: hit.t, y: hit.y, foot: pos.y, miss: hit.miss };
      }
    }
    const fx = {
      t: 'shot',
      id: p.id,
      o: [round2(ox), round2(oy), round2(oz)],
      d: [round3(dx), round3(dy), round3(dz)],
      w: W.key,
      len: round2(best ? best.t : maxLen),
    };
    this.broadcastNear(fx, ox, oz, INTEREST_RADIUS, p);
    if (!best) {
      return;
    }
    let dmg = W.dmg * W.pellets;
    const spread = SPREAD[W.key];
    if (spread) {
      // pellets: the share of the cone that lands on a 0.42 m body at that distance
      const coneR = Math.max(0.01, spread * best.t);
      dmg = W.dmg * W.pellets * Math.min(1, (0.42 / coneR) ** 2);
      if (best.miss > 0.42 + coneR) {
        return;
      }
    } else if (best.miss > (best.o.st.seat !== SEAT_NONE ? 0.9 : 0.42)) {
      return;
    }
    const head = best.y > best.foot + 1.5 && best.o.st.seat === SEAT_NONE;
    if (head) {
      dmg *= 2;
    }
    this.applyHit(p, best.o, Math.round(dmg), W.key, head);
  }

  onMelee(p, m, now) {
    if (!p.st || p.dead) {
      return;
    }
    const W = WEAPONS.find((w) => w.key === m.w && w.melee) || WEAPONS[0];
    if (now - (p.meleeAt || 0) < W.rate * 800) {
      return;
    }
    p.meleeAt = now;
    const tv = this.viewTime(p, m.ct, now, m.ip, m.vt);
    const fx = Math.sin(p.st.heading);
    const fz = Math.cos(p.st.heading);
    const pos = { x: 0, y: 0, z: 0 };
    let best = null;
    let bd = W.range + 0.5;
    for (const o of this.players) {
      if (!o || o === p || !o.st || o.dead || o.st.seat !== SEAT_NONE) {
        continue;
      }
      this.posAt(o, tv, pos);
      const ex = pos.x - p.st.x;
      const ez = pos.z - p.st.z;
      const d = Math.hypot(ex, ez);
      if (d > bd || Math.abs(pos.y - p.st.y) > 1.2) {
        continue;
      }
      if (d > 0.3 && (ex * fx + ez * fz) / d < 0.35) {
        continue;
      }
      bd = d;
      best = o;
    }
    if (best) {
      this.applyHit(p, best, W.dmg, W.key, false);
    }
  }

  applyHit(from, to, dmg, w, head) {
    this.stats.hits++;
    const before = to.health;
    to.health = Math.max(0, to.health - dmg);
    this.send(to, {
      t: 'hit',
      by: from.id,
      dmg,
      w,
      head,
      from: [round2(from.st.x), round2(from.st.y), round2(from.st.z)],
    });
    this.send(from, { t: 'hitok', id: to.id, dmg, head });
    if (before > 0 && to.health <= 0) {
      to.dead = true;
      this.broadcast({ t: 'kill', by: from.id, victim: to.id, w });
    }
  }

  // ---------------------------------------------------------------- world clock and weather
  updateWorld(dt) {
    const W = this.world;
    W.tod = (W.tod + (dt * 24) / (W.dayMinutes * 60)) % 24;
    const now = this.serverTime();
    if (now >= W.weatherUntil) {
      let sum = 0;
      for (const k of WEATHER_KINDS) {
        sum += k.w;
      }
      let r = this.rand() * sum;
      let pick = WEATHER_KINDS[0];
      for (const k of WEATHER_KINDS) {
        r -= k.w;
        if (r <= 0) {
          pick = k;
          break;
        }
      }
      W.weather = pick.kind;
      W.rain = pick.rain;
      W.weatherUntil = now + (6 + this.rand() * 10) * 60000;
      this.worldSentAt = 0;
    }
    if (now - this.worldSentAt >= 5000) {
      this.worldSentAt = now;
      this.broadcast({ t: 'world', ...this.worldInfo() });
    }
  }

  // admin/test hook: set time or weather for the whole room
  setWorld(o) {
    if (Number.isFinite(o.tod)) {
      this.world.tod = ((o.tod % 24) + 24) % 24;
    }
    if (typeof o.weather === 'string') {
      const k = WEATHER_KINDS.find((x) => x.kind === o.weather);
      if (k) {
        this.world.weather = k.kind;
        this.world.rain = k.rain;
        this.world.weatherUntil = this.serverTime() + 10 * 60000;
      }
    }
    this.worldSentAt = 0;
  }

  // ---------------------------------------------------------------- per-tick snapshots (delta + interest)
  snapshot() {
    this.tick++;
    const now = this.serverTime();
    const w = this.w;
    const gone = [];
    const list = [];
    for (const r of this.players) {
      if (!r) {
        continue;
      }
      list.length = 0;
      gone.length = 0;
      const rx = r.st ? r.st.x : 0;
      const rz = r.st ? r.st.z : 0;
      for (const o of this.players) {
        if (!o || o === r || !o.st) {
          continue;
        }
        const d = r.st ? Math.hypot(o.st.x - rx, o.st.z - rz) : 0;
        const had = r.sent.has(o.id);
        if (d <= INTEREST_RADIUS || (had && d <= INTEREST_DROP)) {
          list.push(o);
        } else if (had) {
          gone.push(o.id);
          r.sent.delete(o.id);
        }
      }
      // count first (the header carries it), then write
      let n = 0;
      const masks = this._masks || (this._masks = new Array(MAX_PLAYERS).fill(0));
      for (const o of list) {
        const m = deltaMask(r.sent.get(o.id), o);
        masks[o.id] = m;
        if (m) {
          n++;
        }
      }
      writeSnapshotHeader(w, this.tick, now, r.lastSeq < 0 ? 0 : r.lastSeq, n);
      for (const o of list) {
        const m = masks[o.id];
        if (!m) {
          continue;
        }
        writeEntity(w, o.id, m, o.st, o.sampleTime - now);
        r.sent.set(o.id, remember(r.sent.get(o.id) || {}, o));
      }
      writeRemovals(w, gone);
      this.sendBinary(r, w.bytes());
    }
  }
}

function deltaMask(s, o) {
  const e = o.st;
  if (!s) {
    return M_POS | M_ROT | M_ANIM | M_STAT | M_VEH | M_ENTER;
  }
  let m = 0;
  if (s.sampleSeq !== o.sampleSeq) {
    m |= M_POS;
  }
  if (s.qh !== e.qh) {
    m |= M_ROT;
  }
  if (s.flags !== e.flags || s.qAnim !== e.qAnim) {
    m |= M_ANIM;
  }
  if (
    s.health !== e.health ||
    s.armor !== e.armor ||
    s.wanted !== e.wanted ||
    s.weapon !== e.weapon
  ) {
    m |= M_STAT;
  }
  if (
    s.veh !== e.veh ||
    s.seat !== e.seat ||
    s.qPitch !== e.qPitch ||
    s.qRoll !== e.qRoll ||
    s.qSteer !== e.qSteer ||
    s.vflags !== e.vflags
  ) {
    m |= M_VEH;
  }
  return m;
}

function remember(s, o) {
  const e = o.st;
  s.sampleSeq = o.sampleSeq;
  s.qh = e.qh;
  s.flags = e.flags;
  s.qAnim = e.qAnim;
  s.health = e.health;
  s.armor = e.armor;
  s.wanted = e.wanted;
  s.weapon = e.weapon;
  s.veh = e.veh;
  s.seat = e.seat;
  s.qPitch = e.qPitch;
  s.qRoll = e.qRoll;
  s.qSteer = e.qSteer;
  s.vflags = e.vflags;
  return s;
}

const STATE_KEYS = [
  'seq',
  'time',
  'flags',
  'qx',
  'qy',
  'qz',
  'x',
  'y',
  'z',
  'qvx',
  'qvy',
  'qvz',
  'vx',
  'vy',
  'vz',
  'qh',
  'heading',
  'qAnim',
  'animSpeed',
  'health',
  'armor',
  'wanted',
  'weapon',
  'veh',
  'seat',
  'qPitch',
  'qRoll',
  'qSteer',
  'vflags',
  'pitch',
  'roll',
  'steer',
];
function copyState(dst, src) {
  for (const k of STATE_KEYS) {
    dst[k] = src[k];
  }
  return dst;
}

function sanitizeBody(b) {
  const fat = Number(b?.fat);
  const muscle = Number(b?.muscle);
  return {
    fat: Number.isFinite(fat) ? Math.min(1, Math.max(0, fat)) : 0.5,
    muscle: Number.isFinite(muscle) ? Math.min(1, Math.max(0, muscle)) : 0.8,
  };
}

function validVec(a, n) {
  return (
    Array.isArray(a) &&
    a.length === n &&
    a.every((x) => Number.isFinite(Number(x)) && Math.abs(Number(x)) < 1e6)
  );
}

function round2(v) {
  return Math.round(v * 100) / 100;
}
function round3(v) {
  return Math.round(v * 1000) / 1000;
}

// ray (origin o, unit dir d, length L) against a vertical capsule (x, z, y0..y1, radius r).
// Returns { t, y, miss } for the closest approach when it is inside r + extra, else null.
function rayCapsule(ox, oy, oz, dx, dy, dz, cx, y0, cz, y1, L, rr) {
  // closest point between the ray segment and the capsule axis segment
  const ux = dx * L;
  const uy = dy * L;
  const uz = dz * L;
  const vx = 0;
  const vy = y1 - y0;
  const vz = 0;
  const wx = ox - cx;
  const wy = oy - y0;
  const wz = oz - cz;
  const a = ux * ux + uy * uy + uz * uz;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  let s = den > 1e-9 ? (b * e - c * d) / den : 0;
  s = Math.max(0, Math.min(1, s));
  let t = (b * s + e) / c;
  if (t < 0 || t > 1) {
    t = Math.max(0, Math.min(1, t));
    s = Math.max(0, Math.min(1, (b * t - d) / a));
  }
  const px = ox + ux * s;
  const py = oy + uy * s;
  const pz = oz + uz * s;
  const qy = y0 + vy * t;
  const miss = Math.hypot(px - cx, py - qy, pz - cz);
  if (miss > rr) {
    return null;
  }
  return { t: s * L, y: py, miss };
}

export { rayCapsule };
