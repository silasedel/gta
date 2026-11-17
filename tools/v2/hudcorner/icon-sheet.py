# r2-mapui: all baked HUD weapon icons on a flat white sheet, next to the target's hand-drawn pistol.
# python3 tools/v2/hudcorner/icon-sheet.py  ->  docs/v2/shots/hudcorner/sheet_weapon_icons.jpg
import json
from PIL import Image, ImageDraw, ImageFont
D = 'public/assets/ui/weapons/'
idx = json.load(open(D + 'index.json'))
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 20)
except Exception: F = ImageFont.load_default()
CW, CH, COLS = 520, 230, 4
ids = list(idx.keys())
tgt = Image.open('docs/v2/plan/hud_corner_target.webp').convert('RGBA').crop((780, 720, 1300, 1015))
cells = [('target (hand-drawn)', tgt)] + [(i, Image.open(D + i + '.png').convert('RGBA')) for i in ids]
rows = (len(cells) + COLS - 1) // COLS
S = Image.new('RGB', (CW * COLS, CH * rows), (255, 255, 255))
d = ImageDraw.Draw(S)
for n, (name, im) in enumerate(cells):
    x, y = (n % COLS) * CW, (n // COLS) * CH
    k = min((CW - 30) / im.width, (CH - 50) / im.height)
    im2 = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    if name.startswith('target'):
        bg = Image.new('RGBA', im2.size, (255, 255, 255, 255)); m = im2.split()[3]; bg.paste(im2, (0, 0), m); im2 = bg
    S.paste(im2, (x + (CW - im2.width) // 2, y + 36 + (CH - 46 - im2.height) // 2), im2 if im2.mode == 'RGBA' else None)
    d.text((x + 10, y + 8), name, fill=(40, 40, 40), font=F)
S.save('docs/v2/shots/hudcorner/sheet_weapon_icons.jpg', quality=90)
print('docs/v2/shots/hudcorner/sheet_weapon_icons.jpg', S.size)
