# One-off texture fixes before conversion (overnight props pass): real-looking company text / phone numbers painted out
# and replaced with invented ones. Output: tools/v2/street-models/fixed/*.png (build_props.sh links them by absolute path).
#   python3 -P tools/v2/street-models/fix_textures.py
import os, importlib.util as iu
import numpy as np
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(H, '../../..'))
sp = iu.spec_from_file_location('variants', os.path.join(H, 'variants.py')); V = iu.module_from_spec(sp); sp.loader.exec_module(V)
os.makedirs(os.path.join(H, 'fixed'), exist_ok=True)

# Dumpster 3 (roll-off): "Waste recycling company +00982..." (front + mirrored back) -> "SUNCOAST ROLL-OFF 305-555-0142"
src = os.path.join(ROOT, 'Models/Bins/Dumpster 3 - Large Open Roll-Off Container/textures/Color 4.png')
a = np.asarray(Image.open(src).convert('RGB'), np.float32) / 255; S = a.shape[0]
h, s, v = V.hsv(a); L = V.lum(a)
for (x0, y0, x1, y1) in [(70, 12, 600, 112), (70, 198, 600, 296)]:
    m = np.zeros(L.shape, np.float32); box = (slice(y0, y1), slice(x0, x1))
    m[box] = ((s[box] < 0.22) & (L[box] > 0.32)).astype(np.float32)
    a = V.remove_marks(a, m, 5)
def paint(a, text, uv, px, flip=False, seed=0):
    b = V.stamp(np.zeros_like(a), text, uv, px, (1, 1, 1), alpha=1.0, rough=0.3, seed=seed)
    msk = b[..., 0:1]
    if flip: msk = msk[:, ::-1]; # mirrored print on the far side of the UV island
    return a * (1 - msk * 0.85) + np.array([0.72, 0.72, 0.7], np.float32) * msk * 0.85
a = paint(a, 'SUNCOAST ROLL-OFF', (330 / S, 45 / S), 0.052, seed=3)
a = paint(a, '305-555-0142', (330 / S, 88 / S), 0.04, seed=4)
a = paint(a, 'SUNCOAST ROLL-OFF', (1 - 330 / S, 232 / S), 0.052, flip=True, seed=5)
a = paint(a, '305-555-0142', (1 - 330 / S, 275 / S), 0.04, flip=True, seed=6)
V.img(a).save(os.path.join(H, 'fixed', 'rolloff_color4.png')); print('FIXED rolloff_color4.png')
