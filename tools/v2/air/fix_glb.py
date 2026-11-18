# r4-air: drop material texture slots whose texture has no image (Blender failed to write a few cockpit-instrument
# images of Plane 9); GLTFLoader would throw on them.   python3 tools/v2/air/fix_glb.py public/assets/vehicles/air/prop.glb
import json, struct, sys
p = sys.argv[1]; b = open(p, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); rest = b[20 + n:]
bad = {i for i, t in enumerate(j.get('textures', [])) if 'source' not in t and not any('source' in (e or {}) for e in (t.get('extensions') or {}).values())}
def scrub(o):
    if isinstance(o, dict):
        for k in list(o):
            v = o[k]
            if isinstance(v, dict) and 'index' in v and k.endswith('Texture') and v['index'] in bad: del o[k]; continue
            scrub(v)
    elif isinstance(o, list):
        for v in o: scrub(v)
for m in j.get('materials', []): scrub(m)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = b[:8] + struct.pack('<I', 12 + 8 + len(js) + len(rest)) + struct.pack('<I', len(js)) + b'JSON' + js + rest
open(p, 'wb').write(out); print('fixed', p, 'dropped texture refs', sorted(bad))
