# User feedback, Nov 17 late evening (played the Mac app build of 92a1a256)

Shots: shot_01_sw11th_median.webp (SW 11th St: grass median where an intersection should be), shot_02_brickell_swamp.webp (Brickell Ave swamp).

## Performance
1. Starts fine, then after a while drops to ~2 fps. Find what grows over time (leak / accumulation) and fix it. Frame rate must be smooth and reliable.
2. Buildings glitch: for a split second they disappear and come back when the detail level swaps. Keep the old version until the new one is ready (no full refresh).
3. Loading: the user prefers "everything loaded / installed" like big games (Mac app) plus streaming like Minecraft/Fortnite.

## NPCs
4. ~20 NPCs in a line walking along the road edge for no reason.
5. NPCs walk diagonally through walls; collide with buildings. Improve the basic AI/pathing (not insane AI yet).
6. Many of the user's generated NPCs were modeled with hands up, so they walk with arms out. Check each model and rotate the arms (~90 deg) down.
7. Animations still float/slide; make walking/animation much better.
8. Cast must fit the district: business people in Brickell / downtown, beach people at beaches, etc.
9. Ragdolls: no proper collisions or human joint limits / weight. Rig like real games (joint limits, masses).

## Cars
10. Tires still look weird, paint textures look bad, windows glitched, glass transparency not good.
11. Boat: jumping into a boat made the player fall. Use E to enter/drive (or steal) a boat like a car.
12. Cops must come from real places: in police cars, or out of police stations; never spawn from nowhere.

## World
13. Mangrove trees float in the sky, not attached to the ground.
14. Road crack lines look fake (not tar seal or cracks). Smudges and dots are good. Make the lines a stronger, more gravelly tar look.
15. State Road 934 x 10th Avenue: 10th Ave weirdly crosses it.
16. SR 934 x 9th Avenue: a big grass patch in the middle, no intersection. Misplaced bad curbs at the next intersection too.
17. Brickell -> downtown: another intersection issue.
18. Check every intersection on the map for these issues.
19. Brickell Ave swamp (shot_02): water edge glitches slightly, odd puddles, cars stopped because of it. Polish.
20. User likes: road edges, dirt, grass verges ("absolutely perfect").

## UI / systems
21. Top-right wanted-sense icons: always show them (reference: docs/v2/plan/hud_corner_target.webp). They mean what police recognize you by. Don't keep switching views; keep that UI.
22. Clothes recognition: once you commit a crime they know your clothes (on), until you change shirts (you can change shirts).
23. Wardrobe: the tropical camp shirt doesn't actually change. Make it work or remove wardrobe.
24. Dev mode: infinite money option.

## Models
25. Dogs look terrible: ask the user for a dog model instead of making one.

The user wants Claude to find issues itself, not wait for the user to spot them.

## Second message (Miami Ave, ~13:30 game time; screenshots shown in chat, not saved)
26. GPS: route by travel time (faster roads, traffic, fewer turns: straight then turn). Done in 9c70a816 (time-based A*, turn and signal costs); live traffic not yet included.
27. Yellow "LYRIC" gang-turf circles over the 3D map: removed (layer off by default, 9c70a816).
28. Miami Ave overpass/ramp: far too low, a ramp wall sits in the middle of the road, cars get stuck on it. Ramp and barrier walls look like cheap flat 2D layers: needs real concrete (form lines, stains, edge wear), real dirt/soil where they meet ground; road edges should roll into the ground naturally. Fix clearance and placement of ramps over streets.
29. ATM model is bad: use the user's ATM models from the library (~/Downloads/Models catalog).
30. Never let the player see NPCs spawn (spawn out of view, fade in only off-screen).
31. Shop interior (convenience store): a Wi-Fi router / black box floating on a shelf; a man floating in the air near the counter; skin too dark inside shops (interior lighting); counter has no detail; something clipping through the counter. People clip through each other.
32. Animations: kneeling people look like they are punching the ground; everything must look natural.
33. Police walk into walls; a man stuck on a curb edge; a car stuck on the overpass.
34. User's overall message: walk through the game yourself, think it through, and make everything look and behave like it would in real life (smooth roads, real materials, real behavior). Don't wait for the user to find issues.
35. Car layers still look weird (user, again). Needs a real look next week (paint/clear-coat layers, decals, LOD).
36. Gang system removed by default (6d6cbba5, ?gangs=1 restores). Two duplicate map labels were the gang turf labels.
37. Car exit: real step-out animation (reverse of the enter swing). Quick fix 0.14 s blend + face out of the door is in.
38. Beach in the rain (user, County Road 846 beach): 4-5 sunbathers were the same woman model and pose; sunbathers on towels while it rains; people lying look like they are flying; the lifeguard should act like a lifeguard at the tower. Sent to r3-people.
