#!/usr/bin/env python3
"""Fetch raw OSM data for the V2 real-Miami rectangle from the Overpass API.

Polite: a handful of large queries, cached under tools/osm/cache/v2/, retried with backoff
across mirrors. The V1 pull stays untouched in tools/osm/cache/*.json.
Usage: tools/osm/.venv/bin/python tools/osm/fetch.py [--force] [name ...]
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache', 'v2')
sys.path.insert(0, HERE)
from config import FETCH_BBOX, COAST_PAD  # noqa: E402

ENDPOINTS = [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]


def bb(pad=0.0):
    s, w, n, e = FETCH_BBOX
    return f'{s - pad:.5f},{w - pad:.5f},{n + pad:.5f},{e + pad:.5f}'


B = bb()
QUERIES = {
    # Every way that is a road, rail, pier or bridge, with full geometry and node ids
    # (node ids are needed to resolve turn restrictions and route relations).
    'highways': f"""[out:json][timeout:600][maxsize:1073741824];
(
  way["highway"]({B});
  way["railway"]({B});
  way["man_made"~"pier|breakwater|groyne|bridge"]({B});
  way["bridge"]({B});
  way["aeroway"]({B});
);
out body geom;""",
    # Turn restrictions and transit routes (member refs only; resolved against 'highways').
    'relations': f"""[out:json][timeout:600];
(
  relation["type"="restriction"]({B});
  relation["type"="route"]["route"~"bus|trolleybus|monorail|light_rail|subway|train|tram|ferry|bicycle"]({B});
  relation["type"="route_master"]({B});
  relation["type"="route"]["route"="road"]({B});
);
out body;""",
    'buildings': f"""[out:json][timeout:600][maxsize:1073741824];
(
  way["building"]({B});
  relation["building"]({B});
  way["building:part"]({B});
  relation["building:part"]({B});
);
out body geom;""",
    'areas': f"""[out:json][timeout:600][maxsize:1073741824];
(
  way["natural"]({B});
  relation["natural"]({B});
  way["landuse"]({B});
  relation["landuse"]({B});
  way["leisure"]({B});
  relation["leisure"]({B});
  way["water"]({B});
  relation["water"]({B});
  way["waterway"]({B});
  relation["waterway"]({B});
  way["amenity"]({B});
  relation["amenity"]({B});
  way["tourism"]({B});
  relation["tourism"]({B});
  way["shop"]({B});
  relation["shop"]({B});
  way["office"]({B});
  way["craft"]({B});
  way["healthcare"]({B});
  way["emergency"]({B});
  way["public_transport"]({B});
  way["power"~"substation|plant"]({B});
  way["area:highway"]({B});
  way["place"]({B});
  relation["place"]({B});
  way["man_made"]({B});
  way["barrier"]({B});
  way["golf"]({B});
);
out body geom;""",
    'coastline': f"""[out:json][timeout:600];
way["natural"="coastline"]({bb(COAST_PAD)});
out body geom;""",
    'pois': f"""[out:json][timeout:600][maxsize:1073741824];
(
  node["shop"]({B});
  node["amenity"]({B});
  node["tourism"]({B});
  node["leisure"]({B});
  node["office"]({B});
  node["craft"]({B});
  node["healthcare"]({B});
  node["emergency"]({B});
  node["place"]({bb(0.02)});
  node["highway"]({B});
  node["railway"]({B});
  node["public_transport"]({B});
  node["natural"="tree"]({B});
  node["man_made"]({B});
  node["barrier"]({B});
  node["entrance"]({B});
  node["power"]({B});
  node["traffic_sign"]({B});
  node["advertising"]({B});
  node["aeroway"]({B});
  node["historic"]({B});
);
out body;""",
    # Address points (types only are published; house numbers and streets place storefronts).
    'addresses': f"""[out:json][timeout:600][maxsize:1073741824];
(
  node["addr:housenumber"]({B});
);
out body;""",
    'districts': f"""[out:json][timeout:600];
(
  relation["boundary"="administrative"]["admin_level"~"8|9|10"]({B});
  relation["place"~"neighbourhood|suburb|quarter"]({B});
  way["place"~"neighbourhood|suburb|quarter|island|islet"]({B});
);
out body geom;""",
}


def fetch(name, q, force=False):
    path = os.path.join(CACHE, f'{name}.json')
    if os.path.exists(path) and not force:
        print(f'[cache] {name}: {os.path.getsize(path)/1e6:.1f} MB', flush=True)
        return False
    data = urllib.parse.urlencode({'data': q}).encode()
    delay = 8
    for attempt in range(12):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            t0 = time.time()
            req = urllib.request.Request(url, data=data, headers={
                'User-Agent': 'PortSolana-game-data-builder/2.0 (offline one-time extract)'})
            with urllib.request.urlopen(req, timeout=240) as r:
                body = r.read()
            j = json.loads(body)
            if 'remark' in j and ('error' in j['remark'].lower() or not j.get('elements')):
                raise RuntimeError('overpass remark: ' + j['remark'])
            tmp = path + '.tmp'
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, path)
            print(f'[ok] {name}: {len(j["elements"])} elements, {len(body)/1e6:.1f} MB in {time.time()-t0:.0f}s from {url}', flush=True)
            return True
        except Exception as ex:  # noqa: BLE001
            print(f'[retry {attempt}] {name} @ {url}: {ex}; sleeping {delay}s', flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 120)
    raise SystemExit(f'failed to fetch {name}')


if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    force = '--force' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for name, q in QUERIES.items():
        if only and name not in only:
            continue
        if fetch(name, q, force):
            time.sleep(4)
