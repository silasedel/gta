# Multiplayer (v2.1): report

## What exists
- `server/server.js`, `server/room.js`: Node + `ws` server, 30 Hz tick, rooms of up to 16 (room code from the URL). `npm run server` (PORT, default 5310). `GET /stats` shows rooms, bytes and tick cost.
- `src/net/protocol.js` (shared by the server and the client): binary quantized state (33 bytes on foot, 39 in a car), per-client delta snapshots (only changed field groups), 400 m interest radius (drops at 430 m), corrections.
- `src/net/clientCore.js`: connection, link simulator (latency, jitter, loss modeled as a TCP retransmit with head-of-line blocking, the way WebSockets behave), clock sync, adaptive jitter buffer (at least 100 ms), Hermite interpolation with short extrapolation, visual error smoothing (absorbs late data in about 150 ms instead of snapping), reconciliation history.
- `src/net/mp.v2.js` (entry) and `src/net/session.js` (loaded only with `?mp=`). The session:
  - uploads the local player on foot or driving;
  - draws remote players with `createCharacter` (the same Nico system as `game.playerCharacter`), with their wardrobe outfit, name tags, a health bar and wanted stars;
  - draws remote cars with the vehicles track's `buildCar` / `buildExternalCar`, with a kinematic collider, rolling wheels, steering and lights;
  - sends shots and punches to the server;
  - applies hits;
  - uses the server's time of day and weather.
- Server rules:
  - Speed and teleport checks against the last accepted position. A failed check sends a correction, which the client applies as an offset to its body.
  - Declared teleports are allowed once every 2.5 s. The client wraps `game.teleport` and declares any jump over 25 m and any respawn.
  - Vehicles are owner-authoritative: only the registered owner may report driving a vehicle. The server also has code to claim parked cars, but no client uses it yet.
  - PvP shots are lag compensated with the shooter's render time: ray against a capsule, pellet share for shotguns, headshot ×2, and a fire-rate cap.
  - Chat with a rate limit (server only; there is no chat UI).
- Offline cost: none. Without `?mp=`, `mp.v2.js` returns before importing anything.

## Measured (`node tools/v2/mp-test.mjs`: 3 clients, about 20 s per pass; results in `docs/v2/shots/multiplayer/mp-test.json`)
| | clean link | 100 ms lag, 30 ms jitter, 2 % loss |
|---|---|---|
| Final convergence (max) | 0.008 m | 0.008 m |
| Render error vs truth p50 / p95 / max | 0.006 / 0.014 / 0.36 m | 0.029 / 0.365 / 2.9 m |
| Per-frame snap (step error) p95 / p99 / max | 0.010 / 0.015 / 0.20 m | 0.037 / 0.119 / 0.44 m |
| Down / up per client | 1.5–1.6 / 0.9–1.0 KB/s | 1.0–1.1 / 0.9–1.0 KB/s |
| Server tick avg / max | 0.08 / 0.47 ms | 0.07 / 0.74 ms |
| Shots → hits (lag compensated) | 11 → 11 | 11 → 11 |
| Speed hack | corrected, position held | same |
| Declared teleport | accepted | accepted |

The machine's 1-minute load was 11–15, so the timing figures are indicative. The large under-lag render error comes from loss stalls on the 25 m/s car. Smoothing keeps per-frame steps under 0.45 m.

## In the game (`node tools/v2/mp-browser.mjs`: real game plus 2 bots, 100/30/2 % link)
- `docs/v2/shots/multiplayer/ingame_0.png` to `ingame_3.png`. In ingame_0, the remote player "Dex" is rendered as the Nico character with a name tag; the "Marisol ★★" tag shows her wanted level.
- The bots' view of the browser player matched the server exactly. The shared time and weather were applied (10.2 h, clear). The page ran at 46 fps under heavy machine load.
- In-page avatar motion: the largest step was 0.52 m in one frame at 46 fps. This is likely a frame hitch under load and was not separated out.

## Not done
- The pause-menu entry and the join/host UI. Joining works only through `?mp=ws://host:port&room=X&name=Y`. These were skipped because of the budget.
- Chat UI.
- Passengers.
- Using parked shared cars: claiming one from a client.
- Boats and aircraft as remote vehicles: they fall back to a sedan model.
- Voice chat.
- **Electron:** `desktop/app/main.cjs` `lockDown()` cancels every request outside `app://game`, so ws:// connections are blocked. The desktop agent needs to add `|| u.startsWith('ws://') || u.startsWith('wss://')` to the allow list. This was not tested in the app.
- The car proxy was not clearly visible in the screenshots, because the test bot's driving line passes through the house at the spawn point.

## Hooks for the lead
- `package.json`: added the `ws` dependency and the `"server"` script, as the brief asked.
- `game.net` exists only while online.
- The module adds no `main.js` hook.
