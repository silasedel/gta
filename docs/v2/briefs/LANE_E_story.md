# Lane E: Police, crime, dialogue, jobs, heist
Owner of: `src/gameplay/**`, `src/ui/**` (HUD, dialogue, menus), missions, police AI, save game.
1. **Police:** GTA V wanted scale, star 6 = extreme manhunt with a huge bounty and aerial units. 1-2 stars are warrant-style (they only act if they clearly see and recognize you). Witnesses, speed/red-light cameras, police remember face, clothes (mask hides face), vehicle; vehicle swap to escape. Arrest or death; jail with break-out or stay.
2. **HUD corner** exactly as `docs/v2/plan/hud_corner_target.webp`. Keep the current title/menu. Remove the volleyball people. Fix "CALORA / CLICK TO PLAY" overlay.
3. **Dialogue wheel** with context: first meeting basic starters, later meetings refer to last time; NPC relationships and memory; shops buy and robbery (threaten, cash, alarm, police sent).
4. **Jobs:** car theft orders, taxi, bounty; random street events (chases/crashes, muggings). Money is the reward. Save game.
5. **Weapons:** pistols, shotguns, rifles, melee from `~/Downloads/Models/Weapons`; realistic violence like GTA 5.
6. **Radio:** several stations playing the songs from the user's music folder.
7. **Casino heist (last, only if time remains):** just the heist, with a few steps.
Done when: a full loop works (commit a crime, get chased, escape or get arrested, buy something, take a job) with HUD screenshots at 1-6 stars; 60 fps during a chase.
