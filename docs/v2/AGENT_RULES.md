## Common rules (read CONTRACT5.md and V2_PLAN.md in the repo first)

**Project.** Port Solana V2 is an original GTA-genre open world.
- Stack: Vite, three.js 0.170, Rapier. The map is real-scale Miami.
- Repo: /Users/silasedel/Downloads/Apps_Games/GTA 6/V2, branch `v2`.
- The dev server is already running at http://127.0.0.1:5200. Never start servers on 5200 or 5210.

**Do not touch:**
- `main`
- ports 5173 or 5180
- `../V1`
- the live site
- git. Don't commit and don't push: the lead commits.

**Testing.** Use only our own muted headless Chrome: `tools/v2/browser.mjs` (`withBrowser`).
- Never use the user's browser.
- Never use ports 9222 or 9333.
- Close every browser you open.
- Measure fps only when the machine is lightly loaded.

**Originality.**
- No GTA or Rockstar names, characters or brands.
- No real brand names or logos.
- Real Miami geography is OK.

**Assets.**
- CC0 or CC-BY only.
- Credit every one in CREDITS.md, with its source URL and license.
- No Google Street View.

**Code style.**
- American spelling.
- Open code layout: one statement per line.
- Make atomic edits.
- Stay inside the files you own. If you need something in another file, describe it in your report.
- New systems plug in as `*.v2.js` modules. The lead wires `src/main.js`. If you need a hook there, ask in your report or add a tiny clearly marked one.

**Performance.** The target is the Mac desktop app at a steady 60 fps with no hitches: no frame over 33 ms.
- No per-frame allocation in hot paths.
- Precompile materials.
- Time-slice heavy work to under 4 ms per frame.

**Shared APIs:**
- `game.ready`
- `game.v2.failed`
- `game.teleport(x, y|null, z, heading)`
- `game.player.script`
- `game.cameraOverride`
- `game.wind`
- `game.hud.setKnown`
- `game.city.playerSpawn`
- `game.nicoHouse.anchors`
- `game.worldLayout`

**Reporting.**
- Keep `docs/v2/progress/<track>.json` and `docs/v2/reports/<track>.md` current.
- Verify everything in game with screenshots in `docs/v2/shots/<track>/`.
- Your final message must say:
  - what you saw working in game;
  - what you built but did not check;
  - what is not done;
  - every file you changed.
- Claim nothing you did not see.
