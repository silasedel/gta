#!/usr/bin/env python3
# public/assets/npc/people/index.json from the cast list (people.json) + each rigged person's meta json.
#   python3 -I tools/v2/npcs/build_index.py <meta dir> <out dir>
import sys, os, json, glob, re
here = os.path.dirname(os.path.abspath(__file__))
cast = json.load(open(os.path.join(here, 'people.json')))['people']
mdir, out = sys.argv[1], sys.argv[2]
people = []
for c in cast:
    pid = ('p%02d' % c['n']) if 'n' in c else ('c%02d' % c['char'])
    mp = os.path.join(mdir, pid + '.json')
    if not os.path.exists(mp) or not os.path.exists(os.path.join(out, pid + '.glb')): continue
    m = json.load(open(mp))
    src = m['src']; name = re.sub(r'^(NPC|Character) \d+ - ', '', src.split('/')[-2])
    row = {'id': pid, 'file': pid + '.glb', 'name': name, 'g': c['g'], 'age': c['age'], 'years': c['years'], 'role': c['role'],
           'places': c['places'], 'height': round(m['height'], 3), 'hipH': round(m['hipH'], 4), 'tris': m['tris'],
           'a2': os.path.exists(os.path.join(out, pid + '_a2.webp')), 'skirt': m.get('skirt', False)}
    cp = os.path.join(mdir, pid + '_cols.json')
    if os.path.exists(cp): row['cols'] = json.load(open(cp))
    for k in ('gait', 'build'):
        if k in c: row[k] = c[k]
    people.append(row)
json.dump({'version': 1, 'people': people}, open(os.path.join(out, 'index.json'), 'w'), indent=1)
print('index', len(people), 'people')
