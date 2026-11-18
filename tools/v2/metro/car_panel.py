# r2-metro: clean subway-car wall laminate, authored procedurally at 2K (2048 px = 2.4 m, ~850 px/m):
# light warm-gray laminate with a subtle orange-peel finish, vertical panel seams every 1.2 m, a horizontal seam,
# rivet rows beside the seams. Writes albedo (with the micro relief baked under a soft top light, since the car
# uses baked lighting), plus a tangent-space normal map and a roughness map (~0.4) for PBR use.
#   python3 tools/v2/metro/car_panel.py public/assets/metro/tex
import sys, os
import numpy as np
from PIL import Image, ImageFilter
OUT = sys.argv[1]; N = 2048; rng = np.random.default_rng(7)
def blur(a, r):
    im = Image.fromarray(((a - a.min()) / (np.ptp(a) + 1e-9) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32) / 255
peel = blur(rng.random((N, N)), 2.2) * 0.6 + blur(rng.random((N, N)), 6) * 0.4          # orange peel
h = (peel - peel.mean()) * 0.35
x = np.arange(N)[None, :].repeat(N, 0); y = np.arange(N)[:, None].repeat(N, 1)
def groove(d, w):   # soft V groove
    return np.clip(1 - np.abs(d) / w, 0, 1) ** 1.5
seam = np.zeros((N, N), np.float32)
for sx in (0, N // 2, N): seam = np.maximum(seam, groove(x - sx, 5))
for sy in (0, int(N * 0.62), N): seam = np.maximum(seam, groove(y - sy, 4))
h -= seam * 1.6
riv = np.zeros((N, N), np.float32)
for sx in (24, N // 2 - 24, N // 2 + 24, N - 24):
    for ry in range(48, N, 96):
        d = np.hypot(x - sx, y - ry); riv = np.maximum(riv, np.clip(1 - d / 7, 0, 1) ** 0.6)
h += riv * 0.9
# normals from height
gy, gx = np.gradient(blur(h, 0.8) * 6)
nx, ny, nz = -gx, -gy, np.ones_like(gx); l = np.sqrt(nx * nx + ny * ny + nz * nz); nx, ny, nz = nx / l, ny / l, nz / l
Image.fromarray(np.dstack([(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255]).astype(np.uint8)).save(os.path.join(OUT, 'car_panel_n.png'))
rough = np.clip(0.4 + (peel - 0.5) * 0.08 + seam * 0.25 - riv * 0.15, 0, 1)
Image.fromarray((rough * 255).astype(np.uint8)).convert('RGB').save(os.path.join(OUT, 'car_panel_r.jpg'), quality=90)
# albedo with the relief baked under a soft light from above-front
L = np.array([0.0, -0.45, 0.89]); L /= np.linalg.norm(L)
shade = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
base = np.array([206, 201, 191], np.float32) / 255
grime = blur(rng.random((N, N)), 40) * 0.04
col = base[None, None, :] * (0.8 + 0.25 * shade[..., None]) * (1 - seam[..., None] * 0.35) * (1 - grime[..., None])
Image.fromarray(np.clip(col * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'car_panel.jpg'), quality=92)
print('ok')
