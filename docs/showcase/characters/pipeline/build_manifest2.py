import json, glob, os, sys, shutil
src, dst, atlas = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(dst, exist_ok=True)
people = []
for f in sorted(glob.glob(os.path.join(src, '*.json'))):
    d = json.load(open(f)); s = d['spec']
    shutil.copy(os.path.join(src, d['file']), os.path.join(dst, d['file']))
    people.append({'id': d['id'], 'file': d['file'], 'v': 2, 'zone': s.get('zone'), 'gender': s.get('gender'), 'years': s.get('years'), 'race': s.get('race'),
                   'hmacro': s['macro'].get('height', 0.5), 'height': round(d['height'], 3), 'hair': s.get('hair'), 'clothes': s.get('clothes'),
                   'shells': [g['kind'] for g in d['garments']], 'garments': d['garments'], 'verts': d['verts'], 'tris': d['tris']})
for a in ('atlasS.jpg', 'atlasC.webp'): shutil.copy(os.path.join(atlas, a), os.path.join(dst, a))
json.dump({'version': 2, 'people': people}, open(os.path.join(dst, 'humans.json'), 'w'), separators=(',', ':'))
print(len(people), 'people')
