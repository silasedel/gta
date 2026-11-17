# GLB texture helper (no deps beyond the stdlib): list / extract / replace the images embedded in a .glb.
#   python3 glbtex.py list file.glb
#   python3 glbtex.py dump file.glb outdir      -> outdir/<glbname>_<imageIndex>_<materialName>_<slot>.<ext>
import json, struct, sys, os, re

def read(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<4sII', b, 0)
    assert magic == b'glTF', path
    off = 12; js = None; bin_ = None
    while off < length:
        cl, ct = struct.unpack_from('<I4s', b, off); off += 8
        chunk = b[off:off + cl]; off += cl
        if ct == b'JSON': js = json.loads(chunk.decode('utf8'))
        elif ct == b'BIN\x00': bin_ = bytearray(chunk)
    return js, bin_

def image_bytes(js, bin_, i):
    im = js['images'][i]; bv = js['bufferViews'][im['bufferView']]
    o = bv.get('byteOffset', 0); return bytes(bin_[o:o + bv['byteLength']]), im.get('mimeType', 'image/png')

def slots(js):
    """image index -> [(material name, slot)]"""
    out = {}
    tex = js.get('textures', [])
    for m in js.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        for slot, ref in [('color', pbr.get('baseColorTexture')), ('mr', pbr.get('metallicRoughnessTexture')), ('normal', m.get('normalTexture')), ('ao', m.get('occlusionTexture')), ('emissive', m.get('emissiveTexture'))]:
            if ref is None: continue
            src = tex[ref['index']].get('source')
            if src is None: continue
            out.setdefault(src, []).append((m.get('name', '?'), slot))
    return out

if __name__ == '__main__':
    cmd, path = sys.argv[1], sys.argv[2]
    js, bin_ = read(path)
    S = slots(js)
    name = os.path.splitext(os.path.basename(path))[0]
    for i, im in enumerate(js.get('images', [])):
        data, mime = image_bytes(js, bin_, i)
        use = S.get(i, [])
        if cmd == 'list': print(name, i, mime, len(data), use)
        elif cmd == 'dump':
            os.makedirs(sys.argv[3], exist_ok=True)
            tag = '_'.join(re.sub(r'[^A-Za-z0-9]+', '', m) + '-' + s for m, s in use[:2]) or 'unused'
            ext = 'jpg' if 'jpeg' in mime else 'png'
            open(os.path.join(sys.argv[3], f'{name}_{i}_{tag}.{ext}'), 'wb').write(data)
