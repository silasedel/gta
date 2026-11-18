# r4-library: coat color variants of the user's Doberman texture (Dog 1), for dog.js to swap per dog.
#   python3 tools/v2/animals/dog_variants.py   -> public/assets/models/animals/dog_doberman_{red,blue}.jpg (1K)
# black coat -> red-brown (red Doberman) or slate (blue Doberman); the rust tan markings and the collar stay.
import os, numpy as np
from PIL import Image
root = os.path.join(os.path.dirname(__file__), '..', '..', '..')
src = os.path.join(root, 'Models', 'Animals', 'Dog 1 - Rigged Doberman', 'textures', 'пес1.png')
out = os.path.join(root, 'public', 'assets', 'models', 'animals')
im = np.asarray(Image.open(src).convert('RGB').resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255
r, g, b = im[..., 0], im[..., 1], im[..., 2]
lum = 0.3 * r + 0.59 * g + 0.11 * b
sat = (im.max(-1) - im.min(-1)) / (im.max(-1) + 1e-4)
tan = np.clip((sat - 0.35) / 0.25, 0, 1) * np.clip((r - g) / 0.12, 0, 1)            # rust markings
metal = np.clip((lum - 0.35) / 0.15, 0, 1) * (1 - tan)                                # chain collar highlights
coat = 1 - np.maximum(tan, metal)
for name, base, gain in (('red', (0.42, 0.2, 0.11), 3.4), ('blue', (0.26, 0.28, 0.31), 3.0)):
    c = np.clip(lum[..., None] * gain, 0, 1.4) * np.array(base)
    o = im * (1 - coat[..., None]) + c * coat[..., None]
    if name == 'red': o = o * (1 - tan[..., None] * 0.15) + tan[..., None] * im * 1.12 * 0.15
    Image.fromarray((np.clip(o, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, f'dog_doberman_{name}.jpg'), quality=88)
    print('VARIANT', name)
