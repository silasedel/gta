# Distraction: the fire alarm pull station (user idea, Nov 16) — stage 2 places it, stage 4 builds the logic

Model: the user's fire alarm pull station (`Models/Safety/...`, see `Models/INTAKE_2026-11-16.md`). Place them where real
buildings have them: next to exits and stairwells in the casino, hotels, the school, malls, offices (stage 2 interiors).

## How it works
- Interact (E) to pull it: siren and strobe lights in the building, sprinklers optional, all NPCs inside evacuate
  calmly-then-fast through the nearest exits and gather outside; staff check rooms on the way out; security guards leave
  their posts to direct people (cameras keep recording unless the security room is handled).
- The fire department arrives in ~2-3 minutes (siren, truck parks in front), police may follow; after ~5-8 minutes
  staff go back in. That is the window.
- Risk: if a guard, staff member or camera SEES you pull it, it is a crime (`crime` type `false_alarm`) and they know
  who did it; pulled unseen it is just an alarm. Pulling it twice the same day makes staff suspicious (no evacuation,
  they search instead).

## Where it is used
1. **Casino heist finale (plan section 14):** one of the three distraction choices. Pull it in a quiet corridor -> the
   guest floor and cage staff evacuate, guards move to the exits, the pit boss leaves the floor -> slip into the staff
   corridor during the evacuation, handle the security room, then the vault (60-90 s window), out through the loading
   dock while the fire truck blocks the front. Best combined with the stashed getaway car at the back.
2. **School mission ("The Abandoned Classroom"):** an alternative day route: pull the alarm -> the school evacuates ->
   run the empty halls to find the abandoned classroom (or the item) before people come back; risky because teachers do
   a headcount and a guard sweeps the halls, and the police station is next door.
3. **Generic:** any shop / hotel / office robbery can use it to empty a building or split the guards.
