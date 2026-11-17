# python3 -P montage.py out.jpg cols img1 img2 ...   (labels = file names; JPG q90)
import sys, os
from PIL import Image, ImageDraw
out, cols, imgs = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(p).convert('RGB') for p in imgs]
w = max(i.width for i in ims); h = max(i.height for i in ims); sc = min(1, 640 / w)
tw, th = int(w * sc), int(h * sc); rows = (len(ims) + cols - 1) // cols
M = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20)); d = ImageDraw.Draw(M)
for k, (im, p) in enumerate(zip(ims, imgs)):
    x, y = (k % cols) * tw, (k // cols) * th
    M.paste(im.resize((tw, th)), (x, y)); d.rectangle((x, y, x + 8 + 7 * len(os.path.basename(p)), y + 16), fill=(0, 0, 0)); d.text((x + 4, y + 3), os.path.basename(p), fill=(255, 255, 0))
M.save(out, quality=90)
