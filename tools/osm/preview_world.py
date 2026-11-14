"""Preview PNG of the whole merged world from the build state (work/v.pkl).
tools/osm/.venv/bin/python tools/osm/preview_world.py [out.png] [--crop x0,z0,x1,z1] [--mpp 3]
"""
import os, pickle, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from config import REAL_RECT  # noqa: E402
from osmgeom import polys_only  # noqa: E402
from raster import X0, Z0, X1, Z1  # noqa: E402
from build import WORK, DOCS  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith('--')]
crop = None
mpp = None
for i, a in enumerate(sys.argv):
    if a == '--crop':
        crop = [float(v) for v in sys.argv[i + 1].split(',')]
    if a == '--mpp':
        mpp = float(sys.argv[i + 1])
args = [a for a in args if ',' not in a and not a.replace('.', '').isdigit()]
out = args[0] if args else os.path.join(DOCS, 'world_preview.png')
bx0, bz0, bx1, bz1 = crop or (X0, Z0, X1, Z1)
S = mpp or max((bx1 - bx0), (bz1 - bz0)) / 3400.0
W, H = int((bx1 - bx0) / S), int((bz1 - bz0) / S)
d = pickle.load(open(os.path.join(WORK, 'v.pkl'), 'rb'))


def T(c):
    return [((x - bx0) / S, (z - bz0) / S) for x, z in c]


def font(sz):
    try:
        return ImageFont.load_default(size=sz)
    except TypeError:
        return ImageFont.load_default()


SEA = (92, 152, 198)
img = Image.new('RGB', (W, H), SEA)
dr = ImageDraw.Draw(img, 'RGBA')


def fill(g, col, hole=SEA):
    for p in polys_only(g):
        b = p.bounds
        if b[2] < bx0 or b[0] > bx1 or b[3] < bz0 or b[1] > bz1:
            continue
        dr.polygon(T(p.exterior.coords), fill=col)
        for h in p.interiors:
            if hole is not None:
                dr.polygon(T(h.coords), fill=hole)


fill(d['land'], (234, 229, 216))
for g, n, k in d['inland']:
    fill(g, (120, 176, 212), None)
C = {'park': (186, 220, 166), 'grass': (200, 228, 180), 'pitch': (168, 212, 158), 'wild': (170, 200, 150), 'garden': (190, 224, 170),
     'sand': (246, 228, 170), 'dune': (240, 222, 168), 'parking': (214, 211, 204), 'plaza': (228, 214, 200), 'paved': (220, 216, 208),
     'dirt': (214, 198, 168), 'construction': (214, 198, 168), 'marina': (208, 210, 216), 'pool': (126, 198, 234),
     'playground': (200, 228, 190), 'island': (200, 225, 185), 'golf': (170, 218, 160), 'cemetery': (190, 214, 180),
     'forest': (120, 170, 112), 'pine': (112, 160, 118), 'scrub': (176, 196, 140), 'sawgrass': (196, 204, 128), 'wetland': (150, 190, 160),
     'mangrove': (104, 150, 110), 'farmland': (218, 206, 150), 'grove': (170, 200, 120), 'campground': (196, 206, 160),
     'runway': (120, 120, 126), 'taxiway': (150, 150, 156), 'apron': (186, 186, 190), 'rock': (180, 176, 168), 'gravel': (196, 190, 180)}
for a in sorted(d['areas'], key=lambda a: -a['area']):
    if a['cls'] in C:
        fill(a['geom'], C[a['cls']], None)
for a in d.get('extra_areas', []):
    fill(a['geom'], (70, 150, 170, 120), None)
if S <= 2.5:
    for p in d['sw_polys']:
        fill(p, (206, 203, 198), None)
ROAD = {'motorway': (226, 112, 84), 'trunk': (238, 150, 84), 'primary': (248, 196, 100), 'secondary': (250, 224, 136)}
for e in sorted(d['edges'], key=lambda e: (e['kind'].replace('_link', '') in ROAD, e['w'])):
    k = e['kind'].replace('_link', '')
    col = ROAD.get(k, (255, 255, 255) if k not in ('service', 'track') else (236, 234, 228))
    if e.get('outside') or e.get('link'):
        col = (255, 0, 255)
    w = max(1, int(round(e['w'] / S)))
    dr.line(T(e['pts']), fill=col, width=w)
for f in d['fws']:
    if S <= 2.5 or f.get('synthetic'):
        dr.line(T(f['line'].coords), fill=(190, 150, 120), width=1)
for p in d['piers']:
    fill(p['geom'], (150, 120, 90), None)
UC = {'hotel': (214, 120, 170), 'school': (240, 170, 60), 'university': (240, 170, 60), 'worship': (150, 110, 200), 'hospital': (230, 70, 70),
      'clinic': (230, 110, 110), 'police': (50, 90, 200), 'fire_station': (220, 60, 30), 'parking_garage': (150, 150, 160), 'fuel': (250, 120, 0),
      'supermarket': (40, 160, 80), 'office': (110, 140, 190), 'retail': (200, 150, 110), 'mall': (200, 120, 90), 'apartments': (188, 178, 170),
      'house': (200, 186, 170), 'cruise_terminal': (60, 150, 170), 'museum': (170, 130, 90), 'government': (120, 130, 170),
      'warehouse': (160, 150, 140), 'industrial': (150, 140, 130), 'station': (90, 90, 110)}
for b in d['bl']:
    col = UC.get(b.get('use'), (176, 168, 160))
    c = list(b['geom'].exterior.coords)
    if c[0][0] < bx0 - 200 or c[0][0] > bx1 + 200 or c[0][1] < bz0 - 200 or c[0][1] > bz1 + 200:
        continue
    dr.polygon(T(c), fill=col, outline=(120, 112, 104) if S <= 2.5 else None)
RC = {'people_mover': (0, 160, 220), 'metro': (20, 140, 60), 'rail': (70, 70, 70)}
for r in d['rails']:
    dr.line(T(r['pts']), fill=RC.get(r['kind'], (60, 60, 60)), width=2 if S > 2 else 3)
if S <= 2.5:
    for s in d['storefronts']:
        x, z = (s['fx'] - bx0) / S, (s['fz'] - bz0) / S
        dr.ellipse([x - 2, z - 2, x + 2, z + 2], fill=(220, 30, 60) if s['poi'] else (255, 200, 0))
    for st in d['transit']['stops']:
        x, z = (st['x'] - bx0) / S, (st['z'] - bz0) / S
        dr.rectangle([x - 2, z - 2, x + 2, z + 2], fill=(0, 90, 255))
for st in d['transit']['stations']:
    x, z = (st['x'] - bx0) / S, (st['z'] - bz0) / S
    dr.ellipse([x - 4, z - 4, x + 4, z + 4], fill=(255, 255, 255), outline=(0, 0, 0))
# real rectangle outline, labels
rx0, rz0, rx1, rz1 = REAL_RECT
dr.rectangle([(rx0 - bx0) / S, (rz0 - bz0) / S, (rx1 - bx0) / S, (rz1 - bz0) / S], outline=(200, 0, 0, 160), width=2)
f1, f2 = font(max(11, int(16 * 3.6 / max(S, 1)) if S > 2.5 else 15)), font(13)
import numpy as np  # noqa: E402
dl = d['dlab']
if not crop or True:
    for i, n in enumerate(d['dnames']):
        jj, ii = np.nonzero(dl == i)
        if len(ii) < 60:
            continue
        x, z = X0 + (ii.mean() + 0.5) * 8, Z0 + (jj.mean() + 0.5) * 8
        if bx0 <= x <= bx1 and bz0 <= z <= bz1:
            dr.text(((x - bx0) / S, (z - bz0) / S), n, fill=(30, 30, 60), font=f2, anchor='mm', stroke_width=2, stroke_fill=(255, 255, 255))
for sp in d['setpieces']:
    x, z = (sp['x'] - bx0) / S, (sp['z'] - bz0) / S
    dr.ellipse([x - 6, z - 6, x + 6, z + 6], fill=(255, 255, 255), outline=(200, 0, 0), width=2)
    dr.text((x + 9, z - 7), str(sp.get('id')), fill=(160, 0, 0), font=f2, stroke_width=2, stroke_fill=(255, 255, 255))
dr.text((10, H - 22), f'Port Solana V2 merged world, {S:.1f} m/px. Map data (c) OpenStreetMap contributors (ODbL) inside the red rectangle.', fill=(255, 255, 255), font=f2,
        stroke_width=2, stroke_fill=(0, 0, 0))
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out)
print('wrote', out, img.size)
