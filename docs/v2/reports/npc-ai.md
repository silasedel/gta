# npc-ai report (Nov 13, about 18:30 MST)

## What is wired now
- `src/npc/people.v2.js` (V2 module, order 120) creates `game.people`. `src/npc/peds.js` calls its hooks guarded (`game.people?.dress?.()` etc.), so the game runs as v1 if the module fails.
- On load it unlocks the whole character library (`library.js`, 129 bodies, 120 loadable, about 5-18 s in the background).
- Every near (skinned) pedestrian gets, on activation: an identity chosen among people who would really be out at this place and hour (`mind.js personForPlace`, picked to fit the body's heritage), a look fitted to the body (`look.js makeLook` + `applyLook`: palette, height, build, hats, glasses, headphones, neck items, bags, baby carrier, cane), traits turned into behavior parameters (`mind.js personParams`), a daily mood and a walking speed from the look's gait. Pooled characters are stripped of their old accessories before reuse; disposed ones free their prop geometry.
- Far tier: an instanced crowd (`crowd.js`, one draw call + one for contact shadows) walks the sidewalk graph from 30 m to 185 m, 170 people at full density, scaled by the district/hour street density and by fps. Same identity and look generator, so the audit covers them.
- Uniqueness audit: `game.people.audit()` checks the realized signature of every person (body, scale, the actual palette colors read back from the material, accessories, carry, build). `sigList()` dumps them.

## Behavior from traits (peds.js changes)
- Walk speed (gait), pause rate to look at things (curiosity), look distance and hold, greeting chance (sociability x kindness x mood), phone idles (phone addiction), waiting at corners before crossing (patience) vs. cutting across mid-block (impatience + courage), bump response (shove / argue / flee / apologize / ignore from courage, temper, kindness).
- Incidents: `panic()` asks `game.people.react()`, which picks flee / freeze / cower / film / call 911 / fight back (shots, hits) or help / crowd / film / call / ignore (crashes) from courage, nerve, curiosity, honesty, kindness and distance. New ped states: `freeze` (hands up, then run), `call` (phone, turned away; at the end emits `witness`), `approach` + `watch` (walk to a crash, kneel to help or film / talk).
- Weapon out on foot: people within 14 m who can see it react by courage (flee, freeze, call, ignore, fight).
- Honking: KeyH in a vehicle (or a `honk` / `horn` event from another module) makes people within 16 m look, hot-tempered ones stop and argue, nervous ones jump away, crossers hurry; they answer with lines.
- Slow car next to people: a comment on the car (praise or insult by the car's state and the person's traits).
- Population: `targetCount()` uses `game.people.densityFor()` (share of sampled residents/workers/visitors whose schedule puts them on the street here now) instead of the fixed hour table.

## Talking
- `src/npc/lines.js`: 471 original lines, 8 voice groups (warm, kreyol, tourist, elder Cuban, gruff, anxious, chill, pro, slick) x 11 situations (greet, bumped, honked, weapon, crash, gunfire, rain, heat, car praise, car insult, chat) + 12 lines for 911 calls by topic. English with Miami Spanish and Haitian Kreyol flavor. Picker avoids each person's last 6 lines and the street's last 80.
- Shown as speech bubbles of our own (DOM layer projected over the speaker's head, max 5, 32 m), and emitted as `pedLine` events for audio.

## Verified in the game (tests: `node src/npc/tests/people_game.mjs <soakSeconds>`, results `docs/v2/shots/npc-ai/people_game_results_*.json`)
- Boot: `game.people` present, no failed V2 modules.
- Uniqueness: 0 duplicate signatures among 1,996 people spawned in one page session (28 near + 1,968 crowd), 0 among 653 and 0 among 778 in other sessions, `dupInView` 0. The page was reloaded by other agents' hot reloads every few minutes, so no single continuous 10-minute soak exists yet.
- Reactions to one shot near 30 spawned people (24 distinct after spawnAt recycling): low courage mostly flee / cower / freeze, high courage includes film, call 911 and one fighting back (exact counts in the json).
- Witness: 4-5 `witness` events per shot, reliability 0.55-0.85, description limited to what they saw.
- Schedule, Downtown: sampled street share 0.06 at 4 AM (only early exercisers), 0.55 at 8:30 (commuters, guards), 0.61 at 1 PM (lunch), 0.14 at 1 AM (nightlife); live crowd 16 / 144 / 37 / 38.
- People in the camera view: 60-75 typical, 135 once on Ocean Drive; the 150+ in view target is not met yet.
- Screenshots (looked at): `docs/v2/shots/npc-ai/sidewalk_downtown.png` shows a near woman with a purse and the crowd tier along both sidewalks; glasses sit a bit high on her head. `beach_noon.png` shows a nearly empty beach: it was taken before the crowd-tier beach loungers (lie / sit / talk / volley on the sand, front-of-camera biased spawns) were added, and those are not seen yet. The last run was cut by a hot reload and the 235 s watchdog.
- Frame time with 24 near + 95-195 crowd: 60 fps (avg 16.6 ms, p95 16.8 ms) when the machine load was 6-7; 45-51 fps when load was 8-12 (unreliable). About 580-600 draw calls, 1.0-1.3 M triangles in the whole scene.

## Not done / known gaps
- Pushed or led props (stroller, mobility scooter, walker, skateboard, cooler, dog from `look.carry`) are not placed in the world; v1 dog walkers still work.
- No promotion of a crowd walker into a full character (the two tiers are separate; walkers vanish under 30 m).
- Tier D street activities, benches / sit API, dialogue wheel, memory: not started.
- Witness description has no player clothing (no API for the player's outfit).
- Crash, honk and weapon-out reactions are built but were not exercised in a test.

## Shared APIs (for the lead to list)
- `game.people`: `audit()`, `sigList()`, `roster()`, `reactStats()`, `witnesses()`, `lines()`, `say(ped, situation)`, `honk(pos)`, `densityFor(x, z)`, `sample(zone, district, hour)`, `inView()`, `crowd`.
- Events emitted: `witness` { what, where, description, reliability, witness, witnessId }, `pedLine` { ped, text, situation, voice, name }. Listened: `honk`, `horn`, `shot`, `crash`.
- `game.peds._nav` exposes the sidewalk navigator for the crowd tier.

## Pass 2 (Nov 13, about 18:50 MST)
- **Talking (`src/npc/talk.js`)**: walk up to anyone in the near tier, `U  Talk to <name>` prompt, camera eases to a two-shot (`game.cameraOverride`), wheel with keys 1-7. Replies are composed from 124 core lines (topic x warm/neutral/cold) plus voice-group lead-ins and tags and hour lead-ins; memory per person (talks, rude, warm) changes the tier. Consequences: insult a hothead and they swing (fight state), timid people flee; threats make timid honest people call 911 (emits `witness` with what 'threats'); directions name a real nearby street via `city.streetNameAt` and the person turns to point. Seen: two conversations (screenshots) and 20 conversations in a row with 20 distinct replies. Crowd-tier walkers cannot be talked to (they exist only beyond 30 m); bar staff can be talked to once the bar exists.
- Fixed in the composer after the test: a lead-in ("It's late, but ") now continues in lower case.
- **Beach**: crowd-tier people on the sand (lie, lie on front, sit, lounge, stand, talk, phone, volley, sip) on towels (up to 60), plus waterline walkers that turn back at the water; heights from the terrain. Seen in `beach_noon.png`: people on the sand but sparse and far; needs more people within 15-40 m.
- **Low Tide Lola's**: `populateBar()` fills staff and seated/standing patron anchors when the player is within 150 m; not seen, because in this world the bar was not placed (layout lot crowded, `game.keysBar` missing).
- **Look fixes**: glasses at the eye line from the head bone, bags hang clear of the hip. Not re-checked close up.
- Body vs job: identity is now picked to fit the body's clothes (suits for office jobs, work wear for trades). After the conversation test, a street cleaner wore a suit and hard hat.
- Incident: a broken `look.js` (a comment swallowed a brace) was on disk for about one minute at 18:36 before it was fixed.
- Tests: `node src/npc/tests/people_pass2.mjs` (`ONLY_PLACES=1` for the beach and bar only), results in `docs/v2/shots/npc-ai/pass2_results.json`.
