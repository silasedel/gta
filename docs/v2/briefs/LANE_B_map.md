# Lane B: Map, roads, traffic, street life
Owner of: `src/world/**` except `env/`, `interiors/`, `tools/world/**`, `tools/osm/**`, `public/assets/miami/**`, traffic and pedestrian path systems.
1. **Scale and trace:** rebuild the map about 7x smaller (see plan 2.1b) and trace every road exactly from `docs/v2/plan/map_roads_target.webp` (and `map_colour_target.webp`), then fill in real Miami-style places (downtown towers, beach strip, marina, port, airport, swamp, small towns, farmland and forest countryside). Keep Nico's house/neighborhood matching `docs/v2/plan/nico_house/*.webp`.
2. **Roads:** lane markings, crosswalks, curbs, sidewalks, intersections with working traffic lights, stop signs, speed limit and street name signs. No roads or crosswalks on grass; trees and props never on roads.
3. **Traffic:** AI cars obey lights and lanes, react to the player; amount varies by place and time of day. **Pedestrians:** crowds vary by place and time, with lives (sit, jog, talk, shop, walk dogs), sidewalks only, no feet sliding.
4. **Buildings:** place library buildings (`~/Downloads/Models/Buildings`) and kit-bashed variants; every building grounded, no floating, no overlapping; shopfronts match lane D's interiors. Use instancing.
5. **Cameras:** place speed and red-light cameras (more downtown, none rural) for lane E.
Done when: a 5-minute drive covers every district with no pop-in, no road glitches, GPS route works, 60 fps.
