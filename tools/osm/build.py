#!/usr/bin/env python3
"""Miami OSM -> game data. Run: tools/osm/.venv/bin/python tools/osm/build.py
Inputs: tools/osm/cache/*.json (fetch.py). Outputs: public/assets/miami/*, docs/showcase/map/*.
"""
import hashlib, json, math, os, pickle, sys, time
from collections import defaultdict
import numpy as np
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import STRtree, prepare, contains_xy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from config import BBOX, LAT0, LON0, SEA_LEVEL, TILE, REAL_RECT, FEATURES, proj, bounds  # noqa: E402
from osmgeom import load, pts, elem_poly, way_line, polys_only, fix, parse_len, world_box, CACHE  # noqa: E402
from raster import Grid, dilate, distance_steps, label_fill, rle, X0, Z0, X1, Z1  # noqa: E402
import roads as R  # noqa: E402
import poi as POI  # noqa: E402
import ingest as ING  # noqa: E402

GAME = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_ROOT = os.environ.get('MIAMI_OUT') or os.path.join(GAME, 'public', 'assets', 'miami')
DOCS = os.path.join(GAME, 'docs', 'v2', 'shots', 'world-osm')
WORK = os.environ.get('MIAMI_WORK') or os.path.join(CACHE, 'work')

SURF = ['water', 'asphalt', 'concrete', 'pavers', 'tile', 'sand', 'grass_short', 'grass_long', 'dirt', 'gravel',
        'wood', 'metal', 'sidewalk', 'pier', 'building']
S = {n: i for i, n in enumerate(SURF)}
# V1 zones first (ids unchanged); V2 adds the last three for the synthetic regions
ZONES = ['water', 'beach', 'nightlife', 'downtown', 'business', 'residential', 'commercial', 'park', 'port',
         'causeway', 'industrial', 'airport', 'rural', 'wilderness']
Z = {n: i for i, n in enumerate(ZONES)}
# V1 prop types first (ids unchanged). New types are appended; unknown synthetic prop types are appended at build time.
PROPS = ['tree', 'palm', 'lamp', 'signal', 'bus', 'stop', 'crossing', 'waste', 'fountain', 'bike', 'art', 'hydrant',
         'royal_palm', 'coconut', 'oak', 'pine', 'cypress', 'mangrove', 'citrus', 'gumbo', 'banyan', 'seagrape',
         'yield', 'bench', 'water_tap', 'bike_share', 'recycling', 'vending', 'atm', 'post_box', 'phone', 'ev_charger',
         'shelter', 'toilets', 'beach_shower', 'garage_entrance', 'moto_parking', 'bike_repair', 'photo_booth', 'clock',
         'bbq', 'taxi_stand', 'dumpster', 'emergency_phone', 'life_ring', 'cctv', 'crane', 'mast', 'flagpole', 'buoy',
         'satellite_dish', 'utility_box', 'bollard', 'gate', 'gate_arm', 'toll_booth', 'toll_gantry', 'power_pole',
         'power_tower', 'transformer', 'rail_crossing', 'station_entrance', 'rail_signal', 'buffer_stop', 'info_board',
         'viewpoint', 'monument', 'picnic', 'fitness_station', 'boat_ramp', 'billboard', 'ad_column', 'entrance',
         'elevator', 'speed_camera', 'redlight_camera', 'planter', 'manhole', 'lifeguard']
# land cover classes (4 m raster `cover`, and `cls` of tile areas)
COVER = ['none', 'park', 'grass', 'wild', 'pitch', 'playground', 'sand', 'dirt', 'parking', 'plaza', 'marina', 'island',
         'pool', 'scrub', 'forest', 'pine', 'sawgrass', 'wetland', 'mangrove', 'farmland', 'grove', 'paved', 'apron',
         'runway', 'taxiway', 'campground', 'golf', 'rock', 'gravel', 'dune', 'construction', 'garden', 'cemetery']
CURB = 0.15
PIER_Y = 0.3  # docks: one easy step up from land, low enough to climb onto from the water
Q = 10  # coordinate quantisation: ints in decimetres

T0 = time.time()


def log(*a):
    print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)


def q(v):
    return int(round(v * Q))


def flat(coords):
    out = []
    for x, z in coords:
        out.append(q(x))
        out.append(q(z))
    return out


def ring_flat(c):
    c = list(c)
    if len(c) > 1 and c[0] == c[-1]:
        c = c[:-1]
    return flat(c)


def poly_rec(p, tol=0.0):
    if tol:
        p = p.simplify(tol, preserve_topology=True)
    if p.is_empty or p.geom_type != 'Polygon':
        ps = polys_only(p)
        if not ps:
            return None
        p = max(ps, key=lambda g: g.area)
    p = orient(p, 1.0)
    r = {'p': ring_flat(p.exterior.coords)}
    if p.interiors:
        r['ho'] = [ring_flat(h.coords) for h in p.interiors if len(h.coords) >= 4]
    return r


def hsh(*a):
    return int(hashlib.md5(('|'.join(map(str, a))).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def ll(lat, lon):
    return proj(lon, lat)


# ---------------------------------------------------------------- land
def stage_land():
    path = os.path.join(WORK, 'land.pkl')
    if not os.path.exists(path):
        import land
        land.build_land()
    d = pickle.load(open(path, 'rb'))
    return d


# ---------------------------------------------------------------- areas
def classify_area(t):
    n, lu, le, am = t.get('natural'), t.get('landuse'), t.get('leisure'), t.get('amenity')
    surf = t.get('surface')
    if le in ('swimming_pool',) or am == 'fountain' or t.get('water') in ('swimming_pool', 'fountain', 'reflecting_pool'):
        return 'pool', 'tile'
    if n in ('beach', 'sand') or lu == 'dune':
        return 'sand', 'sand'
    if le == 'pitch' or le in ('track', 'court_area', 'pitch_area'):
        s = {'grass': 'grass_short', 'artificial_turf': 'grass_short', 'sand': 'sand', 'clay': 'dirt',
             'asphalt': 'asphalt', 'concrete': 'concrete', 'acrylic': 'asphalt', 'tartan': 'asphalt',
             'dirt': 'dirt', 'paved': 'asphalt'}.get(surf, 'grass_short')
        return 'pitch', s
    if le == 'golf_course':
        return 'golf', 'grass_short'
    if lu == 'cemetery' or am == 'grave_yard':
        return 'cemetery', 'grass_short'
    if le == 'garden':
        return 'garden', 'grass_short'
    if le in ('park', 'dog_park', 'recreation_ground', 'nature_reserve', 'common') \
            or lu in ('recreation_ground', 'village_green'):
        return 'park', 'grass_short'
    if le == 'playground':
        return 'playground', 'pavers' if surf in ('paving_stones', 'concrete') else 'sand' if surf == 'sand' else 'grass_short'
    if lu in ('grass', 'meadow', 'flowerbed') or n == 'grassland':
        return 'grass', 'grass_short'
    if n == 'wetland':
        return ('mangrove', 'dirt') if t.get('wetland') == 'mangrove' else ('wetland', 'grass_long')
    if n == 'wood' or lu == 'forest':
        return 'forest', 'grass_long'
    if n in ('heath', 'scrub', 'tree_row') or lu in ('greenfield', 'plant_nursery'):
        return 'wild', 'grass_long'
    if n == 'bare_rock':
        return 'rock', 'gravel'
    if lu == 'construction':
        return 'construction', 'dirt'
    if lu == 'brownfield':
        return 'dirt', 'dirt'
    if am == 'parking' and t.get('parking') not in ('multi-storey', 'underground', 'rooftop'):
        return 'parking', 'asphalt'
    if t.get('area:highway') in ('footway', 'pedestrian') or (t.get('highway') == 'pedestrian') or t.get('place') == 'square':
        return 'plaza', 'pavers' if surf not in ('concrete', 'asphalt') else surf
    if t.get('area:highway') == 'traffic_island':
        return 'island', 'grass_short' if surf in (None, 'grass') else 'concrete'
    if le == 'marina' or lu == 'marina':
        return 'marina', 'concrete'
    if lu in ('commercial', 'retail'):
        return 'lu_commercial', None
    if lu in ('industrial', 'port', 'railway', 'military'):
        return 'lu_industrial', None
    if lu == 'residential':
        return 'lu_residential', None
    return None, None


def stage_areas():
    """OSM area features -> land cover areas (cls, surface) and land-use sites (use)."""
    out, sites = [], []
    RB = world_box()
    for e in load('areas'):
        t = e.get('tags', {})
        cls, surf = classify_area(t)
        use = POI.site_use(t)
        if not cls and not use:
            continue
        p = elem_poly(e)
        if p is None or p.area < 4:
            continue
        if not RB.contains(p):
            p = fix(p.intersection(RB))
            if p is None or p.area < 4:
                continue
        if cls:
            out.append(dict(cls=cls, surf=surf, geom=p, name=t.get('name'), area=p.area))
        if use and p.area >= 30:
            c = POI.classify(t) or {}
            sites.append(dict(use=use, geom=p, area=p.area, kind=c.get('kind'), osm=c.get('osm'), sub=c.get('sub'), tier=c.get('tier'),
                              name=t.get('name') if use in ('marina', 'stadium', 'cemetery', 'golf') and False else None,
                              addr=POI.address(t), levels=t.get('building:levels')))
    # pedestrian area highways from highways.json (area=yes)
    for e in load('highways'):
        t = e.get('tags', {})
        if t.get('highway') == 'pedestrian' and t.get('area') == 'yes':
            p = elem_poly(e)
            if p is not None:
                p = fix(p.intersection(RB))
                if p is not None:
                    out.append(dict(cls='plaza', surf='pavers', geom=p, name=t.get('name'), area=p.area))
    log('areas', len(out), dict(sorted(((c, sum(1 for a in out if a['cls'] == c)) for c in {a['cls'] for a in out}))))
    log('sites', len(sites), dict(sorted(((c, sum(1 for a in sites if a['use'] == c)) for c in {a['use'] for a in sites}))))
    return out, sites


def barriers():
    """Fences, walls, hedges and guard rails as lines (tile `bar`)."""
    RB = world_box()
    out = []
    for e in load('areas'):
        t = e.get('tags', {})
        k = t.get('barrier')
        if k not in ('fence', 'wall', 'retaining_wall', 'hedge', 'jersey_barrier', 'guard_rail', 'city_wall', 'handrail', 'chain'):
            continue
        ln = way_line(e)
        if ln is None:
            continue
        g = ln.intersection(RB) if not RB.contains(ln) else ln
        for p_ in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p_.geom_type == 'LineString' and p_.length > 1:
                out.append(dict(kind=k, line=p_.simplify(0.3), h=parse_len(t.get('height')), mat=t.get('material') or t.get('fence_type')))
    return out


# ---------------------------------------------------------------- props
PALM = ('sabal', 'roystonea', 'cocos', 'phoenix', 'washingtonia', 'veitchia', 'wodyetia', 'adonidia', 'palm',
        'dypsis', 'livistona', 'bismarckia', 'ptychosperma', 'thrinax', 'coccothrinax', 'arecaceae', 'pritchardia', 'syagrus')
SPECIES = (('roystonea', 'royal_palm'), ('royal palm', 'royal_palm'), ('cocos', 'coconut'), ('coconut', 'coconut'),
           ('quercus', 'oak'), ('oak', 'oak'), ('pinus', 'pine'), ('pine', 'pine'), ('taxodium', 'cypress'), ('cypress', 'cypress'),
           ('rhizophora', 'mangrove'), ('mangrove', 'mangrove'), ('citrus', 'citrus'), ('bursera', 'gumbo'), ('gumbo', 'gumbo'),
           ('ficus', 'banyan'), ('banyan', 'banyan'), ('coccoloba', 'seagrape'), ('seagrape', 'seagrape'), ('sea grape', 'seagrape'))
AMENITY_PROP = {'waste_basket': 'waste', 'fountain': 'fountain', 'drinking_water': 'water_tap', 'bicycle_parking': 'bike',
                'bicycle_rental': 'bike_share', 'recycling': 'recycling', 'vending_machine': 'vending', 'atm': 'atm',
                'post_box': 'post_box', 'telephone': 'phone', 'charging_station': 'ev_charger', 'shelter': 'shelter',
                'toilets': 'toilets', 'shower': 'beach_shower', 'parking_entrance': 'garage_entrance',
                'motorcycle_parking': 'moto_parking', 'bicycle_repair_station': 'bike_repair', 'photo_booth': 'photo_booth',
                'clock': 'clock', 'bbq': 'bbq', 'taxi': 'taxi_stand', 'waste_disposal': 'dumpster'}
MANMADE_PROP = {'surveillance': 'cctv', 'crane': 'crane', 'tower': 'mast', 'mast': 'mast', 'flagpole': 'flagpole', 'buoy': 'buoy',
                'satellite_dish': 'satellite_dish', 'street_cabinet': 'utility_box', 'planter': 'planter', 'manhole': 'manhole',
                'antenna': 'mast', 'communications_tower': 'mast', 'redlight_camera': 'redlight_camera'}
BARRIER_PROP = {'bollard': 'bollard', 'block': 'bollard', 'gate': 'gate', 'swing_gate': 'gate', 'lift_gate': 'gate_arm',
                'sliding_gate': 'gate', 'toll_booth': 'toll_booth'}
HIGHWAY_PROP = {'street_lamp': 'lamp', 'traffic_signals': 'signal', 'bus_stop': 'bus', 'stop': 'stop', 'give_way': 'yield',
                'crossing': 'crossing', 'toll_gantry': 'toll_gantry', 'elevator': 'elevator', 'speed_camera': 'speed_camera',
                'speed_display': 'speed_camera'}
RAILWAY_PROP = {'level_crossing': 'rail_crossing', 'crossing': 'rail_crossing', 'subway_entrance': 'station_entrance',
                'signal': 'rail_signal', 'buffer_stop': 'buffer_stop'}


def prop_type(t):
    if t.get('natural') == 'tree':
        s_ = ' '.join(str(t.get(k, '')) for k in ('species', 'genus', 'taxon', 'leaf_type', 'species:en', 'taxon:en', 'name')).lower()
        for needle, typ in SPECIES:
            if needle in s_:
                return typ
        return 'palm' if any(p_ in s_ for p_ in PALM) else 'tree'
    hw = (t.get('highway') or '').split(';')[0]
    if hw in HIGHWAY_PROP:
        return HIGHWAY_PROP[hw]
    a = t.get('amenity')
    if a in AMENITY_PROP:
        return AMENITY_PROP[a]
    if t.get('tourism') == 'artwork':
        return 'art'
    if t.get('tourism') == 'information' and t.get('information') in ('board', 'map', 'guidepost'):
        return 'info_board'
    if t.get('tourism') == 'viewpoint':
        return 'viewpoint'
    em = t.get('emergency')
    if em:
        return {'fire_hydrant': 'hydrant', 'phone': 'emergency_phone', 'life_ring': 'life_ring', 'lifeguard': 'lifeguard'}.get(em)
    mm = t.get('man_made')
    if mm in MANMADE_PROP:
        return MANMADE_PROP[mm]
    if t.get('barrier') in BARRIER_PROP:
        return BARRIER_PROP[t['barrier']]
    pw = t.get('power')
    if pw in ('pole', 'tower', 'transformer'):
        return {'pole': 'power_pole', 'tower': 'power_tower', 'transformer': 'transformer'}[pw]
    if t.get('railway') in RAILWAY_PROP:
        return RAILWAY_PROP[t['railway']]
    if t.get('historic') in ('memorial', 'monument'):
        return 'monument'
    le = t.get('leisure')
    if le in ('picnic_table', 'fitness_station', 'slipway'):
        return {'picnic_table': 'picnic', 'fitness_station': 'fitness_station', 'slipway': 'boat_ramp'}[le]
    if t.get('advertising') in ('billboard', 'column', 'board'):
        return 'ad_column' if t['advertising'] == 'column' else 'billboard'
    if t.get('entrance') in ('main', 'yes', 'staircase', 'service', 'home', 'shop', 'garage', 'emergency', 'exit'):
        return 'entrance'
    return None


def prop_id(name):
    if name not in PROPS:
        PROPS.append(name)
    return PROPS.index(name)


# ---------------------------------------------------------------- main
def main():
    os.makedirs(WORK, exist_ok=True)
    rx0, rz0, rx1, rz1 = REAL_RECT
    RB = box(rx0, rz0, rx1, rz1)
    WB = box(X0, Z0, X1, Z1)
    Lr = stage_land()
    # FORMAT v4: inside the rectangle the official picture's land / water wins (citymask.py)
    import citymask as CMK
    CM = CMK.load(FEATURES, Lr['land'], RB, log)
    land_real = CM['land_in'] if CM else fix(Lr['land'].intersection(RB))
    R.MASK, R._mlog = CM, log
    log(f'real land {land_real.area/1e6:.2f} km2 in a {RB.area/1e6:.1f} km2 rectangle; world {WB.area/1e6:.1f} km2')

    # ---- synthetic world (may be absent)
    SY = ING.load(FEATURES, log)
    terrain = ING.terrain_sampler(SY['heights'] if SY else None)
    # the runtime samples the 16 m output grid (origin X0, Z0), not heights.bin (its own origin): resample once here
    # (vectorized) and give roads the very same sampler, so road heights and terrainHeightAt agree exactly
    G16 = Grid(16)
    hgt = np.zeros((G16.H + 1, G16.W + 1), np.int16)
    if SY and SY['heights']:
        H_ = SY['heights']
        d_ = H_['data'].astype(np.float64)
        xs_ = X0 + np.arange(G16.W + 1) * 16.0
        zs_ = Z0 + np.arange(G16.H + 1) * 16.0
        fx = (xs_ - H_['minX']) / H_['cell']
        fz = (zs_ - H_['minZ']) / H_['cell']
        i_ = np.floor(fx).astype(int)
        j_ = np.floor(fz).astype(int)
        okx = (i_ >= 0) & (i_ < H_['nx'] - 1)
        okz = (j_ >= 0) & (j_ < H_['nz'] - 1)
        ic, jc = np.clip(i_, 0, H_['nx'] - 2), np.clip(j_, 0, H_['nz'] - 2)
        u = (fx - ic)[None, :]
        v = (fz - jc)[:, None]
        a00 = d_[jc][:, ic]
        a01 = d_[jc][:, ic + 1]
        a10 = d_[jc + 1][:, ic]
        a11 = d_[jc + 1][:, ic + 1]
        val_ = ((a00 * (1 - u) + a01 * u) * (1 - v) + (a10 * (1 - u) + a11 * u) * v) * H_['unit']
        val_[~(okz[:, None] & okx[None, :])] = 0.0
        inR = ((xs_ >= rx0) & (xs_ <= rx1))[None, :] & ((zs_ >= rz0) & (zs_ <= rz1))[:, None]
        val_[inR] = 0.0
        hgt = np.round(val_ * 10).astype(np.int16)
        log(f'terrain: {int((hgt != 0).sum())} non-zero samples, max {hgt.max() / 10:.1f} m, min {hgt.min() / 10:.1f} m')
        HW_ = G16.W + 1

        def terrain(x, z):
            fx_, fz_ = (x - X0) / 16.0, (z - Z0) / 16.0
            i0, j0 = int(math.floor(fx_)), int(math.floor(fz_))
            if i0 < 0 or j0 < 0 or i0 >= HW_ - 1 or j0 >= G16.H:
                return 0.0
            a, b, c, e = int(hgt[j0, i0]), int(hgt[j0, i0 + 1]), int(hgt[j0 + 1, i0]), int(hgt[j0 + 1, i0 + 1])
            if not (a | b | c | e):
                return 0.0
            uu, vv = fx_ - i0, fz_ - j0
            return ((a * (1 - uu) + b * uu) * (1 - vv) + (c * (1 - uu) + e * uu) * vv) * 0.1
    land = land_real
    inland = list(Lr['water'])           # (geom, name, kind) for map layers
    if CM:
        inland = [w for w in inland if not w[0].intersects(RB) or w[0].intersects(land_real)]
    if SY and SY['land_raw'] is not None:
        sl = fix(SY['land_raw'].difference(RB))
        sw = [w['geom'] for w in SY['water_polys']]
        if sw and sl is not None:
            sl = fix(sl.difference(unary_union(sw)))
        if sl is not None:
            land = fix(unary_union([land_real, sl]).intersection(WB))
        inland += [(w['geom'], w.get('name'), w.get('kind') or 'lake') for w in SY['water_polys']]
        if CM and sw:
            swin = [g_ for g_ in sw if g_.intersects(RB)]
            if swin:
                land = fix(land.difference(unary_union(swin)))
        if CM:
            ol = fix(SY['land_raw'].difference(RB)).buffer(6.0)
            prepare(ol)
            R.OUTSIDE_LAND = ol
        log(f'merged land {land.area/1e6:.2f} km2 ({len(polys_only(land))} pieces)')
    prepare(land)

    def is_water_pt(x, z):
        return not contains_xy(land, x, z)

    areas, sites = stage_areas()
    if CM:
        sites = [s_ for s_ in sites if (lambda rp: CM['keep_pt'](rp.x, rp.y))(s_['geom'].representative_point())]
    clipped = []
    for a in areas:
        g = a['geom']
        if not land_real.contains(g):
            g = fix(g.intersection(land_real))
            if g is None or g.area < 4:
                continue
            a['geom'], a['area'] = g, g.area
        clipped.append(a)
    log(f'areas clipped to land: {len(areas)} -> {len(clipped)}')
    areas = clipped
    if SY:
        for a in SY['areas']:
            g = a['geom']
            if a['cls'] not in ('sand', 'dune', 'mangrove', 'wetland', 'sawgrass') and not land.contains(g):
                g = fix(g.intersection(land))
                if g is None or g.area < 4:
                    continue
                a['geom'], a['area'] = g, g.area
            areas.append(a)
    ww_lines = []
    for e in load('areas'):
        t = e.get('tags', {})
        if t.get('waterway') in ('river', 'canal', 'stream') and t.get('name') and e['type'] == 'way':
            ln = way_line(e)
            if ln is not None:
                ww_lines.append((t['name'], ln))

    # ---- roads first (needed for causeway corridors & nightlife)
    syn_ways = SY['ways'] if SY else []
    stitch_rep = None
    if syn_ways:
        _, _, bnd, _ = R.osm_ways()
        extra, stitch_rep = R.stitch(syn_ways, bnd, log)
        syn_ways = syn_ways + extra
        if CM:
            rw_ = R.osm_ways()[0]
            syn_ways = syn_ways + CMK.causeway_ways(CM, rw_, syn_ways, lambda x, z: contains_xy(land, x, z), log)
        # bay crossings the synthetic layout lacks (Julia Tuttle / I-195), from the real centerlines; corridor cleared of lots
        import causeways as CWY
        _cw_ways, _cw_cor = CWY.julia_tuttle(syn_ways, lambda x, z: contains_xy(land, x, z), log)
        syn_ways = syn_ways + _cw_ways
        CWY.clear_corridor(SY, _cw_cor, log)
        ING.node_roads(syn_ways, log)
    nodes, edges, ginfo = R.build_graph(is_water_pt, syn_ways, terrain if SY and SY['heights'] else None, log)
    for i, e in enumerate(edges):
        e['id'] = i
        e['line'] = LineString(e['pts'])
    # real roads kept just outside the rectangle (they tie clipped streets back to the network) need real ground under them
    outs = [e['line'].buffer(e['w'] / 2 + 14) for e in edges if e.get('outside')]
    if outs:
        strip = fix(unary_union(outs).intersection(SY['land_raw'] if (CM and SY and SY['land_raw'] is not None) else Lr['land']).difference(RB))
        if strip is not None:
            land = fix(unary_union([land, strip]).intersection(WB) if WB.area > RB.area + 1 else unary_union([land, strip]))
            prepare(land)
            log(f'land under {len(outs)} real road edges outside the rectangle: +{strip.area/1e4:.1f} ha')
    turn_no, turn_via = R.restrictions(nodes, edges, ginfo)
    signal_nodes, exits = R.controls(nodes, edges)
    fws = R.footways()
    piers = R.piers()
    rails = R.rails()
    bars = barriers()
    if SY:
        fws += SY['fws']
        piers += SY['piers']
    log(f'graph nodes {len(nodes)} edges {len(edges)}; footways {len(fws)}; piers {len(piers)}; rails {len(rails)}; barriers {len(bars)}')

    # ---- districts
    import districts as D
    G8, dlab, dnames, land8, corrM = D.stage_districts(land, land_real, edges, ww_lines, SY)
    log('districts', dnames)
    xs8 = X0 + (np.arange(G8.W) + 0.5) * 8
    zs8 = Z0 + (np.arange(G8.H) + 0.5) * 8
    inReal8 = ((xs8 >= rx0) & (xs8 < rx1))[None, :] & ((zs8 >= rz0) & (zs8 < rz1))[:, None]
    # cells the real data owns: inside the rectangle and not on the picture's added land (that land takes synthetic zones,
    # like the land just outside, so zones and land use do not change along the rectangle line)
    realOwn8 = inReal8 & ~G8.mask(CM['added']) if (CM and CM.get('added') is not None) else inReal8

    # ---- zones (8 m)
    zlab = np.full(dlab.shape, Z['residential'], np.uint8)
    zlab[land8 & ~realOwn8] = Z['rural']
    zlab[~land8] = Z['water']
    for a in areas:
        if a['cls'] == 'lu_commercial':
            zlab[G8.mask(a['geom']) & land8] = Z['commercial']
        elif a['cls'] == 'lu_industrial':
            zlab[G8.mask(a['geom']) & land8] = Z[a.get('zone') or 'industrial']
        elif a['cls'] in ('lu_residential', 'lu_airport') and a.get('zone'):
            zlab[G8.mask(a['geom']) & land8] = Z[a['zone']]
    # synthetic land cover -> zones (grouped per zone for speed)
    zgroups = defaultdict(list)
    for a in areas:
        if a.get('synthetic') and a.get('zone') and not a['cls'].startswith('lu_'):
            zgroups[a['zone']].append(a['geom'])
    for zn in ('wilderness', 'rural', 'park', 'beach', 'airport'):
        if zgroups.get(zn):
            zlab[G8.mask(zgroups[zn]) & land8 & ~realOwn8] = Z[zn]
    # towns of the synthetic world: the zone each building was authored with spreads ~30 m around it (streets, yards)
    if SY:
        bz = defaultdict(list)
        for b in SY['buildings']:
            if b.get('zone') in ('residential', 'commercial', 'industrial', 'airport', 'port'):
                bz[b['zone']].append(b['geom'])
        for zn in ('residential', 'industrial', 'airport', 'port', 'commercial'):
            if bz.get(zn):
                m = dilate(G8.mask(bz[zn]), 4) & land8 & ~realOwn8
                zlab[m & np.isin(zlab, [Z['rural'], Z['wilderness'], Z['residential']] if zn != 'airport' else [Z['rural']])] = Z[zn]
    if CM:
        # seam: past the rectangle line the real city's default zone fades out along an irregular, noisy edge
        # (120 to 500 m out), so no zone or land use change follows the straight rectangle line
        pad_ = 560.0
        ia, ib = max(0, int((rx0 - pad_ - X0) // 8)), min(G8.W, int((rx1 + pad_ - X0) // 8) + 1)
        ja, jb = max(0, int((rz0 - pad_ - Z0) // 8)), min(G8.H, int((rz1 + pad_ - Z0) // 8) + 1)
        xs_w, zs_w = xs8[ia:ib], zs8[ja:jb]
        dx_ = np.maximum(np.maximum(rx0 - xs_w, xs_w - rx1), 0)[None, :]
        dz_ = np.maximum(np.maximum(rz0 - zs_w, zs_w - rz1), 0)[:, None]
        dist_ = np.sqrt(dx_ * dx_ + dz_ * dz_)
        rng_ = np.random.default_rng(11)
        co = rng_.random(((jb - ja) // 12 + 3, (ib - ia) // 12 + 3)).astype(np.float32)
        fx_ = np.arange(ib - ia) / 12.0
        fz_ = np.arange(jb - ja) / 12.0
        i0_, j0_ = fx_.astype(int), fz_.astype(int)
        u_, v_ = (fx_ - i0_)[None, :], (fz_ - j0_)[:, None]
        rows = co[:, i0_] * (1 - u_) + co[:, i0_ + 1] * u_
        nz_ = rows[j0_, :] * (1 - v_) + rows[j0_ + 1, :] * v_
        reach_ = 120.0 + 380.0 * nz_
        sub = zlab[ja:jb, ia:ib]
        m_ = (dist_ > 0) & (dist_ < reach_) & land8[ja:jb, ia:ib] & (sub == Z['rural'])
        sub[m_] = Z['residential']
        log(f'citymask: seam: {int(m_.sum())} rural cells just outside the rectangle take the city zone (noisy 120 to 500 m edge)')
    pois_raw = [e for e in load('pois') if e.get('tags')]
    cnt = np.zeros(dlab.shape, np.float32)
    for e in pois_raw:
        t = e['tags']
        if 'shop' in t or t.get('amenity') in ('restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'nightclub', 'bank', 'pharmacy'):
            x, z = proj(e.get('lon', e.get('center', {}).get('lon', 0)), e.get('lat', e.get('center', {}).get('lat', 0)))
            if rx0 <= x < rx1 and rz0 <= z < rz1:
                i, j = G8.cell(x, z)
                cnt[j, i] += 1
    for p_ in (SY['pois'] if SY else []):
        i, j = G8.cell(p_['x'], p_['z'])
        cnt[j, i] += 1
    k = 9
    cs = np.cumsum(np.cumsum(np.pad(cnt, ((k // 2 + 1, k // 2), (k // 2 + 1, k // 2))), 0), 1)
    box9 = cs[k:, k:] - cs[:-k, k:] - cs[k:, :-k] + cs[:-k, :-k]
    zlab[(box9 >= 4) & land8 & np.isin(zlab, [Z['residential'], Z['rural']])] = Z['commercial']
    dn = {n: i for i, n in enumerate(dnames)}
    for n, zn in (('Downtown', 'downtown'), ('Arts & Entertainment District', 'downtown'), ('Brickell', 'business'),
                  ('Brickell Key', 'business'), ('PortMiami', 'port'), ('Watson Island', 'park'),
                  ('MacArthur Causeway', 'causeway'), ('Venetian Causeway', 'causeway'), ('Port Boulevard', 'causeway'),
                  ('Julia Tuttle Causeway', 'causeway'), ('Rickenbacker Causeway', 'causeway')):
        if n in dn:
            zlab[(dlab == dn[n]) & land8 & inReal8] = Z[zn]
    zlab[corrM & ~land8] = Z['causeway']
    for a in areas:
        if a.get('synthetic'):
            continue
        if a['cls'] in ('park', 'pitch', 'playground', 'golf', 'cemetery', 'garden') and a['area'] >= 1500 or (a['cls'] == 'grass' and a['area'] >= 6000):
            m = G8.mask(a['geom']) & land8
            zlab[m & (zlab != Z['port'])] = Z['park']
    sobe = np.isin(dlab, [dn.get(n, -1) for n in ('South Beach', 'South of Fifth', 'Collins Park', 'Mid-Beach', 'Bayshore')])
    z5, z16 = ll(25.7735, LON0)[1], ll(25.7905, LON0)[1]
    nl = [e['line'] for e in edges if e['name'] in ('Ocean Drive', 'Collins Avenue', 'Washington Avenue') and not e.get('synthetic')]
    nl2 = [e['line'] for e in edges if e['name'] in ('Española Way', 'Espanola Way', 'Lincoln Road') and not e.get('synthetic')]
    nl2 += [f['line'] for f in fws if f.get('name') in ('Lincoln Road', 'Española Way', 'Lincoln Road Mall')]
    band = ((zs8 < z5) & (zs8 > z16))[:, None]
    if nl and nl2:
        nmask = (G8.mask(unary_union(nl).buffer(70)) & band) | G8.mask(unary_union(nl2).buffer(45))
        zlab[nmask & sobe & land8 & (zlab != Z['park'])] = Z['nightlife']
    sand8 = G8.mask([a['geom'] for a in areas if a['cls'] in ('sand', 'dune')]) & land8
    beachParks = [a['geom'] for a in areas if a['cls'] == 'park' and a['name'] in ('Lummus Park', 'Marjory Stoneman Douglas Ocean Beach Park')]
    zlab[dilate(sand8, 1) & land8] = Z['beach']
    if beachParks:
        zlab[G8.mask(beachParks) & land8 & sobe] = Z['beach']
    log('zones', {n: int((zlab == i).sum()) for i, n in enumerate(ZONES)})

    def zone_at(x, z):
        i, j = G8.cell(x, z)
        return int(zlab[j, i])

    def dist_at(x, z):
        i, j = G8.cell(x, z)
        return int(dlab[j, i])

    # ---- buildings
    bl = stage_buildings(zone_at, sites)
    if CM:
        n_ = len(bl)
        bl = [b for b in bl if (lambda rp: CM['keep_pt'](rp.x, rp.y))(b['geom'].representative_point())]
        log(f'citymask: real buildings on the picture water dropped: {n_ - len(bl)} of {n_}')
    if SY:
        n0 = len(bl)
        for b in SY['buildings']:
            zn = Z.get(b.pop('zone', None))
            rp = b['geom'].representative_point()
            b['zn'] = zn if zn is not None else zone_at(rp.x, rp.y)
            b['geom'] = orient(b['geom'].simplify(0.05, preserve_topology=True), 1.0)
            c = None
            if b.get('poi'):
                c = POI.classify({'shop': b['poi']}) if b['poi'] not in POI.AMENITY_KIND and b['poi'] not in POI.AMENITY_USE else POI.classify({'amenity': b['poi']})
            b['use'] = (c or {}).get('use') or POI.BUILDING_USE.get(b['typ'])
            b['id'] = n0 + len(bl) - n0
            bl.append(b)
        for i, b in enumerate(bl):
            b['id'] = i
    ground_b = [b for b in bl if b['mh'] < 0.5]
    btree = STRtree([b['geom'] for b in ground_b])
    log(f'buildings {len(bl)} (ground {len(ground_b)}), tallest {max(b["h"] for b in bl):.0f} m')

    # ---- sidewalks / carriageways
    carr_lines = [e['line'].buffer(e['w'] / 2, quad_segs=4) for e in edges if e['y'] is None or e.get('tr')]
    carriage = unary_union(carr_lines)
    log('carriage union done')
    sw_edges = []
    outer = []
    NO_SW_ZONES = ('port', 'water', 'wilderness', 'airport')
    for e in edges:
        if (e['y'] is not None and not e.get('tr')) or e['kind'] not in R.SIDEWALK_KINDS:
            continue
        if e['kind'] == 'trunk' and e['name'] in ('MacArthur Causeway',):
            continue
        if e.get('sidewalk') in ('no', 'none', 'separate') and e.get('sidewalk') != 'separate':
            continue
        mid = e['line'].interpolate(0.5, normalized=True)
        zn = ZONES[zone_at(mid.x, mid.y)]
        if zn in NO_SW_ZONES:
            continue
        if e.get('synthetic') and e.get('sidewalk') not in ('yes', 'both', 'left', 'right') and (zn in ('rural', 'industrial') or e['kind'] in ('trunk', 'primary') and zn not in ('commercial', 'downtown', 'business')):
            continue
        sw = {'downtown': 3.4, 'business': 3.4, 'nightlife': 3.2, 'commercial': 3.0, 'beach': 3.0}.get(zn, 2.2)
        e['sw'] = sw
        sw_edges.append(e)
        outer.append(e['line'].buffer(e['w'] / 2 + sw, quad_segs=4))
    outerU = unary_union(outer)
    bunion = unary_union([b['geom'] for b in ground_b])
    sidewalk = outerU.difference(carriage).intersection(land).difference(bunion)
    sw_polys = [p.simplify(0.25, preserve_topology=True) for p in polys_only(sidewalk) if p.area > 3]
    sw_polys = [p for p in sw_polys if p.is_valid and not p.is_empty]
    log(f'sidewalk polys {len(sw_polys)} area {sum(p.area for p in sw_polys)/1e6:.3f} km2')
    swtree = STRtree(sw_polys)
    ped_lines = []
    for e in sw_edges:
        off = e['w'] / 2 + e['sw'] / 2
        for side in (1, -1):
            try:
                oc = e['line'].offset_curve(side * off, quad_segs=4, join_style='mitre', mitre_limit=2.0)
            except Exception:  # noqa: BLE001
                continue
            if oc.is_empty:
                continue
            cands = swtree.query(oc)
            if not len(cands):
                continue
            g = oc.intersection(unary_union([sw_polys[k].buffer(0.3) for k in cands]))
            for p in (g.geoms if hasattr(g, 'geoms') else [g]):
                if p.geom_type == 'LineString' and p.length >= 6:
                    p = p.simplify(0.5)
                    m = p.interpolate(0.5, normalized=True)
                    ped_lines.append(dict(e=e['id'], side=side, line=p, zn=zone_at(m.x, m.y)))
    log(f'ped sidewalk lines {len(ped_lines)} total {sum(p["line"].length for p in ped_lines)/1000:.1f} km')

    # ---- surface raster (2 m) and land cover raster (4 m)
    G2 = Grid(2)
    land2 = G2.mask(land)
    zup = np.repeat(np.repeat(zlab, 4, 0), 4, 1)[:G2.H, :G2.W]
    surf = np.full((G2.H, G2.W), S['concrete'], np.uint8)
    for zn in ('residential', 'park', 'causeway', 'beach', 'rural'):
        surf[zup == Z[zn]] = S['grass_short']
    surf[zup == Z['wilderness']] = S['grass_long']
    del zup
    order = ['lu_residential', 'farmland', 'grove', 'wild', 'scrub', 'forest', 'pine', 'sawgrass', 'wetland', 'mangrove', 'grass', 'park',
             'golf', 'cemetery', 'garden', 'campground', 'island', 'dirt', 'construction', 'rock', 'gravel', 'parking', 'paved', 'marina',
             'apron', 'taxiway', 'runway', 'pitch', 'playground', 'plaza', 'dune', 'sand', 'pool']
    G4 = Grid(4)
    cover = np.zeros((G4.H, G4.W), np.uint8)
    for cls in order + sorted({a['cls'] for a in areas} - set(order)):
        groups = defaultdict(list)
        for a in areas:
            if a['cls'] == cls and a['surf']:
                groups[a['surf']].append(a['geom'])
        for s_, gs in groups.items():
            surf[G2.mask(gs) & land2] = S[s_]
        allg = [a['geom'] for a in areas if a['cls'] == cls and a['surf']]
        if allg and not cls.startswith('lu_'):
            if cls not in COVER:
                COVER.append(cls)
            cover[G4.mask(allg)] = COVER.index(cls)
    fwsurf = {'concrete': 'concrete', 'asphalt': 'asphalt', 'paving_stones': 'pavers', 'paved': 'concrete', 'sett': 'pavers',
              'brick': 'pavers', 'concrete:plates': 'concrete', 'sand': 'sand', 'wood': 'wood', 'metal': 'metal',
              'unpaved': 'dirt', 'dirt': 'dirt', 'ground': 'dirt', 'compacted': 'gravel', 'gravel': 'gravel', 'grass': 'grass_short',
              'fine_gravel': 'gravel', 'pebblestone': 'gravel', 'earth': 'dirt', 'mud': 'dirt'}
    groups = defaultdict(list)
    for f in fws:
        if f['br'] and f['surface'] != 'wood':
            continue
        s_ = fwsurf.get(f['surface'] or '', 'pavers' if f['kind'] == 'pedestrian' else 'concrete')
        groups[s_].append((f['line'], f['w']))
    for s_, ls in groups.items():
        surf[G2.lines_mask(ls) & land2] = S[s_]
    surf[G2.mask(sw_polys) & land2] = S['sidewalk']
    # carriageways by their real surface (dirt and gravel roads in the synthetic regions)
    rsurf = {'gravel': 'gravel', 'dirt': 'dirt', 'sand': 'sand', 'unpaved': 'dirt', 'ground': 'dirt', 'compacted': 'gravel',
             'fine_gravel': 'gravel', 'concrete': 'concrete', 'grass': 'grass_short', 'paving_stones': 'pavers', 'sett': 'pavers'}
    carrM = G2.mask(carriage) & land2
    surf[carrM] = S['asphalt']
    del carrM
    rgroups = defaultdict(list)
    for e in edges:
        s_ = rsurf.get(e.get('surface') or '') or ('dirt' if e['kind'] == 'track' and not e.get('surface') else None)
        if s_ and (e['y'] is None or e.get('tr')):
            rgroups[s_].append((e['line'], e['w']))
    for s_, ls in rgroups.items():
        surf[G2.lines_mask(ls) & land2] = S[s_]
    bM = G2.mask([b['geom'] for b in ground_b])
    surf[bM] = S['building']
    surf[~land2] = S['water']
    pierM = G2.mask([p['geom'] for p in piers if p['kind'] == 'pier'])
    bwM = G2.mask([p['geom'] for p in piers if p['kind'] != 'pier']) & ~land2
    surf[bwM] = S['gravel']
    surf[pierM & ~bM] = S['pier']
    del bM, pierM, bwM
    cover[~G4.mask(land)] = 0
    log('surface raster', {n: int((surf == i).sum()) for i, n in enumerate(SURF)})

    # ---- seabed depth (8 m), decimetres
    sandG = [a['geom'] for a in areas if a['cls'] in ('sand', 'dune')]
    sand8b = G8.mask(sandG) if sandG else np.zeros_like(land8)
    STEPS = 40
    dL = distance_steps(land8, STEPS) * 8.0
    dS = distance_steps(sand8b & land8, STEPS) * 8.0
    beachy = dS <= dL + 8
    d_beach = np.minimum(0.25 + 0.035 * dL, 5.0)
    d_wall = np.minimum(2.2 + 0.03 * dL, 6.0)
    depth = np.where(beachy, d_beach, d_wall)
    chanL = [ln.buffer(90) for n, ln in ww_lines if n in ('Government Cut', 'Main Channel', "Fisherman's Channel", 'Dodge Island Cut')]
    if chanL:
        chan = G8.mask(chanL)
        depth = np.where(chan & ~land8, np.maximum(depth, np.minimum(4 + 0.05 * dL, 12)), depth)
    rivL = [ln.buffer(60) for n, ln in ww_lines if n in ('Miami River', 'Collins Canal', 'Indian Creek', 'Wagner Creek', 'Seybold Canal')]
    if rivL:
        riv = G8.mask(rivL)
        depth = np.where(riv & ~land8, np.minimum(depth, 4.0), depth)
    if SY:
        # synthetic inland water: explicit depth if given, else by kind
        KD = {'lake': 4.5, 'canal': 2.6, 'river': 3.2, 'pond': 1.8, 'marsh_open': 0.9}
        for w in SY['water_polys']:
            dmax = float(w['depth']) if w.get('depth') else KD.get(w['kind'], 3.0)
            m = G8.mask(w['geom']) & ~land8
            depth = np.where(m, np.minimum(depth, dmax), depth)
    depth[land8] = 0
    depth_dm = np.clip(np.round(depth * 10), 0, 255).astype(np.uint8)
    # ---- water kind (8 m): 0 land, 1 sea, 2 lake, 3 canal, 4 river, 5 pond, 6 marsh
    wkind = np.where(land8, 0, 1).astype(np.uint8)
    WK = {'lake': 2, 'lagoon': 2, 'reservoir': 2, 'basin': 2, 'canal': 3, 'canal_area': 3, 'ditch': 3, 'drain': 3, 'river': 4,
          'riverbank': 4, 'stream': 4, 'pond': 5, 'marsh_open': 6, 'marsh': 6, 'dock': 1, 'harbour': 1, 'water': 2}
    wgroups = defaultdict(list)
    for g_, n_, k_ in inland:
        wgroups[WK.get(k_, 2)].append(g_)
    for code, gs in wgroups.items():
        wkind[G8.mask(gs) & ~land8] = code
    for n_, ln in ww_lines:
        if n_ in ('Miami River', 'Wagner Creek', 'Seybold Canal', 'Collins Canal', 'Tamiami Canal'):
            m = G8.mask(ln.buffer(45)) & ~land8 & (wkind == 1) & inReal8
            wkind[m] = 4 if 'River' in n_ or 'Creek' in n_ else 3

    # ---- terrain heights (16 m, decimetres above y = 0): `hgt`, resampled at the start of main()

    # ---- POIs / props
    pois, props, benches_raw, doors = [], [], [], []
    for e in pois_raw:
        t = e['tags']
        lat = e.get('lat', e.get('center', {}).get('lat'))
        lon = e.get('lon', e.get('center', {}).get('lon'))
        if lat is None:
            continue
        x, z = proj(lon, lat)
        if not (rx0 <= x < rx1 and rz0 <= z < rz1):
            continue
        if CM and not CM['keep_pt'](x, z):
            continue
        pt = prop_type(t)
        if t.get('amenity') == 'bench':
            benches_raw.append((x, z))
        elif pt:
            props.append((prop_id(pt), x, z))
            if pt == 'entrance':
                doors.append((x, z, t.get('entrance')))
        c = POI.classify(t)
        if c and c.get('kind'):
            pois.append(dict(k=c['kind'], x=x, z=z, real=True, osm=c.get('osm'), sub=c.get('sub'), tier=c.get('tier'), use=c.get('use'),
                             addr=POI.address(t), level=c.get('level'), dt=c.get('driveThrough'), os=c.get('outdoorSeating')))
    # shops and amenities mapped as areas (not on the building itself) also count as POIs at their center
    for s_ in sites:
        if s_.get('kind') and s_['use'] not in ('parking', 'parking_garage'):
            rp = s_['geom'].representative_point()
            pois.append(dict(k=s_['kind'], x=rp.x, z=rp.y, real=True, osm=s_.get('osm'), sub=s_.get('sub'), tier=s_.get('tier'),
                             use=s_['use'], addr=s_.get('addr'), site=True))
    # tree rows -> individual trees every ~8 m
    for e in load('areas'):
        t = e.get('tags', {})
        if t.get('natural') == 'tree_row':
            ln = way_line(e)
            if ln is not None:
                typ = prop_type({'natural': 'tree', 'species': t.get('species', ''), 'genus': t.get('genus', ''), 'leaf_type': t.get('leaf_type', '')})
                n = max(2, int(ln.length / 8))
                for i in range(n + 1):
                    p_ = ln.interpolate(i / n, normalized=True)
                    if rx0 <= p_.x < rx1 and rz0 <= p_.y < rz1:
                        props.append((prop_id(typ), p_.x, p_.y))
    if CM:
        props = [p_ for p_ in props if CM['keep_pt'](p_[1], p_[2])]
        benches_raw = [b_ for b_ in benches_raw if CM['keep_pt'](b_[0], b_[1])]
    props_h = []        # props with a heading: (type id, x, z, heading radians)
    if SY:
        for p_ in SY['pois']:
            c = POI.classify({'shop': p_['k']}) if p_['k'] not in POI.AMENITY_KIND and p_['k'] not in POI.AMENITY_USE else POI.classify({'amenity': p_['k']})
            c = c or {'kind': p_['k']}
            pois.append(dict(k=c.get('kind') or p_['k'], x=p_['x'], z=p_['z'], real=False, osm=c.get('osm'), sub=p_.get('sub') or c.get('sub'),
                             tier=p_.get('tier'), use=c.get('use'), syn=True))
        for p_ in SY['props']:
            if p_['type'] == 'bench':
                benches_raw.append((p_['x'], p_['z'], p_.get('heading')))
            elif p_.get('heading') is not None:
                props_h.append((prop_id(p_['type']), p_['x'], p_['z'], float(p_['heading'])))
            else:
                props.append((prop_id(p_['type']), p_['x'], p_['z']))
        for t_ in SY['trees']:
            props.append((prop_id(t_['type']), t_['x'], t_['z']))
    log(f'pois {len(pois)} props {len(props)} (+{len(props_h)} with heading) benches {len(benches_raw)} entrances {len(doors)}')

    # ---- addresses onto buildings that have none
    n_addr = 0
    for e in load('addresses'):
        t = e.get('tags', {})
        ad = POI.address(t)
        if not ad or 'lat' not in e:
            continue
        x, z = proj(e['lon'], e['lat'])
        P = Point(x, z)
        for k in btree.query(P):
            b = ground_b[k]
            if not b.get('addr') and b['geom'].contains(P):
                b['addr'] = ad
                n_addr += 1
                break
    log(f'addresses: {sum(1 for b in bl if b.get("addr"))} buildings have a street address ({n_addr} from address points)')

    # ---- storefronts + lean spots
    named = [e for e in edges if e['name'] and e['kind'] not in ('motorway', 'motorway_link')]
    named_lines = [e['line'] for e in named]
    for f in fws:
        if f['kind'] == 'pedestrian' and f.get('name'):
            named.append(dict(name=f['name'], line=f['line'], id=-1))
            named_lines.append(f['line'])
    ntree = STRtree(named_lines)
    anyroad = [e for e in edges if e['kind'] not in ('motorway', 'motorway_link')]
    atree_r = STRtree([e['line'] for e in anyroad])
    storefronts, lean = stage_storefronts(ground_b, btree, pois, named, ntree, anyroad, atree_r, zone_at, surf, G2, doors)
    benches = []
    alltree_lines = [e['line'] for e in edges] + [f['line'] for f in fws]
    atree = STRtree(alltree_lines)
    for bb in benches_raw:
        x, z = bb[0], bb[1]
        h = 0.0
        if len(bb) > 2 and bb[2] is not None:
            h = float(bb[2])
        else:
            k = atree.query_nearest(Point(x, z), max_distance=30)
            if len(k):
                qp = alltree_lines[int(k[0])].interpolate(alltree_lines[int(k[0])].project(Point(x, z)))
                h = math.atan2(qp.x - x, qp.y - z)
        benches.append(dict(x=x, z=z, heading=h))
    log(f'storefronts {len(storefronts)} ({sum(1 for s in storefronts if s["poi"])} from POIs), lean spots {len(lean)}, benches {len(benches)}')

    # ---- transit (bus stops and routes, people mover, metro, rail)
    import transit as TR
    TR.ON_LAND = CM['keep_pt'] if CM else None
    transit = TR.build(nodes, edges, rails, ginfo, log)

    # ---- player spawn: Ocean Drive west sidewalk near 9th-10th St facing north along the strip
    tx, tz = ll(25.7800, -80.1307)
    best = None
    for pl in ped_lines:
        e = edges[pl['e']]
        if e['name'] != 'Ocean Drive' or e.get('synthetic'):
            continue
        mp = pl['line'].interpolate(pl['line'].project(Point(tx, tz)))
        ep = e['line'].interpolate(e['line'].project(mp))
        if mp.x > ep.x:  # want the west (hotel) side
            continue
        d = mp.distance(Point(tx, tz))
        if best is None or d < best[0]:
            best = (d, mp, pl)
    if best:
        sp = best[1]
        spawn = (sp.x, CURB, sp.y)
    else:
        spawn = (tx, CURB, tz)
    spawnHeading = math.pi  # facing north (-Z) along Ocean Drive: deco hotels on the left, Lummus Park + beach on the right
    log('spawn', spawn, 'dist', best[0] if best else None)
    places = list(SY['places']) if SY else []
    synth_other = SY.get('other', {}) if SY else {}
    setpieces = list(SY['setpieces']) if SY else []
    extra_areas = SY['extra_areas'] if SY else []
    synth_issues = SY['issues'] if SY else []
    has_synth = bool(SY)
    props_list, cover_names = list(PROPS), list(COVER)

    # ---- write everything
    write_outputs(locals())


DEFAULT_KINDS = {
    'nightlife': ['bar', 'restaurant', 'cafe', 'clothes', 'gift', 'nightclub', 'ice_cream', 'convenience', 'liquor'],
    'beach': ['cafe', 'gift', 'ice_cream', 'convenience', 'restaurant'],
    'downtown': ['cafe', 'convenience', 'pharmacy', 'bank', 'clothes', 'restaurant', 'fast_food', 'electronics', 'jewelry'],
    'business': ['cafe', 'restaurant', 'bank', 'pharmacy', 'convenience', 'clothes', 'fast_food'],
    'commercial': ['convenience', 'restaurant', 'fast_food', 'clothes', 'liquor', 'salon', 'pharmacy', 'hardware'],
}
# storefront kind for a building whose land use is known but that has no POI node of its own
USE_KIND = {'fuel': 'fuel', 'hotel': 'hotel', 'supermarket': 'supermarket', 'car_dealer': 'car', 'car_repair': 'car_repair',
            'car_wash': 'car_wash', 'car_rental': 'car_rental', 'laundromat': 'laundry', 'gym': 'gym', 'bank': 'bank',
            'pharmacy': 'pharmacy', 'restaurant': 'restaurant', 'fast_food': 'fast_food', 'cafe': 'cafe', 'bar': 'bar',
            'nightclub': 'nightclub', 'cinema': 'cinema', 'theatre': 'theatre', 'clinic': 'clinic', 'post_office': 'post_office',
            'mall': 'mall', 'museum': 'museum', 'library': 'library', 'veterinary': 'veterinary', 'storage': 'storage_rental',
            'police': 'police', 'fire_station': 'fire_station', 'hospital': 'hospital', 'school': 'school', 'university': 'university',
            'worship': 'worship', 'courthouse': 'courthouse', 'townhall': 'townhall', 'community': 'community',
            'kindergarten': 'childcare', 'childcare': 'childcare', 'marina': 'marina', 'arts': 'gallery', 'venue': 'venue',
            'convention': 'venue', 'cruise_terminal': 'cruise_terminal', 'ferry_terminal': 'ferry_terminal', 'station': 'station',
            'office': 'office', 'nursing_home': 'nursing_home', 'social': 'social'}


def stage_buildings(zone_at, sites):
    out = []
    parts = []
    els = load('buildings')
    B = world_box()
    for e in els:
        t = e.get('tags', {})
        g = elem_poly(e)
        if g is None or g.area < 6:
            continue
        rp = g.representative_point()
        if not B.contains(rp):
            continue
        rec = dict(t=t, geom=g, part='building:part' in t and 'building' not in t)
        (parts if rec['part'] else out).append(rec)
    ptree = STRtree([p['geom'] for p in parts]) if parts else None
    res = []

    def heights(t, g, zn, default_type):
        h = parse_len(t.get('height')) or parse_len(t.get('building:height'))
        lv = None
        try:
            lv = float(str(t.get('building:levels')).split(';')[0]) if t.get('building:levels') else None
        except ValueError:
            lv = None
        mh = parse_len(t.get('min_height')) or 0.0
        if not mh and t.get('building:min_level'):
            try:
                mh = float(t['building:min_level']) * 3.2
            except ValueError:
                pass
        src = 'tag'
        if not h and lv:
            h = lv * 3.2 + (1.0 if lv <= 3 else 2.0)
            src = 'levels'
        if not h:
            h = default_height(default_type, zn, g.area, g)
            src = 'default'
        h = min(h, 400)
        if h < mh + 2:
            h = mh + 2.5
        return round(h, 1), round(mh, 1), lv, src

    for p in parts:
        t = p['t']
        rp = p['geom'].representative_point()
        zn = zone_at(rp.x, rp.y)
        h, mh, lv, src = heights(t, p['geom'], ZONES[zn], t.get('building:part', 'yes'))
        p.update(h=h, mh=mh, lv=lv, src=src, zn=zn)
    for b in out:
        t = b['t']
        g = b['geom']
        rp = g.representative_point()
        zn = zone_at(rp.x, rp.y)
        typ = t.get('building', 'yes')
        h, mh, lv, src = heights(t, g, ZONES[zn], typ)
        if typ == 'roof' and not t.get('min_height'):
            mh = max(0.0, h - 0.8)
        cover = 0.0
        maxp = 0.0
        if ptree is not None:
            for k in ptree.query(g):
                pg = parts[k]['geom']
                if g.contains(pg.representative_point()):
                    try:
                        cover += pg.intersection(g).area
                    except Exception:  # noqa: BLE001
                        pass
                    maxp = max(maxp, parts[k]['h'])
                    parts[k]['owner'] = b
        if src == 'default' and maxp:
            h = maxp
        b.update(h=h, mh=mh, lv=lv, src=src, zn=zn, typ=typ, partsCover=cover / g.area)
    stree = STRtree([s_['geom'] for s_ in sites]) if sites else None

    def site_of(g):
        if stree is None:
            return None
        rp = g.representative_point()
        best = None
        for k in stree.query(rp):
            s_ = sites[k]
            if s_['use'] in ('parking',):
                continue
            if s_['geom'].contains(rp) and (best is None or s_['area'] < best['area']):
                best = s_
        return best

    for b in out:
        if b['partsCover'] >= 0.7:
            continue  # rendered by its parts
        res.append(mk_building(b, b['typ'], site=site_of(b['geom'])))
    for p in parts:
        typ = p['owner']['typ'] if p.get('owner') else 'yes'
        if p.get('owner') and p['owner']['partsCover'] < 0.7:
            continue  # outline already rendered; skip parts to avoid z-fighting
        if p.get('owner'):
            # parts inherit what the outline says about the building as a whole
            for k_ in ('amenity', 'shop', 'tourism', 'office', 'leisure', 'addr:housenumber', 'addr:street', 'start_date',
                       'building:colour', 'building:material', 'roof:colour', 'roof:material', 'building:architecture'):
                if k_ in p['owner']['t'] and k_ not in p['t']:
                    p['t'][k_] = p['owner']['t'][k_]
        res.append(mk_building(p, typ, part=True, site=site_of(p['geom'])))
    # OSM sometimes holds the same footprint twice (an outline and an identical part, or a double import);
    # of two with the same outer ring the one with courtyards (smaller area) is kept
    seen, uniq = set(), []
    for b in sorted(res, key=lambda b: b['area']):
        c = b['geom'].centroid
        k_ = (round(c.x), round(c.y), round(b['area'] / 3), b['mh'], b['h'])
        ex = list(b['geom'].exterior.coords)[:-1]
        k2 = ('v', round(sum(p_[0] for p_ in ex) / len(ex) * 5), round(sum(p_[1] for p_ in ex) / len(ex) * 5), round(b['area']), b['mh'], b['h'])
        k3 = ('b',) + tuple(round(v) for v in b['geom'].bounds) + (len(ex), b['mh'], b['h'])
        if k_ in seen or k2 in seen or k3 in seen:
            continue
        seen.add(k_)
        seen.add(k2)
        seen.add(k3)
        uniq.append(b)
    res = uniq
    for i, b in enumerate(res):
        b['id'] = i
    return res


_year = __import__('re').compile(r'(1[89]\d\d|20[0-2]\d)')


def mk_building(b, typ, part=False, site=None):
    t = b['t']
    g = b['geom']
    gs = g.simplify(0.3, preserve_topology=True)
    if gs.is_empty or gs.geom_type != 'Polygon':
        ps = polys_only(gs) or polys_only(g)
        gs = max(ps, key=lambda p: p.area)
    gs = orient(gs, 1.0)
    h = b['h']
    zn = ZONES[b['zn']]
    use = POI.building_use(t)
    if site is not None and (use is None or use in ('retail', 'office', 'house', 'apartments', 'government', 'kiosk', 'utility')) \
            and site['use'] not in ('parking_garage', 'golf', 'construction'):
        # a building standing on a typed site (school grounds, fuel forecourt, hospital campus) takes the site's use
        if not (use in ('house', 'apartments') and site['use'] in ('marina', 'mall', 'hotel', 'attraction')):
            use = site['use']
    if typ in ('house', 'detached', 'semidetached_house', 'bungalow', 'residential') and h < 12:
        st = 'house'
    elif h >= 45:
        st = 'tower'
    elif zn in ('nightlife', 'beach') and h <= 24:
        st = 'deco'
    elif typ in ('roof', 'carport'):
        st = 'canopy'
    elif typ in ('parking',) or use == 'parking_garage':
        st = 'garage'
    elif typ in ('industrial', 'warehouse', 'cruise_terminal', 'hangar', 'service', 'shed', 'garages', 'garage'):
        st = 'industrial'
    elif h >= 20:
        st = 'midrise'
    else:
        st = 'lowrise'
    c = POI.classify(t) or {}
    year = None
    m = _year.search(str(t.get('start_date') or t.get('year_of_construction') or ''))
    if m:
        year = int(m.group(1))
    rlv = None
    try:
        rlv = float(t['roof:levels']) if t.get('roof:levels') else None
    except ValueError:
        pass
    return dict(geom=gs, h=h, mh=b['mh'], lv=b['lv'], typ=typ, zn=b['zn'], st=st, part=part, src=b['src'],
                col=t.get('building:colour') or t.get('colour'), rcol=t.get('roof:colour'),
                rs=t.get('roof:shape'), area=gs.area, use=use, kind=c.get('kind'), osm=c.get('osm'), sub=c.get('sub'),
                tier=c.get('tier'), addr=POI.address(t), mat=t.get('building:material') or t.get('building:facade:material'),
                rmat=t.get('roof:material'), rh=parse_len(t.get('roof:height')), rlv=rlv, year=year,
                arch=t.get('building:architecture') or t.get('architecture'),
                rooms=t.get('rooms'), stars=t.get('stars'), dt=c.get('driveThrough'))


def default_height(typ, zn, area, g):
    r = 0.85 + 0.3 * hsh(round(g.centroid.x, 1), round(g.centroid.y, 1))
    big = area > 1500
    T = {'house': 6.5, 'detached': 6.5, 'semidetached_house': 6.5, 'bungalow': 5, 'garage': 3, 'garages': 3,
         'shed': 3, 'carport': 3, 'hut': 3, 'roof': 4.5, 'lifeguard_tower': 3.5, 'kiosk': 3.5, 'toilets': 3.5,
         'church': 12, 'school': 10, 'university': 14, 'public': 10, 'civic': 10, 'government': 12,
         'industrial': 9, 'warehouse': 9, 'service': 4, 'cruise_terminal': 16, 'train_station': 9,
         'transportation': 8, 'parking': 14 if not big else 20, 'museum': 14, 'stadium': 25}
    if typ in T:
        return T[typ] * r
    if typ == 'apartments':
        return (45 if big else 28) * r if zn in ('downtown', 'business') else (14 if zn in ('nightlife', 'beach') else 12) * r
    if typ in ('commercial', 'retail', 'office', 'hotel', 'construction'):
        if zn in ('downtown', 'business'):
            return (50 if big else 24) * r
        if typ == 'hotel':
            return 16 * r
        return 8 * r
    if zn in ('downtown', 'business'):
        return (55 if area > 2500 else 30 if area > 800 else 12) * r
    if zn in ('nightlife', 'beach'):
        return (14 if area > 800 else 10) * r
    if zn == 'commercial':
        return 8 * r
    if zn in ('port', 'industrial'):
        return 11 * r
    if zn == 'residential':
        return (15 if area > 900 else 6.5) * r
    return 6 * r


def stage_storefronts(ground_b, btree, pois, named, ntree, anyroad, atree_r, zone_at, surf, G2, doors):
    """Storefront boxes on street-facing facades. Every storefront gets a kind (real OSM type where one exists),
    a facing (heading toward the street) and the street it faces."""
    COM = {'commercial', 'retail', 'hotel', 'office', 'supermarket', 'kiosk', 'mixed', 'mixed_use', 'strip', 'store', 'shop'}
    bpois = defaultdict(list)
    for pi, p in enumerate(pois):
        P = Point(p['x'], p['z'])
        best = None
        for k in btree.query(P.buffer(2.5)):
            d = ground_b[k]['geom'].distance(P)
            if d < 2.5 and (best is None or d < best[0]):
                best = (d, int(k))
        if best:
            bpois[best[1]].append(pi)
            p['b'] = ground_b[best[1]]['id']
    dtree = STRtree([Point(d[0], d[1]) for d in doors]) if doors else None
    stores, lean = [], []
    for bi, b in enumerate(ground_b):
        zn = ZONES[b['zn']]
        plist = [pi for pi in bpois.get(bi, []) if not pois[pi].get('level') or pois[pi].get('level') in (0, 1)]
        upper = [pi for pi in bpois.get(bi, []) if pi not in plist]
        own_kind = b.get('kind') or USE_KIND.get(b.get('use') or '')
        if b.get('synthetic') and b.get('poi'):
            own_kind = own_kind or b['poi']
        hasP = bool(plist) or bool(own_kind)
        elig = hasP or b['typ'] in COM or (zn in ('nightlife', 'downtown', 'business', 'commercial') and
                                            b['typ'] in ('yes', 'apartments', 'hotel', 'office', 'commercial', 'retail') and b['area'] > 120)
        leanZone = zn in ('nightlife', 'downtown', 'business', 'commercial', 'beach')
        if (not elig and not leanZone) or b['h'] < 2.6:
            continue
        if b['st'] in ('canopy', 'house', 'garage', 'industrial', 'stilt', 'hangar', 'barn') and not hasP:
            continue
        if b['st'] == 'canopy':
            continue
        g = b['geom']
        c = list(g.exterior.coords)
        facades = []
        for strict in (True, False):
            for i in range(len(c) - 1):
                (x0, z0), (x1, z1) = c[i], c[i + 1]
                dx, dz = x1 - x0, z1 - z0
                Ls = math.hypot(dx, dz)
                if Ls < (6 if strict else 4):
                    continue
                nx, nz = dz / Ls, -dx / Ls
                mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
                probe = Point(mx + nx * 1.5, mz + nz * 1.5)
                if any(ground_b[k]['geom'].contains(probe) for k in btree.query(probe)):
                    continue
                if strict:
                    k = ntree.query_nearest(probe, max_distance=28)
                    if not len(k):
                        continue
                    ne = named[int(k[0])]
                    street = ne['name']
                else:
                    # typed places off the named streets (strip malls behind a parking lot, kiosks in parks, marinas)
                    k = atree_r.query_nearest(probe, max_distance=70)
                    if not len(k):
                        continue
                    ne = anyroad[int(k[0])]
                    street = ne['name']
                    if not street:
                        k2 = ntree.query_nearest(probe, max_distance=900)
                        street = named[int(k2[0])]['name'] if len(k2) else None
                qp = ne['line'].interpolate(ne['line'].project(probe))
                vx, vz = qp.x - mx, qp.y - mz
                vd = math.hypot(vx, vz)
                if vd < 1e-3 or (vx * nx + vz * nz) / vd < (0.55 if strict else 0.3):
                    continue
                facades.append(dict(x0=x0, z0=z0, dx=dx / Ls, dz=dz / Ls, L=Ls, nx=nx, nz=nz, street=street, dist=vd))
            if facades or not hasP:
                break
        if not facades:
            continue
        used = []

        def place(f, s, kind, real, extra=None):
            # s = distance along facade of the shop centre
            for w in (9.0, 7.0, 5.5, 4.2):
                if w > f['L'] - 0.6:
                    continue
                s_ = min(max(s, w / 2 + 0.3), f['L'] - w / 2 - 0.3)
                fx, fz = f['x0'] + f['dx'] * s_, f['z0'] + f['dz'] * s_
                if any(math.hypot(fx - u[0], fz - u[1]) < (w + u[2]) / 2 + 0.8 for u in used):
                    continue
                for d in (10.0, 8.0, 6.0, 4.5, 3.2):
                    corners = [(fx + f['dx'] * w / 2 * a - f['nx'] * d * bb, fz + f['dz'] * w / 2 * a - f['nz'] * d * bb)
                               for a, bb in ((-1, 0.02), (1, 0.02), (1, 1), (-1, 1))]
                    if all(g.buffer(0.25).contains(Point(cx, cz)) for cx, cz in corners):
                        used.append((fx, fz, w))
                        rec = dict(x=fx - f['nx'] * d / 2, z=fz - f['nz'] * d / 2, y=0.0, w=w, d=d,
                                   facing=math.atan2(f['nx'], f['nz']), fx=fx, fz=fz, kind=kind, poi=real,
                                   buildingId=b['id'], street=f['street'], zone=zn)
                        if extra:
                            rec.update({k_: v for k_, v in extra.items() if v is not None})
                        stores.append(rec)
                        return True
            return False

        def along_shifts(f, s):
            yield s
            for dlt in (6, -6, 12, -12, 18, -18, 26, -26, 36, -36):
                if 2 < s + dlt < f['L'] - 2:
                    yield s + dlt

        tenants = []
        if elig:
            for pi in plist:
                p = pois[pi]
                ex = dict(osm=p.get('osm'), sub=p.get('sub'), tier=p.get('tier'), addr=p.get('addr') or b.get('addr'),
                          dt=p.get('dt'), os=p.get('os'))
                order = sorted(facades, key=lambda f: abs((p['x'] - f['x0']) * f['nx'] + (p['z'] - f['z0']) * f['nz']))
                ok = False
                for f in order[:3]:
                    s = (p['x'] - f['x0']) * f['dx'] + (p['z'] - f['z0']) * f['dz']
                    for s2 in along_shifts(f, s):
                        if place(f, s2, p['k'], True, ex):
                            ok = True
                            break
                    if ok:
                        break
                if not ok:
                    tenants.append(p['k'])
            for pi in upper:
                tenants.append(pois[pi]['k'])
            if not plist:
                if own_kind:
                    # the building itself is the place (a hotel, a supermarket, a bank branch): one front door
                    f = min(facades, key=lambda f: (f['dist'] - min(f['L'], 30) * 0.5))
                    s0 = f['L'] / 2
                    if dtree is not None:
                        for k in dtree.query(g.buffer(1.5)):
                            dx_, dz_, kind_ = doors[int(k)]
                            if kind_ in ('main', 'yes', 'shop'):
                                fb = min(facades, key=lambda ff: abs((dx_ - ff['x0']) * ff['nx'] + (dz_ - ff['z0']) * ff['nz']))
                                if abs((dx_ - fb['x0']) * fb['nx'] + (dz_ - fb['z0']) * fb['nz']) < 2.5:
                                    f, s0 = fb, (dx_ - fb['x0']) * fb['dx'] + (dz_ - fb['z0']) * fb['dz']
                                    break
                    ex = dict(osm=b.get('osm'), sub=b.get('sub') or b.get('poiSub'), tier=b.get('tier'), addr=b.get('addr'), dt=b.get('dt'))
                    if not place(f, s0, own_kind, True, ex):
                        for f2 in sorted(facades, key=lambda f: -f['L']):
                            if place(f2, f2['L'] / 2, own_kind, True, ex):
                                break
                else:
                    lst = DEFAULT_KINDS.get(zn, DEFAULT_KINDS['commercial'])
                    nmax = 1 if b['area'] < 400 else 2 if b['area'] < 2000 else 3
                    n = 0
                    for f in sorted(facades, key=lambda f: (f['dist'], -f['L'])):
                        if n >= nmax:
                            break
                        kinds = int(hsh(b['id'], n, 'k') * len(lst))
                        if place(f, f['L'] / 2, lst[kinds], False, dict(addr=b.get('addr'))):
                            n += 1
                        if f['L'] > 22 and n < nmax and place(f, f['L'] * 0.2, lst[(kinds + 3) % len(lst)], False, dict(addr=b.get('addr'))):
                            n += 1
        if tenants:
            b['tenants'] = tenants
        if leanZone and b['st'] not in ('house', 'garage', 'industrial'):
            for f in facades:
                s = 3.0
                while s < f['L'] - 2.5:
                    fx, fz = f['x0'] + f['dx'] * s, f['z0'] + f['dz'] * s
                    px, pz = fx + f['nx'] * 0.45, fz + f['nz'] * 0.45
                    if not any(math.hypot(fx - u[0], fz - u[1]) < u[2] / 2 + 1.5 for u in used):
                        i, j = G2.cell(fx + f['nx'] * 2.2, fz + f['nz'] * 2.2)
                        if surf is None or int(surf[j, i]) in (S['sidewalk'], S['concrete'], S['pavers'], S['tile']):
                            lean.append(dict(x=px, z=pz, heading=math.atan2(f['nx'], f['nz'])))
                    s += 11.0
    return stores, lean


# ---------------------------------------------------------------- output
KEEP = ('land', 'land_real', 'inland', 'areas', 'sites', 'nodes', 'edges', 'fws', 'piers', 'rails', 'bars', 'dlab', 'dnames', 'zlab',
        'bl', 'sw_polys', 'ped_lines', 'surf', 'cover', 'depth_dm', 'wkind', 'hgt', 'pois', 'props', 'props_h', 'storefronts', 'lean',
        'benches', 'spawn', 'spawnHeading', 'turn_no', 'turn_via', 'signal_nodes', 'exits', 'transit', 'places', 'setpieces',
        'extra_areas', 'synth_issues', 'stitch_rep', 'has_synth', 'props_list', 'cover_names', 'synth_other')


def write_outputs(V):
    d = {k: V[k] for k in KEEP}
    for e in d['edges']:
        e.pop('line', None)
    with open(os.path.join(WORK, 'v.pkl'), 'wb') as f:
        pickle.dump(d, f, protocol=4)
    log('saved', os.path.join(WORK, 'v.pkl'))
    import output
    output.run(d)


if __name__ == '__main__':
    main()
