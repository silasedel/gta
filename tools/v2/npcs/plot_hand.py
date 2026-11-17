# Top view (x-y) of the left hand of a rigged person: mesh points colored by strongest finger bone + finger joints.
#   blender -b --python-exit-code 1 -P tools/v2/npcs/plot_hand.py -- <person.blend> <out.png>
import bpy, sys
import numpy as np
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
o = bpy.data.objects['LOD0_body']; rig = bpy.data.objects['Armature']
J = {b.name.replace('mixamorig:', ''): rig.matrix_world @ b.head_local for b in rig.data.bones if b.name.startswith('mixamorig:Left') and ('Hand' in b.name)}
names = {g.index: g.name for g in o.vertex_groups}
x0 = J['LeftHand'].x - 0.03
W, Hh, S = 1000, 700, 3000
img = np.full((Hh, W, 3), 255, np.uint8)
cols = {'Index': (220, 40, 40), 'Middle': (40, 160, 40), 'Ring': (40, 40, 220), 'Pinky': (200, 140, 0), 'Thumb': (160, 0, 160)}
cy = J['LeftHand'].y
for v in o.data.vertices:
    p = o.matrix_world @ v.co
    if p.x < x0: continue
    g = max(v.groups, key=lambda e: e.weight) if v.groups else None
    n = names[g.group] if g else ''
    c = (170, 170, 170)
    for k, cc in cols.items():
        if k in n: c = cc
    px, py = int((p.x - x0) * S) + 20, int((p.y - cy) * S) + Hh // 2
    if 1 <= px < W - 1 and 1 <= py < Hh - 1: img[py - 1:py + 2, px - 1:px + 2] = c
for n, p in J.items():
    px, py = int((p.x - x0) * S) + 20, int((p.y - cy) * S) + Hh // 2
    if 3 <= px < W - 3 and 3 <= py < Hh - 3: img[py - 3:py + 4, px - 3:px + 4] = (0, 0, 0)
im = bpy.data.images.new('h', W, Hh)
px = np.concatenate([img[::-1].astype(np.float32) / 255, np.ones((Hh, W, 1), np.float32)], axis=2)
im.pixels.foreach_set(px.ravel()); im.filepath_raw = a[1]; im.file_format = 'PNG'; im.save()
