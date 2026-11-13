# Claude GTA (Port Solana)

**Play in your browser:** https://silasedel.github.io/gta/

An open-world, third-person crime and driving sandbox that runs in the browser. It's set on **real-scale Miami**, built from OpenStreetMap data, and every character, car, brand, UI element and story beat in it is original. It was built with Claude Code by a team of parallel AI agents.

> **Disclaimer:** this is an unofficial fan project. It is not affiliated with, endorsed by, or connected to Rockstar Games, Take-Two Interactive or Anthropic. "GTA" is used only to describe the genre. The project contains none of Rockstar's assets, characters, logos, music, map or UI: the setting is real-world Miami geography and everything else is original.

## Controls
| Key | Action |
|---|---|
| Click / Enter | Start, capture the mouse |
| WASD, Mouse | Move, look |
| Shift / Alt | Sprint / walk |
| Space | Jump · handbrake while driving · swim up |
| C or Ctrl | Dive while swimming |
| F | Enter / exit / carjack a vehicle |
| Left mouse / Right mouse | Punch or shoot / aim (sniper scope) |
| 1–7, Q, mouse wheel, hold Tab | Switch weapon / weapon wheel |
| R | Reload |
| E / G (in stores) | Buy / steal |
| H | Horn (siren in police cars) |
| , and . (in a car) | Change radio station |
| ↑ | Phone |
| Esc / P | Pause menu: map, waypoints, settings |
| F3 | Performance overlay |

Add `?mute` to the URL to start muted, or `?map=old` for the original small test city.

## Features
- **The city:** real-scale Miami covering about 8.2 × 5.3 km.
  - Built from OpenStreetMap: 7,000+ buildings at real heights, 431 km of roads with elevated causeways and ramps.
  - Streamed in 200 m tiles with LOD and a day/night cycle.
  - 2,600+ enterable stores across 25 types, with opening hours and buy, steal and rob mechanics.
- **Cars:** 52 original models from 15 made-up brands, with per-model handling, damage, traffic AI on the real road graph, and cars that flood and sink.
- **People:** 129 distinct people generated in Blender from CC0 MakeHuman assets.
  - Behaviour fits the area and time of day: beach groups, business districts, nightlife.
  - Realistic ragdolls.
- **Combat and police:**
  - 13 weapons with per-limb hit detection.
  - Wanted levels with witnesses, police chases, roadblocks and arrests.
  - Swimming, diving and drowning.
- **Audio:**
  - Real recorded engines, footsteps on each surface, weapons and ambience.
  - Indoor and outdoor reverb, Doppler.
  - Six original radio stations generated in code.

## Run locally
```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # production build in dist/
```

## Credits
Map data © OpenStreetMap contributors (ODbL). Third-party assets are CC0, public domain or CC-BY/CC-BY-SA, and each source and licence is listed in [CREDITS.md](CREDITS.md).
