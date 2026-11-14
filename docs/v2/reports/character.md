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

## Teal camp shirt (Nov 13, 6:36 to 7:00 PM)
The user asked for a plain teal, real-looking button-up beach shirt as Nico's default top. Done as a rebuilt `camp_shirt` cut (all camp-shirt pieces, floral included, use it) plus a construction shader.

**Geometry** (`src/player/pipeline/garments.py`, rebuilt `public/assets/characters/wardrobe/garments.glb`):
- Whole torso below the neck down to a straight hem at 0.872 m (the old selection cut the back hem up over the seat). The cloth hangs straight below the waist from the widest girth, sits 9 to 43 mm off the body, 16 Laplacian passes, and the hem skin weights move half of the thigh influence to the hips.
- Neckline and hem rings relaxed along the ring (they were stepped), the V point kept.
- Camp collar built from the neckline ring: stand (up to 17 mm), fold with 5 mm thickness, a fall that lies on the shirt (54 mm at the back, lapels tapering into the V), and a turned outer edge.
- Hem turn-back (3.5 to 17 mm double layer) on the shirt hem and both sleeve hems.
- Chest pocket patch on the wearer's left, 2.6 mm off the front, slightly pointed bottom.
- Five pearl buttons (16-sided, 11 mm) from the V point down; the top button is open.
- Vertex color red now carries a smooth arm parameter (armhole seam, sleeve mask); green = hem/edge attribute; fabric UV is one layout (no stepped sleeve UV seam).

**Shader** (`makeClothMaterial({ construct: true })` in `src/player/nico/materials.js`, `SHIRT` define): placket overlap edge and two stitch rows, buttonholes under the buttons, back yoke, shoulder seam, armhole seam with a felled stitch, side seams, hem and sleeve-hem topstitch, collar edge stitch, pocket mouth hem; drape folds, waist bunching, underarm pull lines, sleeve folds, two faint storage creases, fine crumple; linen-cotton plain weave with slubs (fades with distance); sun fade on shoulder tops; one soft wash-fade patch low on the back; broad dye variation; seams slightly darker; thread tone-on-tone. Matte: roughness 0.9, specular 0.45, teal-tinted sheen 0.4. New `makeButtonMaterial`: four holes, cross-stitched thread, dish, nacre iridescence.

**Wardrobe**: new piece `shirt_camp_teal` ("Teal linen camp shirt", free, signature) is first in `DEFAULT_OUTFIT`; `shirt_tropical_lagoon` and the other prints stay. `nico.v2.js` now adds free pieces to old saves' owned list. Old saves keep the outfit they were wearing. `outfit:changed` unchanged (verified in game: wear floral then teal fired both events).

**Evidence** (`docs/v2/shots/character/`): `teal_front.png`, `teal_back.png`, `teal_collar_34.png`, `teal_pocket_buttons.png`, `teal_walk_viewer.png`, `teal_drive_pose.png`, `teal_sit_pose.png`, `floral_option_front.png`, `teal_ingame_walk.png` (South Beach, 10:30, walking), `teal_ingame_front.png`. The viewer has a new `camAt(pos, target)` helper.

**Still wrong (seen in the shots)**: the chest still shows a small nipple bump and the back still follows the seat a little; the shoulders are a bit boxy; the lapel outer edge is wavy, not a crisp roll; the pocket reads mostly through its stitching (no real thickness); the sit pose (`sitGround`) looked like a squat, not a true sit; no cloth sim, so hem sway is only the existing vertex flutter. Run pose and the hem flutter were not looked at.
**Rest of Nico not done this round**: sneakers still read as socks (toe shapes, no sole or laces), shorts hem is ragged, hair hairline is hard. Skin looked fine at this distance.

## Redo round (user: "looks really bad"; Nov 13, 7:00 to 7:08 PM, 25 extra minutes)
- **Relaxed stance** (`src/player/nico/pose.js`, called from `nico/index.js` after the mixer): world-space corrections that do not depend on bone axes. Shoulders drop, upper arms hang close to the body and a little forward, elbows soften about 16 degrees, finger joints curl toward the palm, feet come in under the hips, the pelvis tilts onto the right leg with the chest countering. Full strength standing; arms keep 45 % while walking or running; off for driving, swimming, special idles, jumps. Seen in `teal_front.png`, `teal_ingame_front.png`.
- **Lean build**: default body is now fat 0.35 / muscle 0.55 (in `nico/index.js` and `nico.v2.js`), which drives the existing thin and muscle morphs on skin and garments.
- **Cloth motion** (`outfit.js` + cloth vertex shader): one damped spring per outfit (k 70, damping 5.5) in model space, driven by the body's acceleration, the air moving past the body (`game.wind` as `{x, z, gust}` or `{dir|angle, speed, gust}`, else a shifting 1.6 to 2.8 m/s breeze), a little lift with speed and a stride bob. It moves the vertices that have flutter weight (hem, sleeve ends, collar fall edges and tips), so lower and looser cloth moves more. The component pointing into the body is removed, so it never pushes cloth inward. When the character runs in place (viewer), the gait speed stands in for the measured velocity. Wind also drives the existing ripple. Frames: `teal_run_a.png`, `teal_run_b.png` (back hem trails), `teal_wind.png` (7 m/s side wind: the shift is small; the wind effect was not tuned).
- **Sneakers**: `SHOE` shader mode with an off-white rubber sole band, foxing line, stitch row and toe scuffing. More smoothing and a lower clearance did NOT remove the toe shapes; the shell follows separate toe tubes in the base mesh and needs a remesh (`teal_feet.png`).
- **Not done**: body rebuild in Blender (proportions, neck and shoulder slope, forearm and calf shape, hand and foot size), ears, hairline, tan lines and forearm hair review, shorts hem (still ragged), a true multi-point verlet hem (this is one spring with per-vertex weights), open placket edge motion, sneaker remesh, laces.

## Pass 3 to 5: ref_42 / ref_47 / ref_48 look (Nov 13, 7:08 to 8:05 PM)
**Default in game (verified at :5200 with a fresh profile and with an old save):** `under: tee_white`, `top: shirt_palm_open`, `bottom: pants_cargo_khaki`, `shoes: sneakers_leather_offwhite`, `watch_diver_steel`, `chain_silver_thin`. `nico.v2.js` migrates older saves once (`save.look = 3`) to this outfit and resets the stored body. New slot `under` (layering under `top`); `describe()` reads "teal palm print shirt over a white tee, khaki cargo pants, off-white sneakers". Plain teal button-up, floral shirts and shorts stay in the catalog.
**Pipeline:** `nico_design.py` (age 0.58, muscle 0.8, thicker neck, sloped shoulders, bigger hands and feet, calves, forearms, squarer jaw, lower brows); `nico_textures.py` (heavy stubble, darker brown hair); `garments.py` (cuts `camp_shirt`, `camp_shirt_open` (+ `_buttons` with UVs), `tee`, `shorts`, `cargo_pants`, `sneakers` with a smooth toe box; thin creased collar and hem folds; neckline and hems relaxed; shirt hangs straight below the waist; cloth capped over the trapezius; shirt kept 11 mm clear of the tee); `palm_print.py` (new: our own palm print + all body cover masks). Rebuilt `nico.glb`, head textures, `garments.glb`, `prints/palm_teal.webp`, `covers/*.png`.
**Runtime:** `wardrobe/clothSim.js` (new, 40 verlet particles on hem, sleeve openings and the open front edges; fixed 120 Hz substeps, capped accumulator; anchors on the skinned rest pose; body collision against the anchor surface and thigh capsules; reach clamped to 1.5 to 5 cm; reads `game.wind.sample/strength/gust`; wet cloth stiffer). Shader modes in `nico/materials.js`: `SHIRT`/`OPENSHIRT`, `CLOTHSIM`, `SHORTS`/`CARGO`, `SHOE`/`LEATHER`; per-height wetness (`uWetLine`) for skin and cloth; soft hairline; button holes from UVs. `nico/pose.js`: relaxed stance (fixed a shrug: the clavicle rotation sign was inverted), feet shoulder width, thicker neck and 6 % larger head via bone scale. Default tan 0.7.
**Evidence:** `docs/v2/compare/nico_vs_ref42.png` (neutral light, front and back), `docs/v2/compare/nico_ingame_vs_ref42.png`, `docs/v2/compare/nico_ref48_ingame.png` (all git-ignored); in game: `p5_front/back/left/right/34/face/walk_0..2/aim_back/aim_side.png`, `p4_*` (walk, wading, wet), `ref42_*` (viewer: run, wind, feet, face).
**Self-score against ref_48 right figure (honest, 1 to 10):** outfit read 7 (right garments and colors, print reads); shirt cut 5 (shoulders still boxy, sleeves a bit short); pants 6 (clean khaki now, cargo pockets drawn not modeled, hem stack weak); shoes 4 (smooth toe box and sole band, no real laces or panels); body 5 (better proportions, still lower definition, no veins); face 4 (stubble and jaw better; eyes glassy, skin less detailed than the ref); hair 5; motion: cloth 6 (sways, clamped, never balloons in shots), locomotion 3 (still the v1 clips); aim stance 2 (one-arm aim from `gameplay/weapons.js`).
**Not done:** authored idle/walk/run/sprint/swim/pistol clips; two-hand pistol stance (lives in `gameplay/weapons.js`, not this track: it calls `aimArm` per arm; it should place the right hand about 0.4 m in front of the chest with bent elbows and put the left hand on the grip); sculpted high-poly detail and baked normal/AO maps for body and clothes; real laces and panels on the shoes; modeled cargo pockets, belt; skin pores at game distance; LOD for the new garments; the white sliver of tee at the right armpit; no commit (CONTRACT5 forbids agents from committing; the lead commits).
