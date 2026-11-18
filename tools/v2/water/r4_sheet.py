#!/usr/bin/env python3
# r4-water: before / after sheets (left = before ?r4water=0, right = after), JPG q90, one per spot.
#   python3 tools/v2/water/r4_sheet.py [before_tag] [after_tag]
import glob, os, re, sys
from PIL import Image, ImageDraw
D = 'docs/v2/shots/water/r4'
BT, AT = (sys.argv[1:3] + ['before', 'after'])[:2] if len(sys.argv) > 2 else ('before', 'after')
W, H = 800, 450
shots = {}
for f in glob.glob(f'{D}/*_{AT}.jpg'):
    m = re.match(r'(.+?)_(close|mid|top|user)_(\d+)_' + AT + r'\.jpg$', os.path.basename(f))
    if m: shots.setdefault(m.group(1), []).append((m.group(2), m.group(3)))
order = {'user': 0, 'close': 1, 'mid': 2, 'top': 3}
for spot, rows in shots.items():
    rows.sort(key=lambda r: (order[r[0]], r[1]))
    S = Image.new('RGB', (W * 2, H * len(rows)), (20, 20, 20)); g = ImageDraw.Draw(S)
    for i, (cam, hh) in enumerate(rows):
        for j, tag in enumerate((BT, AT)):
            f = f'{D}/{spot}_{cam}_{hh}_{tag}.jpg'
            if os.path.exists(f): S.paste(Image.open(f).convert('RGB').resize((W, H)), (j * W, i * H))
            g.text((j * W + 10, i * H + 8), f'{spot} {cam} { {'11': '11:00', '175': '17:30'}.get(hh, hh) } {"before" if j == 0 else "after"}', fill=(255, 255, 0))
    out = f'{D}/sheet_r4_{spot}.jpg'; S.save(out, quality=90); print(out)
