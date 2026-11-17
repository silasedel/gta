# r2-mapui: stars strip next to the references.  python3 tools/v2/hudcorner/stars-sheet.py -> docs/v2/shots/hudcorner/sheet_stars.jpg
from PIL import Image, ImageDraw, ImageFont
D = 'docs/v2/shots/hudcorner/'
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except Exception: F = ImageFont.load_default()
W, H = 560, 330
def cell(im, t):
    r = min(W / im.width, (H - 40) / im.height); im = im.convert('RGB').resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    c = Image.new('RGB', (W, H), (24, 26, 32)); c.paste(im, ((W - im.width) // 2, 40 + (H - 40 - im.height) // 2)); ImageDraw.Draw(c).text((10, 7), t, fill=(240, 240, 240), font=F); return c
tgt = Image.open('docs/v2/plan/hud_corner_target.webp').convert('RGBA'); bg = Image.new('RGBA', tgt.size, (143, 180, 224, 255)); bg.alpha_composite(tgt)
cells = [cell(Image.open('references/ref_46_hud_top_right_user_target.png').crop((0, 0, 170, 70)), 'ref_46: 0 wanted (all empty)'),
         cell(bg.crop((150, 40, 1400, 260)), 'hud_corner_target: 2 earned (white)')]
for n, t in [('0', 'Ours: 0 wanted'), ('1', 'Ours: 1 star'), ('3', 'Ours: 3 stars'), ('6', 'Ours: 6 stars'), ('flash_0', 'Ours: evade flash (a)'), ('flash_1', 'Ours: evade flash (b)')]:
    cells.append(cell(Image.open(D + f'stars_{n}.png').crop((0, 0, 960, 330)), t))
S = Image.new('RGB', (W * 2 + 18, (H + 6) * 4 + 6), (60, 62, 70))
for i, c in enumerate(cells): S.paste(c, (6 + (i % 2) * (W + 6), 6 + (i // 2) * (H + 6)))
S.save(D + 'sheet_stars.jpg', quality=90); print(D + 'sheet_stars.jpg', S.size)
