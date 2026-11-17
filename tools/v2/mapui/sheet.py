# r2-mapui: before / after sheet for the map water (item 9) next to the user's shot and their map reference.
# python3 tools/v2/mapui/sheet.py <after-tag>  ->  docs/v2/shots/r2-mapui/sheet_map_water.jpg
import sys
from PIL import Image, ImageDraw, ImageFont
D = 'docs/v2/shots/r2-mapui/'
tag = sys.argv[1] if len(sys.argv) > 1 else 'after'
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except Exception: F = ImageFont.load_default()
def lab(im, t):
    d = ImageDraw.Draw(im); d.rectangle((0, 0, im.width, 34), fill=(12, 14, 20)); d.text((10, 6), t, fill=(240, 240, 240), font=F); return im
def fit(im, w, h):
    im = im.convert('RGB'); r = min(w / im.width, h / im.height); im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    c = Image.new('RGB', (w, h), (12, 14, 20)); c.paste(im, ((w - im.width) // 2, (h - im.height) // 2)); return c
W, H = 760, 520
crop = (48, 102, 1552, 912)
rows = []
user = Image.open('docs/v2/plan/feedback_nov17_am/shot_10.png')
ref = Image.open('docs/v2/plan/map_colour_target.webp')
rows.append([lab(fit(user, W, H), "User's shot_10 (old build)"), lab(fit(Image.open(D + 'map_before_shot10.jpg').crop(crop), W, H), 'Before: same view'),
             lab(fit(Image.open(D + f'map_{tag}_shot10.jpg').crop(crop), W, H), 'After: soft shallows, no outline'), lab(fit(ref.crop((60, 620, 560, 1260)), W, H), 'Reference (map_colour_target)')])
rows.append([lab(fit(Image.open(D + 'map_before_bay.jpg').crop(crop), W, H), 'Before: Biscayne Bay'), lab(fit(Image.open(D + f'map_{tag}_bay.jpg').crop(crop), W, H), 'After: Biscayne Bay'),
             lab(fit(Image.open(D + 'map_before_fit.jpg').crop((480, 102, 1120, 912)), W, H), 'Before: whole map'), lab(fit(Image.open(D + f'map_{tag}_fit.jpg').crop((480, 102, 1120, 912)), W, H), 'After: whole map')])
mc = (20, 760, 300, 960)
rows.append([lab(fit(Image.open(D + f'map_{tag}_naples03.jpg').crop(crop), W, H), 'After: Gulf coast, mid zoom'), lab(fit(Image.open(D + f'map_{tag}_naples1.jpg').crop(crop), W, H), 'After: turquoise edges, teal channel (close)'),
             lab(fit(Image.open(D + 'map_before_mini_naples.jpg').crop(mc), W, H), 'Before: minimap, Gulf coast'), lab(fit(Image.open(D + f'map_{tag}_mini_naples.jpg').crop(mc), W, H), 'After: minimap, Gulf coast')])
S = Image.new('RGB', (W * 4 + 30, H * len(rows) + 10 * (len(rows) + 1)), (30, 32, 38))
for j, row in enumerate(rows):
    for i, im in enumerate(row): S.paste(im, (6 + i * (W + 6), 10 + j * (H + 10)))
S.save(D + 'sheet_map_water.jpg', quality=90)
print(D + 'sheet_map_water.jpg', S.size)
