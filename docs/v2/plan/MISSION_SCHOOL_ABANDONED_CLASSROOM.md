# Mission: "The Abandoned Classroom" (user design, Nov 16) — stage 2 builds the place, stage 4 builds the mission

## The site (stage 1, done)
- `layout.json` setpiece **`school`** at about (457, -1354) in Edgewater, on a cleared ~8,000 m2 block, entrance facing
  its nearest street (NE 1st Ave), **179 m from the Southline PD Edgewater Substation (308, -1452)**: police are always
  close. Lot ring and heading are in the setpiece record.

## The building (stage 2)
- Use the user's downloaded school models: normal school exterior, normal classrooms, and ONE abandoned classroom
  (dusty, broken furniture, papers on the floor, boarded or stained windows inside) — all in `Models/` (look for
  "school" / "classroom" / "abandoned classroom" in `Models/catalog.csv` after the latest intake).
- A school with hallways, many classrooms along the outer walls (each with exterior windows), a principal's office,
  restrooms, a front office / entrance with doors that lock at night.
- **From the outside every classroom looks the same** (same windows, blinds), so the player cannot tell which one is
  abandoned. The abandoned room is picked at random per playthrough among classrooms on an end/side of the building that
  is NOT next to an entrance door (so it is plausible nobody uses it).
- Staff and students during school hours (about 7:30-15:30 on weekdays): teachers in rooms, a security guard or two
  patrolling the halls, a front-office receptionist; after hours: empty, lights off, a night custodian optional.
- Windows are breakable glass; doors lock at night (locked doors cannot be opened without breaking in).

## The mission (stage 4)
Goal: get an item hidden in the school (in the principal's office or elsewhere inside).
- **Day:** the school is full of people; taking the item in front of them is impossible (instant alarm / police).
- **Night:** all doors are locked. Breaking a door or a random window triggers the school alarm with **high-priority
  police dispatch** (the station is next door): very hard to pull off. Breaking windows from the outside to guess
  rooms quickly racks up vandalism charges and witnesses.
- **The intended way (stealth, an "Airrack" style plan):**
  1. Go in during the day and walk the halls looking for the abandoned classroom.
  2. Staying too long or acting suspicious (entering occupied rooms, running, loitering) raises suspicion. A teacher or
     guard confronts you: "Who are you? Why are you here?" -> dialogue wheel (friendly / rude / threaten / ask, the
     simplified responses from stage 2). The right answer (e.g. a believable excuse) lets you continue; a wrong or no
     answer gets you escorted out, or the police called (arrest). You can also run, hide in rooms and lose them: that
     can work, or make it worse (wider search, lockdown).
  3. Once you find the abandoned room (nobody ever enters it), either:
     - **Hide there until after hours** (everyone leaves, doors lock, lights go off) and then move inside freely to get
       the item and leave (an exit door can be opened from the inside, or leave by a window), or
     - **Break its outside window from the inside**, leave, and come back at night through that window — this only
       works well if that window is on a side that is not visible from the street or where people walk by; a window on
       a visible side gets noticed and reported.
- Fail: arrested, caught with the item, or the item lost; retry from the last checkpoint (GTA style).
- Reward: the item / money; consequences: wanted level and charges if seen (trespass, burglary, vandalism).

- **Alternative day route:** pull a fire alarm (`docs/v2/plan/DISTRACTION_FIRE_ALARM.md`): the school evacuates and you
  search the empty halls before people return (risky: headcount, guard sweep, police next door).

## Systems this needs
- Interior with occupancy schedule (stage 2), suspicion meter for "trespassing in a school during the day",
  confrontation dialogue (stage 2 dialogue wheel), door lock schedule, breakable windows with an alarm, high-priority
  dispatch for the school alarm (police system: `crime` event type `burglary` with `alarm` reporter near a station),
  hiding in rooms (search logic), time skip while hiding (wait until after hours).
