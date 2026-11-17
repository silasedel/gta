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
cut = L / 2 - 0.40  # keep the outer 0.40 m of the -X end (post + bend + top-rail stub)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(-cut, 0, 0), plane_no=(1, 0, 0))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().x > -cut], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
for v in bm.verts: v.co.x += cut  # end piece now spans [-0.40, 0]
ys = [v.co.y for v in bm.verts]; yc = (min(ys) + max(ys)) / 2
for v in bm.verts: v.co.y -= yc
mir = bmesh.ops.duplicate(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:])
mv = [e for e in mir['geom'] if isinstance(e, bmesh.types.BMVert)]
for v in mv: v.co.x = -v.co.x  # mirror: the other half of the hoop
bmesh.ops.reverse_faces(bm, faces=[e for e in mir['geom'] if isinstance(e, bmesh.types.BMFace)])
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.004)
print('HOOP x', round(min(v.co.x for v in bm.verts),3), round(max(v.co.x for v in bm.verts),3), 'y', round(min(v.co.y for v in bm.verts),3), round(max(v.co.y for v in bm.verts),3), 'z', round(min(v.co.z for v in bm.verts),3), round(max(v.co.z for v in bm.verts),3), 'faces', len(bm.faces))
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
