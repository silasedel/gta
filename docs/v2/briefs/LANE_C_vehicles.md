# Lane C: Vehicles, damage, theft, boats, aircraft
Owner of: `src/vehicles/**`, boats, aircraft, car damage and fire, vehicle audio, car spawn tables.
1. **Import about 100 cars** from `~/Downloads/Models/Cars` (and the other vehicle folders): split wheels, per-wheel raycast suspension, fitted hitboxes, glass/paint materials, color variants (colors only; real Miami color statistics), made-up brands and Florida-style plates. Taxi, 2-3 police cruisers, police bike, SWAT truck, ambulance, fire truck, garbage truck, delivery vans, buses.
2. **Driving feel:** realistic but forgiving (weight, suspension, spin-outs). Fix cars being pushed by the player and pass-through pedestrians. Engine sound restarts correctly after unpausing.
3. **Damage:** dents, broken glass, smoke, fire, wheels and parts falling off. Burning-car wheels must not glow red (see `src/fx/fire.v2.js`).
4. **Theft:** smash a window then hotwire, or just start (depends on car). Cars left in the open can be reported stolen and found by police. Garage area under Nico's house.
5. **Water and air:** many boats, one or two yachts, a few jet skis, helicopter and plane that fly well, and police helicopter.
Done when: every car class drives, parks, crashes and burns correctly in the real app; screenshots of 12 representative cars; 60 fps with 40 cars active.
