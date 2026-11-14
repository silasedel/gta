#!/usr/bin/env python
"""Programmatic audits of tools/world/out/features.json. Writes tools/world/out/audit.json; exit code 1 on hard failures."""
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union
from shapely import STRtree
from shapely.prepared import prep
from wl import real as R
OUT = R.OUT
F = json.load(open(os.path.join(OUT, 'features.json')))
BANNED = ['vice city', 'leonida', 'grassrivers', 'kalaga', 'gellhorn', 'ambrosia', 'watson bay', 'key lento', 'hamlet', 'rusty anchor', 'wonder whale', 'dinka', 'vapid', 'schafter', 'los santos', 'liberty city', 'san andreas', 'rockstar', 'gta']
res = {}
def P(d): return Polygon(d['outer'], d.get('holes') or [])
land = [P(d) for d in F['land']]; water = [P(d) for d in F['water']]; areas = [P(d) for d in F['areas']]
res['invalid_polygons'] = dict(land=sum(not p.is_valid for p in land), water=sum(not p.is_valid for p in water), areas=sum(not p.is_valid for p in areas))
rr = F['realRect']; realbox = sbox(rr['minX'], rr['minZ'], rr['maxX'], rr['maxZ'])
rd = R.load_real()
landU = unary_union([p.buffer(0) for p in land] + ([rd['land']] if rd.get('land') is not None else []))
waterU = unary_union([p.buffer(0) for p in water])
dry = prep(landU.buffer(1.0))
B = F['buildings']; bp = [Polygon(b['ring']) for b in B]
res['buildings'] = len(B); res['invalid_buildings'] = sum(not p.is_valid for p in bp)
res['buildings_in_real_rect'] = sum(p.intersects(realbox) for p in bp)
res['buildings_off_land'] = sum(not dry.contains(p) for p in bp)
wp = prep(waterU)
res['buildings_on_inland_water'] = sum(wp.intersects(p) for p in bp)
roads = F['roads']; rl = [LineString(r['pts']) for r in roads]
ground = [i for i, r in enumerate(roads) if not (r['bridge'] and r.get('layer', 0) > 0)]
rtree = STRtree([rl[i].buffer(roads[i]['width'] / 2) for i in ground])
hits = 0; far = 0
ctree = STRtree(rl)
for p in bp:
    if len(rtree.query(p, predicate='intersects')): hits += 1
    j = ctree.nearest(p)
    if rl[int(j)].distance(p) > 90: far += 1
res['buildings_overlapping_roads'] = hits; res['buildings_farther_than_90m_from_road'] = far
bt = STRtree(bp); ov = 0
for i, p in enumerate(bp):
    for j in bt.query(p, predicate='intersects'):
        if j > i and p.intersection(bp[int(j)]).area > 0.5: ov += 1
res['building_pairs_overlapping'] = ov
# roads over water without bridge
sea = sbox(F['bounds']['minX'], F['bounds']['minZ'], F['bounds']['maxX'], F['bounds']['maxZ']).difference(landU.buffer(0.5)).union(waterU.buffer(-0.5)).difference(realbox)
seap = prep(sea); wetlen = 0; wetn = 0
for r, ln in zip(roads, rl):
    if r['bridge']: continue
    if seap.intersects(ln):
        L = ln.intersection(sea).length
        if L > 3.0: wetn += 1; wetlen += L
res['non_bridge_roads_over_water'] = dict(count=wetn, meters=round(wetlen, 1))
inner = realbox.buffer(-3)
res['road_meters_inside_real_rect'] = round(sum(l.intersection(inner).length for l in rl if l.intersects(inner)), 1)
_cz = landU.boundary.intersection(realbox.boundary.buffer(45)).difference(realbox.buffer(-2))
_n = 0; _mx = 0.0; _where = []
for g_ in (_cz.geoms if hasattr(_cz, 'geoms') else [_cz]):
    if g_.geom_type != 'LineString' or g_.length < 300: continue
    c_ = list(g_.coords); k_ = 0
    while k_ < len(c_) - 1:
        m_ = k_ + 1
        while m_ < len(c_) and LineString(c_[k_:m_ + 1]).length < 300: m_ += 1
        if m_ < len(c_):
            seg = LineString(c_[k_:m_ + 1]); ch = LineString([c_[k_], c_[m_]])
            if max(ch.distance(Point(q_)) for q_ in c_[k_:m_ + 1]) < 6.0 and (abs(c_[k_][0] - c_[m_][0]) < 12 or abs(c_[k_][1] - c_[m_][1]) < 12): _n += 1; _mx = max(_mx, seg.length); _where.append([round(c_[k_][0]), round(c_[k_][1])]); k_ = m_; continue
        k_ += 1
res['straight_coast_runs_over_300m_on_rect_line'] = _n; res['straight_coast_where'] = _where[:6]
# connectivity
par = {}
def find(a):
    while par.setdefault(a, a) != a:
        par[a] = par[par[a]]; a = par[a]
    return a
for r in roads:
    a, b = find(tuple(r['pts'][0])), find(tuple(r['pts'][-1]))
    if a != b: par[a] = b
comp = {}
for r in roads: comp.setdefault(find(tuple(r['pts'][0])), []).append(r['id'])
res['road_components'] = len(comp); res['roads'] = len(roads); res['road_km'] = round(sum(l.length for l in rl) / 1000, 1)
res['road_km_by_kind'] = {}
for r, l in zip(roads, rl): res['road_km_by_kind'][r['kind']] = round(res['road_km_by_kind'].get(r['kind'], 0) + l.length / 1000, 2)
edge = R.edge_summary()
nreal = sum(len(S['roads']) for S in edge['sides'].values()) if edge else None
res['joins'] = len(F['joins']); res['real_edge_roads'] = nreal
ids = {r['id'] for r in roads}; res['joins_with_missing_road'] = sum(j['roadId'] not in ids for j in F['joins'])
# grades
mg = 0; over = 0
for r in roads:
    y = r.get('y')
    if not y: continue
    for (a, b, ya, yb) in zip(r['pts'], r['pts'][1:], y, y[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d > 2:
            g = abs(yb - ya) / d; mg = max(mg, g); over += g > 0.07
res['max_deck_grade'] = round(mg, 3); res['deck_segments_over_7pct'] = int(over)
h = F['heights']; H = np.fromfile(os.path.join(OUT, h['file']), '<i2').reshape(h['nz'], h['nx']) * h['unit']
res['height_max'] = float(H.max()); res['height_max_step_per_cell'] = float(max(np.abs(np.diff(H, axis=0)).max(), np.abs(np.diff(H, axis=1)).max()))
def hat(x, z):
    fx = (x - h['minX']) / h['cell'] - 0.5; fz = (z - h['minZ']) / h['cell'] - 0.5
    i = min(h['nx'] - 2, max(0, int(fx))); j = min(h['nz'] - 2, max(0, int(fz))); u = min(1, max(0, fx - i)); v = min(1, max(0, fz - j))
    return (H[j, i] * (1 - u) + H[j, i + 1] * u) * (1 - v) + (H[j + 1, i] * (1 - u) + H[j + 1, i + 1] * u) * v
from wl.util import resample
tg = 0; tn = 0; tot = 0
for r in roads:
    if r['bridge'] or r['kind'] == 'track': continue
    pts = resample([tuple(p) for p in r['pts']], 32.0)
    for a, b in zip(pts, pts[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d > 20:
            g = abs(hat(*b) - hat(*a)) / d; tg = max(tg, g); tn += g > 0.08; tot += 1
res['max_terrain_road_grade'] = round(float(tg), 3); res['terrain_road_segments_over_8pct'] = int(tn)
st = max(float(np.abs(np.diff(H, axis=0)).max()), float(np.abs(np.diff(H, axis=1)).max())); res['max_step_between_16m_samples'] = round(st, 2)
rs_ = np.random.default_rng(5); gx_ = rs_.uniform(h['minX'] + 20, h['minX'] + h['nx'] * h['cell'] - 20, 200000); gz_ = rs_.uniform(h['minZ'] + 20, h['minZ'] + h['nz'] * h['cell'] - 20, 200000)
res['ground_pairs_2m_step_over_0_8m'] = int(sum(1 for x_, z_ in zip(gx_, gz_) if abs(hat(x_, z_) - hat(x_ + 2, z_)) > 0.8))
fine = 0; fmax = 0.0
for r in roads:
    if r['bridge']: continue
    pts = resample([tuple(p) for p in r['pts']], 8.0)
    hs_ = [hat(*p) for p in pts]
    for (a, b, ha, hb) in zip(pts, pts[1:], hs_, hs_[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d > 0.5:
            g = abs(hb - ha) / d; fmax = max(fmax, g); fine += g > 0.125
res['terrain_road_max_grade_8m'] = round(float(fmax), 3); res['terrain_road_segments_over_12_5pct'] = int(fine)
# names
names = [p['name'] for p in F['places']] + [r['name'] for r in roads if r['name']] + [b.get('name', '') for b in B] + [p.get('name', '') for p in F['pois']] + [a.get('name', '') or '' for a in F['areas']]
res['banned_name_hits'] = sorted({n for n in names if any(b in n.lower() for b in BANNED if b != 'gta') or 'gta' in n.lower().split()})
pn = [p['name'] for p in F['places']]; res['duplicate_place_names'] = sorted({n for n in pn if pn.count(n) > 1})
res['unnamed_public_roads'] = sum(1 for r in roads if not r['name'] and r['kind'] not in ('service', 'motorway_link', 'track'))
res['setpieces'] = [s['id'] for s in F['setpieces']]
res['islands'] = len(land); res['pois'] = len(F['pois']); res['poi_types'] = len({p['type'] for p in F['pois']})
hard = ['invalid_buildings', 'buildings_in_real_rect', 'buildings_off_land', 'buildings_on_inland_water', 'buildings_overlapping_roads', 'building_pairs_overlapping', 'joins_with_missing_road']
res['hard_failures'] = {k: res[k] for k in hard if res[k]}
if res['road_components'] != 1: res['hard_failures']['road_components'] = res['road_components']
if wetn: res['hard_failures']['non_bridge_roads_over_water'] = wetn
if res['road_meters_inside_real_rect'] > 1: res['hard_failures']['road_meters_inside_real_rect'] = res['road_meters_inside_real_rect']
if res['banned_name_hits']: res['hard_failures']['banned'] = res['banned_name_hits']
if res['max_step_between_16m_samples'] > 6.0: res['hard_failures']['max_step_between_16m_samples'] = res['max_step_between_16m_samples']
if res['ground_pairs_2m_step_over_0_8m']: res['hard_failures']['ground_pairs_2m_step_over_0_8m'] = res['ground_pairs_2m_step_over_0_8m']
if res['terrain_road_segments_over_12_5pct']: res['hard_failures']['terrain_road_segments_over_12_5pct'] = res['terrain_road_segments_over_12_5pct']
json.dump(res, open(os.path.join(OUT, 'audit.json'), 'w'), indent=1)
print(json.dumps(res)[:2200])
sys.exit(1 if res['hard_failures'] else 0)
