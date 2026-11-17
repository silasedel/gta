#!/usr/bin/env python3
# montage.py out.png in1.png in2.png ... [--w 640] : grid of thumbnails with labels (stage 1 review sheets)
import sys, math
from PIL import Image, ImageDraw
args = sys.argv[1:]; w = 640
if '--w' in args: i = args.index('--w'); w = int(args[i+1]); del args[i:i+2]
out, ins = args[0], args[1:]
ims = [Image.open(p).convert('RGB') for p in ins]
h = int(w * ims[0].height / ims[0].width); cols = 2 if len(ims) <= 4 else 3; rows = math.ceil(len(ims) / cols)
M = Image.new('RGB', (cols * w, rows * h), (20, 20, 20)); d = ImageDraw.Draw(M)
for k, (im, p) in enumerate(zip(ims, ins)):
    x, y = (k % cols) * w, (k // cols) * h; M.paste(im.resize((w, h), Image.LANCZOS), (x, y))
    d.rectangle((x, y, x + 8 + 7 * len(p.split('/')[-1]), y + 16), fill=(0, 0, 0)); d.text((x + 4, y + 2), p.split('/')[-1], fill=(255, 255, 0))
M.save(out)
