# Before / after review sheet: python3 -P ab_sheet.py <olddir> <newdir> <out.jpg> key ...  (columns: old front, new front, old rear, new rear)
import sys, os
from PIL import Image, ImageDraw
o, n, out, keys = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
tw, th = 400, 250
M = Image.new('RGB', (tw * 4, th * len(keys)), (20, 20, 20)); d = ImageDraw.Draw(M)
for i, k in enumerate(keys):
    for j, (dd, v) in enumerate(((o, 'front'), (n, 'front'), (o, 'rear'), (n, 'rear'))):
        p = os.path.join(dd, f'{k}_{v}.png')
        if os.path.exists(p): M.paste(Image.open(p).convert('RGB').crop((80, 40, 560, 340)).resize((tw, th)), (j * tw, i * th))
        d.text((j * tw + 4, i * th + 3), f'{k} {"old" if j % 2 == 0 else "new"} {v}', fill=(255, 255, 0))
M.save(out, quality=90)
