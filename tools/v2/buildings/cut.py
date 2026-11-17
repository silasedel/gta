# Blender: cut a region out of a big scene model (e.g. Airport 1, the whole airport map) into its own GLB.
#   blender -b -Y --python cut.py -- <src.glb> <out.glb> xmin,xmax,ymin,ymax [zmin] [drop-material-regex]
# Keeps faces whose centroid lies in the box (Blender X/Y, source units) and above zmin (drops the ground / apron plates).
import bpy, sys, bmesh, re
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]; x0, x1, y0, y1 = [float(v) for v in a[2].split(',')]; zmin = float(a[3]) if len(a) > 3 else -1e9
dropm = re.compile(a[4], re.I) if len(a) > 4 and a[4] else None
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    me = o.data; me.transform(o.matrix_world); o.matrix_world.identity()
    bm = bmesh.new(); bm.from_mesh(me); kill = []
    for f in bm.faces:
        c = f.calc_center_median(); m = me.materials[f.material_index] if f.material_index < len(me.materials) else None
        if not (x0 <= c.x <= x1 and y0 <= c.y <= y1) or c.z < zmin or (dropm and m and dropm.search(m.name)): kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me); bm.free(); print('CUT faces', len(me.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO', export_apply=True, export_yup=True)
