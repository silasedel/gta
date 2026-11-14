"""Machine trace of the user's official map image (references/ref_40_map_user_official.webp, the user's own image).
Pixels are classified (ocean / shallow / sand / land / inland water / urban / dark forest) and georeferenced with ONE
uniform scale and a translation (no stretch, no rotation):  x = X0 + S * px,  z = Z0 + S * py.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

S = 30.0            # meters per image pixel (pass 6: the image's city + bay + beach is then as wide as real Miami)
X0 = -25450.0       # world x of the image's left edge (least squares on ocean shore, beach bay shore, bayfront)
Z0 = -24890.0       # world z of the image's top edge (barrier island south tip on South Pointe)
IMG = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'references', 'ref_40_map_user_official.webp'))


def w2p(x, z):
    return ((x - X0) / S, (z - Z0) / S)


def p2w(px, py):
    return (X0 + S * px, Z0 + S * py)


def classify():
    a = np.asarray(Image.open(IMG).convert('RGB')).astype(np.float32)
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
    solid0 = ~ocean & ~water
    thin = solid0 & ~ndimage.binary_opening(solid0, structure=np.ones((5, 5), bool))
    bridges = thin & (mean > 135) & (np.abs(r - g) < 30) & (r - b < 52) & ndimage.binary_dilation(ocean, iterations=3) & ~ndimage.binary_dilation(ndimage.binary_opening(solid0, structure=np.ones((5, 5), bool)), iterations=1)
    ocean = ocean | bridges                            # the picture's bridges and causeway decks: open water under a road
    land = ~ocean                                  # includes inland water (lake, ponds, channels)
    sand = sand & ndimage.binary_dilation(ocean, iterations=5)      # beaches only: pale tan pixels inland are roads and roofs, not sand
    inland = water & ~ocean
    shallow = ocean & (g > 118) & (g > r + 30)
    green = land & ~inland & ~sand & ~gray
    dark = green & (mean < np.percentile(mean[green], 42))
    urban = ndimage.binary_opening(ndimage.binary_closing(gray, iterations=2), iterations=1) & land
    forest = ndimage.binary_opening(ndimage.binary_closing(dark, iterations=2), iterations=2)
    return dict(bridges=bridges, rgb=a, land=land, solid=land & ~inland, inland=inland, sand=sand & land, urban=urban, forest=forest, shallow=shallow, ocean=ocean, mean=mean, green=green)


if __name__ == '__main__':
    c = classify()
    h, w = c['land'].shape
    print({k: round(float(v.mean()), 3) for k, v in c.items() if v.dtype == bool})
    for y in range(0, h, 25):
        row = ''
        for x in range(0, w, 14):
            sl = (slice(y, y + 25), slice(x, x + 14))
            f = lambda k: c[k][sl].mean()
            row += '#' if f('urban') > 0.4 else 'o' if f('inland') > 0.25 else 'F' if f('forest') > 0.5 else 's' if f('sand') > 0.3 else '.' if f('solid') > 0.5 else '~' if f('shallow') > 0.4 else ' '
        print(row)
