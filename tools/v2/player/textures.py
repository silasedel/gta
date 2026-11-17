#!/usr/bin/env python3
# Hero textures for the user's main character (Tripo maps, Models/Main Character 1/*.fbm):
#   albedo 8K -> 4K WebP (sRGB, hero exception), normal 4K WebP, ORM-style roughness 2K WebP
#   (R = 1 occlusion, G = roughness remapped to a matte range: skin/hair/cloth never plastic, B = 0 metal).
# usage: python3 tools/v2/player/textures.py <fbm dir> <out dir>
import sys, os, glob
from PIL import Image
import numpy as np
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
f = lambda k: glob.glob(os.path.join(src, '*_' + k + '.jpg'))[0]
alb = Image.open(f('basecolor')).convert('RGB').resize((4096, 4096), Image.LANCZOS)
alb.save(os.path.join(out, 'albedo.webp'), quality=92, method=6)
alb.resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, 'albedo_1k.webp'), quality=90, method=6)   # far LOD / preview
nrm = Image.open(f('normal')).convert('RGB')
if nrm.size[0] > 4096: nrm = nrm.resize((4096, 4096), Image.LANCZOS)
nrm.save(os.path.join(out, 'normal.webp'), quality=94, method=6)
r = np.asarray(Image.open(f('roughness')).convert('L').resize((2048, 2048), Image.LANCZOS)).astype(np.float32) / 255
r = np.clip(0.55 + 0.45 * r, 0, 1)            # matte floor 0.55 (Tripo maps dip to 0.18 on skin -> plastic sheen)
orm = np.zeros((2048, 2048, 3), np.uint8); orm[..., 0] = 255; orm[..., 1] = (r * 255 + 0.5).astype(np.uint8)
Image.fromarray(orm).save(os.path.join(out, 'orm.webp'), quality=92, method=6)
print('[textures] done', {k: os.path.getsize(os.path.join(out, k)) for k in os.listdir(out)})
