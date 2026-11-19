# Paint real brand labels out of downloaded model textures and paint Southline's made-up brands over them (same brands as
# src/world/interiors/items/catalog.js + range.js, so a bottle in a bar and on a liquor shelf carry the same names).
#   python3 tools/v2/interiors/relabel.py <spec.json>
# spec: { "dir": textures folder, "files": { file: [ { "rect": [x0, y0, x1, y1] (0..1), "brand": key, "kind": "label"|"neck"|"band"|"full"|"bag",
#          "cols": n (repeat across n columns of a tiled texture) } ... ] } }
# A label keeps the palette of what it covers (median color of the area), so the model still reads the same from a distance.
import sys, json, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageStat

BRANDS = {  # key: (name, line2, ink, paper, accent, font)
  'capitan': ('Capitán Rojo', 'GOLD RUM', '#e8c23a', '#7a0f1a', '#16181c', 'serif'), 'heron': ('SILVER HERON', 'VODKA', '#1b2a6b', '#e9eef2', '#9aa0a6', 'deco'),
  'mangrove': ('Old Mangrove', 'BOURBON WHISKEY', '#e8c23a', '#2a1a0c', '#f1e9d6', 'serif'), 'mangrove_rye': ('Old Mangrove', 'STRAIGHT RYE', '#2a1a0c', '#e8c23a', '#7a3a10', 'serif'),
  'agave': ('Agave Luna', 'TEQUILA BLANCO', '#1f4d3a', '#f1e9d6', '#c9a24a', 'script'), 'kingfish': ('KINGFISH', 'DRY GIN', '#f2b01e', '#0d2a4a', '#ffffff', 'deco'),
  'bayou': ('Bayou Gold', 'SINGLE BARREL', '#3a2412', '#d9a23a', '#ffffff', 'serif'), 'marisol': ('Marisol', 'SPARKLING', '#7a0f2a', '#f6efe0', '#c9a24a', 'script'),
  'brisa': ('Brisa', 'BRUT RESERVE', '#1fa3a3', '#ffffff', '#f2b01e', 'serif'), 'lobo': ('LOBO', 'LAGER', '#ffffff', '#1f5a2a', '#c9a24a', 'block'),
  'lobo_stout': ('LOBO', 'DARK STOUT', '#e8d6a8', '#16181c', '#c9a24a', 'block'), 'cayo': ('Cayo Light', 'LIGHT BEER', '#ffffff', '#c8102e', '#1554c0', 'script'),
  'zumbo': ('Zumbo', 'COLA', '#ffffff', '#c8102e', '#ffd21f', 'script'), 'rally': ('RALLY', 'GLACIER', '#ffffff', '#1554c0', '#ff8a1f', 'block'),
  'crunchero': ('Crunchero', 'CLASSIC', '#c8102e', '#ffd21f', '#ffffff', 'block'), 'quesitos': ('Quesitos', 'PUFFS', '#ffffff', '#ff7a1a', '#ffd21f', 'round'),
  'donpepe': ('Don Pepe', 'MARIQUITAS', '#1f7a3d', '#f4d35e', '#c8102e', 'script'), 'crispo': ('CRISPO', 'CHEESE BITES', '#ff5c1a', '#ffe14d', '#16181c', 'block'),
}
FONTS = {'serif': ['/System/Library/Fonts/Supplemental/Georgia Bold.ttf', '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf'],
  'deco': ['/System/Library/Fonts/Supplemental/Futura.ttc', '/System/Library/Fonts/Avenir Next.ttc'], 'script': ['/System/Library/Fonts/Supplemental/Brush Script.ttf', '/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf'],
  'block': ['/System/Library/Fonts/Supplemental/Arial Black.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'], 'round': ['/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
  'sans': ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc']}
def font(kind, px):
  for p in FONTS.get(kind, []) + FONTS['sans']:
    try: return ImageFont.truetype(p, max(6, int(px)))
    except Exception: pass
  return ImageFont.load_default()
def fit(d, text, kind, w, h):
  px = h
  while px > 5:
    f = font(kind, px); b = d.textbbox((0, 0), text, font=f)
    if b[2] - b[0] <= w and b[3] - b[1] <= h: return f, b
    px *= 0.9
  f = font(kind, 6); return f, d.textbbox((0, 0), text, font=f)
def center_text(d, text, kind, box, fill):
  x0, y0, x1, y1 = box; f, b = fit(d, text, kind, x1 - x0, y1 - y0); d.text(((x0 + x1) / 2 - (b[2] + b[0]) / 2, (y0 + y1) / 2 - (b[3] + b[1]) / 2), text, font=f, fill=fill)
def mix(a, b, t): return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def paint(im, rect, brand, kind):
  W, H = im.size; x0, y0, x1, y1 = int(rect[0] * W), int(rect[1] * H), int(rect[2] * W), int(rect[3] * H)
  if x1 - x0 < 3 or y1 - y0 < 3: return
  name, sub, ink, paper, acc, fk = BRANDS[brand]; ink, paper, acc = hexrgb(ink), hexrgb(paper), hexrgb(acc)
  under = ImageStat.Stat(im.crop((x0, y0, x1, y1)).convert('RGB')).median; paper = mix(paper, tuple(under), 0.25)  # keep a bit of the original palette
  layer = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer); w, h = x1 - x0, y1 - y0
  if kind == 'neck': d.rectangle([x0, y0, x1, y1], fill=paper + (255,)); d.rectangle([x0, y0 + h * 0.15, x1, y0 + h * 0.25], fill=acc + (255,)); center_text(d, name.split()[0].upper(), fk, (x0 + w * 0.08, y0 + h * 0.3, x1 - w * 0.08, y1 - h * 0.1), ink)
  elif kind == 'full':
    d.rectangle([0, 0, W, H], fill=paper + (255,)); d.rectangle([0, H * 0.78, W, H * 0.84], fill=acc + (255,)); center_text(d, name, fk, (W * 0.08, H * 0.25, W * 0.92, H * 0.62), ink); center_text(d, sub, 'sans', (W * 0.2, H * 0.64, W * 0.8, H * 0.74), ink)
  elif kind == 'bag':  # snack bag front: color field, burst, big wordmark, flavor band
    r = min(w, h) * 0.08; d.rounded_rectangle([x0, y0, x1, y1], r, fill=paper + (255,)); d.ellipse([x0 + w * 0.1, y0 + h * 0.08, x1 - w * 0.1, y0 + h * 0.5], fill=ink + (255,))
    center_text(d, name, fk, (x0 + w * 0.14, y0 + h * 0.14, x1 - w * 0.14, y0 + h * 0.44), paper); d.rectangle([x0, y0 + h * 0.62, x1, y0 + h * 0.76], fill=acc + (255,)); center_text(d, sub, 'block', (x0 + w * 0.1, y0 + h * 0.63, x1 - w * 0.1, y0 + h * 0.75), ink)
    for k in range(5): cx, cy = x0 + w * (0.25 + 0.12 * k), y0 + h * (0.84 + 0.03 * (k % 2)); d.ellipse([cx - w * 0.06, cy - h * 0.04, cx + w * 0.06, cy + h * 0.04], fill=mix(paper, (210, 160, 60), 0.6) + (255,))
  elif w < h * 0.6:  # narrow label on a tiled multi-bottle texture: panel, emblem and the brand initials
    d.rectangle([x0, y0, x1, y1], fill=paper + (255,)); d.rectangle([x0, y0 + h * 0.1, x1, y0 + h * 0.16], fill=acc + (255,)); ini = ''.join(p[0] for p in name.split())[:2].upper()
    center_text(d, ini, fk, (x0 + w * 0.12, y0 + h * 0.3, x1 - w * 0.12, y0 + h * 0.55), ink); d.rectangle([x0 + w * 0.2, y0 + h * 0.65, x1 - w * 0.2, y0 + h * 0.7], fill=ink + (255,))
  else:  # label: bordered panel, emblem, wordmark, second line, small print
    r = min(w, h) * 0.1; d.rounded_rectangle([x0, y0, x1, y1], r, fill=paper + (255,)); d.rounded_rectangle([x0 + w * 0.05, y0 + h * 0.05, x1 - w * 0.05, y1 - h * 0.05], r * 0.7, outline=acc + (255,), width=max(1, int(min(w, h) * 0.025)))
    ex, ey, er = (x0 + x1) / 2, y0 + h * 0.2, min(w, h) * 0.09; d.ellipse([ex - er, ey - er, ex + er, ey + er], outline=ink + (255,), width=max(1, int(er * 0.25)))
    center_text(d, name, fk, (x0 + w * 0.1, y0 + h * 0.32, x1 - w * 0.1, y0 + h * 0.62), ink); center_text(d, sub, 'sans', (x0 + w * 0.18, y0 + h * 0.65, x1 - w * 0.18, y0 + h * 0.76), ink)
    for k in range(3): d.line([x0 + w * 0.25, y0 + h * (0.82 + k * 0.035), x1 - w * 0.25, y0 + h * (0.82 + k * 0.035)], fill=mix(ink, paper, 0.5) + (255,), width=1)
  layer = layer.filter(ImageFilter.GaussianBlur(max(0.3, min(W, H) / 900)))  # same softness as the photo around it
  im.alpha_composite(layer) if im.mode == 'RGBA' else im.paste(layer, (0, 0), layer)

def run(spec):
  for f, jobs in spec['files'].items():
    p = os.path.join(spec['dir'], f); im = Image.open(p); mode = im.mode; im = im.convert('RGBA' if mode in ('RGBA', 'LA', 'P') else 'RGB')
    for j in jobs:
      n = j.get('cols', 1)
      for c in range(n):
        x0, y0, x1, y1 = j['rect']; cw = 1 / n; paint(im, [c * cw + x0 * cw, y0, c * cw + x1 * cw, y1], j['brand'], j.get('kind', 'label'))
    if p.lower().endswith(('.jpg', '.jpeg')): im.convert('RGB').save(p, quality=93)
    else: im.save(p)
    print('relabeled', f)

if __name__ == '__main__': run(json.load(open(sys.argv[1])))
