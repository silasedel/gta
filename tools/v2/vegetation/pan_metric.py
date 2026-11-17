#!/usr/bin/env python3
# pan_metric.py prefix [y0 y1] -> per variant (A/B/C frames from pan.mjs): far-band crawl = temporal std-dev after undoing the
# pan's global shift (phase correlation, whole pixels); lower = steadier. y0 / y1: band as a fraction of the height.
import sys, glob, re
import numpy as np
from PIL import Image
pre = sys.argv[1]; y0, y1 = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (0.06, 0.24)
def load(p):
    im = np.asarray(Image.open(p).convert('L'), dtype=np.float32); h = im.shape[0]
    return im[int(h * y0):int(h * y1), 40:-40]
def shift(a, b):
    F = np.fft.fft2(a) * np.conj(np.fft.fft2(b)); r = np.fft.ifft2(F / (np.abs(F) + 1e-6)).real
    dy, dx = np.unravel_index(np.argmax(r), r.shape); h, w = a.shape
    return (dy - h if dy > h // 2 else dy), (dx - w if dx > w // 2 else dx)
for v in 'ABC':
    fs = sorted(glob.glob(f'{pre}_{v}*.png'), key=lambda p: int(re.findall(r'(\d+)\.png$', p)[0]))
    if len(fs) < 3: continue
    fr = [load(p) for p in fs]; ref = fr[0]; al = []
    for f in fr:
        dy, dx = shift(ref, f); al.append(np.roll(np.roll(f, dy, 0), dx, 1))
    st = np.stack(al)[:, 4:-4, 40:-40]; sd = st.std(0)
    # high-frequency temporal energy: frame-to-frame change of the Laplacian (sparkle), after alignment
    lap = [np.abs(4 * x[1:-1, 1:-1] - x[:-2, 1:-1] - x[2:, 1:-1] - x[1:-1, :-2] - x[1:-1, 2:]) for x in st]
    dl = np.mean([np.abs(lap[i + 1] - lap[i]).mean() for i in range(len(lap) - 1)])
    print(v, 'frames', len(fs), 'mean std', round(float(sd.mean()), 3), 'p99', round(float(np.percentile(sd, 99)), 2), 'px>8', int((sd > 8).sum()), 'sparkle', round(float(dl), 3))
