#!/usr/bin/env python3
# Per model / material texture stats of the converted vegetation GLBs (alpha-weighted, covered texels only):
# mean sRGB, HSV (hue deg, sat, value) of the mean, and the value 10/50/90 percentiles. -> tools/v2/vegetation/texstats.json
# usage: python3 tools/v2/vegetation/texstats.py [keys...]
import json, struct, sys, io, os, colorsys
import numpy as np
from PIL import Image
D = 'public/assets/models/vegetation'
def glb(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + n]); o = 20 + n
    bn = struct.unpack('<I', b[o:o + 4])[0]; B = b[o + 8:o + 8 + bn]; return J, B
def img(J, B, ti):
    src = J['textures'][ti].get('source')
    if src is None: src = list(J['textures'][ti].get('extensions', {}).values())[0]['source']
    im = J['images'][src]; bv = J['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(B[o:o + bv['byteLength']])).convert('RGBA')
out = {}
keys = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(D) if f.endswith('.glb') and not f.endswith('_lod1.glb'))
for k in keys:
    J, B = glb(f'{D}/{k}.glb'); out[k] = {}
    for m in J.get('materials', []):
        pb = m.get('pbrMetallicRoughness', {}); t = pb.get('baseColorTexture')
        if not t: continue
        a = np.asarray(img(J, B, t['index']).resize((128, 128), Image.BILINEAR), np.float32) / 255
        w = (a[..., 3] > 0.5).astype(np.float32)
        if w.sum() < 4: w = np.ones_like(w)
        if float(np.percentile(a[..., :3].max(-1)[w > 0], 25)) < 0.03: w = w * (a[..., :3].max(-1) > 0.06)  # atlases with large black (unused) areas: measure the used texels only
        rgb = (a[..., :3] * w[..., None]).sum((0, 1)) / max(1.0, w.sum())
        h, s, v = colorsys.rgb_to_hsv(*[float(x) for x in rgb])
        vv = a[..., :3].max(-1)[w > 0]
        ss = (a[..., :3].max(-1) - a[..., :3].min(-1)) / np.maximum(a[..., :3].max(-1), 1e-3)
        out[k][m.get('name', '?')] = {'rgb': [round(float(x), 3) for x in rgb], 'hsv': [round(h * 360, 1), round(s, 3), round(v, 3)],
            'v10_50_90': [round(float(np.percentile(vv, p)), 3) for p in (10, 50, 90)], 'sat50': round(float(np.median(ss[w > 0])), 3), 'cover': round(float((a[..., 3] > 0.5).mean()), 3)}
json.dump(out, open('tools/v2/vegetation/texstats.json', 'w'), indent=1)
for k, mm in out.items():
    for n, s in mm.items(): print(f"{k:16s} {n[:22]:22s} hsv {s['hsv']} v {s['v10_50_90']} sat50 {s['sat50']}")
