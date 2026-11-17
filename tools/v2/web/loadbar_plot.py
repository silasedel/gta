#!/usr/bin/env python3
# r2-web: progress-vs-time plot of loading-bar traces (tools/v2/web/loadbar.mjs). PIL only.
#   python3 tools/v2/web/loadbar_plot.py docs/v2/reports/web-loadbar-before.json docs/v2/reports/web-loadbar-after.json out.jpg
# Each trace: shown % against seconds since navigation (x axis = each boot's own time to READY), plus the ideal diagonal
# (a bar that tracks real time exactly). Labels of the longest stalls are written next to them.
import json, sys
from PIL import Image, ImageDraw, ImageFont

files, out = sys.argv[1:-1], sys.argv[-1]
W, H, L, R, T, B = 1600, 900, 90, 40, 60, 90
img = Image.new('RGB', (W, H), (18, 14, 26))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 14)
except Exception:
    font = small = ImageFont.load_default()
COLORS = [(255, 110, 90), (90, 210, 255), (140, 255, 140), (255, 210, 80)]
traces = []
for f in files:
    r = json.load(open(f))
    for bt in r['boots']:
        if bt.get('ready'):
            traces.append((r['set'] + (f" boot {bt['boot']}" if len(r['boots']) > 1 else ''), bt))
tmax = max(bt['ready'] for _, bt in traces) / 1000.0
px = lambda t: L + (W - L - R) * t / tmax
py = lambda v: H - B - (H - T - B) * v / 100.0
for v in range(0, 101, 10):
    d.line([(L, py(v)), (W - R, py(v))], fill=(45, 38, 58))
    d.text((L - 50, py(v) - 9), f'{v}%', fill=(170, 160, 190), font=small)
step = 5 if tmax < 80 else 10
t = 0
while t <= tmax:
    d.line([(px(t), T), (px(t), H - B)], fill=(38, 32, 50))
    d.text((px(t) - 10, H - B + 8), f'{t}s', fill=(170, 160, 190), font=small)
    t += step
d.text((L, 18), 'Loading bar: shown % vs time to READY (dashed = a bar that tracks time exactly)', fill=(240, 235, 245), font=font)
for i, (name, bt) in enumerate(traces):
    c = COLORS[i % len(COLORS)]
    ready = bt['ready'] / 1000.0
    # ideal diagonal for this boot
    for k in range(0, 40, 2):
        a0, a1 = k / 40.0, (k + 1) / 40.0
        d.line([(px(ready * a0), py(100 * a0)), (px(ready * a1), py(100 * a1))], fill=tuple(int(x * 0.45) for x in c), width=2)
    pts, last = [], 0
    for ms, v, _ in bt['samples']:
        t = ms / 1000.0
        if pts: pts.append((px(t), py(last)))
        pts.append((px(t), py(v))); last = v
    pts.append((px(ready), py(last))); pts.append((px(ready), py(100)))
    d.line(pts, fill=c, width=3)
    st = bt['stalls'][0] if bt['stalls'] else None
    lab = f"{name}: READY {ready:.1f}s, longest stall {st[0]/1000:.1f}s at {st[1]:.0f}%" if st else name
    d.text((L + 10, T + 10 + 24 * i), lab, fill=c, font=font)
img.save(out, quality=90)
print('wrote', out)
