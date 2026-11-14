#!/usr/bin/env python
"""Port Solana V2 world-layout generator. Run: tools/world/.venv/bin/python tools/world/build.py
Writes tools/world/out/features.json, heights.bin and public/assets/world/layout.json (deterministic)."""
import json, math, os, sys, struct, time, traceback
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapely.geometry import Polygon, LineString, Point, box as sbox, MultiPolygon
from shapely.ops import unary_union
from wl import real as R, land as LD, design as D, gen as G, roadnet as RN
from wl.world import World, RANK
from wl.util import BOUNDS, REAL, catmull, rng, plen, cumlen, point_at, ellipse, heading_of, r2, resample, offset_line

T0 = time.time()
ROOT = R.ROOT
OUT = R.OUT
W = World()
realdata = R.load_real()
edge = R.edge_summary()
ld = LD.cached(realdata)
RX0, RX1, RZ0, RZ1 = REAL['minX'], REAL['maxX'], REAL['minZ'], REAL['maxZ']
realbox = sbox(RX0, RZ0, RX1, RZ1)
land = unary_union(ld['solid']).buffer(0)
W.set_land(land)
for p in ld['ponds']:
    if not p.intersects(realbox):
        W.add_water(p, 'pond')
print(f'land ready {time.time()-T0:.1f}s')

def P(pts): return Polygon(pts).buffer(0)
def spl(pts, step=20): return catmull(pts, step=step)

# ---------------------------------------------------------------- names
WORDS = ('Heron Egret Ibis Pelican Osprey Anhinga Limpkin Spoonbill Tern Plover Sandpiper Gallinule Coot Kingfisher Mockingbird Cardinal Bunting Warbler '
         'Palmetto Sabal Cypress Mangrove Seagrape Gumbo Coontie Buttonwood Mahogany Poinciana Jacaranda Hibiscus Bougainvillea Oleander Frangipani Ixora '
         'Tamarind Sapodilla Mango Papaya Guava Lychee Avocado Carambola Kumquat Tangelo Valencia Navel Pomelo Calamondin Satsuma Honeybell Temple Murcott '
         'Tarpon Snook Bonefish Redfish Pompano Grouper Snapper Wahoo Marlin Sailfish Mullet Cobia Permit Tripletail Sheepshead Ladyfish '
         'Conch Coquina Whelk Scallop Cowrie Junonia Sundial Starfish Sanddollar Driftwood Sandbar Tideline Seabreeze Trade Wind Doldrum Squall '
         'Calusa Tequesta Timucua Jororo Ais Mayaimi Marisol Paloma Brisa Corazon Estrella Luna Soledad Dulce Azul Dorado Sereno Pescador Faro Arena '
         'Indigo Coral Jade Amber Saffron Vermilion Cobalt Sienna Turquoise Opal Pearl Onyx Garnet Topaz '
         'Schooner Ketch Sloop Skiff Dinghy Catboat Trawler Mariner Compass Sextant Anchor Halyard Bowline Capstan Windlass Gunwale').split()
SUF = {'residential': ['Street', 'Lane', 'Court', 'Way', 'Drive', 'Terrace', 'Place', 'Circle'], 'tertiary': ['Avenue', 'Road', 'Drive'],
       'secondary': ['Boulevard', 'Road', 'Avenue'], 'track': ['Trail', 'Grade', 'Track'], 'service': ['Alley']}
_used = set()
def namer(tag, kind='residential'):
    rr = rng('names', tag)
    order = list(WORDS); rr.shuffle(order)
    state = {'i': 0}
    cache = {}
    def f(k=None):
        if k is not None and k in cache: return cache[k]
        while True:
            w = order[state['i'] % len(order)]; rnd_s = SUF.get(kind, SUF['residential'])
            s = rnd_s[(state['i'] // len(order) + rr.randrange(len(rnd_s))) % len(rnd_s)]
            state['i'] += 1
            nm = f'{w} {s}'
            if nm not in _used:
                _used.add(nm); break
        if k is not None: cache[k] = nm
        return nm
    return f

# ---------------------------------------------------------------- fresh water
lc, lr = D.LAKE_AMARO['c'], D.LAKE_AMARO['r']
rr = rng('lake')
ph = [rr.uniform(0, 6.28) for _ in range(4)]
lake = P([(lc[0] + (lr * (1 + 0.07 * math.sin(2 * t + ph[0]) + 0.045 * math.sin(3 * t + ph[1]) + 0.03 * math.sin(5 * t + ph[2]))) * math.cos(t),
           lc[1] + (lr * 0.94 * (1 + 0.06 * math.sin(2 * t + ph[3]) + 0.03 * math.sin(4 * t + ph[1]))) * math.sin(t)) for t in [i * 2 * math.pi / 96 for i in range(96)]])
W.add_water(lake, 'lake', 'Lake Amaro', depth=3.5)
for nm, (kind, pts, w0, w1) in D.RIVERS.items():
    line = spl(pts, 15)
    cum = cumlen(line); L = cum[-1]
    left = [offset_line(line, -1)[i] for i in range(len(line))]
    polyL, polyR = [], []
    for i, p in enumerate(line):
        w = (w0 + (w1 - w0) * cum[i] / L) / 2
        x, z, dx, dz = point_at(line, cum[i], cum)
        polyL.append((x + dz * w, z - dx * w)); polyR.append((x - dz * w, z + dx * w))
    rv = P(polyL + polyR[::-1]).difference(lake)
    W.add_water(rv, kind, nm, depth=2.2)
sp = Point(D.SPRING['c']).buffer(D.SPRING['r'])
W.add_water(sp, 'pond', 'Sawpalm Spring', depth=6.0)
inland = unary_union([w['poly'] for w in W.water])

# ---------------------------------------------------------------- regions (layout polygons)
REG = {
    'Solana International Airport': P([(-5960, -1040), (-4060, -1040), (-4060, 330), (-5960, 330)]),
    'Airport District': P([(-4050, -1040), (-3800, -1040), (-3800, 300), (-4050, 300)]),
    'Central Wetlands': P([(-6200, 780), (-3840, 780), (-3840, 2600), (-4200, 2850), (-6050, 2700)]),
    'West End': P([(-3800, 560), (-3710, 560), (-3710, 2654), (-3800, 2654)]),
    'South Shore': P([(-3709, 2660), (-2960, 2660), (-2700, 2960), (-1800, 3000), (-700, 3100), (200, 3450), (250, 3740), (-200, 3530), (-900, 3380), (-1800, 3330), (-2800, 3280), (-3640, 3160), (-3860, 2950), (-3830, 2760)]),
    'Everglades': P([(-6000, 2750), (-3900, 3080), (-2800, 3320), (-900, 3420), (250, 3780), (540, 4020), (430, 4260), (-900, 4760), (-1800, 5360), (-2800, 4900), (-5160, 4310), (-5700, 3500)]),
    'Punta Marisol': P(D.ISLANDS['punta_marisol']), 'Osprey Island': P(ellipse(-6150, -4750, 330, 230, math.radians(-25))),
    'North Shore': P([(-3709, -2660), (-2050, -2660), (-1900, -2900), (-1500, -3020), (-500, -3090), (700, -3320), (1250, -3560), (1150, -3700), (500, -3480), (-500, -3290), (-1650, -3260), (-2400, -3420), (-3250, -3200), (-3800, -2760)]),
    'Lake Amaro': Point(lc).buffer(lr + 150),
    'Citrus Flats': P([(-5250, -2800), (-5200, -3200), (-4850, -3700), (-4300, -3930), (-3650, -3700), (-3250, -3300), (-3840, -2800)]),
    'Corkwood Swamp': P([(-5850, -1900), (-5300, -2400), (-5250, -2800), (-3840, -2800), (-3880, -1300), (-4300, -1260), (-5800, -1280)]),
    'Port Calabash': P([(-6100, -4050), (-5600, -4100), (-5300, -4000), (-5300, -3450), (-5800, -3350), (-6150, -3600)]),
    'Sawpalm Ridge State Park': P([(-5000, -4700), (-3600, -4250), (-2300, -4450), (-1500, -5300), (-700, -6500), (-900, -7250), (-2600, -7650), (-4200, -7250), (-5000, -6100), (-5300, -5100)]),
    'Port Cassia': P([(1450, -4520), (1800, -4420), (2600, -4520), (2780, -4640), (2780, -4950), (2400, -5250), (1500, -5300), (1300, -4900)]),
    'Playa Serena': P([(1760, -2660), (4120, -2660), (3880, -2950), (3480, -3420), (3140, -3900), (2970, -4190), (2790, -4260), (2630, -4170), (2560, -3950), (2450, -3600), (2210, -3200), (1910, -2900)]),
    'Faro Key': P(D.ISLANDS['faro_key']), 'Virginia Key': P([(1320, 2660), (1300, 2850), (1420, 3050), (1650, 3120), (1850, 3000), (1900, 2800), (1850, 2660)]),
    'Key Paloma': P(D.ISLANDS['key_paloma']).buffer(40), 'Tern Key': P(D.ISLANDS['tern_key']).buffer(30),
    **{nm: P(ellipse(*D.ELLIPSE_ISLANDS[k][:4], math.radians(D.ELLIPSE_ISLANDS[k][4]))) for nm, k in (('Sapodilla Key', 'sapodilla_key'), ('Tamarind Key', 'tamarind_key'), ('Key Anhinga', 'key_anhinga'))},
    'Shellmound': P(ellipse(-6560, 2150, 125, 92, math.radians(15))), 'Cape Cormorant': P([(-5550, 3800), (-4600, 4000), (-4500, 4450), (-5200, 4350)]),
}
W.regions = REG

# ---------------------------------------------------------------- highways
def trunk(ctrl, kind, name, ref='', lanes=2, **kw):
    lf = lanes // 2 if lanes > 1 else 1
    return W.road(resample(spl(ctrl), 22), kind, name, ref=ref, lf=lf, lb=lf, **kw)

I95 = RN.Motorway(W, [(-3745, -700), (-3900, -1150), (-4010, -2000), (-3900, -2700), (-3350, -3350), (-2500, -3650), (-2050, -4050), (-1750, -4500), (-1000, -4690), (0, -4660), (1000, -4610), (1500, -4590)],
                  'Interstate 95', 'I-95', lanes=3, region='hwy')
M836 = RN.Motorway(W, [(-3750, -1096), (-4200, -1130), (-5000, -1140), (-5700, -1150), (-5960, -1320), (-5950, -1900), (-5400, -2450), (-5270, -3250), (-4900, -3780), (-4300, -3990), (-3700, -3830), (-3420, -3560)],
                   'Cypress Belt Parkway', 'SR 836', lanes=2, region='hwy')
US1S = trunk([(-3790, 2715), (-3860, 2800), (-3880, 2950), (-3650, 3180), (-2800, 3300), (-1800, 3350), (-900, 3400), (-200, 3550), (250, 3760), (400, 4000), (440, 4230), (700, 4650), (579, 4761), (366, 4974), (84, 5256), (-199, 5539), (-482, 5822), (-660, 6000),
              (-1290, 6270), (-1900, 6520), (-2250, 6545), (-2620, 6440), (-2960, 6330), (-3350, 6200), (-3700, 6080), (-3950, 6130)],
             'trunk', 'Overseas Highway', 'US-1', lanes=2, zl='keys', zr='keys', tags={'verge': 3.5})
US41 = trunk([(-3800, 1366), (-4500, 1400), (-5500, 1450), (-6120, 1500), (-6190, 1700), (-6200, 1950), (-6330, 2090), (-6560, 2150)], 'primary', 'Tamiami Trail', 'US-41', lanes=2)
LOOP = trunk([(-6190, 1700), (-5900, 2450), (-5400, 2850), (-4600, 2950), (-3900, 3050), (-3650, 3180)], 'secondary', 'Corkwood Road', 'SR 49')
PARKRD = trunk([(-2800, 3300), (-3300, 3800), (-3600, 4100), (-4100, 4210), (-4600, 4250), (-5000, 4200)], 'secondary', 'Cape Cormorant Road', 'SR 27')
US1N = trunk([(-2432, -2745), (-2100, -2950), (-1500, -3120), (-500, -3200), (300, -3300), (900, -3480), (1350, -3800), (1600, -4150), (1750, -4450), (2100, -4560), (2600, -4580)],
             'trunk', 'Federal Highway', 'US-1', lanes=4, zl='strip', zr='strip')
CAUSE = trunk([(700, -3415), (1100, -3290), (1480, -3250), (1900, -3250), (2330, -3270), (3280, -3270)], 'secondary', 'Pelican Causeway', 'SR 922')
A1A = trunk([(3870, -2745), (3350, -3200), (2950, -3700), (2800, -4150)], 'primary', 'Ocean Drive North', 'SR A1A', zl='apartment', zr='strip_small')
FARO = trunk([(-200, 3550), (150, 3380), (500, 3330), (900, 3330), (1300, 3360), (1750, 3500), (2050, 3700), (2150, 4250)], 'secondary', 'Faro Causeway', 'SR 913')
BEAR = trunk([(1750, 3500), (1800, 3300), (1620, 3050), (1590, 2745)], 'secondary', 'Bear Cut Road')
LAKERD = W.road([(lc[0] + (lr + 75) * math.cos(t), lc[1] + (lr * 0.94 + 75) * math.sin(t)) for t in [i * 2 * math.pi / 60 for i in range(61)]], 'tertiary', 'Lake Amaro Shore Road', ref='CR 720', zl=None, zr='rural_strip')
LAKECON = trunk([(-1500, -3120), (-1450, -3300)], 'tertiary', 'Amaro Landing Road')
US27 = trunk([(-3800, -1810), (-4400, -2100), (-4900, -2700), (-4700, -3300), (-4300, -3990)], 'primary', 'Citrus Belt Highway', 'US-27')
COAST = trunk([(1750, -4450), (1500, -5000), (900, -4900), (480, -4850), (0, -5300), (-1200, -5450), (-2000, -5560)], 'secondary', 'Sound Road', 'CR 30')
PARK = trunk([(-1600, -3950), (-2050, -4050), (-2350, -4300), (-2650, -4500), (-2400, -4750), (-2850, -4950), (-2450, -5150), (-2950, -5350), (-2550, -5550), (-3050, -5700), (-3300, -5850)], 'tertiary', 'Ridge Road')
MARISOL = trunk([(-6000, 1560), (-6200, 1430), (-6350, 1370), (-6600, 1300)], 'tertiary', 'Marisol Road', zl='shopfront', zr='shopfront')
OVAL = [(-6160 + 190 * math.cos(t) * math.cos(-0.436) - 95 * math.sin(t) * math.sin(-0.436), -4760 + 190 * math.cos(t) * math.sin(-0.436) + 95 * math.sin(t) * math.cos(-0.436)) for t in [i * 2 * math.pi / 48 for i in range(49)]]
OVAL[-1] = OVAL[0]
RACE = trunk([(-4800, -2690), (-5200, -2760), (-5400, -2850), (-5420, -3100), (-5390, -3500), (-5330, -4000), (-5400, -4450), (-5500, -4830), (-5850, -4880), OVAL[0]], 'tertiary', 'Raceway Road', 'CR 64')
W.road(OVAL, 'service', 'Osprey Island Speedway', lf=2, oneway=True, region='Osprey Island', tags={'nolots': 1, 'racetrack': 1})
# fringe collectors that every real street meets just outside the rectangle
COLW = W.road([(-3800, -2745), (-3800, 2745)], 'secondary', 'West Line Avenue', lf=1, lb=1, zl='strip_small', zr=None, region='fringe')
COLN = W.road([(-3800, -2745), (-2030, -2745)], 'tertiary', 'NW 30th Street', zl='house_small', zr=None, region='fringe')
COLB = W.road([(1800, -2745), (4080, -2745)], 'tertiary', 'W 47th Street', zl='apartment', zr=None, region='fringe')
COLS = W.road([(-3800, 2745), (-3000, 2745)], 'tertiary', 'SW 28th Road', zr='house_small', zl=None, region='fringe')
COLV = W.road([(1370, 2745), (1820, 2745)], 'tertiary', 'Virginia Beach Drive', region='fringe')
for a, b in (((-4060, -20), (-3800, -20)), ((-4060, 60), (-3800, 60))):
    W.road([a, b], 'primary', 'Airport Boulevard', lf=2, lb=2)
# joins: every real road gets a stub from its exact crossing point to the fringe collector / our highway
NORMAL = {'north': (0, -1), 'south': (0, 1), 'west': (-1, 0), 'east': (1, 0)}
KMAP = {'unclassified': 'residential', 'living_street': 'residential', 'trunk_link': 'trunk', 'primary_link': 'primary', 'secondary_link': 'secondary', 'tertiary_link': 'tertiary'}
njoin = 0
if edge:
    for side, S in edge['sides'].items():
        nx, nz = NORMAL[side]
        for e in S['roads']:
            x, z = e['x'], e['z']
            kind = KMAP.get(e['kind'], e['kind'])
            if kind not in RANK: continue
            if not land.buffer(3).contains(Point(x + nx * 12, z + nz * 12)) and not e.get('bridge'):
                continue
            p0 = (x, z)
            dvec = tuple(e.get('dir') or (nx, nz))
            lanes_o, lanes_i = max(e.get('lanesOut', 1), 0), max(e.get('lanesIn', 1), 0)
            flow = e.get('flow', 'both')
            mw = kind in ('motorway', 'motorway_link')
            target = None
            if mw and side == 'west' and -1250 < z < -900: target = M836
            elif mw and side == 'west' and -850 < z < -500: target = I95
            if target is not None:
                if flow == 'in':
                    a = target.back.pts[-1]; ta = RN._dir(target.back.pts[-2], target.back.pts[-1])
                    r = W.road(RN.bezier(a, ta, p0, (-dvec[0], -dvec[1])), kind, e.get('name') or target.name, ref=target.ref, lf=max(1, lanes_i), oneway=True, region='join')
                else:
                    b = target.fwd.pts[0]; tb = RN._dir(target.fwd.pts[0], target.fwd.pts[1])
                    r = W.road(RN.bezier(p0, dvec, b, tb), kind, e.get('name') or target.name, ref=target.ref, lf=max(1, lanes_o), oneway=True, region='join')
            elif mw:
                q = (-3790, 2715)
                pts = [p0, q] if flow != 'in' else [q, p0]
                r = W.road(pts, 'trunk', 'South Dixie Highway', ref='US-1', lf=2, oneway=True, region='join')
            else:
                q = (x + nx * 91.07, z + nz * 91.07) if side != 'north' or True else None
                if side == 'west': q = (-3800.0, z)
                elif side == 'north': q = (x, -2745.0)
                elif side == 'south': q = (x, 2745.0)
                one = flow in ('in', 'out')
                pts = [p0, q] if flow != 'in' else [q, p0]
                r = W.road(pts, kind, e.get('name') or '', ref=e.get('ref') or '', lf=max(1, lanes_o if flow != 'in' else lanes_i), lb=0 if one else max(1, lanes_i), oneway=one, region='join')
            if r:
                r.tags['join'] = dict(x=x, z=z, osm=e.get('ref') or e.get('name') or e['kind'], osmWay=e.get('osmWay'))
                njoin += 1
print('joins', njoin)
try:
    RN.tee(W, I95, M836, at_end=True, reach=300)
except Exception as ex:
    W.log.append('tee failed ' + repr(ex))
# I-95 ends at Port Cassia: both carriageways meet the trunk
W.road([I95.fwd.pts[-1], (1680, -4500), (1750, -4450)], 'trunk', 'Interstate 95', ref='I-95', lf=2, oneway=True)
W.road([(1750, -4450), (1670, -4560), I95.back.pts[0]], 'trunk', 'Interstate 95', ref='I-95', lf=2, oneway=True)
for mw, cross in ((I95, US27), (M836, US27), (I95, COAST), (I95, PARK), (M836, US41)):
    try: RN.diamond(W, mw, cross, reach=260, lateral=120)
    except Exception as ex: W.log.append('diamond ' + repr(ex))

# ---------------------------------------------------------------- street grids
motor_buf = unary_union([LineString(m.center).buffer(45) for m in (I95, M836)])
dry = land.difference(inland.buffer(14))
def district(name, poly, shrink=22):
    return poly.intersection(dry.buffer(-shrink)).difference(motor_buf).difference(realbox.buffer(1))
def num_namer(prefix, suffix, start, step=1):
    def f(k):
        n = start + k * step
        return f'{prefix} {n}{"th" if 10 < n % 100 < 14 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")} {suffix}' if n > 0 else namer(prefix + suffix)()
    return f
DIST = {}
def add_grid(key, poly, origin, ang, du, dv, zone, nm=None, **kw):
    d = district(key, poly)
    if d.is_empty: return
    DIST[key] = (d, zone)
    n1, n2 = namer(key + 'u'), namer(key + 'v', 'tertiary')
    G.grid(W, d, origin, ang, du, dv, kw.pop('namer_u', n1), kw.pop('namer_v', n2), region=key, seed=key, **kw)
add_grid('North Shore', REG['North Shore'], (-3709, -2745), 0.0, 190, 92, 'house', namer_u=num_namer('NW', 'Street', 30), skip_v=0.15)
add_grid('West End', P([(-4040, 600), (-3800, 600), (-3800, 2654), (-4040, 2500)]), (-3800, 1366), 0.0, 120, 106, 'house_small')
add_grid('Allapattah West', P([(-3960, -2700), (-3800, -2700), (-3800, -1250), (-3930, -1250)]), (-3800, -1810), 0.0, 130, 95, 'warehouse')
add_grid('Airport District', REG['Airport District'], (-3800, -20), 0.0, 125, 110, 'warehouse')
add_grid('South Shore', REG['South Shore'], (-3709, 2745), 0.05, 170, 96, 'house', skip_u=0.1)
add_grid('Port Cassia', REG['Port Cassia'], (2100, -4580), 0.04, 120, 88, 'house_small')
add_grid('Playa Serena', REG['Playa Serena'], (3870, -2745), -0.72, 150, 95, 'apartment')
add_grid('Key Paloma', REG['Key Paloma'], (419, 5027), 2.356, 110, 150, 'stilt')
add_grid('Port Calabash', REG['Port Calabash'], (-5700, -3700), 0.1, 100, 78, 'house_small')
add_grid('Tern Key', P([(-4180, 5760), (-3650, 5860), (-3640, 6430), (-3950, 6530), (-4210, 6290)]), (-3950, 6130), 0.12, 96, 74, 'stilt')
add_grid('Faro Key', P([(1750, 3560), (2400, 3560), (2400, 4200), (1900, 4200)]), (2050, 3700), 1.45, 120, 86, 'house_big')
add_grid('Shellmound', REG['Shellmound'], (-6560, 2150), 0.26, 70, 60, 'stilt')
add_grid('Amaro Landing', P([(-1750, -3360), (-1150, -3400), (-1250, -3130), (-1700, -3150)]), (-1450, -3300), 0.05, 100, 80, 'house_small')
add_grid('Punta Marisol', REG['Punta Marisol'], (-6500, 1300), 0.2, 90, 70, 'house_small')
add_grid('Tamarind Key', REG['Tamarind Key'], (-1950, 6520), 0.09, 120, 70, 'stilt')
# Citrus Flats farm roads
cf = district('Citrus Flats', REG['Citrus Flats'], 30)
DIST['Citrus Flats'] = (cf, None)
G.grid(W, cf, (-4500, -2500), 0.08, 520, 480, namer('farm', 'track'), namer('farm2', 'tertiary'), kind='track', kind_v='tertiary', region='Citrus Flats', seed='cf', min_len=120)
# airfields / airport service roads
W.road([(-4060, -1040), (-4060, 330), (-5960, 330), (-5960, -1040), (-4060, -1040)], 'service', 'Perimeter Road', lf=1, lb=1, region='airport')
W.road([(-4060, 20), (-4300, 20), (-4300, -330), (-4620, -330), (-4620, 20), (-4300, 20)], 'secondary', 'Terminal Loop', lf=2, oneway=True, region='airport')
W.road([(-4060, 20), (-3800, 20)], 'secondary', 'Terminal Loop', region='airport')
W.road([(-4060, 330), (-4060, 700), (-3800, 700)], 'tertiary', 'Cargo Road', region='airport')
W.road([(-4200, 6030), (-4180, 5760)], 'service', 'Airfield Road', region='Tern Key')
# Nico's lane on Key Paloma (dead-end to the point)
W.road([(402, 4938), (330, 4866), (275, 4808), (252, 4784)], 'residential', 'Pelican Point Lane', region='Key Paloma', zl=None, zr=None, tags={'nolots': 1})

# ---------------------------------------------------------------- finalize network
wet = sbox(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ']).difference(land.buffer(0.5)).union(inland).difference(realbox)
nb = RN.finalize(W, wet)
comps = RN.connectivity(W.roads)
main = set(comps[0])
dropped = sum(len(c) for c in comps[1:])
W.roads = [r for i, r in enumerate(W.roads) if i in main]
print(f'roads {len(W.roads)} bridges {nb} dropped_orphans {dropped} {time.time()-T0:.1f}s')
def index_roads():
    for r in W.roads:
        ln = LineString(r.pts)
        if r.bridge and r.layer > 0 and not r.tags.get('bclass'): continue
        W.idx.add(ln.buffer(r.width / 2 + 2.2, cap_style=2), 'road')
index_roads()
W.raw_roads = list(W.roads)
road_union = unary_union([LineString(r.pts).buffer(r.width / 2 + 3, cap_style=2) for r in W.roads if not r.bridge])

# ---------------------------------------------------------------- airport
def area(pts, kind, name=None, block='reserved'):
    W.add_area(P(pts) if not hasattr(pts, 'area') else pts, kind, name, block=block)
def rw(a, b, w, kind='runway', name=None):
    area(LineString([a, b]).buffer(w / 2, cap_style=2), kind, name)
AP = REG['Solana International Airport']
W.add_area(AP, 'grass', 'Solana International Airport')
rw((-5900, -780), (-4150, -780), 60, name='Runway 9L/27R'); rw((-5900, 120), (-4250, 120), 60, name='Runway 9R/27L'); rw((-5750, -600), (-4950, -60), 45, name='Runway 13/31')
for z in (-680, 20): rw((-5900, z), (-4150, z), 23, 'taxiway')
for x in (-5880, -5300, -4760, -4180): rw((x, -780), (x, 120), 23, 'taxiway')
area([(-4900, -600), (-4150, -600), (-4150, -60), (-4900, -60)], 'apron', 'Terminal Apron')
area([(-5800, 180), (-4400, 180), (-4400, 320), (-5800, 320)], 'apron', 'Cargo and General Aviation Apron')
def bld(pts, h, kind, style, zone='airport', **kw):
    return W.building(pts, h, kind, style, zone, check=False, region='airport', **kw)
bld([(-4660, -430), (-4340, -430), (-4340, -350), (-4660, -350)], 16, 'terminal', 'terminal', name='Solana International Terminal', poi='terminal')
for i, x in enumerate((-4640, -4500, -4360)):
    bld([(x - 14, -590), (x + 14, -590), (x + 14, -430), (x - 14, -430)], 11, 'terminal', 'terminal', name=f'Concourse {"ABC"[i]}', poi='gate')
bld([(-4560, -300), (-4460, -300), (-4460, -60), (-4560, -60)], 18, 'parking', 'garage', name='Terminal Garage North', poi='parking')
bld([(-4440, -300), (-4340, -300), (-4340, -60), (-4440, -60)], 18, 'parking', 'garage', name='Terminal Garage South', poi='parking')
bld([(-4720, -250), (-4700, -250), (-4700, -230), (-4720, -230)], 62, 'tower', 'tower', name='Solana Tower', poi='control_tower')
for i in range(6):
    x = -5750 + i * 190
    bld([(x, 240), (x + 150, 240), (x + 150, 310), (x, 310)], 13, 'hangar' if i > 2 else 'warehouse', 'hangar' if i > 2 else 'industrial', poi='hangar' if i > 2 else 'cargo_terminal')
for i in range(5):
    c = Point(-5850 + i * 40, -960).buffer(15, resolution=6)
    bld(list(c.exterior.coords)[:-1], 12, 'storage_tank', 'industrial', poi='fuel_depot')
bld([(-4200, 220), (-4100, 220), (-4100, 300), (-4200, 300)], 9, 'fire_station', 'lowrise', poi='fire_station', name='Airport Rescue Station 1')
bld([(-4290, -40), (-4080, -40), (-4080, 0), (-4290, 0)], 14, 'retail', 'garage', name='Rental Car Center', poi='car_rental')
W.extra['airport'] = dict(name='Solana International Airport', code='SOL', tower=[-4710, -240], runways=[
    dict(name='9L/27R', a=[-5900, -780], b=[-4150, -780], width=60), dict(name='9R/27L', a=[-5900, 120], b=[-4250, 120], width=60), dict(name='13/31', a=[-5750, -600], b=[-4950, -60], width=45)],
    approaches=[dict(runway='27R', threshold=[-4150, -780], from_=[4500, -780], glideDeg=5.0, note='over Overtown, the bay islands and South Beach; steep approach clears downtown towers'),
                dict(runway='27L', threshold=[-4250, 120], from_=[4500, 120], glideDeg=5.5, note='over downtown and PortMiami'),
                dict(runway='9L', threshold=[-5900, -780], from_=[-7000, -780], glideDeg=3.0, note='over the Gulf'), dict(runway='9R', threshold=[-5900, 120], from_=[-7000, 120], glideDeg=3.0)],
    departures=[dict(runway='9L', start=[-5900, -780], heading=90), dict(runway='27R', start=[-4150, -780], heading=270)])
# Tern Key Airfield
rw((-4900, 6230), (-4250, 5860), 30, name='Tern Key Runway 7/25'); rw((-4850, 5860), (-4400, 6430), 26, name='Tern Key Runway 14/32')
area([(-4370, 5860), (-4210, 5860), (-4210, 6000), (-4370, 6000)], 'apron', 'Tern Key Airfield Apron')
W.building([(-4280, 5875), (-4225, 5875), (-4225, 5905), (-4280, 5905)], 6, 'terminal', 'terminal', 'airport', check=False, name='Tern Key Airfield', poi='terminal', region='Tern Key')
for i in range(3):
    W.building([(-4360 + i * 34, 5950), (-4332 + i * 34, 5950), (-4332 + i * 34, 5980), (-4360 + i * 34, 5980)], 7, 'hangar', 'hangar', 'airport', check=False, poi='hangar', region='Tern Key')
W.extra['airfield'] = dict(name='Tern Key Airfield', runways=[dict(name='7/25', a=[-4900, 6230], b=[-4250, 5860], width=30), dict(name='14/32', a=[-4850, 5860], b=[-4400, 6430], width=26)])
W.reserve(P(D.ISLANDS['tern_key']).intersection(P([(-5100, 5680), (-4190, 5680), (-4190, 6630), (-5100, 6630)])), 'reserved')

# ---------------------------------------------------------------- set pieces
W.reserve(Point(236, 4766).buffer(30), 'reserved')
W.setpiece('nico_house', 236, 4766, heading_of(0.707, 0.707), note='Keys stilt house lot on Pelican Point, bay side of the upper end of Key Paloma: water to the north, west and south; Pelican Point Lane arrives from the south-east', lot_radius=28, dock=[204, 4737])
W.setpiece('keys_sign', 702, 4678, heading_of(-0.53, -0.85), note='Welcome sign on the right shoulder of the southbound Overseas Highway where the first bridge lands on Key Paloma; faces traffic arriving from the mainland')
W.reserve(Point(702, 4678).buffer(9), 'reserved')
W.path([(216, 4749), (194, 4727)], 'dock', 2.0, 'wood', name="Nico's dock")
W.setpiece('keys_bar', -9, 5305, heading_of(0.707, 0.707), note='Roadside bar lot on the bay side of the Overseas Highway, mid Key Paloma; front faces the highway (east-south-east), water behind', lot_radius=20)
W.reserve(Point(-9, 5305).buffer(21), 'reserved')
# Osprey Island Speedway (north-west cape island)
W.add_area(Polygon(OVAL).buffer(9).difference(Polygon(OVAL).buffer(-9)), 'paved', 'Osprey Island Speedway', block='reserved')
W.add_area(Polygon(OVAL).buffer(-12), 'grass', 'speedway infield')
W.building([(-6235, -4640), (-6105, -4700), (-6095, -4680), (-6225, -4620)], 11, 'grandstand', 'industrial', 'commercial', check=False, name='Osprey Island Speedway Grandstand', poi='stadium', region='Osprey Island')
W.add_area(P([(-5990, -4760), (-5900, -4800), (-5870, -4740), (-5960, -4700)]), 'parking', 'speedway parking', block='reserved')
W.poi(-6160, -4760, 'raceway', 'Osprey Island Speedway')

# ---------------------------------------------------------------- land cover
def cover(key, kind, name=None, minus=None):
    p = REG[key].intersection(land).difference(inland)
    if minus is not None: p = p.difference(minus)
    W.add_area(p, kind, name or key)
cover('Central Wetlands', 'sawgrass', 'Limpkin Marsh Conservation Area'); cover('Everglades', 'sawgrass', 'Everglades')
cover('Sawpalm Ridge State Park', 'forest'); cover('Cape Cormorant', 'scrub'); cover('Corkwood Swamp', 'sawgrass', 'Corkwood Swamp')
for k, polys in ld['bands'].items():
    for p in polys:
        if not p.within(realbox): W.add_area(p, k, block='reserved' if k in ('beach', 'mangrove') else None)
rf = rng('fields')
x = -5900
while x < -3200:
    z = -4000
    while z < -1280:
        cell = sbox(x + 14, z + 14, x + 506, z + 466).intersection(cf)
        if cell.area > 30000:
            W.add_area(cell, rf.choice(['grove', 'grove', 'farmland', 'farmland', 'grove', 'grass']), rf.choice(['Valencia grove', 'tangelo grove', 'tomato field', 'sweet corn', 'sugarcane', 'pasture', 'strawberry field', 'grapefruit grove']))
        z += 480
    x += 520
# hammocks, gator holes, airboat trails
rg = rng('glades')
gl = REG['Everglades'].union(REG['Central Wetlands']).union(REG['Corkwood Swamp'].difference(motor_buf.buffer(30))).intersection(land).difference(inland).buffer(-60)
holes, hammocks = [], []
for i in range(46):
    for _ in range(30):
        px, pz = rg.uniform(-6100, 400), rg.uniform(-2800, 5300)
        if gl.contains(Point(px, pz)) and not W.idx.hit(Point(px, pz).buffer(60), ('road', 'water')):
            break
    else: continue
    if i % 3 == 0:
        W.add_water(P(ellipse(px, pz, rg.uniform(9, 22), rg.uniform(7, 15), rg.uniform(0, 3))), 'pond', 'gator hole', depth=1.6); holes.append([round(px), round(pz)])
    else:
        W.add_area(P(ellipse(px, pz, rg.uniform(30, 90), rg.uniform(20, 50), rg.uniform(0, 3), 14)), 'forest', 'hardwood hammock'); hammocks.append([round(px), round(pz)])
AIRBOAT = [[(-4500, 1420), (-4700, 1700), (-5200, 1900), (-5500, 2250), (-5000, 2500), (-4500, 2300), (-4400, 1800), (-4500, 1420)],
           [(-3300, 3800), (-2900, 3900), (-2300, 3800), (-1700, 3900), (-1300, 3750), (-1900, 3600), (-2700, 3600), (-3300, 3800)]]
for i, t in enumerate(AIRBOAT):
    W.add_water(LineString(spl(t, 15)).buffer(4.5).intersection(gl.buffer(40)).difference(road_union), 'marsh_open', f'airboat trail {i+1}', depth=0.6)
rc = rng('sloughs'); nsl = 0
for i in range(70):
    for _ in range(40):
        p0 = (rc.uniform(-6100, 300), rc.uniform(-2800, 5300))
        if gl.contains(Point(p0)): break
    else: continue
    a = rc.uniform(0, 6.28); pts = [p0]
    for k in range(rc.randint(7, 18)):
        a += rc.uniform(-0.7, 0.7); q = (pts[-1][0] + 46 * math.cos(a), pts[-1][1] + 46 * math.sin(a))
        if not gl.contains(Point(q)): break
        pts.append(q)
    if len(pts) >= 4:
        W.add_water(LineString(spl(pts, 12)).buffer(rc.uniform(2.6, 5.5)).difference(road_union), 'marsh_open', 'slough channel', depth=0.9); nsl += 1
W.extra['routes'] = dict(airboat=[[list(map(round, p)) for p in spl(t, 40)] for t in AIRBOAT])
W.extra['wildlife'] = dict(gator_holes=holes, hammocks=hammocks)

# ---------------------------------------------------------------- buildings by district
def fill(key, zones, specials=None, ctx=None):
    if key not in DIST: return 0
    try:
        c = dict(region=key, pick_poi=G.poi_picker(G.KEYS_RETAIL if 'Key' in key or key in ('Shellmound',) else G.RETAIL, key))
        c.update(ctx or {})
        return G.fill_district(W, DIST[key][0].buffer(30), zones, c, seed=key, specials=specials)
    except Exception:
        W.log.append(f'fill {key}: ' + traceback.format_exc()[-300:]); return 0
civic = lambda town: [('school', {'name': f'{town} Elementary School'}), ('church', {'name': f'{town} Community Church'}), ('fire_station', {'name': f'{town} Fire Station'}),
                      ('park', {'name': f'{town} Park'}), ('gas', None), ('post_office', {'name': f'{town} Post Office'})]
keysctx = dict(palette=G.KEYS, tin=True, style='stilt')
stats = {}
# highways first (commercial frontage), then districts
for r in list(W.roads):
    if r.kind in ('trunk', 'primary', 'secondary') and not r.bridge and not r.tags.get('join') and plen(r.pts) > 60 and not (r.y and max(r.y) > 0.5):
        nm = r.name
        z = {'Overseas Highway': 'keys', 'Federal Highway': 'strip', 'Ocean Drive North': 'strip_small', 'West Line Avenue': 'strip_small', 'Faro Causeway': None,
             'Tamiami Trail': 'rural_strip', 'Citrus Belt Highway': 'rural_strip', 'Sound Road': 'rural_strip', 'Corkwood Road': None, 'Cape Cormorant Road': None}.get(nm)
        if not z: continue
        mid = r.pts[len(r.pts) // 2]
        if nm == 'Overseas Highway' and mid[1] < 3850: z = 'rural_strip'
        if not land.contains(Point(mid)): continue
        ctx = dict(region=nm, pick_poi=G.poi_picker(G.KEYS_RETAIL if z == 'keys' else G.RETAIL, nm), **(keysctx if z == 'keys' else {}))
        for side in (1, -1):
            try: stats[nm] = stats.get(nm, 0) + G.walk(W, r, side, z, ctx, seed=(nm, r.id), fill=0.9 if z != 'rural_strip' else 0.35)
            except Exception: W.log.append('walk ' + traceback.format_exc()[-200:])
stats['North Shore'] = fill('North Shore', {'residential': 'house', 'tertiary': 'strip_small'}, civic('North Shore') + [('police', {'name': 'North Shore Police Substation'}), ('library', {'name': 'North Shore Library'})])
stats['South Shore'] = fill('South Shore', {'residential': 'house', 'tertiary': 'strip_small'}, civic('South Shore') + [('clinic', None)], dict(pool=0.3))
stats['West End'] = fill('West End', {'residential': 'house_small', 'tertiary': 'apartment'}, [('church', {'name': 'West End Chapel'}), ('laundromat', None), ('park', {'name': 'Domino Park West'})])
stats['Allapattah West'] = fill('Allapattah West', {'residential': 'warehouse', 'tertiary': 'warehouse'}, [('auto_repair', None), ('storage', None)])
stats['Airport District'] = fill('Airport District', {'residential': 'warehouse', 'tertiary': 'warehouse'}, [('motel', {'name': 'Runway Inn'}), ('gas', None), ('fast_food', None)])
stats['Port Cassia'] = fill('Port Cassia', {'residential': 'house_small', 'tertiary': 'shopfront'}, civic('Port Cassia') + [('library', {'name': 'Port Cassia Library'}), ('motel', {'name': 'Lighthouse Motor Court'}), ('seafood_market', None), ('bait_shop', None)],
                            dict(pick_poi=G.poi_picker(G.MAIN_RETAIL, 'cassia')))
stats['Playa Serena'] = fill('Playa Serena', {'residential': 'apartment', 'tertiary': 'strip_small'}, [('fire_station', {'name': 'Playa Serena Fire Station'}), ('park', {'name': 'Serena Dunes Park'}), ('motel', {'name': 'Seafoam Motel'})])
stats['Key Paloma'] = fill('Key Paloma', {'residential': 'stilt', 'tertiary': 'stilt'}, [('school', {'name': 'Key Paloma School'}), ('church', {'name': 'Key Paloma Chapel by the Sea'}), ('fire_station', {'name': 'Key Paloma Volunteer Fire'}),
                           ('park', {'name': 'Paloma Community Park'}), ('rv_park', {'name': 'Paloma Palms RV Resort'}), ('post_office', {'name': 'Key Paloma Post Office'}), ('dive_shop', None), ('bait_shop', None), ('tiki_bar', None)], keysctx)
stats['Tern Key'] = fill('Tern Key', {'residential': 'shopfront', 'tertiary': 'shopfront'}, [('church', {'name': 'Tern Key Mariners Church'}), ('police', {'name': 'Tern Key Sheriff Substation'}), ('motel', {'name': 'Mile Zero Motel'}), ('gas', None)],
                          dict(palette=G.KEYS, style='deco', pick_poi=G.poi_picker(G.KEYS_RETAIL + G.MAIN_RETAIL, 'tern')))
stats['Faro Key'] = fill('Faro Key', {'residential': 'house_big', 'tertiary': 'apartment'}, [('church', {'name': 'Faro Key Chapel'}), ('park', {'name': 'Faro Village Green'}), ('strip_mall', None), ('gas', None)], dict(pool=0.6, two_story=0.5))
stats['Shellmound'] = fill('Shellmound', {'residential': 'stilt', 'tertiary': 'stilt'}, [('bait_shop', None), ('seafood_market', None), ('tiki_bar', None)], keysctx)
stats['Amaro Landing'] = fill('Amaro Landing', {'residential': 'mobile', 'tertiary': 'house_small'}, [('bait_shop', None), ('gas', None), ('church', {'name': 'Amaro Landing Baptist Church'}), ('rv_park', {'name': 'Bass Haven Fish Camp'})])
stats['Punta Marisol'] = fill('Punta Marisol', {'residential': 'house_small', 'tertiary': 'shopfront'}, [('gas', None), ('church', {'name': 'Punta Marisol Chapel'}), ('bait_shop', None), ('seafood_market', None), ('motel', {'name': 'Gulf Breeze Motel'}), ('park', {'name': 'Marisol Green'})], dict(palette=G.KEYS, pick_poi=G.poi_picker(G.MAIN_RETAIL + G.KEYS_RETAIL, 'marisol')))
stats['Port Calabash'] = fill('Port Calabash', {'residential': 'house_small', 'tertiary': 'shopfront'}, [('gas', None), ('bait_shop', None), ('motel', {'name': 'Calabash Motor Lodge'}), ('park', {'name': 'Calabash Landing Park'})], dict(pick_poi=G.poi_picker(G.MAIN_RETAIL, 'calabash')))
stats['Tamarind Key'] = fill('Tamarind Key', {'residential': 'stilt', 'tertiary': 'stilt'}, [('dive_shop', None), ('tiki_bar', None), ('motel', {'name': 'Tamarind Reef Lodge'})], keysctx)
stats['Citrus Flats'] = fill('Citrus Flats', {'tertiary': 'rural_strip', 'track': None}, [('nursery', None), ('farm_stand', None), ('church', {'name': 'Citrus Flats Church of the Groves'})])
# one-off rural / coastal sites
def near_road(name):
    return [r for r in W.roads if r.name == name and not r.bridge and plen(r.pts) > 80]
def put(roadname, tpl, x, z, ctx=None):
    best = None
    for r in near_road(roadname):
        d = LineString(r.pts).distance(Point(x, z))
        if best is None or d < best[0]: best = (d, r)
    if not best: W.log.append(f'put {tpl}: no road {roadname}'); return False
    r = best[1]; s = LineString(r.pts).project(Point(x, z))
    c = dict(region=roadname, pick_poi=G.poi_picker(G.KEYS_RETAIL, tpl + roadname)); c.update(ctx or {})
    for side in (1, -1):
        try:
            if G.place_site(W, r, side, s, tpl, c, seed=(tpl, x, z)): return True
        except Exception: W.log.append('put ' + traceback.format_exc()[-200:])
    W.log.append(f'put {tpl} at {x},{z} failed'); return False
put('Cape Cormorant Road', 'community_center', -3050, 3550, {'name': 'Everglades Ranger Station'})
put('Cape Cormorant Road', 'bait_shop', -4800, 4230, {'name': 'Cape Cormorant Marina Store'})
put('Cape Cormorant Road', 'rv_park', -4700, 4240, {'name': 'Cape Cormorant Campground'})
put('Corkwood Road', 'bait_shop', -5600, 2700, {'name': 'Gator Hook Fish Camp'})
put('Tamiami Trail', 'tiki_bar', -4520, 1400, {'name': 'Sawgrass Airboat Dock'})
put('Tamiami Trail', 'gift_shop', -5300, 1440, None)
put('Lake Amaro Shore Road', 'bait_shop', lc[0] + lr + 75, lc[1], {'name': 'East Shore Fish Camp'})
put('Ridge Road', 'community_center', -2400, -4330, {'name': 'Sawpalm Ridge Ranger Station'})
put('Ridge Road', 'rv_park', -3150, -4580, {'name': 'Ridge Campground'})
put('Citrus Belt Highway', 'storage', -4600, -2350, {'name': 'Citrus Flats Packing House'})
for nm, pts in (('Summit Trail', [(-3300, -5850), (-3350, -5930), (-3400, -6000)]), ('Spring Run Trail', [(-3050, -5700), (-3500, -5450), (-3900, -5300), (-4250, -5050)]),
                ('Ridge Crest Trail', [(-3400, -6000), (-2900, -6250), (-2400, -6500), (-1900, -6750)]), ('Sound Bluff Trail', [(-2400, -6500), (-2500, -7000), (-2600, -7500)])):
    W.path(spl(pts, 12), 'trail', 1.6, 'dirt', name=nm)
for x, z, t, n in ((-3400, -6000, 'viewpoint', 'Sawpalm Summit Overlook'), (-2600, -7500, 'viewpoint', 'Sound Bluff Overlook'), (-3900, -5270, 'swimming_area', 'Sawpalm Spring'),
                   (2760, -4640, 'lighthouse', 'Cassia Light'), (2180, 4330, 'lighthouse', 'Faro Light'), (lc[0] - lr - 40, lc[1], 'slipway', 'Lake Amaro West Ramp'), (lc[0], lc[1] + lr * 0.94 + 30, 'slipway', 'Amaro Landing Ramp'),
                   (1880, -4380, 'marina', 'Port Cassia Marina'), (-415, 5465, 'marina', 'Key Paloma Marina'), (-4090, 6390, 'marina', 'Tern Harbor Marina'), (-5020, 4260, 'marina', 'Cape Cormorant Marina'),
                   (-4520, 1440, 'boat_rental', 'Sawgrass Airboat Tours'), (560, 4760, 'slipway', 'Paloma Boat Ramp'), (-6500, 2200, 'slipway', 'Shellmound Landing')):
    W.poi(x, z, t, n)
# marinas: docks
for (x, z, ang, n) in ((1870, -4330, -1.3, 6), (-420, 5460, -2.356, 6), (-4090, 6412, 1.57, 7), (-5040, 4290, 1.2, 4), (2600, 3900, 0.0, 4)):
    for i in range(n):
        c, s = math.cos(ang), math.sin(ang)
        a = (x - s * i * 11, z + c * i * 11); b = (a[0] + c * 38, a[1] + s * 38)
        W.path([a, b], 'dock', 2.2, 'wood')
W.path(spl([(-700, 6030), (-880, 6110), (-1050, 6180)], 12), 'pier', 6.0, 'concrete', name='Old Mariner Bridge fishing pier (east)')
W.path(spl([(-1880, 6480), (-1700, 6430), (-1540, 6370)], 12), 'pier', 6.0, 'concrete', name='Old Mariner Bridge fishing pier (west)')
G.power_line(W, US1S.pts if False else spl([(-3790, 2715), (-3880, 2950), (-3650, 3180), (-1800, 3350), (250, 3760), (440, 4230), (700, 4650), (84, 5256), (-660, 6000)], 20), 'Overseas feeder', offset=11)
G.power_line(W, spl([(-3800, 1366), (-4500, 1400), (-5500, 1450), (-6120, 1500)], 20), 'Tamiami feeder', offset=10)
G.power_line(W, spl([(-3800, -1810), (-4400, -2100), (-4900, -2700), (-4700, -3300)], 20), 'Citrus Flats feeder', offset=10)
try:
    stats['signals'], stats['stops'] = G.street_furniture(W)
    stats['lamps'] = G.lamps_along(W, [r for r in W.roads if r.kind in ('trunk', 'primary', 'secondary', 'tertiary') or r.region in ('North Shore', 'South Shore', 'Port Cassia', 'Key Paloma', 'Tern Key', 'Playa Serena')])
except Exception: W.log.append('furn ' + traceback.format_exc()[-300:])
# trees
for key, n, types in (('Sawpalm Ridge State Park', 500, ['pine', 'oak', 'pine', 'palm']), ('Everglades', 260, ['cypress', 'mangrove', 'palm']), ('Central Wetlands', 150, ['cypress', 'palm']),
                      ('Key Paloma', 160, ['coconut', 'palm', 'seagrape', 'gumbo']), ('Tern Key', 110, ['coconut', 'palm', 'banyan']), ('Faro Key', 120, ['coconut', 'seagrape', 'palm']),
                      ('Citrus Flats', 200, ['citrus', 'oak', 'palm']), ('Lake Amaro', 60, ['cypress', 'oak'])):
    G.scatter_trees(W, REG[key].intersection(land).difference(inland), n, types, key)
# second pass: site driveways join the graph
RN.planarize(W); RN.elevate(W)
W.count['r'] = 0
W.roads = [r for r in W.raw_roads if len(r.pts) >= 2]
comps = RN.connectivity(W.roads); main = set(comps[0])
W.roads = [r for i, r in enumerate(W.roads) if i in main]
for r in W.roads: r.id = W.nid('r')
_rt = [LineString(r.pts).buffer(r.width / 2 + 0.3) for r in W.roads if not (r.bridge and r.layer > 0)]
from shapely import STRtree as _ST
_t = _ST(_rt)
_bad = {b['id'] for b in W.buildings if len(_t.query(Polygon(b['ring']), predicate='intersects'))}
W.buildings = [b for b in W.buildings if b['id'] not in _bad]
W.pois = [p for p in W.pois if p.get('building') not in _bad]
print(f'content done {time.time()-T0:.1f}s buildings {len(W.buildings)} roads {len(W.roads)}')

# ---------------------------------------------------------------- heights (16 m grid)
CELLH = 16
hx0, hz0 = BOUNDS['minX'], BOUNDS['minZ']
hnx, hnz = int((BOUNDS['maxX'] - hx0) / CELLH), int((BOUNDS['maxZ'] - hz0) / CELLH)
XX, ZZ = np.meshgrid(hx0 + (np.arange(hnx) + 0.5) * CELLH, hz0 + (np.arange(hnz) + 0.5) * CELLH)
H = np.zeros((hnz, hnx), np.float32)
ridge = [(x, z, h) for x, z, h in D.RIDGE]
for (x0, z0, h0), (x1, z1, h1) in zip(ridge, ridge[1:]):
    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        cx, cz, hh = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, h0 + (h1 - h0) * t
        H = np.maximum(H, hh * np.exp(-(((XX - cx) / 620.0) ** 2 + ((ZZ - cz) / 620.0) ** 2) ** 0.8))
from wl.util import fbm
H *= np.clip(0.8 + 0.45 * fbm((hnz, hnx), 520, 'hills', octaves=4, cell=CELLH, ridged=True), 0.45, 1.25)
H *= 260.0 / max(1.0, float(H.max()))
from wl.util import raster_polys
from scipy import ndimage
lm = raster_polys(land, (hnz, hnx), cell=CELLH) > 0
H *= np.clip(ndimage.distance_transform_edt(lm) * CELLH / 250.0, 0, 1)
wm = raster_polys(inland, (hnz, hnx), cell=CELLH) > 0
H *= np.clip(ndimage.distance_transform_edt(~wm) * CELLH / 120.0, 0, 1)
H[(XX > RX0) & (XX < RX1) & (ZZ > RZ0) & (ZZ < RZ1)] = 0
# bench the hill roads into the terrain so they stay under 8 % grade
Rh = np.full(H.shape, np.nan, np.float32)
for r in W.roads:
    if r.bridge or r.kind in ('track',): continue
    pts = resample(r.pts, 8.0)
    ij = [(min(hnz - 1, max(0, int((z - hz0) / CELLH))), min(hnx - 1, max(0, int((x - hx0) / CELLH)))) for x, z in pts]
    hs = [float(H[i, j]) for i, j in ij]
    if max(hs) < 0.5: continue
    for _ in range(2):
        for k in range(1, len(hs)): hs[k] = min(hs[k], hs[k - 1] + 0.06 * 8.0)
        for k in range(len(hs) - 2, -1, -1): hs[k] = min(hs[k], hs[k + 1] + 0.06 * 8.0)
    for (i, j), v in zip(ij, hs): Rh[i, j] = v if np.isnan(Rh[i, j]) else min(Rh[i, j], v)
if np.isfinite(Rh).any():
    for _ in range(3):
        dist, (ii, jj) = ndimage.distance_transform_edt(np.isnan(Rh), return_indices=True)
        wgt = np.clip(1.0 - (dist - 1.0) / 5.0, 0.0, 1.0)
        H = H * (1 - wgt) + np.nan_to_num(Rh[ii, jj]) * wgt
        for r in W.roads:
            if r.bridge or r.kind == 'track': continue
            pts = resample(r.pts, 8.0)
            ij = [(min(hnz - 1, max(0, int((z - hz0) / CELLH))), min(hnx - 1, max(0, int((x - hx0) / CELLH)))) for x, z in pts]
            if not np.isfinite(Rh[ij[0][0], ij[0][1]]) and not np.isfinite(Rh[ij[-1][0], ij[-1][1]]): continue
            hs = [float(H[i, j]) for i, j in ij]
            for k in range(1, len(hs)): hs[k] = min(hs[k], hs[k - 1] + 0.055 * 8.0)
            for k in range(len(hs) - 2, -1, -1): hs[k] = min(hs[k], hs[k + 1] + 0.055 * 8.0)
            for (i, j), v in zip(ij, hs): Rh[i, j] = v
os.makedirs(OUT, exist_ok=True)
(H / 0.1).round().astype('<i2').tofile(os.path.join(OUT, 'heights.bin'))

# ---------------------------------------------------------------- export
def ring(c): return [[round(x, 2), round(z, 2)] for x, z in list(c)[:-1]]
def polyd(p, **kw):
    d = dict(kw); d['outer'] = ring(p.exterior.coords); d['holes'] = [ring(h.coords) for h in p.interiors]; return d
clip = realbox.buffer(-30)
land_out = []
for g in (land.geoms if hasattr(land, 'geoms') else [land]):
    q = g.difference(clip)
    for p in (q.geoms if hasattr(q, 'geoms') else [q]):
        if p.geom_type == 'Polygon' and p.area > 60: land_out.append(polyd(p.simplify(0.4), id=f'l{len(land_out)+1}'))
feat = dict(version=2, generator='tools/world/build.py', bounds=BOUNDS, realRect=REAL, land=land_out,
            water=[polyd(w['poly'].simplify(0.4), id=w['id'], kind=w['kind'], **({'name': w['name']} if w['name'] else {}), depth=w['depth']) for w in W.water if w['poly'].geom_type == 'Polygon'],
            areas=[polyd(a['poly'].simplify(0.5), id=a['id'], kind=a['kind'], **({'name': a['name']} if a['name'] else {})) for a in W.areas if a['poly'].geom_type == 'Polygon' and a['poly'].area > 10],
            roads=[], paths=W.paths, buildings=W.buildings, pois=W.pois, props=W.props, trees=W.trees, places=[], joins=[], setpieces=W.setpieces, powerlines=W.powerlines,
            heights=dict(file='heights.bin', cell=CELLH, minX=hx0, minZ=hz0, nx=hnx, nz=hnz, unit=0.1))
for r in W.roads:
    d = dict(id=r.id, pts=[list(p) for p in r.pts], kind=r.kind, lanesFwd=r.lf, lanesBack=r.lb, oneway=r.oneway, speedKmh=r.speed, name=r.name, bridge=bool(r.bridge), width=round(r.width, 1), surface=r.surface, layer=r.layer)
    if r.ref: d['ref'] = r.ref
    if r.y: d['y'] = r.y
    feat['roads'].append(d)
    j = r.tags.get('join')
    if j and (tuple(r.pts[0]) == r2((j['x'], j['z'])) or tuple(r.pts[-1]) == r2((j['x'], j['z']))):
        feat['joins'].append(dict(x=j['x'], z=j['z'], roadId=r.id, osm=j['osm'], osmWay=j['osmWay']))
PLACES = [('Solana International Airport', 'airport', -5000, -350, 900), ('Limpkin Marsh', 'region', -5000, 1700, 900), ('Everglades', 'region', -2600, 4000, 1500), ('Key Paloma', 'key', 250, 5500, 1000),
          ('Sapodilla Key', 'key', -1150, 6560, 120), ('Tamarind Key', 'key', -1950, 6660, 300), ('Key Anhinga', 'key', -2960, 6420, 140), ('Tern Key', 'key', -3950, 6500, 700),
          ('Tern Key Airfield', 'airport', -4650, 5800, 400), ('Corkwood Swamp', 'region', -4700, -2000, 700), ('Port Calabash', 'town', -5750, -3850, 300), ('Faro Key', 'island', 2060, 3780, 560), ('Virginia Key', 'island', 1600, 2850, 300), ('North Shore', 'district', -2800, -2950, 700), ('South Shore', 'district', -2400, 3100, 900),
          ('West End', 'district', -3900, 1600, 500), ('Lake Amaro', 'lake', lc[0], lc[1], lr), ('Amaro Landing', 'town', -1450, -3260, 250), ('Citrus Flats', 'region', -4600, -2700, 1300), ('Sawpalm Ridge State Park', 'park', -3300, -6350, 1500),
          ('Port Cassia', 'town', 2100, -4750, 600), ('Playa Serena', 'beach', 3100, -3400, 700), ('Cassia Inlet', 'region', 2600, -4370, 250), ('Sawpalm Sound', 'region', 450, -6500, 400), ('Calabash Bay', 'region', -5800, -2800, 400),
          ('Cape Cormorant', 'region', -5200, 4150, 350), ('Punta Marisol', 'town', -6500, 1300, 230), ('Osprey Island', 'island', -6150, -4750, 300), ('Sawfish Bay', 'region', -4400, 3500, 550), ('Shellmound', 'town', -6560, 2150, 130), ('Pelican Point', 'district', 236, 4766, 60), ('Mariner Channel Bridge', 'region', -1500, 6150, 400),
          ('Bight of Rains', 'region', -2400, 5600, 700), ('Pine Sound', 'region', -6500, -600, 600)]
feat['places'] = [dict(name=n, kind=k, x=x, z=z, r=r) for n, k, x, z, r in PLACES]
with open(os.path.join(OUT, 'features.json'), 'w') as f: json.dump(feat, f, separators=(',', ':'))
reef = [[round(x), round(z)] for x, z in spl(D.REEF_LINE, 120)]
ur = rng('uw')
under = dict(reef_line=reef, reefs=[dict(x=p[0] + ur.randint(-60, 60), z=p[1] + ur.randint(-60, 60), r=ur.randint(40, 110), depth=round(ur.uniform(1.5, 6), 1), kind=ur.choice(['spur_and_groove', 'patch_reef', 'brain_coral_heads', 'elkhorn_stand'])) for p in reef[1:-1]],
             caves=[dict(x=2700, z=4700, depth=14, name='Faro Ledge Caves'), dict(x=-1000, z=7900, depth=18, name='Mariner Blue Hole'), dict(x=-4700, z=8230, depth=12, name='Tern Wall Grotto')],
             wrecks=[dict(x=3150, z=3900, depth=22, name='tug wreck'), dict(x=850, z=6950, depth=16, name='shrimp trawler wreck'), dict(x=-3000, z=8190, depth=24, name='freighter wreck'), dict(x=-6700, z=-2900, depth=9, name='sunken barge')],
             seagrass=[dict(x=-1500, z=5800, r=700), dict(x=600, z=3000, r=350), dict(x=-3300, z=6200, r=600), dict(x=1300, z=-3100, r=300), dict(x=-6500, z=500, r=250)],
             channels=[dict(name=n, pts=[[round(x), round(z)] for x, z in pts], width=w, depth=dp) for n, pts, w, dp in D.CHANNELS])
layout = dict(version=2, bounds=BOUNDS, realRect=REAL, places=feat['places'], setpieces=W.setpieces, regions={k: ring(v.simplify(8).exterior.coords) for k, v in REG.items() if v.geom_type == 'Polygon'},
              airport=W.extra.get('airport'), airfield=W.extra.get('airfield'), routes=W.extra.get('routes'), wildlife=W.extra.get('wildlife'), underwater=under,
              heights=feat['heights'], peak=dict(x=-3400, z=-6000, y=round(float(H.max()), 1)),
              highways=[dict(name=n, ref=r) for n, r in (('Interstate 95', 'I-95'), ('Cypress Belt Parkway', 'SR 836'), ('Overseas Highway', 'US-1'), ('Federal Highway', 'US-1'), ('Tamiami Trail', 'US-41'), ('Citrus Belt Highway', 'US-27'), ('Corkwood Road', 'SR 49'), ('Cape Cormorant Road', 'SR 27'), ('Pelican Causeway', 'SR 922'), ('Faro Causeway', 'SR 913'), ('Ocean Drive North', 'SR A1A'))])
os.makedirs(os.path.join(ROOT, 'public', 'assets', 'world'), exist_ok=True)
with open(os.path.join(ROOT, 'public', 'assets', 'world', 'layout.json'), 'w') as f: json.dump(layout, f, separators=(',', ':'))
km = sum(plen(r.pts) for r in W.roads) / 1000
from collections import Counter
summary = dict(road_km=round(km, 1), roads=len(W.roads), bridges=sum(1 for r in W.roads if r.bridge), buildings=len(W.buildings), pois=len(W.pois), poi_types=len(set(p['type'] for p in W.pois)),
               top_pois=Counter(p['type'] for p in W.pois).most_common(25), props=len(W.props), trees=len(W.trees), land_polys=len(land_out), water=len(W.water), areas=len(W.areas), joins=len(feat['joins']),
               joins_expected=njoin, stats=stats, peak=float(H.max()), log=W.log[:40], seconds=round(time.time() - T0, 1))
with open(os.path.join(OUT, 'summary.json'), 'w') as f: json.dump(summary, f, indent=1)
print(json.dumps({k: v for k, v in summary.items() if k not in ('top_pois',)})[:1800])
