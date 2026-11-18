# Morning summary, Nov 18

Weekly usage ended the night at about 92 %. Final deploy: gh-pages d1923c7 from e7157a78 (Mac app rebuilt from the same commit) (resets Nov 19, 9 am Denver). Everything below is committed on `stage-1`. The website and the Mac app were rebuilt after the last big batch.

## Live now
- Website: https://silasedel.github.io/gta6/ (streams cars and big trees after you start; 417 MB before play, was 450).
- Mac app: `desktop/dist/Southline-2.0.0-arm64.dmg` (everything preloaded from disk). Right-click > Open the first time (unsigned).

## Done tonight (Nov 17 evening to Nov 18 night)
- **Freeze / 2 fps:** memory leak found and fixed (shore water effect kept every unloaded map tile; wrecks never cleaned up). Memory growth -60 %, GPU memory growth -70 %. Buildings no longer vanish for a frame when their detail changes.
- **Intersections:** fixed in the map generator. Roads crossing with no junction 108 -> 6, ramp walls in streets 24 -> 0, curbs across lanes 23 -> 0, missing junction surfaces 132 -> 0, streets raised on walls 205 -> 0. SR 934 at 9th and 10th Ave and Brickell -> SW 11th St fixed; Brickell traffic flows.
- **Cars:** real rubber tires (no checkerboard, not see-through), single-layer glass with real reflections, shaded cabins, two broken wheels replaced. The Regalia X (Rolls-style SUV) only in its original brown; rare cars one color, one each.
- **People:** arms hang naturally (71 models), full quality up close, no single-file lines, no walking through walls, no spawning in view, district-fit cast, beach empties in the rain, no twins, lifeguard at the tower.
- **World:** realistic rain (patchy wetness, sand soaks it up, mirrors only in puddles), mangroves rooted, tar-seal road cracks.
- **Your library models in:** ATM, wall clock, rubber plant, potted palm. Store display no longer floats.
- **Gameplay:** GPS routes by travel time (fewer turns), E drives boats, police come from cars or stations, top-right recognition icons always shown, wardrobe works, infinite money in dev mode, gang system removed, quicker car exit.
- **Car paint (late night):** paint normals rebuilt (the blotchy reflections and lumpy panels), dirt only on sills / behind wheels, soft fade and rust, no rain speckle; mid-distance color no longer jumps. `?r3paint=0` = old.
- **Overpass / retaining walls:** chamfered top edge, darker base, an earth berm blends the base into the ground (`?r3concrete=0`). Jersey barriers not changed yet.
- **Police on foot** steer around buildings; shop people stay on the floor.
- **Dogs:** filed in Models/Animals (Dog 1-5, police vest). Dog 5 is ripped from Call of Duty: reference only.

## Needs your OK
- **Texture compression (KTX2 / Basis):** the biggest remaining win. It cuts the website download a lot, gets the site well under GitHub's 1 GB limit (it is at 999.5 MB now, so the next site update can't go out without it), and uses about a quarter of the graphics memory in the app too. It needs a texture tool installed (KTX-Software `toktx` from the Khronos GitHub releases, or the `@gltf-transform/cli` npm package). Say yes and I'll install one and do it.
- **A free German Shepherd** model (not from a game) if you want the police dog to be a shepherd; otherwise the Doberman + vest.

## Still open (next week list, details in docs/v2/plan/feedback_nov17_pm/FEEDBACK.md)
- Car paint textures and remaining glass spots (hatch1 rear window, suv2 windshield)
- Overpass / barrier walls as real concrete, road edges blending into dirt
- Police K9 (rig, fur, ears/tail physics, ragdoll), ragdolls with joint limits for people
- Real step-out-of-the-car animation, kneeling/sitting animations
- Store shelves and other props from your library
- Slow remaining memory growth (much smaller now)
- Brickell Ave double ramp redesign; 6 junctions next to bridge ends
- Full-detail preload tuning for the Mac app
