# Desktop track: Port Solana.app (Electron, macOS)

## Where it is and how to open it
- App: `~/Desktop/Port Solana.app`, a copy of `desktop/dist/mac-arm64/Port Solana.app`.
- Installer: `desktop/dist/Port Solana-2.0.0-arm64.dmg` (749 MB; the game assets are about 470 MB of it).
- The app is unsigned. To open it the first time, right-click (or Control-click) the app, choose **Open**, then **Open** again in the dialog. After that it opens with a normal double-click. If macOS still refuses ("damaged" or "can't be opened"), run `xattr -dr com.apple.quarantine "/Users/silasedel/Desktop/Port Solana.app"` once. A locally built copy normally has no quarantine flag.
- It starts in native macOS fullscreen. **Cmd+Ctrl+F** or **F11** toggles fullscreen. The app remembers windowed or fullscreen between launches.
- Menu: Port Solana → Open Log Folder; View → Reload Game (Cmd+Shift+R) and Developer Tools.

## Build commands
- `npm run desktop:build` runs a fresh vite build into `desktop/dist/web`. electron-builder then packs it into an `.app` and `.dmg` in `desktop/dist/`, and the `.app` is copied to `~/Desktop` (the Desktop folder exists on this machine).
  - Flags, passed after `--`: `--skip-web` reuses the last web build, `--no-dmg` is faster, `--no-copy` skips the Desktop copy.
- `npm run desktop:dev` runs a fresh vite build, then runs Electron unpackaged on it. Extra app flags go after `--`.
- Pinned versions: `electron` 45.2.1 (released Oct 31, 2026, Chrome 156) and `electron-builder` 26.18.1. Both are exact pins in the root `devDependencies`.

## Files (all in `desktop/`)
| File | What it does |
|---|---|
| `app/main.cjs` | Main process: GPU and perf switches, window, fullscreen, menu, lockdown, memory sampler, storage flush |
| `app/protocol.cjs` | `app://game/` custom protocol. It serves the build from local files with correct MIME types, Range support and path confinement |
| `app/crashGuard.cjs` | Reloads on a renderer crash, GPU crash or hang, shows a notice, writes `crash.log`, and stops looping after repeated crashes |
| `app/log.cjs` | Writes `crash.log` and `app.log` into userData and rolls them over at 2 MB |
| `app/preload.cjs` | Exposes `window.portSolanaDesktop = { isDesktop, platform, electron, chrome }` and requests persistent storage |
| `electron-builder.config.cjs` | Unsigned mac `dir` and `dmg` targets, plus a Windows NSIS target (never built). The web build ships as `Resources/web` |
| `build/icon.png` | Original app icon (sunset, sea and palm), rendered from SVG |
| `scripts/build.mjs`, `scripts/dev.mjs` | The two npm commands |
| `scripts/measure.mjs` | 5-minute app-versus-Chrome fps and memory protocol (see below) |

## Loading
- The production build is served over `app://game/index.html`, a privileged, standard and secure scheme, so the page behaves like https. ES modules, module workers (nav and interior bake), WASM (Rapier) and `fetch('/assets/...')` all work.
- `public/assets` is served from `Resources/web/assets`. Tiles, GLBs and world data load: the game reached `game.ready` with `game.v2.failed = []`, and 12 V2 modules loaded.
- No other web content runs in the process. Popups are denied, navigation away is blocked, and every network request is cancelled except `app://`, data and blob URLs, devtools, and the game's own Google Fonts CSS and font files. `index.html` links Google Fonts; Chromium's cache keeps them for offline use.
  - **Lead:** self-host the two fonts (Barlow Condensed, Inter) so the app needs no network on its first launch.

## Performance settings
- Chromium switches: `force_high_performance_gpu`, `ignore-gpu-blocklist`, `enable-gpu-rasterization`, `enable-zero-copy`, `enable-unsafe-webgpu`, `disable-background-timer-throttling`, `disable-renderer-backgrounding`, `disable-backgrounding-occluded-windows`, `use-angle=metal`, autoplay without a gesture, and `js-flags=--max-old-space-size=8192`.
- webPreferences: `backgroundThrottling: false`, sandbox and contextIsolation on, `zoomFactor` 1 (locked; pinch and Cmd+/- zoom disabled), and a V8 code cache.
- Info.plist: `NSSupportsAutomaticGraphicsSwitching=false` (discrete GPU on dual-GPU Macs) and `NSHighResolutionCapable`.
- Verified in the app:
  - The renderer is `ANGLE Metal Renderer: Apple M3 Max`, and GPU compositing, rasterization and WebGL are enabled.
  - rAF runs at full rate while the window is unfocused (`document.hasFocus()` false at 49.5 fps).
  - Retina devicePixelRatio is 2, page zoom is 1, and the display runs at 120 Hz.
- **Limit:** the JS heap limit is 4192 MB even with `--max-old-space-size=8192`, because V8 pointer compression caps the heap at 4 GB. The app does not raise the heap ceiling over Chrome.

## Window sizing (user report: low resolution and cropped)
- The window opens at the full work area and goes native fullscreen by default. On the 14" or 16" MacBook Pro with the notch, the content is 1512x949 CSS px at 2x, and the canvas CSS size equals the window (1512x949).
  - Screenshot `docs/v2/shots/desktop/app_default_launch.png` is 3024x1898 and fills the screen edge to edge with no bars.
  - `app.log` records `fullscreen on: content 1512x949, display 1512x982 @2x 120Hz`. The missing 33 px is the notch band, which macOS keeps out of fullscreen content.
- There is no `force-device-scale-factor` and no zoom below 1. `useContentSize` is used only for measurement runs (`--ps-size`).
- After every resize and fullscreen transition, the app dispatches an extra `resize` event once the animation settles.
- Measurement runs (`--ps-size` or `--ps-test-profile`) use a separate profile, `~/Library/Application Support/Port Solana Test`. They never touch the player's window state, saves or single-instance lock.
  - Earlier test runs had saved a 1280x752 window into the player's `window.json`, and a second launch would have focused the test window. Both are fixed, and the stale file was removed.
- The drawing buffer is 1814x1138 to 1859x1167, which is the game's own `pixelRatio` 1.2 to 1.23 (`resScale` 0.8, adaptive). It is below 1920x1080 and set in `src` (playtest-fixes), not by the shell. At pixelRatio 1.5 the buffer would be 2268x1423, as it was in Chrome.

## Crash guard
- Renderer gone (`crashed`, `oom` or `killed`): the guard logs the reason, exit code and free system memory, reloads `app://game/index.html` after 0.8 s, and shows a 7-second notice at the top ("The game crashed / ran out of memory and was restarted.").
- GPU process gone (`child-process-gone` of type GPU): logged, reload, notice.
- Hang: on `unresponsive`, a 45-second timer starts. If the page is still hung, the guard calls `forcefullyCrashRenderer()` and reloads ("The game froze and was restarted.").
- Crash loop: 4 crashes within 3 minutes stops the reloads and shows a dialog with Try again, Open log folder and Quit.
- Logs go to `~/Library/Application Support/Port Solana/logs/crash.log` (crashes and hangs) and `app.log` (startup, GPU status, renderer console errors, and per-process memory every 60 s). Local minidumps go to `.../Port Solana/Crashpad/`, and nothing is uploaded.
- **Not verified:** the guard was never triggered on purpose. No crash happened during about 25 minutes of app runs, and `crash.log` is empty.

## Saves
- The default persistent session stores saves under `~/Library/Application Support/Port Solana/` (`IndexedDB/` and `Local Storage/`) for the stable origin `app://game`.
- The app flushes storage to disk on quit and every 2 minutes, and requests persistent (non-evictable) storage.
- Verified: a localStorage value and an IndexedDB value written in one launch were read back unchanged after a quit and relaunch of the packaged app (`desktop-1794627082523`).

## Measurements (5 minutes: 2.5 min idle at the Ocean Drive spawn, then 2.5 min moving with W, sprint and turns, plus teleports to (-2505,555), (-900,120) and (1800,-600))
Same web build, same CSS size (1512x949) and DPR 2 in both. The machine was shared with other agents. Run `uptime` before trusting any number; both runs had high load.

| | App (native fullscreen, load ~40) | Headless Chrome (load ~15) |
|---|---|---|
| Boot to `game.ready` | 25 s | 44 s |
| Idle avg fps / 1% low / p99 | **32.7 / 17.0 / 46.7 ms** | 26.3 / 7.8 / 66.7 ms |
| Moving avg fps / 1% low / p99 | 28.3 / 0.8 / 56.9 ms (one 34 s stall after a teleport) | 46.1 / 6.0 / 50 ms |
| Frames over 50 ms (idle / move) | 20 / 65 | 426 / 27 |
| Drawing buffer (game pixelRatio) | 1859x1167 (1.23) | 2268x1423 (1.5) |
| JS heap start → end (max) | 1325 → 2357 (2579) MB | 1599 → 2434 (2738) MB |
| Process tree RSS start → end (max) | 5535 → 6351 (6432) MB | 5855 → 7407 (7558) MB |
| Draw calls / triangles at spawn | 560–700 / 3.3–3.6M | 700–990 / 3.3–3.9M |

- Raw data: `docs/v2/reports/desktop-measure-app.json` and `desktop-measure-chrome.json`.
- Screenshots: `docs/v2/shots/desktop/app_spawn.png`, `app_idle_end.png`, `app_end.png` and `chrome_*.png`.
- Reading the results:
  - At idle the app is better than Chrome on every number, even under higher load (1% low 17 vs 7.8).
  - Moving was worse in the app because of a single 34-second stall after the first teleport, at load average 40. Chrome had the same teleport path at load 15. This comparison is not clean.
  - The app uses about 1 GB less RSS.
  - A third app run at low load was cut off after 3 minutes; the window closed cleanly, with no crash or dump. A fullscreen test window covers the user's screen, which is the likely cause.
- 20 s pacing probe in the app (windowed, load ~11): **49.5 fps**, frame times **481 at about 16.7 ms and 451 at about 25 ms**.
  - On the 120 Hz panel, every frame over 16.7 ms snaps to 25 ms. That is a 60/40 judder, and part of why it "feels laggy" at about 50 fps.
  - The game's own spike log shows render at 120 to 256 ms whenever 7 to 8 new shader programs compile while streaming, plus one 1.3 s long task.
- **Not verified:** the 60 fps target. The app is not the bottleneck; frame time is in the game's render pass and its streaming shader compiles.

## For the lead and playtest-fixes (src changes I cannot make)
The numbers and suggestions 1 to 3 below were also sent to playtest-fixes (agent ac3c263de7d0daca3).
1. **Frame pacing:** on displays at 90 Hz or above, cap to an even 60 (skip rAF callbacks so presents land every 16.7 ms), or steer `resScale` to keep work under about 14 ms. An even 60 is smoother than a 40/60 alternation.
2. **Shader precompile:** warm materials for tiles as they load (`renderer.compileAsync`). That removes the 100 to 250 ms hitches. ANGLE Metal supports `KHR_parallel_shader_compile`.
3. **Memory:** the heap grows about 1 GB in 5 minutes against a hard ceiling of about 4.1 GB, so the memory crash will recur in the app too. The crash guard reloads and logs it, but the leak must be fixed in src.
4. **Resolution:** with `window.portSolanaDesktop?.isDesktop`, the game could default to pixelRatio 1.5 or higher in the app once frame time allows.
5. A `[nicoHouse] part "50_plants" failed TypeError: top.clone is not a function` console error shows on every boot (from `app.log`).
6. **Lead:** self-host the Google Fonts; add `desktop/dist/` (already ignored) and nothing else to `.gitignore`.
7. Commit `package.json` and `package-lock.json` (Electron and electron-builder devDependencies; the `desktop:build` and `desktop:dev` scripts).

## Not done
- **WebGPU renderer:** skipped on the lead's instruction. Moving to three's WebGPURenderer would mean rewriting 81 `onBeforeCompile` GLSL patches in 28 files, 17 `ShaderMaterial` files and the EffectComposer post stack in TSL. It is not a desktop-shell change.
- **Windows build:** skipped. The config has an NSIS target, but it was never built or tested.
- **F11 toggle:** wired through `before-input-event`, but CDP-synthesized keys do not pass through that path, so it was not exercised. Cmd+Ctrl+F is a native menu accelerator; fullscreen on launch is verified.
- **Latest src in the app:** the last web build packed into the app is from 19:40. A rebuild at 20:35 failed because `src/render/post.js` line 267 was mid-edit by another agent (syntax error). Run `npm run desktop:build` again once src parses, so the app picks up the newest src.
