# Shops pass: crops the two roll-down curtains out of the user's Shutter 1 atlas (Models/Storefronts/Shutter 1 ...) into small
# WebP textures for the storefront security shutters (src/world/interiors/frontDress.js). Run: python3 -I tools/v2/shops/shutter_tex.py
import sys
from PIL import Image
SRC = 'Models/Storefronts/Shutter 1 - Rolling Steel Shutters One Plain One With Graffiti/textures/'
OUT = 'public/assets/models/shops/'
for name, fn, box in [('shutter_plain', 'Rollershutter Window 03 Color.jpg', (0.0, 0.135, 0.675, 0.56)), ('shutter_graffiti', 'Rollershutter Window 03 Graffiti Color.png', (0.0, 0.575, 0.645, 0.98))]:
    im = Image.open(SRC + fn).convert('RGB'); W, H = im.size
    c = im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)))
    if name == 'shutter_plain': c = c.rotate(90, expand=True).resize((512, 1024), Image.LANCZOS)  # slats horizontal; tiles across the opening
    else: c = c.transpose(Image.FLIP_LEFT_RIGHT).resize((1024, 640), Image.LANCZOS)  # the atlas stores this curtain mirrored (text read backwards)
    c.save(OUT + name + '.webp', 'WEBP', quality=82); print(name, c.size)
