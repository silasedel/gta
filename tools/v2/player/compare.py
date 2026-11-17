#!/usr/bin/env python3
# Side-by-side review sheet: the user's Preview.png next to in-game shots (labels on top).
#   python3 tools/v2/player/compare.py out.png <img> [<img> ...]   (first image is usually the Preview)
import sys
from PIL import Image, ImageDraw
out, ins = sys.argv[1], sys.argv[2:]
H = 720
ims = []
for p in ins:
    im = Image.open(p).convert('RGB')
    im = im.resize((max(1, int(im.width * H / im.height)), H), Image.LANCZOS)
    ims.append((p.split('/')[-1], im))
W = sum(im.width for _, im in ims) + 8 * (len(ims) - 1)
M = Image.new('RGB', (W, H + 24), (18, 18, 18)); d = ImageDraw.Draw(M); x = 0
for name, im in ims:
    M.paste(im, (x, 24)); d.text((x + 6, 6), name, fill=(255, 220, 0)); x += im.width + 8
M.save(out)
print('[compare]', out, M.size)
