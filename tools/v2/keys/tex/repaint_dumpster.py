#!/usr/bin/env python3
# Repaint the roll-off's lettering panels (track: keys): the scan's company name + phone number are replaced by synthetic rust
# panels and an invented "KEYS ROLL-OFF". The second panel sits on mirrored UVs in game, so its text is flipped top-bottom
# (not rotated) to read correctly there. Input: the library texture; output: tools/v2/keys/tex/dumpster3/Color 4.png
import random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageStat
src, dst = sys.argv[1], sys.argv[2]
random.seed(7)
im = Image.open(src).convert('RGB')
for (x0, y0, x1, y1) in [(40, 0, 720, 120), (40, 190, 720, 312)]:
    w, h = x1 - x0, y1 - y0; mean = ImageStat.Stat(im.crop((x0, y0, x1, y1)).filter(ImageFilter.MedianFilter(21))).median
    n = Image.new('L', (w // 16, h // 16)); n.putdata([random.randint(0, 255) for _ in range(n.size[0] * n.size[1])]); n = n.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(3))
    f = Image.new('L', (w // 3, h // 3)); f.putdata([random.randint(0, 255) for _ in range(f.size[0] * f.size[1])]); f = f.resize((w, h), Image.BILINEAR)
    panel = Image.new('RGB', (w, h)); px = panel.load(); nn = n.load(); ff = f.load()
    for y in range(h):
        for x in range(w):
            k = 0.78 + 0.32 * nn[x, y] / 255 + 0.1 * (ff[x, y] / 255 - 0.5); px[x, y] = tuple(max(0, min(255, int(c * k))) for c in mean)
    im.paste(panel, (x0, y0))
F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 50)
def text(y, flip):
    t = Image.new('RGBA', (520, 110), (0, 0, 0, 0)); d = ImageDraw.Draw(t); d.text((20, 20), 'KEYS ROLL-OFF', font=F, fill=(206, 198, 182, 220))
    if flip: t = t.transpose(Image.FLIP_TOP_BOTTOM)
    im.paste(t, (60, y), t)
text(0, False); text(196, True)
im.save(dst)
