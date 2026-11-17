# Joint check sheet: front and side views of a rigged person's rest mesh with the joints on top.
#   blender -b --python-exit-code 1 -P tools/v2/npcs/plot_joints.py -- <person.blend> <out.png>
import bpy, sys
import numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0])
o = bpy.data.objects['LOD0_body']; rig = bpy.data.objects['Armature']
P = np.array([list(o.matrix_world @ v.co) for v in o.data.vertices])
J = {b.name.replace('mixamorig:', ''): rig.matrix_world @ b.head_local for b in rig.data.bones}
H = P[:, 2].max(); S = 900 / H
W, Hh = 1800, 1000
img = np.full((Hh, W, 3), 255, np.uint8)
def draw(cx, a, b, col, r=0):
    xs = (cx + a * S).astype(int); ys = (Hh - 40 - b * S).astype(int)
    ok = (xs >= r) & (xs < W - r) & (ys >= r) & (ys < Hh - r)
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1): img[ys[ok] + dy, xs[ok] + dx] = col
draw(600, P[:, 0], P[:, 2], (170, 170, 170))
draw(1450, P[:, 1], P[:, 2], (170, 170, 170))
jp = np.array([list(v) for v in J.values()])
draw(600, jp[:, 0], jp[:, 2], (220, 0, 0), 3)
draw(1450, jp[:, 1], jp[:, 2], (220, 0, 0), 3)
im = bpy.data.images.new('chk', W, Hh)
px = np.concatenate([img[::-1].astype(np.float32) / 255, np.ones((Hh, W, 1), np.float32)], axis=2)
im.pixels.foreach_set(px.ravel()); im.filepath_raw = args[1]; im.file_format = 'PNG'; im.save()
