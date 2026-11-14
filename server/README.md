# Port Solana multiplayer server

A small Node server (WebSockets via `ws`, no native dependencies). It holds rooms of up to 16 players at a
30 Hz tick, checks speed and teleports, decides PvP hits, and sets the shared time of day and weather.

## Run locally

```sh
npm install
npm run server            # listens on PORT (default 5310)
```

Join from the game: `http://127.0.0.1:5200/?mp=ws://127.0.0.1:5310&room=BEACH&name=Nico`.
Everyone who uses the same `room` code plays together. `GET /` returns `ok` (health check) and
`GET /stats` returns rooms, players, bandwidth and tick cost.

Test without a network: add `&mpLag=100&mpJitter=30&mpLoss=2` to the URL to simulate a bad link.
Automated checks: `node tools/v2/mp-test.mjs` (3 headless clients) and `node tools/v2/mp-browser.mjs` (the real
game plus 2 bots).

## Host it (you create the account; any of these works)

The server only needs Node 20 or newer, one open port, and `npm run server` as the start command. It reads
`PORT` from the environment, which all three hosts set for you. Use `wss://` in the game URL once the host
gives you HTTPS (all three do), for example `?mp=wss://port-solana-mp.fly.dev&room=BEACH`.

**Fly.io**
1. Install `flyctl` and run `fly auth login`.
2. In the repo: `fly launch --no-deploy` (choose Node; it writes `fly.toml`). Set the internal port to 8080
   and add `[env] PORT = "8080"`.
3. `fly deploy`. Keep one machine always running (`min_machines_running = 1`, `auto_stop_machines = false`) so
   rooms are not dropped.

**Render**
1. New → Web Service → connect the repo.
2. Build command `npm ci --omit=dev`, start command `npm run server`.
3. Pick an always-on instance type (free instances sleep and drop the WebSocket).

**Railway**
1. New Project → Deploy from GitHub repo.
2. Start command `npm run server` (build is automatic). Under Networking, generate a public domain.

The desktop app blocks every request that is not its own files; it needs `ws://` and `wss://` allowed in
`desktop/app/main.cjs` (`lockDown`) before it can join (see `docs/v2/reports/multiplayer.md`).
