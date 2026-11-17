#!/usr/bin/env python3
"""Before / after review sheet: one row per spot, left = surfaces off, right = on (same session, same camera).
   python3 tools/v2/surfaces/sheet.py OUT.png set:spot [set:spot ...]   (spot files docs/v2/shots/surfaces/<set>_<spot>_{off,on}.png)"""
import sys
from PIL import Image, ImageDraw, ImageFont

D = 'docs/v2/shots/surfaces'
out, items = sys.argv[1], sys.argv[2:]
W, H = 960, 540
sheet = Image.new('RGB', (W * 2, H * len(items)), (20, 20, 20))
dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
for r, it in enumerate(items):
    st, sp = it.split(':', 1)
    for c, k in enumerate(('off', 'on')):
        try: im = Image.open(f'{D}/{st}_{sp}_{k}.png').convert('RGB').resize((W, H), Image.LANCZOS)
        except FileNotFoundError: continue
        sheet.paste(im, (c * W, r * H))
        label = f'{sp}  {"BEFORE (surfaces off)" if k == "off" else "AFTER (surfaces on)"}'
        dr.rectangle([c * W, r * H, c * W + 12 * len(label) + 16, r * H + 32], fill=(0, 0, 0))
        dr.text((c * W + 8, r * H + 5), label, fill=(255, 230, 120), font=font)
sheet.save(out)
print(out)
