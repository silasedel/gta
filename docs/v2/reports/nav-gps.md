# nav-gps handoff (paused Nov 13, about 5:45 PM MST)
Nothing is wired into the game: no `nav.v2.js` exists and `src/ui/gps.js` is the untouched v1 file, so the game is unaffected. Nothing is verified; no screenshots.
## What exists (all in `src/nav/`, every file bundles with esbuild)
- `graph.js`: compact turn-aware graph from `city.roadGraph` (arcs, transitions with turn type, signals/stops, inferred roundabouts, restrictions input `{from, via, to, type}`, snap index, main-component mask).
- `engine.js`: `Router` (ALT A* `route`, reverse `tree` + `fromTree` instant re-route, `evaluate`, `isochrone`), profiles, `computeLandmarks`.
- `maneuvers.js` (turn-by-turn text, US units, lane hints), `route.js` (lane-level line, `assembleRoute`, `progressOn`).
- `traffic.js`, `walk.js`, `boat.js`, `places.js`, `controls.js`, `draw.js`, `workerCore.js` + `worker.js`, `nav.js` (`createNav(game)` = game.nav).
- `tests/loadData.mjs`: Node loader for the real map (`loadWorld()` gives `data`, `G`).
## Ran in Node on the v1 graph (ad hoc scripts, not committed)
- 200 random pairs: 0 failures, ALT cost equals plain A*, avg 0.4 ms; tree result equals A*. South Beach to Downtown uses the MacArthur Causeway. Walk and boat routes return sensible paths.
## Never run
- `nav.js`, `workerCore.js`/`worker.js`, `traffic.js`, `places.js`, `draw.js`. Expect bugs.
## Next, in order
1. Write `src/nav/tests/*.mjs` (200 pairs with one-way/turn legality via `Router.evaluate`, known routes, tree re-route timing, walk, boat).
2. Write `src/nav/nav.v2.js` (`initV2`: `game.nav = createNav(game); await game.nav.init(); game.updaters.push(nav.update)`), then debug `nav.js` in the game.
3. Make `src/ui/gps.js` a facade over `game.nav` (keep `route/distTo/trimFrom/polyLen/available`), keeping the v1 A* as fallback.
4. Build `src/nav/ui.js` (banner, ETA chip, search panel) from `nav.readout()`; take the before/after and banner shots.
5. Known rough spots: walking instructions repeat street names; sailboat finds no route under fixed 10.8 m bridges; big-world timing unmeasured.
## Needs from the lead
- world-osm: `roadGraph.restrictions`, `node.signal`, `edge.ref/destination/exit/turnLanes/roundabout` if available. Events listened for: `crash`, `roadblock`, `roadblockRemoved`, `roadClosed`, `roadOpened`, `drawbridge`.
