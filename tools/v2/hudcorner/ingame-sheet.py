# r2-mapui: HUD corner in game, before / after, day / night, weapon out / none, 1080p and Retina (DPR 2).
# python3 tools/v2/hudcorner/ingame-sheet.py  ->  docs/v2/shots/hudcorner/sheet_corner_ingame.jpg
from PIL import Image, ImageDraw, ImageFont
D = 'docs/v2/shots/hudcorner/'
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 20)
except Exception: F = ImageFont.load_default()
W, H = 400, 500
def cell(f, t):
    im = Image.open(D + f).convert('RGB').resize((400, 460), Image.LANCZOS)
    c = Image.new('RGB', (W, H), (24, 26, 32)); c.paste(im, (0, 40)); ImageDraw.Draw(c).text((8, 9), t, fill=(240, 240, 240), font=F); return c
rows = []
for tag in ('before', 'after'):
    rows.append([cell(f'corner_{tag}_dpr1_{tod}_{w}.png', f'{tag}: {tod}, {"pistol" if w == "gun" else "no weapon"}') for tod in ('day', 'night') for w in ('gun', 'none')])
    rows[-1] += [cell(f'corner_{tag}_dpr2_day_gun.png', f'{tag}: Retina (DPR 2)')]
S = Image.new('RGB', (W * 5 + 24, H * 2 + 18), (60, 62, 70))
for j, row in enumerate(rows):
    for i, im in enumerate(row): S.paste(im, (4 + i * (W + 4), 6 + j * (H + 6)))
S.save(D + 'sheet_corner_ingame.jpg', quality=90)
print(D + 'sheet_corner_ingame.jpg', S.size)
