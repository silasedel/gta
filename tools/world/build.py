#!/usr/bin/env python
"""Port Solana V2 world layout, traced from the user's official map image (references/ref_40_map_user_official.webp).
Run: tools/world/.venv/bin/python tools/world/build.py   (then audit.py and render.py)
Writes tools/world/out/features.json, heights.bin and public/assets/world/layout.json (deterministic)."""
import json, math, os, sys, time, traceback
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from scipy import ndimage
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union
from shapely import STRtree
from wl import real as R, land as LD, gen as G, roadnet as RN, trace as TR
from wl.world import World, RANK, Road
from wl.util import BOUNDS, REAL, CELL, NX, NZ, catmull, rng, plen, cumlen, point_at, heading_of, r2, resample, sdf, smoothstep, raster_polys, grid_xz, fbm

T0 = time.time()
ROOT, OUT = R.ROOT, R.OUT
W = World()
rd = R.load_real(); edge = R.edge_summary()
RX0, RX1, RZ0, RZ1 = REAL['minX'], REAL['maxX'], REAL['minZ'], REAL['maxZ']
realbox = sbox(RX0, RZ0, RX1, RZ1)
def PX(pts): return [TR.p2w(x, y) for x, y in pts]
def spl(pts, step=20): return catmull(pts, step=step)
def P(pts): return Polygon(pts).buffer(0)

# airport block transform: local block coords -> world (scale, rotate about the block center, translate)
XF = dict(ac=(-5010.0, -355.0), c=(-25450.0 + 30.0 * 595, -24890.0 + 30.0 * 885), sc=1.9, rot=math.radians(25.0))   # the image's airport position
def sh(pts):
    c_, s_ = math.cos(XF['rot']), math.sin(XF['rot']); out = []
    for x, z in pts:
        dx, dz = (x - XF['ac'][0]) * XF['sc'], (z - XF['ac'][1]) * XF['sc']
        out.append((XF['c'][0] + dx * c_ - dz * s_, XF['c'][1] + dx * s_ + dz * c_))
    return out
AP = P(sh([(-5960, -1040), (-4060, -1040), (-4060, 330), (-5960, 330)]))
# ---------------------------------------------------------------- 1. trace the image
C = TR.classify()
IH = C['land'].shape[0]            # the image is 1041 x 1511 (earlier passes assumed 1500 rows: 0.7 % north-south squeeze, fixed in pass 7)
assert abs(BOUNDS['maxZ'] - (TR.Z0 + TR.S * IH)) < 1.0, 'bounds must equal the image extent'
STAGED = bool(os.environ.get('WL_OUT'))
LAYOUT_PATH = os.path.join(OUT, 'layout.json') if STAGED else os.path.join(ROOT, 'public', 'assets', 'world', 'layout.json')
def strips(x0, y0, x1, y1, nmax, minfrac=0.3):
    """Pale pavement strips (runways) in an image window by an iterated Hough vote. Returns [(pxA, pxB, votes)]."""
    sub = C['rgb'][y0:y1, x0:x1]; mn = sub.mean(2); sat = sub.max(2) - sub.min(2)
    ok = sat < 26
    if ok.sum() < 50: return []
    ys_, xs_ = np.nonzero(ok & (mn > np.percentile(mn[ok], 80)))
    Pp = np.stack([xs_ + x0, ys_ + y0], 1).astype(np.float64); out = []; first = None
    for _ in range(nmax):
        if len(Pp) < 30: break
        best = None
        for ang in np.arange(0.0, 180.0, 1.5):
            t_ = math.radians(ang); nn = np.array([-math.sin(t_), math.cos(t_)]); d_ = Pp @ nn
            h_, ed = np.histogram(d_, bins=np.arange(d_.min() - 1, d_.max() + 2.5, 1.5)); k_ = int(h_.argmax())
            if best is None or h_[k_] > best[0]: best = (int(h_[k_]), ang, (ed[k_] + ed[k_ + 1]) / 2)
        cnt, ang, off = best
        if first is None: first = cnt
        elif cnt < minfrac * first: break
        t_ = math.radians(ang); uu = np.array([math.cos(t_), math.sin(t_)]); nn = np.array([-math.sin(t_), math.cos(t_)])
        sel = np.abs(Pp @ nn - off) < 1.6; al = Pp[sel] @ uu; a_, b_ = np.percentile(al, 2), np.percentile(al, 98)
        if cnt / max(1.0, b_ - a_) > 0.75 and b_ - a_ > 18: out.append((uu * a_ + nn * off, uu * b_ + nn * off, cnt))
        Pp = Pp[np.abs(Pp @ nn - off) > 3.5]
    return out
AIR_STRIPS = [(TR.p2w(*a_), TR.p2w(*b_), c_) for a_, b_, c_ in strips(515, 815, 675, 955, 4)]
TERN_STRIPS = [(TR.p2w(*a_), TR.p2w(*b_), c_) for a_, b_, c_ in strips(208, 1262, 348, 1408, 3, 0.25)]
print('measured runway strips: airport', [(round(math.hypot(b_[0] - a_[0], b_[1] - a_[1])), c_) for a_, b_, c_ in AIR_STRIPS], 'tern', [(round(math.hypot(b_[0] - a_[0], b_[1] - a_[1])), c_) for a_, b_, c_ in TERN_STRIPS], flush=True)
AIR_MEAS = len(AIR_STRIPS) >= 2
if AIR_MEAS:
    _a, _b, _ = max(AIR_STRIPS, key=lambda t: math.hypot(t[1][0] - t[0][0], t[1][1] - t[0][1]))
    _r = math.atan2(_b[1] - _a[1], _b[0] - _a[0])
    while _r > math.pi / 2: _r -= math.pi
    while _r <= -math.pi / 2: _r += math.pi
    XF['rot'] = _r
    AP = P(sh([(-5960, -1040), (-4060, -1040), (-4060, 330), (-5960, 330)])).union(unary_union([LineString([a_, b_]).buffer(160, cap_style=2) for a_, b_, _ in AIR_STRIPS])).convex_hull
def up(m): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((NX, NZ), Image.BICUBIC)).astype(np.float32) / 255.0
cache = os.path.join(R.CACHE, 'trace_land.npz')
key = f"pic8|{IH}|{os.path.getmtime(TR.IMG)}|{os.path.getmtime(TR.__file__)}|{TR.S}|{TR.X0}|{TR.Z0}|{CELL}"
if os.path.exists(cache) and str(np.load(cache)['key']) == key:
    mask = np.unpackbits(np.load(cache)['mask'])[:NZ * NX].reshape(NZ, NX).astype(bool)
else:
    m_img = ndimage.gaussian_filter(up(C['solid']), 1.2) > 0.5
    mask = m_img
    mask = LD._drop_small(mask, 5); mask = ~LD._drop_small(~mask, 5)
    np.savez_compressed(cache, mask=np.packbits(mask), key=key)
solid, ponds = LD.vectorize(mask)
land = unary_union(solid).buffer(0)
W.set_land(land)
REALKEEP = realbox.intersection(rd['land'].buffer(8)).intersection(land.buffer(8))     # real streets and buildings stay here (real land that is also image land)
W.real_keepout = REALKEEP
print(f'keepout {REALKEEP.area/1e6:.1f} km2 {time.time()-T0:.1f}s', flush=True)
print(f'traced land {len(solid)} polys, {len(ponds)} inland waters, {time.time()-T0:.1f}s')
_nowater = AP.buffer(25)
ponds = [q for p in ponds for q in (lambda g: (g.geoms if hasattr(g, 'geoms') else [g]))(p.difference(_nowater)) if q.geom_type == 'Polygon' and q.area > 150]
_st = STRtree(solid); _p2 = []
for p in ponds:
    ins = [solid[int(i)] for i in _st.query(p, predicate='contains')]
    if ins: p = p.difference(unary_union(ins))
    _p2 += [q for q in (p.geoms if hasattr(p, 'geoms') else [p]) if q.geom_type == 'Polygon' and q.area > 150]
ponds = _p2
ponds.sort(key=lambda p: -p.area)
for i, p in enumerate(ponds):
    comp = 4 * math.pi * p.area / (p.length ** 2)
    if i == 0: W.add_water(p, 'lake', 'Lake Amaro', depth=3.5); LAKE = p
    elif comp < 0.2: W.add_water(p, 'river', None, depth=2.0)
    elif p.area > 60000: W.add_water(p, 'lake', None, depth=2.5)
    else: W.add_water(p, 'pond' if comp > 0.45 else 'marsh_open', None, depth=1.2)
inland = unary_union([w['poly'] for w in W.water])
def mpolys(m, min_area, sigma=0.8): return LD._polys_from_mask((up(m) > 0.5) & mask, sigma=sigma, min_area=min_area)
for p in mpolys(C['sand'], 500):
    W.add_area(p, 'beach', block='reserved')
FOREST = [p for p in mpolys(C['forest'], 30000, 1.5) if not p.within(REALKEEP)]
for p in FOREST: W.add_area(p, 'forest')
URBAN = [q for p in mpolys(C['urban'], 12000, 1.5) for q in (lambda g: (g.geoms if hasattr(g, 'geoms') else [g]))(p.difference(REALKEEP.buffer(25))) if q.geom_type == 'Polygon' and q.area > 12000]
SHALLOW = LD._polys_from_mask((up(C['shallow']) > 0.5) & ~mask, sigma=1.0, min_area=6000)
for p_ in URBAN: W.add_area(p_, 'residential')
PAL = {k: [int(v) for v in np.median(C['rgb'][m_], axis=0)] for k, m_ in (('ocean', C['ocean'] & ~C['shallow']), ('shallow', C['shallow']), ('sand', C['sand'] & (C['rgb'][..., 0] - C['rgb'][..., 2] > 62) & (C['rgb'][..., 0] > 195)), ('urban', C['urban']), ('forest', C['forest']), ('land', C['green'] & ~C['forest']), ('water', C['inland']))}
json.dump(PAL, open(os.path.join(OUT, 'palette.json'), 'w'))
print(f'areas: forest {len(FOREST)} urban {len(URBAN)} shallow {len(SHALLOW)} {time.time()-T0:.1f}s')

# ---------------------------------------------------------------- names
WORDS = ('Heron Egret Ibis Pelican Osprey Anhinga Limpkin Spoonbill Tern Plover Sandpiper Gallinule Coot Kingfisher Mockingbird Cardinal Bunting Warbler Palmetto Sabal Cypress Mangrove Seagrape Gumbo Coontie Buttonwood Mahogany '
         'Poinciana Jacaranda Hibiscus Bougainvillea Oleander Frangipani Ixora Tamarind Sapodilla Mango Papaya Guava Lychee Avocado Carambola Kumquat Tangelo Valencia Navel Pomelo Calamondin Satsuma Honeybell Temple Murcott Tarpon Snook '
         'Bonefish Redfish Pompano Grouper Snapper Wahoo Marlin Sailfish Mullet Cobia Permit Tripletail Sheepshead Ladyfish Conch Coquina Whelk Scallop Cowrie Junonia Sundial Starfish Sanddollar Driftwood Sandbar Tideline Seabreeze Doldrum '
         'Squall Calusa Tequesta Timucua Jororo Mayaimi Marisol Paloma Brisa Corazon Estrella Luna Soledad Dulce Azul Dorado Sereno Pescador Faro Arena Indigo Coral Jade Amber Saffron Vermilion Cobalt Sienna Turquoise Opal Pearl Onyx Garnet '
         'Topaz Schooner Ketch Sloop Skiff Dinghy Catboat Trawler Mariner Compass Sextant Anchor Halyard Bowline Capstan Windlass Gunwale').split()
SUF = ['Street', 'Lane', 'Court', 'Way', 'Drive', 'Terrace', 'Place', 'Circle', 'Avenue', 'Road', 'Trail', 'Row', 'Walk', 'Bend', 'Run', 'Crossing', 'Loop', 'Path', 'Landing', 'Pass']
_used = set()
def namer(tag):
    rr = rng('names', tag); order = [(w, s) for s in SUF for w in WORDS]; rr.shuffle(order); st = {'i': 0}; cache = {}
    def f(k=None):
        if k is not None and k in cache: return cache[k]
        while True:
            w, s = order[st['i'] % len(order)]; st['i'] += 1; nm = f'{w} {s}'
            if nm not in _used: _used.add(nm); break
        if k is not None: cache[k] = nm
        return nm
    return f

# ---------------------------------------------------------------- 2. main roads, hand-digitized in image pixels
def main(px, kind, name, ref='', lanes=2, **kw):
    lf = max(1, lanes // 2)
    return W.road(resample(spl(PX(px)), 22), kind, name, ref=ref, lf=lf, lb=lf, **kw)
ROADS = {}
# maproads track: main roads re-routed along the picture's own roads (least-cost path on the traced road raster between the
# waypoints of the old hand-digitized lines) plus the traced rural network; data in tools/v2/maproads/out/maproads.json
# (built by tools/v2/maproads/trace.py, vectorize.py, curate.py). Set NO_MAPROADS=1 to build without it.
_MRP = os.path.join(ROOT, 'tools', 'v2', 'maproads', 'out', 'maproads.json')
MR = json.load(open(_MRP)) if os.path.exists(_MRP) and not os.environ.get('NO_MAPROADS') else None
def MRC(key, default): return [tuple(p_) for p_ in MR['main'][key]['px']] if MR and key in MR['main'] else default
RING = RN.Motorway(W, PX(MRC('ring', [(780.67, 738.17), (795, 660), (800, 580), (790, 500), (770, 420), (735, 330), (690, 265), (610, 215), (520, 205), (440, 235), (375, 290), (345, 360), (330, 420), (322, 500),
                           (320, 580), (325, 660), (335, 740), (355, 790), (430, 805), (500, 815), (570, 810), (640, 800), (721.67, 800)])), 'Cypress Belt Parkway', 'SR 836', lanes=3, region='hwy')
W.road([(-2030, -2745), RING.fwd.pts[0]], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True); W.road([RING.back.pts[-1], (-2030, -2745)], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True)
W.road([RING.fwd.pts[-1], (-3800, -890)], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True); W.road([(-3800, -890), RING.back.pts[0]], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True)
ROADS['central'] = main(MRC('central', [(610, 215), (600, 300), (595, 380), (590, 430), (590, 520), (590, 600), (592, 700), (596, 808)]), 'trunk', 'Citrus Belt Highway', 'US-27', 6)
ROADS['cross_a'] = main(MRC('cross_a', [(320, 580), (450, 598), (590, 600), (700, 585), (797, 560)]), 'trunk', 'Corkwood Road', 'SR 49', 6)
ROADS['cross_b'] = main(MRC('cross_b', [(322, 500), (450, 515), (590, 520), (700, 515), (790, 500)]), 'trunk', 'Lake Amaro Road', 'CR 720', 6)
ROADS['a1a'] = main(MRC('a1a', [(977.33, 738.17), (962, 700), (945, 645), (925, 605), (895, 575), (860, 545), (845, 480), (825, 410), (800, 345), (770, 315), (735, 330)]), 'primary', 'Ocean Drive North', 'SR A1A', zl='strip_small', zr='strip_small')
ROADS['calabash'] = main(MRC('calabash', [(330, 420), (300, 412), (250, 425), (212, 440)]), 'secondary', 'Calabash Causeway', 'CR 64')
ROADS['marisol'] = main(MRC('marisol', [(335, 740), (300, 790), (272, 832)]), 'secondary', 'Marisol Road', 'CR 41')
ROADS['west'] = main(MRC('west', [(355, 790), (345, 860), (370, 930), (410, 1000), (440, 1070), (500, 1085), (560, 1075), (600, 1062)]), 'primary', 'Tamiami Trail', 'US-41')
ROADS['us1'] = main([(738.33, 921.17), (705, 960), (655, 1010), (612, 1050), (600, 1062), (620, 1130), (628, 1190), (640, 1235), (625, 1270), (600, 1310), (570, 1350), (548, 1372), (500, 1392), (465, 1396), (420, 1388),
                     (370, 1378), (332, 1366), (300, 1352)], 'trunk', 'Overseas Highway', 'US-1', 2, tags={'verge': 3.5})
US1 = ROADS['us1']
if MR:   # rural four- and six-lane highways (maproads track): 95 km/h like the real Florida arterials of this type
    for k_ in ('central', 'cross_a', 'cross_b'): ROADS[k_].speed = 95
if MR and 'diag' in MR['main']:
    _dg = PX(MRC('diag', []))
    _wl = LineString(ROADS['west'].pts); _q0 = _wl.interpolate(_wl.project(Point(_dg[min(8, len(_dg) - 1)])))
    _dg = [(_q0.x, _q0.y)] + [p_ for p_ in _dg[8:]]
    ROADS['diag'] = W.road(resample(spl(_dg), 22), 'trunk', MR['main']['diag']['name'], ref=MR['main']['diag']['ref'], lf=2, lb=2, speed=95)
if MR and 'diag_n' in MR['main']:
    _dn = PX(MRC('diag_n', []))
    _cl_ = LineString(ROADS['cross_a'].pts); _q1 = _cl_.interpolate(_cl_.project(Point(_dn[min(4, len(_dn) - 1)])))
    _dn = [(_q1.x, _q1.y)] + _dn[4:-1] + [(-3800.0, -2745.0)]                      # ends on the West Line Ave / NW 30th St corner
    ROADS['diag_n'] = W.road(resample(spl(_dn), 22), 'primary', MR['main']['diag_n']['name'], ref=MR['main']['diag_n']['ref'], lf=2, lb=2, speed=80)
def hook(pt, reach=150.0):
    s_ = RING.nearest_s(pt)
    for fwd in (True, False):
        car = RING.fwd if fwd else RING.back
        for ss, off in (((s_ - reach) if fwd else (s_ + reach), True), ((s_ + reach) if fwd else (s_ - reach), False)):
            if not (8 < ss < RING.length - 8): continue
            q_, t_ = RING.carriage_point(ss, fwd); q_ = RN.snap_on(car, q_)
            if off: RN.ramp(W, q_, t_, pt, RN._dir(q_, pt), region='hwy', tags={'ramp': 'off'})
            else: RN.ramp(W, pt, RN._dir(pt, q_), q_, t_, region='hwy', tags={'ramp': 'on'})
for k_, ends in (('central', (0, -1)), ('cross_a', (0, -1)), ('cross_b', (0, -1)), ('a1a', (-1,)), ('calabash', (0,)), ('marisol', (0,)), ('west', (0,))):
    for e_ in ends: hook(ROADS[k_].pts[e_])
_rc = Point(TR.p2w(862, 639)); RING_ISLAND = None
_li0, _n0 = ndimage.label(C['inland']); _yy, _xx = np.ogrid[:IH, :1041]
_near = np.unique(_li0[(np.hypot(_xx - 862, _yy - 639) < 75) & (_li0 > 0)])
_ringw = ndimage.binary_dilation(np.isin(_li0, _near), iterations=3)                       # the ring canal, bridge gaps closed
_im = ndimage.binary_erosion(ndimage.binary_fill_holes(_ringw) & ~_ringw, iterations=1) & C['land']
_cands = [g for g in mpolys(_im, 15000, 1.5) if g.distance(_rc) < 1500] if _im.sum() > 20 else []
if _cands:
    RING_ISLAND = max(_cands, key=lambda g: g.area).buffer(60).intersection(land.difference(inland.buffer(4)))
    RING_ISLAND = max((RING_ISLAND.geoms if hasattr(RING_ISLAND, 'geoms') else [RING_ISLAND]), key=lambda g: g.area)
    _in = RING_ISLAND.buffer(-45)
    if not _in.is_empty and _in.geom_type == 'Polygon':
        _lp = [r2(p) for p in resample(list(_in.exterior.coords), 25)]
        ROADS['corona_loop'] = W.road(_lp, 'tertiary', 'Corona Loop', region='Corona Island', tags={'nolots': 1})
        for nm_, key_ in (('Corona Bridge North', min), ('Corona Bridge South', max)):
            p0_ = key_(_lp, key=lambda q: q[1]); sg = -1 if key_ is min else 1; end_ = None
            for d_ in range(20, 900, 10):
                q_ = Point(p0_[0], p0_[1] + sg * d_)
                if land.contains(q_) and not RING_ISLAND.buffer(5).contains(q_): end_ = (p0_[0], p0_[1] + sg * (d_ + 45)); break
            if end_: ROADS['corona_' + nm_[-5:]] = W.road([p0_, end_], 'secondary', nm_, region='Corona Island', tags={'nolots': 1})
        W.add_area(RING_ISLAND.buffer(-70), 'golf', 'Corona Island Golf Links')
print('ring island', None if RING_ISLAND is None else round(RING_ISLAND.area / 1e4, 1), 'ha', flush=True)
COLW = W.road([(-3800, -2745), (-3800, 2745)], 'secondary', 'West Line Avenue', zl='strip_small', region='fringe')
COLN = W.road([(-3800, -2745), (-2030, -2745)], 'tertiary', 'NW 30th Street', region='fringe')
COLB = W.road([(1800, -2745), (4080, -2745)], 'tertiary', 'W 47th Street', region='fringe')
COLS = W.road([(-3800, 2745), (-3000, 2745)], 'tertiary', 'SW 28th Road', region='fringe')
COLV = W.road([(1370, 2745), (1820, 2745)], 'tertiary', 'Virginia Beach Drive', region='fringe')
NORMAL = {'north': (0, -1), 'south': (0, 1), 'west': (-1, 0), 'east': (1, 0)}
KMAP = {'unclassified': 'residential', 'living_street': 'residential', 'trunk_link': 'trunk', 'primary_link': 'primary', 'secondary_link': 'secondary', 'tertiary_link': 'tertiary', 'motorway': 'trunk', 'motorway_link': 'trunk'}
njoin = 0
lb3 = land.buffer(3)
for side, Sd in (edge['sides'].items() if edge else []):
    nx, nz = NORMAL[side]
    for e in Sd['roads']:
        x, z = e['x'], e['z']; kind = KMAP.get(e['kind'], e['kind'])
        if kind not in RANK: continue
        q = (-3800.0, z) if side == 'west' else (x, -2745.0) if side == 'north' else (x, 2745.0) if side == 'south' else None
        if q is None or not lb3.contains(Point((x + q[0]) / 2, (z + q[1]) / 2)): continue
        flow = e.get('flow', 'both'); one = flow in ('in', 'out')
        lo, li = max(e.get('lanesOut', 1), 0), max(e.get('lanesIn', 1), 0)
        r = W.road([(x, z), q] if flow != 'in' else [q, (x, z)], kind, e.get('name') or ('Interstate 95' if 'I 95' in (e.get('ref') or '') else ''), ref=e.get('ref') or '', lf=max(1, lo if flow != 'in' else li),
                   lb=0 if one else max(1, li), oneway=one, region='join')
        r.tags['join'] = dict(x=x, z=z, osm=e.get('ref') or e.get('name') or e['kind'], osmWay=e.get('osmWay')); njoin += 1
print('joins', njoin)

# ---------------------------------------------------------------- 3. set-piece lots on the Keys strip (before any local street)
u1 = LineString(US1.pts)
sA, sB = u1.project(Point(TR.p2w(640, 1235))), u1.project(Point(TR.p2w(548, 1372)))
def on_keys(frac, off, side_bay=True):
    s = sA + (sB - sA) * frac
    x, z, dx, dz = point_at(US1.pts, s)
    nx, nz = -dz, dx                                   # right of travel (heading south-west down the chain)
    bay = (nx * -1 + nz * -1) > 0                      # bay side looks north-west
    if bay != side_bay: nx, nz = -nx, -nz
    return x, z, dx, dz, nx, nz
def lot(cx, cz, dx, dz, nx, nz, along, deep):
    return Polygon([(cx - dx * along / 2 - nx * deep / 2, cz - dz * along / 2 - nz * deep / 2), (cx + dx * along / 2 - nx * deep / 2, cz + dz * along / 2 - nz * deep / 2),
                    (cx + dx * along / 2 + nx * deep / 2, cz + dz * along / 2 + nz * deep / 2), (cx - dx * along / 2 + nx * deep / 2, cz - dz * along / 2 + nz * deep / 2)])
LOTS = []
best = None
u1b = u1.buffer(US1.width / 2 + 8)
for need_side, fr_ in [(ns, 0.06 + 0.01 * k) for ns in (True, False) for k in range(40)]:
    x, z, dx, dz, nx, nz = on_keys(fr_, 0)
    dc = next((d for d in range(20, 700, 2) if not land.contains(Point(x + nx * d, z + nz * d))), 300)
    for back in range(40, 96, 4):
        cd = dc - back
        if cd < 46: break
        L_ = lot(x + nx * cd, z + nz * cd, dx, dz, nx, nz, 60, 60)
        cx_, cz_ = x + nx * cd, z + nz * cd
        side_wet = not land.contains(Point(cx_ - nz * 48, cz_ + nx * 48))          # local +X of the house (front faces the road)
        if land.contains(L_.buffer(7)) and not L_.intersects(u1b) and not L_.intersects(inland) and (side_wet or not need_side):
            best = (fr_, cd, dc, L_, side_wet); break
    if best: break
if best is None: best = (0.2, 60.0, 120.0, None, False)
x, z, dx, dz, nx, nz = on_keys(best[0], 0); cd, dc = best[1], best[2]
nico = (x + nx * cd, z + nz * cd); nico_lot = best[3] or lot(nico[0], nico[1], dx, dz, nx, nz, 60, 60)
PIN = (-7064.99, 13125.06, 1.0736); NICO_KEPT = False
_pnx, _pnz = -math.sin(PIN[2]), -math.cos(PIN[2]); _pl = lot(PIN[0], PIN[1], -_pnz, _pnx, _pnx, _pnz, 60, 60)
if land.contains(_pl) and not _pl.intersects(u1b) and not _pl.intersects(inland):
    _dc = next((d for d in range(20, 400, 2) if not land.contains(Point(PIN[0] + _pnx * d, PIN[1] + _pnz * d))), None)
    if _dc is not None and _dc < 110:
        _s = u1.project(Point(PIN[0], PIN[1])); x, z, dx, dz = point_at(US1.pts, _s); nx, nz = _pnx, _pnz
        cd = math.hypot(PIN[0] - x, PIN[1] - z); dc = cd + _dc; nico = (PIN[0], PIN[1]); nico_lot = _pl; NICO_KEPT = True
        best = (best[0], cd, dc, _pl, not land.contains(Point(PIN[0] - nz * 48, PIN[1] + nx * 48)))
LOTS.append(nico_lot)
W.setpiece('nico_house', nico[0], nico[1], heading_of(-nx, -nz), note='60 x 60 m lot on the bay side of the upper end of the Keys strip; back to the bay water (dock side), front toward the Overseas Highway', lot=[r2(p) for p in nico_lot.exterior.coords[:-1]],
           dock=[round(x + nx * (dc + 6), 1), round(z + nz * (dc + 6), 1)], water_distance=dc - cd - 30, water_on_plus_x_side=bool(best[4]))
if cd - 30 > 14: W.road([(x, z), (x + nx * (cd - 36), z + nz * (cd - 36))], 'residential', 'Pelican Point Lane', region='Key Paloma', tags={'nolots': 1})
W.path([(x + nx * (dc - 2), z + nz * (dc - 2)), (x + nx * (dc + 22), z + nz * (dc + 22))], 'dock', 2.0, 'wood', name="Nico's dock")
x, z, dx, dz, nx, nz = on_keys(0.5, 0)
bo = US1.width / 2 + 5.0 + 16.0
bar = (x + nx * bo, z + nz * bo); bar_lot = lot(bar[0], bar[1], dx, dz, nx, nz, 40, 32); LOTS.append(bar_lot)
W.setpiece('keys_bar', bar[0], bar[1], heading_of(-nx, -nz), note='40 x 32 m roadside lot on the bay side of the Overseas Highway, mid strip; front faces the highway', lot=[r2(p) for p in bar_lot.exterior.coords[:-1]])
x, z, dx, dz, nx, nz = on_keys(0.03, 0)
rx_, rz_ = -dz, dx
so = US1.width / 2 + 7.0
sign = (x + rx_ * so, z + rz_ * so); sign_lot = Point(sign).buffer(6.5); LOTS.append(sign_lot)
W.setpiece('keys_sign', sign[0], sign[1], heading_of(-dx, -dz), note='roadside verge on the inbound (southbound, right-hand) side where the Overseas Highway reaches the Keys strip; faces arriving traffic', verge_radius=6.5)
for L_ in LOTS: W.reserve(L_, 'reserved')
lots_u = unary_union([L_.buffer(9) for L_ in LOTS])

# ---------------------------------------------------------------- 4. airport (west of the real rectangle) and Tern Key Airfield
def area(pts, kind, name=None, block='reserved'): W.add_area(P(sh(pts)), kind, name, block=block)
def rw(a, b, w, kind='runway', name=None): W.add_area(LineString(sh([a, b])).buffer(w / 2, cap_style=2), kind, name, block='reserved')
def bld(pts, h, kind, style, zone='airport', **kw):
    q_ = sh(pts)
    if globals().get('_RWB') is not None and Polygon(q_).intersects(_RWB): return None
    return W.building(q_, h, kind, style, zone, check=False, **kw)
W.add_area(AP.intersection(land), 'grass', 'Solana International Airport')
if not AIR_MEAS:
    rw((-5900, 120), (-4150, 120), 60, name='Runway 10R/28L'); rw((-5900, -150), (-4150, -150), 60, name='Runway 10C/28C'); rw((-5900, -420), (-4750, -420), 45, name='Runway 10L/28R')
    rw((-5900, 20), (-4150, 20), 23, 'taxiway'); rw((-5900, -285), (-4750, -285), 23, 'taxiway')
    for x in (-5880, -5300, -4780): rw((x, -420), (x, 120), 23, 'taxiway')
    rw((-4180, -150), (-4180, 120), 23, 'taxiway'); rw((-4700, -700), (-4700, -150), 23, 'taxiway')
else:
    for i_, (a_, b_, _) in enumerate(sorted(AIR_STRIPS, key=lambda t: -math.hypot(t[1][0] - t[0][0], t[1][1] - t[0][1]))):
        W.add_area(LineString([a_, b_]).buffer(30 if i_ < 3 else 22, cap_style=2), 'runway', f'Runway {i_ + 1} (measured from the map image)', block='reserved')
        L_ = math.hypot(b_[0] - a_[0], b_[1] - a_[1]); ux_, uz_ = (b_[0] - a_[0]) / L_, (b_[1] - a_[1]) / L_
        sd = 1 if ((AP.centroid.x - a_[0]) * -uz_ + (AP.centroid.y - a_[1]) * ux_) > 0 else -1
        W.add_area(LineString([(a_[0] + ux_ * 60 - uz_ * sd * 150, a_[1] + uz_ * 60 + ux_ * sd * 150), (b_[0] - ux_ * 60 - uz_ * sd * 150, b_[1] - uz_ * 60 + ux_ * sd * 150)]).buffer(11, cap_style=2), 'taxiway', None, block='reserved')
        for f_ in (0.04, 0.5, 0.96): W.add_area(LineString([(a_[0] + ux_ * L_ * f_, a_[1] + uz_ * L_ * f_), (a_[0] + ux_ * L_ * f_ - uz_ * sd * 150, a_[1] + uz_ * L_ * f_ + ux_ * sd * 150)]).buffer(11, cap_style=2), 'taxiway', None, block='reserved')
_RWB = unary_union([LineString([a_, b_]).buffer(75, cap_style=2) for a_, b_, _ in AIR_STRIPS]) if AIR_MEAS else None
area([(-4690, -980), (-4150, -980), (-4150, -400), (-4690, -400)], 'apron', 'Terminal Apron'); area([(-5800, 180), (-4400, 180), (-4400, 320), (-5800, 320)], 'apron', 'Cargo and General Aviation Apron')
bld([(-4660, -760), (-4340, -760), (-4340, -680), (-4660, -680)], 16, 'terminal', 'terminal', name='Solana International Terminal', poi='terminal', region='airport')
for i, x in enumerate((-4640, -4500, -4360)): bld([(x - 14, -920), (x + 14, -920), (x + 14, -760), (x - 14, -760)], 11, 'terminal', 'terminal', name=f'Concourse {"ABC"[i]}', poi='gate', region='airport')
bld([(-4560, -630), (-4460, -630), (-4460, -440), (-4560, -440)], 18, 'parking', 'garage', name='Terminal Garage North', poi='parking', region='airport')
bld([(-4440, -630), (-4340, -630), (-4340, -440), (-4440, -440)], 18, 'parking', 'garage', name='Terminal Garage South', poi='parking', region='airport')
bld([(-4290, -640), (-4270, -640), (-4270, -620), (-4290, -620)], 62, 'tower', 'tower', name='Solana Tower', poi='control_tower', region='airport')
for i in range(6):
    x = -5750 + i * 190
    bld([(x, 240), (x + 150, 240), (x + 150, 310), (x, 310)], 13, 'hangar' if i > 2 else 'warehouse', 'hangar' if i > 2 else 'industrial', poi='hangar' if i > 2 else 'cargo_terminal', region='airport')
for i in range(5): bld(list(Point(-5850 + i * 40, -960).buffer(15, resolution=6).exterior.coords)[:-1], 12, 'storage_tank', 'industrial', poi='fuel_depot', region='airport')
bld([(-4290, -390), (-4080, -390), (-4080, -350), (-4290, -350)], 14, 'retail', 'garage', name='Rental Car Center', poi='car_rental', region='airport')
W.road(sh([(-4060, -1040), (-4060, 330), (-5960, 330), (-5960, -1040), (-4060, -1040)]), 'service', 'Perimeter Road', region='airport')
W.road(sh([(-4060, -310), (-4300, -310), (-4300, -660), (-4620, -660), (-4620, -310), (-4300, -310)]), 'secondary', 'Terminal Loop', lf=2, oneway=True, region='airport')
_ab = sh([(-4060, -310)])[0]
W.road([_ab, (-3800.0, _ab[1])], 'primary', 'Airport Boulevard', lf=2, lb=2, region='airport')
W.reserve(AP, 'reserved')
_p = lambda x, z: [round(v, 1) for v in sh([(x, z)])[0]]
def _far(a, b, d):
    (ax, az), (bx, bz) = sh([a])[0], sh([b])[0]; L_ = math.hypot(bx - ax, bz - az); return [round(bx + (bx - ax) / L_ * d, 1), round(bz + (bz - az) / L_ * d, 1)]
if AIR_MEAS:
    W.extra['airport_measured'] = [dict(a=[round(v, 1) for v in a_], b=[round(v, 1) for v in b_], lengthM=round(math.hypot(b_[0] - a_[0], b_[1] - a_[1])), bearingDeg=round(math.degrees(math.atan2(b_[0] - a_[0], -(b_[1] - a_[1]))) % 180, 1), votes=c_) for a_, b_, c_ in AIR_STRIPS]
W.extra['airport'] = dict(name='Solana International Airport', code='SOL', tower=_p(-4280, -630), measuredRunways=W.extra.get('airport_measured'), runways=[dict(name='10R/28L', a=_p(-5900, 120), b=_p(-4150, 120), width=60),
    dict(name='10C/28C', a=_p(-5900, -150), b=_p(-4150, -150), width=60), dict(name='10L/28R', a=_p(-5900, -420), b=_p(-4750, -420), width=45)],
    approaches=[dict(runway='28L', threshold=_p(-4150, 120), from_=_far((-5900, 120), (-4150, 120), 8000), glideDeg=5.0, note='from the east-south-east over the city and the bay; steep approach, obstacle heights not measured'),
                dict(runway='28C', threshold=_p(-4150, -150), from_=_far((-5900, -150), (-4150, -150), 8000), glideDeg=5.0), dict(runway='10R', threshold=_p(-5900, 120), from_=_far((-4150, 120), (-5900, 120), 6000), glideDeg=3.0),
                dict(runway='10C', threshold=_p(-5900, -150), from_=_far((-4150, -150), (-5900, -150), 6000), glideDeg=3.0)])
tc = TR.p2w(272, 1338)
_y0, _y1, _x0, _x1 = 1262, 1408, 208, 348
_sub = C['rgb'][_y0:_y1, _x0:_x1]; _mn = _sub.mean(axis=2); _gr = (np.abs(_sub[..., 0] - _sub[..., 1]) < 20) & (np.abs(_sub[..., 1] - _sub[..., 2]) < 24) & C['land'][_y0:_y1, _x0:_x1]
_ys, _xs = np.nonzero(_gr & (_mn > np.percentile(_mn[_gr], 86)))
_pts = np.stack([_xs + _x0, _ys + _y0], 1).astype(np.float64); _c = _pts.mean(0)
_ev, _vec = np.linalg.eigh(np.cov((_pts - _c).T)); _v = _vec[:, int(np.argmax(_ev))]
_t = (_pts - _c) @ _v; _a, _b = np.percentile(_t, 3), np.percentile(_t, 97)
RWA, RWB = TR.p2w(*(_c + _v * _a)), TR.p2w(*(_c + _v * _b))
if TERN_STRIPS: RWA, RWB = TERN_STRIPS[0][0], TERN_STRIPS[0][1]
elif not (700 < math.hypot(RWB[0] - RWA[0], RWB[1] - RWA[1]) < 4000): RWA, RWB = TR.p2w(268, 1288), TR.p2w(243, 1385)
if RWA[1] > RWB[1]: RWA, RWB = RWB, RWA                     # A = north end
_L = math.hypot(RWB[0] - RWA[0], RWB[1] - RWA[1]); _ux, _uz = (RWB[0] - RWA[0]) / _L, (RWB[1] - RWA[1]) / _L
_nx, _nz = (-_uz, _ux) if -_uz > 0 else (_uz, -_ux)        # normal pointing east (terminal side)
def TP(u, v): return (RWA[0] + _ux * u + _nx * v, RWA[1] + _uz * u + _nz * v)
def local_island(pt, radius):
    g = next((p for p in solid if p.contains(Point(pt))), None) or min(solid, key=lambda p: p.distance(Point(pt)))
    g = g.intersection(Point(pt).buffer(radius)).buffer(-45).buffer(45)          # drop the bridge strips the image draws as land
    parts = list(g.geoms) if hasattr(g, 'geoms') else [g]
    return min(parts, key=lambda q: q.distance(Point(pt))) if parts else Point(pt).buffer(300)
island = local_island(tc, 2600)
def tarea(g, kind, name=None): W.add_area(g.intersection(island.buffer(-12)), kind, name, block='reserved')
tarea(LineString([TP(0, 0), TP(_L, 0)]).buffer(28, cap_style=2), 'runway', 'Tern Key Runway (main)')
tarea(LineString([TP(40, -110), TP(_L - 40, -110)]).buffer(9, cap_style=2), 'taxiway', None)
for u_ in (40, _L * 0.5, _L - 40): tarea(LineString([TP(u_, 0), TP(u_, -110)]).buffer(9, cap_style=2), 'taxiway', None)
X2_MEASURED = len(TERN_STRIPS) >= 2
X2A, X2B = (TERN_STRIPS[1][0], TERN_STRIPS[1][1]) if X2_MEASURED else (RWA, RWA)
if X2_MEASURED: tarea(LineString([X2A, X2B]).buffer(17, cap_style=2), 'runway', 'Tern Key Runway (second, measured)')
for _e in TERN_STRIPS[2:]: tarea(LineString([_e[0], _e[1]]).buffer(12, cap_style=2), 'taxiway', None)
_ao = max(160.0, max((X2A[0] - RWA[0]) * _nx + (X2A[1] - RWA[1]) * _nz, (X2B[0] - RWA[0]) * _nx + (X2B[1] - RWA[1]) * _nz) + 80.0)
_apron = P([TP(_L * 0.55 - 150, _ao), TP(_L * 0.55 + 150, _ao), TP(_L * 0.55 + 150, _ao + 110), TP(_L * 0.55 - 150, _ao + 110)])
tarea(_apron, 'apron', 'Tern Key Airfield Apron')
W.building([TP(_L * 0.55 - 38, _ao + 116), TP(_L * 0.55 + 38, _ao + 116), TP(_L * 0.55 + 38, _ao + 142), TP(_L * 0.55 - 38, _ao + 142)], 6.5, 'terminal', 'terminal', 'airport', check=False, name='Tern Key Airfield Terminal', poi='terminal', region='Tern Key')
for i in range(3): W.building([TP(_L * 0.55 + 70 + i * 36, _ao + 116), TP(_L * 0.55 + 98 + i * 36, _ao + 116), TP(_L * 0.55 + 98 + i * 36, _ao + 144), TP(_L * 0.55 + 70 + i * 36, _ao + 144)], 7, 'hangar', 'hangar', 'airport', check=False, poi='hangar', region='Tern Key')
TERN_AF = island.buffer(-30)
W.add_area(TERN_AF.difference(LineString([TP(0, 0), TP(_L, 0)]).buffer(24, cap_style=2)), 'paved', 'Tern Key Airfield', block=None)
W.reserve(TERN_AF, 'reserved')
W.add_area(island.difference(island.buffer(-30)), 'beach', 'Tern Key shore', block=None)
_tf = TP(_L * 0.55, _ao + 150)
W.road([US1.pts[-1], _tf], 'tertiary', 'Airfield Road', region='Tern Key', tags={'nolots': 1})
W.extra['airfield'] = dict(name='Tern Key Airfield', runways=[dict(name='main', a=[round(v, 1) for v in RWA], b=[round(v, 1) for v in RWB], width=44), dict(name='second', a=[round(v, 1) for v in X2A], b=[round(v, 1) for v in X2B], width=34, measuredFromImage=True)][:2 if X2_MEASURED else 1],
                           terminal=[round(v, 1) for v in TP(_L * 0.55, _ao + 129)], bearingDeg=round(math.degrees(math.atan2(_ux, -_uz)) % 360, 1))
XF.update(ac=(-4575.0, 6045.0), c=tc, sc=1.0, rot=0.0)

# ---------------------------------------------------------------- 4b. traced rural network from the picture (maproads track)
# Every extra road from tools/v2/maproads/out/maproads.json. Ends that met a main road in the picture are put exactly on that
# main road (T junction); ends at the motorway ring are paired across it (one road passing over / under) or stopped short of it.
MAPROADS_KM = 0.0
if MR:
    _mains = {k_: LineString(v_.pts) for k_, v_ in ROADS.items() if v_ is not None}
    _ringc = LineString(RING.center)
    _avoid = unary_union([AP.buffer(15), TERN_AF.buffer(10), lots_u.buffer(6), REALKEEP.buffer(20)])
    _cands = []
    for rd_ in MR['roads']:
        pts_ = [tuple(p_) for p_ in rd_['pts']]
        if len(pts_) < 2: continue
        for end_ in (0, -1):
            p_ = Point(pts_[end_])
            if _ringc.distance(p_) < 140: continue                       # handled below
            best_ = min(((ln_.distance(p_), ln_) for ln_ in _mains.values()), key=lambda t: t[0])
            if best_[0] < 160:
                q_ = best_[1].interpolate(best_[1].project(p_)); q_ = (q_.x, q_.y)
                if end_ == 0: pts_.insert(0, q_)
                else: pts_.append(q_)
        _cands.append([rd_, pts_])
    # pair ends at the ring across it
    _rend = []
    for i_, (rd_, pts_) in enumerate(_cands):
        for end_ in (0, -1):
            if _ringc.distance(Point(pts_[end_])) < 140: _rend.append((i_, end_))
    _paired = set()
    for a_ in range(len(_rend)):
        for b_ in range(a_ + 1, len(_rend)):
            (i1, e1), (i2, e2) = _rend[a_], _rend[b_]
            if i1 == i2 or (i1, e1) in _paired or (i2, e2) in _paired: continue
            p1, p2 = _cands[i1][1][e1], _cands[i2][1][e2]
            if math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < 260 and LineString([p1, p2]).crosses(_ringc):
                if e1 == 0: _cands[i1][1].insert(0, p2)
                else: _cands[i1][1].append(p2)
                _paired.add((i1, e1)); _paired.add((i2, e2))
    # the longest roads that end at the ring get their own interchange (4 ramps, as the main roads), at least 1.5 km apart
    _hs = [RING.nearest_s(ROADS[k_].pts[e_]) for k_, ends in (('central', (0, -1)), ('cross_a', (0, -1)), ('cross_b', (0, -1)), ('a1a', (-1,)), ('calabash', (0,)), ('marisol', (0,)), ('west', (0,))) for e_ in ends]
    _nh = 0; _glen = {}
    for rd_, pts_ in _cands:
        if len(pts_) > 1: _glen[rd_['name']] = _glen.get(rd_['name'], 0) + LineString(pts_).length
    for i_, end_ in sorted([t for t in _rend if t not in _paired], key=lambda t: -_glen.get(_cands[t[0]][0]['name'], 0)):
        pts_ = _cands[i_][1]
        if len(pts_) < 2 or _glen.get(_cands[i_][0]['name'], 0) < 1000 or _nh >= 24: continue
        s_ = RING.nearest_s(pts_[end_])
        if min([abs(s_ - h_) for h_ in _hs] + [1e9]) < 1100 or not (400 < s_ < RING.length - 400): continue
        q_ = _ringc.interpolate(_ringc.project(Point(pts_[end_]))); q_ = (q_.x, q_.y)
        ln_ = LineString(pts_); cut_ = ln_.difference(_ringc.buffer(60))
        g_ = max((cut_.geoms if hasattr(cut_, 'geoms') else [cut_]), key=lambda g: g.length) if not cut_.is_empty else None
        if g_ is None or g_.length < 200: continue
        cc_ = list(g_.coords)
        cc_ = (cc_ + [q_]) if math.hypot(cc_[-1][0] - q_[0], cc_[-1][1] - q_[1]) < math.hypot(cc_[0][0] - q_[0], cc_[0][1] - q_[1]) else ([q_] + cc_)
        _cands[i_][1] = cc_; hook(q_); _hs.append(s_); _paired.add((i_, end_)); _nh += 1
    print('maproads: extra ring interchanges', _nh, flush=True)
    for i_, end_ in _rend:
        if (i_, end_) in _paired: continue
        pts_ = _cands[i_][1]; ln_ = LineString(pts_)
        if ln_.length < 200: _cands[i_][1] = []; continue
        cut_ = ln_.difference(_ringc.buffer(55))
        g_ = max((cut_.geoms if hasattr(cut_, 'geoms') else [cut_]), key=lambda g: g.length) if not cut_.is_empty else None
        _cands[i_][1] = list(g_.coords) if g_ is not None and g_.length > 60 else []
    _nmr = 0
    for rd_, pts_ in _cands:
        if len(pts_) < 2: continue
        ln_ = LineString(pts_)
        if ln_.length < 40 or ln_.intersects(_avoid): continue
        W.road(pts_, rd_['kind'] if rd_['kind'] != 'unclassified' else 'residential', rd_['name'], lf=1, lb=1,
               oneway=False, surface=rd_.get('surface'), region='maproads', tags={'maproads': 1, 'nolots': 1})
        MAPROADS_KM += ln_.length / 1000; _nmr += 1
    print('maproads: traced roads added', _nmr, round(MAPROADS_KM, 1), 'km', flush=True)

# ---------------------------------------------------------------- 5. towns inside the traced urban outlines
ANCH = [('Key Paloma', 600, 1305), ('Tern Key', 275, 1340), ('Coontie', 600, 1085), ('Shellmound', 440, 1075), ('Punta Marisol', 290, 830), ('Port Calabash', 245, 425),
        ('Port Cassia', 795, 515), ('Amaro Landing', 590, 490), ('Playa Serena', 750, 330), ('Citrus Flats', 710, 590), ('Brisa Heights', 690, 960), ('Allapattah West', 700, 620)]
EXTRA = ['Sabal Grove', 'Limpkin Park', 'Tangelo', 'Gumbo Limbo', 'Corkwood', 'Seagrape Heights', 'Buttonwood', 'Sandspur', 'Mullet Creek', 'Honeybell', 'Spoonbill Flats', 'Calamondin', 'Junonia', 'Whelk Harbor', 'Satsuma']
dry = land.difference(inland.buffer(10)).buffer(-14)
keep_out = unary_union([AP.buffer(12), TERN_AF.buffer(10), lots_u, REALKEEP.buffer(15)])
_gray = C['rgb'].mean(axis=2); _gx = ndimage.sobel(_gray, axis=1); _gy = ndimage.sobel(_gray, axis=0); _gm = np.hypot(_gx, _gy); _ga = np.degrees(np.arctan2(_gy, _gx)) % 90.0
from PIL import ImageDraw as _IDr
def town_px_mask(poly):
    im_ = Image.new('L', (1041, IH), 0); dd_ = _IDr.Draw(im_)
    for g_ in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
        if g_.geom_type == 'Polygon': dd_.polygon([TR.w2p(x, z) for x, z in g_.exterior.coords], fill=255)
    return np.asarray(im_) > 0
def picture_grid_angle(poly, fallback):
    m_ = town_px_mask(poly) & C['urban']
    if m_.sum() < 120: return fallback, False
    h_, ed = np.histogram(_ga[m_], bins=18, range=(0, 90), weights=_gm[m_]); k_ = int(h_.argmax())
    if h_[k_] < 1.25 * h_.mean(): return fallback, False
    return math.radians((ed[k_] + ed[k_ + 1]) / 2.0), True
DISTRICTS = []
def district_of(nm, poly):
    m_ = town_px_mask(poly) & C['urban']; cpx = TR.w2p(poly.centroid.x, poly.centroid.y)
    if m_.sum() < 20: m_ = town_px_mask(poly)
    px_ = C['rgb'][m_]; tint = np.median(px_, axis=0) if len(px_) else np.array([200, 196, 188.0])
    warm = px_[np.argsort(px_[:, 0] - px_[:, 2])[-max(1, len(px_) // 4):]] if len(px_) else px_
    roof = np.median(warm, axis=0) if len(warm) else tint
    sat = float(tint.max() - tint.min()); area_ha = poly.area / 1e4
    if nm == 'Amaro Landing': typ = 'rural_florida'
    elif nm == 'West End': typ = 'old_town'
    elif 'Shore' in nm or 'Outskirts' in nm: typ = 'suburb'
    elif nm in ('Key Paloma', 'Tern Key', 'Tamarind Key') or (cpx[0] > 895 and 590 < cpx[1] < 905): typ = 'resort'
    elif 690 < cpx[0] < 815 and 640 < cpx[1] < 915 and area_ha > 25: typ = 'downtown'
    elif roof[0] - roof[2] > 46: typ = 'old_town'
    elif 800 < cpx[0] < 935 and 838 < cpx[1] < 908 and sat < 16: typ = 'industrial_port'
    elif area_ha < 60: typ = 'rural_town'
    else: typ = 'suburb'
    d_ = dict(name=nm, type=typ, tint='#%02x%02x%02x' % tuple(int(v) for v in tint), roofTint='#%02x%02x%02x' % tuple(int(v) for v in roof), areaHa=round(area_ha, 1))
    DISTRICTS.append(d_); return d_
# ---- counted towns (maproads track): each town gets exactly the number of streets ref_40 shows (tools/v2/maproads/towns.json),
# at real small-town block sizes (cross-street spacing 110-150 m, long-street spacing 90-130 m; smaller only where the land is
# too narrow), centered on the traced outline, oriented by the picture's grid angle with the long streets on the outline's long
# axis. The middle long street is the town's Main Street (shop frontage); the block beside it at the center is a free town square.
_TCP = os.path.join(ROOT, 'tools', 'v2', 'maproads', 'towns.json')
TOWN_SPEC = json.load(open(_TCP))['towns'] if MR and os.path.exists(_TCP) else {}
TOWN_COUNTS = {}; TOWN_SQUARES = {}
def counted_town(nm, d, ang, region, avoid=None):
    sp_ = TOWN_SPEC.get(nm)
    if not sp_ or d is None or d.is_empty: return None
    nl, nc = int(sp_['long']), int(sp_['cross'])
    g_ = max((d.geoms if hasattr(d, 'geoms') else [d]), key=lambda q: q.area)
    xy_ = np.asarray(g_.exterior.coords)
    def ext(a): pr = xy_[:, 0] * math.cos(a) + xy_[:, 1] * math.sin(a); return float(pr.max() - pr.min())
    if ext(ang + math.pi / 2) > ext(ang): ang += math.pi / 2
    La, Lc = ext(ang), ext(ang + math.pi / 2)
    du = min(150.0, max(55.0, 0.86 * La / max(nc - 1, 1)))          # spacing of the cross streets (along the long axis)
    dv = min(120.0, max(48.0, 0.8 * Lc / max(nl - 1, 1)))           # spacing of the long streets
    if nc > 1 and du > 110 and 0.86 * La / max(nc - 1, 1) < 110: du = 110.0
    ca, sa = math.cos(ang), math.sin(ang)
    c0 = g_.centroid if g_.contains(g_.centroid) else g_.representative_point()
    # slide the grid center into the outline's middle along both axes
    pa = xy_[:, 0] * ca + xy_[:, 1] * sa; pc = -xy_[:, 0] * sa + xy_[:, 1] * ca
    ua, vc = (pa.max() + pa.min()) / 2, (pc.max() + pc.min()) / 2
    cx, cz = ua * ca - vc * sa, ua * sa + vc * ca
    if not g_.buffer(60).contains(Point(cx, cz)): cx, cz = c0.x, c0.y
    W_ = lambda u, v: (cx + ca * u - sa * v, cz + sa * u + ca * v)
    A = (nc - 1) / 2 * du; B = max((nl - 1) / 2 * dv, 48.0)
    ok_ = dry.difference(AP.buffer(12)).difference(TERN_AF.buffer(10)).difference(lots_u).difference(REALKEEP.buffer(15))
    if avoid is not None: ok_ = ok_.difference(avoid)
    nmL, nmC = namer(nm), namer(nm + 'x'); mid = nl // 2; du0, dv0 = du, dv
    def trial(sc_):
        du_, dv_ = du0 * sc_, dv0 * sc_
        A_ = (nc - 1) / 2 * du_; B_ = max((nl - 1) / 2 * dv_, 48.0 * sc_); A_l_ = A_ if nc > 1 else 60.0
        Wl = lambda u, v: (cx + ca * u - sa * v, cz + sa * u + ca * v)
        out_, cnt_ = [], [0, 0]
        def put(a_, b_, kind, name, zone, tags, which):
            seg = LineString([a_, b_]).intersection(ok_)
            parts = [q for q in (seg.geoms if hasattr(seg, 'geoms') else [seg]) if q.geom_type == 'LineString' and q.length >= (40 if which == 0 else 12)]
            if not parts: return
            out_.append((list(max(parts, key=lambda t: t.length).coords), kind, name, zone, tags)); cnt_[which] += 1
        for i in range(nl):
            v = (i - (nl - 1) / 2) * dv_
            if i == mid: put(Wl(-A_l_ - 30, v), Wl(A_l_ + 30, v), 'tertiary', f'{nm} Main Street', 'strip_small', {'main_street': 1}, 0)
            else: put(Wl(-A_l_, v), Wl(A_l_, v), 'residential', nmL(i), None, None, 0)
        for k in range(nc):
            u = (k - (nc - 1) / 2) * du_ if nc > 1 else 0.0
            put(Wl(u, -B_ - (12 if nl > 1 else 0)), Wl(u, B_ + (12 if nl > 1 else 0)), 'residential', nmC(k), None, None, 1)
        return out_, cnt_, du_, dv_, A_, B_, A_l_
    best_ = None
    for sc_ in (1.0, 0.85, 0.7, 0.58, 0.48):
        t_ = trial(sc_)
        if best_ is None or abs(t_[1][0] - nl) + abs(t_[1][1] - nc) < abs(best_[1][0] - nl) + abs(best_[1][1] - nc): best_ = t_
        if t_[1] == [nl, nc]: break
    lines_, cnt, du, dv, A, B, A_l = best_
    for co_, kind, name, zone, tags in lines_:
        W.road(co_, kind, name, lf=1, lb=1, region=region, zl=zone, zr=zone, tags=dict(tags or {}, town_grid=nm))
    # town square: the block on the far side of Main Street at the center
    k0 = (nc - 1) // 2; u0 = (k0 - (nc - 1) / 2) * du if nc > 1 else -40.0; u1 = u0 + (du if nc > 1 else 80.0)
    vm = (mid - (nl - 1) / 2) * dv; v1 = vm + (dv if mid + 1 < nl else -dv if nl > 1 else 45.0)
    lo_, hi_ = sorted((vm, v1))
    sq_ = Polygon([W_(u0 + 12, lo_ + 10), W_(u1 - 12, lo_ + 10), W_(u1 - 12, hi_ - 10), W_(u0 + 12, hi_ - 10)])
    if ok_.contains(sq_) and sq_.area > 1500:
        W.add_area(sq_, 'plaza', f'{nm} Town Square', block='reserved'); W.poi(sq_.centroid.x, sq_.centroid.y, 'town_square', f'{nm} Town Square')
        TOWN_SQUARES[nm] = [round(sq_.centroid.x, 1), round(sq_.centroid.y, 1)]
    TOWN_COUNTS[nm] = dict(map=[nl, nc], game=cnt, blockM=[round(du), round(dv)], angleDeg=round(math.degrees(ang) % 180, 1), center=[round(cx), round(cz)])
    foot = Polygon([W_(-A_l - 35, -B - 40), W_(A_l + 35, -B - 40), W_(A_l + 35, B + 40), W_(-A_l - 35, B + 40)]).intersection(ok_)
    return foot if not foot.is_empty else None
TOWNS = {}
FILLK = {}
for nm_, inner, outer, org in (('West End', sbox(-4350, RZ0, RX0, RZ1), sbox(-5000, RZ0, -4350, RZ1), (RX0, 0.0)), ('North Shore', sbox(RX0, -3200, 1800, RZ0), sbox(RX0, -3900, 1800, -3200), (RX0, RZ0)),
                               ('South Shore', sbox(RX0, RZ1, 0, 3200), sbox(RX0, 3200, 0, 4000), (RX0, RZ1))):
    for part, band, skip in (('', inner, 0.06), (' Outskirts', outer, 0.42)):
        d_ = band.intersection(dry).difference(keep_out).difference(LineString(RING.center).buffer(40))
        if d_.is_empty or d_.area < 20000: continue
        TOWNS[nm_ + part] = d_; FILLK[nm_ + part] = 1.0 if not part else 0.6
        _ct_ = counted_town(nm_ + part, d_, 0.0, nm_)
        if _ct_ is not None: TOWNS[nm_ + part] = _ct_
        else: G.grid(W, d_, org, 0.0, 190, 100, namer(nm_ + part), namer(nm_ + part + 'x'), region=nm_, seed=nm_ + part, skip_u=skip, skip_v=skip)
_tk = local_island(TR.p2w(470, 1395), 900)
_td = _tk.buffer(-22).difference(LineString(US1.pts).buffer(6))
if not _td.is_empty and _td.area > 4000:
    TOWNS['Tamarind Key'] = _tk.buffer(-22)
    _ct_ = counted_town('Tamarind Key', _td, 0.2, 'Tamarind Key', avoid=LineString(US1.pts).buffer(14))
    if _ct_ is not None: TOWNS['Tamarind Key'] = _ct_
    else: G.grid(W, _tk.buffer(-22), (_tk.centroid.x, _tk.centroid.y), 0.2, 100, 70, namer('Tamarind Key'), namer('Tamarind Keyx'), region='Tamarind Key', seed='Tamarind Key', min_len=30)
keep_out = unary_union([keep_out] + list(TOWNS.values()))
used_a = set(); ei = 0
for up_ in sorted(URBAN, key=lambda p: -p.area):
    c = up_.centroid; best = None
    for nm, ax, ay in ANCH:
        wx, wz = TR.p2w(ax, ay); d = math.hypot(c.x - wx, c.y - wz)
        if nm not in used_a and d < 1700 and (best is None or d < best[0]): best = (d, nm)
    if best: nm = best[1]; used_a.add(nm)
    elif ei < len(EXTRA): nm = EXTRA[ei]; ei += 1
    else: continue
    d = up_.intersection(dry).difference(keep_out)
    if d.is_empty or d.area < 8000: continue
    TOWNS[nm] = d
    rr_ = rng('town', nm)
    keys = nm in ('Key Paloma', 'Tern Key', 'Tamarind Key', 'Shellmound')
    ang, _from_pic = picture_grid_angle(up_, rr_.uniform(0, math.pi / 2))
    GRIDSRC = globals().setdefault('GRIDSRC', {}); GRIDSRC[nm] = _from_pic
    if nm == 'Key Paloma': ang = math.atan2(TR.p2w(548, 1372)[1] - TR.p2w(640, 1235)[1], TR.p2w(548, 1372)[0] - TR.p2w(640, 1235)[0])
    _ct_ = counted_town(nm, d, ang, nm)
    if _ct_ is not None: TOWNS[nm] = d = _ct_; c = Point(*TOWN_COUNTS[nm]['center'])
    else: G.grid(W, d, (c.x + 40, c.y + 40), ang, rr_.choice([96, 110, 124, 140, 160]), (rr_.choice([70, 82, 94, 106]) if not keys else 120), namer(nm), namer(nm + 'x'), region=nm, seed=nm, skip_u=rr_.choice([0.0, 0.06, 0.12]), skip_v=rr_.choice([0.0, 0.08, 0.16]), jitter=rr_.choice([0, 0, 6, 10]))
    # make sure the town hangs on the main network
    _pool_ = [r for r in list(ROADS.values()) + [COLW, COLN, COLS, COLB, COLV] if r is not None]
    if MR: _pool_ += [r for r in W.raw_roads if r.region not in (nm, 'hwy') and r.kind not in ('motorway', 'motorway_link') and not r.bridge and r.layer == 0 and not (r.tags or {}).get('town_grid') == nm]
    mr_ = min((LineString(r.pts) for r in _pool_), key=lambda l: l.distance(c))
    q = mr_.interpolate(mr_.project(c))
    _cl = LineString([(c.x, c.y), (q.x, q.y)])
    if not MR:
        if mr_.distance(up_) > 5 and not _cl.intersects(REALKEEP.buffer(5)) and _cl.difference(land).length < 650 and not _cl.intersects(AP): W.road([(c.x, c.y), (q.x, q.y)], 'tertiary', namer(nm + 'c')(), region=nm)
    elif mr_.distance(d) > 5:
        # maproads: try the nearest roads in turn; the first link that stays off real Miami and the airport and needs at most
        # 2.5 km of bridge wins (islands get their causeway this way)
        _lines_ = sorted(((LineString(r.pts), r) for r in _pool_), key=lambda t: t[0].distance(c))[:60]
        _linked_ = None
        for ln_, r_ in _lines_:
            q = ln_.interpolate(ln_.project(c)); _cl = LineString([(c.x, c.y), (q.x, q.y)])
            if _cl.intersects(REALKEEP.buffer(5)) or _cl.intersects(AP) or _cl.difference(land).length > 2500: continue
            W.road([(c.x, c.y), (q.x, q.y)], 'tertiary', f'{nm} Causeway' if _cl.difference(land).length > 120 else namer(nm + 'c')(), region=nm); _linked_ = round(_cl.length); break
        LINKS = globals().setdefault('LINKS', {}); LINKS[nm] = _linked_
print('towns', {k: round(v.area / 1e4) for k, v in TOWNS.items()})
if MR: print('maproads: town links (m, None = no link found)', {k: v for k, v in globals().get('LINKS', {}).items()}, flush=True)

towns_u = unary_union(list(TOWNS.values()))
forest_u = unary_union(FOREST)
_chan = C['inland'] & ~ndimage.binary_opening(C['inland'], structure=np.ones((9, 9), bool))
_marsh = ndimage.binary_closing(ndimage.binary_dilation(_chan, iterations=5), iterations=4) & C['land']
_rows = np.arange(IH)[:, None]; _cols = np.arange(1041)[None, :]
_marsh &= ((_rows > 930) & (_cols < 640)) | ((_rows > 610) & (_rows < 800) & (_cols > 410) & (_cols < 610))
_marsh = LD._drop_small(_marsh, 400)
swamp = unary_union(mpolys(_marsh, 60000, 2.5)).buffer(0).intersection(land).difference(inland.buffer(2)).difference(towns_u.buffer(30)).difference(AP.buffer(30))
for nm_, d_ in TOWNS.items(): district_of(nm_, d_)
W.add_area(swamp, 'wetland', 'marsh (traced from the map image)')
farm = P(PX([(703, 405), (765, 415), (770, 480), (760, 560), (703, 585)])).intersection(land).difference(inland.buffer(10)).difference(towns_u.buffer(20)).difference(forest_u)
rf = rng('fields'); fb = farm.bounds; fx = fb[0]
while fx < fb[2]:
    fz = fb[1]
    while fz < fb[3]:
        cell_ = sbox(fx + 8, fz + 8, fx + 392, fz + 352).intersection(farm)
        if cell_.area > 25000: W.add_area(cell_, rf.choice(['grove', 'grove', 'farmland', 'farmland', 'grass']), rf.choice(['Valencia grove', 'tangelo grove', 'tomato field', 'sweet corn', 'sugarcane', 'pasture', 'strawberry field']))
        fz += 360
    fx += 400
RACE = None
for cpx_ in ((470, 838), (455, 845), (500, 842), (430, 835), (480, 870), (440, 880), (360, 880), (340, 905), (460, 905), (420, 860), (500, 880), (380, 840), (330, 860)):
    cw_ = TR.p2w(*cpx_); box_ = sbox(cw_[0] - 520, cw_[1] - 330, cw_[0] + 520, cw_[1] + 330)
    if land.contains(box_) and not box_.intersects(inland) and not box_.intersects(towns_u) and not box_.intersects(AP.buffer(60)) and not box_.intersects(LineString(RING.center).buffer(70)) and not any(box_.intersects(LineString(r_.pts)) for r_ in ROADS.values()):
        RACE = (cw_, box_); break
if RACE:
    (rx_, rz_), box_ = RACE
    OVAL = [(rx_ + 330 * math.cos(t_), rz_ + 170 * math.sin(t_)) for t_ in [i * 2 * math.pi / 64 for i in range(64)]]; OVAL.append(OVAL[0])
    W.road(OVAL, 'service', 'Solana Motor Speedway', lf=2, oneway=True, region='Speedway', tags={'nolots': 1, 'racetrack': 'oval'})
    W.road(spl([OVAL[4], (rx_ + 150, rz_ - 40), (rx_ + 40, rz_ + 60), (rx_ - 90, rz_ - 70), (rx_ - 200, rz_ + 40), OVAL[30]], 15), 'service', 'Speedway Infield Course', lf=1, oneway=True, region='Speedway', tags={'nolots': 1, 'racetrack': 'road_course'})
    W.road([OVAL[10], (rx_ + 120, rz_ + 128), (rx_ - 120, rz_ + 128), OVAL[22]], 'service', 'Pit Lane', lf=1, oneway=True, region='Speedway', tags={'nolots': 1, 'racetrack': 'pit_lane'})
    ROADS['speedway'] = W.road([OVAL[48], (rx_, rz_ - 300)], 'tertiary', 'Speedway Boulevard', region='Speedway', tags={'nolots': 1})
    W.add_area(Polygon(OVAL).buffer(11).difference(Polygon(OVAL).buffer(-11)), 'paved', 'Solana Motor Speedway', block='reserved')
    W.add_area(Polygon(OVAL).buffer(-14), 'grass', 'speedway infield')
    W.add_area(sbox(rx_ - 420, rz_ - 325, rx_ + 420, rz_ - 215), 'parking', 'speedway parking', block='reserved')
    W.building([(rx_ - 230, rz_ + 196), (rx_ + 230, rz_ + 196), (rx_ + 230, rz_ + 226), (rx_ - 230, rz_ + 226)], 16, 'grandstand', 'industrial', 'commercial', check=False, name='Speedway Main Grandstand', poi='stadium', region='Speedway')
    W.building([(rx_ - 90, rz_ + 100), (rx_ + 90, rz_ + 100), (rx_ + 90, rz_ + 116), (rx_ - 90, rz_ + 116)], 6, 'garage', 'industrial', 'commercial', check=False, name='Pit Garages', poi='motorsport_pits', region='Speedway')
    W.poi(rx_, rz_, 'raceway', 'Solana Motor Speedway'); W.reserve(box_, 'reserved')
print('speedway', None if not RACE else [round(v) for v in RACE[0]], flush=True)
# ---------------------------------------------------------------- 6. finalize the network
wet = sbox(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ']).difference(land.buffer(0.5)).union(inland).difference(REALKEEP)
from wl import design as D
D.CHANNELS[:] = [('Mariner Channel', PX([(520, 1340), (522, 1384), (524, 1420)]), 120, 9.0), ('Tern Pass', PX([(350, 1340), (352, 1372), (354, 1410)]), 60, 5.0),
                 ('Calabash Pass', PX([(312, 380), (314, 413), (316, 450)]), 60, 5.0)]
_inner = REALKEEP.buffer(-1.0); _rr = []
for r in W.raw_roads:
    if r.tags.get('join') or not LineString(r.pts).intersects(_inner): _rr.append(r); continue
    g_ = LineString(r.pts).difference(REALKEEP.buffer(0.5))
    for ln_ in (g_.geoms if hasattr(g_, 'geoms') else [g_]):
        if ln_.geom_type == 'LineString' and ln_.length > 8: _rr.append(r.copy_with(list(ln_.coords)))
W.raw_roads = _rr
nb = RN.finalize(W, wet)
lk = namer('links'); relinked = 0
for _pass in range(2):
    comps = RN.connectivity(W.roads); main_c = set(comps[0])
    mains = [LineString(r.pts) for i, r in enumerate(W.roads) if i in main_c and r.kind not in ('motorway', 'motorway_link') and not r.bridge and not r.tags.get('join')]
    mt = STRtree(mains); added = 0
    for comp in comps[1:]:
        if sum(plen(W.roads[i].pts) for i in comp) < 160: continue
        best = None
        for i in comp[:80]:
            for v in (W.roads[i].pts[0], W.roads[i].pts[-1]):
                j = int(mt.nearest(Point(v))); d_ = mains[j].distance(Point(v))
                if best is None or d_ < best[0]: best = (d_, v, j)
        d_, v, j = best
        if MR and sum(plen(W.roads[i].pts) for i in comp) > 1500: print('maproads: relink candidate', round(sum(plen(W.roads[i].pts) for i in comp)), 'm at', [round(v) for v in v], 'gap', round(d_), flush=True)
        if d_ > (3000 if MR else 2000) or d_ < 0.5: continue
        q = mains[j].interpolate(mains[j].project(Point(v))); ln_ = LineString([v, (q.x, q.y)])
        if ln_.intersects(REALKEEP.buffer(5)) or ln_.intersects(AP) or ln_.intersects(lots_u) or ln_.intersects(TERN_AF) or ln_.intersection(wet).length > (2500 if MR else 650): continue
        W.raw_roads.append(Road([v, (q.x, q.y)], 'tertiary', lk(), region='link')); added += 1
    relinked += added
    if not added: break
    nb = RN.finalize(W, wet)
comps = RN.connectivity(W.roads); main_c = set(comps[0])
print(f'relinked {relinked} patches; roads {len(W.roads)} bridges {nb} orphan edges {sum(len(c) for c in comps[1:])} {time.time()-T0:.1f}s')
W.roads = [r for i, r in enumerate(W.roads) if i in main_c]
for r in W.roads:
    if not (r.bridge and r.layer > 0 and not r.tags.get('bclass')): W.idx.add(LineString(r.pts).buffer(r.width / 2 + 2.2, cap_style=2), 'road')
_k = 0
for r in W.roads:
    if r.region == 'Amaro Landing' and r.kind == 'residential':
        _k += 1
        if _k % 3 != 0: r.surface = 'dirt' if _k % 2 else 'gravel'
_al = TOWNS.get('Amaro Landing')
if _al is not None:
    from shapely.ops import nearest_points as _npts
    _q = _npts(LAKE, _al)[0]; W.poi(_q.x, _q.y, 'slipway', 'Amaro Landing Boat Ramp'); W.prop(_q.x, _q.y, 'boat_ramp')
    _rr2 = rng('pickups'); _b = _al.bounds
    for _ in range(60):
        _pt = Point(_rr2.uniform(_b[0], _b[2]), _rr2.uniform(_b[1], _b[3]))
        if _al.contains(_pt) and not W.idx.hit(_pt.buffer(4), ('bldg', 'road', 'water', 'reserved')): W.prop(_pt.x, _pt.y, _rr2.choice(['pickup_truck', 'pickup_truck', 'boat_trailer', 'airboat_on_trailer', 'swamp_buggy', 'rusted_car', 'propane_tank']), _rr2.uniform(0, 6.28))
W.raw_roads = list(W.roads)
road_union = unary_union([LineString(r.pts).buffer(r.width / 2 + 3, cap_style=2) for r in W.roads if not r.bridge])
gl = swamp.buffer(-45); rc = rng('sloughs'); gb = gl.bounds if not gl.is_empty else (0, 0, 0, 0)
for i in range(36):
    for _ in range(40):
        p0 = (rc.uniform(gb[0], gb[2]), rc.uniform(gb[1], gb[3]))
        if gl.contains(Point(p0)): break
    else: continue
    a_ = rc.uniform(0, 6.28); pts_ = [p0]
    for k in range(rc.randint(7, 18)):
        a_ += rc.uniform(-0.7, 0.7); q_ = (pts_[-1][0] + 46 * math.cos(a_), pts_[-1][1] + 46 * math.sin(a_))
        if not gl.contains(Point(q_)): break
        pts_.append(q_)
    if len(pts_) >= 4: W.add_water(LineString(spl(pts_, 12)).buffer(rc.uniform(2.6, 5.5)).difference(road_union), 'marsh_open', 'slough channel', depth=0.9)
AIRBOAT = [PX([(470, 660), (520, 650), (550, 700), (520, 750), (470, 740), (470, 660)]), PX([(420, 1020), (500, 1040), (530, 1120), (470, 1180), (420, 1100), (420, 1020)])]
for i, t_ in enumerate(AIRBOAT): W.add_water(LineString(spl(t_, 15)).buffer(4.5).intersection(swamp).difference(road_union), 'marsh_open', f'airboat trail {i+1}', depth=0.6)
W.extra['routes'] = dict(airboat=[[[round(x), round(z)] for x, z in spl(t_, 60)] for t_ in AIRBOAT])

# ---------------------------------------------------------------- 7. buildings
stats = {}
civic = lambda t: [('gas', None), ('church', {'name': f'{t} Community Church'}), ('park', {'name': f'{t} Park'}), ('fire_station', {'name': f'{t} Fire Station'}), ('motel', {'name': f'{t} Motor Court'}), ('bait_shop', None)]
for r in list(W.roads):
    if r.kind in ('trunk', 'primary', 'secondary') and not r.bridge and not r.tags.get('join') and plen(r.pts) > 70 and not (r.y and max(r.y) > 0.5):
        mid = Point(r.pts[len(r.pts) // 2]); town = next((k for k, v in TOWNS.items() if v.buffer(60).contains(mid)), None)
        if not town: continue
        keys = town in ('Key Paloma', 'Tern Key', 'Tamarind Key')
        ctx = dict(region=town, pick_poi=G.poi_picker(G.KEYS_RETAIL if keys else G.RETAIL, r.name + town), **(dict(palette=G.KEYS, tin=True, style='stilt') if keys else {}))
        for side in (1, -1):
            try: stats[r.name] = stats.get(r.name, 0) + G.walk(W, r, side, 'keys' if keys else 'strip_small', ctx, seed=(r.name, r.id))
            except Exception: W.log.append('walk ' + traceback.format_exc()[-200:])
for nm, d in sorted(TOWNS.items(), key=lambda kv: (kv[0] not in ('Tamarind Key', 'Key Paloma', 'Tern Key', 'Amaro Landing', 'Port Cassia', 'Port Calabash', 'Punta Marisol', 'Shellmound'), 'Outskirts' in kv[0], -kv[1].area)):
    if len(W.buildings) > 23300: W.log.append(f'building cap reached before {nm}'); continue
    keys = nm in ('Key Paloma', 'Tern Key', 'Tamarind Key', 'Shellmound')
    ctx = dict(region=nm, pick_poi=G.poi_picker(G.KEYS_RETAIL if keys else G.RETAIL, nm), **(dict(palette=G.KEYS, tin=True, style='stilt') if keys else {}))
    if nm == 'Amaro Landing':
        try: stats[nm] = G.fill_district(W, d.buffer(25), {'residential': 'mobile', 'tertiary': 'shopfront'}, dict(ctx, tin=True, pick_poi=G.poi_picker(['fishing', 'fishing', 'bar', 'hardware', 'convenience', 'second_hand', 'car_repair', 'restaurant', 'boat', 'laundry', 'farm', 'gift', 'pawnbroker'], nm)), seed=nm,
                                            specials=[('bait_shop', {'name': 'Amaro Bait and Tackle'}), ('bait_shop', None), ('rv_park', {'name': 'Bass Haven Fish Camp'}), ('gas', None), ('church', {'name': 'Amaro Landing Baptist Church'}), ('tiki_bar', {'name': 'The Gator Hole Bar'}), ('auto_repair', None), ('farm_stand', None)])
        except Exception: W.log.append('fill lake town ' + traceback.format_exc()[-300:])
        continue
    try: stats[nm] = G.fill_district(W, d.buffer(25), {'residential': 'stilt' if keys else ('house' if d.area > 400000 else 'house_small'), 'tertiary': 'shopfront'}, ctx, seed=nm, specials=civic(nm) if FILLK.get(nm, 1.0) == 1.0 else None, fill=FILLK.get(nm, 1.0))
    except Exception: W.log.append(f'fill {nm} ' + traceback.format_exc()[-300:])
for nm, d in TOWNS.items(): G.scatter_trees(W, d, int(d.area / 9000), ['palm', 'coconut', 'oak', 'gumbo', 'royal_palm'], nm)
for i, p in enumerate(sorted(FOREST, key=lambda p: -p.area)[:12]): G.scatter_trees(W, p, min(260, int(p.area / 40000)), ['pine', 'oak', 'cypress', 'palm'], f'forest{i}')
try:
    stats['signals'], stats['stops'] = G.street_furniture(W)
    stats['lamps'] = G.lamps_along(W, [r for r in W.roads if r.kind in ('trunk', 'primary', 'secondary', 'tertiary')])
except Exception: W.log.append('furn ' + traceback.format_exc()[-300:])
G.power_line(W, US1.pts, 'Overseas feeder', offset=11)
RN.planarize(W); RN.elevate(W)
W.count['r'] = 0
W.roads = [r for r in W.raw_roads if len(r.pts) >= 2]
comps = RN.connectivity(W.roads); main_c = set(comps[0])
W.roads = [r for i, r in enumerate(W.roads) if i in main_c]
for r in W.roads: r.id = W.nid('r')
_t = STRtree([LineString(r.pts).buffer(r.width / 2 + 0.3) for r in W.roads if not (r.bridge and r.layer > 0)])
_bad = {b['id'] for b in W.buildings if len(_t.query(Polygon(b['ring']), predicate='intersects'))}
W.buildings = [b for b in W.buildings if b['id'] not in _bad]; W.pois = [p for p in W.pois if p.get('building') not in _bad]
print(f'content {time.time()-T0:.1f}s buildings {len(W.buildings)} roads {len(W.roads)}')

# ---------------------------------------------------------------- 8. heights: dark forest in the image = high ground
CELLH = 16
hx0, hz0 = BOUNDS['minX'], BOUNDS['minZ']
hnx, hnz = int((BOUNDS['maxX'] - hx0) / CELLH), int((BOUNDS['maxZ'] - hz0) / CELLH)
dk = C['green'] & (C['mean'] < np.percentile(C['mean'][C['green']], 30))
dens = np.clip((ndimage.gaussian_filter(dk.astype(np.float32), 9) - 0.40) / 0.45, 0, 1)
py_ = np.arange(dens.shape[0], dtype=np.float32)[:, None]
himg = ndimage.gaussian_filter(dens ** 1.2 * np.clip((800 - py_) / 70.0, 0, 1), 2.5)
H = np.clip(np.asarray(Image.fromarray(himg).resize((hnx, hnz), Image.BICUBIC)).astype(np.float32), 0, None)
H = ndimage.gaussian_filter(H * np.clip(0.8 + 0.35 * fbm((hnz, hnx), 900, 'hills', octaves=3, cell=CELLH, ridged=True), 0.5, 1.2), 2.0)
H *= 395.0 / max(1e-6, float(H.max()))
XX, ZZ = np.meshgrid(hx0 + (np.arange(hnx) + 0.5) * CELLH, hz0 + (np.arange(hnz) + 0.5) * CELLH)
dxr = np.maximum(np.maximum(RX0 - XX, XX - RX1), 0); dzr = np.maximum(np.maximum(RZ0 - ZZ, ZZ - RZ1), 0)
H *= smoothstep(60.0, 460.0, np.sqrt(dxr * dxr + dzr * dzr))                      # flat in real Miami, 400 m taper outside
lmask = raster_polys(land, (hnz, hnx), cell=CELLH) > 0
wmask = raster_polys(inland.buffer(6), (hnz, hnx), cell=CELLH) > 0
H *= np.clip((ndimage.distance_transform_edt(lmask & ~wmask) * CELLH - 24.0) / 220.0, 0, 1)   # sea level at coasts and water
LIM = 0.30 * CELLH                                                                 # 30 % ground slope limit
def slope_limit(A, fixed=None, n=120):
    for _ in range(n):
        B = A.copy()
        B[1:, :] = np.minimum(B[1:, :], A[:-1, :] + LIM); B[:-1, :] = np.minimum(B[:-1, :], A[1:, :] + LIM)
        B[:, 1:] = np.minimum(B[:, 1:], A[:, :-1] + LIM); B[:, :-1] = np.minimum(B[:, :-1], A[:, 1:] + LIM)
        if np.array_equal(B, A): break
        A = B
    return A
H = slope_limit(H)
# road grading on the graph: h(v) = min(terrain, neighbors + 6 % * distance); then bench the roadbed and re-limit slopes
import heapq
def hbil(x, z):
    fx, fz = (x - hx0) / CELLH - 0.5, (z - hz0) / CELLH - 0.5
    i, j = min(hnx - 2, max(0, int(fx))), min(hnz - 2, max(0, int(fz))); u, v = min(1.0, max(0.0, fx - i)), min(1.0, max(0.0, fz - j))
    return float((H[j, i] * (1 - u) + H[j, i + 1] * u) * (1 - v) + (H[j + 1, i] * (1 - u) + H[j + 1, i + 1] * u) * v)
for _round in range(6):
    hv = {}; adj = {}
    for r in W.roads:
        pts = [r.pts[0]] + [r2(p) for p in resample(r.pts, 8.0)[1:-1]] + [r.pts[-1]]
        r.tags['hp'] = pts
        for a_, b_ in zip(pts, pts[1:]):
            d_ = math.hypot(b_[0] - a_[0], b_[1] - a_[1]); adj.setdefault(a_, []).append((b_, d_)); adj.setdefault(b_, []).append((a_, d_))
        for p_ in pts:
            if p_ not in hv: hv[p_] = 0.0 if r.bridge else hbil(*p_)
    heap = [(h_, p_) for p_, h_ in hv.items()]; heapq.heapify(heap)
    while heap:
        h_, p_ = heapq.heappop(heap)
        if h_ > hv[p_] + 1e-9: continue
        for q_, d_ in adj.get(p_, ()):
            hq = h_ + 0.045 * d_
            if hq < hv[q_] - 1e-6: hv[q_] = hq; heapq.heappush(heap, (hq, q_))
    Rh = np.full(H.shape, np.nan, np.float32)
    for p_, h_ in hv.items():
        i, j = min(hnx - 1, max(0, int((p_[0] - hx0) / CELLH))), min(hnz - 1, max(0, int((p_[1] - hz0) / CELLH)))
        if np.isnan(Rh[j, i]) or h_ < Rh[j, i]: Rh[j, i] = h_
    dist, (ii, jj) = ndimage.distance_transform_edt(np.isnan(Rh), return_indices=True)
    near = dist <= 1.5
    H = np.where(near, np.minimum(H, Rh[ii, jj]) if _round == 0 else Rh[ii, jj], H)
    H = np.minimum(H, np.where(near, H, H))   # no-op, keeps dtype
    H = slope_limit(H.astype(np.float32))
# maproads track: a traced dead-end road that still climbs more than 12 % somewhere after grading is dropped (leaf edges only,
# so the network stays connected)
_deg = {}
for r in W.roads:
    for p_ in (r.pts[0], r.pts[-1]): _deg[p_] = _deg.get(p_, 0) + 1
_drop = set()
for i_, r in enumerate(W.roads):
    if r.region != 'maproads' or r.bridge or not (_deg[r.pts[0]] == 1 or _deg[r.pts[-1]] == 1): continue
    pp_ = resample(r.pts, 8.0); hh_ = [hbil(*q_) for q_ in pp_]
    if any(abs(hh_[k + 1] - hh_[k]) / max(0.5, math.hypot(pp_[k + 1][0] - pp_[k][0], pp_[k + 1][1] - pp_[k][1])) > 0.12 for k in range(len(pp_) - 1)): _drop.add(i_)
if _drop:
    W.roads = [r for i_, r in enumerate(W.roads) if i_ not in _drop]; W.raw_roads = list(W.roads)
print('maproads: steep dead-end pieces dropped', len(_drop), flush=True)
_fm = raster_polys(FOREST, (hnz, hnx), cell=CELLH) > 0
RELIEF = dict(forest_median_m=round(float(np.median(H[_fm])), 1), forest_p75_m=round(float(np.percentile(H[_fm], 75)), 1), forest_p95_m=round(float(np.percentile(H[_fm], 95)), 1), share_of_forest_above_20m=round(float((H[_fm] > 20).mean()), 2))
pk = np.unravel_index(int(np.argmax(H)), H.shape)
PEAK = dict(x=round(float(XX[pk])), z=round(float(ZZ[pk])), y=round(float(H.max()), 1))
os.makedirs(OUT, exist_ok=True)
(H / 0.1).round().astype('<i2').tofile(os.path.join(OUT, 'heights.bin'))

# ---------------------------------------------------------------- 9. export
def ring(c): return [[round(x, 2), round(z, 2)] for x, z in list(c)[:-1]]
def polyd(p, **kw):
    d = dict(kw); d['outer'] = ring(p.exterior.coords); d['holes'] = [ring(h.coords) for h in p.interiors]; return d
land_out = []
for g in (land.geoms if hasattr(land, 'geoms') else [land]):
    if g.geom_type == 'Polygon' and g.area > 60: land_out.append(polyd(g.simplify(1.5), id=f'l{len(land_out)+1}'))
def _pl(g, tol=2.0, min_area=200): return [polyd(q.simplify(tol)) for q in (g.geoms if hasattr(g, 'geoms') else [g]) if q.geom_type == 'Polygon' and q.area > min_area]
_real_in = rd['land'].intersection(realbox)
_isl = [g for g in (land.geoms if hasattr(land, 'geoms') else [land]) if g.area < 4.0e6 and g.intersects(realbox.buffer(1200))]
_big = unary_union([g for g in (land.geoms if hasattr(land, 'geoms') else [land]) if g.area >= 4.0e6])
from shapely.ops import nearest_points as _np2
_cw = []
for i_, g in enumerate(_isl):
    if g.area < 15000: continue
    oth = unary_union([_big] + [h for h in _isl if h is not g and h.area > g.area])
    a_, b_ = _np2(g, oth)
    if a_.distance(b_) < 900: _cw.append(dict(island=f'ci{i_+1}', pts=[[round(a_.x, 1), round(a_.y, 1)], [round(b_.x, 1), round(b_.y, 1)]], lengthM=round(a_.distance(b_), 1), source='shortest crossing to the next larger land (generated, not digitized)'))
CITY_MASK = dict(rect=REAL, rule='inside rect: keep real features only where they fall on `land`; remove them on `water`; `newLand` is image land that real data lacks (synthetic streets and buildings are provided there); `removeRealLand` is real land the image shows as water',
                 land=_pl(land.intersection(realbox)), water=_pl(realbox.difference(land)), newLand=_pl(land.intersection(realbox).difference(_real_in.buffer(8))), removeRealLand=_pl(_real_in.difference(land.buffer(8))),
                 islands=[dict(polyd(g.simplify(2.0)), id=f'ci{i_+1}', areaM2=round(g.area)) for i_, g in enumerate(_isl)], causeways=_cw)
TRANSFORM = dict(image='references/ref_40_map_user_official.webp (local only)', size=[1041, IH], metersPerPixel=TR.S, x0=TR.X0, z0=TR.Z0, formula='x = x0 + mpp * px; z = z0 + mpp * py',
                 fit=dict(method='scale fixed at 30 m/px; x0 = least squares over 5 control points, z0 from the barrier island south tip', residualsM={'ocean shore (3 rows)': [42, 24, -36], 'beach bay shore': 610, 'downtown bayfront': -650, 'south tip': 0}))
from PIL import ImageDraw as _ID
_wi = Image.new('L', (1041, IH), 0); _wd = _ID.Draw(_wi)
for w_ in W.water:
    if w_['poly'].geom_type == 'Polygon':
        _wd.polygon([TR.w2p(x, z) for x, z in w_['poly'].exterior.coords], fill=255)
        for h_ in w_['poly'].interiors: _wd.polygon([TR.w2p(x, z) for x, z in h_.coords], fill=0)
K4 = 4
def _ras4(polys):
    im_ = Image.new('L', (1041 * K4, IH * K4), 0); dd_ = _ID.Draw(im_)
    for g_ in polys:
        dd_.polygon([((x - TR.X0) / TR.S * K4 - 0.5, (z - TR.Z0) / TR.S * K4 - 0.5) for x, z in g_.exterior.coords], fill=255)
        for h_ in g_.interiors: dd_.polygon([((x - TR.X0) / TR.S * K4 - 0.5, (z - TR.Z0) / TR.S * K4 - 0.5) for x, z in h_.coords], fill=0)
    return np.asarray(im_).reshape(IH, K4, 1041, K4).mean(axis=(1, 3)) > 127
_wa = _ras4([w_['poly'] for w_ in W.water if w_['poly'].geom_type == 'Polygon']) | ~_ras4(list(land.geoms) if hasattr(land, 'geoms') else [land])
_li, _ln = ndimage.label(C['inland']); _ls = ndimage.sum_labels(np.ones_like(_li), _li, np.arange(_ln + 1)); LAKES = []
for k_ in np.argsort(-_ls)[:18]:
    if k_ == 0 or _ls[k_] < 200: continue
    m_ = _li == k_; ys_, xs_ = np.nonzero(m_)
    sl_ = (slice(max(0, ys_.min() - 4), ys_.max() + 5), slice(max(0, xs_.min() - 4), xs_.max() + 5))
    a_ = m_[sl_]; b_ = _wa[sl_] & ~C['ocean'][sl_] & ~(C['inland'][sl_] & ~a_)
    LAKES.append(dict(px=[int(xs_.mean()), int(ys_.mean())], pixels=int(_ls[k_]), recall=round(float((a_ & b_).sum() / a_.sum()), 2), precision=round(float((a_ & b_).sum() / max(1, b_.sum())), 2)))
_la = _ras4(list(land.geoms) if hasattr(land, 'geoms') else [land]); COAST_IOU = round(float((_la & C['land']).sum() / max(1, (_la | C['land']).sum())), 3)
feat = dict(version=4, generator='tools/world/build.py (traced from the official map image)', bounds=BOUNDS, realRect=REAL, imageTransform=TRANSFORM, city_mask=CITY_MASK, palette=PAL,
            districts=[dict(d_, outer=ring(max((TOWNS[d_['name']].geoms if hasattr(TOWNS[d_['name']], 'geoms') else [TOWNS[d_['name']]]), key=lambda g: g.area).simplify(6).exterior.coords)) for d_ in DISTRICTS], land=land_out,
            water=[polyd(w['poly'].simplify(0.8), id=w['id'], kind=w['kind'], **({'name': w['name']} if w['name'] else {}), depth=w['depth']) for w in W.water if w['poly'].geom_type == 'Polygon'],
            areas=[polyd(a['poly'].simplify(0.8), id=a['id'], kind=a['kind'], **({'name': a['name']} if a['name'] else {}), **({'colour': '#%02x%02x%02x' % tuple(PAL['sand'])} if a['kind'] == 'beach' else {})) for a in W.areas if a['poly'].geom_type == 'Polygon' and a['poly'].area > 10],
            shallows=[polyd(p.simplify(4.0), id=f's{i+1}', colour='#%02x%02x%02x' % tuple(PAL['shallow'])) for i, p in enumerate(SHALLOW)],
            roads=[], paths=W.paths, buildings=W.buildings, pois=W.pois, props=W.props, trees=W.trees, places=[], joins=[], setpieces=W.setpieces, powerlines=W.powerlines,
            heights=dict(file='heights.bin', cell=CELLH, minX=hx0, minZ=hz0, nx=hnx, nz=hnz, unit=0.1))
for r in W.roads:
    d = dict(id=r.id, pts=[list(p) for p in r.pts], kind=r.kind, lanesFwd=r.lf, lanesBack=r.lb, oneway=r.oneway, speedKmh=r.speed, name=r.name, bridge=bool(r.bridge), width=round(r.width, 1), surface=r.surface, layer=r.layer)
    if r.ref: d['ref'] = r.ref
    if r.y: d['y'] = r.y
    if r.tags.get('racetrack'): d['racetrack'] = r.tags['racetrack']
    feat['roads'].append(d)
    j = r.tags.get('join')
    if j and (tuple(r.pts[0]) == r2((j['x'], j['z'])) or tuple(r.pts[-1]) == r2((j['x'], j['z']))): feat['joins'].append(dict(x=j['x'], z=j['z'], roadId=r.id, osm=j['osm'], osmWay=j['osmWay']))
lcx, lcz = LAKE.centroid.x, LAKE.centroid.y
PL = [(nm, 'key' if 'Key' in nm else 'town', v.centroid.x, v.centroid.y, math.sqrt(v.area / math.pi)) for nm, v in TOWNS.items()]
PL += [('Lake Amaro', 'lake', lcx, lcz, math.sqrt(LAKE.area / math.pi)), ('Sawpalm Ridge State Park', 'park', PEAK['x'], PEAK['z'], 2700), ('Solana International Airport', 'airport', AP.centroid.x, AP.centroid.y, 1900),
       ('Tern Key Airfield', 'airport', *TR.p2w(262, 1335), 750), ('Corkwood Swamp', 'region', *TR.p2w(500, 700), 1900), ('Everglades', 'region', *TR.p2w(470, 1130), 2700), ('Mariner Channel Bridge', 'region', *TR.p2w(505, 1396), 600)]
if RING_ISLAND is not None: PL.append(('Corona Island', 'island', RING_ISLAND.centroid.x, RING_ISLAND.centroid.y, 600))
if RACE: PL.append(('Solana Motor Speedway', 'district', RACE[0][0], RACE[0][1], 450))
feat['places'] = [dict(name=n, kind=k, x=round(x), z=round(z), r=round(r)) for n, k, x, z, r in PL]
with open(os.path.join(OUT, 'features.json'), 'w') as f: json.dump(feat, f, separators=(',', ':'))
regions = {k: ring(max((v.geoms if hasattr(v, 'geoms') else [v]), key=lambda g: g.area).simplify(10).exterior.coords) for k, v in TOWNS.items()}
regions['Lake Amaro'] = ring(LAKE.simplify(10).exterior.coords); regions['Solana International Airport'] = ring(AP.exterior.coords)
layout = dict(version=4, bounds=BOUNDS, realRect=REAL, imageTransform=TRANSFORM, places=feat['places'], setpieces=W.setpieces, regions=regions, districts=DISTRICTS, palette=PAL, relief=RELIEF,
              airport=W.extra.get('airport'), airfield=W.extra.get('airfield'), routes=W.extra.get('routes'), heights=feat['heights'], peak=PEAK,
              speedway=(None if not RACE else dict(name='Solana Motor Speedway', x=round(RACE[0][0]), z=round(RACE[0][1]), ovalSemiAxesM=[330, 170])),
              ringIsland=(None if RING_ISLAND is None else dict(name='Corona Island', x=round(RING_ISLAND.centroid.x), z=round(RING_ISLAND.centroid.y), areaHa=round(RING_ISLAND.area / 1e4, 1))),
              underwater=dict(shallow_polygons=len(feat['shallows']), channels=[dict(name=n, pts=[[round(x), round(z)] for x, z in pts], width=w, depth=dp) for n, pts, w, dp in D.CHANNELS]),
              highways=[dict(name=n, ref=r) for n, r in (('Cypress Belt Parkway (divided motorway ring)', 'SR 836'), ('Overseas Highway', 'US-1'), ('Tamiami Trail', 'US-41'), ('Citrus Belt Highway', 'US-27'), ('Corkwood Road', 'SR 49'), ('Lake Amaro Road', 'CR 720'), ('Ocean Drive North', 'SR A1A'), ('Calabash Causeway', 'CR 64'), ('Marisol Road', 'CR 41'))])
os.makedirs(os.path.dirname(LAYOUT_PATH), exist_ok=True)
with open(LAYOUT_PATH, 'w') as f: json.dump(layout, f, separators=(',', ':'))
from collections import Counter
summary = dict(nico_kept_at_pass6_position=NICO_KEPT, image_size=[1041, IH], coast_iou=COAST_IOU, districts=DISTRICTS, grid_from_picture=globals().get('GRIDSRC', {}), airport_measured=W.extra.get('airport_measured'), tern_measured=[dict(lengthM=round(math.hypot(b_[0] - a_[0], b_[1] - a_[1])), votes=c_) for a_, b_, c_ in TERN_STRIPS], speedway=(None if not RACE else [round(v) for v in RACE[0]]), ring_island_ha=(None if RING_ISLAND is None else round(RING_ISLAND.area / 1e4, 1)), relief=RELIEF, city_mask=dict(landPolys=len(CITY_MASK['land']), newLandKm2=round(land.intersection(realbox).difference(_real_in).area / 1e6, 2), removeRealLandKm2=round(_real_in.difference(land).area / 1e6, 2), islands=len(_isl), causeways=len(_cw)), lake_overlay=LAKES, palette=PAL, road_km=round(sum(plen(r.pts) for r in W.roads) / 1000, 1), roads=len(W.roads), bridges=sum(1 for r in W.roads if r.bridge), buildings=len(W.buildings), pois=len(W.pois), land_polys=len(land_out), water=len(W.water),
               areas=len(W.areas), joins=len(feat['joins']), joins_expected=njoin, towns={k: round(v.area / 1e4) for k, v in TOWNS.items()}, stats=stats, peak=PEAK, setpieces=W.setpieces, transform=TRANSFORM, log=W.log[:40], seconds=round(time.time() - T0, 1))
with open(os.path.join(OUT, 'summary.json'), 'w') as f: json.dump(summary, f, indent=1)
if TOWN_COUNTS:   # maproads track: map count vs game count per town (towns.json is the map count)
    with open(os.path.join(OUT, 'town_counts.json'), 'w') as f: json.dump(dict(towns=TOWN_COUNTS, squares=TOWN_SQUARES, maproadsKm=round(MAPROADS_KM, 1)), f, indent=1)
    print('town streets (long x cross)  map -> game')
    for nm_, v_ in sorted(TOWN_COUNTS.items()): print(f"  {nm_:24s} {v_['map'][0]} x {v_['map'][1]}  ->  {v_['game'][0]} x {v_['game'][1]}  {'OK' if v_['map'] == v_['game'] else 'MISMATCH'}  blocks {v_['blockM']} m")
print(json.dumps({k: summary[k] for k in ('road_km', 'roads', 'bridges', 'buildings', 'pois', 'land_polys', 'water', 'joins', 'joins_expected', 'peak', 'seconds')}), [(s['id'], s['x'], s['z']) for s in W.setpieces], W.log[:6])
