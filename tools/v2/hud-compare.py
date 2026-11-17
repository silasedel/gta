#!/usr/bin/env python3
# hud-compare.py <shots dir>: side-by-side sheet of the HUD corner target and our in-game corner (stage 1 job 6).
# Top: target (scaled to the in-game size, 1 target px = 1/6.5 screen px) next to hud_4.png, both zoomed 3x.
# Bottom: hud_0..hud_6 at 1:1 plus the two flash phases. Writes <dir>/hud_compare.png.
import sys, os
from PIL import Image, ImageDraw

D = sys.argv[1] if len(sys.argv) > 1 else 'docs/v2/shots/stage1'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
U = 1 / 6.5
CLIP_X = 1600                  # hud-shots.mjs crops x 1600..1920, y 0..380
RIGHT, TOP = 1894 - CLIP_X, 22  # corner right edge / top inside the crop
tgt = Image.open(os.path.join(ROOT, 'docs/v2/plan/hud_corner_target.webp')).convert('RGBA').crop((150, 40, 1390, 1016))
tw, th = round(1240 * U), round(976 * U)
tsmall = tgt.resize((tw, th), Image.LANCZOS)

def load(n):
    p = os.path.join(D, n)
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None

ours4 = load('hud_4.png')
box = (RIGHT - tw - 8, TOP - 8, RIGHT + 8, TOP + th + 8)
Z = 3
bw, bh = box[2] - box[0], box[3] - box[1]
left = ours4.crop(box) if ours4 else Image.new('RGBA', (bw, bh), (40, 40, 40, 255))
# target over the same game background (our shot with the HUD region as the backdrop is not available), so use a neutral sky tone
right = Image.new('RGBA', (bw, bh), (104, 134, 170, 255))
right.alpha_composite(tsmall, (8, 8))
pad, lab = 16, 26
strip = [n for n in ['hud_0.png', 'hud_1.png', 'hud_2.png', 'hud_3.png', 'hud_4.png', 'hud_5.png', 'hud_6.png', 'hud_flash_a.png', 'hud_flash_b.png'] if load(n)]
sw, sh = 210, 300
W = max(2 * bw * Z + 3 * pad, len(strip) * (sw + 8) + 2 * pad)
H = lab + bh * Z + pad + lab + sh + pad
M = Image.new('RGB', (W, H), (18, 18, 20))
d = ImageDraw.Draw(M)
d.text((pad, 6), 'OURS (hud_4, in game, 3x)', fill=(255, 220, 0))
d.text((2 * pad + bw * Z, 6), 'TARGET (hud_corner_target.webp at the same scale, 3x)', fill=(255, 220, 0))
M.paste(left.convert('RGB').resize((bw * Z, bh * Z), Image.NEAREST), (pad, lab))
M.paste(right.convert('RGB').resize((bw * Z, bh * Z), Image.NEAREST), (2 * pad + bw * Z, lab))
y0 = lab + bh * Z + pad
d.text((pad, y0 + 4), 'In game, 1:1: wanted 0..6, then 3 stars flashing (police lost sight)', fill=(255, 220, 0))
for i, n in enumerate(strip):
    im = load(n).crop((RIGHT - sw + 4, 0, RIGHT + 6, sh)).convert('RGB')
    x = pad + i * (sw + 8)
    M.paste(im, (x, y0 + lab))
    d.rectangle((x, y0 + lab, x + 7 * len(n) + 6, y0 + lab + 14), fill=(0, 0, 0))
    d.text((x + 3, y0 + lab + 1), n.replace('.png', ''), fill=(255, 255, 0))
out = os.path.join(D, 'hud_compare.png')
M.save(out)
print('wrote', out)
