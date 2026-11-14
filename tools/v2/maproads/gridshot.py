"""Crop of ref_40 with a labelled pixel grid every 50 px (for hand digitizing). Args: x0 y0 x1 y1 scale out [vector]"""
import sys, os, json
sys.path.append(os.path.expanduser('~/.local/lib/python3.13/site-packages'))
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
x0, y0, x1, y1 = [int(v) for v in sys.argv[1:5]]; sc = float(sys.argv[5]); out = sys.argv[6]
im = Image.open(os.path.join(ROOT, 'references', 'ref_40_map_user_official.webp')).convert('RGB').crop((x0, y0, x1, y1))
im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS); d = ImageDraw.Draw(im)
T = lambda x, y: ((x - x0) * sc, (y - y0) * sc)
if len(sys.argv) > 7:
    for r in json.load(open(os.path.join(HERE, 'out', sys.argv[7] + '.json')))['roads']:
        d.line([T(*p) for p in r['pts']], fill=(255, 0, 255) if r.get('kind') not in ('motorway', 'trunk', 'primary') else (255, 60, 0), width=2)
for x in range((x0 // 50 + 1) * 50, x1, 50):
    d.line([T(x, y0), T(x, y1)], fill=(255, 255, 0), width=1); d.text((T(x, y0)[0] + 2, 2), str(x), fill=(255, 255, 0))
for y in range((y0 // 50 + 1) * 50, y1, 50):
    d.line([T(x0, y), T(x1, y)], fill=(255, 255, 0), width=1); d.text((2, T(x0, y)[1] + 2), str(y), fill=(255, 255, 0))
im.save(out)
