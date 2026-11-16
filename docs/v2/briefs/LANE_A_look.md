# Lane A: Look, rendering, performance, integration
Owner of: `src/render/**`, `src/world/env/**`, lighting/sky/water/post-processing, `vite.config.js`, desktop build, `.github/workflows/`.
Also: merge duty (see README) and the final Mac app build + V2.1 publish.
1. **Grain/pixelation** (top priority): find every dithered/alpha-hashed/noisy layer (hair cards, LOD fades, glass, vegetation, shadows, SSAO, film grain) and make it smooth: proper MSAA/TAA, alpha-to-coverage or sorted blending, no dot patterns, no shimmering. Lock 1080p. Verify on spawn, downtown, beach, interior.
2. **Photoreal with a game finish:** sky, sun, golden hour, color grading, tone mapping, bloom, reflections (car paint, glass, water), wet roads at night, fog, rain, storms. Compare against GTA 6 stills the user can provide.
3. **Day/night + weather** system (rain, storms, fog); realistic lighting at night with lamps.
4. **60 fps budget:** profile, add LOD/instancing/culling/resolution governor (locked 1080p means governor only lowers effects, not resolution). Frame ms table before/after.
5. **Camera:** third person closer to the character (match GTA 6 distance), no clipping through walls/cars.
6. **Water:** shoreline flicker fix, no ground glitching in water.
7. **Integration:** merge lanes, fix conflicts, run through the whole map, keep a list of breakages.
Done when: screenshots at spawn, downtown, bay, house, night, rain all look clean and smooth; fps >= 60 in all.
