#!/usr/bin/env python3
# r2-qa visual sweep analysis (tools/v2/qa/visual.mjs writes the frames). Per camera, from the two still frames A/B:
#   dither  : 2x2 checkerboard energy |a-b-c+d|/4 on luminance (share of 2x2 cells > 6, and the worst 64 px tile)
#   shimmer : pixels whose luminance changes > 14 between A and B with the camera still (shimmer / z-fight / flicker)
#   splotch : saturation outliers (S > 0.75, V > 0.25) share and worst tile
#   magenta : flat missing-texture pink
# Writes docs/v2/shots/qa/visual/<id>.jpg, <id>_crop.jpg (2x crops: worst dither tile, worst shimmer tile, worst splotch tile),
# docs/v2/shots/qa/visual_sheet.jpg (contact sheet) and adds 'img' to docs/v2/reports/qa-visual.json.
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

D = 'docs/v2/shots/qa/visual'
R = json.load(open('docs/v2/reports/qa-visual.json'))
T = 64

def tiles(m):
    h, w = m.shape; h2, w2 = h // T * T, w // T * T
    t = m[:h2, :w2].reshape(h2 // T, T, w2 // T, T).mean(axis=(1, 3))
    return t

def worst(t, scale):
    i = np.unravel_index(np.argmax(t), t.shape); return (int(i[1] * T * scale), int(i[0] * T * scale), float(t[i]))

try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
thumbs = []
for sid, S in R['spots'].items():
    fa, fb = f'{D}/{sid}_a.png', f'{D}/{sid}_b.png'
    if not os.path.exists(fa): continue
    A = np.asarray(Image.open(fa).convert('RGB')).astype(np.float32); B = np.asarray(Image.open(fb).convert('RGB')).astype(np.float32) if os.path.exists(fb) else A
    Y = A @ np.array([0.299, 0.587, 0.114], np.float32); YB = B @ np.array([0.299, 0.587, 0.114], np.float32)
    h, w = Y.shape; h -= h % 2; w -= w % 2
    ck = np.abs(Y[0:h:2, 0:w:2] - Y[0:h:2, 1:w:2] - Y[1:h:2, 0:w:2] + Y[1:h:2, 1:w:2]) / 4
    ckm = (ck > 6).astype(np.float32)
    ckT = tiles(np.kron(ckm, np.ones((2, 2), np.float32)))
    fl = (np.abs(Y - YB) > 14).astype(np.float32); flT = tiles(fl)
    mx, mn = A.max(axis=2), A.min(axis=2); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0); spl = ((sat > 0.75) & (mx > 64)).astype(np.float32); spT = tiles(spl)
    mag = int(((A[..., 0] > 220) & (A[..., 1] < 40) & (A[..., 2] > 220)).sum())
    img = {'dither': round(float(ckm.mean()), 4), 'ditherTile': worst(ckT, 1), 'shimmer': round(float(fl.mean()), 4), 'shimmerTile': worst(flT, 1),
           'splotch': round(float(spl.mean()), 4), 'splotchTile': worst(spT, 1), 'magentaPx': mag}
    S['img'] = img
    im = Image.open(fa).convert('RGB'); im.save(f'{D}/{sid}.jpg', quality=88)
    # 2x crops of the three worst tiles (320x180 around each), side by side
    crops = []
    for key in ('ditherTile', 'shimmerTile', 'splotchTile'):
        x, y, v = img[key]; cx, cy = x + T // 2, y + T // 2
        x0, y0 = max(0, min(im.width - 320, cx - 160)), max(0, min(im.height - 180, cy - 90))
        c = im.crop((x0, y0, x0 + 320, y0 + 180)).resize((640, 360), Image.NEAREST); dr = ImageDraw.Draw(c)
        dr.rectangle((0, 0, 640, 30), fill=(0, 0, 0)); dr.text((8, 4), f'{key[:-4]} {v:.2f} @ {x},{y}', fill=(255, 255, 0), font=font); crops.append(c)
    cs = Image.new('RGB', (640 * 3, 360)); [cs.paste(c, (640 * i, 0)) for i, c in enumerate(crops)]; cs.save(f'{D}/{sid}_crop.jpg', quality=88)
    t = im.resize((480, 270), Image.LANCZOS); dr = ImageDraw.Draw(t); dr.rectangle((0, 0, 480, 28), fill=(0, 0, 0))
    dr.text((6, 3), f"{sid}  d{img['dither']:.3f} s{img['shimmer']:.3f} p{img['splotch']:.3f}", fill=(255, 255, 255), font=font); thumbs.append(t)
cols = 4; rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new('RGB', (480 * cols, 270 * rows), (20, 20, 20))
for i, t in enumerate(thumbs): sheet.paste(t, ((i % cols) * 480, (i // cols) * 270))
sheet.save('docs/v2/shots/qa/visual_sheet.jpg', quality=85)
json.dump(R, open('docs/v2/reports/qa-visual.json', 'w'), indent=1)
for sid, S in R['spots'].items():
    if 'img' in S: print(sid, json.dumps({k: v for k, v in S['img'].items() if not k.endswith('Tile')}), 'float', S.get('audit', {}).get('nFloat'), 'sink', S.get('audit', {}).get('nSink'), 'badMats', len(S.get('mats', {}).get('bad', [])))
