#!/usr/bin/env python3
# Roll-off body paint (r2-keys, lead review): the library "Dumpster 3" body texture (Color 4) is bare rust-brown; a real roll-off
# is chipped, sun-faded red enamel over rust. Paint goes on the smooth panel areas (low saturation / low value in the scan), stays
# off the rust patches and drip runs, gets noise chips along its edges, and a faded small invented name ("KEYS ROLL-OFF") on the
# side panels where the scan had a company name + phone number. Input: the library texture (never modified); output: our copy.
import random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(7)
im = Image.open(src).convert('RGB'); W, H = im.size
a = np.asarray(im, dtype=np.float32) / 255.0
# 1) the scan's lettering panels: replace with the panel's own median tone + noise (no real company name or phone number)
for (x0, y0, x1, y1) in [(40, 0, 720, 120), (40, 190, 720, 312)]:
    med = np.median(a.reshape(-1, 3), axis=0)   # the whole sheet's median tone (the panel's own was near black and painted as a dark slab)
    n = np.asarray(Image.fromarray((rng.random(((y1 - y0) // 16, (x1 - x0) // 16)) * 255).astype(np.uint8)).resize((x1 - x0, y1 - y0), Image.BICUBIC).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
    a[y0:y1, x0:x1] = med * (0.8 + 0.35 * n[..., None])
# 2) where paint survives: smooth, not-orange areas; chipped by two octaves of noise
mx, mn = a.max(-1), a.min(-1); sat = (mx - mn) / np.maximum(mx, 1e-3); orange = np.clip((a[..., 0] - a[..., 2]) * 3.0 - 0.25, 0, 1)
def noise(cell, blur):
    n = rng.random((H // cell + 1, W // cell + 1)); return np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur)), dtype=np.float32) / 255
n1, n2 = noise(48, 6), noise(9, 1.2)
keep = np.clip((0.75 - orange) * 2.5, 0.25, 1)   # heavy rust patches lose most of their paint, everything else keeps it
chips = np.clip((n1 * 0.7 + n2 * 0.45 - 0.26) * 5, 0, 1)   # chipped mostly in small flecks and along worn patches
paint = np.clip(keep * chips, 0, 1)[..., None]
# 3) faded red enamel carrying the scan's own light detail (dents, seams), a little sun-chalk, grime in the low areas
lum = a.mean(-1, keepdims=True); detail = np.clip(lum / max(1e-3, float(np.median(lum))), 0.55, 1.5)
red = np.array([0.50, 0.17, 0.13], dtype=np.float32) * detail
chalk = noise(64, 10)[..., None]; red = red * (1 - 0.25 * chalk) + np.array([0.56, 0.44, 0.40]) * 0.25 * chalk
rust = np.array([0.40, 0.21, 0.11], dtype=np.float32) * detail * (0.75 + 0.5 * n2[..., None])   # exposed steel: orange-brown rust, not the scan's dark base
out = (a * 0.4 + rust * 0.6) * (1 - paint) + red * paint
out *= (0.86 + 0.14 * noise(24, 3))[..., None]   # grime breakup
img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
# 4) small faded invented name on both side windows (same UV spots the old script used, much smaller and worn)
F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
def text(x, y, s):
    t = Image.new('RGBA', (300, 40), (0, 0, 0, 0)); d = ImageDraw.Draw(t); d.text((4, 6), s, font=F, fill=(214, 206, 190, 140))
    m = Image.fromarray((np.clip(noise(6, 0.6)[:40, :300] * 1.6 - 0.25, 0, 1) * 255).astype(np.uint8)); al = Image.fromarray((np.asarray(t.split()[3], dtype=np.float32) * np.asarray(m, dtype=np.float32) / 255).astype(np.uint8)); t.putalpha(al)
    img.paste(t, (x, y), t)
text(70, 30, 'KEYS ROLL-OFF'); text(400, 226, 'KEYS')
img.save(dst); print('painted', dst, 'paint coverage', round(float(paint.mean()), 3))
