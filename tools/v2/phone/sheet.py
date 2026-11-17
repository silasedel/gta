#!/usr/bin/env python3
# r2-phone review sheet: phone crops side by side with labels, JPG q90.
# sheet.py out.jpg [--cols 6] [--h 900] "label=path" ...
import sys, math
from PIL import Image, ImageDraw, ImageFont
a = sys.argv[1:]; cols = 6; H = 900
if '--cols' in a: i = a.index('--cols'); cols = int(a[i + 1]); del a[i:i + 2]
if '--h' in a: i = a.index('--h'); H = int(a[i + 1]); del a[i:i + 2]
out, items = a[0], [x.split('=', 1) for x in a[1:]]
ims = [(l, Image.open(p).convert('RGB')) for l, p in items]
ims = [(l, im.resize((int(im.width * H / im.height), H), Image.LANCZOS)) for l, im in ims]
W = max(im.width for _, im in ims); pad = 24; lab = 56
rows = math.ceil(len(ims) / cols)
S = Image.new('RGB', (cols * (W + pad) + pad, rows * (H + lab + pad) + pad), (16, 17, 21)); d = ImageDraw.Draw(S)
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
except Exception: font = ImageFont.load_default()
for k, (l, im) in enumerate(ims):
    x = pad + (k % cols) * (W + pad); y = pad + (k // cols) * (H + lab + pad)
    d.text((x + 6, y + 10), l, fill=(235, 235, 240), font=font)
    S.paste(im, (x + (W - im.width) // 2, y + lab))
S.save(out, quality=90)
print(out, S.size)
