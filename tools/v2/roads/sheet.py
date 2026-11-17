#!/usr/bin/env python3
"""Shot sheets for the r2-roads tools (JPG q90).
  python3 tools/v2/roads/sheet.py <set>                 seam audit sheet: one row per junction type (top | corner | approach),
                                                        probe counts in the label -> docs/v2/shots/roads/<set>_seams_sheet.jpg
  python3 tools/v2/roads/sheet.py --ab <before> <after> <out.jpg> <img> [<img> ...]   before | after pairs (file names inside
                                                        docs/v2/shots/roads/ with the set prefix left out)
  python3 tools/v2/roads/sheet.py --grid <out.jpg> <cols> <label=path> ...           free grid with labels
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

D = 'docs/v2/shots/roads'
try: FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
except Exception: FONT = ImageFont.load_default()


def tile(path, w, h, label=None):
    im = Image.open(path).convert('RGB') if path and os.path.exists(path) else Image.new('RGB', (w, h), (40, 40, 40))
    im = im.resize((w, int(im.height * w / im.width))).crop((0, 0, w, h))
    if label:
        d = ImageDraw.Draw(im); tw = d.textlength(label, font=FONT); d.rectangle((0, 0, tw + 14, 32), fill=(0, 0, 0)); d.text((7, 4), label, fill='white', font=FONT)
    return im


def grid(out, cols, cells, w=640, h=360):
    rows = (len(cells) + cols - 1) // cols
    S = Image.new('RGB', (cols * w, rows * h), 'black')
    for i, (lab, p) in enumerate(cells): S.paste(tile(p, w, h, lab), ((i % cols) * w, (i // cols) * h))
    S.save(out, quality=90); print('sheet', out, S.size)


def seams(st):
    rep = json.load(open(f'docs/v2/reports/r2roads-seams-{st}.json'))
    cells = []
    for k, p in rep['picks'].items():
        pr = p.get('probe') or {}
        lab = f"{k}  r{pr.get('raised', '?')} n{pr.get('notch', '?')} z{pr.get('zfight', '?')} s{pr.get('step', '?')}"
        for v in ('top', 'corner', 'approach'): cells.append((lab if v == 'top' else v, os.path.join(D, f'{st}_seam_{k}_{v}.jpg')))
    grid(os.path.join(D, f'{st}_seams_sheet.jpg'), 3, cells, 560, 315)


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == '--ab':
        b, af, out, names = a[1], a[2], a[3], a[4:]
        cells = []
        for n in names: cells += [(f'{b} {n}', os.path.join(D, f'{b}_{n}')), (f'{af} {n}', os.path.join(D, f'{af}_{n}'))]
        grid(out, 2, cells, 800, 450)
    elif a[0] == '--grid':
        grid(a[1], int(a[2]), [tuple(x.split('=', 1)) for x in a[3:]], 800, 450)
    else: seams(a[0])
