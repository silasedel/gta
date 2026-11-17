#!/usr/bin/env python3
# Rasterize the wardrobe region triangles from regions.py into regions.webp (R shirt, G pants, B shoes), 2048 px,
# dilated over UV seams. Row 0 of the image = glTF v 0 = Blender v 1 (the game samples with flipY = false).
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
d = np.load(sys.argv[1]); out = sys.argv[2]; R = 2048
ch = [Image.new('L', (R, R), 0) for _ in range(3)]; dr = [ImageDraw.Draw(c) for c in ch]
for t, k in zip(d['tri'], d['k']):
    dr[int(k)].polygon([(float(u) * R, (1 - float(v)) * R) for u, v in t], fill=255)   # Blender v -> glTF v = 1 - v
ch = [c.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(1.2)) for c in ch]
Image.merge('RGB', ch).save(out, quality=95, method=6) if out.endswith('.webp') else Image.merge('RGB', ch).save(out)
print('[regions_raster] wrote', out)
