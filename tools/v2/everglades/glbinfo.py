# python3 glbinfo.py a.glb ... : bbox (three.js frame: y up), triangle count, materials, node extras
import json, struct, sys
for f in sys.argv[1:]:
    b = open(f, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
    lo = [1e9] * 3; hi = [-1e9] * 3; tris = 0
    for m in j.get('meshes', []):
        for p in m['primitives']:
            a = j['accessors'][p['attributes']['POSITION']]; lo = [min(x, y) for x, y in zip(lo, a['min'])]; hi = [max(x, y) for x, y in zip(hi, a['max'])]
            tris += (j['accessors'][p['indices']]['count'] if 'indices' in p else a['count']) // 3
    print(f.split('/')[-1], 'size', [round(h - l, 2) for l, h in zip(lo, hi)], 'min', [round(x, 2) for x in lo], 'tris', tris, 'mats', [m.get('name') for m in j.get('materials', [])][:6], 'nodes', len(j.get('nodes', [])), [nd.get('extras', {}).get('deckY') for nd in j['nodes']][:3])
