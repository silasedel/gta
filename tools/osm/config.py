"""Shared constants for the Miami OSM pipeline (must match CONTRACT4 world frame)."""
import math

# V1 rectangle (kept for reference): (25.7550, -80.2020, 25.8030, -80.1200), about 8.2 x 5.3 km.
V1_BBOX = (25.7550, -80.2020, 25.8030, -80.1200)

# The real rectangle stays exactly the V1 one (lead decision, Nov 13): x -3709 .. 4511, z -2654 .. 2654.
# The fresh V2 pull (cache/v2, a superset) only improves attributes inside it.
REAL_RECT = None          # set below from V1_BBOX once proj() exists
FETCH_PAD_M = 850.0       # real OSM land and roads are known this far beyond the rectangle (edge summary, road rescue)
COAST_PAD = 0.04          # coastline fetched with a padded bbox so chains are continuous

LAT0 = 25.7790
LON0 = -80.1650
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0

SEA_LEVEL = -0.12
TILE = 200.0


def proj(lon, lat):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


REAL_RECT = (proj(V1_BBOX[1], V1_BBOX[2])[0], proj(V1_BBOX[1], V1_BBOX[2])[1], proj(V1_BBOX[3], V1_BBOX[0])[0], proj(V1_BBOX[3], V1_BBOX[0])[1])
# Stage 1 map v3: MIAMI_NO_OSM=1 builds the world from features.json alone (the user's traced map, no real-Miami data).
# The real rectangle then comes from features.json (a 10 m box parked in the open ocean) and every OSM load is empty.
import os as _os0
NO_OSM = _os0.environ.get('MIAMI_NO_OSM') == '1'
if NO_OSM:
    try:
        import json as _j0
        _fp = _os0.environ.get('WORLD_FEATURES') or _os0.path.join(_os0.path.dirname(_os0.path.abspath(__file__)), '..', 'world', 'out', 'features.json')
        with open(_fp) as _f0:
            _head = _f0.read(4000)
        import re as _re0
        _m = _re0.search(r'"realRect":(\{[^}]*\})', _head)
        _rr = _j0.loads(_m.group(1)) if _m else None
        if _rr: REAL_RECT = (_rr['minX'], _rr['minZ'], _rr['maxX'], _rr['maxZ'])
    except Exception as _e0:
        print('config: NO_OSM could not read realRect from features', _e0)


def unproj(x, z):
    return (LON0 + x / KX, LAT0 - z / KZ)


def _bbox(pad_m=0.0):
    x0, z0, x1, z1 = REAL_RECT
    w, n = unproj(x0 - pad_m, z0 - pad_m)
    e, s = unproj(x1 + pad_m, z1 + pad_m)
    return (round(s, 5), round(w, 5), round(n, 5), round(e, 5))


# (south, west, north, east) in degrees: the real rectangle, and the rectangle the V2 pull was fetched for
# (it was sized for a larger real area; kept so the cache stays valid).
BBOX = V1_BBOX
FETCH_BBOX = (25.74463, -80.21887, 25.81879, -80.11512)


def real_bounds():
    """World-meter bounds of the real (OSM) rectangle: minX, minZ, maxX, maxZ."""
    return REAL_RECT


# ---- V2 world: the synthetic landmass from tools/world/out/features.json wraps the real rectangle.
import json as _json, os as _os  # noqa: E402
_HERE = _os.path.dirname(_os.path.abspath(__file__))
FEATURES = _os.environ.get('WORLD_FEATURES') or _os.path.join(_HERE, '..', 'world', 'out', 'features.json')
if _os.environ.get('WORLD_FEATURES') == 'none':
    FEATURES = None


def _snap(v, up):
    return (math.ceil(v / TILE - 1e-9) if up else math.floor(v / TILE + 1e-9)) * TILE


def world_bounds():
    """Bounds of the whole merged world (minX, minZ, maxX, maxZ), snapped outward to whole tiles.
    Without a features file the world is just the real rectangle."""
    x0, z0, x1, z1 = REAL_RECT
    if FEATURES and _os.path.exists(FEATURES):
        try:
            with open(FEATURES) as f:
                head = f.read(4096)
            # bounds sit near the top of the file; fall back to a full parse if not
            import re as _re
            m = _re.search(r'"bounds"\s*:\s*(\{[^}]*\})', head)
            b = _json.loads(m.group(1)) if m else _json.load(open(FEATURES))['bounds']
            x0, z0 = min(x0, _snap(b['minX'], False)), min(z0, _snap(b['minZ'], False))
            x1, z1 = max(x1, _snap(b['maxX'], True)), max(z1, _snap(b['maxZ'], True))
        except Exception as ex:  # noqa: BLE001
            print('config: could not read world bounds from', FEATURES, ex)
    return (x0, z0, x1, z1)


def bounds():
    """Bounds used by rasters and tiles: the whole merged world."""
    return world_bounds()
