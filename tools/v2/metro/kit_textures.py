# r2-metro quality pass: tiling surface textures for the station / tunnel / car, cropped from the user's Subway 1 kit atlases,
# and the Train 2 atlases with the graffiti tags closed out (a clean Southline car).
#   python3 -I tools/v2/metro/kit_textures.py <out public/assets/metro/tex> <train-clean dir>
import sys, os
from PIL import Image, ImageFilter, ImageChops
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
S1 = os.path.join(ROOT, 'Models/Subway/Subway 1 - Long Subway Station Tunnel/textures')
T2 = os.path.join(ROOT, 'Models/Trains/Train 2 - Blue Subway Car Shell/textures')
OUT, TCLEAN = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True); os.makedirs(TCLEAN, exist_ok=True)
def crop(name, box, out, size=1024, gray=False, q=88):
    im = Image.open(os.path.join(S1, name)).convert('RGB'); w, h = im.size
    c = im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))).resize((size, size), Image.LANCZOS)
    if gray:   # detail map for aoMap: mean 1.0-ish (normalize so the average stays bright), red channel is used
        g = c.convert('L'); import statistics
        m = max(1, statistics.mean(g.getdata())); g = g.point(lambda v: min(255, int(v * 225 / m)))
        c = Image.merge('RGB', (g, g, g))
    c.save(os.path.join(OUT, out), quality=q)
crop('SueloModular Color.jpeg', (0.0, 0.30, 1.0, 1.0), 'floor_stone.jpg')
crop('SueloModular Color.jpeg', (0.0, 0.0, 1.0, 0.195), 'tactile.jpg', size=512)
crop('ParedesModulares Color.jpeg', (0.0, 0.36, 0.48, 1.0), 'wall_tile.jpg')
crop('ParedesModulares Color.jpeg', (0.0, 0.36, 0.48, 1.0), 'wall_tile_d.jpg', gray=True)
crop('Techos Modulares Color.jpeg', (0.0, 0.42, 0.95, 1.0), 'ceiling_d.jpg', gray=True)
crop('Techos Modulares Color.jpeg', (0.0, 0.42, 0.95, 1.0), 'ceiling.jpg')
crop('ParedTunel Color.jpeg', (0.0, 0.42, 0.88, 1.0), 'tunnel_wall.jpg')
crop('SueloVias Color.jpeg', (0.0, 0.42, 0.75, 1.0), 'track_bed.jpg')
crop('SueloInterior Color.jpeg', (0.0, 0.0, 0.6, 1.0), 'car_floor.jpg', size=512)
crop('Pilar Color.jpeg', (0.0, 0.0, 1.0, 1.0), 'grime_d.jpg', gray=True, size=512)
# Train 2: close out the dark marker tags (thin dark strokes) on the wall and bench atlases
for n in ('Walls Color.png', 'Bench Color.png'):
    im = Image.open(os.path.join(T2, n)).convert('RGB').resize((2048, 2048), Image.LANCZOS)
    closed = im.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    # only replace where the original is clearly darker than the closed version (the tags), keep panel edges
    diff = ImageChops.subtract(closed, im).convert('L').point(lambda v: 255 if v > 22 else 0).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2))
    Image.composite(closed, im, diff).save(os.path.join(TCLEAN, n.replace('.png', '.jpg')), quality=92)
print('ok')
