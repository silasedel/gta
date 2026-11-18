#!/usr/bin/env python3
# palm_survey.json (palm_survey.py) -> per person arm roll in degrees {id: {L: deg, R: deg}} (r3-people).
# A side is corrected only when the palm clearly faces forward / back (palm normal > 30 deg from vertical) and the thumb
# says which way (thumb up = palm forward -> positive roll about +X brings the thumb forward = palm down).
#   python3 -I tools/v2/npcs/palm_roll.py  -> writes tools/v2/npcs/palm_roll.json and patches public/assets/npc/people/index.json
import json, os
here = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(here, 'palm_survey.json')))
SKIP = {'c01', 'c02'}   # lifeguards rigged from a manual T-pose pass (hands not flat enough to measure)
out = {}
for pid, v in S.items():
    if pid in SKIP or not v: continue
    r = {}
    for s in ('L', 'R'):
        a = v.get(s)
        if not a or a['flat'] < 30 or abs(a['thumb']) > 120 or abs(a['thumb']) < 8: continue
        r[s] = round(a['flat'] * (1 if a['thumb'] > 0 else -1), 1)
    # both sides of one person were generated in the same pose: when one side is unclear use the other
    if 'L' in r and 'R' not in r and v.get('R', {}).get('flat', 0) > 30: r['R'] = r['L']
    if 'R' in r and 'L' not in r and v.get('L', {}).get('flat', 0) > 30: r['L'] = r['R']
    # Tripo poses are symmetric: both palms face the same way. When the thumb signs disagree (palm normal ~90 deg, the
    # thumb centroid sits near the arm line) trust the side whose thumb is clearly off the line (p125, p154 checked)
    if 'L' in r and 'R' in r and (r['L'] > 0) != (r['R'] > 0):
        sg = 1 if v[max('LR', key=lambda s: abs(v[s]['thumb']))]['thumb'] > 0 else -1
        r = {s: abs(r[s]) * sg for s in r}
    if r: out[pid] = r
json.dump(out, open(os.path.join(here, 'palm_roll.json'), 'w'), indent=1, sort_keys=True)
ip = os.path.join(here, '../../../public/assets/npc/people/index.json')
idx = json.load(open(ip))
for p in idx['people']:
    if p['id'] in out: p['armRoll'] = out[p['id']]
    else: p.pop('armRoll', None)
json.dump(idx, open(ip, 'w'), indent=1)
print('armRoll for', len(out), 'people')
