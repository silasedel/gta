# r2-mapui: HUD corner vs the user's references, all on flat white.
# python3 tools/v2/hudcorner/sheet.py <tag>  ->  docs/v2/shots/hudcorner/sheet_corner.jpg
import sys
from PIL import Image, ImageDraw, ImageFont
D = 'docs/v2/shots/hudcorner/'
tag = sys.argv[1] if len(sys.argv) > 1 else 'after'
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 24)
except Exception: F = ImageFont.load_default()
def on_white(im):
    im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); return bg.convert('RGB')
def lab(im, t, W, H):
    r = min(W / im.width, (H - 40) / im.height); im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    c = Image.new('RGB', (W, H), (255, 255, 255)); c.paste(im, ((W - im.width) // 2, 40 + (H - 40 - im.height) // 2))
    d = ImageDraw.Draw(c); d.rectangle((0, 0, W, 34), fill=(24, 26, 32)); d.text((10, 5), t, fill=(240, 240, 240), font=F); return c
W, H = 760, 760
tgt = on_white(Image.open('docs/v2/plan/hud_corner_target.webp')).crop((150, 30, 1400, 1020))
ref46 = Image.open('references/ref_46_hud_top_right_user_target.png').convert('RGB')
row1 = [lab(tgt, 'Target: hud_corner_target.webp', W, H), lab(Image.open(D + f'white_{tag}_pistol.png').convert('RGB'), 'Ours: same state (4 stars, pistol 20 / 73)', W, H),
        lab(ref46, 'Target: ref_46 (money rows)', W, H), lab(Image.open(D + f'white_{tag}_none.png').convert('RGB'), 'Ours: no weapon out (bank + cash, clock)', W, H)]
row2 = [lab(Image.open(D + f'white_{tag}_{n}.png').convert('RGB'), f'Ours: {n}', W, H) for n in ('rifle', 'shotgun', 'smg', 'bat')]
S = Image.new('RGB', (W * 4 + 30, H * 2 + 30), (200, 202, 208))
for j, row in enumerate([row1, row2]):
    for i, im in enumerate(row): S.paste(im, (6 + i * (W + 6), 10 + j * (H + 10)))
S.save(D + 'sheet_corner.jpg', quality=90)
print(D + 'sheet_corner.jpg', S.size)
