#!/usr/bin/env python3
# r4-shoreland: before / after sheets (left = before, right = after), JPG q90, one per spot.
#   python3 tools/v2/water/r4_shoreland_sheet.py [before_tag] [after_tag]
import glob, os, re, sys
from PIL import Image, ImageDraw
D = 'docs/v2/shots/water/r4shore'
BT, AT = (sys.argv[1:3] + ['before', 'after'])[:2]
W, H = 800, 450
shots = {}
for f in sorted(glob.glob(f'{D}/*_{AT}.jpg')):
    m = re.match(r'(brickell|inland\d|highway|bridge)_(\w+?)_' + AT + r'\.jpg$', os.path.basename(f))
    if m: shots.setdefault(m.group(1), []).append(m.group(2))
for spot, cams in shots.items():
    S = Image.new('RGB', (W * 2, H * len(cams)), (20, 20, 20)); g = ImageDraw.Draw(S)
    for i, cam in enumerate(cams):
        for j, tag in enumerate((BT, AT)):
            f = f'{D}/{spot}_{cam}_{tag}.jpg'
            if os.path.exists(f): S.paste(Image.open(f).convert('RGB').resize((W, H)), (j * W, i * H))
            g.text((j * W + 10, i * H + 8), f'{spot} {cam} {"before" if j == 0 else "after"}', fill=(255, 255, 0))
    out = f'{D}/sheet_r4shore_{spot}.jpg'; S.save(out, quality=90); print(out)
