# r3 paint before / after sheets from tools/v2/cars/r3_paint.mjs --ab shots (b = ?r3paint=0, a = r3 paint)
# python3 -P tools/v2/cars/r3_paint_sheet.py [rawdir] [outdir]
import sys, os, tempfile
from PIL import Image, ImageDraw
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'r3paint_raw')
OUT = sys.argv[2] if len(sys.argv) > 2 else 'docs/v2/shots/cars/r3paint'
KEYS = ['sedan1', 'sedan5', 'sedan8', 'hatch1', 'suv4', 'van6', 'truck9', 'coupe4']
def tile(tag, tod, k, v, box, size):
    p = os.path.join(RAW, f'{tag}_{tod}_{k}_{v}.png')
    if not os.path.exists(p): return Image.new('RGB', size, (40, 0, 0))
    return Image.open(p).convert('RGB').crop(box).resize(size, Image.LANCZOS)
def sheet(name, cols, box, size):
    tw, th = size
    KEYS = [k for k in globals()['KEYS'] if all(os.path.exists(os.path.join(RAW, f'{t}_{tod}_{k}_{v}.png')) for t, tod, v in cols)]
    M = Image.new('RGB', (tw * len(cols), th * len(KEYS) + 22), (16, 16, 16)); d = ImageDraw.Draw(M)
    for j, (tag, tod, v) in enumerate(cols):
        d.text((j * tw + 6, 5), f'{"OLD (?r3paint=0)" if tag == "b" else "NEW (r3 paint)"}  {v} {tod}:00'.replace('17.5:00', '17:30'), fill=(255, 230, 0) if tag == 'a' else (200, 200, 200))
    for i, k in enumerate(KEYS):
        for j, (tag, tod, v) in enumerate(cols):
            M.paste(tile(tag, tod, k, v, box, size), (j * tw, 22 + i * th))
            d.text((j * tw + 6, 22 + i * th + 4), k, fill=(255, 255, 0))
    M.save(os.path.join(OUT, name), quality=90)
    print(os.path.join(OUT, name), M.size)
os.makedirs(OUT, exist_ok=True)
sheet('sheet_paint_close_10.jpg', [('b', 10, 'q34'), ('a', 10, 'q34'), ('b', 10, 'rq'), ('a', 10, 'rq'), ('b', 10, 'top'), ('a', 10, 'top')], (160, 100, 1120, 700), (384, 240))
sheet('sheet_paint_close_1730.jpg', [('b', 17.5, 'q34'), ('a', 17.5, 'q34'), ('b', 17.5, 'side'), ('a', 17.5, 'side'), ('b', 17.5, 'rq'), ('a', 17.5, 'rq')], (160, 100, 1120, 700), (384, 240))
sheet('sheet_paint_lod.jpg', [('b', 10, 'm26'), ('b', 10, 'm31'), ('a', 10, 'm26'), ('a', 10, 'm31'), ('a', 17.5, 'm26'), ('a', 17.5, 'm31')], (390, 220, 890, 580), (384, 276))
# 1:1 detail crops (sill / arch / rear quarter at ~3.5 m, 10:00): old left, new right
DK = ['sedan1', 'sedan5', 'van6', 'suv4', 'coupe4', 'truck9']
box = (420, 380, 1180, 780); w, h = box[2] - box[0], box[3] - box[1]
M = Image.new('RGB', (w * 2, h * len(DK)), (16, 16, 16)); d = ImageDraw.Draw(M)
for i, k in enumerate(DK):
    for j, tag in enumerate(('b', 'a')):
        M.paste(tile(tag, 10, k, 'rq', box, (w, h)), (j * w, i * h))
        d.text((j * w + 6, i * h + 4), f'{k} {"OLD" if tag == "b" else "NEW"} 1:1', fill=(255, 255, 0))
M.save(os.path.join(OUT, 'sheet_paint_detail.jpg'), quality=90); print('detail', M.size)
# rain beads at ~3.5 m (sedan5, rq), old left, new right
fs = [os.path.join(RAW, f'{t}_wet_sedan5_rq.png') for t in 'ba']
if all(os.path.exists(f) for f in fs):
    M = Image.new('RGB', (w * 2, h), (16, 16, 16)); d = ImageDraw.Draw(M)
    for j, f in enumerate(fs):
        M.paste(Image.open(f).convert('RGB').crop(box), (j * w, 0)); d.text((j * w + 6, 4), ('OLD' if j == 0 else 'NEW') + ' rain, sedan5 ~3.5 m, 1:1', fill=(255, 255, 0))
    M.save(os.path.join(OUT, 'sheet_paint_wet.jpg'), quality=90); print('wet', M.size)
