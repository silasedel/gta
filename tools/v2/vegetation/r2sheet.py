#!/usr/bin/env python3
# Before / after sheet (JPG q90): python3 -P tools/v2/vegetation/r2sheet.py out.jpg "label|before.png|after.png" ... [--w 760] [--crop x0,y0,x1,y1]
# Each row: before (left) | after (right), the label above. An optional user shot as a row: "label|user.webp|after.png".
import sys
from PIL import Image, ImageDraw, ImageFont
args = sys.argv[1:]; out = args.pop(0); W = 760; crop = None; rows = []
i = 0
while i < len(args):
    if args[i] == '--w': W = int(args[i + 1]); i += 2; continue
    if args[i] == '--crop': crop = tuple(int(v) for v in args[i + 1].split(',')); i += 2; continue
    rows.append(args[i].split('|')); i += 1
try: F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception: F = ImageFont.load_default()
tiles = []
for lab, a, b in rows:
    ims = []
    for p in (a, b):
        im = Image.open(p).convert('RGB')
        if crop and not p.endswith('.webp'): im = im.crop(crop)
        im = im.resize((W, int(im.height * W / im.width)), Image.LANCZOS); ims.append(im)
    h = max(x.height for x in ims); t = Image.new('RGB', (W * 2 + 8, h + 34), (24, 24, 24)); d = ImageDraw.Draw(t)
    d.text((8, 6), lab + '   (left: before, right: after)', fill=(235, 235, 235), font=F)
    t.paste(ims[0], (0, 34)); t.paste(ims[1], (W + 8, 34)); tiles.append(t)
H = sum(t.height for t in tiles) + 6 * (len(tiles) - 1); S = Image.new('RGB', (W * 2 + 8, H), (24, 24, 24)); y = 0
for t in tiles: S.paste(t, (0, y)); y += t.height + 6
S.save(out, quality=90); print(out, S.size)
