# Character track report (Nico and the wardrobe)

Status at the 6:30 PM stop. The track was cut from "no deadline" to about one hour of remaining work, and no subagent slots were free, so this is a first slice, not the full brief.

## What exists
- **Pipeline** (`src/player/pipeline/`, Blender 5.2 headless + MPFB2 in a private `BLENDER_USER_RESOURCES`):
  - `nico_design.py`: Nico's design (macros, 60 face/body target weights, body-change extremes).
  - `nico_build.py`: body from the CC0 base mesh, 1.80 m, Mixamo-named rig plus `EyeL`, `EyeR`, `Jaw`, `Left/RightForeArmRoll`; 34 facial action-unit morphs and `fat` / `thin` / `muscle`; LOD0 (one Catmull-Clark level, 107k tris) to LOD3 (2.4k tris); own eye geometry; lashes, teeth, tongue; head re-laid out in its own 4K UV space. Writes `nico.glb`, `nico_meta.json`.
  - `nico_textures.py` + `texlib.py`: 4K head and body albedo / normal / masks painted in 3D-aware UV space (brows with the scar, stubble, scalp fade, pores, lip lines, moles, body hair, sweat / sunburn / tan-line masks), iris and sclera, micro-normal and droplet tiles, far-LOD atlas.
  - `garments.py`, `wardrobe_textures.py`: camp shirt (collar, placket band, five buttons, hems), shorts, sneakers as skinned shells with body-change morphs and body cover masks; four tropical prints painted in code (2K, 0.6 m repeat).
- **Runtime** (`src/player/nico/`, `src/player/wardrobe/outfit.js`, `src/player/nico.v2.js`, `src/player/viewer.html`):
  - Skin shader (wrap subsurface, back-scatter on thin parts, pore + micro normal, wetness and sweat beads, sunburn, tan), eye shader (refractive cornea, parallax iris, socket shadow, pupil), shell hair, cloth shader (print, weave, folds, wind flutter, wet darkening, stripes / gingham / camo / denim patterns).
  - `face.js`: blinking, eye tracking with saccades, 12 expressions, text-driven lip movement (`face.say(text)`), jaw bone.
  - `ik.js`: `character.reachTo(point, { hand, duration, hold })` and `character.holdItem(obj, { grip, radius })`.
  - `game.wardrobe`: `list(slot)`, `wear(id)`, `remove(slot)`, `current()`, `describe()`, `disguise()`, `saveOutfit(name)`, `loadOutfit(name)`, `outfits()`, `give(id)`, `owns(id)`, `openUI({ store, slot, onBuy })`, `closeUI()`. Emits `'outfit:changed'` `{ slot, id, description, disguise }`. 33 catalog pieces over 5 slots (top, bottom, shoes, watch, chain); they are colorways of three cuts.
  - `game.player.body.fat` / `.muscle` (0..1) drive the capped body morphs on skin and garments.
  - Nico replaces the v1 player inside `createCharacter(game, { variant: 'player' })`; any load failure falls back to the v1 model. `{ legacy: true }` forces the old one. Ped creation is untouched.

## Anim state
Unchanged from v1 (`characterModel.js` `update(dt, anim)`): `speed, grounded, jumping, sprint, driving, punch, dead, deadStyle, idleStyle (phone, talk, film, cower, lie, sitGround, sitBench, lean, dance, kneel, volley, swim), call, wave, argue, leash, hit, throw, handsUp, guard, getUp, lookAt, swimming, wading`. New, read by the Nico layer: `speaking`, `underwater`.

## Not done (from the brief)
New animation library (still the v1 Mixamo-derived clips), foot IK, turn-in-place, vault, ladder, enter/exit and driving poses, swim strokes, eat / drink / smoke clips, combat poses; hair cards (shells only); tattoos (shader slot exists, no art); hats, sunglasses, masks, bags, jackets, pants, tees; real per-cut uniforms (only recolored shirts with a `disguise` tag); brands from `src/design`; garment LODs; wardrobe UI as a 3D scene (a DOM panel exists); NPC use of the new system; contact sheets and reference side-by-sides.

## Needs from the lead
- Nothing in `main.js` is required. The player is still hidden while driving (v1 behavior).
- Events to list: `'outfit:changed'`.

## Verified at the stop (evidence in `docs/v2/shots/character/`)
- Viewer: `nico_full_front.png`, `nico_torso.png`, `nico_full_back.png`, `nico_face.png`, `nico_face_smile.png`, `nico_feet.png`, `nico_walk_sunset.png`; v1 baseline `before/v1_sheet.png`.
- Full game (`game_nico.png`): boots with no failed V2 modules, Nico is the player, `game.wardrobe.describe()` returns "male, teal tropical shirt, khaki shorts, white sneakers", `wear()` works. Scripted checks: drove a car 5 m and got out (character visible again); swimming state reached in deep water with skin wetness at 1. The scripted on-foot walk only moved 0.16 m in 3 s (same key events drove the car fine), so walking in the full game is NOT confirmed by measurement; the walk cycle itself is confirmed in the viewer.

## Known flaws seen in the shots
- Shirt: fits like a snug tee; the neckline is a stepped notch and the collar reads as a rim, not a real fold-over collar; hem is uneven at the front; no pocket or stitching detail.
- Sneakers read as socks (toe shapes show, no sole, laces or brand marks).
- Hair: the shell crop has a hard, jagged front hairline; no cards.
- Eyes were too bright in the last close-up; a darker iris/sclera and stronger socket shadow went in afterward and were not re-shot.
- Watch dial, `reachTo` / `holdItem`, body-change morphs, wetness beads, far LODs and lip movement run without errors but were not inspected.
- Sit, eat and drink have no new clips (v1 `sitBench` only).
