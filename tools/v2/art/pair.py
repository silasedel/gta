#!/usr/bin/env python3
# r2-art: side-by-side before/after sheet (JPG q90): pair.py before.jpg after.jpg out.jpg "title" ["label a" "label b"]
import sys
from PIL import Image, ImageDraw, ImageFont
a, b, out, title = sys.argv[1], sys.argv[2], sys.argv[3], (sys.argv[4] if len(sys.argv) > 4 else '')
la = sys.argv[5] if len(sys.argv) > 5 else 'BEFORE (as imported)'
lb = sys.argv[6] if len(sys.argv) > 6 else 'AFTER (r2-art calibration)'
A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
if len(sys.argv) > 7 and sys.argv[7] == 'crop':  # 2x center crop (z-fighting / floating parts)
    W0, H0 = A.size; box = (W0 // 4, H0 // 4, W0 * 3 // 4, H0 * 3 // 4)
    A = A.crop(box).resize((W0, H0), Image.LANCZOS); B = B.crop(box).resize((W0, H0), Image.LANCZOS)
w, h = A.size
S = Image.new('RGB', (w * 2 + 8, h + 34), (18, 18, 20))
S.paste(A, (0, 34)); S.paste(B, (w + 8, 34))
d = ImageDraw.Draw(S)
try:
    f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
except Exception:
    f = ImageFont.load_default()
d.text((10, 6), la + '  ' + title, fill=(235, 235, 235), font=f)
d.text((w + 18, 6), lb, fill=(235, 235, 235), font=f)
S.save(out, quality=90)
