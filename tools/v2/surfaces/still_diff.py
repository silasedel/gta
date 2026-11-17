#!/usr/bin/env python3
"""Still-camera shimmer check: compare <set>_<id>_on.png with <set>_<id>_still.png (same camera, 0.7 s later).
Reports the share of pixels in the lower 55 % (pavement) that changed by more than 12 / 30 levels, ignoring the HUD corners.
   python3 tools/v2/surfaces/still_diff.py t2   ->  prints a table, writes docs/v2/reports/surfaces-<set>-still.json"""
import json, sys, glob, os
import numpy as np
from PIL import Image

SET = sys.argv[1]
D = 'docs/v2/shots/surfaces'
out = {}
for f in sorted(glob.glob(f'{D}/{SET}_*_still.png')):
    i = os.path.basename(f)[len(SET) + 1:-len('_still.png')]
    a_path = f'{D}/{SET}_{i}_on.png'
    if not os.path.exists(a_path): a_path = f'{D}/{SET}_{i}.png'
    if not os.path.exists(a_path): continue
    a = np.asarray(Image.open(a_path).convert('L')).astype(np.int16)
    b = np.asarray(Image.open(f).convert('L')).astype(np.int16)
    h, w = a.shape
    y0 = int(h * 0.45)
    d = np.abs(a[y0:, :] - b[y0:, :])
    d[-int(h * 0.25):, :int(w * 0.17)] = 0  # minimap
    out[i] = {'gt12': round(float((d > 12).mean()) * 100, 3), 'gt30': round(float((d > 30).mean()) * 100, 3), 'mean': round(float(d.mean()), 3)}
    print(f'{i:28s} >12: {out[i]["gt12"]:6.3f} %  >30: {out[i]["gt30"]:6.3f} %  mean {out[i]["mean"]}')
os.makedirs('docs/v2/reports', exist_ok=True)
json.dump(out, open(f'docs/v2/reports/surfaces-{SET}-still.json', 'w'), indent=1)
