# r2-metro: texture prep for the SOUTHLINE subway (run with python3 -I).
#   python3 -I tools/v2/metro/textures.py <outdir>
# - entrance (Street Props Pack 2 'subway'): paints out the real-world line bullets ('A C D') and the 'Subway' words,
#   writes SOUTHLINE + the roundel on the canopy fascia strips instead. The 'To Street' arrows stay (generic English).
# - roundel.png: the SOUTHLINE logo (sunset roundel with an S), reused by the runtime for signs and map blips.
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
SRC = os.path.join(ROOT, 'Models/Prop Packs/Street Props Pack 2 - Town Square Signs Subway Entrance Parking Valet And Kiosks/textures')
CREAM, CORAL, PINK, GOLD = (255, 244, 227), (255, 107, 90), (255, 95, 168), (255, 210, 122)
def font(sz, cond=True):
    for p in (['/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf'] if cond else []) + ['/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf', '/System/Library/Fonts/Helvetica.ttc']:
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

def roundel(size):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # sunset disc: gold top -> coral -> pink, with three dark slats across the lower half (synthwave sun)
    disc = Image.new('RGBA', (S, S)); dd = ImageDraw.Draw(disc)
    for y in range(S):
        t = y / S
        a, b, k = (GOLD, CORAL, t / 0.5) if t < 0.5 else (CORAL, PINK, (t - 0.5) / 0.5)
        dd.line([(0, y), (S, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3)) + (255,))
    for i, (y0, h) in enumerate(((0.60, 0.035), (0.70, 0.05), (0.81, 0.065))):
        dd.rectangle([0, int(S * y0), S, int(S * (y0 + h))], fill=(24, 18, 40, 255))
    mask = Image.new('L', (S, S), 0); ImageDraw.Draw(mask).ellipse([S * 0.08, S * 0.08, S * 0.92, S * 0.92], fill=255)
    im.paste(disc, (0, 0), mask)
    # ring
    d.ellipse([S * 0.03, S * 0.03, S * 0.97, S * 0.97], outline=(24, 18, 40, 255), width=int(S * 0.05))
    d.ellipse([S * 0.0, S * 0.0, S * 1.0, S * 1.0], outline=CREAM + (255,), width=int(S * 0.03))
    # S
    f = font(int(S * 0.78), cond=False)
    bb = d.textbbox((0, 0), 'S', font=f)
    x, y = (S - (bb[2] - bb[0])) / 2 - bb[0], (S - (bb[3] - bb[1])) / 2 - bb[1] - S * 0.01
    d.text((x + S * 0.015, y + S * 0.02), 'S', font=f, fill=(24, 18, 40, 200))
    d.text((x, y), 'S', font=f, fill=CREAM + (255,))
    return im.resize((size, size), Image.LANCZOS)

R = roundel(512); R.save(os.path.join(OUT, 'roundel.png'))

def patch_out(im, box, src_dx):
    """cover box with a copy of the strip taken src_dx pixels to the side (same strip, no text there)"""
    x0, y0, x1, y1 = box
    piece = im.crop((x0 + src_dx, y0, x1 + src_dx, y1))
    im.paste(piece, (x0, y0))

def write(im, box, text, size, logo=True, color=CREAM):
    x0, y0, x1, y1 = box; h = y1 - y0
    d = ImageDraw.Draw(im); f = font(size)
    x = x0
    if logo:
        r = R.resize((int(h * 0.92), int(h * 0.92)), Image.LANCZOS)
        im.paste(r, (x0, y0 + int(h * 0.04)), r); x += int(h * 1.1)
    bb = d.textbbox((0, 0), text, font=f)
    d.text((x - bb[0], y0 + (h - (bb[3] - bb[1])) / 2 - bb[1]), text, font=f, fill=color)

# canopy fascia (roof texture 2048^2): bullets on two strips, 'Subway' on two strips
roof = Image.open(os.path.join(SRC, 'Subway M Subway Roof Color.jpeg')).convert('RGB')
for box, dx in (((325, 14, 505, 74), 300), ((1212, 14, 1372, 74), 300), ((405, 116, 676, 186), 600), ((1168, 412, 1440, 480), -700)):
    patch_out(roof, box, dx)
write(roof, (330, 18, 900, 70), 'SOUTHLINE', 50)
write(roof, (1220, 18, 1800, 70), 'SOUTHLINE', 50)
write(roof, (412, 122, 1100, 182), 'SOUTHLINE  METRO', 56)
write(roof, (1000, 414, 1440, 476), 'SOUTHLINE', 56)
roof.save(os.path.join(OUT, 'ent_roof.jpg'), quality=92)
# base walls (2048^2): the two small 'Subway' arrows
base = Image.open(os.path.join(SRC, 'Subway M Subway Base Color.jpeg')).convert('RGB')
for box, dx in (((1728, 482, 1846, 522), -300), ((990, 1010, 1100, 1050), 300)):
    patch_out(base, box, dx)
write(base, (1700, 484, 1846, 520), 'SOUTHLINE', 34, logo=False, color=(200, 196, 188))
write(base, (995, 1012, 1140, 1048), 'SOUTHLINE', 34, logo=False, color=(200, 196, 188))
base.save(os.path.join(OUT, 'ent_base.jpg'), quality=92)
print('ok', OUT)
