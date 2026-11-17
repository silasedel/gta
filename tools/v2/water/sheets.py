#!/usr/bin/env python3
# r2-water: before / after sheets (JPG q90). Each row = [before, after] with labels.
#   python3 -I tools/v2/water/sheets.py <out.jpg> "<title>" <before1> <after1> [<before2> <after2> ...]
# A missing image (no "before" exists for the airboat) becomes a gray "did not exist" panel.
import sys, os
from PIL import Image, ImageDraw, ImageFont
out, title, files = sys.argv[1], sys.argv[2], sys.argv[3:]
W, H = 960, 540
F = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
font = ImageFont.truetype(F, 26) if os.path.exists(F) else ImageFont.load_default()
small = ImageFont.truetype(F, 20) if os.path.exists(F) else ImageFont.load_default()
rows = [files[i:i + 2] for i in range(0, len(files), 2)]
sheet = Image.new('RGB', (W * 2, H * len(rows) + 50), (24, 24, 24))
d = ImageDraw.Draw(sheet)
d.text((14, 10), title, font=font, fill=(240, 240, 235))
for r, pair in enumerate(rows):
    for c, f in enumerate(pair):
        x, y = c * W, 50 + r * H
        if f and f != '-' and os.path.exists(f):
            im = Image.open(f).convert('RGB'); im = im.resize((W, int(im.height * W / im.width)))
            sheet.paste(im.crop((0, 0, W, H)), (x, y))
        else:
            d.rectangle((x, y, x + W - 1, y + H - 1), fill=(60, 60, 60)); d.text((x + 30, y + H // 2 - 14), 'did not exist before', font=font, fill=(200, 200, 200))
        lab = 'BEFORE' if c == 0 else 'AFTER'
        d.rectangle((x + 8, y + 8, x + 130, y + 40), fill=(0, 0, 0)); d.text((x + 16, y + 11), lab, font=small, fill=(255, 220, 90) if c else (200, 200, 200))
sheet.save(out, quality=90)
print('sheet', out)
