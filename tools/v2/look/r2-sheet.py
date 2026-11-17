#!/usr/bin/env python3
# r2-look sheet: labeled grid of images (JPG q90). Each row given as "label1=path1|label2=path2|...".
#   python3 -P tools/v2/look/r2-sheet.py out.jpg [--w 800] "before=a.png|after=b.png|mock-up=c.webp" "..."
import sys
from PIL import Image, ImageDraw, ImageFont
a = sys.argv[1:]; out = a.pop(0); w = 800
if a and a[0] == '--w': w = int(a[1]); a = a[2:]
rows = [[c.split('=', 1) for c in r.split('|')] for r in a]
cols = max(len(r) for r in rows)
def load(p):
    im = Image.open(p).convert('RGB'); return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
grid = [[load(p) for _, p in r] for r in rows]
rh = [max(im.height for im in r) for r in grid]
sheet = Image.new('RGB', (w * cols, sum(rh)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
try: f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception: f = ImageFont.load_default()
y = 0
for ri, r in enumerate(grid):
    for ci, im in enumerate(r):
        sheet.paste(im, (ci * w, y)); lab = rows[ri][ci][0]
        d.rectangle([ci * w, y, ci * w + 12 + 12 * len(lab), y + 30], fill=(0, 0, 0)); d.text((ci * w + 6, y + 4), lab, fill=(255, 255, 255), font=f)
    y += rh[ri]
sheet.save(out, quality=90)
print(out, sheet.size)
