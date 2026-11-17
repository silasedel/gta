#!/usr/bin/env python3
# Ground pass: side-by-side sheets (reference target | game), same layout as tools/v2/keys/sheets.py.
#   python3 tools/v2/roads/cmp.py NAME REF GAMESHOT [--right]   (--right: use the right half of a before/after reference)
#   -> docs/v2/shots/stage1/cmp_ground_NAME.png
import os, sys
from PIL import Image, ImageDraw
name, ref, shot = sys.argv[1:4]; right = '--right' in sys.argv
a = Image.open(ref).convert('RGB')
if right: a = a.crop((a.width // 2 + 4, 0, a.width, a.height))
b = Image.open(shot).convert('RGB'); H = 720
a = a.resize((int(a.width * H / a.height), H), Image.LANCZOS); b = b.resize((int(b.width * H / b.height), H), Image.LANCZOS)
M = Image.new('RGB', (a.width + b.width + 8, H + 26), (18, 18, 18)); M.paste(a, (0, 26)); M.paste(b, (a.width + 8, 26))
d = ImageDraw.Draw(M); d.text((6, 6), 'reference: ' + os.path.basename(ref) + (' (target half)' if right else ''), fill=(255, 230, 120)); d.text((a.width + 14, 6), 'game: ' + os.path.basename(shot), fill=(160, 220, 255))
out = f'docs/v2/shots/stage1/cmp_ground_{name}.png'; M.save(out); print(out)
