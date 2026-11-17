#!/usr/bin/env python3
"""r2-ground before/after sheets: rows of [before | after] image pairs with captions, JPG q90.
usage: sheet.py out.jpg "caption::before.png::after.png" [...]   (an empty before = after only)"""
import sys
from PIL import Image, ImageDraw, ImageFont

W, H, PAD, CAP = 960, 540, 8, 34
rows = [a.split('::') for a in sys.argv[2:]]
sheet = Image.new('RGB', (W * 2 + PAD * 3, (H + CAP + PAD) * len(rows) + PAD), (24, 24, 26))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception:
    font = ImageFont.load_default()
for r, (cap, before, after) in enumerate(rows):
    y = PAD + r * (H + CAP + PAD)
    d.text((PAD, y + 4), cap, fill=(235, 235, 235), font=font)
    for c, path in enumerate([before, after]):
        if not path:
            continue
        im = Image.open(path).convert('RGB')
        im.thumbnail((W, H)) if im.size[0] / im.size[1] > W / H else im.thumbnail((W * 10, H))
        im = im.crop(((im.size[0] - min(W, im.size[0])) // 2, 0, (im.size[0] - min(W, im.size[0])) // 2 + min(W, im.size[0]), min(H, im.size[1])))
        sheet.paste(im, (PAD + c * (W + PAD), y + CAP))
        d.text((PAD + c * (W + PAD) + 8, y + CAP + 8), 'before' if c == 0 else 'after', fill=(255, 255, 255), font=font)
sheet.save(sys.argv[1], quality=90)
print(sys.argv[1], sheet.size)
