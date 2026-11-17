#!/usr/bin/env python3
# r2-water: Boat 10 (Mini Fan Airboat) texture prep. Reads the user's textures (never writes into Models/), removes the
# real brand marks (engine maker name + logo, US state registration and validation sticker), softens the toy-like
# speckle on the non-skid deck, adds low-frequency fade / grime so big flat areas are not clean color, and writes
# 2048 maps to the out dir:  python3 -I airboat_tex.py <Boat 10 textures dir> <out dir>
import sys, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
FONT = '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf'
FONT_N = '/System/Library/Fonts/Supplemental/Arial Narrow.ttf'
S = 4096 / 768.0
col = Image.open(os.path.join(src, 'Hull Color.png')).convert('RGB')
alpha = Image.open(os.path.join(src, 'Hull A.png')).convert('RGBA').split()[-1]
if alpha.getextrema()[0] == 255:  # alpha stored in the color channels instead
    alpha = Image.open(os.path.join(src, 'Hull A.png')).convert('L')
px = col.load()
d = ImageDraw.Draw(col)
# --- engine shroud band: red maker name -> invented VANTRO (yellow accent, as the outboard brand table)
x0, y0, x1, y1 = int(375 * S), int(150 * S), int(600 * S), int(208 * S)
mask = Image.new('L', col.size, 0); mp = mask.load()
for y in range(y0, y1):
    for x in range(x0, x1):
        r, g, b = px[x, y]
        if (r > 90 and r > g * 1.6 and r > b * 1.6) or (r + g + b < 3 * 150): mp[x, y] = 255  # red letters + their dark outline / AA (not the white border lines)
mask = mask.filter(ImageFilter.MaxFilter(5))
# keep the white border lines intact: never paint over near-white pixels
wl = col.convert('L').point(lambda v: 255 if v > 170 else 0).filter(ImageFilter.MaxFilter(5))
mask = ImageChops.subtract(mask, wl)
col.paste((22, 22, 22), (0, 0), mask)
f = ImageFont.truetype(FONT, int(40 * S))
d.text((int(488 * S), int(181 * S)), 'VANTRO', font=f, fill=(206, 168, 40), anchor='mm')
# --- round maker logo (white Z in a black disc) -> black disc with a white stencil V (the same invented maker)
cx, cy, rr = int(722 * S), int(133 * S), int(36 * S)
d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(22, 22, 22))
w = int(7 * S)
d.line([(cx - int(20 * S), cy - int(18 * S)), (cx, cy + int(20 * S)), (cx + int(20 * S), cy - int(18 * S))], fill=(228, 228, 222), width=w, joint='curve')
# --- non-skid deck speckle: pull black / white flecks 65% toward the local gray (reads as textured coating, not confetti)
blur = col.filter(ImageFilter.GaussianBlur(int(4 * S)))
for box in [(int(615 * S), int(190 * S), int(752 * S), int(395 * S)), (int(520 * S), int(392 * S), int(768 * S) - 1, int(768 * S) - 1)]:
    a = col.crop(box); bb = blur.crop(box)
    col.paste(Image.blend(a, bb, 0.65), box)
# --- low-frequency fade + grime over the whole sheet (+-6% value, slightly warm dirt), seeded
random.seed(7)
n = Image.effect_noise((256, 256), 48).resize(col.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(24))
n2 = Image.effect_noise((64, 64), 40).resize(col.size, Image.BICUBIC)
grime = Image.merge('RGB', [ImageChops.add(n, n2, 2.0, -64)] * 3)
col = ImageChops.multiply(col, Image.eval(grime, lambda v: int(min(255, 232 + (v - 128) * 0.25))))
# soft knee on the light grays (painted aluminum interior read near-white in noon sun; art guide: nothing diffuse clips)
col = col.point(lambda v: v if v < 140 else int(140 + (v - 140) * 0.42))
col = col.resize((2048, 2048), Image.LANCZOS)
al = alpha.resize((2048, 2048), Image.LANCZOS)
# keep thin wires alive at 2048: a slight dilation of the cage mask before downscaling would fatten; instead boost contrast
al = al.point(lambda v: 255 if v > 70 else int(v * 3.6))
rgba = col.copy(); rgba.putalpha(al)
rgba.save(os.path.join(out, 'airboat_col.png'))
# normal / roughness / metal (downscaled; roughness gets the same grime so dirt reads rougher)
Image.open(os.path.join(src, 'Hull Normal.png')).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(os.path.join(out, 'airboat_nrm.png'))
rough = Image.open(os.path.join(src, 'Hull Roughness.png')).convert('L').resize((1024, 1024), Image.LANCZOS)
rough = rough.point(lambda v: max(int(0.30 * 255), v))  # nothing outdoors below 0.30 (art guide)
rough.save(os.path.join(out, 'airboat_rgh.png'))
Image.open(os.path.join(src, 'Hull Metallic.png')).convert('L').resize((1024, 1024), Image.LANCZOS).point(lambda v: 255 if v > 127 else 0).save(os.path.join(out, 'airboat_mtl.png'))
# --- registration decal: invented Florida-style number, plain validation decal with no state name
reg = Image.open(os.path.join(src, 'Registration Decal Color.png')).convert('RGB')
bg = reg.getpixel((2000, 3000))
regA = Image.new('L', reg.size, 0)
rd, ad = ImageDraw.Draw(reg), ImageDraw.Draw(regA)
ft = ImageFont.truetype(FONT_N, int(62 * S))
for (tx, ty, sx, sy) in [(65, 57, 352, 31), (408, 191, 343, 166)]:
    rd.rectangle((0 if tx < 100 else int(330 * S), int((ty - 32) * S), int(700 * S), int((ty + 32) * S)), fill=bg)
    rd.text((int(tx * S), int(ty * S)), 'FL 4127 SG', font=ft, fill=(236, 236, 230), anchor='lm')
    ad.text((int(tx * S), int(ty * S)), 'FL 4127 SG', font=ft, fill=255, anchor='lm')
    b = (int(sx * S), int(sy * S), int((sx + 54) * S), int((sy + 52) * S))
    rd.rectangle(b, fill=(214, 168, 44)); ad.rectangle(b, fill=255)
    rd.text(((b[0] + b[2]) // 2, (b[1] + b[3]) // 2), '26', font=ImageFont.truetype(FONT, int(30 * S)), fill=(30, 40, 70), anchor='mm')
reg = reg.resize((1024, 1024), Image.LANCZOS); regA = regA.resize((1024, 1024), Image.LANCZOS)
reg.putalpha(regA); reg.save(os.path.join(out, 'airboat_reg.png'))
print('ok', out)
