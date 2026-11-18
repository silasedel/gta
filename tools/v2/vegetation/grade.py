#!/usr/bin/env python3
# One scene, one palette (round 2, item 12): from texstats.json (python3 -P tools/v2/vegetation/texstats.py first), compute a
# per model / material linear-RGB gain that moves each texture's mean color into the shared ranges below, so every palm and
# tree answers the sun the same way. Texel detail stays (a gain, not a recolor); per-instance jitter is added in the shader.
# -> src/world/vegetation/grade.json { key: { material: [gr, gg, gb, sat] } }   usage: python3 -P tools/v2/vegetation/grade.py
import json, colorsys
S = json.load(open('tools/v2/vegetation/texstats.json'))
# ranges (sRGB HSV of the alpha-weighted mean): hue deg, saturation, value
LEAF = dict(h=(76, 90), s=(0.40, 0.50), v=(0.34, 0.39))
FROND = dict(h=(70, 84), s=(0.40, 0.48), v=(0.34, 0.39))      # palm fronds: a touch yellower than broadleaf, same value / saturation
DRYFROND = dict(h=(68, 74), s=(0.38, 0.44), v=(0.33, 0.37))   # weathered palms: drier olive, inside the same family
TRUNK = dict(h=(26, 38), s=(0.10, 0.18), v=(0.30, 0.36))  # r2-art: gray-brown, sat <= 0.35 on screen
PALMTRUNK = dict(h=(28, 36), s=(0.10, 0.18), v=(0.36, 0.41))  # gray-tan, none clean light gray, none dark brown
BLOOM = dict(h=None, s=(0.72, 0.80), v=(0.52, 0.60))
PALMS = {'fanpalm_rob1', 'fanpalm_rob2', 'fanpalm_cal1', 'fanpalm_cal2', 'fanpalm_med1', 'fanpalm_med2', 'royal_palm', 'coconut_palm', 'coconut_b', 'coconut_c', 'coconut_d', 'date_palm', 'tropical_palm', 'palm_yellow', 'weathered_a', 'weathered_b', 'sabal_palm', 'fan_palm', 'bent_a', 'bent_b', 'bent_c', 'bent_d', 'bent_e'}
SKIP = {'agave', 'red_grass', 'geranium', 'potted_ficus', 'moss_clump', 'flower_bush_a', 'flower_bush_b', 'croton_a', 'croton_b'}
# materials that are not what their family says (measured): stalks / crownshaft / petioles / hanging roots / flower atlases
OVR = {
  ('royal_palm', 'bark_1'): 'skip',            # crownshaft (green by nature)
  ('fan_palm', 'bark_3'): 'skip', ('fan_palm', 'bark_4'): 'skip', ('fan_palm', 'bark_5'): 'skip', ('fan_palm', 'leaf_2'): 'skip', ('fan_palm', 'leaf_6'): 'skip',  # petioles, dry skirt
  ('banyan', 'leaf_0'): 'skip', ('banyan', 'leaf_1'): 'skip', ('banyan', 'bark_3'): 'skip',  # hanging roots / caps
  ('banyan_b', 'bark_1'): 'skip', ('rubber_fig', 'bark_2'): 'skip',
  ('oleander', 'leaf_1'): dict(h=None, s=None, v=(0.62, 0.70)),  # white flowers: no longer blown out
  ('bent_a', 'leaf_0'): 'bent', ('bent_b', 'leaf_0'): 'bent', ('bent_c', 'leaf_0'): 'bent', ('bent_d', 'leaf_0'): 'bent', ('bent_e', 'leaf_0'): 'bent',
  ('weathered_a', 'leaf_1'): DRYFROND, ('weathered_b', 'leaf_1'): DRYFROND,
  ('pine_a', 'leaf_0'): dict(h=(90, 98), s=(0.30, 0.38), v=(0.30, 0.35)), ('pine_b', 'leaf_0'): dict(h=(90, 98), s=(0.30, 0.38), v=(0.30, 0.35)), ('pine_c', 'leaf_0'): dict(h=(90, 98), s=(0.30, 0.38), v=(0.30, 0.35)),
  ('cypress_a', 'leaf_0'): dict(h=(78, 86), s=(0.34, 0.42), v=(0.36, 0.40)), ('cypress_b', 'leaf_0'): dict(h=(78, 86), s=(0.34, 0.42), v=(0.36, 0.40)),
  ('mangrove', 'bark_0'): TRUNK,
  ('reed_a', 'bark_0'): 'skip', ('reed_b', 'bark_0'): 'skip', ('reed_a', 'leaf_1'): dict(h=(62, 70), s=(0.36, 0.42), v=(0.36, 0.40)), ('reed_b', 'leaf_1'): dict(h=(62, 70), s=(0.36, 0.42), v=(0.36, 0.40)),
  ('hibiscus_hd', 'leaf_0'): 'skip', ('hibiscus_hd', 'leaf_4'): BLOOM, ('hibiscus_hd', 'leaf_5'): BLOOM, ('hibiscus_hd', 'bark_6'): 'skip',
  ('poinciana_hd1', 'leaf_2'): BLOOM, ('poinciana_hd1', 'leaf_3'): BLOOM, ('poinciana_hd1', 'leaf_4'): 'skip', ('poinciana_hd1', 'leaf_5'): 'skip', ('poinciana_hd1', 'leaf_6'): 'skip',  # slots after the stalks were dropped (flowers 2-3, buds 4-6, leaf 7); the old map graded a red flower toward green = neon specks
  ('poinciana_hd2', 'leaf_2'): BLOOM, ('poinciana_hd2', 'leaf_3'): BLOOM, ('poinciana_hd2', 'leaf_4'): 'skip', ('poinciana_hd2', 'leaf_5'): 'skip', ('poinciana_hd2', 'leaf_6'): 'skip',  # slots after the stalks were dropped (flowers 2-3, buds 4-6, leaf 7); the old map graded a red flower toward green = neon specks
  ('poinciana_hd3', 'leaf_2'): BLOOM, ('poinciana_hd3', 'leaf_3'): BLOOM, ('poinciana_hd3', 'leaf_4'): 'skip', ('poinciana_hd3', 'leaf_5'): 'skip', ('poinciana_hd3', 'leaf_6'): 'skip',  # slots after the stalks were dropped (flowers 2-3, buds 4-6, leaf 7); the old map graded a red flower toward green = neon specks
  ('grass_tuft_a', 'leaf_0'): dict(h=(74, 78), s=(0.50, 0.55), v=(0.37, 0.40)),  # r2-ground lush grass target sRGB (84, 98, 46)
  ('grass_tuft_b', 'leaf_0'): dict(h=(45, 49), s=(0.33, 0.37), v=(0.49, 0.53)),  # r2-ground dry straw target (130, 120, 84)
}
cl = lambda x, r: x if r is None else min(max(x, r[0]), r[1])
lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
out, log = {}, []
for k, mm in S.items():
    if k in SKIP: continue
    for m, st in mm.items():
        o = OVR.get((k, m))
        if o == 'skip': continue
        h, s, v = st['hsv']
        if k.startswith('fanpalm') and ((m.startswith('bark') and h > 50) or (m.startswith('leaf') and h < 45)): continue  # green petioles / the dead frond skirt keep their own color
        if o == 'bent': R = DRYFROND  # one atlas for trunk + fronds: a mild pull only (applied at half strength below)
        elif isinstance(o, dict): R = o
        elif 'bloom' in m: R = BLOOM
        elif m.startswith('bark'): R = PALMTRUNK if k in PALMS else TRUNK
        else: R = FROND if k in PALMS else LEAF
        h2 = h if R.get('h') is None else cl(h, R['h']); s2 = cl(s, R.get('s')); v2 = cl(v, R.get('v'))
        if o == 'bent': h2, s2, v2 = h + (h2 - h) * 0.5, s + (s2 - s) * 0.5, v + (v2 - v) * 0.5
        t = colorsys.hsv_to_rgb(h2 / 360, s2, v2); src = st['rgb']
        g = [min(2.5, max(0.15, lin(t[i]) / max(1e-4, lin(src[i])))) for i in range(3)]
        if max(abs(x - 1) for x in g) < 0.015: continue
        out.setdefault(k, {})[m] = [round(x, 3) for x in g] + [1]
        log.append(f"{k:14s} {m:10s} hsv {h:5.1f} {s:.2f} {v:.2f} -> {h2:5.1f} {s2:.2f} {v2:.2f}  gain {[round(x, 2) for x in g]}")
json.dump(out, open('src/world/vegetation/grade.json', 'w'), indent=0, sort_keys=True)
print('\n'.join(log)); print(len(log), 'materials graded')
