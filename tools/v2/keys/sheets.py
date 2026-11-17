#!/usr/bin/env python3
# sheets.py SET : side-by-side sheets (reference | game) for every spot of tools/v2/keys/spots_refs.json that has a shot
#   -> docs/v2/shots/keys/cmp_<SET>_<id>.png
import json, sys, os
from PIL import Image, ImageDraw
S = sys.argv[1]; D = 'docs/v2/shots/keys'; spots = json.load(open('tools/v2/keys/spots_refs.json'))
for k, s in spots.items():
    shot = f'{D}/{S}_{k}.png'
    if not os.path.exists(shot) or 'ref' not in s: continue
    a = Image.open(s['ref']).convert('RGB'); b = Image.open(shot).convert('RGB'); H = 720
    a = a.resize((int(a.width * H / a.height), H), Image.LANCZOS); b = b.resize((int(b.width * H / b.height), H), Image.LANCZOS)
    M = Image.new('RGB', (a.width + b.width + 8, H + 26), (18, 18, 18)); M.paste(a, (0, 26)); M.paste(b, (a.width + 8, 26))
    d = ImageDraw.Draw(M); d.text((6, 6), 'reference: ' + os.path.basename(s['ref']), fill=(255, 230, 120)); d.text((a.width + 14, 6), f'game: {S}_{k}  tod {s.get("tod")}  {s.get("weather", "clear")}', fill=(120, 230, 255))
    M.save(f'{D}/cmp_{S}_{k}.png'); print('sheet', f'{D}/cmp_{S}_{k}.png')
