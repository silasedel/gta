# Southline art style guide (r2-art, round 2)

One hand-made look for every asset, library model or code-built: same light response, same resolution, same wear,
same grade. The bar is GTA 5 or better, and the target pictures are `docs/v2/plan/nico_house/0_front_deck_mockup.webp`
(+ `1..6`), `references/ref_52`, `ref_55-59`.

**Shader and atmosphere bar: the GTA 6 trailers.** Their look is grounded, photoreal but graded. The game and its assets
stay original; only the quality bar is borrowed. What that means in numbers:
- **Real reflectance with Fresnel:**
  - Every dielectric reflects about 4% head-on, rising to a near mirror at grazing angles.
  - Wet asphalt, car paint, glass and polished floors show the sky and the surroundings at low angles, not a flat sheen.
  - Never fake reflection by brightening albedo.
  - Never kill Fresnel with roughness 1 on smooth things. Roughness 1 is for chalk, dry soil and raw concrete only.
- **Shade:**
  - Deep but never black. Sunlit to open-shade ratio is about 3:1. Shade keeps its color: blue-gray on concrete, olive
    under trees.
  - Contact shadows and AO darken creases, not whole surfaces.
  - Pure black (sRGB < 10) only in tire treads, door gaps and night voids.
- **Humid warm haze:**
  - The air is visible. Distance desaturates and lifts toward a warm gray-blue, strongest at the horizon and around the sun.
  - Highlights bloom softly. Nothing in the distance is sharp black.
- **Color: saturated but believable:**
  - Pastel stucco, teal water, red poinciana, green-yellow grass.
  - Saturation comes from the material (sun-faded paint is less saturated than a fresh sign), not from a global boost.
  - No neon unless it's a light source.

Machine-readable ranges: `src/world/art/ranges.json` (the audit reads them). Audit: `node tools/v2/art/audit.mjs`
-> `docs/v2/reports/art-audit.md`. If a value here and the JSON disagree, the JSON wins, so tell r2-art.

## 0. The calibration these numbers assume (agreed with r2-look, locked)
- **Tone map:** Khronos PBR Neutral.
- **Exposure:** about 0.96, with noon auto exposure capped at about +0.4 stop.
- **Noon sun:** about 4.76 at (1.0, 0.955, 0.90), with a sky fill of about 0.46 (hemisphere) plus 0.46 (env).
- **Env baseline:** scene `environmentIntensity` is about 0.46 by day. A material's `envMapIntensity` 1.0 means a
  standard dielectric reflection.
- **Screen check:**
  - 80% white diffuse in noon sun shows as sRGB about 228.
  - 18% gray shows as about 118 in sun and about 89 half-shaded.
  - Nothing diffuse may clip in direct sun. If a surface hits 245+ in sun, its albedo is too high.
- So the "pale, flat" look is a material problem, not an exposure problem. Fix it with albedo, roughness and wear,
  never by darkening the light.

## 1. Rules that apply to every material
1. **Albedo is the measured color of the real surface with no light in it.**
   - No baked sun, no baked AO deeper than crevices, no specular highlights painted into the color.
   - Linear luminance stays between 0.015 (fresh tire rubber, coal) and 0.82 (fresh white paint).
   - Nothing in the world is whiter than 0.85.
2. **Metalness is 0 or 1.**
   - Paint, rust, dirt, plastic and glass are dielectric (0).
   - Bare metal is 1.
   - In-between values only for metallic-flake car paint (0.5-0.7) and blended masks (rust over steel, in the map, not
     as a scalar).
   - A tinted "glass" at metalness 0.9 is a mirror, not glass.
3. **Roughness:**
   - Nothing outdoors is below 0.25 except glass, water, chrome, clear-coat and wet surfaces.
   - A material with no roughness map must vary through the shader (wear, grime) or it reads as plastic.
4. **Normals:**
   - Normal strength stays at what the photo source shows. Most surfaces sit at normalScale 0.4-1.0. Brick, bark and
     rock may go to 1.2.
   - A normal map that "boils" at 20 m (aliasing) is too strong for its texel density. Lower it, or mip-bias it.
5. **Texel density** (px per meter at the asset's real size):
   - Ground, roads and props: target 512 px/m, minimum 256 (props 200). Characters 1024, faces 2048 equivalent.
     Building facades 256, minimum 128, plus the shared wall-detail overlay within 60 m (`bldmodels.js`).
   - A library model below the minimum gets either a tiling detail layer (world-aligned) or a re-bake.
   - Blurry textures next to crisp 4K is the main tell of "downloaded models".
6. **Wear and grime (Florida):** every exterior surface larger than 1 m² carries at least three of these:
   - edge wear and lighter chipped paint on corners
   - splash-zone dirt from 0 to 0.6 m (sand-gray, 10-25% darker)
   - rain streaks under sills and ledges
   - black mildew bloom on stucco in shade
   - salt-white bloom on metal near the coast
   - rust runs under fasteners
   - sun bleaching on the up-facing side, with saturation 15-30% lower than the sheltered side

   Amount by district:
   - new downtown: 0.15
   - suburbs and Keys: 0.35
   - Overtown, Liberty, industrial and rural: 0.55-0.7

   Clean flat color over a big area is the main tell of "code-built".
7. **Saturation** (HSV S of the sRGB-encoded mean albedo):
   - Natural materials stay at or below 0.45, sand and concrete at or below 0.18.
   - Painted surfaces stay at or below 0.45; Florida paint is sun-faded pastel, not toy color.
   - Signs, flowers and car paint may go to 0.75-0.85.
8. **Environment reflection:**
   - Dielectric surfaces use `envMapIntensity` 0.5-1.2.
   - Glass, car paint and chrome use 0.9-1.5.
   - Never above 1.6. The env map is the sky plus a dark horizon ring, so a too-strong env makes paint read pale and
     washed.

## 2. Per material class
Albedo is linear luminance with its sRGB value (0-255) in brackets. Roughness and metalness are effective values (scalar ×
map mean). Texel density is target / minimum in px per meter.

| class | albedo L (sRGB) | roughness | metal | normal | sat max | texel | wear and grime |
|---|---|---|---|---|---|---|---|
| asphalt | 0.04-0.14 (56-105). Fresh 0.04-0.06, aged Florida 0.08-0.14 (default) | 0.80-0.97 (wet 0.1-0.35) | 0 | 0.4-1.0 | 0.14 | 512 / 256 | oil drips in lane centers, tire polish in wheel paths, patch seams, sand at curbs |
| concrete (sidewalk, curb, slab) | 0.20-0.42 (124-173) | 0.75-0.96 | 0 | 0.3-1.0 | 0.14 | 512 / 200 | expansion joints, gum and stain spots, edge chips, darker shaded base |
| stucco / plaster facade | white 0.62-0.80 (205-231), pastel 0.35-0.60 (160-203), dirty 0.28-0.40 | 0.78-0.96 | 0 | 0.2-0.8 | 0.42 | 256 / 128 | rain streaks, mildew in shade, splash dirt, crack lines, patched repaint squares |
| painted wood (trim, siding, lattice) | 0.22-0.80 | 0.50-0.82 | 0 | 0.3-0.9 | 0.45 | 512 / 200 | peeling at edges, grain showing through, darker end grain |
| raw / aged wood (deck, dock, fence) | 0.08-0.32 (80-153). Weathered silver-gray 0.18-0.30, new pine 0.30 | 0.68-0.94 | 0 | 0.4-1.1 | 0.45 | 512 / 200 | gray UV bleach on top faces, dark wet ends, nail rust |
| brick | 0.07-0.26 (75-137) | 0.80-0.96 | 0 | 0.5-1.2 | 0.55 | 256 / 128 | efflorescence, soot, mortar lighter than brick |
| painted metal (dumpster, bins, poles, mailbox) | 0.03-0.75 by paint | 0.28-0.70 | 0-0.15 | 0.1-0.6 | 0.55 | 512 / 200 | chipped edges to rust, scuffs, faded top |
| galvanized / bare steel | base 0.40-0.66 | 0.32-0.68 | 1 | 0.1-0.6 | 0.08 | 512 / 200 | white zinc bloom, dull spangle, rust at cuts |
| rusty metal | 0.05-0.20 (63-124) | 0.72-0.96 | 0 (mask over 1) | 0.4-1.1 | 0.62 | 512 / 200 | runs downward from the rust source |
| glass (windows) | 0.01-0.10 base | 0.02-0.16 | 0-0.12 | 0-0.3 | 0.30 | 256 / 64 | dust film at the bottom edge, salt haze near the beach |
| car paint | black 0.025-0.05, white 0.70-0.76, colors 0.15-0.45 | coat 0.03-0.08 new / 0.12-0.25 old; base 0.3-0.55 | solid 0, metallic 0.5-0.7 | 0-0.3 | 0.75 | 512 / 128 | dust on horizontal panels, sun-faded roof and hood on old cars, mud on sills |
| chrome / polished metal | chrome 0.50-0.65, polished aluminum 0.85-0.92 | 0.02-0.22 | 1 | 0-0.4 | 0.08 | 256 / 64 | water spots, pitting on old cars |
| rubber (tires, seals) | 0.015-0.06 | 0.72-0.94 | 0 | 0.4-1.2 | 0.20 | 512 / 200 | gray-brown sidewall dust, sand in tread |
| foliage (leaves, fronds) | 0.045-0.19 (60-120) | 0.42-0.82 (waxy palms 0.45-0.6) | 0 | 0.2-0.8 | 0.62 | 512 / 200 | dry tips, brown dead fronds 10-20%, sun-yellowed outer leaves |
| flowers | 0.05-0.45 | 0.45-0.85 | 0 | 0.2-0.8 | 0.82 | 512 / 200 | fallen petals on the ground below |
| bark / trunks | 0.07-0.28 (75-145). Palm trunk gray 0.15-0.28 | 0.82-0.98 | 0 | 0.5-1.2 | 0.38 | 512 / 200 | darker, damp base; lichen spots |
| dry sand / shell | 0.28-0.50 (149-188), sat at most 0.18 (bleached, near neutral) | 0.85-1.0 | 0 | 0.3-1.0 | 0.18 | 512 / 256 | tire tracks, footprints, debris, darker damp hollows |
| wet sand | 0.15-0.25 | 0.35-0.6 | 0 | same | 0.22 | same | - |
| soil / mud / gravel | 0.05-0.20 | 0.85-1.0 (mud 0.4-0.7) | 0 | 0.4-1.1 | 0.42 | 512 / 256 | - |
| grass (lawn, verge) | 0.06-0.20. Green 0.07-0.13, dry St. Augustine 0.12-0.20 | 0.60-0.92 | 0 | 0.2-0.9 | 0.58 | 512 / 256 | patchy brown, bare sand spots, mower lines only on kept lawns |
| stone / rock / coral | 0.10-0.40 | 0.70-0.96 | 0 | 0.5-1.2 | 0.30 | 512 / 200 | moss and algae near water, dark wet band |
| skin | 0.03-0.46 (dark to light) | 0.40-0.68 | 0 | 0.2-1.0 | 0.58 | 1024 / 400 | sweat sheen (roughness, not albedo) |
| hair | 0.005-0.40 | 0.35-0.75 | 0 | - | 0.60 | 1024 / 300 | - |
| cloth | 0.02-0.66 | 0.68-0.97 | 0 | 0.3-1.0 | 0.68 | 512 / 256 | fading on the up-facing sides, dirt at hems |
| plastic | 0.02-0.75 | 0.28-0.68 | 0 | 0-0.6 | 0.72 | 512 / 128 | sun chalking (rougher, lighter, less saturated) on outdoor plastic |
| signs / decals | 0.02-0.78 | 0.25-0.70 | 0-0.15 | 0-0.4 | 0.85 | 512 / 128 | faded inks outdoors, sticker residue |

Notes:
- **Sand:** the mock-up's sunlit yard reads (176,171,162), almost neutral. Florida shell and quartz sand is gray-white,
  not orange-beige. Keep the hue at 35-45 and the saturation at most 0.18.
- **Foliage and bark** (r2-veg's palette is inside these ranges):
  - broadleaf / palm fronds: HSV value 0.34-0.39, sat 0.40-0.50, which is linear L about 0.08-0.11
  - trunks: value 0.33-0.41, sat 0.10-0.22
- **Glass in library buildings:** metalness 0-0.1, base 0.03-0.06, roughness 0.05-0.12, `envMapIntensity` 1.2-1.4.
  Windows read dark with reflected sky, not as blue-gray mirrors.

## 3. Color grade: warm, humid Florida (r2-look owns the pass, this is the target)
- **Daylight:**
  - near-neutral white balance; sun slightly warm (1.0, 0.955, 0.90)
  - shade neutral to slightly cool, never teal
  - skies deep blue overhead, pale and hazy at the horizon
- **Air:** humid aerial perspective. Distant things go pale warm gray-blue and lose contrast from about 400 m. Blacks
  in the far field lift, while near blacks stay deep: tire, open door gap, deep shade under a car = sRGB 15-30.
- **Contrast:**
  - medium-high, from real shade (sun-to-shade ratio about 2.5-3.5:1 on a sunny day), not from a curve
  - mock-up checks: deck boards in sun about 150-175, under the rail's shadow about 70-85; sand in sun about 175,
    under the truck about 60
- **Saturation:**
  - global trim 0.93
  - greens lean yellow-olive (hue 70-90), not blue-green
  - reds of flowers and the roll-off stay strong; everything man-made is sun-faded
- **Golden hour:** warm orange key light, cool blue fill. Gold-lit tops, blue shadows.

## 4. How to apply (checklist for every helper)
1. Classify each material you own (name it so the audit can classify it: `paint:`, `wood`, `concrete`, `glass`, `rust`...).
2. Put its mean albedo, roughness and metalness inside the class row.
   - For library models, use per-material runtime calibration: gain on `color` (albedo), scale roughness, set
     metalness to 0 or 1, clamp `envMapIntensity`.
   - Re-bake the texture only when the map itself is wrong: baked lighting, wrong hue, or too low-res.
3. Low texel density: add the shared world-aligned detail layer (as `bldmodels.js` does on walls) or request a better model.
4. Add wear: edges, splash zone, streaks. Look at it in game at 3 distances (2 m, 15 m, 60 m) at 11:00 and 18:30.
5. Re-run `node tools/v2/art/audit.mjs --only <place>` and check your rows in `docs/v2/reports/art-audit.md`.

## 5. Geometry depth: what "hand-built" means for buildings
The tell of a code-built building is a flat box with painted-on detail. At street distance (5-40 m), every one of these must be
real geometry, sized like the real thing:

| element | real size | rule |
|---|---|---|
| roof eaves (pitched roofs) | 0.45-0.9 m overhang | fascia board 0.2-0.25 m tall, soffit underneath, never a roof that ends flush with the wall |
| gutters | 0.12 x 0.12 m (K-style) | on the eave sides; one downspout per 10-12 m of eave, with an elbow and a kick-out shoe or splash block |
| parapets (flat roofs) | 0.6-1.2 m tall | coping 0.05 m proud on both sides, darker drip stain under the coping |
| cornice / string course | 0.1-0.4 m projection | at the roof line and over the ground floor on masonry and deco fronts |
| window depth | glass 0.1-0.2 m behind the wall | reveals (jambs), sill 0.04-0.08 m proud with a drip, lintel on masonry |
| door depth | 0.1-0.9 m recess | frame, threshold, a light over it |
| base / water table | 0.3-0.5 m | concrete or stone band, splash dirt up to 0.6 m |
| foundation skirt (raised houses) | lattice or block | never a house floating on posts with an empty gap |
| roof breakers | 30-60% of roofs | chimney, vent stacks, plumbing vents, antenna, satellite dish, solar water heater (Florida), AC curb units on flat roofs |
| services | per building | AC condenser on a pad (houses) or wall units (walk-ups), meter box + conduit, hose bib, downspouts |
| silhouette | | nothing is a perfect box above the eave line: break the roofline every 10-20 m on long buildings |

Weathering follows the geometry: streaks start under sills, coping and AC units; dirt collects where water splashes, at
the base and on the leeward side. Detail density falls with distance (near / mid / far LOD); the far LOD keeps only the
silhouette (roof shape, parapet, big masses).
