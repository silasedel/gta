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

## Pass 6 (Nov 13, 8:00 PM on; hero-artist round, cut short by the usage budget)
- **Body rebuilt** (`nico_design.py`, then `nico_build.py`, body-only `nico_textures.py`, `garments.py`, `palm_print.py` covers): muscle 0.90, weight 0.56, wider shoulders, pecs and lats, torso depth, back of neck and neck circumference, heavier upper arms, forearms and thighs. Head targets unchanged, so the head textures still fit. New `nico.glb`, `nico_meta.json`, `tex/body_*`, `wardrobe/garments.glb` and `covers/*` installed. The old assets are in git and in scratch `bak5/`.
- **Shading** (`nico/materials.js`): skin no longer orange (weaker red wrap and back-scatter, olive desaturation of the pink MakeHuman base, softer tan tint); head pores at 0.6 normal strength and micro normal at 0.30; clearcoat 0.05; eyes clearcoat 0.55 and env 0.18 (the blue sky reflection made them glassy), darker sclera and iris; hair shells rougher with less env (the top of the head read white).
- **Face** (`nico/face.js`): `REST_FACE` base layer (heavier lids, lower brows, set mouth) under expressions and speech.
- **Pants color** (`wardrobe/outfit.js`): `pants_cargo_khaki` 0x94714a with tan sheen (it read pale olive).
- **Evidence:** `docs/v2/compare/nico48_front.png`, `nico48_back.png`, `nico48_34.png` (1920x1080, about 4.6 m third-person distance, Ocean Drive, 13:30, facing the sun like ref_48).
- **Still wrong in those shots:** the head is small and the face generic (no sculpt or bake yet); the shirt print is too cyan and saturated; the pants are baggy and stack into a flared hem; the shoes are small white shells (no sole, laces or panels); the arms hang with the hands forward; walk, run, aim, swim and wet were not reworked or re-shot this pass.

## Pass 7 (Nov 13, evening): new garment pipeline, sculpted head, follow-camera profile
**Pipeline** (`src/player/pipeline/`, run order: `nico_build.py` → `envelope.py` (system Python + scipy) → `garments.py` → `garment_sim.py` → `palm_print.py`):
- `envelope.py` (new): voxelizes the body (5 mm) and writes signed distances to its morphological closing (shirt R 4.5 cm with a 1.5 cm opening, tee 1.2 cm, pants 3 cm). Cloth spans the spine groove, pec cleft, armpit and seat crease, and the nipples disappear.
- `garments.py`: shells are projected onto envelope + ease (`env_fit`), then `drape_rules`:
  - the shirt body falls straight from its widest girth above;
  - sleeves are cylinders sized from the arm's own radius, with the underside hanging;
  - trouser legs are straight below the knee.
  The hem folds are creased. The worn sneaker is now modeled (`sneakers.py`). The script saves `garments.blend`.
- `garment_sim.py` (new): Blender cloth drape in the bind pose.
  - Shirt: woven cotton, pinned on the yoke and collar, body-only collision 16 mm off. Pants: twill, pinned at the waistband.
  - The solved cloth is a single-layer copy. Hem turn-backs, the collar and the pocket patch are rebuilt on the draped surface with a rigid triangle-frame binding.
  - The tee stays a fitted shell.
  - Skin weights and fat/thin/muscle morphs are re-derived from the body.
  - It builds modeled cargo pockets (bellows patch, box pleat, two-layer flap), 5 belt loops and a 34 mm leather belt with a steel frame buckle on the draped pants, then exports `garments.glb`.
- `sneakers.py` (new): parametric low-top fitted to the foot:
  - cupsole with toe spring;
  - lofted upper with a collar opening, round toe box and tongue;
  - five crossing flat laces;
  - panel codes in vertex color.
- `nico_build.py` + `nico_design.SCULPT`: landmark-placed falloff brushes on the identity and every morph (brow ridge, glabella, cheekbones, cheek hollows, jaw angle, jaw line, masseter, chin corners and front). The eyelid rims are protected. Max move 9 mm.
- `palm_print.py`: muted teal-green ground (36, 96, 90), pale sage palms, lighter distress. The repeat is 0.42 m (about 1.5x the density).

**Runtime:**
- `nico/materials.js`:
  - new modeled-sneaker shader (toe cap, heel counter, eyestay, seams and stitching, eyelets, rubber cupsole with groove, woven laces, scuffs);
  - head barber fade (blurred hair mask: dark stubble under and about 2 cm outside the hairline, so no helmet edge);
  - dark brown iris and off-white sclera.
- `nico/face.js`: heavier resting lids.
- `nico/pose.js`: arms at the sides with soft elbows; head scale 1.10.
- `nico/index.js`:
  - LOD0 out to 9 m (the follow camera at 4.5 m used to get the faceted LOD1);
  - LOD0 body triangles fully under the clothes are dropped from the index on every outfit change (`outfit.onCover`);
  - hair 4 cm.
- `wardrobe/outfit.js`: `<cut>_detail` (same material) and `<cut>_belt` (leather and steel vertex-color material) companions; `refreshCover()`; `onCover` hook; palm shirt tint and repeat; pants color. The lead's cloth damping is unchanged.

**Evidence:**
- `docs/v2/compare/nico_profile_follow_before_after.png` (follow camera, top before, bottom after: side, 3/4 rear, front, 3/4 front);
- `docs/v2/compare/nico_studio_head_garments_pass7.png`;
- `docs/v2/compare/nico_studio_drape_pass7.png`;
- `docs/v2/shots/character/hero_follow_{side,rear34,front,front34}.png`.

**Still short (seen in shots):**
- face is sculpted only by brushes on the MakeHuman head, not a full sculpt, and no high-to-low normal bake yet;
- hair is still shells (no cards or Kajiya-Kay);
- the beard edge is still fairly hard at the jaw;
- the tee neckline looks ragged in the shirt opening;
- sleeve hems and the shirt hem are slightly uneven after the drape;
- the A-pose drape gives sleeves that stand out from the arm when lowered;
- pants have no simulated knee folds (straight tube with pockets);
- no wrinkle-map normal bake for garments;
- the sneaker shader and pockets were not inspected close up in game;
- `character.meshLOD` reports a stale value (`Object.assign` copies the getter).

Not done: two-hand pistol stance, locomotion, VFX_NOTES items 6–9 (hair cards, pose-driven wrinkle maps, texture-space wetness, pre-integrated skin).

## Pass 8 (user feedback on pass 7: red ear, low-res, sticker print, slab tee, hair, walk)
- **Red ear:** the skin back-scatter added up to 0.9 red times the thickness mask (highest on the ears) when backlit. Now: thickness capped at 0.6, factor 0.35, sharper lobe, warmer (0.55, 0.30, 0.20) color (`nico/materials.js`).
- **Resolution:** head and body maps load at 4096² (verified in the asset files). Anisotropy is now 16 for all Nico textures. LOD0 (subdivided) is used out to 9 m. `character.meshLOD` was a stale copy (`Object.assign` evaluates getters), not a real downgrade: the meshes visible at the follow camera are LOD0.
- **Cloth:**
  - Tee albedo is 0xd6d2c9 (about 0.8; it clipped to a white slab in sun), with stronger folds and a finer knit.
  - The shirt print gets thread-scale breakup and uneven dye in the shader, so it sits in the weave.
  - Pants pockets, flaps, loops and the belt are geometry since pass 7.
- **Hair cards** (`nico/hairCards.js`, new): 2,200 (LOD0) or 1,200 (LOD1) tapered, curved cards on the long-hair zone of the scalp, combed with lift and sag, painted strand-alpha atlas, alpha-test plus alpha-to-coverage, matte (roughness 0.74, env 0.3), darker roots. The shells stay as the undercoat and barber fade.
- **Locomotion:**
  - `characterModel.js` exposes `character.gaitPhase`.
  - `nico/pose.js` adds a phase-locked layer: pelvis roll and yaw, chest counter-rotation, forward lean (more when running), arm swing opposite the legs, bent elbows when running.
  - The relaxed-arm correction is 12% while moving (it was 45% and killed the swing).
  - Legs and root are untouched, so the phase-synced clips still plant the feet.
- **ref_54 (corrected sheet), pass 8b:**
  - Hair is a short textured crop: shells 2.2 cm combed slightly forward, plus 2,600 short cards (LOD0).
  - Head textures repainted with short, even stubble (95k short hairs, lighter shadow).
  - Palm print is teal (44, 136, 138) with cream palms (236, 226, 194).
  - Watch is a gunmetal tactical digital with a dark strap and an LCD dial.
  - New `suspicious` expression; neutral, focus and angry exist.
  - Evidence: `docs/v2/shots/character/turnaround_vs_ref54.png`, `hero_close_front.png`, `hero_close_34.png`, `hero_34.png`, `hero_gameplay_front.png`, `hero_gameplay_back.png`, `hero_walk_0.png`.
- **Incident:** an edit to `nico/index.js` (the hairState line) had a syntax error for about 20 minutes (22:20 to 22:45). The game did not boot from :5200 in that window. Fixed and parse-checked.
- **Still bad in the shots (honest):**
  - grey-blue halo around the eyes (eye socket and sclera shading);
  - stubble reads grey and washed;
  - skin lacks form shading (the face looks flat);
  - hair reads as a dark cap;
  - shirt cyan and too saturated in sun, with sleeves standing off the arm (A-pose drape);
  - pants dark brown, not tan;
  - walk not verified (the run timed out on browser-slot load).

## Pass 9 (coordinator steps 1–5, ear and walk checks)
1. **Eye halo:** where the lids and socket shade the globe, the eye shader now blends to warm lid shadow (0.14, 0.085, 0.065) instead of darkening the sky-lit white to grey. In `hero_close_front.png` the whites read clean.
2. **Stubble:** the head is repainted (`nico_textures.py`) with a warm dark-brown stubble color and a warm follicle shadow (the cool tint read grey-blue).
3. **Form shading:**
   - the AO channel also darkens the skin albedo by 45% (cavity term; AO alone only shades sky light, so the face looked flat in sun);
   - head and body normal maps are back to full strength.
4. **Pants:** tan 0xb08a58 with stronger folds, plus horizontal knee and back-of-knee bunching and an ankle-stack break in the normal (`CARGO`).
5. **Sleeves:**
   - no A-pose droop and 5.5 mm ease over the arm's own radius;
   - sleeve cloth partly pinned in the drape;
   - the side belt loops that poked through the shirt were dropped.
   `studio_drape` render: the sleeves sit on the arm.
- **Ear backlit** (`hero_ear_backlit.png`): natural skin, no red.
- **Walk** (`hero_walk_0..2.png`): captured. The arm swing layer is visible; W produced a jog here, not a slow walk.
- Every JS edit was parse-checked (`node --check` on a temp copy) before writing.

## Pass 10 (in progress; stopped on machine load, about 23:50, load average 130)
**Live and parse-checked, not yet seen in a screenshot:**
- eyes: rest lids 0.44 closure / 0.34 slit, deep brown iris (0.17, 0.12, 0.09);
- matte skin: roughness floor 0.55, specular 0.5, no clearcoat, faint warm sheen as the soft second lobe;
- hair: cards up to about 4.5 cm on top with more lift and per-card tone, hair color 0x352216;
- shirt tint 0xdfe4d6, sheen 0.12 (less cyan);
- `main.js`: W walks (1.7 m/s), Shift runs (4.2), Shift held 1.5 s sprints (7.2). Ctrl/Alt still walk.

**Not finished:** the denser, darker stubble repaint (`nico_textures.py`, 150k short hairs, darker warm brown) was stopped before writing. Re-run `nico_textures.py <w6> <skin> <out> head` and copy `head_*.webp` to `public/assets/characters/nico/tex/`.

### Asset search for a 9/10 head (Nov 14, nothing downloaded)
- **3DScanStore free male head** (https://3dart.it/en/free-3d-head-model): photogrammetry from 120 DSLRs; 7-level ZBrush tool; OBJ/FBX; 16K/8K color, spec, normal, gloss, translucency and cavity maps. Licence: "Personal use only", commercial use by request to the author. **Not usable as is.** The poly count is not stated. It would need a retopology to the hm08 topology (or a wrap) before it fits our rig.
- **Ten24 free head scan** (https://www.cgchannel.com/2015/02/get-ten24s-free-ultra-detailed-3d-scan-of-a-human-head/): non-commercial only. **Not usable.**
- **Blender Studio Human Base Meshes** (https://developer.blender.org/docs/features/asset_system/asset_bundles/human_base_meshes/): released as CC0 per CG Channel (https://www.cgchannel.com/2023/06/download-blender-studios-free-human-base-meshes); the docs page itself is CC-BY-SA. The head assets are a stylized head, a planar head, and generic head topology with shape keys: sculpt bases, not finished faces. **No gain over our MakeHuman head.**
- **OpenGameArt "human male bust"** (https://opengameart.org/content/human-male-bust): CC-BY-SA 4.0, normal map included, not a scan. Share-alike would apply to the derived model.
- **Hair cards:** no CC0 or CC-BY short men's sets found. Paid sets exist (about $15–55, "royalty free", for example https://superhivemarket.com/products/realistic-short-male-hair-cards-for-blender-eevee--cycles-compatible---game-ready-low-poly-textured-dark-brown-men-crop-cut-buzz-crew-cut-3d-hair-asset), with licence terms to check.
- **Conclusion:** no free and clean (CC0/CC-BY) photoscanned or sculpted adult male head with baked maps turned up. Reaching 9/10 likely needs a paid scan with a commercial licence (3DScanStore retopologised heads are about £40) wrapped to hm08, or commissioned sculpt work. That is the user's call.

### Pass 10 verified (Nov 14, 00:30; load under 40)
- The stubble repaint is installed.
- Evidence:
  - `docs/v2/compare/nico_face_vs_ref54_pass10.png` (ref_54 face, our close front, close 3/4, gameplay distance);
  - `hero_close_front.png`, `hero_close_34.png`, `hero_gameplay_front.png`, `hero_34.png`.
- No console errors and `game.v2.failed` is empty.
- **Honest read against ref_54:**
  - The stubble is now dense, but it reads as a heavy dark jaw shadow with pale specks (the speckled strokes), not ref_54's fine even stubble.
  - The eye whites look glassy and grey, and the lids still sit too open in the front view.
  - The hair cards stand up as gelled spikes instead of a neat textured crop.
  - The skin is matte (good), but the face shape is still the MakeHuman base: no cheek and temple planes, a soft nose.
  - At gameplay distance the shirt shoulders look puffy.
  - **Face 4/10, hair 3/10, stubble 4/10.**
