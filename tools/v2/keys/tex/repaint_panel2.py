# r2-keys: the roll-off's Part 02 map (side plates + lettering panel) is a dark gray scan with light-gray patches; tinted red in the
# shader it read as a black slab (QA first-minutes #9). Repaint it as the same chipped, faded red enamel as the body: base red from
# the repainted body map's median, value from the scan's own luminance (patches -> paler, sun-chalked paint), a little rust in the darks.
#   python3 repaint_panel2.py <in Color 2.png> <body Color 4.png (repainted)> <out Color 2.png>
import sys
from PIL import Image, ImageStat, ImageOps
src, body, out = sys.argv[1:4]
im = Image.open(src).convert('RGB'); L = ImageOps.grayscale(im)
med = [int(v) for v in ImageStat.Stat(Image.open(body).convert('RGB').resize((256, 256))).median]
lo, hi = ImageStat.Stat(L).extrema[0]
px, lp = im.load(), L.load(); w, h = im.size
res = Image.new('RGB', (w, h)); rp = res.load()
for y in range(h):
    for x in range(w):
        t = (lp[x, y] - lo) / max(1, hi - lo)   # 0 dark scan .. 1 light patch
        k = 0.82 + 0.45 * t
        r, g, b = med[0] * k, med[1] * k, med[2] * k
        if t > 0.6: r, g, b = r + (200 - r) * (t - 0.6) * 0.6, g + (175 - g) * (t - 0.6) * 0.6, b + (160 - b) * (t - 0.6) * 0.6   # chalked
        if t < 0.12: r, g, b = r * 0.85, g * 0.8, b * 0.75   # rusty seams
        rp[x, y] = (min(255, int(r)), min(255, int(g)), min(255, int(b)))
res.save(out); print('repainted', out, 'base', med)
