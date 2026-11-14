"""Generic street-level generators: frontage walking (lot-by-lot buildings), commercial / civic site templates with typed
POIs, street grids, curvilinear subdivisions, canal-finger subdivisions, trees, lamps, signals and power lines.
All placement goes through World.free(), so nothing overlaps roads, water or other buildings.
"""
import math
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union
from shapely import affinity
from .util import cumlen, point_at, plen, rng, heading_of, catmull, resample, offset_line, r2
from .world import RANK

# ------------------------------------------------------------------------------------------------ palettes
PASTEL = ['#f2e3c6', '#f6d8b8', '#e8c9a0', '#f4ead5', '#d9e6d2', '#cfe3e8', '#f1cfc4', '#efe0a8', '#e6d3e3', '#d7dfe9', '#f7f1e3', '#e9b9a4',
          '#c9dcc0', '#f0d6a0', '#dfc7b0', '#e4e9d6', '#f3c6b0', '#bcd9d6']
KEYS = ['#8fd3c8', '#f7d87c', '#f4a7a0', '#a9d6f2', '#f6f0df', '#c7e59d', '#f2b279', '#d9c2ec', '#7fc4d8', '#ffe9b8', '#e98f8f', '#b7e3d0']
STUCCO = ['#efe6d6', '#e7d9c4', '#f3efe6', '#ddd0bd', '#e9dccb', '#d8cdbd', '#f1e7d0', '#e2d6c8']
INDUST = ['#b9bcbf', '#c9c4b8', '#a9b3b8', '#d2cfc7', '#b4ada2', '#9fa8a3', '#c4b8a4', '#aebdc4']
ROOFS = ['#b5651d', '#8d5a3b', '#a8a29a', '#6f7478', '#c47a54', '#d8d3c8', '#7d6b5d', '#9a4f3c', '#b9b3a6', '#5f6b6b']
TIN = ['#b9c2c4', '#9aa7a8', '#c8cfcf', '#8f9a94', '#a85c4a', '#7f9bb0', '#bfc7b5']

RETAIL = ['convenience', 'hairdresser', 'beauty', 'laundry', 'dry_cleaning', 'clothes', 'shoes', 'mobile_phone', 'electronics', 'bakery',
          'alcohol', 'pet', 'florist', 'hardware', 'furniture', 'variety_store', 'tattoo', 'optician', 'restaurant', 'fast_food', 'cafe',
          'ice_cream', 'bar', 'dentist', 'doctors', 'veterinary', 'fitness_centre', 'car_parts', 'bicycle', 'books', 'toys', 'jewelry',
          'gift', 'pawnbroker', 'travel_agency', 'estate_agent', 'insurance', 'copyshop', 'tobacco', 'massage', 'music', 'sports',
          'butcher', 'greengrocer', 'seafood', 'deli', 'pharmacy', 'bank', 'money_transfer', 'second_hand', 'art', 'frame', 'bed', 'paint',
          'party', 'craft', 'video_games', 'computer', 'nutrition_supplements', 'cosmetics', 'perfumery', 'tailor', 'shoe_repair', 'locksmith',
          'pizza', 'juice_bar', 'pastry', 'chocolate', 'tea', 'coffee', 'herbalist', 'medical_supply', 'hearing_aids', 'outdoor', 'fishing']
KEYS_RETAIL = ['fishing', 'scuba_diving', 'gift', 'art', 'seafood', 'ice_cream', 'bar', 'restaurant', 'cafe', 'surf', 'boat', 'convenience',
               'alcohol', 'clothes', 'jewelry', 'bicycle_rental', 'kayak_rental', 'tattoo', 'hairdresser', 'bakery', 'deli', 'pharmacy',
               'hardware', 'marine_supply', 'laundry', 'antiques', 'swimwear', 'tobacco', 'juice_bar', 'pizza', 'fast_food', 'books',
               'photo', 'massage', 'frame', 'craft', 'second_hand', 'coffee', 'fishing_charter', 'souvenir']
MAIN_RETAIL = ['restaurant', 'cafe', 'bar', 'bakery', 'books', 'clothes', 'antiques', 'art', 'gift', 'hardware', 'pharmacy', 'bank', 'hairdresser',
               'ice_cream', 'jewelry', 'florist', 'shoes', 'deli', 'seafood', 'fishing', 'optician', 'estate_agent', 'insurance', 'music', 'toys',
               'frame', 'tailor', 'pub', 'pizza', 'coffee', 'chocolate', 'bicycle', 'outdoor', 'second_hand', 'cinema', 'theatre', 'newsagent',
               'dry_cleaning', 'beauty', 'tattoo', 'dentist', 'doctors', 'lawyer', 'accountant', 'pet', 'variety_store']
YARD_TREES = ['palm', 'coconut', 'oak', 'gumbo', 'royal_palm', 'seagrape', 'banyan', 'palm', 'palm', 'oak']


class Frame:
    """Local frame on a road frontage: u along the road, v away from the road (outward)."""
    __slots__ = ('ox', 'oz', 'tx', 'tz', 'nx', 'nz')

    def __init__(self, ox, oz, tx, tz, nx, nz):
        self.ox, self.oz, self.tx, self.tz, self.nx, self.nz = ox, oz, tx, tz, nx, nz

    def pt(self, u, v):
        return (self.ox + self.tx * u + self.nx * v, self.oz + self.tz * u + self.nz * v)

    def ring(self, uv):
        return [self.pt(u, v) for u, v in uv]

    def rect(self, u0, v0, u1, v1):
        return self.ring([(u0, v0), (u1, v0), (u1, v1), (u0, v1)])

    def poly(self, u0, v0, u1, v1):
        return Polygon(self.rect(u0, v0, u1, v1))

    @property
    def facing(self):
        """Heading of something that faces the street (looks toward -v)."""
        return heading_of(-self.nx, -self.nz)

    @property
    def along(self):
        return heading_of(self.tx, self.tz)

    def sub(self, u, v):
        return Frame(*self.pt(u, v), self.tx, self.tz, self.nx, self.nz)


def frontage_frame(road, side, s0, w, extra=0.0):
    """Frame for a site of width w starting at arc length s0 on `side` (+1 right of travel, -1 left)."""
    cum = cumlen(road.pts)
    a = point_at(road.pts, s0, cum)
    b = point_at(road.pts, s0 + w, cum)
    tx, tz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(tx, tz)
    if L < w * 0.93 or L < 1e-6:        # too curved for a straight site
        return None
    tx, tz = tx / L, tz / L
    nx, nz = (-tz, tx) if side > 0 else (tz, -tx)
    e = road.width / 2.0 + road.tags.get('verge', 2.8) + extra
    # push out so that the whole chord clears the (curved) road edge
    m = point_at(road.pts, s0 + w / 2.0, cum)
    bulge = (m[0] - (a[0] + b[0]) / 2) * nx + (m[1] - (a[1] + b[1]) / 2) * nz
    e += max(0.0, bulge)
    return Frame(a[0] + nx * e, a[1] + nz * e, tx, tz, nx, nz)


# ------------------------------------------------------------------------------------------------ building shapes
def house_shape(rnd, w, d):
    """Footprint (u, v) of a detached house within a w x d envelope. Front edge on v = 0."""
    k = rnd.random()
    if k < 0.30:
        return [(0, 0), (w, 0), (w, d), (0, d)]
    if k < 0.62:    # L
        a, b = w * rnd.uniform(0.42, 0.6), d * rnd.uniform(0.45, 0.65)
        if rnd.random() < 0.5:
            return [(0, 0), (w, 0), (w, b), (a, b), (a, d), (0, d)]
        return [(0, 0), (w, 0), (w, d), (w - a, d), (w - a, b), (0, b)]
    if k < 0.82:    # T / front bump (garage)
        a0 = w * rnd.uniform(0.08, 0.3)
        a1 = a0 + w * rnd.uniform(0.3, 0.42)
        f = d * rnd.uniform(0.22, 0.34)
        return [(a0, 0), (a1, 0), (a1, f), (w, f), (w, d), (0, d), (0, f), (a0, f)]
    # U (courtyard to the back)
    a, b = w * rnd.uniform(0.3, 0.36), d * rnd.uniform(0.5, 0.62)
    return [(0, 0), (w, 0), (w, d), (w - a, d), (w - a, b), (a, b), (a, d), (0, d)]


def _place(world, F, uv, h, kind, style, zone, **kw):
    return world.building(F.ring(uv), h, kind, style, zone, tags={'facing': round(F.facing, 3)}, **kw)


def lot_house(world, F, w, rnd, ctx):
    depth = ctx.get('depth', rnd.uniform(29, 36))
    lot = F.poly(0.4, 0.2, w - 0.4, depth)
    if not world.free(lot, tags=('bldg', 'road', 'water', 'reserved', 'site'), margin=0.0):
        return False
    style = ctx.get('style', 'house')
    stilt = style == 'stilt'
    bw = min(w - 5.0, rnd.uniform(11, 17) if not stilt else rnd.uniform(8, 12))
    bd = rnd.uniform(9.5, 14.5) if not stilt else rnd.uniform(8, 12)
    if bw < 6.5:
        return False
    sb = ctx.get('setback', rnd.uniform(6.0, 9.5))
    u0 = rnd.uniform(2.2, max(2.3, w - bw - 2.2))
    two = rnd.random() < ctx.get('two_story', 0.18)
    h = (7.2 if two else 4.4) + rnd.uniform(-0.3, 0.6)
    if stilt:
        h = rnd.uniform(7.6, 9.4)
    G = F.sub(u0, sb)
    pal = ctx.get('palette', PASTEL)
    b = _place(world, G, house_shape(rnd, bw, bd), h, 'house', style, ctx.get('zone', 'residential'), levels=2 if two else 1,
               colour=rnd.choice(pal), roofColour=rnd.choice(TIN if stilt or ctx.get('tin') else ROOFS),
               roof=rnd.choice(['hip', 'gable', 'hip', 'gable', 'flat']) if not stilt else rnd.choice(['gable', 'hip']),
               region=ctx.get('region', ''), margin=1.0)
    if not b:
        return False
    world.reserve(lot, 'site')
    # yard trees
    for _ in range(rnd.choice([0, 1, 1, 2, 2, 3])):
        tu, tv = rnd.uniform(1.5, w - 1.5), rnd.choice([rnd.uniform(1.5, sb - 1.5), rnd.uniform(sb + bd + 2, depth - 1.5)])
        if tv > 1.0:
            x, z = F.pt(tu, tv)
            world.tree(x, z, rnd.choice(ctx.get('trees', YARD_TREES)))
    if rnd.random() < ctx.get('mailbox', 0.5):
        x, z = F.pt(u0 + bw + 1.2 if u0 + bw + 1.2 < w else u0 - 1.0, 0.6)
        world.prop(x, z, 'mailbox', F.facing)
    if ctx.get('dock'):       # canal-front lot: dock behind the house
        du = rnd.uniform(3.0, w - 3.0)
        dl = rnd.uniform(6.0, 10.0)
        p0, p1 = F.pt(du, depth - 0.5), F.pt(du, depth + dl)
        world.path([p0, p1], 'dock', 1.6, 'wood')
        world.prop(*F.pt(du + rnd.choice([-2.4, 2.4]), depth + dl * 0.6), rnd.choice(['boat_skiff', 'boat_center_console', 'boat_lift', 'kayak', 'boat_flats', 'jet_ski']), F.along)
    if rnd.random() < ctx.get('pool', 0.0):
        world.prop(*F.pt(u0 + bw * 0.5, sb + bd + 5.5), 'pool', F.along)
    if stilt and rnd.random() < 0.6:
        world.prop(*F.pt(u0 + bw * 0.5, sb - 2.5), rnd.choice(['boat_trailer', 'golf_cart', 'kayak_rack', 'crab_traps']), F.along)
    return True


def lot_mobile(world, F, w, rnd, ctx):
    lot = F.poly(0.3, 0.2, w - 0.3, 24)
    if not world.free(lot, margin=0.0):
        return False
    bw, bd = rnd.uniform(4.2, 4.9), rnd.uniform(15, 20)
    if rnd.random() < 0.35:
        bw *= 2
    u0 = rnd.uniform(1.0, max(1.1, w - bw - 1.0))
    b = _place(world, F.sub(u0, rnd.uniform(3, 5)), [(0, 0), (bw, 0), (bw, bd), (0, bd)], rnd.uniform(3.2, 3.8), 'static_caravan', 'cabin',
               ctx.get('zone', 'residential'), levels=1, colour=rnd.choice(STUCCO + KEYS), roofColour=rnd.choice(TIN), roof='gable', region=ctx.get('region', ''), margin=0.8)
    if b:
        world.reserve(lot, 'site')
        if rnd.random() < 0.5:
            world.tree(*F.pt(rnd.uniform(1, w - 1), rnd.uniform(1, 3)), rnd.choice(['palm', 'coconut', 'seagrape']))
    return bool(b)


def lot_apartment(world, F, w, rnd, ctx):
    depth = rnd.uniform(30, 40)
    lot = F.poly(0.4, 0.2, w - 0.4, depth)
    if not world.free(lot, margin=0.0):
        return False
    lv = rnd.choice(ctx.get('levels', [2, 2, 3, 3, 4]))
    bw, bd = w - rnd.uniform(5, 8), rnd.uniform(13, 18)
    sb = rnd.uniform(4, 7)
    shape = [(0, 0), (bw, 0), (bw, bd), (0, bd)]
    if bw > 26 and rnd.random() < 0.5:
        c = bw * 0.3
        shape = [(0, 0), (bw, 0), (bw, bd + 8), (bw - c, bd + 8), (bw - c, bd), (c, bd), (c, bd + 8), (0, bd + 8)]
    b = _place(world, F.sub((w - bw) / 2, sb), shape, lv * 3.1 + 0.8, 'apartments', 'lowrise', ctx.get('zone', 'residential'), levels=lv,
               colour=rnd.choice(ctx.get('palette', STUCCO + PASTEL)), roof='flat', region=ctx.get('region', ''), margin=0.8)
    if not b:
        return False
    world.reserve(lot, 'site')
    if depth - sb - bd > 12:
        world.add_area(F.poly(2, sb + bd + 9 if len(shape) > 4 else sb + bd + 2, w - 2, depth - 1), 'parking', clip=False)
    for u in (2.0, w - 2.0):
        world.tree(*F.pt(u, 2.0), rnd.choice(['palm', 'royal_palm', 'oak']))
    return True


def lot_shopfront(world, F, w, rnd, ctx):
    """Main-street building: zero setback, attached. One typed shop per bay."""
    depth = rnd.uniform(17, 27)
    lv = rnd.choice([1, 2, 2, 2, 3])
    poi = ctx['pick_poi'](rnd)
    b = _place(world, F.sub(0.02, 0.6), [(0, 0), (w - 0.04, 0), (w - 0.04, depth), (0, depth)], lv * 3.6 + rnd.uniform(0.6, 1.6), 'retail',
               ctx.get('style', 'deco'), ctx.get('zone', 'commercial'), levels=lv, colour=rnd.choice(ctx.get('palette', PASTEL + KEYS)),
               roof='flat', poi=poi, region=ctx.get('region', ''), margin=0.0)
    if b:
        x, z = F.pt(w / 2, 0.0)
        world.poi(x, z, poi, building=b['id'])
    return bool(b)


def lot_warehouse(world, F, w, rnd, ctx):
    depth = rnd.uniform(46, 70)
    lot = F.poly(0.5, 0.3, w - 0.5, depth)
    if not world.free(lot, margin=0.0):
        return False
    bw, bd = w - rnd.uniform(8, 16), depth - rnd.uniform(18, 26)
    sb = rnd.uniform(10, 16)
    kind = rnd.choice(['warehouse', 'industrial', 'warehouse', 'industrial', 'commercial'])
    poi = rnd.choice(ctx.get('pois', [None, None, 'car_repair', 'storage_rental', 'wholesale', 'car_repair', 'trade', 'building_materials', None,
                                      'boat_repair', 'tyres', 'recycling', 'scrap_yard', 'bakery_wholesale', 'print_shop', 'machine_shop']))
    b = _place(world, F.sub((w - bw) / 2, sb), [(0, 0), (bw, 0), (bw, bd), (0, bd)], rnd.uniform(6.5, 10.5), kind, 'industrial',
               ctx.get('zone', 'industrial'), levels=1, colour=rnd.choice(INDUST), roof=rnd.choice(['flat', 'gable']),
               roofColour=rnd.choice(TIN), poi=poi, region=ctx.get('region', ''), margin=1.0)
    if not b:
        return False
    world.reserve(lot, 'site')
    world.add_area(F.poly(1, 0.6, w - 1, sb - 0.8), 'paved', clip=False)
    if poi:
        world.poi(*F.pt(w / 2, sb), poi, building=b['id'])
    if rnd.random() < 0.4:
        world.prop(*F.pt(rnd.uniform(3, w - 3), rnd.uniform(2, sb - 2)), rnd.choice(['dumpster', 'pallet_stack', 'shipping_container', 'box_truck', 'forklift']), F.along)
    return True


# ------------------------------------------------------------------------------------------------ site templates
def _site(world, F, w, d, margin=0.0):
    p = F.poly(0.3, 0.3, w - 0.3, d)
    if not world.free(p, margin=margin):
        return None
    return p


def _driveway(world, F, u, d_in, region):
    """Service road from the street centerline side into the site (ends d_in inside)."""
    e = -F_edge(F)
    return world.road([F.pt(u, e), F.pt(u, d_in)], 'service', '', lf=1, lb=1, region=region, tags={'site': 1})


def F_edge(F):
    return F.__dict__.get('e', 0.0) if hasattr(F, '__dict__') else 0.0


def _aisle(world, F, w, v, ctx, u0=6.0, u1=None, back=None):
    """Parking aisle parallel to the street with two driveways to the street."""
    u1 = (w - 6.0) if u1 is None else u1
    e = ctx['edge']
    reg = ctx.get('region', '')
    world.road([F.pt(u0, -e), F.pt(u0, v), F.pt(u1, v), F.pt(u1, -e)], 'service', '', lf=1, lb=1, region=reg, tags={'site': 1})


def _lamps(world, F, u0, v0, u1, v1, step=22.0):
    u = u0
    while u <= u1:
        v = v0
        while v <= v1:
            world.prop(*F.pt(u, v), 'lot_lamp')
            v += step
        u += step


def site_strip_mall(world, F, w, rnd, ctx):
    d = rnd.uniform(56, 70)
    if not _site(world, F, w, d):
        return False
    bd = rnd.uniform(17, 24)
    v0 = d - bd - 2.0
    u = 3.0
    h = rnd.uniform(5.2, 6.4)
    pal = rnd.choice(STUCCO)
    anchor = rnd.random() < 0.45 and w > 85
    pick = ctx['pick_poi']
    first = True
    while u < w - 9.0:
        if anchor and first:
            uw = rnd.uniform(26, 36)
            poi = rnd.choice(['supermarket', 'pharmacy', 'department_store', 'variety_store', 'fitness_centre', 'doityourself', 'supermarket'])
            hh = h + 1.6
        else:
            uw = rnd.uniform(6.5, 12.5)
            poi = pick(rnd)
            hh = h
        first = False
        if u + uw > w - 3.0:
            uw = w - 3.0 - u
            if uw < 5.5:
                break
        b = _place(world, F.sub(u, v0), [(0, 0), (uw - 0.02, 0), (uw - 0.02, bd), (0, bd)], hh, 'retail', 'strip', 'commercial', levels=1,
                   colour=pal, roof='flat', poi=poi, region=ctx.get('region', ''), margin=0.0)
        if b:
            world.poi(*F.pt(u + uw / 2, v0), poi, building=b['id'])
        u += uw
    world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
    world.add_area(F.poly(1.0, 1.0, w - 1.0, v0 - 3.0), 'parking', clip=False)
    _aisle(world, F, w, (v0 - 3.0) * 0.5 + 1.0, ctx)
    _lamps(world, F, 10, 8, w - 10, v0 - 8, 24)
    world.prop(*F.pt(rnd.uniform(8, w - 8), 1.6), 'pylon_sign', F.facing)
    for uu in (2.0, w * 0.33, w * 0.66, w - 2.0):
        world.tree(*F.pt(uu, 1.2), rnd.choice(['palm', 'royal_palm', 'coconut']))
    world.prop(*F.pt(w - 4.0, d - 1.5), 'dumpster', F.along)
    return True


def site_gas(world, F, w, rnd, ctx):
    d = 40.0
    if not _site(world, F, w, d):
        return False
    reg = ctx.get('region', '')
    cu = w / 2
    b1 = _place(world, F.sub(cu - 11, 9), [(0, 0), (22, 0), (22, 9.5), (0, 9.5)], 5.6, 'roof', 'canopy', 'commercial', levels=1, roof='flat',
                poi='fuel', region=reg, margin=0.0)
    b2 = _place(world, F.sub(cu - 9, 25), [(0, 0), (18, 0), (18, 11), (0, 11)], 4.6, 'retail', 'strip', 'commercial', levels=1, roof='flat',
                colour=rnd.choice(STUCCO), poi='convenience', region=reg, margin=0.0)
    if not (b1 and b2):
        return False
    world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
    world.add_area(F.poly(1, 1, w - 1, 24), 'paved', clip=False)
    world.poi(*F.pt(cu, 13.5), 'fuel', building=b1['id'])
    world.poi(*F.pt(cu, 25), 'convenience', building=b2['id'])
    for k in range(4):
        world.prop(*F.pt(cu - 7.5 + k * 5.0, 13.7), 'fuel_pump', F.along)
    world.prop(*F.pt(3.5, 2.0), 'price_sign', F.facing)
    _aisle(world, F, w, 5.0, ctx, u0=5.0, u1=w - 5.0)
    if w > 50 and rnd.random() < 0.6:
        b3 = _place(world, F.sub(w - 9.5, 22), [(0, 0), (6, 0), (6, 14), (0, 14)], 4.2, 'retail', 'strip', 'commercial', levels=1, roof='flat',
                    poi='car_wash', region=reg, margin=0.0)
        if b3:
            world.poi(*F.pt(w - 6.5, 22), 'car_wash', building=b3['id'])
    world.prop(*F.pt(cu + 12, 26), 'ice_freezer', F.facing)
    world.prop(*F.pt(cu - 12, 26), 'air_pump', F.facing)
    world.prop(*F.pt(cu + 6, 24.2), 'propane_cage', F.facing)
    return True


def _single(world, F, w, d, bw, bd, sb, h, kind, style, poi, rnd, ctx, name=None, levels=1, shape=None, palette=None, parking=True, zone='commercial', roof='flat'):
    if not _site(world, F, w, d):
        return None
    b = _place(world, F.sub((w - bw) / 2, sb), shape or [(0, 0), (bw, 0), (bw, bd), (0, bd)], h, kind, style, zone, levels=levels,
               colour=rnd.choice(palette or STUCCO), roof=roof, roofColour=rnd.choice(ROOFS), poi=poi, name=name, region=ctx.get('region', ''), margin=0.0)
    if not b:
        return None
    world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
    if poi:
        world.poi(*F.pt(w / 2, sb), poi, building=b['id'], **({'name': name} if name else {}))
    if parking and sb > 14:
        world.add_area(F.poly(1, 1, w - 1, sb - 2), 'parking', clip=False)
        _aisle(world, F, w, (sb - 2) / 2 + 0.5, ctx, u0=4.5, u1=w - 4.5)
    return b


def site_fast_food(world, F, w, rnd, ctx):
    poi = rnd.choice(['fast_food', 'fast_food', 'fast_food', 'cafe', 'ice_cream', 'pizza', 'fast_food'])
    b = _single(world, F, w, 46, 11, 19, 18, 4.8, 'retail', 'strip', poi, rnd, ctx)
    if not b:
        return False
    # drive-thru loop around the building
    u0, u1 = (w - 11) / 2 - 4.2, (w + 11) / 2 + 4.2
    world.road([F.pt(u0, 9.5), F.pt(u0, 41), F.pt(u1, 41), F.pt(u1, 9.5)], 'service', '', lf=1, oneway=True, region=ctx.get('region', ''), tags={'site': 1, 'drive_thru': 1})
    world.prop(*F.pt(u1 + 1.5, 30), 'menu_board', F.along)
    world.prop(*F.pt(4, 1.8), 'pylon_sign', F.facing)
    world.tree(*F.pt(w - 3, 2), 'palm')
    return True


def site_big_box(world, F, w, rnd, ctx):
    d = rnd.uniform(135, 160)
    if not _site(world, F, w, d):
        return False
    bw, bd = w - rnd.uniform(14, 26), rnd.uniform(48, 62)
    v0 = d - bd - 9
    poi = rnd.choice(['supermarket', 'department_store', 'doityourself', 'supermarket', 'wholesale', 'furniture', 'electronics', 'garden_centre', 'sports'])
    b = _place(world, F.sub((w - bw) / 2, v0), [(0, 0), (bw, 0), (bw, bd), (0, bd)], rnd.uniform(8, 9.5), 'retail', 'strip', 'commercial', levels=1,
               colour=rnd.choice(STUCCO), roof='flat', poi=poi, region=ctx.get('region', ''), margin=0.0)
    if not b:
        return False
    world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
    world.poi(*F.pt(w / 2, v0), poi, building=b['id'])
    world.add_area(F.poly(1, 1, w - 1, v0 - 5), 'parking', clip=False)
    e = ctx['edge']
    reg = ctx.get('region', '')
    world.road([F.pt(8, -e), F.pt(8, v0 - 8), F.pt(w - 8, v0 - 8), F.pt(w - 8, -e)], 'service', '', lf=1, lb=1, region=reg, tags={'site': 1})
    world.road([F.pt(8, (v0 - 8) * 0.45), F.pt(w - 8, (v0 - 8) * 0.45)], 'service', '', lf=1, lb=1, region=reg, tags={'site': 1})
    world.road([F.pt(w - 8, v0 - 8), F.pt(w - 8, d - 4), F.pt(8, d - 4), F.pt(8, v0 - 8)], 'service', '', lf=1, lb=1, region=reg, tags={'site': 1})
    _lamps(world, F, 20, 12, w - 20, v0 - 16, 30)
    u = 20.0
    while u < w - 20:
        for v in (18.0, v0 - 22.0):
            world.tree(*F.pt(u, v), rnd.choice(['palm', 'oak', 'royal_palm']))
        u += 30
    world.prop(*F.pt(6, 2), 'pylon_sign', F.facing)
    for k in range(3):
        world.prop(*F.pt(w * (0.3 + 0.2 * k), v0 - 14), 'cart_corral', F.along)
    world.prop(*F.pt(w * 0.5, d - 6.5), 'loading_dock', F.facing + math.pi)
    return True


def site_motel(world, F, w, rnd, ctx):
    d = 52.0
    if not _site(world, F, w, d):
        return False
    t = 9.0
    lv = rnd.choice([1, 2, 2])
    pal = rnd.choice(ctx.get('palette', KEYS + PASTEL))
    shape = [(0, 20), (w - 8, 20), (w - 8, 46), (w - 8 - t, 46), (w - 8 - t, 20 + t), (t, 20 + t), (t, 46), (0, 46)] if rnd.random() < 0.5 else \
        [(0, 20 + 26 - t), (w - 8, 20 + 26 - t), (w - 8, 46), (0, 46)]
    b = _place(world, F.sub(4, 0), shape, lv * 3.0 + 0.6, 'hotel', 'lowrise', ctx.get('zone', 'commercial'), levels=lv, colour=pal, roof='flat',
               poi='motel', name=ctx.get('name'), region=ctx.get('region', ''), margin=0.0)
    if not b:
        return False
    o = _place(world, F.sub(4, 5), [(0, 0), (9, 0), (9, 7), (0, 7)], 3.8, 'hotel', 'lowrise', ctx.get('zone', 'commercial'), levels=1, colour=pal,
               roof='gable', poi='reception', region=ctx.get('region', ''), margin=0.0)
    world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
    world.poi(*F.pt(w / 2, 20), 'motel', building=b['id'], **({'name': ctx['name']} if ctx.get('name') else {}))
    world.add_area(F.poly(15, 2, w - 2, 18), 'parking', clip=False)
    _aisle(world, F, w, 10.0, ctx, u0=16.0, u1=w - 5.0)
    world.prop(*F.pt(w / 2, 36), 'pool', F.along)
    world.prop(*F.pt(2.5, 1.8), 'neon_sign', F.facing)
    for uu in (14, w - 3):
        world.tree(*F.pt(uu, 1.5), 'coconut')
    return True


def site_church(world, F, w, rnd, ctx):
    nm = ctx.get('name')
    shape = [(0, 0), (14, 0), (14, 8), (20, 8), (20, 18), (14, 18), (14, 30), (0, 30), (0, 18), (-6, 18), (-6, 8), (0, 8)]
    b = _single(world, F, w, 62, 14, 30, 24, rnd.uniform(8.5, 11), 'church', 'lowrise', 'place_of_worship', rnd, ctx, name=nm, shape=shape, roof='gable', zone='residential')
    if b:
        world.prop(*F.pt(w / 2 - 12, 4), 'church_sign', F.facing)
        world.tree(*F.pt(w / 2 + 16, 30), 'oak')
        world.tree(*F.pt(w / 2 - 16, 44), 'oak')
    return bool(b)


def site_school(world, F, w, rnd, ctx):
    d = 130.0
    if not _site(world, F, w, d):
        return False
    reg = ctx.get('region', '')
    bw = min(w - 60, 78)
    shape = [(0, 0), (bw, 0), (bw, 14), (bw - 16, 14), (bw - 16, 44), (bw, 44), (bw, 58), (0, 58), (0, 44), (16, 44), (16, 14), (0, 14)]
    b = _place(world, F.sub(8, 26), shape, 7.6, 'school', 'lowrise', 'residential', levels=2, colour=rnd.choice(STUCCO), roof='flat', poi='school',
               name=ctx.get('name'), region=reg, margin=0.0)
    if not b:
        return False
    world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
    world.poi(*F.pt(8 + bw / 2, 26), 'school', building=b['id'], **({'name': ctx['name']} if ctx.get('name') else {}))
    world.add_area(F.poly(bw + 16, 30, w - 4, 110), 'grass', name='sports field', clip=False)
    world.add_area(F.poly(4, 90, bw + 8, 124), 'parking', clip=False)
    e = ctx['edge']
    world.road([F.pt(6, -e), F.pt(6, 18), F.pt(bw + 8, 18), F.pt(bw + 8, -e)], 'service', '', lf=1, oneway=True, region=reg, tags={'site': 1, 'bus_loop': 1})
    world.prop(*F.pt(bw / 2 + 8, 16), 'flagpole')
    world.prop(*F.pt(bw + 30, 60), 'goal_post', F.along)
    world.prop(*F.pt(w - 10, 60), 'goal_post', F.along + math.pi)
    world.prop(*F.pt(bw + 22, 100), 'bleachers', F.along)
    for uu in range(10, int(w) - 5, 18):
        world.tree(*F.pt(uu, 3), rnd.choice(['oak', 'royal_palm', 'gumbo']))
    return True


def site_generic(poi, kind='retail', style='strip', bw=(12, 18), bd=(12, 18), h=(4.6, 6.0), d=46, sb=(15, 20), zone='commercial', levels=1, props=(), roof='flat', palette=None):
    def tpl(world, F, w, rnd, ctx):
        bw_ = min(rnd.uniform(*bw), w - 6)
        p = rnd.choice(poi) if isinstance(poi, (list, tuple)) else poi
        b = _single(world, F, w, d, bw_, rnd.uniform(*bd), rnd.uniform(*sb), rnd.uniform(*h), kind, style, p, rnd, ctx, name=ctx.get('name'),
                    levels=levels, zone=zone, roof=roof, palette=palette or ctx.get('palette'))
        if b:
            for i, pr in enumerate(props):
                world.prop(*F.pt(3 + (w - 6) * (i + 0.5) / len(props), 2.2), pr, F.facing)
            world.tree(*F.pt(w - 2.5, 2.0), rnd.choice(['palm', 'coconut', 'oak']))
        return bool(b)
    return tpl


def site_car_dealer(world, F, w, rnd, ctx):
    b = _single(world, F, w, 60, min(34, w - 20), 18, 36, 6.2, 'retail', 'strip', 'car', rnd, ctx, parking=False)
    if not b:
        return False
    world.add_area(F.poly(1, 1, w - 1, 33), 'parking', name='sales lot', clip=False)
    _lamps(world, F, 8, 6, w - 8, 30, 16)
    world.prop(*F.pt(5, 2), 'pylon_sign', F.facing)
    world.prop(*F.pt(w / 2, 3), 'inflatable_tube_man', F.facing)
    return True


def site_storage(world, F, w, rnd, ctx):
    d = 62.0
    if not _site(world, F, w, d):
        return False
    reg = ctx.get('region', '')
    v = 10.0
    n = 0
    while v < d - 9:
        b = _place(world, F.sub(5, v), [(0, 0), (w - 10, 0), (w - 10, 7.5), (0, 7.5)], 3.4, 'warehouse', 'industrial', 'industrial', levels=1,
                   colour=rnd.choice(INDUST), roof='flat', poi='storage_rental' if n == 0 else None, region=reg, margin=0.0)
        n += 1 if b else 0
        v += 13.5
    if n:
        world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
        world.add_area(F.poly(1, 1, w - 1, d - 1), 'paved', clip=False)
        world.poi(*F.pt(w / 2, 10), 'storage_rental')
        world.prop(*F.pt(3, 3), 'gate_keypad', F.facing)
    return n > 0


def site_park(world, F, w, rnd, ctx):
    d = rnd.uniform(40, 60)
    if not _site(world, F, w, d):
        return False
    p = F.poly(0.5, 0.5, w - 0.5, d - 0.5)
    world.reserve(p, 'site')
    world.add_area(p, 'park', name=ctx.get('name'), clip=False)
    b = _place(world, F.sub(w / 2 - 5, d / 2 - 4), [(0, 0), (10, 0), (10, 8), (0, 8)], 3.6, 'roof', 'canopy', 'park', levels=1, roof='hip', poi='shelter',
               region=ctx.get('region', ''), margin=0.0)
    world.prop(*F.pt(w * 0.25, d * 0.5), 'playground', F.along)
    for k in range(3):
        world.prop(*F.pt(w * (0.55 + 0.12 * k), d * 0.3), 'picnic_table', F.along)
    world.prop(*F.pt(w * 0.8, d * 0.7), rnd.choice(['basketball_hoop', 'domino_table', 'bbq_grill', 'drinking_fountain']), F.along)
    for _ in range(int(w * d / 260)):
        world.tree(*F.pt(rnd.uniform(2, w - 2), rnd.uniform(2, d - 2)), rnd.choice(['oak', 'banyan', 'royal_palm', 'gumbo', 'palm']))
    if ctx.get('name'):
        world.poi(*F.pt(w / 2, 1), 'park', name=ctx['name'])
    return True


def site_rv_park(world, F, w, rnd, ctx):
    d = 92.0
    if not _site(world, F, w, d):
        return False
    reg = ctx.get('region', '')
    world.reserve(F.poly(0.3, 0.3, w - 0.3, d), 'site')
    world.add_area(F.poly(0.6, 0.6, w - 0.6, d - 0.6), 'campground', name=ctx.get('name'), clip=False)
    e = ctx['edge']
    world.road([F.pt(w / 2, -e), F.pt(w / 2, 14), F.pt(10, 14), F.pt(10, d - 12), F.pt(w - 10, d - 12), F.pt(w - 10, 14), F.pt(w / 2, 14)], 'service', '',
               lf=1, lb=1, surface='gravel', region=reg, tags={'site': 1})
    b = _place(world, F.sub(w / 2 + 6, 3), [(0, 0), (9, 0), (9, 7), (0, 7)], 3.6, 'retail', 'cabin', 'commercial', levels=1, colour=rnd.choice(KEYS), roof='gable',
               roofColour=rnd.choice(TIN), poi='caravan_site', name=ctx.get('name'), region=reg, margin=0.0)
    b2 = _place(world, F.sub(w / 2 - 6, d / 2 - 4), [(0, 0), (12, 0), (12, 8), (0, 8)], 3.4, 'service', 'cabin', 'commercial', levels=1, colour=rnd.choice(STUCCO),
                roof='gable', poi='shower', region=reg, margin=0.0)
    world.poi(*F.pt(w / 2 + 10, 3), 'caravan_site', **({'name': ctx['name']} if ctx.get('name') else {}))
    v = 22.0
    k = 0
    while v < d - 18:
        for uu, hd in ((17.5, F.along), (w - 17.5, F.along + math.pi)):
            world.prop(*F.pt(uu, v), rnd.choice(['rv_motorhome', 'rv_trailer', 'rv_fifth_wheel', 'rv_pad_empty', 'rv_van', 'rv_motorhome']), hd, pad=k)
            world.prop(*F.pt(uu + (4.5 if hd == F.along else -4.5), v + 3), rnd.choice(['picnic_table', 'camp_chairs', 'bbq_grill', 'awning', 'golf_cart']), hd)
            k += 1
        v += 9.5
    for _ in range(int(w / 6)):
        world.tree(*F.pt(rnd.uniform(3, w - 3), rnd.choice([rnd.uniform(1, 8), rnd.uniform(d - 8, d - 1)])), rnd.choice(['palm', 'coconut', 'oak', 'pine', 'seagrape']))
    return True


TEMPLATES = {
    # name: (fn, wmin, wmax)
    'strip_mall': (site_strip_mall, 62, 118),
    'gas': (site_gas, 46, 58),
    'fast_food': (site_fast_food, 36, 42),
    'big_box': (site_big_box, 120, 165),
    'motel': (site_motel, 58, 82),
    'church': (site_church, 52, 62),
    'school': (site_school, 150, 175),
    'car_dealer': (site_car_dealer, 60, 85),
    'storage': (site_storage, 50, 75),
    'park': (site_park, 45, 90),
    'rv_park': (site_rv_park, 90, 130),
    'bank': (site_generic('bank', bw=(14, 18), bd=(12, 15), props=('atm',)), 36, 44),
    'restaurant': (site_generic(['restaurant', 'restaurant', 'bar', 'cafe', 'pub'], bw=(13, 19), bd=(13, 20), props=('pylon_sign',)), 36, 48),
    'pharmacy': (site_generic('pharmacy', bw=(24, 30), bd=(20, 26), d=56, sb=(22, 26), props=('pylon_sign',)), 44, 56),
    'auto_repair': (site_generic(['car_repair', 'tyres', 'car_parts', 'car_repair'], kind='industrial', style='industrial', bw=(18, 26), bd=(12, 16), props=('tire_stack', 'pylon_sign')), 36, 48),
    'clinic': (site_generic(['clinic', 'doctors', 'dentist', 'veterinary'], bw=(18, 26), bd=(14, 18), levels=1), 40, 52),
    'fire_station': (site_generic('fire_station', kind='fire_station', style='lowrise', bw=(24, 28), bd=(16, 20), h=(6.5, 7.5), sb=(14, 16), props=('flagpole',)), 42, 50),
    'police': (site_generic('police', kind='police', style='lowrise', bw=(26, 32), bd=(16, 20), h=(6.5, 8), props=('flagpole',)), 44, 54),
    'post_office': (site_generic('post_office', kind='public', style='lowrise', bw=(18, 24), bd=(14, 18), props=('mailbox_blue', 'flagpole')), 38, 48),
    'library': (site_generic('library', kind='public', style='lowrise', bw=(24, 30), bd=(18, 22), h=(5.5, 7), props=('bike_rack',)), 44, 54),
    'community_center': (site_generic('community_centre', kind='public', style='lowrise', bw=(24, 32), bd=(18, 24), h=(5.5, 7)), 46, 58),
    'laundromat': (site_generic('laundry', bw=(12, 16), bd=(12, 16)), 32, 40),
    'tiki_bar': (site_generic(['bar', 'bar', 'pub', 'restaurant'], kind='roof', style='canopy', bw=(14, 20), bd=(12, 16), h=(4.4, 5.4), d=44, sb=(14, 18), roof='hip', props=('tiki_torch', 'neon_sign', 'tiki_torch')), 36, 50),
    'bait_shop': (site_generic('fishing', style='cabin', bw=(10, 14), bd=(8, 11), h=(3.8, 4.6), d=36, sb=(12, 15), roof='gable', props=('ice_freezer', 'bait_tank', 'pylon_sign')), 30, 40),
    'dive_shop': (site_generic('scuba_diving', style='cabin', bw=(12, 17), bd=(10, 13), h=(4.2, 5.2), d=40, sb=(13, 16), roof='gable', props=('dive_flag', 'tank_rack', 'pylon_sign')), 32, 44),
    'gift_shop': (site_generic(['gift', 'souvenir', 'art', 'swimwear', 'surf'], style='cabin', bw=(11, 16), bd=(9, 13), h=(4.0, 5.0), d=38, sb=(12, 15), roof='gable', props=('shell_display', 'pylon_sign')), 30, 42),
    'seafood_market': (site_generic(['seafood', 'restaurant'], style='cabin', bw=(12, 18), bd=(10, 14), h=(4.2, 5.0), d=40, sb=(13, 16), roof='gable', props=('crab_traps', 'pylon_sign')), 32, 44),
    'farm_stand': (site_generic(['greengrocer', 'farm'], kind='roof', style='canopy', bw=(9, 13), bd=(6, 8), h=(3.4, 4.0), d=30, sb=(10, 12), roof='gable', zone='rural', props=('produce_crates', 'hand_painted_sign')), 28, 36),
    'nursery': (site_generic('garden_centre', kind='greenhouse', style='industrial', bw=(22, 30), bd=(14, 20), h=(4.5, 5.5), d=50, zone='rural', props=('plant_racks',)), 40, 54),
}


def poi_picker(pool, name):
    """Returns pick(rnd) cycling through a shuffled pool so neighbors differ and the mix stays broad."""
    state = {'bag': [], 'last': None}
    seed = rng('poi', name)

    def pick(rnd):
        if not state['bag']:
            state['bag'] = list(pool)
            seed.shuffle(state['bag'])
        p = state['bag'].pop()
        if p == state['last'] and state['bag']:
            q = state['bag'].pop()
            state['bag'].append(p)
            p = q
        state['last'] = p
        return p
    return pick


# ------------------------------------------------------------------------------------------------ frontage walking
PROGRAMS = {
    # zone: list of (weight, template name | lot fn name)
    'strip': [(5, 'strip_mall'), (1.6, 'gas'), (2.4, 'fast_food'), (0.8, 'big_box'), (0.5, 'motel'), (0.8, 'bank'), (1.6, 'restaurant'), (0.5, 'car_dealer'),
              (0.4, 'church'), (0.4, 'storage'), (0.6, 'pharmacy'), (0.8, 'auto_repair'), (0.4, 'clinic'), (0.25, 'laundromat')],
    'strip_small': [(3, 'strip_mall'), (1.4, 'gas'), (2, 'fast_food'), (1, 'bank'), (2, 'restaurant'), (0.6, 'church'), (0.8, 'auto_repair'), (0.5, 'clinic'),
                    (0.5, 'laundromat'), (0.4, 'park'), (0.5, 'pharmacy')],
    'keys': [(2.2, 'tiki_bar'), (1.6, 'bait_shop'), (1.5, 'dive_shop'), (1.6, 'motel'), (2, 'restaurant'), (1, 'gas'), (1.6, 'gift_shop'), (1.2, 'seafood_market'),
             (0.5, 'rv_park'), (0.5, 'church'), (0.8, 'strip_mall'), (0.4, 'laundromat'), (0.4, 'bank')],
    'rural_strip': [(1.2, 'gas'), (1.5, 'farm_stand'), (1, 'restaurant'), (0.8, 'auto_repair'), (0.8, 'church'), (0.8, 'nursery'), (0.5, 'motel'), (0.5, 'bait_shop'),
                    (0.4, 'rv_park'), (0.4, 'storage')],
}
LOTS = {
    'house': (lot_house, 19, 27), 'house_small': (lot_house, 15, 20), 'house_big': (lot_house, 26, 36), 'stilt': (lot_house, 15, 22),
    'mobile': (lot_mobile, 10.5, 13.5), 'apartment': (lot_apartment, 30, 52), 'shopfront': (lot_shopfront, 6.5, 13.5), 'warehouse': (lot_warehouse, 36, 64),
}


def walk(world, road, side, zone, ctx=None, s0=None, s1=None, gap=(0.0, 1.5), fill=1.0, seed=None):
    """Fill one side of a road edge with lots / sites of the given zone. Returns the number placed."""
    ctx = dict(ctx or {})
    L = plen(road.pts)
    rnd = rng('walk', seed or road.id, side, zone)
    s = (10.0 if s0 is None else s0) + rnd.uniform(0, 3)
    end = L - (10.0 if s1 is None else (L - s1))
    ctx['edge'] = road.width / 2.0 + road.tags.get('verge', 2.8)
    n = 0
    fails = 0
    prog = PROGRAMS.get(zone)
    while s < end - 6:
        if prog:
            tot = sum(wt for wt, _ in prog)
            x = rnd.uniform(0, tot)
            for wt, nm in prog:
                x -= wt
                if x <= 0:
                    break
            fn, w0, w1 = TEMPLATES[nm]
        elif zone in TEMPLATES:
            fn, w0, w1 = TEMPLATES[zone]
        else:
            fn, w0, w1 = LOTS[zone]
        w = rnd.uniform(w0, w1)
        if s + w > end:
            if end - s >= w0:
                w = end - s
            else:
                # try the smallest thing that still fits
                if prog and end - s >= 30:
                    s += 4.0
                    fails += 1
                    if fails > 6:
                        break
                    continue
                break
        if rnd.random() > fill:
            s += w
            continue
        F = frontage_frame(road, side, s, w)
        ok = False
        if F is not None:
            if zone == 'stilt':
                ctx.setdefault('style', 'stilt')
            ok = fn(world, F, w, rnd, ctx)
        if ok:
            n += 1
            s += w + rnd.uniform(*gap)
            fails = 0
        else:
            s += 5.0 if zone not in ('shopfront',) else 2.0
            fails += 1
    return n


def place_site(world, road, side, s, name, ctx=None, w=None, seed=None):
    """Place one named template at arc length s (tries a few nearby positions)."""
    fn, w0, w1 = TEMPLATES[name] if name in TEMPLATES else LOTS[name]
    rnd = rng('site', seed or road.id, side, name, round(s))
    ctx = dict(ctx or {})
    ctx['edge'] = road.width / 2.0 + road.tags.get('verge', 2.8)
    L = plen(road.pts)
    w = w or rnd.uniform(w0, min(w1, w0 + 20))
    for ds in (0, 8, -8, 16, -16, 26, -26, 40, -40, 60, -60):
        ss = s + ds - w / 2
        if ss < 6 or ss + w > L - 6:
            continue
        F = frontage_frame(road, side, ss, w)
        if F is not None and fn(world, F, w, rnd, ctx):
            return True
    return False


def roads_in(world, poly, kinds=None, min_len=18.0):
    out = []
    for r in world.roads:
        if kinds and r.kind not in kinds:
            continue
        if r.bridge or r.tags.get('site') or r.tags.get('nolots') or (r.y and max(r.y) > 0.6):
            continue
        if plen(r.pts) < min_len:
            continue
        mid = r.pts[len(r.pts) // 2]
        if poly.contains(Point(mid)):
            out.append(r)
    return out


def fill_district(world, poly, zone_by_kind, ctx=None, seed='', specials=None, fill=1.0):
    """Walk both sides of every road inside poly. zone_by_kind: {road kind: zone} (falls back to road.zl / road.zr).
    specials: list of (template name, ctx) placed first on the highest-class roads so each district gets its civic set."""
    ctx = ctx or {}
    rs = sorted(roads_in(world, poly), key=lambda r: (RANK[r.kind], -plen(r.pts)))
    n = 0
    if specials:
        rnd = rng('specials', seed)
        cand = [r for r in rs if RANK[r.kind] <= RANK['tertiary'] and plen(r.pts) > 90] or [r for r in rs if plen(r.pts) > 90] or rs
        for k, (nm, c) in enumerate(specials):
            done = False
            order = list(cand)
            rnd.shuffle(order)
            for r in order[:40]:
                cc = dict(ctx)
                cc.update(c or {})
                if place_site(world, r, rnd.choice([1, -1]), plen(r.pts) * rnd.uniform(0.25, 0.75), nm, cc, seed=(seed, k)):
                    done = True
                    n += 1
                    break
            if not done:
                world.log.append(f'fill_district {seed}: could not place {nm}')
    for r in rs:
        for side, zattr in ((1, r.zr), (-1, r.zl)):
            z = zattr or zone_by_kind.get(r.kind)
            if not z or z == 'none':
                continue
            n += walk(world, r, side, z, ctx, seed=(seed, r.id), fill=fill)
    return n


# ------------------------------------------------------------------------------------------------ street patterns
def clip_line(pts, poly):
    g = LineString(pts).intersection(poly)
    out = []
    for ln in (g.geoms if hasattr(g, 'geoms') else [g]):
        if ln.geom_type == 'LineString' and ln.length > 1:
            out.append(list(ln.coords))
    return out


def grid(world, poly, origin, ang, du, dv, namer_u, namer_v, kind='residential', region='', zone=None, skip_u=0.0, skip_v=0.0, seed='', min_len=45.0,
         jitter=0.0, kind_u=None, kind_v=None, tags=None):
    """Street grid clipped to poly. u-lines run along direction `ang` (spaced dv apart); v-lines run across (spaced du apart).
    namer_u(k) / namer_v(k) give street names by line index."""
    rnd = rng('grid', seed)
    minx, minz, maxx, maxz = poly.bounds
    R = math.hypot(maxx - minx, maxz - minz) + 50
    c, s = math.cos(ang), math.sin(ang)
    made = []
    n_u = int(R / dv) + 2
    n_v = int(R / du) + 2
    for k in range(-n_u, n_u + 1):
        if rnd.random() < skip_u:
            continue
        off = k * dv + rnd.uniform(-jitter, jitter)
        p0 = (origin[0] - c * R - s * off, origin[1] - s * R + c * off)
        p1 = (origin[0] + c * R - s * off, origin[1] + s * R + c * off)
        for seg in clip_line([p0, p1], poly):
            if plen(seg) >= min_len:
                made.append(world.road(seg, kind_u or kind, namer_u(k), region=region, zl=zone, zr=zone, tags=tags))
    for k in range(-n_v, n_v + 1):
        if rnd.random() < skip_v:
            continue
        off = k * du + rnd.uniform(-jitter, jitter)
        p0 = (origin[0] + c * off + s * R, origin[1] + s * off - c * R)
        p1 = (origin[0] + c * off - s * R, origin[1] + s * off + c * R)
        for seg in clip_line([p0, p1], poly):
            if plen(seg) >= min_len:
                made.append(world.road(seg, kind_v or kind, namer_v(k), region=region, zl=zone, zr=zone, tags=tags))
    return made


def subdivision(world, poly, origin, ang, du, dv, namer, region='', zone='house', seed='', wave=(28.0, 420.0), drop=0.42, kind='residential'):
    """Curvilinear suburban streets: a warped grid whose cross links are mostly dropped, leaving long loops and cul-de-sacs."""
    rnd = rng('subdiv', seed)
    minx, minz, maxx, maxz = poly.bounds
    R = math.hypot(maxx - minx, maxz - minz) / 2 + 60
    cx, cz = (minx + maxx) / 2, (minz + maxz) / 2
    c, s = math.cos(ang), math.sin(ang)
    amp, wl = wave
    ph1, ph2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)

    def warp(u, v):
        uu = u + amp * 0.6 * math.sin(v / wl * 6.283 + ph2)
        vv = v + amp * math.sin(u / wl * 6.283 + ph1)
        return (cx + c * uu - s * vv, cz + s * uu + c * vv)

    nu, nv = int(R / du) + 1, int(R / dv) + 1
    made = []
    inner = poly.buffer(-6)
    if inner.is_empty:
        return made
    k = 0
    # long streets along u
    for j in range(-nv, nv + 1):
        pts = [warp(i * 12.0, j * dv) for i in range(int(-R / 12), int(R / 12) + 1)]
        for seg in clip_line(pts, inner):
            if plen(seg) > 55:
                made.append(world.road(seg, kind, namer(k), region=region, zl=zone, zr=zone))
                k += 1
    # cross links, mostly dropped; kept ones are short connector streets
    for i in range(-nu, nu + 1):
        for j in range(-nv, nv):
            if rnd.random() < drop:
                continue
            pts = [warp(i * du, j * dv + t * dv / 6.0) for t in range(7)]
            for seg in clip_line(pts, inner):
                if plen(seg) > dv * 0.8:
                    made.append(world.road(seg, kind, namer(k), region=region, zl=zone, zr=zone))
                    k += 1
    return made


def canal_fingers(world, origin, ang, n, length, pitch=132.0, canal_w=24.0, namer=None, region='', zone='house', ctx=None, spine_name='', side=1,
                  spine_kind='tertiary', mouth=40.0):
    """Canal-front subdivision (the classic South Florida / Keys pattern): a spine road, finger streets every `pitch`
    meters running `length` meters toward the water, and finger canals between them open to the water at the far end.
    origin = start of the spine; ang = spine direction; side = +1 fingers to the right of the spine.
    Returns (spine road, [finger roads], [canal polygons])."""
    c, s = math.cos(ang), math.sin(ang)
    nx, nz = (-s, c) if side > 0 else (s, -c)

    def P(u, v):
        return (origin[0] + c * u + nx * v, origin[1] + s * u + nz * v)

    spine = world.road([P(-20, 0), P(n * pitch + 20, 0)], spine_kind, spine_name, region=region, zr=zone if side < 0 else None, zl=zone if side > 0 else None)
    fingers, canals = [], []
    for i in range(n):
        u = i * pitch + pitch * 0.5
        nm = namer(i) if namer else ''
        fingers.append(world.road([P(u, 0), P(u, length - 26)], 'residential', nm, region=region, zl=zone, zr=zone, tags={'canal_lots': 1, 'culdesac': 1}))
        world.prop(*P(u, length - 26), 'culdesac')
    for i in range(n + 1):
        u = i * pitch
        canal = Polygon([P(u - canal_w / 2, 46), P(u + canal_w / 2, 46), P(u + canal_w / 2, length + mouth), P(u - canal_w / 2, length + mouth)])
        canals.append(canal)
    return spine, fingers, canals


# ------------------------------------------------------------------------------------------------ dressing
def scatter_trees(world, poly, n, types, seed, avoid=('bldg', 'road', 'water'), margin=3.0):
    rnd = rng('trees', seed)
    minx, minz, maxx, maxz = poly.bounds
    placed, tries = 0, 0
    while placed < n and tries < n * 12:
        tries += 1
        x, z = rnd.uniform(minx, maxx), rnd.uniform(minz, maxz)
        p = Point(x, z)
        if not poly.contains(p) or not world.on_land(p):
            continue
        if world.idx.hit(p, avoid, margin):
            continue
        world.tree(x, z, rnd.choice(types))
        placed += 1
    return placed


def power_line(world, pts, name, spacing=46.0, offset=0.0, kind='power_pole'):
    """Pole line along a polyline (usually a road, offset to one side). Poles skip water."""
    line = offset_line(pts, offset) if offset else list(pts)
    cum = cumlen(line)
    L = cum[-1]
    n = max(1, int(L / spacing))
    poles = []
    for i in range(n + 1):
        x, z, dx, dz = point_at(line, L * i / n, cum)
        if not world.on_land(Point(x, z)) or world.idx.hit(Point(x, z), ('bldg', 'road', 'water'), 0.8):
            continue
        world.prop(x, z, kind, heading_of(dx, dz), line=name)
        poles.append((round(x, 1), round(z, 1)))
    if len(poles) >= 2:
        world.powerlines.append(dict(name=name, kind='transmission' if kind == 'pylon' else 'distribution', poles=poles))
    return len(poles)


def street_furniture(world, urban_poly=None):
    """Signals / stop signs at junctions, street lamps along built-up streets, bus stops on arterials."""
    from collections import defaultdict
    nodes = defaultdict(list)
    for r in world.roads:
        if r.tags.get('site'):
            continue
        nodes[r.pts[0]].append((r, 0))
        nodes[r.pts[-1]].append((r, -1))
    ns = nst = 0
    for p, legs in nodes.items():
        if len(legs) < 3:
            continue
        if not (REAL_OUT(p)):
            continue
        ranks = sorted(RANK[r.kind] for r, _ in legs)
        if any(r.kind in ('motorway',) for r, _ in legs):
            continue
        big = sum(1 for k in ranks if k <= RANK['secondary'])
        mid = sum(1 for k in ranks if k <= RANK['tertiary'])
        elevated = any((r.y and (r.y[0] if e == 0 else r.y[-1]) > 1.0) for r, e in legs)
        if elevated:
            continue
        if big >= 3 or (big >= 2 and mid >= 3):
            world.prop(p[0], p[1], 'signal', legs=len(legs))
            ns += 1
        elif len(legs) >= 3 and ranks[-1] >= RANK['residential'] and ranks[-1] < RANK['track']:
            # stop sign on each minor approach
            lo = min(ranks)
            for r, e in legs:
                if RANK[r.kind] > lo or (ranks.count(lo) >= 3):
                    q = r.pts[1] if e == 0 else r.pts[-2]
                    dx, dz = p[0] - q[0], p[1] - q[1]
                    L = math.hypot(dx, dz) or 1.0
                    dx, dz = dx / L, dz / L
                    back = min(9.0, L * 0.6)
                    off = r.width / 2 + 1.2
                    world.prop(p[0] - dx * back - dz * off, p[1] - dz * back + dx * off, 'stop', heading_of(-dx, -dz))
                    nst += 1
    return ns, nst


def REAL_OUT(p):
    from .util import REAL
    return not (REAL['minX'] <= p[0] <= REAL['maxX'] and REAL['minZ'] <= p[1] <= REAL['maxZ'])


def lamps_along(world, roads, spacing=44.0, seed='lamps'):
    n = 0
    for r in roads:
        if r.tags.get('site') or r.kind in ('track',):
            continue
        cum = cumlen(r.pts)
        L = cum[-1]
        if L < 30:
            continue
        k = 0
        s = spacing * 0.5
        while s < L - 8:
            x, z, dx, dz = point_at(r.pts, s, cum)
            side = 1 if k % 2 == 0 else -1
            off = (r.width / 2 + 1.1) * side
            px, pz = x - dz * off, z + dx * off
            if r.bridge or world.on_land(Point(px, pz)):
                world.prop(px, pz, 'lamp', heading_of(-dz * -side, dx * -side))
                n += 1
            s += spacing
            k += 1
    return n
