# 3-way sheet: python3 -P threeway.py out.jpg ref.png before.png after.png [crop x0,y0,x1,y1 as fractions of each image]
import sys
from PIL import Image, ImageDraw
out, paths = sys.argv[1], sys.argv[2:5]
crop = [float(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else [0, 0, 1, 1]
H = 620; tiles = []
for p in paths:
    im = Image.open(p).convert('RGB'); w, h = im.size
    im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    tiles.append(im.resize((int(im.width * H / im.height), H), Image.LANCZOS))
M = Image.new('RGB', (sum(t.width for t in tiles) + 16, H + 26), (18, 18, 18)); x = 0; d = ImageDraw.Draw(M)
for t, lab in zip(tiles, ('mock-up', 'before', 'after')):
    M.paste(t, (x, 26)); d.text((x + 6, 6), lab, fill=(255, 230, 120)); x += t.width + 8
M.save(out, quality=90); print(out)
