"""World container: land, water, areas, roads, buildings, POIs, props ... plus the occupancy index used so that
nothing is ever placed on top of something else. Region modules only talk to this API.
"""
import math
from collections import defaultdict
from shapely.geometry import Polygon, LineString, Point, MultiPolygon, box as sbox
from shapely.ops import unary_union
from shapely.prepared import prep
from .util import BOUNDS, REAL, r2, rng

ROAD_KINDS = ('motorway', 'motorway_link', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'track')
RANK = {k: i for i, k in enumerate(ROAD_KINDS)}
DEFAULT_SPEED = {'motorway': 105, 'motorway_link': 65, 'trunk': 80, 'primary': 64, 'secondary': 56, 'tertiary': 48, 'residential': 40, 'service': 24, 'track': 24}


def road_width(kind, lanes, oneway=False):
    if kind == 'motorway':
        return lanes * 3.65 + 5.0
    if kind == 'motorway_link':
        return lanes * 3.65 + 3.0
    if kind == 'trunk':
        return lanes * 3.5 + (5.0 if lanes >= 4 and not oneway else 2.0)
    if kind == 'primary':
        return lanes * 3.4 + (3.0 if lanes >= 4 and not oneway else 1.4)
    if kind == 'secondary':
        return lanes * 3.3 + 1.0
    if kind == 'tertiary':
        return max(7.4, lanes * 3.3 + 0.8)
    if kind == 'residential':
        return max(6.6, lanes * 3.2 + 0.6) if lanes >= 2 else 4.4
    if kind == 'service':
        return 5.4 if lanes >= 2 else 3.8
    return 3.6


class Road:
    __slots__ = ('id', 'pts', 'kind', 'name', 'ref', 'lf', 'lb', 'oneway', 'speed', 'bridge', 'y', 'surface', 'layer', 'zl', 'zr',
                 'tags', 'width', 'region', 'bclass')

    def __init__(self, pts, kind, name='', ref='', lf=1, lb=1, oneway=False, speed=None, bridge=False, y=None, surface=None,
                 layer=0, zl=None, zr=None, tags=None, region='', bclass=None):
        self.id = None
        self.pts = [r2(p) for p in pts]
        self.kind = kind
        self.name = name
        self.ref = ref
        self.lf = lf
        self.lb = 0 if oneway else lb
        self.oneway = oneway
        self.speed = speed or DEFAULT_SPEED[kind]
        self.bridge = bridge
        self.y = y
        self.surface = surface or ('concrete' if kind in ('motorway', 'motorway_link') else 'dirt' if kind == 'track' else 'asphalt')
        self.layer = layer
        self.zl = zl          # lot zoning on the left / right of travel (None = no lots)
        self.zr = zr
        self.tags = dict(tags or {})
        self.width = road_width(kind, self.lf + self.lb, oneway)
        self.region = region
        self.bclass = bclass  # bridge class override: 'low' | 'mid' | 'high' | 'flat'

    def copy_with(self, pts, y=None):
        r = Road(pts, self.kind, self.name, self.ref, self.lf, self.lb, self.oneway, self.speed, self.bridge, y, self.surface,
                 self.layer, self.zl, self.zr, self.tags, self.region, self.bclass)
        r.width = self.width
        return r

    @property
    def line(self):
        return LineString(self.pts)


class Index:
    """Uniform-grid spatial hash of tagged shapely geometries."""

    def __init__(self, cell=80.0):
        self.cell = cell
        self.cells = defaultdict(list)
        self.items = []

    def _range(self, b, m=0.0):
        c = self.cell
        return (int(math.floor((b[0] - m) / c)), int(math.floor((b[1] - m) / c)), int(math.floor((b[2] + m) / c)), int(math.floor((b[3] + m) / c)))

    def add(self, geom, tag, data=None):
        if geom is None or geom.is_empty:
            return
        i = len(self.items)
        b = geom.bounds
        self.items.append((geom, tag, b, data))
        x0, z0, x1, z1 = self._range(b)
        for cx in range(x0, x1 + 1):
            for cz in range(z0, z1 + 1):
                self.cells[(cx, cz)].append(i)

    def near(self, geom, tags=None, margin=0.0):
        b = geom.bounds
        x0, z0, x1, z1 = self._range(b, margin)
        seen = set()
        for cx in range(x0, x1 + 1):
            for cz in range(z0, z1 + 1):
                for i in self.cells.get((cx, cz), ()):
                    if i in seen:
                        continue
                    seen.add(i)
                    g, t, gb, data = self.items[i]
                    if tags is not None and t not in tags:
                        continue
                    if gb[0] - margin > b[2] or gb[2] + margin < b[0] or gb[1] - margin > b[3] or gb[3] + margin < b[1]:
                        continue
                    yield g, t, data

    def hit(self, geom, tags=None, margin=0.0):
        for g, t, data in self.near(geom, tags, margin):
            if margin > 0:
                if g.distance(geom) < margin:
                    return True
            elif g.intersects(geom):
                return True
        return False


class World:
    def __init__(self):
        self.land = None            # shapely (Multi)Polygon: all land incl. the real land in the padded box
        self._land_prep = None
        self.real_poly = sbox(REAL['minX'], REAL['minZ'], REAL['maxX'], REAL['maxZ'])
        self.real_keepout = self.real_poly.buffer(-0.01)
        self.water = []             # inland water + man-made tidal cuts: dict(id, kind, name, poly, depth)
        self.areas = []             # dict(id, kind, name, poly)
        self.raw_roads = []         # Road objects before the network is finalized
        self.roads = []             # final graph edges (Road objects with ids)
        self.paths = []
        self.buildings = []
        self.pois = []
        self.props = []
        self.trees = []
        self.places = []
        self.joins = []
        self.setpieces = []
        self.powerlines = []
        self.regions = {}           # name -> polygon (layout.json)
        self.extra = {}             # layout.json extras (airport, underwater, routes ...)
        self.idx = Index(80.0)      # occupancy
        self.terrain = None
        self.edge = None
        self.realdata = None
        self.count = defaultdict(int)
        self.log = []

    # ------------------------------------------------------------------ ids
    def nid(self, prefix):
        self.count[prefix] += 1
        return f'{prefix}{self.count[prefix]}'

    # ------------------------------------------------------------------ land / water
    def set_land(self, geom):
        self.land = geom
        self._land_prep = None

    @property
    def land_prep(self):
        if self._land_prep is None:
            self._land_prep = prep(self.land)
        return self._land_prep

    def on_land(self, geom):
        return self.land_prep.contains(geom)

    def fill_land(self, poly):
        self.set_land(unary_union([self.land, poly]))

    def cut_sea(self, poly, kind='canal', name=None, depth=2.4):
        """Carve tidal water (canal, marina basin, harbor) out of the land. Recorded as a water feature too."""
        poly = poly.difference(self.real_keepout)
        if poly.is_empty:
            return
        self.set_land(self.land.difference(poly))
        for p in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
            if p.area > 20:
                self.water.append(dict(id=self.nid('w'), kind=kind, name=name, poly=p, depth=depth, tidal=True))
                self.idx.add(p, 'water')

    def add_water(self, poly, kind, name=None, depth=1.8):
        poly = poly.difference(self.real_keepout)
        for p in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
            if p.geom_type == 'Polygon' and p.area > 20:
                self.water.append(dict(id=self.nid('w'), kind=kind, name=name, poly=p, depth=depth, tidal=False))
                self.idx.add(p, 'water')

    def add_area(self, poly, kind, name=None, clip=True, block=None):
        if poly is None or poly.is_empty:
            return
        if clip:
            poly = poly.difference(self.real_keepout)
        for p in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
            if p.geom_type == 'Polygon' and p.area > 12:
                self.areas.append(dict(id=self.nid('a'), kind=kind, name=name, poly=p))
                if block:
                    self.idx.add(p, block)

    def reserve(self, poly, tag='reserved'):
        self.idx.add(poly, tag)

    # ------------------------------------------------------------------ roads
    def road(self, pts, kind, name='', **kw):
        if len(pts) < 2:
            return None
        r = Road(pts, kind, name, **kw)
        self.raw_roads.append(r)
        return r

    # ------------------------------------------------------------------ placement
    def free(self, poly, tags=('bldg', 'road', 'water', 'reserved', 'site'), margin=0.0, need_land=True):
        if need_land and not self.on_land(poly):
            return False
        if poly.intersects(self.real_keepout):
            return False
        return not self.idx.hit(poly, tags, margin)

    def building(self, ring, h, kind, style, zone, levels=None, name=None, poi=None, colour=None, roof=None, roofColour=None,
                 check=True, margin=0.6, region='', tags=None):
        poly = Polygon(ring)
        if not poly.is_valid or poly.area < 6:
            return None
        if check and not self.free(poly, margin=margin):
            return None
        b = dict(id=self.nid('b'), ring=[r2(p) for p in ring], h=round(h, 1), levels=levels or max(1, int(round(h / 3.3))), kind=kind,
                 style=style, zone=zone, region=region)
        if name:
            b['name'] = name
        if poi:
            b['poi'] = {'type': poi} if isinstance(poi, str) else poi
        if colour:
            b['colour'] = colour
        if roof:
            b['roof'] = roof
        if roofColour:
            b['roofColour'] = roofColour
        if tags:
            b.update(tags)
        self.buildings.append(b)
        self.idx.add(poly, 'bldg')
        return b

    def poi(self, x, z, type_, name=None, **kw):
        d = dict(x=round(x, 1), z=round(z, 1), type=type_)
        if name:
            d['name'] = name
        d.update(kw)
        self.pois.append(d)
        return d

    def prop(self, x, z, type_, heading=None, **kw):
        d = dict(x=round(x, 1), z=round(z, 1), type=type_)
        if heading is not None:
            d['heading'] = round(heading, 3)
        d.update(kw)
        self.props.append(d)

    def tree(self, x, z, type_):
        self.trees.append(dict(x=round(x, 1), z=round(z, 1), type=type_))

    def path(self, pts, kind, width, surface, name=None, y=None, **kw):
        d = dict(pts=[r2(p) for p in pts], kind=kind, width=width, surface=surface)
        if name:
            d['name'] = name
        if y is not None:
            d['y'] = y
        d.update(kw)
        self.paths.append(d)
        return d

    def place(self, name, kind, x, z, r):
        self.places.append(dict(name=name, kind=kind, x=round(x), z=round(z), r=round(r)))

    def setpiece(self, id_, x, z, heading, note=None, **kw):
        d = dict(id=id_, x=round(x, 2), z=round(z, 2), heading=round(heading, 4))
        if note:
            d['note'] = note
        d.update(kw)
        self.setpieces.append(d)
