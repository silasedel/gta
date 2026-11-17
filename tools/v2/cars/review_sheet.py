# Front / rear review sheet per batch: python3 -P review_sheet.py <revdir> <out.jpg> key1 key2 ...  (2 columns: front | rear)
import sys, os
from PIL import Image, ImageDraw
d, out, keys = sys.argv[1], sys.argv[2], sys.argv[3:]
tw, th = 560, 350
M = Image.new('RGB', (tw * 2, th * len(keys)), (20, 20, 20)); dr = ImageDraw.Draw(M)
for i, k in enumerate(keys):
    for j, v in enumerate(('front', 'rear')):
        p = os.path.join(d, f'{k}_{v}.png')
        if os.path.exists(p): M.paste(Image.open(p).convert('RGB').resize((tw, th)), (j * tw, i * th))
    dr.rectangle((0, i * th, 90, i * th + 18), fill=(0, 0, 0)); dr.text((4, i * th + 3), k, fill=(255, 255, 0))
M.save(out, quality=90)
