# r4-house: side-by-side sheets, the user's mock-up (left) next to the game shot (right), JPG q90.
#   python3 tools/v2/keys/r4house/sheets.py <set>
import sys
from PIL import Image, ImageDraw
S = sys.argv[1]; R = 'docs/v2/plan/nico_house/r4/'; G = 'docs/v2/shots/keys/'; O = 'docs/v2/shots/nico_r4/'
pairs = [('08_back_dock_seawall', 's08_water'), ('02_exterior_stilts_deck', 's02_low'), ('10_side_carport_basketball', 's10_side'), ('03_front_door', 's03_door'),
         ('01_roof_view_yard_dumpster', 's01_roof'), ('04_entry_hallway', 's05_hall'), ('05_hall_opens_kitchen_right', 's05_hall'), ('06_living_room', 's06_living'), ('07_kitchen_wide_from_back', 's07_kitchen'), ('09_terrarium_corn_snake', 's09_terra')]
rows = []
for ref, shot in pairs:
    try: a = Image.open(R + ref + '.webp').convert('RGB'); b = Image.open(G + f'{S}_{shot}.png').convert('RGB')
    except Exception as e: print('skip', ref, e); continue
    h = 540; a = a.resize((int(a.width * h / a.height), h)); b = b.resize((int(b.width * h / b.height), h))
    im = Image.new('RGB', (a.width + b.width + 10, h), 'white'); im.paste(a, (0, 0)); im.paste(b, (a.width + 10, 0))
    d = ImageDraw.Draw(im); d.text((8, 8), 'mock-up ' + ref[:2], fill=(255, 255, 0)); d.text((a.width + 18, 8), 'game ' + S, fill=(255, 255, 0))
    im.save(O + f'cmp_{ref[:2]}_{S}.jpg', quality=90); rows.append(im)
W = max(r.width for r in rows); sheet = Image.new('RGB', (W, sum(r.height for r in rows)), 'white'); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height
sheet.save(O + f'sheet_{S}.jpg', quality=90); print('ok', len(rows))
