#!/usr/bin/env python3
# Mari's underarm texture fix, step 2: lifts the baked arm-against-body shadow in the albedo. Inside the inner-arm /
# armpit mask (UV triangles from underarm.py, feathered), texels darker than her arm skin are brightened toward the arm
# skin's brightness (a luminance ratio, capped, so the detail stays) and toward its hue, so the smear blends into the
# nearby skin.
#   python3 tools/v2/player/underarm_fix.py <faces.json> <albedo.webp> [<more albedo files of the same UV> ...]
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

faces = json.load(open(sys.argv[1]))
for path in sys.argv[2:]:
    img = Image.open(path).convert('RGB')
    W, H = img.size

    def raster(tris, feather):
        m = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(m)
        for t in tris:
            d.polygon([(u * W, (1 - v) * H) for u, v in t], fill=255)
        if feather:
            m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(feather))
        return np.asarray(m).astype(np.float32) / 255

    a = np.asarray(img).astype(np.float32) / 255
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    ref_mask = raster(faces['ref'], 0) > 0.5
    ref_lum = float(np.percentile(lum[ref_mask], 55)) if ref_mask.any() else 0.35
    mask = raster(faces['fix'], max(2, W // 700))
    gain = np.clip(ref_lum / np.maximum(lum, 0.02), 1.0, 2.6)
    k = mask * np.clip((ref_lum - lum) / max(ref_lum, 1e-3) * 2.5, 0, 1)
    out = a * (1 + (gain[..., None] - 1) * k[..., None])
    # lifted shadows keep a saturated brown-orange cast: pull their hue to the arm skin's (same brightness)
    ref_rgb = np.median(a[ref_mask], axis=0) if ref_mask.any() else np.array([0.62, 0.42, 0.3])
    olum = out @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    skin = ref_rgb[None, None, :] * (olum / max(float(ref_rgb @ np.array([0.2126, 0.7152, 0.0722])), 1e-3))[..., None]
    out = out + (skin - out) * (0.75 * k)[..., None]
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, quality=92, method=6)
    print('[underarm_fix]', path, 'ref lum %.3f' % ref_lum, 'texels lifted', int((k > 0.05).sum()))
