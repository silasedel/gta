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
# a "staple" hoop (the common US sidewalk rack) as ONE bent tube: two legs and the top bar joined by real rounded bends
# (radius 0.14 m, user: "round these edges better"), swept with the railing's own tube radius and material
tube_r = 0.024
try:
    ys = [v.co.y for v in bm.verts]; tube_r = max(0.018, min(0.032, (max(ys) - min(ys)) / 2 * 0.9))
except Exception: pass
H = 0.92; W = 0.45; RB = 0.14
pts = [(-W, 0.0, -0.02), (-W, 0.0, H - RB)]
for k in range(1, 12):
    a = math.pi - (math.pi / 2) * k / 12; pts.append((-W + RB + RB * math.cos(a), 0.0, H - RB + RB * math.sin(a)))
pts += [(-W + RB, 0.0, H), (W - RB, 0.0, H)]
for k in range(1, 12):
    a = math.pi / 2 - (math.pi / 2) * k / 12; pts.append((W - RB + RB * math.cos(a), 0.0, H - RB + RB * math.sin(a)))
pts += [(W, 0.0, H - RB), (W, 0.0, -0.02)]
cu = bpy.data.curves.new('hoopc', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = tube_r; cu.bevel_resolution = 4; cu.use_fill_caps = True
sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
for i, q in enumerate(pts): sp.points[i].co = (q[0], q[1], q[2], 1)
co = bpy.data.objects.new('hoopc', cu); bpy.context.scene.collection.objects.link(co)
dg2 = bpy.context.evaluated_depsgraph_get(); tm = bpy.data.meshes.new_from_object(co.evaluated_get(dg2)); bpy.data.objects.remove(co, do_unlink=True)
for mat in me.materials: tm.materials.append(mat)
out = bmesh.new(); out.from_mesh(tm); bpy.data.meshes.remove(tm)
for f in out.faces: f.smooth = True
# small round ground flanges under each leg
for sx in (-1, 1):
    r = bmesh.ops.create_circle(out, cap_ends=True, segments=16, radius=0.06)
    bmesh.ops.translate(out, verts=r['verts'], vec=(sx * W, 0, 0.004))
    ex = bmesh.ops.extrude_face_region(out, geom=[f for f in out.faces if all(v in r['verts'] for v in f.verts)])
    bmesh.ops.translate(out, verts=[e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0, 0.008))
bm.free(); bm = out
me.clear_geometry() if hasattr(me, 'clear_geometry') else None
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
