"""Quick PNG preview of land polygons (cache/work/land.pkl) -> cache/work/land_preview.png"""
import os, pickle, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import bounds  # noqa: E402
from osmgeom import polys_only, CACHE  # noqa: E402

x0, z0, x1, z1 = bounds()
S = 4.0  # m per px
W, H = int((x1 - x0) / S), int((z1 - z0) / S)
d = pickle.load(open(os.path.join(CACHE, 'work', 'land.pkl'), 'rb'))
img = Image.new('RGB', (W, H), (40, 90, 140))
dr = ImageDraw.Draw(img)
T = lambda c: [((x - x0) / S, (z - z0) / S) for x, z in c]  # noqa: E731
for p in polys_only(d['land']):
    dr.polygon(T(p.exterior.coords), fill=(225, 215, 180))
    for h in p.interiors:
        dr.polygon(T(h.coords), fill=(60, 120, 190))
img.save(os.path.join(CACHE, 'work', 'land_preview.png'))
print(W, H)
