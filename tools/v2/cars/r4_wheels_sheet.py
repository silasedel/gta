# r4 wheels before / after sheets from tools/v2/cars/r4_wheels.mjs shots (JPG q90):
#   python3 -P tools/v2/cars/r4_wheels_sheet.py [keys...]
# sheet_<key>.jpg: rows = before / after; columns = standing side, standing head-on, 3 rolling side frames, 3 rolling head-on
# frames (the last ones turning).  roll_<key>.jpg: the 8 rolling side frames in a row, before over after (a frame sequence).
import os, sys
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs', 'v2', 'shots', 'cars', 'r4wheels')
keys = sys.argv[1:] or ['truck9', 'coupe3', 'suv1', 'super4']
W, H = 400, 250
def tile(p, lab):
    im = Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS) if os.path.exists(p) else Image.new('RGB', (W, H), (40, 40, 40))
    d = ImageDraw.Draw(im); d.rectangle([0, 0, 8 + 7 * len(lab), 16], fill=(0, 0, 0)); d.text((4, 3), lab, fill=(255, 255, 255)); return im
for k in keys:
    cols = [('stand_side', 'standing side'), ('stand_head', 'standing head-on'), ('roll02_side', 'rolling'), ('roll06_side', 'rolling'),
            ('roll12_side', 'rolling, turning'), ('roll03_head', 'rolling'), ('roll07_head', 'rolling'), ('roll13_head', 'rolling, turning')]
    S = Image.new('RGB', (W * len(cols), H * 2), (0, 0, 0))
    for r, tag in enumerate(('before', 'after')):
        for c, (n, lab) in enumerate(cols): S.paste(tile(os.path.join(D, f'{tag}_{k}_{n}.png'), f'{tag} {k}: {lab}'), (c * W, r * H))
    S.save(os.path.join(D, f'sheet_{k}.jpg'), quality=90)
    fr = [f'roll{i:02d}_side' for i in range(0, 16, 2)]
    R = Image.new('RGB', (W * len(fr), H * 2), (0, 0, 0))
    for r, tag in enumerate(('before', 'after')):
        for c, n in enumerate(fr): R.paste(tile(os.path.join(D, f'{tag}_{k}_{n}.png'), f'{tag} {k} frame {c + 1}'), (c * W, r * H))
    R.save(os.path.join(D, f'roll_{k}.jpg'), quality=90)
    print('sheet', k)
