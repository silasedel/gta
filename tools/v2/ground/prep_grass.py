#!/usr/bin/env python3
"""Grass card atlas for close-up ground cover (src/world/vegetation/grasscards.js), from the user's grass card textures.

public/assets/textures/ground/grass_cards.png, 2048 x 2048 RGBA (straight alpha, color bled under transparent texels so
mips do not go dark at the card edges):
  top-left     Grass Cards 3 plates 1-3 (dense dry grass strips), stacked, 1024 x 341 each
  top-right    Grass Cards 4 'Rostlinka 07c' (5 wild grass clumps with seed heads, color + alpha)
  bottom-left  Grass Cards 4 'Rostlinka 12' (weed sprigs, color + alpha)
  bottom-right Grass Cards 1 blades x4 + Grass Cards 2 blade (RGBA), one 200 px column each
Prints the clump rectangles (uv, v = 0 at the image top) for grasscards.js.

  python3 tools/v2/ground/prep_grass.py
"""
import os
import json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
T = os.path.join(ROOT, 'Models', 'Textures')
OUT = os.path.join(ROOT, 'public', 'assets', 'textures', 'ground', 'grass_cards.png')
S = 2048
G1 = os.path.join(T, 'Grass Cards 1 - Tall Blade Clumps In Three Sizes', 'textures')
G2 = os.path.join(T, 'Grass Cards 2 - Realistic Grass Blade Tuft', 'textures')
G3 = os.path.join(T, 'Grass Cards 3 - Dark Dry Grass Plates With Seamless Top', 'textures')
G4 = os.path.join(T, 'Grass Cards 4 - Green Grass Chunks On Ground Patch', 'textures')


def rgba(color, alpha=None):
    im = Image.open(color).convert('RGBA')
    if alpha:
        im.putalpha(Image.open(alpha).convert('L').resize(im.size))
    return im


def main():
    atlas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    rects = {}
    for i in range(3):
        p = rgba(os.path.join(G3, f'Plate {i + 1}.png')).resize((1024, 341), Image.LANCZOS)
        atlas.alpha_composite(p, (0, i * 341))
        rects[f'plate{i}'] = [0, i * 341 / S, 1024 / S, (i + 1) * 341 / S]
    r7 = rgba(os.path.join(G4, 'Rostlinka 07c Color.jpeg'), os.path.join(G4, 'Rostlinka 07c Alpha.jpeg')).resize((1024, 1024), Image.LANCZOS)
    atlas.alpha_composite(r7, (1024, 0))
    r12 = rgba(os.path.join(G4, 'Rostlinka12 2k Color.jpeg'), os.path.join(G4, 'Rostlinka12 2k Alpha.jpeg')).resize((1024, 1024), Image.LANCZOS)
    atlas.alpha_composite(r12, (0, 1024))
    blades = [rgba(os.path.join(G1, f'{n} Mat Color.png'), os.path.join(G1, f'{n} Mat Alpha.png')) for n in ('Grass', 'Grass1', 'Grass2', 'Grass3')]
    blades.append(rgba(os.path.join(G2, 'Grass Blades Color.png')))
    for k, b in enumerate(blades):
        h = 1000; w = max(8, round(b.width * h / b.height)); w = min(w, 190)
        bb = b.resize((w, h), Image.LANCZOS)
        x = 1024 + k * 200 + (200 - w) // 2
        atlas.alpha_composite(bb, (x, 1024 + 12))
        rects[f'blade{k}'] = [x / S, (1024 + 12) / S, (x + w) / S, (1024 + 12 + h) / S]
    a = np.asarray(atlas).astype(np.float32) / 255
    # clump rectangles in the Rostlinka quadrants: connected components of the (dilated) alpha
    for name, (qx, qy) in (('clump', (1024, 0)), ('weed', (0, 1024))):
        q = a[qy:qy + 1024, qx:qx + 1024, 3] > 0.25
        lab, n = ndimage.label(ndimage.binary_dilation(q, iterations=12))
        objs = ndimage.find_objects(lab)
        k = 0
        for sl in objs:
            ys, xs = sl
            if (ys.stop - ys.start) * (xs.stop - xs.start) < 6000:
                continue
            rects[f'{name}{k}'] = [(qx + xs.start) / S, (qy + ys.start) / S, (qx + xs.stop) / S, (qy + ys.stop) / S]
            k += 1
    # bleed color under transparent texels (dilate the opaque color outward) so mip levels keep the grass color at the edges
    rgb, al = a[..., :3].copy(), a[..., 3]
    known = al > 0.05
    for _ in range(24):
        if known.all():
            break
        acc = np.zeros_like(rgb); cnt = np.zeros(al.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(known, (dy, dx), (0, 1)); acc += np.roll(rgb, (dy, dx), (0, 1)) * sh[..., None]; cnt += sh
        grow = (~known) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][..., None]
        known = known | grow
    rgb[~known] = rgb[known].mean(0)
    out = np.concatenate([rgb, al[..., None]], -1)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT, optimize=True)
    print(json.dumps({k: [round(v, 4) for v in r] for k, r in rects.items()}))
    print('bytes', os.path.getsize(OUT))


if __name__ == '__main__':
    main()
