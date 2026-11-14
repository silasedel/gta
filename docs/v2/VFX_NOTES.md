# VFX technique notes (quality bar, Nov 13)

These notes come from a VFX artists' breakdown of a AAA open-world trailer and from the user's benchmark images.
We copy techniques, never content: no names, characters, logos, cars or places from any other game. Real Miami geography is fine.

## Benchmark images (user, Nov 13)
- **ref_51** (saved in `references/`): a causeway at noon.
  - Clean blue sky and soft haze on the far skyline.
  - Worn asphalt and paint, weathered concrete balustrades, delineator posts, lamp posts and pylons.
- **Afternoon beachfront with a supercar** (not saved; described here):
  - Golden low sun.
  - The road is wet in patches, and the puddles mirror the palms, the buildings and the sky.
  - Pastel art-deco storefronts with teal awnings and cafe umbrellas.
  - Bougainvillea, a dense palm row, and a crowd on the promenade.
  - The car's clear coat reflects the palms.
  - The hero's shirt has a fine fabric texture and real folds, the pants have real cargo pockets, and the watch is metal.
- **Night neon street in rain** (not saved):
  - Pink, green and violet neon spills onto wet surfaces, with long colored reflections on the road.
  - A mural wall, dumpsters, trash bags, a lit bar window with people inside, and street lights with glow.
  - The wet car paint has beads of water.
  - Skin under colored light shows a believable sheen.
- **Speedboat on the bay** (not saved):
  - Turquoise water with sun glints and white wake spray.
  - Big cumulus clouds.
  - A boat interior with a wood deck, cream leather seats and gauges.
  - A yacht throwing a bow wave, waterfront villas with docks, and a dense high-rise skyline.
- **Sunset port and warehouse district** (not saved):
  - Sun low on the horizon and long shadows.
  - Cracked asphalt with puddles that catch the sun.
  - Corrugated walls with graffiti, roll-up doors, yellow bollards and pallets.
  - Chain-link fence with barbed wire, container cranes, and a haze glow around the sun.

## Techniques, and how we do each in WebGL at 60 fps

| # | What they do | Our version | Owner |
|---|---|---|---|
| 1 | **Probe GI:** a grid of small 360° light probes that each re-render a few times a second, so bounce light builds up over frames. Characters in cars and rooms are lit by the world around them. | A grid of low-resolution probes around the camera, stored as second-order spherical harmonics (SH L1/L2) and updated a few per frame from 16 px cube renders. They feed the character, car and NPC ambient light; a sunny wall throws warm light onto Nico. Fallback: a ground-bounce term (sun × ground albedo from below). | look |
| 2 | **Volumetric haze lit by local lights:** the haze is bright under each light and dark between them. | Height fog with sun in-scattering (Mie phase). For street lights and neon: cones and spheres of scattering drawn with depth fade, only near the camera. Sun shafts in screen space at golden hour. | look |
| 3 | **Reflections:** screen-space where possible, ray-traced only on hero glass, with low sample counts and temporal denoising. | SSR on wet roads, puddles and car paint, at half resolution with temporal accumulation. Fallback: box-projected cube maps baked per block at load. Low-resolution planar reflection for near water only. Puddle masks plus a wetness amount after rain. | look |
| 4 | **Render less, reconstruct more:** they render about 1400p at 30 fps and upscale. | TAA with jitter and a sharpen pass, at about 0.75–0.85 internal resolution. Dynamic resolution only from frame time, with hysteresis and no visible pumping. That buys the time for GI and SSR at 60 fps. | perf + look |
| 5 | **Active ragdoll:** joint limits, PD "motors" pulling toward an animation pose, and a balance and self-preservation brain (support leg, centre of mass over the feet, arms up to protect when falling). | Rapier ragdoll with cone and twist limits per joint; motors that drive toward the hit-reaction pose, with strength that fades over time; a balance controller (the hit leg goes weak, the other leg braces, a stumble step); arms reach to break the fall; then blend into a get-up animation. No infinitely floppy bodies. | combat / playtest-fixes |
| 6 | **Strand-like hair, even on background NPCs.** | Hair cards with anisotropic Kajiya-Kay shading plus a second shifted highlight, alpha-to-coverage with TAA dithering, and a few guide-card springs that react to head motion and wind. Arm hair as fine cards or in the normal map. | Nico, npc |
| 7 | **Cloth:** wrinkles shift as he walks; fine fabric texture everywhere. | Pose-driven wrinkle maps (elbow bend blends in a sleeve wrinkle normal map, hip bend blends in crotch and knee folds). Stiff, close to critically damped dynamics, with no idle flutter (fixed Nov 13). A tiling weave micro-normal on every garment. | Nico |
| 8 | **Sweat and wetness:** a small 2D fluid sim drawn into a texture on the body. | A texture-space wetness and drip map per character: rain and sweat build up and run downward, raising specular and darkening the albedo. The same applies to car paint beads in rain. | Nico, cars |
| 9 | **Skin.** | Pre-integrated or wrap subsurface with red scatter in shadow edges, a two-lobe specular, a pore micro-normal, a cavity map, and a sheen under colored neon. | Nico, npc |
| 10 | **Spend detail where the eye goes:** the hero glass refracts, the background vase doesn't. | Importance LOD: full materials on the player, the car in front and NPCs within 15 m; cheap versions elsewhere. | all |
| 11 | **Procedural tag-based dressing:** every prop has tags and rules (district, wealth, near road or water, night, on or next to what). | The world-dressing kit uses tags plus placement rules, seeded per lot, so it is never random clutter. | world-dressing |
| 12 | **Flex your strengths everywhere:** plants, hair, fabric detail. | Our flex set: wet reflections after rain, neon at night, palms and bougainvillea, fine fabric. Use them in every district. | all |
| 13 | **Even they use sprites for fire.** | Fire stays as sprite flipbooks with good lighting and smoke. | fx |
