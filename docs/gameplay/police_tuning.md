# Southline: wanted level and police tuning

Our own values, built on GTA V's structure (user decision, BIG_UPDATE_PLAN sections 12-13). API: `docs/v2/CONVENTIONS.md` 4a.

Code:
- `src/gameplay/wantedCore.js`: `SEV`, `HEAT_STEPS`, `SEARCH_R`, `CLEAR_TIME`, `GRACE`, `BOUNTY`, `BOUNTY_STAR6` (pure state machine).
- `src/gameplay/wantedSense.js`: witnesses, store cameras, traffic cameras (speed and red light).
- `src/gameplay/police.js`: `SIGHT`, `CAR_TARGET`, `FOOT_TARGET`, foot tactics, car tactics (PIT, box-in), roadblocks.
- `src/gameplay/police/arrest.js`: compliance window, taser, cuffing, pull-out, jail scene. `response.js`: helicopter, spikes, SWAT.

## 1. Stars only come from a known crime

| Crime (`type`) | Heat | Known when |
|---|---|---|
| assault, shoplift, vehicle_theft, carjack, weapon_display (aiming at an officer) | 1 | An officer sees it, a witness finishes the call, a camera's footage is pulled, or an alarm |
| evading (running from a 1-star stop), shooting, robbery, hit_pedestrian, cop_assault, taking a police car | 2 | Same; anything against police is always known |
| cop_shot, murder, cop_murder | 3 | Same |
| speeding, red_light | 0 | Traffic cameras only: a ticket for your own car, never stars |

- NPC 911 calls (`'witness'` from src/npc) only corroborate a player crime within 45 m and 75 s. A traffic accident,
  someone else's gunfire or police shooting never starts a chase (fix for the Nov 18 playtest).
- A car touching a pedestrian below about 20 km/h who stays standing is no crime.
- Heat thresholds for 1..6 stars: 1, 3, 7, 14, 24, 38. While a unit sees you, fighting back adds 0.12 heat/s.
- An old description on file can reopen a case on sight: warrant style, at most 2 stars.

## 2. Witnesses and cameras
- Up to 3 bystanders with a line of sight within 32 m. They run from the scene for 1-4 s, then stop and phone (5-8 s);
  no phone: they run 13-20 s to find one. Kill, intimidate (aim at them) or bribe (B, next to them) to stop the call.
- Store cameras record; the footage reaches the police only after the incident is reported (22-32 s, remote 6-9 s).
  Smash the recorder first and it never does.
- Traffic cameras: only at big signalized arterial crossings in the dense core, 1.3 km apart (none in suburbs, rural, Keys).
  Speed: limit + 22 km/h. Red light: entering the crossing while your approach shows red. While wanted, a known plate
  passing a camera moves the search area to it.

## 3. Sight and escape
| Parameter | Value |
|---|---|
| Foot officer cone / range | 110 deg, 60 m (8 m all-round awareness) |
| Car | 110 deg, 90 m (15 m awareness) |
| Helicopter | all-round, 240 m (x0.8 at night), blocked only by roofs, bridges, interiors |
| Night / water / under a bridge | range x0.65 / x0.6 / x0.7 |

- After 2.5 s unseen the pursuit becomes a search: the stars pulse, a circle (150/250/400/600/800/1000 m by star) is
  centred on the last known position and grows slowly while you are inside it.
- Escape progress needed (s): 14, 22, 34, 46, 60, 80. Rate: outside the circle 1x (hidden too: 1.25x), hidden inside
  0.55x, not matching the description (other car, mask, changed top) 0.4x.
- 100 s of search without a sighting scales the response down one star, then every 70 s.

## 4. Response by star
| Stars | Cars | Foot | Weapons / behavior | Extras |
|---|---|---|---|---|
| 1 | 1 | out of the car | Shout and a 6.5 s compliance window. Comply (H or stand still) = cuffed. Run = 2 stars. Taser 2.2-8.5 m. Guns only if you are armed. | Stopped in a car: officers walk to the door and pull you out |
| 2 | 2 | 2 | Same, more units; taser; armed suspects get shot | |
| 3 | 3 | 4 | Shoot on sight; shotguns, SMGs; cover behind the cruiser, flanking | PIT maneuvers, roadblocks with spike strips (60%), helicopter with searchlight (night) |
| 4 | 4 | 6 | Rifles, carbines, window shooting, heli marksman | SWAT van (4 armored officers), spikes always |
| 5 | 5 | 8 | All foot units are SWAT | 2 SWAT vans |
| 6 | 6 | 10 | Maximum aggression | TIDEWALL: second helicopter, 3 SWAT vans, $50,000 statewide bounty, phone alert |

Surrender: H on foot (any star). Officers hold fire at a surrendered, stunned or cuffed suspect and arrest him.
Arrest: cuffed (1.6 s), DETAINED card, then the booking scene (mugshot against the height board), 3 + 2 x peak stars hours
of holding (clock advances), 10% cash fee, weapons confiscated, release at the precinct.
Death: LIGHTS OUT card, hospital, up to $500 bill.
