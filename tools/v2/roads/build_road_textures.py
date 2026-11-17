#!/usr/bin/env python3
# Road surface textures from the user's road models (Models/Roads/*): photoscanned sets repacked for the runtime
#   <name>_col.jpg (sRGB albedo), <name>_nrm.jpg (OpenGL normal), <name>_arm.jpg (R = AO 1, G = roughness, B = metal 0)
# into public/assets/textures/roads/, plus a road-line atlas cut from Road 1's RoadLines scan, and SOURCES.txt.
#   python3 tools/v2/roads/build_road_textures.py
import os
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
M = os.path.join(ROOT, 'Models', 'Roads')
OUT = os.path.join(ROOT, 'public', 'assets', 'textures', 'roads')
os.makedirs(OUT, exist_ok=True)
src = []

def load(p, mode='RGB'):
    return Image.open(os.path.join(M, p)).convert(mode)

def arm(rough, size):
    r = rough.convert('L').resize(size, Image.LANCZOS)
    return Image.merge('RGB', (Image.new('L', size, 255), r, Image.new('L', size, 0)))

def put(name, col, nrm=None, rough=None, size=2048, note=''):
    c = load(col).resize((size, size), Image.LANCZOS); c.save(os.path.join(OUT, f'{name}_col.jpg'), quality=90)
    if nrm: load(nrm).resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'{name}_nrm.jpg'), quality=92)
    else: Image.new('RGB', (64, 64), (128, 128, 255)).save(os.path.join(OUT, f'{name}_nrm.jpg'), quality=95)
    if rough: arm(load(rough, 'L'), (size, size)).save(os.path.join(OUT, f'{name}_arm.jpg'), quality=92)
    else: Image.merge('RGB', (Image.new('L', (64, 64), 255), Image.new('L', (64, 64), 235), Image.new('L', (64, 64), 0))).save(os.path.join(OUT, f'{name}_arm.jpg'), quality=95)
    src.append(f'{name}: {col}' + (f' | normal {nrm}' if nrm else '') + (f' | roughness {rough}' if rough else '') + (f'  ({note})' if note else ''))

put('asphalt', 'Road 6 - Road Through Tunnel Hill/textures/Asphalt Color.jpeg', 'Road 6 - Road Through Tunnel Hill/textures/Asphalt Normal.jpeg', 'Road 6 - Road Through Tunnel Hill/textures/Asphalt Roughness.jpeg', note='streets, junctions, caps; ~3.2 m per tile')
put('sidewalk', 'Road 4 - Road Bridge Over Dirt/textures/Sidewalk Color.jpeg', 'Road 4 - Road Bridge Over Dirt/textures/Sidewalk Normal.jpeg', 'Road 4 - Road Bridge Over Dirt/textures/Sidewalk Roughness.jpeg', note='poured concrete sidewalk panels with tooled joints; 3 m per tile = 1.5 m panels; also curb faces and ramps')
put('pavers', 'Road 2 - Four-Way Crossroads Tile/textures/Block05 Color.jpg', 'Road 2 - Four-Way Crossroads Tile/textures/Block 5 Normal.jpg', 'Road 2 - Four-Way Crossroads Tile/textures/Block 5 Roughness.jpg', note='downtown / business sidewalks and block plazas')
put('dirt', 'Road 11 - Dirt Road Forest Island Scene/textures/Dirt Road Color.png', 'Road 11 - Dirt Road Forest Island Scene/textures/Dirt Road Normal.png', 'Road 11 - Dirt Road Forest Island Scene/textures/Dirt Road Roughness.png', size=1024, note="unpaved tracks (surface 'dirt')")
# road edge: Road 11's crumbling asphalt-to-dust edge strip (u along the road, v across: 0 = asphalt side)
e = load('Road 11 - Dirt Road Forest Island Scene/textures/Dusty Road Edge Gravel.png'); e.save(os.path.join(OUT, 'edge_col.jpg'), quality=92)
g = load('Road 6 - Road Through Tunnel Hill/textures/Gravel Normal.jpeg').resize((1024, 512), Image.LANCZOS); g.save(os.path.join(OUT, 'edge_nrm.jpg'), quality=92)
arm(load('Road 6 - Road Through Tunnel Hill/textures/Gravel Roughness.jpeg', 'L'), (1024, 512)).save(os.path.join(OUT, 'edge_arm.jpg'), quality=92)
src.append('edge: Road 11 - Dirt Road Forest Island Scene/textures/Dusty Road Edge Gravel.png | normal + roughness from Road 6 Gravel  (shoulders: asphalt edge crumbling into dust / sand, dissolves into the verge)')
# road-line atlas from Road 1's RoadLines scan: 4 columns x 2048 rows, v repeats along the line (~9 m per repeat)
L = 'Road 1 - Long Asphalt Road Strip/textures/'
cols = [(173, 236), (1922, 2004), (3861, 3924), (900, 1100)]  # white line, yellow line, second white line, plain asphalt (patches)
for kind, fn in (('col', 'RoadLines Color.jpg'), ('nrm', 'RoadLines Normal.jpg'), ('arm', 'RoadLines Roughness.jpg')):
    im = load(L + fn, 'L' if kind == 'arm' else 'RGB'); H = im.size[1]
    atlas = Image.new('L' if kind == 'arm' else 'RGB', (512, 2048))
    for i, (a, b) in enumerate(cols):
        pad = 3 if i < 3 else 0
        atlas.paste(im.crop((a + pad, 0, b - pad, H)).resize((128, 2048), Image.LANCZOS), (i * 128, 0))
    if kind == 'arm': atlas = arm(atlas, atlas.size)
    atlas.save(os.path.join(OUT, f'lines_{kind}.jpg'), quality=92)
src.append(f'lines: {L}RoadLines Color/Normal/Roughness.jpg  (atlas columns: white line px 173-236, yellow line px 1922-2004, white line px 3861-3924, plain asphalt px 900-1100; markings, crosswalks, stop bars, sealed patches)')
with open(os.path.join(OUT, 'SOURCES.txt'), 'w') as f:
    f.write('Road surface textures (stage 1 job 4). All from the user\'s road model library Models/Roads (license: see Models/catalog.csv rows Road 1..11),\n'
            'repacked by tools/v2/roads/build_road_textures.py: <name>_col.jpg albedo (sRGB), <name>_nrm.jpg OpenGL normal, <name>_arm.jpg (R AO=1, G roughness, B metal=0).\n\n')
    f.write('\n'.join(src) + '\n')
print('\n'.join(src))
