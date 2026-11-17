# Merge every converted car manifest (minus the hull) into public/assets/vehicles/cars/index.json (read at boot).
import json, glob, os
D = os.path.join(os.path.dirname(__file__), '../../../public/assets/vehicles/cars')
out = {}
for p in sorted(glob.glob(os.path.join(D, '*.json'))):
    if p.endswith('index.json'): continue
    m = json.load(open(p)); k = m['key']
    if not os.path.exists(os.path.join(D, k + '.glb')): continue
    out[k] = {x: y for x, y in m.items() if x not in ('hull', 'cfg', 'src')}
json.dump(out, open(os.path.join(D, 'index.json'), 'w'), separators=(',', ':'))
print('index', len(out), 'models,', round(sum(os.path.getsize(os.path.join(D, k + '.glb')) for k in out) / 1e6, 1), 'MB')
