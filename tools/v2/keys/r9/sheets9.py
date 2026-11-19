# r8: reference | game sheets from tools/v2/keys/r9/spots9.json and docs/v2/shots/nico_r8/<set>_<id>.png
#   python3 tools/v2/keys/r8/sheets8.py <set>   -> docs/v2/shots/nico_r8/cmp_<set>_<id>.jpg + sheet_<set>.jpg
import sys, json, os
from PIL import Image, ImageDraw
S = sys.argv[1]; R = 'docs/v2/plan/nico_house/'; O = 'docs/v2/shots/nico_r8/'
spots = json.load(open('tools/v2/keys/r9/spots9.json')); rows = []
for sid, sp in spots.items():
    f = O + f'{S}_{sid}.png'
    if not os.path.isfile(f): continue
    b = Image.open(f).convert('RGB'); h = 540; b = b.resize((int(b.width * h / b.height), h))
    rp = R + sp['ref'] if sp.get('ref') and os.path.isfile(R + sp['ref']) else None
    a = Image.open(rp).convert('RGB') if rp else Image.new('RGB', (b.width, h), (90, 90, 90)); a = a.resize((int(a.width * h / a.height), h))
    im = Image.new('RGB', (a.width + b.width + 10, h), 'white'); im.paste(a, (0, 0)); im.paste(b, (a.width + 10, 0))
    d = ImageDraw.Draw(im); lab = f"{sid}  hdg {sp.get('hdg', 'top')}"; d.rectangle([0, 0, 360, 22], fill=(0, 0, 0)); d.text((6, 5), 'reference ' + (sp.get('ref') or '-'), fill=(255, 255, 0)); d.rectangle([a.width + 10, 0, a.width + 330, 22], fill=(0, 0, 0)); d.text((a.width + 16, 5), f'game {S} {lab}', fill=(255, 255, 0))
    im.save(O + f'cmp_{S}_{sid}.jpg', quality=86); rows.append(im)
if rows:
    W = max(r.width for r in rows); sheet = Image.new('RGB', (W, sum(r.height for r in rows)), 'white'); y = 0
    for r in rows: sheet.paste(r, (0, y)); y += r.height
    sheet.save(O + f'sheet_{S}.jpg', quality=82)
import shutil, glob
os.makedirs('docs/v2/plan/nico_house/r9', exist_ok=True)
for f in glob.glob(O + f'cmp_{S}_*.jpg') + [O + f'sheet_{S}.jpg']:
    if os.path.isfile(f): shutil.copy(f, 'docs/v2/plan/nico_house/r9/')
print('ok', len(rows))
