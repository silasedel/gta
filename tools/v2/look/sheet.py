#!/usr/bin/env python3
# Look helper review sheets: one row per (spot, hour), one column per variant (left = before).
#   python3 tools/v2/look/sheet.py out.png --set r1 --spots nico_deck,downtown --hours 11,18h5 --vars old,new [--w 760]
#   python3 tools/v2/look/sheet.py --diff a.png b.png   (shimmer metric: mean / p99 abs difference of two still frames)
import sys, os
from PIL import Image, ImageDraw, ImageChops, ImageStat
D = 'docs/v2/shots/look'
a = sys.argv[1:]
if a and a[0] == '--diff':
    x, y = Image.open(a[1]).convert('L'), Image.open(a[2]).convert('L')
    d = ImageChops.difference(x, y); h = d.histogram(); n = sum(h)
    c, p99 = 0, 0
    for i, v in enumerate(h):
        c += v
        if c >= 0.99 * n: p99 = i; break
    print(f'mean {ImageStat.Stat(d).mean[0]:.3f} p99 {p99}'); sys.exit(0)
o = {}; out = a[0]; i = 1
while i < len(a): o[a[i][2:]] = a[i + 1]; i += 2
w = int(o.get('w', 760)); spots = o['spots'].split(','); hours = o['hours'].split(','); vars_ = o['vars'].split(',')
rows = [(s, h) for s in spots for h in hours]
h = int(w * 1080 / 1920)
M = Image.new('RGB', (w * len(vars_), h * len(rows)), (20, 20, 20)); dr = ImageDraw.Draw(M)
for r, (s, hr) in enumerate(rows):
    for c, v in enumerate(vars_):
        p = os.path.join(D, f"{o['set']}_{s}_{hr}{'_' + v if v else ''}.png")
        if not os.path.exists(p): continue
        M.paste(Image.open(p).convert('RGB').resize((w, h), Image.LANCZOS), (c * w, r * h))
        t = f'{s} {hr.replace("h", ".")}h  {v}'
        dr.rectangle((c * w, r * h, c * w + 8 + 7 * len(t), r * h + 16), fill=(0, 0, 0)); dr.text((c * w + 4, r * h + 2), t, fill=(255, 255, 0))
M.save(out); print(out)
