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

## 8. Not done (budget)
None of the v2.1 requests were started:
- radio stations with real CC0/CC-BY songs
- club music
- per-model engine work beyond the mix
- boats
- layered crash debris

The current engine, crash, squeal and Doppler systems were kept and remixed only.
