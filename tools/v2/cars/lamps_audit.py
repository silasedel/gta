# Lamp channel audit of converted cars (no browser): per car, faces per lamp channel in body0's S_lamp slot.
# blender -b --factory-startup -P lamps_audit.py -- <glb> ...
import bpy, sys, os
from collections import Counter
NAMES = {1: 'head', 2: 'drl', 4: 'fog', 5: 'tail', 6: 'tailLed', 7: 'reverse', 8: 'blinkL', 9: 'blinkR', 10: 'red', 11: 'blue', 12: 'sign', 13: 'amber', 14: 'plate'}
for g in sys.argv[sys.argv.index('--') + 1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=g)
    o = next((o for o in bpy.context.scene.objects if o.name.startswith('body0')), None)
    if not o or not o.data.color_attributes: print('LAMPS', os.path.basename(g), 'no body/colors'); continue
    me = o.data; ca = me.color_attributes[0]; li = next((i for i, m in enumerate(me.materials) if m and m.name.startswith('S_lamp')), None)
    c = Counter()
    for p in me.polygons:
        if p.material_index != li: continue
        a = ca.data[p.loop_start].color[3] if ca.domain == 'CORNER' else ca.data[p.vertices[0]].color[3]
        c[NAMES.get(round(a * 16), round(a * 16))] += 1
    print('LAMPS', os.path.basename(g)[:-4], dict(c))
