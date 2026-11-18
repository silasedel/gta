# r2-metro: lived-in layer for the Southline car (user: "plain and perfect" -> a real feel). Writes, 2K:
#   car_panel.jpg  laminate + wear: dirtier band near the floor, low kick marks / scuffs, faint scratches (no text),
#                  yellowed seams, a few low-frequency hand smudges at grab height. 2048 px = 2.4 m (v = height).
#   car_door.jpg   door leaf: painted metal, brushed steel kick plate, worn paint at the edges, hand grime.
#   car_floor_ao.png floor wear map across the whole car floor (u = across, v = along): dirty edges and corners,
#                  a lighter worn path down the middle (used as aoMap).
#   python3 tools/v2/metro/car_wear.py public/assets/metro/tex
import sys, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
OUT = sys.argv[1]; N = 2048; rng = np.random.default_rng(11)
def blur(a, r):
    im = Image.fromarray(((a - a.min()) / (np.ptp(a) + 1e-9) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32) / 255
x = np.arange(N)[None, :].repeat(N, 0).astype(np.float32); y = np.arange(N)[:, None].repeat(N, 1).astype(np.float32)
H = (N - 1 - y) / N * 2.4            # height in meters (image bottom = floor)
# --- base laminate (same look as car_panel.py) + relief
peel = blur(rng.random((N, N)), 2.2) * 0.6 + blur(rng.random((N, N)), 6) * 0.4
def groove(d, w): return np.clip(1 - np.abs(d) / w, 0, 1) ** 1.5
seam = np.zeros((N, N), np.float32)
for sx in (0, N // 2, N): seam = np.maximum(seam, groove(x - sx, 5))
for sy in (0, int(N * 0.62), N): seam = np.maximum(seam, groove(y - sy, 4))
riv = np.zeros((N, N), np.float32)
for sx in (24, N // 2 - 24, N // 2 + 24, N - 24):
    for ry in range(48, N, 96): riv = np.maximum(riv, np.clip(1 - np.hypot(x - sx, y - ry) / 7, 0, 1) ** 0.6)
h = (peel - peel.mean()) * 0.35 - seam * 1.6 + riv * 0.9
gy, gx = np.gradient(blur(h, 0.8) * 6); l = np.sqrt(gx * gx + gy * gy + 1); shade = np.clip((gy * 0.45 + 0.89) / l, 0, 1)
col = np.array([206, 201, 191], np.float32)[None, None, :] / 255 * (0.8 + 0.25 * shade[..., None])
# --- wear layer (low frequency, streaky, never round blobs)
lowband = np.clip(1 - H / 0.42, 0, 1) ** 1.6 * (0.55 + 0.45 * blur(rng.random((N, N)), 30))           # dirtier near the floor
streak = blur(rng.random((N // 8, N)), 3); streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR)).astype(np.float32) / 255
dirt = lowband * 0.32 + (streak - 0.5) * 0.05 + blur(rng.random((N, N)), 60) * 0.06
img = Image.new('L', (N, N), 0); d = ImageDraw.Draw(img)
for _ in range(70):                                                                                     # kick marks / shoe scuffs: short dark strokes low
    cx = rng.uniform(0, N); hy = rng.uniform(0.04, 0.38); cy = N - 1 - hy / 2.4 * N; ln = rng.uniform(20, 90); a = rng.uniform(-0.35, 0.35)
    d.line([(cx, cy), (cx + ln * np.cos(a), cy + ln * np.sin(a))], fill=int(rng.uniform(60, 150)), width=int(rng.uniform(2, 6)))
scuff = np.asarray(img.filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32) / 255
img = Image.new('L', (N, N), 0); d = ImageDraw.Draw(img)
for _ in range(45):                                                                                     # faint scratches (light, thin, random angles)
    cx, cy = rng.uniform(0, N), rng.uniform(0.25, 0.95) * N; ln = rng.uniform(30, 160); a = rng.uniform(0, np.pi)
    d.line([(cx, cy), (cx + ln * np.cos(a), cy + ln * np.sin(a))], fill=int(rng.uniform(40, 110)), width=1)
scratch = np.asarray(img.filter(ImageFilter.GaussianBlur(0.5))).astype(np.float32) / 255
hand = np.clip(1 - np.abs(H - 1.25) / 0.35, 0, 1) * blur(rng.random((N, N)), 45) ** 2 * 0.5           # smudges at grab height, soft
col = col * (1 - dirt[..., None] * np.array([0.9, 0.95, 1.1])[None, None, :] * 0.9)                     # dirt is a touch warm
col = col * (1 - scuff[..., None] * 0.45) * (1 - hand[..., None] * 0.12)
col = col + scratch[..., None] * 0.09
col = col * (1 - seam[..., None] * 0.35) * (1 - seam[..., None] * np.array([0, 0.06, 0.16])[None, None, :])  # seams darker + yellowed
Image.fromarray(np.clip(col * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'car_panel.jpg'), quality=92)
# --- door leaf (same frame: 2048 px = 2.4 m, v = height)
dc = np.array([150, 156, 162], np.float32)[None, None, :] / 255 * (0.92 + 0.12 * blur(rng.random((N, N)), 3)[..., None])
kick = (H < 0.32).astype(np.float32)
brushed = blur(rng.random((N, 8)), 0.6); brushed = np.asarray(Image.fromarray((brushed * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR)).astype(np.float32) / 255
steel = np.array([178, 180, 182], np.float32)[None, None, :] / 255 * (0.85 + 0.25 * brushed[..., None])
dc = dc * (1 - kick[..., None]) + steel * kick[..., None]
dc = dc * (1 - groove(H - 0.32, 0.006)[..., None] * 0.5)
chip = (blur(rng.random((N, N)), 1.2) > 0.62).astype(np.float32) * (np.clip(1 - np.minimum(x % (N // 2), (N // 2) - x % (N // 2)) / 40, 0, 1))   # worn paint at leaf edges
dc = dc * (1 - chip[..., None]) + steel * chip[..., None]
dgrime = np.clip(1 - np.abs(H - 1.1) / 0.45, 0, 1) * blur(rng.random((N, N)), 35) * 0.35 + lowband * 0.25
dc = dc * (1 - dgrime[..., None] * 0.6) * (1 - scuff[..., None] * 0.4) + scratch[..., None] * 0.07
Image.fromarray(np.clip(dc * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'car_door.jpg'), quality=92)
# --- floor wear over the whole floor: u across (4.0 m), v along (24.2 m); 512 x 2048
W2, H2 = 512, 2048; u = np.arange(W2)[None, :].repeat(H2, 0) / W2; v = np.arange(H2)[:, None].repeat(W2, 1) / H2
edge = np.clip(1 - np.minimum(u, 1 - u) / 0.12, 0, 1) ** 1.5
ends = np.clip(1 - np.minimum(v, 1 - v) / 0.03, 0, 1)
path = np.clip(1 - np.abs(u - 0.5) / 0.22, 0, 1)
n2 = np.asarray(Image.fromarray((rng.random((H2 // 4, W2 // 4)) * 255).astype(np.uint8)).resize((W2, H2), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
ao = 0.86 - edge * 0.3 - ends * 0.2 + path * 0.16 + (n2 - 0.5) * 0.18
Image.fromarray((np.clip(ao, 0, 1) * 255).astype(np.uint8)).convert('RGB').save(os.path.join(OUT, 'car_floor_ao.png'))
print('ok')
