# Texture variants for the instanced street props (overnight props pass, Nov 17).
# For each repeated prop material: N edited copies of its color texture (recolors, graffiti removed / moved / new tags,
# stickers, house numbers, grime, rust, sun fade) stacked as one vertical JPEG strip -> a texture ARRAY at runtime
# (src/world/props/variants.v2.js). Per instance the shader picks a layer (instanceColor.r) plus brightness (g) and fade (b):
# one draw call per part material stays one draw call.
#   python3 tools/v2/street-models/variants.py [set-regex] [--preview]
# Writes public/assets/models/street/var/<set>.jpg + var/variants.json (set -> {glb, mat, n, size, layers}).
import os, sys, re, json, io, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage as ndi
import importlib.util as _iu
_sp = _iu.spec_from_file_location('glbtex', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glbtex.py')); glbtex = _iu.module_from_spec(_sp); _sp.loader.exec_module(glbtex)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
ST = os.path.join(ROOT, 'public/assets/models/street')
OUT = os.path.join(ST, 'var')
MOD = os.path.join(ROOT, 'Models')

def glb_color(glb, mat):
    js, b = glbtex.read(os.path.join(ST, glb))
    for i, uses in glbtex.slots(js).items():
        for m, s in uses:
            if m == mat and s == 'color':
                data, _ = glbtex.image_bytes(js, b, i); return Image.open(io.BytesIO(data)).convert('RGB')
    raise KeyError(f'{glb}:{mat} has no color texture')

def arr(im, size): return np.asarray(im.convert('RGB').resize((size, size), Image.LANCZOS), dtype=np.float32) / 255.0
def img(a): return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))

# ---------- helpers ----------
def rng(seed): return np.random.default_rng(seed)
def noise(size, scale, seed, octaves=3):
    """smooth value noise 0..1 (sum of blurred random fields)"""
    r = rng(seed); acc = np.zeros((size, size), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        s = max(2, int(size / (scale * (2 ** o))))
        f = r.random((s, s)).astype(np.float32)
        f = np.asarray(Image.fromarray((f * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC), np.float32) / 255
        acc += f * amp; tot += amp; amp *= 0.5
    acc /= tot; return (acc - acc.min()) / (acc.max() - acc.min() + 1e-6)

def hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; mx = a.max(-1); mn = a.min(-1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6.0
    s = np.where(mx > 1e-4, (mx - mn) / (mx + 1e-6), 0); return h, s, mx
def from_hsv(h, s, v):
    i = np.floor(h * 6) % 6; f = h * 6 - np.floor(h * 6); p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,), np.float32)
    for k, (R, G, B) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k; out[..., 0][m] = R[m]; out[..., 1][m] = G[m]; out[..., 2][m] = B[m]
    return out
def lum(a): return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114

def hue_mask(a, h0, h1, smin=0.15, vmin=0.08):
    h, s, v = hsv(a); hh = h * 360
    m = ((hh >= h0) & (hh <= h1)) if h0 <= h1 else ((hh >= h0) | (hh <= h1))
    return (m & (s >= smin) & (v >= vmin)).astype(np.float32)

def recolor(a, mask, rgb, keep=0.0, gain=1.0):
    """paint `rgb` onto the masked area, keeping the original light/dark detail (luminance ratio)"""
    L = lum(a); ref = np.median(L[mask > 0.5]) if (mask > 0.5).any() else 0.5
    tgt = np.array(rgb, np.float32)[None, None, :] * (L / (ref + 1e-4))[..., None] * gain
    m = ndi.gaussian_filter(mask, 0.8)[..., None]
    return a * (1 - m) + (tgt * (1 - keep) + a * keep) * m

def grime(a, amt, seed, scale=6, tint=(0.33, 0.29, 0.22), mask=None):
    n = noise(a.shape[0], scale, seed); n2 = noise(a.shape[0], scale * 4, seed + 7, 2)
    g = np.clip((n * 0.7 + n2 * 0.3 - (0.66 - amt * 0.35)) * 1.6, 0, 1) * amt * 0.7
    if mask is not None: g = g * mask
    t = np.array(tint, np.float32)[None, None, :]
    return a * (1 - g[..., None] * 0.75) + t * a.mean() * g[..., None] * 0.5

def fade(a, amt, mask=None):
    L = lum(a)[..., None]; f = a * (1 - amt) + (L * 0.85 + 0.15) * amt
    f = f * (1 - amt * 0.15) + amt * 0.12
    if mask is None: return f
    m = mask[..., None]; return a * (1 - m) + f * m

def rust(a, amt, seed, mask=None):
    n = noise(a.shape[0], 10, seed, 4); spots = np.clip((n - (0.75 - amt * 0.45)) * 5, 0, 1)
    if mask is not None: spots = spots * mask
    col = np.stack([0.42 + 0.15 * n, 0.2 + 0.06 * n, 0.08 + 0.03 * n], -1)
    return a * (1 - spots[..., None]) + col * spots[..., None]

def remove_marks(a, mask, sigma=10):
    """fill masked pixels from the surrounding surface (normalized convolution), plus a little noise so it isn't smeared"""
    m = ndi.binary_dilation(mask > 0.5, iterations=2).astype(np.float32)
    w = 1 - m; out = a.copy()
    for s in (sigma, sigma * 2.5):
        num = ndi.gaussian_filter(a * w[..., None], (s, s, 0)); den = ndi.gaussian_filter(w, s)[..., None] + 1e-5
        fill = num / den; out = np.where(m[..., None] > 0.5, fill, out) if s == sigma else np.where((m[..., None] > 0.5) & (den < 0.05), fill, out)
    grain = (rng(3).random(a.shape[:2]).astype(np.float32) - 0.5) * 0.03
    return out + (grain * m)[..., None]

FONTS = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Impact.ttf', '/System/Library/Fonts/Supplemental/Marker Felt.ttc', '/System/Library/Fonts/Helvetica.ttc']
def font(i, px):
    for f in FONTS[i:] + FONTS:
        try: return ImageFont.truetype(f, px)
        except Exception: pass
    return ImageFont.load_default()

def stamp(a, text, uv, px, color, rot=0, fnt=0, alpha=0.9, rough=0.25, seed=0):
    """paint text (house number, stencil, tag) at uv (0..1, image coords), rotated; rough = paint breakup"""
    S = a.shape[0]; lay = Image.new('L', (S, S), 0); d = ImageDraw.Draw(lay)
    F = font(fnt, int(px * S)); tw = d.textbbox((0, 0), text, font=F)
    tile = Image.new('L', (tw[2] + 8, tw[3] + 8), 0); ImageDraw.Draw(tile).text((4, 4), text, font=F, fill=255)
    tile = tile.rotate(rot, expand=True, resample=Image.BICUBIC)
    lay.paste(tile, (int(uv[0] * S - tile.width / 2), int(uv[1] * S - tile.height / 2)), tile)
    m = np.asarray(lay, np.float32) / 255
    if rough: m = m * np.clip((noise(S, 40, seed + 11, 2) - rough * 0.6) * 3, 0, 1)
    m = (m * alpha)[..., None]; return a * (1 - m) + np.array(color, np.float32)[None, None] * m

def sticker(a, uv, wh, color, seed, lines=3, rot=0):
    """a weathered paper/vinyl sticker: a rounded rectangle with a few dark 'print' lines, edges peeling"""
    S = a.shape[0]; w, h = int(wh[0] * S), int(wh[1] * S); r = rng(seed)
    t = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(t)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=max(2, w // 10), fill=tuple(int(c * 255) for c in color) + (255,))
    for k in range(lines):
        y = int(h * (0.22 + 0.6 * k / max(1, lines))); x0 = int(w * 0.12); x1 = int(w * (0.5 + 0.38 * r.random()))
        d.rectangle([x0, y, x1, y + max(1, h // 14)], fill=(30, 30, 34, 230))
    t = t.rotate(rot, expand=True, resample=Image.BICUBIC)
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0)); lay.paste(t, (int(uv[0] * S - t.width / 2), int(uv[1] * S - t.height / 2)), t)
    L = np.asarray(lay, np.float32) / 255; al = L[..., 3:4] * np.clip((noise(S, 60, seed, 2)[..., None] - 0.1) * 4, 0, 1)
    return a * (1 - al) + L[..., :3] * (0.85 + 0.15 * a) * al

def scribble(a, uv, size, color, seed, strokes=7, width=0.006, alpha=0.85):
    """a spray tag: a few connected bezier-ish strokes"""
    S = a.shape[0]; r = rng(seed); lay = Image.new('L', (S, S), 0); d = ImageDraw.Draw(lay)
    cx, cy = uv[0] * S, uv[1] * S; pts = [(cx + (r.random() - 0.5) * size * S, cy + (r.random() - 0.5) * size * S * 0.5) for _ in range(strokes * 3)]
    for k in range(strokes):
        seg = pts[k * 3:(k + 1) * 3 + 1]
        if len(seg) > 1: d.line(seg, fill=255, width=max(2, int(width * S)), joint='curve')
    lay = lay.filter(ImageFilter.GaussianBlur(0.8)); m = (np.asarray(lay, np.float32) / 255 * alpha)[..., None]
    return a * (1 - m) + np.array(color, np.float32)[None, None] * m

def move_patch(a, src, dst, flip=False):
    """cut a rectangle (uv box) and paste it at another uv position (graffiti moved); the source is cleaned"""
    S = a.shape[0]; x0, y0, x1, y1 = [int(v * S) for v in src]; P = a[y0:y1, x0:x1].copy()
    if flip: P = P[:, ::-1]
    X, Y = int(dst[0] * S), int(dst[1] * S); h, w = P.shape[:2]; X = min(max(0, X), S - w); Y = min(max(0, Y), S - h)
    out = a.copy(); out[Y:Y + h, X:X + w] = P; return out

def save_set(name, glb, mat, layers, size, preview):
    n = len(layers); strip = np.concatenate([l for _, l in layers], 0)
    os.makedirs(OUT, exist_ok=True); img(strip).save(os.path.join(OUT, name + '.jpg'), quality=88, optimize=True)
    if preview:
        cols = min(n, 6); P = Image.new('RGB', (cols * 256, math.ceil(n / cols) * 270), 'white'); d = ImageDraw.Draw(P)
        for k, (lab, l) in enumerate(layers): P.paste(img(l).resize((256, 256)), ((k % cols) * 256, (k // cols) * 270 + 14)); d.text(((k % cols) * 256 + 3, (k // cols) * 270), f'{k} {lab}', fill='black')
        P.save(preview.replace('%s', name))
    return {'glb': glb, 'mat': mat, 'n': n, 'size': size, 'layers': [l for l, _ in layers]}

# ---------- sets ----------
def set_cart(S):
    T = os.path.join(MOD, 'Bins/Trash Can 1 - Wheeled Curbside Bin Set/textures')
    base = {c: arr(Image.open(os.path.join(T, f'TrashCan({c}) Color.png')), S) for c in ('Grey', 'Black', 'Blue', 'Green')}
    body = np.zeros((S, S), np.float32); body[int(0.1 * S):int(0.97 * S), 0:int(0.37 * S)] = 1  # the big side panel island
    L = []
    L.append(('gray', base['Grey']))
    L.append(('black', grime(base['Black'], 0.25, 1)))
    L.append(('blue recycling', base['Blue']))
    L.append(('green yard waste', grime(base['Green'], 0.3, 2)))
    L.append(('gray, house number, grime', grime(stamp(base['Grey'], '1427', (0.24, 0.62), 0.07, (0.95, 0.95, 0.92), rot=90, alpha=0.9, seed=4), 0.55, 5)))
    L.append(('black, sticker, sun-faded', fade(sticker(base['Black'], (0.22, 0.55), (0.1, 0.07), (0.92, 0.9, 0.82), 6, rot=90), 0.35)))
    L.append(('blue, faded, grime, number', grime(fade(stamp(base['Blue'], '88', (0.25, 0.7), 0.09, (0.96, 0.96, 0.95), rot=90, fnt=1, seed=7), 0.3), 0.45, 8)))
    L.append(('brown', grime(recolor(base['Grey'], np.ones((S, S), np.float32), (0.3, 0.23, 0.16), gain=1.0), 0.35, 9)))
    L.append(('green, tag', scribble(grime(base['Green'], 0.4, 10), (0.2, 0.55), 0.14, (0.9, 0.86, 0.2), 11)))
    L.append(('dark gray, two stickers', sticker(sticker(grime(base['Grey'] * 0.62, 0.3, 12), (0.18, 0.45), (0.08, 0.06), (0.85, 0.25, 0.2), 13, rot=90), (0.27, 0.75), (0.07, 0.05), (0.95, 0.95, 0.9), 14, rot=90)))
    return L

def set_wheelbin(S):
    a = arr(glb_color('bin_wheel.glb', 'Bin Body'), S)
    h, s, v = hsv(a); teal = hue_mask(a, 165, 205, 0.12, 0.1)
    # graffiti / tags: red paint, and thin dark outline strokes (black-hat), below the lid band
    red = ((a[..., 0] > a[..., 1] + 0.12) & (a[..., 0] > a[..., 2] + 0.1)).astype(np.float32)
    L0 = lum(a); bh = ndi.grey_closing(L0, size=(7, 7)) - L0; dark = ((bh > 0.12) & (L0 < 0.3)).astype(np.float32)
    white = ((s < 0.15) & (v > 0.75)).astype(np.float32)
    marks = np.clip(red + dark + white, 0, 1); marks[:int(0.07 * S)] = 0
    clean = remove_marks(a, marks)
    body = hue_mask(clean, 160, 210, 0.08, 0.05)
    L = []
    L.append(('teal, original tags', a))
    L.append(('teal, cleaned', grime(clean, 0.3, 21)))
    L.append(('navy, clean', recolor(clean, body, (0.12, 0.2, 0.42), gain=1.0)))
    L.append(('forest green, tags moved', move_patch(recolor(clean, body, (0.14, 0.3, 0.16)), (0.5, 0.68, 0.75, 0.95), (0.15, 0.2), flip=True)))
    L.append(('gray, new tags', scribble(scribble(recolor(clean, body, (0.38, 0.39, 0.4)), (0.3, 0.6), 0.16, (0.85, 0.12, 0.6), 22), (0.65, 0.35), 0.12, (0.05, 0.05, 0.05), 23)))
    L.append(('brown, faded', fade(recolor(clean, body, (0.36, 0.26, 0.17)), 0.3)))
    L.append(('teal, faded, sticker', sticker(fade(clean, 0.4), (0.32, 0.45), (0.09, 0.07), (0.95, 0.92, 0.8), 24)))
    L.append(('black, grime', grime(recolor(clean, body, (0.08, 0.085, 0.09), gain=1.0), 0.4, 25)))
    return L

def set_mailpost(S):
    a = arr(glb_color('mailbox_post.glb', 'Mailbox Body'), S)
    h, s, v = hsv(a)
    keep = np.ones((S, S), np.float32); keep[int(0.74 * S):, :int(0.73 * S)] = 0; keep[int(0.28 * S):int(0.6 * S), int(0.82 * S):int(0.98 * S)] = 0  # wooden post strip, red flag
    whiteb = ((s < 0.22) & (v > 0.55)).astype(np.float32) * keep
    rusty = ndi.gaussian_filter(hue_mask(a, 8, 45, 0.25, 0.15) * keep, 1.5)
    L0 = lum(a); ref = np.median(L0[whiteb > 0.5])
    clean = a * (1 - rusty[..., None]) + (0.84 + (L0[..., None] - ref) * 0.25) * np.array([1.0, 0.99, 0.96], np.float32) * rusty[..., None]
    whiteb = np.clip(whiteb + rusty * 0.9, 0, 1) * keep
    drips = np.clip(ndi.gaussian_filter(np.clip(ndi.binary_dilation(hue_mask(a, 8, 45, 0.25, 0.15) > 0.5, iterations=5).astype(np.float32) - (hue_mask(a, 8, 45, 0.25, 0.15)), 0, 1), 2) * (noise(S, 20, 36, 3) > 0.45), 0, 1) * keep
    L = []
    L.append(('white, rust drips', a))
    L.append(('white, clean', grime(clean, 0.15, 31)))
    L.append(('black', recolor(clean, whiteb, (0.07, 0.07, 0.075))))
    L.append(('dark green', recolor(clean, whiteb, (0.12, 0.26, 0.17))))
    L.append(('barn red, faded', fade(recolor(clean, whiteb, (0.45, 0.1, 0.08)), 0.25)))
    rc = np.stack([0.45 + 0.0 * L0, 0.21 + 0 * L0, 0.08 + 0 * L0], -1) * (0.7 + 0.6 * L0[..., None])
    L.append(('cream, rust spots', rust(recolor(a, whiteb * (1 - rusty), (0.86, 0.8, 0.66)), 0.25, 33, whiteb)))
    L.append(('navy, number', stamp(recolor(clean, whiteb, (0.1, 0.14, 0.3)), '211', (0.3, 0.35), 0.08, (0.95, 0.95, 0.92), seed=34)))
    L.append(('silver, grime', grime(recolor(clean, whiteb, (0.62, 0.63, 0.64)), 0.5, 35)))
    return L

def set_hydrant_a(S):
    a = arr(glb_color('hydrant_a.glb', 'Fire Hydrant'), S)
    blue = hue_mask(a, 190, 250, 0.25, 0.1); red = hue_mask(a, 340, 15, 0.35, 0.1); yel = hue_mask(a, 35, 70, 0.3, 0.15)
    L = [('yellow, blue top, red caps', a)]
    L.append(('yellow, red top, red caps', recolor(a, blue, (0.62, 0.08, 0.06))))
    L.append(('yellow, green top', grime(recolor(a, blue, (0.12, 0.42, 0.16)), 0.3, 42)))
    L.append(('faded yellow, orange top', fade(recolor(a, blue, (0.85, 0.42, 0.08)), 0.35)))
    L.append(('red body, white top', recolor(recolor(a, yel, (0.6, 0.07, 0.05)), blue, (0.86, 0.86, 0.84))))
    L.append(('yellow, rust spots', rust(a, 0.22, 41)))
    return L

def set_hydrant_b(S):
    a = arr(glb_color('hydrant_b.glb', 'Fire Hydrant 2'), S)
    yel = hue_mask(a, 35, 75, 0.25, 0.15)
    return [('yellow', a), ('faded yellow, grime', grime(fade(a, 0.35), 0.4, 51)), ('chrome yellow', grime(recolor(a, yel, (0.85, 0.62, 0.05)), 0.3, 52)), ('red', recolor(a, yel, (0.6, 0.09, 0.06)))]

def set_binmetal(S):
    a = arr(glb_color('bin_metal.glb', 'Body'), S)
    g = hue_mask(a, 130, 200, 0.12, 0.08)
    return [('green', a), ('black', recolor(a, g, (0.07, 0.075, 0.08))), ('navy', grime(recolor(a, g, (0.1, 0.15, 0.3)), 0.3, 61)), ('brown, faded', fade(recolor(a, g, (0.3, 0.2, 0.12)), 0.25))]

def set_benchwood(S):
    a = arr(glb_color('bench_wood.glb', 'Woods'), S)
    return [('teak', a), ('gray weathered', fade(a, 0.7)), ('dark stain', a * np.array([0.62, 0.55, 0.5], np.float32)), ('sun-bleached, grime', grime(fade(a, 0.4), 0.5, 71))]

def set_upole(S):
    a = arr(glb_color('upole_gear.glb', 'Material11'), S)
    return [('timber', a), ('dark creosote', a * np.array([0.6, 0.55, 0.5], np.float32)), ('silver-gray', fade(a, 0.6)), ('brown, grime', grime(a * np.array([1.0, 0.85, 0.7], np.float32), 0.5, 81))]

def set_crate(S):
    a = arr(glb_color('crate.glb', 'Part 01'), S)
    # the source art carries a real maker name: find the light letter pixels on the dark boards and paint them out
    L0 = lum(a); th = ndi.white_tophat(L0, size=(9, 9)); letters = (th > 0.06).astype(np.float32)
    clean = remove_marks(a, letters, 6)
    return [('blue-gray', clean), ('olive', recolor(clean, np.ones((S, S), np.float32), (0.3, 0.32, 0.22))), ('stenciled', stamp(clean, 'FRAGILE', (0.5, 0.5), 0.07, (0.85, 0.82, 0.72), fnt=0, seed=91))]

SETS = {'cart': ('cart.glb', 'TrashCan(Grey)', 512, set_cart), 'wheelbin': ('bin_wheel.glb', 'Bin Body', 512, set_wheelbin),
        'mailpost': ('mailbox_post.glb', 'Mailbox Body', 512, set_mailpost), 'hydrant_a': ('hydrant_a.glb', 'Fire Hydrant', 512, set_hydrant_a),
        'hydrant_b': ('hydrant_b.glb', 'Fire Hydrant 2', 512, set_hydrant_b), 'binmetal': ('bin_metal.glb', 'Body', 512, set_binmetal),
        'benchwood': ('bench_wood.glb', 'Woods', 512, set_benchwood), 'upole': ('upole_gear.glb', 'Material11', 512, set_upole)}

if __name__ == '__main__':
    only = re.compile(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '.')
    prev = None
    if '--preview' in sys.argv: prev = sys.argv[sys.argv.index('--preview') + 1] if len(sys.argv) > sys.argv.index('--preview') + 1 else '/tmp/var_%s.png'
    mp = os.path.join(OUT, 'variants.json'); man = json.load(open(mp)) if os.path.exists(mp) else {}
    for name, (glb, mat, size, fn) in SETS.items():
        if not only.search(name): continue
        man[name] = save_set(name, glb, mat, fn(size), size, prev); print('VARIANTS', name, man[name]['n'], 'layers')
    json.dump(man, open(mp, 'w'), indent=1)
