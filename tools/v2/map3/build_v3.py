#!/usr/bin/env python
"""Southline map v3 (stage 1): the whole world from the user's own map images, about 7x smaller than v2 (plan 2.1b).

Inputs:  docs/v2/plan/map_roads_target.webp (every road, traced by trace.py -> out/roads_raw.json)
         docs/v2/plan/map_colour_target.webp (land, water, beaches, forest, swamp, towns; registered by register.py)
Frame:   road-image pixel (px, py) -> world x = (px - 700) * 11, z = (py - 800) * 11 (meters, +X east, +Z south).
Output:  tools/world/out/features.json + heights.bin (FORMAT.md v4 fields) and public/assets/world/layout.json, then
         `tools/osm/.venv/bin/python tools/osm/merge.py` builds the runtime world (with MIAMI_NO_OSM=1: no real-Miami
         data; everything comes from the user's map).
Run:     tools/world/.venv/bin/python tools/v2/map3/build_v3.py
"""
import json, math, os, sys, time, traceback
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'world'))
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

# ---------------------------------------------------------------- frame (patch the shared library before it is used)
S = 11.0; OX, OY = 700.0, 800.0; IW, IH = 1053, 1493
from wl import util as U
U.BOUNDS.update(minX=(0 - OX) * S, maxX=(IW - OX) * S, minZ=(0 - OY) * S, maxZ=(IH - OY) * S)
# no real-Miami rectangle any more: park it as a 10 m box in the open ocean (south-west corner) so nothing is clipped
U.REAL.update(minX=U.BOUNDS['minX'] + 20, maxX=U.BOUNDS['minX'] + 30, minZ=U.BOUNDS['maxZ'] - 30, maxZ=U.BOUNDS['maxZ'] - 20)
U.NX = int(round((U.BOUNDS['maxX'] - U.BOUNDS['minX']) / U.CELL)); U.NZ = int(round((U.BOUNDS['maxZ'] - U.BOUNDS['minZ']) / U.CELL))
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box as sbox
from shapely.ops import unary_union, polygonize, linemerge
from shapely import STRtree
from wl import roadnet as RN, gen as G
from wl.world import World, Road, RANK
from wl.util import BOUNDS, REAL, rng, plen, r2, catmull

STAGE = os.environ.get('MAP3_OUT')          # staging dir: features.json, heights.bin, layout.json all go there (the live game is untouched)
OUT = STAGE or os.path.join(ROOT, 'tools', 'world', 'out'); os.makedirs(OUT, exist_ok=True)
MAP3 = os.path.join(HERE, 'out')
LAYOUT_PATH = os.path.join(OUT, 'layout.json') if STAGE else os.path.join(ROOT, 'public', 'assets', 'world', 'layout.json')
REG = json.load(open(os.path.join(MAP3, 'register.json')))
RAW = json.load(open(os.path.join(MAP3, 'roads_raw.json')))

def p2w(px, py): return ((px - OX) * S, (py - OY) * S)
def w2p(x, z): return (x / S + OX, z / S + OY)
def c2r(cx, cy): return ((cx - REG['tx']) / REG['s'], (cy - REG['ty']) / REG['s'])          # colour px -> road px
def c2w(cx, cy): return p2w(*c2r(cx, cy))
def PX(pts): return [p2w(x, y) for x, y in pts]
def P(pts): return Polygon(pts).buffer(0)
def geoms(g): return list(g.geoms) if hasattr(g, 'geoms') else ([g] if not g.is_empty else [])

W = World()

# ---------------------------------------------------------------- 1. classify the colour map
def classify():
    a = np.asarray(Image.open(os.path.join(ROOT, 'docs/v2/plan/map_colour_target.webp')).convert('RGB')).astype(np.float32)
    a = ndimage.median_filter(a, size=(3, 3, 1))
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mean = (r + g + b) / 3.0
    water = (b > r + 22) & (b > 0.78 * g) & ~((r > 150) & (g > 150))
    sand = (r > 168) & (g > 150) & (b > 95) & (r > b + 22) & ~water
    gray = (np.abs(r - g) < 20) & (np.abs(g - b) < 22) & (mean > 100) & ~water & ~sand
    lab, n = ndimage.label(water)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sizes = ndimage.sum_labels(np.ones_like(lab), lab, np.arange(n + 1))
    big = [i for i in range(1, n + 1) if i in border or sizes[i] > 60000]
    ocean = np.isin(lab, big)
    land = ~ocean
    sand = sand & ndimage.binary_dilation(ocean, iterations=5)
    inland = water & ~ocean
    shallow = ocean & (g > 118) & (g > r + 30)
    green = land & ~inland & ~sand & ~gray
    dark = green & (mean < np.percentile(mean[green], 40))
    urban = ndimage.binary_opening(ndimage.binary_closing(gray, iterations=2), iterations=1) & land
    forest = ndimage.binary_opening(ndimage.binary_closing(dark, iterations=2), iterations=2)
    # swamp: land where small inland water bodies are dense (Everglades-style sloughs and mangrove)
    wet_density = ndimage.gaussian_filter(inland.astype(np.float32), 6)
    swamp = land & ~urban & (wet_density > 0.10)
    swamp = ndimage.binary_opening(ndimage.binary_closing(swamp, iterations=3), iterations=2)
    return dict(rgb=a, land=land, solid=land & ~inland, inland=inland, sand=sand & land, urban=urban, forest=forest & ~swamp,
                shallow=shallow, ocean=ocean, swamp=swamp, green=green)

def polys_from_mask(mask, sigma=0.8, simplify=4.0, min_area=1500.0):
    """Mask in colour-image pixels -> shapely (Multi)Polygon in world meters (holes handled by even-odd nesting)."""
    from skimage import measure
    m = ndimage.gaussian_filter(np.pad(mask.astype(np.float32), 2), sigma)
    cs = measure.find_contours(m, 0.5)
    polys = []
    for c in cs:
        if len(c) < 4: continue
        pts = [c2w(x - 2, y - 2) for y, x in c]
        p = Polygon(pts).buffer(0)
        if p.area >= min_area * 0.25: polys.append(p)
    polys.sort(key=lambda p: -p.area)
    acc = Polygon()
    for p in polys: acc = acc.symmetric_difference(p)
    acc = acc.buffer(0)
    out = [g.simplify(simplify) for g in geoms(acc) if g.area >= min_area]
    return unary_union(out) if out else Polygon()

log('classify colour map')
C = classify()
land_c = ndimage.binary_closing(C['land'], iterations=1)
LAND_ALL = polys_from_mask(land_c, simplify=3.0, min_area=1200)              # includes inland water (lake, rivers)
INLAND = polys_from_mask(C['inland'] & ndimage.binary_erosion(land_c, iterations=1), sigma=0.7, simplify=2.5, min_area=900)
SAND = polys_from_mask(C['sand'], sigma=0.7, simplify=2.5, min_area=1500)
FOREST = polys_from_mask(C['forest'], sigma=1.0, simplify=6.0, min_area=20000)
SWAMP = polys_from_mask(C['swamp'], sigma=1.2, simplify=8.0, min_area=40000)
URBAN = polys_from_mask(C['urban'], sigma=1.0, simplify=6.0, min_area=8000)
SHALLOW = polys_from_mask(C['shallow'], sigma=1.5, simplify=10.0, min_area=30000)
land = LAND_ALL.buffer(0)
W.set_land(land)
log(f'land {land.area / 1e6:.1f} km2 in {len(geoms(land))} polys; inland water {INLAND.area / 1e6:.2f} km2; swamp {SWAMP.area / 1e6:.1f} km2')

# inland water: the big lake by name, other large bodies as lakes / ponds, thin long ones as rivers / canals
LAKE = None
for p in sorted(geoms(INLAND), key=lambda p: -p.area):
    a = p.area; mrr = p.minimum_rotated_rectangle; ext = mrr.exterior.coords; e1 = math.dist(ext[0], ext[1]); e2 = math.dist(ext[1], ext[2])
    thin = a / max(1.0, max(e1, e2) ** 2) < 0.08
    if LAKE is None and a > 5e5: LAKE = p; W.add_water(p, 'lake', 'Lake Okeechobee', depth=4.5); continue
    if thin: W.add_water(p, 'river', None, depth=2.2)
    elif a > 60000: W.add_water(p, 'lake', None, depth=3.0)
    else: W.add_water(p, 'pond', None, depth=1.6)

# ---------------------------------------------------------------- 2. districts (named from real South Florida places)
# anchor (road px), name, kind: core | city | beach | port | islands | suburb | town | keys | rural
ANCHORS = [
    ((737, 790), 'Downtown', 'core', 70), ((728, 668), 'Edgewater', 'city', 60), ((640, 795), 'Little Havana', 'city', 60),
    ((700, 960), 'Brickell', 'core', 70), ((660, 1020), 'Coconut Grove', 'suburb', 45),
    ((912, 740), 'Miami Beach', 'beach', 70), ((918, 860), 'South Beach', 'beach', 50),
    ((845, 872), 'Dodge Island Port', 'port', 45), ((790, 940), 'Star Island', 'islands', 30), ((850, 945), 'Fisher Island', 'islands', 40),
    ((930, 930), 'Virginia Key', 'islands', 45), ((840, 1000), 'Key Biscayne', 'islands', 45),
    ((590, 895), 'Miami International Airport', 'airport', 75), ((765, 520), 'Miami Gardens', 'city', 55), ((725, 330), 'Hialeah Gardens', 'suburb', 45),
    ((560, 545), 'Clewiston', 'town', 55), ((500, 215), 'Okeechobee', 'town', 40), ((685, 600), 'Opa-locka', 'town', 40),
    ((215, 440), 'Fort Myers', 'town', 55), ((300, 525), 'Port Charlotte', 'town', 45), ((235, 578), 'Sanibel', 'town', 30),
    ((270, 780), 'Naples', 'town', 55), ((385, 1080), 'Everglades City', 'town', 35), ((580, 1090), 'Homestead', 'town', 55),
    ((670, 1120), 'Florida City', 'town', 35), ((595, 1300), 'Key Largo', 'keys', 75), ((447, 1400), 'Marathon', 'keys', 35),
    ((255, 1340), 'Key West', 'keys', 60),
]
REGIONS_RURAL = [((500, 700), 'Everglades', 'rural', 300), ((420, 380), 'Big Cypress', 'rural', 250), ((640, 430), 'Lake Okeechobee', 'rural', 120)]

# ---------------------------------------------------------------- 3. roads from the trace
log('roads')
nodes = {k: tuple(v) for k, v in RAW['nodes'].items()}
RUNWAYS_PX = [((513, 848), (628, 852), 13.0), ((518, 884), (625, 953), 9.0), ((225, 1386), (279, 1318), 8.0), ((262, 1302), (283, 1388), 8.0)]
def near_runway(px, py):
    for (ax, ay), (bx, by), w in RUNWAYS_PX:
        dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        if math.hypot(px - ax - t * dx, py - ay - t * dy) < w * 0.5 + 1.5: return True
    return False
AIRFIELD_PX = [(503, 838), (634, 838), (634, 868), (600, 880), (632, 958), (612, 966), (505, 892)]
AIRFIELD = P(PX(AIRFIELD_PX))
edges = []
for r in RAW['roads']:
    pts = r['px']
    inside = sum(1 for x, y in pts if near_runway(x, y)) / len(pts)
    if inside > 0.5: continue
    edges.append(r)
log(f'traced edges {len(RAW["roads"])} -> {len(edges)} after runway removal')

# straighten: a junction node whose two through-edges are nearly collinear is moved onto the line between their far
# points (grid streets run straight through junctions instead of wobbling by the skeleton's half pixel)
inc = {}
for i, e in enumerate(edges):
    inc.setdefault(str(e['a']), []).append((i, 0)); inc.setdefault(str(e['b']), []).append((i, -1))
def unit(ax, ay, bx, by):
    L = math.hypot(bx - ax, by - ay) or 1.0
    return ((bx - ax) / L, (by - ay) / L)
for it in range(6):
    for nid_, lst in inc.items():
        if len(lst) < 2 or nid_ not in nodes: continue
        nx_, ny_ = nodes[nid_]
        dirs = []
        for i, end in lst:
            pts = edges[i]['px']
            far = pts[1] if end == 0 else pts[-2]
            far2 = pts[min(len(pts) - 1, 3)] if end == 0 else pts[max(0, len(pts) - 4)]
            dirs.append((i, end, unit(nx_, ny_, far2[0], far2[1]), far2))
        moves = []
        for a_ in range(len(dirs)):
            for b_ in range(a_ + 1, len(dirs)):
                da, db = dirs[a_][2], dirs[b_][2]
                if da[0] * db[0] + da[1] * db[1] < -0.985:      # within ~10 degrees of straight through
                    (ax, ay), (bx, by) = dirs[a_][3], dirs[b_][3]
                    dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1.0
                    t = ((nx_ - ax) * dx + (ny_ - ay) * dy) / L2
                    moves.append((ax + t * dx, ay + t * dy))
        if moves:
            mx = sum(m[0] for m in moves) / len(moves); my = sum(m[1] for m in moves) / len(moves)
            if math.hypot(mx - nx_, my - ny_) < 1.2:
                nodes[nid_] = (nx_ + (mx - nx_) * 0.7, ny_ + (my - ny_) * 0.7)
    for e in edges:
        a, b = nodes.get(str(e['a'])), nodes.get(str(e['b']))
        if a: e['px'][0] = list(a)
        if b: e['px'][-1] = list(b)
# short straight edges become exactly straight (city blocks); longer ones keep their curves
for e in edges:
    pts = e['px']
    if len(pts) > 2:
        (ax, ay), (bx, by) = pts[0], pts[-1]
        L = math.hypot(bx - ax, by - ay)
        dev = max(abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / max(L, 1e-6) for x, y in pts)
        if L < 25 and dev < 0.9: e['px'] = [pts[0], pts[-1]]

# heal skeleton gaps: a dead end that stops within ~3 px of another road (the picture shows them meeting) is extended
# onto that road along its own direction (planarize() then nodes the touch into a junction)
deg = {}
for e in edges: deg[str(e['a'])] = deg.get(str(e['a']), 0) + 1; deg[str(e['b'])] = deg.get(str(e['b']), 0) + 1
_lines = [LineString(e['px']) for e in edges]
_tree = STRtree(_lines)
healed = 0
for i, e in enumerate(edges):
    for end in (0, -1):
        nid_ = str(e['a'] if end == 0 else e['b'])
        if deg.get(nid_, 0) != 1: continue
        pts = e['px']; p = pts[end]; q = pts[1] if end == 0 else pts[-2]
        L = math.hypot(p[0] - q[0], p[1] - q[1]) or 1.0; dx, dy = (p[0] - q[0]) / L, (p[1] - q[1]) / L
        best = None
        for j in _tree.query(Point(p).buffer(3.6)):
            if j == i: continue
            ln = _lines[j]; d = ln.distance(Point(p))
            if d > 3.5: continue
            t = ln.interpolate(ln.project(Point(p))); vx, vy = t.x - p[0], t.y - p[1]; vl = math.hypot(vx, vy)
            ahead = (vx * dx + vy * dy) / vl if vl > 1e-6 else 1.0
            if ahead < 0.35: continue                               # only continue roughly forward
            if best is None or d < best[0]: best = (d, (t.x, t.y))
        if best:
            if end == 0: e['px'] = [list(best[1])] + pts
            else: e['px'] = pts + [list(best[1])]
            healed += 1
log(f'healed {healed} skeleton gaps')

def district_of(px, py):
    best = None
    for (ax, ay), nm, kind, rad in ANCHORS:
        d = math.hypot(px - ax, py - ay) / rad
        if d < 1.0 and (best is None or d < best[0]): best = (d, nm, kind)
    return (best[1], best[2]) if best else (None, 'rural')

URBAN_KINDS = ('core', 'city', 'beach', 'port', 'islands', 'suburb', 'town', 'keys', 'airport')
def classify_road(e):
    mx, my = e['px'][len(e['px']) // 2]
    dist, dkind = district_of(mx, my)
    w = e['wpx']; L = e['lenpx'] * S
    urban = dkind in URBAN_KINDS
    if w >= 3.8 and L > 60:
        return dict(kind='trunk', lf=2, lb=2, speed=(70 if urban else 90), district=dist, dkind=dkind)
    if w >= 2.6:
        return dict(kind='primary', lf=2, lb=2, speed=(55 if urban else 80), district=dist, dkind=dkind) if urban else dict(kind='secondary', lf=1, lb=1, speed=80, district=dist, dkind=dkind)
    if urban:
        if dkind in ('core', 'city', 'beach'):   # metro grid: signalized city streets (GTA downtown has lights at every corner)
            return dict(kind='secondary', lf=1, lb=1, speed=45, district=dist, dkind=dkind)
        return dict(kind='residential' if dkind in ('suburb', 'islands', 'keys') else 'tertiary', lf=1, lb=1, speed=40, district=dist, dkind=dkind)
    return dict(kind='tertiary', lf=1, lb=1, speed=70, district=dist, dkind=dkind)

# wider streets (user): two lanes plus parking in town, four lanes on arterials, divided highways
WIDTH = {'trunk': 19.0, 'primary': 15.0, 'secondary': 10.0, 'tertiary': 9.0, 'residential': 8.4}
nroad = 0
for e in edges:
    cl = classify_road(e)
    pts = PX(e['px'])
    if len(pts) < 2 or plen(pts) < 6: continue
    rd = W.road(pts, cl['kind'], '', lf=cl['lf'], lb=cl['lb'], speed=cl['speed'], region=cl['district'] or 'rural', tags={'dkind': cl['dkind'], 'wpx': e['wpx']})
    if rd is None: continue
    rd.width = WIDTH[cl['kind']] if not (cl['dkind'] in ('rural',) and cl['kind'] == 'tertiary') else 7.6
    nroad += 1
log(f'roads added {nroad}, {sum(plen(r.pts) for r in W.raw_roads) / 1000:.0f} km')

# ---------------------------------------------------------------- 3b. Key Largo detail (user's detailed image)
# tools/v2/map3/out/keys_detail.json (made by tools/v2/map3/keys_detail.py from docs/v2/plan/keys_detail.webp) replaces
# everything of the main map inside its `region` polygon (world meters): land, roads, buildings, Nico's house.
#   { region: [[x,z],...], land: [ring,...], roads: [{pts, kind, surface, name, lanes?, width?, oneway?}],
#     buildings: [{ring, h, style, kind, zone, name?, poi?}], piers: [{pts, width}], nico: {x, z, heading, spawnX, spawnZ, lot?},
#     keysBar?: {x, z, heading}, joins: [[x,z],...] (points where detail roads meet main-map roads outside the region) }
KEYS = None
_kp = os.path.join(MAP3, 'keys_detail.json')
if os.path.exists(_kp):
    KEYS = json.load(open(_kp))
    KREG = Polygon(KEYS['region']).buffer(0)
    _land = unary_union([Polygon(r).buffer(0) for r in KEYS.get('land', [])]) if KEYS.get('land') else None
    W.set_land(W.land.difference(KREG).union(_land) if _land is not None else W.land.difference(KREG))
    # main-map roads: drop the parts inside the region (keep the pieces outside so the network still meets it)
    _kept = []
    for r in W.raw_roads:
        ln = LineString(r.pts)
        if not ln.intersects(KREG): _kept.append(r); continue
        rest = ln.difference(KREG)
        for g_ in geoms(rest):
            if g_.geom_type == 'LineString' and g_.length > 25: _kept.append(r.copy_with(list(g_.coords)))
    W.raw_roads = _kept
    for rd_ in KEYS.get('roads', []):
        kind = rd_.get('kind', 'residential'); lanes = int(rd_.get('lanes', 1))
        r = W.road(rd_['pts'], kind, rd_.get('name', ''), lf=lanes, lb=0 if rd_.get('oneway') else lanes, oneway=bool(rd_.get('oneway')),
                   speed=rd_.get('speedKmh') or (80 if kind == 'trunk' else 30 if rd_.get('surface') == 'dirt' else 40),
                   surface=rd_.get('surface'), region='Key Largo', ref=('US-1' if kind == 'trunk' else ''), tags={'keysDetail': 1, 'dkind': 'keys', 'style': rd_.get('style')})
        if r is not None: r.width = rd_.get('width') or (11.0 if kind == 'trunk' else 5.2 if rd_.get('surface') == 'dirt' else 7.0)
    for pr in KEYS.get('piers', []): W.path(pr['pts'], 'pier', pr.get('width', 2.2), 'wood', None, y=None)
    log(f"keys detail: region {KREG.area / 1e6:.2f} km2, roads {len(KEYS.get('roads', []))}, buildings {len(KEYS.get('buildings', []))}, piers {len(KEYS.get('piers', []))}")

# ---------------------------------------------------------------- 4. airports (areas; roads around them come from the trace)
for (ax, ay), (bx, by), w in RUNWAYS_PX:
    a, b = p2w(ax, ay), p2w(bx, by)
    W.add_area(LineString([a, b]).buffer(max(45.0, w * S * 0.45), cap_style=2), 'runway', 'Runway', clip=False, block='reserved')
W.add_area(AIRFIELD.buffer(-5), 'apron', 'Miami International Airport', clip=False)
KW_AF = P(PX([(214, 1300), (290, 1290), (292, 1392), (214, 1395)])).intersection(land)
W.extra['airport'] = dict(name='Miami International Airport', runways=[[list(map(round, p2w(*a))), list(map(round, p2w(*b)))] for a, b, _ in RUNWAYS_PX[:2]])
W.extra['airfield'] = dict(name='Key West International Airport', runways=[[list(map(round, p2w(*a))), list(map(round, p2w(*b)))] for a, b, _ in RUNWAYS_PX[2:]])

# ---------------------------------------------------------------- 5. land cover areas
_LC = W.land.difference(KREG) if KEYS else W.land   # land cover: final land, and nothing of the main map inside the Keys detail
for p in geoms(SAND.intersection(_LC)): W.add_area(p, 'beach', None)
for p in geoms(SWAMP.intersection(_LC).difference(INLAND)): W.add_area(p, 'wetland', 'Everglades' if p.area > 2e6 else None)
for p in geoms(FOREST.intersection(_LC).difference(SWAMP).difference(INLAND)): W.add_area(p, 'forest' if p.area > 2e5 else 'scrub', None)

# ---------------------------------------------------------------- 6. finalize the network
log('finalize network')
wet = sbox(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ']).difference(W.land.buffer(0.5)).union(INLAND)
# water narrower than ~18 m (slivers, ditches, narrow inlets along the shore) does not make a bridge: the road crosses it at
# grade on a culvert (each bridge is its own deck mesh and draw calls; the map had ~240 tiny ones)
wet = wet.buffer(-9.0, join_style=2).buffer(9.0, join_style=2)
wet = unary_union([g for g in geoms(wet) if g.area > 1500])
nb = RN.finalize(W, wet)
comps = RN.connectivity(W.roads)
main_c = set(comps[0])
log(f'network: {len(W.roads)} edges, bridges {nb}, components {len(comps)}, orphans {sum(len(c) for c in comps[1:])} edges')
# keep islands' own small networks too (every road on the user's map ships), only drop slivers
keep = set(main_c)
for comp in comps[1:]:
    if sum(plen(W.roads[i].pts) for i in comp) >= 120: keep |= set(comp)
W.roads = [r for i, r in enumerate(W.roads) if i in keep]
for r in W.roads: r.id = W.nid('r')

# ---------------------------------------------------------------- 6b. divided highways: parallel carriageway pairs -> one-way
# The map draws a divided highway as two thick lines 3-7 px apart. Each line becomes a one-way carriageway; right-hand
# traffic: a carriageway runs in the direction for which its twin lies on its LEFT.
def _dir_at(ln, s):
    a = ln.interpolate(max(0.0, s - 8)); b = ln.interpolate(min(ln.length, s + 8))
    dx, dz = b.x - a.x, b.y - a.y; L = math.hypot(dx, dz) or 1.0
    return dx / L, dz / L
big = [r for r in W.roads if r.kind == 'trunk' and not r.bridge]
bl = [LineString(r.pts) for r in big]; btree = STRtree(bl)
ndiv = 0
for i, r in enumerate(big):
    ln = bl[i]
    if ln.length < 100: continue
    votes = []
    for k in range(1, 8):
        s = ln.length * k / 8; p = ln.interpolate(s); dx, dz = _dir_at(ln, s)
        best = None
        for j in btree.query(p.buffer(80)):
            if j == i: continue
            o = bl[j]; d_ = o.distance(p)
            if not (30 <= d_ <= 80): continue
            q = o.interpolate(o.project(p)); ox, oz = _dir_at(o, o.project(p))
            if abs(dx * ox + dz * oz) < 0.93: continue
            side = dx * (q.y - p.y) - dz * (q.x - p.x)     # >0: twin on the right of travel (x east, z south: right = (-dz, dx))
            if best is None or d_ < best[0]: best = (d_, side)
        if best: votes.append(best[1])
    if len(votes) >= 6:
        left = sum(1 for v in votes if v < 0); right = len(votes) - left
        if left < right:     # twin on the right -> travel the other way
            r.pts = r.pts[::-1]
            if r.y: r.y = r.y[::-1]
        r.oneway = True; r.lb = 0; r.lf = 3 if r.kind == 'trunk' else 2
        r.width = 11.5 if r.kind == 'trunk' else 8.5; r.tags['divided'] = 1; ndiv += 1
# short pieces between junctions inherit the one-way direction of the carriageway they continue
for _pass in range(3):
    ends_in, ends_out = {}, {}
    for r in W.roads:
        if r.tags.get('divided'):
            ends_out.setdefault(r2(r.pts[0]), []).append(r); ends_in.setdefault(r2(r.pts[-1]), []).append(r)
    for r in big:
        if r.tags.get('divided') or plen(r.pts) >= 60: continue
        a, b = r2(r.pts[0]), r2(r.pts[-1])
        fwd = bool(ends_in.get(a)) and bool(ends_out.get(b)); rev = bool(ends_in.get(b)) and bool(ends_out.get(a))
        if fwd == rev: continue
        if rev:
            r.pts = r.pts[::-1]
            if r.y: r.y = r.y[::-1]
        r.oneway = True; r.lb = 0; r.lf = 3 if r.kind == 'trunk' else 2
        r.width = 11.5 if r.kind == 'trunk' else 8.5; r.tags['divided'] = 1; ndiv += 1
log(f'divided-highway carriageways: {ndiv}')

# ---------------------------------------------------------------- 7. names (real South Florida style; numbered grid in the metro)
log('names')
METRO = ('Downtown', 'Edgewater', 'Little Havana', 'Brickell', 'Coconut Grove', 'Miami Gardens', 'Opa-locka', 'Hialeah Gardens')
BEACH = ('Miami Beach', 'South Beach')
ORIGIN = p2w(737, 800)          # Flagler St x Miami Ave: the numbering origin (quadrants NE / NW / SE / SW)
BLOCK = 105.0
def ordinal(n):
    return f'{n}{"th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")}'
TOWN_ST = ['Main St', 'Palm Ave', 'Ocean Ave', 'Bay St', 'Royal Palm Way', 'Hibiscus St', 'Mango St', 'Coral Way', 'Pelican Ave', 'Sunset Dr',
           'Mangrove Ln', 'Cypress St', 'Orange Ave', 'Seagrape Dr', 'Gulf Blvd', 'Banyan St', 'Heron Ln', 'Tarpon Ave', 'Marlin St', 'Lime Ave',
           'Jasmine St', 'Egret Ln', 'Osprey Ave', 'Conch St', 'Dolphin Ave', 'Sabal Palm Rd', 'Key Lime Ln', 'Bougainvillea St', 'Manatee Ave', 'Snapper Ln']
KEYS_ST = ['Pelican Point Ln', 'Coconut Row', 'Tarpon Basin Dr', 'Bonefish Ln', 'Conch Ave', 'Sea Grape Ln', 'Barracuda Ln', 'Seashell Ln',
           'Mahogany Dr', 'Grouper St', 'Lobster Ln', 'Coral Reef Dr', 'Ocean Bay Dr', 'Marina Ave', 'Sponge Ln', 'Dove Ln']
RURAL = ['County Road 27', 'County Road 29', 'County Road 833', 'County Road 846', 'County Road 721', 'County Road 78', 'County Road 80', 'Sugarland Hwy', 'Muck City Rd',
         'Loop Road', 'Turner River Rd', 'Janes Scenic Dr', 'Snake Rd', 'Josie Billie Hwy', 'Corkscrew Rd', 'Immokalee Rd', 'Sawgrass Rd', 'Airboat Rd', 'Canal Rd', 'Levee Rd']
HWY = [('Overseas Highway', 'US-1'), ('Tamiami Trail', 'US-41'), ('Florida Turnpike', 'FL-821'), ('Alligator Alley', 'I-75'), ('Dolphin Expressway', 'SR 836'),
       ('Palmetto Expressway', 'SR 826'), ('Okeechobee Road', 'US-27'), ('Krome Avenue', 'SR 997'), ('Sawgrass Expressway', 'SR 869'), ('Card Sound Road', 'CR 905'),
       ('Gratigny Parkway', 'SR 924'), ('Biscayne Boulevard', 'US-1')]
def chains(rs):
    """Group roads of one class into long chains (continue through junctions along the straightest same-class edge)."""
    ends = {}
    for i, r in enumerate(rs):
        for k in (0, -1): ends.setdefault(r2(r.pts[k]), []).append(i)
    seen = set(); out = []
    for i0 in sorted(range(len(rs)), key=lambda i: -plen(rs[i].pts)):
        if i0 in seen: continue
        ch = [i0]; seen.add(i0)
        for direction in (0, -1):
            cur = i0; tip = rs[cur].pts[direction]; prev = rs[cur].pts[1 if direction == 0 else -2]
            while True:
                cand = [j for j in ends.get(r2(tip), []) if j not in seen]
                if not cand: break
                dx, dz = tip[0] - prev[0], tip[1] - prev[1]; L = math.hypot(dx, dz) or 1
                def turn(j):
                    q = rs[j].pts[1] if r2(rs[j].pts[0]) == r2(tip) else rs[j].pts[-2]
                    ex, ez = q[0] - tip[0], q[1] - tip[1]; E = math.hypot(ex, ez) or 1
                    return (dx * ex + dz * ez) / (L * E)
                j = max(cand, key=turn)
                if turn(j) < 0.7: break
                seen.add(j); ch.append(j)
                far = rs[j].pts[-1] if r2(rs[j].pts[0]) == r2(tip) else rs[j].pts[0]
                prev = rs[j].pts[-2] if r2(rs[j].pts[0]) == r2(tip) else rs[j].pts[1]
                tip = far
        out.append(ch)
    return out
# highways: the chain reaching farthest south is the Overseas Highway, the rest by length
trunks = [r for r in W.roads if r.kind == 'trunk' and not r.tags.get('keysDetail')]
tch = sorted(chains(trunks), key=lambda c: -sum(plen(trunks[i].pts) for i in c))
south = max(tch, key=lambda c: max(max(p[1] for p in trunks[i].pts) for i in c)) if tch else None
order_ = ([south] if south else []) + [c for c in tch if c is not south]
for k, ch in enumerate(order_):
    nm, ref = HWY[k] if k < len(HWY) else (f'State Road {900 + k}', f'SR {900 + k}')
    for i in ch: trunks[i].name = nm; trunks[i].ref = ref
# everything else: by district
town_i = {}; rural_i = [0]
others = [r for r in W.roads if r.kind != 'trunk' and not r.tags.get('keysDetail')]
for ch in sorted(chains(others), key=lambda c: -sum(plen(others[i].pts) for i in c)):
    rs = [others[i] for i in ch]
    mid = rs[len(rs) // 2].pts[len(rs[len(rs) // 2].pts) // 2]
    dist, dkind = district_of(*w2p(*mid))
    a, b = rs[0].pts[0], rs[-1].pts[-1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    if dist in METRO or dkind in ('core', 'city'):
        ns = abs(dz) >= abs(dx)
        if ns:   # avenue: numbered by distance east / west of the origin
            n = int(round(abs(mid[0] - ORIGIN[0]) / BLOCK)); q = ('N' if mid[1] < ORIGIN[1] else 'S') + ('E' if mid[0] >= ORIGIN[0] else 'W')
            nm = 'Miami Ave' if n == 0 else f'{q} {ordinal(n)} Ave'
        else:
            n = int(round(abs(mid[1] - ORIGIN[1]) / BLOCK)); q = ('N' if mid[1] < ORIGIN[1] else 'S') + ('E' if mid[0] >= ORIGIN[0] else 'W')
            nm = 'Flagler St' if n == 0 else f'{q} {ordinal(n)} St'
        if dist == 'Little Havana' and not ns and 7 <= n <= 9: nm = 'Calle Ocho (SW 8th St)'
        if dist == 'Brickell' and ns and rs[0].kind == 'primary': nm = 'Brickell Ave'
    elif dist in BEACH:
        ns = abs(dz) >= abs(dx)
        if ns:
            xs_ = mid[0]; k_ = town_i.setdefault('beach_ns', 0); town_i['beach_ns'] += 1
            nm = ['Collins Ave', 'Washington Ave', 'Ocean Dr', 'Meridian Ave', 'Alton Rd', 'Euclid Ave', 'Pennsylvania Ave', 'Jefferson Ave', 'Michigan Ave', 'Lenox Ave', 'Drexel Ave', 'Indian Creek Dr'][k_ % 12]
        else:
            n = max(1, int(round((ORIGIN[1] + 1300 - mid[1]) / BLOCK)) + 1)
            nm = f'{ordinal(n)} St' if n > 0 else 'Lincoln Rd'
    elif dkind in ('keys',):
        k_ = town_i.setdefault(dist, 0); town_i[dist] += 1; nm = KEYS_ST[k_ % len(KEYS_ST)]
    elif dkind in ('town', 'suburb', 'islands', 'port', 'airport', 'beach'):
        k_ = town_i.setdefault(dist, 0); town_i[dist] += 1; nm = TOWN_ST[k_ % len(TOWN_ST)]
        if dkind == 'airport': nm = ['Perimeter Rd', 'Terminal Dr', 'Cargo Rd', 'Air Freight Way', 'Hangar Rd'][k_ % 5]
        if dkind == 'port': nm = ['Port Blvd', 'Caribbean Way', 'Cruise Terminal Dr', 'Container Rd', 'Dock St'][k_ % 5]
    else:
        nm = RURAL[rural_i[0] % len(RURAL)]; rural_i[0] += 1
    for r in rs: r.name = nm
# Nico's street (memory: Pelican Point Lane) is set below with the house

# ---------------------------------------------------------------- 8. Nico's house: waterfront lot on the Key Largo bay side
NICO_PX = (634.0, 1287.0)        # Key Largo, bay (east) side
if KEYS and KEYS.get('nico'):
    _n = KEYS['nico']; NICO_PX = w2p(_n['x'], _n['z'])
from shapely import affinity
_np = Point(*p2w(*NICO_PX))
road_near = min((r for r in W.roads if r.kind != 'trunk' and not r.bridge), key=lambda r: LineString(r.pts).distance(_np))
dline = LineString(road_near.pts); fp = dline.interpolate(dline.project(_np))
_a = dline.interpolate(max(0.0, dline.project(fp) - 6)); _b = dline.interpolate(min(dline.length, dline.project(fp) + 6))
tx_, tz_ = _b.x - _a.x, _b.y - _a.y; tl_ = math.hypot(tx_, tz_) or 1.0; tx_, tz_ = tx_ / tl_, tz_ / tl_
nx1, nz1 = tz_, -tx_                          # one normal of the road; the bay side is the one with water 60 m out
if W.land.contains(Point(fp.x + nx1 * 60, fp.y + nz1 * 60)): nx1, nz1 = -nx1, -nz1
# house frame: local +Z = street side, so world street dir = (sin h, cos h) = -(bay normal)
NICO_HEAD = math.atan2(-nx1, -nz1)
road_off = road_near.width / 2 + 3.5 + 27.0  # half road + sidewalk + the plan's street-side lot depth (lot z1 = 27)
nx_, nz_ = fp.x + nx1 * road_off, fp.y + nz1 * road_off
sh_, ch_ = math.sin(NICO_HEAD), math.cos(NICO_HEAD)
def hl(lx, lz): return (nx_ + lx * ch_ + lz * sh_, nz_ - lx * sh_ + lz * ch_)   # house local -> world (rotation about Y)
lot = Polygon([hl(-24, -14.2), hl(11.4, -14.2), hl(11.4, 27 + 6), hl(-24, 27 + 6)])
W.fill_land(lot.buffer(1.5, join_style=2))
W.reserve(lot.buffer(3), 'reserved')
road_near.name = 'Pelican Point Ln'
for r in W.roads:
    if r is not road_near and r.region == 'Key Largo' and LineString(r.pts).distance(_np) < 60 and r.kind != 'trunk': r.name = 'Pelican Point Ln'
yard = hl(-6.0, 12.0)
log(f'nico house at {nx_:.0f},{nz_:.0f} heading {NICO_HEAD:.2f} (road {road_near.name}, normal {nx1:.2f},{nz1:.2f})')
if KEYS and KEYS.get('nico') and 'heading' in KEYS['nico']:   # the detail places the house exactly (house frame: +Z street side)
    _n = KEYS['nico']; nx_, nz_, NICO_HEAD = _n['x'], _n['z'], _n['heading']; sh_, ch_ = math.sin(NICO_HEAD), math.cos(NICO_HEAD)
    lot = Polygon([hl(-24, -14.2), hl(11.4, -14.2), hl(11.4, 27 + 6), hl(-24, 27 + 6)]); W.reserve(lot.buffer(3), 'reserved')
    yard = (_n['spawnX'], _n['spawnZ']) if 'spawnX' in _n else hl(-6.0, 12.0)
W.setpiece('nico_house', nx_, nz_, NICO_HEAD, note="Nico's stilt house, Pelican Point Ln, Key Largo (bay side)", lot=[[round(x, 1), round(z, 1)] for x, z in list(lot.exterior.coords)[:-1]],
           spawnX=round(yard[0], 1), spawnZ=round(yard[1], 1))
# the Keys welcome sign at the start of the Overseas Highway, and the bar on the strip
ovs = [r for r in W.roads if r.name == 'Overseas Highway']
if ovs:
    nr = min(ovs, key=lambda r: Point(r.pts[0]).distance(Point(*p2w(600, 1180))))
    p0, p1 = nr.pts[0], nr.pts[1]; h = math.atan2(p1[0] - p0[0], p1[1] - p0[1])
    W.setpiece('keys_sign', p0[0] + 14 * math.cos(h), p0[1] - 14 * math.sin(h), h + math.pi, note='Welcome to the Keys sign')
bx, bz = p2w(600, 1312)
W.setpiece('keys_bar', bx, bz, 0.6, note='Keys roadside bar')

# ---------------------------------------------------------------- 9. buildings: city blocks from the traced street grid
log('blocks')
from shapely.ops import polygonize
road_lines = unary_union([LineString(r.pts) for r in W.roads if not r.bridge])
blocks = [b for b in polygonize(road_lines) if 400 < b.area < 600000]
road_buf = unary_union([LineString(r.pts).buffer(r.width / 2 + 3.2, cap_style=2, join_style=2) for r in W.roads if not r.bridge])
water_u = unary_union([w['poly'] for w in W.water])
runway_u = unary_union([a['poly'] for a in W.areas if a['kind'] in ('runway', 'apron')])
PROFILE = {   # kind: (lot frontage m, lot depth max m, setback m, height range m, style, zone, building kind, fill)
    'core':    (32, 55, 2.0, (40, 200), 'tower', 'commercial', 'office', 0.96),
    'city':    (22, 40, 2.5, (7, 40), 'midrise', 'residential', 'apartments', 0.95),
    'beach':   (20, 34, 2.5, (10, 21), 'deco', 'commercial', 'hotel', 0.96),
    'port':    (60, 90, 6.0, (9, 16), 'industrial', 'port', 'warehouse', 0.85),
    'islands': (40, 50, 8.0, (7, 10), 'house', 'residential', 'house', 0.8),
    'suburb':  (22, 32, 5.0, (4.5, 7.5), 'house', 'residential', 'house', 0.95),
    'town':    (20, 30, 4.5, (4.5, 8.0), 'house', 'residential', 'house', 0.95),
    'keys':    (18, 26, 3.5, (5.5, 8.5), 'stilt', 'residential', 'house', 0.9),
    'airport': (70, 90, 8.0, (10, 18), 'hangar', 'airport', 'hangar', 0.4),
}
# main streets (towns: 1-2 storey shop rows face these; side streets keep houses)
main_buf = unary_union([LineString(r.pts).buffer(r.width / 2 + 24, cap_style=2) for r in W.roads if not r.bridge and r.kind in ('trunk', 'primary', 'secondary')])
def split_lots(poly, front, depth, out, depthc=0):
    """Recursive oriented split until each piece is at most `front` wide and `depth` deep."""
    if poly.is_empty or poly.area < 60: return
    mrr = poly.minimum_rotated_rectangle; c = list(mrr.exterior.coords)
    e1 = math.dist(c[0], c[1]); e2 = math.dist(c[1], c[2])
    long_, short_ = (e1, e2) if e1 >= e2 else (e2, e1)
    if (short_ <= depth * 1.05 and long_ <= front * 1.25) or depthc > 12:
        out.append(poly); return
    # split across the long side (or the short side when the lot is too deep)
    a, b = (c[0], c[1]) if e1 >= e2 else (c[1], c[2])
    if long_ <= front * 1.25: a, b = (c[1], c[2]) if e1 >= e2 else (c[0], c[1])
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2; ux, uz = (b[0] - a[0]), (b[1] - a[1]); L = math.hypot(ux, uz) or 1; ux /= L; uz /= L
    R = 2000
    half = Polygon([(mx - uz * R, mz + ux * R), (mx + uz * R, mz - ux * R), (mx + uz * R - ux * R, mz - ux * R - uz * R), (mx - uz * R - ux * R, mz + ux * R - uz * R)])
    for part in (poly.intersection(half), poly.difference(half)):
        for g in geoms(part):
            if g.geom_type == 'Polygon': split_lots(g, front, depth, out, depthc + 1)
TOWER_CORE = [p2w(737, 790), p2w(705, 950)]
nb_ = 0; perdist = {}
rb = rng('buildings')
for blk in blocks:
    c = blk.representative_point(); dist, dkind = district_of(*w2p(c.x, c.y))
    if dkind not in PROFILE: continue
    front, depth, setback, (h0, h1), style, zone, bkind, fill = PROFILE[dkind]
    inner = blk.difference(road_buf).difference(water_u).difference(runway_u).intersection(land)
    if inner.is_empty or inner.area < 150: continue
    # city blocks are paved right up to the buildings (no lawn at downtown corners); small towns keep their yards
    if dkind in ('core', 'city', 'beach', 'port'):
        for g_ in geoms(inner):
            if g_.geom_type == 'Polygon' and g_.area > 40: W.add_area(g_.buffer(0.6, join_style=2).intersection(blk), 'plaza' if dkind != 'port' else 'paved', None)
    lots = []
    for g in geoms(inner):
        if g.geom_type == 'Polygon': split_lots(g, front, depth, lots)
    for lt in lots:
        if lt.area < 90 or rb.random() > fill: continue
        fp = lt.buffer(-setback, join_style=2)
        if fp.is_empty: continue
        fp = max(geoms(fp), key=lambda g: g.area)
        if fp.area < 40: continue
        fp = fp.simplify(0.6)
        # height: towers concentrate near the downtown and Brickell cores (podium towers among mid- and low-rise blocks)
        lc = fp.centroid; bz_ = zone; bk_ = bkind
        if dkind == 'core':
            dcore = min(math.dist((lc.x, lc.y), t) for t in TOWER_CORE)
            k = max(0.0, 1.0 - dcore / 900.0)
            r_ = rb.random()
            if r_ < 0.05 + 0.65 * k ** 1.4 and fp.area > 500:
                h = 48 + (h1 - 48) * (k ** 1.15) * (0.3 + 0.7 * rb.random()) * (1.25 if rb.random() < 0.12 else 1.0)
                st = 'tower'
            elif r_ < 0.8:
                h = rb.uniform(14, 38); st = 'midrise'
            else:
                h = rb.uniform(6, 13); st = 'strip'; bk_ = 'retail'
        elif dkind == 'beach':
            # Miami Beach: 3-6 floor Art Deco hotels on the ocean blocks, a few condo towers, 2-4 floor deco apartments inland
            ocean = any(water_u.contains(Point(lc.x + d_, lc.y)) for d_ in (45, 90, 140, 190))
            r_ = rb.random()
            if ocean and r_ < 0.07 and fp.area > 450: h = rb.uniform(55, 125); st = 'tower'; bk_ = 'apartments'; bz_ = 'residential'
            elif ocean: h = rb.uniform(10.5, 20.5); st = 'deco'
            elif r_ < 0.08: h = rb.uniform(18, 32); st = 'midrise'; bk_ = 'apartments'
            else: h = rb.uniform(7, 14); st = 'deco'; bk_ = 'apartments' if rb.random() < 0.6 else 'hotel'
        elif dkind == 'city':
            r_ = rb.random()
            if r_ < 0.5: h = rb.uniform(7, 13); st = 'lowrise'; bz_ = 'commercial' if rb.random() < 0.45 else zone
            elif r_ < 0.9: h = rb.uniform(14, 27); st = 'midrise'
            else: h = rb.uniform(30, 44); st = 'midrise'
        elif (dkind == 'town' or (dkind == 'suburb' and rb.random() < 0.3)) and main_buf.contains(lc):
            h = rb.uniform(4.2, 7.6); st = 'strip'; bz_ = 'commercial'; bk_ = 'retail'
        else:
            h = rb.uniform(h0, h1); st = style
        ring = [(round(x, 2), round(z, 2)) for x, z in list(fp.exterior.coords)[:-1]]
        if len(ring) < 3: continue
        b = W.building(ring, h, bk_ if st != 'tower' or bk_ == 'apartments' else 'office', st, bz_, region=dist or '', check=False)
        if b: nb_ += 1; perdist[dist] = perdist.get(dist, 0) + 1
log(f'buildings {nb_}: ' + ', '.join(f'{k} {v}' for k, v in sorted(perdist.items(), key=lambda kv: -kv[1])[:16]))
# keep lots off Nico's yard
_resv = lot.buffer(6)
W.buildings = [b for b in W.buildings if not Polygon(b['ring']).intersects(_resv)]

if KEYS:
    W.buildings = [b for b in W.buildings if not KREG.intersects(Polygon(b['ring']))]
    for b in KEYS.get('buildings', []):
        W.building(b['ring'], b.get('h', 6.5), b.get('kind', 'house'), b.get('style', 'stilt'), b.get('zone', 'residential'), name=b.get('name'), poi=b.get('poi'), region='Key Largo', check=False)
    if KEYS.get('keysBar'):
        W.setpieces = [p for p in W.setpieces if p['id'] != 'keys_bar']; _kb = KEYS['keysBar']; W.setpiece('keys_bar', _kb['x'], _kb['z'], _kb.get('heading', 0.0), note='Keys roadside bar')
# ---------------------------------------------------------------- 10. street furniture, lamps, trees
try:
    sig, stops = G.street_furniture(W)
    lamps = G.lamps_along(W, [r for r in W.roads if r.kind in ('trunk', 'primary', 'secondary', 'tertiary', 'residential') and r.region != 'rural' and r.tags.get('style') != 'keys_lane'])
    # traffic lights and stop signs come from the road graph's controls at run time (tools/osm roads.controls): no duplicates
    W.props = [p for p in W.props if p.get('type') not in ('signal', 'stop', 'crossing')]
    log(f'stops {stops}, lamps {lamps} (signal props dropped: the graph has the controls)')
except Exception:
    W.log.append('furniture ' + traceback.format_exc()[-400:]); log('furniture failed', W.log[-1][-200:])

# ---------------------------------------------------------------- 9. export
def ring(c): return [[round(x, 2), round(z, 2)] for x, z in list(c)[:-1]]
def polyd(p, **kw):
    d = dict(kw); d['outer'] = ring(p.exterior.coords); d['holes'] = [ring(h.coords) for h in p.interiors]; return d
PAL = dict(sand=[226, 205, 160], shallow=[64, 196, 196])
DISTRICTS = []
for (ax, ay), nm, kind, rad in ANCHORS:
    x, z = p2w(ax, ay)
    DISTRICTS.append(dict(name=nm, kind=kind, x=round(x), z=round(z), r=round(rad * S), outer=ring(Point(x, z).buffer(rad * S, 16).exterior.coords)))
land_out = [polyd(g.simplify(1.5), id=f'l{i + 1}') for i, g in enumerate(geoms(W.land)) if g.geom_type == 'Polygon' and g.area > 60]
CELLH = 16.0
hx0, hz0 = BOUNDS['minX'], BOUNDS['minZ']
hnx, hnz = int(math.ceil((BOUNDS['maxX'] - hx0) / CELLH)), int(math.ceil((BOUNDS['maxZ'] - hz0) / CELLH))
HEIGHTS = np.zeros((hnz, hnx), np.int16)
HEIGHTS.tofile(os.path.join(OUT, 'heights.bin'))
TRANSFORM = dict(image='docs/v2/plan/map_roads_target.webp', size=[IW, IH], metersPerPixel=S, x0=-OX * S, z0=-OY * S, formula='x = x0 + mpp * px; z = z0 + mpp * py',
                 colourImage='docs/v2/plan/map_colour_target.webp', colourFromRoads=dict(s=REG['s'], tx=REG['tx'], ty=REG['ty']))
places = [dict(name=nm, kind=('town' if kind in ('town', 'keys') else 'airport' if kind == 'airport' else 'district'), x=round(p2w(ax, ay)[0]), z=round(p2w(ax, ay)[1]), r=round(rad * S)) for (ax, ay), nm, kind, rad in ANCHORS]
places += [dict(name=nm, kind='region', x=round(p2w(ax, ay)[0]), z=round(p2w(ax, ay)[1]), r=round(rad * S)) for (ax, ay), nm, kind, rad in REGIONS_RURAL]
for nm_, k_, (px_, py_), r_ in [('Biscayne Bay', 'bay', (820, 800), 180), ('Atlantic Ocean', 'sea', (1000, 700), 600), ('Gulf of Mexico', 'sea', (60, 700), 700),
                                 ('Florida Bay', 'bay', (420, 1250), 350), ('Charlotte Harbor', 'bay', (250, 500), 150)]:
    places.append(dict(name=nm_, kind=k_, x=round(p2w(px_, py_)[0]), z=round(p2w(px_, py_)[1]), r=round(r_ * S)))
if LAKE is not None: places.append(dict(name='Lake Okeechobee', kind='lake', x=round(LAKE.centroid.x), z=round(LAKE.centroid.y), r=round(math.sqrt(LAKE.area / math.pi))))
feat = dict(version=4, generator='tools/v2/map3/build_v3.py (traced from docs/v2/plan/map_roads_target.webp)', bounds=BOUNDS, realRect=REAL, imageTransform=TRANSFORM, palette=PAL,
            districts=DISTRICTS, land=land_out,
            water=[polyd(w['poly'].simplify(0.8), id=w['id'], kind=w['kind'], **({'name': w['name']} if w['name'] else {}), depth=w['depth']) for w in W.water if w['poly'].geom_type == 'Polygon'],
            areas=[polyd(a['poly'].simplify(0.8), id=a['id'], kind=a['kind'], **({'name': a['name']} if a['name'] else {})) for a in W.areas if a['poly'].geom_type == 'Polygon' and a['poly'].area > 10],
            shallows=[polyd(p.simplify(4.0), id=f's{i + 1}', colour='#40c4c4') for i, p in enumerate(geoms(SHALLOW))],
            roads=[], paths=W.paths, buildings=W.buildings, pois=W.pois, props=W.props, trees=W.trees, places=places, joins=[], setpieces=W.setpieces, powerlines=W.powerlines,
            heights=dict(file='heights.bin', cell=CELLH, minX=hx0 + CELLH / 2, minZ=hz0 + CELLH / 2, nx=hnx, nz=hnz, unit=0.1))
for r in W.roads:
    d = dict(id=r.id, pts=[list(p) for p in r.pts], kind=r.kind, lanesFwd=r.lf, lanesBack=r.lb, oneway=r.oneway, speedKmh=r.speed, name=r.name, bridge=bool(r.bridge), width=round(r.width, 1), surface=r.surface, layer=r.layer)
    if r.ref: d['ref'] = r.ref
    if r.y: d['y'] = r.y
    if r.tags.get('style'): d['style'] = r.tags['style']
    feat['roads'].append(d)
with open(os.path.join(OUT, 'features.json'), 'w') as f: json.dump(feat, f, separators=(',', ':'))
regions = {d['name']: d['outer'] for d in DISTRICTS}
if LAKE is not None: regions['Lake Okeechobee'] = ring(LAKE.simplify(10).exterior.coords)
layout = dict(version=5, bounds=BOUNDS, realRect=REAL, imageTransform=TRANSFORM, places=places, setpieces=W.setpieces, regions=regions, districts=DISTRICTS, palette=PAL,
              airport=W.extra.get('airport'), airfield=W.extra.get('airfield'), heights=feat['heights'])
os.makedirs(os.path.dirname(LAYOUT_PATH), exist_ok=True)
with open(LAYOUT_PATH, 'w') as f: json.dump(layout, f, separators=(',', ':'))
log(f'export: roads {len(W.roads)} ({sum(plen(r.pts) for r in W.roads) / 1000:.0f} km), bridges {sum(1 for r in W.roads if r.bridge)}, buildings {len(W.buildings)}, water {len(W.water)}, areas {len(W.areas)}, land polys {len(land_out)}')
