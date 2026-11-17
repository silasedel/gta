#!/usr/bin/env python3
# Person textures -> game WebP set: <id>_a.webp (1K albedo), <id>_a2.webp (2K albedo, close-ups only),
# <id>_n.webp (512 tangent normal), <id>_o.webp (512 ORM: R occlusion, G roughness, B metal).
#   python3 -I tools/v2/npcs/textures.py <texture dir> <id> <out dir>
import sys, os, glob, subprocess
from PIL import Image
src, pid, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
fs = glob.glob(os.path.join(src, '*'))
def find(*keys):
    for k in keys:
        for f in fs:
            n = os.path.basename(f).lower()
            if k in n: return f
    return None
bc = find('basecolor', 'base_color', 'albedo', 'diffuse', ' color.', '_color', 'color')
nm = find('normal')
rm = find('_rm.', ' rm.')
ro = find('roughness')
me = find('metallic.', '_metallic', 'metallic')
ms = find('metallic smoothness')
def webp(im, path, q):
    tmp = path + '.png'; im.save(tmp)
    subprocess.run(['cwebp', '-quiet', '-q', str(q), '-m', '6', '-sharp_yuv', tmp, '-o', path], check=True)
    os.remove(tmp)
A = Image.open(bc).convert('RGB')
# brand logos (made-up brands only): boxes from people.json "erase" (1024-px atlas coordinates). Pixels that stand out
# from the box's median are replaced by a blur of their surroundings (the cloth weave stays, the logo goes)
import json as _json
from PIL import ImageFilter, ImageChops
_cast = _json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'people.json')))['people']
_row = next((c for c in _cast if ('p%02d' % c['n'] if 'n' in c else 'c%02d' % c.get('char', 0)) == pid), {})
for (x0, y0, x1, y1) in _row.get('erase', []):
    k = A.width / 1024; box = (int(x0 * k), int(y0 * k), int(x1 * k), int(y1 * k))
    pad = int(14 * k); outer = (max(0, box[0] - pad), max(0, box[1] - pad), min(A.width, box[2] + pad), min(A.height, box[3] + pad))
    reg = A.crop(outer); g = reg.convert('L')
    import statistics
    med = statistics.median(list(g.tobytes()))
    mask = g.point(lambda v: 255 if abs(v - med) > 28 else 0).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))
    inner = Image.new('L', reg.size, 0); inner.paste(255, (box[0] - outer[0], box[1] - outer[1], box[2] - outer[0], box[3] - outer[1]))
    mask = ImageChops.multiply(mask, inner)
    import numpy as _np
    ra = _np.asarray(reg, dtype=_np.float32); ma = _np.asarray(mask) > 20
    mc = _np.median(ra[~ma], axis=0) if (~ma).any() else ra.reshape(-1, 3).mean(0)
    flat = ra.copy(); flat[ma] = mc
    fill = Image.fromarray(flat.clip(0, 255).astype(_np.uint8)).filter(ImageFilter.GaussianBlur(3 * k))
    mask = mask.filter(ImageFilter.MaxFilter(3))
    A.paste(Image.composite(fill, reg, mask), outer[:2])
# full-resolution set for the few people right next to the camera (user: full-res textures up close)
webp(A, os.path.join(out, pid + '_a4.webp'), 88)
webp(A.resize((2048, 2048), Image.LANCZOS), os.path.join(out, pid + '_a2.webp'), 84)
webp(A.resize((1024, 1024), Image.LANCZOS), os.path.join(out, pid + '_a.webp'), 86)
if nm:
    N = Image.open(nm).convert('RGB').resize((512, 512), Image.LANCZOS)
    webp(N, os.path.join(out, pid + '_n.webp'), 90)
    webp(Image.open(nm).convert('RGB').resize((2048, 2048), Image.LANCZOS), os.path.join(out, pid + '_n2.webp'), 90)
if ms:   # Unity metallic (R) + smoothness (A)
    M = Image.open(ms).convert('RGBA').resize((512, 512), Image.LANCZOS)
    r, g, b, a = M.split()
    O = Image.merge('RGB', (Image.new('L', (512, 512), 255), a.point(lambda v: 255 - v), r))
elif rm:
    O = Image.open(rm).convert('RGB').resize((512, 512), Image.LANCZOS)
    r, g, b = O.split(); O = Image.merge('RGB', (Image.new('L', (512, 512), 255), g, b))
else:
    R = Image.open(ro).convert('L').resize((512, 512), Image.LANCZOS) if ro else Image.new('L', (512, 512), 200)
    Mt = Image.open(me).convert('L').resize((512, 512), Image.LANCZOS) if me else Image.new('L', (512, 512), 0)
    O = Image.merge('RGB', (Image.new('L', (512, 512), 255), R, Mt))
webp(O, os.path.join(out, pid + '_o.webp'), 92)
print('tex', pid, os.path.basename(bc), os.path.basename(nm or '-'), os.path.basename(rm or ms or ro or '-'))
