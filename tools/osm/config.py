"""Shared constants for the Miami OSM pipeline (must match CONTRACT4 world frame)."""
import math

# (south, west, north, east) in degrees. Brickell .. Downtown .. PortMiami .. islands .. South Beach up to ~23rd St.
BBOX = (25.7550, -80.2020, 25.8030, -80.1200)
COAST_PAD = 0.04          # coastline fetched with a padded bbox so chains are continuous

LAT0 = 25.7790
LON0 = -80.1650
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110574.0

SEA_LEVEL = -0.12
TILE = 200.0


def proj(lon, lat):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)


def bounds():
    s, w, n, e = BBOX
    x0, z1 = proj(w, s)
    x1, z0 = proj(e, n)
    return x0, z0, x1, z1
