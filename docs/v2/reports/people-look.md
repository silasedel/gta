# people-look report (Nov 14, about 01:00 MST)

## What changed
- **41 original archetypes** (`src/npc/pipeline/npc_specs.py`):
  - Coverage:
    - Club: knit dress, bomber over henley, slip dress, print shirt, crop top with leather skirt, tee.
    - Three bartenders in vests, plus a bouncer.
    - Beach: nine archetypes, including a lifeguard, a retiree and an elder.
    - Street, tourists and joggers.
    - Cook, waiter, builder, dock worker and courier.
    - Four office archetypes.
    - Two police officers with invented insignia.
    - Three gangs in the colors from `src/gameplay/gangs/data.js`.
  - People are 21 to 74 years old and Latino, Black, white, Asian and mixed.
- **Asset pipeline** (`src/npc/pipeline/`, Blender + numpy; all inputs CC0, all outputs original):
  - `gen_npc.py`: builds each MPFB body with face and body morphs, then the garments:
    - garment shells cut from the body and draped;
    - skirts and dresses as cones;
    - beanies and caps;
    - pumps on a heel-posed foot (the heel pose is applied as the rest pose);
    - sandals.
  - It also removes hidden skin, pulls skin in under hems, makes fade hair shells and buns, trims socks off dress shoes, and builds LOD0 / LOD1 (7k tris) / LOD2 (1.7k tris).
  - `paint_npc.py`: paints one atlas per archetype in the MakeHuman body UV layout from per-texel 3D positions:
    - skin from the CC0 photo skins, toned;
    - scalp hair, fades, beards and make-up;
    - seams, topstitching, hems, plackets, buttons, pockets and belt loops;
    - folds baked into the normal map;
    - denim fades, whiskers and honeycombs;
    - prints and invented text.
  - The albedo alpha carries a material byte (slot << 5 | fabric).
  - `shared_npc.py`: shared hair, brow, lash, eye and shoe textures.
  - `build_index.py`: installs the assets to `public/assets/npc/` (21 MB).
- **Runtime** (`src/npc/arch/`):
  - `materials.js`:
    - one physical material for skin and cloth;
    - per-fabric roughness, specular and sheen;
    - tiled micro-normals (knit, rib, weave, twill, pique, pores, grain, ripstop);
    - wrap lighting with a warm scatter on skin;
    - specular anti-aliasing;
    - matte Kajiya-Kay hair with two weak lobes.
  - `anim.js`: all NPC clips are procedural and original:
    - gait generator (walk m/f/heels/old/brisk, jog, run, sprint), with feet pinned to the ground and gait speed measured by forward kinematics;
    - idles with weight shift, arms crossed, wall lean, phone, talk, drink, photo;
    - three dances, bartending, pour, shake, cook, tray, chair and stool sitting;
    - the project's own procedural action clips, converted.
  - Mixamo clips are no longer used by archetype people.
  - `character.js`:
    - same interface as the legacy ped character;
    - distance LOD at 15 m and 60 m, with a budget of 8 full-detail people;
    - shadows within 26 m;
    - animation rate drops with distance;
    - props (phone, cup, rag, bottle, shaker, tray);
    - garment-slot hue variants per person;
    - each archetype cycles through its own poses (bartenders wipe and pour).
  - `lib.js`: lazy loader with ImageBitmap decoding. `arch.v2.js`: loads archetypes for the player's places one at a time and exposes `game.npc`.
- **Integration:**
  - `src/npc/peds.js` `getChar` asks `game.npc.createPed()` first and falls back to the legacy body. That is one line; separation logic is untouched.
  - `src/npc/look.js` `applyLook` routes archetype people to a reduced path: color variants, height and small accessories, with no bone reshaping and no hats over modelled hair.
  - `?npc=legacy` turns archetypes off for A/B tests.

## Coordinator request (Nov 14)
- **Gold specks on edges:**
  - Cause: the material byte was read with filtering, so neighbouring codes blended into the "metal" fabric.
  - Fix: it is now read with `texelFetch`.
  - Also added specular anti-aliasing (roughness from the normal variance), a capped sheen, micro-normals that fade at grazing angles, and a Kajiya-Kay highlight that fades toward silhouettes.
  - Not re-checked in a dim room after the fix.
- **Bartender vest outfit:** added `bartender_vest_m`, next to `bartender_m` and `bartender_f`, who also wear vests. Bar staff and the bouncer are now picked only for the `bar` / `bartender` / `security` places, never as guests.
- **Seated pose at 0.46 m:**
  - Checked against a 0.46 m box in `seat_side.webp`: the hips sat about 2 cm low and the hands floated.
  - Fixed: hips raised 2.5 cm, forearms rest on the thighs.
  - Not re-shot after the fix.

## API for interiors-art
- `game.npc.spawnPosed({ archetype, pose, pos: {x,y,z}, rot, seed, vary })` returns `{ root, character, setPose(p), remove() }`.
- `game.npc.spawnPosedAsync(sameOpts)` loads the archetype first; `place: 'bar' | 'nightlife' | 'security'` picks one for you.
- `game.npc.poses()`, `game.npc.archetypes(place)`, `game.npc.loadPlace(place)`, `game.npc.stats()`.
- **Request:** `venuePeople.js` spawns staff with `{ outfit: 'nightlife' }`. Pass `outfit: 'bartender'` for bartenders and `outfit: 'bouncer'` for the door, so staff get vest and bouncer archetypes. Today staff come out as guests.
- Event: `'npc:ready'`.

## Evidence (`docs/v2/shots/people-look/`)
- `grp0..7.webp`: all archetypes, sun.
- `face_*.webp`: 8 close-ups.
- `club_poses.webp`: club light, lean / walk in heels / bartend / dance / drink.
- `walk34.webp`, `seat_side.webp`, `seat_bench.webp`.
- `club_velvet_undertow_ingame.webp`: in game, Velvet Undertow with archetype guests, dancers and a STAFF bouncer.
- `promenade_*.webp`: South Beach.

## Frame rate (headless test Chrome; machine load 14-18, so unreliable)
At the South Beach promenade, 13:30, 28 near peds:

| | fps | 1% low |
|---|---|---|
| Legacy people | 16.0 | 9.1 |
| Archetypes (25 of the 28 peds) | 15.5 | 6.6 |

The lower 1% low comes from archetypes still loading during the measurement (clip binding takes about 50-100 ms per archetype). Loading is now lazy and one at a time, but that was not re-measured.

## Honest score against ref_52: 5/10
- **Better than before:** real photo faces and skin detail, clothing with seams, folds and denim wear, varied bodies, matte hair, natural walk and idle weight shifts.
- **Short of the bar:**
  - Faces are MakeHuman-generic.
  - Garments are body shells (sleeves and blazers boxy; no lapels or collars modelled).
  - Nude pumps read as bare feet; the heel posts are thin.
  - Some armhole and hem edges are still ragged.
  - The slip dress has no straps.
  - Long hair cards are MakeHuman quality.
  - Arms in some poses (lean, cook) are approximate.
  - Crowd variety while loading leans on a few archetypes (hue variants differ).

## Not done
- Impostors beyond LOD2 (the existing instanced crowd tier covers far people).
- GPU-compressed textures.
- Modelled collars and lapels.
- Cloth simulation.
- Facial animation.
- Re-verifying the specks fix and the sit fix in a dim room.

## Pass 2 (Nov 14, 01:00-02:00 MST; coordinator's list)
1. **Collars, sleeves, straps, shoes:**
   - `gen_npc.py` `add_collar` extrudes real collars from the neckline: a stand for chef and bomber, a stand plus fall for shirt collars, fold-down collars for polo, camp and blouse, and lapels for the blazer.
   - Sleeves are slimmer (less flare; the blazer standoff went from 22 to 16 mm).
   - The slip dress and sundress get explicit shoulder straps (`make_straps`).
   - Heel archetypes now wear the fitted CC0 shoe proxy (black dress shoe) and walk with the heel gait, and trouser hems end above the shoe. The pitched-foot pump experiment broke the arm skinning when combined with a fitted shoe, so it is off.
   - Ankles stay visible above shoes.
   - Evidence: `pass2_collars_lineup.webp`, `pass2_collars_close.webp`, `pass2_heels_shoes_straps.webp`.
2. **Ragged edges:**
   - Garment openings get 10 more boundary-relax passes after draping.
   - Dress shoes no longer lose their uppers to the sock trim.
   - Hair already uses alpha-to-coverage, which the game's MSAA scene pass resolves.
   - Some stair-stepping remains on sleeveless armholes and vest hems.
3. **Faces:** every archetype now gets one strong morph (0.45 to 0.85) from each of nose, jaw/head shape, brow, eye shape, mouth and cheek/ear groups, plus 8 random weaker ones. Faces read clearly different in the lineups.
4. **Club from inside** (`pass2_club_inside_bar.webp`, `pass2_club_inside_seats.webp`):
   - The gold and white specks were still there after the first fix (`pass2_club_specks_before_fix.webp`). The cause was specular from the micro-normals under the club's many small lights.
   - Fixed with a per-light specular clamp, a cloth/skin roughness floor of 0.5, and micro-normal strength cut to 0.6.
   - The NPCs are clean in the bar shot after the fix.
   - Seated guests are on the booth seats and stools. The 0.46 m sit pose had already been fixed in pass 1.
5. **Ocean Drive at 17:00, street level** (`pass2_promenade_1700.webp`):
   - New promenade strollers in `arch.v2.js`: up to 30 archetype people walking both sidewalks of Ocean Drive (fewer outside 16:00 to 21:00), kept within about 140 m of the player. They only appear while the player is near and no interior is open.
   - In the shot, about 8 people are readable on screen. That is busier than before, but not a dense crowd.

**Honest score now: 6/10 against ref_52, short of the 6.5 target.**
- **Better:** collars and lapels, real shoes, straps, distinct faces, no specks in the club, a busier promenade.
- **Still behind:**
  - Garment silhouettes are still body shells (no cloth simulation or sculpted folds).
  - MakeHuman hair cards.
  - Some edge stair-stepping.
  - No true high heels.
  - Club guests sometimes come from beach archetypes (barefoot).
  - Promenade density is moderate.
