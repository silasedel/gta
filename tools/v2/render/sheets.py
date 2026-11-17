#!/usr/bin/env python3
# r2-render: A/B sheets from tools/v2/render/stab.mjs output (old | new per row, labeled), JPG q90.
#   python3 -I tools/v2/render/sheets.py <tag>
import sys, os
from PIL import Image, ImageDraw, ImageFont
tag = sys.argv[1]; R = 'docs/v2/shots/render/raw'; O = 'docs/v2/shots/render'
try: F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception: F = ImageFont.load_default()
def lab(im, t):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, 14 + 11 * len(t), 30], fill=(0, 0, 0)); d.text((6, 4), t, fill=(255, 255, 255), font=F); return im
def sheet(out, rows, w=800, crop=None):
    ims = []
    for name, cells in rows:
        r = []
        for m, p in cells:
            if not os.path.exists(p): continue
            im = Image.open(p).convert('RGB')
            if crop: W, H = im.size; im = im.crop((int(W * crop[0]), int(H * crop[1]), int(W * crop[2]), int(H * crop[3])))
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            r.append(lab(im, f'{name}: {m}'))
        if r: ims.append(r)
    if not ims: return
    cols = max(len(r) for r in ims); hs = [max(i.height for i in r) for r in ims]
    S = Image.new('RGB', (w * cols + 8 * (cols - 1), sum(hs) + 8 * (len(hs) - 1)), (18, 18, 18)); y = 0
    for r, h in zip(ims, hs):
        for k, i in enumerate(r): S.paste(i, (k * (w + 8), y))
        y += h + 8
    S.save(out, quality=90); print(out, S.size)
spots = ['deck', 'conv', 'shot12', 'street', 'trees']
sheet(f'{O}/sheet_{tag}_stills.jpg', [(s, [(m, f'{R}/{tag}_{s}_{m}.jpg') for m in ('old', 'new')]) for s in spots])
sheet(f'{O}/sheet_{tag}_zoom2x.jpg', [(s, [(m + ' 2x', f'{R}/{tag}_{s}_{m}_zoom.png') for m in ('old', 'new')]) for s in spots], w=760, crop=(0, 0, 0.5, 0.5))
sheet(f'{O}/sheet_{tag}_noise.jpg', [(s, [(m + ' frame-to-frame diff x8', f'{R}/{tag}_{s}_{m}_diff.jpg') for m in ('old', 'new')]) for s in spots], w=640)
sheet(f'{O}/sheet_{tag}_drive.jpg', [('drive 60 km/h', [(m, f'{R}/{tag}_drive_{m}_zoom.png') for m in ('old', 'new')])], w=900)
