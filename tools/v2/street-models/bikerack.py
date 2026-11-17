# Kitbash a sidewalk bike rack from the user's Street Props Pack 2 "rail_short" pipe railing (overnight props pass):
# its two rounded ends (post + bend + a stub of top rail) are cut off and butted together into one inverted-U hoop
# (0.78 m wide, 0.95 m tall, ground flanges kept), and 4 hoops 0.8 m apart make the rack (front toward +Z, long along X).
#   blender -b --factory-startup -Y -P bikerack.py -- <Street Props Pack 2.blend> <out.glb>
import bpy, bmesh, sys, mathutils, math
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=argv[0])
src = bpy.data.objects['rail_short']
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg); me.transform(src.matrix_world)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
vs = [v.co for v in me.vertices]; mn = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
c = (mn + mx) / 2; me.transform(mathutils.Matrix.Translation((-c.x, -c.y, -mn.z)))
L = mx.x - mn.x  # long axis X (3.6 m)
bm = bmesh.new(); bm.from_mesh(me)
# a "staple" hoop (the common US sidewalk rack): 0.9 m of the railing's straight top tube as the bar, two more copies of it
# stood up as legs, and the end post's ground flange under each leg
top = max(v.co.z for v in bm.verts)
def piece(x0, x1, z0, z1):
    g = bm.copy(); 
    for pl, nrm in (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0))): bmesh.ops.bisect_plane(g, geom=g.verts[:] + g.edges[:] + g.faces[:], plane_co=pl, plane_no=nrm)
    bmesh.ops.delete(g, geom=[f for f in g.faces if not (x0 <= f.calc_center_median().x <= x1 and z0 <= f.calc_center_median().z <= z1)], context='FACES')
    bmesh.ops.delete(g, geom=[v for v in g.verts if not v.link_faces], context='VERTS'); return g
bar = piece(-0.5, 0.5, top - 0.12, top + 1)  # a straight stretch of the top tube
import numpy as np
V = np.array([v.co[:] for v in bar.verts]); c0 = V.mean(0); w, vecs = np.linalg.eigh(np.cov((V - c0).T)); ax = vecs[:, np.argmax(w)]
if ax[0] < 0: ax = -ax
R = mathutils.Vector(ax.tolist()).rotation_difference(mathutils.Vector((1, 0, 0))).to_matrix().to_4x4()
bmesh.ops.transform(bar, matrix=R @ mathutils.Matrix.Translation((-c0[0], -c0[1], -c0[2])), verts=bar.verts[:])
L0 = max(v.co.x for v in bar.verts) - min(v.co.x for v in bar.verts)
bmesh.ops.transform(bar, matrix=mathutils.Matrix.Diagonal((0.9 / L0, 1, 1, 1)), verts=bar.verts[:])  # exactly 0.9 m along X, centered
H = 0.92  # bar center height
out = bmesh.new()
def add(g, M):
    tmp = bpy.data.meshes.new('t'); g2 = g.copy(); bmesh.ops.transform(g2, matrix=M, verts=g2.verts[:]); g2.to_mesh(tmp); g2.free(); out.from_mesh(tmp); bpy.data.meshes.remove(tmp)
add(bar, mathutils.Matrix.Translation((0, 0, H)))
for sx in (-1, 1):  # legs: the bar turned upright, its 0.9 m stretched to the leg length, standing at x = +-0.45
    L2 = H + 0.06; M = mathutils.Matrix.Translation((sx * 0.45, 0, L2 / 2 - 0.03)) @ mathutils.Matrix.Rotation(math.radians(90), 4, 'Y') @ mathutils.Matrix.Diagonal((L2 / 0.9, 1, 1, 1))
    add(bar, M)
# ground flanges from the railing's end post foot
xs = [v.co.x for v in bm.verts]; xe = min(xs)
foot = piece(xe - 0.05, xe + 0.25, -0.01, 0.08)
fx = [v.co.x for v in foot.verts]; fyy = [v.co.y for v in foot.verts]
if fx:
    fc = ((min(fx) + max(fx)) / 2, (min(fyy) + max(fyy)) / 2)
    for sx in (-1, 1): add(foot, mathutils.Matrix.Translation((sx * 0.45 - fc[0], -fc[1], 0)))
bm.free(); bm = out
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.002)
print('HOOP x', round(min(v.co.x for v in bm.verts),3), round(max(v.co.x for v in bm.verts),3), 'z', round(min(v.co.z for v in bm.verts),3), round(max(v.co.z for v in bm.verts),3), 'faces', len(bm.faces))
bm.to_mesh(me); bm.free()
hoop = bpy.data.objects.new('hoop', me); bpy.context.scene.collection.objects.link(hoop)
parts = [hoop]
for k in range(1, 4):
    o = hoop.copy(); o.data = me; o.location.y = k * 0.8; bpy.context.scene.collection.objects.link(o); parts.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = hoop
for o in parts[1:]: o.data = o.data.copy()
bpy.ops.object.make_single_user(object=True, obdata=True); bpy.ops.object.transform_apply(location=True); bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; m2 = ob.data
# rack long along X: the hoops (spanning X) were stacked along Y -> rotate 90 deg so they stack along X, hoop plane across
m2.transform(mathutils.Matrix.Rotation(math.radians(90), 4, 'Z'))
vs = [v.co for v in m2.vertices]; mn = mathutils.Vector([min(v[i] for v in vs) for i in range(3)]); mx = mathutils.Vector([max(v[i] for v in vs) for i in range(3)])
c = (mn + mx) / 2; m2.transform(mathutils.Matrix.Translation((-c.x, -c.y, -mn.z)))
for im in bpy.data.images:
    if im.size[0] > 512: im.scale(512, 512)
size = [round(mx[i] - mn[i], 3) for i in range(3)]
bpy.ops.export_scene.gltf(filepath=argv[1], export_format='GLB', use_selection=False, export_apply=True, export_image_format='JPEG', export_jpeg_quality=88)
print('CONVERTED', argv[1], 'tris', sum(len(p.vertices) - 2 for p in m2.polygons), 'size', size)
