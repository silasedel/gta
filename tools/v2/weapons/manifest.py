# Collect public/assets/weapons/<key>.json sidecars into manifest.json (read by src/gameplay/gunModels.js)
import json, os, sys, glob
out = sys.argv[1]; cfg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'weapons.json')))
man = {}
for k in cfg['models']:
    p = os.path.join(out, k + '.json')
    if os.path.exists(p): s = json.load(open(p)); s.setdefault('parts', {}); man[k] = {kk: s[kk] for kk in ('src', 'tris', 'length', 'bbox', 'points', 'parts', 'bytes')}
json.dump({'version': 1, 'models': man}, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
print('manifest', len(man), 'models', sum(m['bytes'] for m in man.values()) // 1024, 'KB total')
