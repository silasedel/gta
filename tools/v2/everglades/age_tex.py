# Everglades r7b: age a downloaded color map (sun-faded, grime, rust): python3 age_tex.py in.png out.png [fade grime rust tint_r,g,b seed]
# fade 0..1 desaturates / bleaches; grime 0..1 adds dark run-off streaks from the top and a dirt band at the bottom (v = image y);
# rust 0..1 adds rust blooms and drip lines. Keeps alpha. Deterministic per seed.
import sys, random
from PIL import Image, ImageFilter, ImageDraw, ImageChops
a = sys.argv[1:]; src, out = a[0], a[1]; fade = float(a[2]) if len(a) > 2 else 0.3; grime = float(a[3]) if len(a) > 3 else 0.4; rust = float(a[4]) if len(a) > 4 else 0.3
tint = [float(x) for x in a[5].split(',')] if len(a) > 5 else [1, 1, 1]; random.seed(int(a[6]) if len(a) > 6 else 7)
im = Image.open(src).convert('RGBA'); W, H = im.size; alpha = im.getchannel('A'); rgb = im.convert('RGB')
gray = rgb.convert('L').convert('RGB'); rgb = Image.blend(rgb, gray, fade * 0.6)
rgb = Image.blend(rgb, Image.new('RGB', (W, H), (205, 196, 170)), fade * 0.18)   # sun bleach toward a dusty cream
r, g, b = rgb.split(); rgb = Image.merge('RGB', (r.point(lambda v: min(255, v * tint[0])), g.point(lambda v: min(255, v * tint[1])), b.point(lambda v: min(255, v * tint[2]))))
mask = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mask)
for _ in range(int(60 * grime)):   # run-off streaks
    x = random.random() * W; y0 = random.random() * H * 0.6; L = H * (0.1 + random.random() * 0.5); w = 1 + random.random() * W * 0.012
    d.rectangle([x, y0, x + w, y0 + L], fill=int(60 + random.random() * 90))
d.rectangle([0, H * 0.86, W, H], fill=int(120 * grime))   # dirt band at the bottom edge of the map
mask = mask.filter(ImageFilter.GaussianBlur(W * 0.006))
rgb = Image.composite(Image.new('RGB', (W, H), (52, 44, 32)), rgb, mask.point(lambda v: int(v * grime)))
rm = Image.new('L', (W, H), 0); d = ImageDraw.Draw(rm)
for _ in range(int(40 * rust)):    # rust blooms + drips
    x, y, s = random.random() * W, random.random() * H, W * (0.01 + random.random() * 0.05)
    d.ellipse([x - s, y - s * 0.7, x + s, y + s * 0.7], fill=int(120 + random.random() * 120))
    if random.random() < 0.6: d.rectangle([x - s * 0.15, y, x + s * 0.15, y + s * (2 + random.random() * 6)], fill=int(90 + random.random() * 80))
rm = rm.filter(ImageFilter.GaussianBlur(W * 0.004))
noise = Image.effect_noise((W, H), 60).convert('L'); rm = ImageChops.multiply(rm, noise.point(lambda v: min(255, v * 2)))
rgb = Image.composite(Image.new('RGB', (W, H), (110, 52, 24)), rgb, rm)
out_im = rgb.convert('RGBA'); out_im.putalpha(alpha); out_im.save(out); print('AGED', out, W, H)
