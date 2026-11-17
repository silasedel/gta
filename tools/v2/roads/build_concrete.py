#!/usr/bin/env python3
# Ground pass: poured concrete for parking lots / aprons from the user's Models/Textures/Concrete 3 (Gray Poured Concrete PBR):
#   public/assets/textures/roads/concrete_{col,nrm,arm}.jpg (2048, OpenGL normal: DX green flipped, arm = AO / roughness / 0)
#   python3 tools/v2/roads/build_concrete.py
import os
from PIL import Image, ImageOps
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
S = os.path.join(ROOT, 'Models', 'Textures', 'Concrete 3 - Gray Poured Concrete PBR')
OUT = os.path.join(ROOT, 'public', 'assets', 'textures', 'roads')
N = 2048
c = Image.open(os.path.join(S, 'Concrete Color.jpg')).convert('RGB').resize((N, N), Image.LANCZOS); c.save(os.path.join(OUT, 'concrete_col.jpg'), quality=90)
n = Image.open(os.path.join(S, 'Concrete Normal DX.jpg')).convert('RGB').resize((N, N), Image.LANCZOS); r, g, b = n.split(); Image.merge('RGB', (r, ImageOps.invert(g), b)).save(os.path.join(OUT, 'concrete_nrm.jpg'), quality=92)
ao = Image.open(os.path.join(S, 'Concrete AO.jpg')).convert('L').resize((N, N), Image.LANCZOS); ro = Image.open(os.path.join(S, 'Concrete Roughness.jpg')).convert('L').resize((N, N), Image.LANCZOS)
Image.merge('RGB', (ao, ro, Image.new('L', (N, N), 0))).save(os.path.join(OUT, 'concrete_arm.jpg'), quality=92)
with open(os.path.join(OUT, 'SOURCES.txt'), 'a') as f: f.write('concrete: Models/Textures/Concrete 3 - Gray Poured Concrete PBR (Color, Normal DX -> GL, AO, Roughness)  (parking lots, aprons; ground pass)\n')
print('ok')
