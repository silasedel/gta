# r7: side-by-side sheets, mock-up (left) | game (right), from tools/v2/keys/r7/spots_r7.json and docs/v2/shots/keys/<set>_<id>.png
#   python3 tools/v2/keys/r7/sheets7.py <set>   -> docs/v2/shots/nico_r7/cmp_<id>_<set>.jpg + sheet_<set>.jpg
import sys, json, os
from PIL import Image, ImageDraw
S = sys.argv[1]; R = 'docs/v2/plan/nico_house/'; G = 'docs/v2/shots/keys/'; O = 'docs/v2/shots/nico_r7/'
spots = json.load(open('tools/v2/keys/r7/spots_r7.json'))
rows = []
for sid, sp in spots.items():
    try: b = Image.open(G + f'{S}_{sid}.png').convert('RGB')
    except Exception as e: print('skip', sid, e); continue
    h = 540; b = b.resize((int(b.width * h / b.height), h))
    a = Image.open(next(R + sp['ref'] + e for e in ('', '.webp', '.png', '.jpg', '.jpeg') if os.path.isfile(R + sp['ref'] + e))).convert('RGB') if sp.get('ref') else Image.new('RGB', (b.width, h), 'gray')
    a = a.resize((int(a.width * h / a.height), h))
    im = Image.new('RGB', (a.width + b.width + 10, h), 'white'); im.paste(a, (0, 0)); im.paste(b, (a.width + 10, 0))
    d = ImageDraw.Draw(im); d.text((8, 8), 'mock-up ' + (sp.get('ref') or '-'), fill=(255, 255, 0)); d.text((a.width + 18, 8), f'game {S} {sid}', fill=(255, 255, 0))
    im.save(O + f'cmp_{sid}_{S}.jpg', quality=88); rows.append(im)
if rows:
    W = max(r.width for r in rows); sheet = Image.new('RGB', (W, sum(r.height for r in rows)), 'white'); y = 0
    for r in rows: sheet.paste(r, (0, y)); y += r.height
    sheet.save(O + f'sheet_{S}.jpg', quality=85)
print('ok', len(rows))
