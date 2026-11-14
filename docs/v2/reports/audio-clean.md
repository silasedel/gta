# Audio clean-up: stray voices, loudness and mix (audio-clean track)

## 1. Which sound the supercar uses
- `src/core/audio.js`: class `super` maps to engine `v12` (`CLASS_ENGINE`), so the catalog "Saetta V12" uses it. Hero and catalog cars that declare `engine: 'v10'` (the Fulmine) use the `v10` set.
- Real loops: `vehicles/v12_{idle,mid,high}.ogg` (freesound 112075, a phone video from a dealer lot) and `vehicles/v10_{idle,mid,high}.ogg` (Wikimedia Commons, a BMW M5 YouTube video). The legacy `engines/v10_*.wav` loops are only a fallback.

## 2. Detector
All tools live in `.v2-tmp/audio-clean/` (a Python venv plus scripts).
- **Pass 1 (`scan.py`), every file:**
  - silero-vad speech segments and max probability
  - webrtcvad (mode 3)
  - a spectral check on the silero segments: share of energy in the 300–3400 Hz formant band, syllabic 2–8 Hz envelope modulation, and formant flux
  - whisper small.en: on the whole file for every non-voice file, and on the segments for expected voices
- **webrtcvad is not usable here.** It flags 97–100% of frames on every engine loop, so it is recorded but never votes.
- **Pass 2 (`deep.py`), every non-voice file:** voices buried under a steady engine. Spectral subtraction against the per-bin median removes the steady engine, then silero and whisper run on both the raw and the suppressed signal.
  - A hit needs real words (filtered for noise hallucinations such as "Thank you", "BOOM" or "AAAA") **and** a silero vote.
  - Positive control: the old `v12_idle` loop is caught. The old v12 loop passes pass 1, which is how the voice got in originally.
- **Expected voices** are not hits: `voices/*`, `combat/{death,pain,grunt,scream}_*` and `bed_crowd`.
  - 185 files, 84 of them clearly voiced. All are intended.
  - Peds only vocalize on events: greet, flee or shove.

## 3. Flagged files and what was done

| File | Evidence (before) | Fix |
|---|---|---|
| `vehicles/v12_idle.ogg` (**the supercar idle**) | Bystander under the engine. On the source at 12.5–15 s, whisper hears "Yeah, it's nice" (no_speech 0.14). On the loop, the deep pass hears "Yeah, one of the nights" with suppressed silero at 0.84. The loop's pitch-flattening smeared it into the "mumble / moan" the user heard every 4 s. | Re-cut from the same recording at 2.7–7.45 s. That stretch is speech-free on every detector. Pitch-flattened to the old idle pitch (54.75 Hz tracked line, so the rpm metadata stays valid), EQ-matched to the old loop's spectrum (centroid 726 → 710 Hz), 4.0 s seamless crossfade loop. Deep pass afterward: no words. |
| `combat/flyby_01..03.ogg` | A narrator's slate: "The crack of bullets passing overhead, and the report…" (silero 1.0, whisper no_speech 0.04) | Re-cut from the same craigsmith recording after the slate, at 7.05, 8.77 and 11.33 s |
| `combat/flyby_04.ogg` | A slate: "Here's the sound of the bullets in flight…" | Re-cut at 7.59 s, after the slate |
| `ambience/distant_horn_06`, `ambience/ship_horn_05`, `vehicles/ignition_02` | Low-confidence words, only on the suppressed signal ("Oh no", "I love you", "Come on"). `ignition_02`'s source shows no speech in context. | Removed from `index.json` (each key still has 3 to 5 other variants). The files stay on disk. |
| `v10_*` (M5) | Clean on both passes. The source's whisper output is only engine hallucinations ("AAAA", "RRRR"). | No change |

Other pass-1 hits were reviewed as noise, not voices:
- whisper writing out the sound itself: "BOOM", "Woof", "Beeping", "Chirp"
- crane squeals (silero 0.5–0.77 with no words)
- a knife swing ("Thanks.", no_speech 0.51)

**Before → after:**
- Deep pass, 879 non-voice files: 7 hits → 0. The after check re-ran on every changed file; the unchanged files were already clean in the before pass.
- Pass-1 hits with real narration: 4 → 0.
- Rendered mixes: 30 s drive and 30 s drive-by of both the v10 and v12 supercars, through the real `audio.js` in `OfflineAudioContext`. Deep detector: 0 hits.
- Note: the old drive mix also scored 0. The engine under throttle masks the idle voice, which is why the file-level deep pass is the authoritative check.

## 4. Loudness normalization (every bank asset)
- Done non-destructively: no re-encode. Each file gets an `index.json` `norm` gain, plus the measured `lufs`, the key's `target` and its `measure`. `gain` was reset to 1, and the old value is kept as `gain_prev`.
- **Measures:**
  - Loops: integrated LUFS.
  - One-shots: the loudest 100 ms (K-weighted).
- **Peak guard:** +3 dBFS. Playback is float and the master limiter follows.
- **Script:** `.v2-tmp/audio-clean/scripts/normalize.py`.
- **Targets:** chosen near each group's previous median, so the overall balance stays and only the spread goes away.

| Group | Target |
|---|---|
| Engine loops (`*_idle/low/mid/high`), squeal and skid | −20 LUFS integrated |
| Sirens | −19 |
| Ambience beds, venue beds | −23 LUFS integrated |
| Ambience one-shots (birds, dogs, cranes) / distant horns, ships, aircraft, thunder | −19 / −19 |
| Guns, explosions, distant gunfire | −10 (100 ms max) |
| Impacts (punch, kick, bat, knife, bullet impacts), flyby, ricochet | −16 |
| Pain, death, grunt and scream vocals | −14 |
| Reloads, casings, dry fire, weapon switch | −22 |
| Footsteps / lands and bodyfalls / cloth | −23 / −20 / −28 |
| Ped voices | −16 |
| Crashes and glass / horns / pops, shifts and blow-off / other vehicle one-shots | −15 / −17 / −17 / −17 |
| Venue one-shots | −17 |

- **Before:** effective levels within a category spread up to 36 dB (combat −40.6 to −4.6). Footsteps p10–p90 spanned 7.4 dB.
- **After:** every file is within 0.5 dB of its target, except 15 very short, peaky keys. For example, slaps and some impacts fall 1–6 dB short under the peak guard.
- The engine code now applies `norm` to engine layers, beds, venue beds and sirens. Before, it applied only to one-shots.

## 5. Mix audit of `src/core/audio.js` (findings → fixes)
1. **Hidden auto make-up gain.** Web Audio `DynamicsCompressor` adds automatic make-up gain: about +6 dB on the master glue compressor and about +8 dB on the vehicle bus. Quiet input got boosted and loud input squashed, so everything sounded flat and too loud. The player engine ran at −6 LUFS, with crashes no louder than driving.
   - Fix: the scene gains were rebuilt (`MIXK`):
     - player engine 1.25 → 0.115
     - traffic engines 1.1 → 0.2, with super, sports and muscle cars ×2.2
     - vehicle make-up 1.4 → 0.9
     - beds 0.32 → 0.6
     - crash and glass ×1.8
   - The master limiter threshold moved −2 → −4, because its make-up let peaks reach −0.2 dBTP.
2. **Traffic louder than your own supercar.** AI engines sat at full level inside 5 m. Fixed with a 3.5 m reference distance and lower gain.
3. **Ambience competed with the engine while driving.** Ambience now ducks 6 dB in a vehicle.
4. **Settings sliders were broken.**
   - `src/ui/settings/store.js` calls `audio.setBusVolume(bus, v)`, which did not exist, so only Master worked.
   - Added `setBusVolume` / `setBus` for sfx, vehicles, ambience, music, radio, voice and ui. The engine also reads `game.settings.audio` every frame.
   - New dialogue bus: ped voices. New radio bus: player and AI car radios. Venue, beach and party music stays on the music bus.
   - Reverb and echo sends now follow their bus volume, so effects at 0 also mute their echo.
   - The synth horn fallback no longer bypasses the buses.
5. **"Speaker setup" and "Dynamic range" were ignored.** Now:
   - Mono folds the output to one channel.
   - Speakers and TV use equal-power panning; headphones keep HRTF.
   - Medium and Night apply stronger master compression with make-up.
6. **Suspend and resume.**
   - The context now starts on pointerdown and touchstart too.
   - It suspends in a background tab, unless "mute when in the background" is off.
   - It resumes when the tab is visible again.
7. **Checked and OK:**
   - The voice caps (4 AI engines, 2 ped voices per second, 3 NPC shots per 0.7 s).
   - Bed, music and siren maps are keyed, so there are no stacked duplicates.
   - Every loop has a stop path (engine voices, beds after 6 s idle, music, sirens).
   - No clipping in any render.

## 6. Scene renders (before → after)
- Rendered through the real engine. `src/audio/mixtest.html` runs `audio.js` with a mock game in an `OfflineAudioContext`, stepped at 30 Hz, seeded, with master at the default 90%.
- Runner: `.v2-tmp/audio-clean/scripts/mixrun.mjs` (uses `tools/v2/browser.mjs`). Measurement: `mixstats.py` (pyloudnorm).

| Scene | Before LUFS | Before short-term max | Before true peak | After LUFS | After short-term max | After momentary max | After true peak |
|---|---|---|---|---|---|---|---|
| Drive supercar (v10) | −6.3 | −5.6 | −1.1 | −13.9 | −12.5 | −11.9 | −3.5 |
| Drive supercar (v12) | −6.8 | −6.2 | −1.2 | −14.1 | −12.6 | −11.9 | −3.9 |
| Crash at 120 km/h | −6.5 | −5.9 | −1.3 | −16.2 | −13.2 | −10.0 | −1.6 |
| Standing downtown with traffic | −11.9 | −8.7 | −1.5 | −20.4 | −17.7 | −16.0 | −5.5 |
| Walking (residential) | −16.6 | −12.8 | −4.6 | −18.5 | −16.8 | −14.5 | −6.2 |
| Beach | −24.1 | −22.1 | −9.6 | −21.6 | −16.5 | −11.4 | −4.0 |
| Drive-by, supercar at 200 km/h (v10) | −20.6 | −13.7 | −1.6 | −21.7 | −19.8 | −15.7 | −6.3 |

**What changed:**
- Before, the scenes spanned 18 LU, from −6 to −24, and driving and crashes were brick-walled near 0 dBFS.
- Now:
  - driving sits about −14
  - on foot, scenes sit between −18.5 and −21.5
  - the crash is about 2 LU above driving at its loudest moment, after the engine cuts
  - all true peaks are at or below −1.6 dBTP, with no clipped samples
- Before figures were single unseeded runs. The harness is now seeded; ambient one-shots vary about ±1.5 LU between seeds.

## 7. Files
- **Changed:**
  - `src/core/audio.js`
  - `public/assets/audio/*/index.json`
  - `public/assets/audio/vehicles/v12_idle.ogg`
  - `public/assets/audio/combat/flyby_01..04.ogg`
  - `CREDITS.md` (audio part)
- **New:** `src/audio/mixtest.{html,js}` (offline mix test page).
- **Backups** of every original: `.v2-tmp/audio-clean/backup/`. That includes a stale duplicate folder, `voices/voices.tmp/`, moved out of `public/` there.

## 8. v2.1: radio with real songs, club music, layered crashes
- **Stations** (`public/assets/audio/music/`): 26 songs by Kevin MacLeod (incompetech.com), all **CC BY 4.0** and credited one by one in `CREDITS.md`. No NC or ND licenses, and no DJ voices.
  - Each song is normalized to −16 LUFS (true peak ≤ −1.5 dBFS) and encoded as Ogg Opus 96 kbps stereo. 76 MB in all.
  - Songs stream through `<audio>` elements and are never fully decoded in memory.

- **Brisa 98.4** (Latin and tropical): "Samba Isobel" (4:10), "Bossa Antigua" (4:43), "Pamgaea" (2:48), "Latin Industries" (3:20), "Tango de Manzana" (3:02), "Island Meet and Greet" (3:36), "Equatorial Complex" (4:00), "Mariachi Snooze" (0:40)
- **Neon Coast 101.9** (Synthwave and retro electro): "Voxel Revolution" (2:09), "Cyborg Ninja" (3:00), "Stringed Disco" (2:54), "Disco Medusae" (3:41), "Raving Energy" (4:27), "Hyperfun" (3:53), "Ouroboros" (2:41), "Chase Pulse" (1:56), "Electro Sketch" (3:07)
- **Low Tide 89.3** (Chill beats and funk): "Werq" (2:42), "Funkorama" (3:21), "Bass Walker" (2:41), "Backed Vibes Clean" (3:48), "Hep Cats" (4:10), "Chill Wave" (4:00), "Dream Culture" (3:34), "Groove Grove" (3:25), "Cool Vibes" (3:38)

**Behavior (`src/audio/radio.js` plus `musicSource` in `src/core/audio.js`):**
- Every station is a live broadcast on a wall clock. Its playlist runs whether you listen or not, so switching away and back lands where the station is now. Car radios, clubs and passing cars on the same station are in sync.
- `,` and `.` cycle the stations and Off in any vehicle, boats included, because the check is `player.state.inVehicle`.
- The station name and song title show via the HUD notify, and again on every song change.
- The player radio goes on the Radio bus at 0.8. A badly damaged car (health under 35%) low-passes it to 2.2 kHz.
- AI cars with a radio (28%) play one of the real stations, positional and with Doppler.
- Clubs and bars (`VENUE_RE`), the daytime beach boombox, the night house party and store music now map onto the real stations: tropical and reggaeton → Brisa, house → Neon Coast, hip-hop and ambient → Low Tide.
  - Club music keeps the existing staging: positional; outside it is low-passed (180–700 Hz falling with distance) with a +9 dB bass shelf so the bass carries at night; inside it plays full range.
  - The gangs-business `club.open` state is not read yet. Venues follow the existing night and type rule.
- **Fallback:** the procedural stations are still used if the music index fails to load, and in `OfflineAudioContext` renders, which cannot stream media elements.

**Crashes:** layered by impact strength k:
- recorded crunch (light, medium or heavy)
- a synth body thump (95 → 32 Hz) plus a brown-noise low burst, scaling with k²
- a second, pitched-down metal layer above k 0.5
- glass above k 0.45
- falling-debris clunks 0.2–0.3 s later above k 0.3

Offline render of the 120 km/h crash:
- low band (< 120 Hz) up 1.5 dB
- crash window −13.2 LUFS momentary, vs −13.9 before the layering
- true peak −1.7 dBTP, no clipping
- the drive mix is unchanged at −13.9 LUFS

**Not done:** boats (budget).

In-game check: see section 9.
## 9. In-game check (full game, `?mute`, headless; `.v2-tmp/audio-clean/scripts/ingame3.mjs`)
- **Context:** the AudioContext runs, and `game.audio.stations` lists Brisa 98.4, Neon Coast 101.9 and Low Tide 89.3.
- **Station 0 (Brisa):** streaming "Pamgaea" at 147.4 s. Two nearby clubs and the beach boombox (also mapped to Brisa) were at exactly 147.4 s too, so the live clock keeps them in sync.
  - Radio bus RMS was −21.8 dBFS.
- **Switch to Neon Coast:** it joined live mid-song: "Chase Pulse" at 40.3 s.
  - Radio bus RMS was −29.5 dBFS (a quieter passage); the full mix was −21.3.
- **Radio slider at 0:** the radio bus fell to −120 dBFS.
- **Console:** no audio errors. The only error was an unrelated `MeshPhysicalMaterial` shader error (`clearcoatNormal`) from another track.

## 10. Club DJ (owner-licensed Epidemic Sound tracks)

**Library and license handling**
- `tools/v2/sync-club-songs.mjs` copies `Club Song N - Tag:Tag[:Tag].mp3` and `ES_<Title> - <Artist>.mp3` from `club_licensed/originals/` (where the owner keeps them) into the git-ignored `public/assets/audio/music/club_licensed/`. It gives each copy a short file name, then runs the analysis.
- The set is exactly the 11 "Club Song" files. `ES_Caught Your Attention` is not in Downloads and is not used. The analyzer can tag an `ES_` file by ear-like analysis if one is added later.
- `CREDITS.md` credits each one as "Epidemic Sound, licensed by the project owner, local build only".
- Without that folder (a fresh clone), `index.json` 404s, `clubdj.available` stays false, and clubs and bars keep the CC BY stations.

**Offline analysis** (`tools/v2/club_analyze.py`; numpy, scipy and ffmpeg only)
- **Tempo:** autocorrelation of the onset envelope with a 124 BPM prior.
- **Beat grid:** a fine period and phase search, then a robust least-squares fit to kick onsets. The phase is refined on 40–160 Hz kick attacks, plus a per-phrase local phase correction (`phaseFix`).
- **Structure:**
  - downbeat: the beat-in-bar where timbre changes and kicks concentrate
  - 8-bar phrase grid: the bar offset where bar-level novelty peaks
- **Per-bar curves:** energy and bass.
- **Cue points:**
  - cue-in: the first phrase with a kick and real energy, so beatless or cheesy intros are skipped
  - outro: after the last strong phrase
  - transition window: the 8 bars before the outro
- **Also:** drops, the best 16-bar section, key (Krumhansl, plus Camelot), loudness (EBU R128) and the gain to −14 LUFS.
- **Tags:** parsed from the file name, 2 or 3 per track.

| Track (tags) | BPM | Grid residual | First downbeat | First phrase | Cue-in | Transition window | Outro | Key | Drops (first 3) | Gain to −14 LUFS |
|---|---|---|---|---|---|---|---|---|---|---|
| Club Song 1 (Fast, Dark) | 130.00 | 4.5 ms | 0.03 s | 0.03 s | 14.8 s | 118.2–133.0 s | 133.0 s | D minor (7A) | 14.8, 44.3, 103.4 | -4.8 dB |
| Club Song 2 (Dark, Grimey) | 130.00 | 4.2 ms | 0.21 s | 2.05 s | 2.1 s | 149.7–164.5 s | 164.5 s | A minor (8A) | 46.4, 120.2, 135.0 | -5.7 dB |
| Club Song 3 (Deep, Euphoric) | 130.00 | 4.8 ms | 0.10 s | 0.10 s | 29.6 s | 177.3–192.1 s | 192.1 s | A minor (8A) | 14.9, 29.6, 88.7 | -4.5 dB |
| Club Song 4 (Groovy, Deep) | 128.00 | 4.7 ms | 0.02 s | 1.89 s | 16.9 s | 121.9–136.9 s | 136.9 s | A# major (6B) | 16.9, 61.9, 106.9 | -3.4 dB |
| Club Song 5 (Deep, Modern) | 126.00 | 4.2 ms | 0.02 s | 0.02 s | 0.0 s | 152.4–167.6 s | 167.6 s | B minor (10A) | — | -6.1 dB |
| Club Song 6 (Funky, Fun) | 128.00 | 4.0 ms | 0.00 s | 5.63 s | 5.6 s | 125.6–140.6 s | 140.6 s | C# minor (12A) | 35.6, 110.6 | -6.0 dB |
| Club Song 7 (Intense, Deep, Electric) | 138.00 | 4.4 ms | 1.73 s | 5.21 s | 5.2 s | 158.3–172.2 s | 172.2 s | B minor (10A) | 130.4 | -8.1 dB |
| Club Song 8 (Deep, Simple) | 128.00 | 3.9 ms | 0.01 s | 1.88 s | 16.9 s | 166.9–181.9 s | 181.9 s | A minor (8A) | 16.9, 61.9, 121.9 | -6.2 dB |
| Club Song 9 (Simple, Disco) | 128.00 | 7.0 ms | 0.51 s | 0.51 s | 0.5 s | 120.5–135.5 s | 135.5 s | A minor (8A) | 30.5, 105.5 | -5.1 dB |
| Club Song 10 (Dark, Edm) | 128.00 | 4.1 ms | 0.04 s | 13.17 s | 13.2 s | 373.2–388.2 s | 388.2 s | F major (7B) | 43.2, 118.2, 193.2 | -5.2 dB |
| Club Song 11 (Hard, Dubstep) | 127.00 | 5.3 ms | 1.38 s | 1.38 s | 1.4 s | 182.8–197.9 s | 197.9 s | A minor (8A) | 31.6, 61.9, 77.0 | -6.0 dB |

**Mixing engine** (`src/audio/clubdj.js`)
- **Track selection:** mood by hour, scoring tags, energy and tempo:
  - 18–22: warm (Groovy, Funky, Disco)
  - 22–24: Deep, Modern, Euphoric
  - 00–03: Dark, Fast, Grimey, Intense, EDM, Hard, Dubstep
  - 03–06: Deep, Simple
  - Crowd level raises the target energy.
  - Also scored: Camelot neighbors, and no recent repeats.
- **Transitions:**
  - start on the outgoing track's phrase-aligned transition window
  - the incoming track enters on its cue-in downbeat
  - tempo is matched by playbackRate within ±8% (a light pitch shift; no phase vocoder in this pass)
  - beats are phase-locked using the analyzed grids plus the local phase corrections
- **32-beat crossfade:**
  - the incoming track fades up with its bass cut by 26 dB
  - on the middle downbeat the basses swap
  - the outgoing track fades with a high-pass sweep from 18 to 900 Hz
  - a dotted-eighth echo-out on its last bar
- **Output:** −6 dB of headroom and a safety limiter.
- **Shared mix:**
  - one shared mix for every club and bar (`venue*` music sources tap one output), so everyone hears the same set
  - the set joins mid-flow on a phrase when you arrive
  - it stops and frees its decoded audio 30 s after the last listener leaves
- **Velvet Undertow:** once owned it only plays while `game.club.open`; unowned, it runs as a normal club.
- **Venue staging is unchanged:** positional; outside, low-passed with a bass shelf; full inside.
- **Beat clock for cutscenes (`game.clubdj`):**
  - `beatAt(t)` returns beat, beatInBar, bar, phase, isDownbeat, time and bpm
  - `nextDownbeat(t)` returns a ctx time
  - also `bpm`, `current`, `start()` and `available`
- **Job Passed stinger:** `passed.v2.js` ducks the radio and music buses. The DJ mix plays through the music bus, so it ducks the same way and needs no change to the lead's file.

**Offline transition render** (`src/audio/clubdj_test.html`; WAVs in `.v2-tmp/audio-clean/dj/`)
- Club Song 1 (130 BPM) into Club Song 6 (128 BPM, played at ×1.0156).
- The transition starts 16 s into the render: 32 beats, bass swap at 23.38 s, done at 30.77 s.
- Each deck was also rendered alone to check alignment:
  - Kick-onset cross-correlation between the decks over the overlap: **8.7 ms** lag. Before the kick-based phase refinement and per-phrase correction it was −46 ms, then −29 ms.
  - Under 10 ms, the kicks land together.
- Mix peak -2.54 dBFS, 0 clipped samples.

**In-game check (Velvet Undertow)**
- **Run 1 (full game, `?mute`):**
  - The player was teleported inside the club (`interiors` "Velvet Undertow", nightclub; `game.club` unowned, so it plays).
  - Both nearby venues had music sources, but on the CC BY stations, not the DJ. The first venue source was created before the club library finished loading, and it was then kept.
  - Fixed: a venue source now switches to the DJ as soon as the library is ready, and the DJ instance is created on the first audio frame.
- **Later runs:**
  - One reload was caused by my own hot edit.
  - Then `src/player/nico/index.js` (another track) returned HTTP 500, so the game did not boot.
  - **The final in-game DJ confirmation is still open.** Re-run `node .v2-tmp/audio-clean/scripts/ingame_club.mjs` once that file builds again. It prints `game.clubdj.debug`, `bpm`, `beatAt()`, `nextDownbeat()` and the music meter inside the club.

## 11. Playtest fixes
- **Surf:** −6 dB.
  - Beach beds: `bed_beach` 1 → 0.5, `bed_wind_coast` 0.35 → 0.22; night and open-water mixes likewise.
  - The synth shore wash went 0.35 → 0.17, with a squared fall-off inland and ×0.4 in a vehicle, on top of the existing 6 dB ambience duck in cars.
- **No chiptune anywhere:** the procedural (synth) station fallback is disabled. Radio, venue, party, boombox and menu music now play only the real CC BY songs or the club DJ, and stay silent until those load.
- **Sync source:** `tools/v2/sync-club-songs.mjs` now reads the originals from `public/assets/audio/music/club_licensed/originals/`, not Downloads. `--from DIR` overrides it.
