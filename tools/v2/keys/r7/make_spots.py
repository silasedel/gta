# r7 (Nov 18 eve playtest): camera spots matching each mock-up, in the lot STREET frame S of r4/plan4.js
# (+X east, +Z toward the street, -Z toward the bay; y above the yard grade), or the yard frame G ('g': True).
#   python3 tools/v2/keys/r7/make_spots.py   -> tools/v2/keys/r7/spots_r7.json
# then: node tools/v2/keys/shots.mjs --set r7a --spots tools/v2/keys/r7/spots_r7.json ; python3 tools/v2/keys/r7/sheets7.py r7a
import json
S = {
  # id: (mock-up file, eye, look, fov, tod)   (house square to the lot since r7: house frame = S)
  's01_roof':   ('r4/01_roof_view_yard_dumpster', (1.2, 8.4, -6.0), (-2.5, 0.2, 13), 72, 12),
  's02_low':    ('r4/02_exterior_stilts_deck', (-11.5, 1.5, 3.0), (-3, 5.2, -6.5), 70, 11),
  's08_water':  ('r4/08_back_dock_seawall', (-1.5, 1.3, -40), (-0.5, 3.8, -8), 58, 16.5),
  's10_side':   ('r4/10_side_carport_basketball', (-0.8, 1.9, 4.2), (0.4, 1.7, -10), 74, 11),
  's00_deck':   ('0_front_deck_mockup', (-8.0, 5.3, -1.9), (-2.5, -0.5, 14), 58, 11),
  's1_street':  ('1_front_street', (-1.5, 1.6, 17), (0, 3.6, -7), 58, 10),
  's2_back':    ('2_back_dock', (0, 1.0, -31.5), (0, 4.0, -7), 62, 10),
  's3_side':    ('3_side_yard', (11.5, 1.6, 5.5), (-2, 3.8, -9), 66, 17),
  's4_stairs':  ('4_side_stairs', (-11, 1.6, 8.5), (-1, 4.0, -5), 64, 11),
  'sb3_backdeck': ('../playtest_nov18_eve/03_back_deck_sunken_house_in_water', (-2, 5.4, -12), (-2, 2.0, -50), 70, 18.4),
  'sTop':       (None, (0, 90, -5), (0, 0, -5.01), 60, 12),
  's06_living': ('r4/06_living_room', (-0.9, 5.3, -8.8), (-4.0, 3.95, -4.8), 70, 10),
  # r7b: the user's MAIN views. Game north in the lot frame S is (0.411, -0.911) (layout heading 0.424): 14 and 15 look exactly north
  's14_north':  ('r4/14_MAIN_looking_north_low', (-14.2, 0.9, 5.2), (-6.6, 5.2, -8.2), 74, 11),
  's11_drive':  ('MAIN11', (-6.0, 1.7, 9.0), (-1.9, 2.6, -0.1), 64, 11),
  's12_night':  ('r4/12_gta6_reference_night_driveway', (-6.0, 1.7, 9.0), (-1.9, 2.6, -0.1), 64, 21.5),
  's13_under':  ('r4/13_under_house_hoop_annex', (1.2, 1.6, 1.0), (-2.3, 1.9, -8.3), 66, 10),
  's15_living': ('r4/15_MAIN_living_room_looking_north', (-1.4, 5.2, -4.3), (-6.4, 4.2, -10.0), 72, 10),
  's16_kitchen': ('r4/16_MAIN_kitchen_wide_looking_south', (-5.4, 6.1, -6.4), (3.5, 4.0, -6.6), 78, 10),
  's17_water':  ('r4/17_MAIN_dock_from_water_looking_south', (4.0, 1.0, -37.0), (-4.2, 3.0, -18.8), 60, 10),
  's18_slider': ('r4/18_MAIN_view_from_slider_north', (-3.1, 5.45, -10.0), (0.6, 3.5, -19.1), 70, 10),
  's19_gym':    ('r4/19_MAIN_lower_deck_gym', (12.6, 6.2, -10.8), (6.0, 2.75, -15.0), 68, 11),
  'xJunk':      (None, (-3.5, 1.7, 3.0), (-4.5, 0.6, -10), 70, 11),
  'xDock':      (None, (1.8, 2.0, -23.6), (-4.6, 0.3, -25.2), 66, 11),
  'xWindow':    (None, (-3.0, 5.3, 0.2), (-3.4, 4.6, -3.6), 50, 11),
}
import glob, os
_m = sorted(glob.glob('docs/v2/plan/nico_house/r4/11_from_driveway_MAIN.*'))
MAIN11 = ('r4/' + os.path.basename(_m[0])) if _m else 'r4/12_gta6_reference_night_driveway'
out = {}
for k, v in S.items():
  ref, e, l, fov, tod = v[:5]; g = len(v) > 5 and v[5]
  if ref == 'MAIN11': ref = MAIN11
  if g:
    out[k] = {'eye': list(e), 'look': list(l), 'fov': fov, 'tod': tod, 'ref': ref}
    continue
  ev = ("window.__r4oz=game.nicoHouse.r4oz||0;const NH=game.nicoHouse,sp=NH.spot,h=sp.streetHeading||0,c=Math.cos(h),s=Math.sin(h),oz=window.__r4oz,"
        "W=(x,y,z)=>new game.THREE.Vector3(sp.x+x*c+(z+oz)*s,NH.group.position.y+y,sp.z-x*s+(z+oz)*c);"
        f"const e=W({e[0]},{e[1]},{e[2]}),l=W({l[0]},{l[1]},{l[2]});"
        f"game.cameraOverride=(dt,cam)=>{{cam.position.copy(e);cam.up.set(0,1,0);cam.lookAt(l);cam.fov={fov};cam.updateProjectionMatrix();return true;}};")
  out[k] = {'eye': [0, 0, 0], 'look': [0, 0, 1], 'tod': tod, 'fov': fov, 'eval': ev, 'ref': ref}
json.dump(out, open('tools/v2/keys/r7/spots_r7.json', 'w'), indent=1)
print('ok', len(out))
