# r4-air: contact sheet from a frames json ([{f, label}]) -> JPG q90.   python3 tools/v2/air/sheet.py frames.json out.jpg [cols] [maxN]
import json, sys
from PIL import Image, ImageDraw, ImageFont
fr = json.load(open(sys.argv[1])); out = sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4; mx = int(sys.argv[4]) if len(sys.argv) > 4 else 16
if len(fr) > mx:
    idx = [round(i * (len(fr) - 1) / (mx - 1)) for i in range(mx)]; fr = [fr[i] for i in idx]
W, H = 480, 270; rows = (len(fr) + cols - 1) // cols
s = Image.new('RGB', (W * cols, H * rows), (18, 18, 18)); d = ImageDraw.Draw(s)
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 17)
except Exception: font = ImageFont.load_default()
for i, e in enumerate(fr):
    im = Image.open(e['f']).convert('RGB').resize((W, H)); x, y = (i % cols) * W, (i // cols) * H; s.paste(im, (x, y))
    d.rectangle([x, y + H - 26, x + W, y + H], fill=(0, 0, 0)); d.text((x + 8, y + H - 23), f"{i + 1}. {e['label']}", fill=(240, 240, 235), font=font)
s.save(out, quality=90); print('sheet', out, len(fr))
