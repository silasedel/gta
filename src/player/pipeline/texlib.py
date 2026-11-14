# Port Solana V2 — texture painting helpers for the character pipeline (CHARACTER track). Plain python3 + numpy/numba/scipy/PIL.
# Image space: pixel (x, y) with y down; glTF UVs (u, v_gltf = 1 - v_blender) map to (u * W, v_gltf * H). Textures load with flipY = false.
import os, subprocess, math
import numpy as np
from numba import njit, prange
from scipy import ndimage as ndi
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

@njit(cache=True)
def _raster(px, attr, H, W, out, mask):
    T = px.shape[0]; K = attr.shape[2]
    for t in range(T):
        x0, y0, x1, y1, x2, y2 = px[t, 0, 0], px[t, 0, 1], px[t, 1, 0], px[t, 1, 1], px[t, 2, 0], px[t, 2, 1]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-12: continue
        xa = max(0, int(math.floor(min(x0, x1, x2) - 0.5))); xb = min(W - 1, int(math.ceil(max(x0, x1, x2) + 0.5)))
        ya = max(0, int(math.floor(min(y0, y1, y2) - 0.5))); yb = min(H - 1, int(math.ceil(max(y0, y1, y2) + 0.5)))
        inv = 1.0 / area
        for y in range(ya, yb + 1):
            fy = y + 0.5
            for x in range(xa, xb + 1):
                fx = x + 0.5
                w1 = ((fx - x0) * (y2 - y0) - (x2 - x0) * (fy - y0)) * inv
                w2 = ((x1 - x0) * (fy - y0) - (fx - x0) * (y1 - y0)) * inv
                w0 = 1.0 - w1 - w2
                e = -0.02
                if w0 >= e and w1 >= e and w2 >= e:
                    for k in range(K): out[y, x, k] = w0 * attr[t, 0, k] + w1 * attr[t, 1, k] + w2 * attr[t, 2, k]
                    mask[y, x] = 1

def raster(tri_uv, tri_attr, size):
    """tri_uv: (T,3,2) glTF-style UV (v down). tri_attr: (T,3,K). Returns (H,W,K) float32 and a coverage mask."""
    H = W = size
    px = np.ascontiguousarray(tri_uv.astype(np.float64) * size)
    out = np.zeros((H, W, tri_attr.shape[2]), dtype=np.float32); mask = np.zeros((H, W), dtype=np.uint8)
    _raster(px, np.ascontiguousarray(tri_attr.astype(np.float64)), H, W, out, mask)
    return out, mask.astype(bool)

def dilate_fill(img, mask, iters=24):
    """extend valid texels outward (edge padding) so mip-mapping never bleeds the background"""
    img = img.copy(); m = mask.copy()
    idx = ndi.distance_transform_edt(~m, return_distances=False, return_indices=True)
    far = ndi.distance_transform_edt(~m) > iters
    filled = img[idx[0], idx[1]]
    if img.ndim == 3: filled[far] = img[m].mean(0)
    else: filled[far] = img[m].mean()
    return filled

def bilinear(img, x, y):
    """sample img (H,W[,C]) at float pixel coords (x, y arrays)"""
    H, W = img.shape[:2]
    x = np.clip(x - 0.5, 0, W - 1.001); y = np.clip(y - 0.5, 0, H - 1.001)
    x0 = x.astype(np.int32); y0 = y.astype(np.int32); fx = (x - x0).astype(np.float32); fy = (y - y0).astype(np.float32)
    if img.ndim == 3: fx = fx[..., None]; fy = fy[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)
def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055).astype(np.float32)

def fbm(size, base_sigma, octaves=4, seed=0, lac=2.0, gain=0.5, wrap=False):
    """smooth multi-octave noise in [-1, 1] from filtered white noise (sigma in pixels of the coarsest octave)"""
    rs = np.random.RandomState(seed); out = np.zeros((size, size), dtype=np.float32); amp = 1.0; tot = 0.0; s = base_sigma
    for o in range(octaves):
        n = rs.randn(size, size).astype(np.float32)
        n = ndi.gaussian_filter(n, s, mode="wrap" if wrap else "reflect"); n /= (n.std() + 1e-9)
        out += n * amp; tot += amp; amp *= gain; s = max(0.6, s / lac)
    out /= tot; return np.clip(out / 2.2, -1, 1)

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-12), 0, 1); return t * t * (3 - 2 * t)

@njit(cache=True)
def _stamp_strokes(buf, shade, S, steps):
    # S: (N, 9) = x0, y0, cx, cy, x1, y1, width0 (px, at root), alpha, shade ; quadratic bezier, tapering to a point
    H, W = buf.shape
    for i in range(S.shape[0]):
        x0, y0, cx, cy, x1, y1, w0, al, sh = S[i, 0], S[i, 1], S[i, 2], S[i, 3], S[i, 4], S[i, 5], S[i, 6], S[i, 7], S[i, 8]
        ln = math.hypot(cx - x0, cy - y0) + math.hypot(x1 - cx, y1 - cy)
        n = max(2, int(ln * steps))
        for k in range(n + 1):
            t = k / n; u = 1 - t
            x = u * u * x0 + 2 * u * t * cx + t * t * x1; y = u * u * y0 + 2 * u * t * cy + t * t * y1
            r = 0.5 * w0 * (1.0 - 0.75 * t * t) + 0.15
            xa = int(math.floor(x - r - 1)); xb = int(math.ceil(x + r + 1)); ya = int(math.floor(y - r - 1)); yb = int(math.ceil(y + r + 1))
            for yy in range(ya, yb + 1):
                if yy < 0 or yy >= H: continue
                for xx in range(xa, xb + 1):
                    if xx < 0 or xx >= W: continue
                    d = math.hypot(xx + 0.5 - x, yy + 0.5 - y)
                    c = r + 0.5 - d
                    if c <= 0: continue
                    if c > 1: c = 1.0
                    c *= al * (1.0 - 0.35 * t)
                    if c > buf[yy, xx]: buf[yy, xx] = c; shade[yy, xx] = sh

def stamp_strokes(size, strokes, steps=1.6):
    """strokes (N,9) -> coverage (H,W) and per-texel shade of the winning stroke"""
    buf = np.zeros((size, size), dtype=np.float32); shade = np.zeros((size, size), dtype=np.float32)
    if len(strokes): _stamp_strokes(buf, shade, np.ascontiguousarray(strokes.astype(np.float64)), steps)
    return buf, shade

@njit(cache=True)
def _stamp_dots(buf, D):
    # D: (N,4) = x, y, radius px, amplitude ; gaussian dimples/bumps (additive)
    H, W = buf.shape
    for i in range(D.shape[0]):
        x, y, r, a = D[i, 0], D[i, 1], D[i, 2], D[i, 3]
        R = int(math.ceil(r * 2.5)); xi = int(x); yi = int(y); inv = 1.0 / (r * r + 1e-9)
        for yy in range(yi - R, yi + R + 1):
            if yy < 0 or yy >= H: continue
            for xx in range(xi - R, xi + R + 1):
                if xx < 0 or xx >= W: continue
                d2 = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2
                buf[yy, xx] += a * math.exp(-d2 * inv)

def stamp_dots(size, dots, buf=None):
    if buf is None: buf = np.zeros((size, size), dtype=np.float32)
    if len(dots): _stamp_dots(buf, np.ascontiguousarray(dots.astype(np.float64)))
    return buf

def normal_from_height(h, strength_px=1.0):
    """tangent-space normal (OpenGL/glTF convention: +G = up in the image) from a height field in pixels-of-relief units"""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength_px
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength_px          # y down
    n = np.stack([-dx, dy, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n

def save_img(arr01, path, quality=92, lossless=False):
    """arr (H,W[,C]) in 0..1 -> PNG next to the scratch dir, then WebP at `path` (cwebp)"""
    a = (np.clip(arr01, 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(a)
    if path.endswith(".png"): im.save(path); return
    tmp = path + ".tmp.png"; im.save(tmp, compress_level=1)
    args = ["/opt/homebrew/bin/cwebp", "-quiet", "-mt", "-m", "4"] + (["-lossless"] if lossless else ["-q", str(quality), "-sharp_yuv"]) + ["-alpha_q", "100", tmp, "-o", path]
    subprocess.run(args, check=True); os.remove(tmp)

def load_rgb(path, size=None):
    im = Image.open(path).convert("RGB")
    if size and im.size != (size, size): im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0

def tri_data(co, polys_flat, poly_len, loop_attr, sel=None):
    """fan-triangulate polygons; returns vertex index triples (T,3) and per-corner loop attribute (T,3,K)"""
    tv = []; ta = []; li = 0; pi = 0; off = 0
    for n in poly_len:
        if sel is None or sel[pi]:
            for k in range(1, n - 1):
                tv.append((polys_flat[off], polys_flat[off + k], polys_flat[off + k + 1]))
                ta.append((loop_attr[off], loop_attr[off + k], loop_attr[off + k + 1]))
        off += n; pi += 1
    return np.array(tv), np.array(ta)
