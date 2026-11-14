# Combat track: handoff (paused Nov 13, about 17:45 MST)
- **Exists:** `src/gameplay/gunModels.js` (v3: 16 weapons, moving parts, attachments, 10 skins, LOD), `gunPreview.html` (contact sheets),
  `gunfx.js` (decals, chips, particles, tracers, rolling casings, explosions, flames), `weapons.js` (rewritten: muzzle-to-crosshair ballistics,
  recoil patterns, bloom, penetration, ricochet, water, suppressed fire, limb reactions, attachments stats and API, molotov),
  `combat/shared.js` (conventions, materials, player/camera arbitration), `combat/rangeHarness.js`, `rangeMain.js`, `range.html`, `combat/tests/run.mjs`, `tests/shoot_surfaces.mjs`.
- **Works (seen):** weapon contact sheets (factory, kitted, moving parts, melee) in `docs/v2/shots/combat/weapons_*.png`.
  Range test fired all 9 guns at 7 wall materials, floor zones and water: impacts, penetrations (glass, wood, plastic, thin metal by rifles) and a ricochet were counted, no script errors.
- **Not verified:** the new `weapons.js`/`gunfx.js` have NOT been booted in the full game yet (only the range). Impact screenshots were taken partly
  (`range_surfaces_wall.png`) but not reviewed; the run stopped when the page hot-reloaded. Skins sheet not reviewed. Weapon models are detailed procedural models, below the ref_28 close-up bar.
- **Not started:** aim camera (shoulder swap, lock-on, reticles, hit markers), cover system and `game.cover.find`, destructibles and `game.destructibles`, melee module and item drops,
  ragdoll/windshield/fire (`game.fire`), traversal, hitbox audit, bench UI (`game.weapons.customize`), firefight frame times. No `.v2.js` module exists yet.
- **Next:** 1) boot the full game and fix anything in weapons.js; review range impact shots. 2) `combat/aim.v2.js`. 3) `combat/cover.v2.js`. 4) destructibles. 5) melee. 6) traversal.
- **Notes for the lead:** Q no longer cycles weapons (reserved for cover). New events: `hitConfirm`, `bulletImpact`, `penetrate`, `ricochet`, `nearMiss`, `shot:suppressed`, `noise`, `reload`,
  `weaponModsChange`, `combat:disarm`, `playerBlast`. New weapons: crowbar, bottle, molotov. Suppressed shots do not emit `shot`. Audio should read `nearMiss` and `shot:suppressed`;
  police should honor `unit.disarmed`. Maker names used locally (Solana Arms, Caballo, Wasp, Kestrel, Biscayne, Coastline, Breaker, Hacksaw, Longshot, Saltworks, Halcyon, Tern) need registering with design-system.
