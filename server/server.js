// Port Solana multiplayer server: `npm run server` (PORT env, default 5310).
// HTTP GET /       -> "ok" (health check for hosts)
// HTTP GET /stats  -> JSON: rooms, players, tick cost, bytes
// WebSocket        -> first message must be JSON { t: 'hello', v, name, room, outfit, body }
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { TICK_HZ, PROTOCOL_VERSION, ROOM_ALPHABET, cleanRoom } from '../src/net/protocol.js';

export function startServer({
  port = Number(process.env.PORT) || 5310,
  host = process.env.HOST || '0.0.0.0',
  log = console.log,
} = {}) {
  const rooms = new Map();
  const tickStats = { n: 0, sumMs: 0, maxMs: 0, last: [] };
  const server = http.createServer((req, res) => {
    if (req.url === '/stats') {
      const out = {
        rooms: [...rooms.values()].map((r) => ({
          code: r.code,
          players: r.players
            .filter(Boolean)
            .map((p) => ({
              id: p.id,
              name: p.name,
              bytesOut: p.bytesOut,
              bytesIn: p.bytesIn,
              states: p.statesIn,
              strikes: p.strikes,
            })),
          stats: r.stats,
          world: r.worldInfo(),
        })),
        tick: {
          hz: TICK_HZ,
          n: tickStats.n,
          avgMs: tickStats.n ? tickStats.sumMs / tickStats.n : 0,
          maxMs: tickStats.maxMs,
        },
      };
      res.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      });
      res.end(JSON.stringify(out));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
  wss.on('connection', (ws) => {
    let room = null;
    let p = null;
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (p) {
          room.onState(p, data);
        }
        return;
      }
      let m;
      try {
        m = JSON.parse(String(data));
      } catch (e) {
        return;
      }
      if (!p) {
        if (m.t !== 'hello' || m.v !== PROTOCOL_VERSION) {
          ws.send(JSON.stringify({ t: 'error', code: 'version' }));
          ws.close();
          return;
        }
        let code = cleanRoom(m.room);
        if (code.length < 4) {
          code = '';
          for (let i = 0; i < 5; i++) {
            code += ROOM_ALPHABET[(Math.random() * ROOM_ALPHABET.length) | 0];
          }
        }
        room = rooms.get(code);
        if (!room) {
          room = new Room(code, { log });
          rooms.set(code, room);
        }
        p = room.join(ws, m);
        if (!p) {
          ws.send(JSON.stringify({ t: 'error', code: 'full' }));
          ws.close();
        }
        return;
      }
      if (m.t === 'admin' && process.env.MP_ADMIN === '1') {
        room.setWorld(m);
        return;
      }
      room.onMessage(p, m);
    });
    ws.on('close', () => {
      if (p) {
        room.leave(p);
        if (!room.count()) {
          rooms.delete(room.code);
        }
      }
    });
    ws.on('error', () => {});
  });
  let last = performance.now();
  const timer = setInterval(() => {
    const t0 = performance.now();
    const dt = (t0 - last) / 1000;
    last = t0;
    for (const r of rooms.values()) {
      r.updateWorld(dt);
      r.snapshot();
    }
    const ms = performance.now() - t0;
    tickStats.n++;
    tickStats.sumMs += ms;
    tickStats.maxMs = Math.max(tickStats.maxMs, ms);
  }, 1000 / TICK_HZ);
  server.listen(port, host, () => log(`[mp] Port Solana server on ${host}:${port}, ${TICK_HZ} Hz`));
  return {
    server,
    rooms,
    close() {
      clearInterval(timer);
      wss.close();
      server.close();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
