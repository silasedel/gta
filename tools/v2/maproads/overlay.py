"""Overlay traced / curated roads on ref_40 (local reference image) for visual comparison.

tools/world/.venv/bin/python -I tools/v2/maproads/overlay.py [vector|final] [out.png] [x0 y0 x1 y1] [scale]
Default: final roads (out/roads_px.json) over the whole image at 2x -> docs/v2/shots/maproads/overlay.png
"""
import sys, os, json
sys.path.append(os.path.expanduser('~/.local/lib/python3.13/site-packages'))
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
IMG = os.path.join(ROOT, 'references', 'ref_40_map_user_official.webp')
COL = {'motorway': (255, 60, 60), 'trunk': (255, 140, 0), 'primary': (255, 220, 0), 'secondary': (0, 230, 255), 'tertiary': (255, 0, 255),
       'residential': (255, 255, 255), 'unclassified': (180, 255, 120), 'existing': (40, 40, 40)}

def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'final'
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'v2', 'shots', 'maproads', 'overlay.png')
    box = [float(v) for v in sys.argv[3:7]] if len(sys.argv) > 6 else [0, 0, 1041, 1511]
    sc = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0
    im = Image.open(IMG).convert('RGB').crop(tuple(int(v) for v in box))
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    im = Image.blend(im, Image.new('RGB', im.size, (0, 0, 0)), 0.25)
    d = ImageDraw.Draw(im)
    f = os.path.join(HERE, 'out', 'vector.json' if which == 'vector' else 'roads_px.json')
    R = json.load(open(f))['roads']
    T = lambda p: ((p[0] - box[0]) * sc, (p[1] - box[1]) * sc)
    if which != 'vector':
        ex = os.path.join(HERE, 'out', 'existing_px.json')
        if os.path.exists(ex):
            for r in json.load(open(ex))['roads']:
                d.line([T(p) for p in r['pts']], fill=(20, 20, 20), width=max(1, int(sc * 0.9)))
    for r in R:
        k = r.get('kind', 'tertiary' if r.get('dense', 0) < 0.5 else 'residential')
        d.line([T(p) for p in r['pts']], fill=COL.get(k, (255, 0, 255)), width=max(1, int(sc * (0.9 if k in ('residential', 'unclassified') else 1.2))))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out)
    print(out, im.size)

if __name__ == '__main__':
    main()
