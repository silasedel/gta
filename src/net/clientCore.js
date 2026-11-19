// Southline multiplayer client core (MULTIPLAYER track): connection, optional link simulation, clock sync,
// state upload, delta snapshot decoding, jitter-buffered interpolation of remote players, and the history
// used for reconciliation. No DOM and no three.js, so the headless test bots run this exact code in Node.
import {
  PROTOCOL_VERSION,
  TICK_HZ,
  SEAT_NONE,
  MSG_SNAPSHOT,
  MSG_CORRECT,
  M_POS,
  M_ROT,
  M_ANIM,
  M_STAT,
  M_VEH,
  Writer,
  encodeState,
  decodeSnapshot,
  decodeCorrect,
} from './protocol.js';

const BUF = 48;
const EXTRAP_MS = 300;
const BASE_DELAY = 100;

// Simulated link: latency, jitter and loss. WebSockets ride on TCP, so a lost packet is not gone: it is
// retransmitted after about one RTO, and everything behind it waits (head-of-line blocking). That is what
// we model, in order, per direction.
export function createLink({ lag = 0, jitter = 0, loss = 0 } = {}) {
  const on = lag > 0 || jitter > 0 || loss > 0;
  let lastAt = 0;
  return {
    on,
    delay(fn) {
      if (!on) {
        fn();
        return;
      }
      let d = lag + (Math.random() * 2 - 1) * jitter;
      if (Math.random() < loss) {
        d += Math.max(200, lag * 2 + 60);
      }
      const now = performance.now();
      const at = Math.max(now + Math.max(0, d), lastAt);
      lastAt = at;
      setTimeout(fn, at - now);
    },
  };
}

export class NetClient {
  constructor(opts = {}) {
    this.url = opts.url;
    this.link = createLink(opts.link || {});
    this.handlers = {};
    this.id = -1;
    this.ws = null;
    this.connected = false;
    this.w = new Writer(128);
    this.seq = 0;
    this.hist = new Array(256); // seq & 255 -> { seq, x, y, z }
    this.remotes = new Map();
    this.offset = null; // server time - local time
    this.jitter = 0;
    this.interpDelay = BASE_DELAY;
    this.renderT = 0;
    this.ack = 0;
    this.rtt = 0;
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.lastSnapAt = 0;
    this.head = {};
  }

  on(t, fn) {
    (this.handlers[t] ||= []).push(fn);
  }

  emit(t, m) {
    for (const f of this.handlers[t] || []) {
      try {
        f(m);
      } catch (e) {
        console.error('[net]', t, e);
      }
    }
  }

  connect(hello) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const fail = setTimeout(() => reject(new Error('connect timeout')), 8000);
      ws.onopen = () => {
        this.sendJSON({ t: 'hello', v: PROTOCOL_VERSION, ...hello });
      };
      ws.onerror = () => {
        clearTimeout(fail);
        reject(new Error('connection failed'));
      };
      ws.onclose = () => {
        this.connected = false;
        this.emit('close', {});
      };
      ws.onmessage = (ev) => {
        const data = ev.data;
        this.link.delay(() => this.receive(data));
      };
      this.on('welcome', (m) => {
        clearTimeout(fail);
        this.id = m.id;
        this.connected = true;
        resolve(m);
      });
      this.on('error', (m) => {
        clearTimeout(fail);
        reject(new Error(m.code));
      });
      this.on('leave', (m) => this.remotes.delete(m.id));
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch (e) {
      // already closed
    }
  }

  rawSend(data) {
    if (!this.ws || this.ws.readyState !== 1) {
      return;
    }
    this.bytesOut += typeof data === 'string' ? data.length : data.byteLength;
    this.link.delay(() => {
      if (this.ws.readyState === 1) {
        this.ws.send(data);
      }
    });
  }

  sendJSON(m) {
    this.rawSend(JSON.stringify(m));
  }

  // s: see encodeState in protocol.js (seq and time are filled in here)
  sendState(s) {
    this.seq = (this.seq + 1) & 0xffff;
    s.seq = this.seq;
    s.time = performance.now() >>> 0;
    encodeState(this.w, s);
    const h = this.hist[this.seq & 255] || (this.hist[this.seq & 255] = {});
    h.seq = this.seq;
    h.x = s.x;
    h.y = s.y;
    h.z = s.z;
    this.rawSend(this.w.bytes());
  }

  receive(data) {
    if (typeof data === 'string') {
      this.bytesIn += data.length;
      let m;
      try {
        m = JSON.parse(data);
      } catch (e) {
        return;
      }
      this.emit(m.t, m);
      return;
    }
    this.bytesIn += data.byteLength;
    const u8 = new Uint8Array(data);
    if (u8[0] === MSG_SNAPSHOT) {
      this.onSnapshot(u8);
    } else if (u8[0] === MSG_CORRECT) {
      const c = decodeCorrect(u8);
      const h = c && this.hist[c.seq & 255];
      if (c) {
        // reconciliation: how far the server's accepted position is from what we predicted at that seq
        c.dx = h && h.seq === c.seq ? c.x - h.x : 0;
        c.dy = h && h.seq === c.seq ? c.y - h.y : 0;
        c.dz = h && h.seq === c.seq ? c.z - h.z : 0;
        this.emit('correct', c);
      }
    }
  }

  onSnapshot(u8) {
    const now = performance.now();
    const head = this.head;
    decodeSnapshot(
      u8,
      head,
      (id, mask, e, t) => {
        let r = this.remotes.get(id);
        if (!r) {
          r = {
            id,
            buf: [],
            flags: 0,
            animSpeed: 0,
            heading: 0,
            health: 100,
            armor: 0,
            wanted: 0,
            weapon: 0,
            veh: 0,
            seat: SEAT_NONE,
            pitch: 0,
            roll: 0,
            steer: 0,
            vflags: 0,
          };
          this.remotes.set(id, r);
        }
        if (mask & M_ROT) {
          r.heading = e.heading;
        }
        if (mask & M_POS) {
          let s = r.buf.length >= BUF ? r.buf.shift() : {};
          if (r.buf.length && t <= r.buf[r.buf.length - 1].t) {
            r.buf.length = 0;
          }
          s.t = t;
          s.x = e.x;
          s.y = e.y;
          s.z = e.z;
          s.vx = e.vx;
          s.vy = e.vy;
          s.vz = e.vz;
          s.h = r.heading;
          r.buf.push(s);
        } else if (mask & M_ROT && r.buf.length) {
          r.buf[r.buf.length - 1].h = r.heading;
        }
        if (mask & M_ANIM) {
          r.flags = e.flags;
          r.animSpeed = e.animSpeed;
        }
        if (mask & M_STAT) {
          r.health = e.health;
          r.armor = e.armor;
          r.wanted = e.wanted;
          r.weapon = e.weapon;
        }
        if (mask & M_VEH) {
          r.veh = e.veh;
          r.seat = e.seat;
          if (e.seat !== SEAT_NONE) {
            r.pitch = e.pitch;
            r.roll = e.roll;
            r.steer = e.steer;
            r.vflags = e.vflags;
          }
        }
      },
      (id) => this.remotes.delete(id),
    );
    this.ack = head.ack;
    // clock: the least-delayed snapshot gives the offset; jitter is the spread around it
    const o = head.serverTime - now;
    if (this.offset === null) {
      this.offset = o;
      this.renderT = now + o - this.interpDelay;
    } else if (o > this.offset) {
      this.offset = o;
    } else {
      this.offset += (o - this.offset) * 0.01;
    }
    const late = this.offset - o;
    this.jitter += (late - this.jitter) * 0.05;
    const want = Math.min(350, Math.max(BASE_DELAY, (1000 / TICK_HZ) * 1.5 + this.jitter * 2.5));
    this.interpDelay += (want - this.interpDelay) * 0.02;
    this.lastSnapAt = now;
    this.emit('snapshot', head);
  }

  // Advance the render clock by real dt, gently steered (at most 6 % faster or slower) toward
  // server-now minus the interpolation delay, so remote motion never jumps.
  advance(dtMs) {
    if (this.offset === null) {
      return this.renderT;
    }
    const target = performance.now() + this.offset - this.interpDelay;
    const err = target - this.renderT;
    if (Math.abs(err) > 600) {
      this.renderT = target;
    } else {
      this.renderT += dtMs * (1 + Math.max(-0.06, Math.min(0.06, err / 400)));
    }
    return this.renderT;
  }

  // What the renderer draws: the interpolated pose plus a visual error offset that absorbs any jump
  // (late data after a stall, a correction) and bleeds it off over ~150 ms instead of snapping.
  render(r, t, out) {
    if (!this.sample(r, t, out)) {
      return false;
    }
    const dt = r.lastT === undefined ? 0 : Math.max(0, Math.min(0.1, (t - r.lastT) / 1000));
    r.lastT = t;
    if (r.lx === undefined) {
      r.ex = 0;
      r.ey = 0;
      r.ez = 0;
    } else {
      const px = r.lx + out.vx * dt;
      const pz = r.lz + out.vz * dt;
      const jx = px - (out.x + r.ex);
      const jz = pz - (out.z + r.ez);
      const jy = r.ly - (out.y + r.ey);
      if (Math.hypot(jx, jz) > 0.04) {
        r.ex += jx;
        r.ez += jz;
      }
      if (Math.abs(jy) > 0.3) {
        r.ey += jy;
      }
      if (Math.hypot(r.ex, r.ez) > 12) {
        r.ex = 0;
        r.ez = 0;
        r.ey = 0;
      }
      const k = Math.exp(-dt * 7);
      r.ex *= k;
      r.ey *= k;
      r.ez *= k;
    }
    out.x += r.ex;
    out.y += r.ey;
    out.z += r.ez;
    r.lx = out.x;
    r.ly = out.y;
    r.lz = out.z;
    return true;
  }

  // Interpolated pose of a remote player at render time t (cubic Hermite with the sent velocities;
  // short damped extrapolation when the buffer runs dry). out: { x, y, z, vx, vz, h }.
  sample(r, t, out) {
    const b = r.buf;
    if (!b.length) {
      return false;
    }
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) {
      i--;
    }
    const last = b[b.length - 1];
    if (t >= last.t || b.length === 1) {
      const dt = Math.min(Math.max(0, t - last.t), EXTRAP_MS) / 1000;
      const k = dt * (1 - (dt / ((2 * EXTRAP_MS) / 1000)) * 0.5);
      out.x = last.x + last.vx * k;
      out.y = last.y + last.vy * k;
      out.z = last.z + last.vz * k;
      out.vx = last.vx;
      out.vz = last.vz;
      out.h = last.h;
      out.extrap = dt;
      return true;
    }
    const a = i > 0 ? b[i - 1] : b[0];
    const c = b[i];
    if (t <= a.t) {
      out.x = a.x;
      out.y = a.y;
      out.z = a.z;
      out.vx = a.vx;
      out.vz = a.vz;
      out.h = a.h;
      out.extrap = 0;
      return true;
    }
    const T = (c.t - a.t) / 1000;
    const s = (t - a.t) / (c.t - a.t);
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    out.x = h00 * a.x + h10 * T * a.vx + h01 * c.x + h11 * T * c.vx;
    out.y = h00 * a.y + h10 * T * a.vy + h01 * c.y + h11 * T * c.vy;
    out.z = h00 * a.z + h10 * T * a.vz + h01 * c.z + h11 * T * c.vz;
    out.vx = a.vx + (c.vx - a.vx) * s;
    out.vz = a.vz + (c.vz - a.vz) * s;
    let dh = c.h - a.h;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    out.h = a.h + dh * s;
    out.extrap = 0;
    return true;
  }
}
