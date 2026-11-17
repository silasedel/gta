#!/usr/bin/env python
"""Stage 1 job 3 test: do the game's roads match the user's road map within about one road width?
Reads the PUBLISHED runtime road graph (public/assets/miami/<build>/roadgraph.json) so it tests what the game drives on.
  recall    = share of the map's road centerline pixels that have a game road within TOL
  precision = share of game road length that lies within TOL of a road drawn on the map
Writes docs/v2/shots/stage1/JOB3_overlay.png (map in gray, game roads: green = matched, red = off the map) and
docs/v2/reports/stage1-overlay.json.  TOL = 16 m (1.5 px at 11 m/px; a city street with sidewalks is ~15-20 m wide).
Run: tools/world/.venv/bin/python tools/v2/map3/overlay_test.py
"""
import json, os, math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.morphology import skeletonize

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
S, OX, OY = 11.0, 700.0, 800.0
TOL_M = 16.0
man = json.load(open(os.path.join(ROOT, 'public/assets/miami/world.json')))
rg = json.load(open(os.path.join(ROOT, 'public/assets/miami', man['dir'], man['files']['roadgraph'])))
q = 1.0 / man.get('q', 10)
nodes = rg['nodes']
K = 4   # supersample
img = Image.open(os.path.join(ROOT, 'docs/v2/plan/map_roads_target.webp')).convert('L')
W, H = img.size
g = np.asarray(img).astype(np.float32)
road = g > 165
road = ndimage.binary_closing(road, iterations=1)
lab, n = ndimage.label(road, structure=np.ones((3, 3))); sz = np.bincount(lab.ravel()); keep = sz >= 18; keep[0] = False; road = keep[lab]
skel = skeletonize(road)
# exclude runways (drawn white but not roads)
RUN = [((513, 848), (628, 852), 14), ((518, 884), (625, 953), 10), ((225, 1386), (279, 1318), 9), ((262, 1302), (283, 1388), 9)]
yy, xx = np.mgrid[0:H, 0:W]
for (ax, ay), (bx, by), w in RUN:
    dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
    t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / L2, 0, 1)
    skel &= np.hypot(xx - ax - t * dx, yy - ay - t * dy) > w * 0.5 + 2
# rasterize game roads at K x
canvas = Image.new('L', (W * K, H * K), 0); d = ImageDraw.Draw(canvas)
segs = []
for e in rg['edges']:
    p = e.get('p')
    if p is None:
        pts = [nodes[e['a'] * 2: e['a'] * 2 + 2], nodes[e['b'] * 2: e['b'] * 2 + 2]]
    else:
        pts = [p[i:i + 2] for i in range(0, len(p), 2)]
    pts = [((x * q) / S + OX, (z * q) / S + OY) for x, z in pts]
    segs.append(pts)
    d.line([(x * K, y * K) for x, y in pts], fill=255, width=1)
game = np.asarray(canvas) > 0
game_px = game.reshape(H, K, W, K).any(axis=(1, 3))
tol = TOL_M / S
dist_to_game = ndimage.distance_transform_edt(~game_px)
dist_to_map = ndimage.distance_transform_edt(~skel)
recall = float((dist_to_game[skel] <= tol).mean())
gp = game_px & (np.ones_like(game_px))
precision = float((dist_to_map[game_px] <= tol + 0.5).mean())
res = dict(tolM=TOL_M, recall=round(recall, 4), precision=round(precision, 4), mapRoadPx=int(skel.sum()), gameRoadPx=int(game_px.sum()), build=man['dir'])
os.makedirs(os.path.join(ROOT, 'docs/v2/reports'), exist_ok=True)
json.dump(res, open(os.path.join(ROOT, 'docs/v2/reports/stage1-overlay.json'), 'w'), indent=1)
print(res)
# picture: map roads gray, missed map roads yellow, game roads green (matched) / red (off map)
out = np.zeros((H, W, 3), np.uint8); out[road] = (70, 70, 70)
out[skel & (dist_to_game > tol)] = (255, 220, 0)
okg = game_px & (dist_to_map <= tol + 0.5); out[okg] = (40, 220, 80); out[game_px & ~okg] = (255, 40, 40)
Image.fromarray(out).resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(ROOT, 'docs/v2/shots/stage1/JOB3_overlay.png'))
