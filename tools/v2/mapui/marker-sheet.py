# r2-mapui: before / after sheet for the world markers (item 7): old beam markers vs the new ring + chevron markers,
# same street, same camera, day and night, plus close crops.  python3 tools/v2/mapui/marker-sheet.py
from PIL import Image, ImageDraw, ImageFont
D = 'docs/v2/shots/r2-mapui/'
try: F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except Exception: F = ImageFont.load_default()
def lab(im, t):
    d = ImageDraw.Draw(im); d.rectangle((0, 0, im.width, 34), fill=(12, 14, 20)); d.text((10, 6), t, fill=(240, 240, 240), font=F); return im
W, H = 800, 450
rows = []
for tod in ('day', 'night'):
    rows.append([lab(Image.open(D + f'markers_old_{tod}.jpg').convert('RGB').resize((W, H)), f'Before ({tod}): white race beam + 40 m pillars'),
                 lab(Image.open(D + f'markers_new_{tod}.jpg').convert('RGB').resize((W, H)), f'After ({tod}): ring, soft glow, chevron')])
rows.append([lab(Image.open(D + 'markers_old_day_far.jpg').convert('RGB').resize((W, H)), 'Before: from 70 m back'),
             lab(Image.open(D + 'markers_new_day_far.jpg').convert('RGB').resize((W, H)), 'After: from 70 m back')])
crop = (640, 380, 1100, 610)
rows.append([lab(Image.open(D + 'markers_new_day.jpg').convert('RGB').crop(crop).resize((W, H), Image.LANCZOS), 'After, day, close crop: race start / mission / delivery / checkpoint'),
             lab(Image.open(D + 'markers_new_night.jpg').convert('RGB').crop(crop).resize((W, H), Image.LANCZOS), 'After, night, close crop')])
S = Image.new('RGB', (W * 2 + 18, H * len(rows) + 10 * (len(rows) + 1)), (30, 32, 38))
for j, row in enumerate(rows):
    for i, im in enumerate(row): S.paste(im, (6 + i * (W + 6), 10 + j * (H + 10)))
S.save(D + 'sheet_markers.jpg', quality=90)
print(D + 'sheet_markers.jpg', S.size)
