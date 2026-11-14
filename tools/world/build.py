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
def up(m): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((NX, NZ), Image.BICUBIC)).astype(np.float32) / 255.0
cache = os.path.join(R.CACHE, 'trace_land.npz')
key = f"seam6|{os.path.getmtime(TR.IMG)}|{os.path.getmtime(TR.__file__)}|{TR.S}|{TR.X0}|{TR.Z0}|{CELL}"
if os.path.exists(cache) and str(np.load(cache)['key']) == key:
    mask = np.unpackbits(np.load(cache)['mask'])[:NZ * NX].reshape(NZ, NX).astype(bool)
else:
    m_img = ndimage.gaussian_filter(up(C['solid']), 1.2) > 0.5
    f = sdf(m_img)
    xs, zs = grid_xz()
    dx = np.maximum(np.maximum(RX0 - xs[None, :], xs[None, :] - RX1), 0.0); dz = np.maximum(np.maximum(RZ0 - zs[:, None], zs[:, None] - RZ1), 0.0)
    dout = np.sqrt(dx * dx + dz * dz).astype(np.float32)
    fr = sdf(raster_polys(rd['land'], (NZ, NX)) > 0)
    # seam: the real coast at the rectangle edge is carried straight outward and fades into the traced coast over ~650 m,
    # so every real shore continues past the edge and bends into the image's shore (no shore can follow the rectangle line)
    ci = np.clip(np.arange(NX), int(np.searchsorted(xs, RX0)) + 1, int(np.searchsorted(xs, RX1)) - 2)
    rj = np.clip(np.arange(NZ), int(np.searchsorted(zs, RZ0)) + 1, int(np.searchsorted(zs, RZ1)) - 2)
    fr = fr[np.ix_(rj, ci)]
    w = smoothstep(0.0, 650.0, dout * (1.0 + 0.4 * fbm((NZ, NX), 700.0, 'seam', octaves=3, cell=CELL)))
    mask = (w * f + (1.0 - w) * fr) > 0
    mask = LD._drop_small(mask, 5); mask = ~LD._drop_small(~mask, 5)
    np.savez_compressed(cache, mask=np.packbits(mask), key=key)
solid, ponds = LD.vectorize(mask)
land = unary_union(solid).buffer(0)
W.set_land(land)
print(f'traced land {len(solid)} polys, {len(ponds)} inland waters, {time.time()-T0:.1f}s')
_nowater = AP.buffer(25)
ponds = [q for p in ponds if not p.within(realbox) for q in (lambda g: (g.geoms if hasattr(g, 'geoms') else [g]))(p.difference(_nowater)) if q.geom_type == 'Polygon' and q.area > 150]
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
    if not p.within(realbox): W.add_area(p, 'beach', block='reserved')
FOREST = [p for p in mpolys(C['forest'], 30000, 1.5) if not p.within(realbox)]
for p in FOREST: W.add_area(p, 'forest')
URBAN = [q for p in mpolys(C['urban'], 12000, 1.5) for q in (lambda g: (g.geoms if hasattr(g, 'geoms') else [g]))(p.difference(realbox.buffer(40))) if q.geom_type == 'Polygon' and q.area > 12000]
SHALLOW = LD._polys_from_mask((up(C['shallow']) > 0.5) & ~mask, sigma=1.0, min_area=6000)
for p_ in URBAN: W.add_area(p_, 'residential')
PAL = {k: [int(v) for v in np.median(C['rgb'][m_], axis=0)] for k, m_ in (('ocean', C['ocean'] & ~C['shallow']), ('shallow', C['shallow']), ('sand', C['sand']), ('urban', C['urban']), ('forest', C['forest']), ('land', C['green'] & ~C['forest']), ('water', C['inland']))}
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
RING = RN.Motorway(W, PX([(780.67, 738.17), (795, 660), (800, 580), (790, 500), (770, 420), (735, 330), (690, 265), (610, 215), (520, 205), (440, 235), (375, 290), (345, 360), (330, 420), (322, 500),
                           (320, 580), (325, 660), (335, 740), (355, 790), (430, 805), (500, 815), (570, 810), (640, 800), (721.67, 800)]), 'Cypress Belt Parkway', 'SR 836', lanes=3, region='hwy')
W.road([(-2030, -2745), RING.fwd.pts[0]], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True); W.road([RING.back.pts[-1], (-2030, -2745)], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True)
W.road([RING.fwd.pts[-1], (-3800, -890)], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True); W.road([(-3800, -890), RING.back.pts[0]], 'trunk', 'Cypress Belt Parkway', ref='SR 836', lf=2, oneway=True)
ROADS['central'] = main([(610, 215), (600, 300), (595, 380), (590, 430), (590, 520), (590, 600), (592, 700), (596, 808)], 'trunk', 'Citrus Belt Highway', 'US-27', 6)
ROADS['cross_a'] = main([(320, 580), (450, 598), (590, 600), (700, 585), (797, 560)], 'trunk', 'Corkwood Road', 'SR 49', 6)
ROADS['cross_b'] = main([(322, 500), (450, 515), (590, 520), (700, 515), (790, 500)], 'trunk', 'Lake Amaro Road', 'CR 720', 6)
ROADS['a1a'] = main([(977.33, 738.17), (962, 700), (945, 645), (925, 605), (895, 575), (860, 545), (845, 480), (825, 410), (800, 345), (770, 315), (735, 330)], 'primary', 'Ocean Drive North', 'SR A1A', zl='strip_small', zr='strip_small')
ROADS['calabash'] = main([(330, 420), (300, 412), (250, 425), (212, 440)], 'secondary', 'Calabash Causeway', 'CR 64')
ROADS['marisol'] = main([(335, 740), (300, 790), (272, 832)], 'secondary', 'Marisol Road', 'CR 41')
ROADS['west'] = main([(355, 790), (345, 860), (370, 930), (410, 1000), (440, 1070), (500, 1085), (560, 1075), (600, 1062)], 'primary', 'Tamiami Trail', 'US-41')
ROADS['us1'] = main([(738.33, 921.17), (705, 960), (655, 1010), (612, 1050), (600, 1062), (620, 1130), (628, 1190), (640, 1235), (625, 1270), (600, 1310), (570, 1350), (548, 1372), (500, 1392), (465, 1396), (420, 1388),
                     (370, 1378), (332, 1366), (300, 1352)], 'trunk', 'Overseas Highway', 'US-1', 2, tags={'verge': 3.5})
US1 = ROADS['us1']
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
    for back in range(34, 90, 4):
        cd = dc - back
        if cd < 46: break
        L_ = lot(x + nx * cd, z + nz * cd, dx, dz, nx, nz, 60, 60)
        cx_, cz_ = x + nx * cd, z + nz * cd
        side_wet = not land.contains(Point(cx_ - nz * 48, cz_ + nx * 48))          # local +X of the house (front faces the road)
        if land.contains(L_) and not L_.intersects(u1b) and not L_.intersects(inland) and (side_wet or not need_side):
            best = (fr_, cd, dc, L_, side_wet); break
    if best: break
if best is None: best = (0.2, 60.0, 120.0, None, False)
x, z, dx, dz, nx, nz = on_keys(best[0], 0); cd, dc = best[1], best[2]
nico = (x + nx * cd, z + nz * cd); nico_lot = best[3] or lot(nico[0], nico[1], dx, dz, nx, nz, 60, 60); LOTS.append(nico_lot)
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
def bld(pts, h, kind, style, zone='airport', **kw): return W.building(sh(pts), h, kind, style, zone, check=False, **kw)
W.add_area(AP.intersection(land), 'grass', 'Solana International Airport')
rw((-5900, 120), (-4150, 120), 60, name='Runway 10R/28L'); rw((-5900, -150), (-4150, -150), 60, name='Runway 10C/28C'); rw((-5900, -420), (-4750, -420), 45, name='Runway 10L/28R')
rw((-5900, 20), (-4150, 20), 23, 'taxiway'); rw((-5900, -285), (-4750, -285), 23, 'taxiway')
for x in (-5880, -5300, -4780): rw((x, -420), (x, 120), 23, 'taxiway')
rw((-4180, -150), (-4180, 120), 23, 'taxiway'); rw((-4700, -700), (-4700, -150), 23, 'taxiway')
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
W.extra['airport'] = dict(name='Solana International Airport', code='SOL', tower=_p(-4280, -630), runways=[dict(name='10R/28L', a=_p(-5900, 120), b=_p(-4150, 120), width=60),
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
if not (700 < math.hypot(RWB[0] - RWA[0], RWB[1] - RWA[1]) < 2600): RWA, RWB = TR.p2w(268, 1288), TR.p2w(243, 1385)
if RWA[1] > RWB[1]: RWA, RWB = RWB, RWA                     # A = north end
_L = math.hypot(RWB[0] - RWA[0], RWB[1] - RWA[1]); _ux, _uz = (RWB[0] - RWA[0]) / _L, (RWB[1] - RWA[1]) / _L
_nx, _nz = (-_uz, _ux) if -_uz > 0 else (_uz, -_ux)        # normal pointing east (terminal side)
def TP(u, v): return (RWA[0] + _ux * u + _nx * v, RWA[1] + _uz * u + _nz * v)
island = next((p for p in solid if p.contains(Point(tc))), Point(tc).buffer(900))
def tarea(g, kind, name=None): W.add_area(g.intersection(island.buffer(-12)), kind, name, block='reserved')
tarea(LineString([TP(0, 0), TP(_L, 0)]).buffer(28, cap_style=2), 'runway', 'Tern Key Runway (main)')
tarea(LineString([TP(40, -110), TP(_L - 40, -110)]).buffer(9, cap_style=2), 'taxiway', None)
for u_ in (40, _L * 0.5, _L - 40): tarea(LineString([TP(u_, 0), TP(u_, -110)]).buffer(9, cap_style=2), 'taxiway', None)
_ca = math.radians(24); _l2 = _L * 0.78
X2A = TP(70, 60); X2B = TP(70 + _l2 * math.cos(_ca), 60 + _l2 * math.sin(_ca)); X2_MEASURED = False
_rest = _pts[np.abs((_pts - _c) @ np.array([-_v[1], _v[0]])) > 2.4]
if len(_rest) > 40:
    _c2 = _rest.mean(0); _e2, _w2 = np.linalg.eigh(np.cov((_rest - _c2).T)); _v2 = _w2[:, int(np.argmax(_e2))]
    _t2 = (_rest - _c2) @ _v2; _a2, _b2 = np.percentile(_t2, 5), np.percentile(_t2, 95)
    _qa, _qb = TR.p2w(*(_c2 + _v2 * _a2)), TR.p2w(*(_c2 + _v2 * _b2))
    if _e2.max() / max(_e2.min(), 1e-6) > 4.0 and 500 < math.hypot(_qb[0] - _qa[0], _qb[1] - _qa[1]) < 3600: X2A, X2B, X2_MEASURED = _qa, _qb, True
_ca = math.atan2(abs((X2B[0] - X2A[0]) * _nx + (X2B[1] - X2A[1]) * _nz), abs((X2B[0] - X2A[0]) * _ux + (X2B[1] - X2A[1]) * _uz) + 1e-6)
tarea(LineString([X2A, X2B]).buffer(17, cap_style=2), 'runway', 'Tern Key Runway (second)')
_ao = max(160.0, max((X2A[0] - RWA[0]) * _nx + (X2A[1] - RWA[1]) * _nz, (X2B[0] - RWA[0]) * _nx + (X2B[1] - RWA[1]) * _nz) + 80.0)
_apron = P([TP(_L * 0.55 - 150, _ao), TP(_L * 0.55 + 150, _ao), TP(_L * 0.55 + 150, _ao + 110), TP(_L * 0.55 - 150, _ao + 110)])
tarea(_apron, 'apron', 'Tern Key Airfield Apron')
W.building([TP(_L * 0.55 - 38, _ao + 116), TP(_L * 0.55 + 38, _ao + 116), TP(_L * 0.55 + 38, _ao + 142), TP(_L * 0.55 - 38, _ao + 142)], 6.5, 'terminal', 'terminal', 'airport', check=False, name='Tern Key Airfield Terminal', poi='terminal', region='Tern Key')
for i in range(3): W.building([TP(_L * 0.55 + 70 + i * 36, _ao + 116), TP(_L * 0.55 + 98 + i * 36, _ao + 116), TP(_L * 0.55 + 98 + i * 36, _ao + 144), TP(_L * 0.55 + 70 + i * 36, _ao + 144)], 7, 'hangar', 'hangar', 'airport', check=False, poi='hangar', region='Tern Key')
TERN_AF = island.buffer(-30)
W.add_area(TERN_AF.difference(unary_union([LineString([TP(0, 0), TP(_L, 0)]).buffer(24, cap_style=2), LineString([X2A, X2B]).buffer(19, cap_style=2)])), 'paved', 'Tern Key Airfield', block=None)
W.reserve(TERN_AF, 'reserved')
W.add_area(island.difference(island.buffer(-30)), 'beach', 'Tern Key shore', block=None)
_tf = TP(_L * 0.55, _ao + 150)
W.road([US1.pts[-1], _tf], 'tertiary', 'Airfield Road', region='Tern Key', tags={'nolots': 1})
W.extra['airfield'] = dict(name='Tern Key Airfield', runways=[dict(name='main', a=[round(v, 1) for v in RWA], b=[round(v, 1) for v in RWB], width=44), dict(name='second', a=[round(v, 1) for v in X2A], b=[round(v, 1) for v in X2B], width=34, measuredFromImage=X2_MEASURED)],
                           terminal=[round(v, 1) for v in TP(_L * 0.55, _ao + 129)], bearingDeg=round(math.degrees(math.atan2(_ux, -_uz)) % 360, 1))
XF.update(ac=(-4575.0, 6045.0), c=tc, sc=1.0, rot=0.0)

# ---------------------------------------------------------------- 5. towns inside the traced urban outlines
ANCH = [('Key Paloma', 600, 1305), ('Tern Key', 275, 1340), ('Coontie', 600, 1085), ('Shellmound', 440, 1075), ('Punta Marisol', 290, 830), ('Port Calabash', 245, 425),
        ('Port Cassia', 795, 515), ('Amaro Landing', 590, 490), ('Playa Serena', 750, 330), ('Citrus Flats', 710, 590), ('Brisa Heights', 690, 960), ('Allapattah West', 700, 620)]
EXTRA = ['Sabal Grove', 'Limpkin Park', 'Tangelo', 'Gumbo Limbo', 'Corkwood', 'Seagrape Heights', 'Buttonwood', 'Sandspur', 'Mullet Creek', 'Honeybell', 'Spoonbill Flats', 'Calamondin', 'Junonia', 'Whelk Harbor', 'Satsuma']
dry = land.difference(inland.buffer(10)).buffer(-14)
keep_out = unary_union([AP.buffer(12), TERN_AF.buffer(10), lots_u, realbox.buffer(2)])
TOWNS = {}
FILLK = {}
for nm_, inner, outer, org in (('West End', sbox(-4350, RZ0, RX0, RZ1), sbox(-5000, RZ0, -4350, RZ1), (RX0, 0.0)), ('North Shore', sbox(RX0, -3200, 1800, RZ0), sbox(RX0, -3900, 1800, -3200), (RX0, RZ0)),
                               ('South Shore', sbox(RX0, RZ1, 0, 3200), sbox(RX0, 3200, 0, 4000), (RX0, RZ1))):
    for part, band, skip in (('', inner, 0.06), (' Outskirts', outer, 0.42)):
        d_ = band.intersection(dry).difference(keep_out).difference(LineString(RING.center).buffer(40))
        if d_.is_empty or d_.area < 20000: continue
        TOWNS[nm_ + part] = d_; FILLK[nm_ + part] = 1.0 if not part else 0.6
        G.grid(W, d_, org, 0.0, 190, 100, namer(nm_ + part), namer(nm_ + part + 'x'), region=nm_, seed=nm_ + part, skip_u=skip, skip_v=skip)
_tk = next((p for p in solid if p.contains(Point(TR.p2w(470, 1395)))), None) or min(solid, key=lambda p: p.distance(Point(TR.p2w(470, 1395))))
_td = _tk.buffer(-22).difference(LineString(US1.pts).buffer(6))
if not _td.is_empty and _td.area > 4000:
    TOWNS['Tamarind Key'] = _tk.buffer(-22)
    G.grid(W, _tk.buffer(-22), (_tk.centroid.x, _tk.centroid.y), 0.2, 100, 70, namer('Tamarind Key'), namer('Tamarind Keyx'), region='Tamarind Key', seed='Tamarind Key', min_len=30)
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
    ang = rr_.uniform(0, math.pi / 2)
    if nm == 'Key Paloma': ang = math.atan2(TR.p2w(548, 1372)[1] - TR.p2w(640, 1235)[1], TR.p2w(548, 1372)[0] - TR.p2w(640, 1235)[0])
    G.grid(W, d, (c.x + 40, c.y + 40), ang, 112, 86 if not keys else 120, namer(nm), namer(nm + 'x'), region=nm, seed=nm)
    # make sure the town hangs on the main network
    mr_ = min((LineString(r.pts) for r in list(ROADS.values()) + [COLW, COLN, COLS]), key=lambda l: l.distance(c))
    q = mr_.interpolate(mr_.project(c))
    _cl = LineString([(c.x, c.y), (q.x, q.y)])
    if mr_.distance(up_) > 5 and not _cl.intersects(realbox.buffer(5)) and _cl.difference(land).length < 650 and not _cl.intersects(AP): W.road([(c.x, c.y), (q.x, q.y)], 'tertiary', namer(nm + 'c')(), region=nm)
print('towns', {k: round(v.area / 1e4) for k, v in TOWNS.items()})

towns_u = unary_union(list(TOWNS.values()))
forest_u = unary_union(FOREST)
swamp = unary_union([P(PX([(430, 640), (560, 640), (580, 770), (440, 775)])), P(PX([(340, 950), (560, 1000), (560, 1210), (480, 1230), (400, 1130)]))]).intersection(land).difference(inland.buffer(2)).difference(towns_u.buffer(30)).difference(AP.buffer(30))
W.add_area(swamp, 'sawgrass', 'swamp')
farm = P(PX([(703, 405), (765, 415), (770, 480), (760, 560), (703, 585)])).intersection(land).difference(inland.buffer(10)).difference(towns_u.buffer(20)).difference(forest_u)
rf = rng('fields'); fb = farm.bounds; fx = fb[0]
while fx < fb[2]:
    fz = fb[1]
    while fz < fb[3]:
        cell_ = sbox(fx + 8, fz + 8, fx + 392, fz + 352).intersection(farm)
        if cell_.area > 25000: W.add_area(cell_, rf.choice(['grove', 'grove', 'farmland', 'farmland', 'grass']), rf.choice(['Valencia grove', 'tangelo grove', 'tomato field', 'sweet corn', 'sugarcane', 'pasture', 'strawberry field']))
        fz += 360
    fx += 400
# ---------------------------------------------------------------- 6. finalize the network
wet = sbox(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ']).difference(land.buffer(0.5)).union(inland).difference(realbox)
from wl import design as D
D.CHANNELS[:] = [('Mariner Channel', PX([(520, 1340), (522, 1384), (524, 1420)]), 120, 9.0), ('Tern Pass', PX([(350, 1340), (352, 1372), (354, 1410)]), 60, 5.0),
                 ('Calabash Pass', PX([(312, 380), (314, 413), (316, 450)]), 60, 5.0)]
_inner = realbox.buffer(-1.0); _rr = []
for r in W.raw_roads:
    if r.tags.get('join') or not LineString(r.pts).intersects(_inner): _rr.append(r); continue
    g_ = LineString(r.pts).difference(realbox.buffer(0.5))
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
        if d_ > 2000 or d_ < 0.5: continue
        q = mains[j].interpolate(mains[j].project(Point(v))); ln_ = LineString([v, (q.x, q.y)])
        if ln_.intersects(realbox.buffer(5)) or ln_.intersects(AP) or ln_.intersects(lots_u) or ln_.intersects(TERN_AF) or ln_.intersection(wet).length > 650: continue
        W.raw_roads.append(Road([v, (q.x, q.y)], 'tertiary', lk(), region='link')); added += 1
    relinked += added
    if not added: break
    nb = RN.finalize(W, wet)
comps = RN.connectivity(W.roads); main_c = set(comps[0])
print(f'relinked {relinked} patches; roads {len(W.roads)} bridges {nb} orphan edges {sum(len(c) for c in comps[1:])} {time.time()-T0:.1f}s')
W.roads = [r for i, r in enumerate(W.roads) if i in main_c]
for r in W.roads:
    if not (r.bridge and r.layer > 0 and not r.tags.get('bclass')): W.idx.add(LineString(r.pts).buffer(r.width / 2 + 2.2, cap_style=2), 'road')
W.raw_roads = list(W.roads)
road_union = unary_union([LineString(r.pts).buffer(r.width / 2 + 3, cap_style=2) for r in W.roads if not r.bridge])
gl = swamp.buffer(-45); rc = rng('sloughs'); gb = gl.bounds if not gl.is_empty else (0, 0, 0, 0)
for i in range(90):
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
for nm, d in sorted(TOWNS.items(), key=lambda kv: ('Outskirts' in kv[0], -kv[1].area)):
    if len(W.buildings) > 24000: W.log.append(f'building cap reached before {nm}'); continue
    keys = nm in ('Key Paloma', 'Tern Key', 'Tamarind Key', 'Shellmound')
    ctx = dict(region=nm, pick_poi=G.poi_picker(G.KEYS_RETAIL if keys else G.RETAIL, nm), **(dict(palette=G.KEYS, tin=True, style='stilt') if keys else {}))
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
for _round in range(3):
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
            hq = h_ + 0.055 * d_
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
pk = np.unravel_index(int(np.argmax(H)), H.shape)
PEAK = dict(x=round(float(XX[pk])), z=round(float(ZZ[pk])), y=round(float(H.max()), 1))
os.makedirs(OUT, exist_ok=True)
(H / 0.1).round().astype('<i2').tofile(os.path.join(OUT, 'heights.bin'))

# ---------------------------------------------------------------- 9. export
def ring(c): return [[round(x, 2), round(z, 2)] for x, z in list(c)[:-1]]
def polyd(p, **kw):
    d = dict(kw); d['outer'] = ring(p.exterior.coords); d['holes'] = [ring(h.coords) for h in p.interiors]; return d
clip = realbox.buffer(-30); land_out = []
for g in (land.geoms if hasattr(land, 'geoms') else [land]):
    q = g.difference(clip)
    for p in (q.geoms if hasattr(q, 'geoms') else [q]):
        if p.geom_type == 'Polygon' and p.area > 60: land_out.append(polyd(p.simplify(1.0), id=f'l{len(land_out)+1}'))
TRANSFORM = dict(image='references/ref_40_map_user_official.webp (local only)', size=[1041, 1500], metersPerPixel=TR.S, x0=TR.X0, z0=TR.Z0, formula='x = x0 + mpp * px; z = z0 + mpp * py',
                 fit=dict(method='scale fixed at 30 m/px; x0 = least squares over 5 control points, z0 from the barrier island south tip', residualsM={'ocean shore (3 rows)': [42, 24, -36], 'beach bay shore': 610, 'downtown bayfront': -650, 'south tip': 0}))
from PIL import ImageDraw as _ID
_wi = Image.new('L', (1041, 1500), 0); _wd = _ID.Draw(_wi)
for w_ in W.water:
    if w_['poly'].geom_type == 'Polygon':
        _wd.polygon([TR.w2p(x, z) for x, z in w_['poly'].exterior.coords], fill=255)
        for h_ in w_['poly'].interiors: _wd.polygon([TR.w2p(x, z) for x, z in h_.coords], fill=0)
_wa = np.asarray(_wi) > 0
_li, _ln = ndimage.label(C['inland']); _ls = ndimage.sum_labels(np.ones_like(_li), _li, np.arange(_ln + 1)); LAKES = []
_rpx = (TR.w2p(RX0, RZ0), TR.w2p(RX1, RZ1))
for k_ in np.argsort(-_ls)[:40]:
    if k_ == 0 or _ls[k_] < 25: continue
    m_ = _li == k_; ys_, xs_ = np.nonzero(m_); cx_, cy_ = xs_.mean(), ys_.mean()
    if _rpx[0][0] - 25 < cx_ < _rpx[1][0] + 25 and _rpx[0][1] - 25 < cy_ < _rpx[1][1] + 25: continue
    sl_ = (slice(max(0, ys_.min() - 5), ys_.max() + 6), slice(max(0, xs_.min() - 5), xs_.max() + 6))
    a_ = m_[sl_]; b_ = _wa[sl_] & ~(C['inland'][sl_] & ~a_)
    LAKES.append(dict(px=[round(float(cx_)), round(float(cy_))], pixels=int(_ls[k_]), iou=round(float((a_ & b_).sum() / max(1, (a_ | b_).sum())), 2)))
    if len(LAKES) >= 14: break
feat = dict(version=3, generator='tools/world/build.py (traced from the official map image)', bounds=BOUNDS, realRect=REAL, imageTransform=TRANSFORM, land=land_out,
            water=[polyd(w['poly'].simplify(0.8), id=w['id'], kind=w['kind'], **({'name': w['name']} if w['name'] else {}), depth=w['depth']) for w in W.water if w['poly'].geom_type == 'Polygon'],
            areas=[polyd(a['poly'].simplify(0.8), id=a['id'], kind=a['kind'], **({'name': a['name']} if a['name'] else {})) for a in W.areas if a['poly'].geom_type == 'Polygon' and a['poly'].area > 10],
            shallows=[polyd(p.simplify(4.0), id=f's{i+1}') for i, p in enumerate(SHALLOW) if not p.within(realbox)],
            roads=[], paths=W.paths, buildings=W.buildings, pois=W.pois, props=W.props, trees=W.trees, places=[], joins=[], setpieces=W.setpieces, powerlines=W.powerlines,
            heights=dict(file='heights.bin', cell=CELLH, minX=hx0, minZ=hz0, nx=hnx, nz=hnz, unit=0.1))
for r in W.roads:
    d = dict(id=r.id, pts=[list(p) for p in r.pts], kind=r.kind, lanesFwd=r.lf, lanesBack=r.lb, oneway=r.oneway, speedKmh=r.speed, name=r.name, bridge=bool(r.bridge), width=round(r.width, 1), surface=r.surface, layer=r.layer)
    if r.ref: d['ref'] = r.ref
    if r.y: d['y'] = r.y
    feat['roads'].append(d)
    j = r.tags.get('join')
    if j and (tuple(r.pts[0]) == r2((j['x'], j['z'])) or tuple(r.pts[-1]) == r2((j['x'], j['z']))): feat['joins'].append(dict(x=j['x'], z=j['z'], roadId=r.id, osm=j['osm'], osmWay=j['osmWay']))
lcx, lcz = LAKE.centroid.x, LAKE.centroid.y
PL = [(nm, 'key' if 'Key' in nm else 'town', v.centroid.x, v.centroid.y, math.sqrt(v.area / math.pi)) for nm, v in TOWNS.items()]
PL += [('Lake Amaro', 'lake', lcx, lcz, math.sqrt(LAKE.area / math.pi)), ('Sawpalm Ridge State Park', 'park', PEAK['x'], PEAK['z'], 1800), ('Solana International Airport', 'airport', AP.centroid.x, AP.centroid.y, 1900),
       ('Tern Key Airfield', 'airport', *TR.p2w(262, 1335), 500), ('Corkwood Swamp', 'region', *TR.p2w(500, 700), 1300), ('Everglades', 'region', *TR.p2w(470, 1130), 1800), ('Mariner Channel Bridge', 'region', *TR.p2w(505, 1396), 400)]
feat['places'] = [dict(name=n, kind=k, x=round(x), z=round(z), r=round(r)) for n, k, x, z, r in PL]
with open(os.path.join(OUT, 'features.json'), 'w') as f: json.dump(feat, f, separators=(',', ':'))
regions = {k: ring(max((v.geoms if hasattr(v, 'geoms') else [v]), key=lambda g: g.area).simplify(10).exterior.coords) for k, v in TOWNS.items()}
regions['Lake Amaro'] = ring(LAKE.simplify(10).exterior.coords); regions['Solana International Airport'] = ring(AP.exterior.coords)
for i, p in enumerate(sorted(FOREST, key=lambda p: -p.area)[:4]): regions['Sawpalm Ridge State Park' if i == 0 else f'Sawpalm forest {i+1}'] = ring(p.simplify(25).exterior.coords)
layout = dict(version=3, bounds=BOUNDS, realRect=REAL, imageTransform=TRANSFORM, places=feat['places'], setpieces=W.setpieces, regions=regions, airport=W.extra.get('airport'), airfield=W.extra.get('airfield'), routes=W.extra.get('routes'),
              heights=feat['heights'], peak=PEAK, underwater=dict(shallow_polygons=len(feat['shallows']), channels=[dict(name=n, pts=[[round(x), round(z)] for x, z in pts], width=w, depth=dp) for n, pts, w, dp in D.CHANNELS]),
              highways=[dict(name=n, ref=r) for n, r in (('Cypress Belt Parkway (divided motorway ring)', 'SR 836'), ('Overseas Highway', 'US-1'), ('Tamiami Trail', 'US-41'), ('Citrus Belt Highway', 'US-27'), ('Corkwood Road', 'SR 49'), ('Lake Amaro Road', 'CR 720'), ('Ocean Drive North', 'SR A1A'), ('Calabash Causeway', 'CR 64'), ('Marisol Road', 'CR 41'))])
os.makedirs(os.path.join(ROOT, 'public', 'assets', 'world'), exist_ok=True)
with open(os.path.join(ROOT, 'public', 'assets', 'world', 'layout.json'), 'w') as f: json.dump(layout, f, separators=(',', ':'))
from collections import Counter
summary = dict(lake_overlay=LAKES, palette=PAL, road_km=round(sum(plen(r.pts) for r in W.roads) / 1000, 1), roads=len(W.roads), bridges=sum(1 for r in W.roads if r.bridge), buildings=len(W.buildings), pois=len(W.pois), land_polys=len(land_out), water=len(W.water),
               areas=len(W.areas), joins=len(feat['joins']), joins_expected=njoin, towns={k: round(v.area / 1e4) for k, v in TOWNS.items()}, stats=stats, peak=PEAK, setpieces=W.setpieces, transform=TRANSFORM, log=W.log[:40], seconds=round(time.time() - T0, 1))
with open(os.path.join(OUT, 'summary.json'), 'w') as f: json.dump(summary, f, indent=1)
print(json.dumps({k: summary[k] for k in ('road_km', 'roads', 'bridges', 'buildings', 'pois', 'land_polys', 'water', 'joins', 'joins_expected', 'peak', 'seconds')}), [(s['id'], s['x'], s['z']) for s in W.setpieces], W.log[:6])
