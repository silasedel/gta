# One-off texture fixes before conversion (overnight props pass): real-looking company text / phone numbers painted out
# and replaced with invented ones. Output: tools/v2/street-models/fixed/*.png (build_props.sh links them by absolute path).
#   python3 -P tools/v2/street-models/fix_textures.py
import os, importlib.util as iu
import numpy as np
from scipy import ndimage as _ndi
ndi_dilate = lambda m: _ndi.binary_dilation(m > 0.5, iterations=6).astype(np.float32)
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
# both print blocks read correctly on the model when stored unmirrored (checked with a two-side render; the source's
# mirrored copy showed backwards on the far side)
a = paint(a, 'SUNCOAST ROLL-OFF', (330 / S, 45 / S), 0.052, seed=3)
a = paint(a, '305-555-0142', (330 / S, 88 / S), 0.04, seed=4)
a = paint(a, 'SUNCOAST ROLL-OFF', (330 / S, 232 / S), 0.052, seed=5)
a = paint(a, '305-555-0142', (330 / S, 275 / S), 0.04, seed=6)
V.img(a).save(os.path.join(H, 'fixed', 'rolloff_color4.png')); print('FIXED rolloff_color4.png')

# Food Cart 1: the small "Crunch" wordmark printed 4x on the second umbrella's hem (a real candy-bar brand) painted out
src = os.path.join(ROOT, 'Models/Food Carts/Food Cart 1 - Red-Yellow Hot Dog Cart/textures/Hot-dog Color.png')
a = np.asarray(Image.open(src).convert('RGB'), np.float32) / 255; S = a.shape[0]
for (u0, v0, u1, v1) in [(0.385, 0.69, 0.485, 0.72), (0.395, 0.965, 0.495, 0.998), (0.285, 0.795, 0.315, 0.885), (0.56, 0.795, 0.59, 0.885)]:
    box = (slice(int(v0 * S), int(v1 * S)), slice(int(u0 * S), int(u1 * S))); P = a[box]
    med = np.median(P.reshape(-1, 3), 0); d = np.abs(P - med).sum(-1)
    m = np.zeros(a.shape[:2], np.float32); m[box] = (d > 0.25).astype(np.float32)
    a = V.remove_marks(a, m, 4)
V.img(a).save(os.path.join(H, 'fixed', 'foodcart_color.png')); print('FIXED foodcart_color.png')

# Soda Can Set 1: every can carries a real soda brand (catalog says "plain"): the label panel is repainted in the can's own
# color with an invented drink name; the nutrition / barcode panel stays (unreadable at litter size). 1024 px.
CANS = os.path.join(ROOT, 'Models/Bottles/Soda Can Set 1 - Six Plain Colored Soda Cans/textures')
for fn, name in [('Can Red Cola', 'Reef Cola'), ('Can Black Cola', 'NIGHT COLA'), ('Can Blue Cola', 'Bayline'), ('Can Dark Blue Cola', 'KEY BLUE'), ('Can Green Lemon Lime', 'Lime Splash'), ('Can Maroon Cola', 'Gator Cherry')]:
    im = Image.open(os.path.join(CANS, fn + ' Color.png')).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255; S = a.shape[0]
    y0, y1, x1 = int(0.575 * S), int(0.985 * S), int(0.585 * S)
    body = np.median(a[int(0.6 * S):int(0.95 * S), int(0.6 * S):int(0.65 * S)].reshape(-1, 3), 0) if False else np.median(a[y0:y1, int(0.02 * S):int(0.05 * S)].reshape(-1, 3), 0)
    a[y0:y1, 0:x1] = body + (V.noise(S, 30, 7, 2)[y0:y1, 0:x1, None] - 0.5) * 0.03
    light = V.lum(body[None, None, :])[0, 0] < 0.6
    a = V.stamp(a, name, (0.29, 0.75), 0.085 if len(name) < 9 else 0.07, (0.97, 0.97, 0.95) if light else (0.1, 0.1, 0.1), fnt=0, alpha=1.0, rough=0.0)
    a = V.stamp(a, 'SPARKLING  12 FL OZ', (0.29, 0.86), 0.03, (0.97, 0.97, 0.95) if light else (0.1, 0.1, 0.1), alpha=0.9, rough=0.0)
    V.img(a).save(os.path.join(H, 'fixed', 'can_' + name.lower().replace(' ', '_') + '.png')); print('FIXED can', name)

# Coffee Cup 1: the sleeve is a real coffee chain's (green round logo): plain kraft sleeve with an invented roaster stamp
src = os.path.join(ROOT, 'Models/Cups/Coffee Cup 1 - Red-Band Paper Cup With Lid/textures/Cup Sleeve Color.png')
a = np.asarray(Image.open(src).convert('RGB').resize((512, 512), Image.LANCZOS), np.float32) / 255; S = a.shape[0]
h, s, v = V.hsv(a); kraft = np.median(a[int(0.05 * S):int(0.4 * S), int(0.1 * S):int(0.3 * S)].reshape(-1, 3), 0)
m = ndi_dilate(((V.hue_mask(a, 70, 220, 0.08, 0.02) > 0.5) | ((s > 0.25) & (V.lum(a) < 0.5))).astype(np.float32))  # the green logo (+ its soft edge)
m = np.maximum(m, ((np.abs(a - kraft).sum(-1) > 0.25) & (np.arange(S)[:, None] > 0.5 * S) & (np.arange(S)[:, None] < 0.95 * S)).astype(np.float32))  # back-panel print
a = V.remove_marks(a, m, 6)
top = np.zeros(a.shape[:2], bool); top[:int(0.47 * S)] = True; sheet = top & (V.lum(a) < 0.82)  # the whole front panel: flat kraft, a little fiber noise
a[sheet] = (kraft[None, :] * (0.96 + 0.08 * V.noise(S, 60, 5, 3)[..., None]))[sheet]
a = V.stamp(a, 'BAYSIDE ROAST', (0.48, 0.22), 0.06, (0.3, 0.2, 0.12), alpha=0.85, rough=0.0)
V.img(a).save(os.path.join(H, 'fixed', 'cup_sleeve.png')); print('FIXED cup sleeve')
