#!/usr/bin/env python3
# Airport layout designer (airports agent, Nov 19). Writes src/world/airport/airports.json: the ONE source of truth for
# both airports (runways, taxiways, aprons, stands, terminal, tower, hangars, fence / airside polygon, landside pocket).
# The map build (tools/v2/map3/build_v3.py, "airport exclusions") reads the airside polygons from that JSON and drops every
# ordinary road, lot, tree and prop inside them; the game (src/world/airport/*) draws the airfield from it.
#   tools/world/.venv/bin/python tools/v2/airport/design.py [--plot out.png]
# Frames: a runway frame is (origin A, unit u along the runway A->B, unit n to its LEFT when looking along u in plan view
# with +x east / +z south: n = (u.z, -u.x)). P(s, q) = A + s u + q n.
import json, math, os, sys
from shapely.geometry import Polygon, LineString, Point, MultiPolygon
from shapely.ops import unary_union

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
FEAT = os.path.join(ROOT, 'tools/v2/map3/out/world/features.json')
OUT = os.path.join(ROOT, 'src/world/airport/airports.json')

class Frame:
    def __init__(s, a, b):
        s.a = a; dx, dz = b[0] - a[0], b[1] - a[1]; s.L = math.hypot(dx, dz); s.u = (dx / s.L, dz / s.L); s.n = (s.u[1], -s.u[0])
        s.h = math.atan2(s.u[0], s.u[1])   # heading of +u (game: heading 0 faces +z, dir (sin h, cos h))
    def P(s, S, q): return [round(s.a[0] + S * s.u[0] + q * s.n[0], 2), round(s.a[1] + S * s.u[1] + q * s.n[1], 2)]
    def rect(s, s0, s1, q0, q1): return [s.P(s0, q0), s.P(s1, q0), s.P(s1, q1), s.P(s0, q1)]
    def sq(s, x, z): rx, rz = x - s.a[0], z - s.a[1]; return rx * s.u[0] + rz * s.u[1], rx * s.n[0] + rz * s.n[1]

def heading_of(dx, dz): return round(math.atan2(dx, dz), 4)
def rw_ids(F):
    out = []
    for d in (F.u, (-F.u[0], -F.u[1])):     # landing direction: along d; compass bearing (0 = north = -z, clockwise)
        brg = math.degrees(math.atan2(d[0], -d[1])) % 360; n = round(brg / 10) % 36 or 36; out.append('%02d' % n)
    return out

feat = json.load(open(FEAT))
# the map build drops the airside roads (build_v3.py 9d) and keeps them in airport_dropped.json: put them back so the gates
# and the dropped list are computed against the full network
_DR = os.path.join(os.path.dirname(FEAT), 'airport_dropped.json')
if os.path.exists(_DR):
    _ids = {r['id'] for r in feat['roads']}; feat['roads'] += [r for r in json.load(open(_DR)) if r['id'] not in _ids]
roads = {r['id']: r for r in feat['roads']}
land = unary_union([Polygon(l['outer']).buffer(0) for l in feat['land'] if len(l['outer']) > 2])
def rline(i): return LineString(roads[i]['pts'])

airports = []
# ============================================================== Miami International (MIA)
R1 = Frame((-2057, 528), (-792, 572)); R2 = Frame((-2002, 924), (-825, 1683))
mia = dict(id='mia', name='Miami International', code='SLI', kind='international')
mia['runways'] = [dict(id='/'.join(rw_ids(R1)), ends=rw_ids(R1), a=R1.P(0, 0), b=R1.P(R1.L, 0), w=45, use='ga'),
                  dict(id='/'.join(rw_ids(R2)), ends=rw_ids(R2), a=R2.P(0, 0), b=R2.P(R2.L, 0), w=45, use='airline')]
# taxiways: parallel 'A' along R2 (NE side, q = +165), 'B' along R1 (south side, q = -170), link 'L' between them west of
# the terminal, rapid exits / end connectors, apron lead lines
TA, TB = 165, -170
mia['taxiways'] = [
    dict(id='A', w=23, pts=[R2.P(-20, TA - 0), R2.P(1250, TA)]),
    dict(id='A1', w=23, pts=[R2.P(0, TA), R2.P(0, 0)]), dict(id='A6', w=23, pts=[R2.P(1250, TA), R2.P(1335, 70), R2.P(1385, 0)]),
    dict(id='A3', w=23, pts=[R2.P(560, TA), R2.P(430, 0)]), dict(id='A4', w=23, pts=[R2.P(980, TA), R2.P(850, 0)]),
    dict(id='A2', w=23, pts=[R2.P(300, TA), R2.P(300, 0)]), dict(id='A5', w=23, pts=[R2.P(1130, TA), R2.P(1130, 0)]),
    dict(id='B', w=23, pts=[R1.P(-10, TB), R1.P(R1.L + 10, TB)]),
    dict(id='B1', w=23, pts=[R1.P(0, TB), R1.P(0, 0)]), dict(id='B4', w=23, pts=[R1.P(R1.L, TB), R1.P(R1.L, 0)]),
    dict(id='B2', w=23, pts=[R1.P(420, TB), R1.P(420, 0)]), dict(id='B3', w=23, pts=[R1.P(860, TB), R1.P(860, 0)]),
    dict(id='L', w=23, pts=[R1.P(110, TB), R2.P(60, TA + 70), R2.P(60, TA)]),
]
# terminal: parallel to R2, gates on its SW face (q = 300), landside curb on the NE face (q = 345)
T_S0, T_S1, T_Q0, T_Q1 = 600, 900, 300, 354
term_fp = R2.rect(T_S0, T_S1, T_Q0, T_Q1)
tc = R2.P((T_S0 + T_S1) / 2, (T_Q0 + T_Q1) / 2)
mia['terminal'] = dict(x=tc[0], z=tc[1], heading=round(math.atan2(-R2.n[0], -R2.n[1]), 4),   # +local z = toward the apron (airside)
                       len=T_S1 - T_S0, depth=T_Q1 - T_Q0, h=17, ring=term_fp, name='Miami International Terminal')
stands = []
for i, s in enumerate([618, 668, 832, 882]):   # two wings either side of the central check-in hall (s 710..790)
    # nose-in: nose tip 20.5 m off the wall; the 25.5 m jet bridge (center 13.3 m off the wall, 4.3 m to the aircraft's left)
    # meets the forward left door (the old hand-fitted MIA gate geometry, bldmodels r2-art QA 3)
    nose = R2.P(s, T_Q0 - 20.5); jb = R2.P(s - 4.3, T_Q0 - 13.3)
    stands.append(dict(id='G%d' % (i + 1), kind='gate', x=nose[0], z=nose[1], heading=round(math.atan2(R2.n[0], R2.n[1]), 4), s=s, bridge=1,
                       jb=dict(x=jb[0], z=jb[1], heading=round(math.atan2(-R2.n[0], -R2.n[1]), 4)), door=R2.P(s - 4.3, T_Q0 - 0.3)))
for i, s in enumerate([330, 400, 470]):  # remote stands west of the terminal (turboprops / overflow)
    nose = R2.P(s, T_Q0 - 22); stands.append(dict(id='R%d' % (i + 1), kind='remote', x=nose[0], z=nose[1], heading=round(math.atan2(R2.n[0], R2.n[1]), 4), s=s))
mia['stands'] = stands
mia['taxilane'] = [R2.P(285, 215), R2.P(955, 215)]
mia['aprons'] = [dict(id='T', kind='terminal', poly=R2.rect(280, 960, TA + 12, T_Q0)),
                 dict(id='GA', kind='ga', poly=R1.rect(300, 790, TB - 12, TB - 100))]
# GA stands (flyable small planes spawn here, game.air) and hangars along the GA apron's south edge
mia['gaStands'] = [dict(x=p[0], z=p[1], heading=round(math.atan2(R1.n[0], R1.n[1]), 4)) for p in [R1.P(s, TB - 60) for s in (360, 400, 440, 490, 560, 620)]]
mia['hangars'] = [dict(model='hangar_long', x=R1.P(395, TB - 128)[0], z=R1.P(395, TB - 128)[1], heading=round(R1.h, 4)),   # 137 m long block: its length along the runway
                  dict(model='hangar_arch', x=R1.P(540, TB - 135)[0], z=R1.P(540, TB - 135)[1], heading=round(math.atan2(R1.n[0], R1.n[1]), 4)),
                  dict(model='hangar_arch', x=R1.P(640, TB - 135)[0], z=R1.P(640, TB - 135)[1], heading=round(math.atan2(R1.n[0], R1.n[1]), 4)),
                  dict(model='hangar_quonset', x=R1.P(750, TB - 128)[0], z=R1.P(750, TB - 128)[1], heading=round(math.atan2(R1.n[0], R1.n[1]), 4))]
twr = R2.P(960, 330)
mia['forecourt'] = R2.rect(T_S0 - 25, T_S1 + 25, T_Q1, T_Q1 + 50)   # landside curb: drop-off lanes, sidewalk (the access road ends at its edge)
mia['tower'] = dict(model='control_tower', x=twr[0], z=twr[1], heading=round(R2.h + math.pi, 4))
mia['windsocks'] = [R2.P(260, -70), R2.P(1150, -70), R1.P(250, 75), R1.P(1000, 75)]
# landside pocket: terminal curb + the access roads from the city (east) to the terminal; never airside
LS_ROADS = ['r5762', 'r5756', 'r5761', 'r5842', 'r5863', 'r5835', 'r5817']
curb = Polygon(R2.rect(T_S0 - 30, T_S1 + 30, T_Q1 - 0.5, T_Q1 + 50))
hull = unary_union([rline(i) for i in LS_ROADS] + [LineString([R2.P(T_S0 - 30, T_Q1 + 50), R2.P(T_S1 + 30, T_Q1 + 50)])]).convex_hull
pocket = unary_union([hull.buffer(22), curb, Polygon(term_fp).buffer(0.01)])
# airside: the old airfield outline + runway strips + taxiways, minus the kept outer roads (+ room) and the landside pocket
S = 11.0
p2w = lambda px, py: ((px - 700) * S, (py - 800) * S)
AF = Polygon([p2w(*p) for p in [(503, 838), (634, 838), (634, 868), (600, 880), (632, 958), (612, 966), (505, 892)]]).buffer(0)
strips = unary_union([LineString([R1.P(-60, 0), R1.P(R1.L + 60, 0)]).buffer(95, cap_style=2), LineString([R2.P(-60, 0), R2.P(R2.L + 60, 0)]).buffer(110, cap_style=2),
                      LineString([R2.P(-40, TA), R2.P(1270, TA)]).buffer(40, cap_style=2)])
KEEP = ['r5507', 'r5618', 'r5533', 'r5537', 'r5593', 'r5589', 'r5590', 'r5605', 'r5538', 'r6102', 'r6093', 'r6090', 'r6105', 'r6069', 'r6050', 'r6047', 'r5993', 'r6051', 'r6052', 'r5747', 'r5746', 'r5742']
keep_buf = unary_union([rline(i).buffer(roads[i]['width'] / 2 + 14) for i in KEEP if i in roads])
air = AF.union(strips).difference(keep_buf).difference(pocket).intersection(land.buffer(-6))
air = max(list(air.geoms) if hasattr(air, 'geoms') else [air], key=lambda g: g.area).simplify(2.0)
mia['airside'] = [[round(x, 1), round(z, 1)] for x, z in list(air.exterior.coords)[:-1]]
mia['landside'] = [[round(x, 1), round(z, 1)] for x, z in list(pocket.simplify(2).exterior.coords)[:-1]]
mia['fenceGates'] = []   # filled below (vehicle gates where service roads meet the line)
airports.append([mia, air, pocket, keep_buf])

# ============================================================== Key West International (EYW)
K4 = Frame((-4818, 5522), (-4587, 6468)); K3 = Frame((-5225, 6446), (-4631, 5698)); K3 = Frame(K3.a, K3.P(K3.L - 45, 0))   # NE end pulled back off the loop road
eyw = dict(id='eyw', name='Key West International', code='SKW', kind='regional')
eyw['runways'] = [dict(id='/'.join(rw_ids(K4)), ends=rw_ids(K4), a=K4.P(0, 0), b=K4.P(K4.L, 0), w=30, use='airline'),
                  dict(id='/'.join(rw_ids(K3)), ends=rw_ids(K3), a=K3.P(0, 0), b=K3.P(K3.L, 0), w=30, use='ga')]
# K4.n points east-ish: (u.z, -u.x)
KT = 75
eyw['taxiways'] = [dict(id='A', w=18, pts=[K4.P(60, KT), K4.P(K4.L - 10, KT)]),
                   dict(id='A1', w=18, pts=[K4.P(K4.L - 10, KT), K4.P(K4.L - 10, 0)]), dict(id='A2', w=18, pts=[K4.P(60, KT), K4.P(20, 0)]),
                   dict(id='A3', w=18, pts=[K4.P(540, KT), K4.P(540, 0)])]
KS0, KS1, KQ0, KQ1 = 470, 560, 128, 152
kfp = K4.rect(KS0, KS1, KQ0, KQ1); kc = K4.P((KS0 + KS1) / 2, (KQ0 + KQ1) / 2)
eyw['terminal'] = dict(x=kc[0], z=kc[1], heading=round(math.atan2(-K4.n[0], -K4.n[1]), 4), len=KS1 - KS0, depth=KQ1 - KQ0, h=9, ring=kfp, name='Key West Terminal')
# regional stands: parked parallel to the terminal, nose north (taxi out forward), boarding by stairs
eyw['stands'] = [dict(id='G%d' % (i + 1), kind='gate', x=K4.P(s, KQ0 - 24)[0], z=K4.P(s, KQ0 - 24)[1], heading=round(math.atan2(-K4.u[0], -K4.u[1]), 4), s=s, bridge=0, stairs=1) for i, s in enumerate([490, 570])]
eyw['aprons'] = [dict(id='T', kind='terminal', poly=K4.rect(440, 600, KT + 9, KQ0)), dict(id='GA', kind='ga', poly=K4.rect(680, 800, KT + 9, KT + 32))]
eyw['gaStands'] = [dict(x=K4.P(s, KT + 21)[0], z=K4.P(s, KT + 21)[1], heading=round(math.atan2(-K4.n[0], -K4.n[1]), 4)) for s in (700, 740, 780)]
eyw['hangars'] = [dict(model='hangar_quonset', x=K4.P(s, KT + 43)[0], z=K4.P(s, KT + 43)[1], heading=round(math.atan2(-K4.n[0], -K4.n[1]), 4)) for s in (715, 760)]  # hangar centers q = KT + 43 (19 x 27 m Quonsets, doors toward the taxiway)
kt = K4.P(628, 128)
eyw['forecourt'] = K4.rect(KS0 - 15, KS1 + 15, KQ1, KQ1 + 44)
eyw['tower'] = dict(model='control_tower_sm', x=kt[0], z=kt[1], heading=round(K4.h, 4))
eyw['windsocks'] = [K4.P(150, -45), K4.P(800, -45)]
LOOP = ['r6522', 'r6525', 'r6523', 'r6531', 'r6532']
loop_buf = unary_union([rline(i).buffer(roads[i]['width'] / 2 + 12) for i in LOOP + ['r6514', 'r6519', 'r6533'] if i in roads])
inside = Polygon(list(roads['r6522']['pts']) + list(roads['r6525']['pts'])[1:] + list(reversed(roads['r6523']['pts']))).buffer(0)
kstrips = unary_union([LineString([K4.P(-70, 0), K4.P(K4.L + 40, 0)]).buffer(70, cap_style=2), LineString([K3.P(-40, 0), K3.P(K3.L + 50, 0)]).buffer(70, cap_style=2)])
kcurb = Polygon(K4.rect(KS0 - 20, KS1 + 20, KQ1 - 0.5, 260))
kpocket = unary_union([kcurb, Polygon(kfp).buffer(0.01)])
kair = inside.union(kstrips).difference(loop_buf).difference(kpocket).intersection(land.buffer(-8))
kair = max(list(kair.geoms) if hasattr(kair, 'geoms') else [kair], key=lambda g: g.area).simplify(2.0)
eyw['airside'] = [[round(x, 1), round(z, 1)] for x, z in list(kair.exterior.coords)[:-1]]
eyw['landside'] = [[round(x, 1), round(z, 1)] for x, z in list(kpocket.intersection(inside.union(kcurb)).simplify(2).exterior.coords)[:-1]]
eyw['fenceGates'] = []
eyw['_manualGates'] = [K4.P(KS1 + 24, KQ1 + 10)]
airports.append([eyw, kair, kpocket, loop_buf])

# ---------------------------------------------------------------- pavement layers (non-overlapping polygons, one material each)
def polys_out(g, tol=0.25):
    out = []
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if p.geom_type != 'Polygon' or p.area < 4: continue
        p = p.simplify(tol)
        out.append(dict(o=[[round(x, 2), round(z, 2)] for x, z in list(p.exterior.coords)[:-1]], h=[[[round(x, 2), round(z, 2)] for x, z in list(r.coords)[:-1]] for r in p.interiors]))
    return out
for item in airports:
    ap, poly, pk, kb = item
    rw, blast, shoulder = [], [], []
    for r in ap['runways']:
        F = Frame(r['a'], r['b']); w = r['w']; sh = 7.5 if w >= 40 else 5.0; bp = 60 if w >= 40 else 40
        rw.append(Polygon(F.rect(0, F.L, -w / 2, w / 2)))
        blast += [Polygon(F.rect(-bp, 0, -w / 2, w / 2)), Polygon(F.rect(F.L, F.L + bp, -w / 2, w / 2))]
        shoulder.append(Polygon(F.rect(-bp, F.L + bp, -w / 2 - sh, w / 2 + sh)))
        r['shoulder'] = sh; r['blast'] = bp
    RW = unary_union(rw); BL = unary_union(blast).difference(RW)
    tw = unary_union([LineString(t['pts']).buffer(t['w'] / 2, cap_style=2, join_style=1) for t in ap['taxiways']])
    fil = 16.0   # fillets where taxiways meet each other and the runways (close the union, keep only what touches taxiways)
    closed = tw.union(RW).buffer(fil, join_style=1).buffer(-fil, join_style=1)
    TW = closed.difference(RW).difference(BL).intersection(tw.buffer(fil + 2))
    AP = unary_union([Polygon(a['poly']) for a in ap['aprons']]).difference(RW).difference(TW)
    SH = unary_union(shoulder).difference(RW).difference(BL).difference(TW).difference(AP)
    FC = Polygon(ap['forecourt']).difference(Polygon(ap['terminal']['ring']).buffer(0.05)) if ap.get('forecourt') else Polygon()
    ap['pave'] = dict(runway=polys_out(RW), blast=polys_out(BL), shoulder=polys_out(SH), taxiway=polys_out(TW), apron=polys_out(AP), forecourt=polys_out(FC))
    # taxiway edges that border grass / shoulders (double yellow edge line + blue edge lights), 0.9 m inside the pavement
    edge = TW.buffer(-0.9).boundary.difference(unary_union([RW, AP, BL]).buffer(3.0))
    ap['twEdge'] = [[[round(x, 2), round(z, 2)] for x, z in l.simplify(0.2).coords] for l in (edge.geoms if hasattr(edge, 'geoms') else [edge]) if l.length > 6]
    # the airside always holds every paved surface with 18 m of grass around it
    g = poly.union(unary_union([RW, BL, TW, AP, SH]).buffer(18)).difference(kb).difference(pk).intersection(land.buffer(-6))
    g = max(list(g.geoms) if hasattr(g, 'geoms') else [g], key=lambda q: q.area).simplify(2.0)
    item[1] = poly = g; ap['airside'] = [[round(x, 1), round(z, 1)] for x, z in list(g.exterior.coords)[:-1]]
    _out = unary_union([RW, TW, AP]).difference(Polygon(ap['airside']).buffer(1))
    if _out.area > 1: print('WARN', ap['id'], 'pavement outside the airside:', round(_out.area), 'm2 at', [(round(q.centroid.x), round(q.centroid.y), round(q.area)) for q in (_out.geoms if hasattr(_out, 'geoms') else [_out]) if q.area > 5])

# ---------------------------------------------------------------- roads that cross the airside (dropped by the map build)
for ap, poly, pk, kb in airports:
    inner = poly.buffer(-4)
    ap['droppedRoads'] = sorted([r['id'] for r in feat['roads'] if LineString(r['pts']).intersection(inner).length > 6])
    xs = [p[0] for p in ap['airside']]; zs = [p[1] for p in ap['airside']]
    ap['rect'] = [round(min(xs) - 400), round(min(zs) - 400), round(max(xs) + 400), round(max(zs) + 400)]
    ap['center'] = [round((min(xs) + max(xs)) / 2), round((min(zs) + max(zs)) / 2)]
    # vehicle gates: where a kept road comes within 35 m of the fence line, one gate on the nearest fence point (max 3)
    ring = LineString(ap['airside'] + ap['airside'][:1]); gates = []
    for r in feat['roads']:
        if r['id'] in ap['droppedRoads']: continue
        ls = LineString(r['pts'])
        if ls.distance(ring) > 30 or r['kind'] in ('trunk', 'motorway'): continue
        # the dropped road that met this one inside: gate where it crossed the line
        for d in ap['droppedRoads']:
            dl = LineString(roads[d]['pts'])
            if dl.distance(ls) > 1.0: continue
            x = dl.intersection(ring)
            if x.is_empty: continue
            p = x if x.geom_type == 'Point' else list(x.geoms)[0]
            if p.geom_type != 'Point': continue
            if any(math.hypot(p.x - g['x'], p.y - g['z']) < 150 for g in gates): continue
            if Polygon(ap['terminal']['ring']).distance(p) < 12: continue      # never in the terminal wall
            gates.append(dict(x=round(p.x, 1), z=round(p.y, 1), w=9, road=d))
    for mx, mz in ap.pop('_manualGates', []):
        p = ring.interpolate(ring.project(Point(mx, mz)))
        if not any(math.hypot(p.x - g['x'], p.y - g['z']) < 60 for g in gates): gates.append(dict(x=round(p.x, 1), z=round(p.y, 1), w=9, road=None))
    ap['fenceGates'] = gates[:5]

doc = dict(version=1, note='Generated by tools/v2/airport/design.py (do not hand-edit; change the script). Coordinates: world meters, +x east, +z south; heading 0 faces +z.',
           airports=[a for a, _, _, _ in airports])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(doc, open(OUT, 'w'), indent=1)
for a, p, pk, kb in airports:
    print(a['id'], 'airside %.2f km2' % (p.area / 1e6), 'verts', len(a['airside']), 'dropped roads', len(a['droppedRoads']), a['droppedRoads'], 'gates', a['fenceGates'])
