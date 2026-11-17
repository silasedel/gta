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
