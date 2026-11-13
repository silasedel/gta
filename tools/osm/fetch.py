#!/usr/bin/env python3
"""Fetch raw OSM data for the Miami play area from the Overpass API.

Polite: a handful of large queries, cached under tools/osm/cache/, retried with backoff.
Usage: tools/osm/.venv/bin/python tools/osm/fetch.py [--force]
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
sys.path.insert(0, HERE)
from config import BBOX, COAST_PAD  # noqa: E402

ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]


def bb(pad=0.0):
    s, w, n, e = BBOX
    return f'{s - pad},{w - pad},{n + pad},{e + pad}'


QUERIES = {
    'highways': f"""[out:json][timeout:300];
(
  way["highway"]({bb()});
  way["railway"]({bb()});
  way["man_made"~"pier|breakwater|groyne|bridge"]({bb()});
  way["bridge"]({bb()});
);
out body geom;""",
    'buildings': f"""[out:json][timeout:300];
(
  way["building"]({bb()});
  relation["building"]({bb()});
  way["building:part"]({bb()});
  relation["building:part"]({bb()});
);
out body geom;""",
    'areas': f"""[out:json][timeout:300];
(
  way["natural"]({bb()});
  relation["natural"]({bb()});
  way["landuse"]({bb()});
  relation["landuse"]({bb()});
  way["leisure"]({bb()});
  relation["leisure"]({bb()});
  way["water"]({bb()});
  relation["water"]({bb()});
  way["waterway"]({bb()});
  relation["waterway"]({bb()});
  way["amenity"~"parking|school|university|hospital|marketplace"]({bb()});
  way["area:highway"]({bb()});
  way["place"]({bb()});
  relation["place"]({bb()});
);
out body geom;""",
    'coastline': f"""[out:json][timeout:300];
way["natural"="coastline"]({bb(COAST_PAD)});
out body geom;""",
    'pois': f"""[out:json][timeout:300];
(
  node["shop"]({bb()});
  node["amenity"]({bb()});
  node["tourism"]({bb()});
  node["leisure"]({bb()});
  node["place"]({bb(0.02)});
  node["highway"~"traffic_signals|street_lamp|bus_stop|crossing|stop"]({bb()});
  node["natural"="tree"]({bb()});
  node["man_made"]({bb()});
  way["shop"]({bb()});
  way["amenity"~"restaurant|cafe|bar|pub|fast_food|nightclub|bank|pharmacy|fuel|ice_cream|cinema|theatre"]({bb()});
);
out tags center;""",
    'districts': f"""[out:json][timeout:300];
(
  relation["boundary"="administrative"]["admin_level"~"8|9|10"]({bb()});
  relation["place"~"neighbourhood|suburb|quarter"]({bb()});
  way["place"~"neighbourhood|suburb|quarter|island|islet"]({bb()});
);
out body geom;""",
}


def fetch(name, q, force=False):
    path = os.path.join(CACHE, f'{name}.json')
    if os.path.exists(path) and not force:
        print(f'[cache] {name}: {os.path.getsize(path)/1e6:.1f} MB')
        return
    data = urllib.parse.urlencode({'data': q}).encode()
    delay = 10
    for attempt in range(8):
        url = ENDPOINTS[attempt % len(ENDPOINTS)] if attempt >= 4 else ENDPOINTS[0]
        try:
            t0 = time.time()
            req = urllib.request.Request(url, data=data, headers={
                'User-Agent': 'PortSolana-game-data-builder/1.0 (offline one-time extract)'})
            with urllib.request.urlopen(req, timeout=400) as r:
                body = r.read()
            j = json.loads(body)
            if 'remark' in j and not j.get('elements'):
                raise RuntimeError('overpass remark: ' + j['remark'])
            tmp = path + '.tmp'
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, path)
            print(f'[ok] {name}: {len(j["elements"])} elements, {len(body)/1e6:.1f} MB in {time.time()-t0:.0f}s from {url}')
            return
        except Exception as ex:  # noqa: BLE001
            print(f'[retry {attempt}] {name}: {ex}; sleeping {delay}s')
            time.sleep(delay)
            delay = min(delay * 2, 180)
    raise SystemExit(f'failed to fetch {name}')


if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    force = '--force' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for i, (name, q) in enumerate(QUERIES.items()):
        if only and name not in only:
            continue
        fetch(name, q, force)
        time.sleep(3)
