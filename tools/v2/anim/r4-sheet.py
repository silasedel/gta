#!/usr/bin/env python3
# r4-anim frame sheets: one JPG (q90) per case, a row of frames per tag (before / after), labeled.
#   python3 tools/v2/anim/r4-sheet.py   -> docs/v2/shots/anim/r4/sheet_<case>.jpg
import glob, os, re
from PIL import Image, ImageDraw
D = 'docs/v2/shots/anim/r4'
W = 400
files = glob.glob(f'{D}/*_*.jpg')
cases = {}
for f in files:
    m = re.match(r'(before|after)_(.+)_(\w+)\.jpg$', os.path.basename(f))
    if not m: continue
    tag, case, idx = m.groups()
    cases.setdefault(case, {}).setdefault(tag, []).append((idx, f))
for case, tags in cases.items():
    rows = [t for t in ('before', 'after') if t in tags]
    for t in rows: tags[t].sort(key=lambda x: (len(x[0]), x[0]))
    ncol = max(len(tags[t]) for t in rows)
    im0 = Image.open(tags[rows[0]][0][1]); h = int(W * im0.height / im0.width)
    S = Image.new('RGB', (ncol * W, len(rows) * h), (18, 18, 18)); d = ImageDraw.Draw(S)
    for r, t in enumerate(rows):
        for c, (idx, f) in enumerate(tags[t]):
            S.paste(Image.open(f).convert('RGB').resize((W, h), Image.LANCZOS), (c * W, r * h))
            lab = f'{t} {case} {idx}'
            d.rectangle((c * W, r * h, c * W + 8 + 6 * len(lab), r * h + 14), fill=(0, 0, 0)); d.text((c * W + 4, r * h + 2), lab, fill=(255, 230, 0))
    out = f'{D}/sheet_{case}.jpg'; S.save(out, quality=90); print(out, S.size)
